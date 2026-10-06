# Terraforming: the climate model over time

## Question

Phase 1 of `docs/design/terraforming.md` (roadmap step 40) makes the climate model of step 12 (`gen/climate.ts`, see `climate.md`) ready to be changed by the player, and adds how it changes over time (`gen/terraform.ts`). It needs, each from a source:

1. **CO₂ at a few bar.** The Venus-only fit τ = 0.0175 P² gave Mars with 1 bar of CO₂ no warming (+0.6 K) and with 3 bar +6 K. What do published Mars models get?
2. **The Venus cloud deck.** The albedo jumped from the surface's to 0.77 at exactly 10 bar (10 bar was 6 °C, 9 bar 109 °C). Over what pressure should the deck come and go?
3. **Breathable air** for T3 once the air is a mix of gases: how much oxygen people can live on (too little, too much), how much CO₂ they can stand.
4. **Mixing gases**: how each absorber's optical depth depends on its own and the total pressure.
5. **Mirrors and shades** must not move a body across the cosmic shoreline.
6. **Aerosol haze**: how long it lasts and how much light it reflects.
7. **Response time**: how much slower an ocean world's temperature follows a change than a dry one's.
8. **Leaks**: which gases a leaking atmosphere loses first.

Precision: the reference bodies' temperatures within a few kelvin (the HUD shows them); the rest within ~10% and the right trend. Game time is compressed (seconds for years), stated as such.

## Sources

All accessed 2026-10-05. Values marked *digitized* were read from a figure (vector paths to ±0.3 K, raster ±1 K), not printed in the paper.

