import {withUvRotationUndo} from './uv-rotation-undo.ts';
import {withUvMirrorUndo} from './uv-mirror-undo.ts';
import { coreSplineDeleteHandler, withCoreSplineDelete } from './spline-delete.ts';
import { withSplineSelectionUndo, withSplineExtrusionUndo, withSplineSplitSelection } from './spline-selection-undo.ts';
import { z } from "zod";
import {brushPresetSchema} from '../shared/brush-presets.ts';
import {pickNativeColor} from './native-color-picker.ts';
import {nativeBrushStroke} from './native-brush-stroke.ts';
import {configureIK} from './native-ik.ts';
import {withIKBakeUndo,bakeIK} from './native-ik-bake.ts';
import { Fault, stable, clone, type Result } from "../shared/types.ts";
import type { Adapter, BB } from "./adapter.ts";
import { NativeUI } from "./native-ui.ts";
import { preparePixelSelection } from "./pixel-selection.ts";
import { withOutlinerUndo, withSplineCreationUndo } from "./native-undo.ts";
import { observeClipboardWrites } from "./native-clipboard.ts";
import { waitForImage } from "./image-loading.ts";
import { installCompatibility } from "./compatibility.ts";
import { validateBake } from "./legacy-editing.ts";
import { inspectPropertyValue } from "./property-value.ts";
import { runMeshOperation } from "./native-mesh-operation.ts";
import { editUvSeams } from "./native-uv-seams.ts";
import { SharedActionContext } from "./shared-action-context.ts";
import { NativeFiles } from "./native-files.ts";
import { validateMarkerName } from "./marker-colors-lifecycle.ts";
import {
  observeActionPromises,
  observeDialogPromises,
} from "./native-promises.ts";
import { keyboardInit } from "./native-keyboard.ts";

interface Extension {
  id: string;
  plugin: string;
  description: string;
  schema: z.ZodType;
  run: (
    input: any,
    context: { project: any; signal: AbortSignal },
  ) => unknown | Promise<unknown>;
  available?: () => boolean;
  tested_versions?: string[];
}
const registration = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_]+:[a-z0-9_.-]+$/)
    .max(160),
  plugin: z.string().min(1).max(160),
  description: z.string().min(1).max(2000),
  tested_versions: z.array(z.string().max(50)).max(30).optional(),
});

