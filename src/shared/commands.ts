import { autoCullfaceSchema } from './auto-cullface.ts';
import { flipbookExportSchema } from './flipbook-export.ts';
import { z } from "zod";
import {brushPresetCommand} from './brush-presets.ts';
import { meshOperationSchema } from "./mesh-operation.ts";
import {
  editSchema,
  id,
  protectionSchema,
  querySchema,
  templateSchema,
} from "./schema.ts";
const p = { project_id: id };
const empty = z.object({}).strict();
const brushSettings=z.object({
  fill_mode:z.enum(['face','selection','element','selected_elements','color_connected','color']).optional(),draw_shape:z.enum(['rectangle','rectangle_h','ellipse','ellipse_h']).optional(),copy_mode:z.enum(['copy','pattern','sample']).optional(),color_erase_mode:z.boolean().optional(),
  preferences:z.object({brush_opacity_modifier:z.enum(['none','pressure','tilt']).optional(),brush_size_modifier:z.enum(['none','pressure','tilt']).optional(),paint_with_stylus_only:z.boolean().optional(),pick_color_opacity:z.boolean().optional(),pick_combined_color:z.boolean().optional(),paint_side_restrict:z.boolean().optional(),color_picker_tool_switch:z.boolean().optional(),paint_through_transparency:z.boolean().optional(),limit_brush_opacity_per_stroke:z.boolean().optional(),move_with_selection_tool:z.boolean().optional()}).strict().optional(),
  mirror:z.object({global:z.boolean().optional(),local:z.boolean().optional(),axis:z.object({x:z.boolean().optional(),z:z.boolean().optional()}).strict().optional(),texture:z.boolean().optional(),texture_center:z.tuple([z.number().finite().min(-100000).max(100000),z.number().finite().min(-100000).max(100000)]).nullable().optional(),texture_frames:z.boolean().optional()}).strict().optional(),
  color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),secondary_color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  size:z.number().int().min(1).max(1024).optional(),opacity:z.number().finite().min(0).max(255).optional(),softness:z.number().finite().min(0).max(100).optional(),
  shape:z.enum(['square','circle']).optional(),blend_mode:z.enum(['default','set_opacity','color','behind','multiply','add','lighten','darken','screen','overlay','difference']).optional(),
  pixel_perfect:z.boolean().optional(),lock_alpha:z.boolean().optional(),mirror_painting:z.boolean().optional(),
}).strict();
const modifiers = z
  .object({
    shift: z.boolean().default(false),
    ctrl: z.boolean().default(false),
    alt: z.boolean().default(false),
    meta: z.boolean().default(false),
  })
  .strict();
const nativeRegistrationKind = z.enum([
  "Action", "Tool", "Toggle", "SharedActionHandler", "Dialog", "BarSelect",
  "NumSlider", "BarSlider", "BarText", "ColorPicker", "Menu", "Setting",
  "Keybind", "Panel", "Preview", "Mode", "NodeType", "Property", "Codec",
  "ModelFormat", "ModelLoader",
]);
const nativeArguments = z
  .record(z.string().min(1).max(80), z.unknown())
  .default({})
  .refine((value) => Object.keys(value).length <= 64, "At most 64 native arguments are allowed");
