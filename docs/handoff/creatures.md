# Handoff from `creatures`

Everything below is inert until wired. Nothing in this branch touches files outside `creatures`' ownership.

## 1. index.html: load the portraits module (needed for the card pictures)

Add one line right after the creatures module (currently line 68):

```html
<script type="module" src="js/three/creatures.js"></script>
<script type="module" src="js/three/portraits.js"></script>   <!-- add this -->
```

Without it the album keeps showing emoji (cards.js feature-detects `T3.portrait`). No stylesheet is needed:
the portrait `<img>` carries its own inline sizing, so `css/cards.css` was not created.

Optional README file-map row: `js/three/portraits.js | Head-and-shoulders pictures of the creatures for the card album (T3.portrait)`.

## 2. For `stage`: `T3.creatureFocus()`

```js
T3.creatureFocus()  // -> { head: THREE.Vector3 (world, a fresh copy), height: number (world y of the top of head/hat/ears) } or null
```

- `null` when no creature is set or it has left the table (after `creatureExit`).
- `head` follows the creature's steps, leans and entrances (classic: the head group; monsters: the head point carried by the body).
- Cheap (one `updateMatrixWorld` on the creature), fine to call every frame of a close-up.

## 3. For `stage`: the camera and the creature's size (a suggestion, not a request)

`creatures.js` still pushes the creature's top into `hooks.extents`, now with one extra point for the back of the head
(they stand leaning back a little, so the top of the head sits behind the hips; before, the sloth's head could touch the
canvas edge). Every creature is scaled so its top reaches the same world height (`FRAME.topH`: 6.5 wide, 6.6 tall),
so the table no longer changes size from one opponent to the next.

Measured headlessly (Chrome, 1024x768 and 390x844): the table is about 10% shorter on screen than with the old Rusty
in the wide layout and about 6% in the tall one; it is bigger than it used to be with the old Mondo (his hat pushed
the camera back).

The fitted view is top-bound: the camera looks at the table centre, so the creature's head sets the distance while a
band below the near table edge stays empty (about 110 px on a 390x844 phone, about 160 px on a 1024x768 iPad; part of
it is under the bottom message bar). If
`fitCamera` aimed a little toward the far side (or fitted top and bottom separately), both the table and the creature
could be bigger. If that happens, raise `FRAME.wide.topH` / `FRAME.tall.topH` at the top of `js/three/creatures.js`.
Tuning hook, no effect unless called: `T3.creatureFrame('wide', { topH: 7 })` refits live.

## 4. Behaviour changes other agents may notice

- The reaching arm stretches at most 1.25x (was up to 3.8x for classic, 3x for monsters). For far cubes the creature
  shuffles along the far edge, leans over the table and, when that is not enough (cubes in the Resources rows), climbs
  part way over the table (its body lifts to clear the rim and the cubes), then eases back.
  `T3.creatureMove(id, zone, done)` still calls `done` exactly once. A move takes about 3.5-4.5 s for the farthest
  cubes (it waits, at most ~1.8 s per stage, for the hand to really reach the cube before gripping or letting go).
  `T3.creatureStats()` now also reports `err` / `fixZ` (debugging).
- `js/three/creatures/common.js`: all exports unchanged. New optional team fields for `jerseyTexture`: `numScale`,
  `numTall`, `numY` (defaults reproduce the old texture exactly). `ArmRig`'s default `maxStretch` is unchanged (3.6);
  the classic opponents now pass 1.25.
- Monster manifest (`assets/creatures/monsters/manifest.json`) gained optional per-slot fields: `fit` (size tweak),
  `fitY` (hip height offset), `lean` (resting lean, rad, negative = back), `portrait` (`{ elev, top, bottom, pitch }`
  framing for card pictures) and team `numScale` / `numTall` / `numYf` (shirt number size / stretch / height).
  Blaze's kit is now red (was white with red hoops) so his white 11 reads; the imps' scarves have no tails (they hid the number).
- `js/cards.js`: 10 new cards (base + gold for Grub, Splosh, Blaze, Hex, Zog), 34 in all. Earn rules follow the
  existing pattern (`S.beaten[i]`; gold = win without a hint). Album sections are unchanged (Team / Gold / Skill).
  Locked cards show the creature's silhouette (the existing `.sc-locked .sc-art>*` filter applied to the picture).
