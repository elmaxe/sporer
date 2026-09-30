import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { NebulaData } from '../gen/nebulas';
import { addNebulaDebug, applyNebulaBlending, createNebulaMesh, placeNebula } from '../world/nebulaLook';

export const galaxyNebulaParams = {
  /**
   * The volumes are ray-marched at this fraction of the canvas's resolution
   * (each way) and stretched over it: they're soft, and from inside one a
   * march per pixel over the whole screen is far too slow.
   */
  resolution: 1 / 3,
};

/**
 * The galaxy's nebulas on the map: one ray-marched volume each (see
 * world/nebulaLook.ts), drawn at reduced resolution into their own target
 * (`renderVolumes`, before the level's scene) and laid over the scene by a
 * full-screen quad in it: after the disc glow and dust, which dark nebulas
 * dim, and before the stars, which dim themselves behind dark nebulas (see
 * GalaxyMap). The volumes follow the galaxy's rotating root.
 */
export class GalaxyNebulas implements Entity {
  private readonly meshes: THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial>[];
  /** The volumes' own scene; `frame` copies the galaxy root's transform. */
  private readonly volumes = new THREE.Scene();
  private readonly frame = new THREE.Group();
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly size = new THREE.Vector2();
  private readonly texel = new THREE.Vector2();
  private readonly clear = new THREE.Color();
  private shown = true;

  constructor(
    private readonly scene: THREE.Scene,
    /** The galaxy's rotating root: the nebulas are in its (galaxy) coordinates. */
    private readonly root: THREE.Object3D,
    readonly nebulas: readonly NebulaData[],
    debug: Debug,
  ) {
    this.frame.matrixAutoUpdate = false;
    this.volumes.add(this.frame);
    this.meshes = nebulas.map((n) => {
      const mesh = createNebulaMesh(n);
      placeNebula(mesh, n);
      this.frame.add(mesh);
      return mesh;
    });

    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.target.texture }, texel: { value: this.texel } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // On the far plane, depth-tested: it only covers what nothing solid (the UFO, a star close up) is in front of.
          gl_Position = vec4(position.xy * 2.0, 1.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec2 texel;
        varying vec2 vUv;
        void main() {
          // A small blur (four bilinear taps round the middle one) smooths out the march's per-pixel dither.
          vec2 o = texel * 0.75;
          gl_FragColor = 0.2 * (texture2D(map, vUv) +
            texture2D(map, vUv + vec2(o.x, o.y)) + texture2D(map, vUv + vec2(-o.x, o.y)) +
            texture2D(map, vUv + vec2(o.x, -o.y)) + texture2D(map, vUv + vec2(-o.x, -o.y)));
          #include <colorspace_fragment>
        }`,
    });
    applyNebulaBlending(material);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.quad.name = 'Nebulas';
    this.quad.frustumCulled = false;
    // After the disc glow and dust (-1), before the stars (0).
    this.quad.renderOrder = -0.5;
    scene.add(this.quad);

    const f = addNebulaDebug(debug, 'Galaxy nebulas');
    f?.add(galaxyNebulaParams, 'resolution', 0.1, 1).name('map resolution');
  }

  /** Shown or hidden (to measure what they cost). */
  set visible(v: boolean) {
    this.shown = v;
    this.quad.visible = v;
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Nebula volumes drawn (one per nebula). */
  get count(): number {
    return this.meshes.length;
  }

  /** Draws the volumes into their low-resolution target, seen by `camera`; call before rendering the level's scene. */
  renderVolumes(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (!this.shown) return;
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.round(this.size.x * galaxyNebulaParams.resolution));
    const h = Math.max(1, Math.round(this.size.y * galaxyNebulaParams.resolution));
    if (this.target.width !== w || this.target.height !== h) {
      this.target.setSize(w, h);
      this.texel.set(1 / w, 1 / h);
    }
    this.root.updateMatrixWorld();
    this.frame.matrix.copy(this.root.matrixWorld);
    this.frame.matrixWorldNeedsUpdate = true;

    const previous = renderer.getRenderTarget();
    renderer.getClearColor(this.clear);
    const alpha = renderer.getClearAlpha();
    // Nothing yet: no light, everything behind shows through.
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(this.target);
    renderer.clear(true, false, false);
    renderer.render(this.volumes, camera);
    renderer.setRenderTarget(previous);
    renderer.setClearColor(this.clear, alpha);
  }

  dispose(): void {
    this.scene.remove(this.quad);
    this.quad.geometry.dispose();
    this.quad.material.dispose();
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.target.dispose();
  }
}
