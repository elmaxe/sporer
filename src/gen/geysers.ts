import type { ClimateData } from './climate';
import { LAVA_GRAVITY, MIN_ARC_GRAVITY, randomDirection, tangent } from './lavaActivity';
import { detailedTerrain } from './noise';
import { surfaceNoise } from './craters';
import { GLOBE_SIZE_FACTOR, landElevation, type MoonType, type PlanetStyle, type PlanetType } from './planets';
import { Rng, hashSeed } from './rng';
import type { Vec3Tuple } from './starActivity';

/*
 * Geothermal activity: geysers. Pure data and maths; the view is
 * planet/Geysers.ts (low orbit only).
 *
 * Three kinds, chosen from the climate (step 12):
 * - cryo: icy bodies with enough internal heat throw tall jets of water
 *   vapour and ice grains (Enceladus). On moons, whose heat is mostly tidal,
 *   the vents sit on four parallel "tiger stripes" round the south pole; on
 *   planets along a few cracks. In vacuum they climb high and fall back as a
 *   fan; where there is air, a wind drags them sideways (Triton).
 * - steam: worlds with liquid water and heat have hot-spring geyser fields
 *   on land (Yellowstone, Iceland): short white columns that erupt now and
 *   then, throwing droplets and a buoyant cloud of steam that drifts off.
 * - sulphur: airless, Io-hot bodies have Io's volcanic plumes, wide umbrellas
 *   of SO₂ and dust: many small Prometheus-type and the odd tall Pele-type.
 * - fumarole: every other airless rocky body warm enough inside vents a
 *   little: fissures smoking with gas and dust, flickering with flames and
 *   throwing glowing embers. Real airless bodies still outgas (the Moon's
 *   radon from Aristarchus and Kepler, the argon Apollo 17 saw puffing out
 *   with moonquakes, Mercury's hollows), but far too faintly to see: this one
 *   is deliberately stylised, so barren worlds aren't dead (see geysers.md).
 *
 * Each vent erupts on its own cycle, a fixed period per vent with one seeded
 * event per cycle (like the lava's slots, gen/lavaActivity.ts), so what is
 * erupting at any moment is known without replaying the past.
 *
 * Heights and times are stylised: at the planet level's 63.7 km per unit Old
 * Faithful would be 0.0006 units tall, and an Enceladus plume would take many
 * minutes to fall. The arcs share the lava's gravity (3·√g units/s²), and
 * cryo and steam peaks scale as g^−½; Io's plumes keep their real height as a
 * fraction of the radius. Sources, reference cases and the mapping:
 * docs/research/geysers.md.
 */

export type GeyserKind = 'cryo' | 'steam' | 'sulphur' | 'fumarole';

/**
 * Least heat flow (W/m²) for cryogeysers: just under Enceladus's measured
 * 0.019–0.050 (docs/research/climate.md), and above a Ganymede analogue's
 * radiogenic 0.013 (no plumes there).
 */
export const CRYO_MIN_HEAT_FLOW = 0.018;
/** Least heat flow for steam geysers: half Earth's 0.092 W/m² (a gameplay threshold, see geysers.md). */
export const STEAM_MIN_HEAT_FLOW = 0.046;
/** Least heat flow for Io-style plumes, W/m²: Io is 2.24; lava bodies start at 1 (gen/climate.ts). */
export const SULPHUR_MIN_HEAT_FLOW = 1;
/** Io-style umbrella plumes need near vacuum (Io's SO₂ air is ~1 nbar); a Venus-like lava world has none. */
export const SULPHUR_MAX_PRESSURE = 0.001;
/**
 * Least heat flow for fumaroles on airless rock, W/m²: a tenth of the Moon's
 * measured 16–21 mW/m² (Apollo 17 and 15), so most airless rocky bodies vent
 * a little (about 60% of the barren ones; stylised, see geysers.md), up to
 * FUMAROLE_FULL_HEAT_FLOW where they're at their busiest.
 */
export const FUMAROLE_MIN_HEAT_FLOW = 0.002;
export const FUMAROLE_FULL_HEAT_FLOW = 0.2;
/** Rocky bodies that can have fumaroles (airless). */
const FUMAROLE_TYPES: readonly (PlanetType | MoonType)[] = ['barren', 'desert', 'lava'];
/** Below this pressure (bar) there's no wind to carry a plume; Triton's 14 µbar still does. */
export const WIND_MIN_PRESSURE = 1e-6;

