import { Vector3 } from 'three';
import type { Debug } from '../core/Debug';
import type { Game } from '../core/Game';
import type { ClimateData, ClimateState } from '../gen/climate';
import { generateGalaxy } from '../gen/galaxy';
import { hashSeed, parseSeed } from '../gen/rng';
import { generateSystem } from '../gen/system';
import { offsetDirection, stormCentre } from '../gen/weather';
import type { PlanetConfig } from '../world/Planet';
import { LabClock, LabLevel } from './LabLevel';
import {
  DEFAULT_VIEW,
  decodeLab,
  encodeLab,
  generateLabPlanet,
  labClimateData,
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
    game.afterFrame = () => this.afterFrame();
  }

  /** The state a page URL asks for: `#<lab link>`, `?seed&star&planet[&moon]` (a game planet) or `?gen=<seed>[&type&kind]`. */
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
    if (params.has('star') && params.has('planet')) {
      const source: LabSource = {
        seed: params.get('seed') ?? '1337',
        star: Number(params.get('star')),
        planet: Number(params.get('planet')),
        moon: params.has('moon') ? Number(params.get('moon')) : undefined,
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

  /** True once the latest edit is built and drawn (for automation). */
  get ready(): boolean {
    return this.timer === null && this._level !== null && this.framesSinceBuild >= READY_FRAMES;
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
    return { planet: this.planet, view: this.view, ...(this.source ? { source: this.source } : {}) };
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

  setType(type: LabPlanet['type']): Promise<void> {
    return this.replace(withType(this.planet, type));
  }

  setKind(kind: LabKind): Promise<void> {
    return this.replace(withKind(this.planet, kind));
  }

  /** Changes the terraformable climate state, e.g. `terraform({ pressure: 1, composition: 'oxygenNitrogen' })`. */
  terraform(change: Partial<ClimateState>): Promise<void> {
    const climate = this.planet.climate;
    if (!climate) return Promise.resolve();
    return this.replace({ ...this.planet, climate: { ...climate, state: { ...climate.state, ...change } } });
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
    const vents = [...(level.geysers?.activity.vents.map((v) => v.dir) ?? []), ...(level.globe?.lava?.activity.vents ?? [])];
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
    this.saveUrl();
    this.onBuilt?.();
  }

  private afterFrame(): void {
    if (this.timer !== null || this.framesSinceBuild >= READY_FRAMES) return;
    if (++this.framesSinceBuild < READY_FRAMES) return;
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
  const ref = galaxy.stars[source.star];
  return ref ? labFromSystem(generateSystem(ref), source.planet, source.moon) : null;
}
