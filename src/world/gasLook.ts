import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { gasDrift, gasShear, gasTone, generateGasLayout, type GasLayout, type GasStormKind } from '../gen/gasGiants';
import { hashSeed, Rng } from '../gen/rng';
import { cloudNoiseTexture } from './noiseTexture';
import type { PlanetConfig } from './Planet';

/** Global multipliers over every gas giant (debug tuning). */
export const gasParams = {
  /**
   * Scales the bands' drift. The real jets are 1–15% of their planet's spin
   * (docs/research/gas-giants.md); ×4 so the flow shows (stylised).
   */
  pace: 4,
  /** How much the clouds churn: the band edges' waves and the mottling. */
  turbulence: 1,
  /** Seconds over which the churning clouds are carried along before they're crossfaded with fresh ones. */
  period: 40,
  /** Finer detail as the camera comes closer (octaves; 0 = only the broadest). */
  detail: 1,
};

export function addGasDebug(debug: Debug): void {
  const f = debug.folder('Gas giants');
  f?.add(gasParams, 'pace', 0, 40);
  f?.add(gasParams, 'turbulence', 0, 3);
  f?.add(gasParams, 'period', 5, 200);
  f?.add(gasParams, 'detail', 0, 2);
}

/** Storms drawn at once (the shader's slots). */
const MAX_STORMS = 12;
/** Rows of the latitude table, south pole to north pole. */
const TABLE_ROWS = 512;
const KIND_CODE: Record<GasStormKind, number> = { red: 0, white: 1, dark: 2, streak: 3 };

/**
 * GLSL for a giant's cloud tops at a unit direction `dir` of its body frame
 * (`gasColor`, linear colour before lighting), shared by the system view's
 * sphere, the planet level's globe and its map. `fp` is how much of the unit
 * sphere a pixel spans: finer octaves of churning cloud fade in as it shrinks.
 */
