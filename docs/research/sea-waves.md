# Sea waves: wind waves on the low-orbit sea

## Question

Issue #88: the low-orbit water sea (`planet/PlanetGlobe.ts`, a `LodSurface` with a plain glossy `MeshStandardMaterial`) was a smooth, still sphere. The task was to give it waves in its shader. That needs:

1. **How big and how steep wind waves are** at a given wind: the wavelengths present, and how much slope they carry. The slope matters most: it is what tilts the normals, and so what the sun's glitter shows.
2. **How fast they move**: the deep-water dispersion relation.
3. **Which directions** they travel in, relative to the wind.
4. **A rendering technique** that draws them on a sphere with no seam, stays stable at every distance (no shimmer), and costs little per pixel.

It feeds `gen/waves.ts` (pure: the spectrum, the wave sets, the phases) and `world/seaWaves.ts` (the shader patch on the sea's material).

Precision: the right trends and roughly the right numbers (within ~25%): longer, faster waves at stronger wind and weaker gravity; the whole sea's slope as measured. Sizes are stylised against the UFO (see Game mapping).

## Sources

All accessed 2026-10-04.

- **Cox & Munk 1954**, "Measurement of the Roughness of the Sea Surface from Photographs of the Sun's Glitter", J. Opt. Soc. Am. 44 (11). PDF: https://userpages.umbc.edu/~martins/phys650/Cox%20and%20Munk%20Glint%20paper.pdf (read as text with `pdftotext`). Regression lines for a clean surface, wind W in m/s "recorded at 41 feet above sea level":
  - crosswind σc² = 0.003 + 1.92×10⁻³ W ± 0.002 (r = 0.956)
  - up/downwind σu² = 0.000 + 3.16×10⁻³ W ± 0.004 (r = 0.945)
  - total σc² + σu² = 0.003 + 5.12×10⁻³ W ± 0.004 (r = 0.986)
  - "As a first approximation the distribution is Gaussian and isotropic with respect to direction." The total "increases linearly with wind speed, reaching a value of (tan 15.9°)² for a wind speed of 14 m sec⁻¹" (the abstract says 16°).
  - Oil slicks "reduce the mean square slopes by a factor of two or three".
  - Cross-checked in the Ocean Optics Web Book, https://www.oceanopticsbook.info/view/surfaces/cox-munk-sea-surface-slope-statistics: the same three lines, wind at 12.5 m.
- **Pierson–Moskowitz spectrum**, WikiWaves, https://www.wikiwaves.org/index.php/Ocean-Wave_Spectra: "S(ω) = (αg²/ω⁵) exp(−β(ω₀/ω)⁴)", "α = 8.1×10⁻³", "β = 0.74", ω₀ = g / U₁₉.₅ with "U₁₉.₅ is the wind speed at a height of 19.5m above the sea surface", peak "ωₚ = 0.877 g / U₁₉.₅", significant wave height "H₁/₃ = 0.21(U₁₉.₅)²/g ≈ 0.22(U₁₀)²/g". For a fully developed sea.
- **Deep-water dispersion**, Stewart, *Introduction to Physical Oceanography* §16.1, https://geo.libretexts.org/Bookshelves/Oceanography/Introduction_to_Physical_Oceanography_(Stewart)/16:_Ocean_Waves/16.1:_Linear_Theory_of_Ocean_Surface_Waves: "ω² = gk" (deep water), phase speed "c = √(g/k) = g/ω".
- **Beaufort scale**, Met Office, https://weather.metoffice.gov.uk/guides/coast-and-sea/beaufort-scale: force 3 gentle breeze "5 m/s", "0.6 metres"; force 4 moderate breeze "7 m/s", sea "Slight - Moderate", "1.0 metres"; force 5 fresh breeze "10 m/s", "2.0 metres" (probable wave heights).
- **Capillary waves**, Fitzpatrick, *Fluid Mechanics* (UT Austin), https://farside.ph.utexas.edu/teaching/336L/Fluid/node157.html: at an air/water interface at s.t.p. the phase velocity has a minimum of 0.23 m/s at the capillary wavelength λ_c = 1.7×10⁻² m. Shorter waves are held by surface tension, not gravity.
- **Tessendorf, "Simulating Ocean Water"** (SIGGRAPH course notes, 1999–2004), https://people.computing.clemson.edu/~jtessen/reports/papers_files/coursenotes2004.pdf:
  - The height field as a sum of waves "Aᵢ cos(kᵢ · x₀ − ωᵢ t + φᵢ)".
  - Directional spreading in the Phillips spectrum: "The cosine factor |k̂ · ŵ|² … eliminates waves that move perpendicular to the wind direction".
  - Its dispersion is quantised to a repeat time ("Repeat Time = 100 seconds"), so a tiled FFT loops. The game doesn't need that: see Game mapping.

## Measurements

Script (run with `npx vite-node`; it imports the game's own `gen/waves.ts`):

```ts
import { coxMunkSlope, peakOmega, significantHeight, slopeVariance, wavelength, waveOmega, seaWaves, drawnVariance } from '../../src/gen/waves';
const g = 9.80665;
// Capillary–gravity crossover λ_m = 2π √(γ / (ρ g)), γ = 0.0728 N/m, ρ = 1000 kg/m³: 1.71 cm, Fitzpatrick's 1.7 cm.
const lm = 2 * Math.PI * Math.sqrt(0.0728 / (1000 * g));
for (const U of [3, 5, 7, 10, 14]) {
  const wp = peakOmega(U);
  const pm = slopeVariance(U, wp * 0.5, waveOmega(lm));
  const drawn = drawnVariance(seaWaves(1, U, g, 0.5).sets[0]!);
  console.log(U, wp, 2 * Math.PI / wp, wavelength(wp), significantHeight(U), pm, coxMunkSlope(U), drawn);
}
```

| U₁₀ m/s | ω_p rad/s | T_p s | λ_p m | H⅓ m (PM) | Beaufort probable m | PM slope variance, ½ω_p to λ_c | Cox & Munk σ² | Drawn σ² (to 0.5 m) |
|---|---|---|---|---|---|---|---|---|
| 3 | 2.80 | 2.24 | 7.9 | 0.20 | – | 0.0232 | 0.0184 | 0.0095 |
| 5 | 1.68 | 3.74 | 21.8 | 0.56 | 0.6 | 0.0273 | 0.0286 | 0.0137 |
| 7 | 1.20 | 5.23 | 42.8 | 1.10 | 1.0 | 0.0301 | 0.0388 | 0.0164 |
| 10 | 0.84 | 7.48 | 87.3 | 2.24 | 2.0 | 0.0330 | 0.0542 | 0.0193 |
| 14 | 0.60 | 10.47 | 171.0 | 4.40 | – | 0.0357 | 0.0747 | 0.0220 |

- **Wave heights**: PM's H⅓ is within 12% of the Met Office's probable heights at forces 3–5 (0.56 against 0.6 m, 1.10 against 1.0 m, 2.24 against 2.0 m).
- **The peak**: dS/dω = 0 at ω = (4β/5)^¼ ω₀ = 0.8772 ω₀, PM's 0.877. The constants agree with each other.
- **Slope**: the PM spectrum's slope spectrum k² S(ω) = α/ω · exp(…) carries about α = 0.0081 of slope variance per e-fold of frequency above the peak. Integrated from below the peak down to the capillary limit, it gives 95% of Cox & Munk's measured slope at 5 m/s and 78% at 7 m/s. So the measured glitter is mostly short gravity waves, down to centimetres.
- **Cox & Munk's own check**: at 14 m/s the line gives σ² = 0.0747, atan √σ² = 15.3°, against their stated 15.9° (16° in the abstract). Their sentence is probably read off the data rather than the fit.

## Game mapping

- **Wind**: `waveParams.wind` = 7 m/s, the Met Office's force 4 (moderate breeze), the same everywhere there's air (pressure ≥ `WIND_MIN_PRESSURE`, the geysers' "there is wind" threshold). Without air the sea is calm: no waves, Cox & Munk's 0.003 intercept as its slope. Cox & Munk's wind (12.5 m) is taken as the 10 m wind: a few per cent apart, under the fit's ±0.004.
- **Gravity**: the body's own (`climate.gravity` × 9.80665 m/s²) in ω² = g k and in the PM peak: on a low-gravity world the waves are longer (λ_p ∝ U²/g) and slower for their length.
- **Waves drawn**: `seaWaves` makes three sets (one per plane of the triplanar projection) of 12 waves each. Each set covers ln ω in equal steps from 0.75 ω_p to the frequency of a 0.5 m wave (`waveParams.shortest`), with each wave's frequency jittered within its step so the sets don't beat where they blend. A wave's slope amplitude is √(2·v), with v the PM slope variance of its step. Its angle to the wind is drawn from a cos² density (Tessendorf's |k̂·ŵ|²), its starting phase at random, all from the planet's seed.
- **Scale (deliberate stylisation)**: the waves are drawn at `waveParams.metresPerUnit` = 10 m per unit, as if the ~4-unit UFO were a 40 m saucer, not at the globe's own scale (an Earth-sized globe's unit is ~16 km, where every real wave would be far below a pixel). The 43 m swell of a 7 m/s sea is then ~4 units long and moves at its real speed (8 m/s = 0.8 units/s).
- **Wave fronts**: a sum of a few sines makes a visibly regular grid, so the planes' coordinates are bent by a slow 3D value noise (by ±0.3 swell lengths over two swell lengths). This is a look choice; a real sea's fronts are irregular from having a continuous spectrum.
- **Triplanar**: each set is laid on the plane perpendicular to one axis of the body frame, blended by |n|⁴ (a little cut off at the edges, so most pixels evaluate one set). The blend is divided by √Σw², so the slope variance stays the same where sets overlap. There is no seam and no pole. The height's gradient on the plane, projected onto the sphere's tangent plane, tips the normal against it.
- **Phases**: computed on the CPU in double precision, wrapped to [0, 2π), and handed to the shader per wave, so the float shader never sees a large system time (no repeat time needed, unlike Tessendorf's tiled FFT).
- **Distance**: a wave fades out as it gets between 12 and 4 pixels long (`fadeFrom`, `fadeTo`, from the pixel's footprint `fwidth` on the sphere), longest first, so nothing shimmers. A faded wave's slope variance goes into the roughness. Three's GGX takes α = roughness², and a Beckmann-like distribution's α is the RMS slope √σ², so roughness = (σ²_total − σ²_drawn)^¼. The glint keeps its size as the waves fade with height: sparkles on the swell up close, one soft glint from high up.
- **Wavelets (deliberate deviation)**: true to life, the slope of everything shorter than 0.5 m would also be roughness, the whole sea at Cox & Munk's σ² (0.039 at 7 m/s, roughness 0.44). That spreads the sun's glitter so wide that, against the game's bright sea colour and modest sun, it all but disappears (checked by eye in the lab). So by default (`waveParams.wavelets` off) the roughness counts only the drawn waves plus a calm sea's 0.003. From afar that is σ² ≈ 0.019 at 7 m/s (roughness 0.37): a broad glint, but visible.
- Ice seas (and Titan's methane lakes, an `ice` type world) are unchanged: matte, no waves. Lava seas have their own shader.

## Open questions

- At 7 m/s the PM tail integrated to λ_c gives 78% of Cox & Munk's slope, and at 14 m/s 48%. PM's short-wave tail doesn't grow with the wind, while the measured short-wave slope does. Spectra built for that weren't looked at (Elfouhaily et al. 1997 is one, named from memory, unchecked); the game only uses PM for the drawn waves' shares.
- The wind is the same on every world and everywhere on it. Storms (`gen/weather.ts`) could raise it locally, and thin air could weaken it. Neither is modelled.
- Methane seas (Titan's lakes) are drawn as ice. How rough real methane seas are wasn't looked up.
