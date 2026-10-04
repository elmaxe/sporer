import { cloudCovered, type ClimateData } from './climate';
import { eruptionEvent, eruptionSlots, eruptionSpan, type LavaActivity } from './lavaActivity';
import { GLOBE_SIZE_FACTOR, type MoonType, type PlanetStyle, type PlanetType } from './planets';
import { Rng, hashSeed } from './rng';
import type { Vec3Tuple } from './starActivity';

/*
 * Weather: clouds, storms, rain and lightning on bodies whose climate
 * (step 12) supports it. Pure data and maths; the views are
 * world/weatherLook.ts (the clouds, in both the system view and low orbit:
 * a sheet, and on water and methane worlds puffy clusters from
 * gen/cumulus.ts) and planet/Weather.ts (rain, lightning bolts and their
 * light, low orbit only).
 *
 * Four kinds, from the climate:
 * - water: worlds with liquid water (or frozen water under breathable air):
 *   Earth-like clouds, thunderstorms with rain (or snow) and lightning, and on
 *   warm oceans tropical cyclones.
 * - acid: Venus-like worlds under a sulphuric-acid cloud deck: a streaky deck
 *   that super-rotates, acid rain that evaporates on the way down (virga),
 *   rare lightning.
 * - methane: Titan-like worlds: a few methane clouds, now and then a big
 *   storm with slow, heavy methane rain, and no lightning.
 * - dust: thin, dry air (Mars-like): clear skies, dust storms, and once in a
 *   while one that covers the whole globe.
 *
 * Lightning needs air: airless bodies have none, however volcanic. Lava
 * worlds that have air (the Venuses) get volcanic lightning in the ash clouds
 * of their big eruptions, the most lightning-rich storms there are (Hunga
 * Tonga's plume alone matched the whole Earth's flash rate).
 *
 * Storms, like the stars' storms and the lava's eruptions, sit on a seeded
 * grid of time slots, so what is going on at any moment is known without
 * replaying the past. Flashes too, on a finer grid per storm.
 *
 * Times and sizes are stylised: a thunderstorm lives a minute rather than
 * half an hour, a cyclone a few minutes rather than a week. Sources, reference
 * cases and the mapping: docs/research/weather.md.
 */

export type WeatherKind = 'water' | 'acid' | 'methane' | 'dust';
export type Precipitation = 'rain' | 'snow' | 'acid' | 'methane';
/** 'cell' a thunderstorm (or snow or methane storm), 'global' a dust storm over the whole body, 'ash' an eruption's ash cloud. */
export type StormKind = 'cell' | 'cyclone' | 'dust' | 'global' | 'ash';
/** The cloud shader's shape code per storm kind. */
export const STORM_SHAPE: Record<StormKind, number> = { cell: 0, cyclone: 1, dust: 2, global: 3, ash: 4 };

/** Most storms alive at once on one body (the cloud shader's uniform slots). */
export const MAX_STORMS = 8;

// --- Reference values (docs/research/weather.md) ---

/** MODIS cloud fraction (King et al. 2013): global 67%, over land 55%, over the oceans 72%. */
export const EARTH_CLOUD_FRACTION = { global: 0.67, land: 0.55, ocean: 0.72 } as const;
/**
 * The game draws opaque cloud over this share of what MODIS counts as cloudy
 * (its mask includes thin cirrus): deliberate, so an Earth still shows its
 * continents from orbit.
 */
export const VISIBLE_CLOUD_SHARE = 0.6;
/** Titan: clouds cover about 1% of the disc (Cassini). Drawn 6× larger so a Titan shows a few. */
export const TITAN_CLOUD_FRACTION = 0.01;
export const TITAN_CLOUD_BOOST = 6;
/** Methane: triple point 90.67 K, critical point 190.56 K (NIST): between them it can condense into cloud and rain. */
export const METHANE_RANGE = [90.67, 190.56] as const;
/** Dust storms need some air to lift dust: Mars's 6 mbar does. The same threshold as the visible atmosphere (climate.ts, atmosphereTint). */
export const DUST_MIN_PRESSURE = 0.005;
/** Snowy water worlds need a real atmosphere (a Pluto-like trace has none of this). */
export const WATER_MIN_PRESSURE = 0.1;
/** Volcanic ash clouds with lightning need air; Io's ~nbar doesn't count. Same threshold as dust. */
export const VOLCANIC_MIN_PRESSURE = DUST_MIN_PRESSURE;

