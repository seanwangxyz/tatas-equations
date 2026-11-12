# Handoff from `collect`: Season Table, 3D Trophy Cabinet, Spot the Fan

New files (mine): `js/season.js`, `css/season.css`, `js/cabinet.js`, `js/three/cabinet.js`, `css/cabinet.css`,
`js/fans.js`, `css/fans.css`, this note. Additive, clearly marked `COLLECT` blocks in `js/three/crowd.js` and
`js/three/table.js`. A marked `SEASON TABLE` block in `tests/engine.test.js` (just before the summary lines).
Nothing else was touched. `node tests/engine.test.js`: **412 passed** (379 before + 33 season checks).

Everything is inert until wired with the snippets below, and every call is guarded (`window.Season &&` etc.).

---

## 1. What each feature does

### Season Table (`js/season.js`, `css/season.css`, screen `#season`)

- Two tables: **Classic League** (Snoozy … Mondo) and **Monster League** (Grub … King Messy). Each row: position,
  team (avatar + name; the kid's row shows his shirt number and is highlighted), P, W, D, L, **For / Agst = shake
  points**, Pts, **Last 5** form chips (win green, tie blue-grey, loss light grey: never red).
- His one-on-one match against a creature (also a Cup round) is a fixture: **win 3, tie 1, loss 0**, for both sides.
- After each of his fixtures the creatures play **one round** of their own round robin (2 fixtures, one creature
  rests), simulated from their stars, so the table moves after every match of his.
- **Season = he plays every creature of that league twice (10 fixtures).** Then a season-end ceremony (podium of the
  top 3, his place, a pennant, XP) and the next season starts at once. Every place gets a pennant and XP.
- "Your fixtures" cards show two dots per creature (played / not yet), "Tap to play" (uses the existing
  `ACT.playOpp`), or "Unlock first". A "How does the season work?" box explains it in kid words. "My pennants" lists
  finished seasons.
- Match-end line (one sentence, always kind) + a **Table** button that shows the table in a pop-up on top of the
  match-end pop-up (which comes back as it was when closed) and, when a season just ended, a **Season ceremony**
  button (same: the match-end pop-up comes back afterwards). Examples:
  - `📊 +3 points, you moved up to 2nd! 6 fixtures left this season.`
  - `📊 +1 point, you are 4th in the Classic League. 3 fixtures left this season.`
  - `📊 Fixture played, you are top of the table! …`
  - `🤝 Friendly match: you already played Penny twice this season. Play another creature for your next Classic League fixture.`
  - `🏁 Season 2 is over: you finished 1st in the Classic League! You won the league!`
- If he opens the Season screen while a ceremony is waiting, it shows itself there too.

### 3D Trophy Cabinet (`js/cabinet.js`, `js/three/cabinet.js`, `css/cabinet.css`, screen `#cabinet`)

- A small warm room. **Back wall:** a wooden cabinet, top shelf the **4 Cups** (lathe-turned trophies in each cup's
  own `metal` colours from `js/cup.js`, its ribbon colour on the stem, name plate on a black plinth, "x2" badge when
  won more than once); middle shelf **9 crowns** (one per `Trio.list()` pair; classic pairs gold on red, monster
  pairs gold on purple, the boss pair Mondo + Messy silver-white on navy with pale gems); bottom shelf **10 plaques**,
  one per creature beaten (the creature's 3D portrait via `T3.portrait` when it can make one, else its emoji; the two
  league bosses get a gold frame and "BOSS BEATEN!"). **Left wall:** every badge as a medal (bronze / silver / gold /
  special rows, emoji face, tier ribbon). **Right wall:** season pennants, newest first (up to 24 shown), plus one
  empty place for the season in progress of each league.
- Not won yet = the same shape, see-through, with a soft white outline. No "locked" stamps, no counts of what is missing
  on the item itself; the story says how to win it.
- Drag (mouse or one finger) turns the view (yaw ±66°, a little up/down), wheel / pinch zooms. **Tap an item: a story
  card slides up and that item makes ONE slow turn (2.6 s, eased) and stops facing front.** Nothing else moves, ever.
  It only draws when something changed (measured: 2-6 frames to open, ~80 frames for a turn, then 0).
- Procedural only: lathe / torus / cone / box / shape geometry, canvas textures for text and emoji, environment
  lighting from three's `RoomEnvironment` (code, no download). Glossy physical metal (metalness 1, roughness ~0.2,
  clearcoat). About 490 draw calls / 39k triangles, drawn on demand only.
- **Own renderer:** `js/three/cabinet.js` is loaded with a dynamic `import()` the first time the screen opens (so no
  script tag), makes its own `WebGLRenderer`, and on leaving disposes every geometry, material, texture, the PMREM
  target, the renderer, forces context loss and removes the canvas. Leaving by Back, or by any other `go(...)`
  (a `MutationObserver` on `#cabinet` watches the `on` class) both dispose. The match renderer is never touched.
