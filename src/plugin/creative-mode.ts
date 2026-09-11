import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { isNativeFileScope } from "./native-files.ts";

export function placeCreativeCube(
  b: BB,
  sample: any,
  target: any,
  face: string,
) {
  const normals: any = {
    north: [0, 0, -1],
    south: [0, 0, 1],
    west: [-1, 0, 0],
    east: [1, 0, 0],
    up: [0, 1, 0],
    down: [0, -1, 0],
  };
  if (!normals[face]) throw new Fault("CREATIVE_FACE", "Unknown cube face");
  b.Project.model_3d.updateMatrixWorld(true);
  const T = b.THREE,
    box = new T.Box3().setFromBufferAttribute(
      target.mesh.geometry.attributes.position,
    ),
    center = box.getCenter(new T.Vector3()),
    normal = new T.Vector3(...normals[face]);
  for (let i = 0; i < 3; i++)
    if (normals[face][i])
      center.setComponent(
        i,
        normals[face][i] > 0
          ? box.max.getComponent(i)
          : box.min.getComponent(i),
      );
  center.applyMatrix4(target.mesh.matrixWorld);
  normal
    .applyMatrix3(new T.Matrix3().getNormalMatrix(target.mesh.matrixWorld))
    .normalize();
  const sourceBox = new T.Box3().setFromBufferAttribute(
      sample.mesh.geometry.attributes.position,
    ),
    corners: any[] = [];
  for (const x of [sourceBox.min.x, sourceBox.max.x])
    for (const y of [sourceBox.min.y, sourceBox.max.y])
      for (const z of [sourceBox.min.z, sourceBox.max.z])
        corners.push(
          new T.Vector3(x, y, z).applyMatrix4(sample.mesh.matrixWorld),
        );
  const sourceCenter = corners
      .reduce((sum, p) => sum.add(p), new T.Vector3())
      .multiplyScalar(1 / 8),
    radius = -Math.min(
      ...corners.map((p) => p.clone().sub(sourceCenter).dot(normal)),
    );
  const delta = center.sub(sourceCenter).addScaledVector(normal, radius),
    parent = sample.mesh.parent;
  if (Math.abs(parent.matrixWorld.determinant()) < 1e-10)
    throw new Fault(
      "CREATIVE_TRANSFORM",
      "Sample parent transform is singular",
    );
  const localDelta = delta
    .clone()
    .applyMatrix3(
      new T.Matrix3().setFromMatrix4(parent.matrixWorld.clone().invert()),
    )
    .toArray();
  if (!localDelta.every(Number.isFinite))
    throw new Fault("CREATIVE_TRANSFORM", "Placement transform is not finite");
  const created: any[] = [],
    existing = new Set(b.Cube.all);
  b.Undo.initEdit({ elements: created, outliner: true, selection: true });
  try {
    const copy = sample.duplicate();
    created.push(copy);
    for (const key of ["from", "to", "origin"])
      for (let i = 0; i < 3; i++) copy[key][i] += localDelta[i];
    b.Canvas.updateAll();
    b.Undo.finishEdit("Place creative cube", {
      elements: created,
      outliner: true,
      selection: true,
    });
    return copy;
  } catch (error) {
    created.splice(
      0,
      created.length,
      ...b.Cube.all.filter((c: any) => !existing.has(c)),
    );
    b.Undo.cancelEdit(true);
    throw error;
  }
}

