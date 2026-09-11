// @ts-nocheck
// Compatibility implementation for the Structure to Model provider format.
// Blockbench mutation APIs are intentionally handled by the adapter layer.
export function structureAlgorithms(readModel) {
  class O {
    #e;
    #r;
    #n = new Uint8Array(3);
    #o = 0;
    get encoding() {
      return "mutf-8";
    }
    get fatal() {
      return this.#e;
    }
    get ignoreBOM() {
      return this.#r;
    }
    constructor(e = "mutf-8", t = {}) {
      let n = e.toLowerCase();
      if (n !== "mutf-8" && n !== "mutf8")
        throw RangeError(`MUtf8Decoder.constructor: '${e}' is not supported.`);
      ((this.#e = t.fatal ?? !1), (this.#r = t.ignoreBOM ?? !1));
    }
    decode(e, t = {}) {
      let n = t.stream ?? !1,
        r = this.#s(e),
        s = r.length,
        o = Array(s),
        i = 0,
        c = 0;
      while (i < s) {
        let u = r[i++];
        if (!(u & 128) && u !== 0) o[c++] = u;
        else if ((u & 224) === 192) {
          if (s <= i) {
            if (n) {
              this.#c(r, i - 1);
              break;
            }
            o[c++] = this.#t();
            continue;
          }
          let a = r[i++];
          if ((a & 192) !== 128) {
            ((o[c++] = this.#t()), i--);
            continue;
          }
          o[c++] = ((u & 31) << 6) | (a & 63);
        } else if ((u & 240) === 224) {
          if (s <= i + 1) {
            if (n) {
              this.#c(r, i - 1);
              break;
            }
            o[c++] = this.#t();
            continue;
          }
          let a = r[i++];
          if ((a & 192) !== 128) {
            ((o[c++] = this.#t()), i--);
            continue;
          }
          let l = r[i++];
          if ((l & 192) !== 128) {
            ((o[c++] = this.#t()), (i -= 2));
            continue;
          }
          if (i === 3 && u === 239 && a === 187 && l === 191 && !this.ignoreBOM)
            continue;
          o[c++] = ((u & 15) << 12) | ((a & 63) << 6) | (l & 63);
        } else o[c++] = this.#t();
      }
      return String.fromCharCode(...(c === o.length ? o : o.slice(0, c)));
    }
    #s(e) {
      let t;
      if (e instanceof Uint8Array) t = e;
      else if ("buffer" in e) t = new Uint8Array(e.buffer, e.byteOffset);
      else t = new Uint8Array(e);
      if (!this.#o) return t;
      let n = new Uint8Array(this.#o + t.byteLength);
      return (
        n.set(this.#n.subarray(0, this.#o)),
        n.set(t, this.#o),
        (this.#o = 0),
        n
      );
    }
    #c(e, t) {
      (this.#n.set(e.subarray(t)), (this.#o = e.length - t));
    }
    #t() {
      if (this.fatal) throw TypeError("MUtf8Decoder.decode: Decoding failed.");
      return 65533;
    }
  }
  function E(e) {
    let t = e.indexOf(":");
    if (t === -1) return ["minecraft", e];
    return [e.slice(0, t), e.slice(t + 1)];
  }
  function Be(e, t, n) {
    let [r, s, o] = e,
      [i, c, u] = t;
    switch (n) {
      case "down":
        return [r, o, i, u];
      case "up":
        return [r, o, i, u];
      case "north":
        return [16 - i, 16 - c, 16 - r, 16 - s];
      case "south":
        return [r, 16 - c, i, 16 - s];
      case "west":
        return [o, 16 - c, u, 16 - s];
      case "east":
        return [16 - u, 16 - c, 16 - o, 16 - s];
      default:
        return [0, 0, 16, 16];
    }
  }
  function Ae(e, t) {
    let n = {};
    for (let [s, o] of Object.entries(e.faces ?? {})) {
      if (!o || !o.texture) continue;
      let i = Oe(o.texture, t);
      if (!i) continue;
      let c = o.uv ? [o.uv[0], o.uv[1], o.uv[2], o.uv[3]] : Be(e.from, e.to, s),
        u = { texture: i, uv: c };
      if (o.rotation !== void 0) u.rotation = o.rotation;
      if (o.tintindex !== void 0) u.tintindex = o.tintindex;
      n[s] = u;
    }
    let r = {
      from: [e.from[0], e.from[1], e.from[2]],
      to: [e.to[0], e.to[1], e.to[2]],
      faces: n,
    };
    if (e.rotation) {
      let s = e.rotation,
        o = s.axis;
      if (o === "x" || o === "y" || o === "z")
        r.rotation = {
          origin: [s.origin[0], s.origin[1], s.origin[2]],
          axis: o,
          angle: s.angle,
        };
    }
    return r;
  }
  const De = new Set([
    "minecraft:oak_button",
    "minecraft:spruce_button",
    "minecraft:birch_button",
    "minecraft:jungle_button",
    "minecraft:acacia_button",
    "minecraft:dark_oak_button",
    "minecraft:mangrove_button",
    "minecraft:cherry_button",
    "minecraft:bamboo_button",
    "minecraft:crimson_button",
    "minecraft:warped_button",
    "minecraft:stone_button",
    "minecraft:polished_blackstone_button",
    "minecraft:lever",
  ]);
  function v([e, t, n]) {
    return [16 - n, t, e];
  }
  function I([e, t, n]) {
    return [e, 16 - n, t];
  }
  function Ie(e, t) {
    return [
      [Math.min(e[0], t[0]), Math.min(e[1], t[1]), Math.min(e[2], t[2])],
      [Math.max(e[0], t[0]), Math.max(e[1], t[1]), Math.max(e[2], t[2])],
    ];
  }
  function Z(e, t) {
    if (e === "x") return { axis: "z", angle: t };
    if (e === "z") return { axis: "x", angle: -t };
    return { axis: e, angle: t };
  }
  function Fe(e, t) {
    if (e === "y") return { axis: "z", angle: t };
    if (e === "z") return { axis: "y", angle: -t };
    return { axis: e, angle: t };
  }
  function Pe(e) {
    let t = {};
    if (e.north !== void 0) t.up = e.north;
    if (e.up !== void 0) t.south = e.up;
    if (e.south !== void 0) t.down = e.south;
    if (e.down !== void 0) t.north = e.down;
    if (e.east !== void 0) t.east = e.east;
    if (e.west !== void 0) t.west = e.west;
    return t;
  }
  function q(e) {
    let t = {};
    if (e.north !== void 0) t.east = e.north;
    if (e.east !== void 0) t.south = e.east;
    if (e.south !== void 0) t.west = e.south;
    if (e.west !== void 0) t.north = e.west;
    if (e.up !== void 0) t.up = e.up;
    if (e.down !== void 0) t.down = e.down;
    return t;
  }
  function Q(e, t, n) {
    let r = Math.round((t.x ?? 0) / 90) & 3,
      s = Math.round((t.y ?? 0) / 90) & 3;
    if (!r && !s) return e;
    return e.map((o) => {
      let i = [...o.from],
        c = [...o.to],
        u = o.rotation ? [...o.rotation.origin] : void 0,
        a = o.rotation?.axis,
        l = o.rotation?.angle,
        f = o.faces;
      for (let h = 0; h < r; h++) {
        if (((i = I(i)), (c = I(c)), u)) u = I(u);
        if (a !== void 0 && l !== void 0) ({ axis: a, angle: l } = Fe(a, l));
        f = Pe(f);
      }
      for (let h = 0; h < s; h++) {
        if (((i = v(i)), (c = v(c)), u)) u = v(u);
        if (a !== void 0 && l !== void 0) ({ axis: a, angle: l } = Z(a, l));
        f = q(f);
      }
      if (r > 0 && n && De.has(n))
        for (let h = 0; h < 2; h++) {
          if (((i = v(i)), (c = v(c)), u)) u = v(u);
          if (a !== void 0 && l !== void 0) ({ axis: a, angle: l } = Z(a, l));
          f = q(f);
        }
      let [m, d] = Ie(i, c);
      return {
        from: m,
        to: d,
        rotation:
          o.rotation && u && a !== void 0 && l !== void 0
            ? { origin: u, axis: a, angle: l }
            : void 0,
        faces: f,
      };
    });
  }
  const Ne = new Set([
    "minecraft:glass",
    "minecraft:glass_pane",
    "minecraft:tinted_glass",
    "minecraft:white_stained_glass",
    "minecraft:white_stained_glass_pane",
    "minecraft:orange_stained_glass",
    "minecraft:orange_stained_glass_pane",
    "minecraft:magenta_stained_glass",
    "minecraft:magenta_stained_glass_pane",
    "minecraft:light_blue_stained_glass",
    "minecraft:light_blue_stained_glass_pane",
    "minecraft:yellow_stained_glass",
    "minecraft:yellow_stained_glass_pane",
    "minecraft:lime_stained_glass",
    "minecraft:lime_stained_glass_pane",
    "minecraft:pink_stained_glass",
    "minecraft:pink_stained_glass_pane",
    "minecraft:gray_stained_glass",
    "minecraft:gray_stained_glass_pane",
    "minecraft:light_gray_stained_glass",
    "minecraft:light_gray_stained_glass_pane",
    "minecraft:cyan_stained_glass",
    "minecraft:cyan_stained_glass_pane",
    "minecraft:purple_stained_glass",
    "minecraft:purple_stained_glass_pane",
    "minecraft:blue_stained_glass",
    "minecraft:blue_stained_glass_pane",
    "minecraft:brown_stained_glass",
    "minecraft:brown_stained_glass_pane",
    "minecraft:green_stained_glass",
    "minecraft:green_stained_glass_pane",
    "minecraft:red_stained_glass",
    "minecraft:red_stained_glass_pane",
    "minecraft:black_stained_glass",
    "minecraft:black_stained_glass_pane",
    "minecraft:oak_trapdoor",
    "minecraft:jungle_trapdoor",
    "minecraft:acacia_trapdoor",
    "minecraft:mangrove_trapdoor",
    "minecraft:cherry_trapdoor",
    "minecraft:bamboo_trapdoor",
    "minecraft:crimson_trapdoor",
    "minecraft:warped_trapdoor",
    "minecraft:iron_trapdoor",
    "minecraft:copper_trapdoor",
    "minecraft:exposed_copper_trapdoor",
    "minecraft:weathered_copper_trapdoor",
    "minecraft:oxidized_copper_trapdoor",
    "minecraft:waxed_copper_trapdoor",
    "minecraft:waxed_exposed_copper_trapdoor",
    "minecraft:waxed_weathered_copper_trapdoor",
    "minecraft:waxed_oxidized_copper_trapdoor",
    "minecraft:oak_leaves",
    "minecraft:spruce_leaves",
    "minecraft:birch_leaves",
    "minecraft:jungle_leaves",
    "minecraft:acacia_leaves",
    "minecraft:dark_oak_leaves",
    "minecraft:mangrove_leaves",
    "minecraft:mangrove_roots",
    "minecraft:cherry_leaves",
    "minecraft:pale_oak_leaves",
    "minecraft:azalea_leaves",
    "minecraft:flowering_azalea_leaves",
  ]);
  const Le = {
    north: "south",
    south: "north",
    east: "west",
    west: "east",
    up: "down",
    down: "up",
  };
  const Ue = {
    north: [0, 0, -1],
    south: [0, 0, 1],
    east: [1, 0, 0],
    west: [-1, 0, 0],
    up: [0, 1, 0],
    down: [0, -1, 0],
  };
  function oe([e, t, n]) {
    return `${e},${t},${n}`;
  }
  function ne(e, t) {
    switch (t) {
      case "north":
        return e.from[2];
      case "south":
        return e.to[2];
      case "west":
        return e.from[0];
      case "east":
        return e.to[0];
      case "down":
        return e.from[1];
      case "up":
        return e.to[1];
    }
  }
  function re(e, t) {
    let [n, r, s] = e.from,
      [o, i, c] = e.to;
    switch (t) {
      case "north":
      case "south":
        return [n, r, o, i];
      case "west":
      case "east":
        return [s, r, c, i];
      case "down":
      case "up":
        return [n, s, o, c];
    }
  }
  function $e(e, t) {
    let [n, r, s, o] = e;
    if (n >= s || r >= o) return !0;
    for (let [a, l, f, m] of t)
      if (a <= n && f >= s && l <= r && m >= o) return !0;
    let i = t
      .map(([a, l, f, m]) => [
        Math.max(a, n),
        Math.max(l, r),
        Math.min(f, s),
        Math.min(m, o),
      ])
      .filter(([a, l, f, m]) => a < f && l < m);
    if (!i.length) return !1;
    let c = new Set([r, o]);
    for (let [, a, , l] of i) (c.add(a), c.add(l));
    let u = [...c].filter((a) => a >= r && a < o).sort((a, l) => a - l);
    for (let a of u) {
      let l = i
        .filter(([, m, , d]) => m <= a && d > a)
        .map(([m, , d]) => [m, d]);
      l.sort(([m], [d]) => m - d);
      let f = n;
      for (let [m, d] of l) {
        if (m > f) return !1;
        f = Math.max(f, d);
      }
      if (f < s) return !1;
    }
    return !0;
  }
  function se(e, t, n) {
    let r = new Map();
    for (let s of e) {
      let o = t[s.state],
        i = n[s.state]?.name ?? "";
      if (o?.length) r.set(oe(s.pos), { elements: o, name: i });
    }
    return r;
  }
  function ie(e, t, n) {
    return e.map((r) => {
      if (r.rotation && (r.rotation.axis === "x" || r.rotation.axis === "z"))
        return r;
      let s = { ...r.faces };
      for (let o of Object.keys(s)) {
        let i = ne(r, o);
        if (i !== 0 && i !== 16) continue;
        let c = Ue[o],
          u = oe([t[0] + c[0], t[1] + c[1], t[2] + c[2]]),
          a = n.get(u);
        if (!a) continue;
        if (Ne.has(a.name)) continue;
        let l = Le[o],
          f = i === 0 ? 16 : 0,
          m = a.elements.filter((d) => ne(d, l) === f).map((d) => re(d, l));
        if ($e(re(r, o), m)) delete s[o];
      }
      return { ...r, faces: s };
    });
  }
  function ae(e) {
    return e.reduce((t, n) => t + Object.keys(n.faces).length, 0);
  }
  function N(e, t, n) {
    return [
      (e[0] * 16 + t[0]) / n,
      (e[1] * 16 + t[1]) / n,
      (e[2] * 16 + t[2]) / n,
    ];
  }
  async function K(root, id, cache) {
    if (cache.has(id)) return cache.get(id);
    const chain = await Ce(root, id),
      textures = Object.create(null);
    for (const model of [...chain].reverse())
      Object.assign(textures, model.textures);
    const source = chain.find((model) => Array.isArray(model.elements));
    const result = {
      elements: (source?.elements || []).map((element) =>
        Ae(element, textures),
      ),
    };
    cache.set(id, result);
    return result;
  }
  function Oe(id, textures) {
    const seen = new Set();
    while (id.startsWith("#")) {
      if (
        seen.has(id) ||
        seen.size >= 128 ||
        typeof textures[id.slice(1)] !== "string"
      )
        throw Error("Missing or cyclic texture alias: " + id);
      seen.add(id);
      id = textures[id.slice(1)];
    }
    return id;
  }
  // Missing properties do not match specified variants. Minecraft multipart
  // predicates may nest AND/OR; preserve the pinned deterministic first choice
  // when an apply/variant contains weighted alternatives.
  function matches(condition, properties) {
    return Object.entries(condition).every(([key, value]) => {
      if (key === "OR" || key === "AND") {
        if (!Array.isArray(value)) throw Error("Invalid multipart condition");
        return key === "OR"
          ? value.some((c) => matches(c, properties))
          : value.every((c) => matches(c, properties));
      }
      if (typeof value !== "string")
        throw Error("Invalid block state property");
      return value.split("|").includes(properties[key]);
    });
  }
  function H(state, properties) {
    const first = (value) => (Array.isArray(value) ? value[0] : value);
    if (state.variants) {
      const candidates = Object.entries(state.variants)
        .filter(
          ([key]) =>
            !key ||
            key.split(",").every((pair) => {
              const i = pair.indexOf("=");
              return (
                i > 0 && properties[pair.slice(0, i)] === pair.slice(i + 1)
              );
            }),
        )
        .sort(
          ([a], [b]) =>
            (b ? b.split(",").length : 0) - (a ? a.split(",").length : 0),
        );
      return candidates.length ? [first(candidates[0][1])] : [];
    }
    return (state.multipart || [])
      .filter((part) => !part.when || matches(part.when, properties))
      .map((part) => first(part.apply));
  }
  // Resolve parents before mutation, report missing assets/cycles instead of silently
  // producing a truncated model. Identifier validation belongs to readModel.
  async function Ce(root, id) {
    const chain = [],
      seen = new Set();
    while (id) {
      if (seen.has(id) || seen.size >= 128)
        throw Error("Cyclic or excessive model inheritance: " + id);
      seen.add(id);
      const model = await readModel(root, id);
      chain.push(model);
      id = model.parent;
    }
    return chain;
  }
  return {
    decodeString: (bytes) => new O("mutf-8", { fatal: true }).decode(bytes),
    variants: H,
    model: K,
    rotate: Q,
    neighbours: se,
    cull: ie,
    position: N,
  };
}
