# Handoff: Online play (agent `online`)

Tata (Houston) and the kid (Atlanta) each play on their own device, with FaceTime running alongside for
voice. One device **hosts** (it shows a code like **FROG 47**), the other **joins** by typing that code.

## Files

- New: `js/online-config.js` (the Firebase settings; `null` until the user pastes them), `js/online-net.js`
  (transport, two back ends), `js/online.js` (game sync, menus, reconnect), `css/online.css`,
  `docs/handoff/firebase-rules.json` (the security rules, ready to paste).
- `index.html`: loads `css/online.css` and the three scripts (after `js/tutorial.js`, before `js/main.js`).
- `js/game.js`, three one-line changes:
  - `startMatch`: `else if (mode === 'online') Online.setup(G, cfg);`
  - `renderGame`: a human player who isn't player 0 shows their own jersey (`p.jersey`) instead of their seat number
    (no other mode sets `p.jersey`, so nothing else changes).
  - `endShake`: `'online'` counts as a 2-player shake (`S.stats.pvpShakes`, the "Good Sport" badge).
- `js/screens.js`: one line adds the **Online** card at the start of "Play with people".
- `js/variations.js`: exports `cardHTML` (the guest draws the same card buttons).
- `js/social.js`: the vs screen and Player of the Match card show a player's own jersey (`p.jersey`) if there is one.
- `js/config.js`: one line: with `?onlinetest=1&p=b` in the address the save key gets a `.test.b` suffix, so two test
  tabs in one browser are two different players. Without that flag nothing changes.
- Everything else is done from `js/online.js` by wrapping existing functions. **Every wrapper calls the original
  unchanged unless an online match is on** (`G.mode === 'online'`). I re-checked 'pvp' (the "Pass to…" pop-ups
  still appear) and 'ai' after the change; `node tests/engine.test.js` still passes 320/320.

## The design

**Host-authoritative.** The host device is the referee. It runs the real game (`G`, all of `js/game.js`) exactly
like a pass-and-play match in a new mode `'online'`: player 0 = the host's player, player 1 = the guest's player.

1. **State, host → guest.** After every change (every `renderGame()` on the host, debounced) the host publishes the
   whole game as one JSON string at `rooms/CODE/state` (about 5–10 KB). It also saves the same thing to its own
   localStorage, so it survives a reload.
2. **Mirror, on the guest.** The guest never runs game rules. It checks the state (24 real cubes, real symbols,
   names cut to 14 characters, result lines stripped to plain text + bold) and builds a "mirror" `G` **seen from
   its own seat**: its own player becomes player 0, so the HUD, the "your turn" lines, the 3D table and the 3D kid
   are all "me". Then it calls the normal `renderGame()`.
