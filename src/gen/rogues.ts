import {
  SURFACE_ALBEDO,
  WATER,
  climateSetting,
  climateStateOf,
  evaluateClimate,
  type ClimateBody,
  type ClimateData,
} from './climate';
import type { StarRef } from './galaxy';
import { generateName } from './names';
import { nebulaAt, type NebulaData } from './nebulas';
import { logRange, type SizeClass } from './planets';
import { hashSeed, Rng } from './rng';

/*
 * Rogue planets (roadmap step 28): planets that drift between the stars
 * with no sun. Each is a `StarRef` with no stars, so the galaxy map, travel,
 * the URL's `?star=` and the system level treat it like a star system: a
 * "system" of one body and its moons (see generateRogueSystem in system.ts).
 *
 * With no starlight a rogue is lit only from inside: its surface sits at the
 * temperature its internal heat alone holds it at (T⁴ = F / σ, ~35 K for an
 * Earth), where every gas but hydrogen and helium freezes out. So a rogue is
 * airless, or wrapped in a thick primordial hydrogen envelope, whose
 * pressure-induced infrared absorption can keep a sea liquid under it
 * (Stevenson 1999). Sources and numbers: docs/research/rogue-planets.md.
 */

/**
 * Rogues per star on the map: "a handful" in a 4000-star galaxy, so each is a
 * find. Deliberately few: microlensing counts ~21 per star (Sumi et al. 2023).
 */
export const ROGUES_PER_STAR = 8 / 4000;
/** No rogue is nearer a star (or another rogue) than this, galaxy units: its dot and marker ring stand clear (neighbours are ~25 apart). */
export const ROGUE_CLEARANCE = 8;
/** Tries to find a clear spot before taking the last one drawn. */
const PLACEMENT_TRIES = 30;

/**
 * Size classes of rogues. Microlensing finds ~87% of them Earth-class, 8.5%
 * super-Earths and a few percent giants (above 0.33 M⊕; smaller ones are
 * unmeasured). For a handful the mix leans to variety, keeping the order.
 * Deliberately left out: giants (with no surface or climate here, a rogue one
 * would be a featureless dark ball) and dwarfs (unmeasured, and dull to visit).
 */
export const ROGUE_SIZE_WEIGHTS: readonly (readonly [SizeClass, number])[] = [
  ['small', 1.5],
  ['earth', 5],
  ['superEarth', 3.5],
];

/** Draft surface types: frozen water worlds and bare rock, and now and then a young world still molten inside. */
export const ROGUE_TYPE_WEIGHTS: readonly (readonly ['ice' | 'barren' | 'lava', number])[] = [
  ['ice', 5],
  ['barren', 3],
  ['lava', 1.5],
];

/**
 * How many times today's Earth-like heat flow (per unit gravity, see
 * climateSetting) a rogue has: young ones are warmer inside, up to Earth's
 * own 3 Gyr ago (twice today's; Abbot & Switzer 2011). An airless rogue sits
 * at 28–47 K, as (F / σ)^¼ gives for Earth's 0.092 W/m² at 0.4–3 g.
 */
export const ROGUE_HEAT = [1, 2] as const;

/**
 * Chance that an Earth-sized or bigger rogue kept a primordial hydrogen
 * envelope (gameplay), and its surface pressure range in bar, inside
 * Stevenson's 10²–10⁴ and the fitted greenhouse's range: ~290–400 bar keeps
 * water liquid at 1 g, so the low end freezes over and the high end hides a
 * warm sea (rogue-planets.md).
 */
export const ROGUE_HYDROGEN = { chance: 0.5, pressure: [100, 600] as const };

/**
 * How many moons a rogue keeps through its ejection (weights for 0, 1, 2):
 * a quarter have one, stylised up from the real 1–2% of rocky rogues
 * (most ejected moons are lost; an ejected Jupiter keeps about half).
 */
