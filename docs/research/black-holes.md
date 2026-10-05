# Black holes: how many, how big, how their light bends, how their discs glow

## Question

Issue #77 adds black holes: rare systems in the galaxy you can fly into, a stellar-mass black hole with an accretion disc instead of a star (`gen/blackHoles.ts`, drawn by `world/BlackHoleLook.ts`). It needs:

1. How common stellar black holes are against stars, and their masses, for how many the game places among 4000 stars.
2. The shadow's size, the photon sphere and the disc's inner edge, in Schwarzschild radii r_s = 2GM/c².
3. An equation for a light ray's path past the hole that a shader can step per pixel, checked against the shadow's edge and the known deflections.
4. A thin disc's temperature across it and its total light, to colour it and light the planets.
5. How the disc's motion shifts its light (Doppler beaming, gravitational redshift).
6. How other games and real-time renderers drew theirs: see the companion note [black-holes-games.md](black-holes-games.md).

Precision: exact for the geometry (it's what the eye judges: the shadow's size, where the far side of the disc shows), the right trend for the rest. The game's sizes and temperatures are deliberately stylised (below), keeping the real ratios.

## Sources

All accessed 2026-10-05.

- **Elbert, Bullock & Kaplinghat 2018**, MNRAS, as reported by Science News, https://www.sciencenews.org/article/we-share-milky-way-100-million-black-holes: "the Milky Way teems with black holes — about 100 million of them"; Daniel Holz: "the number of stars in the Milky Way, for example, is about a thousand times larger"; "about 10 million black holes with masses at least" ~30 M☉.
- **Özel et al. 2010**, ApJ 725:1918, https://arxiv.org/abs/1006.2834 (via search summary): black holes in X-ray binaries follow "a narrow mass distribution at 7.8 ± 1.2 M☉", above 5 M☉, with a gap at ~2–5 M☉ between the heaviest neutron stars and the lightest black holes.
- **Miller-Jones et al. 2021**, Science 371:1046, https://ui.adsabs.harvard.edu/abs/2021Sci...371.1046M/abstract: Cygnus X-1's black hole is 21.2 ± 2.2 M☉. **Wikipedia, Cygnus X-1**, https://en.wikipedia.org/wiki/Cygnus_X-1: companion an O9.7 Iab supergiant of ~29 M☉, period 5.6 d, "A stellar wind from the star provides material for an accretion disk", the disc reaching "an estimated 500 times the Schwarzschild radius".
- **SS 433 / W50**: Chandra photo album https://chandra.harvard.edu/photo/2024/ss433/ and arXiv 2001.03599 (search summaries): SS 433, a microquasar (likely a ~20 M☉ black hole fed by a supergiant), sits at the centre of the supernova remnant W50.
- **Schwarzschild geometry** (arXiv 2404.04046 and 2508.20419, search summaries; standard results): photon sphere r = 3M = 1.5 r_s; critical impact parameter b = 3√3 M = (3√3/2) r_s ≈ 2.598 r_s, the shadow's radius seen from afar; ISCO r = 6M = 3 r_s.
- **Lasota 2015**, "Black hole accretion discs", https://arxiv.org/abs/1505.02172 (PDF text): eq. 58, σT_eff⁴ = (3GMṀ / 8πR³) [1 − (R_in/R)^½]; eq. 61, L_disc = GMṀ / 2R_in for R_out → ∞; eq. 2, Ṁ_Edd ∝ M; "the temperature in a disc around a stellar–mass black hole varies from 10⁷ K, near its surface, to ∼10³ K near the disc's outer edge at 10⁵ black-hole radii". **Armitage**, lecture notes on accretion disc physics, https://arxiv.org/abs/2201.07262 (search summary), the same profile.
- **Wikipedia, Relativistic beaming**, https://en.wikipedia.org/wiki/Relativistic_beaming: D = 1 / (γ(1 − β cos θ)); observed flux S_o = S_e D^(3−α).
- **Riccardo Antonelli, "Starless"** (photon acceleration a = −(3/2) h² x / |x|⁵ in units of r_s; orbital speed of the disc β = 1/√(2(r − 1))), and the games and renderers survey: see [black-holes-games.md](black-holes-games.md).
- **The Sun's deflection**, measured 1.75″ (Eddington 1919; standard), with r_s(Sun) = 2953.25 m and R☉ = 695,700 km (IAU 2015 nominal).

