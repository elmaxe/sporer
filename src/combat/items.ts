/*
 * The items the ship carries, grouped into the item bar's tabs (ui/ItemBar.ts).
 * Pure data; what an item does lives with the level that can use it (the
 * planet buster: combat/PlanetBuster.ts in low orbit).
 */

export type ItemTab = 'weapons';
export type ItemId = 'planetBuster';

export interface ItemDef {
  id: ItemId;
  tab: ItemTab;
  name: string;
  /** One line for its tooltip. */
  description: string;
  /** The key that selects it (KeyboardEvent.code) and how the bar labels it. */
  key: string;
  keyLabel: string;
}

export const ITEM_TABS: readonly { id: ItemTab; name: string }[] = [{ id: 'weapons', name: 'Weapons' }];

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'planetBuster',
    tab: 'weapons',
    name: 'Planet Buster',
    description: 'Blows a whole planet or moon apart, for good. Fire it from low orbit.',
    key: 'Digit1',
    keyLabel: '1',
  },
];

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
