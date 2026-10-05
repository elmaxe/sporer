# Geysers: cryogeysers, steam geysers and Io's plumes

## Question

Roadmap step 15 gives bodies with internal heat (step 12's climate) geysers in low orbit (`gen/geysers.ts`, `planet/Geysers.ts`). It needs:

1. **Which bodies** have them, and what kind, from the climate (temperature, water, pressure, heat flow).
2. **How tall and how fast** real plumes are, on Earth, Enceladus, Triton and Io, and whether a ballistic arc describes them.
3. **How often and how long** they erupt.
4. How all that maps to the planet level's units, where it has to be stylised (as the lava was, see `lava.md`).

Precision: the right kind on the right body, and the trends (weaker gravity throws higher; Io's two plume classes differ by ~3× in height). Nothing here is read by the player as a number.

Reference cases: Old Faithful and Strokkur (steam), Enceladus (cryo, tidally heated), Triton (cryo in thin air), Io's Prometheus and Pele plumes (sulphur). Ganymede (icy, no plumes) is the negative case.

## Sources

All accessed 2026-09-29.

- **NPS, "Old Faithful"**, https://www.nps.gov/yell/planyourvisit/exploreoldfaithful.htm (read via WebFetch): "Old Faithful can vary in height from 106 to more than 180 feet (32.3–54.8 m), averaging 130 feet (40 m)." "Eruptions normally last between 1½ to 5 minutes". "as of January 2025, [the median interval] is 102 minutes ± 10 minutes, with intervals ranging from 54 to 118 minutes." Lone Star "erupts 30–45 feet (9–14 m) about every three hours."
- **Strokkur** (Wikipedia via search summary, cross-check only): erupts every 6–10 minutes, usually 15–20 m, sometimes up to 40 m.
- **NASA, Cassini at Enceladus** (search summaries of science.nasa.gov / jpl.nasa.gov pages): the material "shoots out at about 800 miles per hour (400 meters per second)"; "water ice particles reach altitudes as high as 400 kilometers (250 miles) above the surface".
- **Teolis et al. 2017, "Enceladus Plume Structure and Time Variability"**, Astrobiology, https://pmc.ncbi.nlm.nih.gov/articles/PMC5610430/ (read via WebFetch): "the mean molecular speed in the jets significantly exceeds (by at least a factor two) the 240 m/s Enceladus escape speed"; gas reaches "Mach 10 before escaping the surface".
- **Tiger stripes** (Wikipedia, https://en.wikipedia.org/wiki/Tiger_stripes_(Enceladus), citing Porco et al. 2006): "each tiger stripe depression is 130 kilometers long, 2 kilometers wide", "spaced approximately 35 kilometers apart"; the active region is "south of 70° South latitude"; "over 100 geysers have been identified".
- **Hedman et al. 2013, Nature 500, 182, "An observed correlation between plume activity and tidal stresses on Enceladus"** (abstract via search results): the plume's integrated brightness is "several times" greater near apocentre than near pericentre, about three times.
- **NASA/JPL, "Voyager 2 Discovers Eruption on Triton"**, https://www.jpl.nasa.gov/news/voyager-2-discovers-eruption-on-triton/ (read via WebFetch): the plume "rises vertically nearly eight kilometers (five miles)" and "drifts 150 kilometers (90 miles) westward" in Triton's winds; "pressurized gas, probably nitrogen, rises from beneath the surface and carries aloft dark particles and possibly ice crystals". Soderblom et al. 1990 (Science 250, 410; abstract): at least four active plumes.
- **Oregon State University, Volcano World, "Eruption Styles: Io"**, https://volcano.oregonstate.edu/eruption-styles-io (read via WebFetch): Prometheus-type plumes "50-120 km" high, "about 500 m/s", deposits "200-600 km diameter", lasting "months to years"; Pele-type "up to 300 km", "up to 1000 m/s", deposits "1000-1500 km in diameter", lasting "days to months"; "Sulfur dioxide gas may be the driving force". Wikipedia's Pele article (search summary) adds Galileo heights of 300–426 km, and 460 km in December 1996.
- **JPL Solar System Dynamics, planetary satellite physical parameters**, https://ssd.jpl.nasa.gov/sats/phys_par/ (raw table via curl): GM and mean radius, Io 5959.91547 km³/s², 1821.49 km; Europa 3202.71210, 1560.80; Enceladus 7.21037, 252.10; Triton 1428.49546, 1352.60.
- Heat flows (Earth 0.092 W/m², Io 2.24, Enceladus 0.019–0.050) and the game's Ganymede analogue come from `climate.md`.

## Measurements

Launch speed to reach height h, from energy with gravity falling off with height: v² = 2GM(1/R − 1/(R + h)). The flat-gravity v = √(2gh) is shown alongside; it fails only for Enceladus, whose plume is taller than the moon.

```bash
node -e '
const bodies = [
  ["Old Faithful (Earth)", 398600.4418, 6371.0, 0.040],
  ["Strokkur (Earth)", 398600.4418, 6371.0, 0.020],
  ["Enceladus plume", 7.21037, 252.10, 400],
  ["Triton plume", 1428.49546, 1352.60, 8],
  ["Io Prometheus", 5959.91547, 1821.49, 100],
  ["Io Pele", 5959.91547, 1821.49, 300],
];
for (const [n, GM, R, h] of bodies) {
  const g = GM / R / R * 1000; // m/s²
  const v = Math.sqrt(2 * GM * (1 / R - 1 / (R + h))) * 1000;
  const flat = Math.sqrt(2 * g * h * 1000);
  console.log(n.padEnd(22), "g", g.toFixed(3), "h/R", (h / R).toPrecision(3), "v", v.toFixed(1), "flat", flat.toFixed(1), "T flat", (2 * flat / g).toFixed(0), "s");
}'
```

| Plume | g (m/s²) | Height | h / R | Launch speed | Flat-gravity speed | Flight time (flat) |
|---|---|---|---|---|---|---|
| Old Faithful | 9.82 | 40 m | 6.3e-6 | 28.0 m/s | 28.0 m/s | 6 s |
| Strokkur | 9.82 | 20 m | 3.1e-6 | 19.8 m/s | 19.8 m/s | 4 s |
| Enceladus | 0.113 | 400 km | 1.59 | 187 m/s | 301 m/s | (n/a) |
| Triton | 0.781 | 8 km | 0.0059 | 111.4 m/s | 111.8 m/s | 286 s |
| Io, Prometheus | 1.796 | 100 km | 0.055 | 583 m/s | 599 m/s | 667 s |
| Io, Pele | 1.796 | 300 km | 0.165 | 962 m/s | 1038 m/s | 1156 s |

(Earth's g here is GM/R² at the mean radius, 9.82 m/s², a little above standard gravity.) The ballistic reading holds: Io's quoted eruption speeds (~500 and ~1000 m/s) are what reaches their heights. Enceladus's grains need 187 m/s to reach 400 km, below the 240 m/s escape speed, while the gas goes faster (400 m/s, and ≥ 2× escape per Teolis et al.): the fast part escapes to Saturn's E ring and the slow grains fall back. Triton's 8 km stem is not ballistic; the plume stops at an altitude (where the atmosphere's temperature inversion caps it) and then drifts downwind, 19× as far as it rose.

Rhythm:

| Geyser | Erupts | Lasts | Duty (fraction of time erupting) |
|---|---|---|---|
| Old Faithful | every 54–118 min (median 102) | 1.5–5 min | 0.015–0.05 |
| Strokkur | every 6–10 min | seconds | ~0.01 |
| Enceladus | continuously, ~3× brighter at apocentre | years (all of Cassini) | ~1 |
| Io, Prometheus | | months to years | ~1 |
| Io, Pele | | days to months | |

Which bodies (the game's own code, `geyserKind` over 1500 systems of seed 1337; rerun with a scratch `vite-node` script over `generateSystem` and `geyserActivity`):

| Kind | Bodies | Radius (units, p10/p50/max) | Vents (p10/p50/max) | Highest plume (units, p10/p50/max) | Pool (particles, p10/p50/max) |
|---|---|---|---|---|---|
| cryo, moons | 538 ice | 21.9 / 36.4 / 75.0 | 8 / 12 / 12 | 11.9 / 13.0 / 13.4 | 3849 / 7290 / 10332 |
| cryo, planets | 509 ice, 35 terran, 12 ocean | 80.6 / 115.1 / 172.9 | 4 / 6 / 8 | 4.7 / 5.5 / 9.3 | 2289 / 3522 / 5991 |
| steam | 770 terran, 316 ocean, 21 desert | 87.7 / 118.2 / 173.2 | 7 / 11 / 15 | 4.2 / 4.6 / 5.6 | 3468 / 7167 / 11374 |
| sulphur | 625 lava moons, 175 barren moons, 144 lava planets | 12.3 / 30.5 / 171.6 | 2 / 4 / 6 | 2.8 / 3.8 / 37.4 | 4008 / 9237 / 20424 |

1279 of the 1500 systems have a body with geysers; most solid bodies (dry barren rock, cold dwarfs, Venus-like lava worlds, gas giants) have none.

## Game mapping

- **Kinds** (`geyserKind`):
  - *cryo*: water frozen (`waterState` ice) on an ice world (or a frozen terran or ocean world) with heat flow ≥ 0.018 W/m², just under Enceladus's measured 0.019–0.050. A Ganymede analogue (radiogenic 0.0135 W/m² in the game) has none, as in reality.
  - *steam*: liquid water on a terran, ocean or desert world with heat flow ≥ 0.046 W/m², half Earth's (a gameplay threshold: Earth has geysers, and a world with half its heat would still have some hot spots).
  - *sulphur*: dry lava or barren bodies with heat flow ≥ 1 W/m² (the lava worlds' floor in `climate.ts`, half Io's) and under 1 mbar: Io's umbrella plumes rise in near vacuum, and a Venus-like lava world's 92 bar would smother them.
- **Vents** (`placeVents`): steam geysers in 1–3 fields of 3–5 vents on land, 0.005–0.03 rad apart (Yellowstone's basins); a cryo moon's along four tiger stripes round the south pole, 130/252.1 rad long and 35/252.1 rad apart (Enceladus's real proportions, as angles on the moon); a cryo planet's along 1–3 cracks; Io-style plumes at random volcanic centres. Each vent sits on the ground as the planet level draws it (`groundRadius`, mirroring `createTerrainGeometry`).
- **Motion**: particles move under linear drag k and gravity g, h = up·E − g·F with E = (1 − e^(−kt))/k and F = (t − E)/k (the ballistic arc when k = 0, `plumePoint`), plus a sideways slide over the sphere and a wind drift. The planet level is 63.7 km per unit, so real heights are stylised:
  - Units below are at the original planet scale (Earth radius 100). Since the globes grew 4× (Earth radius 400, `GLOBE_SIZE_FACTOR`), every length and speed here is multiplied by that factor and no time is, so plumes look the same next to the planet and last as long.
  - Arc gravity is the lava's, 3·√g units/s², floored at 0.2 g.
  - Cryo plumes peak at 6 units at 1 g, scaling as g^−½, capped at 60% of the radius: a small moon's reach ~13 units (Enceladus's is 1.6 radii; kept tall but under the ship's flight height), an Earth-sized ice world's ~5. Grains fly ballistically (drag 0.3/s where there's air) in a 0.14 rad cone and land back.
  - Steam geysers peak at 5 units at 1 g (about the ship's width), g^−½, capped at 6% of the radius. 30% of the particles are droplets thrown to that height; 70% are puffs whose jet stalls there (drag 1.2/s) and then rise at 0.35/1.2 ≈ 0.3 units/s as a buoyant cloud for 5–9 s, growing 4×.
  - Io-style plumes keep their real height as a fraction of the radius: Prometheus-type 0.027–0.066 R, one vent in four Pele-type 0.165–0.234 R, never under 3 units (MIN_PEAK: smaller would be a speck beside the 4-unit ship; only the 23% cap, on the smallest moons, goes lower); a 0.6 rad cone, so the umbrella spreads about twice as wide as it is tall, like their deposit rings (Pele: 1000–1500 km wide for 300 km tall).
  - Wind, where the pressure is at least 1 µbar (Triton has 14): 0.5–1.2 units/s, one prevailing heading per body, so plumes trail off like Triton's.
- **Rhythm** (compressed from minutes to seconds, with longer duty so a field usually has one going): steam vents erupt every 20–55 s for 20–35% of it (Old Faithful: 1.5–5 min of every ~100); cryo vents every 20–35 s for 70–95%, near-continuous like Enceladus, and a moon's output swings ±50% (3× brightest to faintest, Hedman et al.) over a 30 s stand-in for its orbit; Io-style plumes every 45–90 s for 60–90%. Hotter bodies miss fewer cycles and throw more particles.
- **Look** (`planet/Geysers.ts`): soft round particles, bluish-white ice, white steam, pale yellow SO₂ dust; lit by the sun at the particle's position (day side, a dusk band, faint at night) and brighter looking towards the sun through them (ice grains forward-scatter; Enceladus's plume is brightest backlit).

## Open questions

- Strokkur, the Enceladus height and speed, Hedman's factor of three and Soderblom's plume count were seen as search summaries, not the pages or papers themselves.
- The steam threshold (half Earth's heat flow) and the stripes on every cryo moon (in reality most icy moons, e.g. Ganymede, Callisto, Titan, show none) are gameplay choices. The heat threshold does leave Ganymede analogues without them.
- Triton's plumes are thought to be driven by sunlight on nitrogen ice (a solid-state greenhouse), not internal heat, so a Triton analogue in the game gets them only if its heat flow passes the cryo threshold.
- Enceladus feeding Saturn's E ring (a faint ring of ice along a strongly active moon's orbit in the system view) is not done.

# Fumaroles on airless rock, and the vents' sound

## Question

A follow-up asked for more smoke, fire and geysers on barren and airless worlds, with sound. Before this, under 3% of airless barren bodies vented: 38 of 1356 in the first 400 systems of galaxy 1337, all of them Io-hot. That needs:

1. **Which airless rocky bodies vent at all in reality, and how much heat they have.**
2. **How hot a vent's gas is**, and when rock glows.
3. **What a venting jet sounds like.**

It feeds `gen/geysers.ts` (the `fumarole` kind, its vents and particles), `planet/Geysers.ts` (smoke, flames and embers), `audio/ventMix.ts` and `planet/VentSounds.ts`, and the synthesised cues (`scripts/ventSounds.sh`).

## Sources

All accessed 2026-10-04.

- **Moon's heat flow**, Nagihara et al., LPSC 2018 #1470 (https://www.hou.usra.edu/meetings/lpsc2018/pdf/1470.pdf): "Apollo 15 site (21 mW/m2) was greater than … Apollo 17 site (16 mW/m2)".
- **Mercury's heat flow**, models only (Fleury et al. 2024, GRL, https://elib.dlr.de/208730/): present-day surface maps spanning "12–20 mW/m²".
- **The Moon still vents**, Lawson et al. 2002 (https://www.osti.gov/servlets/purl/976310):
  - "radon gas is presently emanating from the vicinity of craters Aristarchus and Kepler".
  - Po-210 maps "vents which have been active over the last approximately 60 years".
  - On Apollo 17, "argon-40 is released from the lunar interior every few months, apparently in concert with some of the shallow moonquakes".
- **Mercury's hollows** (DPS one-pager): "The pits may be actively forming today"; volatiles "escape the rocks as gas, leading to collapse".
- **Fumarole temperatures**, USGS Volcano Hazards Program: "range in temperature from boiling up to several hundred degrees (about 400 °C or 750 °F)".
- **Draper point** (Draper 1847, via Wikipedia's raw page): "977 °F" (525 °C, 798 K), "above which almost all solid materials visibly glow".
- **Jet noise**, McKee et al. 2017, a fumarole at Aso (https://www.osti.gov/pages/servlets/purl/1366922):
  - The jet is "~2.5 m" across and "~260°C", moving at "79 to 132 m/s".
  - Its sound is a "7-10 Hz spectral peak", "predominantly below 20 Hz".
  - The Strouhal number "asymptotically approaches a constant of ~0.19, independent of jet temperature" (Tam et al. 1996), so f = St·U/D.

## Measurements

The Aso jet's peak, f = 0.19·U/D:
- 0.19·79/2.5 = 6.0 Hz and 0.19·132/2.5 = 10 Hz, matching the measured 7–10 Hz.
- A small vent hisses in the audible band: D = 0.1 m at 100 m/s gives ~190 Hz, and D = 2 cm at 200 m/s ~1.9 kHz.

Heat flow over the airless bodies of the first 400 systems (galaxy 1337), and the share at or above each threshold among those with no geysers before:

| type | count | q10 | median | q90 | ≥ 0.001 | ≥ 0.002 | ≥ 0.005 |
|---|---|---|---|---|---|---|---|
| barren | 1356 | 0.0002 | 0.005 | 0.17 | 0.71 | 0.61 | 0.48 |
| desert | 53 | 0.008 | 0.025 | 0.10 | 1.00 | 0.98 | 0.96 |

## Game mapping

- **Kind** (`geyserKind`): *fumarole*, for an airless (under 1 mbar) barren, desert or lava body that isn't Io-hot, with heat flow ≥ 0.002 W/m² (`FUMAROLE_MIN_HEAT_FLOW`).
  - That is a tenth of the Moon's measured 16–21 mW/m², so about 60% of airless barren bodies vent, the Moon included.
  - Deliberately stylised: the real Moon's radon and argon are far too faint to see. Its venting today, and Mercury's hollows, are the precedent.
- **Activity.** `fumaroleHeat` runs on a log scale from 0.002 to 0.2 W/m² (`FUMAROLE_FULL_HEAT_FLOW`), since the bodies span two orders of magnitude.
- **Vents** sit in 2–6 fissures by heat, each 3–5 vents within ±0.035 rad along a heading.
- **Plumes** reach 3 units × GLOBE_SIZE_FACTOR at 1 g (g^−½), capped at 5% of the radius. Each vent smokes every 14–32 s for 55–90% of it.
- **Particles:**
  - *Smoke* (half): stalls like steam (drag 1.1/s) and hangs, rising slowly and growing 3.5×. It would really fan out into the vacuum, so this is stylised to billow. Dark grey, lit by the sun, and lit orange from below by the fire for its first 30%.
  - *Flames* (a quarter): short-lived (0.5–1.2 s) licks at the mouth, yellow-orange going red.
  - *Embers* (the rest): thrown on short ballistic arcs, cooling from yellow-white to a dull red as they fall. Glowing rock is over the Draper point, 525 °C, so hotter than most fumaroles' gas; they stand for the hottest vents.
  - Flames and embers glow by their own light: the shader blends premultiplied, adding them to what's behind instead of covering it.
- **Io-style plumes** come from more volcanic centres: 3–9, up from 2–6 (Io has ~150 active at a time).
- **Sound.** The loops carry no recordings: `scripts/ventSounds.sh` synthesises them from filtered noise.
  - *geyserHiss* (cryo, steam): a surging 1.1–6.5 kHz hiss, where a small vent's jet noise falls, over a low roar.
  - *ventRumble* (fumarole, sulphur): a 160 Hz rumble, the 350–1800 Hz roar of flame and crackling.
  - *ventBurst*: a whoosh and a thump as an eruption starts.
  - `VentSounds` sets the loop's level from the vents erupting near the camera. Each counts 1/(1 + (d/reach)²), with the reach 2 plume heights and at least 10 units, as the stars' loops fall off. Each is weighted by how far into its eruption it is (`eruptionLoudness`). They sum to 1 − e^−Σ.
  - Pitch by kind: cryo 1.2, Io-style 0.75.
  - A burst is heard when a vent loud enough alone (0.3) starts, at most every 1.5 s.
  - Airless bodies would really be silent near a vent, as the descent is (`reentry` is silent there). Here, as for the stars in space, the game plays them anyway.

## Open questions

- A real Io-hot or Moon-like body's vents are invisible from orbit or don't exist. The fumaroles are a gameplay choice, and the threshold is set by how many bodies it should touch, not by any measurement.
- The real acoustic spectra of geysers (Old Faithful's 10–40 Hz and 50–65 Hz) were seen only in search summaries. The loops are pitched where a small jet's noise would be, not measured against them.
