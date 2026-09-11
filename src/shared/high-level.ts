import { z } from "zod";
import { operationSchema, pixelEditSchema, querySchema, v3 } from "./schema.ts";
import { effectKeyframeSchema } from "./effect-keyframe.ts";
import { canonicalOperationSummary } from "./workflow-core.ts";

const id = z.string().min(1).max(160);
const name = z.string().min(1).max(160);
const nativeRegistrationKind = z.enum([
  "Action", "Tool", "Toggle", "SharedActionHandler", "Dialog", "BarSelect",
  "NumSlider", "BarSlider", "BarText", "ColorPicker", "Menu", "Setting",
  "Keybind", "Panel", "Preview", "Mode", "NodeType", "Property", "Codec",
  "ModelFormat", "ModelLoader",
]);
const nativeTaskArguments = z
  .record(z.string().min(1).max(80), z.unknown())
  .default({})
  .refine((value) => Object.keys(value).length <= 64, "At most 64 native arguments are allowed");
const nativeOperationSpec = z.object({
  registration_kind: nativeRegistrationKind,
  native_id: id.optional(),
  registration_key: z.string().min(1).max(240).optional(),
  operation: z.enum(["inspect", "dispatch", "trigger", "set", "edit", "open", "select", "close", "create"]).default("inspect"),
  arguments: nativeTaskArguments,
}).strict().refine((value) => !!value.native_id || !!value.registration_key, "native operation requires native_id or registration_key");
const v2 = z.tuple([
  z.number().finite().min(-100000).max(100000),
  z.number().finite().min(-100000).max(100000),
]);
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "Use #RRGGBB or #RRGGBBAA");

const assetSpec = z
  .object({
    filename: z.string().min(1).max(200),
    sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  })
  .strict();

const textureGroupSpec = z
  .object({
    name,
    ref: name.optional(),
    is_material: z.boolean().default(false),
    color_value: z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]).optional(),
    mer_value: z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]).optional(),
    subsurface_value: z.number().finite().min(0).max(255).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.color_value || value.mer_value || value.subsurface_value) && !value.ref)
      ctx.addIssue({ code: "custom", message: "ref is required when texture group values are specified", path: ["ref"] });
  });

const operations = z.array(operationSchema).min(1).max(500);
const parent = z.string().min(1).max(160).nullable().optional();

const groupPart = z
  .object({
    type: z.literal("group"),
    name,
    ref: name.optional(),
    parent,
    origin: v3.optional(),
    rotation: v3.optional(),
  })
  .strict();

const cubePart = z
  .object({
    type: z.literal("cube"),
    name,
    ref: name.optional(),
    parent,
    from: v3,
    to: v3,
    origin: v3.optional(),
    rotation: v3.optional(),
    box_uv: z.boolean().optional(),
  })
  .strict();

const meshPart = z
  .object({
    type: z.literal("mesh"),
    name,
    ref: name.optional(),
    parent,
    origin: v3.optional(),
    rotation: v3.optional(),
    vertices: z.record(id, v3),
    // The operation schema performs the full face validation. Keeping this
    // field opaque here avoids maintaining a second copy of face semantics.
    faces: z.record(id, z.unknown()),
  })
  .strict();

const armaturePart = z
  .object({
    type: z.literal("armature"),
    name,
    ref: name.optional(),
    parent,
    visibility: z.boolean().optional(),
    locked: z.boolean().optional(),
    export: z.boolean().optional(),
  })
  .strict();

const bonePart = z
  .object({
    type: z.literal("bone"),
    name,
    ref: name.optional(),
    parent: id,
    origin: v3.optional(),
    rotation: v3.optional(),
    length: z.number().finite().min(0).max(100000).optional(),
    width: z.number().finite().min(0).max(100000).optional(),
    connected: z.boolean().optional(),
    color: z.number().int().min(0).max(9).optional(),
    visibility: z.boolean().optional(),
    locked: z.boolean().optional(),
    export: z.boolean().optional(),
  })
  .strict();

