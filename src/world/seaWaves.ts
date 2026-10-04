import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { WIND_MIN_PRESSURE } from '../gen/geysers';
import {
  COX_MUNK,
  STANDARD_GRAVITY,
  WAVES_PER_SET,
  WAVE_SETS,
  WHITECAP,
  coxMunkSlope,
  drawnVariance,
  seaWaves,
  stormWind,
  wavelength,
  wavePhase,
  type SeaWaves,
} from '../gen/waves';
import { MAX_STORMS, stormCentre, stormStrength, type StormEvent } from '../gen/weather';
import type { PlanetConfig } from './Planet';
import { VALUE_NOISE_GLSL } from './noiseGlsl';
import { weatherParams } from './weatherLook';

/** Tunables of the sea's waves (debug panel: Sea waves). They take effect on the next frame. */
export const waveParams = {
  enabled: true,
  /**
   * Wind over the sea, m/s at 10 m: Beaufort force 4, a moderate breeze (Met
   * Office: 7 m/s, waves about 1 m). Storms raise it under them. See
   * docs/research/sea-waves.md.
   */
  wind: 7,
  /**
   * Stylised: the waves are drawn as if the UFO (~4 units) were a 40 m
   * saucer, not at the planet's own scale (a unit of an Earth-sized globe is
   * ~16 km), so the swell under it is as big as it would look to a ship of
   * that size, and moves at the real speed for its length.
   */
  metresPerUnit: 10,
  /** The shortest wave drawn, metres. */
  shortest: 0.5,
  /** Count the wavelets shorter than that in the roughness (Cox & Munk's whole slope): true to life, but it spreads the sun's glint too thin to see. */
  wavelets: false,
  /** A wave fades out between these many pixels long (and shorter), its slope going into the roughness. */
  fadeFrom: 12,
  fadeTo: 4,
  /** Waves are drawn out to this far from the camera (units) and gone by `farTo`: from high up the sea shows only its glint. */
  farFrom: 50,
  farTo: 110,
  /** Slicks: the share of the sea where the waves are calmed (stylised), and their slope there (Cox & Munk: slicks cut it 2–3×). */
  slicks: 0.3,
  slickSlope: 1 / 2.5,
  /** How big the slicks are, units (stylised). */
  slickSize: 40,
  /** Gerstner's sharper crests and flatter troughs: 1 is a true trochoidal wave (the water's orbits as big as the wave), 0 plain sines. */
  crests: 1,
  /** Whitecaps on the crests, as many as Monahan & O'Muircheartaigh's fit gives at the wind. */
  whitecaps: true,
  /** Shallow water: the depth (units) over which the seabed's light fades by e (stylised: the relief is exaggerated). */
  shallowDepth: 1.5,
  /** The seabed seen through shallow water (stylised: a pale sand). */
  seabed: '#d8c49a',
  /** Surf: how deep (units) the foam along the shore reaches. */
  surfDepth: 0.25,
  /** Crests lit from behind by a low sun (stylised strength). */
  glow: 1.5,
};

/** The wave fronts' bend: how far, and over how long a stretch, in the spectrum's peak wavelengths. */
const WARP_SHARE = 0.6;
const WARP_SIZE = 2;
/** How many waves the shader holds. */
const WAVES = WAVES_PER_SET * WAVE_SETS;
/** Foam's colour (stylised: a bright, slightly blue white). */
const FOAM = new THREE.Color(0.8, 0.85, 0.88);

