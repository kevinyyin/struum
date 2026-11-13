import html
import unicodedata
from collections import Counter
from statistics import median

QUALITY = {
    "maj": "", "min": "m", "7": "7", "maj7": "maj7", "min7": "m7", "dim": "dim",
    "dim7": "dim7", "hdim7": "m7b5", "aug": "aug", "sus2": "sus2", "sus4": "sus4",
    "maj6": "6", "min6": "m6", "9": "9", "maj9": "maj9", "min9": "m9",
    "minmaj7": "mMaj7",
}
DEGREE = {"2": 2, "b3": 3, "3": 4, "4": 5, "b5": 6, "5": 7, "6": 9, "b7": 10, "7": 11}
SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


def guitar_name(label: str) -> str | None:
    if ":" not in label:
        return None
    root, rest = label.split(":", 1)
    quality, _, bass = rest.partition("/")
    name = root + QUALITY.get(quality, quality)
    if bass in DEGREE and (root in SHARPS or root in FLATS):
        scale = FLATS if "b" in root or root == "F" else SHARPS
        semis = (SHARPS if root in SHARPS else FLATS).index(root)
        name += "/" + scale[(semis + DEGREE[bass]) % 12]
    return name


def _gap(beats: list[float]) -> float:
    return median(b - a for a, b in zip(beats, beats[1:]))


def clean_chords(segments: list[dict], beats: list[float]) -> list[dict]:
    changes = [(s["start_time"], guitar_name(s["chord"])) for s in segments]
    changes = [(t, n) for t, n in changes if n]
    if len(beats) > 1:
        # Compare beat indices, not seconds: float jitter would drop exact two-beat chords.
        idx = [(min(range(len(beats)), key=lambda i: abs(beats[i] - t)), n) for t, n in changes]
        nxt = [i for i, _ in idx[1:]] + [float("inf")]
        changes = [(beats[i], n) for (i, n), end in zip(idx, nxt) if end - i >= 2]
    out = []
    for t, n in changes:
        if not out or out[-1]["name"] != n:
            out.append({"time": t, "name": n})
    return out


def tempo(beats: list[float], downbeats: list[float]) -> tuple[float, int]:
    if len(beats) < 2:
        return 0.0, 4
    counts = Counter(
        sum(a <= b < c for b in beats) for a, c in zip(downbeats, downbeats[1:]))
    return round(60 / _gap(beats), 1), counts.most_common(1)[0][0] if counts else 4


def suggest_strum(bpm: float, beats_per_bar: int) -> str:
    if beats_per_bar == 3:
        return "D  D U  D U"
    if beats_per_bar != 4:
        return "D on every beat"
    if bpm < 90:
        return "D  D U  U D U"
    if bpm <= 140:
        return "D  D U  U D U (eighths)"
    return "D  D  D U"


LEAD_IN = 0.5  # seconds before a line's first word that still count as that line


def build_rows(lines: list[dict], changes: list[dict], duration: float) -> list[dict]:
    lines = sorted((l for l in lines if l["words"]), key=lambda l: l["start"])
    rows, free = [], []

    def flush(end):
        for i in range(0, len(free), 8):
            chunk = free[i:i + 8]
            nxt = free[i + 8]["time"] if i + 8 < len(free) else end
            rows.append({"type": "instrumental", "start": chunk[0]["time"], "end": nxt,
                         "chords": chunk})
        free.clear()

    def owner(c):
        return next((l for l in lines if l["start"] - LEAD_IN <= c["time"] <= l["end"]), None)

    loose = [c for c in changes if owner(c) is None]  # each is consumed by exactly one gap
    for line in lines:
        free.extend(c for c in loose if c["time"] < line["start"])
        loose = [c for c in loose if c["time"] >= line["start"]]
        flush(line["start"])
        words = [{"text": w["text"], "start": w["start"], "chords": []} for w in line["words"]]
        for c in (c for c in changes if owner(c) is line):
            nearest = min(words, key=lambda w: abs(w["start"] - c["time"]))
            nearest["chords"].append({"name": c["name"], "time": c["time"]})
        sounding = [c for c in changes if c["time"] <= line["start"]]
        if sounding and not words[0]["chords"]:
            words[0]["chords"].append({"name": sounding[-1]["name"], "time": line["start"]})
        rows.append({"type": "lyrics", "start": line["start"], "end": line["end"],
                     "words": words})
    free.extend(loose)
    flush(duration)
    return rows


def _width(text: str) -> int:
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in text)


def _wide(ch: str) -> bool:
    return _width(ch) == 2


def _header(sheet: dict) -> list[str]:
    return [sheet["title"], sheet["artist"], sheet["url"],
            f"{sheet['bpm']} BPM, {sheet['beats_per_bar']} beats per bar, strum: {sheet['strum']}"]


def render_txt(sheet: dict) -> str:
    out = _header(sheet) + [""]
    for row in sheet["rows"]:
        if row["type"] == "instrumental":
            out.append("| " + " | ".join(c["name"] for c in row["chords"]) + " |")
            continue
        chord_line = lyric = ""
        chord_end = 0
        for w in row["words"]:
            if lyric and not (_wide(lyric[-1]) and _wide(w["text"][:1])):
                lyric += " "
            pos = _width(lyric)
            for i, c in enumerate(w["chords"]):
                pos = max(pos, chord_end)
                if i == 0:
                    lyric += " " * (pos - _width(lyric))  # push the word right of the previous chord
                chord_line = chord_line.ljust(pos) + c["name"]
                chord_end = pos = len(chord_line) + 1
            lyric += w["text"]
        out += [chord_line, lyric]
    return "\n".join(out)


STYLE = """body{font-family:sans-serif;max-width:60em;margin:2em auto;padding:0 1em}
.row{margin:1em 0}.w{display:inline-block;vertical-align:bottom;margin-right:.4em}
.chord{display:inline-block;border:1px solid #888;border-radius:3px;padding:0 .3em;
margin-right:.2em;font-weight:bold;font-size:.85em}
.w .chord{display:block;width:max-content;margin-bottom:.1em}"""


def render_html(sheet: dict) -> str:
    e = html.escape
    chord = lambda c: f'<span class="chord">{e(c["name"])}</span>'
    body = []
    for row in sheet["rows"]:
        if row["type"] == "instrumental":
            inner = "".join(chord(c) for c in row["chords"])
        else:
            inner = "".join(
                '<span class="w">' + "".join(chord(c) for c in w["chords"]) + e(w["text"]) + "</span>"
                for w in row["words"])
        body.append(f'<div class="row">{inner}</div>')
    return (f'<!DOCTYPE html><html><head><meta charset="utf-8"><title>{e(sheet["title"])}</title>'
            f'<style>{STYLE}</style></head><body><h1>{e(sheet["title"])}</h1>'
            f'<h2>{e(sheet["artist"])}</h2><p><a href="{e(sheet["url"])}">{e(sheet["url"])}</a></p>'
            f'<p>{e(_header(sheet)[3])}</p>{"".join(body)}</body></html>')