export const modelPartSchema = z.discriminatedUnion("type", [
  groupPart,
  cubePart,
  meshPart,
  armaturePart,
  bonePart,
]);

const textureSpec = z
  .object({
    name,
    ref: name.optional(),
    asset_id: id.optional(),
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
    uv_width: z.number().finite().positive().max(4096).optional(),
    uv_height: z.number().finite().positive().max(4096).optional(),
    color: color.default("#00000000"),
    png: z.string().max(24000000).startsWith("data:image/png;base64,").optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.asset_id && value.png)
      ctx.addIssue({ code: "custom", message: "Use asset_id or png, not both", path: ["asset_id"] });
  });

const uvTaskSchema = z
  .object({
    targets: z.array(id).min(1).max(2000),
    strategy: z.enum(["density", "transform", "custom"]).default("density"),
    pixels_per_unit: z.number().finite().positive().max(1024).optional(),
    scale: v2.optional(),
    offset: v2.optional(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
    operations: operations.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.strategy === "density" && value.pixels_per_unit === undefined)
      ctx.addIssue({ code: "custom", message: "pixels_per_unit is required for density strategy", path: ["pixels_per_unit"] });
    if (value.strategy === "transform" && value.scale === undefined && value.offset === undefined && value.rotation === undefined)
      ctx.addIssue({ code: "custom", message: "scale, offset or rotation is required for transform strategy", path: ["scale"] });
    if (value.strategy === "custom" && !value.operations)
      ctx.addIssue({ code: "custom", message: "operations is required for custom strategy", path: ["operations"] });
  });

const layerSpec = z
  .object({ texture: id, ref: name.optional(), name })
  .strict();

const paintSpec = z
  .object({
    texture: id,
    layer: id.optional(),
    edits: z.array(pixelEditSchema).min(1).max(20000),
  })
  .strict();

const keySpec = z
  .object({
    node: id,
    channel: id,
    time: z.number().finite().min(0).max(1000),
    values: z.tuple([
      z.union([z.number().finite(), z.string().max(1000)]),
      z.union([z.number().finite(), z.string().max(1000)]),
      z.union([z.number().finite(), z.string().max(1000)]),
    ]),
    interpolation: z.enum(["linear", "catmullrom", "bezier", "step"]).optional(),
    collision: z.enum(["reject", "replace"]).optional(),
    snap: z.boolean().optional(),
  })
  .strict();

const animationSpec = z
  .object({
    name,
    ref: name.optional(),
    length: z.number().finite().min(0).max(1000).default(1),
    loop: z.enum(["once", "hold", "loop"]).default("loop"),
    snapping: z.number().int().min(1).max(500).default(24),
    override: z.boolean().optional(),
    anim_time_update: z.string().max(10000).optional(),
    blend_weight: z.string().max(10000).optional(),
    start_delay: z.string().max(10000).optional(),
    loop_delay: z.string().max(10000).optional(),
    markers: z.array(z.object({ time: z.number().finite().min(0).max(1000), color: z.number().int().min(0).max(9).optional(), name: z.string().max(160).optional() }).strict()).max(2000).optional(),
    keys: z.array(keySpec).max(20000).default([]),
    effects: z.array(z.object({
      time: z.number().finite().min(0).max(1000),
      effect: effectKeyframeSchema,
      collision: z.enum(["reject", "replace"]).default("reject"),
      snap: z.boolean().default(true),
    }).strict()).max(20000).default([]),
  })
  .strict();

const splineVertexSpec = z
  .object({
    id,
    handle_mode: z.enum(["free", "aligned", "mirrored"]).default("free"),
    vertices: z.record(id, v3).refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 20000, "Specify 1 to 20000 spline vertices"),
  })
  .strict();

