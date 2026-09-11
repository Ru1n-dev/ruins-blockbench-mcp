---
name: blockbench-minecraft-authoring
description: Create, edit, and review Minecraft-oriented Blockbench models, UVs, pixel textures, animations, and exports through Ruin's BlockBenchMCP; use for end-to-end asset authoring, not generic 3D or image generation.
---

# Blockbench Minecraft Authoring

Use this skill for a Minecraft-oriented Blockbench block, item, weapon, prop, entity, creature, character, animated model, texture, resource-pack asset, or compatible export. The live Blockbench project is the source of truth; a standalone PNG, OBJ, or hand-edited JSON is only an intermediate or export.

## Read only the relevant detail

Keep the entrypoint short. Read the focused reference when its phase is in scope; do not load every reference by default.

- Read [references/ruins-mcp-workflow.md](references/ruins-mcp-workflow.md) for the live Ruin's BlockBenchMCP route.
- Read [references/texture-quality.md](references/texture-quality.md) for any modeling, UV, texture, pixel, material, shading, or AI-texture task.
- Read [references/reference-plan.md](references/reference-plan.md) when reference images may be useful or compatibility with an existing asset matters.
- Read [references/multiview-review.md](references/multiview-review.md) before the final 3D review or export.
- Read [references/minecraft-style.md](references/minecraft-style.md) when Minecraft-like geometry, palette, or asset-specific style decisions need review.
- Read [references/corpus-reference.md](references/corpus-reference.md) only when vanilla reference coverage, a whole category, or an edition/version refresh is required.
- Read [references/blockbench-wiki-guardrails.md](references/blockbench-wiki-guardrails.md) only when format, animation, `.bbmodel`, plugin, or export details require it.
- Read [references/bb-academy-notes.md](references/bb-academy-notes.md) only when the reviewed video material is relevant, and preserve its evidence limits.

## Authority and scope

Resolve disagreements in this order: live Blockbench/MCP schemas and `bb_capabilities`; this repository's `AGENTS.md` and authoritative Blockbench version/source; current official API/reference; reviewed tutorial material; labelled inference verified before mutation. In this Ruin's repository, Blockbench Desktop 5.1.6 and source commit `794e964e966b6783b4e9b98ecbdda5152c0620cc` are authoritative when APIs differ.

Do not force vanilla styling onto a custom, stylized, modded, or non-Minecraft request. This asset-authoring Skill does not authorize changes to the MCP implementation unless the user asks for them.

## Non-negotiable gates

- Establish the target Edition/provider, game version, Blockbench format, coordinate convention, codec, hierarchy, pivots, and silhouette before editing.
- Treat geometry, explicit UVs, raster pixels, animation, display transforms, and output wiring as one contract. Re-check dependent layers after a change.
- Unwrap/map every texture-bearing face before painting. Use separate per-face or per-island UV regions by default; UV sharing or mirroring requires named identical faces and a recorded reason.
- Finished assets start at `high/hero` detail unless `simple`, `prototype`, or `blockout` is explicitly requested. A base-only first pass is a draft.
- Build textures in whole-model passes: shared material base, shared lighting convention, part-local form shading, face-specific detail, then textured 3D integration. Use near-colour ramps and connected stepped shadows to prevent flat surfaces.
- Define a `part_shading_profile` for each named soft/curved or visually independent part: local form axis, bright/side/dark zones, shadow strength, contact areas, edge rule, and whether adjacent parts connect or remain an intentional boundary. Do not stretch one gradient across unrelated parts.
- Manual pixel-AA is permitted only as a declared, grid-aligned transition on selected diagonal/curved or tonal boundaries. Automatic blur/filter AA, semi-transparent edge smoothing, and halos are forbidden for opaque/cutout textures.
- Prominent isolated pixels are defects unless their visual role is explicit. Merge or remove them; audit clusters and ramps at 1:1 and target game scale.
- If references are in scope, use an exact reference-call plan with count, purpose, covered parts/faces/maps, expected decision, and fallback. A full model task is not referenced adequately when every image is used only for generic material colour.
- Before export, run the applicable diagnostics and [multi-view review](references/multiview-review.md); report untested runtime behavior instead of claiming compatibility.

## Short workflow

1. Discover the live target with `bb_status`, `bb_projects`, and `bb_capabilities`; never silently convert providers or formats.
2. Establish the asset contract and choose the MCP route: `bb_task` for intent-level work and verification, `bb_plan_edit` for exact typed/surgical edits, and `bb_native_operation` only for a capability-discovered gap.
3. If references are relevant, read [references/reference-plan.md](references/reference-plan.md), write the call plan, and inspect the selected roles before committing to silhouette, UVs, or palette.
4. Plan hierarchy and silhouette, then explicit UV regions and atlas budget, then a `part_shading_profile` for each named part, then animation/display requirements. Keep texel density, orientation, padding, and same-part cross-face continuity coherent.
5. Read [references/texture-quality.md](references/texture-quality.md), author the initial high-density whole-model texture, and run its detail/cluster audit. Refine failed categories and re-audit the whole model.
6. Apply changes with checkpoints and Undo boundaries. After timeout, stale revision, external edit, or unexpected selection, inspect state before retrying; never blindly resend a mutation.
7. Read [references/multiview-review.md](references/multiview-review.md), inspect the required structural and asset-specific views, run `bb_diagnose`/texture/animation checks as relevant, and repeat affected views after fixes.
8. Export only after verification with the target codec and `bb_export`; retain the native project checkpoint and distinguish verified behavior from untested game/runtime behavior.

## Completion gate

Do not call the asset finished until the applicable checks pass: format/provider/codec; hierarchy, pivots, dimensions, and silhouette; intentional texture wiring on every visible face; explicit in-bounds UVs with documented sharing exceptions; coherent texel density, palette ramps, stepped shadows, same-part cross-face motifs, and filtering; every named part has a recorded local shading profile and its boundaries are classified as continuous, contact/occlusion, or intentional material separation; high-density detail audit or an explicitly requested lower profile; no meaningless isolated pixels, automatic AA, blur, halo, or double shading; provenance and reference-call plan when applicable; required multi-view captures/checks; diagnostics and export, or a clear record of what was not run.
