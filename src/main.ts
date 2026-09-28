import * as THREE from 'three';
import { Game, FIXED_DT } from './core/Game';
import { Debug } from './core/Debug';
import { Physics } from './physics/Physics';
import { Starfield } from './world/Starfield';
import { StarSystem, HOME_SYSTEM } from './world/StarSystem';
import { Ship } from './player/Ship';
import { ChaseCamera } from './player/ChaseCamera';
import { Hud } from './ui/Hud';

async function main(): Promise<void> {
  const [physics, debug] = await Promise.all([Physics.create(FIXED_DT), Debug.create()]);
  const game = new Game(document.getElementById('app')!, physics, debug);

  game.add(new Starfield(game.scene, game.camera));
  game.add(new StarSystem(game.scene, physics, HOME_SYSTEM));
  const ship = game.add(new Ship(game.scene, physics, game.input, debug, new THREE.Vector3(0, 15, 260)));
  game.add(new ChaseCamera(game.camera, ship, debug));
  game.add(new Hud(ship));

  document.getElementById('loading')?.remove();
  game.start();

  // Handle for poking at the game from the browser console / automation.
  if (import.meta.env.DEV) Object.assign(window, { game, ship });
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
