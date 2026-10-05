import type { Debug } from '../core/Debug';
import type { Game } from '../core/Game';
import { Rng, hashSeed, parseSeed } from '../gen/rng';
import { kindActivity, type StarActivity } from '../gen/starActivity';
import { MAIN_SEQUENCE_CLASSES, STAR_KINDS, generateCompanion, type SpectralClass, type StarData, type StarKind } from '../gen/stars';
import type { SystemData, SystemTuning } from '../gen/system';
import type { Tooltip } from '../ui/Tooltip';
import type { CelestialBody } from '../world/CelestialBody';
import {
  DEFAULT_STAR_VIEW,
  cloneActivity,
  cloneStar,
  decodeStarLab,
  encodeStarLab,
  generateLabStars,
  labSystem,
  loadLabStars,
  rerollLook,
  sanitizeTuning,
  withKind,
  derived,
  type GenerateStarOptions,
  type StarLabState,
  type StarLabView,
} from './labStars';
import { StarLabLevel } from './StarLabLevel';

/** Quiet time after the last edit before the star is rebuilt (slider drags edit every frame). */
const REBUILD_DELAY_MS = 120;
/** Frames drawn after a build before the lab counts as ready (shaders compiled). */
const READY_FRAMES = 3;

/**
 * The star lab: a star (or a binary pair) and its system as the game draws
 * them, every number editable, shown close up or as the whole system. Owns
 * the model, rebuilds the 3D view when it changes and keeps the page's #hash
 * in step. `window.starLab` is this object: automation drives it with
 * `setStar`, `setActivity`, `setTuning`, `setView`, `generate`, `load`,
 * `focus`, `look`, `setTime` and waits for `ready`.
 */
export class StarLab {
  state: StarLabState;
  /** The star the panel edits (0: the main star, 1: a companion). */
  selected = 0;
  private _level: StarLabLevel | null = null;
  private _system: SystemData | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private framesSinceBuild = 0;
  private waiters: (() => void)[] = [];
  private rolls = 0;
  /** Called after each rebuild (the readout refreshes). */
  onBuilt: (() => void) | null = null;
  /** Called when the stars were replaced (the panel rebinds its controls). */
  onReplaced: (() => void) | null = null;

  constructor(
    private readonly game: Game,
    private readonly debug: Debug,
    private readonly tooltip: Tooltip,
    state: StarLabState,
  ) {
    this.state = state;
    game.afterFrame = () => this.afterFrame();
  }

  /**
   * The state a page URL asks for: `#<star lab link>`, `?seed&star` (a game
   * system; `star=sol` our own), or `?gen=<seed>[&kind][&class][&binary=0|1][&young=1]`;
   * plus `view` (star or system).
   */
  static stateFromUrl(url: URL): StarLabState {
    const params = url.searchParams;
    const view: StarLabView = { ...DEFAULT_STAR_VIEW };
    const v = params.get('view');
    if (v === 'star' || v === 'system') view.view = v;
    const hash = url.hash.slice(1);
    if (hash) {
      const state = decodeStarLab(hash);
      if (state) return state;
    }
    const star = params.get('star');
    if (star !== null) {
      const loaded = loadLabStars(params.get('seed') ?? '1337', star.toLowerCase() === 'sol' ? 'sol' : Number(star));
      if (loaded) return { ...loaded, view };
    }
    const options: GenerateStarOptions = {};
    const kind = params.get('kind');
    if (STAR_KINDS.includes(kind as StarKind)) options.kind = kind as StarKind;
    const cls = params.get('class')?.toUpperCase();
    if (MAIN_SEQUENCE_CLASSES.includes(cls as SpectralClass)) options.spectralClass = cls as SpectralClass;
    const binary = params.get('binary');
    if (binary === '0' || binary === '1') options.binary = binary === '1';
    if (params.get('young') === '1') options.young = true;
    const gen = params.get('gen');
    return { ...generateLabStars(gen !== null ? parseSeed(gen) : 1, options), view };
  }

  get level(): StarLabLevel | null {
    return this._level;
  }

  get view(): StarLabView {
    return this.state.view;
  }

  /** The system as generated now (both views list it). */
  get system(): SystemData {
    return (this._system ??= labSystem(this.state));
  }

