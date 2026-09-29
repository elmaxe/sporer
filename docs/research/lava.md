# Lava: colour, fountains and eruptions

## Question

Roadmap step 14 animates lava seas (`world/lavaMaterial.ts`) and throws glowing blobs up from vents in low orbit (`gen/lavaActivity.ts`, `planet/LavaEruptions.ts`). It needs:

1. The **colour of lava by temperature**, for the ramp from cooled crust to the hottest melt, and for blobs cooling in flight.
2. **How high and how long** real lava fountains fly, on Earth and on Io (the only other body with active silicate volcanism), and whether a ballistic arc h = v·t − ½·g·t² describes them.
3. How that maps to the planet level's units, where the look has to be stylised.

Precision: the order and rough temperatures of the colours (it's a look, not a readout), and the right trend of height and time with gravity.

Reference cases: the 1959 Kīlauea Iki eruption (Hawaii's tallest measured fountain) and the 1999 Tvashtar eruption on Io (seen by Galileo).

## Sources

All accessed 2026-09-29.

- **Oregon State University, Volcano World, "Why is lava different colors?"**, https://volcano.oregonstate.edu/faq/why-lava-different-colors: "It starts out bright orange (1000-1150 C). As it cools the color changes to bright red (800-1000 C), then do dark red (650-800 C), and to brownish red (500-650 C). Solid lava is black (but can still be very hot)."
- **USGS, via web search summary** (page not fetched, so only as a cross-check): yellow at about 1,000–1,200 °C; bright red flows up to 1,165 °F (630 °C), orange over 1,600 °F (870 °C). Consistent with the order above: black → brownish/dark red → bright red → orange → yellow as temperature rises.
- **USGS, "1959 Kīlauea Iki eruption"**, https://www.usgs.gov/volcanoes/kilauea/science/1959-kilauea-iki-eruption (read via WebFetch): "the fountains grew from 15 to 30 m (50 to 100 ft) high", "lava fountain heights fluctuated between about 200 and 300 m", "episode 15 produced lava fountains that were approximately 580 m (1,900 ft) high".
- **NASA/JPL, "Galileo Sees Dazzling Lava Fountain on Io"**, https://www.jpl.nasa.gov/news/galileo-sees-dazzling-lava-fountain-on-io/ (read via WebFetch): "a fiery lava fountain shooting more than a mile above the moon's surface", observed November 25 (1999). The JPL image caption PIA02545 (search result) gives "heights of up to 1.5 kilometers".
- **Io's gravity**, from JPL's GM = 5959.91547 km³/s² and R = 1821.49 km (already in `climate.md`): g = GM/R² = 1.796 m/s².

## Measurements

A blob thrown straight up at v climbs to h = v²/2g and lands after T = 2v/g. Inverting for the reference fountains:

```bash
node -e '
for (const [n, h, g] of [["Kilauea Iki 1959", 580, 9.80665], ["Tvashtar 1999 (Io)", 1500, 1.796]]) {
  const v = Math.sqrt(2 * g * h);
  console.log(n, "v", v.toFixed(1), "m/s  T", (2 * v / g).toFixed(1), "s  in planet units", (h / 63710).toFixed(4));
}'
```

| Fountain | Height | g (m/s²) | Launch speed | Flight time | Height in planet units |
|---|---|---|---|---|---|
| Kīlauea Iki, 1959 | 580 m | 9.81 | 106.7 m/s | 21.8 s | 0.009 |
| Tvashtar, Io, 1999 | 1.5 km | 1.796 | 73.4 m/s | 81.7 s | 0.024 |

Lower gravity throws the Io fountain ~2.6× higher from a slower launch, and its flight takes ~4× longer: the trend the game keeps. (Real fountains are gas-driven jets, not single throws, so these speeds are lower bounds for the fastest clots; the ballistic arc is still how each clot falls.)

`tests/lavaActivity.test.ts` checks the arc as implemented (`ballisticPoint`): it lands back on the sphere after 2v/g, peaks at v²/2g halfway, and weaker gravity gives higher, longer arcs.

## Game mapping

- **Colour ramp** (`lavaRamp` in `world/lavaMaterial.ts`, the blob shader in `planet/LavaEruptions.ts`): black crust → dark red → orange → yellow-white with rising heat, the Volcano World order. Hot values go above 1 and are tone mapped, so the hottest melt reads as glowing. Blobs start yellow-white and cool through orange and red to dark crust by the time they land. The sea's own hue (red to orange, `PlanetStyle.sea`) tints the ramp halfway.
- **Scale**: the planet level is 63.7 km per unit (Earth's 6371 km radius is 100 units), so even Io's record fountain would be 0.02 units tall, invisible next to a ship 4 units wide, and would take 80 s to fall. The heights and times are therefore **stylised**:
  - Arc gravity is `LAVA_GRAVITY · √g` = 3 units/s² at 1 g, with g floored at 0.2 (`MIN_ARC_GRAVITY`). For the same launch speed, peaks and flight times both scale as g^−½ instead of the real 1/g: weaker worlds still throw higher and slower, but a tiny moon's arcs don't take half a minute.
  - Launch speeds: fountains 3–4.5 units/s, big eruptions 6.5–9 units/s, times 0.6 + 0.4·(internal heat). At 1 g a fountain peaks ≈ 3.4 units after 3 s in the air and an eruption ≈ 13.5 units after 6 s.
  - Peaks are capped at 12% (fountains) and 30% (eruptions) of the body's radius (`MAX_PEAK_FRACTION`).
- **Rates** come from the climate's internal heat (`geothermal`, ≥ 0.8 on every lava body since their heat flow is at least Io's range): more vents, more frequent fountains and eruptions, faster throws. Io-like bodies are the reference: continuous activity somewhere on the surface.

## Open questions

- The Io fountain height comes from JPL's press release and image caption, not a paper; Keszthelyi et al. and Wilson & Head model Tvashtar's fountains in detail and could replace it.
- The USGS colour/temperature table was seen only as a search summary.
