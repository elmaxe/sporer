import * as THREE from 'three';
import type { SoundHandle } from '../audio/CuePlayer';
import type { SoundEffects } from '../audio/sfx';
import { ParticlePool, type Puff } from '../cargo/CargoFx';
import { LaserLook, type LaserGround, type LaserShip } from '../combat/Laser';
import type { ItemStatus } from '../combat/items';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { celsius, type ClimateData } from '../gen/climate';
import { Rng, hashSeed } from '../gen/rng';
import { TERRAFORM_TUNING } from '../gen/terraform';
import { MarkerRing } from '../player/MarkerRing';
import { pointerCamera } from '../world/thirdPerson';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import { formatEnergy } from './energy';
import { HeldLog } from './heldLog';
import { GAS_COLOR, GAS_NAME, nextGas, rayBlocked, rayCost, rayEffect, rayParams, type RayId } from './rays';
import type { TerraformBody, Terraforming } from './Terraforming';

/** The beam leaves from this far below the ship's centre: its underside. */
const MUZZLE_DROP = 0.75;
const RENDER_ORDER = CLOUD_RENDER_ORDER + 1;

/** Each ray's beam (core, glow) and what it throws where it meets the ground. */
const LOOK: Record<RayId, { core: string; glow: string; verb: string }> = {
  heatRay: { core: '#fff1c4', glow: '#ff6a12', verb: 'Pouring heat in' },
  coolRay: { core: '#effcff', glow: '#4cc4ff', verb: 'Drawing heat out' },
  airRay: { core: '#f4fffa', glow: '#7fe0c0', verb: 'Pouring in' },
  vacuumRay: { core: '#f7edff', glow: '#a070ff', verb: 'Sucking up' },
  waterRay: { core: '#eaf6ff', glow: '#3a86ff', verb: 'Raining' },
};

/**
 * The magic terraforming rays in low orbit (a planet-level entity;
 * terraform/rays.ts says what each does). Selected on the item bar's
 * Terraform tab (`arm`), a ring follows the pointer over the ground; a held
 * press fires the ray, a beam from the ship's underside to the ground
 * following the pointer, and writes the body's action log as it's held (one
 * action a second, at the rate the world has then), paid for with the
 * ship's energy. Where it meets the ground: heat glowing, frost, gas
 * spreading or sucked up, rain or steam. G switches the gas the air and
 * vacuum rays move, or which way the water ray works (also on the climate
 * chart). Sound: the `magicRay` loop while it's held.
 */