/** Enceladus's tiger stripes: four ~130 km long, 35 km apart, on a 252.1 km moon (in radians of its surface). */
export const TIGER_STRIPES = { count: 4, length: 130 / 252.1, spacing: 35 / 252.1 } as const;

/** Per kind: the stylised look and rhythm (see geysers.md for the real counterparts). */
export interface GeyserSpec {
  /** Seconds between the starts of a vent's eruptions. */
  period: readonly [number, number];
  /** Fraction of the period a vent erupts. */
  duty: readonly [number, number];
  /** Particles thrown per second by an erupting vent (at full heat). */
  rate: number;
  /** Half-angle of the launch cone about the vertical, radians. */
  spread: number;
  /** Particle size at launch as a fraction of the vent's peak height, and the least in units. */
  size: number;
  minSize: number;
  /** How many times bigger a particle is at the end of its life. */
  growth: number;
}

export const GEYSER_SPECS: Record<GeyserKind, GeyserSpec> = {
  // Near-continuous, like Enceladus's jets; the moons' output swells and fades with the orbit (see geyserPulse).
  cryo: { period: [20, 35], duty: [0.7, 0.95], rate: 10, spread: 0.14, size: 0.16, minSize: 1 * GLOBE_SIZE_FACTOR, growth: 3 },
  // Every so often, like Old Faithful and Strokkur (compressed from minutes to seconds).
  steam: { period: [20, 55], duty: [0.2, 0.35], rate: 30, spread: 0.08, size: 0.3, minSize: 1 * GLOBE_SIZE_FACTOR, growth: 4 },
  // Long-lived, like Io's plumes (months to years).
  sulphur: { period: [45, 90], duty: [0.6, 0.9], rate: 16, spread: 0.6, size: 0.3, minSize: 1.2 * GLOBE_SIZE_FACTOR, growth: 2.5 },
  // Smoking most of the time, swelling and dying down every so often (stylised).
  fumarole: { period: [14, 32], duty: [0.55, 0.9], rate: 16, spread: 0.35, size: 0.3, minSize: 0.7 * GLOBE_SIZE_FACTOR, growth: 3.5 },
};

/**
 * Peak height of a cryo / steam plume at 1 g, planet-level units (they scale as g^−½, like the lava's arcs).
 * Like the lava's, every length and speed here grows with the globes (GLOBE_SIZE_FACTOR) and no time does,
 * so plumes look the same next to the planet whatever its size.
 */
export const PEAK_1G: Record<'cryo' | 'steam' | 'fumarole', number> = { cryo: 6 * GLOBE_SIZE_FACTOR, steam: 5 * GLOBE_SIZE_FACTOR, fumarole: 3 * GLOBE_SIZE_FACTOR };
/** Plumes never climb higher than this fraction of the body's radius. Io's are real fractions (sulphur). */
export const MAX_PEAK_FRACTION: Record<GeyserKind, number> = { cryo: 0.6, steam: 0.06, sulphur: 0.23, fumarole: 0.05 };
/** No plume is lower than this, units (a small moon's Prometheus-type plume would be a speck on the globe). */
export const MIN_PEAK = 3 * GLOBE_SIZE_FACTOR;
/** Io's plumes as fractions of its 1821.49 km radius: Prometheus-type 50–120 km, Pele-type 300–426 km. */
export const IO_PLUMES = { prometheus: [50 / 1821.49, 120 / 1821.49], pele: [300 / 1821.49, 426 / 1821.49], peleShare: 0.25 } as const;

/** Steam: the rising cloud. Drag (1/s) that stops the jet, buoyancy (units/s², upwards) and lifetime range. */
export const STEAM_PUFF = { drag: 1.2, buoyancy: 0.35 * GLOBE_SIZE_FACTOR, life: [5, 9] as const, share: 0.7 };
/**
 * Fumaroles: the smoke (stalls like steam, then hangs and spreads; it would
 * fan out into the vacuum, but stylised to billow), the flames at the mouth
 * (short-lived) and the embers' share (the rest), thrown on short arcs.
 */
