# Minecraft texture reference and multi-view router

This file is kept as a compatibility entrypoint for existing links. Read only the focused reference needed for the current phase instead of loading this topic as one large document.

- For UVs, pixel density, near-colour ramps, unrestricted part-appropriate value transitions, integrated highlights, whole-model surface variation, manual pixel-AA, isolated pixels, AI texture cleanup, and texture-versus-runtime lighting, read [texture-quality.md](texture-quality.md).
- For deciding whether to call references, exact image count, purpose, model coverage, provenance, and reference modes, read [reference-plan.md](reference-plan.md).
- For front/back/left/right/top/bottom/three-quarter checks, asset-specific views, and evidence, read [multiview-review.md](multiview-review.md).

## Fast gate

- Do not use references only for generic material colour when face roles, lighting, detail density, edge treatment, or companion maps remain unresolved.
- Do not stretch one global gradient across unrelated parts; use the shared lighting convention plus a recorded local shading profile per named part.
- Do not leave highlights as detached bright stripes or automatic outlines; connect them to each part's local ramp with a recorded `highlight_profile` when applicable.
- Do not add uniform salt-and-pepper noise; use material-aware near-colour clusters across the whole visible model unless a clean material is explicitly intended.
- Do not call a texture finished with a flat base-only pass for a finished asset; use the quality reference and its audit.
- Do not treat automatic blur, filtering AA, semi-transparent halos, or conspicuous meaningless singleton pixels as Minecraft-style detail.
- Do not export before the required multi-view checklist and diagnostics are recorded.
