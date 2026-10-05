# Climate: temperature, atmosphere and internal heat

## Question

Roadmap step 12 (`gen/climate.ts`) gives every solid planet and moon a climate: surface temperature, atmosphere (pressure and composition) and internal heat. It is built so the player can terraform later: the atmosphere, greenhouse gases, surface water and surface albedo are state that can change, and everything else is recomputed from them. This note covers what the model needs beyond the equilibrium temperature in `planet-temperatures.md`:

1. How greenhouse warming grows with pressure and composition (reference: Earth +33 K, Venus +511 K, Titan, Mars ~0).
2. Which bodies can keep an atmosphere at all, given their size and starlight (reference: Mercury and the Moon airless, Mars barely, Titan thick).
3. Gravity and escape velocity from the game's radius (step 11 gives only radii).
4. Internal heat: radiogenic heat from size, tidal heat for moons (reference: Earth, the Moon, Io, Enceladus).
5. When water is liquid (the boiling point against pressure).

The precision that matters: temperatures within a few kelvin of the reference bodies (the HUD shows them in °C), and the right trends everywhere else.

## Sources

All accessed 2026-09-29.

- **NASA NSSDCA fact sheets**, https://nssdc.gsfc.nasa.gov/planetary/factsheet/ and the per-body `{mercury,venus,earth,moon,mars,jupiter,saturn,neptune,pluto}fact.html`, read from the raw HTML:
  - Bond albedo: Mercury 0.068, Venus 0.77, Earth 0.294, Moon 0.11, Mars 0.250, Jupiter 0.343, Pluto 0.72.
  - Solar irradiance (W/m²): Mercury 9082.7, Venus 2601.3, Earth 1361.0, Moon 1361.0, Mars 586.2, Jupiter 50.26, Saturn 14.82, Neptune 1.508, Pluto 0.873.
  - Escape velocity (km/s): Mercury 4.3, Venus 10.36, Earth 11.186, Moon 2.38, Mars 5.03, Pluto 1.21.
  - Surface pressure: Venus 92 bar, Earth 1014 mb, Mars 6.36 mb (mean radius), Pluto ~13 µbar. Average temperature: Venus 737 K, Earth 288 K, Mars ~214 K (the fact table gives −65 °C = 208 K).
  - Mean density (kg/m³): Earth 5513 (5514 in the table), Jupiter 1326, Saturn 687, Pluto 1850. Venus is 96.5% CO₂, Mars 95.1% CO₂, Pluto 99% N₂ with 0.5% CH₄.
