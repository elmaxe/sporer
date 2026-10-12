#!/usr/bin/env bash
# Synthesises the Colony Pod's sound cues with ffmpeg (tones and noise, no recordings); placeholders to replace with your own:
#   colonyDrop/colony_drop.mp3  the pod leaving the ship: a pneumatic puff and a falling whistle (one-shot)
#   colonyLand/colony_land.mp3  the pod landing: a soft thud, a hiss of retro-jets and a bright rising chime as the hub rises (one-shot)
# Rerun with: bash scripts/colonySounds.sh
set -euo pipefail
cd "$(dirname "$0")/../src/assets/audio/sfx"
enc=(-ac 1 -ar 44100 -c:a libmp3lame -b:a 96k)
mkdir -p colonyDrop colonyLand

# A burst of band-passed noise (the puff) and a whistle falling from 1400 to 500 Hz over 0.9 s (phase 2π(1400t − 500t²)).
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "aevalsrc='0.25*sin(2*PI*(1400*t-500*t*t))*exp(-t*2.2)*min(1,t*40)':s=44100:d=1.2" \
  -f lavfi -i "anoisesrc=color=white:seed=7:amplitude=1:duration=1.2" \
  -filter_complex "\
[1]bandpass=f=1800:width_type=h:w=1600,volume=0.6,afade=t=out:st=0:d=0.35[puff];\
[0][puff]amix=inputs=2:normalize=0,afade=t=out:st=0.9:d=0.3,alimiter=limit=0.9,loudnorm=I=-17:TP=-2" \
  "${enc[@]}" colonyDrop/colony_drop.mp3

# Thud: 70 Hz falling to 45 Hz, ringing down fast; hiss: low-passed noise fading; chime: C5 E5 G5 C6 (523.25, 659.26, 783.99, 1046.5 Hz) 110 ms apart from 0.35 s.
note() { echo "if(gte(t,$2),sin(2*PI*$1*(t-$2))*exp(-(t-$2)*$3),0)"; }
expr="0.55*sin(2*PI*(70*t-12*t*t))*exp(-t*7)+0.16*($(note 523.25 0.35 4)+$(note 659.26 0.46 4)+$(note 783.99 0.57 3.5)+$(note 1046.5 0.68 2.6))"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "aevalsrc='${expr}':s=44100:d=2.2" \
  -f lavfi -i "anoisesrc=color=pink:seed=11:amplitude=1:duration=2.2" \
  -filter_complex "\
[1]lowpass=f=2200,volume=0.35,afade=t=in:d=0.02,afade=t=out:st=0.05:d=0.6[hiss];\
[0][hiss]amix=inputs=2:normalize=0,afade=t=out:st=1.8:d=0.4,alimiter=limit=0.9,loudnorm=I=-15:TP=-1.5" \
  "${enc[@]}" colonyLand/colony_land.mp3
