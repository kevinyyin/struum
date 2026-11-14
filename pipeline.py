"""Audio to chord sheet: python pipeline.py <youtube url> prints the .txt sheet."""
import json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs, urlparse

import sheet

DATA = Path(__file__).parent / "data"
STEPS = ["Finding audio", "Separating stems", "Detecting chords", "Getting lyrics", "Building sheet"]
WATCH = "https://www.youtube.com/watch?v="
# large-v3-turbo: near large-v3 accuracy on Mandarin, and int8 on CPU runs at about medium's speed.
WHISPER_MODEL = "large-v3-turbo"
WORD = re.compile(r"[㐀-鿿豈-﫿]|[^\s㐀-鿿豈-﫿]+")  # each CJK character is a word
LRC_HEADER = re.compile(r"^[^:：]{1,10}[:：]| - ")  # "词：周杰伦", "周杰伦 - 晴天"


class PipelineError(Exception):
    pass


class Cancelled(BaseException):  # not an Exception: no "except Exception" on the way out may swallow a cancel
    pass


def trash(vid: str) -> None:
    """Move a song's folder to data/trash/<id> (an older trashed copy is replaced). The library only lists data/*/."""
    dest = DATA / "trash" / vid
    shutil.rmtree(dest, ignore_errors=True)
    dest.parent.mkdir(exist_ok=True)
    os.replace(DATA / vid, dest)


def video_id_from_url(url: str) -> str:
    u = urlparse(url.strip())
    host = (u.hostname or "").removeprefix("www.").removeprefix("m.")
    vid = ""
    if u.scheme in ("http", "https"):
        if host == "youtu.be":
            vid = u.path[1:]
        elif host in ("youtube.com", "music.youtube.com") and u.path == "/watch":
            vid = parse_qs(u.query).get("v", [""])[0]
        elif host == "youtube.com" and u.path.startswith("/shorts/"):
            vid = u.path[len("/shorts/"):]
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid):
        raise PipelineError("That is not a link to a single YouTube video.")
    return vid


def pick_video(candidates: list[dict], duration: float | None) -> dict:
    if not candidates:
        raise PipelineError("No YouTube video found for that song.")
    return next((c for c in candidates[:5] if duration is not None and c["duration"]
                 and abs(c["duration"] - duration) <= 10), candidates[0])


def parse_lrc(text: str) -> list[dict]:
    lines = []
    for line in text.splitlines():
        m = re.match(r"\[(\d+):(\d+(?:\.\d+)?)\](.*)", line)
        # Title and credit lines before the first lyric would soak up the intro's chords.
        if m and m[3].strip() and (lines or not LRC_HEADER.search(m[3].strip())):
            lines.append({"start": int(m[1]) * 60 + float(m[2]), "text": m[3].strip()})
    return lines


def join_letters(words: list[dict], text: str) -> list[dict]:
    """zh alignment returns one word per non-space character; regroup them into WORD tokens of text."""
    tokens = WORD.findall(text)
    if [w["text"] for w in words] != list("".join(tokens)):
        return words
    out, i = [], 0
    for t in tokens:
        part, i = words[i:i + len(t)], i + len(t)
        starts = [w["start"] for w in part if w.get("start") is not None]
        ends = [w["end"] for w in part if w.get("end") is not None]
        out.append({"text": t, "start": starts[0] if starts else None, "end": ends[-1] if ends else None})
    return out


def fill_word_times(words: list[dict], start: float, end: float) -> list[dict]:
    # Word i starts on boundary i; boundaries 0 and len(words) default to the line's start and end.
    known = {0: start, **{i: float(w["start"]) for i, w in enumerate(words) if w.get("start") is not None},
             len(words): end}
    starts = []
    for i in range(len(words)):
        p, q = max(k for k in known if k <= i), min(k for k in known if k > i)
        starts.append(known[p] + (known[q] - known[p]) * (i - p) / (q - p))
    bounds = starts + [end]
    return [{"text": w["text"], "start": s,
             "end": float(w["end"]) if w.get("end") is not None else bounds[i + 1]}
            for i, (w, s) in enumerate(zip(words, starts))]


def lyric_offset(starts: list[float], envelope, rate: float) -> float:
    """Seconds to add to every LRC line start so the starts sit on rises in vocal energy; 0 if unclear."""
    import numpy as np
    w = int(0.5 * rate)
    c = np.concatenate([[0.0], np.cumsum(np.pad(envelope, w, mode="edge"))])
    i = np.arange(len(envelope)) + w                            # index into the padded envelope
    rise = (c[i + w] - c[i]) - (c[i] - c[i - w])                # energy in the next half second minus the last
    shifts = np.arange(-100, 101) * 0.05                        # within ±5 s
    frames = np.clip(np.round((np.asarray(starts) + shifts[:, None]) * rate).astype(int), 0, len(rise) - 1)
    score = rise[frames].mean(axis=1)
    best = score.argmax()
    # Peak in noise units of a mean over len(starts) lines: random starts stay under ~5, real lyrics reach 8-13.
    return float(shifts[best]) if score[best] * np.sqrt(len(starts)) > 5 * rise.std() else 0.0


