import type GUI from 'lil-gui';
import { BODY_PLANS, COAT_PATTERNS, type BodyPlan } from '../gen/animalForm';
import type { AnimalSpecies } from '../gen/animals';
import type { Habitability } from '../gen/climate';
import { animalParams } from '../surface/animalParams';
import type { FpsCounter } from '../ui/FpsCounter';
import { ANIMAL_LAB_PACES, sanitizeAnimal, type AnimalLabLod } from './labAnimals';
import type { AnimalLab } from './AnimalLab';

const VIEWS = { 'One animal': 'specimen', 'Levels of detail side by side': 'lineup', 'Every species side by side': 'species', 'Herds on a planet (as in the game)': 'herds' };
const LODS: Record<string, AnimalLabLod> = { 'auto (by distance, as in the game)': 'auto', '0: full': 0, '1: fewer sides, no ears': 1, '2: far': 2 };
const PLAN_LABELS: Record<BodyPlan, string> = { quadruped: 'four legs', hexapod: 'six legs (insect)', biped: 'two legs (bird, theropod)' };

/**
 * The animal lab's control panel (lil-gui): the view and what the animal is
 * doing at the top, then the selected species' numbers (size, diet, herd,
 * climate) and its body (proportions, features, coat). Sliders edit the
 * species in place and the lab rebuilds once they pause; choices that
 * replace it (another species, body plan, a new set) rebuild the folders.
 */
export class AnimalLabPanel {
  private readonly root: GUI;
  private readonly closed = new Map<string, boolean>();
  private readonly loader = { seed: '1337', star: 0, planet: 0, moon: -1, species: 0 };
  private readonly gen = { tier: 3 as Habitability };

  constructor(
    private readonly gui: GUI,
    private readonly lab: AnimalLab,
    fps: FpsCounter,
  ) {
    this.buildLab(fps);
    this.buildLight();
    this.root = gui.addFolder('Animal');
    this.buildSpecies();
    lab.onReplaced = () => queueMicrotask(() => this.buildSpecies());
  }

  private buildLab(fps: FpsCounter): void {
    const lab = this.lab;
    const view = lab.view;
    const f = this.gui.addFolder('Lab');
    f.add(view, 'view', VIEWS).onChange(() => lab.rebuild());
    f.add(view, 'pace', ANIMAL_LAB_PACES).name('doing (one animal)').onChange(() => void lab.setView({}));
    f.add(view, 'speed', 0, 3, 0.05).name('time ×').onChange(() => void lab.setView({}));
    f.add(view, 'gravity', 0.1, 3, 0.05).name('gravity (g)').onChange(() => lab.changed());
    f.add(view, 'lod', LODS).name('level of detail').onChange((v: AnimalLabLod | string) => {
      view.lod = v === 'auto' ? 'auto' : (Number(v) as AnimalLabLod);
      lab.rebuild();
    });
    f.add(view, 'showLods').name('tint the levels').onChange(() => void lab.setView({}));
    f.add(view, 'wireframe').onChange(() => void lab.setView({}));
    f.add(view, 'skeleton').name('skeleton (spine, legs)').onChange(() => lab.rebuild());
    f.add(animalParams, 'range', 0.3, 2, 0.05).name('view distance ×');
    f.add(fps, 'shown').name('FPS counter');
    const actions = {
      generate: () => void lab.generate(lab.nextSeed(), { tier: this.gen.tier }),
      reroll: () => void lab.reroll(),
      copyLink: () => void copy(lab.link),
      copyJson: () => void copy(JSON.stringify(lab.species, null, 2)),
      pasteJson: () => {
        const text = prompt('Animal JSON (as copied with "Copy animal JSON")');
        if (!text) return;
        try {
          void lab.set(sanitizeAnimal(JSON.parse(text) as Partial<AnimalSpecies>, lab.species, lab.state.selected));
        } catch (err) {
          alert(`Not valid JSON: ${String(err)}`);
        }
      },
    };
    f.add(this.gen, 'tier', { 'T1 (one grazer)': 1, 'T2 (two grazers, a hunter)': 2, 'T3 (three grazers, two hunters)': 3 }).name('tier of new sets');
    f.add(actions, 'generate').name('🎲 New set of species');
    f.add(actions, 'reroll').name('🎲 Another body for this animal');
    f.add(actions, 'copyLink').name('Copy link to these animals');
    f.add(actions, 'copyJson').name('Copy animal JSON');
    f.add(actions, 'pasteJson').name('Paste animal JSON…');

    const g = f.addFolder("Load a game planet's animals").close();
    g.add(this.loader, 'seed').name('galaxy seed');
    g.add(this.loader, 'star', 0, 5000, 1).name('star id');
    g.add(this.loader, 'planet', 0, 8, 1).name('planet #');
    g.add(this.loader, 'moon', -1, 4, 1).name('moon # (-1: planet)');
    g.add(this.loader, 'species', 0, 5, 1).name('species #');
    g.add(
      {
        load: () => {
          const { seed, star, planet, moon, species } = this.loader;
          lab.load(seed, star, planet, moon >= 0 ? moon : undefined, species).catch((err: unknown) => alert(String(err instanceof Error ? err.message : err)));
        },
      },
      'load',
    ).name('Load');
  }

