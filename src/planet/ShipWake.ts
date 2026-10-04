import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { ParticlePool, type Puff } from '../cargo/CargoFx';
import { AFTER_ATMOSPHERE_RENDER_ORDER } from '../world/atmosphereShell';
import { waveParams } from '../world/seaWaves';
import type { PlanetGlobe } from './PlanetGlobe';

/** Tunables of the spray the ship's downwash raises (debug: Sea waves sets how strong the downwash is). */
export const wakeParams = {
  /** Spray puffs a second at full strength. */
  rate: 70,
  /** How fast they're blown out (units/s) and thrown up. */
  out: 3.2,
  up: 1.4,
  /** How big (units) they start and end. */
  size: 0.7,
  endSize: 2.6,
  /** Opacity at the start. */
  alpha: 0.4,
};

/** Seconds a spray puff lasts. */
const LIFE = [0.9, 1.8] as const;
/** The spray falls back under this much gravity (units/s²; stylised). */
const FALL = 1.2;
/** The puffs' colour in full sun: a misty white, a touch of blue (stylised). */
const SPRAY = new THREE.Color(0.86, 0.9, 0.95);

/**
 * The ship's downwash on the water below it (low orbit and the lab's fly
 * camera): each frame tells the sea's waves (world/seaWaves.ts) where the ship
 * is over the water and how high, so they flatten a disc under it and send
 * ripples out, and throws spray from the disc's edge, blowing outward and
 * falling back, as many as the downwash is strong. Nothing over land, or on
 * seas without air. After the ship, so it reads where it's drawn this frame.
 */
export class ShipWake implements Entity {
  private readonly pool: ParticlePool;
  private readonly canvas = document.querySelector('canvas');
  private readonly local = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly across = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly puff: Puff = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    life: 1,
    size: 1,
    endSize: 1,
    color: new THREE.Color(),
    alpha: 1,
    lift: -FALL,
    up: new THREE.Vector3(),
    drag: 0.9,
  };
  /** Puffs owed (fractions carried over between frames). */
  private owed = 0;
  /** A cheap running hash for the spray's scatter (cosmetic: it needn't match any clock). */
  private hash = 0x9e3779b9;

  constructor(
    scene: THREE.Scene,
    private readonly globe: PlanetGlobe,
    private readonly ship: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly sun: THREE.Vector3,
  ) {
    this.pool = new ParticlePool(scene, false, AFTER_ATMOSPHERE_RENDER_ORDER);
  }

  /** How strong the downwash on the water is now (0 to 1). */
  get strength(): number {
    return this.globe.waves?.downwash ?? 0;
  }

  update(frameDt: number): void {
    const waves = this.globe.waves;
    if (!waves) return;
    const local = this.globe.object.worldToLocal(this.ship.getWorldPosition(this.local));
    const dir = this.dir.copy(local).normalize();
    const R = this.globe.radius;
    const over = this.globe.landingAt(dir) === 'sea';
    this.point.copy(dir).multiplyScalar(R);
    waves.setShip(over ? this.point : null, local.length() - R);

    const strength = waves.downwash;
    this.owed = strength > 0 ? this.owed + wakeParams.rate * strength * frameDt : 0;
    if (this.owed >= 1) this.spray(strength);
    this.pool.setView(this.canvas?.height ?? 720, this.camera.fov);
    this.pool.update(frameDt);
  }

  /** Throws the puffs owed from the downwash disc's edge, round the point under the ship. */
  private spray(strength: number): void {
    const up = this.dir;
    // Two directions across the water.
    this.side.set(Math.abs(up.y) < 0.9 ? 0 : 1, Math.abs(up.y) < 0.9 ? 1 : 0, 0).cross(up).normalize();
    this.across.crossVectors(up, this.side);
    // In daylight, dimmer at dusk and faint at night (the pool isn't lit).
    const day = THREE.MathUtils.smoothstep(up.dot(this.sun), -0.15, 0.3);
    this.color.copy(SPRAY).multiplyScalar(0.15 + 0.85 * day);
    const reach = 2 * waveParams.downwashReach;
    const p = this.puff;
    (p.color as THREE.Color).copy(this.color);
    p.up.copy(up);
    while (this.owed >= 1) {
      this.owed--;
      const a = this.random() * Math.PI * 2;
      const r = reach * (0.85 + 0.35 * this.random());
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      p.position
        .copy(this.point)
        .addScaledVector(this.side, ca * r)
        .addScaledVector(this.across, sa * r)
        .addScaledVector(up, 0.2);
      const out = wakeParams.out * (0.6 + 0.6 * this.random()) * (0.5 + 0.5 * strength);
      p.velocity
        .copy(this.side)
        .multiplyScalar(ca * out)
        .addScaledVector(this.across, sa * out)
        .addScaledVector(up, wakeParams.up * (0.5 + this.random()) * strength);
      p.life = LIFE[0] + (LIFE[1] - LIFE[0]) * this.random();
      p.size = wakeParams.size * (0.7 + 0.6 * this.random());
      p.endSize = wakeParams.endSize * (0.7 + 0.6 * this.random());
      p.alpha = wakeParams.alpha * (0.5 + 0.5 * strength);
      this.pool.emit(p);
    }
  }

  /** 0 to 1, from a xorshift (cosmetic scatter only). */
  private random(): number {
    let x = this.hash;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.hash = x >>> 0;
    return this.hash / 4294967296;
  }

  dispose(): void {
    this.globe.waves?.setShip(null, Infinity);
    this.pool.dispose();
  }
}
