---
name: threejs-game-conventions
description: Architecture, patterns and rules for this Three.js + Rapier space game (Spore-style space stage). Use before adding or changing any gameplay, rendering, physics, entity, camera, UI or world-generation code in this repo, and when deciding where new code should live.
---

# Three.js game conventions

Browser game: Vite + TypeScript (strict), `three`, `@dimforge/rapier3d-compat` physics, `lil-gui` + `stats.js` debug tools, Vitest tests. The theme is Spore's **space stage**: a UFO flying around star systems.

## Architecture map

| Path | Role |
|---|---|
| `src/main.ts` | Composition root: init physics and debug, create `Game`, add entities, start. Exposes `window.game` / `window.ship` in dev. |
| `src/core/Game.ts` | Renderer, scene, camera, resize, main loop, entity list. `FIXED_DT = 1/60`. |
| `src/core/Entity.ts` | The only lifecycle contract (see below). |
| `src/core/FixedStep.ts` | Pure fixed-timestep accumulator. |
| `src/core/Input.ts` | Polled keys (`KeyboardEvent.code`) + pointer-lock mouse deltas. |
| `src/core/Debug.ts` | `debug.folder(name)` → lil-gui folder or `undefined` in prod. |
| `src/physics/Physics.ts` | Rapier world (zero gravity). Re-exports `RAPIER`. |
| `src/world/` | Star systems, planets, starfield + **pure** math (`orbit.ts`, `noise.ts`). |
| `src/player/` | Ship controller and chase camera. |
| `src/ui/` | DOM HUD overlays (markup lives in `index.html`). |
| `tests/` | Vitest unit tests for pure logic. |

New feature areas get their own folder under `src/` (e.g. `src/galaxy/`, `src/combat/`, `src/audio/`).

## Entity lifecycle

Everything in the game implements `Entity` and is registered with `game.add(entity)`. The loop runs:

```
per fixed step (60 Hz):  fixedUpdate(dt) → physics.step() → afterPhysics()
per frame:               update(frameDt, alpha) → render
game.remove(e) / game.dispose()  → dispose()
```

- **`fixedUpdate`**: gameplay, AI, forces and impulses, kinematic targets. Anything that must behave the same at 30 or 144 FPS.
- **`afterPhysics`**: copy body transforms into `prev`/`curr` state.
- **`update`**: visuals only. Interpolate `mesh.position.lerpVectors(prev, curr, alpha)` and `quaternion.slerpQuaternions(...)`, plus cosmetic animation, cameras and HUD. Never apply forces here.
- **`dispose`**: remove from the scene, `.dispose()` every geometry, material and texture you created, `world.removeRigidBody(body)`, and remove DOM/event listeners.

Composite entities (e.g. `StarSystem` owning `Planet`s) forward the hooks to their children. Only the parent is registered with `Game`.

Constructor pattern: take the dependencies you need (`scene`, `physics`, `input`, `debug`, ...) explicitly. There is no global singleton. `main.ts` wires everything.

## Physics rules (Rapier)

- Rapier is WASM. `Physics.create()` awaits `RAPIER.init()`, and no Rapier call may happen before it.
- Import it as `import { RAPIER, type Physics } from '../physics/Physics'`.
- Body types: **dynamic** for things pushed by forces (ship), **kinematicPositionBased** for scripted movers (orbiting planets, via `setNextKinematicTranslation` in `fixedUpdate`), **fixed** for static objects (sun).
- The ship locks rotations and sets its orientation directly from input. Movement uses `applyImpulse(force * dt)` so it scales with the fixed step. Forces added with `addForce` persist until `resetForces`, so prefer impulses.
- Rapier returns plain `{x,y,z}` objects and accepts any `{x,y,z}`/`{x,y,z,w}`, so THREE vectors and quaternions can be passed directly.
- Enable CCD on fast bodies (`setCcdEnabled(true)`).
- Never step the world anywhere except `Game`'s fixed-step loop.

## Rendering and performance rules

- **No per-frame allocation** in `fixedUpdate` / `update`: keep scratch `Vector3`/`Quaternion`/`Euler` objects as private readonly fields (see `Ship.ts`).
- Many identical objects (asteroids, stars, fleets) → `InstancedMesh` or `Points`, never thousands of meshes.
- Low-poly, flat-shaded, vertex-coloured style (`flatShading: true`, `vertexColors: true`). Procedural generation must be **seeded and deterministic** (`terrainNoise(x, y, z, seed)`).
- The renderer uses ACES tone mapping. Emissive or glowing objects use `MeshBasicMaterial` or additive sprites.
- Scale: the UFO is ~4 units wide, and distances are compressed (sun r=30, planets orbit at 90–330). The camera far plane is 20000 and the starfield sits at 9000. For galaxy-scale views, use a separate scene or scaled root, not huge coordinates (float precision).
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

Use `input.isDown('KeyW')` / `input.axis('KeyA', 'KeyD')` (codes, not `key`). Mouse look = `input.consumeMouseDelta()` (only accumulates while pointer is locked; click the canvas to lock). Avoid Ctrl-combos (Ctrl+W closes the tab).

Current controls: mouse steer, W/S thrust, A/D strafe, E/Q up/down, Shift boost.

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
