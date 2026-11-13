import {SHARP, CHORD, transpose, spelling, suggestCapo, findFingering, diagramSvg} from "/static/chords.js";
import {tidy} from "/static/tidy.js";
import {listen, STRINGS, IN_TUNE} from "/static/tuner.js";

export const current = {sheet: null, shift: 0};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const link = (href, text) => { const a = el("a", "", text); a.href = href; return a; };
const li = (child) => { const e = el("li"); e.append(child); return e; };

const CJK = /[぀-ヿ㐀-鿿가-힯]/;
const VID = /^[\w-]{6,20}$/;
const audio = $("audio");
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// localStorage can throw (blocked storage), so every access is guarded.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let rowEls = [], chordEls = [], segEls = [];
let activeRow = -1, activeChord = null;
let loop = null; // {from, to} row indices, inclusive
let pollId = 0; // a newer job cancels an older poll loop
let scale = SHARP; // spelling follows the displayed key; set in refresh
let db = null;
fetch("/static/guitar.json").then((r) => r.json()).then((j) => { db = j; drawInfo(); }).catch(() => {});

export const setError = (s) => { $("error").textContent = s; };

// Local server: can_make true. Hosted copy (Vercel): false, and the library sits behind a passcode.
export const config = fetch("/api/config").then((r) => r.json()).catch(() => ({}));
let canMake = true;
export const canMakeSongs = () => canMake;
config.then((c) => { canMake = c.can_make !== false; document.body.classList.toggle("hosted", !canMake); });
let locked = false;

/* ---------- library ---------- */

export let library = [];

/* ---------- the website's queue (hosted copy only): songs your Mac makes ---------- */

let queue = [];
const pending = (x) => x.status === "waiting" || x.status === "making";
const QUEUE_TEXT = {waiting: "Waiting for your Mac", making: "Making on your Mac…", failed: "Couldn't make it"};

// "waiting" / "making" when this song is queued, else null.
export function queuedAs(title, artist) {
  return queue.find((x) => pending(x) && x.title === title && x.artist === artist)?.status ?? null;
}

async function loadQueue() {
  if (canMake || locked) return;
  try {
    const r = await fetch("/api/queue");
    if (!r.ok) return;
    const before = new Set(queue.filter(pending).map((x) => x.id));
    queue = await r.json();
    const finished = queue.filter((x) => x.status === "done" && before.has(x.id));
    if (finished.length) {
      finished.forEach((x) => fresh.add(x.video_id));
      saveFresh();
      await loadLibrary(); // pulls in the new songs
    }
  } catch { /* try again on the next tick */ }
  drawLibrary();
  window.dispatchEvent(new Event("library"));
  watchQueue();
}

// Each check is a Blob read (free plan: 10,000 a month): every 30 s, only while something is pending and the
// page is visible, and for at most 20 minutes after the last request.
let queueTimer = 0, queueSince = 0;
function watchQueue() {
  clearTimeout(queueTimer);
  if (!queue.some(pending) || Date.now() - queueSince > 20 * 60 * 1000) return;
  queueTimer = setTimeout(() => (document.hidden ? watchQueue() : loadQueue()), 30000);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && queue.some(pending)) loadQueue(); });

