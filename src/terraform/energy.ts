/*
 * The ship's energy (docs/design/terraforming.md, "Energy"): the currency
 * terraforming is paid in, shown as a bar by the item bar. For now it is
 * infinite (decided): costs are worked out, shown and counted, but the bar
 * never drains. The debug panel can make it finite to test running dry.
 * Pure and JSON-able, kept by the SceneManager like the cargo hold.
 */

export interface ShipEnergyData {
  infinite: boolean;
  capacity: number;
  level: number;
  /** Everything ever spent (counted while infinite too). */
  spent: number;
  /** Everything ever given back (mirrors recalled, the shade opened). */
  refunded?: number;
}

/** A full bar when energy is finite (tunable; the finite-energy phase sets it per mode). */
export const ENERGY_CAPACITY = 1000;

export class ShipEnergy {
  infinite = true;
  capacity = ENERGY_CAPACITY;
  level = ENERGY_CAPACITY;
  /** Everything ever spent. */
  spent = 0;
  /** Everything ever given back. */
  refunded = 0;
  /** What's being spent a second right now (a ray held), for the bar's "about to spend" segment; set by whoever spends. */
  draining = 0;

  /** Whether `amount` can be paid now. */
  canAfford(amount: number): boolean {
    return this.infinite || this.level >= amount;
  }

  /** Pays `amount` if it can (always, while infinite); false if there isn't enough. */
  spend(amount: number): boolean {
    if (!(amount > 0)) return true;
    if (!this.canAfford(amount)) return false;
    if (!this.infinite) this.level -= amount;
    this.spent += amount;
    return true;
  }

  /** Gives `amount` back (a mirror recalled, the shade opened): the bar fills up to full at most. */
  refund(amount: number): void {
    if (!(amount > 0)) return;
    if (!this.infinite) this.level = Math.min(this.capacity, this.level + amount);
    this.refunded += amount;
  }

  /** The bar's fill, 0–1 (1 while infinite). */
  get fill(): number {
    return this.infinite ? 1 : Math.max(0, Math.min(1, this.level / this.capacity));
  }

  /** Makes it finite (from a full bar) or infinite again. */
  setInfinite(on: boolean): void {
    this.infinite = on;
    if (!on) this.level = this.capacity;
  }

  toJSON(): ShipEnergyData {
    return { infinite: this.infinite, capacity: this.capacity, level: this.level, spent: this.spent, refunded: this.refunded };
  }

  load(data: Partial<ShipEnergyData>): void {
    if (typeof data.infinite === 'boolean') this.infinite = data.infinite;
    if (typeof data.capacity === 'number') this.capacity = data.capacity;
    if (typeof data.level === 'number') this.level = data.level;
    if (typeof data.spent === 'number') this.spent = data.spent;
    if (typeof data.refunded === 'number') this.refunded = data.refunded;
  }
}

/** An amount of energy as the bar and the slots say it, e.g. "12", "1.4k". */
export function formatEnergy(amount: number): string {
  if (amount >= 9999.5) return `${(amount / 1000).toFixed(0)}k`;
  if (amount >= 999.5) return `${(amount / 1000).toFixed(1)}k`;
  if (amount >= 9.95) return amount.toFixed(0);
  return amount.toFixed(1);
}
