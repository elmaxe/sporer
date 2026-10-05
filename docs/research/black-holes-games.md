# Black holes in games and real-time renderers

## Question

Black holes are coming to the game: rare systems you can enter, with an accretion disc and gravitational lensing, and later a "black hole gun". Before building them: how have other games and real-time renderers drawn black holes, what did they make them do, and which rendering techniques fit a WebGL2 game (per-pixel cost, how the sky and the scene's own objects get bent)?

## Sources and method

All accessed 2026-10-05. Pages were read raw with curl and stripped to text where possible; wiki pages through the MediaWiki API (`api.php?action=parse&prop=wikitext`), papers as PDF with `pdftotext`. WebFetch was used only where curl was blocked, and its summaries are marked as such. Quotes below are what the pages say. Blocked or unreadable: the Frontier forums (403 / bot challenge, also through web.archive.org), Shadertoy (Cloudflare challenge), the Stellaris wiki (bot challenge), Medium (403), the EHT website (403; the ESO copies of the press releases were read instead).

---

## 1. Spore (space stage)

- **Black hole**, Spore wiki (wikitext via API): https://spore.fandom.com/wiki/Black_hole
  - "They allow the player's spaceship to traverse large distances across the Galaxy in seconds. However, the player must possess a Wormhole Key in order to travel safely through it. Flying close to a black hole without the Wormhole Key will not result in ship destruction, but it will be impossible to pass through without the key."
  - "the connections and names are different for each person"; the location list is "complete (336 black holes)". "Some black holes lead to 'hubs' where 1-3 other black holes can be found within 20 or so parsecs."
  - Trivia: "On higher graphics settings, black holes have a gravitational lensing effect." "Turning on the Visited Systems filter will link black holes with their counterparts once both black holes have been traveled through." "The cutscene when traveling through a black hole resembles the effect whenever somebody steps though a portal in *Stargate*."
- **Wormhole Key**: https://spore.fandom.com/wiki/Wormhole_Key
  - Infobox: "Allows you to fly through a black hole unharmed." Requires Frequent Flyer 3 or Traveler 3. Price: 3,000,000 Sporebucks from your own empire, 1,500,000 from Diplomat, Scientist, Trader or Zealot empires.
  - "The tool allows the player to use the various black holes as a wormhole connecting two random black holes. Once traversed, the black holes remain linked to each other. These links persist across all saved games."
- **Galactic Core**: https://spore.fandom.com/wiki/Galactic_Core
  - "The Core is a uniquely colored black hole with two extremely large jets shooting out of its poles." Approaching it, "the travel range of the player's spaceship continually reduces"; "The pointer on your travel range will go haywire". Entering plays a cutscene through "a large wormhole" to Steve and the Staff of Life.

**Takeaway.** In Spore a black hole is a navigation feature: a late-game key turns every black hole into a randomly paired wormhole, and the links show on the map once both ends have been used. Lensing was a high-settings extra. The core is the only one drawn with jets. I couldn't find a first-hand description of how ordinary black holes look in-system beyond the wiki's images.

## 2. Elite Dangerous

- **Black Holes**, Elite Dangerous wiki (wikitext via API): https://elite-dangerous.fandom.com/wiki/Black_Holes
  - In-game description: "otherwise the body is only visible by the gravitational distortion in the vicinity."
  - "Although they cannot be flown into directly due to their exclusion zones, they still present a minor hazard to travelers. In most cases, arriving in a system with a black hole will result in the pilot's ship almost immediately colliding with the exclusion zone and making an emergency drop into normal space, unless they immediately reduce their throttle".
  - "A popular misconception about black holes is that dropping into one's exclusion zone will result in the player's ship continuously accumulating heat or hull damage ... In fact, neither type of damage is inflicted".
  - Gallery caption: "Black Hole on edge of galaxy, can only be seen when looking towards the Galactic plane". The lensing only shows where there is something bright behind to bend.
- **Sagittarius A***: https://elite-dangerous.fandom.com/wiki/Sagittarius_A* . The galaxy's one supermassive black hole, 25,899.99 ly from Sol, a traditional explorers' destination.
- **Steam discussion** "it's me or the black hole are massivly ugly?" (2017): https://steamcommunity.com/app/359320/discussions/0/1471969431583699778/
  - Player (Nov 2017): "the lensing effect only affects the background stars and nebulae, not the objects orbiting the black hole itself. I tested this with the black hole in Maia and it never lensed the orbiting bodies".
- **Frontier forum thread titles** (bodies not readable, 403): "Why do black holes in ED just look like lenses no event horizons, accretion discs or jets?" (https://forums.frontier.co.uk/threads/why-do-black-holes-in-ed-just-look-like-lenses-no-event-horizons-accretion-discs-or-jets.280372/), "Thank You Frontier for Fixing Black Hole Lensing, For Science!" (https://forums.frontier.co.uk/threads/thank-you-frontier-for-fixing-black-hole-lensing-for-science.244860/). A search-engine summary says the fix made "the background stars only move when the player's ship moves". **Not verified**: the thread couldn't be read.

**Takeaway.** Elite's black holes are a lens on the skybox only: no disc, no jets, and nearby planets aren't lensed. The gameplay is the exclusion zone that knocks you out of supercruise on arrival. Players' main complaint is that there's nothing to look at but the lens. I found no developer talk about the technique.

## 3. SpaceEngine

- **"General relativity 1: Kerr black holes"** (dev blog, 2022-07): https://spaceengine.org/news/blog220705/
  - "SE will now render all of these phenomena based on real physics, rather than the fake (artistic) approximations that were used before ... our new programmer Mykhailo Moroz, who developed a real-time 4D spacetime geodesic ray-tracer."
  - "we were able to achieve 60 fps in 4k at some distance from the black hole on an RTX 2080 ... we don't really need to trace geodesics at the screen resolution, and doing this at 1/3 resolution speeds things up by a factor of 9. So we rendered the warp vector in a smaller render target during the first pass, then used it to warp the background in full resolution during the second pass." The cost of this is that the shadow's edge "shows sampling artifacts because it is computed in a lower resolution".
  - **Scene objects:** "The background warping is done like before: it is a screen-space image displacement, with additional skybox sampling in places where the shader has no screen data. The closer you are to the event horizon, the more pixels are sampled from the skybox." The skybox's resolution and update interval are settings, and "Gravitational lensing precision ... is actually a modifier for the geodesic tracer step length."
  - Comparison image: "resolution = 0.35, 120 FPS" against "resolution = 1.0, 29 FPS".
- **"General Relativity 3: Volumetric Accretion Disks"** (2022-08-30): https://spaceengine.org/news/blog220830/
  - "SpaceEngine renders black holes in two passes: a low-resolution computation pass, and a full-resolution upscaling pass. The computation pass computes the geodesic ... while also integrating the brightness and opacity of the accretion disk, and stores the result in two (low-res) textures: a deflection vector, and an integrated disk brightness/opacity." "The low-resolution pass also uses some animated noise to reduce banding artifacts".
  - Earlier versions (from 0.980) had "flat, two-dimensional accretion disks: this was a 'fast and cheap' solution". The new disc is "procedurally-generated and animated noise ... the shape of the hot plasma 'clouds'".
  - "hotter toward the center, and cooler toward the edge"; "a strong Doppler shift effect: the side that moves toward the observer appears hotter and brighter than the one moving away".
  - Jets used to be sprites, which "were not warped by the gravitational lensing effect, and looked out of place". Now they're in the same shader, so "jets cannot be very long, since they can't go outside the shader rendering volume (which is a sphere, typically limited by the edge of the accretion disk)".
  - Light-travel time is included, so the disc animation slows or reverses as the camera moves fast.
  - "all accretion disks rotate at almost the same linear speed (about the speed of light at 3 Rg)"; the period scales with mass: about 18 min for Sgr A*, about 20 days for M87*, around 10 s for globular-cluster black holes of hundreds to thousands of solar masses. It also notes that EHT images are radio and "would not look like" these objects do in visible light.
- **Release notes** (2022-12-16): https://spaceengine.org/news/blog221216/ . Lists Kerr-Newman black holes, volumetric discs and jets, and a known issue: "Background stars look 'pixelated' when looking at or from near black holes".

**Takeaway.** This is the state of the art for a real-time engine. It traces geodesics at low resolution into a deflection texture (plus disc colour and opacity), then upscales. The background is screen-space displacement that falls back to a skybox. The volumetric disc has temperature falling outward and Doppler brightening, and the jets sit inside the same bounded sphere. Wormholes are separate traversable objects.

## 4. No Man's Sky

- **Black Hole** (current), NMS wiki (API): https://nomanssky.fandom.com/wiki/Black_Hole
  - "Black Holes take you to a fixed star system across the galaxy. Black Hole travel no longer damages anything as of the Waypoint update. Black holes will always move you closer to the centre by approximately 7,000 light-years (+/- 1,000 ly)". There's also a network of "hyper black holes" in the spiral arms that can jump over 300,000 ly towards the centre.
  - "Every region has exactly one Black Hole System". On the galactic map they're "highlighted ... as a black star". There are "Rogue black holes ... as a rare space encounter in any system".
- **Black Hole (Atlas)**, older version: https://nomanssky.fandom.com/wiki/Black_Hole_(Atlas) . Back then black holes went to "a random system" and would "randomly damage one of your Starship technologies".
- **Endurance update** (2022-07, Hello Games): https://www.nomanssky.com/2022/07/no-mans-sky-endurance-update/ . "There are new Interstellar-style black holes, nebulae, and space atmospherics to explore." A search summary of the patch notes says "black hole visuals have been overhauled" and travel is "more cinematic". The full notes weren't read.
- Steam threads (search summaries only) describe the look as a large distortion with a black centre. I couldn't verify how NMS renders them.

**Takeaway.** In NMS a black hole is a one-way warp toward the galactic centre, with a cinematic tunnel. It used to cost you broken tech. Since 2022 it's drawn "Interstellar-style".

## 5. Outer Wilds

- **White Hole**, official wiki (API): https://outerwilds.fandom.com/wiki/White_Hole
  - "linked to the Black Hole at Brittle Hollow's core. ... Objects that fall into Brittle Hollow's black hole disappear and exit from the White Hole." "the surroundings are entirely zero-gravity - Objects exiting the White Hole quickly come to rest". "should the player fall into the black hole, they will always exit facing the White Hole Station, regardless of their entry vector."
  - Over the loop, meteor strikes knock pieces of the crust into the black hole, and they turn up round the White Hole. Lore: "objects falling into a Black Hole exit its White Hole slightly *before* falling in".
- **Black Hole**: https://outerwilds.fandom.com/wiki/Black_Hole . The Nomai made black holes at the "Black Hole Forge" for warp cores, and the game's warp travel is built on "black holes accepting all matter, and the white holes rejecting them".
- **Mobius Digital dev update "Brittle Hollow - Visual Effects"**: https://www.mobiusdigitalgames.com/news/brittle-hollow-visual-effects-vfx
  - "While it isn't a perfectly accurate representation of a real black hole, we wanted it to be as close as possible visually. The shader of the black hole simulates the way light bends around it, so as you approach the event horizon your field of vision gets increasingly distorted. When the black hole consumes a fragment, it emits a jet of particles so you can tell where the fragment fell through."
- A fan remake of the shader exists (Quentin King, https://quentinking.com/shaders/blackhole/) but its text couldn't be read. **How the original shader works is not verified.**

**Takeaway.** Outer Wilds uses a small black hole as a hazard and a one-way teleporter paired with a white hole: fall in, come out somewhere fixed. It's drawn as a lensing shader over a black sphere, and swallowing something gives a particle burst. The lensing is a "close enough" artistic effect.

## 6. Others, briefly

- **Kerbal Space Program, "Singularity" mod** (LGhassen): https://github.com/LGhassen/Singularity and its wiki (raw `Home.md`): https://github.com/LGhassen/Singularity/wiki
  - "Starting at the camera, light's trajectory is traced around the black hole in a finite number of iterations. At every step the light's trajectory is bent by the amount of gravity it should receive until it hits the black hole or we run out of iterations (usually the ray escapes at that point)."
  - **Scene objects:** "Once the exiting ray is determined, we try to find the resulting object color from the on-screen color+depth buffer, if that fails we try to retrieve it from a cubemap centered around the black hole. If no object is found we retrieve the color of the static galaxy background." The object cubemap: "One face of this cubemap is rendered every frame".
  - "This is not a physically correct simulation ... the force exerted by gravity fades by the square of the distance, but no real physical equations or constants are used." The `gravity` setting is unitless, and a negative value makes "a sort of 'white hole' that pushes light away (looks like a mirror from the front)". It renders inside "a 'containing sphere'" that can be scaled up so nearby objects aren't "cut off". The disc is a texture with inner and outer radius and a rotation speed, and "Multiple singularities can have the same target" for wormholes. GitHub's description says it is "based on Pim Schreurs' Interstellar simulation."
- **Universe Sandbox**: https://universesandbox.com/ lists "Light-warping black holes" as a headline feature. A Steam thread (https://steamcommunity.com/app/230290/discussions/0/5260781909046963581) has players discussing how they look. The game doesn't generate accretion discs itself according to a search summary (not verified on an official page). I couldn't find a technical description.
- **Stellaris**: black holes are a system type, and the Matter Decompressor megastructure is "built in delicate orbit around a black hole" to mine it (search summary of community pages). The wiki was unreadable through the proxy. A search summary also says black hole systems reduce sublight speed and disengagement chance. **Not verified**, so no numbers here.
- **Starfield**: no black holes, going by community answers (GameFAQs and game8 via search). Not verified on an official source.
- **Star Citizen**: I found no black hole in the game, only fan posts. Not verified.

## 7. Interstellar's Gargantua (Double Negative Gravitational Renderer, DNGR)

- **James, von Tunzelmann, Franklin & Thorne 2015**, "Gravitational lensing by spinning black holes in astrophysics, and in the movie Interstellar", Class. Quantum Grav. 32 065001, arXiv: https://arxiv.org/abs/1502.03808 (PDF read)
  - Cost: "it typically takes from 30 minutes to several hours running on 10 CPU cores to create a single IMAX image"; DNGR "has 40,000 lines of C++".
  - The film's disc was artist-made, "very anemic compared to the disks that astronomers see ... so the humans who travel near it will not get fried". It "has cooled to a position-independent temperature T = 4500K".
  - **Spin:** "Christopher Nolan and Paul Franklin decided that the flattened left edge of the black-hole shadow, and the multiple disk images alongside that left edge, and the off-centred disk would be too confusing for a mass audience. So ... for visual purposes Nolan and Franklin slowed the spin to a/M = 0.6".
  - **Doppler:** with the disc moving at "roughly 0.55c", frequencies shift "by multiplicative factors of order 1.5 and 0.4 respectively when one combines the Doppler shift with a ∼ 20 percent gravitational redshift". With brightness included, "the disk's left side, moving toward the camera, has become very bright, while the right side, moving away, has become very dim". "A fully realistic accretion disk, Figure 15c, that is exceedingly lopsided, with the hole's shadow barely discernible, was obviously unacceptable." The film used the version without frequency shifts (Fig. 15a), plus a simulated IMAX "veiling flare" ("the look of a soft glow").
  - Disc geometry, from the paint-swatch test: the image of the disc's top face "swings up over the shadow and back down to close on itself", because light from the far part of the top face, behind the hole, comes "up over the top of the hole and down to the camera". The bottom face appears wrapped under the shadow, and a third, thinner image hugs the shadow's edge.

**Takeaway.** The film turned off Doppler colour and beaming, and slowed the spin, on purpose, because the realistic result was too lopsided to read. Instead it added a lens glow. A game can do the same: make Doppler beaming a tunable strength rather than all or nothing.

## 8. Real-time techniques

### Riccardo Antonelli, "Starless" and the real-time applet
- Page: https://rantonels.github.io/starless/ ; code: https://github.com/rantonels/starless (`tracer.py`, GPL according to the README of vlwkaos/threejs-blackhole that reuses it); real-time applet: http://spiro.fisica.unipd.it/~antonell/schwarzschild/ (not opened).
  - About the applet: "The trick was of course to precalculate as much as possible about the deflection of light rays." Starless itself is an offline CPU (numpy) tracer.
  - **The trick:** the photon orbit equation is u''(φ) + u = (3/2)u³ (u = 1/r, units where the Schwarzschild radius r_s = 1), and it has the form of a Binet equation. So you can integrate a fake Newtonian particle with "F(r) = −(3/2) h² r̂ / r⁵", where h = |x × v| is constant along the ray, in plain Cartesian coordinates. The page's pseudocode reads `a = - 1.5 * sqr(h) * x / (x^6)`, a typo; the code has `accel = - 1.5 * h2 * point / np.power(sqrnorm(point),2.5)`, which is a = −1.5 h² x / |x|⁵. Integrator: leapfrog at first, later RK4 "to be able to increase step size".
  - Horizon test in the code: `pointsqr < 1` (r < r_s). Shadow: "absorbed rays are those arriving with an impact parameter of less than ~ 2.5 radii" (exactly 3√3/2 ≈ 2.60 r_s, consistent with Bruneton's µ = 4/27 below). Photon sphere at 1.5 r_s.
  - Disc: thin, from the ISCO "(3 r_s)" outward, with "T ∼ r^{-3/4}". It needs to be pulled down "to around 10 000 K at the ISCO for us to be able to see anything". Colour comes from a blackbody lookup texture (Mitchell Charity's), and brightness ∝ (e^{29622.4 K / T} − 1)^{-1}.
  - Redshift: (1+z)_Doppler = (1 − β cos θ)/√(1−β²), times (1+z)_grav = (1 − 1/r)^{-1/2}. In the code the disc speed is `0.70710678 * (r-1)^-0.5`, i.e. β = √(1/(2(r−1))) (r in r_s), which is 0.5 at the ISCO.
  - Compositing: everything is emissive, so the colour is built by alpha-blending each hit "with the farthest at the bottom" until the ray is opaque or escapes.
  - Result: with realistic Doppler "most of the disc is completely white, because it saturates the colour channels". He used bloom but found it "hardly sufficient".

### Eric Bruneton 2020, "Real-time High-Quality Rendering of Non-Rotating Black Holes"
- arXiv:2010.08735 (PDF read): https://arxiv.org/abs/2010.08735 ; code (WebGL2, BSD licence) and demo: https://github.com/ebruneton/black_hole_shader , https://ebruneton.github.io/black_hole_shader/
  - "a simple ray-marching algorithm can render a sky map texture distorted by a black hole in real-time, but not with a high quality (e.g. stars become curved segments instead of staying punctual)".
  - Method: "precomputed beam tracing". Each pixel's ray is reduced to one angle in its own plane. A 512×512 table D(e, u) holds the deflection (and time) for rays from infinity, and a 64×32 table U(e, φ) holds disc intersections. With these, "at most two intersections" are found in constant time. Precomputation takes about 11 s on a CPU. Geodesic: u̇² = e² − u²(1 − u), ü = 3u²/2 − u. Rays with e² > µ = 4/27 fall in.
  - Stars: the escape direction looks up a cube map, filtered by hand so that point stars stay points. Each texel stores one star; the pixel footprint comes from screen-space derivatives. Nebulae use ordinary anisotropic filtering.
  - Disc: thin, "T⁴(u) ∝ u³(1 − √(3u))", with density from procedural particles on precessing orbits. Doppler and beaming are precomputed into a 3D colour texture C(xy, D). Bloom is used for glare.
  - Speed (1920×1080, GTX 960): about 150 fps with the tables, against 43 fps "with TRACERAY replaced with ray-marching" (Table 1, M1 vs M3).

### Mykhailo Moroz, "Tracing Geodesics" (became SpaceEngine's tracer)
- https://michaelmoroz.github.io/TracingGeodesics/
  - A general Hamiltonian tracer in GLSL for any metric: "Essentially this is just a 4D ray marching algorithm where the direction of the ray changes every step."
  - **Adaptive step:** "in the case of black holes I change the time step proportionally to the distance to the event horizon, so that the accuracy of the geodesic is roughly proportional to the curvature of space. This is an important optimization to get accurate results, while keeping the computational cost relatively small."
  - The basic example: 256 steps, then `texture(iChannel0, RayDir)`, a cube map lookup of the final direction.

### Otto Seiskari, three.js / WebGL black hole
- https://github.com/oseiskar/black-hole ; physics notes: https://oseiskar.github.io/black-hole/docs/physics.html ; demo: https://oseiskar.github.io/black-hole/
  - "the light ray paths are computed by integrating an ODE describing the Schwarzschild geodesics using GLSL on the GPU, leveraging WebGL and three.js". Units: "the Schwarzschild radius of the black hole is one".
  - It integrates u″(φ) = −u(1 − 3/2 u²) with leapfrog. "the step size Δφ_j is varied using an ad hoc formula, in addition to using the classical approximation dt² ≈ dx² + dy² + dz² at large distances".
  - Doppler factor δ = γ(1 + d·v). "λ_o = δ λ_s and intensities by I(λ_o) = δ^{−3} I(λ_s)". "The perceived (RGB) colors corresponding to any fixed spectrum I can be precomputed in a one-dimensional lookup table (texture) as a function of the Doppler factor."
  - Performance: "runs 30+ fps at resolution 1920 x 1080 in Chrome 48 on a Linux desktop with GeForce GTX 750 Ti and 'high' simulation quality". Known artefacts: "The light paths bend a bit more than they should due to low ODE solver step counts" (systematic, so it looks right), and "Texture sampling issues cause unintended star blinking."

### Other open projects
- **Ross Ning, "Real-time Black Hole Rendering in OpenGL"** (C++/OpenGL, not WebGL): https://github.com/rossning92/Blackhole . `shader/blackhole_main.frag` uses Antonelli's acceleration (`-1.5 * h2 * pos / pow(r2, 2.5)`) with a **fixed** `STEP_SIZE = 0.1` and up to 300 iterations, breaking when `dot(pos,pos) < 1.0`. It has a volumetric noise disc and samples `texture(galaxy, dir)`, a cube map lookup of the final direction.
- **vlwkaos/threejs-blackhole**: https://github.com/vlwkaos/threejs-blackhole . A three.js port of Starless and oseiskar: "Lorentz transform, Doppler shift, Relativistic beaming, Accretion disk", bloom.
- **peabrainiac/black-hole-renderer** (WebGL, 2023): https://github.com/peabrainiac/black-hole-renderer . Built on Moroz's post, with "(definitely artistic and not physically based) accretion disk". Lensing of other scene objects was written but left disabled ("haven't yet found the time to render those objects in the correct position").
- **Dan Greenheck, "Raytracing a Black Hole with WebGPU"** (three.js TSL, 2026-01-07): https://threejsroadmap.com/blog/raytracing-a-black-hole-with-webgpu . Draws on a large inverted `SphereGeometry` "perfect for a skybox-style shader", with a procedural starfield and nebula instead of a cube map, fixed `stepSize` marching, disc crossing found by watching y change sign and interpolating, blackbody disc colour and Doppler beaming.
- **Shadertoy**: the site is behind a Cloudflare challenge, so nothing was read there. Search results name "Gargantua With HDR Bloom" by sonicether (Cody Darr; his 2016 tweet: https://x.com/sonic_ether/status/719470660074889216) as the best-known one, at https://www.shadertoy.com/view/lstSRS according to a search summary. **ID and view counts not verified.** Moroz's post links a Shadertoy with a variable time step and the Kerr-Newman metric.
- **Unity tutorial, Kelvin van Hoorn, "Supermassive black hole tutorial"** (URP, HLSL, 2021): https://kelvinvanhoorn.com/tutorials/supermassive_black_hole_tutorial/
  - The shader goes on "the basic Unity sphere" with front faces culled, so the effect is limited to that mesh. It ray-marches with fixed steps (`_Steps` 256, `_StepSize` 0.1), and the gravity is Newtonian: "a gravitational constant, that we set, divided by the distance to the centre squared", `currentRayDir = normalize(currentRayDir + dirToCentre * force * _StepSize)`.
  - **Background is screen space:** "we'll be distorting the screenUV using the last ray position and use that to sample the opaque texture ... using a camera projection of a distorted ray direction", with a fade near the screen edges. Rays break out once they leave the bounding sphere.
- **Unreal**: Hacker News thread "Black Hole Visualization in Unreal Engine" (overdrawxyz, 2020): https://news.ycombinator.com/item?id=24773546 (via WebFetch summary). Ray marching "within a single shader". No technical write-up found.

### Technique summary (what the sources agree on)
| Problem | What's done | Who |
|---|---|---|
| Bending the ray | Integrate a = −1.5 h² x/\|x\|⁵ (r_s = 1) in Cartesian coordinates; or u(φ) with leapfrog; or a general Hamiltonian | Antonelli, Ross Ning, vlwkaos; oseiskar; Moroz/SpaceEngine |
| Step cost | Step ∝ distance to the horizon; larger steps far away; cap the iterations; stop when r < 1 or the ray leaves the bounding sphere moving outward | Moroz, oseiskar, van Hoorn, Singularity |
| Constant-time alternative | Precomputed deflection and disc-intersection tables (512×512, 64×32) | Bruneton (WebGL2, BSD) |
| Resolution | Trace at 1/3 to 1/2 resolution into a deflection texture (+ disc RGBA), upscale; animated noise against banding | SpaceEngine |
| Where it's drawn | Only inside a bounding sphere mesh (or SE's "shader rendering volume") | Singularity, van Hoorn, SpaceEngine, Greenheck |
| Sky | Cube map lookup with the bent ray's final direction | Moroz, Ross Ning, Bruneton (custom star filtering), SpaceEngine (skybox) |
| Scene objects | Screen colour (+ depth) at the projected bent direction, then a cube map centred on the hole (Singularity: dynamic, one face per frame), then the static sky | SpaceEngine, Singularity, van Hoorn (screen only); Elite doesn't lens them at all |
| Disc | Thin plane, crossing found by a sign change of the height, several crossings blended front to back; or a volume with noise | Antonelli, Bruneton, Greenheck; SpaceEngine, Ross Ning |
| Disc light | Blackbody colour from a lookup texture; T ∝ r^{-3/4} or T⁴ ∝ u³(1−√(3u)); Doppler and gravitational shift; beaming I ∝ δ³ (specific) | Antonelli, Bruneton, oseiskar |
| Ray-marching artefacts | Point stars become arcs or blink; shadow edge pixelated at low res; paths over-bent with few steps | Bruneton, oseiskar, SpaceEngine |

## 9. What real images show (NASA, EHT)

- **NASA Goddard, Jeremy Schnittman, 2019-09-25**: https://svs.gsfc.nasa.gov/13326/
  - "Viewed from the side, the disk looks brighter on the left than it does on the right. Glowing gas on the left side of the disk moves toward us so fast that the effects of Einstein's relativity give it a boost in brightness; the opposite happens on the right side". "This asymmetry disappears when we see the disk exactly face on".
  - "we can see the underside of the disk as a bright ring of light seemingly outlining the black hole. This so-called 'photon ring' is composed of multiple rings, which grow progressively fainter and thinner". "Inside the photon ring is the black hole's shadow, an area roughly twice the size of the event horizon".
  - "Bright knots constantly form and dissipate in the disk ... This difference stretches and shears the bright knots, producing light and dark lanes in the disk."
  - phys.org on the same release (WebFetch summary): "Seen nearly edgewise, the turbulent disk of gas churning around a black hole takes on a crazy double-humped appearance." https://phys.org/news/2019-09-nasa-visualization-black-hole-warped.html . The NASA text read here describes the underside as the ring round the shadow. The disc's far side arching over the top is described in the DNGR paper above rather than in these NASA paragraphs.
- **EHT, M87*** (Paper I, ApJL 875 L1, 2019; arXiv:1906.11238, PDF read): https://arxiv.org/abs/1906.11238 . "an asymmetric bright emission ring with a diameter of 42±3 μas ... a central depression in brightness with a flux ratio 10:1" (as extracted from the PDF; the paper may print ≳). "The brightness excess in the south part of the emission ring is explained as relativistic beaming of material rotating in the clockwise direction". ESO release: https://www.eso.org/public/news/eso1907/ . "The black hole's boundary — the event horizon ... — is around 2.5 times smaller than the shadow it casts".
- **EHT, Sgr A*** (2022-05-12), ESO release: https://www.eso.org/public/news/eso2208-eht-mw/ . "a dark central region (called a shadow) surrounded by a bright ring-like structure". The gas "completes an orbit in mere minutes", so the image changed while it was being observed. A search summary gives the ring as 51.8 ± 2.3 μas (not read in the paper).
- SpaceEngine's note above is worth keeping: EHT images are 1.3 mm radio images, and a visible-light view would look different.

In short: the real pictures are a dark shadow about 2.5× the horizon, a thin bright photon ring round it, and a disc brighter on the side coming toward you. Seen near edge-on, the far side of the disc is lensed into an arch over the top and the underside into a ring below.

---

## Takeaways for the game

**Rendering approach for WebGL2 (recommended):**

1. **A bounding sphere mesh round the hole** (like Singularity, van Hoorn, SpaceEngine's volume and Greenheck), drawn with back faces so it still works with the camera inside. Make the radius some tens of r_s, enough to hold the disc and the strong lensing. Outside it, bending is weak, about 2 r_s/b radians for impact parameter b (the classic 4GM/(c²b) with r_s = 2GM/c²), so a soft blend at the rim hides the seam.
2. **Per-pixel geodesic in r_s units with Antonelli's acceleration** a = −1.5 h² x/|x|⁵, h = |x × v|, starting where the view ray enters the sphere (or at the camera). Use leapfrog or RK2, with **step ∝ r** (Moroz; smaller steps near the hole, large ones far away) and an iteration cap (64 to 128). Exit early when r < 1 (black: the shadow) or when the ray is beyond the sphere and moving outward (x·v > 0). These are the costs the sources warn about: too few steps over-bend (oseiskar), and fixed steps waste work far away.
3. **Sky from a cube map** looked up with the final direction (Moroz, Ross Ning, Bruneton). Render the system's background (galaxy, nebula, far stars) into a cube map once on entering the system. Point stars will smear into arcs near the shadow (Bruneton). Mipmaps help, and Bruneton's per-texel star filtering is the fix if it matters.
4. **Scene objects (planets, the ship, other UFOs):** follow SpaceEngine and Singularity. Sample the screen colour at the projection of the bent direction where it lands on screen. Otherwise use a low-resolution dynamic cube map centred on the hole, updating one face per frame as Singularity does. Otherwise use the static sky. Elite skipped this, and its players noticed (orbiting bodies weren't lensed).
5. **Analytic thin disc:** detect plane crossings (sign change of height, interpolate), from the ISCO at 3 r_s out to the chosen outer radius. Allow several crossings and composite front to back, which gives the far side arching over the top, the underside below, and the thin higher-order ring at the shadow's edge for free. For temperature use T ∝ r^{-3/4} (Antonelli) or T⁴ ∝ u³(1−√(3u)) (Bruneton, zero at the ISCO), coloured by a blackbody lookup texture. Animated noise sheared by differential rotation gives the "light and dark lanes" of NASA's picture.
6. **Doppler beaming:** disc speed β = √(1/(2(r−1))) (0.5c at the ISCO; Antonelli's code), g = √(1 − 1/r) / (γ(1 − β cos θ)), colour temperature × g, intensity × g³ (oseiskar, Bruneton). Interstellar dropped this because the true result is "exceedingly lopsided", and Antonelli found it saturates to white. So expose a **beaming strength** (blend the exponent toward 0) and tone-map with bloom (SpaceEngine, Bruneton and Starless all add bloom or glare).
7. **Cost control:** trace at half resolution (or a third) into a texture holding the deflected direction plus disc RGBA, then upscale at full resolution. That's SpaceEngine's 1/3 → 9× trick, and it ties in with the game's `?quality=low`. Add animated noise against banding. If the per-pixel loop is still too slow on phones, Bruneton's precomputed tables (two small float textures, constant time per pixel, WebGL2, BSD licence) are the proven upgrade: 150 fps against 43 fps for ray marching in his tests.
8. **Black hole gun:** a small, short-lived hole doesn't need the sky machinery. Van Hoorn's screen-space version fits: a sphere mesh, a few Newtonian bending steps, then sampling the already-rendered frame at the projected bent ray, with a black core. Outer Wilds does the same kind of "close enough" lensing.

**Gameplay and look ideas others used:**

- **Wormholes:** Spore (random pairs, a late, expensive key, links remembered and drawn on the map), NMS (one-way jump of about 7,000 ly toward the centre, a cinematic tunnel), Outer Wilds (black hole to a fixed white hole; you always come out facing the station; swallowed debris collects round the white hole), SpaceEngine (traversable wormholes as separate objects), Singularity (several holes can share one exit).
- **Pull and danger:** Elite's exclusion zone throws you out of supercruise on arrival (no damage, but it surprises you). Spore's travel range shrinks near the core. Early NMS broke a ship system on each jump. Stellaris reportedly slows ships in black hole systems (not verified).
- **Feedback when something falls in:** Outer Wilds emits a jet of particles where a fragment fell through. SpaceEngine notes that very small black holes spin visibly, about 10 s per turn for hundreds to thousands of solar masses, so a disc can animate on human time scales.
- **Spaghettification:** none of the sources here shows a game drawing tidal stretching. I found no example, so that would be new.
- **Look:** Spore gave the galactic core alone big polar jets. Elite with no disc reads as "just a lens" to players, so a disc (or at least jets) is what makes a black hole read as one.

**Not verified:** Elite's lensing fix and any Frontier dev commentary; how NMS and Outer Wilds actually render theirs; Stellaris's numbers; the Shadertoy IDs and popularity; Universe Sandbox's lack of native discs; that Starfield and Star Citizen have none.
