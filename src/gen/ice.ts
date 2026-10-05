import type { ClimateData } from './climate';
import { hexToRgb, hslToHex, rgbToHsl } from './color';
import { ICE_CLASSES, iceHex } from './iceColor';
import type { PlanetStyle, PlanetType, MoonType } from './planets';
import { hashSeed, Rng } from './rng';
import { weatherKind } from './weather';

/**
 * Icy bodies' surfaces as data: how clean their ice is, their palette
 * (gen/iceColor.ts) and their lineae (Europa's crack bands).
 * world/iceLook.ts draws them. See docs/research/ice.md.
 */

/** Europa's lineae and chaos: the reddest 2% of Galileo's natural-colour view (PIA19048), hsl(16°, 0.22, 0.46). */
export const LINEAE_HSL = [16, 0.22, 0.46] as const;

/** The most lineae a body has (each a uniform slot in the shader). */
export const MAX_LINEAE = 28;

/**
 * One lineae band: an arc of a circle on the unit sphere. Points p on it have
 * dot(p, pole) = offset (0: a great circle); along it, the angle from `ref`
 * (towards pole × ref) runs `centre` ± `half`. `width` is its half-width in
 * radians; `strength` how dark it is (0–1); `ridge` (0–1) how bright its
 * central ridge is (a triple band, as Europa's: dark flanks, a bright crest).
 */
export interface Linea {
  pole: [number, number, number];
  offset: number;
  ref: [number, number, number];
  centre: number;
  half: number;
  width: number;
  strength: number;
  ridge: number;
}

/** An icy body's surface beyond its style's colours. */
export interface IceSurface {
  /** How clean its ice is, 0 (coated dark, as Callisto) to 1 (clean, as Europa or Enceladus): its sparkle, gloss and blue. */
  clean: number;
  /** How much the surface is cracked into lineae, 0–1 (tidal flexing and heat break the shell, as on Europa). */
  lineae: number;
  /** The lineae and chaos terrain's colour (hex): non-ice material welled up along the cracks. */
  lineaeColor: string;
  /** Snow, firn, glacier ice and leads (hex), tinted like the body's own ice. */
  snow: string;
  blueIce: string;
  lead: string;
  /** Whether its sea is frozen water (a Titan's is liquid methane, drawn as it was). */
  frozenSea: boolean;
  lines: Linea[];
}

/** What an icy body's surface needs. */
export interface IceBody {
  type: PlanetType | MoonType;
  seed: number;
  style: PlanetStyle;
  climate?: ClimateData | null;
}

/**
 * Heat flow (W/m²) where lineae start and where they're as dense as Europa's
 * (0.05 W/m² in gen/sol.ts): Callisto (0.005) has none, Ganymede (0.01) a few,
 * Enceladus (0.03) many.
 */
const LINEAE_HEAT: readonly [number, number] = [0.004, 0.05];
/** Surface albedo from which ice looks dirty to clean: Callisto 0.22, Ganymede 0.44, Europa 0.68 (NASA, visual geometric). */
const CLEAN_ALBEDO: readonly [number, number] = [0.25, 0.65];
/** Lineae half-widths, radians (Europa's ridges are ~1 km, its bands up to 25 km on a 1561 km moon: 0.0006–0.016; widened so they read on the game's globes). */
const LINEA_WIDTH: readonly [number, number] = [0.003, 0.02];
/** How much more saturated the game's lineae are than Europa's measured colour. */
const LINEAE_BOLDER = 0.18;
/** Lineae half-lengths, radians (a 900 km band on Europa is 0.58 rad long; many run further). */
const LINEA_HALF: readonly [number, number] = [0.25, 1.4];

