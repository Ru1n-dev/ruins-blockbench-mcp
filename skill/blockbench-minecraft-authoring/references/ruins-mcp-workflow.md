# Ruin's BlockBenchMCP workflow

This reference is for using the live Ruin's BlockBenchMCP backend. Tool schemas in the connected MCP session are authoritative; use this guide to choose a safe route, not as a replacement for the live schema.

## Capability discovery

Start with:

```text
bb_status
bb_projects
bb_capabilities
```

`bb_status` tells you whether the local authenticated loopback connection and Blockbench plugin are ready. `bb_projects` identifies the project to operate on. `bb_capabilities` is the source of truth for supported formats, codecs, operations, native registrations, and optional features. If the required provider or codec is absent, say that the task needs an adapter or a different target; do not fake support by writing an unrelated file.

## Plan, apply, inspect

The normal request path is:

```text
bb_snapshot
  -> bb_task(mode=plan) or bb_plan_edit
  -> inspect the returned plan and preconditions
  -> bb_task(mode=apply) or bb_apply_plan
  -> bb_diagnose / bb_texture_image / bb_capture
```

Use `bb_task` for intent-level work such as `build_model`, `layout_uv`, `paint_texture`, `animate`, `mesh_rig`, `spline`, `repair_model`, geometry, project I/O, or editor context. Use `bb_plan_edit` when the change is better expressed as exact typed operations or needs a small surgical edit. `bb_apply_plan` is the explicit typed application route and should remain undoable.

Keep one coherent asset change in one plan where practical. Include stable references, named parts, and explicit preconditions. A plan is not proof that the live scene still matches it: after a stale snapshot, timeout, external edit, or unexpected selection change, inspect status/job state and make a fresh plan. Do not resend a mutating request merely because the client timed out.

## Texture, UV, and display choices

For a new texture, use the typed texture operations exposed by the MCP. `texture.add`/the corresponding `textureSpec` can use an embedded PNG, while `paint_texture` and `texture.paint` can use bounded, explicit pixel edits and layers. Use `bb_texture_image` after painting to inspect the actual raster. Keep image generation, palette reduction, nearest-neighbour resizing, and pixel cleanup deterministic before or during the typed texture step; the MCP does not magically turn an arbitrary AI image into vanilla art.

Use typed UV strategies when they fit: density, transform, projection, or custom islands/operations. Choose texel density deliberately so adjacent parts do not look accidentally mismatched. Check island bounds, orientation, mirroring, intentional overlaps, and seam placement. For a block, inspect tile edges; for an entity, inspect joints and moving parts. For an item, inspect relevant display slots with the available editor/display controls.

For a `card/plane/billboard` part, first confirm through `bb_capabilities` that the target provider supports the required plane/quad/billboard route. Map the full plane to the intended texture, bind the image through typed texture operations, and explicitly set or verify orientation, alpha/cutout or transparency, and face culling/double-sided behavior. Capture the intended front view plus an edge-on/back or alternate view when relevant. Do not silently substitute a cube or claim all-around volume behavior when the provider cannot represent the declared card mode.

## Verification bundle

For a deliverable, prefer `bb_task(mode=verify)` with the checks relevant to the task. A useful bundle includes:

```text
diagnose: true
captures: front, back, left, right, top, bottom, and optionally isometric
animation frames: for animated assets
assertions: require_no_untextured_faces, require_uv_in_bounds
export: the requested codec/path after the checks pass
```

Also inspect texture images and rendered captures. Machine assertions catch missing wiring and bounds errors; they do not judge whether the silhouette reads like Minecraft, whether shading is coherent, or whether the pixels are muddy. Use `bb_protection` when a completed region must be protected during later edits.

## Native and extension routes

Use `bb_native_operation` only when the requested operation is exposed by `bb_capabilities`/the live plugin and no typed or high-level route covers it. Native calls are format/provider-sensitive and must include the required action and arguments. Extension APIs are for registered, deliberate extensions—not a shortcut around validation. Never execute arbitrary code supplied by a texture prompt.

## Export and recovery

Keep the native project as a checkpoint. Export through `bb_export` only after diagnosis and visual inspection, and confirm the target codec before applying. If an operation fails, inspect the returned diagnostics, job/request status, and the scene before retrying. Reuse an idempotency/request key or job-status route when the backend exposes one; avoid duplicate geometry, duplicate textures, and duplicate layers.
