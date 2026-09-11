import type { BB } from "./adapter.ts";

export function bindIconCamera(
  b: BB,
  preview: any,
  values: () => any,
  active: () => boolean,
) {
  const camera = preview.camera,
    render = preview.render;
  const base = {
    position: camera.position.clone(),
    target: preview.controls.target.clone(),
    up: camera.up.clone(),
    zoom: camera.zoom,
  };
  let rendering = false;
  preview.render = function (...args: any[]) {
    if (!active()) return;
    if (rendering) return render.apply(this, args);
    rendering = true;
    try {
      const v = values();
      const offset = base.position.clone().sub(base.target),
        up = base.up.clone().normalize();
      let target = base.target.clone();
      const rad = (key: string) => ((Number(v[key]) || 0) * Math.PI) / 180;
      offset.applyAxisAngle(up, rad("rotate_y"));
      const pitch = up.clone().cross(offset).normalize();
      if (pitch.lengthSq() > 0) offset.applyAxisAngle(pitch, rad("rotate_x"));
      const back = offset.clone().normalize();
      up.applyAxisAngle(back.clone().negate(), rad("rotate_z"));
      const right = up.clone().cross(back).normalize();
      const screenUp = back.clone().cross(right).normalize();
      camera.zoom = base.zoom;
      if (v.auto_frame !== false) {
        const box = new b.THREE.Box3();
        for (const element of b.Outliner.elements) {
          const mesh = element.mesh;
          if (!mesh?.geometry || !mesh.visible) continue;
          let hidden = false;
          for (
            let node = element;
            node && typeof node === "object";
            node = node.parent
          )
            if (node.visibility === false) hidden = true;
          if (hidden) continue;
          mesh.updateWorldMatrix(true, false);
          mesh.geometry.computeBoundingBox();
          if (mesh.geometry.boundingBox)
            box.union(
              mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
            );
        }
        if (!box.isEmpty()) {
          target = box.getCenter(new b.THREE.Vector3());
          let halfX = 0,
            halfY = 0,
            distance = 0,
            depth = 0;
          const tanY =
              Math.tan(((camera.fov || 45) * Math.PI) / 360) / (base.zoom || 1),
            tanX = tanY;
          for (const x of [box.min.x, box.max.x])
            for (const y of [box.min.y, box.max.y])
              for (const z of [box.min.z, box.max.z]) {
                const delta = new b.THREE.Vector3(x, y, z).sub(target);
                const h = Math.abs(delta.dot(right)),
                  w = Math.abs(delta.dot(screenUp)),
                  d = delta.dot(back);
                halfX = Math.max(halfX, h);
                halfY = Math.max(halfY, w);
                depth = Math.max(depth, Math.abs(d));
                distance = Math.max(distance, h / tanX + d, w / tanY + d);
              }
          if (camera.isOrthographicCamera) {
            camera.zoom = Math.min(
              (camera.right - camera.left) / (2 * Math.max(halfX, 0.001) * 1.1),
              (camera.top - camera.bottom) / (2 * Math.max(halfY, 0.001) * 1.1),
            );
            offset
              .copy(back)
              .multiplyScalar(
                Math.max(depth * 2 + 10, base.position.distanceTo(base.target)),
              );
          } else
            offset.copy(back).multiplyScalar(Math.max(distance * 1.1, 0.1));
          camera.near = Math.min(camera.near, 0.01);
          camera.far = Math.max(
            camera.far,
            offset.length() + box.getSize(new b.THREE.Vector3()).length() * 4,
          );
        }
      }
      const zoom = Number(v.zoom_level) || 1;
      if (camera.isOrthographicCamera) camera.zoom /= zoom;
      else offset.multiplyScalar(zoom);
      target
        .addScaledVector(right, (Number(v.pan_x) || 0) * 2)
        .addScaledVector(up, (Number(v.pan_y) || 0) * 2);
      camera.position.copy(target).add(offset);
      camera.up.copy(up);
      preview.controls.target.copy(target);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      return render.apply(this, args);
    } finally {
      rendering = false;
    }
  };
}