/** Lightning: +12% per kelvin of warming (Romps et al. 2014), around Earth's 288.15 K. */
export const LIGHTNING_PER_KELVIN = 1.12;
export const EARTH_TEMPERATURE = 288.15;
/** Tropical cyclones form over water of at least 26.5 °C (Palmén 1948, NOAA HRD), at least 5° from the equator. */
export const CYCLONE_SST = 299.65;
export const CYCLONE_MIN_LATITUDE = (5 * Math.PI) / 180;
/** How much warmer the tropical sea is than the global mean surface (unverified, see weather.md). */
export const TROPICAL_OFFSET = 13;

/** Strokes per flash: 2.8–6.4 on average in different studies (4.6 in Florida); strokes ~61 ms apart (geometric mean). */
export const STROKES = [2, 6] as const;
export const STROKE_INTERVAL = [0.035, 0.1] as const;
/** Each stroke's glow decays with this time constant, seconds (stylised: a flash lasts a few hundred ms). */
export const STROKE_DECAY = 0.05;
/** Share of flashes that strike the ground: IC:CG ratios of 2.6–4 in the US, Spain and China. */
export const GROUND_SHARE = 0.25;
/** Flashes are decided on this grid, seconds. */
export const FLASH_SLOT = 0.1;
/** Longest a flash lasts, seconds (strokes · interval + decay). */
export const FLASH_SPAN = STROKES[1] * STROKE_INTERVAL[1] + 6 * STROKE_DECAY;

/** Stylised flash rates, flashes per second at full strength (see weather.md: Earth ~44/s over ~its thunderstorms; one Hunga Tonga plume 43.6/s). */
export const LIGHTNING_RATE = { cell: 1.5, cyclone: 0.5, ash: 6 } as const;
/**
 * Venus-like decks: Akatsuki saw one flash in 1.1·10⁸ km²·h, a few an hour
 * over the whole planet. Drawn once every ~40 s so the player can see it
 * happen at all (deliberate).
 */
export const ACID_FLASH_RATE = 1 / 40;

/** Fall speeds, m/s: water drops up to 9.2, Titan's methane drops 1.6 (Lorenz 1993), snow aggregates 0.4–1.2 (Locatelli & Hobbs 1974). */
export const FALL_SPEED = { rain: 9.2, acid: 9.2, methane: 1.6, snow: 1 } as const;
/**
 * Planet-level units per second a 9.2 m/s drop falls at (stylised; the ratios between kinds are kept). Like the
 * lava's and the geysers', lengths and speeds here grow with the globes (GLOBE_SIZE_FACTOR); no time does.
 */
export const RAIN_UNITS_PER_SECOND = 22 * GLOBE_SIZE_FACTOR;
/** Venus's acid rain falls from the cloud base (48 km) and evaporates by ~30 km: 37% of the way down. */
export const ACID_VIRGA = (48 - 30) / 48;

/** Per kind: layer height above the highest terrain (fraction of the radius, at least `min` units, at most `max` of the radius). */
const CLOUD_GAP: Record<WeatherKind, { fraction: number; min: number; max: number }> = {
  water: { fraction: 0.07, min: 6 * GLOBE_SIZE_FACTOR, max: 0.2 },
  acid: { fraction: 0.1, min: 8 * GLOBE_SIZE_FACTOR, max: 0.25 },
  methane: { fraction: 0.07, min: 6 * GLOBE_SIZE_FACTOR, max: 0.2 },
  dust: { fraction: 0.04, min: 4 * GLOBE_SIZE_FACTOR, max: 0.15 },
};

