# Handoff from `stadium`: the growing stadium, and weather / time of day

Files changed: `js/three/stadium.js` (rewritten around tiers and weather), new `js/three/weather.js`, new `js/weather-sfx.js`,
this note. Not changed: `environment.js`, `arenas/*.js`, `crowd.js` (no change was needed), and none of the files I do not
own. `node tests/engine.test.js`: 379 passed.

Weather covers the two stadium venues: the main **Stadium** and the **Night Match** (always night, but rain, snow and fog
still apply). Beach and Volcano are unchanged. The tiers apply to both stadium venues, because they share one builder.

## 1. The growing stadium

**Tier rule** (`weather.js`, `stadiumTier()`):

    stadium points = level() + 2 x (number of opponents beaten)
    tier 1: 0-3   tier 2: 4-7   tier 3: 8-12   tier 4: 13-19   tier 5: 20+

Examples: a new player (level 1, nobody beaten) is on tier 1. Level 3 with Snoozy beaten is 5 points (tier 2). Level 5 with
4 beaten is 13 (tier 4). Level 7 with 7 beaten is 21 (tier 5).

| Tier | What it adds |
|---|---|
| 1 small ground | One low stand per side (back 4 rows, sides 3), about 210 fans (60% of the seats full), 4 lamp posts, a small scoreboard, short ad boards, a low wall and trees beyond the stands |
| 2 club ground | Bigger stands (6 / 5 rows), about 500 fans, floodlight poles, a medium scoreboard, full ad boards, still trees beyond |
| 3 town stadium | Big stands (8 / 7 rows), about 900 fans, floodlight towers, the big scoreboard, dugouts set into the side stands (seats in his kit colours) |
| 4 big stadium | About the old stadium: 9 rows all round, about 1,140 fans, 15-unit towers, the players' tunnel (kit-coloured arch), flags in his kit colours along the top of every stand |
| 5 arena | Two-tier stands (6 + 6 rows) closed round the back corners, a roof ring over the upper tier, four 23-unit lattice floodlight towers, a giant screen (12.6 x 4 with speaker stacks and a kit-coloured frame), a kit-colour banner along the upper-tier front ("HOME OF <NAME>" / "TATA'S EQUATIONS"), kit corner flags, about 1,380 fans on high |
| every tier | Trophy banners draped over the front rows of the back stand: one per cup won (Kick-off, Creature, Monster, Champions; "x2" when won twice) and one for the trio crowns ("3 TRIO CROWNS") |

Kit colours come from `S.kit.shirt` / `S.kit.trim` (defaults if missing). The near side of the pitch stays open at every
tier: it is where the seat camera is, and a stand there would block looking around (judgment call; "all round" = back,
both sides and the back corners).

From the seat camera you see the growth in the stand depth, the crowd, the scoreboard size, the dugouts, the tunnel,
the trophy banners and the trees (tiers 1-2). The upper tier, roof and tall towers sit above the top of the seat view
(the camera looks steeply down), so they show when looking around.

**Testing a tier:** `S.set.stadiumTier = 1..5` (then `T3.retheme()`), or the URL `?tier=1..5`.

**T3 calls:** `T3.stadiumTier()` -> 1..5. `T3.stadiumInfo()` -> `{ tier, points, level, beaten, forced, next }` (next = points
needed for the next tier, null at 5). `T3.stadiumNews()` -> the upgrade text once, '' otherwise (see 4c).

## 2. Weather and time of day

- Time: `day`, `golden` (sunset), `dusk` (floodlights coming on, beams), `night` (the night look: lit pitch, beams, a key
  light from a tower, stars). Each has its own lights, sky dome, fog and crowd shade.
- Sky: `clear`, `rain` (light: soft thin streaks, wet sheen on the pitch, darker concrete), `snow` (gently drifting flakes,
  white stands, dusted pitch, white roofs and trees), `fog` (fog starting just beyond the table so the cubes are never
  fogged, low mist banks on the stands). A **rainbow** shows on a clear day or sunset straight after a rainy match.
- Per match, deterministic: match number n (kept in `S.wx.n`) always gives the same weather. Gentle variety: the first
  match is a sunny day, never two grey matches in a row. Over 200 matches: 71% clear, 15% rain, 8.5% snow, 5.5% fog,
  rainbow 10%; day 50%, sunset 20%, dusk 16%, night 13%.
- `S.set.weather`: `'auto'` (Surprise me, the default when missing) | `'clear'` (always a clear day) | `'golden'` |
  `'dusk'` | `'night'` | `'rain'` | `'snow'` | `'fog'`. `false` = always a clear day, so no particles.
