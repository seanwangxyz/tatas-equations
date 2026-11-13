# Handoff: the cup really holds the cubes, the roller dumps it, rerolls by hand (agent `cuptoss`)

Files (mine): `js/three/table.js` (blocks marked CUPTOSS), `js/three/player.js` (CUPTOSS block + 3 small hooks in
`step`, a `belly` pose channel), `js/three/creatures.js` (CUPTOSS block + 6 one-line hooks in `update`), this note.
Nothing else. A11Y, ONSETS, PERF, CRAFT, MATCHDAY, BONUS and VARI3D code paths are untouched (On-Sets keeps its own
pour). `node tests/engine.test.js`: 948 passed.

## The owner's three requests

1. "they go through the cup": the sweep at the start of a shake now lifts each cube to a point **above the mouth**
   (in the cup's own space, so it follows the cup) and drops it **straight down through the opening** onto its own spot
   in a little pile on the lining's floor (`loadSpot`, 7 a layer). The cubes then **ride inside the cup** (`cupLoad`,
   `placeLoad`) until they pour out of its mouth: each physics cube spawned at the mouth hides "its" cube in the pile.
   Inside, a cube is 0.5 units (it fits the opening with room to spare) and casts no shadow on the felt. Works for
   today's tipping cup too (fallback pour) and for the reroll's way back in.
2. "pick up the bucket and dump it upside down": see Dump below.
3. "when you reroll the ones that are roots ... grab each one quickly, one with each hand ... toss it into the air":
   see Toss below.

## Dump (the roller empties the cup at the start of a shake)

`T3.pour(cubes, done, { by })`, by = `'me'` (this device's player), `'mate'` (Tata), or a creature seat `0` / `1`
(the index `aiSeat(i)` / `creatureAt(i)` use). No `by` (online guests, On-Sets, old callers) = today's pour.

Timeline (seconds from `newShake`; the sweep length varies a little with where the cubes lie):

| t | what |
|---|---|
| 0 - 0.6 | the cup glides in and stands on the felt just in front of the roller (the kid at the near seat: a little to his left on screen, so his head never hides it); the old cubes sweep up and drop in (from 0.3) |
| ~1.2 | (dump u = 0) both hands come to the cup's sides (0.45 s; the body leans, or the kid lies on his tummy on the rim, a creature leans / steps in, chosen once like a move's reach) |
| u 0.45 - 1.0 | lifted and carried a little in over the table (a tiny tip back toward the roller as it rises) |
| u 1.0 - 1.5 | turned upside down between the hands (they hold it on the turning axis, so they stay put); the cubes start falling out of the mouth at about 100 degrees (55 a second, like today) |
| u 1.5 - 1.72 | held upside down |
| u 1.72 - 2.52 | turned back, carried back and set down where it stood |
| u 2.52 - 2.84 | the hands let go and ease home |
| settle + 0.65 s | done(results); the cup is hidden (the cubes slide to their slots as before) |

Measured (1280x800, timer-driven frames): today's pour 5.3-5.8 s from the call to done(); with the dump 7.3-7.5 s
(about +1.7 s; the cubes start falling ~0.8 s later and done() waits until the cup is down and let go). `DUMP` in
table.js holds every time and distance (`T3._cuptoss({ dump: {...} })` tunes them live).
Cubes are thrown out of the mouth toward a spot 3.5-8.5 units beyond the cup (away from the roller and from the
cup's own spot), gentle speeds. Before the cup comes back down, a cube lying on its spot is nudged aside; once down the
cup is solid (a cylinder in the physics) only if its footprint is clear. The rim walls, the spawn clamps and the
`finishPour` / `settleInside` safety net are unchanged.

Falls back to today's tipping pour when: no `by`, `A11y.calm()` / reduced motion, the tab is hidden, the figure is not
at the table or hidden (Settings "Show me at the table" off, quality too low, a seat with no figure: `ctx.grips`
returns null), or the person can't reach from his seat.

Tap: a tap on the table during a dump skips it (the cubes are out and settled at once, the hands let go).

## Toss (rerolling √ / ^ cubes by hand): `T3.rerollToss(list, opts, done)`

`list`: `[{ id, s }]` (the face each must end up showing, chosen by game.js). `opts.by`: as above. `opts.onToss()`:
called once, when the cubes leave the hand (or the cup). `done()`: exactly once, after they have landed (also when
skipped by a tap, torn down, hidden, on any error, or by a safety timeout). Returns true if it started.

- **One or two cubes**: the roller's hands come down onto them (0.4 s; one in each hand, each hand takes the cube on its
  own side), the fingers close (0.12 s), a quickening scoop up (0.32 s) and they let go: the cubes fly about one unit
  higher, spin (calmer than T3.reroll's) and land on their spots showing exactly `s` (the same relabelling as
  T3.reroll: the fall is simulated first, then each frame is turned by one fixed cube symmetry). The hands follow
  through upward and ease home (0.34 s). Toss to landed: ~0.85 s + ~0.8 s = about 1.6-1.9 s.
  Kid: his cubes are usually in the middle of Resources, beyond a lean, so he slides in on his tummy over the rim,
  legs out behind, feet up (new `belly` pose channel), then slides back. Creatures lean / step in over the table (their
  move posture). Two cubes too far apart for one hand each: one toss, then the other.
- **More than two**: they sweep back into the cup (really inside, as above), the roller dumps it again (same timeline
  as the dump), and they land showing exactly `s`: the whole fall is simulated first (the cup's path is fixed, so each
  cube leaves the mouth exactly where the cup is drawn), the other cubes are solid and never move, then it is played
  back relabelled. onToss when the cup spills.
- Reduced motion (`A11y.calm()` / prefers-reduced-motion): each cube just turns over in place (0.52 s, a small lift).
- No figure (hidden, not at the table, a bonus d20 in the list): T3.reroll's hop as before (onToss at once).
- After landing, every cube is checked flat on face `s` (`flatten`).

`T3.reroll(list, done)` is unchanged and still works. `T3.tossing()`: true while a toss / re-dump is running.