export async function requestSong(song) {
  setError("");
  let r;
  try {
    r = await fetch("/api/queue", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(song)});
  } catch {
    return setError("Could not reach the server.");
  }
  if (!r.ok) return setError((await r.json().catch(() => ({}))).error || "Could not queue that song.");
  const item = await r.json();
  queue = [...queue.filter((x) => x.id !== item.id), item];
  queueSince = Date.now();
  drawLibrary();
  window.dispatchEvent(new Event("library"));
  watchQueue();
}
const sheets = new Map();
const fresh = new Set(JSON.parse(store.get("strum_fresh") || "[]"));
const saveFresh = () => store.set("strum_fresh", JSON.stringify([...fresh]));
const norm = (s) => (s || "").toLowerCase().replace(/\s*[([].*?[)\]]\s*/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// The saved song a Spotify track already became, if any.
export function findSong(title, artist) {
  const t = norm(title), a = norm(artist);
  return library.find((s) => norm(s.title) === t && norm(s.artist) === a)?.video_id ?? null;
}

export const thumb = (id) => {
  const img = el("img", "art");
  img.alt = "";
  img.src = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
  img.onerror = () => { img.removeAttribute("src"); };
  return img;
};

function songLink(s, cls, href = `#/song/${s.video_id}`) {
  const a = el("a", cls);
  a.href = href;
  a.dataset.id = s.video_id;
  const {title, artist} = tidy(s.title, s.artist);
  const text = el("div");
  text.append(el("b", "", title || "Untitled"), el("span", "who", artist || "YouTube"));
  a.append(thumb(s.video_id), text);
  if (fresh.has(s.video_id)) { const d = el("i", "dot"); d.title = "New"; a.append(d); }
  return a;
}

function drawLibrary() {
  const side = $("side-songs");
  side.replaceChildren();
  if (job) {
    const a = el("a", "song");
    a.href = "#/job";
    const text = el("div");
    text.append(el("b", "", job.title), el("span", "who", `Making… ${job.step + 1} of ${job.steps}`));
    let pic = el("span", "art ring");
    if (job.art) { pic = el("img", "art"); pic.alt = ""; pic.src = job.art; }
    a.append(pic, text, el("i", "dot busy"));
    side.append(li(a));
  }
  for (const q of queue.filter((x) => pending(x) || x.status === "failed")) {
    const row = el("div", "song");
    let pic = el("span", "art ring");
    if (q.art) { pic = el("img", "art"); pic.alt = ""; pic.src = q.art; }
    const text = el("div");
    text.append(el("b", "", q.title), el("span", "who", q.status === "failed" ? `${QUEUE_TEXT.failed}: ${q.error || ""}` : QUEUE_TEXT[q.status]));
    row.append(pic, text);
    if (pending(q)) row.append(el("i", "dot busy"));
    side.append(li(row));
  }
  for (const s of library) side.append(li(songLink(s, "song")));
  if (!library.length && !job) side.append(el("li", "side-note", "Songs you make show up here."));

  const list = $("songs-list");
  list.replaceChildren(...library.map((s) => {
    const li = el("li");
    const a = songLink(s, "item");
    a.append(el("span", "t", s.duration ? fmt(s.duration) : ""));
    li.append(a);
    return li;
  }));
  $("songs-sub").textContent = library.length
    ? `${library.length} ${library.length === 1 ? "sheet" : "sheets"}, newest first.`
    : "";
  if (!library.length) list.append(el("li", "empty", "No songs yet. Paste a YouTube link on the left, or pick one from Spotify."));
  drawPlaylists();
}

async function loadLibrary() {
  try {
    const r = await fetch("/api/library");
    locked = r.status === 401;
    if (r.ok) library = await r.json();
  } catch { /* keep the last list */ }
  document.body.classList.toggle("locked", locked);
  await config; // hosted or local is known before anything shows
  document.body.classList.remove("booting");
  drawLibrary();
  window.dispatchEvent(new Event("library"));
}


/* ---------- playlists (shared by the Mac and the website: /api/playlists) ---------- */

let playlists = [], plEtag = null;
let inList = null; // the playlist the open song was opened from
let shownPl = null; // the playlist page's id
let autoplay = false; // set when a playlist moves on to its next song
const ICON = {up: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 7.5 6 4.5l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`, down: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`, x: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 3.5l5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`, check: `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.2 7.4 8 2.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`};
const svg = (name) => { const s = el("span"); s.innerHTML = ICON[name]; return s.firstChild; }; // fixed markup only
const plById = (id) => playlists.find((p) => p.id === id);
const songById = (id) => library.find((s) => s.video_id === id);
const listSongs = (p) => p.songs.filter((id) => songById(id));
const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;

async function loadPlaylists() {
  try {
    const r = await fetch("/api/playlists");
    if (r.ok) ({playlists, etag: plEtag} = await r.json());
  } catch { /* keep what we have */ }
  drawPlaylists();
}

async function savePlaylists(next) {
  let r = null;
  try {
    r = await fetch("/api/playlists", {method: "PUT", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({playlists: next, etag: plEtag})});
  } catch { /* reported below */ }
  if (r?.ok) {
    plEtag = (await r.json()).etag;
    playlists = next;
    drawPlaylists();
    return true;
  }
  if (r?.status === 409) {
    await loadPlaylists();
    setError("Your playlists changed somewhere else, so they were reloaded. Try that again.");
  } else setError((await r?.json().catch(() => ({})))?.detail || "Could not save your playlists.");
  return false;
}

const edit = (id, change) => savePlaylists(playlists.map((p) => (p.id === id ? change(p) : p)));

async function createPlaylist(name, songs = []) {
  const p = {id: crypto.randomUUID(), name: name.trim().slice(0, 80), songs};
  if (!p.name) return null;
  return (await savePlaylists([...playlists, p])) ? p : null;
}

function plTile(p) {
  const t = el("span", "pltile", String(listSongs(p).length));
  t.setAttribute("aria-hidden", "true");
  return t;
}

function drawPlaylists() {
  // sidebar
  $("side-playlists").replaceChildren(...playlists.map((p) => {
    const a = el("a", "song");
    a.href = `#/playlist/${p.id}`;
    a.dataset.pl = p.id;
    const text = el("div");
    text.append(el("b", "", p.name), el("span", "who", plural(listSongs(p).length, "song")));
    a.append(plTile(p), text);
    return li(a);
  }));
  if (!playlists.length) $("side-playlists").append(el("li", "side-note", "Group songs into playlists from any song's page."));
  // playlists page
  $("pls-sub").textContent = playlists.length ? plural(playlists.length, "playlist") : "";
  $("pls-list").replaceChildren(...playlists.map((p) => {
    const a = el("a", "item");
    a.href = `#/playlist/${p.id}`;
    const text = el("div");
    const n = listSongs(p);
    text.append(el("b", "", p.name), el("span", "who", n.length ? n.map((id) => tidy(songById(id).title, songById(id).artist).title).join(", ") : "No songs yet"));
    a.append(plTile(p), text, el("span", "t", plural(n.length, "song")));
    return li(a);
  }));
  if (!playlists.length) $("pls-list").append(el("li", "empty", "No playlists yet. Name one above, then add songs from its page or from any song."));
  if (view === "playlist") drawPlaylistPage();
  if (current.sheet) { drawContext(); if (!$("pl-menu").hidden) drawMenu(); }
  markCurrent();
}