export const GAS_GLSL = /* glsl */ `
  precision highp sampler3D;
  uniform sampler3D uNoise;
  uniform sampler2D uGasTable;    // row 0: colour, shear; row 1: drift (fraction of the spin)
  uniform float uGasTime;
  uniform float uGasRate;         // the spin × pace: drift → radians per second
  uniform float uGasPeriod;
  uniform float uGasTurb;
  uniform float uGasDetail;
  uniform vec3 uGasOffset;
  uniform vec4 uGasStorm[${MAX_STORMS}];      // centre, half-length (0: none)
  uniform vec4 uGasStormShape[${MAX_STORMS}]; // aspect, kind, spin, cos of its reach
  uniform vec3 uGasStormColor[${MAX_STORMS}];
  uniform vec4 uGasPolar;         // polar latitude, cyclones north, south, polygon sides
  uniform vec3 uGasPolarColor;
  uniform vec3 uGasLight;         // the palette's brightest
  uniform float uGasTurn;         // how far the polar cyclones have turned
  uniform vec2 uGasHood;          // an ice giant's polar hood: |latitude| (0: none), which pole (±1)

  const float GAS_PI = 3.14159265;

  vec3 gasRotY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  vec4 gasRow(float lat) {
    return texture(uGasTable, vec2(lat / GAS_PI + 0.5, 0.25));
  }

  // Octaves of the tileable noise from \`first\`; those past \`octaves\` fade out. Billowy
  // (folded) octaves read as puffs of cloud up close.
  float gasFbm(vec3 q, float first, float octaves, float amp, float gain, bool billow) {
    float sum = 0.0;
    for (int i = 0; i < 6; i++) {
      float w = clamp(octaves - first - float(i), 0.0, 1.0);
      if (w <= 0.0) break;
      float v = texture(uNoise, q).r - 0.5;
      if (billow) v = 0.25 - abs(v);
      sum += amp * w * v;
      q = q * 2.03 + vec3(0.37, 0.11, 0.23);
      amp *= gain;
    }
    return sum;
  }

  vec3 gasColor(vec3 dir, float fp) {
    float lat = asin(clamp(dir.y, -1.0, 1.0));

    // Storms twist the clouds round them; remember the nearest.
    vec3 p = dir;
    float sd = 1e3;
    vec2 suv = vec2(0.0);
    vec4 sshape = vec4(0.0);
    vec3 scol = vec3(0.0);
    for (int i = 0; i < ${MAX_STORMS}; i++) {
      vec4 s = uGasStorm[i];
      vec4 shape = uGasStormShape[i];
      if (s.w <= 0.0 || dot(dir, s.xyz) < shape.w) continue;
      vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), s.xyz));
      vec3 north = cross(s.xyz, east);
      // In half-lengths, the ellipse stretched round.
      vec2 uv = vec2(dot(dir, east), dot(dir, north) * shape.x) / s.w;
      float d = length(uv);
      float a = shape.z * 2.6 * exp(-d * d * 1.1);
      vec2 r = mat2(cos(a), sin(a), -sin(a), cos(a)) * uv;
      r = vec2(r.x, r.y / shape.x) * s.w;
      vec3 twisted = s.xyz * sqrt(max(0.0, 1.0 - dot(r, r))) + east * r.x + north * r.y;
      p = normalize(p + twisted - dir);
      if (d < sd) { sd = d; suv = uv; sshape = shape; scol = uGasStormColor[i]; }
    }

    float plat = asin(clamp(p.y, -1.0, 1.0));
    float polar = smoothstep(uGasPolar.x - 0.06, uGasPolar.x + 0.06, abs(plat));
    float look = plat;
    // A polygonal jet round the north pole: the latitudes near it are bent to its shape.
    if (uGasPolar.w > 0.0 && plat > 0.0) {
      float cap = GAS_PI * 0.5 - uGasPolar.x;
      float colat = GAS_PI * 0.5 - plat;
      float seg = 2.0 * GAS_PI / uGasPolar.w;
      float a = mod(atan(p.z, p.x) + uGasTurn * 0.2, seg) - seg * 0.5;
      float edge = cos(GAS_PI / uGasPolar.w) / cos(a);
      float bend = 1.0 - smoothstep(cap * 1.2, cap * 2.0, colat);
      look = GAS_PI * 0.5 - colat / mix(1.0, edge, bend);
      // Inside it, the darker polar cap.
      polar = (1.0 - smoothstep(cap * 0.85, cap * 0.97, colat / mix(1.0, edge, bend))) * 0.6;
    }

    // The churning clouds, carried along by the wind: two copies, each carried for one
    // period and crossfaded, so the shear between bands never winds up.
    float drift = texture(uGasTable, vec2(plat / GAS_PI + 0.5, 0.75)).r * uGasRate;
    vec3 stretch = mix(vec3(1.4, 5.0, 1.4), vec3(1.6), polar);
    // Broad churning (a few octaves, it bends the bands) and, closer in, finer puffs of
    // cloud that only shade them: always about as contrasty at the pixel's own scale.
    float octaves = clamp(log2(1.0 / max(fp, 1e-7)) - 3.0, 2.0, 12.0) * uGasDetail;
    float phase = uGasTime / uGasPeriod;
    float n = 0.0;
    float fine = 0.0;
    for (int k = 0; k < 2; k++) {
      float f = fract(phase + 0.5 * float(k));
      float w = 1.0 - abs(2.0 * f - 1.0);
      vec3 q = gasRotY(p, -drift * f * uGasPeriod) * stretch + uGasOffset + float(k) * vec3(0.31, 0.47, 0.13);
      // Swirls: the cloud is read through a broad, slow warp.
      vec2 warp = vec2(texture(uNoise, q * 0.35).r, texture(uNoise, q * 0.35 + 0.5).r) - 0.5;
      q += vec3(warp.x, 0.0, warp.y) * 0.9;
      n += w * gasFbm(q, 0.0, min(octaves, 4.0), 0.5, 0.56, false);
      if (octaves > 4.0) fine += w * gasFbm(q * 16.9 + 0.29, 4.0, octaves, 0.5, 0.75, true);
    }
    n *= uGasTurb;
    fine *= uGasTurb;

    // Band edges ripple where the jets shear, and the colour follows.
    vec4 row = gasRow(look);
    vec3 col = gasRow(look + n * (0.025 + 0.1 * row.a) + fine * 0.002).rgb;
    col *= (1.0 + 0.45 * n) * (1.0 + 0.6 * fine);

    // An ice giant's bright polar hood (Uranus's, from ~45° up), its edge sharp.
    if (uGasHood.x > 0.0) col = mix(col, uGasLight * (1.05 + 0.3 * n), 0.45 * smoothstep(uGasHood.x - 0.02, uGasHood.x + 0.02, plat * uGasHood.y));

    // The polar regions: mottled and darker, with a ring of cyclones round a central one.
    if (polar > 0.0) {
      vec3 cap = uGasPolarColor * (1.0 + 0.9 * n);
      float count = plat > 0.0 ? uGasPolar.y : uGasPolar.z;
      if (count > 0.0) {
        float span = GAS_PI * 0.5 - uGasPolar.x;
        float colat = GAS_PI * 0.5 - abs(plat);
        float seg = 2.0 * GAS_PI / count;
        float az = atan(p.z, p.x) + (plat > 0.0 ? uGasTurn : -uGasTurn);
        float ring = span * 0.55;
        float rad = min(ring * sin(seg * 0.5) * 0.9, span * 0.3);
        vec2 at = colat * vec2(cos(az), sin(az));
        float cell = floor(az / seg);
        // Each its own size, a little off the ring.
        float h = fract(sin((cell + (plat > 0.0 ? 0.0 : 17.0)) * 12.9898) * 43758.5453);
        float c = (cell + 0.5 + 0.2 * (h - 0.5)) * seg;
        vec2 rel = at - ring * (0.9 + 0.2 * h) * vec2(cos(c), sin(c));
        float size = rad * (0.75 + 0.45 * h);
        if (colat < length(rel)) { rel = at; size = rad * 1.1; }
        float d = length(rel) / size;
        // Spiral arms of brighter cloud, frayed by the churning.
        float arms = sin(2.0 * atan(rel.y, rel.x) - 9.0 * d + 5.0 * n + 3.0 * fine);
        float cyclone = 1.0 - smoothstep(0.45, 1.0, d + 0.3 * n);
        cap = mix(cap, mix(uGasPolarColor, uGasLight, 0.3 + 0.25 * arms) * (1.0 + 0.6 * n), cyclone * 0.85);
      }
      col = mix(col, cap, polar);
    }

    // The nearest storm's own colour.
    if (sd < 3.0) {
      if (sshape.y < 0.5) {
        // A great red spot: its eye in a pale collar.
        float body = 1.0 - smoothstep(0.5, 0.95, sd);
        float collar = smoothstep(0.75, 1.0, sd) * (1.0 - smoothstep(1.05, 1.45, sd));
        col = mix(col, uGasLight * (1.0 + 0.3 * n), collar * 0.55);
        col = mix(col, scol * (1.0 + 0.8 * n) * (0.85 + 0.25 * sd), body);
      } else if (sshape.y < 1.5) {
        col = mix(col, scol * (1.0 + 0.4 * n), (1.0 - smoothstep(0.45, 1.0, sd)) * 0.9);
      } else if (sshape.y < 2.5) {
        col = mix(col, scol * (1.0 + 0.5 * n), (1.0 - smoothstep(0.4, 1.0, sd)) * 0.85);
      } else {
        float body = 1.0 - smoothstep(0.1, 1.0, sd + 0.6 * n);
        col = mix(col, scol, clamp(body * 1.2, 0.0, 1.0));
      }
    }
    return max(col, vec3(0.0));
  }
`;

