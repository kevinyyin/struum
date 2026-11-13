// The Mac's access to the shared playlists, for app.py's /api/playlists.
//   node scripts/playlists.mjs get          prints {"playlists": [...], "etag": ...}
//   node scripts/playlists.mjs put <etag|-> reads the playlists JSON on stdin; prints {"etag": ...}
//                                           exit 3: changed elsewhere, exit 2: not a valid list
// With BLOB_READ_WRITE_TOKEN they live in the Blob store (shared with the website); without, in data/playlists.json.
import {createHash} from "node:crypto";
import {readFile, writeFile, rename} from "node:fs/promises";
import {readPlaylists, writePlaylists} from "../api/_playlists.js";
import {blob} from "../api/_blobjson.js";

const FILE = process.env.STRUM_PLAYLISTS_FILE || new URL("../data/playlists.json", import.meta.url).pathname;
const tag = (text) => createHash("sha1").update(text).digest("hex");

// Same get/put contract as the Blob SDK, on a local file.
const file = {
  async get() {
    const text = await readFile(FILE, "utf8").catch(() => null);
    return text === null ? null : {statusCode: 200, stream: new Blob([text]).stream(), blob: {etag: tag(text)}};
  },
  async put(_path, text, opts) {
    const now = await readFile(FILE, "utf8").catch(() => null);
    if (opts.ifMatch && (now === null || tag(now) !== opts.ifMatch)) {
      throw Object.assign(new Error("Precondition failed"), {name: "BlobPreconditionFailedError"});
    }
    await writeFile(`${FILE}.tmp`, text);
    await rename(`${FILE}.tmp`, FILE);
    return {etag: tag(text)};
  },
};
const io = process.env.BLOB_READ_WRITE_TOKEN ? blob : file;

const [cmd, etag] = process.argv.slice(2);
if (cmd === "get") {
  console.log(JSON.stringify(await readPlaylists(io)));
} else if (cmd === "put") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  let list = null;
  try { list = JSON.parse(input); } catch { /* invalid below */ }
  const r = await writePlaylists(list, etag === "-" ? null : etag, io);
  if (r.invalid) process.exit(2);
  if (r.conflict) process.exit(3);
  console.log(JSON.stringify({etag: r.etag}));
} else {
  console.error("usage: playlists.mjs get | put <etag|->");
  process.exit(2);
}
