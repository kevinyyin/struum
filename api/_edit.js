// Hand edits to a sheet's chords, shared by the website (api/chords.js) and the Mac (scripts/edit.mjs).
// An edit only replaces the chord names in one slot (a word, or a chord-only row); lyrics and timing stay as made.
//   op = {row: <row index>, word: <word index, or null for a chord-only row>, names: ["C", "G/B", ...]}

import {CHORD} from "../static/chords.js";

export class EditError extends Error {}

// Existing chords keep their times; added ones start at the slot's start, extras spread across the slot.
const retime = (old, names, start, end) =>
  names.map((name, i) => ({name, time: old[i]?.time ?? start + ((end - start) * i) / names.length}));

export function applyChordEdits(sheet, ops) {
  if (!sheet || !Array.isArray(sheet.rows)) throw new EditError("Not a sheet.");
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 2000) throw new EditError("No changes to save.");
  const rows = structuredClone(sheet.rows);
  for (const op of ops) {
    const row = rows[op?.row];
    const names = op?.names;
    if (!row || !Array.isArray(names) || names.length > 8 || !names.every((n) => typeof n === "string" && CHORD.test(n))) {
      throw new EditError("One of those chords doesn't look right.");
    }
    if (row.type === "instrumental") {
      if (op.word !== null && op.word !== undefined) throw new EditError("That row has no words.");
      row.chords = retime(row.chords, names, row.start, row.end);
    } else {
      const w = row.words?.[op.word];
      if (!w) throw new EditError("That word is not in the sheet.");
      const start = w.start ?? row.start, end = row.words[op.word + 1]?.start ?? row.end;
      w.chords = retime(w.chords, names, start, end);
    }
  }
  // a chord-only row with every chord removed goes away
  return {...sheet, rows: rows.filter((r) => r.type !== "instrumental" || r.chords.length), edited: Date.now() / 1000};
}
