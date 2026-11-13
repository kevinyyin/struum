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
typography:
  display:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
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
  lyric:
    fontFamily: "Hanken Grotesk, PingFang SC, PingFang TC, Hiragino Sans GB, sans-serif"
    fontSize: "16px"
    fontWeight: 300
    lineHeight: 1.25
    letterSpacing: "0.01em"
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
  xs: "6px"
  sm: "7px"
  md: "9px"
  lg: "10px"
  xl: "11px"
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
  pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "27px"
    padding: "0 10px"
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
  nav-item-current:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "7px 8px"
  player:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.player}"
    height: "54px"
    width: "min(540px, calc(100vw - 280px))"
  icon-button-pressed:
    backgroundColor: "{colors.honey-tint}"
    textColor: "{colors.rose}"
    rounded: "{rounded.md}"
    size: "32px"
---

# Design System: Strum

## Overview

**Creative North Star: "Spruce Top & Rosette"**

The sheet is a quiet spruce-and-cream room where only the sung line and its playing chord carry colour. Everything is built from the materials of an acoustic guitar: a cream spruce ground, paper surfaces, rosewood ink, honey from the top's finish, and an abalone rosette that rings the play control and the processing disc. It refuses the chord site's dense monospace grid and its wall of toolbars.

Owner-pinned (2026-11-13): the Spruce Top & Rosette colours (cream ground, rosewood ink, honey for capo and loop, abalone teal for "now", abalone rosette ring), with the lightness of the Strum iOS app: small refined type, light pale lyrics with wide word gaps, borderless soft chord pills, and a floating player. Earlier, larger previews read as "clunky, big, out of space"; the system stays small and airy because of that. The owner also rejects a techy look (dark dashboard, neon), a busy look (panels competing with the sheet) and a plain look (generic web app with no guitar feel).

Density is low and the type is small: 13px UI, 11-11.5px labels, 16px light lyrics. Hierarchy comes from tone, not size. Upcoming lines sit pale; the current line darkens to ink; its playing chord alone turns teal.

**Key Characteristics:**
- Cream ground, paper surfaces, rosewood ink in four steps, warm 1px hairlines.
- Two accents with fixed jobs: honey means capo and loop, abalone teal means "now".
- The abalone rosette ring is the only decorative device; it marks play and processing.
- Light, pale lyrics with wide word gaps; small borderless chord pills above words.
- A floating rounded player at bottom centre; no toolbars.

## Colors

A warm, low-chroma wood palette with two small accents that each mean one thing.

### Primary
- **Abalone Teal** (`teal`): "now". The playing chord pill, done segments of the timeline, done processing steps, the sidebar "ready" dot, and the focus ring. Tints `teal-tint` / `teal-line` mark an already-made song's "Open" action.

### Secondary
- **Spruce Honey** (`honey`): capo and the practice loop. Full honey for loop segments on the timeline and the breathing current processing step; `honey-tint` / `honey-line` for the capo pill, primary small buttons ("Make sheet", "Log in with Spotify"), the pressed loop button, looped lyric rows (at 45% alpha) and text selection.
- **Rosewood** (`rose`): text on honey surfaces and on the current line's chord pills.

### Tertiary
- **Abalone** (conic gradient of teal, sea-green, slate blue, lilac, cream-green; in the sidecar): only inside the rosette ring around the play button, the brand mark and the processing disc.

