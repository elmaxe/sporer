import * as THREE from 'three';
import {
  DISC_PEAK,
  ISCO,
  RAY_STEP,
  discPeakTemperature,
  discOf,
  lensReach,
  schwarzschildRadius,
  type AccretionDisc,
} from '../gen/blackHoles';
import { blackbodyRgb } from '../gen/incandescence';
import type { StarData } from '../gen/stars';
import type { Debug } from '../core/Debug';
import { cloudNoiseTexture } from './noiseTexture';
import type { SkyCapture } from './skyCapture';

/** The look's tunables (debug folder Black holes; the star lab's Game tunables). */
export const blackHoleParams = {
  /**
   * How much the disc's motion shifts its colour and brightness (Doppler
   * beaming and gravitational redshift, 1 as physics has it). Interstellar's
   * Gargantua left it out (0); the Event Horizon Telescope's images and NASA's
   * visualisations show the approaching side far brighter.
   */
  beaming: 0.7,
  /** The disc's brightness. */
  exposure: 2,
  /** How opaque the disc is face on (its optical depth; edge on it is thicker). */
  opacity: 0.9,
  /** Seconds per turn at the disc's inner edge (stylised: really milliseconds); outer parts lag as r^1.5. */
  innerPeriod: 4,
  /** Light rays traced per pixel at most (the step is RAY_STEP of the distance). */
  maxSteps: 120,
  /** How bright the dot is that shows a far-away hole, too small to see its disc. */
  farGlow: 1.2,
  /**
   * The rays are traced at this share of the drawing's width and height and
   * the image scaled up (SpaceEngine traces at a third): a quarter of the cost.
   */
  resolution: 0.5,
};

/** Debug folder for the black holes' look. */
export function addBlackHoleDebug(debug: Debug): void {
  const f = debug.folder('Black holes');
  f?.add(blackHoleParams, 'beaming', 0, 1);
  f?.add(blackHoleParams, 'exposure', 0, 8);
  f?.add(blackHoleParams, 'opacity', 0, 3);
  f?.add(blackHoleParams, 'innerPeriod', 0.5, 30);
  f?.add(blackHoleParams, 'maxSteps', 20, 300, 1);
  f?.add(blackHoleParams, 'farGlow', 0, 4);
  f?.add(blackHoleParams, 'resolution', 0.2, 1);
}

/** What a hole looks like, in its own terms: what `BlackHoleLook` draws. */
export interface BlackHoleShape {
  /** Schwarzschild radius in the units it's drawn in. */
  rs: number;
  /** Its accretion disc, or null for a bare hole (the shadow and the bent sky only). */
  disc: AccretionDisc | null;
  /** The disc's peak temperature, K (unused without one). */
  peak: number;
  /** How far out it bends light, r_s. */
  reach: number;
  /** Seeds the disc's pattern. */
  seed: number;
}

/** A system's black hole (a `StarData` of kind 'blackHole') as a shape, in system units. */
export function blackHoleShape(star: StarData, seed: number): BlackHoleShape {
  const disc = discOf(star);
  return { rs: schwarzschildRadius(star), disc, peak: discPeakTemperature(star.mass, disc.feeding), reach: lensReach(disc), seed };
}

/** Black-body colours from BB_FROM to BB_TO K, log-spaced (the disc's light, Doppler-shifted either way). */
const BB_COUNT = 48;
const BB_FROM = 800;
const BB_TO = 60000;

/** Linear sRGB of a black body at each table temperature, brightest channel 1. */
function blackbodyTable(): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < BB_COUNT; i++) {
    const T = BB_FROM * (BB_TO / BB_FROM) ** (i / (BB_COUNT - 1));
    const rgb = blackbodyRgb(T, T).map((c) => Math.max(0, c));
    const top = Math.max(...rgb);
    out.push(new THREE.Vector3(rgb[0]! / top, rgb[1]! / top, rgb[2]! / top));
  }
  return out;
}

