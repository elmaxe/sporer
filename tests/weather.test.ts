import { describe, expect, it } from 'vitest';
import { tileableCloudNoise } from '../src/gen/cloudNoise';
import { parseGraphicsSettings } from '../src/ui/GraphicsSettings';
import { evaluateClimate, type ClimateData, type ClimateSetting, type ClimateState } from '../src/gen/climate';
import { generateGalaxy } from '../src/gen/galaxy';
import { lavaActivity } from '../src/gen/lavaActivity';
import { generateSystem } from '../src/gen/system';
import {
  CYCLONE_MIN_LATITUDE,
  EARTH_CLOUD_FRACTION,
  FLASH_SLOT,
  MAX_STORMS,
  StormSchedule,
  VISIBLE_CLOUD_SHARE,
  collectFlashes,
  convection,
  createFlash,
  flashBrightness,
  flashEnd,
  maxConcurrentStorms,
  offsetDirection,
  stormCentre,
  stormEvent,
  stormStrength,
  volcanicLightning,
  weatherKind,
  weatherOf,
  zonalWind,
  type StormEvent,
  type WeatherBody,
  type WeatherData,
} from '../src/gen/weather';
import type { Vec3Tuple } from '../src/gen/starActivity';
import { globeRadius } from '../src/planet/frame';

const RELIEF = 1.6;

/** Solid bodies of the default galaxy's first systems, with their weather. */
const bodies: { body: WeatherBody; radius: number; weather: WeatherData | null }[] = [];
for (const ref of generateGalaxy(1337).stars.slice(0, 250)) {
  for (const p of generateSystem(ref).planets) {
    for (const b of [p, ...p.moons]) {
      if (!b.climate) continue;
      const radius = globeRadius(b.radius);
      bodies.push({ body: b, radius, weather: weatherOf(b, radius, RELIEF) });
    }
  }
}
const withWeather = bodies.filter((b) => b.weather !== null) as { body: WeatherBody; radius: number; weather: WeatherData }[];

function climate(setting: ClimateSetting, state: Partial<ClimateState>): ClimateData {
  return evaluateClimate(setting, { pressure: 0, composition: 'none', greenhouse: 1, water: 0, surfaceAlbedo: 0.3, ...state });
}

// Reference bodies (docs/research/climate.md and weather.md).
const earth = climate(
  { insolation: 1, gravity: 1, escapeVelocity: 11.19, heatFlow: 0.092 },
  { pressure: 1.014, composition: 'oxygenNitrogen', water: 0.7, surfaceAlbedo: 0.294 },
);
const venus = climate(
  { insolation: 1.91, gravity: 0.9, escapeVelocity: 10.36, heatFlow: 1.2 },
  { pressure: 92, composition: 'carbonDioxide', surfaceAlbedo: 0.2 },
);
const titan = climate(
  { insolation: 0.011, gravity: 0.138, escapeVelocity: 2.64, heatFlow: 0.005 },
  { pressure: 1.467, composition: 'nitrogen', water: 0.6, surfaceAlbedo: 0.2 },
);
const mars = climate(
  { insolation: 0.431, gravity: 0.38, escapeVelocity: 5.03, heatFlow: 0.02 },
  { pressure: 0.0064, composition: 'carbonDioxide', surfaceAlbedo: 0.25 },
);
const io = climate({ insolation: 0.037, gravity: 0.183, escapeVelocity: 2.56, heatFlow: 2.24 }, { surfaceAlbedo: 0.6 });
const pluto = climate(
  { insolation: 0.00065, gravity: 0.063, escapeVelocity: 1.21, heatFlow: 0.003 },
  { pressure: 1e-5, composition: 'nitrogen', water: 0.6, surfaceAlbedo: 0.72 },
);
const moon = climate({ insolation: 1, gravity: 0.165, escapeVelocity: 2.38, heatFlow: 0.015 }, { surfaceAlbedo: 0.12 });

const style = { sea: '#2255aa', seaLevel: 0, low: '#557744', high: '#aa9977', relief: 0.05 };