const splineHandleSpec = z
  .object({
    id,
    handles: z.record(id, z.object({ size: z.number().finite().min(0).max(100000).optional(), tilt: z.number().finite().min(-100000).max(100000).optional() }).strict().refine((value) => value.size !== undefined || value.tilt !== undefined, "Specify size or tilt"))
      .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 20000, "Specify 1 to 20000 spline handles"),
  })
  .strict();

const splineSettingsSpec = z
  .object({
    ids: z.array(id).min(1).max(2000),
    radial_resolution: z.number().int().min(3).max(512).optional(),
    tubular_resolution: z.number().int().min(1).max(512).optional(),
    radius_multiplier: z.number().finite().min(0).max(100000).optional(),
    render_mode: z.enum(["mesh", "path"]).optional(),
    uv_mode: z.enum(["length_accurate", "uniform", "per_segment"]).optional(),
    shading: z.enum(["flat", "smooth"]).optional(),
    display_space: z.boolean().optional(),
    cyclic: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.entries(value).some(([key, entry]) => key !== "ids" && entry !== undefined), "Specify at least one spline setting");

const splineTask = z
  .object({
    kind: z.literal("spline"),
    vertices: z.array(splineVertexSpec).max(2000).optional(),
    handles: z.array(splineHandleSpec).max(2000).optional(),
    settings: z.array(splineSettingsSpec).max(2000).optional(),
    operations: operations.optional(),
  })
  .strict()
  .refine((value) => !!value.vertices?.length || !!value.handles?.length || !!value.settings?.length || !!value.operations?.length, "spline requires vertices, handles, settings or operations");

const buildModelTask = z
  .object({
    kind: z.literal("build_model"),
    create_project: z.object({ name, format: id.default("free") }).strict().optional(),
    parts: z.array(modelPartSchema).max(2000).optional(),
    textures: z.array(textureSpec).max(256).optional(),
    texture_groups: z.array(textureGroupSpec).max(256).optional(),
    assignments: z.array(z.object({ ids: z.array(id).min(1).max(2000), texture: id, faces: z.array(z.enum(["north", "south", "east", "west", "up", "down"])).min(1).max(6).optional() }).strict()).max(2000).optional(),
    uv: uvTaskSchema.optional(),
    operations: operations.optional(),
  })
  .strict()
  .refine((value) => !!value.parts?.length || !!value.textures?.length || !!value.texture_groups?.length || !!value.operations?.length, "build_model requires parts, textures, texture_groups or operations");

const layoutUvTask = z
  .object({ kind: z.literal("layout_uv"), layout: uvTaskSchema, operations: operations.optional() })
  .strict();

const paintTextureTask = z
  .object({
    kind: z.literal("paint_texture"),
    textures: z.array(textureSpec).max(256).optional(),
    layers: z.array(layerSpec).max(2000).optional(),
    paints: z.array(paintSpec).max(2000).optional(),
    operations: operations.optional(),
  })
  .strict()
  .refine((value) => !!value.textures?.length || !!value.layers?.length || !!value.paints?.length || !!value.operations?.length, "paint_texture requires textures, layers, paints or operations");

const animateTask = z
  .object({ kind: z.literal("animate"), animations: z.array(animationSpec).min(1).max(256), operations: operations.optional() })
  .strict()
  .superRefine((value, ctx) => {
    value.animations.forEach((animation, index) => {
      if ((animation.keys.length || animation.effects.length) && !animation.ref)
        ctx.addIssue({ code: "custom", message: "ref is required when an animation has keys or effects", path: ["animations", index, "ref"] });
    });
  });

const transformSpec = z.discriminatedUnion("action", [
  z.object({ action: z.literal("translate"), ids: z.array(id).min(1).max(2000), offset: v3 }).strict(),
  z.object({ action: z.literal("scale"), ids: z.array(id).min(1).max(2000), factors: v3, pivot: v3 }).strict(),
  z.object({ action: z.literal("mirror"), ids: z.array(id).min(1).max(2000), axis: z.enum(["x", "y", "z"]), center: z.number().finite().default(0), duplicate: z.boolean().default(true), mirror_uv: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("align"), ids: z.array(id).min(1).max(2000), axis: z.enum(["x", "y", "z"]), mode: z.enum(["min", "center", "max"]), position: z.number().finite() }).strict(),
  z.object({ action: z.literal("reparent"), ids: z.array(id).min(1).max(2000), parent: id.nullable() }).strict(),
]);

const weightBatch = z
  .object({
    mesh_id: id,
    mode: z.enum(["replace", "merge"]).default("replace"),
    normalize: z.boolean().default(false),
    vertices: z
      .array(z.object({ vertex_id: id, weights: z.record(id, z.number().finite().min(0).max(1)).refine((weights) => Object.keys(weights).length <= 256, "A vertex may reference at most 256 bones") }).strict())
      .min(1)
      .max(20000),
  })
  .strict();

const meshRigTask = z
  .object({
    kind: z.literal("mesh_rig"),
    transforms: z.array(transformSpec).max(2000).optional(),
    weights: z.array(weightBatch).max(256).optional(),
    operations: operations.optional(),
  })
  .strict()
  .refine((value) => !!value.transforms?.length || !!value.weights?.length || !!value.operations?.length, "mesh_rig requires transforms, weights or operations");

const inspectModelTask = z
  .object({
    kind: z.literal("inspect_model"),
    query: querySchema.optional(),
    include: z.object({
      snapshot: z.boolean().default(true),
      geometry: z.boolean().default(true),
      uv: z.boolean().default(true),
      texture: z.boolean().default(true),
      animation: z.boolean().default(true),
      diagnostics: z.boolean().default(true),
    }).strict().default({ snapshot: true, geometry: true, uv: true, texture: true, animation: true, diagnostics: true }),
  })
  .strict();

const compareModelTask = z
  .object({
    kind: z.literal("compare_model"),
    base_snapshot_id: id,
    query: querySchema.optional(),
    include: z.object({
      structural: z.boolean().default(true),
      geometry: z.boolean().default(true),
      uv: z.boolean().default(true),
      texture: z.boolean().default(true),
      animation: z.boolean().default(true),
    }).strict().default({ structural: true, geometry: true, uv: true, texture: true, animation: true }),
  })
  .strict();

const repairModelTask = z
  .object({
    kind: z.literal("repair_model"),
    diagnose: z.boolean().default(true),
    operations: operations.optional(),
    require_clean_diagnosis: z.boolean().default(false),
  })
  .strict()
  .refine((value) => !!value.operations?.length || value.diagnose, "repair_model requires operations or diagnose=true");

const geometryEditTask = z
  .object({
    kind: z.literal("geometry_edit"),
    operations,
  })
  .strict();

const projectIoAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import_model"), filename: z.string().min(1).max(200), codec: id, content_type: z.enum(["auto", "json", "text", "binary", "image"]).default("auto"), options: z.record(z.string(), z.unknown()).default({}) }).strict(),
  z.object({ action: z.literal("import_animation"), filename: z.string().min(1).max(200), codec: id.default("bedrock"), names: z.array(id).min(1).max(1000).optional() }).strict(),
  z.object({ action: z.literal("import_texture_set"), filename: z.string().min(1).max(200), name: name.optional() }).strict(),
  z.object({ action: z.literal("export"), codec: id, filename: z.string().min(1).max(200).optional(), options: z.record(z.string(), z.unknown()).default({}) }).strict(),
  z.object({ action: z.literal("restore_checkpoint"), filename: z.string().min(1).max(200) }).strict(),
  z.object({ action: z.literal("convert_copy"), target_format: id, options: z.record(z.string(), z.unknown()).default({}) }).strict(),
]);

