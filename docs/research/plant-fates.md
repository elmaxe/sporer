# What becomes of a plant set down on another world

## Question

Step 33 (the abduction beam) lets the player carry plants between bodies and set them down anywhere. Where it lands decides
whether it takes root or dies, and how (`src/cargo/plantFate.ts`). Needed:

1. The temperature at which wood ignites, so a plant set down on a world hotter than that burns (with oxygen) or chars (without).
2. Whether the heat limits plants already have in the game (`PLANT_KINDS[kind].temperature`, step 25) are where leaves really
   die of heat, so "too hot for it: it withers" can reuse them.
3. When there's too little air for a plant at all.

Precision: the trend and the right side of each threshold for the reference bodies; nothing the player reads as a number.

Reference cases: Earth (lives at its own latitudes, freezes at a pole, drowns in the sea), Venus (737 K under CO₂: chars),
the Moon (vacuum: withers), Titan (94 K: freezes), Mars (6 mbar, 210 K: freezes or withers), Io's lava (chars).

## Sources

- **Babrauskas, V. (2002), "Ignition of wood: a review of the state of the art", J. Fire Protection Engineering 12, 163–189**,
  read as the PDF at https://www.xylenepower.com/Ignition%20of%20Wood%20State%20of%20the%20Art_Vitto.pdf (pdftotext, accessed
  2026-10-02). Abstract: "the ignition temperature is around 250 °C for wood exposed to the minimum heat flux possible for
  ignition, and that it invariably ignites, at least initially, in a glowing mode under these conditions. The ignition temperature
  rises rapidly as the heat flux is increased. Piloted ignition at heat fluxes sufficient to cause a direct-flaming ignition
  normally occurs at surface temperatures of 300 – 365 °C." Table 5: autoignition at minimum flux 250 °C; piloted flaming 300–310 °C
  (hardwoods), 350–365 °C (softwoods). It also notes it does not cover living trees.
- **Heat tolerance of leaves (LT50, the temperature that kills half the leaf tissue)**:
  - Eight *Camellia* species: "the half-lethal temperature ranged from 50 °C to 57 °C" (scielo.org.ar,
    https://www.scielo.org.ar/scielo.php?script=sci_arttext&pid=S1851-56572012000200007, read from the raw page, accessed 2026-10-02).
  - Alpine conifers, from a search summary only (weaker): LT50 from 44.4 °C (*Picea abies*) to 48.4 °C (*Pinus cembra*) for 30 min
    exposures (ScienceDirect, "The dose makes the poison…", https://www.sciencedirect.com/science/article/pii/S0098847223001909).
- Water's triple point (611.65 Pa, 273.16 K), NIST via `docs/research/climate.md` (`WATER_TRIPLE_POINT` in `gen/climate.ts`).
- The latitude temperature model and the kinds' temperature windows: `docs/research/plants.md`.

## Measurements

The game's own code against the reference bodies (`tests/cargo.test.ts`, Sol's bodies from `gen/sol.ts`):

| Body, where | Local temperature | Air | Fate |
|---|---|---|---|
| Earth, 20° on land, a tree | 297 K | 1 bar N₂–O₂ | root |
| Earth, the pole, a tree | 262.7 K (a tree's floor, 268 ± 6 K less the 6 K slack, is 256–268 K) | | freeze or root, by species (a hardy shrub's floor is lower) |
| Earth, the equator's sea | 301 K | | drown |
| Earth, sea at 85° | 263 K < 273.16 K | | freeze (sea ice) |
| Venus | 737 K > 523 K | 92 bar CO₂, no oxygen | char |
| Io's lava | lava | next to none | char |
| The Moon, a comet | — | none | wither |
| Titan | 94 K | 1.5 bar N₂ | freeze |
| Mars | 210 K | 6 mbar, about the triple point | freeze or wither (either way, dead) |
| Jupiter | — | — | sink (into the clouds) |

The kinds' upper temperature limits (annual means, step 25) are 318 K (trees), 325 K (large bushes) and 330 K (small bushes):
45, 52 and 57 °C, inside the measured leaf LT50 range of 44–57 °C. So "past its species' window by the generator's 6 K slack:
it withers" is consistent with where leaves really die, and the window's lower edge plays the same part for frost.

## Game mapping

`plantFate(landing, world, latitude, species)`, in order:

1. Clouds (a gas giant): **sink**.
2. Lava: **burn** with oxygen (`oxygenNitrogen`), else **char**. Lava (~1100 °C) is far past 250 °C either way.
3. No air (no climate, composition `none`, or pressure below water's triple point): **freeze** in a sea, else **wither**
   (the plant's water boils or sublimes away).
4. Local temperature (`localTemperature`, the generator's latitude model) ≥ 523 K (250 °C, Babrauskas' minimum-flux ignition):
   **burn** with oxygen, else **char** (pyrolysis without flame).
5. Sea: **freeze** below 273.16 K (ice), else **drown** (a tree floats, waterlogs and sinks; shown as toppling, floating, rotting
   brown and going under).
6. Under an acid sky (`weatherKind` = `acid`): **dissolve**.
7. Colder than its species' window less 6 K: **freeze**; hotter than it plus 6 K: **wither**. The 6 K is the generator's own
   (`temperatureWeight` reaches 0 there), so a plant lives where its own kind could have grown.
8. No starlight (a rogue planet): **wither**.
9. Otherwise it **takes root**, recorded in the body's change list (`SurfaceChanges.planted`) and drawn by `surface/Plantings.ts`.

Stylised: the fates play out in seconds; the beam's speeds and the fall's 30 units/s² are the same on every body (`beamParams`).

## Open questions

- Burning needs more than ignition temperature: a living, wet plant takes longer to ignite than dry wood, and Babrauskas'
  review excludes living trees. The threshold is a stand-in for "hot enough to ignite".
- Acid: Venus's sulphuric-acid rain evaporates before it reaches the ground (`docs/research/weather.md`), and real acid-deck
  worlds are far past ignition anyway, so **dissolve** only shows on a cooler acid world (the lab, or terraforming later).
- The alpine-conifer LT50 values come from a search summary, not the paper itself.
