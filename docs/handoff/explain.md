# Explain this Solution (handoff)

"Explain it" opens a calm step-through card for any Solution on screen: the cubes drawn as cubes, the part
being worked on ringed in yellow, a kid-level reason ("Brackets first", "Times and divide come before plus
and minus", "This 3 is upside-down, so it means −3", "In base 8, 23 means 2 eights and 3 = 19", "On this
card + means the average …"), the expression rewritten after every step, Next / Back, "Show all steps", and
the comparison with the Goal ("= 12, and the Goal is 12 ✔"; Multiple of k: "17 is 5 more than the Goal 12,
and 5 is not a multiple of 6."). A wrong Solution is walked up to the number it really makes (or to the step
where it gets stuck), then the rules it broke (from checkSolution) and, when one pair of brackets added or
taken away fixes it with the same cubes, one "So close! …" idea. No "should have", no "wrong".

## Files (all new; nothing existing was edited)

| File | What |
|---|---|
| `js/explain.js` | `Explain.steps(tokens, ctx)` (pure, node-testable) + the card UI (`Explain.buttonHTML`, `Explain.open`, `Explain.close`, `Explain.isOpen`) |
| `css/explain.css` | The card. Own layer `#explainOv` at z-index 65, above `#modal` (60), so the end-of-shake pop-up underneath is untouched and its close callback (`nextShake`) never fires by accident |
| `tests/explain.test.js` | `node tests/explain.test.js`: ~110 hand cases (every operation, every variation card that changes evaluation, every Power-die operation, the big-number die, nested brackets, fractions, negatives, wrong Solutions, rule-breaks, an engine that lies → fallback) + fuzz over solver Solutions (11 math modes) and 150 random bracketed expressions. 4558 checks |

## API

```js
Explain.buttonHTML(tokens, ctx, label?)   // '' for no tokens; snapshots tokens+ctx, so G may change after
Explain.open(tokens, ctx)                 // opens the card directly
Explain.steps(tokens, ctx)                // { ok, fallback, text?, steps:[{kind:'read'|'op'|'error', why, what, text,
                                          //   before:[segs], after:[segs], value, line, check}], value, error,
                                          //   end:{text, ok}, rules:[…], fix:{text, tokens, value}|null, verdict, wild }
```
ctx (all optional): `goal` ({n,d}), `fractions` (the math mode, as `G.fractions`; `mode` also accepted),
`wild` (0 Wild digit; otherwise found like checkSolution), `chk` (a checkSolution result) or `reasons` or
`check` (a checkSolution ctx), `cubes` (G.cubes, for colours), `who` (shown on the card).
Tokens: anything the game already passes around: `{s, id}` cubes, `'('`, `')'`, `'!'`, solver strings,
turned cubes, exponent digits, bonus symbols. Read-aloud: each step is passed to `Snd.speak` only when
`S.set.voice === true`. Keys: ← → step, Esc closes. Clicking the dark backdrop closes.

## How it stays honest (and where it falls back)

- The grouping is read with the engine's own operator table: `Eq.OPDEF` kind (`bin` / `pre` / `post`), `lvl`
  and `card`; the level of `^` groups right to left like the evaluator. No second list of operators.
- Every sub-result comes from `Eq.opCore` / `Eq.unCore` AND is cross-checked with `Eq.evaluate` on that
  same slice of the Solution. Every rewritten line is turned back into engine tokens (worked-out numbers
  are written with the big-number die's numbers, − × ÷ and the gold "negative" cube, which no card changes)
  and must evaluate to the same final value. The final value must equal `Eq.evaluate` of the whole thing.
- Any disagreement → `fallback: true`, card says "I can show the answer but not the steps for this one."
  and still shows the engine's answer and the Goal line. (`Explain._why()` says why, for debugging.)
- If the engine can't evaluate the Solution: the walk goes up to the failing step when the engine fails
  there with the same error code (uneven division with fractions off, ÷ 0, a root that isn't whole …);
  for reading rules (glued digits, a 9 in base 8, syntax) it shows the engine's message with no steps.
- If the other helper's engine rewrite changes things, the tests will say so; the UI cannot show wrong steps.

Order of steps ("careful person"): first what special cubes mean (turned cubes, powers of ten, base m and
wild-0 numerals, decimal points, fractional purple cubes), then innermost brackets first, then the
strongest step (post ops, pre ops, then by level), then left to right. Values are exact; improper fractions
show as mixed numbers (`Eq.fmt`), drawn stacked on the card.

## Engine functions used (read only)

`Eq.evaluate, Eq.opCore, Eq.unCore, Eq.OPDEF, Eq.rulesOf, Eq.mathMode (tests), Eq.resolve, Eq.fmt, Eq.orient,
Eq.pobOf, Eq.exOf, Eq.isNumSym, Eq.isDigit, Eq.bigOf, Eq.bigIdx, Eq.BIG_FACES, Eq.goalAt, Eq.multOk,
Eq.checkSolution, Eq.MSG, Eq.SHOW, Eq.isBonusOp` (optional ones are guarded). Page side: `Vari.exprHTML`
(or `tokensHTML`), `esc`, `ACT`, `Snd.speak / stopSpeak / click / pop`, `S.set.voice`.

## Judgment calls

- Steps are shown in school order (brackets, then strongest, then left to right), not the evaluator's
  internal order. Same value (checked), easier to follow.
- A plain two-digit numeral (Two-digit card) stays as cubes; only numerals whose meaning differs from what
  is printed (base m, wild 0, decimal) get a "what this means" step.
- The near fix only moves brackets (same cubes, so it can't break a Required/Forbidden rule) and is only
  offered when no rule is broken and the 0 is not wild. Removing brackets is tried before adding them.
- Rules shown come from checkSolution's reasons minus the "Your Solution equals …" line and evaluator
  messages (the steps already show those).
- `tourney.js` does not exist yet: use the same one-liner after its Solution `exprBox` /
  `Vari.exprHTML` (`Explain.buttonHTML(tokens, { goal, fractions, cubes, chk })`).

## Snippets to paste (each anchor was applied to a scratch copy and tested; every file passed `node --check`)

All buttons are guarded with `window.Explain`, so a missing script changes nothing.

### 1. index.html: the stylesheet (after review.css)

Find (exactly once in `index.html`):

```
<link rel="stylesheet" href="css/review.css">
```

Replace with:

```
<link rel="stylesheet" href="css/review.css">
<link rel="stylesheet" href="css/explain.css">
```

### 2. index.html: the script (after js/review.js; it needs ACT from js/game.js)

Find (exactly once in `index.html`):

```
<script src="js/review.js"></script>
```

Replace with:

```
<script src="js/review.js"></script>
<script src="js/explain.js"></script>
```

### 3. js/game.js solHTML(): every Solution at the end of a shake (the kid's, each creature's, pass-and-play players)

Find (exactly once in `js/game.js`):

```
  if (!s.ok && s.chk && s.chk.reasons && s.chk.reasons.length) body += '<ul class="reasons">' + s.chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';

```

Replace with:

```
  if (!s.ok && s.chk && s.chk.reasons && s.chk.reasons.length) body += '<ul class="reasons">' + s.chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
  if (window.Explain) body += Explain.buttonHTML(s.tokens, { goal: G.goal, fractions: G.fractions, cubes: G.cubes, chk: s.chk, who: G.players[i].name + '\'s Solution' }); // EXPLAIN

```

### 4. js/game.js endShake(): "One way that works" / "Another way"

Find (exactly once in `js/game.js`):

```
(G.sampleWild != null ? ' <small>(every 0 stands for ' + G.sampleWild + ')</small>' : '') + '</p>' :
```

Replace with:

```
(G.sampleWild != null ? ' <small>(every 0 stands for ' + G.sampleWild + ')</small>' : '') + '</p>' + (window.Explain ? Explain.buttonHTML(sample, { goal: G.goal, fractions: G.fractions, wild: G.sampleWild, who: anyOk ? 'Another way' : 'One way that works' }) : '') : // EXPLAIN
```

### 5. js/review.js cardHTML(): Pip's after-match tip (only when the tip has a Solution)

Find (exactly once in `js/review.js`):

```
      picHTML(t.pic) + '<div class="ps-words">'
```

Replace with:

```
      picHTML(t.pic) + (window.Explain && t.raw && t.raw.sol && t.raw.ctx && t.raw.ctx.g ? Explain.buttonHTML(t.raw.sol, { goal: t.raw.kind === 'goal' ? t.raw.altVal : t.raw.ctx.g.goal, fractions: t.raw.ctx.g.fr, wild: t.raw.wild, who: 'Pip\'s Solution' }) : '') + /* EXPLAIN */ '<div class="ps-words">'
```

### 6. js/camp.js solShow(): Now or not / Impossible detective answers

Find (exactly once in `js/camp.js`):

```
function solShow(tokens, P, label) { return tokens ? '<p><b>' + label + '</b></p>' + exprBox(tokens, P.cubes) + '<p style="text-align:center;font-weight:800">= ' + Eq.fmt(P.goal) + '</p>' : ''; }
```

Replace with:

```
function solShow(tokens, P, label) { return tokens ? '<p><b>' + label + '</b></p>' + exprBox(tokens, P.cubes) + '<p style="text-align:center;font-weight:800">= ' + Eq.fmt(P.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: P.goal, fractions: P.fractions, cubes: P.cubes }) : '') : ''; } // EXPLAIN
```

### 7. js/camp.js ACT.campPick: the trap move's Now! Solution

Find (exactly once in `js/camp.js`):

```
exprBox(o.sol) + '<p style="text-align:center;font-weight:800">= ' + Eq.fmt(P.goal) + '</p>';
```

Replace with:

```
exprBox(o.sol) + '<p style="text-align:center;font-weight:800">= ' + Eq.fmt(P.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(o.sol, { goal: P.goal, fractions: P.fractions }) : ''); // EXPLAIN
```

### 8. js/camp.js ACT.campSolve: "You made it!"

Find (exactly once in `js/camp.js`):

```
campDone(true, '🎉 You made it!', exprBox(tokens, P.cubes) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(P.goal) + '</p>');
```

Replace with:

```
campDone(true, '🎉 You made it!', exprBox(tokens, P.cubes) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(P.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: P.goal, fractions: P.fractions, cubes: P.cubes, chk: chk }) : '')); // EXPLAIN
```

### 9. js/camp.js ACT.campSolve: "Not quite!"

Find (exactly once in `js/camp.js`):

```
join('') + '</ul><p style="text-align:center">Try again.
```

Replace with:

```
join('') + '</ul>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: P.goal, fractions: P.fractions, cubes: P.cubes, chk: chk }) : '') + /* EXPLAIN */ '<p style="text-align:center">Try again.
```

### 10. js/camp.js ACT.campShow: "One way to do it"

Find (exactly once in `js/camp.js`):

```
Eq.fmt(CAMP.P.goal) + '</p><p style="text-align:center">Can you find
```

Replace with:

```
Eq.fmt(CAMP.P.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(CAMP.P.sample, { goal: CAMP.P.goal, fractions: CAMP.P.fractions }) : '') + /* EXPLAIN */ '<p style="text-align:center">Can you find
```

### 11. js/camp.js ACT.campGoal: the shortest way to his sneaky Goal

Find (exactly once in `js/camp.js`):

```
' cubes:</p>' + exprBox(r.tokens) +
```

Replace with:

```
' cubes:</p>' + exprBox(r.tokens) + (window.Explain ? Explain.buttonHTML(r.tokens, { goal: val, fractions: P.fractions }) : '') + /* EXPLAIN */
```

### 12. js/screens.js daily puzzle: "You solved it!"

Find (exactly once in `js/screens.js`):

```
modal('<h2>🎉 You solved it!</h2>' + exprBox(tokens, D.cubes) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(D.goal) + '</p>' +
```

Replace with:

```
modal('<h2>🎉 You solved it!</h2>' + exprBox(tokens, D.cubes) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(D.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: D.goal, fractions: D.fractions, cubes: D.cubes, chk: chk }) : '') + /* EXPLAIN */
```

### 13. js/screens.js daily puzzle: "Not quite!"

Find (exactly once in `js/screens.js`):

```
join('') + '</ul><p style="text-align:center">You can try as many times
```

Replace with:

```
join('') + '</ul>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: D.goal, fractions: D.fractions, cubes: D.cubes, chk: chk }) : '') + /* EXPLAIN */ '<p style="text-align:center">You can try as many times
```

### 14. js/screens.js ACT.dailyRevealYes: "One Solution"

Find (exactly once in `js/screens.js`):

```
Eq.fmt(D.goal) + '</p><p style="text-align:center">Can you find
```

Replace with:

```
Eq.fmt(D.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(D.sample, { goal: D.goal, fractions: D.fractions }) : '') + /* EXPLAIN */ '<p style="text-align:center">Can you find
```

### 15. js/ways.js waysChecked(): "Not quite!"

Find (exactly once in `js/ways.js`):

```
    modal('<h2>🤔 Not quite!</h2>' + exprBox(tokens, P.cubes) + '<ul class="reasons">' + chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
      '<p style="text-align:center">That\'s OK! Fix it
```

Replace with:

```
    modal('<h2>🤔 Not quite!</h2>' + exprBox(tokens, P.cubes) + '<ul class="reasons">' + chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: P.goal, fractions: P.fractions, cubes: P.cubes, chk: chk }) : '') + /* EXPLAIN */
      '<p style="text-align:center">That\'s OK! Fix it
```

### 16. js/ways.js ACT.waysMissed: "One you missed"

Find (exactly once in `js/ways.js`):

```
Eq.fmt(P.goal) + '</p><p style="text-align:center">' + why
```

Replace with:

```
Eq.fmt(P.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(toks, { goal: P.goal, fractions: P.fractions, cubes: P.cubes }) : '') + /* EXPLAIN */ '<p style="text-align:center">' + why
```

### 17. js/gift.js: puzzle from Tata, "Not quite!"

Find (exactly once in `js/gift.js`):

```
    modal('<h2>🤔 Not quite!</h2>' + exprBox(tokens, T.cubes) + '<ul class="reasons">' + chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
```

Replace with:

```
    modal('<h2>🤔 Not quite!</h2>' + exprBox(tokens, T.cubes) + '<ul class="reasons">' + chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: T.goal, fractions: T.fr, cubes: T.cubes, chk: chk }) : '') + /* EXPLAIN */
```

### 18. js/gift.js: "You cracked it!"

Find (exactly once in `js/gift.js`):

```
modal('<h2>🎉 You cracked it!</h2>' + exprBox(tokens, T.cubes) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(T.goal) + '</p>' +
```

Replace with:

```
modal('<h2>🎉 You cracked it!</h2>' + exprBox(tokens, T.cubes) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(T.goal) + '</p>' + (window.Explain ? Explain.buttonHTML(tokens, { goal: T.goal, fractions: T.fr, cubes: T.cubes, chk: chk }) : '') + /* EXPLAIN */
```

### 19. js/gift.js maker: "One Solution"

Find (exactly once in `js/gift.js`):

```
'<div class="gf-sample">One Solution: ' + exprBox(R.sample) + '</div>'
```

Replace with:

```
'<div class="gf-sample">One Solution: ' + exprBox(R.sample) + (window.Explain ? Explain.buttonHTML(R.sample, { goal: M.goal, fractions: M.fr }) : '') + '</div>' /* EXPLAIN */
```

## What was verified

- `node tests/engine.test.js`: 831 passed. `node tests/explain.test.js`: 4558 passed.
- Browser (a scratch copy with all the snippets above, port 3533, at 1280x800 and 390x844): buttons from a test pop-up
  for plain (coloured cubes), fractions, factorial, upside-down, base 8, a long "one way that works", a wrong value
  (with the bracket idea) and an uneven division (stuck step). Next / Back / See the answer / Show all steps / Got it /
  Esc all work; the pop-up underneath stays open after closing; no sideways scroll at 390px; no console errors;
  `solHTML()` with the snippet produces the button.
- NOT verified in the browser: a real match's end-of-shake screen, Pip's tip, Training Camp, daily puzzle, How Many
  Ways and gift screens (the snippets apply cleanly and parse, but those screens weren't clicked through), and the
  read-aloud audio (the code only calls `Snd.speak` when `S.set.voice === true`).