export interface StormSpec {
  kind: StormKind;
  /** Independent slot grids: at most one storm of this spec per channel at once. */
  channels: number;
  /** Seconds per slot. */
  interval: number;
  /** Chance a slot has a storm. */
  chance: number;
  /** Lifetime range, seconds (never more than the interval). */
  life: readonly [number, number];
  /** Angular radius range, radians. */
  size: readonly [number, number];
  /** |latitude| range at birth, radians. */
  latitude: readonly [number, number];
  /** Poleward drift, radians per second. */
  poleward: number;
  /** Flashes per second at full strength. */
  lightning: number;
  /** Whether it rains (or snows) under it. */
  rain: boolean;
}

export interface WeatherData {
  kind: WeatherKind;
  precipitation: Precipitation | null;
  /** Mean share of the sky with cloud, 0–1 (drawn, see VISIBLE_CLOUD_SHARE). */
  coverage: number;
  /** Opacity of the thickest cloud (the acid deck is see-through in places). */
  opacity: number;
  /** Cloud colour, and the colour of dust storms. */
  color: string;
  dust: string;
  /** Sea-level radius and the cloud layer's radius, planet-level units. */
  radius: number;
  cloudRadius: number;
  /** Zonal wind at its strongest, radians per second (positive along the spin). */
  wind: number;
  /** True: the whole layer turns together (super-rotation); false: bands of easterlies and westerlies. */
  superRotation: boolean;
  /** Seconds over which the cloud pattern renews itself. */
  change: number;
  /** Stronger the warmer (Romps et al. 2014), 1 at Earth's temperature. */
  convection: number;
  storms: StormSpec[];
  /** Flashes per second over the whole body, outside any storm (the acid deck's rare ones). */
  backgroundLightning: number;
  /** Big eruptions raise ash clouds with lightning (lava bodies with air). */
  volcanic: boolean;
  /** How fast the precipitation falls (units/s) and how far down it gets before evaporating (1 = the ground). */
  fallSpeed: number;
  reach: number;
  seed: number;
}

/** What a body needs for its weather. */
export interface WeatherBody {
  type: PlanetType | MoonType;
  seed: number;
  style: PlanetStyle;
  climate?: ClimateData | null;
  /** The atmosphere's glow colour (tints the acid deck). */
  atmosphere?: string | null;
}

/** Which weather a body has, or null for none (airless, a trace of air, or nothing to condense or lift). */
export function weatherKind(type: PlanetType | MoonType, climate: ClimateData | null | undefined): WeatherKind | null {
  if (!climate || type === 'gas' || climate.composition === 'none') return null;
  const { composition, pressure, temperature, waterState } = climate;
  if (composition === 'carbonDioxide' && cloudCovered(climate)) return 'acid';
  if (composition === 'nitrogen' && cloudCovered(climate) && temperature >= METHANE_RANGE[0] && temperature <= METHANE_RANGE[1])
    return 'methane';
  if (waterState === 'liquid') return 'water';
  if (waterState === 'ice' && composition === 'oxygenNitrogen' && pressure >= WATER_MIN_PRESSURE) return 'water';
  if ((type === 'desert' || type === 'barren') && pressure >= DUST_MIN_PRESSURE) return 'dust';
  return null;
}

/** Whether a body's big eruptions raise ash clouds with lightning: lava bodies with air. */
export function volcanicLightning(type: PlanetType | MoonType, climate: ClimateData | null | undefined): boolean {
  return type === 'lava' && !!climate && climate.composition !== 'none' && climate.pressure >= VOLCANIC_MIN_PRESSURE;
}

/** Convection strength from the mean surface temperature: 12% more lightning per kelvin (Romps et al. 2014), clamped. */
export function convection(temperature: number): number {
  return Math.min(3, Math.max(0.05, LIGHTNING_PER_KELVIN ** (temperature - EARTH_TEMPERATURE)));
}

/** Radius of the cloud layer: above the highest terrain as the planet level draws it, by a gap per kind. */
export function cloudLayerRadius(kind: WeatherKind, style: PlanetStyle, radius: number, reliefScale = 1): number {
  const top = radius * (1 + style.relief * reliefScale);
  const gap = CLOUD_GAP[kind];
  return top + Math.min(gap.max * radius, Math.max(gap.min, gap.fraction * radius));
}

const DEG = Math.PI / 180;

/**
 * A body's weather, or null if it has none. `radius` is its sea-level radius
 * in planet-level units and `reliefScale` the planet level's exaggeration of
 * the terrain (the clouds sit above its peaks). Pure and deterministic.
 */
