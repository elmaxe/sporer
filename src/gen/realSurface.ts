/*
 * Real bodies' surfaces (the Sol system's Earth, Moon, Mars and Pluto): a height
 * map and a colour map made from NASA / USGS data by scripts/solMaps.py, in
 * public/maps/. A body with one has a reserved seed (SURFACE_SEEDS, negative,
 * which no generator ever draws), and `terrainNoise` / `detailedTerrain` read
 * its height map instead of the noise for that seed, so everything that reads
 * the ground (the globes, the maps, plants, geysers, the ship's ground
 * following) gets the real continents at once. The painters colour it from
 * the colour map (`surfaceColor`).
 *
 * The maps are fetched once (world/surfaceMaps.ts) and registered here; until
 * then, or if they fail to load, the body falls back to its seed's noise.
 * Pure: no THREE, no DOM.
 */

import { SOL_SEEDS } from './solSeeds';

/** The bodies with real maps, by their reserved (negative) seeds. */
export const SURFACE_SEEDS = { earth: SOL_SEEDS.earth, moon: SOL_SEEDS.moon, mars: SOL_SEEDS.mars, pluto: SOL_SEEDS.pluto } as const;
export type SurfaceName = keyof typeof SURFACE_SEEDS;
export const SURFACE_NAMES = Object.keys(SURFACE_SEEDS) as SurfaceName[];

export interface RealSurface {
  name: SurfaceName;
  heightWidth: number;
  heightHeight: number;
  /** One byte per pixel: the terrain value n = v / 127.5 − 1 (see terrainNoise). Equirectangular, west to east, north row first. */
  heights: Uint8Array;
  colorWidth: number;
  colorHeight: number;
  /** sRGB, three bytes per pixel, laid out like `heights`. */
  colors: Uint8Array;
  /**
   * How much of `detailedTerrain`'s fine noise is added on top (1: all of it).
   * Earth keeps a little, so coastlines wiggle without flooding the lowlands.
   */
  detail: number;
}

/** Fine noise kept on top of each map (see RealSurface.detail). */
export const SURFACE_DETAIL: Record<SurfaceName, number> = { earth: 0.4, moon: 0.6, mars: 0.6, pluto: 0.6 };

const MAGIC = 'SOLM';
const VERSION = 1;

/** Decodes an (already inflated) map file: see scripts/solMaps.py for the format. */
export function decodeSurface(name: SurfaceName, bytes: Uint8Array): RealSurface {
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (magic !== MAGIC || view.getUint16(4, true) !== VERSION) throw new Error(`${name}: not a surface map`);
  const heightWidth = view.getUint16(6, true);
  const heightHeight = view.getUint16(8, true);
  const colorWidth = view.getUint16(10, true);
  const colorHeight = view.getUint16(12, true);
  const heightsEnd = 16 + heightWidth * heightHeight;
  const colorsEnd = heightsEnd + colorWidth * colorHeight * 3;
  if (bytes.length !== colorsEnd) throw new Error(`${name}: surface map is ${bytes.length} bytes, expected ${colorsEnd}`);
  return {
    name,
    heightWidth,
    heightHeight,
    heights: bytes.subarray(16, heightsEnd),
    colorWidth,
    colorHeight,
    colors: bytes.subarray(heightsEnd, colorsEnd),
    detail: SURFACE_DETAIL[name],
  };
}

const registry = new Map<number, RealSurface>();

export function registerSurface(surface: RealSurface): void {
  registry.set(SURFACE_SEEDS[surface.name], surface);
}

/** The real surface for a body's seed, if it has one and it's loaded. Cheap for every other seed. */
export function realSurface(seed: number): RealSurface | undefined {
  return seed < 0 ? registry.get(seed) : undefined;
}

/**
 * Where direction (x, y, z) falls on an equirectangular map w × h, in pixel
 * coordinates (pixel centres at +0.5), in the body frame's longitude and
 * latitude (planet/equalEarth.ts: lon = atan2(x, z), east towards +x).
 */
function mapPoint(x: number, y: number, z: number, w: number, h: number, out: { u: number; v: number }): void {
  const lon = Math.atan2(x, z);
  const lat = Math.asin(Math.max(-1, Math.min(1, y / (Math.hypot(x, y, z) || 1))));
  out.u = ((lon + Math.PI) / (2 * Math.PI)) * w - 0.5;
  out.v = ((Math.PI / 2 - lat) / Math.PI) * h - 0.5;
}

const point = { u: 0, v: 0 };

/** Bilinear lookup of `channel` (of `stride` bytes per pixel) at pixel coordinates, wrapping east-west. */
function bilinear(data: Uint8Array, w: number, h: number, stride: number, channel: number, u: number, v: number): number {
  const u0 = Math.floor(u);
  const v0 = Math.floor(v);
  const fu = u - u0;
  const fv = v - v0;
  const x0 = ((u0 % w) + w) % w;
  const x1 = (x0 + 1) % w;
  const y0 = Math.min(h - 1, Math.max(0, v0));
  const y1 = Math.min(h - 1, Math.max(0, v0 + 1));
  const a = data[(y0 * w + x0) * stride + channel]!;
  const b = data[(y0 * w + x1) * stride + channel]!;
  const c = data[(y1 * w + x0) * stride + channel]!;
  const d = data[(y1 * w + x1) * stride + channel]!;
  return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
}

/** The terrain value n in [-1, 1] at direction (x, y, z) (any length), as `terrainNoise` gives it. */
export function surfaceHeight(s: RealSurface, x: number, y: number, z: number): number {
  mapPoint(x, y, z, s.heightWidth, s.heightHeight, point);
  return bilinear(s.heights, s.heightWidth, s.heightHeight, 1, 0, point.u, point.v) / 127.5 - 1;
}

/** The sRGB colour (channels 0–1) at direction (x, y, z), written into `out`. */
export function surfaceColor(s: RealSurface, x: number, y: number, z: number, out: [number, number, number]): [number, number, number] {
  mapPoint(x, y, z, s.colorWidth, s.colorHeight, point);
  for (let c = 0; c < 3; c++) out[c] = bilinear(s.colors, s.colorWidth, s.colorHeight, 3, c, point.u, point.v) / 255;
  return out;
}

/** The map file of a body, relative to the site's base URL. */
export function surfaceFile(name: SurfaceName): string {
  return `maps/${name}.bin`;
}
