# Spore 2: space stage

A browser game inspired by the space stage of *Spore*. Fly a UFO through a procedurally generated spiral galaxy, zoom from the galaxy map into a star system and all the way down to low orbit over a planet, in one continuous scroll.

**Play it:** https://elmaxe.github.io/sporer/ · **Planet lab:** https://elmaxe.github.io/sporer/lab.html

![A star system: the sun, planets on their orbits, comets and the UFO, with the system map in the corner](docs/screenshots/system.png)

## Screenshots

| | |
|---|---|
| ![The galaxy map: 4000 stars in spiral arms](docs/screenshots/galaxy.png) | ![An Earth-like planet with clouds and a soft atmosphere](docs/screenshots/planet.png) |
| **The galaxy.** 4000 stars in spiral arms. Click one to travel there, then scroll in to enter its system. | **A planet from orbit.** Continents, seas, drifting clouds and an atmosphere that hazes at the limb. |
| ![Low orbit: the UFO flying over hills and clouds](docs/screenshots/low-orbit.png) | ![A lava world glowing with molten seas](docs/screenshots/lava.png) |
| **Low orbit.** Scroll in on a planet to go down and fly over its surface. | **A lava world.** Animated molten seas with a cracking crust, and eruptions up close. |

## What's in it

- **One seed, a whole galaxy.** Everything is procedural and deterministic: the same `?seed=` always gives the same stars, planets, moons and climates, and a system is identical every time you return.
- **Seamless zoom between scales.** Galaxy → system → low orbit and back with the scroll wheel, crossfading between levels without cutting to black.
- **Spore-style controls.** Click a star, planet or point to autopilot there. Scroll to zoom, drag to orbit the camera, WASD to nudge. Touch controls on phones.
- **Living stars.** Granulation, sunspots, prominences and flares. Main-sequence stars of every class, red and white dwarfs, giants and binaries.
- **Varied worlds.** Lava, barren, desert, terran, ocean, ice and gas giants, from tiny moons to huge Jupiters, with rings, moons and comets on elliptical orbits; fly down to a comet's lumpy nucleus and watch its jets wake near the star.
- **Climate from real physics.** Temperature, air pressure and composition, and geothermal heat follow the star, the orbit and the body's size. They drive atmospheres, lava, cryo and steam geysers, and weather (clouds, storms, rain, snow and lightning). Habitable worlds grow plants, more species and denser cover the more Earth-like they are. The numbers are checked against real references in [`docs/research/`](docs/research/).
- **Nebulas.** Named emission, reflection and dark nebulas, planetary nebulas round white dwarfs and supernova remnants on the galaxy map. Fly into one and its gas fills the sky of the systems inside, down to low orbit.
- **Maps.** A row-of-planets system map and an Equal Earth map of the planet you're orbiting.
- **Sound.** Music, ambience and synthesised whooshes for travel and transitions.

## Controls

| | |
|---|---|
| Left-click | Fly to a star, planet or point |
| Scroll | Zoom. Past the limits it moves between galaxy, system and low orbit |
| Drag | Rotate the camera |
| WASD, E/Q | Nudge the ship, up/down |
| Shift | Boost |
| N / M | Map / mute |
| Esc | Menu |

## Planet lab

[`lab.html`](https://elmaxe.github.io/sporer/lab.html) draws one planet or moon with the game's own code and lets you edit every property: type, size, colours, sea, relief, gas bands, atmosphere, climate and weather, rings, moons, light and time. Use `?gen=<seed>&type=<type>&kind=<size>` to make one, or `?seed=<galaxy>&star=<id>&planet=<i>` to load one from the game. The game's menu opens the current planet in it.

## Running it

Needs Node.js.

```bash
npm install
npm run dev        # http://localhost:5173 (debug panel on)
```

| Command | Does |
|---|---|
| `npm run typecheck` | TypeScript checks |
| `npm test` | Unit tests (Vitest) |
| `npm run build` / `npm run preview` | Production build and a local preview of it |
| `npm run smoke` | Headless browser check of the whole game (needs the dev server running) |
| `npm run shot` | Scripted in-game screenshots |

URL parameters: `?seed=<number or text>` picks the galaxy, `?star=<id>` starts in a given system, `?debug` shows the debug panel in production builds, `?quality=low` renders at half resolution.

Every push to `main` runs the typecheck, tests and build in GitHub Actions and deploys to GitHub Pages.

## Tech

[Three.js](https://threejs.org/), [Rapier](https://rapier.rs/) physics, TypeScript (strict), Vite, Vitest, with lil-gui and stats.js for debugging.

| Folder | Holds |
|---|---|
| `src/gen/` | Pure, seeded generation: galaxy, nebulas, stars, planets, climate, weather, geysers, plants, comets |
| `src/levels/` | The galaxy, system and planet levels and the scene manager that zooms between them |
| `src/galaxy/`, `src/world/`, `src/planet/`, `src/surface/` | What each level draws (`surface/`: plants on the ground) |
| `src/player/` | Ship, autopilot, orbit camera, picking |
| `src/audio/`, `src/ui/` | Sound, HUD, maps, menu |
| `src/lab/` | The planet lab |
| `docs/research/` | Real-world references behind the numbers |

## Roadmap

The game is built in small, verified steps. See [`ROADMAP.md`](ROADMAP.md) for what's done and what's next: asteroid belts, rogue planets and dust in systems.