function drawPlaylistPage() {
  const p = plById(shownPl);
  if (!p) { location.hash = "#/playlists"; return; }
  if ($("pl-rename").hidden) $("pl-title").textContent = p.name;
  const ids = listSongs(p);
  const total = ids.reduce((sum, id) => sum + (songById(id).duration || 0), 0);
  $("pl-sub").textContent = ids.length ? `${plural(ids.length, "song")} · ${fmt(total)}` : "No songs yet. Add some below.";
  $("pl-play").hidden = !ids.length;
  if (ids.length) $("pl-play").href = `#/song/${ids[0]}/in/${p.id}`;

  $("pl-songs").replaceChildren(...ids.map((id, i) => {
    const s = songById(id), {title, artist} = tidy(s.title, s.artist);
    const row = el("li", "item");
    const a = link(`#/song/${id}/in/${p.id}`, "");
    a.className = "rowlink";
    a.append(el("b", "", title || "Untitled"), el("span", "who", artist || "YouTube"));
    row.onclick = (e) => { if (!e.target.closest("button, a")) a.click(); };
    const tools = el("span", "tools");
    const tool = (icon, label, disabled, run) => {
      const b = el("button", "ico small");
      b.type = "button";
      b.append(svg(icon));
      b.setAttribute("aria-label", label);
      b.title = label;
      b.disabled = disabled;
      b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); run(); };
      tools.append(b);
    };
    const move = (d) => edit(p.id, (q) => {
      const songs = [...q.songs], a2 = songs.indexOf(id), b2 = songs.indexOf(ids[i + d]);
      [songs[a2], songs[b2]] = [songs[b2], songs[a2]];
      return {...q, songs};
    });
    tool("up", "Move up", i === 0, () => move(-1));
    tool("down", "Move down", i === ids.length - 1, () => move(1));
    tool("x", "Remove from playlist", false, () => edit(p.id, (q) => ({...q, songs: q.songs.filter((x) => x !== id)})));
    row.append(thumb(id), a, tools);
    return row;
  }));

  const rest = library.filter((s) => !p.songs.includes(s.video_id));
  $("pl-add-head").hidden = !rest.length;
  $("pl-add").replaceChildren(...rest.map((s) => {
    const row = el("li", "item");
    const {title, artist} = tidy(s.title, s.artist);
    const text = el("div");
    text.append(el("b", "", title || "Untitled"), el("span", "who", artist || "YouTube"));
    const b = el("button", "act", "Add");
    b.type = "button";
    b.onclick = (e) => { e.stopPropagation(); edit(p.id, (q) => ({...q, songs: [...q.songs, s.video_id]})); };
    row.append(thumb(s.video_id), text, b);
    row.onclick = () => b.click();
    return row;
  }));
}

$("pl-new").addEventListener("submit", async (e) => {
  e.preventDefault();
  const p = await createPlaylist($("pl-new-name").value);
  if (p) { $("pl-new-name").value = ""; location.hash = `#/playlist/${p.id}`; }
});
$("pl-rename-btn").onclick = () => {
  const p = plById(shownPl);
  $("pl-rename-name").value = p.name;
  $("pl-rename").hidden = false;
  $("pl-title").hidden = true;
  $("pl-rename-name").focus();
};
const endRename = () => { $("pl-rename").hidden = true; $("pl-title").hidden = false; };
$("pl-rename").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("pl-rename-name").value.trim();
  if (name && await edit(shownPl, (q) => ({...q, name}))) { endRename(); drawPlaylistPage(); }
});
$("pl-rename-name").addEventListener("keydown", (e) => { if (e.key === "Escape") endRename(); });
$("pl-delete").onclick = async () => {
  const p = plById(shownPl);
  if (p && confirm(`Delete the playlist "${p.name}"? Its songs stay in Your songs.`)
      && await savePlaylists(playlists.filter((q) => q.id !== p.id))) location.hash = "#/playlists";
};

// The open song's place in its playlist: "Warm-up · 2 of 5" with previous / next.
const neighbor = (d) => {
  const p = inList && plById(inList);
  if (!p || !current.sheet) return null;
  const ids = listSongs(p), i = ids.indexOf(current.sheet.video_id);
  return i < 0 ? null : ids[i + d] ?? null;
};

function drawContext() {
  const box = $("pl-context");
  const p = inList && plById(inList);
  const ids = p ? listSongs(p) : [];
  const i = current.sheet ? ids.indexOf(current.sheet.video_id) : -1;
  box.hidden = i < 0;
  if (i < 0) return;
  const step = el("span", "step");
  for (const [d, label] of [[-1, "Previous"], [1, "Next"]]) {
    const id = neighbor(d);
    const a = el(id ? "a" : "span", "pill", label);
    if (id) a.href = `#/song/${id}/in/${p.id}`; else a.setAttribute("aria-disabled", "true");
    step.append(a);
  }
  box.replaceChildren(link(`#/playlist/${p.id}`, p.name), ` · ${i + 1} of ${ids.length}`, step);
}

// Add to playlist: tick the playlists this song is in, or start a new one.
function drawMenu() {
  const id = current.sheet.video_id, menu = $("pl-menu");
  menu.replaceChildren(...playlists.map((p) => {
    const b = el("button", "opt");
    b.type = "button";
    b.setAttribute("role", "menuitemcheckbox");
    const on = p.songs.includes(id);
    b.setAttribute("aria-checked", String(on));
    const box = el("span", "check");
    if (on) box.append(svg("check"));
    b.append(box, p.name);
    b.onclick = () => edit(p.id, (q) => ({...q, songs: on ? q.songs.filter((s) => s !== id) : [...q.songs, id]}));
    return b;
  }));
  if (!playlists.length) menu.append(el("p", "none", "No playlists yet."));
  const form = el("form", "paste");
  const input = el("input");
  input.placeholder = "New playlist";
  input.maxLength = 80;
  input.required = true;
  input.setAttribute("aria-label", "New playlist name");
  const go = el("button", "", "Create");
  go.type = "submit";
  form.append(input, go);
  form.onsubmit = async (e) => { e.preventDefault(); await createPlaylist(input.value, [id]); };
  menu.append(form);
}
const closeMenu = () => { $("pl-menu").hidden = true; $("add-pl").setAttribute("aria-expanded", "false"); };
$("add-pl").onclick = () => {
  if (!$("pl-menu").hidden) return closeMenu();
  drawMenu();
  $("pl-menu").hidden = false;
  $("add-pl").setAttribute("aria-expanded", "true");
  $("pl-menu").querySelector("button, input")?.focus();
};
document.addEventListener("click", (e) => { if (!e.target.closest(".addpl")) closeMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("pl-menu").hidden) { closeMenu(); $("add-pl").focus(); } });

/* ---------- tuner ---------- */

