# Sound cues

Each folder is one sound cue. Every audio file in it (`.mp3`, `.ogg`, `.wav`, `.m4a`, `.webm`, `.flac`) is one
variant: each time the cue plays, one is picked at random, never the same one twice in a row. Drop files in and
rebuild; no code changes needed. Volumes and fades are in `cueParams` (`src/audio/cues.ts`) and the
"Sound cues" debug folder.

| Folder | When it plays | Kind | With no files |
|---|---|---|---|
| `select/` | Clicking a star, planet, moon or comet (in the view, on the system map, or a star or nebula on the galaxy map) | one-shot | silent |
| `systemTravel/` | The autopilot flying between bodies in a system: starts as it sets off, fades out when it arrives | loop | silent |
| `interstellarTravel/` | Flying between stars on the galaxy map: starts as it sets off, fades out when it docks | loop | the synthesised `travel` whoosh |
| `reentry/` | Descending to a planet or moon with an atmosphere, or a gas giant (airless bodies keep the `transitionIn` whoosh) | one-shot | the `transitionIn` whoosh |
| `leavePlanet/` | Climbing from low orbit back to the system | one-shot | the `transitionOut` whoosh |

Loops: the clip loops if the trip outlasts it (its last 0.5 s is crossfaded into its start so it wraps
seamlessly), and fades out over `fadeOut` seconds on arrival, so a clip longer than most trips works too.
