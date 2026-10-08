import { defaultShip, randomShip } from '../gen/ship';
import { keptShip } from '../player/customShip';
import { ShipLab } from './ShipLab';
import { ShipPanel } from './ShipPanel';

/*
 * The spaceship editor (ship.html): build a ship from parts stuck onto each
 * other, paint it and take it for a test flight. See ShipLab.ts;
 * `window.shipLab` drives it from the console or automation (npm run shot --
 * --ships), `window.shipKit` makes ships: shipLab.setDesign(shipKit.random(7)).
 * With no design in the address it opens the ship the game flies, if one is kept.
 */
function main(): void {
  const lab = new ShipLab(document.getElementById('app')!, ShipLab.designFromHash() ?? keptShip() ?? defaultShip());
  new ShipPanel(document.getElementById('ui')!, lab);
  document.getElementById('loading')?.remove();
  Object.assign(window, { shipLab: lab, shipKit: { saucer: defaultShip, random: randomShip } });
}

try {
  main();
} catch (err: unknown) {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
}
