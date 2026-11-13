import test from "node:test";
import assert from "node:assert/strict";
import { blobPath, passcodeOk, sessionCookie, authed } from "../api/_auth.js";
import { POST as login } from "../api/login.js";
import { GET as data } from "../api/data.js";
import { GET as library } from "../api/library.js";

const req = (url, cookie, init = {}) => new Request(url, { ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers || {}) } });

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
  const bad = await login(req("https://x/api/login", null, { method: "POST", body: JSON.stringify({ passcode: "wrong" }) }));
  assert.equal(bad.status, 401);
  const ok = await login(req("https://x/api/login", null, { method: "POST", body: JSON.stringify({ passcode: "right-one" }) }));
  assert.equal(ok.status, 204);
  assert.match(ok.headers.get("set-cookie"), /^strum_auth=[0-9a-f]{64};/);
  assert.equal((await data(req("https://x/api/data?id=CGj85pVzRJs&file=audio.mp3"))).status, 401);
  assert.equal((await data(req("https://x/api/data?id=..%2F&file=audio.mp3"))).status, 404);
  assert.equal((await library(req("https://x/api/library"))).status, 401);
  delete process.env.STRUM_PASSCODE;
});
