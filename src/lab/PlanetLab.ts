import { Vector3 } from 'three';
import type { Debug } from '../core/Debug';
import type { Game } from '../core/Game';
import { changeState, type ClimateData, type StateSpec } from '../gen/climate';
import { generateGalaxy, systemRef } from '../gen/galaxy';
import { hashSeed, parseSeed } from '../gen/rng';
import { generateSystem } from '../gen/system';
import { offsetDirection, stormCentre } from '../gen/weather';
import type { PlanetConfig } from '../world/Planet';
import { TerraformTimeline, leakRate, type TerraformMode, type TerraformSnapshot, type WorksKind } from '../gen/terraform';
import { ClimateChart } from '../terraform/ClimateChart';
import { DEFAULT_RAY_CHOICE, forecastClimate, holdRay, type RayChoice, type RayId } from '../terraform/rays';
import { Milestones, milestoneFlags } from '../terraform/milestones';
import {
  describeInstallations,
  forecastLight,
  holdAerosol,
  installationsAt,
  mirrorAction,
  shadeAction,
  type LightToolId,
  type MirrorWay,
  type ShadeWay,
} from '../terraform/light';
import { describeWorks, forecastWorks, placeAction, removeAction, worksAt, type GreenhouseToolId } from '../terraform/greenhouse';
import { LabClock, LabLevel } from './LabLevel';
import {
  DEFAULT_VIEW,
  decodeLab,
  encodeLab,
  generateLabPlanet,
  labClimateData,
  labFromAsteroid,
  labFromComet,
  labFromSystem,
  toPlanetConfig,
  withAutoSetting,
  withKind,
  withType,
  type GenerateOptions,
  type LabKind,
  type LabPlanet,
  type LabSource,
  type LabState,
  type LabTerraform,
  type LabView,
} from './labPlanet';

/** Quiet time after the last edit before the planet is rebuilt (slider drags edit every frame). */
const REBUILD_DELAY_MS = 120;
/** Frames drawn after a build before the lab counts as ready (shaders compiled, first map rows baked). */
const READY_FRAMES = 3;

/** Partial two levels deep (`set` merges that far). */
type DeepPartial<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends unknown[]
    ? T[K]
    : NonNullable<T[K]> extends object
      ? { [J in keyof NonNullable<T[K]>]?: Partial<NonNullable<T[K]>[J]> } | null
      : T[K];
};

/**
 * The planet lab: one planet (or moon) as the game draws it, every property
 * editable, in low orbit or as seen in its system. Owns the model (`planet`,
 * `view`), rebuilds the 3D view (a LabLevel) when it changes and keeps the
 * page's #hash in step, so any planet is a link. `window.lab` in the page is
 * this object: automation (npm run shot) drives it with `set`, `setView`,
 * `generate`, `load`, `look`, `setTime` and waits for `ready`. Call
 * `rebuild` once to show the first planet.
 */
export class PlanetLab {
  planet: LabPlanet;
  view: LabView;
  source: LabSource | null;
  readonly clock = new LabClock(0);
  private _level: LabLevel | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private framesSinceBuild = 0;
  /** Called after each rebuild (the panel refreshes its readouts). */
  onBuilt: (() => void) | null = null;
  /** Called when the planet was replaced as a whole (the panel rebinds its controls). */
  onReplaced: (() => void) | null = null;
  private waiters: (() => void)[] = [];
  /** What the magic rays did to the planet (the Terraform folder), or null. */
  terraformState: LabTerraform | null;
  /** The rays' gas and water way, and how long a button holds a ray, s. */
  readonly rayChoice: RayChoice = { ...DEFAULT_RAY_CHOICE };
  raySeconds = 5;
  /** The climate chart (shown while there's a terraforming log, or `showChart`). */
  readonly chart: ClimateChart;
  showChart = false;
  /** The ray or light tool the chart's arrow previews (the last one used). */
  private lastRay: RayId | LightToolId | GreenhouseToolId | null = null;
  /** Why the last light tool did nothing ('' when it worked), for the panel's readout. */
  lightNote = '';
  private rolls = 0;
  private vent = -1;

