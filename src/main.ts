import * as THREE from 'three';
import { Game, FIXED_DT } from './core/Game';
import { Debug } from './core/Debug';
import { Physics } from './physics/Physics';
import { generateGalaxy } from './gen/galaxy';
import { parseSeed } from './gen/rng';
import { findHomeSystem, generateSystem, spawnDistance } from './gen/system';
import { Starfield } from './world/Starfield';
import { StarSystem } from './world/StarSystem';
import { Ship } from './player/Ship';
import { OrbitCamera } from './player/OrbitCamera';
import { Picker } from './player/Picker';
import { TargetMarker } from './player/TargetMarker';
import { Hud } from './ui/Hud';

const DEFAULT_SEED = '1337';

async function main(): Promise<void> {
  // ?seed=<number or any text> picks the galaxy, ?star=<id> jumps to a system.
  const params = new URLSearchParams(location.search);
  const galaxy = generateGalaxy(parseSeed(params.get('seed') ?? DEFAULT_SEED));
  const starId = Number(params.get('star'));
  const ref = (params.has('star') && galaxy.stars[starId]) || findHomeSystem(galaxy);
  const system = generateSystem(ref);

  const [physics, debug] = await Promise.all([Physics.create(FIXED_DT), Debug.create()]);
  const game = new Game(document.getElementById('app')!, physics, debug);

  game.add(new Starfield(game.scene, game.camera));
  const world = game.add(new StarSystem(game.scene, physics, system));
  const spawn = new THREE.Vector3(0, 15, spawnDistance(system));
  const ship = game.add(new Ship(game.scene, physics, game.input, game.camera, world.bodies, debug, spawn));
  // Visual-only entities below run in this order each frame: camera first, then what reads it.
  game.add(new OrbitCamera(game.camera, ship.object, game.input, debug));
  const picker = game.add(new Picker(game.camera, game.input, ship, world.bodies));
  game.add(new TargetMarker(game.scene, game.camera, ship));
  game.add(new Hud(ship, picker, game.input, system));

  document.getElementById('loading')?.remove();
  game.start();

  // Handles for poking at the game from the browser console / automation.
  if (import.meta.env.DEV) Object.assign(window, { game, ship, galaxy, system, world });
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
