# Puffy clouds: cumulus clusters instead of a cloud sheet

## Question

Issue #68: on Terran worlds the clouds were one noise-textured sphere wrapped round the planet at a fixed height (`world/weatherLook.ts`). It floated visibly off the limb, looked flat up close, and its cover read as most of the globe. The task was to find an efficient way to draw clouds that have volume, and to leave clear sky between them. That needs:

1. **A rendering technique** cheap enough for phones (WebGL2, the game's whole frame budget) that gives clouds volume and parallax.
2. **Real cloud shapes and sizes** to stylise from: cumulus width, depth and aspect ratio; cloud-base heights; cumulonimbus stems and anvils; how cloud sizes are distributed.

It feeds `gen/cumulus.ts` (pure: clusters, towers, the sprite atlas) and `world/cumulusLook.ts` (the instanced sprites). `gen/weather.ts` still decides which bodies have weather, how cloudy they are (`coverage`, docs/research/weather.md) and their storms.

Precision: the right shapes and trends (flat bases, domed tops, darker undersides, many small clouds and a few big ones, towers reaching the tropopause with anvils far wider than their stems). Sizes are stylised against the 4-unit UFO, like everything in the planet level.

## Sources

All accessed 2026-10-03. PDFs were read as text with `pdftotext`. cloudatlas.wmo.int could not be reached (an expired TLS certificate, then HTTP 503), so the WMO atlas's cumulus humilis and mediocris thicknesses are not checked here.

### Rendering

- **Wang 2003/2004, "Realistic and Fast Cloud Rendering"** (Microsoft Flight Simulator 2004). Article: https://www.gamedeveloper.com/game-platforms/let-there-be-clouds-fast-realistic-cloud-rendering-in-i-microsoft-flight-simulator-2004-a-century-of-flight-i-; slides: https://media.gdcvault.com/gdc04/slides/realistic_and_fast_cloud.pdf
  - "We model each cloud as five to 400 alpha-blended textured sprites" (the slides say "5 – 50"), from "16 32-bit textures" on one 512×512 sheet.
  - Shading: "We chose not to simulate scattering… The two factors… are skylight and sunlight." Ambient colour by height on the cloud ("Clouds have dark bottoms"). Directional light per shading group: "the vector to that point from the shading group center… the vector from the group center to the sun and compute the dot product".
  - "We render them back-to-front based on distance to the camera." Popping as sprites swap order was judged "not… jarring enough".
  - "15 to 60 frames per second… 700MHz through 3.0GHz", "main bottleneck is in overdraw", with a single-sprite-per-cloud fallback.
- **Harris 2002** (GDC; the method of Harris & Lastra 2001), https://lawlor.cs.uaf.edu/~olawlor/academic/thesis/ref/RTCloudsForGames_HarrisGDC2002.pdf: particle clouds drawn as "polygons textured with a Gaussian 'splat' texture", sorted by distance from the eye. Multiple forward scattering is precomputed (5–10 s per light). Without impostors "even a scene with ten or twenty thousand particles is prohibitively slow".
- **Schneider & Vos 2015, "The Real-time Volumetric Cloudscapes of Horizon Zero Dawn"** (SIGGRAPH Advances), https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf
  - Ray-marched: "an initial potential 64 samples and end with a… potential 128 at the horizon", plus "6 light samples per march in a cone".
  - "The approach that I have described so far costs around 20 milliseconds." Reaching ~2 ms took a quarter-resolution buffer updating "1 out of 16 pixels for each 4x4 pixel block", with reprojection.
  - Cheap shading terms: "Beer's Law E = e^(−d)" and "Powder E = 1.0 - e^(−d*2)". The Henyey-Greenstein phase "is responsible for the silver lining in clouds".
- **Schneider 2017, "Nubis"**, https://advances.realtimerendering.com/s2017/Nubis%20-%20Authoring%20Realtime%20Volumetric%20Cloudscapes%20with%20the%20Decima%20Engine%20-%20Final%20.pdf: "Without any optimizations except temporal reprojection, Our shader takes 22ms to draw on the Standard PS4 Hardware". With all of them, 1.2 ms.
- **Toft, Bowles & Zimmermann 2016**, https://arxiv.org/pdf/1609.05344: GTX 1080 at 1920×1080, "Full, 128 steps 297.7" ms against "Half, 8 steps 2.3" ms.

### Real clouds

- **Stull, *Practical Meteorology***:
  - §6.6, https://geo.libretexts.org/Bookshelves/Meteorology_and_Climate_Science/Practical_Meteorology_(Stull)/06:_Clouds/6.06:_Cloud_Sizes: "Cumuliform clouds typically have diameters roughly equal to their depths… a fair weather cumulus cloud typically averages about 1 km in size, while a thunderstorm might be 10 km."
  - §6.2: cumuliform clouds "frequently have cloud bases within 1 or 2 km of the ground"; "aspect ratio of about one". Table 6-1 gives low clouds "sfc. - 2" km and the tropopause at "Polar 8, Midlatitude 11, Tropical 18" km.
  - §14.1: a cumulonimbus has a "stem of diameter roughly equal to its depth (of order 10 to 15 km)"; its anvil "can be 100 km wide (crosswind) and 300 km long (downwind)".
  - §4.1: cloud base at the lifting condensation level, z_LCL = 0.125 km/°C · (T − T_d).
- **Met Office cloud-spotting guide**, https://artsandculture.google.com/story/cloud-spotting-met-office-national-meteorological-archive/vgVBNLKOydI4FQ: "Humilis - wider than they are tall / Mediocris - as wide as they are tall / Congestus - towers".
- **Lu et al. 2021, ACP 21, 11979** (CALIPSO cloud-base heights), https://acp.copernicus.org/articles/21/11979/2021/: subtropical oceans "300–400 to 800–900 m"; tropical rain forests ~1200 m; drier tropical land "1500–2000 m".
- **Wood & Field 2011, J. Climate**, https://atmos.uw.edu/~robwood/papers/cloudsize/2011JCLI4056.pdf: cloud sizes follow "a single power-law relationship with an exponent of b = 1.66 ± 0.04 from 0.1 to 1500 km or more", n(x) = a·x^−b. Clouds of "200 km or more constitute approximately 50% of the cloud cover".

## Measurements

**Cost.** A ray-marched volume costs 20–22 ms per frame on a PS4 or a GTX 1080 before heavy optimisation, against a phone frame of 16.7 ms that also has to draw everything else. Sprites cost a few thousand quads plus their overdraw. The game draws at most `MAX_PUFFS` = 6000 sprites per body, in one instanced draw call. Only the puffs on the camera's side of the horizon are written each frame, typically about half. Their shader does one texture fetch per pixel plus a few multiply-adds.

**Real ratios behind the stylised shapes:**

| Quantity | Real | Game |
|---|---|---|
| Cumulus aspect (depth / width) | humilis < 1, mediocris ≈ 1 (Stull, Met Office) | dome 0.35 × the cluster's width, at most 2 puff radii above its base puffs (clusters are drawn far wider than real ones, so they keep humilis's flatter shape) |
| Cloud base above the ground | 0.3–2 km (Stull, Lu et al.) ≈ 0.005–0.03% of Earth's radius | 1.8% of the globe radius, at least 8 units (12 on an Earth-sized globe, 3 UFO widths): high enough for the UFO to fly under, low enough to sit in the air glow rather than float off the limb |
| Cumulonimbus stem | diameter ≈ depth (Stull) | radius 0.5 × its height (diameter = height) |
| Anvil | ~100 km wide against a 10–15 km stem (Stull) | radius 1.6 × the tower's height (stylised down so it stays a cloud, not a sheet) |
| Tower top | the tropopause (8–18 km) | the weather's cloud layer (`cloudRadius`), where cyclones also are |
| Size distribution | n(x) ∝ x^−1.66 (Wood & Field) | cluster span drawn from x^−1.66 over 2–7 puff radii |