const label = (s) => (s.octave === 4 ? "e" : s.name); // guitarists' shorthand: high e
$("tn-strings").replaceChildren(...STRINGS.map((s) => {
  const x = el("li", "", label(s));
  x.title = `${s.name}${s.octave} · ${s.freq} Hz`;
  return x;
}));
let stopTuning = null;

function showReading(r) {
  const dial = $("tn-dial"), meter = $("tn-meter"), strings = [...$("tn-strings").children];
  const idle = !r, ok = r && Math.abs(r.cents) <= IN_TUNE;
  dial.classList.toggle("idle", idle);
  dial.classList.toggle("ok", !!ok);
  meter.classList.toggle("idle", idle);
  meter.classList.toggle("ok", !!ok);
  strings.forEach((x, i) => {
    const on = r && STRINGS[i] === STRINGS.find((s) => s.freq === r.string.freq);
    x.classList.toggle("on", !!on && !ok);
    x.classList.toggle("ok", !!on && !!ok);
  });
  if (idle) { $("tn-read").textContent = "Listening… play one string."; return; }
  $("tn-note").textContent = label(r.string);
  const off = clamp(r.cents, -50, 50);
  $("tn-needle").style.transform = `translateX(${(off / 50) * (meter.clientWidth / 2 - 6)}px)`;
  const read = $("tn-read");
  read.replaceChildren();
  const c = Math.round(Math.abs(r.cents));
  if (ok) read.append(el("b", "", "In tune"), ` · ${label(r.string)} string`);
  else read.append(el("b", "", `${c} cents ${r.cents < 0 ? "flat" : "sharp"}`), ` · ${r.cents < 0 ? "tighten" : "loosen"} the ${label(r.string)} string`);
}

function stopTuner() {
  if (!stopTuning) return;
  stopTuning();
  stopTuning = null;
  $("tn-start").textContent = "Start tuner";
  $("tn-note").textContent = "–";
  showReading(null);
  $("tn-read").textContent = "Press Start, then play one string at a time.";
}

$("tn-start").onclick = async () => {
  if (stopTuning) return stopTuner();
  setError("");
  try {
    stopTuning = await listen(showReading);
    $("tn-start").textContent = "Stop";
    showReading(null);
  } catch (e) {
    setError(e?.name === "NotAllowedError" ? "Strum needs the microphone to hear your guitar. Allow it for this site in your browser, then press Start again."
      : e?.name === "NotFoundError" ? "No microphone found. Plug one in or check your sound settings."
      : "Could not start the microphone.");
  }
};


/* ---------- chord editing ---------- */

// While editing, the sheet is drawn from a working copy; nothing is saved until Save sends the changed slots.
let editing = null; // {rows, sel: {r, w, i} | null}
const slotChords = (rows, r, w) => (w === null ? rows[r].chords : rows[r].words[w].chords);
const slotKey = (r, w) => `${r}:${w ?? "-"}`;

function changedSlots() {
  const out = new Map(); // key -> names
  if (!editing) return out;
  editing.rows.forEach((row, r) => {
    const orig = current.sheet.rows[r];
    const slots = row.type === "instrumental" ? [null] : row.words.map((_, k) => k);
    for (const w of slots) {
      const now = slotChords(editing.rows, r, w).map((c) => c.name), was = slotChords(current.sheet.rows, r, w).map((c) => c.name);
      if (now.join("|") !== was.join("|") || orig.type !== row.type) out.set(slotKey(r, w), {r, w, names: now});
    }
  });
  return out;
}

function startEditing() {
  editing = {rows: structuredClone(current.sheet.rows), sel: null};
  audio.pause();
  document.body.classList.add("editing-chords");
  $("player").hidden = true;
  $("editbar").hidden = false;
  redrawEditing();
}

function stopEditing() {
  editing = null;
  document.body.classList.remove("editing-chords");
  $("editbar").hidden = true;
  $("player").hidden = false;
  drawRows(current.sheet.rows);
  refresh();
  buildTrack();
  drawLoop();
  activeRow = -2;
  highlight(audio.currentTime);
}

function redrawEditing() {
  drawRows(editing.rows);
  refresh();
  const n = changedSlots().size;
  $("eb-msg").textContent = n ? `${n} ${n === 1 ? "change" : "changes"} not saved yet. Tap a chord or a word to keep going.`
    : "Tap a chord to change it, or a word to add one.";
  $("eb-idle").hidden = !!editing.sel;
  $("eb-edit").hidden = !editing.sel;
}

function selectSlot(r, w, i) {
  editing.sel = {r, w, i};
  redrawEditing();
  const c = slotChords(editing.rows, r, w)[i];
  $("eb-name").value = c ? transpose(c.name, current.shift, scale) : "";
  $("eb-name").removeAttribute("aria-invalid");
  $("eb-remove").hidden = !c;
  // quick picks: the chords already in this song, as shown
  $("eb-chips").replaceChildren(...[...new Set(chordEls.map((x) => x.textContent))].slice(0, 12).map((name) => {
    const b = el("button", "", name);
    b.type = "button";
    b.onclick = () => { $("eb-name").value = name; $("eb-edit").requestSubmit(); };
    return b;
  }));
  $("eb-name").focus();
}

function setSlot(names) {
  const {r, w} = editing.sel;
  const holder = w === null ? editing.rows[r] : editing.rows[r].words[w];
  const old = w === null ? holder.chords : holder.chords;
  const start = w === null ? editing.rows[r].start : holder.start ?? editing.rows[r].start;
  const next = names.map((name, k) => ({name, time: old[k]?.time ?? start}));
  if (w === null) editing.rows[r].chords = next; else editing.rows[r].words[w].chords = next;
  editing.sel = null;
  redrawEditing();
}

