import { hexToRgb, rgbToHex } from './color';
import type { StarRef } from './galaxy';
import { generateName } from './names';
import type { Vec3Like } from './orbit';
import { conjugate, randomRotation, rotate, type Quat } from './quat';
import { hashSeed, Rng } from './rng';

/*
 * Nebulas: named clouds of glowing or dark gas on the galaxy map, which the
 * systems inside see in their sky. Pure data and maths (no THREE), from the
 * galaxy seed's own stream, so the stars never change. Sizes, colours and
 * kinds are researched in docs/research/nebulas.md; world/nebulaLook.ts
 * draws them with the same density model.
 *
 * Each nebula lives in its own frame ("local units"): its centre at the
 * origin, its bounding radius 1, turned into galaxy space by `orientation`
 * and scaled by `radius`. Everything it draws lies inside that unit sphere.
 */

export type NebulaKind = 'emission' | 'reflection' | 'dark' | 'planetary' | 'remnant';

/**
 * 'clouds': a few Gaussian blobs (emission, reflection, dark). The shells:
 * 'shell' a thin ellipsoidal shell (supernova remnants, some planetary
 * nebulas), 'ring' a shell brightest round its waist (the Ring Nebula),
 * 'bipolar' two lobes pinched at the waist (the Dumbbell).
 */
export type NebulaShape = 'clouds' | 'shell' | 'ring' | 'bipolar';

/** An axis-aligned Gaussian blob in the nebula's frame: density w·exp(-K·|(p - c)/r|²). */
export interface NebulaBlob {
  center: Vec3Like;
  radii: Vec3Like;
  weight: number;
}

export interface NebulaShell {
  /** Semi-axes of the shell's mid-surface, local units. */
  axes: Vec3Like;
  /** σ of the shell's radial profile, as a fraction of its radius. */
  width: number;
}

export interface NebulaData {
  id: number;
  kind: NebulaKind;
  name: string;
  /** Centre, galaxy units. */
  position: Vec3Like;
  /** Bounding radius, galaxy units. */
  radius: number;
  /** Rotation from the nebula's frame into galaxy space. */
  orientation: Quat;
  /** The star (id) it's built round: the one lighting it, or a planetary nebula's white dwarf. */
  star: number;
  /** That star's position in the nebula's frame. */
  starLocal: Vec3Like;
  shape: NebulaShape;
  /** 'clouds' only. */
  blobs: NebulaBlob[];
  /** Shells only. */
  shell: NebulaShell | null;
  /** Main and second colour (hex): e.g. Hα pink and O III teal (see docs/research/nebulas.md). */
  colors: [string, string];
  /** Light emitted (or scattered) per unit of density along a ray, local units. */
  glow: number;
  /** Optical depth of dust per unit of density along a ray, local units: how much it dims what's behind. */
  dust: number;
  /** Structure noise: texture periods per local unit, and an offset into the noise. */
  noiseScale: number;
  noiseOffset: Vec3Like;
}

/** Gaussian falloff: density is ~1% at a blob's radii (the galaxy's glow volumes use the same). */
export const NEBULA_K = 4.5;
/** Blobs per 'clouds' nebula at most (the shader's slots). */
export const MAX_BLOBS = 6;

/**
 * The map's radius (1000 units) is the Milky Way's D25 radius, 26.8 kpc / 2
 * = 43,700 ly, so a unit is 43.7 ly (see docs/research/nebulas.md), and
 * real nebulas would be 0.01–5 map units across, far smaller than the map's star
 * spacing (~25 units): they would be invisible and hold no systems. So the
 * map radius is SIZE_FACTOR · √(real radius in ly): the biggest (Carina,
 * 230 ly) ~90 units, a few star spacings, and the order of the kinds kept.
 * A deliberate, stylised departure.
 */
const SIZE_FACTOR = 6;
/**
 * A planetary nebula's shell must reach well past the galaxy camera at the
 * zoom's handover (3 units from the star, see seamlessZoom.ts), or the view
 * from the galaxy and from inside the system would differ; so it's at least
 * this big on the map (its real 0.3–2.9 ly would be 3.4–10 units).
 */
const MIN_PLANETARY_RADIUS = 8;