/**
 * How a black hole looks: its shadow, the sky bent round it and its
 * accretion disc, lensed so the far side of the disc shows over the top and
 * under the bottom of the shadow, its approaching side brighter and bluer.
 * Every pixel of a sphere round the hole (out to `reach`, drawn from inside
 * too) traces its light ray backwards past the hole with the photon equation
 * of gen/blackHoles.ts (`bendRay`), crossing the disc's plane (the hole's
 * XZ plane) where it picks up the disc's glow, until it falls in (black) or
 * leaves, where it looks up the sky (`SkyCapture`) along its bent direction.
 * The bending eases out towards the sphere's edge, so the bent sky meets the
 * real one there. With no sky (the galaxy's close-up), only the shadow and
 * the disc are drawn. A far-away hole, too small to show its disc, is a
 * small glowing dot.
 *
 * In its own units (`rs` and the disc's), not tied to a star system: the
 * star's look in a system (world/Star.ts) and the galaxy's close-up, and
 * ready for a black hole made anywhere else (a weapon's). A pure function of
 * the clock (`animate`).
 */
export class BlackHoleLook {
  readonly object = new THREE.Group();
  /** The sphere drawn in the scene: the traced image, depth-tested like everything else. */
  private readonly lens: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  /** The same sphere tracing the rays, drawn alone into `image` at `blackHoleParams.resolution`. */
  private readonly trace: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly traceScene = new THREE.Scene();
  private readonly image = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly dot: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly inverse = new THREE.Matrix4();
  private readonly rotation = new THREE.Matrix4();
  private readonly bufferSize = new THREE.Vector2();
  private readonly clearColor = new THREE.Color();

  constructor(
    readonly shape: BlackHoleShape,
    /** The sky it bends, or null to draw only the shadow and disc over whatever is behind. */
    private readonly sky: SkyCapture | null,
  ) {
    const disc = shape.disc;
    const geometry = new THREE.SphereGeometry(1, 48, 24);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uCamera: { value: new THREE.Vector3() },
        uReach: { value: shape.reach },
        uInner: { value: ISCO },
        uOuter: { value: disc?.outer ?? 0 },
        uPeak: { value: shape.peak },
        uTurn: { value: disc?.turn ?? 1 },
        uHasDisc: { value: disc ? 1 : 0 },
        uTime: { value: 0 },
        uOmega: { value: 0 },
        uBeaming: { value: blackHoleParams.beaming },
        uExposure: { value: blackHoleParams.exposure },
        uOpacity: { value: blackHoleParams.opacity },
        uMaxSteps: { value: blackHoleParams.maxSteps },
        uSky: { value: sky?.texture ?? null },
        uHasSky: { value: 0 },
        uSkyRotation: { value: new THREE.Matrix3() },
        uNoise: { value: cloudNoiseTexture() },
        uSeed: { value: ((shape.seed >>> 0) % 997) * 0.37 },
        uBlackbody: { value: blackbodyTable() },
      },
      vertexShader: LENS_VERTEX,
      fragmentShader: LENS_FRAGMENT,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    this.trace = new THREE.Mesh(geometry, material);
    // Placed by hand, where the lens is, before each trace.
    this.trace.matrixAutoUpdate = false;
    this.traceScene.add(this.trace);

