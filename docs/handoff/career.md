# Career mode: the Legend League and signature rules

Owner's request: "A career mode: a third league of creatures, with bosses that bring their own special rules."

## What is in this branch

| File | What changed |
|---|---|
| `js/config.js` | (marked CAREER) five new OPPONENTS 10-14, their TALK lines, JERSEYS 3/6/88/12/21, `CAREER_KINDS`, `LEAGUE_NAMES`, `leagueOf(i)`, `isLeagueBoss(i)`, `o.sig` on every Legend creature and light `sig` on Mondo (4) and King Messy (9). The kind/pack line now gives league 3 its own classic-built kinds. `normalizeSave` needed no change: it already sizes `S.beaten` / `S.oppNames` to `OPPONENTS.length`, so old saves grow from 10 to 15 entries with `false` / `''` and keep everything earned. |
| `js/ai.js` | New skill fields `sure`, `wide`, `trap`, `trapMs`, `moveMs` (only the Legend League has them; a creature without them runs exactly the old code). `AI.VERSION` 6 -> 7. |
| `js/career.js` (new) | Signature rules (announce, deal the card, add the die, tags) and the Career overview. |
| `css/career.css` (new) | Styles for both. |
| `js/three/creatures/classic.js`, `common.js`, `gestures.js` | Five new code-built kinds: `robot`, `bat`, `octopus`, `dragon`, `chameleon` (jersey, face, details, entrances/exits, idle flairs). |
| `js/season.js` | Third table `l` (Legend League, first = 10). Older saves get a fresh Legend table; `Season.ids()` lists the leagues that exist. |
| `js/cabinet.js`, `js/three/cabinet.js` | 15 plaques (gold for 4, 9, 14), crowns for the new pairs, a "next pennant" spot per league, crowded shelves shrink items so nothing overlaps. |
| `js/trio.js` | Pairs come from OPPONENTS automatically (now 12 league pairs) plus the bosses-together pairs Mondo + Messy (key `4-9`, unchanged for old saves) and Messy + Chroma (`9-14`). |
| `js/cup.js` | Fifth cup: Legend Cup (Flip, Squiggle, Nugget; opens when Bleep is beaten). A cup round with a signature creature shows the signature screen first. |
| `js/cards.js` | Base + gold cards for the five (44 cards). |
| `tests/playtest.js` | `sig`, `career`, `old`, `only=a-b,...` options (see the header). |

## The five creatures and their signatures

| # | Creature | Kind | Signature (built from an existing rule) |
|---|---|---|---|
| 10 | Bleep the Busy Robot 🤖 #3 | robot: shiny box head, antenna bulb that glows with its mood, ear bolts | **Use It Again** card on every shake |
| 11 | Flip the Upside-down Bat 🦇 #6 | bat: huge ears (twitch, droop), folded wings that open when happy, tiny fangs | **Upside-down** card on every shake |
| 12 | Squiggle the Eight-Armed Octopus 🐙 #88 | octopus: tall spotted head, six extra arms curling from its sides and back (two in the sleeves = eight) | **Base 8** card on every shake ("eight arms, so I count in eights") |
| 13 | Nugget the Treasure Dragon 🐉 #12 | dragon: violet, golden horns, golden spikes, snout, spade tail | brings the gold **Power die** every shake |
| 14 | Chroma the Chameleon Queen 🦎 #21 (final boss) | chameleon: crest and crown, turret eyes, curly tail; her colour changes with her mood (one-shots only) | **a different variation card every shake** (no repeats until each one that can change the shake has been used) |
| 4 | Mondo (light) | | **Two-digit Numbers** when he sets the Goal ("like my 99") |
| 9 | King Messy (light) | | **Three Operations** when he sets the Goal |

