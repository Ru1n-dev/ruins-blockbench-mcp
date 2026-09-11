# Ruin's BlockBenchMCP

Ruin's BlockBenchMCP connects an MCP client to Blockbench Desktop 5.1.6. It provides typed model operations, a high-level task interface, native Blockbench controls, and inspection tools for modeling, UV, texture, animation, and export workflows.

The project is intended for local use. The MCP server communicates with the Blockbench plugin over an authenticated loopback WebSocket connection; it does not expose a public network service.

## Features

- Model creation and editing for groups, cubes, meshes, bones, and armatures
- UV editing, seams, islands, projection, density, transforms, and selection
- Textures, layers, raster painting, brush settings, presets, and color picking
- Animation keys, events, controllers, IK configuration, and IK baking
- Mesh topology operations, vertex weights, cleanup, merge, split, and knife tools
- Native actions, menus, modes, settings, key bindings, panels, previews, dialogs, and loaders
- Snapshots, plans, one-step Undo boundaries, checkpoints, diagnostics, captures, and exports
- High level workflows through `bb_task`, with lower level typed commands available when a workflow needs precise control
- Extension API for Blockbench plugins to register typed MCP operations

The plugin also contains compatibility adapters for supported Blockbench ecosystem extensions. Adapters are activated when their provider is installed and report their availability through `bb_capabilities`.

## Requirements

- Blockbench Desktop 5.1.6
- Node.js 22 or newer
- An MCP client that can start a local stdio server

Blockbench version compatibility is checked at runtime. This repository targets the desktop build; web and mobile builds are outside the supported target.

## Installation

Clone or download the repository, then install dependencies and create a local connection configuration:

```powershell
git clone https://github.com/Ru1n-dev/ruins-blockbench-mcp.git
cd ruins-blockbench-mcp
npm ci
npm run setup
```

`npm run setup` creates an ignored `.runtime` directory, generates a random local token, builds the server and plugin, and writes client configuration examples.

1. In Blockbench, open **File > Plugins > Load Plugin from File** and choose `dist/ruins_blockbench_mcp.js`.
2. Add `.runtime/mcp-config.json` to the MCP client. `.runtime/codex-config.toml` is provided for clients that use TOML configuration.
3. Reconnect the MCP client and call `bb_status`. The Blockbench panel **Ruin's MCP** shows the connection state and recent requests.

The generated configuration uses absolute paths. Run `npm run setup` again after moving the checkout. Do not commit `.runtime`, `artifacts`, or `dist`; they are generated locally and ignored by Git.

The server is intended for a local MCP client and a local Blockbench instance. The generated token authenticates the loopback bridge; keep `.runtime` and generated plugin files private to the checkout that created them.

## Recommended workflow

For an edit, first call `bb_status` and `bb_projects`, then obtain a fresh `bb_snapshot`. Use `bb_plan_edit` or the planning phase of `bb_task` to inspect changes before applying them. Apply the returned plan once, then verify with `bb_diagnose`, `bb_capture`, `bb_animation_frames`, or `bb_export` as appropriate. Do not treat a successful file write or a single attractive camera angle as proof that the asset is ready for the game.

The plan boundary checks the active project, format, revision, selection and protection rules. Edits are grouped into a native Undo entry where Blockbench provides that boundary. Requests that involve a native dialog or file picker use `bb_editor_state`, `bb_dialog`, `bb_file_requests`, and `bb_file_reply` so the MCP client can provide the required values or files explicitly.

## Tool groups

The server advertises its complete JSON Schemas to the MCP client. The main entry points are:

| Group | Representative tools |
| --- | --- |
| Project and state | `bb_status`, `bb_projects`, `bb_create_project`, `bb_select_project`, `bb_snapshot`, `bb_query` |
| Planning and safety | `bb_plan_edit`, `bb_apply_plan`, `bb_protection`, `bb_history`, `bb_job` |
| High level tasks | `bb_task` for model building, UV, painting, animation, rigging, inspection, repair, geometry, I/O, editor context, automation, validation, and native registration workflows |
| Geometry and rigging | `bb_mesh_operation`, `bb_ik`, `bb_bake_ik`, `bb_vertex_weights`, `bb_uv_seams` |
| UV and surface | `bb_uv_select_island`, `bb_brush_settings`, `bb_brush_presets`, `bb_brush_stroke`, `bb_color_pick`, texture and layer commands |
| Native Blockbench | `bb_capabilities`, `bb_native_operation`, `bb_action`, `bb_control`, `bb_dialog`, `bb_setting`, `bb_keybind`, `bb_node_properties` |
| User interface | `bb_editor_state`, `bb_ui_snapshot`, `bb_ui_interact`, `bb_ui_capture`, `bb_preview` |
| Files and interchange | `bb_import_model`, `bb_import_animation`, `bb_import_texture_set`, `bb_file_requests`, `bb_file_reply`, `bb_export`, `bb_restore_checkpoint`, `bb_convert_copy` |
| Verification | `bb_diagnose`, `bb_capture`, `bb_animation_frames`, `bb_conversion_preview`, and verification assertions in `bb_task` |

Use `bb_capabilities` to discover the actions, codecs, formats, node types, panels, previews, settings, loaders, plugins, and registered extensions available in the current Blockbench session. Native registration discovery does not imply that a provider-specific operation is safe to invoke; unsupported boundaries return a structured error or require an extension adapter.

## Minecraft authoring Skill

