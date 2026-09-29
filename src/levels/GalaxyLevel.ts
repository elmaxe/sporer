import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import type { Debug } from '../core/Debug';
import type { Input } from '../core/Input';
import { generateDistantGalaxies } from '../gen/distantGalaxies';
import { generateDust, type GalaxyData, type StarRef } from '../gen/galaxy';
import { DistantGalaxies } from '../galaxy/DistantGalaxies';
import { GalaxyDust } from '../galaxy/GalaxyDust';
import { GalaxyHud } from '../galaxy/GalaxyHud';
import { GalaxyMap } from '../galaxy/GalaxyMap';
import { GalaxyPicker } from '../galaxy/GalaxyPicker';
import { GalaxyShip } from '../galaxy/GalaxyShip';
import { GalaxySpin } from '../galaxy/GalaxySpin';
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

/**
 * The galaxy map in galaxy units. No physics: travel is scripted. The galaxy
 * (stars, glows, dust and the ship) lives in `root`, which turns slowly
 * (`GalaxySpin`); other galaxies fill the sky behind it and stay put.
 */
export class GalaxyLevel extends Level {
  /** The rotating galaxy; its local frame is galaxy coordinates (StarRef positions). */
  readonly root = new THREE.Group();
  readonly ship: GalaxyShip;
  readonly orbit: OrbitCamera;
  readonly map: GalaxyMap;
  readonly spin: GalaxySpin;
  readonly distantGalaxies: DistantGalaxies;
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
    sfx: SoundEffects,
    /** Called when the player scrolls in past the closest zoom (to enter a system). */
    onZoomIn: () => void,
  ) {
    super();
    // Only the UFO is lit; stars and glows are unlit.
    this.light = new THREE.HemisphereLight('#cfe3ff', '#302040', 2);
    this.scene.add(this.light);
    this.scene.add(this.root);

    // First, so everything below sees this frame's rotation.
    this.spin = this.add(new GalaxySpin(this.root, debug));
    this.distantGalaxies = this.add(new DistantGalaxies(this.scene, generateDistantGalaxies(galaxy.seed), debug));
    this.add(new GalaxyDust(this.root, generateDust(galaxy), galaxy.radius));
    this.map = this.add(new GalaxyMap(this.root, galaxy, debug));
    this.ship = this.add(new GalaxyShip(this.root, start, debug, sfx));
    this.orbit = this.add(
      new OrbitCamera(
        camera,
        this.ship.object,
        input,
        galaxyCameraParams,
        {
          distance: GALAXY_VIEW_DISTANCE,
          onZoomPastLimit: (dir) => dir < 0 && onZoomIn(),
          // Scrolling in mid-jump zooms into the destination once there.
          holdZoomIn: () => this.ship.travelling,
        },
        debug,
        'Galaxy camera',
      ),
    );
    const picker = this.add(new GalaxyPicker(camera, input, canvas, galaxy, this.map.positions, this.ship, this.root));
    this.hud = this.add(
      new GalaxyHud(this.scene, camera, input, galaxy, this.ship, picker, tooltip, this.map, this.root),
    );
  }

  override enter(): void {
    this.hud.activate();
  }

  override exit(): void {
    this.hud.deactivate();
  }

  override dispose(): void {
    super.dispose();
    this.scene.remove(this.root);
    this.scene.remove(this.light);
    this.light.dispose();
  }
}
