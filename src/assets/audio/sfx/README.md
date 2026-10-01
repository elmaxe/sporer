# Sound cues

Each folder is one sound cue. Every audio file in it (`.mp3`, `.ogg`, `.wav`, `.m4a`, `.webm`, `.flac`) is one
variant: each time the cue plays, one is picked at random, never the same one twice in a row. A folder with no files is silent. Drop files in and
rebuild; no code changes needed. Volumes and fades are in `cueParams` (`src/audio/cues.ts`) and the
"Sound cues" debug folder.

| Folder | When it plays | Kind |
|---|---|---|
| `select/` | Clicking a star, rogue planet or nebula on the galaxy map | one-shot |
| `systemSelect/` | Clicking a star, planet, moon, comet or asteroid belt in a system (in the view or on the system map) | one-shot |
| `systemTravel/` | The autopilot flying between bodies in a system: starts as it sets off, fades out when it arrives | loop |
| `interstellarTravel/` | Flying between stars on the galaxy map: starts as it sets off, fades out when it docks | loop |
| `reentry/` | Descending to a planet or moon with an atmosphere, or a gas giant (airless bodies are silent) | one-shot |
| `leavePlanet/` | Climbing from low orbit back to the system | one-shot |

Loops: the clip loops if the trip outlasts it (its last 0.5 s is crossfaded into its start so it wraps
seamlessly), and fades out over `fadeOut` seconds on arrival, so a clip longer than most trips works too.
