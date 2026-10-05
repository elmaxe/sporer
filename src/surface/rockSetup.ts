import * as THREE from 'three';
import { surfaceNoise } from '../gen/craters';
import { planRocks, type RockGround, type RockPlan } from '../gen/rocks';
import { RELIEF_SCALE, globeRadius } from '../planet/frame';
import { isGas, type PlanetConfig } from '../world/Planet';
import { terrainSampler } from '../world/planetGeometry';

/** A body's rocks and the ground they lie on. */
export interface RockSetup {
  readonly plan: RockPlan;
  readonly ground: RockGround;
}

/** How much of a rock's colour is the bare rock's (the style's high ground, greyed) rather than the ground's round it. */
const ROCK_TINT = 0.45;
/** How far its colour is greyed (rock is duller than soil and plants). */
const GREY = 0.45;

/**
 * The rocks of a body as the planet level draws it (gen/rocks.ts): lying on
 * the same terrain the globe is sampled from, coloured like the ground
 * round them blended with the body's bare rock. Null for gas giants.
 */
export function rockSetup(config: PlanetConfig): RockSetup | null {
  if (isGas(config)) return null;
  const R = globeRadius(config.radius);
  const { style, seed } = config;
  const small = config.shape != null;
  const plan = planRocks({ type: config.type, seed, small }, R, style.sea !== null && !small ? R : null);
  if (!plan) return null;
  const sample = terrainSampler(R, seed, style, {
    noise: surfaceNoise(config, true),
    reliefScale: RELIEF_SCALE,
    seaFloor: style.sea !== null,
    shape: config.shape,
  });
  const color = new THREE.Color();
  const rock = new THREE.Color(style.high);
  return {
    plan,
    ground: (dir, rgb) => {
      const r = sample(dir, color);
      if (rgb) {
        color.lerp(rock, ROCK_TINT);
        const grey = (color.r + color.g + color.b) / 3;
        rgb[0] = color.r + (grey - color.r) * GREY;
        rgb[1] = color.g + (grey - color.g) * GREY;
        rgb[2] = color.b + (grey - color.b) * GREY;
      }
      return r;
    },
  };
}
