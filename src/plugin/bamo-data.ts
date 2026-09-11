import { BAMO_DEFAULTS } from "./generated/bamo-generator.ts";
import { Fault } from "../shared/types.ts";
export function bamoProperties(input: any = {}) {
  const merge = (defaults: any, value: any, key: string): any => {
    if (value === undefined) return JSON.parse(JSON.stringify(defaults));
    if (Array.isArray(defaults)) {
      if (
        !Array.isArray(value) ||
        value.some((v) => typeof v !== "string" || v.length > 256)
      )
        throw new Fault("BAMO_SETTINGS", `Invalid ${key}`);
      return value.slice();
    }
    if (defaults && typeof defaults === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Fault("BAMO_SETTINGS", `Invalid ${key}`);
      return Object.fromEntries(
        Object.entries(defaults).map(([name, d]) => [
          name,
          merge(d, value[name], `${key}.${name}`),
        ]),
      );
    }
    if (
      typeof value !== typeof defaults ||
      (typeof value === "number" && !Number.isFinite(value)) ||
      (typeof value === "string" && value.length > 1024)
    )
      throw new Fault("BAMO_SETTINGS", `Invalid ${key}`);
    return value;
  };
  const properties = merge(BAMO_DEFAULTS, input, "properties");
  if (
    !/^[a-z0-9_-][a-z0-9_.-]*$/.test(properties.namespace) ||
    !["1.16.5", "1.18.2", "1.20.1"].includes(properties.version)
  )
    throw new Fault("BAMO_SETTINGS", "Invalid namespace or pack version");
  return properties;
}
export function bamoName(name: string) {
  const clean = name
    .replace(/[^a-zA-Z\d\s._]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
  if (!clean || /^\.+$/.test(clean))
    throw new Fault(
      "BAMO_NAME",
      "Use a block name containing ASCII letters or numbers",
    );
  return clean;
}
