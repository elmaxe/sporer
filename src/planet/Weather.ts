import type { CrateredBody } from '../gen/craters';
import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { groundRadius } from '../gen/geysers';
import { GLOBE_SIZE_FACTOR } from '../gen/planets';
import { MAX_STORMS, flashBrightness, hash01, stormCentre, stormStrength, type Flash, type Precipitation } from '../gen/weather';
import type { Vec3Tuple } from '../gen/starActivity';
import { BOLT_RENDER_ORDER, RAIN_RENDER_ORDER, weatherParams, type WeatherLook } from '../world/weatherLook';
import type { RenderClock } from './PlanetFrame';
import { RELIEF_SCALE } from './frame';

/** Lengths grow with the globes (GLOBE_SIZE_FACTOR), like the rest of the weather; the light ×16 for its inverse-square falloff. */
export const lowWeatherParams = {
  /** Opacity of the rain shafts. */
  rain: 1,
  /** Peak intensity of the light a flash throws on the ground. */
  light: 1500 * GLOBE_SIZE_FACTOR ** 2,
  /** Width of a bolt's core, units. */
  boltWidth: 0.16 * GLOBE_SIZE_FACTOR,
};

/** Rain, snow, acid and methane colours (lit by the sun in the shader). */
const PRECIPITATION_COLOR: Record<Precipitation, string> = {
  rain: '#b4c0cc',
  snow: '#f2f6ff',
  acid: '#e6d68a',
  methane: '#d9b88a',
};

/** Bolts drawn at once (the rest light the clouds only). */
const MAX_BOLTS = 4;
/** Segments of a bolt's main channel, and of each of its two branches. */
const MAIN_SEGMENTS = 18;
const BRANCH_SEGMENTS = 6;
const BOLT_POINTS = MAIN_SEGMENTS + 1 + 2 * (BRANCH_SEGMENTS + 1);
/** Quads per bolt: its segments, twice (a wide faint glow and the bright core). */
const BOLT_QUADS = 2 * (MAIN_SEGMENTS + 2 * BRANCH_SEGMENTS);
/** A bolt's two ribbons: width (× boltWidth) and brightness of the wide glow, then of the core. */
const BOLT_LAYERS = [
  [6, 0.12],
  [1, 1],
] as const;

const rainVertex = /* glsl */ `
  attribute vec4 aCentre; // unit direction under the storm's middle, shaft radius (units)
  attribute vec4 aSpan;   // bottom radius, top radius, strength, seed
  uniform vec3 uSun;
  varying float vAround;
  varying float vUp;
  varying float vY;
  varying float vDay;
  varying float vStrength;
  varying float vSeed;
  varying float vEdge;
  varying float vView;

  void main() {
    vec3 up = aCentre.xyz;
    vec3 e1 = normalize(cross(abs(up.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), up));
    vec3 e2 = cross(up, e1);
    float h = position.y + 0.5;
    vec3 p = up * mix(aSpan.x, aSpan.y, h) + (e1 * position.x + e2 * position.z) * aCentre.w;
    vAround = atan(position.z, position.x);
    vUp = h;
    vY = mix(aSpan.x, aSpan.y, h);
    vDay = smoothstep(-0.1, 0.3, dot(up, uSun));
    vStrength = aSpan.z;
    vSeed = aSpan.w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Seen edge-on the shaft looks thicker.
    vec3 n = normalize(normalMatrix * (e1 * position.x + e2 * position.z));
    vEdge = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    // Rain is seen from the side, under the cloud: a shaft seen end-on, or from above the cloud layer, fades away.
    vec3 world = (modelMatrix * vec4(p, 1.0)).xyz;
    vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float axial = abs(dot(normalize(cameraPosition - world), normalize(world - centre)));
    float above = smoothstep(aSpan.y - 1.0, aSpan.y + 2.0, length(cameraPosition - centre));
    vView = (1.0 - smoothstep(0.5, 0.85, axial)) * (1.0 - 0.8 * above);
    gl_Position = projectionMatrix * mv;
  }
`;

