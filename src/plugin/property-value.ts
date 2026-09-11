// Copy data without calling plugin toJSON methods or recursing indefinitely.
// A single opaque property must not prevent inspection of other native fields.
export function inspectPropertyValue(input: unknown): {
  value?: unknown;
  unavailable_reason?: string;
} {
  let count = 0,
    size = 0;
  const visiting = new Set<object>();
  function copy(value: any, depth: number): any {
    if (++count > 20000 || depth > 32) throw new Error("structure_limit");
    if (value === null || value === undefined || typeof value === "boolean")
      return value;
    if (typeof value === "string") {
      size += value.length;
      if (size > 2000000) throw new Error("size_limit");
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("non_finite_number");
      return value;
    }
    if (typeof value !== "object") throw new Error("non_json_value");
    if (visiting.has(value)) throw new Error("circular_reference");
    if (
      !Array.isArray(value) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      throw new Error("native_instance");
    visiting.add(value);
    try {
      if (Array.isArray(value)) return value.map((v) => copy(v, depth + 1));
      const entries = [];
      for (const key of Object.keys(value)) {
        size += key.length;
        if (size > 2000000) throw new Error("size_limit");
        entries.push([key, copy(value[key], depth + 1)]);
      }
      return Object.fromEntries(entries);
    } finally {
      visiting.delete(value);
    }
  }
  try {
    return { value: copy(input, 0) };
  } catch (error) {
    return {
      unavailable_reason: error instanceof Error ? error.message : "unreadable",
    };
  }
}