interface KindSpec {
  /** Real radii in light years, smallest and biggest reference (docs/research/nebulas.md). */
  lightYears: readonly [number, number];
  /** Count in a galaxy of DEFAULT_STAR_COUNT stars (scaled with the star count). */
  count: number;
}

const KINDS: Record<NebulaKind, KindSpec> = {
  // Orion Nebula (radius 13 ly) to the Carina Nebula (~230 ly).
  emission: { lightYears: [13, 230], count: 12 },
  // Iris Nebula (3 ly) to Messier 78 (5 ly).
  reflection: { lightYears: [3, 5], count: 8 },
  // Horsehead (3.5 ly) to the Coalsack (30–35 ly).
  dark: { lightYears: [3.5, 35], count: 10 },
  // Ring Nebula (0.1 pc ≈ 0.33 ly) to the Helix (2.87 ly).
  planetary: { lightYears: [0.33, 2.87], count: 6 },
  // Crab Nebula (5.5 ly) to the Cygnus Loop (120 ly across).
  remnant: { lightYears: [5.5, 60], count: 4 },
};

/** Placed in this order, so the rarer, bigger kinds get first pick of the room. */
const ORDER: readonly NebulaKind[] = ['emission', 'remnant', 'dark', 'reflection', 'planetary'];
const REFERENCE_STAR_COUNT = 4000;

/*
 * Colours from the emission lines and scattered starlight through the CIE
 * 1931 colour-matching functions into sRGB (script and table in
 * docs/research/nebulas.md).
 */
/** Hα 656.3 nm + Hβ 486.1 nm at 1 : 1/2.86 (case B): an H II region's pink. */
export const H_II_PINK = '#ff64ba';
/** Hα alone (and [N II] 658.4, [S II] 671.6 nm, the same red in sRGB). */
export const H_ALPHA_RED = '#ff0052';
/** [O III] 500.7 nm: the teal of planetary nebulas and hot H II cores. */
export const O_III_TEAL = '#00ffd5';
/** Starlight scattered ∝ λ^-1 and ∝ λ^-4 (Rayleigh): a B star's (20,000 K) and an A star's (10,000 K). */
const REFLECTED_B = ['#90afff', '#577eff'] as const;
const REFLECTED_A = ['#adc5ff', '#6791ff'] as const;
/** Dark clouds barely glow (stylised: dust faintly lit by the galaxy around it). */
const DUST_BROWN = '#3d342e';

/**
 * The galaxy's nebulas, around suitable stars: emission nebulas round hot O
 * and B stars in the arms (H II regions trace the arms), reflection nebulas
 * round B and A stars (too cool to ionise the gas), planetary nebulas round
 * white dwarfs, dark clouds and supernova remnants anywhere in the disc.
 * They never overlap. Deterministic, and independent of every other stream.
 */
export function generateNebulas(seed: number, stars: readonly StarRef[], galaxyRadius: number): NebulaData[] {
  const rng = new Rng(hashSeed(seed, 'nebulas'));
  const nebulas: NebulaData[] = [];
  const used = new Set<number>();
  const disc = (s: StarRef, min: number) => Math.hypot(s.position.x, s.position.z) > min * galaxyRadius;
  const hosts: Record<NebulaKind, (s: StarRef) => boolean> = {
    emission: (s) => disc(s, 0.2) && (s.stars[0]!.kind === 'blueGiant' || ['O', 'B'].includes(s.stars[0]!.spectralClass) && s.stars[0]!.kind === 'mainSequence'),
    reflection: (s) => disc(s, 0.15) && s.stars[0]!.kind === 'mainSequence' && ['B', 'A'].includes(s.stars[0]!.spectralClass),
    dark: (s) => disc(s, 0.2),
    planetary: (s) => s.stars.some((m) => m.kind === 'whiteDwarf'),
    remnant: (s) => disc(s, 0.1),
  };

  for (const kind of ORDER) {
    const krng = rng.fork(kind);
    const wanted = Math.round((KINDS[kind].count * stars.length) / REFERENCE_STAR_COUNT);
    const candidates = stars.filter(hosts[kind]);
    let made = 0;
    for (let tries = 0; made < wanted && candidates.length > 0 && tries < wanted * 30; tries++) {
      const host = krng.pick(candidates);
      if (used.has(host.id)) continue;
      const nrng = krng.fork('nebula', tries);
      const nebula = makeNebula(nrng, nebulas.length, kind, host);
      const clash = nebulas.some(
        (n) => distance(n.position, nebula.position) < n.radius + nebula.radius,
      );
      if (clash) continue;
      used.add(host.id);
      nebulas.push(nebula);
      made++;
    }
  }
  return nebulas;
}