/** The ice surface of an icy body (ice worlds and moons), or null for anything else. Its own stream, so no other draw moves. */
export function iceSurface(body: IceBody): IceSurface | null {
  if (body.type !== 'ice') return null;
  const rng = new Rng(hashSeed(body.seed, 'ice'));
  const { climate, style } = body;
  const albedo = climate?.surfaceAlbedo ?? 0.65;
  const clean = smoothstep(CLEAN_ALBEDO[0], CLEAN_ALBEDO[1], albedo);
  const lineae = smoothstep(LINEAE_HEAT[0], LINEAE_HEAT[1], climate?.heatFlow ?? 0);
  // The body's own ice hue (its low ground), for tinting.
  const [lr, lg, lb] = hexToRgb(style.low);
  // Blue-tinted ice keeps its tint; a body whose ground is brown or grey (non-ice material) has plain ice's blue.
  const [ownHue, ownSat] = rgbToHsl(lr, lg, lb);
  const hue = ownSat > 0.05 && ownHue >= 170 && ownHue <= 240 ? ownHue : undefined;
  const [h, s, l] = LINEAE_HSL;
  const lines: Linea[] = [];
  const count = Math.round(lineae * MAX_LINEAE);
  for (let i = 0; i < count; i++) {
    const pole = unitVector(rng);
    // A reference direction square to the pole.
    const any = unitVector(rng);
    const d = dot(any, pole);
    const ref = normalise([any[0] - d * pole[0], any[1] - d * pole[1], any[2] - d * pole[2]]);
    lines.push({
      pole,
      offset: rng.range(-0.3, 0.3),
      ref,
      centre: rng.range(-Math.PI, Math.PI),
      half: rng.range(LINEA_HALF[0], LINEA_HALF[1]),
      width: LINEA_WIDTH[0] * Math.pow(LINEA_WIDTH[1] / LINEA_WIDTH[0], rng.next() ** 1.5),
      strength: rng.range(0.45, 1),
      ridge: rng.chance(0.5) ? rng.range(0.5, 1) : 0,
    });
  }
  return {
    clean,
    lineae,
    // Stylised: more saturated than Galileo's view (0.22), so the bands read as reddish-brown on a globe a few hundred pixels across.
    lineaeColor: hslToHex(h + rng.range(-10, 14), s + LINEAE_BOLDER + rng.range(-0.05, 0.1), l + rng.range(-0.1, 0.02)),
    snow: iceHex(ICE_CLASSES.snow, hue),
    blueIce: iceHex(ICE_CLASSES.blueIce, hue),
    // New ice over dark water is greyer than glacier ice (stylised): a third of its blue.
    lead: mixGrey(iceHex(ICE_CLASSES.lead, hue), 0.65),
    frozenSea: style.sea !== null && weatherKind(body.type, climate) !== 'methane',
    lines,
  };
}

/** The lineae index's size (equirectangular texels; 6 ms to build for 28 lineae, against 40 at twice the size) and how many lineae each texel lists. */
export const LINEAE_INDEX_SIZE: readonly [width: number, height: number] = [128, 64];
export const LINEAE_PER_TEXEL = 4;
/** Room past a band's edge for the pixels' own width (radians): beyond it a band has faded to its average. */
const LINEAE_INDEX_MARGIN = 0.01;

/**
 * Which lineae can show in each texel of an equirectangular grid (longitude
 * atan2(x, z), latitude asin(y), as the shader looks it up), so the shader
 * tests a few per pixel instead of all of them: up to LINEAE_PER_TEXEL
 * indices + 1 per texel (0: none), nearest first, RGBA bytes. A linea is
 * listed where its band (with LINEAE_INDEX_MARGIN) comes within the texel's
 * half-diagonal of the texel's centre. Pure and deterministic.
 */
export function lineaeIndex(lines: readonly Linea[], [width, height] = LINEAE_INDEX_SIZE): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const near: [distance: number, index: number][] = [];
  // Per linea: the circle's angular radius and its arc's other axis.
  const rings = lines.map((l) => Math.acos(Math.min(1, Math.max(-1, l.offset))));
  const axes = lines.map((l) => cross(l.pole, l.ref));
  const p: [number, number, number] = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    const lat = ((y + 0.5) / height - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    // Half the texel's diagonal, radians (its width shrinks with the latitude's cosine; the edge nearer the equator counts).
    const edgeCos = Math.cos(Math.max(0, Math.abs(lat) - Math.PI / height / 2));
    const reach = 0.5 * Math.hypot(((2 * Math.PI) / width) * edgeCos, Math.PI / height);
    // The band of dot(p, pole) each linea's texels fall in, at this reach.
    const bands = lines.map((l, i) => {
      const room = reach + l.width + LINEAE_INDEX_MARGIN;
      return [Math.cos(Math.min(Math.PI, rings[i]! + room)), Math.cos(Math.max(0, rings[i]! - room)), room] as const;
    });
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) / width - 0.5) * 2 * Math.PI;
      p[0] = cosLat * Math.sin(lon);
      p[1] = Math.sin(lat);
      p[2] = cosLat * Math.cos(lon);
      near.length = 0;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        const [lo, hi, room] = bands[i]!;
        // Near the circle, then along the arc.
        const c = dot(p, l.pole);
        if (c < lo || c > hi) continue;
        const ang = Math.atan2(dot(p, axes[i]!), dot(p, l.ref));
        const along = Math.abs(((ang - l.centre + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        if (along > l.half + room / Math.max(Math.sin(rings[i]!), 1e-3)) continue;
        near.push([Math.abs(Math.acos(Math.min(1, Math.max(-1, c))) - rings[i]!), i]);
      }
      if (near.length > 1) near.sort((a, b) => a[0] - b[0]);
      const o = (y * width + x) * 4;
      for (let k = 0; k < Math.min(LINEAE_PER_TEXEL, near.length); k++) out[o + k] = near[k]![1] + 1;
    }
  }
  return out;
}

/** A colour moved `t` of the way to the grey of its own lightness. */
function mixGrey(hex: string, t: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return hslToHex(h, s * (1 - t), l);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function unitVector(rng: Rng): [number, number, number] {
  const z = rng.range(-1, 1);
  const a = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a)];
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}

function normalise(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