- **JPL Planetary Satellite Physical Parameters**, https://ssd.jpl.nasa.gov/sats/phys_par/: GM (km³/s²) and mean radius (km). Moon 4902.800, 1737.4; Io 5959.91547, 1821.49; Europa 3202.71210, 1560.80; Ganymede 9887.83275, 2631.20; Callisto 7179.28340, 2410.30; Enceladus 7.21037, 252.10; Titan 8978.13710, 2574.76; Triton 1428.49546, 1352.60. Densities (g/cm³): Ganymede 1.9416, Callisto 1.8340, Titan 1.8814, Triton 2.0649. Escape velocities below are √(2GM/R).
- **JPL Planetary Satellite Mean Elements**, https://ssd.jpl.nasa.gov/sats/elem/: semi-major axes Io 421 800 km, Europa 671 100 km, Enceladus 238 400 km, Titan 1 221 900 km, the Moon 384 400 km.
- **Zahnle & Catling 2017**, "The cosmic shoreline", ApJ 843:122, arXiv:1702.03386 (abstract and text via ar5iv): "The planets of the Solar System divide neatly between those with atmospheres and those without when arranged by insolation (I) and escape velocity (v_esc). The dividing line goes as I ∝ v_esc⁴." And: "The simple I ∝ v_esc⁴ power law bounding the cosmic shoreline is drawn by eye." The paper gives no constant, so the constant is fitted below.
- **Robinson & Catling 2012**, "An analytic radiative-convective model for planetary atmospheres", ApJ 757:104, arXiv:1209.1833 (PDF text):
  - Eq. 6, τ = τ₀ (p/p₀)ⁿ: "when an absorbing gas is well mixed and the opacity does not depend strongly on pressure, we will have n = 1 ... collision-induced opacity ... or pressure-broadened opacity so that n = 2. Typically, n takes a value between 1 and 2".
  - For Venus: "pressure broadening and collision-induced absorption [strongly influence] infrared opacities throughout much of the Venusian atmosphere, the n = 2 case should be" appropriate.
  - Their Titan comparison uses "the analytic radiative equilibrium model from McKay, et al. (1999) which takes n = 4/3".
  - Eq. 18, the radiative-equilibrium profile. With sunlight absorbed at the ground (k → 0) and no internal heat it becomes σT⁴(τ) = (F/2)(1 + Dτ), where F = S(1 − A)/4. The upward flux at the ground is then F(1 + Dτ/2), so the ground temperature is T_s⁴ = T_eq⁴ (1 + Dτ/2). With the diffusivity D = 3/2 (which they cite from Weaver & Ramanathan 1995) this is **T_s = T_eq (1 + ¾τ)^¼**. Eq. 17 adds internal heat to the flux balance, so T_eq⁴ = (S(1 − A)/4 + F_i)/σ.
- **Chen & Kipping 2017**, "Probabilistic forecasting of the masses and radii of other worlds", ApJ 834:17, arXiv:1603.08614, Table 1: Terran worlds R = 10^C M^S with 10^C = 1.008 R⊕ and S = 0.2790; Neptunian S = 0.589; the Terran-to-Neptunian transition is at 2.04 M⊕.
- **Li et al. 2011**, "The global energy balance of Titan", NTRS 20110023012 (PDF): "The solar constant at Titan is 15.2 watts/meter²", and "the average value of Bond albedo is 0.265 with an average uncertainty of ... 0.03".
- **Fulchignoni et al. 2005**, Nature 438:785 (PubMed abstract 16319827): "At the surface, the temperature was 93.65 ± 0.25 K, and the pressure was 1,467 ± 1 hPa."
- **Davies & Davies 2010**, "Earth's surface heat flux", Solid Earth 1:5 (abstract): "Our final preferred estimate is 47±2 TW".
- **Apollo heat flow** (Nagihara et al., NTRS 20150004428, PDF): "Langseth obtained the endogenic heat flow of the Moon as 21 mW/m² at Site 15 and 16 mW/m² at Site 17."
- **Io**: Tyler et al. 2015, ApJS 218:22 (read via WebFetch): "Estimates of Io's global mean heat flow generally range from 1.5 to 4.0 W m⁻² (Moore et al. 2007), with recent astrometric observations supporting a value of 2.24 ± 0.45 W m⁻² (Lainey et al. 2009)", "a global total of 93.8 terawatts".
- **Enceladus**: arXiv:2505.14743v3 (HTML): "a total heat loss of approximately 25-40 GW", "the measured heat output from the South Polar Terrain (SPT) alone is estimated to be 4-19 GW", and the tidal heating "in the range of 15–40 GW".
- **NIST Chemistry Webbook**, water saturation properties (IAPWS-95), https://webbook.nist.gov/cgi/fluid.cgi?Action=Data&ID=C7732185&Type=SatT&TLow=273.16&THigh=647&TInc=1&TUnit=K&PUnit=bar (tab-separated). Triple point 273.16 K at 0.0061165 bar, critical point 647.10 K at 220.64 bar.
- **Walker, Hays & Kasting 1981**, "A negative feedback mechanism for the long-term stabilization of Earth's surface temperature", JGR 86:9776 (PDF): "the partial pressure of carbon dioxide in the atmosphere is buffered, over geological time scales, by a negative feedback mechanism in which the rate of weathering of silicate minerals ... depends on surface temperature". Used only qualitatively (the thermostat below).

