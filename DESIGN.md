---
name: Strum
description: A guitar chord sheet timed to the recording, in a quiet spruce-and-cream room.
colors:
  ground: "#f6efe3"
  paper: "#fbf8f2"
  line: "#e6dac6"
  line-soft: "#efe6d6"
  pill: "#efe6d6"
  pill-now: "#eadfcb"
  ink: "#2a1c13"
  ink-2: "#6f5643"
  ink-3: "#9a836e"
  ink-4: "#b39e88"
  honey: "#e5bf80"
  honey-tint: "#f3e2c2"
  honey-line: "#e6cb9b"
  rose: "#5a3522"
  teal: "#2f6b6a"
  teal-tint: "#dbe9e4"
  teal-line: "#c4dbd3"
  red: "#a3412e"
  error-band: "#f6e2da"
  error-ring: "#ecc9bd"
typography:
  numeral:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "54px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
  display:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  display-narrow:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  pattern:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "0.08em"
  lyric:
    fontFamily: "Hanken Grotesk, PingFang SC, PingFang TC, Hiragino Sans GB, sans-serif"
    fontSize: "16px"
    fontWeight: 300
    lineHeight: 1.25
    letterSpacing: "0.01em"
  touch-option:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.4
  title-lg:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  small:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.4
  meta:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.4
  chord:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0"
rounded:
  bar-1: "1px"
  bar-2: "2px"
  bar-3: "3px"
  track-hit: "4px"
  check: "5px"
  xs: "6px"
  sm: "7px"
  sm-plus: "8px"
  md: "9px"
  lg: "10px"
  xl: "11px"
  panel: "12px"
  disc-art: "14px"
  player: "17px"
  full: "50%"
spacing:
  hair: "1px"
  xs: "6px"
  sm: "12px"
  md: "18px"
  lg: "40px"
components:
  chord-pill:
    backgroundColor: "{colors.pill}"
    textColor: "{colors.ink-2}"
    typography: "{typography.chord}"
    rounded: "{rounded.sm}"
    padding: "5px 7px"
  chord-pill-line-now:
    backgroundColor: "{colors.pill-now}"
    textColor: "{colors.rose}"
  chord-pill-now:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.paper}"
  chord-pill-edit:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
  chord-pill-changed:
    backgroundColor: "{colors.honey-tint}"
    textColor: "{colors.rose}"
  chord-pill-selected:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.paper}"
  chord-add:
    textColor: "{colors.ink-3}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "27px"
    padding: "0 10px"
  pill-touch:
    height: "36px"
    padding: "0 13px"
  pill-honey:
    backgroundColor: "{colors.honey-tint}"
    textColor: "{colors.rose}"
    rounded: "{rounded.md}"
  act-open:
    backgroundColor: "{colors.teal-tint}"
    textColor: "{colors.teal}"
    rounded: "{rounded.md}"
  link-box:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "34px"
  search-box:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "38px"
  nav-item-current:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "7px 8px"
  tab-bar-item:
    textColor: "{colors.ink-2}"
    height: "52px"
  playlist-tile:
    backgroundColor: "{colors.honey-tint}"
    textColor: "{colors.rose}"
    rounded: "{rounded.sm}"
    size: "34px"
  menu:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    padding: "6px"
  menu-option:
    rounded: "{rounded.sm-plus}"
    padding: "7px 8px"
  player:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.player}"
    height: "54px"
    width: "min(540px, calc(100vw - 248px - 32px))"
  edit-bar:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.player}"
    padding: "10px 10px 10px 16px"
    width: "min(620px, calc(100vw - 248px - 32px))"
  icon-button-pressed:
    backgroundColor: "{colors.honey-tint}"
    textColor: "{colors.rose}"
    rounded: "{rounded.md}"
    size: "32px"
  tuner-dial:
    textColor: "{colors.paper}"
    typography: "{typography.numeral}"
    rounded: "{rounded.full}"
    size: "168px"
  tuner-meter:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    height: "46px"
  string-chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    width: "36px"
    height: "32px"
  string-chip-on:
    backgroundColor: "{colors.honey-tint}"
    textColor: "{colors.rose}"
  string-chip-ok:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.paper}"
  error-band:
    backgroundColor: "{colors.error-band}"
    textColor: "{colors.red}"
    rounded: "{rounded.xl}"
    padding: "9px 14px"
---

# Design System: Strum

## Overview

**Creative North Star: "Spruce Top & Rosette"**