function makeNebula(rng: Rng, id: number, kind: NebulaKind, host: StarRef): NebulaData {
  const [lo, hi] = KINDS[kind].lightYears;
  // Log-uniform between the reference sizes.
  const lightYears = lo * Math.pow(hi / lo, rng.next());
  let radius = SIZE_FACTOR * Math.sqrt(lightYears);
  if (kind === 'planetary') radius = Math.max(radius, MIN_PLANETARY_RADIUS);

  // Clouds lie roughly in the disc (turned about the pole, a little tilted); shells any way round.
  const orientation =
    kind === 'emission' || kind === 'dark' ? tiltedTurn(rng, 0.25) : randomRotation(rng);
  const starLocal = kind === 'planetary' ? { x: 0, y: 0, z: 0 } : randomInBall(rng, kind === 'dark' ? 0.45 : 0.25);
  // The centre sits so that the host star is at starLocal.
  const offset = rotate(orientation, starLocal, { x: 0, y: 0, z: 0 });
  const position = {
    x: host.position.x - offset.x * radius,
    y: host.position.y - offset.y * radius,
    z: host.position.z - offset.z * radius,
  };

  const base = {
    id,
    kind,
    name: `${generateName(rng.fork('name'))} Nebula`,
    position,
    radius,
    orientation,
    star: host.id,
    starLocal,
    noiseOffset: { x: rng.next(), y: rng.next(), z: rng.next() },
  };
  switch (kind) {
    case 'emission':
      return {
        ...base,
        shape: 'clouds',
        blobs: cloudBlobs(rng, starLocal, rng.int(4, 6), { size: [0.25, 0.45], flatten: 0.7, stretch: 1.3 }),
        shell: null,
        colors: [jitterColor(rng, H_II_PINK), O_III_TEAL],
        glow: 1,
        dust: rng.range(0.4, 1.2),
        noiseScale: rng.range(3, 4.5),
      };
    case 'reflection': {
      const hot = host.stars[0]!.spectralClass === 'B';
      const [flat, steep] = hot ? REFLECTED_B : REFLECTED_A;
      return {
        ...base,
        shape: 'clouds',
        blobs: cloudBlobs(rng, starLocal, rng.int(2, 3), { size: [0.2, 0.4], flatten: 1, stretch: 2 }),
        shell: null,
        colors: [mixHex(flat, steep, rng.next()), mixHex(flat, '#ffffff', 0.4)],
        glow: rng.range(0.35, 0.55),
        dust: 0.3,
        noiseScale: rng.range(2.2, 3),
      };
    }
    case 'dark':
      return {
        ...base,
        shape: 'clouds',
        blobs: cloudBlobs(rng, starLocal, rng.int(3, 5), { size: [0.18, 0.3], flatten: 0.8, stretch: 2.5 }),
        shell: null,
        colors: [DUST_BROWN, DUST_BROWN],
        glow: 0.05,
        dust: rng.range(12, 20),
        noiseScale: rng.range(1.8, 2.5),
      };
    case 'planetary': {
      const shape = rng.weighted<NebulaShape>([
        ['ring', 2],
        ['bipolar', 2],
        ['shell', 1],
      ]);
      const width = rng.range(0.1, 0.16);
      // The mid-surface plus three widths stays inside the bound.
      const r = 1 / (1 + 3 * width);
      const axes =
        shape === 'bipolar'
          ? { x: r, y: r, z: r }
          : { x: r, y: r * rng.range(0.6, 0.95), z: r * rng.range(0.85, 1) };
      return {
        ...base,
        shape,
        blobs: [],
        shell: { axes, width },
        // Teal O III inside, red Hα and [N II] round the rim.
        colors: [H_ALPHA_RED, O_III_TEAL],
        glow: 0.25,
        dust: 0,
        noiseScale: rng.range(2.5, 3.5),
      };
    }
    case 'remnant': {
      const width = rng.range(0.05, 0.08);
      const r = 1 / (1 + 3 * width);
      return {
        ...base,
        shape: 'shell',
        blobs: [],
        shell: { axes: { x: r, y: r * rng.range(0.85, 1), z: r * rng.range(0.85, 1) }, width },
        // Red Hα and [S II] and teal O III filaments, like the Veil.
        colors: [H_ALPHA_RED, O_III_TEAL],
        glow: 0.3,
        dust: 0,
        noiseScale: rng.range(2, 3),
      };
    }
  }
}

