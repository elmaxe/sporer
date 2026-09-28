import { Game } from './core/Game';
import { Debug } from './core/Debug';
import { Physics } from './physics/Physics';
import { generateGalaxy } from './gen/galaxy';
import { parseSeed } from './gen/rng';
import { findHomeSystem } from './gen/system';
import { SceneManager } from './levels/SceneManager';
import { AudioManager } from './audio/AudioManager';
import { VolumeControl, loadAudioSettings } from './ui/VolumeControl';

const DEFAULT_SEED = '1337';

async function main(): Promise<void> {
  // ?seed=<number or any text> picks the galaxy, ?star=<id> jumps to a system.
  const params = new URLSearchParams(location.search);
  const galaxy = generateGalaxy(parseSeed(params.get('seed') ?? DEFAULT_SEED));
  const starId = Number(params.get('star'));
  const start = (params.has('star') && galaxy.stars[starId]) || findHomeSystem(galaxy);

  const [debug] = await Promise.all([Debug.create(), Physics.init()]);
  const game = new Game(document.getElementById('app')!, debug);
  const levels = game.add(new SceneManager(game, galaxy, start, debug));
  const audioSettings = loadAudioSettings();
  const audio = new AudioManager(audioSettings);
  new VolumeControl(audio, audioSettings);

  document.getElementById('loading')?.remove();
  game.start();

  // Handles for poking at the game from the browser console / automation.
  // ship / world / system follow the current system level.
  if (import.meta.env.DEV) {
    Object.assign(window, { game, galaxy, levels, audio });
    Object.defineProperties(window, {
      ship: { get: () => levels.systemLevel.ship, configurable: true },
      world: { get: () => levels.systemLevel.world, configurable: true },
      system: { get: () => levels.systemLevel.data, configurable: true },
    });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
