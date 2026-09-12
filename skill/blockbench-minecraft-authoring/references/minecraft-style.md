# Minecraft-like model and asset style

Read this reference for Minecraft-like geometry, silhouette, and asset-kind decisions. For raster quality, palette ramps, part-appropriate value transitions, manual pixel-AA, isolated pixels, UV detail, and AI texture cleanup, read [texture-quality.md](texture-quality.md) instead.

## Hard gates

Before calling an asset finished, confirm:

1. The target provider, game version, and output codec are explicit.
2. The silhouette reads before texture detail is added.
3. Every visible face has an intentional material/texture assignment.
4. UV islands stay in bounds, seams are intentional, and texel density is coherent.
5. The declared texture filtering and alpha behavior are supported by the intended runtime.
6. The shared lighting convention agrees between geometry, each part's local shading profile, texture, and runtime lighting.

## Shape and scale

Use simple volumes for the major silhouette and reserve texture for material cues and fine detail. For Minecraft-like cube-oriented work, build curves and circular forms by rotating cuboid elements around a common construction center/pivot. A faceted low-poly profile is often a better fit than a mathematically smooth one; a pentagonal or hexagonal arrangement is a useful starting choice when the silhouette and target scale support it, but it is not a mandatory shape for every curve. Use as many segments as the target resolution, display distance, output format, and intended faceting require—avoid extra segments that do not improve the read. Use a mesh only when the target format explicitly requires a true custom polygon or contour.

Choose resolution from screen size and detail needs, not from a universal “16x16” rule. A simple block may use 16x16; a complex entity may need a larger atlas while retaining a grid-aligned Minecraft-like look. Set dimensions, pivots, hierarchy, and display transforms for the target provider before refining the texture.

## Geometry budget and curve strategy

Keep geometry complexity separate from texture density. `high/hero` describes the amount of readable raster information, not the number of cubes. Start with economical primary and secondary volumes; add a cube only when it changes the silhouette, joint, contact, occlusion, or functional read, and record the reason in the geometry budget.

For a curved silhouette or volume, use rotated cuboids around a shared construction center/pivot. Start with 5 or 6 perimeter directions for a rounded Minecraft-like part when appropriate, duplicate/rotate consistently, and increase the segment count when the silhouette, target scale, output format, or intended faceting benefits from it. A staircase-like result is acceptable when it is deliberate, proportionate, and visually improves the curve; it is not acceptable when it merely inflates geometry, introduces alignment problems, or hides a weak base shape. For a true custom polygon, use a mesh only when the target format explicitly supports and requires it. Inspect the untextured silhouette before adding surface detail.

## Geometry joins and snapping

When cubes or low-poly segments are intended to meet, their shared vertices, edges, or faces must use the same numeric coordinates. Use Blockbench's available grid/vertex/edge snapping during placement, or set exact coordinates when the operation does not expose snapping. For a rotated curve, align every segment to the same construction center/pivot and snap only the contacts that should connect; a small intentional overlap may close a faceted join, but it must be classified, kept free of z-fighting, and not used as a substitute for alignment. Verify the result in orthographic and wireframe/solid views: no hairline gaps, unintended overlaps, floating cubes, or z-fighting may remain at a join. Do not snap away an intentional gap, bevel, rotation, or overlap; classify and record those exceptions. Preserve the chosen 5- or 6-sided silhouette rather than forcing every element onto an unrelated axis.

## Card, plane, and billboard simplification

Use a `card/plane/billboard` representation as an intentional Minecraft-style simplification when the visible identity is primarily a flat silhouette or painted surface: foliage, flags, banners, signs, decals, flat ornaments, sprite-like details, or small/distant props are good candidates. A single textured plane is sufficient when one intended view is enough. Use crossed planes or another supported billboard arrangement only when an additional view is necessary and the target format/provider supports it.

Before choosing this mode, confirm that the asset does not rely on thickness, parallax, close-up edge inspection, contact/occlusion, or an all-around silhouette. Record the plane orientation, intended camera/view, texture-to-plane UV mapping, alpha/cutout or transparency behavior, face culling/double-sided setting, and the views that are intentionally limited. The texture still needs a clean pixel-authored silhouette, material structure, and readable value treatment; a flat plane is not permission to submit a low-density or haloed image. Do not silently replace a volumetric part with a card merely because the texture is easier to make.

## Asset-specific rules

**Blocks:** Treat exposed faces as a tile when the material is intended to tile. Test left/right and top/bottom continuity in a 3×3 arrangement. Keep top, side, and bottom value families related and use restrained motifs such as cracks, bands, pores, or grain.

**Items and weapons:** Keep the silhouette legible at inventory scale. Use transparency intentionally, leave clean margins, and place the strongest contrast at the functional focal point. Use the expected upper-left light convention when matching vanilla-like item art unless the project declares another direction.

**Entities and props:** Establish a readable hierarchy, sensible pivots, and consistent texel density. Keep intended bilateral symmetry. Place seams away from high-attention regions where possible, and inspect joints, eyes, mouths, moving parts, and contact points in the applicable views and animation frames. A useful vanilla-like baseline is brighter top/front and darker underside/back, but the declared project light direction wins.

## Style handoff

When requesting a Minecraft-like asset, state the target provider and format, geometry mode per part (`volumetric`, `rotated-cuboid`, or `card/plane/billboard`), dimensions, coordinate convention, display scale, shared light convention, `part_shading_profile` for visually independent volumetric parts, material motifs, UV regions, and whether the result is `base`, `developed`, or `high/hero`. Then read [texture-quality.md](texture-quality.md) for the raster constraints and [multiview-review.md](multiview-review.md) for validation.
