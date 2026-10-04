import type { AnimalSpecies } from '../gen/animals';
import type { PlantKind, PlantSpecies } from '../gen/plants';
import { speciesKey } from '../cargo/inventory';
import type { Radar } from '../radar/Radar';
import { animalParams } from '../surface/animalParams';
import type { AnimalIcons } from '../ui/animalIcons';
import type { PlantIcons } from '../ui/plantIcons';

/** Seconds between refreshes of the rows' status lines. */
const REFRESH_SECONDS = 0.25;

/** The pictures the tab shows (drawn with the game's renderer), or none (tests). */
export interface SpeciesIcons {
  readonly plants: PlantIcons;
  readonly animals: AnimalIcons;
}

const PLAN_WORDS = { quadruped: 'Four-legged', hexapod: 'Six-legged', biped: 'Two-legged' } as const;
const PLANT_KINDS: Record<PlantKind, string> = { tree: 'Tree', largeBush: 'Large bush', smallBush: 'Small bush' };

/** One animal's line under its name: body, diet, how it lives, its length (units read as metres, as for the gait). */
export function describeAnimal(s: AnimalSpecies): string {
  const diet = s.diet === 'carnivore' ? 'hunter' : 'grazer';
  const group =
    s.herdMax <= 1
      ? 'alone'
      : `${s.diet === 'carnivore' ? 'packs' : 'herds'} of ${s.herdMin === s.herdMax ? s.herdMin : `${s.herdMin}–${s.herdMax}`}`;
  return `${PLAN_WORDS[s.form.plan]} ${diet} · ${group} · ${s.length.toFixed(1)} m`;
}

/** A plant's line under its name. */
export function describePlant(s: PlantSpecies): string {
  return `${PLANT_KINDS[s.kind]} · ${s.height.toFixed(1)} m tall`;
}

/** How many herds (or packs) of a species the census found, as the row says it. */
export function herdCountText(s: AnimalSpecies, herds: number): string {
  if (herds === 0) return 'None found';
  const word = s.herdMax <= 1 ? 'seen' : s.diet === 'carnivore' ? (herds === 1 ? 'pack' : 'packs') : herds === 1 ? 'herd' : 'herds';
  return `${herds} ${word}`;
}

interface AnimalRow {
  readonly button: HTMLButtonElement;
  readonly status: HTMLElement;
  text: string;
}

/**
 * The planet map's Species tab (#planet-species): every animal species of the
 * planet, each with its picture, what it is and how many herds the radar's
 * census found, then its plants. Clicking an animal tracks it with the radar
 * (`Radar`), clicking it again stops; the row says how near the nearest is.
 * The DOM is shared by every planet level: `attach` fills it, `detach`
 * empties it. Pictures are drawn one a frame, so opening it never stalls.
 */
export class SpeciesTab {
  private readonly root = document.getElementById('planet-species');
  private readonly rows: AnimalRow[] = [];
  private note: HTMLElement | null = null;
  /** Pictures still to draw: an image and how to draw it. */
  private readonly pending: { img: HTMLImageElement; draw: () => string }[] = [];
  private attached = false;
  private shown = false;
  private sinceRefresh = Infinity;

  constructor(
    /** The body's key (combat/busted.ts), for the icons' cache. */
    private readonly body: string,
    private readonly animals: readonly AnimalSpecies[],
    private readonly plants: readonly PlantSpecies[],
    private readonly radar: Radar | null,
    private readonly icons: SpeciesIcons | null,
  ) {}

  /** The species tracked by the radar, or null. */
  get tracking(): number | null {
    return this.radar?.tracking ?? null;
  }