- Testing: `T3.setWeather({ time: 'dusk', sky: 'rain', rainbow: false })`, or the URL `?time=dusk&sky=rain&rainbow=1`.

**T3 calls:** `T3.matchWeather()` picks and applies the next match's weather and returns
`{ time, sky, rainbow, ambience, line, n }`. `T3.weather()` returns the weather in use (plus `particles`).
`T3.weatherLine()` returns a short line Pip could say ("A soft rain is falling. Don't worry, our table stays nice and dry!").
Applying a weather rebuilds the venue only when the built look differs (time, sky, rainbow or tier). A rebuild took
50-75 ms here; with the snippet below it happens at match start, behind the versus screen.

**Rain and snow:** one `THREE.Points` draw call each, animated in the vertex shader (no per-particle JavaScript).
- Counts: rain 1,800 / 1,000 / 450 and snow 1,400 / 800 / 350 on high / medium / auto-low.
- Drawn at a capped rate: about 20 frames a second on high, 15 on medium, 10 on auto-low. Between those frames nothing
  is drawn unless something else moves.
- Stopped completely on **Fast** (`S.set.quality === 'low'`), with `S.set.weather === false`, or when the tab is hidden.
  Not on the flat mat (that has no 3D).
- Calm: rain falls at 7 units a second (slow for rain) with a tiny sway. Snow falls at 0.65 units a second and drifts on
  9-14 s swings. Nothing flickers or jitters.
- The table stays dry and clear. No particle spawns over the table, its rim, the creature's spot or the kid's spot. In the
  shader, any particle whose line of sight from the camera lands on that area is hidden, from every camera position
  (seat, looking around, close-ups). Particles within about 3 units of the lens fade out.

**Cost (measured in desktop Chrome on this laptop, 1920x954 drawing buffer, high quality with glow):**
- JavaScript: two uniform writes per weather frame (well under 0.01 ms).
- GPU: the particles add about 1.5-2 ms (rain) and 2-3.5 ms (snow) to a full frame of about 13-15 ms. These are timer
  queries in a shared browser, so they are noisy.
- The real cost: the whole picture is redrawn about 20 times a second while it rains or snows. Idle (clear weather) was
  about 11 draws a second, the creature's ambient breathing; with rain it was about 18-19 draws a second; with Fast or
  `S.set.weather === false` it was back to about 11. Fog, the rainbow and the time of day cost nothing at idle: they are
  static.

### Ambience sound hooks (`js/weather-sfx.js`)

`WeatherSfx.set('rain' | 'wind' | 'off')` plays a very quiet loop: a steady soft hiss for rain, or a low wind that swells
very slowly (about a 14 s breath) for snow and fog. Fades over about 2 s. Honours `S.set.mute` and `S.set.sfx`, and uses
`Snd.context()` if that ever exists. Ambience names in `.ambience`: `'rain'` (rain), `'wind'` (snow, fog), `''` (clear: no
extra sound). js/sound.js was not touched.

## 3. Numbers per tier (desktop Chrome, seat camera, waiting for the Goal; "scene" = renderer.info for one frame, glow and shadow passes included)

Old stadium (HEAD before this change, same state):
- Wide: high 1185 people / crowd 492,932 tris / scene 642,770 tris / 375 calls; medium 988 / 341,512 / 430,648 / 264;
  low 790 / 167,864 / 239,452 / 214.
- Tall: high 922 / 385,184 / 542,126 / 383; medium 769 / 265,774 / 358,406 / 256; low 615 / 129,850 / 204,934 / 206.

Now, wide (1280x800):

| Tier | High: people / crowd tris / scene tris / calls | Medium | Low |
|---|---|---|---|
| 1 | 211 / 92,634 / 244,580 / 382 | 176 / 58,532 / 149,680 / 271 | 141 / 30,872 / 104,472 / 219 |
| 2 | 507 / 210,492 / 362,866 / 381 | 423 / 146,080 / 237,464 / 269 | 338 / 68,668 / 142,504 / 220 |
| 3 | 901 / 375,870 / 528,036 / 381 | 751 / 259,788 / 350,676 / 269 | 601 / 126,822 / 200,906 / 221 |
| 4 | 1142 / 474,880 / 627,516 / 386 | 952 / 329,314 / 420,672 / 274 | 762 / 161,138 / 235,692 / 226 |
| 5 | 1378 / 474,702 / 628,588 / 401 | 967 / 334,186 / 426,410 / 289 | 770 / 163,070 / 238,490 / 241 |

Tall (400x800):

