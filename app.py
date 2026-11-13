import logging
import os
import threading
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import pipeline

STATIC = Path(__file__).parent / "static"
log = logging.getLogger("uvicorn.error")
app = FastAPI()
jobs: dict[str, dict] = {}
busy = threading.Lock()  # held for the whole life of a job


class ByUrl(BaseModel):
    url: str


class ByTitle(BaseModel):
    artist: str
    title: str
    duration: float


def work(job: dict, request: dict) -> None:
    def progress(i: int, name: str) -> None:
        job["step"], job["step_name"] = i, name

    try:
        job["sheet"] = pipeline.run(request, progress)
        job["status"] = "done"
    except pipeline.PipelineError as e:
        job["status"], job["error"] = "error", str(e)
    except Exception:
        # raw model/OS text must not reach the user
        log.exception("job failed")
        job["status"], job["error"] = "error", "Something went wrong while processing this song."
    finally:
        busy.release()


@app.get("/api/config")
def config():
    return {"spotify_client_id": os.environ.get("SPOTIFY_CLIENT_ID", "")}


@app.post("/api/songs")
def create(body: ByUrl | ByTitle):
    if not busy.acquire(blocking=False):
        raise HTTPException(409, "Another song is still processing.")
    job = {"status": "running", "step": 0, "step_name": pipeline.STEPS[0],
           "steps": len(pipeline.STEPS), "error": None, "sheet": None}
    job_id = uuid4().hex
    jobs[job_id] = job
    threading.Thread(target=work, args=(job, body.model_dump()), daemon=True).start()
    return {"id": job_id}


@app.get("/api/songs/{job_id}")
def status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Unknown song.")
    return jobs[job_id]


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


pipeline.DATA.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/data", StaticFiles(directory=pipeline.DATA), name="data")
