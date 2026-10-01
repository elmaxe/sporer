import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import type { Debug } from '../core/Debug';
import type { Input } from '../core/Input';
import { generateDistantGalaxies } from '../gen/distantGalaxies';
import { generateDust, type GalaxyData, type StarRef } from '../gen/galaxy';
import type { SystemData } from '../gen/system';
import { DistantGalaxies } from '../galaxy/DistantGalaxies';
import { GalaxyDust } from '../galaxy/GalaxyDust';
import { GalaxyNebulas } from '../galaxy/GalaxyNebulas';
import { GalaxyHud } from '../galaxy/GalaxyHud';
import { GalaxyMap } from '../galaxy/GalaxyMap';
import { GalaxyPicker } from '../galaxy/GalaxyPicker';
import { GalaxyShip } from '../galaxy/GalaxyShip';
import { GalaxySpin } from '../galaxy/GalaxySpin';
import { StarCloseUp } from '../galaxy/StarCloseUp';
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
 * ...no farther above or below the galactic plane than this (radians), so
 * it looks along the disc, not down into the dark between its stars (the
 * system camera looks down steeply on a ship hovering over a body).
 */
export const GALAXY_VIEW_ELEVATION = (35 * Math.PI) / 180;

/**
 * The galaxy map in galaxy units. No physics: travel is scripted. The galaxy
 * (stars, glows, dust and the ship) lives in `root`, which turns slowly
 * (`GalaxySpin`); other galaxies fill the sky behind it and stay put.
 * While zooming into or out of a system, the ship dives into its star and a
 * close-up of the system's star(s) takes over from the star's dot.
 */
export class GalaxyLevel extends Level {
  /** The rotating galaxy; its local frame is galaxy coordinates (StarRef positions). */
  readonly root = new THREE.Group();
  readonly ship: GalaxyShip;
  readonly orbit: OrbitCamera;
  readonly map: GalaxyMap;
  readonly spin: GalaxySpin;
  readonly distantGalaxies: DistantGalaxies;
  readonly nebulas: GalaxyNebulas;
  private readonly hud: GalaxyHud;
  private readonly light: THREE.HemisphereLight;
  private closeUp: StarCloseUp | null = null;
  private readonly tilt = new THREE.Quaternion();

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
    this.nebulas = this.add(new GalaxyNebulas(this.scene, this.root, galaxy.nebulas, galaxy.radius, debug));
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
          // Zoom freely mid-jump, but enter the system only once there.
          zoomLimitsHold: () => this.ship.travelling,
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

  /**
   * Shows the star(s) of `system` (the ship's current star) up close, `scale`
   * galaxy units per system unit, animated by the system's `clock` and
   * seen at its eye `adaptation`.
   */
  showCloseUp(system: SystemData, scale: number, clock: () => number, adaptation: () => number): void {
    this.hideCloseUp();
    this.closeUp = new StarCloseUp(this.root, this.ship.current, system, scale, clock, adaptation);
  }

  hideCloseUp(): void {
    this.closeUp?.dispose();
    this.closeUp = null;
  }

  /**
   * How far the ship has dived into its current star, 0–1: the ship sinks in
   * (at 1 it's at the star's centre, so the camera looks at the star) and
   * shrinks, the star's dot fades (the close-up takes over), and the rings
   * are hidden.
   */
  setDive(u: number): void {
    this.ship.setDive(u);
    this.map.fade(this.ship.current, u);
    this.hud.hideMarkers = u > 0;
  }

  /** Rotation from `system`'s space into world (scene) space: its galactic tilt, turned with the galaxy. */
  systemRotation(system: SystemData, out: THREE.Quaternion): THREE.Quaternion {
    const q = system.galacticTilt;
    return out.copy(this.root.quaternion).multiply(this.tilt.set(q.x, q.y, q.z, q.w));
  }

  override update(frameDt: number, alpha: number): void {
    super.update(frameDt, alpha);
    this.closeUp?.update();
  }

  /** The nebulas first, at low resolution; the scene lays them over the glow behind them. */
  override render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    this.nebulas.renderVolumes(renderer, camera);
    super.render(renderer, camera);
  }

  override enter(): void {
    this.hud.activate();
  }

  override exit(): void {
    this.hud.deactivate();
  }

  override dispose(): void {
    this.hideCloseUp();
    super.dispose();
    this.scene.remove(this.root);
    this.scene.remove(this.light);
    this.light.dispose();
  }
}
