import { describe, expect, it } from 'vitest';
import {
  adaptExposure,
  exposureParams,
  sceneExposure,
  starGlare,
  targetExposure,
} from '../src/player/exposure';

const HALF_FOV = (65 * Math.PI) / 180 / 2;

describe('starGlare', () => {
  it('grows with the star’s size in view, up to filling it', () => {
    expect(starGlare(0.01, 0, HALF_FOV)).toBeLessThan(0.001);
    expect(starGlare(0.1, 0, HALF_FOV)).toBeLessThan(starGlare(0.2, 0, HALF_FOV));
    expect(starGlare(HALF_FOV, 0, HALF_FOV)).toBeCloseTo(1, 9);
    expect(starGlare(1.5, 0, HALF_FOV)).toBe(1);
  });

  it('fades out as the star leaves the view', () => {
    const inView = starGlare(0.2, 0.2, HALF_FOV);
    const edge = starGlare(0.2, HALF_FOV * 1.1, HALF_FOV);
    const behind = starGlare(0.2, Math.PI * 0.9, HALF_FOV);
    expect(inView).toBeGreaterThan(edge);
    expect(edge).toBeGreaterThan(0);
    expect(behind).toBe(0);
  });

  it('still counts a star you are inside of (it fills every direction)', () => {
    expect(starGlare(Math.PI / 2, Math.PI / 2, HALF_FOV)).toBeGreaterThan(0.5);
  });
});

describe('targetExposure', () => {
  it('is dark-adapted with no star in view and stops down as glare grows, to a floor', () => {
    expect(targetExposure(0)).toBe(1);
    expect(targetExposure(0.1)).toBeLessThan(1);
    expect(targetExposure(0.3)).toBeLessThan(targetExposure(0.1));
    expect(targetExposure(10)).toBe(exposureParams.minExposure);
  });

  it('lets a star filling the view show its plain colours', () => {
    // Surface brightness = intensity × exposure; ~1 is the unexposed look.
    expect(exposureParams.starIntensity * targetExposure(1)).toBeLessThan(1.05);
  });
});

describe('adaptExposure', () => {
  it('converges to the target, faster towards light than back to the dark', () => {
    const toBright = adaptExposure(1, 0.4, 0.3);
    const toDark = adaptExposure(0.4, 1, 0.3);
    expect(1 - toBright).toBeGreaterThan(toDark - 0.4);
    let e = 1;
    for (let i = 0; i < 600; i++) e = adaptExposure(e, 0.4, 1 / 60);
    expect(e).toBeCloseTo(0.4, 6);
  });

  it('is independent of the frame rate', () => {
    let a = 1;
    for (let i = 0; i < 60; i++) a = adaptExposure(a, 0.5, 1 / 60);
    let b = 1;
    for (let i = 0; i < 144; i++) b = adaptExposure(b, 0.5, 1 / 144);
    expect(a).toBeCloseTo(b, 9);
  });
});

describe('sceneExposure', () => {
  it('dims the rest of the scene part of the way', () => {
    expect(sceneExposure(1)).toBe(1);
    expect(sceneExposure(0.4)).toBeGreaterThan(0.4);
    expect(sceneExposure(0.4)).toBeLessThan(1);
  });
});
