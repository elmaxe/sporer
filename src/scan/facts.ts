import type { Architecture } from '../gen/plantForm';
import { PLANT_KINDS } from '../gen/plants';
import type { CoatPattern } from '../gen/animalForm';
import type { RepositoryEntry } from './repository';

/*
 * What the repository menu (ui/RepositoryDialog.ts) says about a species:
 * its line under its name and its facts, as plain text. Pure.
 */

/** One row of a species' facts: a label and its value, and colour swatches (hex) to show beside it. */
export interface SpeciesFact {
  readonly label: string;
  readonly value: string;
  readonly colors?: readonly string[];
}

const PLANS = { quadruped: 'Four-legged', hexapod: 'Six-legged', biped: 'Two-legged' } as const;
const SHAPES: Record<Architecture, string> = { conifer: 'Conifer', broadleaf: 'Broadleaf', palm: 'Palm', shrub: 'Shrub' };
const COATS: Record<CoatPattern, string> = { plain: 'Plain', stripes: 'Striped', spots: 'Spotted', patches: 'Patched' };

/** Kelvin → whole degrees Celsius. */
function celsius(k: number): number {
  return Math.round(k - 273.15);
}

/** "−5 to 31 °C". */
export function climateRange(min: number, max: number): string {
  const c = (k: number) => String(celsius(k)).replace('-', '−');
  return `${c(min)} to ${c(max)} °C`;
}

/** The line under a species' name: what it is, in a few words. */
export function entryLine(e: RepositoryEntry): string {
  if (e.kind === 'plant') return `${PLANT_KINDS[e.species.kind].label} · ${e.species.height.toFixed(1)} m tall`;
  const s = e.species;
  return `${PLANS[s.form.plan]} ${s.diet === 'carnivore' ? 'hunter' : 'grazer'} · ${s.length.toFixed(1)} m`;
}

/** Where it was found, for the card: its home, and where it was seen if it had been brought elsewhere. */
export function entryPlace(e: RepositoryEntry): string {
  const home = e.system && e.system !== e.home ? `${e.home}, ${e.system} system` : e.home;
  return e.seenOn ? `${home} (seen on ${e.seenOn})` : home;
}

/** The date and time it was scanned, as the device writes them. */
export function scanDate(time: number, locale?: string): string {
  if (!time) return 'Unknown';
  return new Date(time).toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** A species' facts, in the order the menu lists them. */
export function speciesFacts(e: RepositoryEntry, locale?: string): SpeciesFact[] {
  const facts: SpeciesFact[] = [];
  if (e.kind === 'animal') {
    const s = e.species;
    const f = s.form;
    facts.push({ label: 'Body', value: `${PLANS[f.plan]}, ${s.length.toFixed(1)} m long` });
    facts.push({ label: 'Diet', value: s.diet === 'carnivore' ? 'Carnivore: hunts the grazers' : 'Herbivore: grazes the plants' });
    facts.push({
      label: 'Lives',
      value: s.herdMax <= 1 ? 'Alone' : `In ${s.diet === 'carnivore' ? 'packs' : 'herds'} of ${s.herdMin === s.herdMax ? s.herdMin : `${s.herdMin} to ${s.herdMax}`}`,
    });
    facts.push({ label: 'Climate', value: climateRange(s.minTemperature, s.maxTemperature) });
    facts.push({ label: 'Coat', value: COATS[f.pattern], colors: f.pattern === 'plain' ? [f.color, f.belly] : [f.color, f.belly, f.patternColor] });
  } else {
    const s = e.species;
    facts.push({ label: 'Kind', value: `${PLANT_KINDS[s.kind].label}, grown like a ${SHAPES[s.form.architecture].toLowerCase()}` });
    facts.push({ label: 'Size', value: `${s.height.toFixed(1)} m tall, ${(s.crownRadius * 2).toFixed(1)} m across` });
    facts.push({ label: 'Climate', value: climateRange(s.minTemperature, s.maxTemperature) });
    facts.push({ label: 'Colours', value: 'Bark and leaves', colors: [s.trunkColor, s.leafColor] });
  }
  facts.push({ label: 'Home', value: e.system && e.system !== e.home ? `${e.home}, in the ${e.system} system` : e.home });
  if (e.seenOn) facts.push({ label: 'Seen on', value: `${e.seenOn}, where it was brought` });
  facts.push({ label: 'Scanned', value: scanDate(e.time, locale) });
  return facts;
}
