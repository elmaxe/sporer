# The Sol system

## Question

What goes into a hand-made copy of our own solar system (`gen/sol.ts`), so its bodies are where, how big and what they really are, and Earth, the Moon, Mars and Pluto look like themselves? We need, for every body: its size, distance, axial tilt, day, orbit inclination and starting longitude; for solid bodies the climate inputs (sunlight, gravity, escape velocity, heat flow, Bond albedo, air); for the giants their cloud bands, storms and rings; and surface maps for the four bodies whose faces people know.

Precision: the game compresses sizes and distances anyway, so "the right value, then the game's usual compression" is the rule. Temperatures and pressures are read by the player in the HUD, so those come out of the climate model within a few kelvin of the measured ones.

## Sources

- NASA NSSDCA Planetary Fact Sheet (metric), https://nssdc.gsfc.nasa.gov/planetary/factsheet/, accessed 2026-10-02, raw HTML (columns Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto):
  - Diameter (km): 4879, 12,104, 12,756, 3475, 6792, 142,984, 120,536, 51,118, 49,528, 2376
  - Gravity (m/s²): 3.7, 8.9, 9.8, 1.6, 3.7, 23.1, 9.0, 8.7, 11.0, 0.7
  - Escape velocity (km/s): 4.3, 10.4, 11.2, 2.4, 5.0, 59.5, 35.5, 21.3, 23.5, 1.3
  - Length of day (h): 4222.6, 2802.0, 24.0, 708.7, 24.7, 9.9, 10.7, 17.2, 16.1, 153.3
  - Distance from Sun (10⁶ km): 57.9, 108.2, 149.6, —, 228.0, 778.5, 1432.0, 2867.0, 4515.0, 5906.4
  - Orbital inclination (°): 7.0, 3.4, 0.0, 5.1, 1.8, 1.3, 2.5, 0.8, 1.8, 17.2
  - Obliquity to orbit (°): 0.034, 177.4, 23.4, 6.7, 25.2, 3.1, 26.7, 97.8, 28.3, 119.5
  - Mean temperature (°C): 167, 464, 15, −20, −65, −110, −140, −195, −200, −225
  - Surface pressure (bar): 0, 92, 1, 0, 0.01, —, —, —, —, 0.00001
- JPL "Approximate Positions of the Planets" (Standish), https://ssd.jpl.nasa.gov/planets/approx_pos.html, accessed 2026-10-02: semi-major axes (AU) Mercury 0.38709927, Venus 0.72333566, Earth–Moon barycentre 1.00000261, Mars 1.52371034, Jupiter 5.20288700, ...; mean longitudes at J2000 (°) Mercury 252.25, Venus 181.98, Earth 100.46, Mars −4.55 (355.45), Jupiter 34.40, Saturn 49.94, Uranus 313.23, Neptune 304.88. Used as each planet's starting angle.
- JPL Planetary Satellite Mean Elements, https://ssd.jpl.nasa.gov/sats/elem/sep.html, accessed 2026-10-02, raw HTML: semi-major axis (km) Moon 384 400 (inclination 5.16° to the ecliptic), Phobos 9375, Deimos 23 457, Io 421 800, Europa 671 100, Ganymede 1 070 400, Callisto 1 882 700, Mimas 186 000, Enceladus 238 400, Tethys 295 000, Dione 377 700, Rhea 527 200, Titan 1 221 900, Iapetus 3 561 700 (14.8° from Saturn's Laplace plane), Miranda 129 846, Ariel 190 929, Umbriel 265 986, Titania 436 298, Oberon 583 511, Triton 354 800 (157.3°: retrograde), Charon 19 600.
- JPL Planetary Satellite Physical Parameters, https://ssd.jpl.nasa.gov/sats/phys_par/, accessed 2026-10-02, raw HTML: GM (km³/s²) and mean radius (km): Moon 4902.800 / 1737.4, Phobos 0.0007087 / 11.08, Deimos 0.0000962 / 6.2, Io 5959.915 / 1821.49, Europa 3202.712 / 1560.80, Ganymede 9887.833 / 2631.20, Callisto 7179.283 / 2410.30, Mimas 2.50349 / 198.20, Enceladus 7.21037 / 252.10, Tethys 41.21353 / 531.10, Dione 73.11607 / 561.40, Rhea 153.94175 / 763.50, Titan 8978.137 / 2574.76, Iapetus 120.51511 / 734.30, Ariel 83.5 / 578.9, Umbriel 85.1 / 584.7, Titania 226.9 / 788.9, Oberon 205.3 / 761.4, Miranda 4.3 / 235.8, Triton 1428.495 / 1352.60, Charon 106.1 / 606.0.
- JPL Small-Body Database API, `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=1P&phys-par=1`, accessed 2026-10-02: 1P/Halley, q 0.575 AU, aphelion 35.3 AU, e 0.968, i 162°, Ω 59.1°, ω 112°, diameter 11.0 km.
- Maps (all public domain, US government works), downloaded 2026-10-02, turned into `public/maps/*.bin` by `scripts/solMaps.py`:
  - Earth colour: NASA Blue Marble (2002) land, ocean and sea ice, `land_ocean_ice_2048.jpg`, https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/
  - Earth height: GEBCO_08 land elevation and bathymetry from NASA Visible Earth, `gebco_08_rev_elev_21600x10800.png` (…/73000/73934/) and `gebco_08_rev_bath_21600x10800.png` (…/73000/73963/)
  - Moon: NASA SVS CGI Moon Kit, LRO LROC WAC colour `lroc_color_poles_1k.jpg` and LOLA elevation `ldem_3_8bit.jpg`, https://svs.gsfc.nasa.gov/4720
  - Mars: MGS MOLA MEGDR topography at 4 px/degree, `megt90n000cb.img` (PDS Geosciences), and the MGS TES albedo mosaic (USGS Astrogeology, `Mars_MGS_TES_Albedo_mosaic_global_7410m.tif`)
  - Pluto: New Horizons global mosaic (USGS Astrogeology, `Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif`)

