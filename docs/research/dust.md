# Dust in systems: young discs, debris belts, meteor showers (roadmap step 29)

## Question

Step 29 puts dust into systems: dusty discs round young stars, a faint dust band in some mature systems, and meteor showers on planets whose orbits cross a comet's dust. It needs:

**A. Protoplanetary (young) discs.** The user wants only "a realistic handful" per 4000-star galaxy, mostly inside emission nebulas.
1. Disc fraction against age, its e-folding time and half-life.
2. From that, the share of all Milky Way stars that have a disc today.
3. Which stars have them (T Tauri, Herbig Ae/Be), shorter lifetimes for heavier stars, discs being stripped near O stars (proplyds).
4. Structure: HL Tau's rings and gaps, DSHARP's gap counts, radii and widths, the inner dust rim (sublimation radius), outer radii, flaring (h/r and its index), and a gap-width formula for a planet checked against real cases.
5. Colour in scattered light.

**B. Debris discs and zodiacal dust** (the user picked ~20% of systems).
1. Incidence per spectral type.
2. Our zodiacal cloud: radial and vertical density, the brightness that follows, and how bright it is in the sky.
3. Ring radii and widths, warm against cold belts.

**C. Meteor showers and comet dust trails.**
1. When a comet gives a planet a shower (a minimum orbit intersection distance, MOID, threshold).
2. How long showers last (FWHM and activity period) and what fraction of an orbit that is.
3. Rates: ZHR of the major showers, the sporadic background, storms.
4. Meteors to draw: heights, speeds, durations, lengths, colours.
5. The radiant and the geocentric speed.
6. Meteors on other worlds (Mars, Titan, Venus) and how thin an atmosphere can still make them.
7. Airless bodies: lunar impact flashes (rate, duration, brightness, the boost during showers).
8. Comet dust trails: widths and lengths.

Precision: ranges and trends within ~10–20%. The player reads none of these as a number.

Reference cases: HL Tau, PDS 70, the DSHARP discs, AB Aur (inner rim), Fomalhaut, the Kuiper belt and the zodiacal cloud, the Perseids, Geminids, Quadrantids, Leonids, Orionids and η-Aquariids, the Moon, Mars, Titan and Triton.

## Sources

All accessed 2026-10-02. Every arXiv paper was downloaded as PDF with curl and read as text (`pdftotext -layout`), tables included; "page" below means a page read raw with curl. NASA ADS and aanda.org refused the proxy (timeouts, 403), so A&A papers were read from arXiv or author mirrors.

### Protoplanetary discs

- **Haisch, Lada & Lada 2001, ApJ 553, L153**, https://arxiv.org/abs/astro-ph/0104347. Abstract: "the cluster disk fraction is initially very high (≥ 80%) and rapidly decreases with increasing cluster age, such that half the stars within the clusters lose their disks in ≲ 3 Myr. Moreover, these observations yield an overall disk lifetime of ∼ 6 Myr". Table 1 (JHKL excess fraction, age): NGC 2024 85% ± 8%, 0.3 Myr; Trapezium 80% ± 5%, 1.5; IC 348 65% ± 8%, 2.3; NGC 2264 52% ± 10%, 3.2; NGC 2362 12% ± 4%, 5.0; NGC 1960 3% ± 3%, 30.0. Text: "the disks surrounding high mass stars have shorter lifetimes than the disks around stars of lower mass".
- **Mamajek 2009, AIP Conf. Proc. 1158, 3**, https://arxiv.org/abs/0906.5011. "approximately follow an exponential decay with characteristic time ∼2.5 Myr (half-life ≃ 1.7 Myr)"; "the disk fraction decay timescale appears to vary by stellar mass, ranging from ∼1 Myr for >1.3 M⊙ stars to ∼3 Myr for <0.08 M⊙ brown dwarfs"; eq. 1 "τdisk = −τ/ln(fdisk)"; "Removing individual clusters from the fit varies τdisk by <10%". Herbig Ae/Be stars "(>2 M⊙)": "fdisk ≤ 5% for all of their samples (3-15 Myr)"; Upper Sco (∼5 Myr): no primordial discs among 92 BAFG (>1.3 M⊙) members, "however 7/21 (∼35%; K0–K6) of ∼1–1.3 M⊙ stars have primordial disks"; summary "τdisk ≃ 1.2 Myr for >1.3 M⊙ stars". Lifetime depends on "stellar mass, multiplicity, and proximity to O-type stars".
- **Ribas, Merín, Bouy & Maud 2014, A&A 561, A54**, https://arxiv.org/abs/1312.0609. "τ =4.2∼5.8 Myr at 22–24 µm for primordial disks, compared to 2∼3 Myr at shorter wavelength (3.4–12 µm). Primordial disks disappear around 10∼20 Myr."
- **Ribas, Bouy & Merín 2015, A&A 576, A52**, https://arxiv.org/abs/1502.00631. Table 3 (protoplanetary disc %, MIPS1 limit; mass boundary 2 M⊙, age boundary 3 Myr): young low-mass 66 ± 4, young high-mass 36 ± 8, old low-mass 8 ± 2, old high-mass 2 (+4/−2); evolved discs 9 ± 2, 31 ± 7, 8 ± 3, 23 ± 6. Text: "protoplanetary disks disperse up to two times faster around high-mass stars"; "By ∼ 10 Myr, no protoplanetary disks are found around high-mass stars, but ≈10-15 % of low-mass stars still harbor a disk"; "5-15 % of low-mass stars display this kind of excess [evolved], and the fraction increases to 20-30 % for high-mass objects". Table A.2 (A·e^(−t/τ) + C): short (3.4–4.6 µm) A = 60 ± 10 %, τ = 2.7 ± 0.7 Myr, C = 1.1 ± 0.9 %; long (primordial) A = 84 ± 6, τ = 4.4 ± 0.5, C = −0.1 ± 0.4.
- **Licquia & Newman 2015, ApJ 806, 96**, https://arxiv.org/abs/1407.1078. "a SFR for the Galaxy of Ṁ⋆ = 1.65 ± 0.19 M⊙ yr−1, assuming a Kroupa initial mass function"; "total stellar mass of M⋆ = 6.08 ± 1.14 × 10^10 M⊙".
- **Kroupa 2001, MNRAS 322, 231**, https://arxiv.org/abs/astro-ph/0009005. IMF slopes: "α0 = +0.3 ± 0.7, 0.01 ≤ m/M⊙ < 0.08; α1 = +1.3 ± 0.5, 0.08 ≤ m/M⊙ < 0.50; α2 = +2.3 ± 0.3, 0.50 ≤ m/M⊙ < 1.00; α3 = +2.3 ± 0.7, 1.00 ≤ m/M⊙".
- **Winter & Haworth 2022, EPJ Plus 137, 1132** (review of external photoevaporation), https://arxiv.org/abs/2206.11910. Proplyds: "over 150 known in the region [ONC]"; "The ONC is around 1-3 Myr old with the primary UV source the O6V star θ1 C"; "Proplyds can be found in the ONC at separations of up to ∼ 1 pc from θ1 C"; B stars drive them too ("the B1V star 42 Ori in NGC 1977"); host masses "from around solar down to almost planetary masses"; mass-loss "regularly be greater than 10−7 M⊙ yr−1 and sometimes greater than than 10−6 M⊙ yr−1"; "the majority of discs are expected to reside in much stronger UV environments" than the nearby, well-studied ones.
- **Eisner et al. 2018, ApJ 860, 77** (ALMA, Orion Nebula Cluster), https://arxiv.org/abs/1805.03669. "disks in this region are particularly compact"; size distribution "peaked around disk radii of ∼ 10–30 AU, with few disks of radii larger than 35 AU"; "a correlation between disk flux and distance from the massive star θ1 Ori C".
- **ALMA Partnership (Brogan et al.) 2015, ApJ 808, L3** (HL Tau), https://arxiv.org/abs/1503.02649. Table 2 semi-major axes (AU): D1 13.2 ± 0.2, B1 20.4 ± 0.1, D2 32.3 ± 0.1, B2 38.1 ± 0.1, D3 ∼42, B3 ∼47, D4 ∼50, B4 ∼55, D5 64.2 ± 0.1, B5 68.8 ± 0.1, D6 73.7 ± 0.1, B6 81.3 ± 0.1, D7 ∼91, B7 ∼97; "nominal width of the individual rings (5 to 8 AU)"; inclination 46.72° ± 0.05°; "D1 being 46% less bright than B1"; distance 140 pc; continuum size "∼ 1960" mas; earlier "outer radius of 120 AU" (Kwon et al. 2011); age "≤1-2 Myr".
- **Andrews et al. 2018, ApJ 869, L41** (DSHARP I), https://arxiv.org/abs/1812.04040. A "typical" disc: host "M∗ ≈ 0.3 M⊙", "compact (Reff ≈ 10–20 au)"; the DSHARP averages "M∗ ≈ 0.8 M⊙ (spectral type K7), Fν ≈ 150 mJy, and Reff ≈ 50 au".
- **Huang et al. 2018, ApJ 869, L42** (DSHARP II), https://arxiv.org/abs/1812.04041. "Annular substructures can occur at virtually any radius where millimeter continuum emission is detected and range in widths from a few au to tens of au. Intensity ratios between gaps and adjacent rings range from near-unity to just a few percent"; "the majority of the substructures are narrower than 10 au"; spirals in 3/18, crescents in 2/18. Table 1 (every gap's r0 and width, au) and Table 2 (Rdust, the radius holding 95% of the flux) are copied into `discs.mjs` below.
- **Dullemond & Monnier 2010, ARA&A 48, 205**, https://arxiv.org/abs/1006.3485. Eq. 1: Rrim = √(L∗ / 4πσT⁴rim) = R∗ (T∗/Trim)²; "For the parameters of AB Aurigae (R∗ = 2.4 R⊙, T∗ = 10000 K) and for Trim = 1500 K we obtain Rrim = 0.5 AU"; NIR sizes "scale mostly as the square root of the stellar luminosity"; "consistent with a dust evaporation temperature between 1000-1500 K"; for solar-mass young stars "Rrim … roughly near 0.1 AU"; "Hp,rim ≃ 0.036 Rrim" for AB Aur at 1500 K.
- **Chiang & Goldreich 1997, ApJ 490, 368**, https://arxiv.org/abs/astro-ph/9706042. Star "T∗ = 4000 K, mass M∗ = 0.5M⊙, and radius R∗ = 2.5R⊙"; for 0.4 < a_AU < 84: "Ti ≈ 150 / a_AU^(3/7) K", "H/a ≈ 0.17 a_AU^(2/7)" (H is the height of the visible surface; "we have set H/h = 4; in reality, this factor declines from about 5 at a_AU = 3 to 4 at a_AU = 10²"); "the disk flares until H ≈ a at ao ≈ 270 AU".
- **Kanagawa et al. 2016, PASJ 68, 43**, https://arxiv.org/abs/1603.03853. Eq. 4: "∆gap/Rp = 0.41 (Mp/M∗)^(1/2) (hp/Rp)^(−3/4) α^(−1/4)", the gap being where Σ < Σ0/2; simulations "1.0MJ (∆gap = 0.69Rp)", "0.3MJ (∆gap = 0.39Rp)". Table 2 (HL Tau, α = 10⁻³, M∗ = 1 M⊙): 10 AU gap Rin 7, Rout 16.5, ∆/Rp 0.81, hp/Rp 0.05 → 1.4 MJ; 30 AU gap 28.5, 36, 0.23, 0.07 → 0.2 MJ; 80 AU gap 70, 94, 0.29, 0.1 → 0.5 MJ.
- **PDS 70:** Keppler et al. 2018, A&A 617, A44, https://arxiv.org/abs/1806.11568: star "0.76±0.02 M⊙"; "a large gap of ∼54 au in size" in scattered light ("The mean radius of the disk brightness peak is determined to be ∼54 au"). Keppler et al. 2019, A&A 625, A118, https://arxiv.org/abs/1902.07639: "The outer dust ring peaks at 0.65" (74 au)"; CO "depletion of emission at ∼0.2" (23 au) with a width of ∼0.1" (11 au)"; planet "∼5-9 MJup"; "even a planet with a mass of 10 MJup may not be sufficient to explain the extent of the wide gap"; their model disc "(H/R)p = 0.089" at Rp = 22 au, flaring index f = 0.25, α = 10⁻³. Haffert et al. 2019, Nat. Astron. 3, 749, https://arxiv.org/abs/1906.01486: "orbital distances for PDS 70 b and c of 20.6+-1.2 AU … and 34.5+-2 AU", "near a 2:1 mean motion resonance".
- **Ma, Schmid & Stolker 2024, A&A** (colours of scattered light), https://arxiv.org/abs/2312.14045. Colour η = d log(reflectivity)/d log λ; "blue for η < −0.5, gray for −0.5 < η < 0.5, and red for η > 0.5"; "η = 1 is equivalent to … mR′ − mI′ = 0.25m"; "all disks around Herbig stars … a red color ηV/IR > 0.5, while four out of six disks around T-Tauri stars (PDS 70, TW Hya, RX J1615, and PDS 66) are gray"; LkCa 15 and MWC 758 "very red colors ηV/IR ≈ 2"; "All our disk gradients fall roughly into the range −1.5 < η < 2"; polarized reflectivities "between Qφ/I⋆ ≈ 0.1 % to 1.0 %".

