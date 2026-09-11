export function isCheckpoint(model: any): boolean {
  return (
    !!model &&
    typeof model === "object" &&
    !!model.meta &&
    (Array.isArray(model.elements) ||
      (model.meta.model_format === "skin" &&
        typeof model.skin_model === "string" &&
        !!model.skin_model &&
        Array.isArray(model.textures)))
  );
}
