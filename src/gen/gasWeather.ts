import { gasDrift, type GasLayout } from './gasGiants';
import { Rng, hashSeed } from './rng';
import type { Vec3Tuple } from './starActivity';
import { FLASH_SLOT, FLASH_SPAN, fillFlash, flashEnd, hash01, offsetDirection, type Flash } from './weather';

/*
 * Weather on gas and ice giants: the storms that come and go in their cloud
 * tops, and lightning. The long-lived ovals (a great red spot, white ovals,
 * Neptune's dark spot) are part of the layout (gen/gasGiants.ts); these are
 * the passing ones:
 * - plume: a convective storm bursting up in a belt, a bright white head that
 *   the jets shear into a turbulent trail along its band, flashing with
 *   lightning (Jupiter's belt outbreaks, Saturn's "Storm Alley" storms).
 * - great: a Saturn-like giant's great white storm, about once a year of its
 *   own: a head that grows and leaves a trail all the way round the planet,
 *   with lightning many times the plumes'.
 * - outburst: an ice giant's bright methane-ice cloud flaring up.
 * - spot: an ice giant's dark spot that forms, drifts towards the equator and
 *   dies within a few years (Neptune's).
 *
 * Like the solid bodies' weather (gen/weather.ts), storms sit on a seeded slot
 * grid per channel and flashes on a finer grid per storm, so any moment can be
 * shown without replaying the past. The view is world/gasLook.ts (the clouds
 * per pixel, the same in the system view, low orbit and the planet map).
 * Sources, reference cases and the mapping: docs/research/gas-weather.md.
 */

export type GasEventKind = 'plume' | 'great' | 'outburst' | 'spot';
/** The cloud shader's shape code per kind. */
export const GAS_EVENT_SHAPE: Record<GasEventKind, number> = { plume: 0, great: 1, outburst: 2, spot: 3 };
/** Most passing storms on one giant at once (the shader's slots): the channels of its specs together never exceed it. */
export const MAX_GAS_EVENTS = 6;

const DEG = Math.PI / 180;

export interface GasStormSpec {
  kind: GasEventKind;
  /** Independent slot grids: at most one storm of this spec per channel at once. */
  channels: number;
  /** Seconds per slot. */
  interval: number;
  /** Chance a slot has a storm. */
  chance: number;
  /** Lifetime range, seconds (never more than the interval). */
  life: readonly [number, number];
  /** The head's half-length east-west, radians. */
  size: readonly [number, number];
  /** East-west length over north-south. */
  aspect: number;
  /** |latitude| range at birth, radians (plumes are born in a belt inside it). */
  latitude: readonly [number, number];
  /** How far its trail reaches behind the head at its longest, radians of longitude (2π: all the way round). */
  tail: number;
  /** The share of its life by which the trail is that long. */
  tailBy: number;
  /** The share of its life it takes to burst up to full strength. */
  rise: number;
  /** Towards the equator, radians per second (dark spots). */
  equatorward: number;
  /** Flashes per second at full strength. */
  lightning: number;
}

/** A giant's passing weather. */
export interface GasWeather {
  ice: boolean;
  specs: GasStormSpec[];
  /** Dark belts between the polar limits, where plumes are born: [south, north] latitudes, radians. */
  belts: readonly (readonly [number, number])[];
  seed: number;
}

/** A giant's passing weather from its layout (its own stream of the planet's seed). */
export function gasWeatherOf(layout: GasLayout, seed: number): GasWeather {
  const rng = new Rng(hashSeed(seed, 'gasWeather'));
  const specs: GasStormSpec[] = [];
  const vary = rng.range(0.8, 1.2);
  if (!layout.ice) {
    specs.push({ ...PLUME, latitude: [PLUME.latitude[0], Math.min(layout.polar, PLUME.latitude[1])], lightning: PLUME.lightning * vary });
    // Saturn-like giants: a great white storm now and then.
    if (layout.saturn >= 0.5) specs.push({ ...GREAT, lightning: GREAT.lightning * vary });
  } else {
    specs.push({ ...OUTBURST }, { ...SPOT });
  }
  const belts: [number, number][] = [];
  for (const b of layout.bands) {
    if (b.zone) continue;
    const south = Math.max(b.south, -layout.polar);
    const north = Math.min(b.north, layout.polar);
    if (north - south > 1 * DEG) belts.push([south, north]);
  }
  return { ice: layout.ice, specs, belts, seed: rng.int(0, 2 ** 31) };
}

// --- Reference values (docs/research/gas-weather.md) ---

