import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHARP, FLAT, transpose, spelling, suggestCapo, findFingering, diagramSvg } from "../static/chords.js";

test("transpose", () => {
  assert.equal(transpose("C", 2), "D");
  assert.equal(transpose("Am7", -2), "Gm7");
  assert.equal(transpose("B", 1), "C");
  assert.equal(transpose("C/E", 2), "D/F#");
  assert.equal(transpose("A", 1, FLAT), "Bb");
  assert.equal(transpose("F#m7b5", 0), "F#m7b5");
  assert.equal(transpose("???", 3), "???");
});
test("spelling", () => {
  assert.equal(spelling(["Bb", "F", "Gm"]), FLAT);
  assert.equal(spelling(["E", "F#m", "A"]), SHARP);
});
test("spelling follows the displayed key", () => {
  const song = ["C", "G", "Am", "F"];
  const shown = (shift) => song.map((n) => transpose(n, shift, spelling(song.map((x) => transpose(x, shift))))).join(" ");
  assert.equal(shown(-2), "Bb F Gm Eb");
  assert.equal(shown(-3), "A E F#m D");
  assert.equal(shown(0), "C G Am F");
  // The recognizer spells Ab/Eb/Bb as flats whatever the key: at shift 0 an E-major song still reads in sharps.
  const e = ["E", "B", "Abm", "A", "Ebdim"];
  const sc = spelling(e.map((n) => transpose(n, 0)));
  assert.equal(e.map((n) => transpose(n, 0, sc)).join(" "), "E B G#m A D#dim");
});
const shown0 = (song) => { const sc = spelling(song); return song.map((n) => transpose(n, 0, sc)).join(" "); };
test("C and G keys spell borrowed chords as flats, E key keeps sharps", () => {
  assert.equal(shown0(["C", "F", "G", "C", "Bb", "Ab"]), "C F G C Bb Ab");
  assert.equal(shown0(["G", "C", "G", "D", "Bb"]), "G C G D Bb");
  assert.equal(shown0(["E", "A", "B", "C#m", "Abm", "E"]), "E A B C#m G#m E");
  assert.equal(shown0(["Bb", "F", "Gm", "Bb"]), "Bb F Gm Bb");
});
test("slash bass that is the chord's third or fifth keeps its letter", () => {
  assert.equal(shown0(["D", "A", "E/Ab", "D"]), "D A E/G# D");      // seen on a real song: tonic D, bass is E's third
  assert.equal(shown0(["C", "E/Ab", "Am", "C"]), "C E/G# Am C");
  assert.equal(shown0(["C", "Db/Ab", "C"]), "C C#/G# C");           // fifth follows the root's letter
  assert.equal(shown0(["Bb", "F", "Bb", "F/A", "Gb/Bb"]), "Bb F Bb F/A Gb/Bb");
  assert.equal(transpose("C/E", 2), "D/F#");
});
test("suggest handler pattern: transpose then suggestCapo", () => {
  assert.equal(suggestCapo(["C", "G", "Am", "F"].map((n) => transpose(n, 0))), 5);
  assert.equal(suggestCapo(["C", "G", "Am", "F"].map((n) => transpose(n, 2))), 7);
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
