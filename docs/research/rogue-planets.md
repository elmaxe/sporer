# Rogue planets: abundance, internal heat, hydrogen greenhouse, moons and light

## Question

Roadmap step 28 adds a few free-floating ("rogue") planets between the stars: a `rogues` list in `GalaxyData`, each a `PlanetData` with no star, a climate from internal heat only, lit by the galaxy's glow. It needs:

1. How common rogues are against stars, and their mass mix (do Earth-mass ones outnumber Jupiters?), for the size classes of the handful the game places among 4000 stars.
2. The surface temperature with internal heat only, T = (F/σ)^¼, for real heat flows (Earth, Moon, Io, a young Earth), against the ~30 K quoted for a rogue Earth.
3. Which gases stay gaseous at those temperatures.
4. How much H₂ keeps a surface above 273 K with geothermal heat only, as a τ₀ and n for the game's grey model T⁴ = T_eq⁴(1 + ¾τ), τ = τ₀Pⁿ; plus H₂'s molar mass for the scale height.
5. When an ocean survives under ice (Abbot & Switzer's "Steppenwolf"), and how thick the ice is.
6. What fraction of ejected planets keep their moons.
7. How bright the galaxy's light is at a rogue against sunlight, and how a 35 K world and a lava world look in visible light.

Precision: the right order and trend. Temperatures the HUD shows should come from the formula and the fit below; the reference planets for checking are model planets (Mol Lous et al. 2022, Pierrehumbert & Gaidos 2011), since no rogue's surface has been measured.

## Sources

All accessed 2026-10-01. arXiv papers were read as PDF text (curl + pdftotext) unless noted.

- **Sumi et al. 2023** (MOA-II), https://arxiv.org/abs/2303.08280: "dN₄/dlog M = (2.18 +0.52/−1.40) × (M/8 M⊕)^−α₄ dex⁻¹ star⁻¹ with α₄ = 0.96 +0.47/−0.27 for M/M⊙ < 0.02"; "a total of f = 21 +23/−13 FFP or very wide orbit planets of mass 0.33 < M/M⊕ < 6660 per star, with a total mass of 80 +73/−47 M⊕ per star"; "The number of FFPs is 19 +23/−13 times the number of planets in wide orbits"; "The Sumi (2011) large Jupiter-mass FFP population is excluded."
- **Mróz et al. 2017** (OGLE), https://arxiv.org/abs/1707.07634 (abstract): "95% upper limit on the frequency of Jupiter-mass free-floating or wide-orbit planets of 0.25 planet per main-sequence star"; ultrashort events "may indicate the existence of Earth- and super-Earth-mass free-floating planets".
- **Gould et al. 2022** (KMTNet), JKAS 55:173, https://arxiv.org/abs/2204.03269 (abstract): "dN_FFP/dlog M = (0.4 ± 0.2)(M/38 M⊕)^−p /star, with 0.9 ≲ p ≲ 1.2"; "There are substantially more FFPs than known bound planets".
- **Stevenson 1999**, Nature 400:32, https://www.nature.com/articles/21811 (abstract only; full text paywalled): Earth-mass embryos "can retain atmospheres rich in molecular hydrogen which, upon cooling, can have basal pressures of 10² to 10⁴ bars"; "although the effective temperature of the body is around 30 K, its surface temperature can exceed the melting point of water".
- **Pierrehumbert & Gaidos 2011**, ApJL 734:L13, https://arxiv.org/abs/1105.0021: "40 bars of pure H₂ on a 3 Earth-mass planet can maintain a surface temperature of 280K out to 1.5AU from an early-type M dwarf star and 10 AU from a G-type star"; model planet "3M⊕ … surface gravity g = 17 m s⁻²"; "Gravity enters the calculation of OLR only in the combination p_s²/g"; "For L = 40 W m⁻² … p_s = 10 bar is sufficient to maintain a surface temperature of 280 K about a G star"; "For an early M-type star with luminosity 1.3% of the Sun, 100 bars of H₂ maintains liquid surface water out to 2.4 AU; around a G star, these conditions persist to 15 AU"; planets around M stars have effective temperatures "below the condensation temperature of all gases except H₂ and He"; "Even at 100 K the saturation vapor pressures of CO₂, H₂O, NH₃ are all < 0.02 Pa. CH₄, with a vapor pressure of 0.338 bar at 100 K". Albedos are computed but not tabulated.
- **Mol Lous, Helled & Mordasini 2022**, Nat. Astron. 6:819, https://arxiv.org/abs/2206.13859, and its data, https://github.com/mollous/Data_Liquid_Water_Conditions (cloned; `Cold_Cases/`: 260 unbound planets, "distance is set to 1e6 AU", cores 1–10 M⊕, envelopes 10⁻⁶–10⁻¹ M⊕, columns time, core mass, core and total luminosity "(Ljup=3.35e25 cgs)", pressure and temperature "at envelope core boundary", radiogenic luminosity, …, radius). Text: radiogenic heat from "a chondritic composition", L_radio = L_radio,⊕(t) · M_mantle/M_mantle,⊕; "After ∼300 Myr the radiogenic luminosity dominates"; unbound planets with 0.01 M⊕ envelopes on > 5 M⊕ cores keep liquid-water conditions "over 50 Gyr"; their opacity table's lower limit "is 75 K" (extrapolated below).
- **Li et al. 2018**, Nat. Commun., "Less absorbed solar energy and more internal heat for Jupiter" (PMC6137063, HTML): Jupiter's "internal heat, 0.503 ± 0.012 and 7.485 ± 0.160 W m⁻²" (albedo, heat), previous best "5.444 ± 0.425 W m⁻²". **NASA Jupiter fact sheet**: volumetric mean radius 69,911 km. 5.444 W/m² × 4π(69 911 km)² = 3.34 × 10²⁴ erg/s, so the data's "3.35e25" is a factor-10 typo for 3.35 × 10²⁴ erg/s (with 10²⁵, Earth's radiogenic heat would be 233 TW and thin-air surfaces colder than their effective temperature).
- **KamLAND Collaboration 2011**, Nat. Geosci. 4:647 (abstract, nature.com): "The current total heat flux from the Earth to space is 44.2±1.0 TW"; ²³⁸U and ²³²Th give 20.0 +8.8/−8.6 TW (the number is in the search summary; the page's math was stripped); K-40 is "known to contribute 4 TW"; radiogenic ≈ "half of Earth's total heat flux".
- From `climate.md` (sources read 2026-09-29): Earth 47 ± 2 TW (Davies & Davies 2010), Moon 16–21 mW/m² (Apollo), Io 2.24 W/m² (Lainey et al. 2009), Pluto's sunlight 0.873 W/m² and Earth's 1361 W/m² (NASA).
- **Abbot & Switzer 2011**, ApJL 735:L27, https://arxiv.org/abs/1102.1108: subglacial ocean "if it were ≈3.5 times more massive than Earth, corresponding to ≈8 km of ice"; "ten times more water … or … a thick frozen CO₂ layer … only ≈0.3 times Earth's mass"; H_cond = (A/F) ln(T_H/T₀), A = 651 W m⁻¹, T_H = 260 K; F⊕ = 0.087 W m⁻² (Pollack et al. 1993); heat flow "roughly twice its present value 3 Gyr ago (Turcotte 1980)"; R ∝ M^0.27 so F ∝ M^(1−2v) ≈ √M; ocean depth 4 km at 1 M⊕ scaling the same way; "At 10 M⊕, Ts = 46 K"; a frozen CO₂ cover keeps the ice top at "≈ 220 K"; "Astrophysical radiation backgrounds (Mathis et al. 1983; Dole et al. 2006) are negligible"; lifetime set by decay times "∼1–5 Gyr".
- **Rabago & Steffen 2019**, MNRAS 489:2323, https://arxiv.org/abs/1809.05639: 77 ejections of a Jupiter with 100 test moons out to ~200 R_J: "47% of the moons remain bound to the escaping planets", "a large fraction of the moons (∼85%) near the orbits of the Galilean satellites will survive", "just over 25% of the simulations retain all or most of their moons".
- **Hong et al. 2018**, https://arxiv.org/abs/1712.06500, Table 1 (all moons in planet–planet scattering): host-bound 17%, "Free-floater bound 2", ejected 41%; Galilean-distance moons "20-40%" survive scattering.
- **Debes & Sigurdsson 2007**, ApJ 668:L167, https://arxiv.org/abs/0709.0945: of 2700 encounters of an Earth–Moon pair with a giant, "3.3% … resulted in only the Earth being ejected, while 123 or 4.6% … ended in an ejection of a bound Earth-Moon system"; "a 1-2% chance that any free floater would have a lunar mass companion"; tidal heat "larger than the current radiogenic heating of the Earth for up to the first few hundred million years".
- **Interstellar radiation field** (Mathis, Mezger & Panagia 1983), via Draine & Weingartner 1996, https://arxiv.org/abs/astro-ph/9605046, §7.1 and Table 3: "The total starlight energy density is u_ISRF = 8.64 × 10⁻¹³ ergs cm⁻³"; components UV 7.13 × 10⁻¹⁴, blackbodies W = 1 × 10⁻¹⁴ at 7500 K, 1.65 × 10⁻¹³ at 4000 K, 4 × 10⁻¹³ at 3000 K (λ > 2460 Å). Same total in Weingartner & Draine 2001 (astro-ph/0010117).
- **NIST Chemistry WebBook** (phase-change pages and saturation tables): triple points N₂ 63.14 K / 0.1252 bar, CO 68.1 K, CH₄ 90.67 K / 0.1169 bar, CO₂ 216.58 K / 5.185 bar, H₂ 13.957 K / 0.0736 bar; critical points H₂ 33.18 K / 13.00 bar, He 5.2 K / 2.274 bar; N₂ saturation 0.35075 bar at 69.363 K. Molar masses H₂ 2.01588, He 4.002602, N₂ 28.0134 g/mol. **NASA Sun fact sheet**: effective temperature 5772 K. **NIST CODATA**: σ = 5.670374419 × 10⁻⁸, h = 6.62607015 × 10⁻³⁴, k = 1.380649 × 10⁻²³, R = 8.314462618.

## Measurements

`node rogue.mjs` (needs `git clone --depth 1 https://github.com/mollous/Data_Liquid_Water_Conditions mollous` next to it):

```js
// Rogue planets: measurements for docs/research/rogue-planets.md.
// Needs the Mol Lous et al. 2022 data: git clone --depth 1 https://github.com/mollous/Data_Liquid_Water_Conditions mollous
import fs from 'node:fs';
const sigma = 5.670374419e-8, h = 6.62607015e-34, c = 299792458, kB = 1.380649e-23, Rgas = 8.314462618; // CODATA
const RE = 6.371e6, AE = 4 * Math.PI * RE ** 2;
const T = (F) => (F / sigma) ** 0.25;
const f = (x, d = 1) => x.toFixed(d);

// A. Internal heat only: T = (F/σ)^¼
console.log('\nA. Surface temperature from internal heat only');
const EARTH = 47e12 / AE;
for (const [name, F] of [
  ['Earth, 47 TW (Davies & Davies 2010)', EARTH],
  ['Earth, 0.087 W/m² (Pollack 1993, Abbot & Switzer)', 0.087],
  ['Earth radiogenic only, ~24 TW (KamLAND 20 + 4 TW K)', 24e12 / AE],
  ['Moon 16 mW/m² (Apollo 17)', 0.016],
  ['Moon 21 mW/m² (Apollo 15)', 0.021],
  ['Io 2.24 W/m² (Lainey 2009)', 2.24],
  ['Jupiter internal 7.485 W/m² (Li et al. 2018)', 7.485],
  ['Jupiter internal 5.444 W/m² (previous estimate)', 5.444],
  ['Earth 3 Gyr ago, ~2× today (Turcotte 1980)', 2 * 0.087],
  ['10 M⊕ rogue, 0.087·10^0.46 (Abbot & Switzer)', 0.087 * 10 ** (1 - 2 * 0.27)],
  ['3.5 M⊕ rogue, 0.087·3.5^0.46', 0.087 * 3.5 ** (1 - 2 * 0.27)],
]) console.log(`| ${name} | ${F.toPrecision(3)} | ${f(T(F))} K |`);

// Abbot & Switzer eq. 1: H = A/F ln(T_H/T_0), A = 651 W/m, T_H = 260 K
for (const M of [1, 3.5, 10]) {
  const F = 0.087 * M ** 0.46, T0 = T(F);
  console.log(`ice shell M=${M}: F=${f(F, 3)} T0=${f(T0)} K H=${f((651 / F) * Math.log(260 / T0) / 1e3)} km; ocean depth 4 km·M^0.46=${f(4 * M ** 0.46)} km ×(1000/917)=${f(4 * M ** 0.46 * 1000 / 917)} km ice-equivalent`);
}

// B. Size mix from Sumi et al. 2023: dN/dlogM = 2.18 (M/8 M⊕)^-0.96 per star (dex⁻¹)
console.log('\nB. Free-floating planets per star by game size class (Sumi 2023 single power law)');
const ck = (R) => (R <= 1.008 * 2.04 ** 0.279 ? (R / 1.008) ** (1 / 0.279) : 2.04 * (R / (1.008 * 2.04 ** 0.279)) ** (1 / 0.589));
const perStar = (m1, m2, A = 2.18, a = 0.96, M0 = 8) => // ∫ A (M/M0)^-a dlog10 M
  (A / (a * Math.log(10))) * ((m1 / M0) ** -a - (m2 / M0) ** -a);
const classes = [
  ['dwarf', ck(0.0625), ck(0.19)], ['small', ck(0.19), ck(0.5625)], ['earth', ck(0.5625), ck(1.5)],
  ['superEarth', ck(1.5), ck(3)], ['iceGiant', ck(3), ck(6)], ['gasGiant (≈0.1–13 M_J)', ck(6), 4130],
];
// The fit is measured over 0.33–6660 M⊕ (Sumi); below 0.33 M⊕ it is an extrapolation, so count those classes separately.
let tot = 0; const rows = classes.map(([n, a, b]) => { const lo = Math.max(a, 0.33), p = b > lo ? perStar(lo, b) : 0; tot += p; return [n, a, b, p, a < 0.33 ? perStar(a, Math.min(b, 0.33)) : 0]; });
for (const [n, a, b, p, ex] of rows) console.log(`| ${n} | ${a.toPrecision(2)}–${b.toPrecision(3)} | ${p.toFixed(2)} | ${(100 * p / tot).toFixed(1)}% | ${ex ? ex.toPrecision(3) : '–'} |`);
console.log(`total ${tot.toFixed(1)} per star; 0.33–6660 M⊕: ${perStar(0.33, 6660).toFixed(1)} (paper: 21); Earth-mass/Jupiter-mass per dex = ${(318 / 1) ** 0.96 | 0}`);
console.log(`Jupiter-mass per star, 0.5–2 M_J: ${perStar(159, 636).toFixed(3)} (Mróz 2017 95% limit 0.25)`);
console.log(`Gould 2022, 0.4 (M/38)^-0.92: 0.5–2 M_J ${perStar(159, 636, 0.4, 0.92, 38).toFixed(3)}, earth class ${perStar(ck(0.5625), ck(1.5), 0.4, 0.92, 38).toFixed(2)}`);

// C. Hydrogen greenhouse: fit τ = τ0 Pⁿ to Mol Lous et al. 2022 unbound planets.
// Columns: idx, t (yr), Mcore, Lcore, Ltot (L_J), P (bar), T (K), Lradio, mdot, a, Menv, ...
// L_J: README says 3.35e25 erg/s; Jupiter's intrinsic 5.444 W/m² × 4π(69911 km)² = 3.34e24 erg/s, so 3.35e17 W.
const LJ = 3.35e17;
const runs = fs.readdirSync('mollous/Cold_Cases').map((n) => fs.readFileSync('mollous/Cold_Cases/' + n, 'utf8')
  .trim().split('\n').slice(1).map((l) => l.split(',').slice(1).map(Number)));
const at = (run, t) => run.reduce((b, r) => (Math.abs(Math.log(r[0] / t)) < Math.abs(Math.log(b[0] / t)) ? r : b));
const pts = [];
for (const t of [1e9, 4.5e9]) {
  const surfR = {}; // thin-envelope (1e-6 M⊕) radius = the solid surface
  for (const run of runs) if (run[0][9] === 1e-6) surfR[run[0][1]] = at(run, t)[14];
  for (const run of runs) {
    const r = at(run, t), M = r[1], R = surfR[M], F = (r[3] * LJ) / (4 * Math.PI * (R * RE) ** 2);
    const tau = ((r[5] / T(F)) ** 4 - 1) / 0.75;
    pts.push({ t, M, Menv: r[9], P: r[4], Ts: r[5], F, g: M / R ** 2, tau });
  }
}
const lsq = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const n_ = sxy / sxx; return [10 ** (my - n_ * mx), n_]; };
const Ts = (F, tau) => T(F) * (1 + 0.75 * tau) ** 0.25;
const report = (label, sel, peff = (p) => p.P) => {
  const [tau0, n] = lsq(sel.map((p) => Math.log10(peff(p))), sel.map((p) => Math.log10(p.tau)));
  const err = sel.map((p) => Ts(p.F, tau0 * peff(p) ** n) - p.Ts);
  const rms = Math.sqrt(err.reduce((a, e) => a + e * e, 0) / err.length);
  console.log(`${label}: τ0=${tau0.toPrecision(3)} n=${n.toFixed(3)} N=${sel.length} rms ΔT=${f(rms)} K max |ΔT|=${f(Math.max(...err.map(Math.abs)))} K`);
  return [tau0, n];
};
console.log('\nC. Hydrogen greenhouse fits (Mol Lous 2022 unbound, 1 and 4.5 Gyr, M = 1–10 M⊕)');
const all = pts.filter((p) => p.P >= 1 && p.P <= 1e4);
const temperate = pts.filter((p) => p.Ts >= 150 && p.Ts <= 450);
report('all 1–1e4 bar', all);
const [tau0, n] = report('Ts 150–450 K', temperate);
report('Ts 150–450 K, P/√g', temperate, (p) => p.P / Math.sqrt(p.g));
console.log('| M⊕ | age | P (bar) | F (W/m²) | T_eff | Ts model | Ts fit | τ |');
for (const p of pts.filter((p) => [1, 3, 10].includes(p.M) && [1e-5, 1e-4, 1e-3].includes(p.Menv)))
  console.log(`| ${p.M} | ${p.t / 1e9} Gyr | ${p.P.toPrecision(3)} | ${p.F.toFixed(3)} | ${f(T(p.F))} | ${f(p.Ts)} | ${f(Ts(p.F, tau0 * p.P ** n))} | ${p.tau.toPrecision(3)} |`);
// Pressure for 273.15 K under the fit, for the game's heat flow EARTH_HEAT_FLOW × g
// Two-point fits on single planets (4.5 Gyr): n = Δlog τ / Δlog P
for (const M of [1, 10]) {
  const [a, b] = pts.filter((p) => p.t === 4.5e9 && p.M === M && (p.Menv === 1e-4 || p.Menv === 1e-3));
  const n2 = Math.log(b.tau / a.tau) / Math.log(b.P / a.P);
  console.log(`two-point ${M} M⊕: (${a.P.toPrecision(3)} bar, ${a.F.toFixed(3)} W/m², ${f(a.Ts)} K) & (${b.P.toPrecision(3)} bar, ${b.F.toFixed(3)} W/m², ${f(b.Ts)} K) → τ0=${(a.tau / a.P ** n2).toPrecision(3)} n=${n2.toFixed(3)}`);
}
const lr = runs.find((r) => r[0][1] === 1 && r[0][9] === 1e-6);
console.log(`Mol Lous 1 M⊕ radiogenic: ${(at(lr, 4.5e9)[6] * LJ / 1e12).toFixed(1)} TW at 4.5 Gyr, ${(at(lr, 1e9)[6] * LJ / 1e12).toFixed(1)} TW at 1 Gyr`);
const pFor = (F, Tt) => (((Tt / T(F)) ** 4 - 1) / 0.75 / tau0) ** (1 / n);
for (const [lbl, F] of [['Earth 0.092', EARTH], ['3 M⊕ (g≈1.7) 0.157', EARTH * 1.7], ['10 M⊕ (g≈3) 0.276', EARTH * 3], ['Moon-like 0.016', 0.016]])
  console.log(`P for 273 K at ${lbl} W/m²: ${pFor(F, 273.15).toPrecision(3)} bar; 300 K: ${pFor(F, 300).toPrecision(3)} bar`);
// Pierrehumbert & Gaidos 2011 checks (3 M⊕, g = 17 m/s², 280 K). Absorbed flux upper bound (albedo 0).
for (const [lbl, P, Fabs] of [['G star L=40 W/m², 10 bar', 10, 40 / 4], ['G star 15 AU, 100 bar', 100, 1361 / 225 / 4], ['M star 0.013 L☉ 2.4 AU, 100 bar', 100, (1361 * 0.013) / 2.4 ** 2 / 4]]) {
  const need = ((280 / T(Fabs)) ** 4 - 1) / 0.75;
  console.log(`P&G ${lbl}: F≤${Fabs.toFixed(2)} → τ needed ≥ ${need.toPrecision(3)}; fit τ(P) = ${(tau0 * P ** n).toPrecision(3)}; fit Ts = ${f(Ts(Fabs, tau0 * P ** n))} K`);
}
// Stevenson 1999: T_eff ~30 K, 1e2–1e4 bar
for (const P of [100, 1000, 1e4]) console.log(`Stevenson: T_eff 30 K, ${P} bar → fit Ts ${f(30 * (1 + 0.75 * tau0 * P ** n) ** 0.25)} K`);
// H2 scale height (NIST M = 2.01588 g/mol) vs N2 (28.0134)
for (const [gas, mu] of [['H2', 2.01588e-3], ['N2', 28.0134e-3]]) for (const [Tk, g] of [[280, 9.81], [280, 16.7], [40, 9.81]])
  console.log(`scale height ${gas} T=${Tk} g=${g}: ${f((Rgas * Tk) / (mu * g) / 1e3)} km`);

// D. Light: interstellar radiation field (Mathis, Mezger & Panagia 1983, via Draine & Weingartner 1996 Table 3)
console.log('\nD. Light');
const Bl = (l, Tk) => (2 * h * c * c) / l ** 5 / (Math.exp((h * c) / (l * kB * Tk)) - 1);
const band = (fn, a, b, N = 4000) => { let s = 0; for (let i = 0; i < N; i++) { const l = a + ((i + 0.5) * (b - a)) / N; s += fn(l); } return (s * (b - a)) / N; };
const uISRF = 8.64e-13 * 0.1; // erg/cm³ → J/m³
const Fsphere = (c * uISRF) / 4; // isotropic field onto a surface (per unit area of a sphere)
const comps = [[1e-14, 7500], [1.65e-13, 4000], [4e-13, 3000]];
const uVis = comps.reduce((s, [W, Tk]) => s + band((l) => (4 * Math.PI / c) * W * Bl(l, Tk), 400e-9, 700e-9), 0);
const sunVisFrac = band((l) => Bl(l, 5772), 400e-9, 700e-9) * Math.PI / (sigma * 5772 ** 4);
console.log(`ISRF flux onto a surface c·u/4 = ${Fsphere.toExponential(3)} W/m²; vs S⊕ 1361: ${(Fsphere / 1361).toExponential(2)}; vs S⊕/4: ${(Fsphere / 340.25).toExponential(2)}; vs Pluto 0.873: ${(Fsphere / 0.873).toExponential(2)}`);
console.log(`ISRF 400–700 nm: ${(c * uVis / 4).toExponential(3)} W/m²; Sun 400–700 nm at Earth ${f(1361 * sunVisFrac)} W/m² (5772 K BB fraction ${f(sunVisFrac, 3)}); ratio ${((c * uVis / 4) / (1361 * sunVisFrac)).toExponential(2)}`);
const visFrac = (Tk) => band((l) => Math.PI * Bl(l, Tk), 400e-9, 700e-9) / (sigma * Tk ** 4);
for (const Tk of [35, 50, 300, 900, 1373, 5772]) {
  const v = visFrac(Tk);
  // the integrand underflows for cold bodies: Wien estimate of log10 at 700 nm
  const log10 = v > 0 ? Math.log10(v) : Math.log10(Math.PI * (2 * h * c * c) / (700e-9) ** 5 * 300e-9 / (sigma * Tk ** 4)) - (h * c) / (700e-9 * kB * Tk) / Math.LN10;
  console.log(`BB ${Tk} K: visible fraction 10^${f(log10, 1)}; visible exitance ${v > 0 ? (v * sigma * Tk ** 4).toExponential(2) : '10^' + f(log10 + Math.log10(sigma * Tk ** 4), 0)} W/m²`);
}
// N2 vapour pressure upper bound below the triple point, from NIST saturation (63.151 K 0.12520 bar, 69.363 K 0.35075 bar)
const L_R = Math.log(0.35075 / 0.1252) / (1 / 63.151 - 1 / 69.363);
for (const Tk of [30, 35, 40, 45]) console.log(`N2 ≤ ${(0.1252 * Math.exp(-L_R * (1 / Tk - 1 / 63.151))).toExponential(1)} bar at ${Tk} K (ΔH/R=${f(L_R)} K, vaporisation; sublimation is steeper)`);
// Gravity-scaled fit τ = 6.38 (P/√g)^1.161: H₂ pressure for 273.15 K at the game's heat flow EARTH_HEAT_FLOW × g
console.log('\n| g (g⊕) | F = 0.092·g | T no air | P for 273 K | P for 300 K |');
for (const g of [0.4, 1, 1.7, 3]) {
  const F = EARTH * g, P = (Tt) => Math.sqrt(g) * (((Tt / T(F)) ** 4 - 1) / 0.75 / 6.38) ** (1 / 1.161);
  console.log(`| ${g} | ${F.toFixed(3)} | ${f(T(F))} K | ${P(273.15).toPrecision(3)} bar | ${P(300).toPrecision(3)} bar |`);
}
```

### 1. Abundance and mass mix

Sumi's power law, integrated over the game's classes (masses from the radii by Chen & Kipping, as `bodyMass` does), counted only above 0.33 M⊕ where it was measured:

| Class | Mass (M⊕) | Per star | Share | Extrapolated below 0.33 M⊕ |
|---|---|---|---|---|
| dwarf | 0.00005–0.0025 | — | — | 1.0 × 10⁵ |
| small | 0.0025–0.12 | — | — | 2.2 × 10³ |
| earth | 0.12–2.9 | 18.4 | 87% | 33 |
| superEarth | 2.9–9.3 | 1.8 | 8.5% | |
| iceGiant | 9.3–30 | 0.58 | 2.8% | |
| gasGiant | 30–4130 | 0.27 | 1.3% | |

The total reproduces the paper's 21 per star. Per decade of mass, Earth-mass rogues outnumber Jupiter-mass ones 318^0.96 ≈ 250 to 1. Jupiters (0.5–2 M_J) come to 0.04 per star (Gould's law: 0.036), inside Mróz's < 0.25. Real rogues outnumber stars ~20 to 1, and the count below 0.33 M⊕ is unmeasured.

### 2. Internal heat only

| Heat flow | F (W/m²) | T = (F/σ)^¼ |
|---|---|---|
| Earth, 47 TW | 0.0921 | 35.7 K |
| Earth, 0.087 (Abbot & Switzer) | 0.087 | 35.2 K |
| Earth radiogenic only, ~24 TW | 0.047 | 30.2 K |
| Moon, 16–21 mW/m² | 0.016–0.021 | 23.0–24.7 K |
| Earth 3 Gyr ago (2× today) | 0.174 | 41.9 K |
| 3.5 M⊕ / 10 M⊕ rogue (F ∝ M^0.46) | 0.155 / 0.251 | 40.6 / 45.9 K (paper: 46 K) |
| Io | 2.24 | 79.3 K |
| Jupiter's internal heat | 5.44–7.49 | 99–107 K |

Stevenson's "around 30 K" is a rogue Earth with radiogenic heat only, and Mol Lous's 1 M⊕ model at 4.5 Gyr has T_eff 31.3 K. Their model's radiogenic heat is 23.3 TW at 4.5 Gyr (KamLAND: ~24 TW) and 102 TW at 1 Gyr. The ISRF alone would hold a surface at (6.48 × 10⁻⁶/σ)^¼ = 3.3 K.

### 3. What stays gaseous at 25–50 K

N₂ freezes at 63 K, CO at 68 K, CH₄ at 91 K and CO₂ at 217 K (triple points). Below its triple point, N₂'s vapour pressure is at most 1.2 × 10⁻⁵ bar at 35 K and 1.6 × 10⁻⁴ bar at 40 K (extrapolated with the vaporisation enthalpy from NIST's table; sublimation falls faster). That is Pluto-like frost air at best. H₂ is above its critical point (33 K) on every rogue except the coldest dwarfs, and He's is 5.2 K. So the air is hydrogen–helium, or a trace of frost, or nothing. Scale height RT/μg: H₂ at 280 K and 1 g is 118 km, against N₂'s 8.5 km (14×); at 40 K it is 17 km.

### 4. Hydrogen greenhouse fit

τ for each Mol Lous unbound planet (1 and 4.5 Gyr), with F = L/(4πR²) at the solid surface (the 10⁻⁶ M⊕-envelope radius) and τ = ((T_s/T_eff)⁴ − 1)/0.75, fitted by least squares in log space:

| Fit | τ₀ | n | Points | rms ΔT | max ΔT |
|---|---|---|---|---|---|
| τ = τ₀Pⁿ, all 1–10⁴ bar | 2.53 | 1.229 | 418 | 29.9 K | 171 K |
| τ = τ₀Pⁿ, T_s 150–450 K | **3.67** | **1.188** | 153 | 10.6 K | 29 K |
| τ = τ₀(P/√g)ⁿ, T_s 150–450 K | **6.38** | **1.161** | 153 | 3.2 K | 15 K |
| two points, 1 M⊕ 4.5 Gyr: 133 bar, 0.058 W/m², 189.2 K; 1290 bar, 0.065, 373.3 K | 6.00 | 1.149 | 2 | | |
| two points, 10 M⊕ 4.5 Gyr: 100 bar, 0.216, 213.5 K; 987 bar, 0.290, 445.8 K | 3.52 | 1.158 | 2 | | |

The two-point fits differ in τ₀ by 1.70×, which is about what Pierrehumbert & Gaidos's p²/g scaling predicts ((2.96/1.08)^0.575 = 1.79). That is why the √g form fits 3× better. Samples (model T_s → T_s from the 150–450 K plain fit):

| M⊕ | Age | P (bar) | F (W/m²) | T_eff | T_s model | T_s fit |
|---|---|---|---|---|---|---|
| 1 | 4.5 Gyr | 13.5 / 133 / 1290 | 0.054–0.065 | 31–33 K | 90 / 189 / 373 K | 88 / 176 / 354 K |
| 3 | 4.5 Gyr | 11.2 / 111 / 1080 | 0.089–0.115 | 35–38 K | 91 / 193 / 389 K | 94 / 190 / 387 K |
| 10 | 4.5 Gyr | 10.1 / 100 / 987 | 0.18–0.29 | 42–48 K | 99 / 214 / 446 K | 109 / 224 / 475 K |
| 3 | 1 Gyr | 11.1 / 110 / 1060 | 0.36–0.46 | 50–53 K | 135 / 275 / 547 K | 133 / 265 / 544 K |

Independent checks (the plain fit, which was fitted without these points):

- Pierrehumbert & Gaidos (line-by-line H₂ CIA, g = 1.73 g⊕, 280 K). Their absorbed starlight is at most S/4 (albedo 0). 10 bar with S = 40 W/m² needs τ ≥ 45, and the fit gives 57. At 100 bar, the G star at 15 AU needs τ ≥ 306 and the M star at 2.4 AU τ ≥ 604, and the fit gives 874. These agree within their unknown albedos.
- Stevenson: T_eff 30 K with 10², 10³, 10⁴ bar gives 152, 301, 596 K. Water melts near 10³ bar, inside his 10²–10⁴ bar.

H₂ needed for the game's heat flow (0.092 W/m² × g), from the √g fit:

| g (g⊕) | F (W/m²) | T without air | P for 273 K | P for 300 K |
|---|---|---|---|---|
| 0.4 | 0.037 | 28.4 K | 401 bar | 553 bar |
| 1 | 0.092 | 35.7 K | 288 bar | 397 bar |
| 1.7 | 0.157 | 40.8 K | 237 bar | 328 bar |
| 3 | 0.276 | 47.0 K | 193 bar | 267 bar |

### 5. Ocean under ice

Abbot & Switzer's eq. 1 reproduces their threshold. At 3.5 M⊕ (F 0.155 W/m², top 40.6 K) the ice is 7.8 km, equal to the ocean's ice-equivalent depth (4 km × 3.5^0.46 × 1000/917 = 7.8 km). At 1 M⊕ it is 15.0 km of ice against a 4.4 km ocean (frozen through); at 10 M⊕, 4.5 km against 12.6 km (an ocean under 4.5 km of ice). 3.5 M⊕ is 1.69 R⊕ by Chen & Kipping (the superEarth class), and 0.3 M⊕ is 0.72 R⊕ (the earth class).

### 6. Moons

An ejected Jupiter keeps 47% of its moons, and ~85% of those at Galilean distances (Rabago & Steffen). Of Earth–Moon pairs ejected by a giant, 123 of 213 (58%) stayed bound (Debes & Sigurdsson), but they estimate only 1–2% of all rogues have a lunar-mass companion, since few start with one. Across all scattering moons, 2% end up around a free-floater (Hong et al.).

### 7. Light

The ISRF onto a surface (isotropic, c·u/4) is **6.5 × 10⁻⁶ W/m²**: 4.8 × 10⁻⁹ of sunlight at Earth (20.8 magnitudes), or 7.4 × 10⁻⁶ of Pluto's. In 400–700 nm it is 1.35 × 10⁻⁶ W/m² against the Sun's 499 W/m² (a 5772 K blackbody's 36.6% share of 1361), a ratio of **2.7 × 10⁻⁹**.

Visible (400–700 nm) share of a blackbody's emission: 35 K 10^−247, 50 K 10^−172, 300 K 10^−25, 900 K 10^−6.6 (9 mW/m²), 1373 K (yellow lava, `lava.md`) 10^−3.7 = 40 W/m². A 35 K world gives off no visible light and reflects only ~10⁻⁶ W/m² of starlight. A molten vent emits 3 × 10⁷ times the visible starlight falling on the surface around it.

## Game mapping (proposals)

- **Count** (deliberate deviation): reality has ~21 rogues per star above 0.33 M⊕ (~84 000 for 4000 stars). The game places a handful (e.g. 5–8) so each one is a find. Say so in a code comment.
- **Size mix**: real rogues are ~87% earth class, 8.5% superEarth, 3% ice giant, 1% gas giant (≥ 0.33 M⊕). For a handful, weight towards variety while keeping the order: e.g. earth 45%, superEarth 25%, small 10%, ice/gas giant 20% (about 1 in 5 against the real 1 in 25: a stated deviation, since giants carry the moons). Dwarfs are probably the most numerous but are unmeasured and dull to visit, so leave them out.
- **Climate**: insolation 0. Heat flow as now (`EARTH_HEAT_FLOW × gravity`, lava worlds floored at 1–3 W/m²), so airless rogues sit at 28–47 K (rocky) and ~80–110 K for Io- or Jupiter-like heat. Adding the ISRF changes nothing (3.3 K on its own).
- **Atmosphere**: the cosmic shoreline doesn't apply (I = 0 keeps everything), but condensation does. A rogue gets `none`; a Pluto-like ≤ 10⁻⁴ bar N₂ frost trace on ice worlds; or a new **`hydrogen`** composition, 10–10⁴ bar (Stevenson's range). Grey fit: **τ = 6.38 (P/√g)^1.161** (rms 3 K over 150–450 K). In the existing τ = τ₀ · greenhouse · Pⁿ that is τ₀ = 6.38, n = 1.161 with greenhouse = g^−0.58. Without gravity: τ₀ = 3.67, n = 1.188 (rms 11 K). Liquid water at 1 g needs ~290–400 bar. Drawing "sea" rogues at 300–600 bar gives 3–65 °C at 1 g, 19–84 °C at 1.7 g and 37–106 °C at 3 g (checked with `node -e`), so heavier worlds want the low end. No cloud albedo (no starlight). H₂'s scale height is ~14× N₂'s, so a hydrogen rogue's glow shell can be visibly thicker.
- **Under-ice oceans**: a hidden sea when M ≥ 3.5 M⊕ (≈ 1.7 R⊕: the superEarth class), or down to 0.3 M⊕ (≈ 0.7 R⊕) for ocean/ice types (10× water) or with a frozen CO₂ cover. The ice is 4–15 km thick (∝ 1/F).
- **Moons**: gas and ice giants keep their moons (most of them at Galilean distances, 85%). A terrestrial rogue rarely has one (1–2% real). A stylised 20–30% gives "some with a moon"; a moon adds tidal heat (Debes & Sigurdsson: above Earth's radiogenic heat for a few hundred Myr), which the existing tidal model provides.
- **Light** (deliberate deviation): real galactic light is 4.8 × 10⁻⁹ of sunlight (2.7 × 10⁻⁹ in the visible): pitch black to the eye. The game's galaxy-glow ambient will be many orders brighter; state the factor next to the constant. The body's own glow comes only from molten or Io-hot vents (visible from ~900 K), never from a 35 K surface or a ~100 K giant.

## Open questions

- The H₂ fit is fitted to a model (Mol Lous: double-grey atmosphere, Freedman opacities extrapolated below 75 K, solar H–He), not to measurements. Pierrehumbert & Gaidos agree within their unknown albedos (τ ≥ 45 needed vs 57; ≥ 306–604 vs 874). The fit is 10–30 K off outside 150–450 K and overshoots badly above 10³ bar (max 171 K over the full range).
- Mol Lous's luminosity unit is printed as 3.35 × 10²⁵ erg/s. 3.35 × 10²⁴ is used here, from Jupiter's measured internal heat and Earth's radiogenic heat. Not confirmed by the authors.
- The KamLAND 20.0 TW value is from a search summary (the abstract's figure did not render). Stevenson's full text (his heat flow and pressure for a given T_s) is paywalled; only the abstract was read.
- Sumi's slope is uncertain (α 0.96 +0.47/−0.27), and below 0.33 M⊕ it is extrapolation. The gas-giant share (1.3%) moves by ~2× within the errors.
- Abbot & Switzer's conductive threshold is reproduced. Their convective case at low mass (their Fig. 1) is not recomputed here.
- Young rogue giants glow from contraction heat. No source on their effective temperatures vs age was read, so ~100 K is only Jupiter today.
