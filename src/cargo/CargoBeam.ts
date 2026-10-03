import * as THREE from 'three';
import type { SoundHandle } from '../audio/CuePlayer';
import type { SoundEffects } from '../audio/sfx';
import { cargoItem, cargoKey, type ItemId, type ItemStatus } from '../combat/items';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { PlantSpecies } from '../gen/plants';
import type { GroundHeight } from '../planet/ground';
import { MarkerRing } from '../player/MarkerRing';
import type { Plantings } from '../surface/Plantings';
import { plantParams } from '../surface/plantParams';
import { createTintedPlantMaterial, type PlantFadeUniforms } from '../surface/plantLook';
import { plantYaw, type LivePlant, type SurfaceEntities } from '../surface/SurfaceEntities';
import { GROUND_DETAIL_LAYER } from '../world/groundDepth';
import { createGlowTexture } from '../world/glowTexture';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import { Rng, hashSeed } from '../gen/rng';
import { beamEase, beamParams, beamScale, carriedScale, fallGravity, fallScale, stepFall, tripTime, type Fall } from './beam';
import { ParticlePool, type Puff } from './CargoFx';
import { speciesKey, type Inventory } from './inventory';
import { describeFate, plantFate, type FateWorld, type Landing, type PlantFate } from './plantFate';

/** What the beam needs from the globe (see PlanetGlobe). */
export interface CargoGround {
  readonly groundHeight: GroundHeight;
  groundHit(ray: THREE.Ray, out: THREE.Vector3): number | null;
  landingAt(dir: THREE.Vector3): Landing;
}

/** What the beam needs from the ship: where it is and which way is up. */
export interface CargoShip {
  readonly object: THREE.Object3D;
  readonly up: THREE.Vector3;
}

/** The body the beam works on: its key and name (for the hold's stacks), its climate (for what becomes of a plant set down) and surface gravity (g, for how things fall). */
export interface CargoBody {
  readonly key: string;
  readonly name: string;
  readonly world: FateWorld;
  readonly gravity: number;
}

/** How far past the ground's hit a plant can still be picked: its crown is wider than a point. */
const GROUND_SLACK = 1;
/** The hold is this far below the ship's centre: where the beam starts and cargo goes in. */
const HOLD_DROP = 0.7;
/** The beam's radius at the ship, and its narrowest at the ground. */
const BEAM_TOP = 0.45;
const MIN_BEAM_RADIUS = 1.2;
/** Seconds a note (a plant took root, out of reach…) stays on the hint line. */
const NOTE_SECONDS = 3;
/** A plant let go that lands within this of where it stood (units) is just put back. */
const PUT_BACK_DISTANCE = 1.5;
/** Spin while on the beam, radians per second. */
const BEAM_SPIN = 0.9;
/** How long each fate takes to play out, seconds. */
const FATE_TIME: Record<PlantFate, number> = { root: 0, drown: 5, burn: 4.5, char: 4.5, freeze: 2.8, wither: 5, dissolve: 4.5, sink: 1.6 };
/** A frozen plant shatters this long after it lands. */
const SHATTER_AT = 1.8;
const BEAM_COLORS = { up: new THREE.Color('#8fffd2'), down: new THREE.Color('#ffd58a') };
const RENDER_ORDER = CLOUD_RENDER_ORDER + 1;
const Y = new THREE.Vector3(0, 1, 0);

type LoadState = 'up' | 'down' | 'fall' | 'fate';

/** A plant on the beam, falling, or meeting its fate. */
interface Load {
  state: LoadState;
  readonly object: THREE.Object3D;
  readonly material: THREE.MeshStandardMaterial;
  readonly tint: Pick<PlantFadeUniforms, 'uTint' | 'uTintMix'>;
  readonly species: PlantSpecies;
  readonly key: string;
  readonly origin: string;
  /** The plant it was on the ground (abducted), or null (cargo set down). */
  readonly source: LivePlant | null;
  /** The ground point at the beam's foot: where it stood, or where it's being set down. */
  readonly foot: THREE.Vector3;
  /** Its turn as it stood at `restUp` (it keeps it, turned to the local up, wherever it goes). */
  readonly rest: THREE.Quaternion;
  readonly restUp: THREE.Vector3;
  /** Trip progress along the beam, 0 at the foot to 1 at the ship, and the trip's length in seconds. */
  t: number;
  duration: number;
  /** Its scale on the ground, and at the ship. */
  readonly full: number;
  readonly small: number;
  scale: number;
  spin: number;
  /** Its velocity, units/s: followed on the beam, so a load let go keeps it (`moved`: it has a frame of motion to go by). */
  readonly velocity: THREE.Vector3;
  moved: boolean;
  /** Falling: on from where it was let go, with the velocity it had (`fall` shares `velocity`). */
  readonly fall: Fall;
  fallFrom: number;
  fallFromScale: number;
  /** Seconds it has been falling. */
  fallTime: number;
  /** Where it lands (unit direction from the body's centre). */
  readonly dir: THREE.Vector3;
  fate: PlantFate;
  age: number;
  /** Particles owed (fractions carry over between frames). */
  owed: number;
  /** Its one-off ending (shattering, the last of the ash) has been thrown. */
  burst: boolean;
}

