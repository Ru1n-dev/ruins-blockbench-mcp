# Minecraft texture quality gate

Read this reference for any model, UV, texture, material, shading, or AI-texture task. It contains the detailed pixel and surface rules that the short Skill entrypoint routes to.

## UV and whole-model contract

Unwrap/map every texture-bearing face before painting. The default high-quality layout is one intentional in-bounds UV region per face or face role so each surface can receive its own material, brightness, shadow, wear, damage, and pixel placement. UV sharing or mirroring is an explicit exception: use it only when the named faces are intentionally identical in material, lighting, wear, overlays, orientation, texel density, and future edit needs. Record the exact faces and reason. Hidden faces still need intentional mapping when the target format or export can expose them; otherwise record the format-specific reason they are omitted.

Paint after the UV decision. Do not create a flat texture first and force it onto an accidental or shared layout. Reserve enough atlas space for the declared screen-size target and keep texel density coherent. A larger atlas is preferable to losing face-specific information when the target format supports it.

Never approve one face from an isolated UV editor or flat image. Use this pass order:

1. **UV/atlas blueprint:** map all texture-bearing faces, name face roles, set pixels-per-model-unit, orient related islands consistently, and reserve padding/bleed for the runtime filter.
2. **Global base/material pass:** cover every island with the same material family, palette grammar, and broad surface language.
3. **Global lighting convention:** establish the shared light direction, palette/value relationship, and texture-versus-runtime split. This is a rule for interpreting light, not one gradient stretched across the entire model.
4. **Part-local form-shading pass:** for each named soft, curved, or visually independent part, apply its own `part_shading_profile`—local bright/side/dark zones, a deliberate value ramp with as many connected tonal stages as the form and texture resolution require, shadow strength, and contact areas. There is no fixed stage count or upper limit, but a surface large enough to support intermediate pixels must read as a continuous transition.
5. **Smooth-transition gate:** connect the bright, side, and dark zones of each applicable part with as many intermediate near-colours as the UV area, material, and display scale require. An unexplained abrupt tonal jump fails; the only exceptions are a real plane/material/cutout boundary or a face too small to support a transition, and each exception must be recorded.
**Shadow-first gate:** before the surface-variation pass, suppress or ignore texture noise and inspect each applicable part in grayscale or with noise reduced. Its volume must still read through local bright/side/dark form shading, recess/underside values, and supported contact shadows. If it looks flat, strengthen the part's form shading and connected ramp first; do not use noise as a substitute.
6. **Whole-model near-colour texture-noise pass:** apply a `surface_variation_profile` to every visible texture-bearing face. Use material-aware clusters and useful macro/meso/micro scales by default. Stronger or controlled stochastic variation is allowed when it expresses a named material cue or focal feature; record its purpose, region, palette/contrast, density, and distribution instead of rejecting it solely for being high-contrast. Do not leave a face unvaried without an explicit clean-material or scale exception.
7. **Face-specific pass:** add grain, cracks, stains, wear, contact darkening, edge treatment, and unique material cues inside the relevant named part. Do not turn every face border into a shadow.
8. **Same-part continuity pass:** inspect adjacent faces belonging to the same part in the textured 3D view. Align motifs and form shading across an edge, continue grain/damage where geometry implies continuity, match border values, and remove accidental seams.
9. **Part-boundary pass:** inspect distinct parts together. Use a restrained contact/occlusion shadow only where the parts touch or overlap; do not force a gradient across a true seam or material boundary.
10. **Final grime/weathering pass:** after the model's material, form shading, surface variation, same-part continuity, and part-boundary rules are stable, apply intentional dirt or wear when the material or use supports it. Examples include a controlled inner-to-outer darkening, darkening in recesses and seams, lower/contact grime, dust, directional streaks, or handling wear. Use a material/usage mask and connected near-colour transitions; do not apply an unexplained global vignette or make every convex outer edge dark. Record the direction, region, strength, transition span, and clean-material exceptions.
11. **Whole-model balance:** inspect at the target game/display scale across front, back, sides, top, bottom, and three-quarter views. Strengthen disappearing parts, reduce details that dominate the asset, and confirm the grime reads as material/use history rather than form-shadow duplication.

Separate UV islands and separate parts may have different local form shading, but they share one material language and lighting convention. Maintain a master palette/value chart, one texel-density target, stable orientation rules, controlled padding/filtering, a recorded edge-pair list for same-part motifs, and a part-boundary list that classifies continuous surfaces, contact/occlusion edges, and intentional material seams.

## Part-local form shading

Do not apply one object-wide gradient to every part. Use two layers of control:

