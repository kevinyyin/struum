import {startSong, findSong, isBusy} from "/static/app.js";

const REDIRECT = location.origin + "/"; // must match a redirect URI registered on the Spotify app
const SCOPE = "user-read-recently-played user-top-read user-library-read";
const LISTS = [
  ["Recently played", "/v1/me/player/recently-played?limit=50"],
  ["Top tracks", "/v1/me/top/tracks?limit=50"],
  ["Liked", "/v1/me/tracks?limit=50"],
];
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; // Spotify text is untrusted: textContent only
  return e;
};

// sessionStorage can throw (blocked storage), so every access is guarded.
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};

const rand = () => {
  const a = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const sha256b64url = async (s) => {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return btoa(String.fromCharCode(...h)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const msg = (s) => { $("sp-msg").textContent = s; };
let clientId = "";
let tabs = []; // [{name, tracks}]
let tabIndex = 0;

async function login() {
  const verifier = rand(), state = rand();
  store.set("sp_verifier", verifier);
  store.set("sp_state", state);
  location.href = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: REDIRECT, scope: SCOPE,
    state, code_challenge_method: "S256", code_challenge: await sha256b64url(verifier),
  });
}

function showLogin(note = "") {
  tabs = [];
  msg(note);
  $("sp-login").hidden = false;
  $("sp-tabs").hidden = true;
  $("sp-list").replaceChildren();
  $("sp-quick").replaceChildren();
  $("sp-all").hidden = true;
  const side = $("sp-side-msg");
  side.replaceChildren(el("span", "", note ? `${note} ` : "See your Spotify songs here. "));
  const b = el("button", "", "Log in with Spotify");
  b.type = "button";
  b.onclick = login;
  side.append(el("br"), b);
}
$("sp-login").onclick = login;

async function exchange(code) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: REDIRECT,
      client_id: clientId, code_verifier: store.get("sp_verifier") || "",
    }),
  });
  if (!res.ok) throw new Error(res.status);
  store.set("sp_token", (await res.json()).access_token);
}

const artOf = (t) => {
  const imgs = t.album?.images ?? []; // largest first
  return (imgs.filter((i) => (i.width ?? 64) >= 64).at(-1) ?? imgs.at(-1))?.url ?? "";
};

function art(t) {
  const img = el("img", "art");
  img.alt = "";
  img.loading = "lazy";
  const src = artOf(t);
  if (src.startsWith("https://")) img.src = src;
  return img;
}

function pick(t) {
  const artist = t.artists?.[0]?.name ?? "";
  const made = findSong(t.name, artist);
  if (made) { location.hash = `#/song/${made}`; return; }
  startSong({artist, title: t.name, duration: t.duration_ms / 1000}, {title: t.name, by: artist, art: artOf(t)});
}

function text(t) {
  const d = el("div");
  d.append(el("b", "", t.name), el("span", "who", (t.artists ?? []).map((a) => a.name).join(", ")));
  return d;
}

function action(t) {
  const made = findSong(t.name, t.artists?.[0]?.name ?? "");
  const b = el("button", made ? "act open" : "act", made ? "Open sheet" : "Make sheet");
  b.type = "button";
  b.disabled = !made && isBusy();
  if (b.disabled) b.title = "One song at a time";
  b.onclick = (e) => { e.stopPropagation(); pick(t); };
  return b;
}

function drawList() {
  const list = $("sp-list");
  list.replaceChildren(...(tabs[tabIndex]?.tracks ?? []).map((t) => {
    const li = el("li", "item");
    const b = action(t);
    li.append(art(t), text(t), b);
    li.onclick = () => { if (!b.disabled) pick(t); };
    return li;
  }));
  if (tabs[tabIndex] && !tabs[tabIndex].tracks.length) list.append(el("li", "empty", `Nothing in ${tabs[tabIndex].name} yet.`));
  [...$("sp-tabs").children].forEach((b, i) => b.setAttribute("aria-selected", String(i === tabIndex)));
}

function drawQuick() {
  const recent = tabs.find((t) => t.name === "Recently played") ?? tabs[0];
  $("sp-quick").replaceChildren(...(recent?.tracks ?? []).slice(0, 3).map((t) => {
    const li = el("li");
    const b = el("button", "song");
    b.type = "button";
    b.append(art(t), text(t));
    b.title = findSong(t.name, t.artists?.[0]?.name ?? "") ? "Open sheet" : "Make sheet";
    b.onclick = () => { if (findSong(t.name, t.artists?.[0]?.name ?? "") || !isBusy()) pick(t); };
    li.append(b);
    return li;
  }));
  $("sp-side-msg").replaceChildren();
  $("sp-all").hidden = !recent;
}

const dedupe = (tracks) => { const seen = new Set(); return tracks.filter((t) => !seen.has(t.id) && seen.add(t.id)); };

async function showLists() {
  const token = store.get("sp_token");
  msg("Loading your songs…");
  $("sp-side-msg").textContent = "Loading your Spotify songs…";
  let results;
  try {
    results = await Promise.all(LISTS.map(async ([name, path]) => {
      const r = await fetch("https://api.spotify.com" + path, {headers: {Authorization: `Bearer ${token}`}});
      if (r.status === 401) throw "expired";
      if (r.status === 403) return null; // e.g. liked songs refused: drop that tab
      if (!r.ok) throw new Error(r.status);
      const {items} = await r.json();
      return {name, tracks: dedupe(items.map((i) => i.track ?? i).filter((t) => t?.name))};
    }));
  } catch (e) {
    if (e === "expired") { store.del("sp_token"); return showLogin("Your Spotify login expired."); }
    msg("Could not load your Spotify songs. Check your connection and reload.");
    $("sp-side-msg").textContent = "Could not load your Spotify songs.";
    return;
  }
  tabs = results.filter(Boolean);
  if (!tabs.length) {
    $("sp-side-msg").textContent = "Spotify did not allow reading your songs.";
    return msg("Spotify did not allow reading your songs.");
  }
  msg("");
  $("sp-login").hidden = true;
  const bar = $("sp-tabs");
  bar.hidden = false;
  bar.replaceChildren(...tabs.map((t, i) => {
    const b = el("button", "", t.name);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.onclick = () => { tabIndex = i; drawList(); };
    return b;
  }));
  drawList();
  drawQuick();
}

window.addEventListener("library", () => { if (tabs.length) { drawList(); drawQuick(); } });
window.addEventListener("busy", () => { if (tabs.length) drawList(); });

async function init() {
  try { clientId = (await (await fetch("/api/config")).json()).spotify_client_id || ""; } catch {}
  if (!clientId) {
    msg("Spotify needs a client ID in .env. See README.md for the two-minute setup.");
    $("sp-side-msg").textContent = "Add a Spotify client ID to .env to see your songs here.";
    return;
  }
  const q = new URLSearchParams(location.search);
  if (q.has("code") || q.has("error")) {
    history.replaceState(null, "", location.pathname + "#/spotify");
    const state = store.get("sp_state");
    store.del("sp_state");
    let note = "";
    if (q.has("error")) note = "Spotify login was cancelled.";
    else if (!state || q.get("state") !== state) note = "Spotify login failed (state mismatch). Please try again.";
    else {
      try { await exchange(q.get("code")); } catch { note = "Spotify login failed. Please try again."; }
    }
    store.del("sp_verifier");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    if (note) return showLogin(note);
  }
  if (store.get("sp_token")) await showLists();
  else showLogin();
}

init();