**CO₂ greenhouse**
- **Ramirez et al. 2014**, "Warming early Mars with CO₂ and H₂", Nature Geosci. 7:59, arXiv:1405.6701. Fig. 1: "Mean surface temperature as a function of surface pressure for a fully saturated (95% CO2, 5% N2) early Mars atmosphere at different solar insolation levels. The assumed surface albedo is 0.216", tuned so "the model [reproduces] Mars' current mean surface temperature, 218 K, given current solar insolation". 1D radiative–convective, cloud-free, water-saturated. *Digitized*, S/S₀ = 1: 6.5 mbar 218.1 K; 0.05 bar 224.2; 0.1 bar 227.4; 0.2 bar 234.0; 0.3 bar 239.2; 0.5 bar 247.3; 0.7 bar 254.5; 1 bar 264.1; 1.5 bar 277.0; 2 bar 286.3; 2.5 bar 294.0. Fig. 2b planetary albedo (at S/S₀ = 0.75): ~0.215 at 6 mbar, 0.33 at 1 bar, 0.415 at 3 bar.
- **Zubrin & McKay 1993**, "Technological requirements for terraforming Mars" (https://marspapers.org/paper/Zubrin_1993_3.pdf), eq. 1 (after McKay & Davis): "Tmean = S^0.25 TBB + 20(1+S)P^0.5 … TBB, the black body temperature of Mars at present = 213.5 K, and P is given in bar": +40 K at 1 bar, +69 K at 3 bar under today's Sun.
- **Forget et al. 2013**, "3D modelling of the early martian climate under a denser CO₂ atmosphere", Icarus, arXiv:1210.4216: dry, 75% Sun; "Surface temperature increases up to Ps = 2 bar. Above 2-3 bar Rayleigh scattering by CO2 gas more than compensates for the increased thermal infrared opacity"; CO₂ ice clouds rather than a sulphuric deck.
- **Wordsworth & Pierrehumbert 2013**, ApJ 778:154, arXiv:1306.3266, Fig. 7b (Earth with an ocean, saturated, no clouds, surface albedo 0.23, today's flux), *digitized*: 0.8 bar CO₂ 368 K, 8.6 bar 412 K, 48 bar 481 K.

**The Venus cloud deck**
- **Titov et al. 2018**, "Clouds and Hazes of Venus", Space Sci. Rev. 214: "The cloud base is located at 48–50 km at low and middle latitudes"; below it "temperatures are too high to allow sulphuric acid droplets to exist"; upper cloud "56.5–70 km".
- **VIRA** (Seiff et al. 1985) as tabulated in Bains et al. 2020 (arXiv:2009.06499, Table S9): 45 km 383 K 1.98 bar; 50 km 348 K 1.07 bar; 70 km 230 K 0.04 bar. The base at 48 km is then ~1.4 bar and ~362 K (log-interpolated).
- **Loftus, Wordsworth & Morley 2019**, arXiv:1908.02769: a lasting H₂SO₄ haze needs a nearly dry surface (oceans over 10⁻³ Earth's are incompatible with it); surface pressure barely matters in their sensitivity tests.
- **Way et al. 2016**, arXiv:1608.00706: a 1-bar early Venus with an ocean is "almost completely overcast" with water clouds (no Bond albedo given).
- No source read gives a pressure range over which a Venus-like deck appears.

**Breathable air**
- **NASA-STD-3001 Vol. 2 Rev F**, §6.2.1.2 and Table 6.2-1 (https://www.nasa.gov/wp-content/uploads/2025/05/nasa-std-3001-vol-2.pdf): "there are no medical or performance issues with constant exposure to one-half an atmosphere of O2 partial pressure … a ppO2 of 7.35 psia, or 380 mmHg"; indefinite hypoxia limit PIO₂ 127 mmHg; "absorption atelectasis (lung collapse) occurs with fractions of oxygen above 50%".
- **West 2002**, "Highest permanent human habitation", High Alt. Med. Biol. 3:401 (PubMed 12631426): La Rinconada, "over 7000 people … at an altitude of up to 5100 m". **Sci Rep 2024** (s41598-024-68389-5): "La Rinconada (5100–5300 m, PB = 405 mmHg)".
- **Diving**: Beatty et al. 2024 (PMC11688341): "Pulmonary O2 toxicity can occur whenever the partial pressure of oxygen exceeds 0.5 ATA."
- **NASA/TP-2010-216134**, Exploration Atmospheres Working Group: "30% oxygen is the maximum flammability test level for ISS/Space Shuttle Programs"; NASA-STD-3001 names the "Exploration Atmosphere of 8.2 psia and 34% O2". OSHA 1910.146: "more than 23.5 percent oxygen" is oxygen-enriched.
- **CO₂**: OSHA chemical data 183: "PEL-TWA 5000 ppm"; NIOSH REL-STEL 30 000 ppm, IDLH 40 000 ppm. NASA-STD-3001 [V2 6004]: one-hour average no more than 3 mmHg. EPA CO₂ appendix B: 2% headache and dyspnea after hours, 7–10% unconsciousness within minutes.
- **NASA Earth fact sheet**: "78.08% Nitrogen (N2), 20.95% Oxygen (O2)", argon 9340 ppm, CO₂ 420 ppm; 1014 mb.

**Aerosols** (Pinatubo, 1991)
- Toohey et al. 2025, ACP 25:3821, quoting McCormick et al. 1995: "the total stratospheric aerosol mass has decreased with a 1/e-folding time of approximately 1 year"; their own "roughly 10–12-month decay timescale". Robock 2004: "e-folding decay time of approximately 1 year". IPCC AR5 WG1 ch. 8 §8.4.2.1: tropical eruptions' sulphate lasts "about one year".
- Self et al. (USGS, pubs.usgs.gov/pinatubo/self): "The global average optical depth probably peaked at about 0.15 in early 1992"; ERBE "an average radiative cooling of 2.7 W/m² by August of 1991"; Hansen et al. 1992's "radiative forcing at the tropopause of -4 W/m²"; "global cooling of at least 0.5 to 0.7°C". Soden et al. 2002: "a peak global cooling of ∼0.5 K nearly 18 months after the eruption".

**Heat capacity and response time**
- **Battisti**, "The Energy Balance Model" (UW lecture notes, https://www.uib.no/sites/w3.uib.no/files/attachments/ebm.pdf): atmosphere C_a = 10⁷ J m⁻² K⁻¹; a 75 m mixed layer "3∗10⁸ J m⁻² K⁻¹", "Co/Ca ≈ 30"; land "1200 J kg⁻¹ K⁻¹ × 1m × 2500 kg m⁻³ = 3×10⁶ J m⁻² K⁻¹"; response time C/B with B = 2.9 W m⁻² K⁻¹: "For a planet covered by 75m of water, this is about … 3.3 years", "For a land covered planet, the adjustment time scale is < 2 weeks."
- Hartmann, ATMS 321 lecture 12: the mixed layer has "about 30 times the heat capacity of the atmosphere". Held et al. 2010: a fast response with "an e-folding time smaller than 5 yr".

**Escape**
- **Gronoff et al. 2020**, "Atmospheric Escape Processes and Planetary Atmospheric Evolution", JGR Space Phys., arXiv:2003.03231: eq. 5, the Jeans flux Φ = N (u/2√π)(1 + λ) e^−λ with u = √(2kT/m) and λ = v_esc²/u²; the transition to hydrodynamic escape "near λex ∼ 2 − 3", and "For λex > 3 … the escape rate is near the Jeans escape rate".
- **Zahnle & Catling 2017**, arXiv:1702.03386: when a whole atmosphere escapes "the heavier gases escape more slowly, so that the remnant atmosphere becomes mass fractionated".
- **NIST Chemistry WebBook** molar masses (g/mol): H₂ 2.01588, N₂ 28.0134, O₂ 31.9988, CO₂ 44.0095.

## Measurements

### CO₂: refit on Mars, still exact on Venus

The CO₂ optical depth becomes τ = a p^m + b p P: its bands saturate at low pressure (a p^m, sublinear), and pressure broadening (b p P, as before) carries Venus. a and m are fitted to Ramirez's warming above Mars today (Mars's own T_eq 209.83 K, Bond albedo 0.25), b then follows from Venus exactly:

```js
const sigma = 5.670374419e-8;
const Teq = (S, A) => ((S * (1 - A)) / 4 / sigma) ** 0.25;
const tauFor = (Ts, Te) => ((Ts / Te) ** 4 - 1) / 0.75;
const tauV = tauFor(737.15, Teq(2601.3, 0.77)), TM = Teq(586.2, 0.25);
const R = [[0.05, 224.2], [0.1, 227.4], [0.2, 234.0], [0.3, 239.2], [0.5, 247.3], [0.7, 254.5], [1, 264.1], [1.5, 277.0], [2, 286.3], [2.5, 294.0]];
// grid search over a and m; b = (tauV − a·92^m) / 92²; least squares on TM·(1 + ¾τ)^¼ against TM + (T − 218.1)
// → a = 1.585, m = 0.78, b = 0.01111, rms 0.49 K
```

| P (bar) | Game, before | Game, now | Ramirez (warming above 6.5 mbar, on 209.8 K) | Zubrin & McKay |
|---|---|---|---|---|
| 0.00636 (today) | 209.8 | 211.0 | 209.8 | 213.0 |
| 0.1 | 209.8 | 219.5 | 219.1 | 222.5 |
| 0.5 | 210.0 | 239.4 | 239.0 | 238.1 |
| 1 | 210.5 | 255.5 | 255.8 | 249.8 |
| 2 | 211.8 | 277.8 | 278.0 | 266.4 |
| 3 | 215.8 | 294.4 | (≈292, the curve leaves the plot) | 279.1 |

Venus (92 bar, under its deck) stays 737.15 K by construction. Mars today is 211.0 K, within the measured 208–214 K. Under 3 bar (where the deck begins, below) these are the temperatures `gen/climate.ts` gives.

### The cloud deck: a ramp instead of a cliff

The deck's cover now grows on a log scale from none at 3 bar of CO₂ to whole at 30 bar (`cloudCover`); the albedo goes from the surface's to 0.77 in proportion. A Venus at its own distance with a 0.1 surface:

| CO₂ (bar) | 1 | 3 | 5 | 9 | 10 | 14 | 20 | 30 | 50 | 92 |
|---|---|---|---|---|---|---|---|---|---|---|
| Before (°C) | 47 | 55 | 69 | 109 | **6** | 38 | 85 | 156 | 273 | 464 |
| Now (°C) | 115 | 174 | 191 | 211 | 215 | 226 | 234 | 235 | 320 | 464 |

No 5% step in pressure moves the temperature by more than 3% anywhere from 1 to 60 bar (tested); between 14 and 30 bar the clouds thicken about as fast as the greenhouse grows, a plateau where taking CO₂ away barely cools. 3 bar was picked because the Mars models above run up to there without such a deck (Forget's thick Mars grows CO₂ ice clouds instead), and all of the game's generated Venuses (10 bar and up) are still at least half covered, so their looks and acid rain stay. The lower 1.4–14 bar ramp tried first laid the deck over a 2-bar Mars.

### What changed in the generated galaxy

`generateSystem` for the first 1500 stars, the 8 rogues and Sol (seed 1337), before and after, every field compared (scratch `snapshot.ts` and `compare.mjs`):

- **Every body that isn't CO₂ is unchanged**: the only differences are float rounding (≤ 6×10⁻¹⁴ K, from N₂–O₂ air now being the sum of two gases). Pinned by a fingerprint of 5809 bodies in the first 800 systems (`tests/climate.test.ts`).
- **316 CO₂ bodies change temperature** (nothing else generated changes: no type, weather or look):

| CO₂ pressure | Bodies | ΔT median (range) |
|---|---|---|
| < 10 mbar (Mars-like remnants) | 121 | +0.3 K (0 to +2.7) |
| 10–100 mbar | 95 | +3.2 K (+0.8 to +13.5) |
| 0.1–1 bar (CO₂ deserts) | 49 | +27 K (+10 to +58) |
| 10–14 bar (thin Venuses, no longer fully clouded) | 7 | +243 K (+63 to +285) |
| over 14 bar | 40 | +73 K (−10 to +232) |

  Tiers: 20 rise (17 T0→T1, 3 T0→T2, 2 T1→T2), 6 fall (3 T2→T0, 2 T1→T0, 1 T2→T1); water: 8 thaw, 4 boil. Sol's Mars goes from −63.3 to −62.1 °C; Venus is unchanged. The home system's Haikrai III (0.2 mbar of CO₂) from −101.79 to −101.72 °C.

### Partial pressures

`gasesOf` turns the old description into gases: N₂–O₂ air gets Earth's 20.95% of oxygen, kept within the breathable range (below), so living worlds generated at 0.5–5 bar are all breathable as before (at 0.5 bar the oxygen is raised to 0.113 bar, 22.6%; at 5 bar lowered to 0.507, 10%). The trace greenhouse (`greenhouse`) is now in Earth's units in any air, τ = 0.825 g P; a pure atmosphere still gets exactly its reference body's τ:

- N₂–O₂: unchanged (Earth's trace gases, n = 1).
- N₂ (Titan): its methane's τ₀ P^4/3 becomes trace gas g = g₀ · 0.449 P^{1/3} / 0.825 (`titanGreenhouse`; Titan itself 0.62).
- CO₂ and H₂: their own absorbers, with no trace gas (g = 0); an airless body has none either.

Mixing: each absorber's τ is its column (partial pressure) broadened by the total pressure, so pure ones are unchanged: CO₂ a p^m + b p P; H₂ τ₀ (p/√g)(P/√g)^{n−1}. So N₂ added to a CO₂ world warms it (more broadening), as in Ramirez's 5% N₂ runs.

### Breathable air

| Limit | Source | Value in bar |
|---|---|---|
| O₂ low | La Rinconada, 405 mmHg × 0.2095 | 0.113 |
| O₂ high | NASA-STD-3001: ½ atm of O₂ for good; diving: toxicity above 0.5 ATA | 0.507 |
| O₂ share | NASA's exploration atmosphere | 34% |
| CO₂ | OSHA/NIOSH 8-hour 5000 ppm at 1 atm | 0.00507 |

With the share limit, breathable air needs at least 0.113 / 0.34 = 0.33 bar in all, about where T2 already starts (0.3 bar).

### Reference cases now

Run with the game's code (scratch `cases.ts`), with water 0.4 where air is given:

| Body | Today | With |
|---|---|---|
| Mars | −62 °C, 6 mbar CO₂, marginal | 1 bar N₂–O₂: greenhouse ×0 −63 °C, ×1 −37 °C, ×2 −17 °C (T1), ×3 −1 °C (T2), ×4 13 °C, ×6 35 °C, ×10 69 °C (T0). ×3 with mirrors ×1.2: 12 °C, ×1.5: 28 °C. Its own CO₂ thickened: 1 bar −18 °C (T1), 2 bar 5 °C (T2), 3 bar 21 °C. |
| Venus | 464 °C, 92 bar CO₂ | CO₂ taken down to 30 bar 236 °C, 10 bar 215 °C, 3 bar 174 °C, 1 bar 115 °C. Replaced by 1 bar N₂–O₂: 86 °C; a shade blocking 30% 56 °C (T1), 50% 29 °C (T3), 60% 13 °C. |
| Moon | −3 °C, airless, escapes | 1 bar N₂–O₂: 32 °C, T3, but it leaks (Real). |
| Haikrai III | −102 °C, 0.2 mbar CO₂, holds (retention 2.78) | 1 bar N₂–O₂: greenhouse ×1 −80 °C, ×6 −21 °C, ×8 −5 °C (T2), ×10 7 °C (T3), ×12 19 °C; ×4 with starlight ×2: 5 °C (T3); ×6 with ×1.5: 6 °C (T3). |

### Mirrors, haze, magic heat

- **Starlight** (`starlight`) multiplies only the light absorbed; retention is still computed from `insolation` (escape is driven by the star's X-rays and UV, which a mirror doesn't add). Mars with starlight ×2 stays marginal (tested).
- **Aerosol haze**: a non-absorbing layer of reflectance r over a surface (or cloud) of albedo a reflects (r + a − 2ra)/(1 − ra), all multiple reflections added (the adding method: r + (1−r)² a / (1 − ra)). Calibration for the aerosol tool (phase 3): Pinatubo's peak forcing of 2.7–4 W/m² out of ~340 W/m² is a 0.8–1.2% change in Earth's albedo (computed), which at a = 0.3 takes r ≈ 0.017–0.025 for a global optical depth of 0.15 (computed: r ≈ 0.11–0.17 τ).
- **Magic heat** is added to the internal heat flow in the energy balance (W/m²), so 50 W/m² of either gives the same temperature (tested).

### Time

- **Response time** τ = dry · (ocean/dry)^x, x = ln(C/C_dry) / ln(C_ocean/C_dry), with C = 3×10⁶ (land) + c_p P/g (10⁷ per bar at 1 g) + 3.15×10⁸ × water (J m⁻² K⁻¹). Real planets respond in proportion to C (Battisti: under two weeks for land, 3.3 years for a 75 m ocean, a ratio of ~100); the game keeps the order and compresses the ratio to the design's 20 s → 90 s (Real; Relaxed a third). Earth's air alone on a dry world: 32 s; Venus's 92 bar: 130 s.
- **Aerosols** rain out with a half-life of 120 s (Real, 360 s Relaxed), for Pinatubo's e-folding time of ~1 year (half-life 0.69 years).
- **Leaks**: air above `maxStablePressure` bleeds off, each gas's share of the excess with time constant leakTime / k, leakTime = 3600 s × 10^(retention / 1.55): Mars (retention 0) an hour, the Moon (−1.67) 301 s (*tunable*, from the design's targets). k is the Jeans flux per molecule relative to nitrogen at λ_N₂ = 3 (where Gronoff et al. put the turn to near-Jeans escape; leaking bodies sit on the shoreline): H₂ 18.3, N₂ 1, O₂ 0.68, CO₂ 0.21. Hydrogen goes first and CO₂ last, so the remnant gets heavier, as Zahnle & Catling describe.

## Game mapping

- `gen/climate.ts`: `ClimateState` is `gases` (bar), `greenhouse` (trace, × Earth's), `water`, `surfaceAlbedo`, `starlight`, `aerosol` (haze reflectance), `magicHeat` (W/m²). `pressure` and `composition` are derived (`totalPressure`, `compositionOf`: the dominant of N₂+O₂, CO₂ and H₂; N₂+O₂ air is `oxygenNitrogen` only when `isBreathable`). `climateStateOf` and `changeState` still take a pressure and a composition (`gasesOf`, `traceGreenhouse`), which is how generation, Sol, the rogues, the planet lab's presets and older lab links describe an atmosphere. `evaluateClimate(setting, state, temperature?)` takes the temperature reached so far, for a world still settling.
- `gen/terraform.ts`: the action log (`TerraformAction`: lever, start, duration, amount, site), modes (`ModeChange`, `TERRAFORM_TUNING`), `TerraformTimeline` (fixed 1 s steps from the first action, checkpoints every 30 s, `record`/`update` drop the ones after a change), `climateAt` (the same, pure), `TerraformLogs` (every body's log and the mode changes, JSON), and gas mass ↔ pressure (`pressureOfMass`: Δp = m g / R², R from g and v_esc).
- **Game time.** A system's own clock (`StarSystem.time`) starts afresh every time it's built (`SceneManager.createSystem`; busted debris is shown `SETTLED_DEBRIS` seconds after its blast). The logs therefore run on a game-wide clock, which phase 2 adds to the `SceneManager` (and saves) when the rays write the first actions.
- Deliberate departures: game time is seconds for years; response times are compressed (ratio 4.5 instead of ~100); leak times are tunables, not computed escape rates; the deck's ramp width is a gameplay choice.

## Open questions

- **CO₂ between 3 and 90 bar** is only pinned at its ends: Wordsworth & Pierrehumbert's ocean Earth gives 412 K at 8.6 bar and 481 K at 48 bar under a clear sky, where the fit (with their 0.23 albedo and no clouds) gives 438 K and 674 K. Their profiles include an upper atmosphere that is free to cool and water vapour; the game's grey model doesn't. Generated Venuses of 14–90 bar came out 73 K warmer (median); they were T0 and still are.
- **Rayleigh scattering** of thick CO₂ raises the albedo (Ramirez: 0.215 → 0.33 at 1 bar), which the fit folds into τ. Not modelled separately.
- **Ramirez's runs are water-saturated**, so the CO₂ fit includes water vapour's feedback. A CO₂ world's trace greenhouse is 0, so its water vapour lives inside the CO₂ fit; an N₂–O₂ world's lives in `greenhouse`.
- **Titan's haze** still appears on any nitrogen air of 0.5 bar or more, with or without the methane that really makes it.
- **The Venus deck** in reality depends on SO₂ and a dry surface (Loftus et al. 2019), not pressure. A terraformed Venus with oceans would lose it; not modelled.
- **CO₂ at trace levels** is linear in this grey model (its real forcing is logarithmic), so Earth's 420 ppm is counted inside the trace greenhouse rather than as CO₂.
- **Super-greenhouse gases** (phase 4): Marinova et al. 2005 give C₃F₈ 0.56 K at 10⁻³ Pa and 33.5 K at 1 Pa on Mars (strongly sublinear); lifetimes CF₄ 50 000 yr, C₂F₆ 10 000, C₃F₈ 2 600, SF₆ 3 200 (IPCC AR5 table 8.A.1; Schwieterman et al. 2024 put SF₆ nearer 1 000). Their dependence on the background pressure wasn't found (Marinova's full text was not reachable).
