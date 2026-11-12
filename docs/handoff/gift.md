# Handoff: "Puzzle from Tata" (agent `gift`)

A grown-up sets a puzzle and the kid solves it, with no internet connection needed. The maker picks
the cubes, builds a Goal, can mark cubes Required or Forbidden, and can add a short message. The
solver confirms that a Solution exists, and then the game gives a short code such as
`T24U-BVDW-6CEF-HNPA` (read it out or text it). There is also a link that carries the message. The
kid types the code, solves the puzzle with the normal Solution builder, and gets a 4-letter
**receipt** to tell Tata. Tata can check the receipt under **Check a receipt**.

## Files in this branch

| File | What |
|---|---|
| `js/gift.js` | The mode. Top block `/*GIFT-CODEC-START*/ … /*GIFT-CODEC-END*/` = `GiftCode`: the code, its check character, receipts, and the link/hash parser (pure, unit-tested). Below that are the screens: hub, maker, code entry, solver, and receipt check. |
| `css/gift.css` | Its styles (all classes start with `gf-`) |
| `tests/engine.test.js` | 36 new checks (356 total, all pass). The block is marked `PUZZLE FROM TATA` and sits just **before** the final `console.log(... passed ...)` / `process.exit` lines. Code placed after `process.exit` would never run, so this was the only way to "append" checks that actually run. |

`js/gift.js` does nothing until it is wired in. It adds `ACT.giftOpen` (and friends), plus
`giftTileHTML()` and `giftFromHash()`, and one `hashchange` listener. It needs `Eq`, `S`, `ACT`,
`B`/`renderBuilder` (builder.js), `modal`/`closeModal`/`drainQueue`/`addXP`/`recordSolution`/`checkBadges`
(progress.js / builder.js), `stageInfo`/`ladderOff`/`STAGES`, `cubeHTML`-style markup, `tokensHTML`,
`exprBox`, `pipHTML`, `ico`, `go`, `current`, `shuffle`, `esc`, `show`, and `victoryFX` if it exists.
If `<section id="gift">` is missing, it creates one on the fly. Please add the section anyway.

## Wiring (please paste; I committed none of this)

**1. `index.html`**

After `<link rel="stylesheet" href="css/team.css">` add:
```html
<link rel="stylesheet" href="css/gift.css">
```
After `<section id="settings" class="screen"></section>` add:
```html
<section id="gift" class="screen"></section>
```
After `<script src="js/ways.js"></script>` add (it must load after `game.js`, `builder.js`, `progress.js`):
```html
<script src="js/gift.js"></script>
```

**2. Start-up hash check** (opening `…/index.html#puzzle=…` goes straight to that puzzle, skipping
the splash). At the very end of `js/main.js`, after the `window.TataGame = …` line, add:
```js
if (typeof giftFromHash === 'function') giftFromHash(); // '#puzzle=…' opens a Puzzle from Tata
```
Nothing else is needed for links pasted into a tab that is already open: `gift.js` listens for
`hashchange` itself. Audio still starts on the first tap, because `main.js` calls `Snd.init()` on
every `data-act` click.

