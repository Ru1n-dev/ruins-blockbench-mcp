import { Fault } from "../shared/types.ts";

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes)
    value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** USDZ stores each file uncompressed at a 64-byte aligned data offset. */
export function packUsdz(files: { name: string; data: Uint8Array }[]) {
  if (
    !files.length ||
    files.length > 65535 ||
    !/\.usd[ac]?$/.test(files[0].name)
  )
    throw new Fault("USDZ_FILES", "The first USDZ file must be a USD layer");
  const names = new Set<string>();
  const entries = files.map(({ name, data }) => {
    if (
      !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]+$/.test(name) ||
      name.length > 255 ||
      names.has(name)
    )
      throw new Fault(
        "USDZ_PATH",
        "USDZ paths must be unique relative asset names",
      );
    names.add(name);
    return {
      name: new TextEncoder().encode(name),
      data,
      crc: crc32(data),
      offset: 0,
      extra: 0,
    };
  });
  let size = 0;
  for (const entry of entries) {
    entry.offset = size;
    entry.extra = (64 - ((size + 30 + entry.name.length) % 64)) % 64;
    // Extra fields have a four-byte header; tiny gaps need another alignment block.
    if (entry.extra > 0 && entry.extra < 4) entry.extra += 64;
    size += 30 + entry.name.length + entry.extra + entry.data.length;
  }
  const directory = size;
  for (const entry of entries) size += 46 + entry.name.length;
  size += 22;
  if (size > 32 * 1024 * 1024)
    throw new Fault("USDZ_SIZE", "USDZ output exceeds 32 MiB");
  const bytes = new Uint8Array(size),
    view = new DataView(bytes.buffer);
  const u16 = (at: number, value: number) => view.setUint16(at, value, true);
  const u32 = (at: number, value: number) => view.setUint32(at, value, true);
  for (const entry of entries) {
    const at = entry.offset;
    u32(at, 0x04034b50);
    u16(at + 4, 20);
    u16(at + 12, 33); // DOS date: 1980-01-01, deterministic.
    u32(at + 14, entry.crc);
    u32(at + 18, entry.data.length);
    u32(at + 22, entry.data.length);
    u16(at + 26, entry.name.length);
    u16(at + 28, entry.extra);
    bytes.set(entry.name, at + 30);
    if (entry.extra) {
      u16(at + 30 + entry.name.length, 0x1986);
      u16(at + 32 + entry.name.length, entry.extra - 4);
    }
    bytes.set(entry.data, at + 30 + entry.name.length + entry.extra);
  }
  let at = directory;
  for (const entry of entries) {
    u32(at, 0x02014b50);
    u16(at + 4, 20);
    u16(at + 6, 20);
    u16(at + 14, 33);
    u32(at + 16, entry.crc);
    u32(at + 20, entry.data.length);
    u32(at + 24, entry.data.length);
    u16(at + 28, entry.name.length);
    u32(at + 42, entry.offset);
    bytes.set(entry.name, at + 46);
    at += 46 + entry.name.length;
  }
  u32(at, 0x06054b50);
  u16(at + 8, entries.length);
  u16(at + 10, entries.length);
  u32(at + 12, at - directory);
  u32(at + 16, directory);
  return bytes;
}
