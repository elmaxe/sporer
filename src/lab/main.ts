import { Debug } from '../core/Debug';
import { Game } from '../core/Game';
import { addLavaDebug } from '../world/lavaMaterial';
import { addAtmosphereDebug } from '../world/atmosphereShell';
import { Physics } from '../physics/Physics';
import { LabInfo } from './LabInfo';
import { LabPanel } from './LabPanel';
import { PlanetLab } from './PlanetLab';

/*
 * The planet lab (lab.html): make, view and debug one planet or moon with the
 * game's own generators and renderers. See PlanetLab.ts; `window.lab` drives
 * it from the console or automation (npm run shot -- --lab).
 */
async function main(): Promise<void> {
  const [debug] = await Promise.all([Debug.create({ force: true, title: 'Planet lab' }), Physics.init()]);
  const game = new Game(document.getElementById('app')!, debug);
  const lab = new PlanetLab(game, debug, PlanetLab.stateFromUrl(new URL(location.href)));
  new LabPanel(debug.panel!, lab);
  // The game's own tunables for what the lab shows, below the lab's controls.
  debug.nestFolders('Game tunables');
  addLavaDebug(debug);
  addAtmosphereDebug(debug);
  const info = game.add(new LabInfo(lab));
  lab.onBuilt = () => info.rebuilt();
  lab.rebuild();

  document.getElementById('loading')?.remove();
  game.start();
  Object.assign(window, { lab, game });
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
