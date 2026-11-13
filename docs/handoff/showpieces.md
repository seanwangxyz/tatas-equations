# Handoff: the showpieces (title, Goal replay, fireworks, trophy room)

Owner's rules followed: every showpiece plays ONCE and settles into a still picture; any tap skips; nothing strobes;
Reduce flashing (`A11y.calm()`) or prefers-reduced-motion get a still or a gentle cut (the title keeps its old rule:
`S.set.titleFx === true` overrides the OS reduced-motion setting, but `A11y.calm()` now makes it still); original
designs only; quality levels respected. All public APIs unchanged (`Replay.play / popupHTML / pick / active`,
`Fireworks.show`, `T3.replay`, `T3.fireworks`, `Cabinet.*`, `buildTrophy`, `Title3D.*`). No hooks are needed in
files I don't own: everything shows through the existing calls.

## Files

| File | Change |
|---|---|
| `js/three/replay.js` | Rewritten: the replay now WORKS OUT the Solution in the order of operations (below) |
| `js/replay.js` | Glue: passes `goalV`, safety timeout follows the replay's own length (`h.duration` + 1.2 s, max 9 s); new `Album` (his best Solutions, own localStorage key `tataEq.album`) |
| `js/three/fireworks.js` | Rewritten: composed show with 5 shell types, his number in sparks for big wins, a daytime confetti/streamer show |
| `js/three/cabinet.js` | One-shot glide in, tap = bring forward + turn once + back, engraved plates, league shields, two framed photos, brass lamps |
| `js/cabinet.js` | Items: cup dates/hints, `shield-<league>` items, `photo-best` / `photo-team` items (not counted in the "won / total" score) |
| `js/three/title.js` | Rest is now a STILL picture (no drift, blinks or one-offs: the loop stops), knitted scarf in his kit colours unrolls once under the cube wordmark, splash push-in 14 s -> 6 s, `A11y.calm()` -> still, no crash when the scene is freed while shaders compile |
| `css/title.css` | Only the 3D layer's overlay (`#t3title::after`): a soft shade behind the menu panel (right side when wide, bottom in portrait) so the floodlights never sit bright behind menu text. The menu itself is untouched |

## 1. The title (js/three/title.js)

Beat by beat (first title of a session, about 5.8 s, unchanged timing): lights come up, camera glides in, the cubes are
kicked up and tumble down into TATA'S / EQUATIONS; at 2.8 s the scarf unrolls from the middle outward (0.9 s) as the glint
sweeps the cubes; the kid runs in, turns, fist up at 4.0 s (crowd, flashbulbs, confetti), Pip and two creatures hop in;
hands on hips; then **a still hero picture**: confetti that has landed stays where it fell and the loop stops (renders at
rest: 0 once the confetti is down). Later visits: 1.5 s (cube ripple, scarf unroll 0.6 s). The scarf is a knitted
football scarf (his shirt colour and trim, white bands, a row of little game cubes, "TATA'S EQUATIONS" in the logo font,
fringe), gently sagging across the stage front: the wordmark = cube letters + scarf ribbon. `Title3D._restLife = true`
brings the old rest blinks/one-offs back if the owner ever wants them. New test hook: `Title3D._scene()`.
Not done: a separate On-Sets "poster" (the title is not shown while the On-Sets menu is open).

## 2. The Goal replay (js/three/replay.js), 4.5 to 7.3 s

1. **Assemble** (about 1.8 s): a gold slanted "REPLAY" tag with a round arrow slides in over a dark band; the winning
   cubes lift off the table one by one and fly into a row in reading order with a slow-motion ease (long soft start and
   landing), brackets pop in, one swish, a soft thunk per cube.
2. **Work it out**: `Explain.steps(tokens, {goal, fractions, wild})` gives the order (brackets first, then the strong
   steps, then left to right). For each step the cubes involved glow and rise a little, glide together and shrink into
   a gold result tile (soft flash, `Snd.pop`), and the rest of the row closes up. The reason shows under the row in a few
   words: "Brackets first", "× and ÷ before + and −", "Left to right", "Last step". 0.36 to 0.78 s per step (3 s at most).
3. **Goal**: the last tile grows a little, the Solution as text over it, "= 37   GOAL!" in gold under it, ONE burst of 36
   sparks, `crowdReact('cheer')`, `Snd.chime`, `T3.fx('flash')`, the board shows the Solution (as before).
4. **Back**: tiles and labels fade, the cube copies come out at their row places and fly home onto the real cubes,
   shrinking and fading. Everything is removed; the hook count and camera children return to what they were.
- Fallback (no `window.Explain`, an `error`/fallback result, any mismatch): the old left-to-right running value, then
  Goal and the fly-home. Multiple-of-k (value ≠ Goal): the label says "GOAL!" without a wrong "=".
- Calm / reduced motion: the finished row and "= 37 GOAL!" fade in, stay 2.4 s, fade out. No flight, no flash, no burst.
- Skip: unchanged (the tap layer from js/replay.js); the module's own safety = its length + 1.5 s.

