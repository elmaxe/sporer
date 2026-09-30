import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { FIXED_DT } from '../core/Game';
import type { Input } from '../core/Input';
import { geyserActivity } from '../gen/geysers';
import { nominalStar, type SpectralClass, type StarData, type StarKind } from '../gen/stars';
import { Level, type TouchShipControls } from '../levels/Level';
import { PLANET_VIEW_DISTANCE, planetCameraParams } from '../levels/PlanetLevel';
import { Physics } from '../physics/Physics';
import { Geysers } from '../planet/Geysers';
import { Weather } from '../planet/Weather';
import { LavaEruptions } from '../planet/LavaEruptions';
import { planetParams, type RenderClock } from '../planet/PlanetFrame';
import { PlanetGlobe, RELIEF_SCALE } from '../planet/PlanetGlobe';
import { PlanetMap } from '../planet/PlanetMap';
import { PlanetPicker } from '../planet/PlanetPicker';
import { PlanetShip } from '../planet/PlanetShip';
import { maxViewDistance, travelScale } from '../planet/frame';
import { OrbitCamera } from '../player/OrbitCamera';
import { Planet } from '../world/Planet';
import { Starfield } from '../world/Starfield';
import { starLightIntensity } from '../world/Star';
import { createGlowTexture } from '../world/glowTexture';
import { STILL_ORBIT, describeLab, toPlanetConfig, type LabPlanet, type LabStar, type LabView } from './labPlanet';

/** The UFO's height above the highest terrain, as in the planet level. */
const ALTITUDE = 12;
/** The sun's glow is drawn this far out along its direction, this big (both in view units). */
const SUN_DISTANCE = 6000;
const SUN_SIZE = 900;

/**
 * The lab's clock: system time, stepped at the fixed rate (times `speed`,
 * not while `paused`) and interpolated for drawing. Everything animated
 * (lava, eruptions, geysers, moons, the day cycle) reads it, so pausing or
 * jumping it shows any moment. Shared by the successive lab levels.
 */
export class LabClock implements Entity, RenderClock {
  speed = 1;
  paused = false;
  private _time: number;
  private prev: number;
  private _renderTime: number;

  constructor(time = 0) {
    this._time = this.prev = this._renderTime = time;
  }

  get time(): number {
    return this._time;
  }

  get renderTime(): number {
    return this._renderTime;
  }

  /** Jumps to `time` (no interpolation from before). */
  set(time: number): void {
    this._time = this.prev = this._renderTime = time;
  }

  fixedUpdate(dt: number): void {
    this.prev = this._time;
    if (!this.paused) this._time += dt * this.speed;
  }

  update(_frameDt: number, alpha: number): void {
    this._renderTime = this.prev + (this._time - this.prev) * alpha;
  }

  dispose(): void {}
}

/** The star a lab option stands for. */
export function labStar(star: LabStar): StarData {
  return star.length === 1 ? nominalStar('mainSequence', star as SpectralClass) : nominalStar(star as StarKind);
}

/**
 * Sunlight from a direction set by azimuth and elevation (live from the lab's
 * view options): a directional light in the star's colour and intensity, a
 * faint ambient like the game's, and the sun's glow in the sky. In the globe
 * view the sun can go round with the day (`dayCycle`), at the planet level's
 * slowed spin.
 */
