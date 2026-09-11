import type { BB } from "./adapter.ts";
export function installWorkspaces(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "workspaces" || this.version !== "1.0.0")
      return load.apply(this, args);
    const NativeDialog = b.Dialog,
      on = b.Blockbench.on;
    let workspaces: any[],
      active = true;
    const dialogs = new Set<any>();
    b.Dialog = new Proxy(NativeDialog, {
      construct(target, args, newTarget) {
        const options = args[0];
        if (options?.id === "workspaces") {
          workspaces = options.component.data.workspaces;
          for (const method of ["addWorkspace", "editWorkspace"]) {
            const original = options.component.methods[method];
            options.component.methods[method] = function (
              this: any,
              ...values: any[]
            ) {
              const result = original.apply(this, values),
                dialog = b.Dialog.open,
                confirm = dialog?.onConfirm,
                oldName = values[0]?.currentTarget?.dataset?.name;
              if (method === "editWorkspace") dialog.cancelIndex = -1;
              dialogs.add(dialog);
              if (confirm)
                dialog.onConfirm = function (data: any) {
                  const name =
                    typeof data.name === "string" ? data.name.trim() : "";
                  if (
                    (method === "addWorkspace" && !name) ||
                    (name &&
                      (/[\\/*?"<>|]/.test(name) ||
                        workspaces.some(
                          (w) => w.name === name && w.name !== oldName,
                        )))
                  ) {
                    b.Blockbench.showQuickMessage(
                      "Enter a unique workspace name without unsupported characters",
                      3000,
                    );
                    return false;
                  }
                  data.name = name;
                  return confirm.call(this, data);
                };
              return result;
            };
          }
        }
        const instance = Reflect.construct(target, args, newTarget);
        dialogs.add(instance);
        return instance;
      },
    });
    b.Blockbench.on = function (event: string, callback: any) {
      if (
        event === "update_recent_project_thumbnail" &&
        callback.name === "recentThumbnails"
      )
        return { delete() {} };
      return on.call(this, event, callback);
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      b.Dialog = NativeDialog;
      b.Blockbench.on = on;
    }
    let restoreIteration: (() => void) | undefined;
    const thumbnail = () => {
      restoreIteration?.();
      const list = b.recent_projects,
        descriptor = Object.getOwnPropertyDescriptor(list, "forEach"),
        original = list.forEach;
      const wrapped = function (this: any, callback: any, thisArg: any) {
        const source = String(callback);
        const iterable =
          active && source.includes("hashCode") && source.includes("safePush")
            ? [
                ...list,
                ...workspaces
                  .filter((w) => !w.active)
                  .flatMap((w) => w.projects),
              ]
            : this;
        return original.call(iterable, callback, thisArg);
      };
      Object.defineProperty(list, "forEach", {
        configurable: true,
        writable: true,
        value: wrapped,
      });
      const restore = () => {
        if (list.forEach === wrapped) {
          if (descriptor) Object.defineProperty(list, "forEach", descriptor);
          else delete list.forEach;
        }
        if (restoreIteration === restore) restoreIteration = undefined;
      };
      restoreIteration = restore;
      queueMicrotask(restore);
    };
    const sub = on.call(
        b.Blockbench,
        "update_recent_project_thumbnail",
        thumbnail,
      ),
      unload = this.onunload;
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      active = false;
      restoreIteration?.();
      sub.delete();
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onunload = unload;
        this.onload = next;
        return next.apply(this, args);
      };
      try {
        return unload.apply(this, values);
      } finally {
        for (const dialog of dialogs) dialog.delete();
        dialogs.clear();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
