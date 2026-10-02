import { describe, expect, it } from 'vitest';
import { TREE_CROWN_WIDTH } from '../src/gen/plants';
import {
  DEFAULT_PLANT_VIEW,
  decodePlantLab,
  encodePlantLab,
  generateLabPlants,
  hueOf,
  plantLabLink,
  rerollForm,
  sanitizeSpecies,
  withArchitecture,
  type PlantLabState,
} from '../src/plantlab/labPlants';

describe('plant lab model', () => {
  it('generates a planet-like set and selects by kind or architecture', () => {
    const set = generateLabPlants(4, { tier: 3 });
    expect(set.species).toHaveLength(8);
    expect(set.selected).toBe(0);
    const bush = generateLabPlants(4, { kind: 'smallBush' });
    expect(bush.species[bush.selected]!.kind).toBe('smallBush');
    const palm = generateLabPlants(4, { kind: 'tree', architecture: 'palm' });
    expect(palm.species[palm.selected]!.form.architecture).toBe('palm');
    expect(generateLabPlants(4, { tier: 1 }).species).toHaveLength(3);
  });

  it('round-trips through the #hash, and rejects what is not a link', () => {
    const state: PlantLabState = { ...generateLabPlants(11, { tier: 2 }), view: { ...DEFAULT_PLANT_VIEW, view: 'lineup', lod: 2 }, source: { seed: '1337', star: 5, planet: 1 } };
    state.selected = 3;
    const back = decodePlantLab(encodePlantLab(state));
    expect(back).toEqual(state);
    expect(decodePlantLab('not a link')).toBeNull();
    expect(decodePlantLab(btoa('{"species":[]}'))).toBeNull();
  });

  it('repairs damaged species from a generated one, keeping numbers in range', () => {
    const base = generateLabPlants(2).species[0]!;
    const fixed = sanitizeSpecies({ height: -5, crown: 'star' as never, leafColor: 'green', form: { depth: 9, architecture: 'cactus' as never, tropism: 4 } as never }, base, 0);
    expect(fixed.height).toBe(0.2);
    expect(fixed.crown).toBe(base.crown);
    expect(fixed.leafColor).toBe(base.leafColor);
    expect(fixed.form.depth).toBe(3);
    expect(fixed.form.architecture).toBe(base.form.architecture);
    expect(fixed.form.tropism).toBe(1);
  });

  it('switches architecture with a crown to suit, keeping the colours', () => {
    const tree = generateLabPlants(6, { kind: 'tree' });
    const s = tree.species[tree.selected]!;
    for (const arch of ['conifer', 'broadleaf', 'palm'] as const) {
      const t = withArchitecture(s, arch);
      expect(t.form.architecture).toBe(arch);
      expect(t.form.leafColor2).toBe(s.form.leafColor2);
      const width = (2 * t.crownRadius) / t.height;
      expect(width).toBeGreaterThanOrEqual(TREE_CROWN_WIDTH[arch][0] - 1e-9);
      expect(width).toBeLessThanOrEqual(TREE_CROWN_WIDTH[arch][1] + 1e-9);
      if (arch !== 'conifer') expect(t.crown).toBe('ball');
    }
    expect(rerollForm(s, 1).form.seed).not.toBe(s.form.seed);
    expect(rerollForm(s, 1)).toEqual(rerollForm(s, 1));
    expect(hueOf('#00ff00')).toBeCloseTo(120);
  });

  it('links to the plant lab with a set of species', () => {
    const set = generateLabPlants(8);
    const link = plantLabLink(set.species, 3, 8, null, 'https://example.com/sporer/lab.html');
    expect(link.startsWith('https://example.com/sporer/plants.html#')).toBe(true);
    expect(decodePlantLab(link.split('#')[1]!)!.species).toEqual(set.species);
  });
});
