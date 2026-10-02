import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { ITEMS, ITEM_TABS, type ItemDef, type ItemId, type ItemTab, type ItemUser } from '../combat/items';
import type { LevelMode } from '../levels/SceneManager';

/** Slots per tab on a mouse screen (empty ones show there's room for more); touch shows only the filled ones. */
const SLOTS_PER_TAB = 4;
/** Seconds a hint from clicking an unusable slot stays up. */
const NOTE_SECONDS = 2.5;

/** Each item's icon (24×24, drawn in the current colour). */
const ICONS: Record<ItemId, string> = {
  planetBuster:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="6.5" />' +
    '<path d="m12 5.5-1.5 4 2.5 2-2 3.5.8 3.5" />' +
    '<path d="M3 3l2.6 2.6M21 3l-2.6 2.6M3 21l2.6-2.6M21 21l-2.6-2.6M12 1v1.5M12 21.5V23M1 12h1.5M21.5 12H23" /></svg>',
};

/** What the bar needs to know about the game: where the player is, and what can use items there. */
export interface ItemBarSource {
  readonly mode: LevelMode;
  readonly transitioning: boolean;
  /** The level the player can use items in now (low orbit), or null. */
  readonly itemUser: ItemUser | null;
}

/**
 * The item bar (#item-bar in index.html): tabs of item slots at the bottom
 * of the screen, Weapons the only tab for now with the planet buster in it.
 * Click a slot or press its key (1) to select the item and again to put it
 * away; what a selected item does is up to the level (`ItemUser`): in low
 * orbit the planet buster fires at the next click on the planet. Elsewhere
 * the slots show but can't be used, and say where they can. A global
 * entity; hidden on the galaxy map.
 */
export class ItemBar implements Entity {
  private readonly root = document.getElementById('item-bar')!;
  private readonly tabsEl = document.getElementById('item-tabs')!;
  private readonly slotsEl = document.getElementById('item-slots')!;
  private readonly hintEl = document.getElementById('item-hint')!;
  private readonly slots = new Map<ItemId, HTMLButtonElement>();
  private readonly tabs = new Map<ItemTab, HTMLButtonElement>();
  private tab: ItemTab = ITEM_TABS[0]!.id;
  private readonly keyWasDown = new Map<ItemId, boolean>();
  private note = '';
  private noteTime = 0;
  private shownHint: string | null = null;
  private shown: boolean | null = null;

  constructor(
    private readonly source: ItemBarSource,
    private readonly input: Input,
  ) {
    for (const t of ITEM_TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'item-tab';
      button.setAttribute('role', 'tab');
      button.textContent = t.name;
      button.addEventListener('click', () => this.showTab(t.id));
      this.tabsEl.append(button);
      this.tabs.set(t.id, button);
    }
    this.showTab(this.tab);
  }

  update(frameDt: number): void {
    const { mode } = this.source;
    const shown = mode !== 'galaxy';
    if (shown !== this.shown) {
      this.shown = shown;
      this.root.hidden = !shown;
      document.documentElement.classList.toggle('items', shown);
    }
    if (!shown) return;
    const user = this.source.itemUser;
    for (const item of ITEMS) {
      const key = this.input.isDown(item.key);
      if (key && !this.keyWasDown.get(item.id)) this.toggle(item);
      this.keyWasDown.set(item.id, key);
    }

    let hint = '';
    for (const item of ITEMS) {
      const slot = this.slots.get(item.id);
      const status = user ? user.status(item.id) : null;
      const available = status?.available ?? false;
      const selected = user?.selected === item.id;
      if (slot) {
        slot.classList.toggle('unavailable', !available);
        slot.classList.toggle('selected', selected);
        slot.setAttribute('aria-pressed', String(selected));
      }
      if (status?.hint && (selected || !hint)) hint = status.hint;
    }
    if (this.noteTime > 0) {
      this.noteTime -= frameDt;
      hint = this.note;
    }
    if (hint !== this.shownHint) {
      this.shownHint = hint;
      this.hintEl.textContent = hint;
      this.hintEl.hidden = !hint;
    }
  }

  dispose(): void {
    this.root.hidden = true;
    this.tabsEl.replaceChildren();
    this.slotsEl.replaceChildren();
  }

  /** Selects the item, or puts it away if it's selected; says why not if it can't be used here. */
  private toggle(item: ItemDef): void {
    const user = this.source.itemUser;
    if (item.tab !== this.tab) this.showTab(item.tab);
    if (!user) {
      this.say(this.source.transitioning ? '' : `${item.name}: go down to a planet or moon to fire it`);
      return;
    }
    if (user.selected === item.id) {
      user.select(null);
      return;
    }
    const status = user.status(item.id);
    if (!status.available) {
      this.say(status.reason ?? '');
      return;
    }
    user.select(item.id);
  }

  private say(text: string): void {
    this.note = text;
    this.noteTime = text ? NOTE_SECONDS : 0;
  }

  private showTab(tab: ItemTab): void {
    this.tab = tab;
    for (const [id, button] of this.tabs) {
      button.classList.toggle('active', id === tab);
      button.setAttribute('aria-selected', String(id === tab));
    }
    this.slots.clear();
    const items = ITEMS.filter((i) => i.tab === tab);
    const slots: HTMLElement[] = items.map((item) => {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'item-slot';
      slot.dataset.item = item.id;
      slot.title = `${item.name} (${item.keyLabel}): ${item.description}`;
      slot.setAttribute('aria-label', `${item.name} (${item.keyLabel})`);
      slot.setAttribute('aria-pressed', 'false');
      slot.innerHTML = `${ICONS[item.id]}<span class="item-key">${item.keyLabel}</span><span class="item-name">${item.name}</span>`;
      slot.addEventListener('click', () => this.toggle(item));
      this.slots.set(item.id, slot);
      return slot;
    });
    for (let i = items.length; i < SLOTS_PER_TAB; i++) {
      const empty = document.createElement('div');
      empty.className = 'item-slot empty';
      empty.setAttribute('aria-hidden', 'true');
      slots.push(empty);
    }
    this.slotsEl.replaceChildren(...slots);
  }
}
