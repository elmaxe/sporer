/*
 * The items the ship carries, grouped into the item bar's tabs (ui/ItemBar.ts).
 * Pure data; what an item does lives with the level that can use it (in low
 * orbit: the planet buster, combat/PlanetBuster.ts; the volcano bomb,
 * combat/VolcanoBomb.ts; the abduction beam and the cargo it brings up:
 * cargo/CargoBeam.ts).
 */

export type ItemTab = 'weapons' | 'inventory';
/** The tools: always in their tab's first slots. */
export type ToolId = 'planetBuster' | 'volcanoBomb' | 'abduct';
/** What a slot holds: a tool, or a stack of cargo in the hold (`cargo:` and the stack's key, see cargo/inventory.ts). */
export type ItemId = ToolId | `cargo:${string}`;

export const CARGO_PREFIX = 'cargo:';

/** The item id of the cargo stack `key`. */
export function cargoItem(key: string): ItemId {
  return `${CARGO_PREFIX}${key}`;
}

/** The stack key of a cargo item, or null for a tool. */
export function cargoKey(item: ItemId): string | null {
  return item.startsWith(CARGO_PREFIX) ? item.slice(CARGO_PREFIX.length) : null;
}

export interface ItemDef {
  id: ToolId;
  tab: ItemTab;
  name: string;
  /** One line for its tooltip. */
  description: string;
}

export const ITEM_TABS: readonly { id: ItemTab; name: string }[] = [
  { id: 'weapons', name: 'Weapons' },
  { id: 'inventory', name: 'Inventory' },
];

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'planetBuster',
    tab: 'weapons',
    name: 'Planet Buster',
    description: 'Blows a whole planet or moon apart, for good. Fire it from low orbit.',
  },
  {
    id: 'volcanoBomb',
    tab: 'weapons',
    name: 'Volcano Bomb',
    description: 'Raises an erupting volcano where it lands. Fire it from low orbit over solid ground.',
  },
  {
    id: 'abduct',
    tab: 'inventory',
    name: 'Abduction Beam',
    description: 'Beams plants up into the hold. Hold it on one; let go and it falls.',
  },
];

/** The key that selects the item in slot `index` (0-based) of the tab on show, and how the bar labels it. */
export function slotKey(index: number): { code: string; label: string } | null {
  return index < 9 ? { code: `Digit${index + 1}`, label: String(index + 1) } : null;
}

/** Whether an item can be used right now, a line to show about it (how to use it, what it's doing; '' for none), and why not. */
export interface ItemStatus {
  available: boolean;
  hint: string;
  /** Said when the player tries an unavailable item. */
  reason?: string;
}

/** Something the item bar can select items for: the level the player is in. */
export interface ItemUser {
  status(item: ItemId): ItemStatus;
  /** The selected (armed) item, if any. */
  readonly selected: ItemId | null;
  /** Selects an item (an unavailable one is ignored), or deselects with null. */
  select(item: ItemId | null): void;
}
