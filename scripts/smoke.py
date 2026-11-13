"""Smoke check: python scripts/smoke.py <audio file>. Runs every model once and prints the first 5 results."""
import subprocess, sys, time
from pathlib import Path

src = Path(sys.argv[1]).resolve()
out = src.parent / "smoke_demucs"
t = time.time()


def stage(name):
    global t
    now = time.time()
    if name != "start":
        print(f"  [{name} took {now - t:.1f}s]")
    t = now


def head(x):
    for i in list(x)[:5]:
        print("  ", i)


print("== demucs")
for dev in ("mps", "cpu"):
    r = subprocess.run([sys.executable, "-m", "demucs", "--two-stems", "vocals", "-n", "htdemucs",
                        "-d", dev, "-o", str(out), str(src)], capture_output=True, text=True)
    if r.returncode == 0:
        print("  device used:", dev)
        break
    print(f"  {dev} failed:", r.stderr[-400:])
else:
    sys.exit("demucs failed on mps and cpu")
stems = next(out.glob(f"htdemucs/{src.stem}"))
vocals, no_vocals = next(stems.glob("vocals.*")), next(stems.glob("no_vocals.*"))
print("  stems:", vocals, no_vocals)
stage("demucs")

print("== chords")
from lv_chordia import chord_recognition  # package re-exports the function over the submodule name

chords = chord_recognition(str(no_vocals))
head(chords)
stage("chords")

print("== beats")
from beat_this.inference import File2Beats

beats, downbeats = File2Beats(checkpoint_path="final0", device="cpu", dbn=False)(str(no_vocals))
print("  beats:"); head(beats)
print("  downbeats:"); head(downbeats)
stage("beats")

print("== whisperx align")
import whisperx

audio = whisperx.load_audio(str(vocals))
model, meta = whisperx.load_align_model("en", "cpu")
segs = [{"text": "Let it be let it be", "start": 30.0, "end": 36.0},
        {"text": "Whisper words of wisdom let it be", "start": 36.0, "end": 44.0}]
res = whisperx.align(segs, model, meta, audio, "cpu", return_char_alignments=False)
print("  keys:", list(res.keys()))
head(res["word_segments"])
stage("align")

print("== distinct chord labels:", sorted({c["chord"] for c in chords}))
