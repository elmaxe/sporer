# Ground rocks: loose rocks and boulders on solid ground

## Question

Planets felt bare up close: low orbit showed the terrain's facets and nothing lying on them. The task was ground clutter: rocks that load in as the camera comes down near the ground. That needs:

1. **How rock sizes are spread**: the size–frequency law of boulders on real airless and rocky surfaces, for rocks of about 1–25 m.
2. **How many there are** per area at the smallest size drawn, on a bouldery plain.

It feeds `gen/rocks.ts` (pure: the plan per body, the cells' rocks) and `surface/GroundRocks.ts` (the view: streaming cells near the camera, instanced meshes, the fade by apparent size).

Precision: the right law and roughly the right density (within a factor of a few, since real counts vary by more than that from site to site).

## Sources

All accessed 2026-10-04.

- **DellaGiustina et al. 2019**, "Properties of rubble-pile asteroid (101955) Bennu from OSIRIS-REx imaging and thermal analysis", *Nature Astronomy* (NTRS copy https://ntrs.nasa.gov/api/citations/20190025172/downloads/20190025172.pdf):
  - Bennu: "power-law index of –2.9 ± 0.3 for boulders 8 m and larger", with sizes "range from 1 to 58 m".
  - Itokawa: "–3.5 ± 0.1 for boulders ≥10 m". Ryugu: "power-law index of –2.5 to –3.0".
  - Boulders ≥20 m per area: "28.2 km–2 versus ~25 km–2" (Bennu vs Itokawa); Ryugu "~50 km–2".
- **Michikami et al. 2008**, Itokawa (https://earth-planets-space.springeropen.com/articles/10.1186/BF03352757, abstract): "373 boulders larger than 5 m … 0.393 km2 … number density is nearly 10^3/km2", "power-index of −3.1 ± 0.1".
- **Lunar boulders.** Krishna et al., Linné crater ejecta (https://arxiv.org/pdf/1812.00590):
  - Linné ejecta: index "4.03 +0.09/-0.10" for boulders ≥4.4 m.
  - Surveyor I, III and VI sites, boulders "1 to 6.5 m": "indices from -3.51 ± 0.47 to -6.02 ± 1.40".
  - Citing Bart & Melosh 2010: "most of the indices fall in the -3.0 to -4.5 range".
  - These are ejecta fields round fresh craters, which are steeper than an open plain.
- **NASA, "Lunar Surface Models"** (https://ntrs.nasa.gov/api/citations/19700009596/downloads/19700009596.pdf), Fig. 7, "Cumulative number of blocks in intercrater region of smooth Mare, rough Mare, and Upland terrains", in blocks/m². Read off the plot, so good to about a factor of 2:
  - At D ≈ 0.25 m: about 0.1 m⁻² at most, 0.03 nominal, 0.01 at least.
  - "standard height is considered to be equal to one-half the block diameter".
- **Golombek et al. 2012**, *Mars* 7 (http://www.marsjournal.org/contents/2012/0001/files/golombek_mars_2012_0001.pdf):
  - Mars rock abundance model: "Fk(D) = k exp [-q(k) D]", with "q(k) = 1.79 + 0.152/k".
  - k is "the area covered by rocks larger than around 10 cm".
  - Its Table 3 gives rocks >1.1 m per m² at each k.
- **Golombek et al. 2003**, MER landing sites (http://www.mars.asu.edu/christensen/docs/golombek_mersites_jgr.pdf):
  - IRTM rock abundance at "VL1, VL2 or Pathfinder (16%, 17% and 18% respectively)", and a "global mode of 8%".

## Measurements

Mars: the Golombek model integrated for the number of rocks per m², counting each rock as a disc of area πD²/4. This reproduces their Table 3 within 2% (k = 5/10/15/20/30% give 0.000194/0.00188/0.00468/0.00799/0.0153 m⁻² >1.1 m, against the table's 0.000198/0.0019/0.0047/0.0081/0.015):

| k | N > 0.1 m | N > 0.5 m | N > 1 m | local b, 0.5–2 m |
|---|---|---|---|---|
| 0.05 | 1.04 | 0.014 | 3.7e-4 | 7.0 |
| 0.08 (global mode) | 1.55 | 0.035 | 1.7e-3 | 5.7 |
| 0.16 (Viking, Pathfinder) | 2.76 | 0.098 | 8.2e-3 | 4.6 |

The game's barren plain (`ROCKS_PER_M2` with `ROCK_EXPONENT`, from `gen/rocks.ts`):

| D | N(>D) per m² |
|---|---|
| 1 m | 4.0e-3 |
| 2 m | 5.4e-4 |
| 5 m | 3.8e-5 |
| 10 m | 5.0e-6 |

At 1 m this lies between Mars's global mode and a Viking or Pathfinder site. A lunar mare, at 0.01–0.1 m⁻² over 0.25 m, extrapolates with b ≈ 3 to roughly 10⁻⁴–10⁻³ over 1 m, so it is sparser.

`tests/rocks.test.ts` checks the rest:
- The sampled sizes follow N(>D) ∝ D^−b. Doubling the size gives 2^−b as many.
- A cell's count matches the plan's density times the patches' mean, over many cells.
- Cells are deterministic and none lie under the sea.

## Game mapping

- **Scale.** Lengths use the sea waves' stylised scale (`ROCK_METRES_PER_UNIT` = `waveParams.metresPerUnit` = 10 m per unit, the UFO a 40 m saucer). Rocks run from 1 m (0.1 units) to 24 m (2.4 units).
- **Sizes.** Drawn from the truncated power law N(>D) ∝ D^−b by its inverse distribution, `rockSize`. b = 2.9 is Bennu's, within Ryugu's 2.5–3.0 and the lunar plains' range. Metre-sized rocks on Mars fall off faster (its model is exponential); kept as an open question.
- **Density.** 4×10⁻³ rocks per m² over 1 m on a bare airless plain (`ROCKS_PER_M2`), the value of a rocky Mars plain. Each kind of world takes a share (`ROCK_DENSITY`, stylised):
  - barren 1, lava 0.8;
  - irregular small bodies 1.4 (rubble piles; really far denser, see the open questions);
  - desert 0.45 (sand covers them);
  - ice 0.3;
  - terran and ocean land 0.2 (soil and plants);
  - none on giants.
- **Patches.** Rocks gather into boulder fields and thin out between them: a noise field from 0.15× to 2.2× the mean (`rockPatch`, stylised).
- **Cells.** Like the plants' cells: 12-unit cells of the cube-sphere grid, each cell's rocks from the body's seed and the cell's address alone. Candidates all draw the same random numbers whether or not they're kept, and none lie under the sea.
- **Shape.** Rocks lie flat (height 0.4–0.8 of the longest side, against the lunar model's "standard height" of half the diameter). They are sunk 30% into the ground (`ROCK_SINK`), so they never float over a coarser chunk of the drawn ground. Four lumpy, flat-shaded icosahedra, one of them blocky.
- **Colour.** The ground's colour where the rock lies, blended 45% towards the body's bare high-ground colour and greyed by 45% (`surface/rockSetup.ts`), then shaded 0.55–1.05.
- **Loading.**
  - Cells load within `rockParams.range` (110 units) of the camera, along the ground from the camera's height, nearest first, within a 2 ms budget per frame. From higher up, none load.
  - A rock is drawn while it covers at least `rockParams.angle` (0.006 rad, ~4 px on a 720 px view at a 65° field of view). It fades with a dither over the last fifth of that, so stones show only close by and boulders from further.

## Open questions

- Real rubble-pile asteroids are far rockier: Bennu's and Itokawa's counts extrapolate to ~0.15–0.17 m⁻² over 1 m, ~40× the game's barren plain. Drawing that many would cost too much at the planet level's scale, so small bodies only get 1.4×.
- Metre-sized rocks on Mars fall off faster than any single power law, a local b of 4–7. One exponent is used everywhere.
- Rocks don't gather on steep slopes (talus) or round fresh craters (ejecta). Both would need the slope or crater at each candidate.
