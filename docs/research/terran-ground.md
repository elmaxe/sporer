# Terran ground: how green worlds' land looks and how high it stands

## Question

The player found terran worlds boring up close: the green ground was one flat painted colour (style `low` → `high` by height) with no texture, and the terrain too rough and too high. How did Spore texture its planets, and how should a green world's land be shaped?

Needed for `gen/planets.ts` (`landElevation`, `PlanetStyle.plains`, the terran and ocean relief), `gen/terranGround.ts` (the detail colours, where snow lies) and `world/groundLook.ts` (the per-pixel look in both views).

Precision: the look and the trends (lowlands flatter than mountains, snow where it's cold); stylised where noted.

## Sources

All accessed 2026-10-05.

### Spore

- **Compton et al., "Creating Spherical Worlds"**, SIGGRAPH 2007 sketch (Maxis), https://www.cs.cmu.edu/~ajw/s2007/0251-SphericalWorlds.pdf (read from the PDF): the control texture is "derived directly from the height field … we take the heightfield thresholded against water level, the gradient, and curvature". Heights come from brushes that "represent planet features such as rivers, mesas, canyons, oceans, and plateaus". Already cited in ice.md.
- **Ocean Quigley** (Spore's art director), "Spore's procedural terrain texturing", 2009, http://oceanquigley.blogspot.com/2009/04/spores-procedural-terrain-texturing.html. The text came from the blog's feed; the diagrams were read as images:
  - "It was really important to me that the textures conform meaningfully to the terrain. I didn't want them to look like a carpet covering the landscape".
  - *Procedural planet texturing* diagram: the heightfield, its 1st-derivative (slope) and 2nd-derivative (curvature) filters are "blended to make the control map"; its high, mid and low ranges are extracted and packed into RGB, each driving the alpha of one of three greyscale detail textures, which are colourised. A colour ramp (green → brown → tan → white) tints the control map into the base colours, and "base textures are blended with the detail textures". In its pictures the valleys (the 2nd derivative's drainage lines) come out green and the crests brown.
  - *Planetary Materials* diagram: the control textures are "one RGBA, 256 square texture per each of 6 faces"; "Tiling noise is mixed into the control texture to break up large homogenous areas" (enumerated biome noise); detail textures are "tinted by detail color, then placed on the planet according to the derived control textures"; detail colours "are derived from the initial color choices"; the planet's colour table blends a dead and a living ramp by the terraforming score; "The beach consists of two tiling textures. The alpha ramp, mapped to height controls how they blend"; cliffs get "a simple, tiling texture"; "The water color tints the seabed texture."
  - Test renders: brown-and-green planets with sand-coloured beaches along every shore, smooth rolling ground, distinct crater rims and mesas.

### Real land

- **Earth's hypsometry**: mean land elevation 797 m (Eakins & Sharman 2012; 840 m by Kossinna 1921), via a search summary of Carleton SERC, https://serc.carleton.edu/quantskills/methods/quantlit/cumperc.html, and Britannica's "hypsometric curve". The highest point is Everest, 8849 m. So the mean is 9% of the highest: most land is low.
- **Lapse rate**: 6.5 K/km in the troposphere (ICAO standard atmosphere / U.S. Standard Atmosphere 1976).
- **Snow lines**: "In the tropical zone the ELA is approximately 5000–6000 m … near the Equator around 4500–5000 m" and there the snow line "coincides with the 0 °C isotherm of annual temperature" (Polarpedia, "Equilibrium line altitude (ELA)", https://polarpedia.eu/en/equilibrium-line-altitude-ela/, via a search summary). Away from the tropics the equilibrium line follows the summer's temperature and the precipitation (Ohmura, Kasser & Funk 1992, "Climate at the equilibrium line of glaciers", J. Glaciology 38(130), abstract via the search).

## Measurements

The land's heights before the change (`gen=4` terran in the lab, and Lejyl I in galaxy 1337, 2470 random land points): the noise's height above sea level is already bottom-heavy, its median 0.25 of the way to the top, so a linear mapping put the land's median at a quarter of the peaks (about 6 units on an Earth-sized globe of radius 400, peaks 19–32 units against the 4-unit UFO), crumpled by the detail octaves everywhere.

`landElevation` = a·h + (1 − a)·h³, a = `PLAINS_SLOPE` = 0.5 at full plains:

| h | 0.1 | 0.25 | 0.5 | 0.75 | 1 |
|---|---|---|---|---|---|
| elevation | 0.0505 | 0.133 | 0.31 | 0.586 | 1 |

Its mean over an even h is a/2 + (1 − a)/4 = 0.375 (against 0.5 linear and Earth's 0.09). With the noise's own skew the land's median elevation is about 0.13 of the peaks.

The snow line with `groundTemperature` (the plants' latitude model, `LATITUDE_SWING` 19 K, minus 6.5 K/km × 8.849 km = 57.5 K at elevation 1) and `snowTemperature` (273.15 K − 7 K·sin² latitude):

- Earth (288 K mean) at the equator: (300.7 − 273.15) / 6.5 = 4.2 km, against the real 4.5–5 km.
- Earth's sea level: snow from about 70° (tested between 65° and 75°), as Greenland's and Antarctica's edges; at 0 °C everywhere it would have started at 60°, which whitened the boreal belt of every temperate world.

## Game mapping

- **Sea** (`gen/planets.ts`, issue #152): a terran world's `seaLevel` is −0.4 to −0.15 (was −0.15 to 0.15), so its seas cover 15–33% of the globe, about 23% on most (was 33–66%, about half). **Stylised**: Earth's ocean is 71%, but the player wants green worlds mostly land, as Spore's are. Ocean worlds keep 0.25–0.4 (75–85% sea). The same draw, so nothing else moves.
  - The share of the globe below a `terrainNoise` threshold (300 random seeds × 2000 random directions; `tests/terranGround.test.ts` checks the terran mean):

    | sea level | −0.6 | −0.5 | −0.4 | −0.3 | −0.25 | −0.2 | −0.15 | 0 | 0.15 |
    |---|---|---|---|---|---|---|---|---|---|
    | sea | 7% | 10% | 15% | 21% | 25% | 29% | 33% | 50% | 66% |

    One world differs from the next by about ±0.07 at the same level (10th–90th percentile 0.26–0.44 at −0.15).
- **Relief** (`gen/planets.ts`):
  - Terran and ocean worlds' relief is 0.012–0.02 of the radius (0.02–0.035 before issue #152, 0.03–0.05 before that): rolling country under low ranges, the highest peaks of an Earth-sized globe (radius 400, relief ×1.6 up close) 8–13 units up, against the 4-unit UFO (were 13–22). The same draw, so nothing else moves.
  - `plains: 1` (not a draw) flattens their lowlands with `landElevation`: gentle plains along the coasts, mountains rising steeply above them. **Stylised**: a third of the peaks on average, not Earth's tenth, so the land still has shape from orbit.
  - The coasts and the sea floor don't move: only the height above sea level is reshaped. The sampler (`terrainSampler`), the geysers' `groundRadius` and the map's hillshade all read it; the peaks stay at `peakRadius`.
  - The plains also take most of the crumpling out of the low ground, since the hills' detail is scaled by the curve's slope there (0.5 at the shore).
- **Look** (`world/groundLook.ts`), Spore's recipe on the lit terrain material of both views, over the painted colours:
  - **Curvature**: the terrain's own detail octaves (`terrainDetail`, mirrored on the GPU with the seed's phases reduced mod 2π in double precision) give > 0 on crests, < 0 down valleys. Valleys lusher (the low colour darker and richer), crests drier (turned 45% towards the highland hue) and, where steep, bare soil. Each octave fades out once its hills are under a few pixels.
  - **Biome noise** at 220 and 81 units: lush and dry patches.
  - **Beach**: sand (the painter's seabed sand, so it runs on under the clear shallows) below `MIN_ELEVATION`, where plants don't grow, wobbled by noise, darker at the waterline. Low orbit only: the system view's 8-segment mesh can't place it.
  - **Cliffs**: rock with strata where the slope is past 21–37° (1 − cos 0.07 → 0.2; trees hold to 24°, bushes 42°).
  - **Snow**: where `groundTemperature` < `snowTemperature`, mostly off steep rock.
  - **Grain**: three scales of noise (0.8, 2.6 and 8 units) brightening and darkening the ground and bumping its normal, as Spore's tiling detail textures; weaker on sand and snow.
  - Everything too small for its pixels fades to its average, so the system view (`unit` = `PLANET_SCALE`) and low orbit match.
  - Earth (a real colour map) keeps its colours and gets the grain only.
- **Tunables**: debug folder Ground (`groundParams`).
- **Cost**: none measurable: 34 FPS with it and 32 without in low orbit (headless SwiftShader, `?quality=low`, the same frame).

## Open questions

- Spore's actual detail textures and colour ramps weren't extracted from the game files; the detail colours here are derived from the painted ones.
- No seasons: snow lasts the year where it lies.
- Desert and barren worlds still have the old flat colouring; the same recipe (sand ripples, rock grain) would suit them.