export function weatherOf(body: WeatherBody, radius: number, reliefScale = 1): WeatherData | null {
  const climate = body.climate;
  const kind = weatherKind(body.type, climate);
  const volcanic = volcanicLightning(body.type, climate);
  if (!climate || (!kind && !volcanic)) return null;
  const k: WeatherKind = kind ?? 'dust';
  const rng = new Rng(hashSeed(body.seed, 'weather'));
  const conv = convection(climate.temperature);
  const vary = rng.range(0.75, 1.25);
  const storms: StormSpec[] = [];
  let precipitation: Precipitation | null = null;
  let coverage = 0;
  let opacity = 1;
  let color = '#f4f6fa';
  let wind = 0.003;
  let superRotation = false;
  let change = 40;
  let backgroundLightning = 0;
  let fallSpeed: number = FALL_SPEED.rain;
  let reach = 1;
  // Lifted dust: the ground's colour, paler (fine dust scatters more light than the rock it came from).
  const dust = mixHex(mixHex(body.style.low, body.style.high, 0.7, 1), '#f2e2c8', 0.4, 1.1);

  switch (kind) {
    case 'water': {
      const frozen = climate.waterState === 'ice';
      precipitation = frozen ? 'snow' : 'rain';
      fallSpeed = FALL_SPEED[precipitation];
      // Cloudier the more of the surface is sea: MODIS's land and ocean fractions, by water inventory (terran 0.4–0.7, ocean 0.8–0.95).
      const sea = clamp01((climate.water - 0.4) / 0.55);
      const earthLike = EARTH_CLOUD_FRACTION.land + (EARTH_CLOUD_FRACTION.ocean - EARTH_CLOUD_FRACTION.land) * sea;
      // A dry world (a desert's few % of water) has few clouds.
      coverage = VISIBLE_CLOUD_SHARE * earthLike * Math.min(1, climate.water / 0.4) * vary;
      if (climate.waterState === 'liquid' && climate.temperature >= 373) coverage = 1;
      const cellChance = Math.min(0.9, 0.45 * Math.sqrt(conv) * Math.min(1, climate.water / 0.2));
      storms.push({
        kind: 'cell',
        channels: 6,
        interval: 60,
        chance: cellChance,
        life: [30, 60],
        size: [0.035, 0.075],
        latitude: [0, 60 * DEG],
        poleward: 0,
        lightning: LIGHTNING_RATE.cell * conv,
        rain: true,
      });
      // Tropical cyclones: a warm enough sea (26.5 °C) and a real ocean to feed them.
      const sst = climate.temperature + TROPICAL_OFFSET;
      if (!frozen && climate.water >= 0.4 && sst >= CYCLONE_SST) {
        storms.push({
          kind: 'cyclone',
          channels: 2,
          interval: 300,
          chance: Math.min(0.9, 0.35 + (sst - CYCLONE_SST) * 0.05),
          life: [150, 300],
          size: [0.09, 0.16],
          latitude: [CYCLONE_MIN_LATITUDE + 3 * DEG, 25 * DEG],
          poleward: 0.0006,
          lightning: LIGHTNING_RATE.cyclone * conv,
          rain: true,
        });
      }
      break;
    }
    case 'acid': {
      precipitation = 'acid';
      fallSpeed = FALL_SPEED.acid;
      reach = ACID_VIRGA;
      coverage = 1;
      opacity = 0.6;
      color = body.atmosphere ? mixHex(body.atmosphere, '#fff8e0', 0.5, 1) : '#efe2b0';
      // Venus's cloud tops go round in 4 days against the ground's 243: the whole deck turns, backwards (retrograde).
      wind = -0.009;
      superRotation = true;
      change = 90;
      backgroundLightning = ACID_FLASH_RATE;
      break;
    }
    case 'methane': {
      precipitation = 'methane';
      fallSpeed = FALL_SPEED.methane;
      coverage = TITAN_CLOUD_FRACTION * TITAN_CLOUD_BOOST * vary;
      color = '#eee4d2';
      wind = 0.0015;
      change = 60;
      storms.push({
        kind: 'cell',
        channels: 3,
        interval: 150,
        chance: 0.45,
        life: [70, 150],
        size: [0.08, 0.2],
        latitude: [0, 70 * DEG],
        poleward: 0,
        // Cassini found no lightning in 72 flybys.
        lightning: 0,
        rain: true,
      });
      break;
    }
    case 'dust':
    case null: {
      if (kind === 'dust') {
        color = dust;
        change = 30;
        storms.push({
          kind: 'dust',
          channels: 4,
          interval: 90,
          chance: 0.5,
          life: [40, 90],
          size: [0.1, 0.3],
          latitude: [0, 70 * DEG],
          poleward: 0,
          // Only mm-scale sparks (Perseverance heard them): nothing to see.
          lightning: 0,
          rain: false,
        });
        // A global storm every 3–4 Mars years: here one slot in 3.5, a few minutes apart.
        storms.push({
          kind: 'global',
          channels: 1,
          interval: 420,
          chance: 1 / 3.5,
          life: [200, 400],
          size: [Math.PI, Math.PI],
          latitude: [0, 0],
          poleward: 0,
          lightning: 0,
          rain: false,
        });
      }
      break;
    }
  }

  return {
    kind: k,
    precipitation,
    coverage: clamp01(coverage),
    opacity,
    color,
    dust,
    radius,
    cloudRadius: cloudLayerRadius(k, body.style, radius, reliefScale),
    wind,
    superRotation,
    change,
    convection: conv,
    storms,
    backgroundLightning,
    volcanic,
    fallSpeed: (fallSpeed / FALL_SPEED.rain) * RAIN_UNITS_PER_SECOND,
    reach,
    seed: rng.int(0, 2 ** 31),
  };
}

