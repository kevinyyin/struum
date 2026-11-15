import test from "node:test";
import assert from "node:assert/strict";
import { applyChordEdits, EditError } from "../api/_edit.js";
import { CHORD } from "../static/chords.js";

const sheet = () => ({
  title: "t", video_id: "abcdefghijk",
  rows: [
    { type: "instrumental", start: 0, end: 4, chords: [{ time: 0, name: "G" }, { time: 2, name: "C" }] },
    { type: "lyrics", start: 4, end: 8, words: [
      { text: "My", start: 4, chords: [{ time: 4, name: "G" }] },
      { text: "friends", start: 5, chords: [] },
      { text: "are", start: 6.5, chords: [] },
    ] },
  ],
});

test("changing a chord keeps its time; lyrics are untouched", () => {
  const out = applyChordEdits(sheet(), [{ row: 1, word: 0, names: ["Em"] }]);
  assert.deepEqual(out.rows[1].words[0].chords, [{ time: 4, name: "Em" }]);
  assert.equal(out.rows[1].words[1].text, "friends");
  assert.ok(out.edited > 0);
});

test("adding a chord to a word starts it at that word", () => {
  const out = applyChordEdits(sheet(), [{ row: 1, word: 1, names: ["C"] }]);
  assert.deepEqual(out.rows[1].words[1].chords, [{ time: 5, name: "C" }]);
  const two = applyChordEdits(sheet(), [{ row: 1, word: 1, names: ["C", "D"] }]);
  assert.deepEqual(two.rows[1].words[1].chords.map((c) => c.time), [5, 5.75]); // spread across the word
});

test("removing chords; an emptied chord-only row disappears", () => {
  const out = applyChordEdits(sheet(), [{ row: 0, word: null, names: [] }, { row: 1, word: 0, names: [] }]);
  assert.equal(out.rows.length, 1);
  assert.deepEqual(out.rows[0].words[0].chords, []);
});

test("bad edits are refused", () => {
  for (const ops of [[], [{ row: 9, word: 0, names: ["C"] }], [{ row: 1, word: 7, names: ["C"] }],
    [{ row: 0, word: 1, names: ["C"] }], [{ row: 1, word: 0, names: ["<b>"] }], [{ row: 1, word: 0, names: Array(9).fill("C") }]]) {
    assert.throws(() => applyChordEdits(sheet(), ops), EditError, JSON.stringify(ops));
  }
});

test("chord names: the usual guitar spellings pass, anything else does not", () => {
  for (const ok of ["C", "F#m", "Bb7", "Cmaj7", "Dsus4", "G/B", "Am7/G", "C#m7b5", "E7sus4", "Aadd9"]) assert.ok(CHORD.test(ok), ok);
  for (const bad of ["", "H", "c", "C/", "C D", "C<", "Cmaj7extra12", "../x"]) assert.ok(!CHORD.test(bad), bad);
});