$("eb-edit").addEventListener("submit", (e) => {
  e.preventDefault();
  const typed = $("eb-name").value.trim().replace(/^([a-g])/, (m) => m.toUpperCase());
  const {r, w, i} = editing.sel;
  const names = slotChords(editing.rows, r, w).map((c) => c.name);
  if (!typed) { names.splice(i, 1); return setSlot(names); }
  if (!CHORD.test(typed)) { $("eb-name").setAttribute("aria-invalid", "true"); return; }
  names[i] = transpose(typed, -current.shift); // typed as shown (capo, transpose); kept in the song's own key
  setSlot(names);
});
$("eb-remove").onclick = () => {
  const {r, w, i} = editing.sel;
  const names = slotChords(editing.rows, r, w).map((c) => c.name);
  names.splice(i, 1);
  setSlot(names);
};
$("edit-chords").onclick = () => (editing ? null : startEditing());
$("eb-cancel").onclick = stopEditing;
$("eb-save").onclick = async () => {
  const ops = [...changedSlots().values()].map(({r, w, names}) => ({row: r, word: w, names}));
  if (!ops.length) return stopEditing();
  const id = current.sheet.video_id;
  let res = null;
  try {
    res = await fetch(`/api/songs/${id}/chords`, {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ops})});
  } catch { /* reported below */ }
  if (!res?.ok) {
    const body = await res?.json().catch(() => ({}));
    return setError(body?.error || body?.detail || "Could not save your chords.");
  }
  const saved = await res.json();
  sheets.set(id, saved);
  current.sheet = saved;
  stopEditing();
  $("edit-chords").textContent = "Saved";
  setTimeout(() => { $("edit-chords").textContent = "Edit chords"; }, 2000);
};
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !editing) return;
  if (editing.sel) { editing.sel = null; redrawEditing(); } else stopEditing();
});

/* ---------- views ---------- */

const VIEWS = ["login", "job", "song", "songs", "spotify", "playlists", "playlist", "tuner"];
let view = "songs";

function show(v) {
  view = v;
  for (const name of VIEWS) $(`view-${name}`).hidden = name !== v;
  $("player").hidden = v !== "song" || !current.sheet;
  document.body.classList.toggle("playing-view", !$("player").hidden);
  if (v !== "song") { audio.pause(); closeMenu(); if (editing) stopEditing(); } // the player lives on the song page
  if (v !== "tuner") stopTuner(); // the microphone is only on while the tuner page is open
  else settle();
  const fromList = v === "song" && inList;
  for (const [id, on] of [["nav-songs", v === "songs" || (v === "song" && !fromList)], ["nav-playlists", v === "playlists" || v === "playlist" || fromList],
    ["nav-spotify", v === "spotify"], ["nav-tuner", v === "tuner"]]) {
    if (on) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
  }
  markCurrent();
}