**3. Where the tile lives: "Play with people"** (my proposal, since it's a family thing). In
`js/screens.js`, `renderSetup()`, change
```js
    '<h3 class="tierh">' + ico('people') + ' Play with people</h3><div class="opps">' +
    (window.Team ? Team.setupCardHTML() : '') +
```
to
```js
    '<h3 class="tierh">' + ico('people') + ' Play with people</h3><div class="opps">' +
    (window.Team ? Team.setupCardHTML() : '') +
    (typeof giftTileHTML === 'function' ? giftTileHTML() : '') +
```
If you'd rather put it in Training Camp, use the same line in `js/camp.js` `renderCamp()`, right
after `(typeof waysTileHTML === 'function' ? waysTileHTML() : '') +`. The Back button returns to
whichever screen opened it (setup, camp, or the title screen when he arrived via a link).

**4. Saved-data defaults (optional).** `gift.js` creates `S.gift` itself if it's missing, so old saves
work without this. For tidiness, add to `defaults()` in `js/config.js`, after the `ways: {…},` entry:
```js
    gift: { made: [], solved: {} },
```
- `made`: newest first, **max 30** entries: `{ code, msg, t, g: Goal text, n: ways found }`.
- `solved`: keyed by the canonical code, **max 200** (oldest dropped): `{ t, h: hints used, r: receipt, m: message }`.

**5. README**: add a file-map row
`| js/gift.js | Puzzle from Tata: a grown-up makes a puzzle, it becomes a short code; the kid solves it and gets a receipt |`
and change "320 checks" to "356 checks" (and add "puzzle codes" to that sentence).

## The code (version 1)

- Alphabet: `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (32 characters, no 0/O/1/I). Each character is one 5-bit value.
- Layout: `T` (version) · flags (bit 0 = fractions; the other bits must be 0) · Goal tokens · then
  `[26]` Required cubes, `[27]` Forbidden cubes, `[28]` Permitted cubes (each list appears only if it
  isn't empty) · one check character.
- A cube is `colour index × 6 + face index` from `Eq.CUBE_FACES`, so codes always use the real faces.
  `(` and `)` are allowed only inside the Goal. The cubes in each list are sorted, so one puzzle always
  has exactly one code. Decoding also re-encodes the result, so reordered spellings land on the same
  canonical code (and can't earn a second star).
- Check character: Σ value[i]·αⁱ over GF(32) (modulus x⁵+x²+1). It catches **every** single wrong
  character and **every** swap of two neighbours. The tests try all of them on two codes.
- Length: 2 + Goal tokens + up to 3 markers + table cubes + 1. Ten cubes with a 2-cube Goal and only
  Permitted cubes come to 14 characters (4 groups: `XXXX-XXXX-XXXX-XX`). The longest possible code is 31 characters (tests check ≤ 32).
- Typing is forgiving: spaces, dashes, dots and lower case are ignored. If someone types 0/O/1/I, a
  separate kind message explains it.
- Link: `<page>#puzzle=T24U-BVDW-6CEF-HNPA&m=<message, URL-encoded>`. The short code alone works too.
  A code made on this device also shows its saved message when typed by hand. The hash is cleared
  after reading (`history.replaceState`).
- A future version changes the first character (`U` = v2…). Version 1 codes refuse an unknown first
  character, or unknown flag bits, with "This code is from a newer version of the game."
- Changing `Eq.CUBE_FACES` would change what old codes mean. Bump the version if that ever happens.

## Receipt

4 characters = FNV-1a of `R1|<canonical code>|<hints, capped at 3>`, as 20 bits in the same alphabet.
**Check a receipt** tries hints 0-3 against every puzzle made on this device, or against a code typed
in, and says "solved with no hints / 1 hint / 2 hints / 3 or more hints". It proves the app showed the
receipt. It is not tamper-proof: someone who reads `gift.js` could compute it.

## Rules I invented (please review)

1. **The table's 6-14 cubes include the Goal cubes.** The Goal is built from the table cubes, as in a
   real shake (Goal cubes come from Resources), and at least 2 cubes must stay Required/Permitted.
   At most 6 cubes of any colour, because the real set has 6.
2. **No Resources zone.** Every table cube not in the Goal is Permitted (the default), Required or
   Forbidden. The maker taps a cube to cycle Permitted → Required → Forbidden.
3. **Fractions is the only "operation flag".** The operations themselves come from the cubes. The maker
   has a Fractions Off/On switch, which defaults to the device's current stage. No variation cards in
   gift puzzles. The Goal follows normal school order (RULES_SUMMARY #3).
4. **Goal at most 12 tokens** including ( ), so the code stays at 31 characters or fewer.
5. **Ways count**: `Eq.allWays` (same "different way" rules as How Many Ways?, 400 ms budget). Only ways
   that use every Required cube are kept, and the count is capped at "20 or more". If any cube is
   Required, or the count didn't finish, it says "at least N". (A Required cube that only joins as a
   helper, like +0, is folded away by the way-counter, so N is a lower bound.) Whether a code is issued
   depends **only** on `Eq.solve`: it searches every digit (at most 14 cubes), 2.5 s budget, and must
   actually find a Solution. If it finishes without one, it says "There is no Solution …". If it runs
   out of time, it says so and asks for fewer cubes. In node, 13-cube searches took ≤ 40 ms.
6. **Skill star**: the first time each distinct (canonical) code is solved, recorded in
   `S.gift.solved`. It works the same way as the drills and the Daily Puzzle: `recordSolution(..., noStar)`
   and then `addStar()`, which already does nothing when the ladder is off or finished. **No star for
   puzzles made on this device** (codes in `S.gift.made`); otherwise a kid could make "1+1" puzzles
   and farm unlocks. He still gets the celebration, XP and receipt. If Tata sets puzzles on the kid's own
   iPad and wants the star, delete `&& !madeHere` in the two places it appears in `giftChecked`.
7. **XP**: the normal `recordSolution` XP every time it is solved (like the Daily Puzzle, re-solving
   gives Solution XP but no star), plus **+30** the first time (`GIFT_XP.first`). Wrong tries cost
   nothing, but they go through `recordSolution` for stats like every other mode, which resets the
   correct-in-a-row streak.
8. **Hints are free and unlimited.** Each tap lights up one more Permitted cube from the solver's
   Solution, digits first (Required cubes are already known to be used). Hints don't cost the star.
   They only change the receipt, so Tata can see how many were used.
9. "Roll for me" does a real roll of all 24 cubes and keeps 6 digits + 4 operation cubes, unlocked
   operations first.
10. Message: max 60 characters (counted as characters, so emoji are safe). Control characters and extra
    spaces are removed, and it is always shown escaped.

## Operations ladder (item 6 of the brief)

The solver screen always lets him play. When the puzzle opens, `giftOpsNote` works out what he would
actually **need**:
- any locked operation in the Goal or among the Required cubes;
- locked Permitted operations, but only if no Solution exists without them (one `Eq.solve` with
  the Permitted cubes limited to his operations);
- fractions, if the puzzle has fractions on and he hasn't unlocked them, and either the Goal is a
  fraction or no Solution exists without fractions.

If any of these apply, one line shows above the mat: "🔓 Heads up: this one needs **^**, which you
haven't unlocked yet. You can still give it a go!". A locked cube that he doesn't need gives no note.
The check always uses the puzzle's own fractions setting (the maker's), so a Solution the maker's
check found is always accepted.

