# Handoff from `stage` (lighting, quality tiers, camera close-ups)

Files changed: `js/three/table.js`. New: `js/three/quality.js`, `js/three/shots.js`, `js/three/postfx.js`.
`js/three/fx3d.js` is unchanged. No other file was touched. Nothing below is wired yet: these are the
snippets for the lead.

## New T3 API (all safe no-ops if 3D is off)

| Call | What it does |
|---|---|
| `T3.shot(name, opts)` | Camera close-up, `name` = `'challenge'` \| `'win'` \| `'lose'` \| `'goal'`. Eases in (0.45 s), holds (~0.6 s), eases back (0.5 s). Returns `true` if it started. Refuses during the pour, while a finger is down on the table, when `S.set.shots === false`, and when the same close-up ran less than 2.5 s ago. A tap skips it (quick 0.28 s ease home; that tap does not pick a cube). `opts.hold` (seconds), `opts.done` (called once the camera is home). |
| `T3.shotActive()` | `true` while a close-up is on screen. |
| `T3.quality()` | `'high'` \| `'medium'` \| `'low'`: what is in use right now. |
| `T3.setQuality(q)` | `'auto'` \| `'low'` \| `'high'` (also `'medium'`). `'auto'` forgets the remembered measurement and measures again. |
| `T3.qualityInfo()` | Debug: level, mode, glow/shadows on, pixel ratio, and a log of level changes with the reason. |

Existing signatures are unchanged. `T3.cue(name)` still works; while a close-up is playing, cues are ignored.

## 1. Settings switches (js/screens.js)

Add two rows in the same group as "3D table and dice" (after line 187, the `toggle3d` row):

```js
    (T3.supported ? '<div class="setrow"><label>3D picture quality<br><small style="font-weight:600">Auto picks what this device can run smoothly.</small></label><div class="seg">' + [['auto', 'Auto'], ['low', 'Fast'], ['high', 'Pretty']].map(function (q) { return '<button class="' + ((S.set.quality || 'auto') === q[0] ? 'on' : '') + '" data-act="setQuality3d" data-arg="' + q[0] + '">' + q[1] + '</button>'; }).join('') + '</div></div>' : '') +
    (T3.supported ? '<div class="setrow"><label>Camera close-ups (challenges, wins, the Goal)</label><button class="btn small ' + (S.set.shots !== false ? 'green' : '') + '" data-act="toggleSet" data-arg="shots" data-def="1">' + (S.set.shots !== false ? '✔ On' : 'Off') + '</button></div>' : '') +
```

And next to `ACT.toggle3d` (line 206):

```js
ACT.setQuality3d = function (el) { S.set.quality = el.dataset.arg; persist(); if (T3.setQuality) T3.setQuality(S.set.quality); Snd.click(); renderSettings(); };
```

(The close-ups switch reuses the existing `ACT.toggleSet`; `S.set.shots` defaults to on.)
No default needs adding to `S.set`: a missing `quality` means `'auto'`, a missing `shots` means on.

## 2. Close-up calls (js/game.js)

Add a helper next to `cue()` (line 78):

```js
function shot(name, opts) { return !!(T3.active() && T3.shot && T3.shot(name, opts)); }
```

Then:

- **Challenge** - in `challenge()` (line 324) replace `cue('challenge');` with
  `if (!shot('challenge')) cue('challenge');`
  Only when a creature is the challenger or the challenged? It reads well both ways; if you prefer it only when
  the creature challenges, use `if (!(isAI(who) && shot('challenge'))) cue('challenge');`.
- **Kid wins vs a creature** - line 542 replace `cue('win');` with `if (!shot('win')) cue('win');`
  (the creature's sad reaction from `creatureMood(loseMood(o))` is what the close-up shows; confetti still fires).
- **Kid loses** - line 544 replace `cue('lose');` with `if (!shot('lose')) cue('lose');` (the creature's dance).
- **Goal set** - in `setGoal()` right after `board('GOAL' + ...)` (line 266) add `shot('goal');`
  (frames the stadium scoreboard; in venues without a scoreboard it frames the Goal row on the table).
- 3-player match end (line 557): leave `cue('win')`, or use `if (!shot('lose')) cue('win');` when the creature won.

Taps and drags are exact again as soon as the camera is home (verified: `T3.screenPos` and cube taps/drags hit
the right cube after a shot and after a skipped shot).

## 3. Contracts for other agents

- **arenas** (venues): mark the venue's main light with `light.userData.key = true` and set `castShadow` /
  `receiveShadow` on meshes. `table.js` turns shadows on for that one light only (no other light casts), sizes
  its map by tier and fits its shadow camera around the table after every `T3.retheme()`. Without a flagged light
  the first DirectionalLight found is used (today: the table's own sun). Lights inside the venue also dim with the
  spotlight effect now.
  Glow: opaque `MeshBasicMaterial` with `toneMapped: false` glows automatically on the high tier (scoreboard,
  floodlight lamps, ad boards, space trim). `mesh.userData.glow = true / false` forces it on / off. For the 'goal'
  close-up, return the scoreboard screen as `env.board` from the venue builder or set `userData.board = true` on it;
  otherwise the largest unlit picture plane is used (works for today's stadium).
  Cost note: the stadium has 48 separate lamp boxes (12 per tower); merging each tower's lamps into one mesh
  would save ~44 draw calls per frame (and ~44 more in the glow pass on high).
- **creatures**: `T3.creatureFocus()` returning `{head: Vector3 (world), height}` is used when present. Without it
  the head is estimated from the creature's bounding box and framed a little wider to be safe. Creature bodies
  have `castShadow = false` today (your choice); arms and hands do cast onto the table.
- **player.js (kid on the near side)**: push points to keep in view through `ctx.hooks.extents` as before.
  `ctx.refit` now caps how far extra points can push the camera back (35% beyond what the table alone needs) and
  ignores points behind or touching the lens, so a big creature or a kid right in front of the camera can't shrink
  the table. Call `T3.ctx.refit()` after adding the kid. Whole characters (anything added straight to the scene)
  also hide the glow behind them.

## Quality tiers

| | high | medium (auto stepping stone) | low |
|---|---|---|---|
| shadow map | 2048, PCF soft | 1024, PCF soft | off (contact blobs under cubes stay) |
| glow | on | off | off |
| pixel ratio | up to 2 | up to 1.5 | 1 |
| cube clear coat / texture | on / 512 px per face | on / 256 | off (cheaper shader) / 256 |

Auto: starts at high, watches gaps between consecutive rendered animation frames (the dice pour is the first long
stretch), steps down one level when more than 55% of 40 frames take over 25 ms, never steps up by itself. The
result is remembered on the device for 4 days (`localStorage['tataEq.quality3d']`).

Also new for the iPad: each cube is now one draw call (the six faces share one atlas texture per colour) instead
of six, which takes ~120 draw calls off every frame and the same again off the shadow pass.

Note: while a creature is at the table, `creatures.js` marks the scene dirty every frame (idle breathing), so the
table renders continuously during a match. The governor handles it, but that is where idle cost comes from.
