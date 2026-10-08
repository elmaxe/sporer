import { decodeDesign, defaultCreature, encodeDesign, type CreatureDesign } from '../gen/creature';

/*
 * The ship's captain: the player's own creature from the creature editor
 * (creature.html), seated in a space suit in the cockpit of their ship (in
 * the game and the spaceship editor; player/captainMesh.ts draws it). The
 * creature editor's Captain button keeps it in local storage; `?captain=<design>`
 * in the address seats a design for that visit only (links, screenshots).
 * With none kept, the editor's first creature flies.
 */

const STORAGE_KEY = 'sporer.captain';

/** The creature to seat in the cockpit. */
export function captainDesign(): CreatureDesign {
  try {
    const param = new URLSearchParams(location.search).get('captain');
    const d = param ? decodeDesign(param) : null;
    return d ?? keptCaptain() ?? defaultCreature();
  } catch {
    return defaultCreature();
  }
}

/** The creature kept as captain, ignoring `?captain=`, or null for none. */
export function keptCaptain(): CreatureDesign | null {
  try {
    const kept = localStorage.getItem(STORAGE_KEY);
    return kept ? decodeDesign(kept) : null;
  } catch {
    return null;
  }
}

/** Keeps a creature as the captain (null: back to the default). Returns false if storage is unavailable. */
export function keepCaptain(design: CreatureDesign | null): boolean {
  try {
    if (design) localStorage.setItem(STORAGE_KEY, encodeDesign(design));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
