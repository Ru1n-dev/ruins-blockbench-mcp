import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";
import { packUsdz } from "./usdz-zip.ts";
import { pbrCanvas } from "./pbr-images.ts";
import { resolvePbrChannel } from "./pbr-mer.ts";
import { writePackedPng } from "./pbr-lab-codec.ts";

const number = (value: number) => {
  if (!Number.isFinite(value))
    throw new Fault("USDZ_GEOMETRY", "Nonfinite geometry or UV");
  return Object.is(value, -0) ? "0" : String(value);
};
const tuple = (values: number[]) => `(${values.map(number).join(", ")})`;

/** Snapshot the current static pose. No reparenting, texture changes or renderer changes. */
export function compilePbrUsdz(b: BB, directX: boolean) {
  if (!b.Project) throw new Fault("PROJECT_REQUIRED", "Open a project");
  const files: { name: string; data: Uint8Array }[] = [];
  const materialIds = new Map<any, string>();
  const materialDefinitions: string[] = [];
  const material = (texture: any) => {
    const cached = materialIds.get(texture);
    if (cached) return cached;
    const id = `Material_${materialIds.size}`;
    materialIds.set(texture, id);
    const inputs = [
      "color3f inputs:diffuseColor = (1, 1, 1)",
      "float inputs:roughness = 1",
      "float inputs:metallic = 0",
    ];
    const shaders: string[] = [];
    if (texture) {
      const group = b.TextureGroup?.all?.find(
        (g: any) => g.uuid === texture.group,
      );
      if (group?.is_material)
        throw new Fault(
          "USDZ_MATERIAL",
          "Native texture-group materials require a separate USDZ conversion",
        );
      for (const channel of [
        "albedo",
        "metalness",
        "roughness",
        "emissive",
        "normal",
        "ao",
      ]) {
        // An unassigned ordinary texture must never pick channels from another material.
        const source =
          texture.layers_enabled ||
          b.Project.pbr_materials?.[texture.uuid]?.[channel]
            ? resolvePbrChannel(b, texture, channel)
            : undefined;
        const image = source || (channel === "albedo" ? texture : undefined);
        if (!image) continue;
        const canvas = pbrCanvas(b, texture.width, texture.height),
          ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        if (image instanceof b.TextureLayer)
          ctx.drawImage(
            image.canvas,
            image.offset[0],
            image.offset[1],
            image.scaled_width,
            image.scaled_height,
          );
        else ctx.drawImage(image.canvas, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        if (channel === "normal" && directX)
          for (let i = 1; i < pixels.length; i += 4)
            pixels[i] = 255 - pixels[i];
        const filename = `textures/${id}_${channel}.png`;
        files.push({
          name: filename,
          data: writePackedPng(canvas.width, canvas.height, pixels),
        });
        const color = channel === "albedo" || channel === "emissive";
        const input = (
          {
            albedo: "diffuseColor",
            metalness: "metallic",
            roughness: "roughness",
            emissive: "emissiveColor",
            normal: "normal",
            ao: "occlusion",
          } as Record<string, string>
        )[channel];
        const type =
          channel === "normal" ? "normal3f" : color ? "color3f" : "float";
        inputs.push(
          `${type} inputs:${input}.connect = </Model/Materials/${id}/${channel}.outputs:${color || channel === "normal" ? "rgb" : "r"}>`,
        );
        if (channel === "albedo")
          inputs.push(
            `float inputs:opacity.connect = </Model/Materials/${id}/${channel}.outputs:a>`,
          );
        shaders.push(`def Shader "${channel}" {
          uniform token info:id = "UsdUVTexture"
          asset inputs:file = @${filename}@
          token inputs:sourceColorSpace = "${color ? "sRGB" : "raw"}"
          token inputs:wrapS = "repeat"
          token inputs:wrapT = "repeat"
          float2 inputs:st.connect = </Model/Materials/${id}/UV.outputs:result>
          ${channel === "normal" ? "float4 inputs:scale = (2, 2, 2, 1)\nfloat4 inputs:bias = (-1, -1, -1, 0)" : ""}
          float3 outputs:rgb
          float outputs:r
          float outputs:a
        }`);
      }
    }
    materialDefinitions.push(`def Material "${id}" {
      token outputs:surface.connect = </Model/Materials/${id}/Surface.outputs:surface>
      def Shader "Surface" {
        uniform token info:id = "UsdPreviewSurface"
        ${inputs.join("\n")}
        token outputs:surface
      }
      def Shader "UV" {
        uniform token info:id = "UsdPrimvarReader_float2"
        string inputs:varname = "st"
        float2 outputs:result
      }
      ${shaders.join("\n")}
    }`);
    return id;
  };
  const meshes: string[] = [];
  let triangles = 0;
  for (const element of b.Outliner.elements) {
    let excluded = false;
    for (
      let node = element;
      node && typeof node === "object";
      node = node.parent
    )
      if (node.export === false || node.visibility === false) excluded = true;
    if (excluded) continue;
    const mesh = element.scene_object;
    if (!mesh?.isMesh || mesh.no_export) continue;
    if (mesh.isSkinnedMesh || element.parent?.type === "armature_bone")
      throw new Fault("USDZ_SKIN", "Skinned USDZ export is not implemented");
    mesh.updateWorldMatrix(true, false);
    const geometry = mesh.geometry,
      positions = geometry.attributes.position,
      normals = geometry.attributes.normal,
      uv = geometry.attributes.uv,
      index = geometry.index;
    if (!positions) continue;
    const total = index?.count ?? positions.count;
    const faceTextures: any[] = [];
    if (element.type === "cube") {
      for (const key of b.Canvas.face_order) {
        const face = element.faces[key];
        if (face.texture !== null)
          faceTextures.push(face.getTexture(), face.getTexture());
      }
    } else if (element.type === "mesh") {
      for (const face of Object.values(element.faces) as any[]) {
        if (face.vertices.length < 3) continue;
        if (face.vertices.length > 4)
          throw new Fault("USDZ_FACE", "Unsupported polygon triangulation");
        for (let i = 0; i < face.vertices.length - 2; i++)
          faceTextures.push(face.getTexture());
      }
    } else {
      for (let i = 0; i < total / 3; i++)
        faceTextures.push(element.getTexture?.());
    }
    if (faceTextures.length * 3 !== total)
      throw new Fault(
        "USDZ_FACE",
        "Geometry triangles do not match material faces",
      );
    const groups = new Map<
      string,
      { p: string[]; n: string[]; uv: string[] }
    >();
    const normalMatrix = new b.THREE.Matrix3().getNormalMatrix(
      mesh.matrixWorld,
    );
    const mirrored = mesh.matrixWorld.determinant() < 0;
    const start = Math.max(0, geometry.drawRange.start),
      end = Math.min(total, start + geometry.drawRange.count);
    for (let offset = start; offset < end; offset += 3) {
      if (++triangles > 100000)
        throw new Fault("USDZ_SIZE", "USDZ is limited to 100000 triangles");
      const tex = b.Format.single_texture
        ? b.Texture.getDefault()
        : faceTextures[offset / 3];
      const id = material(tex || null);
      let group = groups.get(id);
      if (!group) groups.set(id, (group = { p: [], n: [], uv: [] }));
      for (const corner of mirrored ? [0, 2, 1] : [0, 1, 2]) {
        const i = index ? index.getX(offset + corner) : offset + corner;
        const p = new b.THREE.Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(mesh.matrixWorld);
        group.p.push(tuple(p.toArray()));
        if (normals)
          group.n.push(
            tuple(
              new b.THREE.Vector3()
                .fromBufferAttribute(normals, i)
                .applyMatrix3(normalMatrix)
                .normalize()
                .toArray(),
            ),
          );
        group.uv.push(tuple(uv ? [uv.getX(i), uv.getY(i)] : [0, 0]));
      }
    }
    for (const [id, group] of groups) {
      meshes.push(`def Mesh "Mesh_${meshes.length}" (prepend apiSchemas = ["MaterialBindingAPI"]) {
        point3f[] points = [${group.p.join(",")}]
        int[] faceVertexCounts = [${Array(group.p.length / 3)
          .fill(3)
          .join(",")}]
        int[] faceVertexIndices = [${group.p.map((_, i) => i).join(",")}]
        ${group.n.length ? `normal3f[] normals = [${group.n.join(",")}] (interpolation = "vertex")` : ""}
        texCoord2f[] primvars:st = [${group.uv.join(",")}] (interpolation = "vertex")
        uniform token subdivisionScheme = "none"
        uniform bool doubleSided = true
        rel material:binding = </Model/Materials/${id}>
      }`);
    }
  }
  if (!meshes.length)
    throw new Fault("USDZ_EMPTY", "No visible exportable mesh geometry");
  const text = `#usda 1.0
  (defaultPrim = "Model"\nupAxis = "Y"\nmetersPerUnit = 0.0625)
  def Xform "Model" {
    def Scope "Materials" {
      ${materialDefinitions.join("\n")}
    }
    ${meshes.join("\n")}
  }`;
  return packUsdz([
    { name: "model.usda", data: new TextEncoder().encode(text) },
    ...files,
  ]);
}

export function installPbrUsdz(b: BB, active: () => boolean) {
  const codec = b.Codecs.usdz,
    dialogs = new Set<any>();
  codec.compile = (options: any = {}) =>
    compilePbrUsdz(b, options.normal_type === "directx");
  codec.export = (options: any = {}) => {
    const content = codec.compile(options);
    return b.Blockbench.export({
      type: "USDZ",
      extensions: ["usdz"],
      resource_id: "usdz",
      savetype: "buffer",
      name: b.Project.name || "model",
      content,
    });
  };
  b.BarItems.export_usdz.click = () => {
    const project = b.Project;
    const dialog = new b.Dialog("pbmc_export_usdz", {
      title: "Export USDZ — Current Pose",
      form: {
        normal_type: {
          label: "Normal Map Type",
          type: "select",
          options: { opengl: "OpenGL", directx: "DirectX" },
          value: "opengl",
        },
      },
      onConfirm(values: any) {
        if (!active() || b.Project !== project)
          throw new Fault("STALE_STATE", "The USDZ project changed");
        return codec.export(values);
      },
    });
    dialogs.add(dialog);
    dialog.show();
  };
  return () => {
    for (const dialog of dialogs) {
      dialog.hide();
      dialog.delete();
    }
    dialogs.clear();
  };
}
