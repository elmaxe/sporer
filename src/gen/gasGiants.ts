import { hashSeed, Rng } from './rng';

/*
 * The cloud tops of gas and ice giants as data: belts and zones, the jets
 * between them, the polar regions and the storms. Pure and seeded from the
 * planet's seed (its own stream, so nothing else generated changes); the view
 * (world/gasLook.ts) draws it. Numbers come from Jupiter, Saturn, Uranus and
 * Neptune: see docs/research/gas-giants.md.
 */

const DEG = Math.PI / 180;

/** One band of cloud between two latitudes (radians, south < north). */
export interface GasBand {
  south: number;
  north: number;
  /** Bright zone (true) or dark belt. */
  zone: boolean;
  /** Where its colour sits on the palette, 0 (darkest) to 1 (brightest). */
  tone: number;
}

/** A zonal jet: a Gaussian bump in the drift at `lat` (radians). */
export interface GasJet {
  lat: number;
  /** Half-width (radians). */
  width: number;
  /** Drift as a fraction of the body's spin (+ = with the spin, prograde). */
  speed: number;
}

export type GasStormKind = 'red' | 'white' | 'dark' | 'streak';

/** An oval vortex (or, for `streak`, a long bright cloud). */
export interface GasStorm {
  kind: GasStormKind;
  lat: number;
  /** Longitude at time 0 (radians); it drifts with its latitude's wind (gasDrift). */
  lon: number;
  /** Half-length east-west (radians). */
  radius: number;
  /** East-west length over north-south. */
  aspect: number;
  /** +1 or -1: which way it turns (anticyclones turn against the hemisphere's cyclones). */
  spin: number;
}

export interface GasLayout {
  ice: boolean;
  /** 0 = Jupiter-like (many narrow, contrasty bands) … 1 = Saturn-like (a broad equatorial band, muted). */
  saturn: number;
  /** South pole to north pole, no gaps. */
  bands: GasBand[];
  jets: GasJet[];
  /** How far band tones spread round the palette's middle (1: the whole palette). */
  contrast: number;
  /** |latitude| (radians) past which the bands break down into a mottled polar region (π/2: none). */
  polar: number;
  /** Circumpolar cyclones round the north and south poles (0: none). */
  polarCyclones: [north: number, south: number];
  /** A polygonal jet round the north pole (Saturn's hexagon), or null. */
  polygon: { sides: number; lat: number } | null;
  /** An ice giant's bright polar hood: the latitude of its edge (radians; negative: round the south pole), or null. */
  hood: number | null;
  storms: GasStorm[];
}

/**
 * Jupiter's jets relative to its spin (docs/research/gas-giants.md): the
 * equatorial rotation speed is 2π·71 492 km / 9.9 h = 12.6 km/s, so
 * 140 m/s prograde jets are 1.1% of it, 60 m/s retrograde ones 0.48%.
 */
const JUPITER_PROGRADE = 0.011;
const JUPITER_RETROGRADE = 0.0048;
/** Saturn's 450–500 m/s equatorial jet over its 9.83 km/s equator (2π·60 268 km / 10.7 h): 4.6–5.1%. */
const SATURN_EQUATOR = 0.048;
/** Uranus: −50 m/s at the equator, +250 m/s jets, over 2.59 km/s (2π·25 559 km / 17.2 h). */
const URANUS = { equator: -0.019, jets: 0.096 };
/** Neptune: −400 m/s at the equator, +270 m/s jets, over 2.68 km/s (2π·24 764 km / 16.1 h). */
const NEPTUNE = { equator: -0.15, jets: 0.10 };

/** The cloud tops of a gas giant (`ice` = an ice giant) with this seed. */
export function generateGasLayout(seed: number, ice: boolean): GasLayout {
  const rng = new Rng(hashSeed(seed, 'gasLayout'));
  return ice ? iceLayout(rng) : gasLayout(rng);
}

