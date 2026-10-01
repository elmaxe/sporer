/*
 * Layout of the system map (see SystemMap): the star(s) cut off by the left
 * edge (none round a rogue planet), the planets in a row to the right in
 * order of distance, and each planet's moons stacked above it, nearest first. Pure maths in CSS pixels,
 * no DOM, so it can be unit-tested.
 *
 * Sizes are not to scale: a disc's radius grows with the square root of the
 * body's game radius (itself already √-compressed, see gen/planets.ts), so a
 * gas giant is about 4× a dwarf instead of 17× and small moons stay visible.
 */

export interface MapBodyInput {
  /** Game radius. */
  radius: number;
  /** Outer ring radius in game units, or null. */
  ringOuter?: number | null;
}

export interface MapPlanetInput extends MapBodyInput {
  /** Nearest first. */
  moons: readonly MapBodyInput[];
}

export interface MapLayoutOptions {
  /** CSS px. */
  width: number;
  /** The map never grows taller than this; discs shrink instead. */
  maxHeight: number;
  /** Radii of the star(s), largest first matters only for their relative sizes. */
  stars: readonly number[];
}

export interface MapDisc {
  x: number;
  y: number;
  r: number;
}

export interface MapPlanetDisc extends MapDisc {
  /** Outer ring radius in px (0 without rings). */
  ring: number;
  moons: MapDisc[];
}

export interface SystemMapLayout {
  width: number;
  height: number;
  /** The planets' centre line. */
  axisY: number;
  /** How far the star's disc reaches into the map. */
  sunEdge: number;
  stars: MapDisc[];
  planets: MapPlanetDisc[];
  /** Where the numerals under the planets sit (their top). */
  labelY: number;
}

/** Tunables of the layout, in disc units (√ game radius) or CSS px. */
export const mapLayoutParams = {
  /** Space between planet columns, disc units. */
  gap: 1.3,
  /** Space between a planet and its first moon, and between moons, disc units. */
  moonGap: 0.45,
  /** The ring ellipse's height over its width (seen from a little above the ecliptic). */
  ringTilt: 0.3,
  /** Largest disc scale, px per disc unit (a system with few planets doesn't blow them up). */
  maxScale: 5,
  /** Smallest planet and moon radius, px. */
  minPlanet: 3,
  minMoon: 1.8,
  /** How far the star reaches into the map, as a fraction of its width. */
  sunFraction: 0.1,
  minSun: 26,
  maxSun: 64,
  padding: 8,
  /** Height of the numerals' row under the planets, px. */
  labelHeight: 14,
  minHeight: 84,
};

/** A body's disc size in disc units. */
export function discUnits(radius: number): number {
  return Math.sqrt(Math.max(radius, 0));
}

