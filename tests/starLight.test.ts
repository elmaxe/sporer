import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { generateCompanion, generateStar, nominalStar, starLightColor, type SpectralClass } from '../src/gen/stars';
import { Rng } from '../src/gen/rng';

const CLASSES: SpectralClass[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
/** Linear RGB of a class's light. */
const light = (c: SpectralClass) => new THREE.Color(starLightColor({ ...nominalStar('mainSequence', c), spectralClass: c }));

describe('starLightColor (docs/research/star-light.md)', () => {
  it('is near white for a Sun-like G star', () => {
    const g = light('G');
    expect(Math.min(g.r, g.g, g.b)).toBeGreaterThan(0.85);
  });

  it('runs from blue to orange with falling temperature', () => {
    const ratios = CLASSES.map((c) => light(c).b / light(c).r);
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]!).toBeLessThan(ratios[i - 1]!);
    expect(light('O').b).toBeGreaterThan(light('O').r);
    expect(light('M').r).toBeGreaterThan(light('M').b);
  });

  it('is far less saturated than the stars’ own stylised colours: a K star leaves blue blue', () => {
    // A K star's light still holds a good share of blue, so a blue planet doesn't turn orange and black.
    const k = light('K');
    expect(k.b / k.r).toBeGreaterThan(0.3);
    const display = new THREE.Color(nominalStar('mainSequence', 'K').color);
    expect(k.b / k.r).toBeGreaterThan(2 * (display.b / display.r));
  });

  it('covers every star the generators make', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 300; i++) {
      for (const star of [generateStar(rng), generateCompanion(rng)]) expect(starLightColor(star)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
