import { decode, encode, convertIndexedToRgb } from "fast-png";
import { Fault } from "../shared/types.ts";

export const labChannels = [
  "lab_smoothness",
  "lab_emission",
  "lab_scattering",
  "lab_f0",
  "lab_metal",
  "porosity",
  "sss",
];
export function readPackedPng(bytes: Uint8Array) {
  if (bytes.length < 33 || bytes.length > 32000000)
    throw new Fault("PBR_PNG", "Invalid PNG size");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (!width || !height || width > 2048 || height > 2048)
    throw new Fault("PBR_SIZE", "Use packed PNGs up to 2048 pixels per side");
  const image = decode(bytes, { checkCrc: true });
  let raw = image.data,
    channels = image.channels,
    depth = image.depth;
  if (image.palette) {
    raw = convertIndexedToRgb(image);
    channels = image.palette[0].length;
    depth = 8;
  }
  if (![8, 16].includes(depth))
    throw new Fault(
      "PBR_PNG",
      "Use 8-bit or 16-bit channel PNGs or indexed PNGs",
    );
  const data = new Uint8ClampedArray(width * height * 4),
    divisor = depth === 16 ? 257 : 1;
  for (let i = 0; i < width * height; i++) {
    if (channels <= 2)
      data[i * 4] =
        data[i * 4 + 1] =
        data[i * 4 + 2] =
          Math.round(raw[i * channels] / divisor);
    else
      for (let c = 0; c < 3; c++)
        data[i * 4 + c] = Math.round(raw[i * channels + c] / divisor);
    data[i * 4 + 3] =
      channels === 2 || channels === 4
        ? Math.round(raw[i * channels + channels - 1] / divisor)
        : 255;
  }
  return { width, height, data };
}
export function writePackedPng(
  width: number,
  height: number,
  data: Uint8ClampedArray,
) {
  return encode({ width, height, data, channels: 4, depth: 8 });
}
const rough = (smooth: number) => Math.round((1 - smooth / 255) ** 2 * 255);
const emission = (value: number) =>
  value === 255 ? 0 : Math.round((value / 254) * 255);
const scatter = (value: number) =>
  value <= 64
    ? [Math.round((value / 64) * 255), 0]
    : [0, Math.round(((value - 65) / 190) * 255)];
export function unpackLab(
  data: Uint8ClampedArray,
  kind: "specular" | "normal",
) {
  const names =
    kind === "normal"
      ? ["normal", "ao", "height"]
      : ["roughness", "metalness", "emissive", ...labChannels];
  const output = Object.fromEntries(
    names.map((n) => [n, new Uint8ClampedArray(data.length)]),
  );
  const gray = (channel: string, index: number, value: number) => {
    const out = output[channel];
    out[index] = out[index + 1] = out[index + 2] = value;
    out[index + 3] = 255;
  };
  for (let i = 0; i < data.length; i += 4) {
    if (kind === "normal") {
      const x = data[i] / 127.5 - 1,
        y = data[i + 1] / 127.5 - 1;
      output.normal.set(
        [
          data[i],
          data[i + 1],
          Math.round((1 + Math.sqrt(Math.max(0, 1 - x * x - y * y))) * 127.5),
          255,
        ],
        i,
      );
      gray("ao", i, data[i + 2]);
      gray("height", i, data[i + 3]);
    } else {
      gray("roughness", i, rough(data[i]));
      gray("metalness", i, data[i + 1] >= 230 ? 255 : 0);
      gray("emissive", i, emission(data[i + 3]));
      gray("lab_smoothness", i, data[i]);
      gray("lab_emission", i, data[i + 3]);
      gray("lab_scattering", i, data[i + 2]);
      gray("lab_f0", i, data[i + 1] < 230 ? data[i + 1] : 0);
      gray("lab_metal", i, data[i + 1] >= 230 ? data[i + 1] : 0);
      const [porosity, sss] = scatter(data[i + 2]);
      gray("porosity", i, porosity);
      gray("sss", i, sss);
    }
  }
  return output;
}
export function packLab(
  maps: Record<string, Uint8ClampedArray>,
  pixels: number,
  options: { f0: number; metal: number; directX: boolean },
) {
  const specular = new Uint8ClampedArray(pixels * 4),
    normal = new Uint8ClampedArray(pixels * 4);
  const at = (channel: string, index: number, fallback: number) =>
    maps[channel]?.[index] ?? fallback;
  for (let i = 0; i < specular.length; i += 4) {
    const roughness = at("roughness", i, 255),
      savedSmooth = maps.lab_smoothness?.[i];
    specular[i] =
      savedSmooth !== undefined && rough(savedSmooth) === roughness
        ? savedSmooth
        : Math.round((1 - Math.sqrt(roughness / 255)) * 255);
    const metalness = at("metalness", i, 0),
      metal = at("lab_metal", i, options.metal),
      f0 = at("lab_f0", i, options.f0);
    if (metalness >= 128) {
      if (metal !== 0 && metal < 230)
        throw new Fault(
          "PBR_METAL",
          "Lab metal ID must be 230–255 (or 0 to use the default)",
        );
      specular[i + 1] = metal || options.metal;
    } else {
      if (f0 > 229)
        throw new Fault("PBR_F0", "Dielectric F0 must be from 0 to 229");
      specular[i + 1] = f0;
    }
    const porosity = at("porosity", i, 0),
      sss = at("sss", i, 0),
      savedScatter = maps.lab_scattering?.[i];
    const previous = savedScatter === undefined ? null : scatter(savedScatter);
    specular[i + 2] =
      previous && previous[0] === porosity && previous[1] === sss
        ? savedScatter!
        : sss > 0
          ? 65 + Math.round((sss / 255) * 190)
          : Math.round((porosity / 255) * 64);
    const emissive = maps.emissive
        ? Math.round(
            (maps.emissive[i] + maps.emissive[i + 1] + maps.emissive[i + 2]) /
              3,
          )
        : 0,
      savedEmission = maps.lab_emission?.[i];
    specular[i + 3] =
      savedEmission !== undefined && emission(savedEmission) === emissive
        ? savedEmission
        : emissive === 0
          ? 255
          : Math.round((emissive / 255) * 254);
    normal[i] = at("normal", i, 128);
    normal[i + 1] = options.directX
      ? 255 - at("normal", i + 1, 128)
      : at("normal", i + 1, 128);
    normal[i + 2] = at("ao", i, 255);
    normal[i + 3] = at("height", i, 255);
  }
  return { specular, normal };
}
