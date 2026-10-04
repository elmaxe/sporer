import type { Debug } from '../core/Debug';
import type { Game } from '../core/Game';
import type { BodyPlan } from '../gen/animalForm';
import type { AnimalSpecies } from '../gen/animals';
import type { Habitability } from '../gen/climate';
import { generateGalaxy, systemRef } from '../gen/galaxy';
import { hashSeed, parseSeed } from '../gen/rng';
import { generateSystem } from '../gen/system';
import { labFromSystem, toPlanetConfig } from '../lab/labPlanet';
import { forgetAnimal } from '../surface/animalLook';
import { animalSetup } from '../surface/animalSetup';
import { AnimalLabLevel } from './AnimalLabLevel';
import {
  DEFAULT_ANIMAL_VIEW,
  decodeAnimalLab,
  encodeAnimalLab,
  generateLabAnimals,
  rerollAnimal,
  withBodyPlan,
  type AnimalLabState,
  type AnimalLabView,
  type AnimalSource,
  type GenerateAnimalOptions,
} from './labAnimals';

/** Quiet time after the last edit before the animal is rebuilt (slider drags edit every frame). */
const REBUILD_DELAY_MS = 120;
/** Frames drawn after a build before the lab counts as ready (shaders compiled). */
const READY_FRAMES = 3;

/**
 * The animal lab: a set of animal species as the game grows, draws and
 * walks them, the selected one editable, shown alone (standing, grazing, or
 * walking or trotting round a circle, with the game's level-of-detail
 * crossfade as you zoom), as a line-up of its levels of detail, the whole
 * set side by side, or roaming in herds on a planet with the game's own
 * surface code. Owns the model, rebuilds the 3D view when it changes and
 * keeps the page's #hash in step. `window.animalLab` is this object:
 * automation drives it with `set`, `setForm`, `select`, `setView`,
 * `generate`, `load`, `look` and waits for `ready`.
 */
export class AnimalLab {
  state: AnimalLabState;
  private _level: AnimalLabLevel | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private framesSinceBuild = 0;
  private waiters: (() => void)[] = [];
  private rolls = 0;
  onBuilt: (() => void) | null = null;
  onReplaced: (() => void) | null = null;

  constructor(
    private readonly game: Game,
    private readonly debug: Debug,
    state: AnimalLabState,
  ) {
    this.state = state;
    game.afterFrame = () => this.afterFrame();
  }

  /**
   * The state a page URL asks for: `#<animal lab link>`, `?seed&star&planet[&moon][&species]`
   * (a game planet's animals), or `?gen=<seed>[&tier][&diet][&plan]`; plus `view`, `lod` and `pace`.
   */
  static stateFromUrl(url: URL): AnimalLabState {
    const params = url.searchParams;
    const view: AnimalLabView = { ...DEFAULT_ANIMAL_VIEW };
    const v = params.get('view');
    if (v === 'specimen' || v === 'lineup' || v === 'species' || v === 'herds') view.view = v;
    const lod = params.get('lod');
    if (lod === 'auto') view.lod = 'auto';
    else if (lod !== null && ['0', '1', '2'].includes(lod)) view.lod = Number(lod) as 0 | 1 | 2;
    const pace = params.get('pace');
    if (pace === 'stand' || pace === 'graze' || pace === 'walk' || pace === 'trot') view.pace = pace;
    const hash = url.hash.slice(1);
    if (hash) {
      const state = decodeAnimalLab(hash);
      if (state) return state;
    }
    if (params.has('star') && params.has('planet')) {
      const source: AnimalSource = {
        seed: params.get('seed') ?? '1337',
        star: Number(params.get('star')),
        planet: Number(params.get('planet')),
        moon: params.has('moon') ? Number(params.get('moon')) : undefined,
      };
      const loaded = loadFromGalaxy(source);
      if (loaded) return { ...loaded.state, selected: Math.min(loaded.state.species.length - 1, Number(params.get('species') ?? 0) || 0), view: { ...view, gravity: loaded.gravity }, source };
    }
    const options: GenerateAnimalOptions = {};
    const tier = params.get('tier');
    if (tier) options.tier = Math.min(3, Math.max(1, Number(tier) || 3)) as Habitability;
    const diet = params.get('diet');
    if (diet === 'herbivore' || diet === 'carnivore') options.diet = diet;
    const plan = params.get('plan');
    if (plan === 'quadruped' || plan === 'hexapod' || plan === 'biped') options.plan = plan;
    const gen = params.get('gen');
    return { ...generateLabAnimals(gen !== null ? parseSeed(gen) : 1, options), view };
  }

  get level(): AnimalLabLevel | null {
    return this._level;
  }

  get view(): AnimalLabView {
    return this.state.view;
  }

  get species(): AnimalSpecies {
    return this.state.species[this.state.selected]!;
  }

  /** True once the latest edit is built and drawn (and the herds' cells are all loaded). */
  get ready(): boolean {
    return this.timer === null && this._level !== null && this.framesSinceBuild >= READY_FRAMES && this.settled;
  }

  private get settled(): boolean {
    const l = this._level;
    return !l || ((l.herds?.settled ?? true) && (l.plants?.settled ?? true));
  }

  whenReady(): Promise<void> {
    return this.ready ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }

  get link(): string {
    return `${location.origin}${location.pathname}#${encodeAnimalLab(this.state)}`;
  }

  get planetLink(): string | null {
    const s = this.state.source;
    if (!s) return null;
    return new URL(`lab.html?seed=${encodeURIComponent(s.seed)}&star=${s.star}&planet=${s.planet}${s.moon !== undefined ? `&moon=${s.moon}` : ''}`, location.href).href;
  }

  get gameLink(): string | null {
    const s = this.state.source;
    return s ? new URL(`./?seed=${encodeURIComponent(s.seed)}&star=${s.star}`, location.href).href : null;
  }

