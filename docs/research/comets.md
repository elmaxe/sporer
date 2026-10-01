# Comets: nuclei, spin, albedo and activity

## Question

Roadmap step 25 makes comets visitable: an irregular nucleus (`gen/shape.ts`), its colour and spin (`cometNucleus` in `gen/comets.ts`), and jets and a coma that switch on near the star (`cometActivity`, `cometVents`, `planet/CometActivity.ts`). It needs:

1. Nucleus sizes, three axes and axis ratios; which nuclei are bilobed (contact binaries).
2. For contact binaries, lobe sizes and the neck's width against the smaller lobe (the code's `MIN_NECK = 0.4`).
3. Geometric albedo, as a colour.
4. Rotation periods, and which nuclei tumble (non-principal-axis rotation).
5. Where water-driven activity switches on, how water production scales with distance, and whether CO/CO₂ act further out.
6. Gas and dust speeds near the nucleus, and the active share of the surface.
7. Rough coma size and tail lengths.

Precision: the right ranges and trends (dark, elongated, often bilobed, active only inside ~3 AU, through a few percent of the surface). The player reads none of these as a number.

Reference cases: 1P/Halley, 9P/Tempel 1, 19P/Borrelly, 81P/Wild 2, 103P/Hartley 2, 67P/Churyumov–Gerasimenko, plus the contact binary 486958 Arrokoth (a Kuiper Belt object, not a comet). 9P/Tempel 1 is the negative case for a waist.

## Sources

All accessed 2026-10-01. PDFs and data files were downloaded with curl and read as text, unless marked "search summary".

