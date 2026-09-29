# Atmospheres: how tall, how hazy

## Question

Roadmap step 13 draws every atmosphere as a soft haze whose density falls off exponentially with height, integrated along each view ray (`gen/atmosphere.ts`, shader in `world/atmosphereShell.ts`). It needs, per body:

1. The **scale height** H, the height over which the density falls by e. The trend (puffier on warm, light, low-gravity bodies) should be real; the size on screen is stylised.
2. How **hazy** the air is (the optical depth straight down), from the surface pressure and whether there's a cloud deck.
3. A per-pixel integral of the density along the ray that's cheap and accurate enough.

Precision: the physical scale height within a few percent of the reference bodies (it only sets a trend, but it must be the right formula); the integral within a few percent of the exact value.

Reference cases: Earth, Venus, Mars (NASA fact sheets give H), Titan and Pluto (small, cold, low gravity).

## Sources

All accessed 2026-09-29.

- **NASA NSSDCA fact sheets** (`earthfact.html`, `venusfact.html`, `marsfact.html`, `plutofact.html` under https://nssdc.gsfc.nasa.gov/planetary/factsheet/), raw HTML:
  - Earth: surface gravity (mean) 9.820 m/s², volumetric mean radius 6371.000 km, "Scale height: 8.5 km", "Average temperature: 288 K", "Mean molecular weight: 28.97".
  - Venus: surface gravity 8.87 m/s², radius 6051.8 km, "Surface pressure: 92 bars", "Scale height: 15.9 km", "Average temperature: 737 K", "Mean molecular weight: 43.45".
  - Mars: surface gravity 3.73 m/s², radius 3389.5 km, "Scale height: 11.0 km", "Average temperature: ~214 K", "Mean molecular weight: 43.49".
  - Pluto: surface gravity 0.62 m/s², radius 1188 km, "Surface Pressure: ~13 microbar", "Surface temperature: 24 - 38 K", "Scale height: ~18 km lower atmosphere, ~50 km above 30 km", "Mean molecular weight: ~28".
- **NIST CODATA**, https://physics.nist.gov/cgi-bin/cuu/Value?r: molar gas constant R = 8.314 462 618... J mol⁻¹ K⁻¹ (exact).
- **NIST Chemistry Webbook**, https://webbook.nist.gov/cgi/cbook.cgi?ID=C7727379 and ID=C124389: molecular weight of N₂ 28.0134, CO₂ 44.0095.
- Titan: T = 93.65 K (Fulchignoni et al. 2005) and g = GM/R² = 8978.1371 km³/s² / (2574.76 km)² = 1.354 m/s² (JPL), both already in `climate.md`.

## Measurements

The isothermal scale height is H = R T / (μ g). Script (`npx vite-node`, in the scratchpad), using `scaleHeight` from `gen/atmosphere.ts` with the fact-sheet values:

| Body | T (K) | g (m/s²) | μ (g/mol) | H computed | NASA | H / R |
|---|---|---|---|---|---|---|
| Earth | 288 | 9.82 | 28.97 | 8.42 km | 8.5 km | 0.00132 |
| Venus | 737 | 8.87 | 44.01 | 15.70 km | 15.9 km | 0.00259 |
| Mars | 214 | 3.73 | 44.01 | 10.84 km | 11.0 km | 0.00320 |
| Titan | 93.65 | 1.354 | 28.01 | 20.52 km | (none read) | 0.00797 |
| Pluto | 24–38 | 0.62 | 28.01 | 11.5–18.2 km | ~18 km | ~0.015 |

Earth, Venus and Mars are within 2% (the code uses CO₂'s 44.01 g/mol for Venus and Mars, the fact sheets' mixtures are 43.45 and 43.49; with those the match is within 1%). Pluto's "~18 km" matches the warm end of its 24–38 K surface range; its lower atmosphere is warmer than the surface. The spread in H / R is 12×, from Earth to Pluto: small cold worlds are puffy relative to their size, big warm ones are thin skins.

**The integral.** Density ρ(r) = (e^(−(r−1)/H) − e^(−D/H)) / (1 − e^(−D/H)), with r in planet radii and D = top − 1, so it's exactly 0 at the shell's top (no visible edge). Its vertical column is (H(1 − e^(−D/H)) − D e^(−D/H)) / (1 − e^(−D/H)), which sets the density scale from the look's depth. Along a ray there's no closed form over a sphere (it's the Chapman function), so the shader samples it: the segment in the air (from the camera or the top, to the ground or out the far side) is split at the point nearest the planet, which is the densest point (or the ground, when the ray hits it), and each half is sampled at t = t_c ± L u² for 5 midpoints u, so the samples crowd where the density peaks. Against a 20 000-sample brute force for H = 0.03, 0.05, 0.08 R, from outside (3 R) and inside (1 + H, 1 + 3H), every 5° of direction, the worst error is 6.6% with 3 samples per half, 3.5% with 4, 2.2% with 5 and 1.5% with 6. The shader uses 5. Cost, measured in headless SwiftShader (software rendering, 1280×720) in low orbit over an ocean world, where the shell fills the screen: 2.2 FPS with the atmosphere, 3.7 with it hidden; the system view is unchanged (5 FPS before and after). On a GPU ten samples per pixel is small; it wasn't measured here. `tests/atmosphere.test.ts` pins it at 3%.

Generated bodies (80 systems at seed 1337): visual scale heights 0.030–0.080 R, shell tops 1.18–1.48 R, depths 0.01 (Mars-like films) to 0.38 (3.5 bar), and 1.5 under cloud decks.

## Game mapping

- `scaleHeight(climate)` is the physical H in km, from the climate's temperature, gravity (× 9.82 m/s²) and composition (μ: Earth air 28.97, N₂ 28.0134, CO₂ 44.0095 g/mol).
- **Deliberately stylised:** real atmospheres are 0.1–1.5% of the radius tall, invisible at game scale. The look uses H_vis = 0.05 R · ((H/R) / (H/R)_Earth)^0.35, clamped to 0.03–0.08 R. An Earth analogue gets 5%; Mars-like and Venus-like bodies ~6.5%, a Titan analogue hits the 8% cap. The exponent squeezes the real 12× spread into ~3×, keeping the order.
- The shell's top is 6 visual scale heights up (density e⁻⁶ ≈ 0.25% before the fade to zero): 1.18–1.48 R.
- **Haze (vertical optical depth):** 0.2 · (P / 1 bar)^0.5, at most 0.8 for clear air; 1.5 under Venus's cloud deck or Titan's haze (the same thresholds as their albedos in `climate.md`: CO₂ ≥ 10 bar, N₂ ≥ 0.5 bar). Real column mass is ∝ P / g; the square root is a deliberate compression so a 9 mbar film is a faint rim (0.02) and 3 bar still shows the ground (0.35). Along the limb the path is ~√(2π/H) ≈ 11× the vertical one, so even Earth's 0.2 saturates there: the planet sits in a bright halo while the disc stays clear.
- **Shading** (tunables in the debug panel's Atmosphere folder): the air's light is (1 − e^(−τ)) × the tint × a day factor averaged over the density along the ray (smoothstep of the sun's elevation at each sample, 6% at night), plus a warm band at the terminator and a forward-scattering glow towards the sun. The scene behind is dimmed by e^(−τ) (premultiplied alpha), so the ground and stars fade into the haze.

## Open questions

- No source for Titan's scale height was read this session; the computed 20.5 km relies on the formula matching Earth, Venus and Mars.
- The scale height uses the mean surface temperature; real atmospheres cool with height (Earth's lapse rate), so H shrinks upward. Irrelevant at the stylised scale.
- The shader's haze ends at the sea-level sphere, so mountains are hazed as if they were at sea level behind them. Not visible in practice.
