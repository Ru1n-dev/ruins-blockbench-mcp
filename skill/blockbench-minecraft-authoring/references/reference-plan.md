# Texture reference call plan

Read this reference before every Minecraft modeling, UV, texture, or material task. It controls why images are called, how many are called, and what each one must contribute. Reference use is the default; the absence of an exact matching source is not a reason to skip observation-only comparison.

## Reference modes

Choose one mode per file and record it:

- **direct assignment:** use the image as texture input only after dimensions, UV regions, face roles, atlas role, alpha/filtering, provenance, and target format are exactly compatible;
- **adapted source:** use the image as a starting point, then remap, recolour, crop, or restructure it for the target UVs and format;
- **observation-only:** use it to author new target pixels/material data from its material, value, lighting, cluster, alpha, tiling, or detail decisions.

Direct assignment is an exceptional exact-compatibility case. It never replaces whole-model integration or automatically answers unresolved faces, maps, or display roles.

## Exact call count and purpose

Do not say only “look at some references” or “use references for the material”. Before opening or fetching images, write `reference_call_plan` with an exact number of files. Each selected file gets one named slot, purpose, covered model parts/faces/maps, expected observation/decision, and fallback if no suitable source exists. If a slot needs multiple comparators, split it into separately counted slots before fetching.

For a finished `high/hero` asset, use this default minimum plan:

| Slot | Purpose | Coverage and expected decision |
|---|---|---|
| R1 | family/style and face-role baseline | palette grammar, top/side/underside treatment, and visible face roles |
| R2 | material structure and variation | material-specific macro/meso breakup: grain, stone clusters, metal variation, cloth/fur, stains, or cracks |
| R3 | light, value, and baked-shadow treatment | shared light convention, per-part bright/side/dark flow, smooth value transitions, edge/recess/contact/underside cues, and texture-versus-runtime split |
| R4 | pixel/detail-density, edge-wear, surface variation, and tiling comparator | cluster scale, near-colour variation, micro accents, edge wear, seams, borders, and readable amount of detail at target scale |

Add one counted slot for every relevant companion role not covered by R1–R4: overlay/armor, eyes, emissive, animated strip, connected/tiling variant, tint, transparency/cutout, normal/roughness/PBR, or another format-specific map. Blocks commonly need connected/tiling or transparent variants. Entities commonly need body-overlay, eyes/emissive, armor/accessory, or animated companion references. A file may fill multiple roles only when its actual coverage is recorded; do not reuse a material image by convenience and claim all roles were covered.

For `developed`, `simple`, `prototype`, or `blockout`, a smaller exact count is acceptable, but a modeling-and-texturing task still needs references beyond generic base colour when face roles, lighting, density, edge treatment, or companion maps are unresolved. A genuinely material-only task must say so explicitly. The count may be adapted to scope, but it must always be declared before fetching.

Use this compact form:

```text
Reference call count: <exact number of files>
R1: <purpose> | covers <parts/faces/maps> | decide <output> | fallback <inference or alternate>
R2: <purpose> | covers <parts/faces/maps> | decide <output> | fallback <inference or alternate>
...
Reference mode per file: <direct assignment | adapted source | observation-only>
```

## When to use references

Create a pinned reference set for Minecraft-oriented work. It is especially important when any of these is true:

- the user asks for vanilla-like/Minecraft-like style or continuation of an existing resource pack;
- the asset must match a named block, item, entity, material family, atlas, or resource-pack version;
- the model is rebuilt from an existing texture, UV template, or game asset;
- an AI-generated texture has uncertain pixel density, palette, alpha, lighting, tiling, or material cues;
- the target edition/version has competing texture or wiring variants;
- the silhouette, face treatment, or visible display orientation is uncertain.

Reference inspection may be skipped only for an explicitly unrelated custom style with no Minecraft style or compatibility target. Record `reference: skipped — custom art direction` or the actual reason before editing; never silently claim that references were used. If no exact asset exists, use observation-only references from the closest material, face role, form, edition, or resource-pack family and record the inference.

## Procedure

1. Pin Edition/provider, game version, namespace/resource pack, source revision, and asset role.
2. Query the metadata corpus by role and family before opening images. Include transparent, animated, PBR, overlay, eye, emissive, moving-part, and companion maps only when relevant.
3. Execute the call plan: select exactly the declared file count, normally one file per slot. If a slot has no suitable source, record its observation-only fallback or inference before continuing; never silently substitute another material-only image or silently abandon the plan.
4. Fetch only selected files to an ignored temporary directory. Retain a provenance manifest with source URL, ref/tree SHA or local revision, original path, fetched hash, plan slot, purpose, and covered parts/faces/maps.
5. Inspect native dimensions, alpha/transparent bounds, palette/value roles, light direction, smooth value transitions, pixel clusters, near-colour texture-noise structure, edge behaviour, tiling, overlays, animation metadata, companion maps, and the slot-specific observation. Record observations and decisions, not copied source pixels.
6. Compare the selected roles to the planned silhouette, face treatment, per-part form shading, material/shading, and detail density before applying the model edit. Then choose direct, adapted, or observation-only mode and validate UV/format fit.
7. If no suitable source exists, label the relevant slot as an inference and verify it with the live project and target runtime.

## AI handoff

When asking an AI to use references, require an answer for every selected file: which plan slot and purpose it satisfied, which parts/faces/maps it covered, which mode was used, why it fits the target, and what geometry/UV/pixel/material/runtime decision it supported. If every file only supports generic material colour, the set was not used reliably.

```text
Reference call count: <exact number of files>
Reference call plan: <slot, purpose, covered model parts/faces/maps, expected decision, fallback for each file>
Reference use mode per file: <direct assignment | adapted source | observation-only>
Target: <edition/version/format/asset kind>
Source/provenance: <paths, revision, hashes>
Compatibility: <dimensions, UV regions, face roles, atlas, alpha/filtering, format>
Expected decisions: <geometry | UV | pixels/material | smooth shading/surface variation | runtime/wiring for each slot>
Unresolved slots: <fallback inference and verification plan>
```
