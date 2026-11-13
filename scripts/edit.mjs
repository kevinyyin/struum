// The Mac's side of chord editing, for app.py.
//   node scripts/edit.mjs apply        stdin {"sheet": ..., "ops": [...]}; prints the edited sheet (exit 2: bad edit)
//   node scripts/edit.mjs pull <id>    prints the website's copy of a song's sheet.json (needs BLOB_READ_WRITE_TOKEN)
import {applyChordEdits, EditError} from "../api/_edit.js";
import {blobPath} from "../api/_auth.js";
import {loadJson} from "../api/_blobjson.js";

const [cmd, id] = process.argv.slice(2);
if (cmd === "apply") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  try {
    const {sheet, ops} = JSON.parse(input);
    console.log(JSON.stringify(applyChordEdits(sheet, ops)));
  } catch (e) {
    console.error(e.message);
    process.exit(e instanceof EditError || e instanceof SyntaxError ? 2 : 1);
  }
} else if (cmd === "pull" && blobPath(id, "sheet.json")) {
  const {value} = await loadJson(blobPath(id, "sheet.json"));
  if (!value) { console.error("not on the website"); process.exit(1); }
  console.log(JSON.stringify(value));
} else {
  console.error("usage: edit.mjs apply | pull <video id>");
  process.exit(2);
}