- **Shared convention:** palette ramps, light vocabulary, maximum contrast, runtime-lighting split, and a preferred world-space light direction.
- **Local execution:** each named part decides how its own volume turns from bright to side to dark, based on its shape, local axes, material, and display importance.

Record a `part_shading_profile` before painting:

```text
part: <named group or mesh>
form: <cushion | cloth fold | pipe | button | hard fitting | other>
local shading axis: <part-local top/side/underside or declared orientation>
bright zone: <where the part receives the light-facing ramp>
side transition: <near-colour values or tonal ramp, with the number of stages chosen for this part's form, material, resolution, and display scale; include span and direction>
dark zone: <underside/recess/contact areas and maximum strength>
form contrast: <base-to-recess value separation sufficient to read the intended volume at target scale>
transition smoothness: <intermediate values and spatial span, independent of total form contrast>
contact: <none | named touching part/edge and restrained occlusion>
edge rule: <convex edge no automatic dark line | concave/recess shadow | material boundary>
continuity: <same-part edge pairs to connect | intentional part boundary>
```

Record a `surface_variation_profile` for each applicable named part or face group:

```text
part: <named group or mesh>
scope: <all visible texture-bearing faces in this part>
purpose: <material variation, grain, pores, stains, wear, plane breakup, or other named cue>
material reference: <reference slot/file and provenance, or explicit inference/clean-material reason>
material observations: <structure, directionality, roughness/reflectance, edge response, wear/contact behaviour, and detail scale>
near-colour palette: <related values and the value distance from the base>
cluster scales: <macro | meso | micro, as supported by the UV area>
distribution: <direction, density, frequency, and material-specific pattern>
contrast: <fine-noise amplitude kept separate from form contrast; default near-colour range; named stronger/high-contrast accents with their role and region>
stochastic control: <none | controlled random/seeded distribution, with density, clustering, mask, and reason>
final grime/weathering: <apply | clean-material exception; direction/mask such as inner-to-outer darkening, recess/seam accumulation, lower/contact grime, dust, streaks, or handling wear; strength and transition span>
continuity: <same-part edges or motifs to connect | intentional termination>
coverage record: <per-face applied | clean-material exception | too-small exception, with reason>
```

Within one continuous part, the local shading flow and motifs must cross its UV seams. Between distinct parts, do not connect gradients just because the parts touch; use a controlled contact shadow or an intentional seam. A convex outer edge does not receive a dark border by default. A concave fold, underside, or contact edge may receive a shadow when the geometry supports it.

For smooth form shading, the local ramp must follow the part's volume and merge from bright to side to dark rather than stopping as a hard stripe. The number of values is unrestricted; choose enough related values to make the transition read continuously at native texture scale and target game/display scale. Do not flatten the transition into one global gradient across unrelated parts.

The shared light direction is a starting convention, not permission to ignore part shape. A part may use a local shading axis or a small orientation adjustment when its form, rotation, or stylized presentation requires it, but record the exception and keep the palette and shadow strength compatible with the rest of the asset. Never flip light direction independently per face.

## Near-colour ramps and smooth-looking shadows

Control three properties independently: the total value separation of form shading, the intermediate colours and spatial span that make its transition smooth, and the amplitude of fine surface noise. Low-contrast fine noise must not cap the form-shading range. Establish readable recesses and volume first, then connect their values smoothly; a smooth but visually flat surface fails when relief is intended. On refinement, adjust local form/recess contrast while holding the fine-noise field and amplitude stable, then review both relief and banding at native and target scale. Use material references to set the strength; no universal contrast multiplier is required. Keep the existing absence of separate bright rim/specular accents.

Use near-colours deliberately when a single base or shadow colour makes a part look flat. Define the ramp required for each material family and part/face role; it may contain any number of related values needed to express plane separation, curvature, contact, grain, wear, or a controlled transition at the target resolution. Reuse compatible ramps across the model, but do not impose a fixed minimum, maximum, or stage count. Every added shade needs a named purpose; do not add colours only to inflate the palette count.

Smooth-looking shadow is required as a pixel-authored transition inside every applicable named part. Build it from connected clusters and as many opaque value stages as are needed to describe the volume at the target resolution, following the shared convention plus that part's local shading profile and avoiding pillow shading. Fixed material/part shading belongs in the texture; dynamic cast shadows and changing illumination belong to runtime lighting. Never duplicate the same shadow in both layers.

This is not permission for a photographic gradient, blur, or automatic filter. Use related near-colour values and a deliberately fine connected tonal transition according to the texture style and resolution. Review broad surfaces at 1:1 and target game scale so the ramp reads as form and material rather than banding or mud. A hard tonal break on a surface that can support intermediate pixels fails the smooth-transition gate.

## Whole-model near-colour texture noise