/**
 * A gas or ice giant's cloud tops (gen/gasGiants.ts drawn): the bands from a
 * latitude table baked once, the churning clouds, storms and polar regions per
 * pixel. Its uniforms are shared by every material showing it, and it moves
 * as a pure function of the system clock (`animate`), like the lava.
 */
export class GasLook {
  readonly layout: GasLayout;
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly table: THREE.DataTexture;
  private readonly palette: THREE.Color[];
  private readonly spin: number;
  private readonly storms: THREE.Vector4[];

  constructor(seed: number, bands: readonly string[], spin: number, ice: boolean) {
    this.layout = generateGasLayout(seed, ice);
    this.palette = bands.map((b) => new THREE.Color(b));
    this.spin = spin;
    this.table = bakeTable(this.layout, this.palette, seed);
    const light = paletteAt(this.palette, 1, new THREE.Color());
    const polar = paletteAt(this.palette, 0.3, new THREE.Color()).lerp(new THREE.Color(POLAR_BLUE), 0.5);
    const { layout } = this;
    this.storms = Array.from({ length: MAX_STORMS }, () => new THREE.Vector4());
    const shapes = Array.from({ length: MAX_STORMS }, () => new THREE.Vector4());
    const colors = Array.from({ length: MAX_STORMS }, () => new THREE.Color());
    layout.storms.slice(0, MAX_STORMS).forEach((s, i) => {
      // The reach checked per pixel: the collar and the twist round it.
      shapes[i]!.set(s.aspect, KIND_CODE[s.kind], s.spin, Math.cos(Math.min(Math.PI, s.radius * 2.2)));
      stormColor(s.kind, this.palette, colors[i]!);
    });
    this.uniforms = {
      uNoise: { value: cloudNoiseTexture() },
      uGasTable: { value: this.table },
      uGasTime: { value: 0 },
      uGasRate: { value: 0 },
      uGasPeriod: { value: gasParams.period },
      uGasTurb: { value: 1 },
      uGasDetail: { value: 1 },
      uGasOffset: { value: new THREE.Vector3(((seed % 997) / 997) * 8, (((seed >>> 10) % 991) / 991) * 8, (((seed >>> 20) % 983) / 983) * 8) },
      uGasStorm: { value: this.storms },
      uGasStormShape: { value: shapes },
      uGasStormColor: { value: colors },
      uGasPolar: { value: new THREE.Vector4(layout.polar, layout.polarCyclones[0], layout.polarCyclones[1], layout.polygon?.sides ?? 0) },
      uGasPolarColor: { value: polar },
      uGasLight: { value: light },
      uGasTurn: { value: 0 },
      uGasHood: { value: new THREE.Vector2(layout.hood ? Math.abs(layout.hood) : 0, Math.sign(layout.hood ?? 1)) },
    };
    this.animate(0);
  }

