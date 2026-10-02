# Plant forms and their levels of detail (the plant lab)

## Question

The plant lab replaces step 25's placeholder plants with generated ones (`gen/plantForm.ts` grows a species into a skeleton, `surface/plantMesh.ts` builds its meshes) and draws them at several levels of detail. Needed:

1. How real trees branch, to grow believable skeletons: how thick a branch is next to the stem it grows from, how successive branches turn round a stem, and at what angle branches leave the trunk (conifers against broadleaf trees).
2. How wide real crowns are next to the tree's height, by kind of tree. Step 25's crowns were placeholders, and broadleaf crowns came out much narrower than real ones.
3. What a palm's crown is like: how many fronds, and how long and wide they are.
4. How games step trees down in detail, and by how much per level.

Precision: the right shapes and trends. Branch counts and leaf masses are stylised to the game's low-poly look and to its triangle budget (see *Game mapping*).

## Sources

A research agent gathered these in this session (accessed 2026-10-02) and quoted each value from the page it read. Pages it could not read are marked.

- **Eloy 2011, "Leonardo's rule, self-similarity and wind-induced stresses in trees", PRL 107, 258101**, arXiv PDF https://arxiv.org/pdf/1105.2591 (introduction):
  - "the available data indicate that the Leonardo exponent is in the interval 1.8 < ∆ < 2.3 for a large number of species".
  - His wind-fracture model "gives 1.93 < ∆ < 2.21".
  - Leonardo's rule: a parent branch's radius^∆ equals the sum of its daughters' radius^∆. ∆ = 2 conserves cross-sectional area.
- **Minamino & Tateno 2014, "Tree branching: Leonardo da Vinci's rule versus biomechanical models", PLOS ONE 9(4) e93535**, https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0093535.
  - The daughters' summed cross-section was "a little larger than the cross-sectional area of the mother branch at most branching points in Fagus crenata … whereas the daughter/mother ratios were not so much away from 1.0" (1.0 is ∆ = 2).
  - The paper gives no numeric mean.
  - Daughter-branch angles on horizontal branches: "50–80° for Abies homolepis and 10–50° for Fagus crenata".
- **Golden angle**: https://en.wikipedia.org/wiki/Golden_angle gives "approximately 137.5077640500378546463487…°", which is 180(3 − √5)°.
  - **Okabe 2015, Sci. Rep. 5:15358**, https://pmc.ncbi.nlm.nih.gov/articles/PMC4607949/: "the divergence angle between successively arising leaves is fixed at the golden angle of 137.5°", "universally observed at the shoot tip of most vascular plants".
  - Jean (1994) found Fibonacci phyllotaxis in about 92% of 650 species with spiral phyllotaxis. This is second-hand: quoted at https://www.benkuhn.net/cf-plants/, because the Smith College page it cites could not be loaded.
- **Gil-Moreno 2018, PhD thesis, Edinburgh Napier**, §6.4.3.3 and Table 6-3, https://www.scottishforestrytrust.org.uk/userfiles/file/projects/p12_233b_minor_conifer_species/final-thesis_david_gil_moreno_final.pdf. Conifer branch angles:
  - "mostly between 70 and 100 degrees", "more acute … towards the top of the tree".
  - Species means: Norway spruce 78°, western red cedar 80°, noble fir and western hemlock 84°.
  - Stand-grown crown ratios (crown length as a share of the height): noble fir 43.9%, Norway spruce 51.9%, western red cedar 61.7%, western hemlock 43.7%.
  - The passage read doesn't state the angle's convention; taken as measured from the stem above, so 90° is level.
