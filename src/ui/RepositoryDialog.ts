import { animalLabLink } from '../animallab/labAnimals';
import type { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import { plantLabLink } from '../plantlab/labPlants';
import { entryLine, entryPlace, speciesFacts } from '../scan/facts';
import type { RepositoryEntry, SpeciesRepository } from '../scan/repository';
import type { SpeciesIcons } from '../planet/SpeciesTab';

/** The key that opens and closes it. */
const TOGGLE_KEY = 'KeyR';
/** Pixels of the pictures on the cards, in the details and on the notice. */
const CARD_SIZE = 80;
const DETAIL_SIZE = 192;
/** How long the notice of a scan stays up, ms. */
const NOTICE_MS = 6000;
/** A clear pixel: a picture's place until it's drawn. */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
/** The lab's habitability tier for a species opened from here (the species is what it shows; the tier only seeds new ones). */
const LAB_TIER = 2;

type Filter = 'all' | 'animal' | 'plant';
const FILTERS: readonly { id: Filter; name: string }[] = [
  { id: 'all', name: 'All' },
  { id: 'animal', name: 'Animals' },
  { id: 'plant', name: 'Plants' },
];

/** What the menu needs from the game: the repository, the pictures, and whether the main menu is open (R then does nothing). */
export interface RepositorySource {
  readonly repository: SpeciesRepository;
  readonly icons: SpeciesIcons;
  /** Told when a scan completes (the scene manager calls it). */
  onScanned: (entry: RepositoryEntry, added: boolean) => void;
}

/**
 * The species repository's menu (#repository in index.html): every species
 * the scanner has read (scan/Scanner.ts, scan/repository.ts), as cards with
 * the species' picture, name and what it is, filtered by All, Animals or
 * Plants; a card's details on the side (below on a phone): a bigger picture,
 * its facts (scan/facts.ts: body, diet, how it lives, climate, colours, home,
 * when it was scanned) and a link to it in the animal or plant lab. Opened
 * with R, the book button at the bottom right (#repository-toggle, with the
 * count on it), the game menu's Species repository button or a scan notice's;
 * it pauses the game while open (as the menu does). Esc, × or a click
 * beside the panel closes it.
 * A scan completing shows a notice at the top (#scan-notice): the species'
 * picture, whether it's new and its number, and a button to open it here.
 * A global entity: pictures are drawn one a frame while it's open, so
 * opening a long list never stalls.
 */
export class RepositoryDialog implements Entity {
  private readonly root = document.getElementById('repository')!;
  private readonly toggle = document.getElementById('repository-toggle') as HTMLButtonElement;
  private readonly badge = document.getElementById('repository-count')!;
  private readonly close = document.getElementById('repository-close') as HTMLButtonElement;
  private readonly tabsEl = document.getElementById('repository-tabs')!;
  private readonly summary = document.getElementById('repository-summary')!;
  private readonly list = document.getElementById('repository-list')!;
  private readonly detail = document.getElementById('repository-detail')!;
  private readonly menuButton = document.getElementById('menu-repository') as HTMLButtonElement | null;
  private readonly notice = document.getElementById('scan-notice')!;
  private readonly noticePicture = document.getElementById('scan-notice-picture') as HTMLImageElement;
  private readonly noticeTitle = document.getElementById('scan-notice-title')!;
  private readonly noticeName = document.getElementById('scan-notice-name')!;
  private readonly noticeOpen = document.getElementById('scan-notice-open') as HTMLButtonElement;
  private readonly tabs = new Map<Filter, HTMLButtonElement>();
  private filter: Filter = 'all';
  /** The species whose details show, by key. */
  private selected: string | null = null;
  /** Pictures still to draw while open. */
  private readonly pending: { img: HTMLImageElement; draw: () => string }[] = [];
  /** The repository's version the list was drawn from, and the count on the button. */
  private drawn = -1;
  private counted = -1;
  /** Whether opening paused the game (then closing resumes it). */
  private pausedIt = false;
  private noticeTimer = 0;
  private noticeKey: string | null = null;

  constructor(
    private readonly game: Game,
    private readonly source: RepositorySource,
    /** Whether the game's menu is open: R is left alone then. */
    private readonly menuOpen: () => boolean,
  ) {
    for (const f of FILTERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'repository-tab';
      button.dataset.filter = f.id;
      button.setAttribute('role', 'tab');
      button.addEventListener('click', () => this.show(f.id));
      this.tabsEl.append(button);
      this.tabs.set(f.id, button);
    }
    this.root.hidden = true;
    this.notice.hidden = true;
    this.toggle.addEventListener('click', this.onToggle);
    this.close.addEventListener('click', this.onClose);
    this.root.addEventListener('click', this.onBackdrop);
    this.menuButton?.addEventListener('click', this.onMenuButton);
    this.noticeOpen.addEventListener('click', this.onNoticeOpen);
    window.addEventListener('keydown', this.onToggleKey);
    source.onScanned = (entry, added) => this.announce(entry, added);
    this.updateCount();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Opens it, on species `key`'s details if given (else the one shown last, or the newest). */
  open(key: string | null = null): void {
    if (key !== null) this.selected = key;
    if (key !== null && this.filter !== 'all' && this.source.repository.entry(key)?.kind !== this.filter) this.filter = 'all';
    this.hideNotice();
    if (!this.isOpen) {
      this.root.hidden = false;
      this.toggle.setAttribute('aria-expanded', 'true');
      this.pausedIt = !this.game.paused;
      this.game.paused = true;
      // Captured at the window, before the game's and the menu's own key handlers.
      window.addEventListener('keydown', this.onKey, true);
    }
    this.render();
    this.close.focus({ preventScroll: true });
  }

  hide(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.pending.length = 0;
    window.removeEventListener('keydown', this.onKey, true);
    if (this.pausedIt) this.game.paused = false;
    this.pausedIt = false;
    (document.activeElement as HTMLElement | null)?.blur();
  }

  /** While open: one more picture a frame, and the list again if a species came in. The count on the button. */
  update(): void {
    this.updateCount();
    if (!this.isOpen) return;
    if (this.source.repository.version !== this.drawn) this.render();
    const next = this.pending.shift();
    if (next) next.img.src = next.draw();
  }

  dispose(): void {
    this.hide();
    this.hideNotice();
    this.toggle.removeEventListener('click', this.onToggle);
    this.close.removeEventListener('click', this.onClose);
    this.root.removeEventListener('click', this.onBackdrop);
    this.menuButton?.removeEventListener('click', this.onMenuButton);
    this.noticeOpen.removeEventListener('click', this.onNoticeOpen);
    window.removeEventListener('keydown', this.onToggleKey);
    this.tabsEl.replaceChildren();
  }

  /** A scan completed: the notice at the top, with the species' picture. */
  announce(entry: RepositoryEntry, added: boolean): void {
    this.noticeKey = entry.key;
    this.notice.classList.toggle('new', added);
    this.noticeTitle.textContent = added ? `New species · No. ${entry.number}` : `Already in your repository · No. ${entry.number}`;
    this.noticeName.textContent = entry.species.name;
    this.noticePicture.src = this.picture(entry, CARD_SIZE);
    this.notice.hidden = false;
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(this.hideNotice, NOTICE_MS);
    this.updateCount();
  }

  private readonly hideNotice = (): void => {
    window.clearTimeout(this.noticeTimer);
    this.notice.hidden = true;
  };

  private show(filter: Filter): void {
    this.filter = filter;
    this.render();
  }

  private updateCount(): void {
    const n = this.source.repository.size;
    if (n === this.counted) return;
    this.counted = n;
    this.badge.textContent = String(n);
    this.badge.hidden = n === 0;
    this.toggle.setAttribute('aria-label', `Species repository (R): ${n} species`);
    this.toggle.title = `Species repository (R) · ${n} species`;
  }

  /** The species' picture, `size` pixels (drawn once, then cached by the icons). */
  private picture(e: RepositoryEntry, size: number): string {
    const { icons } = this.source;
    return e.kind === 'animal' ? icons.animals.url(e.key, e.species, size) : icons.plants.url(e.key, e.species, size);
  }

  private render(): void {
    const { repository } = this.source;
    this.drawn = repository.version;
    this.pending.length = 0;
    const animals = repository.count('animal');
    const plants = repository.count('plant');
    const counts: Record<Filter, number> = { all: repository.size, animal: animals, plant: plants };
    for (const [id, button] of this.tabs) {
      const on = id === this.filter;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', String(on));
      button.textContent = `${FILTERS.find((f) => f.id === id)!.name} ${counts[id]}`;
    }
    this.summary.textContent =
      repository.size === 0
        ? ''
        : `${repository.size} species found: ${animals} ${animals === 1 ? 'animal' : 'animals'} and ${plants} ${plants === 1 ? 'plant' : 'plants'}.`;
    // Newest first.
    const shown = repository.entries.filter((e) => this.filter === 'all' || e.kind === this.filter).reverse();
    if (shown.length === 0) {
      this.selected = this.filter === 'all' ? null : this.selected;
      const what = this.filter === 'animal' ? 'No animals' : this.filter === 'plant' ? 'No plants' : 'Nothing';
      this.list.replaceChildren(
        paragraph(
          `${what} scanned yet. Down in low orbit over a living world, pick the Scanner in the Inventory and hold it on an animal or a plant: each new species goes in here.`,
          'repository-empty',
        ),
      );
      this.detail.replaceChildren();
      this.detail.hidden = true;
      return;
    }
    if (!shown.some((e) => e.key === this.selected)) this.selected = shown[0]!.key;
    this.list.replaceChildren(...shown.map((e) => this.card(e)));
    this.showDetail(repository.entry(this.selected!)!);
  }

  private card(e: RepositoryEntry): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `repository-card ${e.kind}`;
    button.dataset.key = e.key;
    button.setAttribute('role', 'listitem');
    const on = e.key === this.selected;
    button.classList.toggle('selected', on);
    button.setAttribute('aria-pressed', String(on));
    const img = document.createElement('img');
    img.className = 'repository-picture';
    img.alt = '';
    img.src = BLANK;
    img.width = img.height = CARD_SIZE;
    this.pending.push({ img, draw: () => this.picture(e, CARD_SIZE) });
    const label = document.createElement('span');
    label.className = 'repository-label';
    label.append(span('repository-number', `No. ${e.number}`), span('repository-name', e.species.name), span('repository-line', entryLine(e)));
    button.append(img, label);
    button.addEventListener('click', () => {
      this.selected = e.key;
      for (const c of this.list.querySelectorAll<HTMLElement>('.repository-card')) {
        const sel = c.dataset.key === e.key;
        c.classList.toggle('selected', sel);
        c.setAttribute('aria-pressed', String(sel));
      }
      this.showDetail(e);
    });
    return button;
  }

  private showDetail(e: RepositoryEntry): void {
    this.detail.hidden = false;
    const img = document.createElement('img');
    img.className = 'repository-portrait';
    img.alt = e.species.name;
    img.src = BLANK;
    img.width = img.height = DETAIL_SIZE;
    // Drawn first, ahead of the cards.
    this.pending.unshift({ img, draw: () => this.picture(e, DETAIL_SIZE) });
    const head = document.createElement('div');
    head.className = 'repository-detail-head';
    head.append(span('repository-number', `No. ${e.number} · ${e.kind === 'animal' ? 'Animal' : 'Plant'}`), heading(e.species.name), span('repository-line', entryPlace(e)));
    const facts = document.createElement('dl');
    facts.className = 'repository-facts';
    for (const f of speciesFacts(e)) {
      const dt = document.createElement('dt');
      dt.textContent = f.label;
      const dd = document.createElement('dd');
      for (const c of f.colors ?? []) {
        const swatch = document.createElement('span');
        swatch.className = 'repository-swatch';
        swatch.style.background = c;
        swatch.title = c;
        dd.append(swatch);
      }
      dd.append(f.value);
      facts.append(dt, dd);
    }
    const link = document.createElement('a');
    link.className = 'menu-button repository-lab';
    link.target = '_blank';
    link.rel = 'noopener';
    if (e.kind === 'animal') {
      link.href = animalLabLink([e.species], LAB_TIER, e.species.form.seed, 1, null, location.href);
      link.textContent = 'Open it in the animal lab';
    } else {
      link.href = plantLabLink([e.species], LAB_TIER, e.species.form.seed, null, location.href);
      link.textContent = 'Open it in the plant lab';
    }
    this.detail.replaceChildren(img, head, facts, link);
  }

  private readonly onToggle = (): void => (this.isOpen ? this.hide() : this.open());

  private readonly onClose = (): void => this.hide();

  private readonly onBackdrop = (e: MouseEvent): void => {
    if (e.target === this.root) this.hide();
  };

  private readonly onMenuButton = (): void => this.open();

  private readonly onNoticeOpen = (): void => this.open(this.noticeKey);

  /** R opens it (not from a text field or while the game's menu is open). */
  private readonly onToggleKey = (e: KeyboardEvent): void => {
    if (e.code !== TOGGLE_KEY || e.repeat || e.ctrlKey || e.altKey || e.metaKey || this.isOpen || this.menuOpen()) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    e.preventDefault();
    this.open();
  };

  /** Keys pressed while it's open stay here (their releases go on, so the game sees keys let go): Esc and R close it. */
  private readonly onKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.code === 'Escape' || (e.code === TOGGLE_KEY && !e.repeat)) {
      e.preventDefault();
      this.hide();
    }
  };
}

function span(className: string, text: string): HTMLElement {
  const s = document.createElement('span');
  s.className = className;
  s.textContent = text;
  return s;
}

function heading(text: string): HTMLElement {
  const h = document.createElement('h3');
  h.className = 'repository-name';
  h.textContent = text;
  return h;
}

function paragraph(text: string, className: string): HTMLElement {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}
