import json
import logging
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


def sync(video_id: str) -> None:
    """Upload a finished song to the hosted copy's Blob store, when one is set up (see README)."""
    if not os.environ.get("BLOB_READ_WRITE_TOKEN"):
        return
    node = shutil.which("node")
    if not node:
        log.warning("sync skipped: node not found on PATH")
        return
    try:
        subprocess.Popen([node, str(ROOT / "scripts" / "sync.mjs"), video_id], cwd=ROOT)
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
        job["step_name"], job["step"] = name, i

    sheet, error = make(request, progress)
    # Release before publishing the terminal state so a client that sees it can POST again;
    # status is written last so a poll never sees "done"/"error" with sheet/error still unset.
    busy.release()
    job["sheet"], job["error"] = sheet, error
    job["status"] = "error" if error else "done"
    if isinstance(sheet, dict) and sheet.get("video_id"):  # after publishing: an upload can never hold up the job
        sync(sheet["video_id"])


# The website's queue (see README "Hosted copy"). Checks cost Blob reads, which the free plan caps at
# 10,000 a month: every 3 minutes, at most 200 a day, keeps the worst case near 6,000.
QUEUE_EVERY, QUEUE_SOON, QUEUE_PER_DAY = 180, 15, 200


def node_script(*args: str, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run([shutil.which("node") or "node", str(ROOT / "scripts" / args[0]), *args[1:]],
                          cwd=ROOT, capture_output=True, text=True, timeout=timeout)


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
        log.info("making %s - %s for the website", item["artist"], item["title"])
        sheet, error = make({k: item[k] for k in ("artist", "title", "duration")}, lambda i, name: None)
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
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/api/config")
def config():
    return {"spotify_client_id": os.environ.get("SPOTIFY_CLIENT_ID", ""), "can_make": True}


@app.post("/api/songs")
def create(body: ByUrl | ByTitle):
    if not busy.acquire(blocking=False):
        raise HTTPException(409, "Another song is still processing.")
    job = {"status": "running", "step": 0, "step_name": pipeline.STEPS[0],
           "steps": len(pipeline.STEPS), "error": None, "sheet": None}
    job_id = uuid4().hex
    jobs[job_id] = job
    try:
        threading.Thread(target=work, args=(job, body.model_dump()), daemon=True).start()
    except BaseException:
        busy.release()
        raise
    return {"id": job_id}


@app.get("/api/songs/{job_id}")
def status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Unknown song.")
    return jobs[job_id]


@app.get("/api/library")
def library():
    """Saved sheets, newest first, without their rows."""
    songs = []
    for f in pipeline.DATA.glob("*/sheet.json"):
        try:
            s = json.loads(f.read_text())
        except (OSError, ValueError):
            continue
        if f.parent.name != s.get("video_id"):  # a job's temp folder, not a finished song
            continue
        made = s.get("made") or f.stat().st_mtime  # older sheets have no "made": use the file time
        songs.append({k: s.get(k) for k in ("video_id", "title", "artist", "duration")} | {"made": made})
    return sorted(songs, key=lambda s: -s["made"])


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


pipeline.DATA.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/data", StaticFiles(directory=pipeline.DATA), name="data")