## Measurements

### The photon path

In Schwarzschild coordinates the orbit equation is u'' + u = (3/2) r_s u² (u = 1/r). Written in Cartesian form with r_s = 1, a ray moves as if pushed by a = −(3/2) h² x / |x|⁵, h = |x × v| (constant), |v| = 1 at the start: the spatial path is the null geodesic's (Antonelli). The game's `bendRay` and the shader step it with velocity Verlet at a step proportional to r. Script (`node geodesic.mjs`):

```js
function trace(b, dtScale = 0.02) {
  let p = [-1000, b, 0], v = [1, 0, 0];
  const h2 = b * b;
  for (let i = 0; i < 2e6; i++) {
    const r = Math.hypot(...p);
    if (r < 1) return null;
    if (r > 1001 && p[0] * v[0] + p[1] * v[1] > 0 && i > 10) break;
    const dt = dtScale * r;
    const acc = (q) => { const rr = Math.hypot(...q); const k = -1.5 * h2 / rr ** 5; return q.map((x) => k * x); };
    const a0 = acc(p);
    const pn = p.map((x, j) => x + v[j] * dt + 0.5 * a0[j] * dt * dt);
    const a1 = acc(pn);
    v = v.map((x, j) => x + 0.5 * (a0[j] + a1[j]) * dt);
    p = pn;
  }
  return Math.atan2(-v[1], v[0]);
}
// bisection on capture → critical b; then deflections against 2/b and 2/b + 15π/(16b²)
```

| Check | Traced | Theory |
|---|---|---|
| Critical impact parameter (step 0.005 r) | 2.5980 r_s | 3√3/2 = 2.5981 |
| … at the game's step, 0.08 r (`RAY_STEP`) | 2.5911 r_s (−0.27%) | |
| … at 0.04 r / 0.12 r | 2.5963 / 2.5821 | |
| Deflection at b = 100 r_s | 0.02030 | 2/b = 0.02000; + 15π/16b² = 0.02029 |
| b = 50 | 0.04122 | 0.04000; 0.04118 |
| b = 20 | 0.10810 | 0.10000; 0.10736 |
| b = 10 | 0.23614 | 0.20000; 0.22945 |
| b = 5 | 0.59040 | 0.40000; 0.51781 |
| b = 3 (game step 0.08) | 1.7137 (fine: 1.7194) | past 90° |
| Sun grazing, 2 r_s / R☉ | 1.751″ | measured 1.75″ |

The shadow's edge comes out within 0.3% at the game's step; the weak-field formula with its second-order term is within 1% from b = 20 and 3% from b = 10, which is where the shader stops marching rays that pass outside the disc and turns them by the formula instead.

### The disc

σT⁴ ∝ x⁻³ (1 − x^−½), x = R / R_in (Lasota eq. 58), measured by scanning x: its maximum is at x = 1.3611 = 49/36 (f = 0.05665; analytically d/dx gives √x = 7/6). Integrating both faces, ∫ 2σT⁴ 2πR dR = 4.1875 r_in² σT*⁴ against the analytic 4π/3 = 4.1888, so the disc's light is **(4π/3) / f_peak = 73.94 r_in² σT_peak⁴**, or 5.884 times a sphere of radius r_in at the peak temperature (`DISC_LIGHT`).

With Ṁ = ṁ Ṁ_Edd ∝ ṁM (eq. 2) and R_in = 3 r_s ∝ M, σT⁴ ∝ MṀ/R³ ∝ ṁ/M: **T_peak ∝ (ṁ/M)^¼**, and L ∝ r_in² T⁴ ∝ ṁ M (the Eddington luminosity ∝ M, as it should).

The gas orbits at β = 1/√(2(r − 1)) as a static observer there measures it: 0.500 c at the ISCO, 0.408 at 4 r_s, 0.316 at 6, 0.236 at 10, 0.162 at 20. Light leaving r loses √(1 − 1/r) to gravity: 0.816 at the ISCO, 0.949 at 10 r_s.

## Game mapping