/**
 * The abduction beam and the cargo it carries, in low orbit (a planet-level
 * entity). Selected on the item bar's Inventory tab (`arm`): the Abduction
 * Beam lifts a plant held under the pointer (mouse button or finger down on
 * it) up to the ship, shrinking as it rises; let go on the way and it falls
 * back, carrying on with the motion it had (the ship's and the beam's) as
 * the body's gravity pulls it down. At the ship it goes into the hold
 * (`Inventory`, a stack per species). A stack selected instead sets one of
 * its plants down where the pointer is held on the ground, growing back to
 * size on the way down; let go (or just click) and it falls from where it
 * is, the same way. Whatever lands meets its fate there (`plantFate`): it
 * takes root and stays (`Plantings`), or drowns, burns, chars, freezes,
 * withers, dissolves or sinks into a giant's clouds, which plays out on the
 * spot. One beam at a time; things in the air keep falling
 * and fates keep playing while the next one goes. Motion is scripted (no
 * physics): the trips along the beam and the falls are in cargo/beam.ts.
 */
export class CargoBeam implements Entity {
  /** 'abduct', the key of the stack being set down, or null. */
  private armed: 'abduct' | { key: string } | null = null;
  /** The load on the beam now, if any. */
  private beam: Load | null = null;
  private readonly loads: Load[] = [];
  private sound: SoundHandle | null = null;
  private note = '';
  private noteTime = 0;
  private readonly look: BeamLook;
  private readonly reticle: MarkerRing;
  private readonly farReticle: MarkerRing;
  private readonly glow: ParticlePool;
  private readonly smoke: ParticlePool;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly point = new THREE.Vector3();
  private readonly hold = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  /** Falling acceleration here, units/s². */
  private gravity: number;
  private readonly w = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly qSpin = new THREE.Quaternion();
  private readonly tangent = new THREE.Vector3();
  private readonly bitangent = new THREE.Vector3();
  private readonly puff: Puff = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    life: 1,
    size: 1,
    endSize: 1,
    color: '#ffffff',
    alpha: 1,
    lift: 0,
    up: new THREE.Vector3(),
    drag: 0,
  };
  /** The effects' scatter (seeded, as everything visual is). */
  private readonly rng: Rng;
  private readonly canvas = document.querySelector('canvas');
  /** The pick under the pointer (reused). */
  private readonly target = { id: '', planted: false, species: null as unknown as PlantSpecies, key: '', origin: '', scale: 1, base: new THREE.Vector3() };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly ground: CargoGround,
    private readonly ship: CargoShip,
    private readonly plants: SurfaceEntities | null,
    private readonly plantings: Plantings,
    private readonly inventory: Inventory,
    private readonly body: CargoBody,
    private readonly sfx: SoundEffects,
    /** Why nothing can be beamed now (the planet buster going off), or null. */
    private readonly blocked: () => string | null,
    debug: Debug,
  ) {
    this.rng = new Rng(hashSeed('cargo', body.key));
    this.gravity = fallGravity(body.gravity);
    this.look = new BeamLook(scene);
    this.reticle = new MarkerRing(scene, '#8fffd2', 0.1, 0.18);
    this.farReticle = new MarkerRing(scene, '#7d8794', 0, 0.12);
    this.glow = new ParticlePool(scene, true, RENDER_ORDER + 1);
    this.smoke = new ParticlePool(scene, false, RENDER_ORDER);
    const f = debug.folder('Cargo beam');
    f?.add(beamParams, 'range', 10, 300);
    f?.add(beamParams, 'speed', 1, 40);
    f?.add(beamParams, 'minTime', 0, 3);
    f?.add(beamParams, 'carriedHeight', 0.2, 4);
    f?.add(beamParams, 'gravity', 1, 100)
      .name('gravity (1 g)')
      .onChange(() => (this.gravity = fallGravity(body.gravity)));
    f?.add(beamParams, 'maxFallSpeed', 5, 200);
    f?.add(beamParams, 'maxFallTime', 1, 60);
  }

  /** The item armed now: the beam, a stack to set down, or nothing. */
  get selected(): ItemId | null {
    if (this.armed === 'abduct') return 'abduct';
    return this.armed ? cargoItem(this.armed.key) : null;
  }

  /** True while the beam is holding something. */
  get beaming(): boolean {
    return this.beam !== null;
  }

  /** What's in the air or playing out now (for tests): each load's state and fate. */
  get inFlight(): { state: LoadState; fate: PlantFate | null; species: string }[] {
    return this.loads.map((l) => ({ state: l.state, fate: l.state === 'fate' ? l.fate : null, species: l.species.name }));
  }

  /** Arms the beam (`'abduct'`), a cargo stack (its item id), or nothing. */
  arm(item: ItemId | null): void {
    const key = item ? cargoKey(item) : null;
    this.armed = item === 'abduct' ? 'abduct' : key && this.inventory.stack(key) ? { key } : null;
    document.body.classList.toggle('beaming', this.armed !== null);
    if (!this.armed) {
      this.reticle.hide();
      this.farReticle.hide();
    }
  }

  status(item: ItemId): ItemStatus {
    const why = this.blocked();
    const note = this.noteTime > 0 ? this.note : '';
    const touch = this.input.touchMode;
    if (item === 'abduct') {
      if (why) return { available: false, hint: note, reason: why };
      if (this.beam?.state === 'up') return { available: true, hint: `Beaming up ${this.beam.species.name}… let go to drop it` };
      if (this.armed !== 'abduct') return { available: true, hint: note };
      if (note) return { available: true, hint: note };
      if (!plantParams.enabled) return { available: true, hint: 'Plants are hidden: turn them on in the menu to beam them up' };
      if (this.inventory.full) return { available: true, hint: 'The hold is full: set something down first' };
      return { available: true, hint: touch ? 'Touch and hold a plant to beam it up' : 'Click and hold on a plant to beam it up' };
    }
    const key = cargoKey(item);
    const stack = key ? this.inventory.stack(key) : null;
    if (!stack) return { available: false, hint: note, reason: 'Nothing left of it' };
    if (why) return { available: false, hint: note, reason: why };
    if (this.beam?.state === 'down') return { available: true, hint: `Setting down ${this.beam.species.name}… let go to drop it` };
    const armed = this.armed !== null && this.armed !== 'abduct' && this.armed.key === key;
    if (!armed || note) return { available: true, hint: note };
    return {
      available: true,
      hint: touch
        ? `${stack.species.name}: touch and hold the ground to set it down, tap to drop it`
        : `${stack.species.name}: hold on the ground to set it down, click to drop it`,
    };
  }

  update(frameDt: number): void {
    const dt = Math.min(frameDt, 0.1);
    if (this.noteTime > 0) this.noteTime -= frameDt;
    this.hold.copy(this.ship.object.position).addScaledVector(this.ship.up, -HOLD_DROP);
    const press = this.input.consumePress();
    if (press && this.armed && !this.beam && !this.blocked()) this.startBeam(press.ndcX, press.ndcY);
    // Let go (or the ship flew out of reach): whatever is on the beam falls.
    if (this.beam && (!this.input.primaryDown || this.beam.foot.distanceTo(this.hold) > beamParams.range * 1.3 || this.blocked())) this.letGo();

    for (let i = this.loads.length - 1; i >= 0; i--) this.step(this.loads[i]!, dt);
    this.aim(frameDt);
    this.drawBeam(frameDt);
    const height = this.canvas?.height ?? 720;
    this.glow.setView(height, this.camera.fov);
    this.smoke.setView(height, this.camera.fov);
    this.glow.update(dt);
    this.smoke.update(dt);
  }

  /** Everything in the air comes down at once and every fate ends (the body was blown apart, or the level is going). */
  clear(settle: boolean): void {
    this.stopSound();
    this.beam = null;
    for (const load of [...this.loads]) {
      if (settle && load.state === 'up' && load.source) {
        load.source.restore();
        this.drop(load);
      } else if (settle && (load.state === 'down' || load.state === 'fall')) {
        this.dir(load, load.state === 'down' ? load.foot : load.object.position);
        this.land(load, true);
        // Its fate needn't play out: the level is going.
        if ((load.state as LoadState) === 'fate') this.drop(load);
      } else {
        load.source?.destroy();
        this.drop(load);
      }
    }
  }

  dispose(): void {
    this.clear(true);
    this.arm(null);
    this.look.dispose();
    this.reticle.dispose();
    this.farReticle.dispose();
    this.glow.dispose();
    this.smoke.dispose();
  }

  private say(text: string): void {
    this.note = text;
    this.noteTime = NOTE_SECONDS;
  }

  /** A press with the beam or a stack armed: catch the plant under it, or start setting cargo down there. */
  private startBeam(ndcX: number, ndcY: number): void {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), this.camera);
    const { ray } = this.raycaster;
    if (this.armed === 'abduct') {
      const target = this.pickPlant(ray);
      // Not a plant: the press is the ground's (a click there still flies the ship).
      if (!target) return;
      if (target.base.distanceTo(this.hold) > beamParams.range) {
        this.say('Out of the beam’s reach: fly lower or closer');
        return;
      }
      this.input.capturePress();
      if (!this.inventory.canAdd(target.key)) {
        this.say('The hold is full: set something down first');
        return;
      }
      const source = target.planted ? this.plantings.promote(target.id) : (this.plants?.promote(target.id) ?? null);
      if (!source) return;
      const mesh = source.object.children[0] as THREE.Mesh;
      const load = this.createLoad('up', source.object, mesh, target.species, target.key, target.origin, source, target.base, target.scale);
      load.t = 0;
      this.beam = load;
      this.sfx.play('abductStart');
      this.sound = this.sfx.start('abductBeam');
      return;
    }
    const key = this.armed!.key;
    const stack = this.inventory.stack(key);
    if (!stack || this.ground.groundHit(ray, this.point) === null) return;
    if (this.point.distanceTo(this.hold) > beamParams.range) {
      this.say('Out of the beam’s reach: fly lower or closer');
      return;
    }
    this.input.capturePress();
    const { species, origin } = stack;
    this.inventory.take(key);
    if (!this.inventory.stack(key)) this.arm(null);
    const object = new THREE.Group();
    object.name = species.name;
    const mesh = new THREE.Mesh(this.plantings.geometry(key, species), undefined);
    mesh.layers.enable(GROUND_DETAIL_LAYER);
    object.add(mesh);
    this.scene.add(object);
    // Standing upright at the foot, turned a little differently each time.
    this.up.copy(this.point).normalize();
    object.quaternion.setFromUnitVectors(Y, this.up).premultiply(this.qSpin.setFromAxisAngle(this.up, (this.inventory.version * 2.39996) % (Math.PI * 2)));
    const load = this.createLoad('down', object, mesh, species, key, origin, null, this.point, 1);
    load.t = 1;
    this.beam = load;
    this.sound = this.sfx.start('exportBeam');
  }

  private createLoad(
    state: LoadState,
    object: THREE.Object3D,
    mesh: THREE.Mesh,
    species: PlantSpecies,
    key: string,
    origin: string,
    source: LivePlant | null,
    foot: THREE.Vector3,
    full: number,
  ): Load {
    const { material, tint } = createTintedPlantMaterial(0);
    mesh.material = material;
    const small = carriedScale(species.height, full);
    const restUp = foot.clone().normalize();
    const velocity = new THREE.Vector3();
    const load: Load = {
      state,
      object,
      material,
      tint,
      species,
      key,
      origin,
      source,
      foot: foot.clone(),
      rest: object.quaternion.clone(),
      restUp,
      t: 0,
      duration: tripTime(foot.distanceTo(this.hold)),
      full,
      small,
      scale: full,
      spin: 0,
      velocity,
      moved: false,
      fall: { position: new THREE.Vector3(), velocity },
      fallFrom: 0,
      fallFromScale: full,
      fallTime: 0,
      dir: restUp.clone(),
      fate: 'root',
      age: 0,
      owed: 0,
      burst: false,
    };
    this.loads.push(load);
    this.pose(load, foot, full);
    return load;
  }

  /** The beam lets go: its load falls from where it is. */
  private letGo(): void {
    const load = this.beam;
    if (!load) return;
    this.beam = null;
    this.stopSound();
    this.startFall(load);
  }

  /** It falls from where it is, keeping the velocity it had. */
  private startFall(load: Load): void {
    load.state = 'fall';
    const pos = load.object.position;
    load.fall.position.copy(pos);
    load.dir.copy(pos).normalize();
    load.fallFrom = Math.max(0, pos.length() - this.ground.groundHeight(load.dir));
    load.fallFromScale = load.scale;
    load.fallTime = 0;
  }

  private stopSound(): void {
    this.sound?.stop();
    this.sound = null;
  }

  private step(load: Load, dt: number): void {
    switch (load.state) {
      case 'up':
      case 'down': {
        load.t += ((load.state === 'up' ? 1 : -1) * dt) / load.duration;
        load.spin += BEAM_SPIN * dt;
        const e = beamEase(load.t);
        load.scale = beamScale(e, load.full, load.small);
        // Up the beam from its foot to the hold, centred on the beam as it nears the ship.
        this.v.lerpVectors(load.foot, this.hold, e);
        this.up.copy(this.v).normalize();
        this.v.addScaledVector(this.up, -0.5 * e * load.species.height * load.scale);
        this.track(load, this.v, dt);
        this.pose(load, this.v, load.scale);
        if (load.state === 'up' && load.t >= 1) this.arrive(load);
        else if (load.state === 'down' && load.t <= 0) {
          this.beam = null;
          this.stopSound();
          this.dir(load, load.foot);
          this.land(load, false);
        }
        return;
      }
      case 'fall': {
        load.fallTime += dt;
        const height = stepFall(load.fall, this.gravity, this.ground.groundHeight, dt);
        load.spin += BEAM_SPIN * 0.5 * dt;
        load.scale = fallScale(height, load.fallFrom, load.fallFromScale, load.full);
        this.pose(load, load.fall.position, load.scale);
        if (height === 0) {
          this.dir(load, load.fall.position);
          this.land(load, false);
        } else if (load.fallTime > beamParams.maxFallTime) {
          // Thrown faster than it falls back (off a small body): gone into space.
          load.source?.destroy();
          this.drop(load);
          this.say(`${load.species.name} drifted off into space`);
        }
        return;
      }
      case 'fate':
        load.age += dt;
        this.playFate(load, dt);
        if (load.age >= FATE_TIME[load.fate]) this.drop(load);
    }
  }

  /** Into the hold. */
  private arrive(load: Load): void {
    this.beam = null;
    this.stopSound();
    if (!this.inventory.add(load.key, load.species, load.origin)) {
      this.startFall(load);
      return;
    }
    load.source?.destroy();
    this.drop(load);
    this.sfx.play('abductSuccess');
    for (let i = 0; i < 14; i++) this.burst(this.hold, 1.5, 1, 0.5, 0.05, 0.6, '#c8fff0', 0.9, 0, 2, this.glow);
    this.say(`${load.species.name} beamed up`);
  }

  /** Follows the load's velocity on the beam from its last place to `position` (its first frame has nothing to go by). */
  private track(load: Load, position: THREE.Vector3, dt: number): void {
    if (dt <= 0) return;
    if (load.moved) load.velocity.subVectors(position, load.object.position).divideScalar(dt);
    load.moved = true;
  }

  private dir(load: Load, point: THREE.Vector3): void {
    load.dir.copy(point).normalize();
  }

  /** It has hit the ground at `load.dir`: it takes root, or its fate starts there. */
  private land(load: Load, quiet: boolean): void {
    if (!quiet) this.sfx.play('dropImpact');
    const dir = load.dir;
    const landing = this.ground.landingAt(dir);
    const fate = plantFate(landing, this.body.world, Math.asin(Math.max(-1, Math.min(1, dir.y))), load.species);
    const groundR = this.ground.groundHeight(dir);
    this.v.copy(dir).multiplyScalar(groundR);
    this.pose(load, this.v, load.full);
    if (!quiet) this.impactFx(load, landing);
    if (fate === 'root') {
      if (load.source && this.v.distanceTo(load.foot) < PUT_BACK_DISTANCE) {
        // Dropped back where it stood: it's simply standing again.
        load.source.restore();
      } else {
        load.source?.destroy();
        this.w.set(1, 0, 0).applyQuaternion(load.object.quaternion);
        this.plantings.plant({
          speciesKey: load.key,
          species: load.species,
          origin: load.origin,
          x: dir.x,
          y: dir.y,
          z: dir.z,
          radius: groundR,
          scale: load.full,
          yaw: plantYaw(dir, this.w),
        });
        if (!quiet) this.say(describeFate('root', load.species.name));
      }
      this.drop(load);
      return;
    }
    if (load.source) {
      // Gone for good from the ground's records, but its object plays out its fate here first.
      load.source.destroy();
      this.scene.add(load.object);
    }
    load.state = 'fate';
    load.fate = fate;
    load.age = 0;
    load.foot.copy(this.v);
    if (!quiet) this.say(describeFate(fate, load.species.name));
  }

  /** Out of the scene for good (its source, if any, has been put back or destroyed already). */
  private drop(load: Load): void {
    const i = this.loads.indexOf(load);
    if (i >= 0) this.loads.splice(i, 1);
    if (this.beam === load) this.beam = null;
    this.scene.remove(load.object);
    load.material.dispose();
  }

  /** Puts the load's base at `position`, upright to the local up with the turn it stood with, at `scale`. */
  private pose(load: Load, position: THREE.Vector3, scale: number): void {
    const o = load.object;
    o.position.copy(position);
    this.up.copy(position).normalize();
    o.quaternion.setFromUnitVectors(load.restUp, this.up).multiply(load.rest);
    if (load.spin !== 0) o.quaternion.premultiply(this.qSpin.setFromAxisAngle(this.up, load.spin));
    o.scale.setScalar(scale);
  }

  /** The nearest plant (grown here or set down) under the ray, in front of the ground. */
  private pickPlant(ray: THREE.Ray): CargoBeam['target'] | null {
    const groundAt = this.ground.groundHit(ray, this.point);
    const limit = groundAt === null ? Infinity : groundAt + GROUND_SLACK;
    const grown = this.plants?.pick(ray, limit) ?? null;
    const planted = this.plantings.pick(ray, grown ? grown.distance : limit);
    const t = this.target;
    if (planted) {
      const p = planted.plant;
      t.id = p.id;
      t.planted = true;
      t.species = p.species;
      t.key = p.speciesKey;
      t.origin = p.origin;
      t.scale = p.scale;
      t.base.set(p.x, p.y, p.z).multiplyScalar(p.radius);
      return t;
    }
    if (grown) {
      const p = grown.plant;
      t.id = grown.id;
      t.planted = false;
      t.species = grown.species;
      t.key = speciesKey(this.body.key, grown.species.index);
      t.origin = this.body.name;
      t.scale = p.scale;
      t.base.set(p.x, p.y, p.z).multiplyScalar(p.radius);
      return t;
    }
    return null;
  }

  /** The aiming ring under the pointer while armed (and not beaming): on the plant to lift, or the ground to set cargo down on. */
  private aim(frameDt: number): void {
    const { pointer } = this.input;
    if (!this.armed || this.beam || !pointer.inside || this.blocked() || this.input.isDragging) {
      this.reticle.hide();
      this.farReticle.hide();
      return;
    }
    this.raycaster.setFromCamera(this.ndc.set(pointer.ndcX, pointer.ndcY), this.camera);
    let size: number;
    if (this.armed === 'abduct') {
      const target = this.pickPlant(this.raycaster.ray);
      if (!target) {
        this.reticle.hide();
        this.farReticle.hide();
        return;
      }
      this.point.copy(target.base);
      size = Math.max(MIN_BEAM_RADIUS, target.species.crownRadius * target.scale * 1.2);
    } else {
      const stack = this.inventory.stack(this.armed.key);
      if (!stack || this.ground.groundHit(this.raycaster.ray, this.point) === null) {
        this.reticle.hide();
        this.farReticle.hide();
        return;
      }
      size = Math.max(MIN_BEAM_RADIUS, stack.species.crownRadius * 1.2);
    }
    const inReach = this.point.distanceTo(this.hold) <= beamParams.range;
    this.up.copy(this.point).normalize();
    this.v.copy(this.point).addScaledVector(this.up, 0.3);
    (inReach ? this.reticle : this.farReticle).place(this.v, size, inReach ? 0.9 : 0.6, this.up, frameDt);
    (inReach ? this.farReticle : this.reticle).hide();
  }

  private drawBeam(frameDt: number): void {
    const load = this.beam;
    if (!load) {
      this.look.hide();
      return;
    }
    const radius = Math.max(MIN_BEAM_RADIUS, load.species.crownRadius * load.full * 1.1);
    this.look.show(load.foot, this.hold, radius, load.state === 'up' ? 1 : -1, frameDt);
  }

  /** Splash, dust or spatter where it lands. */
  private impactFx(load: Load, landing: Landing): void {
    const k = this.sizeOf(load);
    const at = load.object.position;
    switch (landing) {
      case 'sea':
        for (let i = 0; i < 18; i++) this.burst(at, 3 * k, 6 * k, 0.45 * k, 0.12 * k, 0.9, '#e4f6ff', 0.9, -22, 0.4, this.smoke);
        return;
      case 'lava':
        for (let i = 0; i < 16; i++) this.burst(at, 3 * k, 6 * k, 0.4 * k, 0.1 * k, 0.9, '#ff8a2a', 1, -22, 0.4, this.glow);
        return;
      case 'clouds':
        for (let i = 0; i < 10; i++) this.burst(at, 1.5 * k, 1 * k, 1.2 * k, 3 * k, 1.6, '#e9e4dc', 0.55, 0.5, 1.5, this.smoke);
        return;
      case 'land':
        for (let i = 0; i < 10; i++) this.burst(at, 2.5 * k, 0.8 * k, 0.7 * k, 2.2 * k, 1.2, '#8a7b66', 0.5, 0.5, 2, this.smoke);
    }
  }

  /** A plant's size for its effects: about 1 for a mid-sized tree. */
  private sizeOf(load: Load): number {
    return THREE.MathUtils.clamp((load.species.height * load.full) / 7, 0.35, 2);
  }

  /**
   * Throws one particle from `at`: `spread` units/s outward across the ground
   * and `rise` up (both randomised), sized `size` to `endSize`, living `life`
   * seconds, with `lift` along the local up and `drag`.
   */
  private burst(
    at: THREE.Vector3,
    spread: number,
    rise: number,
    size: number,
    endSize: number,
    life: number,
    color: THREE.ColorRepresentation,
    alpha: number,
    lift: number,
    drag: number,
    pool: ParticlePool,
  ): void {
    const p = this.puff;
    this.basis(at);
    const a = this.rng.next() * Math.PI * 2;
    const s = spread * (0.4 + 0.6 * this.rng.next());
    p.position.copy(at);
    p.velocity
      .copy(this.tangent)
      .multiplyScalar(Math.cos(a) * s)
      .addScaledVector(this.bitangent, Math.sin(a) * s)
      .addScaledVector(this.up, rise * (0.5 + 0.5 * this.rng.next()));
    p.up.copy(this.up);
    p.size = size;
    p.endSize = endSize;
    p.life = life * (0.7 + 0.6 * this.rng.next());
    p.color = color;
    p.alpha = alpha;
    p.lift = lift;
    p.drag = drag;
    pool.emit(p);
  }

  /** Emits particles at `rate` per second from random points of the plant's crown (`low`–`high` of its height up, `width` of its crown across). */
  private emitFromCrown(
    load: Load,
    dt: number,
    rate: number,
    low: number,
    high: number,
    width: number,
    emit: (at: THREE.Vector3) => void,
  ): void {
    load.owed += rate * dt;
    const h = load.species.height * load.full;
    const r = load.species.crownRadius * load.full * width;
    this.basis(load.foot);
    while (load.owed >= 1) {
      load.owed--;
      const a = this.rng.next() * Math.PI * 2;
      const d = Math.sqrt(this.rng.next()) * r;
      this.w
        .copy(load.foot)
        .addScaledVector(this.up, h * (low + (high - low) * this.rng.next()))
        .addScaledVector(this.tangent, Math.cos(a) * d)
        .addScaledVector(this.bitangent, Math.sin(a) * d);
      emit(this.w);
    }
  }

  /** `up`, `tangent` and `bitangent` at a point on the ground. */
  private basis(at: THREE.Vector3): void {
    this.up.copy(at).normalize();
    this.tangent.set(0, 1, 0).cross(this.up);
    if (this.tangent.lengthSq() < 1e-6) this.tangent.set(1, 0, 0).cross(this.up);
    this.tangent.normalize();
    this.bitangent.crossVectors(this.up, this.tangent);
  }

  /** One frame of a plant meeting its fate where it landed. */
  private playFate(load: Load, dt: number): void {
    const u = Math.min(1, load.age / FATE_TIME[load.fate]);
    const k = this.sizeOf(load);
    const h = load.species.height * load.full;
    const tint = load.tint;
    const o = load.object;
    const ease = (a: number, b: number) => THREE.MathUtils.smoothstep(u, a, b);
    let sink = 0;
    let sy = 1;
    let sxz = 1;
    switch (load.fate) {
      case 'drown': {
        // It topples into the water, floats a while, waterlogs and goes under, rotting brown.
        tint.uTint.value.set('#3b2a17');
        tint.uTintMix.value = 0.65 * ease(0, 0.8);
        sink = h * 1.2 * ease(0.35, 1) ** 2;
        this.basis(load.foot);
        const tilt = 1.25 * ease(0, 0.2) + 0.08 * Math.sin(load.age * 2.3);
        this.q.setFromAxisAngle(this.tangent, tilt);
        if (this.rng.next() < dt * 5) this.burst(load.foot, 0.6 * k, 1.2 * k, 0.25 * k, 0.05, 0.8, '#e4f6ff', 0.7, 0, 1, this.smoke);
        break;
      }
      case 'burn':
      case 'char': {
        const flames = load.fate === 'burn';
        tint.uTint.value.set('#100b08');
        tint.uTintMix.value = 0.95 * ease(0, 0.6);
        load.material.emissive.set(flames ? '#ff5a10' : '#ff2a00');
        const flicker = 0.75 + 0.25 * Math.sin(load.age * 23) * Math.sin(load.age * 7.1);
        load.material.emissiveIntensity = (flames ? 0.7 : 0.45) * flicker * ease(0, 0.15) * (1 - ease(0.75, 1));
        sy = 1 - 0.85 * ease(0.65, 1) ** 2;
        sxz = 1 - 0.35 * ease(0.65, 1);
        if (flames && u < 0.8) {
          this.emitFromCrown(load, dt, 45 * k, 0.15, 0.9, 0.7, (at) =>
            this.burst(at, 0.6 * k, 2.5 * k, 1.1 * k, 0.15 * k, 0.7, this.rng.next() < 0.5 ? '#ffb347' : '#ff6a1a', 0.85, 6, 0.8, this.glow),
          );
        }
        if (this.rng.next() < dt * (flames ? 10 : 18) * k) {
          this.v.copy(load.foot).addScaledVector(this.up.copy(load.foot).normalize(), h * (0.4 + 0.5 * this.rng.next()));
          this.burst(this.v, 0.4 * k, 1.5 * k, 1 * k, 3.5 * k, 2.6, flames ? '#2c2723' : '#55504b', flames ? 0.5 : 0.45, 2.5, 0.6, this.smoke);
        }
        if (this.rng.next() < dt * 14 * k) this.burst(load.foot, 1 * k, 3 * k, 0.18 * k, 0.05, 1.4, '#ff9a40', 1, 1.5, 0.5, this.glow);
        if (u > 0.97 && !load.burst) {
          load.burst = true;
          for (let i = 0; i < 12; i++) this.burst(load.foot, 2 * k, 0.6 * k, 0.8 * k, 2.4 * k, 1.6, '#5f5a55', 0.5, 0.4, 1.5, this.smoke);
        }
        break;
      }
      case 'freeze': {
        // Frosts over white, then shatters into shards.
        tint.uTint.value.set('#dcefff');
        tint.uTintMix.value = 0.9 * THREE.MathUtils.smoothstep(load.age, 0, SHATTER_AT * 0.85);
        load.material.emissive.set('#9fd6ff');
        load.material.emissiveIntensity = 0.15 * tint.uTintMix.value;
        if (!load.burst && this.rng.next() < dt * 6 * k) {
          this.emitFromCrown(load, 1, 1, 0.2, 0.9, 0.9, (at) => this.burst(at, 0.4 * k, 0.4 * k, 0.6 * k, 1.6 * k, 1.4, '#eef8ff', 0.35, 0.3, 1, this.smoke));
        }
        if (!load.burst && load.age >= SHATTER_AT) {
          load.burst = true;
          o.visible = false;
          load.owed = 0;
          this.emitFromCrown(load, 1, 30 * k, 0.05, 0.95, 0.8, (at) => this.burst(at, 5 * k, 3 * k, 0.32 * k, 0.12 * k, 1.1, '#d6ecff', 0.95, -25, 0.3, this.smoke));
          load.owed = 0;
          this.emitFromCrown(load, 1, 14 * k, 0.1, 0.9, 0.8, (at) => this.burst(at, 3 * k, 2 * k, 0.25 * k, 0.05, 0.6, '#ffffff', 1, -10, 0.5, this.glow));
        }
        break;
      }
      case 'wither': {
        // Browns, droops and slumps into the ground, shedding bits.
        tint.uTint.value.set('#6b5233');
        tint.uTintMix.value = 0.85 * ease(0, 0.5);
        sy = 1 - 0.7 * ease(0.3, 1);
        sxz = 1 + 0.2 * ease(0.3, 1);
        sink = h * 0.15 * ease(0.6, 1);
        if (this.rng.next() < dt * 7 * k) {
          this.emitFromCrown(load, 1, 1, 0.4, 0.95, 0.9, (at) => this.burst(at, 0.5 * k, 0, 0.25 * k, 0.2 * k, 2.2, '#7a5a2a', 0.85, -3, 1.5, this.smoke));
        }
        break;
      }
      case 'dissolve': {
        // Sickly yellow, fuming, eaten away to nothing.
        tint.uTint.value.set('#b9c24a');
        tint.uTintMix.value = 0.75 * ease(0, 0.4);
        const shrink = 1 - ease(0.3, 1);
        sy = shrink;
        sxz = 0.3 + 0.7 * shrink;
        sink = h * 0.2 * ease(0.3, 1);
        if (this.rng.next() < dt * 14 * k) {
          this.emitFromCrown(load, 1, 1, 0.1, 0.8, 0.8, (at) => this.burst(at, 0.4 * k, 0.8 * k, 0.6 * k, 2.2 * k, 2, '#d8d27a', 0.4, 2, 0.8, this.smoke));
        }
        if (this.rng.next() < dt * 10 * k) this.burst(load.foot, 1.2 * k, 0.6 * k, 0.15 * k, 0.05, 0.8, '#d9ff6a', 0.9, 1, 1, this.glow);
        break;
      }
      case 'sink': {
        // Down into the clouds, gone.
        sink = h * 1.5 * u + load.age * 4;
        sy = sxz = 1 - u;
        break;
      }
      case 'root':
        break;
    }
    if (o.visible) {
      this.up.copy(load.foot).normalize();
      this.v.copy(load.foot).addScaledVector(this.up, -sink);
      const spin = load.spin;
      load.spin = 0;
      this.pose(load, this.v, load.full);
      load.spin = spin;
      if (load.fate === 'drown') o.quaternion.premultiply(this.q);
      o.scale.set(load.full * sxz, load.full * sy, load.full * sxz);
    }
  }
}

