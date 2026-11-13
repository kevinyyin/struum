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


def test_queue_step_makes_uploads_and_reports(monkeypatch):
    import subprocess as sp
    calls, nxt = [], ['{"id": "q1", "artist": "Clairo", "title": "Sofia", "duration": 188}']

    def fake_node(*args, timeout=120):
        calls.append(args)
        return sp.CompletedProcess(args, 0, nxt[0] if args[:2] == ("queue.mjs", "next") else "", "")

    monkeypatch.setattr(app_module, "node_script", fake_node)
    seen = []
    monkeypatch.setattr(pipeline, "run", lambda request, progress: seen.append(request) or {"video_id": "abcdefghijk", "rows": []})
    assert app_module.serve_queue_once() == "made"
    assert seen == [{"artist": "Clairo", "title": "Sofia", "duration": 188}]
    assert calls == [("queue.mjs", "next"), ("sync.mjs", "abcdefghijk"), ("queue.mjs", "finish", "q1", "done", "abcdefghijk")]

    calls.clear()
    monkeypatch.setattr(pipeline, "run", lambda r, p: (_ for _ in ()).throw(pipeline.PipelineError("No YouTube match.")))
    assert app_module.serve_queue_once() == "made"
    assert calls[-1] == ("queue.mjs", "finish", "q1", "failed", "No YouTube match.")

    calls.clear()
    nxt[0] = "null"
    assert app_module.serve_queue_once() == "empty" and calls == [("queue.mjs", "next")]

    calls.clear()
    assert app_module.busy.acquire(blocking=False)
    try:
        assert app_module.serve_queue_once() == "busy" and calls == []  # a local song is being made: no check spent
    finally:
        app_module.busy.release()


def test_playlists_round_trip_through_the_local_file(monkeypatch, tmp_path):
    monkeypatch.delenv("BLOB_READ_WRITE_TOKEN", raising=False)
    monkeypatch.setenv("STRUM_PLAYLISTS_FILE", str(tmp_path / "playlists.json"))
    first = client.get("/api/playlists").json()
    assert first == {"playlists": [], "etag": None}
    lists = [{"id": "p1", "name": " Warm-up ", "songs": ["CGj85pVzRJs", "CGj85pVzRJs", "3-DteAHyRnI"]}]
    saved = client.put("/api/playlists", json={"playlists": lists, "etag": first["etag"]})
    assert saved.status_code == 200
    again = client.get("/api/playlists").json()
    assert again["playlists"] == [{"id": "p1", "name": "Warm-up", "songs": ["CGj85pVzRJs", "3-DteAHyRnI"]}]
    assert again["etag"] == saved.json()["etag"]
    # a stale version is refused instead of overwriting the newer one
    assert client.put("/api/playlists", json={"playlists": [], "etag": "stale"}).status_code == 409
    assert client.put("/api/playlists", json={"playlists": [{"id": "p1", "name": "x", "songs": ["../../etc"]}],
                                              "etag": again["etag"]}).status_code == 422
    assert client.get("/api/playlists").json()["playlists"][0]["name"] == "Warm-up"


def test_chord_edits_rewrite_the_sheet_files(monkeypatch, tmp_path):
    import json
    monkeypatch.delenv("BLOB_READ_WRITE_TOKEN", raising=False)
    monkeypatch.setattr(pipeline, "DATA", tmp_path)
    vid = "abcdefghijk"
    (tmp_path / vid).mkdir()
    doc = {"video_id": vid, "url": "https://www.youtube.com/watch?v=" + vid, "title": "T", "artist": "A", "duration": 10,
           "bpm": 100, "beats_per_bar": 4, "strum": "D", "language": "en", "rows": [
               {"type": "lyrics", "start": 1.0, "end": 3.0, "words": [
                   {"text": "My", "start": 1.0, "chords": [{"name": "G", "time": 1.0}]},
                   {"text": "friends", "start": 1.5, "chords": []}]}]}
    (tmp_path / vid / "sheet.json").write_text(json.dumps(doc))
    r = client.put(f"/api/songs/{vid}/chords", json={"ops": [{"row": 0, "word": 1, "names": ["C"]}]})
    assert r.status_code == 200
    saved = json.loads((tmp_path / vid / "sheet.json").read_text())
    assert saved["rows"][0]["words"][1]["chords"] == [{"name": "C", "time": 1.5}]
    assert "C" in (tmp_path / vid / "sheet.txt").read_text() and (tmp_path / vid / "sheet.html").is_file()
    assert client.put(f"/api/songs/{vid}/chords", json={"ops": [{"row": 0, "word": 0, "names": ["<x>"]}]}).status_code == 422
    assert client.put("/api/songs/..%2Fetc/chords", json={"ops": []}).status_code == 404
    assert client.put("/api/songs/zzzzzzzzzzz/chords", json={"ops": []}).status_code == 404


def test_queue_pulls_a_sheet_edited_on_the_website(monkeypatch, tmp_path):
    import json, subprocess as sp
    monkeypatch.setattr(pipeline, "DATA", tmp_path)
    vid = "abcdefghijk"
    (tmp_path / vid).mkdir()
    edited = {"video_id": vid, "url": "u", "title": "T", "artist": "A", "bpm": 90, "beats_per_bar": 4, "strum": "D",
              "language": "en", "rows": []}
    calls = []

    def fake_node(*args, timeout=120, stdin=None):
        calls.append(args)
        if args[:2] == ("queue.mjs", "next"):
            return sp.CompletedProcess(args, 0, json.dumps({"id": "q2", "type": "pull", "video_id": vid}), "")
        if args[:2] == ("edit.mjs", "pull"):
            return sp.CompletedProcess(args, 0, json.dumps(edited), "")
        return sp.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(app_module, "node_script", fake_node)
    assert app_module.serve_queue_once() == "made"
    assert json.loads((tmp_path / vid / "sheet.json").read_text()) == edited
    assert calls[-2:] == [("sync.mjs", "--sheet", vid), ("queue.mjs", "finish", "q2", "done", vid)]