- **How many** (`BLACK_HOLES_PER_STAR` = 1/1000): 10⁸ black holes against ~10¹¹ stars, so 4 in a 4000-star galaxy, chosen by `chooseBlackHoles` from their own stream after Sol and the young stars, so nothing else in the galaxy changes: each keeps its place, id, name and seed, and its stars become one black hole. One goes in a supernova remnant if there is one (the collapsed core of the star that blew it out, as SS 433 sits in W50), the rest anywhere among the stars. Never Sol, a young star, a lone G or K star (so never the home system), or a star another kind of nebula is made round.
- **Masses** 5–21 M☉, log-even (`BLACK_HOLE_MASS`): above the mass gap up to Cygnus X-1.
- **Size** (stylised): r_s = 0.55 system units per M☉ (`SYSTEM_RS_PER_SUN`), so the shadow (`StarData.radius` = 2.598 r_s) is 7–30 units across, a white dwarf to a G star; the real 2.95 km per M☉ would be invisible. r_s ∝ M is kept.
- **Disc** (stylised): from the ISCO, 3 r_s, out to 10–18 r_s (`DISC_OUTER`; real discs reach 10⁵ r_s, Cygnus X-1's 500, but past ~20 r_s their light is negligible). Fed at ṁ = 0.1–1 of the Eddington rate, log-even. The temperature profile is Lasota's, but its peak is **6500 K for a 10 M☉ hole at the Eddington rate** (`DISC_TEMPERATURE`) times (ṁ · 10 M☉ / M)^¼: about 3500–7700 K, orange to white, instead of the real ~10⁷ K (blue-white, X-rays). Interstellar's Gargantua was drawn cool for the same reason.
- **Light**: `discLuminosity` = DISC_LIGHT × (r_in / 29.5)² × (T_peak / 5772 K)⁴ relative to the Sun as the game draws it (a G star of radius 29.5 at 5772 K): 0.15–7 suns over the galaxy's range, so its habitable radius lands like a star's. The planets are lit with the light colour of the class whose temperature is nearest the peak (`nearestClass`). Real X-ray binaries give off 10³–10⁵ suns, mostly X-rays; this is the visible glow of the stylised disc.
- **Planets** orbit outside the lensing reach (`starReach` = `lensReach` × r_s, the system's `starZone`): 1.25 times the disc, at least 16 r_s. Their light, life and climates follow from the disc's luminosity like any star's; life gets a white dwarf's 3 Gyr (`BLACK_HOLE_HZ_TIME`, stylised: the disc is drawn as a steady thermal glow, not the X-rays that would sterilise a real system). No debris disc.
- **The view** (`BlackHoleLook`): a sphere out to the lensing reach, drawn from inside too; each pixel's ray is stepped with `RAY_STEP` = 0.08 r (or turned by the weak-field formula if it passes outside the disc from outside), crossing the disc's plane picks up its glow (front to back, several crossings: the far side over the top, the underside below, the thin higher-order ring at the shadow's edge), a ray inside r_s is black, and an escaping ray looks up the sky baked into a cube map (`SkyCapture`, once per system). Its bending eases out to none at the sphere's edge (from 0.55 of the reach), where the deflection is ~5°. Colour: a black body at g·T, brightness (g·T)⁴, with g = D √(1 − 1/r) and D the Doppler factor; `blackHoleParams.beaming` blends g towards 1 (0.7 by default: NASA's and the EHT's pictures show the lopsided disc, Interstellar turned it off). Traced at half resolution and scaled up (`blackHoleParams.resolution`), as SpaceEngine traces at a third.
- **For a black hole gun** (later): `BlackHoleLook` takes a `BlackHoleShape` in its own units (r_s, a disc or none, reach), not a star, and draws without a sky (only the shadow and disc) when given none; `bendRay` and `deflection` are the same maths for gameplay (what's pulled in, what falls through the horizon).

## Open questions

- The Science News article reports Elbert et al.'s numbers; the paper itself wasn't read (the "thousand times" ratio is Holz's quote in it).
- Özel et al. 2010's numbers are from a search summary of the abstract, not the paper.
- Antonelli's acceleration is taken from the companion note's sources (his page and code); it is confirmed here by reproducing the critical impact parameter and the weak-field deflection, not by reading a derivation.
- The beaming exponent: bolometric intensity goes as g⁴ (what the game uses, through T⁴), the specific intensity at a fixed frequency as g³ (oseiskar, Bruneton): both make the approaching side brighter; the game's look is tuned by `beaming` anyway.
- Objects in the scene (planets, the UFO) are not lensed, only the sky: planets orbit outside the lensing sphere, so this only shows when one passes behind it (it is hidden there rather than bent). Sampling the screen at the bent direction (SpaceEngine, Singularity) would fix it.
