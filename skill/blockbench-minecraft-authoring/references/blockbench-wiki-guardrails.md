# Blockbench Wiki guardrails

This reference condenses the applicable material from the official Blockbench Wiki and the public BB Academy tutorials. It is a decision aid, not a replacement for the live Blockbench 5.1.6 implementation, MCP schemas, or target game documentation.

## Format routing

Choose from the final runtime:

| Final use | Starting format | Main boundary to verify |
|---|---|---|
| Java block/item JSON | Java Block/Item | size, cube rotations, display transforms, UV mode |
| Bedrock geometry/animation JSON | Bedrock Model | geometry and bone names, client entity wiring, Molang/controllers |
| Older Bedrock data | Bedrock Legacy | legacy schema and conversion loss |
| Java mod entity class | Modded Entity | target mod API and version |
| OptiFine CEM | Entity `.jem` / Part `.jpm` | integer constraints, part hierarchy, CEM loader support |
| GeckoLib mod | GeckoLib Model | installed GeckoLib and exporter/importer version |
| Game-independent mesh | Generic Model | downstream importer, materials, animation, topology |

Do not use Generic merely because it is convenient if the final codec has constraints Generic does not model. Java Block/Item restrictions include a 3×3×3 block region, cube-only structure, and no bone rotation; before Java 1.21.6, cube rotation angles are restricted to 22.5-degree increments. A UI setting that removes a limit does not change the game runtime, and the target version must be checked because these limits can change.

## Shape, transform, and UV

Blockbench's Edit, Paint, Animate, and Display areas solve different problems. X is width, Y height, and Z depth in the standard Minecraft convention; one block is normally 16 model units. Parent hierarchy should follow the part's movement, such as body → upper limb → lower limb → hand. Put pivots at joints or intentional rotation centres, not automatically at the mesh centre.

Before transforming a rotated part, decide whether the operation is in Global, Parent, or Local space. Use Vertex Snap for deliberate joins. Remove coplanar overlaps that cause z-fighting; changing both faces to the same colour is not a structural fix. Inflating a cube can preserve UV intent, but check the resulting silhouette and bounds.

Box UV and per-face UV are not interchangeable. Cube rotations can change face correspondence. Use bone/group rotation when several parts should rotate together. Keep UV islands within the image, plan seams at low-attention edges, and keep texel density consistent across adjacent parts. Check the final model from at least front, side, and back; inspect hidden surfaces that become visible in animation or display views.

## Minecraft-like appearance

The official Minecraft Style Guide and BB Academy's style material are best treated as an aesthetic target, not a legal or technical requirement. Apply them only when the user requests a Minecraft-like result:

- use geometry for silhouette and texture for material/detail;
- translate smooth forms into clean, simple volumes instead of many tiny rotated elements;
- keep texel density coherent and avoid mixels;
- build a base colour, shadow family, and highlight family with purposeful clusters;
- look for noise, banding, pillow shading, pancake shading, unnecessary dithering, and jagged outlines;
- for blocks, test tiling early in a 3×3 arrangement when the texture should tile;
- for items, preserve a readable 16×16-scale silhouette and the expected upper-left light convention;
- for entities, keep intended symmetry, readable joints, and a consistent top/front-light relationship.

Avoid treating a tutorial's exact dimensions, shortcut, or personal preference as a universal Minecraft rule. If the requested style is custom, preserve the user's art direction and use only the format/technical constraints.

## Animation and Bedrock runtime

Keep bone names unique and stable when animations or existing controllers depend on them. A root bone is useful for whole-model motion. For Bedrock, geometry names, client entity identifiers, `scripts.animate`, animation controllers, sound/particle effect names, and resource locations must agree. A condition in `scripts.animate` is a blend amount, not necessarily a one-shot trigger; use controller state transitions for re-triggerable actions.

Molang expressions return numbers, use degrees for trigonometry, and distinguish runtime `q.anim_time` from Blockbench's editor `time`. A single key plus an expression can drive a channel in Blockbench, but interpolation combinations and downstream formats differ. Bake expressions to keys when the target format cannot carry them. Treat preview sounds/particles as local preview setup, not proof of game registration.

## `.bbmodel` and plugin/API boundaries

`.bbmodel` is a JSON-based internal project format, not a fully stable exchange specification. Preserve unknown fields and use a small model saved by the target Blockbench version as a fixture. In 5.0, group definitions and the `outliner` hierarchy are separate; do not read one as if it contained all properties. Per-texture `uv_width`/`uv_height` can matter independently of the project resolution. Check old keyframe sign corrections and avoid applying a conversion twice.

For plugin or extension work, prefer current API Reference docs and target-version types/source over old Wiki snippets. Pair changes with the correct `Undo.initEdit`/`Undo.finishEdit` aspects, including texture bitmap or UV aspects where applicable. Store and remove listeners/actions/drag handlers across load/unload. Handle desktop/Web differences explicitly and do not assume native filesystem modules exist in Web builds.

## Export and review

Use glTF/GLB when hierarchy, animation, and materials need a portable interchange path; FBX/DAE/OBJ have different importer and preservation tradeoffs. OBJ is not an animation-preserving interchange. Check triangulation, vertex splitting, texture filtering, alpha mode, back-face culling, and axis/UV direction after import. A Blockbench preview, external render, saved file, and in-game result are separate evidence levels.

Primary references:

- [Blockbench Formats](https://blockbench.net/wiki/blockbench/formats/)
- [Blockbench Overview & Tips](https://blockbench.net/wiki/guides/blockbench-overview-tips/)
- [Minecraft Style Guide](https://blockbench.net/wiki/guides/minecraft-style-guide/)
- [Bedrock Modeling and Animation](https://blockbench.net/wiki/guides/bedrock-modeling/)
- [Animation Expressions](https://blockbench.net/wiki/guides/animation-expressions/)
- [The `.bbmodel` format](https://blockbench.net/wiki/docs/bbmodel/)
- [Blockbench API Reference](https://web.blockbench.net/docs/)
- [3D Export](https://blockbench.net/wiki/guides/export-formats/)
- [Creating a Plugin](https://blockbench.net/wiki/docs/plugin/)
- [Undo](https://blockbench.net/wiki/docs/undo/)
