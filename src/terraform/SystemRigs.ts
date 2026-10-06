import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { starLightColor } from '../gen/stars';
import type { Planet } from '../world/Planet';
import type { StarSystem } from '../world/StarSystem';
import { LightRig } from './LightRig';
import type { Installations } from './light';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The mirrors and sunshades over the current system's bodies, in the system
 * view (a system-level entity, after the camera; the SceneManager says what
 * each body has, `set`). Each body's LightRig is a child of the body's
 * object, so it moves with it and is hidden with it (the low-orbit sky
 * leaves the visited body out: low orbit draws its own). Unfolding and
 * folding follow the game clock.
 */
export class SystemRigs implements Entity {
  private readonly rigs = new Map<Planet, { rig: LightRig; inst: Installations }>();
  private readonly sun = new THREE.Vector3();

  constructor(
    private readonly world: StarSystem,
    private readonly camera: THREE.Camera,
    /** The game clock the logs run on, s. */
    private readonly clock: () => number,
  ) {}

  /** What stays over `body` (null or nothing up: no rig). */
  set(body: Planet, inst: Installations | null): void {
    const has = inst !== null && (inst.slots.length > 0 || inst.shadeShown > 0.001 || inst.shade > 0);
    const entry = this.rigs.get(body);
    if (!has) {
      if (entry) {
        entry.rig.dispose();
        this.rigs.delete(body);
      }
      return;
    }
    if (entry) {
      entry.inst = inst;
      return;
    }
    const star = this.world.stars[0];
    const rig = new LightRig(body.config.radius, star ? starLightColor(star.data) : '#dfe6ff');
    body.object.add(rig.object);
    this.rigs.set(body, { rig, inst });
  }

  /** How many bodies have something up (for tests). */
  get count(): number {
    return this.rigs.size;
  }

  update(): void {
    const time = this.clock();
    for (const [body, { rig, inst }] of this.rigs) {
      rig.object.visible = !body.busted;
      if (body.busted) continue;
      const star = this.world.stars[0];
      if (star) this.sun.subVectors(star.position, body.position);
      else this.sun.copy(this.world.galacticCentre ?? UP);
      rig.pose(this.sun, UP, inst, time, null, this.camera);
    }
  }

  dispose(): void {
    for (const { rig } of this.rigs.values()) rig.dispose();
    this.rigs.clear();
  }
}
