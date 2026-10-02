import { Debug } from '../core/Debug';
import { Game } from '../core/Game';
import { addPlantDebug } from '../surface/plantParams';
import { FpsCounter } from '../ui/FpsCounter';
import { PlantLab } from './PlantLab';
import { PlantLabInfo } from './PlantLabInfo';
import { PlantLabPanel } from './PlantLabPanel';

/*
 * The plant lab (plants.html): make, view and debug plant species with the
 * game's own generator and renderer. See PlantLab.ts; `window.plantLab`
 * drives it from the console or automation (npm run shot -- --plants).
 */
async function main(): Promise<void> {
  const debug = await Debug.create({ force: true, title: 'Plant lab' });
  const game = new Game(document.getElementById('app')!, debug);
  const lab = new PlantLab(game, debug, PlantLab.stateFromUrl(new URL(location.href)));
  const fps = game.add(new FpsCounter());
  new PlantLabPanel(debug.panel!, lab, fps);
  // The game's own plant tunables, below the lab's controls.
  debug.nestFolders('Game tunables');
  addPlantDebug(debug);
  const info = game.add(new PlantLabInfo(lab, game.input));
  lab.onBuilt = () => info.rebuilt();
  lab.rebuild();

  document.getElementById('loading')?.remove();
  game.start();
  Object.assign(window, { plantLab: lab, game });
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
