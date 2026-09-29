# The Equal Earth map projection

## Question

The planet level's map (`planet/PlanetMap.ts`) draws the whole globe flat, in the Equal Earth projection, as the user asked. It needs the forward formulas (longitude, latitude → map x, y), an inverse (to find the globe point under each map pixel and under a click), and the map's extent.

Precision: the round trip exact to float precision, and equal areas on the globe staying equal on the map (the projection's defining property).

## Sources

All accessed 2026-09-29.

- **Šavrič, Patterson & Jenny (2018), "The Equal Earth map projection"**, International Journal of Geographical Information Science 33(3), doi:10.1080/13658816.2018.1504949. Defines x = 2√3·λ·cos θ / (3·(9A₄θ⁸ + 7A₃θ⁶ + 3A₂θ² + A₁)), y = A₄θ⁹ + A₃θ⁷ + A₂θ³ + A₁θ, with sin θ = (√3/2)·sin φ and A₁ = 1.340264, A₂ = −0.081106, A₃ = 0.000893, A₄ = 0.003796. (Not fetched myself; the formulas are cross-checked against the two sources below.)
- **Wikipedia, "Equal Earth projection"**, https://en.wikipedia.org/wiki/Equal_Earth_projection (read via WebFetch): the same A₁–A₄, "a ratio of 2.05458:1", equatorial semi-axis ≈ 2.70663 and polar ≈ 1.31736 units.
- **d3-geo, `src/projection/equalEarth.js`**, https://raw.githubusercontent.com/d3/d3-geo/main/src/projection/equalEarth.js (fetched). The same coefficients, the forward written as x = λ·cos θ / (M·(A₁ + 3A₂θ² + θ⁶(7A₃ + 9A₄θ²))) with M = √3/2 (2√3/3 = 1/M, so it is the paper's formula), and the inverse: Newton's method on y(θ) (12 iterations at most), then λ = M·x·y′(θ) / cos θ and φ = asin(sin θ / M).

## Measurements

From `src/planet/equalEarth.ts`, checked in `tests/equalEarth.test.ts`:

- Extent: the equator spans 2π/(M·A₁) = 5.4133 units and pole to pole is 2·y(π/3) = 2.6347, so width ÷ height = 2.0546, matching Wikipedia's 2.70663, 1.31736 and 2.05458 : 1.
- The pole lines are 0.59 of the equator's length (the projection is flat-polar, not pointed).
- Round trip over a 7° × 13° grid of the whole globe (±89°): longitude and latitude back to 1e−9 rad.
- Equal area: integrating the map's width over y for latitude bands (0–10°, 30–40°, 60–70°, 80–90°, −45–15°), each band's share of the map equals its share of the sphere, (sin φ₂ − sin φ₁)/2, to 4 decimals.

## Result

- `equalEarth(λ, φ)` and `equalEarthInverse(x, y)` in `planet/equalEarth.ts` (d3's formulas, with an "inside the outline" flag from the inverse). The map's shader repeats the inverse per pixel (6 Newton steps from θ = y: over 1001 latitudes from the equator to the pole the θ error after 6 steps is at most 3e−16, so 6 is plenty).
- Body frame convention: +Y (the spin axis) is north on the map, longitude 0 is +Z and grows towards +X.