The sheet is a quiet spruce-and-cream room where only the sung line and its playing chord carry colour. Everything is built from the materials of an acoustic guitar: a cream spruce ground, paper surfaces, rosewood ink, honey from the top's finish, and an abalone rosette that rings the play control, the processing disc, the tuner dial and the home-screen icon. It refuses the chord site's dense monospace grid and its wall of toolbars.

Owner-pinned (2026-11-13): the Spruce Top & Rosette colours (cream ground, rosewood ink, honey for capo and loop, abalone teal for "now", abalone rosette ring), with the lightness of the Strum iOS app: small refined type, light pale lyrics with wide word gaps, borderless soft chord pills, and a floating player. Earlier, larger previews read as "clunky, big, out of space"; the system stays small and airy because of that. The owner also rejects a techy look (dark dashboard, neon), a busy look (panels competing with the sheet) and a plain look (generic web app with no guitar feel).

Density is low and the type is small: 13px UI, 11-11.5px labels, 16px light lyrics. Hierarchy comes from tone, not size. Upcoming lines sit pale; the current line darkens to ink; its playing chord alone turns teal. Later surfaces (playlists, tuner, chord editing, Spotify search, the phone layout) reuse the same materials rather than adding new ones; the only size jump is the tuner's note, which is read from arm's length.

**Key Characteristics:**
- Cream ground, paper surfaces, rosewood ink in four steps, warm 1px hairlines.
- Two accents with fixed jobs: honey means capo, loop and the thing in hand; abalone teal means "now", done and right.
- The abalone rosette ring is the only decorative device; it marks play, processing, tuning and the app itself.
- Light, pale lyrics with wide word gaps; small borderless chord pills above words.
- One floating rounded bar at bottom centre (the player, or the edit bar in its place); no toolbars.

## Colors

A warm, low-chroma wood palette with two small accents that each mean one family of things.

### Primary
- **Abalone Teal** (`teal`): "now", done and right. The playing chord pill, done timeline segments and processing steps, the sidebar "ready" dot, the focus ring, an in-tune string chip, the tuner's in-tune ring, needle and centre band, the selected chord in edit mode and a ticked playlist in the menu. Tints `teal-tint` / `teal-line` mark an already-made song's "Open" action and the tuner meter's target band.

### Secondary
- **Spruce Honey** (`honey`): capo, the practice loop, and the thing in hand. Full honey for loop segments on the timeline, the breathing current processing step and busy dot, and the 1.5px ring on a changed chord in edit mode. `honey-tint` / `honey-line` for the capo pill, primary actions (link-box "Make sheet", "Create", "Search", "Start tuner", "Play from the start", "Log in with Spotify"), queued row actions, the pressed loop button, the string being played on the tuner, playlist count tiles, looped lyric rows (at 45% alpha) and text selection.
- **Rosewood** (`rose`): text on honey surfaces and on the current line's chord pills; the current tab's icon on the phone tab bar.

### Tertiary
- **Abalone** (conic gradient of teal, sea-green, slate blue, lilac, cream-green; in the sidecar): only inside the rosette ring around the play button, the brand mark, the passcode screen mark, the processing disc, the tuner dial and the app icon.

### Neutral
- **Cream Ground** (`ground`): page background, phone tab bar, edit-bar input field, manifest theme and background colour.
- **Paper** (`paper`): raised surfaces: player, edit bar, menu, pills, link and search boxes, current nav item and song, hovered list rows, tuner meter, resting string chips, chord pills in edit mode.
- **Hairline** (`line`) and **Soft Hairline** (`line-soft`): 1px borders, dividers, inactive timeline, meter ticks, menu option hover. `pill` is the resting chord-pill fill and the edit-bar chord chips; `pill-now` the chord-pill fill on the current line and the chip hover.
- **Rosewood Ink** (`ink`): titles, the current lyric line, primary text, the tuner's dial centre and needle.
- **Ink 2** (`ink-2`): secondary text, meta lines, placeholder, resting chord-pill text, tab-bar labels.
- **Ink 3** (`ink-3`): the next lyric line, chord-diagram grid, tertiary links, the "+" add slot text.
- **Ink 4** (`ink-4`): lyric lines that are not current or next, empty-diagram text, hover borders, edit-mode chord outline and dashed add outline, menu checkbox ring.
- **Clay Red** (`red`): error text and the invalid edit-bar input border only.
- **Error Band** (`error-band`) with **Error Ring** (`error-ring`): the pale clay band and its 1px ring behind the sticky error message; nowhere else.

### Named Rules
**The Two Jobs Rule.** Honey means capo, loop and the thing in hand (primary action, work in progress, an edited chord, the string being played); teal means now, done and right. Never swap them, and never use either as decoration.

