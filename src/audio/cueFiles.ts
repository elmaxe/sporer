import { groupCueFiles, type SoundCue } from './cues';

/**
 * Every audio file under `src/assets/audio/sfx/<cue>/`, as URLs, found at
 * build time: dropping a file into a cue's folder adds a variant, no code
 * needed. Empty folders give no URLs (the cue falls back, see `cueParams`).
 */
const files = import.meta.glob<string>('../assets/audio/sfx/*/*.{mp3,ogg,wav,m4a,webm,flac,MP3,OGG,WAV,M4A,WEBM,FLAC}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const cueUrls: Readonly<Record<SoundCue, readonly string[]>> = groupCueFiles(files);