The repository includes [`skill/blockbench-minecraft-authoring`](skill/blockbench-minecraft-authoring/SKILL.md), a Codex Skill for creating Minecraft-oriented models, UVs, pixel textures, animations, and exports through this MCP. It treats geometry, UVs, texture, animation, and target format as one asset contract and uses the typed plan → apply → verify workflow.

### Conditional texture references

The Skill uses texture references when they help the task—for example, vanilla-like styling, compatibility with a named block/item/entity or resource pack, an exact game version, an uncertain AI-generated draft, or an unclear silhouette/material. It does not force vanilla references onto an explicitly custom art direction. When references are used, it pins the edition/version/source, compares multiple same-role assets, and records the selected paths and provenance.

A reference can be used in three modes: direct assignment, adapted source, or observation-only. Direct assignment is an exceptional exact-compatibility case; normally the reference guides a whole-model texture pass. The Skill records the mode and provenance, and direct use still requires global base, value/light, face-detail, and 3D integration passes. References can provide material identity, light/value hierarchy, baked shading, and surface cues; filenames never determine resource-pack wiring.

For high-quality authoring, explicit UV unwrap/mapping is mandatory before painting. Finished assets start with a high-density initial texture pass rather than a base-only draft; each sufficiently large visible face receives purposeful macro, meso, and micro detail where the target resolution supports it. Per-face UV regions are the default so material, brightness, shadows, wear, and damage can be authored independently; shared or mirrored UVs require named faces and a recorded reason. Separate islands are kept visually unified through a shared palette/value chart, consistent texel density and orientation, controlled edge padding, cross-face motif checks, and whole-model 3D review. References may be used as the source for material identity, light/value hierarchy, baked shading, and surface cues, while the Skill checks whether each cue belongs in texture pixels or runtime lighting.

The helper indexes metadata rather than bundling Mojang/Microsoft image bytes. It supports the pinned Mojang Bedrock Samples tree and a local exact-version Java asset tree, including block, item, entity, attachable, animation, Texture Set, and catalog resources. Fetch only the files needed for a review:

```powershell
node skill/blockbench-minecraft-authoring/scripts/minecraft_texture_corpus.mjs index --ref main --out .cache/bedrock-textures.json
node skill/blockbench-minecraft-authoring/scripts/minecraft_texture_corpus.mjs query --index .cache/bedrock-textures.json --category entity --match zombie --limit 20
node skill/blockbench-minecraft-authoring/scripts/minecraft_texture_corpus.mjs fetch --index .cache/bedrock-textures.json --match zombie --out .cache/reference-images/zombie --limit 12
```

For Java, index the extracted assets belonging to the exact client version with `index --root <assets-or-checkout>`. Keep downloaded references in an ignored temporary directory and retain `_reference-manifest.json`; do not redistribute the vanilla image corpus.

### Multi-view review

The Skill requires a named review of the applicable front, back, left, right, top, bottom, and three-quarter/isometric views. It adds asset-specific checks for display slots, 3×3 block tiling, transparent faces, entity poses, animated extremes, contact points, and other placement variants. Use the detailed gate in [`reference-and-multiview.md`](skill/blockbench-minecraft-authoring/references/reference-and-multiview.md), then repeat affected views after a fix.

## Extension API

An optional Blockbench plugin can register a typed operation with the global API exposed by this plugin. See [`examples/ruins_mcp_example.js`](examples/ruins_mcp_example.js) and [`docs/extension-api.md`](docs/extension-api.md).

The current API is available as `globalThis.RuinBlockBenchMCP`. `globalThis.PerfectBlockbenchMCP` remains as a compatibility alias for extensions written against earlier development builds. Registration IDs should use a provider namespace such as `my_plugin:operation`.

## Development

```powershell
npm ci
npm run check
npm run build
npm test
```

`npm run build` writes `dist/server.mjs` and `dist/ruins_blockbench_mcp.js`. `npm test` runs the TypeScript check and a clean production build. Live Blockbench interaction requires a desktop 5.1.6 instance with the generated plugin loaded.

See [`docs/architecture.md`](docs/architecture.md) for the public runtime model and [`docs/tool-reference.md`](docs/tool-reference.md) for command conventions.

## Troubleshooting

- If the panel does not connect, confirm that Blockbench loaded the generated `dist/ruins_blockbench_mcp.js`, the MCP client is using `.runtime/mcp-config.json`, and both sides came from the same checkout and `npm run setup` run.
- If a request is rejected because the project changed, obtain a new `bb_snapshot` and create a new plan. Do not blindly resend a mutating request after a timeout.
- If an export opens but does not work in-game, check the target edition/version, codec, resource-pack paths, UVs, filtering, alpha/culling, and runtime logs separately. MCP export success is not in-game compatibility proof.

## Scope and limitations

This repository targets the APIs exposed by Blockbench Desktop 5.1.6. Native actions and third-party extensions can impose their own format, selection, dialog, timing, or external-file requirements. The server reports those conditions and does not silently emulate missing provider behavior. Export success confirms that a file was produced; it does not validate a target game's runtime behavior.

## License

This repository is proprietary and distributed under an **All Rights Reserved** notice. Private viewing and evaluation of an unmodified copy are permitted; copying, modifying, redistributing, public hosting, commercial use, or integration into another product requires prior written permission from `Ru1n-dev`. See [`LICENSE`](LICENSE). Third-party dependencies remain subject to their own licenses.