3. **Actions, guest → host.** The guest's taps become small messages at `rooms/CODE/acts/N`: `move`, `ch` (Now! /
   Impossible!), `goal`, `nogoal`, `ans` (an answer to a question), `ready`, `rematch`, `emote`, `leave`. The host
   checks each one (is it really that player's turn? is that cube really in Resources?) and applies it with the
   game's own functions (`doMove`, `ACT.callNow`, `setGoal`, …), then deletes the message.
4. **Questions (prompts).** When the game needs the guest's own private input, the host puts a prompt for that seat
   into the state; the guest opens its builder or pop-up on its own device and sends the answer back:
   - a Solution after Now! / Impossible! / the last cube / a "No Goal" challenge (`sol`),
   - a Goal for a "No Goal" challenge (`goal`),
   - a variation card when the guest sets the Goal (`vari`),
   - "Impossible! or Let's write?" after the host played the last cube (`last`),
   - agree or challenge the host's "No Goal" call (`nogoal`).
   The host does this by wrapping `openSolutionBuilder`, `openGoalBuilder`, `askNoGoal`, `lastCubePlayed` and the
   card pick in `startGoalPhase`: for player 0 they run as before; for the remote player they ask.
5. **Private writing, revealed together.** Nothing the guest writes is shown on the host until the shake's results
   (and the host's own Solution never travels until then either). After the last cube **both write at the same
   time**: `startLastWrite` sends the guest its question first, then opens the host's own builder.
   The results pop-up (the same lines, Solutions and scores) appears on both devices.
6. **Prompt ids come from the game position** (match, roll number, kind, move counter, seat). After a host reload the
   same question gets the same id, so an answer that already arrived (saved by the host) is used again.
7. **The next shake starts when BOTH players have closed the results** (`nextShake` waits for the guest's `ready`).
   Nobody can be hurried: there are no timers anywhere.
8. **"Waiting for Tata…"** replaces every "Pass the device to…" pop-up (`multiHuman()` returns false online, so
   every pop-up on a device is for that device's own player).
9. **Dice.** The host's pour (physics) decides the faces. The guest plays its own pour animation at the same moment
   (after the vs screen on the first shake); when the host's faces arrive, the guest's cubes glide into their slots
   showing the host's faces. Both devices always show the same cubes.
10. **Sounds and moments** on the guest (the Goal chime, the NOW!/IMPOSSIBLE! banner, the cube thunk, the variation
    card chip, the end-of-match fireworks) are triggered by comparing the old and new state, so a reconnect never
    replays them.
11. **Emotes** (the fixed phrases and 🤝 / 😎) are relayed both ways and appear as the other player's bubble.
    No free text exists anywhere.

### Who the host is doesn't matter

Either device can host. The host's **Shakes per match** setting is used. In the lobby, if the two devices have
different operations unlocked, the host picks **whose cubes** to play with (for example the kid's unlocks, so
Tata doesn't get roots the kid hasn't learned yet). Variation cards: whoever sets the Goal picks from the cards
unlocked on **their own** device.

### Progress (each device records only its own player)

Online counts like a 2-player pass-and-play match (`'pvp'`), seen from each device:
- Your own correct Solutions: the normal XP, skill star, stats, badges (recorded by the builder on your device).
- Your own Now!/Impossible! calls and "clever move" bonus: the same XP rules as `'pvp'` (the guest applies the
  same rules to the shared result, for its own seat only).
- Goals you set, shakes played, "Good Sport" shakes, the no-hint streak, and a match win badge ("Comeback Kid",
  "Perfect Match") if you win.
- No creature is beaten, nothing unlocks a creature, no "Tata's Record". Exactly like `'pvp'` today.

### Reconnecting

- **The other player drops** (Wi-Fi, locked iPad, closed tab): after 3 calm seconds a banner says
  "**Tata** lost connection: waiting…" with **Keep waiting** (hides the buttons, the line stays) and
  **End the match** (asks once, then ends it; nobody loses anything). When they come back: "Tata is back!".
  Nothing is ever timed out.
- **Coming back after a reload / closed tab / restart** (within 24 hours): the splash button says
  **Back to my online game** and goes straight back into the same match.
  - Guest: re-reads the state; an unanswered question re-opens (a half-built Solution has to be built again).
  - Host: restores its saved game and continues from the same position. Whatever was half-way on the host itself
    (its own builder, a pop-up) is simply asked again. The guest's answers that already arrived are kept.
- **While a device is offline** Firebase keeps its moves in a queue and sends them when it reconnects.
- **Leaving on purpose** (Menu → Leave, the Menu button at the end): the host deletes the room; the guest frees its
  seat. The other device gets a friendly "left the game / the game has ended" pop-up with a Menu button.

## What the user has to do in the Firebase console (plain English)

You need a free Google Firebase project with a **Realtime Database** and **Anonymous sign-in** switched on. About
15 minutes. Nothing here costs money: the free "Spark" plan is plenty (each match moves well under 1 MB).

1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. **Create a project**: click **Create a project** (or **Add project**). Name it e.g. `tatas-equations`.
   Google Analytics: you can switch it **off** (not needed). Click **Create project**, then **Continue**.
3. **Make the database**: in the left menu open **Build → Realtime Database** and click **Create Database**.
   - Location: **United States (us-central1)** is fine.
   - Security rules: choose **Start in locked mode**. Click **Enable**.
4. **Paste the security rules**: still in Realtime Database, open the **Rules** tab. Delete everything in the box,
   paste the whole contents of `docs/handoff/firebase-rules.json` (also printed below), and click **Publish**.
5. **Switch on anonymous sign-in** (needed: the rules use it to tell the host and the guest apart; nobody types an
   email or password, and the kid has no account):
   left menu **Build → Authentication** → **Get started** → **Sign-in method** tab → click **Anonymous** →
   switch **Enable** on → **Save**.
6. To be safe, also add the website's address there: **Authentication → Settings → Authorized domains → Add domain**
   → type `profsean.wang` → **Add**. (`localhost` is already in the list.)
7. **Register the website and copy its settings**: click the gear ⚙ next to **Project Overview** →
   **Project settings** → in **Your apps** click the **</>** (Web) button. Nickname: `tatas-equations-web`.
   Leave "Firebase Hosting" **unticked**. Click **Register app**. Google shows a block of code containing
   `const firebaseConfig = { apiKey: "...", authDomain: "...", databaseURL: "...", projectId: "...", ... };`
   Copy just the part from `{` to `}` and send it to the lead (or paste it yourself, step 8).
   - **Check that it contains `databaseURL`.** If it doesn't, copy the database address from the top of the
     **Realtime Database → Data** page (it looks like `https://tatas-equations-default-rtdb.firebaseio.com`) and add
     `databaseURL: "that address",` inside the braces.
8. **Paste it into the game**: open `js/online-config.js` and change the last line to
   `window.FIREBASE_CONFIG = { apiKey: "…", authDomain: "…", databaseURL: "…", projectId: "…", storageBucket: "…", messagingSenderId: "…", appId: "…" };`
   then publish the site as usual. (This "web config" is not a password: every Firebase website sends it to every
   visitor. The security rules are what protect the data. It will be visible in the public GitHub repo, and that's
   normal for Firebase websites.)
9. **Optional, recommended: a spending cap you can't exceed.** Stay on the free **Spark** plan (don't upgrade to
   Blaze). On Spark, Google can never charge you; if the free limits were ever hit the database just pauses.

### The rules to paste (same as `docs/handoff/firebase-rules.json`)

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null && ((!data.exists() && newData.child('host').val() === auth.uid) || (data.exists() && !newData.exists() && (data.child('host').val() === auth.uid || data.child('created').val() < now - 172800000)))",
        ".validate": "$code.matches(/^[A-Z]{3,6}[0-9]{2}$/) && newData.hasChildren(['v', 'host', 'created'])",
        "v": { ".validate": "newData.val() === 1" },
        "host": { ".validate": "newData.isString() && newData.val().length <= 128 && (!data.exists() || newData.val() === data.val())" },
        "created": { ".validate": "newData.isNumber() && ((data.exists() && newData.val() === data.val()) || (!data.exists() && newData.val() <= now && newData.val() > now - 600000))" },
        "guest": {
          ".write": "auth != null && ((!data.exists() && newData.val() === auth.uid && root.child('rooms/' + $code + '/created').val() > now - 86400000) || (data.val() === auth.uid && !newData.exists()) || (root.child('rooms/' + $code + '/host').val() === auth.uid && !newData.exists()))",
          ".validate": "newData.isString() && newData.val().length <= 128"
        },
        "seats": {
          "$s": {
            ".write": "auth != null && (($s === '0' && root.child('rooms/' + $code + '/host').val() === auth.uid) || ($s === '1' && root.child('rooms/' + $code + '/guest').val() === auth.uid))",
            ".validate": "($s === '0' || $s === '1') && newData.hasChildren(['name', 'jersey'])",
            "name": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 14" },
            "jersey": { ".validate": "newData.isString() && newData.val().length <= 2" },
            "cards": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 9" },
            "stage": { ".validate": "newData.isString() && newData.val().length <= 600" },
            "$other": { ".validate": false }
          }
        },
        "state": {
          ".write": "auth != null && root.child('rooms/' + $code + '/host').val() === auth.uid",
          ".validate": "newData.hasChildren(['seq', 'g'])",
          "seq": { ".validate": "newData.isNumber()" },
          "g": { ".validate": "newData.isString() && newData.val().length <= 100000" },
          "$other": { ".validate": false }
        },
        "acts": {
          "$n": {
            ".write": "auth != null && ((!data.exists() && root.child('rooms/' + $code + '/guest').val() === auth.uid) || (!newData.exists() && root.child('rooms/' + $code + '/host').val() === auth.uid))",
            ".validate": "$n.matches(/^[0-9]{1,6}$/) && newData.isString() && newData.val().length <= 4000"
          }
        },
        "here": {
          "$s": {
            ".write": "auth != null && (($s === '0' && root.child('rooms/' + $code + '/host').val() === auth.uid) || ($s === '1' && root.child('rooms/' + $code + '/guest').val() === auth.uid))",
            ".validate": "newData.isBoolean()"
          }
        },
        "$other": { ".validate": false }
      }
    }
  }
}
```

What they say, in plain words:
- Only **rooms** exist. Nothing outside `rooms/` can be read or written. Nobody can list the rooms: you can only
  open a room whose code you know.
- A new room can only be created by the person who becomes its host, and an existing room can't be overwritten.
- Only the **host** can write the game state. Only the **guest** (the first person to join) can send moves.
  Each player can only write their own seat and their own "I'm here" flag.
- **Size caps:** the game state is at most 100,000 characters (a real one is about 5–10 thousand), each move
  message at most 4,000, names 14 characters, jerseys 2 digits. Unknown fields are refused.
- A room can't be joined once it is more than 1 day old, and anyone may delete a room older than 2 days.

### Cleaning up old rooms

- The host deletes the room when a match is left from the menu or the end-of-match **Menu** button.
- The "I'm here" flags are removed automatically by Firebase when a device disconnects (`onDisconnect`).
- The room itself is deliberately **not** deleted on disconnect (it must survive a reload or a Wi-Fi drop).
  So a room can be left behind if both players just close the app. They are tiny (about 10 KB) and harmless.
- Once in a while (every few months is plenty): **Realtime Database → Data**, hover over **rooms**, click the
  trash can, confirm. Do it when nobody is playing. There is no automatic console setting for this on the free plan.

### What a stranger who guesses a code could and could not do

Codes are a word from a list of 60 and a number 10–99 (about 5,400 codes), only exist while you play, and
the room is deleted when you leave. A stranger would need this website, the exact code, and the exact minutes
when the host is waiting for the other player.
- **Could:** if they get in **before** the real guest joins, take the guest seat (the host would see a strange
  name in "… joined!"; just tap Cancel and host again for a new code). Or, while the room exists, **read** it:
  the two first names, jersey numbers and the moves.
- **Could not:** join once the real guest is in, change the game state, send moves as either player, see
  anything outside that one room, find other rooms, learn anything about the devices or accounts (there are none),
  or send any free text: the only words that ever travel are first names, jersey numbers, game moves and the
  fixed emote phrases.

## How to test with two tabs (no Firebase needed)

1. In a terminal in the project folder: `python -m http.server 3491 --bind 127.0.0.1`
2. Open two tabs: `http://localhost:3491/?onlinetest=1&p=a` and `http://localhost:3491/?onlinetest=1&p=b`.
   `p=a` / `p=b` makes each tab its own player (own save, own device id). The "database" lives in this browser's
   localStorage under keys starting with `tataNet:`; the tabs hear each other through `storage` events.
