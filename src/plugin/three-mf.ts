import { z } from "zod";
import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { isNativeFileScope } from "./native-files.ts";

const units = [
  "micron",
  "millimeter",
  "centimeter",
  "meter",
  "inch",
  "foot",
] as const;
const optionsSchema = z
  .object({
    units: z.enum(units).default("millimeter"),
    split: z.enum(["none", "group", "marker"]).default("none"),
  })
  .strict();
type Point = [number, number, number];
export type Solid = {
  vertices: Point[];
  triangles: [number, number, number][];
};
const xml = (value: string) =>
  value
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    )
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "\ufffd");

export function validateSolid(solid: Solid): number {
  const edges = new Map<string, { count: number; orientation: number }>();
  let volume = 0;
  const origin = solid.vertices[0] ?? [0, 0, 0];
  for (const indexes of solid.triangles) {
    if (
      new Set(indexes).size !== 3 ||
      !indexes.every(
        (i) => Number.isInteger(i) && i >= 0 && i < solid.vertices.length,
      )
    )
      throw new Fault("3MF_TRIANGLE", "Triangle has invalid vertex indices");
    const [a, b, c] = indexes.map((i) => solid.vertices[i]);
    if (![...a, ...b, ...c].every(Number.isFinite))
      throw new Fault("3MF_VERTEX", "Vertices must be finite");
    const cross = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    if (cross.every((v) => v === 0))
      throw new Fault("3MF_TRIANGLE", "Degenerate triangle has no area");
    const [u, v, w] = [a, b, c].map((p) => p.map((n, i) => n - origin[i]));
    volume +=
      (u[0] * (v[1] * w[2] - v[2] * w[1]) +
        u[1] * (v[2] * w[0] - v[0] * w[2]) +
        u[2] * (v[0] * w[1] - v[1] * w[0])) /
      6;
    for (let i = 0; i < 3; i++) {
      const x = indexes[i],
        y = indexes[(i + 1) % 3],
        key = `${Math.min(x, y)}:${Math.max(x, y)}`;
      const entry = edges.get(key) ?? { count: 0, orientation: 0 };
      entry.count++;
      entry.orientation += x < y ? 1 : -1;
      edges.set(key, entry);
    }
  }
  if (
    !solid.triangles.length ||
    [...edges.values()].some((e) => e.count !== 2 || e.orientation !== 0)
  )
    throw new Fault(
      "3MF_OPEN_MESH",
      "Geometry must form a closed, consistently wound solid",
    );
  if (!Number.isFinite(volume) || volume <= 0)
    throw new Fault(
      "3MF_VOLUME",
      "Geometry must have positive volume and outward faces",
    );
  return volume;
}

