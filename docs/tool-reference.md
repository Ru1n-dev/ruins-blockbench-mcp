# Tool conventions

All MCP tools expose strict JSON Schemas. IDs are opaque strings returned by Blockbench or by an earlier operation in the same plan. Do not construct UUIDs or reuse an ID after the project changes.

## Planning edits

Use a fresh `snapshot_id` for an edit. `bb_plan_edit` validates the operations and returns a `plan_id`, a change summary, warnings, and the preconditions that will be checked at apply time. `bb_apply_plan` consumes the plan once. If the project revision, format, selection, or protection state has changed, create a new snapshot and plan.

`bb_task` provides the same boundary for intent-level workflows. Use `mode: "plan"` to preview, `mode: "apply"` to consume a returned plan, and `mode: "verify"` to run diagnostics, captures, animation frames, conversion checks, or an export. A `pipeline` or `automation` task keeps step IDs and references while preserving the single plan boundary.

## Native UI and files

Call `bb_capabilities` before using a native registration. It returns the registration kind, ID, conditions, input controls, and provider information available in the current session. Use the dedicated command when one exists; use `bb_native_operation` for a discovered registration that has no dedicated adapter. Unsupported provider-owned behavior is reported instead of guessed.

Dialogs and file requests are stateful. Read `bb_editor_state` or `bb_file_requests`, use the returned token or request ID, and then call `bb_dialog` or `bb_file_reply`. File contents are staged in the configured output directory; arbitrary paths and network URLs are rejected.

## Verification and recovery

`bb_diagnose` is read-only. `bb_capture` and `bb_animation_frames` return PNG evidence without changing the active camera or timeline. `bb_export` writes through the server's output boundary. Save a project checkpoint before a format conversion or other destructive workflow, and use `bb_restore_checkpoint` to open a saved copy in a new tab.

Accepted requests are idempotent by `operation_id` or request ID. A timeout does not prove that an edit failed; query `bb_job` before retrying. When a native provider performs work asynchronously, use the provider's returned state and then inspect the model or editor state.

## Common operation families

| Family | Examples |
| --- | --- |
| Nodes | `group.add`, `cube.add`, `mesh.add`, `node.reparent`, `node.translate`, `node.scale`, `node.mirror`, `node.align` |
| UV | `uv.set`, `uv.transform`, `uv.density`, `uv.project`, `bb_uv_seams`, island selection |
| Surface | `texture.add`, `texture.assign`, `texture.paint`, `layer.add`, brush settings and strokes |
| Animation | `animation.add`, `keyframe.set`, effect keys, `bb_ik`, `bb_bake_ik` |
| Mesh | primitives, extrusion, inset, solidify, loop cuts, knife, merge/split, vertex merge, seams, weights |
| Editor | actions, controls, menus, key bindings, settings, modes, panels, previews, dialogs, loaders |

The authoritative schemas are generated from `src/shared/commands.ts` and the related modules in `src/shared`. The server publishes them through MCP at startup, so clients should prefer runtime discovery to hard-coded option lists.
