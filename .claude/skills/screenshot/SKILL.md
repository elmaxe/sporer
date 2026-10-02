---
name: screenshot
description: Take screenshots of this Three.js game in a headless browser with the ready-made `npm run shot` tool (steps for moving between levels, running JS, freezing a frame mid-transition, cropping and contact sheets). Use it any time something in-game needs to be checked by eye (a new visual, a shader, a camera move, a transition, a bug report about how something looks), before and after a visual change, and when the user asks for a screenshot. Never write a one-off browser/CDP script for this; extend scripts/shot.mjs instead.
---

# Screenshots of the game

`scripts/shot.mjs` (`npm run shot`) loads the game in headless Chrome, runs a list of **steps** and prints JSON with the PNG paths, JS results and console errors. Then **Read the PNGs** to look at them. It uses the same browser helper as the smoke test (`scripts/lib/browser.mjs`), and needs the dev server running.

## 1. Start the dev server (if it isn't already)

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/   # 200 = already running, reuse it
npm run dev -- --strictPort                                        # else: run_in_background: true
```

## 2. Take the screenshots

```bash
npm run shot -- --out <dir> --clean [--sheet] [--star <id>] <steps...>
```

- **`--out`**: in a cloud session, use a folder in your scratchpad directory so the user can open the files too. Otherwise any folder works; the default is a new temp dir.
- **`--clean`** hides the debug panel and FPS meter. Leave it off when you want to see the FPS meter or debug values.
- **`--low`** renders at `?quality=low` (half resolution, no antialiasing): about 5× faster under SwiftShader. Use it when a soft picture will do (checking a layout, that something shows up, a long sequence); leave it off to judge how a visual looks.
- **`--sheet`** also writes `sheet.png`: every shot in one labelled grid. Use it for sequences, so a single Read shows them all. Read single shots for detail.
- **`--star <id>` / `--seed <s>`**: which system/galaxy to start in (`--url` for anything else, e.g. a preview build on :4173). Default page size is 1280×720 (`--size`).
- **`--steps <file>`**: steps from a file, one per line, `#` comments. Use it when the JS gets long or needs quotes; put the file in the scratchpad.
- **`--phone`**: an emulated phone (390×844, mobile, real touch events), so the game (and the lab) run in touch mode with the on-screen controls; use `tap:<element id>` to press its buttons.
- **`--dump <file>`**: restore a debug dump's state (the player's `sporer-dump-*.json`, see `debug-dump`) at its page size and quality, then run the steps (default `shot:restored`). The game is left paused there.
- **`--lab [<query>]`**: shoot the planet lab (`lab.html`) instead of the game, e.g. `--lab "gen=7&type=ice&kind=moon"` or `--lab "seed=1337&star=5&planet=2"`. See *The planet lab* below.

Steps run in order. With no steps, you get `shot:view`.

| Step | Does |
|---|---|
| `shot:<name>` | screenshot → `<name>.png` |
| `crop:<name>:<x>,<y>,<w>,<h>[:<zoom>]` | crop of the **last** shot (CSS px), scaled up ×zoom (default 2, pixelated): for small details |
| `js:<expression>` | runs in the page, promises awaited; the value is printed in `results` |
| `wait:<ms>` | sleep |
| `until:<expression>[@<ms>]` | poll until truthy (default 20 s) |
| `settle` | wait until no level transition runs, plus a few frames |
| `galaxy` / `system` | `levels.toGalaxy()` / `levels.toSystem()` and settle |
| `freeze:<expression>` | stop the game loop on the first frame where the expression is true (checked after drawing), so the next `shot` is exactly that frame |
| `resume` | restart the loop after a freeze |
| `solo:<outgoing\|incoming>:<name>` | while frozen mid-crossfade: redraw with only that level showing and shoot it; compare the two sides of a handover (same place, same size?) |
| `tap:<element id>` | tap (with `--phone`) or click the middle of that element, e.g. `tap:menu-toggle`, `tap:touch-map` |
| `hover:<x>,<y>` / `hover:<expression>` | move the mouse to that point (CSS px, or an expression giving `{x, y}`) and wait a few frames: tooltips |
| `fps` | frames per second over 120 frames (headless SwiftShader: expect ~5–25) |
| `goto:<url or ?params>` | load another page, e.g. `goto:?star=2`, and wait for the game |

