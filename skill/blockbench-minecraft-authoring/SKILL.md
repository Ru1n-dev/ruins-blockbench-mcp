---
name: blockbench-minecraft-authoring
description: Create, edit, and review Minecraft-oriented Blockbench models, UVs, pixel textures, animations, and exports through Ruin's BlockBenchMCP; use for end-to-end asset authoring, not generic 3D or image generation.
---

# Blockbench Minecraft Authoring

Use this skill when the deliverable is a Minecraft-oriented Blockbench asset: a block, item, weapon, prop, entity, creature, character, animated model, texture, resource-pack asset, or compatible exported model. Treat the live Blockbench project as the source of truth. A standalone PNG, OBJ, or hand-edited JSON is only an intermediate or export; it is not a substitute for the project and its wiring.

Read [references/ruins-mcp-workflow.md](references/ruins-mcp-workflow.md) for the live MCP route. Read [references/reference-and-multiview.md](references/reference-and-multiview.md) when modeling or authoring textures: decide whether reference sampling is needed, then run the applicable multi-view review. Read [references/blockbench-wiki-guardrails.md](references/blockbench-wiki-guardrails.md) when choosing a format, placing pivots, handling animation, editing `.bbmodel`, writing a plugin/extension, or exporting. Read [references/minecraft-style.md](references/minecraft-style.md) when designing or reviewing Minecraft-like geometry and textures. Read [references/bb-academy-notes.md](references/bb-academy-notes.md) when using the reviewed public video material; preserve its evidence limits. Read [references/corpus-reference.md](references/corpus-reference.md) when the task needs vanilla reference coverage, a whole category, or an edition/version refresh.

## Authority and scope

Resolve disagreements in this order:

1. The live Blockbench/MCP schemas and `bb_capabilities` for the connected session.
2. The repository's `AGENTS.md` and authoritative Blockbench version/source. In this Ruin's MCP repository, Blockbench Desktop 5.1.6 and source commit `794e964e966b6783b4e9b98ecbdda5152c0620cc` take precedence over Wiki examples.
3. Current official Blockbench API/reference and Wiki material.
4. BB Academy tutorials, treated as practical suggestions rather than format specifications.
5. Inference, which must be labelled as such and verified before a mutating operation.

Do not force “vanilla” styling when the user asks for a custom, stylized, modded, or non-Minecraft result. Do not treat a tutorial's dimensions, hotkeys, preferred workflow, or old UI names as universal rules.

This is an asset-authoring Skill, not permission to modify the MCP implementation. If the user asks to change the server/plugin, follow the repository's own workflow, preserve generated compatibility artifacts, and run its prescribed tests separately.

## Shared asset contract

Before planning, make these fields explicit or make the smallest safe assumption:

- target Edition/provider and game version;
- Blockbench format and model coordinate convention;
- part hierarchy, names, pivots/origins, symmetry, and silhouette;
- mandatory UV unwrap/mapping policy, island/seam policy, texture dimensions, texel density, and mirroring; UV sharing is an explicit exception, never the default;
- palette, light direction, alpha/cutout behavior, and filtering intent;
- whole-model texture pass order, cross-face continuity rules, atlas padding, and the consistency checks used to keep separate UV islands visually unified;
- animation bones/channels, loops, controllers, effects, and required display views;
- reference decision, pinned comparison assets, and the named multi-view checklist;
- native project checkpoint and final export codec/path.

Geometry, UVs, pixels, animation, and output format are one contract. If one changes, re-check the dependent parts rather than patching only the visible symptom.

## End-to-end workflow

1. Discover the live target with `bb_status`, `bb_projects`, and `bb_capabilities`. Confirm the project, provider, formats, codecs, node types, and optional operations. Never silently convert Java, Bedrock, GeckoLib, Generic, or another provider.
2. Decide whether texture references are needed. Use the conditional gate in `references/reference-and-multiview.md`: for vanilla-like, compatibility, existing-asset, uncertain-version, or AI-cleanup work, pin the edition/version and query/fetch multiple role-matched references before committing to silhouette, UV, or palette. Declare each reference's use mode—direct assignment, adapted source, or observation-only—and record what it changes in geometry, UVs, pixels, material, and runtime wiring. Treat direct assignment as an exceptional exact-compatibility case; the normal path is a target-wide texture pass guided by the reference. Never infer resource-pack wiring from a filename. For an explicitly custom asset with no compatibility target, record why reference sampling is skipped.
3. Obtain a fresh `bb_snapshot`. Select the route based on the task: use `bb_task` for intent-level building, UV layout, painting, animation, rigging, inspection, repair, geometry, I/O, or verification; use `bb_plan_edit` for exact typed operations or a surgical change. Use `bb_native_operation` only for a capability-discovered operation that has no typed route.
4. Plan from silhouette and hierarchy outward. Set named groups and pivots, then cubes/meshes, then explicitly unwrap/map every texture-bearing face, then reserve the atlas, then textures, then animation and display transforms. UV mapping is mandatory: use intentional per-face or per-island regions as the default, even when two faces initially use similar colours. UV sharing or mirroring is allowed only as a recorded exception when the faces are intentionally identical in material, lighting, wear, overlays, orientation, and future edit needs. Establish common texel density, island orientation, edge padding, palette roles, and face-to-face value rules before adding local detail. Use Global/Parent/Local space deliberately. Avoid z-fighting, accidental overlaps, excessive tiny cubes, and pivots placed at geometric centres when the part is a joint. When references are in scope, compare the planned silhouette, face treatment, and material/shading against the selected same-role set before applying the model edit, then use the declared reference mode and validate its UV/format fit.
5. Author texture data on an intentional raster grid after the UV layout is explicit. Do not normally finish one face in isolation. Build the texture in whole-model passes: establish a shared base/material pass across all islands, establish the global value/light hierarchy, add face-specific material/shadow/dirt details, then run an integration pass in the textured 3D view. Prefer an embedded PNG or bounded typed pixel edits/layers through the MCP. If an AI generator supplied a draft, reduce colours, remove background/alpha halos, resize with nearest-neighbour, align marks to texels, and map it to the actual UV regions before treating it as final. Use references for material identity, value hierarchy, face-to-face brightness, baked shadow/AO cues, edge highlights, wear, grain, alpha, and other surface decisions; decide which cues belong in pixels and which belong to runtime lighting so they are not double-shaded. Direct reference assignment is allowed only after exact compatibility checks; otherwise use the reference to guide an adapted or newly authored target texture. Preserve the observation record, selected source paths, and resulting geometry/UV/pixel/runtime decisions in the review record.
6. Inspect the plan, apply it once, and preserve Undo/checkpoint boundaries. After a timeout, stale revision, external edit, or unexpected selection, inspect job/request state and the scene before retrying. Never blindly resend a mutating request.
7. Verify both structure and appearance. Use `bb_diagnose`, `bb_texture_image`, `bb_capture`, and `bb_animation_frames` as relevant. Prefer `bb_task(mode=verify)` for a bundled check with assertions such as `require_no_untextured_faces` and `require_uv_in_bounds`. Inspect the required front, back, left, right, top, bottom, and three-quarter/isometric views, then add the asset-specific display, tiling, animation, or placement views from `references/reference-and-multiview.md`. Repeat affected views after any fix.
8. Export only after verification. Keep the native project as a checkpoint. Confirm the target codec in `bb_capabilities`, use `bb_export`, and report what was actually verified versus what remains untested in the game or mod runtime.

