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
- Keep geometry complexity separate from texture density. `high/hero` means high-quality raster detail, not an automatically high cube count: use the smallest set of primary and secondary volumes that establishes the silhouette, joints, contacts, and functional separation, and give every extra cube an explicit reason. For Minecraft-like work, default to curves and circular forms made from rotated cuboid elements around a common construction center/pivot. Use a readable 5- or 6-sided faceted profile when it fits the silhouette and target scale; add more segments when the target resolution, display distance, output format, or intended faceting genuinely needs them. Use a mesh only when the target format explicitly requires a true custom polygon/contour. Do not add staircase cubes merely to inflate geometry or hide a poor silhouette.
- Treat geometry integrity as a hard gate, not visual polish. Every volumetric element must have a declared structural relation: supported by, attached to, intersecting with, or intentionally detached from another part. An accidental floating cube/segment, unsupported protrusion, or piece separated from the part it is meant to join is invalid; repair it before texture refinement, animation, review approval, or export. An intentionally suspended or detached element is allowed only when the brief/reference explicitly requires it and its support or detachment logic is recorded.
- Keep intended geometry joins numerically aligned. When cubes or segmented parts should meet, use the available grid/vertex/edge snapping or assign exactly shared coordinates, then verify shared endpoints, edges, and bounding boxes. Visual proximity from one camera is never evidence of a valid join: a near-touching cube with a hairline gap or unsnapped contact vertices is a hard failure. For rotated curve segments, align their construction center/pivot and snap intended contact vertices/edges; a deliberate overlap used to close a faceted join must be planned and must not create z-fighting. Preserve an intentional gap or overlap only when it is part of the design and record it.
- Select and record a geometry mode per asset or named part. `card/plane/billboard` mode may replace volume with one textured plane for foliage, flags, signs, decals, flat ornaments, sprite-like details, or small/distant assets. Declare the plane orientation, intended view, alpha/cutout or transparency behavior, face culling/double-sided behavior, and known view limitations. Do not use it when thickness, parallax, contact/occlusion, or an all-around silhouette is essential.
- After form shading, material variation, continuity, and part-boundary work, perform a final grime/weathering decision for each applicable material or named part. Use a reference- or usage-supported mask such as inner-to-outer darkening, recess/seam accumulation, lower/contact grime, dust, streaks, or handling wear; record the direction, region, strength, transition span, and clean-material exceptions. Keep this pass distinct from form shadows and runtime lighting.
- Use `high/hero` as the default finished quality. `simple`, `prototype`, or `blockout` must be explicitly requested; a base-only first pass is a draft.
- Before editing, record `reference: use` with the exact call plan, or `reference: skip` with a reason. For Minecraft-like/high-quality work, use is the default and observation-only references are valid when no exact texture exists.
- Give every materially distinct visible family material-focused reference coverage in R2 or a counted companion slot. A colour-only image is not enough; record structure, directionality, roughness/reflectance, edge response, wear/contact behaviour, and detail scale before authoring.
- For texture-specific rules, profiles, controlled stronger noise, smooth local shading, pixel cleanup, texture/runtime lighting separation, and audits, follow `texture-quality.md` as the single detailed source of truth.
- Do not force vanilla styling onto custom, stylized, modded, or non-Minecraft work. This Skill does not authorize MCP implementation changes unless requested.

## Six-phase workflow

1. **Discover:** run `bb_status`, `bb_projects`, and `bb_capabilities`; confirm the live target and choose `bb_task`, `bb_plan_edit`, or a capability-discovered `bb_native_operation` gap.
2. **Reference:** read `reference-plan.md`, write the exact call plan, ensure every material family has material-focused coverage rather than colour-only coverage, inspect selected roles, and record provenance and decisions before committing to shape, UV, palette, or material.
3. **Plan:** read `minecraft-style.md` when the target is Minecraft-like, then establish the geometry mode per part, hierarchy and silhouette or card boundary, a geometry complexity budget/curve strategy, a snap/coordinate policy for joins, explicit UV regions/atlas budget, per-part shading and surface-variation profiles, and animation/display requirements.
4. **Author:** read `texture-quality.md`; apply the reference-derived material structure and surface-response decisions, then complete a shadow-first pass for every applicable volumetric part so readable local form shading exists before surface variation. For `card/plane/billboard` parts, map the intended plane deliberately, paint its full visible silhouette and alpha boundary, and preserve the declared orientation/culling behavior. Create the high-density whole-model texture with per-face coverage, smooth part-local transitions, material variation, and any declared stronger stochastic accents. After continuity and part-boundary checks, apply the final grime/weathering pass when the material or use supports it, then audit and refine the whole model; grime must not substitute for form shading or be duplicated as runtime shadow.
5. **Apply safely:** use coherent plans, checkpoints, and Undo boundaries. After timeout, stale revision, external edit, or unexpected selection, inspect the current state and make a fresh plan; never blindly resend a mutation.
6. **Review/export:** read `multiview-review.md`, inspect required structural and asset-specific views, run relevant diagnostics, repeat affected views after fixes, and export with the verified target codec. Keep the native project checkpoint and report untested runtime behavior.

## Completion gate

Any accidental floating element, unsupported protrusion, near-touching connection with a gap, or unsnapped intended shared vertex is a hard failure; repair it before completion.

Finish only when the target format/provider/codec, declared representation mode, hierarchy/silhouette or card boundary, geometry complexity/curve strategy, snapped/shared geometry joins, intentional texture wiring, in-bounds UVs, texel density, per-part profiles, whole-model texture coverage, smooth value transitions, controlled surface variation, same-part continuity, final grime/weathering decision, filtering/alpha/culling behavior, and texture-versus-runtime lighting split have been audited. Each applicable volumetric part must retain readable form shading when surface noise is ignored or reduced to grayscale; each card/plane part must retain a readable alpha silhouette in its intended view. Unintended gaps, overlaps, floating cubes, unsnapped shared vertices, unintentional isolated pixels, uncontrolled high-contrast scatter, automatic AA/blur/halo, and double shading must not remain. Required reference decisions, multi-view checks, diagnostics, and export must be recorded; untested behavior must remain explicitly unclaimed.