### Debris discs and the zodiacal cloud

- **Herschel DEBRIS**, per type, from Lestrade et al. 2025, A&A (M dwarfs), https://arxiv.org/abs/2502.04441, Table 1: A 21/86 "24 ± 5 %" (Thureau et al. 2014); F 22/92 "23.9 +5.3/−4.7 %", G 13/91 "14.3 +4.7/−3.8 %", K 12/92 "13.0 +4.5/−3.6 %" (Sibthorpe et al. 2018); M 2/94 "2.1 +2.7/−0.7 %" (the discs of GJ 581 and Fomalhaut C). Lestrade: the M survey "is about ten times shallower … in the physical parameter space", and "the incidence of debris disks does not appear to drop from the K subsample to the M subsample … when considering disks in the same region of physical parameter space".
- **Sibthorpe et al. 2018, MNRAS 475, 3046** (DEBRIS FGK), https://arxiv.org/abs/1803.00072. "47 stars, giving a detection rate of 17.1 +2.6/−2.3 per cent, with lower rates for later spectral types"; "most detected discs are concentrated at f ∼ 10−5 and at temperatures corresponding to blackbody radii 7-40 AU, which scales to ∼ 40 AU for realistic dust properties (similar to the current Kuiper belt)"; "one has unusually hot dust < 4 AU"; rbb = (278.3/T)² √L∗; earlier rates "10 and 15 per cent … for F, G and K" and "∼32 per cent found around A stars (Su et al. 2006)", DUNES "20.2±2 per cent" (Eiroa et al. 2013).
- **Montesinos et al. 2016, A&A 593, A51** (DUNES), https://arxiv.org/abs/1605.05837. Within 15 pc: "0.26 +0.21/−0.14 (6 objects with excesses out of 23 F stars), 0.21 +0.17/−0.11 (7 out of 33 G stars) and 0.20 +0.14/−0.09 (10 out of 49 K stars) … 0.22 +0.08/−0.07 (23 out of 105 stars)" (95% confidence); "The incidence of debris discs is similar for active (young) and inactive (old) stars".
- **MacGregor et al. 2017, ApJ 842, 8** (Fomalhaut, ALMA), https://arxiv.org/abs/1705.05867. "an inner edge of 136.3 ± 0.9 AU and width of 13.5 ± 1.8 AU", eccentricity "0.12 ± 0.01", "fractional width of the belt … ∆R/R = 0.10 ± 0.01"; the classical Kuiper belt "implying a fractional width of ∼ 0.18 (Hahn & Malhotra 2005)"; HD 107146 and η Corvi "fractional widths of > 0.3".
- **Matrà et al. 2025, A&A** (REASONS, 74 resolved belts), https://arxiv.org/abs/2501.09058. "only 9/74 belts are smaller than 60 au"; "roughly 70% of discs are wide (∆R/R > 0.5), with a median fractional width of 0.71"; "very narrow rings such as HR 4796, Fomalhaut and HD 202628 are rare"; protoplanetary rings "median fractional width of 0.18"; a synthetic Kuiper belt "central radius of 43 au and a FWHM of 12 au", "fractional width of 0.28"; belt aspect ratios "orbital inclinations of ∼1-20°"; cold-belt occurrence "at least ∼ 17 − 33%"; T(R) = 278.3 L⋆^0.25 R^−0.5.
- **Kennedy & Wyatt 2014, MNRAS 444, 3164**, https://arxiv.org/abs/1408.4116. Two-temperature discs: "The ratio of warm to cool temperatures is constant in the range 2-4, and the temperatures of both warm and cool components increases with stellar mass"; "it is probable that most have multiple spatial components … similar to the outer Solar System's configuration of Asteroid and Edgeworth-Kuiper belts"; outer systems "typically span a factor of about ten in radius".
- **Kelsall et al. 1998, ApJ 508, 44** (COBE DIRBE zodiacal model), https://arxiv.org/abs/astro-ph/9806250. Table 1, smooth cloud ("Widened Modified Fan"): n0 "1.13 × 10−7 AU−1", α "1.34" ± 0.022, β "4.14", γ "0.942", µ "0.189", i "2.03°", Ω "77.7°", centre offset ≈ 0.012 AU; density "nc = n0 Rc^−α f(ζ)", ζ ≡ |Zc/Rc|, "f(ζ) = e^(−βg^γ)", "g = ζ²/2µ for ζ < µ; ζ − µ/2 for ζ ≥ µ"; "The radial power-law is motivated by the radial distribution expected for particles under the influence of Poynting-Robertson drag"; line-of-sight integration "to an outer radial cutoff of 5.2 AU"; also three asteroidal dust bands and a circumsolar ring (peak "1.03 AU", radial dispersion "0.025 AU", with a trailing blob behind the Earth).
- **STIS Instrument Handbook §6.5** (STScI), https://hst-docs.stsci.edu/stisihb/chapter-6-exposure-time-calculations/6-5-detector-and-sky-backgrounds (page, Table 6.2 "sourced from Leinert et al. (1998)"). Zodiacal light in V mag arcsec⁻² by helioecliptic longitude (rows) and latitude 0–90° (columns), e.g. longitude 90°: 21.9 22.2 22.6 22.9 23.1 23.2 23.2; 180°: 22.0 … 23.2; 60°: 21.2 … 23.2; "the polar value of mV = 23.3"; "For a target near ecliptic coordinates of (50,0) … mV = 20.9 arcsec−2, i.e., about 9 times the polar value"; "varies by only a factor of about three throughout most of the sky". Aldering 2002 (LBNL SNAP note, https://supernova.lbl.gov/~aldering/zodi.pdf) and Giavalisco et al. 2002 (WFC3 ISR 2002-12): Leinert's NEP value "1.81×10−18 erg cm−2 s−1 Å−1 arcsec−2 … 23.3 mag/arcsec²"; "the zodiacal light is redder than the solar spectrum".

### Meteors