  constructor(
    private readonly game: Game,
    private readonly debug: Debug,
    state: LabState,
  ) {
    this.planet = state.planet;
    this.view = state.view;
    this.source = state.source ?? null;
    this.clock.paused = this.view.paused;
    this.clock.speed = this.view.speed;
    this.terraformState = state.terraform ?? null;
    this.chart = new ClimateChart(this.rayChoice);
    game.afterFrame = () => this.afterFrame();
  }

  /**
   * The state a page URL asks for: `#<lab link>`, `?seed&star&planet[&moon]`
   * (a game planet), `?seed&star&comet` (a game comet), `?seed&star&belt&asteroid`
   * (a game asteroid) or `?gen=<seed>[&type&kind]`.
   */
  static stateFromUrl(url: URL): LabState {
    const params = url.searchParams;
    const view: LabView = { ...DEFAULT_VIEW };
    const v = params.get('view');
    if (v === 'globe' || v === 'system') view.view = v;
    const c = params.get('camera');
    if (c === 'orbit' || c === 'fly') view.camera = c;
    const hash = url.hash.slice(1);
    if (hash) {
      const state = decodeLab(hash);
      if (state) return state;
    }
    if (params.has('star') && (params.has('planet') || params.has('comet') || params.has('asteroid'))) {
      const source: LabSource = {
        seed: params.get('seed') ?? '1337',
        star: Number(params.get('star')),
        planet: Number(params.get('planet') ?? 0),
        moon: params.has('moon') ? Number(params.get('moon')) : undefined,
        comet: params.has('comet') ? Number(params.get('comet')) : undefined,
        belt: params.has('asteroid') ? Number(params.get('belt') ?? 0) : undefined,
        asteroid: params.has('asteroid') ? Number(params.get('asteroid')) : undefined,
      };
      const planet = loadFromGalaxy(source);
      if (planet) return { planet, view, source };
    }
    const options: GenerateOptions = {};
    const type = params.get('type');
    const kind = params.get('kind');
    if (type) options.type = type as GenerateOptions['type'];
    if (kind) options.kind = kind as LabKind;
    const gen = params.get('gen');
    const seed = gen !== null ? parseSeed(gen) : 1;
    if (gen === null && !type && !kind) options.type = 'terran';
    return { planet: generateLabPlanet(seed, options), view };
  }

  get level(): LabLevel | null {
    return this._level;
  }

  /** The renderer's input (what the planet level's renderers take). */
  get config(): PlanetConfig {
    return toPlanetConfig(this.planet);
  }

  /** The full climate, derived values included (null for gas giants). */
  get climate(): ClimateData | null {
    return labClimateData(this.planet);
  }

  /** True once the latest edit is built and drawn, the surface refined for the view (for automation). */
  get ready(): boolean {
    return this.timer === null && this._level !== null && this.framesSinceBuild >= READY_FRAMES && this.settled;
  }

  /** The globe's surface has every chunk the camera wants (always, in the system view). */
  private get settled(): boolean {
    return this._level?.globe?.settled ?? true;
  }

  /** Resolves once `ready`. */
  whenReady(): Promise<void> {
    return this.ready ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }

  /** A link to this exact planet and view. */
  get link(): string {
    return `${location.origin}${location.pathname}#${encodeLab(this.state)}`;
  }

  get state(): LabState {
    return {
      planet: this.planet,
      view: this.view,
      ...(this.source ? { source: this.source } : {}),
      ...(this.terraformState && this.terraformState.actions.length > 0 ? { terraform: this.terraformState } : {}),
    };
  }

