---
name: run-game
description: Start this Three.js game's dev server and verify it in Chrome, checking that it renders, the console is error-free, controls respond and FPS is healthy. Use after any change to src/, index.html or dependencies, or when asked to run, play, screenshot or debug the game in the browser.
---

# Run and verify the game in the browser

## 1. Static checks first

```bash
npm run typecheck && npm test
```

Fix failures before opening the browser.

## 2. Start the dev server

Start it in the **background** (`run_in_background: true`) so it keeps running:

```bash
npm run dev -- --strictPort
```

- URL: `http://localhost:5173/`. `--strictPort` makes it fail loudly instead of silently switching ports.
- If the port is taken, a dev server is probably already running from an earlier turn. Check with `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/` and reuse it if it returns 200.
- Vite hot-reloads on save. Changes to `main.ts` or core modules trigger a full page reload, which is fine.

## 3. Automated smoke test (always run this)

```bash
npm run smoke            # or: npm run smoke -- http://localhost:4173/
```

`scripts/smoke.mjs` launches headless Chrome/Edge (SwiftShader WebGL) over the DevTools protocol. It loads the game, holds W for 2 s and checks that the ship moved along −Z, autopilots back to the start point (`autopilot`), hovers and clicks the star's screen position and checks it became the target and showed the tooltip (`pick`), then runs the galaxy loop with real wheel/pointer events (`galaxyLoop`: scroll out past max zoom → galaxy, check the step 6 polish in `galaxyLoop.polish` (distant galaxies, a slow spin, one dot per binary member, twinkle), turn the galaxy 1.2 rad, click the nearest star, wait for travel, scroll in → that star's system), then clicks the speaker button for real (unlocking audio) and checks the Effects slider exists and each whoosh plays (`audio.sfx`: zoom out, galaxy travel, zoom in), then the planet loop (`planetLoop`: park on the day side of a planet, scroll in → low orbit, check the sky counts, click the globe and check the ship flew over it at its altitude, scroll out → parked beside the same planet), then the same planet loop for every planet type and a moon in other systems (`planetTypes`, one `planet-<type>.png` screenshot each; `--quick` skips these, e.g. `npm run smoke -- --quick`). It measures FPS and collects console errors, warnings and exceptions. It prints JSON with `ok`, `before`/`after`, `autopilot`, `pick`, `galaxyLoop`, `audio`, `planetLoop`, `planetTypes`, `fps`, `errors`, and `screenshot` (final system) + `galaxyScreenshot` paths, and exits 1 on failure. SwiftShader is slow: expect ~5–15 FPS in the planet level headless. **Read the screenshot file** to check the visuals. This needs no browser extension. Set `CHROME_PATH` if the browser isn't in a standard location. It refuses to start if something already listens on its debug port (9333): kill a browser left over from a crashed run (`pkill -f remote-debugging-port=9333`), since reusing it carries over saved settings such as mute.

Extend the script when you add gameplay worth guarding, such as a new control or a new entity that should exist on load.

## 4. Interactive check in Chrome (optional, claude-in-chrome)

Use this for things the smoke test can't show: visual feel, or anything needing real clicks. If `tabs_context_mcp` says the extension is not connected, skip this step and rely on step 3.

Load the tools in one ToolSearch call:
`select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__javascript_tool`

