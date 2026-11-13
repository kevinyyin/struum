import sheet

def test_guitar_name():
    assert sheet.guitar_name("C:maj") == "C"
    assert sheet.guitar_name("A:min") == "Am"
    assert sheet.guitar_name("A:min7") == "Am7"
    assert sheet.guitar_name("G:7") == "G7"
    assert sheet.guitar_name("F:maj7") == "Fmaj7"
    assert sheet.guitar_name("D:sus4") == "Dsus4"
    assert sheet.guitar_name("B:hdim7") == "Bm7b5"
    assert sheet.guitar_name("C:maj/3") == "C/E"
    assert sheet.guitar_name("A:min/b3") == "Am/C"
    assert sheet.guitar_name("G:maj/5") == "G/D"
    assert sheet.guitar_name("N") is None
    assert sheet.guitar_name("X") is None

def test_guitar_name_unknown_quality_does_not_raise():
    assert sheet.guitar_name("C:weird13") == "Cweird13"

def test_clean_chords_snaps_merges_and_drops_short():
    beats = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
    segs = [
        {"start_time": 0.03, "end_time": 1.98, "chord": "C:maj"},
        {"start_time": 1.98, "end_time": 2.45, "chord": "D:min"},   # one beat: junk
        {"start_time": 2.45, "end_time": 3.02, "chord": "C:maj"},   # same as before junk
        {"start_time": 3.02, "end_time": 4.0, "chord": "G:maj"},
    ]
    assert sheet.clean_chords(segs, beats) == [
        {"time": 0.0, "name": "C"}, {"time": 3.0, "name": "G"}]

def test_clean_chords_no_beats_keeps_raw_times():
    segs = [{"start_time": 0.2, "end_time": 5.0, "chord": "E:min"}]
    assert sheet.clean_chords(segs, []) == [{"time": 0.2, "name": "Em"}]

def test_tempo():
    beats = [i * 0.5 for i in range(16)]
    assert sheet.tempo(beats, beats[::4]) == (120.0, 4)
    assert sheet.tempo(beats, beats[::3]) == (120.0, 3)
    assert sheet.tempo([], []) == (0.0, 4)

def test_suggest_strum():
    assert sheet.suggest_strum(70, 4) == "D  D U  U D U"
    assert sheet.suggest_strum(120, 4) == "D  D U  U D U (eighths)"
    assert sheet.suggest_strum(160, 4) == "D  D  D U"
    assert sheet.suggest_strum(100, 3) == "D  D U  D U"
    assert sheet.suggest_strum(100, 7) == "D on every beat"

def test_guitar_name_outside_tables_does_not_raise():
    assert sheet.guitar_name("C:maj/#4") == "C"
    assert sheet.guitar_name("C:maj/9") == "C"
    assert sheet.guitar_name("E#:maj/3") == "E#"

def test_clean_chords_keeps_two_beat_chords():
    beats = [0.1 * i for i in range(9)]
    segs = [{"start_time": beats[i], "end_time": beats[i + 2], "chord": c}
            for i, c in [(0, "C:maj"), (2, "G:maj"), (4, "A:min")]]
    assert [c["name"] for c in sheet.clean_chords(segs, beats)] == ["C", "G", "Am"]

LINE = {"start": 10.0, "end": 14.0, "words": [
    {"text": "When", "start": 10.0, "end": 10.4},
    {"text": "I", "start": 10.5, "end": 10.6},
    {"text": "find", "start": 11.0, "end": 11.5},
    {"text": "myself", "start": 12.0, "end": 12.8}]}

def test_build_rows_places_on_nearest_word_and_carries_chord_in():
    changes = [{"time": 0.0, "name": "C"}, {"time": 4.0, "name": "G"},
               {"time": 11.9, "name": "Am"}]
    rows = sheet.build_rows([LINE], changes, 20.0)
    assert [r["type"] for r in rows] == ["instrumental", "lyrics"]
    assert rows[0]["chords"] == [{"name": "C", "time": 0.0}, {"name": "G", "time": 4.0}]
    words = rows[1]["words"]
    assert words[0]["chords"] == [{"name": "G", "time": 10.0}]   # sounding chord repeated at line start
    assert words[3]["chords"] == [{"name": "Am", "time": 11.9}]
    assert words[1]["chords"] == [] and words[2]["chords"] == []

def test_build_rows_two_changes_on_one_word_both_kept_in_order():
    changes = [{"time": 11.9, "name": "Am"}, {"time": 12.3, "name": "F"}]
    words = sheet.build_rows([LINE], changes, 20.0)[0]["words"]
    assert [c["name"] for c in words[3]["chords"]] == ["Am", "F"]

