import type { Entity } from "../core/Entity";
import type { Input } from "../core/Input";
import type { Inventory } from "../cargo/inventory";
import { CARGO_STACKS, STACK_SIZE } from "../cargo/inventory";
import {
  ITEMS,
  ITEM_TABS,
  cargoItem,
  slotKey,
  type ItemId,
  type ItemSwitches,
  type ItemTab,
  type ItemUser,
  type ToolId,
} from "../combat/items";
import { PLANT_KINDS } from "../gen/plants";
import { describeAnimal, type SpeciesIcons } from "../planet/SpeciesTab";
import { formatEnergy, type ShipEnergy } from "../terraform/energy";
import type { LevelMode } from "../levels/SceneManager";
import type { Tooltip } from "./Tooltip";

/** Slots per tab on a mouse screen (the Inventory's tools and the hold's stacks; empty ones show there's room for more); touch shows only the filled ones. */
const SLOTS_PER_TAB =
  ITEMS.filter((i) => i.tab === "inventory").length + CARGO_STACKS;
/** Seconds a hint from clicking an unusable slot stays up. */
const NOTE_SECONDS = 2.5;

/** Each tool's icon (24×24, drawn in the current colour). */
const ICONS: Record<ToolId, string> = {
  planetBuster:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="6.5" />' +
    '<path d="m12 5.5-1.5 4 2.5 2-2 3.5.8 3.5" />' +
    '<path d="M3 3l2.6 2.6M21 3l-2.6 2.6M3 21l2.6-2.6M21 21l-2.6-2.6M12 1v1.5M12 21.5V23M1 12h1.5M21.5 12H23" /></svg>',
  volcanoBomb:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 21h20l-7-10.5h-6z" />' +
    '<path d="M9.5 10.5l1.2 3 1.3-1.6 1.3 1.6 1.2-3" />' +
    '<path d="M10 7.5c-1-1.2-.4-2.8 1-3 .3-1.6 2.6-1.8 3.2-.4 1.4-.2 2.2 1.4 1.3 2.5" /></svg>',
  laser:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 5.5c0-1.2 3.1-2 7-2s7 .8 7 2-3.1 2-7 2-7-.8-7-2z" />' +
    '<path d="M10 7.5 17.5 18" stroke-width="2.2" />' +
    '<path d="M17.5 18l3.5-1M17.5 18l1.5 3.5M17.5 18l-3 2.5M17.5 18l.5-3.8" /></svg>',
  abduct:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 6.5c0-1.4 3.6-2.5 8-2.5s8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5z" />' +
    '<path d="M8.5 4.6C9 3.1 10.4 2 12 2s3 1.1 3.5 2.6" />' +
    '<path d="M9 9.2 5 21M15 9.2l4 11.8" stroke-dasharray="1.5 2" />' +
    '<path d="M12 21v-3.5M12 17.5l-2.2-.4 1.2-2.1-1.1-.2L12 12l2.1 2.8-1.1.2 1.2 2.1z" /></svg>',
  radar:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3.5 9.5a8 8 0 0 0 11 11z" />' +
    '<path d="M9 15l4-4" /><circle cx="13.6" cy="10.4" r="1" />' +
    '<path d="M15.5 6a4 4 0 0 1 2.5 2.5M16.5 2.5a8 8 0 0 1 5 5" />' +
    '<path d="M7 18.5 5 22h7" /></svg>',
  heatRay:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 2v5" /><path d="M12 21c-3.3 0-5.5-2.3-5.5-5.2 0-2.6 2-4.2 3.2-6 .6 1.4 1.4 2.2 2.3 2.6.2-1.6.9-3 2.1-4.1.5 2.8 3.4 4.3 3.4 7.5 0 2.9-2.2 5.2-5.5 5.2z" />' +
    '<path d="M12 21c-1.4 0-2.4-1-2.4-2.3 0-1.4 1.3-2.2 2.4-3.6 1.1 1.4 2.4 2.2 2.4 3.6 0 1.3-1 2.3-2.4 2.3z" /></svg>',
  coolRay:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" />' +
    '<path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5M4 10.4l3.4-.9-.9-3.4M20 13.6l-3.4.9.9 3.4M4 13.6l3.4.9-.9 3.4M20 10.4l-3.4-.9.9-3.4" /></svg>',
  airRay:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 8h11a3 3 0 1 0-3-3" /><path d="M3 12h16a3 3 0 1 1-3 3" /><path d="M3 16h7a2.5 2.5 0 1 1-2.5 2.5" /></svg>',
  vacuumRay:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 4h18l-6.5 8v6l-5 3v-9z" /><path d="M12 11V6.5M9.8 8.7 12 6.5l2.2 2.2" /></svg>',
  waterRay:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 2.5c3.6 4.6 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.4-6.4 6-11z" /><path d="M9 14.5a3 3 0 0 0 3 3" /></svg>',
};

