# Asteroid belts, Kuiper belts and Trojans

## Question

Roadmap step 26 adds asteroid belts (`gen/belts.ts`, drawn by `world/AsteroidBelt.ts`): a main belt between the rocky planets and the first giant, an icy outer belt beyond the last planet, Trojan swarms at a giant's L4 and L5, and a few named, visitable asteroids per belt built on step 25's shapes. What real numbers should it be generated from? Specifically:

1. Where a main belt sits relative to its giant planet (resonance edges, Kirkwood gaps), the inner planet and the snow line, and how composition changes with distance (S inner, C outer).
2. How thick a belt is (inclination distribution, so a vertical half-thickness as a fraction of radius).
3. Kuiper belt extent relative to Neptune (resonances, edge), and cold vs hot inclinations.
4. Trojans: position, libration amplitude and period, inclinations, L4/L5 asymmetry, which planets have them.
5. How empty belts are: number of bodies, total mass, mean spacing.
6. Shapes (axis ratios) and contact-binary fractions.
7. Rotation periods, the spin barrier, tumbling.
8. Albedos and colours per class (main belt S/C/D, Trojans, KBOs).
9. How common debris belts are around other stars.
10. Largest members of each population; how many bodies are larger than 100 km.
11. Size–frequency slopes.
12. Trojan libration period relative to the planet's orbital period.

Precision needed: gameplay level (about 10 % and the right trends). Everything below was read or computed in this session (2026-10-01). Values I could not confirm are labelled **unverified (from memory)**.

## Sources

All accessed 2026-10-01.

| # | Source | What was taken (as printed) |
|---|---|---|
| S1 | NASA NSSDC planetary fact sheets, https://nssdc.gsfc.nasa.gov/planetary/factsheet/ (jupiterfact, neptunefact, marsfact, earthfact, moonfact, sunfact) | Jupiter "Semimajor axis (AU) 5.20336301", "Mass (10^24 kg) 1,898.13", "Sidereal orbit period (days) 4,332.589"; Neptune "Semimajor axis (AU) 30.06896348"; Mars "Semimajor axis (AU) 1.52366231"; Earth "Mass (10^24 kg) 5.9722"; Moon "Mass (10^24 kg) 0.07346"; Sun "Mass (10^24 kg) 1,988,400." |
| S2 | Wikipedia, Kirkwood gap (raw wikitext), https://en.wikipedia.org/wiki/Kirkwood_gap | Gap list: "2.065 AU (4:1)", "2.502 AU (3:1)", "2.825 AU (5:2)", "2.958 AU (7:3)", "3.279 AU (2:1) Hecuba gap", "3.972 AU (3:2) Hildas". Zones: inner a < 2.5, middle 2.5–2.82, outer > 2.82 AU. (Orientation only; positions are recomputed below.) |
| S3 | Smallwood et al. 2018, MNRAS, arXiv:1709.06032 | "The outer edge of the ν6 resonance location sets the inner boundary for our asteroid belt, which is approximately located at 2 AU." "The region where Jupiter's resonances overlap is what determines the outer edge of the asteroid belt at about 3.3 AU." |
| S4 | Raymond & Nesvorný 2020, "Origin and dynamical evolution of the asteroid belt", arXiv:2012.07932 | Belt mass "∼4.5 × 10^−4 M⊕"; Ceres 31 %, Vesta 9 %, Pallas 7 %, Hygiea 3 % of the mass; "eccentricities 0 < e < 0.3 and inclinations 0 < i < 20°"; "inner main belt is dominated by S-types and the outer main belt by C-types (Gradie and Tedesco, 1982; ...)"; "D-types are prevalent in the outer main belt and Jupiter's 1:1 resonant Trojan swarms"; "Typical albedos of C-types are ∼5% and of S-types ∼20%". |
| S5 | DeMeo & Carry 2013, Icarus 226, arXiv:1307.2424 | Regions used: Hungaria 1.78–2.05, main belt 2.05–3.27, Cybele 3.27–3.7, Hilda 3.7–4.2, Trojans 5.05–5.40 AU. "We find a total mass of the main belt of 2.7 × 10^21 kg which is in excellent agreement with the estimate by Kuchynka and Folkner (2013) of 3.0 × 10^21 kg." "S-types and C-types alternate dominating by number throughout the belt" (bias-corrected). "almost no S-types exist among Cybeles, and they are entirely absent beyond 3.5 AU." Table 2 mean albedos: C 0.06 ± 0.01, D 0.06 ± 0.01, S 0.23 ± 0.02, V 0.35, B 0.14, K 0.14, L 0.13, E 0.45, M 0.13, P 0.05. Table 3 visible slope ranges (%/100 nm): C −5 to 6, S 6 to 25, D 6 to 25 (D separated from S by z′−i′), A 21.5 to 28. |
| S6 | DeMeo, Carry et al. 2015, "The compositional structure of the asteroid belt", arXiv:1506.04805 | "the υ6 starts near 2 AU and the 3:1 and 5:2 are located at 2.5 and 2.82 AU"; Hungaria "(1.8-2.0 AU, i~20 degrees)"; inner belt (2.0–2.5): "C-complex are rare in the Inner Belt at large sizes (D>100 km) where they comprise only 6% of the total mass, but they make up a quarter of the mass at medium sizes (20 km<D<100 km), and are almost equal to the S-complex by mass at the smallest sizes (5 km<D<20 km)"; outer belt (2.82–3.3): "the C-complex dominates by mass". |
| S7 | Crossref record of Gradie & Tedesco 1982, Science 216:1405, https://api.crossref.org/works/10.1126/science.216.4553.1405 | Abstract: "Seven distinct peaks in the relative proportion of the compositional types E, R, S, M, F, C, P, and D are found from 1.8 to 5.2 astronomical units." (No single crossover distance in the abstract; the full text was not reachable.) |
| S8 | Lecar et al. 2006, arXiv:astro-ph/0602217 (abstract) | "Observations of the Solar System's asteroid belt suggest that the snow line occurred near 2.7 AU." Their baseline disc model puts it at "1.6-1.8 AU". |
| S9 | Martin & Livio 2012, MNRAS 425 L6 (STScI copy) | "the snow line was located at around Rsnow = 2.7 AU" (Hayashi 1981); T_snow 145–170 K. |
| S10 | JPL SBDB Query API, https://ssd-api.jpl.nasa.gov/sbdb_query.api, classes IMB, MBA (numbered), OMB, TJN, TNO; fields a, e, i, diameter, albedo, rot_per (+ om, w, ma, epoch for TJN). Class definitions from https://ssd-api.jpl.nasa.gov/doc/sbdb_filter.html | IMB "a < 2.0 au; q > 1.666 au", MBA "2.0 au < a < 3.2 au; q > 1.666 au", OMB "3.2 au < a < 4.6 au", TJN "4.6 au < a < 5.5 au; e < 0.3", TNO "a > 30.1 au". 870,924 numbered IMB+MBA+OMB; 16,397 TJN; 7,293 TNO. rot_per comes from the LCDB (Warner et al., rev. 2023-Oct); diameters/albedos mostly NEOWISE/IRAS. |
| S11 | JPL SBDB API per object (https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=…&phys-par=1) | Extents/diameters: see shapes and size tables (Eros 34.4×11.2×11.2 km, Ida 59.8×25.4×18.6, Gaspra 18.2×10.5×8.9, Itokawa 0.535×0.294×0.209, Ryugu 1.004×0.876, Bennu 0.5047×0.4918×0.4567, Vesta 569.24×554.48×452.66, Pallas 568×532×448, Lutetia 121×101×75, Kleopatra 276×94×78, Didymos 0.797×0.783×0.761; Hygiea D 407.12, Interamnia 306.313, Europa 303.918, Davida 270.327, Hektor 225, Patroclus 140.362, Agamemnon 131.038, Diomedes 117.786). |
| S12 | NASA NSSDC asteroid fact sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/asteroidfact.html | Mathilde "66 x 48 x 46" km, Steins "6.8 x 5.7 x 4.4", Toutatis "4.6 x 2.4 x 1.9"; Ceres "comprises over one-third the 2.3 x 10^21 kg estimated total mass of all the asteroids". |
| S13 | JPL approximate planetary positions, https://ssd.jpl.nasa.gov/planets/approx_pos.html (Table 1, 1800–2050) | Jupiter mean longitude L = 34.39644051° + 3034.74612775°/century (used to split Trojans into L4/L5). |
| S14 | NASA Asteroid Facts, https://science.nasa.gov/solar-system/asteroids/facts/ | "The belt is estimated to contain between 1.1 and 1.9 million asteroids larger than 1 kilometer (0.6 miles) in diameter". |
| S15 | ESA, "New study reveals twice as many asteroids as previously believed" (ISO Deep Asteroid Search, Tedesco) | "between 1.1 million and 1.9 million 'space rocks' larger than one kilometre"; "1.2 million asteroids larger than 1 kilometre in the main belt, give or take 500 000". |
| S16 | Ivezić et al. 2001, AJ, arXiv:astro-ph/0105511 | Differential size distribution "D^−2.3 for 0.4 km < D < 5 km, and D^−4 for 5 km < D < 40 km"; "about 530,000 objects with D>1 km"; count slope k = 0.2(α − 1); Dohnanyi (1969) "predicts a universal slope of 0.5"; SDSS sees "the inner rocky belt ... centered at R~2.8 AU, and the outer carbonaceous belt ... centered at R~3.2 AU". |
| S17 | Astronomy.com, "How do spacecraft avoid collisions in the asteroid belt?" | Volume "2 x 10^26 cubic km"; "the average distance between asteroids is about 600,000 miles (965,600 km)". |
| S18 | BBC Sky at Night, "Could a spaceship fly through the asteroid belt?" | "the average distance between individual asteroids is just under 1 million kilometres". |
| S19 | Brown 2001 (AJ 121:2804) as quoted by Volk & Malhotra 2011, arXiv:1104.4967 | Classical KBO inclinations: f(i) = sin i [A exp(−i²/2σ1²) + (1−A) exp(−i²/2σ2²)]; Brown: "A = 0.93 ± 0.03, σ1 = 2.2 (+0.2 −0.6), and σ2 = 17 ± 3"; Volk & Malhotra (invariable plane): "A = 0.95 ± 0.02, σ1 = 1.4 ± 0.3°, and σ2 = 15 ± 3°"; "83% of the CKBOs are in the wide Gaussian and 17% in the narrow Gaussian, similar to the 81% and 19% found by Brown (2001)"; equal-numbers inclination "i = 5° in our model and i = 7° in Brown (2001)"; "∼5° ... justified as a divide between the hot and cold population". |
| S20 | Trujillo, Jewitt & Luu 2001, AJ, arXiv:astro-ph/0104104 (abstract) | Classical KBO differential size index "q = 4.0 (+0.6)(−0.5)"; "N = 3.8 (+2.0)(−1.5) x 10^4 ... CKBOs larger than 100 km"; "compelling evidence for an outer edge to the CKBOs at heliocentric distance R = 50 AU". |
| S21 | Trujillo & Brown 2001, ApJ 554 L95 (via search-result summary of the IOP abstract; not opened directly) | Outer edge "R = 47 ± 1 AU". Treat as secondary. |
| S22 | Emery et al. 2015, "The complex history of Trojan asteroids" (Asteroids IV), arXiv:1506.01658 | Trojans at ±60°; stable Trojans also for "Mars, Neptune, and two satellites of Saturn"; "Saturn and Uranus do not have stable Trojan populations"; Jupiter Trojans "nearly as populous as the Main Belt"; NEOWISE "mean albedo of 0.07±0.03"; "N(leading)/N(trailing) = 1.4±0.2" (D > 10 km, Grav 2011), "1.6±0.1" (Szabó 2007); cumulative size index "~2 ... for diameters between 20 and 80 km", "4.5 ± 0.9 for objects with diameters larger than 84 km"; Hektor "either a contact binary or one extremely elongated object", P = 6.924 h; "6–10% of Trojans might be contact binaries" (Mann 2007). |
| S23 | Vokrouhlický et al. 2024, AJ 167:138, arXiv:2401.15537 | L4/L5 "ratio 1.45 ± 0.05 for H < 15"; Nakamura & Yoshida "f45 = 1.85 ± 0.42 for D > 2 km"; L4 inclinations bimodal "maxima at ≃ 9° and ≃ 19°" (Jewitt 2000), L5 "maximum near ≃ 27°". |
| S24 | Hellmich et al. 2019, A&A, arXiv:1909.08584 | "The libration amplitudes of Jupiter Trojans typically lies in the range between a few degrees to about 35°"; "the libration period (about 145 years or longer)". |
| S25 | MPC lists of Trojans, https://minorplanetcenter.net/iau/lists/{Earth,Mars,Uranus,Neptune,Jupiter}Trojans.html (Jupiter list "last updated on 2026 May 30") | Counts parsed: Earth 1 (2020 XL5, L4), Mars 18 (L4 2, L5 16), Uranus 0 listed, Neptune 35 (L4 28, L5 7), Jupiter 15,765 (L4 9,823, L5 5,942). |
| S26 | de la Fuente Marcos & de la Fuente Marcos 2017, arXiv:1701.05541 (abstract); 2022 Nature Communications article on 2020 XL5, https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8807697/ | Uranus: "just one Uranian Trojan is known, 2011 QF99", second is 2014 YX49, both "transient L4" with libration periods 5.9 and 5.1 kyr. Earth: "asteroid 2010 TK7 has been the only known Earth Trojan thus far... 2020 XL5 is the second transient Earth Trojan". |
| S27 | Benner et al. 2015, "Radar observations of near-Earth and main-belt asteroids" (Asteroids IV), https://echo.jpl.nasa.gov/asteroids/benner.etal.radar.chapter.20150728.pdf | NEAs > ~200 m: binaries "~17%" (H < 21) / "~16%"; "contact binaries account for a similar fraction at ~14%"; together "~30% of the NEA population > 200 m". |
| S28 | Sonnett et al. 2015, arXiv:1412.1853 (abstract) | "binary fraction ... 14-23% for Trojans larger than ~12 km and 30-51% for Hildas larger than ~4 km" (close + contact binaries from NEOWISE light-curve amplitudes, not debiased). |
| S29 | Thirouin & Sheppard 2019, arXiv:1904.02207 (abstract) | "only ~10-25% of the Cold Classicals could be contact binaries" (lower limit), vs "~40-50% possible contact binaries in the 3:2 resonant population"; CC mean period "9.48±1.53h" vs "8.45±0.58h" for other TNOs. Thirouin & Sheppard 2018, arXiv:1804.09695: "up to ∼40% of the Plutinos could be contact binaries ... up to ∼50% of the small Plutinos". |
| S30 | Levison et al. 2024 (Lucy at Dinkinesh), arXiv:2406.19337 (abstract) | Dinkinesh ~720 m, a = 2.19 AU, S-type; Selam "the first confirmed contact binary satellite", lobes "∼210 m and ∼230 m", orbit 3.1 km, period ~52.7 h. |
| S31 | Spencer et al. 2020, Science, arXiv:2004.00727 | Arrokoth "36 × 20 × 10 km"; lobes "20.6 × 19.9 × 9.4 km and 15.4 × 13.8 × 9.8 km". |
| S32 | Marchis et al. 2014, arXiv:1402.7336 | Hektor: bilobed primary, "equivalent diameter of 250 ± 26 km", P = 6.920509 h, ~12 km moon. |
| S33 | Margot et al. 2015, "Asteroid systems: binaries, triples and pairs", arXiv:1504.00034 | "the spin barrier against asteroid rotations faster than about 2.2 h" for the 0.2–13 km size range. |
| S34 | Pravec et al. 2008, Icarus 197:497, https://astro.troja.mff.cuni.cz/davok/papers/mb_spin_statistics_08.pdf | MB asteroids 3–15 km: spin rates "uniform in the range from f = 1 to 9.5 d−1, and there is an excess of slow rotators with f < 1 d−1"; "at D ∼ 6.5 km, most asteroids with P > 4 d, and some in the range P = 2–4 d are tumbling ... about 1/3 of asteroids in the slow rotators excess are in NPA rotation states"; "Large asteroids (with diameter D > 40 km) show a Maxwellian distribution". |
| S35 | Thirouin et al. 2018 (MANOS), arXiv:1809.03549 (abstract) | NEO light-curve amplitudes reproduced by "a uniform distribution of axis ratio", "the quantity of spherical NEOs (e.g., Bennu) is almost equivalent to the quantity of highly elongated objects (e.g., Itokawa)"; 10 tumblers among 228 NEOs observed. |
| S36 | Bus-DeMeo class mean spectra, http://smass.mit.edu/_documents/busdemeo-meanspectra.xlsx (DeMeo et al. 2009) | Reflectance 0.45–2.45 µm, normalised at 0.55 µm, per class (used for colour hints). |
| S37 | Johnston's Archive, "List of known trans-Neptunian objects" (last updated 19 January 2026), https://www.johnstonsarchive.net/astro/tnoslist.html | Median measured albedos by class: "cubewano-cold, 0.152", "cubewano-hot, 0.079", "plutino, 0.074", Centaur 0.058; "B-R ... values greater than 1.03 indicate spectra redder than that of the Sun"; diameters: Varuna 668 km (albedo 0.127), Ixion 697 (0.106), Huya 411 (0.079), Quaoar 1111, Orcus 910, Salacia 866, Arrokoth 25. Secondary compilation (cites primary sources on its diameters page). |
| S38 | Eiroa et al. 2013 (DUNES), arXiv:1305.0155; Montesinos et al. 2016, arXiv:1605.05837 (abstracts) | DUNES FGK incidence "∼20.2% ± 2%"; discs "detected at a fractional luminosity level down to several times that of the Edgeworth-Kuiper belt". Complete d < 15 pc sample: F 0.26 (6/23), G 0.21 (7/33), K 0.20 (10/49), all 0.22 (23/105). |
| S39 | Lestrade et al. 2025, DEBRIS M dwarfs, arXiv:2502.04441 | M dwarfs "2.1 (+2.7 −0.7)%" (2/94); DEBRIS "24 ± 5 % for A-stars (Thureau et al. 2014) and 17 (+2.6 −2.3) % for FGK-stars (Sibthorpe et al. 2018)"; per type (Table 1): F 23.9 (+5.3 −4.7) %, G 14.3 (+4.7 −3.8) %, K 13.0 (+4.5 −3.6) %; the M survey is "about ten times shallower" in fractional luminosity, so the low M rate is partly a sensitivity effect. |
| S40 | Vitense et al. 2012, arXiv:1202.2257 (abstract) | Kuiper-belt dust "fractional luminosity is f_d~10^-7"; "exact EKB analogs cannot be detected with present-day instruments such as Herschel/PACS". |
| S41 | Kennedy & Wyatt 2013, arXiv:1305.6607 (abstract) | Bright warm (12 µm, exo-zodi) dust: "~1% occurrence rate" for young (< 120 Myr) stars; dustiest old systems "1 in 10,000". |
| S42 | Ertel et al. 2020, LBTI/HOSTS, arXiv:2003.03499 (abstract) | Habitable-zone dust: 10 of 38 stars with significant excess; Sun-like median "3 zodis", "~20% are significantly more dusty"; "The Solar system's HZ dust content is consistent with being typical". |

