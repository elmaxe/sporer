import { BLACK_HOLE_MASS, DISC_OUTER, FEEDING, blackHoleStar, discOf, isBlackHole, type AccretionDisc } from '../gen/blackHoles';
import { jitterHsl } from '../gen/color';
import { BINARY_CHANCE, generateGalaxy, solRef, systemRef, type StarRef } from '../gen/galaxy';
import { generateName } from '../gen/names';
import { Rng, hashSeed, parseSeed } from '../gen/rng';
import { kindActivity, stormAlive, stormEvent, stormSlots, type StarActivity, type StormKind, type StormSpec } from '../gen/starActivity';
import {
  MAIN_SEQUENCE_CLASSES,
  STAR_KINDS,
  generateCompanion,
  generateStar,
  nominalStar,
  starBaseColor,
  type SpectralClass,
  type StarData,
  type StarKind,
} from '../gen/stars';
import { generateSystem, tuneSystem, type SystemData, type SystemTuning } from '../gen/system';

/*
 * The star lab's model (pure, no THREE or DOM): one star or a binary pair,
 * every number the game draws it from (its kind, size, colour and how it
 * lives: surface, spots, storms), the seed its system grows from and the
 * system tuner's changes to that growth, and how it's all shown. Encoded into
 * the page's #hash, so any star and its system is a link.
 */

export type StarLabViewKind = 'star' | 'system';

export interface StarLabView {
  /** The star(s) close up, or the whole system round them. */
  view: StarLabViewKind;
  /** System seconds per real second (0: stopped). */
  speed: number;
  /** Orbit trails behind the planets and moons (system view). */
  trails: boolean;
  /** The lab's random starfield behind it all. */
  starfield: boolean;
  wireframe: boolean;
}

export const DEFAULT_STAR_VIEW: StarLabView = {
  view: 'star',
  speed: 1,
  trails: true,
  starfield: true,
  wireframe: false,
};

/** Where a star came from: star `star` of the galaxy of `seed` (`star` may be 'sol'). */
export interface StarLabSource {
  seed: string;
  star: number | 'sol';
}

export interface StarLabState {
  name: string;
  /** The system's seed: the stars' surface patterns and storms, and everything the system grows. */
  seed: number;
  /** One star, or two (the larger first), each with its full `activity`. */
  stars: StarData[];
  /** A young star wrapped in its protoplanetary disc, with planets still forming (gen/discs.ts). */
  young: boolean;
  /** Our own solar system: hand-made (gen/sol.ts), so only the star's look applies. */
  real?: 'sol';
  /** The system tuner's changes (gen/system.ts SystemTuning; ordinary systems only). */
  tuning: SystemTuning;
  view: StarLabView;
  source?: StarLabSource;
}

export interface GenerateStarOptions {
  kind?: StarKind;
  /** A main-sequence star's class. */
  spectralClass?: SpectralClass;
  /** Two stars (true), one (false), or as often as the galaxy has them. */
  binary?: boolean;
  young?: boolean;
}

/** The lab's ranges for a star's numbers (the panel's sliders; links are clamped to them). */
export const STAR_RANGES = {
  radius: [3, 150],
  luminosity: [0.005, 60],
  mass: [0.08, 30],
} as const satisfies Record<string, readonly [number, number]>;

/** The lab's ranges for a black hole's numbers (wider than the galaxy draws). */
export const HOLE_RANGES = {
  mass: [3, 40],
  outer: [4, 30],
  feeding: [0.01, 1],
} as const satisfies Record<string, readonly [number, number]>;

/** The tuner's ranges. */
export const TUNING_RANGES = {
  planets: [0, 12],
  spacing: [0.3, 3],
  moons: [0, 8],
  comets: [0, 8],
} as const satisfies Record<string, readonly [number, number]>;

/** A copy that can be edited in place (the panel binds to it). */
export function cloneStar(star: StarData): StarData {
  const activity = star.activity ?? kindActivity(star);
  const copy: StarData = { ...star, activity: cloneActivity(activity) };
  if (star.disc) copy.disc = { ...star.disc };
  return copy;
}

/**
 * A black hole's size, light, class and colour worked out again from its
 * mass and disc (after an edit), its activity kept; other stars as they are.
 */
export function derived(star: StarData): StarData {
  if (!isBlackHole(star)) return star;
  const out = blackHoleStar(star.mass, discOf(star));
  if (star.activity) out.activity = star.activity;
  return out;
}