const view = z.enum([
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
  "isometric",
]);
export const commands = {
  bb_bake_ik:{read:false,description:'Bake native IK into rotation keys in Blockbench 5.1.6 with a fresh snapshot and explicit selected animation_id. Requires animate mode, stopped playback, no dialog or part protections. conflict_policy error (default) rejects generated-time collisions with existing rotation keys before writing; replace uses native replacement. Preserves one animation Undo and restores failures, including Redo and timeline. Uses animation snapping, native sample cap 144 and timeline cap 120, correcting high-rate time compression. Reports generated/replaced key counts, rates and native 200-second truncation; does not extend the native duration limit. Other animation channels are preserved.',schema:z.object({...p,snapshot_id:id,animation_id:id,conflict_policy:z.enum(['error','replace']).default('error')}).strict()},
  bb_ik:{read:false,description:'Configure native Blockbench 5.1.6 Null Object IK controllers in one Undo. Requires fresh snapshot and an animation-capable format. Each binding explicitly sets controller_id, target_id (Group/Armature Bone/Locator or null to disable), source_id (ancestor Group/Armature Bone, or null to use controller parent), and lock_target_rotation. Validates the complete native bone chain before changing any controller; returns effective source and chain IDs. Existing controllers only; create Null Objects with native add_null_object action. No arbitrary Group IK fields. Failures restore controller properties and Undo/Redo. Part protections block editing.',schema:z.object({...p,snapshot_id:id,bindings:z.array(z.object({controller_id:id,target_id:id.nullable(),source_id:id.nullable(),lock_target_rotation:z.boolean()}).strict()).min(1).max(1000).refine(b=>new Set(b.map(x=>x.controller_id)).size===b.length,'Controller IDs must be unique')}).strict()},
  bb_brush_stroke:{read:false,description:'Run one native paint stroke using the selected brush_tool, eraser, copy_brush, fill_tool, draw_shape_tool or gradient_tool and current brush settings. Requires a fresh snapshot, explicitly selected texture and active layer_id (null for unlayered texture), paint mode, no dialog/pointer operation or modifier overrides. Points are absolute full-canvas pixel coordinates; native brush floor rules apply. connect interpolates between points; false stamps each point. Supports mouse/pen, per-point pressure and tilt, primary/secondary color. Native alpha-lock, selection, mirroring and brush preferences apply. Returns one Undo entry; failures restore texture, selection and Undo history. copy_brush requires copy_source (texture_id,x,y), samples the combined source image and uses current copy/pattern/sample mode. Source sampling replaces the native copy source and is not undone, including after a failed destination stroke. fill_tool uses current native fill_mode and exact RGBA color matching; in this 2D context face/element modes use the native selection fallback, while selected_elements uses selected geometry UVs. Optional surface {node_id,face_id} binds an explicitly selected unlocked Cube or Mesh face to native painting; texture and UVs are validated. Cube UV rectangles and Mesh UV-island masks restrict brushes. fill_tool supports native face/element filling. Per-point face_id overrides surface.face_id on the same element and texture. Native UV-island continuity and six-pixel face-transition limit apply; separated faces start a new stamp. Shape and gradient require at least two points and connect=true; each later point redraws from the first point, so only the last preview remains. Their face is fixed. Native surface limits differ: rectangles ignore face bounds and pixel selection, ellipses use UV bounds plus pixel selection, gradients use UV bounds without pixel selection; none uses a Mesh polygon mask. surface_limits reports these rules. Optional surface_clip=face_selection keeps only pixels whose centers lie in the declared face polygon and whose selection mask allows painting; pixels outside are restored exactly before Undo completion. Requires integer layer offsets. Default native preserves original behavior. constrain emulates Shift for uniform shape dimensions or gradient direction snapping. Shape uses current draw_shape and size; gradient fades the chosen color to transparent, not the other palette color. Coordinates remain texture pixels, not a 3D raycast.',schema:z.object({...p,snapshot_id:id,texture_id:id,layer_id:id.nullable().default(null),tool_id:z.enum(['brush_tool','eraser','copy_brush','fill_tool','draw_shape_tool','gradient_tool']),surface:z.object({node_id:id,face_id:id}).strict().optional(),copy_source:z.object({texture_id:id,x:z.number().finite().min(0).max(32767),y:z.number().finite().min(0).max(32767)}).strict().optional(),surface_clip:z.enum(['native','face_selection']).default('native'),constrain:z.boolean().default(false),connect:z.boolean().default(true),pointer_type:z.enum(['mouse','pen']).default('mouse'),color_target:z.enum(['primary','secondary']).default('primary'),points:z.array(z.object({face_id:id.optional(),x:z.number().finite().min(0).max(32767),y:z.number().finite().min(0).max(32767),pressure:z.number().finite().min(0).max(1).default(1),tilt_x:z.number().int().min(-90).max(90).default(0),tilt_y:z.number().int().min(-90).max(90).default(0)}).strict()).min(1).max(2048)}).strict().refine(a=>(a.tool_id==='copy_brush')===!!a.copy_source,'copy_source is required only for copy_brush').refine(a=>!!a.surface||a.points.every(point=>point.face_id===undefined),'Point face_id requires surface').refine(a=>!['draw_shape_tool','gradient_tool'].includes(a.tool_id)||(a.points.length>=2&&a.connect&&a.points.every(point=>!point.face_id||point.face_id===a.surface?.face_id)),'Shape and gradient require at least two points, connect=true and a fixed surface face').refine(a=>!a.constrain||['draw_shape_tool','gradient_tool'].includes(a.tool_id),'constrain applies only to shape and gradient').refine(a=>a.surface_clip==='native'||(!!a.surface&&['draw_shape_tool','gradient_tool'].includes(a.tool_id)),'face_selection clipping requires shape or gradient and surface')},
  bb_import_texture_set:{read:false,description:'Prepare a plan from a .texture_set.json in the configured output/input folder. Resolves referenced PNG first, then TGA, including contained relative subdirectories; outside paths/links and missing images are rejected. Loads images as embedded PNG textures and creates a material in one plan. Returns plan_id for bb_apply_plan and source_hashes (SHA-256 of input JSON and each image); does not apply immediately. Prepared plans embed the bytes read, so later source-file changes do not alter their pixels. Requires fresh snapshot. File-backed texture updates are not linked. Supports fixed texture_set JSON schema and maximum 32 MB combined images, dimensions 1..4096.',schema:z.object({...p,snapshot_id:id,filename:z.string().min(1).max(200),name:z.string().min(1).max(160).optional()}).strict()},
  bb_color_pick:{read:false,description:'Pick a color with native Blockbench 5.1.6 Painter.colorPicker from the explicitly selected texture. Requires paint mode and color_picker tool. Integer x/y are absolute pixels in the full texture canvas, including all animation frames. target selects primary or secondary color. Uses effective pick_combined_color, pick_color_opacity and color_picker_tool_switch preferences; configure these with bb_brush_settings or override per call with options.source (combined/active_layer), options.pick_opacity and options.switch_tool without changing saved preferences. Native active-layer transparent fallback, opacity updates across brush tools, color history and Toolbox.original switching apply. Native pixel alpha is divided by 256; a fully opaque pixel produces brush opacity 255. Returns observed sample reads, colors, brush opacities, effective preferences and original_tool; transparent tool-switch samples may return no color reads. Failed picking restores colors, opacity, history and original_tool. No model Undo.',schema:z.object({...p,texture_id:id,x:z.number().int().min(0).max(32767),y:z.number().int().min(0).max(32767),target:z.enum(['primary','secondary']).default('primary'),options:z.object({source:z.enum(['combined','active_layer']).optional(),pick_opacity:z.boolean().optional(),switch_tool:z.boolean().optional()}).strict().optional()}).strict()},
  bb_brush_presets:{read:false,description:'List native built-in and custom brush presets; create, update or delete custom presets by exact unique name; load from an explicit source into the selected paint tool. Null or omitted preset fields preserve current brush values on load. Uses native StateMemory storage; built-ins are read-only. Duplicate or ambiguous custom names are rejected. Loading uses validated native controls with rollback, not model Undo.',schema:z.object({...p,edit:brushPresetCommand}).strict()},
  bb_brush_settings:{read:false,description:'Inspect or atomically configure native Blockbench 5.1.6 brush controls for the explicitly selected paint tool. Also supports fill_tool, draw_shape_tool, gradient_tool and color_picker. fill_mode, draw_shape, copy_mode and color_erase_mode follow native tool/format conditions. Select controls return option availability. Omit patch to inspect values and availability. Size is integer pixels 1..1024, opacity 0..255, softness 0..100. color and secondary_color accept #RRGGBB; inspection preserves color history, and failed color changes restore history and stored colors. Other fields are native shape/blend mode and pixel-perfect/alpha-lock/mirror toggles. Set paint mode and select the tool first. These are native tool/global preferences, not a model Undo edit; failed batches restore attempted values. mirror supports partial global/local, X/Z axes, texture mirroring, center and texture_frames options; at least one axis is required. Failed batches restore mirror config and stored options. preferences partially updates ten native global master paint/stylus/picker settings; value and effective_value distinguish active profile overrides. Rollback restores saved preference data.',schema:z.object({...p,tool_id:z.enum(['brush_tool','eraser','copy_brush','fill_tool','draw_shape_tool','gradient_tool','color_picker']),patch:brushSettings.optional()}).strict()},
  bb_uv_seams: {
    read:false,
    description:"Assign divide/join/auto UV seams to explicit mesh edges in one Undo batch, without changing selection. Requires a fresh snapshot. Validates real boundary edges, conflicting edits and native key collisions before mutation. Returns changed seams and edge count; no-op creates no Undo entry. Blocked by part protections.",
    schema:z.object({...p,snapshot_id:id,targets:z.array(z.object({mesh_id:id,edges:z.array(z.tuple([id,id])).min(1).max(20000),mode:z.enum(['auto','divide','join'])}).strict()).min(1).max(1000).refine(targets=>targets.reduce((n,t)=>n+t.edges.length,0)<=20000,'Maximum 20000 edges per batch')}).strict(),
  },
  bb_mesh_operation: {
    read:false,
    description:"Dedicated Blockbench 5.1.6 mesh editing and creation: create_primitive supports ten native shapes with shape-specific parameters and explicit parent_id (null for root); mesh_ids may be empty for creation and must be empty for convert_to_mesh. convert_to_mesh requires parameters.source_ids naming exactly the selected cubes and/or Spline Mesh nodes, runs native conversion in one Undo, returns converted_source_ids and created_mesh_ids, and preserves selection during Undo. Conversion replaces sources and uses native attribute-transfer rules, so cube-specific flags, material names and face tint are not all transferred. Loop_cut length_reference defaults to first_mesh, consistently deriving one batch reference length from the first mesh; native retains the original mixed-mesh lookup. With first_mesh, size is converted to a common ratio using that reference. each_mesh instead evaluates size against each declared mesh reference edge and clamps it independently; percent retains a common fraction. Each reference uses its first selected face (or first selected vertex pair), in local coordinates. Loop_cut also accepts independent seam_policy preserve (default) or native. Preserve carries divided edge seams to both children, retains a source seam if another face still uses it, removes unused source seams before Undo completion, and returns ordered split_seams records. Loop_cut accepts weight_policy preserve (default) or native. Preserve uses exact native edge IDs and ratios to interpolate bone weights, includes bones in Undo, returns interpolated_vertex_weights, and persists for later amendment. It requires the pinned Desktop 5.1.6 callback, supports 20000 input and 20000 new vertices, and rejects invalid or ambiguous weights. Inset derives all vertices of selected faces for its native condition and geometry calculation, completing partial or empty vertex selections, retaining unrelated loose selected vertices and preserving the original Undo selection; later amendment retains this correction. Inset rejects two selected faces sharing only one vertex with MESH_INSET_REGION and mesh/vertex/face IDs; this native topology case remains unsupported. Extrude, inset and solidify accept independent seam_policy preserve (default) or native. Preserve copies divide/join seams to actual edges between corresponding new vertices, remaps surviving edges whose deleted endpoints were replaced (including edges in unselected faces), removes obsolete source seams, and returns copied_seams with copy/replacement kind; it does not invent side-edge seams. Seam copying and validation persist through later parameter amendments, including with native weight policy. Extrude, inset and solidify accept weight_policy preserve (default) or native. Preserve copies source bone values to corresponding new vertices within one Undo including the typed parameter amendment, returns copied_vertex_weights, and supports at most 20000 source vertices; ambiguous or invalid weights reject. The resulting native amendment form retains the same weight policy and UV correction for later recalculation; failed changes restore the preceding geometry, weights, history and form values. It requires the original project and mesh selection. Multi-mesh automatic UV calls are partitioned to existing face IDs. set_vertex_weights supports explicit multi-vertex/multi-bone replace, merge, normalization and clearing; returns vertex_weights. create_faces uses selected vertices to create edges/faces or split existing quads, with native orientation and auto UV; every mesh needs at least two selected vertices, and more than four requires an existing face sharing a selected vertex. Multiple meshes form one Undo entry. calculate_vertex_weights runs native automatic weights for all vertices of declared armature-parented meshes (maximum 20000), returns per-bone vertex_weights, and preserves one Undo; it does not guarantee normalized sums or clear all prior weights. Dissolve_edges accepts reference_policy cleanup (default) or native; cleanup removes deleted vertex weight keys and seams, and removes a selected edge seam only if no resulting face uses it. Other references remain; returns deleted_references in the same Undo including bones. delete_components reference_policy defaults to cleanup: removes seam references to deleted vertices and scoped bone weight keys, includes bones in Undo, and returns deleted_references. Native explicitly preserves original reference behavior. Legacy vertex-only weight keys remain untouched; ambiguous UUID prefixes or seam endpoints reject cleanup. Empty seam Undo states are explicit to prevent stale seams on Redo. delete_components requires parameters.selection_mode (vertex/edge/face/cluster) matching the current mode and the preview panel; keep_vertices defaults false. Every mesh needs selected components. Native deletion rules apply: selecting all vertices or all faces removes the mesh even with keep_vertices; edge mode can leave an empty mesh; vertex mode ignores keep_vertices. The native shared handler must resolve to mesh deletion. It restores component selection and shortcut behavior on failure and Undo. knife requires exactly one selected mesh in edit mode, 2..128 typed points (vertex ID, existing edge plus fraction 0..1, or face ID plus local position), and no current interactive knife operation. Consecutive points must share a face; face points must lie inside its polygon and plane, with boundary points expressed as edge/vertex. Up to 20000 vertices and 10000 faces. Uses native KnifeToolContext UV interpolation, verifies every requested segment exists afterward, restores failures and disposes previews. Other operations include extrusion, inset, solidify, loop cut, rotation application, face inversion, quad crease, edge dissolve, vertex merging (first/center, optionally by distance), mesh merge and split. Requires a fresh snapshot and exact selected mesh IDs. merge_meshes weight_policy defaults to preserve: transfers bone weights within the same armature and includes bones in Undo; rejects mixed armatures, legacy vertex-only keys, UUID prefix collisions and more than 20000 selected vertices when an armature is present. weight_policy remap requires bone_map from every source bone ID to a bone ID in the target armature, permits cross-armature merges, sums many-to-one weights, and rejects sums above one. It does not retarget animation or bind poses. weight_policy native explicitly keeps native weight-transfer behavior, which can lose effective weights. merge_meshes requires target_mesh_id matching the first selected mesh, preserves source seams with remapped vertex IDs, and returns merged_vertex_maps. Missing or ambiguous source seam references are rejected before editing. split_mesh weight_policy also defaults to preserve: copies values to new mesh keys, retains shared source vertices, removes keys for deleted source vertices, includes bones in Undo, and returns weight_partition. Native policy explicitly skips weight transfer. Preserving splits reject legacy keys/prefix collisions and support at most 20000 selected vertices when armatures are present. split_mesh follows explicit selected faces and vertices: selecting vertices without faces can create a vertex-only mesh while used vertices remain in the source. It preserves seams whose endpoints remain in each resulting mesh, removes dangling references before Undo completion, and returns seam_partition. Returns parameters, one native Undo entry, topology counts (null before/after for created/removed nodes), created_mesh_ids, removed_mesh_ids and selected_mesh_ids. Use bb_select for components and parent first. Vertex merge variants also accept seam_policy preserve (default) or native. Preserve remaps seam endpoints, drops collapsed seams, and returns vertex_merge_seams; contradictory divide/join values reject before editing unless seam_conflict explicitly selects divide or join. Missing or ambiguous seam references reject. Vertex merge variants accept weight_policy first (default), average, or native independently of position mode. First/average remove deleted vertex weight keys and include bones in Undo; average uses an arithmetic mean without normalization. They reject ambiguous legacy/prefix keys and invalid values, support at most 20000 selected vertices, and return vertex_merge_weights groups. Native keeps original weight behavior. Distance merging uses strictly less than distance in local units, groups around each first remaining vertex rather than transitively, and restores the native preference. Blocked by part protections. Native semantics and declared limits apply; full parameter combinations are not yet verified.",
    schema:z.object({...p,snapshot_id:id,mesh_ids:z.array(id).max(1000),edit:meshOperationSchema}).strict(),
  },
  bb_ui_capture: {
    read: true,
    description:
      "Capture the Blockbench application window, including CSS filters, panels, menus and dialogs. Uses the native Screencam API; does not capture other applications. Output is scaled to max_size.",
    schema: z
      .object({ max_size: z.number().int().min(256).max(2048).default(1280) })
      .strict(),
  },
  bb_import_animation: {
    read: false,
    description:
      "Import a staged animation/controller file into the active project through AnimationCodec.loadFile, with native Undo. File must be inside the configured output directory. Optional names filter selects file entries.",
    schema: z
      .object({
        ...p,
        filename: z.string().min(1).max(200),
        codec: id.default("bedrock"),
        names: z.array(id).min(1).max(1000).optional(),
      })
      .strict(),
  },
  bb_import_model: {
    read: false,
    description:
      "Import a staged file from the configured output directory through an installed native model codec. Requests a new project. Codec owns parsing, dialogs and texture loading; inspect returned project state. No OS file picker is required.",
    schema: z
      .object({
        filename: z.string().min(1).max(200),
        codec: id,
        options: z.record(z.string(), z.unknown()).default({}),
        content_type: z
          .enum(["auto", "json", "text", "binary", "image"])
          .default("auto"),
      })
      .strict(),
  },
  bb_ui_snapshot: {
    read: true,
    description:
      "Inspect a registered Panel, current menu/dialog, Preview, native adjustment form (amend), tab bar (tabs), application menu bar (menubar), title bar and profile controls (header), central workspace with plugin overlays (center), or home page (start_screen), including custom Vue interfaces. Secret inputs are redacted. Returns scoped element handles, parent relationships and optional Canvas images.",
    schema: z
      .object({
        surface: z
          .enum([
            "panel",
            "menu",
            "dialog",
            "preview",
            "amend",
            "tabs",
            "start_screen",
            "menubar",
            "header",
            "center",
          ])
          .default("panel"),
        panel_id: id.optional(),
        preview_id: id.optional(),
        include_canvas: z.boolean().default(false),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(1000).default(200),
      })
      .strict(),
  },
  bb_ui_interact: {
    read: false,
    description:
      "pointer supports mouse/pen, pressure (0–1), pressures matching the points array, tilt_x/tilt_y (degrees) and twist (degrees); release pressure is zero. " +
      "Click or set an inspected control, dispatch a pointer gesture, wheel or key. wheel accepts pixel delta_x/delta_y (±2000) and a normalized point (default center); dispatches provider handlers, not browser default scrolling. action file assigns staged filenames from output_dir to an inspected HTML file input (up to 8 files, approximately 32 MB combined); honors accept/multiple and dispatches input/change. Synthetic Files have no OS path/handle; change_dispatched does not await provider processing. key supports hold_ms up to 2000 with modifier presses and guaranteed release. Handles are scoped and single-use. Provider owns behavior and Undo; invoke only for the intended UI action. OS dialogs and trusted-only APIs need dedicated adapters.",
    schema: z
      .object({
        snapshot_id: id,
        element_id: id,
        action: z.enum([
          "click",
          "set",
          "key",
          "hover",
          "pointer",
          "wheel",
          "file",
        ]),
        wheel: z
          .object({
            delta_x: z.number().min(-2000).max(2000).default(0),
            delta_y: z.number().min(-2000).max(2000),
            point: z
              .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
              .default([0.5, 0.5]),
          })
          .strict()
          .optional(),
        filenames: z.array(z.string().min(1).max(200)).min(1).max(8).optional(),
        hold_ms: z.number().int().min(0).max(2000).default(0),
        pointer: z
          .object({
            points: z
              .array(
                z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
              )
              .min(1)
              .max(200),
            button: z.enum(["left", "middle", "right"]).default("left"),
            dispatch_target: z.enum(["element", "hit"]).default("element").describe("element sends all events to the inspected element. hit sends events to the element under each coordinate within the inspected subtree; rechecks bounds during dispatch. Release falls back to the last target or document if the path becomes unavailable. Does not emulate browser pointer capture."),
            pointer_type: z.enum(["mouse", "pen"]).default("mouse"),
            pressure: z.number().min(0).max(1).default(0.5),
            pressures: z
              .array(z.number().min(0).max(1))
              .min(1)
              .max(200)
              .optional(),
            tilt_x: z.number().min(-90).max(90).default(0),
            tilt_y: z.number().min(-90).max(90).default(0),
            twist: z.number().min(0).max(359).default(0),
            shift: z.boolean().default(false),
            ctrl: z.boolean().default(false),
            alt: z.boolean().default(false),
          })
          .strict()
          .superRefine((gesture, ctx) => {
            if (
              gesture.pressures &&
              gesture.pressures.length !== gesture.points.length
            )
              ctx.addIssue({
                code: "custom",
                path: ["pressures"],
                message: "Supply one pressure per point",
              });
          })
          .optional(),
        value: z
          .union([z.string().max(10000), z.number().finite(), z.boolean()])
          .optional(),
        key: z
          .union([
            z.string().regex(/^[\x20-\x7E]$/),
            z.string().regex(/^F(?:[1-9]|1[0-9]|2[0-4])$/),
            z.enum([
              "Enter",
              "Escape",
              "Tab",
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "Delete",
              "Backspace",
              "Shift",
              "Control",
              "Alt",
              "Meta",
              " ",
            ]),
          ])
          .optional(),
        modifiers: modifiers.optional(),
      })
      .strict(),
  },
  bb_loader: {
    read: false,
    description:
      "Start a registered ModelLoader such as a plugin wizard. May open custom UI or request external assets; return means dispatched only. Use only for the intended loader.",
    schema: z.object({ loader_id: id }).strict(),
  },
  bb_node_properties: {
    read: true,
    description:
      "Read registered scalar/vector Properties of any native or plugin node, with a revision-bound property_snapshot_id. Complex object/instance fields require dedicated adapters.",
    schema: z.object({ ...p, node_id: id }).strict(),
  },
  bb_edit_node_properties: {
    read: false,
    description:
      "Edit registered scalar/vector native node Properties with type/condition validation and native Undo. Uses property_snapshot_id from bb_node_properties; blocked by part protections. Custom property callbacks remain provider-owned.",
    schema: z
      .object({
        ...p,
        node_id: id,
        property_snapshot_id: id,
        values: z
          .record(id, z.unknown())
          .refine(
            (v) => Object.keys(v).length > 0 && Object.keys(v).length <= 100,
          ),
      })
      .strict(),
  },
  bb_control: {
    read: false,
    description:
      "Set a registered Toggle, BarSelect, NumSlider or BarSlider using native change callbacks. NumSlider also supports mode offset to add value to each target without flattening a multi-selection. Numeric sliders include onBefore/onAfter so native Undo handlers run. Effects belong to the provider; requires no part protections. Inspect bb_capabilities first.",
    schema: z
      .object({
        ...p,
        control_id: id,
        mode: z.enum(["set", "offset"]).default("set"),
        value: z.union([
          z.boolean(),
          z.string().max(1000),
          z.number().finite(),
        ]),
      })
      .strict(),
  },
  bb_capabilities: {
    read: true,
    description:
      "Discover currently registered actions, tools, settings, modes, model/animation codecs, node types, plugins and extension adapters. Discovery is not a compatibility guarantee. Query again after installing or reloading plugins.",
    schema: z
      .object({
        kind: z
          .enum([
            "all",
            "actions",
            "settings",
            "modes",
            "codecs",
            "node_types",
            "plugins",
            "extensions",
            "loaders",
            "panels",
            "formats",
            "previews",
          ])
          .default("all"),
        search: z.string().max(160).default(""),
        plugin: id.optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .strict(),
  },
  bb_editor_state: {
    read: true,
    description:
      "Read current selection, mode, active tool, timeline and native form dialog. Password fields are redacted. Custom HTML/Vue components and OS file dialogs are not form-compatible.",
    schema: z.object({include_shared_actions:z.boolean().default(false).describe('Include context-dependent shared handlers and single-use tokens for guarded bb_action dispatch.')}).strict(),
  },
  bb_select: {
    read: false,
    description:
      "Explicitly select nodes, texture, layer, pixels, animation or controller. spline_selection maps explicitly selected spline IDs to vertices, handles or curves in edit mode; handles expand to three vertices and curves to both endpoint handles; replaces the complete spline selection map and does not change selection mode. For Blockbench 5.1.6 splines, bb_control spline_selection_mode accepts object/handles; switching to object clears spline vertex selection. In handles mode with only splines selected, select_all toggles every selected spline based on whether the first spline is fully selected; invert_selection complements each vertex set. Inspect include_shared_actions before guarded bb_action dispatch. face_selection maps selected node IDs to UV face IDs; do not also supply mesh_selection for the same node. pixel_selection requires texture_id and supports replace/add/subtract/all/clear with rectangles [x,y,width,height], up to 4194304 pixels. An empty custom mask differs from clear (unrestricted painting). Optional time seeks and pauses animation. texture_frame requires explicit texture_id and a zero-based frame index; pauses texture and model animation playback and updates only that texture. Cannot combine with time. Frame selection changes preview state, not model Undo. Use before selection-dependent native actions.",
    schema: z
      .object({
        ...p,
        node_ids: z.array(id).max(2000),
        panel_id: id.optional().describe('Set the native active panel context to a registered panel ID or preview; does not open hidden panels or bypass handler conditions.'),
        include_shared_actions:z.boolean().default(false),
        mode: id.optional(),
        texture_id: id.optional(),
        texture_frame:z.number().int().min(0).max(32767).optional(),
        texture_playback:z.enum(['play','pause','reset']).optional().describe('Set global texture playback explicitly. Pauses model animation to prevent competing frame updates. play requires an animated texture and does not restart an already playing clock. pause retains frames; reset stops and sets all texture frames to zero. Requires animated_textures format; cannot combine with texture_frame or time. Preview operation, no model Undo.'),
        animation_id: id.optional(),
        layer_id: id.optional(),
        pixel_selection: z
          .object({
            mode: z.enum(["replace", "add", "subtract", "all", "clear"]),
            rectangles: z
              .array(
                z.tuple([
                  z.number().int().min(0),
                  z.number().int().min(0),
                  z.number().int().min(1),
                  z.number().int().min(1),
                ]),
              )
              .max(1000)
              .default([]),
          })
          .strict()
          .optional(),
        controller_id: id.optional(),
        time: z.number().finite().min(0).max(1000).optional(),
        keyframe_ids: z.array(id).max(2000).optional(),
        spline_selection:z.record(id,z.object({vertices:z.array(id).max(20000).default([]),handles:z.array(id).max(20000).default([]),curves:z.array(id).max(20000).default([])}).strict()).optional(),
        face_selection: z.record(id, z.array(id).max(20000)).optional(),
        mesh_selection: z
          .record(
            id,
            z
              .object({
                vertex_policy: z.enum(['complete','explicit']).default('complete').describe('complete adds face/edge vertices; explicit keeps the supplied vertex list for UV corner selection.'),
                vertices: z.array(id).max(20000).default([]),
                faces: z.array(id).max(20000).default([]),
                edges: z
                  .array(z.tuple([id, id]))
                  .max(20000)
                  .default([]),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
  },
  bb_uv_select_island: {
    read: false,
    description:
      "Select connected UV islands on one or more explicitly named Mesh nodes. Requires edit mode and one seed face per mesh; adjacency follows Blockbench 5.1.6 shared-edge direction and a strict UV tolerance (default 0.2, equality at the boundary does not connect). selection_mode=replace replaces each target mesh's face selection; add preserves it. Node selection is replaced with mesh_ids, no model data or Undo history is changed, and the result returns selected face IDs and island sizes. This explicit route extends the native helper, which only crawls the first selected Mesh and only when exactly one face was already selected.",
    schema: z
      .object({
        ...p,
        mesh_ids: z.array(id).min(1).max(2000),
        seeds: z
          .array(z.object({ mesh_id: id, face_id: id }).strict())
          .min(1)
          .max(2000),
        tolerance: z.number().finite().positive().max(100).default(0.2),
        selection_mode: z.enum(["replace", "add"]).default("replace"),
      })
      .strict()
      .refine(
        (value) =>
          new Set(value.mesh_ids).size === value.mesh_ids.length &&
          value.seeds.every((seed) => value.mesh_ids.includes(seed.mesh_id)),
        "seeds must reference unique mesh_ids",
      )
      .refine(
        (value) =>
          new Set(value.seeds.map((seed) => seed.mesh_id)).size ===
            value.seeds.length &&
          value.seeds.length === value.mesh_ids.length,
        "Provide exactly one seed per mesh",
      ),
  },
  bb_action: {
    read: false,
    description:
      "Dispatch an installed native Action/Tool by its exact catalog ID. Omit project_id to use the current project or a home-screen action when no project is selected. Effects and Undo are owned by that action; no atomic rollback guarantee. Invoke external operations only when authorized. All part protections block this path. Optional wait_for_completion awaits promises directly returned by click/onClick; use only when completion needs no further user input. Timers or work not returned by the handler are not awaited. clipboard_writes reports navigator.clipboard.writeText calls initiated synchronously by the action (up to 16 writes, 100000 characters each), including success or failure; unrelated clipboard contents are never read.",
    schema: z
      .object({
        ...p,
        action_id: id,
        shared_handler_token: id.optional().describe('Token from bb_editor_state/bb_select with include_shared_actions:true. Rejects changed selection, panel or selected native handler before dispatch; no bypass of conditions.'),
        project_id: id.optional(),
        modifiers: modifiers.optional(),
        wait_for_completion: z.boolean().default(false),
      })
      .strict(),
  },
  bb_native_operation: {
    read: false,
    description:
      "Dispatch a pinned Blockbench 5.1.6 registration through a bounded typed low-level boundary. project_id is optional and defaults to the active project for home-screen and editor actions. registration_kind and native_id identify the exact Action, control, setting, dialog, menu, keybind, panel, preview, mode, node type, format, loader, codec or Property; registration_key may be supplied for dynamic registrations. operation=inspect returns bounded metadata, dispatch/trigger opens or invokes an existing handler, set/edit changes a supported value, and select activates a panel, preview or mode. ModelLoader dispatch delegates to the native loader; Codec dispatch accepts bounded base64 file content for native import, while compilation remains bb_export. Existing specialized tools remain preferred for model edits. Custom components, OS dialogs and provider-owned instance Properties return an explicit adapter-required fault instead of arbitrary evaluation.",
    schema: z
      .object({
        ...p,
        project_id: id.optional(),
        registration_kind: nativeRegistrationKind,
        native_id: id.optional(),
        registration_key: z.string().min(1).max(240).optional(),
        operation: z.enum(["inspect", "dispatch", "trigger", "set", "edit", "open", "select", "close", "create"]).default("inspect"),
        snapshot_id: id.optional(),
        arguments: nativeArguments,
      })
      .strict()
      .refine((value) => !!value.native_id || !!value.registration_key, "native_id or registration_key is required"),
  },
  bb_menu: {
    read: false,
    description:
      "Invoke one inspected Blockbench 5.1.6 Menu entry through its native action or a fresh UI snapshot. Dynamic menus must be addressed with snapshot_id and element_id; static action entries may use action_id. close hides the current native menu. Menu conditions, selection and provider-owned Undo are checked by the underlying handler; OS dialogs and custom components require their own adapter.",
    schema: z
      .object({
        project_id: id.optional(),
        operation: z.enum(["trigger", "open", "close"]).default("trigger"),
        action_id: id.optional(),
        snapshot_id: id.optional(),
        element_id: id.optional(),
        interaction: z.enum(["click", "set", "key", "hover", "pointer", "wheel"]).default("click"),
        value: z.union([z.string().max(10000), z.number().finite(), z.boolean()]).optional(),
        modifiers: modifiers.optional(),
      })
      .strict()
      .refine(
        (value) => value.operation === "close" || !!value.action_id || (!!value.snapshot_id && !!value.element_id),
        "trigger/open requires action_id or snapshot_id with element_id",
      ),
  },
  bb_keybind: {
    read: false,
    description:
      "Trigger a Blockbench 5.1.6 native keybinding with a synthetic keydown/keyup pair. keybind_id identifies the audited registration when available; key is the effective shortcut and must be supplied explicitly. This does not read or change user keymap settings. Inspect editor state and re-check the resulting state because a keybinding may be conditional or consumed by a focused control.",
    schema: z
      .object({
        project_id: id.optional(),
        keybind_id: id.optional(),
        key: z.union([
          z.string().regex(/^[\\x20-\\x7E]$/),
          z.string().regex(/^F(?:[1-9]|1[0-9]|2[0-4])$/),
          z.enum(["Enter", "Escape", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Delete", "Backspace", "Shift", "Control", "Alt", "Meta", " "]),
        ]),
        modifiers: modifiers.optional(),
      })
      .strict(),
  },
  bb_panel: {
    read: false,
    description:
      "Select, open or close a registered native Blockbench 5.1.6 Panel by exact panel_id. Selection is context-only and is not an Undoable model edit. A panel without a native visibility method returns an explicit adapter-required fault for close/open instead of mutating its DOM directly.",
    schema: z
      .object({
        project_id: id.optional(),
        panel_id: id,
        operation: z.enum(["select", "open", "close"]).default("select"),
      })
      .strict(),
  },
  bb_preview: {
    read: false,
    description:
      "Select, open or close a registered Blockbench 5.1.6 Preview by exact preview_id. Camera and visibility state belong to the preview; no model Undo is created. Provider previews that do not expose a native selector/visibility method return an explicit adapter-required fault.",
    schema: z
      .object({
        project_id: id.optional(),
        preview_id: id,
        operation: z.enum(["select", "open", "close"]).default("select"),
      })
      .strict(),
  },
  bb_mode: {
    read: false,
    description:
      "Select a registered Blockbench 5.1.6 editing Mode by exact mode_id and verify that the native mode became active. Mode switches are editor state, not model Undo entries; unavailable conditions are rejected before selection.",
    schema: z
      .object({
        project_id: id.optional(),
        mode_id: id,
      })
      .strict(),
  },
  bb_node_type: {
    read: false,
    description:
      "Create a registered Blockbench 5.1.6 Outliner node type through its native constructor, init and addTo lifecycle. parent_id and properties are explicit; unsupported custom constructors return an adapter-required fault. Native node creation owns Undo and format/selection conditions.",
    schema: z
      .object({
        project_id: id,
        node_type_id: id,
        parent_id: id.optional(),
        properties: z.record(z.string().min(1).max(80), z.unknown()).default({}),
      })
      .strict(),
  },
  bb_dialog: {
    read: false,
    description:
      "Set or confirm/cancel the current native form dialog using its dialog token from bb_editor_state. wait_for_completion observes promises returned by confirmation, cancellation and button callbacks; unreturned asynchronous work is not tracked. Confirmation and form-change handlers can have side effects; use only for the intended action. Custom component UI and OS dialogs need an extension adapter.",
    schema: z
      .object({
        dialog_token: id,
        action: z.enum(["set", "confirm", "cancel"]),
        wait_for_completion: z.boolean().default(false),
        values: z.record(z.string(), z.unknown()).default({}),
        controls: z
          .record(
            id,
            z.union([z.string().max(10000), z.number().finite(), z.boolean()]),
          )
          .default({}),
      })
      .strict(),
  },
  bb_setting: {
    read: false,
    description:
      "Change one registered non-secret Blockbench setting using its native setter, validation and persistence. Takes effect globally or in the active settings profile; not Undoable. Read metadata and current value using bb_capabilities first.",
    schema: z
      .object({
        setting_id: id,
        value: z.union([
          z.string().max(10000),
          z.number().finite(),
          z.boolean(),
        ]),
      })
      .strict(),
  },
  bb_file_requests: {
    read: true,
    description:
      "Supports Blockbench.import/export and Filesystem.importFile/exportFile. Readers include text, binary/buffer, image and none (path only). " +
      "List native import/export file requests intercepted during MCP Action, dialog or UI callbacks. Resolve with bb_file_reply using files inside the configured output folder. Unrelated or later asynchronous OS file dialogs are outside this scope.",
    schema: z.object({}).strict(),
  },
  bb_file_reply: {
    read: false,
    description:
      "Resolve a pending native file request: import supplies filenames from the configured output folder; export writes the captured payload there then calls the provider callback; cancel discards the request. Inspect bb_file_requests first. Native callbacks own Undo and asynchronous completion.",
    schema: z
      .object({
        file_request_id: id,
        action: z.enum(["import", "export", "cancel"]),
        filenames: z.array(z.string().min(1).max(200)).min(1).max(8).optional(),
        filename: z.string().min(1).max(200).optional(),
      })
      .strict(),
  },
  bb_native_snapshot: {
    read: true,
    description:
      "Read native bbmodel data, including properties/node kinds outside the typed modeling API. Textures are excluded to bound output. Use native codecs or plugin adapters for specialized data; this does not authorize arbitrary property writes.",
    schema: z
      .object({
        ...p,
        section: z
          .enum([
            "meta",
            "elements",
            "groups",
            "outliner",
            "animations",
            "animation_controllers",
            "display",
            "all",
          ])
          .default("meta"),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .strict(),
  },
  bb_extension: {
    read: false,
    description:
      "Invoke a plugin-specific operation registered with RuinBlockBenchMCP.register. Discover its input schema and support declaration in bb_capabilities kind=extensions. Provider owns native Undo and async completion. Calls are blocked by part protections.",
    schema: z
      .object({
        ...p,
        extension_id: id,
        input: z.record(z.string(), z.unknown()).default({}),
      })
      .strict(),
  },
  bb_status: {
    read: true,
    description:
      "Connection and API compatibility diagnostics. Works even when Blockbench is disconnected.",
    schema: empty,
  },
  bb_projects: {
    read: true,
    description:
      "List open projects and supported model formats. Does not switch projects.",
    schema: empty,
  },
  bb_create_project: {
    read: false,
    description:
      "Create and select a new project; preserves existing tabs. Use free for meshes and bone animation, java_block or bedrock for game-specific formats.",
    schema: z
      .object({ name: z.string().min(1).max(160), format: id.default("free") })
      .strict(),
  },
  bb_select_project: {
    read: false,
    description: "Explicitly select an existing project by UUID.",
    schema: z.object(p).strict(),
  },
  bb_snapshot: {
    read: true,
    description:
      "Capture a revision-bound snapshot for planning edits. Returns a snapshot_id, paginated model data, and optionally changes since an older snapshot. Images are retrieved separately.",
    schema: z
      .object({
        ...p,
        since_snapshot_id: id.optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(1000).default(100),
      })
      .strict(),
  },
  bb_query: {
    read: true,
    description:
      "Find nodes by UUID, subtree, type, name substring or texture. Read-only; does not alter selection.",
    schema: z.object({ ...p, query: querySchema }).strict(),
  },
  bb_plan_auto_cullfaces: {
    read:true,
    description:'Plan automatic cube cullfaces from native global vertices, without changing selection. Requires edit mode, cullfaces-capable format and a fresh snapshot. Explicit IDs and face subset; min/max define bounds, tolerance and outer_distance define strict axis limits. Defaults match Blockbench 5.1.6 auto_set_cullfaces. Other axes must lie inclusively inside bounds. Disabled faces are preserved unless include_disabled. Returns decisions and plan_id for bb_apply_plan; respects geometry/UV protection.',
    schema:autoCullfaceSchema,
  },
  bb_plan_spline_join: {
    read:true,
    description:'Preview joining 2–32 open spline chains into a new spline, preserving the source nodes. Ordered parts specify node_id and reverse. The first part supplies the output parent, coordinate frame and settings; settings_policy first explicitly adopts the first settings; require_match rejects differences in the reported setting fields. Reports settings_overrides and warnings before applying differing input settings. Adds a Bezier bridge between each pair, remaps topology IDs and preserves handle size/tilt values (not guaranteed world cross-section orientation or UV layout). Requires edit mode and fresh snapshot. Returns plan_id for bb_apply_plan.',
    schema:z.object({...p,snapshot_id:id,name:z.string().min(1).max(160),settings_policy:z.enum(['first','require_match']),parts:z.array(z.object({node_id:id,reverse:z.boolean()}).strict()).min(2).max(32).refine(v=>new Set(v.map(p=>p.node_id)).size===v.length,'Spline IDs must be unique')}).strict(),
  },
  bb_plan_edit: {
    read: true,
    description:
      "Validate and preview an atomic edit without changing the model. Supports cube/group/mesh, transforms, UV, typed mesh vertex weights, texture painting/layers, animations and keyframes. Use ref on additions and $ref in subsequent operations. Returns plan_id for bb_apply_plan.",
    schema: editSchema,
  },
  bb_apply_plan: {
    read: false,
    description:
      "Apply a validated plan as one Undo entry. Rejects stale snapshots, changed protection rules, or active manual editing. Do not retry with a new request_id after a timeout; inspect bb_job first.",
    schema: z.object({ ...p, plan_id: id }).strict(),
  },
  bb_protection: {
    read: false,
    description:
      "List, set or remove persistent part protection rules. Domains: geometry, uv, texture, animation, structure. Rules restrict MCP edits; they do not prevent manual Blockbench editing.",
    schema: z
      .object({
        ...p,
        action: z.enum(["list", "set", "remove"]),
        rule: protectionSchema.optional(),
        rule_id: id.optional(),
      })
      .strict(),
  },
  bb_diagnose: {
    read: true,
    description:
      "Diagnose missing texture/parent/bone references, malformed faces, format constraints, UV extent, duplicate key times and loop endpoints. Warnings are not auto-repaired.",
    schema: z.object(p).strict(),
  },
  bb_capture: {
    read: true,
    description:
      "Capture model images from one or more directions, restoring the previous camera afterwards.",
    schema: z
      .object({
        ...p,
        views: z
          .array(view)
          .min(1)
          .max(7)
          .default(["front", "right", "back", "isometric"]),
        size: z.number().int().min(128).max(1024).default(512),
      })
      .strict(),
  },
  bb_animation_frames: {
    read: true,
    description:
      "Capture a frame sequence/contact sheet at explicit seconds for visual pose, clipping and loop inspection. Restores previous editor state. Numeric loop diagnostics are advisory.",
    schema: z
      .object({
        ...p,
        animation_id: id,
        times: z.array(z.number().finite().min(0).max(1000)).min(1).max(16),
        view: view.default("isometric"),
        size: z.number().int().min(128).max(512).default(256),
        contact_sheet: z.boolean().default(true),
      })
      .strict(),
  },
  bb_templates: {
    read: true,
    description:
      "Generate editable operation batches for handle, hinged door, two-part joint or box templates. Pass returned operations to bb_plan_edit; this tool does not change the model.",
    schema: templateSchema,
  },
  bb_history: {
    read: false,
    description:
      "Read Undo history or perform one Undo/Redo. Undo/Redo is blocked while protection rules exist because historic edits may affect protected parts.",
    schema: z
      .object({ ...p, action: z.enum(["list", "undo", "redo"]) })
      .strict(),
  },
  bb_texture_image: {
    read: true,
    description: "Get a PNG image of a texture or a particular layer.",
    schema: z
      .object({ ...p, texture_id: id, layer_id: id.optional() })
      .strict(),
  },
  bb_export: {
    read: false,
    description:
      "Compile a model, animation, controller, texture or Bedrock texture_set to a new file. Existing files are never overwritten. texture_animation exports the Blockbench 5.1.6 Bedrock entity render-controller or block flipbook reference for explicit texture_id. Optional typed flipbook settings override FPS and format-specific identifiers; defaults use that texture FPS and actual frame count. Unsaved block textures require flipbook.texture_path. Pure JSON; material requirements and native zero-tick rounding are returned in export_details.notes. No resource-pack merge or installation. texture_frame exports one zero-based frame_index from texture_id as PNG; composites current layers on a detached canvas, including pending layer paint, without changing selection, playback or source pixels. Static texture permits frame_index=0. texture_mcmeta requires texture_id in a Java texture_mcmeta format and uses native getMCMetaContent (including its compile event); writes only metadata, not the PNG, without changing the texture saved flag. Static textures produce an empty object. texture_set requires texture_group_id of a material group, uses native compileForBedrock, and supports uniform values without saved color textures; channel images are referenced by name, not bundled. This exports a copy without changing the material saved flag or adjacent source files. project creates an embedded-texture checkpoint; formats lists codecs. OBJ options.bundle=true includes MTL and PNGs in ZIP. controller_ids selects controllers. Compilation is not a game compatibility guarantee.",
    schema: z
      .object({
        ...p,
        codec: id.default("project"),
        filename: z.string().min(1).max(200).optional(),
        texture_id: id.optional(),
        frame_index:z.number().int().min(0).max(4095).optional(),
        flipbook:flipbookExportSchema.optional(),
        animation_ids: z.array(id).min(1).max(1000).optional(),
        controller_ids: z.array(id).min(1).max(1000).optional(),
        texture_group_id: id.optional(),
        options: z.record(z.string(), z.unknown()).default({}),
      })
      .strict(),
  },
  bb_restore_checkpoint: {
    read: false,
    description:
      "Open a saved bbmodel checkpoint in a new tab, preserving the original project. Filename must be inside the configured output directory.",
    schema: z.object({ filename: z.string().min(1).max(200) }).strict(),
  },
  bb_conversion_preview: {
    read: true,
    description:
      "Inspect potential losses before converting to another format. Conversion is not an ordinary Undoable edit.",
    schema: z.object({ ...p, format: id }).strict(),
  },
  bb_convert_copy: {
    read: false,
    description:
      "Convert a new copy of the current project, preserving the original tab and writing a source checkpoint first. Requires a current snapshot_id.",
    schema: z.object({ ...p, snapshot_id: id, format: id }).strict(),
  },
  bb_job: {
    read: true,
    description:
      "Inspect a request by request_id after timeout/disconnection; do not blindly repeat edits. Results persist in the plugin session until reload or cache eviction.",
    schema: z.object({ request_id: id }).strict(),
  },
} as const;
export type CommandName = keyof typeof commands;



