import { Adapter, type BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

/** Stable names preserve both source namespace and tint; collisions never overwrite. */
export function tintedTexturePath(
  prefix: string,
  source: string,
  color: string,
) {
  if (![prefix, source, color].every((v) => typeof v === "string"))
    throw new Fault("STM_TEXTURE_PATH", "Invalid saved texture metadata");
  const valid = (id: string) => {
    if (
      !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id) ||
      id.split(/[:/]/).some((p) => !p || p === "." || p === "..")
    )
      throw new Fault(
        "STM_TEXTURE_PATH",
        "Use namespace:path with no parent-directory segments",
      );
    return id.split(":");
  };
  const [namespace, folder] = valid(prefix),
    [sourceNamespace, sourcePath] = valid(
      source.includes(":") ? source : "minecraft:" + source,
    );
  if (!/^#[0-9a-f]{6}$/i.test(color))
    throw new Fault("STM_TEXTURE_COLOR", "Invalid saved tint color");
  const resource = `block/${folder}/${sourceNamespace}/${sourcePath}_${color.slice(1).toLowerCase()}`;
  return {
    file: `assets/${namespace}/textures/${resource}.png`,
    resource: `${namespace}:${resource}`,
  };
}

export function structureTextureExport(b: BB, active: () => boolean) {
  let dialog: any;
  const action = new b.Action("stm_export_tinted", {
    name: "STM: Export Tinted Textures",
    icon: "archive",
    category: "file",
    condition: () =>
      !!b.Project && b.Texture.all.some((t: any) => t.pbmc_stm?.color),
    click() {
      const owner = b.Project,
        adapter = new Adapter(b),
        fingerprint = adapter.fingerprint();
      const guard = () => {
        if (
          !active() ||
          owner !== b.Project ||
          adapter.fingerprint() !== fingerprint
        )
          throw new Fault(
            "STM_CHANGED",
            "Project or plugin changed before texture export",
          );
      };
      dialog?.delete();
      dialog = new b.Dialog("stm_save_tinted", {
        title: "Export Tinted Textures",
        form: {
          texture_id: {
            label: "Target Texture Path",
            type: "text",
            value:
              localStorage.getItem("stm_tint_path") || "minecraft:structure",
            description:
              "Namespace and path prefix inside the ZIP, e.g. example:ship/test",
          },
        },
        async onConfirm(values: any) {
          guard();
          const exportFile = b.Blockbench.export,
            zip = new b.JSZip(),
            files = new Map<string, Uint8Array>(),
            mapping: Record<string, string> = {};
          let total = 0;
          for (const t of b.Texture.all) {
            const metadata = t.pbmc_stm;
            if (!metadata?.color) continue;
            const target = tintedTexturePath(
              values.texture_id,
              metadata.source,
              metadata.color,
            );
            const bytes = Uint8Array.from(atob(t.getBase64()), (c) =>
                c.charCodeAt(0),
              ),
              existing = files.get(target.file);
            total += bytes.length;
            if (total > 32 * 1024 * 1024)
              throw new Fault(
                "STM_LIMIT",
                "Tinted texture export exceeds 32 MiB",
              );
            if (
              existing &&
              (existing.length !== bytes.length ||
                existing.some((v, i) => v !== bytes[i]))
            )
              throw new Fault(
                "STM_TEXTURE_COLLISION",
                `Two modified textures map to ${target.file}`,
              );
            if (!existing) {
              files.set(target.file, bytes);
              zip.file(target.file, bytes);
            }
            mapping[t.uuid] = target.resource;
          }
          if (!files.size)
            throw new Fault(
              "STM_TEXTURE_EMPTY",
              "No imported tinted textures remain",
            );
          zip.file("texture-map.json", JSON.stringify(mapping, null, 2));
          const bytes = await zip.generateAsync({
            type: "uint8array",
            compression: "DEFLATE",
          });
          guard();
          localStorage.setItem("stm_tint_path", values.texture_id);
          exportFile({
            type: "Tinted Textures ZIP",
            extensions: ["zip"],
            name: "structure-tinted-textures",
            content: bytes.buffer,
            savetype: "binary",
          });
        },
      }).show();
    },
  });
  b.MenuBar.addAction(action, "tools");
  return () => {
    action.delete();
    dialog?.hide();
    dialog?.delete();
  };
}
