import { describe, expect, it } from 'vitest';
import { DISC_DUST, discDustTransmittance } from '../src/galaxy/discDust';
import { GLOW_NEAR } from '../src/galaxy/appearance';

const R = 1000;

describe('discDustTransmittance', () => {
  it('dims a star seen face-on through the ring by about its face-on depth', () => {
    // Where the ring is densest (~0.75 R), from far above.
    let best = 0;
    for (let r = 0; r <= R; r += 10) {
      best = Math.max(best, 1 - discDustTransmittance({ x: r, y: 3000, z: 0 }, { x: r, y: -300, z: 0 }, R));
    }
    const expected = (1 - DISC_DUST.minTransmittance) * (1 - Math.exp(-DISC_DUST.faceOnDepth));
    expect(best).toBeCloseTo(expected, 2);
  });

  it('hides stars edge-on behind the plane, not above it', () => {
    const eye = { x: 2000, y: 0, z: 300 };
    const behind = discDustTransmittance(eye, { x: -600, y: 0, z: 0 }, R);
    const above = discDustTransmittance(eye, { x: -600, y: 60, z: 0 }, R);
    expect(behind).toBeLessThan(0.35);
    expect(above).toBeGreaterThan(0.9);
  });

  it('leaves the middle and the space near the camera clear', () => {
    expect(discDustTransmittance({ x: 0, y: 3000, z: 0 }, { x: 0, y: 0, z: 0 }, R)).toBeGreaterThan(0.999);
    expect(discDustTransmittance({ x: 500, y: 0, z: 0 }, { x: 500 + GLOW_NEAR * 0.9, y: 0, z: 0 }, R)).toBe(1);
  });

  it('never hides a star completely', () => {
    expect(discDustTransmittance({ x: 3000, y: 0, z: 0 }, { x: -3000, y: 0, z: 0 }, R)).toBeGreaterThanOrEqual(
      DISC_DUST.minTransmittance,
    );
  });
});
