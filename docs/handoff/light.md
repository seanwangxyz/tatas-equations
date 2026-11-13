# Handoff from `light`: light, sky, stadium, big screen, camera, photos

Files changed: `js/three/stadium.js`, `js/three/weather.js`, `js/three/environment.js`, `js/three/shots.js`, `js/three/orbit.js`,
`css/orbit.css`. New: `js/three/sky.js`, `js/three/lighting.js`, `js/three/bigscreen.js`, this note. Nothing else touched
(table.js, game.js, index.html, the arenas/ builders, crowd.js: unchanged). `postfx.js` unchanged (no depth of field: see
"not done").

Rule kept everywhere: at rest nothing moves. Skies, clouds, stars, the far ring and the phone lights are painted once when
the venue is built. Motion only as one calm move tied to an event (the floodlights at kick-off, a camera move), then
stillness. The table, cubes and symbols are never covered, tinted or blurred: no full-screen grade, no vignette added.

## 1. Lighting and colour per venue (before -> after)

| Look | Before | After |
|---|---|---|
| Stadium, day | sun front-left, flat blue gradient sky, empty green plane to a hard horizon | same key (shadows fall away from the seat, never on the Goal row), cool fill from the back-right; painted sky with ~20 still cumulus clouds and a soft haze band; a far ring of hills and a little town |
| Stadium, golden | warm tint only, huge orange sky glow | low warm sun raking in from the LEFT (~30 deg: long soft shadows to the right, cube tops stay lit), lavender fill from the right; sky deep blue -> rose -> peach with the sun low on the left, sunlit streak and cumulus clouds; far ring in dusty rose |
| Stadium, dusk | red sky, floodlights simply on | sun just set on the right (rose glow on that horizon, indigo overhead, first stars); the floodlights come on ONCE at kick-off (section 2) and become the key; town windows lit on the far ring |
| Stadium, night | black sky with square "pixel" stars, big white glow blobs | navy sky with round stars (one Points draw call), a moon, high dark streak clouds; pools of floodlight on the pitch (one oval per tower plus the bright table pool); a few static phone lights in the dark crowd; floodlight glows ~15% softer |
| Rain / snow / fog | grey tint | the sky, clouds and far ring go overcast / almost vanish in fog (no sun, stars or moon) |
| Night Match venue | as night above | same night look (it shares the builder) |
| Beach | flat gradient | painted sky with clouds and the sun high behind the camera, low islands on the sea horizon, the storyteller scoreboard |
| Volcano | flat purple gradient | sunset-violet sky with ember clouds and a few stars, jagged ridges far beyond the crater, the storyteller scoreboard |

Exposure and tone mapping are unchanged (Neutral, 1.0): consistency comes from the light levels. `lighting.js` places the
table's sun and fill per time of day (`placeRig`) and puts them back for every other venue (`resetRig`), so a golden match
never leaves a low sun on the beach. No light is ever added or removed after a venue is built (no shader recompiles):
the dusk floodlight key is built low and raised.

## 2. Dusk: floodlights on once, at kick-off

Built dark (lamps dark grey, no glows, no beams, pitch pools at 8%, key at 18%). When the cubes are first poured at
kick-off (`G.rolling`, or the first board change after the build), the four towers switch on one after another, 0.42 s
apart: each lamp turns white with one soft bloom of its glow (a single swell, no flicker), its beam fades in, and the pitch
pools and the key light rise with the number of towers on. About 1.9 s, then completely still. Measured: start 3.1 s after
`startMatch` (just after the versus screen), events at +0.2, +0.62, +1.04, +1.45 s.
- calm / reduced motion / hidden tab: the lights simply switch on.
- A new match in the same venue (no rebuild) switches them off again so they come on at its kick-off (`weather.js`
  `onMatchStart`). A rebuild mid-match (quality change) keeps them on (`litFor` = match number).
- Fallback: on after 9 s if no kick-off came.
- Each tower fires `window` event `tata:floodlight` `{ i, n }`: hook for a clunk (see section 7).
- Test: `T3._stadium.lights()`, `T3._stadium.lightsOn(instant)`.

## 3. The stadium as a place

- Pitch: mown stripes with a mower's sheen per stripe; a soft cross-cut (checker) from tier 3; lines painted twice (soft +
  crisp); new halfway line, penalty spots, centre spot and the penalty arcs.
- Aisles: stairs up every stand every ~9 units (light treads, yellow nosing), one merged mesh; nobody sits there (fewer
  crowd triangles, which pays for the rest).
