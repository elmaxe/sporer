# Planet temperatures

## Question

How hot is a planet's surface, given its star, distance, albedo and atmosphere? This is for roadmap step 12 (climate, `gen/climate.ts`): the equilibrium temperature, then the greenhouse warming that the atmosphere adds on top.

## Sources

- NASA NSSDCA Planetary Fact Sheet (metric), https://nssdc.gsfc.nasa.gov/planetary/factsheet/, accessed 2026-09-29. It was last updated 15 November 2024 (D. R. Williams). The main table is read from the raw HTML (see the research skill). Columns: Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto.
  - Mean Temperature (C): 167, 464, 15, −20, −65, −110, −140, −195, −200, −225
  - Surface Pressure (bars): 0, 92, 1, 0, 0.01, Unknown\*, Unknown\*, Unknown\*, Unknown\*, 0.00001
  - Distance from Sun (10⁶ km): 57.9, 108.2, 149.6, 0.384\* (from Earth), 228.0, 778.5, 1432.0, 2867.0, 4515.0, 5906.4
  - Escape Velocity (km/s): 4.3, 10.4, 11.2, 2.4, 5.0, 59.5, 35.5, 21.3, 23.5, 1.3
- NASA per-planet fact sheets, `https://nssdc.gsfc.nasa.gov/planetary/factsheet/{earth,mars,venus}fact.html`, accessed 2026-09-29:

  | | Bond albedo | Solar irradiance (W/m²) | Black-body temperature (K) |
  |---|---|---|---|
  | Venus | 0.77 | 2601.3 | 226.6 |
  | Earth | 0.294 | 1361.0 | 254.0 |
  | Mars | 0.250 | 586.2 | 209.8 |

  Earth also gives: surface pressure 1014 mb, average temperature 288 K (15 °C), scale height 8.5 km, mean molecular weight 28.97.
- Stefan–Boltzmann constant σ = 5.670374419 × 10⁻⁸ W m⁻² K⁻⁴. It has been exact since the 2019 SI redefinition, and it is the CODATA 2018 value.

## Measurements

The equilibrium temperature of a fast-rotating body with its heat spread evenly: T_eq = (S(1 − A) / 4σ)^¼.

```bash
node -e '
const sigma = 5.670374419e-8;
// name, irradiance S (W/m²), Bond albedo A, NASA black-body T (K), measured mean surface T (K)
const rows = [["Venus",2601.3,0.77,226.6,737.15],["Earth",1361.0,0.294,254.0,288.15],["Mars",586.2,0.250,209.8,208.15]];
for (const [n,S,A,bb,surf] of rows) { const T = (S*(1-A)/(4*sigma))**0.25;
  console.log(n, T.toFixed(1), bb, (T-bb).toFixed(1), surf, (surf-T).toFixed(0)); }'
```

| Body | T_eq computed | NASA black-body | Difference | Measured mean surface | Surface − T_eq |
|---|---|---|---|---|---|
| Venus | 226.6 K | 226.6 K | 0.0 K | 737 K | +511 K |
| Earth | 255.1 K | 254.0 K | +1.1 K | 288 K | +33 K |
| Mars | 209.8 K | 209.8 K | 0.0 K | 208 K | −2 K |

The last column is the warming a greenhouse model must reproduce. It is about zero at Mars's 0.01 bar of CO₂, +33 K at Earth's 1 bar, and +511 K at Venus's 92 bar of CO₂. The warming is strongly non-linear in pressure.

## Game mapping

Not implemented yet (step 12). The plan, to be verified:
- T_eq scales as L^¼ / √d. In game units, calibrate with one explicit factor so that an Earth-like planet at `habitableRadius` gets T_eq ≈ 255 K, then about 288 K after its greenhouse warming.
- The greenhouse warming grows with pressure and depends on composition. It has to hit the three reference points above within tolerance; its model needs its own sources.

## Open questions

- **Earth's 1.1 K gap.** NASA gives 254.0 K for Earth, but the formula with NASA's own S and A gives 255.1 K, while Venus and Mars match to 0.1 K. It could be a different albedo or irradiance in their computation, or rounding. It doesn't matter at game precision, but it isn't explained yet.
- **Mars's −2 K.** Mars is slightly *below* its T_eq. This may be the diurnal and seasonal averaging of a thin atmosphere (the mean of T isn't the T of the mean flux). Unverified.
- **Moons and outer planets.** Their temperatures, and tidal or geothermal heating, still need sources: Io, Europa, Enceladus, Titan.
