# Terraforming: design

Status: **design only, nothing built yet.** This document is the plan to implement from, one roadmap step at a time (see [Phases](#phases)). Every real-world number that goes into the code still goes through the `research` skill first; the numbers here are either measured with the game's own `gen/climate.ts` (marked *measured*) or gameplay tunables (marked *tunable*). Real-world sources are listed as leads to read, not as findings.

## The short version

- **Magic rays first, real methods after.** The first tools built are magic rays (heat, cool, air, vacuum, water) that push the climate directly. They get the whole pipeline working and testable (the model over time, the chart, the planet changing, milestones) before any real tool exists, and afterwards they stay as debug tools.
- **Real methods, played at game speed.** Every lasting tool is a real terraforming idea (orbital mirrors, sunshades, aerosols, greenhouse-gas factories, comet impacts, importing gas, seeding life), and each one moves exactly one lever of the climate model the game already has. The player still gets a heat ray and a cooling spray, but they are a mirror beam focused from orbit and an aerosol haze, and they behave like those things.
- **A forecast you can read, matter you have to fetch.** The player always sees where the planet is, where it is heading and what each tool would do to it (that's what keeps it from being too hard). Air and water aren't conjured: they are scooped from other bodies, which lose what you take, or brought in on comets, which are used up (that's what keeps it from being too easy).
- **Relaxed or Real.** One menu setting: Relaxed is quicker and forgiving (no leaks, faster settling, higher limits), Real is as described here. Same physics, different tunables.
- **The planet answers back.** Changes settle over tens of seconds to minutes, cross tipping points (ice caps that release air when warmed, oceans that freeze over or boil off) and can leak away on small worlds. The world visibly changes as it goes: the sky thickens and changes colour, clouds and rain arrive, seas thaw, and forests spread from the plants you brought.

## Why real methods rather than magic rays

The user asked for either "bring asteroids down to heat the planet, mirrors that reflect sun, etc." or "magical heat/cool rays". Recommendation: **the real methods**, for three reasons.

1. **The game was built for it.** Step 12 split every solid body's climate into a fixed *setting* (starlight, gravity, escape velocity, internal heat) and a terraformable *state* (pressure, composition, greenhouse gas, water, surface albedo), and `terraform(climate, change)` already re-derives temperature, water, habitability and weather from a changed state. Each real method maps onto one state field. A magic ray would be a slider on "temperature", which the model doesn't have as an input: it would have to bypass the physics, and then every planet would be the same puzzle (turn the dial until it's green).
2. **Different worlds become different puzzles.** With real levers, a cold dry world, a Venus and a leaky moon need different tools in a different order, and the system you are in decides what's available (a Titan to take nitrogen from, comets to bring water). That variety is the fun.
3. **The fantasy is kept.** The fun part of a ray is pointing at the ground and watching it change. The mirror lance (focused orbital mirrors) does exactly that, and an aerosol spray gives the quick "cool it down now" button. They just obey the same rules as everything else.

**But magic rays come first** (decided). They are the quickest way to a working feature: one tool per lever, no logistics, so the model, its timing, the chart, the live looks and the milestones can all be built and checked before the real tools. See [Magic rays](#magic-rays-first-then-for-debugging).

## What the climate model gives us (measured)

All numbers in this section come from running the game's own `gen/climate.ts` (scratch scripts with `vite-node`, galaxy seed 1337, the first 1500 systems, every solid planet and moon).

**Where bodies start.** 11 250 solid bodies: 9 950 are T0, 163 T1, 34 T2, 1 103 T3. Almost nothing sits in between, so nearly every terraforming project starts from T0. Retention (the cosmic shoreline): 2 337 bodies hold an atmosphere, 584 are marginal, 8 329 can't keep one (mostly small moons).

**How many are worth doing.** Counting the 10 147 bodies that aren't T3 yet, and asking whether 1 bar of N₂–O₂ with at least 0.4 water could put them at T3:

| Retention | Bodies | Reachable with greenhouse gas alone (×0.1–8) | Also with mirrors or a shade (starlight ×0.35–3) |
|---|---|---|---|
| holds | 1 455 | 390 | 812 |
| marginal | 456 | 114 | 198 |
| escapes | 8 236 | 2 220 | 4 105 |

By system: **355 of 1 500 systems (24%)** have a body that holds air and needs only greenhouse gas, **637 (42%)** have one with mirrors or a shade too, **744 (50%)** counting marginal (leaky) bodies. That's a good spread: a candidate in about every other system, an easy one in about one in four, and most small moons out of reach (they can be warmed, but their air bleeds away).

**Reference cases** (Sol, `?star=sol`):

| Body | Today | What it takes in the model |
|---|---|---|
| Mars | −63 °C, 6 mbar CO₂, marginal | With 1 bar N₂–O₂ and 0.4 water: greenhouse ×3 gives 0 °C (T2), ×6 gives 36 °C (T3), ×10 gives 70 °C (T0 again). With ×3 plus mirrors: starlight ×1.2 is 12 °C (T3), ×1.5 is 29 °C. |
| Venus | 464 °C, 92 bar CO₂ | Taking CO₂ away: 30 bar is 156 °C, 10 bar is 6 °C (T1), 9 bar jumps to 109 °C (the cloud deck goes, see below). Replaced with 1 bar N₂–O₂: 65 °C under today's sun, 36 °C (T3) behind a shade blocking 30%, 11 °C blocking 50%. |
| Moon | −3 °C, airless, escapes | 1 bar N₂–O₂ and water make it 32 °C and T3, but it can't keep the air. |
| Titan | −180 °C, 1.5 bar N₂ | Hopeless to warm (starlight ×100 for T3); its value is as a nitrogen source. |

**The home system** (Haikrai, every new game with the default seed) has a ready-made first project: **Haikrai III**, a barren super-Earth at −102 °C with a trace of CO₂ (0.2 mbar) that holds air well (retention 2.78). With 1 bar N₂–O₂ and 0.4 water it needs greenhouse ×8 for T2 (−6 °C), ×12 for T3 (19 °C), or mirrors (starlight ×2) and greenhouse ×4 (5 °C, T3). Next door are two T3 ocean worlds (plants, and air to take), a gas giant (hydrogen), three comets (water) and an asteroid belt. No nitrogen-rich body, so either rob a living neighbour or make a trip.

### Things the model must fix first

Measuring turned up issues that would make terraforming feel wrong. Each is a task in [phase 1](#phases):

1. **Mirrors must not change retention.** `atmosphereRetention` uses `insolation`, so raising insolation for a mirror moves a body across the shoreline (Mars at ×2 starlight becomes "escapes"). Escape is driven by the star's X-ray and UV, which a mirror doesn't add. Mirrors and shades need their own factor in the state (`starlight`) that only enters the energy balance.
2. **CO₂ at a few bar barely warms.** CO₂'s τ ∝ P² is fitted on Venus alone, so in the model Mars with 1 bar of CO₂ warms by 0 K and with 3 bar by 6 K. Published Mars models give a much larger warming at those pressures (to research; Kasting 1991 and the early-Mars literature are the place to start). As it stands, "thicken Mars's own CO₂" is a dead end, which is wrong. Refit with a low-pressure reference.
3. **The Venus cloud deck is a cliff.** `cloudCovered` switches the albedo from the surface's to 0.77 at exactly 10 bar of CO₂, so 10 bar is 6 °C and 9 bar is 109 °C. Real cloud decks thin out; make it a ramp over a pressure range (to research), and present what is left of the jump as a tipping point.
4. **One gas per atmosphere.** `Composition` is a single dominant gas. Terraforming mixes them (bring N₂ to a CO₂ world, let plants turn CO₂ into O₂), so the state needs partial pressures (below). Every generated body must come out exactly as it does today (step 12 did the same: 0 differences over 1500 systems, pinned by a test).
5. **Leaks don't happen.** Living worlds above their stable pressure are flagged `leaking` but never lose anything. Terraforming needs a leak rate.
6. **The looks are fixed at build time.** Sea colour and level, ground colours and ice come from the planet *type* (`planetStyle`), and the atmosphere, weather and plants are built once from `config.climate`. All of them must follow the live climate.

## The model, extended

Pure data in `src/gen/` (no THREE), unit-tested, like the rest of generation.

### State

`ClimateState` gains:

- **Partial pressures** `gases: { n2, o2, co2, h2 }` in bar (more later if needed, e.g. CH₄ for Titans). `pressure` becomes their sum. `composition` becomes derived: `oxygenNitrogen` when O₂ is within the breathable range (to research: the low end from human hypoxia, the high end from fire risk) and N₂ + O₂ dominate; otherwise the dominant gas. Generated atmospheres convert one-to-one (Earth-like air split at Earth's ratio), so nothing generated changes.
- **Greenhouse** stays the abundance of trace greenhouse gas (the factories' product), and the optical depth becomes a sum over gases, each keeping its fitted τ₀ and exponent so that a pure atmosphere gives exactly today's τ (research how to combine them; pressure broadening means each gas's τ also depends on the total pressure).
- **`starlight`**: mirrors and shades, a factor on the absorbed starlight (1 untouched). Not used for retention.
- **`aerosol`**: extra albedo from a reflective haze, decaying with time.
- **`magicHeat`**: heat added or taken by the magic rays, W/m², entering the energy balance like internal heat (0 untouched).
- **Frozen volatiles** (phase 6): CO₂ or N₂ ice held in polar caps, in bar-equivalents, released when the caps warm past their sublimation point (Mars's seasonal CO₂ caps, Pluto's and Triton's N₂ ice). Generated per body from its type and temperature.

The setting is unchanged; the tier thresholds (`HABITABILITY`) are unchanged.

### Matter is conserved

Gas is moved, not made. A canister holds a **mass** of gas, measured in *Earth-bar* (the mass that makes 1 bar on Earth). Released on a body it adds `Δp = m · g / (R/R⊕)²` bar (surface pressure is weight over area: p = Mg/4πR², and here g is in g and R in Earth radii). Scooping takes the same mass from the source by the inverse. So:

- Small worlds fill up cheaply but leak; big ones take many trips but keep it.
- Taking 0.3 bar from a living world lowers *its* pressure (and maybe its tier), and the hold shows it.
- Gas giants are bottomless sources of H₂ (scooping doesn't change them visibly).

Water works the same way in the model's units of `water` (0–1 of a global ocean, scaled by the body's surface area), delivered by comets and icy asteroids.

### Time

Each body keeps an **action log**: what was done, where and when, in system time (as `BustedBodies` keeps blasts). The climate at any moment is a pure function of the generated climate, the log and the time, so the system view and low orbit agree and save/load is just the log (JSON, like the other stores). It's integrated on a fixed step (1 s of game time) from the last cached checkpoint.

How things move (all *tunable*, with real behaviour as the guide):

- **Temperature** relaxes to the new equilibrium with a time constant that grows with the water inventory (oceans are slow to warm; research the real mixed-layer vs land ratio and keep the ratio): ~20 s on a dry world, ~90 s on an ocean world.
- **Released gas** spreads round the globe as a visible front over ~10 s, then counts fully.
- **Factories** raise greenhouse at a fixed rate while they run, up to their cap; after removal it decays slowly (real super-greenhouse gases last a long time in the air).
- **Aerosols** decay with a half-life of ~2 minutes (real sulphate aerosols rain out over a year or two; to research).
- **Leaks** (see [Leaky worlds](#leaky-worlds)): pressure above the stable cap bleeds off as `dp/dt = −(p − p_stable) / τ_leak`, with τ_leak shorter the further below the shoreline the body is: minutes for a moon, an hour for a marginal Mars. Light gases go first (H₂ well before N₂; research the ordering with the Jeans escape parameter).
- **Plants** turn CO₂ into O₂ at a rate set by plant cover, and stop when the CO₂ runs out.

Does a world keep changing while you're in another system? Yes: it's a function of time, so you come back to see how it settled. That needs a game clock that keeps running across systems (check how system time behaves between visits when building phase 1).

### Leaky worlds

A planet holds on to its air with gravity. Starlight (above all its X-rays and ultraviolet) heats the top of the atmosphere, and on a small body the gas molecules move fast enough to escape into space. The game already computes this for every body: it's the **cosmic shoreline** from step 12 (`atmosphereRetention`, after Zahnle & Catling 2017), which compares the body's escape velocity with the starlight it gets and sorts it into three classes:

- **holds**: big enough to keep air indefinitely (Earth, Venus, Titan, Haikrai III).
- **marginal**: can keep a thin atmosphere but loses anything thicker (Mars, Ganymede).
- **escapes**: can't keep any (the Moon, Mercury, most small moons).

Today this only decides what a body is *generated* with. Terraforming makes it matter: give the Moon 1 bar of air and it becomes 32 °C and T3, but in Real mode the air then **bleeds away** over minutes of game time (an hour for a marginal Mars). The chart shows the pressure falling, the world cools, the tier drops, and plants that took root die as the conditions leave their window. To keep a leaky world alive you keep topping up its air (more trips with the scoop), or you accept that it slides back. That's what "leaky" means in this document. It's a large share of the galaxy: of the 10 147 bodies that aren't T3, 8 236 are below the shoreline, and 2 220 of those could reach T3 with greenhouse gas alone if only they kept their air.

In Relaxed mode there are no leaks: any body the model can warm and fill is terraformable for good.

### Feedbacks (the tipping points)

These make the planet more than a sum of sliders. Each is a real effect, and each needs the research skill before its numbers go in:

- **Ice–albedo**: frozen water raises the surface albedo, so a cooling world can snap into a snowball and a warming one can thaw all at once (Budyko 1969, Sellers 1969).
- **Frozen volatiles**: warming polar caps release CO₂ or N₂, which warms the world more (the Mars "runaway" in Zubrin & McKay 1993; Jakosky & Edwards 2018 found real Mars has too little CO₂ for it, so generate the caps with that in mind).
- **Runaway greenhouse**: hot oceans add water vapour, which adds warming; past a limit the oceans boil away (Kasting 1988; the Simpson–Nakajima limit).
- **The cloud deck**: CO₂ thick enough for a Venus deck reflects most starlight (the ramp that replaces today's 10-bar cliff).
- **Life draws CO₂ down**: plants making O₂ use up the greenhouse gas, so a successful forest can cool its own world (Earth's Great Oxidation Event is thought to have coincided with the Huronian glaciation; to research). A nice late twist: keep the factories running.

### Difficulty rating

A small solver (pure, tested) searches over the tools available in the body's system and its neighbours for the cheapest route to each tier and rates the body: **easy** (a few nudges), **medium** (import air or water, plus greenhouse), **hard** (mirrors or a shade, several imports), **leaky** (reachable, but the air bleeds off), **out of reach** (no route with the game's limits). Shown in the tooltip and the system map, so the player can pick a project before starting it. The solver also answers "what's the best next step?" for a hint button.

## Magic rays (first, then for debugging)

The first tools built (phase 2). They push the climate state directly, ignore where matter comes from, and have no limits, so every other part of terraforming can be built and tested against them.

| Ray | What it does to the model | Looks |
|---|---|---|
| **Heat ray** | Adds heat to the energy balance (a `magicHeat` term in W/m², like internal heat) while held | A red beam from the ship to the ground, the ground glowing where it lands |
| **Cool ray** | Takes heat away (negative `magicHeat`) | A pale blue beam, frost spreading where it lands |
| **Air ray** | Adds gas from nothing; the gas is picked with a key (N₂, O₂, CO₂, H₂) | A beam pouring gas that spreads as a front |
| **Vacuum ray** | Takes gas away, the same pick | A beam sucking gas up into the ship |
| **Water ray** | Adds water (or, with a key, takes it away) | Rain falling from the beam, or steam rising into it |

- **The same pipeline as the real tools**: each ray writes the body's action log (rate × how long it was held), the climate settles with the same time constants, leaks apply, the chart and its forecast arrow work, the world's looks follow, and milestones fire. When a real tool lands later, only *how the change is paid for* is new.
- **The heat rays aren't a temperature slider**: they add or remove energy, so a world with thick air or big oceans still responds slowly, and a greenhouse world still runs away. That keeps them honest enough to test the feedbacks.
- **Rates** (*tunable*): a few seconds of holding moves a world one chart cell; a debug multiplier speeds it up.
- **Testing**: the smoke test's `terraform` section uses the rays (one key and a held click each), and the planet lab gets the same rays plus a time scrubber.
- **After the real tools exist**: the rays move to a **Debug** tab of the item bar, shown only with `?debug` or the dev server, and stay in the planet lab. Open decision: also offer them to players as a *Sandbox* setting.

## Tools

A new **Terraform** tab in the item bar (step 33's bar, next to Weapons and Inventory; green). Each tool moves one lever. Limits are per body and *tunable*.

### Heat and light

**Orbital mirror** (warms)
- *Real basis*: orbital mirrors raising the light on Mars (Zubrin & McKay 1993).
- *Use*: deploy in low orbit; it unfolds and takes station above the day side. Up to 4 per body, each starlight +25% (4 make ×2, what Haikrai III needs with greenhouse ×4). Recall it to take it back.
- *Looks*: a glinting sail visible in both views, a faint cone of light, a brighter day side.
- *Mirror lance* (the heat ray): with at least one mirror up, hold on a point and the mirrors focus there. Locally it melts ice (adds water if the body has frozen water), sublimates polar caps (releases frozen volatiles, phase 6), scorches and sets plants alight (the existing fates). It doesn't change the global temperature by itself. The way to kick off a Mars.

**Sunshade** (cools)
- *Real basis*: a parasol between the star and the planet, proposed for Venus (Birch 1991) and Earth.
- *Use*: one per body; set how much it blocks, 0–70% (Venus needs 30–50% once its CO₂ is replaced).
- *Looks*: a dark disc between star and planet in the system view, dimmer light in low orbit.

**Aerosol spray** (cools fast, for a while)
- *Real basis*: stratospheric sulphate aerosols; volcanic eruptions such as Pinatubo's cooled the Earth for a year or two.
- *Use*: hold to spray; each second adds albedo, which decays. The emergency brake when an ocean is about to boil, not a fix.
- *Looks*: a pale haze over the globe, redder sunsets.

### Greenhouse

**Greenhouse factory** (warms, slowly and for good)
- *Real basis*: factories making super-greenhouse gases for Mars (Zubrin & McKay 1993; Marinova, McKay & Hashimoto 2005).
- *Use*: beamed down onto dry land like a plant set down (the beam from step 33). Up to 3 per body; each raises greenhouse at a fixed rate up to its cap. Beam it back up to stop it.
- *Looks*: a small works with a plume drifting on the zonal wind.

**Carbon sink** (cools, slowly)
- *Real basis*: the carbonate–silicate cycle (Walker, Hays & Kasting 1981, the game's own thermostat) sped up: crushed rock that locks CO₂ away, proposed for Venus and studied on Earth as enhanced weathering.
- *Use*: placed like a factory; draws CO₂ and greenhouse gas down. How you thin a Venus without carrying 90 bar away.

### Air and water

**Gas scoop** (takes air) and **gas release** (gives it)
- *Real basis*: importing nitrogen from Titan, or ammonia from icy bodies, to give Mars a buffer gas (Zubrin & McKay 1993; Fogg 1995).
- *Use*: in low orbit over a body with air (or a gas giant), hold the scoop: canisters fill with that body's air (its mix of gases) and the source loses the mass. Canisters stack in the hold like plants. Over the target, set one down: the gas is released and spreads.
- *The trade-off*: robbing a living world (an ocean world's N₂–O₂ is the quickest breathable air there is) costs it pressure and maybe its tier and its plants. A Venus is the best CO₂ source there is, and taking from it is also how you terraform it.
- *Looks*: a funnel of streaming gas into the ship; a canister bursting into a spreading front.

**Tug** (comets and asteroids)
- *Real basis*: redirecting comets or volatile-rich asteroids to bring water and gas and heat the surface (Zubrin & McKay 1993).
- *Use*: in the system view, go to a comet or a named asteroid, choose Tug, and pick a target body. It flies there (~30 s, *tunable*) and hits.
- *Delivers*: a comet: water and some CO₂ (the ice mix to research), plus a heat pulse. An icy or carbonaceous asteroid: some water and CO₂. A rocky or metal one: heat only.
- *Costs*: comets are used up (a system has a few, so they're precious). The impact scars the ground (a crater mark in the body's change list), kills plants nearby (the existing fates) and, on a small world, blows some air away (impact erosion; to research).
- *Looks*: the best moment in the feature. Watched from low orbit: a bright streak entering the air, the flash, a shock ring and a fireball (the planet buster's effects, smaller), steam if it hits ice.

### Life

**Seeding** (plants from the hold)
- *Real basis*: photosynthesis is where Earth's O₂ came from; hardy pioneers (lichens, cyanobacteria) are the usual first step in Mars proposals.
- *Use*: the beam and hold from step 33, unchanged. What changes is that plants which take root now matter: they turn CO₂ into O₂, darken the ground a little, and **spread** to nearby land if the climate suits them.
- *The puzzle*: the fates already decide whether a plant survives (temperature window, air, water). So the player has to find a species that can live on the half-made world, on other planets (a T1 world's tough species before a T3 world's soft ones), and warm the world enough for it first.
- When a terraformed body reaches T1+, the plant generator fills its cells with the **species the player brought** (not new native ones), at the cover its tier gives. The forests you see are yours.

### Reaching T3, step by step (Haikrai III)

1. Tug the home system's comets in for water while the ground is bare (an impact kills plants, so impacts come first). The water freezes at once.
2. Scoop N₂–O₂ from Haikrai II (it has 1.32 bar; watch its tier) and release it on III, or fetch N₂ from a Titan in another system. Greenhouse gas does nothing without air to hold it (τ grows with pressure), so air comes before heat.
3. Greenhouse factories, then mirrors: from −102 °C up past −20 °C (T1), the ice thaws into seas past 0 °C.
4. At T1, seed tough plants from wherever they grow; they spread and make O₂ from the CO₂ the comets and the air brought.
5. Air breathable, seas liquid, −10 to 40 °C: T3. Haikrai III's own climate, weather and forests, on every visit.

About 30–45 minutes for a first-time player, and the first tier change in the first 10 (*targets for tuning*).

## Feedback: seeing it work

### The climate chart

The heart of the UI, and what keeps it from being too hard. A panel in low orbit (and in the planet lab):

- **Axes**: temperature across (−60 to 80 °C), pressure up (1 mbar to 100 bar, log). The tiers are rectangles from `HABITABILITY`: T1 is −20 to 60 °C at any real pressure, T2 is −10 to 40 °C at 0.3–5 bar, and T3 is T2 plus two lamps: *breathable* and *liquid water*.
- **The planet** is a dot; a ghost dot shows where it is settling to, with "settles in ~40 s". Off-chart worlds (Venus) are pinned to the edge with their values.
- **Hovering a tool** draws an arrow: where it would move the dot. Tipping points are drawn as warning bands (the freezing line, the boiling line for the pressure, the cloud deck).
- Next to it: a stacked bar of the gases, the water gauge (none / ice / liquid / steam, how much), the leak rate when there is one, and the active projects (mirrors, factories, aerosol left, plants).

### The world changes

- The atmosphere's colour and thickness follow the climate (`atmosphereTint` and `atmosphereLook` already do, from the state).
- Weather follows the climate (`weatherKind` and `weatherOf` already derive it): dust storms when the air thickens, the first rain when water turns liquid, snow, cyclones once seas are warm.
- **Seas** rise with the water inventory and freeze, thaw or boil with the water state; **ice caps** grow and shrink with temperature by latitude (the same latitude model the plants use).
- **The ground** blends from the body's own colours towards living ones where plants grow.
- On the system map and the galaxy map's system summary, the tier marks update.

### Milestones

Moments get a banner and a sound cue (silent until their files exist, like step 33's): *First breath of air*, *First rain*, *The seas thaw*, *First roots*, *Breathable air*, each tier reached (and lost). A short log of them per body in the planet's info.

## What keeps it from being too easy or too hard

**Not too hard:**
- Everything is visible: the forecast arrow says what a tool will do before you use it, and the chart says why the world isn't there yet.
- Most mistakes can be undone: recall a mirror, open the shade, spray aerosols, beam a factory back up.
- The difficulty rating says which worlds are worth starting, and the hint button says what to try next.
- Settling takes tens of seconds, not hours.

**Not too easy:**
- **Matter has to be fetched** from somewhere real, and taking it changes the source. That's travel, choices and trade-offs, not a menu.
- **Limits per body**: 4 mirrors, 1 shade, 3 factories, a few comets per system.
- **Order matters**: greenhouse gas needs air to work in; plants die if you seed them before it's warm; impacts kill plants, so bring comets in first; a Venus needs shade before its CO₂ goes or its new oceans boil.
- **Tipping points**: overshoot and the oceans boil or the world freezes over; the forest draws CO₂ down and cools the world.
- **Leaks**: small worlds can be done, but need topping up; out-of-reach worlds stay out of reach.
- **Irreversible things are flagged** (comet impacts, robbing a living world's air) before you commit.

### Relaxed and Real (decided)

A **Terraforming: Relaxed / Real** setting in the menu (a new Gameplay section, saved in localStorage like the Display settings; Real by default, open decision). It can be switched at any time; the body's action log is the same, and only the tunables used to play it forward change. Both use the same physics: the tiers, temperatures and what each tool does per unit are identical, so the chart means the same in both.

| | Relaxed | Real |
|---|---|---|
| Settling time | ⅓ of Real | ~20 s dry, ~90 s ocean |
| Leaks | none | bleed off above the stable pressure |
| Limits per body | 6 mirrors, 2 shades, 5 factories | 4 mirrors, 1 shade, 3 factories |
| Aerosols | last 3× longer | ~2 min half-life |
| Gas per canister | 2× | as measured |
| Tipping points | a warning on the chart before each is crossed, and the forecast arrow includes it | the forecast arrow includes it, no extra warning |
| Impacts | kill no plants outside the crater itself | kill plants in a radius |

Targets (*tunable*, checked in the balance phase): Haikrai III in ~15–20 minutes on Relaxed and ~30–45 on Real.

## Fit with the rest of the game

- **Stores**: a `TerraformLog` per body (action log, JSON-able, kept by the `SceneManager` like `BustedBodies`, `SurfaceChangeStore` and the cargo hold); the debug dump records and restores it.
- **The planet buster**: a busted body can't be terraformed; busting a terraformed one is allowed (with an "are you sure").
- **The planet lab**: a Terraform section to apply any action, scrub time and watch the chart; `?terraform=<log>` in the hash. It is where every tool and feedback is tuned.
- **Smoke test**: a `terraform` section (the magic rays first; later deploy a mirror, run a factory, release a canister, tug a comet, watch the tier change, leave and come back, the chart and arrows).
- **Later**: colonies and the spice economy can make terraformed worlds worth something (more colonists per tier) and put a price on tools. Rival empires could terraform too.

## Phases

Each phase is a roadmap step that leaves the game playable and is verified (`typecheck`, `test`, `build`, `smoke`) before pushing.

1. **Model**: the six fixes above (`starlight`, low-pressure CO₂, the cloud ramp, partial pressures, leaks, aerosol), the action log and its integration over time, pure and tested. Every generated body unchanged (0 differences over 1500 systems). Research notes in `docs/research/terraforming.md`.
2. **Magic rays, chart and live looks**: the Terraform tab with the five magic rays; the climate chart in low orbit and the lab; seas, ice, ground, atmosphere and weather following the live climate in both views; leaks; milestones; the Relaxed / Real setting. The first playable version of terraforming.
3. **Heat and light**: mirrors, the mirror lance, the sunshade, aerosols.
4. **Greenhouse**: factories and carbon sinks (placed with the beam).
5. **Air and water**: scoop and release, tugging comets and asteroids, impacts and craters.
6. **Life and feedbacks**: plants making O₂ and spreading, the player's species filling a terraformed world, frozen volatiles, ice–albedo, the runaway greenhouse, the difficulty rating and hints.
7. **Balance pass**: measure over 1500 systems how many bodies reach each tier with what, time a full Haikrai III run in both modes, and tune the limits and rates against the targets above. The magic rays move to the Debug tab.

## Leads to read (research skill, before building)

None of these has been read and checked for this game yet; they are where to start.

- Zubrin & McKay 1993, *Technological requirements for terraforming Mars*: mirrors, super-greenhouse gases, ammonia-rich asteroids, the polar-cap runaway.
- Marinova, McKay & Hashimoto 2005: warming Mars with super-greenhouse gases.
- Jakosky & Edwards 2018 (Nature Astronomy): Mars's accessible CO₂ inventory.
- Fogg 1995, *Terraforming: Engineering Planetary Environments*: the standard reference across all methods.
- Birch 1991, *Terraforming Venus quickly*: the sunshade and getting rid of CO₂.
- Kasting 1988 and 1991: the runaway greenhouse; CO₂ warming on early Mars.
- Budyko 1969, Sellers 1969: ice–albedo feedback.
- Walker, Hays & Kasting 1981: the carbonate–silicate cycle (already cited in `docs/research/climate.md`).
- Atmospheric escape and impact erosion: the Jeans parameter; Melosh & Vickery 1989.
- Stratospheric aerosols: observed cooling and lifetime after Pinatubo (1991).
- Breathable air: O₂ partial-pressure limits (hypoxia and fire risk).

## Open decisions for the user

Decided: magic rays first, as the starting tools and then for debugging, with real methods as the lasting tools; a Relaxed / Real setting.

1. **Robbing living worlds**: allowed (with the trade-off), or only from dead ones?
2. **Leaky worlds in Real mode** (see [Leaky worlds](#leaky-worlds)): leaky for good, so they need topping up, or a late tool that slows leaks (a magnetic shield as proposed for Mars at its L1 point; it only stops solar-wind stripping, so it would be a stylised stand-in for the cosmic shoreline)?
3. **Default mode**: Real or Relaxed for a new player?
4. **Magic rays for players**: debug-only once the real tools exist, or also a Sandbox setting?
5. **A currency**: matter, limits and travel as the only cost for now, or wait for the spice economy to put prices on tools?
6. **Native life**: only the player's species on a terraformed world (proposed), or the generator's own species once it reaches T3?
