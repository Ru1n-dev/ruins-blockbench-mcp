import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { isNativeFileScope } from "./native-files.ts";

const directions = ["north", "south", "east", "west", "up", "down"];
const perspectives = [
  "thirdperson_righthand",
  "thirdperson_lefthand",
  "firstperson_righthand",
  "firstperson_lefthand",
  "gui",
  "head",
  "ground",
  "fixed",
];
const quote = (s: string) => JSON.stringify(s);
function float(n: number) {
  if (!Number.isFinite(n) || Math.abs(n) > 3.4028235e38)
    throw new Fault("DATAGEN_NUMBER", "Value exceeds Java float range");
  return `${n}F`;
}
const vector = (v: number[]) => {
  if (!Array.isArray(v) || v.length !== 3)
    throw new Fault("DATAGEN_VECTOR", "Expected three coordinates");
  return v.map(float).join(", ");
};
export function datagenFromModel(model: any): string {
  let text =
    "this.models()" +
    (model.parent
      ? `.withExistingParent("blockbench_export", ${quote(model.parent)})`
      : '.getBuilder("blockbench_export")');
  if (model.ambientocclusion === false) text += ".ao(false)";
  for (const [id, link] of Object.entries(model.textures ?? {}))
    text += `.texture(${quote(id)}, ${quote(String(link))})`;
  for (const element of model.elements ?? []) {
    text += `.element().from(${vector(element.from)}).to(${vector(element.to)})`;
    if (element.shade === false) text += ".shade(false)";
    if (element.light_emission)
      throw new Fault(
        "DATAGEN_LIGHT",
        "The pinned Forge builder does not support light emission",
      );
    if (element.rotation) {
      const r = element.rotation;
      if (
        !["x", "y", "z"].includes(r.axis) ||
        ![-45, -22.5, 0, 22.5, 45].includes(r.angle)
      )
        throw new Fault(
          "DATAGEN_ROTATION",
          "Legacy Forge requires a single axis and a supported 22.5 degree angle",
        );
      text += `.rotation().angle(${float(r.angle)}).axis(Axis.${r.axis.toUpperCase()}).origin(${vector(r.origin)})`;
      if (r.rescale) text += ".rescale(true)";
      text += ".end()";
    }
    for (const [direction, raw] of Object.entries(element.faces ?? {})) {
      const face = raw as any;
      if (!directions.includes(direction))
        throw new Fault("DATAGEN_FACE", "Unknown face direction");
      text += `.face(Direction.${direction.toUpperCase()})`;
      if (face.uv) {
        if (face.uv.length !== 4)
          throw new Fault("DATAGEN_UV", "Expected four UV coordinates");
        text += `.uvs(${face.uv.map(float).join(", ")})`;
      }
      if (face.rotation) {
        const name = (
          {
            90: "CLOCKWISE_90",
            180: "UPSIDE_DOWN",
            270: "COUNTERCLOCKWISE_90",
          } as Record<number, string>
        )[face.rotation];
        if (!name) throw new Fault("DATAGEN_UV", "Invalid UV rotation");
        text += `.rotation(FaceRotation.${name})`;
      }
      if (face.texture !== undefined)
        text += `.texture(${quote(face.texture)})`;
      if (face.cullface) {
        if (!directions.includes(face.cullface))
          throw new Fault("DATAGEN_FACE", "Unknown cull direction");
        text += `.cullface(Direction.${face.cullface.toUpperCase()})`;
      }
      if (face.tintindex !== undefined) {
        if (
          !Number.isSafeInteger(face.tintindex) ||
          face.tintindex < 0 ||
          face.tintindex > 2147483647
        )
          throw new Fault("DATAGEN_TINT", "Invalid tint index");
        text += `.tintindex(${face.tintindex})`;
      }
      text += ".end()";
    }
    text += ".end()";
  }
  if (model.gui_light === "front") text += ".guiLight(GuiLight.FRONT)";
  for (const [key, raw] of Object.entries(model.display ?? {})) {
    if (!perspectives.includes(key))
      throw new Fault("DATAGEN_DISPLAY", "Unsupported display slot");
    const transform = raw as any;
    text += `.transform(Perspective.${key
      .toUpperCase()
      .replace(/PERSON/g, "_PERSON")
      .replace(/HAND/g, "_HAND")})`;
    for (const field of ["rotation", "translation", "scale"])
      if (transform[field]) text += `.${field}(${vector(transform[field])})`;
    text += ".end()";
  }
  return text + ";";
}

export function installDatagen(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "datagen_export" || plugin.version !== "1.0.0") return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    const codec = b.Codecs.datagen,
      original = codec.compile,
      onUnload = plugin.onunload;
    const compile = function (this: any, options: any = {}) {
      if (b.Format.id !== "java_block")
        throw new Fault(
          "DATAGEN_FORMAT",
          "Datagen requires Java Block/Item format",
        );
      const model = b.Codecs.java_block.compile({
        ...options,
        raw: true,
        prevent_dialog: true,
        overrides: false,
        groups: false,
      });
      const text = datagenFromModel(model);
      this.dispatchEvent("compile", { model: text, options });
      return text;
    };
    const unload = () => {
      b.BarItems.export_datagen?.delete();
      codec.delete();
    };
    const action = b.BarItems.export_datagen,
      originalClick = action.onClick;
    const click = function (this: any, ...args: any[]) {
      if (!isNativeFileScope(b)) return originalClick.apply(this, args);
      b.Blockbench.export({
        type: codec.name,
        extensions: ["java"],
        name: codec.fileName(),
        content: codec.compile(),
      });
    };
    action.onClick = click;
    codec.compile = compile;
    // The original unload references an action scoped inside onload and throws.
    plugin.onunload = unload;
    restore = () => {
      if (action.onClick === click) action.onClick = originalClick;
      if (codec.compile === compile) codec.compile = original;
      if (plugin.onunload === unload) plugin.onunload = onUnload;
    };
  }
  return { sync, dispose: () => restore?.() };
}
