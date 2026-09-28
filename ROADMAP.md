# Roadmap

Spore-style space stage in the browser. Each step leaves the game playable and is verified (`typecheck`, `test`, `build`, `smoke`) before it is pushed to `main`.

Status: ⬜ todo · 🟨 in progress · ✅ done

## Design decisions

- **Controls (Spore-style):** left-click a planet, star or point in space to autopilot there. Scroll to zoom the camera, right-drag to orbit it. WASD stays as a manual nudge.
- **Scroll moves between levels:** zooming out past a system shows the galaxy, and zooming in on a planet goes down to low orbit.
- **One scene per scale** (galaxy / system / planet), each with its own THREE scene and physics world at a comfortable scale. This avoids floating-point jitter. A scene manager does the transitions (camera move + crossfade) so each one reads as a single continuous zoom.
- **Procedural and deterministic:** one galaxy seed produces everything. Generation is pure data (no THREE), unit-tested, and runs only when a place is visited, so a system is identical every time you return.

## Steps

### 1. ✅ Generation foundation
- Seeded PRNG (no `Math.random` in generation) with helpers: range, int, pick, weighted pick, gaussian.
- Data model: `Galaxy` → `StarRef` (id, position, type, seed) → `SystemData` (1–2 stars, planets, moons) → `PlanetData` (type, radius, colours, terrain params, rings).
- Star types: main sequence by spectral class (O B A F G K M; stylised colours, frequencies weighted for variety rather than realism), red dwarf, white dwarf, red giant, blue giant, and binary (twin) systems.
- Planet types: lava, rocky/barren, desert, ocean/terran, ice, gas giant (bands, optional rings). Moons around planets.
- Galaxy layout: spiral arms plus a central bulge.
- Done when the unit tests prove determinism (same seed → same output), the type distributions look sensible, and the current system is generated from a seed instead of the hard-coded `HOME_SYSTEM`.
- Result: `src/gen/`. `?seed=` / `?star=` URL params. Moons, rings, gas bands and atmospheres are generated but **not rendered yet**; that's step 2.

### 2. ✅ System from data + Spore-style controls
- System scene built from `SystemData`: binary stars orbiting each other, giant/dwarf visuals, gas giant bands and rings, moons orbiting planets.
- Orbit camera: scroll to zoom, right-drag to rotate, always centred on the ship.
- Click to move: raycast to planets/stars or to the ecliptic plane. The autopilot steers with impulses and arrives smoothly. Clicking a planet parks the ship next to it. A target marker shows the destination.
- WASD nudge in camera-relative directions.
- Done when you can click around a generated system, zoom and rotate, and there are no regressions in the smoke test (updated for the new controls).
- Result: `Planet` renders moons (via `parent`), gas bands (finer sphere, smooth normals), rings (vertex RGBA with seeded gaps, unlit) and a fresnel atmosphere shell; `PlanetData.tilt` added (drawn last, so no other generated values changed). Star glow is a camera-facing billboard (a `Sprite` poked through the star when off-centre). Stars, planets and moons implement `CelestialBody`. Controls live in `src/player/`: `OrbitCamera` (left **or** right drag rotates), `Picker` (analytic sphere picking with a minimum angular radius so small moons stay clickable), `TargetMarker`, and `Ship` with the pure steering in `autopilot.ts`: arrive steering with damping compensation, standoff parking that keeps station next to a moving body, and a detour waypoint around bodies in the way (without it the ship flew straight into the sun). Hover tooltip and autopilot status are in the HUD. The smoke test also checks the autopilot and star picking.

### 3. ✅ Scene manager + galaxy map
- `SceneManager` owns the active level. Transitions animate the camera and crossfade, and input is blocked while one runs.
- Galaxy scene: thousands of stars as instanced points/sprites coloured by type, spiral structure, the current star highlighted, and hover shows the star's name/type.
- Scroll out past a threshold in a system → the galaxy view, framed on the current star. Click a star → the ship travels there. Scroll in → enter that star's system.
- Done when the full loop works: system → galaxy → pick star → travel → zoom into the new, generated system.