- **Ye & Jenniskens 2022, "Comets and meteor showers"** (Comets III), https://arxiv.org/abs/2209.10654. "In general, comets with minimum orbit intersection distance (MOID) within ∼ 0.1 au can produce observable meteor showers (Jenniskens et al. 2021b). It usually takes ∼ 10–20 orbits for meteoroids ejected at a certain epoch to spread to the entire orbit"; ZHR "defined as the number of meteors seen by a single human observer … limiting stellar magnitude of +6.5 and shower radiant at zenith"; "Quadrantids, Perseids and Geminids have a ZHR around 100 (a volume density of mm-sized meteoroids around 10−12 –10−11 m−3), while the strongest meteor outbursts in the past two centuries had ZHR over ∼10,000 (10−10 –10−9 m−3). Meteor activity with ZHR over 1,000 is called a meteor storm"; "The Leonid storm in 1966 may have reached a ZHR of 15,000 … the strongest meteor outburst ever measured. In normal years, the Leonids … reaching ZHR=15"; Perseids "ZHR=80 around August 12 … outbursts up to ZHR=500 … 1989—1995", total stream mass "∼ 4 × 10^13 kg"; "η-Aquariids has a ZHR of 60 and the Orionids is about 20"; one stream "strong (ZHR=130) but short (only lasts ∼ 0.5 d)"; C/2013 A1 (Siding Spring) passed Mars at "0.0009 au" and orbiters saw "significant enhancements of meteoric metal ions".
- **Jenniskens 1994, A&A 287, 990, "Meteor stream activity I. The annual streams"** (scan at https://www.dutch-meteor-society.nl/DMS/Meteor%20stream%20activity%20I.pdf, OCR read; ADS refused). Activity "ZHR = ZHRmax 10^(−B|λ⊙−λmax|)". Table 3b (peak λ⊙, ZHRmax, B in deg⁻¹): Quadrantids (listed as "Boo", 282.62) 133 ± 16, 1.8; Lyrids 31.7, 12.8 ± 0.7, 0.22; η-Aquariids 45.8, 36.7 ± 5.0, 0.080; Perseids 139.49, 84 ± 5, 0.20; Orionids 207.9, 25 ± 4, 0.12; Leonids 234.4, 23 ± 6, 0.39; Geminids 261.4, 88 ± 4, 0.39 / 0.72 (rise / fall); Ursids 270.3, 11.8, 0.61. Table 3c (main peak + background): Perseids peak 70 ± 5, B 0.35, background 23 ± 2 with B+ 0.050, B− 0.092; Quadrantids 110 ± 20, 2.5; Leonids 19, 0.55. "the slopes of most high inclination (i > 15°) streams have a characteristic value of B = 0.19±0.08"; "the median cross section of streams (0.08 AU) is similar to the 'rule of thumb' distance between comet orbit and Earth's orbit to give an observable stream"; sporadic rates normalised to "a canonical value of 10 meteors/hr", observed "average HR is around 9-9.5", annual peak-to-peak variation "only some 40% at +52N".
- **IMO Meteor Shower Calendar 2027** (Rendtel), https://www.imo.net/ShCal27s.pdf, Table 5 (activity, max, V∞ km/s, ZHR): Quadrantids Dec 28–Jan 12, 41, 80+; Lyrids Apr 14–Apr 30, 49, 18; η-Aquariids Apr 19–May 28, 66, 50; Perseids Jul 17–Aug 24, 59, 110+; Orionids Oct 02–Nov 07, 66, 20; Leonids Nov 06–Nov 30, 71, 15+; Geminids Dec 04–Dec 20, 35, 150; Ursids Dec 17–Dec 26, 33, 10. Quadrantids: "ZHR = 80 (can vary ≈ 60 − 200)", radio maximum "wider than the usually quoted 4 hours".
- **Reach, Kelley & Sykes 2007, Icarus 191, 298** (Spitzer comet trails), https://arxiv.org/abs/0704.2253. "Debris trails … were found along the orbits of 27 comets"; "The detection rate is > 80%, indicating that debris trails are a generic feature of short-period comets"; particles "typically mm-sized" or larger; "lower-limit masses … typically 10^11 g, and the median mass loss rate is 2 kg/s"; trail FWHM "median 27′′, range 7-78′′" and in physical units "median 5 × 10^5 km, range 0.9-15 × 10^5 km" as the text extracts, but Table 2's column is in 10⁴ km (values 1.8–12.4) and the angles agree with that (2P/Encke: 54.3″ at Δ = 2.0 AU, from φ = 323″ ↔ 47.1 × 10⁴ km, is 7.9 × 10⁴ km, as listed), so the median is 5 × 10⁴ km; "The trail lengths found in the IRAS survey were of order degrees (in mean anomaly)", e.g. 2P/Encke 5.4° ahead and 60° behind; Kresák 1993: "the width of debris trails matches the duration of meteor storms (less than an hour) but is less than that of showers (days)".
- **Meteor heights and speeds.** Madiedo et al. 2016, Icarus (Quadrantids), https://arxiv.org/abs/1604.06902, Table 2 (85 meteors, V∞ ≈ 42–44 km/s, Hb and He in km; 46 rows copied into `meteors.mjs`) and "the beginning height Hb of Quadrantid meteors was below 110 km … lower than … the Leonids, the Orionids and the Perseids", "this parameter was found to increase with increasing meteoroid mass". Madiedo et al. 2018, MNRAS (September ε-Perseids, V∞ ≈ 66 km/s), https://arxiv.org/abs/1807.06364, Table 2 (31 rows copied); "Hb is of below 110 km for a meteoroid mass of about 0.02 g … but ∼120 km for Perseid members with the same mass (Koten et al. 2004)"; "slower meteoroids tend to penetrate deeper". Madiedo et al. 2015, ρ-Geminids (V∞ ≈ 23 km/s), https://arxiv.org/abs/1502.06060, Table 2 (8 rows, bright events of 0.2–100 g).
- **Matlovič & Tóth 2020, "Meteors – light from comets and asteroids"**, https://arxiv.org/abs/2007.04041. Main spectrum "3500 - 5000 K", lines of "Fe I, Mg I, Na I, Ca I, Cr I, Mn I and Ca II"; second spectrum "nearly 10000 K", "Mg II, Si II, N I and O I", "strong in fast meteors while it can be absent in slow meteors with velocity of about 15 km s−1"; "N2 bands sometimes appear very early on the trajectory"; "The short-duration trains are formed by only one spectral line, the forbidden green auroral line of neutral atomic oxygen at 557.7 nm"; persistent trains' common line "the sodium doublet near 589.2 nm"; wake "duration is only fraction of a second"; "most meteoroids impact the Earth at low speeds (≈ 11–20 km s−1)"; unbound above "approximately 72 km s−1 (given by the sum of the escape speed from the solar system and orbital speed of Earth)". Madiedo et al. 2016 (above): "The line of atmospheric O I at 777.4 nm is very prominent", Ca II H and K "393.3 and 396.8 nm", "Mg I-2 triplet at 517.3 nm, and the Na I-1 doublet at 588.9 nm". Matlovič et al. 2019, A&A 629, A71, https://arxiv.org/abs/1908.01565: "The Na/Mg intensity ratio is dependent on meteor speed (temperature) as a result of the low excitation of Na I line (2.1 eV) compared to Mg I (5.1 eV) … observed for meteor speeds below 40 km s−1", "breaking point near 35 km s−1".
- **Brosch et al. 2004, MNRAS 355, 111**, https://arxiv.org/abs/astro-ph/0409186 (113 Leonid and sporadic video meteors): "The mean observed duration of a meteor trail was 0.33±0.15 sec with a maximal value of 1.28 sec."
- **Christou, Vaubaillon, Withers, Hueso & Killen 2019, "Extra-Terrestrial Meteors"** (in *Meteoroids: Sources of Meteors on Earth and Beyond*), https://arxiv.org/abs/2010.14647. "no direct optical detection of exo-meteors has been achieved to-date"; Spirit's 2005 candidate "was most likely a cosmic ray hit"; "Martian meteors ablate between altitudes of 90 and 50 km"; "the maximum brightness of martian meteors is reached ∼10 km lower … compared to terrestrial meteors", with ablation possibly "as high as 130–135 km"; fast low-density meteoroids "generate meteors of similar brightness" at Mars and Earth, slower denser ones "significantly fainter" at Mars; intensity law "Im ∝ m v^(3+n) / H"; Mars flux of −1 to +4 mag meteors "50% of that at the Earth"; "the meteoroid ablation rate peaks between 10^−9.2 and 10^−7 g cm−3, meteors would appear between 100 and 120 km in the venusian atmosphere"; Venusian meteors "as bright or brighter than at the Earth but also shorter-lived"; "The distance of the comet orbit to the planet orbit (∆) offers a necessary, but not sufficient, criterion" and fails for the Taurids, η-Aquariids and Orionids "where ∆ is of order 0.1 au or greater"; annual showers from Jupiter-family comets are "typically weak or non-existent"; "we expect more meteor showers at Mars than at Earth and Venus"; Leonids for a 60° +2 mag camera: "70 meteors per hr" from Earth's surface, "25" from Mars's; Mars surface cameras "several tens to a few hundreds of detections per hr" at dust optical depth 0.5, "a few per hr at best" at 3.0; Triton: "With a surface pressure of 1–2 Pa, it is not clear that Triton's atmosphere is sufficiently dense to ablate meteoroids before they impact the icy surface".
- **Flowers & Chyba 2021, Icarus** (Titan), https://arxiv.org/abs/2107.10336. Titan's meteoroids: "an average initial impact velocity … ∼ 8 km/s", tested "2 km/s – 18 km/s"; energy deposition peaks at the altitudes of the chemical anomalies (methane "between 950 to 1500 km"); "energy and mass deposition on Titan's leading edge … is typically hundreds of km higher than on its trailing edge".

### Lunar impact flashes

- **Suggs et al. 2014, Icarus 238, 23**, https://arxiv.org/abs/1404.6458. 126 flashes, "Flash magnitudes range from 10.42 to 5.07" (R), luminous energies "3.68×10³ J and 5.08×10⁵ J"; flux "1.03×10−7 meteoroids per hour per km² on the Moon to a limiting magnitude of 9.0" (N9.0 = 104 flashes, 266.88 h, A = 3.8×10⁶ km²); "the correlation of the peak rates with meteor showers is evident"; the 2013 March 17 flash: peak "R magnitude of 3.0 ± 0.4", "extremely long flash duration (approximately 1 second)".
- **Madiedo et al. 2015, A&A 577, A118** (Perseid flashes), https://arxiv.org/abs/1503.05227. 2013: "12 of these were confirmed", "visual magnitude of the flashes ranged between 6.6 and 9.3", masses "between 1.9 and 190 g", in "around 6.4 hours" over areas of "(5.6 ± 0.5)·10⁶ km² … (7.4 ± 0.7)·10⁶ km² … (5.1 ± 0.5)·10⁶ km²" per telescope, Perseid "ZHR of ∼ 100"; "short in duration (between 0.02 and 0.16 seconds)"; "most of them are contained in just one or two video frames" at 25 fps.
- **Bonanos et al. 2018, A&A 612, A76** (NELIOTA), https://arxiv.org/abs/1710.08915: flash temperatures "∼ 1,600 − 3,100 K", impactor masses "between ∼ 100 g and ∼ 50 kg". **Giancono et al. 2026** (high-speed), https://arxiv.org/abs/2606.07177: "The optical flash generated by a lunar impact typically lasts less than 100 milliseconds (A. Liakos et al. 2024)"; the vapour plume decays "on a timescale of less than one millisecond".

### Constants

NASA Planetary Fact Sheet (https://nssdc.gsfc.nasa.gov/planetary/factsheet/, raw table): Earth escape velocity 11.2 km/s, mean orbital velocity 29.8 km/s, orbital period 365.2 d, distance from the Sun 149.6 × 10⁶ km (= 1 AU, per the notes page); Mars surface pressure "6.36 mb" (marsfact); Pluto 0.00001 bar; Jupiter mass 1,898.13 × 10²⁴ kg; Sun mass 1,988,400 × 10²⁴ kg, radius 695,700 km, luminosity 382.8 × 10²⁴ W (sunfact); Moon radius 1737.4 km (moonfact). CODATA (physics.nist.gov): σ = 5.670374419 × 10⁻⁸ W m⁻² K⁻⁴, k = 1.380649 × 10⁻²³ J/K, mp = 1.67262192595 × 10⁻²⁷ kg, G = 6.67430 × 10⁻¹¹. CIE 1931 2° colour-matching functions from CVRL (http://www.cvrl.org/database/data/cmfs/ciexyz31_1.csv), as in `nebulas.md`.

## Measurements

Four scripts, run with `node` from a folder holding `cie.csv`.

### A. Protoplanetary discs (`discs.mjs`)

```js
// Protoplanetary discs: lifetimes, galactic census, inner rim, flaring, gaps. Sources in docs/research/dust.md.
const f = (x, d = 2) => Number(x).toFixed(d);
// 1. Exponential decay vs Haisch et al. 2001 Table 1 (age Myr, JHKL excess fraction)
const haisch = [['NGC 2024', 0.3, 0.85], ['Trapezium', 1.5, 0.80], ['IC 348', 2.3, 0.65], ['NGC 2264', 3.2, 0.52], ['NGC 2362', 5.0, 0.12], ['NGC 1960', 30, 0.03]];
console.log('cluster | age | measured | exp(-t/2.5) Mamajek | Ribas IRAC-short A·e^(-t/2.7)+C');
for (const [n, t, m] of haisch) console.log(`${n} | ${t} | ${f(m)} | ${f(Math.exp(-t / 2.5))} | ${f(0.60 * Math.exp(-t / 2.7) + 0.011)}`);
console.log('half-life ln2·τ: τ=2.5 →', f(Math.LN2 * 2.5), 'Myr; τ=1.2 (>1.3 M☉) →', f(Math.LN2 * 1.2), '; τ=3 (BDs) →', f(Math.LN2 * 3));
console.log('Mamajek eq.1 τdisk = -t/ln f: Upper Sco K stars 7/21 at 5 Myr →', f(-5 / Math.log(7 / 21)), 'Myr');
// 2. Fraction of Milky Way stars with a disc today. Licquia & Newman 2015: SFR 1.65 M☉/yr, M* 6.08e10 M☉ (Kroupa IMF).
// Kroupa 2001 IMF: dN/dm ∝ m^-α, α=0.3 (0.01-0.08), 1.3 (0.08-0.5), 2.3 (0.5-1), 2.3 (>1)
const seg = [[0.08, 0.5, 1.3], [0.5, 1, 2.3], [1, 120, 2.3]];
function imf(lo, hi) { // returns [N, M] integrals over stars (≥0.08 M☉), continuous at breaks
  let k = 1, N = 0, M = 0, prevA = null, prevB = null;
  for (const [a, b, al] of seg) {
    if (prevB !== null) k *= Math.pow(prevB, -prevA) / Math.pow(prevB, -al);
    const x0 = Math.max(a, lo), x1 = Math.min(b, hi);
    if (x1 > x0) {
      N += k * (Math.pow(x1, 1 - al) - Math.pow(x0, 1 - al)) / (1 - al);
      M += k * (Math.pow(x1, 2 - al) - Math.pow(x0, 2 - al)) / (2 - al);
    }
    prevA = al; prevB = b;
  }
  return [N, M];
}
const [Nall, Mall] = imf(0.08, 120), [Nlow, Mlow] = imf(0.08, 1);
const mImf = Mall / Nall, mOld = Mlow / Nlow;
console.log('\nKroupa mean stellar mass 0.08–120 M☉:', f(mImf, 3), '; 0.08–1 M☉ (long-lived survivors):', f(mOld, 3));
console.log('share of new stars by number >1 M☉:', f(imf(1, 120)[0] / Nall, 3), '; >2 M☉:', f(imf(2, 120)[0] / Nall, 3));
const SFR = 1.65, Mstar = 6.08e10;
const birthRate = SFR / mImf; // stars per yr
const Nnow = Mstar / mOld;     // ≈ stars alive now
for (const tau of [2.5e6, 4.4e6]) {
  const withDisc = birthRate * tau; // ∫ e^(-t/τ) dt over a constant birth rate = rate·τ
  const frac = withDisc / Nnow;
  console.log(`τ=${tau / 1e6} Myr: stars with discs ${withDisc.toExponential(2)} of ${Nnow.toExponential(2)} → fraction ${frac.toExponential(2)}; in a 4000-star galaxy: ${f(4000 * frac, 2)}`);
}
console.log('(mass-only estimate τ·SFR/M*, τ=2.5 Myr:', (2.5e6 * SFR / Mstar).toExponential(2), ')');
// 3. Dust sublimation radius (Dullemond & Monnier 2010 eq.1): R = sqrt(L/(4πσT^4)) = R*(T*/T)^2
const sigma = 5.670374419e-8, Lsun = 382.8e24, Rsun = 695700e3, AU = 149.6e9;
const Rrim = (L, T) => Math.sqrt(L / (4 * Math.PI * sigma * T ** 4)) / AU;
console.log('\nAB Aur (R*=2.4 R☉, T*=10000 K), Trim 1500 K →', f(2.4 * Rsun * (10000 / 1500) ** 2 / AU, 3), 'AU (paper: 0.5 AU)');
for (const T of [1500, 1000]) console.log(`L=1 L☉, Trim=${T} K → ${f(Rrim(Lsun, T), 3)} AU ×(L/L☉)^0.5`);
for (const L of [0.1, 1, 10, 50, 1000]) console.log(`  L=${L} L☉: Rrim(1500 K) = ${f(Rrim(L * Lsun, 1500), 3)} AU`);
// 4. Flaring: Chiang & Goldreich 1997 (T*=4000 K, M=0.5 M☉, R=2.5 R☉): Ti ≈ 150 a^-3/7 K, H/a ≈ 0.17 a^2/7 (photosphere, H≈4h)
const kB = 1.380649e-23, mp = 1.67262192595e-27, G = 6.6743e-11, Msun = 1988400e24;
console.log('\na(AU) | Ti(K) | h/a hydrostatic (μ=2.3) | H/a photosphere 0.17a^(2/7) | H/h');
for (const a of [1, 10, 30, 50, 84]) {
  const T = 150 * a ** (-3 / 7), cs = Math.sqrt(kB * T / (2.3 * mp)), vK = Math.sqrt(G * 0.5 * Msun / (a * AU));
  const h = cs / vK, H = 0.17 * a ** (2 / 7);
  console.log(`${a} | ${f(T, 0)} | ${f(h, 3)} | ${f(H, 3)} | ${f(H / h, 1)}`);
}
// 5. Kanagawa et al. 2016 gap width Δ/Rp = 0.41 (q)^1/2 (h)^-3/4 α^-1/4
const MJ = 1898.13e24 / Msun;
const kan = (q, h, al) => 0.41 * Math.sqrt(q) * h ** -0.75 * al ** -0.25;
console.log('\nMJ/M☉ =', MJ.toExponential(4));
console.log('case | q | h/r | α | Δ/R predicted | measured');
const cases = [['Kanagawa sim 0.3 MJ (h 0.05, α 1e-3, 1 M☉)', 0.3 * MJ, 0.05, 1e-3, '0.39'], ['Kanagawa sim 1.0 MJ', 1.0 * MJ, 0.05, 1e-3, '0.69'],
  ['HL Tau 10 AU gap, 1.4 MJ (their inversion)', 1.4 * MJ, 0.05, 1e-3, '0.81 (Rin 7, Rout 16.5)'], ['HL Tau 30 AU gap, 0.2 MJ', 0.2 * MJ, 0.07, 1e-3, '0.23'], ['HL Tau 80 AU gap, 0.5 MJ', 0.5 * MJ, 0.1, 1e-3, '0.29'],
  ['PDS 70 b, 5 MJ / 0.76 M☉, h 0.089, α 1e-3', 5 * MJ / 0.76, 0.089, 1e-3, 'CO gap 11 AU wide at 23 AU = 0.48; dust cavity to ~54-74 AU'], ['PDS 70 b, 9 MJ', 9 * MJ / 0.76, 0.089, 1e-3, '']];
for (const [n, q, h, al, m] of cases) console.log(`${n} | ${q.toExponential(2)} | ${h} | ${al} | ${f(kan(q, h, al))} | ${m}`);
console.log('PDS 70 b 5 MJ gap width in AU at 20.6 AU:', f(kan(5 * MJ / 0.76, 0.089, 1e-3) * 20.6, 1));
// 6. DSHARP gaps (Huang et al. 2018 Table 1, D features with measured widths and r0 in au)
const gaps = { 'AS 209': [[8.69, 4.7], [23.84, 3.4], [35.04, 3.0], [60.8, 15.5], [89.9, 4.5], [105.5, 14.7], [137, 4.2]], 'DoAr 25': [[98, 15.5], [125, 10]], 'Elias 20': [[25.07, 3.5], [33, 2.5]],
  'Elias 24': [[56.8, 22.8]], 'Elias 27': [[69.1, 14.3]], 'GW Lup': [[74.3, 12.1], [103, 4.3]], 'HD 142666': [[16, 3.5], [55, 2.2]], 'HD 143006': [[22, 21.7], [51, 12.8]],
  'HD 163296': [[10, 3.2], [48, 20.2], [86.4, 16.2], [145, 13.4]], 'IM Lup': [[117.4, 15.8]], 'RU Lup': [[29.1, 4.5]], 'SR 4': [[11, 6.3]], 'Sz 114': [[38.6, 4.3]], 'Sz 129': [[41, 4.1]], 'WaOph 6': [[79, 6.7]],
  'TW Hya': [[25.62, 4.0], [41.64, 3.4]], 'HL Tau': [[13.9, 5.7], [33.9, 4.9], [44, 3.2], [67.4, 4.4], [77.4, 6.1]] };
const allGaps = Object.values(gaps).flat(), wr = allGaps.map(([r, w]) => w / r).sort((a, b) => a - b), rr = allGaps.map(([r]) => r).sort((a, b) => a - b);
const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))];
console.log('\nDSHARP gaps with widths:', allGaps.length, 'in', Object.keys(gaps).length, 'discs; gap radius min/median/max', rr[0], q(rr, 0.5), rr.at(-1), 'AU');
console.log('width/r quartiles', f(q(wr, 0.25)), f(q(wr, 0.5)), f(q(wr, 0.75)), 'min', f(wr[0]), 'max', f(wr.at(-1)));
// all D labels per disc in Table 1 (count incl. V/R without widths)
const dCount = { 'AS 209': 7, 'DoAr 25': 3, 'DoAr 33': 1, 'Elias 20': 2, 'Elias 24': 2, 'Elias 27': 1, 'GW Lup': 2, 'HD 142666': 3, 'HD 143006': 2, 'HD 163296': 4, 'IM Lup': 1, 'MY Lup': 2, 'RU Lup': 4, 'SR 4': 1, 'Sz 114': 1, 'Sz 129': 2, 'WaOph 6': 1, 'WSB 52': 1 };
const dc = Object.values(dCount).sort((a, b) => a - b);
console.log('gaps per DSHARP disc (18 single discs):', dc.join(','), 'median', q(dc, 0.5), 'mean', f(dc.reduce((s, x) => s + x) / dc.length, 1));
const rdust = [139, 165, 27, 64, 136, 254, 105, 59, 82, 169, 264, 87, 63, 31, 58, 76, 103, 32].sort((a, b) => a - b);
console.log('DSHARP Rdust (95% flux) min/median/max:', rdust[0], q(rdust, 0.5), rdust.at(-1), 'AU');
console.log('HL Tau extent ~1960 mas at 140 pc → diameter', f(1.960 * 140, 0), 'AU, radius', f(1.960 * 140 / 2, 0), 'AU');
```

**Lifetimes.** An exponential e^(−t/τ) is a fair summary but no better: Mamajek's τ = 2.5 Myr fits his own 22 clusters (reduced χ² ≈ 2.5, "cluster-to-cluster variations"), and runs below Haisch's six clusters, whose own ages give τ = −t/ln f between 2.4 Myr (NGC 2362) and 4.9 Myr (NGC 2264). Longer wavelengths (outer disc) last longer: τ ≈ 4.4 Myr at 22–24 µm (Ribas 2015).

| Cluster | Age (Myr) | Measured (Haisch) | e^(−t/2.5) (Mamajek) | 0.60 e^(−t/2.7) + 0.011 (Ribas, 3.4–4.6 µm) |
|---|---|---|---|---|
| NGC 2024 | 0.3 | 0.85 | 0.89 | 0.55 |
| Trapezium | 1.5 | 0.80 | 0.55 | 0.36 |
| IC 348 | 2.3 | 0.65 | 0.40 | 0.27 |
| NGC 2264 | 3.2 | 0.52 | 0.28 | 0.19 |
| NGC 2362 | 5 | 0.12 | 0.14 | 0.11 |
| NGC 1960 | 30 | 0.03 | 0.00 | 0.01 |

Half-lives (ln 2 · τ): 1.73 Myr for τ = 2.5 (Mamajek's "≃ 1.7 Myr"), 0.83 Myr for stars > 1.3 M⊙ (τ ≈ 1.2), 2.1 Myr for brown dwarfs (τ ≈ 3). By mass: Herbig Ae/Be stars (> 2 M⊙) ≤ 5% at 3–15 Myr; at 5 Myr in Upper Sco, 0 of 92 stars > 1.3 M⊙ but 7 of 21 K stars (τ = 4.6 Myr by Mamajek's eq. 1); in Ribas 2015, 66% of low-mass (< 2 M⊙) against 36% of high-mass stars under 3 Myr, 8% against 2% over 3 Myr; by ~10 Myr none round high-mass stars and 10–15% of low-mass ones.

**How many stars have one now.** Stars are born at SFR/⟨m⟩ per year (Kroupa IMF, 0.08–120 M⊙, ⟨m⟩ = 0.579 M⊙), each keeping a disc for τ on average, so N_disc = (SFR/⟨m⟩)·τ. Stars alive ≈ M⋆ / ⟨m⟩ of the long-lived part of the IMF (0.08–1 M⊙, 0.286 M⊙), since nearly every star that ever formed above ~1 M⊙ in the old disc has died (an approximation; the present-day mass function itself is not sourced here).

| τ | Stars with discs | Stars alive | Fraction | In a 4000-star galaxy |
|---|---|---|---|---|
| 2.5 Myr (Mamajek) | 7.1 × 10⁶ | 2.1 × 10¹¹ | 3.4 × 10⁻⁵ | 0.13 |
| 4.4 Myr (Ribas 22–24 µm) | 1.25 × 10⁷ | 2.1 × 10¹¹ | 5.9 × 10⁻⁵ | 0.24 |

The cruder mass ratio τ·SFR/M⋆ gives 6.8 × 10⁻⁵ for τ = 2.5 Myr. Either way it's **a few in 10⁵**: a true-to-life 4000-star galaxy has a disc only one time in 4–8. "A realistic handful" (say 4–8) is ×20–60 the real rate, a deliberate exaggeration, like the rogue planets' 8 per 4000 stars. By number, 9.7% of new stars are above 1 M⊙ and 3.9% above 2 M⊙ (Kroupa), so most real discs circle M and K stars.

**Inner rim.** Dullemond & Monnier's eq. 1 reproduces their AB Aur example (0.496 AU against "0.5 AU"). For any star, R_rim = 0.069 AU · (L/L⊙)^½ at 1500 K and 0.155 AU at 1000 K (the observed range). So the user's "≈ 0.07 AU (L/L⊙)^0.5" checks out at 1500 K.

| L (L⊙) | 0.1 | 1 | 10 | 50 | 1000 |
|---|---|---|---|---|---|
| R_rim at 1500 K (AU) | 0.022 | 0.069 | 0.218 | 0.487 | 2.18 |

**Flaring** (Chiang & Goldreich's T Tauri disc: 0.5 M⊙, 4000 K). The gas scale height from their temperature, h/a = c_s/v_K with μ = 2.3 m_p, is 0.035 at 1 AU growing as a^(2/7); the visible surface sits ~4.9 h up (their "H/h = 4 … declines from about 5"), H/a = 0.17 a^(2/7), and reaches H ≈ a at 270 AU. PDS 70's model disc has h/r = 0.089 at 22 AU with index 0.25 (Keppler 2019), against 0.084 from the Chiang & Goldreich scaling at 22 AU (0.035 · 22^(2/7)): consistent.

| a (AU) | T (K) | h/a (gas) | H/a (surface) |
|---|---|---|---|
| 1 | 150 | 0.035 | 0.170 |
| 10 | 56 | 0.067 | 0.328 |
| 30 | 35 | 0.092 | 0.449 |
| 50 | 28 | 0.107 | 0.520 |
| 84 | 22 | 0.124 | 0.603 |

**Gap widths** (Kanagawa eq. 4). The independent check is their own simulations (0.37 against 0.39, 0.67 against 0.69, within 5%); the HL Tau rows are a round trip (they inverted the measured widths into masses), which confirms the formula is implemented as published. PDS 70 b is the test that fails: 5–9 MJ at 20.6 AU (h 0.089, α 10⁻³) predicts a gap 1.1–1.5 × R wide (23–31 AU), but the CO gap is ~11 AU wide (0.48 R) while the dust is cleared all the way out to the ring at 54 AU (scattered light) and 74 AU (mm), which Keppler et al. say one planet can't do; the second planet c at 34.5 AU carves the rest. So: one planet carves a gap 0.2–0.8 × its radius wide; a wide cavity needs several planets.

| Case | q = Mp/M∗ | h/r | α | Δ/R predicted | Measured |
|---|---|---|---|---|---|
| Kanagawa sim, 0.3 MJ | 2.86 × 10⁻⁴ | 0.05 | 10⁻³ | 0.37 | 0.39 |
| Kanagawa sim, 1.0 MJ | 9.55 × 10⁻⁴ | 0.05 | 10⁻³ | 0.67 | 0.69 |
| HL Tau 10 AU gap (1.4 MJ) | 1.34 × 10⁻³ | 0.05 | 10⁻³ | 0.80 | 0.81 (7–16.5 AU) |
| HL Tau 30 AU gap (0.2 MJ) | 1.91 × 10⁻⁴ | 0.07 | 10⁻³ | 0.23 | 0.23 |
| HL Tau 80 AU gap (0.5 MJ) | 4.77 × 10⁻⁴ | 0.10 | 10⁻³ | 0.28 | 0.29 |
| PDS 70 b, 5 MJ (0.76 M⊙) | 6.28 × 10⁻³ | 0.089 | 10⁻³ | 1.12 | CO gap 0.48; dust cleared to 54–74 AU |
| PDS 70 b, 9 MJ | 1.13 × 10⁻² | 0.089 | 10⁻³ | 1.50 | (same) |

**Rings and gaps in real discs.** HL Tau (ALMA): 7 dark rings at 13.2, 32.3, ~42, ~50, 64.2, 73.7 and ~91 AU between bright rings at 20.4, 38.1, ~47, ~55, 68.8, 81.3 and ~97 AU, each 5–8 AU wide; dust out to ~137 AU (1960 mas at 140 pc), 120 AU in older data. DSHARP (Huang Table 1, 18 single discs): gaps per disc 1,1,1,1,1,1,1,2,2,2,2,2,2,3,3,4,4,7 (median 2, mean 2.2); over 36 gaps with measured widths (DSHARP plus HL Tau and TW Hya) the gap radius runs 8.7–145 AU (median 48), width/r quartiles 0.08 / 0.14 / 0.22 (0.03–0.99), and dust radii (95% of the flux) 27–264 AU (median 82). DSHARP picked large, bright discs: a typical disc (0.3 M⊙ host) has R_eff ≈ 10–20 AU, and Orion's discs near θ¹ Ori C peak at 10–30 AU with few beyond 35 AU. Huang's widths are measured differently from Kanagawa's Σ < Σ0/2 (HL Tau's inner gap: 5.7 AU in DSHARP, 9.5 AU in Kanagawa).

### Colours in scattered light and of meteors (`colours.mjs`)

Same CIE method as `nebulas.md`: starlight (Planck) times reflectivity ∝ (λ/550 nm)^η, summed 380–780 nm, to sRGB. Ma et al.'s η is measured at 0.6–2.2 µm in polarized light; using it across the visible band is an extrapolation.

```js
// sRGB of dust-scattered starlight (reflectivity ∝ λ^η, Ma, Schmid & Stolker 2024) and of meteor emission. Method as docs/research/nebulas.md.
import fs from 'node:fs';
const cmf = new Map(fs.readFileSync('cie.csv', 'utf8').trim().split('\n').map((l) => { const [w, x, y, z] = l.split(',').map(Number); return [w, [x, y, z]]; }));
const at = (nm) => { const a = Math.floor(nm), t = nm - a; const p = cmf.get(a), q = cmf.get(a + 1); return p.map((v, i) => v + (q[i] - v) * t); };
function toHex([X, Y, Z]) {
  let rgb = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
  const min = Math.min(...rgb);
  if (min < 0) { const k = Y / (Y - min); rgb = rgb.map((c) => Y + (c - Y) * k); }
  const m = Math.max(...rgb);
  const enc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  return '#' + rgb.map((c) => Math.round(enc(Math.max(0, c / m)) * 255).toString(16).padStart(2, '0')).join('');
}
const h = 6.62607015e-34, c = 2.99792458e8, kB = 1.380649e-23;
const planck = (nm, T) => { const l = nm * 1e-9; return 1 / (l ** 5 * (Math.exp((h * c) / (l * kB * T)) - 1)); };
const spec = (fn) => { const s = [0, 0, 0]; for (let nm = 380; nm <= 780; nm++) at(nm).forEach((v, i) => (s[i] += v * fn(nm))); return s; };
console.log('star T | starlight | dust η=0 (grey) | η=+0.5 | η=+1 (red) | η=+2 (LkCa 15-like) | η=-0.5 (blue limit)');
for (const T of [4000, 5772, 10000]) {
  const row = [null, 0, 0.5, 1, 2, -0.5].map((eta) => toHex(spec((nm) => planck(nm, T) * (eta === null ? 1 : Math.pow(nm / 550, eta)))));
  console.log(`${T} K | ${row.join(' | ')}`);
}
console.log('\nMeteor emission:');
const lines = { 'Na I 588.9': 588.9, 'Mg I 516.7/517.3': 517.0, 'O I 557.7 (green line)': 557.7, 'Ca II 393.3': 393.3, 'Fe I 526.9': 526.9, 'Fe I 441.5': 441.5 };
for (const [n, nm] of Object.entries(lines)) console.log(`${n} nm | ${toHex(at(nm))}`);
for (const T of [3500, 4500, 5000, 10000]) console.log(`main/second spectrum continuum-equivalent black body ${T} K | ${toHex(spec((nm) => planck(nm, T)))}`);
const mix = (list) => list.reduce((s, [nm, w]) => at(nm).map((v, i) => s[i] + v * w), [0, 0, 0]);
console.log('Na:Mg 1:1 |', toHex(mix([[588.9, 1], [517, 1]])), '; Na:Mg 2:1 (slow) |', toHex(mix([[588.9, 2], [517, 1]])), '; Na:Mg 0.5:1 (fast) |', toHex(mix([[588.9, 0.5], [517, 1]])));
```

| Star | Starlight | Grey dust η = 0 | η = 0.5 | Red dust η = 1 | Very red η = 2 | η = −0.5 |
|---|---|---|---|---|---|---|
| 4000 K (T Tauri) | `#ffd3a5` | `#ffd3a5` | `#ffcc97` | `#ffc58b` | `#ffb873` | `#ffdbb4` |
| 5772 K (Sun) | `#fff1ea` | `#fff1ea` | `#ffe8d7` | `#ffe0c6` | `#ffd1a7` | `#fff9fe` |
| 10000 K (Herbig Ae) | `#cdd9ff` | `#cdd9ff` | `#dfe4ff` | `#f2efff` | `#ffebe4` | `#bccfff` |

So a T Tauri disc (grey, −0.5 < η < 0.5) is the colour of its star's light, warm orange-white; a Herbig disc (red, η ≈ 0.5–1) turns its blue-white star's light near white or faintly warm. The light is faint: polarized reflectivity 0.1–1% of the starlight.

| Meteor light | sRGB |
|---|---|
| Na I 588.9 nm | `#ff8a00` |
| Mg I 517 nm | `#00ffae` |
| O I 557.7 nm (short trains) | `#92ff00` |
| Fe I 526.9 / 441.5 nm | `#00ff9c` / `#7e00ff` |
| Ca II 393.3 nm | `#8e00ff` (near the edge of vision) |
| Main spectrum as a 3500 / 4500 / 5000 K black body | `#ffc78b` / `#ffdebc` / `#ffe6d0` |
| Na : Mg = 2 : 1 / 1 : 1 / 0.5 : 1 | `#ffd400` / `#e0ff00` / `#6bff00` |

The line mixes are only a trend: Na is relatively stronger below ~35–40 km/s, and fast meteors add the hot second spectrum (Mg II, O I, N I, N₂) and a green 557.7 nm train. Slow meteors lean yellow-orange, fast ones white-green. The true Na : Mg : Fe intensities per speed were not taken from a source (open question).

### B. Debris discs and the zodiacal cloud (`debris.mjs`)

```js
// Debris discs and the zodiacal cloud. Sources in docs/research/dust.md.
const f = (x, d = 2) => Number(x).toFixed(d);
// 1. Incidence per spectral type (DEBRIS: Thureau 2014, Sibthorpe 2018, Lestrade 2025 Table 1; DUNES: Montesinos 2016)
const debris = [['A', 21, 86], ['F', 22, 92], ['G', 13, 91], ['K', 12, 92], ['M', 2, 94]];
console.log('type | DEBRIS detections/targets | rate');
for (const [t, d, n] of debris) console.log(`${t} | ${d}/${n} | ${f(100 * d / n, 1)}%`);
const all = debris.reduce((s, [, d, n]) => [s[0] + d, s[1] + n], [0, 0]);
console.log('all DEBRIS A–M:', `${all[0]}/${all[1]} = ${f(100 * all[0] / all[1], 1)}%`);
// weight by number of stars in the galaxy: Kroupa IMF share is dominated by M dwarfs (see discs.mjs); per-type weights unverified, so only bounds:
console.log('FGK only (DEBRIS):', f(100 * 47 / 275, 1), '%; DUNES FGK within 15 pc: 23/105 =', f(100 * 23 / 105, 1), '%');
// 2. Kelsall et al. 1998 smooth cloud: n = n0 R^-α f(ζ), ζ=|z/R|, f = exp(-β g^γ), g = ζ²/2μ (ζ<μ) else ζ-μ/2
const n0 = 1.13e-7, alpha = 1.34, beta = 4.14, gamma = 0.942, mu = 0.189;
const g = (z) => (z < mu ? (z * z) / (2 * mu) : z - mu / 2), fz = (z) => Math.exp(-beta * Math.pow(g(z), gamma));
let lo = 0, hi = 2; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; fz(m) > 0.5 ? (lo = m) : (hi = m); }
console.log('\nfan model half-density height ζ½ = z/R =', f(lo, 3), '→ half-opening angle', f(Math.atan(lo) * 180 / Math.PI, 1), '°; f(0.1)=', f(fz(0.1), 3), 'f(0.3)=', f(fz(0.3), 3), 'f(0.5)=', f(fz(0.5), 3));
// column (face-on) ∝ ∫ n dz = n0 R^-α · R ∫ f(ζ) dζ  → ∝ R^(1-α); scattered surface brightness ∝ column · R^-2 → R^(-1-α)
let I = 0; for (let z = -3; z <= 3; z += 1e-4) I += fz(Math.abs(z)) * 1e-4;
console.log('∫f(ζ)dζ =', f(I, 3), '→ face-on optical-depth slope R^', f(1 - alpha, 2), '; scattered brightness slope R^', f(-1 - alpha, 2), '; thermal (T∝R^-0.5, Wien-ish) steeper');
console.log('R (AU) | density rel. 1 AU | face-on column rel. | face-on scattered brightness rel.');
for (const R of [0.1, 0.3, 1, 2, 3, 5.2]) console.log(`${R} | ${f(R ** -alpha, 3)} | ${f(R ** (1 - alpha), 3)} | ${f(R ** (-1 - alpha), 3)}`);
// 3. Zodiacal light vs sky: STIS handbook table (Leinert 1998), V mag/arcsec²
const zl = { 'pole': 23.3, 'ecliptic, 90° elong.': 21.9, 'ecliptic, anti-sun 180°': 22.0, '(50°,0) bright': 20.9, 'ecliptic 60°': 21.2 };
for (const [k, m] of Object.entries(zl)) console.log(`ZL ${k}: ${m} mag/arcsec² = ${f(10 ** (-0.4 * (m - 23.3)), 1)}× the polar value`);
// 4. Belt temperatures and radii: T = 278.3 L^0.25 R^-0.5 (Sibthorpe 2018; Matrà 2025 eq.3); warm/cold ratio 2–4 (Kennedy & Wyatt 2014)
const Rbb = (T, L) => (278.3 / T) ** 2 * Math.sqrt(L);
console.log('\nblackbody radius: 50 K, 1 L☉ →', f(Rbb(50, 1), 1), 'AU; 150 K →', f(Rbb(150, 1), 1), 'AU; radius ratio for T ratio 2/3/4:', [2, 3, 4].map((x) => x * x).join('/'));
console.log('Fomalhaut belt: inner edge 136.3 AU, FWHM 13.5 AU → ΔR/R ≈', f(13.5 / 136.3, 3), '(paper 0.10 ± 0.01); Kuiper belt synthetic 12/43 =', f(12 / 43, 2), '(paper 0.28)');
```

| Type | DEBRIS detections / targets | Rate | DUNES (≤ 15 pc) |
|---|---|---|---|
| A | 21 / 86 | 24% | – |
| F | 22 / 92 | 24% | 26% (6/23) |
| G | 13 / 91 | 14% | 21% (7/33) |
| K | 12 / 92 | 13% | 20% (10/49) |
| M | 2 / 94 | 2% (shallower survey) | – |
| All | 70 / 455 | 15% | 22% (23/105, FGK) |

These are detections at Herschel's sensitivity (most detected discs at f ∼ 10⁻⁵; DUNES's upper limits 4 × 10⁻⁷–2 × 10⁻⁶), so fainter belts are missed, and REASONS quotes "at least ∼17–33%" for cold belts. The user's ~20% of systems sits in the measured range for A–K stars; weighted by the galaxy's mostly-M population the detectable rate is lower (the M-dwarf rate is uncertain: Lestrade et al. argue it need not drop at equal depth).

**Zodiacal cloud (Kelsall fan model).** Density n ∝ R^−1.34 f(z/R): the vertical profile halves at z/R = 0.244 (a 13.7° half-opening fan; f = 0.87 at z/R = 0.1, 0.39 at 0.3, 0.17 at 0.5), so the cloud thickens in proportion to the distance. Seen face-on, the column ∝ R^(1−α) = R^−0.34, and the scattered sunlight per area ∝ column × R⁻² = **R^−2.34**:

| R (AU) | Density | Face-on column | Face-on scattered brightness |
|---|---|---|---|
| 0.1 | 21.9 | 2.19 | 219 |
| 0.3 | 5.02 | 1.51 | 16.7 |
| 1 | 1 | 1 | 1 |
| 2 | 0.395 | 0.790 | 0.198 |
| 3 | 0.229 | 0.688 | 0.076 |
| 5.2 (model cutoff) | 0.110 | 0.571 | 0.021 |

From Earth (STIS handbook, Leinert 1998): 23.3 V mag arcsec⁻² at the ecliptic pole, 21.9 in the ecliptic 90° from the Sun (3.6× the pole), 21.2 at 60° (6.9×), 20.9 at (50°, 0) (9.1×), and 22.0 opposite the Sun (3.3×): brighter towards the Sun and the ecliptic, a factor of ~3 over most of the sky, and slightly redder than sunlight.

**Belts.** T = 278.3 K · L^¼ R^−½ (blackbody): a 50 K belt round the Sun at 31 AU, a 150 K warm belt at 3.4 AU; the observed warm/cold temperature ratio 2–4 means radii 4–16× apart ("a factor of about ten"). Fomalhaut: 13.5/136.3 = 0.099 (paper 0.10), a narrow ring; the Kuiper belt as ALMA would see it: 43 AU, FWHM 12 AU (0.28); but most resolved belts are broad (median ΔR/R 0.71, 70% above 0.5) and large (65 of 74 beyond 60 AU, a selection effect of resolving them).

### C. Meteors, showers, flashes and trails (`meteors.mjs`)

```js
// Meteor showers, meteors, lunar flashes, trails. Sources in docs/research/dust.md.
const f = (x, d = 2) => Number(x).toFixed(d);
const YEAR = 365.2, VE = 29.8, AUkm = 149.6e6; // NASA fact sheet: Earth orbital period (d), mean orbital velocity (km/s), AU
const dayPerDeg = YEAR / 360;
// 1. Jenniskens 1994: ZHR = ZHRmax 10^(-B|λ-λmax|). FWHM = log10(2)/B+ + log10(2)/B-  (degrees of solar longitude)
const showers = [ // name, B+, B-, ZHRmax (J94), IMO 2027 activity (days), IMO ZHR, V∞
  ['Quadrantids (J94 "Boo")', 1.8, 1.8, 133, [12 + 3 + 1, 'Dec 28–Jan 12'], 80, 41],
  ['Perseids', 0.20, 0.20, 84, [39, 'Jul 17–Aug 24'], 110, 59],
  ['Perseids main peak (J94 Table 3c)', 0.35, 0.35, 70, null, null, 59],
  ['Geminids', 0.39, 0.72, 88, [17, 'Dec 04–Dec 20'], 150, 35],
  ['Leonids', 0.39, 0.39, 23, [25, 'Nov 06–Nov 30'], 15, 71],
  ['Orionids', 0.12, 0.12, 25, [37, 'Oct 02–Nov 07'], 20, 66],
  ['η-Aquariids', 0.080, 0.080, 36.7, [40, 'Apr 19–May 28'], 50, 66],
  ['Ursids', 0.61, 0.61, 11.8, [10, 'Dec 17–Dec 26'], 10, 33],
  ['Lyrids', 0.22, 0.22, 12.8, [17, 'Apr 14–Apr 30'], 18, 49],
];
console.log('shower | B (+/−) | FWHM (° λ☉) | FWHM (days) | FWHM fraction of orbit | width along Earth path (AU) | IMO activity (days) | activity fraction | ZHR J94 / IMO | V∞ km/s');
for (const [n, bp, bm, z, act, zi, v] of showers) {
  const fw = Math.log10(2) / bp + Math.log10(2) / bm, d = fw * dayPerDeg;
  const wAU = d * 86400 * VE / AUkm;
  console.log(`${n} | ${bp}/${bm} | ${f(fw, 2)} | ${f(d, 2)} | ${(fw / 360).toExponential(1)} | ${f(wAU, 3)} | ${act ? act[0] + ' (' + act[1] + ')' : '–'} | ${act ? f(act[0] / YEAR, 3) : '–'} | ${z} / ${zi ?? '–'} | ${v}`);
}
console.log('Typical high-inclination minor stream B = 0.19 → FWHM', f(2 * Math.log10(2) / 0.19, 2), '° =', f(2 * Math.log10(2) / 0.19 * dayPerDeg, 1), 'days');
console.log('1 day of Earth motion =', f(86400 * VE / AUkm, 4), 'AU; J94 median stream cross-section 0.08 AU =', f(0.08 * AUkm / VE / 86400, 1), 'days of crossing');
// Activity above sporadic: days with ZHR > 10 (canonical sporadic HR) for a peak ZHRmax and slope B: |Δλ| < log10(Z/10)/B
for (const [n, bp, bm, z] of showers.slice(0, 7)) if (z > 10) console.log(`${n}: ZHR > sporadic 10/h for ${f((Math.log10(z / 10) / bp + Math.log10(z / 10) / bm) * dayPerDeg, 1)} days`);
// 2. Meteor heights (Madiedo et al. 2016 Quadrantids V∞≈43 km/s; Madiedo et al. 2018 SPE ≈66 km/s; Madiedo et al. 2015 ρ-Geminids ≈23 km/s)
const qua = `104.8 89.1;100.3 88.4;109.3 99.8;103.7 81.2;99.7 82.0;104.6 86.6;100.6 86.5;107.8 83.4;97.2 87.5;103.4 80.3;102.7 87.4;100.5 83.6;102.7 81.7;100.4 91.3;102.9 84.1;97.8 86.8;95.0 89.0;97.8 85.1;96.6 89.5;98.9 88.2;107.1 80.0;97.1 84.2;99.0 91.8;93.9 93.5;101.2 85.0;111.2 88.5;96.9 84.9;103.2 86.3;101.5 93.6;107.5 93.4;99.5 89.6;105.8 86.1;96.6 86.3;99.0 88.8;93.9 84.0;104.2 83.4;108.0 70.4;103.6 71.2;100.1 77.2;100.8 84.0;99.8 84.8;103.3 96.8;100.3 85.8;105.8 85.4;101.8 67.1;103.8 89.3`;
const spe = `109.4 88.0;109.5 100.6;116.6 99.5;111.2 90.5;112.1 95.6;113.3 92.0;109.9 91.4;109.5 98.8;113.9 87.6;115.6 101.8;114.1 90.1;107.6 96.9;110.4 89.8;115.4 84.4;105.5 89.0;111.0 95.4;113.3 97.6;101.1 96.8;109.9 95.4;107.6 97.2;116.1 94.8;116.6 105.0;114.3 85.1;101.7 97.1;101.5 96.9;115.2 88.1;118.2 87.3;105.1 95.9;112.9 97.2;116.7 95.2;100.5 96.3`;
const rgem = `92.6 60.0;94.5 53.1;91.8 78.5;96.3 55.2;94.0 62.5;90.6 64.1;93.2 72.5;90.3 55.3`;
const stats = (s) => { const r = s.split(';').map((x) => x.split(' ').map(Number)); const hb = r.map((x) => x[0]), he = r.map((x) => x[1]), dh = r.map((x) => x[0] - x[1]);
  const med = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)]; return [r.length, Math.min(...hb), med(hb), Math.max(...hb), Math.min(...he), med(he), Math.max(...he), med(dh)]; };
console.log('\nstream (V∞) | n | Hb min/med/max km | He min/med/max km | median Hb−He km | duration at 45° entry: L=Δh/sin45, t=L/V');
for (const [n, s, v] of [['ρ-Geminids (23)', rgem, 23], ['Quadrantids (43)', qua, 43], ['Sep ε-Perseids (66)', spe, 66]]) {
  const [k, a, b, c, d, e, g, dh] = stats(s); const L = dh / Math.sin(Math.PI / 4);
  console.log(`${n} | ${k} | ${a}/${b}/${c} | ${d}/${e}/${g} | ${f(dh, 1)} | L≈${f(L, 0)} km, t≈${f(L / v, 2)} s`);
}
// 3. Geocentric speed: V∞² = Vg² + Vesc² (Vesc at ~100 km ≈ 11.2·sqrt(6371/6471)); vector Vg = Vh − V⊕
const vesc = 11.2 * Math.sqrt(6371 / 6471);
for (const [n, vinf, vg, vh] of [['Q40800', 43.7, 42.0, 38.8], ['ρGem 030112', 23.5, 20.9, 38.1], ['SPE 011301', 66.2, 65.2, null]]) {
  const pred = Math.sqrt(vg * vg + vesc * vesc); let ang = '';
  if (vh) { const c = (vh * vh + VE * VE - vg * vg) / (2 * vh * VE); ang = `, angle(Vh, V⊕) = ${f(Math.acos(c) * 180 / Math.PI, 0)}°`; }
  console.log(`${n}: sqrt(Vg²+Vesc²) = ${f(pred, 1)} vs V∞ ${vinf} km/s${ang}`);
}
console.log('speed limits: 11.2 (Earth escape, NASA) to', f(42.1 + VE, 1), 'km/s (sun-escape at 1 AU 42.1 + 29.8 head-on); review quotes ≈72');
console.log('heliocentric escape at 1 AU: sqrt(2)·29.8 =', f(Math.SQRT2 * VE, 1), 'km/s');
// 4. Ablation density 10^-9.2..10^-7 g/cm³ (Christou et al. 2019) → pressure for an N2/O2 atmosphere at 200 K
const kB = 1.380649e-23, mp = 1.67262192595e-27;
for (const rho of [10 ** -9.2, 1e-7]) console.log(`ρ = ${rho.toExponential(1)} g/cm³ → P(200 K, μ=29) = ${f(rho * 1e3 * kB * 200 / (29 * mp), 3)} Pa`);
// 5. Lunar flashes (Suggs 2014: 104 flashes ≤ R 9.0 in 266.88 h over 3.8e6 km²; Madiedo 2015: 12 Perseid flashes in 6.4 h, ~5–7.4e6 km² per telescope)
const fl = 104 / 266.88 / 3.8e6; console.log('\nSuggs flux:', fl.toExponential(3), 'km⁻² h⁻¹ (paper 1.03e-7); over a lunar hemisphere (2π·1737.4²) =', f(fl * 2 * Math.PI * 1737.4 ** 2, 2), 'flashes/h; whole Moon', f(fl * 4 * Math.PI * 1737.4 ** 2, 2), '/h');
for (const A of [5.1e6, 7.4e6]) console.log(`Perseids 2013 (Madiedo): 12/6.4 h/${A.toExponential(1)} km² = ${(12 / 6.4 / A).toExponential(2)} km⁻² h⁻¹ → ×${f(12 / 6.4 / A / fl, 1)} the mean`);
// 6. Comet trails (Reach et al. 2007): median FWHM 5e4 km (range 0.9–15e4)
for (const w of [0.9e4, 5e4, 15e4]) console.log(`trail width ${w.toExponential(1)} km = ${(w / AUkm).toExponential(2)} AU; Earth crosses in ${f(w / VE / 3600, 2)} h`);
```

**Shower durations.** ZHR = ZHRmax · 10^(−B|Δλ⊙|) halves at |Δλ⊙| = log₁₀2 / B, so FWHM = log₁₀2 (1/B₊ + 1/B₋) degrees of solar longitude, × 365.2/360 days. Width along Earth's path = days × 29.8 km/s.

| Shower | B (deg⁻¹) | FWHM (°) | FWHM (days) | FWHM / orbit | Width (AU) | IMO activity (days) | Activity / orbit | ZHR J94 / IMO 2027 | V∞ (km/s) |
|---|---|---|---|---|---|---|---|---|---|
| Quadrantids | 1.8 | 0.33 | 0.34 | 9.3 × 10⁻⁴ | 0.006 | 16 | 0.044 | 133 / 80 | 41 |
| Perseids (whole) | 0.20 | 3.01 | 3.05 | 8.4 × 10⁻³ | 0.053 | 39 | 0.107 | 84 / 110 | 59 |
| Perseids (main peak) | 0.35 | 1.72 | 1.75 | 4.8 × 10⁻³ | 0.030 | – | – | 70 / – | 59 |
| Geminids | 0.39 / 0.72 | 1.19 | 1.21 | 3.3 × 10⁻³ | 0.021 | 17 | 0.047 | 88 / 150 | 35 |
| Leonids | 0.39 | 1.54 | 1.57 | 4.3 × 10⁻³ | 0.027 | 25 | 0.068 | 23 / 15 | 71 |
| Orionids | 0.12 | 5.02 | 5.09 | 1.4 × 10⁻² | 0.088 | 37 | 0.101 | 25 / 20 | 66 |
| η-Aquariids | 0.080 | 7.53 | 7.63 | 2.1 × 10⁻² | 0.131 | 40 | 0.110 | 36.7 / 50 | 66 |
| Ursids | 0.61 | 0.99 | 1.00 | 2.7 × 10⁻³ | 0.017 | 10 | 0.027 | 11.8 / 10 | 33 |
| Lyrids | 0.22 | 2.74 | 2.78 | 7.6 × 10⁻³ | 0.048 | 17 | 0.047 | 12.8 / 18 | 49 |

A typical high-inclination minor stream (B = 0.19) has a FWHM of 3.2 days. Days with ZHR above the ~10/h sporadic background: Quadrantids 1.3, Leonids 1.9, Geminids 3.8, Orionids 6.7, Perseids 9.4, η-Aquariids 14.3. So a major shower is noticeable for ~1–15 days (0.3–4% of the orbit), peaks over 0.3–8 days (0.1–2%), and is listed as active for 10–40 days (3–11%). The Quadrantid FWHM from J94 (8 h) is twice the IMO's "usually quoted 4 hours". The 0.08 AU median stream cross-section (J94) is 4.6 days of Earth's motion; streams with low inclination are wider along the orbit.

**Heights and durations.** Faster meteors start and end higher:

| Stream (V∞) | n | Begin height min / median / max (km) | End height (km) | Median length of path, vertical (km) | At 45° entry: path, duration |
|---|---|---|---|---|---|
| ρ-Geminids (23 km/s, bright, 0.2–100 g) | 8 | 90.3 / 93.2 / 96.3 | 53.1 / 62.5 / 78.5 | 32.6 | 46 km, 2.0 s |
| Quadrantids (43 km/s) | 46 | 93.9 / 101.2 / 111.2 | 67.1 / 86.3 / 99.8 | 15.0 | 21 km, 0.49 s |
| September ε-Perseids (66 km/s) | 31 | 100.5 / 111.2 / 118.2 | 84.4 / 95.4 / 105 | 16.5 | 23 km, 0.35 s |

Perseids of 0.02 g begin near 120 km (Koten et al. 2004 via Madiedo 2018). Video meteors last 0.33 ± 0.15 s, at most 1.28 s (Brosch 2004), matching the 45° estimates for fast meteors; slow bright ones last ~2 s. Speeds run from 11.2 km/s (Earth's escape speed, NASA) to 71.9 km/s (the Sun's escape speed at 1 AU, √2 × 29.8 = 42.1, plus Earth's 29.8 head-on; the review's "≈ 72"); most sporadic meteoroids hit at 11–20 km/s.

**Radiant and speed.** The meteoroids of a stream move in parallel, so their trails, seen in perspective, diverge from one point, the radiant: the direction the meteoroids come from relative to the planet, V_g = V_h − V_planet (heliocentric stream velocity minus the planet's orbital velocity), then sped up by the planet's gravity, V∞² = V_g² + V_esc². Checked against measured meteors (V_esc at 100 km = 11.11 km/s):

| Meteor | √(V_g² + V_esc²) | V∞ measured | Angle between V_h and Earth's velocity |
|---|---|---|---|
| Quadrantid Q40800 (V_g 42.0, V_h 38.8) | 43.4 | 43.7 | 74° |
| ρ-Geminid 030112 (V_g 20.9, V_h 38.1) | 23.7 | 23.5 | 33° (catching up from behind) |
| September ε-Perseid 011301 (V_g 65.2) | 66.1 | 66.2 | – |

(The published V_g also includes zenith attraction and the observer's rotation, hence the 0.2–0.3 km/s differences.)

**How thin an atmosphere still makes meteors.** Meteors light up where the air density is 10^−9.2 to 10^−7 g cm⁻³ (Christou et al. 2019); for N₂/O₂ at 200 K that's 0.036–5.7 Pa. A body whose surface pressure is below a few hundredths of a pascal has no meteors at all; Earth (10⁵ Pa), Venus (9.2 × 10⁶ Pa), Titan and Mars (636 Pa) burn them up high; Triton and Pluto (~1 Pa, 10⁻⁵ bar) are marginal ("not clear", Christou) and their slow impactors (a few km/s) would be faint (I ∝ v^(3+n)). Heights: Earth ~55–120 km (begin 90–120, end 53–105 in the tables above), Mars 50–90 km (peak ~10 km lower than Earth's), Venus 100–120 km (above the haze), Titan hundreds of km to ~1500 km at ~8 km/s.

**Lunar impact flashes.** 104 flashes brighter than R = 9 in 266.88 h over 3.8 × 10⁶ km²: 1.03 × 10⁻⁷ km⁻² h⁻¹ (matches the paper), i.e. **~2 flashes per hour over a lunar hemisphere** and ~4 over the whole Moon. During the 2013 Perseids (ZHR ~100), 12 flashes in 6.4 h over 5.1–7.4 × 10⁶ km² is 2.5–3.7× that. Flashes last 0.02–0.16 s (one or two video frames; mostly < 100 ms), a big one ~1 s; peak R magnitudes 5–10 (one of 3.0); 1600–3100 K.

**Comet dust trails.** Spitzer: > 80% of Jupiter-family comets have one; widths 0.9–15 × 10⁴ km (median 5 × 10⁴ km = 3.3 × 10⁻⁴ AU), which Earth crosses in 0.08–1.4 h (0.5 h median): the length of a meteor storm ("less than an hour"), against days for the annual stream. Trails stretch degrees to tens of degrees of mean anomaly along the orbit (Encke: 5.4° ahead, 60° behind).

### Summary of the numbers to build on

| What | Value | Source |
|---|---|---|
| Disc fraction vs age | e^(−t/τ), τ ≈ 2.5 Myr (half-life 1.7 Myr); ~6 Myr until nearly all gone, a few % to 10–20 Myr | Mamajek 2009, Haisch 2001, Ribas 2014 |
| By mass | τ ≈ 1.2 Myr above 1.3 M⊙, ≈ 3 Myr for brown dwarfs; Herbig Ae/Be (> 2 M⊙) ≤ 5% at 3–15 Myr; ~2× faster dispersal above 2 M⊙ | Mamajek 2009, Ribas 2015 |
| Share of stars with a disc now | 3–7 × 10⁻⁵ (0.1–0.3 per 4000 stars) | computed (Licquia & Newman 2015, Kroupa 2001) |
| Near O stars | proplyds within ~1 pc of an O6 star (and round B stars), mass loss 10⁻⁷–10⁻⁶ M⊙/yr; discs there 10–30 AU | Winter & Haworth 2022, Eisner 2018 |
| Inner dust rim | 0.069 AU (L/L⊙)^½ at 1500 K (0.155 at 1000 K) | Dullemond & Monnier 2010 |
| Outer radius | typical disc 10–20 AU (R_eff); big bright ones 27–264 AU (median 82); HL Tau ~137 AU | Andrews 2018, Huang 2018, ALMA 2015 |
| Flaring | h/r ≈ 0.035 at 1 AU ∝ r^(2/7) (0.09 at 30 AU); visible surface ~5 h up | Chiang & Goldreich 1997 |
| Gaps | 1–7 per disc (median 2), at 9–145 AU, width/r 0.08–0.22 (quartiles); HL Tau 7 gaps 13–91 AU, rings 5–8 AU wide | Huang 2018, ALMA 2015 |
| Gap by a planet | Δ/R = 0.41 q^½ (h/r)^−¾ α^−¼ (0.2–0.8 for 0.2–1.4 MJ); cavities like PDS 70's (to 54–74 AU) need several planets | Kanagawa 2016, Keppler 2018/2019, Haffert 2019 |
| Disc colour | T Tauri grey (starlight colour), Herbig red (η 0.5–1, LkCa 15 ≈ 2); reflectivity 0.1–1% (polarized) | Ma et al. 2024 |
| Debris incidence | A 24%, F 24%, G 14%, K 13%, M 2% (DEBRIS); FGK 22% (DUNES) | Thureau 2014, Sibthorpe 2018, Lestrade 2025, Montesinos 2016 |
| Zodiacal cloud | n ∝ r^−1.34, half-thickness z/r = 0.24 (13.7°); face-on brightness ∝ r^−2.34; 3–9× brighter than the pole towards the Sun | Kelsall 1998, STIS handbook (Leinert 1998) |
| Belts | cold ~40 AU (Kuiper-like), warm/cold radii ~10× apart; ΔR/R 0.1 (Fomalhaut) to 0.7 (median), Kuiper belt 0.28 | Sibthorpe 2018, Kennedy & Wyatt 2014, MacGregor 2017, Matrà 2025 |
| Shower needs | MOID ≲ 0.1 AU (median stream cross-section 0.08 AU); necessary, not sufficient | Ye & Jenniskens 2022, Jenniskens 1994, Christou 2019 |
| Shower length | FWHM 0.3–8 days (0.1–2% of the orbit), above background 1–15 days, active 10–40 days | Jenniskens 1994, IMO 2027 |
| Rates | sporadic ~10/h; major showers ZHR 10–150; storms > 1000 (Leonids 1966 ~15,000) | Jenniskens 1994, IMO 2027, Ye & Jenniskens 2022 |
| Meteors | 11–72 km/s; begin 90–120 km, end 55–105 km (faster = higher); 0.33 ± 0.15 s (to ~2 s for slow bright ones); paths ~20–50 km | Madiedo 2015/2016/2018, Brosch 2004, Matlovič & Tóth 2020 |
| Colours | Na 589 nm orange (stronger below ~35–40 km/s), Mg 517 nm green, O I 557.7 nm green trains, main spectrum 3500–5000 K | Matlovič & Tóth 2020, Matlovič 2019 |
| Other worlds | Mars 50–90 km, Venus 100–120 km, Titan deposits up to the 950–1500 km region at ~8 km/s; none without air above ~0.04 Pa; Triton/Pluto (1–2 Pa) marginal | Christou 2019, Flowers & Chyba 2021 |
| Lunar flashes | 1.03 × 10⁻⁷ km⁻² h⁻¹ (~2/h per hemisphere), ×2.5–3.7 in the Perseids; 20–160 ms; mag 5–10 | Suggs 2014, Madiedo 2015 |
| Dust trails | width 0.9–15 × 10⁴ km (median 5 × 10⁴), crossed in < 1.5 h (storms); length degrees to 60° of the orbit | Reach 2007 |

**Impact flash colours** (added with the implementation, `flash.mjs`: `colours.mjs`'s `toHex`, `planck` and `spec` with `for (const T of [1600, 2000, 2500, 3100]) console.log(T, toHex(spec((nm) => planck(nm, T))))`):

| Black body | sRGB |
|---|---|
| 1600 K | `#ff7300` |
| 2000 K | `#ff8b16` |
| 2500 K | `#ffa449` |
| 3100 K | `#ffbb74` |

## Game mapping

**Distances.** Real AU go into system units the way Sol's do (`solOrbit`, log-linear with Earth's orbit at the habitable radius), scaled to the system's habitable radius (`discContext` in `gen/system.ts`). Shares of a radius (gap widths, belt widths, h/r) are kept as shares, since the log map compresses distances.

**Young stars** (`gen/discs.ts`, `chooseYoungStars`, `StarRef.young`): `YOUNG_PER_STAR` = 8 / 4000, a deliberate ×30 or so on the real 3–7 × 10⁻⁵ so a galaxy has a handful to find. Three in four come from stars in emission, reflection or dark nebulas (the real Orion and Taurus clouds), the rest from the field; each is drawn in proportion to its disc's lifetime (`discLifetime`: 2.5 Myr, 1.2 Myr above 1.3 M☉), so heavy stars are rarer. Hosts are main-sequence B–K stars and red dwarfs (`canBeYoung`): no O stars (their discs evaporate, and they photoevaporate their neighbours'), giants or white dwarfs. Sol and the home system are never young; the selection runs after Sol is placed, from its own stream, so no other star or system changes. Default galaxy: 8 young stars, 6 in nebulas (most in dark clouds), 14 forming planets between them.

**Protoplanetary discs** (`generateProtoplanetaryDisc`, `generateYoungSystem`):
- Outer radius 30–150 AU, log-even (DSHARP 27–264, HL Tau ~137). Inner edge at the dust rim, 0.069 AU √L, which in game units is inside the star, so it starts at 1.6 star zones.
- Surface density ∝ r^−(0.8–1.1), tapered past 55–75% of the outer radius.
- Thickness: the gas's h/r = 0.035 au^(2/7) at the outer edge, flaring as r^(9/7) (Chiang & Goldreich); drawn as sheets ±1.5 h.
- 1–3 forming planets (DSHARP's median 2 gaps), one per slice of log radius between 1 AU and 70% of the disc, so they don't crowd. Inside the snow line (2.7 AU √L) a molten rocky body (`lava`, a magma ocean: sea level 0.15–0.45) of a few Earth masses (q 1–3 × 10⁻⁵), outside it a young gas giant (q 10⁻⁴–10⁻³, a Neptune or two to a Jupiter). No moons, rings, belts or comets yet.
- Each gap's width from Kanagawa's formula at the gap's own h/r and α = 10⁻³ (0.1–0.4 of r for giants, DSHARP's quartiles 0.08–0.22), but at least 4 of the planet's radii either side (`MIN_GAP_RADII`): a rocky planet's real gap is narrower than the game draws the planet (stylised). A bright ring (the pressure bump) just outside each gap. A gap that would run into the last one's ring, or out of the disc, is left out with its planet.
- Colour: T Tauri discs scatter grey (warm off-white, times the star's light), Herbig ones (above 1.5 M☉) redder.
- Optical depth 20–60 at the inner edge (thick), clumps from the shared noise sheared round at Kepler's speeds, a two-armed spiral in a quarter.

**Debris discs** (`generateDebrisDisc`, own stream `rng.fork('dust')`):
- Chance by the main star's class from DEBRIS (A–F 24%, G 14%, K 13%, M 2%; O and B given A's; none round giants and white dwarfs). In the default galaxy's star mix that is ~12% of systems, not the ~20% first proposed: the game's stars are mostly K and M, where debris discs are rarer.
- Warm dust ∝ r^−1.34 (Kelsall) from 1.5 star zones, tapered past 3–5 AU; thickness h/r 0.08–0.21 (the zodiacal fan's σ ≈ 0.21 r at the thick end).
- In 3 of 4 a cold belt at 20–100 AU, full width over radius 0.1–0.7 (Fomalhaut to the median belt), its peak as dense as the warm dust a little way out from the star.
- Sol has the zodiacal cloud: r^−1.34, tapered past 3.5 AU, σ = 0.21 r.

**Drawing** (`world/DustDisc.ts`): three flared sheets through the thickness (on a mesh spaced evenly in log radius, with everything that depends only on the place in the disc worked out per vertex), drawn back to front from the camera's side, each taking its Gaussian share of the column. Stylised: the column is squeezed (τ^0.5) so the outer disc still shows, light falls off as (habitable radius / d)^0.7 rather than d^−2, and the young disc's rings and gaps are drawn brighter and darker than the column alone would make them. Henyey–Greenstein forward scattering (g = 0.45) makes the dust brightest looking towards the star. A young disc's midplane sheets are shaded (its flared surface catches the light) and it hides what's behind it; a debris disc only adds light. The sheets thin out towards both edges of the disc: otherwise they stay thick right to the edges, and from a little above, the edges of the stacked sheets showed as steps. Seen edge-on, a young disc's flat sheets read as two lit surfaces with a dark lane between, as edge-on discs look (HH 30). From inside a debris disc, stacked sheets leave a dark wedge along the plane, so a debris disc also has a band: the far wall of an open cylinder near its outer edge, painted with the column along the plane and lit as the dust at the habitable radius. Its sheets hand over to it near edge-on. The starlight on the dust is capped at twice the habitable radius's (near a B star it washed the view out). A debris disc's forward scattering (g = 0.3) and edge-on boost (at most 2.5×) together make its band from inside at most ~8× brighter towards the star than face on: the zodiacal light is 3–9× brighter towards the Sun than at the ecliptic pole (the STIS handbook's values, above). The planet level draws the system scene as its sky, so the discs look the same from low orbit.

**Comet dust trails** (`world/CometTrail.ts`): a faint line all along each comet's orbit, brighter over the sixth of the orbit just behind the comet and a little way ahead (Encke's trail reaches 60° behind and 5° ahead, Reach et al. 2007).

