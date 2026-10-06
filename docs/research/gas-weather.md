# Weather on gas and ice giants: passing storms and lightning

## Question

Issue #53 ("Gas giant storms"; the roadmap's *Weather on gas giants* idea): step 22 gave weather only to solid bodies with a climate, so the giants' cloud tops (`src/gen/gasGiants.ts`, drawn by `src/world/gasLook.ts`) never changed except for drifting. Their long-lived ovals (a great red spot, white ovals, Neptune's dark spot) were already in the layout. What was missing:

- **passing storms**: Jupiter's convective plumes in its belts and the wakes the jets draw out of them, Saturn's great white storms that wrap round the planet, the ice giants' bright outbursts and Neptune's dark spots that come and go;
- **lightning**: where it flashes, how often, and on which side of the planet it can be seen.

The numbers needed: storm sizes (as angles on their planet), lifetimes, how long a wake gets, how a great storm's timeline goes, how often each kind happens, flash rates per storm, flash sizes, and where on the planet they sit. Precision: the right sizes within ~20% and the right ratios and trends. It's a look, and times are compressed (below).

Reference cases: Jupiter (the 2007 and 2016 outbreaks on the 24°N jet, the 2010 SEB revival, Juno's lightning), Saturn (the 2010–11 great storm, the Great White Spots of 1876–1990, Storm Alley), Uranus (2014), Neptune (2017's storm, the 2018 dark spot, Voyager's Great Dark Spot).

## Sources (accessed 2026-10-03)

Abstracts or full texts read this session. Values are quoted as printed.

**Jupiter's convective storms**
- Gierasch et al. 2000, *Observation of moist convection in Jupiter's atmosphere*, Nature (https://pubmed.ncbi.nlm.nih.gov/10688191/). A storm with "vertical extent of at least 50 km and a length of about 4,000 km", seen on the day side "within just a few hours of a lightning detection (on the night side)".
- Fischer et al., *Overview of Saturn lightning observations* (https://arxiv.org/abs/1111.4919).
  - Lightning storms on Jupiter are "<1500 km", on Saturn "2000-3000 km".
  - On Jupiter, "typically a few storms at the same time … only last for a few days".
  - Its table gives optical flash energies of 10⁹ J for Saturn, 10⁹ J for Jupiter and 10⁶ J for Earth. The lit cloud patch (HWHM) is 100 / 45–80 / 10 km.
- Sánchez-Lavega et al. 2008, *Depth of a strong jovian jet …*, Nature (https://www.nature.com/articles/nature06533). The 2007 outbreak at 23°N, "25 March … lasting to June 2007". Its plumes "reached a height of 30 km above the surrounding clouds, moved faster than any other feature (169 m s⁻¹)".
- Sánchez-Lavega et al. 2017, *A planetary‐scale disturbance in the most intense Jovian atmospheric jet …*, GRL (abstract, https://doi.org/10.1002/2017GL073421).
  - "four plumes … from 22.2° to 23.0°N … eastward velocities in the range 155 to 175 m s⁻¹".
  - A wake of "bright and dark spots (wave number 20–25) … moving with speeds in the range 100–125 m s⁻¹".
  - "activity ceased in late November".
- Rogers et al., EPSC2017-332 (https://meetingorganizer.copernicus.org/EPSC2017/EPSC2017-332.pdf). The 2016 plumes "had appeared in mid-September" and were tracked "until they disappeared around the start of November".
- Sánchez-Lavega et al. 2026, GRL (https://doi.org/10.1029/2025GL118481), and its NASA abstract (https://ntrs.nasa.gov/citations/20250004703).
  - The 24°N outbreaks begin as "1–3 bright clouds", with "a mean period of 4.64 years … 10 outbreaks observed between years 1970 and 2025".
  - Plumes accelerate "during the first 2–3 days of their life".
- Rogers, *Jupiter's South Equatorial Belt cycle in 2009–2011: II, The SEB Revival* (https://arxiv.org/abs/1707.03356).
  - "16 such plumes … over the next 8 weeks, at a mean frequency of one every 3.7 days".
  - One plume, "WS8 only lasted for 3 days".
  - "14 SEB Revivals from 1919 to 1990".
- Fletcher et al., *Moist Convection and the 2010–2011 Revival of Jupiter's SEB* (https://arxiv.org/abs/1701.00965). "convective eruptions triggered over ∼100 days", with plume tops covering an "area 2.5 × 10⁶ km²".
- Fletcher 2017, *Cycles of Activity in the Jovian Atmosphere* (https://arxiv.org/abs/1708.05180).
  - SEB revivals take "an 'S-shaped' form due to their location between an eastward jet to the north and a westward jet to the south".
  - The 24°N plumes "moved eastward faster than the ambient zonal flows, generating wakes of bright and dark spots that went on to encircle the whole latitude band".

**Jupiter's lightning**
- Becker et al. 2020, *Small lightning flashes from shallow electrical storms on Jupiter*, Nature (https://pubmed.ncbi.nlm.nih.gov/32760043/).
  - Juno's star camera finds "about 6.1 × 10⁻² [flashes km⁻² yr⁻¹] … more than an order of magnitude greater" than the "about 4 × 10⁻³" of earlier imaging.
  - Voyager flashes were "about 30 kilometres (HWHM)", and some Juno flashes last "as short as 5.4 milliseconds".
  - Optical energies were "(0.02–1.6) × 10¹⁰ joules" from earlier missions, against Juno's "approximately 10⁵–10⁸ joules".
- Brown et al. 2018, *Prevalent lightning sferics at 600 megahertz near Jupiter's poles*, Nature (https://pubmed.ncbi.nlm.nih.gov/29875484/).
  - "377 lightning sferics" in the first eight orbits.
  - Lightning is "prevalent in the polar regions, absent near the equator, and most frequent … at latitudes higher than 40 degrees north".
  - It has been "detected by all visiting spacecraft through night-side optical imaging".
- Kolmašová et al. 2018, Nature Astronomy (https://www.nature.com/articles/s41550-018-0442-z). "up to four lightning strokes per second … six times the peak rates from the Voyager 1 observations".
- Spencer et al. 2007 (New Horizons, https://pubmed.ncbi.nlm.nih.gov/17932285/). "lightning at high latitudes … up to 80 degrees N and 74 degrees S".
- Fletcher et al., *Structure of Jupiter's High-Latitude Storms: Folded Filamentary Regions Revealed by Juno* (https://arxiv.org/abs/2512.15696).
  - Flashes sit "in cyclonic regions – or on the westward jets alongside them".
  - Juno's sferic peaks are "near 45° N, 56° N, 68° N and 80° N", and Cassini's flashes coincide with storms "at 34° N … 24° N and 13° S".
  - It is "rare to see visible lightning at these latitudes due to the strong solar illumination".

**Saturn**
- Sayanagi et al. (https://arxiv.org/abs/1607.07246).
  - Great White Spots "in 1876, 1903, 1933, 1960 and 1990 … lasted for 26, 150, 44, 41, and 55 days, respectively".
  - The 2010 storm ran "December 5, 2010 … June 20, 2011 … 201 days". Its head measured "9200 km and up to 34,000 km" (north-south, east-west) on 11 January 2011.
- Fischer et al. 2011, *A giant thunderstorm on Saturn*, Nature (https://pubmed.ncbi.nlm.nih.gov/21734705/).
  - Born at "35° north", it reached "a latitudinal extension of 10,000 kilometres … about three weeks after it started", and its tail "wrapped around the whole planet by February 2011".
  - Its flash rates were "about an order of magnitude higher" than earlier storms', with "peak rates larger than ten per second".
- Sánchez-Lavega et al. 2011, Nature (https://pubmed.ncbi.nlm.nih.gov/21734704/). Great White Spots "occur about once per Saturnian year (29.5 Earth years)".
- Sánchez-Lavega & Fischer, *The Great Saturn Storm of 2010–2011* (https://arxiv.org/abs/1611.07669).
  - The head grew to "10,000 – 20,000 km … in about ten days", the tail "encircled the planet in about 2 months", and the head "ceased after about seven months".
  - Its lightning ran at "5–10 SEDs per second", against "few SEDs per minute for regular storms".
  - Day-side detection needed a high flash rate and "image subtraction".
- Sánchez-Lavega et al., *Moist Convective Storms on Saturn* (https://arxiv.org/abs/2401.13294).
  - Storm Alley storms "extend laterally up to ~4000 km", in a band "centered at 36.2°S", and lightning storms "last from a few days up to several months".
  - Cassini's night-side flashes (Dyudina et al. 2010) are "200 km sized bright spots", with optical energies of "10⁹⁻¹⁰ J".

**Uranus and Neptune**
- de Pater et al. 2015, *Record-breaking storm activity on Uranus in 2014* (https://arxiv.org/abs/1501.01309).
  - The big storm was at "∼15° N … ∼25° in longitude, i.e., almost 10,000 km".
  - A second storm's tail would "take about 10 days to extend backward by ∼60°".
- Hueso et al., *Convective storms … in Uranus and Neptune* (https://arxiv.org/abs/2111.15494).
  - It gives the 2014 storm as "∼17,000 km in longitude and 4,300 km in latitude", and spots at 28–42°N as "2,000–4,000 km".
  - Neptune's 2017 equatorial storm "lasted 7 months".
- Molter et al. 2019 (https://arxiv.org/abs/1811.08468). Neptune's 2017 storm measured "∼8500 km diameter … active from at least 10 June to 31 December 2017".
- Hsu et al. 2019, *Lifetimes and occurrence rates of dark vortices on Neptune …* (https://doi.org/10.3847/1538-3881/ab0747). Dark spots have "lifetimes of at least one to two years, and no more than six years … one dark spot every four to six years".
- Wong et al. 2018 (https://doi.org/10.3847/1538-3881/aaa6d6). SDS-2015 drifted "poleward … 1.7–2.5 deg/year". The figures came via a search summary; the abstract text read didn't carry them.
- Simon et al. 2019 (https://doi.org/10.1029/2019GL081961). NDS-2018 measured "11,000 × 5,000 km at 23°N".
- Irwin et al. 2023 (https://arxiv.org/abs/2308.12889). NDS-2018 drifted "equatorwards … apparently disappearing in late 2022", and Voyager's Great Dark Spot (∼10,000 km) was "never seen again".
- Aplin et al., *Atmospheric Electricity at the Ice Giants* (https://arxiv.org/abs/1907.07151).
  - Voyager 2 recorded "140 impulsive bursts" at Uranus, and at Neptune "16 whistler-like events within ~20 minutes" and "four weak sferics".
  - "the UED rate measured by Voyager 2 was quite low", against Saturn's great storm's "SED rate of 10 s⁻¹".

## Measurements

Sizes as angles on their planet (radius from the NASA fact sheet's diameters, as in gas-giants.md), and the timelines:

```bash
node -e '
const J=71492,S=60268,U=25559,N=24764, D=180/Math.PI;
const rows=[["Jupiter lightning storm (<1500 km)",1500,J],["Galileo storm (4000 km)",4000,J],["Plume drawn, short (3000 km)",3000,J],["Plume drawn, long (6500 km)",6500,J],
["Saturn 2010 head E-W (34 000 km)",34000,S],["Saturn 2010 head N-S (9200 km)",9200,S],["Saturn head 10 000-20 000 km (low)",10000,S],
["Uranus 2014 storm (10 000 km)",10000,U],["Uranus spots (2000 km)",2000,U],["Neptune NDS-2018 (11 000 km)",11000,N],["Neptune NDS-2018 N-S (5000 km)",5000,N]];
for(const [n,km,R] of rows) console.log(`| ${n} | ${(km/R*D).toFixed(1)}° |`);
for (const d of [3,7]) { const km=50*86400*d/1000; console.log(`wake ${d} d: ${km.toFixed(0)} km = ${(km/(J*Math.cos(24/D))*D).toFixed(1)}° lon`); }
console.log("great tail by", (55/201).toFixed(3), "head grown by", (10/201).toFixed(3));
console.log("ratio 34000/9200", (34000/9200).toFixed(2), "NDS 11000/5000", (11000/5000).toFixed(2), "Uranus 17000/4300", (17000/4300).toFixed(2));
console.log("Jupiter flash HWHM 30-80 km in rad", (30/J).toExponential(2), (80/J).toExponential(2), "drawn 0.012 rad =", (0.012*J).toFixed(0), "km");
console.log("GWS duty real", (201/365.25/29.5*100).toFixed(2)+"%", "game", (0.25*625/900*100).toFixed(1)+"%");
console.log("spot drift 2 deg/yr x 3 yr =", 6, "deg; per s over 450 s:", (6/D/450).toExponential(2));'
```

| Feature | Length on the planet |
|---|---|
| Jupiter lightning storm (<1500 km) | 1.2° |
| Galileo storm (4000 km) | 3.2° |
| Plume drawn, short (3000 km) | 2.4° |
| Plume drawn, long (6500 km) | 5.2° |
| Saturn 2010 head E-W (34 000 km) | 32.3° |
| Saturn 2010 head N-S (9200 km) | 8.7° |
| Saturn head 10 000–20 000 km (low) | 9.5° |
| Uranus 2014 storm (10 000 km) | 22.4° |
| Uranus spots (2000 km) | 4.5° |
| Neptune NDS-2018 (11 000 km) | 25.5° |
| Neptune NDS-2018 N-S (5000 km) | 11.6° |

- **A plume's wake.** 2016's plumes ran at 155–175 m/s through a wake moving at 100–125 m/s, about 50 m/s apart. Over a plume's "few days" (3–7), the wake reaches 12 960–30 240 km behind it, which is 11.4–26.5° of longitude at 24°N.
- **The great storm's timeline.** The tail closes round the planet at 55/201 = 0.274 of the storm's life. The head is fully grown by 10/201 = 0.050 of it.
- **Aspect ratios.** Saturn 2010's head is 34 000/9200 = 3.70. Neptune's NDS-2018 is 2.20. Uranus 2014's storm is 3.95 (Hueso's figures).
- **Flash sizes.** Jupiter's flashes light 30–80 km (HWHM), which is 4.2·10⁻⁴ to 1.1·10⁻³ rad. The game first drew 0.012 rad (858 km on Jupiter), now 0.045 rad (3200 km) so the flashes are easy to spot.
- **How often a great storm is under way.** On Saturn, 201 days in 29.5 years is 1.87% of the time. In the game it's 17.4%.
- **A dark spot's drift.** 2°/yr over a ~3-year life is ~6°. Spread over the game's 450 s life, that's 2.33·10⁻⁴ rad/s.

The game's own code is checked against these in `tests/gasWeather.test.ts`:
- a plume's wake is never longer than 40° (26° measured, drawn longer);
- Saturn's great storm wraps round at 55/201 of its life, with its head grown at 10/201;
- its head is drawn 28 000–44 000 km long on Saturn (20 000–34 000 km measured);
- a dark spot moves towards the equator and never crosses it;
- a great storm flashes more than 3.5× as often as a plume (10/s against 2/s: one flash per 0.1 s slot caps a storm at 10/s);
- a Jupiter has a storm going more than 95% of the time;
- they're easy to spot: more than 4 strong storms on Sol's Jupiter on average, more than 3 on Uranus and Neptune, never none, and a great white storm on Saturn more than 60% of the time.

**Easy to spot (deliberate).** The first version kept close to the real sizes and rates, and in play nothing showed: a Jupiter plume was 1–2% of the planet's width, the lightning came from 2–3 of them for a quarter of a second at a time, and Saturn's first great storm in Sol came half an hour in. The owner asked for them to be very easy to spot, so the sizes, counts and rates below are well past the real ones.

## Game mapping (`src/gen/gasWeather.ts`, drawn by `src/world/gasLook.ts`)

- **Long-lived ovals** stay in the layout (gas-giants.md): they last decades or centuries, longer than anything the game shows.
- **Plumes** (every gas giant):
  - Born in a dark belt between the banded latitudes (5° to the polar edge, at most 65°), weighted by the belt's width. Lightning sits in cyclonic belts (Fletcher's paper; Cassini at 13°S–34°N, Juno most often past 40°N).
  - A bright, billowing head 8000–14 000 km long, aspect 1.3. That's 2–3.5× Galileo's 4000 km so it's easy to spot from the system view (**deliberate**); the aspect wasn't measured.
  - Its wake trails 16–40° of longitude (the measured 11–26°, drawn longer) along the faster-moving side of its latitude (the jet next to it), growing over its life, in clumps of white with darker gaps (the "bright and dark spots"). The edge is in shadow.
  - Eight staggered channels, each with a storm in 95% of its slots, keep about 7 going, against "typically a few at the same time" (**deliberate**).
  - A few days become 80–120 s (**compressed**).
- **Great white storms** (giants at least halfway to Saturn-like, `layout.saturn ≥ 0.5`):
  - A head 28 000–44 000 km long (2010's was 20 000–34 000 km; drawn bigger, **deliberate**), aspect 3.7, at 0–40° (the 2010 storm at 35°N; 1933 and 1990 near the equator).
  - It is fully grown at 10/201 of its life, and its trail wraps all the way round at 55/201, after which the whole band is disturbed.
  - It lasts 400–580 s instead of 201 days. Two staggered channels of 600 s slots, four slots in five with one: a great storm is under way about 70% of the time instead of 1.9%, one already going when the game starts in Sol (**deliberate**, so a player sees one).
- **Ice giants**:
  - *Outbursts* (methane-ice clouds): drawn 6000–14 000 km (real ones 2000–10 000 km, **deliberate**), aspect 3, at 5–50°. The trail reaches 60° by 0.4 of the life (Uranus's tail grew 60° in ~10 days of a storm lasting a month or more). Six channels, nine slots in ten with one (**deliberate**). Months become 90–150 s.
  - *Dark spots*: 7000–11 000 km, aspect 2.2, at 15–40°, each with a bright companion cloud over its poleward edge (stylised placement, as in gas-giants.md). They live 400–600 s ("one to six years"), on two channels with one in nine slots in ten, against "one every four to six years" (**deliberate**), and they drift 6° towards the equator over a life before fading out. 2018's and Voyager's spots went equatorwards; 2015's went poleward, which the game ignores.
- **Lightning** (`GAS_LIGHTNING`, `collectGasFlashes`):
  - Flashes sit in a storm's head. None of them strike anything: they are deep under the cloud tops.
  - Each is drawn with the solid bodies' stroke model (`gen/weather.ts`).
  - Plumes flash 2/s at full strength, the stylised order of Juno's peak 4 strokes/s. Great storms flash 10/s, the most one storm can (one per 0.1 s flash slot), as Fischer et al. measured (peaks past 10/s); that's 5× a plume instead of the measured 10×, since the plumes flash more than real ones (**deliberate**).
  - Ice giants' outbursts flash 0.3/s, far more than Voyager heard (16 whistlers in ~20 min at Neptune), so they are seen (**deliberate**). Dark spots don't flash.
  - The shader adds each flash as light glowing through the clouds, 0.045 rad wide (**stylised**: ~60× the real patch, so it's easy to spot from the system view; at most 16 at once). It is faded out wherever the sun's direct light on the cloud exceeds ~20% of noon's, so it shows on the night side and through dusk and is lost in daylight. That is how every spacecraft has seen it ("night-side optical imaging"); Saturn's day-side detection needed image subtraction.
- **Times**: each kind keeps its real proportions (how far the wake gets and when, when the head is grown), but lifetimes are compressed by different factors, as step 22 did for thunderstorms and cyclones.
- **Where it's drawn**: everything is per pixel in `GAS_GLSL`, so the system view's globe, low orbit's globe and the planet map show the same storms. It is a pure function of the clock (`GasStormSchedule` caches the slots; storms ride their latitude's drift at the view's pace). The menu's Weather setting off hides the passing storms and lightning; the bands and ovals stay.

## Open questions

- The 2016 plumes' horizontal size isn't in the abstract read; the full text (Wiley) wasn't reachable. Plume sizes come from Galileo's storm and the lightning-storm sizes instead.
- The plume's aspect (1.3) and the trail's shape (widening to ~1.3× the head, shifted towards the jet) are stylised, not measured.
- Juno puts most lightning at high northern latitudes (45–80°N), which the folded filamentary regions there explain. Plumes here are born only up to the polar edge (64–68° on Jupiter-like giants) and in both hemispheres alike; polar lightning in the folded filamentary regions is left out.
- Sources disagree on the Uranus 2014 storm's size (~10 000 km, de Pater; 17 000 × 4300 km, Hueso), on the 2010 Saturn storm's latitude (35°N, 32.4°N or 33°N planetocentric) and on when its tail closed the circle ("by February", "about 2 months"). The game uses 55 days, between them.
- A mid-latitude Jupiter flash rate of 3–30 km⁻² yr⁻¹, attributed to Kolmašová et al. by a search summary, wasn't found in any text read, so it's unused.
