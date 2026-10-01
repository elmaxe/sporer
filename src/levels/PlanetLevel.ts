import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Input } from '../core/Input';
import { describeClimateDetail } from '../gen/climate';
import { cometActivity, describeNucleus } from '../gen/comets';
import { describeShape } from '../gen/shape';
import { keplerPosition, type KeplerOrbit } from '../gen/orbit';
import { GLOBE_SIZE_FACTOR } from '../gen/planets';
import { bodyLabLink } from '../lab/bodyLink';
import { describeGeysers, geyserActivity } from '../gen/geysers';
import { describeWeather } from '../gen/weather';
import { CometActivity } from '../planet/CometActivity';
import { Geysers } from '../planet/Geysers';
import { Weather } from '../planet/Weather';
import { LavaEruptions } from '../planet/LavaEruptions';
import { LocalMoons } from '../planet/LocalMoons';
import { PlanetFrame } from '../planet/PlanetFrame';
import { PlanetGlobe, RELIEF_SCALE } from '../planet/PlanetGlobe';
import { followWeight } from '../planet/ground';
import { PlanetHud } from '../planet/PlanetHud';
import { PlanetLights } from '../planet/PlanetLights';
import { PlanetMap } from '../planet/PlanetMap';
import { PlanetPicker } from '../planet/PlanetPicker';
import { PlanetShip } from '../planet/PlanetShip';
import { maxViewDistance, travelScale } from '../planet/frame';
import { OrbitCamera, type OrbitParams } from '../player/OrbitCamera';
import { flightAltitude, minPitchAt, zoomFraction } from '../player/zoomCurve';
import type { SurfaceChanges } from '../surface/changes';
import { PlantTooltip } from '../surface/PlantTooltip';
import { plantSetup } from '../surface/plantSetup';
import { SurfaceEntities } from '../surface/SurfaceEntities';
import type { Tooltip } from '../ui/Tooltip';
import { cometParams } from '../world/Comet';
import { galacticLightParams } from '../world/galacticLight';
import type { Planet } from '../world/Planet';
import { Level } from './Level';
import type { SystemLevel } from './SystemLevel';
import { renderScene } from '../world/wireframe';

/**
 * Low-orbit camera, in planet-level units (an Earth-sized globe's radius is
 * EARTH_GLOBE_RADIUS). The near end is next to the UFO; maxDistance (for
 * Earth-sized and bigger globes) takes in the globe, so it grows with them.
 */
export const planetCameraParams: OrbitParams = {
  minDistance: 8,
  maxDistance: 260 * GLOBE_SIZE_FACTOR,
  zoomSpeed: 0.0025,
  rotateSpeed: 0.005,
  damping: 0.1,
};