## Wiki-informed decision rules

- Start with the final format, not with Generic. Java Block/Item, Bedrock Model, Modded Entity, OptiFine CEM, GeckoLib, and Generic have different size, rotation, bone, UV, and animation boundaries.
- Use geometry for the readable silhouette and texture for material/detail. Translate smooth spheres and cylinders into deliberate Minecraft-like volumes; do not approximate smoothness with a forest of nearly coplanar rotated cubes.
- Treat UV unwrap/mapping as a required authoring stage, not a cleanup step after painting. Per-face islands make face-specific material, light, shadow, wear, and damage readable; shared UV is acceptable only when identical appearance is an intentional, documented design decision.
- Use a reference texture as the design source for material and shading decisions. Extract base-material colour families, value hierarchy, pixel clusters, contact/underside shadow, edge highlight, wear, transparency, and tiling; then decide whether each cue is painted into the target texture or supplied by the runtime. Avoid duplicating baked reference shadows with an additional lighting effect.
- Keep separate UV islands unified with a shared material system: one declared palette, one texel-density target, stable island orientation, aligned cross-face motifs, controlled edge padding/bleed, and a whole-model integration pass. Per-face freedom changes local detail, not the asset's global material language.
- Keep texel density consistent and avoid accidental mixels. A higher resolution may be justified for a complex entity, but it must still have a coherent grid and screen-scale readability.
- For Bedrock-style animation, keep bone names and geometry identifiers stable. Distinguish controller state transitions from `scripts.animate`; distinguish Blockbench time from runtime Molang time; bake expressions for formats that cannot carry them.
- For `.bbmodel`, preserve unknown fields and version-specific structure. Blockbench 5.0 separates group data from the `outliner`; per-texture UV dimensions and keyframe sign changes must not be guessed or corrected twice.
- For plugins and extensions, verify the current API/types and lifecycle. Pair model/texture changes with the right Undo aspects; handle desktop/Web capability boundaries; unload listeners and actions cleanly.
- For interchange, distinguish a screenshot from a render and a readable file from a working game asset. glTF/GLB, FBX, DAE, and OBJ preserve different amounts of hierarchy, animation, and topology; nearest filtering, alpha mode, and face culling must be checked in the target runtime.

## Completion gate

Do not call the asset finished until the applicable checks pass:

- format/provider and output codec are explicit;
- hierarchy, pivots, dimensions, and silhouette are readable;
- every visible face has intentional texture/material wiring;
- UV islands are in bounds, seams are intentional, and texel density is coherent;
- every texture-bearing face has an explicit UV mapping/island or a recorded format-specific reason why it is not visible;
- UV sharing/mirroring is absent by default and, when used, lists the exact faces and the reason they are intentionally identical;
- the texture has passed a whole-model base/material pass, face-detail pass, and 3D integration pass; no face is approved only from an isolated UV or flat image view;
- texel density, palette roles, edge values, grain/direction, and motifs remain coherent across UV islands, with any discontinuity marked as intentional;
- pixels are grid-aligned with no accidental blur, antialiasing, halo, or AI noise;
- palette, material cues, and shading follow one declared light direction without accidental double-shading;
- animated parts retain their UVs and do not expose unintended faces;
- the conditional reference decision is recorded and all applicable reference comparisons are provenance-traceable;
- reference use has an explicit mode—direct assignment, adapted source, or observation-only—and direct use has passed UV/format/wiring compatibility checks;
- the multi-view checklist passes, including display/tiling/animation views applicable to the asset;
- diagnosis, captures, and export have been run or their omission is stated;
- no claim of in-game compatibility is made without testing that runtime.