**Meteor showers** (`gen/meteors.ts`):
- A body gets a shower at each local minimum of the distance between its orbit (a moon's: its planet's) and a comet's that is under `SHOWER_MOID` = 0.1 habitable radii (≈ AU). Strength 1 − MOID / 0.1 (no source gives the falloff: an open question).
- Its peak is where the planet's orbit comes closest. Its half-width at half maximum is 5% of the orbit, against the real 0.1–2% (FWHM): stretched so a shower lasts long enough in the game's minutes-long years (the IMO's activity periods are 3–11% of a year).
- Radiant and speed from V_g = V_stream − V_planet, the game's speeds scaled so a circular orbit at the habitable radius goes at Earth's 29.78 km/s, and V∞² = V_g² + V_esc². Earth meets Halley's stream at 64–72 km/s (the Orionids' 66).
- Meteors are hashed on a 0.05 s grid (pure functions of the clock): 8 a second in view at the peak (stylised; real ZHR 15–150 an hour). Durations from paths of 12–50 km at the entry speed (0.33 ± 0.15 s for typical speeds). Heights from the measured streams by speed (begin 93–109 km, end 66–94 km), mapped onto the atmosphere shell with its top as 120 km (the shell is stylised tall). Colours from green-white (fast: Mg, O I) to yellow-orange (slow: Na).
- Below 4 × 10⁻⁷ bar (0.04 Pa) a body is airless. Its dust hits the ground as impact flashes on the side facing the stream: 8 a second at the peak, 0.08–0.3 s each, coloured as 2000–3100 K black bodies.

