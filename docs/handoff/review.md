# Handoff from `review`: "💡 One thing Pip spotted"

After a match against a creature, Pip may offer **one** friendly tip about a moment where a stronger
move existed. It sits behind a small optional button on the match-end screen and never opens by itself.
If the engine can't prove anything, no button appears (or, if he played cleanly, a "⭐ A moment Pip
loved" highlight of one of his winning challenges appears instead).

## Files in this branch

| File | What |
|---|---|
| `js/review.js` (new) | `Recorder` (notes during play), `Review` (pure analysis, needs only `Eq`), and the button/card UI (`Review.slotHTML`, `Review.afterMatch`, `ACT.pipSpot`, `ACT.pipSpotDone`) |
| `css/review.css` (new) | The button and the tip card (classes start with `ps-`) |
| `tests/engine.test.js` | A block marked `REVIEW ... END REVIEW`: 23 checks (one hand-built position per tip kind, "nothing provable → no tip", the pick rule, the time cap, the tone rules). See judgment call 9 about where it sits |

Nothing else was changed. **Everything below must be pasted by whoever owns those files.**
I applied snippets 1-8 exactly as written to a scratch copy, played full matches in the browser with
them, then reverted (see "What I checked").

## Please paste

### 1. `index.html`

After `<link rel="stylesheet" href="css/team.css">`:

```html
<link rel="stylesheet" href="css/review.css">
```

Directly after `<script src="js/game.js"></script>` (it adds to `ACT`, so it must come after game.js):

```html
<script src="js/review.js"></script>
```

### 2. `js/game.js`, `startMatch`: start a fresh notebook

After the line `  else G.players.push({ name: 'Player 2', ai: null, score: 0, list: [] });` add:

```js
  if (window.Recorder) Recorder.start(G); // REVIEW: notes for "One thing Pip spotted" (js/review.js)
```

`Recorder.start` itself decides whether to record: only `G.mode === 'ai'` (this includes Cup matches),
2 players, player 0 human, and `S.set.review !== false`. Tutorial, team, pvp and 3-player games are ignored.
It also forgets the previous match, so at most one match is ever kept.

### 3. `js/game.js`, `setGoal`: the Goal

After the line `  if (window.Vari) Vari.afterGoal(tokens); // VARIATIONS: 0 Wild needs the Goal's cubes in the math mode` add:

```js
  if (window.Recorder) Recorder.note('goal', { by: G.setter, goal: val, goalTokens: tokens, cubes: G.cubes, fr: G.fractions, shake: G.shake }); // REVIEW
```

