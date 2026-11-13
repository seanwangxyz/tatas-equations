# Handoff from `menu`: tidier title menu, 3 Players at the top, What's new tour

The owner asked "Where do you add in the 3 player mode?" (it was two screens deep). Approved: tidy the title menu,
add a 3-player button, add a short What's new tour that points at each new thing once.

## Files

- `js/ui.js`: new `gotoTitle()` menu markup; new handlers (added lazily on the first title, because `ACT` is made in
  `js/game.js` after `ui.js` loads): `ACT.playNext`, `ACT.mmPick`, `ACT.menu3p`, `ACT.menuTata`, `ACT.mmGo`,
  `ACT.mmTrios`, `ACT.mmTrioLocked`. `ACT.playOpp` is wrapped to remember the creature he picked (`S.mmLast`).
  New icons: `shirt`, `table`, `sparkle`. `go()` tells the tour when the screen changes. The empty
  `<div id="acctSlot" class="mm-acct"></div>` next to the player card is the slot for the Account chip.
- `css/title.css`: the menu layout (prefix `mm-`) for 3D wide / 3D portrait / flat, the chooser pop-ups (`.mm-opt`).
- New `js/tour.js` (`window.Tour`) and `css/tour.css`.
- `js/three/title.js`: **not changed**. It already fits the camera to the panel (`freeRect` reads `.t-panel`), and the
  panel keeps its old width on wide screens; in portrait the panel is about the same height as before.

## The new menu

```
 [7  Champ  ========== Level 1]  [acctSlot]
 (×) Playing with: Times & Divide · ★ 0/6 to unlock the next one
 [ ▶  PLAY  against Snoozy           ] [🐾 Pick who]
 [ 3 Players        ] [ Play with Tata  ]
 [ Cups             ] [ Training Camp   ]
 MY STUFF
 [My kit] [Trophy Room] [Season Table] [My Stats]
 [ ⚙ Settings ]       [ 🎓 How to Play ]
```

| Button | What it does |
|---|---|
| **Play** (big) | Starts 1 v 1 right away against the creature he is working on: the one he picked last on the Play screen until he beats it, otherwise the first open creature he hasn't beaten yet, otherwise the last open one. The line under "Play" names it. |
| **Pick who** | The existing "Who do you want to play?" screen (all creatures, Monster League, trios, cups, people modes). |
| **3 Players** | Pop-up: *You against two creatures* (`trioPick`), *Crown challenges* (Play screen scrolled to Three at the table), *Family game* (`playP3`), and "Online with three players is coming later." |
| **Play with Tata** | Pop-up: *Team-up* (`playTeam`), *2 Players* (`playPvp`), *Online* (`online`), *Puzzle from Tata* (`giftOpen`). |
| **Cups** | `ACT.cup` |
| **Training Camp** | `ACT.camp` |
| My kit / Trophy Room / Season Table / My Stats | `openKit` / `trophies` / `season` / `stats` |
| Settings / How to Play | `settings` / `tutorial` |

Every old entry is still reachable (Trophy Cabinet and Spot the Fan stay inside the Trophy Room, as before). A choice
in a pop-up is a `.mm-opt` button with `data-act="mmGo" data-arg="<existing ACT name>"`: it closes the pop-up and runs
that handler. A locked choice shows a lock and one line on how to open it (only "You against two creatures" can be
locked, and with the current `oppOpen` rule two creatures are always open, so in practice it never is).
Focus order follows the picture top to bottom, left to right. Tiles a build doesn't have (no `Cup`, `Kit`, `Season`)
are left out.

## What's new tour (`js/tour.js`)

Stops for this version (`v: 1`), each pointing at a title menu tile:

| # | Tile | Pip says |
|---|---|---|
| 1 | Play | Look around! In a match, drag the background to look all around the stadium. Tap the camera button to take a photo! (only with 3D on) |
| 2 | 3 Players | Three at the table: play against two creatures at once! Or play a family game with three people. |
| 3 | My kit | Make an away kit, pick a crest and choose new boots. Then wear them on the pitch! |
| 4 | Season Table | Every match counts in the Season Table. Finish near the top to win a pennant for your Trophy Cabinet! |
| 5 | Trophy Room | Walk around your Trophy Cabinet. And in a match, zoom in on the crowd to Spot the Fan! |
| 6 | Settings | For Tata. Grown-ups: variation cards and bonus dice can be switched on or off in Settings, in the Parent corner. |

