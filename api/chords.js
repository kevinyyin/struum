// PUT /api/songs/<id>/chords (rewritten here by vercel.json): save hand edits to a song's chords on the website.
// The website's sheet.json changes at once; the Mac pulls it through the queue and re-makes the .txt/.html.
import {authed, blobPath} from "./_auth.js";
import {isConflict, loadJson, saveJson} from "./_blobjson.js";
import {applyChordEdits, EditError} from "./_edit.js";
import {enqueuePull} from "./_queue.js";

export async function PUT(request) {
  if (!authed(request)) return Response.json({error: "Passcode needed."}, {status: 401});
  const id = new URL(request.url).searchParams.get("id");
  const path = blobPath(id, "sheet.json");
  if (!path) return Response.json({error: "Unknown song."}, {status: 404});
  let body = {};
  try { body = await request.json(); } catch { /* checked by applyChordEdits */ }
  const {value: sheet, etag} = await loadJson(path);
  if (!sheet) return Response.json({error: "Unknown song."}, {status: 404});
  let next;
  try {
    next = applyChordEdits(sheet, body.ops);
  } catch (e) {
    if (e instanceof EditError) return Response.json({error: e.message}, {status: 400});
    throw e;
  }
  try {
    await saveJson(path, next, etag);
  } catch (e) {
    if (isConflict(e)) return Response.json({error: "This sheet changed somewhere else. Reload and try again."}, {status: 409});
    throw e;
  }
  await enqueuePull(id).catch(() => {}); // the Mac's copy catches up when it next checks the queue
  return Response.json(next);
}
