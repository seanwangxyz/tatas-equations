# Handoff: "How Many Ways?" mode (agent `ways`)

One Goal, one set of cubes, and he finds as many **different** Solutions as he can. No clock;
he taps **I'm done** when he wants. A medal track (bronze / silver / gold) fills up as he goes.
Repeats get a kind, specific explanation, and at the end **Show me one I missed** teaches
something he didn't spot.

## Files in this branch

| File | What |
|---|---|
| `js/engine.js` | **Added only** (a second block before `/*ENGINE-END*/`; nothing above it changed): `Eq.wayKey`, `Eq.allWays`, `Eq.waysFor`, `Eq.wayMedals` |
| `tests/engine.test.js` | 83 new checks (218 total, all pass), including a brute-force cross-check of the enumerator |
| `js/ways.js` | The mode: puzzle making, play screen, builder hookup, medals, hints, rewards, saving |
| `css/ways.css` | Its styles (all classes start with `wy-`) |

`js/ways.js` does nothing until wired: it only adds `ACT.waysOpen` (and friends) plus a
`waysTileHTML()` helper. It needs `Eq`, `S`, `ACT`, `B`/`renderBuilder` (builder.js),
`modal`/`closeModal`/`drainQueue`/`addXP`/`addStar` (progress.js), `stageInfo`, `cubeHTML`,
`tokensHTML`, `pipHTML`, `ico`, `go`, `shuffle`; it uses `campRand` and `ACT.camp` if they exist.

## Wiring (please paste; I committed none of this)

**1. `index.html`**: stylesheet after `css/social.css`, script right after `js/camp.js`
(it must load after `game.js`, which creates `ACT`):

```html
<link rel="stylesheet" href="css/ways.css">
...
<script src="js/camp.js"></script>
<script src="js/ways.js"></script>
```

**2. Where it lives: a tile inside Training Camp** (my proposal). It is a solo drill like the
others, uses the same coach/mat look, and the back button returns to Camp. In `js/camp.js`,
`renderCamp()`, change

```js
    '<div class="opps">' + cards +
```
to
```js
    '<div class="opps">' + cards + (typeof waysTileHTML === 'function' ? waysTileHTML() : '') +
```

The tile shows its level stars, best medal at that level and total ways found.

No new `<section>` is needed: the mode draws into `#camp` (exactly like the camp drills do).
If you'd rather give it its own screen, add `<section id="ways" class="screen"></section>`
and it will use that automatically; its back button still goes to Camp (`ACT.camp`), or to the
title (`ACT.home`) if Camp doesn't exist.

**3. Saved-data defaults (optional)**: `ways.js` creates `S.ways` itself if it's missing, so
old saves work without this. For tidiness, add to `defaults()` in `js/config.js`:

```js
    ways: { lvl: 1, row: 0, miss: 0, done: 0, total: 0, best: {} },
```
`lvl` 1-5, `row`/`miss` drive the silent difficulty step, `done` = puzzles finished,
`total` = ways found ever, `best` = best medal per level, e.g. `{ "1": "gold", "2": "silver" }`.

**4. Small builder nicety (optional, also helps camp drills with no Required cubes)**: the
builder's checklist always shows "✔ All Required used (0/0)". In `js/builder.js`,
`renderBuilder()`, replace

```js
    var items = [[(chk.cubes || 0) >= 2, 'At least 2 cubes'], [reqUsed === reqIds.length, 'All Required used (' + reqUsed + '/' + reqIds.length + ')']];
```
with
```js
    var items = [[(chk.cubes || 0) >= 2, 'At least 2 cubes']];
    if (reqIds.length) items.push([reqUsed === reqIds.length, 'All Required used (' + reqUsed + '/' + reqIds.length + ')']);
```

**5. README**: add a file-map row `| js/ways.js | How Many Ways?: one Goal, find many different Solutions (medals, hints, "one I missed") |`
and change "135 checks" to "218 checks" (and add "distinct-ways enumeration" to that sentence).

## What counts as a "different" way

Kid version (the in-game **?** button shows this):

- **Same way** (counts once):
  1. Swapping the order: 2+3 and 3+2; 2×3 and 3×2; 9−4+2 and 9+2−4; 8÷4×2 and 8×2÷4.
  2. Moving the ( ) inside a chain of + and − (or × and ÷), or moving a minus:
     (2+3)+4 and 2+(3+4); 9−(4−2) and 9−4+2; 7−(0−2)×7 and 7−(0−7)×2 and 7+2×7.
  3. Adding a helper that changes nothing: +0, ×1, ÷1, a part that equals 0 or 1 like
     +(3−3) or ×(5−4), +4−4, ×4÷4, 5^1, 1^3, 0^2, √1, √0, index-1 roots, 2√9 vs √9.
  4. The same trick with another number: 2÷2 and 4÷4 (both 1); 3^0 and 9^0; 3−3 and 5−5.
- **Different way**: different cubes (2+3 vs 1+4), a different operation (2+3 vs 6−1 vs 2×3−1),
  or a different shape (2×(3+4) vs 2×3+2×4). Which cube of a colour is used never matters.

