import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Physics } from '../physics/Physics';
import { renderScene } from '../world/wireframe';

/** 'space': boost and map (the ship only flies where you tap); 'surface': stick, boost and map; 'none': just gestures. */
export type TouchShipControls = 'none' | 'surface' | 'space';

/** What a third-person overview camera takes in (see world/thirdPerson.ts), in the level's units. */
export interface Overview {
  readonly centre: THREE.Vector3;
  /** How far round the centre the overview reaches at its first zoom. */
  radius: number;
  /** How close to the centre it may come (outside a globe). */
  minDistance: number;
}

/**
 * One scale of the game (galaxy, system, later planet): its own scene,
 * entities and optional physics world, at units that suit that scale.
 * Only the active level is stepped and rendered (see Game / SceneManager).
 */
export class Level {
  readonly scene = new THREE.Scene();
  /** Which on-screen ship controls a touch player gets here (see TouchControls). */
  readonly touchControls: TouchShipControls = 'none';
  /**
   * True while a level transition drives the camera: its distance then
   * doesn't move the ship (normally the zoom sets how far the ship is from
   * what it's at, see player/zoomCurve.ts).
   */
  zoomLocked = false;
  private readonly entities: Entity[] = [];

  constructor(readonly physics: Physics | null = null) {}

  add<T extends Entity>(entity: T): T {
    this.entities.push(entity);
    return entity;
  }

  /** Entities to take out once the current step or update is over. */
  private readonly removals: Entity[] = [];

  /** Takes an entity out of the level and disposes it (at the end of the current step or update, so it's safe from one). */
  remove(entity: Entity): void {
    if (this.entities.includes(entity) && !this.removals.includes(entity)) this.removals.push(entity);
  }

  private flushRemovals(): void {
    for (const e of this.removals) {
      this.entities.splice(this.entities.indexOf(e), 1);
      e.dispose();
    }
    this.removals.length = 0;
  }

  /** One fixed step: fixedUpdate → physics.step → afterPhysics. */
  fixedStep(dt: number): void {
    for (const e of this.entities) e.fixedUpdate?.(dt);
    this.physics?.step();
    for (const e of this.entities) e.afterPhysics?.();
    this.flushRemovals();
  }

  update(frameDt: number, alpha: number): void {
    for (const e of this.entities) e.update?.(frameDt, alpha);
    this.flushRemovals();
  }

  /** Draws the level; the default renders its scene (as a wireframe with the menu's switch, see renderScene). */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    renderScene(renderer, this.scene, camera);
  }

  /**
   * What the debug third-person view (ui/ThirdPersonControl.ts) overlooks:
   * the whole planet, system or galaxy. Writes into `out`. The default takes
   * in a sphere round the scene's origin as big as the camera's range.
   */
  overview(out: Overview): Overview {
    out.centre.set(0, 0, 0);
    out.radius = 1000;
    out.minDistance = 0;
    return out;
  }

  /** Called when the level becomes active (e.g. to write its HUD text). */
  enter(): void {}

  /** Called when another level takes over. The level keeps its state. */
  exit(): void {}

  dispose(): void {
    this.removals.length = 0;
    for (const e of this.entities) e.dispose();
    this.entities.length = 0;
    this.physics?.dispose();
  }
}
