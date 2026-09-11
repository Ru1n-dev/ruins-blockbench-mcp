// Scalar height is the linear red channel, one height unit per pixel.
// Image rows run down; OpenGL tangent +Y runs up.
export function heightNormal(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  directX: boolean,
) {
  const out = new Uint8ClampedArray(width * height * 4);
  const at = (x: number, y: number) =>
    data[
      (Math.max(0, Math.min(height - 1, y)) * width +
        Math.max(0, Math.min(width - 1, x))) *
        4
    ] / 255;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / 2;
      const dy = (at(x, y + 1) - at(x, y - 1)) / 2;
      const length = Math.hypot(dx, dy, 1),
        index = (y * width + x) * 4;
      out[index] = Math.round((1 - dx / length) * 127.5);
      out[index + 1] = Math.round((1 + (directX ? -dy : dy) / length) * 127.5);
      out[index + 2] = Math.round((1 + 1 / length) * 127.5);
      out[index + 3] = 255;
    }
  return out;
}

// Local height-field approximation: eight horizon directions, four pixels.
// Visibility is cos²(horizon elevation), the diffuse hemisphere integral.
// This cannot include occlusion from other meshes or distant geometry.
export function heightOcclusion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const out = new Uint8ClampedArray(width * height * 4);
  const directions = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4,
        center = data[index] / 255;
      let visibility = 0;
      for (const [dx, dy] of directions) {
        let slope = 0;
        for (let r = 1; r <= 4; r++) {
          const px = x + dx * r,
            py = y + dy * r;
          if (px < 0 || py < 0 || px >= width || py >= height) break;
          slope = Math.max(
            slope,
            (data[(py * width + px) * 4] / 255 - center) /
              (Math.hypot(dx, dy) * r),
          );
        }
        visibility += 1 / (1 + slope * slope);
      }
      out[index] =
        out[index + 1] =
        out[index + 2] =
          Math.round((visibility / directions.length) * 255);
      out[index + 3] = 255;
    }
  return out;
}