Here, “texture noise” usually means structured, near-colour variation that makes the material feel inhabited and prevents dead-flat pixels. Near-colour variation is the default, but stronger or controlled stochastic accents are allowed when the material or focal design requires them. Unexplained or unbounded salt-and-pepper scatter is still a defect. After the global material/value pass and local form-shading pass, apply the declared variation across the whole visible model.

Every visible texture-bearing face must have either applied near-colour texture noise or an explicit recorded exception such as a deliberately clean/uniform material, transparent/cutout limitation, emissive treatment, or insufficient texel area. A missing or unrecorded face is a failure, not an optional omission.

Use values close enough to preserve the material and part hierarchy for ordinary surface variation, but allow stronger contrast when it communicates a specific material cue, damage, focal feature, or readable mark. Choose cluster size, direction, frequency, contrast, and—when needed—controlled random distribution from the material and geometry: grain follows wood direction, stone uses irregular connected breakup, cloth uses soft directional variation, metal uses restrained broad variation, and stains/wear follow contact or use patterns. Mix macro, meso, and micro scales when the texture resolution supports them; do not distribute one identical pattern over every part.

Keep the noise connected to the surface language. Unexplained or unbounded high-contrast specks, accidental stamps, and patterns that cross a true part/material boundary without a reason are defects. A high-contrast random or stochastic field is acceptable when its profile declares why it exists, where it is masked, how dense it is, and how it remains subordinate to the asset's form and focal hierarchy. Continue the variation across UV seams for the same continuous part, and recheck the full 3D model so local texture detail does not overpower the silhouette, form shading, or part relationships.

## Final grime and weathering

Treat grime/weathering as a final, material- and usage-aware finish after the form-shading, surface-variation, same-part continuity, and part-boundary passes. Apply it per named material or part when the reference, environment, handling, age, or use supports it; record `clean-material exception` when it does not.

Useful masks include inner-to-outer darkening when the design calls for a gradual dirty edge or exposed-area falloff, recess/seam accumulation, lower or contact grime, dust on exposed upward areas, directional streaks, and handling wear. Build the effect with connected near-colour values and a declared spatial span. It may be subtle or strong when the material/use justifies it, but it must remain distinguishable from the part's fixed form shadow and from dynamic runtime lighting.

Do not add an unexplained global vignette, a uniform dark overlay, automatic black borders on every convex edge, or dirt that crosses a true material/part boundary without a reason. Recheck the full 3D model at native and target scale, including before/after or grime-suppressed views, so the finish adds material history without flattening the form, creating halos, or becoming the only source of contrast.

## Deliberate pixel-AA and transparency

Manual pixel-AA is a separate, limited tool. It may soften a selected diagonal or curved boundary, or bridge a controlled tonal transition, with adjacent near-colour steps from the declared ramp as required by the boundary and texture resolution. It must remain grid-aligned and fully opaque on opaque/cutout textures.

Automatic anti-aliasing, blur, linear filtering, fractional alpha, and light/dark halos at transparent edges are forbidden for opaque and cutout textures. Transparent or translucent assets may deviate only when the target format explicitly requires and supports it. Do not apply pixel-AA to every outline or use it to hide a bad silhouette.

## Isolated-pixel gate

Treat a conspicuous singleton pixel as a defect by default. Remove it or merge it into a neighbouring cluster unless it has a documented role, such as a sparkle, eye, tiny emissive point, intentional edge termination, or a specific one-pixel mark. A singleton is not justified merely because it is a different colour.

Use these checks:

- every new colour should belong to a meaningful cluster, shadow band, border, or intentional exception;
- a high-contrast pixel or cluster that attracts attention without improving material, form, or focal point fails;
- a one-pixel endpoint may be valid when it is the intentional end of a larger diagonal, crack, or motif;
- review the raster at native 1:1 and the mapped model at target game/display scale;
- after merging/removing noise, recheck adjacent faces so the whole-model motif and value balance remain intact.

## Initial high-density pass and detail audit

For a finished or release-quality asset, the first texture pass must already target `high/hero` detail. Use `simple`, `prototype`, or `blockout` only when explicitly requested. Do not call a base-only or low-density first pass complete.

`high/hero` is a raster/detail target, not permission to fragment the geometry. Keep the primary and secondary volume plan economical; put fine information into the UV texture unless an added geometric element changes the silhouette, contact, joint, or functional read.

The initial pass must cover every visible texture-bearing face. For each sufficiently large visible face, apply material variation and macro structure, meso breakup, micro accents, edge/contact treatment, face identity, and a smooth form-shading/value transition appropriate to its named part. Smaller faces still need the purposeful variation and form/material cue their UV area supports; only record `not applicable` when the reason is explicit. Build this across all parts before polishing any one face. If the texture size cannot support the target, increase the atlas/UV budget or record the result as a draft; do not silently lower quality.

