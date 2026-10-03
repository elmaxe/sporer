import { WATER_TRIPLE_POINT, type ClimateData } from '../gen/climate';
import { localTemperature, type PlantSpecies } from '../gen/plants';
import type { WeatherKind } from '../gen/weather';

/*
 * What becomes of a plant set down or dropped on a body, from where it lands
 * and the body's climate there. Pure: the cargo beam (CargoBeam.ts) shows it.
 * Sources and reference cases in docs/research/plant-fates.md.
 */

/** What it landed on. */
export type Landing = 'land' | 'sea' | 'lava' | 'clouds';

/**
 * - root: takes root where it landed, and stays (a new plant of the body).
 * - drown: floats, waterlogs and sinks (rots) in a sea.
 * - burn: catches fire (hot enough to ignite wood, with oxygen to burn in) or lands in lava.
 * - char: too hot to live, no oxygen to burn: it blackens and crumbles (pyrolysis).
 * - freeze: frozen solid, and shatters.
 * - wither: dries out and collapses: in a vacuum, too hot for it, or in the dark.
 * - dissolve: eaten away under a sulphuric-acid sky.
 * - sink: falls into a giant's clouds, never to be seen again.
 */
export type PlantFate = 'root' | 'drown' | 'burn' | 'char' | 'freeze' | 'wither' | 'dissolve' | 'sink';

/** What the fate depends on from the body (its climate; null for bodies without one: comets, asteroids, giants). */
export interface FateWorld {
  readonly climate: Pick<ClimateData, 'temperature' | 'pressure' | 'composition' | 'waterState' | 'insolation'> | null;
  readonly weather: WeatherKind | null;
}

/**
 * Wood ignites at about 250 °C at the lowest heating that ignites it at all,
 * glowing first (Babrauskas 2002, "Ignition of wood: a review of the state of
 * the art"); hotter than this, a plant burns if there's oxygen and chars
 * without it.
 */
export const IGNITION_TEMPERATURE = 523;

/**
 * How far past its temperature window a plant can still live, K: the same
 * 6 K over which the generator stops placing a species (gen/plants.ts,
 * `temperatureWeight`), so a plant lives where its own kind could grow.
 */
export const TEMPERATURE_SLACK = 6;

/** Water freezes at its triple point's temperature (273.16 K) or so: a sea colder than this is ice. */
export const FREEZING = WATER_TRIPLE_POINT.temperature;

/** The temperature (K) a plant meets at latitude `lat` (radians), as the generator works it out (null without a climate). */
export function landingTemperature(world: FateWorld, lat: number): number | null {
  return world.climate ? localTemperature(world.climate.temperature, lat) : null;
}

/**
 * What happens to a plant of `species` landing on `landing` at latitude
 * `lat` (radians) of a body with `world`'s climate.
 */
export function plantFate(landing: Landing, world: FateWorld, lat: number, species: Pick<PlantSpecies, 'minTemperature' | 'maxTemperature'>): PlantFate {
  if (landing === 'clouds') return 'sink';
  const { climate } = world;
  if (landing === 'lava') return climate && climate.composition === 'oxygenNitrogen' ? 'burn' : 'char';
  // No air worth the name: below water's triple-point pressure a plant's water boils or sublimes away.
  if (!climate || climate.composition === 'none' || climate.pressure < WATER_TRIPLE_POINT.pressure) {
    return landing === 'sea' ? 'freeze' : 'wither';
  }
  const t = localTemperature(climate.temperature, lat);
  if (t >= IGNITION_TEMPERATURE) return climate.composition === 'oxygenNitrogen' ? 'burn' : 'char';
  if (landing === 'sea') return t < FREEZING ? 'freeze' : 'drown';
  if (world.weather === 'acid') return 'dissolve';
  if (t < species.minTemperature - TEMPERATURE_SLACK) return 'freeze';
  if (t > species.maxTemperature + TEMPERATURE_SLACK) return 'wither';
  // No starlight (a rogue planet): nothing to grow on.
  if (climate.insolation <= 0) return 'wither';
  return 'root';
}

/** A few words for the hint line: what became of it. */
export function describeFate(fate: PlantFate, name: string): string {
  switch (fate) {
    case 'root':
      return `${name} took root`;
    case 'drown':
      return `${name} sank and rotted in the water`;
    case 'burn':
      return `${name} went up in flames`;
    case 'char':
      return `${name} charred to ash in the heat`;
    case 'freeze':
      return `${name} froze solid and shattered`;
    case 'wither':
      return `${name} withered away`;
    case 'dissolve':
      return `${name} dissolved under the acid sky`;
    case 'sink':
      return `${name} fell into the clouds`;
  }
}