- A spotlight on the tile (everything else dimmed), Pip's card beside it (left of the panel on wide screens, above
  the tile in portrait), "1 of 6 · What's new", **Next** / **Skip** (last stop: **Got it!**). Esc = Skip,
  Right arrow = Next, Tab stays on the two buttons, focus goes back where it was afterwards.
- The spotlight ring pulses softly **once** when a stop appears, then stays still. Nothing loops. Reduced motion: no pulse.
- Each stop is marked seen when it is shown; Skip marks the rest seen. `S.tour.v` = last version finished/skipped.
- Starts only on the title, after the 3D opening has finished (or 9 s at most), with no pop-up open and no match.
  Never on a brand-new save: only once `S.tutorialDone` (or he has played 3+ shakes anyway). Leaving the title
  (any button, a match) closes it at once; unseen stops wait for the next title.
- **"✨ New" badges**: a still yellow badge on 3 Players, My kit, Season Table, Trophy Room and Settings until he opens
  that thing once (tapping the tile, or reaching the same handler from elsewhere, e.g. My kit from the Trophy Room).
  No badges before the tutorial either.
- **Replay**: `ACT.tourReplay` (goes to the title and shows this version's stops again). Needs a Settings button (snippet below).
- **Future versions**: add objects to `STOPS` with `v: 2` (fields documented at the top of `tour.js`); `VERSION`
  follows automatically. At most 6 stops per run.

Save shape: `S.tour = { v: 1, seen: { look: 1, ... }, opened: { kit: 1, ... } }` (created on demand, so a default is optional).
Also new: `S.mmLast` (index of the creature last picked on the Play screen, or missing).

## Snippets for files I don't own

### index.html

After `<link rel="stylesheet" href="css/title.css"><!-- TITLE: 3D title screen layout -->`:

```html
<link rel="stylesheet" href="css/tour.css"><!-- TOUR: What's new -->
```

After `<script src="js/tutorial.js"></script>` (it must come after every module whose handlers it wraps:
kit, season, cabinet, fans, trio; and before `main.js`):

```html
<script src="js/tour.js"></script><!-- TOUR: What's new -->
```

`Tour.maybeStart()` is already called at the end of `gotoTitle()` in `js/ui.js` (my file): nothing else to call.

### js/config.js (optional)

In `defaults()`, next to `kits: { away: {}, third: {} }, kitUse: 'home'`:

```js
    kits: { away: {}, third: {} }, kitUse: 'home', tour: { v: 0, seen: {}, opened: {} }
```

(`resetYes` uses `defaults()`, so a reset shows the tour again after the tutorial. That seems right.)

### js/screens.js: Settings button to replay the tour

In `renderSettings()`, right after the "Watch the intro again" row:

```js
    (window.Tour ? '<div class="setrow"><label>What\'s new<br><small style="font-weight:600">Pip shows the new things on the main menu again.</small></label><button class="btn small" data-act="tourReplay">Show me</button></div>' : '') +
```

(If you take the Settings tabs below, it goes in the Look tab.)

### js/screens.js: Play screen with tabs (proposal)

Four tabs at the top, one part shown at a time, "Shakes per match" always at the bottom. Tab names in kid words:
**Creatures** (league + Monster League), **Three at the table**, **Cups**, **With people**. `js/ui.js` already sets
`window.setupTab = 'trio'` before opening the screen from "Crown challenges", and `'opps'` from "Pick who".

Replace the `$('#setup').innerHTML = ...;` statement in `renderSetup()` with:

```js
  var tab = window.setupTab || 'opps';
  var tabs = [['opps', ico('paw') + ' Creatures'], ['trio', '👑 Three at the table'], ['cups', ico('trophy') + ' Cups'], ['people', ico('people') + ' With people']]
    .filter(function (t) { return (t[0] !== 'trio' || window.Trio) && (t[0] !== 'cups' || window.Cup); });
  var parts = {
    opps: '<h3 class="tierh" style="margin-top:0">' + ico('paw') + ' Play the creatures</h3><div class="opps">' + opps + '</div>' +
      '<h3 class="tierh">👹 Monster League <span style="font-weight:600;opacity:.7;font-size:14px">(the tough ones)</span></h3><div class="opps">' + monsters + '</div>',
    trio: window.Trio ? Trio.setupHTML() : '',
    cups: window.Cup ? Cup.setupHTML() : '',
    people: '<h3 class="tierh" style="margin-top:0">' + ico('people') + ' Play with people</h3><div class="opps">' +
      (window.Online ? Online.setupCardHTML() : '') + (window.Team ? Team.setupCardHTML() : '') + (typeof giftTileHTML === 'function' ? giftTileHTML() : '') +
      '<div class="opp mode" data-act="playP3"><span class="avatar lg" style="background:#ffe8cc;color:#c2410c;font-size:46px">' + ico('people') + '</span><h3>3 Players</h3><div class="otitle">Family game: 3 people, or 2 people + a creature</div></div>' +
      '<div class="opp mode" data-act="playPvp"><span class="avatar lg" style="background:#ffd6d6;color:#c92a2a;font-size:46px">' + ico('people') + '</span><h3>2 Players</h3><div class="otitle">Pass-and-play on this device</div></div></div>'
  };
  if (!parts[tab]) tab = 'opps';
  $('#setup').innerHTML = '<div class="hdr"><button class="btn small" data-act="home">' + ico('back') + ' Back</button><h2>' + ico('play') + ' Who do you want to play?</h2></div>' +
    '<div class="panel"><div class="seg setup-tabs" role="tablist" style="flex-wrap:wrap;margin-bottom:12px">' + tabs.map(function (t) {
      return '<button role="tab" aria-selected="' + (t[0] === tab) + '" class="' + (t[0] === tab ? 'on' : '') + '" data-act="setupTab" data-arg="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>' + parts[tab] +
    '<div class="row" style="margin-top:18px"><b style="font-family:var(--display);font-weight:400;font-size:20px">Shakes per match</b><div class="seg">' + [1, 3, 5].map(function (n) { return '<button class="' + (S.set.shakes === n ? 'on' : '') + '" data-act="setShakes" data-arg="' + n + '">' + n + '</button>'; }).join('') + '</div></div></div>';
```

and add next to `ACT.setShakes`:

```js
ACT.setupTab = function (el) { window.setupTab = el.dataset.arg; Snd.click(); renderSetup(); $('#setup').scrollTop = 0; };
```

Notes: `Trio.setupHTML()` and `Cup.setupHTML()` start with an `h3.tierh` (normal top margin); add
`#setup .panel > .tierh:first-of-type{margin-top:0}` somewhere if the gap under the tabs looks big. With tabs, the
`mmJump` scroll in ui.js simply finds the heading at the top. Without tabs everything keeps working as today.

### js/screens.js: Settings in tabs (proposal)

Tabs **Sound**, **Look**, **Game**, **Parent corner** (the last one also gets "Move progress to another device":
that's grown-up business too). Same pattern: build each group as a string, show one. In `renderSettings()`:

1. Split the big toggle array into three arrays and a helper:

```js
  function tog(x) { var on = x[2] ? S.set[x[0]] !== false : S.set[x[0]] === true; return '<div class="setrow"><label>' + x[1] + '</label><button class="btn small ' + (on ? 'green' : '') + '" data-act="toggleSet" data-arg="' + x[0] + '" data-def="' + (x[2] ? 1 : 0) + '">' + (on ? '✔ On' : 'Off') + '</button></div>'; }
  var togSound = [['babble', 'Creature voices (cute babble when they talk)', true], ['crowd', 'Crowd reactions (claps, cheers, oohs)', true], ['commentary', 'Commentator (one line on the big moments)', true]];
  var togLook = [['avatar', 'Show me at the table (3D)', true], ['shots', 'Camera close-ups (challenges, wins, the Goal)', true], ['replay', 'Goal replays (the Solution flies together)', true], ['fireworks', 'Fireworks on big wins', true]];
  var togGame = [['gloat', 'Creatures gloat when they win', true], ['trash', 'Creatures trash-talk (playful teasing)', true], ['bluff', 'Creatures bluff (say things that may not be true)', false]];
  var tab = window.settingsTab || 'sound';
```

2. Make four strings from the existing rows (cut/paste, no row changes):
   - `sound` = the existing Sound group (music, effects, mute) + "Read lines aloud" row + `togSound.map(tog).join('')`.
   - `look` = `togLook.map(tog).join('')` + the rows "3D table and dice", "Title screen show", "Stadium weather",
     "My player looks like", "Look around the table", "3D picture quality", "Watch the intro again", and the
     "What's new" row above.
   - `game` = the "You" group (name, shirt back name, jersey) + "Name your creatures" group + "Shakes per match" row +
     `togGame.map(tog).join('')`.
   - `parent` = the whole Parent corner group + the "Move progress to another device" group.

3. Output:

```js
  var tabs = [['sound', ico('sound') + ' Sound'], ['look', ico('star') + ' Look'], ['game', ico('dice') + ' Game'], ['parent', ico('cap') + ' Parent corner']];
  var parts = { sound: sound, look: look, game: game, parent: parent };
  if (!parts[tab]) tab = 'sound';
  $('#settings').innerHTML = '<div class="hdr"><button class="btn small" data-act="home">' + ico('back') + ' Back</button><h2>' + ico('gear') + ' Settings</h2></div><div class="panel">' +
    '<div class="seg set-tabs" role="tablist" style="flex-wrap:wrap;margin-bottom:12px">' + tabs.map(function (t) { return '<button role="tab" aria-selected="' + (t[0] === tab) + '" class="' + (t[0] === tab ? 'on' : '') + '" data-act="settingsTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div class="group">' + parts[tab] + '</div></div>';
```

```js
ACT.settingsTab = function (el) { window.settingsTab = el.dataset.arg; Snd.click(); renderSettings(); $('#settings').scrollTop = 0; };
```

Every `renderSettings()` call after a toggle keeps the same tab (it's a global), so nothing jumps.
Other helpers' rows (`Vari.parentHTML()`, `Bonus.parentHTML()`) stay inside `parent`. The `data-set` range inputs
keep working (the document-level `input` listener doesn't care where they are). The `textarea#exportBox` is only in
the DOM on the Parent tab, which is fine: `copyCode` is only on that tab too.

## Verified (Chrome in the desktop app's pane, port 3513, own tab)

- `node tests/engine.test.js`: 822 passed.
- 3D title at **1280x800** (panel 528 px tall, no scroll), **1024x768** (panel 528 px, no scroll), **390x844** (panel at
  the bottom, page and panel don't scroll, scene still visible above). Flat 2D title (`S.set.three = false`) at
  1280x800, 1024x768, 390x844: no scroll after tightening the flat logo/Pip size.
- Clicked every entry: Play (starts `ai` vs Snoozy), Pick who, 3 Players (all 3 choices: trio pick pop-up, Play screen
  scrolled to Three at the table, the 3 Players set-up pop-up), Play with Tata (Team-up pop-up, 2 Players starts `pvp`,
  Online pop-up, Puzzle from Tata screen), Cups, Training Camp, My kit, Trophy Room, Season Table, My Stats, Settings,
  How to Play (starts the tutorial). Picking Grub on the Play screen made Play say "against Grub".
- Tour: started by itself after the opening, went through all 6 stops with Next and Got it! (wide and portrait card
  placement), Skip, Esc; not shown again afterwards; replay via `ACT.tourReplay`; not shown on a new save before the
  tutorial (and no badges); starting a match while it waited cancelled it (it came back on the next title); works on
  the flat title. Badges cleared on first open.
- `tour.js` / `tour.css` were injected into the page for testing, since index.html doesn't link them yet.

## Not verified / notes

- Not on a real iPad or phone (touch, Safari backdrop blur). Not checked: phone landscape (the panel scrolls inside if
  needed), screen readers beyond the markup (dialog role, labelled title/text, tab-able buttons).
- The "Pick who" change to `ACT.mmPick` was made after the browser pass (syntax-checked only; it just sets
  `window.setupTab` and calls `ACT.setup`).
- Found, not mine: quitting the tutorial within 1.7 s throws `Cannot set properties of null (setting 'step')` at
  `js/tutorial.js:19` (a `setTimeout` uses `TUT` after `reallyQuit` set it to null). Fix: `if (!TUT) return;` at the top
  of that timeout.
- The tour also starts right after he quits a match back to the title (if it still has unseen stops). It never shows
  during a match or over a pop-up.

## Judgment calls

- Big Play starts a match at once (as the owner described), so "Pick who" sits right next to it for choosing.
- "Play with Tata" holds Team-up, 2 Players, Online and Puzzle from Tata; "3 Players" holds both trio ways and the
  family game, so 3-player play is one tap from the title.
- Trophy Cabinet and Spot the Fan stay inside the Trophy Room (four "My stuff" tiles fit a phone row; more would not).
- The tour's first stop points at Play for the look-around/photo tip, because those controls only exist in a match.
- Stop 6 is for Tata ("Grown-ups: ..."), kept short so it doesn't confuse the kid.
