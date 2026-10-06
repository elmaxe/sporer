import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { ParticlePool, type Puff } from '../cargo/CargoFx';
import { AFTER_ATMOSPHERE_RENDER_ORDER } from '../world/atmosphereShell';
import { lavaParams } from '../world/lavaMaterial';
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
  /** Over lava: embers a second at full strength, how fast they're flung out and up, and how big they are. */
  embers: 45,
  emberOut: 2.4,
  emberUp: 3.2,
  emberSize: 0.6,
};

/** Seconds a spray puff lasts. */
const LIFE = [0.9, 1.8] as const;
/** The spray falls back under this much gravity (units/s²; stylised). */
const FALL = 1.2;
/** The puffs' colour in full sun: a misty white, a touch of blue (stylised). */
const SPRAY = new THREE.Color(0.86, 0.9, 0.95);
/** Seconds an ember lasts, and the gravity it falls back under (units/s²; stylised). */
const EMBER_LIFE = [0.6, 1.3] as const;
const EMBER_FALL = 6;
/** Embers' colours, from yellow-hot to orange (additive: their own light). */
const EMBER_HOT = new THREE.Color(1, 0.75, 0.3);
const EMBER_COOL = new THREE.Color(1, 0.32, 0.05);

/**
 * The ship's downwash on the sea below it (low orbit and the lab's fly
 * camera). Over water, each frame tells the sea's waves (world/seaWaves.ts)
 * where the ship is and how high, so they flatten a disc under it and send
 * ripples out, and throws spray from the disc's edge, blowing outward and
 * falling back, as many as the downwash is strong; nothing on seas without
 * air. Over a lava sea (world/lavaMaterial.ts), it sweeps the crust aside
 * from a molten disc and flings embers from its rim; the UFO's drive presses
 * on the lava with or without air.
 * Nothing over land. After the ship, so it reads where it's drawn this frame.
 */
export class ShipWake implements Entity {
  /** The spray, or over lava the embers (glowing by their own light). */
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
    this.pool = new ParticlePool(scene, !!globe.lava, AFTER_ATMOSPHERE_RENDER_ORDER);
  }

  /** How strong the downwash on the water or lava is now (0 to 1). */
  get strength(): number {
    return this.globe.waves?.downwash ?? this.globe.lava?.downwash ?? 0;
  }

  /** Whether the globe has a sea the ship stirs. */
  static wanted(globe: PlanetGlobe): boolean {
    return !!(globe.waves || globe.lava);
  }

  update(frameDt: number): void {
    const { waves, lava } = this.globe;
    if (!waves && !lava) return;
    const local = this.globe.object.worldToLocal(this.ship.getWorldPosition(this.local));
    const dir = this.dir.copy(local).normalize();
    const R = this.globe.radius;
    const height = local.length() - R;
    const landing = this.globe.landingAt(dir);
    this.point.copy(dir).multiplyScalar(R);
    waves?.setShip(landing === 'sea' ? this.point : null, height);
    lava?.setShip(landing === 'lava' ? dir : null, height, R);

    const strength = this.strength;
    const rate = lava ? wakeParams.embers : wakeParams.rate;
    this.owed = strength > 0 ? this.owed + rate * strength * frameDt : 0;
    if (this.owed >= 1) {
      if (lava) this.fling(strength);
      else this.spray(strength);
    }
    this.pool.setView(this.canvas?.height ?? 720, this.camera.fov);
    this.pool.update(frameDt);
  }

  /** Two directions across the surface under the ship (`dir` is up there). */
  private tangents(): void {
    const up = this.dir;
    this.side.set(Math.abs(up.y) < 0.9 ? 0 : 1, Math.abs(up.y) < 0.9 ? 1 : 0, 0).cross(up).normalize();
    this.across.crossVectors(up, this.side);
  }

  /** Flings the embers owed from the swept disc's rim: spatter thrown out and up, falling back onto the lava. */
  private fling(strength: number): void {
    const up = this.dir;
    this.tangents();
    const reach = 2 * lavaParams.downwashReach;
    const p = this.puff;
    p.up.copy(up);
    p.lift = -EMBER_FALL;
    p.drag = 0.4;
    while (this.owed >= 1) {
      this.owed--;
      const a = this.random() * Math.PI * 2;
      const r = reach * (0.9 + 0.3 * this.random());
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      p.position
        .copy(this.point)
        .addScaledVector(this.side, ca * r)
        .addScaledVector(this.across, sa * r)
        .addScaledVector(up, 0.1);
      const out = wakeParams.emberOut * (0.5 + 0.8 * this.random()) * (0.5 + 0.5 * strength);
      p.velocity
        .copy(this.side)
        .multiplyScalar(ca * out)
        .addScaledVector(this.across, sa * out)
        .addScaledVector(up, wakeParams.emberUp * (0.4 + 0.8 * this.random()) * strength);
      p.life = EMBER_LIFE[0] + (EMBER_LIFE[1] - EMBER_LIFE[0]) * this.random();
      p.size = wakeParams.emberSize * (0.6 + 0.8 * this.random());
      p.endSize = p.size * 0.4;
      (p.color as THREE.Color).lerpColors(EMBER_HOT, EMBER_COOL, this.random());
      p.alpha = 0.6 + 0.4 * strength;
      this.pool.emit(p);
    }
  }

  /** Throws the puffs owed from the downwash disc's edge, round the point under the ship. */
  private spray(strength: number): void {
    const up = this.dir;
    // Two directions across the water.
    this.tangents();
    // In daylight, dimmer at dusk and faint at night (the pool isn't lit).
    const day = THREE.MathUtils.smoothstep(up.dot(this.sun), -0.15, 0.3);
    this.color.copy(SPRAY).multiplyScalar(0.15 + 0.85 * day);
    const reach = 2 * waveParams.downwashReach;
    const p = this.puff;
    (p.color as THREE.Color).copy(this.color);
    p.up.copy(up);
    p.lift = -FALL;
    p.drag = 0.9;
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
    this.globe.lava?.setShip(null, Infinity, this.globe.radius);
    this.pool.dispose();
  }
}
