import type { BB } from "./adapter.ts";
export function installGeckolibLifecycle(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad,
    unload = proto.unload;
  const owned = new Map<
    any,
    { listeners: any[]; styles: any[]; fixes: Array<() => void> }
  >();
  const legacyFormats = new WeakMap<object, any>();
  const clean = (entry: any) => {
    if (!entry) return;
    for (const [target, event, callback] of entry.listeners)
      target.removeListener(event, callback);
    // GeckoLib's animation UI registers this modifier listener while its
    // format is constructed, after the synchronous runOnLoad hook has
    // returned. It therefore cannot be captured by the temporary `on`
    // wrapper above. Remove only the known GeckoLib timeline callback that
    // was absent before this plugin instance loaded; unrelated listeners are
    // left intact.
    const pressed = b.Blockbench.events?.update_pressed_modifier_keys;
    if (entry.pressedModifierBaseline && Array.isArray(pressed))
      for (const callback of [...pressed])
        if (
          !entry.pressedModifierBaseline.has(callback) &&
          /timeline_time/.test(String(callback)) &&
          /holding_ctrl/.test(String(callback))
        )
          b.Blockbench.removeListener("update_pressed_modifier_keys", callback);
    for (const style of entry.styles) style.delete();
    for (const fix of entry.fixes) fix();
  };
  const patchedLoad = function (this: any, ...args: any[]) {
    if (
      !(this.id === "geckolib" && this.version === "4.2.5") &&
      !(this.id === "animation_utils" && this.version === "4.1.3")
    )
      return load.apply(this, args);
    const legacy = this.id === "animation_utils";
    if (legacy) {
      const current = b.Formats.animated_entity_model;
      if (current) legacyFormats.set(this, current);
      else if (legacyFormats.has(this)) {
        const format = legacyFormats.get(this);
        b.Formats[format.id] = format;
        b.Blockbench.dispatchEvent("construct_format", { format });
      }
    }
    const entry = {
        listeners: [] as any[],
        styles: [] as any[],
        fixes: [] as Array<() => void>,
        pressedModifierBaseline: new Set(
          b.Blockbench.events?.update_pressed_modifier_keys ?? [],
        ),
      },
      restorers: Array<() => void> = [];
    for (const target of [b.Blockbench, b.Codecs.project, b.Codecs.bedrock]) {
      const original = target.on;
      const on = function (
        this: any,
        event: any,
        callback: any,
        ...rest: any[]
      ) {
        if (
          legacy &&
          target === b.Blockbench &&
          event === "update_keyframe_selection"
        ) {
          const native = callback;
          callback = function (this: any, ...args: any[]) {
            const panel = document.getElementById("panel_keyframe");
            if (!panel) return native.apply(this, args);
            const query = panel.querySelector;
            panel.querySelector = function (
              this: HTMLElement,
              selectors: string,
            ) {
              return query.call(
                this,
                selectors === "div.tool.widget.bar_select bb-select"
                  ? 'div[toolbar_item="keyframe_interpolation"] .bb-select'
                  : selectors,
              );
            } as typeof query;
            try {
              return native.apply(this, args);
            } finally {
              panel.querySelector = query;
            }
          };
        }
        const result = original.call(this, event, callback, ...rest);
        entry.listeners.push([this, event, callback]);
        return result;
      };
      target.on = on;
      restorers.push(() => {
        if (target.on === on) target.on = original;
      });
    }
    const addCSS = b.Blockbench.addCSS;
    const css = function (this: any, ...args: any[]) {
      const result = addCSS.apply(this, args);
      entry.styles.push(result);
      return result;
    };
    b.Blockbench.addCSS = css;
    try {
      const result = load.apply(this, args);
      if (legacy) {
        const codec = b.AnimationCodec.codecs.bedrock,
          original = codec.loadFile;
        const legacyLoad = b.Animator.loadFile;
        const patched = function (this: any, ...args: any[]) {
          return b.Format.id === "animated_entity_model"
            ? legacyLoad.apply(b.Animator, args)
            : original.apply(this, args);
        };
        codec.loadFile = patched;
        entry.fixes.push(() => {
          if (codec.loadFile === patched) codec.loadFile = original;
        });
        const compile = codec.compileFile;
        const exportLegacy = function (
          this: any,
          animations: any[],
          ...args: any[]
        ) {
          if (b.Format.id !== "animated_entity_model")
            return compile.call(this, animations, ...args);
          const changed: any[] = [];
          if (!b.settings.geckolib_bake_in_bezier_keyframes.value)
            for (const animation of animations)
              for (const animator of Object.values(
                animation.animators,
              ) as any[])
                for (const key of animator.keyframes)
                  if (key.interpolation === "bezier") {
                    changed.push(key);
                    key.interpolation = "geckolib_bezier";
                  }
          try {
            const result = compile.call(this, animations, ...args);
            if (!b.settings.geckolib_bake_in_bezier_keyframes.value)
              result.geckolib_format_version = 2;
            return result;
          } finally {
            for (const key of changed) key.interpolation = "bezier";
          }
        };
        codec.compileFile = exportLegacy;
        entry.fixes.push(() => {
          if (codec.compileFile === exportLegacy) codec.compileFile = compile;
        });
      }
      if (legacy)
        for (const name of [
          "updateKeyframeEasing",
          "updateKeyframeEasingArg",
        ]) {
          const original = b[name];
          const guarded = function (this: any, value: any, ...args: any[]) {
            if (
              (name === "updateKeyframeEasing" ? value : b.$(value).val()) ===
              "-"
            )
              return;
            const started = b.Undo.current_save;
            try {
              return original.call(this, value, ...args);
            } catch (error) {
              if (!started && b.Undo.current_save) b.Undo.cancelEdit();
              throw error;
            }
          };
          b[name] = guarded;
          entry.fixes.push(() => {
            if (b[name] === guarded) b[name] = original;
          });
        }
      const prior = owned.get(this);
      if (prior) {
        entry.listeners.unshift(...prior.listeners);
        entry.styles.unshift(...prior.styles);
        entry.fixes.unshift(...prior.fixes);
      }
      owned.set(this, entry);
      return result;
    } catch (error) {
      clean(entry);
      throw error;
    } finally {
      for (const restore of restorers.reverse()) restore();
      if (b.Blockbench.addCSS === css) b.Blockbench.addCSS = addCSS;
    }
  };
  const patchedUnload = function (this: any, ...args: any[]) {
    const entry = owned.get(this);
    if (entry) {
      owned.delete(this);
      clean(entry);
    }
    return unload.apply(this, args);
  };
  proto.runOnLoad = patchedLoad;
  proto.unload = patchedUnload;
  return () => {
    if (proto.runOnLoad === patchedLoad) proto.runOnLoad = load;
    if (proto.unload === patchedUnload) proto.unload = unload;
    owned.clear();
  };
}