**The One Coloured Chord Rule.** At most one chord on the sheet is teal at any moment: the one sounding now, or in edit mode the one selected.

## Typography

**Display Font:** Schibsted Grotesk (with system-ui), self-hosted, OFL
**Body Font:** Schibsted Grotesk
**Lyric Font:** Hanken Grotesk Light (with PingFang SC / TC, Hiragino Sans GB for Chinese), self-hosted, OFL

**Character:** A compact, firm grotesk runs the interface; a light, open grotesk carries the words you sing, so lyrics read as softer and further back than the chords.

### Hierarchy
- **Numeral** (800, 54px, 1, -0.03em, paper on ink): the tuner's note name inside the dial. The only text above 26px.
- **Display** (800, 26px, 1.1, -0.025em, balanced wrap): page and song titles; 24px at 760px and below (Display Narrow). The brand mark uses the same face at 800 / 16px.
- **Pattern** (700, 17px, 0.08em, pre): the strumming pattern line.
- **Lyric** (300, 16px, 1.25, 0.01em; 400 on the current line): sheet rows, word gap 0.62em. Text fields also go to 16px on phones so iOS does not zoom.
- **Touch Option** (500, 15px): menu options in the phone bottom sheet.
- **Title Large** (600, 14px): playlist header row, tuner reading, edit-bar chord input, large playlist tile number, touch tabs.
- **Title** (600, 13.5px): song names in lists. Subhead (700, 13px): "Add songs".
- **Body** (400, 13px, 1.4): meta lines, notes, hints; touch pills and row actions.
- **Small** (500-700, 12.5px): sidebar song names, tabs, sheet section labels (700), context bar, menu options, edit-bar message, big pills, link-box input.
- **Meta** (12px): artists in lists, chord-diagram names (700), the "+" add slot, empty menu note.
- **Label** (600, 11.5px): pills, buttons, timestamps (tabular numbers), sidebar group headings, edit-bar chips.
- **Chord** (600, 11px, 1): chord names inside pills; tab-bar labels on phones.
- One-off: 10.5px for the "no diagram" text inside an empty chord box.

### Named Rules
**The Small Type Rule.** Nothing but titles and the tuner's note exceeds 17px. Hierarchy comes from weight and ink step, not size.

**The Pale Lyric Rule.** Lyrics are light weight and pale (`ink-4`), step to `ink-3` for the next line and to full `ink` at 400 for the current line. Chinese characters join without the word gap.

## Layout

A 248px sidebar (mark, nav of Your songs / Playlists / Tuner / Spotify, link box, your songs, playlists, recently played) beside a scrolling main area. Content sits in a centred column (max 700px; padding 34px 40px 150px; the bottom room clears the player). Chord diagrams scroll sideways and bleed to the column edge. The floating player, or the edit bar in its place, is centred over the main area, not the window, and a 110px cream fade sits under it while a song is open (dropped in edit mode). A song opened from a playlist gets a one-line context bar above its title: playlist name, "2 of 5", Previous and Next pills.

The tuner stacks centred with 18px gaps: dial, meter (max 420px), reading, string chips, Start.

Spacing is small and close: 1px between list rows, 6px between pills and sheet rows, 12px between diagrams and inside list rows, 18px between sidebar groups, tabs and tuner parts.

At 760px and below (phones) the sidebar becomes a fixed bottom tab bar: four equal columns, 52px tall items, 21px icons over 11px labels, cream with a 1px hairline on top, padded by the bottom safe area; the mark, link box and sidebar lists hide and live on their own pages. The column padding becomes 18px sides, top safe area plus 18px, and tab bar plus 110px at the bottom. The song's pill row stops wrapping and scrolls sideways in one row, bleeding 18px to the edges with no scrollbar. The player and edit bar span the width less 20px and sit 8px above the tab bar. The Add to playlist menu becomes a bottom sheet 10px from the sides and 10px above the tab bar.

Under `(pointer: coarse)`, whatever the width, targets grow for a thumb: pills and row actions 36px (big pills 42px) at 13px, stepper buttons 30px, icon buttons 42px, play 46px, player 62px, timeline 36px, string chips 44 x 40px, touch tabs 14px, and chord pills, add slots and chips in edit mode to about 14px type with 12px padding.

All animation and transitions are dropped under reduced motion.

## Elevation & Depth

Mostly flat and tonal: paper on cream, joined by 1px hairlines drawn as `box-shadow: 0 0 0 1px` rings (or inset rings) rather than borders. Real shadows are soft, warm-brown, and reserved for things that float or sound.

