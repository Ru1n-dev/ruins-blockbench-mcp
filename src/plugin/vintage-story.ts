import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

// Vintage Story ShapeElement.GetLocalTransformMatrix version 0 is
// T(pivot) R(XYZ) S T(from + animationOffset - pivot).
export function installVintageStory(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "vintagestory_models" || this.version !== "1.0.0")
      return load.apply(this, args);
    const result = load.apply(this, args),
      action = b.BarItems.exportVsModel;
    let active = true;
    const dialogs = new Set<any>();
    action.condition = () =>
      !!b.Project && !["image", "skin"].includes(b.Format.id);
    action.click = () => {
      const owner = b.Project;
      const dialog = new b.Dialog({
        id: "pbmc_vintage_story_export",
        title: "Export Vintage Story Model",
        form: {
          domain: { label: "Asset domain", type: "text", value: "game" },
          folder: { label: "Texture folder", type: "text", value: "block" },
          animations: {
            label: "Bake animations at 30 FPS",
            type: "checkbox",
            value: true,
          },
          archive: {
            label: "Include PNG textures in asset ZIP",
            type: "checkbox",
            value: false,
          },
        },
        async onConfirm(data: any) {
          const send = b.Blockbench.export;
          if (!active || b.Project !== owner)
            throw new Fault("VS_CHANGED", "Project or plugin changed");
          if (
            !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(data.domain) ||
            !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(data.folder) ||
            data.folder.length > 160
          )
            throw new Fault(
              "VS_ASSET_PATH",
              "Use a lowercase asset domain and relative texture folder",
            );
          const adapter = new Adapter(b),
            ui = adapter.uiState();
          const objects: any[] = [];
          const visit = (nodes: any[]) => {
            for (const n of nodes) {
              if (n.export === false) continue;
              if (!(n instanceof b.Group) && !(n instanceof b.Cube))
                throw new Fault(
                  "VS_NODE",
                  "Vintage Story shapes require Groups and Cubes",
                );
              objects.push(n);
              if (n instanceof b.Group) visit(n.children);
            }
          };
          visit(b.Outliner.root);
          if (!objects.length || objects.length > 2000)
            throw new Fault("VS_SIZE", "Export 1–2000 Groups and Cubes");
          const animations = data.animations ? [...b.Animation.all] : [];
          if (
            animations.some((a: any) =>
              Object.values(a.animators).some(
                (ba: any) => ba.type === "effect" && ba.keyframes.length,
              ),
            )
          )
            throw new Fault(
              "VS_EFFECT",
              "Sound, particle and timeline effects need a Vintage Story game integration",
            );
          const counts = animations.map(
            (a: any) =>
              Math.floor(
                Math.max(
                  a.length,
                  ...Object.values(a.animators).flatMap((ba: any) =>
                    ba.keyframes.map((k: any) => k.time),
                  ),
                  0,
                ) * 30,
              ) + 1,
          );
          if (
            counts.some((n: number) => !Number.isFinite(n) || n > 1000) ||
            counts.reduce((a: number, n: number) => a + n, 0) * objects.length >
              100000
          )
            throw new Fault(
              "VS_SIZE",
              "Use at most 1000 frames per animation and 100000 element frames",
            );
          const textureFrames = new Map<any, number>(
            b.Texture.all.map((t: any) => [t, t.currentFrame]),
          );
          const animatorIDs = new Map<any, Set<string>>(
            b.Animation.all.map((a: any) => [
              a,
              new Set(Object.keys(a.animators)),
            ]),
          );
          const transforms = objects.map((n) => ({
            mesh: n.mesh,
            position: n.mesh.position.clone(),
            quaternion: n.mesh.quaternion.clone(),
            scale: n.mesh.scale.clone(),
          }));
          const slug = (s: string) =>
            s
              .toLowerCase()
              .replace(/[^a-z0-9_-]+/g, "_")
              .replace(/^_+|_+$/g, "")
              .slice(0, 64) || "model";
          const model: any = {
            textureWidth: owner.texture_width,
            textureHeight: owner.texture_height,
            textures: {},
            textureSizes: {},
            elements: [],
            animations: [],
          };
          const textures = new Map<any, { key: string; path: string }>();
          const pngs = new Map<string, string>();
          for (const [i, t] of b.Texture.all.entries()) {
            const key = `t${i}`,
              assetPath = `${data.folder}/${slug(t.name.replace(/\.png$/i, ""))}_${i}`;
            textures.set(t, { key, path: assetPath });
            model.textures[key] = `${data.domain}:${assetPath}`;
            model.textureSizes[key] = [
              t.uv_width || owner.texture_width,
              t.uv_height || owner.texture_height,
            ];
            if (data.archive) {
              const url = t.getDataURL();
              if (!url.startsWith("data:image/png;base64,"))
                throw new Fault("VS_TEXTURE", "Textures must decode to PNG");
              pngs.set(
                `assets/${data.domain}/textures/${assetPath}.png`,
                url.slice(url.indexOf(",") + 1),
              );
            }
          }
          const entries = new Map<any, any>(),
            names = new Map<any, string>();
          objects.forEach((n, i) => names.set(n, `${slug(n.name)}_${i}`));
          const center = b.Format.id === "java_block" ? 0 : 8;
          const finite = (values: number[]) => {
            if (values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e7))
              throw new Fault(
                "VS_TRANSFORM",
                "Shape transform is non-finite or out of range",
              );
            return values;
          };
          const rotation = (mesh: any) => {
            const e = new b.THREE.Euler().setFromQuaternion(
              mesh.quaternion,
              "XYZ",
            );
            return finite(
              [e.x, e.y, e.z].map((v) => b.THREE.MathUtils.radToDeg(v)),
            );
          };
          b.Timeline.pause();
          try {
            b.Animator.showDefaultPose();
            for (const n of objects) {
              const mesh = n.mesh,
                parent = entries.get(n.parent),
                p = finite(mesh.position.toArray());
              if (!parent) {
                p[0] += center;
                p[2] += center;
              }
              const r = rotation(mesh),
                s = finite(mesh.scale.toArray());
              if (s.some((v) => v <= 1e-8))
                throw new Fault("VS_TRANSFORM", "Shape scale must be positive");
              const e: any = {
                name: names.get(n),
                from: p,
                to: [...p],
                rotationOrigin: [...p],
                rotationX: r[0],
                rotationY: r[1],
                rotationZ: r[2],
                scaleX: s[0],
                scaleY: s[1],
                scaleZ: s[2],
                faces: {},
                children: [],
              };
              entries.set(n, e);
              (parent ? parent.children : model.elements).push(e);
              if (n instanceof b.Cube) {
                mesh.geometry.computeBoundingBox();
                const box = mesh.geometry.boundingBox,
                  faces: any = {};
                for (const [side, face] of Object.entries(n.faces) as [
                  string,
                  any,
                ][]) {
                  if (face.texture === null) continue;
                  const tex = textures.get(face.getTexture());
                  if (!tex)
                    throw new Fault(
                      "VS_TEXTURE",
                      `Assign a texture to ${n.name} ${side}`,
                    );
                  faces[side] = {
                    texture: `#${tex.key}`,
                    uv: finite([...face.uv]),
                    autoUv: false,
                    rotation: face.rotation || 0,
                  };
                }
                e.children.push({
                  name: `${e.name}_geometry`,
                  from: finite(box.min.toArray()),
                  to: finite(box.max.toArray()),
                  faces,
                });
              }
            }
            for (const [index, animation] of animations.entries()) {
              b.Modes.options.animate.select();
              animation.select();
              for (const a of b.Animation.all) a.playing = a === animation;
              const out: any = {
                name: animation.name,
                code: `${slug(animation.name)}_${index}`,
                version: 0,
                quantityframes: counts[index],
                onActivityStopped: "EaseOut",
                onAnimationEnd:
                  animation.loop === "hold"
                    ? "Hold"
                    : animation.loop === "once"
                      ? "Stop"
                      : "Repeat",
                keyframes: [],
              };
              const previous = new Map<any, number[]>();
              for (let frame = 0; frame < counts[index]; frame++) {
                b.Timeline.setTime(frame / 30);
                b.Animator.preview();
                const elements: any = {};
                for (const n of objects) {
                  const e = entries.get(n),
                    mesh = n.mesh,
                    r = rotation(mesh),
                    last = previous.get(n),
                    scale = finite(mesh.scale.toArray());
                  if (scale.some((v) => v <= 1e-8))
                    throw new Fault(
                      "VS_TRANSFORM",
                      "Animated scale must be positive",
                    );
                  if (last)
                    r.forEach(
                      (v, i) =>
                        (r[i] = v + 360 * Math.round((last[i] - v) / 360)),
                    );
                  previous.set(n, [...r]);
                  const delta = mesh.position.clone();
                  if (!entries.has(n.parent)) {
                    delta.x += center;
                    delta.z += center;
                  }
                  delta
                    .sub(new b.THREE.Vector3(...e.from))
                    .applyQuaternion(mesh.quaternion.clone().invert())
                    .divide(mesh.scale);
                  const offset = finite(delta.toArray()),
                    pose: any = {};
                  for (const [i, axis] of ["X", "Y", "Z"].entries()) {
                    pose[`rotation${axis}`] = r[i] - e[`rotation${axis}`];
                    pose[`stretch${axis}`] = scale[i] / e[`scale${axis}`];
                    pose[`offset${axis}`] = offset[i];
                  }
                  elements[e.name] = pose;
                }
                out.keyframes.push({ frame, elements });
              }
              model.animations.push(out);
            }
          } finally {
            adapter.restoreUI(ui);
            for (const t of transforms) {
              t.mesh.position.copy(t.position);
              t.mesh.quaternion.copy(t.quaternion);
              t.mesh.scale.copy(t.scale);
              t.mesh.updateMatrixWorld(true);
            }
            for (const [t, frame] of textureFrames) t.currentFrame = frame;
            b.TextureAnimator.update(
              [...textureFrames.keys()].filter((t) => t.frameCount > 1),
            );
            for (const [a, ids] of animatorIDs)
              for (const [id, animator] of Object.entries(a.animators) as [
                string,
                any,
              ][])
                if (!ids.has(id) && !animator.keyframes.length)
                  a.removeAnimator(id);
            if (ui.timelinePlaying) b.Timeline.start();
          }
          const text = JSON.stringify(model, null, 2),
            name = slug(owner.name);
          if (
            text.length * 2 +
              [...pngs.values()].reduce((n, s) => n + s.length, 0) >
            32000000
          )
            throw new Fault("VS_SIZE", "Asset export exceeds 32 MB");
          const fingerprint = adapter.fingerprint();
          let content: any = text;
          if (data.archive) {
            const zip = new b.JSZip();
            zip.file(`assets/${data.domain}/shapes/${name}.json`, text);
            for (const [file, png] of pngs)
              zip.file(file, png, { base64: true });
            content = await zip.generateAsync({
              type: "uint8array",
              compression: "DEFLATE",
            });
          }
          if (
            !active ||
            b.Project !== owner ||
            adapter.fingerprint() !== fingerprint
          )
            throw new Fault(
              "VS_CHANGED",
              "Project or plugin changed during export",
            );
          send({
            type: "Vintage Story Model",
            extensions: [data.archive ? "zip" : "json"],
            name,
            content,
            savetype: data.archive ? "zip" : "json",
          });
          dialog.hide();
        },
      });
      dialogs.add(dialog);
      dialog.show();
    };
    this.onunload = () => {
      if (!active) return;
      active = false;
      action.delete();
      for (const d of dialogs) {
        if (b.Dialog.stack.includes(d)) d.hide();
        d.delete();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
