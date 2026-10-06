import * as THREE from 'three';
import type { SoundHandle } from '../audio/CuePlayer';
import type { SoundEffects } from '../audio/sfx';
import { ParticlePool, type Puff } from '../cargo/CargoFx';
import { Laser, type LaserGround, type LaserShip, type LaserTargets } from '../combat/Laser';
import type { ItemStatus, LightToolId } from '../combat/items';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { celsius, type ClimateData } from '../gen/climate';
import { Rng, hashSeed } from '../gen/rng';
import { MarkerRing } from '../player/MarkerRing';
import { pointerCamera } from '../world/thirdPerson';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import { formatEnergy } from './energy';
import { HeldLog } from './heldLog';
import { LightRig } from './LightRig';
import {
  LIGHT_LIMITS,
  aerosolBlocked,
  aerosolRate,
  heldCost,
  installationsAt,
  lightParams,
  mirrorAction,
  mirrorCost,
  shadeAction,
  shadeCost,
  starlightOf,
  type Installations,
} from './light';
import type { TerraformBody, Terraforming } from './Terraforming';

const RENDER_ORDER = CLOUD_RENDER_ORDER + 1;
const UP = new THREE.Vector3(0, 1, 0);
/** The spray leaves from this far below the ship's centre. */
const NOZZLE_DROP = 0.6;

/** What the tools need from the globe: the ground (for aiming and the lance), its radius and where the sun is (body frame). */
export interface LightGround extends LaserGround {
  readonly radius: number;
  readonly sun: THREE.Vector3;
}

/**
 * The heat-and-light terraforming tools in low orbit (a planet-level
 * entity; terraform/light.ts has the rules), and what they leave over
 * the world (a LightRig: its mirrors and sunshade, drawn whatever is
 * selected). Selected on the item bar's Terraform tab (`arm`):
 *
 * - Orbital mirror: a click on the world deploys one (or, switched by G or
 *   the climate chart, recalls the last), paid for at once, half given back
 *   on recall.
 * - Sunshade: a click closes it a step (or opens it).
 * - Aerosol spray: held, it sprays a pale haze from the ship into the air,
 *   written to the log one action a second like the magic rays.
 * - Mirror lance: with a mirror on station, held on the ground, the mirrors'
 *   beams converge there and burn what lives there, as the laser does (a
 *   Laser in lance mode), with steam off icy ground.
 */
