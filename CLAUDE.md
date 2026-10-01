# Spore 2: space stage

Browser game in Three.js inspired by Spore's space stage. Stack: Vite + TypeScript (strict), three, Rapier (`@dimforge/rapier3d-compat`), lil-gui + stats.js (debug), Vitest.

## Commands

- `npm run dev`: dev server on http://localhost:5173 (debug panel on)
- `npm run typecheck` / `npm test` / `npm run build` / `npm run preview`
- `npm run smoke`: headless browser check (needs the dev server running): loads the game, checks the ship hovers above the star with no manual flying, checks the system map, the stars and comets are alive, hovers and clicks an asteroid belt, runs the galaxy and planet loops, enters a system inside each kind of nebula (every planet type, geyser kind and weather kind, `-- --quick` for just the home system; every zoom between levels must crossfade and never go black), plays with touch on an emulated phone, reports FPS and console errors plus screenshots. `-- --only <sections>` runs just some (`core,galaxy,nebulas,audio,planet,types,lab,touch`; use this while working, the full run before pushing); it renders at `?quality=low` unless `--full-quality`, prints each section's time as it goes, and fails fast (naming the step) if the page stalls
- `npm run shot -- --out <dir> --clean <steps...>`: screenshots of the running game after scripted steps (see the `screenshot` skill); `--lab` shoots the planet lab instead
- Planet lab: http://localhost:5173/lab.html (deployed at https://elmaxe.github.io/sporer/lab.html). One planet or moon drawn by the game's own code, every property editable in the panel (type, size, colours, sea, relief, gas bands, atmosphere, climate and the weather it brings, rings, moons, a comet's or asteroid's shape, a comet's activity, light, time), in low orbit or the system view. Use it to look at, debug and test planet features: `?gen=<seed>&type=<type>&kind=<size class, moon, comet or asteroid>` makes one, `?seed=<galaxy>&star=<id>&planet=<i>[&moon=<j>]` loads a game planet (`&comet=<k>` instead of `planet` a comet, `&belt=<b>&asteroid=<k>` a named asteroid), the `#hash` is the exact planet (the page keeps it updated; the game's menu (Esc, or the menu button on phones) and low orbit's debug panel open the current planet in it; it works on phones too), and `window.lab` drives it (`lab.set`, `generate`, `load`, `loadComet`, `loadAsteroid`, `look`, `lookAtVent`, `lookAtStorm`, `setTime`, `ready`)
- Deploy: every push to `main` runs typecheck/test/build in GitHub Actions (`.github/workflows/deploy.yml`) and publishes to https://elmaxe.github.io/sporer/
- URL params: `?seed=<number or text>` picks the galaxy (default 1337), `?star=<id>` starts in that system (default: generated home system; the URL follows you as you change systems), `?debug` enables the debug panel in production builds, `?quality=low` renders at half resolution without antialiasing (about 5× faster under software WebGL; the smoke test uses it)

## Skills

- `threejs-game-conventions`: architecture, Entity lifecycle, physics/perf rules. Read before writing game code.
- `run-game`: start the server and verify in Chrome. Use after changes.
- `screenshot`: take in-game screenshots with `npm run shot` whenever something needs checking by eye (the planet lab with `--lab`: the quickest way to see a planet feature on any kind of body).
- `research`: researching anything real-world (climate, atmospheres, physics, techniques): look it up, measure it against reference cases, record it in `docs/research/`. Never guess numbers.

## Roadmap

See `ROADMAP.md`. Work one step at a time; when a step is verified, mark it ✅ there and push to `main`.
