import {authed} from "./_auth.js";
import {enqueue, readQueue} from "./_queue.js";

const text = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 300;

export async function GET(request) {
  if (!authed(request)) return Response.json({error: "Passcode needed."}, {status: 401});
  return Response.json(await readQueue(), {headers: {"cache-control": "no-store"}});
}

// Ask the Mac to make a song: what a Spotify pick sends (artist, title, duration), plus album art for the page.
export async function POST(request) {
  if (!authed(request)) return Response.json({error: "Passcode needed."}, {status: 401});
  let b = {};
  try { b = await request.json(); } catch { /* checked below */ }
  const duration = Number(b.duration);
  if (!text(b.title) || !text(b.artist) || !(duration > 0 && duration <= 15 * 60)) {
    return Response.json({error: "That song request is incomplete."}, {status: 400});
  }
  const art = /^https:\/\/[\w.-]+\.scdn\.co\/[^"'()\\\s]*$/.test(b.art || "") ? b.art : "";
  return Response.json(await enqueue({title: b.title.trim(), artist: b.artist.trim(), duration, art}));
}
