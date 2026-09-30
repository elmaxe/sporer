---
name: threejs-game-conventions
description: Architecture, patterns and rules for this Three.js + Rapier space game (Spore-style space stage). Use before adding or changing any gameplay, rendering, physics, entity, camera, UI or world-generation code in this repo, and when deciding where new code should live.
---

# Three.js game conventions

Browser game: Vite + TypeScript (strict), `three`, `@dimforge/rapier3d-compat` physics, `lil-gui` + `stats.js` debug tools, Vitest tests. The theme is Spore's **space stage**: a UFO flying around star systems.

## Architecture map

| Path | Role |
|---|---|
| `src/main.ts` | Composition root: read `?seed` / `?star`, generate the galaxy, init Rapier and debug, create `Game` and the `SceneManager`, start. Exposes `window.game` / `galaxy` / `levels` (the `SceneManager`) and live getters `ship` / `world` (the `StarSystem` entity) / `system` (its data) for the current system level in dev. |
| `src/core/Game.ts` | Renderer, shared camera, input, resize, main loop. Steps and renders only the active `Level` (`game.setLevel`), after a few global entities (`game.add`, e.g. the `SceneManager`). During a crossfade (`game.setCrossfade(from, weight)`) the outgoing level is stepped, updated and drawn too, and `Crossfade.ts` mixes the two final pictures (copy of the canvas + an overlay quad). `afterFrame`, `crossfadeSolo` and `redraw()` are automation hooks (the screenshot tool uses them). `FIXED_DT = 1/60`. |
| `src/levels/` | `Level` (own `THREE.Scene`, entity list, optional `Physics`, `enter`/`exit`, overridable `render`), `SystemLevel`, `GalaxyLevel`, `PlanetLevel`, and `SceneManager` (owns the levels and runs the transitions, blocking input meanwhile). Every transition (galaxy ↔ system, system ↔ planet) is a seamless zoom: one pure timeline (`seamlessZoom.ts`) drives both levels' cameras; the outgoing level plays alone, then both are drawn and crossfaded framed identically (mapped through `galacticTilt` or the planet's body frame), then the incoming one. Arriving from the galaxy, the ship flies in along the ecliptic and parks near the star (`arrival.ts`: `arrivalParams`, `clampElevation`). |
| `src/core/Entity.ts` | The only lifecycle contract (see below). |
| `src/core/FixedStep.ts` | Pure fixed-timestep accumulator. |
| `src/core/Input.ts` | Polled keys (`KeyboardEvent.code`), pointer position, click-vs-drag, wheel; touch turned into the same gestures by pure `touch.ts` (`TouchGestures`, `stickAxes`); analog key presses from on-screen controls (`setAnalog`); `touchMode`. |
| `src/core/Debug.ts` | `debug.folder(name)` → lil-gui folder or `undefined` in prod. Re-requesting a name replaces the folder (levels get rebuilt), so give each level's folders distinct names (`System camera`, `Galaxy camera`). |
| `src/physics/Physics.ts` | Rapier world (zero gravity). Re-exports `RAPIER`. |
| `src/gen/` | **Procedural generation, pure data, no THREE/DOM/Rapier**: `rng.ts` (seeded PRNG, `hashSeed`), `galaxy.ts`, `stars.ts`, `system.ts`, `planets.ts`, `climate.ts` (temperature, atmosphere, internal heat; split into a fixed setting, a terraformable state and derived values that `evaluateClimate` recomputes, so change a climate with `terraform(climate, change)`, never by editing derived fields), `atmosphere.ts` (an atmosphere's look from its climate: stylised scale height, shell top and haze depth, plus the optical-depth integral the atmosphere shader mirrors), `comets.ts`, `starActivity.ts` (per-kind star behaviour and storm events on a seeded time-slot grid), `lavaActivity.ts` (a lava body's vents, fountain and eruption events on the same kind of slot grid, cached by `EruptionSchedule`, and the ballistic arc maths), `geysers.ts` (which bodies have cryo / steam / sulphur geysers from their climate, the vents on the ground, each vent's eruption cycles cached by `GeyserSchedule`, and plume motion under drag, gravity or buoyancy and wind), `names.ts`, `color.ts`, plus shared math (`orbit.ts`: circular and Kepler orbits, `noise.ts`, `galactic.ts`: a system's `galacticTilt`, kept within 30° of the galactic plane by `flatTilt` → the galaxy band as seen from it). |
| `src/world/` | Views that render generated data: `StarSystem` (from `SystemData`; owns the system clock: `time`, `setTime`, `pose`), `Star` (animated surface and corona in `StarLook.ts` / `starMaterials.ts`, storms in `StarStorms.ts`, all driven by `animate(time)`), `Planet` (also moons), `Comet` (a hover-only `Sight`, not a `CelestialBody`), `planetGeometry.ts` (terrain, gas bands and rings, shared with the planet level; `terrainPainter` / `gasPainter` colour a surface point, so anything showing the surface, like the map, matches the globe), `atmosphereShell.ts` (the soft atmosphere shader for both views: integrates the haze along each view ray, works from outside and inside; atmospheres draw after the opaque scene and the UFO after them, via `ATMOSPHERE_RENDER_ORDER`), `Starfield`, `GalaxyBand` (the galaxy's band in the sky, baked once into a cube map and drawn at infinity with a rotation-only view), `OrbitTrails` (grey smoky ribbons behind each body along its orbit), `noiseGlsl.ts` (shared GLSL value noise and simplex noise), `lavaMaterial.ts` (`LavaLook`: the animated lava sea, per pixel for the planet level's sea sphere and per vertex on a lit sphere in the system view, plus the vent glow; a pure function of the system clock via `animate(time)`, which `StarSystem` calls for every body). Stars/planets/moons implement `CelestialBody` (a `Sight`, i.e. name, description, radius and render position, plus standoff, sim position and velocity); things you can hover but not fly to (comets) implement just `Sight`; their positions are pure functions of the clock (`positionAt`). |
| `src/player/` | `Ship` (autopilot + WASD nudge; parking distance follows the zoom via `viewDistance`; `flyIn` for arrivals), `OrbitCamera`, `Picker` (hover bodies and sights, click bodies → target), `TargetMarker`, `EyeAdaptation` (exposure follows how much of the view the star fills), and pure maths in `autopilot.ts` (arrive steering, tangent detours round bodies), `exposure.ts` and `zoomCurve.ts` (camera distance → parking gap in the system, altitude and lowest pitch over a planet). |
| `src/ui/` | DOM HUD overlays (markup lives in `index.html`), including `VolumeControl` (speaker button + sliders, M mutes, saved to localStorage), `Tooltip`, `HelpText` (a level's help line in mouse or touch wording), `FullscreenButton` (Fullscreen API, or the Add to Home Screen hint on iPhone; `public/manifest.webmanifest` launches the home-screen app full screen, icons drawn by `scripts/icons.mjs`), `SystemMap` (the system level's map: the star cut off at the left, planets in orbit order to the right, moons stacked above them, the count in the title; discs painted on a 2D canvas with the globe's painters; hover for the tooltip, click to fly; laid out by pure `systemMapLayout.ts`; shares the `.map-panel` styles, N key and Map button with `PlanetMap`) and `TouchControls` (a global entity: on-screen stick and hold buttons, shown in touch mode per `Level.touchControls`). |
| `src/audio/` | `AudioManager`: Web Audio mixer (master → music / ambience / sfx gains), unlocked on the first trusted pointer/key press, paused while the tab is hidden. Not an `Entity` (nothing per frame). Pure `settings.ts` (volumes → gains), `loop.ts` (crossfade a clip into a seamless loop) and `whoosh.ts` (sound-effect params → automation curves); `sfx.ts` synthesises the effects from Web Audio nodes. Game code plays effects through the `SoundEffects` interface (`play('travel' \| 'transitionOut' \| 'transitionIn')`), passed in as a constructor dependency. Audio files live in `src/assets/audio/` and are imported as URLs. |
| `tests/` | Vitest unit tests for pure logic. |

| `src/planet/` | Planet-level (low orbit) entities: `PlanetFrame` (the level's clock and body frame ↔ system space), `PlanetGlobe`, `LocalMoons`, `PlanetLights`, `LavaEruptions` (lava worlds' blobs, glow sprites and vent light), `Geysers` (plumes of bodies with geothermal activity, one pooled `Points` lit by the sun in its shader), `PlanetShip` (scripted, no physics), `PlanetPicker`, `PlanetHud`, `PlanetMap` (the Equal Earth map: a corner panel for mouse players, an overlay from the Map button on touch; terrain baked on the CPU with the globe's own painters, drawn into the game canvas under its DOM panel by `render`, lava seas by the sea's own shader, markers on a 2D canvas on top), and pure maths in `frame.ts` (body frame, sky sizes, light direction), `surfaceMotion.ts` (great-circle steering) and `equalEarth.ts` (the projection, its inverse, body frame ↔ longitude/latitude). |
| `src/galaxy/` | Galaxy-map entities: `GalaxyMap` (all stars in one `Points` shader, one dot per binary member, twinkle), `GalaxyDust`, `GalaxyShip` (scripted travel), `GalaxyPicker`, `GalaxyHud`, `GalaxySpin` (turns the level's `root`), `DistantGalaxies` (procedural sky of other galaxies), `StarCloseUp` (the system's star(s) drawn at the star's place during the seamless zoom), pure `pickPoint` / `galaxyStarSize` / `binaryLayout`. The stars, glows, dust and ship live in `GalaxyLevel.root`, which rotates: work in its local (galaxy) coordinates and convert with `root.matrixWorld` for anything in world space (picking rays, marker rings, the camera via `getWorldPosition`). |

New feature areas get their own folder under `src/` (e.g. `src/combat/`, `src/audio/`).

## Procedural generation (`src/gen/`)

- **Data, then view.** Generators return plain serialisable data (`GalaxyData`, `StarRef`, `SystemData`, `PlanetData`, ...) with colours as hex strings. Classes in `src/world/` turn that data into meshes and bodies. Never put THREE objects in generated data.
- **Only `Rng`, never `Math.random`**, anywhere generated or visual content is decided (the starfield is seeded too). The same seed must give the same universe.
- **Fork per thing:** `rng.fork('planet', i)` gives an independent stream per object. Adding a draw to one planet must not change the next planet or another system. Derive seeds with `hashSeed(...)`.
- **Lazy by level:** `generateGalaxy(seed)` makes only `StarRef`s (position, name, star types, seed). `generateSystem(ref)` is called on demand and is fully determined by `ref`. Planet-surface detail should follow the same pattern from `PlanetData.seed`.
- **Scales:** each level has its own units. Galaxy units (`GALAXY_RADIUS = 1000`), system units (G star r≈30, UFO ≈4 wide) and planet units (the system view magnified by `PLANET_SCALE = 12.5` for every body, so an Earth-sized one has radius 100 and a dwarf 25; centred in the body's own tilted, spinning frame) are unrelated. Convert at transitions (`planet/frame.ts` for planet ↔ system; `SystemData.galacticTilt` plus the galaxy root's turn for system ↔ galaxy) and never mix them in one scene.
- **Real-world rules and numbers** (temperatures, atmospheres, gravity, star properties) come from the `research` skill: looked up, checked against real reference cases, recorded in `docs/research/`, and cited next to the constant. No guessed magic numbers.
- **Layout invariants** are covered by `tests/universe.test.ts` (no overlapping orbits or moons, a clear spawn point, Kepler-ordered periods). Extend it when adding generated features. When tuning, print sample systems from a throwaway test rather than guessing.
- Terrain: `terrainNoise` returns roughly [-1, 1] with a median of ~0. `PlanetStyle.seaLevel` is a threshold in that range (0 ≈ half the surface underwater).

## Entity lifecycle

Everything in the game implements `Entity` and is registered with its level (`level.add(entity)`; only level-independent things like the `SceneManager` use `game.add`). Only the active level runs; inactive levels keep their state, frozen. The loop runs:

```
per fixed step (60 Hz):  fixedUpdate(dt) → physics.step() → afterPhysics()
per frame:               update(frameDt, alpha) → render
game.remove(e) / game.dispose()  → dispose()
```

- **`fixedUpdate`**: gameplay, AI, forces and impulses, kinematic targets. Anything that must behave the same at 30 or 144 FPS.
- **`afterPhysics`**: copy body transforms into `prev`/`curr` state.
- **`update`**: visuals only. Interpolate `mesh.position.lerpVectors(prev, curr, alpha)` and `quaternion.slerpQuaternions(...)`, plus cosmetic animation, cameras and HUD. Never apply forces here.
- **`dispose`**: remove from the scene, `.dispose()` every geometry, material and texture you created, `world.removeRigidBody(body)`, and remove DOM/event listeners.

Composite entities (e.g. `StarSystem` owning `Planet`s) forward the hooks to their children. Only the parent is registered with the level. A level disposes its entities and physics world in `dispose()`; anything added straight to its scene (e.g. a light) is disposed by a `dispose` override.

Constructor pattern: take the dependencies you need (`scene`, `physics`, `input`, `debug`, ...) explicitly. There is no global singleton. Each level's constructor wires its entities; `main.ts` wires the game.

## Physics rules (Rapier)

- Rapier is WASM. `main.ts` awaits `Physics.init()` once; after that `Physics.create(FIXED_DT)` makes a world synchronously (one per level that needs physics).
- Import it as `import { RAPIER, type Physics } from '../physics/Physics'`.
- Body types: **dynamic** for things pushed by forces (ship), **kinematicPositionBased** for scripted movers (orbiting planets, via `setNextKinematicTranslation` in `fixedUpdate`), **fixed** for static objects (sun).
- The ship locks rotations and sets its orientation directly from input. Movement uses `applyImpulse(force * dt)` so it scales with the fixed step. Forces added with `addForce` persist until `resetForces`, so prefer impulses.
- Rapier returns plain `{x,y,z}` objects and accepts any `{x,y,z}`/`{x,y,z,w}`, so THREE vectors and quaternions can be passed directly.
- Enable CCD on fast bodies (`setCcdEnabled(true)`).
- Never step the world anywhere except the fixed-step loop (`Game` → `level.fixedStep`).

## Rendering and performance rules

- **No per-frame allocation** in `fixedUpdate` / `update`: keep scratch `Vector3`/`Quaternion`/`Euler` objects as private readonly fields (see `Ship.ts`).
- Many identical objects (asteroids, stars, fleets) → `InstancedMesh` or `Points`, never thousands of meshes.
- Low-poly, flat-shaded, vertex-coloured style (`flatShading: true`, `vertexColors: true`). Procedural generation must be **seeded and deterministic** (`terrainNoise(x, y, z, seed)`).
- The renderer uses ACES tone mapping. Emissive or glowing objects use `MeshBasicMaterial` or additive sprites.
- Scale: the UFO is ~4 units wide, and distances are compressed (sun r=30, planets orbit at 90–330). The camera far plane is 20000 and the starfield sits at 9000. Galaxy scale lives in its own level (`GalaxyLevel`), never in huge system coordinates (float precision).
- Pixel ratio is capped at 2.
- Animated visuals that must look the same wherever the clock is (living stars, comets) are **pure functions of the system time**, set from `StarSystem.update` (interpolated time) and `pose` (the planet level's sky). Random events use a seeded slot grid (`gen/starActivity.ts`) instead of a running `Rng`, so any moment can be shown without replaying the past.
- Shader-animated particles: one pooled `Points` with the motion in the vertex shader; write new particles into a ring buffer and upload only those ranges (`addUpdateRange`), see `StarStorms`. Keep per-pixel noise off large billboards (compute it per vertex).

## Tunables and debug

Gameplay constants live in an exported `xxxParams` object next to the code that uses them (`shipParams`, `cameraParams`) and are bound in the constructor:

```ts
const f = debug.folder('Ship');
f?.add(shipParams, 'thrust', 0, 300);
f?.add(shipParams, 'linearDamping', 0, 5).onChange((v: number) => body.setLinearDamping(v));
```

Debug is on in `npm run dev` and in any build with `?debug` in the URL. lil-gui and stats.js are dynamically imported, so they cost nothing in production.

## Input

Use `input.isDown('KeyW')` / `input.axis('KeyA', 'KeyD')` (codes, not `key`). Mouse: `input.pointer` (NDC + client coords, live object), `consumeClick()` (left press that moved < 5 px), `consumeDrag()` (left/right drag pixels), `consumeWheel()` (pixels, + = zoom out). No pointer lock. Avoid Ctrl-combos (Ctrl+W closes the tab).

Touch (phones) goes through the same calls, so game code never checks for it: a tap is a click, one-finger drag is a drag, a pinch is the wheel (spreading the fingers ×2 halves the view distance), and a finger held still is the hovering pointer (tooltips). The on-screen stick and hold buttons (`TouchControls`) press keys as analog values (`input.setAnalog('KeyW', 0.6)`), so `axis` can return fractions: normalise a move vector only when its length is over 1. Every new control needs a touch path: a key-only action gets a hold button in `#touch-controls` (and `Level.touchControls` says which levels show it), and help text gets touch wording (`HelpText`). The canvas has `touch-action: none`; overlays that shouldn't eat touches keep `pointer-events: none`. Audio unlocks on a touch's *release* (browsers don't count a touch `pointerdown` as a gesture).

Current controls (Spore-style): left-click a star/planet/moon (in the view or on the system map) to autopilot there and park beside it, or empty space to fly to that point on the ship's plane; N folds the map away. Scroll zooms and **moves the ship with it**: parked at a body, the camera distance sets how far out it parks; over a planet it sets the altitude (levels read `orbit.zoom` each frame unless `Level.zoomLocked`, which transitions set). Drag rotates the camera. WASD nudges relative to the camera (cancels the autopilot), E/Q up/down, Shift boosts (also the autopilot). Scrolling in past min zoom while parked at a planet or moon (or flying into one) descends to its low orbit. While the autopilot (or a galaxy jump) is under way, scrolling in is held and played out on arrival (`holdZoomIn` in `OrbitCamera`), so you zoom into the destination rather than something passed on the way; there, clicking the globe (or the map) flies the great circle to that point, N folds the map away, and scrolling out past max returns to the system. On touch: tap for click, pinch for scroll, drag to rotate, hold a finger on something to identify it, the stick for WASD, and ▲/▼ (system only), Boost and Map (opens the system or planet map overlay) buttons.

Visual-only entities that read the camera (`Picker`, `TargetMarker`, `Hud`) are added after `OrbitCamera`, so they see this frame's camera. Billboards should `lookAt(camera.position)` rather than copy the camera quaternion (or use a `Sprite`): facing the view plane makes them poke through spheres when off-centre.

## Testing

- Put pure logic (math, generation, rules, state machines) in modules with **no THREE scene / DOM / Rapier dependency** and unit-test them in `tests/*.test.ts`.
- Rendering and feel are verified in the browser with the `run-game` skill.

## Checklist for every feature

1. Code goes in the right folder and implements `Entity` if it lives in the loop, with a complete `dispose()`.
2. Simulation in `fixedUpdate`, visuals interpolated in `update`, no per-frame allocations.
3. New tunables are exposed through `debug.folder`.
4. `npm run typecheck` and `npm test` pass (add tests for new pure logic).
5. `npm run build` succeeds.
6. Verify in the browser with the `run-game` skill: renders, no console errors, FPS is stable.
