---
name: research
description: How to research things online for this game and turn them into numbers and formulas you have actually checked. Use it whenever a real-world fact, value, formula or technique goes into the game (climate and temperature, atmospheres, gravity and escape velocity, star properties, lava and geysers, orbital mechanics, colours of real materials, rendering and shader techniques, library behaviour), and before tuning generation against "what's realistic". Every number must be looked up in a source or computed, never guessed or recalled; formulas are checked against real reference cases, and findings are written down in docs/research/.
---

# Research: measure, don't guess

The game is stylised, but its rules should come from the real thing: a hotter star, a closer orbit or a smaller body should do what they really do. So for every real-world number or relationship that goes into code:

1. **Look it up** in a source you actually read in this session. Memory is not a source.
2. **Measure it**: compute the formula yourself for real reference cases and compare with the measured values.
3. **Write it down** in `docs/research/<topic>.md`, with sources, the measurements and how it maps to game units.

If you can't do one of these (the network is blocked, or no source can be found), say so plainly. Label the value "unverified (from memory)" in the note and in your reply. Don't let it pass as a finding.

## 1. Frame the question

Before searching, write down:
- the exact quantity or relationship you need;
- which code it feeds (roadmap step, `gen/` module);
- the precision that matters. Usually "within ~10% and the right trend" for gameplay; exact for anything the player reads, such as temperatures in the HUD.

Also list the **reference cases** you will check against: real bodies with measured values. The Solar System covers most needs (Mercury, Venus, Earth, Moon, Mars, Jupiter, Io, Europa, Ganymede, Titan, Enceladus, Triton, Pluto), plus a few well-measured exoplanets or stars when the Solar System has no example.

## 2. Find sources

- **Prefer primary and authoritative sources.** For planets and moons, start with NASA's fact sheets: https://nssdc.gsfc.nasa.gov/planetary/factsheet/ (a table), per-body pages like `earthfact.html`, and the notes page for definitions. Beyond that: JPL Solar System Dynamics (ssd.jpl.nasa.gov), peer-reviewed papers (arXiv, NASA ADS), textbooks and university course notes. Wikipedia is fine for orientation; take the numbers from the source it cites.
- **Cross-check key numbers with a second independent source.** When they disagree, note both and why (definitions, epochs, rounding).
- **Record the details**: the URL, the date you accessed it, and the value exactly as printed, with units.

### Tools and their traps

- `WebSearch` finds pages. `WebFetch` reads a page, but a small model summarises it, and **summaries can drop or alter data**. It once returned the fact-sheet table without its Moon column. Use WebFetch to find where the data is, then take the numbers from the **raw page**:

```bash
# Raw table rows (here the NASA fact sheet; columns: Mercury Venus Earth Moon Mars Jupiter Saturn Uranus Neptune Pluto)
curl -sS -m 20 https://nssdc.gsfc.nasa.gov/planetary/factsheet/ | tr '\n' ' ' \
  | sed 's/<\/tr>/\n/g; s/<[^>]*>/ /g; s/&nbsp;/ /g' | tr -s ' ' | grep -E "Mean Temperature|Surface Pressure"
```

- For PDFs, save the file (`curl -o` into the scratchpad) and read the pages you need with the Read tool.
- In a cloud session, outbound traffic goes through a proxy. If a host is refused, read the environment's network documentation (`read_documentation`, topic `environment.network`) rather than guessing at a workaround.
- For broad surveys across many sources, the `deep-research` skill can gather material. Its findings still go through steps 3–4 here before anything enters the code.

## 3. Measure

Never trust a formula until it reproduces the measured reference values.

- **Compute it** in a throwaway script (`node -e` or a `.mjs`/`.ts` file in the scratchpad) with constants from a source (CODATA for physical constants), for every reference case, and print a table: computed, measured, difference.
- **Explain every mismatch** (a missing effect, different definitions, rounding). Keep the ones you can't explain as open questions. Don't tune them away silently.
- **Check the game's own code the same way.** Run the real `gen/` code against the reference cases, e.g. a scratch `check.ts` that imports from `src/gen/` and prints a table, run with `npx vite-node <file>`. Print the distributions over many generated systems too, as `threejs-game-conventions` asks.
- **Pin what must hold** in `tests/*.test.ts`: the reference cases within their tolerance, the trends (hotter closer in, thicker atmospheres on heavier bodies), and edge cases. The research note says why each tolerance is what it is.
- **For visuals**, measure too: sample colours from photos or spectra, then compare in-game with the `screenshot` skill.

Worked example (from `docs/research/planet-temperatures.md`). Equilibrium temperature T_eq = (S(1 − A) / 4σ)^¼, with the NASA solar irradiance S and Bond albedo A:

| Body | T_eq computed | NASA black-body | Measured mean surface | Surface − T_eq |
|---|---|---|---|---|
| Venus | 226.6 K | 226.6 K | 737 K (464 °C) | +511 K |
| Earth | 255.1 K | 254.0 K | 288 K (15 °C) | +33 K |
| Mars | 209.8 K | 209.8 K | 208 K (−65 °C) | −2 K |

Venus and Mars match exactly. Earth is 1.1 K off, which is recorded as an open question, not hidden. The last column is what a greenhouse model has to reproduce: roughly nothing for Mars's 0.006 bar, +33 K for Earth's 1 bar, and +511 K for Venus's 92 bar.

## 4. Map to the game, then write it down

- **Game units are compressed** (system units, `habitableRadius`, galaxy units). Convert physically: compute in SI or astronomical units, then map with one explicit, documented factor (e.g. the habitable radius ↔ the distance where an Earth analogue sits at 288 K). Don't mix physical and game constants in one formula.
- **Stylisation is allowed, but make it deliberate.** When the game departs from reality (compressed distances, exaggerated sizes, faster orbits), say so in the note and in a code comment, and keep the real trend.
- **The note** (`docs/research/<topic>.md`, one per topic) has these sections:
  - **Question**: what was needed, and for which code or roadmap step.
  - **Sources**: URL, access date, and what was taken from each, values quoted with units.
  - **Measurements**: the script (inline, so it can be rerun) and its output table.
  - **Game mapping**: the formulas as implemented, unit conversions, deliberate deviations.
  - **Open questions**: mismatches, and values still unverified.
- **In code**, point to the note with a short comment next to the constant or formula (`// See docs/research/planet-temperatures.md`). Put no uncited magic numbers in `gen/`.

## Checklist before using a researched value

- [ ] Every number traces to a source read this session, or to a computation from such numbers.
- [ ] Formulas reproduce the reference cases, and mismatches are explained or listed as open.
- [ ] The mapping to game units is explicit, and stylised departures are stated.
- [ ] The note in `docs/research/` is written or updated, and tests pin the reference cases and trends.
- [ ] The reply to the user says what was measured, what's unverified, and links the note.
