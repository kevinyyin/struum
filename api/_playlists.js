// Playlists: one JSON document shared by the website and the Mac (api/playlists.js, scripts/playlists.mjs).
// Shape: [{id, name, songs: [youtube video id, ...]}]. The whole list is saved at once, only if it has not
// changed since it was read, so two devices never silently overwrite each other.
import {VID} from "./_auth.js";
import {blob, isConflict, loadJson, saveJson} from "./_blobjson.js";

export const PLAYLISTS = "playlists.json";
const ID = /^[\w-]{1,40}$/;

// The cleaned list, or null when it is not a valid playlist list.
export function cleanPlaylists(x) {
  if (!Array.isArray(x) || x.length > 100) return null;
  const out = [];
  for (const p of x) {
    const name = typeof p?.name === "string" ? p.name.trim().slice(0, 80) : "";
    if (!ID.test(p?.id ?? "") || !name || !Array.isArray(p.songs) || p.songs.length > 500) return null;
    if (!p.songs.every((s) => typeof s === "string" && VID.test(s))) return null;
    out.push({id: p.id, name, songs: [...new Set(p.songs)]});
  }
  return out;
}

export async function readPlaylists(io = blob) {
  const {value, etag} = await loadJson(PLAYLISTS, io);
  return {playlists: cleanPlaylists(value) ?? [], etag};
}

// {etag} on success, {conflict: true} if it changed elsewhere, {invalid: true} for a bad list.
export async function writePlaylists(list, etag, io = blob) {
  const playlists = cleanPlaylists(list);
  if (!playlists) return {invalid: true};
  try {
    return {etag: await saveJson(PLAYLISTS, playlists, etag || null, io)};
  } catch (e) {
    if (isConflict(e)) return {conflict: true};
    throw e;
  }
}