Keep two targets separate:

- **Texel density:** pixels available per model unit or visible face. A larger PNG does not prove useful detail.
- **Visual detail density:** intentional, readable information at the target scale. Use material breakup, face identity, grain, cracks, stains, wear, damage, edge treatment, smooth form shading/value transitions, controlled near-colour texture noise, and declared stronger stochastic accents where appropriate—not unexplained or unbounded high-contrast specks.

Choose a profile before painting:

- **base:** broad material regions, palette, face-role values, alpha/emission, and major marks;
- **developed:** base plus medium breakup and at least one purposeful local feature on every sufficiently large visible face, with edge/contact treatment where supported;
- **high/hero:** developed plus macro, meso, and micro detail wherever the UV area supports it, distinct face treatment on every visible face, connected smooth form shading with the required tonal resolution, whole-model near-colour texture noise, and no unexplained broad flat areas.

Before painting, create a `texture_coverage_matrix` for every visible face or named part. At minimum, include its UV area/texel budget and a status for base/material variation, smooth form transition, macro, meso, micro, edge/contact, face identity, and continuity. A category may be `not applicable` only with a concrete face-size, material, alpha, or format reason. After painting, mark each category `pass`, `fail`, or justified `not applicable`:

1. material identity and base variation;
2. macro structure or large material regions;
3. meso breakup such as grain, cracks, stains, bands, or wear;
4. micro accents such as clusters, chips, pores, or bright material accents;
5. edge, recess, contact, or underside treatment;
6. face-specific identity and relationship to neighbouring faces;
7. readable form/recess contrast, smooth value-transition, palette-ramp, cluster, and isolated-pixel coherence; fine-noise amplitude is evaluated separately;
8. whole-model near-colour texture-noise coverage and `texture_coverage_matrix` completeness;
9. final grime/weathering coverage or an explicit clean-material exception.

If a face or part fails, name the missing category and add a targeted refinement pass using the existing palette ramps, density, shared lighting convention, part shading profile, surface-variation profile, and material rules. Do not solve it by only enlarging the image, adding unexplained or unbounded high-contrast specks, or scattering meaningless singleton pixels. If stronger stochastic accents are the intended solution, declare and constrain them in the profile, then audit the entire model again at the intended game/display scale; UV-editor-only detail does not satisfy `high/hero`. For small faces where a scale cannot be read, record `not applicable` with the reason and compensate with silhouette, value, or a clear material cue.

## AI texture cleanup

Treat an AI image as a concept draft. Before using it in typed texture operations:

1. remove backgrounds, text, watermarks, lighting halos, accidental semi-transparent pixels, and alpha fringes;
2. crop or map it to the actual UV regions; never assume a front-view illustration is an atlas;
3. reduce colours into named material/face/light roles and construct related near-colour ramps;
4. resize with nearest-neighbour and align marks to integer texels;
5. replace automatic-filter gradients, automatic AA, unexplained or unbounded high-contrast specks, and meaningless conspicuous singleton pixels with connected clusters and intentional near-colour ramps; retain stronger stochastic accents when they have a declared material or focal role and controlled distribution; use as many tonal stages as the part requires rather than forcing a preset ramp, and preserve the required structured near-colour texture noise;
6. preserve the declared final grime/weathering pass or clean-material exception; do not clean away purposeful dirt as noise, and do not add an unbounded dark overlay;
7. inspect `bb_texture_image`, then inspect the mapped model in 3D and rerun the cluster/detail audit.

## Texture versus runtime lighting record

For every strong light or shadow cue, record whether it is:

- **texture-authored:** fixed part form, plane separation, face orientation, material relief, baked contact/underside value, or deliberate near-colour texture noise;
- **runtime-authored:** dynamic cast shadow, moving illumination, time-of-day change, or light interaction that must respond to the scene;
- **both by design:** only when the texture cue is a restrained material/face cue and the runtime effect is a separate dynamic event.

Do not reproduce a reference's baked shadow with an equally strong duplicate runtime cue. Keep the shared lighting convention, each part's shading profiles, compatible palette ramps, controlled near-colour texture noise, and value hierarchy consistent across UV islands without forcing unrelated parts into one gradient.

## Quality record

Record the target format/provider, texture size, texel-density target, palette ramps, shared lighting convention, `part_shading_profile` and `surface_variation_profile` for each applicable named part, alpha/filtering policy, UV-sharing exceptions, same-part edge pairs, part-boundary classifications, `texture_coverage_matrix`, final grime/weathering profiles and clean-material exceptions, detail profile, per-face/part audit, singleton exceptions, pixel-AA regions, texture/runtime lighting split, and the refinement passes performed.
