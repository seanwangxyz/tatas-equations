# Handoff: match-day atmosphere (agent `matchday`)

The walk-out before a match, a toss for who sets the first Goal, and a trophy lift on a podium after a big win.

New files (mine): `js/three/matchday.js` (3D sequences), `js/matchday.js` (glue: captions, skip layer, buttons, seeded
toss, saving, the 2D versions), `js/matchday-sfx.js` (sounds), `css/matchday.css`, this note.
Small additive exports, marked MATCHDAY:
- `js/three/player.js`: `T3.playerScript(who, o, done)` / `T3.playerScripted(who)` (a scripted walk along a path, with
  the normal legs and arm swing; `stay`, `yaw`, `force`, `up` for the podium), the `lift` mood (both hands up, held), and
  `A.forced` in applyVis/startMood/step so a scripted walk can show him even when his seat does not fit.
- `js/three/cabinet.js`: `export function buildTrophy(it, opts)` (the cabinet's cup and crown shapes, standalone; the
  cabinet's own `mount` still has its private copies, its owner can switch to this to remove the duplication).
- `js/three/creatures.js`: untouched (see "creatures" below).

Nothing runs until the snippets below are applied. Every call is guarded (`window.Matchday &&`), any failure goes
straight on to the game. `node tests/engine.test.js`: 831 passed.

## 1. The walk-out (3D only; Settings switch `S.set.walkout`)

Important design constraint I found: the people are about 9 world units tall and the stadium's tunnel is 2.3 units high,
and the creatures are upper bodies standing behind the table (they have no legs). So nobody can literally come out of
the tunnel, and the creatures cannot walk on the open pitch. What I did instead:

**Full version** (first match of the session, stadium and night venues), about 5.9 s:
| t (s) | what happens |
|---|---|
| 0.0 | a 0.4 s fade from navy, letterbox bars; the HUD (scores, action bar, Goal bar) waits (visibility only, so nothing resizes); the walk-out fanfare (`MdSfx.walkout`, ~3.2 s, original tune) |
| 0.0-2.6 | **shot 1**, low on the pitch: the kid (and Tata, side by side on wide screens, a few steps behind on the tall layout) walks out from right in front of the tunnel (tiers 4-5) or from the corner flag on the touchline (tiers 1-3), then along the side of the table. The camera follows him with a smoothed look and drifts back a little. The creatures are kept out of this shot. Scoreboard: `KICK-OFF! / CHAMP v SNOOZY` |
| 0.45 | lower third slides in (original style: a yellow "MATCH DAY" tag over a navy bar): number badge or creature face, name, and for league fixtures `3rd · W2 D1 L0` from the Season table (otherwise "Level N" for the kid, stars and title for creatures) |
| 0.7 | the crowd rises once: `crowdReact('cheer', { wave: true })` |
| 2.6 | **cut** to a high wide shot (the seat view raised, pulled back 20% and swung 0.2 rad); the creatures make their usual entrance (`creaturesEnter()`, the second one 0.45 s later, so there is no second entrance later); he walks round the near corner to his seat (arrives ~5.2 s); Tata walks to his own seat ('left' from the near side, 'far' along the far side) |
| 4.7 | lower third leaves |
| 2.6-5.9 | the camera eases (smootherstep) down to the live seat view; at 5.9 the camera is exactly the fitted seat view again (`ctx.refit()`), scripts end, HUD back |

**Simpler version** (beach, volcano, the felt rooms), 3.5 s: only the wide shot; he walks in from well off the side.
**Short version** (every later match in the session), 2.0 s: the last steps to his seat while the camera settles; lower
third (names only) 0.15-1.65 s; no fanfare, a small cheer.
**Skip:** any tap or Enter/Space/Escape ends it at once: scripts end with him at his seat, camera back on the seat view;
if it is skipped before the cut, the creatures had not entered yet, so `entered: false` is reported and the game plays
their entrance as before (no double entrance, no missing one). Safety: TEND + 3 s.
Avatar switched off: the camera still follows the path, nobody walks. Leftover cubes of a previous match are hidden while
it plays (also a pour still landing from a match he quit a moment ago).

## 2. The toss (3D and 2D; Settings switch `S.set.toss`, false = "he always goes first")

- **2 players: a coin.** Original coin: one side a cube with "=" on it (player 0's side), the other a star (the other
  player). 3D: it pops onto the middle of the table (0-0.35 s), flips at 0.6 s on a parabola (apex 5.2 units, 3-5 full
  turns, 1.0 s), lands tilted, one small bounce (0.36 s), then an Euler-disc wobble that settles flat with faster and
  faster little clinks (1.05 s), result at ~3.0 s, held 1.5 s, shrinks away. Camera pushes 38% toward the middle and back.
  2D: a CSS coin flips (Web Animations) and lands on the right side.
- **3 players: the official rule** (RULES_SUMMARY.md: "Players roll a red cube to pick the first Goal-setter, and a player
  who rolls an operation sign is eliminated"): everyone rolls a red cube (faces 0 1 2 3 + −), a sign is out, the highest
  digit sets the Goal, a tie between the highest rolls again among those tied, only signs: everyone rolls again (8 rounds
  at most, then a seeded pick among those left; never seen). 3D: three big red cubes (the game's own face drawing,
  `T3.drawCubeFace`) tumble onto the table with name labels; per round 1.05 s roll + 1.15 s reading ("A tie on 3! Champ
  and Ollie roll again."); the winner's label turns gold. 2D: red tiles with a roll animation.
- Captions: "Coin toss for the first Goal! [=] Champ [★] Snoozy", then "★ The star side! Snoozy sets the first Goal."
  A tap jumps to the result (shown ~1.1 s, a second tap goes on at once).
- **Fair and seeded:** `S.matchday = { seed, n, pend }`; match number n gives the seed (mulberry32 of seed and n); the
  coin is a plain 50/50; the cube roll is symmetric. **A reload cannot re-toss:** the record is saved (`pend`, with a key of
  mode + opponent + names + cup round) before it is shown; starting the same match again before its first Goal is set gets
  the same record. It counts as used once the first Goal is set (a light 1.5 s interval while that match is on).
- Result: `G.toss = { method, winner, face, spins, rolls, n, np }` and `G.setter = winner`.

### What game.js must change (G.setter)
Today `G.setter` is 0 at match start. `Matchday.matchStart(G, go)` sets `G.setter` (and `G.toss`) before it calls `go`,
so `newShake()` (which does `G.turn = G.setter`) and `startGoalPhase()` (AI or human setter, "<b>Mama</b>, you set the
Goal") need no change. `nextShake()` keeps rotating from there. Modes:
- 'ai', cups ('ai' with G.cup): coin. 'ai3', 'p3' (with Mama or a creature): red cubes. 'pvp': coin (player 2 can set
  the first Goal; avatarMoveFn/humanGoal already handle player 1). 'team': coin between the team (player 0) and the
  creature; if the team wins, Team decides which teammate as now.
- 'tutorial': no toss (matchStart returns at once; the tutorial does not use startMatch anyway).
- **'tourney' / G.tour (main, after I branched):** no toss: `toss()` returns at once when `G.tour` is set. My hook wraps
  the whole start of `begin()`; Tourney's own roll stays where it is, inside `kick` below, on the `newShake` line:
  `if (G.tour && window.Tourney) Tourney.firstSetter(function () { newShake(); }); else newShake();`. The walk-out
  still plays before it (switch it off for tournaments by adding `|| G.tour` to the walk-out test if you prefer).
- **'online' (do not edit online.js here; hook for its owner):** the host tosses (matchStart runs on the host only; a
  guest never calls startMatch) and `G.toss` travels in the published state like the rest of G. Today online sets
  `g.setter` from `cfg.firstSetter` (rotating per room round); the toss overrides it on the host. For guests to SEE the
  toss: in online.js `mirror(h)` add `toss: h.toss ? { method: h.toss.method, face: h.toss.face, spins: h.toss.spins,
  winner: R(h.toss.winner), rolls: (h.toss.rolls || []).map(function (rd) { return rd.map(function (e) { return { p:
  R(e.p), s: e.s }; }); }) } : null` and in `apply()` (fresh match, after the VS screen) call `Matchday.playToss(G.toss,
  G.players.map(function (p) { return p.name; }), function () { ... })` before letting the pour show. Note the coin side
  shown to a guest is "= = host's player" (player 0 on the host); for a guest, swap `face` if you want "= = me". If online
  should keep its rotating first setter instead, pass on the toss for online (one line in `toss()`).

## 3. The trophy lift (3D; 2D for the league shield and the crown)

Beats (~6 s, then a still frame):
| t (s) | what happens |
|---|---|
| 0 | camera cut to a podium (1-2-3 blocks, his cup's ribbon colour on the top, "1" plate) in front of the near side of the table, a little to the left; he stands on "1" facing the camera holding the trophy at his chest (the cup from the cabinet in that cup's metal and ribbon colours, without its display plinth; the crown for Trio; an original league shield with a star for a league boss). The beaten creature(s) stand behind the table in the background. `MdSfx.trophy()` (original, ~3 s). Caption at the top: "CHAMPIONS!" / cup name / "Your very first Kick-off Cup! …" / "+100 XP" |
| 0.75-1.35 | the lift: both hands up over his head, one small hop; the pose is then held still |
| 1.5 | confetti falls around the podium and stays where it lands; flashbulbs (`T3.fx('flash')`); the crowd cheers with a wave; fireworks (`T3.fireworks`, 6 rockets) |
| 1.7 | the beaten creature(s) clap (`creatureMood('clap')`, 0.26 s apart) |
| 0-6 | one slow push-in, then the camera holds |
| 6.0 | buttons: "📷 Take a photo" (T3.photo with this camera: it swaps the seat view for one call and puts it back) and "Continue ▶" |
A tap anywhere shows the buttons at once. Continue removes everything (podium, trophy, confetti), he is back at his seat,
the camera is back on the seat view, then `done()`.
2D (3D off): cups keep cup.js's existing trophy screen (`trophyLift` returns false); the shield and the crown get a CSS
overlay (rising art, confetti `FX.confetti`, caption, Continue).

## Calm / reduced motion / sound
- prefers-reduced-motion: no CSS animation (captions just appear), no confetti, 3 fireworks, no flashbulbs, the 2D coin
  and dice show the result without flipping. The 3D walk and coin still move (they are the content) but are short and
  skippable. (This machine has reduced motion on, so the full-motion CSS was not seen.)
- `A11y.calm()` (main's Reduce flashing): no flashbulbs and no fireworks in the lift. No other flashing anywhere.
- Sound: `js/matchday-sfx.js` uses main's shared `Snd.context()` and a fresh gain into `Snd.bus('sfx')` per sound when
  they exist (`typeof Snd.context === 'function'`), else its own context. Honours mute / sfx volume either way.

## 4. Snippets for files I do not own

### index.html
After `<link rel="stylesheet" href="css/whistles.css">`:
```html
<link rel="stylesheet" href="css/matchday.css"><!-- MATCHDAY -->
```
After `<script src="js/fx-sfx.js"></script>`:
```html
<script src="js/matchday-sfx.js"></script><!-- MATCHDAY -->
```
After `<script src="js/replay.js"></script>`:
```html
<script src="js/matchday.js"></script><!-- MATCHDAY -->
```
After `<script type="module" src="js/three/fireworks.js"></script>`:
```html
<script type="module" src="js/three/matchday.js"></script><!-- MATCHDAY -->
```

### js/game.js `startMatch`, inside `var begin = function () {…}`
Replace these two lines (main may have the Tourney line instead of the bare `newShake();`: keep that line as it is,
inside `kick`):
```js
    if (news) { persist(); setTimeout(function () { if (G) say('pip', news, 'cheer'); }, 2400); }
    if (ai && Snd.theme) Snd.theme(ai.kind); creaturesEnter(); setTimeout(function () { if (G) playerMood('wave'); }, 500); newShake(); if (window.Commentary) Commentary.say('kickoff'); if (ai) { var hi = talkLine(ai, 'greet'); if (hi) setTimeout(function () { if (G && G.phase === 'roll') say('opp', hi); }, 600); } };
```
with
```js
    // MATCHDAY (js/matchday.js): the walk-out and the toss for the first Goal (it sets G.setter), then the match itself
    var kick = function (md) { if (!G) return;
      if (news) { persist(); setTimeout(function () { if (G) say('pip', news, 'cheer'); }, 2400); }
      if (ai && Snd.theme) Snd.theme(ai.kind); if (!(md && md.entered)) creaturesEnter(); setTimeout(function () { if (G) playerMood('wave'); }, 500); newShake(); if (window.Commentary) Commentary.say('kickoff'); if (ai) { var hi = talkLine(ai, 'greet'); if (hi) setTimeout(function () { if (G && G.phase === 'roll') say('opp', hi); }, 600); } };
    if (window.Matchday) Matchday.matchStart(G, kick); else kick(); };
```
(with main's Tourney line, `newShake();` above reads `if (G.tour && window.Tourney) Tourney.firstSetter(function () { newShake(); }); else newShake();`)

### js/game.js `endMatch`: league boss / Trio crown lift
Replace
```js
  var bigWin = (G.mode === 'ai' && won && ((first && (idx + 1) % LEAGUE === 0) || /data-act="cupLift"/.test(cupRow))) || (G.mode === 'ai3' && G.trioCrown);
  var fw = bigWin && window.Fireworks ? Fireworks.show({ rockets: 7 }) : '';
  var showEnd = function () { modal(html, null); if (window.Review) Review.afterMatch(); }; // REVIEW: thinks at most ~1.5 s, in small slices
```
with
```js
  var bigWin = (G.mode === 'ai' && won && ((first && (idx + 1) % LEAGUE === 0) || /data-act="cupLift"/.test(cupRow))) || (G.mode === 'ai3' && G.trioCrown);
  var showEnd = function () { modal(html, null); if (window.Review) Review.afterMatch(); }; // REVIEW: thinks at most ~1.5 s, in small slices
  // MATCHDAY: a league boss beaten for the first time, or a new Trio crown: the lift on the podium first (a cup final
  // keeps its "Lift the trophy!" button: js/cup.js plays the cup's own lift)
  var mdBoss = G.mode === 'ai' && won && first && (idx + 1) % LEAGUE === 0 && !/data-act="cupLift"/.test(cupRow), mdCrown = G.mode === 'ai3' && G.trioCrown;
  if (window.Matchday && (mdBoss || mdCrown)) {
    var mdG = G, mdInfo = mdBoss ? { kind: 'shield', name: (typeof LEAGUE_NAMES !== 'undefined' && LEAGUE_NAMES[leagueOf(idx)]) || 'League', mark: 'No.1', color: '#ffc83d', ribbon: '#1c7ed6', line: 'You beat ' + esc(o.name) + ', the league boss!' }
      : { kind: 'crown', name: 'Crown: ' + G.players.filter(function (p) { return p.ai; }).map(function (p) { return esc(p.name); }).join(' + '), color: '#ffc83d', ribbon: '#c92a4a', line: 'First at a table of three!' };
    setTimeout(function () { if (G !== mdG) return; if (!Matchday.trophyLift(mdInfo, function () { if (G === mdG) showEnd(); })) showEnd(); }, 1800);
    return;
  }
  var fw = bigWin && window.Fireworks ? Fireworks.show({ rockets: 7 }) : '';
```
(the 1.8 s lets the existing GOOOAL banner and celebration play first; the lift has its own fireworks.)

### js/cup.js `ACT.cupLift`
After the first line of `ACT.cupLift = function () {` (`if (has('closeModal')) closeModal();`) add:
```js
      // MATCHDAY: the lift on a podium on the pitch (3D); Continue goes back to the cups. No 3D: the trophy screen below.
      var L = lifting, c = L && byId(L.id);
      if (c && window.Matchday && Matchday.trophyLift({ kind: 'cup', name: c.name, metal: c.metal, ribbon: c.ribbon, xp: L.xp,
        line: L.first ? 'Your very first ' + E(c.name) + '! It is in your Trophy Room now.' : 'That is your ' + ord(L.count) + ' ' + E(c.name) + '!' },
        function () { tidyMatch(); lifting = null; snd('setMood', 'menu'); afterQueue(function () { renderList(); goCup(); }); })) { snd('setMood', 'win'); return; }
```

### js/screens.js `renderSettings` (two toggles; `ACT.toggleSet` with `data-def="1"` handles them)
In the list of toggle rows (next to `['replay', …]` / `['fireworks', …]`) add:
```js
['walkout', 'Walk-out before a match (the players come out onto the pitch)', true], ['toss', 'Toss for who sets the first Goal (off: Tyson always goes first)', true]
```
(use `S.name` in the label if the list builds labels at render time.)

### js/config.js `defaults().set` (optional; missing = on)
Add `walkout: true, toss: true`. `S.matchday` is created when first used.

## 5. Verified / not verified
Verified in the browser pane (own tab, port 3534; frames and timers driven by a fake clock; the 3D canvas captured and
looked at; DOM state read back), with exactly the snippets above patched in (then reverted):
- Walk-out full version at tier 5 (day and night), tier 4, tier 1 at night (touchline start, trees), the beach (simpler),
  the short version on the second match; 1280x800 (side-column layout) and 'ai3' (two creatures hidden in shot 1,
  both enter after the cut, the second 0.45 s later). Skip at 0.1 s and at 1.0 s (creatures visible again, entered:false,
  so the game played the entrance once). Camera back exactly on the seat view each time.
- Coin toss 3D (pop, flight, bounce, wobble, star side up; "=" reads level), skip mid-flight, the same record reused when
  the same match is started again; G.setter = 1 led to the creature setting the Goal. Cube toss 3D (wide and 400x800),
  a 3-round replay (all signs, a tie on 3, a winner) with the right captions. 2D coin and 2D dice (p3 with Mama: Mama
  set the first Goal). Reduced-motion paths only.
- Cup final (forced via S.cups.run round 2): endMatch -> "Lift the trophy!" -> the 3D lift (podium, cup in hands, the
  creature behind, fireworks), buttons at 6 s, the photo hook (camera swap checked with T3.photo stubbed: no file saved),
  Continue -> cups screen, the podium group removed, he is back at his seat. Trio crown lift (3D, after the turning fix).
  League shield 2D overlay layout at 1280x800.
- `node tests/engine.test.js`: 831 passed.
Not verified:
- After two late fixes (he no longer turns round at the start of the lift: his celebration pose is reset; the cup's
  display plinth is hidden and the lift timing moved to ~1.35 s) the CUP lift was not looked at again (the crown was).
- The tall layout's shot 1 camera fix (in his lane): not seen after the fix. 1920x915 not run (1280x800 already uses the
  side column). Monster creatures in 'ai3' at 400x800 hung my test harness (fake clock), not the game as far as I can
  tell, but not checked.
- The boss shield in 3D; the endMatch boss/crown snippet end to end (G.trioCrown stayed false in my run, so I called
  `Matchday.trophyLift` directly with the same arguments).
- Any sound (rendered nothing, heard nothing); the shared Snd.bus path (main only); full-motion CSS; real devices;
  online (not run); team and pvp walk-outs with Tata (code paths written, not looked at).

## 6. Judgment calls
- Nobody comes out of the tunnel itself (scale, see section 1); shot 1 starts right in front of it.
- The creatures do not walk out with him (no legs); they make their own entrance at the cut, which also removes the
  double-entrance problem. Hiding them during shot 1 uses `T3._creatureActor(i).root.visible` (a debugging accessor);
  `creatureEnter` unhides them. A real `T3.creatureHide(i, on)` in creatures.js would be cleaner.
- 3 players use the official red-cube roll rather than a spinner: it is the real rule and teaches the cube faces.
- The coin's "=" side is always player 0 (the device's player / the host).
- The toss is stored and only "used" once the first Goal is set, so quitting and restarting before that gives the same
  toss (by design: no re-tossing).
- The lift's Continue for a cup goes straight back to the cups list (cup.js's 2D trophy screen is skipped; its text, the
  "first cup" line and the XP, is in the 3D caption instead).
- The lift is placed in front of the table (the near side of the pitch is open at every tier).
