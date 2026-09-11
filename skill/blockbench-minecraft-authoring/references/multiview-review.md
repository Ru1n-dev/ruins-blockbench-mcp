# Blockbench multi-view review

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
| Animated model | start, middle, end, loop seam, extreme rotations, and texture exposure during motion; use animation-frame inspection when available |

## What to inspect in every view

Check each named part independently and then check its relationship to neighbouring parts: geometry silhouette, gaps/overlaps, z-fighting, pivot behavior, UV stretching, seams, accidental mirrors, alpha/culling, shared lighting-convention consistency, part-local bright/side/dark flow, connected form shading and value transitions, highlight integration without floating patches or automatic outlines, whole-model near-colour variation without salt-and-pepper noise, prominent isolated pixels, and details that disappear at target scale. For textures also inspect whether same-part UV detail, form shading, and highlights remain coherent across adjacent faces, whether part boundaries use the correct contact/material rule, and whether runtime lighting duplicates a baked cue.

If a problem is found, return to the responsible layer—geometry, pivot, UV, texture, animation, or display transform—then repeat the affected views rather than approving only the corrected camera.

## Evidence record

Record:

- model revision/checkpoint used for captures;
- every structural and asset-specific view with `pass`, `fail`, or `not applicable` reason;
- any `bb_diagnose`, `bb_texture_image`, UV inspection, animation-frame, export, or in-game checks;
- unresolved views or runtime behaviors that were not tested;
- whether the result was reviewed at native texture scale, target game/display scale, and the intended lighting/filtering setup.