const SEA_WAVES_GLSL = /* glsl */ `
  #define SEA_PER_SET ${WAVES_PER_SET}
  #define SEA_STORMS ${MAX_STORMS}
  // Per wave: wavenumber vector in the projection plane (1/units), slope amplitude, wavelength (units).
  uniform vec4 uSeaWave[${WAVES}];
  uniform float uSeaPhase[${WAVES}];
  // The whole surface's mean square slope at the wind: what the roughness and the drawn waves share.
  uniform float uSeaSlope;
  uniform float uSeaWind;
  // Storms over the sea: centre (unit, body frame) and angular radius, and the wind under them (m/s).
  uniform vec4 uSeaStorms[SEA_STORMS];
  uniform float uSeaStormWind[SEA_STORMS];
  uniform int uSeaStormCount;
  // How far the wave fronts are bent (units) and over what size (1/units): a few sines alone would make a regular grid.
  uniform vec2 uSeaWarp;
  // Wavelengths in pixels over which a wave fades out (to, from); distances (units) over which they all do.
  uniform vec2 uSeaFade;
  uniform vec2 uSeaFar;
  // Slicks: 1/size, share, slope factor.
  uniform vec3 uSeaSlicks;
  uniform float uSeaCrests;
  uniform float uSeaWhitecaps;
  // Shallow water and surf: e-folding depth, surf depth (units), the surf's phase.
  uniform vec3 uSeaShallow;
  uniform vec3 uSeaSeabed;
  uniform vec3 uSeaFoam;
  uniform float uSeaGlow;
  uniform vec3 uSeaCamera;
  uniform vec3 uSeaSun;
  uniform vec3 uSeaSunLight;
  varying vec3 vSeaPos;
  varying float vSeaDepth;
  varying mat3 vSeaNormalMatrix;

  float seaCoxMunk(float wind) { return ${COX_MUNK[0]} + ${COX_MUNK[1]} * wind; }

  // The wind at unit direction n: the breeze, or a storm's where it's stronger.
  float seaWindAt(vec3 n) {
    float wind = uSeaWind;
    for (int i = 0; i < SEA_STORMS; i++) {
      if (i >= uSeaStormCount) break;
      vec4 s = uSeaStorms[i];
      float a = acos(clamp(dot(n, s.xyz), -1.0, 1.0));
      wind = max(wind, uSeaStormWind[i] * (1.0 - smoothstep(0.4 * s.w, s.w, a)));
    }
    return wind;
  }

  // Standard normal CDF (Page's tanh approximation).
  float seaPhi(float x) { return 0.5 + 0.5 * tanh(0.7978846 * (x + 0.044715 * x * x * x)); }

  struct SeaSet { vec2 grad; float drawn; float h; float hVar; float crest; };

  // One set of waves on a plane at coordinates uv, slopes scaled by amp: the height's gradient, the slope variance
  // drawn, the height and its variance drawn, and Gerstner's crest term. Waves shorter than a few pixels (footprint fp)
  // fade out, longest first so the loop stops at the first gone.
  SeaSet seaWaveSet(int set, vec2 uv, float fp, float amp) {
    SeaSet r = SeaSet(vec2(0.0), 0.0, 0.0, 0.0, 0.0);
    for (int i = 0; i < SEA_PER_SET; i++) {
      vec4 w = uSeaWave[set * SEA_PER_SET + i];
      float fade = smoothstep(uSeaFade.x * fp, uSeaFade.y * fp, w.w);
      if (fade <= 0.0) break;
      float s = w.z * amp * fade;
      float a = s * w.w * 0.15915494;
      float t = dot(w.xy, uv) + uSeaPhase[set * SEA_PER_SET + i];
      float c = cos(t);
      float sn = sin(t);
      r.grad += normalize(w.xy) * s * c;
      r.drawn += 0.5 * s * s;
      r.h += a * sn;
      r.hVar += 0.5 * a * a;
      r.crest += s * sn;
    }
    return r;
  }
`;

