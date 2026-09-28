# Roadmap

Spore-style space stage in the browser. Each step leaves the game playable and is verified (`typecheck`, `test`, `build`, `smoke`) before it is pushed to `main`.

Status: ⬜ todo · 🟨 in progress · ✅ done

## Design decisions

- **Controls (Spore-style):** left-click a planet, star or point in space to autopilot there. Scroll to zoom the camera, right-drag to orbit it. WASD stays as a manual nudge.
- **Scroll moves between levels:** zooming out past a system shows the galaxy, and zooming in on a planet goes down to low orbit.
- **One scene per scale** (galaxy / system / planet), each with its own THREE scene and physics world at a comfortable scale. This avoids floating-point jitter. A scene manager does the transitions (camera move + crossfade) so each one reads as a single continuous zoom.
- **Procedural and deterministic:** one galaxy seed produces everything. Generation is pure data (no THREE), unit-tested, and runs only when a place is visited, so a system is identical every time you return.

## Steps

### 1. ⬜ Generation foundation
- Seeded PRNG (no `Math.random` in generation) with helpers: range, int, pick, weighted pick, gaussian.
- Data model: `Galaxy` → `StarRef` (id, position, type, seed) → `SystemData` (1–2 stars, planets, moons) → `PlanetData` (type, radius, colours, terrain params, rings).
- Star types: main sequence by spectral class (O B A F G K M, realistic colours and frequencies), red dwarf, white dwarf, red giant, and binary (twin) systems.
- Planet types: lava, rocky/barren, desert, ocean/terran, ice, gas giant (bands, optional rings). Moons around planets.
- Galaxy layout: spiral arms plus a central bulge.
- Done when the unit tests prove determinism (same seed → same output), the type distributions look sensible, and the current system is generated from a seed instead of the hard-coded `HOME_SYSTEM`.

### 2. ⬜ System from data + Spore-style controls
- System scene built from `SystemData`: binary stars orbiting each other, giant/dwarf visuals, gas giant bands and rings, moons orbiting planets.
- Orbit camera: scroll to zoom, right-drag to rotate, always centred on the ship.
- Click to move: raycast to planets/stars or to the ecliptic plane. The autopilot steers with impulses and arrives smoothly. Clicking a planet parks the ship next to it. A target marker shows the destination.
- WASD nudge in camera-relative directions.
- Done when you can click around a generated system, zoom and rotate, and there are no regressions in the smoke test (updated for the new controls).

### 3. ⬜ Scene manager + galaxy map
- `SceneManager` owns the active level. Transitions animate the camera and crossfade, and input is blocked while one runs.
- Galaxy scene: thousands of stars as instanced points/sprites coloured by type, spiral structure, the current star highlighted, and hover shows the star's name/type.
- Scroll out past a threshold in a system → the galaxy view, framed on the current star. Click a star → the ship travels there. Scroll in → enter that star's system.
- Done when the full loop works: system → galaxy → pick star → travel → zoom into the new, generated system.

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