### Shadow Vocabulary
- **Float** (`0 0 0 1px line, 0 16px 36px -18px rgb(70 40 15 / 0.35)`): the player and the edit bar.
- **Menu** (`0 0 0 1px line, 0 14px 30px -14px rgb(70 40 15 / 0.35)`): the Add to playlist dropdown and bottom sheet.
- **Disc** (`0 0 0 3px paper, 0 0 0 4px line, 0 18px 34px -16px rgb(70 40 15 / 0.45)`): the processing disc; the tuner dial uses the same at 4px / 5px.
- **Tuned** (`0 0 0 4px paper, 0 0 0 7px teal, 0 18px 34px -12px rgb(47 107 106 / 0.6)`): the tuner dial when the string is in tune.
- **Now lift** (`0 3px 8px -3px rgb(47 107 106 / 0.6)`, with a 1px rise): the playing chord pill.
- **Hairline ring** (`0 0 0 1px line-soft`): current nav item and song, hovered list row. Inset `line` rings draw the tuner meter and string chips; an inset `ink-4` ring outlines chord pills in edit mode, 1.5px `honey` when changed.

### Named Rules
**The Only Things That Float Rule.** Only the floating bar (player or edit bar), the playlist menu, the rosette discs (processing and tuner) and the sounding chord carry a drop shadow.

## Shapes

Soft, small rounded rectangles throughout, true circles for every rosette and status dot, and one larger radius for the floating bars. The radius steps as built:

- **Bars** (1px, 2px, 3px): thin bars round to half their thickness: the meter's centre line (1px), the tuner needle and the timeline's end caps (2px), the processing step bars (3px).
- **Small controls** (6px): stepper buttons, the word highlight in edit mode.
- **Chord pills and small art** (7px): chord pills, add slots, edit-bar chips, 34px art and playlist tiles, the honey button inside the link box.
- **Larger art and options** (8px): 44px art and tiles, menu options, the sidebar Spotify button, touch stepper buttons.
- **Controls** (9px): pills, row actions, nav items, icon buttons, string chips, edit-bar input.
- **Fields and rows** (10px): link and search boxes, sidebar songs, lyric rows.
- **List rows** (11px): song list rows and the error band.
- **Panels** (12px): the menu and the tuner meter.
- **Floating bars** (17px): player and edit bar.
- **Circles** (50%): rosettes, play button, tuner dial, status dots.

One-offs, not steps to reuse: 4px on the timeline's invisible hit area (only its focus ring shows it), 5px on the 16px menu checkbox, 14px on the album-art processing square.

Album art is a 7-8px rounded square. The timeline is thin rounded bars, one segment per sheet line. The "add chord" slot is the only dashed outline in the system.

## Components

### Chord Pills
Borderless and soft; they whisper until they sound.
- **Rest:** `pill` fill, `ink-2` text, 7px radius, 5px 7px padding (6px 9px on chord-only rows).
- **Current line:** `pill-now` fill, rosewood text.
- **Now:** teal fill, paper text, now-lift shadow and 1px rise; 250ms ease-out transition.
- **Edit mode:** paper fill with an inset 1px `ink-4` outline and no rise; changed chords honey tint with a 1.5px honey ring; the selected chord teal with paper text. Chord-only rows show their slots. Words take a honey wash on hover (copy cursor).
- **Add slot:** transparent, `ink-3` "+", 1px dashed `ink-4` outline, 7px radius, 12px type.

### Edit Bar
Takes the player's place, same Float shadow and 17px radius, paper, up to 620px wide. One row holds the message or a 32px cream input (14px / 600; teal outline on focus, red border when invalid) with Remove and Done; below, a wrapping row of chord chips (`pill` fill, 11.5px, 7px radius, `pill-now` and rosewood on hover); Cancel and Save pills close the mode.

### Pills and Buttons
- **Shape:** 27px tall, 9px radius, 1px `line` border on paper, Label type.
- **Honey:** honey tint with honey-line border and rosewood text: capo, primary actions such as "Play from the start", "Start tuner", "Log in with Spotify" (34px "big" size, 12.5px).
- **Quiet:** transparent with `ink-2` text (Reset, Delete playlist).
- **Hover:** border darkens to `ink-4`. Disabled: 55% opacity; a disabled Previous/Next in the context bar sits at 40%.
- **Stepper:** a pill holding 19px square minus/plus buttons on 8% rosewood, tabular number between.
- **Row action:** the same pill shape; turns honey on row hover; teal tint when the song is already made ("Open"); honey when queued.
- **Icon button:** 32px, 9px radius, `ink-2`, `line-soft` on hover, honey tint when pressed; a 28px small size moves and removes songs in a playlist (30% opacity when disabled).

