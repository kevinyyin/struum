import {passcodeOk, sessionCookie} from "./_auth.js";
import {blob, isConflict, loadJson, saveJson} from "./_blobjson.js";

// Wrong guesses are counted in the store (shared by every instance): 5 in a day locks logins until the oldest of
// them is a day old. Each guess is one Blob upload, so guessing spends at most about 150 a month
// (free plan: 2,000; an hourly window would allow 3,600). Cost: someone guessing can lock you out for up to a day.
const FAILS = "auth/failures.json", WINDOW = 24 * 60 * 60 * 1000, MAX = 5;
// A warm instance remembers the lockout, so hammering a locked login costs no Blob reads (free plan: 10,000/month).
let lockedUntil = 0;

const tooMany = () => Response.json({error: "Too many wrong passcodes. Logins are paused for up to a day."}, {status: 429});

export async function POST(request) {
  if (!process.env.STRUM_PASSCODE) return Response.json({error: "STRUM_PASSCODE is not set on the server."}, {status: 500});
  if (Date.now() < lockedUntil) return tooMany();
  let {value, etag} = await loadJson(FAILS);
  if (!etag) {
    // No file yet: create an empty one (never overwriting one a parallel login just made) so every count is conditional.
    await blob.put(FAILS, "[]", {access: "private", addRandomSuffix: false, allowOverwrite: false,
      contentType: "application/json; charset=utf-8"}).catch(() => {});
    ({value, etag} = await loadJson(FAILS));
    if (!etag) return Response.json({error: "Logins are unavailable right now."}, {status: 503});
  }
  const fails = Array.isArray(value) ? value.filter((t) => Date.now() - t < WINDOW) : [];
  if (fails.length >= MAX) {
    lockedUntil = fails.at(-MAX) + WINDOW; // when the oldest of the last five ages out
    return tooMany();
  }
  // Count this attempt before checking it, written only if nobody wrote in between: guesses sent in parallel
  // would otherwise all read the same count and all get checked.
  let reserved;
  try {
    reserved = await saveJson(FAILS, [...fails, Date.now()], etag);
  } catch (e) {
    if (isConflict(e)) return Response.json({error: "Another login is in progress. Try again."}, {status: 429});
    return Response.json({error: "Logins are unavailable right now."}, {status: 503}); // no count, no check
  }
  let body = {};
  try { body = await request.json(); } catch { /* treated as a wrong passcode */ }
  if (!passcodeOk(body.passcode)) {
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({error: "Wrong passcode."}, {status: 401});
  }
  await saveJson(FAILS, fails, reserved).catch(() => {}); // a right passcode gives its slot back
  return new Response(null, {status: 204, headers: {"set-cookie": sessionCookie()}});
}
