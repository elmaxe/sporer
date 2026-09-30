# Weather: clouds, storms, rain and lightning

## Question

Roadmap step 22 gives some bodies weather (`gen/weather.ts`, drawn by `world/weatherLook.ts` and `planet/Weather.ts`). It needs:

1. **Which bodies** have weather, and what kind, from the climate (step 12): what condenses into cloud and rain (water, sulphuric acid, methane), or whether only dust gets lifted.
2. **How cloudy** a world is: Earth's cloud fraction, and how it differs over land and sea; Titan's.
3. **Storms**: how long thunderstorms and tropical cyclones last, how big they are, where they form (cyclones need a warm sea and the Coriolis force).
4. **Lightning**: how often, how a flash looks in time (strokes), how many strike the ground, how it changes with temperature, and where there is none. The user's questions: *is lightning more likely on lava planets, and do volcanoes make lightning?*
5. **Rain**: how fast drops of water, methane and snow fall, and whether acid rain reaches the ground.

Precision: the right weather on the right body and the right trends (warmer → more lightning; cyclones only over warm seas, off the equator). Times and sizes are stylised like the geysers'; nothing is read by the player as a number.

Reference cases: Earth (water), Venus (acid), Titan (methane), Mars (dust), Io and the Moon (airless: none), Pluto (a trace of N₂: none), Hunga Tonga 2022 (volcanic lightning).

## Sources

All accessed 2026-09-30 (search result summaries unless noted).

