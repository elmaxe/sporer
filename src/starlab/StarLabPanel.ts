import type GUI from 'lil-gui';
import type { Controller } from 'lil-gui';
import type { StarActivity, StormSpec } from '../gen/starActivity';
import { MAIN_SEQUENCE_CLASSES, STAR_KINDS, describeStar, type SpectralClass, type StarData, type StarKind } from '../gen/stars';
import type { SystemTuning } from '../gen/system';
import type { FpsCounter } from '../ui/FpsCounter';
import { blackHoleParams } from '../world/BlackHoleLook';
import { discOf, discPeakTemperature, schwarzschildRadius } from '../gen/blackHoles';
import { HOLE_RANGES, STAR_RANGES, TUNING_RANGES, decodeStarLab, sanitizeStar, tunable, type GenerateStarOptions } from './labStars';
import type { StarLab } from './StarLab';

const VIEWS = { 'Star close up': 'star', 'Whole system': 'system' };
const KIND_LABELS: Record<StarKind, string> = {
  mainSequence: 'main sequence',
  redDwarf: 'red dwarf',
  whiteDwarf: 'white dwarf',
  redGiant: 'red giant',
  blueGiant: 'blue giant',
  blackHole: 'black hole',
};
const ANY = 'any';
const DRAWN = 'as drawn';
const CHOICE = { [DRAWN]: DRAWN, yes: 'yes', no: 'no' };

/**
 * The star lab's control panel (lil-gui): the view and the lab's actions at
 * the top (new stars, another look, links, loading a game system), then the
 * star being edited (kind, size, colour, light, mass, a companion, youth),
 * how it lives (surface, spots, rotation, corona pulse, prominences and
 * flares), the system tuner, what the camera follows, and the game's own
 * tunables last. Sliders edit the star in place and the lab rebuilds once
 * they pause; choices that replace it rebuild the star's folders.
 */
export class StarLabPanel {
  private readonly root: GUI;
  private readonly closed = new Map<string, boolean>();
  private readonly loader = { seed: '1337', star: 0 };
  private readonly gen: { kind: string; spectralClass: string; binary: string } = { kind: ANY, spectralClass: ANY, binary: DRAWN };
  private focusFolder: GUI;
  private focusControl: Controller | null = null;

  constructor(
    private readonly gui: GUI,
    private readonly lab: StarLab,
    fps: FpsCounter,
  ) {
    this.buildLab(fps);
    this.root = gui.addFolder('Star');
    this.focusFolder = gui.addFolder('Camera follows (whole system)');
    this.buildStar();
    lab.onReplaced = () => queueMicrotask(() => this.buildStar());
  }

  /** After each build: the focus list follows the system's bodies. */
  rebuilt(): void {
    this.focusControl?.destroy();
    this.focusControl = null;
    const level = this.lab.level;
    this.focusFolder.show(level?.mode === 'system');
    if (!level || level.mode !== 'system') return;
    const names: Record<string, string> = { 'the whole system': '' };
    for (const b of level.world.bodies) names[b.name] = b.name;
    const pick = { body: level.focus?.name ?? '' };
    this.focusControl = this.focusFolder
      .add(pick, 'body', names)
      .name('body')
      .onChange((name: string) => void this.lab.focus(name || null));
  }

