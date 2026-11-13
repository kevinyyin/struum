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
    if bass:
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
        changes = [(min(beats, key=lambda b: abs(b - t)), n) for t, n in changes]
        gap = _gap(beats)
        nxt = [t for t, _ in changes[1:]] + [float("inf")]
        changes = [c for c, end in zip(changes, nxt) if end - c[0] >= 2 * gap]
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
