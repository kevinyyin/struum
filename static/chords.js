export const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MIXED = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const idx = (n) => { const i = SHARP.indexOf(n); return i < 0 ? FLAT.indexOf(n) : i; };
// root, quality suffix (may be unknown), optional bass
const PARSE = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/;

export function transpose(name, semitones, scale = SHARP) {
  const m = PARSE.exec(name);
  if (!m) return name;
  const at = (n) => (idx(n) + semitones % 12 + 12) % 12;
  const root = scale[at(m[1])];
  return root + m[2] + (m[3] ? "/" + bassName(root, at(m[3]), scale) : "");
}

// A bass that is the chord's third or fifth keeps that letter (E/G#, not E/Ab), whatever the key table says.
function bassName(root, b, scale) {
  const step = {3: 2, 4: 2, 7: 4}[(b - idx(root) + 12) % 12];
  if (!step) return scale[b];
  const letter = "CDEFGAB"[("CDEFGAB".indexOf(root[0]) + step) % 7];
  return [SHARP[b], FLAT[b]].find((n) => n[0] === letter) ?? scale[b];
}

// Spelling table for the estimated key: flat keys FLAT, C/G/D (and relative minors) MIXED, the rest SHARP. Tonic = most frequent chord, ties to the earliest.
export function spelling(names) {
  const count = new Map();
  for (const n of names) count.set(n, (count.get(n) ?? 0) + 1);
  let tonic = null, top = 0;
  for (const [n, c] of count) if (c > top) { tonic = n; top = c; }
  const m = tonic && PARSE.exec(tonic);
  if (!m) return SHARP;
  const minor = /^m(?!aj)/.test(m[2]);
  const key = (idx(m[1]) + (minor ? 3 : 0)) % 12; // relative major
  return [1, 3, 5, 6, 8, 10].includes(key) ? FLAT : [0, 2, 7].includes(key) ? MIXED : SHARP;
}

const OPEN = /^(?:[CAGED]7?|[AED]m7?)$/;

export function suggestCapo(names) {
  let best = 0, bestScore = -1;
  for (let f = 0; f <= 7; f++) {
    const score = names.filter((n) => OPEN.test(transpose(n, -f))).length;
    if (score > bestScore) { best = f; bestScore = score; } // strict: ties keep the lower fret
  }
  return best;
}

// dataset spells each key one way
const KEY = {C: "C", "C#": "Csharp", Db: "Csharp", D: "D", "D#": "Eb", Eb: "Eb", E: "E", F: "F",
  "F#": "Fsharp", Gb: "Fsharp", G: "G", "G#": "Ab", Ab: "Ab", A: "A", "A#": "Bb", Bb: "Bb", B: "B"};
const SUFFIX = {"": "major", m: "minor", mMaj7: "mmaj7"};
for (const s of ["7", "maj7", "m7", "dim", "dim7", "m7b5", "aug", "sus2", "sus4", "6", "m6", "9", "maj9", "m9", "11", "13", "7sus4"]) SUFFIX[s] = s;

export function findFingering(db, name) {
  const m = PARSE.exec(name);
  if (!m || !(m[2] in SUFFIX)) return null;
  const chord = db.chords[KEY[m[1]]]?.find((c) => c.suffix === SUFFIX[m[2]]);
  return chord?.positions[0] ?? null;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Numbers and the escaped name only. Frets are relative to baseFret; 0 open, -1 muted.
export function diagramSvg(position, name = "") {
  const x = (i) => 15 + i * 8, y = (f) => 22 + f * 12;
  const p = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 90" width="70" height="90" role="img"><title>${esc(name)}</title>`,
    `<g stroke="#000" stroke-width="1.3" fill="none">`];
  for (let i = 0; i < 6; i++) p.push(`<line x1="${x(i)}" y1="${y(0)}" x2="${x(i)}" y2="${y(4)}"/>`);
  for (let f = 0; f <= 4; f++) p.push(`<line x1="${x(0)}" y1="${y(f)}" x2="${x(5)}" y2="${y(f)}"${f === 0 && position.baseFret === 1 ? ' stroke-width="4.5"' : ""}/>`);
  position.frets.forEach((f, i) => {
    if (f === 0) p.push(`<circle cx="${x(i)}" cy="13" r="3.2" stroke-width="1.5"/>`);
    if (f === -1) p.push(`<path d="M${x(i) - 3.2} 9.8L${x(i) + 3.2} 16.2M${x(i) + 3.2} 9.8L${x(i) - 3.2} 16.2" stroke-width="1.6"/>`);
  });
  p.push("</g>");
  for (const b of position.barres ?? []) {
    const s = position.frets.map((f, i) => (f === b ? i : -1)).filter((i) => i >= 0);
    p.push(`<line x1="${x(s[0])}" y1="${y(b - 0.5)}" x2="${x(s[s.length - 1])}" y2="${y(b - 0.5)}" stroke="#000" stroke-width="9" stroke-linecap="round"/>`);
  }
  position.frets.forEach((f, i) => { if (f > 0) p.push(`<circle cx="${x(i)}" cy="${y(f - 0.5)}" r="4.6"/>`); });
  if (position.baseFret > 1) p.push(`<text x="1" y="${y(0.5) + 3}" font-size="10" font-weight="700">${Number(position.baseFret)}</text>`);
  return p.join("") + "</svg>";
}
