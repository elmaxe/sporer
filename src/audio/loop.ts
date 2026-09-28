/**
 * Makes a clip loop without a seam. The last `overlap` samples are
 * crossfaded (equal power) into the first `overlap`, and the output is
 * `overlap` samples shorter. Played on a native loop, the end now runs
 * straight into the audio that followed it in the original, with the
 * original start faded in on top.
 *
 * `overlap` is clamped to half the clip. Returns new arrays and leaves the
 * input alone.
 */
export function crossfadeLoop(channels: readonly Float32Array[], overlap: number): Float32Array<ArrayBuffer>[] {
  return channels.map((src) => {
    const n = src.length;
    const k = Math.max(0, Math.min(Math.floor(overlap), Math.floor(n / 2)));
    const out = src.slice(0, n - k);
    for (let i = 0; i < k; i++) {
      const t = (i / k) * (Math.PI / 2);
      out[i] = src[i] * Math.sin(t) + src[n - k + i] * Math.cos(t);
    }
    return out;
  });
}
