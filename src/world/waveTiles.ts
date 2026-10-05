import * as THREE from 'three';
import { CASCADES, WAVES_PER_CASCADE, wavePhase, type SeaWaves } from '../gen/waves';

/** Texels across a cascade's tile (its shortest waves are about six texels long at 7 m/s, see docs/research/sea-waves.md). */
export const TILE_TEXELS = 128;
/** ...and at reduced resolution (?quality=low, a pixel ratio under 1), where every texel drawn costs more than it shows. */
const LOW_TILE_TEXELS = 64;

const BAKE_VERTEX = /* glsl */ `
  in vec3 position;
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BAKE_FRAGMENT = /* glsl */ `
  precision highp float;
  #define WAVES ${WAVES_PER_CASCADE}
  // Per wave: wavevector (radians per tile, 2π n), amplitude (units), slope amplitude a·k; its direction.
  uniform vec4 uWave[WAVES];
  uniform vec2 uDir[WAVES];
  uniform float uPhase[WAVES];
  // The tile's side (units), Gerstner's steepness (1: trochoids), texels across.
  uniform vec3 uTile;
  layout(location = 0) out vec4 oSlope;
  layout(location = 1) out vec4 oMoments;

  // The horizontal displacement at tile coordinates x0 (in tiles): each wave moves the water towards its crest.
  vec2 displacement(vec2 x0) {
    vec2 d = vec2(0.0);
    for (int i = 0; i < WAVES; i++) {
      vec4 w = uWave[i];
      d += uDir[i] * (w.z * cos(dot(w.xy, x0) + uPhase[i]));
    }
    return d * uTile.y / uTile.x;
  }

  void main() {
    vec2 x = gl_FragCoord.xy / uTile.z;
    // Where the water now here came from: x = x0 + D(x0), by one fixed-point step (the displacement's gradient, the
    // sum's slope, stays well under 1 at a breeze, so one step lands within a few per cent of its size).
    vec2 x0 = x - displacement(x);
    // The height, its gradient over x0, and the displacement's gradient there.
    float h = 0.0;
    vec2 g = vec2(0.0);
    vec3 m = vec3(0.0); // ∂D/∂x0: xx, xz, zz
    for (int i = 0; i < WAVES; i++) {
      vec4 w = uWave[i];
      float t = dot(w.xy, x0) + uPhase[i];
      float c = cos(t);
      float s = sin(t);
      vec2 k = uDir[i];
      h += w.z * s;
      g += k * w.w * c;
      m -= vec3(k.x * k.x, k.x * k.y, k.y * k.y) * w.w * s;
    }
    m *= uTile.y;
    // The surface's slope where it is now: the Jacobian M = I + ∂D/∂x0 maps the gradient, ∇h = M^-T ∇₀h.
    float a = 1.0 + m.x, b = m.y, d = 1.0 + m.z;
    float jacobian = a * d - b * b;
    float j = max(jacobian, 0.2);
    vec2 slope = vec2(d * g.x - b * g.y, a * g.y - b * g.x) / j;
    // The crest term: how much the water is squeezed together (1 − J), where the whitecaps go.
    float crest = 1.0 - jacobian;
    oSlope = vec4(slope, h, crest);
    oMoments = vec4(slope * slope, h * h, crest * crest);
  }