  private buildLight(): void {
    const lab = this.lab;
    const view = lab.view;
    const f = this.gui.addFolder('Light & ground').close();
    f.add(view, 'sunAzimuth', -180, 180, 1).name('sun azimuth°').onChange(() => lab.changed());
    f.add(view, 'sunElevation', -10, 90, 1).name('sun elevation°').onChange(() => lab.changed());
    f.addColor(view, 'ground').onChange(() => lab.changed());
    f.addColor(view, 'sky').onChange(() => void lab.setView({}));
  }

  private buildSpecies(): void {
    for (const folder of this.root.folders) this.closed.set(folder._title, folder._closed);
    for (const c of [...this.root.controllers]) c.destroy();
    for (const folder of [...this.root.folders]) folder.destroy();
    const lab = this.lab;
    const s = lab.species as Mutable<AnimalSpecies>;
    const changed = () => lab.changed();

    const names: Record<string, number> = {};
    lab.state.species.forEach((x, i) => (names[`${i}: ${x.name} (${x.diet})`] = i));
    const pick = { selected: lab.state.selected };
    this.root.add(pick, 'selected', names).name('species').onChange((i: number) => void lab.select(Number(i)));

    const e = this.folder('Species (what the game reads)');
    e.add(s, 'name').onFinishChange(changed);
    e.add(s, 'diet', ['herbivore', 'carnivore']).onChange(changed);
    e.add(s, 'length', 0.2, 10, 0.05).name('length, snout to rump (units)').onChange(changed);
    e.add(s, 'herdMin', 1, 40, 1).name('herd: fewest').onChange(changed);
    e.add(s, 'herdMax', 1, 40, 1).name('herd: most').onChange(changed);
    e.add(s, 'minTemperature', 150, 450, 1).name('coldest (K)').onChange(changed);
    e.add(s, 'maxTemperature', 150, 450, 1).name('warmest (K)').onChange(changed);
    e.add(s, 'weight', 0, 3, 0.05).name('abundance').onChange(changed);

    const form = s.form as Mutable<AnimalSpecies['form']>;
    // The body is one of the creature editor's random creatures, from the seed (🎲 Reroll draws another).
    const b = this.folder('Body (a creature from the editor)');
    const plans: Record<string, BodyPlan> = {};
    for (const p of BODY_PLANS) plans[PLAN_LABELS[p]] = p;
    b.add(form, 'plan', plans).name('body plan').onChange((p: BodyPlan) => void lab.setBodyPlan(p));
    b.add(form, 'seed', 0, 0xffffff, 1).name('body seed').onChange(changed);
    b.add(form, 'legGirth', 0.5, 2, 0.01).name('leg girth (size, gravity)').onChange(changed);

    const c = this.folder('Coat');
    c.addColor(form, 'color').name('back').onChange(changed);
    c.addColor(form, 'belly').name('belly (countershading)').onChange(changed);
    c.add(form, 'pattern', COAT_PATTERNS).onChange(changed);
    c.add(form, 'patternScale', 0.2, 6, 0.05).name('pattern per length').onChange(changed);
    c.addColor(form, 'patternColor').name('pattern').onChange(changed);
    c.addColor(form, 'accentColor').name('horns, hooves, claws').onChange(changed);
    c.addColor(form, 'eyeColor').name('eyes').onChange(changed);
  }

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
