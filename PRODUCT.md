# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner, an intermediate guitarist. They know the common open chords and need diagrams for barre and unusual shapes. They use it on a MacBook at arm's length on a desk or stand, with the guitar in their hands.

## Product Purpose

Turns any song into a guitar chord sheet: lyrics with each chord placed over the word where it changes. Chords come from the audio itself (AI models), so it works for songs nobody has transcribed. Success is picking a song and strumming along within a minute or two, with chords that match what you hear.

## Positioning

Chords are detected from the recording, not scraped from chord sites. The sheet is timed to the audio file it was made from, so it can play the song and follow along word by word.

## Operating Context

- Songs come from the owner's Spotify (recently played, top tracks, liked) or a pasted YouTube link.
- A new song takes about a minute on the Mac. The page shows progress in five steps (finding audio, separating stems, detecting chords, getting lyrics, building the sheet). A song already made opens instantly.
- The owner uses a sheet four ways: playing along while it scrolls with the audio, practising parts (jumping to lines and learning changes), a quick look at chords and capo before playing from memory, and coming back to songs already made.
- Hands are on the guitar while playing, so whatever happens during playback must work at a glance and with few clicks.

## Capabilities and Constraints

- Exists today: Spotify login (PKCE in the browser) with three lists; paste a YouTube link; five-step job with progress; sheet with chords over words and chord-only rows for intro and solos; playback with the current line and chord highlighted and auto-scroll; click a line to jump; transpose (−6 to +6) and capo (0 to 7) with a "suggest capo" button; one diagram per distinct chord following capo and transpose; tempo and a suggested strum pattern; download as .txt and .html; the source video link.
- Lyrics may be English or Chinese (one character per word, chord boxes above characters).
- One job at a time; a second request while one runs gets a "busy" message.
- Wanted and in scope for the redesign: a library view of songs already made; looping a section to practise it.
- Local only for now: FastAPI on 127.0.0.1:8000, plain ES-module JavaScript, no build step. Hosting on Vercel is planned later (page and saved sheets on Vercel, processing stays on the Mac), so the page should stay static files.
- Chord fingerings come from the vendored chords-db dataset (static/guitar.json, MIT).

## Brand Commitments

- Feel (owner's words): "a soft, guitar vibe, similar to Strum". Strum is an existing chord app the owner admires (owner shared its App Store screenshots, 2026-11-13).
- After seeing previews, the owner pinned: the Spruce Top & Rosette colours (honey spruce, rosewood, abalone teal, cream), with Strum's lightness: small refined type, lots of room, slim borders, small rounded chord pills, a floating play bar. The first previews felt "clunky, big, out of space". Strum's logo, name styling and assets are not copied.
- Working name in the page title: "Strum". Undecided whether that stays.
- Owner said a polished result would still feel wrong if it is too techy (dark dashboard, neon, production-software look), too busy (panels and controls competing with the sheet), or too plain (generic web app with no guitar feel).

## Evidence on Hand

- Real cached sheets in data/: "Let It Be" (The Beatles), "晴天" (Jay Chou, Chinese), "Look After You" (The Fray).
- No logo, illustrations or photography exist. None should be invented as if they were real assets.

## Product Principles

1. The sheet is the product. Everything else gets out of its way once a song is open.
2. Readable at arm's length with a guitar in hand: chords above all, then lyrics.
3. Controls that matter while playing (play/pause, capo, transpose) are reachable without hunting.
4. Waiting a minute for a new song should feel calm and informative, not broken.
5. Honest output: show which video was used and never hide a doubtful match.

## Accessibility & Inclusion

Keyboard use already works (lines are focusable buttons; Enter jumps). Keep that, keep text real text, and keep contrast readable from arm's length.