describe('which bodies have weather', () => {
  it('gives the reference bodies the right kind', () => {
    expect(weatherKind('terran', earth)).toBe('water');
    expect(weatherKind('lava', venus)).toBe('acid');
    expect(titan.temperature).toBeGreaterThan(90);
    expect(weatherKind('ice', titan)).toBe('methane');
    expect(weatherKind('desert', mars)).toBe('dust');
    expect(weatherKind('lava', io)).toBeNull();
    expect(weatherKind('ice', pluto)).toBeNull();
    expect(weatherKind('barren', moon)).toBeNull();
    expect(weatherKind('gas', earth)).toBeNull();
    expect(weatherKind('terran', null)).toBeNull();
  });

  it('gives volcanic lightning to lava worlds with air only', () => {
    expect(volcanicLightning('lava', venus)).toBe(true);
    // Io erupts in vacuum: no ash cloud to charge.
    expect(volcanicLightning('lava', io)).toBe(false);
    expect(volcanicLightning('terran', earth)).toBe(false);
    expect(weatherOf({ type: 'lava', seed: 1, style, climate: io }, 100)).toBeNull();
    expect(weatherOf({ type: 'lava', seed: 1, style, climate: venus }, 100)!.volcanic).toBe(true);
  });

  it('snows on frozen worlds with real air, rains on warm ones', () => {
    const frozen = climate(
      { insolation: 0.3, gravity: 1, escapeVelocity: 11.19, heatFlow: 0.092 },
      { pressure: 1, composition: 'oxygenNitrogen', water: 0.7, surfaceAlbedo: 0.3 },
    );
    expect(frozen.waterState).toBe('ice');
    expect(weatherOf({ type: 'terran', seed: 3, style, climate: frozen }, 100)!.precipitation).toBe('snow');
    expect(weatherOf({ type: 'terran', seed: 3, style, climate: earth }, 100)!.precipitation).toBe('rain');
    expect(weatherOf({ type: 'lava', seed: 3, style, climate: venus }, 100)!.precipitation).toBe('acid');
    expect(weatherOf({ type: 'ice', seed: 3, style, climate: titan }, 100)!.precipitation).toBe('methane');
    expect(weatherOf({ type: 'desert', seed: 3, style, climate: mars }, 100)!.precipitation).toBeNull();
  });

  it('shows every kind across the galaxy, on a minority of bodies', () => {
    for (const kind of ['water', 'acid', 'methane', 'dust'] as const)
      expect(withWeather.filter((b) => b.weather.kind === kind).length).toBeGreaterThan(3);
    expect(withWeather.some((b) => b.weather.volcanic)).toBe(true);
    expect(bodies.length - withWeather.length).toBeGreaterThan(3 * withWeather.length);
  });

  it('follows the climate', () => {
    for (const { body, weather } of withWeather) {
      const c = body.climate!;
      expect(c.composition).not.toBe('none');
      if (weather.kind === 'water') expect(['liquid', 'ice']).toContain(c.waterState);
      if (weather.kind === 'acid') expect(c.pressure).toBeGreaterThanOrEqual(10);
      if (weather.precipitation === 'snow') expect(c.temperature).toBeLessThan(273.16);
      if (weather.storms.some((s) => s.kind === 'cyclone')) expect(c.waterState).toBe('liquid');
    }
  });
});

