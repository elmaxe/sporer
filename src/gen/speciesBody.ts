import type { AnimalSpecies } from './animals';
import { growCreature, speciesDesign, type CreatureDesign, type GrownCreature } from './creature';
import { creatureRig, type CreatureRig } from './creatureRig';

/*
 * A planet species' body: one of the creature editor's creatures
 * (gen/creature.ts `speciesDesign`), grown at rest, and the rig its walk is
 * played from (gen/creatureRig.ts). The one place a species gets its body:
 * the herds' gaits and abundance, the meshes (surface/animalLook.ts), the
 * hold and the lab all read it. Pure data, no THREE.
 */

export interface SpeciesBody {
  readonly design: CreatureDesign;
  readonly grown: GrownCreature;
  readonly rig: CreatureRig;
}

/** Grown once per species object. */
const bodies = new WeakMap<object, SpeciesBody>();

export function speciesBody(s: Pick<AnimalSpecies, 'form' | 'length'> & Partial<Pick<AnimalSpecies, 'name' | 'diet'>>): SpeciesBody {
  let b = bodies.get(s);
  if (!b) {
    const design = speciesDesign(s.form, s.length, s.name, s.diet);
    const grown = growCreature(design);
    b = { design, grown, rig: creatureRig(grown) };
    bodies.set(s, b);
  }
  return b;
}

/** Drops a species' body (after editing the species in place, as the animal lab does). */
export function forgetSpeciesBody(s: object): void {
  bodies.delete(s);
}
