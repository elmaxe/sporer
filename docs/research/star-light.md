# The colour of starlight on planets

## Question

What colour is a star's light on the planets, moons and UFO it lights? The game lit them with `StarData.color`, the star's own display colour, which `gen/stars.ts` makes "more saturated than real blackbody colours" so stars read well as dots and discs. Under a K star that colour is a deep orange (`hsl(30°, 100%, 64%)`), which reflects almost nothing off blue: an ice giant's pale-blue bands came out tan and its dark-blue bands black (Paihax V, star 1254 at seed 1337), while the system map, which paints the bands unlit, showed them blue. Needed: each spectral class's light colour as seen by eyes adapted to daylight, for `starLightColor` (the system view's point light, low orbit's directional lights, the planet lab's sun).

## Sources

Accessed 2026-10-01, raw wikitext.

- [Stellar classification](https://en.wikipedia.org/wiki/Stellar_classification), the Harvard classes table (effective temperatures from Habets & Heintze 1981 and Weidner & Vink 2010): O ≥ 33,000 K, B 10,000–33,000 K, A 7,300–10,000 K, F 6,000–7,300 K, G 5,300–6,000 K, K 3,900–5,300 K, M 2,300–3,900 K. The table's D65 chromaticity column draws each class at a representative temperature: O 50,000, B 20,000, A 8,750, F 6,650, G 5,600, K 4,450, M 3,050 K. Those are used here.
- [Sun](https://en.wikipedia.org/wiki/Sun): the Sun has "increased in temperature from 5,620 K to 5,772 K" (today's effective temperature, also the IAU nominal value).
- [CVRL](http://www.cvrl.org/database/data/cmfs/ciexyz31_1.csv): CIE 1931 2° colour-matching functions, 360–830 nm in 1 nm steps (also used in `nebulas.md`).

## Measurements

Planck's law at each temperature, through the colour-matching functions into XYZ and the IEC 61966-2-1 matrix into linear sRGB. Then white balance: divide each channel by the Sun's (von Kries scaling in RGB), so 5,772 K light is white, as it is to eyes adapted to daylight. Scale to a maximum channel of 1 and encode as sRGB.

```js
import fs from 'node:fs';
const cmf = fs.readFileSync('cie.csv', 'utf8').trim().split('\n').map((l) => l.split(',').map(Number));
const h = 6.62607015e-34, c = 2.99792458e8, kB = 1.380649e-23;
const planck = (nm, T) => { const l = nm * 1e-9; return 1 / (l ** 5 * (Math.exp((h * c) / (l * kB * T)) - 1)); };
function linear(T) {
  let X = 0, Y = 0, Z = 0;
  for (const [nm, x, y, z] of cmf) { const p = planck(nm, T); X += x * p; Y += y * p; Z += z * p; }
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
}
const sun = linear(5772);
const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
for (const [cls, T] of [['O', 50000], ['B', 20000], ['A', 8750], ['F', 6650], ['G', 5600], ['K', 4450], ['M', 3050]]) {
  const rgb = linear(T).map((v, i) => v / sun[i]);
  const m = Math.max(...rgb);
  console.log(cls, '#' + rgb.map((v) => Math.round(enc(Math.max(0, v / m)) * 255).toString(16).padStart(2, '0')).join(''));
}
```

| Class | Temperature | Light (sRGB) | Linear RGB | Display colour it replaces |
|---|---|---|---|---|
| O | 50,000 K | `#8fb1ff` | 0.27 0.44 1 | `hsl(222°, 100%, 74%)` |
| B | 20,000 K | `#9cbcff` | 0.33 0.50 1 | `hsl(216°, 100%, 80%)` |
| A | 8,750 K | `#c7dbff` | 0.57 0.71 1 | `hsl(212°, 80%, 90%)` |
| F | 6,650 K | `#e7f0ff` | 0.80 0.87 1 | `hsl(50°, 100%, 90%)` |
| G | 5,600 K | `#fffdf9` | 1 0.98 0.95 | `hsl(42°, 100%, 74%)` |
| K | 4,450 K | `#ffeacb` | 1 0.82 0.60 | `hsl(30°, 100%, 64%)` |
| M | 3,050 K | `#ffc57b` | 1 0.56 0.20 | `hsl(14°, 100%, 60%)` |

Check: the Sun itself (5,772 K) comes out `#ffffff`, and G (5,600 K, a little cooler) a faint warm white. The order holds: bluer the hotter, redder the cooler.

## Game mapping

- `starLightColor(star)` in `gen/stars.ts` looks the table up by `spectralClass`. The game's kinds carry a class: white dwarfs are 'A' (white-blue light), red giants and red dwarfs 'M', blue giants 'B'. That's coarse for a white dwarf, which can be much hotter, but it's the class the game gives them.
- It colours the system view's point light (`world/Star.ts`), low orbit's directional lights and the colour the hand-shaded parts read (`planet/PlanetLights.ts`: lava, geysers, the map), and the lab's sun. Intensity is unchanged (`starLightIntensity`).
- The stars themselves (surface, corona, storms, galaxy dots, the system map) keep their stylised `StarData.color`.

## Open questions

- White balance to the Sun assumes eyes adapted to daylight. Someone living under a red dwarf would see its light as white too; the game keeps one adaptation everywhere, so red-dwarf systems still look warm.
- One temperature per class: a hot B0 and a cool B9 light alike.
