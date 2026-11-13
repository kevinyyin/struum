import test from "node:test";
import assert from "node:assert/strict";
import { enqueue, claimNext, finish, readQueue } from "../api/_queue.js";

// In-memory stand-in for Blob get/put with ETags; counts writes (the scarce operation).
function memory() {
  let body = null, etag = 0;
  const io = {
    puts: 0,
    async get() { return body === null ? null : { statusCode: 200, stream: new Blob([body]).stream(), blob: { etag: String(etag) } }; },
    async put(_path, data, opts) {
      if (opts.ifMatch && opts.ifMatch !== String(etag)) { const e = new Error("Precondition failed"); e.name = "BlobPreconditionFailedError"; throw e; }
      io.puts++; body = data; etag++;
    },
    raw: () => JSON.parse(body ?? "[]"),
    set: (items) => { body = JSON.stringify(items); etag++; },
  };
  return io;
}
const song = { title: "Sofia", artist: "Clairo", duration: 188, art: "" };

test("enqueue adds once; the same song twice is one request", async () => {
  const io = memory();
  const a = await enqueue(song, io);
  const b = await enqueue(song, io);
  assert.equal(a.id, b.id);
  assert.equal((await readQueue(io)).length, 1);
  assert.equal(a.status, "waiting");
});

test("a check with nothing waiting writes nothing", async () => {
  const io = memory();
  assert.equal(await claimNext(io), null);
  assert.equal(io.puts, 0);
  await enqueue(song, io);
  const item = await claimNext(io);
  assert.equal(item.status, "making");
  const puts = io.puts;
  assert.equal(await claimNext(io), null); // already being made
  assert.equal(io.puts, puts);
});

test("finish records the result; finished entries expire after a day", async () => {
  const io = memory();
  const item = await enqueue(song, io);
  await claimNext(io);
  await finish(item.id, "done", "abcdefghijk", io);
  assert.deepEqual((await readQueue(io)).map((x) => [x.status, x.video_id]), [["done", "abcdefghijk"]]);
  io.set(io.raw().map((x) => ({ ...x, at: Date.now() - 25 * 3600e3 })));
  await enqueue({ ...song, title: "Other" }, io);
  assert.deepEqual(io.raw().map((x) => x.title), ["Other"]);
});

test("a song left 'making' for 30 minutes is retried, then given up", async () => {
  const io = memory();
  await enqueue(song, io);
  await claimNext(io);
  const stale = () => io.set(io.raw().map((x) => ({ ...x, at: Date.now() - 31 * 60e3 })));
  stale();
  assert.equal((await claimNext(io)).tries, 2);
  stale();
  assert.equal(await claimNext(io), null);
  assert.equal(io.raw()[0].status, "failed");
});

test("a write that lost a race reads again instead of overwriting", async () => {
  const io = memory();
  await enqueue(song, io);
  const realPut = io.put;
  let first = true;
  io.put = async (p, d, o) => {
    if (first) { first = false; io.set([...io.raw(), { id: "x", title: "Racer", artist: "A", status: "waiting", at: Date.now(), tries: 0 }]); }
    return realPut(p, d, o);
  };
  await enqueue({ ...song, title: "Mine" }, io);
  assert.deepEqual(io.raw().map((x) => x.title).sort(), ["Mine", "Racer", "Sofia"]);
});
