import path from "node:path";
import { mkdir, realpath, readFile, writeFile, stat } from "node:fs/promises";
import { Fault } from "../shared/types.ts";
import { isCheckpoint } from "../shared/checkpoint.ts";
export class OutputFiles {
  constructor(public root: string) {
    this.root = path.resolve(root);
  }
  filename(name: string) {
    if (
      !name ||
      name !== path.basename(name) ||
      /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
      name === "." ||
      name === ".." ||
      /[. ]$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    )
      throw new Fault(
        "INVALID_FILENAME",
        "Use a plain filename inside the configured output folder",
      );
    return name;
  }
  async write(
    name: string,
    content: string,
    encoding: "base64" | "utf8" = "utf8",
  ) {
    this.filename(name);
    if (content.length > 64000000)
      throw new Fault("SIZE_LIMIT", "Output exceeds 64 MB");
    await mkdir(this.root, { recursive: true });
    const output = path.join(this.root, name);
    try {
      await writeFile(
        output,
        encoding === "base64" ? Buffer.from(content, "base64") : content,
        { flag: "wx" },
      );
    } catch (e: any) {
      if (e.code === "EEXIST")
        throw new Fault(
          "FILE_EXISTS",
          "Output already exists; choose a new filename",
        );
      throw e;
    }
    return { path: output, bytes: (await stat(output)).size };
  }
  async readCheckpoint(name: string) {
    this.filename(name);
    if (!name.endsWith(".bbmodel"))
      throw new Fault(
        "INVALID_CHECKPOINT",
        "Checkpoint filename must end in .bbmodel",
      );
    const root = await realpath(this.root),
      file = await realpath(path.join(root, name));
    if (path.dirname(file) !== root)
      throw new Fault(
        "PATH_ESCAPE",
        "Checkpoint link points outside output folder",
      );
    if ((await stat(file)).size > 48000000)
      throw new Fault("SIZE_LIMIT", "Checkpoint exceeds 48 MB");
    const model = JSON.parse(await readFile(file, "utf8"));
    if (!isCheckpoint(model))
      throw new Fault("INVALID_CHECKPOINT", "Not a bbmodel file");
    return model;
  }
  async readInput(name: string) {
    this.filename(name);
    const root = await realpath(this.root),
      file = await realpath(path.join(root, name));
    if (path.dirname(file) !== root)
      throw new Fault(
        "PATH_ESCAPE",
        "Input link points outside configured folder",
      );
    const info = await stat(file);
    if (!info.isFile() || info.size > 32000000)
      throw new Fault("SIZE_LIMIT", "Input must be a file under 32 MB");
    return { path: file, content: (await readFile(file)).toString("base64") };
  }
}
