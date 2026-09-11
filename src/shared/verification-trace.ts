import { meshActionIds } from "./mesh-operation.ts";
type Entry = {
  check: string;
  tool: string;
  target: string | null;
  operation: string | null;
  fields: string[];
  success: boolean;
  count: number;
};

/** Records routes exercised by tests, never a claim that a whole feature passes. */
export class VerificationTrace {
  entries: Entry[] = [];
  private rows = new Map<string, Entry>();
  private dialogs = new Map<string, string>();
  private plans = new Map<string, string[]>();
  private surfaces = new Map<string, Map<string, string>>();
  private check = "setup";
  begin(check: string) {
    this.check = check;
  }
  record(tool: string, args: any, result: any, success: boolean) {
    if (tool === "bb_ui_snapshot" && success && result?.snapshot_id) {
      this.surfaces.set(
        result.snapshot_id,
        new Map(
          (result.nodes || []).map((node: any) => [
            node.id,
            node.dom_id ||
              (["button", "i"].includes(node.tag) && node.label
                ? `${node.tag}:${node.label.slice(0, 160)}`
                : `tag:${node.tag}`),
          ]),
        ),
      );
      while (this.surfaces.size > 8)
        this.surfaces.delete(this.surfaces.keys().next().value!);
    }
    const dialog = result?.dialog;
    if (dialog?.token && dialog?.id) this.dialogs.set(dialog.token, dialog.id);
    if (tool === "bb_plan_edit" && success && result?.plan_id)
      this.plans.set(
        result.plan_id,
        [
          ...new Set<string>((args.operations || []).map((op: any) => op.op)),
        ].sort(),
      );
    const targets: Record<string, string | undefined> = {
      bb_import_texture_set:'texture_set.import',
      bb_action: args.action_id,
      bb_control: args.control_id,
      bb_brush_settings: args.tool_id,
      bb_brush_presets: 'brush_presets',
      bb_color_pick: 'Painter.colorPicker',
      bb_brush_stroke: 'Painter.startPaintTool',
      bb_ik: 'NullObject.ik_target',
      bb_bake_ik: 'bake_ik_animation',
      bb_setting: args.setting_id,
      bb_export: args.codec || "project",
      bb_select: args.texture_playback ? `texture_playback.${args.texture_playback}` : args.texture_frame === undefined ? undefined : 'TextureAnimator.update',
      bb_import_model: args.codec,
      bb_loader: args.loader_id,
      bb_mesh_operation: meshActionIds[args.edit?.operation as keyof typeof meshActionIds],
      bb_uv_seams: "Mesh.setSeam",
      bb_create_project: args.format,
      bb_dialog: this.dialogs.get(args.dialog_token),
      bb_ui_interact: this.surfaces.get(args.snapshot_id)?.get(args.element_id),
    };
    const interesting =
      Object.hasOwn(targets, tool) ||
      [
        "bb_ui_interact",
        "bb_apply_plan",
        "bb_history",
        "bb_file_reply",
        "bb_edit_node_properties",
      ].includes(tool);
    if (!interesting) return;
    const fields =
      tool === 'bb_brush_stroke' ? [...new Set<string>([
        ...Object.keys(args).filter(key => !['project_id','snapshot_id'].includes(key)),
        ...['surface','copy_source'].flatMap(name => Object.keys(args[name] || {}).map(key => `${name}.${key}`)),
        ...(args.points || []).flatMap((point: any) => Object.keys(point).map(key => 'points.' + key)),
      ])].sort() : ['bb_select','bb_export'].includes(tool)
        ? Object.keys(args).filter(key => !['project_id','snapshot_id'].includes(key)).sort()
        : tool === 'bb_color_pick' ? [...Object.keys(args).filter(key => !['project_id','snapshot_id'].includes(key)),...Object.keys(args.options||{}).map(key=>'options.'+key)].sort() : tool === "bb_dialog"
        ? Object.keys(args.values || {}).sort()
        : tool === "bb_apply_plan" && success
          ? this.plans.get(args.plan_id) || []
          : tool === "bb_ui_interact" && args.pointer
            ? Object.keys(args.pointer).sort()
            : tool === "bb_edit_node_properties"
              ? Object.keys(args.values || {}).sort()
              : tool === "bb_mesh_operation"
                ? Object.keys(args.edit?.parameters || {}).sort()
                : tool === 'bb_brush_presets' ? Object.keys(args.edit?.preset||args.edit?.patch||{}).sort()
                : tool === 'bb_brush_settings' ? Object.keys(args.patch||{}).sort() : [];
    const row = {
      check: this.check,
      tool,
      target: targets[tool] || null,
      operation: tool==='bb_brush_presets'?args.edit?.action:tool==='bb_brush_settings'?(args.patch?'set':'inspect'):args.action || null,
      fields,
      success,
    };
    const key = JSON.stringify(row),
      prior = this.rows.get(key);
    if (prior) prior.count++;
    else {
      const entry = { ...row, count: 1 };
      this.rows.set(key, entry);
      this.entries.push(entry);
    }
  }
}