describe('clouds', () => {
  it('covers an Earth like Earth, scaled to what reads as opaque', () => {
    const w = weatherOf({ type: 'terran', seed: 9, style, climate: earth }, 100)!;
    const lo = VISIBLE_CLOUD_SHARE * EARTH_CLOUD_FRACTION.land * 0.75;
    const hi = VISIBLE_CLOUD_SHARE * EARTH_CLOUD_FRACTION.ocean * 1.25;
    expect(w.coverage).toBeGreaterThanOrEqual(lo);
    expect(w.coverage).toBeLessThanOrEqual(hi);
    // Ocean worlds are cloudier than dry ones on average.
    const mean = (type: string) => {
      const c = withWeather.filter((b) => b.body.type === type && b.weather.kind === 'water').map((b) => b.weather.coverage);
      return c.reduce((a, b) => a + b, 0) / c.length;
    };
    expect(mean('ocean')).toBeGreaterThan(mean('terran'));
  });

  it('puts the layer above the highest terrain as drawn', () => {
    for (const { body, radius, weather } of withWeather) {
      expect(weather.cloudRadius).toBeGreaterThan(radius * (1 + body.style.relief * RELIEF));
      expect(weather.cloudRadius).toBeLessThan(radius * 1.45);
    }
  });

  it('has easterlies in the tropics and westerlies at mid-latitudes', () => {
    expect(zonalWind(0, false)).toBeLessThan(0);
    expect(zonalWind((55 * Math.PI) / 180, false)).toBeGreaterThan(0);
    // A super-rotating deck turns one way everywhere.
    for (const lat of [0, 0.5, 1, 1.4]) expect(zonalWind(lat, true)).toBeGreaterThan(0);
  });
});