export class MagicRay implements Entity {
  private _armed: RayId | null = null;
  private firing = false;
  /** Writes the held ray into the body's log, one action a second. */
  private readonly held: HeldLog;
  private lastTime = 0;
  private sound: SoundHandle | null = null;
  private readonly looks = new Map<RayId, LaserLook>();
  private readonly reticle: MarkerRing;
  private readonly glow: ParticlePool;
  private readonly puffs: ParticlePool;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly foot = new THREE.Vector3();
  private readonly muzzle = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly bitangent = new THREE.Vector3();
  private readonly rng: Rng;
  private owed = 0;
  private gWasDown = false;
  private note = '';
  private noteTime = 0;
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

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly globe: LaserGround,
    private readonly ship: LaserShip,
    private readonly terraforming: Terraforming,
    /** The body below, as terraforming knows it. */
    private readonly body: TerraformBody,
    private readonly sfx: SoundEffects,
    /** Why the rays can't be used now (the planet buster going off, the body busted), or null. */
    private readonly blocked: () => string | null,
    debug: Debug,
  ) {
    this.rng = new Rng(hashSeed('magic-ray', body.key));
    this.held = new HeldLog(terraforming, body.key);
    this.reticle = new MarkerRing(scene, '#7dffa8', 0.1, 0.16);
    this.glow = new ParticlePool(scene, true, RENDER_ORDER + 1);
    this.puffs = new ParticlePool(scene, false, RENDER_ORDER);
    const f = debug.folder('Magic rays');
    f?.add(rayParams, 'kelvinPerSecond', 0.5, 20);
    f?.add(rayParams, 'gasPerSecond', 0.05, 3);
    f?.add(rayParams, 'minGasPerSecond', 0, 0.01);
    f?.add(rayParams, 'waterPerSecond', 0.005, 0.2);
    f?.add(rayParams, 'speed', 0.1, 20).name('speed (debug ×)');
    f?.add({ finite: !terraforming.energy.infinite }, 'finite').name('finite energy').onChange((v: boolean) => terraforming.energy.setInfinite(!v));
  }

  /** The ray selected on the item bar, if any. */
  get armed(): RayId | null {
    return this._armed;
  }

  /** True while a ray is held on the world. */
  get on(): boolean {
    return this.firing;
  }

  arm(ray: RayId | null): void {
    this._armed = ray !== null && this.blocked() === null ? ray : null;
    if (this._armed === null || this.firing) this.stop();
    if (this._armed === null) this.reticle.hide();
    document.body.classList.toggle('aiming', this._armed !== null);
  }

  /** The item bar's line for `ray`: what it's doing, what it costs. */
  status(ray: RayId): ItemStatus {
    const reason = this.blocked();
    const cost = rayCost(ray, this.body.climate, this.terraforming.mode);
    const costText = cost > 0 ? `${formatEnergy(cost)}/s` : 'free';
    if (reason !== null) return { available: false, hint: '', reason, cost: costText };
    if (this._armed !== ray) return { available: true, hint: '', cost: costText };
    if (this.noteTime > 0) return { available: true, hint: this.note, cost: costText };
    const climate = this.climateNow();
    const what = this.what(ray);
    const blocked = rayBlocked(ray, climate, this.terraforming.choice);
    if (this.firing) {
      const target = this.terraforming.snapshot(this.body)?.target ?? climate;
      return { available: true, hint: `${LOOK[ray].verb}${what}: settling towards ${celsius(target.temperature)}`, cost: costText };
    }
    if (blocked) return { available: true, hint: blocked, cost: costText };
    const press = this.input.touchMode ? 'Touch and hold' : 'Click and hold';
    const pick = ray === 'airRay' || ray === 'vacuumRay' ? ` (${this.input.touchMode ? 'pick the gas on the chart' : 'G or the chart picks the gas'})` : ray === 'waterRay' ? ` (${this.input.touchMode ? 'the chart switches' : 'G switches'} rain and steam)` : '';
    return { available: true, hint: `${press} on the world: ${LOOK[ray].verb.toLowerCase()}${what}${pick}`, cost: costText };
  }

  /** e.g. " N₂", " (steam)". */
  private what(ray: RayId): string {
    const { choice } = this.terraforming;
    if (ray === 'airRay' || ray === 'vacuumRay') return ` ${GAS_NAME[choice.gas]}`;
    if (ray === 'waterRay') return choice.water === 'add' ? ' water' : ' water away as steam';
    return '';
  }

  private climateNow(): ClimateData {
    return this.terraforming.climate(this.body);
  }

  update(frameDt: number): void {
    const dt = Math.min(frameDt, 0.1);
    if (this.noteTime > 0) this.noteTime -= frameDt;
    if (this._armed && this.blocked() !== null) this.arm(null);
    this.switchKey();
    this.muzzle.copy(this.ship.object.position).addScaledVector(this.ship.up, -MUZZLE_DROP);
    if (this._armed && !this.firing) {
      const press = this.input.consumePress();
      if (press) {
        this.input.capturePress();
        if (this.aimAt(press.ndcX, press.ndcY)) this.start();
      }
    }
    if (this.firing && (!this.input.primaryDown || !this._armed)) this.stop();
    if (this.firing) {
      const { pointer } = this.input;
      if (pointer.inside) this.aimAt(pointer.ndcX, pointer.ndcY);
      this.grow();
      this.throwPuffs(dt);
    }
    this.aim(frameDt);
    for (const [ray, look] of this.looks) {
      if (this.firing && ray === this._armed) look.show(this.muzzle, this.foot, this.camera, frameDt);
      else look.hide();
    }
    const height = this.canvas?.height ?? 720;
    this.glow.setView(height, this.camera.fov);
    this.puffs.setView(height, this.camera.fov);
    this.glow.update(dt);
    this.puffs.update(dt);
  }

  /** G: the next gas for the air and vacuum rays, or the other way for the water ray (while one of them is armed). */
  private switchKey(): void {
    const down = this.input.isDown('KeyG');
    if (down && !this.gWasDown && this._armed) {
      const { choice } = this.terraforming;
      if (this._armed === 'airRay' || this._armed === 'vacuumRay') {
        choice.gas = nextGas(choice.gas);
        this.say(`${this._armed === 'airRay' ? 'Air' : 'Vacuum'} ray: ${GAS_NAME[choice.gas]}`);
      } else if (this._armed === 'waterRay') {
        choice.water = choice.water === 'add' ? 'take' : 'add';
        this.say(choice.water === 'add' ? 'Water ray: rain' : 'Water ray: steam (takes water away)');
      }
      // A held ray carries on with the new choice from its next second.
      this.held.reset();
    }
    this.gWasDown = down;
  }

  dispose(): void {
    this.stop();
    this.arm(null);
    for (const look of this.looks.values()) look.dispose();
    this.reticle.dispose();
    this.glow.dispose();
    this.puffs.dispose();
  }

  private start(): void {
    const ray = this._armed!;
    const blocked = rayBlocked(ray, this.climateNow(), this.terraforming.choice);
    if (blocked) {
      this.say(blocked);
      return;
    }
    if (!this.looks.has(ray)) this.looks.set(ray, new LaserLook(this.scene, new THREE.Color(LOOK[ray].core), new THREE.Color(LOOK[ray].glow)));
    this.firing = true;
    this.held.reset();
    this.lastTime = this.terraforming.time;
    this.sound = this.sfx.start('magicRay');
  }

  private stop(): void {
    if (this.firing) this.grow(true);
    this.firing = false;
    this.held.reset();
    this.terraforming.energy.draining = 0;
    this.sound?.stop();
    this.sound = null;
  }

  /**
   * Writes the held ray into the log up to now and pays for it: the action
   * of this second grows, and each new second starts a new one at the rate
   * the world has then (`last`: letting go, nothing new starts).
   */
  private grow(last = false): void {
    const t = this.terraforming;
    const ray = this._armed;
    if (!ray) return;
    const now = t.time;
    const cost = rayCost(ray, this.body.climate, t.mode);
    const spent = now - this.lastTime;
    this.lastTime = now;
    if (spent > 0 && !t.energy.spend(cost * spent)) {
      this.say('Not enough energy');
      this.firing = false;
      this.stop();
      return;
    }
    t.energy.draining = last ? 0 : cost;
    // Each new second at the rate the world has then (the air as it will be once what's let go has spread).
    this.held.write(
      last,
      (time) => {
        const anchor = this.anchor(ray, time);
        return rayBlocked(ray, anchor, t.choice) ? null : rayEffect(ray, anchor, t.choice);
      },
      this.site(),
    );
  }

  /** The climate a ray's rate is worked out from at game time `time`. */
  private anchor(ray: RayId, time: number): ClimateData {
    const t = this.terraforming;
    if (ray === 'heatRay' || ray === 'coolRay') return t.snapshot(this.body, time)?.target ?? this.body.climate;
    if (ray === 'airRay' || ray === 'vacuumRay') return t.snapshot(this.body, time + TERRAFORM_TUNING[t.mode].spreadTime)?.climate ?? this.body.climate;
    return t.snapshot(this.body, time)?.climate ?? this.body.climate;
  }

  /** Where the beam meets the ground, as a unit vector in the body frame. */
  private site(): [number, number, number] {
    this.v.copy(this.foot).normalize();
    return [this.v.x, this.v.y, this.v.z];
  }

  private aimAt(ndcX: number, ndcY: number): boolean {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), pointerCamera(this.camera));
    return this.globe.groundHit(this.raycaster.ray, this.foot) !== null;
  }

  /** The ring on the ground under the pointer while armed (and not firing). */
  private aim(frameDt: number): void {
    const { pointer } = this.input;
    if (!this._armed || this.firing || !pointer.inside || this.input.blocked || this.input.isDragging || !this.aimAt(pointer.ndcX, pointer.ndcY)) {
      this.reticle.hide();
      return;
    }
    this.up.copy(this.foot).normalize();
    this.v.copy(this.foot).addScaledVector(this.up, 0.3);
    const size = Math.max(1, this.camera.position.distanceTo(this.v) * 0.015);
    this.reticle.place(this.v, size, 0.9, this.up, frameDt);
  }

  private say(text: string): void {
    this.note = text;
    this.noteTime = 2.5;
  }

  /** What the ray throws where it meets the ground (and along the beam). */
  private throwPuffs(dt: number): void {
    const ray = this._armed!;
    this.basis(this.foot);
    const scale = Math.max(0.6, Math.min(4, this.camera.position.distanceTo(this.foot) * 0.02));
    this.owed += dt * 50;
    const { gas, water } = this.terraforming.choice;
    while (this.owed >= 1) {
      this.owed--;
      const r = this.rng.next();
      switch (ray) {
        case 'heatRay':
          this.throwPuff(this.foot, 1.5 * scale, 2 * scale, 0.5 * scale, 1.6 * scale, 1, r < 0.5 ? '#ffb347' : '#ff5a1a', 0.9, 2, 1, this.glow);
          break;
        case 'coolRay':
          this.throwPuff(this.foot, 3 * scale, 0.3 * scale, 0.6 * scale, 2.4 * scale, 1.6, r < 0.5 ? '#ffffff' : '#bfe8ff', 0.5, -0.2, 1.5, this.puffs);
          break;
        case 'airRay':
          this.throwPuff(this.foot, 5 * scale, 0.6 * scale, 0.8 * scale, 3.5 * scale, 1.8, GAS_COLOR[gas], 0.35, 0.3, 1, this.puffs);
          break;
        case 'vacuumRay': {
          // Drawn up the beam towards the ship.
          this.v.copy(this.foot).lerp(this.muzzle, r * 0.3);
          this.throwPuff(this.v, 1 * scale, 0, 0.7 * scale, 0.2 * scale, 1.2, GAS_COLOR[gas], 0.4, 0, 0, this.puffs, this.muzzle);
          break;
        }
        case 'waterRay':
          if (water === 'add') {
            // Rain falling out of the beam's lower half.
            this.v.copy(this.foot).lerp(this.muzzle, 0.1 + 0.4 * r);
            this.throwPuff(this.v, 0.8 * scale, -4 * scale, 0.18 * scale, 0.12 * scale, 0.6, '#9cc8ff', 0.8, -20, 0, this.puffs);
          } else {
            this.throwPuff(this.foot, 1.2 * scale, 2.5 * scale, 0.8 * scale, 3 * scale, 1.6, '#e8eef4', 0.4, 1.5, 0.8, this.puffs);
          }
          break;
      }
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

  /** Throws one particle from `at` (call `basis` first); see Laser's. */
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
    /** Thrown towards this point instead (sucked up the beam). */
    toward: THREE.Vector3 | null = null,
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
    if (toward) p.velocity.subVectors(toward, at).multiplyScalar(0.8 / Math.max(life, 0.1));
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
