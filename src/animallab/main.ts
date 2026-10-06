import { Debug } from '../core/Debug';
import { Game } from '../core/Game';
import { addAnimalDebug } from '../surface/animalParams';
import { addPlantDebug } from '../surface/plantParams';
import { FpsCounter } from '../ui/FpsCounter';
import { AnimalLab } from './AnimalLab';
import { AnimalLabInfo } from './AnimalLabInfo';
import { AnimalLabPanel } from './AnimalLabPanel';

/*
 * The animal lab (animals.html): make, view and debug animal species with
 * the game's own generator, renderer and walk. See AnimalLab.ts;
 * `window.animalLab` drives it from the console or automation
 * (npm run shot -- --animals).
 */
async function main(): Promise<void> {
  const debug = await Debug.create({ force: true, title: 'Animal lab' });
  const game = new Game(document.getElementById('app')!, debug);
  const lab = new AnimalLab(game, debug, AnimalLab.stateFromUrl(new URL(location.href)));
  const fps = game.add(new FpsCounter());
  new AnimalLabPanel(debug.panel!, lab, fps);
  // The game's own tunables, below the lab's controls.
  debug.nestFolders('Game tunables');
  addAnimalDebug(debug);
  addPlantDebug(debug);
  const info = game.add(new AnimalLabInfo(lab, game.input));
  lab.onBuilt = () => info.rebuilt();
  lab.rebuild();

  document.getElementById('loading')?.remove();
  game.start();
  Object.assign(window, { animalLab: lab, game });
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