const SEA_FRAGMENT = /* glsl */ `
  {
    vec3 n = normalize(vSeaPos);
    float near = 1.0 - smoothstep(uSeaFar.x, uSeaFar.y, length(vSeaPos - uSeaCamera));
    float fp = length(fwidth(vSeaPos));
    float wind = seaWindAt(n);
    // Slicks calm the sea in patches, where no storm blows them away.
    float q = 0.65 * valueNoise(vSeaPos * uSeaSlicks.x) + 0.35 * valueNoise(vSeaPos * uSeaSlicks.x * 2.7 + 5.1);
    float slick = (1.0 - smoothstep(uSeaSlicks.y - 0.06, uSeaSlicks.y + 0.06, q)) * (1.0 - smoothstep(uSeaWind, uSeaWind + 2.0, wind));
    // The slopes follow the wind as Cox & Munk's do (the drawn waves keep their lengths).
    float f = uSeaWind > 0.0 ? seaCoxMunk(wind) / seaCoxMunk(uSeaWind) * mix(1.0, uSeaSlicks.z, slick) : 1.0;
    float amp = sqrt(f);
    // Each plane where it faces the surface, renormalised so the blend keeps the waves' variance.
    vec3 b = max(pow(abs(n), vec3(4.0)) - 0.02, 0.0);
    b /= b.x + b.y + b.z;
    float keep = inversesqrt(dot(b, b));
    vec3 g = vec3(0.0);
    float drawn = 0.0, h = 0.0, hVar = 0.0, crest = 0.0;
    if (near > 0.0 && uSeaWind > 0.0) {
      // Bent wave fronts: the planes' coordinates pushed about by a slow noise (seamless, being 3D).
      vec3 wq = vSeaPos * uSeaWarp.y;
      vec3 p = vSeaPos + uSeaWarp.x * (vec3(valueNoise(wq), valueNoise(wq + 17.3), valueNoise(wq + 41.7)) - 0.5);
      SeaSet r;
      if (b.x > 0.0) { r = seaWaveSet(0, p.zy, fp, amp * near); g += b.x * vec3(0.0, r.grad.y, r.grad.x); drawn += b.x * b.x * r.drawn; h += b.x * r.h; hVar += b.x * b.x * r.hVar; crest += b.x * r.crest; }
      if (b.y > 0.0) { r = seaWaveSet(1, p.xz, fp, amp * near); g += b.y * vec3(r.grad.x, 0.0, r.grad.y); drawn += b.y * b.y * r.drawn; h += b.y * r.h; hVar += b.y * b.y * r.hVar; crest += b.y * r.crest; }
      if (b.z > 0.0) { r = seaWaveSet(2, p.xy, fp, amp * near); g += b.z * vec3(r.grad.x, r.grad.y, 0.0); drawn += b.z * b.z * r.drawn; h += b.z * r.h; hVar += b.z * b.z * r.hVar; crest += b.z * r.crest; }
      g *= keep;
      drawn *= keep * keep;
      h *= keep;
      hVar *= keep * keep;
      crest *= keep;
    }
    // The height's gradient along the surface tips the normal against it; Gerstner's term narrows the crests.
    g -= n * dot(n, g);
    normal = normalize(vSeaNormalMatrix * (n * max(1.0 - uSeaCrests * crest, 0.2) - g));
    // What isn't drawn is roughness: GGX's alpha (roughness²) is about the RMS slope.
    roughnessFactor = sqrt(sqrt(max(f * uSeaSlope - drawn, ${COX_MUNK[0]})));

    // Shallow water: the seabed shows through, tinted by the water it's seen through.
    vec3 hue = diffuseColor.rgb / max(max(diffuseColor.r, diffuseColor.g), max(diffuseColor.b, 1e-3));
    float depth = max(vSeaDepth, 0.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uSeaSeabed * mix(vec3(1.0), hue, 0.75), exp(-depth / uSeaShallow.x));

    // Whitecaps: the steepest crests (the slope-weighted crest term, which the short waves lead), as much of the sea
    // as Monahan & O'Muircheartaigh's fit says; where the waves are too small to draw, their share spread evenly.
    float cover = uSeaWhitecaps * min(1.0, ${WHITECAP[0]} * pow(wind, ${WHITECAP[1]}));
    float caps = cover;
    float all = f * (uSeaSlope - ${COX_MUNK[0]});
    if (drawn > 0.0 && all > 0.0) {
      float c = seaPhi(crest * inversesqrt(drawn));
      caps = mix(cover, smoothstep(1.0 - 1.6 * cover, 1.0 - 0.4 * cover, c), clamp(drawn / all, 0.0, 1.0));
    }
    // Surf: bands of foam running up to the shore at the swell's pace.
    float surf = 1.0 - smoothstep(0.0, uSeaShallow.y, depth);
    float bands = 0.5 + 0.5 * sin(depth / uSeaShallow.y * 9.42 + uSeaShallow.z + 3.0 * valueNoise(vSeaPos * 0.8));
    surf *= mix(0.6, mix(0.3, 1.0, bands), near);
    float foam = clamp(max(caps, surf), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uSeaFoam, foam);
    roughnessFactor = mix(roughnessFactor, 1.0, foam);

    // Crests lit through from behind by a low sun, seen against it.
    vec3 view = normalize(vSeaPos - uSeaCamera);
    vec3 vt = view - n * dot(n, view);
    vec3 lt = uSeaSun - n * dot(n, uSeaSun);
    float facing = max(dot(vt, lt) * inversesqrt(max(dot(vt, vt) * dot(lt, lt), 1e-8)), 0.0);
    float up = dot(n, uSeaSun);
    float lift = hVar > 0.0 ? clamp(h * inversesqrt(hVar) * 0.5, 0.0, 1.0) : 0.0;
    float glow = uSeaGlow * pow(facing, 4.0) * smoothstep(-0.02, 0.08, up) * (1.0 - smoothstep(0.25, 0.6, up)) * lift * (1.0 - foam);
    totalEmissiveRadiance += glow * uSeaSunLight * diffuseColor.rgb * vec3(0.6, 1.3, 1.1);
  }
`;

