import type { Debug } from '../core/Debug';

/**
 * Light in a system with no star (a rogue planet, see gen/rogues.ts): the
 * whole galaxy's glow, coming mostly from its bright centre (the bulge, the
 * band's brightest part in the sky). Real starlight out there is 4.8 × 10⁻⁹
 * of sunlight at Earth (docs/research/rogue-planets.md): pitch black to the
 * eye. So this is deliberately stylised, many orders of magnitude brighter:
 * a dim directional light from the galactic centre plus the usual ambient,
 * and the eye opens up, so the world reads as dark and cold, not black. Its
 * own heat (lava, glowing vents) shows on top.
 */
export const galacticLightParams = {
  /** The glow's colour: integrated old starlight, warm white like the bulge. */
  color: '#e8dcc6',
  /** Directional light intensity (a star's is 1.2–5). */
  intensity: 0.4,
  /** How bright the air and clouds are lit, relative to a star's light (they're shaded by hand, not by the light). */
  air: 0.2,
  /** Tone-mapping exposure in a starless system (1 elsewhere): the eye opened up to the dark. */
  exposure: 1.5,
};

/** The galactic light's tunables in the debug panel (shared by the system and planet levels). */
export function addGalacticLightDebug(debug: Debug): void {
  const f = debug.folder('Galactic light (rogue planets)');
  f?.add(galacticLightParams, 'intensity', 0, 3);
  f?.add(galacticLightParams, 'air', 0, 1);
  f?.add(galacticLightParams, 'exposure', 1, 4);
  f?.addColor(galacticLightParams, 'color');
}
