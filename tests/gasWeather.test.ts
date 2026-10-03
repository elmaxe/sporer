import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/gen/galaxy';
import { gasBandAt, gasDrift, generateGasLayout, type GasLayout } from '../src/gen/gasGiants';
import {
  GAS_LIGHTNING,
  GasStormSchedule,
  MAX_GAS_EVENTS,
  collectGasFlashes,
  describeGasStorms,
  describeGasWeather,
  gasStormCentre,
  gasStormEvent,
  gasStormStrength,
  gasStormTail,
  gasWeatherOf,
  slotPhase,
  type GasStormEvent,
  type GasWeather,
} from '../src/gen/gasWeather';
import { SOL_SEEDS } from '../src/gen/solSeeds';
import { generateSystem } from '../src/gen/system';
import { createFlash, flashBrightness } from '../src/gen/weather';
import type { Vec3Tuple } from '../src/gen/starActivity';

const DEG = Math.PI / 180;
/** A giant's drift rate in the view: spin × pace (gasParams.pace = 4), radians per second per unit of drift. */
const RATE = 0.2 * 4;

/** The giants of the default galaxy's first systems. */
const giants: { seed: number; layout: GasLayout; weather: GasWeather }[] = [];
for (const ref of generateGalaxy(1337).stars.slice(0, 200)) {
  for (const p of generateSystem(ref).planets) {
    if (p.type !== 'gas') continue;
    const layout = generateGasLayout(p.seed, p.size === 'iceGiant');
    giants.push({ seed: p.seed, layout, weather: gasWeatherOf(layout, p.seed) });
  }
}

function sol(name: keyof typeof SOL_SEEDS, ice: boolean): { layout: GasLayout; weather: GasWeather } {
  const layout = generateGasLayout(SOL_SEEDS[name], ice);
  return { layout, weather: gasWeatherOf(layout, SOL_SEEDS[name]) };
}

/** Every storm of a giant over [0, until), slot by slot. */
function allStorms(w: GasWeather, layout: GasLayout, until: number): GasStormEvent[] {
  const out: GasStormEvent[] = [];
  w.specs.forEach((s, i) => {
    for (let c = 0; c < s.channels; c++)
      for (let slot = 0; slot * s.interval < until; slot++) {
        const e = gasStormEvent(w, layout, i, c, slot);
        if (e) out.push(e);
      }
  });
  return out;
}

describe('which storms a giant has', () => {
  it('gas giants have convective plumes with lightning; Saturn-like ones great white storms too', () => {
    const gas = giants.filter((g) => !g.layout.ice);
    expect(gas.length).toBeGreaterThan(20);
    for (const g of gas) {
      expect(g.weather.specs.some((s) => s.kind === 'plume' && s.lightning > 0)).toBe(true);
      expect(g.weather.specs.some((s) => s.kind === 'great')).toBe(g.layout.saturn >= 0.5);
      expect(g.weather.specs.some((s) => s.kind === 'outburst' || s.kind === 'spot')).toBe(false);
    }
    expect(gas.some((g) => g.layout.saturn >= 0.5)).toBe(true);
  });

  it('ice giants have methane outbursts and dark spots, and rare lightning', () => {
    const ice = giants.filter((g) => g.layout.ice);
    expect(ice.length).toBeGreaterThan(10);
    for (const g of ice) {
      expect(g.weather.specs.map((s) => s.kind).sort()).toEqual(['outburst', 'spot']);
      for (const s of g.weather.specs) expect(s.lightning).toBeLessThanOrEqual(GAS_LIGHTNING.ice);
    }
  });

  it("Sol's giants: Jupiter's plumes, Saturn's great white storms, Uranus's and Neptune's outbursts and spots", () => {
    expect(sol('jupiter', false).weather.specs.map((s) => s.kind)).toEqual(['plume']);
    expect(sol('saturn', false).weather.specs.map((s) => s.kind)).toEqual(['plume', 'great']);
    expect(sol('uranus', true).weather.specs.map((s) => s.kind)).toEqual(['outburst', 'spot']);
    expect(sol('neptune', true).weather.specs.map((s) => s.kind)).toEqual(['outburst', 'spot']);
    expect(describeGasWeather(sol('saturn', false).weather)).toBe('convective storms · great white storms · lightning');
    expect(describeGasWeather(sol('neptune', true).weather)).toBe('methane storms · dark spots · lightning');
  });

  it('never has more storms at once than the shader has slots', () => {
    for (const g of giants) expect(g.weather.specs.reduce((n, s) => n + s.channels, 0)).toBeLessThanOrEqual(MAX_GAS_EVENTS);
  });

  it('is deterministic', () => {
    const { seed, layout } = giants[3]!;
    expect(gasWeatherOf(layout, seed)).toEqual(giants[3]!.weather);
    expect(allStorms(giants[3]!.weather, layout, 2000)).toEqual(allStorms(gasWeatherOf(layout, seed), layout, 2000));
  });
});

