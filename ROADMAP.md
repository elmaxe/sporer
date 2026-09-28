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

### 2. ⬜ System from data + Spore-style controls
- System scene built from `SystemData`: binary stars orbiting each other, giant/dwarf visuals, gas giant bands and rings, moons orbiting planets.
- Orbit camera: scroll to zoom, right-drag to rotate, always centred on the ship.
- Click to move: raycast to planets/stars or to the ecliptic plane. The autopilot steers with impulses and arrives smoothly. Clicking a planet parks the ship next to it. A target marker shows the destination.
- WASD nudge in camera-relative directions.
- Done when you can click around a generated system, zoom and rotate, and there are no regressions in the smoke test (updated for the new controls).

**Implementation notes (agreed design; binary stars already render since step 1):**

*Rendering the generated data* (`src/world/`):
- **Moons:** reuse `Planet` with an optional parent. The moon's position = the parent's interpolated position + `orbitPosition(moon.orbit)`, and its kinematic body follows it in `fixedUpdate` (the parent must update first). `MoonData` already satisfies `PlanetConfig`.
- **Gas giants:** `PlanetData.bands` → latitude-based vertex colours (band index from `dir.y`, wobbled by `terrainNoise`) instead of terrain height. Smooth shading, no relief.
- **Rings:** `RingGeometry(rings.inner, rings.outer)`, semi-transparent (`rings.opacity`), double-sided. Tilt with the planet (give planets a small axial tilt via their seed).
- **Atmosphere:** `PlanetData.atmosphere` → a slightly larger back-face sphere with an additive fresnel rim (small ShaderMaterial).
- **Stars:** the G star currently looks beige/washed out from ACES tone mapping. Use `toneMapped: false` on star materials. Give giants a larger, softer glow.

*Controls* (replace pointer-lock flight; `ChaseCamera` → orbit rig):
- `Input`: drop pointer lock. Track mouse buttons, wheel delta, pointer position in NDC and click-vs-drag (a click is a press with less than ~5 px of movement). `preventDefault` on `contextmenu` and `wheel`.
- **Orbit camera rig:** spherical coordinates (yaw, pitch, distance) around the ship's interpolated position. Wheel changes distance exponentially (min ~12, max ~2500 system units; step 3 hooks "zoom past max" to go to the galaxy). Right-drag changes yaw/pitch (clamp pitch). Smooth damping on all three.
- **Picking:** raycast the pointer against pickable meshes (`userData.pick = { kind, entity }` on stars, planets and moons). On a hit, the target is that body with standoff = `extent`/`radius` + margin; it tracks the moving body. On a miss, intersect the horizontal plane at the ship's y → point target.
- **Autopilot** (in `Ship.fixedUpdate`): arrive steering. `desired = dir * min(maxSpeed, dist * gain)`; `impulse = clampLength(desired - vel, thrust * dt)`. The ship yaws to face its velocity (slerp). Clear the target on arrival (speed and distance under threshold).
- **WASD** = camera-relative nudge (forward = camera forward projected onto the plane). Any WASD input cancels the autopilot. Keep Shift = boost.
- **Target marker:** a flat ring/sprite at the destination, pulsing, hidden when idle.
- **HUD:** hover tooltip with the body name + `describePlanet`/`describeStar`. Update the help text for the new controls.
- **Smoke test** (`scripts/smoke.mjs`): keep the W check (at spawn the camera looks −Z, so W still moves −Z). Add an autopilot check: call `ship.moveTo(...)` via `window.ship`, wait, and assert the ship approached the target.

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