How a signature behaves (js/career.js header has the full contract):
- Announced on one screen before the match (creature, its line, the card or die, when it applies), with **Practice first** (`Vari.lessonHTML` / `Bonus.lessonHTML`, then back) and **Let's play!**. Rematches and cup rounds that already showed it do not show it again (`cfg.sigSeen`).
- **Unlock ladder:** the signature works whether or not he has unlocked that card / die; the screen says "sneak peek, it stays Bleep's rule until you earn it yourself" (or "you already know this one"). Meeting it does not unlock it. The Power die's per-face "New on the Power die" lesson still pops up the first time a face rolls (js/bonus.js does that).
- **Parent corner wins:** card switched off, variation cards off altogether, the Power die switched off (or all its faces off): the creature plays with normal rules and the screen/tag say so kindly ("Tata switched the Base 8 card off..."). The opponent-card tag turns grey: "(switched off)".
- A card that can't change this shake (e.g. no ÷ for Remainder) is skipped for that shake with a Pip line; if the Twist die already picked the card, the signature rests that shake.
- One-on-one only (mode `'ai'`, which includes Cup rounds). Not in Three at the table, Team-up, 3 players or online.
- An always-on card is not re-announced each shake: the card chip + one creature line. Chroma's new card each shake and the light cards get the small "deals a card" pop-up with How it works.

## Strength (tests/playtest.js, stage 4 = Roots, signatures in force)

