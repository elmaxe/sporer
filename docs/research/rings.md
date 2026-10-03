# Planetary rings up close

## Question

Issue #72: when the camera is close to a planet's rings in low orbit, show the rocks and ice they are made of instead of a flat sheet (`gen/rings.ts`, drawn by `planet/RingRocks.ts`). To do that we need to know:

1. How big ring particles are, and how many there are of each size (the size distribution). This decides how many rocks of each size are drawn.
2. How thick the ring is locally. This decides the layer the rocks sit in.
3. What they are made of: how icy Saturn's rings are, and how dark Uranus's and Jupiter's are. This decides how much of the ring is ice and how much rock.
4. How opaque the rings are (normal optical depth). This decides how dense the rocks are against the ring's profile.
5. How fast the particles orbit compared with the planet's spin. This decides which way they drift and how fast.

Precision needed: the right trends and rough shares. The game is stylised: rocks are drawn far bigger, relative to the ring, than real ring particles. Everything below was read or computed in this session (2026-10-03).

## Sources

All accessed 2026-10-03.

| # | Source | What was taken (as printed) |
|---|---|---|
| R1 | Miller, Filacchione, Cuzzi, Nicholson, Hedman et al. 2023, "The Composition of Saturn's Rings", https://arxiv.org/pdf/2311.17344 | "Zebker et al (1985) derived a power-law index between q = 2.7 in the A ring and q = 3.11 in the C ring, with particles ranging from 1 mm to ∼ 10 m." Table 2: q = 3.16 (C ring background), ∼2.8 (B ring), 2.85 (Cassini Division), 2.9–3.05 (A ring); amax 5–20 m; amin a few mm (to 30 cm in the B ring). "vertical scale height H is likely to be of order 10 m … < 30 m in the C ring and Cassini Division to ∼ 6 m in the A ring". "the ring thickness appears to be comparable to the size of the largest ring particles". Composition "predominantly icy, ≳ 95% by mass". Optical depth: A ring "τ ≃ 0.5", B ring "∼0.9 … > 5", C ring "0.05–0.10" (plateaux ≃ 0.5), Cassini Division "0.10–0.20". Ω ≃ 1.29 × 10⁻⁴ s⁻¹ (outer A ring), ∼1.66 × 10⁻⁴ s⁻¹ (middle B ring). |
| R2 | Brilliantov et al. 2015, PNAS, https://arxiv.org/pdf/1302.4097 | "a power-law distribution of radii, ∼ r^−q with q ≈ 3 … for larger sizes, the distribution has a steep cutoff"; cutoff "Rc ∼ 5−10 m". |
| R3 | Tiscareno 2012, "Planetary Rings", https://arxiv.org/pdf/1112.3305 | Saturn: particles "between 1 cm and 10 m … q ∼ 2.75". Uranus: "from their low albedo … the ring particles cannot be primarily water ice … dark at all visible wavelengths". Jupiter: "tenuous and composed of dust-sized particles". |
| R4 | NASA NSSDC Saturn ring fact sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html | Thickness (m): C 5, B 5–10, Cassini Division 20, A 10–30. Albedo: C 0.12–0.30, B 0.4–0.6, A 0.4–0.6. Optical depth: A 0.4–1.0, B 0.4–2.5, C 0.05–0.35. |
| R5 | NASA NSSDC Uranus ring fact sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/uranringfact.html | Albedo (×10⁻³): ~15 (rings 6, 5, 4, α, β, η, γ, δ, λ), ~18 (ε). |
| R6 | JPL 1986, "Uranus rings of dark particles", https://www.jpl.nasa.gov/news/uranus-rings-of-dark-particles/ | "the rings reflect back only about two percent of the sunlight falling on them". |
| R7 | NASA NSSDC Saturn fact sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturnfact.html | Sidereal rotation 10.656 h (System III); GM 37.931 × 10⁶ km³/s²; equatorial radius 60,268 km. |
| R8 | NASA Cassini rings page, https://science.nasa.gov/mission/cassini/science/rings/ | The rings are "generally about 30 feet (10 meters) thick or so". |

The sources disagree on a few points:

