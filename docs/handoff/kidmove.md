# Handoff: the kid's seat, his own cube moves, a new face (agent `kidmove`)

Files changed (mine): `js/three/player.js`, `js/three/creatures/kid.js`, `js/three/creatures/grownup.js`,
`js/three/table.js` (camera fit + one tween option only; orbit untouched), this note. Nothing else.
`node tests/engine.test.js`: 379 passed.

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

## 2. Grab and place: `T3.playerMove(id, zone, done, opts?)` / `T3.mateMove(...)`

Same contract as `T3.creatureMove`: done() exactly once; at once if 3D is off (`T3.active()` false; the no-WebGL stub
also calls it at once), he is hidden / not on screen, the tab is hidden, another cube is in a hand, or anything throws;
a 2.5 s safety timeout; the tab going hidden mid-move finishes it.

What he does (0.6 s to done(), ~0.8 s for the arm, the cube lands ~1.0 s after the tap):
- 0-0.26 s reach: leans over the table (at most 0.62 rad) and, for a cube off to one side, a side step along the near
  edge (one small bob, no loop); arm stretch capped at 1.2x (creatures 1.25x);
- 0.34 s grab (hand closes, pickup sound), 0.34-0.47 s a small lift;
- 0.47-0.6 s an underarm lob toward the zone: **done() fires at the release**, the cube flies on its own to its slot
  (table.js `userData.toss` -> an even-paced parabola, 300-560 ms) and lands with the usual thunk / puff;
- then he eases back to rest and is completely still (checked: root, body, head and both hands identical over 3 s).

Why a lob: the zones are 8+ units beyond the near rim; no lean or step reaches them without climbing on the table.
If a slot is ever within easy reach he sets the cube down in it instead (`dropped`). If the cube itself is out of reach
by < 3 units (back row corners) it hops up into his open hand; by more (the mate across the table picking up a Resource,
the far end of a tall table) he reaches toward it with an open hand and it lobs straight from where it lies to its slot
(done() at ~0.32 s). `opts.quick`: 20% faster. `T3.playerMoveFinish()` finishes any move now (cube lobs to its slot,
done() fires synchronously). `T3.playerMoving()` is true until the release.

### Wiring for js/game.js (you own it)

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

Verified in the desktop browser pane (port 3481, frames driven by a fake clock for the step-through): the seat at
1280x800, 2000x1000, 1024x768 and 400x800 (and Tata as the main player); side views (feet on the pitch, leaning over the
rim); a near reach, a far-corner reach with a side step, a hop, a "send" (tall table and the far mate), the Team-up mate
(Tata at the left) moving a cube; done() timing (600-620 ms), instant finish, a hidden avatar (done at once, once),
double finish (done once), the safety timeout; stillness at rest after a move; the wiring above patched into the live
game. Faces checked close up from the front, 3/4 and behind, via `T3.playerPortrait` and an in-scene close-up.

Not verified: real touch devices / iPad, 60 fps feel (frames were driven manually or by a timer shim), the Goal wiring
(not written into game.js), online. The likeness is a judgment call: please look at him from the front with the orbit.
