# Handoff from `edges`: six rough edges (pour, zoom, reroll tumble, bubbles, idle rendering, tablets)

Files changed: `js/three/table.js`, `js/three/orbit.js`, `js/three/quality.js`, `js/three/crowd.js`, `js/social.js`,
`css/orbit.css`, `docs/handoff/orbit.md` (updated), this note. No other file was touched.
`node tests/engine.test.js`: 379 passed.

## 1. Cubes beside the table at the first roll (verified, finished)

**Cause confirmed.** With the old wall-clock cup (`t = (now - pour.t0) / 1000`) and no spawn clamp, I blocked the main
thread right after `T3.pour` started: 24 of 24 cubes ended outside the table (x up to 28.8; the table is 18 wide), and
23 of 24 for a stall at 300 ms. That is the "all over the right-hand side" picture.

**With the clamped clock (`pour.clock`) and the spawn clamp:** 0 cubes outside in every run: wide layout with stalls of
1.5 to 3 s at 0, 30, 100, 200, 500, 600, 800, 1000, 1100, 1300, 1600, 1700 and 2200 ms into the pour, plus runs without a
stall; tall layout with stalls at 0, 400, 900 and 1400 ms plus runs without one. I read every cube's body position at
`finishPour` (`T3._lastPour.raw`, kept for checks).

Also fixed:
- **Layout change during a pour** (a resize that switches wide to tall while the cubes are in the air): the physics walls
  stayed those of the old layout, so cubes could end up beside the new, narrower table. Now the walls are rebuilt and every
  body is put back inside (`setWalls(world, true)` from `buildTable`). Tested: wide to tall 1.6 s into a pour, all 24 inside.
- **Cubes left leaning on, or lying on top of, another cube**: 2 to 5 per pour before. When everything has settled, those
  get a small nudge (a hop and a little spin) so they tip over flat, at most twice (adds about 0.3 to 1 s when needed).
  After that it was 0 or 1 per pour (a leaner left over keeps its most upright face as the result and is laid flat by the
  slot tween a moment later).
- **Safety net in `finishPour`**: any cube outside the felt (or under it, or stuck high up) is put back flat inside the rim
  showing the face that was most nearly up, before the result is read (`settleInside`). It never had to act in the runs
  above with the new clock; it does act on the old-clock runs (all 24 put back).

## 2. Closer zoom, aimed (done)

