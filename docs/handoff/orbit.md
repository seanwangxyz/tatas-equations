# Handoff from `orbit` (look around the table, take a photo)

Files changed: `js/three/table.js`, new `js/three/orbit.js`, new `css/orbit.css`, this note. `js/three/shots.js` is
unchanged (the close-up rule lives in table.js). No other file was touched.

`table.js` also carries the lead's uncommitted `fitCamera` change (`hooks.shrink`, `gather(s)`, the shrink loop and the
`api._fit` debug line) copied verbatim from the main checkout, so that merge is a no-op there.

## What the player can do

| Input | Effect |
|---|---|
| Mouse (or pen): drag on anything that is not a cube | swings the camera around the table. A press without moving is still a tap (zone taps work as before). |
| Mouse wheel / trackpad pinch over the 3D picture | zoom (the page never scrolls or zooms from over the picture) |
| Touch: one finger | exactly as before (tap / drag cubes). One finger never moves the view. |
| Touch: two fingers | drag = swing, pinch = zoom. A second finger landing during a cube drag puts that cube back (`handlers.drop(id, null)`); no tap fires at the end of a two-finger gesture. |
| "Back to my seat" button (bottom-right of the picture, only while away) | eases home in 0.5 s (smootherstep) |
| Camera button (bottom-right, always there in a 3D match) | saves `tatas-equations-photo.png` |

Limits: yaw +-150 deg; elevation 18-84 deg (30 deg from behind, where the creature stands); zoom 0.7x-1.35x of the
seat distance, and never further out sideways than the seat, except toward the front (the stadium stands start just past
the seat distance at the sides and back). Nothing moves by itself: the view only changes while being dragged, or
during the 0.5 s ease home.

Automatic reset (eased): `T3.cue('reset')` (newShake already calls it) and `T3.pour()`. Orbiting is refused during the pour
and during a close-up (a tap during a close-up still just skips it).

**Cues and close-ups (the rule I picked):** while the view is away from the seat (or being dragged), `T3.cue('challenge'|'win'|'lose')`
does nothing and `T3.shot(...)` returns `false` (so `if (!shot('win')) cue('win')` does nothing either). The player chose
that view; nothing yanks it away. Back at the seat, cues and close-ups work exactly as before. The orbit is applied in
`applyCam` on top of seat + cue offsets, before the close-up blend, so refits (resize, creature change) keep the offset.

## New T3 API (only when 3D is supported: guard with `T3.orbit &&` / `T3.photo &&`; the stand-in in config.js has neither)

| Call | What it does |
|---|---|
| `T3.orbit.active()` | `true` while the view is away from the seat or being dragged (also during the ease home) |
| `T3.orbit.reset()` | eases back to the seat (0.5 s) |
| `T3.orbit.enabled(bool)` | allow / forbid looking around at runtime (forbidding eases back). `T3.orbit.enabled()` reads it (also `false` when `S.set.orbit === false`). |
| `T3.photo()` | renders one frame (through postfx when glow is on), copies the canvas in the same tick, adds the caption strip, saves it. Returns `'download'`, `'share'` (iPad share sheet), `'view'` (iPad fallback pop-over: "Press and hold the picture to save it") or `''` (no 3D picture). Plays `Snd.click()` twice (85 ms apart) as a soft shutter and flashes the picture white once (0.45 s). |
| `T3.ctx.camBase` | the fitted seat `{pos, look}` (player.js already looks for this to place the kid from the seat view instead of the current camera) |

Setting: `S.set.orbit !== false` means on. No default needed in `S.set`.

## Snippets for the lead

### index.html (after `<link rel="stylesheet" href="css/team.css">`)

```html
<link rel="stylesheet" href="css/orbit.css">
```

No script tag: `orbit.js` is imported by `table.js`.

### js/screens.js: Settings row (right after the `'<div class="setrow"><label>3D table and dice</label>' ...` row)

