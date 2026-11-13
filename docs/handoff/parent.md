# Parent page ("For Tata"): handoff

A page for the grown-up: which operations and cards he's solid on, where he gets stuck, and how much he has
played. New files: `js/parent.js`, `css/parent.css`, `tests/parent.test.js` (run `node tests/parent.test.js`).
Nothing else was edited: the hooks below must be pasted in. Every hook is one line, starts with
`if (window.Parent)`, and is marked `// PARENT page`, so the game works the same if `js/parent.js` is missing.

All the snippets below were applied to a scratch copy and played for real (a match against Snoozy with a set Goal,
a Now! call with a Solution that missed, an Impossible-detective drill, a Make-the-Goal drill, the Stats and
Settings buttons, and the hold gate). Each anchor appears exactly once in today's files.

## 1. index.html (3 lines)

After `<link rel="stylesheet" href="css/title.css"><!-- TITLE: 3D title screen layout -->` add:
```html
<link rel="stylesheet" href="css/parent.css"><!-- PARENT page -->
```
After `<section id="fans" class="screen"></section>` add:
```html
<section id="parent" class="screen"></section>
```
After `<script src="js/fans.js"></script>` add (it must come after game.js, camp.js and screens.js because it adds `ACT.parent*` handlers):
```html
<script src="js/parent.js"></script><!-- PARENT page -->
```
(If the `<section>` is forgotten, parent.js creates it itself. The script tag is required.)

## 2. js/builder.js: every Solution attempt (matches, Daily Puzzles, Training Camp, Gift puzzles)

In `recordSolution`, replace
```js
  var ok = !!(chk && chk.ok);
  S.stats.attempts++;
```
with
```js
  var ok = !!(chk && chk.ok);
  if (window.Parent) Parent.note('solution', { chk: chk, ms: ms, tokens: tokens, mode: mode, goal: goal }); // PARENT page
  S.stats.attempts++;
```
Parent works out the rest itself: which operations and how many cubes, fractions, parentheses, steps below zero,
two-digit numbers, the variation card in play (`G.vari`), gold/purple bonus cubes, the hint (`G.hintUsed`), the
drill (`CAMP.drill`), and for a miss the reason codes (the engine's `Eq.evaluate` code plus checkSolution's
sentences, turned into codes like `value`, `required`, `concat`). "I can't find one" arrives as `chk = null` and counts as `none`.

## 3. js/game.js (5 lines)

a) `startMatch`, after `if (window.Recorder) Recorder.start(G); // REVIEW: ...` add:
```js
  if (window.Parent) Parent.note('matchStart'); // PARENT page
```
b) `setGoal`, replace `{ S.stats.goalsSet++; checkBadges({ type: 'goal' }); }` with:
```js
{ S.stats.goalsSet++; if (window.Parent) Parent.note('goal', { tokens: tokens, value: val }); checkBadges({ type: 'goal' }); }
```
c) `resolveChallenge`, right before `  var sols = {}; sols[ch.kind === 'now' ? ch.challenger : ch.mover] = { ok: ok, tokens: tokens, chk: chk };` add:
```js
  if (window.Parent && !isAI(0) && G.mode !== 'tutorial') { var pRole = ch.challenger === 0 ? 'caller' : ch.mover === 0 ? 'mover' : 'third'; Parent.note('challenge', { kind: ch.kind, role: pRole, won: pRole === 'caller' ? pts[0] === 6 : (pts[0] || 0) >= 4 }); } // PARENT page
```
("caller won" uses the same rule as `S.stats.challengeWins`; "mover" = someone challenged HIS move, and he came out ahead with 4+ points.)

