import { generateAnimalForm } from '../gen/animalForm';
import { defaultCreature, designFromAnimal, randomCreature } from '../gen/creature';
import { suitUp, undress } from '../gen/creatureOutfit';
import { Rng } from '../gen/rng';
import { CreatureLab } from './CreatureLab';
import { CreaturePanel } from './CreaturePanel';

/*
 * The creature editor (creature.html): shape a creature's spine, stick parts
 * on it, paint it and watch it walk, with the game's own animal body, mesh
 * and material. See CreatureLab.ts; `window.creatureLab` drives it from the
 * console or automation (npm run shot -- --creatures).
 */
function main(): void {
  const lab = new CreatureLab(document.getElementById('app')!, CreatureLab.designFromHash() ?? defaultCreature());
  new CreaturePanel(document.getElementById('ui')!, lab);
  document.getElementById('loading')?.remove();
  // `creatureKit` makes creatures for automation: creatureLab.setDesign(creatureKit.random(7)), creatureKit.suitUp(creatureLab.design).
  const kit = {
    blob: defaultCreature,
    random: randomCreature,
    suitUp,
    undress,
    animal: (seed: number, plan: 'quadruped' | 'hexapod' | 'biped' = 'quadruped') => designFromAnimal(generateAnimalForm(new Rng(seed), plan, 'herbivore', (seed * 47) % 360), 4, `Species ${seed}`),
  };
  Object.assign(window, { creatureLab: lab, creatureKit: kit });
}

try {
  main();
} catch (err: unknown) {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
}
