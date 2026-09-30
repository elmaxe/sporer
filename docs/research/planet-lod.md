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

## Open questions

- Where a chunk's edge collapses onto a coarser neighbour, the cells along that edge are triangulated differently from the parent's, so when a neighbour's level changes that one row of facets can shift slightly.
- The blending is timed, not tied to distance, so a chunk built late (flying fast) still blends in over 0.4 s rather than popping, but lags behind the camera a little.
- The sea, lava sea and atmosphere are still fixed cube spheres (smooth, so they need far less detail than the terrain).
- Neighbours more than 4 levels apart would be snapped only to every 16th vertex (the whole chunk edge); with the split metric changing by at most 2× per level between neighbours this hasn't been seen.
