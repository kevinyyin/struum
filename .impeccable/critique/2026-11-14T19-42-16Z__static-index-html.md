---
target: everything again
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-11-14T19-42-16Z
slug: static-index-html
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent), both fresh and blind to the first critique. The parent re-checked the diagram lookup, the stale capo note and the pill-row markup in source.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | A missing song bounces to the library with no message; Space in edit mode plays audio with the player hidden |
| 2 | Match System / Real World | 3 | "157.9 BPM in 6/4", "B Gb Abm E" spelling, D/E drawn as plain D |
| 3 | User Control and Freedom | 2 | Cancel/Escape discard chord edits with no confirm; no undo on remove-from-playlist; a job cannot be cancelled; an active loop pulls a clicked line back |
| 4 | Consistency and Standards | 3 | Honey pill used as a non-clickable hint; role=menu without arrow keys |
| 5 | Error Prevention | 2 | "GH7" accepted as a chord; 28px remove button beside move-down with no confirm; steppers not disabled at limits; Auto overwrites your capo |
| 6 | Recognition Rather Than Recall | 3 | Legend and sticky diagrams are right; shift-click, drag-to-loop and what Auto does live only in tooltips |
| 7 | Flexibility and Efficiency | 3 | Good playback keys and capo memory; no keys for capo/transpose/next song, no library search, no slow-down |
| 8 | Aesthetic and Minimalist Design | 3 | Calm; sidebar repeats nav, playlist page is a 39-button grid |
| 9 | Error Recovery | 2 | One error never shows; the band cannot be dismissed and covers the diagram names; invalid chord gets only a red border |
| 10 | Help and Documentation | 2 | One legend line and tooltips; nothing for touch, nothing explaining Auto or looping |
| **Total** | | **26/40** | **Acceptable (top of band)** |

Compared with the first run (also 26): heuristics 6 and 7 rose from 2 to 3 (sticky diagrams, keys, capo memory), 5 and 9 fell from 3 to 2. The falls are a different reviewer marking pre-existing gaps harder, not regressions; per-heuristic scores vary by about a point between reviewers.

## Design Specificity Verdict

**LLM assessment**: The verdict flipped. Run 1 said the visuals were authored and the interaction generic; this run says the interaction model is authored for the product (one timeline segment per sung line, Space/arrows/L for occupied hands, the sheet growing on first play, a playlist that waits when the capo differs) and the visual shell is generic (248px sidebar, 700px column, art rows, pills, tab bar). "Spruce Top & Rosette" lives mostly in token names: the rosette is 17px and 38px, where it reads as a gradient dot, and its one large use (the tuner dial) sits idle at 55% opacity. Library, Playlists and Spotify are close to the "generic web app with no guitar feel" PRODUCT.md rejects. The documents pull against each other: PRODUCT asks for contrast readable at arm's length, DESIGN's Pale Lyric Rule sets lyrics at 2.25:1; the Playing Scale Rule says nothing else grows, yet diagrams, time and the capo note are read mid-song too.

**Deterministic scan**: CLI detector ran degraded again (parser modules missing in the skill folder): 0 findings, an undercount. In-page detector: 9 flagged elements per desktop view, 8 on phone. ai-color-palette x5 (the rosette, owner-pinned: false positive), cream-palette x1 (owner-pinned: false positive), tiny-text x2 (sidebar Spotify note at 11.5px and 3.14:1: keep; the new key legend at 11.5px and 5.95:1: on-spec), undersized-ui-text x1 (the new "Auto" button at 10.5px, static/style.css:91: real, under the 11px floor), plus text-occlusion when the More menu is open (transient, false positive) and line-length on the tuner caption (marginal). No contrast rule fired; contrast was measured by hand.

**Visual overlays**: Injected and drawn on every view during the scan, then removed. None remain.

## Overall Impression

The playing moment is now the product: press play and the sheet grows, one chord lights, its shape lights, the keys work. The remaining problems are around that moment: the capo control scrolls out of reach during it, the diagrams lie for slash chords, and the sheet still looks disabled before it. Biggest opportunity: put capo in the one bar that never moves.

## What's Working

1. **One "now", shown four ways.** Line, chord pill, diagram tile and timeline segment move together and only one chord is teal. The eye needs one anchor and gets exactly one.
2. **A keyboard model for occupied hands.** Space works even on a focused button, arrows step by sung line, Shift+arrow grows a loop, and the legend sits where you look.
3. **The playlist capo hold.** Autoplay continues when the capo matches and stops with "Move the capo to 2, then press play" when it does not. No template would produce that.

## Priority Issues

**[P1] Capo and transpose are unreachable while playing.**
- What: the pill row scrolls away; only the diagram strip is sticky (static/style.css:80, 104-105). Scrolling up to reach it is undone at the next line change, which re-centres the sheet (static/app.js:1020). There are no keys for capo or transpose.
- Why it matters: PRODUCT principle 3 names these as the controls that must be reachable mid-song.
- Fix: move Capo into the floating player (or make the pill row sticky with the strip), pause auto-scroll for a few seconds after a manual scroll, and add capo keys.
- Suggested command: /impeccable layout