export const FUMAROLE_SMOKE = { drag: 1.1, buoyancy: 0.12 * GLOBE_SIZE_FACTOR, life: [4, 8] as const, share: 0.5 };
export const FUMAROLE_FLAME = { drag: 3, buoyancy: 0.6 * GLOBE_SIZE_FACTOR, life: [0.5, 1.2] as const, share: 0.25 };
/** Drag (1/s) on cryo grains where there's air. */
export const CRYO_AIR_DRAG = 0.3;
/** Wind speed range, units/s, where there's air. */
export const WIND_SPEED = [0.5 * GLOBE_SIZE_FACTOR, 1.2 * GLOBE_SIZE_FACTOR] as const;

export interface GeyserVent {
  /** Unit direction (body frame). */
  dir: Vec3Tuple;
  /** Radius of the ground at the vent, planet-level units. */
  base: number;
  /** Seconds between eruptions, and the fraction of it spent erupting. */
  period: number;
  duty: number;
  /** Target peak height of the fastest particles, units. */
  peak: number;
  /** Launch speed of the fastest particles, units/s. */
  speed: number;
  /** Wind drift (tangent to the surface at the vent), units/s. */
  wind: Vec3Tuple;
}

export interface GeyserActivity {
  kind: GeyserKind;
  /** Activity on a 0–1 scale for its kind (see geyserHeat). */
  heat: number;
  /** Arc gravity, planet-level units/s² (as the lava's). */
  gravity: number;
  /** Drag on the particles that fly ballistically, 1/s (0 in vacuum). */
  drag: number;
  /** Sea-level radius, planet-level units. */
  radius: number;
  /** Relative swing of a moon's output with its orbit (0 on planets): 0.5 makes the brightest 3× the faintest. */
  pulse: number;
  pulsePeriod: number;
  pulsePhase: number;
  vents: GeyserVent[];
}

/** What a body needs for its geysers. */
export interface GeyserBody {
  type: PlanetType | MoonType;
  seed: number;
  style: PlanetStyle;
  /** System units; with it the ground has its craters (gen/craters.ts). */
  radius?: number;
  climate?: ClimateData | null;
  moon: boolean;
}

/** Which geysers a body has, or null for none. */
export function geyserKind(type: PlanetType | MoonType, climate: ClimateData | null | undefined): GeyserKind | null {
  if (!climate || type === 'gas') return null;
  const { heatFlow, waterState, pressure } = climate;
  if (waterState === 'liquid' && (type === 'terran' || type === 'ocean' || type === 'desert'))
    return heatFlow >= STEAM_MIN_HEAT_FLOW ? 'steam' : null;
  if (waterState === 'ice' && (type === 'ice' || type === 'ocean' || type === 'terran'))
    return heatFlow >= CRYO_MIN_HEAT_FLOW ? 'cryo' : null;
  if (waterState === 'none' && (type === 'lava' || type === 'barren') && heatFlow >= SULPHUR_MIN_HEAT_FLOW && pressure < SULPHUR_MAX_PRESSURE)
    return 'sulphur';
  if (FUMAROLE_TYPES.includes(type) && pressure < SULPHUR_MAX_PRESSURE && heatFlow >= FUMAROLE_MIN_HEAT_FLOW) return 'fumarole';
  return null;
}

/** How busy a body's fumaroles are, 0–1: its heat flow on a log scale from FUMAROLE_MIN_HEAT_FLOW to FUMAROLE_FULL_HEAT_FLOW. */
export function fumaroleHeat(heatFlow: number): number {
  const t = Math.log(heatFlow / FUMAROLE_MIN_HEAT_FLOW) / Math.log(FUMAROLE_FULL_HEAT_FLOW / FUMAROLE_MIN_HEAT_FLOW);
  return Math.min(1, Math.max(0, t));
}

/** How active a body's geysers are, 0–1, from its internal heat (climate.geothermal) over its kind's range. */
export function geyserHeat(kind: GeyserKind, geothermal: number): number {
  // The ranges each kind's bodies span (measured over 1500 systems, see geysers.md).
  const [lo, hi] = kind === 'steam' ? [0.25, 0.44] : kind === 'cryo' ? [0.1, 0.7] : [0.8, 1];
  return Math.min(1, Math.max(0, (geothermal - lo) / (hi - lo)));
}

/** The arcs' gravity for a body of `g` (as gen/lavaActivity.ts). */
export function arcGravity(g: number): number {
  return LAVA_GRAVITY * Math.sqrt(Math.max(MIN_ARC_GRAVITY, g));
}

