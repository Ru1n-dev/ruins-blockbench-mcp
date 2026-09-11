import { z } from "zod";
import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { importGltfAnimations } from "./gltf-animation.ts";

export function inspectEmbeddedGltf(bytes: ArrayBuffer) {
  let jsonBytes = new Uint8Array(bytes);
  if (
    bytes.byteLength >= 4 &&
    new DataView(bytes).getUint32(0, true) === 0x46546c67
  ) {
    const view = new DataView(bytes);
    if (
      bytes.byteLength < 20 ||
      view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== bytes.byteLength
    )
      throw new Fault("GLTF_CONTAINER", "Invalid GLB header");
    const length = view.getUint32(12, true);
    if (
      length % 4 ||
      20 + length > bytes.byteLength ||
      view.getUint32(16, true) !== 0x4e4f534a
    )
      throw new Fault("GLTF_CONTAINER", "Invalid GLB JSON chunk");
    jsonBytes = new Uint8Array(bytes, 20, length);
  }
  let model: any;
  try {
    model = JSON.parse(new TextDecoder().decode(jsonBytes));
  } catch {
    throw new Fault("GLTF_JSON", "Invalid glTF JSON");
  }
  if (!model || model.asset?.version !== "2.0")
    throw new Fault("GLTF_VERSION", "Expected glTF 2.0");
  for (const item of [...(model.buffers ?? []), ...(model.images ?? [])])
    if (item.uri && !/^data:[^,]*,/i.test(item.uri))
      throw new Fault(
        "GLTF_EXTERNAL_RESOURCE",
        "Embed buffers and images in glTF or GLB before using this import adapter",
      );
  return model;
}

export function installGltfImport(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "gltf_importer" || plugin.version !== "1.2.0") return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    let active = true;
    const codec = new b.Codec("pbmc_gltf", {
      name: "glTF (MCP import adapter)",
      extension: "glb",
      remember: false,
      load_filter: {
        type: "binary",
        extensions: ["gltf", "glb"],
        condition: () => true,
      },
      async load(content: any, file: any, args: any) {
        const options = z
          .object({
            scale: z.number().finite().min(0.00001).max(100000).default(16),
            groups: z.boolean().default(false),
            animations: z.boolean().default(true),
            import_to_current_project: z.literal(false).optional(),
          })
          .strict()
          .parse(args ?? {});
        if (!(content instanceof ArrayBuffer))
          throw new Fault(
            "GLTF_BINARY",
            "Use binary content_type for glTF import",
          );
        inspectEmbeddedGltf(content);
        b.setupProject(b.Formats.free);
        const project = b.Project;
        project.name = file.name.replace(/\.(gltf|glb)$/i, "");
        const Loader = b.THREE.GLTFLoader;
        let parsedGltf: any;
        // The importer constructs its loader synchronously before its first await.
        // Scope preprocessing to that instance rather than changing all loaders.
        class ScopedLoader extends Loader {
          parse(data: any, path: any, onLoad: any, onError: any) {
            return super.parse(
              data,
              path,
              (gltf: any) => {
                try {
                  if (!active || b.Project !== project)
                    throw new Fault(
                      "STALE_PROJECT",
                      "Project changed while parsing glTF",
                    );
                  gltf.scene?.traverse((node: any) => {
                    const g = node.geometry;
                    if (node.isMesh && g?.attributes.position && !g.index)
                      g.setIndex(
                        Array.from(
                          { length: g.attributes.position.count },
                          (_, i) => i,
                        ),
                      );
                  });
                  if (!options.animations || !gltf.animations?.length) {
                    gltf.scene.updateMatrixWorld(true);
                    const positions = new Map<any, any>();
                    gltf.scene.traverse((node: any) =>
                      positions.set(
                        node,
                        new b.THREE.Vector3().setFromMatrixPosition(
                          node.matrixWorld,
                        ),
                      ),
                    );
                    gltf.scene.traverse((node: any) => {
                      if (node.isMesh && node.geometry) {
                        const matrix = node.matrixWorld.clone(),
                          origin = positions.get(node);
                        node.geometry = node.geometry
                          .clone()
                          .applyMatrix4(matrix)
                          .translate(-origin.x, -origin.y, -origin.z);
                        if (matrix.determinant() < 0 && node.geometry.index) {
                          const index = node.geometry.index;
                          for (let i = 0; i < index.count; i += 3) {
                            const a = index.getX(i + 1);
                            index.setX(i + 1, index.getX(i + 2));
                            index.setX(i + 2, a);
                          }
                        }
                      }
                      node.position.copy(positions.get(node));
                      if (positions.has(node.parent))
                        node.position.sub(positions.get(node.parent));
                      node.quaternion.identity();
                      node.scale.set(1, 1, 1);
                      node.updateMatrix();
                    });
                    gltf.scene.updateMatrixWorld(true);
                  }
                  onLoad(gltf);
                  parsedGltf = gltf;
                } catch (error) {
                  onError(error);
                }
              },
              onError,
            );
          }
        }
        let pending: Promise<any>;
        b.THREE.GLTFLoader = ScopedLoader;
        try {
          pending = b.importGltf({
            file: { ...file, content },
            scale: options.scale,
            groups: options.groups,
            animations: false,
            cameras: false,
            mergeQuads: false,
            undoable: false,
            selectResult: true,
          });
        } finally {
          if (b.THREE.GLTFLoader === ScopedLoader) b.THREE.GLTFLoader = Loader;
        }
        const imported = await pending;
        if (!active || b.Project !== project)
          throw new Fault(
            "STALE_PROJECT",
            "Project changed during glTF import; inspect the created project",
          );
        if (options.animations)
          importGltfAnimations(b, parsedGltf, imported, options.scale);
        return true;
      },
    });
    codec.plugin = "gltf_importer";
    restore = () => {
      active = false;
      codec.delete();
    };
  }
  return { sync, dispose: () => restore?.() };
}