1. `tabs_context_mcp` → `tabs_create_mcp` (new tab, never reuse the user's tabs) → `navigate` to `http://localhost:5173/`.
2. Take a **screenshot** with `computer`. Expected: black space with stars, a glowing yellow sun ahead, planets around it, the UFO in the centre (the camera orbits it), the stats meter top-left, the lil-gui panel top-right, and speed + controls help bottom-left.
   - Still showing "Loading…" → startup failed; check the console.
   - "Failed to start: …" text → the error is right there.
3. Read the console with `read_console_messages` and `pattern: "error|Error|warn"`. There should be no errors. Treat any three.js warnings (e.g. deprecated APIs) as work to fix.

### Exercise gameplay

- **Mouse**: real clicks work: click a planet and the HUD should show `Autopilot → <name>`, then `Parked at <name>`. Scroll zooms; drag rotates. Hovering a body shows a tooltip.
- **Keyboard**: click empty space first to focus (this also starts an autopilot move; any WASD key cancels it), then hold keys with `computer` (`key` / hold actions for `w`, `shift+w`, `a`, `e`). Screenshot again and confirm the ship moved and the HUD speed changed.
- **Direct state** via `javascript_tool` (the dev build exposes `window.game`, `galaxy`, `levels`, `generateSystem`, for the current system `ship` / `world` / `system`, and `planet` for the planet level, or null):

```js
// speed, position and scene size
({ speed: ship.speed, pos: ship.object.position.toArray(), objects: game.scene.children.length })
```

```js
// simulate held keys without focus issues
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })), 1500);
```

After ~2 s, `ship.speed` should be > 0 and the position should have moved along the camera's forward direction (−Z at spawn, toward the sun).

```js
// autopilot: fly to a body (or pass any {x, y, z}); poll until parked
ship.moveTo(world.planets[0]);
({ enRoute: ship.enRoute, target: ship.targetBody?.name, speed: ship.speed })
```

```js
// planet level: park at a planet, descend, fly over the globe, come back up
ship.parkAt(world.planets[0], world.stars[0].position.clone().sub(world.planets[0].position)); // day side
levels.toPlanet();                                   // then, after ~1.3 s: levels.mode === 'planet'
planet.ship.moveTo(planet.ship.direction.clone().add({ x: 0.3, y: 0, z: 0 }));
({ sky: planet.skyStats, enRoute: planet.ship.enRoute, speed: planet.ship.speed });
levels.leavePlanet();
```

```js
// levels: switch without scrolling, travel in the galaxy, inspect
levels.toGalaxy();                                   // then, after ~1.3 s:
levels.galaxyLevel.ship.travelTo(galaxy.stars[42]);  // wait until !levels.galaxyLevel.ship.travelling
levels.toSystem();
({ mode: levels.mode, transitioning: levels.transitioning, system: system.name })
```

- **FPS**: stats.js is in the screenshot (top-left). Alternatively measure it:

```js
new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { if (++n === 120) r(Math.round(120000 / (performance.now() - t0))); else requestAnimationFrame(f); })(); })
```

Around 60 FPS (or the monitor rate) is healthy. Report anything well below that.

## 5. Production build check (when shipping or touching config)

```bash
npm run build && npm run preview -- --strictPort --port 4173
```

Open `http://localhost:4173/?debug` to check the production bundle with debug tools on. Without `?debug`, no GUI or stats should appear.

## 6. Clean up

- Stop the background dev/preview servers when you are done, unless the user wants them kept running. **On Windows, TaskStop kills only the npm wrapper and leaves Vite holding the port.** Afterwards, check with `netstat -ano | grep ":5173 " | grep LISTEN` and kill the PID (`taskkill //PID <pid> //F` from bash) if it is a `vite.js` process you started.
- Use `?star=<id>` / `?seed=<text>` to smoke-test other systems, e.g. `npm run smoke -- "http://localhost:5173/?star=2"` (a binary).
- Close the tab you created (`tabs_close_mcp`).
- Report what you checked, with a screenshot and any console errors quoted verbatim.

## Troubleshooting

- **Rapier errors / "RAPIER.init" / wasm failures**: the game must import `@dimforge/rapier3d-compat` (WASM inlined), not `@dimforge/rapier3d`. Every Rapier call must happen after `Physics.create()` resolves.
- **Black screen, no errors**: check the camera near/far planes and that the entity was `game.add`-ed. Also check it added its object to the scene.
- **Controls dead**: the canvas needs focus. Key state is cleared on window blur.
- **Stale behaviour after edits**: hard reload with `navigate` to the same URL.
