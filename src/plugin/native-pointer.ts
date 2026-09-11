import { Fault } from "../shared/types.ts";

export function pointerGesture(element: HTMLElement, args: any) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0)
    throw new Fault("UI_HIDDEN", "Pointer target has no visible area");
  const points = args.points.map(([x, y]: number[], index: number) => ({
    clientX: rect.left + Math.min(x * rect.width, rect.width - 0.01),
    clientY: rect.top + Math.min(y * rect.height, rect.height - 0.01),
    pressure: args.pressures?.[index] ?? args.pressure ?? 0.5,
  }));
  for (const point of points) {
    const hit = document.elementFromPoint(point.clientX, point.clientY);
    if (!hit || !(hit === element || element.contains(hit)))
      throw new Fault(
        "UI_OCCLUDED",
        "Pointer path is covered or outside the viewport",
        {
          point,
          target: { tag: element.tagName, id: element.id },
          hit: hit ? { tag: hit.tagName, id: hit.id } : null,
        },
      );
  }
  const button = { left: 0, middle: 1, right: 2 }[
    args.button as "left" | "middle" | "right"
  ];
  const mask = { left: 1, middle: 4, right: 2 }[
    args.button as "left" | "middle" | "right"
  ];
  let lastTarget: Element = element;
  const emit = (type: string, point: any, buttons: number, dx = 0, dy = 0) => {
    const options = {
      ...point,
      button,
      buttons,
      bubbles: true,
      cancelable: true,
      composed: true,
      shiftKey: args.shift,
      ctrlKey: args.ctrl,
      altKey: args.alt,
    };
    const event = type.startsWith("pointer")
      ? new PointerEvent(type, {
          ...options,
          pointerId: 1,
          pointerType: args.pointer_type ?? "mouse",
          isPrimary: true,
          pressure: buttons ? point.pressure : 0,
          tiltX: args.tilt_x ?? 0,
          tiltY: args.tilt_y ?? 0,
          twist: args.twist ?? 0,
        })
      : new MouseEvent(type, options);
    Object.defineProperties(event, {
      movementX: { value: dx },
      movementY: { value: dy },
    });
    let target: Element | Document = element.isConnected ? element : document;
    if(args.dispatch_target==='hit'){
      const hit=document.elementFromPoint(point.clientX,point.clientY);
      if(hit && element.isConnected && (hit===element||element.contains(hit)))lastTarget=hit;
      else if(type!=='pointerup'&&type!=='mouseup')throw new Fault('UI_OCCLUDED','Pointer target changed outside the inspected subtree during dispatch');
      target=lastTarget.isConnected?lastTarget:document;
    }
    target.dispatchEvent(event);
  };
  let last = points[0];
  emit("pointermove", last, 0);
  emit("mousemove", last, 0);
  try {
    emit("pointerdown", last, mask);
    emit("mousedown", last, mask);
    for (const point of points.slice(1)) {
      if (!element.isConnected)
        throw new Fault(
          "STALE_UI",
          "Pointer target was removed during the gesture",
        );
      const dx = point.clientX - last.clientX,
        dy = point.clientY - last.clientY;
      last = point;
      emit("pointermove", last, mask, dx, dy);
      emit("mousemove", last, mask, dx, dy);
    }
  } finally {
    emit("pointerup", last, 0);
    emit("mouseup", last, 0);
  }
  if (points.length === 1)
    emit(button === 2 ? "contextmenu" : "click", last, 0);
}