## Measurements

The script (Node, run in the scratchpad; `sat.tsv` is the NIST table above):

```js
const sigma = 5.670374419e-8;
const RE = 6371.0, VE = 11.186;
const T1 = 2.04, RT1 = 1.008 * T1 ** 0.279; // Chen & Kipping transition
const massCK = (R) => (R <= RT1 ? (R / 1.008) ** (1 / 0.279) : T1 * (R / RT1) ** (1 / 0.589));
const vRock = (R) => VE * Math.sqrt(massCK(R) / R);
const vDens = (R, rho) => VE * R * Math.sqrt(rho / 5.513);
const Teq = (S, A) => ((S * (1 - A)) / (4 * sigma)) ** 0.25;
const tauFor = (Ts, Te) => ((Ts / Te) ** 4 - 1) / 0.75;
// ...tables below: escape velocities, I / v⁴, τ fits, boiling points, heat flows
```

### Escape velocity from radius

Rocky bodies use Chen & Kipping; icy bodies a density of 1.9 g/cm³ (the Galilean and Saturnian icy moons, Triton and Pluto are 1.83–2.06).

| Body | R (R⊕) | Measured (km/s) | Chen & Kipping | Density 1.9 |
|---|---|---|---|---|
| Mercury | 0.383 | 4.30 | 3.19 (−26%) | |
| Venus | 0.950 | 10.36 | 10.32 | |
| Earth | 1.000 | 11.19 | 11.03 | |
| Mars | 0.532 | 5.03 | 4.88 | |
| Moon | 0.273 | 2.38 | 2.06 (−13%) | |
| Pluto | 0.187 | 1.21 | 1.26 | 1.22 |
| Ganymede | 0.413 | 2.74 | 3.52 | 2.71 |
| Callisto | 0.378 | 2.44 | 3.14 | 2.48 |
| Titan | 0.404 | 2.64 | 3.42 | 2.65 |
| Triton | 0.212 | 1.45 | 1.49 | 1.39 |
| Enceladus | 0.040 | 0.24 | 0.17 | 0.26 |

Rock is within 5%, except iron-rich Mercury and the Moon (see open questions). Ice with ρ = 1.9 is within 5%. At 2 R⊕ Chen & Kipping gives 4.7 M⊕ and 17 km/s; at 3 R⊕, 9.3 M⊕ and 20 km/s.

### The cosmic shoreline

I in Earth units, v in km/s. With C = 6.7 × 10⁻⁴, the retention is s = log10(C v⁴ / I):

| Body | Air? | I / v⁴ | s |
|---|---|---|---|
| Earth | yes | 6.39e-5 | +1.02 |
| Venus | yes | 1.66e-4 | +0.61 |
| Titan | yes | 2.24e-4 | +0.48 |
| Triton | yes | 2.48e-4 | +0.43 |
| Pluto | yes | 2.99e-4 | +0.35 |
| Ganymede | no | 6.54e-4 | +0.01 |
| Mars | yes (6 mbar) | 6.73e-4 | −0.00 |
| Io | no (nanobar SO₂) | 8.62e-4 | −0.11 |
| Callisto | no | 1.04e-3 | −0.19 |
| Europa | no | 2.19e-3 | −0.51 |
| Mercury | no | 1.95e-2 | −1.46 |
| Moon | no | 3.12e-2 | −1.67 |
| Enceladus | no | 3.33 | −3.70 |

No single line separates Mars (thin air) from Ganymede (none): the shoreline is a band, as the paper says ("we do not know if the shoreline is broad or narrow"). C sits between the two. The game treats |s| < 0.3 as marginal: at most a Mars-like 10 mbar. Everything with a real atmosphere is at s ≥ 0.35, and every airless body except Ganymede and Io is below −0.1.