/**
 * A body's geysers, or null if it has none. `radius` is its sea-level
 * radius in planet-level units and `reliefScale` the planet level's
 * exaggeration of the terrain (vents sit on the ground as it is drawn).
 */
export function geyserActivity(body: GeyserBody, radius: number, reliefScale = 1): GeyserActivity | null {
  const kind = geyserKind(body.type, body.climate);
  if (!kind || !body.climate) return null;
  const climate = body.climate;
  const rng = new Rng(hashSeed(body.seed, 'geysers'));
  const heat = kind === 'fumarole' ? fumaroleHeat(climate.heatFlow) : geyserHeat(kind, climate.geothermal);
  const spec = GEYSER_SPECS[kind];
  const g = Math.max(MIN_ARC_GRAVITY, climate.gravity);
  const gravity = arcGravity(climate.gravity);
  const air = climate.pressure >= WIND_MIN_PRESSURE;
  const drag = kind === 'cryo' && air ? CRYO_AIR_DRAG : kind === 'steam' ? 0.15 : 0;
  const windAngle = rng.range(0, Math.PI * 2);
  const windSpeed = air ? rng.range(WIND_SPEED[0], WIND_SPEED[1]) : 0;

  const dirs = placeVents(rng, kind, body, heat);
  const vents = dirs.map((dir): GeyserVent => {
    let peak: number;
    if (kind === 'sulphur') {
      const [lo, hi] = rng.chance(IO_PLUMES.peleShare) ? IO_PLUMES.pele : IO_PLUMES.prometheus;
      peak = rng.range(lo, hi) * radius;
    } else {
      peak = (PEAK_1G[kind] / Math.sqrt(g)) * rng.range(0.6, 1);
    }
    peak = Math.min(Math.max(peak, MIN_PEAK), MAX_PEAK_FRACTION[kind] * radius);
    const w = tangent(dir, windAngle + rng.range(-0.3, 0.3));
    const ws = windSpeed * rng.range(0.8, 1.2);
    return {
      dir,
      base: groundRadius(dir, body, radius, reliefScale),
      period: rng.range(spec.period[0], spec.period[1]),
      duty: rng.range(spec.duty[0], spec.duty[1]),
      peak,
      speed: launchSpeed(peak, drag, gravity),
      wind: [w[0] * ws, w[1] * ws, w[2] * ws],
    };
  });
  return {
    kind,
    heat,
    gravity,
    drag,
    radius,
    pulse: kind === 'cryo' && body.moon ? 0.5 : 0,
    pulsePeriod: 30,
    pulsePhase: rng.range(0, 1),
    vents,
  };
}

/**
 * Radius of the ground at unit direction `dir` as the planet level draws it
 * (world/planetGeometry.ts, createTerrainGeometry): land raised by its
 * height, the sea (or ice sheet) at `radius`; its craters too when the
 * body's own `radius` (system units) is given.
 */
export function groundRadius(
  dir: Vec3Tuple,
  body: { seed: number; style: PlanetStyle; radius?: number; climate?: Pick<ClimateData, 'gravity'> | null },
  radius: number,
  reliefScale = 1,
): number {
  const { seed, style } = body;
  const noise = body.radius === undefined ? detailedTerrain : surfaceNoise({ seed, style, radius: body.radius, climate: body.climate }, true);
  const n = noise(dir[0], dir[1], dir[2], seed);
  const base = style.sea === null ? -1 : style.seaLevel;
  if (style.sea !== null && n < base) return radius;
  return radius * (1 + style.relief * reliefScale * landElevation(style, (n - base) / (1 - base)));
}

/** True if `dir` is dry land (a little clear of the shore) on a body with a sea. */
export function onLand(dir: Vec3Tuple, seed: number, style: PlanetStyle): boolean {
  return style.sea === null || detailedTerrain(dir[0], dir[1], dir[2], seed) >= style.seaLevel + 0.04;
}

