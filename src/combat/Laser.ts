import * as THREE from 'three';
import type { SoundHandle } from '../audio/CuePlayer';
import type { SoundEffects } from '../audio/sfx';
import { ParticlePool, type Puff } from '../cargo/CargoFx';
import { cargoSize } from '../cargo/inventory';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { GroundHeight } from '../planet/ground';
import { MarkerRing } from '../player/MarkerRing';
import type { AnimalObject } from '../surface/liveAnimal';
import type { Plantings } from '../surface/Plantings';
import { createTintedPlantMaterial, type PlantFadeUniforms } from '../surface/plantLook';
import type { SurfaceAnimals } from '../surface/SurfaceAnimals';
import type { SurfaceEntities } from '../surface/SurfaceEntities';
import { Rng, hashSeed } from '../gen/rng';
import { createGlowTexture } from '../world/glowTexture';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import type { ItemStatus } from './items';
import { burnAt, laserParams, laserWidth, type Burn } from './laserRules';

/** What the laser needs from the globe (see PlanetGlobe). */
export interface LaserGround {
  readonly groundHeight: GroundHeight;
  groundHit(ray: THREE.Ray, out: THREE.Vector3): number | null;
}

/** What the laser needs from the ship: where it is and which way is up. */
export interface LaserShip {
  readonly object: THREE.Object3D;
  readonly up: THREE.Vector3;
}

/** What lives on the body for the laser to kill (the level's, gone once it's busted). */
export interface LaserTargets {
  readonly plants: SurfaceEntities | null;
  readonly plantings: Plantings | null;
  readonly animals: SurfaceAnimals | null;
}

/** The beam leaves from this far below the ship's centre: its underside. */
const MUZZLE_DROP = 0.75;
/** How far past the ground's hit an animal or a plant can still be hit: it's wider than a point. */
const GROUND_SLACK = 1;
/** Seconds a note (what it killed) stays on the hint line. */
const NOTE_SECONDS = 2.5;
const CORE_COLOR = new THREE.Color('#ffd9d0');
const GLOW_COLOR = new THREE.Color('#ff2a1a');
const RENDER_ORDER = CLOUD_RENDER_ORDER + 1;
const Y = new THREE.Vector3(0, 1, 0);

/** An animal or a plant the laser killed, burning away where it was hit. */
interface Death {
  readonly object: THREE.Object3D;
  readonly material: THREE.MeshStandardMaterial;
  readonly tint: Pick<PlantFadeUniforms, 'uTint' | 'uTintMix'>;
  /** An animal's own look (disposed when it's gone), or null for a plant (its material is ours). */
  readonly animal: AnimalObject | null;
  /** Where it stood, its height and reach (units), and how it stood. */
  readonly foot: THREE.Vector3;
  readonly height: number;
  readonly radius: number;
  readonly rest: THREE.Quaternion;
  readonly scale: THREE.Vector3;
  readonly duration: number;
  age: number;
  /** Smoke owed (fractions carry over between frames). */
  owed: number;
}

/**
 * The laser in low orbit (a planet-level entity). Selected on the item bar's
 * Weapons tab (`arm`), a red ring follows the pointer over the ground; a
 * press fires it, a beam of light from the ship's underside to whatever the
 * pointer is held on, following it until it's let go. Every animal and plant
 * it touches (the first thing along the ray, and any within
 * `laserParams.reach` of where it meets the ground) dies: taken out of the
 * herds and plants as an object of its own (`promote`), recorded as removed
 * in the planet's change list, and burns away where it stood (blackening and
 * glowing; an animal falls onto its side; then crumbling or sinking into the
 * ground, with smoke and embers). Sparks fly where the beam meets the ground.
 * Sounds: the `laserBeam` loop while it fires, `laserHit` at every kill.
 */
