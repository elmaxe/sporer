# Craters: shape, ejecta and how many

## Question

GitHub issue #98 ("Craters on barren worlds") adds impact craters to the terrain of airless barren planets and moons. Comets and asteroids already carry 2–6 bowl craters in `gen/shape.ts` (step 25); this note gives the numbers for craters on round bodies. It needs:

1. Fresh crater shape against rim diameter D: depth d(D) and rim height h(D), simple and complex; the simple-to-complex transition diameter on the Moon and how it scales with surface gravity.
2. Complex craters: central peak height, flat floor diameter, where central peaks appear and where peak-ring basins begin.
3. The ejecta blanket: thickness against distance and how far the continuous blanket reaches.
4. How many craters: the size–frequency slope, geometric saturation and the real (equilibrium) density as a fraction of it.
5. Total relief of the Moon and Mercury as a fraction of the radius, to scale the craters against the body.
6. Degradation: how old craters get shallower.

Precision: shapes within ~20% and the right trend with size and gravity; the player reads none of these as a number.

Reference craters: Linné (2.2 km, Moon, simple), Moltke (6.5 km, simple), Tycho (85 km, complex), Copernicus (93 km, complex), Meteor Crater (1.19 km, Earth, simple), Orientale (basin, ejecta), plus fresh craters on Mercury.

## Sources

All accessed 2026-10-03. PDFs were downloaded with curl and read as text or as page images; "search summary" marks a value seen only in a WebSearch summary and not confirmed in the source.