    const image = this.image.texture;
    image.minFilter = image.magFilter = THREE.LinearFilter;
    image.generateMipmaps = false;
    const show = new THREE.ShaderMaterial({
      uniforms: { uImage: { value: image }, uResolution: { value: new THREE.Vector2(1, 1) } },
      vertexShader: SHOW_VERTEX,
      fragmentShader: SHOW_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      // Premultiplied: the disc's light plus what shows through it.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.lens = new THREE.Mesh(geometry, show);
    this.lens.name = 'Black hole';
    this.lens.scale.setScalar(shape.reach * shape.rs);
    // With the rest of the transparent things, before atmospheres (1): planets' air is drawn over it.
    this.lens.renderOrder = 0.8;
    this.lens.onBeforeRender = (renderer, scene, camera) => this.traceRays(renderer, scene, camera);
    this.object.add(this.lens);

    // A far-away hole: one point, as bright as its disc is small on screen.
    const dotGeometry = new THREE.BufferGeometry();
    dotGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const color = new THREE.Color().setRGB(...(blackbodyRgb(shape.peak, shape.peak).map((c) => Math.max(0, c)) as [number, number, number]));
    color.multiplyScalar(1 / Math.max(color.r, color.g, color.b));
    const dotMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uSize: { value: 1 },
        uRadius: { value: (disc?.outer ?? 3) * shape.rs },
        uScale: { value: 1 },
        uGlow: { value: blackHoleParams.farGlow * (disc ? 1 : 0) },
      },
      vertexShader: DOT_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.dot = new THREE.Points(dotGeometry, dotMaterial);
    this.dot.name = 'Black hole glow';
    this.dot.renderOrder = 0.85;
    this.dot.frustumCulled = false;
    this.dot.onBeforeRender = (renderer, _scene, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      const u = dotMaterial.uniforms;
      const height = renderer.getDrawingBufferSize(this.bufferSize).y;
      // Pixels per unit at distance 1, in the dot's own (scaled) units.
      const scale = this.dot.matrixWorld.getMaxScaleOnAxis();
      u.uScale!.value = (height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))) * scale;
      u.uSize!.value = 7 * renderer.getPixelRatio();
      u.uGlow!.value = blackHoleParams.farGlow * (disc ? 1 : 0);
    };
    this.object.add(this.dot);
  }

  /**
   * Traces the rays for this draw into `image`, at a share of the size of
   * whatever is being drawn into, from `camera` (a nested render, as the
   * sky's bakes are), for the lens to show.
   */
  private traceRays(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera): void {
    const u = this.trace.material.uniforms;
    if (this.sky) this.sky.capture(renderer, scene);
    u.uHasSky!.value = this.sky?.ready ? 1 : 0;
    // The camera in the hole's frame, in r_s.
    this.inverse.copy(this.lens.matrixWorld).invert();
    u.uCamera!.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inverse).multiplyScalar(this.shape.reach);
    // Directions from the hole's frame into the scene's (where the sky was baked).
    this.rotation.extractRotation(this.lens.matrixWorld);
    u.uSkyRotation!.value.setFromMatrix4(this.rotation);
    this.trace.matrix.copy(this.lens.matrixWorld);

    const target = renderer.getRenderTarget();
    const size = target ? this.bufferSize.set(target.width, target.height) : renderer.getDrawingBufferSize(this.bufferSize);
    this.lens.material.uniforms.uResolution!.value.copy(size);
    const share = blackHoleParams.resolution;
    const width = Math.max(1, Math.ceil(size.x * share));
    const height = Math.max(1, Math.ceil(size.y * share));
    if (this.image.width !== width || this.image.height !== height) this.image.setSize(width, height);

    const face = renderer.getActiveCubeFace();
    const level = renderer.getActiveMipmapLevel();
    const autoClear = renderer.autoClear;
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.setRenderTarget(this.image);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.autoClear = false;
    renderer.render(this.traceScene, camera);
    renderer.autoClear = autoClear;
    renderer.setClearColor(this.clearColor, alpha);
    renderer.setRenderTarget(target, face, level);
  }

  /** Shows the disc as it is at system time `time`. */
  animate(time: number): void {
    const u = this.trace.material.uniforms;
    u.uTime!.value = time;
    u.uOmega!.value = (2 * Math.PI) / blackHoleParams.innerPeriod;
    u.uBeaming!.value = blackHoleParams.beaming;
    u.uExposure!.value = blackHoleParams.exposure;
    u.uOpacity!.value = blackHoleParams.opacity;
    u.uMaxSteps!.value = blackHoleParams.maxSteps;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.lens.geometry.dispose();
    this.lens.material.dispose();
    this.trace.material.dispose();
    this.image.dispose();
    this.dot.geometry.dispose();
    this.dot.material.dispose();
  }
}

/** The lens shows the traced image, pixel for pixel of what's being drawn (scaled down by the trace's share). */
const SHOW_VERTEX = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const SHOW_FRAGMENT = /* glsl */ `
  uniform sampler2D uImage;
  uniform vec2 uResolution;
  void main() {
    // Linear, premultiplied light and coverage, traced at a lower resolution.
    gl_FragColor = texture2D(uImage, gl_FragCoord.xy / uResolution);
    #include <colorspace_fragment>
  }`;

