# Plants on habitable planets (roadmap step 25)

## Question

Step 25 puts plants on habitable bodies (T1–T3) and asks that "how many species per tier and how dense" be looked up, not guessed. Needed for `gen/plants.ts`:

1. How dense real tree cover is, and how it differs between biomes (a sanity check on "denser the higher the tier", and on patchy forests versus meadows).
2. Where trees stop growing (temperature limits), to decide which species live where on a planet.
3. How annual mean temperature changes with latitude, since that is what puts plants in the tropics and keeps them off the poles of a cold world.

Precision: the right trends. The numbers the player reads are only species names and heights in the tooltip, and those are stylised. Sizes, spacing and counts in the game are stylised too (see *Game mapping*).

## Sources

- **Crowther et al. 2015, "Mapping tree density at a global scale", Nature 525, 201–205**, https://www.nature.com/articles/nature14967, read as the PDF copy at https://bradfordlab.com/wp-content/uploads/2015/09/crowther-et-al-nature-2015.pdf (pdftotext, accessed 2026-09-30). Abstract: "the global number of trees is approximately 3.04 trillion … approximately 1.39 trillion exist in tropical and subtropical forests, with 0.74 trillion in boreal regions and 0.61 trillion in temperate regions". Extended Data Table 1, trees per biome (billions): boreal forests 749.3, deserts 53.0, flooded grasslands 64.6, mangroves 8.2, Mediterranean forests 53.4, montane grasslands 60.3, temperate broadleaf 362.6, temperate conifer 150.6, temperate grasslands 148.3, tropical coniferous 22.2, tropical dry 156.4, tropical grasslands 318.0, tropical moist 799.4, tundra 94.9; total 3,041.2. Text: "At the biome-level, the highest tree densities exist in forested regions of the Boreal and Tundra zones … stress-tolerant coniferous tree species that can reach the highest densities on Earth"; "a human population of 7.2 billion … revises the ratio of trees per person from 61:1 to 422:1".
- **Wikipedia, "Earth"** (raw wikitext, accessed 2026-09-30): land area 148,940,000 km². (Used only to turn the global count into a mean density; Wikipedia's figure, not checked against a second source.)
- **Körner & Paulsen 2004, "A world-wide study of high altitude treeline temperatures", J. Biogeography 31, 713–732** (search summaries only, the paper was not opened: weaker): treelines across 46 sites (68° N to 42° S) sit where the seasonal mean root-zone temperature is **6.7 °C (±0.8 SD)**, 7–8 °C in temperate and Mediterranean zones, 5–6 °C at the equator, 6–7 °C in the subarctic and boreal zones; the growing-season threshold is about 6.4 °C and a season of at least 94 days.
- **MIT Weather & Climate Lab, *The Meridional Structure of the Atmosphere* (chap. 5)**, http://weatherclimatelab.mit.edu/wp-content/uploads/2017/07/chap5.pdf (pdftotext, accessed 2026-09-30): "average surface temperature … is below 0 °C polewards of about 60° latitude, and reaches a maximum of 27 °C just north of the equator. The annual-mean pole-to-equator temperature difference over the troposphere is typically 40 °C."
- Earth's mean surface temperature 288 K (15 °C): NASA Earth fact sheet, via `docs/research/planet-temperatures.md`.

## Measurements

**Mean tree density.** 3.04 × 10¹² trees over 1.4894 × 10¹⁰ ha of land (148,940,000 km²) is about **204 trees per hectare** on average over all land, forest or not, deserts and ice sheets included. Per biome the totals are very uneven: tropical moist forests, boreal forests and temperate broadleaf forests hold 799, 749 and 363 billion, while deserts hold 53 billion and tundra 95 billion. The paper does not give per-hectare means per biome in the text I read (only totals and sample counts), so the **trend** is what is used: dense forest patches next to sparse ground, sparser on dry and cold ground, densest where conditions are stress-limited but wet enough.

**Latitude model.** `T(φ) = mean + 19 K · (cos 2φ − 1/3)`; `cos 2φ − 1/3` has area-weighted mean exactly 0, so the planet's mean is the body's mean. For Earth (288 K):

| Latitude | T computed | Reference |
|---|---|---|
| 0° | 300.7 K (27.5 °C) | 27 °C maximum just north of the equator (MIT) |
| 30° | 291.2 K (18.0 °C) | – |
| 45° | 281.7 K (8.5 °C) | – |
| 60° | 272.2 K (−1.0 °C) | "below 0 °C polewards of about 60°" (MIT) |
| 75° | 265.2 K (−7.9 °C) | – |
| 90° | 262.7 K (−10.5 °C) | – |

The equator and the 60° crossing match. The pole is about 25–40 K too warm (real annual means are around −25 °C in the Arctic, −50 °C in Antarctica; the MIT text's pole-to-equator difference of ~40 K against 38 K here is for the troposphere average). Left as is: plants never reach those latitudes on a planet that is habitable (T1 needs −20 to 60 °C means). Pinned in `tests/plants.test.ts` (equator 25–29 °C, 60° within 2 K of 0 °C, area-weighted mean = the body's mean).

**The game's own numbers** (`scripts` scratch run, seed 1337, every cell of the planet, `npx vite-node`):

| Planet | Tier | Cells with plants | Plants per planted 1000 u² | Kinds (trees / large bushes / small bushes) |
|---|---|---|---|---|
| Stetiarund I (terran) | T3 | 55% | 19.1 | 7543 / 6665 / 10281 |
| Dethiorn III (terran) | T3 | 60% | 16.8 | 3252 / 3434 / 7170 |
| Mounzhiand I (terran) | T1 | 55% | 7.7 | 2467 / 11032 / 7777 |
| Drethioby II (desert) | T1 | 81% | 6.2 | 1804 / 4783 / 2997 |

T3 is about 2.5× denser than T1 and has three times the species; T1 is mostly bushes (trees need 268 K ± 6 and their tree line is lower). Generating a cell takes about 0.03–0.15 ms.

**The drawn ground versus the terrain.** The LOD surface is coarser far from the camera, so a plant standing at the exact terrain height can float or sink where the drawn ground is coarser. Measured in the lab on Stetiarund I with the camera 28 units from the ship: for every loaded plant a ray was cast down onto the drawn chunks and compared with the plant's radius (positive = floating):

| Camera distance | plants | 5th percentile | median | 95th percentile | extremes |
|---|---|---|---|---|---|
| under 60 | (count not kept) | | ~0 | | −0.04 … +0.08 |
| 60–120 | 588 | −0.10 | 0.00 | +0.12 | −0.26 … +0.48 |
| 120–200 | 1458 | −0.25 | 0.01 | +0.29 | −0.62 … +0.69 |
| 200–300 | 1608 | −0.41 | 0.01 | +0.44 | −0.86 … +0.93 |
| over 300 | 338 | −0.52 | 0.02 | +0.72 | −1.01 … +1.64 |

The median error is zero and the spread grows with distance (the cells are ~0.05 rad wide, so 5 units at 100 and 15 at 300). Plants are sunk into the ground by 12% of their height (`SINK`), and a species is only drawn out to a distance that scales with its height, so the error stays below the sink for the plants that can be seen at that range (a 1-unit small bush is gone by 70 units, where the error is 0.1; a 6–11 unit tree reaches 360 units where the error is 0.7–1.0 against a 0.7–1.3 sink). **It doesn't show, so plants stand on the terrain sampler, not on a `LodSurface` height query.**

**Cost** (the lab, Stetiarund I, UFO low over a forest, SwiftShader at `?quality=low`, so the frame rates only compare the two): plants add 16 draw calls (8 species × 2 levels), ~216k vertex-side triangles (2066 near and 2881 mid-distance instances of 5611 loaded plants; before the fade discards and with no frustum culling), against 210k triangles and 242 calls for the planet without them: 427k triangles and 258 calls with plants, 4 FPS against 6 without. On a real GPU that is a light load; the menu's Plants switch is there for slow devices, and it is off by default on touch devices.

## Game mapping

- **Species per tier** (`SPECIES_PER_TIER` 0, 3, 5, 8; `KIND_ORDER` hands out tree, large bush, small bush, tree, small bush, large bush, tree, small bush): every tier has all three kinds, higher tiers have more species and more trees. The counts are design numbers, not measurements.
- **Cover** (`COVER_PER_TIER` 0, 0.30, 0.55, 0.85, times `0.55 + 0.45·√water`): the chance a candidate spot (a jittered grid, ~5 units apart) holds a plant at the best fertility. A separate smooth fertility field (`fertility()`, patches of tens to hundreds of units) makes forests and meadows: trees like the lush patches, small bushes take the rest. This follows the real pattern (Crowther: very uneven density, dense forest next to bare ground), not its numbers. Real mean tree cover is ~200 per hectare; the game has ~7–19 plants per planted 1000 u², because at the game's scale (a tree 8 u tall on a globe of radius 400 u) packing real densities would mean hundreds of thousands of objects in view.
- **Temperature limits** (annual mean, K, per kind, ±6 K per species): trees 268–318, large bushes 258–325, small bushes 248–330. Real treelines are set by the growing-season mean (6.4–6.7 °C, Körner & Paulsen) rather than the annual mean; boreal forest (which holds about a quarter of all trees, Crowther) grows where annual means are below 0 °C. So a tree's annual-mean floor of −5 °C (268 K) is a stylised stand-in: hardy small plants go further (tundra, which holds 95 billion trees and shrubs), trees stop first, as in the real tree line. Elevation limits follow the same ordering: trees up to 55% of the relief, large bushes 75%, small bushes 92% (`maxElevation`).
- **Latitude**: the body's axis is +Y in its own frame, `lat = asin(y)`, temperature from `localTemperature`. A cold T1 world keeps plants to its tropics; a hot one to its poles.
- **Sizes** (planet-level units, the UFO is ~4 wide): trees 6–11, large bushes 2.2–3.6, small bushes 0.8–1.5, placeholders built from a few primitives. Stylised.
- **View distances** are in plant heights (tree 22 near / 46 far, large bush 30 / 60, small bush 36 / 70), so trees show further than bushes: up to ~360 units for a 8-unit tree.

## Open questions

- Per-hectare means per biome were not read from the paper (only totals and sample counts); the density trend is used, not its numbers. Extended Data Fig. 1 and Fig. 4 have them.
- The latitude model's poles are too warm (see above); irrelevant for plants today, worth revisiting if the ice caps or snow lines ever use it.
- The tree-line temperature is an annual-mean stand-in for a growing-season limit; a model with seasons (the planet's axial tilt is already known) could use the real 6.4 °C growing-season threshold.
- Körner & Paulsen's paper itself was not opened (search summaries only).
