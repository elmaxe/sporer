# Ice: how icy worlds look

## Question

Ice worlds and icy moons looked dull: the ground was a lerp from a pale blue-white (`PlanetStyle.low`) to pure white by height, and a frozen sea was a flat pale cyan sphere at roughness 0.55. No texture at all. What makes ice look like ice, and how did Spore and other games do it?

Needed for `gen/iceColor.ts` (the colours of snow, firn, glacier ice and leads), `gen/ice.ts` (how clean a body's ice is, its lineae) and `world/iceLook.ts` (the per-pixel look in both views).

Precision: the right order and trend of colours and albedos (snow brightest, bluer as light goes deeper), and the right shapes and scales of features on real icy bodies. It's a look, not a readout.

Reference cases: Europa, Enceladus, Ganymede, Callisto, Triton, Pluto (Solar System bodies with measured albedos and imaged surfaces), Antarctic blue ice and Arctic sea ice.

## Sources

All accessed 2026-10-05.

### Spore and other games

- **Compton et al., "Creating Spherical Worlds"**, SIGGRAPH 2007 sketch (Maxis), https://www.cs.cmu.edu/~ajw/s2007/0251-SphericalWorlds.pdf (read from the PDF). On texturing: "detail and colour maps are combined according to a control texture. However in our case the control texture must be derived directly from the height field … we take the heightfield thresholded against water level, the gradient, and curvature, and combine them according to a technical-artist-supplied formula." And: "Planets also have atmosphere and temperature settings that control both colour ramps and parameters to our atmosphere and fogging model." So Spore picked its terrain's look from the slope and the water line as well as the height.
- **Spore ModAPI** (reverse-engineered headers and docs), https://github.com/emd4600/Spore-ModAPI, `Spore/Terrain/cTerrainStateMgr.h` and `Documentation/SourceCodeTerrain.md` (read from a clone):
  - A frozen sea has its own material, `TerrainMaterialIndex::TerrainIce` (`0x4`), beside the water and lava ones. Its texture slots are the quad's normal and height maps, `mpIceDetailNear`, `mpIceRamp`, `mpIceDetailMid` and the scatter texture.
  - The textures come from `ice_ramp.rw4` and `ice_lowfrequency.rw4`, and the colour ramps from `planet_color_ramps_ice.32bitImage`, beside `_dead` and `_living`.
  - The terrain has a cliff layer with `kMinCliffGradient`, and the weather an `mIceCloudColor`.
  - So frozen seas had their own coloured, detailed ice material, at two scales of detail. The ramps' actual colours were not extracted (open question).
- **Spore wiki, "Ice planet"**, https://spore.fandom.com/wiki/Ice_planet: "giant hunks of ice, snow and rock … The water is frozen on ice planets."
- **SpaceEngine manual, "Creating a planet"**, https://spaceengine.org/manual/making-addons/creating-a-planet/:
  - "'Ice' - ice specular (solar specular spot follows all curved surfaces of the body), used as an ice mask on a cold planets"
  - "SpecBrightIce - brightness of the solar glare spot on the ice surface"
  - So ice gets a gloss of its own, with a broad glare of the sun.
- **Elite Dangerous: Odyssey patch notes**, via a search summary only (the forum refused the fetch): "snow being shinier and rock being rougher". Not verified verbatim.

### Why ice is blue, and how bright it is

- **Warren & Brandt (2008)**, "Optical constants of ice from the ultraviolet to the microwave: A revised compilation", JGR 113, D14220. Data table: https://atmos.uw.edu/ice_optical_constants/IOP_2008_ASCIItable.dat (read raw). Imaginary index m_im, absorption coefficient α = 4π·m_im/λ:

  | λ (µm) | m_im | α (m⁻¹) |
  |---|---|---|
  | 0.400 | 2.365E-011 | 0.000743 |
  | 0.460 | 1.325E-010 | 0.00362 |
  | 0.550 | 2.289E-009 | 0.0523 |
  | 0.610 | 6.890E-009 | 0.1419 |
  | 0.700 | 2.900E-008 | 0.5206 |

  Red light (700 nm) is absorbed ~200× faster than blue (450 nm), so the further light goes into ice before coming back out, the bluer it is.
- **NSIDC, "Science of snow"**, https://nsidc.org/learn/parts-cryosphere/snow/science-snow: "Deep snow tends to absorb red light, reflecting the blue tints often seen in snow."
- **Bintanja (1999)**, "On the glaciological, meteorological, and climatological significance of Antarctic blue ice areas", Rev. Geophys. 37(3), doi:10.1029/1999RG900007 (abstract via Crossref, read raw): "An important feature of blue ice is its relatively low albedo (0.56) compared with that of snow (0.80). Blue ice is probably considerably smoother than snow".
- **Perovich et al. (2002)**, "Seasonal evolution of the albedo of multiyear Arctic sea ice", JGR 107, doi:10.1029/2000JC000438 (abstract, via the research agent): "In April the surface albedo was high (0.8–0.9) and spatially uniform … values ranging from 0.1 for deep, dark ponds to 0.65 for bare, white ice".
- **Cuffey & Paterson (2010)**, *The Physics of Glaciers*, as cited in a J. Glaciology paper (via the research agent): albedo "from >0.9 on fresh dry snow to <0.1 on debris-rich ice surfaces". The full per-class table is unverified.
- **NASA Jovian satellite fact sheet**, https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html (read raw), visual geometric albedo: Io 0.62, Europa 0.68, Ganymede 0.44, Callisto 0.19. The Saturnian and Neptunian sheets (via the agent): Enceladus 1.0, Triton 0.72.

### What icy bodies look like

- **NASA PIA19048**, Europa from Galileo in approximately natural colour, https://photojournal.jpl.nasa.gov/catalog/PIA19048: "areas that appear blue or white contain relatively pure water ice, while reddish and brownish areas include non-ice components"; polar regions "noticeably bluer … thought to be due to differences in ice grain size". Colours sampled from the central 40% of the image (the agent's script; exposure-dependent, so only hue and saturation are useful):
  - brightest 10%: #b0b3b6, hsl(210°, 0.04, 0.70)
  - bluest 10%: #7e8993, hsl(209°, 0.09, 0.54)
  - reddest 10% (lineae and chaos): #8b7065, hsl(17°, 0.16, 0.47)
  - reddest 2%: #8f695b, hsl(16°, 0.22, 0.46)
- **PSRD, "Europa's bands"**, http://www.psrd.hawaii.edu/Nov02/EuropanBands.html: ridges "are about 1 km wide"; a dark band "is 25 km wide and extends for over 900 km".
- **Enceladus's tiger stripes**: "about 130 kilometers long and 35 kilometers apart" (EarthSky on Hemingway et al. 2019; the game's geysers already place their stripes by these, see geysers.md).
- **Pluto's Sputnik Planitia**: "irregular polygons about 20-30 kilometres in diameter" (Trowbridge et al. 2016), "about 10 to 40 kilometres across" (McKinnon et al. 2016), via the abstracts. Not drawn yet (open question).

