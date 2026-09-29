# Body sizes

## Question

How big are planets and moons, and where do the natural size classes fall? This is for roadmap step 11 (`gen/planets.ts`: `gameRadius`, `SIZE_CLASS_EARTH_RADII`, the moon radii). We need the real radii of reference bodies, the class boundaries seen in real planet populations, and a single mapping from real radii to game units. "Within ~10% and the right order" is enough: sizes are compressed for gameplay anyway.

Reference cases: Ceres, Pluto, Mercury, Mars, Venus, Earth, Uranus, Neptune, Saturn, Jupiter; moons from Phobos to Ganymede.

## Sources

- NASA NSSDCA Planetary Fact Sheet (metric), https://nssdc.gsfc.nasa.gov/planetary/factsheet/, accessed 2026-09-29, read from the raw HTML. Diameter (km), columns Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto: 4879, 12,104, 12,756, 3475, 6792, 142,984, 120,536, 51,118, 49,528, 2376. These are equatorial diameters; the game uses half of each as "the radius".
- JPL Solar System Dynamics, Planetary Satellite Physical Parameters, https://ssd.jpl.nasa.gov/sats/phys_par/, accessed 2026-09-29, raw HTML. Mean radius (km): Moon 1737.4, Phobos 11.08, Io 1821.49, Europa 1560.80, Ganymede 2631.20, Callisto 2410.30, Mimas 198.20, Enceladus 252.10, Titan 2574.76, Iapetus 734.30, Titania 788.9, Triton 1352.60, Charon 606.0. The Moon matches the fact sheet (3475 / 2 = 1737.5).
- JPL Small-Body Database API, `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=Ceres&phys-par=1`, accessed 2026-09-29: 1 Ceres, diameter 939.4 km.
- Fulton et al. 2017, "The California-Kepler Survey. III. A Gap in the Radius Distribution of Small Planets", arXiv:1703.10375 (abstract read 2026-09-29): "a factor of ≥2 deficit in the occurrence rate distribution at 1.5-2.0 R⊕ ... two size regimes: R_P < 1.5 R⊕ and R_P = 2.0-3.0 R⊕ ... close-in planets smaller than Neptune are composed of rocky cores measuring 1.5 R⊕ or smaller with varying amounts of low-density gas".
- Borucki et al. 2011, "Characteristics of planetary candidates observed by Kepler, II", arXiv:1102.0541 (abstract read 2026-09-29): Kepler's size classes, "Earth-size (radius < 1.25 Earth radii), ... super-Earth size (1.25 < radius < 2), ... Neptune-size (2 < radius < 6), ... Jupiter-size (6 < radius < 15), and ... up to twice the size of Jupiter (15 < radius < 22)".
- Chen & Kipping 2017, "Probabilistic Forecasting of the Masses and Radii of Other Worlds", arXiv:1603.08614 (abstract read 2026-09-29): four classes (Terran, Neptunian, Jovian worlds, stars), and "dwarf planets as merely low-mass Terrans". Used only to justify dwarfs as the small end of the solid worlds.
- NASA Exoplanet Archive, table `pscomppars` via TAP, accessed 2026-09-29, planets with 0.3 < M < 13 M_J and a measured radius: 1683 planets; by radius (R_J) < 0.8: 67, 0.8–1.2: 862, 1.2–1.5: 635, 1.5–2.0: 111, ≥ 2.0: 8. Query: `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+...+from+pscomppars+where+pl_bmassj>0.3+and+pl_bmassj<13&format=csv`. So giants reach ~1.5 R_J routinely and ~2 R_J rarely (inflated hot Jupiters, which transit surveys favour).

## Measurements

The game maps a real radius R (in Earth radii) to r = 8 · √R. Earth is 8 (the old terran range was 7–11), and the square root compresses the 11× Earth–Jupiter ratio to 3.35×, so giants still fit in a system and dwarfs still read as worlds.

```bash
node -e '
const E = 12756/2;
const rows = [["Ceres",939.4/2],["Pluto",2376/2],["Moon",1737.4],["Mercury",4879/2],["Mars",6792/2],["Venus",12104/2],["Earth",E],["Neptune",49528/2],["Uranus",51118/2],["Saturn",120536/2],["Jupiter",142984/2],["1.6 R_J",142984/2*1.6],
 ["Phobos",11.08],["Mimas",198.2],["Enceladus",252.1],["Charon",606.0],["Iapetus",734.3],["Titania",788.9],["Triton",1352.6],["Europa",1560.8],["Io",1821.49],["Callisto",2410.3],["Titan",2574.76],["Ganymede",2631.2]];
for (const [n,r] of rows) { const re=r/E; console.log(n, r.toFixed(1), re.toFixed(4), (8*Math.sqrt(re)).toFixed(2)); }'
```

| Body | Radius (km) | R⊕ | Game radius | Class |
|---|---|---|---|---|
| Ceres | 469.7 | 0.0736 | 2.17 | dwarf |
| Pluto | 1188.0 | 0.1863 | 3.45 | dwarf |
| Mercury | 2439.5 | 0.3825 | 4.95 | small |
| Mars | 3396.0 | 0.5325 | 5.84 | small |
| Venus | 6052.0 | 0.9489 | 7.79 | Earth-sized |
| Earth | 6378.0 | 1.0000 | 8.00 | Earth-sized |
| Neptune | 24764.0 | 3.8827 | 15.76 | ice giant |
| Uranus | 25559.0 | 4.0074 | 16.01 | ice giant |
| Saturn | 60268.0 | 9.4494 | 24.59 | gas giant |
| Jupiter | 71492.0 | 11.2092 | 26.78 | gas giant |
| 1.6 R_J | 114387.2 | 17.9347 | 33.88 | gas giant (top) |