function gasLayout(rng: Rng): GasLayout {
  // Most look like Jupiter, some like Saturn, and the rest between.
  const saturn = rng.weighted<number>([
    [rng.range(0, 0.25), 55],
    [rng.range(0.75, 1), 25],
    [rng.range(0.25, 0.75), 20],
  ]);
  // Jupiter's banding breaks down at 64–68° planetocentric; Saturn's bands run up to its hexagon at ~78°.
  const polar = lerp(rng.range(64, 68), rng.range(74, 80), saturn) * DEG;
  // Jupiter's equatorial zone is about one band (~10°) wide; Saturn's equatorial jet spans ±35°.
  const equator = lerp(rng.range(5, 8), rng.range(25, 35), saturn) * DEG;
  // Jupiter: 6–7 jets each side (one band per jet); Saturn fewer, broader ones.
  const perSide = (): number => Math.max(3, Math.round(lerp(rng.int(6, 7), rng.int(3, 4), saturn)));
  const bands: GasBand[] = [];
  const jets: GasJet[] = [];
  const north = hemisphere(rng, equator, polar, perSide(), saturn);
  const south = hemisphere(rng, equator, polar, perSide(), saturn);
  // South pole → north pole.
  for (let i = south.length - 1; i >= 0; i--) {
    const b = south[i]!;
    bands.push({ ...b, south: -b.north, north: -b.south });
  }
  bands.push({ south: -equator, north: equator, zone: true, tone: rng.range(0.75, 0.95) });
  bands.push(...north);
  // Jets at every band edge: prograde on a belt's equatorward edge, retrograde on its poleward one.
  const prograde = JUPITER_PROGRADE * rng.range(0.8, 1.3);
  const retrograde = JUPITER_RETROGRADE * rng.range(0.8, 1.2);
  for (let i = 1; i < bands.length; i++) {
    const below = bands[i - 1]!;
    const above = bands[i]!;
    const lat = below.north;
    // A dark belt on the poleward side: its equatorward edge.
    const poleward = lat >= 0 ? above : below;
    const width = 0.25 * Math.min(below.north - below.south, above.north - above.south);
    // Jets weaken towards the poles (Jupiter's last one, where the bands break down, is ~40 m/s).
    const fade = Math.cos(lat);
    jets.push({ lat, width, speed: (poleward.zone ? -retrograde : prograde) * fade });
  }
  // The equatorial super-rotation: Jupiter's ~1% to Saturn's ~5%.
  jets.push({ lat: 0, width: equator * 0.8, speed: lerp(prograde, SATURN_EQUATOR * rng.range(0.9, 1.05), saturn) });

  const storms: GasStorm[] = [];
  // A great spot in the tropics (the Great Red Spot sits at 22°S, 16 500–23 000 km long over a 71 492 km radius: 13–19°).
  if (rng.chance(lerp(0.6, 0.15, saturn))) {
    const lat = rng.sign() * rng.range(15, 27) * DEG;
    storms.push({ kind: 'red', lat, lon: rng.range(-Math.PI, Math.PI), radius: rng.range(6.5, 9.5) * DEG, aspect: rng.range(1.6, 2.1), spin: anticyclone(lat) });
  }
  // White ovals at mid-latitudes.
  const ovals = Math.round(rng.range(2, 8) * (1 - 0.7 * saturn));
  for (let i = 0; i < ovals; i++) {
    const lat = rng.sign() * rng.range(25, Math.min(55, polar / DEG - 8)) * DEG;
    storms.push({ kind: 'white', lat, lon: rng.range(-Math.PI, Math.PI), radius: rng.range(1.5, 3.2) * DEG, aspect: rng.range(1.2, 1.7), spin: anticyclone(lat) });
  }
  return {
    ice: false,
    saturn,
    bands,
    jets,
    contrast: lerp(rng.range(0.85, 1), rng.range(0.45, 0.65), saturn),
    polar,
    // Jupiter: 8 cyclones round the north pole and 5 round the south, each round a central one.
    polarCyclones: saturn < 0.6 ? [rng.int(5, 9), rng.int(4, 8)] : [0, 0],
    // Saturn's hexagon: a six-sided jet at ~78°N.
    polygon: saturn >= 0.6 && rng.chance(0.6) ? { sides: rng.weighted([[6, 3], [5, 1], [7, 1]]), lat: polar } : null,
    hood: null,
    storms,
  };
}

/** One hemisphere's bands poleward of the equatorial zone, as |latitudes|, equator first; alternating belt, zone. */
function hemisphere(rng: Rng, equator: number, polar: number, count: number, saturn: number): GasBand[] {
  const widths = Array.from({ length: count }, () => rng.range(0.7, 1.3));
  const total = widths.reduce((a, b) => a + b, 0);
  const bands: GasBand[] = [];
  let lat = equator;
  for (let i = 0; i < count; i++) {
    const north = i === count - 1 ? Math.PI / 2 : lat + ((polar - equator) * widths[i]!) / total;
    const zone = i % 2 === 1;
    // Saturn's belts and zones differ less: tones nearer the middle.
    const tone = zone ? rng.range(0.6, 0.95) : rng.range(0.05, 0.4 + 0.2 * saturn);
    bands.push({ south: lat, north, zone, tone });
    lat = north;
  }
  return bands;
}