// --- Winds ---

/**
 * Zonal wind at latitude `lat` (radians) relative to its strongest, −1..1,
 * positive along the spin: easterly trade winds in the tropics, westerlies
 * at mid-latitudes (the three-cell circulation, stylised), or one speed
 * everywhere for a super-rotating deck. Mirrored in the cloud shader.
 */
export function zonalWind(lat: number, superRotation: boolean): number {
  if (superRotation) return Math.cos(lat);
  return -Math.cos(3 * lat);
}

// --- Storms ---

export interface StormEvent {
  kind: StormKind;
  /** Which spec, channel and slot: the storm's identity. */
  spec: number;
  channel: number;
  slot: number;
  start: number;
  life: number;
  end: number;
  /** Birthplace (latitude, longitude, radians) and how it moves (radians per second). */
  lat: number;
  lon: number;
  drift: number;
  poleward: number;
  /** Angular radius, radians. */
  size: number;
  /** 0–1. */
  strength: number;
  /** Spin sense seen from above: +1 anticlockwise (north), −1 clockwise (south). */
  spin: number;
  lightning: number;
  rain: boolean;
  seed: number;
}

/** The storm of spec `spec` in `channel`'s slot `slot`, or null if the slot has none. */
export function stormEvent(weather: WeatherData, spec: number, channel: number, slot: number): StormEvent | null {
  const s = weather.storms[spec];
  if (!s) return null;
  const rng = new Rng(hashSeed(weather.seed, 'storm', spec, channel, slot));
  if (!rng.chance(s.chance)) return null;
  const life = rng.range(s.life[0], s.life[1]);
  // Starts late enough in its slot to end before the next one opens: one storm per channel at a time.
  const start = (slot + rng.next() * Math.max(0, 1 - life / s.interval)) * s.interval;
  let lat: number;
  if (s.kind === 'cell' && weather.kind === 'water') {
    // Most thunderstorms in the tropics (the ITCZ), some along the mid-latitude storm tracks.
    lat = rng.chance(0.7) ? 30 * DEG * rng.next() ** 1.5 : rng.range(35 * DEG, s.latitude[1]);
  } else {
    lat = rng.range(s.latitude[0], s.latitude[1]);
  }
  if (rng.chance(0.5)) lat = -lat;
  return {
    kind: s.kind,
    spec,
    channel,
    slot,
    start,
    life,
    end: start + life,
    lat,
    lon: rng.range(0, Math.PI * 2),
    drift: weather.wind * zonalWind(lat, weather.superRotation) / Math.max(0.2, Math.cos(lat)),
    poleward: s.poleward,
    size: rng.range(s.size[0], s.size[1]),
    strength: rng.range(0.6, 1),
    // Coriolis: cyclones turn anticlockwise in the north (the spin axis is +y).
    spin: lat >= 0 ? 1 : -1,
    lightning: s.lightning,
    rain: s.rain,
    seed: rng.int(0, 2 ** 31),
  };
}

