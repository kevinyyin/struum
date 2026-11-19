import json
import logging
import re
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict

import pipeline
import sheet as sheet_mod

ROOT = Path(__file__).parent
STATIC = ROOT / "static"
log = logging.getLogger("uvicorn.error")
app = FastAPI()
jobs: dict[str, dict] = {}
busy = threading.Lock()  # held for the whole life of a job


class ByUrl(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str


class ByTitle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    artist: str
    title: str
    duration: float
    art: str = ""  # the Spotify cover, shown instead of the video's thumbnail


def sync(*video_ids: str) -> None:
    """Upload these songs (and any the store lacks) and the library index to the hosted copy's Blob store,
    when one is set up (see README)."""
    if not os.environ.get("BLOB_READ_WRITE_TOKEN"):
        return
    node = shutil.which("node")
    if not node:
        log.warning("sync skipped: node not found on PATH")
        return
    try:
        subprocess.Popen([node, str(ROOT / "scripts" / "sync.mjs"), *video_ids], cwd=ROOT)
    except OSError:
        log.exception("sync could not start")


def make(request: dict, progress) -> tuple[dict | None, str | None]:
    """Run the pipeline; returns (sheet, None) or (None, a message fit to show the user)."""
    try:
        return pipeline.run(request, progress), None
    except pipeline.PipelineError as e:
        return None, str(e)
    except Exception:
        # raw model/OS text must not reach the user
        log.exception("job failed")
        return None, "Something went wrong while processing this song."


def work(job: dict, request: dict) -> None:
    def progress(i: int, name: str) -> None:
        if job["cancel"]:  # the pipeline calls this between steps and while demucs runs
            raise pipeline.Cancelled
        job["step_name"], job["step"] = name, i

    cancelled = False
    try:
        sheet, error = make(request, progress)
    except pipeline.Cancelled:  # the pipeline has already removed its temp folder
        sheet, error, cancelled = None, None, True
    # Release before publishing the terminal state so a client that sees it can POST again;
    # status is written last so a poll never sees "done"/"error" with sheet/error still unset.
    busy.release()
    job["sheet"], job["error"] = sheet, error
    job["status"] = "cancelled" if cancelled else "error" if error else "done"
    if isinstance(sheet, dict) and sheet.get("video_id"):  # after publishing: an upload can never hold up the job
        sync(sheet["video_id"])


# The website's queue (see README "Hosted copy"). Checks cost Blob reads, which the free plan caps at
# 10,000 a month: every 3 minutes, at most 200 a day, keeps the worst case near 6,000.
QUEUE_EVERY, QUEUE_SOON, QUEUE_PER_DAY = 180, 15, 200


def node_script(*args: str, timeout: int = 120, stdin: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([shutil.which("node") or "node", str(ROOT / "scripts" / args[0]), *args[1:]],
                          cwd=ROOT, capture_output=True, text=True, timeout=timeout, input=stdin)


def serve_queue_once() -> str:
    """Make one song the website asked for. Returns "busy", "empty" or "made"."""
    if not busy.acquire(blocking=False):
        return "busy"  # a song from this page is being made: no check spent
    try:
        out = node_script("queue.mjs", "next")
        if out.returncode != 0:
            log.warning("queue check failed: %s", out.stderr.strip()[-300:])
            return "empty"
        item = json.loads(out.stdout.strip() or "null")
        if not item:
            return "empty"
        if item.get("type") == "pull":  # chords edited on the website
            pulled = node_script("edit.mjs", "pull", item["video_id"], timeout=60)
            if pulled.returncode == 0 and (pipeline.DATA / item["video_id"]).is_dir():
                save_sheet(json.loads(pulled.stdout))
                node_script("sync.mjs", "--sheet", item["video_id"])
                node_script("queue.mjs", "finish", item["id"], "done", item["video_id"])
            else:
                node_script("queue.mjs", "finish", item["id"], "failed", "Could not fetch the edited sheet.")
            return "made"
        log.info("making %s - %s for the website", item["artist"], item["title"])
        sheet, error = make({k: item[k] for k in ("artist", "title", "duration", "art") if item.get(k)}, lambda i, name: None)
        if sheet:
            node_script("sync.mjs", sheet["video_id"], timeout=900)  # uploaded before the website hears "done"
            node_script("queue.mjs", "finish", item["id"], "done", sheet["video_id"])
        else:
            node_script("queue.mjs", "finish", item["id"], "failed", error)
        return "made"
    finally:
        busy.release()


def queue_loop() -> None:
    day, checks = None, 0
    while True:
        if time.strftime("%Y-%m-%d") != day:
            day, checks = time.strftime("%Y-%m-%d"), 0
        result = "empty"
        if checks < QUEUE_PER_DAY:
            try:
                result = serve_queue_once()
            except Exception:
                log.exception("queue check failed")
            checks += result != "busy"
        time.sleep(QUEUE_SOON if result == "made" else QUEUE_EVERY)


if os.environ.get("BLOB_READ_WRITE_TOKEN") and shutil.which("node"):
    threading.Thread(target=queue_loop, daemon=True).start()


@app.middleware("http")
async def revalidate(request, call_next):
    # The page's own files change with the code; make the browser check instead of reusing a stale copy.
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/") or request.url.path.endswith(("/sheet.json", "/sheet.txt", "/sheet.html")):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/api/config")
def config():
    return {"spotify_client_id": os.environ.get("SPOTIFY_CLIENT_ID", ""), "can_make": True}


def start(request: dict, video_id: str | None = None) -> dict:
    if not busy.acquire(blocking=False):
        raise HTTPException(409, "Another song is still processing.")
    job = {"status": "running", "step": 0, "step_name": pipeline.STEPS[0], "steps": len(pipeline.STEPS),
           "error": None, "sheet": None, "cancel": False, "video_id": video_id}  # video_id: the song being made again
    job_id = uuid4().hex
    jobs[job_id] = job
    try:
        threading.Thread(target=work, args=(job, request), daemon=True).start()
    except BaseException:
        busy.release()
        raise
    return {"id": job_id}


@app.post("/api/songs")
def create(body: ByUrl | ByTitle):
    request = body.model_dump(exclude_unset=True)
    if not ART.fullmatch(request.get("art", "")):
        request.pop("art", None)  # only Spotify's image host: anything else falls back to the video thumbnail
    return start(request)


@app.post("/api/songs/{job_id}/cancel")
def cancel(job_id: str):
    """Ask a running job to stop. It ends as "cancelled" once the step it is in lets go (see pipeline.run)."""
    if job_id not in jobs:
        raise HTTPException(404, "Unknown song.")
    jobs[job_id]["cancel"] = True  # a job that already finished stays as it ended
    return jobs[job_id]


@app.get("/api/songs/{job_id}")
def status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Unknown song.")
    return jobs[job_id]


@app.get("/api/library")
def library():
    """Saved sheets, newest first, without their rows. Deleted songs sit one level down, in data/trash/<id>/."""
    songs = []
    for f in pipeline.DATA.glob("*/sheet.json"):
        try:
            s = json.loads(f.read_text())
        except (OSError, ValueError):
            continue
        if f.parent.name != s.get("video_id"):  # a job's temp folder, not a finished song
            continue
        made = s.get("made") or f.stat().st_mtime  # older sheets have no "made": use the file time
        songs.append({k: s.get(k) for k in ("video_id", "title", "artist", "duration", "art")} | {"made": made})
    return sorted(songs, key=lambda s: -s["made"])


VID = re.compile(r"^[\w-]{6,20}$")
ART = re.compile(r"https://[\w.-]+\.scdn\.co/[^\"'()\\\s]*")  # same rule as api/queue.js


class ChordEdits(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ops: list


def save_sheet(doc: dict) -> None:
    """Write a song's sheet.json, .txt and .html (each replaced whole, never half-written)."""
    folder = pipeline.DATA / doc["video_id"]
    for name, text in (("sheet.json", json.dumps(doc, ensure_ascii=False)),
                       ("sheet.txt", sheet_mod.render_txt(doc)), ("sheet.html", sheet_mod.render_html(doc))):
        tmp = folder / f".{name}.tmp"
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(folder / name)


def saved(video_id: str) -> Path:
    """A finished song's sheet.json, or 404."""
    f = pipeline.DATA / video_id / "sheet.json"
    if not VID.match(video_id) or not f.is_file():
        raise HTTPException(404, "Unknown song.")
    return f


@app.post("/api/songs/{video_id}/remake")
def remake(video_id: str):
    """Make a finished song again from its own video. The old sheet stays until the new one is complete,
    then moves to data/trash/."""
    doc = json.loads(saved(video_id).read_text(encoding="utf-8"))
    return start({"url": pipeline.WATCH + video_id, "artist": doc.get("artist") or "", "title": doc.get("title") or "",
                  "art": doc.get("art") or "", "force": True}, video_id)


@app.delete("/api/songs/{video_id}")
def delete(video_id: str):
    """Move a finished song to data/trash/ and take it out of every playlist."""
    saved(video_id)
    if any(j["status"] == "running" and j["video_id"] == video_id for j in jobs.values()):
        raise HTTPException(409, "This song is being made again. Cancel that first.")
    pipeline.trash(video_id)
    try:  # the song is gone either way; a playlist that still names it just skips it
        got = node_script("playlists.mjs", "get", timeout=30)
        lists = json.loads(got.stdout)
        kept = [p | {"songs": [s for s in p["songs"] if s != video_id]} for p in lists["playlists"]]
        if kept != lists["playlists"]:
            put = node_script("playlists.mjs", "put", lists["etag"] or "-", timeout=30, stdin=json.dumps(kept))
            if put.returncode != 0:
                log.warning("delete: playlists not updated: %s", put.stderr.strip()[-300:])
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        log.exception("delete: playlists not updated")
    sync()  # the website's library index is rewritten without the song; its files stay in the Blob store
    return {"trashed": f"data/trash/{video_id}"}


# Hand edits to a song's chords (rules in api/_edit.js, shared with the website).
@app.put("/api/songs/{video_id}/chords")
def edit_chords(video_id: str, body: ChordEdits):
    f = saved(video_id)
    out = node_script("edit.mjs", "apply", stdin=json.dumps({"sheet": json.loads(f.read_text(encoding="utf-8")), "ops": body.ops}))
    if out.returncode == 2:
        raise HTTPException(422, out.stderr.strip() or "Those chords don't look right.")
    if out.returncode != 0:
        log.warning("edit: %s", out.stderr.strip()[-300:])
        raise HTTPException(502, "Could not save your chords.")
    doc = json.loads(out.stdout)
    save_sheet(doc)
    if os.environ.get("BLOB_READ_WRITE_TOKEN"):
        sync_out = node_script("sync.mjs", "--sheet", video_id)  # the website shows the edit right away
        if sync_out.returncode != 0:
            log.warning("edit sync: %s", sync_out.stderr.strip()[-300:])
    return doc


class Playlists(BaseModel):
    model_config = ConfigDict(extra="forbid")
    playlists: list
    etag: str | None = None


# Playlists are shared with the website through the Blob store (scripts/playlists.mjs; a local file without a token).
@app.get("/api/playlists")
def playlists_get():
    out = node_script("playlists.mjs", "get", timeout=30)
    if out.returncode != 0:
        log.warning("playlists: %s", out.stderr.strip()[-300:])
        raise HTTPException(502, "Could not load your playlists.")
    return json.loads(out.stdout)


@app.put("/api/playlists")
def playlists_put(body: Playlists):
    out = node_script("playlists.mjs", "put", body.etag or "-", timeout=30, stdin=json.dumps(body.playlists))
    if out.returncode == 2:
        raise HTTPException(422, "Those playlists don't look right.")
    if out.returncode == 3:
        raise HTTPException(409, "Your playlists changed somewhere else.")
    if out.returncode != 0:
        log.warning("playlists: %s", out.stderr.strip()[-300:])
        raise HTTPException(502, "Could not save your playlists.")
    return json.loads(out.stdout)


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


pipeline.DATA.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/data", StaticFiles(directory=pipeline.DATA), name="data")