const projectIoTask = z
  .object({ kind: z.literal("project_io"), actions: z.array(projectIoAction).min(1).max(64) })
  .strict();

const editorContextTask = z
  .object({ kind: z.literal("editor_context"), operations: z.array(nativeOperationSpec).min(1).max(128) })
  .strict();

const validateExportTask = z
  .object({ kind: z.literal("validate_export"), operations: operations.optional() })
  .strict();

const nativeTask = z
  .object({
    kind: z.literal("native"),
    operations: z.array(nativeOperationSpec).min(1).max(128),
  })
  .strict();

const pipelineStepTaskSchema = z.union([buildModelTask, layoutUvTask, paintTextureTask, animateTask, meshRigTask, splineTask, repairModelTask, geometryEditTask, validateExportTask, nativeTask]);
const pipelineTask = z
  .object({
    kind: z.literal("pipeline"),
    steps: z.array(z.object({ id: name, task: pipelineStepTaskSchema }).strict()).min(1).max(32),
  })
  .strict()
  .refine((value) => new Set(value.steps.map((step) => step.id)).size === value.steps.length, "Pipeline step IDs must be unique");

const automationTask = z
  .object({
    kind: z.literal("automation"),
    steps: z.array(z.object({ id: name, task: pipelineStepTaskSchema }).strict()).min(1).max(32),
    stop_on_error: z.boolean().default(true),
  })
  .strict()
  .refine((value) => new Set(value.steps.map((step) => step.id)).size === value.steps.length, "Automation step IDs must be unique");

