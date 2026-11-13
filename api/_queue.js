// Songs the website asks for; the Mac makes them. One private blob, queue.json, written with an ETag check so the
// website adding a song and the Mac updating one never overwrite each other. Shared by api/queue.js and
// scripts/queue.mjs. A check that finds nothing writes nothing: uploads are the scarce Blob operation.
import {randomUUID} from "node:crypto";
import {get, put} from "@vercel/blob";

const QUEUE = "queue.json";
const KEEP = 24 * 60 * 60 * 1000; // finished entries stay a day so the page can show the result
const STALE = 30 * 60 * 1000; // a song "making" this long means the Mac stopped mid-way: try it again
const blob = {get, put};
const open = (x) => x.status === "waiting" || x.status === "making";

async function load(io) {
  let r;
  try { r = await io.get(QUEUE, {access: "private", useCache: false}); } catch { r = null; }
  if (r?.statusCode !== 200) return {items: [], etag: null};
  try {
    const items = JSON.parse(await new Response(r.stream).text());
    return {items: Array.isArray(items) ? items : [], etag: r.blob.etag};
  } catch {
    return {items: [], etag: r.blob.etag};
  }
}

// change(items, now) returns {items, result} to write, or {result} to leave the queue as it is.
async function update(change, io) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const {items, etag} = await load(io);
    const now = Date.now();
    const out = change(items.filter((x) => open(x) || now - x.at < KEEP), now);
    if (!out.items) return out.result;
    try {
      await io.put(QUEUE, JSON.stringify(out.items), {access: "private", addRandomSuffix: false, allowOverwrite: true,
        contentType: "application/json", ...(etag ? {ifMatch: etag} : {})});
      return out.result;
    } catch (e) {
      if (!/precondition/i.test(`${e?.name} ${e?.message}`)) throw e; // someone else wrote first: read again
    }
  }
  throw new Error("The queue is busy; try again.");
}

export const readQueue = async (io = blob) => (await load(io)).items;

export const enqueue = (song, io = blob) => update((items, now) => {
  const same = items.find((x) => open(x) && x.title === song.title && x.artist === song.artist);
  if (same) return {result: same};
  const item = {id: randomUUID(), ...song, status: "waiting", at: now, tries: 0};
  return {items: [...items, item], result: item};
}, io);

// The Mac takes the oldest waiting song (or one it dropped mid-way), marking it "making".
export const claimNext = (io = blob) => update((items, now) => {
  const i = items.findIndex((x) => x.status === "waiting" || (x.status === "making" && now - x.at > STALE));
  if (i < 0) return {result: null};
  const item = items[i];
  const next = item.tries >= 2
    ? {...item, status: "failed", error: "Gave up after two tries.", at: now}
    : {...item, status: "making", at: now, tries: item.tries + 1};
  const all = items.map((x, k) => (k === i ? next : x));
  return {items: all, result: next.status === "making" ? next : null};
}, io);

export const finish = (id, status, detail, io = blob) => update((items, now) => {
  if (!items.some((x) => x.id === id)) return {result: null};
  const done = (x) => ({...x, status, at: now, ...(status === "done" ? {video_id: detail} : {error: detail})});
  return {items: items.map((x) => (x.id === id ? done(x) : x)), result: id};
}, io);