/** What the bar needs to know about the game: where the player is, what can use items there, and what's in the hold. */
export interface ItemBarSource {
  readonly mode: LevelMode;
  readonly transitioning: boolean;
  /** The level the player can use items in now (low orbit), or null. */
  readonly itemUser: ItemUser | null;
  readonly inventory: Inventory;
  /** Which switch items (the radar) are on: they can be turned on or off anywhere. */
  readonly switches: ItemSwitches;
  /** The ship's energy, which the terraforming tools are paid with (the bar above the slots). */
  readonly energy: ShipEnergy;
}

/** What a slot shows: a tool, or a stack of cargo. */
interface SlotItem {
  id: ItemId;
  name: string;
  description: string;
  /** Markup for the icon. */
  icon: string;
  /** A cargo stack's count. */
  count: number | null;
  /** A switch (`ItemDef.switch`): turned on or off, not selected. */
  switch: boolean;
}

/**
 * The item bar (#item-bar in index.html): tabs of item slots at the bottom
 * of the screen. Weapons (red) holds the laser, the volcano bomb and the
 * planet buster; Inventory (grey) the abduction beam, the radar and, after them, the
 * cargo hold's stacks, an animal's or a plant's picture and count each (cargo/inventory.ts). The bar
 * takes the colour of the tab on show, its tooltips too. Click a slot or
 * press its number (the tab on show's slots are 1, 2, …) to select the item
 * and again to put it away; a switch (the radar) is turned on or off
 * instead, anywhere, and keeps its light on while it's on; Tab switches tabs. What a selected item does is
 * up to the level (`ItemUser`): in low orbit the planet buster and the
 * volcano bomb fire at the next click on the planet, the laser fires while
 * the pointer is held, the beam lifts the animals and plants held under the
 * pointer, and a stack sets one of them down
 * where the pointer is held. Elsewhere the slots show but can't be used, and
 * say where they can. A global entity; hidden on the galaxy map.
 */
export class ItemBar implements Entity {
  private readonly root = document.getElementById("item-bar")!;
  private readonly tabsEl = document.getElementById("item-tabs")!;
  private readonly slotsEl = document.getElementById("item-slots")!;
  private readonly hintEl = document.getElementById("item-hint")!;
  /** The energy bar (made here, above the tabs). */
  private readonly energyEl = document.createElement("div");
  private readonly energyFill = document.createElement("div");
  private readonly energyDrain = document.createElement("div");
  private readonly energyText = document.createElement("span");
  private shownEnergy = "";
  private readonly slots = new Map<ItemId, HTMLButtonElement>();
  private readonly tabs = new Map<ItemTab, HTMLButtonElement>();
  private tab: ItemTab = ITEM_TABS[0]!.id;
  /** The tab on show's items, in slot order. */
  private items: SlotItem[] = [];
  private readonly keyWasDown = new Map<string, boolean>();
  private note = "";
  private noteTime = 0;
  private shownHint: string | null = null;
  private shown: boolean | null = null;
  /** The hold's version the inventory slots were drawn from. */
  private inventoryVersion = -1;
  /** The slot the mouse is over, and where: its tooltip follows the pointer. */
  private hovered: { item: SlotItem; x: number; y: number } | null = null;