- **2D fallback** (same items, same stories, as shelves of tiles with dashed outlines for empty places) when
  `S.set.three === false`, `T3.supported` is false, or the module fails to load. A small "Show as a list / Show in 3D"
  switch sits under the picture.

### Spot the Fan (`js/fans.js`, `css/fans.css`, screen `#fans`; COLLECT blocks in crowd.js and table.js)

- 13 characters: Astronaut, Chef, Knight, Skeleton, Robot, Superhero, Wolf / Bear / Cat Mascot (the mascot is counted
  per animal), Wizard, Firefighter, Police Officer, Builder.
- In a match, he zooms in on the stands and taps a costumed fan: toast "FAN SPOTTED! You found the Chef! 5 of 13",
  that fan waves once (right arm up, three waves, down, 1.9 s, then exactly back to the rest pose), +15 XP the first
  time. Tapping a found one again: "HI AGAIN! The Chef waves at you!" (and a wave). Found before but first time at
  this venue: "NEW PLACE! The Chef is at the Beach too!".
- Album: "5 of 13 found" + a bar; found = the character's emoji on a gold disc + "Seen at: Stadium, Beach"; not found =
  a grey silhouette of the emoji + a gentle hint ("Wears a tall white hat."). Tapping a card opens it big.
- Deterministic: the crowd is dressed from a fixed seed per venue (stadium and night share the stadium seed 2024,
  beach 717), so the same characters sit in the same seats every time on the same device / quality tier.
  Measured at medium quality in the stadium: 72 characters, every one of the 13 kinds present (2 to 14 of each).
  The beach has about one or two (only hero, mascot, robot, astronaut are dressed there); the volcano crowd is
  monsters, so no characters there.

---

## 2. Snippets for the lead

### index.html

After `<link rel="stylesheet" href="css/online.css">`:

```html
<link rel="stylesheet" href="css/season.css">
<link rel="stylesheet" href="css/cabinet.css">
<link rel="stylesheet" href="css/fans.css">
```

After `<section id="gift" class="screen"></section>`:

```html
<section id="season" class="screen"></section>
<section id="cabinet" class="screen"></section>
<section id="fans" class="screen"></section>
```

After `<script src="js/kit.js"></script>` (needs ACT, modal, esc, ico, avatarHTML, oppOpen, addXP; Cup / Trio are read
when the cabinet opens):

```html
<script src="js/season.js"></script>
<script src="js/cabinet.js"></script>
<script src="js/fans.js"></script>
```

No module tag: `js/three/cabinet.js` is imported on demand by `js/cabinet.js`; the crowd/table hooks live in files
that already load. `fans.js` registers its tap hook on `DOMContentLoaded` (module scripts have run by then).

### js/game.js: the endMatch hook

In `endMatch()`, in the `if (G.mode === 'ai') {` branch, right BEFORE

```js
    checkBadges({ type: 'match', won: won, trailed: G.trailed, perfect: perfect, oppIdx: G.oppIdx });
```

add

```js
    var seasonRes = window.Season ? Season.onMatch({ oppIdx: idx, you: a, them: b, won: won, tie: tie, mode: window.Cup && Cup.active() ? 'cup' : 'ai' }) : null;
```

(before checkBadges so the season XP shows in the XP list of this pop-up, and a season card, see 2.6, can be earned in
the same match). Then in the `html = …` concatenation of that branch, change the XP line

```js
      (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '');
```

to

```js
      (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '') +
      (seasonRes ? Season.lineHTML(seasonRes) : '');
```

Team-up (`G.team`) returns earlier and Three at the table / people modes are the `else` branch, so they never count
(Season.onMatch also refuses any other `mode`). Cup rounds count: `Cup.active()` is still true at that point
(Cup.onMatchEnd runs later in endMatch).

### js/ui.js: title menu button

In `gotoTitle()`, after

```js
    '<button class="btn big purple" data-act="trophies">' + ico('trophy') + ' Trophy Room</button>' +
```

add

```js
    (window.Season ? Season.buttonHTML('big pink') : '') +
```

### js/screens.js: Trophy Room buttons

In `renderTrophies()`, right after the `html` line that ends with `…xpBarHTML() + '<div class="big">' + n + '<small>of ' + BADGES.length + ' badges</small></div></div>';`, add

```js
  html += '<div class="row" style="justify-content:flex-start;margin:10px 0 2px">' +
    (window.Cabinet ? Cabinet.buttonHTML('purple') : '') + (window.Fans ? Fans.buttonHTML('green') : '') + (window.Season ? Season.buttonHTML('blue') : '') + '</div>';
```

