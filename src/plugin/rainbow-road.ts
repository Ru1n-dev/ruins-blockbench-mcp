import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
export function installRainbowRoad(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    records = new WeakMap<any, any>();
  const wrapped = function (this: any, ...args: any[]) {
    if (this.id !== "rainbow_road_game" || this.version !== "0.1.1")
      return load.apply(this, args);
    let record = records.get(this);
    if (!record) {
      record = { keys: [], loop: null };
      records.set(this, record);
    }
    const addCSS = b.Blockbench.addCSS;
    const styles: any[] = [];
    b.Blockbench.addCSS = function (...args: any[]) {
      const s = addCSS.apply(this, args);
      styles.push(s);
      return s;
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      b.Blockbench.addCSS = addCSS;
    }
    const controls = document.getElementById("rainbow_game_controls")!,
      buttons = [...controls.children] as HTMLElement[];
    const nativeStart: any = buttons[0].onclick!,
      nativeStop: any = buttons[1].onclick!;
    const timeouts = new Set<any>(),
      intervals = new Set<any>();
    let owner: any,
      snapshot: any,
      scene: any,
      active = true,
      stopping = false;
    const scope = (run: () => any): any => {
      const st = b.setTimeout,
        si = b.setInterval,
        ae = document.addEventListener;
      b.setTimeout = function (fn: any, ms: any, ...args: any[]) {
        let id: any;
        id = st(() => {
          timeouts.delete(id);
          if (active && owner) {
            scope(() => fn(...args));
            if (scene && !scene.parent) stop();
          }
        }, ms);
        timeouts.add(id);
        return id;
      };
      b.setInterval = function (fn: any, ms: any, ...args: any[]) {
        if (Math.abs(ms - 1000 / 30) < 1 && !record.loop)
          record.loop = { fn, ms, args };
        const id = si(() => {
          if (active && owner) scope(() => fn(...args));
        }, ms);
        intervals.add(id);
        return id;
      };
      document.addEventListener = function (
        this: Document,
        type: any,
        fn: any,
        options: any,
      ) {
        if (type === "keydown" || type === "keyup")
          record.keys.push({ type, fn, options });
        return ae.call(this, type, fn, options);
      } as any;
      try {
        return run();
      } finally {
        b.setTimeout = st;
        b.setInterval = si;
        document.addEventListener = ae;
      }
    };
    const transform = (object: any) => ({
      object,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    });
    const restore = (s: any) => {
      s.object.position.copy(s.position);
      s.object.quaternion.copy(s.quaternion);
      s.object.scale.copy(s.scale);
      s.object.updateMatrixWorld(true);
    };
    const clear = () => {
      for (const id of timeouts) b.clearTimeout(id);
      for (const id of intervals) b.clearInterval(id);
      timeouts.clear();
      intervals.clear();
      for (const k of record.keys)
        if (k.type === "keyup")
          for (const key of ["w", "a", "s", "d"])
            k.fn(new KeyboardEvent("keyup", { key }));
    };
    const stop = () => {
      if (stopping || !owner) return;
      stopping = true;
      clear();
      const current = b.Project;
      try {
        if (current !== owner && b.ModelProject.all.includes(owner))
          owner.select();
        if (b.Project === owner)
          nativeStop.call(buttons[1], new MouseEvent("click"));
        b.Canvas.scene.remove(scene);
        for (const t of snapshot.transforms) restore(t);
        b.three_grid.visible = snapshot.grid;
        // loadAnglePreset changes only this preview's projection, cameras and target.
        const p = snapshot.preview;
        p.setProjectionMode(snapshot.ortho);
        for (const t of snapshot.cameras) {
          restore(t);
          t.object.zoom = t.zoom;
          t.object.fov = t.fov;
          t.object.updateProjectionMatrix();
        }
        p.controls.target.copy(snapshot.target);
        p.controls.update();
      } finally {
        owner = undefined;
        if (
          current &&
          current !== b.Project &&
          b.ModelProject.all.includes(current)
        )
          current.select();
        stopping = false;
      }
    };
    const start = () => {
      if (!active || !b.Project)
        throw new Fault(
          "RAINBOW_PROJECT",
          "Open a model before starting the race",
        );
      stop();
      const size = b.calculateVisibleBox()[0];
      if (!Number.isFinite(size) || size <= 0)
        throw new Fault(
          "RAINBOW_SIZE",
          "Model must have nonzero visible bounds",
        );
      owner = b.Project;
      const p = b.Preview.selected;
      snapshot = {
        grid: b.three_grid.visible,
        transforms: [
          owner.model_3d,
          ...b.Group.all.map((g: any) => g.mesh).filter(Boolean),
        ].map(transform),
        preview: p,
        ortho: p.isOrtho,
        cameras: [p.camPers, p.camOrtho].map((c) => ({
          ...transform(c),
          zoom: c.zoom,
          fov: c.fov,
        })),
        target: p.controls.target.clone(),
      };
      const add = b.Canvas.scene.add;
      b.Canvas.scene.add = function (object: any, ...rest: any[]) {
        scene = object;
        return add.call(this, object, ...rest);
      };
      try {
        for (const k of record.keys)
          document.addEventListener(k.type, k.fn, k.options);
        scope(() => nativeStart.call(buttons[0], new MouseEvent("click")));
        if (!intervals.size && record.loop)
          scope(() =>
            b.setInterval(record.loop.fn, record.loop.ms, ...record.loop.args),
          );
      } catch (error) {
        stop();
        throw error;
      } finally {
        b.Canvas.scene.add = add;
      }
    };
    buttons[0].onclick = start;
    buttons[1].onclick = stop;
    const actions = [
      new b.Action("pbmc_rainbow_start", {
        name: "Start Rainbow Road",
        icon: "play_arrow",
        click: start,
      }),
      new b.Action("pbmc_rainbow_stop", {
        name: "Stop Rainbow Road",
        icon: "stop",
        click: stop,
      }),
    ];
    const selected = b.Blockbench.on("select_project", () => {
      if (owner && b.Project !== owner) stop();
    });
    this.onunload = () => {
      if (!active) return;
      stop();
      active = false;
      clear();
      selected.delete();
      for (const k of record.keys)
        document.removeEventListener(k.type, k.fn, k.options);
      const resources = new Set<any>();
      scene?.traverse((o: any) => {
        if (o.geometry) resources.add(o.geometry);
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material])
          if (material) resources.add(material);
      });
      for (const r of resources) r.dispose();
      controls.remove();
      for (const s of styles) s.delete();
      b.BarItems.rainbow_road_highscore?.delete();
      for (const a of actions) a.delete();
    };
    return result;
  };
  proto.runOnLoad = wrapped;
  return () => {
    if (proto.runOnLoad === wrapped) proto.runOnLoad = load;
  };
}
