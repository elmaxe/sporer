# Lava: colour, fountains and eruptions

## Question

Roadmap step 14 animates lava seas (`world/lavaMaterial.ts`) and throws glowing blobs up from vents in low orbit (`gen/lavaActivity.ts`, `planet/LavaEruptions.ts`). It needs:

1. The **colour of lava by temperature**, for the ramp from cooled crust to the hottest melt, and for blobs cooling in flight.
2. **How high and how long** real lava fountains fly, on Earth and on Io (the only other body with active silicate volcanism), and whether a ballistic arc h = v·t − ½·g·t² describes them.
3. How that maps to the planet level's units, where the look has to be stylised.

Precision: the order and rough temperatures of the colours (it's a look, not a readout), and the right trend of height and time with gravity.

Reference cases: the 1959 Kīlauea Iki eruption (Hawaii's tallest measured fountain) and the 1999 Tvashtar eruption on Io (seen by Galileo).

## Sources

All accessed 2026-09-29.

- **Oregon State University, Volcano World, "Why is lava different colors?"**, https://volcano.oregonstate.edu/faq/why-lava-different-colors: "It starts out bright orange (1000-1150 C). As it cools the color changes to bright red (800-1000 C), then do dark red (650-800 C), and to brownish red (500-650 C). Solid lava is black (but can still be very hot)."
- **USGS, via web search summary** (page not fetched, so only as a cross-check): yellow at about 1,000–1,200 °C; bright red flows up to 1,165 °F (630 °C), orange over 1,600 °F (870 °C). Consistent with the order above: black → brownish/dark red → bright red → orange → yellow as temperature rises.
- **USGS, "1959 Kīlauea Iki eruption"**, https://www.usgs.gov/volcanoes/kilauea/science/1959-kilauea-iki-eruption (read via WebFetch): "the fountains grew from 15 to 30 m (50 to 100 ft) high", "lava fountain heights fluctuated between about 200 and 300 m", "episode 15 produced lava fountains that were approximately 580 m (1,900 ft) high".
- **NASA/JPL, "Galileo Sees Dazzling Lava Fountain on Io"**, https://www.jpl.nasa.gov/news/galileo-sees-dazzling-lava-fountain-on-io/ (read via WebFetch): "a fiery lava fountain shooting more than a mile above the moon's surface", observed November 25 (1999). The JPL image caption PIA02545 (search result) gives "heights of up to 1.5 kilometers".
- **Io's gravity**, from JPL's GM = 5959.91547 km³/s² and R = 1821.49 km (already in `climate.md`): g = GM/R² = 1.796 m/s².

## Measurements

A blob thrown straight up at v climbs to h = v²/2g and lands after T = 2v/g. Inverting for the reference fountains:

```bash
node -e '
for (const [n, h, g] of [["Kilauea Iki 1959", 580, 9.80665], ["Tvashtar 1999 (Io)", 1500, 1.796]]) {
  const v = Math.sqrt(2 * g * h);
  console.log(n, "v", v.toFixed(1), "m/s  T", (2 * v / g).toFixed(1), "s  in planet units", (h / 63710).toFixed(4));
}'
```

| Fountain | Height | g (m/s²) | Launch speed | Flight time | Height in planet units |
|---|---|---|---|---|---|
| Kīlauea Iki, 1959 | 580 m | 9.81 | 106.7 m/s | 21.8 s | 0.009 |
| Tvashtar, Io, 1999 | 1.5 km | 1.796 | 73.4 m/s | 81.7 s | 0.024 |

Lower gravity throws the Io fountain ~2.6× higher from a slower launch, and its flight takes ~4× longer: the trend the game keeps. (Real fountains are gas-driven jets, not single throws, so these speeds are lower bounds for the fastest clots; the ballistic arc is still how each clot falls.)

`tests/lavaActivity.test.ts` checks the arc as implemented (`ballisticPoint`): it lands back on the sphere after 2v/g, peaks at v²/2g halfway, and weaker gravity gives higher, longer arcs.

## Game mapping

- **Colour ramp**: the blob shader in `planet/LavaEruptions.ts` goes black crust → dark red → orange → yellow-white with rising heat, the Volcano World order. Hot values go above 1 and are tone mapped, so the hottest melt reads as glowing. Blobs start yellow-white and cool through orange and red to dark crust by the time they land. The lava sea itself glows as a black body at its temperature (see *Close up: the lava lake's surface* below); the sea's own hue (red to orange, `PlanetStyle.sea`) still tints its glow halfway.
- **Scale**: the planet level was 63.7 km per unit when this was written (Earth's 6371 km radius was 100 units; it is now 400, and every length and speed below is multiplied by `GLOBE_SIZE_FACTOR` = 4 so the arcs look the same next to the planet, times unchanged), so even Io's record fountain would be 0.02 units tall, invisible next to a ship 4 units wide, and would take 80 s to fall. The heights and times are therefore **stylised**:
  - Arc gravity is `LAVA_GRAVITY · √g` = 3 units/s² at 1 g, with g floored at 0.2 (`MIN_ARC_GRAVITY`). For the same launch speed, peaks and flight times both scale as g^−½ instead of the real 1/g: weaker worlds still throw higher and slower, but a tiny moon's arcs don't take half a minute.
  - Launch speeds: fountains 3–4.5 units/s, big eruptions 6.5–9 units/s, times 0.6 + 0.4·(internal heat). At 1 g a fountain peaks ≈ 3.4 units after 3 s in the air and an eruption ≈ 13.5 units after 6 s.
  - Peaks are capped at 12% (fountains) and 30% (eruptions) of the body's radius (`MAX_PEAK_FRACTION`).
- **Rates** come from the climate's internal heat (`geothermal`, ≥ 0.8 on every lava body since their heat flow is at least Io's range): more vents, more frequent fountains and eruptions, faster throws. Io-like bodies are the reference: continuous activity somewhere on the surface.

## Open questions

- The Io fountain height comes from JPL's press release and image caption, not a paper; Keszthelyi et al. and Wilson & Head model Tvashtar's fountains in detail and could replace it.
- The USGS colour/temperature table was seen only as a search summary here; the USGS FAQ quoted below gives the same order (yellow 1000–1200 °C, orange 800–1000 °C, red 600–800 °C).

# Close up: the lava lake's surface

## Question

Seen from the UFO hovering a few units over a lava sea (low orbit, `LAVA_SEA_GLSL` in `world/lavaMaterial.ts`), the old sea was a smooth noise field with glowing contour lines, more like marbled wood than lava. To make it look real up close we needed:

1. What a real lava lake's surface looks like: how big its crust plates are, how wide and how hot its cracks are, how fast it moves, how fast fresh crust cools, how shiny it is.
2. What colour and how bright the glow is at each temperature, as a formula a shader can evaluate.
3. How games and shader artists draw convincing lava, and which of their techniques pay off in a procedural, per-pixel shader with no textures.

Precision: the right look and trends (colour and brightness by temperature, plate sizes against the ship, how the crust cools), not exact values: nothing here is read by the player.

Reference cases: Halemaʻumaʻu's lava lake (Kīlauea, 2008–2018 and 2020–), Erebus's phonolite lake, Erta Ale and Nyiragongo, and Loki Patera on Io.

## Sources

Accessed 2026-10-05. The USGS pages refuse plain `curl` (HTTP 403), so they were read with WebFetch by a research agent in this session; the PDFs were read directly. Values quoted as printed.

**Real lava lakes**

- **USGS HVO, "Thermal image sequence of summit lava lake motion"** (2013), https://www.usgs.gov/media/videos/thermal-image-sequence-summit-lava-lake-motion: "the lake is about 160 meters (520 feet) wide", "The surface moves at roughly 0.5 meters per second", "numerous thin crustal plates separated by hot cracks that split, merge, and reshape"; lava wells up at one margin and sinks at the other.
- **Patrick & Orr, USGS Techniques and Methods 13-A3** (2018), "Operational tracking of lava lake surface motion", https://pubs.usgs.gov/tm/13/a3/tm13a3.pdf: "large crustal plates (each tens of square meters in size, covering most of the lake's surface)", i.e. about 3–10 m across; surface speeds plotted 0–0.3 m/s; the "narrow bands" of high temperature are "the incandescent spreading zones between crustal plates"; crust is "drawn towards the spattering, where it downwells".
- **Peck & Minakami**, Kīlauea lava lakes, https://pubs.usgs.gov/publication/70221432: "Cracks open within a minute after molten lava is exposed … Within a few hours, additional cracks subdivide the plates into polygons averaging 15 ft in width"; cracks start "at temperatures ranging from ambient to about 900°C". Cracks within cracks: the hierarchy of scales the shader draws.
- **USGS image captions**: spatter "throwing material up to 13 feet (4 meters) into the air" where plates founder (https://www.usgs.gov/media/images/september-12-2022-active-lake-surface-halemaumau); a foundering event "approximately 30 m (100 ft) across" lasting "a few minutes" (https://www.usgs.gov/media/images/halemaumau-lava-lake-surface-foundering-kilauea-may-10-2021); "crustal plates separated by cracks. The darker colors along the cracks are newly cooled thin lobes of lava" (https://www.usgs.gov/media/images/june-12-2023-surface-pattern-crustal-foundering-kilauea); "shiny pahoehoe crust" (https://www.usgs.gov/media/images/aerial-view-shiny-pahoehoe-crust).
- **Lava lake review, Frontiers in Earth Science** (2023), https://www.frontiersin.org/journals/earth-science/articles/10.3389/feart.2023.1040199/full: "Chaotic lakes are stirred by fast (>1 m/s) and turbulent currents and incessant bubble bursting, which maintain their surface mostly crust-free and incandescent", while organised lakes have "a plastic to semi-rigid cooling crust divided in plates that moves in a slower (a few centimeters per second) and more coherent way". The game's hot currents (`lavaFlow`) play the first, its cooler stretches the second.
- **Erebus**, arXiv 1907.02899, https://arxiv.org/pdf/1907.02899: the lake is "∼40 m across"; surface "temperatures vary from ∼275−900 °C with mean temperatures ∼525−750 °C"; "Mean surface velocities are typically less than ∼0.1 m/s".
- **Loki Patera**, UC Berkeley's summary of de Kleer et al. 2017 (Nature), https://vcresearch.berkeley.edu/news/waves-lava-seen-ios-largest-volcanic-crater: a patera "about 200 kilometers" across, resurfaced by "two waves that each swept from west to east at about a kilometer … per day".

**Temperature, cooling and colour**

- **USGS FAQ "How hot is a Hawaiian volcano?"**, https://www.usgs.gov/faqs/how-hot-a-hawaiian-volcano: eruption temperature "about 1,170 degrees Celsius"; yellow 1000–1200 °C, orange 800–1000 °C, red 600–800 °C; the surface "cools … by hundreds of degrees per second".
- **Hon, Kauahikaua, Denlinger & Mackay (1994)**, "Emplacement and inflation of pahoehoe sheet flows", GSA Bulletin 106 (abstract read at https://pubs.usgs.gov/publication/70170402; the fit as quoted by Harris 2007/2008, seen as a search snippet): crust surface **T = 303 − 140·log10(t in hours) °C**, against measurements of 825 °C at 1 s, 614 °C at 10 s and 563 °C at 60 s; crust thickness **t = 164.8·H²** (t in hours, H in m).
- **Draper point**, https://en.wikipedia.org/wiki/Draper_point: 525 °C (798 K), where hot bodies begin to glow visibly.
- **Planck's law** with h = 6.62607015 × 10⁻³⁴ J Hz⁻¹ and k = 1.380649 × 10⁻²³ J K⁻¹ (NIST CODATA, https://physics.nist.gov/cgi-bin/cuu/Value?h and ?k, exact in the SI).
- **Wyman, Sloan & Shirley (2013)**, "Simple Analytic Approximations to the CIE XYZ Color Matching Functions", JCGT 2(2), https://jcgt.org/published/0002/02/01/paper.pdf: the multi-lobe piecewise Gaussian fit of the CIE 1931 observer (Table 1 / Listing 1), whose error is below the scatter between observers.
- **CSS Color 4**, https://drafts.csswg.org/css-color-4/conversions.js: the XYZ → linear sRGB (D65) matrix, `XYZ_to_lin_sRGB`.
- **CIE 1931 2° tables, CVRL**, http://cvrl.ucl.ac.uk/database/data/cmfs/ciexyz31_1.csv: used by the research agent's independent luminance integral (below).
- **Sideromelane (basaltic glass)**, American Mineralogist 13 (1928), http://www.minsocam.org/ammin/AM13/AM13_360.pdf (via search snippet): refractive index n = 1.583–1.597, so a Fresnel reflectance at normal incidence F0 = ((n − 1)/(n + 1))² ≈ 0.051–0.053.

**How others draw lava**

- **Vlachos, "Water Flow in Portal 2"** (SIGGRAPH 2010), https://cdn.akamai.steamstatic.com/apps/valve/2010/siggraph2010_vlachos_waterflow.pdf: flow maps, two layers "offset half a phase", noise to hide the pulsing. **Catlike Coding, "Texture Distortion"**, https://catlikecoding.com/unity/tutorials/flow/texture-distortion/: the same, weight 1 − |1 − 2p|. **80.lv / Nature Manufacture, "Making Lava for Games"**, https://80.lv/articles/making-lava-for-games: crust and lava blended by height, emission tied to slope, and a warning that flow-map resets "flash" on emissive surfaces, worse on lava than on water.
- **Íñigo Quílez, "Voronoi – distances"**, https://iquilezles.org/articles/voronoilines/: the distance to a Voronoi cell's border (not F2 − F1, which "is not a distance really") for even crack widths.
- **Daniel Ilett, "Voronoi lava"**, https://danielilett.com/2023-06-20-tut7-2-voronoi-lava/: Voronoi edge distance and a smoothstep split rock from lava; HDR emission; a normal from the height. **AuraLite shaders**, https://www.curseforge.com/minecraft/shaders/auralite-shaders: a "procedural Voronoi crack field", parallax between crust and magma, roughness 0.95 on the crust and 0.02 in the cracks, heat shimmer.
- **Unreal's BlackBody node**, https://dev.epicgames.com/documentation/en-us/unreal-engine/utility-expressions?application_version=4.27: a temperature in kelvin gives the emissive colour and intensity, the approach taken here.
- No public lava breakdowns were found for God of War, Horizon, Battlefront's Mustafar, Elden Ring, No Man's Sky or Star Citizen; Shadertoy can't be read by fetch.

## Measurements

### Black-body colour and brightness

`src/gen/incandescence.ts` integrates Planck's law over 360–830 nm through Wyman et al.'s CIE 1931 fit and converts to linear sRGB with the CSS Color 4 matrix. The same as a standalone script:

```js
// node blackbody.mjs
const h = 6.62607015e-34, c = 299792458, k = 1.380649e-23;
const g = (x, b, l, r) => { const t = (x - b) * (x < b ? l : r); return Math.exp(-0.5 * t * t); };
const xb = (w) => 0.362 * g(w, 442.0, 0.0624, 0.0374) + 1.056 * g(w, 599.8, 0.0264, 0.0323) - 0.065 * g(w, 501.1, 0.049, 0.0382);
const yb = (w) => 0.821 * g(w, 568.8, 0.0213, 0.0247) + 0.286 * g(w, 530.9, 0.0613, 0.0322);
const zb = (w) => 1.217 * g(w, 437.0, 0.0845, 0.0278) + 0.681 * g(w, 459.0, 0.0385, 0.0725);
const planck = (nm, T) => { const l = nm * 1e-9; return (2 * h * c * c) / l ** 5 / (Math.exp((h * c) / (l * k * T)) - 1); };
const M = [[12831 / 3959, -329 / 214, -1974 / 3959], [-851781 / 878810, 1648619 / 878810, 36519 / 878810], [705 / 12673, -2585 / 12673, 705 / 667]];
const xyz = (T) => { let X = 0, Y = 0, Z = 0; for (let w = 360; w <= 830; w++) { const L = planck(w, T); X += L * xb(w); Y += L * yb(w); Z += L * zb(w); } return [X, Y, Z]; };
const Yref = xyz(1443)[1];
for (const T of [800, 1000, 1200, 1400, 1443, 2000, 6500]) {
  const [X, Y, Z] = xyz(T), rgb = M.map((r) => r[0] * X + r[1] * Y + r[2] * Z), m = Math.max(...rgb);
  console.log(T, (Y / Yref).toExponential(2), rgb.map((v) => Math.max(v / m, 0).toFixed(4)).join(' '), (X / (X + Y + Z)).toFixed(4), (Y / (X + Y + Z)).toFixed(4));
}
```

| T | °C | Y / Y(1443 K) | linear sRGB (max 1) | x, y |
|---|---|---|---|---|
| 800 K | 527 | 2.0 × 10⁻⁶ | 1, 0, 0 | 0.6632, 0.3362 |
| 1000 K | 727 | 6.6 × 10⁻⁴ | 1, 0.029, 0 | 0.6419, 0.3554 |
| 1200 K | 927 | 3.4 × 10⁻² | 1, 0.074, 0 | 0.6178, 0.3748 |
| 1400 K | 1127 | 0.60 | 1, 0.121, 0 | 0.5932, 0.3911 |
| 1443 K | 1170 | 1 | 1, 0.132, 0 | 0.5880, 0.3941 |
| 2000 K | 1727 | 113 | 1, 0.267, 0.008 | 0.5241, 0.4159 |
| 6500 K | 6227 | 7.5 × 10⁵ | 1, 0.947, 0.994 | 0.3134, 0.3239 |

Checks:

- **The Planckian locus**: 6500 K lands at (0.3134, 0.3239) against the CIE's (0.3135, 0.3236), and 2000 K at (0.5241, 0.4159) against Kim et al.'s (0.5269, 0.4133). That is within 0.003, the error of Wyman et al.'s fit; the research agent's integral with the CVRL tables gave (0.5267, 0.4133).
- **Luminance, against an independent integral**: the agent's script (CVRL tables, ×683 lm/W) gives 1.41 cd/m² at 700 °C, 139 at 1200 K, 2440 at 1400 K, 3230 at 1150 °C, and 5.99 × 10⁵ cd/m² at 2042 K, the old definition of the candela (freezing platinum, 6 × 10⁵). Its ratio 139/2440 = 0.0570 agrees with this fit's 0.0572.
- **The colours**: deep red at 1000 K and orange-red at the melt, as the USGS colour table says. Blue is out of the sRGB gamut (negative) below about 1900 K. The yellow-white people see at the hottest spots comes from the eye or the camera saturating, not from the colour itself; ACES tone mapping does the same to values above 1.
- **How steep it is**: from 700 °C to 1150 °C the luminance rises about 2300×. So only the melt and crust within seconds of forming glow at all; everything else is dark rock.

**The shader's fit.** Wien's approximation suggests each channel goes as exp(ln − c/T). `fitGlow` fits that by least squares on the logarithms every 25 K over 1000–1500 K:

| | ln | c (K) | error 1000–1500 K |
|---|---|---|---|
| red | 17.1024 | 22970 | under 0.7% |
| green | 18.3476 | 27647 | under 5% from 1100 K up, 10% at 1000 K (where green is 3% of red) |

### The crust's surface temperature

Hon et al.'s fit against their own measurements:

| Age | Fit | Measured |
|---|---|---|
| 1 s | 801 °C | 825 °C |
| 10 s | 661 °C | 614 °C |
| 60 s | 552 °C | 563 °C |
| 10 min | 412 °C | |
| 1 h | 303 °C | |

The fit is within 50 K of the measurements. It passes the Draper point (525 °C) at about 90 s. So a crack's glowing rim is the crust under a minute or two old. At the lake's 0.3 m/s, that is a few tens of centimetres to metres from the crack. Erebus's surface (275–900 °C) and Erta Ale's crust (300–500 °C, snippet only) fit the same picture.

### How much of the surface a scale's cracks cover

From afar the cracks are averaged. That needs the share of the surface lying within a half-width a (in cells) of a wall of the shader's own cells. A Monte Carlo over 200,000 points uses the shader's hash and its distance to the bisector (`cover.mjs` in the session's scratchpad; it is the shader's `lavaCells` with 3×3×3 search and full jitter, in doubles). The fit 1 − exp(−5.5a − 6a²) matches it to about 1%:

| a | 0.005 | 0.01 | 0.02 | 0.05 | 0.1 | 0.2 | 0.3 | 0.4 |
|---|---|---|---|---|---|---|---|---|
| measured | 0.029 | 0.054 | 0.106 | 0.257 | 0.464 | 0.741 | 0.894 | 0.961 |
| 1 − exp(−5.5a − 6a²) | 0.027 | 0.054 | 0.106 | 0.252 | 0.457 | 0.738 | 0.888 | 0.958 |

The shader then searches only 2 × 2 × 2 cells with jitter 0.75, which changes the cells slightly. The fit is close enough for an average that only shows from afar.

### Cost

Under software WebGL (`npm run shot --low`, the lab's lava world, the camera 40 units over the sea), the old sea drew at 11 fps and the new one at 4. With the 3 × 3 × 3 Voronoi search it was 3, and 5 without the walls' warp noise. On a GPU the sea is a few thousand ALU operations per pixel, about five times the old one. Phones draw one scale fewer (`lavaParams.detail`).

## Game mapping

`LAVA_SEA_GLSL` (the low-orbit sea and the planet map) and `lavaAveraged` (the system view's per-vertex sea, `paintTerrain`):

- **Temperature, not a ramp.** Every pixel's glow is `lavaIncandescence(T)`, the fitted black body relative to the melt at `MELT_T` = 1443 K (1170 °C, USGS). It is scaled by `LAVA_EXPOSURE` = 0.45, the sea's tint and `lavaParams.glow`, and tone mapped (Unreal's BlackBody approach). Hot spots go above 1 and roll to yellow; cool crust is black.
- **Plates at four scales.** Voronoi cells of `lavaParams.plate` = 54 units, then 18, 6 and 2 (each a third). A unit is taken as about a metre up close; this is stylised, since the UFO is ~4 across. That puts the 6- and 2-unit plates at Halemaʻumaʻu's 3–10 m and the 15 ft polygons, under the ship. The 54- and 18-unit cells are the long spreading cracks that break the sea into regions. Each crack's half-width is a share of its cells: 1.2% (÷ (1 + scale) for finer ones) where the crust is whole, plus up to 42% (÷ (1 + 2·scale)) where the currents run hot (`lavaOpen` of the flow and vents). Hot currents thus open into wide rifts and pools with rafts of crust, the "chaotic" lake, and cool stretches keep thin cracks, the "organised" one. The walls are bent by noise of their own size (`WALL_WARP` = 0.22 cells), and each crack narrows and widens along its length. The distance to a wall is the distance to the bisector of the two nearest cell points (Quílez), so cracks keep their width.
- **What glows.** The melt in a crack is at `MELT_T` + 25 K near erupting vents, 60 K cooler on broad patches, and up to 130 K cooler along folded skin filaments (the ridges of a noise). It chills against the crack's edges, 170 K cooler within about 1.2 units (stylised). Thin cracks are therefore dull red and wide ones orange with a hot core. Finer scales' cracks are 110 K cooler each: they open into the crust, not down to the melt. Beside a crack, the crust's surface is at Hon et al.'s temperature for its age, its distance from the crack over the lake's 0.3 m/s (0.3 units/s). That gives a dim red rim that fades to black within a unit or so.
- **The crust.** It is the planet's `style.low` lit by the sun with a bump normal from screen-space derivatives (Mikkelsen's surface gradient), the plates standing slightly above their cracks with ropy folds along the young edges of the 18-unit scale. Each plate is shaded a little differently. There is a glassy sheen with F0 = 0.05 (basaltic glass, n ≈ 1.59), fairly rough on the crust and sharp on the melt.
- **Drift.** The whole crust drifts at 0.3 units/s × the lava's pace in one direction per body. It is shifted with the slowly changing currents, so plates in different currents part. The drift is passed per scale in cells, wrapped by 289 (the hash's period), so all scales move as one and the numbers stay small. No flow-map crossfade is used: on an emissive surface it pulses visibly (80.lv).
- **From afar.** A scale under 3–8 pixels per cell fades to its average: the share of the surface its cracks cover (the fit above) at their average temperature, chilled by the same 170 K at half their half-width. With every scale averaged, that is exactly `lavaAveraged`, which the system view paints per vertex. Zooming out from low orbit to the system view therefore crossfades between the same averages.
- **Deliberate departures.** Real melt by day is about as bright as sunlit dark rock: 3230 cd/m² against roughly 2500 for rock of albedo 0.08 under a 100,000 lux sun (an estimate, not a source). It reads as glowing only at night or in a photo exposed for the lava. The game keeps it that bright by day, through the exposure. The crack widths, the melt's chill and the four scales' sizes are tuned by eye against the photos the sources show; their trends (plates metres across under the ship, crusts black within a minute's drift, cracks subdividing plates) are the measured ones.

## Open questions

- The **width of glowing cracks** (in cm) was not found in any source; the half-widths are tuned by eye.
- **Hon et al.'s fit** is quoted from Harris's papers via a search snippet; the 1994 paper itself (GSA Bulletin) is paywalled.
- **Erta Ale's** crack (700–1070 °C) and crust (300–500 °C) temperatures, Spampinato et al. 2008, were seen only as a snippet.
- **Not done yet**, in order of payoff from the survey: spatter and bubble bursts at plate margins (a white-hot disc and thrown clots, metres to tens of metres, USGS PP 1867-E), foundering waves that sweep the crust's age back to zero (Loki Patera's ~1 km/day fronts; Kīlauea's 30 m patches over a few minutes), parallax so the cracks sit below the crust at grazing angles, and heat shimmer.
