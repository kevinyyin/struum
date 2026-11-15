import {passcodeOk, sessionCookie} from "./_auth.js";
import {loadJson, saveJson} from "./_blobjson.js";

// Wrong guesses are counted in the store (shared by every instance): 5 in a day locks logins until the oldest of
// them is a day old. Each wrong guess is one Blob upload, so guessing spends at most about 150 a month
// (free plan: 2,000; an hourly window would allow 3,600). Cost: someone guessing can lock you out for up to a day.
const FAILS = "auth/failures.json", WINDOW = 24 * 60 * 60 * 1000, MAX = 5;
// A warm instance remembers the lockout, so hammering a locked login costs no Blob reads (free plan: 10,000/month).
let lockedUntil = 0;

async function recentFailures() {
  const {value} = await loadJson(FAILS);
  return Array.isArray(value) ? value.filter((t) => Date.now() - t < WINDOW) : [];
}

const tooMany = () => Response.json({error: "Too many wrong passcodes. Logins are paused for up to a day."}, {status: 429});

export async function POST(request) {
  if (!process.env.STRUM_PASSCODE) return Response.json({error: "STRUM_PASSCODE is not set on the server."}, {status: 500});
  if (Date.now() < lockedUntil) return tooMany();
  const fails = await recentFailures();
  if (fails.length >= MAX) {
    lockedUntil = fails.at(-MAX) + WINDOW; // when the oldest of the last five ages out
    return tooMany();
  }
  let body = {};
  try { body = await request.json(); } catch { /* treated as a wrong passcode */ }
  if (!passcodeOk(body.passcode)) {
    await saveJson(FAILS, [...fails, Date.now()], null).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({error: "Wrong passcode."}, {status: 401});
  }
  return new Response(null, {status: 204, headers: {"set-cookie": sessionCookie()}});
}
