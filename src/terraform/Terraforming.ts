import type { ClimateData } from '../gen/climate';
import type { MoonType, PlanetType } from '../gen/planets';
import { DEFAULT_TERRAFORM_MODE, TerraformLogs, worksRuns, type TerraformLogsData, type TerraformMode, type TerraformSnapshot, type WorksRun } from '../gen/terraform';
import { ShipEnergy, type ShipEnergyData } from './energy';
import { Milestones, milestoneFlags, type MilestoneEvent, type MilestonesData } from './milestones';
import { DEFAULT_RAY_CHOICE, type RayChoice } from './rays';

/** A body as terraforming knows it: its key (combat/busted.ts bodyKey), name, type and generated climate. */
export interface TerraformBody {
  readonly key: string;
  readonly name: string;
  readonly type: PlanetType | MoonType;
  /** The climate it was generated with. */
  readonly climate: ClimateData;
}

export interface TerraformingData {
  /** The game clock, s. */
  time: number;
  logs: TerraformLogsData;
  energy: ShipEnergyData;
  milestones: MilestonesData;
  choice: RayChoice;
}

/**
 * Terraforming for the whole game, kept by the SceneManager (levels are
 * rebuilt on every visit; this stays): the game clock that every body's
 * action log runs on (a system's own clock restarts each visit; this one
 * runs on wherever the ship is, so worlds keep settling while you're away),
 * the logs, the ship's energy, the milestones reached, the mode the game is
 * played in and the gas the air rays are set to. No THREE: the views ask it
 * for a body's climate now (`snapshot`).
 */
export class Terraforming {
  /** The game clock, s: runs with the fixed steps (stops while paused). */
  time = 0;
  readonly logs = new TerraformLogs();
  readonly energy = new ShipEnergy();
  readonly milestones = new Milestones();
  /** The gas the air and vacuum rays move, and which way the water ray works. */
  readonly choice: RayChoice = { ...DEFAULT_RAY_CHOICE };
  /** Called for every milestone reached (the banner). */
  onMilestone: ((body: TerraformBody, event: MilestoneEvent) => void) | null = null;
  private _mode: TerraformMode;
  /** Every body's works (greenhouse factories, carbon sinks), remade when the logs change. */
  private works: WorksRun[] = [];
  private worksVersion = -1;

  constructor(mode: TerraformMode = DEFAULT_TERRAFORM_MODE) {
    this._mode = mode;
    this.logs.setMode(0, mode);
  }

  get mode(): TerraformMode {
    return this._mode;
  }

  /** Plays on in `mode` from now (the menu's setting; any time). */
  setMode(mode: TerraformMode): void {
    this._mode = mode;
    this.logs.setMode(this.time, mode);
  }

  /** Moves the clock on, paying for the works running on every body (wherever the ship is). */
  advance(dt: number): void {
    const upkeep = this.upkeep();
    this.energy.upkeep = upkeep;
    this.time += dt;
    if (upkeep > 0) this.energy.spend(upkeep * dt);
  }

  /** Energy a second every works running now costs, on every body. */
  upkeep(): number {
    if (this.worksVersion !== this.logs.version) {
      this.works = this.logs.keys().flatMap((key) => worksRuns(this.logs.actions(key)));
      this.worksVersion = this.logs.version;
    }
    let sum = 0;
    for (const r of this.works) if (r.from <= this.time && (r.removed === null || this.time < r.removed)) sum += r.upkeep;
    return sum;
  }

  /** True if anything was done to the body. */
  touched(key: string): boolean {
    return this.logs.touched(key);
  }

  /** The body's climate now, the one it's settling at and when (null if nothing was ever done to it: it's as generated). */
  snapshot(body: Pick<TerraformBody, 'key' | 'climate'>, time = this.time): TerraformSnapshot | null {
    return this.logs.touched(body.key) ? this.logs.at(body.key, body.climate, time) : null;
  }

  /** The body's climate now (its generated one if untouched). */
  climate(body: Pick<TerraformBody, 'key' | 'climate'>): ClimateData {
    return this.snapshot(body)?.climate ?? body.climate;
  }

  /** Checks a body's climate now (`climate`) for milestones; each one reached goes to `onMilestone`. */
  checkMilestones(body: TerraformBody, climate: ClimateData): MilestoneEvent[] {
    const events = this.milestones.check(body.key, milestoneFlags(body.type, body.climate), milestoneFlags(body.type, climate), this.time);
    for (const e of events) this.onMilestone?.(body, e);
    return events;
  }

  toJSON(): TerraformingData {
    return { time: this.time, logs: this.logs.toJSON(), energy: this.energy.toJSON(), milestones: this.milestones.toJSON(), choice: { ...this.choice } };
  }

  /** Restores everything from `data` (a debug dump); the mode stays the player's setting. */
  load(data: Partial<TerraformingData>): void {
    if (typeof data.time === 'number') this.time = data.time;
    if (data.logs) this.logs.load(data.logs);
    if (data.energy) this.energy.load(data.energy);
    if (data.milestones) this.milestones.load(data.milestones);
    if (data.choice) Object.assign(this.choice, data.choice);
    // The setting in force from now on.
    this.logs.setMode(this.time, this._mode);
  }
}
