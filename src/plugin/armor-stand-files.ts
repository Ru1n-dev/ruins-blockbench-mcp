import { Fault } from "../shared/types.ts";
export type ArmorFrame = {
  position: number[];
  rotation: Record<string, number[]>;
};
export function armorStandFiles(
  config: any,
  frames: ArmorFrame[],
  loop: string,
  delay: number,
) {
  const ns = config.packName,
    tag = config.entityTag;
  if (
    typeof ns !== "string" ||
    !/^[a-z0-9_.-]{1,64}$/.test(ns) ||
    typeof tag !== "string" ||
    !/^[A-Za-z0-9_.+-]{1,128}$/.test(tag)
  )
    throw new Fault(
      "ARMOR_IDENTIFIER",
      "Use a valid namespace and a plain entity tag",
    );
  if (
    !["namespace", "data_pack"].includes(config.generationMode) ||
    !Number.isFinite(config.blockUnitScale) ||
    config.blockUnitScale < 0.015625 ||
    config.blockUnitScale > 16 ||
    !Number.isSafeInteger(delay) ||
    delay < 0 ||
    delay > 1000000 ||
    frames.length < 1 ||
    frames.length > 1000
  )
    throw new Fault(
      "ARMOR_LIMIT",
      "Invalid output mode, block scale, delay, or frame count (1–1000)",
    );
  const limbs = ["Head", "Body", "LeftArm", "RightArm", "LeftLeg", "RightLeg"];
  for (const frame of frames) {
    for (const v of [frame.position, ...Object.values(frame.rotation)])
      if (
        !Array.isArray(v) ||
        v.length !== 3 ||
        v.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000000)
      )
        throw new Fault(
          "ARMOR_VALUE",
          "Animation vectors must contain three finite bounded numbers",
        );
    if (
      Object.keys(frame.rotation).some(
        (k) => k !== "main" && !limbs.includes(k),
      )
    )
      throw new Fault("ARMOR_BONE", "Unknown armor stand limb");
  }
  // Stable, short objectives keep independent namespaces separate within the legacy 16-character limit.
  let hash = 2166136261;
  for (const c of ns) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const prefix = `as${(hash >>> 0).toString(16).padStart(8, "0")}`,
    timer = `${prefix}.t`,
    state = `${prefix}.s`;
  const root = `${config.generationMode === "data_pack" ? "data/" : ""}${ns}/functions/`;
  const files: Record<string, string> = {};
  const put = (name: string, lines: string[]) =>
    (files[`${root}${name}.mcfunction`] = lines.join("\n") + "\n");
  const num = (n: number) => String(Number(n.toFixed(8)));
  const move = (position: number[]) =>
    `teleport @s ${position.map((v) => `~${num(v * config.blockUnitScale)}`).join(" ")}`;
  const pose = (rotation: Record<string, number[]>) => {
    const parts: string[] = [],
      values = limbs
        .filter((k) => rotation[k])
        .map((k) => `${k}:[${rotation[k].map((v) => `${num(v)}f`).join(",")}]`);
    if (values.length) parts.push(`Pose:{${values.join(",")}}`);
    if (rotation.main) parts.push(`Rotation:[${num(rotation.main[1])}f,0f]`);
    return `data merge entity @s {${parts.join(",")}}`;
  };
  put("init", [
    `scoreboard objectives add ${timer} dummy`,
    `scoreboard objectives add ${state} dummy`,
  ]);
  put("create", [
    `summon minecraft:armor_stand ~ ~ ~ {Tags:["${tag}"],NoBasePlate:1b,ShowArms:1b,Pose:{${limbs.map((k) => `${k}:[0f,0f,0f]`).join(",")}}`,
  ]);
  put("stop", [`scoreboard players set @s ${state} 0`]);
  if (config.playbackControl) {
    put("pause", [
      `execute if score @s ${state} matches 1 run scoreboard players set @s ${state} 2`,
      `execute if score @s ${state} matches 3 run scoreboard players set @s ${state} 4`,
    ]);
    put("resume", [
      `execute if score @s ${state} matches 2 run scoreboard players set @s ${state} 1`,
      `execute if score @s ${state} matches 4 run scoreboard players set @s ${state} 3`,
    ]);
  }
  put("tick", [
    `execute as @e[type=minecraft:armor_stand,tag=${tag},scores={${state}=1}] at @s run function ${ns}:step`,
  ]);
  put("step", [
    `scoreboard players add @s ${timer} 1`,
    ...frames.map(
      (_, i) =>
        `execute if score @s ${timer} matches ${i} run function ${ns}:frames/${i}`,
    ),
  ]);
  put("start", [
    `scoreboard players set @s ${state} 1`,
    `scoreboard players set @s ${timer} ${delay ? -delay : 0}`,
    ...(delay ? [] : [`function ${ns}:frames/0`]),
  ]);
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i],
      previous = i ? frames[i - 1].position : [0, 0, 0];
    const commands = [
      move(frame.position.map((v, j) => v - previous[j])),
      pose(frame.rotation),
    ];
    if (i === frames.length - 1) {
      // Keep the final pose for one tick before restarting, including single-frame loops.
      commands.push(
        `scoreboard players set @s ${state} ${loop === "loop" ? 3 : 0}`,
      );
    }
    put(`frames/${i}`, commands);
  }
  if (loop === "loop") {
    put("restart", [
      move(frames.at(-1)!.position.map((v) => -v)),
      `scoreboard players set @s ${timer} -1`,
      `scoreboard players set @s ${state} 1`,
    ]);
    // Restart before stepping so the final pose remains visible until the next game tick.
    files[`${root}tick.mcfunction`] =
      `execute as @e[type=minecraft:armor_stand,tag=${tag},scores={${state}=3}] at @s run function ${ns}:restart\n` +
      files[`${root}tick.mcfunction`];
  }
  if (config.generationMode === "data_pack") {
    files["pack.mcmeta"] = JSON.stringify({
      pack: { pack_format: 7, description: `Armor Stand Animation: ${ns}` },
    });
    for (const event of ["load", "tick"])
      files[`data/minecraft/tags/functions/${event}.json`] = JSON.stringify({
        values: [`${ns}:${event === "load" ? "init" : "tick"}`],
      });
  }
  files["README.txt"] =
    `Legacy pack format 7. Run ${ns}:init on load and ${ns}:tick every tick (tags included in complete packs).\nExecute ${ns}:start/stop${config.playbackControl ? "/pause/resume" : ""} as the tagged armor stand, at its position. ${ns}:create summons one.\nFrames are sampled at 20 game ticks per second. Playback holds the final pose; looping returns root displacement to its starting point.\nNamespace ${ns} owns objectives ${timer} and ${state}; use a distinct namespace for each animation. Starting again treats the entity's current position as its new origin.\n`;
  return files;
}