function markCurrent() {
  const id = view === "song" && !inList ? current.sheet?.video_id : null;
  const pl = view === "playlist" ? shownPl : view === "song" ? inList : null;
  for (const a of document.querySelectorAll("#side-songs a.song, #side-playlists a.song")) {
    if ((a.dataset.id && a.dataset.id === id) || (a.dataset.pl && a.dataset.pl === pl)) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

let keepError = false; // an error that sent us home must survive the hash change it caused

async function route() {
  if (keepError) keepError = false; else setError("");
  if (locked) return show("login");
  const [, name, id, , listId] = location.hash.split("/");
  if (name === "spotify") return show("spotify");
  if (name === "tuner") return show("tuner");
  if (name === "playlists") return show("playlists");
  if (name === "playlist" && plById(id)) { shownPl = id; endRename(); show("playlist"); return drawPlaylistPage(); }
  if (name === "job") return job ? show("job") : (location.hash = "#/");
  if (name === "song" && VID.test(id || "")) return openSong(id, listId);
  show("songs");
}

async function openSong(id, listId = null) {
  inList = plById(listId) ? listId : null;
  if (current.sheet?.video_id !== id) {
    let sheet = sheets.get(id);
    if (!sheet) {
      try {
        const r = await fetch(`/data/${id}/sheet.json`);
        if (r.status === 401) { locked = true; document.body.classList.add("locked"); return show("login"); }
        if (!r.ok) throw new Error(r.status);
        sheet = await r.json();
        sheets.set(id, sheet);
      } catch {
        location.hash = "#/";
        return setError("Could not open that song. It may have been deleted from data/.");
      }
    }
    renderSheet(sheet);
  }
  if (fresh.delete(id)) { saveFresh(); drawLibrary(); }
  show("song");
  drawContext();
  if (autoplay) { autoplay = false; audio.play().catch(() => {}); }
}

/* ---------- chords, capo, transpose ---------- */

// The only place chord text is drawn.
export function drawChord(span) {
  span.textContent = transpose(span.dataset.name, current.shift, scale); // re-spells at shift 0 too
}

const names = () => chordEls.map((c) => c.dataset.name);
const ctl = {capo: 0, transpose: 0};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function drawInfo() {
  const panel = $("panel-chords");
  panel.replaceChildren();
  if (!current.sheet) return;
  for (const n of new Set(chordEls.map((c) => c.textContent))) {
    const fig = el("figure", "shape");
    fig.append(el("figcaption", "", n));
    const pos = db && findFingering(db, n);
    if (pos) {
      const box = el("div");
      box.innerHTML = diagramSvg(pos, n); // numbers and the XML-escaped name only
      fig.append(box);
    } else fig.append(el("div", "none", db ? "no diagram" : ""));
    panel.append(fig);
  }
}

function refresh() {
  current.shift = ctl.transpose - ctl.capo;
  scale = spelling(names().map((n) => transpose(n, current.shift)));
  chordEls.forEach(drawChord);
  $("capo").textContent = ctl.capo;
  $("transpose").textContent = ctl.transpose > 0 ? `+${ctl.transpose}` : ctl.transpose;
  $("reset").hidden = !ctl.capo && !ctl.transpose;
  drawInfo();
  settle();
}

// Chord pills hang over the words after them (width-0 slot), so a long chord never splits a word.
// Only where two pills would touch is the later word pushed right. Needs layout, so it runs while visible.
function settle() {
  if (view !== "song") return;
  for (const row of rowEls) {
    if (row.classList.contains("inst") || row.classList.contains("bare")) continue;
    const words = [...row.children];
    for (const w of words) w.style.marginLeft = "";
    let lastRight = -Infinity, lastTop = null;
    for (const w of words) {
      const pills = w.firstElementChild;
      if (!pills?.childElementCount) continue;
      const first = pills.firstElementChild, last = pills.lastElementChild;
      let box = first.getBoundingClientRect();
      if (lastTop !== null && Math.abs(box.top - lastTop) > 4) lastRight = -Infinity; // wrapped to a new line
      if (box.left < lastRight + 4) {
        w.style.marginLeft = `${lastRight + 4 - box.left}px`;
        box = first.getBoundingClientRect();
      }
      lastTop = box.top;
      lastRight = last.getBoundingClientRect().right;
    }
  }
}
let settleTimer = 0;
window.addEventListener("resize", () => { clearTimeout(settleTimer); settleTimer = setTimeout(settle, 120); });
document.fonts?.ready.then(() => settle());

const bump = (key, d, lo, hi) => () => { ctl[key] = clamp(ctl[key] + d, lo, hi); refresh(); };
$("capo-down").onclick = bump("capo", -1, 0, 7);
$("capo-up").onclick = bump("capo", 1, 0, 7);
$("tr-down").onclick = bump("transpose", -1, -6, 6);
$("tr-up").onclick = bump("transpose", 1, -6, 6);
$("reset").onclick = () => { ctl.capo = ctl.transpose = 0; refresh(); };
$("suggest").onclick = () => {
  ctl.capo = suggestCapo(names().map((n) => transpose(n, ctl.transpose)));
  refresh();
};

for (const [tab, panel] of [["tab-chords", "panel-chords"], ["tab-strum", "panel-strum"]]) {
  $(tab).onclick = () => {
    for (const t of ["tab-chords", "tab-strum"]) $(t).setAttribute("aria-selected", String(t === tab));
    $("panel-chords").hidden = panel !== "panel-chords";
    $("panel-strum").hidden = panel !== "panel-strum";
  };
}

/* ---------- sheet ---------- */

function chordEl(c) {
  const s = el("span", "chord");
  s.dataset.name = c.name;
  s.dataset.time = c.time;
  drawChord(s);
  chordEls.push(s);
  return s;
}

export function renderSheet(sheet) {
  current.sheet = sheet;
  current.shift = 0;
  rowEls = []; chordEls = []; activeRow = -2; activeChord = null; loop = null; // -2: first highlight always marks rows
  $("view-song").lang = sheet.language || "en";
  const shown = tidy(sheet.title, sheet.artist);
  $("title").textContent = shown.title || "Untitled";
  document.title = `${shown.title} · Strum`;

  const by = $("by");
  by.replaceChildren();
  if (shown.artist) by.append(`${shown.artist} · `);
  if (sheet.bpm) by.append(`${sheet.bpm} BPM · `);
  const src = link(sheet.url, "YouTube");
  src.title = sheet.url; // the matched video: a wrong match is one click away
  by.append("from ", src);
  $("save-txt").href = `/data/${sheet.video_id}/sheet.txt`;
  $("save-html").href = `/data/${sheet.video_id}/sheet.html`;

  const strum = $("panel-strum");
  strum.replaceChildren(el("b", "", sheet.strum || ""),
    el("span", "", `Suggested pattern for ${sheet.bpm} BPM in ${sheet.beats_per_bar || 4}/4. A starting point, not detected from the recording.`));

  drawRows(sheet.rows);

  ctl.capo = ctl.transpose = 0;
  refresh();
  audio.src = `/data/${sheet.video_id}/audio.mp3`;
  $("play").classList.remove("on");
  buildTrack();
  drawLoop();
  highlight(0);
  $("main").scrollTop = 0;
}

// The lyric and chord rows. While editing, every chord and word is a target.
function drawRows(data) {
  rowEls = []; chordEls = []; activeChord = null;
  const box = $("sheet");
  box.replaceChildren();
  const changed = changedSlots();
  const chordFor = (c, r, w, i) => {
    const s = chordEl(c);
    if (editing) {
      s.tabIndex = 0;
      s.setAttribute("role", "button");
      s.classList.toggle("changed", changed.has(slotKey(r, w)));
      s.classList.toggle("sel", editing.sel?.r === r && editing.sel?.w === w && editing.sel?.i === i);
      s.onclick = (e) => { e.stopPropagation(); selectSlot(r, w, i); };
      s.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); selectSlot(r, w, i); } };
    }
    return s;
  };
  const lyricIdx = data.flatMap((r, i) => (r.type === "instrumental" ? [] : [i]));
  const first = lyricIdx[0] ?? Infinity, last = lyricIdx.at(-1) ?? -1;
  let lastLabel = "";
  data.forEach((row, i) => {
    const div = el("div", "row");
    if (row.type === "instrumental") {
      const label = i < first ? "Intro" : i > last ? "Outro" : row.chords.length >= 3 ? "Instrumental" : "";
      if (label && label !== lastLabel) box.append(el("p", "label", label));
      lastLabel = label;
      div.classList.add("inst");
      row.chords.forEach((c, k) => div.append(chordFor(c, i, null, k)));
      if (editing) {
        const add = el("button", "chord add", "+");
        add.type = "button";
        add.setAttribute("aria-label", "Add a chord to this row");
        add.onclick = (e) => { e.stopPropagation(); selectSlot(i, null, row.chords.length); };
        div.append(add);
      }
    } else {
      lastLabel = "";
      if (!row.words.some((w) => w.chords.length)) div.classList.add("bare");
      row.words.forEach((w, k) => {
        const next = row.words[k + 1];
        const span = el("span", "w");
        const top = el("span", "c");
        w.chords.forEach((c, n) => top.append(chordFor(c, i, k, n)));
        if (editing) span.onclick = () => selectSlot(i, k, w.chords.length); // tap a word: add a chord there
        span.append(top, w.text);
        if (next && CJK.test(w.text.slice(-1)) && CJK.test(next.text[0])) span.classList.add("join");
        div.append(span);
      });
    }
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.addEventListener("click", (e) => rowAction(i, e.shiftKey));
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); rowAction(i, e.shiftKey); } // Space stays play/pause
    });
    rowEls.push(div);
    box.append(div);
  });
}

