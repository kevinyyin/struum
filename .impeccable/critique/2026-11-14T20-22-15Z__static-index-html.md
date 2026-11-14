---
target: everything, third run
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-11-14T20-22-15Z
slug: static-index-html
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent), both fresh and blind to the earlier critiques. The parent checked the diagram, seek and stylesheet claims against source and the chord dataset.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Seeking or drag-looping while paused moves the playhead but not the sheet; capo state is one 11.5px digit |
| 2 | Match System / Real World | 3 | "69.8 BPM" false precision; B, Bm and Cmaj7 drawn with a non-root bass |
| 3 | User Control and Freedom | 2 | No cancel on a one-minute job, no delete or re-make for a song, no undo on playlist changes; one stray arrow clears a multi-line loop |
| 4 | Consistency and Standards | 3 | Space on a focused button plays instead of pressing it; role=menu ignores arrow keys; "Save as…" navigates; native confirm() |
| 5 | Error Prevention | 2 | Cancel asks before discarding chord edits, but a sidebar click, Back or reload discards silently |
| 6 | Recognition Rather Than Recall | 3 | The key legend scrolls away, truncates at 800px and is hidden on touch; multi-line loop gestures live in a tooltip |
| 7 | Flexibility and Efficiency | 3 | Strong key set; nothing for transpose, next song or tabs; no library search |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained; the sidebar and a 301px header stack compete with the sheet; honey is overloaded |
| 9 | Error Recovery | 3 | Messages are plain; the band cannot be dismissed and says "deleted from data/"; unknown routes fail silently |
| 10 | Help and Documentation | 2 | Nothing explains capo vs transpose or what Auto did |
| **Total** | | **27/40** | **Acceptable, at the edge of Good** |

Trend 26, 26, 27. The three heuristics still at 2 (control and freedom, error prevention, help) are about missing capabilities (undo, cancel, delete, guarded navigation, explanations), not defects, and none of the fix rounds added those.

## Design Specificity Verdict

**LLM assessment**: Same verdict as run 2: the interaction design is authored for this product, the visual composition mostly is not. Only a chord sheet timed to audio would have a timeline cut per sung line, the next sung line pre-lit across instrumental rows, exactly one teal chord mirrored by a lit diagram, a playlist that waits for the capo, and a left arrow that restarts the line first. The shell is a tasteful beige version of the standard music-app layout; Library, Playlists and logged-out Spotify could ship in a podcast app unchanged, and the only guitar device is the abalone ring at 17px and 38px. Document tensions: arm's length vs small type is settled by a mode that only starts on play; "nothing else grows" vs needing diagrams at arm's length (56px, about 8px fret number); "the sheet is the product" vs a sidebar that never leaves and a first sheet row 38% down the page; capo moved into the player but Transpose stayed in a row that scrolls away; honey also fills Make sheet, Log in with Spotify and the playlist tile.

**Deterministic scan**: CLI detector degraded again (0 findings, an undercount). In-page detector: 8 flagged elements per desktop view, 7 on phone: ai-color-palette x5 (rosette, owner-pinned: false positive), cream-palette x1 (owner-pinned: false positive), tiny-text x2 (sidebar Spotify note, 11.5px at 3.14:1: keep; key legend, 11.5px at 5.95:1: on-spec). The "Auto" undersize finding from run 2 is gone (now 11px). Extras: text-occlusion x2 while the More menu is open (transient), line-length on the tuner caption (marginal). Measured contrast: playing state all 5.49:1 or better; browsing resting lyrics 3.14:1; "no diagram" text 2.25:1; sidebar note 3.14:1. Player controls on phone: capo buttons 30x30, Auto 37x30, loop 42x42, play 46x46.

**Visual overlays**: Drawn on every scanned view, then removed. None remain.

## Overall Impression

The playing state is now solid: every text colour in it passes, the keys work, the capo is in reach, the diagrams have the right notes. What is left is what surrounds it: the sheet before play, the sheet while paused, the edit mode, and the exits the app never had. The biggest opportunity is to stop tying the readable sheet to the audio.

## What's Working

1. **One idea expressed four ways.** Timeline segment, darkened line, single teal chord and lit, centred diagram all agree, and the next-line highlight skips instrumental rows.
2. **A keyboard designed for someone holding a guitar.** Space from anywhere, arrows by line with restart-first, L and Shift+arrows for loops, −/+ for capo, saved per song and shown in lists. The playlist capo hold is product-specific thinking.
3. **Discipline and honesty.** One teal thing at a time; every playing-state colour at 5.5:1 or better; all 84 chord names in the library get a diagram with the right notes.

## Priority Issues

**[P1] The sheet is only readable after you press play, and then only its type grows.**
- What: browsing lyrics are 16px/300 at 3.14:1. The playing scale needs audio to start and resets on every song change, so a playlist's capo prompt arrives at 11.5px over a small sheet. The column stays 700px, so at 1200px 19 of 49 lines in one song wrap at playing scale with empty cream either side, and a wrapped word sits under its own empty chord slot. Diagrams stay 56px with an 8px fret number; the capo is one 11.5px digit.
- Why it matters: principle 2 is the product's reason to exist, and three of the four declared uses happen before or without play.
- Fix: make the playing scale a state you can enter without audio (a key and a pill) that persists across songs; widen the column in that state and hang-indent wrapped words; grow diagrams to about 84px; show the capo large by the title.
- Suggested command: /impeccable shape