export class LightTools implements Entity {
  readonly rig: LightRig;
  /** The mirror lance: the laser's burning, with the mirrors' beams. */
  readonly lance: Laser;
  private _armed: LightToolId | null = null;
  private spraying = false;
  private lastTime = 0;
  private sound: SoundHandle | null = null;
  private inst: Installations;
  private readonly held: HeldLog;
  private readonly reticle: MarkerRing;
  private readonly puffs: ParticlePool;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly foot = new THREE.Vector3();
  private readonly nozzle = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly bitangent = new THREE.Vector3();
  private readonly rng: Rng;
  private owed = 0;
  private steamOwed = 0;
  private gWasDown = false;
  private note = '';
  private noteTime = 0;
  private lanceFoot: THREE.Vector3 | null = null;
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
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly globe: LightGround,
    private readonly ship: LaserShip,
    targets: LaserTargets,
    private readonly terraforming: Terraforming,
    /** The body below, as terraforming knows it. */
    private readonly body: TerraformBody,
    private readonly sfx: SoundEffects,
    /** Why the tools can't be used now (the planet buster going off), or null. */
    private readonly blocked: () => string | null,
    /** The climate now (a terraformed body's live one). */
    private readonly climate: () => ClimateData,
    debug: Debug,
  ) {
    this.rng = new Rng(hashSeed('light-tools', body.key));
    this.held = new HeldLog(terraforming, body.key);
    this.inst = installationsAt(terraforming.logs.actions(body.key), terraforming.time);
    this.rig = new LightRig(globe.radius);
    scene.add(this.rig.object);
    this.reticle = new MarkerRing(scene, '#7dffa8', 0.1, 0.16);
    this.puffs = new ParticlePool(scene, false, RENDER_ORDER);
    const icy = () => {
      const c = this.climate();
      return body.type === 'ice' || c.waterState === 'ice';
    };
    this.lance = new Laser(scene, camera, input, globe, ship, targets, sfx, () => this.lanceBlock(), `${body.key}:lance`, debug, {
      core: '#fffbe8',
      glow: '#ffc94a',
      ring: '#ffd36a',
      width: 2.2,
      reach: 3,
      cue: 'mirrorLance',
      folder: null,
      sources: (foot, out) => {
        this.lanceFoot = foot;
        return this.rig.lanceSources(foot, out);
      },
      pay: (dt) => (this.terraforming.energy.spend(heldCost('lance', this.body.climate, this.terraforming.mode) * dt) ? null : 'Not enough energy'),
      hints: {
        ready: (touch) => `${touch ? 'Touch and hold' : 'Click and hold'} on the ground: the mirrors focus there and burn what lives there`,
        firing: "The mirrors' light focused here: it burns what lives here, but won't warm the world",
        unseen: 'No mirror can see that spot: aim at the day side under them',
      },
      ground: (foot, dt) => {
        if (icy()) this.steam(foot, dt);
      },
    });
    const f = debug.folder('Heat and light');
    f?.add(lightParams, 'mirrorStarlight', 0.05, 1).name('mirror starlight');
    f?.add(lightParams, 'deployTime', 0.5, 30).name('mirror unfold (s)');
    f?.add(lightParams, 'shadeStep', 0.02, 0.5).name('shade step');
    f?.add(lightParams, 'aerosolPerSecond', 0.002, 0.1).name('aerosol / s');
  }

  /** The tool selected on the item bar, if any. */
  get armed(): LightToolId | null {
    return this._armed;
  }

  /** True while the spray or the lance is held on. */
  get on(): boolean {
    return this.spraying || this.lance.on;
  }

  /** What stays over the world now: its mirrors and shade. */
  get installations(): Installations {
    return this.inst;
  }

  arm(tool: LightToolId | null): void {
    const blocked = tool === null ? null : tool === 'lance' ? this.lanceBlock() : this.blocked();
    this._armed = tool !== null && blocked === null ? tool : null;
    if (this._armed !== 'aerosol') this.stopSpray();
    this.lance.arm(this._armed === 'lance');
    if (this._armed === null || this._armed === 'lance') this.reticle.hide();
    document.body.classList.toggle('aiming', this._armed !== null);
  }

  /** The item bar's line for `tool`: what it does here, what it costs. */
  status(tool: LightToolId): ItemStatus {
    const t = this.terraforming;
    const mode = t.mode;
    const limits = LIGHT_LIMITS[mode];
    const press = this.input.touchMode ? 'Touch' : 'Click';
    const reason = tool === 'lance' ? this.lanceBlock() : this.blocked();
    const cost = this.costText(tool);
    if (reason !== null) return { available: false, hint: '', reason, cost };
    if (tool === 'lance') return { ...this.lance.status(), cost };
    if (this._armed !== tool) return { available: true, hint: '', cost };
    if (this.noteTime > 0) return { available: true, hint: this.note, cost };
    const { choice } = t;
    const inst = this.inst;
    const key = this.input.touchMode ? 'the chart' : 'G';
    if (tool === 'mirror') {
      const up = `${inst.mirrors} of ${limits.mirrors} up`;
      return {
        available: true,
        hint: choice.mirror === 'deploy' ? `${press} on the world: deploy an orbital mirror (${up}; ${key} switches to recall)` : `${press} on the world: recall a mirror (${up}; ${key} switches to deploy)`,
        cost,
      };
    }
    if (tool === 'sunshade') {
      const now = `blocking ${Math.round(inst.shade * 100)}%, at most ${Math.round(limits.shade * 100)}%`;
      return {
        available: true,
        hint: choice.shade === 'close' ? `${press} on the world: close the sunshade a step (${now}; ${key} switches to open)` : `${press} on the world: open the sunshade a step (${now}; ${key} switches to close)`,
        cost,
      };
    }
    const blocked = aerosolBlocked(this.climate());
    if (blocked) return { available: true, hint: blocked, cost };
    if (this.spraying) {
      const target = t.snapshot(this.body)?.target ?? this.climate();
      return { available: true, hint: `Spraying a haze into the air: settling towards ${celsius(target.temperature)}`, cost };
    }
    return { available: true, hint: `${press} and hold on the world: spray a reflective haze into the air (it rains out again)`, cost };
  }

  /** e.g. "150", "40/step", "6/s", "free". */
  private costText(tool: LightToolId): string {
    const { mode } = this.terraforming;
    const setting = this.body.climate;
    if (mode === 'sandbox') return 'free';
    if (tool === 'mirror') return formatEnergy(mirrorCost(setting, mode));
    if (tool === 'sunshade') return `${formatEnergy(shadeCost(setting, mode, lightParams.shadeStep))}/step`;
    return `${formatEnergy(heldCost(tool, setting, mode))}/s`;
  }

  /** Why the lance can't be used now (no mirror on station), or null. */
  private lanceBlock(): string | null {
    const reason = this.blocked();
    if (reason !== null) return reason;
    if (this.inst.ready > 0) return null;
    return this.inst.mirrors > 0 ? 'The mirrors are still unfolding' : 'Deploy an orbital mirror first: the lance focuses its light';
  }

  update(frameDt: number): void {
    const dt = Math.min(frameDt, 0.1);
    const t = this.terraforming;
    if (this.noteTime > 0) this.noteTime -= frameDt;
    this.inst = installationsAt(t.logs.actions(this.body.key), t.time);
    if (this._armed && (this._armed === 'lance' ? this.lanceBlock() : this.blocked()) !== null) this.arm(null);
    this.switchKey();
    this.nozzle.copy(this.ship.object.position).addScaledVector(this.ship.up, -NOZZLE_DROP);
    const armed = this._armed;
    if (armed === 'mirror' || armed === 'sunshade' || (armed === 'aerosol' && !this.spraying)) {
      const press = this.input.consumePress();
      if (press) {
        this.input.capturePress();
        if (this.aimAt(press.ndcX, press.ndcY)) {
          if (armed === 'mirror') this.useMirror();
          else if (armed === 'sunshade') this.useShade();
          else this.startSpray();
        }
      }
    }
    if (this.spraying && (!this.input.primaryDown || this._armed !== 'aerosol')) this.stopSpray();
    if (this.spraying) {
      this.spray();
      this.throwSpray(dt);
    }
    // The lance first (it decides where the mirrors aim), then the rig.
    this.lance.update(frameDt);
    this.rig.setRadius(this.globe.radius);
    this.rig.pose(this.globe.sun, UP, this.inst, t.time, this.lance.on ? this.lanceFoot : null, this.camera);
    this.aim(frameDt);
    const height = this.canvas?.height ?? 720;
    this.puffs.setView(height, this.camera.fov);
    this.puffs.update(dt);
  }

  dispose(): void {
    this.stopSpray();
    this.arm(null);
    this.lance.dispose();
    this.rig.dispose();
    this.reticle.dispose();
    this.puffs.dispose();
  }

  /** G: deploy or recall for the mirror, close or open for the shade (while one of them is armed). */
  private switchKey(): void {
    const down = this.input.isDown('KeyG');
    if (down && !this.gWasDown) {
      const { choice } = this.terraforming;
      if (this._armed === 'mirror') {
        choice.mirror = choice.mirror === 'deploy' ? 'recall' : 'deploy';
        this.say(choice.mirror === 'deploy' ? 'Orbital mirror: deploy' : 'Orbital mirror: recall');
      } else if (this._armed === 'sunshade') {
        choice.shade = choice.shade === 'close' ? 'open' : 'close';
        this.say(choice.shade === 'close' ? 'Sunshade: close (block more light)' : 'Sunshade: open (block less light)');
      }
    }
    this.gWasDown = down;
  }

  /** Deploys or recalls a mirror, as the choice says. */
  private useMirror(): void {
    const t = this.terraforming;
    const way = t.choice.mirror;
    const action = mirrorAction(t.logs.actions(this.body.key), t.time, t.mode, way);
    if (typeof action === 'string') {
      this.say(action);
      return;
    }
    const cost = mirrorCost(this.body.climate, t.mode);
    if (way === 'deploy' && !t.energy.spend(cost)) {
      this.say(`Not enough energy: a mirror costs ${formatEnergy(cost)}`);
      return;
    }
    if (way === 'recall') t.energy.refund(cost * lightParams.refund);
    t.logs.record(this.body.key, action);
    this.sfx.play('mirrorDeploy');
    this.say(way === 'deploy' ? `Mirror unfolding: ${action.level} up, starlight ×${starlightOf(action.level ?? 0, this.inst.shade).toFixed(2)}` : `Mirror folding away: ${action.level} left`);
  }

  /** Closes or opens the shade a step, as the choice says. */
  private useShade(): void {
    const t = this.terraforming;
    const way = t.choice.shade;
    const before = this.inst.shade;
    const action = shadeAction(t.logs.actions(this.body.key), t.time, t.mode, way);
    if (typeof action === 'string') {
      this.say(action);
      return;
    }
    const cost = shadeCost(this.body.climate, t.mode, (action.level ?? 0) - before);
    if (way === 'close' && !t.energy.spend(cost)) {
      this.say(`Not enough energy: a step costs ${formatEnergy(cost)}`);
      return;
    }
    if (way === 'open') t.energy.refund(cost * lightParams.refund);
    t.logs.record(this.body.key, action);
    this.sfx.play('sunshadeMove');
    this.say(`Sunshade ${way === 'close' ? 'closing' : 'opening'}: blocking ${Math.round((action.level ?? 0) * 100)}%`);
  }

  private startSpray(): void {
    const blocked = aerosolBlocked(this.climate());
    if (blocked) {
      this.say(blocked);
      return;
    }
    this.spraying = true;
    this.held.reset();
    this.lastTime = this.terraforming.time;
    this.sound = this.sfx.start('aerosolSpray');
  }

  private stopSpray(): void {
    if (this.spraying) this.spray(true);
    this.spraying = false;
    this.held.reset();
    this.terraforming.energy.draining = 0;
    this.sound?.stop();
    this.sound = null;
  }

  /** Writes the spray into the log up to now and pays for it (`last`: letting go). */
  private spray(last = false): void {
    const t = this.terraforming;
    const cost = heldCost('aerosol', this.body.climate, t.mode);
    const spent = t.time - this.lastTime;
    this.lastTime = t.time;
    if (spent > 0 && !t.energy.spend(cost * spent)) {
      this.say('Not enough energy');
      this.spraying = false;
      this.stopSpray();
      return;
    }
    t.energy.draining = last ? 0 : cost;
    this.held.write(last, (time) => {
      const c = t.snapshot(this.body, time)?.climate ?? this.body.climate;
      return aerosolBlocked(c) ? null : { lever: 'aerosol', rate: aerosolRate() };
    });
  }

  private aimAt(ndcX: number, ndcY: number): boolean {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), pointerCamera(this.camera));
    return this.globe.groundHit(this.raycaster.ray, this.foot) !== null;
  }

  /** The ring on the ground under the pointer while a click tool is armed. */
  private aim(frameDt: number): void {
    const { pointer } = this.input;
    const armed = this._armed;
    if (!armed || armed === 'lance' || this.spraying || !pointer.inside || this.input.blocked || this.input.isDragging || !this.aimAt(pointer.ndcX, pointer.ndcY)) {
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

  /** The haze streaming from the ship's underside, spreading out and up into the air. */
  private throwSpray(dt: number): void {
    this.basis(this.nozzle);
    const scale = Math.max(0.8, Math.min(5, this.camera.position.distanceTo(this.nozzle) * 0.02));
    this.owed += dt * 40;
    while (this.owed >= 1) {
      this.owed--;
      this.throwPuff(this.nozzle, 6 * scale, 1.5 * scale, 0.6 * scale, 6 * scale, 3.2, this.rng.next() < 0.5 ? '#f4f1ea' : '#e6e2d8', 0.32, 0.8, 0.6);
    }
  }

  /** Steam rising where the lance meets icy ground. */
  private steam(foot: THREE.Vector3, dt: number): void {
    this.basis(foot);
    const scale = Math.max(0.6, Math.min(4, this.camera.position.distanceTo(foot) * 0.02));
    this.steamOwed += dt * 30;
    while (this.steamOwed >= 1) {
      this.steamOwed--;
      this.throwPuff(foot, 1.5 * scale, 3 * scale, 0.8 * scale, 3.5 * scale, 1.8, '#eef3f7', 0.45, 2, 0.8);
    }
  }

  /** `up`, `tangent` and `bitangent` at a point. */
  private basis(at: THREE.Vector3): void {
    this.up.copy(at).normalize();
    this.tangent.set(0, 1, 0).cross(this.up);
    if (this.tangent.lengthSq() < 1e-6) this.tangent.set(1, 0, 0).cross(this.up);
    this.tangent.normalize();
    this.bitangent.crossVectors(this.up, this.tangent);
  }

  /** Throws one puff from `at` (call `basis` first); see MagicRay's. */
  private throwPuff(at: THREE.Vector3, spread: number, rise: number, size: number, endSize: number, life: number, color: THREE.ColorRepresentation, alpha: number, lift: number, drag: number): void {
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
    this.puffs.emit(p);
  }
}