  /** The game at this planet's system (only for planets loaded from the game). */
  get gameLink(): string | null {
    if (!this.source) return null;
    return new URL(`./?seed=${encodeURIComponent(this.source.seed)}&star=${this.source.star}`, location.href).href;
  }

  // --- Editing ---

  /**
   * Merges `patch` into the planet (objects one level deep, e.g.
   * `{ style: { seaLevel: 0.2 } }` or `{ climate: { state: { pressure: 2 } } }`)
   * and rebuilds at once. Resolves when it is drawn.
   */
  set(patch: DeepPartial<LabPlanet>): Promise<void> {
    const p = this.planet as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      const old = p[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && old && typeof old === 'object') {
        const merged: Record<string, unknown> = { ...(old as Record<string, unknown>) };
        for (const [k, v] of Object.entries(value)) {
          const o = merged[k];
          merged[k] = v && typeof v === 'object' && !Array.isArray(v) && o && typeof o === 'object' ? { ...o, ...v } : v;
        }
        p[key] = merged;
      } else {
        p[key] = value;
      }
    }
    return this.replace(this.planet);
  }

  /** Changes view options; a rebuild only when the view, camera, map or starfield changed. */
  setView(patch: Partial<LabView>): Promise<void> {
    const rebuild = (['view', 'camera', 'map', 'starfield'] as const).some((k) => k in patch && patch[k] !== this.view[k]);
    Object.assign(this.view, patch);
    this.applyLive();
    if (rebuild) this.rebuild();
    else this.saveUrl();
    return this.whenReady();
  }

  /** Replaces the planet (rebinding the panel) and rebuilds at once. */
  replace(planet: LabPlanet, source: LabSource | null = this.source): Promise<void> {
    this.planet = planet;
    this.source = source;
    this.onReplaced?.();
    this.rebuild();
    return this.whenReady();
  }

  /** A new planet from the game's generators (any type and size unless given). */
  generate(seed = this.nextSeed(), options: GenerateOptions = {}): Promise<void> {
    return this.replace(generateLabPlanet(seed, options), null);
  }

  /** Planet `planet` (or its moon `moon`) of star `star` in the galaxy of `seed`. */
  load(seed: string | number, star: number, planet: number, moon?: number): Promise<void> {
    const source: LabSource = { seed: String(seed), star, planet, moon };
    const loaded = loadFromGalaxy(source);
    if (!loaded) return Promise.reject(new Error(`No planet ${planet}${moon !== undefined ? ` moon ${moon}` : ''} at star ${star}`));
    return this.replace(loaded, source);
  }

  /** Comet `comet` of star `star` in the galaxy of `seed`, as active as at its closest pass. */
  loadComet(seed: string | number, star: number, comet: number): Promise<void> {
    const source: LabSource = { seed: String(seed), star, planet: 0, comet };
    const loaded = loadFromGalaxy(source);
    if (!loaded) return Promise.reject(new Error(`No comet ${comet} at star ${star}`));
    return this.replace(loaded, source);
  }

  /** Named asteroid `asteroid` of belt `belt` of star `star` in the galaxy of `seed`. */
  loadAsteroid(seed: string | number, star: number, belt: number, asteroid: number): Promise<void> {
    const source: LabSource = { seed: String(seed), star, planet: 0, belt, asteroid };
    const loaded = loadFromGalaxy(source);
    if (!loaded) return Promise.reject(new Error(`No asteroid ${asteroid} in belt ${belt} at star ${star}`));
    return this.replace(loaded, source);
  }

  setType(type: LabPlanet['type']): Promise<void> {
    return this.replace(withType(this.planet, type));
  }

  setKind(kind: LabKind): Promise<void> {
    return this.replace(withKind(this.planet, kind));
  }

  /** Changes the terraformable climate state, e.g. `terraform({ pressure: 1, composition: 'oxygenNitrogen' })`. */
  terraform(change: StateSpec): Promise<void> {
    const climate = this.planet.climate;
    if (!climate) return Promise.resolve();
    const state = changeState(climate.state, change, climate.setting.gravity);
    return this.replace({ ...this.planet, climate: { ...climate, state } });
  }

  // --- Terraforming (the magic rays over time) ---

  /** The planet's climate at the terraforming time, with where it's settling (null: nothing done to it, or a giant). */
  get terraformSnapshot(): TerraformSnapshot | null {
    const t = this.terraformState;
    const base = labClimateData(this.planet);
    if (!t || t.actions.length === 0 || !base) return null;
    return this.timeline(t).at(t.time);
  }

  private timeline(t: LabTerraform): TerraformTimeline {
    return new TerraformTimeline(labClimateData(this.planet)!, t.actions, [{ time: 0, mode: t.mode }]);
  }

  /** Holds `ray` for `seconds` (raySeconds) from the terraforming time, which then moves on by as much. */
  ray(ray: RayId, seconds = this.raySeconds): Promise<void> {
    const base = labClimateData(this.planet);
    if (!base) return Promise.resolve();
    const t = (this.terraformState ??= { actions: [], time: 0, mode: 'relaxed' });
    const added = holdRay(this.timeline(t), t.time, seconds, ray, this.rayChoice, t.mode);
    t.actions.push(...added);
    t.time += seconds;
    this.lastRay = ray;
    return this.terraformChanged();
  }

  /** Deploys or recalls an orbital mirror at the terraforming time, which moves on to when it's unfolded or folded away. */
  mirror(way: MirrorWay = 'deploy'): Promise<void> {
    this.rayChoice.mirror = way;
    return this.lightAction('mirror', (t) => mirrorAction(t.actions, t.time, t.mode, way));
  }

  /** Closes or opens the sunshade a step at the terraforming time, which moves on to when it has. */
  shade(way: ShadeWay = 'close'): Promise<void> {
    this.rayChoice.shade = way;
    return this.lightAction('sunshade', (t) => shadeAction(t.actions, t.time, t.mode, way));
  }

  /** Sprays aerosol for `seconds` (raySeconds) from the terraforming time, which then moves on by as much. */
  aerosol(seconds = this.raySeconds): Promise<void> {
    if (!labClimateData(this.planet)) return Promise.resolve();
    const t = (this.terraformState ??= { actions: [], time: 0, mode: 'relaxed' });
    const added = holdAerosol(this.timeline(t), t.time, seconds);
    this.lightNote = added.length === 0 ? 'No air here to hold a haze up, or the haze is as thick as it gets' : '';
    t.actions.push(...added);
    t.time += seconds;
    this.lastRay = 'aerosol';
    return this.terraformChanged();
  }

  private lightAction(tool: LightToolId, make: (t: LabTerraform) => ReturnType<typeof mirrorAction>): Promise<void> {
    if (!labClimateData(this.planet)) return Promise.resolve();
    const t = (this.terraformState ??= { actions: [], time: 0, mode: 'relaxed' });
    const action = make(t);
    this.lastRay = tool;
    if (typeof action === 'string') {
      this.lightNote = action;
      return this.terraformChanged();
    }
    this.lightNote = '';
    t.actions.push(action);
    // On to when it's in place, as a held ray moves the time on.
    t.time = action.start + action.duration;
    return this.terraformChanged();
  }

  /**
   * Beams a greenhouse works of `kind` down at the terraforming time, which
   * moves on to when it has landed: at `site` (a unit vector in the body
   * frame), or on the nearest dry land to the view that has room.
   */
  works(kind: WorksKind, site?: [number, number, number]): Promise<void> {
    const base = labClimateData(this.planet);
    if (!base) return Promise.resolve();
    const t = (this.terraformState ??= { actions: [], time: 0, mode: 'relaxed' });
    this.lastRay = kind;
    const sites = site ? [site] : this.landSites();
    let action: ReturnType<typeof placeAction> = 'No dry land here to set it down on';
    for (const s of sites) {
      action = placeAction(t.actions, t.time, t.mode, kind, s, base);
      if (typeof action !== 'string' || !/close/.test(action)) break;
    }
    if (typeof action === 'string') {
      this.lightNote = action;
      return this.terraformChanged();
    }
    this.lightNote = '';
    t.actions.push(action);
    t.time = action.start + action.duration;
    return this.terraformChanged();
  }

  /** Beams the last works of `kind` (or of any kind) still standing back up, at the terraforming time. */
  removeWorks(kind?: WorksKind): Promise<void> {
    const t = this.terraformState;
    if (!t) return Promise.resolve();
    const standing = worksAt(t.actions, t.time).runs.filter((r) => r.removed === null && (!kind || r.kind === kind));
    const run = standing[standing.length - 1];
    if (!run) {
      this.lightNote = 'No works here to beam up';
      return this.terraformChanged();
    }
    this.lightNote = '';
    const action = removeAction(run, Math.max(t.time, run.from));
    t.actions.push(action);
    t.time = action.start + action.duration;
    return this.terraformChanged();
  }

  /** Moves the terraforming time on by `seconds` (the works keep running). */
  runOn(seconds = 60): Promise<void> {
    if (!this.terraformState) return Promise.resolve();
    return this.setTerraformTime(this.terraformState.time + seconds);
  }

  /** The works standing at the terraforming time. */
  get groundWorks(): ReturnType<typeof worksAt> {
    const t = this.terraformState;
    return worksAt(t?.actions ?? [], t?.time ?? 0);
  }

  /** Dry land, nearest the view first (the globe view's own ground; any site in the system view). */
  private landSites(): [number, number, number][] {
    const globe = this._level?.globe ?? null;
    const towards = this._level?.carry();
    const view = towards?.ship ?? towards?.direction ?? new Vector3(0, 0, 1);
    const out: { site: [number, number, number]; d: number }[] = [];
    const n = 600;
    const dir = new Vector3();
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      dir.set(Math.cos(a) * r, y, Math.sin(a) * r);
      if (globe && globe.landingAt(dir) !== 'land') continue;
      out.push({ site: [dir.x, dir.y, dir.z], d: -dir.dot(view) });
    }
    return out.sort((a, b) => a.d - b.d).map((o) => o.site);
  }

  /** The mirrors and the shade up at the terraforming time. */
  get installations(): ReturnType<typeof installationsAt> {
    const t = this.terraformState;
    return installationsAt(t?.actions ?? [], t?.time ?? 0);
  }

  /** Shows the terraformed climate at game time `time` (s from the first action). */
  setTerraformTime(time: number): Promise<void> {
    const t = (this.terraformState ??= { actions: [], time: 0, mode: 'relaxed' });
    t.time = Math.max(0, time);
    return this.terraformChanged();
  }

  setTerraformMode(mode: TerraformMode): Promise<void> {
    const t = (this.terraformState ??= { actions: [], time: 0, mode });
    t.mode = mode;
    return this.terraformChanged();
  }

  /** Undoes all terraforming: the planet as it is (the globe is rebuilt). */
  clearTerraform(): Promise<void> {
    this.terraformState = null;
    this.lastRay = null;
    this.rebuild();
    return this.whenReady();
  }

  /** When the last action is over (for the time slider's range), s. */
  get terraformEnd(): number {
    const t = this.terraformState;
    if (!t) return 0;
    return t.actions.reduce((end, a) => Math.max(end, a.start + a.duration), 0);
  }

  private terraformChanged(): Promise<void> {
    this.applyTerraform();
    this.saveUrl();
    this.onBuilt?.();
    this.framesSinceBuild = 0;
    return this.whenReady();
  }

  /** The level and the chart follow the terraformed climate. */
  private applyTerraform(): void {
    const snap = this.terraformSnapshot;
    if (snap) this._level?.applyTerraform(snap.climate);
    this._level?.setInstallations(this.installations, this.terraformState?.time ?? 0);
    this._level?.setWorks(this.groundWorks, this.terraformState?.time ?? 0);
    this.showChartNow(snap);
  }

  /** The chart for the climate now (hidden without terraforming, unless `showChart`). */
  showChartNow(snap = this.terraformSnapshot): void {
    const base = labClimateData(this.planet);
    if (!base || (!snap && !this.showChart)) {
      this.chart.hide();
      return;
    }
    const s = snap ?? { climate: base, target: base, settlesIn: 0 };
    const t = this.terraformState;
    const mode = t?.mode ?? 'relaxed';
    // Milestones as they'd have been reached, sampled every 5 s up to now.
    const milestones = new Milestones();
    const type = this.planet.type === 'gas' ? 'barren' : this.planet.type;
    const flags = milestoneFlags(type, base);
    if (t && t.actions.length > 0) {
      const timeline = this.timeline(t);
      for (let time = 0; time <= t.time; time += 5) milestones.check('lab', flags, milestoneFlags(type, timeline.at(Math.min(time, t.time)).climate), time);
      milestones.check('lab', flags, milestoneFlags(type, s.climate), t.time);
    }
    this.chart.show({
      name: this.planet.name,
      snapshot: s,
      mode,
      forecast: this.forecast(s.target, mode),
      leak: leakRate(s.climate, mode),
      milestones: milestones.log('lab'),
      picker: this.lastRay === 'mirror' ? 'mirror' : this.lastRay === 'sunshade' ? 'shade' : 'gas',
      projects:
        t && t.actions.some((a) => a.tool)
          ? [describeInstallations(this.installations, s.climate, mode), describeWorks(this.groundWorks, s.climate, mode)].filter(Boolean).join(' · ')
          : undefined,
    });
  }

  private forecast(target: ClimateData, mode: TerraformMode): ClimateData | null {
    const tool = this.lastRay;
    if (!tool) return null;
    if (tool === 'factory' || tool === 'sink') {
      const t = this.terraformState;
      return forecastWorks(target, labClimateData(this.planet)!, t?.actions ?? [], t?.time ?? 0, mode, tool);
    }
    if (tool === 'mirror' || tool === 'sunshade' || tool === 'lance' || tool === 'aerosol') {
      const t = this.terraformState;
      return forecastLight(target, t?.actions ?? [], t?.time ?? 0, mode, tool, this.rayChoice, this.raySeconds);
    }
    return forecastClimate(target, tool, this.rayChoice, this.raySeconds);
  }

  /** A new seed, deterministic in the current one and how many were asked for. */
  nextSeed(): number {
    return hashSeed(this.planet.seed, 'lab', ++this.rolls) % 1_000_000;
  }

  /** Radius changed: the setting follows it if the view asks so (in place: the panel is bound to it). */
  radiusChanged(): void {
    const climate = this.planet.climate;
    if (this.view.autoSetting && climate) Object.assign(climate.setting, withAutoSetting(this.planet).climate!.setting);
    this.changed();
  }

  /**
   * Globe view: shows the next geyser or lava vent (the fly camera moves the
   * UFO over it, the orbit camera looks at it from the side, near the limb).
   */
  lookAtVent(): Promise<void> {
    const level = this._level;
    if (!level) return Promise.resolve();
    const vents = [
      ...(level.geysers?.activity.vents.map((v) => v.dir) ?? []),
      ...(level.globe?.lava?.activity.vents ?? []),
      ...(level.comet?.vents.map((v) => v.dir) ?? []),
    ];
    if (vents.length === 0) return Promise.resolve();
    const [x, y, z] = vents[++this.vent % vents.length]!;
    if (this.view.camera === 'fly' && level.ship) {
      level.ship.placeAt(new Vector3(x, y, z));
      return this.whenReady();
    }
    // From the side, so the plumes and fountains stand up against the sky near the limb.
    const lon = (Math.atan2(x, z) * 180) / Math.PI;
    const lat = (Math.asin(y) * 180) / Math.PI;
    return this.look(lon + 50, lat * 0.6, 2.2);
  }

  /**
   * The camera over the biggest storm under way (of `kind` if given, e.g.
   * 'cyclone', 'cell', 'ash'), at `zoom` radii, or, with the fly camera, the
   * UFO parked beside it. Globe view only (the system view's surface spins
   * under the camera). Resolves false if there is none.
   */
  lookAtStorm(kind?: string, zoom = 1.6): Promise<boolean> {
    const level = this._level;
    const weather = level?.globe?.weather;
    if (!level || !weather) return Promise.resolve(false);
    const storms = weather.shown.filter((e) => !kind || e.kind === kind).sort((a, b) => b.size - a.size);
    const storm = storms[0];
    if (!storm) return Promise.resolve(false);
    const c: [number, number, number] = [0, 0, 0];
    stormCentre(storm, this.clock.renderTime, c);
    if (this.view.camera === 'fly' && level.ship) {
      // Beside the storm, looking in under it.
      const side = offsetDirection(c, 0, storm.size * 1.2, [0, 0, 0]);
      level.ship.placeAt(new Vector3(side[0], side[1], side[2]));
      return this.whenReady().then(() => true);
    }
    const lon = (Math.atan2(c[0], c[2]) * 180) / Math.PI;
    const lat = (Math.asin(c[1]) * 180) / Math.PI;
    return this.look(lon, lat, zoom).then(() => true);
  }

  /** Something was edited in place: rebuild once edits pause. */
  changed(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.framesSinceBuild = 0;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.rebuild();
    }, REBUILD_DELAY_MS);
  }

  // --- View ---

  /** View options that apply without a rebuild. */
  applyLive(): void {
    this.clock.paused = this.view.paused;
    this.clock.speed = this.view.speed;
    this._level?.applyLive();
  }

  /** Jumps the clock (and the moons with it) to system time `time`. */
  setTime(time: number): void {
    this.clock.set(time);
    this._level?.bodies?.jump(time);
  }

  /** Camera above longitude/latitude (degrees) at `zoom` planet radii (see LabLevel.look). */
  look(lon: number, lat: number, zoom?: number): Promise<void> {
    this._level?.look(lon, lat, zoom);
    this.framesSinceBuild = 0;
    return this.whenReady();
  }

  /** Builds the 3D view for the current planet and view now. */
  rebuild(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const old = this._level;
    const carry = old && old.mode.view === this.view.view && old.mode.camera === this.view.camera ? old.carry() : null;
    const level = new LabLevel(this.planet, this.view, this.clock, this.game.camera, this.game.input, this.debug, carry);
    this._level = level;
    this.game.setLevel(level);
    old?.dispose();
    this.framesSinceBuild = 0;
    this.applyTerraform();
    this.saveUrl();
    this.onBuilt?.();
  }

  private afterFrame(): void {
    // Frames count once the surface has refined for the current view.
    if (this.timer !== null || !this.settled) return;
    if (this.framesSinceBuild < READY_FRAMES) this.framesSinceBuild++;
    if (!this.ready || this.waiters.length === 0) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  private saveUrl(): void {
    history.replaceState(null, '', `${location.pathname}#${encodeLab(this.state)}`);
  }
}

function loadFromGalaxy(source: LabSource): LabPlanet | null {
  const galaxy = generateGalaxy(parseSeed(source.seed));
  const ref = systemRef(galaxy, source.star);
  if (!ref) return null;
  const system = generateSystem(ref);
  if (source.asteroid !== undefined) return labFromAsteroid(system, source.belt ?? 0, source.asteroid);
  return source.comet !== undefined ? labFromComet(system, source.comet) : labFromSystem(system, source.planet, source.moon);
}
