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
| `src/core/Game.ts` | Renderer, shared camera, input, resize, main loop. Steps and renders only the active `Level` (`game.setLevel`), after a few global entities (`game.add`, e.g. the `SceneManager`). `FIXED_DT = 1/60`. |
| `src/levels/` | `Level` (own `THREE.Scene`, entity list, optional `Physics`, `enter`/`exit`), `SystemLevel`, `GalaxyLevel`, and `SceneManager` (owns the levels, runs the zoom + fade transitions, blocks input meanwhile). |
| `src/core/Entity.ts` | The only lifecycle contract (see below). |
| `src/core/FixedStep.ts` | Pure fixed-timestep accumulator. |
| `src/core/Input.ts` | Polled keys (`KeyboardEvent.code`), pointer position, click-vs-drag, wheel. |
| `src/core/Debug.ts` | `debug.folder(name)` → lil-gui folder or `undefined` in prod. Re-requesting a name replaces the folder (levels get rebuilt), so give each level's folders distinct names (`System camera`, `Galaxy camera`). |
| `src/physics/Physics.ts` | Rapier world (zero gravity). Re-exports `RAPIER`. |
| `src/gen/` | **Procedural generation, pure data, no THREE/DOM/Rapier**: `rng.ts` (seeded PRNG, `hashSeed`), `galaxy.ts`, `stars.ts`, `system.ts`, `planets.ts`, `names.ts`, `color.ts`, plus shared math (`orbit.ts`, `noise.ts`). |
| `src/world/` | Views that render generated data: `StarSystem` (from `SystemData`), `Star`, `Planet` (also moons, gas bands, rings, atmosphere), `Starfield`. Stars/planets/moons implement `CelestialBody` (name, description, radius, standoff, sim + render position, velocity). |
| `src/player/` | `Ship` (autopilot + WASD nudge), `OrbitCamera`, `Picker` (hover/click → target), `TargetMarker`, and pure steering math in `autopilot.ts`. |
| `src/ui/` | DOM HUD overlays (markup lives in `index.html`), including `VolumeControl` (speaker button + sliders, M mutes, saved to localStorage). |
| `src/audio/` | `AudioManager`: Web Audio mixer (master → music / ambience gains), unlocked on the first trusted pointer/key press, paused while the tab is hidden. Not an `Entity` (nothing per frame). Pure `settings.ts` (volumes → gains) and `loop.ts` (crossfade a clip into a seamless loop). Audio files live in `src/assets/audio/` and are imported as URLs. |
| `tests/` | Vitest unit tests for pure logic. |

| `src/galaxy/` | Galaxy-map entities: `GalaxyMap` (all stars in one `Points` shader), `GalaxyShip` (scripted travel), `GalaxyPicker`, `GalaxyHud`, pure `pickPoint` / `galaxyStarSize`. |

New feature areas get their own folder under `src/` (e.g. `src/combat/`, `src/audio/`).

## Procedural generation (`src/gen/`)

- **Data, then view.** Generators return plain serialisable data (`GalaxyData`, `StarRef`, `SystemData`, `PlanetData`, ...) with colours as hex strings. Classes in `src/world/` turn that data into meshes and bodies. Never put THREE objects in generated data.
- **Only `Rng`, never `Math.random`**, anywhere generated or visual content is decided (the starfield is seeded too). The same seed must give the same universe.
- **Fork per thing:** `rng.fork('planet', i)` gives an independent stream per object. Adding a draw to one planet must not change the next planet or another system. Derive seeds with `hashSeed(...)`.
- **Lazy by level:** `generateGalaxy(seed)` makes only `StarRef`s (position, name, star types, seed). `generateSystem(ref)` is called on demand and is fully determined by `ref`. Planet-surface detail should follow the same pattern from `PlanetData.seed`.
- **Scales:** each level has its own units. Galaxy units (`GALAXY_RADIUS = 1000`) and system units (G star r≈30, UFO ≈4 wide) are unrelated. Convert at transitions and never mix them in one scene.
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

Current controls (Spore-style): left-click a star/planet/moon to autopilot there and park beside it, or empty space to fly to that point on the ship's plane. Scroll zooms, drag rotates the camera. WASD nudges relative to the camera (cancels the autopilot), E/Q up/down, Shift boosts (also the autopilot).

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
