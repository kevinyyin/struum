import {$, el, startSong, findSong, isBusy, config, canMakeSongs, queuedAs, requestSong, svg} from "/static/app.js";

const REDIRECT = location.origin + "/"; // must match a redirect URI registered on the Spotify app
const SCOPE = "user-read-recently-played user-top-read user-library-read playlist-read-private playlist-read-collaborative";
const LISTS = [
  ["Recently played", "/v1/me/player/recently-played?limit=50"],
  ["Top tracks", "/v1/me/top/tracks?limit=50"],
  ["Liked", "/v1/me/tracks?limit=50"],
];

// sessionStorage can throw (blocked storage), so every access is guarded.
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const sha256b64url = async (s) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));

const msg = (s) => { $("sp-msg").textContent = s; };
let clientId = "";
let tabs = []; // [{name, tracks}]
let tabIndex = 0;
let found = null; // {query, tracks, more} while a search is showing, instead of a tab
let openPl = null; // {pl, tracks | null, error | null} when one of your playlists is open
const api = (path, opts = {}) => fetch("https://api.spotify.com" + path, {...opts, headers: {Authorization: `Bearer ${store.get("sp_token")}`}});
const cover = (images) => (images?.filter((i) => (i.width ?? 64) >= 64).at(-1) ?? images?.at(-1))?.url ?? "";

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
  $("sp-search").hidden = true;
  found = null;
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

const artOf = (t) => cover(t.album?.images); // largest first: the smallest that is still 64 px

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
  if (!canMakeSongs()) { // hosted: ask the Mac
    if (!queuedAs(t.name, artist)) requestSong({artist, title: t.name, duration: t.duration_ms / 1000, art: artOf(t)});
    return;
  }
  startSong({artist, title: t.name, duration: t.duration_ms / 1000}, {title: t.name, by: artist, art: artOf(t)});
}

function text(t) {
  const d = el("div");
  d.append(el("b", "", t.name), el("span", "who", (t.artists ?? []).map((a) => a.name).join(", ")));
  return d;
}

const QUEUED = {waiting: "Waiting for Mac", making: "Making…"};

function action(t) {
  const artist = t.artists?.[0]?.name ?? "";
  const made = findSong(t.name, artist);
  const queued = !made && !canMakeSongs() && queuedAs(t.name, artist);
  const b = el("button", made ? "act open" : queued ? "act queued" : "act", made ? "Open sheet" : queued ? QUEUED[queued] : "Make sheet");
  b.type = "button";
  b.disabled = !made && (queued ? true : canMakeSongs() && isBusy());
  if (b.disabled) b.title = queued ? "Your Mac makes it the next time the Strum app is running there" : "One song at a time";
  b.onclick = (e) => { e.stopPropagation(); pick(t); };
  return b;
}

const trackRow = (t) => {
  const li = el("li", "item");
  const b = action(t);
  li.append(art(t), text(t), b);
  li.onclick = () => { if (!b.disabled) pick(t); };
  return li;
};

function drawList() {
  const list = $("sp-list");
  const tab = tabs[tabIndex];
  [...$("sp-tabs").children].forEach((b, i) => b.setAttribute("aria-selected", String(!found && i === tabIndex)));
  if (!found && tab?.playlists !== undefined) return drawPlaylistsTab(tab);
  const tracks = found ? found.tracks : tab?.tracks ?? [];
  list.replaceChildren(...tracks.map(trackRow));
  if (found && !found.tracks.length) list.append(el("li", "empty", `No songs on Spotify match "${found.query}".`));
  else if (!found && tab && !tab.tracks.length) list.append(el("li", "empty", `Nothing in ${tab.name} yet.`));
  if (found?.more) {
    const b = el("button", "pill", "More results");
    b.type = "button";
    b.onclick = () => search(found.query, found.tracks.length);
    const li = el("li", "more");
    li.append(b);
    list.append(li);
  }
}

/* your Spotify playlists */

function drawPlaylistsTab(tab) {
  const list = $("sp-list");
  if (tab.needsLogin) {
    const li = el("li", "empty", "Strum needs one more Spotify permission to see your playlists. ");
    const b = el("button", "pill honey", "Log in to Spotify again");
    b.type = "button";
    b.onclick = login;
    li.append(el("br"), b);
    return list.replaceChildren(li);
  }
  if (!openPl) {
    list.replaceChildren(...tab.playlists.map((p) => {
      const li = el("li", "item");
      const img = el("img", "art");
      img.alt = "";
      const src = cover(p.images);
      if (src.startsWith("https://")) img.src = src;
      const t = el("div");
      const n = (p.items ?? p.tracks)?.total ?? 0;
      t.append(el("b", "", p.name), el("span", "who", `${n} ${n === 1 ? "song" : "songs"}${p.owner?.display_name ? ` · by ${p.owner.display_name}` : ""}`));
      const b = el("button", "act", "Open");
      b.type = "button";
      li.append(img, t, b);
      li.onclick = () => openPlaylist(p);
      return li;
    }));
    if (!tab.playlists.length) list.append(el("li", "empty", "You don't have any Spotify playlists yet."));
    return;
  }
  const head = el("li", "plhead");
  const back = el("button", "pill");
  back.append(svg("back"), "All playlists");
  back.type = "button";
  back.onclick = () => { openPl = null; drawList(); };
  head.append(back, el("b", "", openPl.pl.name));
  list.replaceChildren(head);
  if (openPl.error) list.append(el("li", "empty", openPl.error));
  else if (!openPl.tracks) list.append(el("li", "empty", "Loading the songs…"));
  else {
    list.append(...openPl.tracks.map(trackRow));
    if (!openPl.tracks.length) list.append(el("li", "empty", "No songs in this playlist."));
  }
}