/**
 * The ash cloud of a big eruption (on a body with volcanic lightning): over
 * the vent, from the eruption until it has drifted off. Its umbrella's size
 * (radians) is stylised, wide enough to read from orbit.
 */
export const ASH = { linger: 20, size: [0.07, 0.11] as const };

export function ashStorm(weather: WeatherData, lava: LavaActivity, lavaSeed: number, slot: number): StormEvent | null {
  const e = eruptionEvent(lava, lavaSeed, 'eruption', slot);
  if (!e) return null;
  const [x, y, z] = e.origin;
  const lat = Math.asin(Math.max(-1, Math.min(1, y)));
  const u = hash01(e.seed, 1, 0);
  return {
    kind: 'ash',
    spec: -1,
    channel: 0,
    slot,
    start: e.start,
    life: e.end - e.start + ASH.linger,
    end: e.end + ASH.linger,
    lat,
    lon: Math.atan2(x, z),
    drift: weather.wind * zonalWind(lat, weather.superRotation) / Math.max(0.2, Math.cos(lat)),
    poleward: 0,
    size: ASH.size[0] + (ASH.size[1] - ASH.size[0]) * u,
    strength: 1,
    spin: lat >= 0 ? 1 : -1,
    lightning: LIGHTNING_RATE.ash,
    rain: false,
    seed: e.seed,
  };
}

/** Unit direction (body frame, +y the spin axis) of the storm's centre at `time`. */
export function stormCentre(e: StormEvent, time: number, out: Vec3Tuple): Vec3Tuple {
  const age = Math.max(0, time - e.start);
  const lat = Math.max(-1.45, Math.min(1.45, e.lat + e.spin * e.poleward * age));
  const lon = e.lon + e.drift * age;
  const c = Math.cos(lat);
  out[0] = c * Math.sin(lon);
  out[1] = Math.sin(lat);
  out[2] = c * Math.cos(lon);
  return out;
}

/** How strong the storm is at `time`, 0–strength: it builds over the first fifth of its life and dies away over the last third. */
export function stormStrength(e: StormEvent, time: number): number {
  const a = (time - e.start) / e.life;
  if (a <= 0 || a >= 1) return 0;
  const rise = e.kind === 'ash' ? smoothstep(0, 0.05, a) : smoothstep(0, 0.2, a);
  return e.strength * rise * (1 - smoothstep(0.66, 1, a));
}

/**
 * Caches the storms alive (or about to start) on a body, spawning each
 * channel's next slot as its time comes; a jump of the clock (back, or far
 * ahead) rebuilds it. Bodies with volcanic lightning also get the ash clouds
 * of their big eruptions (from the lava's own slots).
 */
export class StormSchedule {
  readonly events: StormEvent[] = [];
  private readonly next: number[][];
  private nextAsh = 0;
  private last = Number.NaN;

  constructor(
    readonly weather: WeatherData,
    private readonly lava: { activity: LavaActivity; seed: number } | null = null,
    private readonly maxStep = 2,
    private readonly maxBack = 0.1,
  ) {
    this.next = weather.storms.map((s) => Array.from({ length: s.channels }, () => 0));
  }

