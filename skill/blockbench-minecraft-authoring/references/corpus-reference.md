# Minecraft texture reference corpus

“All Minecraft textures” is not one timeless folder. The correct reference set is always pinned by Edition, game/resource-pack version, namespace, and source revision. Java and Bedrock must be indexed separately; a current Bedrock sample tree does not prove coverage of every Java release, and a Java client JAR does not prove Bedrock coverage.

## What is available

The bundled helper `scripts/minecraft_texture_corpus.mjs` creates a metadata-only index and retrieves only explicitly selected reference bytes:

```powershell
# Current Mojang Bedrock sample tree; no images are embedded in the Skill.
node scripts/minecraft_texture_corpus.mjs index --ref main --out .cache/bedrock-textures.json

# Search without loading the full index into the model context.
node scripts/minecraft_texture_corpus.mjs query --index .cache/bedrock-textures.json --category blocks --match lantern --limit 40
node scripts/minecraft_texture_corpus.mjs query --index .cache/bedrock-textures.json --category entity --limit 100

# Retrieve only selected images for visual inspection.
node scripts/minecraft_texture_corpus.mjs fetch --index .cache/bedrock-textures.json --match lantern --out .cache/reference-images/lantern --limit 12

# Retrieve a catalog/model metadata file when an identifier must be resolved
# to one or more texture paths. Metadata is opt-in; images remain the default.
node scripts/minecraft_texture_corpus.mjs fetch --index .cache/bedrock-textures.json --path resource_pack/textures/item_texture.json --out .cache/reference-metadata --include-metadata true
```

For Java, use the exact client asset tree belonging to the user's installed version. Point the helper at an extracted client JAR or its `assets` directory:

```powershell
node scripts/minecraft_texture_corpus.mjs index --root <path-to-extracted-java-assets-or-assets-root> --out .cache/java-<version>-textures.json
node scripts/minecraft_texture_corpus.mjs query --index .cache/java-<version>-textures.json --category block --limit 100
node scripts/minecraft_texture_corpus.mjs query --index .cache/java-<version>-textures.json --category entity --limit 100
```

The local index also accepts a Bedrock checkout or a direct `textures` directory. For Java, preserve the exact release in the index/report. If the client JAR is not already available, use the official launcher installation/version metadata rather than an unofficial mirror, and do not silently download or redistribute it.

## Coverage and semantic lookup

The index includes image resources and companion metadata such as `.mcmeta`, `.texture_set.json`, and catalogs where present. Categories include block(s), item(s), entity/entities, particles, UI/GUI, environment, colormap/map, painting, trims, models, and other texture roots. When a logical identifier does not equal a filename, inspect the matching catalog/model metadata first:

- Bedrock blocks/items commonly resolve through `terrain_texture.json`, `blocks.json`, and `item_texture.json`.
- Bedrock entities resolve through entity/client-entity, geometry, and render-controller references.
- Java resources resolve through namespaced `assets/<namespace>/textures`, plus blockstates/models/items and versioned atlas/pack metadata.

Do not infer that one filename represents every face, tint, animation frame, or render mode. Follow the reference chain for the pinned version and keep variant/overlay/companion files associated with the base image.

## AI reference procedure

1. Pin `edition`, `version`, `source`, `ref`, and `tree_sha` (or the local asset revision).
2. Query by asset role and material/family, not only by a famous filename. For an entity, select role-matched body, cutout, eye, and moving-part examples when available.
3. Fetch only the selected files into a temporary, ignored directory. The helper writes `_reference-manifest.json` with source, revision, original path, and retrieved hash.
4. Open the fetched images with the available image viewer at native resolution. Record derived observations—dimensions, alpha, palette roles, occupancy, cluster/edge behaviour, tiling, and companion metadata—not copied pixels.
5. Use multiple same-role references to infer a rule. Never make one block, ore, mob, or item the universal palette or silhouette baseline.
6. Clean the AI draft, map it to the actual UV regions, and run MCP texture/model verification. A reference image can guide style; it cannot replace `bb_texture_image`, `bb_diagnose`, captures, or in-game testing.

The helper deliberately does not bundle Mojang/Microsoft image bytes in the Skill. Keep downloaded bytes temporary and outside release packages. Store only the metadata index, source links, revision identifiers, and derived review notes in durable project records.

## Source boundary

Primary sources:

- [Mojang bedrock-samples](https://github.com/Mojang/bedrock-samples/)
- [Comprehensive Resource Pack Contents](https://learn.microsoft.com/en-us/minecraft/creator/documents/comprehensivepackcontents?view=minecraft-bedrock-stable)
- [Overwriting Vanilla Assets](https://learn.microsoft.com/en-us/minecraft/creator/documents/overwritingassets?view=minecraft-bedrock-stable)
- [Mojang item_texture.json](https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/textures/item_texture.json)
- [Mojang terrain_texture.json](https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/textures/terrain_texture.json)
- [Minecraft Java Edition release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1)

Technical and aesthetic guidance is separate from asset bytes. Use the [Blockbench Minecraft Style Guide](https://blockbench.net/wiki/guides/minecraft-style-guide/) for style decisions, and the live target version for runtime limits.
