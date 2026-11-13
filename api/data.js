import {get, issueSignedToken, presignUrl} from "@vercel/blob";
import {authed, blobPath, FILES} from "./_auth.js";

// /data/<id>/<file> (rewritten here by vercel.json): the same URLs the local server serves from data/.
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const file = q.get("file");
  const path = blobPath(q.get("id"), file);
  if (!path) return new Response("Not found", {status: 404});
  if (!authed(request)) return new Response("Passcode needed", {status: 401});

  if (file === "audio.mp3") {
    // Audio goes straight to Blob through a short-lived signed link, so the player can seek.
    const validUntil = Date.now() + 6 * 60 * 60 * 1000;
    const token = await issueSignedToken({pathname: path, operations: ["get"], validUntil});
    const {presignedUrl} = await presignUrl(token, {operation: "get", pathname: path, access: "private", validUntil});
    return new Response(null, {status: 302, headers: {location: presignedUrl, "cache-control": "no-store"}});
  }
  const r = await get(path, {access: "private", useCache: false}); // sheets can be edited: always the latest
  if (r?.statusCode !== 200) return new Response("Not found", {status: 404});
  return new Response(r.stream, {headers: {"content-type": FILES[file], "cache-control": "no-cache"}});
}