async function openPlaylist(p) {
  openPl = {pl: p, tracks: null, error: null};
  drawList();
  const tracks = [];
  try {
    // up to 300 songs, 50 at a time (Spotify's page size)
    for (let offset = 0; offset < 300; offset += 50) {
      const r = await api(`/v1/playlists/${encodeURIComponent(p.id)}/items?limit=50&offset=${offset}`);
      if (r.status === 401) { store.del("sp_token"); return showLogin("Your Spotify login expired."); }
      const page = r.ok ? await r.json() : null;
      if (r.status === 403 || (page && !Array.isArray(page.items))) {
        throw new Error("Spotify only lets Strum read the songs in playlists you made or collaborate on, not ones you follow.");
      }
      if (!r.ok) throw new Error("Spotify didn't send this playlist's songs. Try again in a moment.");
      tracks.push(...page.items.map((i) => i.item ?? i.track).filter((t) => t?.type !== "episode" && t?.name));
      if (!page.next) break;
    }
    if (openPl?.pl === p) openPl.tracks = dedupe(tracks);
  } catch (e) {
    if (openPl?.pl === p) openPl.error = e.message;
  }
  if (openPl?.pl === p) drawList();
}

async function loadPlaylists() {
  const lists = [];
  for (let offset = 0; offset < 200; offset += 50) {
    const r = await api(`/v1/me/playlists?limit=50&offset=${offset}`);
    if (r.status === 401) throw "expired";
    if (r.status === 403) return {name: "Playlists", playlists: [], needsLogin: true}; // logged in before Strum asked for playlists
    if (!r.ok) return null;
    const page = await r.json();
    lists.push(...(page.items ?? []).filter((p) => p?.id));
    if (!page.next) break;
  }
  return {name: "Playlists", playlists: lists};
}

function drawQuick() {
  const recent = tabs.find((t) => t.name === "Recently played") ?? tabs.find((t) => t.tracks);
  $("sp-quick").replaceChildren(...(recent?.tracks ?? []).slice(0, 3).map((t) => {
    const li = el("li");
    const b = el("button", "song");
    b.type = "button";
    b.append(art(t), text(t));
    b.title = findSong(t.name, t.artists?.[0]?.name ?? "") ? "Open sheet" : "Make sheet";
    b.onclick = () => { if (findSong(t.name, t.artists?.[0]?.name ?? "") || !canMakeSongs() || !isBusy()) pick(t); };
    li.append(b);
    return li;
  }));
  $("sp-side-msg").replaceChildren();
  $("sp-all").hidden = !recent;
}

const dedupe = (tracks) => { const seen = new Set(); return tracks.filter((t) => !seen.has(t.id) && seen.add(t.id)); };

async function showLists() {
  msg("Loading your songs…");
  $("sp-side-msg").textContent = "Loading your Spotify songs…";
  let results;
  try {
    results = await Promise.all([...LISTS.map(async ([name, path]) => {
      const r = await api(path);
      if (r.status === 401) throw "expired";
      if (r.status === 403) return null; // e.g. liked songs refused: drop that tab
      if (!r.ok) throw new Error(r.status);
      const {items} = await r.json();
      return {name, tracks: dedupe(items.map((i) => i.track ?? i).filter((t) => t?.name))};
    }), loadPlaylists()]);
    const pl = results.pop();
    if (pl) results.splice(1, 0, pl);
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
  $("sp-search").hidden = false;
  const bar = $("sp-tabs");
  bar.hidden = false;
  bar.replaceChildren(...tabs.map((t, i) => {
    const b = el("button", "", t.name);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.onclick = () => { tabIndex = i; found = null; openPl = null; $("sp-q").value = ""; drawList(); };
    return b;
  }));
  drawList();
  drawQuick();
}

// Search all of Spotify as you type (a short pause first, and only the latest answer is shown).
let searchTimer = 0, searchAbort = null;
// Spotify allows development-mode apps 10 results per search; "More results" asks for the next 10.
async function search(query, offset = 0) {
  searchAbort?.abort();
  if (!query) { found = null; drawList(); return; }
  searchAbort = new AbortController();
  let r;
  try {
    r = await api("/v1/search?" + new URLSearchParams({q: query, type: "track", limit: "10", offset: String(offset)}),
      {signal: searchAbort.signal});
  } catch (e) {
    if (e.name !== "AbortError") msg("Could not reach Spotify. Check your connection.");
    return;
  }
  if (r.status === 401) { store.del("sp_token"); return showLogin("Your Spotify login expired."); }
  if (!r.ok) return msg("Spotify search didn't work just now. Try again in a moment.");
  msg("");
  const page = (await r.json()).tracks ?? {};
  const fresh = (page.items ?? []).filter((t) => t?.name);
  found = {query, tracks: dedupe([...(offset ? found?.tracks ?? [] : []), ...fresh]), more: !!page.next && offset + 10 < 50};
  drawList();
}
$("sp-q").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => search($("sp-q").value.trim()), 350);
});
$("sp-search").addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(searchTimer);
  search($("sp-q").value.trim());
});
$("sp-q").addEventListener("keydown", (e) => { if (e.key === "Escape") { $("sp-q").value = ""; search(""); } });

window.addEventListener("library", () => { if (tabs.length) { drawList(); drawQuick(); } });
window.addEventListener("busy", () => { if (tabs.length) drawList(); });

async function init() {
  const cfg = await config;
  clientId = cfg.spotify_client_id || "";
  if (cfg.can_make === false) $("sp-sub").textContent = "Make sheet asks your Mac: it checks every few minutes while the Strum app is running there, and the song appears here when it's done.";
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
