import type { Adapter, BB } from "./adapter.ts";
import { Fault, stable, type Result } from "../shared/types.ts";
import { withOutlinerUndo } from "./native-undo.ts";
import { waitForImage } from "./image-loading.ts";
import { runVoxImport } from "./legacy-vox.ts";

const brokers = new WeakMap<BB, NativeFiles>();
export function isNativeFileScope(b: BB): boolean {
  return brokers.get(b)?.inScope() ?? false;
}
export function withNativeFiles<T>(b: BB, run: () => T): T {
  const broker = brokers.get(b);
  return broker ? broker.run(run) : run();
}
interface Pending {
  id: string;
  kind: "import" | "export";
  project: string | null;
  fingerprint: string;
  options: any;
  callback?: (...args: any[]) => any;
  bytes: number;
}
export class NativeFiles {
  private scopeDepth = 0;
  inScope() {
    return this.scopeDepth > 0;
  }
  private pending = new Map<string, Pending>();
  private active = true;
  private fingerprint() {
    return (
      this.adapter.fingerprint() +
      "|" +
      stable(
        this.adapter.compile("project", {
          raw: true,
          bitmaps: false,
          editor_state: false,
        }),
      )
    );
  }
  private clearOnUnload = () => this.pending.clear();
  constructor(
    private adapter: Adapter,
    private guard: () => void,
  ) {
    brokers.set(adapter.b, this);
    adapter.b.Blockbench.on?.("unloaded_plugin", this.clearOnUnload);
  }
  dispose() {
    this.active = false;
    this.pending.clear();
    brokers.delete(this.adapter.b);
    this.adapter.b.Blockbench.removeListener?.(
      "unloaded_plugin",
      this.clearOnUnload,
    );
  }
  run<T>(run: () => T): T {
    const b = this.adapter.b,
      originalImport = b.Blockbench.import,
      originalExport = b.Blockbench.export,
      filesystem = b.Filesystem,
      originalFilesystemImport = filesystem?.importFile,
      originalFilesystemExport = filesystem?.exportFile;
    const enqueue = (kind: Pending["kind"], options: any, callback: any) => {
      let content = options?.content;
      if (content instanceof ArrayBuffer) content = content.slice(0);
      else if (ArrayBuffer.isView(content))
        content = new Uint8Array(
          content.buffer,
          content.byteOffset,
          content.byteLength,
        ).slice();
      const fingerprint = b.Project ? this.fingerprint() : "";
      const bytes =
        fingerprint.length * 2 +
        (typeof content === "string"
          ? content.length * 2
          : (content?.byteLength ?? content?.size ?? 0));
      if (
        this.pending.size >= 8 ||
        bytes + [...this.pending.values()].reduce((n, p) => n + p.bytes, 0) >
          48000000
      )
        throw new Fault(
          "FILE_QUEUE_LIMIT",
          "Resolve or cancel existing native file requests first",
        );
      const id = crypto.randomUUID();
      this.pending.set(id, {
        id,
        kind,
        project: b.Project?.uuid ?? null,
        fingerprint,
        options: {
          ...options,
          content,
          extensions: [...(options?.extensions ?? [])],
        },
        callback,
        bytes,
      });
    };
    const receive = (options: any, cb: any) => enqueue("import", options, cb);
    const send = (options: any, cb: any) => enqueue("export", options, cb);
    b.Blockbench.import = receive;
    b.Blockbench.export = send;
    if (originalFilesystemImport) filesystem.importFile = receive;
    if (originalFilesystemExport) filesystem.exportFile = send;
    this.scopeDepth++;
    try {
      return run();
    } finally {
      this.scopeDepth--;
      if (b.Blockbench.import === receive) b.Blockbench.import = originalImport;
      if (b.Blockbench.export === send) b.Blockbench.export = originalExport;
      if (filesystem?.importFile === receive)
        filesystem.importFile = originalFilesystemImport;
      if (filesystem?.exportFile === send)
        filesystem.exportFile = originalFilesystemExport;
    }
  }
  list(): Result {
    return {
      data: {
        requests: [...this.pending.values()].map((p) => ({
          file_request_id: p.id,
          kind: p.kind,
          project_id: p.project,
          type: p.options.type,
          extensions: p.options.extensions,
          readtype: p.options.readtype ?? "text",
          savetype: p.options.savetype,
          suggested_name: p.options.name,
          multiple: !!p.options.multiple,
          requires_adapter:
            !!p.options.custom_writer ||
            typeof p.options.readtype === "function",
        })),
        scope:
          "Synchronous file requests made inside MCP native callbacks; OS dialogs from unrelated or later asynchronous code are not intercepted",
      },
    };
  }
  private get(id: string, kind?: Pending["kind"]) {
    if (!this.active)
      throw new Fault("UNLOADED", "Native file bridge was unloaded");
    const pending = this.pending.get(id);
    if (!pending || (kind && pending.kind !== kind))
      throw new Fault(
        "FILE_REQUEST_NOT_FOUND",
        "Native file request is missing or has another direction",
      );
    return pending;
  }
  cancel(id: string): Result {
    this.get(id);
    this.pending.delete(id);
    return { data: { cancelled: true, ...this.list().data } };
  }
  private assertContext(p: Pending) {
    this.guard();
    const b = this.adapter.b;
    if (
      (b.Project?.uuid ?? null) !== p.project ||
      (b.Project && this.fingerprint() !== p.fingerprint)
    )
      throw new Fault(
        "STALE_FILE_REQUEST",
        "Project changed after the file request; cancel it and invoke the native operation again",
      );
  }
  async import(
    id: string,
    inputs: Array<{ filename: string; path: string; content: string }>,
  ): Promise<Result> {
    const p = this.get(id, "import");
    this.assertContext(p);
    if (!inputs.length || (!p.options.multiple && inputs.length !== 1))
      throw new Fault(
        "FILE_COUNT",
        "Native picker does not accept this number of files",
      );
    const type =
      p.options.readtype === "buffer"
        ? "binary"
        : (p.options.readtype ?? "text");
    if (!["text", "binary", "image", "none"].includes(type))
      throw new Fault(
        "FILE_ADAPTER_REQUIRED",
        "Custom native file readers require an adapter",
      );
    const files = inputs.map((input) => {
      const extension = input.filename.split(".").at(-1)!.toLowerCase();
      if (
        p.options.extensions.length &&
        !p.options.extensions.some(
          (e: string) =>
            e === "*" || e.replace(/^\./, "").toLowerCase() === extension,
        )
      )
        throw new Fault(
          "FILE_EXTENSION",
          "Input extension does not match the native picker",
        );
      if (type === "none") return { name: input.filename, path: input.path };
      const bytes = Uint8Array.from(atob(input.content), (c) =>
        c.charCodeAt(0),
      );
      const mime: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        bmp: "image/bmp",
      };
      if (type === "image" && !mime[extension])
        throw new Fault("FILE_IMAGE_TYPE", "Unsupported image encoding");
      return {
        name: input.filename,
        path: input.path,
        content:
          type === "binary"
            ? bytes.buffer
            : type === "image"
              ? `data:${mime[extension]};base64,${input.content}`
              : new TextDecoder().decode(bytes),
      };
    });
    this.pending.delete(id); // Native callbacks may mutate before throwing; never replay automatically.
    await withOutlinerUndo(this.adapter.b, () => {
      const b = this.adapter.b;
      return b.Blockbench.version === "5.1.6" &&
        b.Plugins.registered.vox_importer?.version === "1.2.2" &&
        p.options.type === "Vox Model" &&
        type === "binary"
        ? runVoxImport(b, () => p.callback?.(files))
        : p.callback?.(files);
    });
    if (!this.active)
      throw new Fault("UNLOADED", "Plugin unloaded during native import");
    const opened = this.adapter.b.Project;
    await Promise.all(
      (opened?.textures ?? [])
        .flatMap((t: any) => [
          t.img,
          ...(t.layers ?? []).map((l: any) => l.img),
        ])
        .map(waitForImage),
    );
    return {
      data: {
        completion: "native_import_callback_returned",
        project_id: opened?.uuid,
        ...this.list().data,
      },
    };
  }
  async export(id: string): Promise<Result> {
    const p = this.get(id, "export");
    this.assertContext(p);
    if (p.options.custom_writer)
      throw new Fault(
        "FILE_ADAPTER_REQUIRED",
        "Custom native writers require an adapter",
      );
    let value = p.options.content;
    if (value instanceof Blob)
      value = new Uint8Array(await value.arrayBuffer());
    let content: string,
      encoding = "utf8";
    if (typeof value === "string") {
      if (
        p.options.savetype === "image" &&
        /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
      ) {
        content = value.slice(value.indexOf(",") + 1);
        encoding = "base64";
      } else {
        if (p.options.savetype === "image")
          throw new Fault(
            "FILE_ADAPTER_REQUIRED",
            "Image export requires embedded image bytes, not a filesystem path",
          );
        content = value;
      }
    } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const chunks: string[] = [];
      for (let i = 0; i < bytes.length; i += 32768)
        chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
      content = btoa(chunks.join(""));
      encoding = "base64";
    } else
      throw new Fault(
        "FILE_ADAPTER_REQUIRED",
        "Export payload is not text or binary data",
      );
    if (content.length > 64000000)
      throw new Fault(
        "SIZE_LIMIT",
        "Native export exceeds the transport limit",
      );
    return {
      data: { content, encoding, extension: p.options.extensions[0] ?? "bin" },
    };
  }
  acknowledge(id: string, path: string): Result {
    const p = this.get(id, "export");
    this.assertContext(p);
    this.pending.delete(id);
    withOutlinerUndo(this.adapter.b, () => p.callback?.(path));
    return {
      data: {
        completion: "native_export_callback_returned",
        ...this.list().data,
      },
    };
  }
}
