# Chord sheet app: design

Date: 2026-11-13

## Intent

A personal tool that turns any song into a guitar chord sheet: lyrics with each
chord placed above the word where it changes. Chords are generated from the
audio by AI models, the way the Strum app does it, so it works on songs nobody
has transcribed. The owner picks a song from their Spotify listening or pastes
a YouTube link.

## Goals

- Local web page on an Apple Silicon MacBook (M5 Pro).
- Two ways in: log in with Spotify and click a song, or paste a YouTube link.
- For a Spotify pick, the app finds the matching YouTube audio itself.
- Output shown on the page and saved as `.txt` and `.html`.
- Runs in its own virtual environment.
- Proven end to end on a real song before it is called done.
- **Capo and transpose** on the page (capo matters most).
- **Playback with auto-scroll:** play the song and have the sheet follow it.
- **Chord diagrams and a suggested strumming pattern** for each song.

## Non-goals (for now)

Editing chords by hand, phone app, Vercel or any hosted deployment, multiple
users.

## Anti-goals

- Scraping chord sites. Chords come from the audio only.
- Comparing several chord recognizers. One is picked and used.
- Reporting success without a real end-to-end run.

## Constraints

- Spotify gives no audio; it is a song picker only. A personal Spotify
  developer app requires the owner's Premium account (owner has Premium) and
  the owner must create the app and supply its client ID.
- WhisperX has no Apple GPU support; it runs on CPU (`device="cpu"`,
  `compute_type="int8"`).
- Parity with Strum cannot be promised: it is closed-source. Expect good
  results on common chords, weaker on unusual ones, and a minute or more per
  new song (unmeasured).

## Approaches

1. **Look up existing chord sheets online.** Fast and accurate for popular
   songs, but needs scraping and fails on obscure songs. Rejected by the owner.
2. **Detect from audio, single Python app serving one page.** Chosen. Fewest
   moving parts; everything heavy runs on the Mac.
3. **Detect from audio, Next.js front end plus a Python worker.** Only useful
   for Vercel, which cannot run these models anyway. Dropped.

## Decided by the owner

The pipeline, in order:

1. Audio via yt-dlp, converted with ffmpeg.
2. Demucs splits vocals from everything else.
3. Chords detected on the non-vocal stem, changes aligned to detected beats,
   one-beat junk chords smoothed out.
4. Lyrics from LRCLIB (synced). WhisperX gives word-level timestamps against
   the vocal stem. If LRCLIB has nothing, WhisperX transcribes the vocal stem.
5. Each chord goes over the word nearest its change time. Saved as `.txt` and
   a clean `.html`.

Spotify login is only for picking songs.

## My calls (owner left the how to me)

- **Python 3.11**, one virtual environment. ffmpeg from Homebrew.
- **Chords:** `lv-chordia` (default ~170-chord vocabulary). Returns
  `start_time`, `end_time`, `chord` like `A:min7`.
- **Beats:** `beat-this` (`File2Beats`), run on the non-vocal stem.
- **Stems:** Demucs `htdemucs` with `--two-stems vocals`, on the Apple GPU
  (`mps`) when it works, CPU otherwise.
- **Server:** FastAPI. One background job at a time, in a plain thread.
- **Spotify login in the browser** (Authorization Code with PKCE, no client
  secret, redirect `http://127.0.0.1:8000/`). The page calls Spotify directly;
  the server only hands the page the client ID from `.env`. Lists shown:
  recently played, top tracks, liked songs (drop liked songs if Spotify's
  current API refuses it).
- **Cache:** results stored under `data/<youtube id>/`; a cached song returns
  instantly.

- **If the packages will not install together** in one environment, the chord
  step gets a second virtual environment called as a subprocess. `lv-chordia`
  stays; no switching recognizers.
- **LRCLIB length check:** synced lyrics are used only if their track length is
  within 10 seconds of the downloaded audio. Otherwise the app transcribes,
  because lyrics timed for a different version put every chord over the wrong
  word with no visible error.
- **Language:** owner decided Chinese is in scope alongside languages written
  with spaces between words; Japanese and Korean are out for now. The rest is
  my call: Whisper detects the language from the vocal stem and the matching
  WhisperX alignment model is used; if none exists (likely for Cantonese), word
  times are interpolated within each line.
- **Chinese handling (my calls):** each character is treated as a word, so a
  chord sits above the character where it changes. Lyrics are shown in whatever
  script the source gives (simplified or traditional); no conversion, no
  pinyin. The page and the saved `.html` position each chord in a box directly
  above its word or character, so alignment does not depend on character
  width. The `.txt` pads using East Asian character widths (Python's
  `unicodedata`), which lines up only in fonts where Chinese characters are
  exactly two columns wide. `sheet.py` tests include a Chinese line.

## Behaviour details

