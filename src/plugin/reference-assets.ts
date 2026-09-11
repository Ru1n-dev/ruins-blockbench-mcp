import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { inspectEmbeddedGltf } from "./gltf-import.ts";

export function disposeReference(root: any) {
  const resources = new Set<any>();
  root?.traverse((node: any) => {
    if (node.geometry) resources.add(node.geometry);
    if (node.skeleton) resources.add(node.skeleton);
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material]) {
      if (!material) continue;
      resources.add(material);
      for (const value of Object.values(material) as any[])
        if (value?.isTexture) resources.add(value);
      for (const uniform of Object.values(material.uniforms || {}) as any[])
        if (uniform?.value?.isTexture) resources.add(uniform.value);
    }
  });
  root?.removeFromParent();
  for (const resource of resources) resource.dispose?.();
}

export function cloneReferenceProject(b: BB, source: any, owner: any) {
  const visited = new Set<string>();
  function check(project: any) {
    if (project === owner)
      throw new Fault(
        "REFERENCE_CYCLE",
        "Project references cannot form a cycle",
      );
    if (!project || visited.has(project.uuid)) return;
    visited.add(project.uuid);
    for (const element of project.elements || [])
      if (element.type === "reference_model" && element.project)
        check(b.ModelProject.all.find((p: any) => p.uuid === element.project));
  }
  check(source);
  if (!source?.model_3d)
    throw new Fault("REFERENCE_SOURCE", "Open the source project first");
  const root = source.model_3d.clone(true),
    mapping = new Map<any, any>();
  const originals: any[] = [],
    clones: any[] = [];
  source.model_3d.traverse((n: any) => originals.push(n));
  root.traverse((n: any) => clones.push(n));
  originals.forEach((n, i) => mapping.set(n, clones[i]));
  for (const node of originals)
    if (
      node.isSkinnedMesh &&
      node.skeleton.bones.some((bone: any) => !mapping.has(bone))
    )
      throw new Fault(
        "REFERENCE_SKIN",
        "Skeleton bones must belong to the source project",
      );
  const materials = new Map<any, any>(),
    textures = new Map<any, any>(),
    geometries = new Map<any, any>();
  const texture = (t: any) => {
    if (!textures.has(t)) textures.set(t, t.clone());
    return textures.get(t);
  };
  const material = (m: any) => {
    if (materials.has(m)) return materials.get(m);
    const copy = m.clone();
    materials.set(m, copy);
    for (const [key, value] of Object.entries(copy) as any[])
      if (value?.isTexture) copy[key] = texture(value);
    for (const u of Object.values(copy.uniforms || {}) as any[])
      if (u?.value?.isTexture) u.value = texture(u.value);
    return copy;
  };
  for (let i = 0; i < clones.length; i++) {
    const node = clones[i],
      original = originals[i];
    node.isElement = false;
    if (node.geometry) {
      if (!geometries.has(node.geometry))
        geometries.set(node.geometry, node.geometry.clone());
      node.geometry = geometries.get(node.geometry);
    }
    if (node.material)
      node.material = Array.isArray(node.material)
        ? node.material.map(material)
        : material(node.material);
    if (original.isSkinnedMesh) {
      const bones = original.skeleton.bones.map((bone: any) =>
        mapping.get(bone),
      );
      node.bind(
        new b.THREE.Skeleton(
          bones,
          original.skeleton.boneInverses.map((m: any) => m.clone()),
        ),
        original.bindMatrix.clone(),
      );
    }
  }
  return root;
}

export function referenceBytes(content: any): ArrayBuffer {
  const bytes =
    typeof content === "string"
      ? new TextEncoder().encode(content)
      : content instanceof ArrayBuffer
        ? new Uint8Array(content)
        : ArrayBuffer.isView(content)
          ? new Uint8Array(
              content.buffer,
              content.byteOffset,
              content.byteLength,
            )
          : null;
  if (!bytes || !bytes.length || bytes.length > 32 * 1024 * 1024)
    throw new Fault("REFERENCE_DATA", "Supply glTF or GLB up to 32 MiB");
  const buffer = Uint8Array.from(bytes).buffer;
  inspectEmbeddedGltf(buffer);
  return buffer;
}
export function encodeReference(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer),
    parts = [];
  for (let i = 0; i < bytes.length; i += 8192)
    parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(parts.join(""));
}
export function parseReference(Loader: any, buffer: ArrayBuffer): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(
        new Fault("REFERENCE_TIMEOUT", "glTF parsing exceeded ten seconds"),
      );
    }, 10000);
    const fail = (error: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    try {
      const loader = new Loader();
      loader.parse(
        buffer,
        "",
        (gltf: any) => {
          if (settled) {
            disposeReference(gltf.scene);
            return;
          }
          // The bundled 2021 loader writes the removed Texture.encoding property.
          const colorTextures = new Map<any, any>();
          gltf.scene.traverse((node: any) => {
            for (const m of Array.isArray(node.material)
              ? node.material
              : [node.material])
              for (const key of ["map", "emissiveMap"])
                if (m?.[key]) {
                  const original = m[key];
                  if (!colorTextures.has(original)) {
                    const t = original.clone();
                    t.colorSpace = "srgb";
                    colorTextures.set(original, t);
                  }
                  m[key] = colorTextures.get(original);
                }
          });
          settled = true;
          clearTimeout(timer);
          resolve(gltf.scene);
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
  });
}