The page has the dev globals: `game`, `levels` (the `SceneManager`), `galaxy`, `ship`, `world` (the `StarSystem`), `system` (its data), `planet` (the planet level or null), `audio`, `menu` (the Esc menu: `menu.open()`, `menu.hide()`; open, the game is paused), `debugDump` (`data()`: the dump's data without pictures; `restore(state)`; `open()`: the dump dialog), `generateSystem`. See `threejs-game-conventions` for what the classes offer.

## 3. Look, and report

- Read each PNG (or the sheet) and check the thing you changed is visibly right. Check nothing else broke: HUD text, the sun, planets, the UFO.
- `errors` in the JSON must be empty. Quote any entry verbatim.
- If a step fails, the run stops, saves `failure.png` (what was on screen) and exits 1 with `failure` saying which step failed.
- Send the user the most telling shot (or the sheet) when it helps them see the result.

## Recipes

```bash
# The start view, then the galaxy map
npm run shot -- --out $OUT --clean --sheet shot:system galaxy shot:galaxy

# A star type: find its id, then start there
npm run shot -- "js:galaxy.stars.find((s) => s.stars[0].kind === 'redGiant').id"   # → results[0].value
npm run shot -- --out $OUT --clean --star 5 shot:red-giant
# kinds: mainSequence, redDwarf, whiteDwarf, redGiant, blueGiant; binaries: s.stars.length === 2 (star 2 at seed 1337)

# Mid-transition: freeze on a state, not a time (headless frame rates vary; a frame advances the clock by at most 0.25 s)
npm run shot -- --out $OUT --clean "js:levels.toGalaxy()" "freeze:levels.crossfade > 0.4" shot:handover resume settle shot:after
# the seamless zoom's own clock: "freeze:levels.seamless?.elapsed > 1.2"

# Both sides of a handover, to check they line up (then crop both around the subject and compare)
npm run shot -- --out $OUT --clean --sheet "js:levels.toGalaxy()" "freeze:levels.crossfade > 0.4" \
  solo:outgoing:system-side solo:incoming:galaxy-side resume

# A detail up close: shoot, then crop around it (here the screen centre, ×3)
npm run shot -- --out $OUT --clean shot:view crop:centre:540,260,200,200:3
```

A steps file for camera work and the planet level (`npm run shot -- --out $OUT --clean --sheet --steps $OUT/steps.txt`):

```text
# Look at a planet from close up (the orbit camera's focus override), then give the camera back
js:(() => { const p = world.planets[2], o = levels.systemLevel.orbit; o.setFocus(p.renderPosition); o.setDistance(p.radius * 5); })()
wait:500
shot:planet-close
js:levels.systemLevel.orbit.setFocus(null)
# Down to low orbit over the first planet, arriving on its day side (you arrive under the camera: look from the star)
js:(() => { const p = world.planets[0]; ship.parkAt(p); levels.systemLevel.orbit.lookFrom(world.stars[0].position.clone().sub(p.position)); levels.toPlanet(p); })()
until:levels.mode === 'planet'
settle
shot:low-orbit
```

More hooks:
- Galaxy camera: `levels.galaxyLevel.orbit`.
- Planet camera: `planet.orbit`.
- Galaxy spin: `levels.galaxyLevel.root.rotation.y`.
- Travel: `levels.galaxyLevel.ship.travelTo(galaxy.stars[42])`, then `until:!levels.galaxyLevel.ship.travelling`.
- Autopilot: `ship.moveTo(world.planets[1])`, then `until:!ship.enRoute`.

## The planet lab

For anything about how a planet or moon looks (terrain, seas, gas bands, atmospheres, rings, lava, geysers, the map, lighting), the lab is quicker than flying there: it builds exactly the body you ask for with the game's own code. The page has `game` and `lab` (`src/lab/PlanetLab.ts`); every `lab.*` edit returns a promise that resolves once it's built and drawn, and `settle` waits for `lab.ready`.

| Call | Does |
|---|---|
| `lab.generate(seed, { type, kind, insolation, moons })` | a new body from the game's generators (type: lava, barren, desert, terran, ocean, ice, gas; kind: dwarf, small, earth, superEarth, iceGiant, gasGiant, moon, comet, asteroid) |
| `lab.load(galaxySeed, star, planet, moon?)` | a planet (or moon) of the game |
| `lab.loadComet(galaxySeed, star, comet)` | a comet of the game, as active as at its closest pass (`?seed=&star=&comet=` in the URL) |
| `lab.loadAsteroid(galaxySeed, star, belt, asteroid)` | a named asteroid of the game (`?seed=&star=&belt=&asteroid=` in the URL) |
| `lab.set({ radius: 9, style: { seaLevel: 0.3 }, rings: {...}, climate: { setting: { heatFlow: 0.1 } } })` | edit anything (merged two levels deep); `lab.planet` is the model (a comet's `zone`, its distance from the star in habitable radii, sets its activity) |
| `lab.setType('ice')`, `lab.setKind('moon')`, `lab.terraform({ composition: 'oxygenNitrogen', pressure: 1 })` | the panel's type, size and climate edits |
| `lab.setView({ view: 'system', camera: 'fly', star: 'redDwarf', sunAzimuth: 90, sunElevation: 10, paused: true, wireframe: true })` | view, camera (orbit the planet or follow the UFO), light, clock |
| `lab.look(lon, lat, zoom)` | camera over longitude/latitude (degrees) at `zoom` planet radii |
| `lab.lookAtVent()` | the next geyser, lava or comet-jet vent, from the side so plumes stand against the sky |
| `lab.lookAtStorm(kind?, zoom?)` | globe view: the camera over the biggest storm under way (`'cell'`, `'cyclone'`, `'dust'`, `'global'`, `'ash'`), or with the fly camera the UFO beside it; resolves false if none (step the clock with `setTime` until one is) |
| `lab.setTime(t)` | jump the clock (eruptions, geysers, storms and lightning are pure functions of it) |
| `lab.climate`, `lab.level.geysers`, `lab.level.eruptions`, `lab.level.comet` (jets: `vents`, `strength`), `lab.level.globe`, `lab.level.globe.weather` (storms `shown`, `flashes`/`flashCount`), `lab.level.weather` (rain, bolts), `lab.level.triangles` | what got built |

```bash
# A cryo-geyser moon: airless, some heat, look at a plume
npm run shot -- --out $OUT --clean --lab "gen=21&type=ice&kind=moon" \
  "js:lab.terraform({ composition: 'none', pressure: 0 })" "js:lab.set({ climate: { setting: { heatFlow: 0.1 } } })" \
  "js:lab.lookAtVent()" wait:2500 shot:cryo
# Under a thunderstorm: the fly camera, the UFO sunk below the clouds (it eases there), next to the storm
npm run shot -- --out $OUT --clean --lab "seed=1337&star=0&planet=0" "js:lab.setView({ camera: 'fly', paused: true })" settle \
  "js:(async () => { const L = lab.level; L.ship.setRadius(L.globe.top + 3); while (Math.abs(L.ship.radius - L.globe.top - 3) > 0.05) await new Promise((r) => requestAnimationFrame(r)); })()" \
  "js:lab.lookAtStorm('cell')" settle shot:storm
# The same planet across all types (a contact sheet)
npm run shot -- --out $OUT --clean --sheet --lab "gen=5" "js:lab.setType('lava')" shot:lava "js:lab.setType('ocean')" shot:ocean "js:lab.setType('gas')" shot:gas
```

`--clean` hides the lab's control panel too; the readout (top right) stays, with the climate and what's active.

On a phone: `npm run shot -- --out $OUT --phone --lab "gen=4&type=terran" tap:touch-map "until:lab.level.map.baked" shot:phone-map`.

## Tips

- **Compare before/after.** Take the same steps on both versions, e.g. stash the change, shoot into `before/`, unstash, shoot into `after/`, and look at them side by side.
- **Timing.** Prefer `until:` and `freeze:` on game state over `wait:`. Headless rendering is slow, so the game runs slower than real time.
- **Input is blocked** during level transitions (wheel, clicks, keys). Drive things with `js:` calls, or `settle` first.
- **Animated things** (twinkle, storms, comets) differ between runs and frames. Freeze on a state, or compare structure rather than pixels.
- **Missing a step?** If a step you need is missing, add it to `scripts/shot.mjs`, keep the usage comment at its top and the table above in sync, and don't fork a new script.
- **When to use the smoke test instead.** `npm run smoke` is the pass/fail regression check (see `run-game`). This tool is for looking.