  constructor(
    private readonly source: ItemBarSource,
    private readonly input: Input,
    /** The game's own hover tooltip (as for planets and stars), shown over a slot. */
    private readonly tooltip: Tooltip,
    /** Pictures of the hold's species. */
    private readonly icons: SpeciesIcons,
  ) {
    for (const t of ITEM_TABS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "item-tab";
      button.dataset.tab = t.id;
      button.setAttribute("role", "tab");
      button.textContent = t.name;
      button.title = `${t.name} (Tab switches)`;
      button.addEventListener("click", () => this.showTab(t.id));
      this.tabsEl.append(button);
      this.tabs.set(t.id, button);
    }
    this.energyEl.id = "item-energy";
    this.energyEl.title = "The ship's energy: what the terraforming tools cost";
    this.energyFill.className = "energy-fill";
    this.energyDrain.className = "energy-drain";
    this.energyText.className = "energy-text";
    this.energyEl.append(this.energyFill, this.energyDrain, this.energyText);
    this.hintEl.after(this.energyEl);
    window.addEventListener("keydown", this.onKeyDown);
    this.showTab(this.tab);
  }

  /** The tab on show (for tests). */
  get currentTab(): ItemTab {
    return this.tab;
  }

  update(frameDt: number): void {
    const { mode, inventory } = this.source;
    const shown = mode !== "galaxy";
    if (shown !== this.shown) {
      this.shown = shown;
      this.root.hidden = !shown;
      document.documentElement.classList.toggle("items", shown);
      if (!shown) this.unhover();
    }
    if (!shown) return;
    if (this.tab === "inventory" && inventory.version !== this.inventoryVersion)
      this.showTab(this.tab);
    const user = this.source.itemUser;
    this.items.forEach((item, i) => {
      const key = slotKey(i);
      if (!key) return;
      const down = this.input.isDown(key.code);
      if (down && !this.keyWasDown.get(key.code)) this.toggle(item);
      this.keyWasDown.set(key.code, down);
    });

    // Every tool's status (whichever tab shows), and the cargo stacks' on show; the selected item's hint wins.
    let hint = "";
    let seenSelected = false;
    const look = (id: ItemId, isSwitch = false): void => {
      const status = user ? user.status(id) : null;
      const selected = user?.selected === id;
      seenSelected ||= selected;
      const slot = this.slots.get(id);
      if (slot) {
        // A switch works anywhere: never greyed out, lit while on.
        const on = isSwitch && this.source.switches.isOn(id as ToolId);
        slot.classList.toggle(
          "unavailable",
          !isSwitch && !(status?.available ?? false),
        );
        slot.classList.toggle("selected", selected);
        slot.classList.toggle("on", on);
        slot.setAttribute("aria-pressed", String(selected || on));
        const cost = slot.querySelector<HTMLElement>(".item-cost");
        if (cost) {
          const text = status?.cost ?? "";
          if (cost.textContent !== text) cost.textContent = text;
          cost.hidden = !text;
        }
      }
      if (status?.hint && (selected || !hint)) hint = status.hint;
    };
    for (const item of ITEMS) look(item.id, item.switch);
    for (const item of this.items) if (item.count !== null) look(item.id);
    // A selected cargo stack's hint even when its tab isn't on show.
    const selected = user?.selected;
    if (selected && !seenSelected) hint = user!.status(selected).hint || hint;
    if (this.noteTime > 0) {
      this.noteTime -= frameDt;
      hint = this.note;
    }
    if (hint !== this.shownHint) {
      this.shownHint = hint;
      this.hintEl.textContent = hint;
      this.hintEl.hidden = !hint;
    }
    this.showEnergy();
    this.showTooltip();
  }

