# Handoff: bells and whistles (agent `whistles`)

Three extras: the **Goal replay**, the **commentator** and **fireworks**.

New files (owned by this branch). No existing file is changed:

| File | What it does |
|---|---|
| `js/three/replay.js` | ES module. `T3.replay(tokens, opts, done)`: the 3D replay with big cube copies |
| `js/three/fireworks.js` | ES module. `T3.fireworks(opts)`: the 3D fireworks show |
| `js/replay.js` | Classic script. `Replay` (glue, tap to skip, the flat HTML/CSS replay) and `Fireworks` (picks 3D or the flat canvas show) |
| `js/commentary.js` | Classic script. `Commentary.say(event, data)`: the caption bar, plus speech when 'Read lines aloud' is on |
| `js/fx-sfx.js` | Classic script. `FxSfx`: soft synthesised booms, rocket whooshes and a swish. Does not touch `js/sound.js` |
| `css/whistles.css` | The commentary box, the tap-to-skip layer and the flat replay |

Nothing happens until the wiring below is added. Every call is guarded with `window.X &&`, so a missing file
never breaks the game. I tested exactly these snippets in a temporary copy of the files, then reverted them.

## What each one does

### 1. Goal replay (`S.set.replay !== false`)
- When a shake ends with a correct Solution, the replay plays before the result pop-up. It shows the kid's
  Solution if it was correct, otherwise any correct one (a creature's, a Third Party's).
- **3D table:** copies of the real cubes (same mesh and material, so the real colours, symbols and skin) lift
  off their places. They fly together into one row in the middle of the picture, left to right, with the
  parentheses popping in. They sit on a dark "↻ REPLAY" band. Each cube lands with `Snd.thunk()` and a small
  squash. A running value under the row counts up as the Solution is read left to right (open parentheses are
  closed and a trailing operator is ignored, so `(5+2)×6−5` reads 5, 5, 7, 7, 7, 42, 42, 37). Then
  "= 37 GOAL!" flashes in gold, the crowd cheers once (`crowdReact('cheer')`), there are flashbulbs
  (`T3.fx('flash')`) and a chime. The stadium board shows `REPLAY`, then the Solution as it builds, then
  `(5+2)×6−5` / `= 37  GOAL!`. That text stays on the board until `newShake()` clears it.
  It lasts 3.1 to 3.9 s depending on length. The copies are children of the camera, drawn on top of
  everything, so a close-up or the player looking around can't lose them. The real cubes are never touched.
- **Skip:** a transparent layer covers the screen while it plays. Any tap (a `click`, so the tap can't fall
  through to the Menu button underneath) or Space/Enter/Escape ends it at once. A small "Tap to skip" pill
  shows at the bottom.
- **Safety:** `done` is called exactly once (guarded). There is a 6.5 s safety timeout in the glue and a 7 s one
  in the module. If the 3D replay can't start (flat mat, page hidden, another screen, an error), `done` is
  called straight away. The replay is skipped in the tutorial.
- **Flat mat:** no wait at all. The result pop-up gets a small replay strip instead: the cubes fly in one by
  one (CSS, plays once), then "= 37 GOAL!" pops. A thunk plays as each cube lands and one chime and cheer at
  GOAL, driven by `animationend` and `animationstart` so the timing matches. A tap shows the end at once.
  With `prefers-reduced-motion` it shows still, with no sounds.

### 2. Commentator (`S.set.commentary !== false`)
- One short line in a small "LIVE" caption pill under the scores (it moves to the bottom edge while a pop-up is
  open), for about 4.3 s, sliding in once.
- If `S.set.voice === true`, the line is also spoken (`Snd.speak(line, 'owl')`, a calmer, lower voice), but
  **never over Pip**. `say()` is watched (wrapped once at load), so the commentator waits until 1.2 s after
  the last `say()` and until `speechSynthesis` is quiet. If Pip keeps talking for 4.5 s, the spoken line is
  dropped (the caption still shows). Pip's next line cuts the commentator off, never the other way round.