interface BlobStyle {
  /** Range of the smaller radii. */
  size: readonly [number, number];
  /** Vertical squash (the disc's own flatness). */
  flatten: number;
  /** Up to this many times longer along x (filaments, wisps). */
  stretch: number;
}

/** The first blob round the host star (so it's always inside), the rest scattered round the middle. */
function cloudBlobs(rng: Rng, star: Vec3Like, count: number, style: BlobStyle): NebulaBlob[] {
  const blobs: NebulaBlob[] = [];
  for (let i = 0; i < Math.min(count, MAX_BLOBS); i++) {
    const center = i === 0 ? { ...star } : randomInBall(rng, 0.5);
    // Radii such that each blob (1% at its radii) stays inside the unit bound.
    const room = 1 - Math.hypot(center.x, center.y, center.z);
    const s = rng.range(style.size[0], style.size[1]);
    const radii = {
      x: Math.min(room, s * rng.range(1, style.stretch)),
      y: Math.min(room, s * style.flatten),
      z: Math.min(room, s * rng.range(0.8, 1.2)),
    };
    blobs.push({ center, radii, weight: i === 0 ? 1 : rng.range(0.5, 1) });
  }
  return blobs;
}

/** A turn about +Y, then a tilt of up to `maxTilt` radians about a horizontal axis. */
function tiltedTurn(rng: Rng, maxTilt: number): Quat {
  const turn = rng.range(0, Math.PI * 2);
  const tilt = rng.range(-maxTilt, maxTilt);
  const ys = Math.sin(turn / 2);
  const yw = Math.cos(turn / 2);
  const xs = Math.sin(tilt / 2);
  const xw = Math.cos(tilt / 2);
  // (turn about Y) · (tilt about X)
  return { x: yw * xs, y: ys * xw, z: -ys * xs, w: yw * xw };
}

function randomInBall(rng: Rng, radius: number): Vec3Like {
  const z = rng.range(-1, 1);
  const t = rng.range(0, Math.PI * 2);
  const s = Math.sqrt(1 - z * z);
  const r = radius * Math.cbrt(rng.next());
  return { x: r * s * Math.cos(t), y: r * s * Math.sin(t), z: r * z };
}

function jitterColor(rng: Rng, hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const k = rng.range(-0.08, 0.08);
  return rgbToHex(r, g + k, b + k);
}

function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

