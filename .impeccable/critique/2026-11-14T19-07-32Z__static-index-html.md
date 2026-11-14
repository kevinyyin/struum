---
target: the entire webapp
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-11-14T19-07-32Z
slug: static-index-html
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent). The parent re-checked the top code claims and re-measured the pill overlap in the browser.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Could not open that song" is cleared by the route change it triggers (static/app.js:650, 674-675); tab title goes stale after leaving a song |
| 2 | Match System / Real World | 3 | Guitarist language is good; leaks: "157.9 BPM in 6/4", "deleted from data/", "(state mismatch)" |
| 3 | User Control and Freedom | 2 | No undo; a running job cannot be cancelled; Escape/Cancel drops unsaved chord edits with no confirm; remove-from-playlist is instant |
| 4 | Consistency and Standards | 3 | Space plays or re-presses the last clicked control depending on focus; tuner string chips look like buttons and are not |
| 5 | Error Prevention | 3 | Inputs are well guarded; gap is draft loss in edit mode and a no-confirm X beside move-down |
| 6 | Recognition Rather Than Recall | 2 | Diagrams scroll away during playback; capo forgotten per song; loop shortcuts live only in a tooltip; 5 of 7 pills off-screen on phone |
| 7 | Flexibility and Efficiency | 2 | Only Space and L; no line keys, no tempo control, no library filter; Spotify login lost each browser session |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and disciplined; noise is the full-strength sidebar on the song page and seven equal pills |
| 9 | Error Recovery | 3 | Messages are plain with next steps; gaps: the lost error, invalid chord gets a red border and no words, no retry after a failed job |
| 10 | Help and Documentation | 2 | Good inline hints, but no shortcut legend or help anywhere |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment**: The visual language is authored; the interaction model is not. The wood palette, the single abalone rosette, the two-job colour logic and the timeline cut into one segment per sheet line belong to this product. The composition is the standard music-app shell in cream: 248px sidebar, 700px column, a row of equal pills, a floating transport. Nothing in the layout responds to the defining fact of the brief: the user is at arm's length with both hands busy. The page is the same whether browsing or playing, and the type scale (11px chords, 13px UI, 16px light lyrics) is a desktop-productivity scale on what is a music stand. The brief holds a real tension ("small refined type" pinned by the owner vs "readable at arm's length, chords above all") and the build resolved it entirely one way. DESIGN.md gives the tuner note 54px because it "is read from arm's length", which concedes the sheet is not sized for the same distance.

**Deterministic scan**: The CLI detector ran degraded (its HTML parser modules are not installed in the skill folder) and returned 0 findings, which is an undercount, not a clean result. The in-page detector found 7 warnings on every view (8 on Tuner): ai-color-palette x5 (all the abalone rosette, one token at static/style.css:9: brand mark, passcode mark, processing disc, tuner dial, play button), cream-palette x1 (body ground, static/style.css:5), tiny-text x1 (11.5px Spotify note in the sidebar, static/index.html:56), and line-length x1 on Tuner (~95 chars, static/index.html:149). False positives: the rosette and the cream ground are owner-pinned in DESIGN.md. Keep: the tiny-text hit (11.5px helper sentence in ink-3 at 3.14:1). The detector's contrast pass analysed nothing, so the contrast failures below were caught by the review, not the tool.

**Visual overlays**: Injection succeeded and overlays were drawn on all views during the scan, then removed. None are left in the browser.

## Overall Impression

A calm, well-made room with a distinct material identity, and a peak moment (press play: one line darkens, one pill turns teal) that lands. But it is designed for someone sitting at the screen, not standing back with a guitar. The single biggest opportunity: let the page change when you play.

## What's Working

1. **Colour as "now".** Only the sung line and the sounding chord carry emphasis (teal pill, 5.77:1), so the eye finds its place in one glance. Marking the next sung line across intro and solo rows is a guitarist's detail.
2. **The timeline is a map of the sheet.** One segment per line, teal when done, honey when looped, click a line to jump. Audio and page read as one object, which is the product's positioning made visible.
3. **Honest, human copy.** "A starting point, not detected from the recording." "12 cents flat · tighten the e string." It builds trust in AI output without hedging everything.

## Priority Issues

**[P1] The sheet is not readable at arm's length.**
- What: chord text is 11px/600 (static/style.css:126); lyrics are 16px weight 300 in ink-4 (static/style.css:116). Resting lyrics measure 2.25:1 on the cream ground, the next line 3.14:1, and the resting pill fill is 1.08:1 against the ground, so the pill has no visible shape. Chinese at weight 300 is fainter still.
- Why it matters: this is product principle 2 and the accessibility line in PRODUCT.md. Every line except the current one fails WCAG AA, and the "quick look before playing from memory" use reads a washed-out page.
- Fix: keep the small airy scale for browsing and add a playing scale for the sheet only. While audio plays (or via a remembered A−/A+ control), chords go to 15-16px/700 and lyrics to 20-22px; next line uses ink-2, other lines at least ink-3. Touch edit mode already renders 14px pills, which shows the system can carry it.
- Suggested command: /impeccable typeset