## 3. Fireworks (js/three/fireworks.js)

Night (fog/background dark): a composed show: one peony alone, then pairs with a breath between (ring, willow, cube,
peony...), and the finale. Big wins (`rockets >= 7`, which the existing endMatch call already passes, or `opts.big`):
two willows frame it, then **his shirt number (`S.jersey`) drawn in golden sparks** that holds for a moment and falls.
Otherwise the finale is the cube burst (sparks that open into the 12 edges of a game cube). Shell types: peony, willow
(gold, long drooping trails), ring (tilted circle), cube, number. About 6.5 to 8.3 s, then gone. The stands are tinted
by each burst a little less than before (max 45 %). One Points object (1,700 points for the big show on medium).
Day (fog/background bright): confetti cannons at both sides of the picture, over the far half of the table, 4 volleys
(left, right, both), confetti with every sixth piece a long streamer, fluttering down and shrinking away before landing
(no clean-up jump). One InstancedMesh, 440 pieces on medium. About 6 s. `opts.day` forces either.
Calm / reduced motion: 3 gentle shells (no white-hot start, no sparkle, softer light) or one small confetti volley.

## 4. The trophy room (js/three/cabinet.js + js/cabinet.js)

- Opens with a ONE-shot camera glide from the doorway (further back, a little higher, turned toward the badge wall) to the
  seat, 2.6 s; its clock starts after the first picture (shader compile) and pauses on long frame gaps, so it never jumps;
  a touch ends it. Calm: a still cut. Then nothing moves (draws at rest: 0).
- Tap an item: it comes forward to just in front of the camera (sized to about 40 % of the picture), turns once slowly,
  and goes back to its place (0.6 + 2.4 + 0.7 s); the story card as before.
- Cups stand on engraved brass plates: name + "Won 2026-10-31" (first win date from `S.cups.list`), or for an empty
  outline a dark plate with a kind hint ("Win 3 in a row"); the tap story has the full how-to.
- League shields (one per league, won by finishing 1st in a season: `Season.pennants()` place 1) on wooden mounts beside
  the cabinet, "x2" when won more than once; empty mounts say "Finish 1st".
- Two framed photos with brass picture lights: "My best Solutions" (longest, biggest Goal, cleverest: drawn as coloured
  cubes with "= Goal" and the date, from `Album`, recorded by `Replay.play` for his own correct Solutions) and a "Team
  photo": him in his shirt and number with the creatures he has beaten (portraits from `T3.portrait` when the 3D table is
  on, emoji otherwise).
- Brass lamps on the cabinet top (objects only; no extra lights, so no extra shader cost).

## Sounds wanted (for the sound owner; nothing in js/sound.js was changed)

- Replay merge: a soft "tink-whoomp" (two notes, rising) per merged step instead of `Snd.pop` (call it `Snd.merge()`; I'd
  call it if present). A "slow-motion" whoosh under the assemble (pitched down, 1.5 s).
- Fireworks: a long crackle tail for the willow; a soft "fizz" when the number appears (`FxSfx.fizz({delay})`).
- Day show: a cardboard confetti-cannon "pomf" (today a small `FxSfx.boom` + `swish`).
- Trophy room: a felt-soft "lift" when an item comes forward and a little settle "clink" when it lands back.

## Measured (headless Chrome 1280x800, SwiftShader, quality "medium"; numbers, not fps)

| | before | after |
|---|---|---|
| Title at rest: draw calls / triangles | 341 / 385,288 | 343 / 385,480 (the scarf) |
| Title renders in 6 s at rest (after the opening) | 8 (blinks / one-offs) | 0 (still) |
| Trophy room: draw calls / triangles | 793 / 57,830 | 814 / 59,331 (shields, photos, lamps) |
| Trophy room draws in 3 s at rest | 1 | 0 |

Leak runs (renderer.info, geometries/textures/programs; the table's shared renderer):
- 5 title visits (show, skip, leave to a match): 260g each visit while the scene is up; after leaving 3g/13t/5p (all freed).
- 5 Goal replays in one match, each run to its end (5.9 s): 174g/66t -> 175g/68t after the first two (the cached spark
  dot and label textures), then flat; `done` called once each; frame hooks 5 -> 5; camera children back to 1.
- 3 fireworks shows (night, day, night big): 175g/68t -> 69t (the cached dot texture), then flat; hooks back to 5.
- Trophy room: glide then 0 draws at rest; disposed with its own renderer as before.
- Tests: `node tests/engine.test.js` 948 passed, `node tests/explain.test.js` 4558 passed.

## Not verified

- A real iPad / Safari, touch, and how anything sounds (nothing was heard).
- The replay with variation cards (turned cubes, labels): the code keeps the old label handling, but I only checked
  plain Solutions; Explain steps with `read` kinds (turned cube meanings) are animated like any step.
- The On-Sets poster (not done).
