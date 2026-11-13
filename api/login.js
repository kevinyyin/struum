import {get, put} from "@vercel/blob";
import {passcodeOk, sessionCookie} from "./_auth.js";

// Wrong guesses are counted in the store (shared by every instance): 5 in an hour locks logins for the rest of
// the hour. Each wrong guess is one Blob upload, so this also caps what guessing can spend (free plan: 2,000/month).
// Cost: someone guessing can lock you out for up to an hour; they cannot guess faster.
const FAILS = "auth/failures.json", WINDOW = 60 * 60 * 1000, MAX = 5;

async function recentFailures() {
  try {
    const r = await get(FAILS, {access: "private", useCache: false});
    if (r?.statusCode !== 200) return [];
    const all = JSON.parse(await new Response(r.stream).text());
    return Array.isArray(all) ? all.filter((t) => Date.now() - t < WINDOW) : [];
  } catch {
    return [];
  }
}

export async function POST(request) {
  if (!process.env.STRUM_PASSCODE) return Response.json({error: "STRUM_PASSCODE is not set on the server."}, {status: 500});
  const fails = await recentFailures();
  if (fails.length >= MAX) return Response.json({error: "Too many wrong passcodes. Try again in an hour."}, {status: 429});
  let body = {};
  try { body = await request.json(); } catch { /* treated as a wrong passcode */ }
  if (!passcodeOk(body.passcode)) {
    await put(FAILS, JSON.stringify([...fails, Date.now()]), {access: "private", addRandomSuffix: false, allowOverwrite: true,
      contentType: "application/json"}).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({error: "Wrong passcode."}, {status: 401});
  }
  return new Response(null, {status: 204, headers: {"set-cookie": sessionCookie()}});
}