export function cloneActivity(a: StarActivity): StarActivity {
  const spec = (s: StormSpec): StormSpec => ({ ...s, life: [...s.life], size: [...s.size], speed: [...s.speed] });
  return { ...a, prominence: spec(a.prominence), flare: spec(a.flare) };
}

/** A random star (and maybe a companion) and a system seed from `seed`, as the galaxy makes them. */
export function generateLabStars(seed: number, options: GenerateStarOptions = {}): Omit<StarLabState, 'view'> {
  const rng = new Rng(hashSeed(seed, 'star lab'));
  const srng = rng.fork('star');
  const stars = [generateStar(srng, options.kind ?? (options.spectralClass ? 'mainSequence' : undefined), options.spectralClass)];
  // Drawn either way, so choosing doesn't change the companion.
  const drawn = srng.chance(BINARY_CHANCE);
  if (options.binary ?? drawn) stars.push(generateCompanion(srng));
  stars.sort((a, b) => b.radius - a.radius);
  return {
    name: generateName(rng.fork('name')),
    seed: hashSeed(seed, 'system'),
    stars: stars.map(cloneStar),
    young: options.young ?? false,
    tuning: {},
  };
}

/** The star as another kind (and class): that kind's typical numbers, colour and behaviour. */
export function withKind(star: StarData, kind: StarKind, spectralClass: SpectralClass = star.spectralClass): StarData {
  const cls = kind === 'mainSequence' ? (MAIN_SEQUENCE_CLASSES.includes(spectralClass) ? spectralClass : 'G') : spectralClass;
  return cloneStar(nominalStar(kind, cls));
}

/**
 * Another look for the same kind of star: its colour jittered round its
 * kind's, and how it lives (pace, cells, spots, turn, pulse, storms) scaled
 * round its kind's by up to about ×½ to ×2. Size, light and mass stay.
 */
export function rerollLook(star: StarData, roll: number): StarData {
  const rng = new Rng(hashSeed(roll, 'star look', star.kind, star.spectralClass));
  if (isBlackHole(star)) {
    // Another disc round the same hole, as the galaxy draws them.
    const disc: AccretionDisc = {
      outer: rng.range(DISC_OUTER[0], DISC_OUTER[1]),
      feeding: FEEDING[0] * (FEEDING[1] / FEEDING[0]) ** rng.next(),
      turn: rng.sign() as 1 | -1,
    };
    return cloneStar(blackHoleStar(star.mass, disc));
  }
  const base = kindActivity(star);
  const scale = (v: number, lo: number, hi: number) => v * Math.exp(rng.range(Math.log(lo), Math.log(hi)));
  const storm = (s: StormSpec): StormSpec => ({
    ...s,
    interval: scale(s.interval, 0.6, 1.6),
    chance: s.chance === 0 ? 0 : Math.min(1, scale(s.chance, 0.6, 1.5)),
    life: [s.life[0], s.life[1]].map((v) => scale(v, 0.8, 1.25)) as [number, number],
    size: [s.size[0], s.size[1]].map((v) => scale(v, 0.75, 1.4)) as [number, number],
    speed: [s.speed[0], s.speed[1]] as [number, number],
  });
  const activity: StarActivity = {
    pace: scale(base.pace, 0.6, 1.6),
    granulation: scale(base.granulation, 0.6, 1.6),
    contrast: Math.min(1, scale(base.contrast, 0.6, 1.5)),
    spots: base.spots === 0 ? (rng.chance(0.2) ? rng.range(0, 0.3) : 0) : Math.min(1, scale(base.spots, 0.4, 1.8)),
    rotationPeriod: scale(base.rotationPeriod, 0.5, 2),
    pulse: scale(base.pulse, 0.5, 2),
    pulsePeriod: scale(base.pulsePeriod, 0.6, 1.6),
    prominence: storm(base.prominence),
    flare: storm(base.flare),
  };
  return { ...star, color: jitterHsl(rng, starBaseColor(star.kind, star.spectralClass), 8, 0.08, 0.06), activity };
}

/** The galaxy entry the lab's system grows from. */
export function toStarRef(state: StarLabState): StarRef {
  const ref: StarRef = {
    id: typeof state.source?.star === 'number' ? state.source.star : 0,
    name: state.name,
    position: { x: 0, y: 0, z: 0 },
    seed: state.seed,
    stars: state.stars,
    nebula: null,
  };
  if (state.real) ref.real = state.real;
  else if (state.young) ref.young = true;
  return ref;
}