export class LabSun implements Entity {
  /** Unit direction towards the sun. */
  readonly direction = new THREE.Vector3(0, 1, 0);
  /** The light (colour × intensity) and the ambient, for shaders that light themselves. */
  readonly sunLight = new THREE.Color();
  readonly ambientLight = new THREE.Color();
  private readonly light = new THREE.DirectionalLight();
  private readonly ambient: THREE.AmbientLight | THREE.HemisphereLight;
  private readonly glow: THREE.Sprite;
  private star: LabStar | null = null;
  private linked: { sun: THREE.Vector3; sunLight: THREE.Color; ambientLight: THREE.Color } | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly clock: RenderClock,
    private readonly view: LabView,
    /** Radians per second the body turns (for the day cycle). */
    private readonly spin: number,
    private readonly globe: boolean,
  ) {
    // The same ambient as the planet level (PlanetLights) and the system view (StarSystem).
    this.ambient = globe ? new THREE.AmbientLight('#9bb8ff', 0.4) : new THREE.HemisphereLight('#9bb8ff', '#1a1020', 0.35);
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.glow.scale.setScalar(SUN_SIZE);
    this.glow.renderOrder = -1;
    scene.add(this.light, this.light.target, this.ambient, this.glow);
    this.update();
  }

  /** Keeps a globe's sun direction and lights (read by its lava, geysers and map shaders) in step with this. */
  link(globe: { sun: THREE.Vector3; sunLight: THREE.Color; ambientLight: THREE.Color }): void {
    this.linked = globe;
    this.star = null;
    this.update();
  }

  update(): void {
    if (this.star !== this.view.star) {
      this.star = this.view.star;
      const data = labStar(this.star);
      this.light.color.set(data.color);
      this.light.intensity = starLightIntensity({ ...data, orbit: STILL_ORBIT });
      this.glow.material.color.set(data.color);
      this.sunLight.copy(this.light.color).multiplyScalar(this.light.intensity);
      const a = this.ambient;
      this.ambientLight.copy(a.color).multiplyScalar(a.intensity);
      this.linked?.sunLight.copy(this.sunLight);
      this.linked?.ambientLight.copy(this.ambientLight);
    }
    const day = this.globe && this.view.dayCycle ? -this.spin * planetParams.spinScale * this.clock.renderTime : 0;
    const az = THREE.MathUtils.degToRad(this.view.sunAzimuth) + day;
    const el = THREE.MathUtils.degToRad(this.view.sunElevation);
    this.direction.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.light.position.copy(this.direction).multiplyScalar(1000);
    this.glow.position.copy(this.direction).multiplyScalar(SUN_DISTANCE);
    this.linked?.sun.copy(this.direction);
  }

  dispose(): void {
    this.scene.remove(this.light, this.light.target, this.ambient, this.glow);
    this.light.dispose();
    this.ambient.dispose();
    this.glow.material.map?.dispose();
    this.glow.material.dispose();
  }
}

/**
 * The system view's body (the game's `Planet`, as drawn in a star system)
 * at the origin, with its moons on their orbits, all run by the lab clock.
 */
class LabBodies implements Entity {
  readonly planet: Planet;
  readonly moons: Planet[];
  private readonly all: Planet[];

  constructor(scene: THREE.Scene, physics: Physics, planet: LabPlanet, sun: LabSun, private readonly clock: LabClock) {
    const config = toPlanetConfig(planet);
    const atmosphereSun = { vector: sun.direction, point: false };
    this.planet = new Planet(scene, physics, config, describeLab(planet), planet.radius * 2, atmosphereSun);
    this.moons = planet.moons.map((m) => new Planet(scene, physics, m, 'Moon', m.radius * 2, atmosphereSun, this.planet));
    this.all = [this.planet, ...this.moons];
    this.jump(clock.time);
  }

  /** Every body at `time`, with no interpolation from before. */
  jump(time: number): void {
    this.planet.jumpTo(time, FIXED_DT);
    for (const m of this.moons) m.jumpTo(time, FIXED_DT);
  }

  fixedUpdate(dt: number): void {
    this.planet.step(this.clock.time, dt);
    for (const m of this.moons) m.step(this.clock.time, dt);
  }

  update(frameDt: number, alpha: number): void {
    const time = this.clock.renderTime;
    for (const body of this.all) {
      body.update(frameDt, alpha);
      // Spin with the clock (so pausing stops it), not with the frames.
      body.spinAngle = body.config.spin * time;
      body.animate(time);
    }
  }

  dispose(): void {
    this.planet.dispose();
    for (const m of this.moons) m.dispose();
  }
}

/** Where the camera was, to put the next level's camera in the same place (see LabLevel.carry). */
export interface LabCarry {
  /** From the camera's centre to the camera. */
  direction: THREE.Vector3;
  /** Camera distance in planet radii. */
  zoom: number;
  /** The UFO's direction from the planet's centre (globe view). */
  ship: THREE.Vector3 | null;
}

/**
 * One build of the lab: the planet as the game draws it, in the globe view
 * (the planet level's globe, lava eruptions, geysers, the UFO, click-to-fly
 * and the map, at planet-level scale) or the system view (the system's
 * `Planet` and its moons, at system scale). Rebuilt from scratch whenever the
 * planet changes, like the game builds a planet level on arrival.
 */
