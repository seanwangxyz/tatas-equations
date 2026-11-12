# Handoff: Variation cards (agent `variations`)

Official "Adventurous Equations" variations (rulebook sections II-B and XIII-A), as optional
**variation cards**: an extra rule for one shake. Five Elementary cards are built:
**Two-digit Numbers, Use It Again (Multiple Operations), 0 is Wild, Three Operations, Remainder**.
What each one means, the official wording I relied on, and every interpretation are in
RULES_SUMMARY.md section 5.

## Files in this branch

| File | What |
|---|---|
| `js/engine.js` | Variations inside the engine: `Eq.mathMode`, `Eq.withGoal`, `Eq.fracOn`, `Eq.varsOf`, `Eq.rulesOf`, `Eq.goalAt`, `Eq.VARIATIONS`; `evaluate`/`checkGoal`/`checkSolution`/`solve` honour a card. The remainder operation is the internal symbol `m` (shown as "rem"). With no card everything is exactly as before (the old 218 checks still pass unchanged) |
| `tests/engine.test.js` | 102 new checks (320 total), including solver-vs-brute-force on 12 small cube sets and a check that the tests notice deliberate solver bugs (done by hand, see the final report) |
| `js/ai.js` | `AI.chooseVariation(o, cards)` (stronger creatures pick more often); the creature's Goal search passes the Goal's symbols for 0 Wild and looks further for Three Operations; won't spend the last ÷ in its Goal under Remainder. `AI.VERSION` is now 4 |
| `js/ai-worker.js` | Unchanged: the card rides inside the `fractions` argument, which is plain data, so the worker gets it automatically (checked in the browser: `AIThink.debug.last.how === 'worker'` during a card shake) |
| `js/builder.js` | Live checking under the card; "Turn ÷ sideways" button (Remainder); operation cubes stay tappable (Use It Again); extra checklist lines (two digits, 3 operations); a one-line card reminder at the top |
| `tests/playtest.js` | Optional card argument: `node tests/playtest.js 16 1 wild0` (or `anycard`). Re-checks every Solution written under the card and prints how many were wrong |
| `js/variations.js` (new) | Cards, unlocking, the card pick, the creature's pick announcement, the table reminder chip, and the four hooks below |
| `css/variations.css` (new) | Card and chip styles (classes start with `vari-`) |
| `js/game.js` | Four one-line hooks, each marked `// VARIATIONS` (below) |
| `RULES_SUMMARY.md` | New section 5 "Variations"; row 7 of the interpretations table updated |

## The one thing to know when merging: `G.fractions` can now be an object

The card travels to every solver call inside the value the game already passes everywhere as
`fractions`. With no card it is still `true`/`false`. During a card shake it is a plain object:

```js
{ fractions: true, vars: ['wild0'], goal: ['1', '0'] }   // goal = the Goal's symbols (0 Wild needs them)
```

The engine and `js/ai.js` read both shapes. **Never write `if (G.fractions)`**: use
`Eq.fracOn(G.fractions)` for "are fractions on?". (I checked: nothing in the current code tests it
that way; every use just passes it on to the engine or the builder.) I chose this so the card reaches
all ~12 solver calls in game.js without touching each one. If you prefer an explicit argument, every
`Eq.solve` / `AI.*` / `solCtx` call would need a new parameter instead.

## Hooks in `js/game.js` (already in this branch)

1. `newShake`, after `G.busy = false; G.aiPlan = null; ...`:
   `if (window.Vari) Vari.reset(); // VARIATIONS ...`
2. `startGoalPhase`, first line:
   `if (window.Vari && Vari.beforeGoal(startGoalPhase)) return; // VARIATIONS ...`
   (the card pick or the creature's announcement is a modal; when it closes, `startGoalPhase` runs again
   and goes on as before. Skipped in the tutorial and when no card is unlocked or useful.)
3. `setGoal`, after `G.goalTokens = tokens; ...`:
   `if (window.Vari) Vari.afterGoal(tokens); // VARIATIONS ...`
4. `symsToCubeTokens`, first line:
   `if (window.Vari && Vari.on()) return Vari.cubeTokens(list, mode); // VARIATIONS ...`
   **This is a fourth spot**, next to `solCtx` (the solver plumbing). It is needed because a creature's
   Solution can contain a sideways ÷ (`m`, which must map to a ÷ cube) or re-use one operation cube
   (Use It Again). Without it the creature's correct Solution would be marked wrong.

## Please paste (I committed none of these)

**1. `index.html`**: the stylesheet after `css/ways.css`, the script right after `js/game.js`
(it needs `ACT`, `G`, `zoneCubes`; it must load before anything starts a match):

```html
<link rel="stylesheet" href="css/variations.css">
...
<script src="js/game.js"></script>
<script src="js/variations.js"></script>
```

