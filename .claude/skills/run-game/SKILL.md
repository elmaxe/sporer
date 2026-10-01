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
npm run smoke                              # everything, ~5 min in the cloud container
npm run smoke -- --only planet,touch       # just the sections your change touches (~30 s each)
npm run smoke -- --quick                   # everything but the 13 planet types
npm run smoke -- http://localhost:4173/    # another server (a preview build)
```

**Run the sections your change touches while you work, and the whole thing once before pushing.** Sections, in order: `core` (flying, picking, system map, living stars, comets, eye, sky), `galaxy`, `audio`, `planet` (home planet loop, held zoom, seamless zooms), `types`, `lab`, `touch`. Each prints `[smoke] <section>: ok in 23.1 s` on stderr as it finishes, so a long run shows where it is. It renders at `?quality=low` (half resolution, no antialiasing: about 5× the frame rate under SwiftShader, which is what makes it take minutes rather than a quarter of an hour); `--full-quality` renders as players see it. A page that stops answering fails the run within 60 s, naming the step (`stalled`), and `--timeout <s>` (default 900) caps the whole run; either way the browser is killed. Run it in the background (or with a timeout above 10 minutes) rather than letting a foreground call time out.

`scripts/smoke.mjs` launches headless Chrome/Edge (SwiftShader WebGL) over the DevTools protocol. It loads the game, holds W for 2 s and checks that the ship moved along −Z, autopilots back to the start point (`autopilot`), hovers and clicks the star's screen position and checks it became the target and showed the tooltip (`pick`), checks the galaxy band and one orbit trail per planet and moon exist and screenshots the band towards the galactic centre (`sky`, `band.png`), then checks the stars and comets live (`living`: the star's clock keeps pace with the system's, storms have live particles, comets move and their nuclei are bodies), hovers and clicks a comet (`comet`: its name shows, the click sends the ship to its nucleus) and checks the exposure drops with the star filling the view (`eye`), then runs the galaxy loop with real wheel/pointer events (`galaxyLoop`: scroll out past max zoom → galaxy, check the step 6 polish in `galaxyLoop.polish` (distant galaxies, a slow spin, one dot per binary member, twinkle), turn the galaxy 1.2 rad, click the nearest star, scroll in mid-jump (held until it docks) → that star's system; the game is frozen once mid-handover for `handover.png`), then clicks the menu button for real (unlocking audio) and checks the menu opens and pauses the game with the Effects slider and a planet lab link, that a real Esc closes it (`menu.png`), and that each whoosh plays (`audio.sfx`: zoom out, galaxy travel, zoom in), then the planet loop (`planetLoop`: park on the day side of a planet, scroll in → low orbit, check the sky counts, click the globe and check the ship flew over it at its altitude and the sky's star kept animating in step with the planet level's clock (`skyStarTime` vs `skyClock`), scroll out → parked beside the same planet; frozen mid-handover going down for `planet-handover.png`), then `heldZoom` (autopilot to another body, scroll in while flying: the zoom must hold, then descend to that body on arrival), then `cometLoop` (the same planet loop over the home system's first comet at its closest pass: the irregular nucleus in low orbit with its jets, coma and tails on, then the level's clock jumped to its farthest point, where they're off; `comet.png`). From the galaxy loop to here, `seamless` records every frame of every level transition (crossfade weight and canvas brightness): each of system ↔ galaxy and system ↔ planet must be seen, crossfade, and never draw a black frame. Then the same planet loop for every planet type, a ringed solid planet and a moon in other systems (`planetTypes`, one `planet-<type>.png` screenshot each; `--quick` skips these, e.g. `npm run smoke -- --quick`). Then `lab` opens the planet lab (`lab.html`): every planet type and a moon must build and draw a lit planet in both the globe and the system view (lava worlds with eruptions), a game planet loads by star and index, and the panel's type control rebuilds the planet (`lab.png`). Last, `touch` reloads as an emulated phone (390×844, real CDP touch events): hold a finger on the star (tooltip), lift (autopilot), drag (rotates, no tap), pinch (half the distance for twice the spread), the on-screen stick with a second finger on Boost, pinch in at a planet, tap the globe, pinch out to the system and the galaxy, checking which on-screen controls each level shows (`touch-planet.png`), and that a tap on the menu button opens the menu and Resume closes it (`touch-menu.png`); `touchLab` then opens the planet lab on the same phone: panel folded, stick and Map button shown, a drag turns the camera, a tap on the globe flies the UFO, the Map button opens the map (`touch-lab.png`). It measures FPS and collects console errors, warnings and exceptions. It prints JSON with `ok`, `sections` (each one's `ok`, `seconds` and any `error`), `stalled`, `before`/`after`, `autopilot`, `pick`, `living`, `comet`, `eye`, `galaxyLoop`, `seamless`, `audio`, `planetLoop`, `heldZoom`, `cometLoop`, `planetTypes`, `touch`, `touchLab`, `lab`, `fps`, `errors`, and `screenshot` (final system) + `galaxyScreenshot` paths, and exits 1 on failure. SwiftShader is slow: at `?quality=low` on the cloud container's 4 cores, expect ~25 FPS in a system, ~15 in the galaxy and ~10 in low orbit (2–4.5 at full quality). **Read the screenshot file** to check the visuals. This needs no browser extension. Set `CHROME_PATH` if the browser isn't in a standard location. Each run starts a fresh browser and profile on a free debugging port (`scripts/lib/browser.mjs`, shared with the screenshot tool), so no saved settings such as mute carry over.

Extend the script when you add gameplay worth guarding, such as a new control or a new entity that should exist on load.

## 3b. Look at what you changed (screenshot skill)

The smoke test is pass/fail. To see a change (a new visual, a camera move, a transition), use the `screenshot` skill: `npm run shot -- --out <dir> --clean <steps...>` drives the game through steps (level changes, JS, freezing a frame mid-transition, crops, a contact sheet) and saves PNGs to Read. Don't write one-off browser scripts for this.

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

In the system view there's no manual flying: the ship always hovers above a body (it starts above the star) or is on the autopilot to the next one. Simulated keys still work in low orbit (WASD nudges the planet ship):

```js
// simulate held keys without focus issues
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })), 1500);
```

```js
// autopilot: fly to a body; poll until it hovers there
ship.moveTo(world.planets[0]);
({ enRoute: ship.enRoute, target: ship.targetBody.name, speed: ship.speed })
```

```js
// planet level: hover at a planet (teleport), descend, fly over the globe, come back up
ship.parkAt(world.planets[0]);
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
