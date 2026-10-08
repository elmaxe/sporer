import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { iceSurface, lineaeIndex, LINEAE_INDEX_SIZE, LINEAE_PER_TEXEL, MAX_LINEAE, type IceSurface } from '../gen/ice';
import { realSurface } from '../gen/realSurface';
import { hashSeed, Rng } from '../gen/rng';
import { SIMPLEX_GLSL } from './noiseGlsl';
import type { PlanetConfig } from './Planet';

/**
 * Ice worlds' and icy moons' surfaces, per pixel (docs/research/ice.md).
 *
 * As Spore picked its terrain textures from the slope and the water line as
 * well as the height, the ground is snow where it lies flat, blue glacier ice
 * where slopes are too steep for snow to stay or the wind scours the
 * lowlands bare, crevassed where it's steepest; a frozen sea is floes of bare
 * sea ice and drifted snow between pressure ridges and dark leads. The colours
 * are real ice's (gen/iceColor.ts: bluer the further light goes through it).
 * Over it all run the body's lineae (gen/ice.ts), Europa's reddish-brown crack
 * bands, some with a bright central ridge, and blotches of chaos terrain where
 * the shell is most broken. Snow sparkles where single facets mirror the sun,
 * light scattering through the ice shows blue along the terminator, and bare
 * ice is glossier than snow. Every detail too small for its pixels fades to
 * its average, so the system view and the globe from afar match the close-up.
 *
 * Added to the game's lit, vertex-coloured terrain material (`applyGround`)
 * and to the low-orbit frozen sea (`applySea`); the painted colours (style
 * low, high and sea, as the map shows them) stay the base. Dirty ice (as
 * Callisto's) gets less of the blue, the gloss and the sparkle.
 */

/** Tunables (debug folder Ice), shared by every ice material. */
export const iceParams = {
  /** All of it, off to compare with the painted colours alone. */
  enabled: true,
  /** How dark the lineae and chaos are. */
  lineae: 1,
  /** How bright the snow's glints are. */
  sparkle: 1,
  /** The glints' cells (units): one facet in each that may catch the sun. */
  sparkleSize: 0.45,
  /** Blue light through the ice along the terminator. */
  scatter: 1,
  /** The biggest sea-ice floes (units); the next scale is a third of it. */
  floe: 48,
  /** Snow drifts and wind-scoured patches (units). */
  drift: 40,
  /** Where slopes go from snow to bare blue ice (1 − cos of the slope: 0.03 ≈ 14°, 0.13 ≈ 30°). */
  slopeFrom: 0.03,
  slopeTo: 0.13,
};

/** The uniforms every ice material shares, so the debug panel reaches them all. */
const shared = {
  uIceOn: { value: 1 },
  uIceLineaeK: { value: iceParams.lineae },
  uIceSparkle: { value: iceParams.sparkle },
  uIceSparkleSize: { value: iceParams.sparkleSize },
  uIceScatter: { value: iceParams.scatter },
  uIceFloe: { value: iceParams.floe },
  uIceDrift: { value: iceParams.drift },
  uIceSlope: { value: new THREE.Vector2(iceParams.slopeFrom, iceParams.slopeTo) },
};

function syncShared(): void {
  shared.uIceOn.value = iceParams.enabled ? 1 : 0;
  shared.uIceLineaeK.value = iceParams.lineae;
  shared.uIceSparkle.value = iceParams.sparkle;
  shared.uIceSparkleSize.value = iceParams.sparkleSize;
  shared.uIceScatter.value = iceParams.scatter;
  shared.uIceFloe.value = iceParams.floe;
  shared.uIceDrift.value = iceParams.drift;
  shared.uIceSlope.value.set(iceParams.slopeFrom, iceParams.slopeTo);
}

export function addIceDebug(debug: Debug): void {
  const f = debug.folder('Ice');
  f?.add(iceParams, 'enabled').onChange(syncShared);
  f?.add(iceParams, 'lineae', 0, 2, 0.05).onChange(syncShared);
  f?.add(iceParams, 'sparkle', 0, 4, 0.05).onChange(syncShared);
  f?.add(iceParams, 'sparkleSize', 0.05, 2, 0.05).onChange(syncShared);
  f?.add(iceParams, 'scatter', 0, 3, 0.05).onChange(syncShared);
  f?.add(iceParams, 'floe', 6, 200, 1).onChange(syncShared);
  f?.add(iceParams, 'drift', 2, 100, 1).onChange(syncShared);
  f?.add(iceParams, 'slopeFrom', 0, 0.3, 0.005).onChange(syncShared);
  f?.add(iceParams, 'slopeTo', 0, 0.5, 0.005).onChange(syncShared);
}

