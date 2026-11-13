# Handoff: face, Tata, My kit, win celebrations (agent `kit`)

Files changed or added (all mine): `js/three/creatures/kid.js` (rewritten), `js/three/player.js` (rewritten, same API plus
new calls), new `js/three/creatures/grownup.js`, new `js/kit.js`, new `css/kit.css`. Nothing else was touched.
Everything below is for the lead to wire. All calls are guarded, so missing pieces never break anything.

## Update 3: real football shorts (both), Tata's V-shaped fit build

Owner: "make Tyson's pants look more like shorts (and mine too) ... make me V-shaped, lean but muscular".
Files: `js/three/creatures/kid.js`, `js/three/creatures/grownup.js`, `js/three/player.js` (one line: `disposeModel`
also disposes a skeleton), this file. Nothing for the lead to wire; no API or save change. Tests: 831 passed.

**Shorts (both figures)** - the old single cylinder (a skirt) is gone. Now three pieces of the same cloth:
- *The seat* (on `root`, so it stays with the legs): a ribbed elastic waistband just outside the tucked-in shirt hem with
  a tiny drawstring bow at the front (white cord, or the trim colour on light shorts), the hips, a rounder seat at the
  back with a centre seam, narrowing front-to-back toward the legs, the crotch just below the hip joints. It is a
  two-bone `SkinnedMesh` (one bone on `root`, one on `body`, both at the origin): from the waistband up it follows the
  leaning upper body, the hips stay with the legs, blended in between, so a deep lean (reach, kneel, tummy on the rim)
  bends at the hips instead of opening a gap at the back. GPU skinning, nothing per frame on the CPU.
- *Two legs of the shorts* (each on its thigh group): the top is a ball centred on the hip joint, so the leg turns
  inside it whatever the swing (walk, crouch, knee slide, jump, kneel) and nothing tears; the hem ends mid-thigh
  (`hemL` below the hip joint), cut a little higher on the inside (inseam), flares slightly and stands away from the
  thigh, a darker inside lip, two soft folds near the hem (geometry + texture shading). Clear gap between the thighs.
- Kept: trim side stripe with the thin shirt-colour line (now running down the seat and the outside of each leg), the
  hem band round each leg, the small number on his left leg (number style follows the kit). Kit colours / home / away /
  third / light shorts all work (`setKit` redraws the three shorts textures and the cord colour).
- *Legs:* proportions changed for bare thighs + knees: kid thigh 0.75 / shin 0.80 (was 0.55 / 1.0), Tata 1.15 / 1.20
  (was 0.95 / 1.4); the sums are unchanged, so `FOOT`, `TOP`, the seat placement and every pose height are the same.
  Thighs taper to the knee, a knee with a small kneecap, calves fuller at the back, the long socks (same texture and
  band) start just below the knee.
- New dims: `hipX`, `waistTop`, `hemL`, `shortsRb` (radius of the ball top), `zs`, `muscle`, `torsoCtrl`, `sleeveK`;
  `shortsY/H/R` are gone (nothing outside kid.js read them); `HIP_LOW` is now the hem height.

**Tata's build** (`TATA` in grownup.js; face and hair untouched):
- *V shape:* his own shirt profile (`torsoCtrl`): waist about 0.69, chest about 1.0 (radius), shoulders `SH_X` 0.98
  (was 0.9) with the round sleeve caps as deltoids; chest less deep than wide (`zs: 0.8`, the shirt group is squashed
  front-to-back, which does not stretch anything at the front or back).
- *Under the shirt* (`torsoBump`, `muscle: 1`): two soft pecs with a clearer lower edge, a breastbone groove, the
  shoulder blades either side of a spine groove. The collar band and badge decals use the same lift, so they sit on it.
- *Arms:* muscle-profile segments (biceps fullest just below the sleeve, forearms full near the elbow tapering to a
  slimmer wrist), `armR` 1.22, a snug sleeve narrowing to its cuff, cuff / long-sleeve wrist band / armband resized to
  fit. Gloves unchanged (they fit).
