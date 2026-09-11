import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function patchPbrPresets(b: BB, dialog: any, active: () => boolean) {
  const key = "materialBrushPresets",
    channels = ["albedo", "metalness", "roughness", "emissive", "height"];
  let selected: string | null = null;
  const settings = (values: any) => {
    const out: any = {};
    for (const channel of channels) {
      const value = values[channel];
      if (value === undefined || value === null) continue;
      if (channel === "albedo" || channel === "emissive") {
        const color = b.tinycolor(value.toString());
        if (!color.isValid())
          throw new Fault("PBR_PRESET", `Invalid ${channel} color`);
        out[channel] = color.toHexString();
      } else {
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 1
        )
          throw new Fault("PBR_PRESET", `${channel} must be from 0 to 1`);
        out[channel] = value;
      }
    }
    return out;
  };
  const read = () => {
    const raw = b.localStorage.getItem(key) || "{}";
    let result: any;
    try {
      if (raw.length > 1000000) throw new Error();
      result = JSON.parse(raw);
    } catch {
      throw new Fault(
        "PBR_PRESET_STORE",
        "Material preset storage is invalid; existing data was preserved",
      );
    }
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      Object.keys(result).length > 128
    )
      throw new Fault(
        "PBR_PRESET_STORE",
        "Expected up to 128 material presets",
      );
    const entries = Object.entries(result).map(([id, record]: any) => {
      if (
        !/^[a-z0-9_-]{1,100}$/i.test(id) ||
        ["__proto__", "constructor", "prototype"].includes(id) ||
        !Array.isArray(record) ||
        !record[0] ||
        typeof record[0] !== "object" ||
        typeof record[1] !== "string" ||
        record[1].length > 120
      )
        throw new Fault("PBR_PRESET_STORE", "Invalid stored material preset");
      return [
        id,
        [
          settings(record[0]),
          record[1],
          typeof record[2] === "string" &&
          /^data:image\/png;base64,[a-z0-9+/]+=*$/i.test(record[2])
            ? record[2]
            : "",
        ],
      ];
    });
    return Object.fromEntries(entries);
  };
  const apply = (values: any) => {
    const data = settings(values);
    b.BarItems.material_brush.select();
    if (data.albedo !== undefined) b.ColorPanel.set(data.albedo);
    if (data.emissive !== undefined)
      b.BarItems.brush_emissive_color.set(data.emissive);
    for (const c of ["metalness", "roughness", "height"])
      if (data[c] !== undefined)
        b.BarItems[`slider_brush_${c}`].setValue(data[c], true);
  };
  dialog.buttons = ["Close", "Save", "Apply", "New"];
  dialog.form_config = {
    name: { type: "text", label: "Preset Name", value: "New Preset" },
    ...dialog.form_config,
  };
  dialog.onConfirm = (values: any) => {
    if (active()) apply(values);
  };
  dialog.onButton = (button: number) => {
    if (!active()) return;
    if (button === 1) {
      const values = dialog.getFormResult(),
        name = String(values.name ?? "").trim();
      if (!name || name.length > 120)
        throw new Fault(
          "PBR_PRESET",
          "Enter a preset name up to 120 characters",
        );
      const stored = read(),
        data = settings(values),
        id = selected ?? b.guid();
      if (!selected && Object.keys(stored).length >= 128)
        throw new Fault("PBR_PRESET_STORE", "Use up to 128 presets");
      if (!Object.keys(data).length)
        throw new Fault("PBR_PRESET", "Enable at least one channel");
      stored[id] = [data, name, ""];
      b.localStorage.setItem(key, JSON.stringify(stored));
      selected = id;
      dialog.content_vue.userPresets = stored;
      return false;
    }
    if (button === 3) {
      selected = null;
      dialog.setFormValues({ name: "New Preset" });
      dialog.setFormToggles(Object.fromEntries(channels.map((c) => [c, true])));
      return false;
    }
  };
  const component = dialog.component;
  component.template = component.template
    .replaceAll(
      'class="preset_title"',
      'class="preset_title" :aria-label="name"',
    )
    .replace(
      'class="delete_preset"',
      'class="delete_preset" :aria-label="\'Delete \' + name"',
    );
  component.mounted = function (this: any) {
    try {
      this.userPresets = read();
    } catch (e) {
      this.userPresets = {};
      b.Blockbench.showQuickMessage((e as Error).message, 4000);
    }
  };
  component.methods = {
    ...component.methods,
    editPreset(id: string) {
      const record = read()[id];
      if (!record) throw new Fault("PBR_PRESET", "Preset no longer exists");
      selected = id;
      dialog.setFormValues({ name: record[1], ...record[0] });
      dialog.setFormToggles(
        Object.fromEntries(
          channels.map((c) => [c, Object.hasOwn(record[0], c)]),
        ),
      );
    },
    applyPreset(id: string) {
      const record = read()[id];
      if (record && active()) {
        apply(record[0]);
        dialog.hide();
      }
    },
    deletePreset(this: any, id: string) {
      const record = read()[id];
      if (!record) return;
      b.Blockbench.showMessageBox(
        {
          title: "Delete Preset",
          message: `Delete ${record[1]}?`,
          buttons: ["Cancel", "Delete"],
          confirmIndex: 1,
          cancelIndex: 0,
        },
        (button: number) => {
          if (button !== 1 || !active()) return;
          const stored = read();
          delete stored[id];
          b.localStorage.setItem(key, JSON.stringify(stored));
          this.userPresets = stored;
          if (selected === id) selected = null;
        },
      );
    },
  };
}