  private buildLab(fps: FpsCounter): void {
    const lab = this.lab;
    const view = lab.view;
    const f = this.gui.addFolder('Lab');
    f.add(view, 'view', VIEWS).listen().onChange(() => lab.rebuild());
    f.add(view, 'speed', 0, 20, 0.1).name('time speed (0: stopped)').listen().onChange(() => void lab.setView({}));
    f.add(view, 'trails').name('orbit trails').listen().onChange(() => void lab.setView({}));
    f.add(view, 'starfield').listen().onChange(() => lab.rebuild());
    f.add(view, 'wireframe').listen().onChange(() => void lab.setView({}));
    f.add(fps, 'shown').name('FPS counter');

    const kinds: Record<string, string> = { [ANY]: ANY };
    for (const k of STAR_KINDS) kinds[KIND_LABELS[k]] = k;
    const classes: Record<string, string> = { [ANY]: ANY };
    for (const c of MAIN_SEQUENCE_CLASSES) classes[c] = c;
    const options = (): GenerateStarOptions => {
      const o: GenerateStarOptions = {};
      if (this.gen.kind !== ANY) o.kind = this.gen.kind as StarKind;
      if (this.gen.spectralClass !== ANY) o.spectralClass = this.gen.spectralClass as SpectralClass;
      if (this.gen.binary !== DRAWN) o.binary = this.gen.binary === 'yes';
      return o;
    };
    const actions = {
      generate: () => void lab.generate(lab.nextSeed(), options()),
      look: () => void lab.rerollLook(),
      system: () => void lab.rerollSystem(),
      copyLink: () => void copy(lab.link),
      copyJson: () => void copy(JSON.stringify(lab.star, null, 2)),
      pasteJson: () => {
        const text = prompt('Star JSON (as copied with "Copy star JSON"), or a star lab link');
        if (!text) return;
        const hash = text.includes('#') ? text.slice(text.indexOf('#') + 1) : null;
        const state = hash ? decodeStarLab(hash) : null;
        if (state) return void lab.replace(state);
        try {
          void lab.setStar(sanitizeStar(JSON.parse(text) as Partial<StarData>));
        } catch (err) {
          alert(`Not valid JSON: ${String(err)}`);
        }
      },
    };
    f.add(actions, 'generate').name('🎲 New star and system');
    f.add(actions, 'look').name('🎲 Another look for this star');
    f.add(actions, 'system').name('🎲 Another system round it');
    const g = f.addFolder('New stars are').close();
    g.add(this.gen, 'kind', kinds);
    g.add(this.gen, 'spectralClass', classes).name('class (main sequence)');
    g.add(this.gen, 'binary', CHOICE).name('a binary pair');
    f.add(actions, 'copyLink').name('Copy link to this star');
    f.add(actions, 'copyJson').name('Copy star JSON');
    f.add(actions, 'pasteJson').name('Paste star JSON or link…');

    const l = f.addFolder("Load a game system's star").close();
    l.add(this.loader, 'seed').name('galaxy seed');
    l.add(this.loader, 'star', 0, 5000, 1).name('star id');
    const load = (star: number | 'sol') => lab.load(this.loader.seed, star).catch((err: unknown) => alert(String(err instanceof Error ? err.message : err)));
    l.add({ load: () => void load(this.loader.star) }, 'load').name('Load');
    l.add({ sol: () => void load('sol') }, 'sol').name('Load Sol (our own)');
  }