- **Rate limit:** at most one line every 6 s. `final` (or `force: true`) may come 2.5 s after the previous
  line. No line repeats twice in a row for the same moment. Off in the tutorial and outside the game screen.
- **Moments and lines:** kick-off (10 lines), Goal set (10, plus 8 for a 4+ cube Goal), clever move (9),
  NOW! (9), IMPOSSIBLE! (8), correct Solution (12), a wrong Solution (10, all encouraging: "So close! That was
  a brave try from Champ."), comeback (9), last shake (8), final whistle: win (8), tie (8), other (8, never
  "you lost", e.g. "That's the match! Champ will be back even stronger."). All lines are original. There are
  no real commentators' names or catchphrases (I left out "back of the net" because it's a TV character's
  catchphrase). All lines are in `Commentary.LINES` if you want to edit them.

### 3. Fireworks (`S.set.fireworks !== false`)
- `Fireworks.show(opts)` returns `'3d'`, `'flat'` or `''`.
  - **3D** (the 3D table is on the game screen and no pop-up is open): `T3.fireworks`. 6 rockets by default
    (`rockets: 7` in the snippets), 3 with reduced motion, 4 on low quality. They launch 0.15 to 2.75 s apart.
    Each rises for about 1 s with a short trail, then bursts into a sphere of sparks: white-hot first, then its
    colour, then a little sparkle as it fades and falls. Each burst tints the table's HemisphereLight toward
    its colour for a moment, which lights the stands. No new lights are added, so no shader recompiles, and the
    colour is restored exactly. The whole show lasts about 5 to 5.5 s.
  - Where the bursts go: the seat camera looks steeply down (about 58°), so there is **no sky in the picture**.
    The bursts go off in the air over the front of the back stand, high enough to clear the table, in the upper
    part of the picture, mostly off-centre so the creature doesn't hide them.
  - GPU-cheap: one `THREE.Points` (one draw call) holds every spark, rocket and trail. It uses additive
    blending and a 64 px soft-dot texture, with about 2,400 points for 7 rockets on high quality. Positions are
    updated on the CPU.
  - **When it ends, it ends.** The points leave the scene and are disposed, the frame hook is removed and the
    light is restored. A safety timer forces the same cleanup. Nothing loops.
  - **Flat:** `FX.fireworks()` from `js/fx.js` (the existing canvas fireworks, above pop-ups) with soft booms
    timed to its bursts. One flat show at a time.
  - **Sound** (`js/fx-sfx.js`): each boom is a soft low sine thump (95→40 Hz), muffled noise and a few faint
    crackles. Each launch is a quiet band-passed "fwhhh". The chain ends in a 3.8 kHz low-pass and a soft
    compressor. It honours `S.set.mute` and `S.set.sfx`. It uses its own AudioContext (like
    `js/crowd-sfx.js`), unlocked by the first tap.

## Wiring

### `index.html`

After `<link rel="stylesheet" href="css/online.css">`:
```html
<link rel="stylesheet" href="css/whistles.css">
```
After `<script src="js/crowd-sfx.js"></script>`:
```html
<script src="js/fx-sfx.js"></script>
```
After `<script src="js/game.js"></script>`. `commentary.js` must come **after** `game.js`, because it wraps the
global `say()` to know when Pip last spoke:
```html
<script src="js/commentary.js"></script>
<script src="js/replay.js"></script>
```
After `<script type="module" src="js/three/player.js"></script>` (anywhere after `table.js`; both also wait
up to 6 s for `T3.ctx`):
```html
<script type="module" src="js/three/replay.js"></script>
<script type="module" src="js/three/fireworks.js"></script>
```

### `js/game.js`: replay (in `endShake`)