function iceLayout(rng: Rng): GasLayout {
  // Uranus-like (narrow, slow equatorial jet, ±20°) to Neptune-like (wide and fast, ±50°).
  const neptune = rng.range(0, 1);
  const equator = lerp(20, 50, neptune) * DEG;
  const bands: GasBand[] = [];
  // A few broad, faint bands each side, then the polar region.
  const perSide = rng.int(2, 3);
  for (const side of [-1, 1]) {
    const hemi: GasBand[] = [];
    let lat = equator;
    for (let i = 0; i < perSide; i++) {
      const north = i === perSide - 1 ? Math.PI / 2 : lat + ((Math.PI / 2 - lat) / (perSide - i)) * rng.range(0.7, 1.1);
      hemi.push({ south: lat, north, zone: i % 2 === 1, tone: rng.range(0.3, 0.75) });
      lat = north;
    }
    if (side < 0) for (let i = hemi.length - 1; i >= 0; i--) bands.push({ ...hemi[i]!, south: -hemi[i]!.north, north: -hemi[i]!.south });
    else {
      bands.push({ south: -equator, north: equator, zone: false, tone: rng.range(0.35, 0.55) });
      bands.push(...hemi);
    }
  }
  const prograde = lerp(URANUS.jets, NEPTUNE.jets, neptune);
  // The prograde jets' latitude isn't in the sources: halfway between the equatorial jet's edge and the pole (stylised).
  const jetLat = (equator + Math.PI / 2) / 2;
  const jetWidth = (Math.PI / 2 - equator) / 3;
  const jets: GasJet[] = [
    { lat: 0, width: equator * 0.7, speed: lerp(URANUS.equator, NEPTUNE.equator, neptune) },
    { lat: jetLat, width: jetWidth, speed: prograde },
    { lat: -jetLat, width: jetWidth, speed: prograde },
  ];
  const storms: GasStorm[] = [];
  // A dark spot like Neptune's Great Dark Spot: ~22°S, 13 000 × 6 600 km over a 24 764 km radius (30° × 15°).
  if (rng.chance(0.5)) {
    const lat = rng.sign() * rng.range(15, 30) * DEG;
    const radius = rng.range(0.5, 1) * 15 * DEG;
    const lon = rng.range(-Math.PI, Math.PI);
    storms.push({ kind: 'dark', lat, lon, radius, aspect: rng.range(1.7, 2.1), spin: anticyclone(lat) });
    // Its bright companion: methane ice clouds over its poleward edge.
    const companion = lat + Math.sign(lat) * (radius / 2) * 0.9;
    storms.push({ kind: 'streak', lat: companion, lon: lon + rng.range(-0.3, 0.3) * radius, radius: radius * 0.6, aspect: rng.range(3, 5), spin: 0 });
  }
  // Bright methane streaks elsewhere.
  const streaks = rng.int(1, 5);
  for (let i = 0; i < streaks; i++) {
    const lat = rng.sign() * rng.range(10, 55) * DEG;
    storms.push({ kind: 'streak', lat, lon: rng.range(-Math.PI, Math.PI), radius: rng.range(6, 14) * DEG, aspect: rng.range(3, 6), spin: 0 });
  }
  return {
    ice: true,
    saturn: 1,
    bands,
    jets,
    contrast: rng.range(0.35, 0.6),
    polar: Math.PI / 2,
    polarCyclones: [0, 0],
    polygon: null,
    // Uranus's hood: bright from a sharp edge at ~43–45° to the pole, round the pole in spring and summer.
    hood: rng.chance(0.5) ? rng.sign() * rng.range(40, 50) * DEG : null,
    storms,
  };
}

/** Anticyclones turn anticlockwise in the south (the Great Red Spot), clockwise in the north. */
function anticyclone(lat: number): number {
  return lat < 0 ? 1 : -1;
}

/** The zonal drift at `lat` (radians), as a fraction of the body's spin (+ = prograde). */
export function gasDrift(layout: GasLayout, lat: number): number {
  let u = 0;
  for (const j of layout.jets) {
    const x = (lat - j.lat) / j.width;
    u += j.speed * Math.exp(-x * x);
  }
  return u;
}

/** The band at `lat` (radians). */
export function gasBandAt(layout: GasLayout, lat: number): GasBand {
  const { bands } = layout;
  for (const b of bands) if (lat < b.north) return b;
  return bands[bands.length - 1]!;
}

/**
 * The palette position (0 darkest … 1 brightest) at `lat`, the band edges
 * blended over `blend` radians, spread round the middle by the contrast.
 */
export function gasTone(layout: GasLayout, lat: number, blend = 1.2 * DEG): number {
  const { bands } = layout;
  let tone = bands[0]!.tone;
  for (let i = 1; i < bands.length; i++) {
    const edge = bands[i]!.south;
    const t = smoothstep(edge - blend, edge + blend, lat);
    if (t <= 0) break;
    tone += (bands[i]!.tone - tone) * t;
  }
  return 0.5 + (tone - 0.5) * layout.contrast;
}

/** 0 → 1: how close `lat` is to a jet (band edge), for the turbulence there. */
export function gasShear(layout: GasLayout, lat: number): number {
  let s = 0;
  for (const j of layout.jets) {
    if (j.lat === 0) continue;
    const x = (lat - j.lat) / (j.width * 1.2);
    s = Math.max(s, Math.exp(-x * x));
  }
  return s;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
