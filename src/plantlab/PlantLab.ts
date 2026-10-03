import type { Debug } from '../core/Debug';
import type { Game } from '../core/Game';
import type { Habitability } from '../gen/climate';
import { generateGalaxy, systemRef } from '../gen/galaxy';
import type { Architecture } from '../gen/plantForm';
import type { PlantSpecies } from '../gen/plants';
import { hashSeed, parseSeed } from '../gen/rng';
import { generateSystem } from '../gen/system';
import { labFromSystem, toPlanetConfig } from '../lab/labPlanet';
import { forgetPlant } from '../surface/plantLook';
import { plantSetup } from '../surface/plantSetup';
import {
  DEFAULT_PLANT_VIEW,
  cloneSpecies,
  decodePlantLab,
  encodePlantLab,
  generateLabPlants,
  rerollForm,
  withArchitecture,
  type GeneratePlantOptions,
  type PlantLabState,
  type PlantLabView,
  type PlantSource,
} from './labPlants';
import { PlantLabLevel } from './PlantLabLevel';

/** Quiet time after the last edit before the plant is rebuilt (slider drags edit every frame). */
const REBUILD_DELAY_MS = 120;
/** Frames drawn after a build before the lab counts as ready (shaders compiled). */
const READY_FRAMES = 3;

/**
 * The plant lab: a set of plant species as the game grows and draws them,
 * the selected one editable, shown alone (the game's level-of-detail
 * crossfade as you zoom), as a line-up of its levels of detail, or as a grove
 * planted by the game's own surface code. Owns the model, rebuilds the 3D
 * view when it changes and keeps the page's #hash in step. `window.plantLab`
 * is this object: automation drives it with `set`, `setForm`, `select`,
 * `setView`, `generate`, `load`, `look` and waits for `ready`.
 */
export class PlantLab {
  state: PlantLabState;
  private _level: PlantLabLevel | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private framesSinceBuild = 0;
  private waiters: (() => void)[] = [];
  private rolls = 0;
  /** Called after each rebuild (the readout refreshes). */
  onBuilt: (() => void) | null = null;
  /** Called when the species or the selection was replaced (the panel rebinds its controls). */
  onReplaced: (() => void) | null = null;

  constructor(
    private readonly game: Game,
    private readonly debug: Debug,
    state: PlantLabState,
  ) {
    this.state = state;
    game.afterFrame = () => this.afterFrame();
  }

  /**
   * The state a page URL asks for: `#<plant lab link>`, `?seed&star&planet[&moon][&species]`
   * (a game planet's plants), or `?gen=<seed>[&tier][&kind][&arch]`; plus `view` and `lod`.
   */
  static stateFromUrl(url: URL): PlantLabState {
    const params = url.searchParams;
    const view: PlantLabView = { ...DEFAULT_PLANT_VIEW };
    const v = params.get('view');
    if (v === 'specimen' || v === 'lineup' || v === 'grove') view.view = v;
    const lod = params.get('lod');
    if (lod === 'auto') view.lod = 'auto';
    else if (lod !== null && ['0', '1', '2', '3'].includes(lod)) view.lod = Number(lod) as 0 | 1 | 2 | 3;
    const hash = url.hash.slice(1);
    if (hash) {
      const state = decodePlantLab(hash);
      if (state) return state;
    }
    if (params.has('star') && params.has('planet')) {
      const source: PlantSource = {
        seed: params.get('seed') ?? '1337',
        star: Number(params.get('star')),
        planet: Number(params.get('planet')),
        moon: params.has('moon') ? Number(params.get('moon')) : undefined,
      };
      const loaded = loadFromGalaxy(source);
      if (loaded) return { ...loaded, selected: Math.min(loaded.species.length - 1, Number(params.get('species') ?? 0) || 0), view, source };
    }
    const options: GeneratePlantOptions = {};
    const tier = params.get('tier');
    if (tier) options.tier = Math.min(3, Math.max(1, Number(tier) || 3)) as Habitability;
    const kind = params.get('kind');
    if (kind === 'tree' || kind === 'largeBush' || kind === 'smallBush') options.kind = kind;
    const arch = params.get('arch');
    if (arch === 'conifer' || arch === 'broadleaf' || arch === 'palm' || arch === 'shrub') options.architecture = arch;
    const gen = params.get('gen');
    return { ...generateLabPlants(gen !== null ? parseSeed(gen) : 1, options), view };
  }

  get level(): PlantLabLevel | null {
    return this._level;
  }

  get view(): PlantLabView {
    return this.state.view;
  }

  /** The species being shown and edited. */
  get species(): PlantSpecies {
    return this.state.species[this.state.selected]!;
  }

  /** True once the latest edit is built and drawn (and the grove's cells are all loaded). */
  get ready(): boolean {
    return this.timer === null && this._level !== null && this.framesSinceBuild >= READY_FRAMES && (this._level.grove?.settled ?? true);
  }

  whenReady(): Promise<void> {
    return this.ready ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }

  /** A link to exactly this set, selection and view. */
  get link(): string {
    return `${location.origin}${location.pathname}#${encodePlantLab(this.state)}`;
  }

  /** The planet lab at the planet these plants came from, if they did. */
  get planetLink(): string | null {
    const s = this.state.source;
    if (!s) return null;
    return new URL(`lab.html?seed=${encodeURIComponent(s.seed)}&star=${s.star}&planet=${s.planet}${s.moon !== undefined ? `&moon=${s.moon}` : ''}`, location.href).href;
  }

  /** The game at that planet's system. */
  get gameLink(): string | null {
    const s = this.state.source;
    return s ? new URL(`./?seed=${encodeURIComponent(s.seed)}&star=${s.star}`, location.href).href : null;
  }