**[P1] Chord pills overlap and clip when a song is opened from a list.**
- What: `settle()` (the pass that pushes touching pills apart) returns early unless the view is "song" (static/app.js:727), and `show()` only calls it on the tuner branch (static/app.js:628-629), so it never runs on the first open. Re-measured: 晴天 opened from the library has 9 overlapping pill pairs ("Cmaj7" drawn as "Cma" under "G"). It clears on any capo, transpose or resize.
- Why it matters: the core content is mis-drawn on the most common path, and it reads as wrong chords.
- Fix: call `settle()` in `show()` when the view is "song".
- Suggested command: /impeccable polish

**[P1] Playing controls do not survive hands on the guitar.**
- What: Space does nothing after opening a song from the sidebar, because focus stays on the link and the key handler skips links and buttons (static/app.js:1014). After clicking Capo +, Space raises the capo again instead of playing. There are no keys for previous line, restart or seek; a multi-line loop needs shift-click on a row or a drag across a 3px bar. Chord diagrams leave the screen once auto-scroll starts.
- Why it matters: product principle 3 ("reachable without hunting") and the stated need for diagrams on barre and unusual shapes.
- Fix: make Space play/pause everywhere except text fields; add left/right for previous/next line and a key to extend the loop; put a one-line key legend in the player. Show the current and next chord shapes beside the player, or on hover/focus of any pill.
- Suggested command: /impeccable harden

**[P2] The app forgets how you play each song.**
- What: capo and transpose reset to 0 on every open (static/app.js:808), including when a playlist moves to the next song.
- Why it matters: "coming back to songs already made" is one of four stated uses; the work of finding a capo is thrown away each time.
- Fix: store capo and transpose per song, show "Capo 3" in list rows and the playlist context bar, and hold between playlist songs on "Next: title · Capo 2 · Space to start".
- Suggested command: /impeccable shape

**[P2] The pill row gives seven unrelated things equal weight.**
- What: the two play-critical steppers sit beside a mode switch (Edit chords), an organiser (Add to playlist), exports (Save) and "Tune", which leaves the page and stops the audio. It wraps to two rows at 1024px; on the phone the row is 919px wide in a 375px viewport with the scrollbar hidden (static/style.css:293-294), so only Capo and Transpose show.
- Why it matters: the anti-reference "too busy: controls competing with the sheet", and seven options is past the four-item working-memory limit.
- Fix: keep Capo (with Suggest as a small "auto" inside it and a line such as "shapes in Em, sounds in Bm") and Transpose. Move the other five behind one "More" menu or quiet links in the by-line.
- Suggested command: /impeccable distill

## Persona Red Flags

**Alex (power user)**: Click a sidebar song, press Space: nothing plays. No type-to-filter on 21 songs. Playlist reorder is one step per click, no drag. No playback speed for practising. Spotify asks for login every browser session.

**Sam (keyboard and screen reader)**: Play is tab stop 88 of 91 on a song page and there is no skip link. Lyric rows are `div role="button"` whose name runs chords and words together. The current line has no `aria-current`; "now" is colour and weight only. In edit mode words are not focusable, so adding a chord over a word is mouse-only. Invalid chord gets `aria-invalid` with no message. Good: visible focus ring, tuner live region, Escape returns focus from the menu.

**Casey (phone)**: The YouTube link box is hidden at 760px and below (static/style.css:281) and exists nowhere else, while the empty state says "Paste a YouTube link on the left" (static/app.js:190). The timeline is about 2.4px per line, so tap-to-line and drag-to-loop are not usable. Playlist move and remove buttons stay 28x28 on touch because `.ico.small` (static/style.css:157) beats the coarse-pointer rule (static/style.css:318), with the no-undo X at the end. Save links are about 20x18.

**The owner, mid-song, both hands on the guitar**: Cannot read the next line's chords ahead of time. Hits an F#m7 and the diagram is off-screen. Wants the last two lines again and needs shift-click precision. Hears a wrong chord: fixing it means edit mode, which pauses the audio and hides the player, so the spot cannot be heard while correcting it. A playlist song ends and the next starts immediately at capo 0.

## Minor Observations

- Error on a missing song is lost: `keepError` is only set on the job path (static/app.js:1055), not the song-open path (static/app.js:674-675).
- Tab title is only set when a song opens, so it stays "Song · Strum" on Playlists, Tuner and Spotify.
- Slash chords show the root chord's diagram under the slash name with no note; Em7 shows the dataset's first voicing (0x000x), which few players use.
- A song with no lyrics puts everything under "Intro" and never says lyrics were not found.
- The matched video is the single word "YouTube" with the URL in a tooltip; no title or channel (principle 5 is met thinly).
- No way to delete, rename or re-make a song in the UI; the error copy points at "data/".
- A played looped segment is drawn teal, not honey; honey on paper is only 1.64:1.
- "Saved" feedback is the Edit chords pill changing text for 2 seconds, far from where Save was pressed.
- The selected tab (Chords or Strumming) persists across songs, so diagrams can be hidden on the next song.
- "Log in with Spotify" appears twice at once (sidebar and page). The tuner by-line has no max-width (~95 characters).
- Not seen live (source only): the processing view, logged-in Spotify, the tuner while listening, the passcode screen. Animation timing was not observed.

## Questions to Consider

1. If the tuner note earns 54px because it is read from arm's length, why does the chord you must play in the next half second get 11px?
2. What if pressing play changed the page: sidebar gone, sheet scaled up, current and next chord shapes beside the transport?
3. The promise is "chords that match what you hear". Why is the one place you fix a chord also the one place you cannot hear the song?
4. Does the owner want seven pills, or two and a sheet?