  /** Fills the shared list with this planet's species. */
  attach(): void {
    const root = this.root;
    if (!root || this.attached) return;
    this.attached = true;
    root.replaceChildren();
    this.rows.length = 0;
    this.pending.length = 0;

    root.append(this.heading('Animals'));
    if (this.animals.length === 0) {
      root.append(this.message(this.plants.length > 0 ? 'No animals live here.' : 'Nothing lives here.'));
    } else {
      this.note = this.message('');
      root.append(this.note);
      this.animals.forEach((s, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'species-row animal';
        button.dataset.species = String(index);
        button.setAttribute('aria-pressed', 'false');
        const status = document.createElement('span');
        status.className = 'species-status';
        button.append(this.picture(() => this.icons!.animals.url(`${this.body}:animal:${index}`, s)), this.label(s.name, describeAnimal(s)), status);
        button.addEventListener('click', () => this.toggle(index));
        root.append(button);
        this.rows.push({ button, status, text: '' });
      });
    }
    if (this.plants.length > 0) {
      root.append(this.heading('Plants'));
      this.plants.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'species-row plant';
        row.append(this.picture(() => this.icons!.plants.url(speciesKey(this.body, s.index), s)), this.label(s.name, describePlant(s)));
        root.append(row);
      });
    }
    this.sinceRefresh = Infinity;
    this.refresh();
  }

  /** Empties the shared list. */
  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.show(false);
    this.root?.replaceChildren();
    this.rows.length = 0;
    this.pending.length = 0;
    this.note = null;
  }

  /** Shows or hides the list; showing it starts the radar's census, so the rows can count the herds. */
  show(shown: boolean): void {
    this.shown = shown;
    if (this.root) this.root.hidden = !shown;
    if (shown) {
      this.radar?.survey();
      this.sinceRefresh = Infinity;
    }
  }

  /** While shown: one more picture, and the rows' status every so often. */
  update(frameDt: number): void {
    if (!this.attached) return;
    this.sinceRefresh += frameDt;
    if (this.sinceRefresh >= REFRESH_SECONDS) this.refresh();
    if (!this.shown) return;
    const next = this.pending.shift();
    if (next) next.img.src = next.draw();
  }

  /** Tracks species `index`, or stops if it's the one tracked. */
  toggle(index: number): void {
    if (!this.radar) return;
    this.radar.track(this.radar.tracking === index ? null : index);
    this.sinceRefresh = Infinity;
    this.refresh();
  }

  private refresh(): void {
    this.sinceRefresh = 0;
    const radar = this.radar;
    const tracking = radar?.tracking ?? null;
    const census = radar?.census;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i]!;
      const on = i === tracking;
      let text: string;
      if (on) {
        const state = radar!.state;
        text = state === 'surveying' ? 'Searching…' : state === 'none' ? 'None found' : `Tracking · ${radar!.proximity}`;
      } else if (census?.done) text = herdCountText(this.animals[i]!, census.herdCount(i));
      else text = '';
      if (text !== row.text) {
        row.text = text;
        row.status.textContent = text;
      }
      if (row.button.classList.contains('tracking') !== on) {
        row.button.classList.toggle('tracking', on);
        row.button.setAttribute('aria-pressed', String(on));
      }
    }
    if (this.note) {
      const hidden = !animalParams.enabled ? ' Animals are switched off in the menu, so you won’t see them.' : '';
      const text =
        tracking === null
          ? `Pick an animal to track it with the radar.${hidden}`
          : `The radar’s waves point to the nearest ${this.animals[tracking]!.name}. Pick it again to stop.${hidden}`;
      if (this.note.textContent !== text) this.note.textContent = text;
    }
  }

  private heading(text: string): HTMLElement {
    const h = document.createElement('div');
    h.className = 'species-heading';
    h.textContent = text;
    return h;
  }

  private message(text: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'species-note';
    p.textContent = text;
    return p;
  }

  private picture(draw: () => string): HTMLElement {
    const img = document.createElement('img');
    img.className = 'species-icon';
    img.alt = '';
    if (this.icons) this.pending.push({ img, draw });
    return img;
  }

  private label(name: string, line: string): HTMLElement {
    const box = document.createElement('span');
    box.className = 'species-label';
    const n = document.createElement('span');
    n.className = 'species-name';
    n.textContent = name;
    const l = document.createElement('span');
    l.className = 'species-line';
    l.textContent = line;
    box.append(n, l);
    return box;
  }
}
