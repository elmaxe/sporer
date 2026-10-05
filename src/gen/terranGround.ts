import { hexToRgb, hslToHex, rgbToHsl } from './color';
import { localTemperature } from './plants';
import type { PlanetStyle } from './planets';

/*
 * The ground of green (terran and ocean) worlds as data: the colours its
 * per-pixel look (world/groundLook.ts) mixes, and where snow lies. Pure, so
 * it's tested (tests/terranGround.test.ts). See docs/research/terran-ground.md.
 *
 * As Spore's planets did (Ocean Quigley's "Planetary Materials"), the ground
 * is the painted colour ramp (style low → high by height) with detail colours
 * derived from it laid over it where the terrain calls for them: lusher
 * vegetation in the valleys, drier grass and bare soil on the crests and in
 * patches of biome noise, sand along the shore, rock on the cliffs, snow
 * where it's cold.
 */

/** The standard atmosphere's lapse rate, K per km (ICAO / U.S. Standard Atmosphere 1976, troposphere). */
export const LAPSE_RATE = 6.5;

/** The highest peaks (elevation 1) stand as high as Earth's: Everest, km. */
export const PEAK_KM = 8.849;

/** How much colder the highest peaks are than the shore, K. */
export const PEAK_COOLING = LAPSE_RATE * PEAK_KM;

/**
 * Snow lies where the annual mean is below this, K, at the equator (0 °C):
 * in the tropics the snow line follows the 0 °C annual isotherm, 4.5–5 km up
 * near the equator (Polarpedia, "Equilibrium line altitude"). That puts it
 * at 4.2 km for Earth's 15 °C mean.
 */
export const SNOW_TEMPERATURE = 273.15;

/**
 * How much colder than SNOW_TEMPERATURE the annual mean must be at the
 * poles, K, for snow to last the year: away from the tropics glaciers' snow
 * lines follow the summer's temperature (Ohmura et al. 1992), and summers
 * are warmer than the year's mean, the more so the higher the latitude.
 * Stylised, as sin² of the latitude: on Earth it whitens the ground from
 * about 70° (Greenland's and Antarctica's edges).
 */
export const POLAR_SNOW_OFFSET = 7;

/** The annual mean (K) below which snow lies all year at latitude `lat` (radians). */
export function snowTemperature(lat: number): number {
  const s = Math.sin(lat);
  return SNOW_TEMPERATURE - POLAR_SNOW_OFFSET * s * s;
}

/** The annual mean temperature (K) on the ground at latitude `lat` (radians) and `elevation` (0 shore to 1 peak, landElevation) of a body whose mean is `mean`. */
export function groundTemperature(mean: number, lat: number, elevation: number): number {
  return localTemperature(mean, lat) - PEAK_COOLING * Math.max(0, elevation);
}

/** The detail colours of a green world's ground (hex, sRGB). */
export interface GroundPalette {
  /** Dense vegetation in the valleys: the low ground's colour, darker and richer. */
  lush: string;
  /** Dry grass on the crests and in dry patches: turned towards the highlands' hue, paler. */
  dry: string;
  /** Bare soil where the crests are steepest: the highlands' hue, dark. */
  soil: string;
  /** Rock on the cliffs: the highlands' hue, almost grey. */
  rock: string;
  /** Snow. */
  snow: string;
}

/** The sea floor's and the beach's sand (stylised), before a fifth of the low ground's colour goes into it (world/planetGeometry.ts). */
export const SAND = '#d8c49a';

/** Fresh snow, a little blue (gen/iceColor.ts ICE_CLASSES.snow is #e9eef0). */
const SNOW = '#eef2f4';

/** The ground's detail colours from its painted ones. */
export function groundPalette(style: PlanetStyle): GroundPalette {
  const low = hexToRgb(style.low);
  const [lh, ls, ll] = rgbToHsl(...low);
  const [hh, hs] = rgbToHsl(...hexToRgb(style.high));
  // Vegetation's hue turned 45% of the way round towards the highlands' (the short way).
  const turn = ((((hh - lh) % 360) + 540) % 360) - 180;
  return {
    lush: hslToHex(lh + 4, Math.min(1, ls + 0.12), ll * 0.72),
    dry: hslToHex(lh + turn * 0.45, ls * 0.9, Math.min(0.5, ll * 1.12 + 0.03)),
    soil: hslToHex(hh, Math.max(0.3, hs + 0.1), 0.3),
    rock: hslToHex(hh, 0.08, 0.4),
    snow: SNOW,
  };
}
