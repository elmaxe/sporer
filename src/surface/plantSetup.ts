import * as THREE from 'three';
import { detailedTerrain } from '../gen/noise';
import { growsPlants, planPlants, type GroundRadius, type PlantPlan } from '../gen/plants';
import { RELIEF_SCALE, globeRadius } from '../planet/frame';
import { isGas, type PlanetConfig } from '../world/Planet';
import { peakRadius, terrainSampler } from '../world/planetGeometry';

/** A body's plants and the ground they stand on. */
export interface PlantSetup {
  readonly plan: PlantPlan;
  readonly ground: GroundRadius;
}

/**
 * The plants of a body as the planet level draws it: its habitability tier
 * and climate give the species (gen/plants.ts), and the ground is the same
 * terrain the globe is sampled from. Null for gas giants and bodies where
 * nothing grows (tier 0).
 */
export function plantSetup(config: PlanetConfig): PlantSetup | null {
  if (isGas(config) || !config.climate || !growsPlants(config.climate)) return null;
  const R = globeRadius(config.radius);
  const { style, seed, climate } = config;
  const plan = planPlants({
    seed,
    tier: climate.habitability,
    temperature: climate.temperature,
    water: climate.water,
    radius: R,
    peak: peakRadius(R, style, RELIEF_SCALE),
  });
  if (!plan) return null;
  const sample = terrainSampler(R, seed, style, { noise: detailedTerrain, reliefScale: RELIEF_SCALE, seaFloor: style.sea !== null });
  const color = new THREE.Color();
  return { plan, ground: (dir) => sample(dir, color) };
}