## Measurements

Scripts are inline at the end of this section (data files are the SBDB/MPC/Johnston/SMASS downloads listed in Sources; rerun by fetching them into the same names). Raw outputs follow each script.

### 1. Main belt placement (Jupiter a_J = 5.20336301 AU, S1)

Resonance with Jupiter, interior, asteroid makes p orbits per q of Jupiter's: a_res = a_J · (q/p)^(2/3) (Kepler's third law).

| Resonance | Computed a (AU) | a / a_J | Listed gap (S2) | Measured SBDB histogram minimum (0.005 AU bins, 3-bin smoothing) | Role |
|---|---|---|---|---|---|
| 4:1 | 2.065 | 0.397 | 2.065 | 2.058 | inner edge (with ν6, which "starts near 2 AU", S3, S6) |
| 3:1 | 2.502 | 0.481 | 2.502 | 2.502 | inner / middle boundary |
| 5:2 | 2.825 | 0.543 | 2.825 | 2.827 | middle / outer boundary |
| 7:3 | 2.958 | 0.568 | 2.958 | 2.952 | gap inside outer belt |
| 2:1 | 3.278 | 0.630 | 3.279 | 3.288 | outer edge ("about 3.3 AU", S3) |
| 3:2 | 3.971 | 0.763 | 3.972 | (Hildas collect here, no gap) | Hilda group |

Computed positions match the listed gaps to ≤ 0.001 AU and the measured histogram minima to ≤ 0.01 AU. Of the 870,924 numbered IMB+MBA+OMB objects, 97.0 % have 2.065 < a < 3.279 AU; 1 %/5 %/50 %/95 %/99 % percentiles of a: 1.92 / 2.22 / 2.68 / 3.18 / 3.26 AU.

Other references as fractions of a_J: Mars 1.52366231 AU = 0.293 a_J; snow line 2.7 AU (S8, S9) = 0.519 a_J, i.e. inside the middle belt, between the 3:1 and 5:2; Hungarias 1.8–2.0 AU = 0.35–0.38 a_J (i ~ 20°, S6); Cybeles 3.27–3.7 AU = 0.63–0.71 a_J; Trojans at 1.00 a_J.

Composition gradient. No source read gives a single "crossover" number; the sources say:
- S-types dominate the inner belt (2.0–2.5 AU) at large sizes (C-complex only 6 % of the mass for D > 100 km) but are nearly matched by C at 5–20 km (S6).
- The outer belt (2.82–3.3 AU) is C-dominated by mass (S6); almost no S-types among Cybeles and none beyond 3.5 AU (S5).
- SDSS colours (S16): the "rocky" (S) belt is centred at ~2.8 AU, the carbonaceous (C) belt at ~3.2 AU.

Own measurement with albedo as the S/C proxy (bright p_V > 0.15 ≈ S-like, dark p_V < 0.10 ≈ C/P/D-like; S5 Table 2 albedos S 0.23, C 0.06), numbered objects with NEOWISE/IRAS albedos:

| Zone (AU) | N (D ≥ 5 km) | median p_V | bright fraction | dark fraction |
|---|---|---|---|---|
| Hungaria 1.78–2.0 | 32 | 0.23 | 0.75 | 0.22 |
| inner 2.065–2.502 | 3,385 | 0.10 | 0.42 | 0.51 |
| middle 2.502–2.825 | 10,264 | 0.07 | 0.29 | 0.63 |
| outer 2.825–3.279 | 28,923 | 0.06 | 0.12 | 0.79 |
| Cybele 3.279–3.7 | 834 | 0.06 | 0.02 | 0.93 |
| Hilda 3.7–4.2 | 919 | 0.06 | 0.01 | 0.95 |

By 0.1 AU bin (D ≥ 50 km), bright ≥ dark up to ~2.5 AU (0.56/0.44 at 2.2–2.3, 0.48/0.44 at 2.4–2.5), dark wins from 2.5 AU outward (0.28/0.69 at 2.5–2.6) and is ~90 % beyond 3.1 AU. With D ≥ 5 km the dark fraction already passes the bright one at 2.3 AU (small dark family members). **Working value for the game: S-like (bright, reddish) dominates inside ~0.48 a_J (the 3:1), C-like (dark, grey) dominates outside it, almost pure C/P/D beyond ~0.6 a_J.** This sits ~0.2 AU inside the 2.7 AU snow line; the transition is broad, not a sharp line.

