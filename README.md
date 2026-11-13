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

## Run

```
PATH=/opt/homebrew/bin:$PATH .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000 --env-file .env
```

Open http://127.0.0.1:8000/. Paste a link, or use the Spotify tabs. One song is processed at a time; a second request while one runs is refused.

## Tests

```
.venv/bin/pytest -q
node --test tests/*.mjs
```

(Plain `node --test tests/` fails on Node 26, so name the files.)

## Spotify

1. Create an app at https://developer.spotify.com/dashboard.
2. Add the redirect URI exactly `http://127.0.0.1:8000/`, and enable the Web API.
3. Put the app's client ID in `.env` as `SPOTIFY_CLIENT_ID`.
4. Log in from the page. The account owner needs Premium for the app to work.

The Liked songs tab hides itself if Spotify refuses it. The logged-in path is unverified until the owner adds a client ID and logs in. A picked song is matched to a YouTube video by artist, title and duration.

## What you get

Each song is saved in `data/<youtube id>/` as `sheet.json`, `sheet.txt`, `sheet.html` (plus the audio). Processing the same video again returns the saved sheet. `data/` is git-ignored and safe to delete.

- Capo and transpose change the page only; saved files stay in the original key.
- "Suggest capo" picks the fret 0-7 with the most open shapes. For C G Am F it suggests 5 (G D Em C).
- Lyric timing from LRCLIB gets one global offset correction to line up with the video. If LRCLIB has nothing, lyrics are transcribed with Whisper (prefix the run command with `FORCE_TRANSCRIBE=1` to skip LRCLIB).

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
| Let It Be (youtu.be/CGj85pVzRJs) | pasted link | 66 s (61 s on rerun) | lrclib | en | 69.8 BPM, 4/4 |
| Same, `FORCE_TRANSCRIBE=1` | pasted link | 106 s | transcribed | en | 69.8 BPM, 4/4 |
| 周杰倫 晴天 | artist/title request (what a Spotify pick sends) | 101 s | lrclib | zh | 68.2 BPM, 4/4 |

Observed:

- Let It Be (LRCLIB): verse is `C G Am F` with C on "When", G on "trouble", Am on "Mother", F on "comes". Good. The title comes out as "The Beatles - The Beatles - Let It Be (Official Music Video) [Remastered 2015]" with an empty artist, because the video has no music metadata.
- Let It Be (transcribed): lyrics are recognisable, and the same progression is found, but Whisper returned long segments, so each chord row sits over one very wide merged line (up to ~200 columns in the `.txt`) and chords land less precisely on words than with LRCLIB.
- 晴天: the server matched the video "晴天 周杰伦 (歌词版)" (GM Lyric, id 3-DteAHyRnI, 270 s). Characters render with chords above single characters. Chords are Em, C, G, Cmaj7, a plausible progression. The LRCLIB text includes credit lines ("词：周杰伦") and a line of solfege syllables, which show up in the sheet. Timing came from WhisperX alignment, not interpolation: 51 of the 53 multi-word lines in `sheet.json` have unevenly spaced word starts, which interpolation cannot produce (the fallback is a silent `except`, so it is not logged). On the page and in `sheet.html`, Chinese characters show word-sized gaps between them ("故 事 的 小 黄 花"). The solfege line renders letter by letter ("R e S o S o ..."): Latin text in a zh song is split per character.
- The torchcodec warning at startup is harmless.
- Not verified: the 30 s playback highlight in a browser and opening the files in a browser, and the Spotify login.