/**
 * What an ice material draws: the ground with its frozen sea painted on its
 * own flat sea (the system view and a visited planet's moons), the ground
 * alone (low orbit, whose sea is a mesh of its own), or that sea.
 */
const MODES = { groundWithSea: 0, ground: 1, sea: 2 } as const;
type IceMode = keyof typeof MODES;

/** GLSL for both shaders: the per-body and shared uniforms, noise, cells and the lineae. */
const ICE_COMMON = /* glsl */ `
  uniform float uIceOn;
  uniform float uIceUnit;     // planet-level units per unit of the mesh (the system view's are 50× smaller)
  uniform vec3 uIceOffset;
  uniform float uIceChaos;
  ${SIMPLEX_GLSL}
`;

const ICE_FRAGMENT = /* glsl */ `
  ${ICE_COMMON}
  uniform float uIceRadius;   // sea level (units)
  uniform float uIceRelief;   // the highest ground's height above it (units)
  uniform float uIceClean;
  uniform float uIceReal;     // 1: a real body's colour map, left as it is
  uniform float uIceFrozen;   // 1: its sea is frozen water
  uniform vec3 uIceSnow;
  uniform vec3 uIceBlue;
  uniform vec3 uIceLead;
  uniform vec3 uIceLineae;
  uniform vec4 uIceLineA[${MAX_LINEAE}]; // pole, offset
  uniform vec4 uIceLineB[${MAX_LINEAE}]; // ref, half-width (rad)
  uniform vec4 uIceLineC[${MAX_LINEAE}]; // centre angle, half-length, strength, ridge
  uniform sampler2D uIceLineIndex;      // which lineae are near, by longitude and latitude
  uniform float uIceLineaeK;
  uniform float uIceSparkle;
  uniform float uIceSparkleSize;
  uniform float uIceScatter;
  uniform float uIceFloe;
  uniform float uIceDrift;
  uniform vec2 uIceSlope;
  varying vec3 vIcePos;
  varying vec3 vIceQ;
  varying float vIceSlope;
  varying float vIceChaosN;

  // Worked out with the colour, used by the normal, roughness and light.
  float iceRough = 0.9;
  float iceBumpH = 0.0;
  float iceSnowK = 0.0;
  float iceBare = 0.0;

  vec3 iceHash(vec3 c) {
    c = mod(c, 289.0);
    vec3 q = fract(c * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.xxy + q.yxx) * q.zyx);
  }

  // Voronoi cells of size 1: the distance from x to the wall between its nearest two cells, the nearest cell's random
  // number, and one for the wall, the same from both sides (as the lava's crust, world/lavaMaterial.ts).
  vec3 iceCells(vec3 x) {
    vec3 i = floor(x - 0.5);
    vec3 f = x - i;
    vec3 r1 = vec3(0.0), r2 = vec3(0.0);
    float d1 = 1e3, d2 = 1e3, id = 0.0, id2 = 0.0;
    for (int z = 0; z <= 1; z++)
    for (int y = 0; y <= 1; y++)
    for (int xx = 0; xx <= 1; xx++) {
      vec3 g = vec3(float(xx), float(y), float(z));
      vec3 h = iceHash(i + g);
      vec3 r = g + 0.5 + 0.75 * (h - 0.5) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; r2 = r1; id2 = id; d1 = d; r1 = r; id = h.x; }
      else if (d < d2) { d2 = d; r2 = r; id2 = h.x; }
    }
    return vec3(dot(0.5 * (r1 + r2), normalize(r2 - r1 + 1e-6)), id, fract((id + id2) * 13.7));
  }

  // One linea's share of the pixel at q (unit, slightly warped), pixels px radians across, added into cover and ridge:
  // how much of the pixel its band covers (times its strength) and how much its bright central ridge does. A band too
  // thin for its pixel keeps its average.
  void iceLinea(vec3 q, float px, vec4 a, vec4 b, vec4 c, inout float cover, inout float ridge) {
    float d = abs(dot(q, a.xyz) - a.w);
    if (d > b.w + 2.0 * px) return;
    float ang = atan(dot(q, cross(a.xyz, b.xyz)), dot(q, b.xyz));
    float along = abs(mod(ang - c.x + 3.14159265, 6.2831853) - 3.14159265) / c.y;
    if (along > 1.0) return;
    // Narrowing to nothing at its ends.
    float hw = b.w * sqrt(1.0 - along * along);
    float band = smoothstep(hw + px, hw - px, d) * min(1.0, 2.0 * hw / px);
    cover = max(cover, band * c.z);
    float rw = 0.28 * hw;
    ridge = max(ridge, c.w * smoothstep(rw + px, rw - px, d) * min(1.0, 2.0 * rw / px));
  }

  // Every linea at q: (cover, ridge). Only the few the index lists where q is (gen/ice.ts lineaeIndex), not all of them.
  vec2 iceLineae(vec3 q, float px) {
    float cover = 0.0, ridge = 0.0;
    ivec2 size = textureSize(uIceLineIndex, 0);
    vec2 uv = vec2(atan(q.x, q.z) / 6.2831853 + 0.5, asin(clamp(q.y, -1.0, 1.0)) / 3.14159265 + 0.5);
    ivec4 near = ivec4(texelFetch(uIceLineIndex, clamp(ivec2(uv * vec2(size)), ivec2(0), size - 1), 0) * 255.0 + 0.5) - 1;
    for (int k = 0; k < ${LINEAE_PER_TEXEL}; k++) {
      int i = near[k];
      if (i < 0) break;
      iceLinea(q, px, uIceLineA[i], uIceLineB[i], uIceLineC[i], cover, ridge);
    }
    return vec2(cover, ridge);
  }

  // How much of something size s (units) to draw where pixels are px units across: fades out from ~8 to ~3 pixels.
  float iceShown(float s, float px) {
    return smoothstep(3.0, 8.0, s / px);
  }

  // The frozen sea at p (units, body frame), px units a pixel; base is its painted colour.
  vec3 iceSea(vec3 p, float px, vec3 base, float drift) {
    vec3 col = base;
    float rough = 0.3;
    float s = uIceFloe;
    float bump = 0.0, snow = 0.0;
    // From afar (the system view, a planet's moons) the biggest floes only: the finer ones are for low orbit.
    #if ICE_MODE == 0
      const int scales = 1;
    #else
      const int scales = 2;
    #endif
    for (int i = 0; i < scales; i++) {
      float fi = float(i);
      float shown = iceShown(s, px);
      if (shown > 0.0) {
        vec3 x = p / s + fi * vec3(31.7, -13.1, 7.3);
        // One noise per scale: it bends the walls, and widens and narrows the ridges and leads along them.
        float n1 = snoise(x * 1.3);
        vec3 c = iceCells(x + 0.3 * n1 * vec3(0.8, 0.5, -0.6));
        float wall = c.x * s;
        // Each floe a little different: bluer bare ice or a whiter, snowier one.
        float floe = c.y;
        col = mix(col, mix(col, uIceBlue, 0.6 * uIceClean), shown * smoothstep(0.45, 0.95, floe) / (1.0 + fi));
        snow = max(snow, shown * smoothstep(0.15, 0.0, floe) * 0.5);
        // Pressure ridges of white rubble along most walls; dark leads of new ice along the rest.
        float lead = step(0.72, c.z);
        float rw = s * (0.03 - 0.01 * fi) * (0.35 + 0.9 * max(n1, 0.0));
        float ridgeK = shown * (1.0 - lead) * smoothstep(rw + px, rw - px, wall) * min(1.0, 2.0 * rw / px);
        float lw = s * 0.008 * (0.5 + 0.8 * max(-n1, 0.0));
        float leadK = shown * lead * smoothstep(lw + px, lw - px, wall) * min(1.0, 2.0 * lw / px);
        snow = max(snow, ridgeK);
        bump += ridgeK * rw * 0.6;
        col = mix(col, uIceLead, leadK * mix(0.4, 1.0, uIceClean));
        rough = mix(rough, 0.12, leadK);
      }
      s /= 3.0;
    }
    // Snow drifts over the floes.
    snow = max(snow, smoothstep(0.35, 0.85, drift) * 0.35 * uIceClean);
    col = mix(col, uIceSnow, snow);
    iceSnowK = snow;
    iceBare = 1.0 - snow;
    iceRough = mix(rough, 0.75, snow);
    iceBumpH = bump;
    return col;
  }
`;

