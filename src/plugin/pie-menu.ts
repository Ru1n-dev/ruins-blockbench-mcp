import type { BB } from "./adapter.ts";
export function installPieMenu(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const wrapped = function (this: any, ...args: any[]) {
    if (this.id !== "pie_menu" || this.version !== "1.0.0")
      return load.apply(this, args);
    const Pie = b.PieMenu,
      pp = Pie.prototype;
    const originals = Object.fromEntries(
      ["fromAction", "actionConditionMetAt", "buildAction", "unTrigger"].map(
        (k) => [k, pp[k]],
      ),
    );
    const actionsBefore = new Set(b.Keybinds.actions);
    pp.fromAction = function (action: any, menu: any = {}) {
      return originals.fromAction.call(this, action || { children: [] }, menu);
    };
    pp.actionConditionMetAt = function (index: number) {
      const action = this.getActionAt(index);
      return !!action && b.Condition(action.condition);
    };
    pp.unTrigger = function (index?: number | boolean) {
      if (typeof index !== "number") {
        const angle =
          (this.angleToCursor() - Math.PI + Pie.QUARTER_PI / 2 + Pie.TWO_PI) %
          Pie.TWO_PI;
        index = this.actionIndexFromAngle(angle);
      }
      const item = this.getActionAt(index);
      this.hide();
      if (!item || !b.Condition(item.condition)) return;
      const event =
        Pie.mouseEvent || new MouseEvent("click", { bubbles: true });
      if (item instanceof b.Action) item.trigger(event);
      else if (typeof item.click === "function") item.click(event);
      else if (typeof item.select === "function") item.select();
      if (item.children) this.showActionMenuOf(item);
    };
    pp.buildAction = function (action: any, index: number) {
      const node = originals.buildAction.call(this, action, index);
      node.attr("role", "menuitem");
      node.attr("aria-label", b.tl(action.name) + " " + index);
      node.attr("data-pie-index", String(index));
      node.on("click", (event: any) => {
        event.stopPropagation();
        this.unTrigger(index);
      });
      return node;
    };
    Pie.initCSS();
    for (const [event, key] of [
      ["keyup", "onkeyup"],
      ["click", "onclick"],
      ["mousemove", "onmousemove"],
    ]) {
      document.removeEventListener(event, Pie[key]);
      document.addEventListener(event, Pie[key]);
    }
    const result = load.apply(this, args),
      unload = this.onunload;
    const aliases = Object.values(Pie.all).map(
      (pie: any) =>
        new b.Action("pbmc_open_" + pie.id, {
          name: pie.name,
          icon: "pie_chart",
          condition: () => !!b.Project && b.Condition(pie.condition),
          click() {
            pie.cache.isHold = false;
            pie.show(window.innerWidth / 2, window.innerHeight / 2);
          },
        }),
    );
    const ownedActions = b.Keybinds.actions.filter(
      (a: any) => !actionsBefore.has(a),
    );
    let active = true;
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      active = false;
      Pie.active?.hide();
      try {
        return unload.apply(this, values);
      } finally {
        for (const a of aliases) a.delete();
        for (const a of ownedActions)
          if (b.Keybinds.actions.includes(a)) a.delete();
        for (const [event, key] of [
          ["keyup", "onkeyup"],
          ["click", "onclick"],
          ["mousemove", "onmousemove"],
        ])
          document.removeEventListener(event, Pie[key]);
        document.getElementById("pieMenuStyles")?.remove();
        for (const [key, value] of Object.entries(originals)) pp[key] = value;
        this.onunload = unload;
      }
    };
    return result;
  };
  proto.runOnLoad = wrapped;
  return () => {
    if (proto.runOnLoad === wrapped) proto.runOnLoad = load;
  };
}
