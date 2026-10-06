/*
 * The items the ship carries, grouped into the item bar's tabs (ui/ItemBar.ts).
 * Pure data; what an item does lives with the level that can use it (in low
 * orbit: the planet buster, combat/PlanetBuster.ts; the volcano bomb,
 * combat/VolcanoBomb.ts; the laser, combat/Laser.ts; the abduction beam and the cargo it brings up:
 * cargo/CargoBeam.ts; the radar, radar/Radar.ts; the magic terraforming
 * rays, terraform/MagicRay.ts; the heat-and-light terraforming tools,
 * terraform/LightTools.ts).
 */

export type ItemTab = 'weapons' | 'inventory' | 'terraform';
/** The magic terraforming rays (terraform/rays.ts RayId). */
export type RayToolId = 'heatRay' | 'coolRay' | 'airRay' | 'vacuumRay' | 'waterRay';
/** The heat-and-light terraforming tools (terraform/light.ts LightToolId). */
export type LightToolId = 'mirror' | 'lance' | 'sunshade' | 'aerosol';
/** The tools: always in their tab's first slots. */
export type ToolId = 'planetBuster' | 'volcanoBomb' | 'laser' | 'abduct' | 'radar' | RayToolId | LightToolId;
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
  /**
   * A switch: clicking it (or its key) turns it on or off, and it stays so,
   * whatever is selected, from level to level (`ItemSwitches`). Other items
   * are selected (armed) and put away.
   */
  switch?: boolean;
  /** A switch that's on when the game starts. */
  startsOn?: boolean;
}

export const ITEM_TABS: readonly { id: ItemTab; name: string }[] = [
  { id: 'weapons', name: 'Weapons' },
  { id: 'inventory', name: 'Inventory' },
  { id: 'terraform', name: 'Terraform' },
];

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'laser',
    tab: 'weapons',
    name: 'Laser',
    description: 'A beam from the ship that kills the animals and plants it touches. Hold it on them.',
  },
  {
    id: 'volcanoBomb',
    tab: 'weapons',
    name: 'Volcano Bomb',
    description: 'Raises an erupting volcano where it lands. Fire it from low orbit over solid ground.',
  },
  {
    id: 'planetBuster',
    tab: 'weapons',
    name: 'Planet Buster',
    description: 'Blows a whole planet or moon apart, for good. Fire it from low orbit.',
  },
  {
    id: 'abduct',
    tab: 'inventory',
    name: 'Abduction Beam',
    description: 'Beams animals and plants up into the hold. Hold it on them; let go and they fall.',
  },
  {
    id: 'radar',
    tab: 'inventory',
    name: 'Radar',
    description: "Tracks the animal picked on the planet map's Species tab: its waves point to the nearest one. On or off.",
    switch: true,
    startsOn: true,
  },
  {
    id: 'heatRay',
    tab: 'terraform',
    name: 'Heat Ray',
    description: 'A magic ray that pours heat into the world while held: it warms as fast as its oceans and air let it.',
  },
  {
    id: 'coolRay',
    tab: 'terraform',
    name: 'Cool Ray',
    description: 'A magic ray that draws heat out of the world while held.',
  },
  {
    id: 'airRay',
    tab: 'terraform',
    name: 'Air Ray',
    description: 'A magic ray that pours gas into the air while held (pick the gas on the climate chart, or G).',
  },
  {
    id: 'vacuumRay',
    tab: 'terraform',
    name: 'Vacuum Ray',
    description: 'A magic ray that sucks a gas out of the air while held (pick the gas on the climate chart, or G).',
  },
  {
    id: 'waterRay',
    tab: 'terraform',
    name: 'Water Ray',
    description: 'A magic ray that rains water onto the world while held, or (on the climate chart, or G) boils it away.',
  },
  {
    id: 'mirror',
    tab: 'terraform',
    name: 'Orbital Mirror',
    description: 'Deploys a mirror that stays over the world, adding a quarter of its starlight; recall it to take it back (G, or the climate chart).',
  },
  {
    id: 'lance',
    tab: 'terraform',
    name: 'Mirror Lance',
    description: "Focuses the orbital mirrors' light on a spot while held: it burns what lives there, but doesn't warm the world.",
  },
  {
    id: 'sunshade',
    tab: 'terraform',
    name: 'Sunshade',
    description: 'A slatted shade between the star and the world: each click closes it a step, blocking more light (G, or the chart, opens it).',
  },
  {
    id: 'aerosol',
    tab: 'terraform',
    name: 'Aerosol Spray',
    description: 'Sprays a reflective haze into the air while held: it cools the world fast, then rains out. Needs air to hold it up.',
  },
];

/** The magic rays' item ids. */
export const RAY_TOOLS: readonly RayToolId[] = ['heatRay', 'coolRay', 'airRay', 'vacuumRay', 'waterRay'];

export function isRayTool(id: ItemId): id is RayToolId {
  return (RAY_TOOLS as readonly string[]).includes(id);
}

/** The heat-and-light tools' item ids. */
export const LIGHT_TOOL_ITEMS: readonly LightToolId[] = ['mirror', 'lance', 'sunshade', 'aerosol'];

export function isLightTool(id: ItemId): id is LightToolId {
  return (LIGHT_TOOL_ITEMS as readonly string[]).includes(id);
}

/** The item `id`'s definition. */
export function itemDef(id: ToolId): ItemDef {
  return ITEMS.find((i) => i.id === id)!;
}

/** Which switch items (`ItemDef.switch`) are on, for the whole game (kept by the SceneManager). They start as `ItemDef.startsOn` says. */
export class ItemSwitches {
  private readonly on = new Set<ToolId>(ITEMS.filter((i) => i.switch && i.startsOn).map((i) => i.id));

  isOn(id: ToolId): boolean {
    return this.on.has(id);
  }

  set(id: ToolId, on: boolean): void {
    if (on) this.on.add(id);
    else this.on.delete(id);
  }

  /** Turns it the other way; returns whether it's on now. */
  flip(id: ToolId): boolean {
    this.set(id, !this.isOn(id));
    return this.isOn(id);
  }
}

/** The key that selects the item in slot `index` (0-based) of the tab on show, and how the bar labels it. */
export function slotKey(index: number): { code: string; label: string } | null {
  return index < 9 ? { code: `Digit${index + 1}`, label: String(index + 1) } : null;
}

/** Whether an item can be used right now, a line to show about it (how to use it, what it's doing; '' for none), and why not. */
export interface ItemStatus {
  available: boolean;
  hint: string;
  /** What it costs, as its slot shows it (e.g. "8/s"), if anything. */
  cost?: string;
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
