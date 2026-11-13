# Chord Sheet App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web page that turns a Spotify pick or a YouTube link into a chord-over-lyrics sheet generated from the audio, with capo/transpose, playback with auto-scroll, chord diagrams and a suggested strum.

**Architecture:** One FastAPI app serves a static page and runs a five-step audio pipeline in a background thread, one job at a time, caching results under `data/<video_id>/`. All sheet logic (chord clean-up, placement, rendering) is pure Python in `sheet.py`; all chord display logic (transpose, capo, diagrams) is pure JavaScript in `static/chords.js`. Spotify login happens entirely in the browser.

**Tech Stack:** Python 3.11, FastAPI + uvicorn, yt-dlp, ffmpeg, Demucs (`htdemucs`), `lv-chordia`, `beat-this`, WhisperX, httpx, pytest; plain JavaScript (ES modules, `node --test`), no build step.

**Spec:** `docs/superpowers/specs/2026-11-13-chord-sheet-app-design.md`

## Global Constraints

- Python 3.11 in `.venv/` inside the project. Nothing installed globally except ffmpeg (already present).
- Chords come from audio only. No scraping of chord sites. One recognizer: `lv-chordia`. If it cannot co-install, it gets `.venv-chords/` and is called as a subprocess; it is not swapped out.
- WhisperX runs with `device="cpu"`, `compute_type="int8"`. Demucs uses `mps` when it works, else CPU.
- Server binds to `127.0.0.1:8000` only. Spotify redirect URI is exactly `http://127.0.0.1:8000/`.
- Languages: space-separated languages and Chinese. Japanese and Korean out of scope.
- LRCLIB lyrics are used only when synced and within 10 seconds of the downloaded audio's length.
- A failed job never leaves a `data/<video_id>/` folder behind.
- Requests to outside services carry no personal details; LRCLIB User-Agent is `chord-sheet-app`.
- Not done until the end-to-end runs in Task 9 have actually passed.

## Review Focus

1. **Instrumental or lyric-less song** (no LRCLIB hit, transcription returns no words): expect a sheet of chord-only rows, not a crash. Test in Task 3.
2. **Aligned words with no timestamp** (WhisperX drops times for digits and symbols): expect times interpolated from neighbours. Test in Task 4.
3. **Chord label outside the conversion table**: expect root plus the raw quality text, never an exception. Test in Task 2.
4. **Pasted link that is not a single YouTube video** (other site, playlist parameter, garbage): expect a plain rejection message; playlists reduce to the one video. Test in Task 4 and Task 5.
5. **Very long video** (hour-long mix): expect rejection over 15 minutes with a plain message before any model runs. Test in Task 4.

## File Structure

| File | Responsibility |
|---|---|
| `requirements.txt`, `.gitignore`, `.env.example` | Environment |
| `scripts/smoke.py` | Proves the models install and run together; prints their real output shapes |
| `sheet.py` | Pure: chord names, clean-up, tempo, strum, row building, `.txt`/`.html` rendering |
| `pipeline.py` | Download, stems, chords, beats, lyrics, word times, orchestration, cache |
| `app.py` | HTTP routes, job state, static files |
| `static/index.html`, `static/app.js` | Page, job polling, sheet drawing, playback, Spotify |
| `static/chords.js` | Pure: parse/transpose/capo, diagram SVG |
| `static/guitar.json` | Vendored fingering dataset (chords-db, MIT) |
| `tests/test_sheet.py`, `tests/test_pipeline.py`, `tests/test_app.py`, `tests/chords.test.mjs` | Tests |

### Shared data shapes

```python
# Chord change (after clean-up)
{"time": float, "name": str}            # name is guitar notation: "Am7", "C/E"

# Lyric line going into placement
{"start": float, "end": float, "words": [{"text": str, "start": float, "end": float}]}

# Row in a sheet
{"type": "lyrics", "start": float, "end": float,
 "words": [{"text": str, "start": float, "chords": [{"name": str, "time": float}]}]}
{"type": "instrumental", "start": float, "end": float,
 "chords": [{"name": str, "time": float}]}

# sheet.json
{"video_id": str, "url": str, "title": str, "artist": str, "duration": float,
 "language": str, "lyrics_source": "lrclib" | "transcribed" | "none",
 "bpm": float, "beats_per_bar": int, "strum": str, "rows": [row, ...]}
```

---

### Task 1: Environment and model smoke check

**Files:**
- Create: `requirements.txt`, `.gitignore`, `.env.example`, `scripts/smoke.py`

**Interfaces:**
- Produces: a working `.venv`; a "Model notes" list appended to this plan's end recording the real output of each model call, which Tasks 2 and 4 read.

