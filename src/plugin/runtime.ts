import { classifyCullface } from '../shared/auto-cullface.ts';
import {connectSplineChains} from '../shared/spline-topology.ts';
import {splineCoordinateConverter} from '../shared/spline-coordinates.ts';
import {assertUnlocked} from '../shared/model.ts';
import { commands, type CommandName } from "../shared/commands.ts";
import {restoreTextureComposites} from './texture-composite-undo.ts';
import { compileFlipbookReference } from '../shared/flipbook-export.ts';
import { isCheckpoint } from "../shared/checkpoint.ts";
import {refreshCoreMaterial,disposeCoreMaterials} from './core-texture-groups.ts';
import {
  clone,
  errorData,
  Fault,
  stable,
  type ModelState,
  type Plan,
  type Protection,
  type Result,
} from "../shared/types.ts";
import {
  diagnose,
  diff,
  planEdit,
  query,
  templateOperations,
} from "../shared/model.ts";
import { Adapter } from "./adapter.ts";
import { Integrations } from "./integrations.ts";
import { waitForImage } from "./image-loading.ts";
import { compileForExport, compileObjBundle } from "./export.ts";

interface Snapshot {
  state: ModelState;
  fingerprint: string;
}
interface SavedPlan {
  plan: Plan;
  fingerprint: string;
  protection: string;
  label: string;
  project: string;
}
export class Runtime {
  snapshots = new Map<string, Snapshot>();
  plans = new Map<string, SavedPlan>();
  paused = false;
  private disposed = false;
  integrations: Integrations;
  constructor(public adapter: Adapter) {
    this.integrations = new Integrations(adapter, (allowedUndoSave?: any) => {
      adapter.assertIdle(allowedUndoSave);
      if (this.paused) throw new Fault("PAUSED", "MCP editing is paused");
      if (
        adapter.b.ModelProject.all.some(
          (p: any) => p.perfect_mcp_protections?.length,
        )
      )
        throw new Fault(
          "PROTECTED_NATIVE",
          "General native/plugin operations require removing part protections because their effects cannot be bounded",
        );
    });
  }
  uuid() {
    return this.adapter.b.guid?.() ?? crypto.randomUUID();
  }
  rules(): Protection[] {
    return clone(this.adapter.project().perfect_mcp_protections ?? []);
  }
  store<T>(map: Map<string, T>, value: T, max = 4) {
    if (stable(value).length > 64000000)
      throw new Fault(
        "CACHE_SIZE",
        "Snapshot or plan exceeds 64 MB. Reduce embedded textures.",
      );
    const id = this.uuid();
    map.set(id, value);
    while (map.size > max) map.delete(map.keys().next().value!);
    while (
      map.size > 1 &&
      Array.from(map.values()).reduce((n, v) => n + stable(v).length, 0) >
        64000000
    )
      map.delete(map.keys().next().value!);
    return id;
  }
  dispose() {
    disposeCoreMaterials();
    this.integrations.dispose();
    this.disposed = true;
    this.adapter.active = false;
    this.snapshots.clear();
    this.plans.clear();
  }
  async planTextureSet(args:any):Promise<Result> {
    this.adapter.assertIdle();this.adapter.project(args.project_id);
    if(this.adapter.b.Blockbench.version!=='5.1.6')throw new Fault('VERSION_UNSUPPORTED','Texture set import requires Blockbench 5.1.6');
    const operations:any[]=[],bindings:Record<string,string>={};
    for(const [index,asset] of args.assets.entries()) {
      let png='data:image/png;base64,'+asset.content;
      if(asset.extension==='tga') {
        const canvas=document.createElement('canvas'),texture:any={canvas,ctx:canvas.getContext('2d'),load(){}};
        const bytes=Uint8Array.from(atob(asset.content),c=>c.charCodeAt(0));
        await this.adapter.b.Texture.file_formats.tga.decode(bytes,texture);
        if(canvas.width!==asset.width||canvas.height!==asset.height)throw new Fault('TEXTURE_DIMENSIONS','Decoded TGA dimensions differ from header');
        png=texture.source;
      } else {
        const image=new Image();image.src=png;await waitForImage(image);
        if(image.naturalWidth!==asset.width||image.naturalHeight!==asset.height)throw new Fault('TEXTURE_DIMENSIONS','Decoded PNG dimensions differ from header');
      }
      const ref='image_'+index;
      operations.push({op:'texture.add',ref,name:asset.filename,width:asset.width,height:asset.height,png});
      bindings[asset.reference]='$'+ref;
    }
    operations.push({op:'texture_set.import',ref:'material',name:args.name??args.filename.replace(/\.texture_set\.json$/,' material').slice(0,160),document:args.document,texture_bindings:bindings});
    const result=await this.run('bb_plan_edit',{project_id:args.project_id,snapshot_id:args.snapshot_id,operations,label:'Import texture set'});
    return {data:{...result.data as any,input_files:args.assets.map((asset:any)=>({reference:asset.reference,filename:asset.filename,extension:asset.extension,width:asset.width,height:asset.height}))}};
  }
  async run(name: CommandName, raw: unknown): Promise<Result> {
    if (this.disposed) throw new Fault("UNLOADED", "Plugin was unloaded");
    const command = commands[name];
    if (!command) throw new Fault("UNKNOWN_TOOL", "Tool not supported");
    const args: any = command.schema.parse(raw);
    const a = this.adapter,
      b = a.b;
    if (
      this.paused &&
      !command.read &&
      !(name === "bb_history" && args.action === "list") &&
      !(name === "bb_protection" && args.action === "list")
    )
      throw new Fault("PAUSED", "MCP editing is paused in Blockbench");
    if (args.project_id && name !== "bb_select_project")
      a.project(args.project_id);
    switch (name) {
      case 'bb_import_texture_set':throw new Fault('SERVER_ONLY','Texture set file input must be prepared by the server');
      case "bb_uv_seams": {
        a.assertIdle();
        const snapshot = this.snapshots.get(args.snapshot_id);
        if (!snapshot || snapshot.state.project_id !== args.project_id || a.fingerprint() !== snapshot.fingerprint)
          throw new Fault('STALE_SNAPSHOT','Capture a fresh snapshot before editing UV seams');
        return this.integrations.uvSeams(args);
      }
      case "bb_mesh_operation": {
        a.assertIdle();
        const snapshot = this.snapshots.get(args.snapshot_id);
        if (!snapshot || snapshot.state.project_id !== args.project_id || a.fingerprint() !== snapshot.fingerprint)
          throw new Fault("STALE_SNAPSHOT", "Capture a fresh snapshot before the mesh operation");
        return this.integrations.meshOperation(args);
      }
      case 'bb_brush_stroke': {
        a.assertIdle();const snapshot=this.snapshots.get(args.snapshot_id);
        if(!snapshot||snapshot.state.project_id!==args.project_id||a.fingerprint()!==snapshot.fingerprint)throw new Fault('STALE_SNAPSHOT','Capture a fresh snapshot before the brush stroke');
        return this.integrations.brushStroke(args);
      }
      case "bb_ui_capture":
        return this.integrations.ui.capture(args);
      case 'bb_ik': {
        a.assertIdle();const snapshot=this.snapshots.get(args.snapshot_id);
        if(!snapshot||snapshot.state.project_id!==args.project_id||a.fingerprint()!==snapshot.fingerprint)throw new Fault('STALE_SNAPSHOT','Capture a fresh snapshot before configuring IK');
        return this.integrations.configureIK(args);
      }
      case 'bb_bake_ik': {
        a.assertIdle();const snapshot=this.snapshots.get(args.snapshot_id);
        if(!snapshot||snapshot.state.project_id!==args.project_id||a.fingerprint()!==snapshot.fingerprint)throw new Fault('STALE_SNAPSHOT','Capture a fresh snapshot before baking IK');
        return this.integrations.bakeIK(args);
      }
      case "bb_import_model":
      case "bb_import_animation":
        throw new Fault(
          "SERVER_ONLY",
          "Import is handled by server file boundary",
        );
      case "bb_ui_snapshot":
        return this.integrations.ui.read(args);
      case "bb_ui_interact":
        return this.integrations.ui.interact(args);
      case "bb_loader":
        return this.integrations.loader(args);
      case "bb_node_properties":
        return this.integrations.properties(args);
      case "bb_edit_node_properties":
        return this.integrations.editProperties(args);
      case "bb_file_requests":
        return this.integrations.files.list();
      case "bb_file_reply":
        if (args.action === "cancel")
          return this.integrations.files.cancel(args.file_request_id);
        if (args.action === "export")
          return this.integrations.files.export(args.file_request_id);
        throw new Fault(
          "SERVER_REQUIRED",
          "Native file imports must be staged by the server",
        );
      case "bb_control":
        return this.integrations.control(args);
      case 'bb_brush_settings':
        return this.integrations.brushSettings(args);
      case 'bb_brush_presets':
        return this.integrations.brushPresets(args);
      case 'bb_color_pick':
        a.assertIdle();
        return this.integrations.colorPick(args);
      case "bb_capabilities":
        return this.integrations.catalog(args);
      case "bb_editor_state":
        return this.integrations.editor(args);
      case "bb_select":
        return this.integrations.select(args);
      case "bb_uv_select_island":
        return this.integrations.uvSelectIsland(args);
      case "bb_action":
        return this.integrations.action(args);
      case "bb_native_operation":
        return this.integrations.nativeOperation(args);
      case "bb_menu":
        return this.integrations.menuOperation(args);
      case "bb_keybind":
        return this.integrations.keybind(args);
      case "bb_panel":
        return this.integrations.panelOperation(args);
      case "bb_preview":
        return this.integrations.previewOperation(args);
      case "bb_mode":
        return this.integrations.modeOperation(args);
      case "bb_node_type":
        return this.integrations.nodeTypeOperation(args);
      case "bb_dialog":
        return this.integrations.respond(args);
      case "bb_setting":
        return this.integrations.setting(args);
      case "bb_native_snapshot":
        return this.integrations.native(args);
      case "bb_extension":
        return this.integrations.invoke(args);
      case "bb_status":
        return {
          data: {
            plugin_version: "0.2.0",
            blockbench_version: b.Blockbench.version,
            project_id: b.Project?.uuid ?? null,
            paused: this.paused,
            apis: Object.fromEntries(
              [
                "Cube",
                "Mesh",
                "Group",
                "Texture",
                "TextureLayer",
                "Animation",
                "Undo",
                "Canvas",
                "Screencam",
                "Codecs",
                "Property",
              ].map((k) => [k, !!b[k]]),
            ),
            target_version: "5.1.6",
            version_match: b.Blockbench.version === "5.1.6",
          },
        };
      case "bb_projects":
        return {
          data: {
            projects: b.ModelProject.all.map((p: any) => ({
              id: p.uuid,
              name: p.name,
              format: p.format.id,
              selected: p === b.Project,
              saved: p.saved,
            })),
            formats: Object.values(b.Formats).map((f: any) => ({
              id: f.id,
              name: f.name ?? f.id,
            })),
          },
        };
      case "bb_create_project": {
        a.assertIdle();
        if (!b.Formats[args.format])
          throw new Fault("UNKNOWN_FORMAT", "Format is not installed");
        if (!b.newProject(b.Formats[args.format]))
          throw new Fault("PROJECT_CREATE", "Project could not be created");
        if (args.format === "skin")
          b.Codecs.skin_model.rebuild(b.Project.skin_model || "steve", "none");
        b.Project.name = args.name;
        b.Project.saved = false;
        a.revision++;
        return {
          data: {
            project_id: b.Project.uuid,
            name: b.Project.name,
            format: b.Format.id,
          },
        };
      }
      case "bb_select_project": {
        a.assertIdle();
        const p = b.ModelProject.all.find(
          (p: any) => p.uuid === args.project_id,
        );
        if (!p || !p.select())
          throw new Fault("PROJECT_SELECT", "Project could not be selected");
        return { data: { project_id: p.uuid } };
      }
      case "bb_snapshot": {
        const state = a.capture(),
          fingerprint = a.fingerprint(state);
        const prior = args.since_snapshot_id
          ? this.snapshots.get(args.since_snapshot_id)
          : null;
        if (args.since_snapshot_id && !prior)
          throw new Fault(
            "SNAPSHOT_EXPIRED",
            "Previous snapshot expired; request a fresh snapshot",
          );
        if (prior && prior.state.project_id !== state.project_id)
          throw new Fault(
            "PROJECT_MISMATCH",
            "Cannot compare snapshots from different projects",
          );
        const snapshot_id = this.store(this.snapshots, { state, fingerprint });
        const visible = clone(state);
        for (const t of visible.textures) {
          delete t.png;
          for (const l of t.layers) delete l.png;
        }
        return {
          data: {
            snapshot_id,
            project_id: state.project_id,
            revision: state.revision,
            name: state.name,
            format: state.format,
            project_uv: state.project_uv,
            capabilities: state.capabilities,
            counts: {
              nodes: state.nodes.length,
              textures: state.textures.length,
              animations: state.animations.length,
            },
            nodes: visible.nodes.slice(args.offset, args.offset + args.limit),
            next_offset:
              args.offset + args.limit < state.nodes.length
                ? args.offset + args.limit
                : null,
            textures: visible.textures,
            texture_groups:state.texture_groups??[],
            animations: visible.animations,
            changes: prior ? diff(prior.state, state) : undefined,
            protections: this.rules(),
          },
        };
      }
      case "bb_query":
        return { data: query(a.capture(false), args.query) };
      case 'bb_plan_auto_cullfaces': {
        a.assertIdle();
        if(!b.Modes.edit||!b.Format.cullfaces)throw new Fault('CULLFACE_CONTEXT','Requires edit mode and a cullfaces-capable format');
        const snapshot=this.snapshots.get(args.snapshot_id);
        if(!snapshot||snapshot.state.project_id!==args.project_id)throw new Fault('SNAPSHOT_EXPIRED','Capture a new snapshot');
        if(a.fingerprint()!==snapshot.fingerprint)throw new Fault('STALE_SNAPSHOT','Capture a new snapshot');
        const state=structuredClone(snapshot.state),rules=this.rules(),decisions:any[]=[];
        assertUnlocked(state,rules,args.ids,['geometry','uv']);
        for(const id of args.ids){
          const node=state.nodes.find(n=>n.id===id),native=b.OutlinerNode.uuids[id];
          if(!node||!native)throw new Fault('NOT_FOUND',`Unknown cube ${id}`);
          if(node.type!=='cube')throw new Fault('TYPE_MISMATCH','Automatic cullfaces require cubes');
          native.mesh.updateWorldMatrix(true,false);
          const vertices=native.getGlobalVertexPositions();
          for(const face of args.faces){
            const data=node.faces![face],previous=data.cullface??'';
            if(data.texture===null&&!args.include_disabled){decisions.push({node_id:id,face,previous,value:previous,skipped:true});continue;}
            const corners=native.faces[face].getVertexIndices().map((i:number)=>vertices[i]);
            const value=classifyCullface(face,corners,args);data.cullface=value;
            decisions.push({node_id:id,face,previous,value,skipped:false});
          }
        }
        const plan:Plan={state,changes:diff(snapshot.state,state),created:{},warnings:[]};
        const plan_id=this.store(this.plans,{plan,fingerprint:snapshot.fingerprint,protection:stable(rules),label:'Automatically set cullfaces',project:args.project_id},3);
        return {data:{plan_id,project_id:args.project_id,changes:plan.changes,decisions,warnings:plan.warnings}};
      }
      case 'bb_plan_spline_join': {
        a.assertIdle();
        if(!b.Modes.edit||!b.Format.splines)throw new Fault('SPLINE_CONTEXT','Requires edit mode and spline-capable format');
        const snapshot=this.snapshots.get(args.snapshot_id);
        if(!snapshot||snapshot.state.project_id!==args.project_id)throw new Fault('SNAPSHOT_EXPIRED','Capture a new snapshot');
        if(a.fingerprint()!==snapshot.fingerprint)throw new Fault('STALE_SNAPSHOT','Capture a new snapshot');
        const state=structuredClone(snapshot.state),rules=this.rules();
        const parts=args.parts.map((part:any)=>{
          const node=state.nodes.find(n=>n.id===part.node_id),native=b.OutlinerNode.uuids[part.node_id];
          if(!node||!native)throw new Fault('NOT_FOUND',`Unknown spline input ${part.node_id}`);
          if(node.type!=='spline')throw new Fault('TYPE_MISMATCH',`Input ${part.node_id} is ${node.type}; expected spline`);
          native.mesh.updateWorldMatrix(true,false);
          return {node,reverse:part.reverse,matrix:native.mesh.matrixWorld.elements.slice()};
        });
        assertUnlocked(state,rules,parts.map((p:any)=>p.node.id),['geometry','uv']);
        const first=parts[0];
        if(first.node.parent)assertUnlocked(state,rules,[first.node.parent],['structure']);
        const count=parts.reduce((n:number,p:any)=>n+Object.keys(p.node.native_copy?.vertices??{}).length,0);
        if(count>20000)throw new Fault('SPLINE_BUDGET','Joined spline is limited to 20000 control vertices');
        const topology=connectSplineChains(parts.map((p:any)=>({data:p.node.native_copy,reverse:p.reverse,toTarget:p===first?((point:any)=>point):splineCoordinateConverter(p.matrix,first.matrix)})));
        const cost=(first.node.native_copy?.radial_resolution??6)*(first.node.native_copy?.tubular_resolution??12)*Object.keys(topology.curves).length;
        if(cost>1048576)throw new Fault('SPLINE_BUDGET','Joined tube exceeds the generation budget');
        const output=structuredClone(first.node),outputId=this.uuid();output.id=outputId;output.name=args.name;
        output.native_copy={...output.native_copy,...topology,name:args.name};
        state.nodes.push(output);
        const settingKeys=['texture','radial_resolution','tubular_resolution','radius_multiplier','render_mode','uv_mode','shading','display_space','render_order','visibility','export','color'];
        const settings_overrides=parts.slice(1).flatMap((part:any)=>settingKeys.filter(key=>stable(part.node.native_copy?.[key])!==stable(first.node.native_copy?.[key])).map(key=>({node_id:part.node.id,field:key,input:part.node.native_copy?.[key]??null,output:first.node.native_copy?.[key]??null})));
        if(args.settings_policy==='require_match'&&settings_overrides.length)throw new Fault('SPLINE_SETTINGS_MISMATCH','Input spline settings differ',{settings_overrides});
        const warnings:Plan['warnings']=settings_overrides.length?[{severity:'warning',code:'SPLINE_SETTINGS_OVERRIDDEN',message:'Output uses the first spline settings. See settings_overrides for input values that will not be retained in the joined copy.',ids:[...new Set<string>(settings_overrides.map((v:any)=>v.node_id))]}]:[];
        const plan:Plan={state,changes:diff(snapshot.state,state),created:{joined:outputId},warnings};
        const plan_id=this.store(this.plans,{plan,fingerprint:snapshot.fingerprint,protection:stable(rules),label:'Join spline copies',project:args.project_id},3);
        return {data:{plan_id,project_id:args.project_id,changes:plan.changes,created:plan.created,source_nodes_preserved:true,settings_source:first.node.id,settings_overrides,warnings,bridges:parts.length-1}};
      }
      case "bb_plan_edit": {
        a.assertIdle();
        const snapshot = this.snapshots.get(args.snapshot_id);
        if (!snapshot || snapshot.state.project_id !== args.project_id)
          throw new Fault("SNAPSHOT_EXPIRED", "Capture a new snapshot");
        if (a.fingerprint() !== snapshot.fingerprint)
          throw new Fault(
            "STALE_SNAPSHOT",
            "Model changed since snapshot; capture it again",
          );
        const rules = this.rules();
        const plan = planEdit(snapshot.state, args.operations, rules, () =>
          this.uuid(),
        );
        const plan_id = this.store(
          this.plans,
          {
            plan,
            fingerprint: snapshot.fingerprint,
            protection: stable(rules),
            label: args.label,
            project: args.project_id,
          },
          3,
        );
        return {
          data: {
            plan_id,
            project_id: args.project_id,
            changes: plan.changes,
            created: plan.created,
            warnings: plan.warnings,
            summary: {
              added: plan.changes.filter((c) => c.action === "add").length,
              updated: plan.changes.filter((c) => c.action === "update").length,
              deleted: plan.changes.filter((c) => c.action === "delete").length,
            },
          },
        };
      }
      case "bb_apply_plan": {
        const saved = this.plans.get(args.plan_id);
        if (!saved || saved.project !== args.project_id)
          throw new Fault(
            "PLAN_EXPIRED",
            "Plan missing or belongs to another project",
          );
        if (stable(this.rules()) !== saved.protection)
          throw new Fault(
            "PROTECTION_CHANGED",
            "Protection rules changed; create a new plan",
          );
        if (a.fingerprint() !== saved.fingerprint)
          throw new Fault("STALE_PLAN", "Model changed; create a new plan");
        this.plans.delete(args.plan_id);
        if (!saved.plan.changes.length)
          return { data: { changes: [], no_op: true } };
        return {
          data: await a.apply(saved.plan, saved.label, saved.fingerprint),
        };
      }
      case "bb_protection": {
        const rules = this.rules();
        if (args.action === "set") {
          if (!args.rule) throw new Fault("INPUT", "rule is required");
          for (const id of args.rule.node_ids)
            if (!b.OutlinerNode.uuids[id])
              throw new Fault(
                "NOT_FOUND",
                `Protected node ${id} does not exist`,
              );
          const idx = rules.findIndex((p) => p.id === args.rule.id);
          if (idx >= 0) rules[idx] = args.rule;
          else rules.push(args.rule);
        } else if (args.action === "remove") {
          if (!args.rule_id) throw new Fault("INPUT", "rule_id is required");
          const idx = rules.findIndex((p) => p.id === args.rule_id);
          if (idx < 0)
            throw new Fault("NOT_FOUND", "Protection rule not found");
          rules.splice(idx, 1);
        }
        if (args.action !== "list") {
          b.Project.perfect_mcp_protections = rules;
          b.Project.saved = false;
          a.revision++;
        }
        return {
          data: {
            rules,
            scope: "MCP operations only; manual edits are unaffected",
          },
        };
      }
      case "bb_diagnose": {
        const issues = diagnose(a.capture(false));
        return {
          data: {
            issues,
            counts: {
              errors: issues.filter((i) => i.severity === "error").length,
              warnings: issues.filter((i) => i.severity === "warning").length,
              info: issues.filter((i) => i.severity === "info").length,
            },
            auto_repaired: false,
          },
        };
      }
      case "bb_templates":
        return {
          data: {
            operations: templateOperations(args),
            instruction:
              "Take a fresh snapshot, plan these operations, then apply the returned plan_id.",
          },
        };
      case "bb_capture":
        return a.captureViews(args.views, args.size);
      case "bb_animation_frames": {
        const result = await a.captureViews(
          [args.view],
          args.size,
          args.animation_id,
          args.times,
        );
        if (args.contact_sheet && result.images?.length) {
          const cols = Math.min(4, result.images.length),
            rows = Math.ceil(result.images.length / cols),
            c = document.createElement("canvas");
          c.width = cols * args.size;
          c.height = rows * (args.size + 24);
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#24272b";
          ctx.fillRect(0, 0, c.width, c.height);
          for (let i = 0; i < result.images.length; i++) {
            const image = await loadImage(
              `data:image/png;base64,${result.images[i].data}`,
            );
            const x = (i % cols) * args.size,
              y = Math.floor(i / cols) * (args.size + 24);
            ctx.drawImage(image, x, y, args.size, args.size);
            ctx.fillStyle = "#ffffff";
            ctx.font = "14px sans-serif";
            ctx.fillText(`${args.times[i]} s`, x + 8, y + args.size + 17);
          }
          result.images = [
            {
              label: "Animation contact sheet",
              mimeType: "image/png",
              data: c.toDataURL().split(",")[1],
            },
          ];
        }
        return result;
      }
      case "bb_history": {
        a.assertIdle();
        if (args.action !== "list") {
          if (this.rules().length)
            throw new Fault(
              "PROTECTED_HISTORY",
              "Remove protection rules explicitly before changing global Undo history",
            );
            const entry=b.Undo.history[args.action==='undo'?b.Undo.index-1:b.Undo.index];
            const compositeSave=(args.action==='undo'?entry?.before:entry?.post)?.__pbmc_texture_composites;
            if (args.action === "undo") b.Undo.undo();
            else b.Undo.redo();
            await restoreTextureComposites(b,compositeSave);
            for(const node of b.Outliner.elements){
              if(['cube','mesh','spline'].includes(node.type)&&['default','behind','in_front'].includes(node.render_order))
                node.preview_controller.updateRenderOrder(node);
            }
          a.revision++;
        }
        return {
          data: {
            index: b.Undo.index,
            history: b.Undo.history.map((e: any, i: number) => ({
              index: i,
              action: e.action,
              time: e.time,
              applied: i < b.Undo.index,
            })),
          },
        };
      }
      case "bb_texture_image": {
        const t = b.Texture.all.find((t: any) => t.uuid === args.texture_id);
        if (!t) throw new Fault("NOT_FOUND", "Texture not found");
        const l = args.layer_id
          ? t.layers.find((l: any) => l.uuid === args.layer_id)
          : null;
        if (args.layer_id && !l)
          throw new Fault("NOT_FOUND", "Layer not found");
        const c = l?.canvas ?? t.canvas;
        return {
          data: {
            texture_id: t.uuid,
            layer_id: l?.uuid,
            width: c.width,
            height: c.height,
          },
          images: [
            {
              label: l?.name ?? t.name,
              data: c.toDataURL("image/png").split(",")[1],
              mimeType: "image/png",
            },
          ],
        };
      }
      case "bb_export": {
        a.assertIdle();
        if(args.flipbook!==undefined&&args.codec!=='texture_animation')throw new Fault('INPUT','flipbook arguments require codec texture_animation');
        if(args.codec==='texture_animation') {
          a.project(args.project_id);
          if(b.Blockbench.version!=='5.1.6')throw new Fault('VERSION_UNSUPPORTED','Flipbook reference export requires Blockbench 5.1.6');
          if(!args.texture_id)throw new Fault('INPUT','texture_id required');
          const texture=b.Texture.all.find((t:any)=>t.uuid===args.texture_id);
          if(!texture)throw new Fault('NOT_FOUND','Texture not found');
          const compiled=compileFlipbookReference({format:b.Format.id,frame_count:texture.frameCount||1,fps:texture.fps,
            model_identifier:b.Project.model_identifier,texture_path:texture.path||'',texture_name:texture.name},args.flipbook??{});
          return {data:{content:JSON.stringify(compiled.content,null,2),encoding:'utf8',extension:'json',export_details:compiled.details}};
        }
        if(args.codec==='texture_frame') {
          a.project(args.project_id);
          if(b.Blockbench.version!=='5.1.6')throw new Fault('VERSION_UNSUPPORTED','Frame export requires Blockbench 5.1.6');
          if(!args.texture_id||args.frame_index===undefined)throw new Fault('INPUT','texture_id and frame_index required');
          const texture=b.Texture.all.find((t:any)=>t.uuid===args.texture_id);
          if(!texture||texture.error)throw new Fault('NOT_FOUND','Loaded texture not found');
          const count=texture.frameCount||1,height=texture.height/count;
          if(args.frame_index>=count||!Number.isInteger(height))throw new Fault('TEXTURE_FRAME_INDEX','Frame must exist and have integer pixel height');
          let source=texture.canvas;
          if(texture.layers_enabled) {
            source=document.createElement('canvas');
            b.Texture.prototype.updateLayerChanges.call({layers_enabled:true,width:texture.width,height:texture.height,canvas:source,ctx:source.getContext('2d'),layers:texture.layers,getMaterial:()=>null},false);
          }
          const frame=document.createElement('canvas');frame.width=texture.width;frame.height=height;
          frame.getContext('2d')!.drawImage(source,0,args.frame_index*height,texture.width,height,0,0,texture.width,height);
          return {data:{content:frame.toDataURL('image/png').split(',')[1],encoding:'base64',extension:'png'}};
        }
        if(args.codec==='texture_mcmeta') {
          a.project(args.project_id);
          if(b.Blockbench.version!=='5.1.6'||!b.Format.texture_mcmeta)throw new Fault('FORMAT_UNSUPPORTED','Texture mcmeta export requires a Blockbench 5.1.6 texture_mcmeta format');
          if(!args.texture_id)throw new Fault('INPUT','texture_id required');
          const texture=b.Texture.all.find((t:any)=>t.uuid===args.texture_id);
          if(!texture)throw new Fault('NOT_FOUND','Texture not found');
          return {data:{content:JSON.stringify(texture.getMCMetaContent(),null,2),encoding:'utf8',extension:'mcmeta'}};
        }
        if(args.codec==='texture_set') {
          a.project(args.project_id);
          if(b.Blockbench.version!=='5.1.6')throw new Fault('VERSION_UNSUPPORTED','Texture set export requires Blockbench 5.1.6');
          if(!args.texture_group_id)throw new Fault('INPUT','texture_group_id required');
          const group=b.TextureGroup.all.find((g:any)=>g.uuid===args.texture_group_id);
          if(!group?.is_material)throw new Fault('MATERIAL_NOT_FOUND','Select a texture group configured as a material');
          return {data:{content:JSON.stringify(group.material_config.compileForBedrock(),null,2),encoding:'utf8',extension:'json'}};
        }
        if (args.codec === "formats")
          return {
            data: {
              codecs: Object.entries(b.Codecs)
                .filter(([, c]: any) => typeof c.compile === "function")
                .map(([id, c]: any) => ({
                  id,
                  name: c.name,
                  extension: c.extension,
                  format: c.format?.id,
                })),
              animation_codecs: Object.keys(b.AnimationCodec?.codecs ?? {}).map(
                (id) => ({ id: `animation:${id}` }),
              ),
              asset_codecs:[{id:'texture_animation',extension:'json',requires:'texture_id',formats:['bedrock','bedrock_block']},{id:'texture_frame',extension:'png',requires:'texture_id,frame_index'},{id:'texture_mcmeta',extension:'png.mcmeta',requires:'texture_id'},{id:'texture_set',extension:'texture_set.json',requires:'texture_group_id'}],
            },
          };
        if (args.codec === "texture") {
          if (!args.texture_id) throw new Fault("INPUT", "texture_id required");
          const t = b.Texture.all.find((t: any) => t.uuid === args.texture_id);
          if (!t) throw new Fault("NOT_FOUND", "Texture not found");
          return {
            data: {
              content: t.canvas.toDataURL("image/png").split(",")[1],
              encoding: "base64",
              extension: "png",
            },
          };
        }
        if (args.codec === "animation" || args.codec.startsWith("animation:")) {
          const codec =
            args.codec === "animation"
              ? args.controller_ids
                ? b.AnimationCodec?.codecs.bedrock_animation_controller
                : b.AnimationCodec?.getCodec()
              : b.AnimationCodec?.codecs[args.codec.slice(10)];
          if (!codec)
            throw new Fault(
              "UNKNOWN_CODEC",
              "No animation codec. List formats and specify animation:<id>.",
            );
          const isController = codec.id === "bedrock_animation_controller";
          if (
            (isController && args.animation_ids) ||
            (!isController && args.controller_ids)
          )
            throw new Fault(
              "CODEC_TARGET",
              "Use controller_ids with the controller codec and animation_ids with animation codecs",
            );
          const sourceItems = isController
            ? b.AnimationController.all
            : b.Animation.all;
          const selectedIds = isController
            ? args.controller_ids
            : args.animation_ids;
          const animations = selectedIds
            ? selectedIds.map((id: string) => {
                const animation = sourceItems.find((a: any) => a.uuid === id);
                if (!animation)
                  throw new Fault("NOT_FOUND", `Animation ${id} not found`);
                return animation;
              })
            : [...sourceItems];
          if (!animations.length)
            throw new Fault("NO_ANIMATION", "No animations to export");
          if (
            !codec.compileFile &&
            (animations.length !== 1 || !codec.compileAnimation)
          )
            throw new Fault(
              "CODEC_LIMIT",
              "Codec requires one animation or does not support compilation",
            );
          const content = await (codec.compileFile
            ? codec.compileFile(animations)
            : codec.compileAnimation(animations[0]));
          if (content === undefined)
            throw new Fault(
              "COMPILE_FAILED",
              "Animation codec returned no content",
            );
          return {
            data: {
              content:
                typeof content === "string"
                  ? content
                  : JSON.stringify(content, null, 2),
              encoding: "utf8",
              extension: codec.id === "modded_entity" ? "java" : "json",
              codec: args.codec,
            },
          };
        }
        const opts =
          args.codec === "project"
            ? { ...args.options, bitmaps: true, raw: false }
            : args.options;
        if (args.codec === "obj" && args.options.bundle)
          return { data: await compileObjBundle(a, opts) };
        if (args.codec === "obj" && args.options.all_files)
          throw new Fault(
            "OBJ_BUNDLE_REQUIRED",
            "Use options.bundle=true to export OBJ, MTL and images together",
          );
        let content = await compileForExport(a, args.codec, opts);
        if (args.codec === "project" && b.Format.id === "skin") {
          const checkpoint =
            typeof content === "string" ? JSON.parse(content) : content;
          checkpoint.perfect_mcp_skin_geometry = {
            elements: b.Outliner.elements.map((n: any) =>
              n.getSaveCopy(checkpoint.meta),
            ),
            groups: b.Group.all.map((g: any) => g.getSaveCopy(false)),
            outliner: b.Outliner.toJSON(),
            face_textures: Object.fromEntries(
              b.Outliner.elements
                .filter((n: any) => n.faces)
                .map((n: any) => [
                  n.uuid,
                  Object.fromEntries(
                    Object.entries(n.faces).map(([id, f]: any) => [
                      id,
                      f.texture,
                    ]),
                  ),
                ]),
            ),
          };
          content = JSON.stringify(checkpoint);
        }
        const binary =
          content instanceof ArrayBuffer || ArrayBuffer.isView(content);
        if (content === undefined || content === null)
          throw new Fault(
            "EMPTY_EXPORT",
            "Codec did not produce export content",
          );
        let extension = b.Codecs[args.codec].extension;
        if (args.codec === "gltf" && binary) extension = "glb";
        if (args.codec === "image")
          extension =
            args.options.format ??
            b.Codecs.image.getExportOptions().format ??
            extension;
        if (typeof content === "string" && content.startsWith("data:image/")) {
          const match =
            /^data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(
              content,
            );
          if (!match)
            throw new Fault(
              "IMAGE_ENCODING",
              "Image codec returned an unsupported data URL",
            );
          const extensions: Record<string, string> = {
            png: "png",
            jpeg: "jpg",
            webp: "webp",
            gif: "gif",
            bmp: "bmp",
            tiff: "tiff",
            "svg+xml": "svg",
          };
          return {
            data: {
              content: match[2].replace(/[\r\n]/g, ""),
              encoding: "base64",
              extension:
                extensions[match[1].toLowerCase()] ?? extension ?? "bin",
              codec: args.codec,
            },
          };
        }
        if (content instanceof Blob) {
          const bytes = new Uint8Array(await content.arrayBuffer());
          return {
            data: {
              content: bytesToBase64(bytes),
              encoding: "base64",
              extension: extension ?? "bin",
            },
          };
        }
        return {
          data: {
            content: binary
              ? bytesToBase64(
                  new Uint8Array(
                    content instanceof ArrayBuffer ? content : content.buffer,
                    content instanceof ArrayBuffer ? 0 : content.byteOffset,
                    content.byteLength,
                  ),
                )
              : typeof content === "string"
                ? content
                : JSON.stringify(content, null, 2),
            encoding: binary ? "base64" : "utf8",
            extension: extension ?? "json",
            codec: args.codec,
          },
        };
      }
      case "bb_restore_checkpoint":
        throw new Fault(
          "SERVER_ONLY",
          "Restore is handled by the server file boundary",
        );
      case "bb_conversion_preview":
        return { data: this.conversionPreview(args.format) };
      case "bb_convert_copy": {
        a.assertIdle();
        const snapshot = this.snapshots.get(args.snapshot_id);
        if (!snapshot || a.fingerprint() !== snapshot.fingerprint)
          throw new Fault("STALE_SNAPSHOT", "Capture a fresh snapshot");
        const report = this.conversionPreview(args.format);
        const old = b.Project;
        const model = a.compile("project", { raw: true, bitmaps: true });
        await this.openCheckpoint(model, `${old.name}_${args.format}.bbmodel`);
        b.Formats[args.format].convertTo();
        b.Project.name = `${old.name}_${args.format}`;
        b.Project.saved = false;
        return {
          data: {
            ...report,
            source_project_id: old.uuid,
            project_id: b.Project.uuid,
            source_preserved: true,
          },
        };
      }
      case "bb_job":
        throw new Fault(
          "TRANSPORT_ONLY",
          "Job status is provided by transport",
        );
    }
  }
  conversionPreview(format: string) {
    const b = this.adapter.b,
      target = b.Formats[format];
    if (!target) throw new Fault("UNKNOWN_FORMAT", "Format not installed");
    const state = this.adapter.capture(false);
    const losses: string[] = [];
    if (!target.meshes && state.nodes.some((n) => n.type === "mesh"))
      losses.push("Meshes will be removed");
    if (!target.animation_mode && state.animations.length)
      losses.push("Animations will be removed");
    if (
      !target.bone_rig &&
      state.nodes.some((n) => n.type === "group" && n.rotation.some((v) => v))
    )
      losses.push("Bone rotations will be reset");
    if (
      !target.rotate_cubes &&
      state.nodes.some((n) => n.type === "cube" && n.rotation.some((v) => v))
    )
      losses.push("Cube rotations will be reset");
    losses.push(
      "Copy Undo history is cleared; UV, origin and texture rules may be converted",
    );
    return {
      source_format: state.format,
      target_format: format,
      potential_losses: losses,
      analysis:
        "Advisory static comparison. Target project-dependent constraints must be rechecked on the converted copy.",
    };
  }
  async openCheckpoint(model: unknown, filename: string) {
    this.adapter.assertIdle();
    const b = this.adapter.b;
    if (!isCheckpoint(model))
      throw new Fault(
        "INVALID_CHECKPOINT",
        "Expected a bbmodel with meta and elements",
      );
    const data = clone(model) as any;
    if (
      data.meta.format_version !== "5.0" ||
      !b.Formats[data.meta.model_format]
    )
      throw new Fault(
        "CHECKPOINT_VERSION",
        "Restore expects a version 5.0 bbmodel checkpoint and an installed model format",
      );
    const skinPreset =
      data.meta.model_format === "skin" ? data.skin_model : undefined;
    const skinGeometry = data.perfect_mcp_skin_geometry;
    if (skinPreset && skinGeometry) {
      if (
        !Array.isArray(skinGeometry.elements) ||
        !Array.isArray(skinGeometry.groups) ||
        !Array.isArray(skinGeometry.outliner)
      )
        throw new Fault(
          "INVALID_CHECKPOINT",
          "Invalid preserved skin geometry",
        );
      data.elements = skinGeometry.elements;
      data.groups = skinGeometry.groups;
      data.outliner = skinGeometry.outliner;
      delete data.skin_model;
      delete data.perfect_mcp_skin_geometry;
    } else if (skinPreset && data.perfect_mcp_protections?.length) {
      throw new Fault(
        "CHECKPOINT_SKIN_IDS",
        "Native skin preset files regenerate node IDs and cannot preserve these protection references",
      );
    }
    // Embedded checkpoint pixels take precedence over older linked files.
    for (const texture of data.textures ?? []) {
      if (
        typeof texture.source === "string" &&
        texture.source.startsWith("data:image/")
      ) {
        texture.path = "";
        texture.relative_path = "";
      }
    }
    b.Codecs.project.load(data, {
      name: filename,
      path: filename,
      no_file: true,
    });
    const opened = b.Project;
    if (skinPreset && skinGeometry) {
      opened.skin_model = skinPreset;
      for (const node of opened.elements)
        for (const [face, texture] of Object.entries(
          skinGeometry.face_textures?.[node.uuid] ?? {},
        )) {
          if (
            node.faces?.[face] &&
            (texture === false ||
              texture === null ||
              opened.textures.some((t: any) => t.uuid === texture))
          )
            node.faces[face].texture = texture;
        }
    }
    // Native bbmodel parsing starts image loads but returns synchronously.
    // Wait for both texture and layer images before exposing the restored model.
    await Promise.all(
      opened.textures
        .flatMap((t: any) => [t.img, ...t.layers.map((l: any) => l.img)])
        .map(waitForImage),
    );
    this.adapter.assertIdle();
    this.adapter.project(opened.uuid);
    for (const texture of opened.textures) {
      if (texture.layers_enabled) {
        // A cached image can be complete before TextureLayer's load callback has
        // populated its canvas. Materialize the decoded checkpoint pixels before
        // composing; a later native load callback writes the same pixels.
        for (const layer of texture.layers) {
          if (layer.img.src && layer.img.naturalWidth > 0) {
            layer.canvas.width = layer.img.naturalWidth;
            layer.canvas.height = layer.img.naturalHeight;
            layer.ctx.drawImage(layer.img, 0, 0);
          }
        }
        texture.updateLayerChanges(true);
      } else if(texture.img.src && texture.img.naturalWidth>0) {
        texture.canvas.width=texture.img.naturalWidth;
        texture.canvas.height=texture.img.naturalHeight;
        texture.ctx.drawImage(texture.img,0,0);
      }
    }
    b.Canvas.updateAll();
    for(const group of opened.texture_groups??[])refreshCoreMaterial(group);
    this.adapter.revision++;
    return {
      data: {
        project_id: b.Project.uuid,
        name: b.Project.name,
        opened_in_new_tab: true,
        node_ids_regenerated: !!skinPreset && !skinGeometry,
      },
    };
  }
}
export function bytesToBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 16384)
    s += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(s);
}
function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Fault("IMAGE", "Frame decode failed"));
    i.src = url;
  });
}
