# Sea waves: wind waves on the low-orbit sea

## Question

Issue #88: the low-orbit water sea (`planet/PlanetGlobe.ts`, a `LodSurface` with a plain glossy `MeshStandardMaterial`) was a smooth, still sphere. The task was to give it waves in its shader. That needs:

1. **How big and how steep wind waves are** at a given wind: the wavelengths present, and how much slope they carry. The slope matters most: it is what tilts the normals, and so what the sun's glitter shows.
2. **How fast they move**: the deep-water dispersion relation.
3. **Which directions** they travel in, relative to the wind.
4. **A rendering technique** that draws them on a sphere with no seam, stays stable at every distance (no shimmer), and costs little per pixel.

A follow-up on the same issue asked for more realism: no waves from far out, shallow water and surf, patchy wind (slicks, storms), whitecaps and sharper crests, the glint in the system view, and crests lit from behind. That adds:

5. **How much of the sea whitecaps cover** at a given wind.
6. **How hard storms blow** over the sea.
7. **The shape of real crests**: sharper than a sine.

It feeds `gen/waves.ts` (pure: the spectrum, the wave sets, the phases, whitecap cover, storm winds) and `world/seaWaves.ts` (the shader patch on the sea's material, and the system view's glint).

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

- **Monahan & O'Muircheartaigh 1980**, "Optimal Power-Law Description of Oceanic Whitecap Coverage Dependence on Wind Speed", J. Phys. Oceanogr. 10, 2094–2099 (the journal page refused the download, HTTP 403). Read through Albert et al. 2016, "Parameterization of oceanic whitecap fraction based on satellite observations", Atmos. Chem. Phys. 16, 13725, https://acp.copernicus.org/articles/16/13725/2016/acp-16-13725-2016.pdf (PDF read with `pdftotext`):
  - "W (U10) = 3.84 × 10⁻⁶ U10^3.41 (3)", derived from "the data sets of Monahan (1971) and Toba and Chaen (1973). Most of the wind speed values from these two data sets are up to 12 m s⁻¹ with only 10 % of the data points for winds up to 17 m s⁻¹".
  - The same paper's other fits, Callaghan et al. 2008, "W = 3.18 × 10⁻³ (U10 − 3.70)³; 3.70 < U10 ≤ 11.25 m s⁻¹", and its satellite fit "W10 = 4.6 × 10⁻³ × U10^2.26", are "expressed in percent".
- **Storm winds**:
  - Met Office Beaufort scale (page above): force 6 "12 m/s", force 7 "15 m/s", force 8 gale "19 m/s", force 10 storm "27 m/s", force 12 hurricane "64+ knots" / "33+ m/s".
  - US National Weather Service, https://www.weather.gov/key/tstmhazards: a severe thunderstorm produces "winds of 58 mph or greater"; "over water, wind gusts of 30 mph (26 knots) or greater can be dangerous to small boats".