- Result: `src/levels/` (`Level`, `SystemLevel`, `GalaxyLevel`, `SceneManager`) and `src/galaxy/`. `Game` now renders only the active level; each system level has its own Rapier world (`Physics.init()` once, then `Physics.create()` per level). The system level stays alive while you're in the galaxy (zooming straight back in resumes it, autopilot included) and is rebuilt when you enter a different star. `OrbitCamera` takes per-level params and reports "scrolled past the limit" (~2 notches after reaching it); transitions are a log-space camera zoom plus a CSS fade (`#fade`), with input blocked. Galaxy: 4000 stars in one `Points` shader (size from star radius, min 2 px), disc + bulge glows, rings for the current/destination/hovered star, scripted travel with the same arrive steering (150 u/s). The URL's `?star=` follows the current system, so a reload returns there. Wheel zoom is faster now (`zoomSpeed` 0.0025). The smoke test runs the whole loop with real wheel and pointer events.

### 4. ⬜ Planet approach (low orbit)
- Getting close to a planet (zooming in or flying at it) moves smoothly to the planet scene.
- Planet scene: a large, detailed terrain sphere built from the planet's data (oceans, mountains, colours, atmosphere glow), with the ship hovering in low orbit and using the same click-to-move over the globe.
- Zooming out returns to the system, next to that planet.
- Done when the full loop works for every planet type.

**Implementation notes (proposed design; confirm with the user before building):**

*Entering and leaving* (`SceneManager.toPlanet(body)` / back to the system):
- In a system, scrolling in past the min zoom while the ship is parked at (or within ~2× the standoff of) a planet or moon enters that body's `PlanetLevel`. Anywhere else, scrolling in past min does nothing.
- Out phase: the system camera flies at the body, not the ship. Give `OrbitCamera` an optional focus override (a `Vector3` it looks at and orbits instead of the target), which `SceneManager` blends from the ship to the body while zooming to ~1.5× its radius, with the fade. In phase: the planet camera starts high (~3 R) and settles at low orbit.
- Scrolling out past the planet level's max → back to the system level (kept alive, like the galaxy trip), with the ship parked beside the body on the side it left from.

*Planet level* (planet units: the body is rescaled to R = 100 whatever its system radius):
- Terrain: a pure `detailedTerrain(x, y, z, seed)` in `gen/noise.ts` = `terrainNoise` (so continents match the system view) + 2–3 higher-frequency octaves at small amplitude. Unit-test that the large scale matches `terrainNoise`.
- Mesh: move the `Planet` geometry builders (terrain, gas bands, rings, atmosphere) into a shared module taking a `detail` argument. Planet level uses a much finer icosphere (detail ~60: 20·61² ≈ 74k triangles) plus a flat sea sphere at sea level for water worlds, and the same atmosphere shell (rescaled). Gas giants: the same banded sphere, finer (low orbit over the clouds).
- Light: one `DirectionalLight` coming from the star's direction (planet position → star in system space) plus the hemisphere ambient. The star itself can be a glow billboard far away in that direction.
- Ship: scripted, no Rapier needed yet. State = unit direction on the sphere + altitude (~0.12 R above the surface). Click the globe (ray–sphere) to autopilot along the great circle using the same arrive steering on arc length. WASD nudges in the tangent plane relative to the camera. The UFO's up is the local radial direction.
- Camera: the same orbit rig, but with `up` = the ship's radial direction (add an `up` option to `OrbitCamera`; yaw/pitch are relative to the local tangent plane).
- HUD: planet name + `describePlanet`, help text for the level.

*Tests / smoke:*
- Unit-test great-circle stepping (stays on the sphere, arrives, shortest way round) and `detailedTerrain`.
- Smoke: park at a planet via `ship.moveTo(world.planets[i])`, scroll in → `levels.mode === 'planet'`; click the globe and check the ship moved over the surface; scroll out → back in the system beside the same planet. Run for each planet type via a few `?star=` values (the roadmap's "done" criterion).

## Later / ideas

- Abduction beam, spice economy, colonising planets
- Other empires and diplomacy
- Save/load (only the seed + player state are needed)
- Audio
