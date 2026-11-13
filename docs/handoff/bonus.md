# Handoff: the bonus dice and the Twist deck (HOUSE RULE, agent `bonus`)

A house rule the owner asked for, **not part of the official game**: two twenty-sided dice and a deck of Twist cards
the kid earns with skill points after the operations ladder is finished. Every face and card, its exact meaning, the
caps and every judgment call are in RULES_SUMMARY.md **section 7**. This file says how the code fits together.

| Piece | Colour | What it is in play |
|---|---|---|
| Big-number die | purple | an extra cube with one number (10 … 1000, ½ … 1½), never glued to a digit |
| Power die | gold | an extra cube with a new operation (n!, x², x³, \|x\|, mod, %, max, min, avg, gcf, lcm, 2×, ½×, −x, 1/x, √x, Σ, #) |
| Twist deck | teal cards | one card drawn after the roll: switches on a variation card for the shake, or Golden Goal / Bonus +2 / Free hint |

The Twist deck replaced the third (teal) Twist die: the owner found a die that rolls out with the cubes and then stays
on the rim confusing ("one of the bonus balls seems to stay on the side and not go to the playing board"). Same 20
cards, same odds, same rules; the save key is still `twist` (`S.bonus.force.twist`, `.off.twist`, `.seen.twist`), so
old saves keep their deck.

## Files

| File | What changed |
|---|---|
| `js/bonus.js` | Everything else: dice and faces, the 20 Twist cards (`TWIST`: k, card + set, or icon / name / rule, plus the one short `line` printed on the card), op names / rules / lessons, unlocking (`S.bonus`), `Bonus.onShake` (adds cubes 24/25, `G.twistDue`, `T3.twistDeck`), `beforeGoal` (celebration, first-time op lesson, `drawTwist`), `adjust` (scoring twists), `cardInfo(f, set)` (icon, name, line for a card face), chip (3D: chip; flat: mini deck + flipping card), builder note, Parent corner rows, Training Camp tile and drill. |
| `js/engine.js` | `// BONUS` block after `OPDEF`: symbols (`Eq.BIG` = 20 Greek letters for the Big-number faces, Power ops `F Q C A D B U O R S N M E X I Y G L`), their `OPDEF` entries (`bonus: true`, `card: null`), `SHOW` labels (the die's face label), `CUBE_FACES.power` / `.big` (not in `COLORS`, so `Eq.roll()` is unchanged), maths in `opCore` / `unCore` (reusing the card maths where it exists), 8 new `MSG` lines. Small marked changes: `cubeOf`, `isNumSym` (+ the big die), the evaluator (big die token, generic pre / post bonus ops, `bpost`), the solver (`leafSym`, `leaves`, `preP`), `goalIdeas` (bonus Goals; card ideas turn digits only), `resolve` (a × after x² multiplies), and `isNumSym` instead of `isDigit` in the Use It Again checks of `checkSolution` / `cubeTokens` (the big die is never "used again"). With no bonus symbol nothing behaves differently. |
| `js/game.js` | Hooks marked `BONUS`: `newShake` → `Bonus.onShake`; `rerollOps` re-rolls a switched-off bonus face (`okC`); `startGoalPhase` → `Bonus.beforeGoal` (before the variation cards); `cubeHTML` label; `ACT.hint` free hint; `endShake` → `Bonus.adjust`; `sampleSolution` remembers whether the search was complete and the "couldn't find" box says "not proved" when it was not. |
| `js/ai.js` | `VERSION` 6. 4★+ creatures (`bonusFan`) put bonus Goals first (70%), like bonus cubes in moves, try a bonus cube first in Solutions (`tasteSets`); weaker ones never use a bonus cube in a Goal. |
| `js/three/table.js` | `// BONUS` block: icosahedron geometry with a 5 × 4 face atlas, `D20Q` (face k up, label upright), `d20Tex`, a convex physics shape. Meshes 24 and 25 are the bonus cubes (their role follows `G.cubes[id].color`). `pour` spawns only the cubes in play (`pour.n`). `upFace`, `slotQuat`, `settleInside`, `sync` know a d20 (rests 0.575 high, a bit bigger than a cube). `reroll` makes a d20 hop onto its new face. **`// BONUS: the Twist deck` block** (near the end, where the old Twist die API was): the stand, the deck, the card textures, the draw animation; `twistPour()` (one line in `api.pour`). API: `T3.twistDeck(on)`, `T3.twistDraw(info, reveal)`, `T3.twistDrawing()`, test hook `T3._twistFace(info)` (a card face as a canvas). The teal d20 (mesh, physics body, `D20COL.twist`, rim hop, `twistDie` / `twistFace` / `twistShow`) is gone. |
| `js/three/replay.js` | stand-in colours for bonus cubes (only used when a mesh is hidden). Nothing about the Twist (checked). |
| `js/builder.js` | `Bonus.builderNote(B)` (what each offered bonus cube means, with a "How?" lesson button); an exponent may follow x²; the first-time XP line names "the gold x² cube". |
| `js/variations.js` | `hasEffect` counts the big die as a number, not an operation; `CAP.m = 'remainder'`. `randomSet` is used by the deck for the Exponent card's colour (chosen before the draw so the card can name it). |
| `js/screens.js`, `js/camp.js`, `js/config.js`, `index.html`, `css/bonus.css` | Parent corner rows; the Camp tile + drill branch; `S.bonus` defaults; script and stylesheet tags; flat-mat tiles (gold rim + a small d20 icon), chip, lessons. `css/bonus.css` also has the Twist card icon (`.bd-twist`, a teal card back) and the flat mat's mini deck and one-time card flip (`.tw-deck`, `.tw-card.flip`). |
| `tests/engine.test.js` | Block "BONUS DICE": 226 checks (831 total), including 9 for the Twist deck (js/bonus.js loaded with stand-ins): 20 cards with the old odds, 15 different variation cards, every card has a short line, icons, the Exponent colour, which cards can be drawn (earned / switched on / can change the shake / Bonus +2 needs a bonus cube), and the `twist` save key. |
| `tests/playtest.js` | `bonus`, `bonus:big`, `bonus:power`, `bonus:twist` (join with `+`); prints bonus use per creature and the re-check. (Its comments still say "Twist die"; see the snippets below.) |

## How a shake runs

1. `newShake` rolls the 24 cubes, then `Bonus.onShake(G)` appends the earned, switched-on Big-number / Power dice as
   cubes 24, 25 (`color: 'big' | 'power'`), sets `G.twistDue` (a card will be drawn) and calls `T3.twistDeck(on)`
   (the stand appears; one-shot: a later pour nobody asked about, like online play's, hides it again).
2. The pour (3D) or the flat clatter; `rerollOps` re-rolls locked operations AND switched-off bonus faces.
3. `startGoalPhase` → `Bonus.beforeGoal`: a newly earned die / the deck is celebrated (modal), a Power op seen for
   the first time gets its lesson, then `drawTwist`: one card is picked uniformly from the cards `twistOk` accepts
   (the old die's odds exactly: it re-rolled to a face that counts). The Exponent colour is chosen first
   (`Vari.randomSet`) so the card can name it. In 3D `T3.twistDraw(cardInfo, reveal)` plays the draw; `reveal`
   (as the face turns to the camera, or at once with no picture) does what the old `apply` did: `G.twist`, a card
   calls `Vari.apply` and sets `G.variDone` (so `Vari.beforeGoal` offers no card that shake), chip, big screen, Pip's
   one sentence (`The Twist card is <b>Name</b>: line.`), then the game goes on 1.7 s later. Flat mat: `reveal` at
   once; the chip's card flips (CSS) and there is also the old banner (in 3D the card itself is the banner).
4. Play as usual: bonus cubes are cubes. Their symbols travel to the worker in the snapshot like any face.
5. `endShake` → `Bonus.adjust(r)` doubles (Golden Goal) or adds 2 (Bonus +2) before the scores are added.

## The 3D Twist deck

- **Where:** a teal lacquered stand (1.5 × 3.7 units, top at table height, a stem down to the floor and a gold foot)
  centred at x = W/2 + 1.75, z = D/2 − 2.2: just outside the right-hand rim, toward the player's end. That keeps it off
  the felt (no cube ever lands on it, no physics needed), away from the zones, the cup's path (the cup comes in at
  z = −1.5 / −3 on the right), the creature behind the far side, the kid at the near centre and the far-left corner
  where Three-at-the-table puts the second creature. Checked in view at 1280×800, 1024×768 (wide layout) and 400×800
  (tall layout, close to the right edge of the picture). It is not added to the camera fit (`hooks.extents`): adding
  points the fit cannot reach would push the camera back by the full 35% cap. On a screen shaped between those, the
  stand could be cut off at the right edge; see "Not done".
- **What is on it:** the near half holds the deck (six card edges, a card back on top, and the top card, the one that
  is drawn); the far half is a dashed spot with a "?" where the drawn card lies; the front says TWIST.
- **The draw** (`twStep`, run from `hooks.frame`, about 1.9 s, once): lift + flip over about the axis pointing at the
  player (0-0.35 s), glide up to a spot in front of the camera, facing it, about 45% of the picture's height (to
  0.85 s; `reveal` fires at 70% of this glide), hold (to 1.45 s), settle face up on the spot with a small arc (to
  1.9 s, a thunk). The show spot follows the live camera (a close-up or look-around can't leave the card behind).
  A pointerdown on the picture during the draw (capture listener, `stopImmediatePropagation`) skips to the card
  lying on its spot. While it plays, `talkUntil` is nudged so the frame loop draws at full rate (not as a low-rate
  ambient redraw). At rest nothing moves.
- **Textures:** canvases, 640 × 896 per card (crisp when the camera zooms in), anisotropy on. The back: teal with a
  woven diamond pattern, a white and a gold frame, a gold spiral and TWIST. The face: cream, a teal frame with a TWIST
  band, a big emoji icon on a soft halo (variation cards use their js/variations.js icon), the name (1-2 lines), the
  short line (up to 3 lines), and a VARIATION CARD / BONUS TWIST tag. Faces are lit with a little emissive so they
  stay readable in dark venues. The face texture is rebuilt for each draw (the old one disposed).
- At the next pour (`twistPour`), the drawn card goes back on top of the deck, face down.

## Snippets for files this agent does not own

- **README.md**, the `js/bonus.js` row: `| js/bonus.js | HOUSE RULE bonus dice (Big-number, Power) and the Twist deck, earned with skill points: RULES_SUMMARY.md section 7, docs/handoff/bonus.md |`;
  and the test count line: `831 checks (226 of them for the house-rule bonus dice and Twist deck): ...`.
- **tests/playtest.js** lines 14-16 (comments only): "the Twist die switches on one of its variation cards" →
  "the Twist deck draws one of its variation cards"; line 150: "the Twist die may pick this shake's card" → "the
  Twist card may pick this shake's card". (Its 3-in-4 card rate is a rough stand-in and unchanged by the deck.)

## Testing and measurements

- `node tests/engine.test.js`: 831 passed.
- Earlier round (dice): `node tests/playtest.js 6 4 bonus:big | bonus:power | bonus:twist | bonus`: every game
  finished; 133 / 136 / 143 / 137 Solutions written, **0 wrong** on re-check. 4★+ creatures used a bonus cube in most
  of their Goals; 1-3★ creatures never did. Solver: median 1 ms, 90th percentile 10-25 ms for an Impossible search;
  a few exhaustive "no Solution" proofs take seconds, but every in-game search is capped and a capped search never
  claims "impossible". (The deck changes no maths, so these were not re-run.)
- In the browser (port 3511): wide 1280×800 and 1024×768 and tall 400×800, 3D (stadium; ocean venue looked at once)
  and flat. Seen: no teal die in the pour; the stand beside the right rim; a variation draw (Upside-down: the card big
  in front of the camera, then face up on the stand, "This shake" chip + Twist chip, big screen, Pip); a scoring draw
  (Bonus +2 with every variation card switched off) followed by the normal card picker; the tap-to-skip; the chip's
  explanation and the lesson's card list; the flat mini deck before the draw and the card after it. `Bonus.adjust`
  checked directly for Golden Goal and Bonus +2, and `freeHint()`.

## Not done / ideas

- Online play: bonus dice and deck off (not synced). To add: sync `G.twist` and the extra cubes; `online.js` `symOK`
  would need `Eq.cubeOf(s) !== null`.
- The stand is not part of the camera fit; on an unusual aspect ratio it could sit at the very edge of the picture.
  If that shows up, push its two outer corners into `hooks.extents` only when they are already within reach.
- `creatures.js scanMovers` watches cubes 0-23 only (the creature doesn't turn its head toward a moving bonus cube).
