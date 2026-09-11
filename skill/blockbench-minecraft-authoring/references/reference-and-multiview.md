# Conditional texture reference and multi-view gate

Use this gate during model and texture authoring. Texture reference is conditional: do not force vanilla references onto a custom art direction, but do not skip reference inspection when the request depends on an existing Minecraft family, version compatibility, or cleanup of an AI-generated draft.

## When to use texture references

Create a pinned reference set when at least one of these is true:

- the user asks for vanilla-like, Minecraft-like, or a faithful continuation of an existing resource pack;
- the asset must match a named block, item, entity, material family, atlas, or resource-pack version;
- the model is being rebuilt from an existing texture, UV template, or game asset;
- the AI-generated texture has uncertain pixel density, palette, alpha, lighting, tiling, or material cues;
- the target edition/version has several competing wiring or texture variants;
- the model's silhouette, face treatment, or visible display orientation is uncertain.

Reference inspection may be skipped when the user explicitly wants an unrelated custom style and no compatibility with an existing asset is required. Record the decision as `reference: skipped — custom art direction` (or the actual reason) instead of silently pretending that the result is vanilla-accurate.

## Reference procedure

1. Pin Edition/provider, game version, namespace/resource pack, source revision, and the intended asset role.
2. Query the metadata corpus by role and family before opening images. For a block, include opaque, face-specific, transparent, animated, or PBR variants only when they are relevant. For an entity, include body, overlay, eye, emissive, moving-part, and companion maps when the format uses them.
3. Select multiple same-role comparators rather than one famous asset. Prefer a small set that covers the expected material, alpha mode, scale, and animation/tint behaviour.
4. Fetch only the selected files to an ignored temporary directory. Keep the generated provenance manifest with source URL, ref/tree SHA or local revision, original path, and fetched hash.
5. Inspect each reference at native resolution. Record dimensions, alpha/transparent bounds, palette roles, light direction, cluster and edge behaviour, tiling, overlays, animation metadata, and companion maps. Record observations and decisions, not copied source pixels.
6. Apply the observations to silhouette, face proportions, UV scale, palette, material cues, and resource-pack wiring. A reference image does not replace the actual project UVs or the target format's catalog/model/entity links.
7. If no suitable reference exists, label the relevant decision as an inference and verify it with the live project and target runtime.

For an AI-generated draft, reference comparison is a cleanup aid: remove background halos, reduce accidental colours, preserve hard pixel edges, correct alpha, resize with nearest-neighbour when resampling is required, and align marks to the model's UV texels. Do not let the AI draft determine the UV layout by itself.

## Required multi-view review

For every 3D model, make a named view checklist and do not finish until every applicable view has been inspected. The minimum structural set is:

1. front;
2. back;
3. left;
4. right;
5. top;
6. bottom;
7. three-quarter/isometric.

If a view is genuinely not visible in the target use, mark it `not applicable` with a reason; never omit it merely because the default camera hides it. Use capability-discovered `bb_capture`/preview operations when available and keep the captures tied to the same project revision. A single attractive three-quarter screenshot is not sufficient evidence.

Use the following additions by asset kind:

| Asset kind | Additional views/checks |
|---|---|
| Block | top/bottom face treatment, all side faces, 3×3 tiled neighbours, seams at repeated borders, and any transparent/cutout face |
| Item/weapon | first-person, third-person, GUI, ground, and item-frame/display views; check the expected handedness and rotation |
| Entity/creature | front/side/back and three-quarter silhouette, top/bottom where visible, neutral pose, every major animated pose, and exposed faces after limb motion |
| Prop/furniture | interaction-facing view, rear/underside, attachment/contact points, and any orientation or placement variant |
| Animated model | start, middle, end, loop seam, extreme rotations, and texture exposure during motion; use animation-frame inspection where available |

At each view check geometry silhouette, unintended gaps/overlaps, z-fighting, UV stretching, seams, mirrored faces, alpha/culling, light-direction consistency, and details that disappear at target scale. If a problem is found, return to the responsible layer—geometry, pivot, UV, texture, animation, or display transform—then repeat the affected views rather than approving only the corrected camera.

## Evidence record

The final review record should contain:

- reference decision and, when used, the pinned source and selected asset paths;
- the model revision/checkpoint used for captures;
- the view checklist with pass, fail, or not-applicable reason;
- any `bb_diagnose`, texture/UV inspection, animation-frame, export, or in-game checks;
- unresolved views or runtime behaviours that were not tested.

