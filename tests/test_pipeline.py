import pytest, pipeline

@pytest.mark.parametrize("url", [
    "https://www.youtube.com/watch?v=QDYfEBY9NM4",
    "https://youtu.be/QDYfEBY9NM4?si=abc",
    "https://music.youtube.com/watch?v=QDYfEBY9NM4&list=PL123",
    "https://www.youtube.com/shorts/QDYfEBY9NM4"])
def test_video_id_from_url(url):
    assert pipeline.video_id_from_url(url) == "QDYfEBY9NM4"

@pytest.mark.parametrize("url", [
    "https://example.com/watch?v=QDYfEBY9NM4", "not a url", "",
    "https://www.youtube.com/playlist?list=PL123", "file:///etc/passwd"])
def test_video_id_from_url_rejects(url):
    with pytest.raises(pipeline.PipelineError):
        pipeline.video_id_from_url(url)

def test_pick_video_prefers_length_match():
    c = [{"id": "live", "duration": 421, "title": "x"}, {"id": "album", "duration": 243, "title": "y"}]
    assert pipeline.pick_video(c, 240.0)["id"] == "album"
    assert pipeline.pick_video(c, 100.0)["id"] == "live"      # nothing within 10 s: first
    assert pipeline.pick_video(c, None)["id"] == "live"
    with pytest.raises(pipeline.PipelineError):
        pipeline.pick_video([], 240.0)

def test_parse_lrc():
    text = "[ar:Someone]\n[00:12.50]Hello there\n[01:02.03]Second line\n[01:10.00]\n"
    assert pipeline.parse_lrc(text) == [
        {"start": 12.5, "text": "Hello there"}, {"start": 62.03, "text": "Second line"}]

def test_fill_word_times_interpolates_missing():
    words = [{"text": "a", "start": 1.0, "end": 1.2}, {"text": "24"}, {"text": "b", "start": 3.0, "end": 3.2}]
    out = pipeline.fill_word_times(words, 0.0, 4.0)
    assert out[1]["start"] == pytest.approx(2.0)
    none = pipeline.fill_word_times([{"text": "x"}, {"text": "y"}], 10.0, 12.0)
    assert [w["start"] for w in none] == pytest.approx([10.0, 11.0])

def test_lyric_offset_finds_global_shift():
    import numpy as np
    rate, starts = 100, [5.0, 9.0, 14.0, 20.0, 27.0, 31.0]
    env = np.zeros(40 * rate)
    for s in starts:                                   # vocals enter 1.8 s after each LRC line start
        a = int((s + 1.8) * rate)
        env[a:a + 2 * rate] = 1.0
    assert pipeline.lyric_offset(starts, env, rate) == pytest.approx(1.8, abs=0.05)
    assert pipeline.lyric_offset([s + 3.0 for s in starts], env, rate) == pytest.approx(-1.2, abs=0.05)
    assert pipeline.lyric_offset(starts, np.ones(40 * rate), rate) == 0.0      # no clear signal
    noise = np.random.default_rng(0).random(40 * rate)
    assert pipeline.lyric_offset(starts, noise, rate) == 0.0

def test_run_rejects_long_video(monkeypatch, tmp_path):
    monkeypatch.setattr(pipeline, "DATA", tmp_path)
    monkeypatch.setattr(pipeline, "video_info",
                        lambda vid: {"id": vid, "duration": 3600, "title": "mix", "artist": None, "track": None})
    with pytest.raises(pipeline.PipelineError, match="15 minutes"):
        pipeline.run({"url": "https://youtu.be/QDYfEBY9NM4"}, lambda i, s: None)
    assert not (pipeline.DATA / "QDYfEBY9NM4").exists()

def test_parse_lrc_drops_leading_title_and_credit_lines():
    text = ("[00:00.18]周杰伦 - 晴天\n[00:01.52]词：周杰伦\n[00:02.64]曲：周杰伦\n"
            "[00:29.39]故事的小黄花\n[00:32.64]从出生那年就飘着\n[01:00.00]他说：再见\n[01:05.00]A - B\n")
    assert [l["text"] for l in pipeline.parse_lrc(text)] == [
        "故事的小黄花", "从出生那年就飘着", "他说：再见", "A - B"]   # later lines are untouched

def test_join_letters_regroups_latin_in_zh_alignment():
    text = "我爱 you，ReSo 宝贝"
    chars = [c for c in text if c != " "]
    words = [{"text": c, "start": float(i), "end": i + 0.5} for i, c in enumerate(chars)]
    words[2]["start"] = None                                        # "y" not aligned: take the next start
    out = pipeline.join_letters(words, text)
    assert [w["text"] for w in out] == ["我", "爱", "you，ReSo", "宝", "贝"]
    assert (out[2]["start"], out[2]["end"]) == (3.0, 9.5)
    assert pipeline.join_letters(words[:-1], text) == words[:-1]    # counts differ: unchanged
    merged = [{"text": "ab", "start": 0.0, "end": 1.0}]
    assert pipeline.join_letters(merged, "ab") == merged               # already multi-char: unchanged

