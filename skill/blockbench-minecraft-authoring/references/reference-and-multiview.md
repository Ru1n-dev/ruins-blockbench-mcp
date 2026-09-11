# Conditional texture reference and multi-view gate

Use this gate during model and texture authoring. Texture reference is conditional: do not force vanilla references onto a custom art direction, but do not skip reference inspection when the request depends on an existing Minecraft family, version compatibility, or cleanup of an AI-generated draft.

## What a reference texture is—and is not

A reference texture can be used as a direct texture input, an adapted source, or observation-only material/shading guidance. Choose the mode explicitly based on UV compatibility, target format, edition/version, asset role, and provenance. Direct assignment is an exceptional exact-compatibility case; normally the reference guides a target-wide texture pass. A reference can provide the material, lighting, shadow, colour, alpha, and surface language; it does not automatically decide the model's UV layout or resource-pack wiring.

## Reference call plan: count, purpose, and coverage

Do not tell the authoring agent only to “look at some references” or “use references for the material”. Before opening or fetching images, write a `reference_call_plan` with an exact file count and one named purpose for every slot. Each slot must also name the model parts/faces/maps it covers, the expected observation or decision, and the fallback if the corpus has no suitable file. The plan is about coverage, not about collecting images for their own sake.

For a finished `high/hero` asset, use this default minimum plan when reference sampling is in scope:

| Slot | Default purpose | Minimum coverage and expected decision |
|---|---|---|
| R1 | family/style and face-role baseline | overall palette grammar, top/side/underside treatment, and the model's visible face roles |
| R2 | material structure and variation | material-specific macro/meso breakup such as grain, stone clusters, metal variation, cloth/fur, stains, or cracks |
| R3 | light, value, and baked-shadow treatment | light direction, value ladder, edge/recess/contact/underside cues, and the split between texture pixels and runtime lighting |
| R4 | pixel/detail-density, edge-wear, and tiling comparator | readable pixel cluster scale, micro accents, edge wear, seams, border behaviour, and the target display-scale amount of detail |

Add one more slot for every relevant companion role that is not covered by the first four: overlay/armor, eyes, emissive, animated strip, connected/tiling variant, tint, transparency/cutout, normal/roughness/PBR, or another format-specific map. A block normally needs R1–R4 plus connected/tiling or transparent variants when applicable. An entity normally needs R1–R4 plus body-overlay, eyes/emissive, armor/accessory, or animated companion references when those maps exist. A file may fill more than one slot only when its actual coverage is recorded; do not reuse a single material image by convenience and claim that all slots were covered.

For `developed`, `simple`, `prototype`, or `blockout` work, a smaller exact count is acceptable, but it must still cover more than generic base colour when the task includes modeling and texturing. A directly compatible source can fill the direct-input slot, but it does not automatically answer unresolved face roles, lighting, density, edge, display, or companion-map questions. If a task is genuinely material-only, say so explicitly; otherwise “material only” is an incomplete reference plan.

The plan can be written compactly as:

```text
Reference call count: <exact number of files>
R1: <purpose> | covers <parts/faces/maps> | decide <output> | fallback <inference or alternate>
R2: <purpose> | covers <parts/faces/maps> | decide <output> | fallback <inference or alternate>
...
Reference mode per file: <direct assignment | adapted source | observation-only>
```

## UV policy: unwrap first; share only as an explicit exception

UV unwrap/mapping is mandatory for every texture-bearing face. Here, “unwrap” means deliberately mapping every face or polygon to an in-bounds UV island/region before painting; it does not require an unnecessarily complex organic seam layout. The default for high-quality work is one intentional region per face or face role so each surface can receive its own material, brightness, shadow, wear, damage, and pixel placement.

UV sharing or mirroring is opt-in, not a convenience default. Permit it only when the faces are intentionally identical in material, lighting, wear, overlays, orientation, texel density, and expected future edits. Record the exact faces and the reason. If a face may need distinct detail, edge treatment, baked shadow, or material cues, give it a separate UV region even if the first draft uses the same colours. Hidden faces still need intentional in-bounds mapping when the target format or export can expose them; otherwise record the format-specific reason they are omitted.

