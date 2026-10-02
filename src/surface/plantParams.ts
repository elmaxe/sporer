import type { Debug } from '../core/Debug';

/**
 * Tunables of the surface plants (debug panel: Plants). `enabled` is the
 * menu's Plants setting (see ui/GraphicsSettings.ts), read every frame: off
 * drops the plants and stops generating them.
 */
export const plantParams = {
  enabled: true,
  /** Multiplies every plant's view distances (how far out plants are generated and drawn). */
  range: 1,
  /** Milliseconds per frame spent generating cells (at least one is made). */
  budgetMs: 2,
  /** Stop loading and dropping cells (to look at what is there). */
  freeze: false,
  /** Tint each level of detail (red full, then yellow, green and blue further out) to see where they change. */
  showLods: false,
};

export function addPlantDebug(debug: Debug): void {
  const f = debug.folder('Plants');
  f?.add(plantParams, 'enabled');
  f?.add(plantParams, 'range', 0.3, 2, 0.05);
  f?.add(plantParams, 'budgetMs', 0.5, 16, 0.5);
  f?.add(plantParams, 'freeze');
  f?.add(plantParams, 'showLods').name('show LODs');
}