### Link Box and Search
Paper field, 34px, 10px radius, 1px `line` border darkening to `ink-4` on focus; a small honey button sits inside it ("Make sheet"). The same field at 38px (13px text) creates a playlist, renames one and searches Spotify; 40px on the passcode screen; 42px on phones.

### Add to Playlist Menu
A paper panel (12px radius, 6px padding, Menu shadow, at least 230px) under its pill. Options are 12.5px / 500 rows with a 16px checkbox (inset `ink-4` ring; teal fill with a paper tick when the song is in that list), `line-soft` on hover; a 32px link box at the foot names a new playlist. On phones it is a bottom sheet with 15px options and 12px 10px padding.

### Navigation
Sidebar links: 13px / 500 `ink-2` with 16px stroked SVG icons, 9px radius. Hover: paper at 60%. Current: paper with a soft hairline ring, 600 weight. Tabs: 12.5px / 600 text on a hairline, the selected tab underlined by a 2px inset ink rule. Phone tab bar: icon over 11px / 600 label, no fill; the current tab goes `ink` with a rosewood icon.

### Lists
Songs: 44px art, 600 title, `ink-2` artist, a row action or small icon buttons at the end, soft hairline between rows, paper and hairline ring on hover. Sidebar songs: 34px art, 12.5px title. Playlists use a honey-tint count tile (34px in the sidebar, 44px in lists, rosewood tabular number) in the art's place. The Spotify playlist header row puts a back pill and the name at 14px with 12px gaps; "More results" is a pill in a padded row at the list's end.

### Floating Player (signature)
Paper, 54px, 17px radius, Float shadow; the rosette play button, current time (ink, 600), a segmented timeline (one segment per line: `line`, teal when done, honey when looped; grows on hover; drag to loop), end time, and a 32px loop icon button (honey tint when pressed).

### Rosette (signature)
An ink centre, a thin paper ring and the abalone conic gradient: 17px brand mark, 38px play button (46px on touch), 44px passcode mark, 112px processing disc turning once per 9s, 168px tuner dial. With album art, the disc becomes a 14px-radius art square with a 40px turning rosette badge. The app icon is the same rosette, centred on cream with a paper ring and a soft drop (source `scripts/icon.html`).

### Tuner
The 168px rosette dial holds the note in Numeral type; it sits at 55% opacity while idle and gains the teal Tuned ring when in tune. Below, a 46px paper meter (12px radius, inset hairline) with tick marks every 10%, a teal-tint centre band and a 2px teal centre line; the 4px ink needle slides with the cents and turns teal in tune. Six string chips (36 x 32px, 9px radius, 13px / 700): paper with inset hairline at rest, honey when that string is heard, teal when it is in tune. A big honey pill starts and stops.

### Processing Steps
Five 6px bars in a row: teal when done, honey and breathing (1.6s) for the current step, `line` for the rest; the step text below updates in place.

### Chord Diagrams
56px stroked SVG boxes: `ink-3` grid, `ink` nut, dots, barres and fret numbers; the chord name above in 700 / 12px.

### Error Band
Sticky at the top of the main area, max 620px: error-band fill, 1px error-ring, clay-red 500 text, 11px radius, 9px 14px padding.

## Do's and Don'ts

### Do:
- **Do** keep honey for capo, loop and the thing in hand, and teal for now, done and right (The Two Jobs Rule).
- **Do** keep type small: 13px UI, 11-11.5px labels, 16px light lyrics, 26px titles (24px on phones); only the tuner note is large.
- **Do** draw hairlines as 1px `line` / `line-soft` and float only the player or edit bar, the menu, the rosette discs and the sounding chord.
- **Do** use the abalone rosette only for play, the brand mark, processing, the tuner dial and the app icon.
- **Do** draw icons as inline stroked SVG (1.4-1.8px strokes, round caps).
- **Do** grow targets under `(pointer: coarse)` and keep phone text fields at 16px.

### Don't:
- **Don't** give chord pills borders or make them bigger while playing: they stay borderless, 11px, 7px radius. Only edit mode outlines them (an inset ring) and, on touch, enlarges them.
- **Don't** add toolbars or panels around the sheet; controls live in the pill row and one floating bar (player or edit bar, never both).
- **Don't** go dark, neon or dashboard-like; don't add a monospace chord grid.
- **Don't** copy the Strum app's logo, name styling or assets.
- **Don't** invent logos, illustrations or photography; album art comes from the song source only, and the app icon is the rosette.
