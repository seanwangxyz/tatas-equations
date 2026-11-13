# Handoff: Tournament practice, several cards at once, Judge Pip (agent `tourney`)

A new mode `'tourney'`: a match run the way an Academic Games tournament runs it (red-cube roll for the first Goal-setter,
every player picks a variation card, bonus moves, anyone challenges the latest Mover, official shake and match scoring),
with **Judge Pip** answering "is this allowed?" about the current position. The engine now plays several cards at once
(up to three). Rules, interpretations (⚠) and what is left out: **RULES_SUMMARY.md section 8**.

## Files in this branch

| File | What changed |
|---|---|
| `js/tourney.js` (new) | `TourneyRules` (pure: 2026-27 lists, `check` "may I pick this card?", `legalFor`, `settingsFor`, `pickOrder`, `leading`, `matchPoints`, `rollRound`, `ambiguities`, pair notes, not-offered-yet lists) and `Tourney` (setup, intro, red-cube roll, card picking for every player, bonus moves, practice clock, strict penalties, match points + `S.tourney`, Judge Pip, Rulings, Parent rows, the Play tile) |
| `css/tourney.css` (new) | Judge Pip's cap/whistle, pickers, roll, Judge panel, top strip, clock, end table |
| `js/engine.js` | TOURNEY lines only: both-turns symbols `Eq.NS`, upside-down powers `Eq.NPOB`, turned wild 0, `Eq.goalVals` (General Principle 11), Factorial + Multiple Operations, ! counts for Three-operation, base checks (sideways, exponent), powers of the base in base m, `div` flag (`'E'`/`'M'`): Number of Factors ≤ 200 in Elementary, Middle powers/roots (`powQ`, exact), deep one-number repeats with Multiple Operations (time-capped). With one card and no `div` nothing changes (all 831 old tests pass unchanged) |
| `js/variations.js` | `Vari.applySet(ids, set)` and `Vari.inPlay()` (several cards: chip, info pop-up, notes), `beforeGoal` skips mode `'tourney'`, live Exponent mode works when Exponent is one of several, labels for the new symbols |
| `css/variations.css` | `.vt-ns` (a cube turned both ways) |
| `js/builder.js` | tap cycle: both turns (Solution only), turned wild 0, upside-down powers of the base; unlimited ! with Use It Again; "Ask the Judge" button + answer box |
| `js/ai.js` | `AI.chooseTourneyCard` (by strength and taste), `AI.turnT` (bonus move, then the normal turn; worker task), Goal search a bit longer under the tournament flag. **`AI.VERSION` 8** (if another branch also bumps it, keep the highest + 1) |
| `js/game.js` | TOURNEY lines: setup, first-setter roll, ops/fractions, card picking before the Goal, bonus buttons and taps, Judge button (normal matches too), Judge explanations for illegal Now!/Impossible!/last cube/No Goal, `G.lastShake`, two-creature waits, creature bonus moves (`aiBonus`, `aiMoveNow`), match end |
| `tests/engine.test.js` | block "TOURNEY": 117 checks (948 total) |
| `tests/playtest.js` | `tourney`, `tourney:M`, `tourney2`, `tourney2:M` |
| `RULES_SUMMARY.md` | new section 8; two lines in sections 5/6 now point to it |

## Please paste (anchors are exact text in your files)

**1. `index.html`** (scripts and styles). After `<link rel="stylesheet" href="css/variations.css">` add
```html
<link rel="stylesheet" href="css/tourney.css"><!-- TOURNEY -->
```
and after `<script src="js/variations.js"></script>` add
```html
<script src="js/tourney.js"></script><!-- TOURNEY: tournament practice + Judge Pip -->
```

**2. `js/screens.js` `renderSetup`, the Play screen tile.** In the "With people" tab, after
`(window.Team ? Team.setupCardHTML() : '') +` add
```js
    (window.Tourney ? Tourney.tileHTML() : '') + // TOURNEY
```
and in the "Three at the table" tab change `sPart('trio') + (window.Trio ? Trio.setupHTML() : '') + '</div>' +` to
```js
    sPart('trio') + (window.Trio ? Trio.setupHTML() : '') + (window.Tourney ? '<h3 class="tierh">⚖️ Tournament practice</h3><div class="opps">' + Tourney.tileHTML() + '</div>' : '') + '</div>' + // TOURNEY
```
(The tile is `.opp.mode`, locked with a reason until unlocked; tapping it opens the intro once, then the setup.)

**3. `js/screens.js` `renderSettings`, Parent corner.** Right after the line `(window.Vari && Vari.parentHTML ? Vari.parentHTML() : '') +` add
```js
    (window.Tourney ? Tourney.parentHTML() : '') + // TOURNEY: open now / Middle list / practice clock / strict penalties
```
(`ACT.tToggle` in js/tourney.js saves `S.tourney.opt[...]` and calls `renderSettings()`.)