/** Publicly documented top-level catalog. Keep this finite; add detail as operations or recipes. */
export const HIGH_LEVEL_TASK_KINDS = [
  "build_model", "layout_uv", "paint_texture", "animate", "mesh_rig", "spline",
  "pipeline", "validate_export", "native", "inspect_model", "compare_model", "repair_model",
  "geometry_edit", "project_io", "editor_context", "automation",
] as const;
export const MAX_HIGH_LEVEL_TASK_KINDS = 16 as const;

export const highLevelTaskSchema = z.discriminatedUnion("kind", [
  buildModelTask,
  layoutUvTask,
  paintTextureTask,
  animateTask,
  meshRigTask,
  splineTask,
  inspectModelTask,
  compareModelTask,
  repairModelTask,
  geometryEditTask,
  projectIoTask,
  editorContextTask,
  validateExportTask,
  nativeTask,
  pipelineTask,
  automationTask,
]);

const verifyView = z.enum(["front", "back", "left", "right", "top", "bottom", "isometric"]);
const assertionsSchema = z
  .object({
    on_failure: z.enum(["report", "error"]).default("report"),
    format: id.optional(),
    max_errors: z.number().int().min(0).optional(),
    max_warnings: z.number().int().min(0).optional(),
    max_info: z.number().int().min(0).optional(),
    min_nodes: z.number().int().min(0).optional(),
    max_nodes: z.number().int().min(0).optional(),
    min_textures: z.number().int().min(0).optional(),
    max_textures: z.number().int().min(0).optional(),
    min_animations: z.number().int().min(0).optional(),
    max_animations: z.number().int().min(0).optional(),
    max_mesh_vertices: z.number().int().min(0).optional(),
    max_mesh_faces: z.number().int().min(0).optional(),
    required_node_ids: z.array(id).max(2000).optional(),
    required_texture_ids: z.array(id).max(256).optional(),
    required_animation_ids: z.array(id).max(256).optional(),
    require_no_untextured_faces: z.boolean().default(false),
    require_uv_in_bounds: z.boolean().default(false),
    require_export: z.boolean().default(false),
    export_sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  })
  .strict();
const verifySchema = z
  .object({
    diagnose: z.boolean().default(true),
    capture: z.object({ views: z.array(verifyView).min(1).max(7).default(["front", "right", "isometric"]), size: z.number().int().min(128).max(1024).default(512) }).strict().optional(),
    animation_frames: z.object({ animation_id: id, times: z.array(z.number().finite().min(0).max(1000)).min(1).max(16), view: verifyView.default("isometric"), size: z.number().int().min(128).max(512).default(256), contact_sheet: z.boolean().default(true) }).strict().optional(),
    conversion_format: id.optional(),
    export: z.object({ codec: id, filename: z.string().min(1).max(200).optional(), texture_id: id.optional(), frame_index: z.number().int().min(0).max(4095).optional(), animation_ids: z.array(id).min(1).max(1000).optional(), controller_ids: z.array(id).min(1).max(1000).optional(), texture_group_id: id.optional(), options: z.record(z.string(), z.unknown()).default({}) }).strict().optional(),
    assertions: assertionsSchema.optional(),
  })
  .strict();

