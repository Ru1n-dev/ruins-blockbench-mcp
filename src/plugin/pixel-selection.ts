import { Fault } from "../shared/types.ts";
export function preparePixelSelection(texture: any, input: any) {
  const width = texture.width,
    height = texture.height,
    size = width * height;
  if (!Number.isSafeInteger(size) || size < 1 || size > 4194304)
    throw new Fault(
      "PIXEL_SELECTION_LIMIT",
      "Pixel selection supports textures with at most 4194304 pixels",
    );
  const rectangles = input.rectangles ?? [];
  if (["all", "clear"].includes(input.mode) && rectangles.length)
    throw new Fault(
      "PIXEL_SELECTION",
      "all and clear do not accept rectangles",
    );
  let area = 0;
  for (const [x, y, w, h] of rectangles) {
    if (
      ![x, y, w, h].every(Number.isSafeInteger) ||
      x < 0 ||
      y < 0 ||
      w < 1 ||
      h < 1 ||
      x + w > width ||
      y + h > height
    )
      throw new Fault("PIXEL_SELECTION", "Rectangle is outside the texture");
    area += w * h;
    if (area > 4194304)
      throw new Fault(
        "PIXEL_SELECTION_LIMIT",
        "Combined rectangle area exceeds 4194304 pixels",
      );
  }
  let mask: Int8Array | undefined;
  if (!["all", "clear"].includes(input.mode)) {
    mask = new Int8Array(size);
    if (input.mode !== "replace") {
      if (texture.selection.override === true) mask.fill(1);
      else if (
        texture.selection.override === null &&
        texture.selection.array?.length === size
      )
        mask.set(texture.selection.array);
    }
    for (const [x, y, w, h] of rectangles)
      for (let row = y; row < y + h; row++)
        mask.fill(
          input.mode === "subtract" ? 0 : 1,
          row * width + x,
          row * width + x + w,
        );
  }
  return () => {
    texture.selection.changeSize(width, height);
    if (mask) {
      texture.selection.setOverride(null);
      texture.selection.array = mask;
    } else texture.selection.setOverride(input.mode === "all");
  };
}
