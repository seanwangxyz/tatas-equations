# Handoff: Online play (agents `online`, `online2`)

Tata (Houston) and the kid (Atlanta) each play on their own device, with FaceTime running alongside for voice. One
device **hosts** (it shows a code like **FROG 47**), the others **join** by typing that code. Since round 8: **two or
three players** (a host and up to two guests; the third seat can also be a creature the host picks, so "Tata + Tyson +
a creature" works on two devices), **all 19 variation cards and the bonus dice** online, **Play again** for everyone
in the room, each player's own **3D look** at the other devices' tables, a "you're offline" line, a share button.

## Files

- `js/online-config.js` (the Firebase settings; `null` until the user pastes them), `js/online-net.js` (transport, two
  back ends), `js/online.js` (game sync, lobby, reconnect, rematch, avatars), `css/online.css`.
- `docs/handoff/firebase-rules.json` is owned by the accounts helper now: the **new `rooms` rules are below**, to be
  merged into it (round 8 changed the room layout, so the old rules refuse the new rooms).
- Unchanged hooks from round 6: `index.html` loads the files; `js/game.js` has `startMatch → Online.setup`, the jersey
  in `renderGame`, and `'online'` counting as a pass-and-play shake in `endShake`; `js/screens.js` has the Online card;
  `js/config.js` gives each `?onlinetest=1&p=X` tab its own save.
- Everything else is done from `js/online.js` by wrapping existing functions. **Every wrapper calls the original
  unchanged unless an online match is on** (`G.mode === 'online'`); the Bonus wrappers also only act for the host of
  an online match. I re-checked 'pvp' and 'ai' start and play as before; `node tests/engine.test.js` 822/822.

## The design

**Host-authoritative.** The host device is the referee. It runs the real game (`G`, all of `js/game.js`) like a
pass-and-play match in mode `'online'`: player 0 = the host's player, then the guests' players, then the creature (if
any). `G.slots[i]` says which room seat plays player `i` (0 = host, 1 / 2 = guests, −1 = creature).

1. **State, host → guests.** After every change the host publishes the whole game as one JSON string at
   `rooms/CODE/state` (about 5–15 KB) and saves it to its own localStorage (survives a reload).
2. **Mirror, on each guest.** A guest never runs game rules. It checks the state (24 official cubes + up to 8 bonus
   cubes, real faces, names cut to 14 characters, card settings and the Twist reduced to plain checked values, result
   lines stripped to text + bold) and builds a "mirror" `G` **seen from its own seat** (its player becomes player 0;
   the seating order is kept, so "play passes to the left" is the same on every device). Then the normal `renderGame()`.
3. **Actions, guests → host** at `rooms/CODE/acts/SEAT/N` (SEAT = 1 or 2, so the database rules can tell who sent it):
   `move`, `ch` (Now! / Impossible!, also out of turn with three players), `goal`, `nogoal`, `ans` (an answer to a
   question), `ready` (closed the results), `emote`, `leave`. The host **checks each one with its own game and the
   engine** (is it that player's turn / were they allowed to challenge? is that cube in Resources? does every symbol
   use the face that cube really shows: `Eq.cubeOf(sym) === cube.s`? `Eq.checkGoal` / `Eq.checkSolution` with the
   host's own math mode) and applies it with the game's own functions, then deletes the message.
4. **Questions (prompts)** for one guest's private input: a Solution (`sol`), a Goal for a "No Goal" challenge
   (`goal`), a variation card (`vari`, with the k / base / colour choice), "Impossible! or write?" after the last cube
   (`last`), Third Party "write one too?" (`tp`), agree/challenge a "No Goal" call (`nogoal`).
5. **Private writing, revealed together.** Nothing anybody writes is shown until the shake's results. After the last
   cube **everybody writes at the same time** (the guests are asked first, then the host's own builder opens).
6. **Three players** use the official rules already in the game: challenger / mover / Third Party (`Eq.scoreChallenge`).
   The Third Party decides **on their own device** after the writer has written (same order as pass-and-play). After
   the last cube and after a "No Goal" call, every other person answers on their own device: the **first**
   Impossible! / Challenge! wins (the other questions are withdrawn), all "Let's write!" / "I agree" continues.
   A creature in the third seat thinks first, as in a normal match. With three players everybody gets
   "You can challenge too: Now! Impossible!" when it isn't their turn and they didn't make the last move.
7. **Prompt ids come from the game position**, so after a host reload the same question gets the same id and an answer
   that already arrived is used again.
8. **The next shake starts when everybody has closed the results.** No timers anywhere.
9. **Dice.** The host's pour decides the faces; each guest plays its own pour animation and the cubes glide to the
   host's faces. In 3D a guest also sees the other person / the creature carry each moved cube over (and its own
   player carries its own cube) before it lands.

### Cards online (round 8)

- All 19 cards. `symOK` accepts every symbol the engine has a cube for (`Eq.cubeOf(s) !== null`) plus `'!'`;
  `safeTokens` keeps `'!'`; `cubeTokens` checks `Eq.cubeOf(t.s) === cube.s` (an upside-down 3 must be on a 3 cube, a
  `²` exponent on a red 2 under Red Exponent, a gold `F` on the Power die …). `G.vari`, `G.variSet` (`k`, `base`,
  `ecol`, `eids`) and the math mode (including Exponent Colour's live zone counts `ex`, which the host re-publishes
  after every move) travel in the state. The host's own `G.fractions` stays live (and is made live again after a host
  reload).
- **Which cards may be offered (judgment call): the Goal-setter's own device decides.** When a guest sets the Goal, the
  host offers the cards **earned on that guest's device and left switched on in that device's Parent corner** (sent in
  the seat info as `vc`), filtered by the host with `Vari.hasEffect` for this shake. When the host sets the Goal, the
  normal picker runs with the host's cards; a creature uses the host's cards. Why: a card is a player's own reward (it
  unlocks with that player's skill points), the kid's device still respects Tata's switches for the kid, and nobody is
  handed a card they haven't learned. The union would give the kid Tata's Middle cards; "host's only" would hide the
  kid's own cards when Tata hosts.
- A guest's card answer is checked: a card that was offered, k 6–11, base 8 or 9, a colour that has a digit in
  Resources.

### Bonus dice online (round 8)

- **The host's dice** (earned on the host device and switched on in its Parent corner) join the roll, with a
  **"Bonus dice … On / Off" switch in the lobby** (only shown when the host has dice). Why the host's: the dice belong to
  the table, not to one player, like "Shakes per match" (the host's). Tata can "Unlock now" a die in the Parent corner
  of the device he hosts on.
- `js/bonus.js` only rolls dice for `'ai'` / `'pvp'` matches, so for the host's own `Bonus.onShake` /
  `Bonus.beforeGoal` calls the match briefly counts as `'pvp'` (or as a mode without dice when the switch is off).
  Only the public `Bonus` API is used. **If `Bonus.activeFor({mode:'online'})` ever returns true** (snippet 2 below)
  the trick switches itself off. Nothing reads the Twist **die mesh**: `G.twist` is published as plain data (whatever
  keys it has, short strings / numbers only), so the Twist **deck** being built in `js/bonus.js` should travel as long
  as it keeps producing `G.twist`.
- Bonus cubes (ids 24+) travel with the cubes; the guests' chip, banner and Bonus +2 / Golden Goal results come from
  the host (`Bonus.adjust` runs inside the host's `endShake`, the published points include it). A new-die celebration
  and a Power-op lesson appear on the **host** device only (a guest sees "Getting ready…").

### Seats, lobby, Play again, leaving

- Room: `{ v: 2, host, created, locked, guests: {1: uid, 2: uid}, seats: {0,1,2: info}, state, acts: {1: {...}, 2:
  {...}}, here: {0,1,2} }`. Seat info: name, jersey, `who` (kid / tata from Settings "My player looks like"), `back`
  (name on the shirt), `kit` (JSON of the kit he wears: colours `#rrggbb`, a few words, on/off flags; empty for a
  grown-up, who wears Tata's yellow), `vc` (cards), `stage` (unlocked operations), `rdy` (ready for match number).
- **Lobby (host):** the code, **Share the code** (share sheet on a phone/tablet, else copied), who has joined (✔ / not
  connected), the third seat (nobody / a creature, when only one guest is in), whose cubes (when the players' unlocked
  operations differ), the bonus switch, Kick off (needs one guest). **Lobby (guest):** who is in, "Waiting for Tata…".
- The room is **locked** while a match is on (a new code-typer gets "That game has already started…"), and unlocked
  after it, so a third player can join for the next match. A guest who was in the match can always come back.
- **Play again:** everybody gets "Play again / Leave". A guest's tap = ready ("Waiting for Tata to start…", with who is
  ready); the host's tap opens the lobby again (who is ready, creature, cubes, dice) and "Start the next match!" uses
  everybody who is ready (someone still deciding watches and plays next time). **The first Goal-setter moves round**
  (match k starts with player k mod n).
- **A guest leaves** (Menu → Leave): in the lobby or after a match their seat is freed. **During a match** the seat
  stays theirs (the same code brings them back) and every device shows "**Mama** left the game…". The host's line has
  **"🦥 Snoozy plays for Mama"**, **Keep waiting**, **End the match**. A creature playing for someone answers the open
  question the creature's way (writes the Solution, decides as Third Party, …) and plays on; when the person is back,
  they get their seat back **at the next shake** ("Mama is back! They play again from the next shake.").
- **A guest drops** (Wi-Fi, locked iPad): after 3 calm seconds the same line says "lost connection: waiting…" (the host
  can again let a creature play for them). The game naturally waits only when it needs them.
- **The host drops:** guests see "Tata lost connection: waiting…" with Keep waiting / Leave the game. **The host
  leaves:** the room is deleted and everybody gets "The game has ended" (as before).
- **This device offline:** "📶 You're offline: reconnecting… Your moves are kept and sent when the Wi-Fi is back."
- **Reload / closed tab** (within 24 h), any seat: the splash button says **Back to my online game**.
- **Abandoned rooms:** the host deletes the room when it goes back to the menu (Leave, the end-of-match Menu, End the
  match), and a room this device hosted and never closed is deleted when it hosts a new game.

### Progress (each device records only its own player)

As before, plus "Smart Third Party play" XP for a guest. No creature is beaten, no "Tata's Record".

### The people at the table (3D)

Each device: its own player at the near side (`T3.playerSet`, kid / grown-up from its own Settings). A creature
(third seat, or playing for someone) across the table (`setCreature` / `T3.setCreatures`). The other human from their
seat info (`who`, `back`, `jersey`, `kit`): `'far'` when no creature is there, `'left'` when a creature is across.
**The 3D table has one mate (`T3.mate`)**, so with three humans each device shows the next player in turn order at
`'far'`; the third human is in the HUD only (a second mate would need a 3D change, see below).

## Please paste (I edited none of these files)

**1. `js/game.js`, `avatarMoveFn` (optional, recommended).** Lets the host's own player and the guest shown as the
mate carry their cubes in 3D **on the host's device** (guests already animate on their side). Replace the line

```js
  if (!T3.active() || !T3.playerMove || G.mode === 'online' || G.mode === 'tutorial') return null;
```
with
```js
  if (!T3.active() || !T3.playerMove || G.mode === 'tutorial') return null;
  if (G.mode === 'online') return window.Online && Online.moveFn ? Online.moveFn(who) : null; // host: its player / the mate carry the cube
```
and update the comment above it to "(Online: js/online.js says who carries a cube.)". A remote move then runs through
`humanPlace` (busy while carried); `js/online.js` already refuses moves while `G.busy` / `G.carrying`.

**2. `js/bonus.js` (for the Twist-deck helper):** in `activeFor` allow online for the host's match, and fix the
Parent-corner wording:

```js
  function activeFor(g) { return !!g && (g.mode === 'ai' || g.mode === 'pvp' || (g.mode === 'online' && !!(window.Online && Online.isHost()))); }
```
`' Bonus dice play in matches against creatures and in pass-and-play (not online).'` → `' Bonus dice play in matches
against creatures, in pass-and-play and online (the host\'s dice, switch in the online lobby).'`, and the header
comment line "Online play: never …" → "Online play: the host's dice (js/online.js)". `js/online.js` works with or
without this snippet (it then stops using its temporary 'pvp' trick by itself), and it still respects the lobby's Off
switch either way.

**3. `js/three/player.js` (only if wanted):** a second mate (`T3.mate2`, seat `'right'`) would let a device show
both other humans in a three-human game; `avatars()` in `js/online.js` would then call it for the second human.

## Proposed database rules for `rooms` (merge into `docs/handoff/firebase-rules.json`)

Replace the whole `"rooms"` block with this (the rest of the file, for accounts, stays as the accounts helper has it):

```json
"rooms": {
  "$code": {
    ".read": "auth != null",
    ".write": "auth != null && ((!data.exists() && newData.child('host').val() === auth.uid) || (data.exists() && !newData.exists() && (data.child('host').val() === auth.uid || data.child('created').val() < now - 172800000)))",
    ".validate": "$code.matches(/^[A-Z]{3,6}[0-9]{2}$/) && newData.hasChildren(['v', 'host', 'created'])",
    "v": { ".validate": "newData.val() === 2" },
    "host": { ".validate": "newData.isString() && newData.val().length <= 128 && (!data.exists() || newData.val() === data.val())" },
    "created": { ".validate": "newData.isNumber() && ((data.exists() && newData.val() === data.val()) || (!data.exists() && newData.val() <= now && newData.val() > now - 600000))" },
    "locked": {
      ".write": "auth != null && root.child('rooms/' + $code + '/host').val() === auth.uid",
      ".validate": "newData.isBoolean()"
    },
    "guests": {
      "1": {
        ".write": "auth != null && ((!data.exists() && newData.val() === auth.uid && root.child('rooms/' + $code + '/locked').val() !== true && root.child('rooms/' + $code + '/created').val() > now - 86400000 && root.child('rooms/' + $code + '/host').val() !== auth.uid && root.child('rooms/' + $code + '/guests/2').val() !== auth.uid) || (data.val() === auth.uid && (!newData.exists() || newData.val() === auth.uid)) || (root.child('rooms/' + $code + '/host').val() === auth.uid && !newData.exists()))",
        ".validate": "newData.isString() && newData.val().length <= 128"
      },
      "2": {
        ".write": "auth != null && ((!data.exists() && newData.val() === auth.uid && root.child('rooms/' + $code + '/locked').val() !== true && root.child('rooms/' + $code + '/created').val() > now - 86400000 && root.child('rooms/' + $code + '/host').val() !== auth.uid && root.child('rooms/' + $code + '/guests/1').val() !== auth.uid) || (data.val() === auth.uid && (!newData.exists() || newData.val() === auth.uid)) || (root.child('rooms/' + $code + '/host').val() === auth.uid && !newData.exists()))",
        ".validate": "newData.isString() && newData.val().length <= 128"
      },
      "$other": { ".validate": false }
    },
    "seats": {
      "$s": {
        ".write": "auth != null && (($s === '0' && root.child('rooms/' + $code + '/host').val() === auth.uid) || (($s === '1' || $s === '2') && (root.child('rooms/' + $code + '/guests/' + $s).val() === auth.uid || (!newData.exists() && root.child('rooms/' + $code + '/host').val() === auth.uid))))",
        ".validate": "($s === '0' || $s === '1' || $s === '2') && newData.hasChildren(['name', 'jersey'])",
        "name": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 14" },
        "jersey": { ".validate": "newData.isString() && newData.val().length <= 2" },
        "who": { ".validate": "newData.val() === 'kid' || newData.val() === 'tata'" },
        "back": { ".validate": "newData.isString() && newData.val().length <= 12" },
        "kit": { ".validate": "newData.isString() && newData.val().length <= 600" },
        "vc": { ".validate": "newData.isString() && newData.val().length <= 300" },
        "stage": { ".validate": "newData.isString() && newData.val().length <= 600" },
        "rdy": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000" },
        "$other": { ".validate": false }
      }
    },
    "state": {
      ".write": "auth != null && root.child('rooms/' + $code + '/host').val() === auth.uid",
      ".validate": "newData.hasChildren(['seq', 'g'])",
      "seq": { ".validate": "newData.isNumber()" },
      "g": { ".validate": "newData.isString() && newData.val().length <= 150000" },
      "$other": { ".validate": false }
    },
    "acts": {
      "$s": {
        "$n": {
          ".write": "auth != null && ($s === '1' || $s === '2') && ((!data.exists() && root.child('rooms/' + $code + '/guests/' + $s).val() === auth.uid) || (!newData.exists() && root.child('rooms/' + $code + '/host').val() === auth.uid))",
          ".validate": "$n.matches(/^[0-9]{1,7}$/) && newData.isString() && newData.val().length <= 4000"
        }
      }
    },
    "here": {
      "$s": {
        ".write": "auth != null && (($s === '0' && root.child('rooms/' + $code + '/host').val() === auth.uid) || (($s === '1' || $s === '2') && root.child('rooms/' + $code + '/guests/' + $s).val() === auth.uid))",
        ".validate": "newData.isBoolean()"
      }
    },
    "$other": { ".validate": false }
  }
}
```

In plain words: only the host creates, locks/unlocks and deletes a room and writes the game state (≤ 150,000
characters); a guest can take a free guest seat only while the room is unlocked and less than a day old, can't take
both seats, and can't be the host; each player writes only their own seat info (fixed fields with size caps), their
own "I'm here" flag and their own move messages (`acts/<their seat>`, ≤ 4,000 characters each, never overwriting one);
the host may delete move messages and free a guest seat; anyone may delete a room older than 2 days; nothing else exists.
**Not run through Firebase's rules simulator** (please do that once when pasting).

## What the user has to do in the Firebase console

Unchanged from round 6 (project, Realtime Database in locked mode, Anonymous sign-in, authorized domain, paste the web
config into `js/online-config.js`, stay on the free Spark plan), except: **publish the merged rules above**. The round-6
console steps are kept in git history (`git show eeac812:docs/handoff/online.md`).

## How to test with two or three "devices" on one computer (no Firebase)

1. `python -m http.server 3515 --bind 127.0.0.1` in the project folder.
2. All "devices" must share **one origin** (the pretend database is that origin's localStorage). Tabs:
   `http://127.0.0.1:3515/?onlinetest=1&p=a`, `…&p=b`, `…&p=c` (`p=` = its own save and device id).
   Background tabs slow timers down a lot; what worked best: one visible page on the same origin (e.g. the server's
   404 page) with three `<iframe src="/?onlinetest=1&p=a|b|c">` side by side, driven from the console
   (`frames[0].ACT.olHost()` …). Switching 3D off (Settings) makes it faster.
3. Console helpers in each frame: `TataOnline.O()` (session), `TataOnline.drop(true/false)` (Wi-Fi off / on),
   `TataOnline.sub(i)` (host: a creature plays for player i), `TataGame.move(id, zone)`.
4. Remove the test data afterwards: `Object.keys(localStorage).filter(k => /^tataNet|\.test\.|tataOnline/.test(k)).forEach(k => localStorage.removeItem(k))`.

## What I verified (round 8, local back end, three iframes on 127.0.0.1:3515) and what I didn't

Verified by playing (real action handlers, builder submit / give-up, the guests' real pop-up buttons):
- Lobby with 3 humans (Tata, Tyson, Mama), "joined" list on host and guests; kick-off; rotation of every view
  (each device is player 0, order kept).
- 3 humans, all phases: Now! out of turn by a guest (Mama) → her private Solution → Third Party guest (Tyson) "I'll
  write one" → wrong Solution → correct 6 / 2 / 2 scoring on all devices; host Impossible! out of turn → guest mover's
  correct Solution using the **gold ½× Power cube** under the **Base 9** card (from the **Twist**) → 6 / 2 / 2; the
  "No Goal" call by a guest with the host's local "I agree" and the other guest's Challenge → their Goal and free
  Solution; the last cube with all three: one guest's Impossible! closed the host's own pop-up and started the challenge;
  all "Let's write!" → everybody writing at once (a guest's answer arriving before the host's kept) → 2 / 2 / 2.
- Two humans + creature (Snoozy): the creature setting Goals, moving, calling Now! / Impossible!, the guest as Third
  Party; a guest picking **Exponent Colour** (red) in the online picker and setting the Goal `2²` with the red cube as an
  exponent (mode, `eids`, `ex` identical on both devices); **Multiple of 7** (host) with a guest's Third Party Solution
  `9 ÷ 1` (= 2 + 7) accepted by the host; an **upside-down** Solution `−6 ÷ −3` from a guest under Upside-down;
  **Factorial** Goal `4!` built by a guest (the `'!'` travels); **Base 8** picked by a guest (setting chooser).
- Bonus dice: Big-number + Power cubes rolled and mirrored (26 cubes), the Twist read on the host and shown on the
  guests (chip, banner) as Bonus +2, Base 9, Base 8; the lobby switch Off → 24 cubes.
- Forged guest messages refused: a move out of turn, a Goal outside the Goal phase, an unknown answer id, a garbage id,
  and a Solution whose symbol doesn't match the cube's face ("could not be read", scored as no Solution).
- Rematch: Play again from a guest + host lobby (ready marks), a guest leaving at the end (seat freed), the rotating
  first setter, a creature added for the rematch, a third player joining the unlocked room for the next match.
- A guest leaving mid-match (seat kept, "left the game" line on the host with "Snoozy plays for Mama"), a creature
  taking over and the game moving on, the guest re-typing the code and getting the seat back at the next shake.
  A guest's Wi-Fi off (`drop`): own "You're offline" line, host's "lost connection" line after the calm wait,
  "Grub plays for Tyson" (Grub wrote his Solution), back online → seat back at the next shake.
- Reload: guest (Back to my online game, same position) and host (move phase; the guest saw "Tata lost connection"
  and then nothing). 3D on two devices with a creature: the right mate spec on each side (`who`, back name, number,
  kit) and the guest's carried-cube animations converging to the host's state. 2-player online (no creature) still
  plays (guest Impossible!, host's Solution). `'pvp'` and `'ai'` still start. Host leaving → both guests "The game
  has ended", room data gone. `node tests/engine.test.js`: 822 passed.

Not verified: the real Firebase back end and the proposed rules (no project yet; rules not simulated), real devices /
phones (touch, the share sheet), Safari. A reload of the **third** seat specifically (same code path as the second).
In my narrow test frames the guest's `'left'` mate reported "doesn't fit" (the 3D module's own placement for a small
window); the host's did fit. One `isReady` error appeared in a host frame when I quit a 3D match during its pour
(not online code; from the 3D side).

## Known limits / rough edges

- Three humans: each device shows only the next player in 3D (one mate in the 3D API).
- A celebration / Power-op lesson / "creature picked a card" pop-up on the **host** pauses everybody until the host
  taps it.
- A guest who **re-types the code** (instead of reloading) while a results pop-up is open may get that shake's XP twice
  (a reload is fine: the session remembers).
- If the host reloads while a guest has a half-built Goal for a "No Goal" challenge, that step starts over.
- A room left behind by apps that were just closed is cleaned when that host hosts again, or by anyone after 2 days
  (rules); otherwise by hand in the console.