/**
 * Wind waves on a water sea (issue #88): gen/waves.ts's waves laid over the
 * sea's normals per pixel, on three planes blended by the normal (triplanar,
 * so there's no seam or pole on the sphere), animated by the system clock.
 * Waves too small for the pixels, or too far from the camera, fade out and
 * their slope goes into the roughness instead, so the sun's glint keeps its
 * size from low down to high up. The wind rises under storms (rougher water,
 * whitecaps) and dies in slicks; shallow water shows its seabed and surf runs
 * up the shores. See docs/research/sea-waves.md.
 */
export class SeaWaveLook {
  private readonly uniforms = {
    uSeaWave: { value: Array.from({ length: WAVES }, () => new THREE.Vector4()) },
    uSeaPhase: { value: new Array<number>(WAVES).fill(0) },
    uSeaSlope: { value: coxMunkSlope(0) },
    uSeaWind: { value: 0 },
    uSeaStorms: { value: Array.from({ length: MAX_STORMS }, () => new THREE.Vector4()) },
    uSeaStormWind: { value: new Array<number>(MAX_STORMS).fill(0) },
    uSeaStormCount: { value: 0 },
    uSeaWarp: { value: new THREE.Vector2() },
    uSeaFade: { value: new THREE.Vector2() },
    uSeaFar: { value: new THREE.Vector2() },
    uSeaSlicks: { value: new THREE.Vector3() },
    uSeaCrests: { value: 0 },
    uSeaWhitecaps: { value: 0 },
    uSeaShallow: { value: new THREE.Vector3() },
    uSeaSeabed: { value: new THREE.Color() },
    uSeaFoam: { value: FOAM },
    uSeaGlow: { value: 0 },
    uSeaCamera: { value: new THREE.Vector3() },
    uSeaSun: { value: new THREE.Vector3(0, 1, 0) },
    uSeaSunLight: { value: new THREE.Color(1, 1, 1) },
  };
  private waves: SeaWaves | null = null;
  /** The tunables the waves were made with. */
  private made = '';
  private readonly centre: [number, number, number] = [0, 0, 0];

  constructor(
    private readonly seed: number,
    /** Surface gravity, m/s². */
    private readonly gravity: number,
    /** Whether there's air to raise waves; without it the sea is calm. */
    private readonly air: boolean,
    /** Unit direction to the sun and its light (colour × intensity), in the sea's frame (read every frame). */
    sun: THREE.Vector3,
    sunLight: THREE.Color,
  ) {
    this.uniforms.uSeaSun.value = sun;
    this.uniforms.uSeaSunLight.value = sunLight;
  }

