import {get} from "@vercel/blob";
import {authed} from "./_auth.js";

// The library index scripts/sync.mjs uploads from the Mac: same shape as the local /api/library.
export async function GET(request) {
  if (!authed(request)) return Response.json({error: "Passcode needed."}, {status: 401});
  const r = await get("library.json", {access: "private", useCache: false});
  if (r?.statusCode !== 200) return Response.json([]);
  return new Response(r.stream, {headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"}});
}