### 2. Main belt thickness

Osculating inclinations (ecliptic) of numbered objects with 2.065 < a < 3.279 AU (SBDB):

| Sample | N | mean i | median i | 90 % | 95 % | 99 % | i < 5° | i < 10° | i < 20° | i < 30° |
|---|---|---|---|---|---|---|---|---|---|---|
| all numbered | 844,960 | 8.40° | 7.15° | 15.3° | 18.3° | 27.1° | 32 % | 66 % | 95.8 % | 99.7 % |
| D ≥ 10 km | 7,713 | 10.8° | 10.4° | 20.5° | 23.2° | 27.6° | 23 % | 48 % | 89 % | 99.6 % |

Cross-check: S4 "inclinations 0 < i < 20°". Snapshot thickness: an orbit of inclination i puts the body at |z|/r = sin i · |sin u| (u uniform). Monte-Carlo over the sample:

| Sample | median |z|/r | 68 % | 90 % | 95 % |
|---|---|---|---|---|
| all numbered | 0.070 | 0.110 | 0.203 | 0.247 |
| D ≥ 10 km | 0.097 | 0.152 | 0.254 | 0.308 |

**Half-thickness ≈ 0.1 r holds about two-thirds of the bodies, ≈ 0.2–0.25 r holds 90–95 %.** The large-body sample is a bit thicker (smaller bodies are discovered preferentially near the ecliptic and the big families are low-i).

### 3. Kuiper belt (Neptune a_N = 30.06896348 AU, S1)

Exterior resonance (object period / Neptune period = p/q): a = a_N (p/q)^(2/3).

| Resonance (N:object) | a (AU) | a / a_N | SBDB TNOs within ±0.3 AU |
|---|---|---|---|
| 2:3 (Plutinos) | 39.40 | 1.310 | 575 |
| 3:5 | 42.27 | 1.406 | 263 |
| 4:7 | 43.67 | 1.452 | 623 |
| 1:2 (Twotinos) | 47.73 | 1.587 | 176 |
| 2:5 | 55.39 | 1.842 | 91 |

SBDB TNO semi-major-axis histogram (7,293 objects): 30–35: 174, 35–38: 213, 38–40: 861 (Plutinos), 40–42: 499, 42–44: 1,498, 44–46: 1,180, 46–48: 679, 48–50: 222, 50–55: 382, then a thin tail (scattered disc). The classical belt is ~42–47.7 AU = 1.40–1.59 a_N; the outer edge ("Kuiper cliff") is measured at 50 AU (S20) or 47 ± 1 AU (S21) = 1.56–1.66 a_N, i.e. at the 2:1. Inner limit of the populated belt: the 3:2 at 1.31 a_N (Plutinos); 40–42 AU is depleted (S19 mentions the ν8/ν17/ν18 secular resonances "located at 40–42 AU").

Inclinations, classical belt: Brown's two-Gaussian (S19) with σ1 = 2.2° (cold), σ2 = 17° (hot), ~19 % cold / 81 % hot by number (debiased); the cold/hot divide is ~5°. Own (biased, discovered objects) proxy 42.4 < a < 47.7 AU, e < 0.2: N = 2,651, median i 4.3°, 54 % below 5°, 30 % above 10°, 95th percentile 28.4°. (Discovered samples over-represent cold objects because surveys look near the ecliptic.)

### 4. Trojans

