import { Fault } from "../shared/types.ts";
export function splitVertexFans(
  faces: Array<{ id: string; vertices: string[]; normal: number[] }>,
  angle: number,
) {
  if (!Number.isFinite(angle) || angle < 0 || angle > 180)
    throw new Fault(
      "SPLIT_ANGLE",
      "Use an interior angle from 0 to 180 degrees",
    );
  const edges = new Map<string, { vertices: string[]; faces: typeof faces }>(),
    incident = new Map<string, string[]>();
  for (const face of faces) {
    if (face.vertices.length < 3) continue;
    for (let i = 0; i < face.vertices.length; i++) {
      const v = face.vertices[i]!,
        next = face.vertices[(i + 1) % face.vertices.length]!,
        key = JSON.stringify([v, next].sort());
      const edge = edges.get(key) ?? { vertices: [v, next], faces: [] };
      edge.faces.push(face);
      edges.set(key, edge);
      const list = incident.get(v) ?? [];
      list.push(face.id);
      incident.set(v, list);
    }
  }
  const joined = new Map<string, Array<[string, string]>>();
  for (const edge of edges.values()) {
    if (edge.faces.length > 2)
      throw new Fault(
        "NON_MANIFOLD",
        "Split Edges requires at most two faces per edge",
      );
    if (edge.faces.length !== 2) continue;
    const [a, b] = edge.faces,
      an = Math.hypot(...a!.normal),
      bn = Math.hypot(...b!.normal);
    if (!an || !bn)
      throw new Fault(
        "MESH_DEGENERATE",
        "Split Edges requires non-degenerate faces",
      );
    const dot =
        a!.normal.reduce((s, v, i) => s + v * b!.normal[i]!, 0) / (an * bn),
      interior =
        180 - (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    if (interior <= angle + 1e-8) continue;
    for (const v of edge.vertices) {
      const links = joined.get(v) ?? [];
      links.push([a!.id, b!.id]);
      joined.set(v, links);
    }
  }
  const splits: Array<{ vertex: string; faces: string[] }> = [];
  for (const [vertex, faceIds] of incident) {
    const remaining = new Set(faceIds);
    let first = true;
    while (remaining.size) {
      const seed = remaining.values().next().value!,
        component = [seed];
      remaining.delete(seed);
      for (let i = 0; i < component.length; i++)
        for (const [a, b] of joined.get(vertex) ?? []) {
          const next =
            a === component[i] ? b : b === component[i] ? a : undefined;
          if (next && remaining.delete(next)) component.push(next);
        }
      if (first) first = false;
      else splits.push({ vertex, faces: component });
    }
  }
  return splits;
}
