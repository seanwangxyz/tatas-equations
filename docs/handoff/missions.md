# Match missions + Skills Passport (HOUSE FEATURE)

**Not part of official Equations.** Pip offers up to three optional missions per match about *how* he plays
(never about speed). A mission is stamped the moment the skill is shown; stamps fill the Skills Passport in the
Trophy Room. Switch: Settings → "Match missions" (`S.set.missions`, on by default; off hides chips, the card and
the end line, keeps every stamp). Everything is inert when `js/missions.js` is absent (`window.Missions` guards).

Files: `js/missions.js`, `css/missions.css`, `tests/missions.test.js` (`node tests/missions.test.js`), this file.

## Rules of the feature (all invented: house rules)

- Modes: `ai`, `ai3`, `team`, `tourney`; family missions in `p3` / `pvp`. Never in `tutorial`, not `online`.
- Three missions per match, every one from a **different skill family**, chosen **deterministically** from the match
  number (`S.missions.n`) and his own history (no luck):
  1. **Warm-up**: something he has shown before (stamps, or old stats/badges: `bootSeen`), still earning stars first.
  2. **Stretch**: a skill he has never shown (then rarely), as close as possible to one step above his best difficulty.
  3. **Wildcard**: the creature's personality (`PERSONA`, e.g. Penny → "Call Impossible! and be right"), its
     signature card or die, this match's variation cards / bonus dice, or three-player missions.
- Never offered when impossible: needs ×/÷/^/√ unlocked (`stageInfo().ops`), fractions on, three players, variation
  cards unlocked and switched on (or a creature's signature card), bonus dice in play (or Nugget's die), 2+ shakes.
- **Not today**: he can swap ONE mission per match for another of the same difficulty (else the nearest), from a
  family the other two do not use. No penalty; the parent page shows missions he keeps passing on.
- Detection: from the moves/Goals/challenges/end-of-shake result the game already has (see hooks). A stamp lands
  once (one 0.55 s stamp animation on the chip, none with reduced motion or "Reduce flashing") with a short Pip line
  in the chip row. Nothing at all if a mission is not done: it simply stays available.
- **Stars**: a mission gives its difficulty (1–5) in stars the first **3** times; after that it is a "practised" tick.
  So stars measure breadth and growth, not grinding. 51 missions, 429 stars possible.
- **Ranks** (fixed rewards, shown in advance on the Passport):
  | Rank | Stars | Reward |
  |---|---|---|
  | ⚽ Ball Kid | 0 | Grass-green passport cover |
  | 👟 Squad Player | 12 | Fireworks celebration early (normally Level 4) + sky-blue cover |
  | 🎯 Playmaker | 35 | Underwater mat early (normally Level 6) |
  | ©️ Captain | 70 | Galaxy cubes early (normally Level 7) + captain-red cover |
  | 🌟 Star Striker | 120 | Star Shower celebration early (normally Level 8) |
  | 🏆 Legend of the Table | 180 | Gold cubes early (normally Level 10) + legend-gold cover |
- Family games (`pvp`, `p3`): anyone may complete a mission (chip shows "done by Tata", a 🤝 team tick), but stars
  and stamps go to the passport only when player 0 (the device owner) did it.

## Save: `S.missions` (created lazily; not in `defaults()`)

`{ v: 1, n: matches offered, cv: cover id, rk: highest rank announced, s: { missionId: [count, 'YYYY-MM-DD', creature index or -1, offered, swapped] } }`

Size (from the test): heavy user (every one of 51 stamps, 2,500 matches) **1,926 bytes**; typical about 750 bytes.

## 1. `index.html`

After `<link rel="stylesheet" href="css/rivals.css"><!-- RIVALS -->` add:

```html
<link rel="stylesheet" href="css/missions.css"><!-- MISSIONS (house feature) -->
```

After `<script src="js/rivals.js"></script><!-- RIVALS -->` add:

```html
<script src="js/missions.js"></script><!-- MISSIONS (house feature) -->
```

(No `<section>` needed: the Passport screen creates `<section id="passport" class="screen">` itself, like the parent
page.) Then run `node tools/build-precache.js` so the two new files work offline.

## 2. `js/game.js` hooks (six one-liners)

**H1, startMatch** — after `if (window.Rivals) Rivals.note('start', { g: G }); // RIVALS: creatures that remember`
(after `Career.matchStart`, so a signature card/die is known):

