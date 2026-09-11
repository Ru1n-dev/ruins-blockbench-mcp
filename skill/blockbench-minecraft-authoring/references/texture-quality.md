# Minecraft texture quality gate

Read this reference for any model, UV, texture, material, shading, or AI-texture task. It contains the detailed pixel and surface rules that the short Skill entrypoint routes to.

## UV and whole-model contract

Unwrap/map every texture-bearing face before painting. The default high-quality layout is one intentional in-bounds UV region per face or face role so each surface can receive its own material, brightness, shadow, wear, damage, and pixel placement. UV sharing or mirroring is an explicit exception: use it only when the named faces are intentionally identical in material, lighting, wear, overlays, orientation, texel density, and future edit needs. Record the exact faces and reason. Hidden faces still need intentional mapping when the target format or export can expose them; otherwise record the format-specific reason they are omitted.

Paint after the UV decision. Do not create a flat texture first and force it onto an accidental or shared layout. Reserve enough atlas space for the declared screen-size target and keep texel density coherent. A larger atlas is preferable to losing face-specific information when the target format supports it.

Never approve one face from an isolated UV editor or flat image. Use this pass order:

1. **UV/atlas blueprint:** map all texture-bearing faces, name face roles, set pixels-per-model-unit, orient related islands consistently, and reserve padding/bleed for the runtime filter.
2. **Global base/material pass:** cover every island with the same material family, palette grammar, and broad surface language.
3. **Global lighting convention:** establish the shared light direction, palette/value relationship, and texture-versus-runtime split. This is a rule for interpreting light, not one gradient stretched across the entire model.
4. **Part-local form-shading pass:** for each named soft, curved, or visually independent part, apply its own `part_shading_profile`—local bright/side/dark zones, 3–5 stepped value steps where the area supports them, shadow strength, and contact areas.
5. **Face-specific pass:** add grain, cracks, stains, wear, contact darkening, edge treatment, and unique material cues inside the relevant named part. Do not turn every face border into a shadow.
6. **Same-part continuity pass:** inspect adjacent faces belonging to the same part in the textured 3D view. Align motifs and form shading across an edge, continue grain/damage where geometry implies continuity, match border values, and remove accidental seams.
7. **Part-boundary pass:** inspect distinct parts together. Use a restrained contact/occlusion shadow only where the parts touch or overlap; do not force a texture gradient across a true seam or material boundary.
8. **Whole-model balance:** inspect at the target game/display scale across front, back, sides, top, bottom, and three-quarter views. Strengthen disappearing parts and reduce details that dominate the asset.

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
side transition: <3–5 stepped near-colour values, span, and direction>
dark zone: <underside/recess/contact areas and maximum strength>
contact: <none | named touching part/edge and restrained occlusion>
edge rule: <convex edge no automatic dark line | concave/recess shadow | material boundary>
continuity: <same-part edge pairs to connect | intentional part boundary>
```

Within one continuous part, the local shading flow and motifs must cross its UV seams. Between distinct parts, do not connect gradients just because the parts touch; use a controlled contact shadow or an intentional seam. A convex outer edge does not receive a dark border by default. A concave fold, underside, or contact edge may receive a shadow when the geometry supports it.

The shared light direction is a starting convention, not permission to ignore part shape. A part may use a local shading axis or a small orientation adjustment when its form, rotation, or stylized presentation requires it, but record the exception and keep the palette and shadow strength compatible with the rest of the asset. Never flip light direction independently per face.

## Near-colour ramps and smooth-looking shadows

Use near-colours deliberately when a single base or shadow colour makes a part look flat. Define a small ramp for each material family and part/face role—usually a base, one or two shadow steps, one light step, and an optional highlight/accent—and reuse compatible ramps across the model. Every added shade needs a named purpose such as plane separation, curvature, contact, grain, wear, or a controlled transition. Do not add colours only to inflate the palette count.

Smooth-looking shadow is allowed as a low-frequency pixel-authored transition inside a named part. Build it from broad connected clusters and roughly 3–5 opaque value steps, following the shared convention plus that part's local shading profile and avoiding pillow shading. Fixed material/part shading belongs in the texture; dynamic cast shadows and changing illumination belong to runtime lighting. Never duplicate the same shadow in both layers.

This is not permission for a photographic gradient. Use stepped tonal bands with related colours, not continuous blur. Review broad surfaces at 1:1 and target game scale so the ramp reads as form and material rather than banding or mud.

## Deliberate pixel-AA and transparency

Manual pixel-AA is a separate, limited tool. It may soften a selected diagonal or curved boundary, or bridge a controlled tonal transition, with 1–2 adjacent near-colour steps from the declared ramp. It must remain grid-aligned and fully opaque on opaque/cutout textures.

Automatic anti-aliasing, blur, linear filtering, fractional alpha, and light/dark halos at transparent edges are forbidden for opaque and cutout textures. Transparent or translucent assets may deviate only when the target format explicitly requires and supports it. Do not apply pixel-AA to every outline or use it to hide a bad silhouette.

## Isolated-pixel gate

Treat a conspicuous singleton pixel as a defect by default. Remove it or merge it into a neighbouring cluster unless it has a documented role, such as a sparkle, eye, tiny emissive point, intentional edge termination, or a specific one-pixel mark. A singleton is not justified merely because it is a different colour.

Use these checks:

- every new colour should belong to a meaningful cluster, shadow band, border, or intentional exception;
- a high-contrast pixel that attracts attention without improving material, form, or focal point fails;
- a one-pixel endpoint may be valid when it is the intentional end of a larger diagonal, crack, highlight, or motif;
- review the raster at native 1:1 and the mapped model at target game/display scale;
- after merging/removing noise, recheck adjacent faces so the whole-model motif and value balance remain intact.

## Initial high-density pass and detail audit

For a finished or release-quality asset, the first texture pass must already target `high/hero` detail. Use `simple`, `prototype`, or `blockout` only when explicitly requested. Do not call a base-only or low-density first pass complete.

The initial pass must cover every sufficiently large visible face with the detail scales its UV area and display size support: material variation and macro structure, meso breakup, micro accents, edge/contact treatment, face identity, and broad stepped shading appropriate to its named part. Build this across all parts before polishing any one face. If the texture size cannot support the target, increase the atlas/UV budget or record the result as a draft; do not silently lower quality.

Keep two targets separate:

- **Texel density:** pixels available per model unit or visible face. A larger PNG does not prove useful detail.
- **Visual detail density:** intentional, readable information at the target scale. Use material breakup, face identity, grain, cracks, stains, wear, damage, edge treatment, stepped shadows, and controlled pixel accents—not random noise.

Choose a profile before painting:

- **base:** broad material regions, palette, face-role values, alpha/emission, and major marks;
- **developed:** base plus medium breakup and at least one purposeful local feature on every sufficiently large visible face, with edge/contact treatment where supported;
- **high/hero:** developed plus macro, meso, and micro detail wherever feasible, distinct face treatment, connected stepped shading, and no unexplained broad flat areas.

After the whole-model base and value passes, mark each applicable category `pass`, `fail`, or `not applicable` for every visible face or named part:

1. material identity and base variation;
2. macro structure or large material regions;
3. meso breakup such as grain, cracks, stains, bands, or wear;
4. micro accents such as clusters, chips, pores, or highlights;
5. edge, recess, contact, or underside treatment;
6. face-specific identity and relationship to neighbouring faces;
7. palette-ramp, cluster, stepped-shadow, and isolated-pixel coherence.

If a face or part fails, name the missing category and add a targeted refinement pass using the existing palette ramps, density, shared lighting convention, part shading profile, and material rules. Do not solve it by only enlarging the image, adding noise, or scattering singleton pixels. Audit the entire model again and inspect at the intended game/display scale; UV-editor-only detail does not satisfy `high/hero`. For small faces where a scale cannot be read, record `not applicable` and compensate with silhouette, value, or a clear material cue.

## AI texture cleanup

Treat an AI image as a concept draft. Before using it in typed texture operations:

1. remove backgrounds, text, watermarks, lighting halos, accidental semi-transparent pixels, and alpha fringes;
2. crop or map it to the actual UV regions; never assume a front-view illustration is an atlas;
3. reduce colours into named material/face/light roles and construct related near-colour ramps;
4. resize with nearest-neighbour and align marks to integer texels;
5. replace continuous gradients, automatic AA, noisy micro-detail, and meaningless conspicuous singleton pixels with connected clusters and stepped ramps;
6. inspect `bb_texture_image`, then inspect the mapped model in 3D and rerun the cluster/detail audit.

## Texture versus runtime lighting record

For every strong light or shadow cue, record whether it is:

- **texture-authored:** fixed part form, plane separation, face orientation, material relief, baked contact/underside value, or a style-specific highlight;
- **runtime-authored:** dynamic cast shadow, moving illumination, time-of-day change, or light interaction that must respond to the scene;
- **both by design:** only when the texture cue is a restrained material/face cue and the runtime effect is a separate dynamic event.

Do not reproduce a reference's baked shadow with an equally strong runtime shadow. Keep the shared lighting convention, each part's shading profile, compatible palette ramps, and value hierarchy consistent across UV islands without forcing unrelated parts into one gradient.

## Quality record

Record the target format/provider, texture size, texel-density target, palette ramps, shared lighting convention, `part_shading_profile` for each named part, alpha/filtering policy, UV-sharing exceptions, same-part edge pairs, part-boundary classifications, detail profile, per-face/part audit, singleton exceptions, pixel-AA regions, texture/runtime lighting split, and the refinement passes performed.