- [ ] **Step 1:** `git init`. Write `.gitignore` with `.venv/`, `.venv-chords/`, `data/`, `.env`, `__pycache__/`. Write `.env.example` with `SPOTIFY_CLIENT_ID=`.
- [ ] **Step 2:** Create the environment: `python3.11 -m venv .venv`. Write `requirements.txt`: `yt-dlp`, `demucs`, `lv-chordia`, `beat-this`, `whisperx`, `fastapi`, `uvicorn`, `python-dotenv`, `httpx`, `pytest`. Run `.venv/bin/pip install -r requirements.txt`. If the resolver fails on `lv-chordia`, move it to `.venv-chords/` per Global Constraints and note it. Then pin what was installed: `.venv/bin/pip freeze > requirements.lock`.
- [ ] **Step 3:** Write `scripts/smoke.py <audio file>`. It runs, in order, and prints the first 5 items of each result: Demucs two-stem split (`--two-stems vocals -n htdemucs`), `lv_chordia.chord_recognition.chord_recognition(no_vocals)`, `beat_this.inference.File2Beats(checkpoint_path="final0", device="cpu", dbn=False)(no_vocals)`, `whisperx.load_align_model("en", "cpu")` + `whisperx.align` called with two hand-made segments `{"text", "start", "end"}` on the vocal stem. It also prints every distinct chord label seen.
- [ ] **Step 4:** Get a test clip with `.venv/bin/yt-dlp -x --audio-format mp3 --no-playlist -o "data/smoke.%(ext)s" "ytsearch1:The Beatles Let It Be"` and run `.venv/bin/python scripts/smoke.py data/smoke.mp3`.
  Expected: all four stages print results with no exception. Chords near the start include `C`, `G`, `A:min`/`Am`, `F` in some label form.
- [ ] **Step 5:** Append a "Model notes" section to this plan with: the exact chord label format and the distinct qualities seen; whether Demucs ran on `mps`; whether `whisperx.align` accepted hand-made segments and what a returned word looks like; wall-clock time per stage; any package moved to `.venv-chords/`.
- [ ] **Step 6:** Commit: `chore: environment and model smoke check`.

### Task 2: Chord clean-up, tempo and strum (`sheet.py`)

**Files:**
- Create: `sheet.py`, `tests/test_sheet.py`

**Interfaces:**
- Consumes: label format from Task 1's Model notes (adjust the table's left-hand side if it differs from the Harte-style labels below).
- Produces:
  - `guitar_name(label: str) -> str | None`
  - `clean_chords(segments: list[dict], beats: list[float]) -> list[dict]` (input items `{"start_time", "end_time", "chord"}`, output chord changes)
  - `tempo(beats: list[float], downbeats: list[float]) -> tuple[float, int]` (bpm, beats per bar)
  - `suggest_strum(bpm: float, beats_per_bar: int) -> str`

- [ ] **Step 1: Write failing tests**

```python
import sheet

def test_guitar_name():
    assert sheet.guitar_name("C:maj") == "C"
    assert sheet.guitar_name("A:min") == "Am"
    assert sheet.guitar_name("A:min7") == "Am7"
    assert sheet.guitar_name("G:7") == "G7"
    assert sheet.guitar_name("F:maj7") == "Fmaj7"
    assert sheet.guitar_name("D:sus4") == "Dsus4"
    assert sheet.guitar_name("B:hdim7") == "Bm7b5"
    assert sheet.guitar_name("C:maj/3") == "C/E"
    assert sheet.guitar_name("A:min/b3") == "Am/C"
    assert sheet.guitar_name("G:maj/5") == "G/D"
    assert sheet.guitar_name("N") is None
    assert sheet.guitar_name("X") is None

def test_guitar_name_unknown_quality_does_not_raise():
    assert sheet.guitar_name("C:weird13") == "Cweird13"

def test_clean_chords_snaps_merges_and_drops_short():
    beats = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
    segs = [
        {"start_time": 0.03, "end_time": 1.98, "chord": "C:maj"},
        {"start_time": 1.98, "end_time": 2.45, "chord": "D:min"},   # one beat: junk
        {"start_time": 2.45, "end_time": 3.02, "chord": "C:maj"},   # same as before junk
        {"start_time": 3.02, "end_time": 4.0, "chord": "G:maj"},
    ]
    assert sheet.clean_chords(segs, beats) == [
        {"time": 0.0, "name": "C"}, {"time": 3.0, "name": "G"}]

def test_clean_chords_no_beats_keeps_raw_times():
    segs = [{"start_time": 0.2, "end_time": 5.0, "chord": "E:min"}]
    assert sheet.clean_chords(segs, []) == [{"time": 0.2, "name": "Em"}]

def test_tempo():
    beats = [i * 0.5 for i in range(16)]
    assert sheet.tempo(beats, beats[::4]) == (120.0, 4)
    assert sheet.tempo(beats, beats[::3]) == (120.0, 3)
    assert sheet.tempo([], []) == (0.0, 4)

def test_suggest_strum():
    assert sheet.suggest_strum(70, 4) == "D  D U  U D U"
    assert sheet.suggest_strum(120, 4) == "D  D U  U D U (eighths)"
    assert sheet.suggest_strum(160, 4) == "D  D  D U"
    assert sheet.suggest_strum(100, 3) == "D  D U  D U"
    assert sheet.suggest_strum(100, 7) == "D on every beat"
```

- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_sheet.py -v`. Expected: FAIL, `No module named 'sheet'`.
- [ ] **Step 3:** Implement the four functions in `sheet.py`.
  - `guitar_name`: quality table `maj→""`, `min→"m"`, `7→"7"`, `maj7→"maj7"`, `min7→"m7"`, `dim→"dim"`, `dim7→"dim7"`, `hdim7→"m7b5"`, `aug→"aug"`, `sus2→"sus2"`, `sus4→"sus4"`, `maj6→"6"`, `min6→"m6"`, `9→"9"`, `maj9→"maj9"`, `min9→"m9"`, `minmaj7→"mMaj7"`; unknown quality is appended verbatim. Bass degree is semitones above the root (`2→2, b3→3, 3→4, 4→5, b5→6, 5→7, 6→9, b7→10, 7→11`), spelled with sharps unless the root is a flat or F.
  - `clean_chords` order: convert names and drop `None`; snap each start to the nearest beat; drop a change whose distance to the next change is under two beat intervals (median beat gap), giving its time to the previous chord; merge consecutive equal names.
  - `tempo`: bpm is `round(60 / median beat gap, 1)`; beats per bar is the most common number of beats between consecutive downbeats.
  - `suggest_strum` thresholds: under 90, 90 to 140 inclusive, over 140.
- [ ] **Step 4:** Run `.venv/bin/pytest tests/test_sheet.py -v`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: chord clean-up, tempo and strum suggestion`.

### Task 3: Placement and rendering (`sheet.py`)

**Files:**
- Modify: `sheet.py`, `tests/test_sheet.py`

**Interfaces:**
- Consumes: chord changes and lyric lines (shapes above).
- Produces:
  - `build_rows(lines: list[dict], changes: list[dict], duration: float) -> list[dict]`
  - `render_txt(sheet: dict) -> str`
  - `render_html(sheet: dict) -> str`

- [ ] **Step 1: Write failing tests**

```python
LINE = {"start": 10.0, "end": 14.0, "words": [
    {"text": "When", "start": 10.0, "end": 10.4},
    {"text": "I", "start": 10.5, "end": 10.6},
    {"text": "find", "start": 11.0, "end": 11.5},
    {"text": "myself", "start": 12.0, "end": 12.8}]}

def test_build_rows_places_on_nearest_word_and_carries_chord_in():
    changes = [{"time": 0.0, "name": "C"}, {"time": 4.0, "name": "G"},
               {"time": 11.9, "name": "Am"}]
    rows = sheet.build_rows([LINE], changes, 20.0)
    assert [r["type"] for r in rows] == ["instrumental", "lyrics"]
    assert rows[0]["chords"] == [{"name": "C", "time": 0.0}, {"name": "G", "time": 4.0}]
    words = rows[1]["words"]
    assert words[0]["chords"] == [{"name": "G", "time": 10.0}]   # sounding chord repeated at line start
    assert words[3]["chords"] == [{"name": "Am", "time": 11.9}]
    assert words[1]["chords"] == [] and words[2]["chords"] == []

def test_build_rows_two_changes_on_one_word_both_kept_in_order():
    changes = [{"time": 11.9, "name": "Am"}, {"time": 12.3, "name": "F"}]
    words = sheet.build_rows([LINE], changes, 20.0)[0]["words"]
    assert [c["name"] for c in words[3]["chords"]] == ["Am", "F"]

def test_build_rows_no_lyrics_gives_chord_only_rows():
    changes = [{"time": float(i * 4), "name": n} for i, n in enumerate("CGAF" * 3)]
    rows = sheet.build_rows([], changes, 48.0)
    assert rows and all(r["type"] == "instrumental" for r in rows)
    assert sum(len(r["chords"]) for r in rows) == 12
    assert all(len(r["chords"]) <= 8 for r in rows)

def _sheet(rows):
    return {"title": "T", "artist": "A", "url": "https://youtu.be/x", "bpm": 120.0,
            "beats_per_bar": 4, "strum": "D  D U  U D U (eighths)", "rows": rows}

def test_render_txt_chord_starts_above_its_word():
    rows = sheet.build_rows([LINE], [{"time": 10.0, "name": "C"},
                                     {"time": 11.9, "name": "Am"}], 20.0)
    chord_row, lyric_row = sheet.render_txt(_sheet(rows)).splitlines()[-2:]
    assert lyric_row == "When I find myself"
    assert chord_row.index("C") == 0
    assert chord_row.index("Am") == lyric_row.index("myself")

def test_render_txt_long_chords_never_overlap():
    line = {"start": 0.0, "end": 2.0, "words": [
        {"text": "a", "start": 0.0, "end": 0.5}, {"text": "b", "start": 1.0, "end": 1.5}]}
    rows = sheet.build_rows([line], [{"time": 0.0, "name": "F#m7b5"},
                                     {"time": 1.0, "name": "Bbmaj7"}], 2.0)
    chord_row, lyric_row = sheet.render_txt(_sheet(rows)).splitlines()[-2:]
    assert "F#m7b5 Bbmaj7" in chord_row
    assert chord_row.index("Bbmaj7") == lyric_row.index("b")

def test_render_txt_chinese_no_spaces_and_double_width():
    line = {"start": 0.0, "end": 2.0, "words": [
        {"text": c, "start": i * 0.5, "end": i * 0.5 + 0.4} for i, c in enumerate("故事的小")]}
    rows = sheet.build_rows([line], [{"time": 0.0, "name": "G"},
                                     {"time": 1.0, "name": "D"}], 2.0)
    chord_row, lyric_row = sheet.render_txt(_sheet(rows)).splitlines()[-2:]
    assert lyric_row == "故事的小"
    assert chord_row.index("D") == 4          # two characters, two columns each

def test_render_html_escapes_and_stacks():
    line = {"start": 0.0, "end": 1.0, "words": [{"text": "<b>", "start": 0.0, "end": 0.5}]}
    rows = sheet.build_rows([line], [{"time": 0.0, "name": "C"}], 1.0)
    html = sheet.render_html(_sheet(rows))
    assert "&lt;b&gt;" in html and "<b>" not in html
    assert 'class="chord"' in html and "T" in html and "https://youtu.be/x" in html
```

- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_sheet.py -v`. Expected: new tests FAIL with `AttributeError`.
- [ ] **Step 3:** Implement.
  - `build_rows`: a change belongs to a line when `line.start - one beat gap <= time <= line.end` (use 0.5 s when the gap is unknown); it attaches to the word with the nearest `start`. Changes belonging to no line form instrumental rows between the surrounding lines, split every 8 chords. If a line's first word has no chord and a chord is sounding, prepend that chord with `time = line.start`.
  - `render_txt`: header lines (title, artist, url, tempo and strum), a blank line, then per lyric row a chord line and a lyric line; instrumental rows as `| C | G |`. Words join with one space, except no space between two words that are both CJK. Column positions use `unicodedata.east_asian_width` (`W`/`F` count 2). When a chord would touch the previous chord, pad the lyric line with spaces so the chord still starts above its word.
  - `render_html`: a complete page; each word is `<span class="w"><span class="chord">…</span>text</span>` with inline-block stacking in a `<style>` block; all text through `html.escape`.
- [ ] **Step 4:** Run `.venv/bin/pytest tests/test_sheet.py -v`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: chord placement and sheet rendering`.

### Task 4: Pipeline (`pipeline.py`)

**Files:**
- Create: `pipeline.py`, `tests/test_pipeline.py`

**Interfaces:**
- Consumes: everything Task 2 and 3 produce; call shapes from Task 1's Model notes.
- Produces:
  - `class PipelineError(Exception)` (message is shown to the user as-is)
  - `video_id_from_url(url: str) -> str` (raises `PipelineError`)
  - `pick_video(candidates: list[dict], duration: float | None) -> dict` (items `{"id", "duration", "title"}`)
  - `parse_lrc(text: str) -> list[dict]` (items `{"start", "text"}`)
  - `fill_word_times(words: list[dict], start: float, end: float) -> list[dict]`
  - `run(request: dict, progress: Callable[[int, str], None]) -> dict` returns the sheet. `request` is `{"url": str}` or `{"artist": str, "title": str, "duration": float}`.
  - `DATA: Path` = `data/` beside the file. Finished songs live in `DATA/<video_id>/` as `audio.mp3`, `sheet.json`, `sheet.txt`, `sheet.html`.
  - `STEPS = ["Finding audio", "Separating stems", "Detecting chords", "Getting lyrics", "Building sheet"]`; `progress(i, STEPS[i])` is called as each begins.
  - Running `python pipeline.py <url>` prints the `.txt` sheet.

- [ ] **Step 1: Write failing tests** (model imports must stay inside the functions that use them so these run fast)