```js
  if (window.Missions) Missions.note('start', { g: G }); // MISSIONS (house feature): pick this match's missions
```

**H2, setGoal** — after the line `if (window.Recorder) Recorder.note('goal', { by: G.setter, goal: val, ...`:

```js
  if (window.Missions) Missions.note('goal', { g: G, tokens: tokens, val: val }); // MISSIONS
```

**H3, placeCube** — after the first line `if (window.Recorder) Recorder.note('move', ...); // REVIEW (before the cube moves)`:

```js
  if (window.Missions) Missions.note('move', { g: G, id: id, zone: zone, by: who }); // MISSIONS (before the cube moves)
```

**H4, challenge** — after `if (window.Recorder) Recorder.note('challenge', { by: who, kind: kind, ...`
(G.lastMover is still the mover here):

```js
  if (window.Missions) Missions.note('challenge', { g: G, kind: kind, by: who }); // MISSIONS
```

**H5, endShake** — as the **first line** of `function endShake(r) {` (it needs `G.phase` before it becomes `'over'`,
and the raw points before `Bonus.adjust`):

```js
  if (window.Missions && G.mode !== 'tutorial') Missions.note('shake', { g: G, r: r, phase: G.phase }); // MISSIONS
```

**H6, endMatch** — after `if (window.Parent && G.mode !== 'tutorial') Parent.note('match'); ...`:

```js
  if (window.Missions) Missions.note('end', { g: G }); // MISSIONS
```

and the end line, just before `if (window.Review) html += Review.slotHTML(); // REVIEW: ...`:

```js
  if (window.Missions) html += Missions.matchLineHTML(); // MISSIONS: "Missions: 2 of 3 ⭐⭐⭐ (new stamp: …)"
```

`js/team.js` (`Team.endMatch`) and `js/tourney.js` (`Tourney.endMatch`) return before that line, so add the same
line there: in team.js before `html += '<div class="row" style="margin-top:12px"><button class="btn green" data-act="rematch">`;
in tourney.js before the `'<div class="row" style="margin-top:12px"><button class="btn green" data-act="tAgain">` part
(insert `(window.Missions ? Missions.matchLineHTML() : '') +` in front of it).

**Chips** (the lead places them) — in `renderGame()`, the action bar line becomes:

```js
  $('#gAct').innerHTML = speechHTML() + (window.Missions ? Missions.chipsHTML() : '') + '<div class="acts">' + (G.team ? Team.barHTML() : '') + actionsHTML() + '</div>';
```

On wide 3D windows `#gAct` is the right-hand column, and css/missions.css stacks the chips one per line there;
elsewhere they sit in one row above the buttons. The first `chipsHTML()` call after the roll opens the small
"Pip's missions for this match" card (its own overlay `#msnOv`; it never touches `modal()`).

## 3. `js/screens.js`

**Trophy Room button** — in `renderTrophies()`, in the button row, change
`(window.Career ? Career.buttonHTML('yellow') : '') +` to:

```js
    (window.Career ? Career.buttonHTML('yellow') : '') + (window.Missions ? Missions.buttonHTML('blue') : '') +
```

(`data-act="passport"` opens it; its Back button returns to the Trophy Room.)

**Early cosmetics from ranks** — in the three `.map` lines for SKINS, MATS and VICTORIES, change
`var open = L >= s.lvl;` to (kind `'skin'`, `'mat'`, `'victory'` respectively):

```js
var open = L >= s.lvl || !!(window.Missions && Missions.cosmeticOpen('skin', s.id));
```

Optional, for the locked note: `Missions.rankFor('skin', s.id)` returns the rank `{ name, at }` that opens it early.

**Settings row** — in `renderSettings()`, just before the line starting
`'<div class="setrow"><label>Pip\'s tip after a match<br>`, insert:

```js
    (window.Missions ? Missions.settingsHTML() : '') +
```

(It uses the existing `ACT.toggleSet` with `data-arg="missions" data-def="1"`, so no new handler.)

## 4. `js/parent.js` (the "For Tata" page)

In `render()`, before `'<section class="pp-sec"><h3>Progress</h3>' + progressHTML(m) + '</section>' +` insert:

```js
      (window.Missions ? Missions.parentHTML() : '') +
```

It shows stars, rank, stamps per skill family, and "Missions he keeps passing on" (swapped twice, or offered 3+
times and not shown yet) with a button to the matching Training Camp drill (reuses `ACT.parentTry`, `drill:<id>`).

