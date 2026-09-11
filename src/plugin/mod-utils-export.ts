import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

const mappings: Record<
  string,
  { cube: string; join: string; boolean: string; empty: string }
> = {
  mojmaps: {
    cube: "Block.box",
    join: "VoxelShapes.join",
    boolean: "IBooleanFunction",
    empty: "VoxelShapes.empty()",
  },
  mcp: {
    cube: "Block.makeCuboidShape",
    join: "VoxelShapes.combineAndSimplify",
    boolean: "IBooleanFunction",
    empty: "VoxelShapes.empty()",
  },
  yarn: {
    cube: "Block.createCuboidShape",
    join: "VoxelShapes.combineAndSimplify",
    boolean: "BooleanBiFunction",
    empty: "VoxelShapes.empty()",
  },
  parchment: {
    cube: "Block.box",
    join: "Shapes.join",
    boolean: "BooleanOp",
    empty: "Shapes.empty()",
  },
};
const operations = new Set([
  "FALSE",
  "NOT_OR",
  "ONLY_SECOND",
  "NOT_FIRST",
  "ONLY_FIRST",
  "NOT_SECOND",
  "NOT_SAME",
  "NOT_AND",
  "AND",
  "SAME",
  "SECOND",
  "CAUSES",
  "FIRST",
  "CAUSED_BY",
  "OR",
  "TRUE",
]);

export function voxelShapeExpression(
  nodes: any[],
  mapping: string,
  operation = "OR",
  depth = 0,
): string {
  const m = mappings[mapping];
  if (!m) throw new Fault("FORM_OPTION", "Unknown voxel shape mapping");
  if (!operations.has(operation))
    throw new Fault(
      "VOXEL_OPERATION",
      `Unknown Boolean operation: ${operation}`,
    );
  if (depth > 128)
    throw new Fault("VOXEL_DEPTH", "Voxel shape hierarchy is too deep");
  const terms = nodes.map((node) => {
    if (Array.isArray(node.children))
      return voxelShapeExpression(
        node.children,
        mapping,
        node.name?.startsWith("$") ? node.name.slice(1).toUpperCase() : "OR",
        depth + 1,
      );
    if (
      !Array.isArray(node.from) ||
      !Array.isArray(node.to) ||
      [...node.from, ...node.to].length !== 6 ||
      ![...node.from, ...node.to].every(Number.isFinite)
    )
      throw new Fault(
        "VOXEL_GEOMETRY",
        "Voxel shapes require finite Cube bounds",
      );
    return `${m.cube}(${[...node.from, ...node.to].join(", ")})`;
  });
  if (!terms.length) return m.empty;
  // An expression never contains a terminator, including nested stream reductions.
  if (terms.length > 2 && operation === "OR")
    return `Stream.of(\n${terms.join(",\n")}\n).reduce((v1, v2) -> ${m.join}(v1, v2, ${m.boolean}.OR)).orElse(${m.empty})`;
  return terms.reduceRight(
    (right, left) => `${m.join}(${left}, ${right}, ${m.boolean}.${operation})`,
  );
}

export function installModUtilsExport(b: BB) {
  let restore: (() => void) | undefined;
  function sync(plugin: any, unloaded = false) {
    if (plugin?.id !== "mod_utils" || plugin.version !== "1.7.1") return;
    restore?.();
    restore = undefined;
    if (unloaded) return;
    const action = b.BarItems.export_voxelshape;
    if (!action) return;
    const original = action.click;
    const dialogs = new Map<any, any>();
    const render = (mapping: string) => {
      const all = b.Blockbench.hasFlag("mod_utils.omitVoxelShapesGroup");
      const group = b.Group.all.find(
        (g: any) => g.name.toUpperCase() === "VOXELSHAPES",
      );
      if (!all && !group) {
        b.Blockbench.showMessageBox({
          title: "VoxelShape Export",
          message:
            'Create a group named "VoxelShapes" or disable the group requirement in Advanced Settings.',
        });
        return;
      }
      const output =
        voxelShapeExpression(
          all
            ? b.Outliner.elements.filter((n: any) => n instanceof b.Cube)
            : group.children,
          mapping,
        ) + ";";
      new b.Dialog("output_view", {
        title: "VoxelShape Output",
        width: 650,
        resizable: true,
        singleButton: true,
        component: {
          data: () => ({ text: output }),
          methods: {
            copyText(this: any) {
              return navigator.clipboard.writeText(this.text);
            },
            exportFile(this: any) {
              b.Blockbench.export({
                extensions: ["java", "txt"],
                name: "VoxelShape",
                content: this.text,
              });
            },
          },
          template:
            '<div><textarea v-model="text" aria-label="VoxelShape code" style="width:100%;height:25em"></textarea><button @click="copyText">Copy</button><button @click="exportFile">Export</button></div>',
        },
      }).show();
    };
    const fixed = function (this: any, event: any) {
      const remembered = Object.keys(mappings).find((key) =>
        b.Blockbench.hasFlag(`mod_utils.selected_mappings.${key}`),
      );
      if (
        !event?.shiftKey &&
        b.Blockbench.hasFlag("mod_utils.has_mappings") &&
        remembered
      )
        return render(remembered);
      const result = original.call(this, event);
      const dialog = b.Dialog.open;
      if (dialog?.id === "export_voxelshape" && !dialogs.has(dialog)) {
        dialogs.set(dialog, dialog.onConfirm);
        dialog.onConfirm = function (values: any) {
          if (values.rememberSettings) {
            b.Blockbench.addFlag("mod_utils.has_mappings");
            for (const key of Object.keys(mappings))
              b.Blockbench.removeFlag(`mod_utils.selected_mappings.${key}`);
            b.Blockbench.addFlag(
              `mod_utils.selected_mappings.${values.mappings}`,
            );
          }
          this.hide();
          return render(values.mappings);
        };
      }
      return result;
    };
    action.click = fixed;
    restore = () => {
      if (action.click === fixed) action.click = original;
      for (const [dialog, confirm] of dialogs) dialog.onConfirm = confirm;
      dialogs.clear();
    };
  }
  return { sync, dispose: () => restore?.() };
}