### Rendering techniques

- **Wrap lighting** for light scattered through a translucent body, GPU Gems ch. 16, https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering: `(NdotL + wrap) / (1 + wrap)` with wrap 0.2, and a tint in the band where it ends, `smoothstep(0, w, x) * smoothstep(2w, w, x)` with w 0.3 (red for skin; blue for ice).
- **Glitter**: Journey's sand as written up by Zucconi, https://www.alanzucconi.com/2019/10/08/journey-sand-shader-5/. A random normal per small cell; it sparkles where the sun's reflection off it lines up with the eye, drawn brighter than white.
- **Snow's reflection** is diffuse but not isotropic, with a forward peak (Hudson et al. 2006, https://atmos.washington.edu/~sgw/PAPERS/2006_BRDF.pdf; Dumont et al. 2010). No measured statistics for single glints were found.

## Measurements

The colour of daylight after a path through ice: a 6504 K black body's spectrum × exp(−α·path) with Warren & Brandt's α, through the CIE 1931 observer (Wyman, Sloan & Shirley's 2013 fit, as `gen/incandescence.ts` uses), white-normalised, to linear sRGB:

```python
import math
tab = []
for line in open('IOP_2008_ASCIItable.dat'):      # Warren & Brandt 2008
    p = line.split()
    if len(p) < 3: continue
    w = float(p[0])
    if 0.38 <= w <= 0.78: tab.append((w * 1000, 4 * math.pi * float(p[2]) / (w * 1e-6)))
def absorp(nm):
    for (w0, a0), (w1, a1) in zip(tab, tab[1:]):
        if w0 <= nm <= w1:
            t = (nm - w0) / (w1 - w0); return math.exp(math.log(a0) * (1 - t) + math.log(a1) * t)
    return tab[-1][1]
def g(x, mu, s1, s2):
    s = s1 if x < mu else s2
    return math.exp(-0.5 * ((x - mu) / s) ** 2)
def xyz(l):                                        # Wyman, Sloan & Shirley 2013
    x = 1.056*g(l,599.8,37.9,31.0) + 0.362*g(l,442.0,16.0,26.7) - 0.065*g(l,501.1,20.4,26.2)
    y = 0.821*g(l,568.8,46.9,40.5) + 0.286*g(l,530.9,16.3,31.1)
    z = 1.217*g(l,437.0,11.8,36.0) + 0.681*g(l,459.0,26.0,13.8)
    return x, y, z
def planck(l, T):
    l *= 1e-9; return 1 / (l ** 5 * (math.exp(1.4388e-2 / (l * T)) - 1))
def col(d, T=6504):
    X = Y = Z = X0 = Y0 = Z0 = 0
    for l in range(390, 781, 5):
        s = planck(l, T); x, y, z = xyz(l); t = math.exp(-absorp(l) * d)
        X += s*x*t; Y += s*y*t; Z += s*z*t; X0 += s*x; Y0 += s*y; Z0 += s*z
    X, Y, Z = X / X0 * 0.9505, Y / Y0, Z / Z0 * 1.089
    return Y, (3.2406*X - 1.5372*Y - 0.4986*Z, -0.9689*X + 1.8758*Y + 0.0415*Z, 0.0557*X - 0.2040*Y + 1.0570*Z)
for d in [0.5, 1, 2, 5, 10, 20, 50]:
    Y, lin = col(d); print(d, round(Y, 3), [round(c, 3) for c in lin])
```

| Path | Luminance Y | Linear sRGB | `iceTransmission` (fit) |
|---|---|---|---|
| 0.5 m | 0.964 | 0.904, 0.978, 1.002 | 0.900, 0.978, 1 |
| 1 m | 0.930 | 0.816, 0.956, 1.004 | 0.811, 0.956, 1 |
| 2 m | 0.868 | 0.663, 0.914, 1.008 | 0.657, 0.914, 1 |
| 5 m | 0.716 | 0.339, 0.798, 1.015 | 0.350, 0.799, 1 |
| 10 m | 0.543 | 0.063, 0.637, 1.018 | 0.122, 0.638, 1 |
| 20 m | 0.346 | −0.108, 0.414, 1.006 (out of gamut) | 0.015, 0.407, 1 |

Each channel falls almost exactly exponentially over 0.5–5 m, so `ICE_ABSORPTION` = (0.21, 0.045, 0) per metre reproduces it within 0.012. Past 10 m red leaves the gamut (negative), and the fit's red stays small and positive instead. `tests/ice.test.ts` pins the 1, 2 and 5 m rows within 0.02.

The surface classes (`ICE_CLASSES`), each scaled so its luminance is its albedo:

| Class | Albedo | Path | Colour |
|---|---|---|---|
| snow | 0.85 (fresh, Bintanja's 0.80 to Cuffey & Paterson's > 0.9) | 0.3 m | #e9eef0 |
| firn | 0.7 | 1.5 m | #c7dee5 |
| sea ice | 0.65 (Perovich: bare white ice) | 2 m | #bad8e1 |
| blue ice | 0.56 (Bintanja) | 5 m | #8fcfe5 |
| lead | 0.2 (Perovich: ponds down to 0.1) | 15 m | #2683b3, greyed in the game |

How clean an icy body's ice is follows its surface albedo (`CLEAN_ALBEDO` 0.25 → 0.65): Callisto (0.22 in gen/sol.ts) is dirty (0), Ganymede (0.44) half, Europa (0.68), Enceladus (0.81) and the generated ice worlds (0.55–0.75) clean. How cracked it is follows the heat flow (`LINEAE_HEAT` 0.004 → 0.05 W/m²): Callisto (0.005 W/m²) none, Ganymede (0.01) 1 linea, Triton (0.02) 8, Enceladus (0.03) 17, Europa (0.05) and an Earth-sized ice world (~0.09) the full 28.

## Game mapping

- **Palette** (`gen/iceColor.ts`, `gen/planets.ts`): generated ice worlds' frozen sea is blue ice (albedo 0.5–0.62), the lowland firn (0.6–0.75), the highland snow, each turned to the world's drawn hue (185–215°). **Stylised:** real bare sea ice (0.65, ~2 m) is as pale as the firn, so the sea and the land couldn't be told apart from orbit; Spore's frozen seas read blue. The same draws as before, so nothing else in the universe moves (tested). Sol's icy bodies keep their hand-picked colours (gen/sol.ts).
- **The look** (`world/iceLook.ts`), on the game's lit terrain material in both views and on low orbit's frozen sea:
  - **Ground, as Spore picks its textures from the slope and the water line:**
    - Snow lies on flat ground.
    - Slopes from about 14° to 30° (1 − cos 0.03 → 0.13) go to bare blue ice, crevassed where steepest.
    - Wind-scoured patches of blue ice lie on the low plains, and fresh snow drifts elsewhere, stretched east–west.
  - **Frozen sea, after Spore's separate ice material and two detail scales:**
    - Floes of sea ice, some bluer and bare, some snowier, at two scales (48 and 16 units).
    - White pressure ridges along most of their edges, bumped up.
    - Dark leads along the rest.
    - Drifted snow over them.
  - **Lineae** (`gen/ice.ts`): arcs of great and small circles.
    - Up to 28 a body, half-widths 0.003–0.02 rad and half-lengths 0.25–1.4 rad.
    - Europa's bands are 0.0006–0.016 rad wide, widened so they read on a globe a few hundred pixels across: **stylised**.
    - Coloured as Europa's reddest pixels, hsl(16°, 0.22, 0.46), but 0.18 more saturated so they read from orbit: **stylised**.
    - Half of them have a bright central ridge (a triple band).
    - Chaos terrain blotches the same colour where a broad noise peaks, as strong as the lineae.
    - An equirectangular index (`lineaeIndex`, 128 × 64) lists the ≤ 4 lineae near each spot, so a pixel tests those instead of all 28. Under SwiftShader this took the system view from 27 to 39 FPS.
  - **Light:**
    - Bare ice is glossy (roughness 0.35, leads 0.12) and snow matte (0.8), so the sun's glare runs over the bare ice and the sea, as in SpaceEngine.
    - Blue light scattered through the ice shows along the terminator: GPU Gems's wrap 0.2, width 0.3, tinted blue ice. **Stylised** strength.
    - Snow sparkles: one random facet per 0.45-unit cell, and it glints when it mirrors the sun into the eye. **Stylised**: no measured glint statistics were found.
  - **Dirty and real bodies:**
    - Dirty ice (low `clean`) gets none of the blue, gloss, snow or sparkle, and keeps its own colours.
    - A body with a real colour map (Pluto) keeps it, with only the light effects added.
  - **Fading:** every detail fades to its average under ~8 pixels, so the system view (in system units, scaled ×`PLANET_SCALE` to match) and low orbit agree across the zoom.
- **Titan-like worlds:** their seas are liquid methane where their weather is methane, and are left as before.
- **Tunables:** debug folder Ice (`iceParams`).
- **Headless SwiftShader FPS** (Earth-sized ice world `gen=7`, `?quality=low`), before → after:
  - low orbit: 15 → 5 (a terran world's water there: 3, a lava world: 4)
  - system view close up: 55 → 39 (terran 12, lava 52)

## Open questions

- Spore's actual ice colour ramps (`planet_color_ramps_ice.32bitImage`, `ice_ramp.rw4`) weren't extracted from the game files. The palette here is real ice's, not Spore's.
- Pluto's Sputnik Planitia convection cells (10–40 km) and Triton's cantaloupe terrain aren't drawn.
- The surface classes' paths (how far light goes in each) are picked so their tints match. The real path depends on grain size and isn't measured here.
- The lineae's real width distribution (Kattenhorn & Hurford: double ridges 0.2–4 km, bands to ~30 km) was seen only in a search summary.
