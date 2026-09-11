import type { BB } from "./adapter.ts";
import { installTransparencyLifecycle } from "./plugin-lifecycle.ts";
import { installLegacyEditing } from "./legacy-editing.ts";
import { installUVLockerLifecycle } from "./uv-locker-lifecycle.ts";
import { installBrushRandomizerLifecycle } from "./brush-randomizer-lifecycle.ts";
import { installModUtilsExport } from "./mod-utils-export.ts";
import { installMissingTextureFlash } from "./missing-texture-flash.ts";
import { installGroundPlane } from "./ground-plane.ts";
import { installMarkerColorsLifecycle } from "./marker-colors-lifecycle.ts";
import { installAnimationFormatLifecycle } from "./animation-format-lifecycle.ts";
import { installEndimations } from "./endimations.ts";
import { installThreeMf } from "./three-mf.ts";
import { installDatagen } from "./datagen.ts";
import { installSeatPosition } from "./seat-position.ts";
import { installGltfImport } from "./gltf-import.ts";
import { installSimplify } from "./simplify.ts";
import { installCodeView } from "./code-view.ts";
import { installGeckolibLifecycle } from "./geckolib-lifecycle.ts";
import { installEasings } from "./easings.ts";
import { installUtilityFlaggers } from "./utility-flaggers.ts";
import { installBedrockTransforms } from "./bedrock-transforms.ts";
import { installBlockCollisions } from "./block-collisions.ts";
import { installMeshTools } from "./mesh-tools.ts";
import { installBakedAO } from "./baked-ao.ts";
import { installFarsight } from "./farsight.ts";
import { installGroupExport } from "./group-export.ts";
import { installSkinMirror } from "./skin-mirror.ts";
import { installHighlightExport } from "./highlight-export.ts";
import { installThreeCore } from "./threecore.ts";
import { installCardinal } from "./cardinal.ts";
import { installActivityTracker } from "./activity-tracker.ts";
import { installScreencastKeys } from "./screencast-keys.ts";
import { installObjSequence } from "./obj-sequence.ts";
import { installStartupTips } from "./startup-tips.ts";
import { installLegacyGecko } from "./legacy-gecko.ts";
import { installRootMotion } from "./root-motion.ts";
import { installWasd } from "./wasd.ts";
import { installFabricOptions } from "./fabric-options.ts";
import { installShaper } from "./shaper.ts";
import { installNoise } from "./noise.ts";
import { installMultiLayer } from "./multi-layer.ts";
import { installDialogLifecycle } from "./dialog-lifecycle.ts";
import { installItemAnimation } from "./item-animation.ts";
import { installWorkspaces } from "./workspaces.ts";
import { installResourcepack } from "./resourcepack.ts";
import { installAmbientOcclusion } from "./ambient-occlusion.ts";
import { installHytaleHitbox } from "./hytale-hitbox.ts";
import { installPlayerStatue } from "./player-statue.ts";
import { installFigura } from "./figura.ts";
import { installJavaSequence } from "./java-sequence.ts";
import { installSplashArt } from "./splash-art.ts";
import { installPieMenu } from "./pie-menu.ts";
import { installSkinPackager } from "./skin-packager.ts";
import { installPluginStats } from "./plugin-stats.ts";
import { installRainbowRoad } from "./rainbow-road.ts";
import { installCreativeMode } from "./creative-mode.ts";
import { installArmorStand } from "./armor-stand.ts";
import { installFlyMode } from "./fly-mode.ts";
import { installPlaneGizmo } from "./plane-gizmo.ts";
import { installTintPreview } from "./tint-preview.ts";
import { installTextGenerator } from "./text-generator.ts";
import { installVintageStory } from "./vintage-story.ts";
import { installTweaks } from "./tweaks.ts";
import { installPbrPreview } from "./pbr-preview.ts";
import { installBrushPlus } from "./brush-plus.ts";
import { installPreviewScene } from "./preview-scene.ts";
import { installMinecraftTitle } from "./minecraft-title.ts";
import { installMenuIcon } from "./menu-icon.ts";
import { installAnimatedPlatforms } from "./animated-platforms.ts";
import { installReferenceModels } from "./reference-models.ts";
import { installWornDisplay } from "./worn-display.ts";
import { installBBS } from "./bbs.ts";
import { installCosmic } from "./cosmic.ts";
import { installBrushTuna } from "./brush-tuna.ts";
import { installGeenium } from "./geenium.ts";
import { installBamo } from "./bamo.ts";
import { installStructureModel } from "./structure-model.ts";
import { installLegacyStructure } from "./legacy-structure.ts";
import { installTextureMapLifecycle } from "./texture-map-lifecycle.ts";
import { installDuplicateRenamerLifecycle } from "./duplicate-renamer-lifecycle.ts";

