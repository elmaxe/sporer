import { Debug } from '../core/Debug';
import { installConsoleLog } from '../debug/consoleLog';
import { DebugDumpControl } from '../debug/DebugDump';
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
import { planetLabDumpSource } from './labDump';

/*
 * The planet lab (lab.html): make, view and debug one planet or moon with the
 * game's own generators and renderers. See PlanetLab.ts; `window.lab` drives
 * it from the console or automation (npm run shot -- --lab).
 */// First, so a debug dump has the console's errors from start-up on.
const consoleLog = installConsoleLog();

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
  // The readout's Report button and F8: a debug dump of this planet, as in the game.
  const debugDump = game.add(new DebugDumpControl(game, planetLabDumpSource(game, lab), consoleLog, debug, 'lab-dump'));

  document.getElementById('loading')?.remove();
  game.start();
  Object.assign(window, { lab, game, debugDump });
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