```python
import pytest, pipeline

@pytest.mark.parametrize("url", [
    "https://www.youtube.com/watch?v=QDYfEBY9NM4",
    "https://youtu.be/QDYfEBY9NM4?si=abc",
    "https://music.youtube.com/watch?v=QDYfEBY9NM4&list=PL123",
    "https://www.youtube.com/shorts/QDYfEBY9NM4"])
def test_video_id_from_url(url):
    assert pipeline.video_id_from_url(url) == "QDYfEBY9NM4"

@pytest.mark.parametrize("url", [
    "https://example.com/watch?v=QDYfEBY9NM4", "not a url", "",
    "https://www.youtube.com/playlist?list=PL123", "file:///etc/passwd"])
def test_video_id_from_url_rejects(url):
    with pytest.raises(pipeline.PipelineError):
        pipeline.video_id_from_url(url)

def test_pick_video_prefers_length_match():
    c = [{"id": "live", "duration": 421, "title": "x"}, {"id": "album", "duration": 243, "title": "y"}]
    assert pipeline.pick_video(c, 240.0)["id"] == "album"
    assert pipeline.pick_video(c, 100.0)["id"] == "live"      # nothing within 10 s: first
    assert pipeline.pick_video(c, None)["id"] == "live"
    with pytest.raises(pipeline.PipelineError):
        pipeline.pick_video([], 240.0)

def test_parse_lrc():
    text = "[ar:Someone]\n[00:12.50]Hello there\n[01:02.03]Second line\n[01:10.00]\n"
    assert pipeline.parse_lrc(text) == [
        {"start": 12.5, "text": "Hello there"}, {"start": 62.03, "text": "Second line"}]

def test_fill_word_times_interpolates_missing():
    words = [{"text": "a", "start": 1.0, "end": 1.2}, {"text": "24"}, {"text": "b", "start": 3.0, "end": 3.2}]
    out = pipeline.fill_word_times(words, 0.0, 4.0)
    assert out[1]["start"] == pytest.approx(2.0)
    none = pipeline.fill_word_times([{"text": "x"}, {"text": "y"}], 10.0, 12.0)
    assert [w["start"] for w in none] == pytest.approx([10.0, 11.0])

def test_run_rejects_long_video(monkeypatch):
    monkeypatch.setattr(pipeline, "video_info",
                        lambda vid: {"id": vid, "duration": 3600, "title": "mix", "artist": None, "track": None})
    with pytest.raises(pipeline.PipelineError, match="15 minutes"):
        pipeline.run({"url": "https://youtu.be/QDYfEBY9NM4"}, lambda i, s: None)
    assert not (pipeline.DATA / "QDYfEBY9NM4").exists()
```

- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_pipeline.py -v`. Expected: FAIL, `No module named 'pipeline'`.
- [ ] **Step 3:** Implement the pure functions and these step functions:
  - `video_info(video_id) -> dict` and `search_videos(query) -> list[dict]` via the `yt_dlp` Python API (`ytsearch5:` for search, `noplaylist=True`).
  - `download(video_id, dest) -> Path`: `audio.mp3` via yt-dlp's FFmpegExtractAudio.
  - `separate(audio, dest) -> tuple[Path, Path]`: `(vocals, no_vocals)`, `htdemucs`, two stems, device per Model notes.
  - `detect_chords(no_vocals) -> list[dict]`, `detect_beats(no_vocals) -> tuple[list[float], list[float]]`.
  - `fetch_lyrics(artist, title, duration) -> list[dict] | None`: LRCLIB `GET https://lrclib.net/api/get` with `artist_name`, `track_name`, `duration`; on 404, `GET /api/search` with `q` and keep the first result that has `syncedLyrics` and `abs(result.duration - duration) <= 10`. Timeout 10 s; any network error returns `None`.
  - `word_times(vocals, lines | None) -> tuple[list[dict], str]`: detect language with Whisper on the vocal stem. With lines: build segments (end is the next line's start, last line ends at audio end) and `whisperx.align`. Without: `whisperx.load_model(...).transcribe` then align. No align model for the language, or align rejecting hand-made segments: `fill_word_times` over each line's whitespace-split words (per character when the text is CJK). Always pass results through `fill_word_times`.
  - `run`: return the cached `sheet.json` if `DATA/<video_id>/sheet.json` exists. Reject duration over 900 s with the message `"That video is longer than 15 minutes."`. Work in `tempfile.mkdtemp(dir=DATA)`, write `sheet.json`, `sheet.txt`, `sheet.html` and keep `audio.mp3`, delete the stems, then `os.replace` the folder to `DATA/<video_id>`; remove the temp folder on any exception. Environment variable `FORCE_TRANSCRIBE=1` skips LRCLIB. Song identity for a pasted link: yt-dlp `artist`/`track`, else the video title as `title` with empty artist.
- [ ] **Step 4:** Run `.venv/bin/pytest tests/test_pipeline.py -v`. Expected: PASS.
- [ ] **Step 5:** Real run: get a video id with `.venv/bin/yt-dlp --get-id "ytsearch1:The Beatles Let It Be"`, then run `.venv/bin/python pipeline.py https://youtu.be/<id>`.
  Expected: a sheet prints; the first verse lines carry chords from `C G Am F`; `data/<id>/` holds the four files and no stems. Run it again: returns in under 2 seconds from cache.
- [ ] **Step 6:** Commit: `feat: audio-to-sheet pipeline with cache`.

### Task 5: HTTP API (`app.py`)

**Files:**
- Create: `app.py`, `tests/test_app.py`, `static/index.html` (placeholder with a title only)

**Interfaces:**
- Consumes: `pipeline.run`, `pipeline.PipelineError`, `pipeline.STEPS`, `pipeline.DATA`.
- Produces:
  - `GET /` → `static/index.html`; `/static/*` and `/data/*` served as files.
  - `GET /api/config` → `{"spotify_client_id": str}` from env `SPOTIFY_CLIENT_ID` (empty string when unset).
  - `POST /api/songs` body `{"url": str}` or `{"artist": str, "title": str, "duration": float}` → `{"id": str}`; `422` for any other body; `409 {"detail": "Another song is still processing."}` while a job runs.
  - `GET /api/songs/{id}` → `{"status": "running" | "done" | "error", "step": int, "step_name": str, "steps": int, "error": str | None, "sheet": dict | None}`; `404` for an unknown id.

- [ ] **Step 1: Write failing tests** using `fastapi.testclient.TestClient` with `pipeline.run` monkeypatched: a fake that calls `progress(1, "Separating stems")` and returns `{"video_id": "abc", "rows": []}` gives `status == "done"` with that sheet after polling; a fake raising `PipelineError("No match found.")` gives `status == "error"` and `error == "No match found."`; a fake raising `RuntimeError("boom")` gives `error == "Something went wrong while processing this song."`; a fake blocked on a `threading.Event` makes a second `POST` return `409`; `POST {"nope": 1}` returns `422`; `GET /api/songs/unknown` returns `404`; `GET /api/config` returns the env value.
- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_app.py -v`. Expected: FAIL, `No module named 'app'`.
- [ ] **Step 3:** Implement `app.py`: jobs in a module-level dict keyed by `uuid4().hex`, one `threading.Thread` per job, a `threading.Lock` held for the job's duration and tried non-blocking in `POST`. Unexpected exceptions are logged with traceback and reported with the generic message above.
- [ ] **Step 4:** Run `.venv/bin/pytest -v`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat: job API`.

### Task 6: Page, sheet display and playback

**Files:**
- Modify: `static/index.html`
- Create: `static/app.js`

**Interfaces:**
- Consumes: the API from Task 5 and the sheet shape.
- Produces (used by Tasks 7 and 8): in `app.js`, `startSong(body)` posts to `/api/songs` and polls every second; `renderSheet(sheet)` draws into `#sheet`; module state `current = {sheet, shift}` where `shift` is semitones applied to displayed chords (0 here). Each chord element is `<span class="chord" data-name="Am7" data-time="11.9">`; each row is `<div class="row" data-start data-end>`.

- [ ] **Step 1:** Build the page: a link field with a Go button, a status line showing `step_name (step+1 of steps)`, an error line, and for a finished sheet: title, artist, the source video link, download links to `/data/<video_id>/sheet.txt` and `sheet.html`, an `<audio controls src="/data/<video_id>/audio.mp3">`, and the rows with each chord in a box above its word (same stacking as `render_html`). All text set with `textContent`, never `innerHTML`.
- [ ] **Step 2:** Playback: on `timeupdate`, give the row containing the current time the class `now` and the latest chord at or before the current time the class `now`; call `scrollIntoView({block: "center", behavior: "smooth"})` when the current row changes. Clicking a row sets `audio.currentTime` to its `data-start`. Controls are real buttons and inputs with labels; the highlight is not colour-only (also bold).
- [ ] **Step 3:** Verify in the browser: `.venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000 --env-file .env`, open `http://127.0.0.1:8000/`, paste the Task 4 link.
  Expected: the cached sheet appears at once; pressing play highlights lines in time with the singing and the page follows; clicking a later line jumps there; a garbage link shows the rejection message; the browser console has no errors.
- [ ] **Step 4:** Commit: `feat: sheet page with playback and auto-scroll`.

### Task 7: Capo, transpose, diagrams and strum display

**Files:**
- Create: `static/chords.js`, `static/guitar.json`, `tests/chords.test.mjs`
- Modify: `static/app.js`, `static/index.html`

**Interfaces:**
- Consumes: `current`, `renderSheet` from Task 6.
- Produces, exported from `static/chords.js`:
  - `transpose(name: string, semitones: number, preferFlats: boolean): string`
  - `prefersFlats(names: string[]): boolean`
  - `suggestCapo(names: string[]): number` (0 to 7)
  - `findFingering(db: object, name: string): object | null` (the dataset's first position for the chord; base chord for a slash chord)
  - `diagramSvg(position: object): string`

- [ ] **Step 1: Write failing tests** (`node --test tests/`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpose, prefersFlats, suggestCapo, findFingering, diagramSvg } from "../static/chords.js";

test("transpose", () => {
  assert.equal(transpose("C", 2, false), "D");
  assert.equal(transpose("Am7", -2, false), "Gm7");
  assert.equal(transpose("B", 1, false), "C");
  assert.equal(transpose("C/E", 2, false), "D/F#");
  assert.equal(transpose("A", 1, true), "Bb");
  assert.equal(transpose("F#m7b5", 0, false), "F#m7b5");
  assert.equal(transpose("???", 3, false), "???");
});
test("prefersFlats", () => {
  assert.equal(prefersFlats(["Bb", "F", "Gm"]), true);
  assert.equal(prefersFlats(["E", "F#m", "A"]), false);
});
test("suggestCapo picks the fret with most open shapes", () => {
  assert.equal(suggestCapo(["C", "G", "Am", "Em"]), 0);
  assert.equal(suggestCapo(["E", "B", "C#m", "F#m"]), 4);   // plays as C G Am Dm
  assert.equal(suggestCapo([]), 0);
});
test("fingering lookup and diagram", () => {
  const db = JSON.parse(readFileSync(new URL("../static/guitar.json", import.meta.url)));
  for (const n of ["C", "Am", "G7", "F#m", "Bb", "Dsus4", "Em7"]) assert.ok(findFingering(db, n), n);
  assert.deepEqual(findFingering(db, "C/E"), findFingering(db, "C"));
  assert.equal(findFingering(db, "Cweird13"), null);
  assert.match(diagramSvg(findFingering(db, "C")), /^<svg[\s\S]*<\/svg>$/);
});
```

- [ ] **Step 2:** Download the dataset: `curl -fsSL https://raw.githubusercontent.com/tombatossals/chords-db/master/lib/guitar.json -o static/guitar.json`. Read its structure before writing `findFingering` (suffix names such as `major`, `minor`, `m7`; sharp keys spelled out). Run `node --test tests/`. Expected: FAIL, cannot find `chords.js`.
- [ ] **Step 3:** Implement `chords.js`. Open shapes for `suggestCapo`: `C A G E D Am Em Dm` and those roots' `7` forms; ties go to the lower fret. Capo N displays `transpose(name, -N, …)`.
- [ ] **Step 4:** Run `node --test tests/`. Expected: PASS.
- [ ] **Step 5:** Wire into the page: a labelled Transpose stepper (−6 to +6), a Capo select (0 to 7), a "Suggest capo" button, a Reset button; `current.shift = transpose − capo`; chords re-render from `data-name` without refetching. Above the sheet: tempo, the strum pattern labelled "Suggested strum", and a row of diagrams for the distinct displayed chords in first-appearance order, name only when `findFingering` returns null. Diagram SVGs are built from numeric dataset fields only and each has a `<title>` with the chord name.
- [ ] **Step 6:** Verify in the browser on the Task 4 song: Capo 2 turns `C G Am F` into `Bb F Gm Eb`; Suggest capo returns it to 0; diagrams change with it; playback highlighting still works.
- [ ] **Step 7:** Commit: `feat: capo, transpose, chord diagrams, suggested strum`.

### Task 8: Spotify picker

**Files:**
- Modify: `static/app.js`, `static/index.html`

**Interfaces:**
- Consumes: `GET /api/config`, `startSong({artist, title, duration})`.

- [ ] **Step 1:** Implement Authorization Code with PKCE in the browser: authorize at `https://accounts.spotify.com/authorize` (`response_type=code`, `code_challenge_method=S256`, a random `state` checked on return, `redirect_uri=http://127.0.0.1:8000/`, scopes `user-read-recently-played user-top-read user-library-read`); exchange at `https://accounts.spotify.com/api/token`. Verifier, state and tokens live in `sessionStorage` behind try/catch. After the exchange, strip the query string with `history.replaceState`.
- [ ] **Step 2:** Three tabs, 50 items each: `GET /v1/me/player/recently-played?limit=50`, `/v1/me/top/tracks?limit=50`, `/v1/me/tracks?limit=50`. Each item is a button "Title — Artist" calling `startSong` with the first artist's name, the track name and `duration_ms / 1000`. A `403` on a list hides that tab. A `401` clears the tokens and shows "Log in with Spotify" again. With no client ID configured, the login button is replaced by a line pointing to the README.
- [ ] **Step 3:** Verify without credentials: page loads with the README pointer and the paste-a-link path still works, console clean. The logged-in path is verified by the owner in Task 9.
- [ ] **Step 4:** Commit: `feat: Spotify song picker`.

### Task 9: README and end-to-end proof

**Files:**
- Create: `README.md`

- [ ] **Step 1:** Write `README.md`: prerequisites (ffmpeg, Python 3.11), setup commands, the run command, how to create the Spotify developer app (redirect URI `http://127.0.0.1:8000/`, Premium required, client ID into `.env`), where files are saved, known limits (accuracy on unusual chords, CPU transcription speed, Cantonese timing estimated, `.txt` alignment for Chinese depends on the font).
- [ ] **Step 2:** Run every suite: `.venv/bin/pytest -v` and `node --test tests/`. Expected: all PASS.
- [ ] **Step 3:** With the server running, process three songs through the page from a clean `data/` folder, timing each:
  1. An English song with LRCLIB lyrics ("Let It Be"): `lyrics_source` is `lrclib`; verse chords are `C G Am F`; chords sit on plausible words.
  2. The same song with `FORCE_TRANSCRIBE=1` (delete its cache folder first): `lyrics_source` is `transcribed`; lyrics are recognisable.
  3. A Mandarin song (周杰倫 "晴天"): characters render with chords above single characters; note whether timing came from alignment or interpolation.
  For each: play 30 seconds and confirm the highlight tracks the singing; open the saved `.txt` and `.html`.
- [ ] **Step 4:** Record in the README the measured time per song and anything that looked wrong. Report results to the owner as observed, including failures, and state that the Spotify login path is unverified until they add a client ID and log in.
- [ ] **Step 5:** Commit: `docs: README and end-to-end results`.

---

## Model notes

(Filled in by Task 1. Clip length 243s.)

### Observed on Apple Silicon, Python 3.11, clip = "The Beatles Let It Be" via yt-dlp (data/smoke.mp3)

- **Install:** everything, including `lv-chordia` 1.1.0, co-installs in the single `.venv` (via `uv pip install --python .venv/bin/python -r requirements.txt`; `.venv` has no pip). Nothing moved to `.venv-chords/`. Pinned in `requirements.lock` (torch 2.8.0, whisperx 3.8.6, demucs 4.1.0, beat-this 1.1.0). Run with `/opt/homebrew/bin` on PATH (ffmpeg).
- **Demucs:** ran on `mps` successfully. Call used: `python -m demucs --two-stems vocals -n htdemucs -d mps -o <out> <file>`; stems land at `<out>/htdemucs/<file stem>/vocals.wav` and `no_vocals.wav`. Fall back to `-d cpu` if it fails.
- **Chords:** `from lv_chordia import chord_recognition` (NOT `lv_chordia.chord_recognition.chord_recognition`: the package `__init__` rebinds that name to the function, so the dotted module import fails with AttributeError). `chord_recognition(path: str, chord_dict_name="submission")` returns a list of `{"start_time": float, "end_time": float, "chord": str}`. Example: `{'start_time': 1.65, 'end_time': 3.37, 'chord': 'C:maj'}`. Label format is Harte `Root:quality[/bass]`, with `N` for no chord. Distinct labels seen: `A:min, Bb:maj, C:maj, C:maj/5, D:min/5, F:maj, G:maj, N`. Start of song: N, C:maj, G:maj, A:min, F:maj (matches expectation). Slash bass uses scale degree (`/5`), not a note name. Prints "Inference: ..." progress lines to stdout (5 models ensembled).
- **Beats:** `File2Beats(checkpoint_path="final0", device="cpu", dbn=False)(path)` returns a tuple `(beats, downbeats)` of float-second arrays. beats start `1.72, 3.38, 4.22, 5.04, 5.86`; downbeats `1.72, 5.04, 6.7, 8.34, 9.96`. Checkpoint (77 MB) auto-downloads on first use to `~/.cache/torch/hub/checkpoints`.
- **WhisperX align:** `audio = whisperx.load_audio(path)`; `model, meta = whisperx.load_align_model("en", "cpu")`; `whisperx.align(segments, model, meta, audio, "cpu", return_char_alignments=False)`. It accepted hand-made segments `{"text","start","end"}`. Result keys: `segments`, `word_segments`. A word looks like `{'word': 'Let', 'start': np.float64(30.0), 'end': np.float64(30.181), 'score': np.float64(0.694)}` (numpy floats, so cast with `float()` before JSON; very low scores / missing start/end are possible, e.g. `'it'` score 0.0). First use downloads a 360 MB wav2vec2 model.
- **Wall-clock per stage** (full clip, after warm install; beats and align include one-time checkpoint downloads): demucs (mps) 40s, chords 24s, beats 11s (incl. ~7s download), align 33s (incl. ~17s download). Whole smoke run 1m50s.
- **Packages in `.venv-chords/`:** none.
