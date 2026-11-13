import test from "node:test";
import assert from "node:assert/strict";
import { tidy } from "../static/tidy.js";

test("tidy splits a pasted link's YouTube title into song and artist", () => {
  assert.deepEqual(tidy("The Beatles - The Beatles - Let It Be (Official Music Video) [Remastered 2015]", ""), {title: "Let It Be", artist: "The Beatles"});
  assert.deepEqual(tidy("AC/DC - Back In Black (Official 4K Video)", ""), {title: "Back In Black", artist: "AC/DC"});
  assert.deepEqual(tidy("晴天", "周杰倫"), {title: "晴天", artist: "周杰倫"});
  assert.deepEqual(tidy("Look After You", "The Fray"), {title: "Look After You", artist: "The Fray"});
  assert.deepEqual(tidy("Some Song", ""), {title: "Some Song", artist: ""});
  assert.deepEqual(tidy("Song (Remix) - Live", "Band"), {title: "Song (Remix) - Live", artist: "Band"});
});
