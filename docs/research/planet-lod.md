# Level of detail for the low-orbit globe

## Question

The low-orbit globe (`planet/PlanetGlobe.ts`) was one cube sphere of fixed detail: every part of the planet got the same triangles, whether under the UFO or on the far side, and a big planet needed more of them everywhere to look as fine near the ship. The user asked for level of detail, "perhaps a quad tree". Needed:

- the technique: how the cube sphere's faces become quadtrees, when a chunk splits, and how seams between chunks of different detail are kept closed;
- the numbers: chunk size, the split threshold, the deepest level, the build budget.

## Sources

Accessed 2026-09-30.

- **Steven Wittens, "Making Worlds 1: Of Spheres and Cubes"**, https://acko.net/blog/making-worlds-1-of-spheres-and-cubes/ (read via WebFetch): "Every face of the cube map becomes a quadtree, with each level splitting four ways to form the next level with more detail." Chunked LOD after Ulrich: each chunk has its own vertex data; the engine walks the quadtree each frame and picks a level per section. No thresholds given.
- **Cuberact, "Planet Chunked LOD"** (Godot), https://github.com/cuberact/godot-cuberact-planet-chunked-lod and https://www.cuberact.org/projects/planet-chunked-lod/ (README read via WebFetch): chunks are "a 17×17 grid on the sphere" (16 segments a side); a chunk splits when its angular size from the camera exceeds a threshold (default 10°), merges with "a slightly larger distance threshold than split" (hysteresis) so it doesn't flicker; "the system limits splits to a budget per frame (default: 8)"; cracks are covered with skirts ("an extra ring of triangles hanging below each chunk edge").
- **Ulrich's chunked LOD screen-space error**, as summarised on flylib.com / yaldex.com ("Chunked LODs", from *Core Techniques and Algorithms in Game Programming*), https://flylib.com/books/en/2.208.1.111/1/ (search result summary): ρ = δ / D · K with K = viewport width / (2·tan(fov/2)), D the distance to the chunk's bounding volume; each level has half its parent's error.
- **Crack fixing by index snapping** (GameDev.net threads "Terrain stitching" and "Terrain Lod and cracks", and the search summary of them), https://gamedev.net/forums/topic/713470-terrain-lod-and-cracks/: snap a chunk's edge vertices to the coarser neighbour's spacing, "so both edges run along the same line with no cracks or skirts, just degenerate triangles"; with neighbours at most one level apart this is a handful of index buffers per level.

## Measurements

Split threshold. The camera's vertical field of view is 65° (`core/Game.ts`), so at 720 px one radian is 720 / (2·tan 32.5°) = 565 px at the centre of the screen. The fixed globe's cells were ~2 units at Earth size (79 segments), seen from the default 45 units behind the UFO: 0.044 rad ≈ 25 px. A chunk splits when its cells look wider than `lodParams.cellAngle` = 0.05 rad (28 px), so after a split they are 14–28 px: the same facets as before under the UFO. This is Ulrich's ρ with the cell width as δ (a cell's worst deviation from the finer surface is below its width) and K dropped (the threshold is an angle).

Deepest level. `detailedTerrain`'s finest octave has frequency 11·2.3² = 58.2 with coefficients up to 2.1 per axis, so its fastest wiggle is ~122 rad⁻¹: a wavelength of 0.051 rad. At depth 4 a cell spans 0.0055 rad at a face's centre and corners and 0.0078 rad at the middle of its edges (`faceGridPoint`, measured), 7–9 cells per wavelength: the noise is resolved. Deeper levels only draw the same smooth noise with more triangles, so `lodParams.maxDepth` = 4 (0.55–0.78 units on an Earth-sized globe, 2.3–3.3 on the biggest gas giants).