**a)** A slot for the flat replay. In the result `html`, replace
```js
    '<div style="text-align:center;font-size:18px">Goal: <b>' + (G.goal ? Eq.fmt(G.goal) : '?') + '</b></div>' +
```
with
```js
    '<div style="text-align:center;font-size:18px">Goal: <b>' + (G.goal ? Eq.fmt(G.goal) : '?') + '</b></div><!--replay-->' +
```
**b)** Play the replay before the pop-up. Replace the last line of `endShake`:
```js
  setTimeout(function () { modal(html, function () { drainQueue(nextShake); }); }, 700);
```
with
```js
  var showResult = function () {
    if (!G) return;
    var rp = window.Replay ? Replay.popupHTML(r) : '';
    modal(rp ? html.replace('<!--replay-->', rp) : html, function () { drainQueue(nextShake); });
  };
  if (window.Commentary) Commentary.say('shake', { r: r });
  if (window.Replay) Replay.play(r, function () { setTimeout(showResult, 300); }); else setTimeout(showResult, 700);
```
(`Replay.popupHTML(r)` must be called after `Replay.play(r)` has decided, which is why it sits inside
`showResult`. Without a correct Solution, `done` comes straight away, so the pop-up opens after 300 ms instead
of 700.)

### `js/game.js`: commentator call sites

1. **Kick-off.** In `startMatch`, inside `var begin = function () {…}`, change
   ```js
   creaturesEnter(); setTimeout(function () { if (G) playerMood('wave'); }, 500); newShake();
   ```
   to
   ```js
   creaturesEnter(); setTimeout(function () { if (G) playerMood('wave'); }, 500); newShake(); if (window.Commentary) Commentary.say('kickoff');
   ```
2. **A Goal is set.** In `setGoal`, after the line
   ```js
     Snd.thunk(); Snd.chime(); board('GOAL' + String.fromCharCode(10) + Eq.fmt(val)); shot('goal'); crowdSay(tokens.filter(function (t) { return typeof t === 'object'; }).length >= 4 ? 'ooh' : 'cheer');
   ```
   add
   ```js
     if (window.Commentary) Commentary.say('goal', { goal: Eq.fmt(val), by: G.players[G.setter].name, cubes: tokens.filter(function (t) { return typeof t === 'object'; }).length });
   ```
