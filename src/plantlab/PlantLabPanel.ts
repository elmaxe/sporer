import type GUI from 'lil-gui';
import type { Habitability } from '../gen/climate';
import { ARCHITECTURES, type Architecture } from '../gen/plantForm';
import { PLANT_KINDS, type PlantSpecies } from '../gen/plants';
import { plantParams } from '../surface/plantParams';
import type { FpsCounter } from '../ui/FpsCounter';
import { PLANT_LAB_CROWNS, sanitizeSpecies, type PlantLabLod } from './labPlants';
import type { PlantLab } from './PlantLab';

const VIEWS = { 'One plant': 'specimen', 'Levels of detail side by side': 'lineup', 'Grove (as in the game)': 'grove' };
const LODS: Record<string, PlantLabLod> = { 'auto (by distance, as in the game)': 'auto', '0: full': 0, '1: leaves per branch': 1, '2: one crown': 2, '3: far': 3 };
const KINDS = { tree: 'tree', 'large bush': 'largeBush', 'small bush': 'smallBush' };
const ARCH_LABELS: Record<Architecture, string> = {
  conifer: 'conifer (leader and layers)',
  broadleaf: 'broadleaf (round crown)',
  palm: 'palm (fronds)',
  shrub: 'shrub (stems from the ground)',
};

/**
 * The plant lab's control panel (lil-gui): the view at the top, then the
 * selected species' numbers (its envelope: size, crown, colours, climate)
 * and its form (how it branches and leafs), then the game's own plant
 * tunables. Sliders edit the species in place and the lab rebuilds once they
 * pause; choices that replace it (another species, architecture, a new set)
 * rebuild the species folders.
 */
export class PlantLabPanel {
  private readonly root: GUI;
  private readonly closed = new Map<string, boolean>();
  private readonly loader = { seed: '1337', star: 0, planet: 0, moon: -1, species: 0 };
  private readonly gen = { tier: 3 as Habitability };

  constructor(
    private readonly gui: GUI,
    private readonly lab: PlantLab,
    fps: FpsCounter,
  ) {
    this.buildLab(fps);
    this.buildLight();
    this.root = gui.addFolder('Plant');
    this.buildSpecies();
    lab.onReplaced = () => queueMicrotask(() => this.buildSpecies());
  }