const preconditionsSchema = z
  .object({
    expected_revision: z.number().int().min(0).optional(),
    expected_format: id.optional(),
    required_capabilities: z.array(id).max(64).optional(),
    max_nodes: z.number().int().min(0).optional(),
    max_textures: z.number().int().min(0).optional(),
    max_animations: z.number().int().min(0).optional(),
  })
  .strict();

const checkpointSchema = z
  .object({
    before_apply_filename: z.string().min(1).max(200).optional(),
    after_apply_filename: z.string().min(1).max(200).optional(),
  })
  .strict();

const capabilityQuerySchema = z
  .object({
    kind: z.enum(["all", "actions", "settings", "modes", "codecs", "node_types", "plugins", "extensions", "loaders", "panels", "formats", "previews"]).default("all"),
    search: z.string().max(160).default(""),
    plugin: id.optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();

export const highLevelSchema = z
  .object({
    project_id: id.optional(),
    snapshot_id: id.optional(),
    plan_id: id.optional(),
    mode: z.enum(["plan", "apply", "verify", "capabilities"]).default("plan"),
    label: name.default("High-level Blockbench task"),
    detail: z.enum(["summary", "full"]).default("summary"),
    include_assets: z.boolean().default(false),
    assets: z.record(id, assetSpec).refine((assets) => Object.keys(assets).length <= 256, "At most 256 assets may be referenced").optional(),
    preconditions: preconditionsSchema.optional(),
    checkpoint: checkpointSchema.optional(),
    capability_query: capabilityQuerySchema.optional(),
    task: highLevelTaskSchema.optional(),
    verify: verifySchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "plan" && !value.task)
      ctx.addIssue({ code: "custom", message: "task is required in plan mode", path: ["task"] });
    if (value.mode === "apply" && (!value.project_id || !value.plan_id))
      ctx.addIssue({ code: "custom", message: "project_id and plan_id are required in apply mode", path: ["plan_id"] });
    if (value.mode === "verify" && !value.project_id)
      ctx.addIssue({ code: "custom", message: "project_id is required in verify mode", path: ["project_id"] });
    if (value.mode === "plan" && !value.project_id && (value.task?.kind !== "build_model" || !value.task.create_project))
      ctx.addIssue({ code: "custom", message: "project_id is required unless build_model creates a project", path: ["project_id"] });
    if (value.mode === "verify" && !value.verify)
      ctx.addIssue({ code: "custom", message: "verify is required in verify mode", path: ["verify"] });
    if (value.mode === "capabilities" && (value.task || value.verify || value.plan_id))
      ctx.addIssue({ code: "custom", message: "capabilities mode does not accept task, verify or plan_id", path: ["mode"] });
    const textureTasks: any[] = [];
    const collectTextureTasks = (task: any) => {
      if (!task) return;
      if (task.kind === "build_model" || task.kind === "paint_texture") textureTasks.push(task);
      if (task.kind === "pipeline" || task.kind === "automation")
        for (const step of task.steps ?? []) collectTextureTasks(step.task);
    };
    collectTextureTasks(value.task);
    for (const task of textureTasks) {
      const textures = task.kind === "build_model" || task.kind === "paint_texture" ? task.textures ?? [] : [];
      for (const [index, texture] of textures.entries())
        if (texture.asset_id && !value.assets?.[texture.asset_id])
          ctx.addIssue({ code: "custom", message: `Unknown asset_id ${texture.asset_id}`, path: ["task", "textures", index, "asset_id"] });
    }
  });

export type HighLevelInput = z.infer<typeof highLevelSchema>;
export type HighLevelTask = z.infer<typeof highLevelTaskSchema>;
export type HighLevelVerify = z.infer<typeof verifySchema>;
export type HighLevelAssertions = z.infer<typeof assertionsSchema>;

function partOperation(part: z.infer<typeof modelPartSchema>): Record<string, unknown> {
  switch (part.type) {
    case "group":
      return { op: "group.add", ref: part.ref, name: part.name, parent: part.parent, origin: part.origin, rotation: part.rotation };
    case "cube":
      return { op: "cube.add", ref: part.ref, name: part.name, parent: part.parent, from: part.from, to: part.to, origin: part.origin, rotation: part.rotation, box_uv: part.box_uv };
    case "mesh":
      return { op: "mesh.add", ref: part.ref, name: part.name, parent: part.parent, origin: part.origin, rotation: part.rotation, vertices: part.vertices, faces: part.faces };
    case "armature":
      return { op: "armature.add", ref: part.ref, name: part.name, parent: part.parent, visibility: part.visibility, locked: part.locked, export: part.export };
    case "bone":
      return { op: "armature_bone.add", ref: part.ref, name: part.name, parent: part.parent, origin: part.origin, rotation: part.rotation, length: part.length, width: part.width, connected: part.connected, color: part.color, visibility: part.visibility, locked: part.locked, export: part.export };
  }
}

function uvOperations(value: z.infer<typeof uvTaskSchema>): Record<string, unknown>[] {
  if (value.operations) return value.operations;
  if (value.strategy === "density") return [{ op: "uv.density", ids: value.targets, pixels_per_unit: value.pixels_per_unit }];
  if (value.strategy === "transform") return [{ op: "uv.transform", ids: value.targets, scale: value.scale, offset: value.offset, rotation: value.rotation }];
  return [];
}

export function highLevelOperations(task: HighLevelTask): Record<string, unknown>[] {
  switch (task.kind) {
    case "build_model": {
      const result: Record<string, unknown>[] = [...(task.operations ?? [])];
      for (const part of task.parts ?? []) result.push(partOperation(part));
      for (const texture of task.textures ?? []) result.push({ op: "texture.add", ...texture });
      for (const group of task.texture_groups ?? []) {
        const { color_value, mer_value, subsurface_value, ...definition } = group;
        result.push({ op: "texture_group.add", ...definition });
        if (color_value !== undefined || mer_value !== undefined || subsurface_value !== undefined)
          result.push({ op: "texture_group.update", id: group.ref ? `$${group.ref}` : undefined, color_value, mer_value, subsurface_value });
      }
      for (const assignment of task.assignments ?? []) result.push({ op: "texture.assign", ...assignment });
      if (task.uv) result.push(...uvOperations(task.uv));
      return result;
    }
    case "layout_uv":
      return [...(task.operations ?? []), ...uvOperations(task.layout)];
    case "paint_texture": {
      const result: Record<string, unknown>[] = [...(task.operations ?? [])];
      for (const texture of task.textures ?? []) result.push({ op: "texture.add", ...texture });
      for (const layer of task.layers ?? []) result.push({ op: "layer.add", ...layer });
      for (const paint of task.paints ?? []) result.push({ op: "texture.paint", id: paint.texture, layer: paint.layer, edits: paint.edits });
      return result;
    }
    case "animate": {
      const result: Record<string, unknown>[] = [...(task.operations ?? [])];
      for (const animation of task.animations) {
        const { keys, effects, ...definition } = animation;
        result.push({ op: "animation.add", ...definition });
        for (const key of keys) result.push({ op: "keyframe.set", animation: animation.ref ? `$${animation.ref}` : undefined, ...key });
        for (const effect of effects) result.push({ op: "keyframe.effect_set", animation: animation.ref ? `$${animation.ref}` : undefined, ...effect });
      }
      return result;
    }
    case "mesh_rig": {
      const result: Record<string, unknown>[] = [...(task.operations ?? [])];
      for (const transform of task.transforms ?? []) {
        switch (transform.action) {
          case "translate":
            result.push({ op: "node.translate", ids: transform.ids, offset: transform.offset });
            break;
          case "scale":
            result.push({ op: "node.scale", ids: transform.ids, factors: transform.factors, pivot: transform.pivot });
            break;
          case "mirror":
            result.push({ op: "node.mirror", ids: transform.ids, axis: transform.axis, center: transform.center, duplicate: transform.duplicate, mirror_uv: transform.mirror_uv });
            break;
          case "align":
            result.push({ op: "node.align", ids: transform.ids, axis: transform.axis, mode: transform.mode, position: transform.position });
            break;
          case "reparent":
            result.push({ op: "node.reparent", ids: transform.ids, parent: transform.parent });
            break;
        }
      }
      for (const batch of task.weights ?? [])
        result.push({
          op: "mesh.weights",
          mode: batch.mode,
          normalize: batch.normalize,
          vertices: batch.vertices.map((vertex) => ({ mesh_id: batch.mesh_id, ...vertex })),
        });
      return result;
    }
    case "spline": {
      const result: Record<string, unknown>[] = [...(task.operations ?? [])];
      for (const update of task.vertices ?? []) result.push({ op: "spline.vertices", id: update.id, handle_mode: update.handle_mode, vertices: update.vertices });
      for (const update of task.handles ?? []) result.push({ op: "spline.handles", id: update.id, handles: update.handles });
      for (const update of task.settings ?? []) result.push({ op: "spline.settings", ...update });
      return result;
    }
    case "geometry_edit":
      return [...task.operations];
    case "repair_model":
      return [...(task.operations ?? [])];
    case "automation":
    case "pipeline":
      return task.steps.flatMap((step) => highLevelOperations(step.task));
    case "inspect_model":
    case "compare_model":
    case "project_io":
    case "editor_context":
      return [];
    case "native":
      // Native registrations are dispatched during bb_task apply. They do not
      // belong in a model edit plan because many of them mutate UI state,
      // settings, dialogs or editor selection rather than project data.
      return [];
    case "validate_export":
      return task.operations ?? [];
  }
}

export function highLevelSummary(task: HighLevelTask, generated: Record<string, unknown>[]): Record<string, unknown> {
  return {
    kind: task.kind,
    ...canonicalOperationSummary(generated),
    ...(task.kind === "native"
      ? {
          native_operations: task.operations.length,
          native_operation_types: Array.from(new Set(task.operations.map((op) => op.operation))),
        }
      : {}),
    ...(task.kind === "editor_context"
      ? {
          native_operations: task.operations.length,
          native_operation_types: Array.from(new Set(task.operations.map((operation) => operation.operation))),
        }
      : {}),
    ...(task.kind === "project_io"
      ? {
          io_actions: task.actions.length,
          io_action_types: Array.from(new Set(task.actions.map((action) => action.action))),
        }
      : {}),
    ...(task.kind === "inspect_model"
      ? { inspection_sections: Object.entries(task.include).filter(([, enabled]) => enabled).map(([section]) => section) }
      : {}),
    ...(task.kind === "compare_model"
      ? { base_snapshot_id: task.base_snapshot_id, comparison_sections: Object.entries(task.include).filter(([, enabled]) => enabled).map(([section]) => section) }
      : {}),
    ...(task.kind === "automation"
      ? { steps: task.steps.map((step) => ({ id: step.id, ...highLevelSummary(step.task, highLevelOperations(step.task)) })), stop_on_error: task.stop_on_error }
      : {}),
    ...(task.kind === "pipeline"
      ? { steps: task.steps.map((step) => ({ id: step.id, ...highLevelSummary(step.task, highLevelOperations(step.task)) })) }
      : {}),
  };
}
