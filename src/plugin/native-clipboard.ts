import type { BB } from "./adapter.ts";
// Observe only clipboard writes initiated inside this synchronous MCP callback.
// Never read unrelated clipboard contents or hold the hook across asynchronous work.
export function observeClipboardWrites<T>(b: BB, run: () => T) {
  const clipboard = b.navigator?.clipboard,
    original = clipboard?.writeText;
  const writes: Promise<any>[] = [];
  if (typeof original !== "function") return { value: run(), writes };
  const descriptor = Object.getOwnPropertyDescriptor(clipboard, "writeText");
  Object.defineProperty(clipboard, "writeText", {
    configurable: true,
    writable: true,
    value: function (this: any, text: any) {
      const value = String(text),
        result = original.call(this, text);
      if (writes.length < 16)
        writes.push(
          Promise.resolve(result).then(
            () => ({
              text: value.slice(0, 100000),
              length: value.length,
              truncated: value.length > 100000,
              completion: "written",
            }),
            (error) => ({
              completion: "failed",
              error: String(error?.message ?? error),
            }),
          ),
        );
      return result;
    },
  });
  try {
    return { value: run(), writes };
  } finally {
    if (descriptor) Object.defineProperty(clipboard, "writeText", descriptor);
    else delete clipboard.writeText;
  }
}
