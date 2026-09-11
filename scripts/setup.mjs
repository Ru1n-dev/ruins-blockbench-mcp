import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

await mkdir(".runtime", { recursive: true });

let config;
try {
  config = JSON.parse(await readFile(".runtime/connection.json", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

config ??= {
  token: randomBytes(32).toString("hex"),
  port: 32123,
  output_dir: path.resolve("artifacts"),
};
config.url = `ws://127.0.0.1:${config.port}/bridge`;
await writeFile(
  ".runtime/connection.json",
  JSON.stringify(config, null, 2) + "\n",
);

execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });

const args = [
  path.resolve("dist/server.mjs"),
  "--config",
  path.resolve(".runtime/connection.json"),
];
const settings = {
  mcpServers: {
    ruins_blockbench: {
      command: process.execPath,
      args,
    },
  },
};
await writeFile(
  ".runtime/mcp-config.json",
  JSON.stringify(settings, null, 2) + "\n",
);
const toml = `[mcp_servers.ruins_blockbench]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify(args)}\n`;
await writeFile(".runtime/codex-config.toml", toml);

console.log("Built plugin: " + path.resolve("dist/ruins_blockbench_mcp.js"));
console.log("MCP configuration: " + path.resolve(".runtime/mcp-config.json"));
console.log("Codex configuration snippet: " + path.resolve(".runtime/codex-config.toml"));
