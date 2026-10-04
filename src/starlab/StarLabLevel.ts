import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { FIXED_DT } from '../core/Game';
import type { Input } from '../core/Input';
import { systemExtent, type SystemData } from '../gen/system';
import { Level } from '../levels/Level';
import { Physics } from '../physics/Physics';
import { OrbitCamera, cameraParams } from '../player/OrbitCamera';
import type { Tooltip } from '../ui/Tooltip';
import type { CelestialBody } from '../world/CelestialBody';
import { OrbitTrails } from '../world/OrbitTrails';
import { Starfield } from '../world/Starfield';
import { StarSystem } from '../world/StarSystem';
import { renderScene } from '../world/wireframe';
import type { StarLabView } from './labStars';

/** Bodies smaller than this angle on screen are picked as if this big (radians), as in the game's Picker. */
const MIN_PICK_ANGLE = 0.02;
/** The star view's camera: closest and furthest, and where it starts, in the star(s)' radii. */
const STAR_VIEW = { min: 1.15, max: 80, start: 4.5 };
/** Focused on a body in the system view, the camera comes to this many of its radii (at least the camera's own minimum). */
const FOCUS_RADII = 6;

/** Where the camera was and what it followed, for the next build of the same view (see StarLabLevel.carry). */
export interface StarLabCarry {
  view: StarLabView['view'];
  time: number;
  direction: THREE.Vector3;
  /** Camera distance in the build's starting distances (so a giant and a dwarf are framed alike), or units while following a body. */
  zoom: number;
  /** The followed body's name (system view), or null for the system's centre. */
  focus: string | null;
}

/**
 * One build of the star lab: the system as the game draws it (its own
 * `StarSystem`: stars with their surfaces, coronas and storms, planets,
 * moons, comets, belts and dust), at system scale, run by the system's own
 * clock at the lab's speed. The star view keeps just the star(s); the system
 * view all of it, with the orbit trails, hovering for names and clicking to
 * follow a body. Rebuilt from scratch whenever the star or system changes.
 */
export class StarLabLevel extends Level {
  readonly world: StarSystem;
  readonly orbit: OrbitCamera;
  readonly trails: OrbitTrails | null = null;
  /** What it was built for (`view` is the lab's live options). */
  readonly mode: StarLabView['view'];
  /** The system drawn: the whole one, or (star view) just its stars. */
  readonly drawn: SystemData;
  /** Milliseconds it took to build. */
  readonly buildMs: number;
  /** The body under the pointer (system view). */
  hovered: CelestialBody | null = null;
  private _focus: CelestialBody | null = null;
  private readonly pivot = new THREE.Object3D();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly scratch = new THREE.Vector3();
  /** Distance the camera starts at (and goes back to for the whole system). */
  private readonly home: number;

  constructor(
    /** The whole system (the readout lists it in either view). */
    readonly system: SystemData,
    readonly view: StarLabView,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly tooltip: Tooltip,
    debug: Debug,
    carry: StarLabCarry | null,
  ) {
    super(Physics.create(FIXED_DT));
    const start = performance.now();
    this.mode = view.view;
    const starView = view.view === 'star';
    this.drawn = starView ? { ...system, planets: [], comets: [], belts: [], dust: null } : system;
    if (view.starfield) this.add(new Starfield(this.scene, camera));
    this.world = this.add(new StarSystem(this.scene, this.physics!, this.drawn, debug));
    this.world.speed = view.speed;
    const keep = carry && carry.view === view.view ? carry : null;
    this.world.setTime(carry?.time ?? 0);
    this.scene.add(this.pivot);
    // The camera's centre follows the focused body (or stays at the barycentre), before the camera reads it.
    this.add<Entity>({ update: () => this.follow(), dispose: () => {} });

    let min: number;
    let max: number;
    if (starView) {
      // Round a binary, its whole pair; round one star, its radius.
      const size = system.starZone;
      min = size * STAR_VIEW.min;
      max = size * STAR_VIEW.max;
      this.home = size * STAR_VIEW.start;
    } else {
      const extent = systemExtent(system);
      min = cameraParams.minDistance * 0.5;
      max = Math.max(extent * 5, 2000);
      this.home = Math.max(extent * 1.5, system.starZone * 4);
    }
    this.orbit = this.add(
      new OrbitCamera(
        camera,
        this.pivot,
        input,
        { ...cameraParams, minDistance: min, maxDistance: max },
        { distance: this.home, pitch: THREE.MathUtils.degToRad(starView ? 12 : 32), keepOut: (p) => this.keepOut(p) },
        debug,
        'Star lab camera',
      ),
    );
    if (!starView) {
      this.trails = this.add(
        new OrbitTrails(
          this.scene,
          camera,
          this.world.planets.filter((p) => p.config.orbit.radius > 0),
          this.world.moons,
          (body) => body === this.hovered || body === this._focus,
          debug,
        ),
      );
      this.add<Entity>({ update: () => this.pickUpdate(), dispose: () => this.tooltip.hide() });
    }
    if (keep) {
      this._focus = keep.focus ? (this.world.bodies.find((b) => b.name === keep.focus) ?? null) : null;
      this.follow();
      this.orbit.lookFrom(keep.direction);
      // Following a body that's gone (another system): back to the whole system.
      const lost = keep.focus !== null && this._focus === null;
      if (!lost) this.orbit.setDistance(THREE.MathUtils.clamp(this._focus ? keep.zoom : keep.zoom * this.home, min, max));
    } else {
      this.orbit.lookFrom(new THREE.Vector3(0.55, starView ? 0.2 : 0.62, 1).normalize());
    }
    this.applyLive();
    this.buildMs = performance.now() - start;
  }

