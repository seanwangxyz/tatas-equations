# Handoff: Middle-division variation cards (agent `vari2`)

Fourteen new official variation cards, earned after the five Elementary ones (docs/handoff/variations.md):
**Average, Upside-down, Sideways, Exponent Colour, Multiple of k, Powers of Ten, Factorial, Number of Factors,
Smallest Prime, LCM, GCF, Percent, Decimal Point, Base m** (in unlock order). The official wording I used, how each is
read, and every judgment call are in RULES_SUMMARY.md section 6. Left out: bases eleven and twelve (Junior list only)
and combinations of cards (one card per shake, as before).

## Files in this branch

| File | What changed |
|---|---|
| `js/engine.js` | Operator table `Eq.OPDEF`; one-character symbols for the new meanings (`Eq.UD`, `Eq.SW`, `Eq.EX`, `Eq.POB`); `opCore` / new `unCore` maths; evaluator rebuilt on the table (prefix / postfix ops, decimal numerals, base m, percent's two-digit rule); `checkGoal` / `checkSolution` (factorial budget, Multiple of k, exponent colour, kind card hints); the solver (turned leaves, powers of ten, decimals, exponents, one-number ops, Multiple of k targets, base m); `goalIdeas` for creature Goals; `Eq.cubeTokens` (solver symbols to real cubes, shared by the game, the playtest and the tests), `Eq.expCounts`, `Eq.resolve`, `Eq.cubeOf`, `Eq.orient`, `Eq.withOrient`. With no card everything is exactly as before (all old tests pass unchanged). |
| `js/variations.js` | The 14 cards (icon, kid name, rule, example, official reference, lesson), settings choosers (k / base / colour), "can it affect the shake" for each, per-card Parent switches (`S.set.variOff`), the live `G.fractions` for Exponent Colour, `Vari.lessonHTML(id)`, `Vari.exprHTML(...)` (an expression drawn with turned cubes and labels), `Vari.goalHTML(size)`, `Vari.parentHTML()`, `Vari.cardName(id)`. `Vari.cubeTokens` now calls `Eq.cubeTokens`. |
| `css/variations.css` | Middle card border, setting buttons, turned cubes (`.vtok`, `.vt-ud`, `.vt-sw`, `.vt-exp`, labels, the ✕), lessons, Parent switches. |
| `js/builder.js` | Tap a placed cube to cycle what it means (upright / upside-down / sideways; 1 → 10 → 100 …; √ ↔ lcm / percent; ^ ↔ gcf / point; exponent colour up/down), ✕ to take it out, a "!" button, + goes in as average, a coloured digit after a number goes in as an exponent, × read by its place, labels under each cube, card checklist lines, Multiple of k live text. Submitted tokens are made explicit with `Eq.resolve`. `recordSolution` counts card symbols as the cube they use. |
| `js/ai.js` | `AI.VERSION` 5. `chooseGoal` maps Goals to cubes with `Eq.cubeTokens` (turned cubes, averages, `!`), tags exponent-colour digits, keeps the one cube a card needs. `chooseVariation`: Middle cards only for 4+ stars (`AI.MIDDLE`), taste nudges. |
| `js/ai-worker.js` | Unchanged. The card still rides inside `fractions` (plain data; the live Exponent value is read into plain data when the message is built). Checked in the browser: `AIThink.debug.last.how === 'worker'` for chooseGoal, turn and write under Exponent Colour and Upside-down. |
| `tests/engine.test.js` | Block "MIDDLE-DIVISION VARIATION CARDS": 193 new checks (572 total). |
| `tests/playtest.js` | New cards (`midcard` = a random Middle card), random settings, the live Exponent mode, '!' in Goals, and the re-check now maps each creature Solution to real cubes and runs `Eq.checkSolution`. Also fixed: the fake browser had no `location` (config.js now reads it), so the playtest crashed on start. |
| `RULES_SUMMARY.md` | New section 6; section 5's "left out" table updated. |

## Please paste (I committed none of these; anchors are exact text in your files)

**1. `js/game.js`, flat mat Goal** (`renderGame`). Without it, an upside-down 7 in the Goal shows upright on the mat
(the value is right, the picture is wrong). Right after the line that starts
`  var goalHTML = G.goalTokens.length ? G.goalTokens.map(` add:

```js
  if (window.Vari && Vari.goalHTML) { var vgH = Vari.goalHTML(''); if (vgH) goalHTML = vgH; } // VARIATIONS: turned cubes and second meanings in the Goal
```

**2. `js/game.js`, 3D Goal HUD** (same function). Replace
`'<span class="expr">' + tokensHTML(G.goalTokens, G.cubes) + '</span>'` with

```js
'<span class="expr">' + ((window.Vari && Vari.goalHTML && Vari.goalHTML('mini')) || tokensHTML(G.goalTokens, G.cubes)) + '</span>'
```

**3. `js/game.js`, end-of-shake Solutions** (`solHTML` and `endShake`). The cubes already show "−3", "1/3", "avg" as
text, so this is a nice-to-have that draws them turned with labels, like the builder:

```js
// solHTML():   var body = exprBox(s.tokens, G.cubes);   becomes
  var body = (window.Vari && Vari.on()) ? '<div class="expr vari-expr">' + Vari.exprHTML(s.tokens, G.cubes, G.fractions) + '</div>' : exprBox(s.tokens, G.cubes);
// endShake():  ... + exprBox(sample) + ...   becomes
  ... + ((window.Vari && Vari.on()) ? '<div class="expr vari-expr">' + Vari.exprHTML(sample, null, G.fractions) + '</div>' : exprBox(sample)) + ...
```

**4. `js/game.js`, end-of-shake sample under Multiple of k.** The line under "One way that works" prints
`'= ' + Eq.fmt(G.goal)`, but with Multiple of k the sample equals something else (11 for the Goal 5). Replace that
`Eq.fmt(G.goal)` (only the one in the sample line) with:

```js
(Eq.rulesOf(G.fractions).multk ? (function () { var e = Eq.evaluate(sample, { fractions: G.fractions }); return e.ok ? Eq.fmt(e.value) + ' <small>(the Goal is ' + Eq.fmt(G.goal) + ': a multiple of ' + Eq.rulesOf(G.fractions).k + ' away)</small>' : Eq.fmt(G.goal); })() : Eq.fmt(G.goal))
```

**5. `js/screens.js`, Parent corner** (`renderSettings`). In the "Variation cards" row change `' of 5.</small>'` to
`' of ' + (window.Vari ? Vari.CARDS.length : 5) + '.</small>'`, and right after that row (the line ending
`... (S.set.variations !== false ? '✔ On' : 'Off') + '</button></div>' +`) add:

```js
    (window.Vari && Vari.parentHTML ? Vari.parentHTML() : '') +
```

`Vari.parentHTML()` draws one switch per card (🔒 on cards not unlocked yet); tapping one runs `ACT.variToggle`
(defined in `js/variations.js`), which saves `S.set.variOff` and calls `renderSettings()`.

**6. `js/config.js`, defaults** (optional, the code copes without it): in `set: { ... }` add `variOff: {}`.

**7. `js/camp.js`, "How it works"** (your area; I only provide the HTML). For each unlocked card with a lesson:

```js
// a row of buttons, e.g. at the bottom of the Camp menu:
(window.Vari ? Vari.unlocked().filter(function (c) { return c.lesson; }).map(function (c) {
  return '<button class="btn" data-act="variLesson" data-arg="' + c.id + '">' + c.icon + ' ' + esc(c.name) + '</button>';
}).join('') : '')
// ACT.variLesson (in js/variations.js) opens Vari.lessonHTML(id) in a pop-up with a "Got it!" button.
// Or put the HTML in your own screen: Vari.lessonHTML(id) returns the card, 3 worked examples with values
// worked out by the engine, and the official reference (no buttons).
```

The new-card announcement and the table chip's pop-up already have a "How it works" button.

**8. `js/online.js`: keep Middle cards out of online play for now.** Online passes tokens through `symOK`
(`'0123456789m'` + `Eq.OPS`) and `safeTokens` (keeps only `{s, id}`), so a guest's upside-down 3 or `!` would be
dropped, and `G.variSet` (k, base, colour) is not synced. Until that is done, add
`.filter(function (id) { return !Vari.card(id).tier; })` after `.filter(Vari.hasEffect)` (around line 721, the host's
card list) and after `.filter(function (id) { return Vari.card(id); })` (around line 438, the guest's list).
Full support would need: `symOK(s)` true when `Eq.cubeOf(s) !== null`; `safeTokens` keeping the string `'!'`;
`cubeTokens` checking `Eq.cubeOf(t.s) === cube.s` instead of `t.s === cube.s`; and `G.variSet` in the synced state
(then the guest calls `Vari.apply(id, set)`).

**9. README.md**: the test count line becomes 572 checks.

## How to add an operator (for the "bonus cubes" helper)

All in `js/engine.js`:
1. Pick a one-character internal symbol (the solver's expression text is split with `split('')`), e.g. `'s'` for
   square or `'|'` for absolute value. Add `SHOW[sym] = 'what the cube shows'`.
2. Add an `OPDEF` entry: `kind` `'bin'` (with `lvl` 1 / 2 / 3 / 3.5 and `comm` if a∘b = b∘a), `'pre'` (applies to the
   number right after it) or `'post'` (the number right before it, binds tightest); `cube`: the face it spends (a new
   face is fine, e.g. `'s'`, as long as the cube lists say so); `card`: a `rulesOf` flag that switches it on, or null.
3. Put the maths in `opCore` (binary) or `unCore` (one number). Return a reduced fraction from `frac(...)` or an error
   code string, and add the code's kid-friendly line to `MSG`. Keep it exact: refuse cases that are not rational.
4. If it belongs to a card: add the id to `VARIATIONS` and `FLAG`, and a name to `CARDNAME`.
5. A new cube face only has to be on the cubes (`CUBE_FACES` or the 20-sided die's face list). The solver counts
   every face named in `OPDEF` (`CUBE_TYPES`), so you do not need to add it to `Eq.OPS` (other screens read `OPS`:
   the Parent corner's operation switches and online's symbol check).

The parser (precedence from `lvl`, prefix/postfix), the solver (it walks `OPDEF` for binary ops and one-number ops,
counts the cube each spends, and prints the fewest parentheses from `lvl`), `Eq.cubeOf`, `Eq.cubeTokens` and the
builder's labels then pick it up. Add a `CAP` label in `js/variations.js` if the cube shows a different face than
its meaning. Then add tests like the Middle block (hand cases, a round trip through `Eq.cubeTokens` +
`checkSolution`, and a brute-force comparison on a small cube set).

## What the 3D side would need (js/three/*, not touched)

- **A turned cube in the Goal** (Upside-down, Sideways; Percent is an upside-down √): when the Goal is placed, the
  cube's mesh should rest rotated: 180° about the axis pointing at the players for upside-down, 90° for sideways.
  Which cube and how: for each Goal token `t` (objects in `G.goalTokens`), `Eq.orient(t.s)` gives
  `{d, o: 'u' | 's' | ''}`; `t.s === '%'` is an upside-down √. The cube's face (`G.cubes[t.id].s`) does not change.
- **Second meanings in the Goal** (average, LCM, GCF, # factors, next prime, decimal point, a 1 as 10/100,
  an exponent): a small floating label over the cube, text from `Vari.capOf(t.s, Eq.rulesOf(G.fractions), G.goalTokens, i)`
  ('' = none). An exponent cube (`Eq.exOf(t.s) >= 0`) could sit raised and smaller, top-right of the previous cube.
- **! signs** in the Goal are plain strings `'!'` in `G.goalTokens` (no cube); the HUD shows them, the table could
  draw a chalk "!" next to the cube before it.
- Required / Permitted cubes are never turned on the mat: officially the Mover's placement binds nobody
  (manual C30, C31, C33, C35, C37–C41), so only the Goal and the written Solutions show meanings.
- With hook 2 above the 3D Goal HUD already shows the turned cubes and labels in 2D.

## Verified, and not

Verified:
- `node tests/engine.test.js`: 572 passed, 0 failed (193 new). The brute-force check caught one real bug while I
  wrote it (a lone `3!` counted as two cubes in the solver) and it is fixed.
- Playtest, every Middle card, 4 shakes per pairing at stage 4 (all 25 pairings, ~100 shakes per card): every game
  finished, and every creature Solution, mapped to real cubes and re-checked with `Eq.checkSolution`, was correct
  (numbers in the final report).
- Browser (flat mat, my own tab on port 3497): for each of the 14 cards I picked the card in the real picker
  (with the k / base / colour chooser for the three that have one), built a Goal that uses it in the Goal builder,
  built a wrong Solution (saw the specific reason) and a correct one (accepted), all through the real builder handlers.
  Ollie (4 stars) picked Exponent Colour and Upside-down himself, set Goals that use them (e.g. 9 + an upside-down 7),
  played turns and wrote correct Solutions in the worker. Lessons render for all 14 cards with values that match
  their text. The Parent switch toggles. No console errors.

Not verified:
- The 3D table with a card in play (flat mat only), and the game.js / screens.js / camp.js snippets above in place
  (I simulated hook 1 in the browser by inserting `Vari.goalHTML('')` into the Goal zone: it draws correctly).
- Online play with the new cards (see snippet 8: keep them out for now).
- Phone-size layout of the long card picker when all 19 cards are unlocked (it scrolls; normal play unlocks one at a time).