  /** Shows the waves at system time `time`, seen from `camera` (in the sea's frame), with `storms` under way. */
  animate(time: number, camera: THREE.Vector3, storms: readonly StormEvent[] | null): void {
    const p = waveParams;
    const u = this.uniforms;
    const wind = p.enabled && this.air ? p.wind : 0;
    const key = `${wind}/${p.metresPerUnit}/${p.shortest}/${p.wavelets}`;
    if (key !== this.made) this.make(wind, key);
    const waves = this.waves!;
    waves.sets.forEach((set, s) => set.forEach((w, i) => (u.uSeaPhase.value[s * WAVES_PER_SET + i] = wavePhase(w, time))));
    u.uSeaFade.value.set(p.fadeTo, Math.max(p.fadeFrom, p.fadeTo + 0.5));
    u.uSeaFar.value.set(p.farFrom, Math.max(p.farTo, p.farFrom + 1));
    u.uSeaSlicks.value.set(1 / p.slickSize, wind > 0 ? p.slicks : 0, p.slickSlope);
    u.uSeaCrests.value = p.crests;
    u.uSeaWhitecaps.value = p.whitecaps && wind > 0 ? 1 : 0;
    u.uSeaSeabed.value.set(p.seabed);
    u.uSeaGlow.value = wind > 0 ? p.glow : 0;
    u.uSeaCamera.value.copy(camera);
    // The surf comes in at the swell's pace (the spectrum's peak), its phase wrapped like the waves'.
    const surf = waves.peakOmega > 0 ? (waves.peakOmega * time) % (Math.PI * 2) : 0;
    u.uSeaShallow.value.set(p.shallowDepth, p.surfDepth, surf);
    let count = 0;
    if (wind > 0 && storms && weatherParams.enabled) {
      for (const e of storms) {
        const w = stormWind(e.kind, stormStrength(e, time));
        if (w <= wind || count >= MAX_STORMS) continue;
        stormCentre(e, time, this.centre);
        u.uSeaStorms.value[count]!.set(this.centre[0], this.centre[1], this.centre[2], e.size);
        u.uSeaStormWind.value[count] = w;
        count++;
      }
    }
    u.uSeaStormCount.value = count;
  }

  private make(wind: number, key: string): void {
    const p = waveParams;
    const u = this.uniforms;
    const waves = (this.waves = seaWaves(this.seed, wind, this.gravity, p.shortest));
    this.made = key;
    u.uSeaWind.value = wind;
    u.uSeaSlope.value = seaSlope(waves, p.wavelets);
    // Bent over twice the longest swell's length, by up to a third of it either way.
    const swell = waves.peakOmega > 0 ? wavelength(waves.peakOmega, this.gravity) / p.metresPerUnit : 1;
    u.uSeaWarp.value.set(swell * WARP_SHARE, 1 / (swell * WARP_SIZE));
    for (const v of u.uSeaWave.value) v.set(0, 0, 0, 0);
    waves.sets.forEach((set, s) =>
      set.forEach((w, i) => {
        const length = w.length / p.metresPerUnit;
        const k = (Math.PI * 2) / length;
        u.uSeaWave.value[s * WAVES_PER_SET + i]!.set(Math.cos(w.angle) * k, Math.sin(w.angle) * k, w.slope, length);
      }),
    );
  }

  /**
   * Lays the waves over `material` (the sea's, a lit sphere in the body
   * frame). Its geometry's colour attribute carries the depth of the water
   * (units) in red, see PlanetGlobe.
   */
  apply(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          #if !defined( USE_COLOR ) && !defined( USE_COLOR_ALPHA )
          attribute vec3 color;
          #endif
          varying vec3 vSeaPos;
          varying float vSeaDepth;
          varying mat3 vSeaNormalMatrix;`,
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaPos = position;\nvSeaDepth = color.r;\nvSeaNormalMatrix = normalMatrix;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${VALUE_NOISE_GLSL}\n${SEA_WAVES_GLSL}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${SEA_FRAGMENT}`);
    };
    material.customProgramCacheKey = () => 'sea-waves';
  }
}