  /** The star being edited. */
  get star(): StarData {
    return this.state.stars[Math.min(this.selected, this.state.stars.length - 1)]!;
  }

  /** True once the latest edit is built and drawn. */
  get ready(): boolean {
    return this.timer === null && this._level !== null && this.framesSinceBuild >= READY_FRAMES;
  }

  whenReady(): Promise<void> {
    return this.ready ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }

  /** A link to exactly this star, system and view. */
  get link(): string {
    return `${location.origin}${location.pathname}#${encodeStarLab(this.state)}`;
  }

  /** The game at the system this came from, if it did. */
  get gameLink(): string | null {
    const s = this.state.source;
    return s ? new URL(`./?seed=${encodeURIComponent(s.seed)}&star=${s.star}`, location.href).href : null;
  }

  // --- Editing ---

  /** Merges `patch` into the selected star (a new `kind` or class gives that kind's typical star first). Resolves when drawn. */
  setStar(patch: Partial<Omit<StarData, 'activity'>>): Promise<void> {
    let star = this.star;
    if ((patch.kind && patch.kind !== star.kind) || (patch.spectralClass && patch.spectralClass !== star.spectralClass)) {
      star = withKind(star, patch.kind ?? star.kind, patch.spectralClass ?? star.spectralClass);
      const { kind: _k, spectralClass: _c, ...rest } = patch;
      patch = rest;
    }
    // A black hole's size, light and colour follow from its mass and disc.
    this.replaceSelected(derived({ ...star, ...patch }));
    return this.whenReady();
  }

  /** Merges `patch` into the selected star's activity (`prominence` and `flare` merged too). */
  setActivity(patch: Partial<Omit<StarActivity, 'prominence' | 'flare'>> & { prominence?: Partial<StarActivity['prominence']>; flare?: Partial<StarActivity['flare']> }): Promise<void> {
    const a = cloneActivity(this.star.activity ?? kindActivity(this.star));
    const { prominence, flare, ...rest } = patch;
    this.replaceSelected({ ...this.star, activity: { ...a, ...rest, prominence: { ...a.prominence, ...prominence }, flare: { ...a.flare, ...flare } } });
    return this.whenReady();
  }

  /** The selected star's activity back to its kind's. */
  resetActivity(): Promise<void> {
    this.replaceSelected({ ...this.star, activity: kindActivity(this.star) });
    return this.whenReady();
  }

  /** Another look for the selected star: colour and how it lives, round its kind's (see rerollLook). */
  rerollLook(): Promise<void> {
    this.replaceSelected(rerollLook(this.star, hashSeed(this.state.seed, 'look', this.selected, ++this.rolls)));
    return this.whenReady();
  }

  /** Edits the star the panel shows (0 or 1). */
  select(index: number): void {
    this.selected = Math.min(this.state.stars.length - 1, Math.max(0, Math.round(index)));
    this.onReplaced?.();
  }

  /** Adds a companion (a random one, as the galaxy pairs them) or takes it away. */
  setBinary(binary: boolean): Promise<void> {
    if (binary === this.state.stars.length > 1 || this.state.real) return this.whenReady();
    if (binary) {
      const companion = cloneStar(generateCompanion(new Rng(hashSeed(this.state.seed, 'companion', ++this.rolls))));
      this.state.stars = [...this.state.stars, companion].sort((a, b) => b.radius - a.radius);
    } else {
      this.state.stars = [this.state.stars[0]!];
    }
    this.selected = 0;
    this.replaced();
    return this.whenReady();
  }

  /** Wraps the star in its protoplanetary disc with planets still forming (true), or not. */
  setYoung(young: boolean): Promise<void> {
    this.state.young = young;
    this.replaced();
    return this.whenReady();
  }

