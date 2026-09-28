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
import { Starfield } from '../world/Starfield';
import { StarSystem } from '../world/StarSystem';
import { Level } from './Level';

/** Where the camera settles after flying in from the galaxy. */
export const ARRIVAL_DISTANCE = 90;

/**
 * A star system at system-scene units: the generated system, the player's
 * ship with its own physics world, orbit camera, picking and HUD.
 */
export class SystemLevel extends Level {
  readonly data: SystemData;
  readonly world: StarSystem;
  readonly ship: Ship;
  readonly orbit: OrbitCamera;
  private readonly hud: Hud;

  constructor(
    readonly ref: StarRef,
    camera: THREE.PerspectiveCamera,
    input: Input,
    tooltip: Tooltip,
    debug: Debug,
    /** Called when the player scrolls out past the system (to the galaxy). */
    onZoomOut: () => void,
  ) {
    const physics = Physics.create(FIXED_DT);
    super(physics);
    this.data = generateSystem(ref);

    this.add(new Starfield(this.scene, camera));
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
        { distance: 45, onZoomPastLimit: (dir) => dir > 0 && onZoomOut() },
        debug,
        'System camera',
      ),
    );
    const picker = this.add(new Picker(camera, input, this.ship, this.world.bodies));
    this.add(new TargetMarker(this.scene, camera, this.ship));
    this.hud = this.add(new Hud(this.ship, picker, input, this.data, tooltip));
  }

  override enter(): void {
    this.hud.activate();
  }

  override exit(): void {
    this.hud.deactivate();
  }
}
