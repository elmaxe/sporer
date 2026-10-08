import { decodeShip, encodeShip, type ShipDesign } from '../gen/ship';

/*
 * The player's own ship, designed in the spaceship editor (ship.html) and
 * flown in the game in place of the saucer. The editor's "Fly in the game"
 * keeps it in local storage; `?ship=<design>` in the game's address flies a
 * design for that visit only (links, screenshots) without keeping it.
 */

const STORAGE_KEY = 'sporer.ship';

/** The design to fly, or null for the classic saucer. */
export function customShip(): ShipDesign | null {
  try {
    const param = new URLSearchParams(location.search).get('ship');
    if (param) return decodeShip(param);
    const kept = localStorage.getItem(STORAGE_KEY);
    return kept ? decodeShip(kept) : null;
  } catch {
    return null;
  }
}

/** The design kept for the game, ignoring `?ship=` (the editor starts from it). */
export function keptShip(): ShipDesign | null {
  try {
    const kept = localStorage.getItem(STORAGE_KEY);
    return kept ? decodeShip(kept) : null;
  } catch {
    return null;
  }
}

/** Keeps a design for the game to fly (null: back to the saucer). Returns false if storage is unavailable. */
export function keepShip(design: ShipDesign | null): boolean {
  try {
    if (design) localStorage.setItem(STORAGE_KEY, encodeShip(design));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