The texture must be authored after this UV decision. Do not paint first and then force the result onto a shared or accidental layout. A larger atlas is preferable to losing face-specific information, provided texel density remains coherent and the target format supports it.

## Use references as material and shading sources

When a reference is selected, use it to design the target's material and shading language, or use it as the actual texture input only when the target intentionally matches it. Even in the direct case, inspect the whole model after assignment and add the missing global and face-specific passes. Inspect and record:

- base-material colour families and the value hierarchy between top, side, underside, recess, edge, and accent pixels;
- pixel-cluster structure, grain, pores, cracks, bands, stains, edge wear, and how detail scale changes by face;
- light direction, contact/underside shadow, ambient-occlusion-like darkening, edge highlights, and whether those cues are baked into pixels or expected from runtime lighting;
- material cues such as wood grain, stone breakup, metal variation, cloth/fur softness, emissive regions, cutout boundaries, and transparency behaviour;
- tiling, seam handling, overlays, and any face-specific or animated companion maps.

Translate each observation into one of four decisions: geometry, UV layout, texture pixels/material data, or runtime lighting/wiring. For example, preserve a face-specific underside value in the target texture when the style bakes it into pixels, but do not add a second identical shadow through runtime lighting. For Minecraft-style assets, material is usually communicated through restrained pixel clusters and bounded value changes; PBR channels or dynamic lighting are only used when the target format and runtime support them.

## Near-colour ramps, stepped shadows, and isolated-pixel gate

Use near-colours deliberately when a single base/shadow colour makes the texture look flat. Define a small ramp for each material family and face role—usually base, one or two shadow steps, one light step, and an optional highlight or accent—then reuse that ramp across the whole model. New shades must have a named purpose such as plane separation, curvature, contact, grain, wear, or a controlled transition; do not add colours only to increase the palette count.

Smooth-looking shadow is allowed as a low-frequency, pixel-authored value transition. Build it from broad connected clusters and roughly 3–5 opaque value steps, with the declared light direction and no pillow shading. Keep fixed material/face shading in the texture and leave dynamic cast shadows or changing illumination to runtime lighting; never duplicate the same shadow in both layers.

Deliberate manual pixel-AA is a separate, limited tool. It may soften a selected diagonal or curved boundary, or bridge a controlled tonal transition, by placing 1–2 adjacent near-colour steps from the declared ramp. It must remain grid-aligned and fully opaque on opaque/cutout textures. Automatic anti-aliasing, blur, linear filtering, fractional alpha, and light/dark halos at transparent edges are not permitted by this rule. Transparent or translucent assets may deviate only when the target format explicitly requires and supports it.

Treat a conspicuous singleton pixel as a defect by default. Remove or merge it into a neighbouring cluster unless it has a documented role—for example a sparkle, eye, tiny emissive point, intentional edge termination, or a specific one-pixel mark. A singleton is not justified merely because it is a different colour. Review the texture at native 1:1 scale and the target game/display scale; if the pixel attracts attention without improving the material, form, or focal point, it fails the audit.

## Whole-model texture pass and cross-face coherence

Per-face UV islands provide detail freedom; they must not turn the asset into unrelated face paintings. Never approve a face only from an isolated UV editor or flat image. Keep the full textured model visible and use this pass order:

1. **UV and atlas blueprint:** map every texture-bearing face, name or group face roles, keep texel density consistent in pixels per model unit, orient related surfaces consistently, and reserve padding/bleed according to the target's filtering behaviour.
2. **Global base pass:** cover every island with the same material family, base palette, and broad surface language. This is the unity layer; do not begin with independent random colours on each face.
3. **Global value/light pass:** establish the declared light direction and value ladder across the entire asset. Apply top/side/underside differences consistently and keep baked shading subtle enough that runtime light does not duplicate the same effect.
4. **Face-specific pass:** add per-face grain, dirt, cracks, wear, contact darkening, edge treatment, and unique material cues. A local change is valid when it follows the material rules established in the global passes.
5. **Continuity/integration pass:** inspect adjacent faces in the 3D textured view. Align motifs that cross an edge, continue grain or damage where geometry implies continuity, match border values, remove accidental seams, and deliberately mark true material boundaries. Do not force continuity across a real hard edge or a different material.
6. **Whole-model balance pass:** zoom out to target display scale and compare front, back, sides, top, bottom, and three-quarter views. Reduce a face detail that dominates the asset, strengthen a face that disappears, and check the silhouette and material read again.

