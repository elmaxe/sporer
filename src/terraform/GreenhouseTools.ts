import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import type { Landing } from '../cargo/plantFate';
import type { GreenhouseToolId, ItemStatus } from '../combat/items';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { celsius, cloudCovered, type ClimateData } from '../gen/climate';
import { TERRAFORM_TUNING } from '../gen/terraform';
import { MarkerRing } from '../player/MarkerRing';
import { pointerCamera } from '../world/thirdPerson';
import { formatEnergy } from './energy';
import {
  NO_WORKS,
  WORKS_LIMITS,
  greenhouseParams,
  placeAction,
  removeAction,
  worksAt,
  worksCost,
  worksNear,
  worksUpkeep,
  type GroundWorks,
} from './greenhouse';
import type { TerraformBody, Terraforming } from './Terraforming';
import { WorksLook } from './WorksLook';

/** What the tools need from the globe: aiming at the ground, its height and what lies there. */
export interface WorksGlobe {
  groundHit(ray: THREE.Ray, out: THREE.Vector3): number | null;
  readonly groundHeight: (dir: THREE.Vector3) => number;
  landingAt(dir: THREE.Vector3): Landing;
}

const NAMES: Record<GreenhouseToolId, { one: string; many: string }> = {
  factory: { one: 'greenhouse factory', many: 'factories' },
  sink: { one: 'carbon sink', many: 'carbon sinks' },
};

/**
 * The greenhouse works in low orbit (a planet-level entity;
 * terraform/greenhouse.ts has the rules), and the works standing on the
 * world (a WorksLook, drawn whatever is selected). Selected on the item
 * bar's Terraform tab (`arm`), a click on dry land beams a works of that
 * kind down there; a click on one already standing beams it back up (half
 * its cost back). Each is one action in the body's log, so it's saved and
 * restored with it and keeps running while the ship is away.
 */