function placeVents(rng: Rng, kind: GeyserKind, body: GeyserBody, heat: number): Vec3Tuple[] {
  const { seed, style } = body;
  const out: Vec3Tuple[] = [];
  if (kind === 'steam') {
    // Geyser fields on land: 1–3, of 3–5 vents a few units apart.
    const fields = 1 + Math.round(2 * heat);
    for (let f = 0, tries = 0; f < fields && tries < 200; tries++) {
      const centre = randomDirection(rng);
      if (!onLand(centre, seed, style)) continue;
      f++;
      const count = rng.int(3, 5);
      for (let v = 0, t = 0; v < count && t < 40; t++) {
        const dir = offset(centre, rng.range(0, Math.PI * 2), rng.range(0.005, 0.03));
        if (onLand(dir, seed, style)) {
          out.push(dir);
          v++;
        }
      }
    }
  } else if (kind === 'cryo' && body.moon) {
    // Tiger stripes round the south pole (the spin axis is +y): four parallel cracks, vents along each.
    const pole: Vec3Tuple = [0, -1, 0];
    const turn = rng.range(0, Math.PI);
    const along = tangent(pole, turn);
    const across = tangent(pole, turn + Math.PI / 2);
    const perStripe = 2 + Math.round(heat);
    for (let s = 0; s < TIGER_STRIPES.count; s++) {
      const o = (s - (TIGER_STRIPES.count - 1) / 2) * TIGER_STRIPES.spacing;
      for (let v = 0; v < perStripe; v++) {
        const a = rng.range(-0.5, 0.5) * TIGER_STRIPES.length;
        const t: Vec3Tuple = [along[0] * a + across[0] * o, along[1] * a + across[1] * o, along[2] * a + across[2] * o];
        out.push(expMap(pole, t));
      }
    }
  } else if (kind === 'cryo') {
    // Planets: vents strung along 1–3 cracks anywhere on the ice.
    const cracks = 1 + Math.round(2 * heat);
    for (let c = 0; c < cracks; c++) {
      const centre = randomDirection(rng);
      const heading = rng.range(0, Math.PI * 2);
      const count = rng.int(2, 4);
      for (let v = 0; v < count; v++) out.push(offset(centre, heading, rng.range(-0.12, 0.12)));
    }
  } else if (kind === 'fumarole') {
    // Fissures here and there, each smoking from a row of vents a few units apart.
    const fissures = 2 + Math.round(4 * heat);
    for (let f = 0; f < fissures; f++) {
      const centre = randomDirection(rng);
      const heading = rng.range(0, Math.PI * 2);
      const count = rng.int(3, 5);
      for (let v = 0; v < count; v++) out.push(offset(centre, heading, rng.range(-0.035, 0.035)));
    }
  } else {
    // Io's plumes rise from volcanic centres all over the surface (Io has ~150 active at a time).
    const count = 3 + Math.round(6 * heat);
    for (let v = 0; v < count; v++) out.push(randomDirection(rng));
  }
  return out;
}

/** The point `angle` radians from unit `u` along the great circle heading `heading` (see tangent). */
function offset(u: Vec3Tuple, heading: number, angle: number): Vec3Tuple {
  const t = tangent(u, heading);
  return expMap(u, [t[0] * angle, t[1] * angle, t[2] * angle]);
}

/** Walks from unit `u` along the tangent vector `t` (its length in radians) over the unit sphere. */
function expMap(u: Vec3Tuple, t: Vec3Tuple): Vec3Tuple {
  const a = Math.hypot(t[0], t[1], t[2]);
  if (a < 1e-12) return [u[0], u[1], u[2]];
  const c = Math.cos(a);
  const s = Math.sin(a) / a;
  return [u[0] * c + t[0] * s, u[1] * c + t[1] * s, u[2] * c + t[2] * s];
}

// --- Plume motion ---

/**
 * The two integrals of motion under linear drag `k` (1/s) after `t` seconds:
 * E = (1 − e^(−kt))/k (distance per unit launch speed) and F = (t − E)/k
 * (drop per unit acceleration). Both tend to the drag-free t and t²/2 as
 * k → 0. The shader in planet/Geysers.ts mirrors this.
 */
export function dragIntegrals(k: number, t: number): [number, number] {
  const kt = k * t;
  if (kt < 1e-3) return [t * (1 - kt * (0.5 - kt / 6)), t * t * (0.5 - kt * (1 / 6 - kt / 24))];
  const e = (1 - Math.exp(-kt)) / k;
  return [e, (t - e) / k];
}

/**
 * Height above the vent `t` seconds after launch at `up` units/s under drag
 * `k` and downward acceleration `g` (negative for a buoyant cloud):
 * h = up·E − g·F. With k = 0 this is the ballistic up·t − ½·g·t².
 */
export function plumeHeight(up: number, k: number, g: number, t: number): number {
  const [e, f] = dragIntegrals(k, t);
  return up * e - g * f;
}

