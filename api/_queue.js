// Songs the website asks for; the Mac makes them. One private blob, queue.json, written with an ETag check so the
// website adding a song and the Mac updating one never overwrite each other. Shared by api/queue.js and
// scripts/queue.mjs. A check that finds nothing writes nothing: uploads are the scarce Blob operation.
import {randomUUID} from "node:crypto";
import {blob, isConflict, loadJson, saveJson} from "./_blobjson.js";

const QUEUE = "queue.json";
const KEEP = 24 * 60 * 60 * 1000; // finished entries stay a day so the page can show the result
const STALE = 30 * 60 * 1000; // a song "making" this long means the Mac stopped mid-way: try it again
const open = (x) => x.status === "waiting" || x.status === "making";

async function load(io) {
  const {value, etag} = await loadJson(QUEUE, io);
  return {items: Array.isArray(value) ? value : [], etag};
}

// change(items, now) returns {items, result} to write, or {result} to leave the queue as it is.
async function update(change, io) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const {items, etag} = await load(io);
    const now = Date.now();
    const out = change(items.filter((x) => open(x) || now - x.at < KEEP), now);
    if (!out.items) return out.result;
    try {
      await saveJson(QUEUE, out.items, etag, io);
      return out.result;
    } catch (e) {
      if (!isConflict(e)) throw e; // someone else wrote first: read again
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

// A sheet edited on the website: the Mac fetches it and re-makes its .txt/.html. One pending pull per song.
export const enqueuePull = (videoId, io = blob) => update((items, now) => {
  if (items.some((x) => open(x) && x.type === "pull" && x.video_id === videoId)) return {result: null};
  return {items: [...items, {id: randomUUID(), type: "pull", video_id: videoId, status: "waiting", at: now, tries: 0}], result: videoId};
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
