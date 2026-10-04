import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { WAVES_PER_SET, WAVE_SETS, coxMunkSlope, drawnVariance, seaWaves, wavelength, wavePhase, type SeaWaves } from '../gen/waves';
import { VALUE_NOISE_GLSL } from './noiseGlsl';

/** Tunables of the sea's waves (debug panel: Sea waves). They take effect on the next frame. */
export const waveParams = {
  enabled: true,
  /**
   * Wind over the sea, m/s at 10 m: Beaufort force 4, a moderate breeze (Met
   * Office: 7 m/s, waves about 1 m). See docs/research/sea-waves.md.
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
};

/** The wave fronts' bend: how far, and over how long a stretch, in the spectrum's peak wavelengths. */
const WARP_SHARE = 0.6;
const WARP_SIZE = 2;

/** How many waves the shader holds. */
const WAVES = WAVES_PER_SET * WAVE_SETS;

const SEA_WAVES_GLSL = /* glsl */ `
  #define SEA_PER_SET ${WAVES_PER_SET}
  // Per wave: wavenumber vector in the projection plane (1/units), slope amplitude, wavelength (units).
  uniform vec4 uSeaWave[${WAVES}];
  uniform float uSeaPhase[${WAVES}];
  // The whole surface's mean square slope (Cox & Munk), drawn waves and wavelets together.
  uniform float uSeaSlope;
  // How far the wave fronts are bent (units) and over what size (1/units): a few sines alone would make a regular grid.
  uniform vec2 uSeaWarp;
  // Wavelengths in pixels over which a wave fades out (to, from).
  uniform vec2 uSeaFade;
  // A calm sea's: the least roughness left once every wave is drawn.
  const float SEA_CALM_SLOPE = ${coxMunkSlope(0).toFixed(4)};
  varying vec3 vSeaPos;
  varying mat3 vSeaNormalMatrix;

  // One set of waves on a plane at coordinates uv: the height's gradient (xy) and the slope variance drawn (z).
  // Waves shorter than a few pixels (footprint fp) fade out, longest first so the loop stops at the first gone.
  vec3 seaWaveSet(int set, vec2 uv, float fp) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < SEA_PER_SET; i++) {
      vec4 w = uSeaWave[set * SEA_PER_SET + i];
      float fade = smoothstep(uSeaFade.x * fp, uSeaFade.y * fp, w.w);
      if (fade <= 0.0) break;
      float s = w.z * fade;
      sum.xy += normalize(w.xy) * s * cos(dot(w.xy, uv) + uSeaPhase[set * SEA_PER_SET + i]);
      sum.z += 0.5 * s * s;
    }
    return sum;
  }
`;

/**
 * Wind waves on a water sea (issue #88): gen/waves.ts's waves laid over the
 * sea's normals per pixel, on three planes blended by the normal (triplanar,
 * so there's no seam or pole on the sphere), animated by the system clock.
 * Waves too small for the pixels at a distance fade out and their slope goes
 * into the roughness instead, so the sun's glint keeps its size from low
 * down to high up: sparkles on the swell up close, one soft glint from afar.
 * See docs/research/sea-waves.md.
 */
export class SeaWaveLook {
  private readonly uniforms = {
    uSeaWave: { value: Array.from({ length: WAVES }, () => new THREE.Vector4()) },
    uSeaPhase: { value: new Array<number>(WAVES).fill(0) },
    uSeaSlope: { value: coxMunkSlope(0) },
    uSeaWarp: { value: new THREE.Vector2() },
    uSeaFade: { value: new THREE.Vector2() },
  };
  private waves: SeaWaves | null = null;
  /** The tunables the waves were made with. */
  private made = '';

  constructor(
    private readonly seed: number,
    /** Surface gravity, m/s². */
    private readonly gravity: number,
    /** Whether there's air to raise waves; without it the sea is calm. */
    private readonly air: boolean,
  ) {}

  /** Shows the waves at system time `time`. */
  animate(time: number): void {
    const p = waveParams;
    const wind = p.enabled && this.air ? p.wind : 0;
    const key = `${wind}/${p.metresPerUnit}/${p.shortest}/${p.wavelets}`;
    this.uniforms.uSeaFade.value.set(p.fadeTo, Math.max(p.fadeFrom, p.fadeTo + 0.5));
    if (key !== this.made) this.make(wind, key);
    const waves = this.waves!;
    waves.sets.forEach((set, s) => set.forEach((w, i) => (this.uniforms.uSeaPhase.value[s * WAVES_PER_SET + i] = wavePhase(w, time))));
  }

  private make(wind: number, key: string): void {
    const p = waveParams;
    const waves = (this.waves = seaWaves(this.seed, wind, this.gravity, p.shortest));
    this.made = key;
    // Without the wavelets: a calm sea's slope (Cox & Munk at no wind) plus the drawn waves' (the sets' mean).
    const drawn = waves.sets.reduce((sum, set) => sum + drawnVariance(set), 0) / Math.max(1, waves.sets.length);
    this.uniforms.uSeaSlope.value = p.wavelets ? waves.meanSquareSlope : coxMunkSlope(0) + drawn;
    // Bent over twice the longest swell's length, by up to a third of it either way.
    const swell = waves.peakOmega > 0 ? wavelength(waves.peakOmega, this.gravity) / p.metresPerUnit : 1;
    this.uniforms.uSeaWarp.value.set(swell * WARP_SHARE, 1 / (swell * WARP_SIZE));
    for (const v of this.uniforms.uSeaWave.value) v.set(0, 0, 0, 0);
    waves.sets.forEach((set, s) =>
      set.forEach((w, i) => {
        const length = w.length / p.metresPerUnit;
        const k = (Math.PI * 2) / length;
        this.uniforms.uSeaWave.value[s * WAVES_PER_SET + i]!.set(Math.cos(w.angle) * k, Math.sin(w.angle) * k, w.slope, length);
      }),
    );
  }

  /** Lays the waves over `material` (the sea's, a lit sphere in the body frame). */
  apply(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeaPos;\nvarying mat3 vSeaNormalMatrix;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaPos = position;\nvSeaNormalMatrix = normalMatrix;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${VALUE_NOISE_GLSL}\n${SEA_WAVES_GLSL}`).replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 n = normalize(vSeaPos);
          float fp = length(fwidth(vSeaPos));
          // Bent wave fronts: the planes' coordinates pushed about by a slow noise (seamless, being 3D).
          vec3 q = vSeaPos * uSeaWarp.y;
          vec3 p = vSeaPos + uSeaWarp.x * (vec3(valueNoise(q), valueNoise(q + 17.3), valueNoise(q + 41.7)) - 0.5);
          // Each plane where it faces the surface, renormalised so the blend keeps the waves' variance.
          vec3 b = max(pow(abs(n), vec3(4.0)) - 0.02, 0.0);
          b /= b.x + b.y + b.z;
          vec3 g = vec3(0.0);
          float drawn = 0.0;
          vec3 r;
          if (b.x > 0.0) { r = seaWaveSet(0, p.zy, fp); g += b.x * vec3(0.0, r.y, r.x); drawn += b.x * b.x * r.z; }
          if (b.y > 0.0) { r = seaWaveSet(1, p.xz, fp); g += b.y * vec3(r.x, 0.0, r.y); drawn += b.y * b.y * r.z; }
          if (b.z > 0.0) { r = seaWaveSet(2, p.xy, fp); g += b.z * vec3(r.x, r.y, 0.0); drawn += b.z * b.z * r.z; }
          float keep = inversesqrt(dot(b, b));
          g *= keep;
          drawn *= keep * keep;
          // The height's gradient along the surface tips the normal against it.
          g -= n * dot(n, g);
          normal = normalize(vSeaNormalMatrix * (n - g));
          // What isn't drawn is roughness: GGX's alpha (roughness²) is about the RMS slope.
          roughnessFactor = sqrt(sqrt(max(uSeaSlope - drawn, SEA_CALM_SLOPE)));
        }`,
      );
    };
    material.customProgramCacheKey = () => 'sea-waves';
  }
}

export function addWaveDebug(debug: Debug): void {
  const f = debug.folder('Sea waves');
  f?.add(waveParams, 'enabled');
  f?.add(waveParams, 'wind', 0, 25, 0.5);
  f?.add(waveParams, 'metresPerUnit', 1, 100, 1);
  f?.add(waveParams, 'shortest', 0.05, 5, 0.05);
  f?.add(waveParams, 'wavelets');
  f?.add(waveParams, 'fadeFrom', 1, 40, 0.5);
  f?.add(waveParams, 'fadeTo', 0.5, 20, 0.5);
}