  /** Shows the clouds at system time `time`: the bands' drift, and where the storms have drifted to. */
  animate(time: number): void {
    const u = this.uniforms;
    const rate = this.spin * gasParams.pace;
    u.uGasTime!.value = time;
    u.uGasRate!.value = rate;
    u.uGasPeriod!.value = gasParams.period;
    // Ice giants' clouds are calm (Uranus is nearly featureless).
    u.uGasTurb!.value = gasParams.turbulence * (this.layout.ice ? 0.45 : 1);
    u.uGasDetail!.value = gasParams.detail;
    // The circumpolar cyclones drift slowly round the pole.
    u.uGasTurn!.value = time * rate * 0.002;
    this.layout.storms.slice(0, MAX_STORMS).forEach((s, i) => {
      const lon = s.lon + gasDrift(this.layout, s.lat) * rate * time;
      const c = Math.cos(s.lat);
      this.storms[i]!.set(c * Math.sin(lon), Math.sin(s.lat), c * Math.cos(lon), s.radius);
    });
  }

  /** Paints the clouds onto `material` (a lit, smooth sphere in the body frame: the system view's or the globe's). */
  apply(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGasDir;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGasDir = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GAS_GLSL}\nvarying vec3 vGasDir;`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            float r = length(vGasDir);
            diffuseColor.rgb = gasColor(vGasDir / r, length(fwidth(vGasDir)) / r);
          }`,
        );
    };
    material.customProgramCacheKey = () => 'gas-clouds';
  }

  dispose(): void {
    this.table.dispose();
  }
}