- Ad boards: 12 original maths-pun brands ("TATA'S EQUATIONS", PI-ZZA PALACE π, SQUARE ROOT BEER √, PRIME TIME TV, FRACTION
  ACTION ½, ZERO HERO, TIMES TABLE TACOS, GO FIGURE!, PLUS PLUSH TOYS, DIVIDE & CONQUER, MINUS MARKET, COUNT ON US), each with
  its own colours and a mark, at a readable aspect (`AD_BRANDS` in stadium.js).
- Fan banner (tier 2+): his shirt name (`backName()`) and number in his kit colours, draped on the back stand a third of
  the way left (clear of the creature and the screen).
- BUG FIXED: the trophy banners were never added to the scene (a `//` comment had swallowed `rotation.set(...); g.add(bm)`).
  They now show.
- Far ring (`sky.js makeBackdrop`): hills in three hazed layers, a small town skyline in three places, trees on the near
  ridge; windows lit at dusk/night. Cut-out (alphaTest), writes depth, one draw call. Islands at the beach, ridges at the volcano.
- Sky dome (`sky.js makeSky`): a 2048x512 (1024 on small screens / low) painted texture; drawn after the solid scene with the
  depth test on, so it only costs the pixels where sky is really visible (the seat view sees none).

## 4. The big screen as a storyteller (`bigscreen.js`)

Drawn into a canvas texture only when the game calls `board(text)` (or the creature portrait / font arrives): never per frame.
- Top band: the kid (kit colours disc with his number, name, score) . SHAKE n / N with dots . the creature (portrait from
  `T3.portrait`, name, score). Three players: a third name under the shake count.
- `''` at kick-off: "SHAKE n / LET'S PLAY!" ("LAST SHAKE!" on the last); once a Goal exists, the Goal itself.
- `'GOAL\n24'`: "THE GOAL", the Goal drawn with the game's own cube faces (`T3.drawCubeFace`, his skin), "= 24".
- `NOW!` (yellow rays), `IMPOSSIBLE!` (violet), `GOOOAL!` (gold): big static moment graphics with rays and still sparkles.
- `REPLAY\n...` and `expr\n= 37  GOAL!` (replay.js): the Solution as cubes (colours from the replay's own tokens, else
  matched from the cubes on the table), "= 37" and a GOAL! badge.