function distance(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** A galaxy-space point in the nebula's frame (local units). */
export function toNebulaLocal<T extends Vec3Like>(n: NebulaData, p: Vec3Like, out: T): T {
  out.x = (p.x - n.position.x) / n.radius;
  out.y = (p.y - n.position.y) / n.radius;
  out.z = (p.z - n.position.z) / n.radius;
  return rotate(conjugate(n.orientation), out, out);
}

/**
 * The shell's radial coordinate at local `p`: 1 on its mid-surface. A
 * bipolar nebula's surface is pinched to under half its size at the waist.
 */
function shellRadius(shape: NebulaShape, shell: NebulaShell, p: Vec3Like): number {
  const qx = p.x / shell.axes.x;
  const qy = p.y / shell.axes.y;
  const qz = p.z / shell.axes.z;
  const q = Math.hypot(qx, qy, qz);
  if (shape !== 'bipolar' || q < 1e-9) return q;
  return q / bipolarReach(Math.abs(qy) / q);
}

/** A bipolar shell's reach (1 at the poles) as a function of |cos| of the angle from its axis. */
export function bipolarReach(cosPolar: number): number {
  return 0.4 + 0.6 * Math.pow(cosPolar, 0.8);
}

/**
 * The smooth density (no noise) at a point in the nebula's frame: about 1
 * in its thickest parts, 0 far outside. The shader multiplies it by noise
 * with a mean of about 1.
 */
export function nebulaDensity(n: NebulaData, p: Vec3Like): number {
  if (n.shape === 'clouds') {
    let sum = 0;
    for (const b of n.blobs) {
      const x = (p.x - b.center.x) / b.radii.x;
      const y = (p.y - b.center.y) / b.radii.y;
      const z = (p.z - b.center.z) / b.radii.z;
      sum += b.weight * Math.exp(-NEBULA_K * (x * x + y * y + z * z));
    }
    return sum;
  }
  const shell = n.shell!;
  const u = (shellRadius(n.shape, shell, p) - 1) / shell.width;
  let d = Math.exp(-0.5 * u * u);
  if (n.shape === 'ring') {
    // Brightest round the waist (the equator of the shell's y axis).
    const y = p.y / shell.axes.y / 0.3;
    d *= 0.3 + 1.2 * Math.exp(-0.5 * y * y);
  }
  return d;
}

/** Density above which a point of a 'clouds' nebula counts as inside it. */
const INSIDE_DENSITY = 0.15;

/**
 * Whether a point (nebula frame) is inside: in a cloud's thick part, or
 * within a shell's outer surface (the gas all round you).
 */
function inside(n: NebulaData, p: Vec3Like): boolean {
  if (Math.hypot(p.x, p.y, p.z) >= 1) return false;
  if (n.shape === 'clouds') return nebulaDensity(n, p) >= INSIDE_DENSITY;
  return shellRadius(n.shape, n.shell!, p) <= 1 + 2 * n.shell!.width;
}

export interface NebulaSample {
  nebula: NebulaData;
  /** Smooth density there (0–~1; inside a shell, the shell's own density). */
  density: number;
  /** The gas's colour there (hex). */
  color: string;
}

/**
 * The nebula a galaxy-space point is inside, if any, with its density and
 * colour there. Where two would overlap (they don't, see generateNebulas)
 * the smaller one wins.
 */
export function nebulaAt(nebulas: readonly NebulaData[], p: Vec3Like): NebulaSample | null {
  let best: NebulaSample | null = null;
  const local = { x: 0, y: 0, z: 0 };
  for (const n of nebulas) {
    if (distance(n.position, p) >= n.radius) continue;
    toNebulaLocal(n, p, local);
    if (!inside(n, local)) continue;
    if (best && best.nebula.radius <= n.radius) continue;
    best = { nebula: n, density: nebulaDensity(n, local), color: nebulaColor(n, local) };
  }
  return best;
}

/** The colour of the gas at a local point, as the shader mixes it (without its noise). */
export function nebulaColor(n: NebulaData, p: Vec3Like): string {
  const [a, b] = n.colors;
  switch (n.kind) {
    case 'emission': {
      // The O III core round the hot star.
      const d2 = (p.x - n.starLocal.x) ** 2 + (p.y - n.starLocal.y) ** 2 + (p.z - n.starLocal.z) ** 2;
      return mixHex(a, b, EMISSION_CORE * Math.exp(-d2 / EMISSION_CORE_SIZE));
    }
    case 'planetary': {
      const rim = nebulaDensity(n, p);
      const inner = planetaryInner(n.shell!, shellRadius(n.shape, n.shell!, p));
      return rim + inner > 0 ? mixHex(a, b, inner / (rim + inner)) : b;
    }
    case 'remnant':
      return mixHex(a, b, 0.5);
    default:
      return a;
  }
}

/**
 * A planetary nebula glows in two layers: O III in a thick zone inside, Hα
 * and [N II] in the thin rim outside it (the Ring Nebula's teal middle and
 * red edge). The inner zone's density, peaking at PLANETARY_INNER_RADIUS of
 * the shell's radius, σ PLANETARY_INNER_WIDTH shell widths.
 */
export const PLANETARY_INNER_RADIUS = 0.7;
export const PLANETARY_INNER_WIDTH = 2.5;
export const PLANETARY_INNER_WEIGHT = 0.6;

export function planetaryInner(shell: NebulaShell, shellR: number): number {
  const u = (shellR - PLANETARY_INNER_RADIUS) / (shell.width * PLANETARY_INNER_WIDTH);
  return PLANETARY_INNER_WEIGHT * Math.exp(-0.5 * u * u);
}

/** How much of an emission nebula's colour is O III at the star, and the core's size (σ², local units). */
export const EMISSION_CORE = 0.45;
export const EMISSION_CORE_SIZE = 0.04;

/** erfc, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7), as galaxy/glowVolume.ts's shader has it. */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const r = y * Math.exp(-z * z);
  return x >= 0 ? r : 2 - r;
}