// BBPlugin.unload leaves its instance in Plugins.registered. Remember observed
// unloads across MCP runOnLoad cycles so startup does not patch deleted Actions.
const unloadedPluginsKey = Symbol.for("perfect_blockbench_mcp.unloaded_plugins.v1");

export function installCompatibility(b: BB): () => void {
  if (b.Blockbench.version !== "5.1.6") return () => {};
  if (!Object.hasOwn(b.BBPlugin, unloadedPluginsKey))
    Object.defineProperty(b.BBPlugin, unloadedPluginsKey, {
      value: new WeakSet<object>(), configurable: true,
    });
  const unloadedPlugins: WeakSet<object> = b.BBPlugin[unloadedPluginsKey];
  const disposeLifecycle = installTransparencyLifecycle(b);
  const disposeUVLocker = installUVLockerLifecycle(b);
  const disposeBrushRandomizer = installBrushRandomizerLifecycle(b);
  const disposeMarkerColors = installMarkerColorsLifecycle(b);
  const disposeAnimationFormat = installAnimationFormatLifecycle(b);
  const editing = installLegacyEditing(b);
  const modUtils = installModUtilsExport(b);
  const missingTextureFlash = installMissingTextureFlash(b);
  const groundPlane = installGroundPlane(b);
  const endimations = installEndimations(b);
  const threeMf = installThreeMf(b);
  const datagen = installDatagen(b);
  const seatPosition = installSeatPosition(b);
  const gltfImport = installGltfImport(b);
  const simplify = installSimplify(b);
  const codeView = installCodeView(b);
  const easings = installEasings(b);
  const utilityFlaggers = installUtilityFlaggers(b);
  const bedrockTransforms = installBedrockTransforms(b);
  const blockCollisions = installBlockCollisions(b);
  const meshTools = installMeshTools(b);
  const bakedAO = installBakedAO(b);
  const skinMirror = installSkinMirror(b);
  const highlight = installHighlightExport(b);
  const threeCore = installThreeCore(b);
  const objSequence = installObjSequence(b);
  const disposeFarsight = installFarsight(b);
  const disposeGroupExport = installGroupExport(b);
  const disposeCardinal = installCardinal(b);
  const disposeActivityTracker = installActivityTracker(b);
  const disposeScreencastKeys = installScreencastKeys(b);
  const disposeStartupTips = installStartupTips(b);
  const disposeLegacyGecko = installLegacyGecko(b);
  const disposeRootMotion = installRootMotion(b);
  const disposeWasd = installWasd(b);
  const disposeFabricOptions = installFabricOptions(b);
  const disposeShaper = installShaper(b);
  const disposeNoise = installNoise(b);
  const disposeMultiLayer = installMultiLayer(b);
  const disposeDialogLifecycle = installDialogLifecycle(b);
  const disposeItemAnimation = installItemAnimation(b);
  const disposeWorkspaces = installWorkspaces(b);
  const disposeResourcepack = installResourcepack(b);
  const disposeAmbientOcclusion = installAmbientOcclusion(b);
  const disposeHytaleHitbox = installHytaleHitbox(b);
  const disposePlayerStatue = installPlayerStatue(b);
  const disposeFigura = installFigura(b);
  const disposeJavaSequence = installJavaSequence(b);
  const disposeSplashArt = installSplashArt(b);
  const disposePieMenu = installPieMenu(b);
  const disposeSkinPackager = installSkinPackager(b);
  const disposePluginStats = installPluginStats(b);
  const disposeRainbowRoad = installRainbowRoad(b);
  const disposeCreativeMode = installCreativeMode(b);
  const disposeArmorStand = installArmorStand(b);
  const disposeFlyMode = installFlyMode(b);
  const disposePlaneGizmo = installPlaneGizmo(b);
  const disposeTintPreview = installTintPreview(b);
  const disposeTextGenerator = installTextGenerator(b);
  const disposeVintageStory = installVintageStory(b);
  const disposeTweaks = installTweaks(b);
  const disposePbrPreview = installPbrPreview(b);
  const disposeBrushPlus = installBrushPlus(b);
  const disposePreviewScene = installPreviewScene(b);
  const disposeMinecraftTitle = installMinecraftTitle(b);
  const disposeMenuIcon = installMenuIcon(b);
  const disposeAnimatedPlatforms = installAnimatedPlatforms(b);
  const disposeReferenceModels = installReferenceModels(b);
  const disposeWornDisplay = installWornDisplay(b);
  const disposeBBS = installBBS(b);
  const disposeCosmic = installCosmic(b);
  const disposeBrushTuna = installBrushTuna(b);
  const disposeGeenium = installGeenium(b);
  const disposeBamo = installBamo(b);
  const disposeStructureModel = installStructureModel(b);
  const disposeLegacyStructure = installLegacyStructure(b);
  const disposeTextureMaps = installTextureMapLifecycle(b);
  const disposeDuplicateRenamer = installDuplicateRenamerLifecycle(b);
  const disposeGeckolib = installGeckolibLifecycle(b);
  let restoreBoneViewSetting: (() => void) | undefined;
  const syncBoneViewSetting = (plugin: any, unloaded = false) => {
    if (plugin?.id !== "bone_view" || plugin.version !== "1.0.0") return;
    restoreBoneViewSetting?.();
    restoreBoneViewSetting = undefined;
    if (unloaded) return;
    const setting = b.settings.bone_view_hotkey;
    if (setting?.type === "string") {
      setting.type = "text";
      restoreBoneViewSetting = () => {
        if (setting.type === "text") setting.type = "string";
      };
    }
  };
  let restoreImageCenter: (() => void) | undefined;
  const syncImageCenter = (plugin: any, unloaded = false) => {
    if (plugin?.id !== "image_centering" || plugin.version !== "1.1.1") return;
    restoreImageCenter?.();
    restoreImageCenter = undefined;
    if (unloaded) return;
    const action = b.BarItems.image_center_button;
    if (!action) return;
    const original = action.click;
    const fixed = () => {
      const project = b.Project;
      b.UVEditor.setZoom(1);
      b.Vue.nextTick(() => {
        if (b.Project === project && b.BarItems.image_center_button === action)
          b.UVEditor.vue.centerView();
      });
      b.Blockbench.showQuickMessage("Centered viewport!", 1500);
    };
    action.click = fixed;
    restoreImageCenter = () => {
      if (action.click === fixed) action.click = original;
    };
  };
  let restoreCSModel: (() => void) | undefined;
  const syncCSModel = (plugin: any, unloaded = false) => {
    if (plugin?.id !== "csmodel" || plugin.version !== "0.1.3") return;
    restoreCSModel?.();
    restoreCSModel = undefined;
    const codec = b.Codecs.csmodel;
    if (!codec || codec.plugin !== "csmodel") return;
    if (unloaded) {
      codec.delete();
      return;
    }
    if (codec.load !== b.Codec.prototype.load) return;
    const original = codec.load;
    // This legacy parser creates its own Bedrock project. Codec.load would
    // first call setupProject(undefined), breaking Blockbench 5's format state.
    const load = function (this: any, model: any, file: any) {
      return this.parse(model, file?.path);
    };
    codec.load = load;
    restoreCSModel = () => {
      if (codec.load === load) codec.load = original;
    };
  };
  let restoreInverter: (() => void) | undefined;
  const syncInverter = (plugin: any, unloaded = false) => {
    if (plugin?.id !== "cube_inverter" || plugin.version !== "1.0.0") return;
    restoreInverter?.();
    restoreInverter = undefined;
    if (unloaded) return;
    const action = b.BarItems.cube_inverter_action;
    if (!action) return;
    const original = action.click;
    const fixed = () => {
      const elements = [...b.Cube.selected];
      if (!elements.length) return;
      b.Undo.initEdit({ elements });
      try {
        for (const cube of elements) {
          [cube.from, cube.to] = [cube.to, cube.from];
          for (const [a, c] of [
            ["north", "south"],
            ["east", "west"],
            ["up", "down"],
          ]) {
            // The pinned implementation overwrites one face before reading it
            // back for the opposite face. Native Undo copies keep both values
            // and all registered face properties, without aliasing UV arrays.
            const left = cube.faces[a].getUndoCopy();
            const right = cube.faces[c].getUndoCopy();
            cube.faces[a].extend(right);
            cube.faces[c].extend(left);
            cube.faces[a].rotation = (right.rotation + 180) % 360;
            cube.faces[c].rotation = (left.rotation + 180) % 360;
          }
        }
        b.Canvas.updateView({
          elements,
          element_aspects: { transform: true, geometry: true, uv: true },
        });
        b.Undo.finishEdit("Inverted cube values");
      } catch (error) {
        b.Undo.cancelEdit(true);
        throw error;
      }
    };
    action.click = fixed;
    restoreInverter = () => {
      if (action.click === fixed) action.click = original;
    };
  };
  let grayscaleCSS: { delete(): void } | undefined;
  const syncDownscaler = (plugin: any) => {
    if (plugin?.id !== "texture_downscaler" || plugin.version !== "1.0.0")
      return;
    // Properties registered after textures were created do not initialize
    // those instances. Undefined pre-edit values cannot be merged by Undo.
    for (const texture of b.ModelProject.all.flatMap((p: any) => p.textures))
      for (const id of [
        "downscale_target_width",
        "downscale_target_height",
        "downscale_filter",
      ])
        if (texture[id] === undefined) b.Texture.properties[id]?.reset(texture);
  };
  const syncGrayscale = (plugin: any, unloaded = false) => {
    if (plugin?.id === "grayscale_preview" && plugin.version === "1.0.0") {
      grayscaleCSS?.delete();
      grayscaleCSS = unloaded
        ? undefined
        : b.Blockbench.addCSS(
            "#work_screen.grayscale_view #texture_canvas_wrapper canvas { filter: grayscale(1); }",
          );
      b.Interface.work_screen.classList.toggle(
        "grayscale_view",
        !unloaded && !!b.BarItems.grayscale_preview?.value,
      );
    }
  };
  const loaded = ({ plugin }: any) => {
    if (plugin) unloadedPlugins.delete(plugin);
    codeView.sync(plugin);
    easings.sync(plugin);
    utilityFlaggers.sync(plugin);
    bedrockTransforms.sync(plugin);
    blockCollisions.sync(plugin);
    meshTools.sync(plugin);
    bakedAO.sync(plugin);
    skinMirror.sync(plugin);
    highlight.sync(plugin);
    threeCore.sync(plugin);
    objSequence.sync(plugin);
    simplify.sync(plugin);
    gltfImport.sync(plugin);
    seatPosition.sync(plugin);
    datagen.sync(plugin);
    threeMf.sync(plugin);
    endimations.sync(plugin);
    groundPlane.sync(plugin);
    syncBoneViewSetting(plugin);
    missingTextureFlash.sync(plugin);
    modUtils.sync(plugin);
    syncImageCenter(plugin);
    editing.sync(plugin);
    syncCSModel(plugin);
    syncGrayscale(plugin);
    syncInverter(plugin);
    syncDownscaler(plugin);
  };
  const cleanupResidualRegistrations = (plugin: any) => {
    if (!plugin?.id) return;
    // A few pinned providers omit deletion of their own registrations on
    // unload. Clean only the fixed, source-identified leftovers; broad
    // registry sweeping can delete shared native actions used by other
    // providers.
    const targets: Array<[any, string[]]> = [
      [b.settings, plugin.id === "asset_browser" || plugin.id === "resource_pack_utilities"
        ? ["ewan_minecraft_directory"]
        : plugin.id === "cem_template_loader"
          ? ["dialog_jem_restrictions", "ignore_unkown_optifine_animations", "jem_restrictions"]
          : []],
      [b.BarItems, plugin.id === "blockmodels-exporter" ? ["export-blockmodels"] : []],
    ];
    for (const [registry, ids] of targets)
      for (const id of ids) {
        const item = registry?.[id];
        if (item?.plugin === plugin.id || (plugin.id === "blockmodels-exporter" && id === "export-blockmodels" && item)) {
          if (plugin.id === "asset_browser" || plugin.id === "resource_pack_utilities") {
            // Asset Browser builds its panel asynchronously after the dialog
            // is cancelled. Keep this setting alive until that provider-owned
            // callback has settled, then remove the actual registration.
            setTimeout(() => {
              if (registry?.[id] === item) item.delete?.();
            }, 5000);
          } else item.delete?.();
        }
      }
  };
  const unloaded = ({ plugin }: any) => {
    if (plugin) unloadedPlugins.add(plugin);
    codeView.sync(plugin, true);
    easings.sync(plugin, true);
    utilityFlaggers.sync(plugin, true);
    bedrockTransforms.sync(plugin, true);
    blockCollisions.sync(plugin, true);
    meshTools.sync(plugin, true);
    bakedAO.sync(plugin, true);
    skinMirror.sync(plugin, true);
    highlight.sync(plugin, true);
    threeCore.sync(plugin, true);
    objSequence.sync(plugin, true);
    simplify.sync(plugin, true);
    gltfImport.sync(plugin, true);
    seatPosition.sync(plugin, true);
    datagen.sync(plugin, true);
    threeMf.sync(plugin, true);
    endimations.sync(plugin, true);
    groundPlane.sync(plugin, true);
    syncBoneViewSetting(plugin, true);
    missingTextureFlash.sync(plugin, true);
    modUtils.sync(plugin, true);
    syncImageCenter(plugin, true);
    editing.sync(plugin, true);
    syncCSModel(plugin, true);
    syncGrayscale(plugin, true);
    syncInverter(plugin, true);
    cleanupResidualRegistrations(plugin);
  };
  b.Blockbench.on("loaded_plugin", loaded);
  b.Blockbench.on("unloaded_plugin", unloaded);
  const registered = new Proxy(b.Plugins.registered, {
    get(target, key) {
      const plugin = Reflect.get(target, key);
      return plugin && !plugin.disabled && !unloadedPlugins.has(plugin)
        ? plugin
        : undefined;
    },
  });
  syncGrayscale(registered.grayscale_preview);
  syncInverter(registered.cube_inverter);
  syncCSModel(registered.csmodel);
  syncDownscaler(registered.texture_downscaler);
  syncImageCenter(registered.image_centering);
  editing.sync(registered.duplicate_renamer);
  editing.sync(registered.bakery);
  editing.sync(registered.voxel_shape_generator);
  modUtils.sync(registered.mod_utils);
  missingTextureFlash.sync(registered.missing_texture_highlighter);
  groundPlane.sync(registered.ground_plane_editor);
  endimations.sync(registered.endimations_exporter);
  threeMf.sync(registered.export_to_3mf);
  datagen.sync(registered.datagen_export);
  seatPosition.sync(registered.seat_position);
  gltfImport.sync(registered.gltf_importer);
  simplify.sync(registered.simplify);
  codeView.sync(registered.code_view);
  easings.sync(registered.easings);
  utilityFlaggers.sync(registered.utility_flaggers);
  bedrockTransforms.sync(registered.bedrock_block_transforms);
  blockCollisions.sync(registered.block_multi_collisions);
  meshTools.sync(registered.mesh_tools);
  bakedAO.sync(registered.baked_ambient_occlusion);
  skinMirror.sync(registered.skin_mirror);
  highlight.sync(registered.highlight_generator);
  threeCore.sync(registered.threecore_exporter);
  objSequence.sync(registered.obj_animation_export);
  syncBoneViewSetting(registered.bone_view);
  return () => {
    disposeGeckolib();
    disposeDuplicateRenamer();
    disposeTextureMaps();
    disposeLegacyStructure();
    disposeStructureModel();
    disposeBamo();
    disposeGeenium();
    disposeBrushTuna();
    disposeCosmic();
    disposeBBS();
    disposeWornDisplay();
    disposeReferenceModels();
    disposeAnimatedPlatforms();
    disposeMenuIcon();
    disposeMinecraftTitle();
    disposePreviewScene();
    disposeBrushPlus();
    disposePbrPreview();
    disposeTweaks();
    disposeVintageStory();
    disposeTextGenerator();
    disposeTintPreview();
    disposePlaneGizmo();
    disposeFlyMode();
    disposeArmorStand();
    disposeCreativeMode();
    disposeRainbowRoad();
    disposePluginStats();
    disposeSkinPackager();
    disposePieMenu();
    disposeSplashArt();
    disposeJavaSequence();
    disposeFigura();
    disposePlayerStatue();
    disposeHytaleHitbox();
    disposeAmbientOcclusion();
    disposeResourcepack();
    disposeWorkspaces();
    disposeItemAnimation();
    disposeDialogLifecycle();
    disposeMultiLayer();
    disposeNoise();
    disposeShaper();
    disposeFabricOptions();
    disposeWasd();
    disposeRootMotion();
    disposeLegacyGecko();
    disposeStartupTips();
    disposeScreencastKeys();
    disposeActivityTracker();
    disposeCardinal();
    disposeGroupExport();
    disposeFarsight();
    meshTools.dispose();
    bakedAO.dispose();
    skinMirror.dispose();
    highlight.dispose();
    threeCore.dispose();
    objSequence.dispose();
    codeView.dispose();
    easings.dispose();
    utilityFlaggers.dispose();
    bedrockTransforms.dispose();
    blockCollisions.dispose();
    simplify.dispose();
    gltfImport.dispose();
    seatPosition.dispose();
    disposeAnimationFormat();
    disposeMarkerColors();
    disposeBrushRandomizer();
    disposeUVLocker();
    disposeLifecycle();
    editing.dispose();
    modUtils.dispose();
    missingTextureFlash.dispose();
    groundPlane.dispose();
    endimations.dispose();
    threeMf.dispose();
    datagen.dispose();
    restoreBoneViewSetting?.();
    restoreImageCenter?.();
    restoreCSModel?.();
    restoreInverter?.();
    grayscaleCSS?.delete();
    b.Blockbench.removeListener("loaded_plugin", loaded);
    b.Blockbench.removeListener("unloaded_plugin", unloaded);
  };
}
