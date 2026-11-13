import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpose, prefersFlats, suggestCapo, findFingering, diagramSvg } from "../static/chords.js";

test("transpose", () => {
  assert.equal(transpose("C", 2, false), "D");
  assert.equal(transpose("Am7", -2, false), "Gm7");
  assert.equal(transpose("B", 1, false), "C");
  assert.equal(transpose("C/E", 2, false), "D/F#");
  assert.equal(transpose("A", 1, true), "Bb");
  assert.equal(transpose("F#m7b5", 0, false), "F#m7b5");
  assert.equal(transpose("???", 3, false), "???");
});
test("prefersFlats", () => {
  assert.equal(prefersFlats(["Bb", "F", "Gm"]), true);
  assert.equal(prefersFlats(["E", "F#m", "A"]), false);
});
test("spelling follows the displayed key", () => {
  const song = ["C", "G", "Am", "F"];
  const shown = (shift) => song.map((n) => transpose(n, shift, prefersFlats(song.map((x) => transpose(x, shift, false))))).join(" ");
  assert.equal(shown(-2), "Bb F Gm Eb");
  assert.equal(shown(-3), "A E F#m D");
  assert.equal(shown(0), "C G Am F");
  // The recognizer spells Ab/Eb/Bb as flats whatever the key: at shift 0 an E-major song still reads in sharps.
  const e = ["E", "B", "Abm", "A", "Ebdim"];
  const flats = prefersFlats(e.map((n) => transpose(n, 0, false)));
  assert.equal(e.map((n) => transpose(n, 0, flats)).join(" "), "E B G#m A D#dim");
});
test("suggestCapo picks the fret with most open shapes", () => {
  assert.equal(suggestCapo(["C", "G", "Am", "Em"]), 0);
  assert.equal(suggestCapo(["E", "B", "C#m", "F#m"]), 4);   // plays as C G Am Dm
  assert.equal(suggestCapo(["C", "G", "Am", "F"]), 5);      // plays as G D Em C
  assert.equal(suggestCapo([]), 0);
  assert.equal(suggestCapo(["Bm7", "F#m7", "Em7"]), 2);    // m7 shapes count as open: Am7 Em7 Dm7
});
test("fingering lookup and diagram", () => {
  const db = JSON.parse(readFileSync(new URL("../static/guitar.json", import.meta.url)));
  for (const n of ["C", "Am", "G7", "F#m", "Bb", "Dsus4", "Em7", "C#", "Gb", "D#m7", "G11", "A13", "C7sus4"]) assert.ok(findFingering(db, n), n);
  assert.deepEqual(findFingering(db, "C/E"), findFingering(db, "C"));
  assert.deepEqual(findFingering(db, "Gb"), findFingering(db, "F#"));
  assert.equal(findFingering(db, "Cweird13"), null);
  assert.match(diagramSvg(findFingering(db, "C"), "C"), /^<svg[\s\S]*<title>C<\/title>[\s\S]*<\/svg>$/);
  assert.match(diagramSvg(findFingering(db, "C"), "<&>"), /<title>&lt;&amp;&gt;<\/title>/);
});