// A dynamic bridge complements the typed planner. Native handlers retain
// responsibility for their own Undo, filesystem operations and completion.
export class Integrations {
  bakeIK(args:any):Result {this.guard();this.adapter.project(args.project_id);return {data:bakeIK(this.b,args)};}
  configureIK(args:any):Result {this.guard();this.adapter.project(args.project_id);return {data:configureIK(this.b,args)};}
  async brushStroke(args:any):Promise<Result> {this.guard();this.adapter.project(args.project_id);return {data:await nativeBrushStroke(this.b,args)};}
  colorPick(args:any):Result {this.guard();this.adapter.project(args.project_id);return {data:pickNativeColor(this.b,args)};}
  brushPresets(args:any):Result {
    this.adapter.project(args.project_id);
    if(this.b.Blockbench.version!=='5.1.6')throw new Fault('VERSION_UNSUPPORTED','Brush presets require Blockbench 5.1.6');
    const edit=args.edit,list=this.b.StateMemory.brush_presets;
    if(!Array.isArray(list))throw new Fault('PRESET_STORAGE_UNAVAILABLE','Native brush preset storage is unavailable');
    if(edit.action==='list')return {data:{custom:clone(list),built_in:clone(this.b.Painter.default_brush_presets)}};
    this.guard();if(this.b.Dialog.open)throw new Fault('DIALOG_OPEN','Close the current dialog before editing presets');
    const source=edit.source==='built_in'?this.b.Painter.default_brush_presets:list;
    const matches=source.filter((p:any)=>p.name===edit.name);
    if(edit.action!=='create'&&matches.length!==1)throw new Fault('PRESET_NAME_AMBIGUOUS','Expected one preset with this exact name and source');
    if(edit.action==='load') {
      const preset=brushPresetSchema.parse(Object.fromEntries(Object.keys(brushPresetSchema.shape).filter(key=>Object.hasOwn(matches[0],key)).map(key=>[key,matches[0][key]])));
      const patch=Object.fromEntries(Object.entries(preset).filter(([key,value])=>key!=='name'&&value!==null));
      return {data:{preset:preset.name,source:edit.source,...this.brushSettings({project_id:args.project_id,tool_id:edit.tool_id,patch}).data as any}};
    }
    const next=edit.action==='create'?edit.preset:edit.action==='update'?{...matches[0],...edit.patch}:null;
    if(next&&list.some((p:any)=>p!==matches[0]&&p.name===next.name))throw new Fault('PRESET_NAME_EXISTS','A custom preset already has this name');
    const before=list.slice(),storage=localStorage.getItem('StateMemory.brush_presets');
    try {
      if(edit.action==='create')list.push(clone(next));
      else list.splice(list.indexOf(matches[0]),1,...(next?[clone(next)]:[]));
      this.b.StateMemory.save('brush_presets');
    } catch(error) {
      list.splice(0,list.length,...before);
      try{if(storage===null)localStorage.removeItem('StateMemory.brush_presets');else localStorage.setItem('StateMemory.brush_presets',storage);}catch(restore){throw new Fault('PRESET_ROLLBACK_FAILED','Preset persistence and restoration failed',{original:String(error),restore:String(restore)});}
      throw new Fault('PRESET_SAVE_FAILED','Preset save failed; previous preset list restored',{original:String(error)});
    }
    return {data:{action:edit.action,preset:next?clone(next):null,count:list.length,model_undo:false}};
  }
  brushSettings(args:any):Result {
    this.adapter.project(args.project_id);
    if(this.b.Blockbench.version!=='5.1.6')throw new Fault('VERSION_UNSUPPORTED','Brush settings require Blockbench 5.1.6');
    if(this.b.Toolbox.selected?.id!==args.tool_id || !this.b.Modes.paint)throw new Fault('BRUSH_CONTEXT_CHANGED','Select the declared brush in paint mode first');
    const ids:Record<string,string>={size:'slider_brush_size',opacity:'slider_brush_opacity',softness:'slider_brush_softness',shape:'brush_shape',blend_mode:'blend_mode',pixel_perfect:'pixel_perfect_drawing',lock_alpha:'lock_alpha',mirror_painting:'mirror_painting',fill_mode:'fill_mode',draw_shape:'draw_shape_type',copy_mode:'copy_brush_mode',color_erase_mode:'color_erase_mode'};
    const preferenceIds=['brush_opacity_modifier','brush_size_modifier','paint_with_stylus_only','pick_color_opacity','pick_combined_color','paint_side_restrict','color_picker_tool_switch','paint_through_transparency','limit_brush_opacity_per_stroke','move_with_selection_tool'];
    const read=()=>{const values=Object.fromEntries(Object.entries(ids).map(([key,id])=>{
      const item=this.b.BarItems[id];
      if(!item||item.plugin)throw new Fault('BRUSH_CONTROL_UNAVAILABLE','Expected a core brush control');
      return [key,{value:this.controlType(item)==='Toggle'?item.value:item.get(),available:this.available(item),...(this.controlType(item)==='BarSelect'?{options:Object.entries(item.options).map(([id,option])=>({id,available:typeof option!=='object'||this.available(option)}))}:{})}];
    }));
      for(const [key,property] of [['color','main_color'],['secondary_color','second_color']])values[key]={value:this.b.ColorPanel?.panel?.vue?.[property],available:!!this.b.ColorPanel?.panel?.vue};
      const mirror=this.b.BarItems.mirror_painting.tool_config?.options;
      values.mirror={value:mirror?clone({global:mirror.global,local:mirror.local,axis:mirror.axis,texture:mirror.texture,texture_center:mirror.texture_center||null,texture_frames:mirror.texture_frames}):null,available:!!mirror};
      const preferences=preferenceIds.map(id=>this.b.settings[id]);
      values.preferences={value:Object.fromEntries(preferenceIds.map((id,i)=>[id,preferences[i]?.master_value])),available:preferences.every(s=>s&&!s.plugin&&this.available(s)),...{effective_value:Object.fromEntries(preferenceIds.map((id,i)=>[id,preferences[i]?.value])),scope:'global_master'}};
      return values;
    };
    const before=read();
    if(args.patch) {
      this.guard();
      if(this.b.Dialog.open)throw new Fault('DIALOG_OPEN','Resolve the current dialog first');
      for(const key of Object.keys(args.patch))if(!before[key].available)throw new Fault('BRUSH_CONTROL_UNAVAILABLE',`${key} is unavailable for this brush`);
      for(const [key,value] of Object.entries(args.patch))if(ids[key]) {
        const item=this.b.BarItems[ids[key]];
        if(this.controlType(item)==='BarSelect') {
          const option=item.options[value as string];
          if(!Object.hasOwn(item.options,value as string)||(typeof option==='object'&&!this.available(option)))throw new Fault('BRUSH_OPTION_UNAVAILABLE',`${key} option is unavailable in the current format`);
        }
      }
      if(args.patch.mirror?.axis) {
        const axis={...before.mirror.value.axis,...args.patch.mirror.axis};
        if(!axis.x&&!axis.z)throw new Fault('MIRROR_AXIS_REQUIRED','At least one native mirror axis (x or z) must be enabled');
      }
      const attempted:string[]=[];
      const preferenceStorage=args.patch.preferences?new Map(['settings','settings_profiles','colors'].map(key=>[key,localStorage.getItem(key)])):null;
      const mirrorConfig=this.b.BarItems.mirror_painting.tool_config;
      const mirrorBefore=args.patch.mirror?clone(mirrorConfig.options):null;
      const mirrorStorage=args.patch.mirror?localStorage.getItem('tool_config.mirror_painting'):null;
      const colorChange=Object.keys(args.patch).some(key=>key==='color'||key==='secondary_color');
      const colorHistory=colorChange?[...this.b.ColorPanel.panel.vue._data.history]:null;
      const colorStorage=colorChange?localStorage.getItem('colors'):null;
      const set=(key:string,value:any,restore=false)=>{
        if(key==='preferences') {
          for(const [setting_id,v] of Object.entries(value))this.setting({setting_id,value:v});
        } else if(key==='mirror') {
          const options={...value,...(value.axis?{axis:{...mirrorConfig.options.axis,...value.axis}}:{})};
          mirrorConfig.changeOptions(options);
          this.b.BarItems.mirror_painting.onChange(this.b.BarItems.mirror_painting.value);
        } else if(key==='color'||key==='secondary_color')this.b.ColorPanel[restore?'change':'set'](value,key==='secondary_color');
        else this.control({project_id:args.project_id,control_id:ids[key],value,mode:'set'});
      };
      try {
        for(const [key,value] of Object.entries(args.patch)) {
          attempted.push(key);set(key,value);
        }
      } catch(error) {
        const failures:string[]=[];
        for(const key of attempted.reverse())try{set(key,before[key].value,true);}catch(e){failures.push(`${key}: ${String(e)}`);}
        if(mirrorBefore)try {
          mirrorConfig.changeOptions(mirrorBefore);
          if(mirrorStorage===null)localStorage.removeItem('tool_config.mirror_painting');else localStorage.setItem('tool_config.mirror_painting',mirrorStorage);
        }catch(e){failures.push(`mirror_config: ${String(e)}`);}
        if(colorHistory)try {
          const history=this.b.ColorPanel.panel.vue._data.history;
          history.splice(0,history.length,...colorHistory);
          if(colorStorage===null)localStorage.removeItem('colors');else localStorage.setItem('colors',colorStorage);
        } catch(e){failures.push(`color_history: ${String(e)}`);}
        if(preferenceStorage)try {
          for(const [key,value] of preferenceStorage)if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);
        }catch(e){failures.push(`preference_storage: ${String(e)}`);}
        if(failures.length)throw new Fault('BRUSH_ROLLBACK_FAILED','Brush setting restoration failed',{original:String(error),failures});
        throw new Fault('BRUSH_SETTINGS_FAILED','Brush settings failed; attempted values restored',{original:String(error)});
      }
    }
    return {data:{tool_id:args.tool_id,settings:read(),previous:before,model_undo:false}};
  }
  private sharedContext?:SharedActionContext;
  private sharedActions() {return this.sharedContext??=new SharedActionContext(this.b);}
  uvSeams(args:any): Result {
    this.guard();
    this.adapter.project(args.project_id);
    return {data:editUvSeams(this.b,args.targets)};
  }
  meshOperation(args: any): Result {
    this.guard();
    this.adapter.project(args.project_id);
    return {data:runMeshOperation(this.b,args.edit,args.mesh_ids)};
  }
  private disposeCompatibility: () => void;
  ui: NativeUI;
  files: NativeFiles;
  extensions = new Map<string, Extension>();
  private propertySnapshots = new Map<
    string,
    { node: any; project: string; fingerprint: string }
  >();
  propertyData(node: any) {
    return Object.fromEntries(
      Object.entries(node.constructor.properties ?? {}).map(([id, p]: any) => [
        id,
        {
          type: p.type,
          ...(p.type === "instance"
            ? { unavailable_reason: "native_instance" }
            : inspectPropertyValue(node[id])),
          values: p.enum_values,
          editable: [
            "string",
            "enum",
            "molang",
            "number",
            "boolean",
            "vector",
            "vector2",
            "vector4",
          ].includes(p.type),
        },
      ]),
    );
  }
  properties(args: any): Result {
    this.adapter.project(args.project_id);
    const node = this.b.OutlinerNode.uuids[args.node_id];
    if (!node) throw new Fault("NOT_FOUND", "Node not found");
    const data = this.propertyData(node),
      fingerprint = stable(data);
    if (fingerprint.length > 2000000)
      throw new Fault("RESPONSE_SIZE", "Node properties exceed 2 MB");
    const property_snapshot_id = crypto.randomUUID();
    this.propertySnapshots.set(property_snapshot_id, {
      node,
      project: args.project_id,
      fingerprint,
    });
    while (this.propertySnapshots.size > 16)
      this.propertySnapshots.delete(
        this.propertySnapshots.keys().next().value!,
      );
    return {
      data: {
        node_id: node.uuid,
        type: node.type,
        property_snapshot_id,
        properties: data,
      },
    };
  }
  editProperties(args: any): Result {
    this.guard();
    this.adapter.project(args.project_id);
    const b = this.b,
      node = b.OutlinerNode.uuids[args.node_id],
      snapshot = this.propertySnapshots.get(args.property_snapshot_id);
    if (
      !node ||
      !snapshot ||
      snapshot.node !== node ||
      snapshot.project !== args.project_id ||
      snapshot.fingerprint !== stable(this.propertyData(node))
    )
      throw new Fault(
        "STALE_PROPERTIES",
        "Node properties changed; inspect them again",
      );
    const properties = node.constructor.properties ?? {};
    for (const [id, value] of Object.entries(args.values)) {
      if (!Object.hasOwn(properties, id))
        throw new Fault("PROPERTY_UNKNOWN", `Property ${id} is not registered`);
      const p = properties[id],
        type = p.type;
      if (!this.propertyData(node)[id].editable)
        throw new Fault(
          "PROPERTY_ADAPTER_REQUIRED",
          `Property ${id} requires a dedicated adapter`,
        );
      if (!b.Condition(p.condition, node))
        throw new Fault(
          "PROPERTY_UNAVAILABLE",
          `Property ${id} condition is false`,
        );
      const dim =
        type === "vector"
          ? 3
          : type === "vector2"
            ? 2
            : type === "vector4"
              ? 4
              : 0;
      if (
        dim
          ? !Array.isArray(value) ||
            value.length !== dim ||
            value.some((v) => typeof v !== "number" || !Number.isFinite(v))
          : type === "number"
            ? typeof value !== "number" || !Number.isFinite(value)
            : type === "boolean"
              ? typeof value !== "boolean"
              : typeof value !== "string"
      )
        throw new Fault("PROPERTY_TYPE", `Wrong type for ${id}`);
      if (type === "enum" && p.enum_values && !p.enum_values.includes(value))
        throw new Fault("PROPERTY_ENUM", `Unknown enum value for ${id}`);
      if (p.merge_validation && !p.merge_validation(value))
        throw new Fault(
          "PROPERTY_VALIDATION",
          `Property ${id} rejected the value`,
        );
      const panel = p.inputs?.element_panel,
        limits = panel?.input;
      if (limits) {
        for (const v of Array.isArray(value) ? value : [value])
          if (
            typeof v === "number" &&
            ((typeof limits.min === "number" && v < limits.min) ||
              (typeof limits.max === "number" && v > limits.max))
          )
            throw new Fault(
              "PROPERTY_RANGE",
              `Property ${id} is outside its declared range`,
            );
      }
      if (panel?.onChange) {
        const selected = [
          ...b.Project.selected_elements,
          ...b.Project.selected_groups,
        ];
        if (selected.length !== 1 || selected[0] !== node)
          throw new Fault(
            "PROPERTY_SELECTION_REQUIRED",
            "Select only the target node before invoking its native property callbacks",
          );
      }
    }
    this.propertySnapshots.delete(args.property_snapshot_id);
    const aspects =
      node instanceof b.Group ? { groups: [node] } : { elements: [node] };
    b.Undo.initEdit(aspects);
    try {
      node.extend(args.values);
      for (const [id, value] of Object.entries(args.values)) {
        if (stable(node[id]) !== stable(value))
          throw new Fault(
            "PROPERTY_NOT_APPLIED",
            `Native implementation did not accept ${id}`,
          );
        properties[id].inputs?.element_panel?.onChange?.(value, [node]);
      }
      b.Canvas.updateAll();
      b.Undo.finishEdit("MCP native properties", aspects);
    } catch (error) {
      b.Undo.cancelEdit(true);
      b.Canvas.updateAll();
      throw error;
    }
    return this.properties(args);
  }
  private tokens = new WeakMap<object, string>();
  private dialogStates = new WeakMap<object, string>();
  private controlIds = new WeakMap<object, string>();
  dialogControls(d: any) {
    const controls = Array.from(
      d.object?.querySelectorAll(
        'input:not([type="hidden"]),select,textarea',
      ) ?? [],
    ) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
    return controls.map((element) => {
      if (!this.controlIds.has(element))
        this.controlIds.set(element, crypto.randomUUID());
      const input = element as HTMLInputElement;
      const type =
        element.tagName === "SELECT" ? "select" : (input.type ?? "text");
      return {
        element,
        id: this.controlIds.get(element)!,
        type,
        label:
          element.getAttribute("aria-label") ??
          input.labels?.[0]?.textContent?.trim() ??
          element.id,
        value:
          type === "password" || type === "file"
            ? "[redacted]"
            : type === "checkbox" || type === "radio"
              ? input.checked
              : element.value,
        disabled: element.disabled,
        readonly: !!input.readOnly,
        visible:
          !!element.getClientRects().length &&
          getComputedStyle(element).visibility !== "hidden",
        options:
          element.tagName === "SELECT"
            ? Array.from((element as HTMLSelectElement).options).map((o) => ({
                value: o.value,
                label: o.text,
                disabled: o.disabled,
              }))
            : undefined,
      };
    });
  }
  dialogFingerprint(d: any) {
    return stable({
      form: d.getFormResult?.() ?? {},
      controls: this.dialogControls(d).map(({ element, ...data }) => data),
    });
  }
  private cancellation = new AbortController();
  constructor(
    public adapter: Adapter,
    private guard: (allowedUndoSave?: any) => void,
  ) {
    this.ui = new NativeUI(adapter.b, root => this.guard(root ? this.coreDialogUndo(root) : undefined));
    this.files = new NativeFiles(adapter, guard);
    this.disposeCompatibility = installCompatibility(adapter.b);
  }
  get b(): BB {
    return this.adapter.b;
  }
  api() {
    return Object.freeze({
      version: "1",
      schema: z,
      register: (extension: Extension) => this.register(extension),
    });
  }
  register(extension: Extension) {
    if (this.cancellation.signal.aborted)
      throw new Fault("UNLOADED", "Integration API was unloaded");
    registration.parse(extension);
    if (!extension.id.startsWith(`${extension.plugin}:`))
      throw new Fault("EXTENSION_ID", "Extension IDs must start with plugin:");
    if (this.extensions.has(extension.id))
      throw new Fault("EXTENSION_DUPLICATE", "Extension ID already registered");
    if (
      typeof extension.run !== "function" ||
      typeof extension.schema?.parse !== "function"
    )
      throw new Fault(
        "EXTENSION_SCHEMA",
        "Provide a Zod schema and run function",
      );
    z.toJSONSchema(extension.schema); // Reject non-serializable schemas at registration.
    const saved = { ...extension };
    this.extensions.set(extension.id, saved);
    return () => {
      if (this.extensions.get(extension.id) === saved)
        this.extensions.delete(extension.id);
    };
  }
  dispose() {
    this.files.dispose();
    this.disposeCompatibility();
    this.ui.dispose();
    this.propertySnapshots.clear();
    this.cancellation.abort();
    this.extensions.clear();
  }
  available(item: any): boolean {
    try {
      return !!(this.b.BARS?.condition
        ? this.b.BARS.condition(item.condition, item)
        : this.b.Condition(item.condition));
    } catch {
      return false;
    }
  }
  extensionAvailable(extension: Extension) {
    try {
      return !extension.available || !!extension.available();
    } catch {
      return false;
    }
  }
  formAvailable(config: any, values: any): boolean {
    try {
      return !!this.b.Condition(config.condition, values);
    } catch {
      return false;
    }
  }
  catalog(args: any): Result {
    const b = this.b,
      rows: any[] = [];
    const add = (
      kind: string,
      items: Record<string, any>,
      describe: (id: string, x: any) => any,
    ) => {
      if (args.kind !== "all" && args.kind !== kind) return;
      for (const [id, item] of Object.entries(items ?? {}))
        rows.push({ kind, id, ...describe(id, item) });
    };
    add("loaders", b.ModelLoader?.loaders, (_, l) => ({
      name: l.name,
      description: l.description,
      plugin: l.plugin,
      available: this.available(l),
      coverage: "native_loader_unverified",
    }));
    add("formats", b.Formats, (_, f) => ({
      name: f.name,
      plugin: f.plugin,
      codec: f.codec?.id,
      can_create: typeof f.new === "function",
      capabilities: Object.fromEntries(
        Object.entries(f).filter(
          ([key, value]) => typeof value === "boolean" && key !== "selected",
        ),
      ),
      coverage: "native_format_unverified",
    }));
    add("panels", b.Panels, (_, p) => ({
      name: p.name,
      plugin: p.plugin,
      available: this.available(p),
      custom_component: !!p.inside_vue,
      coverage: "custom_ui_inspection_required",
    }));
    add(
      "previews",
      Object.fromEntries((b.Preview?.all ?? []).map((p: any) => [p.id, p])),
      (_, p) => ({
        selected: p === b.Preview.selected,
        visible: p.canvas.isConnected && p.width > 0 && p.height > 0,
        orthographic: p.isOrtho,
        coverage: "native_preview_unverified",
      }),
    );
    add("actions", b.BarItems, (_, a) => ({
      name: a.name,
      description: a.description,
      plugin: a.plugin || null,
      type: a.constructor?.name,
      available: this.available(a),
      invocable: !(a.id==='merge_splines'&&!a.plugin&&b.Blockbench.version==='5.1.6') && !!b.Action && a instanceof b.Action,
      control: this.controlType(a),
      value:
        this.controlType(a) === "ColorPicker"
          ? a.get().toHex8String()
          : this.controlType(a)
            ? a.value
            : undefined,
      options: b.BarSelect && a instanceof b.BarSelect ? a.values : undefined,
      coverage: a.id==='merge_splines'&&!a.plugin&&b.Blockbench.version==='5.1.6'?"native_unimplemented":"native_dispatch_unverified",
      completion: "handler_owned",
      undo: "handler_owned",
    }));
    add("settings", b.settings, (_, s) => ({
      name: s.name,
      description: s.description,
      plugin: s.plugin || null,
      type: s.type,
      available: this.available(s),
      value: s.type === "password" ? "[redacted]" : s.value,
      options: typeof s.options === "object" ? s.options : undefined,
      min: s.min,
      max: s.max,
      step: s.step,
      requires_restart: s.requires_restart,
      editable: !["password", "click"].includes(s.type),
    }));
    add("modes", b.Modes?.options, (_, m) => ({
      name: m.name,
      available: this.available(m),
      plugin: m.plugin || null,
    }));
    add("codecs", b.Codecs, (_, c) => ({
      name: c.name,
      plugin: c.plugin || null,
      compile: typeof c.compile === "function",
      load:
        typeof c.load === "function" &&
        (c.load !== b.Codec.prototype.load || typeof c.parse === "function"),
      import_adapter_required: c.load === b.Codec.prototype.load && !c.format,
      input_type: c.load_filter?.type,
      export_options: Object.fromEntries(
        Object.entries(c.export_options ?? {}).map(([id, config]: any) => [
          id,
          {
            type: config.type ?? "text",
            label: config.label,
            min: config.min,
            max: config.max,
            options:
              typeof config.options === "object" ? config.options : undefined,
          },
        ]),
      ),
      extension: c.extension,
      format: c.format?.id,
      coverage: "native_codec_unverified",
    }));
    add(
      "codecs",
      Object.fromEntries(
        Object.entries(b.AnimationCodec?.codecs ?? {}).map(([id, c]) => [
          `animation:${id}`,
          c,
        ]),
      ),
      (_, c) => ({
        compile:
          typeof c.compileFile === "function" ||
          typeof c.compileAnimation === "function",
        coverage: "native_animation_codec_unverified",
        load: typeof c.loadFile === "function",
      }),
    );
    add("node_types", b.OutlinerElement?.types, (_, c) => ({
      name: c.name,
      properties: Object.fromEntries(
        Object.entries(c.properties ?? {}).map(([id, p]: any) => [
          id,
          { type: p.type, exposed: p.exposed },
        ]),
      ),
      coverage: [b.Cube, b.Mesh].includes(c)
        ? "typed_editor"
        : "native_read_adapter_required",
    }));
    add("plugins", b.Plugins?.registered, (_, p) => ({
      name: p.title,
      version: p.version,
      installed: p.installed,
      disabled: p.disabled,
      source: p.source,
      coverage: "detected_only",
    }));
    add(
      "extensions",
      Object.fromEntries(this.extensions),
      (id, e: Extension) => ({
        plugin: e.plugin,
        description: e.description,
        input_schema: z.toJSONSchema(e.schema),
        available: this.extensionAvailable(e),
        tested_versions: e.tested_versions ?? [],
        coverage: "provider_adapter",
        verification: "provider_declared",
      }),
    );
    const filtered = rows.filter(
      (r) =>
        (!args.plugin ||
          r.plugin === args.plugin ||
          (r.kind === "plugins" && r.id === args.plugin)) &&
        `${r.id} ${r.name ?? ""} ${r.description ?? ""}`
          .toLowerCase()
          .includes(args.search.toLowerCase()),
    );
    filtered.sort((a, b) =>
      `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
    );
    return {
      data: {
        total: filtered.length,
        items: filtered.slice(args.offset, args.offset + args.limit),
        next_offset:
          args.offset + args.limit < filtered.length
            ? args.offset + args.limit
            : null,
        coverage_note:
          "Registration is discovery, not proof of full compatibility. Private APIs, custom UI and OS dialogs require adapters.",
      },
    };
  }
  dialog() {
    const d = this.b.Dialog?.open;
    if (!d) return null;
    const values = d.getFormResult?.() ?? {},
      fields: any = {};
    const fingerprint = this.dialogFingerprint(d);
    if (!this.tokens.has(d) || this.dialogStates.get(d) !== fingerprint)
      this.tokens.set(d, crypto.randomUUID());
    this.dialogStates.set(d, fingerprint);
    for (const [key, config] of Object.entries(d.form_config ?? {}) as [
      string,
      any,
    ][]) {
      fields[key] = {
        type: config.type ?? "text",
        label: config.label,
        min: config.min,
        max: config.max,
        readonly: !!config.readonly,
        available: this.formAvailable(config, values),
        options:
          typeof config.options === "object" ? config.options : undefined,
        value:
          config.type === "password"
            ? "[redacted]"
            : config.type === "color"
              ? (values[key]?.toHex8String?.() ?? values[key])
              : values[key],
      };
    }
    return {
      id: d.id,
      token: this.tokens.get(d),
      title: d.title,
      fields,
      buttons: d.buttons,
      custom_component: !!d.component,
      form_supported: !!d.form,
      controls: this.dialogControls(d).map(({ element, ...data }) => data),
    };
  }
  editor(args:any={}): Result {
    const b = this.b;
    return {
      data: {
        project_id: b.Project?.uuid ?? null,
        mode: b.Modes?.selected?.id,
        active_panel: b.Prop?.active_panel??null,
        shared_actions: args.include_shared_actions?this.sharedActions().read():undefined,
        tool: b.Toolbox?.selected?.id,
        node_ids: [
          ...(b.Project?.selected_elements ?? []),
          ...(b.Project?.selected_groups ?? []),
        ].map((n: any) => n.uuid),
        texture_id: b.Texture?.selected?.uuid,
        texture_frame: b.Texture?.selected?.currentFrame??null,
        texture_frame_count: b.Texture?.selected?(b.Texture.selected.frameCount||1):null,
        texture_animation_playing: !!b.TextureAnimator?.isPlaying,
        layer_id: b.Texture?.selected?.getActiveLayer?.()?.uuid,
        pixel_selection: b.Texture?.selected
          ? {
              width: b.Texture.selected.selection.width,
              height: b.Texture.selected.selection.height,
              override: b.Texture.selected.selection.override,
              has_selection: !!b.Texture.selected.selection.hasSelection(),
              native_crop_rect: (()=>{const r=b.Texture.selected.selection.getBoundingRect();return [r.start_x,r.start_y,r.width,r.height];})(),
            }
          : undefined,
        animation_id: b.Animation?.selected?.uuid,
        controller_id: b.AnimationController?.selected?.uuid,
        controllers: (b.AnimationController?.all ?? []).map((c: any) => ({
          id: c.uuid,
          name: c.name,
          initial_state: c.initial_state,
          states: c.states.map((s: any) => ({ id: s.uuid, name: s.name })),
        })),
        time: b.Timeline?.time,
        spline_selection: b.Project?.spline_selection ?? {},
        mesh_selection: b.Project?.mesh_selection ?? {},
        face_selection: Object.fromEntries(
          (b.Outliner.selected ?? [])
            .filter((n: any) => n.faces)
            .map((n: any) => [n.uuid, [...b.UVEditor.getSelectedFaces(n)]]),
        ),
        keyframe_ids: (b.Timeline?.selected ?? []).map((k: any) => k.uuid),
        timeline_animator_ids: (b.Timeline?.animators ?? []).map(
          (a: any) => a.uuid,
        ),
        dialog: this.dialog(),
      },
    };
  }
  select(args: any): Result {
    this.adapter.assertIdle();
    const b = this.b,
      p = this.adapter.project(args.project_id);
    if(args.panel_id && ((!b.Panels?.[args.panel_id] && args.panel_id!=='preview') || typeof b.setActivePanel!=='function'))
      throw new Fault('PANEL_NOT_FOUND','panel_id must identify a registered native panel');
    const nodes = args.node_ids.map((id: string) => {
      const n = b.OutlinerNode.uuids[id];
      if (!n) throw new Fault("NOT_FOUND", `Node ${id} not found`);
      return n;
    });
    const mode = args.mode ? b.Modes.options[args.mode] : null;
    const texture = args.texture_id
      ? b.Texture.all.find((t: any) => t.uuid === args.texture_id)
      : null;
    const animation = args.animation_id
      ? b.Animation.all.find((a: any) => a.uuid === args.animation_id)
      : null;
    const controller = args.controller_id
      ? b.AnimationController?.all.find(
          (c: any) => c.uuid === args.controller_id,
        )
      : null;
    if (args.controller_id && (args.animation_id || args.keyframe_ids?.length))
      throw new Fault(
        "SELECTION_CONFLICT",
        "Select an animation or a controller in one call",
      );
    if (args.controller_id && !controller)
      throw new Fault("NOT_FOUND", "Animation controller not found");
    if (controller && (args.mode ?? b.Modes.selected.id) !== "animate")
      throw new Fault(
        "MODE_UNAVAILABLE",
        "Animation controllers require animate mode",
      );
    if (args.mode && (!mode || !this.available(mode)))
      throw new Fault("MODE_UNAVAILABLE", "Mode is unavailable");
    if (args.texture_id && !texture)
      throw new Fault("NOT_FOUND", "Texture not found");
    if ((args.layer_id || args.pixel_selection) && !texture)
      throw new Fault(
        "PIXEL_SELECTION",
        "Explicit texture_id is required for layer or pixel selection",
      );
    if(args.texture_playback!==undefined) {
      if(args.texture_frame!==undefined||args.time!==undefined)throw new Fault('SELECTION_CONFLICT','Do not combine texture_playback with texture_frame or animation time');
      if(!b.Format.animated_textures)throw new Fault('TEXTURE_PLAYBACK','Texture playback requires an animated_textures format');
      if(args.texture_playback==='play'&&!b.Texture.all.some((t:any)=>t.frameCount>1))throw new Fault('TEXTURE_PLAYBACK','Play requires at least one animated texture');
    }
    if(args.texture_frame!==undefined) {
      if(!texture)throw new Fault('TEXTURE_FRAME','texture_frame requires explicit texture_id');
      if(args.time!==undefined)throw new Fault('SELECTION_CONFLICT','Do not combine texture_frame with animation time');
      if(!b.Format.animated_textures||!(texture.frameCount>1)||args.texture_frame>=texture.frameCount)throw new Fault('TEXTURE_FRAME','Frame index must refer to an existing frame of an animated texture');
    }
    const layer = args.layer_id
      ? texture.layers.find((l: any) => l.uuid === args.layer_id)
      : null;
    if (args.layer_id && (!texture.layers_enabled || !layer))
      throw new Fault("NOT_FOUND", "Active texture layer not found");
    const applyPixels = args.pixel_selection
      ? preparePixelSelection(texture, args.pixel_selection)
      : null;
    if (args.animation_id && !animation)
      throw new Fault("NOT_FOUND", "Animation not found");
    const meshSelections: Record<string, any> = {};
    const faceSelections: Array<[any, string[]]> = [];
    for (const [id, faces] of Object.entries(args.face_selection ?? {}) as [
      string,
      string[],
    ][]) {
      const node = nodes.find((n: any) => n.uuid === id);
      if (
        !node?.faces ||
        node.getTypeBehavior("select_faces") === false ||
        faces.some((face) => !Object.hasOwn(node.faces, face))
      )
        throw new Fault(
          "FACE_SELECTION",
          "Select an existing face-capable node and valid face IDs",
        );
      if (args.mesh_selection?.[id])
        throw new Fault(
          "SELECTION_CONFLICT",
          "Do not specify face_selection and mesh_selection for the same node",
        );
      faceSelections.push([node, [...new Set(faces)]]);
    }
    for (const [id, selection] of Object.entries(args.mesh_selection ?? {}) as [
      string,
      any,
    ][]) {
      const mesh = nodes.find((n: any) => n.uuid === id);
      if (!(mesh instanceof b.Mesh))
        throw new Fault("MESH_SELECTION", "Mesh must be in node_ids");
      const vertices = new Set<string>(selection.vertices);
      for (const face of selection.faces) {
        if (!Object.hasOwn(mesh.faces, face))
          throw new Fault("MESH_SELECTION", `Unknown face ${face}`);
        if(selection.vertex_policy!=='explicit')for (const vertex of mesh.faces[face].vertices) vertices.add(vertex);
      }
      for (const edge of selection.edges) {
        if (
          edge[0] === edge[1] ||
          !Object.values(mesh.faces).some((f: any) => {
            const vs = f.getSortedVertices();
            return vs.some(
              (v: string, i: number) =>
                v === edge[0] &&
                [
                  vs[(i + 1) % vs.length],
                  vs[(i + vs.length - 1) % vs.length],
                ].includes(edge[1]),
            );
          })
        )
          throw new Fault("MESH_SELECTION", "Edge is not part of the mesh");
        if(selection.vertex_policy!=='explicit')for (const vertex of edge) vertices.add(vertex);
      }
      for (const vertex of vertices)
        if (!Object.hasOwn(mesh.vertices, vertex))
          throw new Fault("MESH_SELECTION", `Unknown vertex ${vertex}`);
      meshSelections[id] = {
        vertices: [...vertices],
        faces: [...new Set(selection.faces)],
        edges: selection.edges,
      };
    }
    const splineSelections:Record<string,{vertices:string[]}>= {};
    for(const [id,selection] of Object.entries(args.spline_selection??{}) as [string,any][]){
      const node=nodes.find((n:any)=>n.uuid===id);
      if(node?.type!=='spline'||(args.mode??b.Modes.selected.id)!=='edit')throw new Fault('SPLINE_SELECTION','Select a spline in edit mode');
      const vertices=new Set<string>(selection.vertices);
      const handles=new Set<string>(selection.handles);
      for(const key of selection.curves){
        const curve=node.curves[key];if(!curve)throw new Fault('SPLINE_SELECTION',`Unknown curve ${key}`);
        handles.add(curve.start_handle);handles.add(curve.end_handle);
      }
      for(const key of handles){
        const handle=node.handles[key];if(!handle)throw new Fault('SPLINE_SELECTION',`Unknown handle ${key}`);
        for(const v of [handle.control1,handle.joint,handle.control2])vertices.add(v);
      }
      for(const key of vertices)if(!Object.hasOwn(node.vertices,key))throw new Fault('SPLINE_SELECTION',`Unknown vertex ${key}`);
      splineSelections[id]={vertices:[...vertices]};
    }
    const activeAnimation = animation ?? b.Animation.selected;
    if (
      args.time !== undefined &&
      (!activeAnimation ||
        controller ||
        (args.mode ?? b.Modes.selected.id) !== "animate")
    )
      throw new Fault(
        "TIMELINE_UNAVAILABLE",
        "Timeline time requires an animation in animate mode",
      );
    const keys = args.keyframe_ids?.map((id: string) => {
      const key = Object.values(activeAnimation?.animators ?? {})
        .flatMap((a: any) => a.keyframes)
        .find((k: any) => k.uuid === id);
      if (!key) throw new Fault("KEY_SELECTION", `Unknown keyframe ${id}`);
      return key;
    });
    if (keys && (args.mode ?? b.Modes.selected.id) !== "animate")
      throw new Fault(
        "KEY_SELECTION",
        "Keyframe selection requires animate mode",
      );
    const priorTextureFrames=args.texture_frame!==undefined||args.texture_playback!==undefined?new Map<any,number>(b.Texture.all.map((t:any)=>[t,t.currentFrame])):null;
    mode?.select();
    animation?.select();
    controller?.select();
    for (const n of [...p.elements, ...p.groups]) n.selected = false;
    p.selected_elements.splice(
      0,
      p.selected_elements.length,
      ...nodes.filter((n: any) => !(n instanceof b.Group)),
    );
    p.selected_groups.splice(
      0,
      p.selected_groups.length,
      ...nodes.filter((n: any) => n instanceof b.Group),
    );
    for (const n of nodes) n.selected = true;
    if (args.mesh_selection) p.mesh_selection = meshSelections;
    if(args.spline_selection)p.spline_selection=splineSelections;
    texture?.select();
    layer?.select();
    applyPixels?.();
    if (applyPixels) b.UVEditor.updateSelectionOutline();
    b.updateSelection();
    for (const [node, faces] of faceSelections)
      b.UVEditor.getSelectedFaces(node, true).splice(0, Infinity, ...faces);
    if (faceSelections.length) b.UVEditor.loadData();
    if (keys) {
      for (const key of b.Timeline.selected) key.selected = false;
      b.Timeline.selected.splice(0);
      for (const key of keys) (key as any).select({ ctrlOrCmd: true });
    }
    if (args.time !== undefined) {
      b.Timeline.pause();
      b.Timeline.setTime(args.time);
      b.Animator.preview();
    }
    if(args.texture_frame!==undefined) {
      b.TextureAnimator.stop();if(b.Timeline.playing)b.Timeline.pause();
      b.UVEditor.previous_animation_frame=priorTextureFrames!.get(texture);
      for(const [t,frame] of priorTextureFrames!)t.currentFrame=t===texture?args.texture_frame:frame;
      b.TextureAnimator.update([...priorTextureFrames!.keys()].filter((t:any)=>t.frameCount>1));
    }
    if(args.texture_playback!==undefined) {
      if(b.Timeline.playing)b.Timeline.pause();
      if(args.texture_playback==='reset') {
        if(b.UVEditor.img)b.TextureAnimator.reset();
        else {
          // Native 5.1.6 reset assumes the UV image DOM exists, including in empty projects.
          b.TextureAnimator.stop();
          for(const t of b.Texture.all)if(t.frameCount)t.currentFrame=0;
          for(const el of b.Outliner.elements)if(el.faces&&el.preview_controller.updateUV)el.preview_controller.updateUV(el);
          b.UVEditor.updateSelectionOutline(true);b.UVEditor.vue.updateTextureCanvas();
        }
      }
      else {
        for(const [t,frame] of priorTextureFrames!)t.currentFrame=frame;
        if(args.texture_playback==='pause')b.TextureAnimator.stop();
        else if(!b.TextureAnimator.isPlaying)b.TextureAnimator.start();
      }
      b.TextureAnimator.update([...priorTextureFrames!.keys()]);
    }
    if(args.panel_id)b.setActivePanel(args.panel_id);
    return this.editor(args);
  }
  uvSelectIsland(args: any): Result {
    this.adapter.assertIdle();
    const b = this.b,
      p = this.adapter.project(args.project_id);
    if (b.Blockbench.version !== "5.1.6")
      throw new Fault("VERSION_UNSUPPORTED", "UV island selection requires Blockbench 5.1.6");
    if (b.Modes.selected?.id !== "edit")
      throw new Fault("MODE_UNAVAILABLE", "UV island selection requires edit mode");
    const meshes = args.mesh_ids.map((id: string) => {
      const mesh = b.OutlinerNode.uuids[id];
      if (!(mesh instanceof b.Mesh))
        throw new Fault("TYPE_MISMATCH", "UV island selection requires Mesh nodes");
      return mesh;
    });
    const seeds = new Map<string, string>();
    for (const seed of args.seeds) {
      const mesh = meshes.find((candidate: any) => candidate.uuid === seed.mesh_id)!;
      if (!mesh.faces?.[seed.face_id])
        throw new Fault("NOT_FOUND", `Face ${seed.face_id} not found on mesh ${seed.mesh_id}`);
      seeds.set(seed.mesh_id, seed.face_id);
    }
    const strictUvMatch = (a: number, bValue: number) =>
      Math.abs(a - bValue) < args.tolerance;
    const islandFor = (mesh: any, seedFace: string) => {
      const selected = b.UVEditor.getSelectedFaces(mesh, true);
      const result = new Set<string>(
        args.selection_mode === "add" ? selected : [],
      );
      const visited = new Set<string>();
      const face = mesh.faces[seedFace];
      const crawl = (current: any, currentKey: string) => {
        if (visited.has(currentKey)) return;
        visited.add(currentKey);
        result.add(currentKey);
        const verticesByFace: Record<string, string[]> = {};
        for (const [candidateKey, candidate] of Object.entries(mesh.faces) as [string, any][])
          for (const vertex of candidate.vertices) (verticesByFace[vertex] ??= []).push(candidateKey);
        for (let i = 0; i < current.vertices.length; i++) {
          const adjacent = current.getAdjacentFace(i, verticesByFace);
          if (!adjacent || visited.has(adjacent.key)) continue;
          const a1 = adjacent.face.uv?.[adjacent.edge[0]], a2 = current.uv?.[adjacent.edge[0]];
          const b1 = adjacent.face.uv?.[adjacent.edge[1]], b2 = current.uv?.[adjacent.edge[1]];
          if (!a1 || !a2 || !b1 || !b2) continue;
          if (!strictUvMatch(a1[0], a2[0]) || !strictUvMatch(a1[1], a2[1])) continue;
          if (!strictUvMatch(b1[0], b2[0]) || !strictUvMatch(b1[1], b2[1])) continue;
          crawl(adjacent.face, adjacent.key);
        }
      };
      crawl(face, seedFace);
      selected.splice(0, Infinity, ...result);
      return [...result];
    };
    p.selected_elements.splice(0, p.selected_elements.length, ...meshes);
    p.selected_groups.splice(0, p.selected_groups.length);
    for (const node of [...p.elements, ...p.groups]) node.selected = meshes.includes(node);
    if (b.BarItems.selection_mode?.set) b.BarItems.selection_mode.set("face");
    b.updateSelection();
    const selection: Record<string, string[]> = {};
    for (const mesh of meshes) selection[mesh.uuid] = islandFor(mesh, seeds.get(mesh.uuid)!);
    b.UVEditor.loadData();
    return {
      data: {
        project_id: p.uuid,
        mesh_ids: meshes.map((mesh: any) => mesh.uuid),
        selection,
        island_sizes: Object.fromEntries(Object.entries(selection).map(([id, faces]) => [id, faces.length])),
        tolerance: args.tolerance,
        selection_mode: args.selection_mode,
        model_undo: false,
        native_compatibility: "strict shared-edge UV matching; explicit multi-Mesh extension",
      },
    };
  }
  loader(args: any): Result {
    this.guard();
    const loader = this.b.ModelLoader?.loaders[args.loader_id];
    if (!loader || !this.available(loader))
      throw new Fault("LOADER_UNAVAILABLE", "Loader is missing or unavailable");
    if (this.b.Dialog.open)
      throw new Fault("DIALOG_OPEN", "Resolve the current dialog first");
    loader.new();
    return {
      data: {
        loader_id: loader.id,
        completion: "handler_dispatched",
        dialog: this.dialog(),
      },
    };
  }
  async importAnimation(args: any): Promise<Result> {
    this.guard();
    const b = this.b,
      project = this.adapter.project(args.project_id);
    if (b.Dialog.open)
      throw new Fault("DIALOG_OPEN", "Resolve the current dialog first");
    if (!b.Format.animation_mode)
      throw new Fault(
        "FORMAT_UNSUPPORTED",
        "This format does not support animation",
      );
    const codecId = args.codec.replace(/^animation:/, "");
    const codec = b.AnimationCodec?.codecs[codecId];
    if (typeof codec?.loadFile !== "function")
      throw new Fault(
        "CODEC_UNSUPPORTED",
        "Animation codec has no loadFile method",
      );
    const text = new TextDecoder().decode(
      Uint8Array.from(atob(args.content), (c: string) => c.charCodeAt(0)),
    );
    const json = b.autoParseJSON(text, false);
    if (!json || typeof json !== "object" || Array.isArray(json))
      throw new Fault("IMPORT_JSON", "Animation file must contain an object");
    if (json.animation_controllers && !b.Format.animation_controllers)
      throw new Fault(
        "FORMAT_UNSUPPORTED",
        "This format does not support animation controllers",
      );
    const aspects = () => ({
      animations: [...b.Animation.all],
      animation_controllers: [...b.AnimationController.all],
    });
    const before = new Set([...b.Animation.all, ...b.AnimationController.all]);
    const saved = project.saved;
    b.Undo.initEdit(aspects());
    const undoSave = b.Undo.current_save;
    try {
      await codec.loadFile(
        { name: args.filename, path: args.path, content: text, json },
        args.names,
      );
      this.adapter.project(project.uuid);
      if (b.Undo.current_save !== undoSave)
        throw new Fault(
          "UNDO_INTERFERENCE",
          "Animation loader replaced the active Undo transaction",
        );
      const imported = [
        ...b.Animation.all,
        ...b.AnimationController.all,
      ].filter((a) => !before.has(a));
      if (!imported.length)
        throw new Fault(
          "IMPORT_EMPTY",
          "No matching animations or controllers were imported",
        );
      b.Undo.finishEdit("MCP import animations", aspects());
      this.adapter.revision++;
      return {
        data: {
          project_id: project.uuid,
          codec: codecId,
          imported: imported.map((a) => ({
            id: a.uuid,
            name: a.name,
            type:
              a instanceof b.AnimationController ? "controller" : "animation",
          })),
          undo: true,
          completion: "native_loader_returned",
        },
      };
    } catch (error) {
      if (b.Project === project && b.Undo.current_save === undoSave) {
        b.Undo.cancelEdit(true);
        project.saved = saved;
      }
      throw error;
    }
  }
  async importModel(args: any): Promise<Result> {
    this.guard();
    if (this.b.Dialog.open)
      throw new Fault("DIALOG_OPEN", "Resolve the current dialog first");
    const codec = this.b.Codecs[args.codec];
    if (!codec || typeof codec.load !== "function")
      throw new Fault("CODEC_UNSUPPORTED", "Codec has no native load method");
    if (codec.load === this.b.Codec.prototype.load) {
      if (typeof codec.parse !== "function")
        throw new Fault("CODEC_UNSUPPORTED", "Codec has no parser");
      if (!codec.format)
        throw new Fault(
          "CODEC_ADAPTER_REQUIRED",
          "Codec has no target format; its custom import path needs an adapter",
        );
    }
    const binary = Uint8Array.from(atob(args.content), (c: string) =>
      c.charCodeAt(0),
    );
    const type =
      args.content_type === "auto"
        ? (codec.load_filter?.type ?? "json")
        : args.content_type;
    let content: any;
    if (type === "binary") content = binary.buffer;
    else if (type === "image") {
      const ext = args.filename.split(".").at(-1).toLowerCase();
      const mime: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
      };
      if (!mime[ext])
        throw new Fault(
          "IMAGE_TYPE",
          "Specify a supported image file extension",
        );
      content = `data:${mime[ext]};base64,${args.content}`;
    } else {
      const text = new TextDecoder().decode(binary);
      content = type === "json" ? this.b.autoParseJSON(text, false) : text;
      if (content === undefined)
        throw new Fault("IMPORT_JSON", "File is not valid JSON/JSONC");
    }
    if (
      codec.load_filter &&
      !this.b.Condition(codec.load_filter.condition, content)
    )
      throw new Fault(
        "CODEC_CONDITION",
        "File does not satisfy codec load conditions",
      );
    const source = this.b.Project?.uuid;
    const result = await codec.load(
      content,
      { name: args.filename, path: args.path, content, no_file: true },
      { ...args.options, import_to_current_project: false },
    );
    if (result === false)
      throw new Fault("IMPORT_FAILED", "Native codec rejected import");
    const opened = this.b.Project;
    await Promise.all(
      (opened?.textures ?? [])
        .flatMap((t: any) => [
          t.img,
          ...(t.layers ?? []).map((l: any) => l.img),
        ])
        .map(waitForImage),
    );
    this.adapter.assertIdle();
    if (opened) this.adapter.project(opened.uuid);
    for (const texture of opened?.textures ?? [])
      if (texture.layers_enabled) texture.updateLayerChanges(true);
    return {
      data: {
        codec: args.codec,
        source_project_id: source,
        project_id: this.b.Project?.uuid,
        opened_new_project: this.b.Project?.uuid !== source,
        completion: "native_loader_returned",
        known_texture_images_ready: true,
        dialog: this.dialog(),
        note: "Images present when the loader returned are decoded. Other provider-owned asynchronous work may continue; inspect model/images and diagnostics.",
      },
    };
  }
  controlType(item: any): string | null {
    return (
      ["Toggle", "BarSelect", "NumSlider", "BarSlider", "BarText", "ColorPicker"].find(
        (type) => this.b[type] && item instanceof this.b[type],
      ) ?? null
    );
  }
  control(args: any): Result {
    this.guard();
    this.adapter.project(args.project_id);
    if (this.b.Dialog.open)
      throw new Fault("DIALOG_OPEN", "Resolve the current dialog first");
    const item = this.b.BarItems[args.control_id],
      type = this.controlType(item),
      value = args.value;
    if (!type)
      throw new Fault(
        "CONTROL_UNSUPPORTED",
        "Control needs a dedicated adapter",
      );
    if (!this.available(item))
      throw new Fault("CONTROL_UNAVAILABLE", "Control condition is false");
    if (args.mode === "offset" && type !== "NumSlider")
      throw new Fault("CONTROL_MODE", "Offset mode requires a numeric slider");
    if (
      (type === "Toggle" && typeof value !== "boolean") ||
      (type === "BarSelect" && typeof value !== "string") ||
      (type === "BarText" && typeof value !== "string") ||
      (["NumSlider", "BarSlider"].includes(type) && typeof value !== "number")
    )
      throw new Fault("CONTROL_TYPE", "Value type does not match control");
    if (type === "BarSelect") {
      if (!Object.hasOwn(item.options, value))
        throw new Fault("CONTROL_OPTION", "Unknown option");
      const option = item.options[value];
      if (typeof option === "object" && !this.available(option))
        throw new Fault("CONTROL_OPTION", "Option is unavailable");
    }
    if (
      type === "ColorPicker" &&
      (typeof value !== "string" ||
        !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value))
    )
      throw new Fault("CONTROL_COLOR", "Use #RRGGBB or #RRGGBBAA");
    if (
      typeof value === "number" &&
      args.mode !== "offset" &&
      item.settings?.limit !== false &&
      ((typeof item.settings?.min === "number" && value < item.settings.min) ||
        (typeof item.settings?.max === "number" && value > item.settings.max))
    )
      throw new Fault("CONTROL_RANGE", "Value is outside control range");
    if(type==='BarSlider'&&!item.plugin&&this.b.Blockbench.version==='5.1.6'&&item.id==='uv_rotation'&&![0,90,180,270].includes(value))
      throw new Fault('CONTROL_STEP','Cube UV rotation requires 0, 90, 180 or 270 degrees');
    const previous =
      type === "Toggle"
        ? item.value
        : type === "ColorPicker"
          ? item.get().toHex8String()
          : item.get();
    try {
      withOutlinerUndo(this.b, () => {
        if (type === "Toggle") item.set(value);
        else if (type === "BarText") item.change(value);
        else if (type === "ColorPicker") {
          item.set(value);
          item.change(item.get());
        } else if (type === "NumSlider") {
          item.onBefore?.();
          item.change((base: number) => {
            const next = args.mode === "offset" ? base + value : value;
            if (
              !Number.isFinite(next) ||
              (item.settings?.limit !== false &&
                ((typeof item.settings?.min === "number" &&
                  next < item.settings.min) ||
                  (typeof item.settings?.max === "number" &&
                    next > item.settings.max)))
            )
              throw new Fault(
                "CONTROL_RANGE",
                "Result is outside control range",
              );
            return next;
          });
          item.update();
          item.onAfter?.(args.mode === "offset" ? value : value - previous);
        } else if(type==='BarSlider'&&!item.plugin&&this.b.Blockbench.version==='5.1.6') {
          const change=()=>{
            item.onBefore?.(new MouseEvent('mousedown'));
            item.change(value,new Event('input'));
            item.onAfter?.(new Event('change'));
          };
          if(item.id==='uv_rotation')withUvRotationUndo(this.b,change);
          else change();
        } else item.change(value);
      });
    } catch (error) {
      let undo_cancelled = false;
      if (this.b.Undo.current_save) {
        this.b.Undo.cancelEdit(true);
        undo_cancelled = true;
      }
      throw new Fault("CONTROL_FAILED", "Native control handler failed", {
        cause: String(error),
        undo_cancelled,
        external_effects_unknown: true,
      });
    }
    return {
      data: {
        control_id: item.id,
        type,
        previous,
        value:
          type === "Toggle"
            ? item.value
            : type === "ColorPicker"
              ? item.get().toHex8String()
              : item.get(),
        completion: "handler_dispatched",
        undo: "handler_owned",
      },
    };
  }
  private nativeProject(projectId?: string) {
    if (projectId || this.b.Project) return this.adapter.project(projectId);
    return undefined;
  }
  async menuOperation(args: any): Promise<Result> {
    this.nativeProject(args.project_id);
    this.guard();
    if (args.operation === "close") {
      const menu = this.b.Menu?.open;
      if (!menu) return { data: { completion: "menu_already_closed", undo: false } };
      if (typeof menu.hide !== "function")
        throw new Fault("MENU_ADAPTER_REQUIRED", "The open native menu has no bounded hide method");
      menu.hide();
      return { data: { completion: "menu_closed", undo: false } };
    }
    if (args.action_id) {
      const result = await this.action({
        project_id: args.project_id,
        action_id: args.action_id,
        modifiers: args.modifiers,
        wait_for_completion: true,
      });
      return { data: { ...(result.data as Record<string, unknown>), menu_operation: args.operation } };
    }
    if (!args.snapshot_id || !args.element_id)
      throw new Fault("MENU_INPUT", "Menu operation requires action_id or a fresh snapshot element_id");
    const result = await this.ui.interact({
      snapshot_id: args.snapshot_id,
      element_id: args.element_id,
      action: args.interaction,
      value: args.value,
      modifiers: args.modifiers,
    });
    return { data: { ...(result.data as Record<string, unknown>), menu_operation: args.operation } };
  }
  keybind(args: any): Result {
    this.nativeProject(args.project_id);
    this.guard();
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
    const init = keyboardInit(args.key, args.modifiers);
    target.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { ...init, bubbles: true }));
    return {
      data: {
        keybind_id: args.keybind_id ?? null,
        key: args.key,
        modifiers: args.modifiers ?? {},
        completion: "key_event_dispatched",
        undo: false,
        note: "Inspect bb_editor_state or the affected model to verify that the conditional native handler consumed the key.",
      },
    };
  }
  panelOperation(args: any): Result {
    this.nativeProject(args.project_id);
    this.guard();
    const panel = this.b.Panels?.[args.panel_id];
    if (!panel) throw new Fault("NATIVE_NOT_FOUND", `Panel is not registered: ${args.panel_id}`);
    if (args.operation === "close") {
      if (typeof panel.moveTo !== "function")
        throw new Fault("PANEL_ADAPTER_REQUIRED", "Panel does not expose a native moveTo method");
      panel.moveTo("hidden");
    } else {
      if (args.operation === "open" && panel.slot === "hidden" && typeof panel.moveTo === "function")
        panel.moveTo(panel.previous_slot || "right_bar");
      const setActive = this.b.setActivePanel ?? (globalThis as any).setActivePanel;
      if (typeof setActive === "function") setActive(args.panel_id);
      else if (typeof panel.selectTab === "function") panel.selectTab();
      else throw new Fault("PANEL_ADAPTER_REQUIRED", "Panel does not expose a native activation method");
      panel.moveToFront?.();
    }
    return {
      data: {
        panel_id: args.panel_id,
        operation: args.operation,
        active:
          this.b.Panel?.selected?.id === args.panel_id ||
          this.b.Prop?.active_panel === args.panel_id,
        completion: "native_panel_dispatched",
        undo: false,
      },
    };
  }
  previewOperation(args: any): Result {
    this.nativeProject(args.project_id);
    this.guard();
    const preview = this.b.Preview?.all?.find((item: any) => item.id === args.preview_id);
    if (!preview) throw new Fault("NATIVE_NOT_FOUND", `Preview is not registered: ${args.preview_id}`);
    if (args.operation === "close") {
      const close = preview.hide ?? preview.close;
      if (typeof close !== "function")
        throw new Fault("PREVIEW_ADAPTER_REQUIRED", "Preview does not expose a native close method");
      close.call(preview);
    } else {
      if (typeof preview.select === "function") preview.select();
      else if (typeof this.b.Preview?.select === "function") this.b.Preview.select(preview);
      else {
        // Blockbench 5.1.6 exposes preview selection as a static property;
        // there is no instance select method on the native Preview class.
        if (!this.b.Preview) throw new Fault("PREVIEW_ADAPTER_REQUIRED", "Preview selection is unavailable");
        this.b.Preview.selected = preview;
      }
    }
    return {
      data: {
        preview_id: args.preview_id,
        operation: args.operation,
        selected: this.b.Preview?.selected?.id === args.preview_id,
        visible: preview.canvas?.isConnected === true && (preview.width ?? 0) > 0 && (preview.height ?? 0) > 0,
        completion: "native_preview_dispatched",
        undo: false,
      },
    };
  }
  modeOperation(args: any): Result {
    this.nativeProject(args.project_id);
    this.guard();
    const mode = this.b.Modes?.options?.[args.mode_id] ?? this.b.Modes?.[args.mode_id];
    if (!mode || !this.available(mode)) throw new Fault("MODE_UNAVAILABLE", `Mode is not available: ${args.mode_id}`);
    if (typeof mode.select === "function") mode.select();
    else if (typeof this.b.Modes?.select === "function") this.b.Modes.select(args.mode_id);
    else throw new Fault("MODE_ADAPTER_REQUIRED", "Blockbench does not expose a native mode selector");
    return { data: { mode_id: args.mode_id, selected: this.b.Modes.selected?.id === args.mode_id, completion: "mode_selected", undo: false } };
  }
  nodeTypeOperation(args: any): Result {
    this.adapter.project(args.project_id);
    this.guard();
    const Type = this.b.OutlinerElement?.types?.[args.node_type_id];
    if (!Type) throw new Fault("NATIVE_NOT_FOUND", `Node type is not registered: ${args.node_type_id}`);
    if (typeof Type !== "function" || typeof Type.prototype?.init !== "function" || typeof Type.prototype?.addTo !== "function")
      throw new Fault("NODETYPE_ADAPTER_REQUIRED", "This node type requires a dedicated constructor adapter");
    const parent = args.parent_id ? this.b.OutlinerNode?.uuids?.[args.parent_id] : "root";
    if (args.parent_id && !parent) throw new Fault("NOT_FOUND", `Parent node is not registered: ${args.parent_id}`);
    let node: any;
    withOutlinerUndo(this.b, () => {
      node = new Type(args.properties ?? {});
      node.init();
      node.addTo(parent);
    }, true);
    return { data: { node_id: node.uuid, type: args.node_type_id, parent_id: args.parent_id ?? null, completion: "native_node_created", undo: "handler_owned" } };
  }
  private coreSplineCreation?:{dialog:any;confirm:any};
  private coreDialogEdit?: {dialog:any; project:any; save:any};
  private coreDialogUndo(root?: HTMLElement) {
    const owned=this.coreDialogEdit;
    return owned && owned.dialog===this.b.Dialog.open && owned.project===this.b.Project && owned.save===this.b.Undo.current_save && (!root || root===owned.dialog.object) ? owned.save : undefined;
  }
  async action(args: any): Promise<Result> {
    this.guard();
    if (args.project_id || this.b.Project)
      this.adapter.project(args.project_id);
    if (this.b.Dialog.open)
      throw new Fault(
        "DIALOG_OPEN",
        "Resolve the current dialog before dispatching another action",
      );
    const a = this.b.BarItems[args.action_id];
    if (!a || !(a instanceof this.b.Action))
      throw new Fault(
        "ACTION_UNSUPPORTED",
        "ID is not a registered Action/Tool; custom widgets require an adapter",
      );
    if (!this.available(a))
      throw new Fault(
        "ACTION_UNAVAILABLE",
        "Action condition is false for the current selection/mode",
      );
    if(a.id==='paste'&&!a.plugin&&this.b.Blockbench.version==='5.1.6'
      &&this.b.Modes.edit&&this.b.Prop.active_panel==='uv'&&!this.b.getFocusedTextInput()
      &&!(this.b.Painter.selection.canvas&&this.b.Toolbox.selected.id==='copy_paste_tool')
      &&this.b.UVEditor.clipboard?.length&&this.b.UVEditor.isBoxUV()){
      const uv=this.b.UVEditor.clipboard[0].uv;
      if(Array.isArray(uv)&&(uv.length!==2||!uv.every(Number.isFinite)))
        throw new Fault('UV_CLIPBOARD_SHAPE','Box UV paste requires a finite two-coordinate offset; a Face UV rectangle is not a Box UV offset');
    }
    if(!a.plugin&&this.b.Blockbench.version==='5.1.6'&&['uv_rotate_left','uv_rotate_right'].includes(a.id)
      &&this.b.Mesh.selected.some((m:any)=>m.getSelectedFaces().some((key:string)=>(m.faces[key]?.vertices.length??0)>=3))){
      const rect=this.b.UVEditor.vue.getSelectedUVBoundingBox();
      if(!rect.every(Number.isFinite)||![(rect[0]+rect[2])/2,(rect[1]+rect[3])/2].every(Number.isFinite))
        throw new Fault('UV_ROTATION_CENTER','Native UV rotation has no finite selection pivot; use uv.rotate with explicit center and corners');
    }
    if(a.id==='merge_splines'&&!a.plugin&&this.b.Blockbench.version==='5.1.6')
      throw new Fault('NATIVE_UNIMPLEMENTED','Blockbench 5.1.6 registers merge_splines without a merge implementation');
    const splineDeletion={opened_splines:[] as string[]};
    const splineDelete=a.id==='delete'&&!a.plugin?await coreSplineDeleteHandler(this.b):undefined;
    const shared_handler=args.shared_handler_token?this.sharedActions().assert(args.action_id,args.shared_handler_token):undefined;
    const event = new MouseEvent("click", {
      button: 0,
      bubbles: true,
      shiftKey: !!args.modifiers?.shift,
      ctrlKey: !!args.modifiers?.ctrl,
      altKey: !!args.modifiers?.alt,
      metaKey: !!args.modifiers?.meta,
    });
    // Programmatic trigger has no dispatched DOM target. Menu-producing
    // actions need an anchor; use the visible action node or the editor body.
    const anchor =
      a.nodes?.find(
        (node: any) =>
          node instanceof HTMLElement &&
          node.isConnected &&
          node.getClientRects().length,
      ) ?? document.body;
    Object.defineProperty(event, "target", { value: anchor });
    Object.defineProperty(event, "currentTarget", { value: anchor });
    // Pinned Double Sided Cubes 1.0.2 omits hierarchy aspects: Redo would
    // otherwise recreate the inverted cube at the root instead of its group.
    const trigger = () => {
      if(!a.plugin&&this.b.Blockbench.version==='5.1.6'&&['uv_mirror_x','uv_mirror_y'].includes(a.id))return withUvMirrorUndo(this.b,a,event,()=>a.trigger(event));
      if(splineDelete)return withCoreSplineDelete(this.b,splineDelete,()=>a.trigger(event),splineDeletion);
      if(a.id==='apply_spline_rotation'&&!a.plugin&&this.b.Blockbench.version==='5.1.6'){
        const undo=this.b.Undo,finish=undo.finishEdit;
        undo.initEdit({elements:this.b.SplineMesh.selected.slice()});
        undo.finishEdit=()=>{};
        try{
          const result=a.trigger(event);
          undo.finishEdit=finish;
          finish.call(undo,'Apply spline rotation');
          return result;
        }catch(error){
          undo.finishEdit=finish;
          if(undo.current_save)undo.cancelEdit(true);
          throw error;
        }finally{undo.finishEdit=finish;}
      }
      if(a.id==='extrude_spline_selection'&&!a.plugin&&this.b.Blockbench.version==='5.1.6')return withSplineExtrusionUndo(this.b,()=>a.trigger(event));
      if(a.id==='split_spline'&&!a.plugin&&this.b.Blockbench.version==='5.1.6')return withSplineSplitSelection(this.b,()=>a.trigger(event));
      if(a.id==='divide_spline_curve'&&!a.plugin&&this.b.Blockbench.version==='5.1.6')return withSplineSelectionUndo(this.b,()=>a.trigger(event));
      const restoreClip=a.id==='clear_unused_texture_space'&&!a.plugin&&this.b.Blockbench.version==='5.1.6';
      const contexts:CanvasRenderingContext2D[]=restoreClip?[...new Set<CanvasRenderingContext2D>((this.b.Texture.all??[]).flatMap((t:any)=>[t.ctx,...(t.layers??[]).map((l:any)=>l.ctx)]).filter(Boolean))]:[];
      for(const ctx of contexts)ctx.save();
      try{return a.trigger(event);}finally{for(const ctx of contexts)ctx.restore();}
    };
    const dispatch = () =>
      withOutlinerUndo(
        this.b,
        () => a.id==='bake_ik_animation'&&!a.plugin ? withIKBakeUndo(this.b,trigger) : trigger(),
        (["remove_blank_faces","split_spline"].includes(a.id) && !a.plugin) || a.id === "create_double_sided_cubes" &&
          this.b.Plugins.registered.double_sided_cubes?.version === "1.0.2",
      );
    const clipboard = observeClipboardWrites(this.b, () =>
      args.wait_for_completion
        ? observeActionPromises(a, dispatch)
        : { dispatched: dispatch(), promises: [] },
    );
    const observed = clipboard.value;
    await Promise.all(observed.promises);
    if(a.id==='add_spline'&&!a.plugin&&this.b.Blockbench.version==='5.1.6'&&this.b.Dialog.open?.id==='add_spline')this.coreSplineCreation={dialog:this.b.Dialog.open,confirm:this.b.Dialog.open.onConfirm};
    if(!a.plugin && this.b.Blockbench.version==='5.1.6' && ['adjust_brightness_contrast','adjust_saturation_hue','adjust_curves','adjust_opacity'].includes(a.id) && this.b.Dialog.open?.id===a.id && this.b.Undo.current_save)
      this.coreDialogEdit={dialog:this.b.Dialog.open,project:this.b.Project,save:this.b.Undo.current_save};
    if(!a.plugin && this.b.Blockbench.version==='5.1.6' && a.id==='remove_blank_faces' && this.b.MessageBox && this.b.Dialog.open instanceof this.b.MessageBox && this.b.Undo.current_save)
      this.coreDialogEdit={dialog:this.b.Dialog.open,project:this.b.Project,save:this.b.Undo.current_save};
    return {
      data: {
        action_id: a.id,
        shared_handler,
        spline_delete:splineDelete?splineDeletion:undefined,
        clipboard_writes: await Promise.all(clipboard.writes),
        dispatched: observed.dispatched !== false,
        completion: observed.promises.length
          ? "returned_promises_completed"
          : "dispatched_only",
        awaited_promises: observed.promises.length,
        undo: "handler_owned",
        dialog: this.dialog(),
      },
    };
  }
  async nativeOperation(args: any): Promise<Result> {
    const kind = args.registration_kind as string;
    if (args.project_id || this.b.Project || !["Keybind", "Menu", "Panel", "Preview", "Mode"].includes(kind))
      this.nativeProject(args.project_id);
    const id = (args.native_id as string | undefined) ?? (typeof args.registration_key === "string"
      ? args.registration_key.split(":").slice(1).join(":").split("@")[0]
      : undefined);
    const input = args.arguments ?? {};
    const operation = args.operation as string;
    if (operation !== "inspect") this.guard();
    const catalogKind = kind === "NodeType" ? "node_types" : kind === "Panel" ? "panels" : kind === "Preview" ? "previews" : kind === "Mode" ? "modes" : kind === "ModelFormat" ? "formats" : undefined;
    if (operation === "inspect") {
      if (kind === "Property") {
        if (typeof input.node_id !== "string") throw new Fault("INPUT", "Property inspection requires arguments.node_id");
        return this.properties({ project_id: args.project_id, node_id: input.node_id });
      }
      if (catalogKind) return this.catalog({ kind: catalogKind, search: id ?? "", offset: 0, limit: 100 });
      if (["Action", "Tool", "SharedActionHandler", "Toggle", "BarSelect", "NumSlider", "BarSlider", "BarText", "ColorPicker"].includes(kind))
        return this.catalog({ kind: "actions", search: id ?? "", offset: 0, limit: 100 });
      if (kind === "Setting") return this.catalog({ kind: "settings", search: id ?? "", offset: 0, limit: 100 });
      if (["Codec", "ModelFormat", "ModelLoader"].includes(kind)) return this.catalog({ kind: kind === "ModelLoader" ? "loaders" : "codecs", search: id ?? "", offset: 0, limit: 100 });
      if (kind === "Menu" || kind === "Keybind") return this.editor({ include_shared_actions: true });
      throw new Fault("NATIVE_INSPECTION_UNSUPPORTED", `No bounded inspector for ${kind}`);
    }
    if (kind === "Property") {
      if (operation !== "edit" || typeof input.node_id !== "string" || typeof input.property_snapshot_id !== "string" || !input.values || typeof input.values !== "object")
        throw new Fault("PROPERTY_ADAPTER_REQUIRED", "Property edits require node_id, property_snapshot_id and values");
      return this.editProperties({ project_id: args.project_id, node_id: input.node_id, property_snapshot_id: input.property_snapshot_id, values: input.values });
    }
    if (["Action", "Tool", "SharedActionHandler"].includes(kind)) {
      if (!id) throw new Fault("INPUT", "Action dispatch requires native_id");
      return this.action({ project_id: args.project_id, action_id: id, modifiers: input.modifiers, shared_handler_token: input.shared_handler_token, wait_for_completion: input.wait_for_completion ?? true });
    }
    if (["Toggle", "BarSelect", "NumSlider", "BarSlider", "BarText", "ColorPicker"].includes(kind)) {
      if (!id || !("value" in input)) throw new Fault("INPUT", "Control changes require native_id and arguments.value");
      return this.control({ project_id: args.project_id, control_id: id, value: input.value, mode: input.mode ?? "set" });
    }
    if (kind === "Setting") {
      if (!id || !("value" in input)) throw new Fault("INPUT", "Setting changes require native_id and arguments.value");
      return this.setting({ setting_id: id, value: input.value });
    }
    if (kind === "Dialog") {
      const dialog_token = typeof input.dialog_token === "string" ? input.dialog_token : typeof input.token === "string" ? input.token : undefined;
      const action = input.action ?? (operation === "close" ? "cancel" : operation === "set" ? "set" : "confirm");
      if (!dialog_token) throw new Fault("INPUT", "Dialog operation requires arguments.dialog_token");
      return this.respond({ dialog_token, action, values: input.values ?? {}, controls: input.controls ?? {}, wait_for_completion: input.wait_for_completion ?? true });
    }
    if (kind === "Keybind") {
      if (operation !== "trigger") throw new Fault("KEYBIND_OPERATION", "Keybinds support operation=trigger only");
      if (typeof input.key !== "string") throw new Fault("INPUT", "Keybind trigger requires arguments.key");
      return this.keybind({ project_id: args.project_id, keybind_id: id, key: input.key, modifiers: input.modifiers });
    }
    if (kind === "Menu") {
      return this.menuOperation({ project_id: args.project_id, operation: operation === "close" ? "close" : operation === "open" ? "open" : "trigger", action_id: input.action_id, snapshot_id: input.snapshot_id, element_id: input.element_id, interaction: input.interaction ?? "click", value: input.value, modifiers: input.modifiers });
    }
    if (kind === "Panel" || kind === "Preview") {
      return kind === "Panel"
        ? this.panelOperation({ project_id: args.project_id, panel_id: id, operation: operation === "open" ? "open" : operation === "close" ? "close" : "select" })
        : this.previewOperation({ project_id: args.project_id, preview_id: id, operation: operation === "open" ? "open" : operation === "close" ? "close" : "select" });
    }
    if (kind === "Mode") {
      return this.modeOperation({ project_id: args.project_id, mode_id: id });
    }
    if (kind === "NodeType") {
      if (operation !== "create") throw new Fault("NODETYPE_OPERATION", "NodeType supports operation=create or inspect");
      return this.nodeTypeOperation({ project_id: args.project_id, node_type_id: id, parent_id: input.parent_id, properties: input.properties ?? input });
    }
    if (kind === "ModelLoader") {
      if (!id || !["dispatch", "trigger", "open", "create"].includes(operation))
        throw new Fault("LOADER_OPERATION", "ModelLoader supports dispatch/trigger/open/create with native_id");
      return this.loader({ loader_id: id });
    }
    if (kind === "ModelFormat")
      throw new Fault("FORMAT_ADAPTER_REQUIRED", "Format selection is project-creation state; use bb_create_project with an explicit format");
    if (kind === "Codec") {
      if (operation === "dispatch" && typeof input.content === "string" && typeof input.filename === "string") {
        if (input.content.length > 44000000)
          throw new Fault("SIZE_LIMIT", "Native codec content exceeds the 32 MB boundary");
        return this.importModel({
          filename: input.filename,
          codec: id,
          content: input.content,
          content_type: input.content_type ?? "auto",
          options: input.options ?? {},
        });
      }
      throw new Fault("CODEC_ADAPTER_REQUIRED", "Codec dispatch requires arguments.filename, arguments.content (base64), content_type and optional options; use bb_export for compilation");
    }
    throw new Fault("NATIVE_OPERATION_UNSUPPORTED", `No safe adapter for ${kind}`);
  }
  async respond(args: any): Promise<Result> {
    this.guard(this.coreDialogUndo());
    const d = this.b.Dialog.open;
    if (!d || this.tokens.get(d) !== args.dialog_token)
      throw new Fault(
        "STALE_DIALOG",
        "Dialog changed; inspect bb_editor_state again",
      );
    if (this.dialogStates.get(d) !== this.dialogFingerprint(d))
      throw new Fault(
        "STALE_DIALOG",
        "Form values changed; inspect bb_editor_state again",
      );
    if (
      args.action === "cancel" &&
      (Object.keys(args.values).length || Object.keys(args.controls).length)
    )
      throw new Fault("INPUT", "Cancel does not accept form values");
    const fields = d.form_config ?? {},
      current = d.getFormResult?.() ?? {};
    if (Object.keys(args.values).length && Object.keys(args.controls).length)
      throw new Fault(
        "INPUT",
        "Use form values or HTML controls in one operation, not both",
      );
    const dom = this.dialogControls(d);
    const changes = Object.entries(args.controls).map(([id, value]) => {
      const c = dom.find((c) => c.id === id);
      if (
        !c ||
        c.disabled ||
        c.readonly ||
        !c.visible ||
        [
          "password",
          "file",
          "submit",
          "reset",
          "button",
          "image",
          "radio",
        ].includes(c.type)
      )
        throw new Fault(
          "CONTROL_UNSUPPORTED",
          "Dialog control cannot be edited through this path",
        );
      if (c.type === "checkbox" && typeof value !== "boolean")
        throw new Fault("CONTROL_TYPE", "Checkbox requires boolean");
      if (c.type !== "checkbox" && typeof value === "boolean")
        throw new Fault("CONTROL_TYPE", "Control requires text or number");
      if (
        c.type === "select" &&
        !c.options?.some((o) => o.value === String(value) && !o.disabled)
      )
        throw new Fault("CONTROL_OPTION", "Unavailable option");
      const input = c.element as HTMLInputElement;
      if (
        ["number", "range"].includes(c.type) &&
        (!Number.isFinite(Number(value)) ||
          (input.min !== "" && Number(value) < Number(input.min)) ||
          (input.max !== "" && Number(value) > Number(input.max)))
      )
        throw new Fault(
          "CONTROL_RANGE",
          "Numeric HTML control is out of range",
        );
      return { c, value };
    });
    for (const [key, value] of Object.entries(args.values)) {
      const f = fields[key];
      if (
        !Object.hasOwn(fields, key) ||
        !f ||
        ["password", "file", "folder", "info", "buttons"].includes(f.type)
      )
        throw new Fault(
          "FORM_FIELD_UNSUPPORTED",
          `Field ${key} requires a dedicated adapter`,
        );
      if (f.readonly || !this.formAvailable(f, { ...current, ...args.values }))
        throw new Fault(
          "FORM_FIELD_UNAVAILABLE",
          `Field ${key} is read-only or hidden`,
        );
      if (f.type === "color") {
        if (
          typeof value !== "string" ||
          !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)
        )
          throw new Fault("FORM_COLOR", `Use #RRGGBB or #RRGGBBAA for ${key}`);
      } else if (Array.isArray(current[key])) {
        if (
          !Array.isArray(value) ||
          value.length !== current[key].length ||
          value.some((v: any, i: number) => typeof v !== typeof current[key][i])
        )
          throw new Fault("FORM_TYPE", `Wrong array type for ${key}`);
        if (
          value.some(
            (v: any) =>
              typeof v === "number" &&
              (!Number.isFinite(v) ||
                (f.min !== undefined && v < f.min) ||
                (f.max !== undefined && v > f.max)),
          )
        )
          throw new Fault("FORM_RANGE", `Out of range: ${key}`);
      } else if (
        current[key] !== undefined &&
        typeof value !== typeof current[key]
      )
        throw new Fault("FORM_TYPE", `Wrong value type for ${key}`);
      if (
        typeof value === "number" &&
        (!Number.isFinite(value) ||
          (f.min !== undefined && value < f.min) ||
          (f.max !== undefined && value > f.max))
      )
        throw new Fault("FORM_RANGE", `Out of range: ${key}`);
      if (
        f.type === "select" &&
        (!f.options ||
          typeof f.options !== "object" ||
          !Object.hasOwn(f.options, String(value)))
      )
        throw new Fault("FORM_OPTION", `Unknown option: ${key}`);
    }
    if (
      args.action !== "cancel" &&
      d.id === "bake_animations" &&
      this.b.Blockbench.version === "5.1.6" &&
      this.b.Plugins.registered.bakery?.version === "1.1.1"
    )
      validateBake(this.b, { ...current, ...args.values }.rate);
    if (
      args.action === "confirm" &&
      d.id === "add_custom_marker" &&
      this.b.Blockbench.version === "5.1.6" &&
      this.b.Plugins.registered.custom_marker_colors?.version === "1.1.0"
    )
      validateMarkerName(this.b, { ...current, ...args.values }.name);
    this.tokens.delete(d); // Every accepted dialog operation consumes its token.
    for (const { c, value } of changes) {
      if (this.b.Dialog.open !== d || !d.object.contains(c.element))
        throw new Fault(
          "STALE_DIALOG",
          "Dialog changed during input handlers; inspect its state",
        );
      if (c.type === "checkbox")
        (c.element as HTMLInputElement).checked = value as boolean;
      else c.element.value = String(value);
      withOutlinerUndo(this.b, () => {
        c.element.dispatchEvent(new Event("input", { bubbles: true }));
        c.element.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    if (Object.keys(args.values).length)
      withOutlinerUndo(this.b, () => d.setFormValues(args.values));
    if (this.b.Dialog.open !== d)
      return {
        data: {
          completion: "dialog_changed_by_form_handler",
          dialog: this.dialog(),
        },
      };
    const dispatch = () => {
      if (
        args.action !== "set" &&
        this.b.MessageBox &&
        d instanceof this.b.MessageBox
      ) {
        const index =
          args.action === "confirm" ? d.confirmIndex : d.cancelIndex;
        const button = d.object.querySelectorAll(
          ":scope > .button_bar > button",
        )[index];
        if (!button)
          throw new Fault(
            "DIALOG_BUTTON",
            "Message box button is unavailable; inspect its DOM",
          );
        withOutlinerUndo(this.b, () => button.click());
      } else if (args.action === "confirm") {
        if(this.coreSplineCreation?.dialog===d&&this.coreSplineCreation?.confirm===d.onConfirm)
          withSplineCreationUndo(this.b,()=>d.confirm(),d.getFormResult?.().shape);
        else withOutlinerUndo(this.b,()=>d.confirm());
      } else if (args.action === "cancel")
        withOutlinerUndo(this.b, () => d.cancel());
    };
    const dispatchWithCoreUVUndo = () => {
      if(args.action!=='confirm'||d.id!=='resize_texture'||this.b.Blockbench.version!=='5.1.6'||!this.b.Format.per_texture_uv_size)return dispatch();
      // Native resize updates Project UV dimensions even for per-texture UV formats.
      // Its texture-only Undo otherwise leaves Project dimensions at the resized value.
      const undo=this.b.Undo,original=undo.initEdit;
      undo.initEdit=function(aspects:any,...rest:any[]) {
        return original.call(this,{...aspects,uv_mode:true},...rest);
      };
      try{return dispatch();}finally{undo.initEdit=original;}
    };
    const observed = args.wait_for_completion
      ? observeDialogPromises(d, dispatchWithCoreUVUndo)
      : { dispatched: dispatchWithCoreUVUndo(), promises: [] };
    await Promise.all(observed.promises);
    return {
      data: {
        completion: observed.promises.length
          ? "returned_promises_completed"
          : "handler_dispatched",
        awaited_promises: observed.promises.length,
        dialog: this.dialog(),
      },
    };
  }
  setting(args: any): Result {
    this.guard();
    const s = this.b.settings[args.setting_id];
    if (!s || !["toggle", "number", "text", "select"].includes(s.type))
      throw new Fault(
        "SETTING_UNSUPPORTED",
        "Unknown setting or unsupported type",
      );
    if (!this.available(s))
      throw new Fault("SETTING_UNAVAILABLE", "Setting condition is false");
    const expected =
      s.type === "toggle"
        ? "boolean"
        : s.type === "number"
          ? "number"
          : "string";
    if (typeof args.value !== expected)
      throw new Fault("SETTING_TYPE", `Expected ${expected}`);
    if (s.type === "select" && !Object.hasOwn(s.options ?? {}, args.value))
      throw new Fault("SETTING_OPTION", "Unknown select option");
    if (
      s.type === "number" &&
      ((s.min !== undefined && args.value < s.min) ||
        (s.max !== undefined && args.value > s.max))
    )
      throw new Fault(
        "SETTING_RANGE",
        "Setting value is outside its allowed range",
      );
    const previous = s.value;
    s.set(args.value);
    // Setting.set persists the value but leaves linked Toggles and listeners
    // stale. Match the native settings UI's apply step.
    this.b.Settings.save();
    return {
      data: {
        setting_id: s.id,
        previous,
        value: s.value,
        requires_restart: !!s.requires_restart,
        scope: "global_or_active_profile",
        undo: false,
      },
    };
  }
  native(args: any): Result {
    this.adapter.project(args.project_id);
    const model = this.adapter.compile("project", {
      raw: true,
      bitmaps: false,
    });
    delete model.textures;
    delete model.history;
    const data =
      args.section === "all"
        ? model
        : args.section === "meta"
          ? Object.fromEntries(
              Object.entries(model).filter(
                ([k, v]) =>
                  !Array.isArray(v) && !["display", "editor_state"].includes(k),
              ),
            )
          : (model[args.section] ?? null);
    const output = Array.isArray(data)
      ? {
          items: data.slice(args.offset, args.offset + args.limit),
          total: data.length,
          next_offset:
            args.offset + args.limit < data.length
              ? args.offset + args.limit
              : null,
        }
      : { value: data };
    if (JSON.stringify(output).length > 8000000)
      throw new Fault(
        "RESPONSE_SIZE",
        "Native snapshot exceeds 8 MB; request a specific section",
      );
    return {
      data: {
        section: args.section,
        ...output,
        coverage: "native_serialization_read_only",
      },
    };
  }
  async invoke(args: any): Promise<Result> {
    this.guard();
    const project = this.adapter.project(args.project_id),
      e = this.extensions.get(args.extension_id);
    if (!e)
      throw new Fault("EXTENSION_NOT_FOUND", "Extension is not registered");
    if (!this.extensionAvailable(e))
      throw new Fault(
        "EXTENSION_UNAVAILABLE",
        "Provider reports extension unavailable",
      );
    const input = e.schema.parse(args.input);
    const output = await e.run(input, {
      project,
      signal: this.cancellation.signal,
    });
    if (this.cancellation.signal.aborted)
      throw new Fault(
        "UNLOADED",
        "Provider completed after unload; inspect state before retrying",
      );
    const json = JSON.stringify(output ?? null);
    if (json.length > 8000000)
      throw new Fault("RESPONSE_SIZE", "Extension output exceeds 8 MB");
    return {
      data: {
        extension_id: e.id,
        result: JSON.parse(json),
        completion: "provider_resolved",
        undo: "provider_owned",
      },
    };
  }
}