export class LabLevel extends Level {
  /** On phones: the planet level's stick, Boost and Map button in the globe view. */
  override readonly touchControls: TouchShipControls;
  /** The planet's sea-level radius in this view's units. */
  readonly radius: number;
  /** The camera's centre: the planet's centre (orbit camera) or the UFO (fly camera). */
  readonly globe: PlanetGlobe | null = null;
  readonly eruptions: LavaEruptions | null = null;
  readonly geysers: Geysers | null = null;
  /** Rain, lightning bolts and their light (globe view, bodies with weather). */
  readonly weather: Weather | null = null;
  readonly ship: PlanetShip | null = null;
  readonly map: PlanetMap | null = null;
  readonly bodies: LabBodies | null = null;
  readonly orbit: OrbitCamera;
  readonly sun: LabSun;
  /** Milliseconds it took to build. */
  readonly buildMs: number;
  /** The view and camera it was built for (`view` is the lab's live options). */
  readonly mode: Pick<LabView, 'view' | 'camera'>;
  private readonly pivot = new THREE.Object3D();
  private readonly axes: THREE.AxesHelper;
  private readonly center = new THREE.Vector3();

  constructor(
    readonly planet: LabPlanet,
    readonly view: LabView,
    readonly clock: LabClock,
    private readonly camera: THREE.PerspectiveCamera,
    input: Input,
    debug: Debug,
    carry: LabCarry | null,
  ) {
    super(view.view === 'system' ? Physics.create(FIXED_DT) : null);
    const start = performance.now();
    this.mode = { view: view.view, camera: view.camera };
    this.touchControls = view.view === 'globe' ? 'surface' : 'none';
    const config = toPlanetConfig(planet);
    this.add(clock);
    const globeView = view.view === 'globe';
    this.sun = this.add(new LabSun(this.scene, clock, view, planet.spin, globeView));
    if (view.starfield) this.add(new Starfield(this.scene, camera));
    this.scene.add(this.pivot);

    let min: number;
    let max: number;
    let distance: number;
    let target: THREE.Object3D = this.pivot;
    let up: THREE.Vector3 | undefined;
    if (globeView) {
      const globe = (this.globe = this.add(new PlanetGlobe(this.scene, config, clock, camera, debug)));
      this.sun.link(globe);
      const R = (this.radius = globe.radius);
      this.eruptions = globe.lava
        ? this.add(new LavaEruptions(this.scene, clock, globe.lava.activity, config.seed, config.style.sea!, debug))
        : null;
      const activity = geyserActivity({ ...config, moon: planet.kind === 'moon' }, R, RELIEF_SCALE);
      this.geysers = activity
        ? this.add(new Geysers(this.scene, clock, activity, config.seed, globe.sun, globe.sunLight, globe.ambientLight, debug))
        : null;
      const shipStart = carry?.ship ?? new THREE.Vector3(0.3, 0.5, 1).normalize();
      const ship = (this.ship = this.add(
        new PlanetShip(this.scene, input, camera, debug, globe.top + ALTITUDE, shipStart, travelScale(R)),
      ));
      if (view.camera === 'fly') {
        target = ship.object;
        up = ship.up;
        min = planetCameraParams.minDistance;
        max = maxViewDistance(R, planetCameraParams.maxDistance);
        distance = PLANET_VIEW_DISTANCE;
      } else {
        min = globe.top * 1.04;
        max = R * 12;
        distance = R * 3;
      }
    } else {
      this.bodies = this.add(new LabBodies(this.scene, this.physics!, planet, this.sun, clock));
      const R = (this.radius = planet.radius);
      const extent = Math.max(R, planet.rings?.outer ?? 0, ...planet.moons.map((m) => m.orbit.radius + m.radius));
      min = R * 1.3;
      max = Math.max(extent, R * 3) * 12;
      distance = Math.max(extent * 2.6, R * 4);
    }

    this.orbit = this.add(
      new OrbitCamera(
        camera,
        target,
        input,
        { ...planetCameraParams, minDistance: min, maxDistance: max },
        up ? { distance, up, minPitch: THREE.MathUtils.degToRad(5), pitch: THREE.MathUtils.degToRad(40) } : { distance },
        debug,
        'Lab camera',
      ),
    );
    // After the camera: the bolts face this frame's view.
    const globe = this.globe;
    if (globe?.weather)
      this.weather = this.add(
        new Weather(this.scene, clock, globe.weather, config, camera, globe.sun, globe.sunLight, globe.ambientLight, debug),
      );
    if (carry) {
      this.orbit.lookFrom(carry.direction);
      this.orbit.setDistance(THREE.MathUtils.clamp(carry.zoom * this.radius, min, max));
    } else if (!up) {
      // Start looking at the day side, a little from above.
      this.orbit.lookFrom(new THREE.Vector3().copy(this.sun.direction).setY(0).normalize().add(new THREE.Vector3(0.6, 0.45, 0)));
    }
    if (this.ship) {
      this.add(new PlanetPicker(this.scene, camera, input, this.ship, this.radius));
      if (view.map) this.map = this.add(new PlanetMap(config, planet.name, this.ship, this.globe!, input, debug));
    }
    this.axes = new THREE.AxesHelper(this.radius * 1.6);
    this.scene.add(this.axes);
    this.applyLive();
    this.buildMs = performance.now() - start;
  }

