import { describe, expect, it } from 'vitest';
import { galacticTilt, MAX_GALACTIC_TILT, rotate } from '../src/gen/galactic';
import { generateGalaxy } from '../src/gen/galaxy';
import { Rng } from '../src/gen/rng';
import { generateSystem } from '../src/gen/system';
import {
  galaxyScale,
  handoverIn,
  handoverOut,
  sampleSeamlessZoom,
  seamlessZoomParams as params,
  zoomDuration,
  type SeamlessZoom,
} from '../src/levels/seamlessZoom';

const timing = { lead: params.lead, overlap: params.overlap, tail: params.tail };
const zone = 30;

/** Galaxy (min zoom 8) → system, arriving 90 from the ship. */
function zoomIn(): { zoom: SeamlessZoom; scale: number } {
  const handover = handoverIn(zone);
  const scale = galaxyScale(handover);
  return { zoom: { ...timing, start: 8 / scale, handover, end: 90 }, scale };
}

/** System (max zoom 2500) → galaxy, settling 60 from the ship. */
function zoomOut(): { zoom: SeamlessZoom; scale: number } {
  const handover = handoverOut(zone, 2500);
  const scale = galaxyScale(handover);
  return { zoom: { ...timing, start: 2500, handover, end: 60 / scale }, scale };
}

function samples(zoom: SeamlessZoom, step = 1 / 240) {
  const out = [];
  for (let t = 0; t <= zoomDuration(zoom) + 1e-9; t += step) out.push(sampleSeamlessZoom(zoom, t));
  return out;
}

describe('seamless zoom timeline', () => {
  it('starts, hands over and ends at the given distances', () => {
    for (const { zoom } of [zoomIn(), zoomOut()]) {
      expect(sampleSeamlessZoom(zoom, 0).distance).toBeCloseTo(zoom.start, 6);
      const mid = sampleSeamlessZoom(zoom, zoom.lead + zoom.overlap / 2);
      expect(mid.distance).toBeCloseTo(zoom.handover, 6);
      expect(mid.blend).toBeCloseTo(0.5);
      const end = sampleSeamlessZoom(zoom, zoomDuration(zoom));
      expect(end.distance).toBeCloseTo(zoom.end, 6);
      expect(end.done).toBe(true);
      expect(sampleSeamlessZoom(zoom, zoomDuration(zoom) + 1).distance).toBeCloseTo(zoom.end, 6);
    }
  });

  it('matches the star in both views at the handover', () => {
    const { zoom, scale } = zoomIn();
    const d = sampleSeamlessZoom(zoom, zoom.lead + zoom.overlap / 2).distance;
    // The galaxy camera is `scale` × the system distance, and draws the star `scale` × its size.
    expect(d * scale).toBeCloseTo(params.galaxyHandover);
    const systemAngle = Math.atan(zone / d);
    const galaxyAngle = Math.atan((zone * scale) / (d * scale));
    expect(galaxyAngle).toBeCloseTo(systemAngle, 12);
    expect(systemAngle).toBeCloseTo(params.handoverAngle, 6);
  });

  it('zooms monotonically and smoothly, without stopping at the handover', () => {
    for (const { zoom } of [zoomIn(), zoomOut()]) {
      const s = samples(zoom);
      const dir = Math.sign(zoom.end - zoom.start);
      let largest = 0;
      for (let i = 1; i < s.length; i++) {
        const step = Math.log(s[i]!.distance / s[i - 1]!.distance);
        expect(step * dir).toBeGreaterThanOrEqual(-1e-12);
        largest = Math.max(largest, Math.abs(step));
      }
      // No jumps: a 240 Hz step never moves more than a few percent.
      expect(largest).toBeLessThan(0.05);
      // Still moving at the handover.
      const th = zoom.lead + zoom.overlap / 2;
      const a = sampleSeamlessZoom(zoom, th - 0.01).distance;
      const b = sampleSeamlessZoom(zoom, th + 0.01).distance;
      expect(Math.abs(Math.log(b / a))).toBeGreaterThan(0.01);
    }
  });

  it('shows the outgoing level alone, then crossfades, then the incoming alone', () => {
    const { zoom } = zoomIn();
    for (const s of samples(zoom)) {
      expect(s.blend).toBeGreaterThanOrEqual(0);
      expect(s.blend).toBeLessThanOrEqual(1);
    }
    expect(sampleSeamlessZoom(zoom, zoom.lead - 0.01).blend).toBe(0);
    expect(sampleSeamlessZoom(zoom, zoom.lead - 0.01).lead).toBeGreaterThan(0.99);
    expect(sampleSeamlessZoom(zoom, zoom.lead + zoom.overlap).blend).toBe(1);
    expect(sampleSeamlessZoom(zoom, zoom.lead + zoom.overlap).tail).toBe(0);
    expect(sampleSeamlessZoom(zoom, zoomDuration(zoom)).tail).toBe(1);
  });

  it('hands over zooming out well beyond where the system camera starts', () => {
    expect(handoverOut(zone, 100)).toBe(handoverIn(zone));
    expect(handoverOut(zone, 2500)).toBeCloseTo(2500 * params.handoverOut);
  });
});

describe('galacticTilt', () => {
  it('is a unit rotation that keeps the ecliptic within the maximum tilt', () => {
    for (let i = 0; i < 500; i++) {
      const q = galacticTilt(new Rng(i));
      expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 12);
      const pole = rotate(q, 0, 1, 0);
      expect(Math.hypot(pole.x, pole.y, pole.z)).toBeCloseTo(1, 12);
      expect(Math.acos(Math.min(1, pole.y))).toBeLessThanOrEqual(MAX_GALACTIC_TILT + 1e-9);
    }
  });

  it('varies between systems and is deterministic', () => {
    const galaxy = generateGalaxy(1337, 20);
    const tilts = galaxy.stars.map((ref) => generateSystem(ref).galacticTilt);
    expect(new Set(tilts.map((q) => q.w.toFixed(6))).size).toBe(tilts.length);
    expect(generateSystem(galaxy.stars[3]!).galacticTilt).toEqual(tilts[3]);
    // Tilts spread out: some near face-on, some steep.
    const angles = tilts.map((q) => Math.acos(rotate(q, 0, 1, 0).y));
    expect(Math.min(...angles)).toBeLessThan(0.6);
    expect(Math.max(...angles)).toBeGreaterThan(0.8);
  });
});