**Not done.** Shower outbursts when the comet has just passed (fresh trails give storms), sporadic meteors, a shower's dust visible in the system view beyond the trail line, and nebulas or discs lighting the planets.

## Open questions

- **The disc count is exaggerated by design.** At real rates a 4000-star galaxy has 0.1–0.3 protoplanetary discs. The galactic census assumes a constant star formation rate and estimates the number of stars alive from the Kroupa IMF below 1 M⊙; the present-day mass function itself (and white dwarfs, brown dwarfs) was not looked up, so the 3–7 × 10⁻⁵ is good to a factor of ~2.
- **Which emission nebulas host young discs** (cluster ages inside H II regions, the Orion Nebula Cluster's 1–3 Myr) is taken from Winter & Haworth only for the ONC; no survey of disc fractions inside H II regions in general was read.
- **Gap widths** are defined differently by DSHARP (Huang) and Kanagawa (Σ < Σ0/2); HL Tau's inner gap is 5.7 AU in one and 9.5 AU in the other. PDS 70's cavity is not reproduced by one planet with Kanagawa's formula (it predicts 23–31 AU of gap round b; the dust is cleared to 54–74 AU, the gas gap is 11 AU wide).
- **Disc colours** are from polarized near-IR reflectivity (0.6–2.2 µm) extrapolated across the visible; no visible-band colour of an edge-on disc (HH 30, HST) was read. Unverified: the visible colour of edge-on discs and of debris discs in scattered light.
- **Debris incidence weighted by the galaxy's stars**: the per-type rates are for nearby, detected discs; the share of each spectral type in the galaxy was not looked up, so the population-weighted rate is not computed. The M-dwarf rate (2%) comes from a ~10× shallower survey.
- **Zodiacal light from Earth against the rest of the night sky** (airglow, starlight): only the zodiacal light's own surface brightness (20.9–23.3 V mag arcsec⁻², from space) was read; Leinert et al. 1998 itself could not be fetched (aanda.org and ADS refused), so its values come via the STIS handbook and Aldering 2002. Its colour is only "redder than the solar spectrum".
- **Jenniskens 1994** was read from an OCR scan; the slopes B were read from Table 3b/3c and look consistent (e.g. Perseids 0.20, Geminids 0.39/0.72), but single digits could be OCR errors. Jenniskens' "Boo" at λ⊙ = 282.62 is taken to be the Quadrantids (the IMO lists them at 283.15, ZHR 80, with the radio peak "wider than the usually quoted 4 hours"; J94's B = 1.8 gives a FWHM of 8 h).
- **MOID threshold**: "∼ 0.1 au" is a rule of thumb; Christou et al. note it fails both ways (Orionids and η-Aquariids come from Halley at Δ ≳ 0.1 AU; many close comets give nothing). How shower strength falls off with MOID was not found as a formula.
- **Meteor line ratios** (Na : Mg : Fe intensity against speed) were not taken as numbers; only the trend (Na relatively stronger below 35–40 km/s) and the line list. Begin heights for the Perseids, Leonids and Geminids from Koten et al. 2004 were not read directly (aanda.org refused); only quoted ("∼120 km for Perseid members" of 0.02 g).
- **Meteors on thin atmospheres**: the 0.04–6 Pa ablation window is computed from the density range for an N₂/O₂ atmosphere at 200 K; a CO₂ or N₂-CH₄ atmosphere at other temperatures shifts it somewhat. No direct optical meteor has been seen anywhere but Earth.
- **Flash colour**: 1600–3100 K was measured (NELIOTA) but no sRGB was computed for it.
