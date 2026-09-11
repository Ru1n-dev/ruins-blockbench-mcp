import type { BB } from "./adapter.ts";
export function installPlaneGizmo(b: BB) {
  const unloads = new WeakMap<object, any>();
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "translation_plane_gizmo" || this.version !== "1.0.1")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    let active = true,
      dragSave: any,
      dragProject: any;
    const timers = new Set<any>(),
      intervals = new Set<any>(),
      frames = new Set<any>(),
      bindings: any[] = [];
    const timeout = b.setTimeout.bind(b),
      interval = b.setInterval.bind(b),
      raf = b.requestAnimationFrame.bind(b);
    function scope<T>(run: () => T): T | undefined {
      if (!active) return;
      const doc = b.document,
        docAdd = Object.getOwnPropertyDescriptor(
          b.document,
          "addEventListener",
        ),
        docRemove = Object.getOwnPropertyDescriptor(
          b.document,
          "removeEventListener",
        ),
        query = doc.querySelector,
        byId = doc.getElementById,
        eventProto = b.EventTarget.prototype,
        add = eventProto.addEventListener,
        remove = eventProto.removeEventListener;
      const move = b.moveElementsInSpace;
      b.moveElementsInSpace = function (...args: any[]) {
        if (active) return move.apply(this, args);
      };
      const setTimeout = b.setTimeout,
        setInterval = b.setInterval,
        requestAnimationFrame = b.requestAnimationFrame,
        raycast = b.THREE.Raycaster.prototype.intersectObjects;
      // The provider assumes a single full-size canvas and raycasts invisible handles.
      doc.querySelector = function (selector: string) {
        return ["canvas", "#preview canvas"].includes(selector)
          ? (b.Preview.selected?.canvas ?? query.call(this, selector))
          : query.call(this, selector);
      };
      doc.getElementById = function (id: string) {
        return id === "preview"
          ? (b.Preview.selected?.canvas ?? byId.call(this, id))
          : byId.call(this, id);
      };
      b.THREE.Raycaster.prototype.intersectObjects = function (
        objects: any[],
        ...args: any[]
      ) {
        return raycast.call(
          this,
          objects.filter((o) => !o.userData?.isPlaneGizmo || o.visible),
          ...args,
        );
      };
      b.setTimeout = function (callback: any, ms: number, ...args: any[]) {
        const id = timeout(() => {
          timers.delete(id);
          scope(() => callback(...args));
        }, ms);
        timers.add(id);
        return id;
      };
      b.setInterval = function (callback: any, ms: number, ...args: any[]) {
        const id = interval(() => scope(() => callback(...args)), ms);
        intervals.add(id);
        return id;
      };
      b.requestAnimationFrame = function (callback: any) {
        const id = raf((time: number) => {
          frames.delete(id);
          scope(() => callback(time));
        });
        frames.add(id);
        return id;
      };
      eventProto.addEventListener = function (
        type: string,
        callback: any,
        options: any,
      ) {
        const capture =
          typeof options === "boolean" ? options : !!options?.capture;
        let record = bindings.find(
          (r) =>
            r.target === this &&
            r.type === type &&
            r.callback === callback &&
            r.capture === capture,
        );
        if (!record) {
          record = { target: this, type, callback, options, capture };
          record.wrapped = (event: any) =>
            scope(() => {
              const before = b.Undo.current_save;
              const result =
                typeof callback === "function"
                  ? callback.call(this, event)
                  : callback.handleEvent(event);
              if (
                callback.name === "onMouseDown" &&
                b.Undo.current_save &&
                b.Undo.current_save !== before
              ) {
                dragSave = b.Undo.current_save;
                dragProject = b.Project;
              }
              if (callback.name === "onMouseUp") {
                dragSave = undefined;
                dragProject = undefined;
              }
              return result;
            });
          bindings.push(record);
        }
        return add.call(this, type, record.wrapped, options);
      };
      eventProto.removeEventListener = function (
        type: string,
        callback: any,
        options: any,
      ) {
        const capture =
          typeof options === "boolean" ? options : !!options?.capture;
        const record = bindings.find(
          (r) =>
            r.target === this &&
            r.type === type &&
            r.callback === callback &&
            r.capture === capture,
        );
        return remove.call(this, type, record?.wrapped ?? callback, options);
      };
      doc.addEventListener = eventProto.addEventListener;
      doc.removeEventListener = eventProto.removeEventListener;
      try {
        return run();
      } finally {
        doc.querySelector = query;
        doc.getElementById = byId;
        eventProto.addEventListener = add;
        eventProto.removeEventListener = remove;
        if (docAdd) Object.defineProperty(doc, "addEventListener", docAdd);
        else delete doc.addEventListener;
        if (docRemove)
          Object.defineProperty(doc, "removeEventListener", docRemove);
        else delete doc.removeEventListener;
        b.setTimeout = setTimeout;
        b.setInterval = setInterval;
        b.requestAnimationFrame = requestAnimationFrame;
        b.THREE.Raycaster.prototype.intersectObjects = raycast;
        b.moveElementsInSpace = move;
      }
    }
    const result = scope(() => load.apply(this, args)),
      action = b.BarItems.plane_gizmo_toggle,
      click = action.click,
      unload = unloads.get(this);
    action.click = function (...args: any[]) {
      return scope(() => click.apply(this, args));
    };
    this.onunload = function (...args: any[]) {
      if (!active) return;
      try {
        if (
          dragSave &&
          dragProject === b.Project &&
          b.Undo.current_save === dragSave
        ) {
          const finish = b.Undo.finishEdit;
          b.Undo.finishEdit = () => {};
          try {
            scope(() =>
              bindings
                .find((r) => r.callback.name === "onMouseUp")
                ?.callback({ button: 0 }),
            );
          } finally {
            b.Undo.finishEdit = finish;
            b.Undo.cancelEdit(true);
            dragSave = undefined;
            dragProject = undefined;
          }
        }
        return scope(() => unload.apply(this, args));
      } finally {
        active = false;
        for (const id of timers) b.clearTimeout(id);
        for (const id of intervals) b.clearInterval(id);
        for (const id of frames) b.cancelAnimationFrame(id);
        for (const r of bindings)
          r.target.removeEventListener(r.type, r.wrapped, r.options);
        action.delete();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