Back buttons return to where the screen was opened from (Trophy Room or title).

### js/config.js: save defaults (optional)

Both are created and repaired lazily (`Season.state()`, `Fans.state()`), so nothing is required. If you want them
visible in `defaults()`, add after the `kit: {...}` entry:

```js
    , season: null, fans: { v: 1, k: {} }
```

(`merge()` replaces `null` with the saved object.) "Reset everything" (`S = defaults()`) clears both, as expected.

### 2.6 Optional: a "Season Star" card (js/cards.js, not mine)

The brief mentioned a sticker reward. Cards are a fixed list, so I did not add one. If wanted, after the
`skill('s-record', …)` line:

```js
  skill('s-season', 'Season Star', 'trophy', '#d0ebff', '1', 'Champion', [['Stamina', 95], ['Heart', 97], ['Glory', 92]], 'Finish a league season in the top 3.', function () { var w = (sget().season || {}).won || {}; return (w.gold || 0) + (w.silver || 0) + (w.bronze || 0) >= 1; });
```

---

## 3. Save shapes and caps

```text
S.season = { v: 1, last: 'c' | 'm',
  c: League, m: League,                          // the season in progress of each league
  hist: [{ lg, n, place, pts, w, d, l, f, a, date }],   // finished seasons, newest last, capped at 40 (oldest dropped)
  won: { gold, silver, bronze, blue },           // pennants for life: only ever go up (not affected by the hist cap)
  cer: null | { lg, n, place, pts, xp, kind, top: [[oppIdx or -1 for him, pts] x6] } }   // ceremony waiting
League = { n, seed, t: [[P,W,D,L,F,A] x6], f: ['WDL…' x6, at most 5 chars], pl: [his games vs each creature x5],
           k: his fixtures (0..10), sim: creature fixtures played (0..20), last: small summary of the last match }
```
Row 0 is the kid, rows 1..5 the creatures in OPPONENTS order. About 0.5 KB per league plus ~60 bytes per finished
season (max 40 kept): under 3 KB in all.

```text
S.fans = { v: 1, k: { <kind>: { d: 'YYYY-MM-DD', at: ['stadium', 'night', 'beach'] (at most 4) } } }   // at most 13 keys
```

---

## 4. Rules I invented (please check)

Season:
1. A season = **2 counted fixtures against each of the 5 creatures of a league (10)**; leagues are separate.
2. A **third match against the same creature in one season is a friendly**: XP, badges, unlocks, cups all as usual,
   only the table does not change (the line says so, kindly, and suggests another creature).
3. **Cup rounds count** as fixtures; Team-up, Three at the table, people and online games do not.
4. Locked creatures' fixtures simply wait until they are unlocked (the season can only end once he has played all 10).
   If he is stuck on the first creature, the season just pauses; nothing is lost.
5. Creature fixtures: a **double round robin in 10 rounds** (circle method, one creature rests each round); **one
   round is played after each of his counted fixtures**. Everyone ends the season on 10 games.
6. Simulated score: each shake goes to one side with chance `1 / (1 + e^(-0.55 x (starsA - starsB)))` (fire adds
   0.6 star: Hex +0.6, King Messy +1.2) and is worth 2, 4 or 6 shake points (50 / 30 / 20 %). Shakes per simulated
   match = his own shakes-per-match setting. Fully deterministic from the season seed (`hash('season', league, n)`).
   A 5-star creature beats a 1-star one about 85-90 % of the time (tested: more than 1500 of 2000, and not always).
7. Order: points, then shake-point difference, then shake points scored; **a full tie lists the kid above**.
8. Rewards by final place: **1st 150 XP + gold pennant "Champions!", 2nd 100 XP + silver, 3rd 75 XP + bronze,
   4th-6th 50 XP + blue "Season finished!" pennant.** No place is ever called last; the ceremony never says "6th of 6".
9. The **new season starts immediately** after the 10th fixture (the ceremony just shows the result), so the state
   is never in limbo. Everyone starts on 0 again; nothing he won goes away.
10. Losses are shown in form as a soft grey "L" chip, never red.

Cabinet:
11. A plaque per creature beaten (`S.beaten`); "boss" = Mondo (4) and King Messy (9).
12. Medals = all of `BADGES`, earned ones show their emoji and date; unearned ones are outlined and their story is
    the badge's own "How to earn" hint.
13. Up to 24 pennants are shown on the wall (all are in the Season screen list and the 2D view).

Spot the Fan:
14. **"Zoomed in" = the tapped fan's body looks at least 18 px in radius** (from the seat on a 1280x800 laptop they are
    9-14 px, so a couple of wheel notches or a small pinch does it; tablets and phones need a bit more zoom).
    A tap on a character that is still too small shows, **once per session**, "PSST! Someone in a costume is sitting
    there. Zoom in closer on the stands to see who it is!". Taps on ordinary fans do nothing.
