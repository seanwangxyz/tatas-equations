# Handoff: Tata's On-Sets (first playable version)

A second game in the same site: **ON-SETS: The Game of Set Theory**, Elementary basic rules, flat 2D mat.
Rules and every interpretation: `ONSETS_RULES_SUMMARY.md`.

## New files (no existing file was edited)

| File | What it holds |
|---|---|
| `js/onsets/engine.js` | `OSE`: cards, rolling, Goals (7 shapes), Set-Name parser that keeps every legal grouping, Restrictions (for later divisions), `checkSolution` with kind reasons, solver (`solve`, proofs only when complete), `goalIdeas`, `scoreChallenge` (same as Equations). Pure; node-testable. |
| `js/onsets/ai.js` | `OSAI` (creature decisions, 4 strength levels from stars) and `OSThink` (runs them in a Web Worker, falls back to the page). |
| `js/onsets/ai-worker.js` | The worker (loads `engine.js` + `ai.js` from its own folder). |
| `js/onsets/ui.js` | `OSUI`: cards, cubes, Goal picture, the Set-Name builder (live-lights the cards in the set and shows the count) and the Goal builder. Creates its own overlay `#osB` at first use. |
| `js/onsets/game.js` | Match flow (`OG`), saving helpers (`osState`, `osStar`), mat rendering. |
| `js/onsets/teach.js` | Tutorial (9 short steps, tiny 5-card Universe) and 4 drills. |
| `js/onsets/menu.js` | `Onsets.open()`, `Onsets.tileHTML()`, opponent picker, two-player setup, rules pop-up. |
| `css/onsets.css` | All styling, scoped to `#onsets`, `#osB` and `.os-*`. |
| `tests/onsets.test.js` | 119 checks: rules examples with page numbers, manual situations by number, solver round trips, brute-force comparison, scoring equal to Equations, AI behaviour. |

## Snippets to wire it in (index.html)

1. Stylesheet, right after the TITLE stylesheet line
   `<link rel="stylesheet" href="css/title.css"><!-- TITLE: 3D title screen layout -->`:
   ```html
   <link rel="stylesheet" href="css/onsets.css"><!-- ON-SETS: the sister game -->
   ```
2. Screen, right after `<section id="fans" class="screen"></section>`:
   ```html
   <section id="onsets" class="screen"></section>
   ```
3. Scripts, right **before** `<script src="js/main.js"></script>` (they need `ACT`, `modal`, `go`, `Snd`,
   `OPPONENTS`, `banner` from the earlier scripts):
   ```html
   <script src="js/onsets/engine.js"></script><!-- ON-SETS -->
   <script src="js/onsets/ai.js"></script>
   <script src="js/onsets/ui.js"></script>
   <script src="js/onsets/game.js"></script>
   <script src="js/onsets/teach.js"></script>
   <script src="js/onsets/menu.js"></script>
   ```

## The menu tile

`Onsets.tileHTML()` returns one `<button class="btn big os-tile" data-act="osOpen">`. Suggested place:
in `gotoTitle()` (js/ui.js), inside the `<nav class="menu">`, right after the line
`item('orange', 'tutorial', 'cap', 'How to Play') +`:
```js
    (window.Onsets ? Onsets.tileHTML() : '') +
```
(Or in the Play/setup screen in js/screens.js `renderSetup()`, if the owner prefers it there.)
`ACT.osOpen` already exists; "Back to Equations" in the On-Sets menu calls `gotoTitle()`.

## Saving

Progress is `S.onsets`, created lazily by `osState()` (js/onsets/game.js) and kept by the existing
`merge()` on load and in export codes. Optional, for clarity, add to `defaults()` in js/config.js after
`teamWins: {},`:
```js
    onsets: { v: 1, stars: 0, beaten: [], drills: {}, stats: { shakes: 0, correct: 0, attempts: 0, nowWins: 0, impWins: 0, matches: 0, wins: 0 }, deal: 8, tutorialDone: false, row: 0, p2: 'Tata' },
```
Stars (On-Sets only, never time-based): correct Now!/Impossible! vs a creature, proving a wrong
Impossible! wrong, a correct Solution after the last cube, first/any win vs a creature, the tutorial,
and every 3 right in a row in drills. Levels: `OS_LEVELS` in game.js. Opponents open in order per
league (`osOpen`), separately from Equations.

## What is playable

- **vs a creature** (all 10 OPPONENTS; names, faces, greet/think/now/imp/goal/lastCube/gloat/sore/kidWrong
  lines reused). Strength: 1★ = level 1 (sees Set-Names up to 3 cubes), 2★ = 2 (5 cubes), 3★ = 3 (7),
  4–5★ = 4 (all; never misses). Weak creatures can call Impossible! wrongly, which the kid beats by
  writing a longer Solution (tested in the browser: Snoozy did exactly this).
- **Two players, pass and play** (second player's name asked once, remembered).
- Shake flow: Goal-setter chooses VVΛ or VΛΛ → dealer chooses 6–12 cards → roll and deal → Goal builder
  (shapes, upside-down) → moves → Now!/Impossible! → Solution builder → scoring 2/4/6 → match result.
  "No Goal" with agree/challenge (and the creature version). Last-cube rule. Hint button.
- **How to Play** tutorial and **Set Drills**: How many cards?, Name this set, Make the Goal, Now or not yet?

## Verified

- `node tests/onsets.test.js`: 119 passed. `node tests/engine.test.js`: 822 passed.
- Browser (scratch index.html with the snippets, port 3518, reverted before commit), no console errors:
  - 1280×800: tutorial start to finish (wrong pick feedback, all steps, building B − G); full 3-shake
    match vs Snoozy won (correct Now! with one Resource cube; my wrong Impossible! scored 2/6; Snoozy's
    wrong Impossible! beaten with (Y − G)′; result screen, Penny unlocked, stars saved); the builder's
    live highlighting, ambiguity-free count, checklist; Goal builder shapes and upside-down cube.
  - 1024×768: pass-and-play shake to the last cube, "Pass to…" screens, one right and one wrong
    Solution (kind reasons shown).
  - 390×844: match vs Mondo (Mondo called Now! correctly), every drill type answered right and wrong,
    "No Goal" challenged in pass-and-play; mat and pop-ups fit the phone width.
  - An Equations two-player match still starts with the On-Sets scripts loaded.
- Not verified: drills and menu screenshots at 1280 at the very end (the shared browser pane stopped
  returning full screenshots; the page text checked out); iPad touch; sound/voice lines by ear;
  Web Worker fallback path on an old browser (code mirrors AIThink).

## Next steps (not in this version)

- 3D table, avatars and creature animations for On-Sets (the mat is flat 2D only).
- Three players (engine scoring supports a Third Party; the flow is 2-player only).
- Variations (Elementary list, page O17) and Middle-division Restrictions (= and ⊆): the engine already
  parses and applies Restrictions; the solver and builder need a Restriction line.
- Bonus moves; online play; Trophy-room badges and Stats for On-Sets; a daily On-Sets puzzle.
- A Settings switch for "Goals that can't be made" (interpretation 3) if Tata wants the strict rule.