Cracks. Moving a finer chunk's in-between edge vertices onto the coarser neighbour's straight edge closes the seam geometrically, but screenshots of a super-Earth still showed single-pixel holes along those seams (T-junctions: the rasteriser only guarantees no gaps between triangles that share both endpoints of an edge). Skirts, hung under every edge, filled them but z-fought with the surface along every seam (dotted lines at every chunk border, since the skirt's top edge is at the surface's depth and it's lit as a wall). Collapsing the in-between vertices onto the nearest coarse vertex (the index-snapping idea, done on the vertices so the index buffer stays the same) leaves no T-junctions: `tests/quadtree.test.ts` checks that every border segment of every drawn chunk near the camera is shared by exactly two chunks, with bit-identical endpoints (0 unmatched of >1000; with the snapping turned off, 864 unmatched), and the screenshots show no holes.

Triangles and speed, planet lab, the UFO's view (`camera: 'fly'`), 1280×720, headless SwiftShader:

| Planet | Fixed cube sphere | LOD |
|---|---|---|
| Earth-sized terran (gen=5) | 75k | 72k drawn |
| Super-Earth desert (gen=8), FPS | 148k, 7 FPS | 71k, 8 FPS |
| Gas giant (gen=8), FPS | 85k, 10 FPS | 36k, 10 FPS |

The first build of the globe went from 111 ms to 27 ms on the super-Earth (only the six root chunks and what the budget allows per frame; the rest is spread over the following frames at `lodParams.budgetMs` = 4 ms each).

Geomorphing. Every chunk vertex also stores where the parent's surface is at the same grid point: the parent's vertex itself (even i and j), the middle of the parent's cell edge (one of them odd), or the middle of the diagonal the parent split its cell along (both odd). A new chunk is drawn at those positions (colours too) and blends to its own over `lodParams.morphSeconds` = 0.4 s; before a merge the children blend back, and only then are they swapped for the parent. For the blended-back child to be the parent's surface exactly, its triangles must lie in the parent's: a child cell on its parent cell's diagonal is split along that same diagonal, the others take the shorter one (`cellDiagonal`); `tests/quadtree.test.ts` checks every child triangle lies in the plane of one parent triangle. In the lab, a super-Earth frozen at depth 0–1 with the camera moved close, then let split with the blending slowed to 100 s (14 → 39 chunks, depth 1–2), differs from the frame before by 0.44 of 765 in mean colour, with 0.02% of pixels off by more than 12; after blending in, by 9.8 and 29%. A chunk only splits once it has blended in, so every level takes at least 0.4 s.

Seams while blending. Two chunks of the same level blend their shared edge at the slower one's pace (same bits on both sides); a chunk collapsed onto a coarser one takes that one's current blended positions (its target along the edge is the midpoint of the vertices a step either side, rounded to 32-bit floats as stored). The watertight test runs every frame of a dive from 3 R to 1.09 R, a flight along and a climb out (it catches both: 32 open segments without following the coarser neighbour's blend, 4 without the rounding, 64 without sharing the same-level edges' pace).

The far side in the lab's wireframe. On a phone, close to an ice dwarf with the sun behind it, the wireframe showed a dense, bright mesh on the far side. That was the sea: a fixed 46-segment cube sphere, drawn whole, and WebGL draws a wireframe as lines, which are never back-face culled, so the far side of every sphere shows through. The terrain chunks there were depth 0–1 and not drawn (behind the horizon). The lab's wireframe now draws the solid surfaces into the depth buffer first, so hidden lines are gone, and the readout shows the chunks drawn and their depths.

## Game mapping

- `world/cubeSphereMath.ts`: the cube sphere's faces and mapping, and `faceGridPoint(face, i, j, n)`, whose cube coordinates (2i − n)/n give the same bits for a point whatever the grid (scaling i and n by a power of two doesn't change a quotient), so chunks of every level agree exactly on the points they share, on the same face or across the cube's edges.
- `planet/quadtree.ts` (pure): `CHUNK_CELLS` = 16 (Cuberact's 17×17), `cellAngle` (the split metric), `wantsSplit` with `MERGE_HYSTERESIS` = 0.8 (a split chunk merges back once its cells look 20% smaller than the threshold), `beyondHorizon` (a chunk hidden behind the planet: further round than the camera's horizon over the lowest ground plus the angle a peak can rise above it), `edgeNeighbour` (a point just past a chunk's edge, on whatever face it lands) and `snapTo`.
- `planet/LodSurface.ts`: the six quadtrees. Each frame it picks the chunks (split when `cellAngle` > the threshold, not below the horizon, above `maxDepth`), shows a chunk's children only once all four are built (so there are never holes), builds missing chunks by priority within the time budget, and on any change re-snaps the edges of every shown chunk that borders a coarser one. Chunks behind the horizon stay coarse and aren't drawn.
- Geomorphing in `LodSurface.write`: each frame, the shown chunks whose blend (or a neighbour's) changed are rewritten on the CPU from their sampled and parent positions; `parentTarget` and `cellDiagonal` in `quadtree.ts`.
- Tunables in the debug panel's **Planet LOD** folder (the lab has them under Game tunables): `cellAngle`, `maxDepth`, `budgetMs`, `morphSeconds`, `freeze` (stop refining, to fly around and look at what was built).

## Bigger globes (roadmap step 21)

The numbers above are at the original scale, an Earth-sized globe of radius 100. Step 21 made every globe 4× bigger next to the UFO (`EARTH_GLOBE_RADIUS` = 400, `GLOBE_SIZE_FACTOR` = 4 in `gen/planets.ts`). To keep the same look under the UFO, two things follow the factor:

- `lodParams.maxDepth` = 4 + log₂(factor) = 6: each level halves a cell, so two more levels bring the 4× cells back to 0.55–0.78 units on an Earth-sized globe.
- `detailedTerrain` gets one more octave per 2.3× (its lacunarity): 3 + round(log(4) / log(2.3)) = 5 (`DETAIL_OCTAVES`), so the finest wiggle stays ~5 units long rather than 20, and the cells above still resolve it 7–9 times.

Measured, same view as the table above (Earth-sized desert gen=8, the UFO's view, 1280×720 headless): 80k triangles at 1×, 108k at 2×, 123k at 3× and 143k at 4×, all 4–5 FPS in SwiftShader. More of the screen is ground, and that ground is detailed. In the game on desktop Chrome with a real GPU (the home system's super-Earth, 1767×1041), triangles per frame including the sky and the sea: 108k → 102k at the default zoom, 114k → 120k at the lowest, 88k → 72k at the top of the zoom, all at the display's 100 FPS.

## Smooth surfaces: the sea and gas giants (issue #73)

The water used to be a fixed 46-segment cube sphere (25,392 triangles), one mesh whose bounding sphere is the whole planet, so neither frustum nor horizon culling ever dropped any of it, and it's on the ground layer, so it was drawn twice a frame (the scene and the haze's depth pass): 50,784 triangles from anywhere. The lab's frozen view (PR #85) shows it plainly.

Now the water is a `LodSurface` of its own (a constant sampler at sea level, drawn first with `SEA_RENDER_ORDER`), so it gets the terrain's horizon culling and per-chunk frustum culling. A smooth surface has no facets whose size matters, so its chunks split by **geometric error** instead (Ulrich's measure, as above): a flat cell spanning θ of arc sags R·(1 − cos θ/2) ≈ θ/8 of its width inside the sphere, so seen from the camera the gap is `chordError` = cellAngle · θ / 8, and a chunk splits when that passes a threshold. Gas giants split the same way.

