import type { AnimalSpecies } from '../gen/animals';
import { plantFate, type FateWorld, type Landing, type PlantFate } from './plantFate';

/*
 * What becomes of an animal set down or dropped on a body. Pure: the cargo
 * beam (CargoBeam.ts) shows it. An animal meets the same hazards a plant
 * does where it lands (plantFate.ts: clouds, lava, no air, heat, the sea, an
 * acid sky, the cold or heat outside its own species' temperature window,
 * which the generator keeps it to as it keeps plants to theirs), and it
 * needs food: animals live only where plants grow (gen/animals.ts), so on a
 * body where none do it finds nothing to eat. Where it can live, it roams.
 */

/** A plant's fates, plus starving; `root` is an animal that lives and roams where it landed. */
export type Fate = PlantFate | 'starve';

/** What happens to an animal of `species` landing on `landing` at latitude `lat` (radians); `food`: plants grow on the body. */
export function animalFate(landing: Landing, world: FateWorld, lat: number, species: Pick<AnimalSpecies, 'minTemperature' | 'maxTemperature'>, food: boolean): Fate {
  const fate = plantFate(landing, world, lat, species);
  return fate === 'root' && !food ? 'starve' : fate;
}

/** A few words for the hint line: what became of the animal. */
export function describeAnimalFate(fate: Fate, name: string): string {
  switch (fate) {
    case 'root':
      return `${name} set off to roam its new home`;
    case 'drown':
      return `${name} drowned`;
    case 'burn':
      return `${name} went up in flames`;
    case 'char':
      return `${name} was burnt to ash in the heat`;
    case 'freeze':
      return `${name} froze solid and shattered`;
    case 'wither':
      return `${name} couldn't live here and perished`;
    case 'dissolve':
      return `${name} dissolved under the acid sky`;
    case 'sink':
      return `${name} fell into the clouds`;
    case 'starve':
      return `${name} found nothing to eat here and died`;
  }
}