### Greenhouse: τ fitted on the reference bodies

T_s = T_eq (1 + ¾τ)^¼, τ = τ₀ Pⁿ:

| Body | T_eq | Surface | τ | n | τ₀ |
|---|---|---|---|---|---|
| Earth (N₂–O₂, trace H₂O/CO₂) | 255.1 K | 288.15 K at 1.014 bar | 0.836 | 1 | 0.825 |
| Venus (CO₂) | 226.6 K | 737.15 K at 92 bar | 147.9 | 2 | 0.0175 |
| Titan (N₂–CH₄), S = 15.2 | 83.8 K | 93.65 K at 1.467 bar | 0.749 | 4/3 | 0.449 |
| Titan with NASA's Saturn S = 14.82 | 83.2 K | | 0.802 | 4/3 | 0.481 |

Mars is the independent check, since nothing is calibrated on it. CO₂ at 6.36 mbar gives 210.2 K with n = 1 and 209.8 K with n = 2. The measured value is 208 K (fact table) or 214 K (fact sheet). Venus's n = 2 makes the CO₂ greenhouse vanish at Mars's pressure, which is right.

**Superseded for CO₂ (step 38):** n = 2 alone also made CO₂ do almost nothing at a few bar (Mars +0.6 K at 1 bar), which published Mars models contradict. CO₂ is now τ = a p^m + b p P, fitted to Ramirez et al. 2014 below 3 bar and still exact on Venus; see `terraforming.md`.

### Water's boiling point

A two-point Clausius–Clapeyron fit (triple point and 1 atm, L = 43.3 kJ/mol) against NIST:

| P (bar) | NIST | Fit | Diff |
|---|---|---|---|
| 0.01 | 282.0 | 280.4 | −1.6 |
| 0.1 | 323.6 | 320.0 | −3.5 |
| 1.01325 | 373.2 | 373.1 | −0.1 |
| 5 | 425.0 | 421.3 | −3.7 |
| 10 | 453.0 | 446.3 | −6.7 |
| 92 | 578.1 | 551.1 | −27.0 |
| 220 | 646.9 | 607.0 | −39.8 |

The fit is 27–40 K off at Venus-like pressures (L falls towards the critical point), so the game interpolates the NIST table instead (log P, 16 points), which is within 1 K at 2.95 and 19.9 bar (tested).

### Internal heat

- Earth: 47 TW / 4π(6371 km)² = **92.1 mW/m²**.
- Radiogenic heat ∝ mass, spread over the area, so the flux ∝ M/R² = g. The Moon at its real g gives **15.2 mW/m²** against 16–21 measured, which is good enough. With Chen & Kipping's lighter Moon mass it is 11.4.
- Tides: Ė ∝ M_p^2.5 R^5 a^-7.5 (with e, k₂/Q the same). Per unit area, and with the orbit in planet radii, the flux ∝ ρ_p^2.5 R³ (a/R_p)^-7.5. Calibrated on Io (2.24 W/m², a = 5.90 R_J, ρ_J = 1326):
  - Enceladus (ρ_S = 687, R = 252.1 km, a = 3.956 R_S): **0.023 W/m²**. Measured: 15–40 GW = 0.019–0.050 W/m². ✓
  - The Moon: 2 × 10⁻⁶ W/m², negligible. ✓
  - Europa: 0.044 W/m² with Io's eccentricity; 0.22 with its own (e 0.009 vs 0.004). No measured value was found for comparison.

## Game mapping

`gen/climate.ts`, a pure-data module like the rest of `gen/`. Split into:

