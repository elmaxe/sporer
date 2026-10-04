import { describe, expect, it } from 'vitest';
import { burnAt, laserParams, laserWidth, type Burn } from '../src/combat/laserRules';
import { ITEMS, itemDef } from '../src/combat/items';
import { SOUND_CUES, cueParams } from '../src/audio/cues';

describe('the laser', () => {
  it('is a weapon, and its sounds are a loop and a one-shot', () => {
    expect(itemDef('laser').tab).toBe('weapons');
    expect(ITEMS.filter((i) => i.tab === 'weapons').map((i) => i.id)).toContain('laser');
    expect(SOUND_CUES).toContain('laserBeam');
    expect(SOUND_CUES).toContain('laserHit');
    expect(cueParams.laserBeam.loop).toBe(true);
    expect(cueParams.laserHit.loop).toBe(false);
  });

  it('is never thinner than its share of the view, nor than its own width up close', () => {
    expect(laserWidth(0)).toBe(laserParams.width);
    expect(laserWidth(10)).toBe(laserParams.width);
    const far = 1000;
    expect(laserWidth(far)).toBeCloseTo(far * laserParams.minAngle);
    for (let d = 1; d < 2000; d *= 2) expect(laserWidth(d * 2)).toBeGreaterThanOrEqual(laserWidth(d));
  });

  it('burns what it kills: blackened and glowing first, then falls and goes, then is done', () => {
    const b: Burn = { char: 0, glow: 0, topple: 0, gone: 0, done: false };
    const d = 2;
    burnAt(0, d, b);
    expect(b).toMatchObject({ char: 0, glow: 0, topple: 0, gone: 0, done: false });
    burnAt(0.3 * d, d, b);
    expect(b.char).toBeGreaterThan(0.5);
    expect(b.glow).toBeGreaterThan(0.5);
    expect(b.topple).toBe(1);
    expect(b.gone).toBe(0);
    burnAt(0.95 * d, d, b);
    expect(b.char).toBe(1);
    expect(b.glow).toBe(0);
    expect(b.gone).toBeGreaterThan(0.9);
    expect(b.done).toBe(false);
    expect(burnAt(d, d, b).done).toBe(true);
    let last = -1;
    for (let t = 0; t <= d; t += 0.05) {
      const g = burnAt(t, d, b).gone;
      expect(g).toBeGreaterThanOrEqual(last);
      last = g;
    }
  });
});