(It must come after `Vari.afterGoal`, so `G.fractions` already carries the variation card and the Goal's symbols.)

### 4. `js/game.js`, `placeCube`: every cube move (the kid's and the creature's), BEFORE the cube moves

```js
function placeCube(id, zone, who) {
  var c = G.cubes[id];
  if (window.Recorder) Recorder.note('move', { by: who, id: id, zone: zone, cubes: G.cubes, goal: G.goal, fr: G.fractions }); // REVIEW (before the cube moves)
  c.zone = zone; ...
```

i.e. insert the middle line right after `  var c = G.cubes[id];` inside `placeCube`.

### 5. `js/game.js`, `challenge`: every Now! / Impossible! call

First line inside `function challenge(kind, who) {`:

```js
  if (window.Recorder) Recorder.note('challenge', { by: who, kind: kind, cubes: G.cubes, goal: G.goal, fr: G.fractions }); // REVIEW
```

### 6. `js/game.js`, `writeSolution`: every Solution written (kid and creature, any mode)

First line inside `function writeSolution(pi, mode, cb) {`:

```js
  if (window.Recorder && Recorder.armed()) { var cb0 = cb; cb = function (ok, tokens, chk) { if (G) Recorder.note('solution', { by: pi, mode: mode, ok: ok, tokens: tokens, cubes: G.cubes, goal: G.goal, fr: G.fractions }); cb0(ok, tokens, chk); }; } // REVIEW
```

Not calling Now!/Impossible! is not a separate note: the analysis sees it as "the creature moved, then
the kid moved" (or, after the creature's last cube, "the kid wrote a `last` Solution").

### 7. `js/game.js`, `endMatch`: the spot for the button

Right before the line `  var cupRow = (G.mode === 'ai' && window.Cup && Cup.active()) ? ...` add:

```js
  if (window.Review) html += Review.slotHTML(); // REVIEW: empty spot; the button appears only if Pip found something
```

and right after `  modal(html, null);` (the last line of `endMatch`) add:

```js
  if (window.Review) Review.afterMatch(); // REVIEW: thinks at most ~1.5 s, in small slices
```

`slotHTML()` returns `''` when nothing was recorded (other modes, switch off). `afterMatch()` hands the
notes over (the Recorder forgets them), analyses in 30 ms slices with `setTimeout`, and fills the spot
with the button only if a tip was found and the same match-end screen is still open. The team match
returns earlier (`Team.endMatch()`), so it never gets a tip.

### 8. `js/screens.js`, Parent corner: the switch

Right after the "Variation cards" `setrow` line (the one ending `... 'Off') + '</button></div>' +`) add:

```js
    '<div class="setrow"><label>Pip\'s tip after a match<br><small style="font-weight:600">A "💡 One thing Pip spotted" button on the results screen. It only shows a moment the game can prove (a Now! or Impossible! chance, a safe move, a Solution). Tips opened: ' + ((S.tips && S.tips.seen) || 0) + '</small></label><button class="btn small ' + (S.set.review !== false ? 'green' : '') + '" data-act="toggleSet" data-arg="review" data-def="1">' + (S.set.review !== false ? '✔ On' : 'Off') + '</button></div>' +
```

It reuses the existing `ACT.toggleSet` (on by default, like `variations`).

### 9. `js/config.js`, `defaults()` (optional but tidy)

In `set: { ... variations: true }` add `review: true`, and next to `vari: { base: null, seen: 0 },` add:

```js
tips: { seen: 0, kinds: {}, last: [] },
```

`js/review.js` creates `S.tips` itself if it is missing and treats a missing `S.set.review` as on, so
old saves and a missing default both work.

### 10. README / TODO (suggested)

README file map, after the `js/game.js` row:

```
| `js/review.js` | "One thing Pip spotted": notes during a creature match, the after-match analysis (only provable tips), the tip button and card |
```

Optional worker version: not needed (see timings below). If ever wanted, add `'analyse'` support by making
`ai-worker.js` also `importScripts('review.js')` and dispatch `Review.analyse(log, opts)`; the log is plain data.

## How the analysis works (js/review.js)

Each note copies the 24 cubes as `{i, s, c, z, o, l}` (id, symbol, colour, zone, order, locked), plus the
Goal value and `G.fractions` (fractions + variation card, plain data). About 40 notes per 3-shake match.

After the match the notes become small jobs, tried in this order. The first proven tip of each kind is kept:

| Kind | When | Proof |
|---|---|---|
| `now` (a) | The creature just moved, the kid did not call Now! (moved, or called Impossible! and lost), and a Now! was allowed | A concrete Solution with at most 4 number cubes, using the mat plus at most one Resource cube |
| `imp` (a) | The creature just moved or set the Goal (or played the last cube), and the kid did not call Impossible! | The solver's search finished and found nothing (only possible with at most 6 number cubes in play) |
| `safe` (b) | The kid's move gave the creature a Now! (concrete Solution) or an Impossible! (finished search) | A concrete other move after which the Goal can still be made (concrete Solution) AND no Now! exists (finished search, or Now! not allowed). Same cube in another zone is tried first |
| `solution` (c) | The kid's Solution was not correct; or it was correct but a Solution with 2+ fewer cubes exists | A concrete Solution under the same rule (Now!: one extra cube; Impossible!: all Resources; last cube: mat only) |
| `goal` (c) | The kid set a Goal that no Solution can reach | Finished search, plus a concrete Goal from the same cubes with a concrete Solution |
| `nice` (fallback) | No tip at all: the kid won a Now! (his Solution), won an Impossible! (the creature could not write one), or answered the creature's Impossible! with a correct Solution | The game's own `checkSolution` result |

Pick: the first kind in the order above, except that the same kind is not given three matches in a row
when another kind was found this match (`S.tips.last`). Every Solution the solver returns is
re-evaluated with `Eq.evaluate` before it is shown. When showing a Solution, Pip first looks for one that
uses only + − × ÷ (roots and powers only when they are Required), then any.

## Testing hooks

- `Recorder.peek()`: the notes of the match in progress. `Recorder.armed()`.
- `Review.current()`: the tip on the current match-end screen (`{kind, variant, lines, pic, raw}`).
- `Review.analyse(log, { budgetMs, recent })`: synchronous, pure (this is what the tests call).

## What I checked

- `node tests/engine.test.js`: 343 passed, 0 failed (320 before + 23 new).
- Browser (`python -m http.server 3475`, snippets 1-7 applied to a scratch copy, flat mat, a script
  making random moves for the kid and giving up on every Solution): three full matches against Rusty.
  The button appeared each time (all were `now` tips). The analysis took 21 ms and 7 ms on the page.
  The card opens, "Got it" folds it back to the button, `S.tips` is saved, it fits a 375 px phone screen,
  and with `S.set.review = false` nothing is recorded and no spot is added. The "Play again" path works. No console errors.
- Node stress test (12 random 3-shake matches, with fractions, without, and with Use It Again): the whole analysis took at most
  114 ms; the longest single job took about 100-160 ms (one solver call with its own time limit).
- **Not checked:** the 3D table path (the snippets don't touch it, but I played flat only); a real
  kid's play; Cup and variation-card matches in the browser (the variation card is covered only by the node stress
  test); the Parent-corner switch (snippet 8) and config defaults (snippet 9) were not applied in the browser;
  iPad speed.

## Judgment calls (please review)

1. **Only creature matches, 2 players** (`G.mode === 'ai'`, Cup included). Team-up, pvp and 3-player games get no tip.
2. **"Now!" tips only show Solutions with at most 4 number cubes**, and the creature's handed Now! at most 5,
   so the tip is something an 8-year-old could have found. A Now! that needs 5-6 cubes is not reported.
3. **Impossible! needs a finished search**, which the solver can only do with at most 6 number cubes in play,
   so Impossible! and safe-move tips only happen late in a shake. That is the "prove it" rule working as intended.
4. **"Cleverer Goal" is limited to Goals no Solution can reach** (with a concrete working Goal offered).
   "Cleverer" in any other sense can't be proven, so I left it out. The other part of (c) is "a much shorter
   Solution" (2+ fewer cubes) for a correct one.
5. **The nice-moment fallback** ("⭐ A moment Pip loved") shows one of his winning challenges when no tip exists.
   The brief allowed either nothing or this. If you prefer nothing, delete the three `N.push(...)` lines in `plan()`.
6. **On the 1.5 s cap, Pip keeps what is already proven** and picks from that, instead of throwing it away.
   Everything kept is still proven; only the "best of all" ranking may be incomplete. In practice the analysis
   finished in 7-114 ms.
7. **The tally counts tips he OPENS**, not tips offered (`S.tips = { seen, kinds, last }`). `last` holds the last
   two kinds opened. I added `last` to the proposed `{ seen, kinds }`, because "three in a row" needs the order.
8. **The tip is shown inside the match-end pop-up** (a card that unfolds under the scores, "Got it" folds it back),
   not as a second pop-up. That's because `modal()` replaces the pop-up content, so the results screen would be lost.
9. **Test placement:** `tests/engine.test.js` ends with `process.exit(...)`, so code appended after it never runs.
   I put my block directly before the final two summary lines (`console.log(... passed ...)` / `process.exit`).
   If another helper does the same, the merge is just two blocks in a row before those lines.
10. **Wording**: "In shake N, ..." opens every tip so he can find the moment. An operation cube is called
    "the ÷ cube", a digit "the 7". The tests reject "mistake", "wrong", "should have", "missed", "miss",
    "bad move", "oops". A Now! tip can be four short sentences, because it follows the owner's own example
    ("That is a Now! moment. Next time, look for it!").
11. **Solutions can still look grown-up** when Required cubes force it (e.g. `7 − (2 − 7) × 3`), or when the
    only Solution needs a root or power. I prefer + − × ÷ when possible, but don't filter out negative steps.
