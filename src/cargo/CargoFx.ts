import * as THREE from 'three';
import { createGlowTexture } from '../world/glowTexture';

const ATTRIBUTES = ['position', 'color', 'alpha', 'size'] as const;

/** Particles a pool can have alive at once. */
const POOL_SIZE = 384;

const VERTEX = /* glsl */ `
  attribute vec3 color;
  attribute float alpha;
  attribute float size;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(-mv.z, 0.01);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/** One particle to throw: where, how fast, for how long, and how it looks (sizes in planet units). */
export interface Puff {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  size: number;
  /** Size at the end of its life (it grows or shrinks to it). */
  endSize: number;
  color: THREE.ColorRepresentation;
  alpha: number;
  /** Acceleration along `up` (units/s²): negative falls, positive rises like hot air. */
  lift: number;
  /** The local up (unit) that `lift` acts along. */
  up: THREE.Vector3;
  /** Fraction of speed lost per second. */
  drag: number;
}

/**
 * A pool of soft round particles (the glow texture), simulated on the CPU:
 * the cargo beam only throws a few hundred at a time (flames, smoke, splashes,
 * shards, sparkles), so the arrays are rewritten each frame. `additive` pools
 * glow (flames, sparks); the others are drawn over what's behind (smoke, spray).
 */
export class ParticlePool {
  private readonly points: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly texture = createGlowTexture();
  private readonly positions = new Float32Array(POOL_SIZE * 3);
  private readonly colors = new Float32Array(POOL_SIZE * 3);
  private readonly alphas = new Float32Array(POOL_SIZE);
  private readonly sizes = new Float32Array(POOL_SIZE);
  /** Per particle: velocity (3), up (3), age, life, start size, end size, start alpha, lift, drag. */
  private readonly state = new Float32Array(POOL_SIZE * 13);
  private readonly alive = new Uint8Array(POOL_SIZE);
  private next = 0;
  private count = 0;
  private readonly color = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    additive: boolean,
    renderOrder: number,
  ) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uMap: { value: this.texture }, uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** Point sizes are in world units: `viewHeight` is the drawing buffer's height in pixels and `fov` the camera's (degrees). */
  setView(viewHeight: number, fov: number): void {
    this.material.uniforms.uScale!.value = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  emit(p: Puff): void {
    const i = this.next;
    this.next = (this.next + 1) % POOL_SIZE;
    if (!this.alive[i]) this.count++;
    this.alive[i] = 1;
    this.positions[i * 3] = p.position.x;
    this.positions[i * 3 + 1] = p.position.y;
    this.positions[i * 3 + 2] = p.position.z;
    this.color.set(p.color);
    this.colors[i * 3] = this.color.r;
    this.colors[i * 3 + 1] = this.color.g;
    this.colors[i * 3 + 2] = this.color.b;
    const s = i * 13;
    const st = this.state;
    st[s] = p.velocity.x;
    st[s + 1] = p.velocity.y;
    st[s + 2] = p.velocity.z;
    st[s + 3] = p.up.x;
    st[s + 4] = p.up.y;
    st[s + 5] = p.up.z;
    st[s + 6] = 0;
    st[s + 7] = p.life;
    st[s + 8] = p.size;
    st[s + 9] = p.endSize;
    st[s + 10] = p.alpha;
    st[s + 11] = p.lift;
    st[s + 12] = p.drag;
    this.alphas[i] = p.alpha;
    this.sizes[i] = p.size;
  }

  update(dt: number): void {
    this.points.visible = this.count > 0;
    if (this.count === 0) return;
    const st = this.state;
    for (let i = 0; i < POOL_SIZE; i++) {
      if (!this.alive[i]) continue;
      const s = i * 13;
      const age = (st[s + 6] = st[s + 6]! + dt);
      const life = st[s + 7]!;
      if (age >= life) {
        this.alive[i] = 0;
        this.alphas[i] = 0;
        this.count--;
        continue;
      }
      const lift = st[s + 11]! * dt;
      const keep = Math.max(0, 1 - st[s + 12]! * dt);
      for (let k = 0; k < 3; k++) {
        const v = (st[s + k]! + st[s + 3 + k]! * lift) * keep;
        st[s + k] = v;
        this.positions[i * 3 + k] = this.positions[i * 3 + k]! + v * dt;
      }
      const u = age / life;
      this.sizes[i] = st[s + 8]! + (st[s + 9]! - st[s + 8]!) * u;
      // Fades in quickly and out over the second half of its life.
      this.alphas[i] = st[s + 10]! * Math.min(1, u * 8) * Math.min(1, (1 - u) * 2);
    }
    for (const name of ATTRIBUTES) this.geometry.getAttribute(name).needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