**[P1] Diagrams are wrong for slash chords and Em7.**
- What: the lookup drops the bass note and always takes the first voicing (static/chords.js:56-61). C/G is drawn as plain C; in Iris 6 of 14 diagrams are look-alikes. Em7 renders the dataset's first entry, 0x000x, an almost empty grid, while the usual 020000 is the fourth. The dataset carries slash shapes.
- Why it matters: the owner needs diagrams for unusual shapes, and principle 5 is honest output.
- Fix: look up the suffix with its bass first, prefer a sane open voicing, and label any approximation ("bass not shown").
- Suggested command: /impeccable harden

**[P1] The sheet still fails contrast outside the current and next lines.**
- What: browsing, resting lyrics are 2.25:1 and the next line 3.14:1 at 16px/300 (static/style.css:122-124). Playing, resting lines are 3.14:1 at 21px/300, not "large text" under WCAG (static/style.css:140-141). Unplayed timeline segments are 1.30:1, honey loop segments 1.64:1.
- Why it matters: the product's main content, and the "quick look before playing from memory" use never enters the playing state.
- Fix: rest at ink-3 while browsing and ink-2 while playing; keep hierarchy through weight and the teal chord. Or make the playing scale the default.
- Suggested command: /impeccable typeset

**[P2] Silent failures and traps.**
- A missing song bounces home and its error is cleared by the route change (static/app.js:665, 689-690).
- Space in edit mode starts audio with the player hidden; L sets a loop there (static/app.js:1057-1062).
- With a loop on, clicking a line outside it shows that line as current, then play snaps back (static/app.js:955, 1001).
- Cancel and Escape discard unsaved chord edits with no confirm (static/app.js:607, 627-630).
- All views share one scroller: leaving a song at 1500px opens the library at 702px. The tab title stays on the last song.
- The capo-hold note is drawn once: it still says "Move the capo to 2" after the capo is reset (static/app.js:404), and it looks like a button.
- Suggested command: /impeccable harden

**[P2] Phone and narrow windows drop capability.**
- At 760px or less, including a half-screen Mac window, the YouTube link box is hidden and exists nowhere else (static/style.css:294); the empty state still says "on the left" (static/app.js:198).
- Playlist move/remove buttons stay 28px on touch (static/style.css:170 beats :322). The timeline is about 2.4px per line, so drag-to-loop is unusable, and the legend is hidden, so looping is undiscoverable on touch.
- Suggested command: /impeccable adapt

## Persona Red Flags

**Alex (power user)**: no keys for capo, transpose or next song; no search across 21 songs; no slow-down. Auto set Let It Be to capo 5 with no explanation, and the only undo is Reset, which also clears transpose. "Save as text" navigates the tab to a raw file (no download attribute).

**Sam (keyboard and screen reader)**: 89 tab stops, 86 before Play, no skip link. Words in edit mode are click-only, so a chord cannot be added to a lyric word by keyboard. Menus and tabs ignore arrow keys. Link-box focus is only a border change at 1.86:1. Focus drops to body after Cancel.

**Casey (phone)**: everything in the phone issue. The pill row wraps to 78px and the first lyric starts about 360px down. At playing scale a wrapped word is orphaned under an empty 35px chord slot.

**The owner, mid-song, both hands on the guitar**: capo cannot be changed without pausing. Diagrams stay 56px with 12px names while lyrics grow. The capo-hold note is 11.5px. A held song drops back to the small scale. The tuner needs a mouse click and leaves the song.

## Minor Observations

- The More pill jumps 59px when Reset appears, because Reset sits before it (static/index.html:94-96).
- Decimal BPM ("69.8", "157.9 BPM in 6/4").
- Steppers are not disabled at capo 7 or ±6. The chord regex accepts "GH7".
- Shift-click leaves a text selection washed over the looped lines.
- The error band covers the sticky strip's chord names and has no dismiss.
- First paint: the sidebar briefly says "Group songs into playlists…" although a playlist exists.
- The sticky strip has no cue that more diagrams are off to the right beyond a cut-off shape.
- The Add to playlist menu has no title and no way back to More.
- The current song is unmarked in the sidebar unless it is among the newest 6.
- "performing" stays on the body across other views (harmless today).
- Not seen live: processing view, logged-in Spotify, tuner listening, empty states, passcode screen, a real phone, a screen reader.

## Questions to Consider

1. If the playing scale is what you read from arm's length, why does the small pale state exist at all?
2. The rosette is the only decorative device. Why is it 17px and 38px? What if the play control were the soundhole of the page?
3. Does the sidebar deserve to exist while a song is playing, when its album art is louder than the lyrics?
4. Capo is the only control with its own colour. Why does it live in the one row that scrolls away, and not in the one bar that never moves?
