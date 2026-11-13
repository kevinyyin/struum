# strum

Local web app: paste a YouTube link (or pick a song from Spotify) and get a chord-over-lyrics sheet made from the audio. Everything runs on your machine; the only network calls are YouTube, LRCLIB (synced lyrics) and Spotify.

## Prerequisites

- Python 3.11 and [uv](https://docs.astral.sh/uv/)
- ffmpeg from Homebrew (`brew install ffmpeg`), on `PATH` when you run the server
- Several GB of disk: the first run downloads the separation, chord, beat and Whisper models (and an alignment model per language)

## Setup

```
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements.lock
cp .env.example .env
```

`requirements.txt` lists the top-level packages; `requirements.lock` pins everything.

yt-dlp needs a JavaScript runtime to solve YouTube's challenges. Without one it prints "No supported JavaScript runtime could be found", falls back to deprecated clients, and some videos or formats may be missing. It uses deno by default: `brew install deno`. A pip-installed yt-dlp also needs its challenge-solver scripts, from the `yt-dlp-ejs` package; see https://github.com/yt-dlp/yt-dlp/wiki/EJS.

## Run

```
PATH=/opt/homebrew/bin:$PATH .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000 --env-file .env
```

Open http://127.0.0.1:8000/ (use `127.0.0.1`, not `localhost`: Spotify only accepts the address you registered).

- **Your songs** (sidebar and its own page) lists every saved sheet, newest first. A song that finished while you were elsewhere gets a teal dot until you open it.
- **Spotify** has its own page (Recently played, Top tracks, Liked) and a quick list of three recent songs in the sidebar. Songs you already made say **Open sheet**; the rest say **Make sheet**.
- Paste a YouTube link in the sidebar box for anything else.
- One song is processed at a time; you can browse while it runs.
- On a song: capo and transpose steppers, **Suggest capo**, chord diagrams and a suggested strum (tabs), and a floating player. The current line darkens and its chord turns teal.
- **Playlists:** make them on the Playlists page or with **Add to playlist** on any song; reorder and remove songs on the playlist's page. Open a song from a playlist to get Previous / Next, and when a song ends the next one starts. With `BLOB_READ_WRITE_TOKEN` set, playlists are shared between the Mac and the hosted copy (`playlists.json` in the Blob store); without it they live in `data/playlists.json`.
- **Tuner** (nav, or **Tune** on a song): standard tuning E A D G B e, shows the nearest string, how many cents flat or sharp, and turns teal when in tune. The microphone is analysed in the browser only.
- **Practise a part:** the loop button (or `L`) loops the current line; shift-click another line to extend the loop, or drag across the bar to loop several lines. `Space` plays and pauses.

## Tests

```
.venv/bin/pytest -q
npm install
node --test tests/*.mjs
```

(Plain `node --test tests/` fails on Node 26, so name the files.)

## Spotify

1. Create an app at https://developer.spotify.com/dashboard.
2. Add the redirect URI exactly `http://127.0.0.1:8000/`, and enable the Web API. The page sends its own address as the redirect, so a hosted copy needs its address added here too.
3. Put the app's client ID in `.env` as `SPOTIFY_CLIENT_ID`.
4. Log in from the page. The account owner needs Premium for the app to work.

The Liked tab hides itself if Spotify refuses it. A picked song is matched to a YouTube video by artist, title and duration. The login lasts for the browser tab (about an hour); after that the page asks you to log in again.

## Hosted copy (Vercel)

The Vercel project `struum` serves the page and your saved songs so you can open them anywhere, even with the Mac off. Making new songs still happens on the Mac: the models are too big for Vercel and YouTube blocks its servers.

- Vercel gets only `static/`, `api/`, `vercel.json` and `package.json` (see `.vercelignore`). The Python pipeline, `data/` and `.env` never leave the Mac.
- Songs live in a **private** Vercel Blob store (`struum-songs`): `songs/<youtube id>/…` plus `library.json`. Audio streams through short-lived signed links, so seeking works.
- Everything with your songs is behind a passcode (`STRUM_PASSCODE`, kept in `.env` and in the project's environment variables). The browser remembers it for 30 days. To pick your own, run `scripts/set-passcode.sh` (asks for it, hidden), or write it after `STRUM_PASSCODE=` in `.env` and run `scripts/set-passcode.sh --from-env`. Either way it updates Vercel, redeploys and checks the live site. That logs every browser out.
- With `BLOB_READ_WRITE_TOKEN` in `.env`, the local server uploads each new song when it finishes. To upload by hand: `node --env-file=.env scripts/sync.mjs` (missing songs) or `… sync.mjs <youtube id>` (re-upload one).
- **Make sheet on the hosted page** queues the song for your Mac. While the local server runs (with `BLOB_READ_WRITE_TOKEN` in `.env`), it checks the queue every 3 minutes (at most 200 checks a day), makes the song, uploads it, and the page shows it when done. Queued songs wait while the Mac is off. The hosted page has no link box; paste links on the Mac.
- **Free-plan Blob limits** (Hobby, per month): 1 GB storage, 10,000 reads, 2,000 uploads/listings, 10 GB transfer; going over blocks the store for 30 days. The queue check rate, the page's 30-second status checks (only while a song is pending) and the passcode lockout (5 wrong in an hour) are set to stay well inside them.
- For Spotify on the hosted page, add its address (`https://<your-domain>/`) as a second redirect URI in the Spotify app.
- Pushing to `main` deploys to production. To deploy without pushing: `npx vercel deploy --prod` (the project is linked in `.vercel/`).

## What you get

Each song is saved in `data/<youtube id>/` as `sheet.json`, `sheet.txt`, `sheet.html` (plus the audio). Processing the same video again returns the saved sheet. `data/` is git-ignored and safe to delete.

- Capo and transpose change the page only; saved files stay in the original key.
- "Suggest capo" picks the fret 0-7 with the most open shapes. For C G Am F it suggests 5 (G D Em C).
- Lyric timing from LRCLIB gets one global offset correction to line up with the video. If LRCLIB has nothing, lyrics are transcribed with Whisper (prefix the run command with `FORCE_TRANSCRIBE=1` to skip LRCLIB). Title and credit lines before the first lyric ("词：…", "Artist - Title") are dropped. If the lyrics contain Chinese characters (and no kana), they are aligned as Chinese whatever language the audio detection says.
- Chord fingerings in `static/guitar.json` come from [chords-db](https://github.com/tombatossals/chords-db) (MIT licence; licence text in `static/guitar.json.LICENSE`).
- Fonts: Schibsted Grotesk and Hanken Grotesk, self-hosted in `static/fonts/` (SIL Open Font License, texts alongside). Thumbnails for saved songs load from YouTube (`i.ytimg.com`); Spotify album art loads from Spotify.
- A pasted link's YouTube title is shown tidied ("The Beatles - Let It Be (Official Video)" shows as "Let It Be" by "The Beatles"); saved files keep the original title.

## Known limits

- Chord accuracy drops on unusual chords (7ths, slash chords, key changes); treat the sheet as a draft.
- Transcription runs on CPU: expect 1-2 minutes for a 4-minute song, more on the first run.
- Cantonese (and any language without an alignment model) has estimated word timing, not aligned.
- Chinese alignment in `.txt` depends on a font that draws each character two columns wide.
- Transcribed lyrics (no LRCLIB) can come out as very long lines, which make wide `.txt` rows.
- Videos over 15 minutes are refused.

## Results (end-to-end run, local CPU, Apple Silicon)

| Song | Path | Time | lyrics_source | Language | Tempo |
|---|---|---|---|---|---|
| Let It Be (youtu.be/CGj85pVzRJs) | pasted link | 52 s | lrclib | en | 69.8 BPM, 4/4 |
| Same, `FORCE_TRANSCRIBE=1` | pasted link | 106 s | transcribed | en | 69.8 BPM, 4/4 |
| 周杰倫 晴天 | artist/title request (what a Spotify pick sends) | 66 s | lrclib | zh | 68.2 BPM, 4/4 |

Observed:

- Let It Be (LRCLIB): verse is `C G Am F` with C on "When", G on "times", Am on "Mother", F on "comes". Good. The title comes out as "The Beatles - The Beatles - Let It Be (Official Music Video) [Remastered 2015]" with an empty artist, because the video has no music metadata. A rerun from an empty cache kept this verse; three chords elsewhere moved by one word (demucs applies a random time shift, so runs differ slightly).
- Let It Be (transcribed): lyrics are recognisable, and the same progression is found, but Whisper returned long segments, so each chord row sits over one very wide merged line (up to ~200 columns in the `.txt`) and chords land less precisely on words than with LRCLIB.
- 晴天: the server matched the video "晴天 周杰伦 (歌词版)" (GM Lyric, id 3-DteAHyRnI, 270 s). Chords are Em, C, G, Cmaj7, a plausible progression. LRCLIB's title and credit lines ("周杰伦 - 晴天", "词：周杰伦", "曲：周杰伦") are dropped, so the 13 intro chords sit on two chord-only rows before "故事的小黄花". The solfege lines keep whole syllables ("Re So So Si Do Si La"). In `sheet.html`, as on the page, consecutive Chinese characters get no word gap. Timing came from WhisperX alignment, not interpolation: all 50 lyric lines with three or more words have unevenly spaced word starts, and no "alignment failed" warning was logged.
- The torchcodec warning at startup is harmless.
- Checked in a browser: lines advance in time with the audio, the page scrolls with them, and the saved `.html` and `.txt` open.
- Spotify logged-in path verified by the owner's login: Recently played and Top tracks load; picking "Look After You" (The Fray) and "Sailor Song" (Gigi Perez) made full sheets.