describe('storms', () => {
  const earthWeather = weatherOf({ type: 'ocean', seed: 42, style, climate: earth }, 100)!;

  it('is deterministic', () => {
    expect(stormEvent(earthWeather, 0, 2, 17)).toEqual(stormEvent(earthWeather, 0, 2, 17));
  });

  it('keeps one storm per channel at a time, inside its slot', () => {
    for (const [s, spec] of earthWeather.storms.entries()) {
      for (let slot = 0; slot < 200; slot++) {
        const e = stormEvent(earthWeather, s, 1, slot);
        if (!e) continue;
        expect(e.start).toBeGreaterThanOrEqual(slot * spec.interval);
        expect(e.end).toBeLessThanOrEqual((slot + 1) * spec.interval + 1e-9);
      }
    }
  });

  it('never has more storms than the shader has slots', () => {
    for (const { body, weather } of withWeather) {
      const lava = body.type === 'lava' && body.style.sea ? lavaActivity(body.seed, body.style, body.climate, 100) : null;
      const bound = maxConcurrentStorms(weather, lava);
      if (!weather.volcanic) expect(bound).toBeLessThanOrEqual(MAX_STORMS);
      const schedule = new StormSchedule(weather, lava ? { activity: lava, seed: body.seed } : null);
      for (let t = 0; t < 900; t += 1.5) {
        schedule.advance(t);
        const alive = schedule.events.filter((e) => e.start <= t && t < e.end).length;
        expect(alive).toBeLessThanOrEqual(bound);
      }
    }
  });

  it('spins cyclones with the Coriolis force and keeps them off the equator', () => {
    let seen = 0;
    const s = earthWeather.storms.findIndex((x) => x.kind === 'cyclone');
    expect(s).toBeGreaterThanOrEqual(0);
    for (let slot = 0; slot < 300; slot++) {
      const e = stormEvent(earthWeather, s, 0, slot);
      if (!e) continue;
      seen++;
      expect(Math.abs(e.lat)).toBeGreaterThanOrEqual(CYCLONE_MIN_LATITUDE);
      expect(e.spin).toBe(e.lat >= 0 ? 1 : -1);
      // Drifting poleward.
      const a: Vec3Tuple = [0, 0, 0];
      const b: Vec3Tuple = [0, 0, 0];
      stormCentre(e, e.start, a);
      stormCentre(e, e.end, b);
      expect(Math.abs(b[1])).toBeGreaterThan(Math.abs(a[1]));
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('has no cyclones on cool or frozen worlds', () => {
    const cool = climate(
      { insolation: 0.8, gravity: 1, escapeVelocity: 11.19, heatFlow: 0.092 },
      { pressure: 1, composition: 'oxygenNitrogen', water: 0.9, surfaceAlbedo: 0.3 },
    );
    expect(cool.temperature).toBeLessThan(280);
    expect(weatherOf({ type: 'ocean', seed: 5, style, climate: cool }, 100)!.storms.some((s) => s.kind === 'cyclone')).toBe(false);
  });

  it('builds up and dies away within its life', () => {
    const e = firstStorm(earthWeather, 0);
    expect(stormStrength(e, e.start - 1)).toBe(0);
    expect(stormStrength(e, e.end + 1)).toBe(0);
    expect(stormStrength(e, e.start + 0.5 * e.life)).toBeCloseTo(e.strength);
  });

  it('matches a fresh schedule after stepping', () => {
    const stepped = new StormSchedule(earthWeather);
    for (let t = 0; t <= 700; t += 1 / 30) stepped.advance(t);
    const fresh = new StormSchedule(earthWeather);
    fresh.advance(700);
    const ids = (s: StormSchedule) => s.events.filter((e) => e.start <= 700).map((e) => `${e.spec}/${e.channel}/${e.slot}`).sort();
    expect(ids(stepped)).toEqual(ids(fresh));
  });

  it('raises ash clouds over erupting vents on a Venus', () => {
    const vstyle = { sea: '#ff5500', seaLevel: 0.1, low: '#332222', high: '#665544', relief: 0.04 };
    const w = weatherOf({ type: 'lava', seed: 77, style: vstyle, climate: venus }, 100)!;
    const lava = lavaActivity(77, vstyle, venus, 100);
    const schedule = new StormSchedule(w, { activity: lava, seed: 77 });
    let ash = 0;
    for (let t = 0; t < 600; t += 0.5) {
      schedule.advance(t);
      ash = Math.max(ash, schedule.events.filter((e) => e.kind === 'ash').length);
    }
    expect(ash).toBeGreaterThan(0);
  });
});

describe('lightning', () => {
  it('flashes in strokes, each flaring and fading, and goes dark', () => {
    const f = { ...createFlash(), start: 10, strokes: 4, interval: 0.06, brightness: 1 };
    expect(flashBrightness(f, 9.99)).toBe(0);
    expect(flashBrightness(f, 10)).toBeCloseTo(1);
    // Dimmer between strokes than at the next one.
    expect(flashBrightness(f, 10.05)).toBeLessThan(flashBrightness(f, 10.06));
    expect(flashBrightness(f, flashEnd(f))).toBeLessThan(0.01);
    for (let t = 10; t < 11; t += 0.003) expect(flashBrightness(f, t)).toBeLessThanOrEqual(1);
  });

  const rate = (w: WeatherData, schedule: StormSchedule, span = 600) => {
    const pool = Array.from({ length: 64 }, createFlash);
    const seen = new Set<string>();
    for (let t = 0; t < span; t += FLASH_SLOT / 2) {
      schedule.advance(t);
      const n = collectFlashes(w, schedule.events, t, pool);
      for (let i = 0; i < n; i++) seen.add(`${pool[i]!.seed}`);
    }
    return seen.size / span;
  };

  it('flashes on stormy water worlds, more when warmer', () => {
    const warm = climate(
      { insolation: 1.2, gravity: 1, escapeVelocity: 11.19, heatFlow: 0.092 },
      { pressure: 1, composition: 'oxygenNitrogen', water: 0.7, surfaceAlbedo: 0.3 },
    );
    expect(warm.temperature).toBeGreaterThan(earth.temperature + 5);
    const we = weatherOf({ type: 'terran', seed: 11, style, climate: earth }, 100)!;
    const ww = weatherOf({ type: 'terran', seed: 11, style, climate: warm }, 100)!;
    expect(convection(EARTH_TEMPERATURE_K)).toBeCloseTo(1);
    expect(convection(EARTH_TEMPERATURE_K + 1)).toBeCloseTo(1.12);
    const re = rate(we, new StormSchedule(we));
    const rw = rate(ww, new StormSchedule(ww));
    expect(re).toBeGreaterThan(0.2);
    expect(rw).toBeGreaterThan(re);
  });

  it('has none on Titans and dusty worlds, rare flashes under an acid deck', () => {
    const wt = weatherOf({ type: 'ice', seed: 4, style, climate: titan }, 100)!;
    const wm = weatherOf({ type: 'desert', seed: 4, style, climate: mars }, 100)!;
    expect(rate(wt, new StormSchedule(wt))).toBe(0);
    expect(rate(wm, new StormSchedule(wm))).toBe(0);
    const wv = weatherOf({ type: 'lava', seed: 4, style, climate: venus }, 100)!;
    const background = rate(wv, new StormSchedule(wv), 2000);
    expect(background).toBeGreaterThan(0);
    expect(background).toBeLessThan(0.1);
  });

  it('puts flashes inside their storm', () => {
    const w = weatherOf({ type: 'ocean', seed: 8, style, climate: earth }, 100)!;
    const schedule = new StormSchedule(w);
    const pool = Array.from({ length: 64 }, createFlash);
    const c: Vec3Tuple = [0, 0, 0];
    let checked = 0;
    for (let t = 0; t < 300; t += 0.25) {
      schedule.advance(t);
      const n = collectFlashes(w, schedule.events, t, pool);
      for (let i = 0; i < n; i++) {
        const f = pool[i]!;
        const near = schedule.events.some((e) => {
          stormCentre(e, f.start, c);
          return Math.acos(Math.min(1, f.dir[0] * c[0] + f.dir[1] * c[1] + f.dir[2] * c[2])) <= e.size + 1e-6;
        });
        expect(near).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe('offsetDirection', () => {
  it('moves by the given angle and stays a unit vector', () => {
    for (const u of [[0, 1, 0], [1, 0, 0], [0.6, 0, 0.8], [0, -1, 0]] as Vec3Tuple[]) {
      const out: Vec3Tuple = [0, 0, 0];
      offsetDirection(u, 1.1, 0.3, out);
      expect(Math.hypot(...out)).toBeCloseTo(1);
      expect(Math.acos(u[0] * out[0] + u[1] * out[1] + u[2] * out[2])).toBeCloseTo(0.3);
    }
  });
});

const EARTH_TEMPERATURE_K = 288.15;

function firstStorm(w: WeatherData, spec: number): StormEvent {
  for (let slot = 0; ; slot++) {
    const e = stormEvent(w, spec, 0, slot);
    if (e) return e;
  }
}

describe('cloud noise', () => {
  const size = 32;
  const noise = tileableCloudNoise(size, 5);
  const at = (x: number, y: number, z: number, channel: number) =>
    noise[((((z + size) % size) * size + ((y + size) % size)) * size + ((x + size) % size)) * 4 + channel]!;

  it('spreads each field evenly over the bytes, so a threshold of 1 − c covers c', () => {
    for (const channel of [0, 1]) {
      for (const c of [0.1, 0.3, 0.5, 0.8]) {
        let n = 0;
        for (let i = channel; i < noise.length; i += 4) if (noise[i]! / 255 > 1 - c) n++;
        expect(n / (noise.length / 4)).toBeCloseTo(c, 1);
      }
    }
  });

  it('tiles: no seam where it wraps', () => {
    // Neighbours across the wrap differ no more than neighbours inside.
    for (const channel of [0, 1]) {
      let inside = 0;
      let across = 0;
      for (let y = 0; y < size; y++)
        for (let z = 0; z < size; z++) {
          inside = Math.max(inside, Math.abs(at(1, y, z, channel) - at(2, y, z, channel)));
          across = Math.max(across, Math.abs(at(size - 1, y, z, channel) - at(0, y, z, channel)));
        }
      expect(across).toBeLessThanOrEqual(inside * 1.5 + 8);
    }
  });

  it('is deterministic', () => {
    expect(tileableCloudNoise(16, 3)).toEqual(tileableCloudNoise(16, 3));
  });
});

describe('graphics settings', () => {
  it('turns weather on by default and reads a saved choice', () => {
    expect(parseGraphicsSettings(null).weather).toBe(true);
    expect(parseGraphicsSettings('{"weather":false}').weather).toBe(false);
    expect(parseGraphicsSettings('not json').weather).toBe(true);
    expect(parseGraphicsSettings('{"weather":"no"}').weather).toBe(true);
  });

  it('starts with the wireframe off and reads a saved choice', () => {
    expect(parseGraphicsSettings(null).wireframe).toBe(false);
    expect(parseGraphicsSettings('{"wireframe":true}').wireframe).toBe(true);
    expect(parseGraphicsSettings('{"wireframe":1}').wireframe).toBe(false);
  });
});
