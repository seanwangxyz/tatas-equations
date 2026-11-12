# Handoff: face, Tata, My kit, win celebrations (agent `kit`)

Files changed or added (all mine): `js/three/creatures/kid.js` (rewritten), `js/three/player.js` (rewritten, same API plus
new calls), new `js/three/creatures/grownup.js`, new `js/kit.js`, new `css/kit.css`. Nothing else was touched.
Everything below is for the lead to wire. All calls are guarded, so missing pieces never break anything.

## What is new

1. **A real face and head.** Cartoon likeness of the kid: straight, fairly thick dark-brown hair with a fringe swept
   across the forehead toward his left, hair over the tops of the ears; brown eyes with lids; light tan skin; rosy
   cheeks; a big wide open grin with teeth. It holds up from the front, the sides and 3/4. Each mood changes the face
   once (eyes, brows, mouth) and eases back: `cheer` big open laugh + happy squint, `think` a "hmm" mouth to one side
   with one brow up and eyes up, `aw` a small "o" with soft worried brows, `now` an open shout with determined brows,
   `wave` / `clap` / `nod` a bigger grin or a warm smile, `reach` eyes down to the cube.
   **Stillness rule:** at rest he is completely still. The old slow breathing is gone (it was a loop). The only idle
   movement is a single blink every 4-7 s (the creatures blink too); measured: 20 frames of drawing per blink, nothing
   else while idle.
2. **Tata** (`js/three/creatures/grownup.js`): the same rig with grown-up proportions (longer body and legs, smaller
   head for his height), slim face with a longer chin, black hair longer on top and tousled, falling to both sides,
   a few lighter brown strands, a hint of stubble, a warm smile. Yellow shirt with navy trim and shorts, number 17.
3. **My kit** panel (`js/kit.js`, `css/kit.css`): shirt colour (10), pattern (plain / waves / stripes / hoops / sash),
   trim (8), shorts (8), number 1-99, hair colour (5) and hair style (5: swept fringe, short, spiky, curly, long), and
   the win celebration. Live 3D preview (front and back) through the new `T3.playerPortrait`; a flat drawing when 3D
   is off. Plain colours and patterns only: no crests, logos or real players.
4. **Win celebrations** (original moves, 2.7-3 s, played once then back to rest):
   - **Rocket Jump** (from the start): crouch, big jump with one arm punched to the sky, land, one "yes!" arm pump.
   - **Spin & Point** (from the start): wind-up, one full turn on the spot with arms out, both arms up to the sky.
   - **Robot Dance** (unlock: **Level 5**, 1000 XP): four stiff stepped poses (forearms forward, then arms out).
   - **Knee Slide** (unlock: **beat 3 different creatures**, `S.beaten` count >= 3; a Team-up win counts because
     team.js sets `S.beaten`): lean in, drop onto both knees sliding a little forward, arms wide up, stand up.
   `S.unlockAll` opens all four. No random rewards.

## 1. index.html

After the team stylesheet:

```html
<link rel="stylesheet" href="css/team.css">
<link rel="stylesheet" href="css/kit.css">   <!-- new -->
```

After the team script (kit.js needs `ACT`, `modal`, `level`, `persist`, `esc`, `ico`, all defined earlier):

```html
<script src="js/team.js"></script>
<script src="js/kit.js"></script>   <!-- new -->
```

The 3D module tags stay as they are (`player.js` imports `grownup.js` itself).

## 2. js/config.js: save defaults

In `defaults()`, right after `jersey: '7',` add `kit` (these values reproduce today's look exactly: red wave shirt,
sea-green trim, deep-green shorts):

```js
    lastDedication: '', tutorialDone: false, dailyDone: {}, jersey: '7', oppNames: OPPONENTS.map(function () { return ''; }),
    kit: { shirt: '#c9342c', pattern: 'waves', trim: '#2f8f7c', shorts: '#1f6b5a', hair: '#3b2314', hairStyle: 'swept', celebrate: 'jump' }
```