/** Jupiter's polar regions are a darker, bluer grey than its bands (stylised mix, see docs/research/gas-giants.md). */
const POLAR_BLUE = '#56657a';

/** The palette (darkest first) at position `t` in [0, 1], blended between neighbours. */
export function paletteAt(palette: readonly THREE.Color[], t: number, out: THREE.Color): THREE.Color {
  const f = THREE.MathUtils.clamp(t, 0, 1) * (palette.length - 1);
  const i = Math.min(Math.floor(f), palette.length - 2);
  if (i < 0) return out.copy(palette[0]!);
  return out.lerpColors(palette[i]!, palette[i + 1]!, f - i);
}

/** A storm's colour from the planet's own palette. */
function stormColor(kind: GasStormKind, palette: readonly THREE.Color[], out: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  switch (kind) {
    case 'red':
      // The darkest band, deeper and redder: a brown palette gives a brick-red spot, a blue one a deep blue spot.
      paletteAt(palette, 0, out).getHSL(hsl);
      return out.setHSL(hsl.h - 0.03, Math.min(1, hsl.s * 1.5 + 0.15), Math.max(0.32, hsl.l));
    case 'white':
      return paletteAt(palette, 1, out).lerp(WHITE, 0.55);
    case 'dark':
      return paletteAt(palette, 0, out).multiplyScalar(0.5);
    case 'streak':
      return paletteAt(palette, 1, out).lerp(WHITE, 0.75);
  }
}

const WHITE = new THREE.Color(1, 1, 1);

/**
 * The latitude table: row 0 the bands' colour (linear) and how hard the jets
 * shear there, row 1 the drift. Thin seeded sub-bands ripple the tone, like
 * the fine banding inside Jupiter's and Saturn's belts.
 */
function bakeTable(layout: GasLayout, palette: readonly THREE.Color[], seed: number): THREE.DataTexture {
  const rng = new Rng(hashSeed(seed, 'gasSubBands'));
  const ripples = Array.from({ length: 5 }, () => ({ f: rng.range(25, 110), phase: rng.range(0, Math.PI * 2), a: rng.range(0.02, 0.05) }));
  const data = new Uint16Array(TABLE_ROWS * 2 * 4);
  const color = new THREE.Color();
  const half = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < TABLE_ROWS; i++) {
    const lat = ((i + 0.5) / TABLE_ROWS - 0.5) * Math.PI;
    let tone = gasTone(layout, lat);
    for (const r of ripples) tone += r.a * layout.contrast * Math.sin(r.f * lat + r.phase);
    paletteAt(palette, tone, color);
    const o = i * 4;
    data[o] = half(color.r);
    data[o + 1] = half(color.g);
    data[o + 2] = half(color.b);
    data[o + 3] = half(gasShear(layout, lat));
    const d = (TABLE_ROWS + i) * 4;
    data[d] = half(gasDrift(layout, lat));
  }
  const texture = new THREE.DataTexture(data, TABLE_ROWS, 2, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** The cloud tops of a gas or ice giant (null for anything else). */
export function createGasLook(config: PlanetConfig): GasLook | null {
  if (!config.bands?.length) return null;
  return new GasLook(config.seed, config.bands, config.spin, config.size === 'iceGiant');
}
