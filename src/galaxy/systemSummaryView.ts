import { isGiant } from '../gen/planets';
import { describeBodyCount, type BodyMark, type SystemSummary } from './systemSummary';

/**
 * Fills the star tooltip's extra block: the body count, then one row per
 * planet, "◯ T1 Name ∘∘∘", the discs outlined by warmth (red, green, blue)
 * and more strongly the more air the body has, sized by size class, the giants
 * banded and ringed planets with a ring. Styles in style.css (.sys-*).
 */
export function renderSystemSummary(el: HTMLElement, summary: SystemSummary): void {
  const count = document.createElement('div');
  count.className = 'sys-count';
  count.textContent = describeBodyCount(summary);
  el.append(count);
  for (const p of summary.planets) {
    const row = document.createElement('div');
    row.className = 'sys-row';
    const tier = document.createElement('span');
    tier.className = `sys-tier sys-tier-${p.tier}`;
    tier.textContent = `T${p.tier}`;
    const name = document.createElement('span');
    name.className = 'sys-name';
    name.textContent = p.name;
    // A fixed-width slot, so the names line up whatever the disc's size.
    const slot = document.createElement('span');
    slot.className = 'sys-slot';
    const planet = disc(p, `sys-planet sys-size-${p.size}`);
    if (isGiant(p.size)) planet.classList.add('sys-giant');
    if (p.rings) planet.classList.add('sys-ringed');
    slot.append(planet);
    row.append(slot, tier, name);
    if (p.moons.length > 0) {
      const moons = document.createElement('span');
      moons.className = 'sys-moons';
      for (const m of p.moons) moons.append(disc(m, m.big ? 'sys-moon sys-moon-big' : 'sys-moon'));
      row.append(moons);
    }
    el.append(row);
  }
}

function disc(mark: BodyMark, kind: string): HTMLElement {
  const d = document.createElement('span');
  d.className = `sys-disc ${kind} sys-${mark.warmth} sys-air-${mark.air}`;
  return d;
}