  /** Merges `patch` into the system tuner's changes (`null` puts one back to as drawn). */
  setTuning(patch: { [K in keyof SystemTuning]?: SystemTuning[K] | null }): Promise<void> {
    const next: Record<string, unknown> = { ...this.state.tuning };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete next[k];
      else next[k] = v;
    }
    this.state.tuning = sanitizeTuning(next);
    this.changedNow();
    return this.whenReady();
  }

  /** Another system round the same star(s): a new seed (which also gives their surfaces new patterns). */
  rerollSystem(seed = this.nextSeed()): Promise<void> {
    this.state.seed = seed;
    this.replaced();
    return this.whenReady();
  }

  /** A new random star (or pair) and system. */
  generate(seed = this.nextSeed(), options: GenerateStarOptions = {}): Promise<void> {
    const made = generateLabStars(seed, { young: this.state.young, ...options });
    this.state = { ...made, tuning: this.state.tuning, view: this.state.view };
    this.selected = 0;
    this.replaced();
    return this.whenReady();
  }

  /** Star `star` (an id, or 'sol') of the galaxy of `seed`, as the game has it. */
  load(seed: string | number, star: number | 'sol'): Promise<void> {
    const loaded = loadLabStars(String(seed), star);
    if (!loaded) return Promise.reject(new Error(`Galaxy ${seed} has no star ${star} (or it is a rogue planet, with none)`));
    this.state = { ...loaded, view: this.state.view };
    this.selected = 0;
    this.replaced();
    return this.whenReady();
  }

  /** Replaces the whole state (a pasted JSON or link). */
  replace(state: StarLabState): Promise<void> {
    this.state = state;
    this.selected = 0;
    this.replaced();
    return this.whenReady();
  }

  nextSeed(): number {
    return hashSeed(this.state.seed, 'star lab', ++this.rolls) % 1_000_000;
  }

  /** Something was edited in place (a panel slider): rebuild once edits pause. */
  changed(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this._system = null;
    this.framesSinceBuild = 0;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.rebuild();
    }, REBUILD_DELAY_MS);
  }

  private changedNow(): void {
    this._system = null;
    this.rebuild();
  }

  private replaced(): void {
    this.onReplaced?.();
    this.changedNow();
  }

  private replaceSelected(star: StarData): void {
    this.state.stars = this.state.stars.map((s, i) => (i === this.selected ? star : s));
    this.replaced();
  }

  // --- View ---

  /** Changes view options; rebuilds only for the view itself or the starfield. */
  setView(patch: Partial<StarLabView>): Promise<void> {
    const rebuild = (['view', 'starfield'] as const).some((k) => k in patch && patch[k] !== this.state.view[k]);
    Object.assign(this.state.view, patch);
    if (rebuild) this.rebuild();
    else {
      this._level?.applyLive();
      this.saveUrl();
    }
    return this.whenReady();
  }

  /** Follows the body named `name` (system view; null: the whole system). */
  focus(name: string | null): Promise<void> {
    const level = this._level;
    if (level) level.setFocus(name === null ? null : (level.world.bodies.find((b) => b.name === name) ?? null));
    this.framesSinceBuild = 0;
    return this.whenReady();
  }

  /** What the camera follows now. */
  get focused(): CelestialBody | null {
    return this._level?.focus ?? null;
  }

  /** Camera from azimuth and elevation (degrees), and `distance` units from its centre if given. */
  look(yaw: number, pitch: number, distance?: number): Promise<void> {
    this._level?.look(yaw, pitch, distance);
    this.framesSinceBuild = 0;
    return this.whenReady();
  }

  /** Jumps the system clock to `time` seconds (storms, spots and orbits as they are then). */
  setTime(time: number): Promise<void> {
    this._level?.world.setTime(time);
    this.framesSinceBuild = 0;
    return this.whenReady();
  }

  /** Builds the 3D view for the current state now. */
  rebuild(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this._system = null;
    const old = this._level;
    const level = new StarLabLevel(this.system, this.state.view, this.game.camera, this.game.input, this.tooltip, this.debug, old?.carry() ?? null);
    this._level = level;
    this.game.setLevel(level);
    old?.dispose();
    this.framesSinceBuild = 0;
    this.saveUrl();
    this.onBuilt?.();
  }

  private afterFrame(): void {
    if (this.timer !== null) return;
    if (this.framesSinceBuild < READY_FRAMES) this.framesSinceBuild++;
    if (!this.ready || this.waiters.length === 0) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  private saveUrl(): void {
    history.replaceState(null, '', `${location.pathname}#${encodeStarLab(this.state)}`);
  }
}