export function installCreativeMode(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const wrapped = function (this: any, ...args: any[]) {
    if (this.id !== "creative_mode" || this.version !== "1.0.0")
      return load.apply(this, args);
    const animate = b.animate,
      hadAnimate = Object.hasOwn(b, "animate"),
      settings = new Set(Object.values(b.settings)),
      keys = new Set(b.Keybinds.actions),
      body = new Set(document.body.children),
      listeners: any[] = [],
      subscriptions: any[] = [];
    const add = EventTarget.prototype.addEventListener,
      on = b.Blockbench.on;
    EventTarget.prototype.addEventListener = function (
      type: any,
      fn: any,
      options: any,
    ) {
      if (this === document || this === window)
        listeners.push({ target: this, type, fn, options });
      return add.call(this, type, fn, options);
    };
    b.Blockbench.on = function (...args: any[]) {
      const result = on.apply(this, args);
      subscriptions.push(result);
      return result;
    };
    // 5.1 renders through render_frame; the provider's window.animate hook is obsolete.
    b.animate = () => {};
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      EventTarget.prototype.addEventListener = add;
      b.Blockbench.on = on;
    }
    const nativeAnimate = b.animate,
      tool = b.BarItems.creative_tool,
      select = tool.onSelect,
      unselect = tool.onUnselect;
    if (hadAnimate) b.animate = animate;
    else delete b.animate;
    subscriptions.push(
      on.call(b.Blockbench, "render_frame", () => {
        if (
          b.Toolbox.selected === tool &&
          !b.Dialog.open &&
          !b.getFocusedTextInput()
        )
          nativeAnimate();
      }),
    );
    const condition = tool.condition;
    tool.condition = () => !!b.Project && b.Condition(condition);
    const ownedSettings = Object.values(b.settings).filter(
        (s) => !settings.has(s),
      ),
      ownedKeys = b.Keybinds.actions.filter((k: any) => !keys.has(k));
    const canvas = [...document.body.children].find(
      (e) => !body.has(e) && e.tagName === "CANVAS",
    ) as HTMLCanvasElement;
    let sample: any,
      owner: any,
      active = true,
      virtual = false,
      zoom: any[] = [],
      distance = 16;
    const crosshair = () => {
      if (!canvas || b.Toolbox.selected !== tool) return;
      const r = b.Preview.selected.canvas.getBoundingClientRect();
      canvas.width = r.width;
      canvas.height = r.height;
      canvas.style.left = r.x + "px";
      canvas.style.top = r.y + "px";
      const ctx = canvas.getContext("2d")!;
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.width / 2 - 10, r.height / 2);
      ctx.lineTo(r.width / 2 + 10, r.height / 2);
      ctx.moveTo(r.width / 2, r.height / 2 - 10);
      ctx.lineTo(r.width / 2, r.height / 2 + 10);
      ctx.stroke();
    };
    tool.onSelect = function (...args: any[]) {
      owner = b.Project;
      sample = b.Cube.selected[0];
      virtual = isNativeFileScope(b);
      zoom = b.Preview.all.map((p: any) => [p, p.controls.enableZoom]);
      distance = b.Preview.selected.camera.position.distanceTo(
        b.Preview.selected.controls.target,
      );
      const request = HTMLCanvasElement.prototype.requestPointerLock;
      if (virtual)
        HTMLCanvasElement.prototype.requestPointerLock = () =>
          Promise.resolve();
      try {
        return select.apply(this, args);
      } finally {
        HTMLCanvasElement.prototype.requestPointerLock = request;
        crosshair();
      }
    };
    tool.onUnselect = function (...args: any[]) {
      try {
        return unselect.apply(this, args);
      } finally {
        for (const [p, value] of zoom) p.controls.enableZoom = value;
        const p = b.Preview.selected;
        if (p) {
          p.controls.target
            .copy(p.camera.position)
            .addScaledVector(
              p.camera.getWorldDirection(new b.THREE.Vector3()),
              distance,
            );
          p.controls.update();
        }
        sample = undefined;
        owner = undefined;
        virtual = false;
      }
    };
    // Replace the provider's geometry handlers, retaining its navigation controls.
    for (const listener of listeners)
      if (
        listener.target === document &&
        ["mousedown", "mouseup", "mousemove"].includes(listener.type)
      ) {
        listener.target.removeEventListener(
          listener.type,
          listener.fn,
          listener.options,
        );
        if (listener.type === "mousemove") {
          const move = (event: any) => {
            if (b.Toolbox.selected !== tool) return;
            const p = b.Preview.selected;
            if (!virtual || p.node.contains(event.target)) listener.fn(event);
          };
          document.addEventListener("mousemove", move);
          subscriptions.push({
            delete: () => document.removeEventListener("mousemove", move),
          });
        }
      }
    const down = (event: MouseEvent) => {
      if (!active || b.Toolbox.selected !== tool || b.Project !== owner) return;
      const p = b.Preview.selected;
      if (virtual && !p.node.contains(event.target)) return;
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = p.canvas.getBoundingClientRect(),
        hit = p.raycast({
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
        });
      if (!hit?.element) return;
      if (!(hit.element instanceof b.Cube)) {
        b.Blockbench.showQuickMessage("Meshes are not supported", 2000);
        return;
      }
      if (event.button === 2) {
        if (!sample || !b.Cube.all.includes(sample)) {
          b.Blockbench.showQuickMessage(
            "Select a sample cube before entering Creative Mode",
            2000,
          );
          return;
        }
        placeCreativeCube(b, sample, hit.element, hit.face);
      } else {
        const target = hit.element;
        b.Undo.initEdit({
          elements: [target],
          outliner: true,
          selection: true,
        });
        try {
          target.remove();
          b.Canvas.updateAll();
          b.Undo.finishEdit("Remove creative cube", {
            elements: [],
            outliner: true,
            selection: true,
          });
          if (sample === target) sample = undefined;
        } catch (e) {
          b.Undo.cancelEdit(true);
          throw e;
        }
      }
    };
    const up = (event: MouseEvent) => {
      if (
        b.Toolbox.selected === tool &&
        b.Preview.selected.node.contains(event.target) &&
        event.button === 2
      ) {
        event.preventDefault();
        event.stopPropagation();
        b.Menu.open?.hide();
      }
    };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("mouseup", up, true);
    document.addEventListener("contextmenu", up, true);
    window.addEventListener("resize", crosshair);
    subscriptions.push(
      on.call(b.Blockbench, "select_project", () => {
        if (owner && b.Project !== owner && b.Toolbox.selected === tool)
          b.BarItems.move_tool.select();
      }),
    );
    this.onunload = () => {
      if (!active) return;
      if (b.Toolbox.selected === tool) b.BarItems.move_tool.select();
      active = false;
      for (const listener of listeners)
        listener.target.removeEventListener(
          listener.type,
          listener.fn,
          listener.options,
        );
      for (const sub of subscriptions) sub?.delete?.();
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("mouseup", up, true);
      document.removeEventListener("contextmenu", up, true);
      window.removeEventListener("resize", crosshair);
      if (b.animate === nativeAnimate) b.animate = animate;
      canvas?.remove();
      for (const setting of ownedSettings as any[]) setting.delete();
      for (const key of ownedKeys) key.delete();
      tool.delete();
    };
    return result;
  };
  proto.runOnLoad = wrapped;
  return () => {
    if (proto.runOnLoad === wrapped) proto.runOnLoad = load;
  };
}
