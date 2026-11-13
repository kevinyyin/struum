import {startSong} from "/static/app.js";

const REDIRECT = "http://127.0.0.1:8000/";
const SCOPE = "user-read-recently-played user-top-read user-library-read";
const LISTS = [
  ["Recently played", "/v1/me/player/recently-played?limit=50"],
  ["Top tracks", "/v1/me/top/tracks?limit=50"],
  ["Liked songs", "/v1/me/tracks?limit=50"],
];
const $ = (id) => document.getElementById(id);

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

function showLogin(clientId) {
  $("sp-tabs").hidden = true;
  $("sp-list").replaceChildren();
  const b = $("sp-login");
  b.hidden = false;
  b.onclick = async () => {
    const verifier = rand(), state = rand();
    store.set("sp_verifier", verifier);
    store.set("sp_state", state);
    location.href = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
      response_type: "code", client_id: clientId, redirect_uri: REDIRECT, scope: SCOPE,
      state, code_challenge_method: "S256", code_challenge: await sha256b64url(verifier),
    });
  };
}

function logout(clientId) {
  store.del("sp_token");
  msg("Spotify session expired. Please log in again.");
  showLogin(clientId);
}

async function exchange(clientId, code) {
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

function renderTracks(tracks) {
  const list = $("sp-list");
  list.replaceChildren(...tracks.map((t) => {
    const b = document.createElement("button");
    b.type = "button";
    const artist = t.artists[0]?.name ?? "";
    b.textContent = `${t.name} — ${artist}`; // untrusted: textContent only
    b.onclick = () => startSong({artist, title: t.name, duration: t.duration_ms / 1000});
    const li = document.createElement("div");
    li.append(b);
    return li;
  }));
}

async function showLists(clientId) {
  const token = store.get("sp_token");
  msg("Loading your songs...");
  let results;
  try {
    results = await Promise.all(LISTS.map(async ([name, path]) => {
      const r = await fetch("https://api.spotify.com" + path, {headers: {Authorization: `Bearer ${token}`}});
      if (r.status === 401) throw "expired";
      if (r.status === 403) return null; // e.g. liked songs refused: drop that tab
      if (!r.ok) throw new Error(r.status);
      const {items} = await r.json();
      return {name, tracks: items.map((i) => i.track ?? i).filter(Boolean)};
    }));
  } catch (e) {
    if (e === "expired") return logout(clientId);
    return msg("Could not load your Spotify songs.");
  }
  const tabs = results.filter(Boolean);
  if (!tabs.length) return msg("Spotify did not allow reading your songs.");
  msg("");
  $("sp-login").hidden = true;
  const bar = $("sp-tabs");
  bar.hidden = false;
  const pick = (i) => {
    [...bar.children].forEach((b, j) => b.setAttribute("aria-pressed", String(i === j)));
    renderTracks(tabs[i].tracks);
  };
  bar.replaceChildren(...tabs.map((t, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t.name;
    b.onclick = () => pick(i);
    return b;
  }));
  pick(0);
}

async function init() {
  let clientId = "";
  try { clientId = (await (await fetch("/api/config")).json()).spotify_client_id || ""; } catch {}
  if (!clientId) return msg("Spotify login needs a client ID in .env — see README.md.");

  const q = new URLSearchParams(location.search);
  if (q.has("code") || q.has("error")) {
    history.replaceState(null, "", location.pathname);
    const state = store.get("sp_state");
    store.del("sp_state");
    if (q.has("error")) msg("Spotify login was cancelled.");
    else if (!state || q.get("state") !== state) msg("Spotify login failed (state mismatch). Please try again.");
    else {
      try { await exchange(clientId, q.get("code")); } catch { msg("Spotify login failed. Please try again."); }
    }
    store.del("sp_verifier");
  }
  if (store.get("sp_token")) await showLists(clientId);
  else showLogin(clientId);
}

init();
