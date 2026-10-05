import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { DETAIL_FREQUENCY, DETAIL_LACUNARITY, DETAIL_OCTAVES, DETAIL_PHASES } from '../gen/noise';
import { LATITUDE_SWING, MIN_ELEVATION } from '../gen/plants';
import { realSurface } from '../gen/realSurface';
import { hashSeed, Rng } from '../gen/rng';
import { groundPalette, PEAK_COOLING, POLAR_SNOW_OFFSET, SAND, SNOW_TEMPERATURE } from '../gen/terranGround';
import { SIMPLEX_GLSL } from './noiseGlsl';
import type { PlanetConfig } from './Planet';

/**
 * Green worlds' ground (terran and ocean), per pixel (docs/research/terran-ground.md).
 *
 * Spore textured its planets from a control map worked out from the height
 * field (Ocean Quigley's "Procedural planet texturing"): the height, its first
 * derivative (the slope) and its second (the curvature: valleys and crests)
 * blended, broken up by tiling biome noise, picking where each of a few
 * tinted detail textures shows, over the planet's colour ramp; a beach of
 * sand mapped to height along the shore, and a cliff texture where it's steep.
 * So here, over the painted colours (style low → high, as the map shows them):
 * - the curvature from the terrain's own hills (gen/noise.ts terrainDetail's
 *   octaves, mirrored on the GPU): lusher vegetation down the valleys, drier
 *   grass and bare soil along the crests;
 * - patches of biome noise, lush or dry, at two scales;
 * - sand along the shore, where plants don't grow (gen/plants.ts MIN_ELEVATION);
 * - rock with strata on slopes too steep for plants;
 * - snow where the annual mean is below freezing, by latitude and height
 *   (gen/terranGround.ts);
 * - grain at three scales (blades, tufts, clumps), bumped, as Spore's detail
 *   textures were.
 * Every detail too small for its pixels fades to its average, so the system
 * view (`unit` scales its mesh to planet-level units) and low orbit match
 * across the zoom. A body with a real colour map (Earth) keeps its colours and
 * gets only the grain.
 *
 * Added to the game's lit, vertex-coloured terrain material (`apply`), after
 * whatever it already does (the system view's sea glint).
 */

/** Tunables (debug folder Ground), shared by every ground material. */
export const groundParams = {
  /** All of it, off to compare with the painted colours alone. */
  enabled: true,
  /** How strong the grain is. */
  grain: 1,
  /** How strongly the grain bumps the light. */
  bump: 1,
  /** The finest grain (units); the next scales are 3.2× and 10× it. */
  grainSize: 0.8,
  /** The biome noise's larger patches (units); the smaller are 0.37× it. */
  biome: 220,
  /** How much valleys and crests change the vegetation. */
  ridges: 1,
  /** Where slopes go from vegetation to rock (1 − cos of the slope: 0.07 ≈ 21°, 0.2 ≈ 37°; trees hold to 24°, bushes 42°). */
  slopeFrom: 0.07,
  slopeTo: 0.2,
  /** How much snow lies where it's cold enough. */
  snow: 1,
};

/** The uniforms every ground material shares, so the debug panel reaches them all. */
const shared = {
  uGOn: { value: 1 },
  uGGrain: { value: groundParams.grain },
  uGBump: { value: groundParams.bump },
  uGGrainSize: { value: groundParams.grainSize },
  uGBiome: { value: groundParams.biome },
  uGRidges: { value: groundParams.ridges },
  uGSlope: { value: new THREE.Vector2(groundParams.slopeFrom, groundParams.slopeTo) },
  uGSnowK: { value: groundParams.snow },
};

/** Changes some of `groundParams` and passes them to every ground material (the debug panel, tools). */
export function setGroundParams(changes: Partial<typeof groundParams>): void {
  Object.assign(groundParams, changes);
  syncShared();
}

function syncShared(): void {
  const p = groundParams;
  shared.uGOn.value = p.enabled ? 1 : 0;
  shared.uGGrain.value = p.grain;
  shared.uGBump.value = p.bump;
  shared.uGGrainSize.value = p.grainSize;
  shared.uGBiome.value = p.biome;
  shared.uGRidges.value = p.ridges;
  shared.uGSlope.value.set(p.slopeFrom, p.slopeTo);
  shared.uGSnowK.value = p.snow;
}

