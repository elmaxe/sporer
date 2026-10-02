import { Debug } from '../core/Debug';
import { Game } from '../core/Game';
import { addLavaDebug } from '../world/lavaMaterial';
import { addGasDebug } from '../world/gasLook';
import { addAtmosphereDebug } from '../world/atmosphereShell';
import { addWeatherDebug } from '../world/weatherLook';
import { Physics } from '../physics/Physics';
import { loadSurfaceMaps } from '../world/surfaceMaps';
import { addPlantDebug, plantParams } from '../surface/plantParams';
import { FpsCounter } from '../ui/FpsCounter';
import { isTouchDevice } from '../ui/GraphicsSettings';
import { TouchControls } from '../ui/TouchControls';
import { LabInfo } from './LabInfo';
import { LabPanel } from './LabPanel';
import { PlanetLab } from './PlanetLab';

/*
 * The planet lab (lab.html): make, view and debug one planet or moon with the
 * game's own generators and renderers. See PlanetLab.ts; `window.lab` drives
 * it from the console or automation (npm run shot -- --lab).
 */
async function main(): Promise<void> {
  // The real bodies' maps first, so a Sol planet shows its own surface.
  const [debug] = await Promise.all([Debug.create({ force: true, title: 'Planet lab' }), Physics.init(), loadSurfaceMaps()]);
  const game = new Game(document.getElementById('app')!, debug);
  const lab = new PlanetLab(game, debug, PlanetLab.stateFromUrl(new URL(location.href)));
  const fps = game.add(new FpsCounter());
  new LabPanel(debug.panel!, lab, fps);
  // The game's own tunables for what the lab shows, below the lab's controls.
  debug.nestFolders('Game tunables');
  addLavaDebug(debug);
  addGasDebug(debug);
  addAtmosphereDebug(debug);
  addWeatherDebug(debug);
  // Plants are off by default on touch devices, as in the game's menu.
  plantParams.enabled = !isTouchDevice();
  addPlantDebug(debug);
  const info = game.add(new LabInfo(lab, game.input));
  // The game's stick, Boost and Map buttons on phones (low orbit only, see LabLevel.touchControls).
  game.add(new TouchControls(game));
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