## 5. `js/config.js`

In `defaults()`, in the `set: { ... }` object, after `walkout: true, toss: true,` add `missions: true,`.
(Optional: the code treats a missing value as on. `S.missions` itself is created lazily and is NOT added to
`defaults()`, like `rivals` or `parent`.)

## 6. `js/account.js` (cloud save)

In `RULES`, after the line `/*RIVALS-MERGE-END*/` insert (self-contained; tests/missions.test.js checks that this
exact copy behaves the same as the one in js/missions.js):

```js
    /*MISSIONS-MERGE-START*/
    missions: function missionsMerge(a, b, c) {
      var isO = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
      var cp = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
      if (!isO(a)) return cp(b); if (!isO(b)) return cp(a);
      var newer = c && c.newer === 'a' ? a : b, older = newer === a ? b : a;
      var out = { v: Math.max(+a.v || 0, +b.v || 0) || 1, n: Math.max(+a.n || 0, +b.n || 0), s: {} };
      if (a.rk !== undefined || b.rk !== undefined) out.rk = Math.max(+a.rk || 0, +b.rk || 0);
      var cv = newer.cv !== undefined ? newer.cv : older.cv; if (cv !== undefined) out.cv = cp(cv);
      var sa = isO(a.s) ? a.s : {}, sb = isO(b.s) ? b.s : {};
      Object.keys(sa).concat(Object.keys(sb)).forEach(function (id) {
        if (id in out.s) return;
        var x = sa[id], y = sb[id];
        if (!Array.isArray(x) || !Array.isArray(y)) { out.s[id] = cp(Array.isArray(x) ? x : y); return; }
        var dx = String(x[1] || ''), dy = String(y[1] || ''), cx = x[2] == null ? -1 : +x[2], cy = y[2] == null ? -1 : +y[2];
        var useX = dx && dy ? (dx < dy || (dx === dy && cx <= cy)) : dx ? true : dy ? false : cx <= cy; // earliest day; same day: the lower creature number, so the merge is symmetric
        var first = useX ? x : y;
        out.s[id] = [Math.max(+x[0] || 0, +y[0] || 0), first[1] || '', first[2] == null ? -1 : first[2], Math.max(+x[3] || 0, +y[3] || 0), Math.max(+x[4] || 0, +y[4] || 0)];
      });
      return out;
    },
    /*MISSIONS-MERGE-END*/
```

In `DESCRIBE`, change `parent: 'each counter and each day: highest'` to:

```js
parent: 'each counter and each day: highest', missions: 'Skills Passport: stamps union (earliest date and its creature); counts, offered, swapped, matches: highest; cover: newer device'
```

## 7. `tests/account.test.js`

FEATURE_KEYS gets `'missions'`:

```js
const FEATURE_KEYS = ['camp', 'wx', 'puz', 'cards', 'stadiumTierSeen', 'season', 'fans', 'parent', 'onsets', 'rivals', 'tourney', 'matchday', 'missions'];
```

In `randomSave()`, before `return s;` add a random value:

```js
  s.missions = { v: 1, n: ri(300), s: {} }; if (coin()) s.missions.cv = 'blue'; ['g_set', 'c_now', 'o_div', 'f_frac'].forEach(id => { if (coin()) s.missions.s[id] = [1 + ri(6), date(), ri(15) - 1, ri(9), ri(3)]; });
```

and in the `checks` object of the random loop:

```js
    missions: [a, b].every(s => Object.keys(s.missions.s).every(id => out.missions.s[id] && out.missions.s[id][0] >= s.missions.s[id][0] && String(out.missions.s[id][1]) <= String(s.missions.s[id][1]))) && out.missions.n >= Math.max(a.missions.n, b.missions.n),
```

## Public API (`window.Missions`)

`note(event, data)` · `chipsHTML()` · `matchLineHTML()` · `parentHTML()` · `settingsHTML()` · `buttonHTML(cls)` ·
`open(from)` · `swap(k)` · `cosmeticOpen(kind, id)` · `rankFor(kind, id)` · `on()` · `bytes()` · `current()`, plus the
pure parts used by the tests (`CATALOGUE`, `choose`, `swapFor`, `apply`, `check`, `merge`, `award`, `totalStars`, …).
Tap handlers it adds: `ACT.msnTip`, `ACT.msnClose`, `ACT.msnSwap`, `ACT.passport`, `ACT.passportBack`, `ACT.msnPage`,
`ACT.msnCover`.