To prevent separate UV islands from losing unity, maintain one master palette/value chart, one texel-density target, stable orientation rules, a recorded edge-pair list for cross-face motifs, and consistent padding/filtering. Use a small allowed value range for face-role adjustments rather than picking unrelated per-face colours. If a discontinuity is intentional—such as a cut edge, underside, metal fitting, or separate overlay—record it as a material boundary instead of treating it as a UV error.

## Initial high-density authoring rule

For a finished or release-quality asset, the first texture pass must already target `high/hero` detail. Do not present a base-only or low-density first pass as the completed texture. A lower profile is allowed only when the request explicitly says `simple`, `prototype`, or `blockout`.

The initial high-density pass must cover every sufficiently large visible face with the available purposeful detail scales: material variation and macro structure, meso breakup, micro accents, edge/contact treatment, and face-specific identity. Build these across the whole model before polishing any one face. If the chosen texture size cannot support the target, increase the atlas/UV budget or record the asset as a draft before proceeding; do not silently deliver a low-density result.

## Detail-density audit and refinement loop

Do not leave the instruction “make it detailed” implicit. Convert it into two separate targets:

- **Texel density:** how many pixels are available per model unit or per visible face. Increasing the PNG size can increase this, but it does not prove that the texture contains more useful information.
- **Visual detail density:** how much intentional, readable surface information is present at the target display size. This is increased by material breakup, face identity, grain, cracks, stains, wear, damage, edge treatment, and controlled pixel accents—not by random noise.

Choose a profile before painting:

- **base:** broad material regions, palette, face-role values, alpha/emission, and major marks;
- **developed:** base plus medium-scale breakup and at least one purposeful local feature on every sufficiently large visible face, with edge/contact treatment where the geometry supports it;
- **high/hero:** developed plus macro, meso, and micro detail wherever the UV area and target display size can show it, distinct face treatment, and no unexplained broad flat areas.


Audit every visible face or named part after the whole-model base and value passes. Mark each applicable category `pass`, `fail`, or `not applicable`:

1. material identity and base variation;
2. macro structure or large material regions;
3. meso breakup such as grain, cracks, stains, bands, or wear;
4. micro accents such as pixel clusters, chips, pores, or highlights;
5. edge, recess, contact, or underside treatment;
6. face-specific identity and relationship to neighbouring faces;
7. palette-ramp, cluster, stepped-shadow, and isolated-pixel coherence.

If a face fails, do not solve it by simply enlarging the image, adding noise, or scattering singleton pixels. Name the missing category, add a targeted refinement pass using the existing palette ramps, density, light direction, and material rules, then audit the entire model again. Inspect the result at the intended game/display scale; detail that exists only when zoomed into the UV editor does not satisfy a high-detail profile. For small faces where a scale cannot be read, record `not applicable` and compensate with silhouette, value, or a clear material cue rather than forcing unreadable pixels.

Use role-matched reference textures to calibrate the scale and amount of purposeful detail, not to copy a pixel count blindly. A reference can show whether a material is expressed through broad bands, medium clusters, or tiny accents; the target profile decides which of those scales are feasible on the model's actual UV areas.

Do not:

- assign one reference image to every face unless the target intentionally uses the same image/UV on every face;
- let the reference filename decide the texture path or edition/version wiring;
- use a screenshot, thumbnail, or one famous block/entity as the universal Minecraft baseline.
- use automatic anti-aliasing, blur, linear filtering, or semi-transparent edge pixels to fake smooth shading;
- leave conspicuous singleton pixels as “detail” without a named visual role.

