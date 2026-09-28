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

### 3. ⬜ Scene manager + galaxy map
- `SceneManager` owns the active level. Transitions animate the camera and crossfade, and input is blocked while one runs.
- Galaxy scene: thousands of stars as instanced points/sprites coloured by type, spiral structure, the current star highlighted, and hover shows the star's name/type.
- Scroll out past a threshold in a system → the galaxy view, framed on the current star. Click a star → the ship travels there. Scroll in → enter that star's system.
- Done when the full loop works: system → galaxy → pick star → travel → zoom into the new, generated system.

**Implementation notes (proposed design; confirm with the user before building):**

*Levels* (`src/levels/`):
- A `Level` owns its own `THREE.Scene`, entity list and (optionally) physics world, and exposes the same hooks as `Entity` plus `enter()` / `exit()`. `Game` keeps the renderer, camera, input and fixed-step loop, but runs and renders only the active level's entities and scene (today they live directly on `Game`: `scene`, `entities`, `physics`).
- `SystemLevel`: what `main.ts` builds today (`StarSystem`, `Ship`, `OrbitCamera`, `Picker`, `TargetMarker`, `Hud`, `Starfield`) for one `StarRef`, with its own Rapier world. Keep the current system's level alive while in the galaxy (zooming straight back in returns to the same state); dispose it when entering a different star.
- `GalaxyLevel`: no physics. `SceneManager` switches between them and owns the current `StarRef`.

*Galaxy view* (galaxy units, `GALAXY_RADIUS = 1000`, 4000 stars by default):
- All stars in one `THREE.Points` with a small ShaderMaterial: per-point colour (`StarRef.stars[0].color`) and size from star kind (giants bigger, dwarfs smaller), additive, round soft sprite in the fragment shader, `toneMapped: false`. Binaries could get a slightly larger point.
- Current star: a highlighted ring (reuse the `TargetMarker` look). The ship is a small icon/marker at the current star.
- Camera: the same `OrbitCamera` rig with galaxy distances (e.g. min ~5, max ~2500), centred on the ship marker. Hover picks the nearest star to the pointer ray within ~8 px (brute force over 4000 points is fine; only recompute when the pointer moves). Tooltip: star name + `describeStar` (+ "binary").
- Click a star: the ship marker travels there in a straight line at a fixed galaxy speed (scripted, not physics) and the current star updates on arrival. Clicking empty space does nothing.

*Transitions:*
- In a system, wheel-zoom beyond `cameraParams.maxDistance` (accumulate the extra wheel; ~one notch past max) triggers system → galaxy. In the galaxy, zooming in below min distance while the ship sits at a star triggers galaxy → that system (generate on demand with `generateSystem(ref)`, spawn at `spawnDistance`).
- Animate as one zoom: keep zooming the camera out/in for ~0.6 s, fade a full-screen CSS overlay to black at the midpoint, swap levels, frame the new level (galaxy: close to the current star; system: from far out, zooming in), fade back. Input (wheel, clicks, WASD) is ignored while a transition runs.
- HUD: location line shows the galaxy or system name; help text changes per level.

*Tests / smoke:*
- Unit-test pure pieces (star size/colour by kind, point picking math if it's pure).
- Smoke: expose the scene manager in dev (e.g. `window.levels`). Go to the galaxy, pick a different star (programmatically or by clicking its projected position), wait for travel, zoom in, and assert the new system's name/star id and that the ship exists. Keep the existing system checks.

### 4. ⬜ Planet approach (low orbit)
- Getting close to a planet (zooming in or flying at it) moves smoothly to the planet scene.
- Planet scene: a large, detailed terrain sphere built from the planet's data (oceans, mountains, colours, atmosphere glow), with the ship hovering in low orbit and using the same click-to-move over the globe.
- Zooming out returns to the system, next to that planet.
- Done when the full loop works for every planet type.

## Later / ideas

- Abduction beam, spice economy, colonising planets
- Other empires and diplomacy
- Save/load (only the seed + player state are needed)
- Audio
