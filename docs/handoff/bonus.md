# Handoff: the three bonus dice (HOUSE RULE, agent `bonus`)

A house rule the owner asked for, **not part of the official game**: three twenty-sided dice the kid earns with
skill points after the operations ladder is finished. Every face, its exact meaning, the caps and every judgment
call are in RULES_SUMMARY.md **section 7**. This file says how the code fits together.

| Die | Colour | What it is in play |
|---|---|---|
| Big-number | purple | an extra cube with one number (10 … 1000, ½ … 1½), never glued to a digit |
| Power | gold | an extra cube with a new operation (n!, x², x³, \|x\|, mod, %, max, min, avg, gcf, lcm, 2×, ½×, −x, 1/x, √x, Σ, #) |
| Twist | teal | read once and set aside: switches on a variation card for the shake, or Golden Goal / Bonus +2 / Free hint |

## Files

| File | What changed |
|---|---|
| `js/bonus.js` (new) | Everything else: dice and faces, op names / rules / lessons, unlocking (`S.bonus`), `Bonus.onShake` (adds cubes 24/25), `beforeGoal` (celebration, first-time op lesson, Twist reading and re-roll), `adjust` (scoring twists), chip, builder note, Parent corner rows, Training Camp tile and drill. |
| `js/engine.js` | `// BONUS` block after `OPDEF`: symbols (`Eq.BIG` = 20 Greek letters for the Big-number faces, Power ops `F Q C A D B U O R S N M E X I Y G L`), their `OPDEF` entries (`bonus: true`, `card: null`), `SHOW` labels (the die's face label), `CUBE_FACES.power` / `.big` (not in `COLORS`, so `Eq.roll()` is unchanged), maths in `opCore` / `unCore` (reusing the card maths where it exists), 8 new `MSG` lines. Small marked changes: `cubeOf`, `isNumSym` (+ the big die), the evaluator (big die token, generic pre / post bonus ops, `bpost`), the solver (`leafSym`, `leaves`, `preP`), `goalIdeas` (bonus Goals; card ideas turn digits only), `resolve` (a × after x² multiplies), and `isNumSym` instead of `isDigit` in the Use It Again checks of `checkSolution` / `cubeTokens` (the big die is never "used again"). With no bonus symbol nothing behaves differently (all 605 old tests pass unchanged). |
| `js/game.js` | Hooks marked `BONUS`: `newShake` → `Bonus.onShake`; `rerollOps` re-rolls a switched-off bonus face (`okC`); `startGoalPhase` → `Bonus.beforeGoal` (before the variation cards); `cubeHTML` label; `ACT.hint` free hint; `endShake` → `Bonus.adjust`; `sampleSolution` remembers whether the search was complete and the "couldn't find" box says "not proved" when it was not. |
| `js/ai.js` | `VERSION` 6. 4★+ creatures (`bonusFan`) put bonus Goals first (70%), like bonus cubes in moves, try a bonus cube first in Solutions (`tasteSets`); weaker ones never use a bonus cube in a Goal. |
| `js/three/table.js` | `// BONUS` block: icosahedron geometry with a 5 × 4 face atlas, `D20Q` (face k up, label upright), `d20Tex`, a convex physics shape. Meshes 24 and 25 are the bonus cubes (their role follows `G.cubes[id].color`), plus a separate Twist mesh. `pour` spawns only the cubes in play (`pour.n`), then the Twist die; `finishPour` reads it and it hops onto the right-hand rim. `upFace`, `slotQuat`, `settleInside`, `sync` know a d20 (rests 0.575 high, a bit bigger than a cube). `reroll` makes a d20 hop onto its new face. API: `T3.twistDie(on)` (one-shot: the NEXT pour only), `T3.twistFace()`, `T3.twistShow(k, done)`. |
| `js/three/replay.js` | stand-in colours for bonus cubes (only used when a mesh is hidden). |
| `js/builder.js` | `Bonus.builderNote(B)` (what each offered bonus cube means, with a "How?" lesson button); an exponent may follow x²; the first-time XP line names "the gold x² cube". |
| `js/variations.js` | `hasEffect` counts the big die as a number, not an operation; `CAP.m = 'remainder'` (a sideways ÷ in an end-of-shake Solution was drawn as a plain ÷; found while testing). |
| `js/screens.js`, `js/camp.js`, `js/config.js`, `index.html`, `css/bonus.css` | Parent corner rows; the Camp tile + drill branch; `S.bonus` defaults; script and stylesheet tags; flat-mat tiles (gold rim + a small d20 icon), chip, lessons. |
| `tests/engine.test.js` | Block "BONUS DICE": 217 checks (822 total): every op hand-checked (positive and negative), fractions off, messages, Goal and Solution counting, solver hand cases, 22 round trips through `Eq.cubeTokens` + `checkSolution`, 22 brute-force comparisons against an independent enumerator, `goalIdeas`, and the Twist cards combined with bonus cubes. |
| `tests/playtest.js` | `bonus`, `bonus:big`, `bonus:power`, `bonus:twist` (join with `+`); prints bonus use per creature and the re-check. |

## How a shake runs

1. `newShake` rolls the 24 cubes, then `Bonus.onShake(G)` appends the earned, switched-on Big-number / Power dice as
   cubes 24, 25 (`color: 'big' | 'power'`) and tells the table whether to roll the Twist die (`G.twistRoll` is the
   flat table's roll).
2. The pour (3D) or the flat clatter; `rerollOps` re-rolls locked operations AND switched-off bonus faces.
3. `startGoalPhase` → `Bonus.beforeGoal`: a newly earned die is celebrated (modal), a Power op seen for the first
   time gets its lesson, then the Twist die is read (`T3.twistFace()` in 3D). A face that can't change the shake is
   re-rolled straight to one that can (`twistOk`). A card face calls `Vari.apply` and sets `G.variDone`, so
   `Vari.beforeGoal` offers no card that shake. Banner, Pip line, big screen, chip.
4. Play as usual: bonus cubes are cubes. Their symbols travel to the worker in the snapshot like any face.
5. `endShake` → `Bonus.adjust(r)` doubles (Golden Goal) or adds 2 (Bonus +2) before the scores are added.

## Testing and measurements

- `node tests/engine.test.js`: 822 passed (217 new).
- `node tests/playtest.js 6 4 bonus:big | bonus:power | bonus:twist | bonus`: every game finished; 133 / 136 / 143 /
  137 Solutions written, **0 wrong** on re-check. 4★+ creatures used a bonus cube in most of their Goals (e.g. all
  three dice: Ollie 7/9, Mondo 11/12, Hex 9/9); 1-3★ creatures never did (0/N).
- Solver timings: see the final report (node, this machine): median 1 ms, 90th percentile 10-25 ms for an
  Impossible search over a mid-shake mat, with or without bonus dice; a few exhaustive "no Solution" proofs take
  seconds (baseline 2.5 s max over 200 mats; with the Big-number die 17 s max). In the game every search is capped
  (hint 0.5 s, "one way" 0.9 s, creatures 0.15-0.9 s), and a capped search never claims "impossible".

## Not done / ideas

- Online play: bonus dice off (not synced). To add: sync `G.twist` and the extra cubes; `online.js` `symOK` would
  need `Eq.cubeOf(s) !== null`.
- The Twist die has no 3D re-roll physics (it hops and lands on the new face); the bonus cubes' reroll is a hop too.
- `creatures.js scanMovers` watches cubes 0-23 only (the creature doesn't turn its head toward a moving bonus cube).
