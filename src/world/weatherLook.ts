import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { LavaActivity } from '../gen/lavaActivity';
import {
  MAX_STORMS,
  STORM_SHAPE,
  StormSchedule,
  collectFlashes,
  createFlash,
  flashBrightness,
  stormCentre,
  stormStrength,
  weatherOf,
  type Flash,
  type StormEvent,
  type WeatherData,
} from '../gen/weather';
import type { Vec3Tuple } from '../gen/starActivity';
import { cumulusField, type CumulusField, type GroundRadius } from '../gen/cumulus';
import { detailedTerrain } from '../gen/noise';
import { RELIEF_SCALE, globeRadius } from '../planet/frame';
import type { AtmosphereSun } from './atmosphereShell';
import { createCubeSphere } from './cubeSphere';
import { CumulusClouds, cumulusParams } from './cumulusLook';
import { cloudNoiseTexture } from './noiseTexture';
import { terrainSampler } from './planetGeometry';
import type { PlanetConfig } from './Planet';

/**
 * Global switches and multipliers over every body's weather. `enabled` is the
 * menu's Weather setting (see ui/GraphicsSettings.ts): off hides the clouds,
 * rain and lightning, and they cost nothing.
 */
export const weatherParams = {
  enabled: true,
  /** Scales every body's cloud cover. */
  coverage: 1,
  /** Brightness of the clouds. */
  brightness: 1,
  /** Brightness of lightning on the clouds. */
  lightning: 1,
  /** Scales the winds. */
  wind: 1,
};

export function addWeatherDebug(debug: Debug): void {
  const f = debug.folder('Weather');
  f?.add(weatherParams, 'enabled');
  f?.add(weatherParams, 'coverage', 0, 3);
  f?.add(weatherParams, 'brightness', 0, 3);
  f?.add(weatherParams, 'lightning', 0, 5);
  f?.add(weatherParams, 'wind', 0, 10);
  f?.add(cumulusParams, 'opacity', 0, 1).name('puff opacity');
  f?.add(cumulusParams, 'nearFade', 1, 6).name('puff near fade');
  f?.add(cumulusParams, 'silver', 0, 3).name('puff silver lining');
  f?.add(cumulusParams, 'sun', 0, 3).name('puff sunlight');
  f?.add(cumulusParams, 'lodNear', 0.01, 0.5).name('puffs all from (rad)');
  f?.add(cumulusParams, 'lodFar', 0.001, 0.05).name('puffs fewest at (rad)');
}

/**
 * Clouds draw after the atmosphere and the ship (both depth-tested against
 * the ship, which writes depth): a ship under the clouds is hidden by them
 * from above, one above them is in front. Rain and the lightning bolts draw
 * just before them, so thick cloud hides them from above (the flash still
 * lights the cloud).
 */
export const RAIN_RENDER_ORDER = 2.5;
export const CLOUD_RENDER_ORDER = 3;
export const BOLT_RENDER_ORDER = 2.6;

/** Flashes lit at once (the cloud shader's slots). */
export const MAX_FLASHES = 8;
/** A flash lights the cloud this far round (radians, the glow's 1/e width). */
const FLASH_WIDTH = 0.03;

const scratchCentre = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchCamera = new THREE.Vector3();