/** After the lights' uniforms are declared. */
const ICE_SUN = /* glsl */ `
  // The dominant light: the first directional light (the planet level's sun), else the first point light (the
  // system view's star). False with neither.
  bool iceSun(vec3 pos, out vec3 L, out vec3 color) {
    #if NUM_DIR_LIGHTS > 0
      L = directionalLights[0].direction;
      color = directionalLights[0].color;
      return true;
    #elif NUM_POINT_LIGHTS > 0
      L = normalize(pointLights[0].position - pos);
      color = pointLights[0].color;
      return true;
    #else
      L = vec3(0.0, 0.0, 1.0);
      color = vec3(0.0);
      return false;
    #endif
  }
`;

const ICE_VERTEX = /* glsl */ `
  ${ICE_COMMON}
  varying vec3 vIcePos;
  varying vec3 vIceQ;
  varying float vIceSlope;
  varying float vIceChaosN;
`;

/** The ice look of an icy body (null for anything else): its surface data as uniforms. */
export class IceLook {
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly index: THREE.DataTexture;

  constructor(
    readonly surface: IceSurface,
    real: boolean,
    /** gen/ice.ts lineaeIndex of its lines (built here if not given). */
    index: Uint8Array = lineaeIndex(surface.lines),
  ) {
    const s = surface;
    const linear = (hex: string) => new THREE.Color(hex);
    const a = Array.from({ length: MAX_LINEAE }, () => new THREE.Vector4());
    const b = Array.from({ length: MAX_LINEAE }, () => new THREE.Vector4());
    const c = Array.from({ length: MAX_LINEAE }, () => new THREE.Vector4());
    s.lines.forEach((l, i) => {
      a[i]!.set(...l.pole, l.offset);
      // A small circle's width in dot units is its angular width × its radius (√(1 − offset²)).
      b[i]!.set(...l.ref, l.width * Math.sqrt(1 - l.offset * l.offset));
      c[i]!.set(l.centre, l.half, l.strength, l.ridge);
    });
    this.index = new THREE.DataTexture(index, LINEAE_INDEX_SIZE[0], LINEAE_INDEX_SIZE[1]);
    this.index.magFilter = this.index.minFilter = THREE.NearestFilter;
    this.index.needsUpdate = true;
    const off = new Rng(hashSeed(s.lines.length, s.lineaeColor, 'ice-offset'));
    this.uniforms = {
      ...shared,
      uIceOffset: { value: new THREE.Vector3(off.range(-50, 50), off.range(-50, 50), off.range(-50, 50)) },
      uIceChaos: { value: s.lineae },
      uIceRadius: { value: 1 },
      uIceRelief: { value: 1 },
      uIceClean: { value: s.clean },
      uIceReal: { value: real ? 1 : 0 },
      uIceFrozen: { value: s.frozenSea ? 1 : 0 },
      uIceSnow: { value: linear(s.snow) },
      uIceBlue: { value: linear(s.blueIce) },
      uIceLead: { value: linear(s.lead) },
      uIceLineae: { value: linear(s.lineaeColor) },
      uIceLineA: { value: a },
      uIceLineB: { value: b },
      uIceLineC: { value: c },
      uIceLineIndex: { value: this.index },
    };
  }

