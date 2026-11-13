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