/** Jupiter's radius (km), for sizes as angles. */
const JUPITER_KM = 71_492;
const SATURN_KM = 60_268;
const URANUS_KM = 25_559;
const NEPTUNE_KM = 24_764;

/**
 * Stylised flash rates, flashes per second at full strength. Saturn's great
 * storm of 2010 flashed "about an order of magnitude" more than earlier storms,
 * peaking past 10 per second (Fischer et al. 2011): great = 10 × plume (the
 * shader's 8 slots hold that). The ice giants' are rare (Voyager 2: 16
 * whistlers in ~20 min at Neptune), drawn once every ~40 s per storm so they
 * are seen at all, like the Venus decks' (deliberate).
 */
export const GAS_LIGHTNING = { plume: 0.8, great: 8, ice: 1 / 40 } as const;

/**
 * A convective plume in a belt (Jupiter's moist convection): lightning storms
 * under 1500 km to Galileo's 4000 km long storm, living "a few days" (one
 * plume of the 2010 SEB revival only 3): a 3000–6500 km head, about 1.5× the
 * real ones so it reads from the system view. Its wake trails it along the
 * band: 2016's plumes ran at 155–175 m/s through a wake moving at
 * 100–125 m/s, ~50 m/s apart, so over 3–7 days the wake reaches
 * 13 000–30 000 km behind: 11–26° of longitude at 24°N. Jupiter has
 * "typically a few storms at the same time" (Fischer et al.): four channels,
 * busy two thirds of the time, keep ~2.5 going. Times compressed: a few days
 * → 1–2 minutes.
 */
const PLUME: GasStormSpec = {
  kind: 'plume',
  channels: 4,
  interval: 120,
  chance: 0.85,
  life: [60, 120],
  size: [1500 / JUPITER_KM, 3250 / JUPITER_KM],
  aspect: 1.3,
  // Jupiter's lightning storms sit in its cyclonic belts, from 13°S to past 50°N (Cassini, Juno).
  latitude: [5 * DEG, 65 * DEG],
  tail: 26 * DEG,
  tailBy: 1,
  rise: 0.1,
  equatorward: 0,
  lightning: GAS_LIGHTNING.plume,
};

/**
 * A great white storm (Saturn's of 2010–11): its head grew to 10 000–20 000 km
 * in about ten days and measured 9200 × 34 000 km (a 17 000 km half-length,
 * aspect 3.7); its trail went all the way round in ~55 of its 201 days.
 * Once per Saturn year (29.5 years), at 35°N in 2010 and near the equator in
 * 1933 and 1990. Drawn far more often (deliberate: a quarter of the slots)
 * and 450–800 s long instead of seven months.
 */
const GREAT: GasStormSpec = {
  kind: 'great',
  channels: 1,
  interval: 900,
  chance: 0.25,
  life: [450, 800],
  size: [10_000 / SATURN_KM, 17_000 / SATURN_KM],
  aspect: 3.7,
  latitude: [0, 40 * DEG],
  tail: 2 * Math.PI,
  tailBy: 55 / 201,
  rise: 10 / 201,
  equatorward: 0,
  lightning: GAS_LIGHTNING.great,
};

/**
 * An ice giant's bright outburst: Uranus's spots of 2000–4000 km up to its
 * 2014 storm of ~25° of longitude at 15°N (10 000–17 000 km by 4300 km), whose
 * trail stretched 60° back in about 10 days; Neptune's 2017 storm (8500 km)
 * lasted 7 months. Months → 1–2.5 minutes.
 */
const OUTBURST: GasStormSpec = {
  kind: 'outburst',
  channels: 3,
  interval: 150,
  chance: 0.5,
  life: [60, 150],
  size: [1000 / URANUS_KM, 5000 / URANUS_KM],
  aspect: 3,
  latitude: [5 * DEG, 50 * DEG],
  tail: 60 * DEG,
  tailBy: 0.4,
  rise: 0.1,
  equatorward: 0,
  lightning: GAS_LIGHTNING.ice,
};

/**
 * A dark spot like Neptune's: 11 000 × 5000 km at 23°N (2018), living one to
 * six years, one every four to six; they drift ~2° a year (2015's poleward,
 * 2018's and Voyager's equatorward) and fade away. Years → 5–10 minutes,
 * ~6° of drift towards the equator over a life.
 */
const SPOT: GasStormSpec = {
  kind: 'spot',
  channels: 1,
  interval: 600,
  chance: 0.5,
  life: [300, 600],
  size: [3500 / NEPTUNE_KM, 5500 / NEPTUNE_KM],
  aspect: 2.2,
  latitude: [15 * DEG, 40 * DEG],
  tail: 0,
  tailBy: 1,
  rise: 0.1,
  equatorward: (6 * DEG) / 450,
  lightning: 0,
};