New skills in js/ai.js (gated: older creatures are untouched):
- `sure`: never guesses Impossible!; when the quick search is unfinished it searches 3x longer (max 1.5 s) and only calls it when that search is complete.
- `wide`: considers every cube for its move (others look at 4 per zone).
- `moveMs`: checks each candidate move for "does this hand my opponent a Now!?" with 150-350 ms instead of 90 ms (King Messy gives away Now!s his 90 ms check misses; this is the biggest lever).
- `trap` / `trapMs`: near the end of a shake (3-7 Resource cubes), looks one move further and prefers the safe move that leaves the opponent the fewest safe answers.
- A move stays under ~3 s of thinking and a turn under ~6.5 s worst case (the worker's hang limit is 8 s).

Numbers from `node tests/playtest.js 40 4 career sig` (40 shakes per pairing, average shake points; a margin of about ±0.3 is noise at this size):

```
Hex 3.95 - 4.05 Messy      (yardstick, -0.10: the Monster League top is flat)
Messy 3.80 - 4.20 Bleep    (+0.40 for Bleep)
Messy 3.70 - 4.30 Flip     (+0.60)
Messy 3.70 - 4.30 Squiggle (+0.60)
Messy 3.70 - 4.30 Nugget   (+0.60)
Messy 3.85 - 4.15 Chroma   (+0.30; her card changes every shake, which adds noise)
Ladder: Bleep > Messy +0.40, Flip > Bleep +0.30, Squiggle > Flip +0.10, Nugget > Squiggle +0.30, Chroma > Nugget +0.10
Signature check: 698 Solutions written, 0 wrong under the rule
```
Every Legend creature beats King Messy, and every step of the Legend ladder goes the right way. The top is close to the ceiling of this game (most shakes end with both writing a correct Solution for 4 points each), so the steps are small. Before the moveMs skill, the margins were all about 0.
Thinking time: the slowest whole shake in the playtest was about 57 s for Chroma (about 20 moves for both sides, on a busy machine); in the browser her turns took well under a second.

Older creatures did not change: with the same seeded random numbers, the old ai.js (git HEAD) and the new one made identical decisions for the first ten creatures in 197 of 200 random positions; old-vs-old in the same run gave 198 of 200 (the few differences are search time-outs, same seeds both ways).

## Snippets for the lead (files I do not own)

### index.html
After `<link rel="stylesheet" href="css/season.css">`:
```html
<link rel="stylesheet" href="css/career.css"><!-- CAREER -->
```
After `<script src="js/season.js"></script>` (it needs Vari, Bonus, Season, Trio, Cup, ACT):
```html
<script src="js/career.js"></script><!-- CAREER -->
```

### js/game.js: startMatch (anchor: `function startMatch(mode, oppIdx, cfg) {`)
First line of the function:
```js
  if (mode === 'ai' && window.Career && !(cfg && cfg.sigSeen) && Career.announce(oppIdx, function () { startMatch(mode, oppIdx, Object.assign({}, cfg || {}, { sigSeen: true })); })) return; // CAREER: a signature rule is announced first
```
After `if (window.Recorder) Recorder.start(G); // REVIEW ...`:
```js
  if (window.Career) Career.matchStart(G); // CAREER: remember this match's signature rule
```
(js/cup.js already passes `{ sigSeen: true }` after showing the screen itself.)

### js/game.js: newShake (anchor: `if (window.Bonus) Bonus.onShake(G, !!fixedCubes);`)
Right after it:
```js
  if (window.Career) Career.onShake(G, !!fixedCubes); // CAREER: a creature's bonus die (Nugget) joins the roll
```

### js/game.js: startGoalPhase (anchor: the two lines `Bonus.beforeGoal` / `Vari.beforeGoal`)
Between them:
```js
  if (window.Career && Career.beforeGoal(startGoalPhase)) return; // CAREER: the creature's signature card is dealt
```

### js/game.js: endMatch, the boss celebration line
The fireworks already fire for every league boss (`(idx + 1) % LEAGUE === 0`, so 14 works). For the words, after `(seasonRes ? Season.lineHTML(seasonRes) : '');` add:
```js
    html += (window.Career && won ? Career.bossLineHTML(idx, first) : ''); // CAREER: "Monster League conquered! The Legend League is waiting"
```
Also `nextO = (idx + 1) % LEAGUE ? OPPONENTS[idx + 1] : null;` already works for three leagues.

### js/screens.js: renderSetup (the opponent picker)
In the card builder, after the `o.taste` line:
```js
      (window.Career ? Career.tagHTML(i) : '') + // CAREER: "Special rule: 🔁 Use It Again"
```
Replace `var opps = oppCards.slice(0, LEAGUE).join(''), monsters = oppCards.slice(LEAGUE).join('');` with:
```js
  var opps = oppCards.slice(0, LEAGUE).join(''), monsters = oppCards.slice(LEAGUE, 2 * LEAGUE).join(''), legends = oppCards.slice(2 * LEAGUE).join(''); // CAREER
```
Right after `' + monsters + '</div>' +` (the end of the Monster League line), insert:
```js
    (legends ? '<h3 class="tierh">🌟 Legend League <span style="font-weight:600;opacity:.7;font-size:14px">(each brings a special rule)</span> ' + (window.Career ? Career.buttonHTML('small') : '') + '</h3><div class="opps">' + legends + '</div>' : '') + // CAREER
```
`ACT.lockedOpp` and the 3-player creature list already work with 15.

### The Career button
- Trophy Room (`renderTrophies`, the row with `Cabinet.buttonHTML('purple')`): add `(window.Career ? Career.buttonHTML('yellow') : '') +`.
- Optional: the title menu or the picker header (above). `Career.open()` shows the overview in a pop-up; `Career.html()` is the same as a section if you'd rather give it its own screen.

### js/progress.js: badges (optional, for the five)
```js
  { id: 'beat10', tier: 'gold', icon: '🤖', name: 'Robot Rebooter', hint: 'Win a match against the Busy Robot.', test: function () { return S.beaten[10]; } },
  { id: 'beat11', tier: 'gold', icon: '🦇', name: 'Bat Flipper', hint: 'Win a match against the Upside-down Bat.', test: function () { return S.beaten[11]; } },
  { id: 'beat12', tier: 'gold', icon: '🐙', name: 'Eight-Arm Escape', hint: 'Win a match against the Eight-Armed Octopus.', test: function () { return S.beaten[12]; } },
  { id: 'beat13', tier: 'gold', icon: '🐉', name: 'Treasure Keeper', hint: 'Win a match against the Treasure Dragon.', test: function () { return S.beaten[13]; } },
  { id: 'beat14', tier: 'special', icon: '🦎', name: 'Legend', hint: 'Win a match against Chroma the Chameleon Queen.', test: function () { return S.beaten[14]; } },
```
(Nothing in progress.js counts opponents by number; js/kit.js `beatCount()` and js/three/weather.js stadium points count `S.beaten` and simply grow.)

### Others (not mine, nice to have)
- js/sound.js: `THEMES` / `VOICES_CFG` have no entry for the new kinds, so they use Pip's theme and voice. Suggested voices: robot pitch 1.0 rate 0.9, bat 1.4/1.15, octopus 1.2/0.95, dragon 0.6/0.8, chameleon (f) 1.1/0.9.
- js/three/title.js shows the first five opponents only (unchanged).
- js/team.js `strongest()` will now pick Chroma as the default Team-up boss once she is open (stars 5, fire 4). Team-up has no signature rules.
