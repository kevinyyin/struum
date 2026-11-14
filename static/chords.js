export const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MIXED = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const idx = (n) => { const i = SHARP.indexOf(n); return i < 0 ? FLAT.indexOf(n) : i; };
// A chord name someone may type: root, a short quality, optional bass. Shared with api/_edit.js.
export const CHORD = /^[A-G][#b]?[A-Za-z0-9#b()+]{0,8}(\/[A-G][#b]?)?$/;
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

// Open strings, low to high, as pitch classes; frets in the dataset are relative to baseFret.
const TUNING = [4, 9, 2, 7, 11, 4];
const fretOf = (p, i) => (p.frets[i] > 0 ? p.frets[i] + p.baseFret - 1 : 0);
const noteOf = (p, i) => (TUNING[i] + fretOf(p, i)) % 12;

// Start a shape on its bass note: where one of the three low strings plays it, the strings below are muted.
// (The dataset draws Bm as 224432, with F# under the root; this gives x24432.)
function fromBass(p, bass) {
  const i = [0, 1, 2].find((k) => p.frets[k] >= 0 && noteOf(p, k) === bass);
  return i > 0 ? {...p, frets: p.frets.map((f, k) => (k < i ? -1 : f))} : p;
}

// How awkward a shape is; lower is easier. A wrong bass, muted strings (cheap right above the bass, dear anywhere else),
// the fret span, a barre and playing far up the neck all cost. Ties keep the dataset's order.
function cost(p, bass) {
  const first = p.frets.findIndex((f) => f >= 0);
  let i = first + 1, c = noteOf(p, first) === bass ? 0 : 5;
  for (; p.frets[i] < 0; i++) c += 1;
  c += 4 * p.frets.slice(i).filter((f) => f < 0).length;
  const held = p.frets.map((_, k) => fretOf(p, k)).filter((f) => f > 0);
  if (held.length) c += Math.max(...held) - Math.min(...held) + 1 + Math.max(0, Math.max(...held) - 4);
  return c + (p.barres?.length ? 2 : 0);
}
const pick = (chord, bass) => chord && chord.positions.map((p) => fromBass(p, bass)).reduce((x, y) => (cost(y, bass) < cost(x, bass) ? y : x));

// A slash chord gets its own shape where the dataset has one (every major and minor does).
// Otherwise it gets the plain chord's shape, marked noBass so the page can say so.
export function findFingering(db, name) {
  const m = PARSE.exec(name);
  if (!m || !(m[2] in SUFFIX)) return null;
  const all = db.chords[KEY[m[1]]] ?? [];
  if (m[3]) {
    const b = idx(m[3]);
    const slash = pick(all.find((c) => c.suffix === `${m[2]}/${SHARP[b]}` || c.suffix === `${m[2]}/${FLAT[b]}`), b);
    if (slash) return slash;
  }
  const pos = pick(all.find((c) => c.suffix === SUFFIX[m[2]]), idx(m[1]));
  return pos && m[3] ? {...pos, noBass: true} : pos ?? null;
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
