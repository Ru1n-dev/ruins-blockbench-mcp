import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function contactSpeed(
  samples: Array<{ time: number; points: Record<string, number[]> }>,
  floor: number,
) {
  const contacts = new Map<string, { time: number; position: number[] }>();
  const speeds: number[] = [];
  for (const sample of samples)
    for (const [id, p] of Object.entries(sample.points)) {
      const previous = contacts.get(id);
      if (p[1] < floor) {
        if (!previous) contacts.set(id, { time: sample.time, position: p });
      } else if (previous) {
        const duration = sample.time - previous.time;
        if (duration > 0)
          speeds.push(
            Math.hypot(
              p[0] - previous.position[0],
              p[2] - previous.position[2],
            ) / duration,
          );
        contacts.delete(id);
      }
    }
  return {
    speed: speeds.length
      ? speeds.reduce((a, b) => a + b, 0) / speeds.length
      : 0,
    segments: speeds.length,
  };
}
export function installRootMotion(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const cache = new WeakMap<object, any>(),
    states = new Map<any, any>(),
    nativeUnloads = new WeakMap<object, any>();
  let generation = 0;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "root_motion_extractor" || this.version !== "1.1.0")
      return load.apply(this, args);
    if (nativeUnloads.has(this)) this.onunload = nativeUnloads.get(this);
    const before = new Set(b.Blockbench.events.select_mode ?? []);
    const result = load.apply(this, args);
    const action = b.BarItems.root_motion_extractor ?? cache.get(this);
    cache.set(this, action);
    b.BarItems.root_motion_extractor = action;
    if (!b.Keybinds.actions.includes(action)) b.Keybinds.actions.push(action);
    const state: any = {
      listeners: (b.Blockbench.events.select_mode ?? []).filter(
        (fn: any) => !before.has(fn),
      ),
      original: action.click,
      action,
    };
    states.set(this, state);
    nativeUnloads.set(this, this.onunload);
    this.onunload = function (this: any, ...values: any[]) {
      return unloaded.call(this, ...values);
    };
    action.click = function (this: any, ...values: any[]) {
      const animation = b.Animation.selected;
      if (!animation || b.Modes.selected.id !== "animate")
        throw new Fault(
          "ANIMATION_REQUIRED",
          "Select an animation in Animate mode before extracting root motion",
        );
      const children = new Set(b.scene.children);
      const result = state.original.apply(this, values);
      state.plane = b.scene.children.find((child: any) => !children.has(child));
      const dialog = b.Dialog.open;
      state.dialog = dialog;
      if (dialog?.id === "extractor_dialog")
        dialog.onConfirm = function (this: any, { floorHeight }: any) {
          const adapter = new Adapter(b),
            project = b.Project,
            ui = adapter.uiState(),
            runGeneration = generation;
          const length = animation.length,
            fps = Math.max(1, animation.snapping || 24),
            count = Math.ceil(length * fps) + 1;
          if (
            !Number.isFinite(length) ||
            length <= 0 ||
            !Number.isFinite(fps) ||
            count > 4096
          )
            throw new Fault(
              "MOTION_LIMIT",
              "Root motion requires a positive length and at most 4096 sampled frames",
            );
          if (!Number.isFinite(floorHeight))
            throw new Fault("MOTION_NUMBER", "Floor height must be finite");
          state.plane?.removeFromParent();
          this.hide();
          const fingerprint = adapter.fingerprint();
          const task = (async () => {
            const samples: Array<{
              time: number;
              points: Record<string, number[]>;
            }> = [];
            const animators = new Map<any, Set<string>>(
              b.Animation.all.map((a: any) => [
                a,
                new Set(Object.keys(a.animators)),
              ]),
            );
            b.Timeline.pause();
            try {
              for (let frame = 0; frame < count; frame++) {
                if (
                  generation !== runGeneration ||
                  b.Project !== project ||
                  b.Animation.selected !== animation ||
                  b.Modes.selected.id !== "animate" ||
                  adapter.fingerprint() !== fingerprint
                )
                  throw new Fault(
                    "MOTION_CHANGED",
                    "Model, animation or plugin changed during sampling",
                  );
                const time = Math.min(length, frame / fps);
                b.Timeline.setTime(time);
                b.Animator.preview();
                const points: Record<string, number[]> = {};
                for (const element of b.Outliner.elements) {
                  if (element instanceof b.Cube)
                    element
                      .getGlobalVertexPositions()
                      .forEach(
                        (p: number[], i: number) =>
                          (points[`${element.uuid}:${i}`] = p),
                      );
                  else if (element instanceof b.Mesh) {
                    element.mesh.updateWorldMatrix(true, false);
                    for (const [id, p] of Object.entries(element.vertices) as [
                      string,
                      number[],
                    ][])
                      points[`${element.uuid}:${id}`] = new b.THREE.Vector3(
                        ...p,
                      )
                        .applyMatrix4(element.mesh.matrixWorld)
                        .toArray();
                  }
                }
                if (!Object.values(points).flat().every(Number.isFinite))
                  throw new Fault(
                    "MOTION_NUMBER",
                    "Animation produced a non-finite vertex",
                  );
                samples.push({ time, points });
                if (Object.keys(points).length * count > 1000000)
                  throw new Fault(
                    "MOTION_LIMIT",
                    "Root motion exceeds one million sampled vertices",
                  );
                if (frame % 32 === 31)
                  await new Promise((resolve) => setTimeout(resolve, 0));
              }
            } finally {
              if (
                b.Project === project &&
                b.Animation.selected === animation &&
                b.Modes.selected.id === ui.mode
              ) {
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
            if (
              generation !== runGeneration ||
              b.Project !== project ||
              b.Animation.selected !== animation ||
              adapter.fingerprint() !== fingerprint ||
              b.Dialog.open
            )
              throw new Fault(
                "MOTION_CHANGED",
                "Editor changed during root motion extraction",
              );
            const { speed, segments } = contactSpeed(samples, floorHeight),
              meters = speed / 16;
            state.stats = new b.Dialog({
              id: "stats_dialog",
              title: "Root Motion Statistics",
              lines: [
                `<p>Average speed (pixels/s): ${speed.toFixed(5)}</p>`,
                `<p>Average speed (m/s): ${meters.toFixed(5)}</p>`,
                `<p>Movement Component Speed: ${(meters ? Math.sqrt(meters) / 6.6 : 0).toFixed(5)}</p>`,
                `<p>Animation Time Factor: ${speed ? `divide by ${(speed / 2).toFixed(5)} or multiply by ${(2 / speed).toFixed(5)}` : "N/A (no motion)"}</p>`,
                `<p>Completed contact segments: ${segments}; sampled frames: ${samples.length}</p>`,
              ],
            }).show();
          })();
          task.catch((error: any) =>
            b.Blockbench.showQuickMessage(error.message, 6000),
          );
          return task;
        };
      return result;
    };
    return result;
  };
  const unloaded = function (this: any, ...args: any[]) {
    const state = states.get(this);
    if (!state) return;
    const nativeUnload = nativeUnloads.get(this),
      nextLoad = this.onload;
    this.onload = function (this: any, ...values: any[]) {
      this.onunload = nativeUnload;
      this.onload = nextLoad;
      return nextLoad.apply(this, values);
    };
    generation++;
    const remove = b.Blockbench.removeListener;
    b.Blockbench.removeListener = function (
      this: any,
      event: string,
      callback: any,
      ...values: any[]
    ) {
      if (event === "select_mode" && !callback) return;
      return remove.call(this, event, callback, ...values);
    };
    try {
      return nativeUnload.apply(this, args);
    } finally {
      b.Blockbench.removeListener = remove;
      states.delete(this);
      state.action.click = state.original;
      for (const listener of state.listeners)
        remove.call(b.Blockbench, "select_mode", listener);
      if (state.plane) {
        state.plane.removeFromParent();
        state.plane.geometry.dispose();
        state.plane.material.dispose();
      }
      for (const dialog of [state.dialog, state.stats])
        if (dialog && b.Dialog.open === dialog) dialog.hide();
    }
  };
  proto.runOnLoad = loaded;
  return () => {
    generation++;
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
    for (const state of states.values()) {
      state.action.click = state.original;
      state.plane?.removeFromParent();
      for (const dialog of [state.dialog, state.stats])
        if (dialog && b.Dialog.open === dialog) dialog.hide();
    }
  };
}
