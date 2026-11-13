// Guitar tuner: microphone → pitch → nearest string. The audio is analysed in the browser and never leaves it.

export const STRINGS = [ // standard tuning, low to high
  {name: "E", octave: 2, freq: 82.41},
  {name: "A", octave: 2, freq: 110.0},
  {name: "D", octave: 3, freq: 146.83},
  {name: "G", octave: 3, freq: 196.0},
  {name: "B", octave: 3, freq: 246.94},
  {name: "E", octave: 4, freq: 329.63},
];
export const IN_TUNE = 5; // cents either way

const cents = (f, ref) => 1200 * Math.log2(f / ref);

// Fundamental frequency of a mono buffer (autocorrelation with parabolic refinement), or null for silence/noise.
export function detectPitch(buf, sampleRate) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / n) < 0.01) return null; // too quiet to be a string
  const m = Math.floor(n / 2), c = new Float32Array(m);
  for (let lag = 0; lag < m; lag++) {
    let s = 0;
    for (let j = 0; j < n - lag; j++) s += buf[j] * buf[j + lag];
    c[lag] = s;
  }
  // skip the first peak at lag 0, then take the highest peak after it (60 Hz floor via m)
  let d = 0;
  while (d < m - 1 && c[d] > c[d + 1]) d++;
  let best = -1, at = -1;
  for (let i = d; i < m; i++) if (c[i] > best) { best = c[i]; at = i; }
  if (at <= 0 || at >= m - 1 || best < c[0] * 0.3) return null; // no clear periodic tone
  // an octave error picks a multiple of the period: prefer the shortest lag that is nearly as strong
  for (const k of [4, 3, 2]) {
    const sub = Math.round(at / k);
    if (sub > d) {
      let sb = -1, sa = sub;
      for (let i = Math.max(d, sub - 2); i <= Math.min(m - 2, sub + 2); i++) if (c[i] > sb) { sb = c[i]; sa = i; }
      if (sb > best * 0.9) { at = sa; break; }
    }
  }
  const a = (c[at - 1] + c[at + 1] - 2 * c[at]) / 2, b = (c[at + 1] - c[at - 1]) / 2;
  const period = a ? at - b / (2 * a) : at;
  return sampleRate / period;
}

// The string a frequency is closest to (in cents), and how far off it is.
export function nearestString(freq) {
  let best = null;
  for (const s of STRINGS) {
    const off = cents(freq, s.freq);
    if (!best || Math.abs(off) < Math.abs(best.cents)) best = {...s, cents: off};
  }
  return best;
}

// Starts listening; calls onReading({string, cents, freq}) about ten times a second, or null when nothing is heard.
// Returns stop(). Throws the getUserMedia error (NotAllowedError, NotFoundError) when the mic is unavailable.
export async function listen(onReading) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}, // keep the string's pitch untouched
  });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096; // about 90 ms: several periods of the low E
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const recent = [];
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    const f = detectPitch(buf, ctx.sampleRate);
    if (!f || f < 60 || f > 1000) { recent.length = 0; return onReading(null); }
    recent.push(f);
    if (recent.length > 5) recent.shift();
    const steady = [...recent].sort((x, y) => x - y)[recent.length >> 1]; // median: one bad frame doesn't jump the needle
    const s = nearestString(steady);
    onReading({string: s, cents: s.cents, freq: steady});
  }, 100);
  return () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  };
}