/** Highest point of a particle thrown up at `up` against gravity `g` > 0 under drag `k`. */
export function plumePeak(up: number, k: number, g: number): number {
  if (k < 1e-6) return (up * up) / (2 * g);
  // Rises until v = (up + g/k)·e^(−kt) − g/k = 0.
  return plumeHeight(up, k, g, Math.log(1 + (k * up) / g) / k);
}

/** Seconds until a particle thrown up at `up` falls back to launch height (g > 0). */
export function landingTime(up: number, k: number, g: number): number {
  if (k < 1e-6) return (2 * up) / g;
  let lo = Math.log(1 + (k * up) / g) / k;
  let hi = 2 * lo + 1e-3;
  while (plumeHeight(up, k, g, hi) > 0) hi *= 2;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (plumeHeight(up, k, g, mid) > 0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Launch speed that peaks at `peak` under drag `k` and gravity `g`. */
export function launchSpeed(peak: number, k: number, g: number): number {
  let lo = 0;
  let hi = Math.sqrt(2 * g * peak) * 2 + 1;
  while (plumePeak(hi, k, g) < peak) hi *= 2;
  for (let i = 0; i < 50; i++) {
    const mid = 0.5 * (lo + hi);
    if (plumePeak(mid, k, g) < peak) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Where a particle is `t` seconds after launch from the vent at unit `dir`
 * on ground of radius `base`: it rises by plumeHeight, slides round the
 * sphere by side·E along the unit tangent `tangentDir`, and drifts with the
 * `wind` (a tangent velocity) by wind·t.
 */
export function plumePoint(
  dir: Vec3Tuple,
  base: number,
  tangentDir: Vec3Tuple,
  up: number,
  side: number,
  wind: Vec3Tuple,
  k: number,
  g: number,
  t: number,
): Vec3Tuple {
  const [e, f] = dragIntegrals(k, t);
  const h = up * e - g * f;
  const ox = tangentDir[0] * side * e + wind[0] * t;
  const oy = tangentDir[1] * side * e + wind[1] * t;
  const oz = tangentDir[2] * side * e + wind[2] * t;
  const d = Math.hypot(ox, oy, oz);
  const r = base + h;
  if (d < 1e-9) return [dir[0] * r, dir[1] * r, dir[2] * r];
  const angle = d / base;
  const c = Math.cos(angle);
  const s = Math.sin(angle) / d;
  return [(dir[0] * c + ox * s) * r, (dir[1] * c + oy * s) * r, (dir[2] * c + oz * s) * r];
}

// --- Eruptions ---

/** Particle styles: how each one moves and looks (the shader's colour code). */
export type ParticleStyle = 'cryo' | 'puff' | 'droplet' | 'sulphur' | 'smoke' | 'ember' | 'flame';
export const PARTICLE_CODE: Record<ParticleStyle, number> = { cryo: 0, puff: 1, droplet: 2, sulphur: 3, smoke: 4, ember: 5, flame: 6 };

export interface GeyserEvent {
  /** Which vent, and which of its cycles. */
  vent: number;
  cycle: number;
  /** System time the vent starts erupting, and for how long. */
  start: number;
  duration: number;
  /** When its last particle has gone. */
  end: number;
  particles: number;
  /** Seeds the per-particle scatter. */
  seed: number;
}

/** Longest a particle from `activity`'s vent can live, seconds. */
export function maxParticleLife(activity: GeyserActivity, vent: GeyserVent): number {
  if (activity.kind === 'steam') return Math.max(STEAM_PUFF.life[1], landingTime(vent.speed, activity.drag, activity.gravity));
  if (activity.kind === 'fumarole') return Math.max(FUMAROLE_SMOKE.life[1], landingTime(vent.speed, activity.drag, activity.gravity));
  return landingTime(vent.speed, activity.drag, activity.gravity);
}

/** Longest an event of a vent lasts, from its start to its last particle. */
function eventSpan(activity: GeyserActivity, vent: GeyserVent): number {
  return vent.period * vent.duty * 1.1 + maxParticleLife(activity, vent);
}

/** Most particles one of `vent`'s events throws. */
function maxEventParticles(activity: GeyserActivity, vent: GeyserVent): number {
  return Math.ceil(GEYSER_SPECS[activity.kind].rate * (0.6 + 0.4 * activity.heat) * vent.period * vent.duty * 1.1);
}

/** The eruption of vent `vent` in its cycle `cycle`, or null if it skips that one. */
export function geyserEvent(activity: GeyserActivity, bodySeed: number, vent: number, cycle: number): GeyserEvent | null {
  const v = activity.vents[vent];
  if (!v) return null;
  const rng = new Rng(hashSeed(bodySeed, 'geyser', vent, cycle));
  // Hotter bodies miss fewer eruptions.
  if (!rng.chance(0.7 + 0.3 * activity.heat)) return null;
  const start = (cycle + rng.range(0, 0.25)) * v.period;
  const duration = v.period * v.duty * rng.range(0.75, 1.1);
  const rate = GEYSER_SPECS[activity.kind].rate * (0.6 + 0.4 * activity.heat);
  return {
    vent,
    cycle,
    start,
    duration,
    end: start + duration + maxParticleLife(activity, v),
    particles: Math.max(1, Math.round(rate * duration)),
    seed: rng.int(0, 2 ** 31),
  };
}

/** A moon's plume output at `time`, relative (1 on average; 1 ± pulse over its orbit). */
export function geyserPulse(activity: GeyserActivity, time: number): number {
  return 1 + activity.pulse * Math.sin(2 * Math.PI * (time / activity.pulsePeriod + activity.pulsePhase));
}

export interface GeyserParticle {
  style: ParticleStyle;
  /** Launch time and lifetime, seconds. */
  start: number;
  life: number;
  up: number;
  side: number;
  tangent: Vec3Tuple;
  /** Drag (1/s) and downward acceleration (negative rises). */
  drag: number;
  gravity: number;
  /** Size at launch (units) and growth over its life (× at the end). */
  size: number;
  growth: number;
  /** Opacity weight, 0–1. */
  brightness: number;
}

/**
 * Particle `i` of `event` from `rng` (seeded with event.seed and drawn in
 * order): cryo grains and Io's dust fly ballistically (with drag where
 * there's air) and fade as they land; steam throws droplets that fall back
 * and a cloud of puffs that stop, rise and drift.
 */
export function geyserParticle(rng: Rng, activity: GeyserActivity, event: GeyserEvent, i: number): GeyserParticle {
  const vent = activity.vents[event.vent]!;
  const spec = GEYSER_SPECS[activity.kind];
  // Spread evenly over the eruption, with a little jitter.
  const start = event.start + event.duration * ((i + rng.next()) / event.particles);
  const baseSize = Math.max(spec.minSize, spec.size * vent.peak);
  const tilt = spec.spread * Math.sqrt(rng.next());
  const dir = tangent(vent.dir, rng.range(0, Math.PI * 2));
  // The column is strongest at the start of an eruption and weakens towards its end.
  const phase = (start - event.start) / event.duration;
  const strength = 1 - 0.3 * phase;
  const pulse = geyserPulse(activity, start) / (1 + activity.pulse);

  if (activity.kind === 'steam' && rng.chance(STEAM_PUFF.share)) {
    // Puffs: the jet stalls at about the peak (up/k), then the cloud rises and drifts.
    const up = vent.peak * STEAM_PUFF.drag * strength * rng.range(0.6, 1);
    return {
      style: 'puff',
      start,
      life: rng.range(STEAM_PUFF.life[0], STEAM_PUFF.life[1]),
      up: up * Math.cos(tilt),
      side: up * Math.sin(tilt),
      tangent: dir,
      drag: STEAM_PUFF.drag,
      gravity: -STEAM_PUFF.buoyancy,
      size: baseSize * rng.range(0.7, 1.2),
      growth: spec.growth,
      brightness: rng.range(0.6, 1),
    };
  }
  if (activity.kind === 'fumarole') {
    const roll = rng.next();
    if (roll < FUMAROLE_SMOKE.share + FUMAROLE_FLAME.share) {
      // Smoke billowing up and hanging, or a lick of flame at the mouth.
      const flame = roll >= FUMAROLE_SMOKE.share;
      const m = flame ? FUMAROLE_FLAME : FUMAROLE_SMOKE;
      const up = vent.peak * m.drag * strength * (flame ? rng.range(0.12, 0.3) : rng.range(0.5, 1));
      return {
        style: flame ? 'flame' : 'smoke',
        start,
        life: rng.range(m.life[0], m.life[1]),
        up: up * Math.cos(tilt),
        side: up * Math.sin(tilt),
        tangent: dir,
        drag: m.drag,
        gravity: -m.buoyancy,
        size: baseSize * (flame ? rng.range(0.6, 1) : rng.range(0.7, 1.2)),
        growth: flame ? 1.8 : spec.growth,
        brightness: rng.range(0.6, 1),
      };
    }
    // Embers: thrown on short arcs, glowing and cooling as they fall.
    const speed = vent.speed * strength * rng.range(0.25, 0.7);
    const t = Math.min(1, tilt * 1.8);
    const up = speed * Math.cos(t);
    return {
      style: 'ember',
      start,
      life: landingTime(up, activity.drag, activity.gravity),
      up,
      side: speed * Math.sin(t),
      tangent: dir,
      drag: activity.drag,
      gravity: activity.gravity,
      size: baseSize * rng.range(0.12, 0.2),
      growth: 0.7,
      brightness: rng.range(0.6, 1),
    };
  }
  const style: ParticleStyle = activity.kind === 'steam' ? 'droplet' : activity.kind;
  // Most grains are slower than the fastest: a filled fan rather than a shell.
  const speed = vent.speed * strength * rng.range(0.45, 1);
  const up = speed * Math.cos(tilt);
  return {
    style,
    start,
    life: landingTime(up, activity.drag, activity.gravity),
    up,
    side: speed * Math.sin(tilt),
    tangent: dir,
    drag: activity.drag,
    gravity: activity.gravity,
    size: (style === 'droplet' ? 0.35 : 1) * baseSize * rng.range(0.6, 1.3),
    growth: style === 'droplet' ? 1 : spec.growth,
    brightness: pulse * rng.range(0.6, 1),
  };
}

/**
 * Caches the eruptions under way (or about to start) on a body, spawning
 * each vent's next cycle as its time comes; a jump of the clock (back, or
 * far ahead) rebuilds it from the events alive then. `advance` reports new
 * events so a view writes their particles once.
 */
export class GeyserSchedule {
  /** Spawned events that haven't ended. */
  readonly events: GeyserEvent[] = [];
  private readonly next: number[];
  private last = Number.NaN;

  constructor(
    readonly activity: GeyserActivity,
    readonly seed: number,
    private readonly maxStep = 2,
    private readonly maxBack = 0.1,
  ) {
    this.next = activity.vents.map(() => 0);
  }

  advance(time: number, onSpawn?: (event: GeyserEvent) => void): boolean {
    const jumped = this.jumps(time);
    const { vents } = this.activity;
    if (jumped) {
      this.events.length = 0;
      for (let v = 0; v < vents.length; v++) this.next[v] = Math.floor((time - eventSpan(this.activity, vents[v]!)) / vents[v]!.period);
    }
    this.last = time;
    let kept = 0;
    for (const e of this.events) if (e.end > time) this.events[kept++] = e;
    this.events.length = kept;
    for (let v = 0; v < vents.length; v++) {
      const { period } = vents[v]!;
      let cycle = this.next[v]!;
      for (; cycle * period <= time; cycle++) {
        const event = geyserEvent(this.activity, this.seed, v, cycle);
        if (event && event.end > time) {
          this.events.push(event);
          onSpawn?.(event);
        }
      }
      this.next[v] = cycle;
    }
    return jumped;
  }

  /** True if moving to `time` would be a jump (a rebuild from the events alive then). */
  jumps(time: number): boolean {
    return !(time >= this.last - this.maxBack && time - this.last <= this.maxStep);
  }
}

/**
 * Most particles a body's spawned events can hold at once (an upper bound,
 * for sizing a pool): an event is spawned when its cycle opens, up to a
 * quarter period before it starts, and held until its last particle has gone.
 */
export function maxGeyserParticles(activity: GeyserActivity): number {
  let n = 0;
  for (const vent of activity.vents) {
    const held = eventSpan(activity, vent) + 0.25 * vent.period;
    n += (Math.ceil(held / vent.period) + 1) * maxEventParticles(activity, vent);
  }
  return n;
}

/** HUD wording for a body's geysers. */
export function describeGeysers(kind: GeyserKind): string {
  return kind === 'cryo' ? 'cryogeysers' : kind === 'steam' ? 'steam geysers' : kind === 'fumarole' ? 'smoking vents' : 'sulphur plumes';
}
