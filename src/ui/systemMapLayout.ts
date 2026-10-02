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

/** An asteroid belt's column: it sits between the planets by its orbit (a Trojan swarm right after its host). */
export interface MapBeltInput {
  /** Index of the planet the column comes after (−1: before the first). */
  after: number;
  /** Its named asteroids, stacked above the belt's strip like moons. */
  asteroids: readonly MapBodyInput[];
}

export interface MapLayoutOptions {
  /** CSS px. */
  width: number;
  /** The map never grows taller than this; discs shrink instead. */
  maxHeight: number;
  /** Radii of the star(s), largest first matters only for their relative sizes. */
  stars: readonly number[];
  /** Belt columns, in orbit order. */
  belts?: readonly MapBeltInput[];
  /** Rows of planet names under the discs: 2 when neighbours' names would overlap (see staggerLabels). */
  labelRows?: number;
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

/** A belt's column: a speckled strip across the axis, `half` px either side of it, and its asteroids above. */
export interface MapBeltColumn {
  x: number;
  /** Half the strip's width and height, px. */
  halfWidth: number;
  halfHeight: number;
  asteroids: MapDisc[];
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
  belts: MapBeltColumn[];
  /** Where the numerals under the planets sit (their top). */
  labelY: number;
}

/** Tunables of the layout, in disc units (√ game radius) or CSS px. */
export const mapLayoutParams = {
  /** Space between planet columns, disc units. */
  gap: 1.3,
  /** Space between a planet and its first moon, and between moons, disc units. */
  moonGap: 0.45,
  /** A belt's strip: half its width and height, disc units. */
  beltHalfWidth: 0.7,
  beltHalfHeight: 1.6,
  /** Smallest named asteroid radius, px. */
  minAsteroid: 1.6,
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
  /** Each extra row of names (crowded inner planets), px. */
  labelRowHeight: 12,
  minHeight: 84,
};

/** A body's disc size in disc units. */
export function discUnits(radius: number): number {
  return Math.sqrt(Math.max(radius, 0));
}

export function layoutSystemMap(planets: readonly MapPlanetInput[], options: MapLayoutOptions): SystemMapLayout {
  const p = mapLayoutParams;
  const { width } = options;
  const belts = options.belts ?? [];
  // A rogue planet's map has no star: the planets' row starts at the left padding.
  const sunEdge = options.stars.length > 0 ? clamp(width * p.sunFraction, p.minSun, p.maxSun) : p.padding;

  // Columns in orbit order: each planet, with the belts that come after it.
  type Column = { planet: number; belt: number; r: number; ring: number; moons: number[] };
  const order: Column[] = [];
  const beltColumn = (i: number): Column => ({
    planet: -1,
    belt: i,
    r: p.beltHalfHeight,
    ring: 0,
    moons: belts[i]!.asteroids.map((a) => discUnits(a.radius)),
  });
  belts.forEach((b, i) => b.after < 0 && order.push(beltColumn(i)));
  planets.forEach((planet, i) => {
    const r = discUnits(planet.radius);
    order.push({
      planet: i,
      belt: -1,
      r,
      ring: planet.ringOuter ? (r * planet.ringOuter) / planet.radius : 0,
      moons: planet.moons.map((m) => discUnits(m.radius)),
    });
    belts.forEach((b, j) => b.after === i && order.push(beltColumn(j)));
  });

  // Column widths, and heights above and below the centre line, in disc units.
  const columns = order.map((c) => {
    const half = Math.max(c.belt >= 0 ? p.beltHalfWidth : c.r, c.ring, ...c.moons);
    const below = Math.max(c.r, c.ring * p.ringTilt);
    const above = c.moons.reduce((h, m) => h + p.moonGap + 2 * m, below);
    return { half, above, below };
  });

  const across = columns.reduce((w, c) => w + 2 * c.half + p.gap, 0);
  const tallest = columns.reduce((h, c) => Math.max(h, c.above + c.below), 0);
  const room = width - sunEdge - p.padding;
  const labelHeight = p.labelHeight + ((options.labelRows ?? 1) - 1) * p.labelRowHeight;
  const heightRoom = options.maxHeight - 2 * p.padding - labelHeight;
  const scale = Math.min(p.maxScale, across > 0 ? room / across : p.maxScale, tallest > 0 ? heightRoom / tallest : p.maxScale);

  // Measured in px from the centre line; small discs are enlarged to their minimum.
  const measured = order.map((c) => {
    const isBelt = c.belt >= 0;
    const r = isBelt ? c.r * scale : Math.max(c.r * scale, p.minPlanet);
    const ring = c.ring * scale;
    const moons = c.moons.map((m) => Math.max(m * scale, isBelt ? p.minAsteroid : p.minMoon));
    const half = Math.max(isBelt ? p.beltHalfWidth * scale : r, ring, ...moons);
    const below = Math.max(r, ring * p.ringTilt);
    const above = moons.reduce((h, m) => h + p.moonGap * scale + 2 * m, below);
    return { r, ring, moons, half, above, below };
  });
  const maxAbove = measured.reduce((h, c) => Math.max(h, c.above), 0);
  const maxBelow = measured.reduce((h, c) => Math.max(h, c.below), 0);
  const content = maxAbove + maxBelow + labelHeight;
  const height = Math.max(p.minHeight, Math.ceil(content + 2 * p.padding));
  const axisY = p.padding + maxAbove + (height - 2 * p.padding - content) / 2;

  // Spread the columns over the width: what is left over goes into the gaps.
  const used = measured.reduce((w, c) => w + 2 * c.half, 0);
  const spacing = measured.length > 0 ? (room - used) / measured.length : 0;
  let x = sunEdge + spacing / 2;
  const discs: MapPlanetDisc[] = [];
  const beltColumns: MapBeltColumn[] = new Array(belts.length);
  measured.forEach((c, k) => {
    const cx = x + c.half;
    x += 2 * c.half + spacing;
    let top = axisY - c.below;
    const moons = c.moons.map((r) => {
      top -= p.moonGap * scale;
      const y = top - r;
      top -= 2 * r;
      return { x: cx, y, r };
    });
    const column = order[k]!;
    if (column.belt >= 0) beltColumns[column.belt] = { x: cx, halfWidth: p.beltHalfWidth * scale, halfHeight: c.r, asteroids: moons };
    else discs.push({ x: cx, y: axisY, r: c.r, ring: c.ring, moons });
  });

  return {
    width,
    height,
    axisY,
    sunEdge,
    stars: layoutStars(options.stars, sunEdge, height),
    planets: discs,
    belts: beltColumns,
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

/** What the map needs of a belt (gen/belts.ts's BeltData). */
export interface MapBeltSource {
  inner: number;
  trojan: { planet: number } | null;
  asteroids: readonly MapBodyInput[];
}

/** A belt column on the map: the belts it shows (a host's two Trojan swarms share one) and where it goes. */
export interface MapBeltGroup {
  after: number;
  /** Indices into the belts given to `mapBeltGroups`. */
  members: number[];
}

/**
 * The map's belt columns: each belt after the last planet inside it (by
 * orbit radius), a giant's Trojan swarms together right after their host.
 */
export function mapBeltGroups(orbits: readonly number[], belts: readonly MapBeltSource[]): MapBeltGroup[] {
  const groups: MapBeltGroup[] = [];
  belts.forEach((belt, i) => {
    const after = belt.trojan ? belt.trojan.planet : orbits.filter((r) => r < belt.inner).length - 1;
    const shared = belt.trojan ? groups.find((g) => g.after === after && belts[g.members[0]!]!.trojan) : undefined;
    if (shared) shared.members.push(i);
    else groups.push({ after, members: [i] });
  });
  // In orbit order by the planet they follow (sort is stable, so a gap's belts keep their order).
  return groups.sort((a, b) => a.after - b.after);
}

/** The layout's input for those columns. */
export function mapBeltInputs(groups: readonly MapBeltGroup[], belts: readonly MapBeltSource[]): MapBeltInput[] {
  return groups.map((g) => ({ after: g.after, asteroids: g.members.flatMap((m) => belts[m]!.asteroids) }));
}

/**
 * Which row each centred label goes on, left to right: the first row unless
 * it would run into the last label there (within `gap` px), then the second.
 * `xs` are the labels' centres, `widths` their widths, in px.
 */
export function staggerLabels(xs: readonly number[], widths: readonly number[], gap = 4): number[] {
  let end = -Infinity;
  return xs.map((x, i) => {
    const left = x - widths[i]! / 2;
    if (left >= end + gap) {
      end = x + widths[i]! / 2;
      return 0;
    }
    return 1;
  });
}
