# Nebulas (roadmap step 27)

## Question

Step 27 puts named nebulas on the galaxy map, and puts their gas in the sky of the systems inside them. `src/gen/nebulas.ts` needs:

- the **kinds** and what makes each one glow or go dark, so each kind can be built round the right sort of star;
- **real sizes** of each kind, and how they map onto the galaxy map (1000 units of radius);
- how **common** each kind is, and where in the galaxy it sits;
- their **colours**: the emission lines of glowing gas and the colour of scattered starlight, in sRGB.

Precision: sizes within a factor of ~2 and in the right order between kinds; colours as the eye sees them in sRGB (the hue matters more than the exact value).

## Sources

All accessed 2026-09-30. The Wikipedia pages were read as raw wikitext (`?action=raw`); the values are the infobox fields and sentences as printed, with the papers they cite.

| What | Source | Value as printed |
|---|---|---|
| Milky Way size | [Milky Way](https://en.wikipedia.org/wiki/Milky_Way) (Goodwin et al.) | `size = 26.8 ± 1.1 kpc` (diameter, D25 isophote) = 87,400 ly |
| Stars in the galaxy | [Planetary nebula](https://en.wikipedia.org/wiki/Planetary_nebula) | "About 3000 planetary nebulae are now known to exist in our galaxy, out of 200 billion stars" (Parker et al. 2006) |
| Supernova remnants known | [Green's catalogue of Galactic SNRs](https://www.mrao.cam.ac.uk/surveys/snrs/) | "listings for all 310 SNRs" |
| H II regions | [H II region](https://en.wikipedia.org/wiki/H_II_region) | "A large spiral galaxy may contain thousands of H II regions"; "In spiral galaxies, including our Milky Way, H II regions are concentrated in the spiral arms"; size "from so-called ultra-compact (UCHII) regions perhaps only a light-year or less across, to giant H II regions several hundred light-years across" |
| H II colour | [H II region](https://en.wikipedia.org/wiki/H_II_region) | "The strongest hydrogen emission line, the H-alpha line at 656.3 nm, gives H II regions their characteristic red colour"; "H-beta is also emitted, but at approximately 1/3 of the intensity of H-alpha" |
| O III line | [H II region](https://en.wikipedia.org/wiki/H_II_region), [Planetary nebula](https://en.wikipedia.org/wiki/Planetary_nebula) | "the brightest of these spectral lines was at a wavelength of 500.7 nm" ([O III], doubly ionised oxygen) |
| Stellar-wind cavities | [Rosette Nebula](https://en.wikipedia.org/wiki/Rosette_Nebula) | "A hole in the heart of the Rosette Nebula"; X-ray glow "between the stars in the bubble … attributed to … shock-heated winds from the massive O-type stars" |
| Reflection nebulas | [Reflection nebula](https://en.wikipedia.org/wiki/Reflection_nebula) | "The energy from the nearby stars is insufficient to ionize the gas of the nebula to create an emission nebula, but is sufficient to make the dust visible via scattering"; "usually blue because the scattering is more efficient for blue light than red (this is the same scattering process that gives us blue skies and red sunsets)" |
| Dark nebulas | [Dark nebula](https://en.wikipedia.org/wiki/Dark_nebula) | "sub-micrometre-sized dust particles … effectively block the passage of light at visible wavelengths"; seen "as dark patches against the brighter background of the Milky Way like the Coalsack Nebula and the Great Rift" |
| Reddening | [Extinction (astronomy)](https://en.wikipedia.org/wiki/Extinction_(astronomy)) | "Reddening preferentially removes shorter wavelength photons" |
| Colour matching | [CVRL](http://www.cvrl.org/database/data/cmfs/ciexyz31_1.csv) | CIE 1931 2° colour-matching functions, 1 nm steps (e.g. 656 nm: x̄ 0.2071, ȳ 0.0771, z̄ 0) |

Sizes (infobox `radius_ly`, or `radius_pc` converted at 3.26 ly/pc):

| Nebula | Kind | Radius (ly), as printed | Page |
|---|---|---|---|
| Orion Nebula (M42) | emission | 13 | [Orion Nebula](https://en.wikipedia.org/wiki/Orion_Nebula) ("24 light-years across") |
| Rosette Nebula | emission | 65 | [Rosette Nebula](https://en.wikipedia.org/wiki/Rosette_Nebula) |
| Lagoon Nebula | emission | 55 × 20 | [Lagoon Nebula](https://en.wikipedia.org/wiki/Lagoon_Nebula) |
| Eagle Nebula | emission | 70 × 55 | [Eagle Nebula](https://en.wikipedia.org/wiki/Eagle_Nebula) |
| Carina Nebula | emission | ~230 (~70 pc) | [Carina Nebula](https://en.wikipedia.org/wiki/Carina_Nebula) |
| Iris Nebula | reflection | 3 | [Iris Nebula](https://en.wikipedia.org/wiki/Iris_Nebula) |
| Messier 78 | reflection | 5 | [Messier 78](https://en.wikipedia.org/wiki/Messier_78) |
| Barnard 68 | dark | 0.25 | [Barnard 68](https://en.wikipedia.org/wiki/Barnard_68) |
| Horsehead Nebula | dark | 3.5 | [Horsehead Nebula](https://en.wikipedia.org/wiki/Horsehead_Nebula) |
| Coalsack | dark | 30–35 | [Coalsack Nebula](https://en.wikipedia.org/wiki/Coalsack_Nebula) |
| Ring Nebula | planetary | 0.1 × 0.14 pc (0.33 × 0.46 ly) | [Ring Nebula](https://en.wikipedia.org/wiki/Ring_Nebula) |
| Dumbbell Nebula | planetary | 1.44 | [Dumbbell Nebula](https://en.wikipedia.org/wiki/Dumbbell_Nebula) |
| Helix Nebula | planetary | 2.87 (0.88 pc) | [Helix Nebula](https://en.wikipedia.org/wiki/Helix_Nebula) |
| Planetary nebulas in general | planetary | "~1 ly" across | [Planetary nebula](https://en.wikipedia.org/wiki/Planetary_nebula) (Osterbrock) |
| Crab Nebula | remnant | ~5.5 (~1.7 pc) | [Crab Nebula](https://en.wikipedia.org/wiki/Crab_Nebula) |
| Cygnus Loop | remnant | "some 37 pc (120 ly) in diameter" → 60 | [Cygnus Loop](https://en.wikipedia.org/wiki/Cygnus_Loop) (Fesen et al. 2021) |

## Measurements

### Colours

Emission lines are single wavelengths; their sRGB colour is the CIE 1931 2° response (x̄, ȳ, z̄) at the line, through the IEC 61966-2-1 matrix. Pure spectral lines lie outside the sRGB gamut, so negative channels are pulled towards grey of the same luminance until they fit, then the colour is scaled to a maximum of 1 and encoded. Reflected light is a star's black-body spectrum (Planck) times the scattering ∝ λ^−p, summed 380–780 nm. Script (`colors.mjs`, next to `cie.csv` from CVRL):

```js
import fs from 'node:fs';
const cmf = new Map(fs.readFileSync('cie.csv', 'utf8').trim().split('\n').map((l) => { const [w, x, y, z] = l.split(',').map(Number); return [w, [x, y, z]]; }));
const at = (nm) => { const a = Math.floor(nm), t = nm - a; const p = cmf.get(a), q = cmf.get(a + 1); return p.map((v, i) => v + (q[i] - v) * t); };
function toHex([X, Y, Z]) {
  let rgb = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
  const min = Math.min(...rgb);
  if (min < 0) { const k = Y / (Y - min); rgb = rgb.map((c) => Y + (c - Y) * k); }
  const m = Math.max(...rgb);
  const enc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  return '#' + rgb.map((c) => Math.round(enc(Math.max(0, c / m)) * 255).toString(16).padStart(2, '0')).join('');
}
const lines = (list) => list.reduce((s, [nm, w]) => at(nm).map((v, i) => s[i] + v * w), [0, 0, 0]);
console.log(toHex(lines([[656.3, 1], [486.1, 1 / 2.86]])));           // H II region
const h = 6.62607015e-34, c = 2.99792458e8, kB = 1.380649e-23;
const planck = (nm, T) => { const l = nm * 1e-9; return 1 / (l ** 5 * (Math.exp((h * c) / (l * kB * T)) - 1)); };
function reflected(T, p) { const s = [0, 0, 0]; for (let nm = 380; nm <= 780; nm++) { const w = planck(nm, T) * Math.pow(nm / 550, -p); at(nm).forEach((v, i) => (s[i] += v * w)); } return toHex(s); }
```

| Light | sRGB | Used for |
|---|---|---|
| Hα 656.3 nm alone | `#ff0052` | the red rims of planetary nebulas and supernova remnants (`H_ALPHA_RED`) |
| [S II] 671.6 nm alone | `#ff0054` | (the same red as Hα in sRGB) |
| Hβ 486.1 nm alone | `#00ddff` | – |
| [O III] 500.7 nm alone | `#00ffd5` | planetary nebulas' insides, remnants' teal filaments, the hot cores of H II regions (`O_III_TEAL`) |
| Hα + Hβ at 1 : 1/3 (the page's ratio) | `#ff5fb4` | – |
| Hα + Hβ at 1 : 1/2.86 | `#ff64ba` | emission nebulas (`H_II_PINK`); the two ratios differ by 5/255 |
| 5,800 K starlight, unscattered | `#fff1eb` | check: the Sun comes out near white |
| 10,000 K (an A star) ∝ λ^−1 / λ^−4 | `#adc5ff` / `#6791ff` | reflection nebulas round A stars |
| 20,000 K (a B star) ∝ λ^−1 / λ^−4 | `#90afff` / `#577eff` | reflection nebulas round B stars |

The pure-Hα red looks right for the Veil's red filaments and the rims of planetary nebulas; mixing in Hβ gives the familiar pink of H II regions in photographs. A reflection nebula is blue whichever scattering law holds: the steeper it is, the deeper the blue. The sources give only Rayleigh's λ^−4 ("the same scattering process that gives us blue skies"); real dust scatters less steeply, so each nebula takes a colour between the λ^−1 and λ^−4 results.

### Sizes on the map

The map's radius (1000 units) stands for the Milky Way's D25 radius, 87,400 / 2 = 43,700 ly, so **1 unit = 43.7 ly**. At that scale real nebulas are tiny next to the map's star spacing (~25 units; 4000 stars stand for 200 billion):

| Nebula | Kind | Radius (ly) | True map units | Game radius 6·√(ly) |
|---|---|---|---|---|
| Orion Nebula (M42) | emission | 13 | 0.30 | 21.6 |
| Rosette Nebula | emission | 65 | 1.49 | 48.4 |
| Carina Nebula | emission | 230 | 5.26 | 91.0 |
| Iris Nebula | reflection | 3 | 0.07 | 10.4 |
| Messier 78 | reflection | 5 | 0.11 | 13.4 |
| Horsehead Nebula | dark | 3.5 | 0.08 | 11.2 |
| Coalsack | dark | 30–35 | 0.69 | 32.9 |
| Ring Nebula | planetary | 0.33 | 0.008 | 3.4 (→ 8, see below) |
| Helix Nebula | planetary | 2.87 | 0.066 | 10.2 |
| Crab Nebula | remnant | 5.5 | 0.13 | 14.1 |
| Cygnus Loop | remnant | 60 | 1.37 | 46.5 |

### The generator

`generateNebulas` on galaxies 1337, 1, 2 and 42 (4000 stars each) with a throwaway `vite-node` script:

| Seed | Emission | Remnant | Dark | Reflection | Planetary | Systems inside a nebula |
|---|---|---|---|---|---|---|
| 1337 | 12 (r 22–74) | 4 (15–28) | 10 (11–35) | 8 (10–13) | 6 (8–9) | 69 (1.7%) |
| 1 | 12 (24–76) | 4 (15–37) | 10 (13–35) | 8 (11–13) | 6 (8–10) | 65 |
| 2 | 12 (22–74) | 4 (14–33) | 10 (12–35) | 8 (11–13) | 6 (8) | 63 |
| 42 | 12 (22–80) | 4 (15–22) | 10 (13–34) | 8 (11–13) | 6 (8) | 81 |

Every kind has systems inside it in every one of these galaxies (the host star always is). The home system of seed 1337 (star 6) is in none.

## Game mapping

- **Kinds and hosts** (`generateNebulas`): *emission* nebulas round O and B main-sequence stars and blue giants in the arms (H II regions are ionised by hot stars and trace the arms); *reflection* nebulas round B and A main-sequence stars (lit, not ionised); *planetary* nebulas round a white dwarf, centred on it; *dark* clouds and *supernova remnants* round any disc star (the game has no neutron stars, so a remnant has no central object). Nebulas never overlap.
- **Sizes**: map radius = 6·√(real radius in ly), log-uniform between each kind's smallest and biggest reference above. This is a deliberate, stylised departure: at the true scale they would be 0.01–5 units, invisible and holding no systems. The square root keeps the kinds in their real order (emission > remnant, dark > reflection > planetary) while the biggest (a Carina) spans a few star spacings. A planetary nebula is at least **8 units** (its real 0.3–2.9 ly would be 3.4–10): the zoom from the galaxy into a system hands over with the galaxy camera 3 units from the star, and the shell must reach well past that, or the galaxy's and the system's views of it would differ.
- **Counts** (per 4000 stars, scaled with the star count): 12 emission, 10 dark, 8 reflection, 6 planetary, 4 remnants. Real ratios are nothing like this (thousands of H II regions, ~3000 known planetary nebulas, 310 remnants, among 200 billion stars): the counts are chosen so that every kind shows up in every galaxy without crowding the map.
- **Colours**: the table above (`H_II_PINK`, `H_ALPHA_RED`, `O_III_TEAL`, the reflected blues). Emission nebulas mix in O III teal round their hot star; planetary nebulas are teal inside and red at the rim; remnants' filaments are red or teal. Dark clouds get a faint brown glow (stylised: dust lit by the galaxy round it).
- **Shapes**: clouds are 2–6 Gaussian blobs, exp(−4.5·|x/r|²), the same falloff as the galaxy's glow volumes. Emission nebulas and dark clouds lie roughly in the disc. Planetary nebulas are a ring (a shell brightest round its waist, like the Ring Nebula), bipolar (pinched at the waist, like the Dumbbell) or a plain shell; remnants are thin shells whose light is in filaments (ridged noise). Emission and reflection nebulas have a **cavity** round their star (the Rosette's wind-blown hole), so from inside the sky shows the glowing walls rather than a fog.
- **Dimming**: dark clouds dim what's behind them. On the map the stars' vertex shader integrates the dark blobs' Gaussians between the camera and each star in closed form (`starDimming`, the same maths as `starTransmittance` in `gen/nebulas.ts`, tested against it); the disc glow and dust behind a nebula are dimmed by its blending. In a system's sky, the band behind is dimmed the same way in the baked sky, and the point stars on the CPU. Dimming is grey (the sources say extinction reddens, but the blending has one transmittance for all three channels).
- **Membership** (`nebulaAt`): a point is in a cloud nebula where its smooth density is ≥ 0.15, and in a shell nebula anywhere inside its outer surface. `StarRef.nebula` and `SystemData.nebula` hold it.

## Open questions

- The colour script's gamut mapping (towards grey of equal luminance) is one choice of many; pure spectral colours have no exact sRGB value.
- Real reflection-nebula dust scatters less steeply than λ^−4; no source read here gives the exponent, so the colour is picked between λ^−1 and λ^−4.
- The strengths (glow, dust) and the noise are tuned by eye, not measured: surface brightness varies over orders of magnitude between real nebulas.
