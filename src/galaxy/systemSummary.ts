import { HABITABILITY, type ClimateData, type Habitability } from '../gen/climate';
import { MOON_RADIUS, type SizeClass } from '../gen/planets';
import type { SystemData } from '../gen/system';

/*
 * What the galaxy map's star tooltip says about a system's bodies: one row per
 * planet (its tier, name and a disc whose outline tells warmth and air) with
 * its moons as small discs on the same row. Pure data, no DOM.
 */

/** The outline's colour: too hot (red), habitable (green) or too cold (blue). */
export type Warmth = 'hot' | 'habitable' | 'cold';
/** How much air the outline shows, from describeAtmosphere's bands. */
export type Air = 'none' | 'thin' | 'normal' | 'thick';

export interface BodyMark {
  warmth: Warmth;
  air: Air;
}

export interface MoonMark extends BodyMark {
  /** One of the rare big moons (MOON_RADIUS.bigMin and up): drawn a size larger. */
  big: boolean;
}

export interface PlanetRow extends BodyMark {
  name: string;
  /** Spore-style habitability tier; 0 for gas giants, which have no surface. */
  tier: Habitability;
  /** Sets the disc's size; the giants are drawn banded. */
  size: SizeClass;
  rings: boolean;
  moons: MoonMark[];
}

export interface SystemSummary {
  planets: PlanetRow[];
  moonCount: number;
  /** Asteroid belts, a giant's two Trojan swarms counting as one (as on the system map). */
  beltCount?: number;
}

/**
 * Splits the uninhabitable bodies into hot and cold: the middle of the
 * survivable range (−20 to 60 °C), so a body just outside it on either side
 * falls on that side.
 */
export const WARMTH_SPLIT = (HABITABILITY.survivable.min + HABITABILITY.survivable.max) / 2;
/**
 * An Earth analogue at the habitable radius, K (see docs/research/climate.md).
 * A gas giant's temperature scales from it as insolation^¼ (Stefan–Boltzmann).
 */
const EARTH_ANALOGUE_TEMPERATURE = 288.15;

export function warmthOf(tier: Habitability, temperature: number): Warmth {
  if (tier >= 1) return 'habitable';
  return temperature > WARMTH_SPLIT ? 'hot' : 'cold';
}

/** Bands as in describeAtmosphere: a trace (under 1 mbar) counts as none. */
export function airOf(c: Pick<ClimateData, 'composition' | 'pressure'>): Air {
  if (c.composition === 'none' || c.pressure < 0.001) return 'none';
  if (c.pressure < 0.3) return 'thin';
  if (c.pressure < 3) return 'normal';
  return 'thick';
}

function markOf(c: ClimateData): BodyMark {
  return { warmth: warmthOf(c.habitability, c.temperature), air: airOf(c) };
}

/** A body's climate now (a terraformed one's), from its generated data. */
export type ClimateOf = (body: { name: string; seed: number; climate: ClimateData }) => ClimateData;

/** The system's bodies as the galaxy map's tooltip lists them; `climateOf` gives terraformed bodies' climates now. */
export function summarizeSystem(system: SystemData, climateOf: ClimateOf = (b) => b.climate): SystemSummary {
  let moonCount = 0;
  const planets = system.planets.map((p): PlanetRow => {
    moonCount += p.moons.length;
    const moons = p.moons.map((m): MoonMark => ({ ...markOf(climateOf(m)), big: m.radius >= MOON_RADIUS.bigMin }));
    const row = { name: p.name, size: p.size, rings: p.rings !== null, moons };
    if (p.climate) {
      const c = climateOf({ name: p.name, seed: p.seed, climate: p.climate });
      return { ...row, tier: c.habitability, ...markOf(c) };
    }
    // Gas giants: no climate; the same starlight as generateSystem gives them.
    const insolation = (system.habitableRadius / p.orbit.radius) ** 2;
    const temperature = EARTH_ANALOGUE_TEMPERATURE * insolation ** 0.25;
    return { ...row, tier: 0, warmth: warmthOf(0, temperature), air: 'thick' };
  });
  const trojanHosts = new Set(system.belts.flatMap((b) => (b.trojan ? [b.trojan.planet] : [])));
  const beltCount = system.belts.filter((b) => !b.trojan).length + trojanHosts.size;
  return { planets, moonCount, beltCount };
}

/** e.g. "4 planets · 7 moons · 1 belt", "1 planet", "No planets". */
export function describeBodyCount(summary: SystemSummary): string {
  const n = summary.planets.length;
  if (n === 0) return 'No planets';
  const parts = [`${n} planet${n === 1 ? '' : 's'}`];
  const m = summary.moonCount;
  if (m > 0) parts.push(`${m} moon${m === 1 ? '' : 's'}`);
  const b = summary.beltCount ?? 0;
  if (b > 0) parts.push(`${b} belt${b === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