def video_info(video_id: str) -> dict:
    import yt_dlp
    try:
        with yt_dlp.YoutubeDL({"quiet": True, "noplaylist": True}) as ydl:
            return ydl.extract_info(WATCH + video_id, download=False)
    except yt_dlp.utils.DownloadError:
        raise PipelineError("That video is unavailable.") from None


def search_videos(query: str) -> list[dict]:
    import yt_dlp
    try:
        with yt_dlp.YoutubeDL({"quiet": True, "noplaylist": True, "extract_flat": True}) as ydl:
            entries = ydl.extract_info(f"ytsearch5:{query}", download=False)["entries"]
    except yt_dlp.utils.DownloadError:
        raise PipelineError("Could not search YouTube for that song.") from None
    return [{"id": e["id"], "duration": e.get("duration"), "title": e.get("title")} for e in entries]


def download(video_id: str, dest: Path) -> Path:
    import yt_dlp
    opts = {"quiet": True, "noprogress": True, "noplaylist": True, "format": "bestaudio/best",
            "outtmpl": str(dest / "audio.%(ext)s"),
            "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}]}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([WATCH + video_id])
    except yt_dlp.utils.DownloadError:
        raise PipelineError("That video could not be downloaded.") from None
    return dest / "audio.mp3"


def separate(audio: Path, dest: Path, alive: Callable[[], None] = lambda: None) -> tuple[Path, Path]:
    """alive is called twice a second while demucs runs; if it raises (a cancel), demucs is stopped."""
    for device in ("mps", "cpu"):
        p = subprocess.Popen([sys.executable, "-m", "demucs", "--two-stems", "vocals", "-n", "htdemucs",
                              "-d", device, "-o", str(dest), str(audio)],
                             stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        try:
            while True:
                try:
                    err = p.communicate(timeout=0.5)[1]
                    break
                except subprocess.TimeoutExpired:
                    alive()
        except BaseException:
            p.kill()
            p.wait()
            raise
        if p.returncode == 0:
            stems = dest / "htdemucs" / audio.stem
            return stems / "vocals.wav", stems / "no_vocals.wav"
    raise RuntimeError("demucs failed: " + err[-500:])


def detect_chords(no_vocals: Path) -> list[dict]:
    from lv_chordia import chord_recognition  # package re-exports the function over the submodule name
    return chord_recognition(str(no_vocals))


def detect_beats(no_vocals: Path) -> tuple[list[float], list[float]]:
    from beat_this.inference import File2Beats
    beats, downbeats = File2Beats(checkpoint_path="final0", device="cpu", dbn=False)(str(no_vocals))
    return beats.tolist(), downbeats.tolist()


def fetch_lyrics(artist: str, title: str, duration: float) -> list[dict] | None:
    import httpx
    ok = lambda h: h and h.get("syncedLyrics") and abs(h["duration"] - duration) <= 10
    try:
        with httpx.Client(base_url="https://lrclib.net/api", timeout=10,
                          headers={"User-Agent": "chord-sheet-app"}) as client:
            r = client.get("/get", params={"artist_name": artist, "track_name": title,
                                           "duration": round(duration)})
            # 400: empty artist, from a pasted link without music metadata
            hit = None if r.status_code in (400, 404) else r.raise_for_status().json()
            if not ok(hit):  # also unsynced or wrong-length records: search is the second try
                hits = client.get("/search", params={"q": f"{artist} {title}".strip()}).raise_for_status().json()
                hit = next((h for h in hits if ok(h)), None)
    except (httpx.HTTPError, ValueError):
        return None
    if not ok(hit):
        return None
    return parse_lrc(hit["syncedLyrics"]) or None


def word_times(vocals: Path, lines: list[dict] | None) -> tuple[list[dict], str]:
    import numpy as np
    import whisperx
    from whisperx.alignment import DEFAULT_ALIGN_MODELS_HF, DEFAULT_ALIGN_MODELS_TORCH
    from whisperx.audio import SAMPLE_RATE
    audio = whisperx.load_audio(str(vocals))
    end = len(audio) / SAMPLE_RATE
    whisper = whisperx.load_model(WHISPER_MODEL, "cpu", compute_type="int8")
    # Detect on the loudest 30 s: songs often open with an instrumental intro that fools detection.
    n = 30 * SAMPLE_RATE
    s = max(range(0, max(len(audio) - n, 0) + 1, 5 * SAMPLE_RATE),
            key=lambda i: float((audio[i:i + n] ** 2).sum()))
    language = whisper.detect_language(audio[s:s + n])
    text = "".join(l["text"] for l in lines or [])
    # The lyrics' script beats detection (a Mandarin song's loudest 30 s can be English). Kana means Japanese.
    if language != "yue" and re.search(r"[一-鿿]", text) and not re.search(r"[぀-ヿ]", text):
        language = "zh"
    if lines is None:
        segments = whisper.transcribe(audio, language=language)["segments"]
    else:
        # Synced lyrics can sit a little early or late against this particular video: shift them as a whole.
        frames = audio[: len(audio) // 160 * 160].reshape(-1, 160)  # 10 ms frames at 16 kHz
        shift = lyric_offset([l["start"] for l in lines], np.log10((frames ** 2).mean(axis=1) + 1e-6), 100)
        print(f"lyrics offset {shift:+.2f} s", file=sys.stderr)
        lines = [{**l, "start": max(0.0, l["start"] + shift)} for l in lines]
        nexts = [l["start"] for l in lines[1:]] + [end]
        segments = [{"text": l["text"], "start": l["start"], "end": e} for l, e in zip(lines, nexts)]
    if language in DEFAULT_ALIGN_MODELS_TORCH or language in DEFAULT_ALIGN_MODELS_HF:
        model, meta = whisperx.load_align_model(language, "cpu")
        try:
            segments = whisperx.align(segments, model, meta, audio, "cpu",
                                      return_char_alignments=False)["segments"]
        except Exception as e:  # align rejected the hand-made segments: interpolate within each line instead
            print(f"alignment failed, interpolating word times: {e!r:.200}", file=sys.stderr)
    out = []
    for seg in segments:
        words = [{"text": w["word"], "start": w.get("start"), "end": w.get("end")} for w in seg.get("words", [])]
        if language == "zh":
            words = join_letters(words, seg["text"])
        words = fill_word_times(words or [{"text": t} for t in WORD.findall(seg["text"])],
                                float(seg["start"]), float(seg["end"]))
        if words:
            out.append({"start": words[0]["start"], "end": words[-1]["end"], "words": words})
    return out, language


def run(request: dict, progress: Callable[[int, str], None]) -> dict:
    """request: {"url"} or {"artist", "title", "duration"}; with "force", a song already made is made again.
    progress doubles as the cancel check: it is called between steps and may raise Cancelled.
    shortcut: the chord, beat and Whisper models run in this thread and cannot be interrupted, so a cancel waits
    for the model that is running (seconds; up to a minute while transcribing); run them as child processes if
    that is too slow."""
    progress(0, STEPS[0])
    if "url" in request:
        vid = video_id_from_url(request["url"])
    else:
        vid = pick_video(search_videos(f"{request['artist']} {request['title']}"), request.get("duration"))["id"]
    folder = DATA / vid
    if (folder / "sheet.json").exists() and not request.get("force"):
        return json.loads((folder / "sheet.json").read_text(encoding="utf-8"))
    info = video_info(vid)
    if not info.get("duration") or info["duration"] > 900:  # no duration means a live stream
        raise PipelineError("That video is longer than 15 minutes.")
    duration = float(info["duration"])
    if "title" in request:
        artist, title = request["artist"], request["title"]
    elif info.get("artist") and info.get("track"):
        artist, title = info["artist"], info["track"]
    else:
        artist, title = "", info["title"]
    DATA.mkdir(exist_ok=True)
    work = Path(tempfile.mkdtemp(dir=DATA))
    try:
        audio = download(vid, work)
        progress(1, STEPS[1])
        vocals, no_vocals = separate(audio, work, lambda: progress(1, STEPS[1]))
        progress(2, STEPS[2])
        segments = detect_chords(no_vocals)
        progress(2, STEPS[2])
        beats, downbeats = detect_beats(no_vocals)
        progress(3, STEPS[3])
        lrc = None if os.environ.get("FORCE_TRANSCRIBE") == "1" else fetch_lyrics(artist, title, duration)
        progress(3, STEPS[3])
        lines, language = word_times(vocals, lrc)
        progress(4, STEPS[4])
        bpm, beats_per_bar = sheet.tempo(beats, downbeats)
        doc = {"video_id": vid, "url": WATCH + vid, "title": title, "artist": artist, "duration": duration, "made": time.time(),
               "language": language,
               "lyrics_source": "none" if not lines else "lrclib" if lrc else "transcribed",
               "bpm": float(bpm), "beats_per_bar": int(beats_per_bar),
               "strum": sheet.suggest_strum(bpm, beats_per_bar),
               "rows": sheet.build_rows(lines, sheet.clean_chords(segments, beats), duration)}
        text = json.dumps(doc, ensure_ascii=False)
        (work / "sheet.json").write_text(text, encoding="utf-8")
        (work / "sheet.txt").write_text(sheet.render_txt(doc), encoding="utf-8")
        (work / "sheet.html").write_text(sheet.render_html(doc), encoding="utf-8")
        shutil.rmtree(work / "htdemucs")
        if folder.exists():  # made again: the old sheet stayed in place until now, and is kept in the trash
            trash(vid)
        os.replace(work, folder)
    except BaseException:
        shutil.rmtree(work, ignore_errors=True)
        raise
    return json.loads(text)  # same plain types as a cached sheet


if __name__ == "__main__":
    print(sheet.render_txt(run({"url": sys.argv[1]}, lambda i, step: print(step + "...", file=sys.stderr))))
