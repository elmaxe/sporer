import * as THREE from 'three';
import { FIXED_DT } from '../core/Game';
import type { Debug } from '../core/Debug';
import type { Input } from '../core/Input';
import type { StarRef } from '../gen/galaxy';
import { generateSystem, spawnDistance, type SystemData } from '../gen/system';
import { Physics } from '../physics/Physics';
import { OrbitCamera, cameraParams } from '../player/OrbitCamera';
import { Picker } from '../player/Picker';
import { Ship } from '../player/Ship';
import { TargetMarker } from '../player/TargetMarker';
import { Hud } from '../ui/Hud';
import type { Tooltip } from '../ui/Tooltip';
import type { CelestialBody } from '../world/CelestialBody';
import type { Planet } from '../world/Planet';
import { Starfield } from '../world/Starfield';
import { StarSystem } from '../world/StarSystem';
import { Level } from './Level';

/** Where the camera settles after flying in from the galaxy. */
export const ARRIVAL_DISTANCE = 90;
/** Scrolling in within this many standoff distances of a planet or moon descends to it. */
const APPROACH_STANDOFFS = 2;
/** Flying to within this distance of a planet or moon's surface also descends to it (the ship's radius is 2). */
const TOUCH_MARGIN = 3;

/**
 * A star system at system-scene units: the generated system, the player's
 * ship with its own physics world, orbit camera, picking and HUD. While the
 * player is down at a planet, the planet level draws this scene as its sky
 * (`renderSky`).
 */
export class SystemLevel extends Level {
  readonly data: SystemData;
  readonly world: StarSystem;
  readonly ship: Ship;
  readonly orbit: OrbitCamera;
  private readonly hud: Hud;
  private readonly starfield: Starfield;
  private readonly marker: TargetMarker;

  constructor(
    readonly ref: StarRef,
    camera: THREE.PerspectiveCamera,
    input: Input,
    tooltip: Tooltip,
    debug: Debug,
    /** Called when the player scrolls out past the system (to the galaxy). */
    onZoomOut: () => void,
    /** Called when the player scrolls in past the closest zoom (to descend to a planet). */
    onZoomIn: () => void,
  ) {
    const physics = Physics.create(FIXED_DT);
    super(physics);
    this.data = generateSystem(ref);

    this.starfield = this.add(new Starfield(this.scene, camera));
    this.world = this.add(new StarSystem(this.scene, physics, this.data));
    const spawn = new THREE.Vector3(0, 15, spawnDistance(this.data));
    this.ship = this.add(new Ship(this.scene, physics, input, camera, this.world.bodies, debug, spawn));
    // Visual-only entities below run in this order each frame: camera first, then what reads it.
    this.orbit = this.add(
      new OrbitCamera(
        camera,
        this.ship.object,
        input,
        cameraParams,
        { distance: 45, onZoomPastLimit: (dir) => (dir > 0 ? onZoomOut() : onZoomIn()) },
        debug,
        'System camera',
      ),
    );
    const picker = this.add(new Picker(camera, input, this.ship, this.world.bodies));
    this.marker = this.add(new TargetMarker(this.scene, camera, this.ship));
    this.hud = this.add(new Hud(this.ship, picker, input, this.data, tooltip));
  }

  /**
   * The planet or moon the ship is close enough to descend to: the one it's
   * parked at, else the nearest within a couple of standoff distances.
   */
  approachableBody(): Planet | null {
    const parked = this.ship.enRoute ? null : this.ship.targetBody;
    let best: Planet | null = null;
    let bestRatio = APPROACH_STANDOFFS;
    for (const bodies of [this.world.planets, this.world.moons]) {
      for (const body of bodies) {
        const ratio = this.standoffs(body);
        if (ratio > APPROACH_STANDOFFS) continue;
        if (body === parked) return body;
        if (ratio <= bestRatio) {
          best = body;
          bestRatio = ratio;
        }
      }
    }
    return best;
  }

  /** A planet or moon the ship is flying into (all but touching its surface), if any. */
  bodyInReach(): Planet | null {
    for (const body of this.world.planets) if (this.touching(body)) return body;
    for (const body of this.world.moons) if (this.touching(body)) return body;
    return null;
  }

  /**
   * Draws the system as seen from `camera` (in system units) at system time
   * `time`: the sky of the planet level. The player's ship and marker and the
   * `hidden` bodies (the planet being visited, drawn by that level) are left
   * out, and bodies smaller than `minAngle` are enlarged to it.
   */
  renderSky(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    time: number,
    hidden: readonly Planet[],
    minAngle: number,
  ): void {
    this.world.pose(time, camera.position, minAngle);
    this.starfield.centerOn(camera.position);
    this.ship.object.visible = false;
    this.marker.hide();
    for (const body of hidden) body.object.visible = false;
    renderer.render(this.scene, camera);
    for (const body of hidden) body.object.visible = true;
    this.ship.object.visible = true;
  }

  /** Distance from the ship to `body` in standoff distances (1 = parked beside it). */
  private standoffs(body: CelestialBody): number {
    return this.ship.object.position.distanceTo(body.renderPosition) / body.standoff;
  }

  private touching(body: Planet): boolean {
    return this.ship.object.position.distanceTo(body.renderPosition) < body.radius + TOUCH_MARGIN;
  }

  override enter(): void {
    this.hud.activate();
  }

  override exit(): void {
    this.hud.deactivate();
  }
}
