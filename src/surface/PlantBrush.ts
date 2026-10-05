import * as THREE from 'three';
import type { Puff } from '../cargo/CargoFx';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { PlantSpecies } from '../gen/plants';
import { Rng } from '../gen/rng';
import { HULL_DEPTH, type Obstacles } from '../planet/ground';
import { PlantShaker, plantShakeParams } from './plantShake';

/** What the brush follows: the ship as drawn (in the body frame, round the planet's centre) and how fast it goes. */
export interface Brusher {
  readonly object: THREE.Object3D;
  readonly speed: number;
}

/** Where the leaves go: a `ParticlePool` (in the scene, sizes in world units). */
export interface LeafParticles {
  readonly live: number;
  emit(p: Puff): void;
  setView(viewHeight: number, fov: number): void;
  update(dt: number): void;
  dispose(): void;
}

/** How much a plant is pushed away from the hull's axis, beside being pushed along the ship's course. */
const AWAY = 0.5;
/** Further than this in a frame (units) and the ship was put somewhere else, not flown there: nothing on the way is touched. */
const JUMP = 30;

/** The leaves knocked off a plant the hull hits (debug folder `Plant shake`). Sizes and speeds in planet units. */
export const leafParams = {
  /** Leaves knocked off a plant the ship hangs still in... */
  count: 1,
  /** ...plus this many per unit of the ship's speed... */
  perSpeed: 0.15,
  /** ...up to this. */
  maxCount: 14,
  size: 0.6,
  /** Seconds a leaf lives (shortest, longest). */
  life: [1.4, 2.6] as [number, number],
  /** Share of the ship's velocity a leaf is thrown with, and how fast it is flung out besides. */
  carry: 0.45,
  fling: 2.5,
  /** How fast it falls (units/s²) and the share of its speed the air takes per second. */
  fall: 2.5,
  drag: 1.4,
  /** Share of the bits that are twigs (the trunk's colour) instead of leaves. */
  twigs: 0.15,
};

/**
 * The ship flying through plants: every frame, the plants its hull went
 * through since the last one (`Obstacles.touchAlong` over the arc it covered,
 * so none is skipped at speed) are shaken (`PlantShaker`), pushed along its
 * course and away from it, harder the faster it goes, and each shake knocks a
 * burst of leaves (and a twig or two) out of the crown where the hull went in,
 * thrown along with the ship, fluttering down. Hanging still in a tree
 * rustles it gently and drops a leaf now and then. After the ship and the plants.
 */