| Tier | High | Medium | Low |
|---|---|---|---|
| 1 | 171 / 68,918 / 227,988 / 393 | 143 / 50,920 / 145,584 / 263 | 114 / 26,464 / 103,580 / 212 |
| 2 | 356 / 149,194 / 308,680 / 393 | 297 / 100,466 / 195,354 / 266 | 238 / 50,984 / 128,324 / 215 |
| 3 | 628 / 254,438 / 413,620 / 392 | 524 / 179,962 / 274,258 / 263 | 419 / 88,298 / 165,046 / 213 |
| 4 | 889 / 371,070 / 530,698 / 394 | 741 / 256,156 / 350,898 / 266 | 593 / 120,496 / 197,690 / 217 |
| 5 | 980 / 338,802 / 499,608 / 409 | 752 / 260,078 / 355,614 / 281 | 590 / 124,326 / 202,314 / 231 |

On every quality level and both layouts, tier 5 and tier 4 stay under the old stadium's triangle count, and tiers 1-3
are cheaper. How tier 5 fits more people: its crowd is capped at a fixed number per quality level and layout
(`T5_PEOPLE` in stadium.js), spread evenly so the empty seats are scattered. On high it uses the medium figure detail (no
shins and shoes, cuffs or thumbs, all hidden in the stands anyway). That costs about 17% fewer triangles per person, so
about 1,380 people fit where the old stadium had 1,185. Draw calls: tier 5 adds about 25 on high and medium compared
with the old stadium, mostly the trophy banners, tunnel, sky dome and kit flags. The dugouts and all the floodlight
lamps are merged meshes.

## 4. Snippets for files I do not own

### 4a. `index.html`: load the ambience sounds

After `<script src="js/sound.js"></script>` add:

```html
<script src="js/weather-sfx.js"></script>
```

### 4b. `js/game.js` `startMatch`: choose the weather, start its sound, announce a stadium upgrade

After the line `G = { mode: mode, oppIdx: oppIdx, cfg: cfg, shakes: shakes, shake: 1, setter: 0, players: [], trailed: false };`
add:

```js
  var wx = T3.matchWeather ? T3.matchWeather() : null;   // this match's time of day and weather (stadium venues; rebuilds the venue if its look changed)
```

In the same function, at the start of `var begin = function () { if (!G) return; ...`, right after the existing
`if (Snd.ambience) Snd.ambience(...);` call, add:

```js
    var stadiumMat = ['stadium', 'night'].indexOf(S.cos.mat) >= 0;
    if (window.WeatherSfx) WeatherSfx.set(stadiumMat && wx ? wx.ambience : 'off');
    var news = stadiumMat && T3.stadiumNews ? T3.stadiumNews() : '';   // once per new stadium tier
    if (news) { persist(); setTimeout(function () { if (G) say('pip', news, 'cheer'); }, 2400); }
```

(If the news line comes too close to the game's own first Pip line, show it on the results screen instead:
`T3.stadiumNews()` can be called anywhere, it only marks `S.stadiumTierSeen`. If the player is already past tier 1
when this ships, the first match announces the tier he is on. A forced tier never announces.)

Optional weather line: `if (wx && wx.line && stadiumMat) setTimeout(function () { if (G) say('pip', wx.line, 'happy'); }, 1200);`

### 4c. `js/game.js`: stop the weather sound when leaving a match

In both `ACT.reallyQuit` and `ACT.toMenu`, next to `if (Snd.ambience) Snd.ambience('off');`, add:

```js
if (window.WeatherSfx) WeatherSfx.set('off');
```

(`js/online.js` calls `Snd.ambience(...)` at two places, lines ~369 and ~661. An online match keeps whatever weather the
last local match chose. Calling `T3.matchWeather()` there is optional.)

### 4d. `js/screens.js` Settings: weather choice

In `renderSettings`, after the `3D picture quality` row, the one that ends with
`... data-act="setQuality3d" ... }).join('') + '</div></div>' : '') +`, add:

```js
    (T3.supported ? '<div class="setrow"><label>Stadium weather<br><small style="font-weight:600">Time of day and weather for stadium matches. Rain and snow stop on Fast.</small></label><div class="seg">' + [['auto', 'Surprise me'], ['clear', 'Always sunny'], ['golden', 'Sunset'], ['dusk', 'Evening'], ['night', 'Night'], ['rain', 'Rain'], ['snow', 'Snow'], ['fog', 'Fog']].map(function (q) { var cur = S.set.weather === false ? 'clear' : (S.set.weather || 'auto'); return '<button class="' + (cur === q[0] ? 'on' : '') + '" data-act="setWeatherPick" data-arg="' + q[0] + '">' + q[1] + '</button>'; }).join('') + '</div></div>' : '') +
```

