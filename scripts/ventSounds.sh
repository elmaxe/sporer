#!/usr/bin/env bash
# Synthesises the vents' sound cues with ffmpeg (noise, filtered and shaped; no recordings):
#   ventRumble/vent_rumble.mp3  fumaroles and Io-style plumes: a low rumble, the roar of flame and crackling (loop)
#   geyserHiss/geyser_hiss.mp3  cryo, steam and sulphur jets: a surging hiss over a low roar (loop)
#   ventBurst/vent_burst.mp3    a vent nearby bursting into eruption: a whoosh and a thump (one-shot)
# The jets' noise sits where a hissing vent's would: f = St·U/D with St ≈ 0.19 (see docs/research/geysers.md).
# Rerun with: bash scripts/ventSounds.sh
set -euo pipefail
cd "$(dirname "$0")/../src/assets/audio/sfx"
enc=(-ac 1 -ar 44100 -c:a libmp3lame -b:a 96k)

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "anoisesrc=color=brown:seed=11:amplitude=1:duration=8" \
  -f lavfi -i "anoisesrc=color=pink:seed=12:amplitude=1:duration=8" \
  -f lavfi -i "aevalsrc='if(lt(random(0),0.0009),random(1)*2-1,0)':s=44100:d=8" \
  -filter_complex "\
[0]lowpass=f=160,lowpass=f=160,tremolo=f=0.35:d=0.35,volume=2.2[rumble];\
[1]highpass=f=350,lowpass=f=1800,tremolo=f=2.3:d=0.25,volume=0.55[roar];\
[2]highpass=f=900,lowpass=f=5000,volume=1.6[crackle];\
[rumble][roar][crackle]amix=inputs=3:normalize=0,alimiter=limit=0.9,loudnorm=I=-16:TP=-2:LRA=7" \
  "${enc[@]}" ventRumble/vent_rumble.mp3

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "anoisesrc=color=white:seed=21:amplitude=1:duration=8" \
  -f lavfi -i "anoisesrc=color=pink:seed=22:amplitude=1:duration=8" \
  -filter_complex "\
[0]highpass=f=1100,lowpass=f=6500,tremolo=f=0.22:d=0.45,volume=0.6[hiss];\
[1]lowpass=f=420,tremolo=f=0.31:d=0.3,volume=1.4[roar];\
[hiss][roar]amix=inputs=2:normalize=0,alimiter=limit=0.9,loudnorm=I=-16:TP=-2:LRA=7" \
  "${enc[@]}" geyserHiss/geyser_hiss.mp3

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "anoisesrc=color=pink:seed=31:amplitude=1:duration=2.6" \
  -f lavfi -i "anoisesrc=color=brown:seed=32:amplitude=1:duration=2.6" \
  -filter_complex "\
[0]highpass=f=300,lowpass=f=4000,afade=t=in:d=0.08,afade=t=out:st=0.25:d=2.3:curve=exp[whoosh];\
[1]lowpass=f=120,lowpass=f=120,volume=3,afade=t=in:d=0.02,afade=t=out:st=0.05:d=1.2:curve=exp[thump];\
[whoosh][thump]amix=inputs=2:normalize=0,alimiter=limit=0.9,loudnorm=I=-14:TP=-1.5" \
  "${enc[@]}" ventBurst/vent_burst.mp3
