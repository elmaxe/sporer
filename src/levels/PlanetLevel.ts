import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Input } from '../core/Input';
import { LocalMoons } from '../planet/LocalMoons';
import { PlanetFrame } from '../planet/PlanetFrame';
import { PlanetGlobe } from '../planet/PlanetGlobe';
import { PlanetHud } from '../planet/PlanetHud';
import { PlanetLights } from '../planet/PlanetLights';
import { PlanetPicker } from '../planet/PlanetPicker';
import { PlanetShip } from '../planet/PlanetShip';
import { OrbitCamera, type OrbitParams } from '../player/OrbitCamera';
import { distanceZoom, planetAltitude, planetPitch, planetZoomCurve } from '../player/zoomCurve';
import type { Planet } from '../world/Planet';
import { Level } from './Level';
import type { SystemLevel } from './SystemLevel';

/**
 * Low-orbit camera, in planet-level units (the globe's radius is 100). Its
 * zoom also sets the ship's altitude (see zoomCurve.ts): skimming the peaks
 * with the camera close behind at `minDistance`, high orbit with the whole
 * globe below at `maxDistance`.
 */
export const planetCameraParams: OrbitParams = {
  minDistance: 8,
  maxDistance: 300,
  zoomSpeed: 0.0025,
  rotateSpeed: 0.005,
  damping: 0.1,
};

/** Where the camera settles after descending (the ship ~14 above the peaks). */
export const PLANET_VIEW_DISTANCE = 45;
/** Bodies in the sky are drawn at least this many pixels in radius. */
const SKY_MIN_PIXELS = 1.5;
/** The sky camera's clipping range, in system units. */
const SKY_NEAR = 0.2;
const SKY_FAR = 20000;

/**
 * Low orbit over one planet or moon, in its own body frame and units (see
 * planet/frame.ts): the detailed globe, its moons, sunlight from the real
 * star direction, and the ship on a scripted orbit (no physics world).
 *
 * The rest of the system is the sky: each frame, the (inactive) system level
 * is posed at this level's clock and rendered from a camera at the matching
 * place and orientation in system space, then this scene is drawn over it.
 * So the star, other planets and moons are where they really are, at their
 * true angular size and lit with correct phases.
 */
export class PlanetLevel extends Level {
  readonly frame: PlanetFrame;
  readonly ship: PlanetShip;
  readonly orbit: OrbitCamera;
  private readonly moons: LocalMoons;
  private readonly hud: PlanetHud;
  /** Bodies drawn by this level, left out of the sky: the planet and its moons. */
  private readonly hidden: readonly Planet[];
  private readonly skyCamera = new THREE.PerspectiveCamera(65, 1, SKY_NEAR, SKY_FAR);
  private readonly start = new THREE.Vector3();

  constructor(
    private readonly system: SystemLevel,
    readonly body: Planet,
    /** System-space direction from the body where the player arrives (the side the ship was on). */
    side: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    input: Input,
    debug: Debug,
    /** Called when the player scrolls out past low orbit (back to the system). */
    onZoomOut: () => void,
  ) {
    super();
    this.frame = this.add(new PlanetFrame(body, system.world.time, debug));
    const globe = this.add(new PlanetGlobe(this.scene, body.config));
    this.moons = this.add(
      new LocalMoons(
        this.scene,
        this.frame,
        system.world.moons.filter((m) => m.parent === body),
      ),
    );
    this.hidden = [body, ...this.moons.moons];
    this.add(new PlanetLights(this.scene, this.frame, system.world.stars, globe.sun));

    this.frame.toLocalDirection(side, this.start);
    const z = debug.folder('Planet zoom');
    z?.add(planetZoomCurve, 'minAltitude', 0.5, 20);
    z?.add(planetZoomCurve, 'maxAltitude', 20, 300);
    z?.add(planetZoomCurve, 'minPitch', 5, 60);
    z?.add(planetZoomCurve, 'maxPitch', 10, 85);
    const arrival = distanceZoom(PLANET_VIEW_DISTANCE, planetCameraParams.minDistance, planetCameraParams.maxDistance);
    this.ship = this.add(new PlanetShip(this.scene, input, camera, debug, globe.top, planetAltitude(arrival), this.start));
    this.orbit = this.add(
      new OrbitCamera(
        camera,
        this.ship.object,
        input,
        planetCameraParams,
        {
          distance: PLANET_VIEW_DISTANCE,
          up: this.ship.up,
          // Stay above the ship's horizon, so the camera never dips into the ground.
          minPitch: THREE.MathUtils.degToRad(5),
          pitch: planetPitch(arrival),
          // Flatter down low, looking along the ground; more top-down higher up.
          pitchForZoom: (zoom) => planetPitch(zoom),
          onZoomPastLimit: (dir) => dir > 0 && onZoomOut(),
        },
        debug,
        'Planet camera',
      ),
    );
    // The zoom sets the altitude (after the camera has read the wheel; the ship glides there in its fixed steps).
    this.add({ update: () => this.ship.setAltitude(planetAltitude(this.orbit.zoom)), dispose: () => {} });
    this.add(new PlanetPicker(this.scene, camera, input, this.ship));
    this.hud = this.add(new PlanetHud(this.ship, `${body.name} · ${body.description}`));
  }

  /** System time here; the system level catches up to it on return. */
  get time(): number {
    return this.frame.time;
  }

  /** System-space direction from the body to the ship: the side to come back out on. */
  exitSide(out: THREE.Vector3): THREE.Vector3 {
    return this.frame.toSystemDirection(this.ship.direction, out);
  }

  /** What the sky shows, for tests: stars, bodies drawn in it, and moons drawn as meshes here. */
  get skyStats(): { stars: number; bodies: number; localMoons: number } {
    const world = this.system.world;
    return {
      stars: world.stars.length,
      bodies: world.planets.length + world.moons.length - this.hidden.length,
      localMoons: this.moons.moons.length,
    };
  }

  override render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    // The sky camera sits where this camera is, in system space, looking the same way.
    const sky = this.skyCamera;
    if (sky.fov !== camera.fov || sky.aspect !== camera.aspect) {
      sky.fov = camera.fov;
      sky.aspect = camera.aspect;
      sky.updateProjectionMatrix();
    }
    this.frame.toSystemPoint(camera.position, sky.position);
    sky.quaternion.multiplyQuaternions(this.frame.quaternion, camera.quaternion);
    sky.updateMatrixWorld();
    const pixelAngle = THREE.MathUtils.degToRad(camera.fov) / renderer.domElement.clientHeight;

    renderer.autoClear = false;
    renderer.clear();
    this.system.renderSky(renderer, sky, this.frame.renderTime, this.hidden, SKY_MIN_PIXELS * pixelAngle);
    // The planet is always in front of the sky (its own moons are in this scene).
    renderer.clearDepth();
    renderer.render(this.scene, camera);
    renderer.autoClear = true;
  }

  /**
   * Restarts the level's clock at system time `time` and puts the ship above
   * `side` (a system-space direction from the body), e.g. when the level was
   * built at the start of a zoom and takes over a moment later.
   */
  restart(time: number, side: THREE.Vector3): void {
    this.frame.restart(time);
    this.ship.placeAt(this.frame.toLocalDirection(side, this.start));
  }

  override enter(): void {
    this.hud.activate();
  }

  override exit(): void {
    this.hud.deactivate();
  }
}