Unverified (from memory, not looked up this session): the moons' Bond albedos and heat flows other than Earth's, Io's and Enceladus's (which `docs/research/climate.md` sources); Venus's and Mercury's heat flows; the Great Red Spot's current size (~14 000 km) and Saturn's ring radii (D 1.11, C 1.24, B 1.53, Cassini division 1.95–2.03, A to 2.27, Encke gap 2.21 Saturn radii) and Uranus's (1.64–2.0); the Sun's place in the Galaxy (~8.2 kpc from the centre of a disc ~15 kpc in radius). They only shape looks and the quiet moons' temperatures, which nobody can check in the HUD against a real measurement anyway.

## Measurements

### Climates

Every solid body's climate is `evaluateClimate` on its real setting (sunlight 1/a², gravity, escape velocity, heat flow) and state (air, water, surface Bond albedo). The moons' gravity and escape velocity are computed from JPL's GM and radius (`surfaceGravity`: g = GM/R², v = √(2GM/R)). The planets' come from the fact sheet. Out of the game's own climate model (`tests/sol.test.ts` pins these):

| Body | Game | Measured (fact sheet / literature) |
|---|---|---|
| Mercury | 164 °C | 167 °C |
| Venus | 464 °C, 92 bar CO₂ | 464 °C, 92 bar |
| Earth | 15 °C, 1.0 bar, T3 | 15 °C |
| Moon | −3 °C | −20 °C (its slow rotation; the model is a fast rotator's mean) |
| Mars | −63 °C, 6 mbar | −65 °C, 0.01 bar |
| Titan | −180 °C, 1.5 bar N₂ | −179 °C, 1.47 bar (climate.md) |
| Triton | −236 °C | −235 °C (38 K) |
| Pluto | −241 °C | −225 °C |

And the model's own rules then give each body its real weather and activity: water clouds and storms on Earth, Venus's acid cloud deck, dust storms on Mars, methane rain on Titan; sulphur plumes on Io (heat flow 2.24 W/m²), cryo geysers on Enceladus (0.03 W/m², inside the measured 0.019–0.050) and on Triton (its nitrogen plumes are driven by sunlight, not heat; a heat flow of 0.02 W/m² stands in so the game's geysers show them). Europa's heat flow (0.05 W/m²) gives it cryo plumes too, which Hubble may have seen.

### Sizes and distances

- **Sizes:** the game's `gameRadius` (8·√(R/R⊕)) of the fact sheet's equatorial radii, and of JPL's mean radii for moons, exactly as `docs/research/body-sizes.md` maps every generated body. Phobos and Deimos would be 0.33 and 0.25 units, a fifteenth of the UFO, so they are drawn at 0.9 and 0.6, the game's comet-nucleus sizes, with their elongated shapes (1.4–1.55 and 1.3–1.4 long axis over short).
- **Planet orbits:** real distances don't fit (Mercury would be inside the Sun's glow, Neptune 77 times further than Mercury). The orbits are placed by hand at 82, 115, 160, 215, 620, 1000, 1340, 1560 system units: the order and the inner planets' crowding are kept, Earth sits at the habitable radius (where its light is Earth's), and each planet's neighbourhood (moons, rings) clears the next. Anything between (belts, Pluto, Halley's aphelion) is log-interpolated between them (`solOrbit`), and beyond Neptune extrapolated with the Uranus–Neptune slope, so Pluto (39.48 AU) lands at 1711, inside the Kuiper belt (from Neptune's neighbourhood out to 50 AU), and the main belt spans Jupiter's 4:1 to 2:1 resonances (2.065–3.278 AU), as `gen/belts.ts` places every main belt.
- **Periods:** the system's Kepler law (`keplerPeriod`), as for generated systems: an Earth year is 119 s and Neptune's 3608 s; Halley's 76-year orbit comes out at ~1520 s, 0.42 of Neptune's (real: 0.46).
- **Moon orbits:** at R·(a/R)^½ from their planet (the same square root as the sizes), which keeps every family's order and spacing and clears Saturn's rings; Earth's Moon, at 60 Earth radii by far the furthest out in planet radii, uses (a/R)^0.268, or the inner planets would have to spread out. Moons orbit in their planet's equator (Uranus's on their side), except the Moon (5.16° to the ecliptic), Iapetus and Triton (retrograde).
- **Days:** real days don't fit either (the game turns its worlds in under two minutes): spin = 0.35·√(9.925 h / day) rad/s, so Jupiter turns fastest, Earth and Mars alike, Mercury and Venus barely; Venus, Uranus and Pluto turn backwards through their tilts (177.4°, 97.8°, 119.5°).

### Surface maps

Equirectangular height and colour maps (1024 × 512 heights, 512 × 256 colours; the Moon's heights 512 × 256), longitude −180° to 180°, read in the body frame's own longitude and latitude (`planet/equalEarth.ts`), so the planet map is the real map. Heights are one byte per pixel of the game's terrain value n (−1 to 1). For Earth, the sea is n < 0 (the Blue Marble decides what's sea, so ice shelves and the Arctic sea ice stand as flat white land); land rises 0.07 + 0.93·(elevation/max)^0.6 so lowlands read and the Himalaya top out; the sea floor sinks with depth^0.7. Colours are 6-bit sRGB, land colours bled into the sea so coasts never sample blue. The Moon's LROC colours are stretched (2nd–98th percentile of brightness to 0.18–0.9) so its maria show as they do from Earth. Mars's colour is its TES albedo (0.1 dark basalt to 0.3 bright dust) between a dark and a bright Mars tone, with the residual polar caps past ~80°N and ~84°S. Pluto's grey mosaic is tinted from Cthulhu's dark red-brown to Sputnik Planitia's pale ice; the south, dark during the flyby, is filled in smoothly.

On top of the maps the usual fine noise adds hills (Earth keeps 40% of it, so lowlands never flood). Plants on Earth grow only where the map is green (g/r ≥ ~1, not bright: forests yes, the Sahara and ice sheets no).

Files: Earth 377 KiB, Moon 193 KiB, Mars 262 KiB, Pluto 111 KiB, gzipped; fetched when the game starts (waited for only when it starts in Sol).

### Giants

Hand-made cloud layouts (`gen/gasGiants.ts`): Jupiter's belts and zones at their latitudes (equatorial zone ±7°, the North and South Equatorial Belts, tropical zones, ...) with the Great Red Spot at 22°S and Oval BA at 33°S, Juno's 8 + 5 polar cyclones; Saturn muted (contrast 0.55), its broad equatorial zone (±22°), the hexagon at 78°N; Uranus nearly featureless with its bright north polar hood; Neptune with Voyager's Great Dark Spot (22°S) and its bright companion, the Scooter and white streaks. Jets come from the same per-edge rule and Jupiter / Saturn / Uranus / Neptune speeds as generated giants. Saturn's rings have a real radial profile (`RingData.profile`): faint D and C rings, the bright B ring, the Cassini division, the A ring with the Encke gap.

### Where Sol is

Every galaxy has Sol: the arm star nearest 0.55 of the way out (8.2 / 15 kpc) and closest to the plane, that is alone, outside every nebula, and not a lone G or K star (so the home system, which is always one of those, never changes). It keeps its id, place and seed; only its name and star change. `?star=sol` starts there.
