const named: Record<string, [string, number]> = {
  Enter: ["Enter", 13],
  Escape: ["Escape", 27],
  Tab: ["Tab", 9],
  ArrowLeft: ["ArrowLeft", 37],
  ArrowUp: ["ArrowUp", 38],
  ArrowRight: ["ArrowRight", 39],
  ArrowDown: ["ArrowDown", 40],
  Home: ["Home", 36],
  End: ["End", 35],
  Delete: ["Delete", 46],
  Backspace: ["Backspace", 8],
  Shift: ["ShiftLeft", 16],
  Control: ["ControlLeft", 17],
  Alt: ["AltLeft", 18],
  Meta: ["MetaLeft", 91],
  " ": ["Space", 32],
};
const punctuation: Array<[string, string, number]> = [
  [";:", "Semicolon", 186],
  ["=+", "Equal", 187],
  [",<", "Comma", 188],
  ["-_", "Minus", 189],
  [".>", "Period", 190],
  ["/?", "Slash", 191],
  ["`~", "Backquote", 192],
  ["[{", "BracketLeft", 219],
  ["\\|", "Backslash", 220],
  ["]}", "BracketRight", 221],
  ["'\"", "Quote", 222],
];

export function keyboardInit(
  key: string,
  modifiers: {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    meta?: boolean;
  } = {},
): KeyboardEventInit {
  let [code, keyCode] = named[key] ?? ["", 0];
  if (/^[a-z]$/i.test(key)) {
    code = `Key${key.toUpperCase()}`;
    keyCode = key.toUpperCase().charCodeAt(0);
  } else if (/^[0-9]$/.test(key)) {
    code = `Digit${key}`;
    keyCode = key.charCodeAt(0);
  } else if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key)) {
    code = key;
    keyCode = 111 + Number(key.slice(1));
  } else if (punctuation.some(([chars]) => chars.includes(key))) {
    const p = punctuation.find(([chars]) => chars.includes(key))!;
    code = p[1];
    keyCode = p[2];
  } else if ("!@#$%^&*()".includes(key)) {
    const digit = ("!@#$%^&*()".indexOf(key) + 1) % 10;
    code = `Digit${digit}`;
    keyCode = 48 + digit;
  }
  return {
    key,
    code,
    keyCode,
    which: keyCode,
    shiftKey: !!modifiers.shift,
    ctrlKey: !!modifiers.ctrl,
    altKey: !!modifiers.alt,
    metaKey: !!modifiers.meta,
    bubbles: true,
    cancelable: true,
  };
}

export function keyboardChord(
  key: string,
  modifiers: Parameters<typeof keyboardInit>[1] = {},
) {
  const keys: Record<string, string> = {
    ctrl: "Control",
    alt: "Alt",
    shift: "Shift",
    meta: "Meta",
  };
  const flagByKey = Object.fromEntries(
    Object.entries(keys).map(([flag, key]) => [key, flag]),
  );
  const sequence = [
    ...Object.entries(keys)
      .filter(
        ([flag, name]) =>
          modifiers?.[flag as keyof typeof modifiers] && name !== key,
      )
      .map(([, name]) => name),
    key,
  ];
  const flags: Record<string, boolean> = {};
  const down = sequence.map((name) => {
    if (flagByKey[name]) flags[flagByKey[name]] = true;
    return keyboardInit(name, flags);
  });
  const up = sequence.map(() => ({}) as KeyboardEventInit);
  for (let i = sequence.length - 1; i >= 0; i--) {
    const name = sequence[i];
    if (flagByKey[name]) flags[flagByKey[name]] = false;
    up[i] = keyboardInit(name, flags);
  }
  return { down, up };
}
