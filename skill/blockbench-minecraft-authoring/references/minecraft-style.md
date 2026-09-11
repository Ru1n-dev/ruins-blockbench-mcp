# Minecraft-like model and texture rules

Minecraft style is a constraint system, not merely a low-resolution filter. The model, UV layout, raster grid, palette, lighting, and target resource-pack format must agree. This guide combines the official Blockbench Minecraft Style Guide with the execution constraints of Ruin's BlockBenchMCP.

## Hard gates

Before calling an asset finished, confirm:

1. The target provider, game version, and output codec are explicit.
2. The silhouette reads before texture detail is added.
3. Every visible face has an intentional material/texture assignment.
4. UV islands stay inside the image, seams are intentional, and texel density is coherent.
5. Texture filtering is nearest-neighbour in the intended runtime; there is no unintended automatic antialiasing, blur, or semi-transparent fringe. Deliberate opaque pixel-AA is allowed only as a declared, limited transition using nearby palette colours.
6. The palette has deliberate value steps and the light direction agrees between geometry and pixels.

## Shape and raster construction

Use simple volumes for the major silhouette and reserve texture for material cues and fine detail. Do not build a smooth sphere, cylinder, or diagonal by accumulating many tiny nearly coplanar cubes. If a tilt or bend is important, use a deliberate rotated element or bone within the target format's limits.

Choose resolution from screen size and detail needs, not from a universal “16x16” rule. A simple block may use 16x16; a complex entity may need a larger atlas while retaining a low-frequency, grid-aligned look. Resize with nearest-neighbour, draw on integer coordinates, and keep important marks away from unsafe transparent edges.

Build pixels as clusters:

- start with a base fill;
- add a related shadow family and light family using named near-colour ramps;
- place large material regions before accents;
- use connected stepped shadows, selective highlights, and broad value transitions to avoid flat surfaces;
- reserve the darkest values for cavities, contact shadows, and outlines only where they improve separation.

Avoid random noise, continuous/blurred gradients, noisy AI micro-detail, excessive one-pixel outlines, meaningless conspicuous singleton pixels, and dither that competes with the material pattern. Manual pixel-AA may be used only for selected diagonal/curved or tonal transitions, with 1–2 nearby opaque shades from the declared ramp. Review for banding, pillow shading, pancake shading, and jaggies.

## Asset-specific rules

**Blocks:** Treat exposed faces as a tile when the material is intended to tile. Test left/right and top/bottom continuity early, ideally in a 3×3 arrangement. Keep top, side, and bottom value families related and use a restrained motif such as cracks, bands, pores, or grain.

**Items and weapons:** Keep the silhouette legible at inventory scale. Use transparency intentionally, leave clean margins, and place the strongest contrast at the functional focal point. Use the expected upper-left light convention when matching vanilla-like item art, unless the project declares another lighting direction.

**Entities and props:** Establish a readable hierarchy, sensible pivots, and consistent texel density. Keep bilateral symmetry where intended. Place seams away from high-attention regions when possible, and inspect joints, eyes, mouths, and moving parts in animation frames. A useful vanilla-like baseline is brighter top/front and darker underside/back, but the declared project light direction wins.

## AI texture draft pipeline

An AI image is a concept draft, not a final resource-pack texture. Before sending it through typed MCP texture operations:

1. Remove backgrounds, text, watermarks, lighting halos, and accidental semi-transparent pixels.
2. Crop or map it to the actual UV regions; do not assume a front-view illustration is an atlas.
3. Reduce the palette into named roles: base, shadow, highlight, accent, and transparent.
4. Resize with nearest-neighbour and align marks to integer texels.
5. Replace continuous gradients, automatic antialiasing, noisy micro-detail, and meaningless singleton pixels with purposeful near-colour clusters and stepped ramps.
6. Inspect with `bb_texture_image`, then verify the mapped model with captures and diagnosis.

## Prompt/brief template

```text
Minecraft-style [block/item/entity] texture for [Java/Bedrock/other provider].
Use a [width]x[height] pixel grid, nearest-neighbour pixel art, hard-edged
clustered pixels, purposeful near-colour ramps, and a single light direction
from [direction]. Include [material motifs] and broad stepped shading so no
large surface is flat. Preserve readable face regions, clean transparency
where needed, no automatic/filter anti-aliasing, no blur, no continuous
gradient, no meaningless singleton pixels, no photorealism, no PBR noise,
no text, no watermark, and no background. Allow only declared manual pixel-AA
with adjacent opaque ramp colours at selected diagonal/curved transitions.
The UV layout is [atlas/face regions/islands], so keep the important motif in
these regions: [regions].
```

The prompt is not a validator. Compare the result to the model's UV layout and run the MCP checks.