/* ---------- player, song map, loop ---------- */

const rows = () => current.sheet?.rows ?? [];
const duration = () => (Number.isFinite(audio.duration) && audio.duration) || current.sheet?.duration || 1;
const rowStart = (i) => rows()[i]?.start ?? 0;
const rowEnd = (i) => (i + 1 < rows().length ? rowStart(i + 1) : duration());
const rowAt = (t) => { let r = -1; rows().forEach((row, i) => { if (row.start <= t) r = i; }); return r; };

function buildTrack() {
  const track = $("track");
  const bounds = [0, ...rows().map((r) => r.start), duration()];
  segEls = [];
  track.replaceChildren(...bounds.slice(0, -1).map((b, k) => {
    const seg = el("i");
    seg.style.flex = Math.max(bounds[k + 1] - b, 0.01);
    seg.dataset.row = k - 1; // the first segment is the lead-in before row 0
    segEls.push(seg);
    return seg;
  }));
  $("t-end").textContent = fmt(duration());
  track.setAttribute("aria-valuemax", Math.round(duration()));
}

function drawLoop() {
  const inLoop = (i) => loop && i >= loop.from && i <= loop.to;
  rowEls.forEach((r, i) => r.classList.toggle("loop", inLoop(i)));
  segEls.forEach((s) => s.classList.toggle("loop", inLoop(Number(s.dataset.row))));
  const b = $("loop");
  b.setAttribute("aria-pressed", String(!!loop));
  const n = loop ? loop.to - loop.from + 1 : 0;
  b.setAttribute("aria-label", loop ? `Looping ${n} ${n === 1 ? "line" : "lines"}. Click to stop.` : "Loop the current line");
}

function setLoop(from, to) {
  loop = {from: Math.min(from, to), to: Math.max(from, to)};
  drawLoop();
  if (audio.currentTime < rowStart(loop.from) || audio.currentTime >= rowEnd(loop.to)) audio.currentTime = rowStart(loop.from);
}

function rowAction(i, extend) {
  if (editing) return; // taps edit chords instead
  if (extend) return setLoop(loop ? loop.from : Math.max(activeRow, 0), i);
  audio.currentTime = rowStart(i);
  highlight(audio.currentTime);
}

$("loop").onclick = () => {
  if (loop) { loop = null; drawLoop(); } else setLoop(Math.max(activeRow, 0), Math.max(activeRow, 0));
};

$("play").onclick = () => (audio.paused ? audio.play() : audio.pause());
let ticking = false;
audio.addEventListener("play", () => {
  $("play").classList.add("on");
  $("play").setAttribute("aria-label", "Pause");
  if (!ticking) { ticking = true; tick(); }
});
// 2. a loop that runs to the end of the song starts over instead of stopping
audio.addEventListener("ended", () => {
  if (loop) { audio.currentTime = rowStart(loop.from); audio.play(); return; }
  const next = neighbor(1); // a playlist moves on to its next song
  if (next) { autoplay = true; location.hash = `#/song/${next}/in/${inList}`; }
});
// 6. hosted audio is a signed link that expires: on an error, fetch a fresh one once and resume
let audioRetry = 0;
audio.addEventListener("error", () => {
  if (!current.sheet || Date.now() - audioRetry < 30000) return;
  audioRetry = Date.now();
  const t = audio.currentTime, playing = !audio.paused || $("play").classList.contains("on");
  audio.src = `/data/${current.sheet.video_id}/audio.mp3?fresh=${audioRetry}`;
  audio.currentTime = t;
  if (playing) audio.play().catch(() => {});
});
audio.addEventListener("pause", () => { $("play").classList.remove("on"); $("play").setAttribute("aria-label", "Play"); });
audio.addEventListener("loadedmetadata", buildTrack);
audio.addEventListener("seeked", () => highlight(audio.currentTime));

function tick() {
  if (loop && audio.currentTime >= rowEnd(loop.to) - 0.04) audio.currentTime = rowStart(loop.from);
  highlight(audio.currentTime);
  if (audio.paused) ticking = false; else requestAnimationFrame(tick);
}

function highlight(t) {
  $("t-now").textContent = fmt(t);
  const track = $("track");
  track.setAttribute("aria-valuenow", Math.round(t));
  track.setAttribute("aria-valuetext", `${fmt(t)} of ${fmt(duration())}`);
  const r = rowAt(t);
  segEls.forEach((s) => s.classList.toggle("done", Number(s.dataset.row) <= r && !(r === -1 && t === 0)));
  if (r !== activeRow) {
    rowEls[activeRow]?.classList.remove("now");
    rowEls.find((e) => e.classList.contains("next"))?.classList.remove("next");
    activeRow = r;
    rowEls[r]?.classList.add("now");
    // the next sung line is what you read ahead to, even across intro and solo rows
    rowEls[rows().findIndex((x, i) => i > r && x.type !== "instrumental")]?.classList.add("next");
    if (!audio.paused && view === "song") rowEls[r]?.scrollIntoView({block: "center", behavior: "smooth"});
  }
  let chord = null;
  for (const c of chordEls) if (Number(c.dataset.time) <= t) chord = c; // chordEls is in time order
  if (chord !== activeChord) {
    activeChord?.classList.remove("now");
    chord?.classList.add("now");
    activeChord = chord;
  }
}

