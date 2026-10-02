import { Game } from './core/Game';
import { Debug } from './core/Debug';
import { Physics } from './physics/Physics';
import { generateGalaxy, systemRef } from './gen/galaxy';
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
import { GraphicsSettingsControl, loadGraphicsSettings } from './ui/GraphicsSettings';
import { installConsoleLog } from './debug/consoleLog';
import { DebugDumpControl } from './debug/DebugDump';

// First, so the debug dump has the console's errors from start-up on.
const consoleLog = installConsoleLog();

const DEFAULT_SEED = '1337';

async function main(): Promise<void> {
  // ?seed=<number or any text> picks the galaxy, ?star=<id> jumps to a system (or a rogue planet).
  const params = new URLSearchParams(location.search);
  const galaxy = generateGalaxy(parseSeed(params.get('seed') ?? DEFAULT_SEED));
  const starId = Number(params.get('star'));
  const start = (params.has('star') && systemRef(galaxy, starId)) || findHomeSystem(galaxy);

  const [debug] = await Promise.all([Debug.create(), Physics.init()]);
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