  /** The body the camera follows (null: the system's centre). */
  get focus(): CelestialBody | null {
    return this._focus;
  }

  /** Follows `body` (null: back to the centre), zooming to frame it. */
  setFocus(body: CelestialBody | null): void {
    this._focus = body;
    this.orbit.zoomTo(body ? Math.max(body.radius * FOCUS_RADII, cameraParams.minDistance) : this.home);
  }

  /** Copies the view options that need no rebuild. */
  applyLive(): void {
    this.world.speed = this.view.speed;
    if (this.trails) this.trails.visible = this.view.trails;
  }

  /** Puts the camera at azimuth `yaw` and elevation `pitch` (degrees) and, if given, `distance` units from its centre. */
  look(yaw: number, pitch: number, distance?: number): void {
    const y = THREE.MathUtils.degToRad(yaw);
    const p = THREE.MathUtils.degToRad(pitch);
    this.orbit.lookFrom(new THREE.Vector3(Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)));
    if (distance !== undefined) this.orbit.setDistance(distance);
  }

  /** Where the camera is now, for the next build. */
  carry(): StarLabCarry {
    const offset = this.camera.position.clone().sub(this.pivot.position);
    return {
      view: this.mode,
      time: this.world.time,
      direction: offset.clone().normalize(),
      zoom: this._focus ? offset.length() : offset.length() / this.home,
      focus: this._focus?.name ?? null,
    };
  }

  private follow(): void {
    if (this._focus) this.pivot.position.copy(this._focus.renderPosition);
    else this.pivot.position.set(0, 0, 0);
    this.pivot.updateMatrixWorld();
  }

  /** Hover for a body's name; a click follows it, a click on empty space goes back to the whole system. */
  private pickUpdate(): void {
    const { pointer } = this.input;
    const hovering = pointer.inside && !this.input.isDragging && !this.input.blocked;
    this.hovered = hovering ? this.pick(pointer.ndcX, pointer.ndcY) : null;
    if (this.hovered) this.tooltip.show(this.hovered, this.hovered.name, this.hovered.description, pointer.clientX, pointer.clientY);
    else this.tooltip.hide();
    const click = this.input.consumeClick();
    if (click) this.setFocus(this.pick(click.ndcX, click.ndcY));
  }

  /** The nearest body whose (padded) sphere the ray through `ndc` hits. */
  private pick(ndcX: number, ndcY: number): CelestialBody | null {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), this.camera);
    const { ray } = this.raycaster;
    let best: CelestialBody | null = null;
    let bestDepth = Infinity;
    for (const body of this.world.bodies) {
      const p = body.renderPosition;
      const depth = ray.direction.dot(this.scratch.subVectors(p, ray.origin));
      if (depth <= 0 || depth >= bestDepth) continue;
      const r = Math.max(body.pickRadius ?? body.radius, depth * MIN_PICK_ANGLE);
      if (ray.distanceSqToPoint(p) <= r * r) {
        best = body;
        bestDepth = depth;
      }
    }
    return best;
  }

  /** Keeps the camera out of every body, as the game's system level does. */
  private keepOut(position: THREE.Vector3): void {
    for (const body of this.world.bodies) {
      const centre = body.renderPosition;
      const reach = body.radius * 1.05 + 0.5;
      const d = position.distanceTo(centre);
      if (d >= reach) continue;
      if (d < 1e-6) position.y += reach;
      else position.sub(centre).multiplyScalar(reach / d).add(centre);
    }
  }

  override render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    renderScene(renderer, this.scene, camera, this.view.wireframe);
  }

  override dispose(): void {
    super.dispose();
    this.scene.remove(this.pivot);
  }
}