describe('the storms', () => {
  it('keep one storm per channel at a time, each living inside its slot', () => {
    for (const g of giants.slice(0, 30)) {
      g.weather.specs.forEach((s, i) => {
        for (let c = 0; c < s.channels; c++) {
          let lastEnd = -Infinity;
          for (let slot = 0; slot < 20; slot++) {
            const e = gasStormEvent(g.weather, g.layout, i, c, slot);
            if (!e) continue;
            const opens = (slot + slotPhase(s, c)) * s.interval;
            expect(e.start).toBeGreaterThanOrEqual(opens);
            expect(e.end).toBeLessThanOrEqual(opens + s.interval + 1e-9);
            expect(e.start).toBeGreaterThanOrEqual(lastEnd);
            lastEnd = e.end;
          }
        }
      });
    }
  });

  it('bursts plumes up in the belts, inside the banded latitudes', () => {
    for (const g of giants.filter((g) => !g.layout.ice).slice(0, 30)) {
      for (const e of allStorms(g.weather, g.layout, 3000).filter((e) => e.kind === 'plume')) {
        expect(gasBandAt(g.layout, e.lat).zone).toBe(false);
        expect(Math.abs(e.lat)).toBeLessThanOrEqual(g.layout.polar);
      }
    }
  });

  it("trails a plume's wake downstream: along the jet next to it, as far as the measured wake", () => {
    const { layout, weather } = sol('jupiter', false);
    const plumes = allStorms(weather, layout, 5000);
    expect(plumes.length).toBeGreaterThan(50);
    for (const e of plumes) {
      // 13 000–30 000 km behind over its life at 24°N: up to 26° of longitude.
      expect(Math.abs(e.tail)).toBeLessThanOrEqual(26 * DEG + 1e-9);
      expect(Math.abs(e.tail)).toBeGreaterThan(5 * DEG);
      const side = Math.sign(e.tailShift);
      const shear = gasDrift(layout, e.lat + side * Math.abs(e.tailShift) / 0.6) - gasDrift(layout, e.lat);
      if (Math.abs(shear) > 1e-6) expect(Math.sign(e.tail)).toBe(Math.sign(shear));
      // It grows from nothing to its length over the plume's life.
      expect(gasStormTail(e, e.start)).toBeCloseTo(0);
      expect(gasStormTail(e, e.end)).toBeCloseTo(e.tail);
    }
  });

  it("wraps a great white storm's trail round the planet in 55 of its 201 days, its head grown in ~10", () => {
    const { layout, weather } = sol('saturn', false);
    const great = allStorms(weather, layout, 30_000).filter((e) => e.kind === 'great');
    expect(great.length).toBeGreaterThan(3);
    for (const e of great) {
      expect(Math.abs(gasStormTail(e, e.start + (e.life * 55) / 201))).toBeCloseTo(2 * Math.PI);
      expect(Math.abs(gasStormTail(e, e.start + (e.life * 55) / 402))).toBeCloseTo(Math.PI, 1);
      expect(gasStormStrength(e, e.start + (e.life * 10) / 201)).toBeCloseTo(e.strength);
      expect(gasStormStrength(e, e.start + (e.life * 3) / 201)).toBeLessThan(e.strength * 0.5);
      // Its head 20 000–34 000 km long on Saturn.
      expect(2 * e.size * 60_268).toBeGreaterThan(19_000);
      expect(2 * e.size * 60_268).toBeLessThan(35_000);
      expect(Math.abs(e.lat)).toBeLessThanOrEqual(40 * DEG);
    }
  });

  it('drifts a dark spot towards the equator, never past it, and fades it', () => {
    const { layout, weather } = sol('neptune', true);
    const spots = allStorms(weather, layout, 20_000).filter((e) => e.kind === 'spot');
    expect(spots.length).toBeGreaterThan(3);
    const c: Vec3Tuple = [0, 0, 0];
    for (const e of spots) {
      const start = Math.asin(gasStormCentre(e, e.start, RATE, c)[1]);
      const end = Math.asin(gasStormCentre(e, e.end, RATE, c)[1]);
      expect(Math.abs(end)).toBeLessThan(Math.abs(start));
      expect(Math.sign(end)).toBe(Math.sign(start));
      expect(gasStormStrength(e, e.end - 1e-3)).toBeLessThan(0.01);
      expect(e.lightning).toBe(0);
    }
  });

  it("rides its latitude's wind", () => {
    const { layout, weather } = sol('jupiter', false);
    const e = allStorms(weather, layout, 1000)[0]!;
    const c: Vec3Tuple = [0, 0, 0];
    const lon = (t: number) => {
      gasStormCentre(e, t, RATE, c);
      return Math.atan2(c[0], c[2]);
    };
    const lon0 = lon(e.start);
    const lon1 = lon(e.start + 10);
    const moved = Math.atan2(Math.sin(lon1 - lon0), Math.cos(lon1 - lon0));
    expect(moved).toBeCloseTo(gasDrift(layout, e.lat) * RATE * 10, 6);
  });

  it('keeps a few storms going on a Jupiter at once, nearly always', () => {
    const { layout, weather } = sol('jupiter', false);
    const schedule = new GasStormSchedule(weather, layout);
    let busy = 0;
    let n = 0;
    for (let t = 0; t < 6000; t += 5, n++) {
      schedule.advance(t);
      if (schedule.events.some((e) => gasStormStrength(e, t) > 0)) busy++;
    }
    expect(busy / n).toBeGreaterThan(0.95);
  });

  it('a schedule that jumps about matches a fresh one', () => {
    const { layout, weather } = sol('saturn', false);
    const walked = new GasStormSchedule(weather, layout);
    for (let t = 0; t < 3000; t += 0.5) walked.advance(t);
    const key = (e: GasStormEvent) => `${e.spec}:${e.channel}:${e.slot}`;
    for (const t of [3000, 120, 9000.5, 2999]) {
      walked.advance(t);
      const fresh = new GasStormSchedule(weather, layout);
      fresh.advance(t);
      const live = (s: GasStormSchedule) => s.events.filter((e) => e.start <= t && t < e.end).map(key).sort();
      expect(live(walked)).toEqual(live(fresh));
    }
  });

  it('names a great white storm under way', () => {
    const { layout, weather } = sol('saturn', false);
    const e = allStorms(weather, layout, 30_000).find((e) => e.kind === 'great')!;
    expect(describeGasStorms([e])).toBe('a great white storm under way');
    expect(describeGasStorms([])).toBe('');
  });
});

