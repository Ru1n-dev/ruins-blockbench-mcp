import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
const slots = [
  "thirdperson_righthand",
  "thirdperson_lefthand",
  "firstperson_righthand",
  "firstperson_lefthand",
  "gui",
  "head",
  "ground",
  "fixed",
];
const copy = (value: any) => JSON.parse(JSON.stringify(value));
function vector(value: any, fallback: number[]) {
  const result = value ?? fallback;
  if (
    !Array.isArray(result) ||
    result.length !== 3 ||
    !result.every(Number.isFinite)
  )
    throw new Fault(
      "ITEM_ANIMATION_VECTOR",
      "Animation vectors must contain three finite numbers",
    );
  return result;
}
export function* itemAnimationFrames(start: any, end: any, count: number) {
  if (!Number.isInteger(count) || count < 3 || count > 1000)
    throw new Fault(
      "ITEM_ANIMATION_LIMIT",
      "Animation requires 3 to 1000 integer ticks",
    );
  const a = start.elements ?? [],
    z = end.elements ?? [];
  if (a.length !== z.length)
    throw new Fault(
      "ITEM_ANIMATION_TOPOLOGY",
      "Starting and ending models must have matching Cube counts and order",
    );
  const mix = (a: number[], z: number[], t: number) =>
    a.map((v, i) => v + (z[i] - v) * t);
  const bounds = a.map((element: any, i: number) => ({
    from: [vector(element.from, [0, 0, 0]), vector(z[i].from, [0, 0, 0])],
    to: [vector(element.to, [0, 0, 0]), vector(z[i].to, [0, 0, 0])],
  }));
  const displays = [
    ...new Set([
      ...slots,
      ...Object.keys(start.display ?? {}),
      ...Object.keys(end.display ?? {}),
    ]),
  ];
  for (let frame = 0; frame < count; frame++) {
    const t = frame / (count - 1),
      model = copy(start);
    model.display = {};
    if (model.elements)
      for (let i = 0; i < a.length; i++) {
        model.elements[i].from = mix(bounds[i].from[0], bounds[i].from[1], t);
        model.elements[i].to = mix(bounds[i].to[0], bounds[i].to[1], t);
      }
    for (const slot of displays) {
      const first = start.display?.[slot] ?? {},
        last = end.display?.[slot] ?? {},
        display = { ...copy(first) };
      for (const key of ["rotation", "translation", "scale"]) {
        const fallback = key === "scale" ? [1, 1, 1] : [0, 0, 0];
        display[key] = mix(
          vector(first[key], fallback),
          vector(last[key], fallback),
          t,
        );
      }
      if (slot.startsWith("firstperson_")) display.translation[1] += 10;
      model.display[slot] = display;
    }
    yield model;
  }
}
export function installItemAnimation(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "animator" || this.version !== "1.0.1")
      return load.apply(this, args);
    const priorTypes = Object.getOwnPropertyDescriptor(b, "types");
    const result = load.apply(this, args),
      save = b.BarItems.save_start,
      exportAction = b.BarItems.export_animation,
      saveClick = save.click,
      exportClick = exportAction.click,
      unload = this.onunload;
    if (priorTypes) Object.defineProperty(b, "types", priorTypes);
    else delete b.types;
    const starts = new Map<any, any>();
    let active = true,
      dialog: any;
    save.click = function (this: any, ...values: any[]) {
      const codec = b.Codecs.java_block,
        compile = codec.compile,
        project = b.Project;
      let captured: any;
      codec.compile = function (this: any, ...args: any[]) {
        const result = compile.apply(this, args);
        if (args[0]?.raw) captured = copy(result);
        return result;
      };
      let result;
      try {
        result = saveClick.apply(this, values);
      } finally {
        codec.compile = compile;
      }
      if (captured) starts.set(project, captured);
      return result;
    };
    exportAction.click = function (this: any, ...values: any[]) {
      const project = b.Project,
        start = starts.get(project);
      if (!start)
        throw new Fault(
          "ITEM_ANIMATION_START",
          "Save a starting model in this project first",
        );
      const result = exportClick.apply(this, values);
      dialog = b.Dialog.open;
      if (dialog?.id !== "generate_animation") return result;
      dialog.onConfirm = function (data: any) {
        const ticks = Number(data.ticks);
        if (!Number.isInteger(ticks) || ticks < 3 || ticks > 1000)
          throw new Fault(
            "ITEM_ANIMATION_LIMIT",
            "Animation requires 3 to 1000 integer ticks",
          );
        const end = b.Codecs.java_block.compile({ raw: true }),
          adapter = new Adapter(b),
          fingerprint = adapter.fingerprint(),
          send = b.Blockbench.export;
        const run = async () => {
          const zip = new b.JSZip(),
            overrides: any[] = [];
          let tick = "",
            bytes = 0,
            index = 0;
          for (const model of itemAnimationFrames(start, end, ticks)) {
            const text = JSON.stringify(model);
            bytes += text.length * 2;
            if (bytes > 32000000)
              throw new Fault(
                "ITEM_ANIMATION_LIMIT",
                "Animation JSON exceeds 32 MB",
              );
            zip.file(
              `resourcepack/assets/minecraft/models/item/model${index}.json`,
              text,
            );
            overrides.push({
              predicate: { custom_model_data: index + 1 },
              model: `item/model${index}`,
            });
            tick += `replaceitem entity @p[scores={animation=${index + 1}}] weapon.mainhand minecraft:knowledge_book{CustomModelData:${index + 1},AttributeModifiers:[{AttributeName:"generic.attackSpeed",Name:"generic.attackSpeed",Amount:-1000000,Operation:0,UUIDLeast:255057,UUIDMost:170750}]}\n`;
            index++;
          }
          for (const kind of ["resourcepack", "datapack"])
            zip.file(
              `${kind}/pack.mcmeta`,
              JSON.stringify({
                pack: {
                  pack_format: 5,
                  description: "Java Item Model Animator legacy animation",
                },
              }),
            );
          for (const name of ["load", "tick"])
            zip.file(
              `datapack/data/minecraft/tags/functions/${name}.json`,
              JSON.stringify({ replace: false, values: [`anim:${name}`] }),
            );
          zip.file(
            "datapack/data/anim/functions/load.mcfunction",
            "scoreboard objectives add animation dummy",
          );
          zip.file(
            "datapack/data/anim/functions/tick.mcfunction",
            tick + "scoreboard players add @a animation 1",
          );
          zip.file(
            "resourcepack/assets/minecraft/models/item/knowledge_book.json",
            JSON.stringify({
              parent: "item/generated",
              textures: { layer0: "item/knowledge_book" },
              overrides,
            }),
          );
          const content = await zip.generateAsync({
            type: "uint8array",
            compression: "DEFLATE",
          });
          if (
            !active ||
            b.Project !== project ||
            adapter.fingerprint() !== fingerprint
          )
            throw new Fault(
              "ITEM_ANIMATION_CHANGED",
              "Model or plugin changed while generating the archive",
            );
          send({
            type: "Zip Archive",
            extensions: ["zip"],
            name: "animation",
            content,
            savetype: "zip",
          });
        };
        this.hide();
        const task = run();
        task.catch((error: any) =>
          b.Blockbench.showQuickMessage(error.message, 6000),
        );
        return task;
      };
      return result;
    };
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      active = false;
      starts.clear();
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onunload = unload;
        this.onload = next;
        return next.apply(this, args);
      };
      try {
        return unload.apply(this, values);
      } finally {
        exportAction.delete();
        save.click = saveClick;
        exportAction.click = exportClick;
        if (dialog && b.Dialog.open === dialog) dialog.hide();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