/** The whole sea's mean square slope at the waves' wind: Cox & Munk's, or (without the wavelets) a calm sea's plus the drawn waves'. */
function seaSlope(waves: SeaWaves, wavelets: boolean): number {
  if (wavelets) return waves.meanSquareSlope;
  const drawn = waves.sets.reduce((sum, set) => sum + drawnVariance(set), 0) / Math.max(1, waves.sets.length);
  return coxMunkSlope(0) + drawn;
}

/** Whether a body's sea is water with waves (not ice, not lava, not a gas giant's), and if so its gravity (m/s²) and whether air blows on it. */
function seaWater(config: PlanetConfig): { gravity: number; air: boolean } | null {
  if (config.type === 'ice' || config.type === 'lava' || config.type === 'gas' || config.style.sea === null || config.shape) return null;
  const climate = config.climate;
  return { gravity: (climate?.gravity ?? 1) * STANDARD_GRAVITY, air: (climate?.pressure ?? 1) >= WIND_MIN_PRESSURE };
}

/** The waves of a body's water sea (null for ice, lava and bodies without one). */
export function createSeaWaves(config: PlanetConfig, sun: THREE.Vector3, sunLight: THREE.Color): SeaWaveLook | null {
  const water = seaWater(config);
  return water ? new SeaWaveLook(config.seed, water.gravity, water.air, sun, sunLight) : null;
}

/**
 * The system view's sea (the terrain's own flat sea, at `radius`) as glossy
 * as low orbit's from afar, so the sun's glint carries across the zoom. Does
 * nothing for bodies without a water sea.
 */
export function applySeaGlint(material: THREE.MeshStandardMaterial, config: PlanetConfig, radius: number): void {
  const water = seaWater(config);
  if (!water) return;
  const p = waveParams;
  const waves = seaWaves(config.seed, p.enabled && water.air ? p.wind : 0, water.gravity, p.shortest);
  const roughness = Math.sqrt(Math.sqrt(seaSlope(waves, p.wavelets)));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlintRadius = { value: radius };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uGlintRadius;\nvarying vec3 vGlintPos;\nvarying float vGlintSea;\nvarying mat3 vGlintNormalMatrix;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGlintPos = position;
        // The sea is the terrain flattened at sea level.
        vGlintSea = length(position) <= uGlintRadius * 1.00001 ? 1.0 : 0.0;
        vGlintNormalMatrix = normalMatrix;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlintPos;\nvarying float vGlintSea;\nvarying mat3 vGlintNormalMatrix;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        roughnessFactor = mix(roughnessFactor, ${roughness.toFixed(4)}, vGlintSea);
        normal = normalize(mix(normal, normalize(vGlintNormalMatrix * normalize(vGlintPos)), vGlintSea));`,
      );
  };
  material.customProgramCacheKey = () => `sea-glint-${roughness.toFixed(4)}`;
}

export function addWaveDebug(debug: Debug): void {
  const f = debug.folder('Sea waves');
  f?.add(waveParams, 'enabled');
  f?.add(waveParams, 'wind', 0, 35, 0.5);
  f?.add(waveParams, 'metresPerUnit', 1, 100, 1);
  f?.add(waveParams, 'shortest', 0.05, 5, 0.05);
  f?.add(waveParams, 'wavelets');
  f?.add(waveParams, 'fadeFrom', 1, 40, 0.5);
  f?.add(waveParams, 'fadeTo', 0.5, 20, 0.5);
  f?.add(waveParams, 'farFrom', 5, 400, 5);
  f?.add(waveParams, 'farTo', 10, 800, 5);
  f?.add(waveParams, 'slicks', 0, 1, 0.01);
  f?.add(waveParams, 'slickSlope', 0.1, 1, 0.01);
  f?.add(waveParams, 'slickSize', 5, 200, 1);
  f?.add(waveParams, 'crests', 0, 1, 0.05);
  f?.add(waveParams, 'whitecaps');
  f?.add(waveParams, 'shallowDepth', 0.05, 5, 0.05);
  f?.addColor(waveParams, 'seabed');
  f?.add(waveParams, 'surfDepth', 0, 1, 0.01);
  f?.add(waveParams, 'glow', 0, 3, 0.05);
}