export class GreenhouseTools implements Entity {
  readonly look: WorksLook;
  private _armed: GreenhouseToolId | null = null;
  private works: GroundWorks = NO_WORKS;
  private readonly reticle: MarkerRing;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly foot = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private note = '';
  private noteTime = 0;
  /** How many had landed last frame (a new landing thuds). */
  private landed = -1;
  private readonly canvas = document.querySelector('canvas');

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly globe: WorksGlobe,
    private readonly terraforming: Terraforming,
    private readonly body: TerraformBody,
    private readonly sfx: SoundEffects,
    /** Why the tools can't be used now (the planet buster going off), or null. */
    private readonly blocked: () => string | null,
    /** The climate now (a terraformed body's live one). */
    private readonly climate: () => ClimateData,
    /** Called when the works standing on the ground change (plants under them are hidden). */
    private readonly onGroundChanged: () => void,
    debug: Debug,
  ) {
    this.look = new WorksLook(scene, globe.groundHeight, body.key, cloudCovered(body.climate));
    this.reticle = new MarkerRing(scene, '#7dffa8', 0.1, 0.16);
    this.works = worksAt(terraforming.logs.actions(body.key), terraforming.time);
    const f = debug.folder('Greenhouse works');
    f?.add(greenhouseParams, 'landTime', 0.5, 10).name('landing (s)');
    f?.add(greenhouseParams, 'spacing', 0.005, 0.1).name('spacing (rad)');
    for (const mode of ['real', 'relaxed'] as const) {
      f?.add(TERRAFORM_TUNING[mode], 'factoryBuild', 10, 600).name(`${mode}: factory build (s)`);
      f?.add(TERRAFORM_TUNING[mode], 'greenhouseLifetime', 30, 3600).name(`${mode}: gas lifetime (s)`);
      f?.add(TERRAFORM_TUNING[mode], 'sinkTime', 30, 3600).name(`${mode}: sink time (s)`);
    }
  }

  /** The tool selected on the item bar, if any. */
  get armed(): GreenhouseToolId | null {
    return this._armed;
  }

  /** The works on the world now. */
  get groundWorks(): GroundWorks {
    return this.works;
  }

  arm(tool: GreenhouseToolId | null): void {
    this._armed = tool !== null && this.blocked() === null ? tool : null;
    if (this._armed === null) this.reticle.hide();
    document.body.classList.toggle('aiming', this._armed !== null);
  }

  /** The item bar's line for `tool`: what it does here, what it costs. */
  status(tool: GreenhouseToolId): ItemStatus {
    const t = this.terraforming;
    const reason = this.blocked();
    const cost = this.costText(tool);
    if (reason !== null) return { available: false, hint: '', reason, cost };
    if (this._armed !== tool) return { available: true, hint: '', cost };
    if (this.noteTime > 0) return { available: true, hint: this.note, cost };
    const press = this.input.touchMode ? 'Touch' : 'Click';
    const n = tool === 'factory' ? this.works.factories : this.works.sinks;
    const count = `${n} of ${WORKS_LIMITS[t.mode][tool]} here`;
    const c = this.climate();
    if (tool === 'factory' && c.pressure < 0.01) return { available: true, hint: `${press} on dry land: set down a ${NAMES[tool].one} (${count}). There's next to no air here for its gas to warm`, cost };
    if (tool === 'sink' && c.gases.co2 < 1e-4 && c.greenhouse < 0.01) return { available: true, hint: `${press} on dry land: set down a ${NAMES[tool].one} (${count}). There's no CO₂ here to draw down`, cost };
    const target = t.snapshot(this.body)?.target;
    const settling = target && Math.abs(target.temperature - c.temperature) > 0.5 ? `; settling towards ${celsius(target.temperature)}` : '';
    return { available: true, hint: `${press} on dry land: set down a ${NAMES[tool].one}, or on one to beam it up (${count}${settling})`, cost };
  }

  /** e.g. "300 +2/s", "free". */
  private costText(tool: GreenhouseToolId): string {
    const { mode } = this.terraforming;
    if (mode === 'sandbox') return 'free';
    const setting = this.body.climate;
    return `${formatEnergy(worksCost(tool, setting, mode))} +${formatEnergy(worksUpkeep(tool, setting, mode))}/s`;
  }

  update(frameDt: number): void {
    const t = this.terraforming;
    if (this.noteTime > 0) this.noteTime -= frameDt;
    if (this._armed && this.blocked() !== null) this.arm(null);
    const armed = this._armed;
    if (armed) {
      const press = this.input.consumePress();
      if (press) {
        this.input.capturePress();
        if (this.aimAt(press.ndcX, press.ndcY)) this.use(armed);
      }
    }
    this.works = worksAt(t.logs.actions(this.body.key), t.time);
    const landed = this.works.factoriesRunning + this.works.sinksRunning;
    if (this.landed >= 0 && landed > this.landed) this.sfx.play('dropImpact');
    this.landed = landed;
    this.look.setView(this.canvas?.height ?? 720, this.camera.fov);
    if (this.look.set(this.works, t.time, Math.min(frameDt, 0.1))) this.onGroundChanged();
    this.aim(frameDt);
  }

  dispose(): void {
    this.arm(null);
    this.look.dispose();
    this.reticle.dispose();
  }

  /** A click at `foot`: beams a works of `kind` up from there, or one down onto it. */
  private use(kind: GreenhouseToolId): void {
    const t = this.terraforming;
    const site: [number, number, number] = [this.foot.x, this.foot.y, this.foot.z];
    const n = Math.hypot(...site) || 1;
    for (let i = 0; i < 3; i++) site[i]! /= n;
    const actions = t.logs.actions(this.body.key);
    const works = worksAt(actions, t.time);
    const near = worksNear(works, site, greenhouseParams.pickRadius);
    if (near) {
      if (near.from > t.time) {
        this.say('Still landing');
        return;
      }
      t.logs.record(this.body.key, removeAction(near, t.time));
      t.energy.refund(worksCost(near.kind, this.body.climate, t.mode) * greenhouseParams.refund);
      this.sfx.play('worksBeam');
      this.say(`Beaming the ${NAMES[near.kind].one} back up: it stops`);
      return;
    }
    this.up.copy(this.foot).normalize();
    const landing = this.globe.landingAt(this.up);
    if (landing !== 'land') {
      this.say(landing === 'lava' ? 'Not on lava: set it down on dry land' : 'Not in the sea: set it down on dry land');
      return;
    }
    const action = placeAction(actions, t.time, t.mode, kind, site, this.body.climate);
    if (typeof action === 'string') {
      this.say(action);
      return;
    }
    const cost = worksCost(kind, this.body.climate, t.mode);
    if (!t.energy.spend(cost)) {
      this.say(`Not enough energy: a ${NAMES[kind].one} costs ${formatEnergy(cost)}`);
      return;
    }
    t.logs.record(this.body.key, action);
    this.sfx.play('worksBeam');
    const count = (kind === 'factory' ? works.factories : works.sinks) + 1;
    this.say(`Setting down a ${NAMES[kind].one}: ${count} of ${WORKS_LIMITS[t.mode][kind]} here`);
  }

  private aimAt(ndcX: number, ndcY: number): boolean {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), pointerCamera(this.camera));
    return this.globe.groundHit(this.raycaster.ray, this.foot) !== null;
  }

  /** The ring on the ground under the pointer while a tool is armed. */
  private aim(frameDt: number): void {
    const { pointer } = this.input;
    if (!this._armed || !pointer.inside || this.input.blocked || this.input.isDragging || !this.aimAt(pointer.ndcX, pointer.ndcY)) {
      this.reticle.hide();
      return;
    }
    this.up.copy(this.foot).normalize();
    this.v.copy(this.foot).addScaledVector(this.up, 0.3);
    const size = Math.max(4, this.camera.position.distanceTo(this.v) * 0.015);
    this.reticle.place(this.v, size, 0.9, this.up, frameDt);
  }

  private say(text: string): void {
    this.note = text;
    this.noteTime = 2.5;
  }
}