**Over 1500 systems** of the default galaxy (`cumulusField` on every body with puffy weather; `drawnCover` on the first 60 water worlds, averaged over three moments):

```ts
// npx vite-node stats.ts (paths from the repo root)
import { generateGalaxy } from './src/gen/galaxy';
import { generateSystem } from './src/gen/system';
import { weatherOf } from './src/gen/weather';
import { cumulusField, drawnCover, hasCumulus, stormChannels, TOWER_PUFFS, CUMULUS_SHARE } from './src/gen/cumulus';
import { globeRadius } from './src/planet/frame';
// For each solid planet and moon of the first 1500 stars: w = weatherOf(b, globeRadius(b.radius), 1.6); if hasCumulus(w),
// f = cumulusField(w) and print coverage, f.puff, f.puff / R, f.clusters and f.clusters · f.meanPuffs + TOWER_PUFFS · stormChannels(w)
// as p10 / p50 / p90. For 60 water worlds: mean of drawnCover(f, t, () => R, 6000) at t = 100, 900, 2500, and that over CUMULUS_SHARE · coverage.
```

| Kind | Bodies | Weather's cover | Puff radius (units) | Puff / R | Clusters | Puffs needed |
|---|---|---|---|---|---|---|
| water | 1354 | 0.29 / 0.37 / 0.46 | 10.0 / 14.9 / 21.9 | 0.031 / 0.035 / 0.040 | 231 / 244 / 244 | 5703 / 6008 / 6008 |
| methane | 103 | 0.05 / 0.06 / 0.07 | 10.0 / 10.0 / 12.1 | 0.020 / 0.024 / 0.034 | 40 / 80 / 125 | 1078 / 2017 / 3075 |

