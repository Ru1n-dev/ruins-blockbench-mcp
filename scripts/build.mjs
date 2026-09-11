import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["src/server/index.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  sourcemap: true,
  target: "node22",
});

let defaults = { url: "ws://127.0.0.1:32123/bridge", token: "" };
try {
  const config = JSON.parse(
    await readFile(".runtime/connection.json", "utf8"),
  );
  defaults = {
    url: config.url ?? `ws://127.0.0.1:${config.port}/bridge`,
    token: config.token ?? "",
  };
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

await build({
  entryPoints: ["src/plugin/index.ts"],
  outfile: "dist/ruins_blockbench_mcp.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  sourcemap: true,
  target: "chrome130",
  define: { RBMCP_DEFAULTS: JSON.stringify(defaults) },
});

console.log("Built dist/server.mjs and dist/ruins_blockbench_mcp.js");
