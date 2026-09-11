# Minecraft-like model and asset style

Read this reference for Minecraft-like geometry, silhouette, and asset-kind decisions. For raster quality, palette ramps, stepped shadows, manual pixel-AA, isolated pixels, UV detail, and AI texture cleanup, read [texture-quality.md](texture-quality.md) instead.

## Hard gates

Before calling an asset finished, confirm:

1. The target provider, game version, and output codec are explicit.
2. The silhouette reads before texture detail is added.
3. Every visible face has an intentional material/texture assignment.
4. UV islands stay in bounds, seams are intentional, and texel density is coherent.
5. The declared texture filtering and alpha behavior are supported by the intended runtime.
6. The shared lighting convention agrees between geometry, each part's local shading profile, texture, and runtime lighting.

## Shape and scale

Use simple volumes for the major silhouette and reserve texture for material cues and fine detail. Do not build a smooth sphere, cylinder, or diagonal by accumulating many tiny nearly coplanar cubes. Use a deliberate rotated element or bone when the target format supports it.

Choose resolution from screen size and detail needs, not from a universal “16x16” rule. A simple block may use 16x16; a complex entity may need a larger atlas while retaining a grid-aligned Minecraft-like look. Set dimensions, pivots, hierarchy, and display transforms for the target provider before refining the texture.

## Asset-specific rules

**Blocks:** Treat exposed faces as a tile when the material is intended to tile. Test left/right and top/bottom continuity in a 3×3 arrangement. Keep top, side, and bottom value families related and use restrained motifs such as cracks, bands, pores, or grain.

**Items and weapons:** Keep the silhouette legible at inventory scale. Use transparency intentionally, leave clean margins, and place the strongest contrast at the functional focal point. Use the expected upper-left light convention when matching vanilla-like item art unless the project declares another direction.

**Entities and props:** Establish a readable hierarchy, sensible pivots, and consistent texel density. Keep intended bilateral symmetry. Place seams away from high-attention regions where possible, and inspect joints, eyes, mouths, moving parts, and contact points in the applicable views and animation frames. A useful vanilla-like baseline is brighter top/front and darker underside/back, but the declared project light direction wins.

## Style handoff

When requesting a Minecraft-like asset, state the target provider and format, dimensions, coordinate convention, display scale, shared light convention, `part_shading_profile` for visually independent parts, material motifs, UV regions, and whether the result is `base`, `developed`, or `high/hero`. Then read [texture-quality.md](texture-quality.md) for the raster constraints and [multiview-review.md](multiview-review.md) for validation.
