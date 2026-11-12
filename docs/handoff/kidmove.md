# Handoff: the kid's seat, his own cube moves, a new face (agent `kidmove`)

Files changed (mine): `js/three/player.js`, `js/three/creatures/kid.js`, `js/three/creatures/grownup.js`,
`js/three/table.js` (camera fit + one tween option only; orbit untouched), this note. Nothing else.
`node tests/engine.test.js`: 379 passed.

**Round 2** (owner: "he tosses the cubes"): only `js/three/player.js` and this note changed. He now carries the cube
round the table and places it by hand (section 2, rewritten). kid.js / grownup.js unchanged. Tata's far-seat face
checked (section 2, end). New: `T3.playerWalkSide()` for the 'ai3' second creature (wiring snippet in section 2).

## 1. His seat: bottom centre

He now stands in the middle of the near side, his back to the seat camera, **feet on the pitch** (no more sinking:
`place.y = FLOOR_Y - FOOT * s`, drop 0) just outside the near rim. He is sized so the outline of his head (hair
included) just touches the line of sight through a line on the felt 1.4 units inside the near rim: from the seat
camera his hair may overlap the wooden rim and that empty band of felt, never a cube or a zone label (the Resources
slots fill from the far side of the zone, so 24 cubes end 2.5+ units short of the rim). Below that, his head and the
tops of his shoulders show.

The camera fit makes the room (`table.js fitCamera`):
- the extents hooks are now called with the camera already at a sensible view (first the table-only fit, then the
  result of a first pass, then once more), so a view-relative placement like his settles;
- the aim along the table is searched both ways (toward the far side for a creature's head, toward the near side for
  his head);
- his points are marked `'soft'` (4th value); while any soft point is in the list the fit may back off up to 1.40x the
  table-only distance instead of 1.35x, so on wide, short screens the creature does not have to shrink as much. The
  creature-head shrink logic is unchanged (`true` = must).

Measured (table-only distance -> with him; creature shrink factor; the canvas is the 3D picture only, the HTML action
bar sits below it, it does not cover him):

| Viewport (canvas) | camera distance / table-only | creature shrink factor | his scale |
|---|---|---|---|
| 1280x800 (1260x597) | 1.31 -> 1.36 | 0.70 -> 0.52 | 2.1 |
| 1024x768 (1004x565) | 1.31 -> 1.36 | 0.70 -> 0.52 | 2.1 |
| 2000x1000 (1400x836) | 1.33 -> 1.38 | 0.82 -> 0.76 | 2.2 |
| 400x800 tall, Goal phase (380x494) | 1.25 -> 1.33 | 1.00 -> 0.82 | 2.3 |
| 400x800 tall, small bar (380x603) | 1.11 -> 1.22 | 1.00 -> 1.00 | 2.3 |

So the table is about 4% smaller than without him on wide screens (up to 10% on a tall one), and on 16:10 laptops /
iPad landscape the creature (which already shrinks to 0.70 there) shrinks to 0.52: that is the price of a head-room band
at the bottom AND the creature's head at the top on a short screen. `T3._fitCaps(1.35, 1.45)` would keep the creature
bigger at the cost of a smaller table (judgment call, I kept 1.40). **Tall (portrait):** the same bottom-centre seat (it
fits well: the table is limited by the width there). If his head can't be on screen at all, he is hidden.

If `#gAct` is ever overlaid on the canvas (css), keep it below the canvas or pad the canvas bottom, or it will cover his
head. Tuning hook: `T3.playerSeat({ into, low })` (into = how far into the felt his hair may reach, default 1.4;
low = how much of the bottom of his head the fit keeps on screen, 0.75).

Mates: `left` (Team-up, beside the left end) and `far` (across the table) work as before; the left seat keeps clear of
him (he is in the middle of the near side now, far away). Tata as the device's own player (`S.set.me === 'tata'`)
gets the same bottom seat.