**4. `js/account.js`, merge rule for the new save key `S.tourney`** (`tests/account.test.js` lists feature keys by hand, so it
does not fail today; please also add `'tourney'` to its `FEATURE_KEYS`). In `RULES`:
```js
    tourney: function (a, b, c) { // TOURNEY: counters highest, options newest, round log union by time (20 newest)
      if (!has(a)) return clone(b); if (!has(b)) return clone(a);
      var out = eachKey(a, b, function (x, y, k) { return k === 'opt' ? pickNewer(x, y, c) : k === 'log' ? null : max(x, y); });
      var seen = {}, log = [];
      (Array.isArray(a.log) ? a.log : []).concat(Array.isArray(b.log) ? b.log : []).forEach(function (r) { if (r && !seen[r.t]) { seen[r.t] = 1; log.push(clone(r)); } });
      out.log = log.sort(function (x, y) { return num(x.t) - num(y.t); }).slice(-20);
      return out;
    },
```
and in `DESCRIBE`: `tourney: 'tournament practice: rounds and wins highest; options newest; rounds log union'`.
Shape: `S.tourney = { rounds, wins, ties, mp, best, log: [{t, div, n, sc, mp, names}], opt: { on, middleOn, clock, strict, div, per, allOps, seats, introSeen } }`.

**5. `README.md`**: the test count becomes **948 checks** (117 for tournament practice), and add a row
`| js/tourney.js | Tournament practice (several cards at once, official order and scoring) and Judge Pip |`.

**6. `js/online.js`**: nothing needed. The Judge button is hidden online (`G.mode === 'online'`), and online never uses
several cards.

## Hooks I put in game.js (all marked TOURNEY)
`startMatch` → `Tourney.setup`; `begin` → `Tourney.firstSetter(newShake)`; `newShake` → `Tourney.fixOps`, `Tourney.onShake`;
`startGoalPhase` → `Tourney.beforeGoal`; `actionsHTML` → bonus button, Judge button, "Pick the cards first";
`ACT.cubeTap` → `Tourney.bonusTap`; `doMove`/`ACT.callNow`/`ACT.callImp`/`ACT.noGoal` → `Tourney.illegal`; `ACT.buildGoal` →
`Tourney.resumeSel`; `placeCube` clears the bonus state; `nextTurn` waits between two creatures; `aiTurn` → `'turnT'` +
`aiBonus`; `endShake` → `G.lastShake`; `endMatch` → `Tourney.endMatch`; `renderGame` → `Tourney.topHTML()`.

## Verified, and not

Verified:
- `node tests/engine.test.js`: 948 passed, 0 failed when run alone (about 70 s). Under heavy machine load (nine helpers)
  some OLD timing checks (e.g. "8 full-roll searches each under 1s") and my round-trip time check can fail; the same run
  alone passes. `account` 581, `parent` 75, `onsets` 119: all pass.
- Playtest: `tourney` (Elementary, 3 creatures), `tourney:M`, `tourney2`: 0 illegal card picks, 0 wrong Solutions under the
  combined cards (e.g. 37, 29, 15 Solutions re-checked). Normal playtest unchanged (`4 4 anycard only=...`, `4 2 only=...`).
- Browser (flat mat, my own tab on port 3531, scripts injected by hand because index.html is not mine): round 1, kid + Rusty +
  Ollie, Elementary list, 3 shakes: red-cube roll (an operation sign knocked the kid out), three cards per shake
  (Number of Factors + Upside-down + Sideways; Sideways + Remainder + Number of Factors; Remainder + 0 Wild + Use It Again),
  illegal pick explained, a Goal-setter bonus move, "No Goal" refused after it, a sideways cube in the Goal, Judge answers for
  every question, Impossible! by a creature with the kid as Third Party (6/2/6), Now! by a creature with a Third Party
  (4 points), illegal Now! explained, official match points 6/4/2. Round 2, kid + Tata (person) + Rusty, Middle list, strict
  penalties and practice clock on: tie in the red-cube roll re-rolled, Base 8 + Powers of Ten + Use It Again, Blue Exponent +
  Multiple of 6 + Use It Again, Middle 0 Wild shown as not offered, a bonus move while leading cost 1 point, the 15-second
  card clock cost 1 point in strict mode, Now! by the kid and Impossible! by the kid, Tata as Third Party, places with a tie
  for second (6/3/3). Two-player: the non-setter is asked for two cards. Judge in a normal match and in the builder
  (a wrong Solution with its reason and rule number). Rulings list (26).
Not verified:
- The 3D table in this mode (flat mat only); the paste snippets above in place (I injected the files instead).
- A creature's bonus move on the page (seen many times in the playtest, not watched in the browser).
- Phone-size layout of the card picker with 11 cards plus reasons.