const vertexShader = /* glsl */ `
  precision highp sampler3D;
  uniform sampler3D uNoise;
  uniform vec4 uStorms[${MAX_STORMS}];
  uniform vec4 uFlashes[${MAX_FLASHES}];
  uniform int uStormCount;
  uniform int uFlashCount;
  uniform float uNearMargin;
  uniform float uTime;
  uniform float uChange;
  uniform float uWind;
  uniform float uSuper;
  uniform vec3 uOffset;
  varying vec3 vDir;
  varying vec3 vWorld;
  varying vec3 vCentre;
  varying vec3 vQ1;
  varying vec3 vQ2;
  varying float vFront;
  varying float vLat;
  varying float vW;
  varying float vNearStorm;
  varying float vNearFlash;

  // Turns p about the spin axis (+y), increasing its longitude by a.
  vec3 rotY(vec3 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  void main() {
    vec3 dir = normalize(position);
    vDir = dir;
    // Zonal wind (gen/weather.ts, zonalWind): trades and westerlies, or one super-rotating deck.
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    vLat = lat;
    float zonal = uSuper > 0.5 ? cos(lat) : -cos(3.0 * lat);
    float rate = uWind * zonal / max(cos(lat), 0.2);
    // Two generations of cloud, each drifting for uChange seconds and fading
    // in and out half a period apart, so the pattern moves and renews itself.
    float ph = uTime / uChange;
    float p1 = fract(ph);
    float p2 = fract(ph + 0.5);
    float g1 = floor(ph);
    float g2 = floor(ph + 0.5);
    // Stretched east–west, as the winds shear them, and warped by a slow broad field so they swirl.
    vec3 stretch = vec3(1.6, 3.0, 1.6);
    vec3 wq = dir * 0.8 + uOffset.yzx + vec3(0.0, uTime * 0.002, 0.0);
    vec3 warp = vec3(texture(uNoise, wq).r, texture(uNoise, wq + 0.37).r, texture(uNoise, wq + 0.71).r) - 0.5;
    vQ1 = rotY(dir, -rate * p1 * uChange) * stretch + warp * 0.5 + uOffset + vec3(0.37, 0.61, 0.13) * g1;
    vQ2 = rotY(dir, -rate * p2 * uChange) * stretch + warp * 0.5 + uOffset + vec3(0.37, 0.61, 0.13) * g2 + vec3(0.5, 0.0, 0.5);
    vW = 1.0 - abs(2.0 * p1 - 1.0);
    // Broad weather fronts, drifting slowly.
    vFront = texture(uNoise, rotY(dir, -0.3 * rate * uTime) * 0.45 + uOffset.zxy + vec3(0.0, uTime * 0.0015, 0.0)).r;
    // Whether any storm or lit flash is near this vertex (by more than a triangle's size), so the pixels far from
    // all of them skip those loops: most of the sky, most of the time.
    vNearStorm = 0.0;
    for (int i = 0; i < ${MAX_STORMS}; i++) {
      if (i >= uStormCount || vNearStorm <= 0.0) break;
      if (dot(dir, uStorms[i].xyz) > cos(min(uStorms[i].w + uNearMargin, 3.14159))) vNearStorm = 1.0;
    }
    vNearFlash = 0.0;
    for (int i = 0; i < ${MAX_FLASHES}; i++) {
      if (i >= uFlashCount || vNearFlash <= 0.0) break;
      if (dot(dir, uFlashes[i].xyz) > cos(${(FLASH_WIDTH * 5).toFixed(4)} + uNearMargin)) vNearFlash = 1.0;
    }
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp sampler3D;
  uniform sampler3D uNoise;
  uniform float uTime;
  uniform float uCoverage;
  uniform float uOpacity;
  uniform float uBands;
  uniform float uDeck;
  uniform float uGain;
  uniform float uAmbient;
  uniform float uFlashGain;
  uniform vec3 uColor;
  uniform vec3 uDust;
  uniform vec3 uAsh;
  uniform vec3 uSun;
  uniform float uSunPoint;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  uniform vec4 uStorms[${MAX_STORMS}];    // centre (unit, body frame), angular radius
  uniform vec4 uStormInfo[${MAX_STORMS}]; // strength, shape, spin (+1 north), cos(radius)
  uniform vec4 uFlashes[${MAX_FLASHES}];  // direction, brightness
  uniform int uStormCount;
  uniform int uFlashCount;
  varying vec3 vDir;
  varying vec3 vWorld;
  varying vec3 vCentre;
  varying vec3 vQ1;
  varying vec3 vQ2;
  varying float vFront;
  varying float vLat;
  varying float vW;
  varying float vNearStorm;
  varying float vNearFlash;

  void main() {
    vec3 dir = normalize(vDir);
    // Blend the two generations keeping the noise's spread (so the cover stays right mid-blend).
    float w = vW;
    float norm = inversesqrt(w * w + (1.0 - w) * (1.0 - w));
    // Shapes (R) and 4× finer detail (G): one fetch per generation.
    vec2 t1 = texture(uNoise, vQ1).rg - 0.5;
    vec2 t2 = texture(uNoise, vQ2).rg - 0.5;
    float n = 0.5 + (t1.x * w + t2.x * (1.0 - w)) * norm;
    float det = 0.5 + (t1.y * w + t2.y * (1.0 - w)) * norm;
    float front = vFront;
    n += (det - 0.5) * 0.35;

    // Cloudier along the equator and at ±60°, clearer at ±30° (water worlds).
    float lat = vLat;
    float band = 1.0 + uBands * 0.35 * cos(6.0 * lat);
    float cov = clamp(uCoverage * band * (0.55 + 0.9 * front), 0.0, 1.0);
    // Soft, thin edges and thick cores.
    float density = cov <= 0.0 ? 0.0 : pow(smoothstep(1.0 - cov - 0.1, 1.0 - cov + 0.24, n), 1.4);
    vec3 col = uColor;
    if (uDeck > 0.5) {
      // A Venus-like deck: everywhere, in streaky bands along the super-rotation, darker where thinner.
      float deck = clamp(0.62 + 0.6 * (n - 0.5) + 0.25 * (det - 0.5) + 0.15 * sin(lat * 9.0 + n * 3.0), 0.25, 1.0);
      density = deck;
      col *= 0.62 + 0.2 * deck;
    }

    // Only the storms under way (packed first), so a calm sky costs nothing here.
    for (int i = 0; i < ${MAX_STORMS}; i++) {
      if (i >= uStormCount || vNearStorm <= 0.0) break;
      vec4 s = uStorms[i];
      vec4 info = uStormInfo[i];
      if (info.x <= 0.0) continue;
      float c = dot(dir, s.xyz);
      if (c < info.w) continue;
      float r = acos(clamp(c, -1.0, 1.0)) / s.w;
      int shape = int(info.y + 0.5);
      float d;
      vec3 sc = uColor;
      if (shape == 0) {
        // A thunderstorm cluster: a billowing white mass.
        float billow = clamp(0.85 + 0.9 * (det - 0.5) + 0.5 * (n - 0.5), 0.0, 1.0);
        d = (1.0 - smoothstep(0.45, 1.0, r + 0.25 * (det - 0.5))) * billow;
      } else if (shape == 1) {
        // A cyclone: clear eye, bright eyewall, dense core and two spiral arms turning with the spin.
        vec3 e1 = normalize(cross(abs(s.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), s.xyz));
        vec3 e2 = cross(s.xyz, e1);
        float th = atan(dot(dir, e2), dot(dir, e1));
        float arm = 0.5 + 0.5 * cos(2.0 * (info.z * th + 2.4 * log(max(r, 0.02))) - 0.5 * uTime);
        float arms = smoothstep(0.4, 0.85, arm + 0.3 * (det - 0.5)) * (1.0 - smoothstep(0.3, 1.0, r));
        float wall = exp(-pow((r - 0.14) / 0.05, 2.0));
        float core = 1.0 - smoothstep(0.12, 0.5, r);
        d = max(max(wall, core), arms) * smoothstep(0.045, 0.1, r);
      } else if (shape == 2) {
        // A dust storm: a billowing front of the ground's colour.
        d = (1.0 - smoothstep(0.35, 1.0, r + 0.3 * (det - 0.5))) * clamp(0.8 + 0.8 * (n - 0.5) + 0.3 * (det - 0.5), 0.0, 1.0);
        sc = uDust;
      } else if (shape == 3) {
        // A global dust storm: haze over everything.
        d = clamp(0.7 + 0.35 * (n - 0.5) + 0.2 * (det - 0.5), 0.0, 1.0) * 0.8;
        sc = uDust;
      } else {
        // An eruption's ash cloud: dark and dense over the vent.
        d = pow(1.0 - smoothstep(0.0, 1.0, r), 0.6) * clamp(0.85 + 0.4 * (det - 0.5), 0.0, 1.0);
        sc = uAsh;
      }
      d *= info.x;
      if (d > 0.0) {
        col = mix(col, sc, min(1.0, d * 1.3));
        density = max(density, d);
      }
    }

    // Lit by the sun: day side, a warm band at dusk, a faint night side; dark undersides seen from below.
    vec3 N = normalize(vWorld - vCentre);
    vec3 L = uSunPoint > 0.5 ? normalize(uSun - vWorld) : normalize(uSun);
    float mu = dot(N, L);
    float day = smoothstep(-0.1, 0.25, mu);
    float dusk = smoothstep(-0.3, 0.0, mu) * (1.0 - smoothstep(0.0, 0.3, mu));
    bool below = length(cameraPosition - vCentre) < length(vWorld - vCentre);
    // From above, thin cloud is greyer than the thick cores; from below, thick cloud is dark.
    float shade = below ? mix(0.95, 0.4, density) : (0.72 + 0.28 * density) * (0.9 + 0.25 * (det - 0.5));
    vec3 lit = (col * shade * (uAmbient + day * uSunColor) + dusk * vec3(1.0, 0.5, 0.25) * 0.35 * col) * uSunStrength;

    // Lightning lights the cloud from inside.
    float glow = 0.0;
    for (int i = 0; i < ${MAX_FLASHES}; i++) {
      if (i >= uFlashCount || vNearFlash <= 0.0) break;
      vec4 f = uFlashes[i];
      if (f.w <= 0.0) continue;
      glow += f.w * exp(-(1.0 - dot(dir, f.xyz)) / ${((FLASH_WIDTH * FLASH_WIDTH) / 2).toFixed(6)});
    }
    // Lightning stands out at night; by day it's hard to see from above.
    glow *= uFlashGain * mix(1.0, 0.35, day);
    lit += vec3(0.8, 0.86, 1.0) * glow * (0.4 + 1.6 * density);
    float alpha = clamp(density * uOpacity + glow * (0.15 + 0.5 * density), 0.0, 1.0);
    // Seen from outside, the layer thins out edge-on at the limb (no bright rim floating off the planet).
    if (!below) alpha *= smoothstep(0.0, 0.35, abs(dot(N, normalize(cameraPosition - vWorld))));
    gl_FragColor = vec4(lit * uGain, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * A body's weather as drawn (gen/weather.ts): the storms alive and the
 * lightning lit at the time shown, as uniforms shared by every cloud layer
 * showing the body (the system view's and low orbit's match across the zoom).
 * A pure function of the system clock (`animate`), like the lava.
 */
export class WeatherLook {
  readonly schedule: StormSchedule;
  /** The flashes lit at the last `animate` (the first `flashCount`). */
  readonly flashes: Flash[] = Array.from({ length: MAX_FLASHES }, createFlash);
  flashCount = 0;
  /** The storms drawn at the last `animate` (at most MAX_STORMS, strongest first when there are more). */
  readonly shown: StormEvent[] = [];
  readonly uniforms: Record<string, THREE.IUniform>;
  /**
   * Water and methane worlds: the fair-weather clouds and thunderstorms are
   * puffy clusters (gen/cumulus.ts) instead of the sheet, which then only
   * draws what is sheet-like: cyclones, dust, ash, and lightning's glow.
   */
  readonly cumulus: CumulusField | null;
  /** The puffy clouds of each layer made (one per view of the body). */
  readonly puffs: CumulusClouds[] = [];
  private readonly layers: THREE.Object3D[] = [];
  private readonly sheets: THREE.Mesh[] = [];
  private readonly centre: Vec3Tuple = [0, 0, 0];
  private time = 0;

  constructor(
    readonly data: WeatherData,
    lava: { activity: LavaActivity; seed: number } | null,
    /** The ground's radius by direction (planet units), for the puffy clouds' bases; sea level if absent. */
    private readonly ground: GroundRadius = () => data.radius,
  ) {
    this.schedule = new StormSchedule(data, lava);
    this.cumulus = cumulusField(data);
    const seed = data.seed;
    this.uniforms = {
      uNoise: { value: cloudNoiseTexture() },
      uTime: { value: 0 },
      uChange: { value: data.change },
      uWind: { value: data.wind },
      uSuper: { value: data.superRotation ? 1 : 0 },
      uOffset: { value: new THREE.Vector3((seed % 997) / 997, ((seed >>> 10) % 991) / 991, ((seed >>> 20) % 983) / 983) },
      uCoverage: { value: data.coverage },
      uOpacity: { value: data.opacity },
      uBands: { value: data.kind === 'water' ? 1 : 0 },
      uDeck: { value: data.kind === 'acid' ? 1 : 0 },
      uGain: { value: 1 },
      uAmbient: { value: 0.06 },
      uFlashGain: { value: 1 },
      uColor: { value: new THREE.Color(data.color) },
      uDust: { value: new THREE.Color(data.dust) },
      uAsh: { value: new THREE.Color(0.17, 0.155, 0.15) },
      uStorms: { value: Array.from({ length: MAX_STORMS }, () => new THREE.Vector4()) },
      uStormInfo: { value: Array.from({ length: MAX_STORMS }, () => new THREE.Vector4()) },
      uFlashes: { value: Array.from({ length: MAX_FLASHES }, () => new THREE.Vector4()) },
      uStormCount: { value: 0 },
      uFlashCount: { value: 0 },
    };
  }

  /** The system time last shown. */
  get renderTime(): number {
    return this.time;
  }

  /** Shows the weather at system time `time`: the cloud drift, the storms and the lightning. */
  animate(time: number): void {
    this.time = time;
    const visible = weatherParams.enabled;
    for (const l of this.layers) l.visible = visible;
    if (!visible) {
      this.flashCount = 0;
      return;
    }
    const u = this.uniforms;
    u.uTime!.value = time;
    u.uWind!.value = this.data.wind * weatherParams.wind;
    // With puffy clouds the sheet has no fair-weather cloud of its own.
    u.uCoverage!.value = this.cumulus ? 0 : this.data.coverage * weatherParams.coverage;
    u.uGain!.value = weatherParams.brightness;
    u.uFlashGain!.value = weatherParams.lightning;
    this.schedule.advance(time);

    // The storms under way (the strongest, if there are ever more than the slots).
    const shown = this.shown;
    shown.length = 0;
    for (const e of this.schedule.events) if (stormStrength(e, time) > 0) shown.push(e);
    if (shown.length > MAX_STORMS) {
      shown.sort((a, b) => stormStrength(b, time) - stormStrength(a, time));
      shown.length = MAX_STORMS;
    }
    const storms = u.uStorms!.value as THREE.Vector4[];
    const info = u.uStormInfo!.value as THREE.Vector4[];
    let sheetStorms = 0;
    for (let i = 0; i < MAX_STORMS; i++) {
      const e = shown[i];
      if (!e) {
        info[i]!.x = 0;
        continue;
      }
      stormCentre(e, time, this.centre);
      storms[i]!.set(this.centre[0], this.centre[1], this.centre[2], e.size);
      // Thunderstorms are towers among the puffs, where there are puffs.
      const sheet = !(this.cumulus && e.kind === 'cell');
      info[i]!.set(sheet ? stormStrength(e, time) : 0, STORM_SHAPE[e.kind], e.spin, Math.cos(e.size));
      if (sheet) sheetStorms++;
    }
    u.uStormCount!.value = Math.min(shown.length, MAX_STORMS);

    this.flashCount = collectFlashes(this.data, shown, time, this.flashes);
    const slots = u.uFlashes!.value as THREE.Vector4[];
    for (let i = 0; i < MAX_FLASHES; i++) {
      const f = i < this.flashCount ? this.flashes[i]! : null;
      if (f) slots[i]!.set(f.dir[0], f.dir[1], f.dir[2], flashBrightness(f, time));
      else slots[i]!.w = 0;
    }
    u.uFlashCount!.value = this.flashCount;

    for (const p of this.puffs) p.animate(time, this.schedule.events, weatherParams.coverage);
    // A sheet with nothing on it (puffy skies, no cyclone or flash) isn't drawn at all.
    const sheet = !this.cumulus || sheetStorms > 0 || this.flashCount > 0;
    for (const m of this.sheets) m.visible = sheet;
  }

  /**
   * The clouds as drawn, `scale` times the planet-level radii (1 in low
   * orbit, the system view's radius over the planet level's there): the
   * puffy clouds, where the body has them, and the sheet, a cube sphere of
   * `segments` cells per cube edge at the layer's height. `sun` is the star
   * (a point in world space, or a direction), `sunColor` its light.
   */
  createCloudLayer(scale: number, segments: number, sun: AtmosphereSun, sunColor?: THREE.Color): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Clouds';
    group.add(this.createSheet(scale, segments, sun, sunColor));
    if (this.cumulus) {
      const puffs = new CumulusClouds(this.cumulus, this.ground, this.uniforms, scale, sun, sunColor);
      // Drawn just before the sheet: under a cyclone's canopy.
      puffs.mesh.renderOrder = CLOUD_RENDER_ORDER - 0.05;
      this.puffs.push(puffs);
      group.add(puffs.mesh);
      puffs.animate(this.time, this.schedule.events, weatherParams.coverage);
    }
    group.visible = weatherParams.enabled;
    this.layers.push(group);
    return group;
  }

  private createSheet(scale: number, segments: number, sun: AtmosphereSun, sunColor?: THREE.Color): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        ...this.uniforms,
        uSun: { value: sun.vector },
        uSunPoint: { value: sun.point ? 1 : 0 },
        uSunColor: { value: sunColor ?? new THREE.Color(1, 1, 1) },
        uSunStrength: sun.strength ?? { value: 1 },
        // A little over a cell's angular size: a cube edge's quarter turn over `segments` cells, up to ~1.3× at the face centres.
        uNearMargin: { value: (1.5 * (Math.PI / 2)) / segments },
      },
      transparent: true,
      depthWrite: false,
    });
    const radius = this.data.cloudRadius * scale;
    const mesh = new THREE.Mesh(createCubeSphere(radius, segments), material);
    // Only the near side from outside (the far side would show past the planet's edge), the whole sheet overhead from inside.
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
      mesh.getWorldPosition(scratchCentre);
      mesh.getWorldScale(scratchScale);
      const inside = camera.getWorldPosition(scratchCamera).distanceTo(scratchCentre) < radius * scratchScale.x;
      material.side = inside ? THREE.BackSide : THREE.FrontSide;
    };
    mesh.name = 'Cloud sheet';
    mesh.renderOrder = CLOUD_RENDER_ORDER;
    mesh.visible = !this.cumulus;
    this.sheets.push(mesh);
    return mesh;
  }
}

/**
 * The weather look of a body (null if it has none). `lava` is its lava look's
 * activity, whose big eruptions raise ash clouds on bodies with air.
 */
export function createWeatherLook(config: PlanetConfig, lava: LavaActivity | null): WeatherLook | null {
  const R = globeRadius(config.radius);
  const data = weatherOf(config, R, RELIEF_SCALE);
  if (!data) return null;
  return new WeatherLook(data, lava ? { activity: lava, seed: config.seed } : null, groundOf(config, R));
}

/** The ground as low orbit draws it (or the sea over it), by direction: where puffy clouds keep above. */
function groundOf(config: PlanetConfig, R: number): GroundRadius {
  const sea = config.style.sea !== null;
  const sample = terrainSampler(R, config.seed, config.style, { noise: detailedTerrain, reliefScale: RELIEF_SCALE, seaFloor: sea, shape: config.shape });
  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  return (x, y, z) => {
    const r = sample(dir.set(x, y, z), color);
    return sea ? Math.max(r, R) : r;
  };
}