def test_build_rows_no_lyrics_gives_chord_only_rows():
    changes = [{"time": float(i * 4), "name": n} for i, n in enumerate("CGAF" * 3)]
    rows = sheet.build_rows([], changes, 48.0)
    assert rows and all(r["type"] == "instrumental" for r in rows)
    assert sum(len(r["chords"]) for r in rows) == 12
    assert all(len(r["chords"]) <= 8 for r in rows)

def _sheet(rows):
    return {"title": "T", "artist": "A", "url": "https://youtu.be/x", "bpm": 120.0,
            "beats_per_bar": 4, "strum": "D  D U  U D U (eighths)", "rows": rows}

def test_render_txt_chord_starts_above_its_word():
    rows = sheet.build_rows([LINE], [{"time": 10.0, "name": "C"},
                                     {"time": 11.9, "name": "Am"}], 20.0)
    chord_row, lyric_row = sheet.render_txt(_sheet(rows)).splitlines()[-2:]
    assert lyric_row == "When I find myself"
    assert chord_row.index("C") == 0
    assert chord_row.index("Am") == lyric_row.index("myself")

def test_render_txt_long_chords_never_overlap():
    line = {"start": 0.0, "end": 2.0, "words": [
        {"text": "a", "start": 0.0, "end": 0.5}, {"text": "b", "start": 1.0, "end": 1.5}]}
    rows = sheet.build_rows([line], [{"time": 0.0, "name": "F#m7b5"},
                                     {"time": 1.0, "name": "Bbmaj7"}], 2.0)
    chord_row, lyric_row = sheet.render_txt(_sheet(rows)).splitlines()[-2:]
    assert "F#m7b5 Bbmaj7" in chord_row
    assert chord_row.index("Bbmaj7") == lyric_row.index("b")

def test_render_txt_chinese_no_spaces_and_double_width():
    line = {"start": 0.0, "end": 2.0, "words": [
        {"text": c, "start": i * 0.5, "end": i * 0.5 + 0.4} for i, c in enumerate("故事的小")]}
    rows = sheet.build_rows([line], [{"time": 0.0, "name": "G"},
                                     {"time": 1.0, "name": "D"}], 2.0)
    chord_row, lyric_row = sheet.render_txt(_sheet(rows)).splitlines()[-2:]
    assert lyric_row == "故事的小"
    assert chord_row.index("D") == 4          # two characters, two columns each

def test_render_html_escapes_and_stacks():
    line = {"start": 0.0, "end": 1.0, "words": [{"text": "<b>", "start": 0.0, "end": 0.5}]}
    rows = sheet.build_rows([line], [{"time": 0.0, "name": "C"}], 1.0)
    html = sheet.render_html(_sheet(rows))
    assert "&lt;b&gt;" in html and "<b>" not in html
    assert 'class="chord"' in html and "T" in html and "https://youtu.be/x" in html

def test_build_rows_each_chord_only_change_appears_once_in_its_gap():
    def ln(a, b):
        return {"start": a, "end": b, "words": [{"text": "x", "start": a, "end": b}]}
    names = "CGFD"
    changes = [{"time": t, "name": n} for t, n in zip([0.0, 5.0, 20.0, 40.0], names)]
    rows = sheet.build_rows([ln(2.0, 3.0), ln(10.0, 11.0), ln(30.0, 31.0)], changes, 50.0)
    assert [r["type"] for r in rows] == [
        "instrumental", "lyrics", "instrumental", "lyrics", "instrumental", "lyrics", "instrumental"]
    assert [[c["name"] for c in r["chords"]] for r in rows if r["type"] == "instrumental"] == [
        ["C"], ["G"], ["F"], ["D"]]

def test_tempo_half_bar_downbeats_report_four():
    beats = [i * 0.5 for i in range(16)]
    assert sheet.tempo(beats, beats[::2]) == (120.0, 4)   # beat-this marks half-bars on slow 4/4

def test_clean_chords_keeps_chord_over_missed_beat():
    beats = [0.0, 0.5, 1.0, 2.0, 2.5, 3.0, 3.5]           # the beat at 1.5 was missed
    segs = [{"start_time": 0.0, "end_time": 1.0, "chord": "C:maj"},
            {"start_time": 1.0, "end_time": 2.0, "chord": "G:maj"},   # two beats long, one tracked
            {"start_time": 2.0, "end_time": 3.5, "chord": "A:min"}]
    assert sheet.clean_chords(segs, beats) == [
        {"time": 0.0, "name": "C"}, {"time": 1.0, "name": "G"}, {"time": 2.0, "name": "Am"}]