- **European beech, CJFR manuscript cjfr-2020-0382** (draft PDF https://utoronto.scholaris.ca/server/api/core/bitstreams/fdf762d4-c727-449e-8315-07910e091e47/content):
  - Branch angle "between stem and branch axis": 30.7° in pure stands and 54.1° in mixed stands.
  - Crown ratio 50.0% and 71.5%.
- **Peper, McPherson & Mori 2001, J. Arboriculture 27(6), Table 4**, https://www.fs.usda.gov/psw/topics/urban_forestry/products/cufr_94_PP01_39.pdf. Open-grown street trees, height and crown diameter 30 years after planting:
  - London plane 15.51 / 12.89 m, zelkova 12.85 / 14.91 m, silver maple 18.62 / 13.67 m, sweetgum 15.94 / 9.71 m, ginkgo 11.74 / 8.50 m.
  - Width / height across its twelve species: 0.61–1.16, mostly about 0.85 (computed by the agent from the table).
- **Chan & Elevitch 2006, Cocos nucifera species profile** (Pacific Island Agroforestry), https://raskisimani.com/wp-content/uploads/2013/01/cocos-nucifera-coconut.pdf:
  - "Fronds are 4.5–5.5 m … in length"; "200–250 linear-lanceolate leaflets" each "50–150 cm … long".
  - "Talls have 30–35 leaves in their crown at any given time".
  - "The canopy has a diameter of 8–9 m" on a palm "20–22 m" tall; "The fronds in a mature healthy palm describe a sphere".
  - Cross-checks: ICRAF Agroforestree gives "Leaves pinnate… 4–7 m long"; Hawaii CTAHR gives 3.7–6 m.
- **Weber & Penn 1995, "Creation and Rendering of Realistic Trees"**, https://courses.cs.duke.edu/cps124/fall01/resources/p119-weber.pdf:
  - Its four parameter sets (quaking aspen, black tupelo, weeping willow, CA black oak) turn branches by about 140° (`nRotate` 140; the paper: "any number near 140 degrees works well").
  - Main branches leave at 20–60° (`1DownAngle`).
  - Table 2, the aspen at increasing distance, drops the second-order branches first: 17,736 triangles at 5 m, none by 60 m. Leaf triangles fall from 53,248 to none by 240 m, where leaves become points and branches lines.
- **Unreal Engine automatic LOD** (https://dev.epicgames.com/documentation/en-us/unreal-engine/static-mesh-automatic-lod-generation-in-unreal-engine): default LOD groups keep `LODPercentTriangles=50` per step. The tutorial example keeps 75 / 25 / 12% at LODs 1–3.
- **SpeedTree** (https://docs.unity3d.com/speedtree-modeler/manual/level-of-detail.html): continuous LOD. "Branches will shrink away to their spine before ultimately going away"; leaves are removed while the remaining ones grow. No numbers given.
- **Unity LOD Group**: switches by screen-height percentage, with no default numbers.
- Not found: open-grown conifer crown width / height; Weber & Penn's palm and balsam fir parameters (the paper's table has only the four trees above); SpeedTree's per-level reductions (its docs returned 403).

## Measurements

All with `npx vite-node` scripts over the species of 60 generated planets (tier 3, about 480 species, unless said otherwise).

**Envelope fit.** Every grown plant's top is the species' height and its crown radius (about the crown's own centre) is the species' crown radius, to 1%. Pinned for tiers 1–3 over 30 planets in `tests/plantForm.test.ts`. The fit stretches the grown plant by at most 0.6–1.7×. In practice it is close to 1, because branches aim at points on the envelope.

**Triangles per level of detail** (mean per species):

| Kind / architecture | species | LOD 0 | LOD 1 | LOD 2 | LOD 3 |
|---|---|---|---|---|---|
| tree / conifer | 127 | 719 | 185 | 23 | 18 |
| tree / broadleaf | 36 | 501 | 150 | 26 | 14 |
| tree / palm | 17 | 484 | 121 | 60 | 60 |
| large bush / shrub | 120 | 453 | 89 | 30 | 12 |
| small bush / shrub | 180 | 231 | 81 | 20 | 8 |

Step 25's placeholders were about 34–96 triangles near and 15–26 mid.

**Cost per unit of ground.** The number of plants at a level grows with the area of its distance band, π(end² − start²) in plant heights. Summing triangles × band area gives the cost of one kind out to its far range, per plant per h² of density:

| Kind | new (4 levels) | step 25 (2 levels) |
|---|---|---|
| tree (conifer / broadleaf / palm) | 405k / 324k / 532k | ~138k |
| large bush | 438k | ~396k |
| small bush | 442k | ~552k |

Trees cost 2.3–3× what they did, bushes about the same or less.

**In the game**, Haikrai I (home system, seed 1337, T3), ship over a forest. Same steps on `main` (191e279, before this change) and on this branch, at `?quality=low` in headless Chrome (SwiftShader):

| | plants loaded | instances by level | draw calls | plant triangles | FPS |
|---|---|---|---|---|---|
| main, closest zoom | 1860 | 1008 near / 1106 mid | 16 | 93.7k | 3 |
| this branch, closest zoom | 2501 | 45 / 110 / 234 / 335 | 32 | 43.3k | 4 |
| main, zoom 40 | 1903 | 996 / 1134 | 16 | 93.3k | 4 |
| this branch, zoom 40 | 3683 | 25 / 94 / 247 / 501 | 29 | 42.5k | 4 |

The ship was placed on the middle plant of the loaded cells, so the two runs hover over different spots, and the loaded counts differ.

Fewer triangles drawn despite the richer plants. Each plant's level is now chosen per plant, at every rescan (every 4 units the camera moves). Before, it was chosen per 32-unit cell, so a cell joined a level's batch whole if any part of it was in range. In the plant lab's grove (gen=12, camera 120 units out) that put 903 plants into the full-detail batch where 325 were close enough; the same view went from 748k to 320k triangles.

**Silhouettes.** Coverage of each level against the full plant (LOD 0), in orthographic views 48×48 over the plant. Columns: 5th percentile, median, 95th percentile.

| | side L1 | side L2 | side L3 | top L1 | top L2 | top L3 |
|---|---|---|---|---|---|---|
| broadleaf | 0.93 1.00 1.03 | 0.87 0.96 1.03 | 0.97 1.06 1.14 | 0.95 1.00 1.03 | 0.94 1.00 1.03 | 1.08 1.16 1.21 |
| conifer | 0.98 1.05 1.11 | 0.82 0.94 1.04 | 0.83 0.96 1.07 | 1.08 1.12 1.18 | 0.46 0.69 0.96 | 0.46 0.69 0.95 |
| palm | 0.93 0.97 1.09 | 0.80 0.93 0.99 | 0.80 0.93 0.99 | 0.91 0.96 0.98 | 0.83 0.88 0.91 | 0.83 0.88 0.91 |
| shrub | 0.72 0.86 0.99 | 0.67 0.84 0.98 | 0.76 0.96 1.12 | 0.93 0.98 1.02 | 0.96 1.00 1.04 | 1.07 1.16 1.20 |

The conifers' far cones are sized for a low view, so their top coverage is low (see *Game mapping*). Shrubs lose 15% from the side at levels 1–2, where their stems go.

The fixed-up merges below replaced hand-tuned fill factors. Those fill factors gave the conifer cones 1.8–2.2× the needles' area and shrubs 0.6×.

**Build time.** Growing and meshing a T3 planet's 8 species at 4 levels takes 12.5 ms (median over 20 planets in Node, 105 ms for the first, unwarmed one). It runs once, when a planet level is built.

**Two formulas, checked numerically** (`tests/plantForm.test.ts`):
- The mean shadow of the game's jittered icosahedron is 0.762 π r², and of the grown octahedron the same, to a few per cent over 200 random directions. This is Cauchy's formula: mean shadow = surface area / 4.
- The cone's closed-form shadow (below) matches a rasterised 256-sided cone to a few per cent, at elevations 0°, 10°, 20° and 60°.

## Game mapping

- **Leonardo's rule, ∆ = 2** (`BRANCH_EXPONENT`), the middle of Eloy's 1.8–2.3. Along a stem, what its cross-section loses between the first branch and its tip, r_base² − r_tip², is shared out equally among the branches it carries. A conifer's 16 branches on a trunk tapering to 12% come out at about a quarter of the trunk's radius each. Stems never go below 0.6% of the height (`MIN_RADIUS`); thinner ones would be under a pixel anyway.
- **Golden angle** (`GOLDEN_ANGLE` = π(3 − √5) = 137.5°) between successive branches, fronds and stems.
- **Branch angles.** Conifers 75–100° from the trunk, 12° steeper towards the top (Gil-Moreno: 70–100, more acute up the tree). Broadleaves 30–55° (beech 30.7–54.1°); their main branches aim at points on the crown's ellipsoid, so the crown fills its envelope. Side branches leave at 30–60°.
- **Crown widths** (`TREE_CROWN_WIDTH`, diameter / height):
  - Broadleaf 0.6–1.1 (Peper et al.'s 0.61–1.16).
  - Palm 0.4–0.6 (coconut 0.36–0.45, a little wider for younger palms).
  - Conifer 0.28–0.44: stylised, no measured open-grown ratio found.
  - Bushes keep step 25's crown-height ratios.
  - Bare-trunk shares stay at step 25's 30–50% for trees, consistent with the stand-grown crown ratios of 44–72% above.
  - This changes the game's trees: broadleaf crowns used to come out at 0.35–0.84.
- **Palms.** 7–12 fronds, not 30–35: low-poly, and each frond is two folded strips. Each frond is as long as the crown radius. Its width is 0.25–0.42 of its length (leaflets of 0.5–1.5 m either side of a 4.5–5.5 m frond give 0.2–0.6), folded down along the midrib. Fronds rise 10–40° and arch down by 0.6–1.4 rad over their length.
- **Levels of detail** (`plantLodSpec`). Following Weber & Penn and SpeedTree, thin branches go first and leaves merge:
  - LOD 0 is the full plant.
  - LOD 1 keeps the trunk and one leaf mass per main branch (per stem for shrubs). Branches are then under a pixel wide: a branch of 1.5% of the height, 8 heights away, is 0.002 rad.
  - LOD 2 is the trunk and one crown (a cone per layer for conifers).
  - LOD 3 is one octahedron crown with a 3-sided trunk.
  - Each level has about 20–35% of the previous one's triangles, near Unreal's 25% / 12% example. LODs 2–3 are under a twentieth of LOD 0.
- **Where the levels change** (`PLANT_LODS`, in plant heights):
  - Trees switch at 8, 18 and 30, and are gone by 46.
  - Large bushes switch at 10, 24 and 38, gone by 60.
  - Small bushes switch at 12, 30 and 46, gone by 70.
  - The far ends are step 25's. At the first switch a single leaf mass (about a tenth of the plant's height) is ~8 px across on a 720 px view with the game's 65° field of view: 0.1 / 8 / (1.134 / 720) ≈ 8.
  - Each level fades out over the last 20% of its range while the next fades in (the same dithered crossfade as step 25, generalised to n levels). The bands are pinned to tile with no gap.
- **Merging leaves keeps their shadow.** A merged mass is as wide as covers the area the masses covered seen from above, and as tall as covers their side areas. The shadows are exact ellipse projections: qᵀ(N Nᵀ)⁻¹q ≤ 1, rasterised 40×40 over the group.
- **Polyhedra.** An octahedron is drawn √(0.762 / 0.551) = 1.18× bigger than the icosahedron it stands for. These are the polyhedra's mean shadows as shares of the sphere's, by Cauchy's formula.
- **Far conifer crowns.** A solid cone can't match both the gappy side view and the full top view of a spiral of needle pads, so each layer's cone is sized to cover the needles' shadow seen from 20° above the horizon (`FAR_VIEW_ELEVATION`). In low orbit the camera is some 20 units above the ground behind the ship, so far plants, 60–300 units off, are seen from 4–20°.
- **The cone's shadow at elevation e** has a closed form. It is the convex hull of the base ellipse (r × r sin e) and the apex (h cos e above the base's centre). Squash the ellipse to a circle of radius r; the apex is then D = h cos e · r / (r sin e) away. With cos θ = r/D, the hull is a²(π − θ) + a√(D² − a²), with a = r, stretched back by sin e.
- **Choosing levels per plant.** Each rescan (the camera moved 4 units) rewrites the batches. A plant goes into every level whose span, from the previous level's fade start to its own end, its distance could be in before the next rescan. The span is widened by 1.5 × 4 units, so a moving camera never outruns it.

## Open questions

- Open-grown conifer crown width / height was not found; `TREE_CROWN_WIDTH.conifer` is stylised.
- Weber & Penn's palm and balsam fir parameters (not in the paper's table). Palms here are built from the coconut's measurements instead.
- Jean's 92% Fibonacci figure is second-hand (the Smith College page didn't load).
- Far conifers from above cover 0.69 of their full plant's area, a deliberate trade for the low views they're seen from. A camera looking straight down from high up sees them a little thin until LOD 1 takes over.
- Per-plant level choice rewrites every batch at each rescan: ~12k instance matrices (770 KB) at most in the grove. Flying at the autopilot's 60 units/s that's ~15 uploads a second. Not measured on a phone.
