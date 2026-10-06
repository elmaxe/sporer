import * as THREE from 'three';

/**
 * The layer a scene's sky is on as well as its own (the galaxy band, its
 * stars, the nebulas, the sky stars, the lab's starfield): what `SkyCapture`
 * bakes. Everything else stays off it.
 */
export const SKY_LAYER = 5;

/** Puts `object` on the sky layer too (it keeps its own), so `SkyCapture` sees it. */
export function markSky(object: THREE.Object3D): void {
  object.layers.enable(SKY_LAYER);
}

/**
 * A scene's sky, baked once into a cube map from what is on `SKY_LAYER`: the
 * background a black hole bends (world/BlackHoleLook.ts), sampled along each
 * ray's bent direction. The sky is drawn at infinity (rotation-only views),
 * so one bake serves the whole scene from anywhere in it. Baked on first use
 * (`capture`, called from the first draw that needs it, as GalaxyBand bakes
 * its own), so the sky's own bakes have run.
 */
export class SkyCapture {
  private readonly target: THREE.WebGLCubeRenderTarget;
  private readonly camera: THREE.CubeCamera;
  private captured = false;

  constructor(size = 512) {
    this.target = new THREE.WebGLCubeRenderTarget(size, { generateMipmaps: false });
    // sRGB storage keeps the faint sky free of banding in 8 bits, as the band's own bake does.
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.CubeCamera(0.1, 30000, this.target);
    for (const face of this.camera.children) face.layers.set(SKY_LAYER);
  }

  /** The baked sky (black until `capture` has run). */
  get texture(): THREE.CubeTexture {
    return this.target.texture;
  }

  /** Whether it has been baked. */
  get ready(): boolean {
    return this.captured;
  }

  /** Bakes `scene`'s sky, the first time only. */
  capture(renderer: THREE.WebGLRenderer, scene: THREE.Object3D): void {
    if (this.captured) return;
    this.captured = true;
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    this.camera.update(renderer, scene);
    renderer.autoClear = autoClear;
  }

  /** Bakes again on the next use (the sky changed, e.g. a debug slider). */
  invalidate(): void {
    this.captured = false;
  }

  dispose(): void {
    this.target.dispose();
  }
}