const BEAM_VERTEX = /* glsl */ `
  uniform float uTop;
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    // A cylinder 0–1 tall, narrowed to uTop of its width at the ship's end.
    vec3 p = position;
    p.xz *= mix(1.0, uTop, p.y);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uDir;
  uniform float uLength;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    // Rings running along the beam (up for abduction, down for setting down), brightest down the middle.
    float bands = 0.5 + 0.5 * sin(vUv.y * uLength * 1.6 - uTime * 9.0 * uDir);
    float streaks = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 7.0 + vUv.y * 3.0 - uTime * 2.0);
    float ends = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
    float a = uOpacity * ends * pow(vFacing, 1.4) * (0.1 + 0.3 * bands * bands + 0.08 * streaks);
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

/** The beam: a glowing cone from the hold down to the ground, with rings running along it, and a glow where it meets the ground. */
class BeamLook {
  private readonly cone: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly foot: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly texture = createGlowTexture();
  private readonly axis = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private time = 0;
  private opacity = 0;

  constructor(private readonly scene: THREE.Scene) {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);
    this.cone = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uTime: { value: 0 },
          uDir: { value: 1 },
          uLength: { value: 1 },
          uOpacity: { value: 0 },
          uTop: { value: 0.3 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.cone.renderOrder = RENDER_ORDER;
    this.cone.frustumCulled = false;
    this.cone.visible = false;
    this.foot = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.foot.renderOrder = RENDER_ORDER;
    this.foot.visible = false;
    scene.add(this.cone, this.foot);
  }

  /** The beam from ground point `foot` up to `hold`, `radius` wide at the ground; `dir` +1 lifts, −1 lowers. */
  show(foot: THREE.Vector3, hold: THREE.Vector3, radius: number, dir: number, frameDt: number): void {
    this.time += frameDt;
    this.opacity = Math.min(1, this.opacity + frameDt * 6);
    const { cone } = this;
    const length = this.axis.subVectors(hold, foot).length();
    cone.position.copy(foot);
    cone.quaternion.setFromUnitVectors(Y, this.axis.divideScalar(Math.max(length, 1e-6)));
    cone.scale.set(radius, length, radius);
    const u = cone.material.uniforms;
    u.uColor!.value.copy(dir > 0 ? BEAM_COLORS.up : BEAM_COLORS.down);
    u.uTime!.value = this.time;
    u.uDir!.value = dir;
    u.uLength!.value = length;
    u.uOpacity!.value = this.opacity;
    u.uTop!.value = Math.min(1, BEAM_TOP / radius);
    cone.visible = true;
    this.normal.copy(foot).normalize();
    this.foot.position.copy(foot).addScaledVector(this.normal, 0.2);
    this.foot.quaternion.setFromUnitVectors(FACING, this.normal);
    this.foot.scale.setScalar(radius * 1.8);
    this.foot.material.color.copy(dir > 0 ? BEAM_COLORS.up : BEAM_COLORS.down).multiplyScalar(0.8 * this.opacity);
    this.foot.visible = true;
  }

  hide(): void {
    this.opacity = 0;
    this.cone.visible = false;
    this.foot.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.cone, this.foot);
    this.cone.geometry.dispose();
    this.cone.material.dispose();
    this.foot.geometry.dispose();
    this.foot.material.dispose();
    this.texture.dispose();
  }
}

const FACING = new THREE.Vector3(0, 0, 1);
