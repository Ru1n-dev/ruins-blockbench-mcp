# Blockbench multi-view review

## Geometry integrity gate

Treat accidental floating elements, unsupported protrusions, unsnapped intended contacts, and gaps at intended connections as hard review failures. Confirm every element's support/attachment relation—or its explicitly recorded intentional-detached status—in orthographic and wireframe/solid views. A piece that only appears connected from one camera must be repaired before texture, animation, or export approval.

Read this reference before final 3D review or export. A single attractive three-quarter screenshot is not completion evidence.

## Required structural views

For every 3D model, create a named checklist and inspect the same project revision in:

1. front;
2. back;
3. left;
4. right;
5. top;
6. bottom;
7. three-quarter/isometric.

If a view is genuinely not visible in the target use, mark it `not applicable` with a reason. Do not omit it merely because the default camera hides it. Use capability-discovered `bb_capture` or preview operations when available.

## Asset-specific views

| Asset kind | Additional views/checks |
|---|---|
| Block | top/bottom treatment, all side faces, 3×3 tiled neighbours, repeated-border seams, and transparent/cutout faces |
| Item/weapon | first-person, third-person, GUI, ground, item-frame/display, handedness, and rotation |
| Entity/creature | front/side/back and three-quarter silhouette, top/bottom where visible, neutral pose, major animated poses, and exposed faces after limb motion |
| Prop/furniture | interaction-facing view, rear/underside, attachment/contact points, orientation, and placement variants |
| Card/plane/billboard | intended front/working view, edge-on thickness/culling check, backface or alternate view when relevant, and the alpha/cutout boundary |
| Animated model | start, middle, end, loop seam, extreme rotations, and texture exposure during motion; use animation-frame inspection when available |

## What to inspect in every view

Check each named part independently and then check its relationship to neighbouring parts: geometry silhouette, gaps/overlaps, z-fighting, pivot behavior, UV stretching, seams, accidental mirrors, alpha/culling, shared lighting-convention consistency, part-local bright/side/dark flow with smooth connected transitions, whole-model surface-variation coverage without unexplained or unbounded high-contrast specks and scatter, prominent isolated pixels, and details that disappear at target scale. For curved or soft parts, confirm the silhouette is not an unintentional stair-step cube approximation, that rotated cuboids share the intended construction center/pivot, that any 5- or 6-sided faceting is deliberate and readable, and that the geometry budget supports the intended form. For every intended cube/segment join, confirm shared vertices/edges/faces are numerically aligned and inspect for hairline gaps, floating pieces, unintended overlaps, or z-fighting in orthographic and wireframe/solid views. For `card/plane/billboard` parts, inspect the intended painted silhouette at target scale, edge-on behavior, backface/culling, alpha/cutout boundary, and any declared view limitation; do not judge the card as a volumetric model in views it intentionally does not support. Also inspect the final grime/weathering pattern for declared direction, region, strength, transition span, material/use plausibility, and absence of an unexplained global vignette or duplicated form shadow. Also perform a noise-suppressed or grayscale check to confirm that local form shading remains readable without surface variation. For textures inspect whether same-part UV detail and form shading remain coherent across adjacent faces, whether any stronger stochastic accents match their recorded purpose, region, density, and distribution, whether part boundaries use the correct contact/material rule, and whether runtime lighting duplicates a baked cue.

If a problem is found, return to the responsible layer—geometry, pivot, UV, texture, animation, or display transform—then repeat the affected views rather than approving only the corrected camera.

## Evidence record

Record:

- model revision/checkpoint used for captures;
- every structural and asset-specific view with `pass`, `fail`, or `not applicable` reason;
- any `bb_diagnose`, `bb_texture_image`, UV inspection, animation-frame, export, or in-game checks;
- unresolved views or runtime behaviors that were not tested;
- whether the result was reviewed at native texture scale, target game/display scale, and the intended lighting/filtering setup.