  advance(time: number): boolean {
    const jumped = !(time >= this.last - this.maxBack && time - this.last <= this.maxStep);
    const { storms } = this.weather;
    if (jumped) {
      this.events.length = 0;
      // Each channel holds at most one storm, which ends inside its slot: start from the current slot.
      for (let s = 0; s < storms.length; s++) this.next[s]!.fill(Math.floor(time / storms[s]!.interval));
      if (this.lava) this.nextAsh = eruptionSlots(this.lava.activity, 'eruption', time - ASH.linger, time)[0];
    }
    this.last = time;
    let kept = 0;
    for (const e of this.events) if (e.end > time) this.events[kept++] = e;
    this.events.length = kept;
    for (let s = 0; s < storms.length; s++) {
      const { interval, channels } = storms[s]!;
      const next = this.next[s]!;
      for (let c = 0; c < channels; c++) {
        let slot = next[c]!;
        for (; slot * interval <= time; slot++) {
          const e = stormEvent(this.weather, s, c, slot);
          if (e && e.end > time) this.events.push(e);
        }
        next[c] = slot;
      }
    }
    if (this.lava && this.weather.volcanic) {
      const { interval } = this.lava.activity.eruption;
      let slot = this.nextAsh;
      for (; slot * interval <= time; slot++) {
        const e = ashStorm(this.weather, this.lava.activity, this.lava.seed, slot);
        if (e && e.end > time) this.events.push(e);
      }
      this.nextAsh = slot;
    }
    return jumped;
  }
}

/** Most storms a body can have at once (one per channel, plus overlapping ash clouds), before the MAX_STORMS cut. */
export function maxConcurrentStorms(weather: WeatherData, lava: LavaActivity | null = null): number {
  let n = 0;
  for (const s of weather.storms) n += s.channels;
  if (lava && weather.volcanic) n += Math.ceil((eruptionSpan(lava, 'eruption') + ASH.linger) / lava.eruption.interval) + 1;
  return n;
}

// --- Lightning ---

export interface Flash {
  /** When the first stroke is, how many strokes and how far apart. */
  start: number;
  strokes: number;
  interval: number;
  /** Unit direction (body frame) under the flash. */
  dir: Vec3Tuple;
  /** 0–1. */
  brightness: number;
  /** Strikes the ground (else stays in the cloud). */
  ground: boolean;
  /** Seeds the bolt's shape. */
  seed: number;
}

export function createFlash(): Flash {
  return { start: 0, strokes: 1, interval: 0.06, dir: [0, 1, 0], brightness: 0, ground: false, seed: 0 };
}

/** How bright `flash` is at `time`: each stroke flares and decays; 0 before and after. */
export function flashBrightness(flash: Flash, time: number): number {
  const age = time - flash.start;
  if (age < 0) return 0;
  let b = 0;
  for (let k = 0; k < flash.strokes; k++) {
    const t = age - k * flash.interval;
    if (t < 0) break;
    // Later strokes are a little weaker.
    b += Math.exp(-t / STROKE_DECAY) * (k === 0 ? 1 : 0.75);
  }
  return Math.min(1, b) * flash.brightness;
}

/** When `flash` has gone dark. */
export function flashEnd(flash: Flash): number {
  return flash.start + (flash.strokes - 1) * flash.interval + 6 * STROKE_DECAY;
}

/**
 * Writes the flashes lit at `time` into `pool` (reused objects) and returns
 * how many: each storm with lightning has a flash in each FLASH_SLOT with
 * probability rate · strength · slot, anywhere in its inner part; the body's
 * background lightning likewise anywhere on it. Allocation-free.
 */
export function collectFlashes(weather: WeatherData, storms: readonly StormEvent[], time: number, pool: Flash[]): number {
  let n = 0;
  const first = Math.floor((time - FLASH_SPAN) / FLASH_SLOT);
  const last = Math.floor(time / FLASH_SLOT);
  for (const e of storms) {
    if (e.lightning <= 0) continue;
    for (let j = first; j <= last && n < pool.length; j++) {
      const t0 = j * FLASH_SLOT;
      const p = e.lightning * stormStrength(e, t0) * FLASH_SLOT;
      if (p <= 0 || hash01(e.seed, j, 0) >= p) continue;
      const f = pool[n]!;
      fillFlash(f, e.seed, j, t0);
      if (time >= flashEnd(f)) continue;
      // Somewhere in the storm's inner part (the ash cloud's over the vent).
      stormCentre(e, f.start, f.dir);
      const reach = e.kind === 'ash' ? 0.5 : e.kind === 'cyclone' ? 0.8 : 0.6;
      offsetDirection(f.dir, hash01(e.seed, j, 5) * Math.PI * 2, e.size * reach * Math.sqrt(hash01(e.seed, j, 6)), f.dir);
      n++;
    }
  }
  if (weather.backgroundLightning > 0) {
    for (let j = first; j <= last && n < pool.length; j++) {
      if (hash01(weather.seed, j, 0) >= weather.backgroundLightning * FLASH_SLOT) continue;
      const f = pool[n]!;
      fillFlash(f, weather.seed, j, j * FLASH_SLOT);
      if (time >= flashEnd(f)) continue;
      const y = hash01(weather.seed, j, 5) * 2 - 1;
      const lon = hash01(weather.seed, j, 6) * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      f.dir[0] = r * Math.sin(lon);
      f.dir[1] = y;
      f.dir[2] = r * Math.cos(lon);
      // Deep in the deck: none reach the ground (and they're dimmer from above).
      f.ground = false;
      f.brightness *= 0.7;
      n++;
    }
  }
  return n;
}