```js
    (T3.supported ? '<div class="setrow"><label>Look around the table<br><small style="font-weight:600">Drag the background with the mouse, or two fingers on a tablet. Pinch or scroll to zoom.</small></label><button class="btn small ' + (S.set.orbit !== false ? 'green' : '') + '" data-act="toggleSet" data-arg="orbit" data-def="1">' + (S.set.orbit !== false ? '✔ On' : 'Off') + '</button></div>' : '') +
```

It reuses the existing `ACT.toggleSet`. If it is switched off while the view is away, the next shake brings it back to
the seat anyway; to do it at once, add `if (k === 'orbit' && T3.orbit && S.set.orbit === false) T3.orbit.reset();` in
`ACT.toggleSet` after `S.set[k] = !on;`.

### A hint line for Pip (suggestion: once, the first 3D match)

In `startMatch`'s `begin` function in `js/game.js`, after `newShake();`:

```js
if (T3.active() && T3.orbit && T3.orbit.enabled() && !S.seenOrbitTip) { S.seenOrbitTip = true; persist(); setTimeout(function () { if (G && G.phase !== 'roll') say('pip', 'Psst! Drag the background (or use two fingers) to look around the stadium. The 📷 button takes a photo!'); }, 9000); }
```

(Wording for touch-only devices could drop "Drag the background"; the delay keeps it out of the way of the roll and the
Goal instructions. Adjust where it fits your flow.)

## What looks wrong from the side / behind (not fixed: other people's files)

Checked in the stadium (all angles), beach and volcano (behind). Wide 1100x700 and tall 400x800.

1. **Cube symbols and zone labels are upside down from behind** (felt labels are painted into the felt texture, cube
   faces are turned to read from the player's side). Expected for a "look around" view; fine to leave.
2. **Speech bubbles (js/social.js) are screen-anchored**, not 3D-anchored: the creature's bubble always sits top-centre and
   the kid's bottom-centre, so after swinging the camera the creature's bubble points at empty stadium. Suggestion for
   social.js: while `T3.orbit && T3.orbit.active()`, either skip the tail or position from a projected head point
   (`T3.creatureFocus().head` projected with `T3.ctx.camera`), or simply call `T3.orbit.reset()` before a bubble.
3. **Kid player (js/three/player.js, not edited):** his spot is chosen for the seat view, and he is lowered below the floor
   (`place.y = FLOOR_Y - drop - ...`, drop up to 4.5) so that only his upper body shows at the bottom edge. From the side
   or low angles he is visibly **sunk into the pitch up to the waist/knees**, and he is big (scale up to 1.8) next to the
   table. From behind/above he reads OK. He now gets `ctx.camBase` (the seat), so a refit while orbiting still places him
   correctly for the seat.
4. **The creature** is fine from all angles (from directly behind and low, the camera passes close to its back; the higher
   minimum elevation from behind keeps it out of the model).
5. **Scoreboard text** is only seen edge-on or from behind when swung far; it is a plane facing the seat, as designed.
   No missing back faces noticed on the stands, table apron or legs in the stadium; beach/volcano only glanced at from behind.
6. **Zoomed-out side views** in the stadium end right at the inner edge of the side stands (that is why the sideways
   distance is capped at the seat's). Other venues may have props closer than that; I did not survey beach/volcano props in detail.

## Verified / not verified

- `node tests/engine.test.js`: 320 passed.
- In the desktop browser pane (port 3472), with synthetic pointer events and real mouse drags: mouse orbit, wheel zoom
  limits, ease home 0.5 s via the button (lands exactly on the seat), button shows/hides, close-up refused while away and
  allowed back at the seat, refit while away keeps the offset, new shake resets (and orbit is refused during the pour),
  mouse cube drag unchanged, synthetic one-finger touch does not orbit, synthetic two-finger drag/pinch orbits and puts a
  dragged cube back, photo PNG (1080x553, not blank) both with glow off and with glow on (postfx path), caption strip correct.
- **Not verified:** real touch screens / iPad (two-finger gestures, Safari `gesturestart`), the iPad share sheet and the
  press-and-hold fallback, the actual file landing in Downloads (I intercepted the `<a download>` click instead of saving a
  file), how it feels at 60 fps (the pane was hidden, so frames were driven manually).