export class PlantBrush implements Entity {
  private readonly shaker = new PlantShaker();
  private readonly canvas = typeof document === 'undefined' ? null : document.querySelector('canvas');
  /** Cosmetic scatter: a fixed seed, so a run looks the same every time. */
  private readonly rng = new Rng(0x1eaf);
  private readonly last = new THREE.Vector3();
  private readonly now = new THREE.Vector3();
  private readonly course = new THREE.Vector3();
  private readonly push = new THREE.Vector3();
  private readonly away = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly across = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly colors = new Map<string, THREE.Color>();
  private readonly puff: Puff = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    life: 1,
    size: 1,
    endSize: 1,
    color: new THREE.Color(),
    alpha: 1,
    lift: 0,
    up: new THREE.Vector3(),
    drag: 1,
  };
  private started = false;
  private strength = 0;
  private radius = 0;
  private speed = 0;
  private readonly visit = (x: number, y: number, z: number, crown: number, top: number, species: PlantSpecies): void => {
    const { now, push } = this;
    // Away from the hull's axis, along the ground there.
    this.away.set(x, y, z).sub(now);
    const length = this.away.length();
    if (length > 1e-9) this.away.multiplyScalar(AWAY / length);
    push.copy(this.course).add(this.away);
    // Tangent where the plant stands.
    const dot = push.x * x + push.y * y + push.z * z;
    push.set(push.x - dot * x, push.y - dot * y, push.z - dot * z);
    if (this.shaker.shake(x, y, z, push, this.strength)) this.knock(x, y, z, crown, top, species);
  };

  constructor(
    private readonly ship: Brusher,
    private readonly camera: THREE.PerspectiveCamera,
    /** Unit direction to the sun in the body frame: leaves are dim at night (the pool isn't lit). */
    private readonly sun: THREE.Vector3,
    /** What stands on the ground now (the planet's plants and those set down; they may be gone, once busted). */
    private readonly plants: () => readonly (Obstacles | null)[],
    /** The leaves knocked off (see `createLeafTexture`); it's the brush's to dispose of. */
    private readonly leaves: LeafParticles,
    debug: Debug,
  ) {
    const f = debug.folder('Plant shake');
    f?.add(plantShakeParams, 'strength', 0, 0.5);
    f?.add(plantShakeParams, 'perSpeed', 0, 0.02);
    f?.add(plantShakeParams, 'maxStrength', 0, 1);
    f?.add(plantShakeParams, 'decay', 0.05, 3);
    f?.add(plantShakeParams, 'swayRate', 1, 30);
    f?.add(plantShakeParams, 'flutterRate', 1, 60);
    f?.add(plantShakeParams, 'flutter', 0, 1);
    f?.add(plantShakeParams, 'retrigger', 0.05, 2);
    f?.add(leafParams, 'count', 0, 10, 1).name('leaves');
    f?.add(leafParams, 'perSpeed', 0, 0.5).name('leaves per speed');
    f?.add(leafParams, 'maxCount', 0, 40, 1).name('most leaves');
    f?.add(leafParams, 'size', 0.05, 2).name('leaf size');
    f?.add(leafParams, 'carry', 0, 1);
    f?.add(leafParams, 'fling', 0, 10);
    f?.add(leafParams, 'fall', 0, 10);
    f?.add(leafParams, 'drag', 0, 5);
  }

  /** Shakes going now. */
  get active(): number {
    return this.shaker.active;
  }

  /** Leaves in the air now. */
  get falling(): number {
    return this.leaves.live;
  }

  update(frameDt: number): void {
    const { now, last } = this;
    const radius = this.ship.object.position.length();
    if (radius > 1e-9) {
      now.copy(this.ship.object.position).divideScalar(radius);
      if (!this.started) last.copy(now);
      this.started = true;
      // Along the course it took since the last frame (none if it hangs still).
      this.course.subVectors(now, last);
      const moved = this.course.length();
      if (moved * radius > JUMP) last.copy(now);
      if (moved > 1e-9 && moved * radius <= JUMP) this.course.divideScalar(moved);
      else this.course.set(0, 0, 0);
      const p = plantShakeParams;
      this.speed = this.ship.speed;
      this.radius = radius;
      this.strength = Math.min(p.maxStrength, p.strength + p.perSpeed * this.speed);
      for (const plants of this.plants()) plants?.touchAlong(last, now, radius, this.visit);
      last.copy(now);
    }
    this.shaker.update(frameDt);
    this.leaves.setView(this.canvas?.height ?? 720, this.camera.fov);
    this.leaves.update(frameDt);
  }

  dispose(): void {
    // The uniforms are every plant material's: leave them still for whatever draws plants next.
    this.shaker.clear();
    this.leaves.dispose();
  }

  /** Knocks leaves out of the crown of the plant at unit direction (`x`, `y`, `z`) where the hull went in. */
  private knock(x: number, y: number, z: number, crown: number, top: number, species: PlantSpecies): void {
    const L = leafParams;
    const n = Math.min(L.maxCount, Math.round(L.count + L.perSpeed * this.speed));
    if (n <= 0) return;
    const { rng, puff } = this;
    const up = puff.up.set(x, y, z);
    // Across the ground there.
    this.side.set(Math.abs(y) < 0.9 ? 0 : 1, Math.abs(y) < 0.9 ? 1 : 0, 0).cross(up).normalize();
    this.across.crossVectors(up, this.side);
    // The crown's height, and the part of it the hull's underside reached.
    const height = species.crownRadius > 0 ? (species.height * crown) / species.crownRadius : top / 50;
    const low = Math.max(top - height * (1 - species.trunkShare), this.radius - HULL_DEPTH);
    const high = Math.max(low, top);
    // In daylight, dimmer at dusk and faint at night.
    const day = 0.15 + 0.85 * THREE.MathUtils.smoothstep(up.dot(this.sun), -0.15, 0.3);
    this.velocity.copy(this.course).multiplyScalar(this.speed * L.carry);
    // From the side the hull came in on.
    const toward = this.away.set(x, y, z).sub(this.now).normalize().negate();
    for (let k = 0; k < n; k++) {
      const a = rng.next() * Math.PI * 2;
      const r = crown * Math.sqrt(rng.next()) * 0.8;
      puff.position
        .copy(up)
        .multiplyScalar(low + (high - low) * rng.next())
        .addScaledVector(this.side, Math.cos(a) * r)
        .addScaledVector(this.across, Math.sin(a) * r)
        .addScaledVector(toward, crown * 0.3);
      const out = L.fling * (0.3 + 0.7 * rng.next());
      puff.velocity
        .copy(this.velocity)
        .addScaledVector(this.side, Math.cos(a) * out)
        .addScaledVector(this.across, Math.sin(a) * out)
        .addScaledVector(up, L.fling * 0.4 * rng.next());
      puff.life = L.life[0] + (L.life[1] - L.life[0]) * rng.next();
      const twig = rng.next() < L.twigs;
      puff.size = L.size * (twig ? 0.6 : 0.7 + 0.6 * rng.next());
      puff.endSize = puff.size * 0.8;
      (puff.color as THREE.Color)
        .copy(this.color(twig ? species.trunkColor : species.leafColor))
        .multiplyScalar(day * (0.8 + 0.4 * rng.next()));
      puff.alpha = 0.95;
      puff.lift = -L.fall;
      puff.drag = L.drag;
      this.leaves.emit(puff);
    }
  }

  private color(css: string): THREE.Color {
    let c = this.colors.get(css);
    if (!c) this.colors.set(css, (c = new THREE.Color(css)));
    return c;
  }
}

/**
 * A leaf for the particles: a pointed oval, tip to tip across the diagonal, in
 * white (the pool tints it), crisp but antialiased at its edge.
 */
export function createLeafTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 4);
  const half = size * 0.46;
  const width = size * 0.2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  ctx.quadraticCurveTo(0, -width * 2, half, 0);
  ctx.quadraticCurveTo(0, width * 2, -half, 0);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