export class Laser implements Entity {
  private _armed = false;
  private firing = false;
  private readonly foot = new THREE.Vector3();
  private readonly muzzle = new THREE.Vector3();
  private readonly deaths: Death[] = [];
  private sound: SoundHandle | null = null;
  private note = '';
  private noteTime = 0;
  private kills = 0;
  private readonly look: LaserLook;
  private readonly reticle: MarkerRing;
  private readonly sparks: ParticlePool;
  private readonly smoke: ParticlePool;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly ground = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly bitangent = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly burn: Burn = { char: 0, glow: 0, topple: 0, gone: 0, done: false };
  private sparksOwed = 0;
  private smokeOwed = 0;
  private readonly rng: Rng;
  private readonly canvas = document.querySelector('canvas');
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
  /** Ids hit this frame (made once, so firing allocates nothing but the kills). */
  private readonly killAnimal = (hit: { id: string }): void => this.kill('animal', hit.id);
  private readonly killGrown = (hit: { id: string }): void => this.kill('grown', hit.id);
  private readonly killPlanted = (hit: { id: string }): void => this.kill('planted', hit.id);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly globe: LaserGround,
    private readonly ship: LaserShip,
    private readonly targets: LaserTargets,
    private readonly sfx: SoundEffects,
    /** Why it can't be fired now (the planet buster going off), or null. */
    private readonly blocked: () => string | null,
    /** Seeds its sparks (everything visual is seeded). */
    seed: string,
    debug: Debug,
  ) {
    this.rng = new Rng(hashSeed('laser', seed));
    this.look = new LaserLook(scene);
    this.reticle = new MarkerRing(scene, '#ff4a3a', 0.1, 0.16);
    this.sparks = new ParticlePool(scene, true, RENDER_ORDER + 1);
    this.smoke = new ParticlePool(scene, false, RENDER_ORDER);
    const f = debug.folder('Laser');
    f?.add(laserParams, 'width', 0.02, 1);
    f?.add(laserParams, 'minAngle', 0, 0.01);
    f?.add(laserParams, 'reach', 0, 6);
    f?.add(laserParams, 'plantBurn', 0.3, 6);
    f?.add(laserParams, 'animalBurn', 0.3, 6);
    f?.add(laserParams, 'sparks', 0, 300);
    f?.add(laserParams, 'smoke', 0, 60);
  }

  /** Selected on the item bar: a press fires it. */
  get armed(): boolean {
    return this._armed;
  }

  /** True while it fires (held). */
  get on(): boolean {
    return this.firing;
  }

  /** How many animals and plants it has killed on this visit, and how many are still burning (for tests). */
  get killed(): number {
    return this.kills;
  }

  get burning(): number {
    return this.deaths.length;
  }

  arm(on: boolean): void {
    this._armed = on && this.blocked() === null;
    if (!this._armed) {
      this.stop();
      this.reticle.hide();
    }
    document.body.classList.toggle('aiming', this._armed);
  }

  status(): ItemStatus {
    const reason = this.blocked();
    if (reason !== null) return { available: false, hint: '', reason };
    if (!this._armed) return { available: true, hint: '' };
    if (this.noteTime > 0) return { available: true, hint: this.note };
    if (this.firing) return { available: true, hint: 'Hold it on animals and plants to burn them' };
    return { available: true, hint: this.input.touchMode ? 'Touch and hold to fire the laser' : 'Click and hold to fire the laser' };
  }

  update(frameDt: number): void {
    const dt = Math.min(frameDt, 0.1);
    if (this.noteTime > 0) this.noteTime -= frameDt;
    if (this._armed && this.blocked() !== null) this.arm(false);
    this.muzzle.copy(this.ship.object.position).addScaledVector(this.ship.up, -MUZZLE_DROP);
    if (this._armed && !this.firing) {
      const press = this.input.consumePress();
      // The press is the laser's, wherever it lands: no flying off while it's armed.
      if (press) {
        this.input.capturePress();
        if (this.aimAt(press.ndcX, press.ndcY)) this.start();
      }
    }
    if (this.firing && (!this.input.primaryDown || !this._armed)) this.stop();
    if (this.firing) {
      const { pointer } = this.input;
      if (pointer.inside) this.aimAt(pointer.ndcX, pointer.ndcY);
      this.hit();
      this.throwSparks(dt);
    }
    for (let i = this.deaths.length - 1; i >= 0; i--) this.burnAway(this.deaths[i]!, i, dt);
    this.aim(frameDt);
    if (this.firing) this.look.show(this.muzzle, this.foot, this.camera, frameDt);
    else this.look.hide();
    const height = this.canvas?.height ?? 720;
    this.sparks.setView(height, this.camera.fov);
    this.smoke.setView(height, this.camera.fov);
    this.sparks.update(dt);
    this.smoke.update(dt);
  }

  /** Everything burning goes at once (the body was blown apart, or the level is going). */
  clear(): void {
    this.stop();
    for (let i = this.deaths.length - 1; i >= 0; i--) this.finish(this.deaths[i]!, i);
  }

  dispose(): void {
    this.clear();
    this.arm(false);
    this.look.dispose();
    this.reticle.dispose();
    this.sparks.dispose();
    this.smoke.dispose();
  }

  private start(): void {
    this.firing = true;
    this.sound = this.sfx.start('laserBeam');
  }

  private stop(): void {
    this.firing = false;
    this.sound?.stop();
    this.sound = null;
  }

  /**
   * Points the beam along the ray through `ndc`: into `foot`, the first
   * animal or plant it passes through or the ground it hits, and into
   * `ground` the ground behind it. False if it hits neither.
   */
  private aimAt(ndcX: number, ndcY: number): boolean {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), this.camera);
    const { ray } = this.raycaster;
    const groundAt = this.globe.groundHit(ray, this.ground);
    const limit = groundAt === null ? Infinity : groundAt + GROUND_SLACK;
    const { animals, plants, plantings } = this.targets;
    const animal = animals?.pick(ray, limit) ?? null;
    const grown = plants?.pick(ray, animal ? animal.distance : limit) ?? null;
    const planted = plantings?.pick(ray, grown ? grown.distance : animal ? animal.distance : limit) ?? null;
    const first = planted ?? grown ?? animal;
    if (first) {
      ray.at(first.distance, this.foot);
      if (groundAt === null) this.ground.copy(this.foot);
      return true;
    }
    if (groundAt === null) return false;
    this.foot.copy(this.ground);
    return true;
  }

  /** Kills what the beam touches now: the first thing along it, and anything round where it meets the ground. */
  private hit(): void {
    const { animals, plants, plantings } = this.targets;
    // Along the beam itself, from the ship to its end.
    this.raycaster.ray.origin.copy(this.muzzle);
    this.raycaster.ray.direction.subVectors(this.foot, this.muzzle);
    const length = this.raycaster.ray.direction.length();
    if (length > 1e-6) {
      this.raycaster.ray.direction.divideScalar(length);
      const reach = length + GROUND_SLACK;
      const animal = animals?.pick(this.raycaster.ray, reach) ?? null;
      if (animal) this.kill('animal', animal.id);
      const grown = plants?.pick(this.raycaster.ray, reach) ?? null;
      if (grown) this.kill('grown', grown.id);
      const planted = plantings?.pick(this.raycaster.ray, reach) ?? null;
      if (planted) this.kill('planted', planted.id);
    }
    const r = laserParams.reach;
    if (r <= 0) return;
    animals?.within(this.ground, r, this.killAnimal);
    plants?.within(this.ground, r, this.killGrown);
    plantings?.within(this.ground, r, this.killPlanted);
  }

  /** Kills one animal or plant: out of the ground's records for good, its object left to burn away where it stood. */
  private kill(from: 'animal' | 'grown' | 'planted', id: string): void {
    const { animals, plants, plantings } = this.targets;
    if (from === 'animal') {
      const live = animals?.promote(id);
      if (!live) return;
      live.destroy();
      const { look } = live;
      const size = cargoSize({ kind: 'animal', species: live.species });
      this.addDeath(look.object, look.material, look.tint, look, size.height * live.scale, size.radius * live.scale, laserParams.animalBurn);
      this.say(`${live.species.name} killed`);
    } else {
      const live = from === 'grown' ? (plants?.promote(id) ?? null) : (plantings?.promote(id) ?? null);
      if (!live) return;
      const { object } = live;
      const mesh = object.children[0] as THREE.Mesh;
      const { material, tint } = createTintedPlantMaterial(0);
      mesh.material = material;
      const s = object.scale.y;
      live.destroy();
      // Gone from the ground's records, but its object burns away here first.
      this.scene.add(object);
      this.addDeath(object, material, tint, null, live.species.height * s, live.species.crownRadius * s, laserParams.plantBurn);
      this.say(`${live.species.name} burnt down`);
    }
    this.kills++;
    this.sfx.play('laserHit');
  }

  private addDeath(
    object: THREE.Object3D,
    material: THREE.MeshStandardMaterial,
    tint: Death['tint'],
    animal: AnimalObject | null,
    height: number,
    radius: number,
    duration: number,
  ): void {
    animal?.move(0, 0, 0, 0, 0);
    this.deaths.push({
      object,
      material,
      tint,
      animal,
      foot: object.position.clone(),
      height,
      radius,
      rest: object.quaternion.clone(),
      scale: object.scale.clone(),
      duration,
      age: 0,
      owed: 0,
    });
    // A flash of sparks where it was hit.
    this.basis(object.position);
    for (let i = 0; i < 18; i++) {
      this.v.copy(object.position).addScaledVector(this.up, height * (0.2 + 0.6 * this.rng.next()));
      this.throwPuff(this.v, 6, 4, 0.18, 0.04, 0.5, this.rng.next() < 0.5 ? '#ffd27a' : '#ff6a2a', 1, -12, 1, this.sparks);
    }
  }

  /** One frame of a killed animal or plant burning away. */
  private burnAway(d: Death, index: number, dt: number): void {
    d.age += dt;
    const b = burnAt(d.age, d.duration, this.burn);
    if (b.done) {
      this.finish(d, index);
      return;
    }
    d.tint.uTint.value.set('#120c09');
    d.tint.uTintMix.value = 0.95 * b.char;
    // Embers glowing through the char: a deep orange, dim enough that the black shows.
    d.material.emissive.set('#ff3c00');
    const flicker = 0.75 + 0.25 * Math.sin(d.age * 23) * Math.sin(d.age * 7.1);
    d.material.emissiveIntensity = 0.25 * b.glow * flicker;
    const o = d.object;
    this.up.copy(d.foot).normalize();
    if (d.animal) {
      // Falls onto its side (about its own forward axis), then sinks into the ground and shrinks away.
      this.v.set(0, 0, 1).applyQuaternion(d.rest);
      o.quaternion.copy(d.rest).premultiply(this.q.setFromAxisAngle(this.v, (Math.PI / 2) * b.topple));
      o.position.copy(d.foot).addScaledVector(this.up, d.radius * 0.35 * b.topple - d.height * 0.6 * b.gone);
      o.scale.copy(d.scale).multiplyScalar(1 - 0.5 * b.gone);
    } else {
      // Crumbles down to ash.
      o.position.copy(d.foot);
      o.quaternion.copy(d.rest);
      o.scale.set(d.scale.x * (1 - 0.4 * b.gone), d.scale.y * (1 - 0.92 * b.gone), d.scale.z * (1 - 0.4 * b.gone));
    }
    // Smoke rising, and embers while it glows.
    d.owed += dt * laserParams.smoke * (1 - b.gone) * 1.5;
    this.basis(d.foot);
    while (d.owed >= 1) {
      d.owed--;
      this.v.copy(d.foot).addScaledVector(this.up, d.height * (0.2 + 0.6 * this.rng.next()));
      const k = Math.min(2, Math.max(0.4, d.height / 5));
      this.throwPuff(this.v, 0.6 * k, 1.5 * k, 0.9 * k, 3 * k, 2.4, '#2c2622', 0.5, 2.5, 0.6, this.smoke);
      if (b.glow > 0.2) this.throwPuff(this.v, 1.2 * k, 3 * k, 0.16 * k, 0.04, 1.2, '#ff9a40', 1, 1.5, 0.5, this.sparks);
    }
  }

  private finish(d: Death, index: number): void {
    this.deaths.splice(index, 1);
    // A last puff of ash.
    this.basis(d.foot);
    for (let i = 0; i < 8; i++) this.throwPuff(d.foot, 1.5, 0.6, 0.6, 2, 1.4, '#5f5a55', 0.45, 0.4, 1.5, this.smoke);
    if (d.animal) d.animal.dispose();
    else {
      this.scene.remove(d.object);
      d.material.dispose();
    }
  }

  /** Sparks and smoke where the beam meets the ground. */
  private throwSparks(dt: number): void {
    this.basis(this.foot);
    this.sparksOwed += dt * laserParams.sparks;
    while (this.sparksOwed >= 1) {
      this.sparksOwed--;
      this.throwPuff(this.foot, 5, 4, 0.12, 0.03, 0.35 + 0.3 * this.rng.next(), this.rng.next() < 0.6 ? '#ffe2a0' : '#ff5a20', 1, -14, 1.5, this.sparks);
    }
    this.smokeOwed += dt * laserParams.smoke;
    while (this.smokeOwed >= 1) {
      this.smokeOwed--;
      this.throwPuff(this.foot, 0.4, 1.2, 0.5, 2.2, 1.6, '#3b3632', 0.35, 1.5, 0.8, this.smoke);
    }
  }

  /** The red ring on the ground under the pointer while armed (and not firing). */
  private aim(frameDt: number): void {
    const { pointer } = this.input;
    if (!this._armed || this.firing || !pointer.inside || this.input.blocked || this.input.isDragging || !this.aimAt(pointer.ndcX, pointer.ndcY)) {
      this.reticle.hide();
      return;
    }
    this.up.copy(this.ground).normalize();
    this.v.copy(this.ground).addScaledVector(this.up, 0.3);
    const size = Math.max(laserParams.reach, this.camera.position.distanceTo(this.v) * 0.015);
    this.reticle.place(this.v, size, 0.9, this.up, frameDt);
  }

  private say(text: string): void {
    this.note = text;
    this.noteTime = NOTE_SECONDS;
  }

  /** `up`, `tangent` and `bitangent` at a point on the ground. */
  private basis(at: THREE.Vector3): void {
    this.up.copy(at).normalize();
    this.tangent.set(0, 1, 0).cross(this.up);
    if (this.tangent.lengthSq() < 1e-6) this.tangent.set(1, 0, 0).cross(this.up);
    this.tangent.normalize();
    this.bitangent.crossVectors(this.up, this.tangent);
  }

  /**
   * Throws one particle from `at` (call `basis` first): `spread` units/s
   * outward across the ground and `rise` up (both randomised), sized `size`
   * to `endSize`, living `life` seconds, with `lift` along the local up and `drag`.
   */
  private throwPuff(
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
}

