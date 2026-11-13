import {authed} from "./_auth.js";
import {readPlaylists, writePlaylists} from "./_playlists.js";

export async function GET(request) {
  if (!authed(request)) return Response.json({error: "Passcode needed."}, {status: 401});
  return Response.json(await readPlaylists(), {headers: {"cache-control": "no-store"}});
}

export async function PUT(request) {
  if (!authed(request)) return Response.json({error: "Passcode needed."}, {status: 401});
  let b = {};
  try { b = await request.json(); } catch { /* checked below */ }
  const r = await writePlaylists(b.playlists, b.etag);
  if (r.invalid) return Response.json({error: "Those playlists don't look right."}, {status: 400});
  if (r.conflict) return Response.json({error: "Your playlists changed somewhere else."}, {status: 409});
  return Response.json({etag: r.etag});
}
