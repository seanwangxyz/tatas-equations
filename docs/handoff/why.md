# Handoff: "Why did they do that?" (the 🤔 Why? button)

New files only: `js/why.js`, `css/why.css`, `tests/why.test.js`, this file. Nothing existing was edited.
Switch: Settings → "Why? button" (`S.set.why`, on unless set to `false`; no new top-level save key).

## What it does

After a move, a small **🤔 Why?** button sits in the action bar next to Pip's line (latest move only).
For the kid's own move it reads **🤔 What did my move do?** Nothing is ever said automatically.
The card (same look as the Explain card: `.xp-back .xp-card .xp-head .xp-body .xp-nav`) shows:
the move as a picture (`Rusty [7] → ⛔ Forbidden`), 1 to 3 short sentences, at most one example Solution
drawn as cubes (`Vari.exprHTML`, or `tokensHTML` without variations), and **Got it**. Read aloud when `S.set.voice === true`.

At the end of a shake, `Why.shakeHTML()` adds up to two buttons for the most important moves, like
**🤔 Why did Rusty forbid the 3?** / **🤔 What did my 2 in Required do?** (the slot fills in when the
background analysis finishes; quiet moves are never picked).

Hidden in online play and in the tutorial. Tournament practice: works, with `G.fractions` passed exactly
as game.js passes it (several cards at once included).

### The no-hint rule (owner: never say what to play next)
While the shake is still on, this is the latest move, and a person other than the mover could still
challenge it ("live"), the card leaves out everything about the position AFTER the move (is a Solution
left, can Now! be called, how many ways remain) and only shows an example that no longer works.
It adds: *"I'll tell you the rest after the shake, so I don't spoil your turn."* The end-of-shake pop-up
tells the whole story. The kid's own move in a one-human game is not live (he can't challenge himself),
so he gets the full facts right away, in neutral words.

## Hooks (exact anchors; checked by applying them to a scratch copy)

**index.html** after `<link rel="stylesheet" href="css/explain.css">`:
```html
<link rel="stylesheet" href="css/why.css"><!-- WHY -->
```
after `<script src="js/explain.js"></script>`:
```html
<script src="js/why.js"></script><!-- WHY -->
```

**js/game.js**, `placeCube`, right after the line
`  if (window.Recorder) Recorder.note('move', { by: who, id: id, zone: zone, cubes: G.cubes, goal: G.goal, fr: G.fractions }); // REVIEW (before the cube moves)`:
```js
  if (window.Why) Why.note('move', { before: G.cubes, cubeId: id, zone: zone, who: who }); // WHY (before the cube moves)
```
`actionsHTML`, right before `  if (G.wait) out += '<button class="btn big green" data-act="goOn">Go on ▶</button>';`:
```js
  if (window.Why) out += Why.buttonHTML(); // WHY: "🤔 Why?" for the latest move
```
`endShake`, in the pop-up html, right before the line starting
`    '<div class="row" style="margin-top:12px"><button class="btn green big" data-act="closeModal">' + (G.shake >= G.shakes ? 'See the results' : 'Next shake')`:
```js
    (window.Why ? Why.shakeHTML() : '') + // WHY: the two most important moves of the shake
```
`newShake`, first line inside `function newShake(fixedCubes) {`:
```js
  if (window.Why) Why.reset(); // WHY
```

**js/screens.js** (Settings), right after the "Pip's tip after a match" row, i.e. after the line ending
`data-act="toggleSet" data-arg="review" data-def="1">' + (S.set.review !== false ? '✔ On' : 'Off') + '</button></div>' +`:
```js
    (window.Why ? Why.settingsHTML() : '') + // WHY: the Why? button Setting
```
(The row uses the existing `ACT.toggleSet` with `data-def="1"`, so no new handler.)

**js/config.js** (optional, documents the default; `undefined` already means on): in `set: { … }` change
`textSize: 'normal', calm: false },` to `textSize: 'normal', calm: false, why: true },`.

**Offline list**: after wiring, run `node tools/build-precache.js` so `js/why.js` and `css/why.css` are cached.

`ACT.whyOpen` / `ACT.whyClose` are registered by why.js itself (like explain.js does).

## How the facts are computed (`Why.facts`, pure, node-testable)

Every fact is a solver question on a mat, answered **yes** (the engine found a Solution AND `Eq.checkSolution`
accepted it on real cubes via `Eq.cubeTokens`), **no** (the search was complete: every Solution with up to
6 number cubes, and the mat had no more than that), or **?** (time ran out). Only yes/no make claims.

