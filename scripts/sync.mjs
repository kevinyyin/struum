// Upload finished songs from data/ to the Vercel Blob store, then the library index the hosted page reads.
// Usage: node scripts/sync.mjs            upload every song not yet in the store
//        node scripts/sync.mjs <id> ...   (re)upload these songs
// Needs BLOB_READ_WRITE_TOKEN (the private store's read-write token) in the environment.
import {readdir, readFile, stat} from "node:fs/promises";
import {list, put} from "@vercel/blob";
import {FILES, blobPath} from "../api/_auth.js";

const DATA = new URL("../data/", import.meta.url);

// Same rules as app.py's /api/library: finished songs only, newest first.
export async function localSongs() {
  const songs = [];
  for (const dir of await readdir(DATA).catch(() => [])) {
    const f = new URL(`${dir}/sheet.json`, DATA);
    try {
      const s = JSON.parse(await readFile(f, "utf8"));
      if (s.video_id !== dir) continue; // a job's temp folder
      songs.push({video_id: s.video_id, title: s.title ?? null, artist: s.artist ?? null, duration: s.duration ?? null,
        made: (await stat(f)).mtimeMs / 1000});
    } catch { /* not a song folder */ }
  }
  return songs.sort((a, b) => b.made - a.made);
}

async function remotePaths() {
  const have = new Set();
  let cursor;
  do {
    const r = await list({prefix: "songs/", cursor});
    r.blobs.forEach((b) => have.add(b.pathname));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return have;
}

async function main(ids) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("sync: BLOB_READ_WRITE_TOKEN is not set; nothing uploaded.");
    process.exit(1);
  }
  const songs = await localSongs();
  const have = await remotePaths();
  for (const s of songs) {
    if (ids.length && !ids.includes(s.video_id)) continue;
    for (const file of Object.keys(FILES)) {
      const path = blobPath(s.video_id, file);
      if (!ids.length && have.has(path)) continue;
      const body = await readFile(new URL(`${s.video_id}/${file}`, DATA)).catch(() => null);
      if (!body) { console.warn(`sync: ${path} missing locally, skipped`); continue; }
      await put(path, body, {access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: FILES[file]});
      console.log(`sync: uploaded ${path}`);
    }
  }
  await put("library.json", JSON.stringify(songs), {access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json; charset=utf-8"});
  console.log(`sync: library.json (${songs.length} songs)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