- **Outline** (`lodParams.outlineError` = 0.0018 rad, ~1 px at 720p by `cellAngle`'s measure: 0.05 rad ≈ 28 px): a giant's cloud tops are painted per pixel, so the sag only shows in the outline. From the UFO in the lab, a gas giant (gen=5) went from 57k triangles built and 99 chunks to 16k and 19, and the picture is the same.
- **Coast** (`lodParams.coastError` = 0.00045 rad, ¼ px): the sea shows the sag at every coast too, where the sea floor rises through it (the floor's height is 0 at the coast, so ground just under sea level pokes through a sagging chord, as faceted sea-coloured floor in shallow basins). Measured against the fixed sphere on an Earth-sized terran world (gen=8) at 1.6, 1.15 and 3 R, counting pixels more than 6% off (`compare -fuzz 6%`): at 1 px, 718 / 213 / 700, with the coastlines a pixel off all round and a shallow basin showing its floor; at ½ px 356 / 200 / 699; at ¼ px 213 / 175 / 234, about the noise of two runs (the map's ship marker, a few edge pixels).

Under an opaque sea, a terrain chunk whose every vertex (in both its own and its parent's shape, which it blends between; the seams only move vertices within those) is below sea level can't be seen, so `LodSurfaceOptions.hiddenBelow` leaves it undrawn (`ChunkBounds.top`). It still splits and merges as before, so an islet too small for a coarse chunk to catch comes up when the finer chunks are built.

Measured in the lab (Earth-sized ocean world gen=5, 1280×720, triangles a frame including the sky, clouds and haze; the water's share drawn twice):

| View | Before: total (water) | After: total (water) |
|---|---|---|
| 3 R | 111.5k (50.8k) | 75.1k (15.4k) |
| 1.3 R | 180.6k (50.8k) | 119.6k (28.7k) |
| 1.03 R | 181.4k (50.8k) | 103.0k (24.6k) |

And a gas giant (gen=5), whole frame: 21.3k → 17.2k, 38.4k → 17.9k, 29.2k → 20.0k at the same views (most of what's left is its 16k-triangle atmosphere shell).

## The lava sea, the atmosphere and the cloud sheet (issues #94, #95, #96)

These were the last fixed cube spheres in low orbit (16,428, 16,428 and 27,648 triangles), drawn whole from anywhere, the lava sea twice (it's on the ground layer, for the haze's depth pass).

- **Lava sea** (#94): its shader worked the broad flow out per vertex (`lavaFlow`, 3 simplex samples) and blended it across each triangle, so its glow would change as chunks split. It's now worked out per pixel, as the planet map already did, and the sea is a `LodSurface` like the water (`smooth: 'coast'`, `SEA_RENDER_ORDER`). The flow's finest term has a wavelength of about 0.2 rad, five cells of the old 37-segment sphere, so blending it per vertex was already close to exact: the picture is the same apart from the edges of the glowing rifts, a pixel or two sharper (an Earth-sized lava world at 3 R: 10.6k of 922k pixels more than 6% off, all along those edges). It still matches the system view's per-vertex paint across the zoom as before. Three noise samples more per pixel are small next to the crust's own (two noise samples and a Voronoi search per scale of cracks).
- **Atmosphere** (#95), option (a): the shell's shader integrates the haze per pixel but only passes positions on per vertex, so a coarser mesh would save little. It's cut into fixed patches instead (`world/spherePatches.ts`: 6 faces × 4 × 4, the cube sphere's exact vertices and triangles, one shared material), so three.js frustum-culls each, and from outside the patches whose every triangle faces away from the camera aren't drawn either (`SpherePatches.cullBehind`: beyond the horizon of the sphere through the triangles' planes, so no front face is ever dropped; `tests/spherePatches.test.ts`). From inside (the camera within the vertices' sphere) only the frustum culls. The haze's outline against space is unchanged, being the same triangles.
- **Cloud sheet** (#96), proposal step 1: the same patches at the same 48 segments, so the per-vertex drift and the storms' margin (`uNearMargin`) don't change and nothing shimmers. Off-screen patches are frustum-culled; above the sheet the far side's are skipped like the atmosphere's; from under it the whole sheet overhead stays. On puffy worlds, whose sheet only carries cyclones, dust, ash and lightning's glow, only the patches within reach of a sheet storm (its radius plus the margin) or a lit flash are drawn (`WeatherLook.cullSheet`). The puffs' own culling (#87) is as it was; skipping clusters outside the view as well (#96's optional step) is left for when the puffs show up in a measurement.

Measured in the lab, before and after, at 1280×720 with `?quality=low` in headless Chrome (SwiftShader), triangles a frame including everything (sky, ground, puffs, depth pass), the camera over lon 20°, lat 15° (the cyclone: over its eye, with the clock paused). In brackets the triangles each part costs, found by hiding its material for a few frames (rough: the ground's LOD moves a little meanwhile):

| World, view | Before: total (sea / air / clouds) | After: total (sea / air / clouds) |
|---|---|---|
| Lava world with a dust sheet (gen=1), 3 R | 92.6k (32.8k / 16.1k / 27.4k) | 48.8k (16.2k / 6.3k / 11.9k) |
| same, 1.3 R | 153.0k (32.7k / 16.4k / 27.6k) | 119.9k (26.6k / 13.5k / 3.8k) |
| same, 1.03 R | 151.8k (32.8k / 16.6k / 27.7k) | 113.0k (25.7k / 11.6k / 1.2k) |
| Lava world under an acid deck (gen=2), 3 / 1.3 / 1.03 R | 94.8k / 153.0k / 147.9k | 52.7k / 118.8k / 128.9k (under the deck at 1.03 R: its whole sky stays) |
| Puffy ocean world with a cyclone (gen=2), 3 / 1.3 / 1.03 R | 81.5k / 305.4k / 585.5k (clouds 33.6k / 32.0k / 31.0k) | 45.9k / 263.8k / 556.2k (clouds 7.7k / 6.1k / 7.1k) |
| Terran world (gen=8), 3 / 1.3 / 1.03 R | 48.1k / 206.6k / 295.6k | 38.4k / 191.3k / 290.6k |
| Ocean world (gen=5), 3 / 1.3 / 1.03 R | 52.7k / 156.3k / 131.4k | 42.8k / 152.7k / 125.0k |

Close to the ground most of the frame is the terrain, so the saving there is smaller in share. Frame rates under SwiftShader moved with the triangles from far (the lava world 4.1 → 6.6 FPS at 3 R, the cyclone 4.9 → 6.1) and within run-to-run noise up close (2–3 FPS either way): there the cost is per pixel. Screenshots before and after at the same moment differ in a few hundred pixels of 922k for the clouds and haze (the cyclone at 3, 1.3 and 1.03 R: 289, 193 and 379 more than 6% off), the noise of two runs.

## Open questions

- Where a chunk's edge collapses onto a coarser neighbour, the cells along that edge are triangulated differently from the parent's, so when a neighbour's level changes that one row of facets can shift slightly.
- The blending is timed, not tied to distance, so a chunk built late (flying fast) still blends in over 0.4 s rather than popping, but lags behind the camera a little.
- Neighbours more than 4 levels apart would be snapped only to every 16th vertex (the whole chunk edge); with the split metric changing by at most 2× per level between neighbours this hasn't been seen.
