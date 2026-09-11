// Action.trigger and the generated Action.click wrapper discard callback
// return values in 5.1.6. Observe the callback itself without bypassing events.
export function observeActionPromises(action: any, run: () => unknown) {
  return observeCallbackPromises(action, ["click", "onClick"], run);
}
export function observeDialogPromises(dialog: any, run: () => unknown) {
  return observeCallbackPromises(
    dialog,
    ["onConfirm", "onCancel", "onButton"],
    run,
  );
}
function observeCallbackPromises(
  action: any,
  names: string[],
  run: () => unknown,
) {
  const promises = new Set<Promise<unknown>>();
  const restorers: Array<() => void> = [];
  for (const name of names) {
    const original = action[name];
    if (typeof original !== "function") continue;
    const observed = function (this: any, ...args: any[]) {
      const result = original.apply(this, args);
      if (result && typeof result.then === "function") {
        const promise = Promise.resolve(result);
        promise.catch(() => {});
        promises.add(promise);
      }
      return result;
    };
    action[name] = observed;
    restorers.push(() => {
      if (action[name] === observed) action[name] = original;
    });
  }
  try {
    return { dispatched: run(), promises: [...promises] };
  } finally {
    for (const restore of restorers.reverse()) restore();
  }
}