  /** (Re)builds the folders of the selected star, its activity and the system tuner. */
  private buildStar(): void {
    const remember = (gui: GUI) => {
      for (const folder of gui.folders) {
        this.closed.set(folder._title, folder._closed);
        remember(folder);
      }
    };
    remember(this.root);
    for (const c of [...this.root.controllers]) c.destroy();
    for (const folder of [...this.root.folders]) folder.destroy();
    const lab = this.lab;
    const s = lab.star as Mutable<StarData>;
    const state = lab.state;
    const changed = () => lab.changed();

    if (state.stars.length > 1) {
      const names: Record<string, number> = {};
      state.stars.forEach((x, i) => (names[`${'AB'[i]}: ${describeStar(x)}`] = i));
      this.root.add({ star: lab.selected }, 'star', names).name('editing').onChange((i: number) => lab.select(Number(i)));
    }
    const pair = { binary: state.stars.length > 1, young: state.young };
    if (!state.real) this.root.add(pair, 'binary').name('a binary pair').onChange((v: boolean) => void lab.setBinary(v));
    if (!state.real && s.kind !== 'blackHole') this.root.add(pair, 'young').name('young (disc, forming planets)').onChange((v: boolean) => void lab.setYoung(v));

    const e = this.folder('What it is');
    const kinds: Record<string, StarKind> = {};
    for (const k of STAR_KINDS) kinds[KIND_LABELS[k]] = k;
    e.add({ kind: s.kind }, 'kind', kinds).onChange((kind: StarKind) => void lab.setStar({ kind }));
    if (s.kind === 'mainSequence') {
      e.add({ cls: s.spectralClass }, 'cls', [...MAIN_SEQUENCE_CLASSES]).name('class').onChange((spectralClass: SpectralClass) => void lab.setStar({ spectralClass }));
    }
    if (s.kind === 'blackHole') {
      // Everything else follows from the mass and the disc (gen/blackHoles.ts blackHoleStar).
      const disc = { ...discOf(s) };
      const hole = { mass: s.mass, turn: disc.turn > 0 ? 'with the planets' : 'against them' };
      const rebuild = () => void lab.setStar({ mass: hole.mass, disc: { ...disc, turn: hole.turn === 'with the planets' ? 1 : -1 } });
      e.add(hole, 'mass', ...HOLE_RANGES.mass, 0.1).name('mass (suns)').onFinishChange(rebuild);
      e.add(disc, 'outer', ...HOLE_RANGES.outer, 0.1).name('disc reaches (r_s)').onFinishChange(rebuild);
      e.add(disc, 'feeding', ...HOLE_RANGES.feeding, 0.01).name('fed (share of Eddington)').onFinishChange(rebuild);
      e.add(hole, 'turn', ['with the planets', 'against them']).name('disc turns').onChange(rebuild);
      const facts = {
        shadow: `${s.radius.toFixed(1)} units (r_s ${schwarzschildRadius(s).toFixed(2)})`,
        disc: `${Math.round(discPeakTemperature(s.mass, disc.feeding))} K at its hottest`,
        light: `${s.luminosity.toFixed(2)} × the Sun's`,
      };
      for (const k of ['shadow', 'disc', 'light'] as const) e.add(facts, k).disable();
      this.buildBlackHoleLook();
      this.buildTuner();
      return;
    }
    e.addColor(s, 'color').name('colour').onChange(changed);
    e.add(s, 'radius', ...STAR_RANGES.radius, 0.5).name('radius (units; Sun ≈ 30)').onChange(changed);
    e.add(s, 'luminosity', ...STAR_RANGES.luminosity, 0.005).name('luminosity (G = 1)').onChange(changed);
    e.add(s, 'mass', ...STAR_RANGES.mass, 0.01).name('mass (G = 1)').onChange(changed);

    const a = s.activity as Mutable<StarActivity>;
    const live = this.folder('How it lives');
    live.add(a, 'pace', 0, 5, 0.01).name('surface pace').onChange(changed);
    live.add(a, 'granulation', 0.5, 40, 0.1).name('granulation (cells)').onChange(changed);
    live.add(a, 'contrast', 0, 1, 0.01).name('cell contrast').onChange(changed);
    live.add(a, 'spots', 0, 1, 0.01).name('sunspots').onChange(changed);
    live.add(a, 'rotationPeriod', 1, 1000, 1).name('turn (s at the equator)').onChange(changed);
    live.add(a, 'pulse', 0, 0.6, 0.01).name('corona pulse').onChange(changed);
    live.add(a, 'pulsePeriod', 0.5, 60, 0.1).name('pulse period (s)').onChange(changed);
    live.add({ reset: () => void lab.resetActivity() }, 'reset').name("Back to its kind's");
    this.storm(live, 'Prominences (loops)', a.prominence, false);
    this.storm(live, 'Flares (bursts)', a.flare, true);

    this.buildTuner();
  }

  /** How black holes are drawn: the game's own look tunables (shared by every hole). */
  private buildBlackHoleLook(): void {
    const f = this.folder('How it looks');
    f.add(blackHoleParams, 'beaming', 0, 1, 0.01).name('Doppler beaming (1: as physics)');
    f.add(blackHoleParams, 'exposure', 0, 8, 0.05).name('disc brightness');
    f.add(blackHoleParams, 'opacity', 0, 3, 0.01).name('disc opacity');
    f.add(blackHoleParams, 'innerPeriod', 0.5, 30, 0.1).name('inner edge turns in (s)');
    f.add(blackHoleParams, 'maxSteps', 20, 300, 1).name('ray steps per pixel');
  }