const BEAM_VERTEX = /* glsl */ `
  varying float vFacing;
  varying float vAlong;
  void main() {
    vAlong = uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uLength;
  uniform float uSharp;
  varying float vFacing;
  varying float vAlong;
  void main() {
    // Brightest down the middle, a shimmer running down it.
    float shimmer = 0.85 + 0.15 * sin(vAlong * uLength * 0.9 + uTime * 40.0);
    float a = uOpacity * pow(vFacing, uSharp) * shimmer;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

/** The beam: a hot white core in a red glow, from the ship's underside to where it meets the ground, with a glow at each end. */
class LaserLook {
  private readonly core: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly halo: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly geometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0);
  private readonly texture = createGlowTexture();
  private readonly ends: THREE.Sprite[];
  private readonly axis = new THREE.Vector3();
  private readonly middle = new THREE.Vector3();
  private time = 0;

  constructor(private readonly scene: THREE.Scene) {
    const material = (color: THREE.Color, sharp: number) =>
      new THREE.ShaderMaterial({
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 1 }, uTime: { value: 0 }, uLength: { value: 1 }, uSharp: { value: sharp } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
    this.core = new THREE.Mesh(this.geometry, material(CORE_COLOR, 1.5));
    this.halo = new THREE.Mesh(this.geometry, material(GLOW_COLOR, 2.5));
    this.ends = [0, 1].map(() => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.texture, color: GLOW_COLOR, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
      );
      sprite.renderOrder = RENDER_ORDER + 1;
      return sprite;
    });
    for (const o of [this.core, this.halo]) {
      o.renderOrder = RENDER_ORDER;
      o.frustumCulled = false;
    }
    this.hide();
    scene.add(this.halo, this.core, ...this.ends);
  }

  show(from: THREE.Vector3, to: THREE.Vector3, camera: THREE.Camera, frameDt: number): void {
    this.time += frameDt;
    const length = this.axis.subVectors(to, from).length();
    this.axis.divideScalar(Math.max(length, 1e-6));
    this.middle.lerpVectors(from, to, 0.5);
    // Wide enough to see from afar: by its distance from the camera at its middle and nearest end.
    const width = laserWidth(Math.min(camera.position.distanceTo(this.middle), camera.position.distanceTo(to)));
    const flicker = 0.9 + 0.1 * Math.sin(this.time * 61) * Math.sin(this.time * 23);
    for (const [mesh, w] of [
      [this.core, width],
      [this.halo, width * 4],
    ] as const) {
      mesh.position.copy(from);
      mesh.quaternion.setFromUnitVectors(Y, this.axis);
      mesh.scale.set(w * flicker, length, w * flicker);
      const u = mesh.material.uniforms;
      u.uTime!.value = this.time;
      u.uLength!.value = length;
      mesh.visible = true;
    }
    const [top, bottom] = this.ends as [THREE.Sprite, THREE.Sprite];
    top.position.copy(from);
    top.scale.setScalar(width * 10);
    bottom.position.copy(to);
    bottom.scale.setScalar(width * 18 * flicker);
    top.visible = bottom.visible = true;
  }

  hide(): void {
    this.core.visible = this.halo.visible = false;
    for (const s of this.ends) s.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.core, this.halo, ...this.ends);
    this.geometry.dispose();
    this.core.material.dispose();
    this.halo.material.dispose();
    for (const s of this.ends) s.material.dispose();
    this.texture.dispose();
  }
}
