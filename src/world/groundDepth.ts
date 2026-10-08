import * as THREE from 'three';
import { beginFrozenCulling, endFrozenCulling } from './viewFreeze';

/**
 * Layer of the meshes that end an atmosphere's view rays (the low-orbit
 * globe's terrain chunks and sea): GroundDepth draws only these.
 */
export const GROUND_LAYER = 1;

/**
 * Layer of things standing on the ground (the plants): GroundDepth draws them
 * in a second pass with their own materials, so that a fragment they discard
 * (a plant fading out with a dither) leaves the ground behind it showing,
 * and the haze stops at the plant, not at the ground behind it. Those
 * materials read `groundDepthPass` and end the fragment right after the
 * discard test.
 */
export const GROUND_DETAIL_LAYER = 2;

/**
 * Puts a light on the ground layers too, so GroundDepth's passes see the same lights as the scene's own pass.
 * three.js keys every lit material's program on the lights it sees: a pass without them makes each lit material
 * look its program up again on every pass, every frame (a few ms and a lot of garbage near the ground). Every light
 * in a scene GroundDepth draws goes through this.
 */
export function onGroundLayers<T extends THREE.Light>(light: T): T {
  light.layers.enable(GROUND_LAYER);
  light.layers.enable(GROUND_DETAIL_LAYER);
  return light;
}

/** True while GroundDepth draws the GROUND_DETAIL_LAYER meshes: their shaders skip the shading. */
export const groundDepthPass = { value: false };

/**
 * The ground's depth as seen by the camera, for the atmosphere shader
 * (atmosphereShell.ts): its haze runs along each view ray down to where this
 * says the ground is. Up close the relief is exaggerated, so the ground is
 * nowhere near the sea-level sphere the shader would otherwise stop at: rays
 * would run on through the hills in front and haze them with the air behind
 * them, drawing the hidden sphere's horizon over the terrain.
 *
 * A depth-only pass of the GROUND_LAYER meshes before the scene, into a
 * texture the size of the drawing buffer, then the GROUND_DETAIL_LAYER ones.
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
  /**
   * Each GROUND_DETAIL_LAYER material's twin for the second pass (see `depthTwin`), and the meshes swapped to theirs
   * for it. A material drawn both into this texture and onto the screen would have its program looked up again at
   * every switch, twice a frame (three.js keys programs on the target's tone mapping and colour space).
   */
  private readonly twins = new WeakMap<THREE.Material, THREE.Material>();
  private readonly swapped: { mesh: THREE.Mesh; material: THREE.Material }[] = [];

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

    // While the view is frozen, the ground the frozen camera would draw (see world/viewFreeze.ts).
    beginFrozenCulling(scene, camera);
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
    // Things on the ground, with their own materials (see GROUND_DETAIL_LAYER), on top of the ground's depth.
    camera.layers.set(GROUND_DETAIL_LAYER);
    scene.overrideMaterial = null;
    renderer.autoClear = false;
    this.swapToTwins(scene);
    groundDepthPass.value = true;
    renderer.render(scene, camera);
    groundDepthPass.value = false;
    this.swapBack();
    renderer.setRenderTarget(target);
    renderer.autoClear = autoClear;
    scene.overrideMaterial = override;
    scene.background = background;
    camera.layers.mask = this.layers.mask;
    endFrozenCulling();
  }

  private swapToTwins(scene: THREE.Scene): void {
    scene.traverseVisible((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || !o.layers.isEnabled(GROUND_DETAIL_LAYER)) return;
      const material = o.material as THREE.Material;
      this.swapped.push({ mesh: o, material });
      o.material = this.depthTwin(material);
    });
  }

  private swapBack(): void {
    for (const { mesh, material } of this.swapped) mesh.material = material;
    this.swapped.length = 0;
  }

  /**
   * A copy of `material` with the same shader changes and uniforms (so it reads `groundDepthPass` and stops after
   * its discard test), drawn only into this pass's texture. Made the first time it's needed, disposed with it.
   */
  private depthTwin(material: THREE.Material): THREE.Material {
    let twin = this.twins.get(material);
    if (twin) return twin;
    twin = material.clone();
    twin.onBeforeCompile = material.onBeforeCompile;
    // A shader material's clone copies its uniforms: the twin must read the same ones.
    if (material instanceof THREE.ShaderMaterial) (twin as THREE.ShaderMaterial).uniforms = material.uniforms;
    const key = material.customProgramCacheKey.bind(material);
    twin.customProgramCacheKey = () => `${key()}|ground-depth`;
    this.twins.set(material, twin);
    const made = twin;
    material.addEventListener('dispose', () => made.dispose());
    return twin;
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
  }
}
