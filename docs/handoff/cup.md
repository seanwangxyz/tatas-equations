# Handoff: Cup tournaments (agent `cup`)

New files (owned by this branch): `js/cup.js`, `css/cup.css`.
Nothing else is changed. `js/cup.js` does nothing until the hooks below are wired in.

## What it does

- A cup is three matches in a row: quarter-final, semi-final, final. Then the trophy lift.
- Losing or tying a round never knocks you out. A loss gives "Try again" for that same round.
  A tie replays the round. Tries are counted (`run.tries`) but never shown and never cost anything.
- The bracket screen shows the three rounds, who is next, rounds already won (with the score) and the trophy.
- The cup in progress is saved in `S.cups.run`. Quitting a match (Menu → quit) or closing the page keeps it.
  Opening Cups again goes straight back to the bracket.
- "Leave this cup" asks once ("Nothing is lost"), then clears the run. Starting a different cup while one is
  running asks "Switch cups?" first.
- The trophy lift is on the cup screen: the trophy rises once and settles, a glow fades in, "CHAMPIONS!", the
  kid's jersey and name, the three beaten opponents, XP line. Effects: `victoryFX()` (the kid's chosen victory
  style), `FX.burst`, `Snd.fanfare`, `Snd.crowd`, `Snd.crowdReact('cheer'/'chant')`, `Snd.setMood('win')`.
  The 3D cues (`T3.cue('win')`, `T3.fx('confetti')` etc.) already fire in `endMatch()` when the final is won,
  before the result pop-up, so `cup.js` does not repeat them. The lift itself is plain HTML/CSS/SVG, so it
  works the same with the 3D table off.
- The trophy is saved the moment the final is won (in `Cup.onMatchEnd`), not when the lift is shown, so closing
  the page at the pop-up loses nothing.
- No loops: the bracket cards slide in once, the lift animates once. `prefers-reduced-motion` turns them off.

## The four cups and when they open

| Cup | Quarter-final → Semi-final → Final | Opens when |
|---|---|---|
| Kick-off Cup | Snoozy (1★) → Penny (2★) → Grub (3★) | Always |
| Creature Cup | Rusty (3★) → Ollie (4★) → Mondo (5★) | Rusty is unlocked (beat Penny) |
| Monster Cup | Splosh (4★) → Blaze (5★) → Hex (5★🔥) | Splosh is unlocked (beat Grub) |
| Champions Cup | Mondo → Hex → Zog (5★🔥🔥) | Beaten Mondo or Blaze (or won the Creature or Monster Cup) |

**The rule:** a cup opens when you could already play its quarter-final opponent in a normal match. The
Kick-off Cup is open from the start, so a beginner who has only Snoozy and Grub unlocked can play it straight away.
It is the gentlest climb in the game (1★, 2★, 3★). Grub, its final opponent, is already playable from the start.

**A choice to check:** later rounds can be opponents the kid hasn't unlocked yet (Penny in the Kick-off Cup;
Ollie and Mondo in the Creature Cup...). `endMatch()` already sets `S.beaten[idx] = true` and gives the
first-win XP on any win, so beating a locked opponent in a cup unlocks the next one too. I think that's a fair
reward for skill: the kid had to win the earlier rounds to get there. Winning the Kick-off Cup opens both the
Creature Cup and the Monster Cup. If you'd rather keep the ladder strict, guard the `S.beaten[idx] = true`
line in `endMatch()` with `!(window.Cup && Cup.active()) || oppOpen(idx)`.

## Wiring (please add these; I tested them in a temporary copy, then reverted)

### 1. `index.html`: stylesheet and script

After `<link rel="stylesheet" href="css/social.css">`:

```html
<link rel="stylesheet" href="css/cup.css">
```

After `<script src="js/camp.js"></script>` (it must come after `js/game.js`, which defines `ACT` and `startMatch`):

```html
<script src="js/cup.js"></script>
```

The screen container is optional: `cup.js` creates `<section id="cup" class="screen">` itself if it is missing.
To keep `index.html` tidy, add it next to the others:

```html
<section id="cup" class="screen"></section>
```

### 2. `js/game.js` `endMatch()`: the result pop-up hook

Replace the last button line (the one with `data-act="rematch"`):

```js
  html += '<div class="row" style="margin-top:12px"><button class="btn green" data-act="rematch">Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Menu</button></div>';
```

with:

```js
  var cupRow = (G.mode === 'ai' && window.Cup && Cup.active()) ? Cup.onMatchEnd({ won: won, tie: tie, you: a, them: b, oppIdx: G.oppIdx }) : '';
  html += cupRow || '<div class="row" style="margin-top:12px"><button class="btn green" data-act="rematch">Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Menu</button></div>';
```

`won`, `tie` and `b` are `var`s from the `G.mode === 'ai'` branch, so they exist whenever the guard is true.
The normal result pop-up (scores, creature line, XP list, match card) stays as it is. Only the button row is
swapped for a cup line and the cup buttons:

- won a quarter- or semi-final: "Quarter-final won! Next: the semi-final against Penny." **Next round** / **Back to the cup**
- won the final: "You won the final! The Kick-off Cup is yours!" **Lift the trophy!**
- tie: "A tie! In a cup the round is played again." **Replay the round** / **Back to the cup**
- lost: "You're still in the cup! Have another go at the semi-final whenever you like." **Try again** / **Back to the cup**

