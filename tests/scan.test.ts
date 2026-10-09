import { describe, expect, it } from 'vitest';
import { SOUND_CUES, cueParams } from '../src/audio/cues';
import { animalKey, speciesKey } from '../src/cargo/inventory';
import { ITEMS, itemDef, slotKey } from '../src/combat/items';
import { planAnimals } from '../src/gen/animals';
import { generateSpecies, type PlantSpecies } from '../src/gen/plants';
import { Rng } from '../src/gen/rng';
import { climateRange, entryLine, entryPlace, speciesFacts } from '../src/scan/facts';
import { SpeciesRepository, type RepositoryData } from '../src/scan/repository';
import { scanParams, scanPercent, stepScan, type ScanState } from '../src/scan/scanRules';

const animals = planAnimals({ seed: 7, tier: 3, temperature: 288, gravity: 1, radius: 400, peak: 420, sea: true })!.species;
const tree: PlantSpecies = generateSpecies(new Rng(42).fork('s', 0), 0, 'tree', 120, 3);
const here = { home: 'Haikrai I', system: 'Haikrai', seenOn: null };

describe('the scanner', () => {
  it("is in the Inventory after the beam and the radar (the beam stays on 1), and its sounds are a loop and a one-shot", () => {
    expect(itemDef('scan').tab).toBe('inventory');
    const inventory = ITEMS.filter((i) => i.tab === 'inventory').map((i) => i.id);
    expect(inventory[0]).toBe('abduct');
    expect(inventory).toContain('scan');
    expect(slotKey(inventory.indexOf('scan'))).not.toBeNull();
    expect(itemDef('scan').switch).toBeFalsy();
    expect(SOUND_CUES).toContain('scanBeam');
    expect(SOUND_CUES).toContain('scanSuccess');
    expect(cueParams.scanBeam.loop).toBe(true);
    expect(cueParams.scanSuccess.loop).toBe(false);
  });

  it('reads a species in scanParams.time held on it, and completes exactly once', () => {
    const s: ScanState = { progress: 0, lost: 0 };
    const dt = 1 / 60;
    let done = 0;
    let t = 0;
    for (; t < scanParams.time * 2; t += dt) if (stepScan(s, dt, true)) done++;
    expect(done).toBe(1);
    expect(s.progress).toBe(1);
    const half: ScanState = { progress: 0, lost: 0 };
    for (let k = 0; k < Math.round(scanParams.time / 2 / dt); k++) stepScan(half, dt, true);
    expect(half.progress).toBeCloseTo(0.5, 1);
  });

  it('keeps its progress a moment off the target, then drains it to nothing', () => {
    const s: ScanState = { progress: 0.6, lost: 0 };
    stepScan(s, scanParams.grace * 0.9, false);
    expect(s.progress).toBe(0.6);
    for (let k = 0; k < 600; k++) stepScan(s, 1 / 60, false);
    expect(s.progress).toBe(0);
    // Back on it: it fills again and the time off is forgotten.
    stepScan(s, 0.1, true);
    expect(s.lost).toBe(0);
    expect(s.progress).toBeGreaterThan(0);
  });

  it('never says 100% before it is done', () => {
    expect(scanPercent(0)).toBe(0);
    expect(scanPercent(0.999)).toBe(99);
    expect(scanPercent(1)).toBe(100);
  });
});

describe('the species repository', () => {
  it('takes each species once, numbered in the order they were found, and tells whoever saves it', () => {
    let saved = 0;
    const r = new SpeciesRepository(() => saved++);
    const a = r.add(animalKey('Haikrai I:5', 0), { kind: 'animal', species: animals[0]! }, here, 1000);
    expect(a.added).toBe(true);
    expect(a.entry.number).toBe(1);
    const p = r.add(speciesKey('Haikrai I:5', 0), { kind: 'plant', species: tree }, here, 2000);
    expect(p.entry.number).toBe(2);
    // Scanned again (another of its kind, anywhere): the entry it has.
    const again = r.add(animalKey('Haikrai I:5', 0), { kind: 'animal', species: animals[0]! }, { ...here, seenOn: 'Elsewhere' }, 3000);
    expect(again.added).toBe(false);
    expect(again.entry).toBe(a.entry);
    expect(r.size).toBe(2);
    expect(r.count('animal')).toBe(1);
    expect(r.count('plant')).toBe(1);
    expect(saved).toBe(2);
    // An animal's key and a plant's of the same index never clash.
    expect(r.has(animalKey('Haikrai I:5', 0))).toBe(true);
    expect(r.has(speciesKey('Haikrai I:5', 0))).toBe(true);
    expect(r.has(speciesKey('Haikrai I:5', 1))).toBe(false);
  });

  it('survives JSON, and a load skips what it cannot read without saving', () => {
    let saved = 0;
    const r = new SpeciesRepository(() => saved++);
    r.add('a', { kind: 'animal', species: animals[1]! }, here, 5);
    r.add('p', { kind: 'plant', species: tree }, { home: 'Moon', system: null, seenOn: 'Haikrai I' }, 6);
    const data = JSON.parse(JSON.stringify(r.toJSON())) as RepositoryData;
    const copy = new SpeciesRepository(() => saved++);
    const before = saved;
    copy.load({ entries: [...data.entries, { ...data.entries[0]! }, { key: 'x' } as never, null as never] });
    expect(saved).toBe(before);
    expect(copy.size).toBe(2);
    expect(copy.entry('a')!.species.name).toBe(animals[1]!.name);
    expect(copy.entry('p')).toMatchObject({ kind: 'plant', home: 'Moon', system: null, seenOn: 'Haikrai I', number: 2, time: 6 });
    copy.load(null);
    expect(copy.size).toBe(0);
  });

  it("describes what it holds: a line, where it lives and its facts", () => {
    const r = new SpeciesRepository();
    const a = r.add('a', { kind: 'animal', species: animals[0]! }, here, Date.UTC(2026, 9, 8, 18, 0)).entry;
    const p = r.add('p', { kind: 'plant', species: tree }, { home: 'Moon', system: null, seenOn: 'Haikrai I' }, 0).entry;
    expect(entryLine(a)).toMatch(/legged (grazer|hunter) · \d+\.\d m$/);
    expect(entryLine(p)).toMatch(/^Tree · \d+\.\d m tall$/);
    expect(entryPlace(a)).toBe('Haikrai I, Haikrai system');
    expect(entryPlace(p)).toBe('Moon (seen on Haikrai I)');
    const af = speciesFacts(a, 'en-GB').map((f) => f.label);
    expect(af).toEqual(['Body', 'Diet', 'Lives', 'Climate', 'Coat', 'Home', 'Scanned']);
    const pf = speciesFacts(p);
    expect(pf.map((f) => f.label)).toEqual(['Kind', 'Size', 'Climate', 'Colours', 'Home', 'Seen on', 'Scanned']);
    expect(pf.find((f) => f.label === 'Colours')!.colors).toEqual([tree.trunkColor, tree.leafColor]);
    expect(pf.find((f) => f.label === 'Scanned')!.value).toBe('Unknown');
    expect(climateRange(253.15, 304.15)).toBe('−20 to 31 °C');
  });
});
