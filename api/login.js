import {passcodeOk, sessionCookie} from "./_auth.js";

export async function POST(request) {
  if (!process.env.STRUM_PASSCODE) return Response.json({error: "STRUM_PASSCODE is not set on the server."}, {status: 500});
  let body = {};
  try { body = await request.json(); } catch { /* treated as a wrong passcode */ }
  if (!passcodeOk(body.passcode)) {
    await new Promise((r) => setTimeout(r, 600)); // slows guessing
    return Response.json({error: "Wrong passcode."}, {status: 401});
  }
  return new Response(null, {status: 204, headers: {"set-cookie": sessionCookie()}});
}