`Cup.active()` is true only for the match object `cup.js` itself started (it keeps a reference to that `G`), so
a normal match played while a cup is saved is never counted as a cup round. If `onMatchEnd` returns `''` (it
shouldn't), the normal buttons appear.

Small wording note: on a loss the creature's line in the same pop-up ends with "Want a rematch?". It reads fine
next to "Try again", but if you'd like it cup-specific, `G.cup` is set (`{id, round}`) on cup matches.

### 3. `js/screens.js` `renderSetup()`: the menu entry

Just before the line that starts `'<h3 class="tierh">' + ico('people') + ' Play with people</h3>`, insert:

```js
    (window.Cup ? Cup.setupHTML() : '') +
```

This adds a "Cups" heading with one "Cup Tournaments" card. Its subtitle shows the saved cup
("Kick-off Cup: semi-final next!") when there is one. Its Back button returns to the opponent picker
(`ACT.setup`). Optional: a title-menu button could use `data-act="cup"`.

### 4. `js/screens.js` `renderTrophies()`: the Trophy Room shelf

Just before the `Cards.albumHTML()` line, insert:

```js
  if (window.Cup && Cup.trophyHTML) html += Cup.trophyHTML();
```

It shows a "Cup Trophies 1 / 4" heading and a shelf of four trophies. Won cups are in colour with
"Won 3 times · first on 2026-11-11". Cups not won yet are grey with "???" and how to get them.

### 5. `js/config.js` `defaults()`: saved data

Add to the object returned by `defaults()`:

```js
    cups: { run: null, won: {}, list: [] },
```

It isn't strictly needed: `Cup.state()` creates and repairs `S.cups` whenever it is read, and `merge()` keeps
unknown keys from old saves and imported codes. The shape is:

```js
S.cups = {
  run: null | { id: 'kickoff', round: 0..2, scores: [[you, them] | null, ...], tries: 0, last: null | 'lost' | 'tie', started: 'YYYY-MM-DD' },
  won: { kickoff: 2, creature: 1 },                       // how many times each cup was won
  list: [ { id: 'kickoff', date: '2026-11-11', first: true }, ... ]   // every cup win, oldest first
}
```

## XP

`cup.js` gives the XP itself through `addXP(amount, reason)` when the final is won. The amounts are on each cup in
`CUPS` (`xpFirst`, `xpAgain`), so you can tune them in one place:

| Cup | First win | Each later win |
|---|---|---|
| Kick-off | 100 | 25 |
| Creature | 150 | 30 |
| Monster | 200 | 40 |
| Champions | 300 | 50 |

This is on top of what the three matches already earn (20 XP per win, 60 for a first win against a creature).
A repeat cup win is worth a little more than one ordinary win, so replaying is fine but not a grind. The cup XP
line appears in the trophy lift, not in the match pop-up, because the pop-up's XP list is already drawn by then.
A level-up caused by the cup XP is shown after the lift, when "Back to the cups" is tapped (it drains the
celebration queue).

## Badge ideas

`cup.js` calls `checkBadges({ type: 'cup', cup: id, first: bool, count: n })` after a cup win, so badges can
test `e.type === 'cup'`, or just read `S.cups`:

- 🏆 **Cup Winner** (silver): win any cup. `test: function () { return S.cups && S.cups.list.length >= 1; }`
- 🧹 **Clean Sweep** (gold): win all four cups. `test: function () { return S.cups && ['kickoff','creature','monster','champions'].every(function (k) { return S.cups.won[k]; }); }`
- 👑 **Champion of Champions** (special): win the Champions Cup. `test: function () { return S.cups && S.cups.won.champions; }`
- 💪 **Never Give Up** (silver): win a cup after losing a round in it. This needs `run.tries` passed in the event:
  add `tries` to the `checkBadges` call in `onMatchEnd` if you want it. It rewards trying again, not winning fast.

## Public API

```
Cup.open()              show the cup screen (bracket if a cup is running, else the cup list)
Cup.active()            true while the current match G is a cup round
Cup.onMatchEnd(r)       r = {won, tie, you, them, oppIdx}; records the round, returns the button-row HTML
Cup.setupHTML()         "Cups" section for renderSetup
Cup.trophyHTML()        cup shelf for renderTrophies
Cup.trophySVG(id, px, locked)   trophy picture (inline SVG with a football on the front)
Cup.CUPS, Cup.ROUNDS, Cup.isOpen(cupOrId), Cup.state()
```

Handlers it adds to `ACT`: `cup`, `cupList`, `cupPick`, `cupSwitch`, `cupLocked`, `cupPlay`, `cupLeave`,
`cupLeaveYes`, `cupNext`, `cupRetry`, `cupBracket`, `cupLift`, `cupLiftDone`.

Leaving a match for the bracket or the lift cleans up the same way `ACT.toMenu` does: ambience off, dance
music off, speech bubbles cleared, `G = null`. "Next round" and "Try again" go through `drainQueue` like `ACT.rematch`.
