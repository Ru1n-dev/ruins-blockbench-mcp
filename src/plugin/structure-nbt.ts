import { Fault } from "../shared/types.ts";
import { structureAlgorithms } from "./generated/structure-model.ts";

const MAX_BYTES = 32 * 1024 * 1024;
const decode = structureAlgorithms(() => {}).decodeString;
/** Java structure NBT only; bound decompression, allocations and nesting. */
export async function readStructureNbt(input: ArrayBuffer) {
  let bytes = new Uint8Array(input);
  if (bytes.length > MAX_BYTES)
    throw new Fault("NBT_LIMIT", "NBT exceeds 32 MiB");
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    const reader = stream.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > MAX_BYTES)
          throw new Fault("NBT_LIMIT", "Decompressed NBT exceeds 32 MiB");
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 0,
    nodes = 0;
  const fail = (message: string): never => {
    throw new Fault("NBT_INVALID", message);
  };
  const take = (length: number) => {
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > bytes.length - cursor
    )
      fail("Truncated or invalid NBT length");
    const start = cursor;
    cursor += length;
    return start;
  };
  const byte = () => view.getUint8(take(1));
  const int = () => view.getInt32(take(4));
  const string = () => {
    const length = view.getUint16(take(2)),
      start = take(length);
    return decode(bytes.subarray(start, start + length));
  };
  const count = (width: number) => {
    const length = int();
    if (
      length < 0 ||
      length > 1_000_000 ||
      length * width > bytes.length - cursor
    )
      fail("Invalid NBT array length");
    return length;
  };
  const value = (tag: number, depth: number): any => {
    if (++nodes > 1_000_000 || depth > 64)
      fail("NBT nesting or tag count exceeded");
    switch (tag) {
      case 1:
        return view.getInt8(take(1));
      case 2:
        return view.getInt16(take(2));
      case 3:
        return int();
      case 4:
        return view.getBigInt64(take(8));
      case 5:
        return view.getFloat32(take(4));
      case 6:
        return view.getFloat64(take(8));
      case 7: {
        const n = count(1),
          p = take(n);
        return bytes.slice(p, p + n);
      }
      case 8:
        return string();
      case 9: {
        const kind = byte(),
          length = count(1);
        if (kind > 12 || (!kind && length)) fail("Invalid NBT list type");
        return Array.from({ length }, () => value(kind, depth + 1));
      }
      case 10: {
        const result = Object.create(null);
        for (;;) {
          const kind = byte();
          if (!kind) return result;
          const key = string();
          if (Object.hasOwn(result, key)) fail("Duplicate NBT compound key");
          result[key] = value(kind, depth + 1);
        }
      }
      case 11: {
        const n = count(4);
        return Array.from({ length: n }, int);
      }
      case 12: {
        const n = count(8);
        return Array.from({ length: n }, () => view.getBigInt64(take(8)));
      }
      default:
        return fail("Unknown NBT tag");
    }
  };
  if (byte() !== 10) fail("Java structure NBT must have a compound root");
  string();
  const root = value(10, 0);
  if (cursor !== bytes.length) fail("Trailing bytes after NBT root");
  const vec = (v: any, positive: boolean) => {
    if (
      !Array.isArray(v) ||
      v.length !== 3 ||
      !v.every(
        (n) =>
          Number.isSafeInteger(n) &&
          n >= 0 &&
          n <= 1_000_000 &&
          (!positive || n > 0),
      )
    )
      fail("Invalid structure size or position");
    return v as number[];
  };
  const size = vec(root.size, true);
  if (
    !Array.isArray(root.palette) ||
    root.palette.length > 65536 ||
    !Array.isArray(root.blocks) ||
    root.blocks.length > 100000
  )
    fail("Structure requires a bounded palette and blocks list");
  const palette = root.palette.map((entry: any) => {
    if (typeof entry?.Name !== "string") fail("Invalid palette name");
    const properties = entry.Properties ?? {};
    if (
      !properties ||
      typeof properties !== "object" ||
      Array.isArray(properties) ||
      !Object.values(properties).every((v) => typeof v === "string")
    )
      fail("Invalid palette properties");
    return { name: entry.Name, properties };
  });
  const seen = new Set<string>();
  const blocks = root.blocks.map((entry: any) => {
    const pos = vec(entry?.pos, false),
      state = entry.state;
    if (
      !Number.isInteger(state) ||
      state < 0 ||
      state >= palette.length ||
      pos.some((n, i) => n >= size[i])
    )
      fail("Block outside structure size or palette");
    const key = pos.join(",");
    if (seen.has(key)) fail("Duplicate structure block position");
    seen.add(key);
    return { pos, state };
  });
  return { size, palette, blocks };
}
