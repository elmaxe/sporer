#!/usr/bin/env bash
# Synthesises the scanner's sound cues with ffmpeg (tones, no recordings); placeholders to replace with your own:
#   scanBeam/scan_beam.mp3        the scanner on: a warbling hum under a tone sweeping up and down, pulsing (loop)
#   scanSuccess/scan_success.mp3  a new species read: a rising A-major arpeggio with a shimmer on top (one-shot)
# The loop is 4 s long and every cycle in it (the sweep's 2 s, the pulse's 1/8 s, the vibrato's 1/5 s) fits a whole
# number of times, so it loops without a seam even before the game's crossfade.
# Rerun with: bash scripts/scanSounds.sh
set -euo pipefail
cd "$(dirname "$0")/../src/assets/audio/sfx"
enc=(-ac 1 -ar 44100 -c:a libmp3lame -b:a 96k)
mkdir -p scanBeam scanSuccess

# Hum: 220 Hz and a vibrato'd 440 Hz; sweep: 1200 ± 300 Hz over 2 s (phase 2π·1200t − 600·cos(πt)); pulsing at 8 Hz.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "aevalsrc='(0.22*sin(2*PI*220*t)+0.14*sin(2*PI*440*t+1.5*sin(2*PI*5*t))+0.12*sin(2*PI*1200*t-600*cos(PI*t)))*(0.72+0.28*sin(2*PI*8*t))':s=44100:d=4" \
  -f lavfi -i "anoisesrc=color=pink:seed=41:amplitude=1:duration=4" \
  -filter_complex "\
[1]highpass=f=2500,lowpass=f=7000,volume=0.05[air];\
[0][air]amix=inputs=2:normalize=0,alimiter=limit=0.9,loudnorm=I=-18:TP=-2:LRA=7" \
  "${enc[@]}" scanBeam/scan_beam.mp3

# A4 C#5 E5 A5 (440, 554.37, 659.26, 880 Hz, with an octave each), 80 ms apart, each ringing down; a shimmer of A6 at the end.
note() { echo "if(gte(t,$2),(sin(2*PI*$1*(t-$2))+0.35*sin(4*PI*$1*(t-$2)))*exp(-(t-$2)*$3),0)"; }
expr="0.22*($(note 440 0 6)+$(note 554.37 0.08 6)+$(note 659.26 0.16 5)+$(note 880 0.24 3.2))+0.06*if(gte(t,0.3),sin(2*PI*1760*(t-0.3))*sin(2*PI*14*(t-0.3))*exp(-(t-0.3)*3),0)"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "aevalsrc='${expr}':s=44100:d=1.6" \
  -af "afade=t=in:d=0.005,afade=t=out:st=1.3:d=0.3,alimiter=limit=0.9,loudnorm=I=-15:TP=-1.5" \
  "${enc[@]}" scanSuccess/scan_success.mp3
