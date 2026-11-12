# Handoff from `brain` (computer player: background thinking + math tastes)

## What changed

- **New `js/ai.js`**: all of the computer player's decisions as plain functions of the mat
  (`AI.turn`, `AI.chooseMove`, `AI.decideChallenge`, `AI.callsLastImpossible`, `AI.interject`,
  `AI.write`, `AI.thirdParty`, `AI.chooseGoal`, `AI.findAnyEquation`, plus `AI.viewDigits` /
  `AI.goalDigits` / `AI.applySym`). It also holds **`AIThink.run(task, args)` → Promise**, which runs
  the decision in a Web Worker and falls back to running it on the page when a worker can't be
  made, errors, or doesn't answer within 8 s (then it terminates the worker; after two failures it
  stays on the page for the rest of the visit).
- **New `js/ai-worker.js`**: the worker (`importScripts` of `engine.js` + `ai.js`, same `?v=` query).
- **`js/game.js`**: only the computer-player code changed. `aiTurn`, `aiWrite`, `aiSetGoal`,
  `aiInterject`, and the computer's parts of `askThirdParty` and `lastCubePlayed` now think through
  `AIThink` and drop any answer that arrives after the situation changed (`aiSituation()` /
  `aiStill()`: same `G`, same cubes, same phase, same challenge, no cube moved since).
  The old global names still exist as thin wrappers (`applySym` is used by camp.js;
  `aiChooseMove` is used by Pip's hint and now has no creature taste).
- **`js/config.js`**: each OPPONENTS entry got `taste` (one line for the picker) and `likes`
  (what the taste prefers). Each TALK block got `tasteGoal`, `tasteMove`, `tasteSol` (Hex also `tasteFrac`).
- **`tests/playtest.js`**: loads engine + config + ai (no longer game.js), calls `AI.*` directly,
  takes an optional 3rd argument `notaste`, and prints a "Math tastes" block in the SUMMARY.

## REQUIRED: script tag in `index.html` (I did not commit this)

`js/game.js` now needs `AI` and `AIThink`. Add this line **directly before** `<script src="js/game.js"></script>`:

```html
<script src="js/ai.js"></script>
```

(`js/ai-worker.js` is loaded by `js/ai.js` itself; it needs no tag.) Without the tag the game
throws `AI is not defined` the first time a creature thinks.

## Optional snippets for files I don't own

### Opponent picker (js/screens.js): show the taste

In `js/screens.js` (opponent card, the line that starts `(o.tip ? '<div class="otitle" ...`), add right after it:

```js
      (o.taste ? '<div class="otitle" style="margin-top:4px;font-size:13px;line-height:1.25">🎲 Likes: ' + esc(o.taste) + '</div>' : '') +
```

The match-start card in `js/social.js` (`vs-tip`) could show it the same way.

### ACT.noGoal (js/game.js, game-flow part): think in the background too

`aiFindAnyEquation(o)` still runs on the page (it is only used when the kid says "No Goal", up to
1.5 s). To move it to the worker, replace the `setTimeout(function () { var found = aiFindAnyEquation(o); ... }, 1200);`
block in `ACT.noGoal` with:

```js
    var g0 = G, cubes0 = G.cubes;
    Promise.all([
      AIThink.run('findAnyEquation', [zoneCubes('resources').map(function (c) { return c.s; }), G.fractions]),
      new Promise(function (ok) { setTimeout(ok, 1200); })
    ]).then(function (x) {
      if (G !== g0 || G.cubes !== cubes0 || G.phase !== 'goal') return;
      var found = x[0];
      G.busy = false;
      if (found) {
        G.goalTokens = found.goal.slice(); G.goal = found.value;
        var sols = {}; sols[ai] = { ok: true, tokens: found.sol };
        endShake({ pts: noGoalScore(ai, setter, true), lines: [esc(o.name) + ' challenged the "No Goal" call and found a Goal AND a Solution!'], sols: sols });
      } else { say('opp', 'I agree, no Goal!'); askNoGoal(setter); }
    });
```

### Still on the page (not the computer player, left as they were)

`sampleSolution()` at the end of a shake (up to 0.9 s), Pip's `ACT.hint` (up to ~1.5 s with all
operations) and Training Camp still call the solver on the page. They could use the same worker
later via a new task in `AI.TASKS` if the freeze shows on the iPad.

### README.md file map (suggested rows, after the `js/game.js` row)

```
| `js/ai.js` | The computer player's decisions and math tastes (also used by the worker and the playtest), plus AIThink: thinking in the background |
| `js/ai-worker.js` | The Web Worker the creatures think in, so the picture never freezes |
```

and in "Check the math": `node tests/playtest.js 24 1 notaste` plays the same creatures with their tastes off.

### TODO.md

Move "Creature thinking speed …" and "Math tastes per creature" to Done.

## Testing hooks

- `AIThink.mode()` → `'worker'` or `'sync'`; `AIThink.debug.last` → `{task, how, ms}` of the last answer.
- `AIThink.debug.forceSync = true` → think on the page (old behaviour).
- `AIThink.debug.timeoutMs = 100` → pretend the worker hangs (it is terminated, the page takes over).
- `AIThink.reset()` → try the worker again.
- Bump `AI.VERSION` in js/ai.js when the worker messages change (it is also the worker's cache-buster).