## Verified vs not

Verified (temporary copy of index.html with the wiring above, `python -m http.server 3474`, the
in-app Chromium browser pane. The copy was deleted and the server stopped):
- `node tests/engine.test.js`: 356 passed (320 before + 36 new): round trip on 400 random rolls,
  Goal with ( ) and fractions, canonical order, every one-letter typo and neighbour swap, the
  confusable / short / bad-character / version / flags messages, the puzzle rules, receipts (hints
  0-3, capped), link and hash parsing, message clean-up. `node --check js/gift.js`.
- Maker: palette add, Roll for me, Goal built through the real builder, Required/Forbidden cycling,
  the message kept across re-renders, an unsolvable puzzle ("There is no Solution…"), a solvable one
  (count, code, link, Show me one Solution), Change the Goal, the fractions switch, Back.
- Solver: start-up with `#puzzle=…&m=…` on a fresh page load (straight to the solver, message shown
  and escaped, hash cleared), the same through `hashchange` in an open tab, a lower-case code with
  spaces, the typo and 0/O messages on the entry screen, hints (cube glows, "seen every cube"),
  a wrong try with specific reasons and "Fix it" keeping the attempt, a correct try (celebration, XP,
  **one** skill star, receipt), a second solve (no second star, same receipt), no star for a puzzle
  made on this device, the ops note for a required ^, and the fractions note for a fraction Goal.
- Check a receipt: correct receipt with typed code ("solved with 2 hints"), a wrong one, and no
  puzzles made on this device.
- Layout at 375 px (maker, no sideways scroll) and desktop. No console errors.

Not verified:
- **Copy buttons**: the clipboard needs a real user tap, and my clicks were scripted, so both copy
  paths showed the "Couldn't copy here, press and hold" message. The fallback text is selectable.
- iPad / Safari, and sound (calls go through a guard; I didn't listen).
- Celebrations queued by a level-up or unlock right after a solve (it uses `drainQueue` exactly like
  the Daily Puzzle; I didn't trigger an unlock).
- The "ran out of time" maker message (never happened: 13-14 cube searches finish in milliseconds).
- The wiring snippets themselves in the real `index.html` / `main.js` / `screens.js` / `config.js`
  (tested only through my temporary copy, which had the same lines).