  private buildLab(fps: FpsCounter): void {
    const lab = this.lab;
    const view = lab.view;
    const f = this.gui.addFolder('Lab');
    f.add(view, 'view', VIEWS).onChange(() => lab.rebuild());
    f.add(view, 'lod', LODS).name('level of detail').onChange((v: PlantLabLod | string) => {
      view.lod = v === 'auto' ? 'auto' : (Number(v) as PlantLabLod);
      lab.rebuild();
    });
    f.add(view, 'showLods').name('tint the levels').onChange(() => void lab.setView({}));
    f.add(view, 'wireframe').onChange(() => void lab.setView({}));
    f.add(view, 'skeleton').name('skeleton (stems)').onChange(() => lab.rebuild());
    // Read live by the materials and the grove.
    f.add(plantParams, 'range', 0.3, 2, 0.05).name('view distance ×');
    f.add(fps, 'shown').name('FPS counter');
    const actions = {
      generate: () => void lab.generate(lab.nextSeed(), { tier: this.gen.tier }),
      reroll: () => void lab.reroll(),
      copyLink: () => void copy(lab.link),
      copyJson: () => void copy(JSON.stringify(lab.species, null, 2)),
      pasteJson: () => {
        const text = prompt('Plant JSON (as copied with "Copy plant JSON")');
        if (!text) return;
        try {
          const raw = JSON.parse(text) as Partial<PlantSpecies>;
          void lab.set(sanitizeSpecies(raw, lab.species, lab.state.selected));
        } catch (err) {
          alert(`Not valid JSON: ${String(err)}`);
        }
      },
    };
    f.add(this.gen, 'tier', { 'T1 (hardy)': 1, 'T2': 2, 'T3 (Earth-like)': 3 }).name('tier of new sets');
    f.add(actions, 'generate').name('🎲 New set of species');
    f.add(actions, 'reroll').name('🎲 Another form for this plant');
    f.add(actions, 'copyLink').name('Copy link to these plants');
    f.add(actions, 'copyJson').name('Copy plant JSON');
    f.add(actions, 'pasteJson').name('Paste plant JSON…');

    const g = f.addFolder('Load a game planet\'s plants').close();
    g.add(this.loader, 'seed').name('galaxy seed');
    g.add(this.loader, 'star', 0, 5000, 1).name('star id');
    g.add(this.loader, 'planet', 0, 8, 1).name('planet #');
    g.add(this.loader, 'moon', -1, 4, 1).name('moon # (-1: planet)');
    g.add(this.loader, 'species', 0, 7, 1).name('species #');
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

  /** (Re)builds the species and form folders for the selected species. */
  private buildSpecies(): void {
    for (const folder of this.root.folders) this.closed.set(folder._title, folder._closed);
    for (const c of [...this.root.controllers]) c.destroy();
    for (const folder of [...this.root.folders]) folder.destroy();
    const lab = this.lab;
    const s = lab.species as Mutable<PlantSpecies>;
    const changed = () => lab.changed();

    const names: Record<string, number> = {};
    lab.state.species.forEach((x, i) => (names[`${i}: ${x.name} (${PLANT_KINDS[x.kind].label.toLowerCase()})`] = i));
    const pick = { selected: lab.state.selected };
    this.root.add(pick, 'selected', names).name('species').onChange((i: number) => void lab.select(Number(i)));

    const e = this.folder('Envelope (what the game reads)');
    e.add(s, 'name').onFinishChange(changed);
    e.add(s, 'kind', KINDS).onChange(changed);
    e.add(s, 'height', 0.3, 20, 0.05).name('height (units)').onChange(changed);
    e.add(s, 'trunkShare', 0, 0.9, 0.01).name('bare trunk share').onChange(changed);
    e.add(s, 'trunkWidth', 0.005, 0.12, 0.001).name('trunk radius / height').onChange(changed);
    e.add(s, 'crownRadius', 0.1, 10, 0.05).name('crown radius').onChange(changed);
    e.add(s, 'crown', PLANT_LAB_CROWNS).name('crown shape').onChange(changed);
    e.addColor(s, 'trunkColor').name('bark').onChange(changed);
    e.addColor(s, 'leafColor').name('leaves').onChange(changed);
    e.add(s, 'minTemperature', 150, 450, 1).name('coldest (K)').onChange(changed);
    e.add(s, 'maxTemperature', 150, 450, 1).name('warmest (K)').onChange(changed);
    e.add(s, 'weight', 0, 3, 0.05).name('abundance').onChange(changed);

    const form = s.form as Mutable<PlantSpecies['form']>;
    const f = this.folder('Form (how it grows)');
    const arch: Record<string, Architecture> = {};
    for (const a of ARCHITECTURES) arch[ARCH_LABELS[a]] = a;
    f.add(form, 'architecture', arch).onChange((a: Architecture) => void lab.setArchitecture(a));
    f.add(form, 'seed', 0, 0xffffff, 1).name('seed').onChange(changed);
    f.add(form, 'depth', 0, 3, 1).name('branch orders').onChange(changed);
    f.add(form, 'branches', 1, 40, 1).name('main branches / stems / fronds').onChange(changed);
    f.add(form, 'twigs', 0, 8, 1).name('side branches each').onChange(changed);
    f.add(form, 'angle', 0, 140, 1).name('branch angle°').onChange(changed);
    f.add(form, 'twigAngle', 0, 120, 1).name('side branch angle°').onChange(changed);
    f.add(form, 'lengthRatio', 0, 1.5, 0.01).name('side branch length').onChange(changed);
    f.add(form, 'tropism', -1, 1, 0.01).name('droop (−) / reach up (+)').onChange(changed);
    f.add(form, 'gnarl', 0, 1, 0.01).onChange(changed);
    f.add(form, 'lean', 0, 1, 0.01).onChange(changed);
    f.add(form, 'tiers', 2, 6, 1).name('tiers (tiered crowns)').onChange(changed);
    f.add(form, 'leafSize', 0.05, 1, 0.01).name('leaf mass size').onChange(changed);
    f.add(form, 'leafDensity', 1, 3, 1).name('leaf masses per tip').onChange(changed);
    f.addColor(form, 'leafColor2').name('second leaf colour').onChange(changed);
    f.add(form, 'accent', 0, 1, 0.01).name('flowers / fruit').onChange(changed);
    f.addColor(form, 'accentColor').name('flower colour').onChange(changed);
  }

  /** A folder of the species section, open or closed as it was. */
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
