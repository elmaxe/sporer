import { Debug } from '../core/Debug';
import { installConsoleLog } from '../debug/consoleLog';
import { DebugDumpControl } from '../debug/DebugDump';
import { Game } from '../core/Game';
import { addPlantDebug } from '../surface/plantParams';
import { loadSurfaceMaps } from '../world/surfaceMaps';
import { FpsCounter } from '../ui/FpsCounter';
import { PlantLab } from './PlantLab';
import { PlantLabInfo } from './PlantLabInfo';
import { PlantLabPanel } from './PlantLabPanel';
import { plantLabDumpSource } from './plantLabDump';

/*
 * The plant lab (plants.html): make, view and debug plant species with the
 * game's own generator and renderer. See PlantLab.ts; `window.plantLab`
 * drives it from the console or automation (npm run shot -- --plants).
 */// First, so a debug dump has the console's errors from start-up on.
const consoleLog = installConsoleLog();

async function main(): Promise<void> {
  // The real bodies' maps first: Earth's plants grow where its map is green.
  const [debug] = await Promise.all([Debug.create({ force: true, title: 'Plant lab' }), loadSurfaceMaps()]);
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
  // The readout's Report button and F8: a debug dump of these plants, as in the game.
  const debugDump = game.add(new DebugDumpControl(game, plantLabDumpSource(game, lab), consoleLog, debug, 'lab-dump'));

  document.getElementById('loading')?.remove();
  game.start();
  Object.assign(window, { plantLab: lab, game, debugDump });
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