describe('lightning', () => {
  /** Mean flashes per second from one storm at full strength, counted on the flash grid. */
  function flashRate(e: GasStormEvent): number {
    const pool = Array.from({ length: 8 }, createFlash);
    const seen = new Set<number>();
    let span = 0;
    for (let t = e.start; t < e.end; t += 0.05) {
      if (gasStormStrength(e, t) < e.strength * 0.999) continue;
      span += 0.05;
      const n = collectGasFlashes([e], t, RATE, pool);
      for (let i = 0; i < n; i++) seen.add(pool[i]!.seed);
    }
    return seen.size / span;
  }

  it("flashes inside a storm's head, never striking anything", () => {
    const { layout, weather } = sol('jupiter', false);
    const e = allStorms(weather, layout, 2000)[0]!;
    const pool = Array.from({ length: 8 }, createFlash);
    const c: Vec3Tuple = [0, 0, 0];
    let flashes = 0;
    for (let t = e.start; t < e.end; t += 0.1) {
      const n = collectGasFlashes([e], t, RATE, pool);
      gasStormCentre(e, t, RATE, c);
      for (let i = 0; i < n; i++) {
        const f = pool[i]!;
        flashes++;
        expect(f.ground).toBe(false);
        const cos = f.dir[0] * c[0] + f.dir[1] * c[1] + f.dir[2] * c[2];
        // Within the head (plus how far the head moved while the flash lasts).
        expect(Math.acos(Math.min(1, cos))).toBeLessThan(e.size / e.aspect + 0.01);
        expect(flashBrightness(f, f.start + 1e-3)).toBeGreaterThan(0);
      }
    }
    expect(flashes).toBeGreaterThan(10);
  });

  it("flashes at the stylised rates: a great storm an order of magnitude more than a plume (Saturn 2010's > 10/s)", () => {
    const jupiter = sol('jupiter', false);
    const saturn = sol('saturn', false);
    const plume = allStorms(jupiter.weather, jupiter.layout, 2000)[0]!;
    const great = allStorms(saturn.weather, saturn.layout, 30_000).find((e) => e.kind === 'great')!;
    const p = flashRate(plume) / plume.strength;
    const g = flashRate(great) / great.strength;
    expect(p).toBeGreaterThan(plume.lightning * 0.6);
    expect(p).toBeLessThan(plume.lightning * 1.4);
    // The pool's 8 slots cap the busiest moments a little.
    expect(g / p).toBeGreaterThan(6);
    expect(g).toBeGreaterThan(5);
  });

  it('has no flashes without storms, and none from dark spots', () => {
    const pool = Array.from({ length: 8 }, createFlash);
    expect(collectGasFlashes([], 100, RATE, pool)).toBe(0);
    const { layout, weather } = sol('neptune', true);
    const spot = allStorms(weather, layout, 20_000).find((e) => e.kind === 'spot')!;
    for (let t = spot.start; t < spot.end; t += 1) expect(collectGasFlashes([spot], t, RATE, pool)).toBe(0);
  });
});
