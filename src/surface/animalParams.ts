import type { Debug } from '../core/Debug';

/**
 * Tunables of the animals (debug panel: Animals). `enabled` is the menu's
 * Animals setting (see ui/GraphicsSettings.ts), read every frame: off drops
 * the herds and stops posing them.
 */
export const animalParams = {
  enabled: true,
  /** Multiplies every animal's view distances. */
  range: 1,
  /** Milliseconds per frame spent making herd cells (at least one is made). */
  budgetMs: 1,
  /** Tint each level of detail (red full, yellow, green furthest) to see where they change. */
  showLods: false,
};

export function addAnimalDebug(debug: Debug): void {
  const f = debug.folder('Animals');
  f?.add(animalParams, 'enabled');
  f?.add(animalParams, 'range', 0.3, 2, 0.05);
  f?.add(animalParams, 'budgetMs', 0.25, 8, 0.25);
  f?.add(animalParams, 'showLods').name('show LODs');
}
