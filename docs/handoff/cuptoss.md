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
  Creatures lean / step in over the table (their move posture); two cubes too far apart for one hand each: one toss,
  then the other.
  **The kid and Tata (round 2, coordinator):** never on the table. Like a move, he walks round the outside of the table
  (the same ring, obstacles and sides as `T3.playerMove`; the other person is gone round, a creature's side is never
  used) to the spot on the rim from which both cubes are in reach, one in each hand, standing or tummy on the rim (hips
  outside it), and faces in. If no spot reaches both: the nearer cube first; he grabs it, lifts it, carries it in his
  hand (the move's carry pose) along the edge to the spot for the other, grabs that one too with his other hand, then
  the same scoop and toss; then he walks back to his seat (the walk back is free: done() fires when the cubes land).
  Spots where he would lie over the near rim with his back to the camera cost a little more, so a cube that can be
  reached from a side is taken from the side. Measured (1280x800): the kid, one cube at the far right end: toss at
  1.6 s, done 3.2 s; two close cubes in the middle: from his seat, toss 0.9 s, done 2.6 s; two far apart (left and
  right ends): toss 3.2 s, done 4.4 s. Tata from the left seat (3 players): far right cube toss 3.0 s / done 4.7 s
  (round behind the kid), far apart 3.7 / 5.1 s, close 2.2 / 4.0 s. Grip adapter additions: `walk(pts, done, {carry})`,
  `home()`, `at()`, `sideOf(p)`; `set()` now plans from where he stands and never kneels on the felt (the belly slide is
  gone).
- **More than two**: they sweep back into the cup (really inside, as above), the roller dumps it again (same timeline
  as the dump), and they land showing exactly `s`: the whole fall is simulated first (the cup's path is fixed, so each
  cube leaves the mouth exactly where the cup is drawn), the other cubes are solid and never move, then it is played
  back relabelled. onToss when the cup spills.
- Reduced motion (`A11y.calm()` / prefers-reduced-motion): each cube just turns over in place (0.52 s, a small lift).
- No figure (hidden, not at the table, a bonus d20 in the list): T3.reroll's hop as before (onToss at once).
- After landing, every cube is checked flat on face `s` (`flatten`).

`T3.reroll(list, done)` is unchanged and still works. `T3.tossing()`: true while a toss / re-dump is running.

## Wiring for js/game.js (not applied: game.js is the lead's)

1. A helper next to `avatarMoveFn` (after its closing `}`, before the comment `// A human's move: the kid (or the mate) picks the cube up and lobs it`):

```js
// CUPTOSS: who handles the cup / the reroll toss for player i in 3D: a creature seat (0 / 1), 'me', 'mate', or null (no figure: today's animation)
function rollerOf(i) { var f = avatarMoveFn(i); return isAI(i) ? aiSeat(i) : f === T3.mateMove ? 'mate' : f === T3.playerMove ? 'me' : null; }
```

2. `newShake`: the Goal-setter dumps the cup. Insert ONE line right before the anchor
   `    T3.pour(G.cubes, function (res) {`:

```js
    if (T3.pourBy) T3.pourBy(rollerOf(G.setter));   // CUPTOSS: the Goal-setter picks the cup up and dumps it
```

   (Equivalent: pass it as a third argument, `}, { by: rollerOf(G.setter) });` on the `T3.pour` call's closing line.)
   Without the helper, the same one line inline:
   `if (T3.pourBy) T3.pourBy(isAI(G.setter) ? aiSeat(G.setter) : avatarMoveFn(G.setter) === T3.mateMove ? 'mate' : avatarMoveFn(G.setter) === T3.playerMove ? 'me' : null);`

3. `rerollOps`: the roller tosses the cubes by hand. Replace the anchor line
   `    if (T3.active() && T3.reroll) T3.reroll(roll, next);   // they hop up, tumble and land showing the new face (about 1 s, with the clatter)`
   with:

```js
    if (T3.active() && T3.rerollToss) T3.rerollToss(roll, { by: rollerOf(G.setter), onToss: function () { /* the cubes leave the hand: a line could go here */ } }, next);   // CUPTOSS: grabbed, tossed up, they land showing the new face
    else if (T3.active() && T3.reroll) T3.reroll(roll, next);
```

   `next` is called exactly once after they land (as with T3.reroll), so the `setTimeout(step, 350)` rhythm is unchanged.
   One or two cubes take ~1.7-2.7 s (grab 0.84 s, then the fall), three or more ~4.3-6 s (back into the cup and dumped).

Online: guests keep calling `T3.pour(cubes, done)` without `by` (online.js), so they see today's pour; the host's
`rollerOf` already maps the far person to `'mate'` through `Online.moveFn`. Tutorial: `avatarMoveFn` returns null, so
null: today's pour. On-Sets (onsets3d / ONSETS hooks): untouched, keeps its own pour.

## Hooks (new)

- `T3.pour(cubes, done, { by })`, `T3.pourBy(by)` (one-shot, read by the next `T3.pour` within 3 s).
- `T3.rerollToss(list, { by, onToss }, done)`, `T3.tossing()`.
- `T3._cuptoss(o)`: checks / tuning (`{ dump: {...}, toss: {...} }` sets times; `{ faces: [ids] }` returns each cube's
  top face, flatness and position; also the cup load, whether hands are on the cup, the dump clock).
- `ctx.grips.human('me' | 'mate')` (player.js) / `ctx.grips.creature(0 | 1)` (creatures.js): a figure's grip adapter
  `{ x, z, fx, fz, reach, sy, hand, set({ far, fn }) | set(null), hands(), holding() }`, null when that figure is not
  at the table. `set` takes per-frame world hand spots, a weight, openness and a look target; the figure leans / lies on
  the rim / steps in once for `far` and eases home on `set(null)`. Creatures: their reactions ease out only once the
  hands actually start (an entrance gives way like for a move).
- `T3.playerState().hold`: the chosen reach (stand / flop / crawl) while his hands are held.

## Performance

Nothing new at rest: the cup is hidden after every pour / toss (one Group, as before), the pile is the cubes
themselves, no new meshes. During a dump: one extra cylinder body in the physics while the cup stands on the felt.
A 3+-cube reroll runs its fall up front (up to 420 physics steps with only the rerolled cubes moving: a few ms). The
render loop goes quiet afterwards: measured 0.5 renders/s before and after creature and kid dumps in a calm venue
(same as today's pour), creatures `quiet`, no hands held (`T3._cuptoss().held` false).

## Verified / not verified

Verified (my own tab, 1280x800, timer-driven frames, pictures rendered from the canvas and looked at):
- Strips: the sweep into the cup from the seat camera and close up (cubes go over the rim and drop in, the pile
  inside, the cup waits above its place until the cubes lying there are in); kid dump (cup to his left on screen,
  tummy on the rim, lift, upside down, back down); creature dumps: Snoozy, Rusty, Ollie (classic), Blaze, Grub, Hex
  (monster rigs, hands on the cup's sides); Tata dump (p3, his corner seat); second creature dump (ai3, Splosh at the
  left corner); two-cube toss (kid: belly slide; Snoozy: leans and steps in); one-cube toss (Hex); three-cube back into
  the cup (Snoozy and the kid).
- Numeric: a wall check on every frame of the sweep (no cube passes through the cup's wall: 0 hits for creature,
  fallback and kid sweeps after the fixes, with Goal cubes lying under the cup's spot); the hands on the cup's sides
  (creature exact; the kid's far hand within ~0.3); 20 pours mixed (kid / creature / none, high then low quality, Goal
  cubes on the table): done() once each, 0 cubes off the felt at the finish, 0 `settleInside` fixes, every cube in
  Resources after the sync, cup load empty after; 20 rerolls mixed (1, 2, 3, 4, 5 cubes; kid / creature; calm):
  done() once, onToss once, every cube shows exactly the requested face, flat, inside the felt, also after a sync.
  Teardown: leaving the match mid-toss and mid-dump: done() once, hands let go, nothing pouring.
- The fallback pour (no `by`: today's flow until game.js is wired) with the walk-out and coin toss on: reaches the Goal
  phase; the cubes go into the cup the new way. `node tests/engine.test.js`: 948 passed.

Not verified: real devices / 60 fps feel (timer-driven frames; the shared pane reports reduced motion, so motion was
checked with the media query overridden); the game.js wiring itself (not applied; tested by calling `T3.pourBy` /
`T3.pour(.., {by})` / `T3.rerollToss` directly the same way); the tall phone layout; Team-up with Tata at the left
seat dumping (same code path as the p3 corner seat); online play (guests fall back by design); the trophy lift and
tournament practice (untouched code paths). Seen once during a match start, not from these files: a three.js
`checkMaterialsReady ... isReady` error from title.js's `compileAsync`.