## 2. Picking a cube up and placing it by hand: `T3.playerMove(id, zone, done, opts?)` / `T3.mateMove(...)`

**Update (round 2, owner feedback "he tosses the cubes"): no more lob.** He now picks the cube up with his hand, runs
round the nearest end of the table with it, sets it down in its slot by hand like the creatures do, and walks back to
his seat. Same API and same done() contract, so the game.js wiring below (already in game.js: `humanPlace`,
`humanGoal`, the tap-to-finish line) works unchanged.

### What he does

The table is far bigger than his arm: the middle row of zones is 9+ units from every edge except the far one (the
creature's). So:

- **The way round.** He walks on a "ring" just outside the rim (the table outline grown by the same belly clearance as
  his seat, corners rounded), so he can never walk through the table. He turns to face the way he runs, with a simple
  leg swing whose stride matches his ground speed (no sliding), a little forward lean and bob, the free arm swinging,
  the cube held low at his side (never over the table while he stands at its edge). Short shuffles (< 1.6 of his units)
  are side steps facing the table.
- **Reaching.** From the spot on the ring nearest to the cube / slot, one of three ways, whichever reaches:
  1. *standing*: a lean (up to 0.85 rad) and a small step in;
  2. *tummy on the rim*: he hops up, belly on the rim, legs hanging down the side of the table, feet off the ground,
     the other hand on the felt (used when his hips can stay outside the rim);
  3. *kneeling on the table*: further in, he climbs up onto the felt on his knees (thighs upright, shins flat behind),
     one hand on the felt, and reaches with the cube hand. Used for the middle of the table (Permitted, the middle of
     the Goal, middle Resources).
  The hand path is anchored to the table: up first, then over, down onto the cube / slot, and back up; while the cube
  is over the table its wrist target is clamped so the cube clears the felt and the rim. The cube is glued to the hand
  (`ctx.held`, exactly like creatures.js, so table.js leaves it alone), eased from where it lay into the hand at the
  grab, and eased exactly onto the slot before the release (`userData.dropped`, the same 380 ms settle as a creature's
  drop). The slot is the same `slotFor` the creatures use (table.js gridSlots / the Goal row).
- **Choosing.** A small planner tries every ring spot (every 0.6 units) for the grab and for the drop and both ways
  round, and takes the quickest: walk + grab + drop, plus 0.3 x the walk back. Penalties: kneeling straight away from
  the seat camera (from behind that reads as standing on the felt and hides the middle) — so middle slots are reached
  from the side, in profile, where he clearly kneels; deeper slides cost a little more.
- **Never through anyone.** A creature across the table: the whole far side is off limits (hard), he only goes to its
  corners. The far mate (2 Players) is the same for the kid. The other person at the table (Team-up mate, or the kid for
  the mate) is soft: no spot inside him, and the path goes round him on the outside (behind him). `T3.playerWalkSide()`
  rules out a whole side (below).
- **Timing.** done() fires the moment the cube is down; the walk back is free and calmer. A new move while he walks
  back starts from wherever he is. `opts.quick` (Goal cubes): 25% faster run, 20% quicker hands, and he waits 0.45 s
  where he put the cube before walking back, so the next Goal cube starts from there.
- **At rest** he stands completely still at his seat (checked: root, body, head, hands and legs identical over 2 s
  after a move). No loops.

Measured (1280x800, kid scale 1.6, fake clock, tap -> cube down):

| Move | How | Cube down |
|---|---|---|
| Required (left zone) | runs round the left end, tummy-grab or stand-grab, places from the left side | 1.31-1.41 s |
| Forbidden (right zone) | the same on the right | 1.31-1.55 s |
| Permitted (middle) | tummy-grab at his seat, runs to a side, kneels onto the table and places | 1.23 s |
| Goal, 3 cubes (quick) | cube 1 at 1.12 s, cube 2 at 1.57 s (same side), cube 3 at 3.74 s (it was the far-right Resource: a run round the near side) | 3.7 s |
| Team-up: Tata (left seat) to Required / Permitted | grabs and places from his own side | 0.78-0.96 s |
| Team-up: Tata to Forbidden | runs round the near side behind the kid | 2.1 s |
| 2 Players: Tata (far seat) | every Resource is on the near half, so he runs round to it and back | 1.5-3.0 s |

The whole trip (with the walk back) is 2-3 s for the kid. Speed knobs: `T3.playerMoveTuning({ v, vBack, quickV, quickT,
tGrab, tGrabF, tPlace, tPlaceF, linger })` (v / vBack in his own units per second).

`T3.playerMoveFinish()` still finishes everything at once: the cube goes straight into its slot (no flight) and done()
fires synchronously, exactly once; he then walks back from where he is (no teleport). 3D off / avatar hidden / tab
hidden / any error: done() at once. Safety timeout: max(2.5 s, planned release + 1.5 s). Hiding him, `T3.playerSet`,
`T3.mate(...)`, or the tab going hidden snaps him home.

### Walking side: `T3.playerWalkSide('auto' | 'right' | 'left')` (for the 'ai3' second creature)

Applies to both people. `'right'` = never round the left side of the table (spots and paths with x left of the table
are ruled out). Left-zone slots are then reached from the near side or the near-left corner by kneeling in; if nothing
is reachable within the normal slide it allows a longer one (he kneels further onto the table) and, as a last resort, sets
the cube down as close as he gets (it settles into the slot). Wiring in game.js `startMatch` after `setCreature...`:

```js
if (T3.playerWalkSide) T3.playerWalkSide(mode === 'ai3' ? 'right' : 'auto');   // a second creature sits at the left side
```

(Or call it from wherever `T3.setCreature2` is called / cleared.) If creatures.js ever exposes the second creature's
position, a soft or hard obstacle can be added in `obstaclesFor` (player.js) instead.

### Camera / on screen

- Wide screens (1280x800, canvas 1260x632): his head stays inside the picture for the whole trip (0 frames off), also
  in Team-up and 2 Players.
- 1024x768 (canvas 1004x578): ~5 frames (80 ms) where the centre of his head touches the bottom edge while he runs
  along the near side (his seat is sized so his head just shows; running there is the same height). Nothing at the
  sides.
- Narrower (749x570 pane): he leaves the picture at the side for about 1 s per trip (the side of the table is outside
  the view).
- Tall (400x800, 'tall' layout): the table fills the width, so he runs outside the picture along the side (~1 s each
  way) and comes into view when he climbs onto the edge to place the cube (the placing itself is visible).
- Team-up: when Tata has to cross to the right side, he passes behind the kid, i.e. between the kid and the camera,
  below the bottom edge of the picture for ~0.6 s.
- The seat, the camera fit and the head room are unchanged (section 1).

### Tata's face across the table (2 Players)

Checked from the seat camera at 1280x800, also with a zoomed render along the seat camera's line of sight: with the
head lifted by `FAR.look = -0.5` (now a named value in player.js; only applied while he stands at his far seat, not
while he walks) his face reads well: eyes, brows under the fringe, nose, stubble and the smile, looking toward the
camera, not craning. Kept as is.

### Wiring for js/game.js (round 1; already in game.js, unchanged by round 2)

Verified again in round 2 with the real `humanGoal` and the `ACT.cubeTap` skip (`G.skipCarry` + `T3.playerMoveFinish()`):
all Goal cubes land at once, `G.carrying` / `G.busy` clear, he walks home. (The timings quoted in this subsection are
round 1's lob; see the table above for the new ones.)

Next to `aiPlace` (line ~51):

```js
// Which person at the table reaches over for a human's move (3D): this device's player, or the second human (mate).
function avatarMoveFn(who) {
  if (!T3.active() || !T3.playerMove) return null;
  if (G.team && who === 0) return G.team.cur === 0 ? T3.playerMove : T3.mateMove;   // Team-up: whoever's go it is
  if (who === 0) return T3.playerMove;
  if (who === 1 && !isAI(1) && (G.mode === 'pvp' || G.mode === 'p3' || G.mode === 'online')) return T3.mateMove;
  return null;                                                                        // e.g. Mama in p3: no avatar
}
// A human's move: the kid (or the mate) picks the cube up and lobs it into the zone, like aiPlace for creatures.
function humanPlace(id, zone, who) {
  var fn = avatarMoveFn(who);
  if (!fn) { placeCube(id, zone, who); return; }
  var sit = G.cubes; G.busy = true; G.carrying = true; renderGame();
  fn(id, zone, function () { if (!G || G.cubes !== sit) return; G.busy = false; G.carrying = false; placeCube(id, zone, who); });
}
```

`doMove` (line ~249): add a `dragged` argument and use `humanPlace` for taps (a cube the player dragged is already
where his hand put it, so it is placed directly):

```js
function doMove(id, zone, dragged) {
  ...unchanged checks...
  G.selected = null;
  if (dragged) placeCube(id, zone, G.turn); else humanPlace(id, zone, G.turn);
}
```

js/main.js: the 3D drop handler (`drop: function (id, z) { ... doMove(id, z); }`) -> `doMove(id, z, true)`; the flat-mat
drag (`doMove(d.id, z.dataset.zone)` in the pointerup listener) -> `doMove(d.id, z.dataset.zone, true)`.
`Team.sync()` in placeCube flips `G.team.cur` after the move, so `avatarMoveFn` reads the right teammate before it.

**A tap during the reach finishes it at once.** At the top of `ACT.cubeTap` (game.js) and of `T3.handlers.cubeTap`,
`canDrag` and `zoneTap` (main.js):

```js
if (G && G.carrying && T3.playerMoveFinish) T3.playerMoveFinish();   // the kid's lob lands now (done() runs here)
```

(It only ends the kid's / mate's move, never a creature's; done() runs synchronously, so the rest of the handler sees
the new turn.) Tested in the browser with exactly this code patched in: tap -> busy/carrying for 620 ms -> placeCube,
cube exactly on its slot, the creature then played on.

**Goal cubes (optional; I did not wire it).** Sequential `playerMove` calls work like `aiSetGoal`; with `quick` each cube
takes ~0.5 s (a 3-cube Goal about 1.6 s). If you want it, in `ACT.buildGoal` replace `setGoal(tokens, val)` with
`humanGoal(tokens, val)`:

```js
function humanGoal(tokens, val) {
  var fn = avatarMoveFn(G.setter); if (!fn) { setGoal(tokens, val); return; }
  var sit = G.cubes, k = 0; G.busy = true; G.carrying = true; renderGame();
  (function next() {
    if (!G || G.cubes !== sit) return;
    while (k < tokens.length && typeof tokens[k] !== 'object') k++;                 // parentheses: nothing to carry
    if (k >= tokens.length || G.skipCarry) { G.skipCarry = false; G.carrying = false; setGoal(tokens, val); return; }
    var tk = tokens[k];
    fn(tk.id, 'goal', function () { if (!G || G.cubes !== sit) return; G.cubes[tk.id].zone = 'goal'; G.goalTokens = tokens.slice(0, k + 1); k++; renderGame(); setTimeout(next, 60); }, { quick: true });
  })();
}
```

and in the tap-to-finish line also set `G.skipCarry = true` so a tap puts the rest of the Goal down at once.
The `reach` mood (`T3.playerMood('reach', ...)`) is no longer needed after a move.

Online: remote moves arrive through online.js; if they go through `placeCube` directly there is no avatar move. To show
the far person moving, call `humanPlace(id, zone, 1)` there instead (mode 'online' maps player 1 to `mateMove`).

## 3. Face and hair (kid.js, grownup.js)

Kid (default style `swept`, still a friendly cartoon): soft oval head (a touch taller than wide), full round cheeks, a
small chin, a rounder back of the head; thick, full dark-brown hair in a longish cut with strand locks that fan out from
a crown whorl at the back of the top (what the seat camera sees), uneven ends round the sides and back, the sides over
the top half of the ears, and the fringe sweeping diagonally from his left to his right, ending just above the brows
(lowest over his right brow); smaller dark-brown almond eyes with a lower lid that rises with his grin (a happy squint
even at rest; it opens for the "o" / "hmm" / wide-eyed faces); thin dark brows; a small button nose; a very wide open
grin with the upper teeth and the two front teeth a little bigger; lighter warm skin; rosy cheeks.

Tata (`tousled`): curtain hair parted a little off the middle, falling to both sides down to the brows, wavy strands,
eight lighter brown streaks; almond eyes that crinkle a little; light stubble plus a faint moustache; a gentle
closed-mouth smile; a yellow V-neck (drawn into the shirt texture, trim colour edging).

The kit designer's hair colour and the other styles (short, spiky, curly, long) work as before; brows follow the hair
colour (a little darker). Hair now has per-vertex shading (its own material; the spikes/streaks keep the plain one).
Saved kits keep their hair colour.

## Verified / not verified

**Round 2** (browser pane, port 3491, frames driven by a fake clock + a timer requestAnimationFrame shim, measured
per frame: done() time and count, the cube's lowest height while held over the table, whether his body ever enters
the table outline below rim height, distance to the creature / the other person, his head on / off screen):
moves to Required, Permitted, Forbidden from his seat (ai mode) at 1280x800, 1024x768 and 400x800 (tall); the Goal
sequence through the real `humanGoal` (3 cubes) and the real tap-to-skip; back-to-back moves (the second starting
while he walks back); `T3.playerMoveFinish()` before the grab, while carrying, and twice (done() once); a hidden
avatar (done() at once, once); stillness at rest after moves; Team-up with Tata at the left seat (kid and Tata to each
zone; the kid never enters Tata's space, Tata passes behind the kid); 2 Players (Tata from the far seat to each zone,
the kid's moves with the far side ruled out); Tata's far-seat face. The cube always ends exactly on the slot table.js
syncs it to, never dips below the felt while held (lowest 0.5 = resting height), no console errors.
Screenshots looked at: running up the side, tummy on the rim, kneeling on the table in profile, placing.

`T3.playerWalkSide('right')` tested without a real second creature: he never goes left of the table (lowest x of his
body -3.5), Required moves are done in 0.8-0.93 s by kneeling in from the near side / the middle of the table, cube
exact, done() once. Judgment: that kneel is seen more from behind, so he looks more "on" the table than in profile;
fine as the 'ai3' fallback, but if it bothers the owner, let creature 2 leave him the near-left corner and add its
position as an obstacle instead of ruling out the whole side.

Not verified (round 2): with a real second creature (another helper's code); 2000x1000; real devices / 60 fps feel;
orbiting while he walks (positions are in world space, so the orbit can't disturb him, but not looked at); online.

Round 1:

Verified in the desktop browser pane (port 3481, frames driven by a fake clock for the step-through): the seat at
1280x800, 2000x1000, 1024x768 and 400x800 (and Tata as the main player); side views (feet on the pitch, leaning over the
rim); a near reach, a far-corner reach with a side step, a hop, a "send" (tall table and the far mate), the Team-up mate
(Tata at the left) moving a cube; done() timing (600-620 ms), instant finish, a hidden avatar (done at once, once),
double finish (done once), the safety timeout; stillness at rest after a move; the wiring above patched into the live
game. Faces checked close up from the front, 3/4 and behind, via `T3.playerPortrait` and an in-scene close-up.

Not verified: real touch devices / iPad, 60 fps feel (frames were driven manually or by a timer shim), the Goal wiring
(not written into game.js), online. The likeness is a judgment call: please look at him from the front with the orbit.