- **Knight, Kokotanekova & Samarasinha 2024, "Physical and Surface Properties of Comet Nuclei from Remote Observations"** (Comets III), https://arxiv.org/abs/2304.09309. Table 1A (effective radius rₙ, period P, a/b = "largest shape model axis / second largest"): 9P 2.83 ± 0.10 km, 41.335 ± 0.005 h, 1.28; 19P 2.5 ± 0.1 km, 26.0 ± 1.0 h, 2.5; 67P 1.649 ± 0.007 km, 12.055 ± 0.001 h, 1.67; 81P 1.98 ± 0.05 km, 13.5 ± 0.1 h, 1.38; 103P 0.580 ± 0.018 km, 16.4 ± 0.1 h (NPA), 3.11; 1P 5.5 km, "∼ 68" h (NPA), 2.0. Table 1B pV: 9P 0.056 ± 0.007, 19P 0.06 ± 0.02, 67P 0.059 ± 0.002, 81P 0.059 ± 0.004, 103P 0.045 ± 0.009, 1P 0.04 (+0.02/−0.01). Text: 29 nuclei have "V-band albedos (pV) between 0.02 and 0.06", "unweighted average albedo … 0.040 ± 0.011 (median 0.040)", spherical albedo "Aλ ∼ 0.01"; lightcurve axial ratios "from 1.07 to 3.11", "mean of 1.55 ± 0.40 and a median of 1.45" (mostly lower limits); "Out of the six comets visited by spacecraft, four are highly-elongated/bi-lobed" (1P, 19P, 67P, 103P), "more than two-thirds" with 8P (radar contact binary); "only 14% of the almost 200 radar-imaged NEAs are bilobate"; TNO contact binaries "10%–25% for cold classicals or up to 50% for Plutinos"; "only two comets – 1P … and 103P … – have been definitively shown to be in NPA rotation", 67P "is also excited, albeit at a level too low to detect from Earth"; periods range "from approximately four hours to multiple days"; minimum rotation period "near 6 hours".
- **Keller & Kührt 2020, "Cometary Nuclei—From Giotto to Rosetta"**, Space Sci. Rev. 216:14, https://link.springer.com/content/pdf/10.1007/s11214-020-0634-6.pdf. 67P volume 18.56 km³, density 537.8 kg/m³, period 12.4043 h before and 12.05506 h after perihelion; Halley "very dark (albedo 0.04)", "bigger than required to produce the observed water production rates (limited areas of sublimation)"; Hartley 2 "bilobate … 2.33 km in length", a smooth "waist", hyperactivity driven by CO₂.
- **PDS Small Bodies Node shape models** (measured below): 67P ESA SPC `cshp_dv_130_01_lores_obj.obj` (https://pdssbn.astro.umd.edu/holdings/ro-c-multi-5-67p-shape-v2.0/data/triplate/spc_esa/mtp019/); Hartley 2 `hartley2_2012_cart.wrl` (…/dif-c-hriv_mri-5-hartley2-shape-v1.0/data/); Tempel 1 `tempel1_2012_cart.wrl` (…/dif-c-hriv_its_mri-5-tempel1-shape-v2.0/data/); Arrokoth `arrokoth_porter_2024_v01.obj` with Porter et al. 2024 (…/pds4-nh_derived:arrokoth_shapemodel_porter2024-v1.0/). Porter Table 2: full body 34.546 × 19.838 × 13.822 km, Wenu 20.139 × 19.838 × 13.726, Weeyo 15.041 × 14.378 × 13.625, equal-volume diameter 19.896 km, volume ratio "1.967:1".
- **Thomas et al. 2013, Icarus 222, 453** (Tempel 1, https://ntrs.nasa.gov/api/citations/20140010174/downloads/20140010174.pdf): mean radius 2.83 ± 0.1 km, volume 95.2 km³, radii 2.10–3.97 km, period "approximately 40 h". **Thomas et al. 2013, Icarus 222, 550** (Hartley 2, …/20140009994.pdf): "bi-lobed, elongated, nearly axially symmetric comet 2.33 km in length", volume 0.809 km³, mean radius 0.58 ± 0.018 km, "Diameter range: 0.69–2.33 km", primary period ~16 h and increasing, a "27.8 h roll period".
- **JPL SBDB API** (https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=…&phys-par=1): 1P extent "14.9x8.2 km" (Keller et al. 1987); 9P "7.6x4.9 km" (A'Hearn 2005, preliminary), 40.7 h; 67P GM 662.2e-9 km³/s².
- **ESA, "Giotto's comet results"** (esa.int): Halley "about 15 km long and 9 km across", "only 2-4% of the incident light was reflected", "only a relatively small fraction of the nucleus was active", first dust impact "290 000 km from the comet's nucleus".
- **Farnham & Cochran 2002, Icarus 160, 398** (pages.astro.umd.edu/~farnham/publications/borrelly.pdf): Borrelly "dimensions of 4 × 4 × 8 km (Soderblom et al. 2001)"; Halley in situ gas speed "would correspond to 850 m s−1 at 1 AU (Krankowsky et al. 1986)", sonic-point speed "on the order of 300 m s−1" (Combi 1989).
- **Soderblom et al. 2002, Science 296, 1087** (abstract via Crossref): Borrelly "8-kilometer-long", "albedo variations (0.01 to 0.03)", "∼10% or less of the surface actively sublimating". **Duxbury et al. 2004, JGR 109, E12S02** (abstract via Crossref): Wild 2 "triaxial ellipse having radii 1.65 × 2.00 × 2.75 km ± 0.05 km". **Sierks et al. 2015, Science 347, aaa1044** (abstract via Crossref): 67P "two lobes connected by a short neck"; "Activity at a distance from the Sun of >3 astronomical units is predominantly from the neck".
- **ESA Rosetta blog, 2015-01-22** (blogs.esa.int): 67P "small lobe measures 2.6 × 2.3 × 1.8 km and the large lobe 4.1 × 3.3 × 1.8 km"; slow dust falls back.
- **Spencer et al. 2020, Science 367, eaay3999** (reprint, pages.astro.umd.edu/~dphamil): Arrokoth "36 km by 20 km by 10 km", lobes "20.6 km by 19.9 km by 9.4 km and 15.4 km by 13.8 km by 9.8 km", period "15.92 ± 0.02 hours". **Stern et al. 2021**, https://arxiv.org/abs/2103.10780: "The diameter of the neck is ~7±1 km".
- **Jewitt 1997, "Cometary rotation: an overview"** (faculty.epss.ucla.edu/~jewitt/papers/TENERIFE/Rotation.pdf), Table I: Halley P "2.2d, 7.2d", a/b 2/1, active fraction "10" (%).
- **Kelley et al. 2013, Icarus 222, 634** (https://arxiv.org/abs/1304.4204): "activities of most comets are consistent with surfaces that are over 90% inert"; Hartley 2 sublimation 2.9 × 10¹⁷ molec cm⁻² s⁻¹ at 1.03 AU (isothermal, Bond albedo 4%, Cowan & A'Hearn 1979), Q ≈ 3 × 10²⁸ s⁻¹, "active fraction … near 1.7–2.5"; large particles "0.5–2 m s−1", small grains "of order 100 m s−1"; long-axis period "18.4 h near closest approach". **Lisse et al. 2009**, https://arxiv.org/abs/0906.4733: Hartley 2 "~100% of the surface area is actively emitting", "about 13 times the active surface fraction" of Tempel 1.
- **Attree et al. 2019, A&A** (https://arxiv.org/abs/1901.02806): 67P effective active fraction "∼ 10 %" in two southern regions outside perihelion, "< 4 %" in the north, "∼ 25 − 35 %" in the south around perihelion.
- **Combi et al. 2019, Icarus** (https://arxiv.org/abs/1808.10865), Table 3, water Q = Q₁ rᵖ: 19P p = −5.2 ± 1.1 pre / −6.6 ± 0.6 post; 67P post −4.5 ± 2.3 (1996), −4.3 ± 2.1 (2009); 103P −6.6/−3.2 (1997), −14.0/−7.2 (2010); 2P (7 apparitions) −1.8/−2.1; 46P −3.6/−3.4; 9P and 81P "A power law did not represent the variation". Active fraction at 1 AU: 103P 0.67/0.53 (1997); 67P 0.055 (1996), 0.029 (2009).
- **Kelley et al. 2013, "The persistent activity of Jupiter-family comets at 3 to 7 AU"** (https://arxiv.org/abs/1304.3818): "Water ice is typically the primary driver of comet atmospheres inside of 3 AU"; water sublimates "at T ≈ 170 K (… near rh ≈ 3 AU)", CO₂ "≈ 80 K (rh ≈ 12 AU)", CO "≈ 20 K (rh ≈ 50 AU)"; 21 of 89 JFCs "(24 ± 5%)" show activity at 3–7 AU. **Womack, Sarid & Wierzchos 2017** (https://arxiv.org/abs/1611.00051): a coma develops "when frozen water begins to sublimate at ∼ 3 AU"; "up to a third of all comets observed become active beyond 3 AU".
- **Hsieh et al. 2015, Icarus 248, 289** (https://arxiv.org/abs/1410.5084), §4.3.2: F = 1360 W m⁻², ε = 0.9, L = 2.83 MJ kg⁻¹, µ = 2.991 × 10⁻²⁶ kg, ṁ = Pv √(µ / 2πkT), Pv = 611 exp(ΔH/Rg (1/273.16 − 1/T)) Pa with ΔH = 51.06 MJ kmol⁻¹, Rg = 8314 J kmol⁻¹ K⁻¹; χ = 1 subsolar, 4 isothermal. **NIST CODATA**: σ = 5.670374419 × 10⁻⁸ W m⁻² K⁻⁴, k = 1.380649 × 10⁻²³ J K⁻¹.
- **Tseng et al. 2007, A&A** (https://arxiv.org/abs/astro-ph/0702193): H₂O expansion speed "Vp = 0.85 × rh−0.5 km s−1" for a restricted Q range; 0.96 rh^−0.44 (Q 10²⁸–10²⁹ s⁻¹), 1.19 rh^−0.55 (10²⁹–10³⁰). **Bockelée-Morvan et al. 2004, Icarus 167, 113** (Borrelly at 1.37–1.4 AU): expansion velocity 0.75 km s⁻¹ fits the HCN line widths; Haser model with 0.8 km s⁻¹ for H₂O, 0.95 km s⁻¹ for OH and an OH lifetime of 1.1 × 10⁵ s at 1 AU.
- **Skorov et al. 2016** (https://arxiv.org/abs/1606.08461): 67P grains (GIADA) "hit the detectors at speeds 1 to 10 m/s", "do not exceed ∼10 m s−1".
- **NASA, "Comet Facts"** (science.nasa.gov/solar-system/comets/facts/): "The coma may extend hundreds of thousands of kilometers". **ESA Ulysses PR 24-2000** and **Imperial College Ulysses page**: Hyakutake's ion tail crossed with the nucleus "more than 3.5AU" away, "3.8 AU (570 million km)". NASA APOD 2015-01-17 (search summary): Lovejoy's tail "over 5 million kilometers".

## Measurements

Shape models, measured with this script (`node shape.mjs <file>`, on the PDS files above): volume and centroid from signed tetrahedra, principal axes from the solid's second moments, the box along them, then a voxel fill and, over 1500 directions, the cut whose slice profile (equal-area diameter per slice) has the deepest waist. "Lobe" is the widest slice on each side of it, "neck" the narrowest between.

```js
import fs from 'node:fs';
const t = fs.readFileSync(process.argv[2], 'utf8'), V = [], F = [];
if (t.startsWith('#VRML')) { for (const l of t.split('\n')) { const m = l.split('#')[0].trim().split(/\s+/).map(Number);
    if (m.length === 3 && m.every(isFinite)) V.push(m); else if (m.length === 4 && m[3] === -1) F.push(m.slice(0, 3)); } }
else for (const l of t.split('\n')) { const p = l.trim().split(/\s+/); if (p[0] === 'v') V.push(p.slice(1, 4).map(Number)); else if (p[0] === 'f') F.push(p.slice(1, 4).map(s => parseInt(s) - 1)); }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => a.map((x, i) => x - b[i]);
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
let vol = 0, c = [0, 0, 0];
for (const [i, j, k] of F) { const v = dot(V[i], crs(V[j], V[k])) / 6; vol += v; for (let q = 0; q < 3; q++) c[q] += v * (V[i][q] + V[j][q] + V[k][q]) / 4; }
c = c.map(x => x / vol); vol = Math.abs(vol);
const P = V.map(p => sub(p, c)), S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const [i, j, k] of F) { const [a, b, d] = [P[i], P[j], P[k]], v = dot(a, crs(b, d)) / 6;
  for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) S[p][q] += v / 20 * (2 * (a[p] * a[q] + b[p] * b[q] + d[p] * d[q]) + a[p] * b[q] + b[p] * a[q] + a[p] * d[q] + d[p] * a[q] + b[p] * d[q] + d[p] * b[q]); }
const ax = []; for (let n = 0; n < 3; n++) { let e = [1, 0.3, 0.1].map((x, i) => x + i * n);
  for (let it = 0; it < 500; it++) { for (const f of ax) { const d = dot(e, f); e = e.map((x, i) => x - d * f[i]); } e = S.map(r => dot(r, e)); const m = Math.hypot(...e); e = e.map(x => x / m); } ax.push(e); }
const box = ax.map(e => { const s = P.map(p => dot(p, e)); return Math.max(...s) - Math.min(...s); });
const lo = [0, 1, 2].map(i => Math.min(...P.map(p => p[i]))), hi = [0, 1, 2].map(i => Math.max(...P.map(p => p[i])));
const h = Math.max(...hi.map((x, i) => x - lo[i])) / 90, nx = Math.ceil((hi[0] - lo[0]) / h), ny = Math.ceil((hi[1] - lo[1]) / h), cols = new Map();
for (const [i, j, k] of F) { const [a, b, d] = [P[i], P[j], P[k]], den = (b[1] - d[1]) * (a[0] - d[0]) + (d[0] - b[0]) * (a[1] - d[1]); if (!den) continue;
  for (let ix = Math.floor((Math.min(a[0], b[0], d[0]) - lo[0]) / h); ix <= Math.min(nx, (Math.max(a[0], b[0], d[0]) - lo[0]) / h); ix++)
    for (let iy = Math.floor((Math.min(a[1], b[1], d[1]) - lo[1]) / h); iy <= Math.min(ny, (Math.max(a[1], b[1], d[1]) - lo[1]) / h); iy++) {
      const x = lo[0] + (ix + .5) * h, y = lo[1] + (iy + .5) * h, l1 = ((b[1] - d[1]) * (x - d[0]) + (d[0] - b[0]) * (y - d[1])) / den, l2 = ((d[1] - a[1]) * (x - d[0]) + (a[0] - d[0]) * (y - d[1])) / den;
      if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) { const key = ix * 1e4 + iy; if (!cols.has(key)) cols.set(key, []); cols.get(key).push(l1 * a[2] + l2 * b[2] + (1 - l1 - l2) * d[2]); } } }
const pts = []; for (const [key, z] of cols) { z.sort((p, q) => p - q); const x = lo[0] + (Math.floor(key / 1e4) + .5) * h, y = lo[1] + (key % 1e4 + .5) * h;
  for (let m = 0; m + 1 < z.length; m += 2) for (let w = Math.ceil((z[m] - lo[2]) / h - .5); lo[2] + (w + .5) * h < z[m + 1]; w++) pts.push([x, y, lo[2] + (w + .5) * h]); }
let best = { r: 9 }; for (let k = 0; k < 1500; k++) { const zc = 1 - (k + .5) / 1500, s = Math.sqrt(1 - zc * zc), ph = k * Math.PI * (3 - Math.sqrt(5)), n = [s * Math.cos(ph), s * Math.sin(ph), zc];
  let mn = 1e9; const sv = pts.map(p => { const v = dot(p, n); if (v < mn) mn = v; return v; }), cnt = []; for (const v of sv) { const b = Math.floor((v - mn) / h); cnt[b] = (cnt[b] || 0) + 1; }
  const D = [...cnt].map(x => 2 * Math.sqrt((x || 0) * h * h / Math.PI)), sm = D.map((d, i) => (D[i - 1] ?? d) / 4 + d / 2 + (D[i + 1] ?? d) / 4);
  for (let i = 2; i < sm.length - 2; i++) { const L = Math.max(...sm.slice(0, i)), R = Math.max(...sm.slice(i + 1)), r = sm[i] / Math.min(L, R); if (r < best.r) best = { r, L, R, neck: sm[i] }; } }
console.log({ volume: vol, meanRadius: Math.cbrt(3 * vol / 4 / Math.PI), box, lobes: [best.L, best.R], neck: best.neck, neckOverSmaller: best.r });
```

| Body | Volume (km³) | Mean radius | Box along principal axes (km) | a/c | Lobes (km, eq. diam.) | Neck | Neck / smaller lobe | Smaller / larger lobe | Volume split |
|---|---|---|---|---|---|---|---|---|---|
| 67P | 18.80 (Keller & Kührt: 18.56) | 1.650 (Knight: 1.649) | 5.05 × 3.67 × 3.23 | 1.56 | 3.22, 2.43 | 1.52 | **0.63** | 0.75 | 69 / 31 % |
| 103P/Hartley 2 | 0.810 (Thomas: 0.809) | 0.578 (0.58) | 2.34 × 0.94 × 0.78 | 2.99 | 0.85, 0.67 | 0.53 | **0.79** | 0.80 | 72 / 28 % |
| 9P/Tempel 1 | 95.20 (95.2) | 2.833 (2.83) | 7.48 × 5.84 × 5.12 | 1.46 | 6.01, 6.01 | 5.63 | 0.94: no waist | 1.00 | (59 / 41) |
| Arrokoth | 4124 | 9.95 (Porter: 19.896/2) | 34.52 × 19.89 × 13.84 (Porter: 34.546 × 19.838 × 13.822) | 2.49 | 15.89, 13.65 | 4.36 | **0.32** | 0.86 | 66 / 34 % (Porter 1.967:1) |

Every volume and radius reproduces the published value to under 1.5%, and Arrokoth's box is Porter's to 0.03 km, so the box is the same definition as Porter's Table 2. The other nuclei, from the papers (full axes, km): Halley ~15 × 9 (ESA), 14.9 × 8.2 (Keller 1987, SBDB), rₙ 5.5, a/b 2.0 (Knight); Borrelly 8 × 4 × 4 (Soderblom 2001 via Farnham & Cochran; mean radius (8·4·4)^⅓/2 = 2.52 km against Knight's 2.5), a/b 2.5 (Knight, from Buratti 2004); Wild 2 5.50 × 4.00 × 3.30 (Duxbury, a/c 1.67, mean radius 2.09 against Knight's thermal 1.98). Six comet nuclei span a/c 1.46–2.99 (median ~1.8), plus Arrokoth at 2.49.

Lobes and necks, cross-checked: 67P's lobes as published (4.1 × 3.3 × 1.8, 2.6 × 2.3 × 1.8) have geometric-mean sizes 2.90 and 2.21 km, ratio 0.76 (longest axes 0.63), matching the 0.75 above; the volume splits give size ratios ∛(small/large) of 0.77 (67P), 0.73 (Hartley 2) and 0.80 (Arrokoth). Arrokoth's neck in images, 7 ± 1 km (Stern et al. 2021), is 0.39–0.58 of Weeyo's 13.8–15.4 km. The shape model's 0.32 is the equal-area diameter of a neck that is flat (Stern: 0.9–1.6 km "high"), and the model joins two fitted lobes with no fill, so it reads narrow.

Sublimation, colour and spin checks (`node comets.mjs`):

```js
const SIG = 5.670374419e-8, K = 1.380649e-23, S = 1360, EPS = 0.9, L = 2.83e6, MU = 2.991e-26;
const Pv = T => 611 * Math.exp(51.06e6 / 8314 * (1 / 273.16 - 1 / T)), mdot = T => Pv(T) * Math.sqrt(MU / (2 * Math.PI * K * T));
function balance(r, A, chi) { // per unit area: S(1-A)/(chi r²) = eps σ T⁴ + L ṁ(T)
  const inp = S * (1 - A) / (r * r); let lo = 10, hi = 400;
  for (let i = 0; i < 100; i++) { const T = (lo + hi) / 2; (chi * (EPS * SIG * T ** 4 + L * mdot(T)) > inp) ? hi = T : lo = T; }
  const T = (lo + hi) / 2; return { T, Z: mdot(T) / MU * 1e-4, share: chi * L * mdot(T) / inp };
}
console.log('check, isothermal A=0.04 at 1.03 AU:', balance(1.03, 0.04, 4).Z.toExponential(2), '(Cowan & A\'Hearn: 2.9e17)');
for (const r of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6]) console.log(r, [4, 1].map(chi => { const a = balance(r, 0.01, chi), b = balance(r * 1.01, 0.01, chi);
  return [a.T.toFixed(0), a.Z.toExponential(1), (a.share * 100).toFixed(0) + '%', (Math.log(b.Z / a.Z) / Math.log(1.01)).toFixed(1)].join(' '); }).join(' | '));
const enc = l => l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;
for (const p of [0.02, 0.04, 0.06]) console.log('pV', p, 'sRGB', Math.round(enc(p) * 255), '/255');
const k = Math.log(4) / Math.log(70 / 6); // game comet period 15.7–62.8 s (spin 0.4–0.1 rad/s) ← real 6–70 h
for (const P of [12.055, 18.4, 41.3, 52.8]) console.log(P, 'h →', (2 * Math.PI / 0.4 * (P / 6) ** k).toFixed(1), 's');
```

The model reproduces Cowan & A'Hearn's 2.9 × 10¹⁷ cm⁻² s⁻¹ at 1.03 AU as 2.78 × 10¹⁷ (−4%). Bond albedo 0.01 (Knight's Aλ ~ 0.01) for the table:

| r (AU) | Isothermal sphere: T, Z (cm⁻² s⁻¹), share of sunlight into sublimation, local slope d ln Z / d ln r | Subsolar point: T, Z, share, slope |
|---|---|---|
| 1.0 | 195 K, 3.1e17, 78%, −2.5 | 205 K, 1.5e18, 93%, −2.1 |
| 2.0 | 182 K, 3.4e16, 34%, −4.8 | 195 K, 3.1e17, 78%, −2.5 |
| 2.5 | 174 K, 8.1e15, 13%, −8.9 | 191 K, 1.7e17, 68%, −2.8 |
| 3.0 | 164 K, 8.8e14, 2%, −16 | 188 K, 1.0e17, 58%, −3.2 |
| 4.0 | 142 K, 3.5e12, 0%, −21 | 182 K, 3.4e16, 34%, −4.8 |
| 5.0 | 127 K, 2.3e10, 0%, −24 | 174 K, 8.1e15, 13%, −8.9 |

So water sublimation follows ~r⁻² inside ~1.5 AU and collapses beyond: averaged over a spinning nucleus it is down 350× at 3 AU against 1 AU (r⁻² alone: 9×) and its temperature crosses Kelley's 170 K near 2.7 AU. Sun-facing patches keep going to ~4–5 AU. "~3 AU" sits between the two limits. The measured slopes (Combi: −1.8 to −14, 67P −4.3 to −4.5) are steeper than r⁻², as the model's slope beyond 1.5 AU is.

Activity and speeds:

| Comet | Active share of the surface | Gas speed | Dust speed |
|---|---|---|---|
| Halley | 10% (Jewitt); "relatively small fraction" (ESA) | 0.85 km/s at 1 AU in situ; the law gives 0.85 | |
| Borrelly | ≤ 10% (Soderblom); Combi 0.24–0.30 (extrapolated to 1 AU from q = 1.36) | 0.75 km/s at 1.37 AU; the law gives 0.73 | |
| Tempel 1 | ~7.7% (Lisse: 13× less than Hartley 2's ~100%) | | |
| 67P | < 4% north, ~10% south, 25–35% south near perihelion (Attree); 3–6% (Combi) | | 1–10 m/s (GIADA); escape speed √(2·662.2/1650) = 0.90 m/s |
| Hartley 2 | 1.7–2.5 (Kelley; recomputed: 3e28 / 2.9e17 = 10.3 km² over 5.24 km² = 1.97); 0.53–0.67 (Combi); ~100% (Lisse) | | chunks 0.5–2 m/s, fine dust ~100 m/s |

The law Vp = 0.85 r^−0.5 km/s gives 1.20, 0.85, 0.60 and 0.49 km/s at 0.5, 1, 2 and 3 AU.

Coma and tails: the OH Haser scale length is 0.95 km/s × 1.1 × 10⁵ s = 1.05 × 10⁵ km at 1 AU, ~5 × 10⁴ radii of a 2 km nucleus, consistent with NASA's "hundreds of thousands of kilometers" and Giotto's first dust hit 290 000 km from Halley. Visible tails reach millions of km (Lovejoy > 5 × 10⁶ km), and ion tails are traceable to ~3.8 AU (Hyakutake).

Rotation:

| Body | Period | State |
|---|---|---|
| Halley | 2.2 d and 7.2 d (Jewitt); "∼ 68 h" (Knight) | NPA (tumbling), second period 3.3× the first |
| Tempel 1 | 41.335 h (40.7 h, A'Hearn 2005); shortens ~15 min per perihelion | principal axis |
| Borrelly | 26.0 h | principal axis (near simple, Farnham & Cochran) |
| Wild 2 | 13.5 h | principal axis |
| Hartley 2 | 16.4 h (Knight); 18.4 h at the flyby (Kelley), roll about the long axis 27.8 h (Thomas) | NPA, roll 1.5× the spin |
| 67P | 12.4043 h before, 12.05506 h after the 2015 perihelion | slightly excited |
| Arrokoth | 15.92 h | principal axis |

Colour: geometric albedo taken as the surface's linear reflectance and sRGB-encoded (1.055 L^(1/2.4) − 0.055): pV 0.02 → 39/255 (#272727), 0.04 → 56/255 (#383838), 0.06 → 69/255 (#454545). Taken as a Lambert surface's albedo instead (p = ⅔ ρ, so ρ = 1.5 p), 0.04 → 69/255.

## Game mapping

- **Activity cut-off** (`ACTIVITY_LIMIT = 3`, `ACTIVITY_FULL = 2.5` habitable radii, 1 habitable radius ≈ 1 AU): jets and coma follow the tails' strength (1.2 / r)², capped at 1, times a smoothstep from 1 at 2.5 to 0 at 3. That is the observed water turn-on (~3 AU) and the model's collapse (share of sunlight into sublimation 13% at 2.5 AU, 2% at 3 AU). **Deliberate deviation:** the game's r⁻² (strength 0.36 at 2 AU, 0.23 at 2.5 AU) is shallower than real water production (r^−4.5 would give 0.10 and 0.04), so activity stays visible over more of the orbit and matches the tails. Activity beyond 3 AU driven by CO/CO₂ (a quarter to a third of comets; 67P's neck) is not modelled. A faint coma out to ~5 habitable radii would be the realistic option.
- **Active share**: real nuclei are active over a few percent to ~10% of the surface (a third near perihelion on 67P's southern regions). Hyperactive Hartley 2 is the exception (≥ 100%). The game's 4–9 vents (`VENT_COUNT`) with 0.08–0.2 rad cones cover 0.6–9% of the surface ((1 − cos θ)/2 per vent; ~3% for 6 vents at 0.14 rad). That matches, and is to keep. Only sunlit vents blow, as on Halley and 67P. A rare hyperactive nucleus (many vents) is possible but has no measured frequency, so it would be a gameplay choice.
- **Jet speed**: the gas leaves at ~0.5–1.2 km/s (0.85 r^−0.5) and the dust at 1–10 m/s, against escape speeds under 1 m/s. So most dust leaves, with chunks falling back. The game's jets (`reach` 3 nucleus radii in a 6 s life, no fall-back) are stylised: real dust would cross 3 radii of a 2 km nucleus in 10–100 min.
- **Shape** (as built, after this note's first draft): `COMET_LOBES` weights 6 : 3 : 1 (60% single, 30% contact binaries, 10% with a third, smaller lobe), against 2 of the 6 visited nuclei clearly bilobed (67P, Hartley 2) and 2 more elongated (Borrelly, Halley). A third lobe has no real example, so it is a stylisation. Measured neck / smaller lobe: 67P 0.63, Hartley 2 0.79, Arrokoth 0.32 (model) or 0.39–0.58 (image). The code draws each lobe's neck from 0.5–0.8 of its own width, so with the lumps (±6–12%) it stays above `MIN_NECK = 0.4` (pinned in `tests/shape.test.ts`): 67P and Hartley 2 are covered; only Arrokoth's flat neck is thinner, and the floor exists for the mesh (`SHAPE_FLOOR`). Note the definitions differ: the code's neck is a half-width where a lobe meets the centre over that lobe's half-width, while the table's is the equal-area diameter over the smaller lobe's. The second lobe is 0.65–0.95 the size of the first, covering the measured 0.73–0.80 (the "67P ~0.6" sometimes quoted is the longest-axis ratio, 0.63; by volume it is 0.77). A single lobe's longest / shortest axis is drawn from `COMET_ELONGATION` [1.4, 2.6]. **Measured on 600 generated shapes** (`shapeExtents`, longest over shortest half-width): 10th–90th percentile 1.55–2.53, median 2.07 (single lobes 1.94, contact binaries 2.25), extremes 1.32–3.14, against 1.46–2.99, median ~1.8, for the visited nuclei: a little more elongated than the real median, deliberately (the shapes have to read as irregular from low orbit).
- **Spin**: real 12–53 h for the reference nuclei, ~6 h minimum and up to days. The game's comets turn in 15.7–62.8 s (0.1–0.4 rad/s), like its moons (12.6–63 s) and planets (18–126 s). A log map, P_game = 15.7 s × (P / 6 h)^0.564, puts 67P at 23 s, Hartley 2 at 30 s, Tempel 1 at 47 s and Halley at 54 s. Drawing the rate uniformly as now is fine. **Tumbling**: 2 of the 6 visited nuclei tumble (Halley, Hartley 2) and 67P slightly. Suggested: about one nucleus in four tumbles, with a second rotation about the long axis 1.5–3.3× slower than the main spin (Hartley 2 1.5, Halley 3.3). The real population fraction is unknown (Knight: far fewer are observed than theory predicts), so the frequency is a gameplay choice.
- **Colour**: pV 0.02–0.06 → sRGB grey 39–69/255, average 0.04 → 56/255 (#383838), with geometric albedo taken as linear reflectance. `NUCLEUS_LIGHTNESS` (HSL lightness at 4–12% saturation, close to the sRGB grey value): the high colour 0.20–0.27 (linear 0.033–0.059) sits on the measured range. The low colour 0.12–0.16 (linear 0.013–0.022) is darker, matching Borrelly's 0.01–0.03 albedo patches.
- **Coma and tails**: the real coma is ~10⁵ km, tens of thousands of nucleus radii, and tails run 10⁶–10⁸ km. In low orbit the coma sphere (`comaRadii` 14) and tails are drawn as backdrop scale, a deliberate compression like the rest of the game's distances.

## Open questions

- Seen only as search summaries: Merényi et al. 1990's Halley box 15.3 × 7.2 × 7.22 km; Jorda et al. 2016's 67P volume 18.8 ± 0.3 km³ and lobe/neck volume split 66/27/7% (the shape model measured here agrees: 18.80 km³, 69/31% cut at the waist); Marshall et al. 2017's 67P active fraction "3–4%"; Tempel 1 "~9% at 1.6 AU"; the Lovejoy tail length; Hansen et al. 2016's 67P water power laws (paper not read).
- Definitions disagree: Hartley 2's a/b is 3.11 in Knight (largest over second axis of the shape model) but 2.48 from the box here; Borrelly's a/b is 2.5 (Buratti) or 2.0 (8 × 4 × 4). The 67P box here (5.05 km long) differs from quoted overall sizes because the lobes are not aligned with one principal axis.
- Hsieh et al. print eq. 8 with χ only on the radiative term. The script divides all the sunlight by χ (energy per unit area), which reproduces Cowan & A'Hearn within 4%.
- Real H₂O photodissociation lifetime (it sets the water coma's size) and typical dust-tail lengths were not looked up.
- The game's three-lobed nuclei, the tumbling frequency and any hyperactive frequency have no measured counterpart.