3. Tab A: Play → Online → name/jersey → **Host a game**. Tab B: Play → Online → **Join a game** → type the code.
4. Tab A: **Kick off!** Play in both tabs.
5. Useful console helpers: `TataOnline.drop(true)` in a tab = "this device's Wi-Fi went off" (the other tab shows
   the banner after 3 s; moves made meanwhile are sent on `TataOnline.drop(false)`). `TataOnline.O()` = the session.
   `TataGame.move(id, zone)` works on both sides (on the guest it sends the move to the host).
6. Reload either tab mid-match: the splash button says **Back to my online game**.
7. Tip: background tabs slow animation down. For automated testing set
   `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16)` after load, or switch 3D off.
8. Afterwards you can remove the test data: `Object.keys(localStorage).filter(k => /^tataNet|\.test\./.test(k)).forEach(k => localStorage.removeItem(k))`.

## How to test for real (two devices) once the config is in

1. Publish the site with `js/online-config.js` filled in.
2. On device 1 (e.g. Tata's iPad): Play → Online → **Host a game**. Read the code aloud.
3. On device 2 (the kid's iPad): Play → Online → **Join a game**, type the code → **Join!** → on device 1 **Kick off!**
4. Try: lock one iPad for a minute (the other shows "lost connection: waiting…"), unlock it; close one tab and reopen
   the site (**Back to my online game**); play to the last cube; call Now! and Impossible! from each side.
5. If "Couldn't connect" appears: check the Wi-Fi, that **Anonymous** sign-in is enabled, that the rules were
   **published**, and that the config contains `databaseURL`. The browser console (`[online]` lines) shows the
   exact Firebase error.

## What I verified (two tabs, local back end) and what I didn't

Verified by actually playing in two tabs (details in the lead's report): a whole 3-shake match to the end-of-match
screens and a rematch requested from the guest; host and guest lobby, wrong code, a third player refused from a
full room; moves both ways (real taps on the flat mat); guest Now! with a wrong Solution; guest Impossible! after
the host's last cube (host gave up); host Impossible! with the guest proving it wasn't (correct Solution); the
last-cube flow with both writing at the same time and a joint reveal; the guest's "No Goal" call challenged by the
host; the guest picking a variation card (offered from the guest's own unlocks; chip shown on both); the guest's
two-digit Goal; the "both ready" wait in both orders; guest reload mid-writing (builder re-opens); host reload during
a move turn, during simultaneous writing (guest's answer kept), during the guest's card pick (same question kept),
during the guest's challenge writing, and on the results screen; the disconnect banner and "is back" toast with a
move made while offline; emotes both ways; the guest leaving mid-match and the host leaving mid-match; 3D on both
(the guest's pour plays; both show identical faces); the lobby's "whose cubes" choice; each device's own XP,
stats and badges; room data removed after leaving; 'pvp' and 'ai' still start and behave as before.

**Not verified:** the Firebase back end itself (no project/config yet). I did load the pinned SDK (10.12.2) from
gstatic in the browser with a fake config: it loads, initialises, and the sign-in failure shows the calm
"Couldn't connect" pop-up. The rules have **not** been run through Firebase's rules simulator.

## Known limits / rough edges

- Two players only (one per device). The state, seats and prompts are keyed by seat number so a third seat or a
  creature could be added later, but the mirror's waiting lines and the rules assume seats 0 and 1.
- A device doesn't tell its **own** player when it is offline (only the other side sees the banner). Firebase queues
  its moves meanwhile.
- If the host reloads while the **guest** has a half-built Goal for a "No Goal" challenge, or while the host was
  answering a "No Goal" call, that step starts over (the Goal phase restarts). Rare.
- On the guest, the dice of its own pour turn to the host's faces as they glide into place (the same thing the
  tutorial's fixed rolls do).
- If a celebration (level up, new card) is showing on one device when the other taps "Next shake", the next shake
  waits for it: that is intended, but it means the other player sees "Waiting for … to finish reading the results".
- Reconnecting relies on the browser keeping its storage (Safari private browsing, or clearing website data, loses
  the anonymous sign-in, so the device can't reclaim its seat; just host a new game).
- A room left behind by two closed apps is only cleaned up by hand (see above).