d) `endShake`, after `    if (G.hintUsed) S.stats.noHint = 0; else S.stats.noHint++;` add:
```js
    if (window.Parent) Parent.note('shake', { pts: r.pts }); // PARENT page
```
e) `endMatch`, right before `  if (G.team) { Team.endMatch(); return; } // team celebration naming both teammates (js/team.js)` add:
```js
  if (window.Parent && G.mode !== 'tutorial') Parent.note('match'); // PARENT page (reads G; peeks at Pip's review notes)
```
This one must stay BEFORE the match-end pop-up is shown: it peeks at `Recorder.peek()` before `Review.afterMatch()`
takes the notes. About 4.5 s later (after Pip's own tip analysis is done) it re-runs Review's `now`/`imp` jobs on every
moment where the creature had just acted and he moved on, in 25 ms slices, at most ~3 s in total. Only chances the
engine can PROVE are counted (a real Solution for Now!; a complete search for Impossible!). Only in one-on-one matches
against a creature with Pip's tip switched on (the same conditions as the Recorder).

## 4. js/camp.js: quiz drills (Now or not yet?, Impossible detective, Safe move, Set a sneaky Goal)

At the top of `campDone`, replace `function campDone(ok, title, bodyHTML) {` + newline with:
```js
function campDone(ok, title, bodyHTML) {
  if (window.Parent && CAMP && CAMP.drill !== 'make' && CAMP.drill !== 'bonus') Parent.note('drill', { id: CAMP.drill, ok: ok }); // PARENT page (make/bonus come through recordSolution)
```

## 5. js/ways.js: How Many Ways? (optional but recommended)

In `waysChecked`, after `  var W = WAYS, P = W.P, chk = Eq.checkSolution(tokens, waysCtx(P));` add:
```js
  if (window.Parent) Parent.note('solution', { chk: chk, ms: 0, tokens: tokens, mode: 'ways', goal: P.goal, fr: P.fractions }); // PARENT page
```

## 6. js/screens.js: the two ways in

My Stats (kid's screen), in `renderStats` replace `<h2>' + ico('chart') + ' My Stats</h2></div>` with:
```js
<h2>' + ico('chart') + ' My Stats</h2><button class="btn small" data-act="parentOpen" data-arg="stats">For Tata</button></div>
```
Settings, in `renderSettings` right after the line `    '<div class="group"><h3>' + ico('cap') + ' Parent corner</h3>' +` add:
```js
    '<div class="setrow"><label>For Tata: how he is doing<br><small style="font-weight:600">Skills, where he gets stuck, playing time. Grown-ups only (press and hold).</small></label><button class="btn small blue" data-act="parentOpen" data-arg="settings">Open</button></div>' +
```
`data-arg` is the screen the Back button returns to (`stats`, `settings`, or `title`).

## 7. Save defaults (js/config.js): nothing needed

`S.parent` is created the first time it is needed (`merge()` keeps keys that `defaults()` does not list).
"Reset progress" (`S = defaults()`) drops it, and the page starts again from that day, which is right.
Online play and export codes carry it like the rest of the save.

## What gets recorded (S.parent), and how big it is

The schema is described at the top of `js/parent.js`. In short:
- `days`: one small bucket per day played, for the **last 60 days** only. Totals since the page was added go in `L`.
  `ex` holds one real example per reason (the latest one). `unl` holds unlock dates.
- Size: about **4 KB** after 20 days of steady play (measured with realistic synthetic data in the browser); a month of
  daily play is under 8 KB (tested). Hard cap **24 KB**: the oldest days are dropped first (tested with an extreme stream).
  `Parent.bytes()` reports it, and the page footer shows it.
- Nothing identifying beyond what the save already has: no names of other people, no device data. Examples are the
  Solution's symbols and the Goal's value.
- **Active time**: parent.js listens to taps, keys and the wheel (capture phase, passive). It adds the time between
  inputs, but at most 60 s per gap (the clock stops 60 s after the last input). Leaving the tab pauses it. A new session
  starts after 10 minutes without input. It is flushed into the save at least every 20 s of play, on every note, and
  when the page is hidden or closed (then `persist()` runs).
- **Unlock dates** (ladder steps, cards, bonus dice, creatures beaten) are dated the first time the page sees them.
  Things already unlocked when the page first runs are stored as `''` and shown as "before <date>".

## Works with existing saves

These come from data the game already kept, so they work on day one: days played and Solutions per day (from
`S.history`), typical Solution size and thinking time, challenge totals from `S.stats`, the ladder, badges, creatures,
cards, seasons (`Season.pennants()`), and drill levels. Everything else is marked ◔ "counted since <date>, when this page
was added". Windows that start before that date say so, and their days show as hatched "not counted yet" bars. Skill rows
show "used in N right Solutions before this page" from `S.opsUsed` (minus what the page itself counted).

## Judgment calls (please review)

- **Levels**: Not tried yet = 0 tries. New = 1-7 tries. Solid = 8+ tries and at least 75% right (only the last 30 days
  count once they hold 8+ tries). Getting there = 8+ tries, under 75%. The rule is printed on the page.
- **Rule slips don't count against an operation.** A Solution that missed only because of a rule (left-out Required, a
  Forbidden cube, two Resources after Now!, "I can't find one", a card rule) still counts in the totals and in "Where he
  gets stuck", but not in the ÷ or × rows. Otherwise every row sank together (a left-out cube says nothing about dividing).
- **Trend** = share right in the last 14 days against the 14 days before. It needs 5+ tries in each, and a change of
  10 points or more.
- A card's row counts every Solution written while that card was in play for the shake.
- "Try this next": at most 3 tips, one per button. The tips are never about speed and never use "wrong" or "mistake"
  (a test checks this). They point to real places: Make the Goal, Now or not yet?, Impossible detective, Safe move,
  Set a sneaky Goal, Daily Puzzle, Pick a match, How Many Ways?. There is no Division drill, so the ÷ tip points to Make the Goal.
- The gate is "press and hold 2 seconds" (pointer or Enter/Space). Once opened, it stays open for 15 minutes.
- CSV download uses a Blob link; if that fails, the CSV is copied to the clipboard instead. Print shows only this page.

## Verified / not verified

Verified: `node tests/parent.test.js` (75 checks) and `node tests/engine.test.js` (822). In the browser (scratch copy
with these hooks, flat mat): the Goal, the Solution with its reason codes and example, the Now! call, the shake, the match
and the proved-chances check (1 moment checked) were all recorded. So were an Impossible-detective drill and a
Make-the-Goal drill. Real clicks counted active seconds and one session. The gate stays shut on a tap and on an early
release, and opens after 2 s. The Stats button, the Back button, the "Impossible detective ▶" tip button (it opened the
drill), and Copy summary all worked. Screenshots with synthetic data at 1280x800, 1024x768 and 390x844 showed no
horizontal overflow inside the page.
Not verified: the real Print dialog, the CSV file download on iPad Safari, team and online matches end to end, and the
Gift and How Many Ways? hooks in live play (they use the same `note('solution')` path that was tested).