- Position: L4 leads, L5 trails the planet by 60° (S22).
- Libration amplitude: "a few degrees to about 35°" (S24). Own snapshot (SBDB TJN, 16,397 objects, mean longitude λ = Ω + ω + M against Jupiter's L from S13): |Δλ| median 61.9°, 5–95 % range 44.1–83.6°; |Δλ − 60°| median 8.3°, 90 % 20.0°, 99 % 35.5°. Note the tadpole is asymmetric: it reaches further away from the planet than towards it (5 %: 44°, 95 %: 84°).
- Libration period: "about 145 years or longer" (S24). Linear theory T_lib = T_J / sqrt(27μ/4) with μ = M_J/(M_J + M_Sun) = 9.537e-4 (S1) gives 147.8 yr = **12.5 × Jupiter's orbital period** (11.862 yr).
- Inclinations (SBDB TJN): mean 14.2°, median 12.0°, 90 % 27.7°, max 55.4°. L4 bimodal (~9° and ~19°), L5 broader with a maximum near 27° (S23).
- L4/L5 asymmetry: 1.4 ± 0.2 (D > 10 km, S22), 1.45 ± 0.05 (H < 15, S23), 1.6 ± 0.1 (S22, Szabó), 1.85 ± 0.42 (D > 2 km, S23). Own counts: SBDB all 10,420/5,977 = 1.74; SBDB D ≥ 10 km 1,017/756 = 1.35; MPC list 9,823/5,942 = 1.65. **Use ~1.5 (range 1.35–1.85), L4 richer.**
- Other planets (MPC lists, S25): Neptune 35 (28 L4, 7 L5; inclinations up to 38.9° in the list), Mars 18 (16 L5 incl. Eureka, 2 L4), Earth 1 listed (2020 XL5; 2010 TK7 also known, S26; both transient), Uranus 0 listed but two transient L4 Trojans published (2011 QF99, 2014 YX49, S26); Saturn none (S26) and Saturn/Uranus have no stable regions (S22). Jupiter 15,765.

### 5. "Real belts are almost empty"

| Quantity | Value | Source |
|---|---|---|
| Asteroids > 1 km | 1.1–1.9 million (ISO); SDSS estimate 530,000 | S14, S15, S16 |
| Total mass | 2.7e21 kg (DeMeo & Carry), 3.0e21 kg (Kuchynka & Folkner), 4.5e-4 M⊕ = 2.69e21 kg, 2.3e21 kg (NSSDC) | S4, S5, S12 |
| as fraction of the Moon (7.346e22 kg) | 3.1–4.1 %, best ~3.7 % | computed |
| Four largest | Ceres 31 %, Vesta 9 %, Pallas 7 %, Hygiea 3 % (≈ half the mass) | S4 |
| Belt volume | 2e26 km³ | S17 |
| Mean spacing, popular figures | 965,600 km; "just under 1 million km" | S17, S18 |
| Mean spacing, computed (V/N)^(1/3) | 4.7–5.7 million km for 1.1–1.9 million bodies in 2e26 km³; 2.8–3.3 million km in my own smaller volume (annulus 2.065–3.279 AU, half-thickness 0.11 r → 4.1e25 km³) | computed |

The popular "~1 million km" figure is not reproduced by the > 1 km counts: 2e26 km³ / (965,600 km)³ implies ~2.2e8 bodies, i.e. it must count bodies well below 1 km. Either way, a body is ~10^5–10^6 of its own diameters from its nearest neighbour.

### 6. Shapes

| Body (type) | a × b × c (km) | b/a | c/a | a/c | Source |
|---|---|---|---|---|---|
| 433 Eros (S, NEA) | 34.4 × 11.2 × 11.2 | 0.33 | 0.33 | 3.07 | S11 |
| 243 Ida (S) | 59.8 × 25.4 × 18.6 | 0.42 | 0.31 | 3.22 | S11 |
| 951 Gaspra (S) | 18.2 × 10.5 × 8.9 | 0.58 | 0.49 | 2.04 | S11 |
| 25143 Itokawa (S, NEA, bilobed) | 0.535 × 0.294 × 0.209 | 0.55 | 0.39 | 2.56 | S11 |
| 162173 Ryugu (Cb, top) | 1.004 (eq.) × 0.876 (polar) | 1.00 | 0.87 | 1.15 | S11 |
| 101955 Bennu (B, top) | 0.5047 × 0.4918 × 0.4567 | 0.97 | 0.90 | 1.11 | S11 |
| 4 Vesta (V) | 569.24 × 554.48 × 452.66 | 0.97 | 0.80 | 1.26 | S11 |
| 2 Pallas (B) | 568 × 532 × 448 | 0.94 | 0.79 | 1.27 | S11 |
| 21 Lutetia (Xk) | 121 × 101 × 75 | 0.83 | 0.62 | 1.61 | S11 |
| 2867 Šteins (E) | 6.8 × 5.7 × 4.4 | 0.84 | 0.65 | 1.55 | S12 |
| 253 Mathilde (Cb) | 66 × 48 × 46 | 0.73 | 0.70 | 1.43 | S12 |
| 216 Kleopatra (M, dog-bone) | 276 × 94 × 78 | 0.34 | 0.28 | 3.54 | S11 |
| 4179 Toutatis (S, NEA) | 4.6 × 2.4 × 1.9 | 0.52 | 0.41 | 2.42 | S12 |
| 65803 Didymos (S, NEA, top) | 0.797 × 0.783 × 0.761 | 0.98 | 0.95 | 1.05 | S11 |
| 486958 Arrokoth (KBO, contact binary) | 36 × 20 × 10 | 0.56 | 0.28 | 3.60 | S31 |

Median c/a over these 15: 0.62 (range 0.28–0.95). Bodies ≳ 400 km (Vesta, Pallas) are near-spheroids (c/a ~0.8); the small fast rotators are "spinning tops" (Ryugu, Bennu, Didymos, c/a ~0.9); mid-size ones span everything. NEO light curves fit "a uniform distribution of axis ratio" (S35).

Contact-binary (bilobed) fractions:

| Population | Fraction | Source |
|---|---|---|
| NEAs > ~200 m (radar) | ~14 % contact binaries (+ ~16 % true binaries) | S27 |
| Jupiter Trojans > ~12 km | 14–23 % close/contact binary candidates (not debiased); 6–10 % contact (Mann 2007) | S28, S22 |
| Hildas > ~4 km | 30–51 % candidates | S28 |
| Cold classical KBOs | ~10–25 % (lower limit) | S29 |
| Plutinos | up to ~40 % (~50 % of small ones) | S29 |

Examples: Itokawa (S11, bilobed), Kleopatra (dog-bone, S11/S12), Hektor (bilobed, D_eq 250 ± 26 km, S32), Arrokoth (S31), Selam, Dinkinesh's moon (two lobes ~210 and ~230 m, S30), Toutatis and Castalia (S12 notes).

### 7. Rotation

Rotation periods from SBDB (LCDB) for numbered IMB+MBA+OMB with a diameter:

| D (km) | N | median P | 10 % | 90 % | P < 2.2 h |
|---|---|---|---|---|---|
| 1–10 | 14,330 | 7.58 h | 3.07 h | 78.7 h | 2.7 % |
| 10–100 | 4,346 | 10.10 h | 4.10 h | 50.0 h | 0.7 % |
| 100–1000 | 210 | 11.12 h | 5.74 h | 31.7 h | 0 % |

- Spin barrier ~2.2 h for 0.2–13 km bodies (S33); only 365 of 18,887 bodies ≥ 0.3 km with periods spin faster than 2.0 h.
- D > 40 km: Maxwellian spin rates; 3–15 km: rates uniform between 1 and 9.5 rev/day plus an excess of slow rotators (S34). Own: 21.8 % of 3–15 km bodies have P > 24 h.
- Tumbling (NPA): "about 1/3 of asteroids in the slow rotators excess" (S34). 1/3 × 21.8 % ≈ **7 % of 3–15 km asteroids tumble** (rough estimate); MANOS saw 10 tumblers among 228 NEOs ≈ 4 % (S35). Big bodies essentially never tumble.
- KBOs: cold classical mean period 9.48 ± 1.53 h, other TNOs 8.45 ± 0.58 h (S29). Trojans: Hektor 6.92 h, Patroclus pair 102.8 h (tidally locked binary), Agamemnon 6.59 h (S11).

### 8. Albedos and colour hints

| Population | Geometric albedo p_V | Source |
|---|---|---|
| S-type | 0.23 ± 0.02 (S4 says ~0.20) | S5 |
| C-type | 0.06 ± 0.01 (S4 says ~0.05) | S5 |
| D-type | 0.06 ± 0.01 | S5 |
| V (Vesta) | 0.35 | S5 |
| E (Hungarias) | 0.45 | S5 |
| Jupiter Trojans | 0.07 ± 0.03 (NEOWISE); own SBDB median 0.07 (N = 1,879) | S22, S10 |
| Cold classical KBOs | 0.152 (median of measured) | S37 |
| Hot classical / Plutinos / Centaurs | 0.079 / 0.074 / 0.058 | S37 |

Visible colours from the Bus-DeMeo mean spectra (S36), reflectance normalised to 1 at 0.55 µm. "Hue-only sRGB" puts the 0.55 µm value at linear 0.5; "albedo-scaled" multiplies by p_V (S5). These are crude: three-wavelength sampling, no colour-matching functions or solar spectrum weighting, so treat them as hints for tinting, not as measured colours.

| Class | R(0.45) | R(0.65) | R(0.75) | slope 0.45–0.75 µm (%/100 nm) | hue-only sRGB | p_V | albedo-scaled sRGB |
|---|---|---|---|---|---|---|---|
| C | 0.965 | 1.012 | 1.014 | 1.6 | #bdbcb9 | 0.06 | #464544 |
| B | 0.978 | 1.002 | 0.983 | 0.2 | #bcbcba | 0.14 | #696967 |
| S | 0.839 | 1.123 | 1.193 | 11.8 | #c5bcad | 0.23 | #8b847a |
| D | 0.904 | 1.086 | 1.169 | 8.8 | #c3bcb3 | 0.06 | #484542 |
| V | 0.811 | 1.150 | 1.204 | 13.1 | #c8bcab | 0.35 | #aaa091 |
| L | 0.845 | 1.130 | 1.204 | 12.0 | #c6bcae | 0.13 | #6b655d |
| X | 0.952 | 1.031 | 1.072 | 4.0 | #bebcb7 | – | – |

KBOs (median B−R from S37 table, Sun B−R = 1.03 per S37): cold classical 1.70 (N = 50), hot classical 1.53 (49), Plutino 1.49 (51), Twotino 1.58 (12), SDO 1.41 (33), Centaur 1.32 (84). Reflectance ratio R/B = 10^(0.4 (B−R − 1.03)): cold 1.85, hot 1.58, Plutino 1.53, Centaur 1.31; hue-only sRGB #d1bca2, #ccbca8, #cbbcaa, #c6bcb1. Cold classicals are the reddest objects listed, much redder than D-types/Trojans. (The B and R effective wavelengths 0.44/0.65 µm used for these hues are **unverified (from memory)**.)

So: S = light reddish-grey/tan, C = neutral dark grey (almost black at p ≈ 0.06), D/Trojans = dark with a slight red-brown cast, cold KBOs = clearly red-orange and brighter (p ≈ 0.15), hot KBOs = darker and less red.

### 9. Debris belts around other stars (Herschel, cold dust)

| Stars | Detection rate | Source |
|---|---|---|
| A (DEBRIS) | 24 ± 5 % | S39 |
| F / G / K (DEBRIS) | 23.9 / 14.3 / 13.0 % | S39 |
| FGK (DEBRIS overall) | 17 (+2.6 −2.3) % | S39 |
| FGK (DUNES) | 20.2 ± 2 %; complete < 15 pc: F 26 %, G 21 %, K 20 %, all 22 % | S38 |
| M (DEBRIS) | 2.1 (+2.7 −0.7) %, but a ~10× shallower survey in fractional luminosity | S39 |
| Warm (12 µm, exo-zodi) bright dust | ~1 % of young (< 120 Myr) Sun-like stars; ~1 in 10,000 old ones at the bright end | S41 |
| Habitable-zone dust (LBTI nulling) | 10/38 stars significant; ~20 % of Sun-like stars "significantly more dusty" than the median 3 zodi | S42 |

Detection bias: the Sun's Kuiper-belt dust has f_d ~ 1e-7 and "exact EKB analogs cannot be detected" with Herschel (S40); DUNES reaches "several times" the EKB level (S38). So the ~20 % rates are for belts ≳ 10× brighter than ours; real belts (including faint ones) are probably much more common. **For the game: give most systems a belt (the Sun has two), and make bright, massive belts the ~20 % case.**

### 10. Largest members and counts

| Population | Largest (non-dwarf) members, D (km) | Source |
|---|---|---|
| Main belt | Vesta 522.77, Pallas 513, Hygiea 407 (IRAS; that Hygiea is sometimes proposed as a dwarf planet is unverified (from memory)), Interamnia 306, Europa 304, Davida 270, Euphrosyne 267, Patientia 254, Juno 247 | S11, S10 |
| Jupiter Trojans | Hektor 225 (SBDB, old) / 250 ± 26 (bilobed equivalent, S32), Patroclus 140 (binary system), Agamemnon 131, Achilles 130, Mentor 126, Diomedes 118 | S11, S10, S32 |
| Kuiper belt | Ixion 697, Varuna 668, Huya 411; dwarf candidates Quaoar 1111, Orcus 910, Salacia 866; Arrokoth 25 (36 × 20 × 10) for scale | S37, S31 |

Cumulative counts from SBDB diameters (numbered main belt; Trojans all):

| D ≥ (km) | main belt | Jupiter Trojans |
|---|---|---|
| 10 | 8,331 | 1,773 |
| 20 | 2,077 | 555 |
| 50 | 643 | 97 |
| 100 | 210 | 17 |
| 200 | 27 | 1 |
| 300 | 6 | 0 |
| 500 | 3 | 0 |

So **~200 main-belt asteroids are larger than 100 km** (incl. Ceres). Classical KBOs > 100 km: ~3.8 × 10^4 (S20). Below ~10 km the SBDB diameter sample is incomplete (only objects with thermal data).

### 11. Size–frequency slopes (cumulative N(>D) ∝ D^−b; b = α − 1 for differential index α)

| Population / range | b | Source |
|---|---|---|
| Collisional equilibrium (Dohnanyi 1969) | 2.5 (count slope 0.5 → α = 3.5 via k = 0.2(α−1)) | S16, computed |
| Main belt 5–40 km (SDSS) | 3 (α = 4) | S16 |
| Main belt 0.4–5 km (SDSS) | 1.3 (α = 2.3) | S16 |
| Main belt 10–40 / 40–100 / 100–300 km (SBDB counts) | 1.67 / 1.49 / 3.24 | computed |
| Jupiter Trojans 20–80 km | ~2 (NEOWISE); own 2.01 | S22, computed |
| Jupiter Trojans > 84 km | 4.5 ± 0.9; own 80–150 km 5.6 | S22, computed |
| Classical KBOs (large) | 3.0 (q = 4.0) | S20 |

The SDSS α = 4 (b = 3) over 5–40 km disagrees with the SBDB b ≈ 1.6 over 10–100 km; SBDB diameters are incomplete toward 10 km, which flattens the slope, so the true value is somewhere between. For generation: a steep top end (few big bodies), b ≈ 2–3 in the middle, shallower below ~5 km.

### 12. Trojan libration period

T_lib ≈ 147.8 yr (computed, linear theory) vs "about 145 years or longer" (S24): **T_lib / T_J ≈ 12.5**. For a planet of mass ratio μ the same formula gives T_lib / T_planet = 1 / sqrt(27μ/4).

## Game mapping

What `gen/belts.ts` does with the numbers above, and where it departs from them on purpose. The game's orbits are compressed differently from real ones (planets are placed one after the other with gaps, not on a logarithmic ladder), so placement keeps ratios and orders, not distances.

**Placement.**
- *Main belt* (`reserveMainBelt`, `MAIN_BELT_RATIO`, `MAIN_BELT_FROM_INNER_PLANET`): real edges at Jupiter's 4:1 (2.065 AU) and 2:1 (3.278 AU) resonances, so the outer edge is (4/2)^(2/3) = 1.587 times the inner one whatever the giant's distance, and the inner edge is 1.355 times Mars's orbit (1.524 AU). `generateSystem` makes room for the belt while placing the planets, just before the first giant: the inner edge sits 1.355 times the previous planet's orbit out (or just past its neighbourhood, or the stars' if the giant comes first), the outer edge 1.587 times further, and the giant and everything after it move out by the belt's width. So every main belt is as wide for its size as the real one (width / mid radius 0.454). The giant then follows at its usual gap rather than where the 2:1 would put it (1.59 times beyond the belt's outer edge), to keep systems compact. (Before this, belts squeezed into the gaps the planets left had a median width / radius of 0.14, and the resonances taken at face value, 0.397–0.630 of the giant's orbit, fit only 371 of 1008 systems with a giant.)
- *Kirkwood gaps* (`KIRKWOOD_GAPS`): the 3:1, 5:2 and 7:3 at log fractions 0.415, 0.678 and 0.778 across the belt, computed from Jupiter's a (tested against Kepler's law). Rocks there are thinned by up to 90%, and the dust band dimmed.
- *Outer icy belt* (`kuiperSpan`, `KUIPER_SPAN`): from the 3:2 resonance with the outermost planet (1.31× its orbit, the Plutinos) to the 50 AU edge (1.66× Neptune's), and clear of its neighbourhood.
- *Trojans*: at ±60° from a giant, on its orbit, each swarm librating by up to 26–35° (`TROJAN_LIBRATION`, "a few degrees to about 35°") over 12.5 of the host's orbits (`TROJAN_LIBRATION_ORBITS`). L4 gets 60% of a pair's rocks (`TROJAN_L4_SHARE`; measured L4/L5 1.35–1.85, ~1.5). The swarm's radial spread, 4% of the orbit and clipped clear of the neighbours, is a gameplay value (room for named asteroids), not researched.

**How often** (`BELT_CHANCE`, `TROJAN_CHANCE`): Herschel sees cold debris belts round 17–22% of FGK stars, but only belts ≳10× the Sun's, whose own two belts would be invisible. So belts are made common: a main belt in 60% of the systems where one fits, an outer belt in 45% of systems with planets, and Trojans for 25% of gas giants and 15% of ice giants (Jupiter has 15 765, Neptune 35, Saturn none). These are gameplay shares.

**Thickness** (`BELT_INCLINATION`, `KUIPER_COLD`): each rock's inclination is a half-Gaussian with half the real spread, so the compressed belts read as bands and not clouds. Main belt: median 7.15° (σ ≈ 0.185 rad), the game uses σ 0.085–0.1. Trojans: median 12° (σ ≈ 0.31), the game uses 0.14–0.17. Outer belt: Brown's two populations, 19% cold (σ 2.2°) and 81% hot (σ 17°), both halved.

**Density** (`ROCK_DENSITY`, `MAX_ROCKS`, `MAX_SYSTEM_ROCKS`): deliberately not real. A main-belt asteroid larger than 1 km is ~3–6 million km from its nearest neighbour (10⁵–10⁶ of its own diameters). The game's rocks are tens of their own sizes apart: 200 per 1000 square units of belt, at most 60 000 per main belt, 30 000 per outer belt, 5000 per Trojan swarm and 80 000 per system.

**Sizes.**
- *Named asteroids* (`NAMED_RADIUS_KM`, `asteroidRadius`): real radii, log-uniform from 64 km (the moons' smallest, game radius 0.8) up to the largest non-dwarf member, mapped like the planets (game r = 8·√(R/R⊕)). Main belt up to Vesta's 261 km (game 1.62), Trojans up to Hektor's 125 km (1.12), outer belt up to Ixion's 349 km (1.87).
- *Scenery rocks* (`ROCK_SIZE`, `ROCK_SIZE_SLOPE`): 0.2–1.2 units across their longest reach, smaller than the named ones. Cumulative slope 1.3, SDSS's for 0.4–5 km main-belt asteroids. A steeper real slope (2.5–3 for bigger bodies) would leave almost nothing but specks.

**Shapes** (`CONTACT_BINARY_SHARE`, `ASTEROID_ELONGATION`): contact binaries make up 14% of the named main-belt asteroids (radar NEAs, which come from the main belt), 18% of Trojans (14–23% of candidates) and 25% of outer-belt bodies (the cold classicals' 10–25% is a lower limit; Plutinos reach ~40%). A single lobe's longest over shortest axis is drawn from 1.2–2.2, around the median of 1.6 for 15 imaged asteroids. 15% of the rest get a knob (a third, smaller lobe).

**Spins**: named asteroids turn in 15–60 s and scenery rocks in ~4–20 s, the game's compressed days. Real ones of 10–100 km take a median of 10.1 h, and nothing larger than ~200 m spins faster than the ~2.2 h barrier. Tumbling (~7% at 3–15 km) is left out.

**Composition and colour** (`CARBON_SHARE`, `ASTEROID_COLORS`):
- The main belt's dark (C-like) share is interpolated through the measured albedo split of numbered asteroids of 5 km and up: 0.55 in the inner belt, 0.68 in the middle, 0.87 in the outer, at log fractions 0.21, 0.55 and 0.85.
- Trojans are D-types and the outer belt is red with pale ice.
- Colours come from the Bus-DeMeo hints scaled by albedo: S `#8b847a` (light, faintly reddish grey), C `#464544` (neutral dark grey), D `#484542` (the same with a red-brown cast). Cold classicals are red (B−R 1.70, against the Sun's 1.03) at p_V 0.15.
- The C- and D-types are lifted to an HSL lightness of about 0.27 so they don't vanish against space. Real ones are ~4× darker than S-types; here they're about 1.7× darker.

## Game measurements

The game's own generator over the first 1500 systems of seed 1337, from a scratch script run with `npx vite-node` (it imports `generateSystem` and `generateRocks`):

| | Main belt | Outer belt | Trojans |
|---|---|---|---|
| Systems with one | 584 (38.9%) | 672 (44.8%) | 373 (24.9%) |
| Named asteroids | 2646 | 2031 | 1822 |
| Contact binaries | 14.2% | 24.0% | 17.6% |
| Width / mid radius | 0.454 (the real belt's) | 0.236 | 0.08 |

- Systems with any belt: 1067 (71%).
- Named asteroids by class: 2031 icy, 1870 carbonaceous, 1822 D-type, 776 stony.
- Making room for main belts moves the planets beyond them outwards, but the systems' outer edges stay about the same size (median 699, p90 1368, max 2501, against a camera that zooms out to 2500). Outer belts reach 1109 (median), 2103 (p90) and 3595 at most. The home system's giant moves from 559 to 966 to make room for its belt (502–797).
- Rocks per belt, p10/p50/p90: 2905 / 22 155 / 53 333; per system with belts, median 34 567, capped at 80 000. Main belts hold 170 rocks per 1000 square units (median).
- `generateSystem` takes 1.1 ms a system. Named asteroids' shapes are built on first read (a shape takes ~1 ms to measure); before that change it took 4.3 ms. `generateRocks` takes 69 ms for 60 000 rocks, once when the system is built.

Rocks of one main belt: median inclination 3.75° (half the real 7.15°, as intended), 90th percentile 9.1°. Sizes p10/p50/p90 are 0.22 / 0.32 / 0.73. Outer belt: median 4.1°, 57% below 5° (cold plus halved hot). Trojans: median 5.6°, largest libration 26°.

**The view and its cost** (`world/AsteroidBelt.ts`):
- Every rock is a dot in one `Points`, a pure function of the clock in its vertex shader.
- Rocks bigger than `meshPixels` (4 device px) on screen become tumbling meshes of 48 triangles: four rock shapes per belt, one draw call each. They are chosen on the CPU with `rockWithin` at most every 0.25 s or 4 units of camera motion, and packed into the instance buffers. `rockWithin` rejects most rocks without trigonometry, then checks the rest with `rockPosition` (the shader's maths). A test checks it against every rock's true distance. Choosing among 60 000 rocks takes 5.3 ms under headless Chrome; 10 ms before the shortcuts.
- A dusty ring takes over beyond 150–900 units. Its colour is evened to one luminance, outer belts are dimmer, and it fades from inside the belt and edge-on.

FPS with belts / without, headless SwiftShader, 1280×720:

| View | With belts | Without |
|---|---|---|
| Home system arrival view, full quality (one 60 000-rock belt) | 5 | 6 |
| Next to a named asteroid inside it (~1270 meshes chosen near the ship) | 7 | 9 |

Earlier measurements, before the main belts were widened, all with `?quality=low` unless noted:
- With every rock a mesh, a system of 12 000 rocks ran at 5 FPS against 16 without.
- After the dot/mesh split it ran at 16 against 20.
- Inside the narrow home belt at full quality: 9 against 13.

## Open questions

- **S/C crossover distance.** Gradie & Tedesco's full text was not reachable (science.org blocks the proxy), so there is no single quoted number. The value used here (S-like inside the 3:1 at ~2.5 AU, C-like outside) is my own albedo-proxy measurement; albedo is not taxonomy (e.g. dark inner-belt families, bright V-types) and SBDB albedos are biased toward objects NEOWISE measured.
- **Mean spacing.** The popular "~1 million km" (S17, S18) is inconsistent with 1.1–1.9 million bodies > 1 km in 2e26 km³ (gives ~5 million km); it implies ~2e8 bodies. Not resolved; neither article shows its count.
- **Number > 1 km.** ISO (1.1–1.9 million, S14/S15) and SDSS (530,000, S16) differ by 2–4×. Not resolved.
- **Main-belt size slope 10–100 km.** SBDB counts give b ≈ 1.6, SDSS gives α = 4 (b = 3) for 5–40 km. Bottke et al. 2005 (asked for) was not read; SBDB diameters are incomplete near 10 km.
- **Inclinations** are osculating and ecliptic, not proper/invariable-plane; proper inclinations (AstDyS) were not fetched. Discovery bias favours low i, so the true belt is a bit thicker than the "all numbered" row.
- **Trojan libration amplitudes**: only the range (few–35°, S24) and an instantaneous-offset snapshot; no debiased amplitude distribution was read (Vokrouhlický 2024 uses C/da_P parameters, not degrees).
- **KBO edge**: 50 AU (Trujillo, Jewitt & Luu 2001, abstract read) vs 47 ± 1 AU (Trujillo & Brown 2001, only seen through a search summary).
- **Contact-binary fractions** are candidate fractions from light-curve amplitudes (Trojans, KBOs) and are not debiased; the Trojan 14–23 % includes close (non-contact) binaries.
- **Tumbling fraction** (~7 % at 3–15 km) is my combination of two numbers (S34 fraction-of-excess × SBDB slow fraction), not a published value.
- **Colour hints** use a 3-point sampling of class-mean spectra (no CIE matching, no solar spectrum); the B/R effective wavelengths for the KBO hues are unverified (from memory).
- **Hektor diameter**: SBDB's 225 km is a 1990 value; Marchis et al. 2014 give 250 ± 26 km equivalent (the game uses 250).
- **Belt rocks are dense on purpose** and their inclinations halved; the S/C colour contrast is reduced; the giant beyond a main belt sits at its usual gap, not at its 2:1 distance (see Game mapping).
- **Uranus Trojans**: the MPC list is empty at the time of reading though two transient ones are published (S26); Earth's list shows only 2020 XL5 though 2010 TK7 is known.

## Scripts

All run with `node` in the scratchpad after downloading:
`curl -o MBA.json "https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=full_name,a,e,i,diameter,albedo,rot_per,class&sb-class=MBA&sb-kind=a&sb-ns=n"` (likewise IMB, OMB, TJN, TNO without `sb-ns`; `TJN2.json` with `fields=full_name,a,e,i,om,w,ma,epoch,diameter,albedo`), `jtno.txt` = tag-stripped Johnston's Archive list, `bdx/` = unzipped Bus-DeMeo xlsx.

### belts.mjs

```js
// Asteroid-belt statistics from JPL SBDB query API dumps (accessed 2026-10-01).
import fs from 'fs';
const load = f => JSON.parse(fs.readFileSync(f)).data;
const num = x => (x === null || x === '' ? NaN : +x);
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : '-');
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
// fields: full_name,a,e,i,diameter,albedo,rot_per,class
const isNumbered = r => /^\s*\d+\s/.test(r[0]); // numbered objects only (MBA.json was fetched with sb-ns=n)
const mb = [...load('IMB.json'), ...load('MBA.json'), ...load('OMB.json')].filter(isNumbered).map(r => ({ a: num(r[1]), e: num(r[2]), i: num(r[3]), D: num(r[4]), p: num(r[5]), P: num(r[6]) }));
const mbaNumbered = load('MBA.json').length;
console.log('SBDB counts: IMB+MBA(numbered)+OMB =', mb.length, '; MBA numbered =', mbaNumbered);

// --- 1. resonances with Jupiter and measured gap minima
const aJ = 5.20336301, aN = 30.06896348; // NASA fact sheets
const res = (aP, p, q) => aP * Math.pow(q / p, 2 / 3); // p:q = asteroid:planet period... interior: a = aP (q/p)^(2/3)
console.log('\nJupiter resonances: a_res = a_J (q/p)^(2/3), interior p:q (asteroid makes p orbits per q of Jupiter)');
const hist = (lo, hi, w, sel) => { const n = Math.round((hi - lo) / w); const h = new Array(n).fill(0); for (const o of mb) if (sel(o) && o.a >= lo && o.a < hi) h[Math.floor((o.a - lo) / w)]++; return h; };
const w = 0.005, lo = 1.7, hi = 3.8; const H = hist(lo, hi, w, o => true);
const sm = H.map((_, k) => { let s = 0, c = 0; for (let j = k - 1; j <= k + 1; j++) if (H[j] !== undefined) { s += H[j]; c++; } return s / c; });
for (const [p, q, meas] of [[4, 1, 2.065], [3, 1, 2.502], [5, 2, 2.825], [7, 3, 2.958], [2, 1, 3.279], [3, 2, 3.972]]) {
  const ar = res(aJ, p, q);
  // measured: lowest smoothed bin within +-0.04 AU
  let best = -1, bv = Infinity; for (let k = 0; k < sm.length; k++) { const x = lo + (k + 0.5) * w; if (Math.abs(x - ar) < 0.04 && sm[k] < bv) { bv = sm[k]; best = x; } }
  console.log(`${p}:${q}  computed ${ar.toFixed(3)} AU  (=${(ar / aJ).toFixed(3)} a_J)  Wikipedia ${meas}  SBDB histogram minimum ${best > 0 ? best.toFixed(3) + ' AU' : 'n/a (outside histogram; the 3:2 holds the Hildas, not a gap)'}`);
}
const am = 1.52366231; console.log('Mars a/a_J =', (am / aJ).toFixed(3));
const inCore = o => o.a > 2.065 && o.a < 3.279;
console.log('\nFraction of numbered IMB+MBA+OMB with 2.065<a<3.279:', (mb.filter(inCore).length / mb.length).toFixed(3));
for (const p of [1, 5, 50, 95, 99]) console.log(` a percentile ${p}%: ${pct(mb.map(o => o.a), p).toFixed(3)} AU`);

// --- 2. inclinations and instantaneous thickness
const core = mb.filter(inCore);
const big = core.filter(o => o.D >= 10);
for (const [name, set] of [['core all', core], ['core D>=10 km', big]]) {
  const I = set.map(o => o.i);
  console.log(`\nInclination (${name}, N=${set.length}): mean ${mean(I).toFixed(2)}°, median ${pct(I, 50).toFixed(2)}°, 90% ${pct(I, 90).toFixed(2)}°, 95% ${pct(I, 95).toFixed(2)}°, 99% ${pct(I, 99).toFixed(2)}°`);
  console.log('  frac i<5:', (I.filter(x => x < 5).length / I.length).toFixed(3), ' i<10:', (I.filter(x => x < 10).length / I.length).toFixed(3), ' i<20:', (I.filter(x => x < 20).length / I.length).toFixed(3), ' i<30:', (I.filter(x => x < 30).length / I.length).toFixed(3));
  // snapshot thickness: z/r = sin i * sin u, u uniform
  const Z = []; let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const o of set) Z.push(Math.abs(Math.sin(o.i * Math.PI / 180) * Math.sin(2 * Math.PI * rnd())));
  console.log(`  snapshot |z|/r: median ${pct(Z, 50).toFixed(3)}, 68% ${pct(Z, 68).toFixed(3)}, 90% ${pct(Z, 90).toFixed(3)}, 95% ${pct(Z, 95).toFixed(3)}`);
}

// --- 7. rotation
const rot = mb.filter(o => o.P > 0);
for (const [lo2, hi2] of [[0.15, 1], [1, 10], [10, 100], [100, 1000]]) {
  const s = rot.filter(o => o.D >= lo2 && o.D < hi2).map(o => o.P);
  console.log(`\nRotation period D ${lo2}-${hi2} km (N=${s.length}): median ${f2(pct(s, 50))} h, 10% ${f2(pct(s, 10))} h, 90% ${f2(pct(s, 90))} h, frac P<2.2h ${(s.filter(x => x < 2.2).length / s.length).toFixed(3)}`);
}
const fast = rot.filter(o => o.D >= 0.3 && o.P < 2.0); console.log('D>=0.3 km with P<2.0 h:', fast.length, 'of', rot.filter(o => o.D >= 0.3).length);

// --- 8. albedo by zone, and S/C crossover (albedo proxy: p>0.15 "S-like", p<0.10 "C-like"), D>=5 km
const zones = [['Hungaria 1.78-2.0', 1.78, 2.0], ['inner 2.065-2.502', 2.065, 2.502], ['middle 2.502-2.825', 2.502, 2.825], ['outer 2.825-3.279', 2.825, 3.279], ['Cybele 3.279-3.7', 3.279, 3.7], ['Hilda 3.7-4.2', 3.7, 4.2]];
console.log('\nGeometric albedo (WISE/NEOWISE etc via SBDB), D>=5 km');
for (const [n, l, h] of zones) { const s = mb.filter(o => o.a >= l && o.a < h && o.D >= 5 && o.p > 0).map(o => o.p); console.log(` ${n}: N=${s.length} median ${f2(pct(s, 50))}  frac p>0.15 ${(s.filter(x => x > 0.15).length / s.length).toFixed(2)}  frac p<0.10 ${(s.filter(x => x < 0.10).length / s.length).toFixed(2)}`); }
for (const Dmin of [5, 20, 50]) {
console.log(` D>=${Dmin} km: a-bin   N   bright(p>0.15)  dark(p<0.10)`);
for (let a = 2.1; a < 3.3; a += 0.1) { const s = mb.filter(o => o.a >= a && o.a < a + 0.1 && o.D >= Dmin && o.p > 0).map(o => o.p); console.log(` ${a.toFixed(1)}-${(a + 0.1).toFixed(1)} ${String(s.length).padStart(5)}  ${(s.filter(x => x > 0.15).length / s.length).toFixed(2)}  ${(s.filter(x => x < 0.10).length / s.length).toFixed(2)}`); } }

// --- 4. Jupiter Trojans
const tj = load('TJN2.json').map(r => ({ a: +r[1], i: +r[3], lam: (+r[4] + +r[5] + +r[6]), jd: +r[7], D: num(r[8]), p: num(r[9]) }));
const L4 = [], L5 = [];
for (const o of tj) {
  const T = (o.jd - 2451545.0) / 36525; const lJ = 34.39644051 + 3034.74612775 * T; // JPL approx elements, table 1
  let d = ((o.lam - lJ) % 360 + 540) % 360 - 180; o.d = d; (d > 0 ? L4 : L5).push(o);
}
const I = tj.map(o => o.i);
console.log(`\nJupiter Trojans (SBDB TJN, N=${tj.length}): L4 (leading) ${L4.length}, L5 (trailing) ${L5.length}, ratio ${(L4.length / L5.length).toFixed(2)}`);
const L4b = L4.filter(o => o.D >= 10).length, L5b = L5.filter(o => o.D >= 10).length; console.log(`  D>=10 km: L4 ${L4b}, L5 ${L5b}, ratio ${(L4b / L5b).toFixed(2)}`);
console.log(`  inclination mean ${mean(I).toFixed(1)}°, median ${pct(I, 50).toFixed(1)}°, 90% ${pct(I, 90).toFixed(1)}°, max ${Math.max(...I).toFixed(1)}°`);
const dA = tj.map(o => Math.abs(o.d)); console.log(`  instantaneous |λ-λJ|: median ${pct(dA, 50).toFixed(1)}°, 5% ${pct(dA, 5).toFixed(1)}°, 95% ${pct(dA, 95).toFixed(1)}°`);
const dev = tj.map(o => Math.abs(Math.abs(o.d) - 60)); console.log(`  instantaneous |Δλ - 60°|: median ${pct(dev, 50).toFixed(1)}°, 90% ${pct(dev, 90).toFixed(1)}°, 99% ${pct(dev, 99).toFixed(1)}°`);
const pT = tj.filter(o => o.p > 0).map(o => o.p); console.log(`  albedo median ${f2(pct(pT, 50))} (N=${pT.length})`);

// --- 3. Kuiper belt
const tn = load('TNO.json').map(r => ({ a: num(r[1]), e: num(r[2]), i: num(r[3]) }));
console.log(`\nNeptune resonances (exterior, a = a_N (p/q)^(2/3), object period/Neptune period = p/q):`);
for (const [p, q] of [[3, 2], [5, 3], [7, 4], [2, 1], [5, 2]]) { const ar = aN * Math.pow(p / q, 2 / 3); const n = tn.filter(o => Math.abs(o.a - ar) < 0.3).length; console.log(` ${q}:${p} (Neptune:object)  ${ar.toFixed(2)} AU = ${(ar / aN).toFixed(3)} a_N   SBDB TNOs within ±0.3 AU: ${n}`); }
const cls = tn.filter(o => o.a > 42.4 && o.a < 47.7 && o.e < 0.2);
const Ic = cls.map(o => o.i);
console.log(` classical-belt proxy (42.4<a<47.7, e<0.2) N=${cls.length}: i median ${pct(Ic, 50).toFixed(1)}°, frac i<5° ${(Ic.filter(x => x < 5).length / Ic.length).toFixed(2)}, frac i>10° ${(Ic.filter(x => x > 10).length / Ic.length).toFixed(2)}, 95% ${pct(Ic, 95).toFixed(1)}°`);
const bins = [30, 35, 38, 40, 42, 44, 46, 48, 50, 55, 60, 70, 100]; let line = ' a histogram:'; for (let k = 0; k < bins.length - 1; k++) line += ` ${bins[k]}-${bins[k + 1]}:${tn.filter(o => o.a >= bins[k] && o.a < bins[k + 1]).length}`; console.log(line);
console.log(' TNO count', tn.length, ' frac 30<a<50 with q>30:', (tn.filter(o => o.a < 50).length / tn.length).toFixed(2));
```

Output:

```
SBDB counts: IMB+MBA(numbered)+OMB = 870924 ; MBA numbered = 825292

Jupiter resonances: a_res = a_J (q/p)^(2/3), interior p:q (asteroid makes p orbits per q of Jupiter)
4:1  computed 2.065 AU  (=0.397 a_J)  Wikipedia 2.065  SBDB histogram minimum 2.058 AU
3:1  computed 2.502 AU  (=0.481 a_J)  Wikipedia 2.502  SBDB histogram minimum 2.502 AU
5:2  computed 2.825 AU  (=0.543 a_J)  Wikipedia 2.825  SBDB histogram minimum 2.827 AU
7:3  computed 2.958 AU  (=0.568 a_J)  Wikipedia 2.958  SBDB histogram minimum 2.952 AU
2:1  computed 3.278 AU  (=0.630 a_J)  Wikipedia 3.279  SBDB histogram minimum 3.288 AU
3:2  computed 3.971 AU  (=0.763 a_J)  Wikipedia 3.972  SBDB histogram minimum n/a (outside histogram; the 3:2 holds the Hildas, not a gap)
Mars a/a_J = 0.293

Fraction of numbered IMB+MBA+OMB with 2.065<a<3.279: 0.970
 a percentile 1%: 1.919 AU
 a percentile 5%: 2.224 AU
 a percentile 50%: 2.675 AU
 a percentile 95%: 3.181 AU
 a percentile 99%: 3.259 AU

Inclination (core all, N=844960): mean 8.40°, median 7.15°, 90% 15.34°, 95% 18.28°, 99% 27.12°
  frac i<5: 0.324  i<10: 0.660  i<20: 0.958  i<30: 0.997
  snapshot |z|/r: median 0.070, 68% 0.110, 90% 0.203, 95% 0.247

Inclination (core D>=10 km, N=7713): mean 10.80°, median 10.37°, 90% 20.50°, 95% 23.15°, 99% 27.64°
  frac i<5: 0.233  i<10: 0.475  i<20: 0.894  i<30: 0.996
  snapshot |z|/r: median 0.097, 68% 0.152, 90% 0.254, 95% 0.308

Rotation period D 0.15-1 km (N=1): median 52.67 h, 10% 52.67 h, 90% 52.67 h, frac P<2.2h 0.000

Rotation period D 1-10 km (N=14330): median 7.58 h, 10% 3.07 h, 90% 78.72 h, frac P<2.2h 0.027

Rotation period D 10-100 km (N=4346): median 10.10 h, 10% 4.10 h, 90% 49.99 h, frac P<2.2h 0.007

Rotation period D 100-1000 km (N=210): median 11.12 h, 10% 5.74 h, 90% 31.73 h, frac P<2.2h 0.000
D>=0.3 km with P<2.0 h: 365 of 18887

Geometric albedo (WISE/NEOWISE etc via SBDB), D>=5 km
 Hungaria 1.78-2.0: N=32 median 0.23  frac p>0.15 0.75  frac p<0.10 0.22
 inner 2.065-2.502: N=3385 median 0.10  frac p>0.15 0.42  frac p<0.10 0.51
 middle 2.502-2.825: N=10264 median 0.07  frac p>0.15 0.29  frac p<0.10 0.63
 outer 2.825-3.279: N=28923 median 0.06  frac p>0.15 0.12  frac p<0.10 0.79
 Cybele 3.279-3.7: N=834 median 0.06  frac p>0.15 0.02  frac p<0.10 0.93
 Hilda 3.7-4.2: N=919 median 0.06  frac p>0.15 0.01  frac p<0.10 0.95
 D>=5 km: a-bin   N   bright(p>0.15)  dark(p<0.10)
 2.1-2.2   118  0.92  0.04
 2.2-2.3   748  0.76  0.20
 2.3-2.4  1263  0.34  0.57
 2.4-2.5  1256  0.26  0.67
 2.5-2.6  2176  0.46  0.47
 2.6-2.7  3947  0.29  0.63
 2.7-2.8  3743  0.18  0.72
 2.8-2.9  1559  0.38  0.54
 2.9-3.0  2819  0.37  0.48
 3.0-3.1  7572  0.19  0.68
 3.1-3.2 13815  0.04  0.90
 3.2-3.3  3571  0.03  0.91
 D>=20 km: a-bin   N   bright(p>0.15)  dark(p<0.10)
 2.1-2.2     4  0.75  0.00
 2.2-2.3    15  0.67  0.27
 2.3-2.4    61  0.38  0.51
 2.4-2.5    70  0.30  0.59
 2.5-2.6    83  0.41  0.52
 2.6-2.7   171  0.25  0.67
 2.7-2.8   214  0.29  0.64
 2.8-2.9   109  0.37  0.59
 2.9-3.0   107  0.21  0.74
 3.0-3.1   274  0.24  0.58
 3.1-3.2   623  0.06  0.85
 3.2-3.3   148  0.06  0.85
 D>=50 km: a-bin   N   bright(p>0.15)  dark(p<0.10)
 2.1-2.2     1  1.00  0.00
 2.2-2.3     9  0.56  0.44
 2.3-2.4    25  0.40  0.36
 2.4-2.5    25  0.48  0.44
 2.5-2.6    32  0.28  0.69
 2.6-2.7    64  0.25  0.69
 2.7-2.8    91  0.26  0.69
 2.8-2.9    37  0.27  0.73
 2.9-3.0    40  0.15  0.75
 3.0-3.1    60  0.15  0.83
 3.1-3.2   156  0.05  0.90
 3.2-3.3    35  0.03  0.89

Jupiter Trojans (SBDB TJN, N=16397): L4 (leading) 10420, L5 (trailing) 5977, ratio 1.74
  D>=10 km: L4 1017, L5 756, ratio 1.35
  inclination mean 14.2°, median 12.0°, 90% 27.7°, max 55.4°
  instantaneous |λ-λJ|: median 61.9°, 5% 44.1°, 95% 83.6°
  instantaneous |Δλ - 60°|: median 8.3°, 90% 20.0°, 99% 35.5°
  albedo median 0.07 (N=1879)

Neptune resonances (exterior, a = a_N (p/q)^(2/3), object period/Neptune period = p/q):
 2:3 (Neptune:object)  39.40 AU = 1.310 a_N   SBDB TNOs within ±0.3 AU: 575
 3:5 (Neptune:object)  42.27 AU = 1.406 a_N   SBDB TNOs within ±0.3 AU: 263
 4:7 (Neptune:object)  43.67 AU = 1.452 a_N   SBDB TNOs within ±0.3 AU: 623
 1:2 (Neptune:object)  47.73 AU = 1.587 a_N   SBDB TNOs within ±0.3 AU: 176
 2:5 (Neptune:object)  55.39 AU = 1.842 a_N   SBDB TNOs within ±0.3 AU: 91
 classical-belt proxy (42.4<a<47.7, e<0.2) N=2651: i median 4.3°, frac i<5° 0.54, frac i>10° 0.30, 95% 28.4°
 a histogram: 30-35:174 35-38:213 38-40:861 40-42:499 42-44:1498 44-46:1180 46-48:679 48-50:222 50-55:382 55-60:359 60-70:359 70-100:477
 TNO count 7293  frac 30<a<50 with q>30: 0.73
```

### sizes.mjs

```js
// Size-frequency, spacing and misc derived numbers. Inputs: SBDB dumps (2026-10-01) + constants quoted in the note.
import fs from 'fs';
const load = f => JSON.parse(fs.readFileSync(f)).data;
const isNum = r => /^\s*\d+\s/.test(r[0]);
const mb = [...load('IMB.json'), ...load('MBA.json'), ...load('OMB.json')].filter(isNum).map(r => ({ a: +r[1], D: r[4] === null ? NaN : +r[4], P: r[6] === null ? NaN : +r[6] }));
const tj = load('TJN.json').map(r => ({ D: r[4] === null ? NaN : +r[4] }));
const cum = (set, D) => set.filter(o => o.D >= D).length;
console.log('Cumulative counts N(>=D) with SBDB diameters (numbered IMB+MBA+OMB; Jupiter Trojans TJN all):');
console.log(' D(km)   mainbelt   trojans');
for (const D of [1, 5, 10, 20, 50, 100, 150, 200, 300, 400, 500]) console.log(` ${String(D).padStart(4)}  ${String(cum(mb, D)).padStart(8)}  ${String(cum(tj, D)).padStart(8)}`);
const slope = (set, D1, D2) => -Math.log(cum(set, D2) / cum(set, D1)) / Math.log(D2 / D1);
console.log(`cumulative slope b in N(>D)∝D^-b: main belt 10-40 km ${slope(mb, 10, 40).toFixed(2)}, 40-100 km ${slope(mb, 40, 100).toFixed(2)}, 100-300 km ${slope(mb, 100, 300).toFixed(2)}; Trojans 20-80 km ${slope(tj, 20, 80).toFixed(2)}, 80-150 km ${slope(tj, 80, 150).toFixed(2)}`);
console.log('Dohnanyi: count slope k=0.5 and k=0.2(alpha-1) (Ivezic 2001 eq.7) -> differential alpha =', 0.5 / 0.2 + 1, '-> cumulative b = alpha-1 =', 0.5 / 0.2);
console.log('Ivezic 2001 differential alpha=4 (5-40 km) -> cumulative 3; alpha=2.3 (0.4-5 km) -> cumulative 1.3');

// slow rotators D 3-15 km
const s = mb.filter(o => o.D >= 3 && o.D <= 15 && o.P > 0);
const slow = s.filter(o => o.P > 24).length;
console.log(`\nD 3-15 km with known P (N=${s.length}): P>24 h fraction ${(slow / s.length).toFixed(3)}; x 1/3 (Pravec 2008: ~1/3 of slow-rotator excess tumble) -> tumbling ~${(slow / s.length / 3 * 100).toFixed(1)}%`);

// spacing
const AU = 1.495978707e8; // km (IAU 2012)
const Vastro = 2e26; // km^3, Astronomy.com
for (const N of [1.1e6, 1.9e6, 5.3e5]) console.log(`N=${N.toExponential(2)}: mean spacing (V/N)^(1/3) with V=2e26 km^3 -> ${(Math.cbrt(Vastro / N) / 1e6).toFixed(2)} million km`);
// our own volume: annulus 2.065-3.279 AU, half-thickness h = 0.11 r (68% snapshot |z|/r from belts.mjs)
const r1 = 2.065 * AU, r2 = 3.279 * AU; let V = 0; const n = 1000; for (let k = 0; k < n; k++) { const r = r1 + (k + 0.5) * (r2 - r1) / n; V += 2 * Math.PI * r * (r2 - r1) / n * 2 * 0.11 * r; }
console.log(`own volume (annulus 2.065-3.279 AU, half-thickness 0.11 r): ${V.toExponential(2)} km^3; spacing for 1.1-1.9e6: ${(Math.cbrt(V / 1.9e6) / 1e6).toFixed(2)}-${(Math.cbrt(V / 1.1e6) / 1e6).toFixed(2)} million km`);
// mass
const Mmoon = 0.07346e24, ME = 5.9722e24;
for (const [n2, m] of [['RN2020 4.5e-4 ME', 4.5e-4 * ME], ['DeMeo&Carry 2013 2.7e21', 2.7e21], ['Kuchynka&Folkner 2013 3.0e21', 3.0e21], ['NSSDC 2.3e21', 2.3e21]]) console.log(`belt mass ${n2}: ${(m).toExponential(2)} kg = ${(m / Mmoon * 100).toFixed(1)}% of Moon`);
// Trojan libration period (linear theory T_lib = T_J / sqrt(27 mu/4))
const MJ = 1898.13e24, MS = 1988400e24, TJ = 4332.589 / 365.25; const mu = MJ / (MJ + MS);
const Tl = TJ / Math.sqrt(27 * mu / 4); console.log(`\nmu=${mu.toExponential(4)}, T_J=${TJ.toFixed(3)} yr, T_lib=${Tl.toFixed(1)} yr, ratio T_lib/T_J=${(Tl / TJ).toFixed(2)}`);
```

Output:

```
Cumulative counts N(>=D) with SBDB diameters (numbered IMB+MBA+OMB; Jupiter Trojans TJN all):
 D(km)   mainbelt   trojans
    1    132172      1879
    5     44412      1878
   10      8331      1773
   20      2077       555
   50       643        97
  100       210        17
  150        73         1
  200        27         1
  300         6         0
  400         4         0
  500         3         0
cumulative slope b in N(>D)∝D^-b: main belt 10-40 km 1.67, 40-100 km 1.49, 100-300 km 3.24; Trojans 20-80 km 2.01, 80-150 km 5.61
Dohnanyi: count slope k=0.5 and k=0.2(alpha-1) (Ivezic 2001 eq.7) -> differential alpha = 3.5 -> cumulative b = alpha-1 = 2.5
Ivezic 2001 differential alpha=4 (5-40 km) -> cumulative 3; alpha=2.3 (0.4-5 km) -> cumulative 1.3

D 3-15 km with known P (N=13496): P>24 h fraction 0.218; x 1/3 (Pravec 2008: ~1/3 of slow-rotator excess tumble) -> tumbling ~7.3%
N=1.10e+6: mean spacing (V/N)^(1/3) with V=2e26 km^3 -> 5.67 million km
N=1.90e+6: mean spacing (V/N)^(1/3) with V=2e26 km^3 -> 4.72 million km
N=5.30e+5: mean spacing (V/N)^(1/3) with V=2e26 km^3 -> 7.23 million km
own volume (annulus 2.065-3.279 AU, half-thickness 0.11 r): 4.08e+25 km^3; spacing for 1.1-1.9e6: 2.78-3.33 million km
belt mass RN2020 4.5e-4 ME: 2.69e+21 kg = 3.7% of Moon
belt mass DeMeo&Carry 2013 2.7e21: 2.70e+21 kg = 3.7% of Moon
belt mass Kuchynka&Folkner 2013 3.0e21: 3.00e+21 kg = 4.1% of Moon
belt mass NSSDC 2.3e21: 2.30e+21 kg = 3.1% of Moon

mu=9.5369e-4, T_J=11.862 yr, T_lib=147.8 yr, ratio T_lib/T_J=12.46
```

### shapes.mjs

```js
// Axis ratios of imaged asteroids. Dimensions (km) from JPL SBDB phys_par "extent" or NSSDC asteroid fact sheet / papers (see note).
const S = [
  ['433 Eros (S, NEA)', 34.4, 11.2, 11.2, 'SBDB/Veverka 2000'],
  ['243 Ida (S)', 59.8, 25.4, 18.6, 'SBDB/Thomas 1996'],
  ['951 Gaspra (S)', 18.2, 10.5, 8.9, 'SBDB/Thomas 1994'],
  ['25143 Itokawa (S, NEA, contact binary)', 0.535, 0.294, 0.209, 'SBDB/Fujiwara 2006'],
  ['162173 Ryugu (Cb, NEA, spinning top)', 1.004, 1.004, 0.876, 'SBDB/Watanabe 2019 (equatorial x polar)'],
  ['101955 Bennu (B, NEA, spinning top)', 0.5047, 0.4918, 0.4567, 'SBDB/Daly 2020'],
  ['4 Vesta (V)', 569.24, 554.48, 452.66, 'SBDB/Park 2025'],
  ['2 Pallas (B)', 568, 532, 448, 'SBDB/Marsset 2020'],
  ['21 Lutetia (Xk)', 121, 101, 75, 'SBDB/Sierks 2011'],
  ['2867 Steins (E)', 6.8, 5.7, 4.4, 'NSSDC fact sheet'],
  ['253 Mathilde (Cb)', 66, 48, 46, 'NSSDC fact sheet'],
  ['216 Kleopatra (M, dog-bone)', 276, 94, 78, 'SBDB/Shepard 2018'],
  ['4179 Toutatis (S, NEA, contact?)', 4.6, 2.4, 1.9, 'NSSDC fact sheet'],
  ['65803 Didymos (S, NEA)', 0.797, 0.783, 0.761, 'SBDB/Naidu'],
  ['486958 Arrokoth (KBO, contact binary)', 36, 20, 10, 'Spencer 2020'],
];
console.log('body | a x b x c (km) | b/a | c/a | a/c');
const ca = [];
for (const [n, a, b, c, src] of S) { ca.push(c / a); console.log(`${n} | ${a} x ${b} x ${c} | ${(b / a).toFixed(2)} | ${(c / a).toFixed(2)} | ${(a / c).toFixed(2)} | ${src}`); }
const s = [...ca].sort((x, y) => x - y); console.log('median c/a over these', s[Math.floor(s.length / 2)].toFixed(2), ' range', s[0].toFixed(2), '-', s[s.length - 1].toFixed(2));
```

Output:

```
body | a x b x c (km) | b/a | c/a | a/c
433 Eros (S, NEA) | 34.4 x 11.2 x 11.2 | 0.33 | 0.33 | 3.07 | SBDB/Veverka 2000
243 Ida (S) | 59.8 x 25.4 x 18.6 | 0.42 | 0.31 | 3.22 | SBDB/Thomas 1996
951 Gaspra (S) | 18.2 x 10.5 x 8.9 | 0.58 | 0.49 | 2.04 | SBDB/Thomas 1994
25143 Itokawa (S, NEA, contact binary) | 0.535 x 0.294 x 0.209 | 0.55 | 0.39 | 2.56 | SBDB/Fujiwara 2006
162173 Ryugu (Cb, NEA, spinning top) | 1.004 x 1.004 x 0.876 | 1.00 | 0.87 | 1.15 | SBDB/Watanabe 2019 (equatorial x polar)
101955 Bennu (B, NEA, spinning top) | 0.5047 x 0.4918 x 0.4567 | 0.97 | 0.90 | 1.11 | SBDB/Daly 2020
4 Vesta (V) | 569.24 x 554.48 x 452.66 | 0.97 | 0.80 | 1.26 | SBDB/Park 2025
2 Pallas (B) | 568 x 532 x 448 | 0.94 | 0.79 | 1.27 | SBDB/Marsset 2020
21 Lutetia (Xk) | 121 x 101 x 75 | 0.83 | 0.62 | 1.61 | SBDB/Sierks 2011
2867 Steins (E) | 6.8 x 5.7 x 4.4 | 0.84 | 0.65 | 1.55 | NSSDC fact sheet
253 Mathilde (Cb) | 66 x 48 x 46 | 0.73 | 0.70 | 1.43 | NSSDC fact sheet
216 Kleopatra (M, dog-bone) | 276 x 94 x 78 | 0.34 | 0.28 | 3.54 | SBDB/Shepard 2018
4179 Toutatis (S, NEA, contact?) | 4.6 x 2.4 x 1.9 | 0.52 | 0.41 | 2.42 | NSSDC fact sheet
65803 Didymos (S, NEA) | 0.797 x 0.783 x 0.761 | 0.98 | 0.95 | 1.05 | SBDB/Naidu
486958 Arrokoth (KBO, contact binary) | 36 x 20 x 10 | 0.56 | 0.28 | 3.60 | Spencer 2020
median c/a over these 0.62  range 0.28 - 0.95
```

### colours.mjs

```js
// Rough colour hints from Bus-DeMeo class-mean spectra (smass.mit.edu busdemeo-meanspectra.xlsx, accessed 2026-10-01;
// reflectance normalised to 1 at 0.55 um) and DeMeo & Carry 2013 Table 2 mean albedos.
// "RGB" = reflectance sampled at 0.65/0.55/0.45 um, a crude stand-in for proper colour matching (see note).
import fs from 'fs';
const ss = [...fs.readFileSync('bdx/xl/sharedStrings.xml', 'utf8').matchAll(/<t>([^<]*)<\/t>/g)].map(m => m[1]);
const sheet = fs.readFileSync('bdx/xl/worksheets/sheet1.xml', 'utf8');
const rows = [];
for (const rm of sheet.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)) {
  const cells = {};
  for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<f[^>]*\/>|<f[^>]*>[^<]*<\/f>)?<v>([^<]*)<\/v><\/c>/g)) cells[cm[1]] = cm[2].includes('t="s"') ? ss[+cm[3]] : +cm[3];
  rows.push(cells);
}
const hdr = rows.find(r => r.A === 'Wavelength'); const data = rows.slice(1).filter(r => typeof r.A === 'number' && r.A > 0.3 && r.A < 3);
const colOf = name => Object.keys(hdr).find(k => hdr[k] === name);
const interp = (cls, wl) => { const c = colOf(cls + '_Mean'); for (let k = 0; k < data.length - 1; k++) { const a = data[k], b = data[k + 1]; if (wl >= a.A && wl <= b.A) return a[c] + (b[c] - a[c]) * (wl - a.A) / (b.A - a.A); } return NaN; };
console.log('wavelength grid', data[0].A, '...', data[data.length - 1].A, 'um, N =', data.length);
const alb = { C: 0.06, S: 0.23, D: 0.06, X: NaN, V: 0.35, B: 0.14, K: 0.14, L: 0.13 };
const enc = x => { x = Math.max(0, Math.min(1, x)); return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)); };
const hex = v => '#' + v.map(x => x.toString(16).padStart(2, '0')).join('');
console.log('class  R0.45  R0.55  R0.65  R0.75  slope(0.45-0.75 um, %/100nm rel. 0.55)  hue-only sRGB (G=0.5)   albedo  albedo-scaled sRGB');
for (const c of ['C', 'B', 'S', 'D', 'V', 'L', 'K', 'X']) {
  const [b, g, r, ir] = [0.45, 0.55, 0.65, 0.75].map(w => interp(c, w));
  const slope = (ir - b) / 3 * 100; // per 100 nm over 300 nm
  const hue = [r, g, b].map(x => enc(0.5 * x / g));
  const A = alb[c]; const abs = Number.isFinite(A) ? [r, g, b].map(x => enc(A * x / g)) : null;
  console.log(`${c.padEnd(5)} ${b.toFixed(3)}  ${g.toFixed(3)}  ${r.toFixed(3)}  ${ir.toFixed(3)}   ${slope.toFixed(1).padStart(6)}   ${hex(hue)}   ${Number.isFinite(A) ? A.toFixed(2) : ' -  '}  ${abs ? hex(abs) : '-'}`);
}
// KBO colours from B-R (Johnston median B-R; Sun B-R = 1.03 per the same page). Reflectance ratio R/B = 10^(0.4((B-R)-(B-R)sun)).
// Effective wavelengths B ~ 0.44 um, R ~ 0.65 um: unverified (from memory), only used for the slope estimate.
for (const [n, br] of [['cold classical', 1.70], ['hot classical', 1.53], ['plutino', 1.49], ['Centaur', 1.32]]) {
  const ratio = Math.pow(10, 0.4 * (br - 1.03)); const slope = (ratio - 1) / ((0.65 - 0.44) * 10) * 100; // %/100nm rel. B
  // linear interpolation in wavelength between B (0.44) and R (0.65), normalise at 0.55
  const refl = w => 1 + (ratio - 1) * (w - 0.44) / (0.65 - 0.44); const g = refl(0.55);
  console.log(`KBO ${n.padEnd(15)} B-R ${br}  R/B reflectance ratio ${ratio.toFixed(2)}  ~slope ${slope.toFixed(0)} %/100nm  hue-only sRGB ${hex([0.65, 0.55, 0.45].map(w => enc(0.5 * refl(w) / g)))}`);
}
```

Output:

```
wavelength grid 0.45 ... 2.45 um, N = 41
class  R0.45  R0.55  R0.65  R0.75  slope(0.45-0.75 um, %/100nm rel. 0.55)  hue-only sRGB (G=0.5)   albedo  albedo-scaled sRGB
C     0.965  1.000  1.012  1.014      1.6   #bdbcb9   0.06  #464544
B     0.978  1.000  1.002  0.983      0.2   #bcbcba   0.14  #696967
S     0.839  1.000  1.123  1.193     11.8   #c5bcad   0.23  #8b847a
D     0.904  1.000  1.086  1.169      8.8   #c3bcb3   0.06  #484542
V     0.811  1.000  1.150  1.204     13.1   #c8bcab   0.35  #aaa091
L     0.845  1.000  1.130  1.204     12.0   #c6bcae   0.13  #6b655d
K     0.883  1.000  1.085  1.132      8.3   #c2bcb1   0.14  #6d6963
X     0.952  1.000  1.031  1.072      4.0   #bebcb7    -    -
KBO cold classical  B-R 1.7  R/B reflectance ratio 1.85  ~slope 41 %/100nm  hue-only sRGB #d1bca2
KBO hot classical   B-R 1.53  R/B reflectance ratio 1.58  ~slope 28 %/100nm  hue-only sRGB #ccbca8
KBO plutino         B-R 1.49  R/B reflectance ratio 1.53  ~slope 25 %/100nm  hue-only sRGB #cbbcaa
KBO Centaur         B-R 1.32  R/B reflectance ratio 1.31  ~slope 15 %/100nm  hue-only sRGB #c6bcb1
```

### tno.mjs

```js
// Johnston's Archive TNO list (accessed 2026-10-01, list updated 19 Jan 2026): B-R colour and measured albedo by class.
import fs from 'fs';
const L = fs.readFileSync('jtno.txt', 'utf8').split('\n');
const h = L[60]; const col = k => h.indexOf(k);
const cClass = col('dynamical'), cA = col('   a   ') , cBR = col('B-R'), cDiam = col('diameter'), cAlb = col('albedo');
const rows = [];
for (const l of L.slice(62)) {
  if (l.length < cBR + 4) continue;
  const cls = l.slice(cClass, cClass + 16).trim();
  const tail = l.slice(cClass + 16).trim().split(/\s+/);
  // tail: a e q Q i diameter albedo? assum? B-R? ... -> use fixed columns for diam/albedo/BR
  const diam = l.slice(cDiam - 2, cDiam + 8).trim();
  const alb = l.slice(cAlb - 1, cAlb + 7).trim();
  const br = parseFloat(l.slice(cBR - 2, cBR + 5).trim());
  const i = parseFloat(tail[4]);
  rows.push({ cls, i, diam, alb: alb.startsWith('(') ? NaN : parseFloat(alb), br });
}
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)].toFixed(2) + ` (N=${s.length})` : '-'; };
for (const c of ['cubewano-cold', 'cubewano-hot', 'plutino', 'twotino', 'SDO', 'Centaur']) {
  const s = rows.filter(r => r.cls.startsWith(c));
  console.log(c.padEnd(15), 'N', String(s.length).padStart(5), ' median B-R', med(s.map(r => r.br)), ' median measured albedo', med(s.map(r => r.alb)));
}
console.log('header cols', { cClass, cBR, cDiam, cAlb });
```

Output:

```
cubewano-cold   N  1271  median B-R 1.70 (N=50)  median measured albedo 0.15 (N=33)
cubewano-hot    N  1221  median B-R 1.53 (N=49)  median measured albedo 0.10 (N=26)
plutino         N   572  median B-R 1.49 (N=51)  median measured albedo 0.08 (N=29)
twotino         N   146  median B-R 1.58 (N=12)  median measured albedo 0.08 (N=5)
SDO             N   807  median B-R 1.41 (N=33)  median measured albedo 0.12 (N=14)
Centaur         N   783  median B-R 1.32 (N=84)  median measured albedo 0.06 (N=67)
header cols { cClass: 51, cBR: 141, cDiam: 115, cAlb: 124 }
```