export function collectThreeMf(b: BB, rawOptions: unknown) {
  const parsed = optionsSchema.safeParse(rawOptions ?? {});
  if (!parsed.success) throw new Fault("3MF_OPTIONS", parsed.error.message);
  const options = parsed.data;
  const objects = new Map<string, Solid & { name: string }>();
  let triangleCount = 0;
  for (const node of [...b.Cube.all, ...b.Mesh.all]) {
    let excluded = false;
    for (
      let ancestor = node;
      ancestor && typeof ancestor === "object";
      ancestor = ancestor.parent
    )
      if (ancestor.export === false) excluded = true;
    if (excluded) continue;
    const marker = b.markerColors[node.color];
    const key =
      options.split === "group"
        ? (node.parent?.uuid ?? "root")
        : options.split === "marker"
          ? String(node.color)
          : "all";
    const name =
      options.split === "group"
        ? (node.parent?.name ?? b.Project.name)
        : options.split === "marker"
          ? (marker?.name ?? marker?.id ?? `Marker ${node.color}`)
          : b.Project.name;
    let object = objects.get(key);
    if (!object) {
      object = { name, vertices: [], triangles: [] };
      objects.set(key, object);
    }
    const solid: Solid = { vertices: [], triangles: [] };
    const vertexMap = new Map<string, number>();
    node.mesh.updateWorldMatrix(true, true);
    node.mesh.traverse((mesh: any) => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry,
        positions = geometry?.attributes?.position;
      if (!positions) return;
      const index = geometry.index,
        count = index?.count ?? positions.count;
      if (count % 3)
        throw new Fault("3MF_TRIANGLE", "Geometry is not a triangle list");
      const reverse = mesh.matrixWorld.determinant() > 0;
      for (let i = 0; i < count; i += 3) {
        if (++triangleCount > 250000)
          throw new Fault("3MF_SIZE", "3MF export exceeds 250,000 triangles");
        const triangle = [];
        for (const offset of reverse ? [0, 2, 1] : [0, 1, 2]) {
          const source = index ? index.getX(i + offset) : i + offset;
          const vector = new b.THREE.Vector3()
            .fromBufferAttribute(positions, source)
            .applyMatrix4(mesh.matrixWorld);
          const point = [vector.x, vector.z, vector.y].map((v) =>
            Object.is(v, -0) ? 0 : v,
          ) as Point;
          if (!point.every(Number.isFinite))
            throw new Fault("3MF_VERTEX", "Vertices must be finite");
          const id = point.join(",");
          let vertex = vertexMap.get(id);
          if (vertex === undefined) {
            vertex = solid.vertices.length;
            vertexMap.set(id, vertex);
            solid.vertices.push(point);
          }
          triangle.push(vertex);
        }
        solid.triangles.push(triangle as [number, number, number]);
      }
    });
    validateSolid(solid);
    const base = object.vertices.length;
    object.vertices.push(...solid.vertices);
    object.triangles.push(
      ...solid.triangles.map(
        (t) => t.map((i) => i + base) as [number, number, number],
      ),
    );
  }
  if (!objects.size)
    throw new Fault("3MF_EMPTY", "No exportable Cube or Mesh geometry");
  const list = [...objects.values()];
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="${options.units}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${list.map((o, i) => `<object id="${i + 1}" type="model" name="${xml(o.name)}"><mesh><vertices>${o.vertices.map((v) => `<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join("")}</vertices><triangles>${o.triangles.map((t) => `<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`).join("")}</triangles></mesh></object>`).join("")}</resources><build>${list.map((_, i) => `<item objectid="${i + 1}"/>`).join("")}</build></model>`;
  if (model.length > 32000000)
    throw new Fault("3MF_SIZE", "3MF XML exceeds 32 MB");
  return { model, objects: list };
}

export function installThreeMf(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "export_to_3mf" || plugin.version !== "0.0.1") return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    if (b.Codecs.pbmc_3mf)
      throw new Fault("CODEC_EXISTS", "pbmc_3mf codec is already registered");
    let active = true;
    const codec = new b.Codec("pbmc_3mf", {
      name: "3MF (MCP adapter)",
      extension: "3mf",
      remember: false,
      export_options: {
        units: {
          label: "Unit",
          type: "select",
          value: "millimeter",
          options: Object.fromEntries(units.map((u) => [u, u])),
        },
        split: {
          label: "Split",
          type: "select",
          value: "none",
          options: {
            none: "One object",
            group: "By group",
            marker: "By marker color",
          },
        },
      },
      async compile(options: any) {
        const { model } = collectThreeMf(b, options);
        const zip = new b.JSZip();
        zip.file(
          "[Content_Types].xml",
          '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
        );
        zip.file(
          "_rels/.rels",
          '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
        );
        zip.file("3D/3dmodel.model", model);
        const result = await zip.generateAsync({
          type: "arraybuffer",
          compression: "DEFLATE",
        });
        if (!active)
          throw new Fault("UNLOADED", "3MF adapter was unloaded during export");
        return result;
      },
    });
    codec.plugin = "export_to_3mf";
    const action = b.BarItems["export-to-3mf-button"],
      original = action?.click;
    const guarded = function (this: any, ...args: any[]) {
      if (isNativeFileScope(b))
        throw new Fault(
          "3MF_ADAPTER_REQUIRED",
          "Use bb_export with codec pbmc_3mf and options {units, split} for this asynchronous exporter",
          { tool: "bb_export", codec: "pbmc_3mf" },
        );
      return original.apply(this, args);
    };
    if (action) action.click = guarded;
    restore = () => {
      active = false;
      codec.delete();
      if (action?.click === guarded) action.click = original;
    };
  }
  return { sync, dispose: () => restore?.() };
}
