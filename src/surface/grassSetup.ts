import * as THREE from 'three';
import { surfaceNoise } from '../gen/craters';
import { planGrass, type GrassGround, type GrassPlan } from '../gen/grass';
import { growsPlants } from '../gen/plants';
import { groundPalette } from '../gen/terranGround';
import { RELIEF_SCALE, globeRadius } from '../planet/frame';
import type { PlanetConfig } from '../world/Planet';
import { peakRadius, terrainSampler } from '../world/planetGeometry';

/** A body's grass and the ground it grows on. */
export interface GrassSetup {
  readonly plan: GrassPlan;
  readonly ground: GrassGround;
}

/**
 * The grass of a body as the planet level draws it (gen/grass.ts): on green
 * worlds (terran and ocean, those with the ground look) where plants
 * grow, standing on the same terrain the globe is sampled from and coloured
 * like the ground there. Null anywhere else.
 */
export function grassSetup(config: PlanetConfig): GrassSetup | null {
  const { style, seed, climate } = config;
  // Green worlds only, as the ground look (world/groundLook.ts createGroundLook) paints them.
  if (config.shape || (config.type !== 'terran' && config.type !== 'ocean')) return null;
  if (!climate || !growsPlants(climate)) return null;
  const R = globeRadius(config.radius);
  const palette = groundPalette(style);
  const linear = (hex: string): [number, number, number] => {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
  };
  const plan = planGrass({
    seed,
    tier: climate.habitability,
    temperature: climate.temperature,
    water: climate.water,
    radius: R,
    peak: peakRadius(R, style, RELIEF_SCALE),
    sea: style.sea !== null,
    lush: linear(palette.lush),
    dry: linear(palette.dry),
  });
  if (!plan) return null;
  const sample = terrainSampler(R, seed, style, { noise: surfaceNoise(config, true), reliefScale: RELIEF_SCALE, seaFloor: style.sea !== null });
  const color = new THREE.Color();
  return {
    plan,
    ground: (dir, rgb) => {
      const r = sample(dir, color);
      if (rgb) {
        rgb[0] = color.r;
        rgb[1] = color.g;
        rgb[2] = color.b;
      }
      return r;
    },
  };
}
