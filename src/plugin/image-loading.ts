import { Fault } from "../shared/types.ts";
export function waitForImage(image: HTMLImageElement): Promise<void> {
  if (!image.src) return Promise.resolve();
  if (image.complete)
    return image.naturalWidth > 0
      ? Promise.resolve()
      : Promise.reject(new Fault("IMAGE", "Imported image failed to load"));
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
    };
    const loaded = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Fault("IMAGE", "Imported image failed to load"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Fault(
          "IMAGE_TIMEOUT",
          "Image load timed out; the imported project remains available for inspection",
        ),
      );
    }, 5000);
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", failed, { once: true });
  });
}