  /** The energy bar: full with an ∞ while energy is infinite; what a held tool spends a second shows as a lighter end. */
  private showEnergy(): void {
    const e = this.source.energy;
    const drain = e.draining > 0 ? ` −${formatEnergy(e.draining)}/s` : "";
    const text = `${e.infinite ? "∞" : formatEnergy(e.level)} energy${drain}`;
    const fill = e.fill;
    const key = `${text}:${fill.toFixed(3)}:${this.tab}`;
    if (key === this.shownEnergy) return;
    this.shownEnergy = key;
    this.energyText.textContent = text;
    this.energyFill.style.width = `${(fill * 100).toFixed(1)}%`;
    const about = e.infinite || e.draining <= 0 ? 0 : Math.min(fill, e.draining / e.capacity);
    this.energyDrain.style.width = `${(about * 100).toFixed(1)}%`;
    this.energyDrain.style.left = `${((fill - about) * 100).toFixed(1)}%`;
    this.energyDrain.hidden = !(e.draining > 0);
    // Shown where it's spent: on the Terraform tab, or while something draws on it.
    this.energyEl.hidden = this.tab !== "terraform" && e.draining <= 0;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    this.unhover();
    this.root.hidden = true;
    this.energyEl.remove();
    this.tabsEl.replaceChildren();
    this.slotsEl.replaceChildren();
  }