const LENS_VERTEX = /* glsl */ `
  uniform float uReach;
  varying vec3 vLocal;
  void main() {
    // In r_s, the hole at the origin.
    vLocal = position * uReach;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const LENS_FRAGMENT = /* glsl */ `
  #define BB_COUNT ${BB_COUNT}
  #define MAX_STEPS 300
  uniform vec3 uCamera;
  uniform float uReach;
  uniform float uInner;
  uniform float uOuter;
  uniform float uPeak;
  uniform float uTurn;
  uniform float uHasDisc;
  uniform float uTime;
  uniform float uOmega;
  uniform float uBeaming;
  uniform float uExposure;
  uniform float uOpacity;
  uniform float uMaxSteps;
  uniform samplerCube uSky;
  uniform float uHasSky;
  uniform mat3 uSkyRotation;
  uniform float uSeed;
  uniform vec3 uBlackbody[BB_COUNT];
  precision highp sampler3D;
  uniform sampler3D uNoise;
  varying vec3 vLocal;

  // The light ray's acceleration at q (r_s): -3/2 h² q / |q|^5.
  vec3 accel(vec3 q, float h2) {
    float r2 = dot(q, q);
    return -1.5 * h2 * q / (r2 * r2 * sqrt(r2));
  }

  // A black body's colour (brightest channel 1) at T kelvin.
  vec3 blackbody(float T) {
    float x = clamp(log(T / ${BB_FROM.toFixed(1)}) / log(${(BB_TO / BB_FROM).toFixed(4)}), 0.0, 1.0) * float(BB_COUNT - 1);
    int i = int(floor(x));
    int j = min(i + 1, BB_COUNT - 1);
    return mix(uBlackbody[i], uBlackbody[j], fract(x));
  }

  // A thin disc's temperature at r (r_s) as a share of its peak: x^-3/4 (1 - x^-1/2)^1/4, x = r / r_in.
  float temperatureShare(float r) {
    float x = r / uInner;
    if (x <= 1.0) return 0.0;
    const float peak = ${(DISC_PEAK ** -3 * (1 - DISC_PEAK ** -0.5)).toFixed(6)};
    return pow(pow(x, -3.0) * (1.0 - inversesqrt(x)) / peak, 0.25);
  }

  // The disc's turbulence at radius r and angle a, about 0–1 (two layers, each reset and faded in turn so the
  // shear stays bounded): streaks along the orbit, from the shared 3D noise.
  float pattern(float r, float a) {
    float omega = uOmega * pow(r / uInner, -1.5) * uTurn;
    const float CYCLE = 9.0;
    float sum = 0.0;
    for (int k = 0; k < 2; k++) {
      float t = uTime / CYCLE + float(k) * 0.5;
      float age = fract(t) * CYCLE;
      float n = floor(t);
      float w = 1.0 - abs(2.0 * fract(t) - 1.0);
      float b = a - omega * age;
      vec2 ring = vec2(cos(b), sin(b));
      vec3 offset = vec3(uSeed + n * 0.371, n * 0.513, 0.0);
      // Stretched round the orbit, fine across it.
      float f = texture(uNoise, vec3(ring * 0.35, log(r) * 0.9) + offset).r;
      float g = texture(uNoise, vec3(ring * 0.9, r * 0.21) + offset.yxz).g;
      sum += w * (0.6 * f + 0.4 * g);
    }
    return sum;
  }

  // The disc where a ray crosses its plane at q, travelling along v: its light (premultiplied) and opacity.
  vec4 discAt(vec3 q, vec3 v) {
    float r = length(q.xz);
    if (r < uInner * 0.8 || r > uOuter) return vec4(0.0);
    float a = atan(q.z, q.x);
    float n = pattern(r, a);
    float edges = smoothstep(uInner * 0.85, uInner * 1.15, r) * (1.0 - smoothstep(uOuter * 0.6, uOuter, r));
    float density = edges * (0.25 + 1.6 * n * n);
    // A thin slab: a slanting ray goes through more of it (edge on, as opaque as it gets).
    float slant = max(abs(normalize(v).y), 0.04);
    float alpha = 1.0 - exp(-uOpacity * density / slant);
    // Its gas orbits at v/c = 1 / sqrt(2(r - 1)); the light leaving towards the camera goes along -v.
    float beta = inversesqrt(2.0 * max(r - 1.0, 0.5));
    vec3 tangent = vec3(-q.z, 0.0, q.x) / r * uTurn;
    float cosine = dot(tangent, -normalize(v));
    float doppler = sqrt(1.0 - beta * beta) / (1.0 - beta * cosine);
    float g = mix(1.0, doppler * sqrt(1.0 - 1.0 / r), uBeaming);
    // Seen shifted by g: a black body at g T, as bright as (g T)^4.
    float share = max(temperatureShare(max(r, uInner * 1.02)), 0.0);
    float T = uPeak * share * g;
    float light = pow(share * g, 4.0) * (0.55 + 0.9 * n);
    return vec4(blackbody(max(T, 900.0)) * light * uExposure * alpha, alpha);
  }

  void main() {
    vec3 p = uCamera;
    vec3 v = normalize(vLocal - uCamera);
    // From outside, start where the ray enters the sphere.
    float bq = dot(p, v);
    float c = dot(p, p) - uReach * uReach;
    if (c > 0.0) {
      float d = bq * bq - c;
      if (d < 0.0) discard;
      p += v * max(-bq - sqrt(d), 0.0);
    }
    vec3 start = v;
    vec3 h = cross(p, v);
    float h2 = dot(h, h);
    float b = sqrt(h2);
    vec3 light = vec3(0.0);
    float trans = 1.0;
    bool captured = false;
    if (c > 0.0 && b > max(uOuter * 1.05, 10.0)) {
      // Passing outside the disc from outside: no need to march. The weak-field deflection, 2/b + 15π/(16 b²)
      // in r_s (within 3% from b = 10 on, see docs/research/black-holes.md), turns it towards the hole.
      float bend = 2.0 / b + 2.9452 / h2;
      vec3 inward = normalize(dot(p, v) * v - p);
      v = v * cos(bend) + inward * sin(bend);
    } else {
      vec3 a = accel(p, h2);
      for (int i = 0; i < MAX_STEPS; i++) {
        if (float(i) >= uMaxSteps) break;
        float dt = ${RAY_STEP.toFixed(3)} * length(p);
        vec3 pn = p + v * dt + 0.5 * a * dt * dt;
        vec3 an = accel(pn, h2);
        vec3 vn = v + 0.5 * (a + an) * dt;
        if (uHasDisc > 0.5 && p.y * pn.y <= 0.0 && p.y != pn.y) {
          float f = p.y / (p.y - pn.y);
          vec4 e = discAt(mix(p, pn, f), mix(v, vn, f));
          light += trans * e.rgb;
          trans *= 1.0 - e.a;
        }
        p = pn;
        v = vn;
        a = an;
        float rn = length(p);
        if (rn < 1.0) { captured = true; break; }
        if (rn > uReach && dot(p, v) > 0.0) break;
        if (trans < 0.004) break;
      }
    }
    // The bending eases out towards the sphere's edge, where the bent sky meets the real one.
    float ease = 1.0 - smoothstep(0.55 * uReach, 0.97 * uReach, b);
    vec3 dir = normalize(mix(start, normalize(v), ease));
    vec3 sky = captured ? vec3(0.0) : textureCube(uSky, uSkyRotation * dir).rgb;
    float replace = captured ? 1.0 : uHasSky * ease;
    // Bright light bleeds into white, as the stars' does.
    light = mix(light, vec3(dot(light, vec3(0.3, 0.5, 0.2))), clamp(dot(light, vec3(0.33)) - 0.8, 0.0, 0.6));
    gl_FragColor = vec4(light + trans * replace * uHasSky * sky, 1.0 - trans * (1.0 - replace));
  }`;

const DOT_VERTEX = /* glsl */ `
  uniform float uSize;
  uniform float uRadius;
  uniform float uScale;
  uniform float uGlow;
  varying float vStrength;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // The disc's radius on screen, in pixels: the dot shows only while it's too small to see.
    float px = uRadius * uScale / max(-mv.z, 1e-3);
    vStrength = uGlow * (1.0 - smoothstep(2.0, 9.0, px));
    gl_PointSize = vStrength > 0.0 ? uSize : 0.0;
    gl_Position = projectionMatrix * mv;
  }`;

const DOT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vStrength;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0 || vStrength <= 0.0) discard;
    float glow = exp(-d * d * 5.0) * vStrength;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.4) * glow, 1.0);
    #include <colorspace_fragment>
  }`;
