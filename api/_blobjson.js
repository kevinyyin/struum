// A small JSON document in the private Blob store, read with its ETag and written only if nobody wrote in between.
import {get, put} from "@vercel/blob";

export const blob = {get, put};
export const isConflict = (e) => /precondition/i.test(`${e?.name} ${e?.message}`);

// {value, etag}: value is null when the document is missing or unreadable.
export async function loadJson(path, io = blob) {
  let r;
  try { r = await io.get(path, {access: "private", useCache: false}); } catch { r = null; }
  if (r?.statusCode !== 200) return {value: null, etag: null};
  // A compressed read reports a weak ETag (W/"…"); the conditional write only accepts the plain one.
  const etag = r.blob.etag?.replace(/^W\//, "") ?? null;
  try { return {value: JSON.parse(await new Response(r.stream).text()), etag}; } catch { return {value: null, etag}; }
}

// Returns the new ETag. Throws (isConflict) when the document changed since `etag` was read.
export async function saveJson(path, value, etag, io = blob) {
  const r = await io.put(path, JSON.stringify(value), {access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json; charset=utf-8", ...(etag ? {ifMatch: etag} : {})});
  return r?.etag ?? null;
}
