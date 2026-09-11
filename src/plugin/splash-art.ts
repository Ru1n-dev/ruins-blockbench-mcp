import type { BB } from "./adapter.ts";

// Keep the pinned provider's database and options while owning asynchronous
// IndexedDB work, dialog lifetime, and persisted edit defaults.
export function installSplashArt(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const wrapped = function (this: any, ...args: any[]) {
    if (this.id !== "splash_art_customiser" || this.version !== "1.1.4")
      return load.apply(this, args);
    const nativeLoad = this.onload;
    this.onload = function () {
      let active = true,
        revision = 0,
        db: IDBDatabase | undefined;
      const dialogs = new Set<any>(),
        abort = new AbortController();
      const disabled = "splash-art-randomisation-disabled";
      const ready = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("splash-art-customiser", 1);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore("images", {
            keyPath: "image",
          });
          store.createIndex("applied", ["applied"]);
        };
        req.onsuccess = () => {
          db = req.result;
          if (!active) db.close();
          resolve(db);
        };
        req.onerror = () => reject(req.error);
      });
      const all = async (): Promise<any[]> => {
        const database = await ready;
        if (!active) return [];
        return new Promise((resolve, reject) => {
          const req = database
            .transaction("images", "readonly")
            .objectStore("images")
            .getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      };
      const write = async (fn: (s: IDBObjectStore) => void) => {
        const database = await ready;
        if (!active) return;
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction("images", "readwrite");
          tx.oncomplete = () => resolve();
          tx.onerror = tx.onabort = () => reject(tx.error);
          fn(tx.objectStore("images"));
        });
      };
      const art = document.createElement("div");
      art.id = "custom-spash-art";
      art.className = "custom-splash";
      let css: any;
      const render = async (image?: string) => {
        const rev = ++revision,
          records = await all();
        if (!active || rev !== revision) return;
        const record =
          records.find((x) => x.image === image) ||
          (localStorage.getItem(disabled)
            ? records.find((x) => x.applied === "true") || records[0]
            : records[Math.floor(Math.random() * records.length)]);
        css?.delete();
        css = undefined;
        if (!record) {
          art.remove();
          return;
        }
        const splash = document.querySelector("#splash_screen");
        splash?.append(art);
        Object.assign(art.style, {
          backgroundImage: `url(${JSON.stringify(record.image)})`,
          aspectRatio: record.aspectRatio || "64 / 27",
          imageRendering: record.imageRendering || "auto",
          backgroundSize: record.backgroundSize || "cover",
          backgroundRepeat: record.backgroundRepeat || "no-repeat",
          backgroundPosition: "50% 50%",
          width: "100%",
        });
        css = b.Blockbench.addCSS(
          "#splash_screen > *:not(.custom-splash):not(#customise-splash-art):not(.start_screen_close_button){display:none}",
        );
      };
      const show = (options: any) => {
        if (!active) return;
        for (const d of dialogs) {
          if (b.Dialog.stack.includes(d)) d.hide();
          d.delete();
        }
        dialogs.clear();
        const d = new b.Dialog(options);
        dialogs.add(d);
        d.show();
        return d;
      };
      const error = (e: any) => {
        if (active)
          b.Blockbench.showQuickMessage(String(e?.message || e), 4000);
      };
      const button = (parent: HTMLElement, label: string, fn: () => any) => {
        const el = document.createElement("button");
        el.textContent = label;
        el.onclick = () => {
          Promise.resolve().then(fn).catch(error);
        };
        parent.append(el);
        return el;
      };
      const options = {
        aspectRatio: {
          "4 / 3": "4:3",
          "16 / 9": "16:9",
          "16 / 10": "16:10",
          "21 / 9": "21:9",
          "64 / 27": "64:27",
        },
        imageRendering: { auto: "Auto", pixelated: "Pixelated" },
        backgroundSize: { auto: "Auto", contain: "Contain", cover: "Cover" },
        backgroundRepeat: {
          repeat: "Repeat",
          "repeat-x": "Repeat X",
          "repeat-y": "Repeat Y",
          "no-repeat": "No Repeat",
          space: "Space",
          round: "Round",
        },
      };
      const edit = async (image: string) => {
        const record = (await all()).find((x) => x.image === image) || {};
        if (!active) return;
        const preview = document.createElement("div");
        preview.id = "splash-art-settings-preview";
        Object.assign(preview.style, {
          backgroundImage: `url(${JSON.stringify(image)})`,
          height: "200px",
          backgroundPosition: "50% 50%",
        });
        const defaults: any = {
          aspectRatio: "64 / 27",
          imageRendering: "auto",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
        };
        const apply = (data: any) => {
          for (const key of Object.keys(options))
            (preview.style as any)[key] = data[key];
        };
        const form = Object.fromEntries(
          Object.entries(options).map(([key, values]) => [
            key,
            {
              label: key,
              type: "select",
              options: values,
              value: record[key] || defaults[key],
            },
          ]),
        );
        const d = show({
          id: "splash_art_settings",
          title: "Splash art settings",
          lines: [preview],
          form,
          onFormChange: apply,
          async onConfirm(this: any, data: any) {
            const next: any = { ...record, image };
            for (const [key, values] of Object.entries(options)) {
              if (!Object.hasOwn(values, data[key]))
                throw new Error(`Invalid ${key}`);
              next[key] = data[key];
            }
            await write((store) => store.put(next));
            await render(image);
          },
        });
        if (d) apply(d.getFormResult());
      };
      const importURL = async (url: string) => {
        const parsed = new URL(url);
        if (!["https:", "http:"].includes(parsed.protocol))
          throw new Error("Enter an HTTP or HTTPS image URL");
        const response = await fetch(parsed.href, { signal: abort.signal });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/")
        )
          throw new Error("URL is not an image");
        await response.body?.cancel();
        if (active) await edit(parsed.href);
      };
      const manage = async () => {
        const records = await all();
        if (!active) return;
        const content = document.createElement("div");
        for (const [index, record] of records.entries()) {
          const row = document.createElement("div");
          row.className = "splash-art-preview";
          row.style.backgroundImage = `url(${JSON.stringify(record.image)})`;
          row.style.backgroundSize = "contain";
          row.style.minHeight = "80px";
          button(row, `Apply ${index + 1}`, async () => {
            await write((store) => {
              for (const r of records) {
                const next = { ...r };
                delete next.applied;
                if (r.image === record.image) next.applied = "true";
                store.put(next);
              }
            });
            await render(record.image);
          });
          button(row, `Edit ${index + 1}`, () => edit(record.image));
          button(row, `Delete ${index + 1}`, async () => {
            await write((s) => s.delete(record.image));
            await render();
            await manage();
          });
          content.append(row);
        }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.id = "input-image";
        input.style.display = "none";
        const label = document.createElement("label");
        label.htmlFor = input.id;
        label.textContent = "Import Image";
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          if (file.size > 8388608 || !file.type.startsWith("image/")) {
            error(new Error("Choose an image no larger than 8 MB"));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            if (active) edit(String(reader.result)).catch(error);
          };
          reader.onerror = () => error(reader.error);
          reader.readAsDataURL(file);
        };
        content.append(label, input);
        button(content, "Import URL", () =>
          show({
            id: "splash_art_url",
            title: "Image URL",
            form: { url: { label: "URL", type: "text" } },
            onConfirm: (data: any) => importURL(data.url),
          }),
        );
        button(content, "Blockbench Gallery", async () => {
          const res = await fetch(
            "https://api.github.com/repos/JannisX11/blockbench.net/contents/assets/gallery",
            { signal: abort.signal },
          );
          if (!res.ok)
            throw new Error(`Gallery request failed (${res.status})`);
          const files = await res.json();
          if (!active) return;
          const gallery = document.createElement("div");
          for (const file of files)
            if (
              file.type === "file" &&
              /\.(png|jpe?g|gif|webp)$/i.test(file.name)
            )
              button(gallery, file.name, () => importURL(file.download_url));
          show({
            id: "splash_art_gallery",
            title: "Blockbench Gallery",
            lines: [gallery],
          });
        });
        show({
          id: "splash_art_customiser",
          title: "Splash Art Customiser",
          lines: [content],
          form: {
            randomised: {
              label: "Randomise splash art",
              type: "checkbox",
              value: !localStorage.getItem(disabled),
            },
          },
          onFormChange(data: any) {
            if (data.randomised) localStorage.removeItem(disabled);
            else localStorage.setItem(disabled, "true");
          },
        });
      };
      const action = new b.Action("customise_splash_art", {
        name: "Splash Art Customiser",
        icon: "palette",
        click: manage,
      });
      b.MenuBar.addAction(action, "help");
      const icon = document.createElement("i");
      icon.id = "customise-splash-art";
      icon.className = "material-icons icon";
      icon.textContent = "settings";
      icon.title = "Splash Art Customiser";
      icon.onclick = () => {
        manage().catch(error);
      };
      const mount = () => {
        if (active && !icon.isConnected)
          document.querySelector("#splash_screen")?.append(icon);
      };
      mount();
      const timer = setInterval(mount, 500);
      render().catch(error);
      this.onunload = () => {
        if (!active) return;
        active = false;
        revision++;
        abort.abort();
        clearInterval(timer);
        action.delete();
        icon.remove();
        art.remove();
        css?.delete();
        for (const d of dialogs) {
          if (b.Dialog.stack.includes(d)) d.hide();
          d.delete();
        }
        dialogs.clear();
        db?.close();
      };
    };
    try {
      return load.apply(this, args);
    } finally {
      this.onload = nativeLoad;
    }
  };
  proto.runOnLoad = wrapped;
  return () => {
    if (proto.runOnLoad === wrapped) proto.runOnLoad = load;
  };
}