15. +15 XP the first time each character is spotted (not again). The "seen at" list keeps at most 4 venues.
16. Only the fan in front is picked (every fan's sphere is tested, the nearest wins), so a character hidden behind
    another fan cannot be collected through them.

---

## 5. The new crowd / table APIs (COLLECT blocks)

`js/three/crowd.js` (all inside `// ---- COLLECT (spot the fan) block ---- … // ---- end COLLECT block ----`):
- `CHAR_KINDS` (exported) and `p.charKind` set inside `character()` (the mascot as its animal).
- `DUR.hi` and a `'hi'` case in the reaction switch: one fan waves once. (Side effect to know: `T3.crowd('hi')` would
  now be accepted as a mass reaction like the others; nothing calls it.)
- On the crowd object: `chars()` → `[{i, kind}]`, `pick(ray)` → nearest fan whose body sphere (centre 0.55 x size above
  the seat, radius 0.45 x size) the world-space `THREE.Ray` passes through: `{i, kind|null, t, r, center}`;
  `where(i)` → `{center, r}`; `waveOne(i)`.
- On `window.T3` (the venue on the table now): `T3.crowdChars()`, `T3.crowdPick(ray)`, `T3.crowdWhere(i)`,
  `T3.crowdWave(i)` (kicks the render loop), `T3.crowdKinds`.

`js/three/table.js`: `hooks.tap = []` next to the other hooks, and at the very end of the `pointerup` handler, after
the zone tap: when the tap hit no cube and no zone, was not a drag / orbit / pinch / pan, and was the primary button,
each `ctx.hooks.tap` function gets `(ray, { x, y, w, h, camera })` (a copy of the pointer ray, canvas-relative
position and size). All existing paths return before it, so existing behaviour is unchanged.

---

## 6. Verified / not verified

Verified (browser pane, my own tab, port 3500, a scratch copy of index.html + a scratch wiring script, both deleted):
- `node tests/engine.test.js`: 412 passed, 0 failed. Season block: points both sides, ties, forms, friendlies, sums
  of shake points, deterministic simulation (same seed same score, 2/4/6 steps, strength matters), identical tables
  for identical matches, the round-robin balance, a full season rollover (archive, place, XP, ceremony, reset to 0),
  46 seasons with the pennant counts never going down and the history cap at 40, tie-breaks, repair of a broken save,
  non-counting modes.
- Real `endMatch` (with the snippet wired in the scratch copy): the line, the Table pop-up over the match-end pop-up
  and back, a season ending on the last fixture with "+150 XP · Classic League season 2: 1st place!" in the XP list,
  the ceremony button, the ceremony pop-up (podium, pennant) and the match-end pop-up coming back without the button.
- Season screen at 1280x800, 1024x768 and 390x844 (on the phone P is hidden; For/Agst hidden under 560 px; form stays).
- Cabinet 3D at 1280x800, 1024x768 and 390x844 (narrow screens stand further back): picking (cups, crowns, plaques),
  the story card, one turn that stops (drawing stops afterwards), drag with synthetic mouse and touch pointers,
  open/close three times with no canvas left and the context lost each time, the match renderer's context still fine,
  plaque portraits from `T3.portrait`. 2D fallback with `S.set.three = false` at 1024x768 (tiles, empty outlines, story).
- Spot the Fan, stadium at medium quality: 72 characters, all 13 kinds; a tap from the seat on the biggest one (11.7 px)
  gave only the hint toast; after zooming with wheel events at it, a real dispatched pointer tap went through
  table.js → hooks.tap → Fans: toast, +15 XP, saved `{builder: {at: ['stadium']}}`; tapping again → "HI AGAIN!".
  The wave changes that fan's instance matrices (max change 1.85) and afterwards every crowd matrix is exactly the rest
  pose again (difference 0) with `busy()` false. Album at 1024x768 (found, silhouettes, hints, "Seen at: Beach, Stadium").
- No console errors.

Not verified:
- **I did not get a clear screenshot of the wave itself** (the fan I zoomed to sat half behind the row in front);
  it is verified only by the numbers above. Worth one look in the real game.
- Real iPad / phone touch (pinch zoom in the cabinet, two-finger zoom in the stadium, then tap); Safari WebGL; the
  cabinet's look on an actual iPad GPU (490 draw calls, only while something moves).
- Character counts at the low and high tiers and in the night stadium / beach (night uses the stadium seed, so the
  same people; the beach has only a couple of characters).
- The 2D cabinet on the phone (the Fans album on the phone was checked: 2 columns, no sideways scroll).
- Emoji on the medal faces / plaques depend on the device's emoji font (drawn into canvases).