  // --- Editing ---

  /** Merges `patch` into the selected species (and `form` into its form) and rebuilds. Resolves when drawn. */
  set(patch: Partial<Omit<AnimalSpecies, 'form'>> & { form?: Partial<AnimalSpecies['form']> }): Promise<void> {
    const s = this.species;
    const { form, ...rest } = patch;
    this.replaceSelected({ ...s, ...rest, form: { ...s.form, ...form } });
    return this.whenReady();
  }

  setForm(patch: Partial<AnimalSpecies['form']>): Promise<void> {
    return this.set({ form: patch });
  }

  select(index: number): Promise<void> {
    this.state.selected = Math.min(this.state.species.length - 1, Math.max(0, Math.round(index)));
    this.onReplaced?.();
    this.rebuild();
    return this.whenReady();
  }

  /** Rebuilds the selected species with another body plan. */
  setBodyPlan(plan: BodyPlan): Promise<void> {
    this.replaceSelected(withBodyPlan(this.species, plan));
    return this.whenReady();
  }

  /** New proportions of the same body plan for the selected species. */
  reroll(): Promise<void> {
    this.replaceSelected(rerollAnimal(this.species, ++this.rolls, this.view.gravity));
    return this.whenReady();
  }

  private replaceSelected(s: AnimalSpecies): void {
    this.state.species = this.state.species.map((x, i) => (i === this.state.selected ? { ...s, index: i } : x));
    this.onReplaced?.();
    this.rebuild();
  }

  /** A new set of species (tier 3 unless given), as a planet would have. */
  generate(seed = this.nextSeed(), options: GenerateAnimalOptions = {}): Promise<void> {
    const made = generateLabAnimals(seed, { tier: this.state.tier, ...options }, this.view.gravity);
    this.state = { ...made, view: this.state.view };
    this.onReplaced?.();
    this.rebuild();
    return this.whenReady();
  }

  /** The animals of planet `planet` (or its moon `moon`) of star `star` in the galaxy of `seed`. */
  load(seed: string | number, star: number, planet: number, moon?: number, species = 0): Promise<void> {
    const source: AnimalSource = { seed: String(seed), star, planet, moon };
    const loaded = loadFromGalaxy(source);
    if (!loaded) return Promise.reject(new Error(`No animals on planet ${planet}${moon !== undefined ? ` moon ${moon}` : ''} of star ${star}`));
    this.state = { ...loaded.state, selected: Math.min(loaded.state.species.length - 1, Math.max(0, species)), view: { ...this.state.view, gravity: loaded.gravity }, source };
    this.onReplaced?.();
    this.rebuild();
    return this.whenReady();
  }

  replace(state: AnimalLabState): Promise<void> {
    this.state = state;
    this.onReplaced?.();
    this.rebuild();
    return this.whenReady();
  }

  nextSeed(): number {
    return hashSeed(this.state.seed, 'animal lab', ++this.rolls) % 1_000_000;
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

  /** Changes view options; rebuilds unless only live ones changed (the tint, the sky, the pace and speed). */
  setView(patch: Partial<AnimalLabView>): Promise<void> {
    const live: (keyof AnimalLabView)[] = ['showLods', 'sky', 'wireframe', 'pace', 'speed'];
    const rebuild = (Object.keys(patch) as (keyof AnimalLabView)[]).some((k) => !live.includes(k) && patch[k] !== this.state.view[k]);
    Object.assign(this.state.view, patch);
    if (rebuild) this.rebuild();
    else {
      this._level?.applyLive();
      this.saveUrl();
    }
    return this.whenReady();
  }

  /** Camera from azimuth and elevation (degrees) at `distance` (the animal's lengths; herds: units). */
  look(yaw: number, pitch: number, distance?: number): Promise<void> {
    this._level?.look(yaw, pitch, distance);
    this.framesSinceBuild = 0;
    return this.whenReady();
  }

  /** Herds view: puts the camera over the `index`-th nearest herd. Resolves when drawn. */
  lookAtHerd(index = 0): Promise<boolean> {
    const found = this._level?.lookAtHerd(index) ?? false;
    this.framesSinceBuild = 0;
    return this.whenReady().then(() => found);
  }

  rebuild(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const old = this._level;
    for (const s of this.state.species) forgetAnimal(s);
    const level = new AnimalLabLevel(this.state, this.game.camera, this.game.input, this.debug, old?.carry() ?? null);
    this._level = level;
    this.game.setLevel(level);
    old?.dispose();
    this.framesSinceBuild = 0;
    this.saveUrl();
    this.onBuilt?.();
  }

  private afterFrame(): void {
    if (this.timer !== null || !this.settled) return;
    if (this.framesSinceBuild < READY_FRAMES) this.framesSinceBuild++;
    if (!this.ready || this.waiters.length === 0) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  private saveUrl(): void {
    history.replaceState(null, '', `${location.pathname}#${encodeAnimalLab(this.state)}`);
  }
}

/** A game planet's animals and its gravity (null if it has none). */
function loadFromGalaxy(source: AnimalSource): { state: Omit<AnimalLabState, 'view'>; gravity: number } | null {
  const galaxy = generateGalaxy(parseSeed(source.seed));
  const ref = systemRef(galaxy, source.star);
  if (!ref) return null;
  const planet = labFromSystem(generateSystem(ref), source.planet, source.moon);
  if (!planet) return null;
  const config = toPlanetConfig(planet);
  const setup = animalSetup(config);
  if (!setup) return null;
  const { plan } = setup;
  return { state: { species: plan.species.map((s) => ({ ...s, form: { ...s.form } })), selected: 0, tier: plan.tier, seed: plan.seed }, gravity: plan.gravity };
}