See the updated table in docs/handoff/orbit.md. In short: the wheel / trackpad pinch zooms **toward the point under the
mouse**, a two-finger pinch toward the point between the fingers, right-drag / middle-drag / shift-drag slides the view.
The camera can get to 2.2 units from what it looks at (the crowd's faces, hats and shirt numbers fill the picture), the
lowest view eases from 18 to 4 degrees once you are off the table, and a ray test keeps the camera out of the stands, the
table, the creature, the kid and the floor. "Back to my seat" brings swing, zoom and pan home and lands exactly on the
seat (checked: distance 0.0000). Nothing moves by itself.

Checked with synthetic mouse, wheel and two-finger pointer events in the stadium: zooming at the back stands, both side
stands (after swinging), the creature and the table, then lowering the view as far as allowed and panning around: the
camera was never inside a stand (checked against the stand profile: rows of 1.15 by 0.6), never below the floor, never
closer than 3.9 to the creature's head. A 60-step random mix of wheel / drag / right-drag: no violations. Cost: about
0.1 ms per drag move, 0.3 ms per wheel notch (one ray each).

## 3. Reroll tumble: `T3.reroll(list, done)` (done; game.js snippet below)

`list = [{ id, s }]`. Those cubes hop straight up from where they lie (about 1 unit), spin hard, land back on their own
spot and come to rest showing `s`, with `Snd.clatter()` at the toss and `Snd.diceHit` on each landing. How: the hop is
simulated with the dice physics in full first (other visible cubes are solid and never move), then relabelled: a cube
looks the same from every side, so turning every frame by one fixed cube symmetry (`R = FACEQ[k]^-1 * FACEQ[s]`) gives an
equally real tumble that ends on `s`. It plays back on a clock that cannot jump.

- `done()` fires exactly once: at once when 3D is off or hidden, the game screen is not showing, a pour is running, or no
  listed cube is visible; otherwise when the cubes are down (about 1.0 to 1.2 s); a 2.5 s safety timeout lands them and
  calls it; a new pour lands them at once (and calls it).
- Never leaves a cube outside the table (`settleInside` at the end). Other cubes are not touched (checked: max movement 0).
- While a cube is tumbling, `T3.sync` leaves it alone and it cannot be picked; afterwards the game's `renderGame()` slides
  it into its slot with the symbol upright. `T3.rerolling()` tells whether one is in the air.
- Checked: 5 cubes, every one landed showing the asked face, done once at 1.2 to 1.5 s (first tuning; now capped at 1.2 s).
  The snippet below, run in the page as a stand-in for `rerollOps`, rolled 4 unwanted operation cubes in one 1.2 s
  tumble and finished with "There! Now every cube is one we can use."

### js/game.js: replace `rerollOps` with

```js
function rerollOps(done) {
  var g0 = G, c0 = G.cubes, rounds = 0;
  function okSym(s) { return Eq.isDigit(s) || G.ops.indexOf(s) >= 0; }
  function bad() { return G.cubes.filter(function (c) { return !okSym(c.s); }); }
  var b = bad(); if (!b.length) { done(); return; }
  var names = { '^': 'powers', 'r': 'roots', '*': 'times', '/': 'dividing' }, miss = [];
  ['*', '/', '^', 'r'].forEach(function (s) { if (b.some(function (c) { return c.s === s; })) miss.push(names[s]); });
  var list = miss.length > 1 ? miss.slice(0, -1).join(', ') + ' or ' + miss[miss.length - 1] : miss[0];
  say('pip', 'We aren\'t playing with <b>' + list + '</b> yet, so let me roll ' + (b.length > 1 ? 'these ' + b.length + ' cubes' : 'this cube') + ' again to get something we can use!', 'think');
  renderGame();
  function step() {
    if (!G || G !== g0 || G.cubes !== c0) return;
    var now = bad();
    if (!now.length) { say('pip', 'There! Now every cube is one we can use.', 'happy'); renderGame(); setTimeout(function () { if (G && G === g0 && G.cubes === c0) done(); }, 500); return; }
    rounds++;
    var roll = now.map(function (c) { var f = Eq.CUBE_FACES[c.color]; if (rounds > 6) f = f.filter(okSym); c.s = f[Math.floor(Math.random() * f.length)]; return { id: c.id, s: c.s }; });
    var next = function () { if (!G || G !== g0 || G.cubes !== c0) return; renderGame(); setTimeout(step, 350); };
    if (T3.active() && T3.reroll) T3.reroll(roll, next);   // they hop up, tumble and land showing the new face (about 1 s, with the clatter)
    else { Snd.clatter(); renderGame(); setTimeout(step, 700); }   // flat table: as before
  }
  setTimeout(step, 1500);
}
```

(`c.s` is set before the tumble, so anything that re-renders meanwhile already has the new symbol; `T3.reroll` plays the
clatter itself. The stand-in `T3` in config.js has no `reroll`, so the flat path is unchanged.)

## 4. Speech bubbles follow the speaker (done)

Before: `Social.bubble` put the creature's bubble at a fixed spot (top centre, 20% down) and the kid's at the bottom
centre, measured once. Now, in 3D, `place()` runs after every drawn frame while the bubble is up (`T3.onView`), projects
the speaker's head (`T3.project`) and puts the creature's bubble just under its head (tail up at it) and the kid's just
over his head (tail down). The gap is in world units, so from the seat it lands where it used to (creature: head at y=143,
bubble top 210 = the old spot). It stays inside the picture. When the head is off the picture or behind the camera, the
bubble goes back to its usual spot without a tail (`.sbub.notail`, in css/orbit.css). When there is nobody to point at
(no kid shown), it is exactly the old bubble. The flat (non-3D) mode shows no bubbles at all, as before (unchanged).
Emote bubbles go through the same `bubble()`, so they follow too.

Checked: swinging the view moves the bubble with the head; zooming at the side stands (head behind the camera) drops the
tail; during a `T3.shot('win')` close-up the creature's bubble follows the head down the picture and the kid's loses its
tail (he is out of the frame).

**Anchors and the second creature.** The anchor is taken when the bubble is created: `T3.anchor('opp')` holds on to the
creature in use at that moment (through `T3._creatureActor()`), so if `T3.creatureUse(index)` switches creatures while the
bubble is up, it keeps pointing at the one who spoke. To point a bubble somewhere else:
- at creation: `Social.bubble('opp', text, { anchor: function () { return someWorldVector3; } })`
- while it shows: `Social.anchor('opp', T3.anchor('opp'))` (re-takes the creature in use now), or any function returning a
  world point (or null when that someone is not at the table).

Note for the creatures helper: `T3.anchor('opp')` needs `T3._creatureActor()` to return the creature in use (it does
today); if that changes, a `T3.creatureHead(index) -> Vector3` would be the cleaner hook, and `T3.anchor` can use it.

New `T3` calls (table.js): `T3.project(v) -> { x, y, visible, behind, ppu, rect }` (client pixels, as drawn; `ppu` is
pixels per world unit at that depth), `T3.onView(fn) -> off()` (fn(cameraMoved) after every drawn frame),
`T3.anchor('opp' | 'kid') -> fn() -> Vector3 | null`.

## 5. Idle rendering (found and fixed)

**What kept it dirty:** the creature. `creatures.js` `update()` ends with an unconditional `ctx.dirty()`, and at rest it
still runs every ~32 ms for the breathing and blinks (its own comment: "idle (breathing/blinking only): ~30 fps is
plenty"). Measured while waiting for the Goal: every dirty frame came from the per-frame hooks, all from
`creatures.js:588`; nothing in table.js, the crowd or the kid. So the table drew ~30-40 times a second forever.

**Fix (table.js only):** when a frame's only reason to draw is a per-frame hook and nobody is doing anything (no creature
gesture, reach, talk or step; no kid gesture or carry; and of course no cube, camera, effect or crowd movement, which mark
the table dirty themselves), that redraw is "ambient" and drawn at most 12 times a second. Anything else draws every
frame, as before. Measured in the pane (whose frame loop tops out near 48 fps): waiting for the Goal 11.3 draws/s
(was ~40); during a creature mood 48.7, while it talks 48.5, crowd cheer 47.7, kid wave 48.1. Breathing and blinks still
show (a blink lasts ~0.23 s, so 2-3 frames).

How "nobody is doing anything" is known today: `T3.creatureStage()`, `T3.creatureStats()` (gesture, pose, step offsets),
`T3.playerMoving()`, `T3.playerState()` moods, and `T3.creatureTalk` (wrapped once, lazily, to remember how long the
mouth moves). That is a bridge; the clean version is one line in creatures.js (not my file):

### js/three/creatures.js (optional, for the creatures helper): end of `update(now)`

```js
    ctx.dirty();
```
becomes
```js
    if (busy || moving || !ctx.ambient) ctx.dirty(); else ctx.ambient();   // at rest (breathing, blinks): a low-rate redraw
```

`ctx.ambient()` (new in table.js) asks for a redraw that is drawn at most 12 times a second. The same could go in
player.js `step()` for a blink with nothing else moving. If the owner would rather have a completely still picture at
rest, the creature would need to stop breathing when idle (the style rule says it breathes), so I left that alone.

## 6. Lighter crowd on tablets (done)

**The rule (auto mode, js/three/quality.js):**
1. Start: the level measured on this device before (kept 4 days) if there is one; otherwise **medium on a touch device**
   (coarse pointer, an Android/iPhone user agent, or an iPad that reports itself as a Mac with touch points) and high
   elsewhere. A laptop that merely has a touch screen (fine pointer) still starts on high.
2. Step-down: consecutive rendered animation frames are timed; after a settle of 8 frames, each window of 30 gaps
   decides: more than 55% slower than 25 ms: one level down; more than 85% slower than 45 ms: two levels down. About a
   second of animation (was 52 frames and one level at a time). Never steps up by itself.
3. Throttling cannot stick: a window is thrown away whenever the tab is hidden or shown (visibilitychange), gaps over
   150 ms and watchdog frames never count, and a step-down is only remembered on the device when the window was measured
   with the tab visible and focused the whole time (otherwise it applies to this session only, logged "(not remembered)").
   I hit exactly the old problem while testing: a low level measured in the background pane had been stored and came
   back as "remembered" on the next load.
4. The venue (crowd figures, shadows) is built for the level in use. When the level changes after the venue was built,
   the venue is rebuilt at the start of the next pour (a hitch there does not show: the pour runs on its own clock).

**Medium figure tier made lighter (crowd.js):** besides no shins/shoes, cuffs or thumbs, medium now seats a sixth fewer
people (a few empty seats). Stadium, wide: high 1185 people / 493k triangles; medium was 1185 / 408k, now 988 /
342k; low 790 / 168k. Stadium, tall (phone/tablet portrait): high 922 / 385k, medium 769 / 266k. Still 18 draw calls
(one per part type, instanced). Checked with the pane's mobile emulation (coarse pointer, Android UA): starts on medium,
"start (touch device)". Forcing low mid-match rebuilt the crowd (769 to 615 people) at the next pour.

## Not verified

- No real iPad or touch screen: two-finger pinch toward a point and pan were tested with synthetic pointer events only;
  iPad detection (`MacIntel` + touch points) by reading the code, not on a device. Frame rates on a tablet unknown.
- The pane's tab was in the background (rAF shimmed to a 16 ms timer), so "smoothness" of the tumble, the ease home and
  the 12 fps idle breathing was judged from numbers and a few screenshots, not by watching at 60 fps.
- Venues other than the stadium: the zoom limits come from each venue's own meshes and the ray test, so they should hold,
  but I only stress-tested the stadium (beach / volcano / plain rooms not surveyed up close).
- Real "stadium compiling" first frame: reproduced with an artificial busy-wait, not with a cold shader cache on a slow GPU.