- **Gerstner waves**:
  - Finch, "Effective Water Simulation from Physical Models", *GPU Gems* ch. 1 (NVIDIA, 2004), https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models: the normal's up component is 1 − Σ Qᵢ wᵢ Aᵢ S(); "Qi of 0 gives the usual rolling sine wave, and Qi = 1/(wi Ai) gives a sharp crest"; the sum must stay ≤ 1 to avoid loops.
  - Wikipedia, "Trochoidal wave", https://en.wikipedia.org/wiki/Trochoidal_wave (citing Gerstner 1802): particles move on circular orbits of radius e^(kb)/k, so at the surface as big as the wave's amplitude; dispersion c² = g/k; the surface has "sharper crests and flat troughs".

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
- **Whitecaps**: at 10 m/s Monahan & O'Muircheartaigh give 3.84×10⁻⁶ × 10^3.41 = 0.0099. Callaghan et al. give 3.18×10⁻³ × 6.3³ = 0.80 and the satellite fit 4.6×10⁻³ × 10^2.26 = 0.84, both in percent. So the 1980 fit is a fraction (~1%, matching the others' 0.8%), not a percent (0.01%) as some summaries say. At the game's 7 m/s it's 0.3%; at a gale (19 m/s) 8.8%; at hurricane force (33 m/s) the extrapolated 58%.
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
- **Far out**: on top of the pixel fade, every wave fades out between 50 and 110 units from the camera (`farFrom`, `farTo`), so from high in low orbit the sea shows only its glint. That is a look choice (at the stylised scale the swell would still be resolvable from there). Their slope goes into the roughness like any faded wave's.
- **Wind over the sea**: per pixel, the breeze (`wind`) or a storm's wind where that is stronger. `weatherLook`'s storms under way give the storm's centre and angular radius. A thunderstorm cell blows the NWS's severe criterion (58 mph = 25.9 m/s) and a cyclone hurricane force (33 m/s), both × the storm's strength. The wind is full out to 0.4 of the storm's radius and fades to nothing at its edge (a shape choice). Dust, ash and global storms raise none. The waves keep their lengths and their slopes scale by √(σ²_CM(U) / σ²_CM(U_breeze)), so the sea under a storm is rougher in the same proportion as Cox & Munk's.
- **Slicks**: Cox & Munk's slicks cut the slope 2–3×, so in slicks the slope variance is × 1/2.5 (`slickSlope`). Where they are and how much of the sea they cover (30%, patches ~40 units) are a look choice, from a slow two-octave noise. Storm winds clear them.
- **Whitecaps**: the cover W is Monahan & O'Muircheartaigh's at the local wind, capped at 1 (`whitecapCover`; the shader mirrors it). Foam goes on the steepest crests: the slope-weighted crest term Σ sᵢ sin θᵢ, whose variance is the drawn slope variance, is taken as Gaussian, and foam goes where its CDF (Page's tanh approximation) is in the top W. That is the short waves' crests, so the patches are small and many. Putting it on the height (the long swell's crests) made blobs as big as the swell. Where the waves fade out, the cover is spread evenly as a tint of W, so a storm's sea goes white from afar too. The foam is diffuse, rough and a bright, slightly blue white (a look choice).
- **Crests**: Gerstner's normal, n·(1 − Q Σ sᵢ sin θᵢ) − ∇h, with Q = 1 (`crests`): a true trochoidal wave, whose particles' orbits are as big as its amplitude (GPU Gems' Qᵢ wᵢ Aᵢ = kᵢaᵢ = sᵢ). At 7 m/s the sum stays under 1, so there are no loops; under storms it can pass 1 and is clamped at 0.2.
- **Shallow water** (stylised): the sea's chunks carry the water's depth (sea level minus the terrain under it, units) in their colour attribute. The seabed shows through as exp(−depth / 1.5) (`shallowDepth`), a pale sand (`seabed`) tinted 75% by the sea's own hue. The terrain's relief is exaggerated (`RELIEF_SCALE`) and in different units from the waves', so no real attenuation length maps onto it; 1.5 units was chosen by eye for a visible band along the coasts.
- **Surf** (stylised): foam in water shallower than 0.25 units (`surfDepth`), in bands that run shoreward at the swell's peak frequency, broken up by noise. From afar the bands even out to a steady line.
- **Backlit crests** (stylised): where the camera looks towards a low sun (glowing most within ~±30° of its azimuth, fading out as it climbs from 15° to 37°), the upper half of the drawn waves glows in the sea's colour shifted towards green, × the sun's light. Its strength (`glow` 1.5) was set by eye.
- **System view**: the terrain mesh's flat sea (vertices at sea level) gets the roughness low orbit's sea has from afar ((0.003 + drawn σ²)^¼ at the breeze) and a sphere's smooth normal, so the glint carries across the zoom. Before, the whole terrain was roughness 0.9 and the sea showed no glint at all.
- Ice seas (and Titan's methane lakes, an `ice` type world) are unchanged: matte, no waves. Lava seas have their own shader.

## Open questions

- At 7 m/s the PM tail integrated to λ_c gives 78% of Cox & Munk's slope, and at 14 m/s 48%. PM's short-wave tail doesn't grow with the wind, while the measured short-wave slope does. Spectra built for that weren't looked at (Elfouhaily et al. 1997 is one, named from memory, unchecked); the game only uses PM for the drawn waves' shares.
- The breeze is the same on every world. Thin air could weaken it; that isn't modelled.
- Monahan & O'Muircheartaigh's fit is extrapolated past 17 m/s, so the storm seas' cover (up to 58% at hurricane force) is a stretch of the data.
- Volcanoes raised later (the volcano bomb) don't change the water's depth: it's sampled from the terrain as generated, so a new volcanic island has no shallows or surf.
- Methane seas (Titan's lakes) are drawn as ice. How rough real methane seas are wasn't looked up.

# Shore swells and the ship's downwash

## Question

A follow-up asked for waves that flow in towards the shore, and for visible effects on the water when the UFO hovers low over it. That needs:

1. **How a swell changes as the water shoals**: its wavenumber at a depth, how much higher it grows, where it breaks.
2. **Which way its crests turn** near a coast.
3. **What a hovering rotor's downwash does to water** below it.

It feeds `gen/waves.ts` (`shoalWavenumber`, `shoalingCoefficient`, `shorePhase`, `shoreSwells`, `BREAKER_INDEX`), `world/seaWaves.ts` (the shore swells and downwash in the sea's shader) and `planet/ShipWake.ts` (the downwash's strength and spray).

## Sources

All accessed 2026-10-04.

- **Fenton, *Coastal and Ocean Engineering* lecture notes**, §4.5 (https://johndfenton.com/Lectures/Coastal-and-Ocean-Engineering/Coastal-and-Ocean.pdf, pp. 44–48):
  - The dispersion relation is "σ = √(gk tanh kd)".
  - The shoaling coefficient is "H/H0 = √(cg0/cg) = Ks", with Ks = (tanh kd (1 + 2kd/sinh 2kd))^−½.
  - Ks "starts to decrease … after d/λ0 ≈ 0.5" and "at about d/λ0 ≈ 0.16 the function has a minimum".
  - Green's law: "H/H0 = Ks ≈ (λ0/8πd)^{1/4} … height varies like d^{−1/4}".
  - Refraction: "k sin θ = Constant … This is Snell's law … As the wave speed is smaller in shallower water, then so is the angle the waves make to the normal to the beach", which "tends to align the wave front to the depth contours".
- **Fenton & McKee's explicit approximation**, as given in Fenton's notes and his 2006 note (https://johndfenton.com/Papers/Dispersion-Relation.pdf):
  - kd = (σ²d/g)·(coth((σ√(d/g))^{3/2}))^{2/3}, i.e. k₀h · coth((k₀h)^¾)^⅔.
  - "accurate to within 1.5% over all wavelengths … exact in both long wave … and short wave … limits".
- **Senthilkumar 2016**, *Proc. Estonian Acad. Sci.* (https://kirj.ee/public/proceedings_pdf/2016/issue_4/proc-2016-4-414-430.pdf): "McCowan [1894] theoretically defined the breaker depth index as Hb/hb = 0.78 for a solitary wave … most commonly used in engineering practice as a first estimate".
- **Goda 2010**, *Coast. Eng. J.*: the breaker index is wrongly "thought to be a fixed value, such as 0.78"; it varies "about 6% for the slope of zero to 1/50 and 14% for the slope of 1/10".
- **Coastal Wiki, "Breaker index"**: Battjes (1974), "γb = 1.06 + 0.14 ln ξb".
- **Tanner et al., NASA Langley**, rotor outwash (https://ntrs.nasa.gov/api/citations/20160006428/downloads/20160006428.pdf):
  - "peak mean outwash velocities occurring at radial stations between 1.7 and 1.8 r/R regardless of rotor height".
  - "maximum velocities in the wall jet are nearly twice the hover inflow velocities at the lowest rotor height".
- **USFS rotor-wash guide** (https://www.fs.usda.gov/rm/fire/pubs/pdfpubs/user_gd/ug-15.pdf): a Black Hawk "would have to be well over 160 feet to achieve a rotor wash less than 30 mph".
- **Fitzpatrick, *Fluid Mechanics*** (as above): deep-water gravity waves have a phase speed of √(gλ/2π).

## Measurements

Fenton & McKee against the exact dispersion relation (Newton's method), over k₀h from 0.001 to 20:
- The largest error is **1.63% at k₀h = 0.34**, a little over the 1.5% quoted. `tests/waves.test.ts` holds it to 1.7%.

Shoaling coefficient (the game's `shoalingCoefficient`) against Green's law:

| d/λ0 | Ks | Green (λ0/8πd)^¼ |
|---|---|---|
| 0.01 | 1.430 | 1.412 |
| 0.02 | 1.218 | 1.188 |
| 0.05 | 1.013 | 0.944 |
| 0.1 | 0.925 | 0.794 |
| 0.16 | 0.913 | 0.706 |
| 0.3 | 0.958 | 0.603 |
| 0.5 | 0.995 | 0.531 |

- The minimum is 0.912 at d/λ0 = 0.145. Fenton's minimum is at 0.16; the approximation's k moves it slightly.
- Green's law holds only in the shallowest water, as Fenton says.

The game's breeze, 7 m/s:
- The peak swell is ω = 1.20 rad/s, λ0 = 42.8 m, H⅓ = 1.10 m.
- Each shore swell carries H⅓/√2 = 0.78 m, so it breaks at about 1.0 m of water (0.78 / 0.78).

| depth | λ | Ks |
|---|---|---|
| 21 m | 42.2 m | 0.994 |
| 10 m | 39.0 m | 0.934 |
| 5 m | 32.4 m | 0.916 |
| 2 m | 22.4 m | 1.025 |
| 1 m | 16.2 m | 1.177 |
| 0.5 m | 11.5 m | 1.378 |

## Game mapping

- **Two swells run in to every shore.** One is at the spectrum's peak, the other 1.3× its frequency. Each has half the energy of a sea of significant height H⅓ (`shoreSwells`; the split is stylised), so together their heights add in quadrature to H⅓.
- **Crests follow the depth contours** (Fenton: refraction "tends to align the wave front to the depth contours"). The phase depends only on the depth: θ(d) = ∫₀^d k(h) dh / s.
  - s is `waveParams.shoreSlope` (0.3), the seabed slope the swells are spaced for. The drawn seabed's relief is exaggerated (RELIEF_SCALE), so its slopes are steep: at 0.08 the crests came out a quarter of their true length apart. On that slope the crests are a wavelength apart. On a steeper drawn seabed they bunch, on a flatter one they spread.
  - The phase is tabulated at 32 depths, out to half the peak swell's deep-water length (where Ks ≈ 1 and the swell stops feeling the bottom).
  - Adding ωt to the phase moves crests to smaller θ, which means shallower water: they run in to the shore.
  - Two slow noises along the coast shift each swell in and out of step, so the crests aren't one endless line.
- **Height and breaking.** The height in the shader is H₀·Ks, with Ks from Fenton & McKee's k.
  - It is capped at McCowan's 0.78 × the depth. Past the cap the swell breaks, and its crests are foam (`breaking`).
  - At the waterline the wash foams too.
  - The swells take over from the wind's waves as the water shoals: those are damped by up to 60% within the swells' depth.
- **Depth and its slope.** The sea's chunks carry the depth in their vertex colour's red, as before.
  - They also carry the seabed's slope, east and north, in green and blue (`seaDepthFrame`). It is measured over the chunk's own sample spacing by `PlanetGlobe`'s water sampler.
  - So the crests' direction is smooth across triangles. Screen-space derivatives showed every facet.
  - The depth itself is still linear across each of the sea's triangles, so the crests kink at their edges. The sea's chunks over water shallower than the swells' reach split as finely as the ground (`LodSurfaceOptions.shallow`, by `lodParams.cellAngle`). A swell fades out where its crests come closer than about four triangles (the triangles subtend `cellAngle` from the camera), which is past ~25 units from the camera at the default breeze.
  - The frame turns about the poles, so the swells fade out within ~10° of them.
- **Stylised.**
  - The swells are drawn `shoreSteep` (1.5×) steeper than their height gives, so they show from the UFO's height.
  - The relief is exaggerated (RELIEF_SCALE), so drawn depths are deeper than the real coast they stand for.
- **Downwash.** No source quantified spray height or ring size for a rotor over water. The look is stylised on the outwash's shape, peaking at 1.7–1.8 rotor radii out (Tanner et al.):
  - A disc 2.2 ship radii across (`downwashReach`) where the wind's waves are flattened by up to 70% and the water is ruffled (rougher).
  - A torn ring of spray at its edge, the noise sliding outward in two crossfaded layers.
  - Mist over the disc.
  - Ripples running out beyond it: 6 m waves at their deep-water speed √(gλ/2π), dying away in a radius or two.
  - Spray puffs thrown from the ring's edge (`ShipWake`), blowing outward and falling back.
- **Strength.** The downwash starts 16 units over the water and is full by 4. The ship's lowest is 3. That is 4 to 1 hull diameters, consistent with the USFS guide's large rotor wash from well over its rotor diameter up. Nothing over land, and nothing on airless seas (no air to blow).

## Open questions

- The breaker index varies with slope and steepness (Battjes: 0.74–1.16 for ξ from 0.1 to 2). 0.78 is used everywhere.
- The crests' spacing assumes one seabed slope. A local slope from the baked gradient would space them by distance from the shore, but jumps where the slope changes.
- No source gives spray onset height or ring size for a rotor over water. Both are stylised.

# The water's look: clear shallows, depth, the sky

## Question

A player found the sea "one solid colour" and asked for something translucent, and two dumps showed a hard edge round the camera where the drawn waves stopped. This section records the stylised look that answers both; it uses no new real-world numbers beyond Fresnel's.

## Sources

- **Schlick's approximation** of Fresnel reflectance, F = F₀ + (1 − F₀)(1 − cos θ)⁵, with water's head-on F₀ = ((n − 1)/(n + 1))² = ((1.333 − 1)/(1.333 + 1))² = 0.0204 for n = 1.333 (computed).

## Game mapping (all stylised)

- **The waves' far fade** runs evenly in the log of the distance, from `farFrom` 80 to `farTo` 600 units. Fading linearly over 50–110 units drew a hard rim round the camera at a low angle, where that whole span covers a few pixel rows. The waves too small for the pixels fade out anyway (`fadeFrom`, `fadeTo`), so the far ones cost little. They also fade out as the camera climbs from `highFrom` 50 to `highTo` 130 units over the water: without that, the 600-unit reach drew stripes of waves over the whole sea when zoomed out.
- **Clear shallows.** The water sea is drawn see-through after the ground. It blends without being three's `transparent`, at render order 0.5 (`CLEAR_SEA_RENDER_ORDER`): three draws transparent things after every opaque one, the atmosphere's haze among them. A transparent sea covered the haze, and the sea turned a dark, unhazed navy. Its alpha is 1 − e^(−depth / `clarity`) (1.1 units), opaque by `clearDepth` (5 units).
  - The terrain's chunks are hidden only where they lie wholly deeper than that (`hiddenBelow`), so the shallows' floor is there to see.
  - Foam, the sun's glint and the sky's reflection stay opaque: they're light off the surface.
- **The floor** under a sea is painted sand along the shore, a pale sand with a fifth of the low ground's colour in it. It gives way to the sea's colour by 30% of the way to the deepest floor (`terrainPainter`, with `seaFloor`).
- **The water's colour** goes from a brighter, greener shallows hue to `deep` (0.75) × the sea's colour over `deepDepth` (12 units).
- **Wave crests** are lit through from inside, ±`scatter` (20%) by the drawn height over its RMS.
- **The sky is reflected** by Schlick's Fresnel with F₀ = 0.02.
  - The sky's light is the atmosphere's colour × the sun's light × `sky` (0.35), reflected off a normal tilted only half as far as the waves tilt it (`skyWaves`), so the sheen stays smooth.
  - It is lit where the sky over the water is (the day side and dusk) and is none without air.
  - So the sea brightens to the horizon, and every wave turned away from the camera catches it.
- **The downwash's ripples** fade out where they're too fine to draw, are bent and broken by noise, and die away within about a radius past the disc. Before, they ran out as regular, aliasing bands.