and next to `ACT.setQuality3d = ...`:

```js
ACT.setWeatherPick = function (el) { S.set.weather = el.dataset.arg; persist(); Snd.click(); renderSettings(); };
```

The choice takes effect at the next match. For an instant preview add `if (T3.active && T3.active() && T3.matchWeather) T3.matchWeather();`.
Eight buttons wrap onto two lines on a phone. Trim to Surprise me / Always sunny / Night if that is too many.

### 4e. `js/config.js` save defaults (optional)

Nothing is required: a missing `S.set.weather` means 'auto'. `S.wx` (`{ n, cur }`) and `S.stadiumTierSeen` are created when
first used and saved with the rest of `S` by `persist()`. To list them, add `weather: 'auto'` to `set: { ... }` in
`defaults()`.

## 5. Camera limits (`orbit.js`): no change needed

Every new structure (upper tiers, roof, towers, tunnel, dugouts, banners, flags, trees) is an ordinary opaque mesh, so
table.js's camera ray already stops in front of it. The sky dome, the rainbow, the mist and the particles do not write
depth or are not meshes, so they never stop the camera or catch a zoom-to-point. Checked with 95 random synthetic drags
and wheel zooms (zooms aimed at random screen points) at tiers 5, 1 and 4: the camera was never inside a venue solid (inside test
with rays through every opaque venue mesh) and never below the floor. The nearest surface in the 6 axis directions was
at least 1.9 units away (tier 5), 2.3 (tier 1) and 2.7 (tier 4). The look-at box (`measureVenue`) still caps at 14 units
up; the arena's top rows are under that.

Seen while testing, not caused by this change: zooming into the middle of the table and then dragging the view down can
leave the camera lying on the felt (camera at y 0.6 looking along the cloth). That is the existing orbit and clip
behaviour; I did not touch it.

## 6. Verified and not verified

Verified in desktop Chrome (background tab, rAF shimmed), wide 1280x800 and tall 400x800:
- All 5 tiers on high, medium and low build with no errors, in both layouts. Numbers above.
- Screenshots looked at, from the seat: every tier in both layouts; every time of day (day, sunset, dusk, night) and every
  sky (clear, rain, snow, fog) on tier 5 wide; snow, rain, night fog and sunset in tall; night venue with snow;
  rainbow.
- Looking around: tiers 1, 4 and 5 (low swing toward the back stand, side swing), dusk in tall, close zoom into the
  arena's upper tier.
- Test-camera close-ups (a camera placed by script, not the orbit): the arena with rainbow, roof, towers and banners; the
  tunnel; a dugout.
- Rain and snow looked at 1:1 from the real drawing buffer: soft thin streaks and small flakes, none over the table.
- Idle draw rate with and without weather, Fast stops the particles, `S.set.weather === false` stops them.
- The weather sequence is deterministic. The tier rule and the one-time news text were checked at 8 progress points.
- Beach and volcano still build. The night venue works, with tiers and weather.

Not verified:
- No iPad or touch device. Medium quality was forced on desktop, not measured on a tablet. The extra draws while it rains
  (about 15 a second on medium) are the thing to watch there.
- The sound loops were written to the same pattern as crowd-sfx.js but not listened to (no audio in this pane).
- The game.js / screens.js / index.html snippets were not applied or run. I called `T3.matchWeather()` and
  `T3.stadiumNews()` by hand.
- Not every combination was screenshotted (for example tier 2 + fog in tall). Each look is built from the same parts,
  which were checked one by one.
- The 'goal' scoreboard close-up was not re-checked at every tier. The screen is marked (`userData.board`, `api.board`),
  so the shot finds it. At tier 5 it is larger and slightly higher.

## 7. Judgment calls

- The default stadium (a new save, clear day) is now a bright blue-sky day. The old stadium had a dark navy sky and fog.
  Dusk is the closest to the old mood.
- A new player starts on a small ground (tier 1), smaller than the old stadium. Tier 4 is about the old one.
- Trophy banners show at every tier, not only tier 5: he earned them.
- The near side of the pitch stays open (camera side).
- The arena's last upper row is left empty because the roof covers it.
- Fog starts just beyond the seat's distance to the table, so the cubes are never fogged. Far stands fade into the mist.
- Snow on a sunset match is turned into a day match (snowy sunsets looked muddy).
- Weather frames are capped at about 20 a second, not lower, so falling rain still reads as motion, not steps.