export function layoutSystemMap(planets: readonly MapPlanetInput[], options: MapLayoutOptions): SystemMapLayout {
  const p = mapLayoutParams;
  const { width } = options;
  // A rogue planet's map has no star: the planets' row starts at the left padding.
  const sunEdge = options.stars.length > 0 ? clamp(width * p.sunFraction, p.minSun, p.maxSun) : p.padding;

  // Column widths, and heights above and below the centre line, in disc units.
  const columns = planets.map((planet) => {
    const r = discUnits(planet.radius);
    const ring = planet.ringOuter ? (r * planet.ringOuter) / planet.radius : 0;
    const moons = planet.moons.map((m) => discUnits(m.radius));
    const half = Math.max(r, ring, ...moons);
    const below = Math.max(r, ring * p.ringTilt);
    const above = moons.reduce((h, m) => h + p.moonGap + 2 * m, below);
    return { r, ring, moons, half, above, below };
  });

  const across = columns.reduce((w, c) => w + 2 * c.half + p.gap, 0);
  const tallest = columns.reduce((h, c) => Math.max(h, c.above + c.below), 0);
  const room = width - sunEdge - p.padding;
  const heightRoom = options.maxHeight - 2 * p.padding - p.labelHeight;
  const scale = Math.min(p.maxScale, across > 0 ? room / across : p.maxScale, tallest > 0 ? heightRoom / tallest : p.maxScale);

  // Measured in px from the centre line; small discs are enlarged to their minimum.
  const measured = columns.map((c) => {
    const r = Math.max(c.r * scale, p.minPlanet);
    const ring = c.ring * scale;
    const moons = c.moons.map((m) => Math.max(m * scale, p.minMoon));
    const half = Math.max(r, ring, ...moons);
    const below = Math.max(r, ring * p.ringTilt);
    const above = moons.reduce((h, m) => h + p.moonGap * scale + 2 * m, below);
    return { r, ring, moons, half, above, below };
  });
  const maxAbove = measured.reduce((h, c) => Math.max(h, c.above), 0);
  const maxBelow = measured.reduce((h, c) => Math.max(h, c.below), 0);
  const content = maxAbove + maxBelow + p.labelHeight;
  const height = Math.max(p.minHeight, Math.ceil(content + 2 * p.padding));
  const axisY = p.padding + maxAbove + (height - 2 * p.padding - content) / 2;

  // Spread the columns over the width: what is left over goes into the gaps.
  const used = measured.reduce((w, c) => w + 2 * c.half, 0);
  const spacing = measured.length > 0 ? (room - used) / measured.length : 0;
  let x = sunEdge + spacing / 2;
  const discs = measured.map((c): MapPlanetDisc => {
    const cx = x + c.half;
    x += 2 * c.half + spacing;
    let top = axisY - c.below;
    const moons = c.moons.map((r) => {
      top -= p.moonGap * scale;
      const y = top - r;
      top -= 2 * r;
      return { x: cx, y, r };
    });
    return { x: cx, y: axisY, r: c.r, ring: c.ring, moons };
  });

  return {
    width,
    height,
    axisY,
    sunEdge,
    stars: layoutStars(options.stars, sunEdge, height),
    planets: discs,
    labelY: axisY + maxBelow + 2,
  };
}

/** The star cut off by the left edge; a binary pair one above the other, sized by their radii. */
function layoutStars(radii: readonly number[], edge: number, height: number): MapDisc[] {
  if (radii.length === 0) return [];
  if (radii.length === 1) {
    const r = Math.max(height * 1.15, edge * 2);
    return [{ x: edge - r, y: height / 2, r }];
  }
  const big = Math.max(...radii);
  return radii.map((radius, i) => {
    const r = Math.max(height * 0.62, edge * 1.6) * Math.max(0.6, Math.sqrt(radius / big));
    const reach = edge * (i === 0 ? 1 : 0.8);
    return { x: reach - r, y: height * (i === 0 ? 0.3 : 0.76), r };
  });
}

/**
 * Where a distance from the star falls along the map: at the star's edge for
 * `inner`, at each planet's column at its orbit radius, linear in between,
 * and on beyond the last planet at the same pace up to the right edge.
 */
export function distanceToMapX(
  layout: SystemMapLayout,
  inner: number,
  orbits: readonly number[],
  distance: number,
): number {
  let d0 = inner;
  let x0 = layout.sunEdge;
  // The pace of the last stretch, carried on past the last planet.
  let pace = 0.1;
  for (let i = 0; i < orbits.length; i++) {
    const d1 = orbits[i]!;
    const x1 = layout.planets[i]!.x;
    pace = (x1 - x0) / Math.max(d1 - d0, 1e-6);
    if (distance <= d1) return x0 + Math.max(distance - d0, 0) * pace;
    d0 = d1;
    x0 = x1;
  }
  return Math.min(layout.width - END_MARGIN, x0 + Math.max(distance - d0, 0) * pace);
}

/** The farthest right the ship's marker goes, px from the right edge. */
const END_MARGIN = 6;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
