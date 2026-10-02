---
name: debug-dump
description: Read a debug dump from this game (a sporer-dump-*.json file the player saved with the menu's "Save debug dump" button or F8) and reproduce what it shows. Use whenever the user shares, attaches or mentions a dump file, a sporer-dump JSON, or a bug report made with the dump button, before guessing at the problem; and when changing what the dump records (src/debug/).
---

# Debug dumps

The player presses **Save debug dump** in the menu (Esc, or the menu button on phones) or **F8**. The game freezes, captures the frame, and opens a dialog where they **tap the picture to mark the problem** (numbered rings) and write a note. Then they **Save file** or **Share…** (phones) a single `sporer-dump-YYYY-MM-DD-HHMM-SS.json`. It holds:

| Key | What |
|---|---|
| `note`, `marks` | what the player wrote, and the spots they marked (`x`, `y`: 0–1 across and down the picture) |
| `images.annotated` | JPEG: the screen with the marks as numbered rings and a summary strip **under** it (note, where, build, device, FPS, console). Look at this first |
| `images.screen` | JPEG: what the player saw, the game with the HUD, tooltip, maps and buttons drawn over it (html-to-image). `images.screenError` if that failed |
| `images.game` | PNG: the game canvas alone, exact pixels (the planet map's terrain is drawn in it; HTML overlays aren't) |
| `state` | the game's state (`GameState` in `src/debug/dumpFormat.ts`): seed, system id, level (`mode`), mid-transition or not, camera and orbit, system clock, the ship and its target body, every body's spin, low orbit's body, clock and ship spot, the galaxy's spin, graphics switches, the HUD's text, the tooltip, which maps were shown, and the overlays' rectangles (CSS px) |
| `device` | user agent, viewport (CSS px), devicePixelRatio, touch, orientation, home-screen app, fullscreen |
| `renderer` | GPU, WebGL version, pixel ratio, drawing buffer, quality, draw calls and triangles in the last frame, programs, context lost |
| `performance` | FPS stats and the last ~600 frame times, JS heap, uptime |
| `log` | the console's errors and warnings, uncaught exceptions and rejections since the page loaded (last 100) |
| `build`, `url`, `createdAt` | which build (branch, CI build number, commit), the page URL, when |
| `tunables` | lil-gui's values when the debug panel was on (dev builds and `?debug`) |

## 1. Unpack it

```bash
npm run dump -- <file.json> [--out <dir>]
```

Default out dir: a folder named after the file next to it. Use one in your scratchpad if the file sits somewhere read-only. It writes `annotated.jpg`, `screen.jpg`, `game.png` and `state.json` (everything but the pictures), and prints a summary: the note, each mark in picture pixels and page CSS px, the build, the level and body, the camera, HUD text, device, GPU, frame stats, **every console entry**, the planet lab link for the body in low orbit, and the command that reproduces it.

Then **Read `annotated.jpg`**: the marked spots are the problem. Read `screen.jpg` or `game.png` (crop with the shot tool's `crop:` on a restored shot, or just Read them) for detail under the rings. A mark at 1 is the player's first tap.

Things to check before anything else:
- **Console entries.** An error there is often the whole story.
- **Build.** Compare `build.commit` with `git log`: the problem may already be fixed, or come from a branch.
- **Device.** Phones (`touch`, small viewport, high DPR) and their GPUs are where most layout and shader problems show; `renderer.quality` `low` means `?quality=low`.
- **Mid-transition** (`state.transitioning`): the frame was part of a crossfade, which can't be restored exactly (see below).
- **Layout problems** (text that doesn't fit, overlapping panels): `state.ui.overlays` has each overlay's rectangle in CSS px, `state.ui.hud` the text; compare with `screen.jpg`.

## 2. Reproduce it

Start the dev server (see `screenshot`), then:

```bash
npm run shot -- --dump <file.json> --out <dir> --clean [steps...]
```

It loads the dump's seed and system at its page size and quality (a touch device in `--phone` mode), then restores the state (`debugDump.restore(state)`): graphics switches; the system clock and every body's spin; the ship at its body; for low orbit, the descent to the body, its clock and spin, the ship's spot and altitude, and the globe's detail built; for the galaxy, its spin; then the orbit camera's distance, direction and look-up, the HUD and the map. It leaves the game **paused** at that moment, and the first result is a list of notes on what couldn't be matched (a ship caught mid-flight is parked at its destination; a mid-transition dump comes back at the incoming level, settled). With no steps it takes `shot:restored`; add more steps as usual, e.g. `crop:` around a mark, `js:game.paused = false` then `wait:` to watch it move, or `freeze:` on something.

Compare `restored.png` with `screen.jpg`. Animated things (twinkle, storm particles) and the pixel ratio (headless runs at DPR 1) differ; positions, the body, the light and the terrain should match. If they don't, that's a restore bug: fix it in `src/debug/gameState.ts`.

Other ways in:
- **The planet lab**: in low orbit the summary prints the body's lab link (`state.planet.lab`), the quickest way to change things about the planet and look again (`npm run shot -- --lab ...` with the part after `lab.html?` or the `#hash`).
- **A real phone or GPU problem** that headless SwiftShader doesn't show: say so, and reason from the pictures, the GPU string and the log, rather than claiming it's reproduced.

## 3. Fix, then check against the dump

After a fix, run the same `--dump` command and compare with the dump's pictures. Report what the player marked, what caused it and what changed, with the restored before/after shots.

## Changing the dump

- The format is `src/debug/dumpFormat.ts` (`DUMP_VERSION`; bump it when a field changes meaning). Capture and restore of the game state: `src/debug/gameState.ts`. The button, pictures and file: `src/debug/DebugDump.ts`; the dialog: `src/ui/DebugDumpDialog.ts` (`#dump` in `index.html`); the marked-up picture: `src/debug/annotate.ts`; the console log: `src/debug/consoleLog.ts`; frame times: `src/debug/frameTimes.ts`.
- Something new the game shows that a bug report would need (a new level, a new kind of body, a setting) → record it in `GameState`, restore it in `restoreGameState`, and print it in `scripts/dump.mjs`.
- The smoke test's `audio` section takes a dump through the menu and checks the file.
