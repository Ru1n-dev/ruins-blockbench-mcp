import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { installMolangBounce } from "./molang-bounce.ts";
const prefix = "'easings=1.0.0';";
export const easingNames = [
  "Sine",
  "Quad",
  "Cubic",
  "Quart",
  "Quint",
  "Expo",
  "Circ",
  "Bounce",
].flatMap((n) => ["in", "out", "inOut"].map((p) => p + n));
// Keep the pinned provider's expression format so its menu can recognize edits.
function variable(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  let n = Math.abs(hash ^ 0xcafebabe),
    out = "";
  do {
    out = "abcdefghijklmnopqrstuvwxyz"[n % 26] + out;
    n = Math.floor(n / 26);
  } while (n > 0);
  return "v.__e" + out;
}
export function easingExpression(animation: any, index: number) {
  if (!Number.isInteger(index) || !easingNames[index])
    throw new Fault("EASING_INPUT", "Unknown easing");
  const duration = animation.length;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Fault(
      "EASING_LENGTH",
      "Easing needs a positive finite animation length",
    );
  const v = variable(animation.name),
    original = variable(animation.name + "_orig");
  const func = easingNames[index]!.replace(
    /[A-Z]/g,
    (c) => "_" + c.toLowerCase(),
  );
  const advance =
    animation.loop === "loop"
      ? `${original}=(${original}??0)+q.delta_time;${original}>${duration}?{${original}=${original}-${duration};};`
      : `(${original}??0)>${duration}?{return${duration + 0.1};}:{${original}=(${original}??0)+q.delta_time;};`;
  return `${prefix}'i=${index}';q.anim_time==0?{${original}=0;};${advance}${v}=${original}/${duration};returnmath.ease_${func}(0,${duration},${v});`;
}
export function installEasings(b: BB) {
  let restore: (() => void) | undefined;
  const eligible = (a: any) =>
    typeof a.anim_time_update === "string" &&
    (a.anim_time_update.startsWith(prefix) ||
      (!a.anim_time_update && a.length > 0));
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "easings" || plugin.version !== "1.0.0") return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    const action = b.BarItems["easings.manage_easings"],
      apply = b.BarItems["easings.apply_easing"];
    if (!action || !apply) return;
    const original = action.onClick,
      children = apply.children;
    const restoreMolang = installMolangBounce(b.Animator.MolangParser);
    let dialog: any;
    const safeChildren = function (this: any, ...args: any[]) {
      const items = children.apply(this, args),
        animation = b.Animation.selected;
      return animation &&
        Number.isFinite(animation.length) &&
        animation.length > 0
        ? items
        : items.filter((i: any) => i.name === "None");
    };
    apply.children = safeChildren;
    const click = () => {
      dialog?.hide();
      const project = b.Project,
        animations = b.Animation.all.filter(eligible);
      const options = Object.fromEntries(
        ["None", ...easingNames].map((n, i) => [i, n]),
      );
      const form: any = {};
      for (const a of animations) {
        const match =
          a.anim_time_update.startsWith(prefix) &&
          a.anim_time_update.slice(prefix.length).match(/'i=(\d+)'/);
        const current = match ? Number(match[1]) + 1 : 0;
        form[a.uuid] = {
          type: "select",
          label: a.name,
          options:
            a.length > 0 && Number.isFinite(a.length) ? options : { 0: "None" },
          value: options[current] && a.length > 0 ? current : 0,
        };
      }
      form.buttonBar = {
        type: "buttons",
        buttons: ["Reset All"],
        click: () =>
          dialog.setFormValues(
            Object.fromEntries(animations.map((a: any) => [a.uuid, 0])),
            true,
          ),
      };
      dialog = new b.Dialog("easings", {
        title: "Easings",
        form,
        onConfirm: (values: any) => {
          if (
            b.Project !== project ||
            animations.some(
              (a: any) => !b.Animation.all.includes(a) || !eligible(a),
            )
          )
            throw new Fault("STALE_DIALOG", "Animation targets changed");
          const changes = animations
            .map((a: any) => ({
              a,
              value: Number(values[a.uuid])
                ? easingExpression(a, Number(values[a.uuid]) - 1)
                : "",
            }))
            .filter((c: any) => c.a.anim_time_update !== c.value);
          if (!changes.length) return;
          b.Undo.initEdit({ animations: changes.map((c: any) => c.a) });
          for (const { a, value } of changes) {
            a.anim_time_update = value;
            a.saved = false;
          }
          b.Undo.finishEdit("Apply Easing");
        },
      }).show();
    };
    action.onClick = click;
    restore = () => {
      restoreMolang();
      dialog?.hide();
      if (action.onClick === click) action.onClick = original;
      if (apply.children === safeChildren) apply.children = children;
    };
  }
  return { sync, dispose: () => restore?.() };
}
