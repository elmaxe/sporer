import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Input } from '../core/Input';
import { generateDust, type GalaxyData, type StarRef } from '../gen/galaxy';
import { GalaxyDust } from '../galaxy/GalaxyDust';
import { GalaxyHud } from '../galaxy/GalaxyHud';
import { GalaxyMap } from '../galaxy/GalaxyMap';
import { GalaxyPicker } from '../galaxy/GalaxyPicker';
import { GalaxyShip } from '../galaxy/GalaxyShip';
import { OrbitCamera, type OrbitParams } from '../player/OrbitCamera';
import type { Tooltip } from '../ui/Tooltip';
import { Level } from './Level';

/** Galaxy-scale camera: from a few stars around the ship out to the whole disc. */
export const galaxyCameraParams: OrbitParams = {
  minDistance: 8,
  maxDistance: 2600,
  zoomSpeed: 0.0025,
  rotateSpeed: 0.005,
  damping: 0.1,
};

/** Where the camera settles after zooming out of a system. */
export const GALAXY_VIEW_DISTANCE = 60;

/** The galaxy map in galaxy units. No physics: travel is scripted. */
export class GalaxyLevel extends Level {
  readonly ship: GalaxyShip;
  readonly orbit: OrbitCamera;
  private readonly hud: GalaxyHud;
  private readonly light: THREE.HemisphereLight;

  constructor(
    galaxy: GalaxyData,
    start: StarRef,
    camera: THREE.PerspectiveCamera,
    input: Input,
    canvas: HTMLElement,
    tooltip: Tooltip,
    debug: Debug,
    /** Called when the player scrolls in past the closest zoom (to enter a system). */
    onZoomIn: () => void,
  ) {
    super();
    // Only the UFO is lit; stars and glows are unlit.
    this.light = new THREE.HemisphereLight('#cfe3ff', '#302040', 2);
    this.scene.add(this.light);

    this.add(new GalaxyDust(this.scene, generateDust(galaxy), galaxy.radius));
    const map = this.add(new GalaxyMap(this.scene, galaxy));
    this.ship = this.add(new GalaxyShip(this.scene, start, debug));
    this.orbit = this.add(
      new OrbitCamera(
        camera,
        this.ship.object,
        input,
        galaxyCameraParams,
        { distance: GALAXY_VIEW_DISTANCE, onZoomPastLimit: (dir) => dir < 0 && onZoomIn() },
        debug,
        'Galaxy camera',
      ),
    );
    const picker = this.add(new GalaxyPicker(camera, input, canvas, galaxy, map.positions, this.ship));
    this.hud = this.add(new GalaxyHud(this.scene, camera, input, galaxy, this.ship, picker, tooltip));
  }

  override enter(): void {
    this.hud.activate();
  }

  override exit(): void {
    this.hud.deactivate();
  }

  override dispose(): void {
    super.dispose();
    this.scene.remove(this.light);
    this.light.dispose();
  }
}
