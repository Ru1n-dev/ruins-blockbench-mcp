---
name: blockbench-minecraft-authoring
description: Create, edit, and review Minecraft-oriented Blockbench models, UVs, pixel textures, animations, and exports through Ruin's BlockBenchMCP, using reference-guided authoring; use for end-to-end asset authoring, not generic 3D or image generation.
---

# Blockbench Minecraft Authoring

Use this skill for end-to-end Minecraft-oriented Blockbench work through Ruin's BlockBenchMCP: blocks, items, props, entities, animations, textures, resource-pack assets, and compatible exports. The live Blockbench project is the source of truth; PNG, OBJ, or hand-edited JSON is only an intermediate or export.

## Read by phase

Read only the focused reference needed for the current phase, but do not skip the reference decision or the quality review.

- [references/ruins-mcp-workflow.md](references/ruins-mcp-workflow.md): live MCP discovery, routes, checkpoints, diagnostics, and recovery.
- [references/reference-plan.md](references/reference-plan.md): before every modeling, UV, texture, or material task; required call count, purpose, coverage, provenance, and fallback.
- [references/minecraft-style.md](references/minecraft-style.md): Minecraft-like silhouette, scale, palette, and asset-kind decisions.
- [references/texture-quality.md](references/texture-quality.md): before any UV, texture, pixel, material, shading, or AI-texture task; the detailed raster and coverage contract.
- [references/multiview-review.md](references/multiview-review.md): before final 3D review or export.
- [references/corpus-reference.md](references/corpus-reference.md): only for whole-category vanilla coverage or an Edition/version corpus refresh.
- [references/blockbench-wiki-guardrails.md](references/blockbench-wiki-guardrails.md): only when format, animation, `.bbmodel`, plugin, or export details require it.
- [references/bb-academy-notes.md](references/bb-academy-notes.md): only when the reviewed video material is relevant; preserve its evidence limits.

## Execution contract

- Resolve the target Edition/provider, game version, Blockbench format, coordinate convention, codec, hierarchy, pivots, silhouette, display scale, and requested detail profile before mutation. In this repository, live schemas/`bb_capabilities`, `AGENTS.md`, Blockbench Desktop 5.1.6, and source commit `794e964e966b6783b4e9b98ecbdda5152c0620cc` are authoritative when sources disagree.
- Treat geometry, explicit UVs, raster pixels, animation, display transforms, and output wiring as one contract. Re-check dependent layers after each change.
- Map every texture-bearing face before painting. Per-face or per-island UVs are the default; sharing or mirroring requires named identical faces and a recorded reason.
- Use `high/hero` as the default finished quality. `simple`, `prototype`, or `blockout` must be explicitly requested; a base-only first pass is a draft.
- Before editing, record `reference: use` with the exact call plan, or `reference: skip` with a reason. For Minecraft-like/high-quality work, use is the default and observation-only references are valid when no exact texture exists.
- For texture-specific rules, profiles, controlled stronger noise, smooth local shading, pixel cleanup, texture/runtime lighting separation, and audits, follow `texture-quality.md` as the single detailed source of truth.
- Do not force vanilla styling onto custom, stylized, modded, or non-Minecraft work. This Skill does not authorize MCP implementation changes unless requested.

## Six-phase workflow

1. **Discover:** run `bb_status`, `bb_projects`, and `bb_capabilities`; confirm the live target and choose `bb_task`, `bb_plan_edit`, or a capability-discovered `bb_native_operation` gap.
2. **Reference:** read `reference-plan.md`, write the exact call plan, inspect selected roles, and record provenance and decisions before committing to shape, UV, palette, or material.
3. **Plan:** establish hierarchy and silhouette, explicit UV regions/atlas budget, per-part shading and surface-variation profiles, then animation/display requirements.
4. **Author:** read `texture-quality.md`; create the high-density whole-model texture, including per-face coverage, smooth part-local transitions, material variation, and any declared stronger stochastic accents. Audit and refine the whole model.
5. **Apply safely:** use coherent plans, checkpoints, and Undo boundaries. After timeout, stale revision, external edit, or unexpected selection, inspect the current state and make a fresh plan; never blindly resend a mutation.
6. **Review/export:** read `multiview-review.md`, inspect required structural and asset-specific views, run relevant diagnostics, repeat affected views after fixes, and export with the verified target codec. Keep the native project checkpoint and report untested runtime behavior.

## Completion gate

Finish only when the target format/provider/codec, hierarchy/silhouette, intentional texture wiring, in-bounds UVs, texel density, per-part profiles, whole-model texture coverage, smooth value transitions, controlled surface variation, same-part continuity, filtering/alpha behavior, and texture-versus-runtime lighting split have been audited. Unintentional isolated pixels, uncontrolled high-contrast scatter, automatic AA/blur/halo, and double shading must not remain. Required reference decisions, multi-view checks, diagnostics, and export must be recorded; untested behavior must remain explicitly unclaimed.