- **Christian et al. 2003, "Global frequency and distribution of lightning as observed from space by the Optical Transient Detector"**, JGR 108(D1), https://www.earthdata.nasa.gov/s3fs-public/2025-02/GlobalFreqDistofLightningObservedfromSpacebyOTD.pdf: about 1.4 billion flashes a year, "44 ± 5 lightning flashes (intracloud and cloud-to-ground combined) occurring around the globe every second", well below the old 100/s estimate.
- **USGS / Van Eaton et al. 2023, GRL**, https://www.usgs.gov/news/science-snippet/tongas-hunga-eruption-produced-most-intense-lightning-ever-recorded and https://phys.org/news/2023-06-tonga-hunga-eruption-intense-lightning.html: the Hunga eruption's plume peaked at **2,615 flashes per minute** for nearly five minutes, ~192,000 flashes in all; the previous record was 993 per minute in a thunderstorm over the southern US (1999).
- **Volcanic lightning mechanisms**: Aplin et al., "Electrical charging of ash in Icelandic volcanic plumes", https://arxiv.org/pdf/1404.6905; Behnke et al. / Arason et al., "Charge mechanism of volcanic lightning revealed during the 2010 Eyjafjallajökull eruption", https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2011JB008651; summaries: ash grains charge by colliding (triboelectric charging) and by magma fragmenting near the vent (fractoemission); above the freezing level ice charging takes over, a "dirty thunderstorm", and "lightning activity increases significantly after the volcanic plume rises above the freezing level".
- **Venus lightning**: Russell et al. 2007 (Venus Express whistler-mode waves; >62,000 s of them catalogued over 8.5 years), disputed (https://eos.org/articles/lightning-struck-down-as-source-of-a-venus-whistler); **Takahashi et al. 2021, "An optical flash on Venus detected by the AKATSUKI spacecraft"** (https://www.researchgate.net/publication/350704390): one flash, ~10× brighter than terrestrial lightning, lasting a few hundred ms, in 22 hours of observing covering 110.3 million km²·h: **about one flash per 10⁸ km²·h**.
- **Titan lightning**: Fischer & Gurnett 2011, "The search for Titan lightning radio emissions", GRL, https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2011GL047316: no lightning in 72 close Cassini flybys; "very likely that Titan lightning does not exist, is very weak, or is very rare".
- **Mars**: Chide et al. 2025, Nature, "Detection of triboelectric discharges during dust events on Mars", https://www.nature.com/articles/s41586-025-09736-y (and JPL's release): Perseverance's microphone recorded 55 small discharges in 28 hours, in dust devils and dust storm fronts; sparks, not visible lightning. Global dust storms come "approximately one every 3–4 Mars years"; local and regional ones every year (search summaries of https://arxiv.org/pdf/1605.01452 and https://www.sciencedirect.com/science/article/pii/S001910352400040X; 1321 storms, 1228 local and 93 regional, over ~6 Mars years).
- **Romps et al. 2014, Science 346, 851**, https://www.atmos.albany.edu/facstaff/molinari/Romps.et.al-SCI2014.pdf: flash rate ∝ CAPE × precipitation (explains 77% of the variance of US cloud-to-ground flashes); **12% ± 5% more lightning per °C** of warming.
- **King et al. 2013, IEEE TGRS 51(7), 3826**, https://atmosphere-imager.gsfc.nasa.gov/sites/default/files/ModAtmo/King_et_al.2013.pdf: MODIS global cloud fraction **~67%**, over land **~55%**, over the oceans **~72%**. Zonal means (search summaries of several climatologies): maxima in the ITCZ and the mid-latitude storm tracks, minima over the subtropics (the Hadley cells' descending branches).
- **Titan clouds**: search summaries (https://arxiv.org/pdf/1510.08394 and the Cassini ISS literature): clouds cover about **1%** of the disc (0.5 ± 1% in Cassini data), against ~60% on Earth.
- **Lorenz 1993, "The life, death and afterlife of a raindrop on Titan"**, PSS 41, 647 (abstract): the largest methane drops are 9.5 mm across (Earth's 6.5 mm) and fall at **1.6 m/s** (Earth's **9.2 m/s**). Another study finds "Rain and hail can reach the surface of Titan" (https://www.researchgate.net/publication/223647760).
- **Locatelli & Hobbs 1974, JGR 79, 2185**, https://www.atmos.albany.edu/facstaff/rfovell/ATM562/locatelli-hobbs-1974.pdf (summary): snowflake aggregates fall at **0.4–1.2 m/s**.
- **Venus acid rain**: Royal Belgian Institute for Space Aeronomy, https://www.aeronomie.be/en/encyclopedia/acid-rain-venus-evaporates: the cloud layer is at **48–58 km**; falling droplets reach temperatures at **30 km** where they evaporate (~300 °C): virga, it never reaches the ground.
- **Venus super-rotation** (Wikipedia and Science summaries, https://en.wikipedia.org/wiki/Atmospheric_super-rotation): the cloud tops circle the planet in **4 Earth days** against the ground's 243, winds ~**100 m/s** at 60–70 km.
- **Methane** (NIST WebBook, https://webbook.nist.gov/cgi/cbook.cgi?ID=C74828&Type=TC, via summary): triple point **90.67 K**, critical point **190.56 K**.
- **Lightning flashes** (University of Arizona ATMO 489 notes, Aldis; summaries): **2.8–6.4 strokes** per flash on average (4.6 in Florida), strokes **20–100 ms** apart (geometric mean 61 ms), a flash lasts a few hundred ms. **IC:CG ratios** (NASA NTRS 20100005226 and regional studies): 2.64–2.94 in the US, 3.48 in Spain, 3.97 in China; 2–10 worldwide.
- **Thunderstorms and cyclones** (NOAA JetStream, hurricanescience.org, NOAA AOML TCFAQ A16): a single-cell thunderstorm lasts ~30 minutes; tropical cyclones average ~6–7 days (up to 36 for Freddy), are 100–2000 km across (a typical hurricane ~480 km), and need sea surface temperatures of at least **26.5 °C** and a place at least **5° from the equator** (the Coriolis force).

## Measurements

Rates and ratios behind the stylised numbers:

```bash
node -e '
const earthRate = 44;                 // flashes/s (Christian et al. 2003)
const tonga = 2615 / 60;              // flashes/s at the plume peak (Van Eaton et al. 2023)
console.log("Hunga Tonga peak", tonga.toFixed(1), "/s =", (tonga / earthRate).toFixed(2), "x all of Earth");
const venusArea = 4 * Math.PI * 6051.8 ** 2; // km²
const venusPerHour = venusArea / 1.103e8;    // one flash per 110.3 million km²·h (Akatsuki)
console.log("Venus", venusPerHour.toFixed(1), "flashes/h over the planet =", (venusPerHour / 3600 / earthRate).toExponential(1), "x Earth");
console.log("cloud-to-ground share at IC:CG 3", (1 / 4).toFixed(2));
console.log("methane / water fall speed", (1.6 / 9.2).toFixed(3), " snow / water", (1 / 9.2).toFixed(3));
console.log("acid rain reach", ((48 - 30) / 48).toFixed(3), "of the way down");
console.log("Romps: 10 K warmer ->", (1.12 ** 10).toFixed(2), "x lightning");
console.log("Venus deck vs ground turn rate", (243 / 4).toFixed(0), "x");
console.log("MODIS drawn opaque at 60%:", (0.6 * 0.55).toFixed(2), "-", (0.6 * 0.72).toFixed(2));
'
```

| Quantity | Value |
|---|---|
| Hunga Tonga plume peak | 43.6 flashes/s = 0.99 × the whole Earth's 44/s |
| Venus (Akatsuki rate × area) | 4.2 flashes/h over the planet = 2.6·10⁻⁵ × Earth's rate |
| Cloud-to-ground share at IC:CG ≈ 3 | 0.25 |
| Fall speed, methane / water | 0.174 |
| Fall speed, snow / water | 0.109 |
| Acid rain reach | 0.375 of the way from the cloud base to the ground |
| 10 K warmer (Romps) | 3.1 × the lightning |
| Venus cloud tops vs its ground | 61 × faster (retrograde) |
| MODIS land–ocean fractions, drawn at 60% | 0.33–0.43 |

**Which bodies, over 1500 systems** of the default galaxy (`gen/weather.ts` with the game's climates; script as in `geysers.md`, printing `weatherOf` for every solid planet and moon at its planet-level radius, relief scale 1.6):

| Bodies | Count |
|---|---|
| Solid planets and moons | 11 253 |
| With weather | 1 762 (16%), in 1 113 systems |
| Terran / ocean, rain | 1 368 (1 080 with thunderstorms, 857 with cyclones) |
| Terran / ocean, snow | 49 |
| Desert with a little liquid water | 22 |
| Dust (desert, barren) | 223 |
| Methane (Titan-like ice worlds) | 104 |
| Acid (Venus-like lava worlds), with volcanic lightning | 43 |
| Airless-ish lava bodies with just enough air (≥ 5 mbar) for volcanic lightning | 9 |

Water worlds' cloud cover p10/p50/p90: 0.29 / 0.37 / 0.46; their temperatures 277 / 291 / 321 K. Methane worlds 0.05–0.07. Acid decks 1 (drawn 60% opaque).

## Game mapping

- **Kinds** (`weatherKind`): *acid* where CO₂ is thick enough for climate.ts's Venus cloud deck (≥ 10 bar); *methane* where N₂ is thick enough for its Titan haze (≥ 0.5 bar) and the temperature is between methane's triple and critical points; *water* where water is liquid, or frozen under ≥ 0.1 bar of breathable air (snow); *dust* on deserts and barren bodies with at least the visible-atmosphere threshold of 5 mbar (Mars's 6.4 mbar has dust storms). Everything else, airless bodies and Pluto-like traces, has none.
- **Volcanic lightning** (`volcanicLightning`): lava bodies with ≥ 5 mbar of air. Their big eruptions (`gen/lavaActivity.ts`, the 'eruption' slots) raise a dark ash cloud (0.07–0.11 rad across, stylised so it reads from orbit) over the vent for the eruption plus 20 s, flashing at 6/s: far the most of any storm, since one Hunga Tonga plume matched the whole Earth. Airless lava worlds (Io-like) get none: no air, no plume to charge.
- **Answer to "is lightning more likely on lava planets?"**: not as such. Lightning needs air to build a charged cloud in. The game's lava worlds are either airless (no lightning at all, however volcanic) or Venuses, where the evidence for ordinary lightning is weak and disputed (one Akatsuki flash, ~4 an hour over the whole planet). But **volcanoes do make lightning**, and lots: their ash plumes charge by grains colliding and magma shattering. So in the game it's the eruptions on lava worlds with air that light up.
- **Cloud cover**: water worlds' `coverage` = 0.6 × the MODIS fraction, interpolated from land (55%) to ocean (72%) by the water inventory (terran 0.4–0.7 → ocean 0.8–0.95), times a per-body 0.75–1.25, and reduced in proportion below water 0.4 (deserts). The shader modulates it by latitude, stylised on the zonal means: cloudier along the equator and at ±60°, clearer at ±30°. Titans: 1% drawn 6× (0.06). Acid decks: complete, 60% opaque at most, so the lava's glow still shows (deliberate: Venus is featureless in visible light).
- **Winds**: water and dust clouds drift with easterly trades in the tropics and westerlies at mid-latitudes (`zonalWind` = −cos 3φ, a stylised three-cell pattern); the acid deck turns as one, retrograde and 3× the water worlds' drift speed (Venus's is 61× its ground; the game's spin is already stylised).
- **Cloud height** (`cloudLayerRadius`): above the highest terrain the planet level draws (relief × 1.6), by 7% of the radius (at least 6 units) for water and methane, 10% for acid (Venus's deck is high), 4% for dust, so the ship can fly under the clouds at its lowest and above them from the arrival altitude. The system view draws the same layer at the same fraction of the radius.
- **Storms** (seeded slot grids, one storm per channel at a time, so at most 8 at once):
  - thunderstorms: 6 channels of 60 s slots, 30–60 s lives (real ~30 min), 0.035–0.075 rad across (a cluster rather than one cell), 70% within 30° of the equator (ITCZ), the rest 35–60° (storm tracks). Chance per slot 0.45 · √convection, less on dry worlds.
  - tropical cyclones: where the tropical sea (mean + 13 K) is ≥ 26.5 °C and there is an ocean (water ≥ 0.4); 2 channels, 150–300 s lives, 0.09–0.16 rad radius (drawn larger than a typical 480 km hurricane so it reads from orbit), born 8–25° from the equator, turning anticlockwise in the north and clockwise in the south, drifting west with the trades and poleward.
  - Titans: 3 channels of big (0.08–0.2 rad) methane storms, no lightning.
  - dust: 4 channels of local and regional storms (0.1–0.3 rad, paler than the ground: the ground's colour mixed 40% towards pale sand), and a global one in 1 of 3.5 slots of 420 s (Mars's every 3–4 years), lasting 200–400 s.
- **Lightning** (`collectFlashes`): per storm, a flash in each 0.1 s slot with probability rate · strength · 0.1: 1.5/s for thunderstorms and 0.5/s for cyclones at full strength, both × convection = 1.12^(T − 288.15) (Romps), clamped to 0.05–3, so a world 10 K warmer flashes 3× as often and a frozen one rarely. Each flash has 2–6 strokes 35–100 ms apart, each decaying with τ = 50 ms; a quarter strike the ground (IC:CG ≈ 3). Acid decks: one flash in ~40 s anywhere (Venus's real rate would be one every ~15 minutes of game time at the game's scale, i.e. never seen; deliberate). None on Titans or dusty worlds.
- **Rain**: 22 units/s for 9.2 m/s drops, the other kinds in proportion (methane 3.8, snow 2.4). Acid rain gets 37.5% of the way down and evaporates.

## Open questions

- **TROPICAL_OFFSET = 13 K** (how much warmer the tropical sea is than the global mean surface; Earth's 15 °C vs ~28 °C warm pools) is **unverified (from memory)**. It only gates which worlds get cyclones.
- The **ITCZ / storm-track latitudes** (±30° clear, ±60° cloudy) and the three-cell wind pattern are stylised from the qualitative zonal means; not measured against a zonal-mean table.
- **Cyclone lightning at a third of a thunderstorm's** is a game choice (hurricane inner cores are known for less lightning than land storms, but no number was looked up).
- Whether an Io-like eruption could make any discharge in vacuum was not found in a source; the game gives none because there is no atmosphere for an ash cloud.
- The 60%-opaque acid deck and 6× Titan clouds are visual choices, not measurements.
