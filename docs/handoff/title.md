# Handoff from `title`: the 3D title screen and splash

## Files

- New: `js/three/title.js` (the scene, `window.Title3D`), `js/title-sfx.js` (sounds, `TitleSfx`), `css/title.css`.
- `js/ui.js`: `go()` tells `Title3D` which screen is up; `runIntro()` skips the old 2D cube intro when the 3D
  title can run (the 3D opening replaces it; the 2D intro still runs without 3D); `gotoTitle()` has new markup
  (logo as `h1`, Pip's greeting, a `.t-panel` around the player card, stage chip and the same six buttons in the
  same order, icon badges); `titleSceneReady` / `titleSceneFailed` hooks; hover/press sounds on title buttons.
- `index.html` (marked `TITLE`): `css/title.css`, the fixed layer `<div id="t3title">`, `js/title-sfx.js`,
  `js/three/title.js` (last module). The splash logo is now an `h1` and the whole splash section has
  `data-act="start"` (tap anywhere).
- Small additive exports in other modules (nothing else changed there):
  - `table.js`: `T3.drawCubeFace = drawFace` (the title cubes use the game's own face drawing and his cube skin).
  - `player.js`: `T3.playerSpec(o)` = the spec the table builds him from (kit, number, name, hair, kid/grown-up).
  - `crowd.js`: option `o.detached` so a crowd never becomes the one `T3.crowd` drives.
  - `stadium.js`: passes `opts.detached` to the crowd and `opts.pitchSize` to the pitch texture.
- `kid.js` / `grownup.js` are only imported (`buildHuman`, `kitFromSave`, `KIT_DEFAULT`, `TATA_KIT`, `KID`,
  `TATA`, `TATA_LOOK`); `T3.playerSpec` is preferred, so new optional kit keys flow through player.js.

## What it does

- **Splash**: the night stadium with the cube title already standing on a stage, scoreboard "HI, NAME!",
  a slow 14 s push-in once, then still. Big "Tap to Play!" (anywhere works). No sound before the tap.
  Until the module has loaded (or without 3D) the old splash shows.
- **First title of the session (about 5.8 s)**: floodlights come up (exposure ramp, four clunks), the camera
  glides in (4.6 s); the 15 cubes are kicked up and tumble down to re-form TATA'S on EQUATIONS (real bounce
  paths, squash, a thud per impact synced on the audio clock); fanfare from 0.45 s; at 2.95 s a whoosh and a
  light glint sweeps the cubes; the kid (his kit, number, name; the grown-up if Settings says so) runs in from
  the right with footsteps, turns, and at 4.0 s throws a fist up (big chord, crowd cheer + wave, flashbulbs,
  floodlight flares, confetti, crowd swell); Pip and up to two unlocked creatures hop in once. At 5.1-5.7 s
  his arm comes down to hands-on-hips. Then rest. The game's menu music (if on) starts after the opening.
- **Later titles in the session (1.5 s)**: short camera glide, the cubes do one ripple hop, a sparkle and chime.
- **Rest**: a very slow camera drift (2.4 degrees, 32 s, once, about 25-30 fps) then completely still.
  Single blinks (kid and creatures, every 3.5-9 s). Every 12-20 s one one-off, never twice in a row: a
  creature/Pip waves once, a loose cube on the pitch rolls over once, or a shooting star. Confetti stays where it
  landed. Very low stadium murmur.
- **Any tap skips** the opening (the tap still works on the menu: buttons are live from the first frame).
- **prefers-reduced-motion**: one still frame, a soft chime, nothing moves. **`S.set.titleFx === false`**:
  one still 3D frame, no title sounds. **`S.set.three === false`, no WebGL, CDN failure, or a build error**:
  the flat 2D title (same markup without `.t3`).
- Layout: glass panel on the right when the window is wide (aspect > 1.1 and >= 700 px), at the bottom in
  portrait; the camera is fitted (binary search + view offset) to the part of the screen the panel leaves free.
  Pip's greeting bubble is placed over his head from the 3D position.

## Renderer choice

The table's own `WebGLRenderer` (`T3.ctx.renderer`) is borrowed: its canvas moves into `#t3title` while the
splash/title is up, and `T3.attach` takes it back when the table is next drawn (it re-attaches whenever the
canvas is not in its host). One WebGL context for the whole game, so no context can leak (iPad Safari limits
contexts and memory). Size, pixel ratio and exposure are saved and restored. The table only draws when
`current === 'game'`, so the two never draw at the same time. The scene uses the table's environment map
(never disposed by the title). Leaving the title stops all drawing and sound at once; the scene's memory is freed
when a match starts (immediately) or after 45 s on other screens (Settings and back reuses it).

## Measured (Chrome in the desktop app's pane, 1280x800, medium tier)

- Build 115-165 ms; about 260 draw calls / 430k triangles at rest (the stadium crowd is most of it).
- At rest after the drift: 114 renders in 30 s (blinks + one wave/roll), 0 renders in 5 s when titleFx is off.
- Three match/quit cycles: renderer memory steady (title 370 geometries / 49 textures, match 167 / 28 on each
  cycle), audio: 0 live title nodes in the match, title context suspended; no console errors.
- Fanfare + full opening score rendered offline (OfflineAudioContext): peak -4.4 dBFS, RMS 0.09, 0 clipped
  samples, loudest at the chord (4.0-4.5 s), silent by 6.5 s.

## Not verified

- On a real iPad (performance, Safari backdrop-filter cost over the moving canvas, audio resume after
  returning from a match without a tap). There is a guard: if the opening runs slowly it drops to pixel ratio 1
  and no shadows; every tap resumes the title's audio context.
- The sound itself was not heard, only rendered and measured.

## For the owner of other files (snippets)

Settings row in `js/screens.js` `renderSettings()` (uses the existing `toggleSet`):

```js
'<div class="setrow"><label>Title screen show<br><small style="font-weight:600">The 3D opening: cubes, the crowd, a fanfare. Off: a still picture, no title sounds.</small></label><button class="btn small ' + (S.set.titleFx !== false ? 'green' : '') + '" data-act="toggleSet" data-arg="titleFx" data-def="1">' + (S.set.titleFx !== false ? '✔ On' : 'Off') + '</button></div>' +
```

Optional: `titleFx: true` in `defaults().set` in `js/config.js` (undefined already means on).

## Test hooks

`Title3D.stats()`, `Title3D._forceMotion = true` (play the opening even with OS reduced motion, which this
machine has on), `Title3D._at(t)` (draw the opening t seconds in), `Title3D._oneOff('wave'|'roll'|'star')`,
`TitleSfx.stats()`, `TitleSfx._render(TitleSfx.score(), 7.5)`. Background panes throttle rAF: shim it with
`window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16)`.
