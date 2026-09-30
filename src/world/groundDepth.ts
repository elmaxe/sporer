import * as THREE from 'three';

/**
 * Layer of the meshes that end an atmosphere's view rays (the low-orbit
 * globe's terrain chunks and sea): GroundDepth draws only these.
 */
export const GROUND_LAYER = 1;

/**
 * The ground's depth as seen by the camera, for the atmosphere shader
 * (atmosphereShell.ts): its haze runs along each view ray down to where this
 * says the ground is. Up close the relief is exaggerated, so the ground is
 * nowhere near the sea-level sphere the shader would otherwise stop at: rays
 * would run on through the hills in front and haze them with the air behind
 * them, drawing the hidden sphere's horizon over the terrain.
 *
 * A depth-only pass of the GROUND_LAYER meshes before the scene, into a
 * texture the size of the drawing buffer.
 */
export class GroundDepth {
  /** Shared by the atmosphere materials that read it (see createAtmosphere's `ground`). */
  readonly uniforms = {
    groundDepth: { value: null as THREE.Texture | null },
    groundSize: { value: new THREE.Vector2(1, 1) },
    groundNear: { value: 0.1 },
    groundFar: { value: 1 },
  };
  private readonly target: THREE.WebGLRenderTarget;
  private readonly material = new THREE.MeshBasicMaterial({ colorWrite: false });
  private readonly size = new THREE.Vector2();
  private readonly layers = new THREE.Layers();

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    this.uniforms.groundDepth.value = this.target.depthTexture;
  }

  /** Draws the ground of `scene` as `camera` sees it (call before drawing the scene with that camera). */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const { x, y } = renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== x || this.target.height !== y) this.target.setSize(x, y);
    this.uniforms.groundSize.value.set(x, y);
    this.uniforms.groundNear.value = camera.near;
    this.uniforms.groundFar.value = camera.far;

    const target = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const override = scene.overrideMaterial;
    const background = scene.background;
    this.layers.mask = camera.layers.mask;
    camera.layers.set(GROUND_LAYER);
    scene.overrideMaterial = this.material;
    scene.background = null;
    renderer.setRenderTarget(this.target);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.setRenderTarget(target);
    renderer.autoClear = autoClear;
    scene.overrideMaterial = override;
    scene.background = background;
    camera.layers.mask = this.layers.mask;
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
  }
}