| Fact | Question | Sentences it allows |
|---|---|---|
| possible before / after | Impossible!-mode solve (all Required, Permitted and Resources as you like) | "Now there is no way left to make the Goal at all, so Impossible! is true." (proved only) |
| Forbidden: a way that needed it | every free cube with that face put in Required | "Before, 2 + 7 made the Goal, but it uses the 7, so that way is gone." / "The 8 wasn't part of any way…" |
| Required: a way without it | this cube and its non-Required twins put in Forbidden | "Before, 4 + 5 made the Goal without the 7, but now that doesn't count…" / "Every way already used the 7…" |
| Permitted | none needed: it never takes a way away | "Moving a cube to Permitted never takes a way away, so it doesn't block anything." |
| Now! after | Now!-mode solve, only where Now! may be called (2+ Resources, a cube on the mat) | "With the cubes on the mat plus just one more from Resources, the Goal can be made now, so somebody could call Now!" / "Nobody can call Now! right after it, and the Goal can still be made: a safe, quiet move." |
| how many ways | repeated solves, each with one of the last way's free cubes taken out; counted to 4 | "I can still find a few ways to make the Goal without it." (a lower bound) |
| Resources low / last cube | counting | "That was the last Resource cube…", "Only 2 cubes are left in Resources." |
| taste | `OPPONENTS[i].taste`, `likes.syms` | only when the facts are quiet, only for creatures, only as a maybe: "Maybe that's why: Rusty loves × and ÷." / "I can't be sure why. Maybe Rusty just likes 7s!" |

Kid's own move, last way removed: "You put the 7 in Forbidden, so nobody may use it now. Before, 2 + 7 made
the Goal, but it uses the 7, so that way is gone. Now there is no way left to make the Goal, so if someone calls
Impossible!, you would have to show a Solution, and there isn't one."

**Twin cubes.** Two cubes with the same face are the same to a player, so a "lost" way must need every twin
(forbidding one 7 while another 7 is free loses nothing), and a "ruled out" way must use fewer of that face
than Required now asks for. Found in play: the first version said "Before, 2 × 7 − 5 made the Goal without
the 2", using the other 2. Tests now check that a lost way can't be rebuilt after the move.

**Words (`Why.compose`).** A fixed head line, then the best two candidate sentences in story order (or one
plus the taste line when all is quiet). Short examples: each question tries 3 number cubes before 6.
**Pop-up priority:** made the Goal impossible > made Now! possible > took a way away (Forbidden) or ruled one
out (Required) > last cube > the rest; only moves scoring 75+ get a button, at most two.

## Time caps and timings
- One solver call: 120 ms when the kid is waiting on the card, 40 ms in the background; whole move 1.4 s / 1.2 s.
- One solver call per slice (`Why.run` re-runs the analysis over a cache, `setTimeout` between slices);
  analyses queue one at a time right after each move, so the card is usually ready when tapped.
- Fuzz (cap 60 ms, budget 300 ms) on a calm machine: longest single call 65 to 105 ms, longest look ~305 ms.
  Under outside load single calls stretched to 1 to 2.5 s (even the trivial `Eq.cubeTokens` took 300 ms then),
  so the two timing checks allow 1% slow looks and the test says to rerun once.
- Browser (flat mat, 1280x800 and 390x844): no main-thread task over 50 ms through two shakes with every card opened.

## Tests
`node tests/why.test.js` (~5,000 checks): hand-built positions for every fact type (forbid needed / unneeded /
last way / already impossible; require some / none / all; operator cubes; permitted quiet / Now! danger /
taste; Now! via Required; last cube; one and two left; fractions; three zones mixed; own move; twin cubes;
Average, Use It Again, Upside-down, Base 8, two cards with a division, fractions plus a card) and a 24-position
grid, each claim checked against an independent brute force (every combination of the cubes with + − × ÷ ^ in
every grouping, engine arithmetic `Eq.opCore`), or a 3-second solver run for cards. Fuzz: 300 rolled positions,
six math modes. `WHY_SHOW=1` prints every explanation; `WHY_PROFILE=1` the slowest engine calls.

## Simplifications
- "No way" = no Solution with up to 6 number cubes (the engine's limit, as for Hint and the creatures); said
  only when at most 6 number cubes remain, so the search covered everything.
- "Different ways" = different sets of cube faces, counted to 4 ("lots"); always "I found", never "only".
- It explains what the move CHANGED, not what the creature thought (ai.js reports no reasons); taste is a maybe.
- Live (no-hint) cards for creature moves are short on purpose; the end-of-shake card has the rest.
- The test brute force covers + − × ÷ ^; roots and card symbols are checked against longer solver runs.