  /**
   * Adds the ice to a body's lit, vertex-coloured terrain `material`: its sea
   * level is at `radius` (units of the mesh) and its highest ground `relief`
   * above it; `unit` is how many planet-level units one of the mesh's is (the
   * system view's `PLANET_SCALE`), so details are the same size in both views.
   * `withSea`: the terrain's own flat sea is painted as the frozen sea (the
   * system view, a visited planet's moons); otherwise the sea is a mesh of its
   * own (`applySea`).
   */
  applyGround(material: THREE.MeshStandardMaterial, radius: number, relief: number, withSea: boolean, unit = 1): void {
    this.apply(material, withSea ? 'groundWithSea' : 'ground', radius, relief, unit);
  }

  /** Adds the ice to the low-orbit frozen sea's material (a smooth sphere at `radius`). */
  applySea(material: THREE.MeshStandardMaterial, radius: number): void {
    this.apply(material, 'sea', radius, 1, 1);
  }

  private apply(material: THREE.MeshStandardMaterial, mode: IceMode, radius: number, relief: number, unit: number): void {
    // Each material its own copies of the per-body values (the sea and the ground differ in radius), in planet-level units.
    const uniforms = {
      ...this.uniforms,
      uIceUnit: { value: unit },
      uIceRadius: { value: radius * unit },
      uIceRelief: { value: Math.max(relief * unit, 1e-3) },
    };
    const define = `#define ICE_MODE ${MODES[mode]}\n`;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        define +
        shader.vertexShader.replace('#include <common>', `#include <common>\n${ICE_VERTEX}`).replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vIcePos = position * uIceUnit;
            vec3 dir = normalize(position);
            // How steep the ground is: 1 − cos of its slope.
            vIceSlope = 1.0 - dot(normalize(objectNormal), dir);
            // The lineae follow arcs bent a little by a broad noise; chaos terrain blotches where the shell is broken.
            vec3 o = dir * 4.0 + uIceOffset;
            vIceQ = normalize(dir + 0.012 * vec3(snoise(o), snoise(o + 17.3), snoise(o + 31.9)));
            vIceChaosN = snoise(dir * 2.4 - uIceOffset);
          }`,
        );
      shader.fragmentShader =
        define +
        shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${ICE_FRAGMENT}`)
          .replace('#include <lights_pars_begin>', `#include <lights_pars_begin>\n${ICE_SUN}`)
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            if (uIceOn > 0.5) {
              float r = length(vIcePos);
              float pxU = max(length(fwidth(vIcePos)), 1e-5);
              vec3 base = diffuseColor.rgb;
              // Snow drifts and wind-scoured patches, faded out when too small to see.
              // Two octaves, stretched east–west as the wind blows round the pole; the finer fades first.
              vec3 dq = vIcePos / (uIceDrift * vec3(2.0, 1.0, 2.0)) + uIceOffset;
              float drift = 0.0;
              float driftShown = iceShown(uIceDrift, pxU);
              if (driftShown > 0.0) {
                drift = 0.7 * snoise(dq);
                float fine = iceShown(uIceDrift * 0.37, pxU);
                if (fine > 0.0) drift += 0.3 * snoise(dq * 2.7 + 5.1) * fine;
                drift *= driftShown;
              }
              #if ICE_MODE == 2
                vec3 col = iceSea(vIcePos, pxU, base, drift);
              #else
                float h = clamp((r - uIceRadius) / uIceRelief, 0.0, 1.0);
                // Snow lies on flat ground; slopes are bare glacier ice, crevassed where steepest; the wind scours
                // patches of the low plains bare.
                float steep = smoothstep(uIceSlope.x, uIceSlope.y, vIceSlope);
                float scour = smoothstep(0.05, 0.85, drift) * 0.8 * (1.0 - smoothstep(0.05, 0.4, h));
                float bare = max(steep, scour * 0.85);
                vec3 blue = mix(base * 0.72, uIceBlue, uIceClean);
                vec3 col = mix(base, blue, bare);
                // Fresh snow drifted deep, on clean ice only (dirty ice keeps its own colour).
                col = mix(col, uIceSnow, smoothstep(-0.1, -0.8, drift) * (1.0 - steep) * 0.6 * uIceClean);
                float crevS = 1.6;
                // Thin, so only drawn close (where they're well over a pixel wide).
                float crev = steep * smoothstep(0.5, 0.9, vIceSlope / max(uIceSlope.y, 1e-3)) * iceShown(crevS * 4.0, pxU);
                if (crev > 0.0) {
                  float n = abs(snoise(vIcePos / crevS + uIceOffset));
                  // Antialiased: a crack thinner than its pixel keeps its share of it. The noise changes by up to ~2 per
                  // crevS, so by about this much across a pixel (no derivatives: this is inside a branch).
                  float fw = max(2.0 * pxU / crevS, 1e-4);
                  crev *= smoothstep(0.04 + fw, 0.04 - fw, n) * min(1.0, 0.08 / fw) * 0.45;
                  col = mix(col, uIceBlue * 0.7, crev * uIceClean);
                }
                iceBare = bare;
                iceSnowK = 1.0 - bare;
                iceRough = mix(0.8, mix(0.85, 0.35, uIceClean), bare);
                iceBumpH = -crev * crevS * 0.15;
                #if ICE_MODE == 0
                  // The terrain's own flat sea (its chords dip just under sea level): the frozen sea, averaged.
                  float w = fwidth(r);
                  float sea = (1.0 - smoothstep(uIceRadius * 1.0001, uIceRadius * 1.0001 + 1.5 * w, r)) * uIceFrozen;
                  if (sea > 0.0) {
                    float rough0 = iceRough, snow0 = iceSnowK, bare0 = iceBare;
                    vec3 seaCol = iceSea(vIcePos, pxU, base, drift);
                    col = mix(col, seaCol, sea);
                    iceRough = mix(rough0, iceRough, sea);
                    iceSnowK = mix(snow0, iceSnowK, sea);
                    iceBare = mix(bare0, iceBare, sea);
                    iceBumpH *= sea;
                  }
                #endif
              #endif
              // Chaos terrain: blotches of the lineae's material where the shell is most broken.
              float chaos = smoothstep(0.55, 0.9, vIceChaosN + 0.15 * drift) * uIceChaos;
              // The lineae, over everything.
              vec2 line = iceLineae(vIceQ, pxU / r);
              float dark = max(line.x * (1.0 - line.y), chaos * 0.45) * min(uIceLineaeK, 1.0);
              col = mix(col, uIceLineae * (0.85 + 0.3 * drift), dark);
              col = mix(col, uIceSnow, line.y * line.x);
              iceSnowK *= 1.0 - dark;
              diffuseColor.rgb = mix(col, base, uIceReal);
              iceRough = mix(iceRough, 0.9, max(dark, uIceReal));
            }`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            if (uIceOn > 0.5) roughnessFactor = iceRough;`,
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            if (uIceOn > 0.5) {
              // The ridges' and crevasses' relief as a bump (Mikkelsen's surface gradient).
              vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
              // Its height in the mesh's own units.
              float hb = iceBumpH / uIceUnit;
              float hx = dFdx(hb), hy = dFdy(hb);
              vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
              float det = dot(dpdx, r1);
              vec3 grad = sign(det) * (hx * r1 + hy * r2);
              normal = normalize(abs(det) * normal - grad);
            }`,
          )
          .replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
            if (uIceOn > 0.5) {
              vec3 L, sunC;
              if (iceSun(geometryPosition, L, sunC)) {
                float nl = dot(normal, L);
                // Light scattered through the ice comes out blue just past where the sun's own light ends: wrap lighting's
                // terminator band (GPU Gems ch. 16: wrap 0.2, width 0.3), for clean ice, more for bare ice than snow.
                float nlw = (nl + 0.2) / 1.2;
                float band = smoothstep(0.0, 0.3, nlw) * smoothstep(0.6, 0.3, nlw);
                reflectedLight.directDiffuse += sunC * band * uIceBlue * (0.12 + 0.18 * iceBare) * uIceClean * uIceScatter;
                // Snow's sparkle: a facet in each little cell, tipped at random; it glints when it mirrors the sun into the
                // eye (Journey's sand, after Zucconi). Only where the cells are a pixel or more.
                float cs = uIceSparkleSize;
                float pxU = max(length(fwidth(vIcePos)), 1e-5);
                float seen = smoothstep(0.6, 2.0, cs / pxU);
                if (seen > 0.0 && nl > 0.0 && iceSnowK > 0.0) {
                  vec3 sp = vIcePos / cs;
                  vec3 hc = iceHash(floor(sp));
                  // Snow's crystals face every way, so glints show from all round, most towards the sun.
                  vec3 facet = normalize(normal * 0.6 + (iceHash(floor(sp) + 71.0) - 0.5) * 2.0);
                  float mirror = dot(reflect(-L, facet), geometryViewDir);
                  vec3 f = fract(sp) - (0.2 + 0.6 * hc.zxy);
                  float spot = smoothstep(0.32, 0.08, length(f));
                  float glint = smoothstep(0.93, 0.99, mirror) * spot;
                  reflectedLight.directSpecular += sunC * glint * 10.0 * seen * iceSnowK * uIceClean * uIceSparkle;
                }
              }
            }`,
          );
    };
    material.customProgramCacheKey = () => `ice-${mode}`;
  }

  dispose(): void {
    this.index.dispose();
  }
}

/** The ice look of an icy body (ice worlds and moons), or null. */
export function createIceLook(config: PlanetConfig): IceLook | null {
  if (config.shape) return null;
  const surface = iceSurface(config);
  return surface ? new IceLook(surface, realSurface(config.seed) !== undefined, cachedIndex(config.seed, surface)) : null;
}

/**
 * The lineae indices of the bodies drawn lately: the system view, low orbit and its moons each draw the same body, and
 * its index is the costly part of its look. A body's lines are its seed's stream, as many as its heat flow gives.
 */
const indices = new Map<string, Uint8Array>();
const KEPT_INDICES = 32;

function cachedIndex(seed: number, surface: IceSurface): Uint8Array {
  const key = `${seed}:${surface.lines.length}`;
  let index = indices.get(key);
  if (index) indices.delete(key);
  else index = lineaeIndex(surface.lines);
  indices.set(key, index);
  if (indices.size > KEPT_INDICES) indices.delete(indices.keys().next().value!);
  return index;
}