export interface GasStormEvent {
  kind: GasEventKind;
  /** Which spec, channel and slot: the storm's identity. */
  spec: number;
  channel: number;
  slot: number;
  start: number;
  life: number;
  end: number;
  /** Birthplace (latitude, longitude, radians). */
  lat: number;
  lon: number;
  /** The wind it rides, as a fraction of the spin (gasDrift at its latitude). */
  drift: number;
  equatorward: number;
  /** The head's half-length, radians, and its east-west stretch. */
  size: number;
  aspect: number;
  /** The trail at its longest (radians of longitude, signed: + it reaches east of the head) and by when. */
  tail: number;
  tailBy: number;
  rise: number;
  /** Which side of the head's latitude the trail runs (radians: the faster jet's side). */
  tailShift: number;
  /** 0–1. */
  strength: number;
  lightning: number;
  seed: number;
}

/** The storm of spec `spec` in `channel`'s slot `slot`, or null if the slot has none. */
export function gasStormEvent(weather: GasWeather, layout: GasLayout, spec: number, channel: number, slot: number): GasStormEvent | null {
  const s = weather.specs[spec];
  if (!s) return null;
  const rng = new Rng(hashSeed(weather.seed, 'gasStorm', spec, channel, slot));
  if (!rng.chance(s.chance)) return null;
  const life = rng.range(s.life[0], s.life[1]);
  // Starts late enough in its slot to end before the next one opens: one storm per channel at a time.
  const start = (slot + slotPhase(s, channel) + rng.next() * Math.max(0, 1 - life / s.interval)) * s.interval;
  const size = rng.range(s.size[0], s.size[1]);
  let lat = rng.sign() * rng.range(s.latitude[0], s.latitude[1]);
  if (s.kind === 'plume' && weather.belts.length) {
    // In a belt, by its width.
    const total = weather.belts.reduce((a, [south, north]) => a + north - south, 0);
    let u = rng.next() * total;
    for (const [south, north] of weather.belts) {
      const w = north - south;
      if (u < w) {
        lat = south + w * (0.15 + 0.7 * rng.next());
        break;
      }
      u -= w;
    }
  }
  // The trail runs downstream along the faster-moving side of its latitude: the jet next to the head.
  const reach = Math.max(size / s.aspect, 1.5 * DEG);
  const here = gasDrift(layout, lat);
  const north = gasDrift(layout, lat + reach) - here;
  const south = gasDrift(layout, lat - reach) - here;
  const side = Math.abs(north) >= Math.abs(south) ? 1 : -1;
  const shear = side > 0 ? north : south;
  return {
    kind: s.kind,
    spec,
    channel,
    slot,
    start,
    life,
    end: start + life,
    lat,
    lon: rng.range(-Math.PI, Math.PI),
    drift: here,
    equatorward: s.equatorward,
    size,
    aspect: s.aspect,
    tail: s.tail * (s.tail >= 2 * Math.PI ? 1 : rng.range(0.4, 1)) * (shear >= 0 ? 1 : -1),
    tailBy: s.tailBy,
    rise: s.rise,
    tailShift: side * reach * 0.6,
    strength: rng.range(0.7, 1),
    lightning: s.lightning,
    seed: rng.int(0, 2 ** 31),
  };
}

/**
 * Where a channel's slots begin, as a share of the interval: the channels are
 * staggered, so their quiet spells between storms don't all fall together.
 */
export function slotPhase(spec: GasStormSpec, channel: number): number {
  return channel / spec.channels;
}

/** Latitude of the storm's head at `time` (dark spots drift towards the equator). */
function headLatitude(e: GasStormEvent, time: number): number {
  const age = Math.max(0, time - e.start);
  if (e.equatorward <= 0) return e.lat;
  const moved = Math.min(Math.abs(e.lat), e.equatorward * age);
  return e.lat - Math.sign(e.lat) * moved;
}

/**
 * Unit direction (body frame, +y the spin axis) of the storm's head at
 * `time`, carried by its latitude's wind: `rate` is the spin times the view's
 * pace (radians per second per unit of drift), as the cloud shader moves the bands.
 */
export function gasStormCentre(e: GasStormEvent, time: number, rate: number, out: Vec3Tuple): Vec3Tuple {
  const age = Math.max(0, time - e.start);
  const lat = headLatitude(e, time);
  const lon = e.lon + e.drift * rate * age;
  const c = Math.cos(lat);
  out[0] = c * Math.sin(lon);
  out[1] = Math.sin(lat);
  out[2] = c * Math.cos(lon);
  return out;
}

