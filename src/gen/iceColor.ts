import { hslToHex, rgbToHex, rgbToHsl } from './color';

/**
 * The colours of ice: snow, firn, glacier ice and leads from how far light
 * travels through the ice before it comes back. Pure, with no other gen/
 * imports, so planets.ts can paint ice worlds with it. See docs/research/ice.md.
 */

/**
 * How fast pure ice absorbs light, per metre of path, in linear sRGB: fitted to
 * daylight (a 6504 K black body) through Warren & Brandt's (2008) absorption
 * spectrum over 0.3–5 m of path. Red goes ~200× faster than blue (at 700 nm
 * against 450 nm), so the deeper light goes into ice, the bluer what comes back.
 */
export const ICE_ABSORPTION: readonly [r: number, g: number, b: number] = [0.21, 0.045, 0];

/** The share of daylight left after `path` metres of ice, per linear sRGB channel. */
export function iceTransmission(path: number): [r: number, g: number, b: number] {
  return ICE_ABSORPTION.map((k) => Math.exp(-k * path)) as [number, number, number];
}

/** Rec. 709 luminance of linear RGB. */
export function luminance([r, g, b]: readonly [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A kind of icy surface: its albedo (what share of the light comes back) and
 * how far, on average, that light travelled through ice (metres; stylised: the
 * real path depends on grain size, and is picked so the tint matches).
 */
export interface IceClass {
  albedo: number;
  path: number;
}

/**
 * The surfaces an ice world shows. Albedos: fresh snow 0.85 (fresh dry snow is
 * over 0.9, Antarctic snow 0.80, Cuffey & Paterson; Bintanja 1999), firn and old
 * snow, bare sea ice 0.65 (Perovich et al. 2002), blue ice 0.56 (Bintanja 1999).
 * Leads (new, thin ice over open water) are dark: ponds go down to 0.1
 * (Perovich et al.); 0.2 is a stylised pick.
 */
export const ICE_CLASSES = {
  snow: { albedo: 0.85, path: 0.3 },
  firn: { albedo: 0.7, path: 1.5 },
  seaIce: { albedo: 0.65, path: 2 },
  blueIce: { albedo: 0.56, path: 5 },
  lead: { albedo: 0.2, path: 15 },
} as const satisfies Record<string, IceClass>;

/** An ice class's colour, linear sRGB: daylight through its path of ice, scaled so its luminance is its albedo. */
export function iceLinear({ albedo, path }: IceClass): [r: number, g: number, b: number] {
  const t = iceTransmission(path);
  const k = albedo / luminance(t);
  return [t[0] * k, t[1] * k, t[2] * k];
}

/** An ice class's colour as hex (sRGB), its hue turned to `hue` (degrees) if given: a world's own tint. */
export function iceHex(ice: IceClass, hue?: number): string {
  const [r, g, b] = iceLinear(ice).map(linearToSrgb) as [number, number, number];
  if (hue === undefined) return rgbToHex(r, g, b);
  const [, s, l] = rgbToHsl(r, g, b);
  return hslToHex(hue, s, l);
}

/** Linear to sRGB-encoded, one channel in [0, 1]. */
export function linearToSrgb(c: number): number {
  c = Math.min(1, Math.max(0, c));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