/** ∫_near^∞ exp(-k·|o + t·d|²) dt in closed form (the shader's gaussianPath). */
export function gaussianPath(o: Vec3Like, d: Vec3Like, k: number, near: number): number {
  const a = d.x * d.x + d.y * d.y + d.z * d.z;
  const m = (o.x * d.x + o.y * d.y + o.z * d.z) / a;
  const perp2 = Math.max(o.x * o.x + o.y * o.y + o.z * o.z - m * m * a, 0);
  const ka = k * a;
  return ((Math.exp(-k * perp2) * 0.886226925) / Math.sqrt(ka)) * erfc(Math.sqrt(ka) * (m + near));
}

/**
 * The smooth density integrated along a ray from galaxy-space `origin` in
 * unit direction `dir`, for `length` galaxy units (default: all the way
 * out), in local units (the nebula's radius = 1). Closed form for clouds,
 * marched for shells.
 */
export function nebulaColumn(n: NebulaData, origin: Vec3Like, dir: Vec3Like, length = Infinity): number {
  const o = toNebulaLocal(n, origin, { x: 0, y: 0, z: 0 });
  const d = rotate(conjugate(n.orientation), dir, { x: 0, y: 0, z: 0 });
  const end = length / n.radius;
  if (n.shape === 'clouds') {
    let sum = 0;
    for (const b of n.blobs) {
      const bo = { x: (o.x - b.center.x) / b.radii.x, y: (o.y - b.center.y) / b.radii.y, z: (o.z - b.center.z) / b.radii.z };
      const bd = { x: d.x / b.radii.x, y: d.y / b.radii.y, z: d.z / b.radii.z };
      const far = Number.isFinite(end) ? gaussianPath(bo, bd, NEBULA_K, end) : 0;
      sum += b.weight * (gaussianPath(bo, bd, NEBULA_K, 0) - far);
    }
    return sum;
  }
  // Shells: march the part of the ray inside the unit sphere.
  const bq = o.x * d.x + o.y * d.y + o.z * d.z;
  const c = o.x * o.x + o.y * o.y + o.z * o.z - 1;
  const h = bq * bq - c;
  if (h <= 0) return 0;
  const t0 = Math.max(-bq - Math.sqrt(h), 0);
  const t1 = Math.min(-bq + Math.sqrt(h), end);
  if (t1 <= t0) return 0;
  const steps = 400;
  const dt = (t1 - t0) / steps;
  const p = { x: 0, y: 0, z: 0 };
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const t = t0 + (i + 0.5) * dt;
    p.x = o.x + d.x * t;
    p.y = o.y + d.y * t;
    p.z = o.z + d.z * t;
    sum += nebulaDensity(n, p) * dt;
  }
  return sum;
}

/** Only dark nebulas are thick enough to hide the stars behind them (on the map and in a system's sky). */
export function dimsStars(n: NebulaData): boolean {
  return n.kind === 'dark';
}

/**
 * How much starlight gets through the dark nebulas along a ray from galaxy
 * space `origin` in unit direction `dir` (0–1), over `length` galaxy units.
 */
export function starTransmittance(nebulas: readonly NebulaData[], origin: Vec3Like, dir: Vec3Like, length = Infinity): number {
  let depth = 0;
  for (const n of nebulas) {
    if (!dimsStars(n)) continue;
    depth += n.dust * nebulaColumn(n, origin, dir, length);
  }
  return Math.exp(-depth);
}

export function describeNebula(kind: NebulaKind): string {
  switch (kind) {
    case 'emission':
      return 'Emission nebula · where stars are born';
    case 'reflection':
      return 'Reflection nebula · dust lit by its star';
    case 'dark':
      return 'Dark nebula · dust hiding the stars';
    case 'planetary':
      return 'Planetary nebula · a dying star’s shell';
    case 'remnant':
      return 'Supernova remnant';
  }
}