  // --- Editing ---

  /** Merges `patch` into the selected species (and `form` into its form) and rebuilds. Resolves when drawn. */
  set(patch: Partial<Omit<PlantSpecies, 'form'>> & { form?: Partial<PlantSpecies['form']> }): Promise<void> {
    const s = this.species;
    const { form, ...rest } = patch;
    this.replaceSelected({ ...s, ...rest, form: { ...s.form, ...form } });
    return this.whenReady();
  }

  /** Merges `patch` into the selected species' form. */
  setForm(patch: Partial<PlantSpecies['form']>): Promise<void> {
    return this.set({ form: patch });
  }

  /** Shows and edits species `index` of the set. */
  select(index: number): Promise<void> {
    this.state.selected = Math.min(this.state.species.length - 1, Math.max(0, Math.round(index)));
    this.onReplaced?.();
    this.rebuild();
    return this.whenReady();
  }

  /** Grows the selected species as another architecture (a fresh form of that kind). */
  setArchitecture(architecture: Architecture): Promise<void> {
    this.replaceSelected(withArchitecture(this.species, architecture));
    return this.whenReady();
  }

  /** A different form of the same architecture for the selected species. */
  reroll(): Promise<void> {
    this.replaceSelected(rerollForm(this.species, ++this.rolls));
    return this.whenReady();
  }

  private replaceSelected(s: PlantSpecies): void {
    this.state.species = this.state.species.map((x, i) => (i === this.state.selected ? { ...s, index: i } : x));
    this.onReplaced?.();
    this.rebuild();
  }

  /** A new set of species (tier 3 unless given), as a planet would have. */
  generate(seed = this.nextSeed(), options: GeneratePlantOptions = {}): Promise<void> {
    const made = generateLabPlants(seed, { tier: this.state.tier, ...options });
    this.state = { ...made, view: this.state.view };
    this.onReplaced?.();
    this.rebuild();
    return this.whenReady();
  }

  /** The plants of planet `planet` (or its moon `moon`) of star `star` in the galaxy of `seed`. */
  load(seed: string | number, star: number, planet: number, moon?: number, species = 0): Promise<void> {
    const source: PlantSource = { seed: String(seed), star, planet, moon };
    const loaded = loadFromGalaxy(source);
    if (!loaded) return Promise.reject(new Error(`No plants on planet ${planet}${moon !== undefined ? ` moon ${moon}` : ''} of star ${star}`));
    this.state = { ...loaded, selected: Math.min(loaded.species.length - 1, Math.max(0, species)), view: this.state.view, source };
    this.onReplaced?.();
    this.rebuild();
    return this.whenReady();
  }

  /** Replaces the whole state (a pasted link, a debug dump's). The view is copied into the one the panel is bound to. */
  replace(state: PlantLabState): Promise<void> {
    this.state = { ...state, view: Object.assign(this.state.view, state.view) };
    this.onReplaced?.();
    this.rebuild();
    return this.whenReady();
  }

  nextSeed(): number {
    return hashSeed(this.state.seed, 'plant lab', ++this.rolls) % 1_000_000;
  }

  /** Something was edited in place (a panel slider): rebuild once edits pause. */
  changed(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.framesSinceBuild = 0;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.rebuild();
    }, REBUILD_DELAY_MS);
  }

  // --- View ---

  /** Changes view options; rebuilds unless only live ones changed (the LOD tint, the sky). */
  setView(patch: Partial<PlantLabView>): Promise<void> {
    const live: (keyof PlantLabView)[] = ['showLods', 'sky', 'wireframe'];
    const rebuild = (Object.keys(patch) as (keyof PlantLabView)[]).some((k) => !live.includes(k) && patch[k] !== this.state.view[k]);
    Object.assign(this.state.view, patch);
    if (rebuild) this.rebuild();
    else {
      this._level?.applyLive();
      this.saveUrl();
    }
    return this.whenReady();
  }

  /** Camera from azimuth and elevation (degrees) at `distance` (the plant's heights; the grove: units). */
  look(yaw: number, pitch: number, distance?: number): Promise<void> {
    this._level?.look(yaw, pitch, distance);
    this.framesSinceBuild = 0;
    return this.whenReady();
  }

  /** Builds the 3D view for the current state now. */
  rebuild(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const old = this._level;
    // The panel edits the species in place: grow them afresh.
    for (const s of this.state.species) forgetPlant(s);
    const level = new PlantLabLevel(this.state, this.game.camera, this.game.input, this.debug, old?.carry() ?? null);
    this._level = level;
    this.game.setLevel(level);
    old?.dispose();
    this.framesSinceBuild = 0;
    this.saveUrl();
    this.onBuilt?.();
  }

  private afterFrame(): void {
    if (this.timer !== null || !(this._level?.grove?.settled ?? true)) return;
    if (this.framesSinceBuild < READY_FRAMES) this.framesSinceBuild++;
    if (!this.ready || this.waiters.length === 0) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  private saveUrl(): void {
    history.replaceState(null, '', `${location.pathname}#${encodePlantLab(this.state)}`);
  }
}

/** A game planet's plants (null if it has none). */
function loadFromGalaxy(source: PlantSource): Omit<PlantLabState, 'view'> | null {
  const galaxy = generateGalaxy(parseSeed(source.seed));
  const ref = systemRef(galaxy, source.star);
  if (!ref) return null;
  const planet = labFromSystem(generateSystem(ref), source.planet, source.moon);
  if (!planet) return null;
  const setup = plantSetup(toPlanetConfig(planet));
  if (!setup) return null;
  return { species: setup.plan.species.map(cloneSpecies), selected: 0, tier: setup.plan.tier, seed: setup.plan.seed };
}
