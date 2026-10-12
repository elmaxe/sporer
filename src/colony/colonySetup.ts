import * as THREE from 'three';
import { surfaceNoise } from '../gen/craters';
import type { ColonyGround, ColonyWorld } from '../gen/colony';
import type { Habitability } from '../gen/climate';
import { RELIEF_SCALE, globeRadius } from '../planet/frame';
import { isGas, type PlanetConfig } from '../world/Planet';
import { peakRadius, terrainSampler } from '../world/planetGeometry';

/** What colonies on a body stand on and live in (colony/Colonies.ts, colony/ColonyPod.ts). */
export interface ColonySetup {
  readonly seed: number;
  /** The terrain as the globe draws it (null on a giant). */
  readonly ground: ColonyGround | null;
  readonly world: ColonyWorld;
  readonly tier: Habitability;
  /** The highest terrain's radius, surface gravity (Earth = 1) and mean temperature (K): for the colonists' walk. */
  readonly peak: number;
  readonly gravity: number;
  readonly temperature: number;
}

/**
 * A body as far as colonies go: the same terrain the globe and the plants
 * are sampled from (surface/plantSetup.ts), its climate and tier. Any body:
 * where none can be founded, `colonyBlock` says why.
 */
export function colonySetup(config: PlanetConfig, busted = false): ColonySetup {
  const solid = !isGas(config) && !busted;
  const R = globeRadius(config.radius);
  const { style, seed, climate } = config;
  let ground: ColonyGround | null = null;
  if (solid) {
    const sample = terrainSampler(R, seed, style, { noise: surfaceNoise(config, true), reliefScale: RELIEF_SCALE, seaFloor: style.sea !== null });
    const color = new THREE.Color();
    ground = { ground: (dir) => sample(dir, color), radius: R, sea: style.sea !== null };
  }
  return {
    seed,
    ground,
    world: { solid, lava: config.type === 'lava', climate: climate ?? null },
    tier: climate?.habitability ?? 0,
    peak: solid ? peakRadius(R, style, RELIEF_SCALE) : R,
    gravity: climate?.gravity ?? 1,
    temperature: climate?.temperature ?? 288,
  };
}
