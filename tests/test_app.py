import threading
import time

import pytest
from fastapi.testclient import TestClient

import app as app_module
import pipeline

client = TestClient(app_module.app)
SONG = {"url": "https://youtu.be/abc"}


def wait_done(job_id):
    for _ in range(200):
        body = client.get(f"/api/songs/{job_id}").json()
        if body["status"] != "running":
            return body
        time.sleep(0.01)
    raise AssertionError("job never finished")


def start(monkeypatch, fake):
    monkeypatch.setattr(pipeline, "run", fake)
    return client.post("/api/songs", json=SONG).json()["id"]


def test_done_with_sheet(monkeypatch):
    def fake(request, progress):
        progress(1, "Separating stems")
        return {"video_id": "abc", "rows": []}

    body = wait_done(start(monkeypatch, fake))
    assert body["status"] == "done"
    assert body["sheet"] == {"video_id": "abc", "rows": []}
    assert body["steps"] == len(pipeline.STEPS)
    assert body["error"] is None


def test_pipeline_error_shown(monkeypatch):
    def fake(request, progress):
        raise pipeline.PipelineError("No match found.")

    body = wait_done(start(monkeypatch, fake))
    assert body["status"] == "error"
    assert body["error"] == "No match found."


def test_unexpected_error_hidden(monkeypatch):
    def fake(request, progress):
        raise RuntimeError("boom")

    body = wait_done(start(monkeypatch, fake))
    assert body["error"] == "Something went wrong while processing this song."


def test_second_post_conflicts_while_running(monkeypatch):
    gate = threading.Event()
    try:
        job_id = start(monkeypatch, lambda request, progress: gate.wait(5) or {})
        r = client.post("/api/songs", json=SONG)
        assert r.status_code == 409
        assert r.json() == {"detail": "Another song is still processing."}
    finally:
        gate.set()
    wait_done(job_id)


@pytest.mark.parametrize("body", [
    {"nope": 1},
    {"artist": "a", "title": "t"},
    {"url": 5},
    {"url": "x", "foo": 1},
    {"url": "x", "artist": "a", "title": "t", "duration": 1},
])
def test_bad_body(body):
    assert client.post("/api/songs", json=body).status_code == 422


def test_artist_title_duration_accepted(monkeypatch):
    seen = {}

    def fake(request, progress):
        seen.update(request)
        return {}

    monkeypatch.setattr(pipeline, "run", fake)
    job_id = client.post("/api/songs", json={"artist": "a", "title": "t", "duration": 200}).json()["id"]
    wait_done(job_id)
    assert seen == {"artist": "a", "title": "t", "duration": 200}


def test_unknown_job():
    assert client.get("/api/songs/unknown").status_code == 404


def test_config(monkeypatch):
    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "xyz")
    assert client.get("/api/config").json() == {"spotify_client_id": "xyz", "can_make": True}
    monkeypatch.delenv("SPOTIFY_CLIENT_ID")
    assert client.get("/api/config").json() == {"spotify_client_id": "", "can_make": True}


def test_index():
    assert "Strum" in client.get("/").text


def test_post_right_after_done_is_not_409(monkeypatch):
    monkeypatch.setattr(pipeline, "run", lambda request, progress: {})
    for _ in range(50):
        r = client.post("/api/songs", json=SONG)
        assert r.status_code == 200
        wait_done(r.json()["id"])
        assert client.post("/api/songs", json=SONG).status_code == 200  # lock already free
        time.sleep(0.02)


def test_library_lists_finished_songs_newest_first(monkeypatch, tmp_path):
    import json, os
    monkeypatch.setattr(pipeline, "DATA", tmp_path)
    for vid, t in (("old", 1), ("new", 2)):
        (tmp_path / vid).mkdir()
        (tmp_path / vid / "sheet.json").write_text(json.dumps({"video_id": vid, "title": vid.upper(), "artist": "A", "duration": 9, "rows": [1]}))
        os.utime(tmp_path / vid / "sheet.json", (t, t))
    (tmp_path / "tmpx").mkdir()  # a job still writing: folder name is not its video id
    (tmp_path / "tmpx" / "sheet.json").write_text(json.dumps({"video_id": "zzz"}))
    (tmp_path / "bad").mkdir()
    (tmp_path / "bad" / "sheet.json").write_text("{")
    songs = client.get("/api/library").json()
    assert [s["video_id"] for s in songs] == ["new", "old"]
    # a recorded "made" wins over the file time, so rewriting a sheet does not reorder the library
    (tmp_path / "old" / "sheet.json").write_text(json.dumps({"video_id": "old", "title": "OLD", "made": 99}))
    assert [s["video_id"] for s in client.get("/api/library").json()] == ["old", "new"]
    assert songs[0] == {"video_id": "new", "title": "NEW", "artist": "A", "duration": 9, "made": 2}


def test_page_files_are_revalidated():
    assert client.get("/").headers["cache-control"] == "no-cache"
    assert client.get("/static/app.js").headers["cache-control"] == "no-cache"


def test_finished_song_syncs_only_with_a_blob_token(monkeypatch):
    calls = []
    monkeypatch.setattr(app_module.subprocess, "Popen", lambda args, **kw: calls.append(args))
    monkeypatch.delenv("BLOB_READ_WRITE_TOKEN", raising=False)
    wait_done(start(monkeypatch, lambda request, progress: {"video_id": "abcdefghijk", "rows": []}))
    assert calls == []
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "x")
    wait_done(start(monkeypatch, lambda request, progress: {"video_id": "abcdefghijk", "rows": []}))
    for _ in range(100):
        if calls:
            break
        time.sleep(0.01)
    assert calls and calls[0][-2:] == [str(app_module.ROOT / "scripts" / "sync.mjs"), "abcdefghijk"]
    wait_done(start(monkeypatch, lambda request, progress: (_ for _ in ()).throw(pipeline.PipelineError("no"))))
    assert len(calls) == 1  # a failed job uploads nothing