**[P1] Edit mode loses work without asking, and you cannot hear what you are editing.**
- What: Cancel and Escape confirm, but any route change calls stopEditing() (static/app.js:655). One chord change followed by a sidebar click produced 0 confirms and the change was gone. Reload has no guard. The player is hidden, so a chord cannot be checked against the recording until after Save. Words are not focusable, so adding a chord is mouse-only.
- Why it matters: correcting detected chords is the highest-effort thing the owner does; one mis-click erases it.
- Fix: guard route changes and reload with the same question, asked in the edit bar rather than a native dialog; keep play/pause and line-jump available while editing; make words tabbable.
- Suggested command: /impeccable harden

**[P2] Paused seeking and looping leave the sheet behind, and loops are fragile.**
- What: clicking the timeline while paused set the time to 2:22 with the page still at the top and the current row 2183px down (static/app.js:1048, 1074). Arrow keys do scroll when paused, so the two seek methods disagree. A plain Left arrow from the loop's first line clears a multi-line loop with no undo. The timeline is 246px for 58 segments at 1200px, about 95px narrower than before the capo moved into the player. Loop honey on paper is 1.64:1; unplayed segments 1.3:1.
- Why it matters: "practising parts" is a declared use and mostly happens paused.
- Fix: scroll the current or first looped row into view on any seek or loop change; keep the loop when stepping outside it and clear only on L; give the timeline the player's full width.
- Suggested command: /impeccable harden

**[P2] Diagrams have the right notes but are not chosen or drawn for this player.**
- What: B, Bm and Bm7 are drawn 224432-style with F# in the bass, the same picture as Bm/F#, so Iris shows duplicates. Cmaj7 is drawn 332000. D/F# uses a four-fret barre while the common 2x0232 is the dataset's second entry. Nut, open and mute marks render in ink-3 at 3.14:1 because `.shape svg g` catches them (static/style.css:111); DESIGN.md says an ink nut.
- Why it matters: the owner needs diagrams precisely for barre and unusual shapes; mute and open marks are the easiest part to get wrong.
- Fix: rank positions (root in the bass for non-slash chords, smallest span, most open strings); merge identical diagrams under one caption; draw nut, O and X in ink.
- Suggested command: /impeccable harden

**[P2] Missing exits, and one label that does not do what it says.**
- What: no cancel for a running job; no delete or re-make for a song anywhere; playlist Remove and Add save at once with no undo; "Save as text" and "Save as a web page" replace the app with the raw file, which ignores the chosen capo.
- Why it matters: a wrong match costs a minute and leaves a bad sheet in the library for good.
- Fix: a Cancel pill on the job view, "Delete song" and "Make again" in More, an inline Undo after playlist changes, and a download attribute on the exports.
- Suggested command: /impeccable shape

## Persona Red Flags

**Alex (power user)**: no library search or sort across 21 songs. Moving a playlist song from 13 to 1 is 12 clicks. No keys for transpose, next song or tabs. Auto changed Let It Be to capo 5 with no reason; undoing it is Reset, which also clears transpose. No tempo control.

**Sam (keyboard and screen reader)**: Play is tab stop 78 of 83 with no skip link. Space on a focused button never activates it. role=menu ignores Down; arrows on a focused tab step lines instead of switching tabs. Text-field focus is a 1px border shift. No aria-current on the playing line. A row's text has no spaces between words for a screen reader (unverified how it is spoken).

**Casey (phone)**: player plus tab bar take 160px, leaving about four lines visible. Capo buttons are 30x30 and Auto 37x30. Multi-line looping needs a drag on a 137px bar. The More sheet has no scrim, title or close control. Playlist tool buttons take 126px and truncate titles.

**The owner, mid-song, both hands on the guitar**: the capo number is 11.5px and a barre's fret number about 8px. A wrapped word under its own chord looks like the next line. Transpose is off-screen with no key. A playlist's capo prompt is 11.5px over a sheet that has shrunk back. A stray Left arrow destroys a loop. The key legend left the screen when playback started.

## Minor Observations

- The key legend truncates to "− + c…" at 800px wide and stays visible in edit mode, where none of its keys act.
- Load flash: the sidebar briefly says "Group songs into playlists…" although a playlist exists.
- The library says 4:03 and the player 4:02 for the same song.
- Unknown routes silently show Your songs with the stale hash. The tab title stays "Strum" on playlist pages.
- The Add to playlist panel has no heading or way back to More.
- The Strumming tab holds one line, hides the diagrams and is not sticky.
- Spotify login is kept only in sessionStorage, so it asks again every browser session (source only).
- The idle tuner dial at 55% opacity looks muddy. The error band cannot be dismissed.
- The playing-scale switch is a reflow at the moment the hands go to the guitar (sheet height 3350 to 4088px).
- Not seen live: the processing wait, logged-in Spotify, passcode and hosted paths, the microphone flow, a real screen reader, animated motion.

## Questions to Consider

1. If the sheet is the product, why does a browse scale exist on the song page at all, and why does the readable one need the recording to start?
2. What would the song page be with the sidebar gone while a song is open?
3. Is the diagram strip a reference (every chord, small) or a prompter (this chord and the next, large)? At 56px it is neither from arm's length.
4. Would a stranger shown only the library page know this is a guitar tool?