export function addGroundDebug(debug: Debug): void {
  const f = debug.folder('Ground');
  f?.add(groundParams, 'enabled').onChange(syncShared);
  f?.add(groundParams, 'grain', 0, 3, 0.05).onChange(syncShared);
  f?.add(groundParams, 'bump', 0, 4, 0.05).onChange(syncShared);
  f?.add(groundParams, 'grainSize', 0.1, 4, 0.05).onChange(syncShared);
  f?.add(groundParams, 'biome', 20, 1000, 5).onChange(syncShared);
  f?.add(groundParams, 'ridges', 0, 2, 0.05).onChange(syncShared);
  f?.add(groundParams, 'slopeFrom', 0, 0.4, 0.005).onChange(syncShared);
  f?.add(groundParams, 'slopeTo', 0, 0.6, 0.005).onChange(syncShared);
  f?.add(groundParams, 'snow', 0, 1, 0.05).onChange(syncShared);
}

const f = (v: number) => v.toFixed(6);

const GROUND_VERTEX = /* glsl */ `
  uniform float uGUnit;
  varying vec3 vGPos;
  varying float vGSlope;
`;

const GROUND_FRAGMENT = /* glsl */ `
  uniform float uGOn;
  uniform float uGUnit;       // planet-level units per unit of the mesh (the system view's are 50× smaller)
  uniform float uGRadius;     // sea level (units)
  uniform float uGRelief;     // the highest ground's height above it (units)
  uniform float uGSea;        // 1: it has a sea (the ground under it is left as painted)
  uniform float uGBeach;      // 1: sand along the shore
  uniform float uGReal;       // 1: a real body's colour map: grain only
  uniform float uGTemp;       // mean surface temperature, K
  uniform vec3 uGPhase;       // the seed's phases in the terrain's detail octaves
  uniform vec3 uGOffset;
  uniform vec3 uGLush;
  uniform vec3 uGDry;
  uniform vec3 uGSoil;
  uniform vec3 uGRock;
  uniform vec3 uGSand;
  uniform vec3 uGSnow;
  uniform float uGGrain;
  uniform float uGBump;
  uniform float uGGrainSize;
  uniform float uGBiome;
  uniform float uGRidges;
  uniform vec2 uGSlope;
  uniform float uGSnowK;
  varying vec3 vGPos;
  varying float vGSlope;
  ${SIMPLEX_GLSL}

  // Worked out with the colour, used by the normal and roughness.
  float groundBumpH = 0.0;
  float groundRough = 0.9;

  // How much of something size s (units) to draw where pixels are px units across: fades out from ~8 to ~3 pixels.
  float groundShown(float s, float px) {
    return smoothstep(3.0, 8.0, s / px);
  }

  // The terrain's hills at unit direction d (gen/noise.ts terrainDetail, octave by octave, before its stretch), each
  // octave weighted and faded out once its hills are under a few pixels (pxRad radians): > 0 on the crests, < 0 down
  // the valleys. Spore's second-derivative filter, read straight from the noise the ground is made of.
  float groundRidge(vec3 d, float pxRad) {
    float fr = ${f(DETAIL_FREQUENCY)};
    float sum = 0.0, total = 0.0, w = 1.0;
    for (int i = 0; i < ${DETAIL_OCTAVES}; i++) {
      // A hill is about half a wavelength across: π / (f · ~2) radians.
      float shown = smoothstep(2.0, 6.0, 1.6 / fr / pxRad);
      if (shown <= 0.0) break;
      float t = sin(d.x * fr * 1.7 + uGPhase.x)
              * sin(d.y * fr * 2.1 + uGPhase.y + d.z * fr * 0.6)
              * sin(d.z * fr * 1.9 + uGPhase.z + d.x * fr);
      sum += w * shown * t;
      total += w;
      fr *= ${f(DETAIL_LACUNARITY)};
      w *= 0.8;
    }
    return total > 0.0 ? 2.5 * sum / total : 0.0;
  }
`;

/** The ground look of a green world (null for anything else): its palette and climate as uniforms. */
export class GroundLook {
  private readonly uniforms: Record<string, THREE.IUniform>;

  constructor(config: PlanetConfig) {
    const { style, seed } = config;
    const palette = groundPalette(style);
    const color = (hex: string) => new THREE.Color(hex);
    const tau = Math.PI * 2;
    const phase = (k: number) => (((seed * k) % tau) + tau) % tau;
    const off = new Rng(hashSeed(seed, 'ground-offset'));
    this.uniforms = {
      ...shared,
      uGSea: { value: style.sea === null ? 0 : 1 },
      uGReal: { value: realSurface(seed) ? 1 : 0 },
      uGTemp: { value: config.climate?.temperature ?? 288 },
      uGPhase: { value: new THREE.Vector3(...DETAIL_PHASES.map(phase)) },
      uGOffset: { value: new THREE.Vector3(off.range(-50, 50), off.range(-50, 50), off.range(-50, 50)) },
      uGLush: { value: color(palette.lush) },
      uGDry: { value: color(palette.dry) },
      uGSoil: { value: color(palette.soil) },
      uGRock: { value: color(palette.rock) },
      // As the painter's seabed sand (world/planetGeometry.ts), so the beach runs on under the clear shallows.
      uGSand: { value: color(SAND).lerp(color(style.low), 0.2) },
      uGSnow: { value: color(palette.snow) },
    };
  }

