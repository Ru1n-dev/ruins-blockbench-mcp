/** Static literals and previously resolved bindings only; never execute plugin code. */
export function staticValue(node: any, bindings: Map<string, unknown> = new Map()): unknown {
  if (node?.type === "Literal") return node.value;
  if (node?.type === "Identifier" && bindings.has(node.name)) return bindings.get(node.name);
  // Webpack bundles expose imported constants as `moduleAlias.CONSTANT`, while
  // the bundle also keeps the exported constant declaration in the same scope.
  // Resolve the member by its property name when that declaration is known.
  if (node?.type === "MemberExpression" && !node.computed && node.property?.type === "Identifier") {
    if (bindings.has(node.property.name)) return bindings.get(node.property.name);
  }
  if (node?.type === "MemberExpression" && node.computed) {
    const key = staticValue(node.property, bindings);
    if (typeof key === "string" && bindings.has(key)) return bindings.get(key);
  }
  if (node?.type === "MemberExpression" && node.object?.type === "Identifier" && !node.computed) {
    const object = bindings.get(node.object.name);
    if (object && typeof object === "object" && node.property?.type === "Identifier" &&
        Object.hasOwn(object, node.property.name)) return (object as any)[node.property.name];
  }
  if (node?.type === "ObjectExpression") {
    const result: Record<string, unknown> = {};
    for (const property of node.properties ?? []) {
      if (property.type !== "Property" || property.computed) continue;
      const key = property.key?.name ?? (property.key?.type === "Literal" ? property.key.value : undefined);
      if (typeof key !== "string") continue;
      const value = staticValue(property.value, bindings);
      if (value !== undefined) result[key] = value;
    }
    return Object.keys(result).length ? result : undefined;
  }
  if (node?.type === "TemplateLiteral") {
    const values = node.expressions.map((value: any) => staticValue(value, bindings));
    if (values.some((v: any) => !["string", "number", "boolean"].includes(typeof v))) return;
    return node.quasis.map((q: any, i: number) => q.value.cooked + (i < values.length ? String(values[i]) : "")).join("");
  }
  if (node?.type === "BinaryExpression" && node.operator === "+") {
    const left = staticValue(node.left, bindings), right = staticValue(node.right, bindings);
    if (typeof left === "string" && ["string", "number", "boolean"].includes(typeof right)) return left + String(right);
    if (typeof right === "string" && ["number", "boolean"].includes(typeof left)) return String(left) + right;
  }
  if (node?.type === "UnaryExpression" && ["+", "-", "!"].includes(node.operator)) {
    const value = staticValue(node.argument, bindings);
    if (["number", "boolean"].includes(typeof value)) {
      if (node.operator === "+") return Number(value);
      if (node.operator === "-") return -Number(value);
      return !value;
    }
  }
}

export function operationIdentifier(node: any, kind: string, bindings: Map<string, unknown> = new Map()): string | null {
  // Property(owner, type, name, options) does not share Action(id, options).
  const argument = node.arguments[kind === "Property" ? 2 : 0];
  let id = staticValue(argument, bindings);
  if (typeof id !== "string" && argument?.type === "ObjectExpression") {
    const property = argument.properties.find((p: any) => p.type === "Property" &&
      (p.computed ? staticValue(p.key, bindings) : p.key?.name ?? staticValue(p.key, bindings)) === "id");
    id = staticValue(property?.value, bindings);
  }
  return typeof id === "string" ? id : null;
}