/** True if the system tuner changes this state's system (ordinary star systems only). */
export function tunable(state: Pick<StarLabState, 'real' | 'young'>): boolean {
  return !state.real && !state.young;
}

/**
 * The lab's system: generated from its stars and seed with the tuner's
 * changes. Sol is hand-made, so its star is swapped for the lab's (planets
 * and all else stay real).
 */
export function labSystem(state: StarLabState): SystemData {
  const system = tuneSystem(toStarRef(state), tunable(state) ? state.tuning : {});
  if (state.real) {
    const [real] = system.stars;
    system.stars = real ? [{ ...state.stars[0]!, orbit: real.orbit }] : [];
  }
  return system;
}

/** The lab state for a game system (null if `star` names none, or a rogue planet with no star). */
export function loadLabStars(galaxySeed: string, star: number | 'sol'): Omit<StarLabState, 'view'> | null {
  const galaxy = generateGalaxy(parseSeed(galaxySeed));
  const ref = star === 'sol' ? solRef(galaxy) : systemRef(galaxy, star);
  if (!ref || ref.stars.length === 0) return null;
  // Sol's star is hand-made: take it from its system.
  const stars = ref.real ? generateSystem(ref).stars.map(({ orbit: _orbit, ...s }) => s) : ref.stars;
  const state: Omit<StarLabState, 'view'> = {
    name: ref.name,
    seed: ref.seed,
    stars: stars.map(cloneStar),
    young: !!ref.young,
    tuning: {},
    source: { seed: galaxySeed, star: ref.real ? 'sol' : ref.id },
  };
  if (ref.real) state.real = ref.real;
  return state;
}

// --- Links ---

/** Base64url of the state's JSON (the page's #hash). */
export function encodeStarLab(state: StarLabState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number, lo: number, hi: number) => (isNum(v) ? clamp(v, lo, hi) : fallback);

/**
 * The state from `encodeStarLab`'s text, or null if it isn't one. Every star
 * is checked field by field against its kind's typical one, so a damaged or
 * older link still gives a star that draws.
 */
export function decodeStarLab(text: string): StarLabState | null {
  try {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))) as Partial<StarLabState>;
    if (!raw || !Array.isArray(raw.stars) || raw.stars.length === 0) return null;
    const stars = raw.stars.slice(0, 2).map((s) => sanitizeStar(s as Partial<StarData>));
    const state: StarLabState = {
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 60) : 'Star',
      seed: isNum(raw.seed) ? Math.round(raw.seed) >>> 0 : 1,
      stars,
      young: raw.young === true,
      tuning: sanitizeTuning(raw.tuning),
      view: { ...DEFAULT_STAR_VIEW, ...sanitizeView(raw.view) },
    };
    if (raw.real === 'sol') state.real = 'sol';
    const src = raw.source;
    if (src && typeof src.seed === 'string' && (isNum(src.star) || src.star === 'sol')) state.source = { seed: src.seed, star: src.star };
    return state;
  } catch {
    return null;
  }
}

/** `raw`'s valid fields over its kind's typical star (numbers kept in the lab's ranges). */
export function sanitizeStar(raw: Partial<StarData>): StarData {
  const kind = STAR_KINDS.includes(raw.kind as StarKind) ? (raw.kind as StarKind) : 'mainSequence';
  if (kind === 'blackHole') {
    const base = cloneStar(blackHoleStar(BLACK_HOLE_MASS[0] * 2, discOf({} as StarData)));
    const d = (raw.disc ?? {}) as Partial<AccretionDisc>;
    const disc: AccretionDisc = {
      outer: num(d.outer, discOf(base).outer, ...HOLE_RANGES.outer),
      feeding: num(d.feeding, discOf(base).feeding, ...HOLE_RANGES.feeding),
      turn: d.turn === -1 ? -1 : 1,
    };
    return { ...cloneStar(blackHoleStar(num(raw.mass, base.mass, ...HOLE_RANGES.mass), disc)), activity: base.activity! };
  }
  const cls = ['O', 'B', 'A', 'F', 'G', 'K', 'M'].includes(raw.spectralClass as string) ? (raw.spectralClass as SpectralClass) : 'G';
  const base = withKind(nominalStar(kind, cls), kind, cls);
  return {
    kind,
    spectralClass: base.spectralClass,
    color: isHex(raw.color) ? raw.color : base.color,
    radius: num(raw.radius, base.radius, ...STAR_RANGES.radius),
    luminosity: num(raw.luminosity, base.luminosity, ...STAR_RANGES.luminosity),
    mass: num(raw.mass, base.mass, ...STAR_RANGES.mass),
    activity: sanitizeActivity(raw.activity, base.activity!),
  };
}

