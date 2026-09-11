export function remapMarkerReferences(
  projects: any[],
  before: any[],
  after: any[],
) {
  const mapping = before.map((color) =>
    after.findIndex(
      (candidate) => candidate === color || candidate.id === color.id,
    ),
  );
  const seen = new Set<any>();
  const remap = (object: any, fallback = 0) => {
    if (!object || typeof object !== "object" || seen.has(object)) return false;
    seen.add(object);
    const index = object.color;
    if (!Number.isInteger(index) || index < 0 || index >= mapping.length)
      return false;
    const next = mapping[index] < 0 ? fallback : mapping[index];
    if (next === index) return false;
    object.color = next;
    return true;
  };
  const animation = (a: any) => {
    let changed = false;
    for (const marker of a.markers ?? []) changed = remap(marker) || changed;
    for (const animator of Object.values(a.animators ?? {}) as any[])
      for (const key of animator.keyframes ?? [])
        changed = remap(key, -1) || changed;
    return changed;
  };
  const save = (s: any) => {
    if (!s) return;
    for (const node of Object.values(s.elements ?? {})) remap(node);
    for (const group of [...(s.groups ?? []), ...(s._groups ?? [])])
      remap(group);
    for (const key of Object.values(s.keyframes ?? {})) remap(key, -1);
    for (const a of Object.values(s.animations ?? {})) animation(a);
  };
  for (const project of projects) {
    let changed = false;
    for (const node of [...(project.elements ?? []), ...(project.groups ?? [])])
      changed = remap(node) || changed;
    for (const a of project.animations ?? []) changed = animation(a) || changed;
    for (const entry of project.undo?.history ?? []) {
      save(entry.before);
      save(entry.post);
    }
    save(project.undo?.current_save);
    if (changed) project.saved = false;
  }
}
