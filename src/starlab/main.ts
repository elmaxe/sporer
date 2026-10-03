import { Debug } from '../core/Debug';
import { Game } from '../core/Game';
import { Physics } from '../physics/Physics';
import { FpsCounter } from '../ui/FpsCounter';
import { Tooltip } from '../ui/Tooltip';
import { loadSurfaceMaps } from '../world/surfaceMaps';
import { StarLab } from './StarLab';
import { StarLabInfo } from './StarLabInfo';
import { StarLabPanel } from './StarLabPanel';

/*
 * The star lab (stars.html): make, view and tune a star and the system it
 * grows with the game's own generators and renderers. See StarLab.ts;
 * `window.starLab` drives it from the console or automation
 * (npm run shot -- --stars).
 */
async function main(): Promise<void> {
  // The real bodies' maps too, so Sol's planets show their own surfaces.
  const [debug] = await Promise.all([Debug.create({ force: true, title: 'Star lab' }), Physics.init(), loadSurfaceMaps()]);
  const game = new Game(document.getElementById('app')!, debug);
  const lab = new StarLab(game, debug, new Tooltip(), StarLab.stateFromUrl(new URL(location.href)));
  const fps = game.add(new FpsCounter());
  const panel = new StarLabPanel(debug.panel!, lab, fps);
  // The game's own tunables for what the lab shows (stars, storms, comets, belts...), below the lab's controls.
  debug.nestFolders('Game tunables');
  const info = game.add(new StarLabInfo(lab, game.input));
  lab.onBuilt = () => {
    info.rebuilt();
    panel.rebuilt();
  };
  lab.rebuild();

  document.getElementById('loading')?.remove();
  game.start();
  Object.assign(window, { starLab: lab, game });
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