3. **A clever move** (a creature's "liked" move, `G.clever`). In `placeCube`, before
   ```js
     crowdSay(G.clever ? 'ooh' : 'clap'); G.clever = false;
   ```
   add
   ```js
     if (G.clever && window.Commentary) Commentary.say('clever', { by: G.players[who].name });
   ```
4. **A challenge.** In `challenge()`, after
   ```js
     banner(kind === 'now' ? '⚡ NOW!' : '🚫 IMPOSSIBLE!', cname + ' challenges!');
   ```
   add
   ```js
     if (window.Commentary) Commentary.say('challenge', { kind: kind, by: cname });
   ```
5. **Correct Solution / a wrong one / comeback.** This is the `Commentary.say('shake', { r: r })` line in the
   `endShake` snippet above. It picks one line: a comeback if the kid was behind before this shake and is
   alone in front now, else a correct Solution (the kid's first), else the encouraging line for a wrong one.
6. **Match point (the last shake).** In `nextShake()`, after
   ```js
     G.shake++; G.setter = nextP(G.setter); newShake();
   ```
   add
   ```js
     if (G.shake === G.shakes && G.shakes > 1 && window.Commentary) Commentary.say('matchpoint');
   ```
7. **Final whistle.** At the top of `endMatch()`, before
   ```js
     if (G.team) { Team.endMatch(); return; } // team celebration naming both teammates (js/team.js)
   ```
   add
   ```js
     if (window.Commentary) { var cmTop = Math.max.apply(null, G.players.map(function (p) { return p.score; })), cmN = G.players.filter(function (p) { return p.score === cmTop; }).length, cmMe = G.players[0].score === cmTop; Commentary.say('final', { won: cmMe && cmN === 1, tie: cmMe && cmN > 1 }); }
   ```
8. *(Optional)* In `ACT.reallyQuit` and `ACT.toMenu` add `if (window.Commentary) Commentary.hide();`. The caption
   hides itself after 4.3 s anyway.

### Fireworks call sites

**`js/game.js` `endMatch()`** covers a Cup final won, a league boss beaten for the first time, and a Three at
the table crown. Replace the last three lines of `endMatch`:
```js
  html += cupRow || '<div class="row" style="margin-top:12px"><button class="btn green" data-act="rematch">Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Menu</button></div>';
  modal(html, null);
  if (window.Review) Review.afterMatch(); // REVIEW: thinks at most ~1.5 s, in small slices
```
with
```js
  html += cupRow || '<div class="row" style="margin-top:12px"><button class="btn green" data-act="rematch">Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Menu</button></div>';
  // FIREWORKS (js/replay.js): a Cup final won, a league boss beaten for the first time, a Three-at-the-table crown
  var bigWin = (G.mode === 'ai' && won && ((first && (idx + 1) % LEAGUE === 0) || /data-act="cupLift"/.test(cupRow))) || (G.mode === 'ai3' && G.trioCrown);
  var fw = bigWin && window.Fireworks ? Fireworks.show({ rockets: 7 }) : '';
  var showEnd = function () { modal(html, null); if (window.Review) Review.afterMatch(); }; // REVIEW: thinks at most ~1.5 s, in small slices
  if (fw === '3d') setTimeout(function () { if (G) showEnd(); }, 2600); else showEnd();
```
- `first` and `idx` are the existing `var`s of the `G.mode === 'ai'` branch (hoisted, `undefined` otherwise).
  The league bosses are opponents 4 and 9 (`(idx + 1) % LEAGUE === 0`). `cupRow` contains `data-act="cupLift"`
  only when the cup final was just won (see `Cup.onMatchEnd`).
- The results pop-up waits 2.6 s when the 3D show runs, because the pop-up's dim, blurred backdrop would
  otherwise hide most of it. The show carries on behind the pop-up for its last ~3 s. Drop the delay if you
  prefer (use `showEnd();` alone). The show is then mostly behind the backdrop.

**`js/trio.js` `onMatchEnd(soleWin)`.** After
```js
      S.trios[k] = true;
```
add
```js
      G.trioCrown = first && isSet;   // FIREWORKS: endMatch fires them for a new crown
```
(Trio.onMatchEnd runs inside endMatch, before the bigWin line above.)

**`js/cup.js`.** Nothing is needed: the final is caught in `endMatch` (3D). If you also want a flat show on the
trophy-lift screen, add `if (window.Fireworks) Fireworks.show({ flat: true });` at the end of `celebrate()`.
I did not, because two shows for one cup felt like too much.

**A level-up to a new operations stage: `js/progress.js` `showUnlock()`.** This file is not in either list,
but it is where the stage unlock is shown. Change
```js
  Snd.fanfare(); FX.confetti(180);
```
to
```js
  Snd.fanfare(); FX.confetti(180); if (window.Fireworks) Fireworks.show();
```
A pop-up is open there, so it is the flat canvas show (above the pop-up) with soft booms.

### `js/screens.js`: Settings rows
In `renderSettings`, in the list of toggle rows, change
```js
['crowd', 'Crowd reactions (claps, cheers, oohs)', true]]
```
to
```js
['crowd', 'Crowd reactions (claps, cheers, oohs)', true], ['replay', 'Goal replays (the Solution flies together)', true], ['commentary', 'Commentator (one line on the big moments)', true], ['fireworks', 'Fireworks on big wins', true]]
```
(`ACT.toggleSet` with `data-def="1"` already handles them. I tested it: on → off → on.)

### `js/config.js`: save defaults
In `defaults()`, change
```js
    set: { music: 0.35, sfx: 0.8, mute: false, shakes: 3, three: true, voice: false, gloat: true, trash: true, bluff: false, avatar: true, variations: true },
```
to
```js
    set: { music: 0.35, sfx: 0.8, mute: false, shakes: 3, three: true, voice: false, gloat: true, trash: true, bluff: false, avatar: true, variations: true, replay: true, commentary: true, fireworks: true },
```
(Optional: the code treats a missing value as on.)

## APIs (for later)
- `Replay.play(r, done)`, `Replay.popupHTML(r)`, `Replay.pick(r)`, `Replay.active()`
- `T3.replay(tokens, {goal, cubes, fractions, wild}, done)` returns `{skip()}` or `null` (null: `done` is not
  called). `T3.replayActive()`
- `Fireworks.show({rockets, flat})` returns `'3d' | 'flat' | ''`. `T3.fireworks({rockets, colors, done})`
  returns a bool. `T3.fireworksActive()`
- `Commentary.say(event, data)` returns the line or `''`. `Commentary.hide()`, `Commentary.LINES`
- `FxSfx.boom({delay, size, pan})`, `FxSfx.launch({delay, pan})`, `FxSfx.swish({delay})`, `FxSfx.level()`,
  `FxSfx._offline(kind, sec)` returns a Promise of `{peak, rms, sec}`

## What I checked (Chrome, desktop, port 3498; 3D stadium, day theme)
- `node tests/engine.test.js`: 379 passed.
- 3D replay: frozen-time screenshots at 0.75 s, 1.25 s and 2.6 s show the cubes lifting from Resources, the
  row with parentheses, the running value, "= 13 GOAL!" and the board. A real `endShake` puts the pop-up at
  4.29 s. A real click on the skip layer at 0.75 s puts the pop-up at 1.05 s, with no Menu click falling
  through. Afterwards the frame hooks are back to their old count and the camera's children are back to just
  the vignette. Also checked: a real `resolveChallenge` (Impossible!, the creature's Solution), a 768×1024
  viewport, `done` called once when the replay is off, when there is no correct Solution, and when
  `T3.replay` throws.
- Flat: the pop-up opens at 329 ms with the replay strip. With the animations forced on there are 7 thunks and
  1 chime. Reduced motion shows it still.
- Fireworks 3D: screenshots show bursts over the back stand. A real-time show ends at 5.6 s (reduced-motion run).
  The light colour is the same before and after (it is tinted mid-show), no Points are left in the scene and
  the hook is removed. `endMatch` against a first-time league boss starts the 3D show, says "Peep, peep, peep!
  Victory for Champ!", and opens the pop-up at 2.63 s. Flat: `'flat'` when a pop-up is open, and only one at
  a time. The setting turns it off.
- Commentator: lines show, the rate limit drops a second line within 6 s, `final` passes after 2.5 s, the
  setting turns it off, and (with a stubbed `Snd.speak`) speech waits until 1.4 s after Pip's `say()`.
- Sound, measured offline with an OfflineAudioContext at full volume, before the sfx volume: a boom peaks at
  0.49–0.51 and lasts about 1.1–1.2 s. I lowered the boom levels by about 25% after this measurement and did
  not measure again. A launch peaks at 0.05 and the swish at 0.05. Muted means nothing plays. **I could not
  listen to any of it.**

## Not checked
- An iPad, Safari, touch input, real speech timing, and how loud it is next to the music.
- Full-motion fireworks in real time: this browser reports `prefers-reduced-motion`, so the real-time show used
  3 rockets. The full 7-rocket look was only checked with frozen-time screenshots.
- The tall (portrait) table layout: the 768×1024 test still used the wide layout. The code doesn't depend on
  the layout (camera-relative row; bursts placed from camera rays), but I didn't see it.
- The night stadium, beach and volcano themes. The code finds the HemisphereLight in any venue.