- The power-law index q is 2.7–3.2 depending on the ring and the source; q ≈ 3 sits in the middle.
- NSSDC's B ring optical depth (0.4–2.5) is lower than Cassini's (> 5).
- Uranus's ring albedo is ~0.015–0.02 as reflectance (R5, R6) and ~0.06 as Bond albedo (Karkoschka 1997, cited by Molter et al. 2019, https://arxiv.org/pdf/1905.12566). These are different definitions. Either way the rings are 10–40× darker than Saturn's A and B rings.

## Measurements

The orbital speeds and periods are computed from R7's GM (point mass, J2 ignored), with v = √(GM/r) and P = 2π√(r³/GM):

| Where | r | v | P |
|---|---|---|---|
| C ring inner edge | 74,658 km (1.239 Rs) | 22.5 km/s | 5.78 h |
| C/B boundary | 91,975 km | 20.3 km/s | 7.90 h |
| B ring outer edge | 117,507 km (1.950 Rs) | 18.0 km/s | 11.41 h |
| A ring outer edge | 136,780 km (2.270 Rs) | 16.7 km/s | 14.34 h |

The A ring's outer edge period matches R1's Ω: 2π / 1.29 × 10⁻⁴ s⁻¹ = 13.5 h at about 131,600 km. Synchronous orbit for the 10.656 h spin is at 1.862 Rs, in the outer B ring. So inside it the rings overtake the planet's surface, and outside it they fall behind. Either way, every ring particle orbits the way the planet spins.

How the size distribution maps to rocks on screen: n(a) da ∝ a⁻³ da. Integrated over one octave, a to 2a, that is ∝ a⁻² per area, so each octave has 4× fewer rocks per area than the one below. A rock is shown out to a distance proportional to its size (`reach` × size, about the same size on screen when it appears). Each octave's rocks are then seen over 4× the area of the octave below, so every octave has the same number of rocks in view. `tests/rings.test.ts` checks this ("about as many rocks in view in each octave").

## Game mapping

- **Sizes** (`ringRockParams`): 5 octaves from radius 0.3 planet units up, each rock 1–2× its octave's size. That gives radii 0.3–9.6 units next to the 4-unit UFO, so pebbles to boulders. Real particles span mm to ~10 m, about four decades; the game uses about 1.5. This is a deliberate stylisation: smaller rocks would be invisible and bigger ones would hide the view. The slope q = 3 is kept, as equal counts per octave in view.
- **Thickness**: the real layer is ~10 m thick, about the size of the largest particles (R1, R4, R8). The game's layer is ±6 units, about the biggest rocks' size, which keeps the same ratio.
- **Density**: each rock is kept with the ring's opacity at its radius (`ringAt`, the same profile the flat ring draws). Gaps such as the Cassini Division or the seeded ones stay nearly empty, and dense bands are full. The flat ring fades to 35% within the rocks' reach, standing for the dust and gravel too small to draw.
- **Ice**: `RingData.ice` for real rings: Saturn 0.95 (≳ 95% ice by mass, R1); Uranus 0.05 (charcoal-dark, not icy on the outside, R3, R5, R6). For generated rings, the share comes from how bright the ring's colour is (`iceShare`): bright rings are icy and dark ones are rocky, following the albedo trend from Saturn's 0.4–0.6 to Uranus's 0.02. Ice chunks are jagged and shiny, rocks lumpy and matte.
- **Motion**: rocks orbit the way the planet spins, at Ω ∝ r⁻¹·⁵ (Kepler), slower further out. The speed is stylised: 3 units/s at the inner edge, relative to the body frame. Real particles move at ~20 km/s, but the body frame turns with the planet, so what matters is the slow drift relative to it. Each rock also tumbles, small ones faster (∝ 1/√size, stylised).

## Open questions

- Jupiter-like faint dusty rings (optical depth ~10⁻⁶, R3) aren't a separate kind in the game: every ring is drawn with rocks in proportion to its opacity.
- The planet's shadow on the rings and their rocks isn't drawn. The flat ring is unlit, and the rocks are lit by the star even in the planet's shadow.
- Propeller moonlets (100–1000 m, q ≃ 6, R1) aren't drawn.
