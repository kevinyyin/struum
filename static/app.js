import {SHARP, transpose, spelling, suggestCapo, findFingering, diagramSvg} from "/static/chords.js";

export const current = {sheet: null, shift: 0};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const CJK = /[぀-ヿ㐀-鿿가-힯]/;
let audio = null;
let rowEls = [];
let chordEls = [];
let activeRow = null;
let activeChord = null;
let pollId = 0; // a newer startSong cancels an older poll loop

let scale = SHARP; // spelling follows the displayed key; set in refresh
let db = null;
fetch("/static/guitar.json").then((r) => r.json()).then((j) => { db = j; drawInfo(); }).catch(() => {});

// The only place chord text is drawn.
export function drawChord(span) {
  span.textContent = transpose(span.dataset.name, current.shift, scale); // re-spells at shift 0 too
}

const names = () => chordEls.map((c) => c.dataset.name);

function drawInfo() {
  const info = $("info");
  info.replaceChildren();
  if (!current.sheet) return;
  const {bpm, strum} = current.sheet;
  const strumEl = el("code", "", strum);
  const lab = el("p", "", `Tempo: ${bpm} BPM. `);
  lab.append(el("span", "", "Suggested strum: "), strumEl);
  const row = el("div", "diagrams");
  for (const n of new Set(chordEls.map((c) => c.textContent))) {
    const fig = el("figure");
    const pos = db && findFingering(db, n);
    if (pos) {
      const box = el("div");
      box.innerHTML = diagramSvg(pos, n); // numbers and the XML-escaped name only
      fig.append(box);
    }
    fig.append(el("figcaption", "", n));
    row.append(fig);
  }
  info.append(lab, row);
}

// Whole semitones within -6..6. Not written back on input: typing "-" reads as empty.
const transposeValue = () => Math.max(-6, Math.min(6, Math.round(Number($("transpose").value) || 0)));

function refresh() {
  current.shift = transposeValue() - Number($("capo").value);
  scale = spelling(names().map((n) => transpose(n, current.shift)));
  chordEls.forEach(drawChord);
  drawInfo();
}

function resetControls() {
  $("transpose").value = 0;
  $("capo").value = 0;
  $("controls").hidden = false;
  refresh();
}

$("transpose").addEventListener("input", refresh);
$("transpose").addEventListener("change", () => { $("transpose").value = transposeValue(); });
$("capo").addEventListener("input", refresh);
$("reset").addEventListener("click", resetControls);
$("suggest").addEventListener("click", () => {
  const t = transposeValue();
  $("capo").value = suggestCapo(names().map((n) => transpose(n, t)));
  refresh();
});

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
  const head = $("head"), box = $("sheet");
  head.replaceChildren();
  box.replaceChildren();
  box.lang = sheet.language;
  rowEls = []; chordEls = []; activeRow = activeChord = null;
  current.shift = 0;

  head.append(el("h2", "", sheet.title), el("p", "", sheet.artist));
  const links = el("p");
  const link = (href, text) => {
    const a = el("a", "", text);
    a.href = href;
    return a;
  };
  links.append("Source: ", link(sheet.url, sheet.url), " | ",
    link(`/data/${sheet.video_id}/sheet.txt`, "Download .txt"), " | ",
    link(`/data/${sheet.video_id}/sheet.html`, "Download .html"));
  audio = el("audio");
  audio.controls = true;
  audio.src = `/data/${sheet.video_id}/audio.mp3`;
  audio.addEventListener("timeupdate", () => highlight(audio.currentTime));
  head.append(links, audio);

  for (const row of sheet.rows) {
    const div = el("div", "row");
    div.dataset.start = row.start;
    div.dataset.end = row.end;
    if (row.type === "instrumental") {
      row.chords.forEach((c) => div.append(chordEl(c)));
    } else {
      row.words.forEach((w, i) => {
        const next = row.words[i + 1];
        const span = el("span", "w");
        w.chords.forEach((c) => span.append(chordEl(c)));
        span.append(w.text);
        if (next && CJK.test(w.text.slice(-1)) && CJK.test(next.text[0])) span.classList.add("join");
        div.append(span);
      });
    }
    const seek = () => { audio.currentTime = Number(div.dataset.start); };
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.addEventListener("click", seek);
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); seek(); }
    });
    rowEls.push(div);
    box.append(div);
  }
  resetControls();
}

function highlight(t) {
  // Last row started so far: stays lit through gaps between lines.
  let row = null;
  for (const r of rowEls) if (Number(r.dataset.start) <= t) row = r;
  if (row !== activeRow) {
    activeRow?.classList.remove("now");
    row?.classList.add("now");
    row?.scrollIntoView({block: "center", behavior: "smooth"});
    activeRow = row;
  }
  let chord = null;
  for (const c of chordEls) if (Number(c.dataset.time) <= t) chord = c; // chordEls is in time order
  if (chord !== activeChord) {
    activeChord?.classList.remove("now");
    chord?.classList.add("now");
    activeChord = chord;
  }
}

const setStatus = (s) => { $("status").textContent = s; };
const setError = (s) => { $("error").textContent = s; };

export async function startSong(body) {
  $("go").querySelector("button").disabled = true; // a second submit would 409 and cancel this poll
  try { await run(body); } finally { $("go").querySelector("button").disabled = false; }
}

async function run(body) {
  setError("");
  setStatus("Starting...");
  let res;
  try {
    res = await fetch("/api/songs", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
  } catch {
    setStatus("");
    return setError("Could not reach the server.");
  }
  if (!res.ok) {
    setStatus("");
    if (res.status === 409) return setError("Another song is still processing.");
    if (res.status === 422) return setError("That does not look like a valid link.");
    return setError("Something went wrong.");
  }
  const me = ++pollId; // only now: a refused request must not cancel the running job's poll
  const {id} = await res.json();
  while (me === pollId) {
    let job;
    try {
      const r = await fetch(`/api/songs/${id}`);
      if (!r.ok) throw new Error(r.status);
      job = await r.json();
    } catch {
      setStatus("");
      return setError("Lost contact with the server.");
    }
    if (me !== pollId) return;
    if (job.status === "done") {
      setStatus("");
      return renderSheet(job.sheet);
    }
    if (job.status === "error") {
      setStatus("");
      return setError(job.error || "Processing failed.");
    }
    setStatus(`${job.step_name} (${job.step + 1} of ${job.steps})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

$("go").addEventListener("submit", (e) => {
  e.preventDefault();
  startSong({url: $("url").value.trim()});
});
