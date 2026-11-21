import test from "node:test";
import assert from "node:assert/strict";
import { blobPath, passcodeOk, sessionCookie, authed } from "../api/_auth.js";
import { POST as login } from "../api/login.js";
import { blob } from "../api/_blobjson.js";
import { GET as data } from "../api/data.js";
import { GET as library } from "../api/library.js";
import { GET as queueGet, POST as queuePost } from "../api/queue.js";

const req = (url, cookie, init = {}) => new Request(url, { ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers || {}) } });

// Login reads the store through the shared `blob` object: swap in one in-memory document with ETags.
function memoryBlob() {
  let body = null, etag = 0;
  const real = { ...blob };
  blob.get = async () => (body === null ? null : { statusCode: 200, stream: new Blob([body]).stream(), blob: { etag: String(etag) } });
  blob.put = async (_path, data, opts) => {
    await null; // let parallel requests interleave like real uploads
    if (opts.allowOverwrite === false && body !== null) throw new Error("This blob already exists");
    if (opts.ifMatch && opts.ifMatch !== String(etag)) { const e = new Error("Precondition failed"); e.name = "BlobPreconditionFailedError"; throw e; }
    body = data; etag++;
    return { etag: String(etag) };
  };
  return { fails: () => JSON.parse(body ?? "[]").length, restore: () => Object.assign(blob, real) };
}
const tryLogin = (passcode) => login(req("https://x/api/login", null, { method: "POST", body: JSON.stringify({ passcode }) }));

test("blob paths only for real song files", () => {
  assert.equal(blobPath("CGj85pVzRJs", "audio.mp3"), "songs/CGj85pVzRJs/audio.mp3");
  assert.equal(blobPath("../etc", "sheet.json"), null);
  assert.equal(blobPath("CGj85pVzRJs", "secret.json"), null);
  assert.equal(blobPath("CGj85pVzRJs", "constructor"), null);
  assert.equal(blobPath(null, "sheet.json"), null);
});

test("passcode and session cookie", () => {
  assert.ok(passcodeOk("hunter22", "hunter22"));
  assert.ok(!passcodeOk("hunter2", "hunter22"));
  assert.ok(!passcodeOk(undefined, "hunter22"));
  assert.ok(!passcodeOk("x", ""));
  const cookie = sessionCookie("hunter22").split(";")[0];
  assert.ok(authed(req("https://x/", `a=1; ${cookie}`), "hunter22"));
  assert.ok(!authed(req("https://x/", cookie), "other"));
  assert.ok(!authed(req("https://x/", "strum_auth=00"), "hunter22"));
  assert.ok(!authed(req("https://x/"), ""));
  assert.match(sessionCookie("p"), /HttpOnly; Secure; SameSite=Lax/);
});

test("hosted functions refuse without the passcode", async () => {
  process.env.STRUM_PASSCODE = "right-one";
  const store = memoryBlob();
  const bad = await tryLogin("wrong");
  assert.equal(bad.status, 401);
  const ok = await tryLogin("right-one");
  assert.equal(ok.status, 204);
  assert.equal(store.fails(), 1); // the right passcode gave its slot back
  store.restore();
  assert.match(ok.headers.get("set-cookie"), /^strum_auth=[0-9a-f]{64};/);
  assert.equal((await data(req("https://x/api/data?id=CGj85pVzRJs&file=audio.mp3"))).status, 401);
  assert.equal((await data(req("https://x/api/data?id=..%2F&file=audio.mp3"))).status, 404);
  assert.equal((await library(req("https://x/api/library"))).status, 401);
  assert.equal((await queueGet(req("https://x/api/queue"))).status, 401);
  const post = (body, cookie) => queuePost(req("https://x/api/queue", cookie, { method: "POST", body: JSON.stringify(body) }));
  assert.equal((await post({ title: "Sofia", artist: "Clairo", duration: 188 })).status, 401);
  const cookie = ok.headers.get("set-cookie").split(";")[0];
  assert.equal((await post({ title: "", artist: "Clairo", duration: 188 }, cookie)).status, 400);
  assert.equal((await post({ title: "Sofia", artist: "Clairo", duration: 99999 }, cookie)).status, 400);
  assert.equal((await post({ title: "Sofia", artist: "x".repeat(301), duration: 188 }, cookie)).status, 400);
  delete process.env.STRUM_PASSCODE;
});

test("logins fail closed when the store can't record the attempt", async () => {
  process.env.STRUM_PASSCODE = "right-one";
  const store = memoryBlob();
  blob.put = async () => { throw new Error("store down"); };
  assert.equal((await tryLogin("right-one")).status, 503);
  store.restore();
  delete process.env.STRUM_PASSCODE;
});

// Runs last: it leaves this module's warm-instance lockout set.
test("parallel wrong passcodes are each counted, and only one is checked at a time", async () => {
  process.env.STRUM_PASSCODE = "right-one";
  const store = memoryBlob();
  const burst = await Promise.all(Array.from({ length: 20 }, () => tryLogin("wrong")));
  const checked = burst.filter((r) => r.status === 401).length;
  assert.equal(checked, store.fails()); // every guess that got an answer was counted
  assert.ok(checked < 5, `${checked} guesses checked in one burst`);
  for (let i = 0; i < 10; i++) await tryLogin("wrong");
  assert.equal(store.fails(), 5);
  assert.equal((await tryLogin("right-one")).status, 429); // locked, even for the right one
  store.restore();
  delete process.env.STRUM_PASSCODE;
});

test("playlists are validated before they are saved", async () => {
  const { cleanPlaylists } = await import("../api/_playlists.js");
  assert.deepEqual(cleanPlaylists([{ id: "a", name: " Set ", songs: ["CGj85pVzRJs", "CGj85pVzRJs"] }]), [{ id: "a", name: "Set", songs: ["CGj85pVzRJs"] }]);
  assert.equal(cleanPlaylists([{ id: "a", name: "", songs: [] }]), null);
  assert.equal(cleanPlaylists([{ id: "a/b", name: "x", songs: [] }]), null);
  assert.equal(cleanPlaylists([{ id: "a", name: "x", songs: ["../x"] }]), null);
  assert.equal(cleanPlaylists("nope"), null);
  const { GET, PUT } = await import("../api/playlists.js");
  assert.equal((await GET(req("https://x/api/playlists"))).status, 401);
  assert.equal((await PUT(req("https://x/api/playlists", null, { method: "PUT", body: "[]" }))).status, 401);
});
