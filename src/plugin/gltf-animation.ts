import type { BB } from "./adapter.ts";
import { Fault } from "../shared/types.ts";

export function importGltfAnimations(
  b: BB,
  gltf: any,
  content: any,
  scale: number,
) {
  for (const clip of gltf.animations ?? []) {
    const prepared: any[] = [];
    for (const track of clip.tracks) {
      const binding = b.THREE.PropertyBinding.parseTrackName(track.name);
      let element = content.nodeToElementMap.get(binding.nodeName);
      if (element?.type === "mesh" && !element.constructor.animator) {
        const mesh = element;
        element = new b.Group({
          name: `${mesh.name} motion`,
          origin: [...mesh.origin],
          rotation: [...mesh.rotation],
        })
          .addTo(mesh.parent)
          .init();
        element.userData = mesh.userData;
        mesh.rotation = [0, 0, 0];
        mesh.addTo(element);
        for (const [key, value] of content.nodeToElementMap)
          if (value === mesh) content.nodeToElementMap.set(key, element);
        b.Canvas.updateAll();
      }
      if (!element?.constructor.animator)
        throw new Fault(
          "GLTF_ANIMATION_TARGET",
          "Animation target was not imported; enable groups for group animation",
          { track: track.name },
        );
      const channel = (
        {
          position: "position",
          quaternion: "rotation",
          scale: "scale",
        } as Record<string, string>
      )[binding.propertyName];
      if (!channel)
        throw new Fault(
          "GLTF_ANIMATION_CHANNEL",
          "This importer needs an adapter for morph animation",
        );
      const size = channel === "rotation" ? 4 : 3;
      if (track.values.length !== track.times.length * size)
        throw new Fault(
          "GLTF_ANIMATION_CUBIC",
          "Cubic spline animation needs conversion before this adapter can import it",
        );
      const interpolation =
        track.getInterpolation() === b.THREE.InterpolateDiscrete
          ? "step"
          : "linear";
      let previous: number[] | undefined;
      const keys = Array.from(
        track.times as ArrayLike<number>,
        (time: number, i: number) => {
          let values = Array.from(
            track.values.slice(i * size, (i + 1) * size),
          ) as number[];
          if (channel === "position")
            values = values.map(
              (n, j) =>
                n * scale - (element.userData?.gltfTranslation?.[j] ?? 0),
            );
          if (channel === "scale")
            values = values.map(
              (n, j) => n / (element.userData?.gltfScale?.[j] ?? 1),
            );
          if (channel === "rotation") {
            const euler = new b.THREE.Euler().setFromQuaternion(
              new b.THREE.Quaternion().fromArray(values),
              element.mesh.rotation.order,
            );
            values = [euler.x, euler.y, euler.z].map(
              (n, j) => (n * 180) / Math.PI - element.rotation[j],
            );
            if (previous)
              values = values.map(
                (n, j) => n + 360 * Math.round((previous![j] - n) / 360),
              );
            previous = values;
          }
          if (!Number.isFinite(time) || !values.every(Number.isFinite))
            throw new Fault(
              "GLTF_ANIMATION_NUMBER",
              "Animation has nonfinite values or zero rest scale",
            );
          return {
            channel,
            time,
            interpolation,
            data_points: [
              Object.fromEntries(
                ["x", "y", "z"].map((axis, j) => [axis, String(values[j])]),
              ),
            ],
          };
        },
      );
      prepared.push({ element, keys, channel });
    }
    const animation = new b.Animation({
      name: clip.name || "Imported animation",
      length: clip.duration,
    }).add();
    for (const { element, keys, channel } of prepared) {
      const animator = animation.getBoneAnimator(element);
      if (channel === "rotation") animator.quaternion_interpolation = true;
      for (const key of keys) animator.addKeyframe(key);
    }
  }
}
