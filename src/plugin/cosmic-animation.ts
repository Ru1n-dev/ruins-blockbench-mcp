import { z } from "zod";
import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
const vector = z.tuple([z.number(), z.number(), z.number()]);
const point = z.union([
  vector,
  z
    .object({
      pre: vector.optional(),
      post: vector.optional(),
      lerp_mode: z.enum(["linear", "catmullrom"]).optional(),
    })
    .refine((v) => v.pre || v.post, "A key needs pre or post values"),
]);
const channel = z.union([vector, z.record(z.string(), point)]);
const schema = z.object({
  animations: z.record(
    z.string(),
    z.object({
      loop: z.boolean().default(false),
      animation_length: z.number().nonnegative(),
      bones: z.record(
        z.string(),
        z.object({
          position: channel.optional(),
          rotation: channel.optional(),
          scale: channel.optional(),
        }),
      ),
    }),
  ),
});
export function cosmicAnimationData(input: any) {
  const result = schema.safeParse(
    typeof input === "string" ? JSON.parse(input) : input,
  );
  if (!result.success)
    throw new Fault(
      "COSMIC_ANIMATION",
      result.error.issues
        .map((i) => i.path.join(".") + ": " + i.message)
        .slice(0, 4)
        .join("; "),
    );
  for (const a of Object.values(result.data.animations))
    for (const bone of Object.values(a.bones))
      for (const channel of Object.values(bone))
        if (channel && !Array.isArray(channel)) {
          const seen = new Set<number>();
          for (const key of Object.keys(channel)) {
            const time = Number(key);
            if (
              !key.trim() ||
              !Number.isFinite(time) ||
              time < 0 ||
              seen.has(time)
            )
              throw new Fault(
                "COSMIC_TIME",
                "Key times must be unique finite nonnegative numbers",
              );
            seen.add(time);
          }
        }
  return result.data;
}
export function installCosmicAnimation(
  b: BB,
  codec: any,
  isActive: () => boolean,
) {
  codec.compile = () => {
    const animations: any = Object.create(null);
    for (const a of b.Animation.all) {
      if (Object.hasOwn(animations, a.name))
        throw new Fault("COSMIC_NAME", "Animation names must be unique");
      if (a.loop === "hold")
        throw new Fault(
          "COSMIC_LOOP",
          "This codec does not yet support hold-on-last-frame loops",
        );
      const bones: any = Object.create(null);
      for (const animator of Object.values(a.animators) as any[]) {
        if (animator.type !== "bone") continue;
        const bone: any = {};
        for (const channel of ["position", "rotation", "scale"]) {
          const keys = animator[channel]
            ?.slice()
            .sort((a: any, c: any) => a.time - c.time);
          if (!keys?.length) continue;
          const numeric = (p: any) => {
            const v = ["x", "y", "z"].map((axis) => Number(p[axis]));
            if (!v.every(Number.isFinite))
              throw new Fault(
                "COSMIC_EXPRESSION",
                "Numeric animation values are required",
              );
            return v;
          };
          const frames: any = Object.create(null);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key.interpolation === "bezier")
              throw new Fault(
                "COSMIC_CURVE",
                "Bezier handle conversion has not been implemented",
              );
            if (Object.hasOwn(frames, key.time))
              throw new Fault(
                "COSMIC_TIME",
                "Only one key per channel and time is supported",
              );
            const post = numeric(key.data_points.at(-1));
            const pre =
              key.data_points.length > 1
                ? numeric(key.data_points[0])
                : i > 0 && keys[i - 1].interpolation === "step"
                  ? numeric(keys[i - 1].data_points.at(-1))
                  : undefined;
            frames[key.time] =
              pre || key.interpolation === "catmullrom"
                ? {
                    ...(pre ? { pre } : {}),
                    post,
                    ...(key.interpolation === "catmullrom"
                      ? { lerp_mode: "catmullrom" }
                      : {}),
                  }
                : post;
          }
          bone[channel] =
            keys.length === 1 && keys[0].time === 0 && Array.isArray(frames[0])
              ? frames[0]
              : frames;
        }
        if (Object.keys(bone).length) {
          if (Object.hasOwn(bones, animator.name))
            throw new Fault(
              "COSMIC_NAME",
              "Animated bone names must be unique",
            );
          bones[animator.name] = bone;
        }
      }
      animations[a.name] = {
        loop: a.loop === "loop",
        animation_length: a.length,
        bones,
      };
    }
    const result = { animations };
    cosmicAnimationData(result);
    return JSON.stringify(result, null, 2);
  };
  codec.parse = (input: any) => {
    const data = cosmicAnimationData(input),
      groups = new Map<string, any>();
    for (const g of b.Group.all) {
      if (groups.has(g.name))
        throw new Fault("COSMIC_NAME", "Group names must be unique");
      groups.set(g.name, g);
    }
    for (const a of Object.values(data.animations))
      for (const name of Object.keys(a.bones))
        if (!groups.has(name))
          throw new Fault("COSMIC_BONE", "Animation refers to a missing group");
    const animations: any[] = [];
    b.Undo.initEdit({ animations, selection: true });
    try {
      for (const [name, a] of Object.entries(data.animations)) {
        const animation = new b.Animation({
          name,
          length: a.animation_length,
          loop: a.loop ? "loop" : "once",
        }).add();
        animations.push(animation);
        for (const [name, bone] of Object.entries(a.bones)) {
          const animator = animation.getBoneAnimator(groups.get(name));
          for (const [channel, values] of Object.entries(bone))
            if (values) {
              const frames = Array.isArray(values) ? { "0": values } : values;
              for (const [time, value] of Object.entries(frames)) {
                const frame: any = Array.isArray(value)
                  ? { post: value }
                  : value;
                const points = [frame.pre, frame.post]
                  .filter(Boolean)
                  .map((v) => ({ x: v[0], y: v[1], z: v[2] }));
                animator.addKeyframe({
                  channel,
                  time: Number(time),
                  interpolation: frame.lerp_mode || "linear",
                  data_points: points,
                });
              }
            }
        }
      }
      b.updateSelection();
      b.Undo.finishEdit("Import Cosmic Reach animation");
    } catch (error) {
      b.Undo.cancelEdit(true);
      throw error;
    }
  };
  codec.load = codec.parse;
  codec.export = () =>
    b.Blockbench.export({
      type: "Cosmic Reach animation",
      extensions: ["animation.json"],
      name: b.Project.name,
      content: codec.compile(),
      savetype: "text",
    });
  b.BarItems.export_cosmic_reach_entity_animation.click = () => codec.export();
  b.BarItems.import_cosmic_reach_entity_animation.click = () => {
    const owner = b.Project;
    return b.Blockbench.import(
      {
        extensions: ["animation.json", "json"],
        type: "Cosmic Reach animation",
        readtype: "text",
      },
      (files: any[]) => {
        if (!isActive() || b.Project !== owner)
          throw new Fault(
            "STALE_STATE",
            "The animation import context changed",
          );
        if (files?.[0]) return codec.parse(files[0].content);
      },
    );
  };
}