(p10 / p50 / p90.) Spans, in puff radii, at the 10th / 50th / 90th / 99th percentiles: 2.18 / 3.30 / 5.83 / 6.87. "Puffs needed" can pass `MAX_PUFFS` (6000) by a little. Only the near hemisphere is written each frame (about half), and the writer stops at the buffer's end anyway.

**Cover drawn.** `drawnCover` is the share of the sphere under the puffs' opaque cores (3/4 of each radius, thinner while a cluster forms or evaporates).
- At the first guess of `CLUSTER_FILL` = 0.6, it came out at a third of what the footprints promised. The puffs bunch towards a cluster's middle, and clusters spend a third of their lives thin.
- Measured, the fill is 0.15: drawn / (CUMULUS_SHARE · coverage) = 0.84 / 0.92 / 0.99.
- Water worlds' drawn cover is **0.17 / 0.19 / 0.24 of the globe**. That counts the puffs at their own size. From orbit the view softens them and draws them up to 1.5× bigger (see Game mapping), so the patches there look somewhat cloudier than this. That was judged by eye, not measured.
- The old sheet drew the whole `coverage` (median 0.37) as opaque cloud, plus soft fringes beyond it. Its density was a threshold at 1 − cover on uniform noise, softened 0.1 below. So the clusters cover about half as much, and that half is gathered into fronts with clear sky between.

## Game mapping

