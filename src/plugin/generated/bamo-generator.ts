// @ts-nocheck
// Compatibility implementation for the BAMO provider format.
// Original BAMO authors retain their copyright. Do not edit this generated file.
export const BAMO_DEFAULTS = {
  displayName: "",
  namespace: "bamo",
  version: "1.20.1",
  typeList: [],
  material: "Dirt",
  blastRes: 6,
  slip: 0.6,
  gravity: false,
  rotType: "default",
  sounds: "Grass",
  lum: 0,
  maxStack: 64,
  fireproof: true,
  creativeTab: "Building Blocks",
  transparency: "Solid",
  blockType: "Default",
  types: {
    custom: true,
    customType: "Default",
    block: false,
    stair: false,
    slab: false,
    wall: false,
  },
  variant: {
    default: { all: "" },
    stair: { top: "", bottom: "", side: "", particle: "" },
    slab: { top: "", bottom: "", side: "", particle: "" },
    wall: { wall: "", particle: "" },
  },
  particles: false,
  particleType: "Rain",
  particlePos: { x: 8, y: 8, z: 8 },
  particleSpread: { x: 1, y: 1, z: 1 },
  particleVel: { x: 0.1, y: 0.1, z: 0.1 },
  bufferedHitbox: true,
  hitboxBuffer: 0.5,
  genScRecipe: true,
  genReversableScRecipe: true,
  animated: false,
};
export async function generateBamoZip(b, properties) {
  const { Texture, Format, JSZip, Blockbench } = b;
  const textureFolder = properties.version === "1.20.1" ? "block" : "blocks";
  const texturePath = (tx) =>
    "assets/" +
    (tx.namespace || properties.namespace) +
    "/textures/" +
    (tx.namespace ? tx.folder : textureFolder) +
    "/" +
    cleanFileName(tx.name);
  function genStairState(namespace, model, outer, inner) {
    return `
    {
        "variants": {
            "facing=east,half=bottom,shape=straight": { "model": "${namespace}:${model}" },
            "facing=west,half=bottom,shape=straight": { "model": "${namespace}:${model}", "y": 180, "uvlock": true },
            "facing=south,half=bottom,shape=straight": { "model": "${namespace}:${model}", "y": 90, "uvlock": true },
            "facing=north,half=bottom,shape=straight": { "model": "${namespace}:${model}", "y": 270, "uvlock": true },

            "facing=east,half=top,shape=straight": { "model": "${namespace}:${model}", "x": 180, "uvlock": true },
            "facing=west,half=top,shape=straight": { "model": "${namespace}:${model}", "x": 180, "y": 180, "uvlock": true },
            "facing=south,half=top,shape=straight": { "model": "${namespace}:${model}", "x": 180, "y": 90, "uvlock": true },
            "facing=north,half=top,shape=straight": { "model": "${namespace}:${model}", "x": 180, "y": 270, "uvlock": true },
            
            "facing=east,half=bottom,shape=outer_right": { "model": "${namespace}:${outer}" },
            "facing=west,half=bottom,shape=outer_right": { "model": "${namespace}:${outer}", "y": 180, "uvlock": true },
            "facing=south,half=bottom,shape=outer_right": { "model": "${namespace}:${outer}", "y": 90, "uvlock": true },
            "facing=north,half=bottom,shape=outer_right": { "model": "${namespace}:${outer}", "y": 270, "uvlock": true },

            "facing=east,half=bottom,shape=outer_left": { "model": "${namespace}:${outer}", "y": 270, "uvlock": true },
            "facing=west,half=bottom,shape=outer_left": { "model": "${namespace}:${outer}", "y": 90, "uvlock": true },
            "facing=south,half=bottom,shape=outer_left": { "model": "${namespace}:${outer}" },
            "facing=north,half=bottom,shape=outer_left": { "model": "${namespace}:${outer}", "y": 180, "uvlock": true },

            "facing=east,half=bottom,shape=inner_right": { "model": "${namespace}:${inner}" },
            "facing=west,half=bottom,shape=inner_right": { "model": "${namespace}:${inner}", "y": 180, "uvlock": true },
            "facing=south,half=bottom,shape=inner_right": { "model": "${namespace}:${inner}", "y": 90, "uvlock": true },
            "facing=north,half=bottom,shape=inner_right": { "model": "${namespace}:${inner}", "y": 270, "uvlock": true },

            "facing=east,half=bottom,shape=inner_left": { "model": "${namespace}:${inner}", "y": 270, "uvlock": true },
            "facing=west,half=bottom,shape=inner_left": { "model": "${namespace}:${inner}", "y": 90, "uvlock": true },
            "facing=south,half=bottom,shape=inner_left": { "model": "${namespace}:${inner}" },
            "facing=north,half=bottom,shape=inner_left": { "model": "${namespace}:${inner}", "y": 180, "uvlock": true },
           
            "facing=east,half=top,shape=outer_left": { "model": "${namespace}:${outer}", "x": 180, "uvlock": true },
            "facing=west,half=top,shape=outer_left": { "model": "${namespace}:${outer}", "x": 180, "y": 180, "uvlock": true },
            "facing=south,half=top,shape=outer_left": { "model": "${namespace}:${outer}", "x": 180, "y": 90, "uvlock": true },
            "facing=north,half=top,shape=outer_left": { "model": "${namespace}:${outer}", "x": 180, "y": 270, "uvlock": true },

            "facing=east,half=top,shape=outer_right": { "model": "${namespace}:${outer}", "x": 180, "y": 90, "uvlock": true },
            "facing=west,half=top,shape=outer_right": { "model": "${namespace}:${outer}", "x": 180, "y": 270, "uvlock": true },
            "facing=south,half=top,shape=outer_right": { "model": "${namespace}:${outer}", "x": 180, "y": 180, "uvlock": true },
            "facing=north,half=top,shape=outer_right": { "model": "${namespace}:${outer}", "x": 180, "uvlock": true },

            "facing=east,half=top,shape=inner_left": { "model": "${namespace}:${inner}", "x": 180, "uvlock": true },
            "facing=west,half=top,shape=inner_left": { "model": "${namespace}:${inner}", "x": 180, "y": 180, "uvlock": true },
            "facing=south,half=top,shape=inner_left": { "model": "${namespace}:${inner}", "x": 180, "y": 90, "uvlock": true },
            "facing=north,half=top,shape=inner_left": { "model": "${namespace}:${inner}", "x": 180, "y": 270, "uvlock": true },

            "facing=east,half=top,shape=inner_right": { "model": "${namespace}:${inner}", "x": 180, "y": 90, "uvlock": true },
            "facing=west,half=top,shape=inner_right": { "model": "${namespace}:${inner}", "x": 180, "y": 270, "uvlock": true },
            "facing=south,half=top,shape=inner_right": { "model": "${namespace}:${inner}", "x": 180, "y": 180, "uvlock": true },
            "facing=north,half=top,shape=inner_right": { "model": "${namespace}:${inner}", "x": 180, "uvlock": true }
        }
    }`;
  }

  function genWallState(namespace, post, side, tall) {
    return `{
        "multipart":[
            {"when":{"up":"true"},"apply":{"model":"${namespace}:${post}"}},
            {"when":{"north":"low"},"apply":{"model":"${namespace}:${side}","uvlock":true}},
            {"when":{"east":"low"},"apply":{"model":"${namespace}:${side}","y":90,"uvlock":true}},
            {"when":{"south":"low"},"apply":{"model":"${namespace}:${side}","y":180,"uvlock":true}},
            {"when":{"west":"low"},"apply":{"model":"${namespace}:${side}","y":270,"uvlock":true}},
            {"when":{"north":"tall"},"apply":{"model":"${namespace}:${tall}","uvlock":true}},
            {"when":{"east":"tall"},"apply":{"model":"${namespace}:${tall}","y":90,"uvlock":true}},
            {"when":{"south":"tall"},"apply":{"model":"${namespace}:${tall}","y":180,"uvlock":true}},
            {"when":{"west":"tall"},"apply":{"model":"${namespace}:${tall}","y":270,"uvlock":true}}
        ]
    }`;
  }
  function genLootTable(namespace, block) {
    return `{
    "type": "minecraft:block",
    "pools": [
        {
            "rolls": 1,
            "entries": [
                {
                    "type": "minecraft:item",
                    "name": "${namespace}:${block}"
                }
            ],
            "conditions": []
        }
    ]
}`;
  }

  function genMineableTag(namespace, block, variants) {
    if (variants.length == 0) {
      return `{
    "replace": false,
    "values": [
        "${namespace}:${block}"
    ]
}`;
    } else {
      var tagValues = [`${namespace}:${block}`];
      variants.forEach(function (v) {
        tagValues.push(`${namespace}:${block}_${v}`);
      });

      var data = {
        replace: false,
        values: tagValues,
      };

      return JSON.stringify(data);
    }
  }

  function genStonecuttingRecipes(properties, blockName, dataFolder, zip) {
    if (properties.genScRecipe) {
      var stData = genStonecuttingRecipe(properties.namespace, blockName);
      var stDir = dataFolder + properties.namespace + "\\recipes\\";

      zip.file(
        "data/" + properties.namespace + "/recipes/" + blockName + ".json",
        stData,
      );
    }

    if (properties.genReversableScRecipe) {
      var stData = genStonecuttingReverseRecipe(
        properties.namespace,
        blockName,
      );
      var stDir = dataFolder + properties.namespace + "\\recipes\\";

      zip.file(
        "data/" + properties.namespace + "/recipes/" + blockName + "_rv.json",
        stData,
      );
    }
  }

  function genStonecuttingRecipe(namespace, block) {
    return `
    {
        "type": "minecraft:stonecutting",
        "ingredient": {
            "item": "bamo:bamo_crate"
        },
        "result": "${namespace}:${block}",
        "count": 1
    }`;
  }

  function genStonecuttingReverseRecipe(namespace, block) {
    return `
    {
        "type": "minecraft:stonecutting",
        "ingredient": {
            "item": "${namespace}:${block}"
        },
        "result": "bamo:bamo_crate",
        "count": 1
    }`;
  }
  function dictFromTexture(image, ns) {
    const tx = Texture.all.find(
      (tx) => tx.name === image || (image === "particle" && tx.particle),
    );
    if (!tx) throw new Error("BAMO texture reference is missing: " + image);
    return (
      (tx.namespace || ns) +
      ":" +
      (tx.namespace ? tx.folder : textureFolder) +
      "/" +
      cleanFileName(tx.name.replace(/\.[^.]+$/, ""))
    );
  }

  function cleanFileName(name) {
    return name
      .replace(/[^a-zA-Z\d\s._]/g, "")
      .replace(/\s+/g, "_")
      .toLowerCase();
  }
  const generate = async function () {
    // Ensure a name is set
    if (this.properties.displayName == "") {
      this.error = "name";
      return;
    }

    // Ensure a particle texture is set
    var part = false;
    Texture.all.forEach(function (tx) {
      if (tx.particle == true) {
        part = true;
      }
    });

    if (part == false) {
      Blockbench.showMessageBox({
        buttons: ["Ok"],
        title: "Error",
        message: "Please ensure you have set a particle texture",
      });
      return;
    }

    var zip = new JSZip();

    // Trim invalid chars from the name
    var packName = cleanFileName(this.properties.displayName);

    // Define folder locations
    var objFolder = "" + "\\bamopacks\\" + packName + "\\objects\\";
    var blockstatesFolder =
      "" +
      "\\bamopacks\\" +
      packName +
      "\\assets\\" +
      this.properties.namespace +
      "\\blockstates\\";
    var blockModelsFolder =
      "" +
      "\\bamopacks\\" +
      packName +
      "\\assets\\" +
      this.properties.namespace +
      "\\models\\block\\";
    var itemModelsFolder =
      "" +
      "\\bamopacks\\" +
      packName +
      "\\assets\\" +
      this.properties.namespace +
      "\\models\\item\\";
    var dataFolder = "" + "\\bamopacks\\" + packName + "\\data\\";
    var blockTextureFolderVersion =
      this.properties.version == "1.20.1" ? "block" : "blocks";
    var blockTexturesFolder =
      "" +
      "\\bamopacks\\" +
      packName +
      "\\assets\\" +
      this.properties.namespace +
      "\\textures\\" +
      blockTextureFolderVersion +
      "\\";

    // Create the folders if they dont exist
    var folderList = [
      objFolder,
      blockstatesFolder,
      blockModelsFolder,
      itemModelsFolder,
      blockTexturesFolder,
      dataFolder,
    ];

    // Create mcmeta file
    // Format ID is 15 for 1.20.1, 8 for 1.18.2, and 6 for 1.16.5
    var formatID =
      this.properties.version == "1.20.1"
        ? 15
        : this.properties.version == "1.18.2"
          ? 8
          : 6;
    var mcmetaData = {
      pack: {
        pack_format: formatID,
        description: "Resource Pack for BAMO test files",
      },
    };

    zip.file("pack.mcmeta", JSON.stringify(mcmetaData));

    // Generate block name from the displayname
    var blockName = cleanFileName(this.properties.displayName);

    //generate the list of blocks to be exported
    var blockList = [];

    var codecData = Format.codec.compile();

    // Custom Block
    if (this.properties.types.custom) {
      // Pull the model data from the codec
      var modelData = JSON.parse(codecData);
      modelData["parent"] = "block/block";

      var stateData = "";
      // Create blockstates data
      if (this.properties.rotType == "y_axis") {
        stateData = JSON.stringify({
          variants: {
            "facing=north": {
              model: this.properties.namespace + ":block/" + blockName,
            },
            "facing=east": {
              model: this.properties.namespace + ":block/" + blockName,
              y: 90,
            },
            "facing=south": {
              model: this.properties.namespace + ":block/" + blockName,
              y: 180,
            },
            "facing=west": {
              model: this.properties.namespace + ":block/" + blockName,
              y: 270,
            },
          },
        });
      } else {
        stateData = JSON.stringify({
          variants: {
            "": { model: this.properties.namespace + ":block/" + blockName },
          },
        });
      }

      var textureData = {};

      // Setup texture dict
      ns = this.properties.namespace;
      Object.keys(modelData.textures).forEach((key) => {
        var comp;
        var partCheck;
        if (typeof modelData.textures[key] === "object") {
          comp = modelData.textures[key]["id"];
          partCheck = modelData.textures[key].particle;
        } else if (typeof modelData.textures[key] === "string") {
          comp = key;
          partCheck = key == "particle";
        }

        Texture.all.forEach(function (tx) {
          if (tx.id == comp || (partCheck && tx.particle == true)) {
            if (tx.namespace == "") {
              textureData[key] =
                ns +
                ":" +
                blockTextureFolderVersion +
                "/" +
                cleanFileName(tx.name.replace(/\.[^.]+$/, ""));
            } else {
              textureData[key] =
                tx.namespace +
                ":" +
                tx.folder +
                "/" +
                cleanFileName(tx.name.replace(/\.[^.]+$/, ""));
            }
          }
        });
      });

      // Looting file
      var lootData = genLootTable(this.properties.namespace, blockName);
      var lootTags =
        dataFolder +
        this.properties.namespace +
        "\\loot_tables\\blocks\\" +
        blockName +
        ".json";

      zip.file(
        "data/" +
          this.properties.namespace +
          "/loot_tables/blocks/" +
          blockName +
          ".json",
        lootData,
      );

      // Stonecutting Table Recipes
      genStonecuttingRecipes(this.properties, blockName, dataFolder, zip);

      modelData.textures = textureData;

      var boxList = [];
      modelData.elements.forEach((model) => {
        boxList.push([model["from"], model["to"]]);
      });

      blockList.push({
        name: blockName,
        types: [],
        model: modelData,
        state: stateData,
        hitbox: boxList,
      });
    }

    // Regular Block
    if (this.properties.types.block) {
      var modelData = {};
      modelData["credit"] = codecData["credit"];
      modelData["parent"] = "block/cube_all";
      modelData["textures"] = {
        all: dictFromTexture(
          this.properties.variant.default.all,
          this.properties.namespace,
        ),
        particle: dictFromTexture("particle", this.properties.namespace),
      };

      // Looting file
      var lootData = genLootTable(this.properties.namespace, blockName);
      var lootTags =
        dataFolder +
        this.properties.namespace +
        "\\loot_tables\\blocks\\" +
        blockName +
        ".json";

      zip.file(
        "data/" +
          this.properties.namespace +
          "/loot_tables/blocks/" +
          blockName +
          ".json",
        lootData,
      );

      // Stonecutting Table Recipes
      genStonecuttingRecipes(this.properties, blockName, dataFolder, zip);

      var state = JSON.stringify({
        variants: {
          "": { model: this.properties.namespace + ":block/" + blockName },
        },
      });

      var typeList = [];
      if (this.properties.types.stair) typeList.push("stairs");
      if (this.properties.types.slab) typeList.push("slab");
      if (this.properties.types.wall) typeList.push("wall");

      blockList.push({
        name: blockName,
        types: typeList,
        state: state,
        model: modelData,
        hitbox: [],
      });
    }

    // Stair Block
    if (this.properties.types.stair) {
      var name = blockName + "_stairs";

      var modelData = {};
      modelData["credit"] = codecData["credit"];
      modelData["parent"] = "minecraft:block/stairs";
      modelData["textures"] = {
        top: dictFromTexture(
          this.properties.variant.stair.top,
          this.properties.namespace,
        ),
        bottom: dictFromTexture(
          this.properties.variant.stair.bottom,
          this.properties.namespace,
        ),
        side: dictFromTexture(
          this.properties.variant.stair.side,
          this.properties.namespace,
        ),
        particle: dictFromTexture("particle", this.properties.namespace),
      };

      // Looting file
      var lootData = genLootTable(this.properties.namespace, name);
      var lootTags =
        dataFolder +
        this.properties.namespace +
        "\\loot_tables\\blocks\\" +
        name +
        ".json";

      zip.file(
        "data/" +
          this.properties.namespace +
          "/loot_tables/blocks/" +
          name +
          ".json",
        lootData,
      );

      // Stonecutting Table Recipes
      genStonecuttingRecipes(this.properties, name, dataFolder, zip);

      // Write state
      var state = genStairState(
        this.properties.namespace,
        "block/" + name,
        "block/" + name + "_outer",
        "block/" + name + "_inner",
      );

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/blockstates/" +
          name +
          ".json",
        state,
      );
      // write the 4 stair models
      // Base

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/block/" +
          name +
          ".json",
        JSON.stringify(modelData),
      );
      // Item

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/item/" +
          name +
          ".json",
        JSON.stringify(modelData),
      );
      // Inner
      modelData["parent"] = "minecraft:block/inner_stairs";

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/block/" +
          name +
          "_inner.json",
        JSON.stringify(modelData),
      );
      // Outer
      modelData["parent"] = "minecraft:block/outer_stairs";

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/block/" +
          name +
          "_outer.json",
        JSON.stringify(modelData),
      );
    }

    if (this.properties.types.slab) {
      var name = blockName + "_slab";

      var modelData = {};
      modelData["credit"] = codecData["credit"];
      modelData["parent"] = "minecraft:block/slab";
      modelData["textures"] = {
        top: dictFromTexture(
          this.properties.variant.slab.top,
          this.properties.namespace,
        ),
        bottom: dictFromTexture(
          this.properties.variant.slab.bottom,
          this.properties.namespace,
        ),
        side: dictFromTexture(
          this.properties.variant.slab.side,
          this.properties.namespace,
        ),
        particle: dictFromTexture("particle", this.properties.namespace),
      };

      // Looting file
      var lootData = genLootTable(this.properties.namespace, name);
      var lootTags =
        dataFolder +
        this.properties.namespace +
        "\\loot_tables\\blocks\\" +
        name +
        ".json";

      zip.file(
        "data/" +
          this.properties.namespace +
          "/loot_tables/blocks/" +
          name +
          ".json",
        lootData,
      );

      // Stonecutting Table Recipes
      genStonecuttingRecipes(this.properties, name, dataFolder, zip);

      // Write State
      var state = {
        variants: {
          "type=bottom": {
            model: this.properties.namespace + ":block/" + name,
          },
          "type=double": {
            model: this.properties.namespace + ":block/" + blockName,
          },
          "type=top": {
            model: this.properties.namespace + ":block/" + name + "_top",
          },
        },
      };

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/blockstates/" +
          name +
          ".json",
        JSON.stringify(state),
      );

      // Write the 3 slab models
      // Base

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/block/" +
          name +
          ".json",
        JSON.stringify(modelData),
      );
      // Item

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/item/" +
          name +
          ".json",
        JSON.stringify(modelData),
      );
      // Top
      modelData["parent"] = "minecraft:block/slab_top";

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/block/" +
          name +
          "_top.json",
        JSON.stringify(modelData),
      );
    }

    if (this.properties.types.wall) {
      var name = blockName + "_wall";

      var modelData = {};
      modelData["credit"] = codecData["credit"];
      modelData["parent"] = "minecraft:block/template_wall_post";
      modelData["textures"] = {
        wall: dictFromTexture(
          this.properties.variant.wall.wall,
          this.properties.namespace,
        ),
        particle: dictFromTexture("particle", this.properties.namespace),
      };

      // Looting file
      var lootData = genLootTable(this.properties.namespace, name);
      var lootTags =
        dataFolder +
        this.properties.namespace +
        "\\loot_tables\\blocks\\" +
        name +
        ".json";

      zip.file(
        "data/" +
          this.properties.namespace +
          "/loot_tables/blocks/" +
          name +
          ".json",
        lootData,
      );

      // Stonecutting Table Recipes
      genStonecuttingRecipes(this.properties, name, dataFolder, zip);

      // Write State
      var state = genWallState(
        this.properties.namespace,
        "block/" + name + "_post",
        "block/" + name + "_side",
        "block/" + name + "_side_tall",
      );

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/blockstates/" +
          name +
          ".json",
        state,
      );

      // Write the 4  wall models
      // Base

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/block/" +
          name +
          "_post.json",
        JSON.stringify(modelData),
      );
      // Item
      modelData["parent"] = "minecraft:block/wall_inventory";

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/item/" +
          name +
          ".json",
        JSON.stringify(modelData),
      );
      // Side
      modelData["parent"] = "minecraft:block/template_wall_side";

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/block/" +
          name +
          "_side.json",
        JSON.stringify(modelData),
      );
      // Side Tall
      modelData["parent"] = "minecraft:block/template_wall_side_tall";

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/block/" +
          name +
          "_side_tall.json",
        JSON.stringify(modelData),
      );

      // Deal with the tags
      var wallTags = dataFolder + "minecraft\\tags\\blocks\\walls.json";
      var tagVal = this.properties.namespace + ":" + name;

      var tagData = { replace: false, values: [tagVal] };

      zip.file(
        "data/minecraft/tags/blocks/walls.json",
        JSON.stringify(tagData),
      );
    }

    var modelData = JSON.parse(codecData);
    var ns = this.properties.namespace;
    var animated = this.properties.animated;
    // Copy texture files
    Texture.all.forEach(function (tx) {
      var image;
      if (tx.namespace != "minecraft") {
        if (tx.img.currentSrc.slice(0, 4) == "data") {
          image = Uint8Array.from(atob(tx.getBase64()), (c) => c.charCodeAt(0));
        } else if (tx.img.currentSrc.slice(0, 4) == "file") {
          image = Uint8Array.from(atob(tx.getBase64()), (c) => c.charCodeAt(0));
        }

        zip.file(texturePath(tx), image);
        if (animated) {
          zip.file(texturePath(tx) + ".mcmeta", '{"animation" : {}}');
        }
      }
    });

    /*console.log("Block List:")
            console.log(blockList)*/

    blockList.forEach((block) => {
      // Generate Mining file
      var mineableData = genMineableTag(
        this.properties.namespace,
        block["name"],
        block["types"],
      );
      var mineableTags =
        dataFolder + "minecraft\\tags\\blocks\\mineable\\pickaxe.json";

      zip.file(
        "data/minecraft/tags/blocks/mineable/pickaxe.json",
        mineableData,
      );

      // Write state file

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/blockstates/" +
          block["name"] +
          ".json",
        block["state"],
      );

      // Write model files

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/block/" +
          block["name"] +
          ".json",
        JSON.stringify(block["model"]),
      );

      zip.file(
        "assets/" +
          this.properties.namespace +
          "/models/item/" +
          block["name"] +
          ".json",
        JSON.stringify(block["model"]),
      );

      // Write block properties file
      var data = {
        displayName: this.properties.displayName.replace(
          /[^a-zA-Z\d\s._]/g,
          "",
        ),
        typeList: block["types"],
        material: this.properties.material,
        blastRes: this.properties.blastRes,
        slip: this.properties.slip,
        gravity: this.properties.gravity,
        rotType: this.properties.rotType,
        sounds: this.properties.sounds,
        lum: this.properties.lum,
        maxStack: this.properties.maxStack,
        fireproof: this.properties.fireproof,
        creativeTab: this.properties.creativeTab,
        transparency: this.properties.transparency,
        hitbox: block["hitbox"],
        hitboxBuffer: this.properties.bufferedHitbox
          ? this.properties.hitboxBuffer.toString()
          : "",
        blockType: this.properties.types.customType,
        particleType: this.properties.particles
          ? this.properties.particleType
          : "",
        particlePos: [
          this.properties.particlePos.x / 16.0,
          this.properties.particlePos.y / 16.0,
          this.properties.particlePos.z / 16.0,
        ],
        particleSpread: [
          this.properties.particleSpread.x / 8.0,
          this.properties.particleSpread.y / 8.0,
          this.properties.particleSpread.z / 8.0,
        ],
        particleVel: [
          this.properties.particleVel.x,
          this.properties.particleVel.y,
          this.properties.particleVel.z,
        ],
        nameGenType: "3.3", // Allows for names where " " is replaced with "_" to coexist with the older "" system
      };

      zip.file("objects/" + block["name"] + ".json", JSON.stringify(data));

      /*console.log("Object File Contents:")
                console.log(data)*/
    });

    return await zip.generateAsync({ type: "uint8array" });
  };
  return generate.call({ properties });
}
