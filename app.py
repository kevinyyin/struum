import json
import logging
import os
import shutil
import subprocess
import threading
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


def work(job: dict, request: dict) -> None:
    def progress(i: int, name: str) -> None:
        job["step_name"], job["step"] = name, i

    sheet = error = None
    try:
        sheet = pipeline.run(request, progress)
    except pipeline.PipelineError as e:
        error = str(e)
    except Exception:
        # raw model/OS text must not reach the user
        log.exception("job failed")
        error = "Something went wrong while processing this song."
    # Release before publishing the terminal state so a client that sees it can POST again;
    # status is written last so a poll never sees "done"/"error" with sheet/error still unset.
    busy.release()
    job["sheet"], job["error"] = sheet, error
    job["status"] = "error" if error else "done"
    if isinstance(sheet, dict) and sheet.get("video_id"):  # after publishing: an upload can never hold up the job
        sync(sheet["video_id"])


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
        songs.append({k: s.get(k) for k in ("video_id", "title", "artist", "duration")} | {"made": f.stat().st_mtime})
    return sorted(songs, key=lambda s: -s["made"])


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


pipeline.DATA.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/data", StaticFiles(directory=pipeline.DATA), name="data")