  /** Copies the view options that don't need a rebuild (wireframe, axes). */
  applyLive(): void {
    this.axes.visible = this.view.axes;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) o.material.wireframe = this.view.wireframe;
    });
  }

  /**
   * The wireframe with hidden lines removed. WebGL draws a wireframe as
   * lines, which are never back-face culled, so the far side of every sphere
   * would show through the near side. First the solid surfaces go into the
   * depth buffer only (pushed back a little, so the lines on them still pass),
   * then the scene is drawn as usual over it.
   */
  private hiddenLines(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    const solids = this.solids;
    const others = this.others;
    solids.length = 0;
    others.length = 0;
    this.scene.traverseVisible((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) solids.push(o.material);
      else if (o !== this.scene && (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite || o instanceof THREE.Line)) others.push(o);
    });
    for (const m of solids) Object.assign(m, { wireframe: false, colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    for (const o of others) o.visible = false;
    renderer.render(this.scene, camera);
    for (const m of solids) Object.assign(m, { wireframe: true, colorWrite: true, polygonOffset: false });
    for (const o of others) o.visible = true;
    renderer.autoClear = false;
    renderer.render(this.scene, camera);
    renderer.autoClear = true;
  }

  private readonly solids: THREE.MeshStandardMaterial[] = [];
  private readonly others: THREE.Object3D[] = [];

  /** Where the camera is now, for the next build. */
  carry(): LabCarry {
    this.cameraCenter(this.center);
    const offset = this.camera.position.clone().sub(this.center);
    return {
      direction: offset.clone().normalize(),
      zoom: offset.length() / this.radius,
      ship: this.ship ? this.ship.direction.clone() : null,
    };
  }

  /**
   * Puts the camera above longitude `lon` and latitude `lat` (degrees, body
   * frame; 0,0 faces +Z) at `zoom` planet radii from the centre (orbit
   * camera; the fly camera takes the heading only).
   */
  look(lon: number, lat: number, zoom?: number): void {
    const la = THREE.MathUtils.degToRad(lat);
    const lo = THREE.MathUtils.degToRad(lon);
    this.orbit.lookFrom(new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)));
    if (zoom !== undefined) this.orbit.setDistance(zoom * this.radius);
  }

  /** Triangles drawn for the planet (surface, sea, rings, atmosphere; the surface chunks shown now, before frustum culling). */
  get triangles(): number {
    let n = 0;
    const root = this.globe?.object ?? this.bodies?.planet.object;
    root?.traverseVisible((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const g = o.geometry as THREE.BufferGeometry;
      n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    return n;
  }

  private cameraCenter(out: THREE.Vector3): THREE.Vector3 {
    return this.mode.camera === 'fly' && this.ship ? out.copy(this.ship.object.position) : out.set(0, 0, 0);
  }

  override render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    if (this.view.wireframe) {
      this.hiddenLines(renderer, camera);
    } else {
      renderer.render(this.scene, camera);
    }
    // The map draws into the same canvas: no clearing in between.
    renderer.autoClear = false;
    this.map?.render(renderer);
    renderer.autoClear = true;
  }

  override enter(): void {
    this.map?.activate();
  }

  override exit(): void {
    this.map?.deactivate();
  }

  override dispose(): void {
    super.dispose();
    this.scene.remove(this.axes, this.pivot);
    this.axes.dispose();
  }
}
