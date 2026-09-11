import {ResultCache} from './result-cache.ts';
import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Fault, stable, type Result } from "../shared/types.ts";
import { z } from "zod";

const resultSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  images: z
    .array(
      z.object({
        label: z.string(),
        data: z.string().max(24000000),
        mimeType: z.literal("image/png"),
      }),
    )
    .max(32)
    .optional(),
});
interface Peer {
  id: string;
  socket: WebSocket;
  version: string;
  blockbench_version: string;
}
interface Pending {
  resolve: (value: Result) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  peer: Peer;
  fingerprint: string;
  promise: Promise<Result>;
}
export class Bridge {
  private http = createServer((_, res) => {
    res.writeHead(404);
    res.end();
  });
  private wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024 * 1024,
    perMessageDeflate: false,
  });
  private peers = new Map<string, Peer>();
  private pending = new Map<string, Pending>();
  private results = new ResultCache<{ fingerprint: string; result?: Result; error?: any }>(value=>stable(value).length);
  port = 0;
  constructor(
    private token: string,
    private timeoutMs = 60000,
  ) {
    if (token.length < 32)
      throw new Fault(
        "CONFIG",
        "Connection token must contain at least 32 characters",
      );
  }
  async start(port: number) {
    this.http.on("upgrade", (req, socket, head) => {
      if (!this.allowed(req)) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws));
    });
    await new Promise<void>((resolve, reject) => {
      this.http.once("error", reject);
      this.http.listen(port, "127.0.0.1", () => {
        this.http.removeListener("error", reject);
        resolve();
      });
    });
    this.port = (this.http.address() as any).port;
    return this.port;
  }
  private allowed(req: IncomingMessage) {
    const host = req.headers.host;
    const origin = req.headers.origin;
    return (
      (host === `127.0.0.1:${this.port}` ||
        host === `localhost:${this.port}`) &&
      req.url === "/bridge" &&
      (!origin || origin === "null" || origin === "file://")
    );
  }
  private accept(ws: WebSocket) {
    if (this.wss.clients.size > 8) {
      ws.close(1013, "Connection limit");
      return;
    }
    let peer: Peer | undefined;
    const timer = setTimeout(
      () => ws.close(1008, "Authentication timeout"),
      3000,
    );
    ws.on("message", (raw) => {
      let m: any;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        ws.close(1008, "Invalid JSON");
        return;
      }
      if (!peer) {
        const input = z
          .object({
            type: z.literal("hello"),
            token: z.string().max(256),
            instance_id: z.string().uuid(),
            version: z.string().max(50),
            blockbench_version: z.string().max(50),
          })
          .safeParse(m);
        if (!input.success || !this.equal(input.data.token)) {
          ws.close(1008, "Unauthorized");
          return;
        }
        clearTimeout(timer);
        const data = input.data;
        this.peers.get(data.instance_id)?.socket.close(1000, "Reconnected");
        peer = {
          id: data.instance_id,
          socket: ws,
          version: data.version,
          blockbench_version: data.blockbench_version,
        };
        this.peers.set(peer.id, peer);
        ws.send(JSON.stringify({ type: "ready", protocol: 1 }));
        return;
      }
      if (m.type !== "response" || typeof m.id !== "string") return;
      const key = `${peer.id}:${m.id}`,
        pending = this.pending.get(key);
      if (!pending) return;
      this.pending.delete(key);
      clearTimeout(pending.timer);
      if (m.error) {
        const error = {
          code:
            typeof m.error.code === "string" ? m.error.code : "PLUGIN_ERROR",
          message:
            typeof m.error.message === "string"
              ? m.error.message
              : "Plugin error",
          details: m.error.details,
        };
        this.results.set(key, { fingerprint: pending.fingerprint, error });
        pending.reject(
          new Fault(error.code, error.message, {
            ...(error.details && typeof error.details === "object"
              ? error.details
              : {}),
            request_id: m.id,
            instance_id: peer.id,
          }),
        );
      } else {
        const parsed = resultSchema.safeParse(m.result);
        if (!parsed.success) {
          pending.reject(
            new Fault(
              "INVALID_RESPONSE",
              "Plugin returned an invalid response",
            ),
          );
          return;
        }
        this.results.set(key, {
          fingerprint: pending.fingerprint,
          result: parsed.data,
        });
        pending.resolve(parsed.data);
      }

    });
    ws.on("close", () => {
      clearTimeout(timer);
      if (!peer) return;
      if (this.peers.get(peer.id)?.socket === ws) this.peers.delete(peer.id);
      for (const [key, p] of this.pending)
        if (p.peer.socket === ws) {
          clearTimeout(p.timer);
          this.pending.delete(key);
          p.reject(
            new Fault(
              "DISCONNECTED",
              "Blockbench disconnected; operation outcome may be unknown",
              {
                request_id: key.slice(peer.id.length + 1),
                instance_id: peer.id,
                result_unknown: true,
              },
            ),
          );
        }
    });
    ws.on("error", () => {});
  }
  private equal(token: string) {
    const a = Buffer.from(token),
      b = Buffer.from(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  status() {
    return {
      port: this.port,
      peers: Array.from(this.peers.values()).map((p) => ({
        instance_id: p.id,
        plugin_version: p.version,
        blockbench_version: p.blockbench_version,
      })),
      pending: this.pending.size,
    };
  }
  async request(
    method: string,
    args: unknown,
    instanceId?: string,
    requestId: string = randomUUID(),
  ): Promise<Result> {
    const peer = instanceId
      ? this.peers.get(instanceId)
      : this.peers.size === 1
        ? this.peers.values().next().value
        : undefined;
    if (!peer)
      throw new Fault(
        this.peers.size > 1 ? "INSTANCE_REQUIRED" : "DISCONNECTED",
        this.peers.size > 1
          ? "Several Blockbench windows are connected; specify instance_id"
          : "Blockbench plugin is not connected",
      );
    const key = `${peer.id}:${requestId}`,
      fingerprint = stable({ method, args }),
      cached = this.results.get(key),
      pending = this.pending.get(key);
    if (
      (cached && cached.fingerprint !== fingerprint) ||
      (pending && pending.fingerprint !== fingerprint)
    )
      throw new Fault(
        "REQUEST_ID_REUSED",
        "operation_id was reused with different arguments",
      );
    if (cached?.result) return cached.result;
    if (cached?.error)
      throw new Fault(
        cached.error.code,
        cached.error.message,
        cached.error.details,
      );
    if (pending) return pending.promise;
    let resolve!: (r: Result) => void, reject!: (e: unknown) => void;
    const promise = new Promise<Result>((r, j) => {
      resolve = r;
      reject = j;
    });
    const timer = setTimeout(() => {
      this.pending.delete(key);
      reject(
        new Fault(
          "TIMEOUT",
          "Operation may still be running. Inspect bb_job with request_id before retrying.",
          { request_id: requestId, instance_id: peer.id, result_unknown: true },
        ),
      );
    }, this.timeoutMs);
    this.pending.set(key, {
      resolve,
      reject,
      timer,
      peer,
      fingerprint,
      promise,
    });
    peer.socket.send(
      JSON.stringify({ type: "request", id: requestId, method, args }),
    );
    return promise;
  }
  async close() {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Fault("SHUTDOWN", "Server shutting down"));
    }
    this.pending.clear();
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
  }
}
