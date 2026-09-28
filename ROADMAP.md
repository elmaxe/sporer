# Roadmap

Spore-style space stage in the browser. Each step leaves the game playable and is verified (`typecheck`, `test`, `build`, `smoke`) before it is pushed to `main`. Pushing to `main` deploys to GitHub Pages (https://elmaxe.github.io/sporer/) via `.github/workflows/deploy.yml`.

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

### 4. ✅ Travel sounds
- A **whoosh** when the ship sets off: galaxy travel, and the zoom transitions between galaxy and system (and later planet).
- An **Effects** volume slider next to Master / Music / Ambience.
- Done when travel and transitions whoosh at a sensible level relative to the music, sounds respect the sliders and mute, and there are no console errors.

- Result: synthesised, no files. `src/audio/whoosh.ts` is pure: per-effect `sfxParams` (band-pass sweep from → peak → to, Q, attack/release envelope, level, a low triangle "body", pan sweep) and `whooshCurves()`, which samples them into automation curves. `src/audio/sfx.ts` (`SfxSynth`) plays them on any `BaseAudioContext`: a 2 s seeded stereo noise buffer (made once, looped from a random offset) → bandpass → gain → `StereoPanner`, with the body oscillator under it, all driven by `setValueCurveAtTime`; the nodes are disconnected `onended`. Three effects: `travel` (a pass-by, L → R, 1.6–4.5 s growing with the trip's cruise time), `transitionOut` (up-sweep, zooming out) and `transitionIn` (down-sweep, zooming in). `AudioManager` has an `sfx` channel (default 0.7; old saved settings still load) and implements the `SoundEffects` interface (`play(name, opts)`, a no-op until audio is unlocked or while the tab is hidden, `lastPlayed` for debugging). It's passed into `SceneManager` (transitions) and through `GalaxyLevel` into `GalaxyShip` (`travelTo`, only when the destination changes). Levels were set by rendering offline against the real tracks: each whoosh peaks ~3 dB above music + ambience (short-term RMS at default volumes), sample peaks ~−12 dBFS. `debug.folder('Sound FX')` has every parameter plus a play button per effect. The smoke test unlocks audio, then checks each whoosh fires (zoom out, travel, zoom in) and that the Effects slider exists. The system `Ship` autopilot has no whoosh yet.

### 5. ✅ Planet approach (low orbit)
- Getting close to a planet (zooming in or flying at it) moves smoothly to the planet scene.
- Planet scene: a large, detailed terrain sphere built from the planet's data (oceans, mountains, colours, atmosphere glow), with the ship hovering in low orbit and using the same click-to-move over the globe.
- The rest of the system stays in view: from low orbit you see the star, the other planets and this planet's own moons in the sky, where they really are and moving along their orbits.
- Zooming out returns to the system, next to that planet.
- Done when the full loop works for every planet type.

- Result: `src/planet/` and `levels/PlanetLevel.ts`. Scroll in past min zoom while parked at (or within 2× the standoff of) a planet or moon, or fly into one, and the camera flies at the body (`OrbitCamera.setFocus`) as it fades; scroll out past max to come back parked beside it, on the side you were flying over, with the system fast-forwarded to the time spent below. Both play the step 4 transition whooshes (in going down, out coming up). `StarSystem` now has one clock (`time`, `setTime`, `pose`); bodies are pure functions of it (`positionAt`). The planet level works in the body's own frame (tilted and spinning, `planet/frame.ts`), radius 100: a detail-60 globe from `detailedTerrain` (= `terrainNoise` + finer octaves, relief ×1.6), an opaque sea sphere (glossy water, glowing lava, matte ice), gas giants with fine cloud streaks, rings, and an atmosphere that dims on the night side. The planet keeps its system-view spin angle in and out, so you arrive over the continent that was under the ship; the day length is the real spin × `planetParams.spinScale` (0.1), since real spins would race the sky round. Mesh builders are shared in `world/planetGeometry.ts`. `PlanetShip` is scripted (unit direction + tangent velocity, `planet/surfaceMotion.ts`: great-circle arrive steering, parallel transport), and `OrbitCamera` takes a live `up` (with the yaw/pitch frame carried along) and a `minPitch`. **Deviation from the notes below:** the sky isn't impostors. Each frame the (inactive) system level is posed at the planet level's clock and rendered from a sky camera at the matching place in system space (`SystemLevel.renderSky`, a `Level.render` override), then the planet scene is drawn over it after a depth clear. That gives the real star, glow, gas bands, rings and phases (lit by the star's own point light) with no duplicated visuals; bodies below 1.5 px are enlarged (`skyScale`). The visited planet's own moons are real meshes in the planet scene (`LocalMoons`), since they can pass in front of the globe. The smoke test runs the loop (park, scroll in, click the globe, fly, scroll out) in the home system and then for every planet type plus a moon (`--quick` skips those).

**Implementation notes (proposed design; confirm with the user before building):**

*Entering and leaving* (`SceneManager.toPlanet(body)` / back to the system):
- In a system, scrolling in past the min zoom while the ship is parked at (or within ~2× the standoff of) a planet or moon enters that body's `PlanetLevel`. Anywhere else, scrolling in past min does nothing.
- Out phase: the system camera flies at the body, not the ship. Give `OrbitCamera` an optional focus override (a `Vector3` it looks at and orbits instead of the target), which `SceneManager` blends from the ship to the body while zooming to ~1.5× its radius, with the fade. In phase: the planet camera starts high (~3 R) and settles at low orbit.
- Scrolling out past the planet level's max → back to the system level (kept alive, like the galaxy trip), with the ship parked beside the body on the side it left from.

*Planet level* (planet units: the body is rescaled to R = 100 whatever its system radius):
- Terrain: a pure `detailedTerrain(x, y, z, seed)` in `gen/noise.ts` = `terrainNoise` (so continents match the system view) + 2–3 higher-frequency octaves at small amplitude. Unit-test that the large scale matches `terrainNoise`.
- Mesh: move the `Planet` geometry builders (terrain, gas bands, rings, atmosphere) into a shared module taking a `detail` argument. Planet level uses a much finer icosphere (detail ~60: 20·61² ≈ 74k triangles) plus a flat sea sphere at sea level for water worlds, and the same atmosphere shell (rescaled). Gas giants: the same banded sphere, finer (low orbit over the clouds).
- Light: one `DirectionalLight` coming from the star's direction (planet position → star in system space) plus the hemisphere ambient.

*Rest of the system in the sky* (`levels/SystemSky.ts` or `world/SystemSky.ts`):
- System distances don't fit in planet units (R = 100). So every other body is drawn as a **sky impostor** on a camera-centred shell at a fixed distance (~5000). Direction = normalize(body − this planet) in system space. Size keeps the true angular radius, `asin(r / d)`, with a minimum of ~2 px so distant planets still show as bright dots, like planets in a night sky. Draw order is by real distance, so a moon passing in front of the star occludes it.
- The **star(s)**: a disc at its true angular size plus the glow billboard. For binaries, both stars. Its direction drives the `DirectionalLight`, so the terminator on the terrain matches where the sun is.
- **Other planets and moons**: small spheres with a shader that lights them from *their own* direction to the star, giving correct phases (crescent when a planet is nearly between you and the star). They reuse their system palette (gas bands, rings for ringed ones at larger angular sizes). **This planet's moons** get big enough to be real meshes. They use the same impostor path, just larger.
- **Clock:** give `StarSystem` one shared time (today each `Planet`/`Star` keeps its own `time` counter, all advancing together) that the planet level reads at entry and keeps advancing with pure `orbitPosition` calls (no Rapier). On return, the system level fast-forwards its bodies to the new time (`StarSystem.setTime(t)`), so everything is where you last saw it in the sky.
- Picking ignores the sky for now (clicking the globe only). Hovering a sky body could show its name tooltip, which is cheap with the existing `Tooltip`.
- Ship: scripted, no Rapier needed yet. State = unit direction on the sphere + altitude (~0.12 R above the surface). Click the globe (ray–sphere) to autopilot along the great circle using the same arrive steering on arc length. WASD nudges in the tangent plane relative to the camera. The UFO's up is the local radial direction.
- Camera: the same orbit rig, but with `up` = the ship's radial direction (add an `up` option to `OrbitCamera`; yaw/pitch are relative to the local tangent plane).
- HUD: planet name + `describePlanet`, help text for the level.

*Tests / smoke:*
- Unit-test great-circle stepping (stays on the sphere, arrives, shortest way round) and `detailedTerrain`.
- Unit-test the sky mapping: direction and angular size from system positions, the minimum pixel size, and that the star direction and the light direction agree.
- Smoke: park at a planet via `ship.moveTo(world.planets[i])`, scroll in → `levels.mode === 'planet'`; click the globe and check the ship moved over the surface; check the sky shows the star plus one impostor per other planet and moon; scroll out → back in the system beside the same planet. Run for each planet type via a few `?star=` values (the roadmap's "done" criterion).

### 6. ⬜ Galaxy map polish
- Background of **distant galaxies** instead of black: small spirals, ellipticals and edge-on discs scattered over the sky, plus one or two larger, closer ones.
- Stars **twinkle** subtly.
- The whole galaxy **rotates very slowly**, barely noticeable.
- **Binary systems read as two stars**, not one point.
- Done when all four are visible in the galaxy view, picking and travel still work while it rotates, and the smoke loop passes.

**Implementation notes (proposed design; confirm with the user before building):**
- *Distant galaxies:* `gen/distantGalaxies.ts` (pure, `rng.fork('distantGalaxies')` from the galaxy seed): ~200 entries of {direction, kind (spiral / elliptical / edge-on / irregular), size, tilt, rotation, colour}. View: a camera-centred sky sphere like `Starfield` (no parallax). Draw with one `Points` or `InstancedMesh` of quads whose shader draws the shape procedurally (spiral arms from a log-spiral + noise, ellipticals as soft Sérsic blobs), so there are no texture files. Most are 4–30 px and faint, with 1–2 large ones. Keep them dim so the real galaxy dominates.
- *Twinkle:* in the `GalaxyMap` shader, `brightness *= 1 + a·sin(time·f + phase)`, with the phase and frequency hashed from the star id in the shader (no new generation draws). Use a ≈ 0.15, a bit more for small stars. Leave the current and hovered stars steady. Add a `time` uniform and a tunable amplitude.
- *Rotation:* put the stars, dust, glows, rings and the `GalaxyShip` in one `galaxyRoot` group rotated about +Y by `ω·t` (ω ≈ one turn per ~60 min, tunable in debug). Ship travel stays in local (galaxy) coordinates. `GalaxyPicker` transforms the ray into the group's local space. The camera follows the ship's world position but doesn't rotate with the group, so you see the galaxy turn.
- *Binaries:* the `GalaxyMap` shader draws both members of a binary: two points per binary `StarRef` (a `member` attribute), coloured and sized per member, orbiting their midpoint slowly (period hashed from the id). Their separation is `max(physicalSep, k·pixels)` in view space, so from afar they merge into one point and zooming in splits them. The hover tooltip already lists both.
- Tests: `distantGalaxies` determinism and distribution; picking a star while the galaxy is rotated (pure `pickPoint` with a transformed ray).

### 7. ⬜ System sky, orbit lines and rings
- The **galaxy band** in the system sky: the Milky Way as seen from this star, brightest towards the galactic centre, with dark dust lanes.
- Planet **orbit lines**, faintly visible.
- **Rings on more planet types**, not just gas giants.
- Done when every system shows a band consistent with its place in the galaxy, orbit lines read without cluttering, and rocky, ice or lava planets sometimes have rings.

**Implementation notes (proposed design; confirm with the user before building):**
- *Galactic orientation per system:* add a seeded `galacticTilt` (a rotation from system space into galaxy space) to `SystemData`, drawn last or from `rng.fork('galactic')` so nothing else changes. Real systems' ecliptics are tilted against the galactic plane, which puts the band diagonally across the sky. Step 9 needs this same mapping to line up the views.
- *Band:* a sky-sphere shader in `world/GalaxyBand.ts`, drawn behind `Starfield`. Inputs are the galactic plane normal and the direction to the galactic centre (both in system space, from the star's galaxy position and `galacticTilt`), and how deep in the disc the star is. Brightness is a Gaussian in galactic latitude, stronger towards the centre (a bulge glow) and dimmer towards the rim. Dust lanes come from 3D noise along the plane. Colours come from the galaxy glow palette in `galaxy/appearance.ts`. Also add a denser, faint band of starfield points along the same plane.
- *Orbit lines:* one `LineLoop` per planet orbit (64–128 segments, built once) in `StarSystem`, additive and low opacity (~0.12), fading with camera distance. Highlight the hovered or targeted planet's orbit. Moon orbits only near their planet. Binary stars' mutual orbit gets no line.
- *Rings:* non-gas planets get rings with a small chance (~10–15%; more for ice, fewer for lava), decided with a separate `rng.fork('rings')` so gas giants and existing draws don't change. Keep them narrow (outer ≤ ~2 R) and in colours from the planet's palette (icy white for ice, dusty for rocky). Rings widen a planet's reach, so later orbits in those systems shift. That's acceptable, since there are no saves yet. Extend `tests/universe.test.ts` (no overlaps with the new rings).

### 8. ⬜ Living stars and comets
- The **star is alive**: an animated surface (granulation, drifting sunspots), a pulsing corona, and **solar storms**: prominence loops rising off the limb and occasional flares/CMEs of particles flying outward.
- **Comets**: a few per system on long elliptical orbits, with a glowing head and a tail pointing away from the star that grows near the star. Not clickable or visitable.
- Done when every star type visibly lives (at a pace that suits its type) and comets fly through systems, with no FPS regression.

**Implementation notes (proposed design; confirm with the user before building):**
- *Surface:* replace the star's flat material with a shader (still unlit/emissive). Use animated 3D noise for granulation, a few slow dark spots, and limb darkening. Scale detail and colour with star type.
- *Storms:* one pooled `Points` per star (e.g. 2k particles) animated entirely in the vertex shader from per-particle {spawn time, origin on the surface, velocity, lifetime}. Prominences are particles following a magnetic-loop arc (a half-ellipse rooted at two surface points) that rises, hangs and falls back. Flares/CMEs are bursts moving radially outward that fade with distance. Event timing comes from a seeded `Rng` per star (no `Math.random`). Red dwarfs flare often and small; giants slowly and large. When the pool recycles, only the attribute ranges it rewrites are updated (no per-frame allocation).
- *Comets:* `CometData` in `gen/` with orbital elements (perihelion outside the star's glow, aphelion beyond the outermost planet, inclination, argument of perihelion, period), generated from `rng.fork('comets')` so existing systems don't change. Add a pure Kepler solver (`solveKepler(M, e)` by Newton iteration) to `gen/orbit.ts` with tests (circular case matches `orbitPosition`, the period closes, speed peaks at perihelion). View: `world/Comet.ts` with a small head plus an additive coma sprite. The tail is two additive ribbons/particle trails: a straight ion tail (anti-sunward, blue) and a curved dust tail (lagging along the orbit, warm). Length and brightness scale with 1/r². Comets are not `CelestialBody` and get no physics body, so the `Picker` and autopilot ignore them.

### 9. ⬜ Seamless galaxy ↔ system zoom
- Scrolling into a star: the UFO shrinks as it dives towards the star, the star swells from a point into a sun, and the system view takes over **without a cut to black**. Scrolling out plays the reverse.
- Done when the galaxy → system → galaxy loop has no black frame, the star keeps its screen position and size through the handover, and the smoke loop still passes.

**Implementation notes (proposed design; confirm with the user before building):**
- *Why it can be seamless:* both scenes are rendered during the handover and crossfaded, and the handover frame is framed identically in both. That means the same view direction (the system ↔ galaxy rotation from step 7's `galacticTilt`), the same screen position and angular size of the star (binary: both members), and a matching background (the step 7 band is the galaxy seen from that star).
- *Rendering:* `SceneManager` gets a blend mode. The outgoing and incoming levels render into two half-float render targets, and a fullscreen quad mixes them (`mix(a, b, t)`). This only runs during the ~0.5 s overlap, so it costs nothing otherwise. The `#fade` overlay stays for the other transitions.
- *Choreography, galaxy → system (~2.5 s, input blocked):*
  1. Galaxy: the camera zooms at the star in log space. The `GalaxyShip` scales down and flies into the star. A dedicated billboard for the target star grows beyond its point size into a disc plus glow.
  2. Handover (~0.5 s crossfade): the system camera starts on the far side of the system, looking at the sun from the matching direction. Its distance is chosen so the sun's angular size equals the galaxy billboard's (`r_sun / d_sys = size_gal / d_gal`).
  3. System: the camera keeps zooming in while its focus blends from the sun to the UFO (the `OrbitCamera` focus override from step 5). The UFO grows from nothing back to normal size at the spawn point.
- System → galaxy is the same timeline reversed. Put the timeline in a pure module (like `levels/transition.ts`) returning camera distances, ship scale, star billboard size and blend weight at time t, and unit-test it, including the angular-size match at the handover.
- Step 5's system ↔ planet transition can use the same blend path later.
- Smoke: sample `#fade` opacity and the blend weight through the loop and assert the screen never goes fully black. Screenshot mid-handover.

## Later / ideas

- Abduction beam, spice economy, colonising planets
- Other empires and diplomacy
- Save/load (only the seed + player state are needed)
- Audio: music, looping ambience and volume controls are in (`src/audio/`); travel whooshes are in (step 4). Later: engine hum, UI clicks, arrival chimes on the same Effects channel