- Anything else: big text (the title's "HI, NAME!"). The title (detached) gets no score band.
- Same screen on the stadium, the night venue, the beach and the volcano (venue palettes).

## 5. Camera direction (`shots.js`)

Every move is computed once, never tracks, ends exactly on the fitted seat (verified: camera-to-seat distance 0 after
each), a tap skips, refused while the player looks around, during the pour or a drag. Calm / reduced motion: the framing
cuts in, holds and cuts back; the long moves (kickoff, final) are skipped.

| Name | When (today) | Move |
|---|---|---|
| `goal` | `setGoal` (existing call) | gentle push-in along the seat's own line toward the Goal row, 20% closer (0.7 in, 0.9 hold, 0.8 out) |
| `challenge` | `challenge()` when a creature is involved (existing) | snap two-shot: the kid and the creature, the table between, seen from the side (0.3 in) |
| `win` | `endMatch`, the kid won (existing) | hero shot of the kid from over the table, head on a third, the far ring behind him |
| `lose` | `endMatch`, the creature won (existing) | the creature with room to dance, on a third |
| `kickoff` | hook (below) | establishing: starts high over the near-left corner, glides down and round onto the seat (2.8 s) |
| `final` | hook | slow crane up and back at the final whistle, a pause, then home (5 s) |
| `hero` | hook | the winner of a shake: `opts.who = 'kid' | 'opp'` |

## 6. Photo mode (`orbit.js`, `css/orbit.css`)

The camera button now opens a small row of frames; picking one takes the photo: Classic (the caption strip, as before),
Snapshot (white instant-photo frame with the date), Poster (navy and gold: TATA'S EQUATIONS, "CHAMP 2 . SNOOZY 1", the
date), Sunny (a warm golden grade with a soft vignette, on the saved picture only). `setPhotoStyle(id)` exported.
`photoCanvas(src, style)` keeps its old signature (style optional).

## 7. Hooks wanted in files I do not own (exact lines)

`js/game.js`, `startMatch` `begin`: an establishing move before the first pour. Replace
```js
if (G.tour && window.Tourney) Tourney.firstSetter(function () { newShake(); }); else newShake();
```
with
```js
var kick = function () { if (G.tour && window.Tourney) Tourney.firstSetter(function () { newShake(); }); else newShake(); }; if (!shot('kickoff', { done: kick })) kick();
```
`js/game.js`, `endShake`, after `if (window.Commentary) Commentary.say('shake', { r: r });` (hero shot of the shake winner):
```js
var heroPts = r.pts || {}, heroTop = Math.max.apply(null, idxs().map(function (i) { return heroPts[i] || 0; })); if (heroTop > 0) shot('hero', { who: (heroPts[0] || 0) === heroTop ? 'kid' : 'opp' });
```
(the replay draws its cubes on the camera, so the two can overlap: if that looks busy, call it in the replay's `done` instead.)
`js/game.js`, `endMatch`, first line after the commentary snippet (crane up at the final whistle; the win/lose shots have priority 3, final 4, so put it where it should win):
```js
setTimeout(function () { if (G) shot('final'); }, 2400);
```
Sound (whoever owns sound): one clunk per floodlight tower at dusk:
```js
window.addEventListener('tata:floodlight', function (e) { if (window.Snd && Snd.thunk) Snd.thunk(); });
```

## 8. Performance (desktop Chrome, background pane, 958-986x784-800 canvas, DPR 1, seat view, renderer.info per frame incl. shadow pass)

| | before calls / tris / ms | after |
|---|---|---|
| high, stadium t3 day | 268 / 475,770 / 8.4 | 269 / 419,776 / 6.7 |
| high, stadium t5 day | 284 / 575,950 / 7.6 | 285 / 526,570 / 6.7 |
| high, stadium t4 night | 283 / 574,954 / 7.6 | 288 / 508,620 / 8.9 |
| high, beach / volcano | 244 / 131,902 / 5.6 . 249 / 252,272 / 6.9 | 246 / 133,566 / 4.9 . 252 / 253,936 / 5.9 |
| medium, stadium t3 day | 266 / 358,944 / 6.5 | 270 / 313,280 / 6.1 |
| medium, stadium t5 day | 282 / 434,690 / 6.5 | 285 / 443,192 / 6.7 |
| medium, stadium t4 night | 283 / 429,388 / 6.4 | 288 / 383,250 / 5.7 |
| medium, beach / volcano | 244 / 124,398 / 5.1 . 249 / 198,308 / 6.5 | 246 / 126,062 / 5.0 . 252 / 199,972 / 5.0 |
| low, stadium t3 day | 216 / 208,430 / 4.9 | 219 / 190,922 / 7.0 (noise; tris lower) |
| low, stadium t5 day | 232 / 246,026 / 3.7 | 235 / 252,796 / 5.2 |
| low, stadium t4 night | 233 / 243,664 / 5.4 | 239 / 216,656 / 6.3 |
| low, beach / volcano | 187 / 94,248 / 4.7 . 196 / 131,922 / 5.6 | 189 / 95,912 / 4.7 . 199 / 133,586 / 5.0 |

+1 to +6 draw calls (sky, far ring, aisles, stars/phones at night), triangles mostly lower (the aisles remove seats), ms
within the noise of a shared background pane. Textures: +1 to +3 per venue (sky, ring, fan banner); checked for leaks:
5 rebuilds in a row keep textures and geometries flat (a leak of the sky texture was found and fixed). Idle: 360 render
calls in 5 s at rest on high (glow passes included), before 432: the loop still idles; nothing I added asks for frames at
rest (only the 2 s floodlight sequence and the camera moves).

## 9. Verified / not verified

Verified (desktop Chrome, rAF shimmed, pictures read): all four times of day on tiers 1-5, rain/snow/fog, night venue,
beach, volcano, felt/space/jungle/ocean build without errors; tall 420x820 on five venues; the dusk sequence frame by frame;
every shot started by hand, mid-shot pictures, ends on the seat; the four photo frames saved (download intercepted); the
board's GOAL / NOW! / kick-off states; no console errors; `node tests/engine.test.js`: 948 passed.

Not verified / not done: real iPad, touch, Safari (`soft-light` compositing in the Sunny frame is supported there);
depth of field in close-ups (skipped: the moves read well without it and it would cost a full-screen pass);
the hooks in section 7 were not applied; the floodlight sound was not added. Clouds are soft-edged (painted texture
magnified ~4x); they are still and read as clouds, not as crisp shapes.