How it works: `Eq.wayKey(tokens)` turns a Solution into a canonical key: + and − chains become a
sorted bag of plus-terms and minus-terms (× and ÷ likewise), helpers are removed by **value**
(a term worth 0 in a sum, a factor worth 1 in a product), opposite pairs cancel, a minus is
pulled out of products. Two Solutions are the same way exactly when their keys match. It also
returns `helper` / `trick` flags, which pick the duplicate message ("Adding 0 or multiplying by 1
doesn't change it" / "same trick with a different number" / "Swapping the order or moving the ( )
doesn't make a new way"; if both used exactly the same cubes it always says the last one).

Note a "helper" way still counts **once**: with Goal 4 and cubes 1 4 ×, "1×4" is a real Solution
("the 4 with a helper") and is one way; "4+0", "4÷1" are then the same way.

## Puzzles and difficulty

The digits come from a normal roll of all 24 cubes; the operation cubes are only ones he has
unlocked (`stageInfo()`), different kinds where possible, at most one ^ or √. One call to
`Eq.allWays` counts the distinct ways for **every** value at once; then a whole-number Goal is
picked whose count is in the level's band and whose ways use at least two kinds of operation.

| Level | Digits | Operation cubes | Ways the Goal has | Goal |
|---|---|---|---|---|
| 1 | 4 | 2 | 3-6 | 2-10 |
| 2 | 4 | 3 | 4-8 | 3-15 |
| 3 | 5 | 3 | 5-12 | 4-20 |
| 4 | 5 | 3 | 6-15 | 6-30 |
| 5 | 5 | 4 | 8-20 | 8-99 |

(Goal is also capped by the stage's `maxGoal`; the band widens a little if a deal is stubborn.)
Silent adaptation like the camp drills, but per puzzle: finishing with **silver or gold** twice
in a row moves up a level; finishing with **no medal** twice moves down; bronze holds steady.
No message is shown when the level changes (the tile and header just say the new level).

Medals (`Eq.wayMedals(total)`): 3 ways → 1/2/3. From 4 ways up: gold = ceil(60% of the ways),
capped at 10; bronze ≈ gold/3, silver ≈ 2·gold/3. Gold never needs every way once there are 4+.

## Rewards (suggested amounts, in `WAYS_XP` at the top of `js/ways.js`)

- +8 XP per new way (duplicates and wrong tries cost nothing and give nothing).
- Medal bonus: bronze +10, silver +15, gold +25, plus **one skill star** (`addStar()`) for gold.
- +20 XP for finding every way (puzzles with 3+ ways).
- Hints and "Show me one I missed" are free. It does **not** call `recordSolution` (that one
  gives a star per Solution and a "fastest Solution" bonus, which would break the
  no-speed rule and make stars too easy here). It calls `checkBadges({type:'ways'})` at the end,
  so level badges etc. still fire.

## Performance

`Eq.allWays` is an exact dynamic program over sub-bags of the digits and the operation cubes
used, keeping one entry per distinct way. Measured on this laptop in Chrome, generating a whole
puzzle (several deals + counting): level 1-4 under 10 ms, level 5 typically 3-16 ms, worst seen
48 ms; one count takes at most ~25 ms (node, stage with ^ and √). Generation runs in ~120 ms
slices with `setTimeout` between them. `allWays` has a time budget (150 ms in the game) and a
node cap; if it hits either it reports `complete:false` and the deal is thrown away, so the
"of N ways" total is always exact. Big deals do explode (6 digits with ^ and √ takes seconds),
which is why levels stay at ≤ 5 digits and ≤ 4 operation cubes. **iPad timing is not measured.**

## Verified vs not

Verified (temporary wiring in my worktree, reverted before commit; Chrome, port 3476):
- Played puzzles end to end through the real tile and builder taps: new way, bronze/silver/gold,
  duplicate with a helper, duplicate by reordering, duplicate "same trick", a wrong try with the
  "Fix it" path keeping his attempt, both hints, I'm done → summary → Show me one I missed,
  find-every-way → summary with skill star, Next puzzle, leaving and resuming an unfinished
  puzzle, level 1 → 2 after two silver/gold results, a level-up celebration mid-puzzle.
- Phone width (375 px) layout, the "?" rules pop-up, no console errors.
- `node tests/engine.test.js`: 218 passed. `node --check` on both js files.

Not verified:
- iPad / Safari, and how long generation takes there.
- The level-down path (only by reading the code; it mirrors level-up).
- Leaving while a puzzle is still being generated (guarded by a job token, but generation
  always finished in the first slice in my tests, so that branch never actually ran).
- Sound (it calls `Snd.chime/pop/boop/fanfare` through a guard; I didn't listen).
- With fractions on, all ways are counted exactly, but a few high-level Goals may then have
  fraction-heavy ways a 10-year-old finds hard; only spot-checked.

## Known rough edges

- The header title wraps on a phone (the level number is hidden below 520 px to help).
- `B.mode` is `'daily'` so the builder shows a **Close** button instead of "I can't find one"
  (that's on purpose: nothing to give up on here).
- Level 1 often has exactly 3 ways, so gold there = all of them (3 is not "many").
- A helper way such as "5−0" is one legitimate way; some parents may feel it shouldn't count.
  Changing that is a small edit: drop ways whose key is a single digit (e.g. `/^\d$/.test(w.key)`)
  from the list in `waysPickGoal`, and refuse them kindly in `waysChecked`.