  /**
   * Adds the ground to a body's lit, vertex-coloured terrain `material`: its
   * sea level is at `radius` (units of the mesh) and its highest ground
   * `relief` above it; `unit` is how many planet-level units one of the mesh's
   * is (the system view's `PLANET_SCALE`), so details are the same size in
   * both views. `beach`: sand along the shore (not on the system view's coarse
   * mesh, whose few vertices can't place it: it would draw rims along the
   * triangles). Runs after what the material already does to its shader.
   */
  apply(material: THREE.MeshStandardMaterial, radius: number, relief: number, unit = 1, beach = true): void {
    const uniforms = {
      ...this.uniforms,
      uGBeach: { value: beach ? 1 : 0 },
      uGUnit: { value: unit },
      uGRadius: { value: radius * unit },
      uGRelief: { value: Math.max(relief * unit, 1e-3) },
    };
    const before = material.onBeforeCompile.bind(material);
    const beforeKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      before(shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${GROUND_VERTEX}`).replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGPos = position * uGUnit;
        // How steep the ground is: 1 − cos of its slope.
        vGSlope = 1.0 - dot(normalize(objectNormal), normalize(position));`,
      );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GROUND_FRAGMENT}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          if (uGOn > 0.5) {
            float r = length(vGPos);
            vec3 d = vGPos / r;
            float pxU = max(length(fwidth(vGPos)), 1e-5);
            // Land only: the sea (the system view's flat one, low orbit's floor under its own) is left as painted.
            float land = uGSea > 0.5 ? smoothstep(uGRadius * 1.00002, uGRadius * 1.0002, r) : 1.0;
            if (land > 0.0) {
              vec3 base = diffuseColor.rgb;
              vec3 col = base;
              vec3 off = uGOffset;
              float e = clamp((r - uGRadius) / uGRelief, 0.0, 1.0);

              // Grain: blades, tufts and clumps (Spore's tiling detail textures), each faded out under a few pixels.
              float s1 = uGGrainSize, s2 = s1 * 3.2, s3 = s1 * 10.0;
              float k1 = groundShown(s1, pxU), k2 = groundShown(s2, pxU), k3 = groundShown(s3, pxU);
              float n1 = k1 > 0.0 ? snoise(vGPos / s1 + off) * k1 : 0.0;
              float n2 = k2 > 0.0 ? snoise(vGPos / s2 - off) * k2 : 0.0;
              float n3 = k3 > 0.0 ? snoise(vGPos / s3 + off.zxy) * k3 : 0.0;

              if (uGReal < 0.5) {
                // Biome noise breaking up the big even areas, at two scales.
                float b1 = groundShown(uGBiome, pxU), b2 = groundShown(uGBiome * 0.37, pxU);
                float biome = 0.0;
                if (b1 > 0.0) biome = 0.65 * snoise(vGPos / uGBiome - off.yzx) * b1;
                if (b2 > 0.0) biome += 0.35 * snoise(vGPos / (uGBiome * 0.37) + off.yzx) * b2;
                // Valleys and crests.
                float ridge = groundRidge(d, pxU / r) * uGRidges + 0.25 * n3;
                float valley = smoothstep(0.05, 0.6, -ridge);
                float crest = smoothstep(0.1, 0.7, ridge);
                // Vegetation: the low ground of the painted ramp, thinning out up the mountains.
                float veg = 1.0 - smoothstep(0.3, 0.75, e);
                float lushK = clamp(0.75 * valley + 0.6 * smoothstep(0.0, -0.6, biome) + 0.25 * smoothstep(-0.2, -0.7, n3), 0.0, 1.0);
                float dryK = clamp(0.6 * crest + 0.65 * smoothstep(0.05, 0.6, biome), 0.0, 1.0);
                col = mix(col, uGLush, lushK * 0.7 * veg);
                col = mix(col, uGDry, dryK * (1.0 - 0.6 * lushK) * 0.6 * veg);
                // Bare soil on the crests where they're steepest, and showing through the dry grass in patches.
                float soilK = crest * smoothstep(0.015, 0.07, vGSlope) * 0.55 + dryK * smoothstep(0.35, 0.8, n2) * 0.35;
                col = mix(col, uGSoil, clamp(soilK, 0.0, 1.0) * veg);

                // Rock on slopes too steep for plants, banded with strata.
                float rockK = smoothstep(uGSlope.x, uGSlope.y, vGSlope + 0.03 * n2);
                if (rockK > 0.0) {
                  float strataS = 1.4;
                  float strata = groundShown(strataS * 2.0, pxU) * sin(r / strataS + 2.5 * n3 + 1.5 * n2);
                  vec3 rock = mix(uGRock, uGSoil, 0.3 + 0.3 * n3) * (0.88 + 0.14 * strata);
                  col = mix(col, rock, rockK);
                  groundBumpH += rockK * strata * 0.06;
                }

                // Sand along the shore, where nothing grows; darker where the sea's just washed it.
                float shore = MIN_ELEVATION_ + 0.012 * (n2 + 0.6 * n3);
                float sandK = uGSea * uGBeach * (1.0 - smoothstep(shore - 0.006, shore + 0.006, e)) * (1.0 - rockK);
                vec3 sand = uGSand * (0.94 + 0.08 * n1) * mix(0.78, 1.0, smoothstep(0.0, 0.008, e));
                col = mix(col, sand, sandK);

                // Snow where the annual mean is below freezing (latitude and height), lying on all but the steepest rock.
                float lat = asin(clamp(d.y, -1.0, 1.0));
                float temp = uGTemp + LATITUDE_SWING_ * (cos(2.0 * lat) - 1.0 / 3.0) - PEAK_COOLING_ * e + 3.0 * n3 + 1.5 * n2;
                float sl = sin(lat);
                float snowT = SNOW_T_ - POLAR_SNOW_ * sl * sl;
                float snowK = smoothstep(snowT + 1.5, snowT - 3.0, temp) * (1.0 - 0.75 * rockK) * uGSnowK;
                col = mix(col, uGSnow * (0.96 + 0.05 * n1), snowK);

                groundRough = mix(mix(0.92, 0.82, rockK), 0.7, snowK);
                groundRough = mix(groundRough, 0.55, sandK * (1.0 - smoothstep(0.0, 0.008, e)));
                // Grain shows on vegetation and soil, much less on sand and snow.
                float grainK = 1.0 - 0.6 * sandK - 0.8 * snowK;
                col *= 1.0 + uGGrain * grainK * (0.16 * n1 + 0.12 * n2 + 0.08 * n3);
                groundBumpH += uGBump * grainK * (0.06 * s1 * n1 + 0.04 * s2 * n2 + 0.02 * s3 * n3);
              } else {
                col *= 1.0 + uGGrain * (0.1 * n1 + 0.08 * n2 + 0.06 * n3);
                groundBumpH += uGBump * (0.04 * s1 * n1 + 0.03 * s2 * n2 + 0.02 * s3 * n3);
              }
              diffuseColor.rgb = mix(base, col, land);
              groundBumpH *= land;
            }
          }`
            .replace(/MIN_ELEVATION_/g, f(MIN_ELEVATION))
            .replace(/LATITUDE_SWING_/g, f(LATITUDE_SWING))
            .replace(/PEAK_COOLING_/g, f(PEAK_COOLING))
            .replace(/SNOW_T_/g, f(SNOW_TEMPERATURE))
            .replace(/POLAR_SNOW_/g, f(POLAR_SNOW_OFFSET)),
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          if (uGOn > 0.5) roughnessFactor = groundRough;`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          if (uGOn > 0.5) {
            // The grain's and strata's relief as a bump (Mikkelsen's surface gradient), its height in the mesh's units.
            vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
            float hb = groundBumpH / uGUnit;
            float hx = dFdx(hb), hy = dFdy(hb);
            vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
            float det = dot(dpdx, r1);
            vec3 grad = sign(det) * (hx * r1 + hy * r2);
            normal = normalize(abs(det) * normal - grad);
          }`,
        );
    };
    material.customProgramCacheKey = () => `${beforeKey}|ground`;
  }
}

/** The ground look of a green world (terran and ocean worlds, not small bodies), or null. */
export function createGroundLook(config: PlanetConfig): GroundLook | null {
  if (config.shape || (config.type !== 'terran' && config.type !== 'ocean')) return null;
  return new GroundLook(config);
}
