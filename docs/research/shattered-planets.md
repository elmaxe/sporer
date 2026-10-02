# Shattered planets: how hot a planet buster leaves a body, and how its wreck glows and cools

## Question

Step 31's planet buster blows a planet or moon apart (`gen/debris.ts`, drawn by `world/DebrisField.ts`). Asked for after it shipped: the exploded planet should look like what it would really be, "a lot of warm matter, melted". That needs:

1. The energy it takes to disperse a body, per kg, against the energy to melt and to vaporise its rock: does the wreck come out solid, molten or vapour, and how does that change with the body's size?
2. The temperatures involved (melting, boiling in vacuum, the critical point, Earth's core) and the colour and brightness of the glow at each (blackbody).
3. How fast molten rock crusts over in vacuum, how much of a crusted surface still glows, and how long the inside of a fragment stays molten.
4. How fast molten droplets cool, and what happens to the vapour as it expands.
5. Whether a ringed planet's rings survive.

Precision: the right regime (solid / molten / vapour) per body and the right trends; colours from measured data. The timings are compressed for the game and say so.

Reference cases: Earth, Mars, Mercury, Venus, the Moon, Ceres (rocky, small to large), Jupiter and Neptune (giants), Saturn's rings, Hawaiian lava flows (crusting).

## Sources

All accessed 2026-10-02.

- **NASA Earth fact sheet**, https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html (raw HTML): mass 5.9722 × 10²⁴ kg, volumetric mean radius 6371.000 km, **core radius 3485 km**, escape velocity 11.186 km/s. **Planetary fact table** (same site): escape velocities 4.3 (Mercury), 10.4 (Venus), 11.2 (Earth), 2.4 (Moon), 5.0 (Mars), 59.5 (Jupiter), 23.5 (Neptune) km/s; Moon and Mars fact sheets: 2.38 and 5.03 km/s. **Saturn fact sheet**: mass 568.32 × 10²⁴ kg.
- **Wikipedia, Gravitational binding energy** (raw wikitext): uniform Earth U = 2.24 × 10³² J, "37.5 MJ/kg"; with PREM (Dziewonski & Anderson 1981) U = **2.49 × 10³² J**.
- **Richet et al. 1993**, GRL 20:1675, abstract via Crossref (doi 10.1029/93GL01836): "the enthalpies of fusion of forsterite … ΔH_f = **142 ± 14 kJ/mol at 2174 K**".
- **Stewart et al. 2019**, "The shock physics of giant impacts", arXiv:1910.04687 (PDF): forsterite "melting (**2163 K**) and vaporization (models range between **3320 and 4460 K**)" at 1 bar; their new ANEOS sets the liquid's heat capacity limit to 3 f_cv N₀kT with **f_cv = 1.35** (the Dulong–Petit limit is 3N₀kT); "During the giant impact stage of planet formation, rocky planets are melted and partially vaporized".
- **Davies et al. 2020**, "Silicate melting and vaporization during rocky planet formation", arXiv:2002.00998 (PDF, Table 6): forsterite released to its triple point (5.2 Pa): complete melt and incipient vaporisation at **S = 3.474 kJ/K/kg**, **50% vapour at S = 7.616 kJ/K/kg**; same-material impact speeds 9.8 and 28.6 km/s; "we estimate the 1-bar boiling temperature as 3300 ± 300 K"; forsterite ρ₀ = **3220 kg/m³**.
- **Davies et al. 2021**, "Temperature and density on the forsterite liquid-vapor phase boundary", JGR Planets, https://pmc.ncbi.nlm.nih.gov/articles/PMC8244105/ (HTML): "triple point for forsterite at **2,163 K and 5.2 Pa** (Nagahara et al., 1994)"; critical point "**T_c = 6,240 ± 200 K**, P_c = 0.13 ± 0.02 GPa"; in a giant impact "the mass fraction of the mantle that reaches supercritical conditions is 0.123 … and 0.188".
- **Mitchell Charity, "What color is a blackbody?"**, http://www.vendian.org/mncharity/dir3/blackbody/UnstableURLs/bbr_color.html (bbr_color.txt, version 2001-06-22, CIE 1964 10° CMFs, sRGB primaries): the rows used, `K x y P R G B`: 1000 K 2.525e+06 1.0000 0.0401 0.0000 (#ff3800); 1500 K 7.333e+09 1.0000 0.1515 0.0000 (#ff6d00); 2000 K 4.431e+11 1.0000 0.2484 0.0061 (#ff8912); 2500 K 5.422e+12 1.0000 0.3577 0.0640; 3000 K 2.939e+13 1.0000 0.4589 0.1483; 4000 K 2.496e+14 1.0000 0.6354 0.3684; 5000 K 9.170e+14 1.0000 0.7792 0.6180; 6000 K 2.208e+15 1.0000 0.8952 0.8666; 6500 K 3.108e+15 1.0000 0.9445 0.9853 (plus 1200, 1800, 2200, 3500 K, in `BLACKBODY`). The 0–1 R G B columns are linear (the 0–255 ones are gamma-corrected), so they feed the renderer directly.
- **Wikipedia, Draper point**: "the approximate temperature above which almost all solid materials visibly glow … 977 °F" (525 °C, **798 K**).
- **Wikipedia, Earth's inner core**: inner-core boundary temperature "between 5400 K and 5700 K" (Alfè et al. 2002).
- **Kauahikaua et al. 2003**, USGS Professional Paper 1676, pp. 63–87 (PDF, p. 81): Flynn & Mouginis-Mark (1992) modelled an active Kīlauea flow as "a crustal temperature of 768ºC and a hot core of 1,150ºC that composed **3.6 percent** of the lava flow area … In the next 52 minutes, the crust cooled to 420ºC"; channel measurements gave hot areas of 60% (centre) and 1.2% (margin); Pinkerton et al. (2002): "core (>1,050°C), viscoelastic skin (750–900°C), rigid solid crust (<750°C)".
- **Wikipedia, Thermal diffusivity** (raw table, citing the CRC handbook): quartz 1.4, sandstone 1.15 mm²/s, i.e. rock κ ≈ 1 × 10⁻⁶ m²/s.
- **Wikipedia, Rings of Saturn**: ring mass "1.54 (± 0.49) × 10¹⁹ kg" (Iess et al. 2019).
- **Wikipedia, Jupiter**: a dilute core "comprising heavy elements with a combined mass 7–25 times the Earth" (Wahl et al. 2017), out of 318 Earth masses.

## Measurements

`measure.mjs` (energy budget, cooling, blackbody check; `node measure.mjs`):

```js
// Energy budget of blowing a planet apart, cooling times, and blackbody glow.
const G = 6.6743e-11, R_gas = 8.314462618, sigma = 5.670374419e-8;
const h = 6.62607015e-34, c = 2.99792458e8, k = 1.380649e-23;
// NASA Earth fact sheet
const M = 5.9722e24, R = 6371.0e3, coreR = 3485e3;
const Uuniform = (3 * G * M * M) / (5 * R);
const Uprem = 2.49e32; // Wikipedia (PREM, Dziewonski & Anderson 1981)
console.log('Binding energy: uniform %s J (wiki 2.24e32), PREM %s J', Uuniform.toExponential(3), Uprem.toExponential(2));
console.log('  per kg: uniform %s MJ/kg (wiki 37.5), PREM %s MJ/kg', (Uuniform / M / 1e6).toFixed(1), (Uprem / M / 1e6).toFixed(1));
// Forsterite Mg2SiO4: 7 atoms, molar mass
const molar = 2 * 24.305e-3 + 28.085e-3 + 4 * 15.999e-3;
const cpSolid = (7 * 3 * R_gas) / molar; // Dulong-Petit
const cpLiquid = 1.35 * cpSolid; // Stewart et al. 2019: fcv = 1.35
const Tm = 2163, T0 = 300; // melting point (Stewart et al.; Davies et al.: triple point 2163 K)
const Hf = 142e3 / molar; // Richet et al. 1993
const melt = cpSolid * (Tm - T0) + Hf;
console.log('Forsterite: molar mass %s kg/mol, cp(solid, Dulong-Petit) %s J/kg/K, cp(liquid) %s', molar.toFixed(5), cpSolid.toFixed(0), cpLiquid.toFixed(0));
console.log('  heat 300 K -> melt %s MJ/kg + fusion %s MJ/kg = %s MJ/kg', ((cpSolid * (Tm - T0)) / 1e6).toFixed(2), (Hf / 1e6).toFixed(2), (melt / 1e6).toFixed(2));
for (const Tb of [3320, 4460]) console.log('  liquid to boiling at %d K: +%s MJ/kg', Tb, ((cpLiquid * (Tb - Tm)) / 1e6).toFixed(2));
console.log('  binding / melting = %s', (Uprem / M / melt).toFixed(1));
// Small bodies: binding per kg scales as GM/R ~ R^2 at fixed density
for (const [name, Rb, Mb] of [['Moon', 1737.4e3, 7.346e22], ['Mars', 3389.5e3, 6.4171e23], ['Ceres', 469.7e3, 9.38e20]]) {
  const u = (3 * G * Mb) / (5 * Rb);
  console.log('  %s: uniform binding %s MJ/kg = %s x melting', name, (u / 1e6).toFixed(2), (u / melt).toFixed(2));
}
console.log('Core radius / Earth radius: %s', (coreR / R).toFixed(3));
// Cooling: conduction time to freeze a chunk of half-thickness L, t ~ L^2 / (4 kappa)
const kappa = 1.0e-6; // m^2/s, rock (Wikipedia/CRC: sandstone 1.15, quartz 1.4 mm^2/s)
const yr = 3.156e7;
for (const fraction of [0.01, 0.05, 0.15]) {
  const L = (fraction * R); // chunk size in game: fraction of the radius
  console.log('  chunk %s R = %s km: freezes through in ~%s yr', fraction, (L / 1e3).toFixed(0), ((L * L) / (4 * kappa) / yr).toExponential(1));
}
// Crust: thickness 2 sqrt(kappa t)
for (const t of [60, 3600, 86400]) console.log('  crust after %d s: %s cm', t, (200 * Math.sqrt(kappa * t)).toFixed(1));
// Radiated flux of a melt surface
for (const T of [798, 1100, 1423, 2163, 4000]) console.log('  sigma T^4 at %d K: %s W/m^2', T, (sigma * T ** 4).toExponential(2));
// Visible (400-700 nm) blackbody radiance, relative, vs Charity's P column
const planck = (lam, T) => (2 * h * c * c) / lam ** 5 / (Math.exp((h * c) / (lam * k * T)) - 1);
const visible = (T) => { let s = 0; for (let l = 400; l <= 700; l += 1) s += planck(l * 1e-9, T); return s; };
const charity = { 1000: 2.525e6, 1500: 7.333e9, 2000: 4.431e11, 3000: 2.939e13, 4000: 2.496e14, 6000: 2.208e15 };
console.log('T K | visible radiance / 2000 K | Charity P / 2000 K');
for (const T of Object.keys(charity).map(Number)) console.log(`${T} | ${(visible(T) / visible(2000)).toExponential(2)} | ${(charity[T] / charity[2000]).toExponential(2)}`);
```

Output:

```
Binding energy: uniform 2.242e+32 J (wiki 2.24e32), PREM 2.49e+32 J
  per kg: uniform 37.5 MJ/kg (wiki 37.5), PREM 41.7 MJ/kg
Forsterite: molar mass 0.14069 kg/mol, cp(solid, Dulong-Petit) 1241 J/kg/K, cp(liquid) 1675
  heat 300 K -> melt 2.31 MJ/kg + fusion 1.01 MJ/kg = 3.32 MJ/kg
  liquid to boiling at 3320 K: +1.94 MJ/kg
  liquid to boiling at 4460 K: +3.85 MJ/kg
  binding / melting = 12.6
  Moon: uniform binding 1.69 MJ/kg = 0.51 x melting
  Mars: uniform binding 7.58 MJ/kg = 2.28 x melting
  Ceres: uniform binding 0.08 MJ/kg = 0.02 x melting
Core radius / Earth radius: 0.547
  chunk 0.01 R = 64 km: freezes through in ~3.2e+7 yr
  chunk 0.05 R = 319 km: freezes through in ~8.0e+8 yr
  chunk 0.15 R = 956 km: freezes through in ~7.2e+9 yr
  crust after 60 s: 1.5 cm
  crust after 3600 s: 12.0 cm
  crust after 86400 s: 58.8 cm
  sigma T^4 at 798 K: 2.30e+4 W/m^2
  sigma T^4 at 1100 K: 8.30e+4 W/m^2
  sigma T^4 at 1423 K: 2.33e+5 W/m^2
  sigma T^4 at 2163 K: 1.24e+6 W/m^2
  sigma T^4 at 4000 K: 1.45e+7 W/m^2
T K | visible radiance / 2000 K | Charity P / 2000 K
1000 | 1.49e-5 | 5.70e-6
1500 | 2.27e-2 | 1.65e-2
2000 | 1.00e+0 | 1.00e+0
3000 | 5.26e+1 | 6.63e+1
4000 | 4.27e+2 | 5.63e+2
6000 | 3.91e+3 | 4.98e+3
```

The uniform-sphere binding energy reproduces Wikipedia's 2.24 × 10³² J and 37.5 MJ/kg exactly; PREM's density profile adds 11%. The flat 400–700 nm Planck integral follows Charity's eye-weighted power within a factor 2.6 (at 1000 K, where the flat band overweights deep red against the eye's sensitivity, which peaks at 555 nm) and within 30% from 1500 K up: the trend is right, and the game uses Charity's column.

