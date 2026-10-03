# Chance of life

## Question

Issue #59 asks how slim the chances of life are on the planet or moon you're at, taking into account the distance to the star and to gas giants (radiation), the body's make-up and whether it has an atmosphere, "based on current scientific understanding in the field of exobiology". `gen/life.ts` works it out for every solid body from what the game already knows (its climate from `gen/climate.ts`, its system's stars, a moon's planet). The game shows it in the system view's tooltip ("life 52%"), the low-orbit HUD line, and with its parts in the planet lab's readout (Life row).

What's needed:

1. Where life as we know it can live: liquid water, within life's temperature limits, with an energy source.
2. Water under the surface: under an ice shell (Europa, Enceladus) or in the rock (Mars).
3. Ionising radiation at the surface: cosmic rays, a giant host's radiation belts, a red dwarf's flares, and how much the air shields. Also how much radiation life can bear.
4. Time: how long the star gives life to get started, and how long life took on Earth.

The precision that matters: the Solar System's bodies should come out in the order astrobiology ranks them (Earth, then the ocean moons and Mars, then Titan and the rest, and nothing on the Moon, Mercury, Venus or Io). Doses and depths only need the right order of magnitude.

**There is no measured probability of life anywhere.** Earth is the only example, and whether life starts readily is disputed: Lineweaver & Davis 2002 argue for at least 13% on Earth-like planets older than 1 Gyr, while Spiegel & Turner 2012 show the same evidence is consistent with an arbitrarily low chance. So the game assumes life starts wherever conditions allow. The percentage is how close the body's conditions come to ones where life is known to thrive, not a measured probability. This is a deliberate stylisation.

## Sources

All accessed 2026-10-02. Most of the text was read from PDFs and pages saved in this session.

**Temperature limits of life**
- **Takai et al. 2008**, PNAS 105:10949 (PMC2490668): "Elevated hydrostatic pressures extend the temperature maximum for possible cell proliferation from 116°C at 0.4 MPa to 122°C at 20 MPa". So 122 °C is the highest growth temperature known, and it needs pressure.
- **Clarke et al. 2013**, PLoS ONE 8:e66207: "The general lower thermal limit for growth in free-living microbial cells appears to be ∼−20°C".
- **Mykytczuk et al. 2013**, ISME J 7:1211: Planococcus halocryophilus "grows and divides at −15 °C … and is metabolically active at −25 °C".

**Ionising radiation**
- **Hassler et al. 2014**, Science 343:1244797 (accepted manuscript, Caltech repository):
  - The surface dose: "average total GCR dose rate at Gale Crater (-4.4 km MOLA) of 0.210 +/- 0.040 mGy/day". Table 1 gives the cruise value, 0.48 ± 0.08 mGy/day (1.84 mSv/day).
  - The air above: "Typical column depths of the Martian atmosphere at Gale Crater are on the order of 20 g/cm2", and "averaged about 21 g cm-2 over the first 300 sols".
- **UNSCEAR 2008**, Vol. I, Annex B:
  - Table 12: "Total cosmic and cosmogenic 0.39" mSv/yr, and "Total natural 2.4" mSv/yr.
  - The air layer: "an air layer of approximately 10,000 kg/m2 (1,000 g/cm2)".
- **Ghiassi-nejad et al. 2002**, Health Phys 82:87: Ramsar, Iran, "an annual radiation absorbed dose from background radiation that is up to 260 mSv y(-1)". This is the highest natural background where people live.
- **Deinococcus radiodurans**:
  - Battista et al. 1999 (Trends Microbiol 7:362): it survives "a 5000-Gray dose … without loss of viability".
  - Lange et al. 1998 (Nat Biotechnol 16:929): "capable of growth … in the highly irradiating environment (60 Gy/h) of a 137Cs irradiator".
  - Daly et al. 2004 (Science 306:1025) gives 50 Gy/h. The game uses the higher, 60.
- **Galilean moons' surface doses** (read second-hand: Wikipedia's wikitext citing the sources; Ringwald 2000's notes were unreachable):
  - Europa "5.4 Sv (540 rem)" per day (Ringwald 2000).
  - Ganymede "50–80 mSv (5–8 rem) per day" (Podzolko & Getselev 2013).
  - Callisto "0.01 rem (0.1 mSv) per day".
