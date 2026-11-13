import {SHARP, transpose, spelling, suggestCapo, findFingering, diagramSvg} from "/static/chords.js";
import {tidy} from "/static/tidy.js";

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

/* ---------- library ---------- */

export let library = [];
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

function songLink(s, cls) {
  const a = el("a", cls);
  a.href = `#/song/${s.video_id}`;
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
  markCurrent();
}

async function loadLibrary() {
  try {
    const r = await fetch("/api/library");
    if (r.ok) library = await r.json();
  } catch { /* keep the last list */ }
  drawLibrary();
  window.dispatchEvent(new Event("library"));
}

/* ---------- views ---------- */

const VIEWS = ["job", "song", "songs", "spotify"];
let view = "songs";

function show(v) {
  view = v;
  for (const name of VIEWS) $(`view-${name}`).hidden = name !== v;
  $("player").hidden = v !== "song" || !current.sheet;
  document.body.classList.toggle("playing-view", !$("player").hidden);
  if (v !== "song") audio.pause(); // the player lives on the song page
  else settle();
  for (const [id, on] of [["nav-songs", v === "songs" || v === "song"], ["nav-spotify", v === "spotify"]]) {
    if (on) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
  }
  markCurrent();
}

function markCurrent() {
  const id = view === "song" ? current.sheet?.video_id : null;
  for (const a of $("side-songs").querySelectorAll("a.song")) {
    if (a.dataset.id && a.dataset.id === id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

let keepError = false; // an error that sent us home must survive the hash change it caused

async function route() {
  if (keepError) keepError = false; else setError("");
  const [, name, id] = location.hash.split("/");
  if (name === "spotify") return show("spotify");
  if (name === "job") return job ? show("job") : (location.hash = "#/");
  if (name === "song" && VID.test(id || "")) return openSong(id);
  show("songs");
}

async function openSong(id) {
  if (current.sheet?.video_id !== id) {
    let sheet = sheets.get(id);
    if (!sheet) {
      try {
        const r = await fetch(`/data/${id}/sheet.json`);
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

  const box = $("sheet");
  box.replaceChildren();
  const lyricIdx = sheet.rows.flatMap((r, i) => (r.type === "instrumental" ? [] : [i]));
  const first = lyricIdx[0] ?? Infinity, last = lyricIdx.at(-1) ?? -1;
  let lastLabel = "";
  sheet.rows.forEach((row, i) => {
    const div = el("div", "row");
    if (row.type === "instrumental") {
      const label = i < first ? "Intro" : i > last ? "Outro" : row.chords.length >= 3 ? "Instrumental" : "";
      if (label && label !== lastLabel) box.append(el("p", "label", label));
      lastLabel = label;
      div.classList.add("inst");
      row.chords.forEach((c) => div.append(chordEl(c)));
    } else {
      lastLabel = "";
      if (!row.words.some((w) => w.chords.length)) div.classList.add("bare");
      row.words.forEach((w, k) => {
        const next = row.words[k + 1];
        const span = el("span", "w");
        const top = el("span", "c");
        w.chords.forEach((c) => top.append(chordEl(c)));
        span.append(top, w.text);
        if (next && CJK.test(w.text.slice(-1)) && CJK.test(next.text[0])) span.classList.add("join");
        div.append(span);
      });
    }
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.addEventListener("click", (e) => rowAction(i, e.shiftKey));
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); rowAction(i, e.shiftKey); }
    });
    rowEls.push(div);
    box.append(div);
  });

  ctl.capo = ctl.transpose = 0;
  refresh();
  audio.src = `/data/${sheet.video_id}/audio.mp3`;
  $("play").classList.remove("on");
  buildTrack();
  drawLoop();
  highlight(0);
  $("main").scrollTop = 0;
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
  if (extend) return setLoop(loop ? loop.from : Math.max(activeRow, 0), i);
  audio.currentTime = rowStart(i);
  highlight(audio.currentTime);
}

$("loop").onclick = () => {
  if (loop) { loop = null; drawLoop(); } else setLoop(Math.max(activeRow, 0), Math.max(activeRow, 0));
};

$("play").onclick = () => (audio.paused ? audio.play() : audio.pause());
audio.addEventListener("play", () => { $("play").classList.add("on"); $("play").setAttribute("aria-label", "Pause"); tick(); });
audio.addEventListener("pause", () => { $("play").classList.remove("on"); $("play").setAttribute("aria-label", "Play"); });
audio.addEventListener("loadedmetadata", buildTrack);
audio.addEventListener("seeked", () => highlight(audio.currentTime));

function tick() {
  if (loop && audio.currentTime >= rowEnd(loop.to) - 0.04) audio.currentTime = rowStart(loop.from);
  highlight(audio.currentTime);
  if (!audio.paused) requestAnimationFrame(tick);
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
  if (e.target.closest("input, textarea, button, a, [role=button], [role=slider], [role=tab]")) return;
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

window.addEventListener("hashchange", route);
loadLibrary().then(route);