/** How strong the storm is at `time`, 0–strength: it bursts up (over `rise` of its life) and dies away over the last third. */
export function gasStormStrength(e: GasStormEvent, time: number): number {
  const a = (time - e.start) / e.life;
  if (a <= 0 || a >= 1) return 0;
  return e.strength * smoothstep(0, e.rise, a) * (1 - smoothstep(0.66, 1, a));
}

/** How far its trail reaches behind the head at `time` (radians of longitude, signed like `tail`). */
export function gasStormTail(e: GasStormEvent, time: number): number {
  const a = Math.max(0, Math.min(1, (time - e.start) / (e.life * e.tailBy)));
  return e.tail * a;
}

/**
 * Caches the storms alive on a giant, spawning each channel's next slot as
 * its time comes; a jump of the clock (back, or far ahead) rebuilds it.
 */
export class GasStormSchedule {
  readonly events: GasStormEvent[] = [];
  private readonly next: number[][];
  private last = Number.NaN;

  constructor(
    readonly weather: GasWeather,
    readonly layout: GasLayout,
    private readonly maxStep = 2,
    private readonly maxBack = 0.1,
  ) {
    this.next = weather.specs.map((s) => Array.from({ length: s.channels }, () => 0));
  }

  advance(time: number): boolean {
    const jumped = !(time >= this.last - this.maxBack && time - this.last <= this.maxStep);
    const { specs } = this.weather;
    if (jumped) {
      this.events.length = 0;
      for (let s = 0; s < specs.length; s++) {
        const spec = specs[s]!;
        for (let c = 0; c < spec.channels; c++) this.next[s]![c] = Math.floor(time / spec.interval - slotPhase(spec, c));
      }
    }
    this.last = time;
    let kept = 0;
    for (const e of this.events) if (e.end > time) this.events[kept++] = e;
    this.events.length = kept;
    for (let s = 0; s < specs.length; s++) {
      const spec = specs[s]!;
      const next = this.next[s]!;
      for (let c = 0; c < spec.channels; c++) {
        const phase = slotPhase(spec, c);
        let slot = next[c]!;
        for (; (slot + phase) * spec.interval <= time; slot++) {
          const e = gasStormEvent(this.weather, this.layout, s, c, slot);
          if (e && e.end > time) this.events.push(e);
        }
        next[c] = slot;
      }
    }
    return jumped;
  }
}

/**
 * Writes the flashes lit at `time` into `pool` (reused objects) and returns
 * how many: each storm with lightning has a flash in each FLASH_SLOT with
 * probability rate · strength · slot, somewhere in its head. Allocation-free.
 */
export function collectGasFlashes(storms: readonly GasStormEvent[], time: number, rate: number, pool: Flash[]): number {
  let n = 0;
  const first = Math.floor((time - FLASH_SPAN) / FLASH_SLOT);
  const last = Math.floor(time / FLASH_SLOT);
  for (const e of storms) {
    if (e.lightning <= 0) continue;
    for (let j = first; j <= last && n < pool.length; j++) {
      const t0 = j * FLASH_SLOT;
      const p = e.lightning * gasStormStrength(e, t0) * FLASH_SLOT;
      if (p <= 0 || hash01(e.seed, j, 0) >= p) continue;
      const f = pool[n]!;
      fillFlash(f, e.seed, j, t0);
      if (time >= flashEnd(f)) continue;
      // Deep under the cloud tops: none is seen to strike anything.
      f.ground = false;
      gasStormCentre(e, f.start, rate, f.dir);
      offsetDirection(f.dir, hash01(e.seed, j, 5) * Math.PI * 2, (e.size / e.aspect) * 0.8 * Math.sqrt(hash01(e.seed, j, 6)), f.dir);
      n++;
    }
  }
  return n;
}

/** HUD wording, e.g. "convective storms · lightning", "great white storms". */
export function describeGasWeather(w: GasWeather): string {
  const parts: string[] = [];
  for (const s of w.specs) {
    if (s.kind === 'plume') parts.push('convective storms');
    if (s.kind === 'great') parts.push('great white storms');
    if (s.kind === 'outburst') parts.push('methane storms');
    if (s.kind === 'spot') parts.push('dark spots');
  }
  if (w.specs.some((s) => s.lightning > 0)) parts.push('lightning');
  return parts.join(' · ');
}

/** What is going on now that the HUD names: a great white storm under way ('' when nothing). */
export function describeGasStorms(shown: readonly GasStormEvent[]): string {
  return shown.some((e) => e.kind === 'great') ? 'a great white storm under way' : '';
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