export const ROGUE_MOON_WEIGHTS: readonly (readonly [number, number])[] = [
  [0, 15],
  [1, 4],
  [2, 1],
];

/** Where to put a rogue in the galaxy: the generator's own arm placement (see gen/galaxy.ts). */
export type GalaxyPlacement = (rng: Rng) => { x: number; y: number; z: number };

/**
 * The galaxy's rogue planets, from their own stream (`hashSeed(seed,
 * 'rogues')`) so no star changes. Ids follow on from the stars' (a rogue's id
 * is `stars.length + i`), so `?star=<id>` reaches them too.
 */
export function generateRogues(
  seed: number,
  stars: readonly StarRef[],
  nebulas: readonly NebulaData[],
  place: GalaxyPlacement,
): StarRef[] {
  const rng = new Rng(hashSeed(seed, 'rogues'));
  const count = Math.max(1, Math.round(stars.length * ROGUES_PER_STAR));
  const rogues: StarRef[] = [];
  for (let i = 0; i < count; i++) {
    const rrng = rng.fork('rogue', i);
    let position = place(rrng);
    for (let t = 1; t < PLACEMENT_TRIES && !clear(position, stars, rogues); t++) position = place(rrng);
    rogues.push({
      id: stars.length + i,
      name: generateName(rrng.fork('name')),
      position,
      seed: hashSeed(seed, 'rogue', i),
      stars: [],
      nebula: nebulaAt(nebulas, position)?.nebula ?? null,
    });
  }
  return rogues;
}

/** True for a rogue planet's entry: a "system" with no star. */
export function isRogue(ref: Pick<StarRef, 'stars'>): boolean {
  return ref.stars.length === 0;
}

function clear(p: StarRef['position'], ...lists: (readonly StarRef[])[]): boolean {
  const min = ROGUE_CLEARANCE * ROGUE_CLEARANCE;
  for (const list of lists) {
    for (const s of list) {
      const dx = s.position.x - p.x;
      const dy = s.position.y - p.y;
      const dz = s.position.z - p.z;
      if (dx * dx + dy * dy + dz * dz < min) return false;
    }
  }
  return true;
}

/**
 * A rogue body's climate: no starlight, heat from inside only (scaled by
 * `heat`, see ROGUE_HEAT), and either no air or `hydrogen` bar of hydrogen.
 * Pure for a given rng (use its own stream).
 */
export function rogueClimate(rng: Rng, body: Omit<ClimateBody, 'insolation'>, heat: number, hydrogen: number): ClimateData {
  const setting = climateSetting({ ...body, insolation: 0 }, rng);
  // Lava bodies already carry an Io-like flow (climateSetting); everything else is radiogenic, scaled for its age.
  if (body.type !== 'lava') setting.heatFlow *= heat;
  const [a0, a1] = SURFACE_ALBEDO[body.type];
  const [w0, w1] = WATER[body.type];
  const surfaceAlbedo = rng.range(a0, a1);
  const water = rng.range(w0, w1);
  return evaluateClimate(
    setting,
    climateStateOf(
      { pressure: hydrogen, composition: hydrogen > 0 ? 'hydrogen' : 'none', greenhouse: 1, water, surfaceAlbedo },
      setting.gravity,
    ),
  );
}

/** A hydrogen envelope's pressure for a rogue of this size, or 0 for none. Draws from `rng` either way. */
export function rogueHydrogen(rng: Rng, size: SizeClass): number {
  const keeps = rng.chance(ROGUE_HYDROGEN.chance);
  const pressure = logRange(rng, ROGUE_HYDROGEN.pressure[0], ROGUE_HYDROGEN.pressure[1]);
  return keeps && (size === 'earth' || size === 'superEarth') ? pressure : 0;
}

/** Tooltip and HUD wording from the planet's own label, e.g. "Rogue planet · ice world · Earth-sized". */
export function describeRogue(planet: string): string {
  return `Rogue planet · ${planet.charAt(0).toLowerCase()}${planet.slice(1)}`;
}