`;

/**
 * The wind's waves baked into repeating tiles, one per cascade, redrawn on
 * the GPU every frame: Gerstner waves, sharp-crested and flat-troughed, laid
 * out by inverting their displacement, as an FFT ocean's tiles hold them.
 * Each texel holds the slope (along and across the wind), the height
 * (units) and the crest term, and in a second texture their squares: their
 * mipmaps average both, so where a tile's waves are too small for the
 * pixels the slope they hide is the second moment less the first squared
 * (LEAN mapping), which the sea's shader turns into roughness. See
 * docs/research/sea-waves.md.
 */
export class WaveTiles {
  readonly targets: THREE.WebGLRenderTarget[];
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly materials: THREE.RawShaderMaterial[];
  private readonly quad: THREE.Mesh;
  private waves: SeaWaves | null = null;

  /** Whether every tile has been drawn once, and the one to redraw next. */
  private ready = false;
  private next = 0;

  constructor() {
    this.targets = Array.from({ length: CASCADES }, () => {
      const target = new THREE.WebGLRenderTarget(TILE_TEXELS, TILE_TEXELS, {
        count: 2,
        type: THREE.HalfFloatType,
        depthBuffer: false,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: true,
      });
      return target;
    });
    this.materials = this.targets.map(
      () =>
        new THREE.RawShaderMaterial({
          glslVersion: THREE.GLSL3,
          vertexShader: BAKE_VERTEX,
          fragmentShader: BAKE_FRAGMENT,
          uniforms: {
            uWave: { value: Array.from({ length: WAVES_PER_CASCADE }, () => new THREE.Vector4()) },
            uDir: { value: Array.from({ length: WAVES_PER_CASCADE }, () => new THREE.Vector2(1, 0)) },
            uPhase: { value: new Array<number>(WAVES_PER_CASCADE).fill(0) },
            uTile: { value: new THREE.Vector3(1, 1, TILE_TEXELS) },
          },
          depthTest: false,
          depthWrite: false,
        }),
    );
    // One triangle over the whole target.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(geometry, this.materials[0]);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** The textures of cascade `c`: [slope, height, crest] and their squares. */
  textures(c: number): [THREE.Texture, THREE.Texture] {
    const t = this.targets[c]!.textures;
    return [t[0]!, t[1]!];
  }

  /** Lays out `waves` (units of `metresPerUnit` metres), steepened by `chop` (Gerstner's Q). */
  setWaves(waves: SeaWaves, metresPerUnit: number, chop: number): void {
    this.waves = waves;
    this.ready = false;
    waves.cascades.forEach((cascade, c) => {
      const u = this.materials[c]!.uniforms;
      u.uTile!.value.set(cascade.size / metresPerUnit, chop, TILE_TEXELS);
      const dirs = u.uDir!.value as THREE.Vector2[];
      (u.uWave!.value as THREE.Vector4[]).forEach((v, i) => {
        const w = cascade.waves[i];
        if (!w) return v.set(1, 0, 0, 0);
        const k = (Math.PI * 2) / w.length;
        v.set(Math.PI * 2 * w.nx, Math.PI * 2 * w.nz, w.slope / k / metresPerUnit, w.slope);
        dirs[i]!.set(w.nx, w.nz).normalize();
      });
    });
  }

  /**
   * Redraws the tiles at system time `time` (s): all of them the first time,
   * then one a frame in turn, so each moves on at a third of the frame rate
   * (at 60 frames a second a 0.5 m wave moves 4 cm between its updates, too
   * little to see). Does nothing when calm.
   */
  render(renderer: THREE.WebGLRenderer, time: number): void {
    const waves = this.waves;
    if (!waves || waves.cascades.length === 0) return;
    if (!this.ready) {
      // Sharper at a low angle, where the sea is mostly seen.
      const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const texels = renderer.getPixelRatio() < 1 ? LOW_TILE_TEXELS : TILE_TEXELS;
      for (const t of this.targets) {
        for (const x of t.textures) x.anisotropy = anisotropy;
        t.setSize(texels, texels);
      }
      for (const m of this.materials) m.uniforms.uTile!.value.z = texels;
    }
    const target = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    waves.cascades.forEach((cascade, c) => {
      if (this.ready && c !== this.next % waves.cascades.length) return;
      const material = this.materials[c]!;
      const phases = material.uniforms.uPhase!.value as number[];
      cascade.waves.forEach((w, i) => (phases[i] = wavePhase(w, time)));
      this.quad.material = material;
      renderer.setRenderTarget(this.targets[c]!);
      renderer.render(this.scene, this.camera);
    });
    this.next++;
    this.ready = true;
    renderer.setRenderTarget(target);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    for (const t of this.targets) t.dispose();
    for (const m of this.materials) m.dispose();
    this.quad.geometry.dispose();
  }
}