/** Where the camera settles after descending. */
export const PLANET_VIEW_DISTANCE = 45;
/** The camera keeps this far above the terrain beneath it (planet units; the ship's lowest altitude is 3). */
const CAMERA_CLEARANCE = 1.5;
/** Over a small body the camera pulls back at most this many of its radii (its longest reach) from the ship. */
export const SMALL_BODY_VIEW_RADII = 6;
/** Seconds back along a comet's orbit to find the way it's going. */
const COMET_MOTION_DT = 0.25;
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
  override readonly touchControls = 'surface';
  readonly frame: PlanetFrame;
  readonly ship: PlanetShip;
  readonly orbit: OrbitCamera;
  /** The globe's sea-level radius in planet-level units: the body's true size (see planet/frame.ts). */
  readonly radius: number;
  private readonly moons: LocalMoons;
  /** Lava worlds and moons only. */
  readonly eruptions: LavaEruptions | null;
  /** Bodies with geothermal activity only (see gen/geysers.ts). */
  readonly geysers: Geysers | null;
  /** Bodies with weather only: rain, lightning bolts and their light (the clouds are the globe's). */
  readonly weather: Weather | null;
  /** Comets only: their jets, coma and tails, as active as the comet is close to the star. */
  readonly comet: CometActivity | null;
  /** A comet's orbit, which bends its dust tail back. */
  private readonly cometOrbit: KeplerOrbit | null;
  private readonly before = new THREE.Vector3();
  private readonly now = new THREE.Vector3();
  /** Habitable bodies (T1 and up) only: plants standing on the ground (see gen/plants.ts). */
  readonly plants: SurfaceEntities | null;
  private readonly plantTooltip: PlantTooltip | null;
  private readonly globe: PlanetGlobe;
  private readonly hud: PlanetHud;
  /** The Equal Earth map in the corner (mouse players). */
  readonly map: PlanetMap;
  /** Bodies drawn by this level, left out of the sky: the planet and its moons. */
  private readonly hidden: readonly Planet[];
  private readonly skyCamera = new THREE.PerspectiveCamera(65, 1, SKY_NEAR, SKY_FAR);
  private readonly start = new THREE.Vector3();
  private readonly cameraDir = new THREE.Vector3();
  private readonly cameraParams: OrbitParams;
  /** Radius of the highest terrain: the ship's altitude is measured from it. */
  private readonly top: number;

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
    /** What has been done to this body's surface entities, kept by the scene manager across visits. */
    changes: SurfaceChanges,
    /** Shows the plant under the pointer. */
    tooltip: Tooltip,
  ) {
    super();
    this.frame = this.add(new PlanetFrame(body, system.world.time, debug));
    const globe = (this.globe = this.add(new PlanetGlobe(this.scene, body.config, this.frame, camera, debug)));
    this.eruptions = globe.lava
      ? this.add(new LavaEruptions(this.scene, this.frame, globe.lava.activity, body.config.seed, body.config.style.sea!, debug))
      : null;
    const { config } = body;
    // Its activity follows the same 1/r² from the star as the tails in the sky (and is off far out).
    const activity = () => cometActivity(this.frame.center.length(), system.data.habitableRadius, cometParams.activeDistance);
    const comet = config.small === 'comet' && config.shape ? system.world.comets.find((c) => c.nucleus === body) : undefined;
    this.cometOrbit = comet?.data.orbit ?? null;
    this.comet =
      comet && config.shape
        ? this.add(
            new CometActivity(
              this.scene,
              this.frame,
              config.seed,
              config.shape,
              globe.radius,
              globe.groundHeight,
              globe.sun,
              globe.sunLight,
              globe.ambientLight,
              activity,
              { ion: comet.data.ionColor, dust: comet.data.dustColor },
              debug,
            ),
          )
        : null;
    const geysers = geyserActivity({ ...config, moon: body.parent !== null }, globe.radius, RELIEF_SCALE);
    this.geysers = geysers
      ? this.add(new Geysers(this.scene, this.frame, geysers, config.seed, globe.sun, globe.sunLight, globe.ambientLight, debug))
      : null;
    this.moons = this.add(
      new LocalMoons(
        this.scene,
        this.frame,
        system.world.moons.filter((m) => m.parent === body),
        globe.sun,
      ),
    );
    this.hidden = [body, ...this.moons.moons];
    this.add(
      new PlanetLights(
        this.scene,
        this.frame,
        system.world.stars,
        globe.sun,
        globe.sunLight,
        globe.ambientLight,
        system.world.galacticCentre,
      ),
    );

    this.frame.toLocalDirection(side, this.start);
    this.radius = globe.radius;
    this.top = globe.top;
    // A small body is framed by its own size (the usual minimum would leave a comet a speck).
    const small = config.shape ? SMALL_BODY_VIEW_RADII * globe.radius : undefined;
    this.cameraParams = { ...planetCameraParams, maxDistance: maxViewDistance(globe.radius, planetCameraParams.maxDistance, small) };
    this.ship = this.add(
      new PlanetShip(this.scene, input, camera, debug, this.flyingRadius(PLANET_VIEW_DISTANCE), this.start, travelScale(globe.radius), {
        height: globe.groundHeight,
        top: globe.top,
      }),
    );
    this.setFlight(PLANET_VIEW_DISTANCE);
    this.ship.placeAt(this.start);
    this.orbit = this.add(
      new OrbitCamera(
        camera,
        this.ship.object,
        input,
        this.cameraParams,
        {
          distance: PLANET_VIEW_DISTANCE,
          up: this.ship.up,
          // Never inside the globe, whatever the zoom transitions do: above the highest terrain.
          keepOut: (position) => this.keepAboveTerrain(position),
          // Stay above the ship's horizon, so the camera never dips into the ground.
          minPitch: THREE.MathUtils.degToRad(5),
          pitch: THREE.MathUtils.degToRad(40),
          onZoomPastLimit: (dir) => dir > 0 && onZoomOut(),
        },
        debug,
        'Planet camera',
      ),
    );
    // After the camera: the bolts face this frame's view.
    this.weather = globe.weather
      ? this.add(
          new Weather(this.scene, this.frame, globe.weather, config, camera, globe.sun, globe.sunLight, globe.ambientLight, debug),
        )
      : null;
    const plantsSetup = plantSetup(config);
    this.plants = plantsSetup ? this.add(new SurfaceEntities(this.scene, plantsSetup.plan, plantsSetup.ground, camera, changes, debug)) : null;
    this.plantTooltip = this.plants
      ? this.add(new PlantTooltip(camera, input, this.plants, tooltip, (ray, out) => globe.groundHit(ray, out)))
      : null;
    this.add(new PlanetPicker(this.scene, camera, input, this.ship, (ray, out) => globe.groundHit(ray, out), globe.groundHeight));
    const { climate } = config;
    const weatherLine = globe.weather ? describeWeather(globe.weather.data) : '';
    const detail = climate
      ? describeClimateDetail(climate) + (geysers ? ` · ${describeGeysers(geysers.kind)}` : '') + (weatherLine ? ` · ${weatherLine}` : '')
      : config.small === 'comet' && config.shape
        ? describeNucleus(config.shape, activity())
        : config.shape
          ? describeShape(config.shape)
          : null;
    this.hud = this.add(new PlanetHud(this.ship, `${body.name} · ${body.description}`, input, detail));
    this.map = this.add(new PlanetMap(config, body.name, this.ship, globe, input, debug));
    debug
      .folder('Planet lab')
      ?.add({ open: () => window.open(this.labLink(), '_blank') }, 'open')
      .name('Open this planet in the lab');
  }

  /** The ground's radius (terrain as drawn, or the sea) in unit direction `dir` of the body frame. */
  groundRadius(dir: THREE.Vector3): number {
    return this.globe.groundRadius(dir);
  }

  /** A link to this planet (or moon, or planet with its moons) in the planet lab (lab.html). */
  labLink(): string {
    return bodyLabLink(this.body);
  }

  /** The ship's distance from the centre with the camera `view` from it: the zoom sets the altitude. */
  flyingRadius(view: number): number {
    const { minDistance, maxDistance } = this.cameraParams;
    return this.top + flightAltitude(zoomFraction(view, minDistance, maxDistance), this.radius);
  }

  /** Tells the ship how high to fly with the camera `view` from it: the zoom's altitude, following the ground when low. */
  private setFlight(view: number): void {
    const { minDistance, maxDistance } = this.cameraParams;
    this.ship.setRadius(this.flyingRadius(view), followWeight(zoomFraction(view, minDistance, maxDistance)));
  }

  /** Lifts a camera position (the globe is centred on the origin) to just above the terrain beneath it if it's lower. */
  private keepAboveTerrain(position: THREE.Vector3): void {
    const d = position.length();
    if (d < 1e-6) {
      position.set(0, this.top + CAMERA_CLEARANCE, 0);
      return;
    }
    const floor = this.globe.groundRadius(this.cameraDir.copy(position).divideScalar(d)) + CAMERA_CLEARANCE;
    if (d < floor) position.multiplyScalar(floor / d);
  }

  override update(frameDt: number, alpha: number): void {
    // Round a rogue planet only the galaxy's dim glow lights the air.
    if (this.system.starless) this.globe.sunStrength.value = galacticLightParams.air;
    if (this.comet && this.cometOrbit) {
      // The dust tail lags behind the comet: opposite its motion, in the body frame.
      const time = this.frame.renderTime;
      keplerPosition(this.cometOrbit, time - COMET_MOTION_DT, this.before).sub(keplerPosition(this.cometOrbit, time, this.now));
      this.frame.toLocalDirection(this.before.normalize(), this.comet.back);
    }
    super.update(frameDt, alpha);
    if (this.zoomLocked) return;
    // Scrolling lifts or lowers the ship, and high up the camera tips over to look down on the globe.
    const { minDistance, maxDistance } = this.cameraParams;
    this.setFlight(this.orbit.zoom);
    this.orbit.setMinPitch(minPitchAt(zoomFraction(this.orbit.zoom, minDistance, maxDistance)));
  }

  /** System time here; the system level catches up to it on return. */
  get time(): number {
    return this.frame.time;
  }

  /** What the sky shows, for tests: stars, bodies drawn in it, and moons drawn as meshes here. */
  get skyStats(): { stars: number; bodies: number; localMoons: number } {
    const world = this.system.world;
    return {
      stars: world.stars.length,
      bodies: world.planets.length + world.moons.length + world.nuclei.length + world.asteroids.length - this.hidden.length,
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

    // Round a rogue planet the eye has opened up to the dark (the sky and the globe alike).
    if (this.system.starless) renderer.toneMappingExposure = galacticLightParams.exposure;
    renderer.autoClear = false;
    renderer.clear();
    this.system.renderSky(renderer, sky, this.frame.renderTime, this.hidden, SKY_MIN_PIXELS * pixelAngle);
    // The planet is always in front of the sky (its own moons are in this scene).
    renderer.clearDepth();
    this.globe.renderDepth(renderer, camera);
    renderScene(renderer, this.scene, camera);
    renderer.toneMappingExposure = 1;
    this.map.render(renderer);
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
    this.map.activate();
    this.plantTooltip?.activate();
  }

  override exit(): void {
    this.hud.deactivate();
    this.map.deactivate();
    this.plantTooltip?.deactivate();
  }
}
