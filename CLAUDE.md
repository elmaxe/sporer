# Spore 2: space stage

Browser game in Three.js inspired by Spore's space stage. Stack: Vite + TypeScript (strict), three, Rapier (`@dimforge/rapier3d-compat`), lil-gui + stats.js (debug), Vitest.

## Commands

- `npm run dev`: dev server on http://localhost:5173 (debug panel on)
- `npm run typecheck` / `npm test` / `npm run build` / `npm run preview`
- `npm run smoke`: headless browser check (needs the dev server running): loads the game, flies forward, reports FPS and console errors plus a screenshot
- URL params: `?seed=<number or text>` picks the galaxy (default 1337), `?star=<id>` starts in that system (default: generated home system; the URL follows you as you change systems), `?debug` enables the debug panel in production builds

## Skills

- `threejs-game-conventions`: architecture, Entity lifecycle, physics/perf rules. Read before writing game code.
- `run-game`: start the server and verify in Chrome. Use after changes.

## Roadmap

See `ROADMAP.md`. Work one step at a time; when a step is verified, mark it ✅ there and push to `main`.