function sanitizeActivity(raw: unknown, base: StarActivity): StarActivity {
  if (!raw || typeof raw !== 'object') return base;
  const a = raw as Partial<StarActivity>;
  return {
    pace: num(a.pace, base.pace, 0, 10),
    granulation: num(a.granulation, base.granulation, 0.5, 60),
    contrast: num(a.contrast, base.contrast, 0, 1),
    spots: num(a.spots, base.spots, 0, 1),
    rotationPeriod: num(a.rotationPeriod, base.rotationPeriod, 1, 5000),
    pulse: num(a.pulse, base.pulse, 0, 1),
    pulsePeriod: num(a.pulsePeriod, base.pulsePeriod, 0.2, 200),
    prominence: sanitizeStorm(a.prominence, base.prominence),
    flare: sanitizeStorm(a.flare, base.flare),
  };
}

function sanitizeStorm(raw: unknown, base: StormSpec): StormSpec {
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<StormSpec>;
  const pair = (v: unknown, fallback: readonly [number, number], lo: number, hi: number): [number, number] => {
    if (!Array.isArray(v) || v.length !== 2) return [...fallback];
    const a = num(v[0], fallback[0], lo, hi);
    return [a, Math.max(a, num(v[1], fallback[1], lo, hi))];
  };
  return {
    interval: num(s.interval, base.interval, 0.5, 200),
    chance: num(s.chance, base.chance, 0, 1),
    life: pair(s.life, base.life, 0.2, 200),
    size: pair(s.size, base.size, 0, 3),
    speed: pair(s.speed, base.speed, 0, 5),
    particles: Math.round(num(s.particles, base.particles, 0, 1000)),
  };
}

/** Only the tuner's known fields, in range. */
export function sanitizeTuning(raw: unknown): SystemTuning {
  if (!raw || typeof raw !== 'object') return {};
  const t = raw as Partial<SystemTuning>;
  const out: SystemTuning = {};
  if (isNum(t.planets)) out.planets = Math.round(clamp(t.planets, ...TUNING_RANGES.planets));
  if (isNum(t.spacing)) out.spacing = clamp(t.spacing, ...TUNING_RANGES.spacing);
  if (isNum(t.moons)) out.moons = Math.round(clamp(t.moons, ...TUNING_RANGES.moons));
  if (isNum(t.comets)) out.comets = Math.round(clamp(t.comets, ...TUNING_RANGES.comets));
  if (typeof t.mainBelt === 'boolean') out.mainBelt = t.mainBelt;
  if (typeof t.debris === 'boolean') out.debris = t.debris;
  return out;
}

function sanitizeView(v: unknown): Partial<StarLabView> {
  if (!v || typeof v !== 'object') return {};
  const raw = v as Partial<StarLabView>;
  const out: Partial<StarLabView> = {};
  if (raw.view === 'star' || raw.view === 'system') out.view = raw.view;
  if (isNum(raw.speed)) out.speed = clamp(raw.speed, 0, 50);
  for (const k of ['trails', 'starfield', 'wireframe'] as const) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  return out;
}

/** The star lab (stars.html next to `base`) at star `star` of the galaxy of `galaxySeed`. */
export function starLabLink(galaxySeed: string, star: number | 'sol', base: string, view?: StarLabViewKind): string {
  return new URL(`stars.html?seed=${encodeURIComponent(galaxySeed)}&star=${star}${view ? `&view=${view}` : ''}`, base).href;
}

/** How many prominences and flares of the star with `activity` and `seed` are under way at system time `time`. */
export function stormsAt(activity: StarActivity, seed: number, time: number): Record<StormKind, number> {
  const out: Record<StormKind, number> = { prominence: 0, flare: 0 };
  for (const kind of ['prominence', 'flare'] as const) {
    const [first, last] = stormSlots(activity[kind], time, time);
    for (let i = first; i <= last; i++) {
      const e = stormEvent(activity, seed, kind, i);
      if (e && stormAlive(e, time)) out[kind]++;
    }
  }
  return out;
}