- **Johnson et al. 2004**, "Radiation effects on the surfaces of the Galilean satellites", in *Jupiter* (CUP), ch. 20, Table 20.1. It gives the global average particle energy flux (keV cm⁻² s⁻¹) for each moon, ±50%:
  - Io 1×10⁹
  - Europa 5–8×10¹⁰
  - Ganymede 2×10⁸ (equator) to 5×10⁹ (poles)
  - Callisto 2×10⁸
- **NASA Jovian satellite fact sheet**:
  - Semi-major axes in Jupiter radii: Io 5.91, Europa 9.40, Ganymede 14.97, Callisto 26.33.
  - Densities (kg/m³): Io 3530, Europa 3010, Ganymede 1940, Callisto 1830.
  - From the Saturnian and Pluto fact sheets: Enceladus 1610, Titan 1880, Pluto 1854.
- **NASA planet fact sheets**, dipole field strength: Jupiter 4.30 G·R_J³, Saturn 0.215, Uranus 0.228, Neptune 0.142, Earth 0.306. Times each planet's radius³, the moments relative to Earth's come out at Jupiter 19 800, Saturn 593, Uranus 47.9 and Neptune 27.2.
- **Sittler et al. 2020**, Icarus (NTRS 20205001059): Titan's surface "total dose rates ~ 10⁻¹¹ rads/s", under "~ 10⁴ g/cm2 column mass density".
- **Atri 2017**, MNRAS 465:L34 (arXiv:1606.07027). Surface doses from stellar proton events on close-in planets, at 30–1000 g/cm² of air and 0.05–10 Earth magnetic moments:
  - On a planet with "virtually no magnetic field … the radiation dose varies between 1.46×10⁴ Sv to 5.77×10⁻⁸ Sv".
  - For Proxima b with "a 1000 g cm⁻² atmosphere (like the Earth) and 1 M_Earth magnetic moment, the particle radiation dose from even the most extreme SPE would not have any significant impact on its biosphere. However, for thinner atmospheres (700 g cm⁻² or lower …) it would be able to produce 'extinction level' doses (5-10 Sv) although not enough to sterilize the planet of life as we know it (∼10⁵ Sv)".
  - Proxima b "receives about 65% of the energy that earth receives".
  - Lethal doses: "5-10 Sv for humans … 10⁴ Sv for viruses, and 10⁴-10⁵ Sv for Deinococcus".
  - "M dwarfs are very active and have the highest flare frequency, followed by K and G-type stars".
- **Shields, Ballard & Johnson 2016**, Phys Rep 663:1:
  - "M-dwarf stars exhibit saturated emission levels for the first 0.5–1 Gyr".
  - Ozone "could be depleted by as much as 94%" by flare protons.

**Water under the surface**
- **Beuthe 2019**, Icarus (arXiv:1903.02520): "kice = a/T with either a = 567 W/m [Klinger, 1980] or a = 651 W/m [Petrenko and Whitworth, 1999]". The 567 version "is only 3% too low at the melting temperature".
- **Halbert et al. 2022**, Meteoritics & Planetary Science 57:1130 (author manuscript, Aberdeen repository): basalt's thermal conductivity runs "from 2.71 ± 0.09 W m−1 K−1 at 224.4 K, to 2.63 ± 0.05 W m−1 K−1 at 288.8 K".
- **Europa's ice shell**:
  - Levin et al. 2025 (Nature Astronomy, PMC12827049): "a thermally conductive ice shell with a thickness of 29 ± 10 km", with heat flow "15 mW m−2 to 35 mW m−2".
  - Vance et al. 2018 (as cited by Carnahan et al., arXiv:2011.12502): Europa 5–30 km, Enceladus 10–50 km, Titan 50–150 km.
- **Wright, Manga & Panning 2024**, PNAS 121:e2409983121: in Mars's "mid-crust (∼11.5 to 20 km depths), fractured igneous rocks saturated with liquid water best explains the existing data". This is disputed: two PNAS replies argue the data don't require water.
- **Parro et al. 2017**, Sci Rep 7:45629: Mars's modelled "heat flows varying between 14 and 25 mW m−2, with an average value of 19 mW m−2". InSight's heat probe never reached depth, so this is a model value.
- **NOAA Ocean Service**: "The average depth of the ocean is about 3,682 meters".

**Energy**
- **Hoppe et al. 2024**, Nat Commun 15:7385: algae under Arctic sea ice photosynthesise at "not more than 0.04 ± 0.02 µmol photons m-2 s-1", against "a typical surface value of 2000 µmol photons m−2 s−1".
- Earth's heat flow (47 TW, Davies & Davies 2010) is already in `climate.md`.

