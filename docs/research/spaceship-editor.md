# A Spore-style spaceship editor

What Spore's spaceship creator does, and how the prototype editor (`ship.html`) does it. Code: `src/gen/ship.ts` (the design: parts, symmetry, frames, editing, random ships), `src/player/shipMesh.ts` draws a design (in the editor, and as the game's UFO), `src/shiplab/` (the page: `ShipLab.ts` edits and flies it, `ShipPanel.ts` the controls). Tests: `tests/ship.test.ts`. It sits beside the creature editor (`creature.html`, `docs/research/creature-editor.md`) and shares its controls and look.

## Sources

The Spore wiki (fandom) refuses automated fetches, so its quotes below are from web search summaries of the pages, not read in full.

- **Spore wiki, "Spaceship Creator"**, https://spore.fandom.com/wiki/Spaceship_Creator: "The Spaceship Creator contains all of the same bodies, cockpits, effects, and details that a Vehicle Creator would have, plus … some exclusive space parts available in the 'Space' tab", "different landers, grabbers, and sensory/detection devices"; and the parts "are purely cosmetic".
- **Spore wiki, "Complexity Meter"**, https://spore.fandom.com/wiki/Complexity_Meter: "Adding parts will increase the complexity of the creation until it reaches the maximum amount, at which point nothing else can be added to the creation."
- **Spore wiki, "Paint"**, https://spore.fandom.com/wiki/Paint: in the building and vehicle creators "Paint allows you to choose exactly which part to color", with "complete styles, partial styles, and lastly, Paint Brush mode, which allows you to color each area specifically"; creatures get "3 color slots" (base, coat, detail).
- **Steam guide "All Hotkeys – editor shortcuts and more!"**, https://steamcommunity.com/sharedfiles/filedetails/?id=954394362, for the building and vehicle editors: "MMW – Scale spine/part", "Arrow Keys – Adjust part scale", "TAB – Advanced rotation", "Hold A – Disable symmetry on part upon left click / selection", "Alt+LMB – Clone Part", "Ctrl-Z – Undo", "CTRL-Y – Redo", and in Paint mode "Shift+LMB – Assigns the selected texture from the palette to the entire part", "Shift+Ctrl+LMB – Applies the selected texture from the palette to all parts of the same type".
- **SporeModder-FX wiki, "Creating Custom Part Rigblocks"**, https://github.com/emd4600/SporeModder-FX/wiki/Creating-Custom-Part-Rigblocks: parts are rigblocks, and "symmetric variants can be defined using the properties modelCenterFile, modelRightFile, and modelLeftFile": a part has a different model on the middle line than off it.

## The approach

**Parts stuck to parts.** A design is a core body and parts, each stuck onto the surface of the core or of another part (`parent`). A part keeps the point where it touches its parent and the parent's outward normal there, in ship space, plus its own size, stretch (along one axis of its own), spin, tilt and lean. Placing a part raycasts the drawn ship: the ghost part follows the pointer over whatever surface is under it, and a click sticks it there. Moving a part carries everything stuck on it along, resizing it carries them out or in with its surface, removing it removes them, cloning it (Alt-drag, as in Spore, or Ctrl+D) clones them. Lights, guns, masts, dishes, grabbers and thrusters are leaves: nothing sticks to them, so a wing dropped on a saucer's rim lands on the hull, not on a rim light.

**Two ways to sit on a surface** (`PartMount`): most parts grow out of the surface (their up the normal, their front towards the nose as far as the normal allows); engines, guns, pods and cones lie along the ship whatever surface they're on, so an engine on a hull's side or tail always pushes backwards and a gun always points forwards. Wings stand out level from a sloping hull (a saucer's top) unless they're on top, where they're fins.

**Symmetry, per part.** Spore mirrors parts across the creation's middle; its UFOs are mostly round, so the editor also copies a part round the vertical axis (2 to 8 copies), or both. A part on the middle line isn't mirrored and one on the vertical axis isn't copied round (Spore's "center" variant). The design keeps one of each part; the copies are only drawn (each a turned and mirrored group over the same meshes). A part stuck on a part that has copies copies the same way, so it lands on every copy. A pick on any copy is carried back onto the part itself (`unapplyInstance`).

**Complexity.** Every drawn copy counts; a ship takes at most 80 (`MAX_COMPLEXITY`), Spore's meter's role. The number is ours.

**Paint.** Every part's meshes are drawn in one of five channels: hull, trim, machinery, glass and lights. The ship has a colour for each, a finish (metal, gloss, matte) and a hull pattern (panels, stripes, checker, hazard) in the hull and trim colours. The paint bucket gives one part its own hull or trim colour (Shift: every part of that kind), as Spore's per-part paint does. Metal reflects a soft room environment (`RoomEnvironment`), since metal with nothing to reflect draws black.

**The test flight.** The ship hovers over a planet, banking and pitching as it's steered (WASD or the arrows), its engines and thrusters burning additive plumes as long as the throttle (Shift boosts), rings turning, lights blinking. Spore's parts are cosmetic, and so are these: the flight doesn't depend on what's built.

## In the game

The editor's 🚀 Fly in the game keeps the design in local storage (`player/customShip.ts`) and opens the game, whose UFO (`buildUfoMesh`, used by the system, planet and galaxy levels) is then the design drawn by `buildDesignedUfo`: scaled so its widest is the saucer's 4 units, centred, raised if its underside would hang lower than the saucer's (`HULL_DEPTH`, what the ground keeps clear of), turned to fly nose first (the game's UFO flies towards its −z), with metal kept mostly diffuse since space has no environment to reflect. Its rings turn with the saucer's light ring. Everything that collides, lands or flies keeps using the saucer's sizes, so the game needs nothing else changed. `?ship=<design>` in the game's address flies a design for that visit only. The editor opens on the kept ship when its address has no design, and its Fly mode can put the saucer back.

## Random ships

`randomShip(seed)` picks a core (saucer, pod, sphere, cone or block), then a cockpit on top or at the front, wings or fins, engines (a pair at the back, or a ring of thrusters under a round hull), and maybe guns, lights (a ring round a saucer), a mast or dish, a grabber and a ring, with a colour scheme round one hue. Parts on the core are placed on the ellipsoid the core roughly fills (`coreSurface`).

## Next steps

- **Parts as meshes**: authored parts (Spore's rigblocks) instead of primitives, with variants for the middle line and the sides.
- **Snapping**: Spore snaps parts to the middle line and to each other's ends; here only the middle line and the vertical axis are special.
- **Paint brush**: per-region paint (Spore's Paint Brush mode) rather than per part.
