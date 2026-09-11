import { withOutlinerFlagUndo } from './outliner-flag-undo.ts';
import { Fault, type Result } from "../shared/types.ts";
import type { BB } from "./adapter.ts";
import { withOutlinerUndo } from "./native-undo.ts";
import { pointerGesture } from "./native-pointer.ts";
import { keyboardInit, keyboardChord } from "./native-keyboard.ts";
import { uiFileType, acceptsUiFile } from "../shared/ui-files.ts";

function fingerprint(element: HTMLElement): string {
  const input = element as HTMLInputElement;
  return JSON.stringify({
    tag: element.tagName,
    attributes: Array.from(element.attributes, (a) => [a.name, a.value]),
    text: Array.from(element.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join(""),
    menuLabel:
      element.tagName === "LI"
        ? element.querySelector(":scope > span")?.textContent
        : undefined,
    options:
      element.tagName === "SELECT"
        ? Array.from((element as HTMLSelectElement).options, (o) => [
            o.value,
            o.text,
            o.disabled,
          ])
        : undefined,
    value: input.value,
    checked: input.checked,
    disabled: input.disabled,
    readOnly: input.readOnly,
    editableText:
      element.hasAttribute("contenteditable") && element.isContentEditable
        ? element.textContent
        : undefined,
  });
}
export class NativeUI {
  snapshots = new Map<
    string,
    {
      root: HTMLElement;
      panel: string;
      surface:
        | "panel"
        | "menu"
        | "dialog"
        | "preview"
        | "amend"
        | "tabs"
        | "start_screen"
        | "menubar"
        | "header"
        | "center";
      preview?: string;
      nodes: Map<string, HTMLElement>;
      fingerprints: Map<string, string>;
    }
  >();
  private dialogMenus = new WeakMap<HTMLElement,{menu:any;dialog:HTMLElement}>();
  constructor(
    private b: BB,
    private guard: (dialogRoot?: HTMLElement) => void,
  ) {}
  dispose() {
    this.snapshots.clear();
  }
  async capture(args: any): Promise<Result> {
    if (!this.b.Screencam?.fullScreen)
      throw new Fault(
        "CAPTURE_UNAVAILABLE",
        "Native application capture is unavailable",
      );
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    // Background windows can skip the normal preview loop. Capture the current
    // settings through native render hooks (including plugin postprocessing).
    for (const preview of this.b.Preview?.all || []) {
      const canvas = preview.canvas as HTMLCanvasElement | undefined;
      if (
        canvas?.isConnected &&
        canvas.getBoundingClientRect().width > 0 &&
        canvas.getBoundingClientRect().height > 0
      )
        preview.render();
    }
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Fault("CAPTURE_TIMEOUT", "Application capture timed out")),
        8000,
      );
      try {
        this.b.Screencam.fullScreen({}, (url: string) => {
          clearTimeout(timer);
          resolve(url);
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
    if (url.length > 48000000)
      throw new Fault("CAPTURE_SIZE", "Native capture exceeds 48 MB");
    const bitmap = new Image();
    bitmap.src = url;
    await bitmap.decode();
    const factor = Math.min(
      1,
      args.max_size / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * factor));
    canvas.height = Math.max(1, Math.round(bitmap.height * factor));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png").split(",")[1];
    if (data.length > 16000000)
      throw new Fault("CAPTURE_SIZE", "Resized capture exceeds 16 MB");
    return {
      data: {
        viewport,
        width: canvas.width,
        height: canvas.height,
        scope: "Blockbench application window",
      },
      images: [{ label: "Blockbench UI", data, mimeType: "image/png" }],
    };
  }
  root(
    surface: string,
    panel?: string,
    preview?: string,
  ): HTMLElement | undefined {
    if (surface === "amend") return this.b.Undo?.amend_edit_menu?.node;
    if (surface === "tabs")
      return document.getElementById("tab_bar") ?? undefined;
    if (surface === "menubar")
      return document.getElementById("menu_bar") ?? undefined;
    if (surface === "header")
      return document.querySelector<HTMLElement>("body > header") ?? undefined;
    if (surface === "start_screen")
      return document.getElementById("start_screen") ?? undefined;
    if (surface === "center")
      return document.getElementById("center") ?? undefined;
    // Image format moves the registered UV component out of its panel shell
    // into the central preview area.
    if (surface === "panel" && panel === "uv" && this.b.Format?.image_editor)
      return this.b.UVEditor.vue.$el;
    if (surface === "preview")
      return (
        preview
          ? this.b.Preview.all.find((p: any) => p.id === preview)
          : this.b.Preview.selected
      )?.node;
    return surface === "menu"
      ? this.b.Menu.open?.node || this.b.PieMenu?.active?.node?.[0]
      : surface === "dialog"
        ? this.b.Dialog.open?.object
        : this.b.Panels[panel!]?.node;
  }
  read(args: any): Result {
    if (args.surface === "panel" && !args.panel_id)
      throw new Fault("INPUT", "panel_id is required for panel surfaces");
    const root = this.root(args.surface, args.panel_id, args.preview_id);
    if (!root) throw new Fault("PANEL_NOT_FOUND", "Panel is not registered");
    const all = [
      root,
      ...Array.from(root.querySelectorAll<HTMLElement>("*")),
    ].filter((e) => !["SCRIPT", "STYLE"].includes(e.tagName));
    if (all.length > 20000)
      throw new Fault("UI_SIZE", "Panel requires a dedicated adapter");
    const nodes = new Map<string, HTMLElement>();
    const fingerprints = new Map<string, string>();
    const images: NonNullable<Result["images"]> = [],
      canvas_errors: any[] = [];
    const page = all.slice(args.offset, args.offset + args.limit);
    const ids = new Map(page.map((e) => [e, crypto.randomUUID()]));
    const indices = new Map(all.map((e, index) => [e, index]));
    const entries = page.map((e) => {
      const id = ids.get(e)!;
      nodes.set(id, e);
      fingerprints.set(id, fingerprint(e));
      const input = e as HTMLInputElement;
      const secret = ["password", "file", "hidden"].includes(input.type);
      const rect = e.getBoundingClientRect();
      if (
        args.include_canvas &&
        e instanceof HTMLCanvasElement &&
        images.length < 4
      ) {
        if (e.width * e.height > 16777216)
          canvas_errors.push({ id, error: "Canvas exceeds 16 megapixels" });
        else
          try {
            const preview = this.b.Preview?.all.find(
              (p: any) => p.canvas === e,
            );
            if (preview)
              preview.renderer.render(this.b.Canvas.scene, preview.camera);
            const data = e.toDataURL("image/png").split(",")[1];
            if (
              data &&
              data.length <= 8000000 &&
              images.reduce((n, image) => n + image.data.length, 0) +
                data.length <=
                24000000
            )
              images.push({ label: id, data, mimeType: "image/png" });
            else
              canvas_errors.push({
                id,
                error: "Canvas is empty, exceeds 8 MB, or total exceeds 24 MB",
              });
          } catch (error) {
            canvas_errors.push({ id, error: String(error) });
          }
      }
      return {
        id,
        index: indices.get(e),
        parent_id: e.parentElement ? (ids.get(e.parentElement) ?? null) : null,
        parent_index: e.parentElement
          ? (indices.get(e.parentElement) ?? null)
          : null,
        tag: e.tagName.toLowerCase(),
        dom_id: e.id || undefined,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        canvas:
          e instanceof HTMLCanvasElement
            ? { width: e.width, height: e.height }
            : undefined,
        role:
          e.getAttribute("role") ??
          (args.surface === "menu" && e.tagName === "LI" ? "menuitem" : null),
        label:
          e.getAttribute("aria-label") ||
          e.getAttribute("title") ||
          (args.surface === "menu" && e.tagName === "LI"
            ? e.querySelector(":scope > span")?.textContent
            : undefined) ||
          Array.from(e.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join(" ")
            .trim()
            .slice(0, 300),
        visible:
          !!e.getClientRects().length &&
          getComputedStyle(e).visibility !== "hidden",
        disabled: !!input.disabled,
        native_control_id: e.getAttribute("n-action") || undefined,
        type: input.type,
        file_input:
          input.type === "file"
            ? {
                accept: input.accept,
                multiple: input.multiple,
                directory: input.webkitdirectory,
                selected_count: input.files?.length ?? 0,
              }
            : undefined,
        content_editable:
          e.hasAttribute("contenteditable") && e.isContentEditable,
        value: secret
          ? "[redacted]"
          : input.type === "checkbox"
            ? input.checked
            : ["INPUT", "SELECT", "TEXTAREA"].includes(e.tagName)
              ? input.value
              : e.hasAttribute("contenteditable") && e.isContentEditable
                ? e.textContent?.slice(0, 10000)
                : undefined,
        value_truncated:
          e.hasAttribute("contenteditable") && e.isContentEditable
            ? (e.textContent?.length ?? 0) > 10000
            : undefined,
        options:
          e.tagName === "SELECT"
            ? Array.from((e as HTMLSelectElement).options).map((o) => ({
                value: o.value,
                label: o.text,
                disabled: o.disabled,
              }))
            : undefined,
      };
    });
    const snapshot_id = crypto.randomUUID();
    this.snapshots.set(snapshot_id, {
      surface: args.surface,
      preview: args.preview_id,
      root,
      panel: args.panel_id,
      nodes,
      fingerprints,
    });
    while (this.snapshots.size > 8)
      this.snapshots.delete(this.snapshots.keys().next().value!);
    return {
      images: images.length ? images : undefined,
      data: {
        canvas_errors,
        snapshot_id,
        panel_id: args.panel_id,
        surface: args.surface,
        preview_id:
          args.surface === "preview"
            ? (args.preview_id ?? this.b.Preview.selected?.id)
            : undefined,
        total: all.length,
        nodes: entries,
        next_offset:
          args.offset + args.limit < all.length
            ? args.offset + args.limit
            : null,
        semantics:
          "DOM inspection; component behavior and async completion are provider-owned",
      },
    };
  }
  files(args: any): Result {
    this.guard();
    const snapshot = this.snapshots.get(args.snapshot_id),
      element = snapshot?.nodes.get(args.element_id);
    if (
      !snapshot ||
      !element ||
      this.root(snapshot.surface, snapshot.panel, snapshot.preview) !==
        snapshot.root ||
      !snapshot.root.contains(element) ||
      snapshot.fingerprints.get(args.element_id) !== fingerprint(element)
    )
      throw new Fault("STALE_UI", "Panel changed; inspect it again");
    if (
      !snapshot.root.isConnected ||
      !snapshot.root.getClientRects().length ||
      getComputedStyle(snapshot.root).visibility === "hidden"
    )
      throw new Fault("UI_HIDDEN", "Reveal the panel before supplying files");
    if (
      !(element instanceof HTMLInputElement) ||
      element.type !== "file" ||
      element.disabled ||
      element.readOnly ||
      element.webkitdirectory
    )
      throw new Fault(
        "UI_FILE_INPUT",
        "Select an enabled file input; directory inputs require a dedicated adapter",
      );
    if (!element.multiple && args.inputs.length !== 1)
      throw new Fault("UI_FILE_COUNT", "This input accepts one file");
    const files = args.inputs.map((input: any) => {
      const type = uiFileType(input.filename);
      if (!acceptsUiFile(input.filename, type, element.accept))
        throw new Fault(
          "UI_FILE_TYPE",
          "Input does not accept " + input.filename,
        );
      const bytes = Uint8Array.from(atob(input.content), (c) =>
        c.charCodeAt(0),
      );
      return new File([bytes], input.filename, { type });
    });
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    this.snapshots.delete(args.snapshot_id);
    withOutlinerUndo(this.b, () => {
      element.files = transfer.files;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return {
      data: {
        completion: "change_dispatched",
        files: files.map((f: File) => ({
          name: f.name,
          type: f.type,
          size: f.size,
        })),
        note: "Synthetic File objects contain the staged bytes. Native OS file handles and provider asynchronous completion are not supplied.",
      },
    };
  }
  async interact(args: any): Promise<Result> {
    if (args.action === "file")
      throw new Fault(
        "SERVER_REQUIRED",
        "File input must pass through the server file boundary",
      );
    const snapshot = this.snapshots.get(args.snapshot_id),
      element = snapshot?.nodes.get(args.element_id);
    if (
      !snapshot ||
      !element ||
      this.root(snapshot.surface, snapshot.panel, snapshot.preview) !==
        snapshot.root ||
      !snapshot.root.contains(element) ||
      snapshot.fingerprints.get(args.element_id) !== fingerprint(element)
    )
      throw new Fault("STALE_UI", "Panel changed; inspect it again");
    const menuOwner=snapshot.surface==='menu'?this.dialogMenus.get(snapshot.root):undefined;
    const dialogRoot=snapshot.surface==='dialog'?snapshot.root:menuOwner?.menu===this.b.Menu.open?menuOwner?.dialog:undefined;
    this.guard(dialogRoot);
    const previousMenu=this.b.Menu.open;
    if (
      !element.getClientRects().length ||
      getComputedStyle(element).visibility === "hidden"
    )
      throw new Fault(
        "UI_HIDDEN",
        "Reveal the panel/control before interacting",
      );
    const input = element as HTMLInputElement;
    if (
      input.disabled ||
      input.readOnly ||
      ["password", "file", "hidden"].includes(input.type)
    )
      throw new Fault(
        "UI_UNSUPPORTED",
        "Control is disabled, secret or requires native file handling",
      );
    if (args.action === "set") {
      if (
        !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) &&
        !(element.hasAttribute("contenteditable") && element.isContentEditable)
      )
        throw new Fault(
          "UI_TYPE",
          "Set requires an input, textarea, select or contenteditable root",
        );
      if (input.type === "checkbox") {
        if (typeof args.value !== "boolean")
          throw new Fault("UI_TYPE", "Checkbox requires boolean");
      } else {
        if (typeof args.value !== "string" && typeof args.value !== "number")
          throw new Fault("UI_TYPE", "Expected text or number");
        if (
          ["button", "submit", "reset", "image", "radio"].includes(input.type)
        )
          throw new Fault("UI_TYPE", "Use click for this control");
        if (
          element.tagName === "SELECT" &&
          !Array.from((element as HTMLSelectElement).options).some(
            (o) => o.value === String(args.value) && !o.disabled,
          )
        )
          throw new Fault("UI_OPTION", "Option is missing or disabled");
        if (
          ["number", "range"].includes(input.type) &&
          (!Number.isFinite(Number(args.value)) ||
            (input.min !== "" && Number(args.value) < Number(input.min)) ||
            (input.max !== "" && Number(args.value) > Number(input.max)))
        )
          throw new Fault("UI_RANGE", "Value is outside the range");
      }
    } else if (args.action === "key" && !args.key)
      throw new Fault("INPUT", "key is required");
    if (args.action === "pointer" && !args.pointer)
      throw new Fault("INPUT", "pointer is required");
    if (args.action === "wheel" && !args.wheel)
      throw new Fault("INPUT", "wheel is required");
    if (args.wheel && args.action !== "wheel")
      throw new Fault("INPUT", "wheel is supported only for wheel actions");
    let wheelPoint: { clientX: number; clientY: number } | undefined;
    if (args.action === "wheel") {
      const r = element.getBoundingClientRect(),
        point = args.wheel.point;
      wheelPoint = {
        clientX: r.left + Math.min(point[0] * r.width, r.width - 0.01),
        clientY: r.top + Math.min(point[1] * r.height, r.height - 0.01),
      };
      const hit = document.elementFromPoint(
        wheelPoint.clientX,
        wheelPoint.clientY,
      );
      if (!hit || !(hit === element || element.contains(hit)))
        throw new Fault(
          "UI_OCCLUDED",
          "Wheel target is covered or outside the viewport",
        );
    }
    if (args.hold_ms && args.action !== "key")
      throw new Fault("INPUT", "hold_ms is supported only for keys");
    this.snapshots.delete(args.snapshot_id);
    if (args.action === "key" && args.hold_ms) {
      element.focus();
      const chord = keyboardChord(args.key, args.modifiers);
      let held = 0;
      try {
        for (const down of chord.down) {
          held++;
          withOutlinerUndo(this.b, () =>
            element.dispatchEvent(new KeyboardEvent("keydown", down)),
          );
        }
        await new Promise((resolve) => setTimeout(resolve, args.hold_ms));
      } finally {
        for (let i = held - 1; i >= 0; i--)
          withOutlinerUndo(this.b, () =>
            (element.isConnected ? element : document).dispatchEvent(
              new KeyboardEvent("keyup", chord.up[i]),
            ),
          );
      }
      return {
        data: {
          panel_id: snapshot.panel,
          surface: snapshot.surface,
          completion: "key_released",
          hold_ms: args.hold_ms,
        },
      };
    }
    const preserveCloneBrushOpenState =
      args.action === "pointer" &&
      this.b.Toolbox.selected?.id === "clone_brush" &&
      this.b.Plugins.registered.clone_brush?.version === "1.1.1";
    const cloneBrushOpenState = preserveCloneBrushOpenState
      ? [...(this.b.Group?.all ?? [])].map((group: any) => [group, group.isOpen] as const)
      : undefined;
    withOutlinerUndo(
      this.b,
      () => {
        element.focus();
        if (args.action === "click") {
          if (args.modifiers)
            element.dispatchEvent(
              new MouseEvent("click", {
                button: 0,
                bubbles: true,
                cancelable: true,
                shiftKey: !!args.modifiers.shift,
                ctrlKey: !!args.modifiers.ctrl,
                altKey: !!args.modifiers.alt,
                metaKey: !!args.modifiers.meta,
              }),
            );
          else element.click();
        } else if (args.action === "pointer") {
          try {
            withOutlinerFlagUndo(this.b, element, args.pointer, () => pointerGesture(element, args.pointer));
          } finally {
            // Clone Brush selects a source cube through the native canvas
            // handler. Blockbench 5.1.6 may expand its parent as a selection
            // side effect; the plugin operation itself must preserve the
            // Outliner hierarchy while choosing or placing a clone.
            for (const [group, isOpen] of cloneBrushOpenState ?? [])
              group.isOpen = isOpen;
            if (cloneBrushOpenState?.length && this.b.Undo?.history?.length) {
              const openByUuid = new Map(
                cloneBrushOpenState.map(([group, isOpen]) => [group.uuid, isOpen]),
              );
              const openByName = new Map(
                cloneBrushOpenState.map(([group, isOpen]) => [group.name, isOpen]),
              );
              const last = this.b.Undo.history[this.b.Undo.history.length - 1];
              for (const side of [last?.before, last?.post]) {
                for (const list of [side?.groups, side?.outliner]) {
                  if (!Array.isArray(list)) continue;
                  for (let i = 0; i < list.length; i++) {
                    const item = list[i];
                    const value =
                      openByUuid.get(item?.uuid) ??
                      openByName.get(item?.name) ??
                      cloneBrushOpenState[i]?.[1];
                    if (value !== undefined) item.isOpen = value;
                  }
                }
              }
            }
          }
        }
        else if (args.action === "wheel") {
          const w = args.wheel;
          element.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              deltaMode: 0,
              deltaX: w.delta_x,
              deltaY: w.delta_y,
              ...wheelPoint,
              shiftKey: !!args.modifiers?.shift,
              ctrlKey: !!args.modifiers?.ctrl,
              altKey: !!args.modifiers?.alt,
              metaKey: !!args.modifiers?.meta,
            }),
          );
        } else if (args.action === "hover") {
          element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          element.dispatchEvent(new MouseEvent("mouseenter"));
        } else if (args.action === "key") {
          const init = keyboardInit(args.key, args.modifiers);
          const proceed = element.dispatchEvent(new KeyboardEvent("keydown", init));
          // Native numeric sliders commit on Enter's legacy keypress event.
          if (proceed && args.key === "Enter" && !init.ctrlKey && !init.metaKey)
            element.dispatchEvent(new KeyboardEvent("keypress", init));
          element.dispatchEvent(new KeyboardEvent("keyup", init));
        } else if (
          element.hasAttribute("contenteditable") &&
          element.isContentEditable
        ) {
          const selection = window.getSelection(),
            range = document.createRange();
          range.selectNodeContents(element);
          selection?.removeAllRanges();
          selection?.addRange(range);
          if (!document.execCommand("insertText", false, String(args.value))) {
            element.textContent = String(args.value);
            element.dispatchEvent(
              new InputEvent("input", {
                bubbles: true,
                inputType: "insertText",
                data: String(args.value),
              }),
            );
          }
          element.dispatchEvent(
            new KeyboardEvent("keyup", {
              bubbles: true,
              key: "Unidentified",
              code: "Unidentified",
              keyCode: 0,
              which: 0,
            }),
          );
        } else if (input.type === "checkbox") {
          if (input.checked !== args.value) element.click();
        } else {
          const prototype =
            element.tagName === "SELECT"
              ? HTMLSelectElement.prototype
              : element.tagName === "TEXTAREA"
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
          const range = input.type === "range";
          try {
            if (range)
              element.dispatchEvent(
                new MouseEvent("mousedown", {
                  bubbles: true,
                  button: 0,
                  buttons: 1,
                }),
              );
            Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
              element,
              String(args.value),
            );
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
          } finally {
            if (range)
              (element.isConnected ? element : document).dispatchEvent(
                new MouseEvent("mouseup", {
                  bubbles: true,
                  button: 0,
                  buttons: 0,
                }),
              );
          }
        }
      },
      preserveCloneBrushOpenState,
    );
    if(dialogRoot && this.b.Menu.open && this.b.Menu.open!==previousMenu && this.b.Menu.open.node)
      this.dialogMenus.set(this.b.Menu.open.node,{menu:this.b.Menu.open,dialog:dialogRoot});
    return {
      data: {
        panel_id: snapshot.panel,
        surface: snapshot.surface,
        completion: "DOM_event_dispatched",
        instruction:
          "Inspect panel/editor state to verify the event was handled. OS shortcuts and trusted-only APIs require dedicated adapters.",
      },
    };
  }
}
