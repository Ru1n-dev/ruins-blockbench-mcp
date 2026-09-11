import { operationSchema, type Operation } from "./schema.ts";

/** Stable version for the high-level to typed-operation intermediate form. */
export const WORKFLOW_IR_VERSION = 1 as const;

export type WorkflowRoute = "geometry" | "surface" | "motion" | "io" | "editor" | "validation" | "generic";

export type CanonicalOperation = {
  index: number;
  op: Operation["op"];
  route: WorkflowRoute;
  operation: Operation;
};

export type CanonicalWorkflow = {
  version: typeof WORKFLOW_IR_VERSION;
  kind: string;
  operations: CanonicalOperation[];
  operation_count: number;
  operation_types: string[];
  route_counts: Record<WorkflowRoute, number>;
};

const routePrefixes: Array<[WorkflowRoute, string[]]> = [
  ["geometry", ["group.", "cube.", "mesh.", "node.", "armature.", "spline."]],
  ["surface", ["uv.", "texture.", "layer.", "paint.", "face.", "texture_group."]],
  ["motion", ["animation.", "keyframe.", "ik.", "controller."]],
  ["io", ["import.", "export.", "project.", "format.", "resource.", "template."]],
  ["editor", ["selection.", "setting.", "keybind.", "panel.", "preview.", "mode.", "camera.", "scene."]],
  ["validation", ["diagnose.", "validate.", "verify."]],
];

/** Classify a typed operation without changing its payload. */
export function workflowRoute(op: string): WorkflowRoute {
  for (const [route, prefixes] of routePrefixes)
    if (prefixes.some((prefix) => op.startsWith(prefix))) return route;
  return "generic";
}

/** Parse and normalize an operation list once at the high-level boundary. */
export function canonicalOperations(operations: readonly Record<string, unknown>[]): Operation[] {
  return operations.map((operation) => operationSchema.parse(operation));
}

/** Build the shared intermediate representation used by planning and execution. */
export function buildCanonicalWorkflow(
  kind: string,
  operations: readonly Record<string, unknown>[],
): CanonicalWorkflow {
  const parsed = canonicalOperations(operations);
  const routeCounts: Record<WorkflowRoute, number> = {
    geometry: 0,
    surface: 0,
    motion: 0,
    io: 0,
    editor: 0,
    validation: 0,
    generic: 0,
  };
  const canonical = parsed.map((operation, index) => {
    const route = workflowRoute(operation.op);
    routeCounts[route] += 1;
    return { index, op: operation.op, route, operation };
  });
  return {
    version: WORKFLOW_IR_VERSION,
    kind,
    operations: canonical,
    operation_count: canonical.length,
    operation_types: Array.from(new Set(canonical.map((item) => item.op))),
    route_counts: routeCounts,
  };
}

/** Keep the legacy high-level summary shape while using the common IR parser. */
export function canonicalOperationSummary(operations: readonly Record<string, unknown>[]) {
  const workflow = buildCanonicalWorkflow("summary", operations);
  return {
    generated_operations: workflow.operation_count,
    operation_types: workflow.operation_types,
  };
}