- *Legs:* fuller quads with the teardrop above the knee, fuller calves. Neck a touch thicker.
- *Shirt texture:* the front number, back number and back name are now drawn row by row with each row's own width
  (`warp` in `kidJerseyTexture`), so on the tapering V torso they are not wider at the top. (The kid's shirt is almost
  a cylinder there, so his look is unchanged.)

The kid keeps his child's build; only his shorts and legs changed.

Judgment calls: the shirt is worn tucked into the waistband (the waistband and bow have to show); the kid's seat
still bulges a bit in a strict side view because his shirt is a round tummy and the waistband must sit outside it;
V ratio kept "fit dad", not bodybuilder (shoulder span about 1.75 x the waist).

Verified in the browser (port 3521): close renders of both figures front / back / side / 3/4 / from above, walking,
crouch, kneel, deep lean, tummy-on-rim; before / after renders from the previous commit's modules; in a match: the
kid's bottom seat, a walk-and-place move (permitted: tummy grab, run round, kneel on the table), all four celebrations
(jump, spin, robot, slide); Tata as the main player (seat, jump, slide, a move); Team-up (Tata at the left seat,
standing and knee slide); 2 Players (Tata across the table, from the seat camera); the kit panel previews (front,
back, chest close-up), Tata's third kit with long sleeves, gloves and armband, the kid's away kit with gloves,
armband, long sleeves; white shorts; the title screen kid. No console errors. Not verified: real devices / 60 fps,
online, every kit colour combination, a strict check of the left seat spacing numbers (it looked right).

## Update 2: the shirt front, home / away / third kits, and gear

Files: `js/three/creatures/kid.js`, `js/three/creatures/grownup.js` (comments only), `js/kit.js`, `css/kit.css`, this
file, and **two lines in `js/three/player.js`** (import `savedKit` from kid.js, and in `specOf` the kid's kit is now
`Object.assign({}, savedKit(s), overrideKit)` instead of `Object.assign({}, KIT_DEFAULT, s.kit, overrideKit)`, so the 3D
kid wears the kit chosen in `S.kitUse`). Nothing else touched.

**The shirt** (reference: a red national-team shirt; we reproduce the look with our own marks only):
- **V-neck in geometry:** a raised knitted band (ribbed texture: trim colour, a thin stripe and an inner edge in
  `trim2`, default the shirt colour) follows the neckline round the back, where it stands up against the neck, and down
  into a V on the chest. Inside the V the shirt surface is sunk 0.035 units (the opening) and painted skin with a soft
  shadow under the band. `collar: 'round'` gives a crew neck band instead. Built on both bodies (`torsoProfile(D)`).
- **Cuffs:** a knitted band (same texture) replaces the plain ring at the end of each short sleeve; with long sleeves the
  band sits at the wrist.
- **Texture:** 2048 x 1024, laid out by arc length down the torso profile (canvas y) and angle (canvas x), seam under his
  right arm, mipmaps + anisotropy 8. Front: tall thin icy-blue number (`#cfe3e6`, `S.jersey`), tone-on-tone waves (about
  30 rows), darker side panels under the arms. Back: name in an arc over the big number. A small four-pointed compass
  star just under the back of the collar (outside, not inside: his neck fills the inside of the collar, and from the seat
  camera the outside is what shows). Sleeves and shoulder balls: the same waves as rings.
- **Badges as decals** (their own 512 / 256 px textures, laid on the surface so they stay sharp when the orbit camera is
  ~2 units away): our crest on his left chest, our maker's mark on his right chest and on top of both shoulders.
- **Shorts:** trim side stripe with a thin shirt-colour line, hem band, small number on his left leg. **Socks:** trim
  band near the top. **Boots:** his colour, contrasting sole, six studs, laces, heel tab.
