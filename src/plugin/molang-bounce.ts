// Correct MolangJS 1.7's InBounce dispatch without changing exported Molang.
// The equivalent expression evaluates each argument exactly once.
export function rewriteInBounce(source: string, depth = 0): string {
  if (depth > 32 || source.length > 1_000_000) return source;
  if (!/math\.ease_in_bounce\s*\(/i.test(source)) return source;
  let out = "",
    i = 0;
  while (i < source.length) {
    if (source[i] === "'") {
      const end = source.indexOf("'", i + 1);
      if (end < 0) return out + source.slice(i);
      out += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    const match =
      (!i ||
        !/[\w.]/.test(source[i - 1]!) ||
        (source.slice(i - 6, i).toLowerCase() === "return" &&
          (i === 6 || !/[\w.]/.test(source[i - 7]!)))) &&
      source.slice(i).match(/^math\.ease_in_bounce\s*\(/i);
    if (!match) {
      out += source[i++];
      continue;
    }
    let nesting = 1,
      j = i + match[0].length,
      start = j;
    const args: string[] = [];
    for (; j < source.length; j++) {
      const char = source[j];
      if (char === "'") {
        const end = source.indexOf("'", j + 1);
        if (end < 0) break;
        j = end;
        continue;
      }
      if (char === "(") nesting++;
      if (char === ")") {
        nesting--;
        if (!nesting) {
          args.push(source.slice(start, j));
          break;
        }
      }
      if (char === "," && nesting === 1) {
        args.push(source.slice(start, j));
        start = j + 1;
      }
    }
    if (nesting || args.length !== 3) {
      out += source[i++];
      continue;
    }
    const [a, b, t] = args.map((s) => rewriteInBounce(s, depth + 1));
    out += `math.lerp((${a}),(${b}),(1-math.ease_out_bounce(0,1,(1-(${t})))))`;
    i = j + 1;
  }
  return out;
}
export function installMolangBounce(parser: any) {
  const original = parser.parse;
  if (original.call(parser, "math.ease_in_bounce(0,1,0.25)") !== 0.1171875)
    return () => {};
  const parse = function (this: any, source: any, ...args: any[]) {
    return original.call(
      this,
      typeof source === "string" ? rewriteInBounce(source) : source,
      ...args,
    );
  };
  parser.parse = parse;
  return () => {
    if (parser.parse === parse) parser.parse = original;
  };
}
