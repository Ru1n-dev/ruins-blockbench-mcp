import type { BB } from "./adapter.ts";

export function installAmbientOcclusion(b: BB) {
  const proto = b.BBPlugin.prototype,
    load = proto.runOnLoad;
  const loaded = function (this: any, ...args: any[]) {
    if (this.id !== "ambient_occlusion" || this.version !== "1.0.4")
      return load.apply(this, args);
    const previewProto = b.Preview.prototype,
      render = previewProto.render,
      resize = previewProto.resize;
    const owned = new Map<
      any,
      {
        previous: Record<string, PropertyDescriptor | undefined>;
        composer?: any;
        sao?: any;
      }
    >();
    const remember = (preview: any) => {
      if (!owned.has(preview))
        owned.set(preview, {
          previous: Object.fromEntries(
            ["composer", "saoPass", "renderPass"].map((key) => [
              key,
              Object.getOwnPropertyDescriptor(preview, key),
            ]),
          ),
        });
      return owned.get(preview)!;
    };
    for (const preview of b.Preview.all)
      if (preview !== b.MediaPreview) remember(preview);
    let result;
    try {
      result = load.apply(this, args);
    } finally {
      previewProto.render = render;
      previewProto.resize = resize;
    }
    const unload = this.onunload;
    let active = true;
    for (const [preview, entry] of owned) {
      entry.composer = preview.composer;
      entry.sao = preview.saoPass;
    }
    const setup = (preview: any) => {
      const entry = remember(preview);
      if (!entry.composer) {
        preview.composer = entry.composer = new b.THREE.EffectComposer(
          preview.renderer,
        );
        preview.renderPass = new b.THREE.RenderPass(
          b.Canvas.scene,
          preview.camera,
        );
        preview.saoPass = entry.sao = new b.THREE.SAOPass(
          b.Canvas.scene,
          preview.camera,
          false,
          true,
        );
        entry.composer.addPass(preview.renderPass);
        entry.composer.addPass(entry.sao);
      }
      const pass = entry.sao,
        composer = entry.composer,
        camera = preview.camera;
      pass.scene = preview.renderPass.scene = b.Canvas.scene;
      pass.camera = preview.renderPass.camera = camera;
      pass.params.saoIntensity =
        Math.max(
          0,
          Math.min(50, b.settings.ambient_occlusion_intensity.value),
        ) / 100;
      pass.params.saoScale = 2900;
      const perspective = camera.isPerspectiveCamera ? 1 : 0;
      for (const material of [
        pass.saoMaterial,
        pass.vBlurMaterial,
        pass.hBlurMaterial,
      ]) {
        if (material.defines.PERSPECTIVE_CAMERA !== perspective) {
          material.defines.PERSPECTIVE_CAMERA = perspective;
          material.needsUpdate = true;
        }
      }
      pass.saoMaterial.uniforms.cameraProjectionMatrix.value =
        camera.projectionMatrix;
      pass.saoMaterial.uniforms.cameraInverseProjectionMatrix.value
        .copy(camera.projectionMatrix)
        .invert();
      if (composer._pixelRatio !== preview.renderer.getPixelRatio())
        composer.setPixelRatio(preview.renderer.getPixelRatio());
      if (
        composer._width !== preview.width ||
        composer._height !== preview.height
      )
        composer.setSize(preview.width, preview.height);
      return composer;
    };
    const enabled = b.settings.ambient_occlusion_enabled;
    enabled.value = enabled.value === "true" || enabled.value === true;
    enabled.onChange = (value: boolean) => {
      if (value)
        for (const p of b.Preview.all) if (p !== b.MediaPreview) setup(p);
    };
    const rendering = function (this: any, ...values: any[]) {
      if (!active || this === b.MediaPreview || !enabled.value)
        return render.apply(this, values);
      const composer = setup(this),
        renderer = this.renderer,
        original = renderer.render,
        target = renderer.getRenderTarget();
      const scene = b.Canvas.scene,
        override = scene.overrideMaterial;
      // Retain native control updates and any earlier render wrapper. Route only its main scene draw.
      renderer.render = function (
        this: any,
        s: any,
        camera: any,
        ...args: any[]
      ) {
        if (s !== scene || camera !== composer.passes[0].camera)
          return original.call(this, s, camera, ...args);
        renderer.render = original;
        return composer.render();
      };
      try {
        return render.apply(this, values);
      } finally {
        renderer.render = original;
        renderer.setRenderTarget(target);
        scene.overrideMaterial = override;
      }
    };
    const resizing = function (this: any, ...values: any[]) {
      const result = resize.apply(this, values);
      if (active && this !== b.MediaPreview && enabled.value) setup(this);
      return result;
    };
    previewProto.render = rendering;
    previewProto.resize = resizing;
    this.onunload = function (this: any, ...values: any[]) {
      if (!active) return;
      active = false;
      const next = this.onload;
      this.onload = function (this: any, ...args: any[]) {
        this.onunload = unload;
        this.onload = next;
        return next.apply(this, args);
      };
      try {
        return unload.apply(this, values);
      } finally {
        if (previewProto.render === rendering) previewProto.render = render;
        if (previewProto.resize === resizing) previewProto.resize = resize;
        const resources = new Set<any>();
        for (const [preview, entry] of owned) {
          for (const object of [
            entry.composer,
            entry.sao,
            entry.composer?.copyPass,
          ])
            if (object) {
              for (const value of Object.values(object) as any[])
                if (value?.isMaterial || value?.isWebGLRenderTarget)
                  resources.add(value);
              if (object.fsQuad?._mesh?.geometry)
                resources.add(object.fsQuad._mesh.geometry);
            }
          for (const [key, descriptor] of Object.entries(entry.previous)) {
            if (descriptor) Object.defineProperty(preview, key, descriptor);
            else delete preview[key];
          }
        }
        for (const resource of resources) resource.dispose();
        owned.clear();
      }
    };
    return result;
  };
  proto.runOnLoad = loaded;
  return () => {
    if (proto.runOnLoad === loaded) proto.runOnLoad = load;
  };
}
