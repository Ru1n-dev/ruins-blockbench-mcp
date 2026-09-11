import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import {
  cloneReferenceProject,
  disposeReference,
  encodeReference,
  parseReference,
  referenceBytes,
} from "./reference-assets.ts";

export function installReferenceModels(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const unloads = new WeakMap<object, Function>();
  const loaders = new WeakMap<object, any>();
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "reference_models" || this.version !== "1.1.0")
      return load.apply(this, args);
    if (!unloads.has(this)) unloads.set(this, this.onunload);
    const oldLoader = b.THREE.GLTFLoader,
      on = b.Blockbench.on,
      nativeListeners: any[] = [];
    b.Blockbench.on = function (name: any, callback: any) {
      nativeListeners.push([name, callback]);
      return on.call(this, name, callback);
    };
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      b.Blockbench.on = on;
    }
    for (const [name, callback] of nativeListeners)
      b.Blockbench.removeListener(name, callback);
    let Loader: any = loaders.get(this),
      active = true;
    if (!Loader)
      queueMicrotask(() => {
        Loader = b.THREE.GLTFLoader;
        loaders.set(this, Loader);
      });
    const Type = b.OutlinerElement.types.reference_model,
      controller = Type.preview_controller;
    const embedded = new b.Property(Type, "string", "pbmc_reference_source");
    const records = new Map<
        any,
        {
          host: any;
          root?: any;
          token: object;
          owner: any;
          project?: string;
          encoded?: string;
        }
      >(),
      staged = new Map<any, any>(),
      dialogs = new Set<any>();
    const wire = (element: any, host: any) =>
      host.traverse((n: any) => {
        for (const m of Array.isArray(n.material) ? n.material : [n.material])
          if (m && "wireframe" in m) m.wireframe = !!element.wireframe;
      });
    const clear = (element: any) => {
      const record = records.get(element);
      if (record?.root) disposeReference(record.root);
      records.delete(element);
    };
    const attach = (element: any, root: any) => {
      const record = records.get(element);
      if (!record) {
        disposeReference(root);
        return;
      }
      record.project = element.project;
      record.encoded = element.pbmc_reference_source;
      if (record.root) disposeReference(record.root);
      record.root = root;
      record.host.add(root);
      wire(element, record.host);
    };
    const populate = (element: any) => {
      const record = records.get(element);
      if (!record || !active) return;
      record.project = element.project;
      record.encoded = element.pbmc_reference_source;
      const token = {};
      record.token = token;
      if (staged.has(element)) {
        attach(element, staged.get(element));
        staged.delete(element);
        return;
      }
      try {
        if (element.project)
          attach(
            element,
            cloneReferenceProject(
              b,
              b.ModelProject.all.find((p: any) => p.uuid === element.project),
              record.owner,
            ),
          );
        else if (element.pbmc_reference_source) {
          const bytes = Uint8Array.from(
            atob(element.pbmc_reference_source),
            (c: string) => c.charCodeAt(0),
          );
          const buffer = referenceBytes(bytes);
          void parseReference(Loader || b.THREE.GLTFLoader, buffer)
            .then((root) => {
              if (
                !active ||
                records.get(element) !== record ||
                record.token !== token
              ) {
                disposeReference(root);
                return;
              }
              root.scale.multiplyScalar(record.owner.format.block_size || 16);
              attach(element, root);
            })
            .catch((error) => {
              record.host.userData.reference_error = String(
                error.message || error,
              );
            });
        } else if (element.path)
          record.host.userData.reference_error =
            "Relink this legacy external reference file";
      } catch (error: any) {
        record.host.userData.reference_error = error.message;
      }
    };
    controller.setup = function (element: any) {
      clear(element);
      const host = new b.THREE.Object3D();
      host.name = element.uuid;
      host.type = "reference_model";
      host.isElement = true;
      host.rotation.order = b.Format.euler_order;
      b.Project.nodes_3d[element.uuid] = host;
      records.set(element, { host, owner: b.Project, token: {} });
      this.updateTransform(element);
      host.visible = element.visibility;
      populate(element);
    };
    const remove = controller.remove;
    controller.remove = function (element: any) {
      clear(element);
      return remove.call(this, element);
    };
    controller.updateSelection = function (element: any) {
      const record = records.get(element);
      if (record) wire(element, record.host);
    };
    controller.updateGeometry = function (element: any) {
      const record = records.get(element);
      if (
        record &&
        (record.project !== element.project ||
          record.encoded !== element.pbmc_reference_source)
      )
        populate(element);
    };
    const refresh = () => {
      for (const element of b.Project?.elements || [])
        if (element.type === "reference_model") {
          if (!records.has(element)) controller.setup(element);
          else populate(element);
        }
    };
    b.Blockbench.on("select_project", refresh);
    for (const project of b.ModelProject.all)
      for (const element of project.elements || [])
        if (element.type === "reference_model")
          Object.setPrototypeOf(element, Type.prototype);
    refresh();
    function open(target?: any) {
      const owner = b.Project,
        adapter = new Adapter(b),
        fingerprint = adapter.fingerprint();
      const options: any = {};
      for (const p of b.ModelProject.all)
        if (p !== owner) options[p.uuid] = p.name;
      const dialog = new b.Dialog("pbmc_reference_model_source", {
        title: "Reference Model",
        form: {
          type: {
            type: "select",
            label: "Source",
            options: { project: "Project tab", file: "Embedded glTF / GLB" },
            value: target?.project || !target?.path ? "project" : "file",
          },
          project: {
            type: "select",
            label: "Project",
            options,
            value: target?.project || Object.keys(options)[0],
            condition: (v: any) => v.type === "project",
          },
          file: {
            type: "file",
            label: "3D File",
            extensions: ["gltf", "glb"],
            readtype: "binary",
            return_as: "file",
            condition: (v: any) => v.type === "file",
          },
        },
        async onConfirm(values: any) {
          let root: any,
            source = "";
          if (values.type === "project")
            root = cloneReferenceProject(
              b,
              b.ModelProject.all.find((p: any) => p.uuid === values.project),
              owner,
            );
          else {
            const buffer = referenceBytes(values.file?.content);
            source = encodeReference(buffer);
            root = await parseReference(Loader || b.THREE.GLTFLoader, buffer);
            root.scale.multiplyScalar(owner.format.block_size || 16);
          }
          if (
            !active ||
            b.Project !== owner ||
            adapter.fingerprint() !== fingerprint
          ) {
            disposeReference(root);
            throw new Fault(
              "STALE_STATE",
              "The reference model context changed",
            );
          }
          const elements = target ? [target] : [];
          b.Undo.initEdit({ outliner: true, elements, selection: true });
          try {
            const element = target || new Type({ export: false });
            element.project = values.type === "project" ? values.project : "";
            element.path =
              values.type === "file" ? values.file.name || "reference.glb" : "";
            element.pbmc_reference_source = source;
            element.name =
              values.type === "project"
                ? options[values.project]
                : element.path;
            if (!target) {
              staged.set(element, root);
              element.init().addTo(b.getCurrentGroup());
              elements.push(element);
            } else attach(element, root);
            element.select();
            controller.updateTransform(element);
            b.updateSelection();
            b.Undo.finishEdit(
              target ? "Change reference model source" : "Add reference model",
            );
          } catch (error) {
            b.Undo.cancelEdit(true);
            throw error;
          }
        },
      });
      dialogs.add(dialog);
      dialog.show();
    }
    b.BarItems.add_reference_model.click = () => open();
    b.BarItems.change_reference_model_file.click = () => open(Type.selected[0]);
    this.onunload = () => {
      active = false;
      b.Blockbench.removeListener("select_project", refresh);
      for (const element of records.keys()) clear(element);
      for (const dialog of dialogs) {
        dialog.hide();
        dialog.delete();
      }
      dialogs.clear();
      if (b.THREE.GLTFLoader === Loader) b.THREE.GLTFLoader = oldLoader;
      return unloads.get(this)!.call(this);
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
