/*
 * The Equal Earth map projection (Šavrič, Patterson & Jenny 2018,
 * "The Equal Earth map projection", IJGIS 33(3), doi:10.1080/13658816.2018.1504949):
 * equal-area, with straight parallels and meridians bowed like a globe's
 * outline. The coefficients and the Newton inverse follow d3-geo's
 * `geoEqualEarthRaw`; tests/equalEarth.test.ts checks the round trip and that
 * equal areas on the sphere stay equal on the map.
 *
 * Pure maths on plain numbers. Longitude λ and latitude φ in radians; the
 * map spans x ∈ [-EQUAL_EARTH_WIDTH/2, +EQUAL_EARTH_WIDTH/2] and
 * y ∈ [-EQUAL_EARTH_HEIGHT/2, +EQUAL_EARTH_HEIGHT/2], +y north.
 */

const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;

/** y(θ), the polynomial in the parametric latitude θ. */
function poly(t: number): number {
  const t2 = t * t;
  const t6 = t2 * t2 * t2;
  return t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
}

/** dy/dθ. */
function polyDerivative(t: number): number {
  const t2 = t * t;
  const t6 = t2 * t2 * t2;
  return A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2);
}

/** Full width of the map (the equator, λ from -π to π): ≈ 5.41326. */
export const EQUAL_EARTH_WIDTH = (2 * Math.PI) / (M * A1);
/** Full height of the map (pole to pole): ≈ 2.63473. Width ÷ height ≈ 2.05458. */
export const EQUAL_EARTH_HEIGHT = 2 * poly(Math.PI / 3);

export interface MapPoint {
  x: number;
  y: number;
}

export interface LonLat {
  lon: number;
  lat: number;
}

/** Projects (λ, φ) to map coordinates, written into `out`. */
export function equalEarth(lon: number, lat: number, out: MapPoint): MapPoint {
  const t = Math.asin(M * Math.sin(lat));
  out.x = (lon * Math.cos(t)) / (M * polyDerivative(t));
  out.y = poly(t);
  return out;
}

/**
 * The inverse: map coordinates back to (λ, φ), written into `out`. Returns
 * false (leaving `out` clamped) for points outside the map's outline.
 */
export function equalEarthInverse(x: number, y: number, out: LonLat): boolean {
  const yMax = EQUAL_EARTH_HEIGHT / 2;
  const inside = Math.abs(y) <= yMax;
  const yc = Math.max(-yMax, Math.min(yMax, y));
  let t = yc;
  for (let i = 0; i < 12; i++) {
    const delta = (poly(t) - yc) / polyDerivative(t);
    t -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  const lon = (M * x * polyDerivative(t)) / Math.cos(t);
  out.lat = Math.asin(Math.max(-1, Math.min(1, Math.sin(t) / M)));
  out.lon = Math.max(-Math.PI, Math.min(Math.PI, lon));
  return inside && Math.abs(lon) <= Math.PI;
}

/*
 * Longitude and latitude of a direction in a planet level's body frame: +Y is
 * north on the map (the spin axis), longitude 0 is +Z and grows towards +X.
 */

/** Unit direction (x, y, z) → (λ, φ), written into `out`. */
export function toLonLat(x: number, y: number, z: number, out: LonLat): LonLat {
  out.lon = Math.atan2(x, z);
  out.lat = Math.asin(Math.max(-1, Math.min(1, y / Math.hypot(x, y, z))));
  return out;
}

/** (λ, φ) → unit direction, written into `out` as [x, y, z] at `offset`. */
export function fromLonLat(lon: number, lat: number, out: { [i: number]: number }, offset = 0): void {
  const c = Math.cos(lat);
  out[offset] = c * Math.sin(lon);
  out[offset + 1] = Math.sin(lat);
  out[offset + 2] = c * Math.cos(lon);
}