// The progress bar doubles as the song map: click to seek, drag across lines to loop them.
{
  const track = $("track");
  const timeAt = (x) => { const b = track.getBoundingClientRect(); return clamp((x - b.left) / b.width, 0, 1) * duration(); };
  let down = null;
  track.addEventListener("pointerdown", (e) => { down = {x: e.clientX, row: Math.max(rowAt(timeAt(e.clientX)), 0), drag: false}; track.setPointerCapture(e.pointerId); });
  track.addEventListener("pointermove", (e) => {
    if (!down) return;
    if (Math.abs(e.clientX - down.x) > 4) down.drag = true;
    if (down.drag) { loop = {from: Math.min(down.row, Math.max(rowAt(timeAt(e.clientX)), 0)), to: Math.max(down.row, Math.max(rowAt(timeAt(e.clientX)), 0))}; drawLoop(); }
  });
  track.addEventListener("pointerup", (e) => {
    if (!down) return;
    if (down.drag && loop) setLoop(loop.from, loop.to);
    else { audio.currentTime = timeAt(e.clientX); highlight(audio.currentTime); }
    down = null;
  });
  track.addEventListener("keydown", (e) => {
    const d = {ArrowLeft: -5, ArrowRight: 5}[e.key];
    if (d) { e.preventDefault(); audio.currentTime = clamp(audio.currentTime + d, 0, duration()); }
  });
}

// Hands are on the guitar: Space plays or pauses, L loops, from anywhere that is not a control.
document.addEventListener("keydown", (e) => {
  if (!current.sheet || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest("input, textarea, button, a, [role=slider], [role=tab]")) return; // lyric rows don't block them
  if (e.key === " ") { e.preventDefault(); $("play").click(); }
  if (e.key === "l" || e.key === "L") $("loop").click();
});

/* ---------- making a sheet ---------- */

let job = null; // {title, by, step, steps, name}
export const isBusy = () => !!job;

function setBusy(on) {
  $("go").querySelector("button").disabled = on;
  $("go").querySelector("button").title = on ? "One song at a time" : "";
  window.dispatchEvent(new Event("busy"));
}

function drawJob() {
  if (!job) return;
  $("job-title").textContent = job.title;
  const disc = $("job-art");
  if (job.art && disc.dataset.src !== job.art) { disc.dataset.src = job.art; disc.style.backgroundImage = `url("${job.art}")`; }
  disc.classList.toggle("has-art", !!job.art);
  $("job-by").textContent = job.by;
  $("job-steps").replaceChildren(...Array.from({length: job.steps}, (_, i) =>
    el("li", i < job.step ? "done" : i === job.step ? "now" : "")));
  $("job-step").textContent = `${job.name}… step ${job.step + 1} of ${job.steps}. A new song takes about a minute; you can browse while it works.`;
  drawLibrary();
}

export async function startSong(body, label = {}) {
  if (!canMake) return setError("New songs are made by the app on your Mac; they show up here after it syncs.");
  if (job) return setError("One song at a time: wait for the current one to finish.");
  job = {title: label.title || "Making your sheet", by: label.by || "", art: /^https:\/\/[\w.-]+\.scdn\.co\/[^"'()\\\s]*$/.test(label.art || "") ? label.art : "",
    step: 0, steps: 5, name: "Starting"};
  setBusy(true);
  location.hash = "#/job";
  drawJob();
  try { await run(body); } finally {
    job = null;
    setBusy(false);
    drawLibrary();
    if (location.hash === "#/job") { keepError = true; location.hash = "#/"; }
  }
}

async function run(body) {
  let res;
  try {
    res = await fetch("/api/songs", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  } catch {
    return setError("Could not reach the server. Is it still running?");
  }
  if (!res.ok) {
    if (res.status === 409) return setError("Another song is still processing. Try again when it finishes.");
    if (res.status === 422) return setError("That does not look like a YouTube link.");
    return setError("Something went wrong starting that song.");
  }
  const me = ++pollId; // only now: a refused request must not cancel the running job's poll
  const {id} = await res.json();
  while (me === pollId) {
    let st;
    try {
      const r = await fetch(`/api/songs/${id}`);
      if (!r.ok) throw new Error(r.status);
      st = await r.json();
    } catch {
      return setError("Lost contact with the server while making the sheet.");
    }
    if (me !== pollId) return;
    if (st.status === "done") {
      const sheet = st.sheet;
      sheets.set(sheet.video_id, sheet);
      const watching = location.hash === "#/job";
      if (!watching) { fresh.add(sheet.video_id); saveFresh(); }
      job = null; // so the library redraw drops the in-progress row
      await loadLibrary();
      if (watching) location.hash = `#/song/${sheet.video_id}`;
      return;
    }
    if (st.status === "error") return setError(st.error || "Processing failed.");
    Object.assign(job, {step: st.step, steps: st.steps, name: st.step_name});
    drawJob();
    await new Promise((r) => setTimeout(r, 1000));
  }
}

$("go").addEventListener("submit", (e) => {
  e.preventDefault();
  const url = $("url").value.trim();
  $("url").value = "";
  startSong({url}, {title: "Making your sheet", by: url});
});

$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("");
  let r;
  try {
    r = await fetch("/api/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({passcode: $("passcode").value})});
  } catch {
    return setError("Could not reach the server.");
  }
  if (!r.ok) return setError((await r.json().catch(() => ({}))).error || "Could not log in.");
  $("passcode").value = "";
  await loadLibrary();
  await loadPlaylists();
  route();
  queueSince = Date.now();
  loadQueue();
});

window.addEventListener("hashchange", route);
loadLibrary().then(async () => { queueSince = Date.now(); await config; if (!locked) await loadPlaylists(); route(); loadQueue(); });