The expected output of reference use is a short record containing the selected mode (`direct assignment`, `adapted source`, or `observation-only`), source/provenance, compatibility checks, whole-model pass status, and the resulting geometry, UV, pixel/material, and runtime/resource-pack decisions. Direct assignment is valid only when the image dimensions, UV regions, face roles, atlas role, alpha/filtering, and target format are intentionally compatible; it still requires the whole-model integration pass. Otherwise adapt it or use it only as guidance.

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
3. Execute the `reference_call_plan`: select exactly the declared number of files, normally one file per slot. If a slot needs multiple comparators, split it into separately counted slots before fetching. Prefer role coverage over one famous asset. If a slot has no suitable file, record the fallback before continuing; do not silently substitute another material-only image.
4. Fetch only the selected files to an ignored temporary directory. Keep the generated provenance manifest with source URL, ref/tree SHA or local revision, original path, fetched hash, plan slot, purpose, and covered parts/faces/maps.
5. Inspect each reference at native resolution. Record dimensions, alpha/transparent bounds, palette roles, light direction, cluster and edge behaviour, tiling, overlays, animation metadata, companion maps, and the slot-specific observation. Record observations and decisions, not copied source pixels.
6. Convert the observations into a target-specific plan: decide the silhouette and face roles first, explicitly unwrap/map every texture-bearing face, and reserve separate UV regions by default. Share or mirror a region only for the recorded identical-face exceptions. Then select the reference mode: assign directly when compatibility checks pass, adapt the source when the target differs, or use the observations to author pixels/material data when it is observation-only. A reference image does not replace the actual project UVs or the target format's catalog/model/entity links.
7. If no suitable reference exists, label the relevant slot decision as an inference and verify it with the live project and target runtime.

For an AI-generated draft, reference comparison is a cleanup aid: remove background halos, reduce accidental colours, preserve hard pixel edges, correct alpha, resize with nearest-neighbour when resampling is required, align marks to the model's UV texels, replace continuous gradients with stepped near-colour ramps, and merge conspicuous singleton pixels unless they have a documented role. Do not let the AI draft determine the UV layout by itself.

## Concrete AI handoff format

When asking an AI to use a reference, make the request explicit:

```text
Reference call count: <exact number of files>
Reference call plan: <slot, purpose, covered model parts/faces/maps, expected decision, fallback for each file>
Reference use mode: <direct assignment | adapted source | observation-only>
Target: <edition/version/format/asset kind>
Model UV: mandatory explicit unwrap; <texture size and per-face/box/custom UV layout>; shared/mirrored regions only for <named identical faces, or none>
Detail profile: <base | developed | high/hero>; screen/display target: <game scale or pixel size>
Per-face detail requirements: <material, macro, meso, micro, edge/contact, and unique identity requirements>
Palette/shading: <near-colour ramps, 3–5 stepped shadow values, light direction, texture-vs-runtime split, and declared pixel-AA boundaries>
Singleton policy: <remove conspicuous isolated pixels; retain only named visual exceptions>
Observe: <face roles, material, palette, light direction, baked/runtime shading, alpha, tiling, overlays>
Texture action: <assign directly | adapt source | author pixels/material from observations>
Refine: do not stop at the base pass; audit detail density and add targeted passes for every failed applicable category
Verify: UV bounds, seams, alpha/filtering, detail-density audit, and the required multi-view checklist
Record: source paths, revision, observations, and decisions
```

For each selected file, the AI should be able to answer: “Which plan slot and purpose did this file satisfy, which parts/faces/maps did it cover, which mode was used, why is it compatible with this asset, and what material/shading/UV/runtime decision did it support?” If it cannot answer those questions, or if every file only supports generic material colour, the reference set was not used reliably.

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
- the exact reference-call count, slot-to-file purpose map, covered model parts/faces/maps, expected decisions, and any fallbacks/inferences;
- the model revision/checkpoint used for captures;
- the view checklist with pass, fail, or not-applicable reason;
- any `bb_diagnose`, texture/UV inspection, animation-frame, export, or in-game checks;
- unresolved views or runtime behaviours that were not tested.

