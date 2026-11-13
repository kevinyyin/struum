import test from "node:test";
import assert from "node:assert/strict";
import { detectPitch, nearestString, STRINGS } from "../static/tuner.js";

const RATE = 44100, N = 4096;
// A plucked-string-like tone: fundamental plus decaying harmonics, at a mic-ish level.
function tone(freq, { level = 0.2, harmonics = [1, 0.6, 0.4, 0.25], phase = 0 } = {}) {
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    harmonics.forEach((amp, k) => { v += amp * Math.sin(2 * Math.PI * freq * (k + 1) * i / RATE + phase * (k + 1)); });
    b[i] = level * v / harmonics.reduce((x, y) => x + y, 0);
  }
  return b;
}
const centsOff = (f, ref) => 1200 * Math.log2(f / ref);

test("every open string is heard within 3 cents, with harmonics", () => {
  for (const s of STRINGS) {
    const f = detectPitch(tone(s.freq), RATE);
    assert.ok(f, `${s.name}${s.octave}`);
    assert.ok(Math.abs(centsOff(f, s.freq)) < 3, `${s.name}${s.octave}: ${f}`);
  }
});

test("low E with a strong second harmonic is not read an octave up", () => {
  const f = detectPitch(tone(82.41, { harmonics: [0.5, 1, 0.5, 0.3] }), RATE);
  assert.ok(Math.abs(centsOff(f, 82.41)) < 3, String(f));
});

test("a string 20 cents flat reads as 20 cents flat on that string", () => {
  const f = detectPitch(tone(110 * 2 ** (-20 / 1200)), RATE);
  const s = nearestString(f);
  assert.equal(s.name + s.octave, "A2");
  assert.ok(Math.abs(s.cents + 20) < 3, String(s.cents));
});

test("silence and noise give no reading", () => {
  assert.equal(detectPitch(new Float32Array(N), RATE), null);
  const noise = new Float32Array(N).map(() => (Math.random() * 2 - 1) * 0.2);
  assert.equal(detectPitch(noise, RATE), null);
});

test("nearestString picks by pitch distance", () => {
  assert.equal(nearestString(100).name + nearestString(100).octave, "A2"); // closer to 110 than 82.41 in cents
  assert.equal(nearestString(320).octave, 4);
});