def test_fetch_lyrics_searches_when_get_is_unsynced_or_wrong_length(monkeypatch):
    import httpx
    lrc = "[00:01.00]hello"
    seen = []

    def handler(req):
        seen.append((req.url.path, req.headers["user-agent"]))
        if req.url.path == "/api/get":
            return httpx.Response(200, json={"duration": 200, "syncedLyrics": None})
        return httpx.Response(200, json=[{"duration": 300, "syncedLyrics": lrc},
                                         {"duration": 205, "syncedLyrics": lrc}])
    real = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    assert pipeline.fetch_lyrics("A", "T", 200.0) == [{"start": 1.0, "text": "hello"}]
    assert seen == [("/api/get", "chord-sheet-app"), ("/api/search", "chord-sheet-app")]


VID = "QDYfEBY9NM4"


def fake_models(monkeypatch, tmp_path, title="T"):
    """Everything run() calls that needs the network or a model, replaced by instant fakes."""
    monkeypatch.setattr(pipeline, "DATA", tmp_path)
    monkeypatch.setattr(pipeline, "video_info", lambda vid: {"duration": 10, "title": title, "artist": None, "track": None})

    def download(vid, dest):
        (dest / "audio.mp3").write_bytes(b"new audio")
        return dest / "audio.mp3"

    def separate(audio, dest, alive=lambda: None):
        (dest / "htdemucs").mkdir()
        return dest / "vocals.wav", dest / "no_vocals.wav"

    beats = [i * 0.5 for i in range(20)]
    line = {"start": 0.5, "end": 3.0, "words": [{"text": "hi", "start": 0.5, "end": 1.0}]}
    monkeypatch.setattr(pipeline, "download", download)
    monkeypatch.setattr(pipeline, "separate", separate)
    monkeypatch.setattr(pipeline, "detect_chords", lambda f: [])
    monkeypatch.setattr(pipeline, "detect_beats", lambda f: (beats, beats[::4]))
    monkeypatch.setattr(pipeline, "fetch_lyrics", lambda artist, title, duration: None)
    monkeypatch.setattr(pipeline, "word_times", lambda vocals, lrc: ([line], "en"))


def old_song(tmp_path):
    import json
    (tmp_path / VID).mkdir()
    (tmp_path / VID / "sheet.json").write_text(json.dumps({"video_id": VID, "title": "Old", "artist": "A", "rows": []}))
    (tmp_path / VID / "audio.mp3").write_bytes(b"old audio")


def test_run_returns_a_saved_sheet_unless_forced(monkeypatch, tmp_path):
    import json
    fake_models(monkeypatch, tmp_path)
    old_song(tmp_path)
    url = {"url": "https://youtu.be/" + VID}
    assert pipeline.run(url, lambda i, s: None)["title"] == "Old"
    doc = pipeline.run(url | {"artist": "A", "title": "Kept", "force": True}, lambda i, s: None)
    assert (doc["title"], doc["artist"], doc["video_id"]) == ("Kept", "A", VID)  # the names it had, not the video's
    assert json.loads((tmp_path / VID / "sheet.json").read_text()) == doc
    assert (tmp_path / VID / "audio.mp3").read_bytes() == b"new audio"
    assert json.loads((tmp_path / "trash" / VID / "sheet.json").read_text())["title"] == "Old"  # the old one is kept
    assert sorted(p.name for p in tmp_path.iterdir()) == [VID, "trash"]  # no temp folder left


def test_a_failed_or_cancelled_remake_leaves_the_old_sheet(monkeypatch, tmp_path):
    import json
    fake_models(monkeypatch, tmp_path)
    old_song(tmp_path)
    forced = {"url": "https://youtu.be/" + VID, "artist": "A", "title": "Old", "force": True}

    def cancel_at_chords(i, step):
        if i == 2:
            raise pipeline.Cancelled

    with pytest.raises(pipeline.Cancelled):
        pipeline.run(forced, cancel_at_chords)
    monkeypatch.setattr(pipeline, "detect_chords", lambda f: 1 / 0)
    with pytest.raises(ZeroDivisionError):
        pipeline.run(forced, lambda i, s: None)
    assert json.loads((tmp_path / VID / "sheet.json").read_text())["title"] == "Old"
    assert (tmp_path / VID / "audio.mp3").read_bytes() == b"old audio"
    assert [p.name for p in tmp_path.iterdir()] == [VID]  # temp folders removed, nothing trashed


def test_separate_stops_demucs_when_cancelled(monkeypatch, tmp_path):
    import os, sys
    fake = tmp_path / "python"  # stands in for "python -m demucs": records its pid, then hangs
    fake.write_text(f"#!/bin/sh\necho $$ > {tmp_path}/pid\nexec sleep 60\n")
    fake.chmod(0o755)
    monkeypatch.setattr(sys, "executable", str(fake))

    def cancel():
        raise pipeline.Cancelled

    with pytest.raises(pipeline.Cancelled):
        pipeline.separate(tmp_path / "audio.mp3", tmp_path, cancel)
    with pytest.raises(ProcessLookupError):
        os.kill(int((tmp_path / "pid").read_text()), 0)