(Optional: `merge()` already fills it in for older saves, and `Kit.get()` / `player.js` also fall back to these
defaults when `S.kit` is missing.) **The number stays in `S.jersey`** (the HUD and Team-up read it there); the kit
panel edits `S.jersey` directly. The name on the back is still `S.name`.

## 3. js/screens.js: the "My kit" button

There is no "Locker Room" in my copy of screens.js; the cosmetics live in `renderTrophies()` (Trophy Room). In
`renderTrophies()`, right before the Cube Skins line
(`html += '<h3 class="tierh">' + ico('cube') + ' Cube Skins</h3>...`), add:

```js
  if (typeof Kit !== 'undefined') html += '<h3 class="tierh">' + ico('star') + ' My kit</h3><div class="row" style="justify-content:flex-start;margin:6px 0 12px"><button class="btn green" data-act="openKit">' + ico('star') + ' Design my kit</button></div>';
```

If your Locker Room screen is a different function, the button is just `data-act="openKit"` anywhere.

Settings: after a name or number change, refresh the 3D player:

```js
ACT.saveJersey = function () { var v = ($('#jerseyInput').value || '').replace(/[^0-9]/g, '').slice(0, 2); if (v) { S.jersey = v; persist(); Snd.chime(); if (T3.playerRefresh) T3.playerRefresh(); } renderSettings(); };
ACT.saveName = function () { var v = ($('#nameInput').value || '').trim().slice(0, 14); if (v) { S.name = v; persist(); Snd.chime(); if (T3.playerRefresh) T3.playerRefresh(); } renderSettings(); };
```

## 4. js/game.js: helpers, celebration, the second human

Next to `playerMood` / `playerShow` (line ~25):

```js
function playerCelebrate() { if (T3.playerCelebrate) T3.playerCelebrate(typeof Kit !== 'undefined' ? Kit.celebration() : undefined); else playerMood('cheer'); }
function mateShow(o) { if (T3.mate) T3.mate(o || null); }
function mateMood(m) { if (T3.mateMood) T3.mateMood(m); }
```

`Kit.celebration()` returns the chosen celebration if it is unlocked, else `'jump'`.

**Match win** in `endMatch` (line ~565), inside `if (won) { ... }`: replace `playerMood('cheer');` with
`playerCelebrate();`. Keep `playerMood('cheer')` in `endShake` (a good shake is not a match win).

**The second human** in `startMatch`, right after `setCreature(ai ? ai.kind : null, ai && ai.pack); playerShow();`:

```js
  if (mode === 'pvp') mateShow({ who: 'tata', seat: 'far', name: (cfg && cfg.n2) || 'Tata', number: '17' });
  else if (mode !== 'team') mateShow(null);   // team.js places its own teammate (section 5)
```

(If 2 Players should show a second kid instead of Tata: `{ who: 'kid', seat: 'far', name: ..., number: ..., kit: {...} }`.)
In the pvp branch of `endMatch`, when player 2 wins: `mateMood('cheer')` (and `playerMood('clap')`); when player 1
wins: `playerCelebrate(); mateMood('clap');`.

Leaving a match (`ACT.reallyQuit`, `ACT.toMenu`): add `mateShow(null);` (and optionally `if (T3.playerShow) T3.playerShow(false);`).

## 5. js/team.js: Tata as the teammate

At the end of `setup(g, oppIdx, cfg)`:

```js
    if (T3.mate) setTimeout(function () { if (G && G.team) T3.mate({ who: 'tata', seat: 'left', name: g.team.names[1], number: g.team.jerseys[1] }); }, 0);
```

(`setTimeout` because `startMatch` calls `playerShow()` after `Team.setup`, and the left seat is chosen so it never
overlaps the kid.) If the teammate is Mama or someone else, the model is still the Tata figure with their name and
number; a separate grown-up look can be added later the same way as `TATA_LOOK`.

