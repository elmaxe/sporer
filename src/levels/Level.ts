import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Physics } from '../physics/Physics';

/**
 * One scale of the game (galaxy, system, later planet): its own scene,
 * entities and optional physics world, at units that suit that scale.
 * Only the active level is stepped and rendered (see Game / SceneManager).
 */
export class Level {
  readonly scene = new THREE.Scene();
  private readonly entities: Entity[] = [];

  constructor(readonly physics: Physics | null = null) {}

  add<T extends Entity>(entity: T): T {
    this.entities.push(entity);
    return entity;
  }

  /** One fixed step: fixedUpdate → physics.step → afterPhysics. */
  fixedStep(dt: number): void {
    for (const e of this.entities) e.fixedUpdate?.(dt);
    this.physics?.step();
    for (const e of this.entities) e.afterPhysics?.();
  }

  update(frameDt: number, alpha: number): void {
    for (const e of this.entities) e.update?.(frameDt, alpha);
  }

  /** Draws the level; the default renders its scene. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    renderer.render(this.scene, camera);
  }

  /** Called when the level becomes active (e.g. to write its HUD text). */
  enter(): void {}

  /** Called when another level takes over. The level keeps its state. */
  exit(): void {}

  dispose(): void {
    for (const e of this.entities) e.dispose();
    this.entities.length = 0;
    this.physics?.dispose();
  }
}
