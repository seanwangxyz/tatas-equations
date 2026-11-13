# Handoff: the variation cards in 3D (agent `vari3d`)

The owner asked for "3D for the variation cards: cubes that actually turn upside down or sideways on the table, and small
labels over cubes with a second meaning". It covers the Goal row on the 3D table and the Solution replay. With no
variation card in play, none of the new code changes anything (details under "No card").

## Files

| File | What changed |
|---|---|
| `js/three/varilabels.js` (new, ES module) | Shared by the table and the replay. `variRow(tokens, fractions)`: one entry per token `{turn, exp, bang, cap}`. `labelTex(text)`: a cream pill label with a small pointer (a `1/d` label is drawn as a stacked fraction). `bangTex()`: the chalk "!". `stack(items, obstacles, pad)`: the no-overlap layout. `createLabels(...)`: billboard labels over table cubes, laid out on screen every drawn frame. `heldTurn(...)`: a carried Goal cube turns in the hand. |
| `js/three/table.js` | Small `VARI3D` lines only (nothing in the BONUS blocks): the import; `vplan` / `vlab` next to the scene; in `sync`, the Goal row reads `variRow` (exponent and "!" slot widths, the exponent's raised spot, a `turn` on the target, the label list), and the per-cube loop adds `t.y` and `t.turn` to the target and keeps a hand-turned cube turned when it lands; `pour` clears the labels and the plan; `frame` runs `heldTurn` after the per-frame hooks and lays the labels out right before drawing; new `T3.goalPlan(tokens)`. |
| `js/three/replay.js` | Uses the same `variRow` / `labelTex` / `bangTex` / `stack`. A turned cube flies in turned, an exponent lands raised and small, each label shows once its cube has landed, a written "!" is the chalk "!". Also fixed: the running value under the row dropped a turned cube, a power of ten, an exponent, x² or a trailing "!" (`prefixValue` only knew the digits 0-9), so the count showed the wrong number. |

`js/variations.js` is untouched: the labels use `Vari.capOf` as it is.

## What each card looks like in 3D now (Goal row and replay)

| Card | On the table |
|---|---|
| Upside-down | The cube rests turned 180° about the vertical axis (its digit reads upside-down from the seat, the 6/9 underline on top), label "−3" |
| Sideways | Turned a quarter turn clockwise (like the flat builder's picture), label: a stacked "1 over 3" |
| Percent | The √ cube turned upside-down, label "percent of" |
| Remainder | Solutions only (the engine refuses it in a Goal): in the replay the ÷ cube is turned sideways, label "remainder" |
| Exponent Colour | The exponent cube sits raised (floating like a superscript), 58% size, at the top-right of the slot before it. No label: its place says it |
| Powers of Ten | Label "10", "100", "0.1" … over the 1 |
| Average | Label "average" over the + |
| Number of Factors / Smallest Prime | Label "# factors" / "next prime" over a × in the counting place (a × between two numbers gets no label) |
| LCM / GCF | Label "LCM" over the √ / "GCF" over the ^ |
| Decimal Point | Label "point" over the ^ |
| Factorial | Each written "!" is a chalk-white "!" (hand-drawn stroke, fixed chalk grain, soft shadow) in its own narrow slot after the cube or ")" before it |
| 0 Wild | Label "wild" over a 0 |
| Base m | Label "base 8" over the first digit of a two-digit numeral (a Solution in the replay; a Goal has single digits) |
| Two-digit, Use It Again, Three Operations, Multiple of k | Nothing changes per cube (no label) |

Labels: billboards that always face the camera, drawn on top (no depth test) so the creature's arm never hides
half of one. The table lays them out in screen pixels every drawn frame: 17 to 28 px tall (grows a little when the view
comes closer, never huge), centred just over the cube's top edge on screen. If that spot touches another label or
another Goal cube (a raised exponent, or a view along the row after orbiting), the label goes beside its cube (right,
then left), and only if both are taken is it lifted just above what it touches. No bobbing, no animation of their own.
They are hidden during the pour, a reroll, while any cube is held or dragged, while the cube under it is still moving,
while a replay runs, and when their cube is outside the picture. They are a handful of sprites made the first time a
labelled Goal appears and disposed (sprites, materials, textures) at the next pour.

Turn animation: a cube placed in the Goal straight from Resources (no avatar) turns during its usual 0.65 s flight
(the slerp to the turned rest). When the avatar or a creature carries it (`humanGoal` / `aiSetGoal`), the cube turns in
the hand over 0.45 s right after it is lifted and lands already turned; this needs `T3.goalPlan` (paste 1 and 2 below).
Without the paste, the cube lands as it was and turns in place in 0.38 s (the usual landing settle). Never repeated,
never looping.

Required / Permitted / Forbidden / Resources cubes are never turned or labelled: only the Goal row and the replay read
the cards (the official rule: a move binds nobody to a meaning). The builder (flat overlay) is untouched.

## Please paste (js/game.js, the lead's)

**1. `humanGoal`**: right after the line
`  var sit = G.cubes, k = 0; G.busy = true; G.carrying = true; renderGame();`
add

```js
  if (T3.goalPlan) T3.goalPlan(tokens);   // VARI3D: a turned Goal cube turns in the kid's hand and lands turned
```

**2. `aiSetGoal`**: right after the line `      if (T3.active() && T3.creatureMove) {` add

```js
        if (T3.goalPlan) T3.goalPlan(toks);   // VARI3D: a turned Goal cube turns in the creature's hand
```

Nothing else is needed: the plan is only used while `G.phase === 'goal'`, and the next pour forgets it. (Optional
tidiness: `if (T3.goalPlan) T3.goalPlan(null);` at the top of `setGoal`.) `T3.goalPlan` is not in the stand-in T3 in
js/config.js, hence the `if`.

The 3D Goal HUD (`#gGoal`, `Vari.goalHTML('mini')`) was already pasted and still shows the 2D version above the table.

## No card

- `sync`: `vr` is null unless `G.vari` is set AND some Goal token is turned / an exponent / a "!" / labelled, so widths,
  targets (no `y`, no `turn`) and the paren sprites are computed exactly as before; `vlab.set` is not even called.
- `frame`: `heldTurn` returns at once (no plan), `vlab.frame` returns at once (no labels). `T3.replay` only reads the
  cards when `Eq.rulesOf(fractions).any` and something in the Solution is special; the `prefixValue` fix gives the same
  values as before for plain digits.
- Checked in the browser: a no-card shake leaves 0 label sprites in the scene.

## Verified, and not

Verified (own tab, port 3514, 1280x800 and 400x800 emulated; screenshots read back from the WebGL canvas):
- `node tests/engine.test.js`: 822 passed.
- Goal row from the seat camera, each set through the real `humanGoal` with the kid's avatar carrying (and
  `T3.goalPlan` called as in paste 1): Upside-down (four turned cubes, four labels), Sideways (stacked 1/2, 1/5), Percent,
  Exponent Colour (blue 2 raised over the 5), Powers of Ten (10, 100), Average, Number of Factors with parentheses,
  Smallest Prime (the × between numbers unlabelled), LCM, GCF, Decimal Point, Factorial (two chalk "!"), 0 Wild.
- The cube turning in the hand: `ctx.held` + `vturn` sampled during the carry; it landed turned. The fallback with no
  plan (Sideways): turned on landing.
- Orbited views (dragged with pointer events, zoomed with the wheel): labels face the camera; looking along the row
  they first piled up above one cube (fixed: they now sit beside their own cube); tall 400x800 seat view with four labels.
- A creature carrying a cube hides the labels; they come back when it lands.
- Replay (`T3.replay` called directly with card modes): sideways 1 and 6 with fraction labels; remainder (sideways ÷,
  label), "!" chalk, raised exponent; base 8 "37 + 4" with "base 8". The table's labels hide during the replay.
- No console errors from these files (the only errors were 404s for asset files missing in the worktree).

Not verified:
- Pastes 1 and 2 as real edits of game.js (simulated by calling `T3.goalPlan` myself before `humanGoal`). A creature's
  own Goal carry (`aiSetGoal`) with a turned cube: the hook path is the same `ctx.held`, but I did not watch one.
- A real end-of-shake replay started by js/replay.js with a card Solution (I called `T3.replay` directly with the same
  options it passes), and the replay's running value with turned cubes (fixed by reading the code, not watched).
- The Goal picked through the real card picker and builder (I applied the card with `Vari.apply` and passed tokens to
  `humanGoal`, the same tokens the builder hands over).
- Real phones / iPad, low quality tier, other mats and venues (all checks on the stadium felt).
- With the new card deck (the other helper replacing the Twist die): nothing here touches it, but not run together.

## Judgment calls

- Labels are drawn on top of everything (no depth test) so they stay readable; the trade-off is that one can sit over the
  creature's hand for a moment, which is why they hide while anything is carried.
- Exponent cubes get no label ("power" would crowd the cube before it); the raised small cube is the signal, as in 2D.
- "1/3" from `Vari.capOf` is drawn as a stacked fraction; "lcm"/"gcf" are shown upper-case. Other texts are `capOf`'s.
- "wild" (0 Wild) and "base 8" (Base m) are new 3D-only labels; `capOf` has none for them.
- Sideways is a quarter turn clockwise to match the flat builder (`rotate(90deg)`).
- In views looking along the row, a label may sit beside its cube rather than over it (its pointer still points down).