- **Our own designs** (kid.js `CRESTS` / `MARKS`, never a real crest, maker's logo or wordmark):
  crests `cube` Cube shield (kid's default: gold-edged shield, red chief with 3 stars, teal cube with "="), `roundel`
  Star roundel (Tata's default: navy ring of gold stars, yellow centre, white cube with "x"), `star` Star stripes,
  `ribbon` Plus ribbon, `dice` Dice sun, `diamond` Equals diamond. Maker's marks (one colour, the accent):
  `cube` Speed cube (kid's default), `swift`, `fox`, `rocket`, `bolt` (Tata's default), `pip`.
- **Number styles** (drawn as canvas strokes, no fonts): `thin` (default, the reference), `block`, `round`, `college`,
  `outline`; front, back and shorts use the same style.

**Save shape** (all new keys optional; old saves get the defaults, which give the reference look):

```js
S.kit = { shirt, pattern, trim, shorts, hair, hairStyle, celebrate,            // as before (this is the HOME kit)
          collar: 'v', frontNum: true, crest: 'cube', mark: 'cube', sleeves: 'short', numStyle: 'thin',   // home kit
          boots: '#1f2430', gloves: false, armband: false, armbandCol: '#ffd43b' }                      // his own, every kit
S.kits = { away: {...}, third: {...} }   // only the kit keys he changed: shirt pattern trim trim2 shorts collar frontNum crest mark sleeves numStyle
S.kitUse = 'home' | 'away' | 'third'     // which one he wears
```

Slot defaults: away = white waves, sea-green trim with a red stripe, midnight shorts, V-neck; third = dark teal waves,
ice-blue trim, black shorts, round collar, long sleeves, block numbers. Hair, celebration, boots, gloves and the
armband belong to him (kept in `S.kit`) and are the same in every kit. `Kit.current()` returns the worn kit;
`savedKit(S)` (kid.js) does the same merge for 3D.

**js/config.js defaults** (optional: `Kit.get()` fills all of this in for any save, and player.js falls back too):

```js
    kit: { shirt: '#c9342c', pattern: 'waves', trim: '#2f8f7c', shorts: '#1f6b5a', hair: '#3b2314', hairStyle: 'swept', celebrate: 'jump',
           collar: 'v', frontNum: true, crest: 'cube', mark: 'cube', sleeves: 'short', numStyle: 'thin', boots: '#1f2430', gloves: false, armband: false, armbandCol: '#ffd43b' },
    kits: { away: {}, third: {} }, kitUse: 'home',
```

(If `merge()` deep-merges `kit`, the new keys arrive by themselves; `kits` / `kitUse` are new top-level keys.)
Online: send `savedKit`-style data (`Kit.current()`) as `remote.kit`; it is plain colours and ids.

**Kit panel:** Home / Away / Third tabs (with "wearing" and a "Wear the away kit" button), then shirt, pattern, trim,
shorts, collar, sleeves, number style, front number on/off, crest (picture tiles + None), maker's mark (+ None); under
"In every kit": number, boots (8), captain's armband (Off + 6 colours, on his left upper arm with a drawn "C"),
goalkeeper gloves on/off, hair, celebration. Live preview: front (3/4), back, and a chest close-up cropped from the
front picture (512 px). `window.KitArt` (set by kid.js) gives the panel the crest / mark thumbnails; without 3D the
panel falls back to a flat SVG front and back.

**Gloves:** the hand turns into the glove (trim colour, a contrasting wrist strap) and grows 1.2x; the shared ArmRig
poses are unchanged, so grab / carry still work (checked visually with a cube in an open and a closed hand; no
player.js change was needed for this).

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
   is off. (Update 2 above adds our own crests and maker's marks; still no real crests, logos or players.)
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
- Kit patterns are drawn on his shirt texture (`kidJerseyTexture`, redrawn in Update 2 at 2048 x 1024; no longer the
  old drawing). A light shirt switches the numbers and marks to the trim colour or navy.
- Hands are the shared mitten hands (`ArmRig`). The celebrations avoid closed fists with a lone raised digit (it can
  read badly from some angles): fists are half-open, robot hands point forward.
- README file map rows, if wanted:
  `js/three/creatures/grownup.js | Tata, the grown-up player (same rig as the kid)` and
  `js/kit.js | My kit: shirt, pattern, number, hair, win celebration (S.kit)`.
