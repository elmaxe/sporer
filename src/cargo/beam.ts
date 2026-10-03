import * as THREE from 'three';
import { bodyMass, earthRadii } from '../gen/climate';
import { MIN_ARC_GRAVITY } from '../gen/lavaActivity';
import type { PlanetConfig } from '../world/Planet';

/*
 * The cargo beam's motion, pure: how fast things go up and down the beam,
 * how they shrink on the way up (so a tree fits in the UFO) and grow back on
 * the way down, and how they fall when let go: on from where they were going,
 * pulled down by the body's gravity. Stylised, in planet-level units (the UFO
 * is ~4 wide, a tree 6–14 tall).
 */

export const beamParams = {
  /** Farthest the beam reaches from the ship, planet units. */
  range: 70,
  /** Units per second along the beam, up and down. */
  speed: 9,
  /** Shortest time a trip up or down the beam takes, s. */
  minTime: 0.9,
  /** How tall something is when it reaches the ship (its full height shrinks to this). */
  carriedHeight: 1.2,
  /**
   * Falling: acceleration at 1 g, units/s² (other bodies scale it as the
   * lava's and geysers' arcs do, see `fallGravity`), and fastest speed down.
   */
  gravity: 30,
  maxFallSpeed: 60,
  /** Something still in the air after this long (s) has drifted off into space. */
  maxFallTime: 20,
};

/** Seconds a trip along a beam `length` units long takes. */
export function tripTime(length: number, p = beamParams): number {
  return Math.max(p.minTime, length / p.speed);
}

/** Eased 0–1 position along the beam for trip progress `t` (0–1): it starts and ends gently. */
export function beamEase(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/** The scale something `height` tall (at scale 1) has at the ship: small enough to fit, never bigger than `full`. */
export function carriedScale(height: number, full: number, p = beamParams): number {
  return Math.min(full, p.carriedHeight / Math.max(height, 1e-6));
}

/** Its scale `t` (0 on the ground, 1 at the ship) of the way up: shrinking from `full` to `small` as it rises. */
export function beamScale(t: number, full: number, small: number): number {
  const u = Math.min(1, Math.max(0, t));
  return full + (small - full) * u;
}

/**
 * Falling acceleration on a body of surface gravity `g` (Earth = 1),
 * units/s²: as gen/lavaActivity.ts's arcs, √g with a floor, so weaker bodies
 * let things drop slower without a comet's taking minutes.
 */
export function fallGravity(g: number, p = beamParams): number {
  return p.gravity * Math.sqrt(Math.max(MIN_ARC_GRAVITY, g));
}

/**
 * A body's surface gravity in g: its climate's, or else from its size, as
 * gen/debris.ts works out escape velocities (giants are all gas, comets and
 * asteroids next to nothing).
 */
export function bodyGravity(body: Pick<PlanetConfig, 'type' | 'radius' | 'size' | 'climate'>): number {
  if (body.climate) return body.climate.gravity;
  const R = earthRadii(body.radius);
  const giant = body.size === 'gasGiant' || body.size === 'iceGiant';
  return bodyMass(R, !giant && body.type === 'ice', body.size === 'gasGiant') / R ** 2;
}

/** A falling thing: where it is (from the body's centre) and its velocity, units/s. */
export interface Fall {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
}

const fallUp = new THREE.Vector3();

/**
 * Steps a fall by `dt` seconds: it keeps its velocity, pulled towards the
 * body's centre at `gravity` (its speed down never past `maxFallSpeed`, its
 * speed across untouched). `ground` is the ground's radius in a direction.
 * Returns its height above the ground, 0 once it has hit it (put on the ground).
 */
export function stepFall(f: Fall, gravity: number, ground: (dir: THREE.Vector3) => number, dt: number, p = beamParams): number {
  const { position, velocity } = f;
  fallUp.copy(position).normalize();
  velocity.addScaledVector(fallUp, -gravity * dt);
  const down = -velocity.dot(fallUp);
  if (down > p.maxFallSpeed) velocity.addScaledVector(fallUp, down - p.maxFallSpeed);
  position.addScaledVector(velocity, dt);
  fallUp.copy(position).normalize();
  const groundR = ground(fallUp);
  const height = position.length() - groundR;
  if (height > 0) return height;
  position.copy(fallUp).multiplyScalar(groundR);
  return 0;
}

/**
 * Its scale while falling from `startHeight` (where it was let go, at scale
 * `startScale`) with `height` still to go: growing back to `full` by the time it lands.
 */
export function fallScale(height: number, startHeight: number, startScale: number, full: number): number {
  if (startHeight <= 0) return full;
  const u = Math.min(1, Math.max(0, height / startHeight));
  return full + (startScale - full) * u;
}