function fillFlash(f: Flash, seed: number, j: number, t0: number): void {
  f.start = t0 + hash01(seed, j, 1) * FLASH_SLOT;
  f.strokes = STROKES[0] + Math.floor(hash01(seed, j, 2) * (STROKES[1] - STROKES[0] + 1));
  f.interval = STROKE_INTERVAL[0] + (STROKE_INTERVAL[1] - STROKE_INTERVAL[0]) * hash01(seed, j, 3);
  f.brightness = 0.55 + 0.45 * hash01(seed, j, 4);
  f.ground = hash01(seed, j, 7) < GROUND_SHARE;
  f.seed = (Math.imul(seed ^ 0x9e3779b9, 31) + j) >>> 0;
}

// --- Helpers ---

/** A hash of three integers to [0, 1), without allocating (for per-frame use). */
export function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The point `angle` radians from unit `u` along heading `heading` (in u's tangent plane), written into `out` (may be `u`). */
export function offsetDirection(u: Vec3Tuple, heading: number, angle: number, out: Vec3Tuple): Vec3Tuple {
  const [ux, uy, uz] = u;
  // Tangent basis: east (a) and north (b) at u, as tangent() in lavaActivity.ts.
  let ax: number, ay: number, az: number;
  if (Math.abs(uy) < 0.9) {
    ax = -uy * ux;
    ay = 1 - uy * uy;
    az = -uy * uz;
  } else {
    ax = 1 - ux * ux;
    ay = -ux * uy;
    az = -ux * uz;
  }
  const l = Math.hypot(ax, ay, az);
  ax /= l;
  ay /= l;
  az /= l;
  const bx = uy * az - uz * ay;
  const by = uz * ax - ux * az;
  const bz = ux * ay - uy * ax;
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  const tx = ax * ch + bx * sh;
  const ty = ay * ch + by * sh;
  const tz = az * ch + bz * sh;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[0] = ux * c + tx * s;
  out[1] = uy * c + ty * s;
  out[2] = uz * c + tz * s;
  return out;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Mixes two hex colours (t of the way from a to b) and brightens by `gain`. */
function mixHex(a: string, b: string, t: number, gain: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const x = ((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t;
    return Math.min(255, Math.round(x * gain));
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// --- Labels ---

/** HUD wording, e.g. "thunderstorms", "acid clouds", "dust storms". */
export function describeWeather(w: WeatherData): string {
  const parts: string[] = [];
  switch (w.kind) {
    case 'water': {
      const cells = w.storms.find((s) => s.kind === 'cell');
      const stormy = cells && cells.lightning >= 0.5 && w.precipitation === 'rain';
      parts.push(w.precipitation === 'snow' ? 'snowstorms' : stormy ? 'thunderstorms' : 'rain');
      if (w.storms.some((s) => s.kind === 'cyclone')) parts.push('cyclones');
      break;
    }
    case 'acid':
      parts.push('acid clouds');
      break;
    case 'methane':
      parts.push('methane rain');
      break;
    case 'dust':
      if (w.storms.length) parts.push('dust storms');
      break;
  }
  if (w.volcanic) parts.push('volcanic lightning');
  return parts.join(' · ');
}

