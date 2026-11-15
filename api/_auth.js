// Shared by the hosted functions and scripts/sync.mjs. Files starting with "_" are not functions on Vercel.
import {createHmac, timingSafeEqual} from "node:crypto";

export const FILES = {
  "sheet.json": "application/json; charset=utf-8",
  "sheet.txt": "text/plain; charset=utf-8",
  "sheet.html": "text/html; charset=utf-8",
  "audio.mp3": "audio/mpeg",
};
export const VID = /^[\w-]{6,20}$/;

// Blob pathname for a song file, or null for anything that is not one.
export const blobPath = (id, file) => (VID.test(id || "") && Object.hasOwn(FILES, file || "") ? `songs/${id}/${file}` : null);

// The session cookie is derived from the passcode: changing STRUM_PASSCODE logs every browser out.
const mac = (pass) => createHmac("sha256", pass).update("strum-session-v1").digest("hex");
const same = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const passcodeOk = (given, pass = process.env.STRUM_PASSCODE) =>
  !!pass && typeof given === "string" && same(mac(given), mac(pass));

export const sessionCookie = (pass = process.env.STRUM_PASSCODE) =>
  `strum_auth=${mac(pass)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;

export function authed(request, pass = process.env.STRUM_PASSCODE) {
  if (!pass) return false;
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)strum_auth=([0-9a-f]{64})(?:;|$)/);
  return !!m && same(m[1], mac(pass));
}