const rainFragment = /* glsl */ `
  uniform float uTime;
  uniform float uFall;
  uniform float uStreak;
  uniform float uReach;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform vec3 uSunLight;
  uniform vec3 uAmbient;
  varying float vAround;
  varying float vUp;
  varying float vY;
  varying float vDay;
  varying float vStrength;
  varying float vSeed;
  varying float vEdge;
  varying float vView;

  float hash(float x) { return fract(sin(x * 127.1 + vSeed * 0.013) * 43758.5453); }

  void main() {
    // Streaks in columns round the shaft, falling at the drops' speed.
    float col = floor((vAround / 6.2831853 + 0.5) * 120.0);
    float h = hash(col);
    float y = vY + uTime * uFall * (0.8 + 0.4 * h) + h * 50.0;
    float s = fract(y / uStreak);
    float streak = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.08, 0.5, s)) * step(0.35, fract(h * 7.31));
    // Thickest through the middle of the shaft, soft at its sides (no glass-tube rim).
    float a = (0.14 + 0.4 * streak) * pow(1.0 - vEdge, 0.8) * vStrength * uOpacity * vView;
    // Out of the cloud base, fading towards the ground, or evaporating part way down (virga).
    float down = 1.0 - vUp;
    a *= smoothstep(0.0, 0.06, down) * (1.0 - smoothstep(uReach - 0.2, uReach, down));
    vec3 c = uColor * (uAmbient + uSunLight * 0.45 * vDay);
    gl_FragColor = vec4(c, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const boltVertex = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const boltFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor * vAlpha, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface Bolt {
  /** The flash it belongs to (its seed), or −1 when free. */
  seed: number;
  points: Float32Array;
}

/**
 * Low-orbit weather under a body's clouds (gen/weather.ts, drawn from the
 * WeatherLook the globe animates): shafts of rain, snow, acid or methane under
 * the storms that have it (one instanced open cylinder each, streaks falling
 * in the shader), lightning bolts from the cloud base to the ground for the
 * flashes that strike it (camera-facing ribbons rebuilt each frame), and one
 * light on the terrain at the brightest flash. Depends only on the clock.
 */
export class Weather implements Entity {
  readonly rain: THREE.InstancedMesh<THREE.CylinderGeometry, THREE.ShaderMaterial> | null;
  readonly bolts: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly light = new THREE.PointLight('#cfdcff', 0, 0, 2);
  private readonly rainCentre: THREE.InstancedBufferAttribute | null = null;
  private readonly rainSpan: THREE.InstancedBufferAttribute | null = null;
  private readonly boltPool: Bolt[];
  private readonly boltPositions: THREE.BufferAttribute;
  private readonly boltAlpha: THREE.BufferAttribute;
  private readonly centre: Vec3Tuple = [0, 0, 0];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  /** Bolts drawn at the last update (for the smoke test). */
  boltCount = 0;
  /** Rain shafts drawn at the last update. */
  shaftCount = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly frame: RenderClock,
    readonly look: WeatherLook,
    private readonly body: CrateredBody,
    private readonly camera: THREE.Camera,
    sun: THREE.Vector3,
    sunLight: THREE.Color,
    ambientLight: THREE.Color,
    debug: Debug,
  ) {
    const { data } = look;
    if (data.precipitation && data.storms.some((s) => s.rain)) {
      const geometry = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true);
      const centre = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STORMS * 4), 4);
      const span = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STORMS * 4), 4);
      centre.setUsage(THREE.DynamicDrawUsage);
      span.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('aCentre', centre);
      geometry.setAttribute('aSpan', span);
      this.rainCentre = centre;
      this.rainSpan = span;
      const snow = data.precipitation === 'snow';
      this.rain = new THREE.InstancedMesh(
        geometry,
        new THREE.ShaderMaterial({
          vertexShader: rainVertex,
          fragmentShader: rainFragment,
          uniforms: {
            uTime: { value: 0 },
            uFall: { value: data.fallSpeed },
            // Snowflakes are specks, drops streaks.
            uStreak: { value: (snow ? 0.7 : 2.2) * GLOBE_SIZE_FACTOR },
            uReach: { value: data.reach },
            uOpacity: { value: 1 },
            uColor: { value: new THREE.Color(PRECIPITATION_COLOR[data.precipitation]) },
            uSun: { value: sun },
            uSunLight: { value: sunLight },
            uAmbient: { value: ambientLight },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
        MAX_STORMS,
      );
      this.rain.name = 'Rain';
      this.rain.count = 0;
      // Positions come from the shader.
      this.rain.frustumCulled = false;
      this.rain.renderOrder = RAIN_RENDER_ORDER;
      scene.add(this.rain);
    } else {
      this.rain = null;
    }

    const boltGeometry = new THREE.BufferGeometry();
    this.boltPositions = new THREE.BufferAttribute(new Float32Array(MAX_BOLTS * BOLT_QUADS * 4 * 3), 3);
    this.boltAlpha = new THREE.BufferAttribute(new Float32Array(MAX_BOLTS * BOLT_QUADS * 4), 1);
    this.boltPositions.setUsage(THREE.DynamicDrawUsage);
    this.boltAlpha.setUsage(THREE.DynamicDrawUsage);
    boltGeometry.setAttribute('position', this.boltPositions);
    boltGeometry.setAttribute('aAlpha', this.boltAlpha);
    const index: number[] = [];
    for (let q = 0; q < MAX_BOLTS * BOLT_QUADS; q++) index.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3);
    boltGeometry.setIndex(index);
    boltGeometry.setDrawRange(0, 0);
    this.bolts = new THREE.Mesh(
      boltGeometry,
      new THREE.ShaderMaterial({
        vertexShader: boltVertex,
        fragmentShader: boltFragment,
        uniforms: { uColor: { value: new THREE.Color(0.85, 0.9, 1.25) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.bolts.name = 'Lightning';
    this.bolts.frustumCulled = false;
    this.bolts.renderOrder = BOLT_RENDER_ORDER;
    this.boltPool = Array.from({ length: MAX_BOLTS }, () => ({ seed: -1, points: new Float32Array(BOLT_POINTS * 3) }));
    scene.add(this.bolts, this.light);

    const f = debug.folder('Weather up close');
    f?.add(lowWeatherParams, 'rain', 0, 3);
    f?.add(lowWeatherParams, 'light', 0, 5000 * GLOBE_SIZE_FACTOR ** 2);
    f?.add(lowWeatherParams, 'boltWidth', 0.02, 1 * GLOBE_SIZE_FACTOR);
    this.update();
  }

  update(): void {
    const time = this.frame.renderTime;
    const visible = weatherParams.enabled;
    this.bolts.visible = visible;
    if (this.rain) this.rain.visible = visible;
    if (!visible) {
      this.light.intensity = 0;
      this.boltCount = this.shaftCount = 0;
      return;
    }
    this.updateRain(time);
    this.updateBolts(time);
  }

  private updateRain(time: number): void {
    const rain = this.rain;
    if (!rain) return;
    const { data, shown } = this.look;
    const R = data.radius;
    const top = data.cloudRadius;
    let n = 0;
    for (const e of shown) {
      if (!e.rain) continue;
      const s = stormStrength(e, time);
      if (s <= 0) continue;
      stormCentre(e, time, this.centre);
      // A cyclone's rain falls in its bands, a storm's under its core.
      const radius = e.size * R * (e.kind === 'cyclone' ? 0.55 : 0.45);
      this.rainCentre!.setXYZW(n, this.centre[0], this.centre[1], this.centre[2], radius);
      // From the cloud base (a little under the layer) to just under sea level (the terrain hides the rest).
      this.rainSpan!.setXYZW(n, R * 0.99, top - 0.6 * GLOBE_SIZE_FACTOR, s, e.seed % 1000);
      n++;
    }
    rain.count = this.shaftCount = n;
    this.rainCentre!.needsUpdate = true;
    this.rainSpan!.needsUpdate = true;
    const u = rain.material.uniforms;
    u.uTime!.value = time;
    u.uOpacity!.value = lowWeatherParams.rain;
  }

  private updateBolts(time: number): void {
    const { flashes, flashCount, data } = this.look;
    // The flashes that strike the ground, brightest first into the free bolts.
    for (const bolt of this.boltPool) {
      const f = this.flashFor(bolt.seed);
      if (!f || !f.ground) bolt.seed = -1;
    }
    for (let i = 0; i < flashCount; i++) {
      const f = flashes[i]!;
      if (!f.ground || this.boltFor(f.seed)) continue;
      const free = this.boltFor(-1);
      if (!free) break;
      this.shapeBolt(free, f, data.cloudRadius - 0.6 * GLOBE_SIZE_FACTOR);
    }

    const cam = this.camera.position;
    let quad = 0;
    let bestLight = 0;
    for (const bolt of this.boltPool) {
      if (bolt.seed === -1) continue;
      const f = this.flashFor(bolt.seed);
      if (!f) continue;
      const b = flashBrightness(f, time);
      if (b <= 0.002) continue;
      quad = this.writeBolt(bolt, b, cam, quad);
    }
    this.boltCount = 0;
    for (const bolt of this.boltPool) if (bolt.seed !== -1) this.boltCount++;
    this.bolts.geometry.setDrawRange(0, quad * 6);
    this.boltPositions.needsUpdate = true;
    this.boltAlpha.needsUpdate = true;

    // One light on the ground under the brightest flash near the camera.
    let best: Flash | null = null;
    for (let i = 0; i < flashCount; i++) {
      const f = flashes[i]!;
      const d = this.a.set(f.dir[0], f.dir[1], f.dir[2]).multiplyScalar(data.cloudRadius).distanceTo(cam);
      const score = flashBrightness(f, time) / (1 + d / (60 * GLOBE_SIZE_FACTOR));
      if (score > bestLight) {
        bestLight = score;
        best = f;
      }
    }
    if (best) {
      this.light.position.set(best.dir[0], best.dir[1], best.dir[2]).multiplyScalar(best.ground ? (data.radius + data.cloudRadius) / 2 : data.cloudRadius);
      this.light.intensity = lowWeatherParams.light * flashBrightness(best, time) * weatherParams.lightning;
    } else {
      this.light.intensity = 0;
    }
  }

  private boltFor(seed: number): Bolt | null {
    for (const bolt of this.boltPool) if (bolt.seed === seed) return bolt;
    return null;
  }

  private flashFor(seed: number): Flash | null {
    if (seed === -1) return null;
    const { flashes, flashCount } = this.look;
    for (let i = 0; i < flashCount; i++) if (flashes[i]!.seed === seed) return flashes[i]!;
    return null;
  }

  /**
   * A jagged channel from the cloud base at `top` down to the ground under
   * the flash: a random walk sideways, pulled back to land on the strike
   * point, plus two short branches forking off it. Seeded by the flash.
   */
  private shapeBolt(bolt: Bolt, f: Flash, top: number): void {
    bolt.seed = f.seed;
    const p = bolt.points;
    const [dx, dy, dz] = f.dir;
    const ground = groundRadius(f.dir, this.body, this.look.data.radius, RELIEF_SCALE);
    const height = top - ground;
    // A tangent basis at the strike point.
    const up = this.a.set(dx, dy, dz);
    const e1 = this.b.set(0, 1, 0).cross(up);
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0).cross(up);
    e1.normalize();
    const e2 = this.side.crossVectors(up, e1);
    const jitter = height * 0.09;
    let wx = 0;
    let wy = 0;
    const walk: number[] = [];
    for (let k = 0; k <= MAIN_SEGMENTS; k++) {
      walk.push(wx, wy);
      wx += (hash01(f.seed, k, 1) - 0.5) * jitter;
      wy += (hash01(f.seed, k, 2) - 0.5) * jitter;
    }
    const endX = walk[MAIN_SEGMENTS * 2]!;
    const endY = walk[MAIN_SEGMENTS * 2 + 1]!;
    for (let k = 0; k <= MAIN_SEGMENTS; k++) {
      const t = k / MAIN_SEGMENTS;
      // Walk from the cloud (t = 0) down, corrected to end on the strike point.
      const ox = walk[k * 2]! - t * endX;
      const oy = walk[k * 2 + 1]! - t * endY;
      const r = top - t * height;
      p[k * 3] = dx * r + e1.x * ox + e2.x * oy;
      p[k * 3 + 1] = dy * r + e1.y * ox + e2.y * oy;
      p[k * 3 + 2] = dz * r + e1.z * ox + e2.z * oy;
    }
    // Two branches from points on the upper half, heading off and down.
    for (let br = 0; br < 2; br++) {
      const from = 2 + Math.floor(hash01(f.seed, br, 3) * (MAIN_SEGMENTS / 2));
      const heading = hash01(f.seed, br, 4) * Math.PI * 2;
      const hx = Math.cos(heading) * jitter * 0.7;
      const hy = Math.sin(heading) * jitter * 0.7;
      const o = (MAIN_SEGMENTS + 1 + br * (BRANCH_SEGMENTS + 1)) * 3;
      let x = p[from * 3]!;
      let y = p[from * 3 + 1]!;
      let z = p[from * 3 + 2]!;
      for (let k = 0; k <= BRANCH_SEGMENTS; k++) {
        p[o + k * 3] = x;
        p[o + k * 3 + 1] = y;
        p[o + k * 3 + 2] = z;
        const sx = hx + (hash01(f.seed, br * 16 + k, 5) - 0.5) * jitter;
        const sy = hy + (hash01(f.seed, br * 16 + k, 6) - 0.5) * jitter;
        const drop = (height / MAIN_SEGMENTS) * 0.8;
        x += e1.x * sx + e2.x * sy - dx * drop;
        y += e1.y * sx + e2.y * sy - dy * drop;
        z += e1.z * sx + e2.z * sy - dz * drop;
      }
    }
  }

  /** Writes `bolt`'s camera-facing ribbons (glow, then core) from quad `quad`; returns the next free quad. */
  private writeBolt(bolt: Bolt, brightness: number, cam: THREE.Vector3, quad: number): number {
    const width = lowWeatherParams.boltWidth;
    const gain = weatherParams.lightning;
    for (const [scale, alpha] of BOLT_LAYERS) {
      const w = width * scale;
      quad = this.writeStrip(bolt.points, 0, MAIN_SEGMENTS, w, alpha * brightness * gain, cam, quad);
      for (let br = 0; br < 2; br++) {
        const start = MAIN_SEGMENTS + 1 + br * (BRANCH_SEGMENTS + 1);
        quad = this.writeStrip(bolt.points, start, BRANCH_SEGMENTS, w * 0.6, alpha * 0.6 * brightness * gain, cam, quad);
      }
    }
    return quad;
  }

  private writeStrip(p: Float32Array, start: number, segments: number, width: number, alpha: number, cam: THREE.Vector3, quad: number): number {
    const pos = this.boltPositions;
    const al = this.boltAlpha;
    for (let k = 0; k < segments; k++) {
      const i = (start + k) * 3;
      this.a.set(p[i]!, p[i + 1]!, p[i + 2]!);
      this.b.set(p[i + 3]!, p[i + 4]!, p[i + 5]!);
      this.toCamera.subVectors(cam, this.a);
      this.side.subVectors(this.b, this.a).cross(this.toCamera).normalize().multiplyScalar(width / 2);
      // Thinner towards the branch tips.
      const taper = 1 - (0.6 * k) / segments;
      const v = quad * 4;
      pos.setXYZ(v, this.a.x - this.side.x, this.a.y - this.side.y, this.a.z - this.side.z);
      pos.setXYZ(v + 1, this.a.x + this.side.x, this.a.y + this.side.y, this.a.z + this.side.z);
      this.side.multiplyScalar(taper);
      pos.setXYZ(v + 2, this.b.x - this.side.x, this.b.y - this.side.y, this.b.z - this.side.z);
      pos.setXYZ(v + 3, this.b.x + this.side.x, this.b.y + this.side.y, this.b.z + this.side.z);
      for (let j = 0; j < 4; j++) al.setX(v + j, alpha);
      quad++;
    }
    return quad;
  }

  dispose(): void {
    if (this.rain) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      this.rain.material.dispose();
      this.rain.dispose();
    }
    this.scene.remove(this.bolts, this.light);
    this.bolts.geometry.dispose();
    this.bolts.material.dispose();
    this.light.dispose();
  }
}
