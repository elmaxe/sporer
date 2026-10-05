import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Obstacles } from '../planet/ground';
import { PlantShaker, plantShakeParams } from './plantShake';

/** What the brush follows: the ship as drawn (in the body frame, round the planet's centre) and how fast it goes. */
export interface Brusher {
  readonly object: THREE.Object3D;
  readonly speed: number;
}

/** How much a plant is pushed away from the hull's axis, beside being pushed along the ship's course. */
const AWAY = 0.5;
/** Further than this in a frame (units) and the ship was put somewhere else, not flown there: nothing on the way is touched. */
const JUMP = 30;

/**
 * The ship flying through plants: every frame, the plants its hull went
 * through since the last one (`Obstacles.touchAlong` over the arc it covered,
 * so none is skipped at speed) are shaken (`PlantShaker`), pushed along its
 * course and away from it, harder the faster it goes. Hanging still in a tree
 * rustles it gently. After the ship and the plants.
 */
export class PlantBrush implements Entity {
  private readonly shaker = new PlantShaker();
  private readonly last = new THREE.Vector3();
  private readonly now = new THREE.Vector3();
  private readonly course = new THREE.Vector3();
  private readonly push = new THREE.Vector3();
  private readonly away = new THREE.Vector3();
  private started = false;
  private strength = 0;
  private readonly visit = (x: number, y: number, z: number): void => {
    const { now, push } = this;
    // Away from the hull's axis, along the ground there.
    this.away.set(x, y, z).sub(now);
    const length = this.away.length();
    if (length > 1e-9) this.away.multiplyScalar(AWAY / length);
    push.copy(this.course).add(this.away);
    // Tangent where the plant stands.
    const dot = push.x * x + push.y * y + push.z * z;
    push.set(push.x - dot * x, push.y - dot * y, push.z - dot * z);
    this.shaker.shake(x, y, z, push, this.strength);
  };

  constructor(
    private readonly ship: Brusher,
    /** What stands on the ground now (the planet's plants and those set down; they may be gone, once busted). */
    private readonly plants: () => readonly (Obstacles | null)[],
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
  }

  /** Shakes going now. */
  get active(): number {
    return this.shaker.active;
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
      this.strength = Math.min(p.maxStrength, p.strength + p.perSpeed * this.ship.speed);
      for (const plants of this.plants()) plants?.touchAlong(last, now, radius, this.visit);
      last.copy(now);
    }
    this.shaker.update(frameDt);
  }

  dispose(): void {
    // The uniforms are every plant material's: leave them still for whatever draws plants next.
    this.shaker.clear();
  }
}
