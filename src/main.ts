import { Game } from './core/Game';
import { Debug } from './core/Debug';
import { Physics } from './physics/Physics';
import { generateGalaxy, solRef, systemRef } from './gen/galaxy';
import { loadSurfaceMaps } from './world/surfaceMaps';
import { geyserKind } from './gen/geysers';
import { volcanicLightning, weatherKind } from './gen/weather';
import { parseSeed } from './gen/rng';
import { findHomeSystem, generateSystem } from './gen/system';
import { SceneManager } from './levels/SceneManager';
import { AudioManager } from './audio/AudioManager';
import { VolumeControl, loadAudioSettings } from './ui/VolumeControl';
import { TouchControls } from './ui/TouchControls';
import { FullscreenButton } from './ui/FullscreenButton';
import { GameMenu } from './ui/GameMenu';
import { FpsCounter } from './ui/FpsCounter';
import { ItemBar } from './ui/ItemBar';
import { PlantIcons } from './ui/plantIcons';
import { GraphicsSettingsControl, loadGraphicsSettings } from './ui/GraphicsSettings';
import { installConsoleLog } from './debug/consoleLog';
import { DebugDumpControl } from './debug/DebugDump';
import { openChosenVersion } from './ui/versions';

// First, so the debug dump has the console's errors from start-up on.
const consoleLog = installConsoleLog();

const DEFAULT_SEED = '1337';

async function main(): Promise<void> {
  // An installed app starts at the release: on to the version picked in the menu, if another.
  if (await openChosenVersion()) return;
  // ?seed=<number or any text> picks the galaxy, ?star=<id> jumps to a system (or a rogue planet).
  const params = new URLSearchParams(location.search);
  const galaxy = generateGalaxy(parseSeed(params.get('seed') ?? DEFAULT_SEED));
  // ?star=sol is our own solar system, wherever it is in this galaxy.
  const starParam = params.get('star');
  const start = (starParam?.toLowerCase() === 'sol' && solRef(galaxy)) || (starParam !== null && systemRef(galaxy, Number(starParam))) || findHomeSystem(galaxy);

  // The real bodies' maps (Earth, the Moon, Mars, Pluto): waited for when starting in Sol, else they load meanwhile.
  const maps = loadSurfaceMaps();
  const [debug] = await Promise.all([Debug.create(), Physics.init(), start.real ? maps : null]);
  const game = new Game(document.getElementById('app')!, debug);
  const audioSettings = loadAudioSettings();
  const audio = new AudioManager(audioSettings, debug);
  new VolumeControl(audio, audioSettings);
  new GraphicsSettingsControl(loadGraphicsSettings());
  new FullscreenButton();
  const levels = game.add(new SceneManager(game, galaxy, start, debug, audio));
  const menu = new GameMenu(game, levels);
  game.add(new FpsCounter());
  game.add(new TouchControls(game));
  game.add(new ItemBar(levels, game.input, levels.tooltip, new PlantIcons(game.renderer)));
  const debugDump = game.add(new DebugDumpControl(game, levels, consoleLog, debug));

  document.getElementById('loading')?.remove();
  game.start();

  // Handles for poking at the game from the browser console / automation.
  // ship / world / system follow the current system level, planet the planet level (or null).
  if (import.meta.env.DEV) {
    Object.assign(window, { game, galaxy, levels, audio, menu, debugDump, generateSystem, geyserKind, weatherKind, volcanicLightning });
    Object.defineProperties(window, {
      ship: { get: () => levels.systemLevel.ship, configurable: true },
      world: { get: () => levels.systemLevel.world, configurable: true },
      system: { get: () => levels.systemLevel.data, configurable: true },
      planet: { get: () => levels.planetLevel, configurable: true },
    });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