**2. Settings → Parent corner switch** (`js/screens.js`, `renderSettings()`, inside the Parent corner
group, for example right after the "Automatic / All on" row). It uses the existing `toggleSet`:

```js
    '<div class="setrow"><label>Variation cards<br><small style="font-weight:600">An extra official rule for one shake (like "0 is Wild"). They start after Fractions unlock, one new card every 4 stars. Unlocked: ' + (window.Vari ? Vari.unlockedCount() : 0) + ' of 5.</small></label><button class="btn small ' + (S.set.variations !== false ? 'green' : '') + '" data-act="toggleSet" data-arg="variations" data-def="1">' + (S.set.variations !== false ? '✔ On' : 'Off') + '</button></div>' +
```

**3. Saved-data defaults** (`js/config.js`, `defaults()`); optional, the code copes without them:
- in `set: { ... }` add `variations: true`
- next to `ways: {...}` add `vari: { base: null, seen: 0 }`
  (`base` = skill points when the first card unlocked; `seen` = how many cards have been announced)

**4. Goal HUD note for 0 Wild** (`js/game.js`, `renderGame()`): when the Goal has a 0 and 0 is wild,
its value on screen is only the "0 means 0" reading. Add a small note after both Goal values:

```js
// 3D goal HUD:  ... '<span class="gv">= ' + Eq.fmt(G.goal) + '</span>' ...  becomes
'<span class="gv">= ' + Eq.fmt(G.goal) + (window.Vari && Vari.wildNote() ? ' <small>(0 is wild)</small>' : '') + '</span>'
// flat mat:     '<span class="gval">= ' + Eq.fmt(G.goal) + '</span>'  becomes
'<span class="gval">= ' + Eq.fmt(G.goal) + (window.Vari && Vari.wildNote() ? ' (0 is wild)' : '') + '</span>'
```

(The table chip already says "The 0 in the Goal is wild too", so this is a nice-to-have.) If you would
rather have the card reminder inside the HUD than as my floating chip, `Vari.card(G.vari)` gives
`{icon, name, rule}`; then delete the `chip()` calls in `js/variations.js`.

**5. End-of-shake: say what the 0 stood for** (`js/game.js`). The sample Solution and the kid's own
Solution are checked correctly, but the screen doesn't say which digit the wild 0 was:

```js
// sampleSolution(): before `return r.found ? r.tokens : null;` add
G.sampleWild = r.found ? r.wild : null;
// endShake(): after  '= ' + Eq.fmt(G.goal)  in the "One way that works" line, add
+ (G.sampleWild != null ? ' <small>(every 0 stands for ' + G.sampleWild + ')</small>' : '')
// solHTML(): after the "correct" mark, add
+ (s.chk && s.chk.wildAs ? ' <small>(your 0 stood for ' + s.chk.wildAs + ')</small>' : '')
```

**6. "No Goal" challenged by a person under 0 Wild** (`humanChallengesNoGoal`): after
`G.goalTokens = tokens; G.goal = val;` add `if (window.Vari) Vari.afterGoal(tokens);`. Rare
(the setter must pick 0 Wild and then say "No Goal" in a 2-person game), but without it a 0 in that
Goal is read as a plain 0 while the Solution's 0 is wild.

**7. README.md file map**: add rows
`| js/variations.js | Variation cards: an extra official rule for one shake (pick, unlock, reminder) |`
and `| css/variations.css | Variation card styles |`; the test count line becomes 320 checks.
**TODO.md**: move "Variation cards" from Next to Done.

## Unlocking (my proposal, already coded in `js/variations.js`)

- Nothing until the ladder reaches **Fractions** (+ − × ÷ have earned their 6 stars), or the ladder is
  switched off by hand. `S.unlockAll` unlocks all five.
- First card then; one more every **4 skill points** (correct Solutions + correct Impossible! calls, read
  from `S.stats`, so it keeps counting after the last ladder stage). Order: Two-digit Numbers, Use It Again,
  0 is Wild, Three Operations, Remainder. Change `STAR_STEP` / `FIRST_STAGE` / the `CARDS` order at the top
  of `js/variations.js`.
- A new card is announced once (calm modal, no timer) the next time a Goal is set.
- Creatures pick only from unlocked cards. Training Camp, the Daily puzzle, How Many Ways? and the
  tutorial never use cards.

## For the team-mode merge

`Vari.beforeGoal` reads `G.players[G.setter]` (`.ai` = creature) and `multiHuman()`. If team mode changes
who sets the Goal or adds a new Goal flow, call `Vari.beforeGoal(yourResumeFn)` at its start and
`Vari.afterGoal(tokens)` when the Goal is placed; `Vari.reset()` belongs wherever a shake starts.