**Time**
- **Impey, Teach Astronomy**, "Main-sequence lifetimes": "t = 10^10 / M^2.5 years", "accurate to about a factor of two". Weber State's PHSX 1040 notes give the same.
- **Earth's history**:
  - Age 4.54 Gyr (USGS).
  - Oceans by 4.40 Ga: "a detrital zircon with an age as old as 4,404+/-8 Myr", the "earliest evidence for continental crust and oceans" (Wilde et al. 2001).
  - Possible life at 4.10 Ga (Bell et al. 2015: graphite in zircon "consistent with a biogenic origin").
  - Stromatolites at 3.7 Ga (Nutman et al. 2016). Allwood et al. 2018 dispute these.
  - At least 3.77 Ga, and possibly 4.28 Ga (Dodd et al. 2017).
- **Lopez, Schneider & Danchi 2005**, ApJ 627:974: around a 1 M☉ red giant, "an additional 10⁹ years with a stable habitable zone in the region from 7 to 22 AU" after the helium flash.
- **Agol 2011**, ApJL 731:L31: around a white dwarf, "≈0.005 to 0.02 AU … habitable durations of at least 3 Gyr", at most 8 Gyr.
- **Lineweaver & Davis 2002**, Astrobiology 2:293: "on such planets, older than ∼ 1 Gyr, the probability of biogenesis is > 13% at the 95% confidence level". **Spiegel & Turner 2012**, PNAS 109:395: "the evidence is inconclusive and indeed is consistent with an arbitrarily low intrinsic probability of abiogenesis".

**Not used**
- The Planetary Habitability Index (Schulze-Makuch et al. 2011, PHI = (S·E·C·L)^¼ over substrate, energy, chemistry and liquid solvent) is the closest published scheme. Its table of Solar System values couldn't be read (paywalled), so nothing was calibrated on it. The game's parts follow the same idea: water (L), energy (E), and make-up through water content and heat (S, C).

## Measurements

### Air shielding

The dose under an air column x (g/cm²) is taken as D = D₀ (1 + x/x₀)^-k, with D₀ the cruise dose. The fit goes through Mars's surface (0.210 of 0.48 mGy/day under 21 g/cm²) and Earth's sea level (0.39 mSv/yr = 0.00107 mSv/day under 1000 g/cm²; for sea-level muons mSv ≈ mGy):

```js
const cruise = 0.48, mars = 0.210, earth = 0.39 / 365.25;
const r1 = Math.log(cruise / mars), r2 = Math.log(cruise / earth);
let lo = 0.1, hi = 1000;
const f = (x0) => Math.log(1 + 1000 / x0) / Math.log(1 + 21 / x0) - r2 / r1;
for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); f(m) > 0 ? (hi = m) : (lo = m); }
const k = r1 / Math.log(1 + 21 / lo); // x0 = 36.75 g/cm², k = 1.829
```

| Check | Column (g/cm²) | Model (mGy/day) | Measured |
|---|---|---|---|
| Mars, Gale Crater | 21 | 0.210 | 0.210 ± 0.040 (Hassler) |
| Mars, game's mean (6.4 mbar, 0.379 g) | 17 | 0.24 | — |
| Earth, sea level | 1000 | 0.00107 | 0.39 mSv/yr (UNSCEAR) |
| Titan (1.47 bar, 0.138 g) | 10 800 | 1.3×10⁻⁴ | 8.6×10⁻⁶ (Sittler: 10⁻¹¹ rad/s) |

Titan comes out 15× too high. The curve is only fitted up to 1000 g/cm², and nothing that matters to life changes between the two values, since both are far below harm. This is listed below as an open question.

### Jupiter's belts

A least-squares fit of ln D (mGy/day, taking Sv ≈ Gy for electrons) against the orbit in Jupiter radii gives ln D = 14.18 − 0.6328 d:

| Moon | Orbit (R_J) | Measured | Fit |
|---|---|---|---|
| Europa | 9.40 | 5400 | 3770 |
| Ganymede | 14.97 | 50–80 | 111 |
| Callisto | 26.33 | 0.1 | 0.084 |

That's within a factor of 1.7 everywhere. Inside Europa the dose is held at Europa's value: Johnson et al. give Io a fiftieth of Europa's particle energy flux, so the belts don't keep strengthening inwards. Io's dose itself wasn't found in a readable source.

### Ice shells, aquifers and water depth

