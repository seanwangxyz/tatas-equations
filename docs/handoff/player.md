# Handoff: the kid's own 3D player (`player` agent)

New files (all owned by `player`):

- `js/three/creatures/kid.js` builds the kid footballer from three.js primitives: big-headed kid,
  brown hair with a cowlick, shirt with **his name over his number on the back**, shorts, socks, boots.
  Arms reuse `ArmRig` from `creatures/common.js` (no changes to common.js). One 512x160 canvas texture.
  About 39 meshes.
- `js/three/player.js` is the runtime: placement, kit choice, moods. It plugs into `T3.ctx` exactly like
  `creatures.js` (frame hook + extents hook) and stays **hidden until `T3.playerShow(true)`**.

Nothing else was changed. Everything below is for the lead to wire.

## 1. Script tag (index.html)

After the creatures module:

```html
<script type="module" src="js/three/table.js"></script>
<script type="module" src="js/three/creatures.js"></script>
<script type="module" src="js/three/player.js"></script>   <!-- new -->
```

If 3D fails to load, the module never runs and `T3.playerShow` etc. are undefined. If it loads but
there is no WebGL (`T3.ctx` missing), it installs no-op stubs. Either way, **always guard calls**
(`if (T3.playerMood) ...`), same as the existing `creatureMood()` helper does.

## 2. A helper in game.js (next to `creatureMood`, line ~25)

```js
function playerMood(m, opts) { if (T3.playerMood) T3.playerMood(m, opts); }
function playerShow() { if (T3.playerShow) T3.playerShow(S.set.avatar !== false); }
```

## 3. Where to call each mood

All moods play once and settle back to a calm rest (slow breathing only). `think` is the one held pose.
Unknown names are ignored. Calls while he is hidden, or with 3D off, do nothing.

| Mood | Event | Where in js/game.js / js/builder.js |
|---|---|---|
| `playerShow()` | match starts | `startMatch`, right after `setCreature(...)` (line ~44). Also after the Settings toggle changes. |
| `wave` | match start greeting | in `begin` inside `startMatch`, right after `T3.creatureEnter()`: `setTimeout(function () { playerMood('wave'); }, 500);` |
| `think` | his builder opens | `openGoalBuilder` and `openSolutionBuilder` (builder.js): `if (pi === 0) playerMood('think');` |
| `null` | builder closes | builder.js `ACT.bCancel`, `ACT.bGiveUp`, `ACT.bSubmit` (both branches): `playerMood(null);` (eases back). A later mood also replaces it, and it lets go by itself after 60 s. |
| `now` | he challenges | `challenge(kind, who)` line ~322, next to `if (isAI(who)) creatureMood('challenge');`: `else if (who === 0) playerMood('now', { kind: kind });` (`kind: 'impossible'` gives arms out wide, a referee's "no!"; `'now'` points up toward the opponent) |
| `reach` | he just placed a cube | `placeCube(id, zone, who)` line ~224, after `G.justMoved = id`: `if (who === 0) playerMood('reach', { cube: id });` The hand gestures toward the cube's new spot and always stops short of the table rim. Optional: drop this line if it feels busy. |
| `nod` | small acknowledgement | optional: the same place as `reach` instead of it, or when the creature makes a move he should watch. |
| `cheer` | he scored well / won | `endShake` line ~511: inside `if (good) { ... }` add `playerMood('cheer');`. `resolveChallenge` when `ch.challenger === 0 && pts[0] === 6` (a correct challenge) can also `playerMood('cheer')`. `endMatch` when `won` (line ~542): `playerMood('cheer');` |
| `clap` | a fair result | `endShake` `else` branch (not a big score but no loss): `playerMood(ap > hp ? 'aw' : 'clap')` (see `aw`). `endMatch` tie: `playerMood('clap');`. In pvp/3-player `endMatch`, clap when player 0 isn't the winner. |
| `aw` | he lost a round | `endShake` when the AI out-scored him (`ap > hp`, line ~506): `playerMood('aw');` `endMatch` when `!won && !tie` (line ~544): `playerMood('aw');`. It is a small shrug, a soft look down, then back up. No sadness. |

Suggested `endShake` shape (keeps today's logic, only adds the kid):

```js
if (G.mode === 'ai') {
  if (good) { /* existing */ playerMood('cheer'); }
  else { /* existing */ playerMood(ap > hp ? 'aw' : 'clap'); }
}
```

(`ap`/`hp` are only defined when there is an AI player; guard with `aiI !== undefined`.)

Leaving the match: nothing is needed (the canvas is not drawn outside the game screen). `ACT.reallyQuit`
and `ACT.toMenu` may call `T3.playerShow && T3.playerShow(false)` for tidiness.

`T3.playerRefresh()`: call after `ACT.saveJersey` and after the name changes. The shirt colour against the
opponent is checked automatically each frame (cheap string compare) and at `playerShow(true)`.

## 4. Settings switch (js/screens.js, line ~185)

Add one entry to the existing toggle list, so `ACT.toggleSet` handles it with no new code:

```js
['avatar', 'Show me at the table (3D)', true],
```

and in `js/config.js` defaults (`set: {...}`, line 275) add `avatar: true` (optional: `toggleSet` already
treats a missing value as on because `data-def` is 1). Then, after the toggle, the next match picks it up;
for an immediate effect while a match runs: in `ACT.toggleSet`, `if (k === 'avatar' && T3.playerShow) T3.playerShow(S.set.avatar !== false);`.

## 5. How placement works (for the `stage` agent)

Every time `table.js` fits the camera (extents hook), on the next frame `player.js` searches a small grid of
spots and sizes and keeps the biggest one where **no part of him (including raised hands in the cheer,
wave, point and arms-out poses) covers the table's outline above the rim**, his head is fully on screen,
and his head is at least ~30 CSS px tall. Parts below the table top that fall inside the table outline are
hidden by the table, so they don't count. He may stand lower than the pitch only where the cut line is off
screen or behind the table. If nothing fits he is hidden. About 20-25 ms once per resize on a desktop.

Results I measured:

| Viewport | Layout | Where he goes |
|---|---|---|
| 1024x768 (iPad landscape) | wide | beside the near-left corner of the table, back to the camera |
| 1180x820 (iPad Air landscape) | wide | same, a bit bigger |
| 834x1112 iPad portrait, goal phase | wide | bottom-left corner, head and shoulders low at the bottom edge |
| 834x1112 iPad portrait, roll phase | tall | hidden (the table fills the screen) |
| 375x812 phone portrait | tall | hidden |
| 812x375 phone landscape | wide | hidden (canvas only 200 px tall) |

Request to `stage` (optional, small): expose the fitted base view so placement never sees a temporary camera
offset, e.g. at the end of `fitCamera()`: `ctx.camBase = base;` (`base` is `{pos, look}`). `player.js` already
uses `ctx.camBase` if it exists. Today it uses the camera as it is right after a fit, which has no offsets
except in the rare case of a resize during the cup pour.

## 6. Notes

- He never casts or receives shadows (the sun shadow only covers the table).
- At rest he only breathes, and he does not ask for frames to do it: the breathing shows when something else
  renders. During a mood he requests frames, and stops once settled.
- Kit: red with white (matches his red HUD badge); switches to purple/gold when the opponent's shirt is close
  to red (fox, Pip's orange), teal as a last resort. Monster-pack shirts use the classic team colour as a
  stand-in (`TEAM[kind]`), not the manifest override.
- `T3.playerState()` is a debugging aid (`{shown, fits, visible, mood, scale, at, headNDC, drop, rejected}`).
