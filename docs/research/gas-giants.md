# Gas and ice giants: what their cloud tops look like

## Question

The gas giants were latitude stripes with a little noise, unchanged since step 2. To draw them like real giants (`src/gen/gasGiants.ts` lays out the clouds, `src/world/gasLook.ts` draws them in the system view, in low orbit and on the planet map), we needed:

- how many belts, zones and jets a giant has, how wide they are, which way the jets blow and how fast relative to the planet's spin;
- where the banding stops and what the polar regions look like;
- the size, shape and latitude of the big storms (Jupiter's Great Red Spot, Neptune's Great Dark Spot) and what goes with them;
- how ice giants (Uranus, Neptune) differ.

Precision: the right structure and trends, sizes within ~10%. It's a look, not a simulation.

## Sources (accessed 2026-10-01)

- NASA planetary fact sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/ (raw table read with curl): diameter 142,984 / 120,536 / 51,118 / 49,528 km and rotation period 9.9 / 10.7 / −17.2 / 16.1 h for Jupiter / Saturn / Uranus / Neptune.
- Jupiter's jets and bands (search summaries of Cassini/Voyager wind papers, e.g. https://arxiv.org/pdf/1302.0277, https://www.sciencedirect.com/science/article/pii/S0019103599961638, https://arxiv.org/pdf/0803.2893): "each hemisphere of Jupiter has 6–7 eastward jets separated by westward jets"; belts and zones "each roughly 10° in width"; "eastward (prograde) jets are observed on the equatorward side of belts, and westward (retrograde) jets on their poleward sides"; prograde up to 140 m/s, retrograde up to 60 m/s; strongest jet 180 m/s (northern hemisphere); "marked hemispherical asymmetry".
- Jupiter's polar regions: https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/2016GL072443 (JunoCam): "poleward of 64–68° planetocentric latitude, where Jupiter's east-west banded structure breaks down, several types of discrete features appear on a darker background", immediately poleward of a ~40 m/s prograde jet. https://www.nature.com/articles/nature25491: eight circumpolar cyclones round a central one in the north, five round one in the south; cyclones up to ~1,000 km across (https://www.space.com/juno-solves-jupiter-cyclones-mystery).
- Saturn: https://arxiv.org/pdf/1609.09626 and https://pmc.ncbi.nlm.nih.gov/articles/PMC7322008/: hexagon centred near 78°N planetographic on an eastward jet of 104 ± 15 m/s; the broad equatorial jet spans ~35°N–35°S at 450–500 m/s; several more alternating jets at mid and high latitudes. A decagon wave round the south pole (https://www.science.org/doi/10.1126/sciadv.aee4251).
- Uranus and Neptune winds (https://academic.oup.com/mnras/article/498/1/621/5893324, https://arxiv.org/pdf/1708.00235): a retrograde equatorial jet flanked by two prograde jets at higher latitudes; Uranus −50 m/s at the equator and up to 250 m/s prograde; Neptune −400 m/s at the equator, 270 m/s prograde; the retrograde region reaches ±20° on Uranus, ±50° on Neptune.
- Uranus's polar hood (https://agupubs.onlinelibrary.wiley.com/doi/abs/10.1029/2023JE007904, https://esahubble.org/images/heic2113d/): a bright cap from ~43–45° to the pole round the north (spring/summer) pole, with a sharp southern edge that stays at the same latitude.
- Great Red Spot: ESA/Hubble heic1410 (https://esahubble.org/news/heic1410/): 41,000 km in the late 1800s, 23,335 km in 1979–80, just under 16,500 km in 2014; "a conspicuous deep red eye embedded in swirling layers of pale yellow, orange and white"; anticlockwise in the southern hemisphere. Latitude 22°S (https://en.wikipedia.org/wiki/Great_Red_Spot).
- Neptune's Great Dark Spot (Voyager 2, 1989; https://www.eso.org/public/archives/releases/sciencepapers/eso2314/eso2314a.pdf and summaries): ~22°S, 13,000 × 6,600 km, with bright "companion" methane-ice clouds above it; gone within a few years.

## Measurements

Jets as a share of the equator's rotation speed (2π · radius / period), radius = fact-sheet diameter / 2:

```bash
node -e '
const b = { Jupiter: [71492, 9.925, [["prograde jets",140],["retrograde jets",-60],["strongest jet",180]]], Saturn: [60268, 10.7, [["equator (low)",450],["equator (high)",500],["hexagon jet",104]]], Uranus: [25559, 17.2, [["equator",-50],["prograde jets",250]]], Neptune: [24764, 16.1, [["equator",-400],["prograde jets",270]]] };
for (const [n,[r,h,ws]] of Object.entries(b)) { const v = 2*Math.PI*r*1000/(h*3600); for (const [k,w] of ws) console.log(`| ${n} | ${k} | ${w} m/s | ${(v/1000).toFixed(2)} km/s | ${(100*w/v).toFixed(2)}% |`); }'
```

| Body | Jet | Wind | Equator's rotation | Share |
|---|---|---|---|---|
| Jupiter | prograde jets | 140 m/s | 12.57 km/s | 1.11% |
| Jupiter | retrograde jets | −60 m/s | 12.57 km/s | −0.48% |
| Jupiter | strongest jet | 180 m/s | 12.57 km/s | 1.43% |
| Saturn | equator (low) | 450 m/s | 9.83 km/s | 4.58% |
| Saturn | equator (high) | 500 m/s | 9.83 km/s | 5.09% |
| Saturn | hexagon jet | 104 m/s | 9.83 km/s | 1.06% |
| Uranus | equator | −50 m/s | 2.59 km/s | −1.93% |
| Uranus | prograde jets | 250 m/s | 2.59 km/s | 9.64% |
| Neptune | equator | −400 m/s | 2.68 km/s | −14.90% |
| Neptune | prograde jets | 270 m/s | 2.68 km/s | 10.06% |

(Jupiter's period is 9.9 h in the fact sheet; 9.925 h was used above, which changes nothing at this precision.)

Storm sizes as angles on their planet: the Great Red Spot is 16,500 / 71,492 rad = 13.2° (2014) to 23,335 km = 18.7° (1979) long; the Great Dark Spot 13,000 × 6,600 km on Neptune is 30.1° × 15.3°, an aspect of 1.97.

## Game mapping

- **Drift** is a fraction of the body's own spin (`GasJet.speed`), so it scales with the game's stylised spins: Jupiter-like jets ±1.1% / −0.48%, the equator from Jupiter's ~1% to Saturn's ~5%, ice giants from Uranus's (−1.9%, +9.6%) to Neptune's (−15%, +10%). `gasParams.pace` (4) speeds it all up so the flow shows: **stylised**.
- **Gas giants** blend from Jupiter-like (`saturn` = 0) to Saturn-like (1): 6–7 bands a side down to 3–4, an equatorial zone 5–8° to 25–35° wide, banding up to 64–68° (Jupiter) or 74–80° (Saturn), then a darker polar region. Belts and zones alternate; a jet sits at each edge, prograde where a belt lies poleward, retrograde where a zone does, weakening as cos(latitude) (Jupiter's last jet is only ~40 m/s). Each hemisphere is drawn separately, so they differ.
- **Polar regions**: Jupiter-like ones get a ring of 5–9 / 4–8 cyclones round a central one (Jupiter: 8 and 5). Saturn-like ones may get a polygonal jet (mostly six-sided) at the polar latitude instead. The polar colour is the palette's darker third mixed halfway with a blue-grey (`POLAR_BLUE`): stylised from "a darker background" and Juno's images; no colour was measured.
- **Storms**: a great spot (60% of Jupiter-like giants, 15% of Saturn-like) at 15–27° either side, 13–19° long, aspect 1.6–2.1 (the aspect is the Great Dark Spot's ~2; the Red Spot's own wasn't looked up), in the darkest band's hue made deeper, with a pale collar. White ovals (2–8, fewer on Saturn-like ones) at 25–55°, 3–6° long: **unverified sizes**, stylised. Anticyclones turn anticlockwise in the south. Ice giants: half get a dark spot at 15–30°, up to 30° × 15°, with a bright companion cloud on its poleward edge (stylised placement), and 1–5 long bright methane streaks.
- **Ice giants**: a retrograde equatorial band ±20–50°, 2–3 faint bands a side, low contrast, calmer churning (turbulence × 0.45), and half have a bright polar hood from 40–50° to one pole.
- **Look**: the bands' colours, the shear at each jet and the drift are baked into a 512-row latitude table; per pixel, the clouds are read from the shared 3D noise, stretched east-west (round in the polar regions), carried along by the drift (two copies, each carried one `period` and crossfaded, so the shear never winds up), bending the band edges more where the jets shear. Storms twist the clouds round themselves. Finer, billowy octaves fade in as a pixel covers less of the globe, so low orbit shows cloud puffs. The planet map draws the same shader; the system map's discs use the bands alone (`gasPainter`).

## Open questions

- The Great Red Spot's aspect ratio and the white ovals' sizes weren't looked up.
- Where Uranus's and Neptune's prograde jets peak isn't in the sources read; they sit halfway between the equatorial jet's edge and the pole.
- Colours are the planet's generated palette; none of the real giants' colours were sampled.