| Moon | Radius (km) | R⊕ | Game radius |
|---|---|---|---|
| Phobos | 11.1 | 0.0017 | 0.33 |
| Mimas | 198.2 | 0.0311 | 1.41 |
| Enceladus | 252.1 | 0.0395 | 1.59 |
| Charon | 606.0 | 0.0950 | 2.47 |
| Iapetus | 734.3 | 0.1151 | 2.71 |
| Titania | 788.9 | 0.1237 | 2.81 |
| Triton | 1352.6 | 0.2121 | 3.68 |
| Europa | 1560.8 | 0.2447 | 3.96 |
| Moon | 1737.4 | 0.2724 | 4.18 |
| Io | 1821.5 | 0.2856 | 4.28 |
| Callisto | 2410.3 | 0.3779 | 4.92 |
| Titan | 2574.8 | 0.4037 | 5.08 |
| Ganymede | 2631.2 | 0.4125 | 5.14 |

`tests/sizes.test.ts` checks the planets' classes and the Moon and Ganymede against the code.

The generator measured over the first 1500 systems of galaxy 1337 (`npx vite-node` on a scratch script importing `src/gen/`):

| | Before | After |
|---|---|---|
| Solid radii, 10th–90th percentile | 4.6–9.9 | 2.7–11.6 |
| Median largest ÷ smallest solid world in a system (≥ 3 solids) | 1.75 | 2.81 |
| Gas giant radii | 14–24 | 13.9–33.8 |
| Moon radii | 1.2–3.5 | 0.8–6.0 |
| Outer edge of the last planet, 99th percentile / max | 1377 / 1781 | 1534 / 1901 |

| Class | Share of planets | Moons per planet | Types |
|---|---|---|---|
| dwarf | 12.5% | 0.19 | ice 62%, barren 35% |
| small | 19.1% | 0.49 | ice 41%, barren 34%, desert 12%, terran 8% |
| Earth-sized | 23.1% | 0.58 | terran 39%, ice 19%, desert 16%, barren 12%, ocean 11% |
| super-Earth | 13.4% | 1.04 | terran 35%, ice 26%, ocean 22%, desert 9% |
| ice giant | 13.6% | 1.65 | gas |
| gas giant | 18.4% | 2.28 | gas |

On average a system has 0.59 ice giants and 0.80 gas giants. About 24% of gas giants have a big moon (radius ≥ 4), and 8% of all moons are big.

## Game mapping

- `gameRadius(R) = 8 · √R` (`gen/planets.ts`). One explicit factor (Earth = 8) and one deliberate stylisation (the square root). It keeps the order of every reference body and every class boundary.
- Classes, defined in Earth radii and converted with `gameRadius`:
  - dwarf 0.0625–0.19 (game 2–3.5): Ceres to Pluto. The lower edge is picked so the smallest body is still 2 units, half the UFO.
  - small 0.19–0.5625 (3.5–6): Mercury, Mars.
  - Earth-sized 0.5625–1.5 (6–9.8): the top is Fulton's 1.5 R⊕ rocky-core limit.
  - super-Earth 1.5–3 (9.8–13.9): Fulton's gap and the 2–3 R⊕ sub-Neptunes. The game has no sub-Neptune type, so these become deep-ocean and thick-air terran worlds (deliberate).
  - ice giant 3–6 (13.9–19.6): Uranus and Neptune; 6 R⊕ is Borucki's Neptune/Jupiter divide.
  - gas giant 6–17.9 (19.6–33.9): Saturn, Jupiter, up to 1.6 R_J. The archive shows giants cluster at 0.8–1.5 R_J and rarely reach 2 R_J.
- The radius is log-uniform inside the class.
- Class and type weights by zone are gameplay choices, not occurrence rates. Kepler's intrinsic rates (Borucki: 6% Earth-size, 7% super-Earth, 17% Neptune-size, 4% Jupiter-size, for close-in orbits) would make most planets Neptunes, which is dull to fly around. What's kept is the real trend: small bodies can't hold air or oceans, so they are barren, icy or volcanic, and super-Earths are mostly wet.
- Moons use the same mapping: 0.8 (0.01 R⊕, ~64 km) to 6 (0.56 R⊕, bigger than Mercury). Regular moons stay below 3.5 (Pluto-sized, about Triton at 3.68). Big moons are 4–6: Europa just under the edge, then the Moon, Io, Callisto, Titan and Ganymede. A moon is at most half its planet's radius: the Earth–Moon pair is 0.27 real, 0.52 in game units, the largest among the planets.
- Moon orbit gaps scale with √(planet radius / 8), so giants spread their moons wider.
- The planet level magnifies every body by the same factor, 12.5 (`PLANET_SCALE` in `planet/frame.ts`), so the linear size ratios above carry over to low orbit. The ship, its altitude and the camera stay the same size.

## Open questions

- **Charon is capped.** Charon/Pluto is 0.51 real, 0.71 in game units, above the 0.5 cap, so a Pluto-Charon double dwarf can't happen. This is deliberate for now; a double-planet feature could lift it.
- **Big-moon chances are tuned, not measured.** Jupiter has three moons above 4 game units (Io, Callisto, Ganymede; Europa is 3.96), Saturn one (Titan), Uranus and Neptune none. That's too few systems to get a rate, so the chances are chosen for "the odd one".
