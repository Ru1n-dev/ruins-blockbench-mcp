import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function installJavaSequence(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "java_block_sequencer" || this.version !== "1.0.0")
      return load.apply(this, args);
    const codec = b.Codecs.java_block,
      codecFormat = codec.format;
    const globals = Object.fromEntries(
      ["export_anim_action", "export_model_action", "import_model_action"].map(
        (k) => [k, Object.getOwnPropertyDescriptor(b, k)],
      ),
    );
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      codec.format = codecFormat;
      for (const [key, d] of Object.entries(globals)) {
        if (d) Object.defineProperty(b, key, d);
        else delete b[key];
      }
    }
    const action = b.BarItems.export_java_block_sequence,
      click = action.click,
      format = b.Formats.java_block_sequence;
    const actions = [
      "export_java_block_sequence",
      "export_blockmodel",
      "import_java_block_model",
    ].map((id) => b.BarItems[id]);
    let active = true,
      dialog: any;
    action.condition = () =>
      b.Format === format && b.Modes.animate && !!b.Animation.selected;
    action.click = function (this: any, ...args: any[]) {
      const result = click.apply(this, args);
      dialog = b.Dialog.open;
      dialog.onConfirm = function (data: any) {
        const { length, fps } = data,
          count = Math.floor(length * fps) + 1;
        if (
          !Number.isFinite(length) ||
          length < 0 ||
          !Number.isInteger(fps) ||
          fps < 1 ||
          count > 1000
        )
          throw new Fault(
            "JAVA_SEQUENCE_LIMIT",
            "Use finite length, integer FPS, and at most 1000 frames",
          );
        const adapter = new Adapter(b),
          project = b.Project,
          ui = adapter.uiState(),
          send = b.Blockbench.export,
          name = b.Animation.selected.name;
        const animators = new Map<any, Set<string>>(
          b.Animation.all.map((a: any) => [
            a,
            new Set(Object.keys(a.animators)),
          ]),
        );
        const textureFrames = new Map<any, number>(
          b.Texture.all.map((t: any) => [t, t.currentFrame]),
        );
        const cubes: any[] = [];
        const visit = (nodes: any[]) => {
          for (const n of nodes) {
            if (n instanceof b.Group) visit(n.children);
            else if (
              n instanceof b.Cube &&
              n.export !== false &&
              Object.values(n.faces).some((f: any) => f.texture !== null)
            )
              cubes.push(n);
          }
        };
        visit(b.Outliner.root);
        const run = async () => {
          const zip = new b.JSZip();
          let bytes = 0;
          b.Timeline.pause();
          try {
            for (let frame = 0; frame < count; frame++) {
              b.Timeline.setTime(frame / fps);
              b.Animator.preview();
              project.model_3d.updateMatrixWorld(true);
              const inverse = project.model_3d.matrixWorld.clone().invert();
              const model = codec.compile({
                raw: true,
                prevent_dialog: true,
                groups: false,
              });
              if ((model.elements ?? []).length !== cubes.length)
                throw new Fault(
                  "JAVA_SEQUENCE_GEOMETRY",
                  "Java codec changed the expected Cube list",
                );
              for (let i = 0; i < cubes.length; i++) {
                const cube = cubes[i],
                  mesh = cube.mesh,
                  matrix = inverse.clone().multiply(mesh.matrixWorld),
                  position = new b.THREE.Vector3(),
                  rotation = new b.THREE.Quaternion(),
                  scale = new b.THREE.Vector3();
                matrix.decompose(position, rotation, scale);
                const rebuilt = new b.THREE.Matrix4().compose(
                  position,
                  rotation,
                  scale,
                );
                if (
                  [
                    ...position.toArray(),
                    ...rotation.toArray(),
                    ...scale.toArray(),
                  ].some((v) => !Number.isFinite(v)) ||
                  scale.toArray().some((v: number) => v <= 1e-8) ||
                  matrix.elements.some(
                    (v: number, j: number) =>
                      Math.abs(v - rebuilt.elements[j]) > 1e-5,
                  )
                )
                  throw new Fault(
                    "JAVA_SEQUENCE_TRANSFORM",
                    "Java cuboids cannot encode a sheared, reflected, or singular animation transform",
                  );
                mesh.geometry.computeBoundingBox();
                const bounds = mesh.geometry.boundingBox,
                  element = model.elements[i];
                element.from = bounds.min
                  .clone()
                  .multiply(scale)
                  .add(position)
                  .toArray();
                element.to = bounds.max
                  .clone()
                  .multiply(scale)
                  .add(position)
                  .toArray();
                const euler = new b.THREE.Euler().setFromQuaternion(
                  rotation,
                  b.Format.euler_order || "ZYX",
                );
                element.rotation = {
                  x: b.THREE.MathUtils.radToDeg(euler.x),
                  y: b.THREE.MathUtils.radToDeg(euler.y),
                  z: b.THREE.MathUtils.radToDeg(euler.z),
                  origin: position.toArray(),
                };
              }
              delete model.groups;
              const text = JSON.stringify(model);
              bytes += text.length * 2;
              if (bytes > 32000000)
                throw new Fault(
                  "JAVA_SEQUENCE_LIMIT",
                  "Sequence JSON exceeds 32 MB",
                );
              zip.file(`${frame}.json`, text);
            }
          } finally {
            if (b.Project === project) {
              for (const [t, frame] of textureFrames) t.currentFrame = frame;
              b.TextureAnimator.update(
                [...textureFrames.keys()].filter((t) => t.frameCount > 1),
              );
              adapter.restoreUI(ui);
              for (const [a, ids] of animators)
                for (const [id, animator] of Object.entries(a.animators) as [
                  string,
                  any,
                ][])
                  if (!ids.has(id) && !animator.keyframes.length)
                    a.removeAnimator(id);
              if (ui.timelinePlaying) b.Timeline.start();
            }
          }
          const fingerprint = adapter.fingerprint(),
            content = await zip.generateAsync({
              type: "uint8array",
              compression: "DEFLATE",
            });
          if (
            !active ||
            b.Project !== project ||
            adapter.fingerprint() !== fingerprint
          )
            throw new Fault(
              "JAVA_SEQUENCE_CHANGED",
              "Project or plugin changed while generating ZIP",
            );
          send({
            resource_id: "model",
            type: "Zip Archive",
            extensions: ["zip"],
            name,
            content,
            savetype: "zip",
          });
        };
        this.hide();
        const task = run();
        task.catch((e: any) => b.Blockbench.showQuickMessage(e.message, 6000));
        return task;
      };
      return result;
    };
    // Native unload deletes the shared Java codec, then calls an undefined action.
    this.onunload = function () {
      if (!active) return;
      active = false;
      for (const action of actions) action?.delete();
      if (b.Formats.java_block_sequence === format) format.delete();
      if (dialog && b.Dialog.open === dialog) dialog.hide();
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