`measure2.mjs` (the game's mapping per reference body, and droplets):

```js
// Blast heat, melt and vapour shares for reference bodies, and a molten droplet's cooling.
const sigma = 5.670374419e-8;
const melt = 3.32e6, vap = 2 * 2163 * (7616 - 3474), share = 0.25;
console.log('vapour energy (Davies 2020 Table 6, 2 x T_tp x dS50): %s MJ/kg', (vap / 1e6).toFixed(2));
// Escape velocities, km/s: NASA fact sheets (Moon, Mars, Earth, Jupiter, Neptune); Ceres: Dawn (0.51)
const bodies = [['Ceres', 0.51], ['Moon', 2.38], ['Mercury', 4.3], ['Mars', 5.03], ['Venus', 10.36], ['Earth', 11.19], ['Neptune', 23.5], ['Jupiter', 59.5]];
console.log('body | v_esc km/s | binding MJ/kg | heat MJ/kg | melt | vapour');
for (const [name, v] of bodies) {
  const bind = 0.3 * (v * 1000) ** 2;
  const heat = share * bind;
  const m = Math.min(1, heat / melt), f = Math.min(1, Math.max(0, heat - melt) / vap);
  console.log(`${name} | ${v} | ${(bind / 1e6).toFixed(1)} | ${(heat / 1e6).toFixed(2)} | ${m.toFixed(2)} | ${f.toFixed(2)}`);
}
// A molten droplet of diameter d radiating from its whole surface: dT/dt = -6 sigma T^4 / (rho c d)
const rho = 3220, c = 1.35 * 1241; // forsterite density (Davies et al. 2020), liquid heat capacity
for (const d of [1e-4, 1e-3, 1e-2]) {
  const k = (6 * sigma) / (rho * c * d), T0 = 2163;
  const tau = 1 / (3 * k * T0 ** 3); // T = T0 (1 + t/tau)^(-1/3)
  const tDraper = tau * ((T0 / 798) ** 3 - 1);
  console.log(`droplet ${d * 1000} mm: tau ${tau.toFixed(2)} s, below the Draper point after ${tDraper.toFixed(1)} s`);
}
```

Output:

```
vapour energy (Davies 2020 Table 6, 2 x T_tp x dS50): 17.92 MJ/kg
body | v_esc km/s | binding MJ/kg | heat MJ/kg | melt | vapour
Ceres | 0.51 | 0.1 | 0.02 | 0.01 | 0.00
Moon | 2.38 | 1.7 | 0.42 | 0.13 | 0.00
Mercury | 4.3 | 5.5 | 1.39 | 0.42 | 0.00
Mars | 5.03 | 7.6 | 1.90 | 0.57 | 0.00
Venus | 10.36 | 32.2 | 8.05 | 1.00 | 0.26
Earth | 11.19 | 37.6 | 9.39 | 1.00 | 0.34
Neptune | 23.5 | 165.7 | 41.42 | 1.00 | 1.00
Jupiter | 59.5 | 1062.1 | 265.52 | 1.00 | 1.00
droplet 0.1 mm: tau 0.05 s, below the Draper point after 1.0 s
droplet 1 mm: tau 0.52 s, below the Draper point after 9.9 s
droplet 10 mm: tau 5.22 s, below the Draper point after 98.8 s
```

(Droplets: dT/dt = −6σT⁴/(ρ c d) from the whole surface, ρ = 3220 kg/m³, c the liquid's 1675 J/kg/K, so T = T₀(1 + t/τ)^(−1/3) with τ = ρcd/(18σT₀³).)

What it says:

- **Dispersal energy against melting.** The specific binding energy (3/5)GM/R = (3/10)v_esc² grows with the square of the escape velocity. For an Earth it's 12.6 times what melting its rock takes, for Mars 2.3 times, for the Moon half, for Ceres a fiftieth. Even a small share of it as heat melts and partly vaporises a big planet; a small moon's pieces stay solid. Giant impacts, which deliver less than dispersal, already take 12–19% of a mantle supercritical (Davies et al. 2021).
- **Vaporising** forsterite in vacuum costs ~18 MJ/kg on top of melting (the entropy jump from melt to 50% vapour at the triple point, doubled for all of it), five times the melting energy; boiling at 1 bar is near 3300 K, the critical point 6240 K.
- **Giants** are bound so tightly (Jupiter ~1 GJ/kg) that everything, their few per cent of heavy elements included, ends up as gas: no rocks.
- **The glow.** Melt at the triple point (2163 K) glows orange (#ff932c at 2200 K); the visible power falls ~10⁵ times from 2000 K to 1000 K and is gone at the Draper point. Earth's core (5400–5700 K) would glow near white, but in vacuum the exposed melt sits near its triple point.
- **Crusting.** A lava surface in vacuum radiates ~1 MW/m² at 2163 K; a skin forms in seconds (1.5 cm of conductive crust in a minute), and measured flows keep only a few per cent of their area showing the hot core (3.6% after emplacement, Flynn & Mouginis-Mark), 1–60% depending on how much it's being torn.
- **The insides never freeze** on any timescale that matters: even the game's smallest fragment (1% of an Earth radius, 64 km) takes ~3 × 10⁷ years to freeze through by conduction. So the fissures keep glowing for good.
- **Droplets** cool fast: a millimetre one stops glowing in about 10 s.
- **Rings** (Saturn's: 1.5 × 10¹⁹ kg, 3 × 10⁻⁸ of the planet) are run over by debris leaving at escape speed with ~10⁸ times their mass: they don't survive.

## Game mapping

In `gen/debris.ts` (`debrisLook`, `debrisLookFor`, `hotArea`, `dropletTemperature`, `vapourState`, `glowColor`, `glowBrightness`), tested in `tests/buster.test.ts`:

- **Heat** per kg = `heatShare` × (3/10) v_esc², with v_esc from the body's climate (`ClimateSetting.escapeVelocity`), or, for giants and small bodies, from `earthRadii` and `bodyMass` in `gen/climate.ts`.
- **melt** = heat / 3.32 MJ/kg (capped at 1); **vapour** = (heat − 3.32 MJ/kg) / 17.9 MJ/kg (capped); giants (gas bands) are all vapour and `gas`. What's left after vaporising heats the vapour from 2163 K at the liquid's heat capacity, capped at the critical point 6240 K.
- **Rocks:** a `melt` share of them melted (chosen per rock): crusted dark grey (`CRUST`) with glowing fissures (ridged noise in the rock's own space, at least a pixel wide so far rocks glint, throbbing slowly as the melt wells up) whose share of the surface goes from all of it to `hotArea` = 15% over `crustTime`; the crust itself glows at `crustTemperature`, from the melt's 2163 K down to `crustFloor` = 1050 K (dull red, brighter near the fissures); a faint additive glow surrounds a molten field; the rest of the rocks keep the body's cold colours. Rocks from inside Earth's core radius share (0.547) are iron grey. The fissures glow at the triple point: Charity's colour, brightness ∝ (P/P₂₁₆₃)^¼. The more vaporised, the fewer rocks (×(1 − 0.7 vapour)); giants have none.
- **Droplets:** 0.6 × melt of the dust motes are molten droplets cooling as T₀(1 + t/τ)^(−1/3); the rest of the dust is the body's colours, sooty where it melted.
- **Vapour:** puffs that spread (size 1 + t/`vapourTime`), cool adiabatically as a monatomic gas (T ∝ V^(−2/3) ∝ size⁻²), thin out as 1/size³ and fade as they condense below the triple point; a giant's gas lingers at a quarter density, tinted by its bands.
- **Rings** go with the planet (`Planet.bust`, `PlanetGlobe.bust`).

Deliberate departures:

- **`heatShare` = 0.25** is stylised: the share of dispersal energy that ends up as heat isn't known for a planet buster; 0.25 gives the three regimes across real bodies (an Earth a third vapour, Mars half molten, the Moon barely warm).
- **Time is compressed.** Crusting (hours to a few per cent hot area) takes `crustTime` = 6 s; the vapour, which would take ~10 minutes to cross an Earth radius at escape speed, doubles in `vapourTime` = 8 s. Droplets cool on roughly their real timescale (`dropletTime` 1.5 s ≈ a 3 mm droplet).
- **The aftermath stays hot** (asked for: the settled field looked dead). The fissures keep 15% of the surface, between a calm flow's measured 3.6% and a churning channel's 60% (tumbling fragments keep tearing their skins), and the crust is held at 1050 K, a fresh crust's measured 768 °C, which glows dull red; a real crust cools below the Draper point within the hour (to 420 °C in 52 minutes, Flynn & Mouginis-Mark). The crust's glow brightness is set by eye (`debrisLookParams.crust`), not by the blackbody power, which at 1050 K would be a twentieth of the melt's.
- **Brightness is compressed** to the fourth root of the visible power (the real range is ~10⁹ from 1000 K to 6000 K).
- **The core:** Earth's core radius share stands in for every rocky body's, and core pieces glow like the rest (exposed melt in vacuum sits near its triple point).

## Open questions

- The latent heat of vaporisation is taken from Davies et al.'s entropy jump at the triple point, doubled for full vaporisation (the dome isn't linear in entropy far from 50%); direct calorimetry of forsterite vaporisation was not found (Costa et al. 2017 give partial molar enthalpies per vapour species, 543–640 kJ/mol, not a total).
- `heatShare` (above).
- Ice-rich bodies are treated as rock: their ice would melt and vaporise far more easily, but water doesn't glow, so it only matters for how much vapour a cold icy moon would leave.