- **Technique** (Wang's, simplified): every puff is a camera-facing sprite from a 2 × 2 atlas of lumpy puffs baked once (`puffAtlas`), drawn in one instanced call (`CumulusClouds`). Per puff, in the vertex shader:
  - the planet's day and dusk under it (as the old sheet did);
  - the dark base: ambient by height in the cluster, 0.6 at the base to 1 at the top, as Wang's "dark bottoms";
  - self-shadowing: the dot product of the puff's offset from its cluster's middle with the sun direction, as Wang's shading groups;
  - a forward-scattering term that brightens thin edges with the sun behind (a stand-in for the Henyey-Greenstein silver lining);
  - lightning glow from the weather's flashes.
  
  Per pixel, the sprite is lit as the near half of a ball. Clusters are sorted back to front each frame by distance to the camera, and puffs within a cluster bottom-up (seen from above) or top-down (from below). Puffs fade out as the camera flies into them. Night-side puffs are partly see-through so they don't blot out the air's glow at the limb.

  Seen from orbit, two more adjustments:
  - Puffs that are small on screen (under ~2–9% of the view's half-height) are drawn softer and up to 1.5× bigger, so a cluster merges into one patch instead of a scatter of white dots.
  - Level of detail per cluster: below an angular size of 0.08 rad (span over distance), a cluster draws a share of its puffs, spread evenly over its height and up to 2.5× bigger, down to two at 0.008 rad. The system view's star 0 (two water worlds) went from ~9600 sprites to ~900. Under headless software rendering at `?quality=low`, the system view went from 6 fps back to 11 (13 on main without puffy clouds). Low orbit runs at 4 fps on both branches.
  - Puffs seen edge-on at the limb thin out when the camera is more than ~1.25–1.8 radii from the centre, so the clouds don't stand round the planet as a fuzzy rim (the old sheet's look). Low orbit keeps its towering clouds on the horizon.
- **Clusters** (`cumulusCluster`):
  - **Channels.** A body has `clusters` channels, each holding one cluster per time slot of 1.5–3 × the weather's `change` time. A cluster billows up over the first quarter of its slot and evaporates over the last third, so the sky renews itself without popping.
  - **Placement.** Clusters are born where a slowly drifting front field is high. On water worlds the field is also weighted to the cloudy equator and ±60° and the clear ±30° (weather.md's zonal pattern).
  - **Shape.** A dome of puffs on a flat base, stretched along the wind.
  - **Base.** 1.8% of the radius above the highest ground under the cluster, worked out at 9 steps along its drift path and interpolated, so clouds over mountains sit higher and never clip a ridge.
- **Towers** (`towerCluster`): each thunderstorm cell (`gen/weather.ts`) becomes a cumulonimbus. Its stem runs from the cloud base up to the cloud layer, where a wide, flat anvil is drawn out downwind. It rises and fades with the storm's strength. Rain and bolts (`planet/Weather.ts`) are unchanged and fall through it.
- **The sheet** stays for what is sheet-like: Venus decks, dust and global dust storms, ash clouds and cyclones (which look flat from orbit). On puffy worlds it has no fair-weather cloud and draws no thunderstorm cells. It is hidden altogether while nothing is on it.
- **Cover**: the clusters draw `CUMULUS_SHARE` = 0.6 of the weather's `coverage` (itself 60% of Earth's MODIS fraction, weather.md), measured with `drawnCover`. That is about a fifth of a Terran globe: the issue asked for clear sky, not a blanket. Clusters are born where a front field is high, accepted with probability c², which gathers them into fronts.
- **Budget**: puffs are at least `PUFF_UNITS` = 10 units in radius (2.5 UFO widths; real cumulus are ~1 km against the game's 64 km UFO), or 2% of the radius on small globes. They grow when a body's cover would need more than `MAX_PUFFS`, keeping room for the towers. The system view draws the same puffs scaled down.

## Open questions

- No ground shadows: clouds don't darken the terrain under them. That would need the terrain material to read the clusters, a bigger change.
- The cumulus humilis and mediocris depth ranges from the WMO atlas were not checked (site down). The aspect ratio comes from Stull and the Met Office instead.
- Sorting is per cluster, not per puff, so where two clusters overlap on screen, one is drawn wholly over the other. This is the popping Wang accepted.
- The sort order uses the camera of the last frame drawn (attributes are uploaded before `onBeforeRender` runs), so it lags one frame. Positions follow the current clock.