  /** Tab switches tabs (while the bar shows, and focus isn't in a field or the menu). */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== "Tab" || !this.shown || e.ctrlKey || e.altKey || e.metaKey)
      return;
    const t = e.target;
    if (
      t instanceof HTMLElement &&
      t !== document.body &&
      !(t instanceof HTMLCanvasElement) &&
      !this.root.contains(t)
    )
      return;
    e.preventDefault();
    const i = ITEM_TABS.findIndex((x) => x.id === this.tab);
    this.showTab(
      ITEM_TABS[
        (i + (e.shiftKey ? ITEM_TABS.length - 1 : 1)) % ITEM_TABS.length
      ]!.id,
    );
  };

  /** Selects the item, or puts it away if it's selected; says why not if it can't be used here. A switch is turned on or off. */
  private toggle(item: SlotItem): void {
    const user = this.source.itemUser;
    if (item.switch) {
      const on = this.source.switches.flip(item.id as ToolId);
      this.say(
        `${item.name} ${on ? "on" : "off"}${on && !user ? ": it works in low orbit" : ""}`,
      );
      return;
    }
    if (!user) {
      this.say(
        this.source.transitioning
          ? ""
          : `${item.name}: go down to a planet or moon to use it`,
      );
      return;
    }
    if (user.selected === item.id) {
      user.select(null);
      return;
    }
    const status = user.status(item.id);
    if (!status.available) {
      this.say(status.reason ?? "");
      return;
    }
    user.select(item.id);
  }

  /**
   * The hovered slot's tooltip, like a planet's (in the tab's colour): the
   * item's name, what it does, and what it can do here and now (its key, or
   * why it can't be used). Refreshed every frame, as the status changes.
   */
  private showTooltip(): void {
    const h = this.hovered;
    if (!h) return;
    const { item } = h;
    const user = this.source.itemUser;
    const status = user?.status(item.id) ?? null;
    const index = this.items.indexOf(item);
    const keyLabel = slotKey(index)?.label;
    const press = keyLabel ? `${keyLabel} or click` : "Click";
    let details: string;
    if (item.switch) {
      const on = this.source.switches.isOn(item.id as ToolId);
      details = `${on ? "On" : "Off"}${status?.hint ? ` · ${status.hint}` : ""} · ${press} to turn it ${on ? "off" : "on"}`;
    } else if (!user) details = "Go down to a planet or moon to use it";
    else if (user.selected === item.id)
      details = `${status?.hint || "Selected"} · ${press} to put it away`;
    else if (status && !status.available)
      details = status.reason ?? status.hint;
    else details = `${press} to select`;
    const cost = status?.cost ? ` · costs ${status.cost} energy` : "";
    if (cost) details += cost;
    const info =
      item.count !== null
        ? `${item.description} (${item.count} of ${STACK_SIZE})`
        : item.description;
    // Centred above the pointer, clear of the bar. The text is rewritten only when the subject changes: make the status part of it.
    this.tooltip.showClaimed(
      this.tab,
      `item:${item.id}:${item.count}:${details}`,
      item.name,
      info,
      h.x,
      h.y,
      details,
      true,
    );
  }

  private unhover(): void {
    if (!this.hovered) return;
    this.hovered = null;
    this.tooltip.release();
  }

  private say(text: string): void {
    this.note = text;
    this.noteTime = text ? NOTE_SECONDS : 0;
  }

  /** The items of tab `tab`, in slot order: its tools, then (Inventory) the hold's stacks. */
  private itemsOf(tab: ItemTab): SlotItem[] {
    const tools: SlotItem[] = ITEMS.filter((i) => i.tab === tab).map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      icon: ICONS[i.id],
      count: null,
      switch: !!i.switch,
    }));
    if (tab !== "inventory") return tools;
    const { inventory } = this.source;
    this.inventoryVersion = inventory.version;
    const cargo = inventory.stacks.map((s) => ({
      id: cargoItem(s.key),
      name: s.species.name,
      description:
        s.kind === "animal"
          ? `${describeAnimal(s.species)}, from ${s.origin}: set it down with the beam`
          : `${PLANT_KINDS[s.species.kind].label} from ${s.origin}: set it down with the beam`,
      icon: `<img class="item-picture" src="${s.kind === "animal" ? this.icons.animals.url(s.key, s.species) : this.icons.plants.url(s.key, s.species)}" alt="" draggable="false">`,
      count: s.count,
      switch: false,
    }));
    return tools.concat(cargo);
  }

  private showTab(tab: ItemTab): void {
    this.tab = tab;
    this.root.dataset.tab = tab;
    for (const [id, button] of this.tabs) {
      button.classList.toggle("active", id === tab);
      button.setAttribute("aria-selected", String(id === tab));
    }
    this.slots.clear();
    this.unhover();
    this.items = this.itemsOf(tab);
    const slots: HTMLElement[] = this.items.map((item, index) => {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = item.switch ? "item-slot switch" : "item-slot";
      slot.dataset.item = item.id;
      const key = slotKey(index);
      slot.setAttribute(
        "aria-label",
        key ? `${item.name} (${key.label})` : item.name,
      );
      slot.setAttribute("aria-pressed", "false");
      const count =
        item.count !== null
          ? `<span class="item-count">${item.count}</span>`
          : "";
      const cost = tab === "terraform" ? '<span class="item-cost" hidden></span>' : "";
      slot.innerHTML = `${item.icon}${key ? `<span class="item-key">${key.label}</span>` : ""}${count}${cost}<span class="item-name">${item.name}</span>`;
      slot.addEventListener("click", () => this.toggle(item));
      // Mouse only: on touch the hint line above the bar says what to do.
      const hover = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        this.hovered = { item, x: e.clientX, y: e.clientY };
        this.showTooltip();
      };
      slot.addEventListener("pointerenter", hover);
      slot.addEventListener("pointermove", hover);
      slot.addEventListener("pointerleave", () => this.unhover());
      this.slots.set(item.id, slot);
      return slot;
    });
    for (let i = this.items.length; i < SLOTS_PER_TAB; i++) {
      const empty = document.createElement("div");
      empty.className = "item-slot empty";
      empty.setAttribute("aria-hidden", "true");
      slots.push(empty);
    }
    this.slotsEl.replaceChildren(...slots);
  }
}