### Neutral
- **Cream Ground** (`ground`): page background.
- **Paper** (`paper`): raised surfaces: player, pills, link box, current nav item and song, hovered list rows.
- **Hairline** (`line`) and **Soft Hairline** (`line-soft`): 1px borders, dividers, inactive timeline. `pill` is the resting chord-pill fill; `pill-now` the chord-pill fill on the current line.
- **Rosewood Ink** (`ink`): titles, the current lyric line, primary text.
- **Ink 2** (`ink-2`): secondary text, meta lines, placeholder, resting chord-pill text.
- **Ink 3** (`ink-3`): the next lyric line, chord-diagram grid, tertiary links.
- **Ink 4** (`ink-4`): lyric lines that are not current or next, empty-diagram text, hover borders.
- **Clay Red** (`red`): error text only, on a pale clay band (#f6e2da, ring #ecc9bd).

### Named Rules
**The Two Jobs Rule.** Honey means capo and loop; teal means "now". Never swap them, and never use either as decoration.

**The One Coloured Chord Rule.** At most one chord on the sheet is teal at any moment: the one sounding now.

## Typography

**Display Font:** Schibsted Grotesk (with system-ui), self-hosted, OFL
**Body Font:** Schibsted Grotesk
**Lyric Font:** Hanken Grotesk Light (with PingFang SC / TC, Hiragino Sans GB for Chinese), self-hosted, OFL

**Character:** A compact, firm grotesk runs the interface; a light, open grotesk carries the words you sing, so lyrics read as softer and further back than the chords.

### Hierarchy
- **Display** (800, 26px, 1.1, -0.025em, balanced wrap): page and song titles. The brand mark uses the same face at 800 / 16px.
- **Title** (600, 12.5-13.5px): song names in lists and the sidebar, tabs, sheet section labels (700, 12.5px).
- **Body** (400, 13px, 1.4): meta lines, notes, hints.
- **Lyric** (300, 16px, 1.25, 0.01em; 400 on the current line): sheet rows, word gap 0.62em.
- **Label** (600, 11.5px): pills, buttons, timestamps (tabular numbers), sidebar group headings.
- **Chord** (600, 11px, 1): chord names inside pills.

### Named Rules
**The Small Type Rule.** Nothing but titles exceeds 17px. Hierarchy comes from weight and ink step, not size.

**The Pale Lyric Rule.** Lyrics are light weight and pale (`ink-4`), step to `ink-3` for the next line and to full `ink` at 400 for the current line. Chinese characters join without the word gap.

## Layout

A 248px sidebar (mark, nav, link box, your songs, recently played) beside a scrolling main area. Content sits in a centred column (max 700px; padding 34px 40px 150px; the bottom room clears the player). Chord diagrams scroll sideways and bleed to the column edge. The floating player is centred over the main area, not the window, and a 110px cream fade sits under it while a song is open.

Spacing is small and close: 1px between list rows, 6px between pills and sheet rows, 12px between diagrams, 18px between sidebar groups and tabs.

At 760px and below the sidebar becomes a wrapping top bar (nav and a full-width link box; the song lists move to their own pages), the column padding drops to 22px 18px 140px, and the player spans the width less 20px, 10px from the bottom.

All animation and transitions are dropped under reduced motion.

## Elevation & Depth

Mostly flat and tonal: paper on cream, joined by 1px hairlines drawn as `box-shadow: 0 0 0 1px` rings rather than borders. Real shadows are soft, warm-brown, and reserved for things that float or sound.

### Shadow Vocabulary
- **Float** (`0 0 0 1px line, 0 16px 36px -18px rgb(70 40 15 / 0.35)`): the player.
- **Disc** (`0 0 0 3px paper, 0 0 0 4px line, 0 18px 34px -16px rgb(70 40 15 / 0.45)`): the processing disc.
- **Now lift** (`0 3px 8px -3px rgb(47 107 106 / 0.6)`, with a 1px rise): the playing chord pill.
- **Hairline ring** (`0 0 0 1px line-soft`): current nav item and song, hovered list row.

### Named Rules
**The Only Things That Float Rule.** Only the player, the processing disc and the sounding chord carry a drop shadow.

## Shapes

Soft, small rounded rectangles throughout (6-11px), one larger radius for the player (17px), and true circles for the rosette, the play button, the art badge and status dots. Album art is a 7-8px rounded square. The timeline is thin rounded bars, one segment per sheet line.

## Components

### Chord Pills
Borderless and soft; they whisper until they sound.
- **Rest:** `pill` fill, `ink-2` text, 7px radius, 5px 7px padding (6px 9px on chord-only rows).
- **Current line:** `pill-now` fill, rosewood text.
- **Now:** teal fill, paper text, now-lift shadow and 1px rise; 250ms ease-out transition.

### Pills and Buttons
- **Shape:** 27px tall, 9px radius, 1px `line` border on paper, Label type.
- **Honey:** honey tint with honey-line border and rosewood text: capo, "Log in with Spotify" (34px "big" size).
- **Quiet:** transparent with `ink-2` text (Reset).
- **Hover:** border darkens to `ink-4`. Disabled: 55% opacity.
- **Stepper:** a pill holding 19px square minus/plus buttons on 8% rosewood, tabular number between.
- **Row action:** the same pill shape; turns honey on row hover; teal tint when the song is already made ("Open").

### Link Box
Paper field, 34px, 10px radius, 1px `line` border darkening to `ink-4` on focus; a small honey "Make sheet" button sits inside it.

### Navigation
Sidebar links: 13px / 500 `ink-2` with 16px stroked SVG icons, 9px radius. Hover: paper at 60%. Current: paper with a soft hairline ring, 600 weight. Tabs: 12.5px / 600 text on a hairline, the selected tab underlined by a 2px inset ink rule.

### Lists
Songs: 44px art, 600 title, `ink-2` artist, a row action at the end, soft hairline between rows, paper and hairline ring on hover.

### Floating Player (signature)
Paper, 54px, 17px radius, float shadow; the rosette play button, current time (ink, 600), a segmented timeline (one segment per line: `line`, teal when done, honey when looped; grows on hover; drag to loop), end time, and a 32px loop icon button (honey tint when pressed).

### Rosette (signature)
An ink centre, a thin paper ring and the abalone conic gradient: 17px brand mark, 38px play button, 112px processing disc turning once per 9s. With album art, the disc becomes a 14px-radius art square with a 40px turning rosette badge.

### Processing Steps
Five 6px bars in a row: teal when done, honey and breathing (1.6s) for the current step, `line` for the rest; the step text below updates in place.

### Chord Diagrams
56px stroked SVG boxes: `ink-3` grid, `ink` nut, dots, barres and fret numbers; the chord name above in 700 / 12px.

## Do's and Don'ts

### Do:
- **Do** keep honey for capo and loop and teal for "now" (The Two Jobs Rule).
- **Do** keep type small: 13px UI, 11-11.5px labels, 16px light lyrics, 26px titles.
- **Do** draw hairlines as 1px `line` / `line-soft` and float only the player, disc and sounding chord.
- **Do** use the abalone rosette only for play, the brand mark and processing.
- **Do** draw icons as inline stroked SVG (1.4-1.8px strokes, round caps).

### Don't:
- **Don't** give chord pills borders or make them bigger: they stay borderless, 11px, 7px radius.
- **Don't** add toolbars or panels around the sheet; controls live in the pill row and the floating player.
- **Don't** go dark, neon or dashboard-like; don't add a monospace chord grid.
- **Don't** copy the Strum app's logo, name styling or assets.
- **Don't** invent logos, illustrations or photography; album art comes from the song source only.
