import { planAnimals, type AnimalPlan } from '../gen/animals';
import type { GroundRadius } from '../gen/plants';
import type { PlanetConfig } from '../world/Planet';
import { plantSetup, type PlantSetup } from './plantSetup';

/** A body's animals and the ground they walk on. */
export interface AnimalSetup {
  readonly plan: AnimalPlan;
  readonly ground: GroundRadius;
}

/**
 * The animals of a body as the planet level draws it: they live where plants
 * grow (a habitable tier with starlight, so a world terraformed into a tier
 * gains them), their species from its seed and tier, their gait from its
 * gravity (gen/animals.ts), on the same ground as the plants. Null where
 * nothing grows. Pass the body's plant setup if it's made already.
 */
export function animalSetup(config: PlanetConfig, plants: PlantSetup | null = plantSetup(config)): AnimalSetup | null {
  if (!plants || !config.climate) return null;
  const { plan: p, ground } = plants;
  const plan = planAnimals({
    seed: config.seed,
    tier: p.tier,
    temperature: p.temperature,
    gravity: config.climate.gravity,
    radius: p.radius,
    peak: p.peak,
    sea: config.style.sea !== null,
  });
  return plan ? { plan, ground } : null;
}