In `endMatch` (line ~186): replace `playerMood('cheer');` in the `won` branch with
`playerCelebrate(); if (T3.mateMood) T3.mateMood('cheer');`, and add `if (T3.mateMood) T3.mateMood('aw')` /
`T3.mateMood('clap')` next to the existing `playerMood('aw')` / `playerMood('clap')`. Optional: `T3.mateMood('wave')`
at match start, and `T3.mateMood('think')` / `T3.mateMood(null)` around the teammate's Goal builder.

## 6. js/online.js (not in my copy of the repo)

Online has no creature, so the opponent stands across the table:

```js
if (T3.mate) T3.mate({ who: 'kid', seat: 'far', name: remote.name, number: remote.jersey, kit: remote.kit });
// or { who: 'tata', seat: 'far', ... } when the other side is Tata
```

`remote.kit` can be the other player's `S.kit` sent over the wire (plain colours and ids only). Call `T3.mate(null)`
when the online match ends.

## 7. The 3D API (all in js/three/player.js)

```js
T3.playerShow(on)                  // unchanged
T3.playerMood(name, opts)          // unchanged names; now also changes the face once
T3.playerCelebrate(name?)          // 'jump' | 'spin' | 'robot' | 'slide'; no name = S.kit.celebrate. Returns true if it plays.
T3.playerCelebrations()            // ['jump', 'spin', 'robot', 'slide']
T3.playerSet({ who: 'kid' | 'tata', kit, name, number } | null)   // who stands at the kid's spot; missing fields from the save
T3.playerRefresh()                 // re-read S.kit, S.jersey, S.name
T3.mate({ who: 'tata' | 'kid', seat: 'left' | 'far', kit, name, number } | null)   // returns whether he fits on screen
T3.mateMood(name, opts)            // moods and celebrations for the second human
T3.playerPortrait(o, size, view)   // Promise<PNG data URL | null>; view 'front' | 'back' | 'face' | { yaw, close }
T3.playerState()                   // debugging (includes .mate)
```

`kit` is the saved shape `{ shirt, pattern, trim, shorts, hair, hairStyle }` (any subset) or a full kit object.

### Seats

- **`left` (Team-up):** beside the left end of the table, on the kid's side. A small search (same rules as the kid:
  never over the table outline, head fully on screen) picks the spot at the kid's world scale (so a grown-up is
  taller than the kid), at least 1.25 x (both sizes) away from the kid, between the near corner and 1.2 units short of
  the far edge (the creature always stands behind the far edge, at `z = -D/2 - 1.95`, so they never meet). Hidden
  when nothing fits (tall phones), like the kid. Measured at 1400x820: Tata stands just behind the kid at the
  left end, turned toward the table.
- **`far` (2 Players / Online):** exactly where a creature stands (`x = 0`, `z = -D/2 - 1.95`), facing the camera,
  feet on the pitch, scale 1.35, with a small number on the chest. He adds his head to the camera fit (extents hook),
  like a creature. **He hides himself while a creature is at the table** (`T3.creatureVisible()`), so a forgotten
  `mate(null)` can never put him inside a creature.

## 8. Notes and limits

- **Orbit camera:** placement (kid and `left` mate) is computed when the camera is fitted (extents hook), with the
  fitted view (`ctx.camBase` if present). If the orbiting camera moves without a refit, the placement stays where it
  was (good: people should not jump around while the camera moves). If the camera helper wants them re-placed for a
  new view, calling `T3.ctx.refit()` or pushing a new extents pass is enough.
- The face only shows when the camera sees his front; from the usual camera you still see his back (name + number).
- Kit patterns are drawn on his shirt texture (`kidJerseyTexture`); the default red wave kit is byte-for-byte the
  old drawing. A very light shirt (white) switches the name and number to dark ink.
- Hands are the shared mitten hands (`ArmRig`). The celebrations avoid closed fists with a lone raised digit (it can
  read badly from some angles): fists are half-open, robot hands point forward.
- README file map rows, if wanted:
  `js/three/creatures/grownup.js | Tata, the grown-up player (same rig as the kid)` and
  `js/kit.js | My kit: shirt, pattern, number, hair, win celebration (S.kit)`.