- **ClimateSetting** (fixed): insolation, gravity, escape velocity, heat flow.
- **ClimateState** (terraformable): pressure, composition (`oxygenNitrogen` | `nitrogen` | `carbonDioxide` | `none`), greenhouse abundance (× the composition's reference body), surface water (0–1), surface albedo.
- **Derived**, recomputed by `evaluateClimate(setting, state)`: planet albedo, T_eq, τ, temperature, retention and its class, `leaking`, water state, geothermal index, habitability tier. `terraform(climate, change)` is `evaluateClimate` with some state changed, and `evaluateClimate(c, climateState(c))` returns `c` unchanged (tested).

The formulas as implemented:

- **Insolation** = (habitableRadius / orbit radius)², the same zone `choosePlanetType` uses, so a type and its temperature can't disagree. Moons use their planet's orbit. Physically T ∝ L^¼ d^-½ and the habitable radius ∝ √L, so this is the real scaling. The habitable radius is clamped to 60–600 in `generateSystem`, and the climate follows the clamp. That is deliberate: types and climate stay consistent.
- **T_eq** = ((S⊕ · insolation · (1 − A)/4 + F_internal)/σ)^¼, **T** = T_eq (1 + ¾τ)^¼. An Earth analogue at the habitable radius is exactly 288.15 K (tested).
- **τ** = τ₀ · greenhouse · Pⁿ, with τ₀ and n from the table above, computed in code from the cited reference values.
- **Albedo**: the surface's by type (barren 0.07–0.15 after Mercury and the Moon, lava 0.06–0.12, desert 0.2–0.3 after Mars, terran/ocean 0.25–0.35 after Earth, ice 0.55–0.75 after Pluto). A thick atmosphere replaces it: CO₂ gets Venus's cloud deck (0.77), N₂ ≥ 0.5 bar gets Titan's haze (0.265). The pressure thresholds are gameplay choices. (Step 38 turned the deck's cliff at 10 bar into a ramp from 3 to 30 bar; see `terraforming.md`.)
- **Gravity and escape velocity** from the real radius (r/8)² R⊕ (the inverse of `gameRadius`): ice moons and icy dwarf/small worlds use ρ = 1.9; everything else uses Chen & Kipping. Gas giants (as tidal hosts) use ρ = 1000, the mean of Jupiter and Saturn.
- **Atmospheres by type** (drawn, then capped by retention). Terran/ocean: 0.5–2 bar N₂–O₂, super-Earths up to 2.5× that. Desert: 75% have one, 5–800 mbar, CO₂ (70%) or N₂. Ice: 25% Titan-like 0.5–3 bar N₂, 35% Pluto-like 10 µbar–1 mbar, else none. Lava: 40% Venus-like 10–100 bar CO₂. Barren: 20% a 0.1–10 mbar CO₂ remnant. The shares are gameplay choices. **Retention cap**: s < −0.3 airless, |s| < 0.3 at most 10 mbar. Living worlds (terran, ocean) keep their air even when marginal, because their type says they have it, and are flagged `leaking`: a deliberate hook for terraforming.
- **Thermostat**: living worlds get the greenhouse abundance that brings them to a drawn 275–300 K, clamped to 0.25–6× Earth's. This is the carbonate–silicate feedback in spirit, not its rate law (a gameplay stand-in). Without it, the game's temperate zone (0.5–1.6 habitable radii, wider than the real habitable zone) would give "terran" worlds from −45 °C to +115 °C.
- **Heat flow** = 92.1 mW/m² × g, plus tides for moons: 2.24 W/m² × (ρ_p/1326)^2.5 × (R/0.2859 R⊕)³ × (5.90 / (2.9 · a/R_p))^7.5. The 2.9 (`TIDAL_ORBIT_STRETCH`) is deliberate: the game packs moons into ~2–4 planet radii (the innermost moon of a gas giant has a median of 2.15), where the Galilean moons span 5.9–26. Stretching by 2.9 makes a typical innermost gas-giant moon Io-like. Lava worlds are floored at 1–3 W/m², so a molten look always comes with high heat.
- **Geothermal index** (for steps 14–15) = log10(F / 0.01 W/m²) / log10(300), clamped to 0–1: the Moon ~0.1, Earth 0.39, Enceladus 0.15–0.28, Io 0.95.
- **Water**: ice below 273.16 K, gone (steam) below the triple-point pressure, liquid up to the NIST boiling point, then steam. Surface water by type: ocean 0.8–0.95, terran 0.4–0.7, ice 0.5–0.8, desert 0–0.08.
- **Habitability** (gameplay thresholds): T1 −20…60 °C with any real air, T2 −10…40 °C at 0.3–5 bar, T3 = T2 plus N₂–O₂ and liquid water.
- **Streams**: the planet's climate uses `prng.fork('climate')`, each moon `prng.fork('climate', 'moon', j)`, the glow colour `prng.fork('climate', 'tint')`. The old `atmosphereColor` draw is kept in place, so every other generated value is unchanged (checked over 1500 systems: 0 differences apart from `atmosphere`/`climate`). 852 of 6568 planets changed whether they glow.
- **Glow colour** from the climate: shown from 5 mbar up (Mars's 6 mbar shows). N₂–O₂ blue; thin CO₂ dusty orange, thick CO₂ pale yellow; thick N₂ Titan orange, thin N₂ pale blue-white.

Measured over the first 1500 systems of galaxy 1337:

| Type | n | T °C p10/p50/p90 | With air | P median (with air) | Liquid water | T0/T1/T2/T3 | Geothermal p50 |
|---|---|---|---|---|---|---|---|
| terran | 997 | 3 / 18 / 48 | 100% | 1.1 bar | 96% | 75/73/20/829 | 0.40 |
| ocean | 366 | 4 / 16 / 47 | 100% | 1.3 bar | 96% | 25/31/7/303 | 0.40 |
| desert | 464 | −66 / −18 / 94 | 50% | 27 mbar | 5% | 401/56/7/0 | 0.32 |
| barren | 937 | −111 / −38 / 97 | 6% | 0.7 mbar | 0 | all T0 | 0.05 |
| ice | 1524 | −205 / −168 / −118 | 29% | 0.7 mbar | 0 | all T0 | 0.01 |
| lava | 182 | 107 / 157 / 273 | 21% | 28 bar | 0 | all T0 | 0.91 |
| moon, barren | 4114 | −187 / −122 / 6 | 1% | | 0 | all T0 | 0.00 |
| moon, ice | 2030 | −205 / −150 / −49 | 2% | | 0 | all T0 | 0.00 |
| moon, lava | 639 | −175 / −116 / 10 | 2% | | 0 | 637/2/0/0 | 0.91 |

43 Venus-like worlds (CO₂ > 10 bar) and 166 Titan-like ones (N₂ ≥ 0.5 bar). Among gas-giant moons, the heat flow is 0.003 W/m² at the median, 1.17 at p90 and 9.6 at most. 874 of the 1500 systems have a T3 world. In the home system (Haikrai, star 6) the first planet is an ocean super-Earth at 17 °C, 1.1 bar, T3.

## Open questions

- **Mercury and the Moon come out too light** with Chen & Kipping (escape velocity −26% and −13%), because they are denser than the fit. That only shifts their retention by −0.5 and −0.25, and both stay far below the shoreline.
- **Europa's heat flow** has no measured value here to check the tidal scaling against. Enceladus fits.
- **The shoreline is a band**, not a line (Mars and Ganymede). The ±0.3 margin is a gameplay choice that puts every Solar System body in the right class.
- **N₂ freezing** isn't modelled: Pluto and Triton have microbar air because N₂ freezes out, not because of escape. The game draws trace atmospheres for ice worlds directly.
- **Ice moons in hot zones**: moon types don't depend on the zone, so an ice moon close to its star can read 100 °C or more with water "steam". This predates the climate model; making moon types follow the zone would change moon looks.
- **Unverified**: the lava-world surface albedo (0.06–0.12) assumes dark basalt like Mercury and the Moon, and ice albedo beyond Pluto's 0.72 is a range, not a measurement.