- **Pike 1977, "Size-dependence in the shape of fresh impact craters on the moon"**, in *Impact and Explosion Cratering*, pp. 489–509 (ADS scan, https://articles.adsabs.harvard.edu/pdf/1977iecp.symp..489P, read as page images). Table 1, "Data for shape model of fresh lunar craters", log y = log b + a log x, all in km, x = rim-crest diameter: depth <15 km: a 1.010, b 0.196 (N 171); depth >15 km: 0.301, 1.044 (N 33); rim height <15 km: 1.014, 0.036 (N 124); rim height >15 km: 0.399, 0.236 (N 38); rim width <15 km: 1.011, 0.257; >15 km: 0.836, 0.467; floor diameter <20 km: 1.765, 0.031; >20 km: 1.249, 0.187; width of continuous ejecta (all, Moore et al. 1974): 1.001, 0.674; relief of central peak (>27 km, N 22): 0.900, 0.032; length (radius) of rays (Moore et al. 1974): 1.25, 4.41. Text: "Eleven changes in the shape of fresh lunar craters occur within a diameter range of 10–30 km (average, 17.5 km)"; the two depth fits "intersect at a crater diameter of about 10.6 km"; rim-height fits intersect "at a diameter of about 21.3 km"; floor fits "intersect at a crater diameter of 33 km"; Eq. (14) "does not extend to craters less than 5 km across (approximately where D_f goes to zero)"; flat floors are "up to 75%" of the rim diameter over 20 km; peaks, terraces and flat floors go from absent to present "within a restricted size-range, about 9–22 km in diameter, and averages 15 km"; "Peaks in seven craters under 28 km across are systematically lower than peaks in the 22 larger craters"; "simple craters seem to be stable only up to about 15–20 km across"; rimwall slope tangent rises from "about 0.34 (19°) in craters 0.5 km across to a maximum of about 0.55 (29°) at a diameter of 10–20 km, then dropping sharply … to a value of about 0.25 (14°) at 50–60 km"; terrestrial craters (Fig. 10): "Depth data for terrestrial craters inflect at about one-sixth of the diameter at which depth inflects for lunar craters"; central uplifts "first appear in terrestrial impact craters 2–4 km across, or about one-sixth the crater size at which similar changes take place on the moon". Terrestrial rim height (Pike 1972), Eq. (5): R_e = 0.033 D^0.94.
- **Holsapple, "Theory and equations for 'Craters from Impacts and Explosions'"** (LPI crater calculator notes), https://www.lpi.usra.edu/lunar/tools/lunarcratercalc/theory.pdf. Cross-check of Pike's laws as used in a crater model: "The Pike data for lunar craters gives for the depth of complex craters d = 1.044 (D_r)^0.301 in km units", rim height "h = 0.236 (D_r)^0.399 for complex craters and h = 0.036D for simple", floor "D_f = 0.187 (D_r)^1.249 for diameters greater than 20 km"; "a transition to complex shapes beginning at 10.6 km rim diameter. The transition in rim heights begins at the larger size, 22.8 km diameter"; transition radius taken ∝ Y/(ρg).
- **Melosh & Ivanov 1999, "Impact crater collapse"**, Annu. Rev. Earth Planet. Sci. 27, 385 (https://sseh.uchicago.edu/doc/Melosh_Ivanov_1999.pdf): the transition "depends on 1/g"; "relatively well determined on the Moon at about 15 km diameter. On Mercury and Mars the transition occurs at about 7 km diameter, and on Earth it drops to 3 to 5 km diameter"; Vesta's crater matches "a gravity-scaled 62 km-diameter crater on the Moon", extending the 1/g relation over "more than two orders of magnitude"; peak rings appear "at about one-half the rim diameter", and the central-peak-to-peak-ring transition "also appears to scale as 1/g".
- **Silber et al. 2017, JGR Planets** (https://arxiv.org/abs/1704.04247): "roughly 1/g dependence"; on the Moon "approximately 20 km [Pike, 1977a,b; 1980]", "the average crater diameter at which the transition occurs on Moon is about 19 km"; transitional craters (flat floor, no peak) begin "at approximately 13 km"; Mars and Mercury gravity "3.72 m/s2 and 3.70 m/s2"; on Mercury complex features start "at a factor of 1.5-2 larger than expected diameters", attributed to the higher impact speed ("42.5 km/s" median vs "about 13 km/s" RMS on Mars).
- **Barnouin et al. 2012, "The morphology of craters on Mercury: Results from MESSENGER flybys"**, Icarus 219, 414 (https://ntrs.nasa.gov/api/citations/20130014883/downloads/20130014883.pdf): Pike reported Dt on Mercury changing "from 10 km to 14 km between his 1980 and 1988 studies"; on Mars Dt "increased from 6–7 km to 7–8 km"; "Dt was found to be 10 km; here it appears to be closer to 12 km"; fresh (Class 5) simple craters "d = (0.18 ± 0.1) D^(0.98 ± 0.04)", all simple craters "d = (0.18 ± 0.1) D^(0.70 ± 0.3)" (km); "both simple and complex craters become shallower with increasing degradation state", complex craters mostly by infilling, simple craters by "subsequent cratering that erodes them".
- **Kring 2017, *Guidebook to the Geology of Barringer Meteorite Crater, Arizona*, LPI Contribution 2040, chapter 4** (https://www.lpi.usra.edu/publications/books/barringer_crater_guidebook/chapter_4.pdf): "a diameter of ~1.2 km", "a rim that rises 30 to 60 m above the surrounding plain and a bowl-shaped depression that is ~180 m deep", upper walls "~40 to ~50°"; simple morphology for craters "≲2 km diameter in sedimentary targets and ≲4 km diameter in crystalline targets (under Earth's gravity)"; Roddy (1978): rim structural uplift "~47 m above the pre-impact surface", pre-erosion ejecta on the rim "~20 ± 5 m"; fallout and breccia lens begin ~150 and ~160 m below the pre-impact surface.
- **Margot, Campbell, Jurgens & Slade 1999, "The topography of Tycho Crater"**, JGR 104, 11875 (https://seti.ucla.edu/jlm/publications/1998JE900047.pdf, read as page images): "the 85 km diameter crater: the floor of Tycho lies 3970 m below a 1738 km radius sphere, and the crater's central peak rises 2400 m above the floor. The average rim crest elevation is 730 m above the 1738 km datum, giving a mean rim to floor depth of 4700 m"; "The floor diameter measured at the -3700 m contour line is 48 km"; rim height over the terrain outside "appears to be ~900 m. This number is uncertain"; Pike (1980) gave floor 46 km and depth 4600 m; Pike's rim regression "is 1400 m", Melosh's theory "of the order of 1200 m".
- **Garvin et al. 2011, "Linne: simple lunar mare crater geometry from LRO observations"**, LPSC 42, #2063 (https://www.lpi.usra.edu/meetings/lpsc2011/pdf/2063.pdf): "Linne is a 2.22 km diameter simple impact crater", "d/D of … (Linne is 0.245)"; the cavity is "a truncated cone" (power-law exponent 1.4–1.5), wall slope "~ 33 degrees"; ejecta thickness "decays with a power-law exponent of -3.84 (+/- 0.04), which differs from classical ETF behavior where a power-law of -2.75 is typical".
- **The Moon wiki (the-moon.us), Kurt Fisher crater-depth database** (raw pages for Moltke, Copernicus, Linné, Tycho; secondary): Moltke "Pike, 1976: 1.3 km" (Westfall 2000 1.3, Viscardy 1985 1.31, Cherrington 1969 0.73); Copernicus "Diam: 93 km", "Pike, 1976: 3.8 km", and a user's Kaguya-profile measurement "Average crater depth … = 3.65km", main central peak "1.2 km (1174 m approx.)" from shadows; Linné "Pike, 1976: 0.6 km" (Arthur 1974 0.47, Cherrington 1969 0.48). Wikipedia's Moltke infobox: "diameter = 6.5 km", depth 1.3 km (Pike 1976).
- **Raggio et al. 2016, "Advancements in scaling models for ejecta blankets of lunar impact craters"**, LPSC 47, #1401 (https://www.hou.usra.edu/meetings/lpsc2016/pdf/1401.pdf), quoting McGetchin et al. (1973): t = T (r/R)^B, "T is the rim height: 0.04R (for simple craters), and 0.14R^0.74 (for complex craters), with variable B empirically determined as -3 ±0.5"; only "~20% of rim material is actual ejecta" (Sharpton 2014); McGetchin "somewhat underestimates ejecta thickness for simple craters" and underestimates complex craters "by a kilometer or more near the rim", and "the -3 dependence on radius also underestimates the rate at which the ejecta thickness decays".
- **Minton et al. 2019, "The equilibrium size-frequency distribution of small craters reveals the effects of distal ejecta on lunar landscape morphology"**, Icarus (https://arxiv.org/abs/1902.07746): continuous ejecta "within a region bounded by 2 − 3 × the crater radius", h = h_rim (d/r)^−3 (McGetchin 1973), exponent fitted "from r = 0.1 m laboratory scale craters up to the r = 593 m Meteor Crater", "a reasonable approximation even for the r = 465 km Orientale basin"; "For r = 0.1 − 100 m craters, h_rim = 0.04r"; geometric saturation "n_gsat = 0.385 r^−2 (Gault, 1970)" (cumulative, per unit area, crater radius r); equilibrium "proportional r^−2" and "a few percent of so-called geometric saturation"; Apollo 15 site Fit 1 (β = 2) "n_eq = 0.0084", "2.2% of geometric saturation"; Fit 2 "β = 1.8"; NPF "steep (η ≈ 3) for craters with r ≲ 2 km", "shallow ∼ 2 km < r <∼ 30 km and then steep for larger craters and basins"; NPF fit below r = 500 m "η = 3.2"; degraded craters' rims "flatten and the inner bowl … become shallower".
- **Hirabayashi et al. 2017, "An analytical model of crater count equilibrium"** (https://arxiv.org/abs/1701.00471): equilibrium slopes "from -1.8 to -2.0 if the slope of the crater production function is steeper than -2"; single-size hexagonal packing "q = π/2√3 ∼ 0.907"; Sinus Medii production slope r^−3.25, equilibrium r^−1.8.
- **Vitale & Hirabayashi 2026, "Degradation mechanisms and efficiency of heavily cratered regions on Ceres"** (https://arxiv.org/abs/2604.16223): geometric saturation "C_gs = 1.54D^−2" (km⁻²); Hartmann (1984) equilibrium "for diameters between 0.06 and 32 km on the Moon … Cc∞ = 0.046D^−1.83"; Minton's Apollo 15 "Cc∞ = 0.02D^−1.8"; lunar saturation level "between 1 and 10% (Z. Xiao & S. C. Werner 2015)"; NPF slope change at 1 km.
- **craterstats function definitions** (Michael, https://raw.githubusercontent.com/ggmichael/craterstats/main/src/craterstats/config/functions.txt): Neukum et al. (2001) lunar production function coefficients a0…a11 = −3.0768, −3.557528, 0.781027, 1.021521, −0.156012, −0.444058, 0.019977, 0.086850, −0.005874, −0.006809, 8.25e−04, 5.54e−05 for log N(>D) = Σ a_k (log D)^k, D 0.01–300 km ("published value is a0=-3.0876, but this appears to be a typo (either way, a0 is superfluous…)"); Hartmann (1984) equilibrium coefficients [−1.14, −1.83] in cumulative form (from Hartmann's incremental −1.33, "Correction provided by Kjartan Kinch 2017-03"); Trask (1966) lunar equilibrium [−1.1, −2.].
- **Smith et al. 2017, "Summary of the results from the lunar orbiter laser altimeter after seven years in lunar orbit"**, Icarus 283, 70 (accepted manuscript, https://ntrs.nasa.gov/api/citations/20160008718/downloads/20160008718.pdf): "LOLA topographic extremes are about 19.92 km" (SELENE: "19.8 km"); relative to the 1737.4 km datum "the deepest point, -9.129 km, lies at 70.36°S, 187.52°E, and the highest, 10.792 km, lies at 5.341°N, 201.37°E"; mean radius C00 "1737.1513±0.0005" km; Orientale ejecta (Fassett et al. 2011) "∼2900 m near the Cordillera Mountains … decaying to ∼1 km in thickness at a range of 215 km". LROC (https://lroc.im-ldi.com/images/249): highest point "10,786 meters".
- **Becker et al. 2016, "First global digital elevation model of Mercury"**, LPSC 47, #2959 (https://www.hou.usra.edu/meetings/lpsc2016/pdf/2959.pdf), Table 1 at 2 km/pixel: minimum "-5380 m", maximum "4481 m", standard deviation "1092 m", relative to "a datum radius of 2439.4 km"; lowest point in Rachmaninoff, "actual elevation extremes from higher resolution products will likely be more extreme".
- **Neumann et al. 2015, "Lunar impact basins revealed by Gravity Recovery and Interior Laboratory measurements"**, Sci. Adv. 1, e1500852 (PMC copy, https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4646831/): "A distinct transition in morphology with increasing diameter is seen at a diameter of about 200 km", from complex craters to peak-ring basins; "the transition to multiring basins at about 500 km"; "the diameter of the main topographic rim is about twice the peak-ring diameter".
- **Stopar et al. 2017**, Icarus 298, 34, via the LROC feature (https://lroc.im-ldi.com/images/975): fresh craters "larger than 400 m in diameter have depth-to-diameter ratios around 0.2", 200–400 m "(0.17)", 100–200 m "around 0.15", 30–100 m "around 0.12".
- **NASA planetary fact sheets** (nssdc.gsfc.nasa.gov/planetary/factsheet/): surface gravity Moon 1.62, Mercury 3.70, Mars 3.73, Earth 9.820 m/s²; volumetric mean radius Moon 1737.4 km; "Topographic range (km)" Moon 13, Mercury 7, Mars 30, Earth 20.4 (older values than LOLA and the MESSENGER DEM).
- **Marcus, Melosh & Collins 2004**, LPSC 35, #1360 (https://www.lpi.usra.edu/meetings/lpsc2004/pdf/1360.pdf), the Earth Impact Effects Program: transition "taken to be 3.2 km on Earth"; rim height taken as the ejecta thickness at the rim, falling off "as one over the distance from the crater rim cubed". (The full Collins et al. 2005 paper at impact.ese.ic.ac.uk returned 404.)

## Measurements

Script (`node craters.mjs`):

```js
// Pike 1977 Table 1: y = b·D^a, D = rim-crest diameter (km), y in km.
const pike = {
  depthSimple: [0.196, 1.010], depthComplex: [1.044, 0.301],
  rimSimple: [0.036, 1.014], rimComplex: [0.236, 0.399],
  floorSmall: [0.031, 1.765], floorLarge: [0.187, 1.249],
  ejectaWidth: [0.674, 1.001], peak: [0.032, 0.900],
};
const f = ([b, a], D) => b * D ** a;
const cross = ([b1, a1], [b2, a2]) => (b2 / b1) ** (1 / (a1 - a2));
const r = (x, n = 2) => x.toFixed(n);
console.log('Fit intersections (km): depth', r(cross(pike.depthSimple, pike.depthComplex), 1),
  '| rim', r(cross(pike.rimSimple, pike.rimComplex), 1), '| floor', r(cross(pike.floorSmall, pike.floorLarge), 1));

// Reference craters: D (km), measured depth and rim height (km), source keys.
const refs = [
  { name: 'Linné', D: 2.22, depth: [0.245 * 2.22, 'Garvin 2011 d/D 0.245'], depth2: [0.6, 'Pike 1976'] },
  { name: 'Moltke', D: 6.5, depth: [1.3, 'Pike 1976'] },
  { name: 'Copernicus', D: 93, depth: [3.8, 'Pike 1976'], depth2: [3.65, 'Kaguya profiles (the-moon.us)'], peak: [1.2, 'shadow (the-moon.us)'] },
  { name: 'Tycho', D: 85, depth: [4.7, 'Margot 1999'], rim: [0.9, 'Margot 1999 (~)'], floor: [48, 'Margot 1999'], peak: [2.4, 'Margot 1999'] },
  { name: 'Meteor Crater (Earth)', D: 1.19, depth: [0.18, 'Kring 2017 (~)'], rim: [0.045, 'Kring 2017: 30–60 m'] },
];
console.log('\n| Crater | D (km) | Law | Depth: law | measured | law/meas | Rim: law | measured | Floor: law | meas | Peak: law | meas |');
for (const c of refs) {
  const complex = c.D > 15;
  const d = f(complex ? pike.depthComplex : pike.depthSimple, c.D);
  const h = f(complex ? pike.rimComplex : pike.rimSimple, c.D);
  const fl = c.D > 20 ? f(pike.floorLarge, c.D) : (c.D > 5 ? f(pike.floorSmall, c.D) : 0);
  const pk = c.D > 27 ? f(pike.peak, c.D) : 0;
  const dm = c.depth[0];
  console.log(`| ${c.name} | ${c.D} | ${complex ? 'complex' : 'simple'} | ${r(d)} | ${r(dm)}${c.depth2 ? ' / ' + r(c.depth2[0]) : ''} | ${r(d / dm)}${c.depth2 ? ' / ' + r(d / c.depth2[0]) : ''} | ${r(h, 3)} | ${c.rim ? r(c.rim[0], 3) : '–'} | ${fl ? r(fl, 1) : '–'} | ${c.floor ? c.floor[0] : '–'} | ${pk ? r(pk) : '–'} | ${c.peak ? c.peak[0] : '–'} |`);
}
console.log('Meteor Crater, Pike 1972 terrestrial rim law 0.033 D^0.94:', r(0.033 * 1.19 ** 0.94, 3), 'km');

// Simple-to-complex transition ∝ 1/g (NASA fact sheet gravities).
const g = { Moon: 1.62, Mercury: 3.70, Mars: 3.73, Earth: 9.82 };
const measured = { Moon: '15 (M&I 1999); 10–20, mean 17.5 (Pike 1977); ~19–20 (Silber 2017)', Mercury: '10 (Pike 1988), ~12 (Barnouin 2012), 11.7 ± 1.2 (search summary)', Mars: '6–7 → 7–8 (Barnouin 2012); ~7 (M&I)', Earth: '2 sed. / 4 cryst. (Kring 2017); 3–5 (M&I)' };
console.log('\n| Body | g (m/s²) | D_t from Moon 15 km × g_Moon/g | from 17.5 km | measured (km) |');
for (const [b, gb] of Object.entries(g)) console.log(`| ${b} | ${gb} | ${r(15 * 1.62 / gb, 1)} | ${r(17.5 * 1.62 / gb, 1)} | ${measured[b]} |`);
console.log('Earth/Moon gravity ratio', r(9.82 / 1.62), '(Pike 1977: terrestrial inflection at "about one-sixth")');

// Ejecta: t = T (r/R)^-3; T = 0.04 R (simple), 0.14 R^0.74 (m, complex) — McGetchin et al. 1973 via Raggio 2016.
const Tcomplex = Rm => 0.14 * Rm ** 0.74;
const Ror = 465e3; // Orientale rim radius (m), Minton 2019
console.log('\nOrientale: T at rim', r(Tcomplex(Ror), 0), 'm (LOLA/Fassett 2011: ~2900 m);',
  'at 215 km beyond rim: (r/R)^-3 =', r(((Ror + 215e3) / Ror) ** -3, 3), '→ ×2900 m =', r(2900 * ((Ror + 215e3) / Ror) ** -3, 0), 'm (measured ~1000 m)');
const Rmc = 1190 / 2;
console.log('Meteor Crater rim ejecta: 0.04 R =', r(0.04 * Rmc, 1), 'm; 0.14 R^0.74 =', r(Tcomplex(Rmc), 1), 'm (Roddy 1978 via Kring: ~20 ± 5 m)');
console.log('Continuous ejecta outer edge (Pike/Moore 0.674 D from rim):', r(1 + 2 * 0.674, 2), 'R from centre (Minton: 2–3 R)');
for (const x of [1, 1.5, 2, 2.35, 3]) console.log(`  r/R ${x}: thickness ${r(x ** -3, 3)} of rim (exp −3), ${r(x ** -3.84, 3)} (Linné −3.84), ${r(x ** -2.75, 3)} (−2.75)`);

// Crater size-frequency: Neukum et al. 2001 lunar production function (craterstats coefficients).
const a = [-3.0768, -3.557528, 0.781027, 1.021521, -0.156012, -0.444058, 0.019977, 0.086850, -0.005874, -0.006809, 8.25e-4, 5.54e-5];
const logN = D => a.reduce((s, ak, k) => s + ak * Math.log10(D) ** k, 0);
console.log('\nNPF (1 Gyr-ish a0) local cumulative slope b in N(>D) ∝ D^-b:');
for (const D of [0.01, 0.03, 0.1, 0.3, 1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300]) {
  const e = 1e-4, b = -(logN(D * (1 + e)) - logN(D)) / Math.log10(1 + e);
  console.log(`  D ${D} km: N(>D) ${logN(D).toFixed(2)} (log10 /km²), b = ${r(b)}`);
}
const geo = 0.385 * 4; // Gault: n = 0.385 r^-2 → N(>D) = 0.385 (D/2)^-2
console.log('Geometric saturation N(>D) =', r(geo), 'D^-2');
const eq = { 'Minton 2019 Fit 1 (0.0084 r^-2)': 0.0084 * 4, 'Hartmann 1984 0.046 D^-1.83 (as quoted)': 0.046, 'Hartmann 1984 cumulative 10^-1.14 (craterstats)': 10 ** -1.14, 'Trask 1966 10^-1.1 D^-2': 10 ** -1.1 };
for (const [k, v] of Object.entries(eq)) console.log(`  ${k}: N(>1 km) = ${v.toFixed(4)} → ${r(100 * v / geo, 1)}% of geometric saturation at D = 1 km`);
for (const D of [0.1, 1, 10]) console.log(`  Hartmann (0.046) at D=${D}: ${r(100 * 0.046 * D ** -1.83 / (geo * D ** -2), 1)}%`);

// Relief as a fraction of radius.
const relief = { Moon: [10.792 + 9.129, 1737.1513], Mercury: [4.481 + 5.380, 2439.4] };
console.log('\n| Body | range (km) | radius (km) | range/R |');
for (const [b, [h, R]] of Object.entries(relief)) console.log(`| ${b} | ${r(h, 3)} | ${R} | ${r(100 * h / R, 3)}% |`);
console.log('Tycho depth/Moon radius', r(100 * 4.7 / 1737.15, 3) + '%');

// Degradation: Mercury (Barnouin 2012) fresh d = 0.18 D^0.98, all simple craters d = 0.18 D^0.70.
for (const D of [1, 2, 5, 10]) console.log(`Mercury D ${D} km: fresh ${r(0.18 * D ** 0.98)} km, average ${r(0.18 * D ** 0.7)} km, ratio ${r(D ** 0.7 / D ** 0.98)}; d/D fresh ${r(0.18 * D ** -0.02, 3)}, average ${r(0.18 * D ** -0.3, 3)}`);
```

### Shape laws against reference craters

The fits cross where Pike says they do: depth at 10.6 km, rim height at 21.3 km, floor at 32.6 km ("33 km"). The table switches to the complex laws above 15 km (Pike's split for depth and rim) and uses the large-floor law above 20 km.

| Crater | D (km) | Law | Depth: law | Measured | Law / measured | Rim: law | Measured | Floor: law | Measured | Peak: law | Measured |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Linné | 2.22 | simple | 0.44 | 0.54 (Garvin, d/D 0.245) / 0.60 (Pike 1976) | 0.81 / 0.73 | 0.081 | – | – | – | – | – |
| Moltke | 6.5 | simple | 1.30 | 1.30 (Pike 1976) | 1.00 | 0.240 | – | 0.8 | – | – | – |
| Copernicus | 93 | complex | 4.09 | 3.80 (Pike 1976) / 3.65 (Kaguya, amateur) | 1.08 / 1.12 | 1.440 | – | 53.8 | – | 1.89 | 1.2 (shadow, amateur) |
| Tycho | 85 | complex | 3.98 | 4.70 (Margot) | 0.85 | 1.389 | ~0.9 (Margot, "uncertain") | 48.0 | 48 (Margot) | 1.74 | 2.4 (Margot) |
| Meteor Crater (Earth) | 1.19 | simple (lunar law) | 0.23 | ~0.18 (Kring) | 1.30 | 0.043 | 0.030–0.060 (Kring) | – | – | – | – |

Pike's 1972 terrestrial rim law gives 0.039 km for Meteor Crater, also inside Kring's 30–60 m.

- Moltke matches exactly and Tycho's floor to 0.2%. Margot quotes Pike's regression rim height for Tycho as "1400 m", which the script reproduces (1389 m), so the coefficients are read right.
- Linné is 24–37% deeper than the mean simple law. Garvin treats it as a pristine archetype. Pike's standard error on the 0.196 intercept (+0.038/−0.027) is +19%/−14%, so Linné sits beyond the deep edge of the scatter.
- Tycho is 18% deeper than the complex law and its peak 38% higher; Copernicus is 7–11% shallower. Complex craters scatter by roughly ±20% about Pike's fits.
- Meteor Crater on Earth is shallower than a lunar simple crater of its size: its floor holds ~150 m of fallout and breccia (Kring), and it has eroded. The shape of a simple crater barely depends on gravity; the size where it stops being simple does.
- The rim law overestimates Tycho's rim by 54% (1.39 vs ~0.9 km). Margot says the measured rim height is uncertain because the terrain round Tycho is irregular.

### Simple-to-complex transition and gravity

| Body | g (m/s²) | D_t = 15 km × g_Moon/g | From 17.5 km | Measured (km) |
|---|---|---|---|---|
| Moon | 1.62 | 15.0 | 17.5 | 15 (Melosh & Ivanov); 10–20, mean 17.5 (Pike 1977); ~19–20 (Silber) |
| Mercury | 3.70 | 6.6 | 7.7 | 10 (Pike 1988), ~12 (Barnouin 2012) |
| Mars | 3.73 | 6.5 | 7.6 | 6–7, revised to 7–8 (Barnouin 2012); ~7 (Melosh & Ivanov) |
| Earth | 9.82 | 2.5 | 2.9 | ~2 in sedimentary, ~4 in crystalline rock (Kring); 3–5 (Melosh & Ivanov); 3.2 (Earth Impact Effects Program) |

Earth/Moon gravity is 6.06×, and Pike finds terrestrial depths inflect at "about one-sixth" the lunar diameter. 1/g reproduces Mars and Earth within their ranges from either lunar anchor. Mercury is the outlier: 1.5–2× larger than 1/g predicts (Silber, Barnouin), probably from its faster impacts (median ~42 km/s), possibly from target strength (Pike). Within one body the "transition" is a band, not a point. On the Moon, flat floors come first (transitional craters from ~13 km, Silber; small floors from ~5 km, Pike's Eq. 14). Peaks, terraces and floors are present in half of fresh craters at ~15 km (9–22 km band, Pike). Full-size peaks follow the 0.032 D^0.90 law above ~27 km.

Larger features: central-peak craters give way to peak-ring basins at about 200 km on the Moon, and to multiring basins at about 500 km (Neumann 2015). A basin's rim is about twice its peak ring (Neumann; Melosh & Ivanov: the ring settles at "about one-half the rim diameter"). Melosh & Ivanov say this transition "also appears to scale as 1/g".

### Ejecta

- Orientale (rim radius 465 km): McGetchin's complex rim thickness 0.14 R^0.74 gives 2188 m, against 2900 m measured near the Cordillera rim (−25%, the underestimate Raggio et al. report for complex craters). Taking the measured 2900 m and the −3 power to 215 km beyond the rim (r/R = 1.46) gives 927 m, against "∼1 km" measured.
- Meteor Crater (R = 595 m): 0.04 R gives 23.8 m and 0.14 R^0.74 gives 15.8 m, against Roddy's pre-erosion rim ejecta of ~20 ± 5 m. The rim stands 30–60 m because the bedrock is also uplifted ~47 m (Raggio: only ~20% of a rim is ejecta).
- Reach: Pike/Moore's continuous-ejecta width 0.674 D from the rim puts the edge at 2.35 R from the centre, inside Minton's "2 − 3 × the crater radius".

Thickness as a fraction of the thickness at the rim:

| r/R | Exponent −3 (McGetchin) | −3.84 (Linné) | −2.75 ("typical", Garvin) |
|---|---|---|---|
| 1.0 | 1.000 | 1.000 | 1.000 |
| 1.5 | 0.296 | 0.211 | 0.328 |
| 2.0 | 0.125 | 0.070 | 0.149 |
| 2.35 (edge of continuous ejecta) | 0.077 | 0.038 | 0.095 |
| 3.0 | 0.037 | 0.015 | 0.049 |

At the edge of the continuous blanket the deposit is 4–10% of the rim thickness, so the blanket fades out rather than ending in a step. Bright rays reach much further: their length (radius) is 4.41 D^1.25 km (Moore 1974 via Pike): 4.4 km (9 crater radii) for a 1 km crater, 1390 km (28 radii) for a 100 km crater.

### Size–frequency distribution

Local cumulative slope b of the Neukum (2001) production function, N(>D) ∝ D^−b (a0 only sets the age; the slope doesn't depend on it):

| D (km) | 0.01 | 0.03 | 0.1 | 0.3 | 1 | 2 | 3 | 5 | 10 | 20 | 30 | 50 | 100 | 200 | 300 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| b | 3.16 | 3.17 | 3.19 | 3.61 | 3.56 | 2.84 | 2.29 | 1.63 | 1.15 | 1.38 | 1.79 | 2.38 | 2.80 | 2.37 | 1.83 |

So production is steep (b ≈ 3.2–3.6) below ~2 km, shallow (b ≈ 1.2–1.6) from ~5 to ~20 km, and steep again (b ≈ 2.4–2.8) at 50–100 km. That matches Minton (η ≈ 3.2 below r = 500 m; shallow for ~2 km < r < ~30 km) and Vitale & Hirabayashi (the slope changes at ~1 km). No single slope fits all sizes, so "b ≈ 2" isn't the production slope anywhere for long. b ≈ 2 is the *equilibrium* slope: where production is steeper than 2, the visible population settles at b ≈ 1.8–2.0 (Hirabayashi 2017; Gault 1970; Hartmann 1984; Xiao & Werner 2015).

Geometric saturation: Gault's n = 0.385 r^−2 in crater radius is N(>D) = 0.385 (D/2)^−2 = **1.54 D^−2** per km², the same as Vitale & Hirabayashi's C_gs = 1.54 D^−2. Observed equilibrium densities against it:

| Equilibrium line | N(>1 km) per km² | % of geometric saturation at D = 1 km |
|---|---|---|
| Minton 2019, Apollo 15 Fit 1 (β = 2) | 0.0336 | 2.2 |
| Hartmann 1984, 0.046 D^−1.83 (as quoted by Vitale & Hirabayashi) | 0.0460 | 3.0 (2.0 at 0.1 km, 4.4 at 10 km) |
| Hartmann 1984, cumulative form in craterstats, 10^−1.14 D^−1.83 | 0.0724 | 4.7 |
| Trask 1966, 10^−1.1 D^−2 | 0.0794 | 5.2 |

Fresh-looking crater fields in equilibrium hold **2–5% of geometric saturation** (literature range 1–10%, Xiao & Werner via Vitale). The two Hartmann numbers differ by the incremental-to-cumulative conversion (see Open questions).

### Relief

| Body | Lowest | Highest | Range (km) | Radius (km) | Range / radius |
|---|---|---|---|---|---|
| Moon (LOLA) | −9.129 km | +10.792 km | 19.921 (Smith: "about 19.92") | 1737.1513 (mean) | 1.147% |
| Mercury (MESSENGER DEM, 2 km pixels) | −5.380 km | +4.481 km | 9.861 | 2439.4 (datum) | 0.404% |

For scale, Tycho's 4.7 km depth is 0.27% of the Moon's radius, and the largest lunar basins carry the extremes: the Moon's low is in Antoniadi inside South Pole–Aitken, Mercury's in Rachmaninoff. NASA's fact sheets still list older ranges (Moon 13 km, Mercury 7 km). Becker notes that higher-resolution products will widen Mercury's range.

### Degradation

Mercury (Barnouin 2012), fresh vs all simple craters (the two fits share the 0.18 intercept, so they agree at 1 km by construction):

| D (km) | Fresh depth | Average depth | Average / fresh | d/D fresh | d/D average |
|---|---|---|---|---|---|
| 2 | 0.36 | 0.29 | 0.82 | 0.178 | 0.146 |
| 5 | 0.87 | 0.56 | 0.64 | 0.174 | 0.111 |
| 10 | 1.72 | 0.90 | 0.52 | 0.172 | 0.090 |

A typical (partly degraded) simple crater is about half to four-fifths as deep as a fresh one. Rims flatten and bowls fill in by diffusive creep from small impacts (Minton 2019; Fassett & Thomson 2014). Small fresh craters are shallower too, from the regolith: d/D 0.2 above 400 m, falling to ~0.12 at 30–100 m (Stopar 2017).

## Game mapping

Implemented in `src/gen/craters.ts` (pure; `tests/craters.test.ts`), added to the terrain value of every body whose `PlanetStyle.craters` is above 0 (barren planets and moons: `planetStyle` sets 1, and Sol's Mercury; the Moon's craters are in its real height map already).

**Where they are.** Never stored: octaves of size, each on its own grid of cells over the six cube faces (equal-angle coordinates), each cell's craters from a hash of its address (seed, octave, face, cell). Octave k's craters have radii r_k to 2r_k, r_k = `craterParams.largest` (0.09 of the body's radius, chord) / 2^k. A point looks only at the cells its craters could reach from (`craterHeight`): moving dα on a face covers at least dα·cos β on the sphere, so a window of reach / cos β (cos β at its smallest between the face and the point) holds them all, and a point checks every face whose hemisphere holds it, so craters reach over the faces' edges. The tests check the lookup against a sum over every crater at 400 points crowded round the cube's edges and corners (equal to 1e-12). Each visited cell's craters are kept (Float64Array per cell), so a sample costs ~1 µs with five octaves at full detail, against ~0.3 µs for `detailedTerrain`; coarse LOD chunks skip the small octaves and cost less.

**How many.** N(>D) ∝ D^−2, the equilibrium slope, so every octave holds the same number per cell. The density is `SATURATION_SHARE` = 0.1 of Gault's geometric saturation (1.54 D^−2), times `style.craters`. That's twice Trask's 5.2%, the top of the measured 2–5%: deliberate, since the game draws only the 3–6 largest octaves (D/R from 0.36 down to ~0.01) of a population that runs down to metres, and at 0.05 a small world looked bare from orbit (screenshots compared 0.05, 0.1 and 0.3). The tests pin each octave's count to within 15% of the expected one, and even spread over the sphere (the expected count of a cell is the density times its area on the sphere, as the equal-angle cells differ in area by up to ~1.4×).

**Shape.** A crater D km across (from the game's radius back to a real one, `earthRadii`) on a body of surface gravity g (its climate's, else rock's mass from `bodyMass`): Pike's lunar fits at the lunar-equivalent diameter D·g/g_Moon (the transition scales as 1/g, 15 km on the Moon), the lower of the simple and complex fits where they cross (depth at 10.6 km, rim at 21.3 km, so the shape changes smoothly; the tests check the depth only grows with D through the transition); a flat floor from 5 km (Pike's two floor laws, at most 75% of D); a central peak growing from the transition to full size (0.032 D^0.9) at 27 km, never higher than the rim; no central peak in basins over 200 km (peak rings, not drawn). The tests check Moltke (1.30 km), Tycho (depth within 20%, floor 48 km, peak) and Copernicus. Profile (`profile`, x = distance / crater radius): the floor at rim − depth, flat to the floor's edge, rising as a parabola to the rim crest at x = 1; the peak a quadratic bump of radius 0.2 crater radii (stylised, not measured); outside, ejecta of the rim's height times x^−3 (McGetchin), tapered to nothing at x = 2.35 (Pike/Moore's continuous ejecta, 0.674 D past the rim, where the x^−3 deposit is 8% of the rim's).

**Exaggeration.** The game's relief is the same share of the radius on every body (`style.relief`, 0.04–0.07 for barren), while real relief scales as 1/g: the Moon's 19.92 km scaled by g_Moon / g gives Mercury 8.7 km against 9.86 km measured (12% under). So a body's craters are exaggerated by the same factor as its relief, `style.relief` / (19.92 km · g_Moon/g / R), capped so no crater is deeper than d/D = 0.2 (a fresh simple bowl). A Moon-sized, Moon-gravity body with the Moon's real relief draws its craters true to Pike's shapes (tested). An Earth-sized barren world's craters are all basins (its smallest drawn, ~95 km across at 1.32 g, is a lunar-equivalent ~760 km): shallow pans with wide flat floors and no peaks, deepened to the cap.

**Wear.** Each crater's depth, rim and peak are scaled by its freshness 0.25 + 0.75·u², 0.5 on average and fresh ones rare: Mercury's simple craters average 0.52–0.82 of fresh depth (Barnouin 2012). Old craters are only shallower, not softer.

**In the views.** `craterNoise` adds the craters (shares of the radius) to the terrain value through the relief (the land spans 2 / relief of value per unit of radius on an airless body), clamped to [−1, 1], so the deepest lowland floors come out flat. `surfaceNoise(body, fine)` is what every view of the ground reads: the system view's globes (`craterParams.coarseOctaves` = 2, on 32-segment cube spheres for cratered bodies, `CRATER_SEGMENTS`), its map discs, low orbit's LOD globe, map, ground and geysers (`fineOctaves`: down to craters 2.5 planet units in radius, about four of the finest LOD cells, at most six octaves). On a cratered body low orbit's fine hills (`terrainDetail`) are damped to `craterParams.hills` = 35%, so up close the ground is craters on craters, as an airless world's is.

**Sampling.** A crater only a sample or two across is a pit that flickers between facets, so samplers pass how far apart they sample (`SurfaceSampler`'s `spacing`: the LOD chunk's grid, π/2 over its cells per face edge; the system view's cube sphere; the map's pixel), and an octave fades in as its smallest radius goes from one to two samples. Chunks of different levels then sample the same point differently, so `LodSurface` no longer assumes they agree: a child's parent shape is the parent's own samples (so a split never pops), an edge against a coarser chunk snaps onto that chunk's vertices as it writes them, and each corner follows the coarsest chunks touching it (diagonal ones too), at the slowest of their blends. `tests/quadtree.test.ts` checks the seams stay closed while settling and through a dive, a flight and a climb, and that new chunks show exactly where their parent was, with a sampler that adds detail where it's sampled finer.

## Open questions

- **Not modelled:** peak rings and multiring basins (over ~200 km lunar-equivalent the craters are flat pans), bright rays and the brighter, immature ejecta of fresh craters (an albedo, which the terrain painter's height ramp can't show), secondary craters, and craters on icy moons (Callisto and Ganymede are heavily cratered; Europa and Enceladus resurfaced).
- **Density stylised:** `SATURATION_SHARE` 0.1 is twice the top of the measured equilibrium (see Game mapping).

- **Hartmann (1984) coefficient.** Vitale & Hirabayashi quote 0.046 D^−1.83 as a cumulative law; craterstats treats Hartmann's −1.33 intercept as incremental (√2 bins) and converts it to 10^−1.14 = 0.072 cumulative. Hartmann 1984 itself wasn't read, so the equilibrium level is 3.0% or 4.7% of geometric saturation, and either way inside the 2–5% band.
- **Pike 1977 transition diameter.** Several values exist for one transition: 10.6 km (depth fits cross), 15 km (half of craters have peaks, terraces and floors; Melosh & Ivanov), 17.5 km (Pike's mean of eleven changes), ~19–20 km (Silber), 21.3 km (rim fits cross). Holsapple's notes say the rim transition is "22.8 km", Pike's paper says 21.3 km (the script gets 21.3).
- **McGetchin et al. 1973 not read.** Its law (T = 0.04 R simple, 0.14 R^0.74 complex, exponent −3 ± 0.5) comes from Raggio 2016 and Minton 2019, which agree with each other. The paper (EPSL 20, 226) was not reachable (ADS 403).
- **Collins et al. 2005** (Earth Impact Effects Program) wasn't readable (404). Its 3.2 km Earth transition and the "one over the distance cubed" ejecta come from the 2004 LPSC abstract.
- **Reference-crater measurements.** Moltke, Copernicus and Linné (0.6 km) depths are Pike 1976 values via the-moon.us; Copernicus's 3.65 km depth and 1.2 km peak are amateur measurements (Kaguya profiles, shadow lengths). The Moltke and Linné rim heights weren't found. Meteor Crater's 180 m depth is given as "~180 m" without saying whether it's from the rim or the plain.
- **Search summary only, not confirmed:** Mercury's transition "11.7 ± 1.2 km" (Susorney et al. 2016, Icarus 271, 180); the Moon's average diffusivity "5.5 m² Myr⁻¹" (Fassett & Thomson 2014, JGR); Moon's lowest point "9.178 km" below the geoid (Kaguya, via Wikipedia; LOLA gives −9.129 km).
- **Mercury's late transition** (1.5–2× the 1/g prediction) has no settled cause: impact speed (Silber) or target strength (Pike).
- **Linné's ejecta** decays faster (−3.84) than McGetchin's −3; Raggio also finds −3 too shallow on LOLA profiles. The exponent probably varies from crater to crater and with the target.
