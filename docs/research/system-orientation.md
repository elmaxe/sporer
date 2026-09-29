# How planetary systems are tilted against the galactic plane

## Question

Every system has a `galacticTilt` (step 7, `gen/system.ts` → `randomRotation(rng.fork('galactic'))`): a uniformly random rotation from system space into galaxy space. It tilts the galaxy band in the system sky, and in the seamless galaxy ↔ system zoom (step 9) it sets how far the view rolls as the camera settles onto the ecliptic. Playtesting: "most systems are very heavily tilted compared with the galaxy's plane. Is that realistic?"

What's needed: the real distribution of the angle between a planetary system's orbital plane and the galactic plane, the Solar System's own value as a reference case, and whether the game's distribution matches.

## Sources (accessed 2026-09-29)

- Wikipedia, *Ecliptic pole* (https://en.wikipedia.org/wiki/Ecliptic_pole): the north ecliptic pole is at "18h 0m 0.0s (exact), declination +66° 33′ 38.55″" (J2000) and at galactic coordinates "ℓ = 96.38°, b = 29.81°".
- Wikipedia, *Galactic coordinate system* (https://en.wikipedia.org/wiki/Galactic_coordinate_system): the north galactic pole (J2000) is at right ascension "12h 51.4m", declination "+27.13°".
- Souami & Souchay 2012, *The solar system's invariable plane*, A&A 543, A133 (https://www.aanda.org/articles/aa/full_html/2012/07/aa19011-12/aa19011-12.html), via search summary: the ecliptic is inclined about 1.58° to the invariable plane, so the ecliptic stands in for the Solar System's plane to within ~1.6°.
- *Orientation of orbital planes of planetary systems detected in microlensing campaigns* (arXiv:2507.21309, https://arxiv.org/abs/2507.21309), abstract: 66 microlensing planets' orbital planes, tested against random orientation. "The whole sample seems to be overall isotropically distributed". A possible local alignment with the Galactic plane at 3 kpc (the Scutum–Centaurus arm) is tentative.
- Search summaries (not read in full, so weaker): stellar spin axes, which planetary orbits usually follow within tens of degrees, are randomly oriented relative to the Galaxy (Abt 2001; Howe & Clarke 2009). Debris discs lie within ~10–30° of their star's equator (Greaves et al. 2014, arXiv:1009.4132 and follow-ups).

## Measurements

The Solar System's tilt, from the two poles (spherical law of cosines), and the isotropic distribution: for random orientations the pole is uniform on the sphere, so an unsigned tilt θ has P(tilt ≤ θ) = 1 − cos θ. The game's tilt comes from 1,500 generated systems (seed 1337), as the angle between the system's +Y, turned by `galacticTilt`, and the galaxy's +Y (unsigned).

Script (`npx vite-node tilt.ts`):

```ts
import { generateGalaxy } from '../src/gen/galaxy';
import { generateSystem } from '../src/gen/system';
const d = Math.PI / 180;
const nep = { ra: 270 * d, dec: (66 + 33 / 60 + 38.55 / 3600) * d };
const ngp = { ra: (12 + 51.4 / 60) * 15 * d, dec: 27.13 * d };
const cos = Math.sin(nep.dec) * Math.sin(ngp.dec) + Math.cos(nep.dec) * Math.cos(ngp.dec) * Math.cos(nep.ra - ngp.ra);
console.log((Math.acos(cos) / d).toFixed(2));
for (const t of [10, 20, 30, 45, 60, 75]) console.log(t, (1 - Math.cos(t * d)).toFixed(3));
const tilts = generateGalaxy(1337).stars.slice(0, 1500).map((ref) => {
  const q = generateSystem(ref).galacticTilt;
  return Math.acos(Math.min(1, Math.abs(1 - 2 * (q.x * q.x + q.z * q.z)))) / d;
});
```

Output:

- Solar System: **60.19°** between the ecliptic and the galactic plane (from the poles' RA/Dec). It matches the tabulated b = 29.81° of the ecliptic pole (90° − 29.81° = 60.19°).

| Tilt ≤ | Isotropic (1 − cos θ) | Game, 1,500 systems |
|---|---|---|
| 10° | 1.5% | 1.5% |
| 20° | 6.0% | 7.3% |
| 30° | 13.4% | 14.7% |
| 45° | 29.3% | 29.5% |
| 60° | 50.0% | 48.9% |
| 75° | 74.1% | 73.7% |

Game median 60.7° (10th percentile 24.3°, 90th 83.8°); the isotropic median is exactly 60°.

## Game mapping

- `galacticTilt` is uniformly random, so the tilts are isotropic. That matches the observations (random orientations overall), and the Solar System's 60.19° is almost exactly the median. **"Most systems are heavily tilted" is realistic**: with random orientations, 71% of systems are tilted more than 45° and only 6% are within 20° of the galactic plane, because far more directions on the sphere lie near the equator than near the poles.
- No change was made to the generation. If the zoom's roll looks wrong, that's a presentation question (how the camera settles onto the ecliptic after the handover), not a realism one. A gameplay bias towards flatter systems would be a deliberate stylised departure and should be written down here if it's ever made.

## Open questions

- The Abt 2001, Howe & Clarke 2009 and Greaves et al. results come from search summaries, not from reading the papers.
- Stars that form together in one cloud or spiral arm may share some alignment (the tentative 3 kpc signal above; claims of aligned spins in some open clusters). The game ignores this: each system's tilt is independent.