  /** A storm kind's controls (per-slot chance, timing, size, speed, particles). */
  private storm(parent: GUI, title: string, spec: Mutable<StormSpec>, flare: boolean): void {
    const changed = () => this.lab.changed();
    const f = parent.addFolder(title);
    if (this.closed.get(title) ?? true) f.close();
    const life = spec.life as [number, number];
    const size = spec.size as [number, number];
    const speed = spec.speed as [number, number];
    f.add(spec, 'interval', 0.5, 60, 0.1).name('slot (s)').onChange(changed);
    f.add(spec, 'chance', 0, 1, 0.01).name('chance per slot').onChange(changed);
    f.add(life, 0, 0.2, 60, 0.1).name('lasts from (s)').onChange(changed);
    f.add(life, 1, 0.2, 60, 0.1).name('lasts to (s)').onChange(changed);
    f.add(size, 0, 0, flare ? 1.5 : 2, 0.01).name(flare ? 'cone from (rad)' : 'height from (radii)').onChange(changed);
    f.add(size, 1, 0, flare ? 1.5 : 2, 0.01).name(flare ? 'cone to (rad)' : 'height to (radii)').onChange(changed);
    if (flare) {
      f.add(speed, 0, 0, 4, 0.01).name('speed from (radii/s)').onChange(changed);
      f.add(speed, 1, 0, 4, 0.01).name('speed to (radii/s)').onChange(changed);
    }
    f.add(spec, 'particles', 0, 800, 10).onChange(changed);
  }

  private buildTuner(): void {
    const lab = this.lab;
    const state = lab.state;
    const f = this.folder('System');
    const seed = { seed: state.seed };
    f.add(seed, 'seed', 0, 0xffffffff, 1).name('system seed').onFinishChange((v: number) => void lab.rerollSystem(Math.round(v) >>> 0));
    if (!tunable(state)) {
      f.add({ note: state.real ? 'Sol is hand-made' : 'Young: its disc decides' }, 'note').name('tuner').disable();
      return;
    }
    const t = state.tuning;
    const n = (v: number | undefined) => v ?? -1;
    const nums = { planets: n(t.planets), spacing: t.spacing ?? 1, moons: n(t.moons), comets: n(t.comets) };
    const pick = (v: boolean | undefined) => (v === undefined ? DRAWN : v ? 'yes' : 'no');
    const choices = { mainBelt: pick(t.mainBelt), debris: pick(t.debris) };
    const count = (key: 'planets' | 'moons' | 'comets') => (v: number) => void lab.setTuning({ [key]: v < 0 ? null : v });
    f.add(nums, 'planets', -1, TUNING_RANGES.planets[1], 1).name('planets (-1: as drawn)').onFinishChange(count('planets'));
    f.add(nums, 'spacing', ...TUNING_RANGES.spacing, 0.05).name('spacing ×').onFinishChange((v: number) => void lab.setTuning({ spacing: v === 1 ? null : v }));
    f.add(nums, 'moons', -1, TUNING_RANGES.moons[1], 1).name('moons each (-1: as drawn)').onFinishChange(count('moons'));
    f.add(nums, 'comets', -1, TUNING_RANGES.comets[1], 1).name('comets (-1: as drawn)').onFinishChange(count('comets'));
    const choice = (key: 'mainBelt' | 'debris') => (v: string) => void lab.setTuning({ [key]: v === DRAWN ? null : v === 'yes' } as Partial<SystemTuning>);
    f.add(choices, 'mainBelt', CHOICE).name('main belt (needs a giant)').onChange(choice('mainBelt'));
    f.add(choices, 'debris', CHOICE).name('debris disc').onChange(choice('debris'));
    const reset = () => void lab.setTuning({ planets: null, spacing: null, moons: null, comets: null, mainBelt: null, debris: null }).then(() => this.buildStar());
    f.add({ reset }, 'reset').name('All as drawn');
  }

  /** A folder of the star section, open or closed as it was. */
  private folder(title: string): GUI {
    const f = this.root.addFolder(title);
    if (this.closed.get(title)) f.close();
    return f;
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    prompt('Copy this:', text);
  }
}
