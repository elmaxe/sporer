# Distances on the galaxy map

Issue #154 (and #55): the line from the ship to a star on the galaxy map, and the tooltip, give the distance in light years, astronomical units and kilometres. This note pins the units and the map's scale. Code: `src/galaxy/distance.ts`, `LIGHT_YEARS_PER_UNIT` in `src/gen/galaxy.ts`; tests: `tests/distance.test.ts`.

## Sources (read 2026-10-08)

| Quantity | Source | Value as printed |
|---|---|---|
| Light year | [Light-year](https://en.wikipedia.org/wiki/Light-year), citing the IAU ("Measuring the Universe: The IAU and Astronomical Units") and the IAU (1976) System of Astronomical Constants | "equal to exactly 9,460,730,472,580.8 km"; "the product of the Julian year (365.25 days …) and the speed of light (299792458 m/s)"; "≈ 63241.077 astronomical units" |
| Astronomical unit | IAU 2012 Resolution B2, as quoted in [Astronomical unit](https://en.wikipedia.org/wiki/Astronomical_unit) | "re-defined to be a conventional unit of length equal to exactly 149,597,870,700 metres" |
| The map's scale | `docs/research/nebulas.md` (Milky Way D25 diameter 26.8 kpc = 87,400 ly, Goodwin et al.) | the map's radius (1000 units) is 43,700 ly: **1 unit = 43.7 ly** |

## Measured

Computed with `node` from the exact definitions (c = 299,792.458 km/s, Julian year = 365.25 × 86,400 s, au = 149,597,870.7 km):

| | Computed | Source |
|---|---|---|
| km per light year | 9,460,730,472,580.8 | 9,460,730,472,580.8 (exact) |
| AU per light year | 63,241.077 | ≈ 63,241.077 |

On the map:

| Distance | Light years | AU | km |
|---|---|---|---|
| A neighbouring star (~25 units) | 1,093 | 69.1 million | 1.03 × 10¹⁶ |
| Across the whole map (2000 units) | 87,400 | 5.53 billion | 8.27 × 10¹⁷ |

The map is stylised: its 4000 stars stand for the Milky Way's ~200 billion, so neighbours are ~1,100 ly apart, far more than between real neighbouring stars. The distances shown are the map's own, measured in its units at 43.7 ly each, not real stellar spacings.

## How it reads

`describeDistance(units)`: "1,093 light years · 69.1 million AU · 1.03 × 10¹⁶ km". Light years to one decimal under 100 and whole (grouped) above; AU to three significant figures in words (million, billion), grouped below a million; km in scientific notation to three significant figures. The distance leaves out the ship's hover height over its star (`GalaxyShip.distanceTo`): docked, it's star to star; flying, it's what's still to fly.