**Matching Spotify to YouTube.** Search YouTube for `artist title` with yt-dlp,
take the first of the top five results whose length is within 10 seconds of
Spotify's track length, else the first result. The page shows which video was
used so a wrong match is visible; pasting a link is the override.

**Song identity for pasted links.** Use yt-dlp's `artist` and `track` fields
when present, else the video title. If LRCLIB finds nothing, transcribe.

**Lyrics.** LRCLIB `/api/get` with artist, title and duration, then
`/api/search` as a second try. Only synced lyrics count as found. Each synced
line becomes a segment (start = its timestamp, end = the next line's) passed to
`whisperx.align` with the vocal stem. Confirm at build time that `align`
accepts hand-made segments; if not, fall back to interpolating word times
evenly within each line.

**Chord clean-up.**
- Convert labels to guitar notation: `C:maj` → `C`, `A:min` → `Am`,
  `A:min7` → `Am7`, `G:7` → `G7`, bass notes as slash chords, `N` → no chord.
- Snap each change to the nearest beat.
- Merge any chord lasting under two beats into its neighbour.
- Merge consecutive identical chords.

**Placement.** A chord change inside a lyric line's time span goes above the
word whose start is nearest. A change outside any line (intro, solo, outro)
goes on its own chord-only row between lines. The chord sounding when a line
starts is repeated at the line's first word.

**Rendering.** The pipeline saves `sheet.json` (lines, words, chords, all with
times). The page draws the sheet from that. `.txt` is two rows per lyric line,
chords padded so they never overlap each other. `.html` is a minimal styled
page with title, artist and source link, each chord in a box above its word.
Saved
files are in the original key; capo and transpose apply on the page only.

**Capo and transpose (my calls).** Done in the browser, no reprocessing.
Transpose shifts every chord by a chosen number of semitones. Capo N shows the
shapes to play with a capo on fret N (the real chords shifted down N). A
"suggest capo" button picks the fret from 0 to 7 that turns the most chords
into open shapes (C, A, G, E, D, Am, Em, Dm and their 7ths). Sharps or flats
are chosen to match the song's detected chords.

**Playback with auto-scroll (my calls).** The page plays the downloaded audio
file from the local server in a normal audio player, so timing matches the
chord and word times exactly and videos that block embedding still work. The
current line and current chord are highlighted and the page scrolls to keep
the current line in view. Clicking a line jumps playback to it.

## Chord diagrams and suggested strumming

Owner chose: fingering diagrams plus a suggested strumming pattern. Detecting
the strum rhythm from audio and note-for-note tabs are out of scope.

**Diagrams (my calls).** A row at the top of the sheet shows a fingering
diagram for each distinct chord in the song, in order of first appearance. It
follows capo and transpose. Fingerings come from an existing open chord
dataset, vendored as a static file; none are written by hand. Diagrams are
drawn as small SVGs. A slash chord shows the diagram of its base chord. A chord
missing from the dataset shows its name with no diagram.

**Suggested strum (my calls).** Tempo and beats per bar come from the beat
tracker (beats and downbeats). A small fixed table maps them to a pattern,
shown with the tempo and clearly labelled "suggested":
- 4 beats, under 90 bpm: `D  D U  U D U`
- 4 beats, 90 to 140 bpm: `D  D U  U D U` played as eighths
- 4 beats, over 140 bpm: `D  D  D U`
- 3 beats: `D  D U  D U`
- anything else: plain downstrokes on each beat

## The page

```
[ Log in with Spotify ]   or   [ paste YouTube link ............ ] [Go]

Recently played | Top tracks | Liked
  Song title — Artist
  Song title — Artist

Status: separating stems (2 of 5)…

Let It Be — The Beatles          source: youtube.com/watch?v=…
        C              G
When I find myself in times of trouble
```

## Files

- `app.py`: routes (`POST /api/songs`, `GET /api/songs/{id}`, `/api/config`),
  serves the page.
- `pipeline.py`: the five steps, each a function, writing into the cache folder.
- `sheet.py`: pure logic (label conversion, snapping, smoothing, placement,
  rendering). No model imports.
- `static/index.html`: the page, plain JavaScript.
- `tests/test_sheet.py`: unit tests for `sheet.py`.
- `.env`: `SPOTIFY_CLIENT_ID`. `README.md`: setup and run commands.

## Error handling

Each failure shows a plain message on the page and never leaves a half-written
cache entry: video unavailable, no YouTube match, model failure, Spotify token
expired (prompt to log in again).

## Testing

- Unit tests for everything in `sheet.py`.
- End to end on a real, well-known song through the paste-a-link path, once
  with LRCLIB lyrics and once with the transcription fallback forced. Check the
  chords against the song's commonly known progression.
- The Spotify login path needs the owner: they create the developer app, paste
  the client ID, and log in. It is reported as unverified until they do.

## Left to the builder

Exact package versions, Whisper model size for the fallback, page styling,
progress wording.
