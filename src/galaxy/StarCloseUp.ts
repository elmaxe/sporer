import * as THREE from 'three';
import type { StarRef } from '../gen/galaxy';
import { orbitPosition } from '../gen/orbit';
import { hashSeed } from '../gen/rng';
import { starActivity } from '../gen/starActivity';
import type { SystemData } from '../gen/system';
import { createStarView, type StarView } from '../world/StarLook';

/**
 * The system's star(s) drawn in the galaxy, during the seamless zoom between
 * the two: at the star's place, turned by the system's galactic tilt and
 * scaled to `scale` galaxy units per system unit, with the same surface and
 * corona as in the system (`StarLook`, or a `BlackHoleLook`; same seeds and clock). So
 * the galaxy camera, at `scale` times the system camera's distance, sees
 * exactly what the system camera sees. Lives in the galaxy's rotating root.
 */
export class StarCloseUp {
  /** The system's frame in galaxy coordinates: its origin is the barycentre. */
  readonly object = new THREE.Group();
  private readonly looks: StarView[];

  constructor(
    private readonly parent: THREE.Object3D,
    ref: StarRef,
    private readonly system: SystemData,
    scale: number,
    /** The system clock, so the star looks as it does there. */
    private readonly clock: () => number,
  ) {
    const { x, y, z } = ref.position;
    this.object.position.set(x, y, z);
    const q = system.galacticTilt;
    this.object.quaternion.set(q.x, q.y, q.z, q.w);
    this.object.scale.setScalar(scale);
    this.looks = system.stars.map((star, i) => {
      // Seeded like the system's Star, so the surface matches.
      // A black hole bends nothing here (the galaxy is no baked sky): its shadow and disc only.
      const look = createStarView(star, starActivity(star), hashSeed(system.seed, 'star', i), null);
      this.object.add(look.object);
      return look;
    });
    parent.add(this.object);
    this.update();
  }

  /** Poses the star(s) at the system's current time. */
  update(): void {
    const time = this.clock();
    this.system.stars.forEach((star, i) => {
      const look = this.looks[i]!;
      orbitPosition(star.orbit, time, look.object.position);
      look.animate(time);
    });
  }

  /** Where each star is drawn, in the parent's (galaxy) coordinates; call after `update`. */
  memberPositions(out: THREE.Vector3[]): THREE.Vector3[] {
    this.object.updateMatrix();
    this.looks.forEach((look, i) => {
      out[i] = (out[i] ?? new THREE.Vector3()).copy(look.object.position).applyMatrix4(this.object.matrix);
    });
    out.length = this.looks.length;
    return out;
  }

  dispose(): void {
    this.parent.remove(this.object);
    for (const look of this.looks) look.dispose();
  }
}