- A conductive ice shell from surface temperature T_s down to melting carries F = 567 ln(273.15 / T_s) / d. The melt depth is therefore d = 567 ln(273.15 / T_s) / F.
- Through rock (2.6 W m⁻¹ K⁻¹) it is d = 2.6 (273.15 − T_s) / F.
- How deep a body's water goes is the larger of two estimates:
  - **From density:** a two-part mix of rock (Io's density, 3530) and water (1000, standing for ice too), 1/ρ = x/ρ_w + (1 − x)/ρ_r. That gives the water mass fraction x, and the outer layer's thickness follows from its volume.
  - **From surface water:** the water inventory spread as a global layer, `water` × 3.682 km, so Earth's 0.71 gives its 2.6 km.
- Rock holds water in open pores down to 20 km at Mars's gravity, the bottom of Wright et al.'s saturated mid-crust. Pores close under the rock's weight ρgz, so this depth scales as 1/g.

The Solar System run below is the game's own code over the Sol system (`npx vite-node check.ts` with `bodyLife` for every planet and moon). It uses the bodies' heat flows from `gen/sol.ts`:

| Body | T (K) | ρ (kg/m³) | Water (km) | Melts at (km) | Surface dose (mGy/day) | Underground | Chance |
|---|---|---|---|---|---|---|---|
| Earth | 288 | 5513 | 2.6 | 0 | 0.0010 | sea, ×1.0 | plants: 100% |
| Mercury | 437 | 5457 | 0 | — | 0.48 | none | 0% |
| Venus | 737 | 5252 | 0 | — | 2×10⁻⁷ | none | 0% |
| Moon | 270 | 3353 | 0 | — | 0.48 | none | 0% |
| Io | 105 | 3537 | 0 | — | 3760 | none | 0% |
| Europa | 92 | 3021 | 112 | 12 | 3760 | ocean, ×0.54 | 52% |
| Enceladus | 60 | 1614 | 95 | 29 | 3760 | ocean, ×0.33 | 31% |
| Triton | 37 | 2070 | 337 | 56 | 0.79 | ocean, ×0.22 | 21% |
| Mars | 210 | 3916 | 0.18 | 8.7 (pores to 20) | 0.24 | aquifer, ×0.21 | 20% |
| Ganymede | 106 | 1947 | 734 | 54 | 111 | ocean, ×0.11 | 10% |
| Callisto | 115 | 1839 | 741 | 98 | 0.56 | ocean, ×0.054 | 5% |
| Titan | 93 | 1886 | 759 | 122 | 1×10⁻⁴ | ocean, ×0.054 | 5% |
| Rhea, Tethys, Titania | 60–67 | 990–1660 | 280–410 | 266–285 | — | ocean, ×0.033 | 3% |
| Pluto | 33 | 2083 | 297 | 402 | 0.48 | frozen through | 0% |

How these compare with the real bodies:

- **Densities** come back from gravity and escape velocity within 0.4% of NASA's (Europa 3021 against 3010, Ganymede 1947 against 1940).
- **Europa's 12 km shell** sits inside Vance's 5–30 km. It is below Levin's 29 ± 10 km because `sol.ts` gives Europa 50 mW/m², against Levin's 15–35.
- **Mars's melt depth of 8.7 km** is above Wright's 11.5–20 km, where the water was found. The pores reach 20 km, so Mars counts as wet.
- **The ranking** matches what astrobiology expects: Earth, then Europa and Enceladus, then Mars, then Titan and the outer moons, with nothing on the Moon, Mercury, Venus or Io.

### Time

The time factor is the chance that life has started, if it takes an exponentially distributed wait with mean τ = 0.5 Gyr (Earth: 0.3–0.7 Gyr from oceans to life) and the star is seen at a random moment of its available time t: P = 1 − (τ/t)(1 − e^(−t/τ)). For the game's nominal stars:

| Star | Mass (M☉) | Lifetime (Gyr) | Time factor |
|---|---|---|---|
| O | 12 | 0.020 | 0.020 |
| Blue giant | 10 | 0.032 | 0.031 |
| B | 6 | 0.113 | 0.105 |
| Red giant | 1.5 | (1 Gyr in the zone) | 0.568 |
| A | 2 | 1.77 | 0.725 |
| White dwarf | 0.7 | (3 Gyr in the zone) | 0.834 |
| F | 1.3 | 5.19 | 0.904 |
| G (the Sun) | 1 | 10.0 | 0.950 |
| K | 0.75 | 20.5 | 0.976 |
| Red dwarf | 0.35 | 138 | 0.996 |

### Generated galaxy

This is 600 star systems and 100 rogues of galaxy 1337. "Zero" is the share of bodies at exactly 0%.

| Body | Zero | Median |
|---|---|---|
| Barren worlds and moons | 100% | 0% |
| Lava worlds and moons | 100% | 0% |
| Ice moons | 53% | 0% |
| Ice worlds | 35% | 5% |
| Deserts | 6% | 37% |

Terran and ocean worlds mostly have plants, so 100%. A tier-0 one round a red giant scores 57%, the red giant's time factor.

## Game mapping

`gen/life.ts`, `assessLife`:

- **Surface habitat** = area × radiation × energy.
  - **Area** is the share of the surface where water is liquid and under 122 °C, using `gen/plants.ts`'s latitude model (mean + 19 K (cos 2φ − 1/3)). It is 0 without water, or below the triple-point pressure (the air question). Earth comes out at 0.85, liquid up to 58° latitude.
  - **Radiation** is the chronic dose's factor times, round red dwarfs, the superflares' factor:
    - The chronic dose is cosmic rays plus a giant host's belts, times the air shielding. It is weighed on a log scale: 1 up to Ramsar's 0.71 mGy/day, 0 at 60 Gy/h.
    - The superflares' dose comes from Atri's three columns (log-linear between 30 → 1.46×10⁴ Sv, 700 → 7.5, 1000 → 6.6×10⁻⁶), scaled with insolation from Proxima b's 0.65. It is weighed on a log scale from 5 Sv to 10⁵ Sv.
  - **Energy** is 1 with starlight above the photosynthesis minimum (2×10⁻⁵ of Earth's). Otherwise (rogue planets) it is the chemical energy, heat flow / Earth's.
- **Underground habitat** = chemical energy (heat flow / Earth's, at most 1), if the water reaches below its melt depth.
  - Ice and watery worlds (ice, ocean, terran types) melt through ice, and the water must go deeper than the melt depth.
  - Dry ones (desert, barren, lava) melt through rock, and the pores must reach that deep.
  - Radiation doesn't reach either.
- **Chance** = time × (1 − (1 − surface)(1 − underground)). It is 1 where the game grows plants (`growsPlants`: tier ≥ 1 and starlight), since then life is there.
- Moons' orbits: generated moons are squeezed, so their real distance is `TIDAL_ORBIT_STRETCH` × orbit / planet radius, as for tidal heat. Sol's moons carry their real one (`MoonData.hostDistance`).
- In a binary, the shorter-lived star sets the time.

Deliberate departures:

- The percentage assumes life starts wherever conditions allow (see the Question).
- Ice giants' belts are Jupiter's scaled by the dipole moment (×0.0019). This is a stated simplification: belt intensity doesn't really scale linearly with the moment.
- Gas giants' moons all get Jupiter's belt curve. Saturn's are weaker (no number found), but that only changes doses on icy surfaces without liquid water, which count for nothing anyway.
- Water density stands for ice as well (917–934 kg/m³ near the surface, denser high-pressure ices deeper).
- The chemical energy is linear in heat flow and capped at Earth's. A big frozen world with Earth's internal heat scores like Earth underground.

## Open questions

- **Titan's surface dose** is 15× above Sittler's model under its 10⁴ g/cm². The shielding curve is only fitted to 1000 g/cm².
- **Io's surface dose** wasn't found in a readable source (a 3600 rem/day figure appeared only in a search snippet). The fit is held at Europa's value inward.
- **Pluto** comes out frozen through: the melt depth is 402 km against 297 km of water, with 3 mW/m². New Horizons' evidence suggests an ocean, kept liquid by insulating clathrates or ammonia, which the model leaves out.
- **Tethys, Rhea and Titania** get thin oceans (3%) that their small radiogenic heat probably can't keep. Small icy bodies' ice may convect rather than conduct.
- **Ganymede's ocean** lies between ice layers, out of contact with rock. That probably lowers its chances more than the heat-flow factor does (high-pressure ice isn't modelled).
- **Other liquids and places aren't counted**: Titan's methane lakes (hypothetical non-water life), and Venus's cloud deck.
- **UV** (unshielded on airless and anoxic worlds, worse round flaring red dwarfs) isn't counted, only ionising particles.
- **Wright et al. 2024's** saturated Martian mid-crust is disputed (two PNAS replies).
- **The PHI table** (Schulze-Makuch et al. 2011) couldn't be read, so the parts aren't checked against it.
