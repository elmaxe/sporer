# Sound cues

Each folder is one sound cue. Every audio file in it (`.mp3`, `.ogg`, `.wav`, `.m4a`, `.webm`, `.flac`) is one
variant: each time the cue plays, one is picked at random, never the same one twice in a row. A folder with no files is silent. Drop files in and
rebuild; no code changes needed. Volumes and fades are in `cueParams` (`src/audio/cues.ts`) and the
"Sound cues" debug folder.

| Folder | When it plays | Kind |
|---|---|---|
| `select/` | Clicking a star, planet, moon or comet (in the view, on the system map, or a star or nebula on the galaxy map) | one-shot |
| `systemTravel/` | The autopilot flying between bodies in a system: starts as it sets off, fades out when it arrives | loop |
| `interstellarTravel/` | Flying between stars on the galaxy map: starts as it sets off, fades out when it docks | loop |
| `reentry/` | Descending to a planet or moon with an atmosphere, or a gas giant (airless bodies are silent) | one-shot |
| `leavePlanet/` | Climbing from low orbit back to the system | one-shot |
| `busterFire/` | Firing the planet buster: the projectile leaving the ship | one-shot |
| `busterFlight/` | The planet buster's projectile flying down to the surface: starts at launch, fades out on impact | loop |
| `busterImpact/` | The projectile hitting the ground (the first flash, as the crust starts to crack) | one-shot |
| `planetExplode/` | The planet blowing apart (the blinding flash and the debris flying out) | one-shot |
| `volcanoFire/` | Firing the volcano bomb: the molten shell leaving the ship | one-shot |
| `volcanoRise/` | The shell landing and a volcano rising out of the ground, erupting (a rumble and a roar) | one-shot |
| `abductBeam/` | The abduction beam on: starts on the press, fades out when it's let go | loop |
| `abductStart/` | The beam catching something to lift (as it comes under the beam) | one-shot |
| `abductSuccess/` | Something reaching the ship and going into the inventory | one-shot |
| `exportBeam/` | The beam lowering cargo from the ship: starts on the press, fades out when it's let go or lands | loop |
| `dropImpact/` | Cargo hitting the ground: set down by the beam, dropped, or falling from it | one-shot |
| `starNear/` | A star close up: grows as the camera nears its surface, taking over from `starFar` | ambient |
| `starFar/` | A star from across its system: fades with distance, giving way to `starNear` close up | ambient |
| `shipHum/` | The UFO's own hum, always on | ambient |

Ambient cues play on the **Ambience** channel (its slider), the rest on Effects. They loop the same way, but
the game sets their loudness as it goes: the two star loops are mixed from the camera's distance to the star
(`starMix` in `src/audio/starMix.ts`, the "Star sound" debug folder) and pitched by the star's kind
(`starPitch`: giants deeper, dwarfs higher), so one pair of files serves every star.

Loops: the clip loops if the trip outlasts it (its last 0.5 s is crossfaded into its start so it wraps
seamlessly), and fades out over `fadeOut` seconds on arrival, so a clip longer than most trips works too.
