# Handoff: Talk while you play (agent `voice`)

Owner's request: "Talk while you play online. Voice or video inside the game, so you don't need FaceTime running
alongside." Tata and the kid (and a third player) can now talk, and optionally see each other, inside an online game.

## Files

- **New:** `js/voice.js` (everything), `css/voice.css`, `tests/voice.test.js` (`node tests/voice.test.js`, 61 checks),
  `docs/handoff/firebase-rules-v3.json`, this file.
- **`js/online.js`**, small blocks marked `VOICE`: `voiceRoom()` at the end of `hostSubs()` / `guestSubs()` (so also
  after a reload), `VoiceChat.leaveRoom()` at the start of `stopSubs()` (leave, quit, the game ended), the talking block
  in the host and guest lobby pop-ups (the "Talk on FaceTime" sentence is only shown when voice.js is missing),
  `VoiceChat.seatGone(s)` in `onSeats` when a guest's seat is freed, and a tiny loader that adds `js/voice.js` and
  `css/voice.css` to the page **if `index.html` doesn't list them** (so the feature works before snippet 1 is pasted).
- **`js/online-net.js`**, one block marked `VOICE`: `Net.rtcWrite()` (a write that rejects when the database refuses)
  and `Net.rtcOnDisconnect()` (Firebase `onDisconnect().remove()` for this device's notes; local backend: pagehide).
- Nothing else edited. Snippets for `index.html`, `js/screens.js`, `js/sound.js` are below.

## How it works for the players

1. **Off by default on every device.** In the lobby (host or guest) a small box says "🎙 Talk inside the game, instead
   of FaceTime? **Ask a grown-up**". Tapping it shows the safety text and a **"Grown-ups: press and hold to allow"**
   button (2 seconds, the same kind of gate as the "For Tata" page). Allowed is remembered **on that device only**
   (`localStorage`, not in the save, so a cloud-synced save never switches it on elsewhere). Settings → Parent corner
   gets the same row (snippet 2), where it can also be switched off with one tap.
2. Safety text shown before first use (short and plain):
   - Only the people in this game room (they have the code) are connected.
   - Nothing is recorded or stored.
   - Anyone can hang up at any time.
   - The browser asks before it uses the microphone (and the camera, for "See each other").
3. Once allowed: **🎙 Talk** and **📷 See each other** buttons in the lobby, and a line "🎙 Tata is ready to talk" when
   someone else already joined. The browser's own microphone / camera question appears **only after that tap**. If
   the mic is refused the player still hears the others ("The microphone isn't allowed on this device, so the others
   can't hear you. You can still hear them."); a refused camera just means no picture.
4. **During the match** a small floating control (top-right, under the top bar; drag it by its ⠿ grip, each device
   remembers where): connection dot (green good / yellow slow / red poor / grey connecting), 🎙 mute me, 🔊 sound of
   the others on/off, 📷 camera on/off, ✕ hang up, and a small name chip per person (✕ = could not connect, … =
   connecting, 🔇 = they muted themselves). It sits above pop-ups (z-index 62) so muting / hanging up always works.
5. **Video bubbles**: 76 px round bubbles with the name under each (60 px on phones), default the top-left corner of
   the picture under the top bar (the cubes and the action buttons are lower down), draggable as a group, remembered per
   device. Only shown for people whose camera is on; my own bubble (mirrored) while my camera is on.
6. **Talking ring**: a green ring around the bubble / name chip / my mic button **while a sound level is above a
   threshold** (measured every 140 ms with a WebAudio analyser; lit ~0.5 s after the last sound). Nothing moves when
   it is quiet; no CSS animation loops.
7. **Can't connect** (no TURN server, see below): after 10 s without a connection the control and the lobby say
   "Voice could not connect on this network. You can still play; use the phone or FaceTime to talk." (one automatic
   ICE restart is tried; if it connects later the line goes away by itself). The game never waits for voice.
8. **Rules not published yet**: the first write is refused, and the player sees "Tata needs to switch talking on
   first (one step in the game's online setup). You can still play; use the phone or FaceTime to talk." (OK closes it.)
9. **Autoplay**: if the browser refuses to start the others' sound (iOS / Chrome rules, mostly for a listen-only
   device whose mic was refused) the control shows **"🔈 Tap to hear the others"**.

## How it works inside

- **Mesh WebRTC**, at most 3 devices (so at most 2 links each). Audio + video go **peer to peer**. No media ever goes
  through Firebase; Firebase only carries the short connection notes.
- **STUN servers (public, free):** `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302` (Google) and
  `stun:stun.cloudflare.com:3478` (Cloudflare). They only tell a device its public address. **No TURN relay**, so
  strict networks (some school / company Wi-Fi, some mobile carriers with symmetric NAT) can't connect: that's the
  10-second message above. A TURN server (paid, or self-hosted coturn) could be added to `STUN` in `js/voice.js` later.
- **Signalling layout** (all values short JSON strings, written only by their sender):
  - `rooms/<CODE>/rtc/<seat>/hi` = `{s, cam, mic}`: "I'm in the call", `s` = a random session id per join (a reload or
    a reconnect = a new id).
  - `rooms/<CODE>/rtc/<seat>/<to>/<n>` = `{t: 'desc' | 'cand', s: my session, r: their session, d | c}`: offers /
    answers / ICE candidates for one other seat, numbered 1, 2, 3 … in writing order.
  - A note is used only if `s` is the sender's **current** session and `r` is **mine**, and notes are handled strictly
    in number order, one after another (a candidate never overtakes its description; early candidates wait for the
    description). So notes left over from before a reload can never confuse a new link, in any order of arrival.
  - When I start a link to someone's new session I first delete my old notes to them; when I hang up / leave / close
    the page I delete my whole `rtc/<seat>`. Firebase also deletes it by itself if the device disconnects
    (`onDisconnect`), and the host deletes a freed guest seat's notes. Deleting the room deletes everything.
  - Caps (in the code and in the rules): `hi` ≤ 200 characters, a note ≤ 16,000 characters (an offer with audio + video
    is ~4–7 KB), note numbers 1–9999, at most 60 candidates per link.
- **Who offers:** the lower seat starts each link (host first) and adds an audio and a video transceiver; the other side
  answers on those transceivers. "Perfect negotiation" is used anyway (the higher seat is polite and rolls back if both
  offer at once), so renegotiations (ICE restarts) are glare-safe.
- **Camera on/off and mute never renegotiate:** the video transceiver always exists, the camera is attached / removed
  with `replaceTrack` (the camera light really goes off), mute is `track.enabled = false`. The `hi` flags tell the
  others to show / hide the bubble and the 🔇.
- **Late joiner:** the third player's arrival opens two new links (one from each of the others); the existing link is
  untouched. **Leave / reload:** their `hi` disappears or changes session → my link to them closes, a new one opens
  for the new session. **After a reload** a device rejoins by itself if no permission question would appear (the mic
  is already granted, or test mode); otherwise the control shows **"🎙 Talk again"** (the question must follow a tap).
  The "was in a call" mark is kept 6 hours and cleared by Hang up / Leave.
- **This device lost the database** (Wi-Fi blip): when it comes back it starts a fresh session, and everyone reconnects
  to it. A link that goes `disconnected` gets an ICE restart after 4 s.
- **Echo / noise:** `getUserMedia({audio: {echoCancellation, noiseSuppression, autoGainControl: true, channelCount: 1}})`.
- **Low bandwidth:** camera asked at 240×180 (max 320×240), 12 fps (max 15), `contentHint 'motion'`; video sender
  `maxBitrate 150 kbps`, `maxFramerate 15`; audio sender `priority / networkPriority 'high'`, 40 kbps cap, so the voice
  goes first.
- **Device changes** (headphones plugged / pulled, the mic disappearing): on `devicechange` or the track ending the
  default microphone is taken again and swapped in with `replaceTrack` on every link (skipped if it's the same device).
- **iOS:** the call only starts from a tap; `navigator.audioSession.type = 'play-and-record'` while talking (Safari 16.4+;
  meant to keep the game's WebAudio sounds playing with the mic on) and `'auto'` after; `Snd.init()` is called right
  after the mic starts (resumes the game's AudioContext if iOS paused it); remote sound plays through an `<audio
  playsinline>` element per person ("Tap to hear" if refused); the levels use voice.js's own AudioContext, created in
  the tap. **Screen lock:** a Screen Wake Lock is held while talking (re-taken when the page becomes visible again).
- **Music while someone talks:** while anyone else is heard, `Snd.duckTalk(true)` is called **if it exists** (snippet 3)
  and a `tata:talking` event (`{detail: {on: true / false}}`) is sent on `window` either way. js/sound.js wasn't edited.
- **Leaving:** Hang up, Leave, the end-of-match Menu, the host ending the game, closing or reloading the page all stop
  every track (microphone and camera lights off), close every peer connection and delete this device's notes.

## The new database rules (`docs/handoff/firebase-rules-v3.json`)

v3 = v2 with **one new block, `rooms/$code/rtc`**; `rooms` and `users` are otherwise byte-for-byte the same rules
(checked by a script: v3 minus `rtc` equals v2). Until v3 is published, v2's `"$other": {".validate": false}` refuses
every `rtc` write, which the game turns into the "Tata needs to switch talking on first" line.

```json
"rtc": {
  "$from": {
    ".write": "auth != null && (($from === '0' && root.child('rooms/' + $code + '/host').val() === auth.uid) || (($from === '1' || $from === '2') && root.child('rooms/' + $code + '/guests/' + $from).val() === auth.uid) || (!newData.exists() && root.child('rooms/' + $code + '/host').val() === auth.uid))",
    ".validate": "$from === '0' || $from === '1' || $from === '2'",
    "hi": { ".validate": "newData.isString() && newData.val().length <= 200" },
    "$to": {
      ".validate": "($to === '0' || $to === '1' || $to === '2') && $to !== $from && newData.hasChildren()",
      "$n": { ".validate": "$n.matches(/^[0-9]{1,4}$/) && newData.isString() && newData.val().length <= 16000" }
    }
  }
}
```

Rule by rule:
- **`rtc/$from/.write`**: only the person sitting in seat `$from` writes under it: seat 0 = the room's host uid, seats 1
  and 2 = the uid in `guests/1` / `guests/2` (the same test the `seats` and `here` rules use). The extra case lets
  **the host delete** (only delete: `!newData.exists()`) a seat's notes, for cleaning up a guest who left. Nobody can
  write notes "from" someone else or into someone else's box.
- **`rtc/$from/.validate`**: the seat is 0, 1 or 2 (nothing else can be created under `rtc`).
- **`hi`**: a string of at most 200 characters ("I'm in the call", the session id and two flags).
- **`$to`**: a box for another seat (0, 1 or 2, never your own) and it must hold numbered notes, not a bare value.
- **`$n`**: a note number of 1–4 digits, the note a string of at most 16,000 characters.
- **Reading** is unchanged: like everything else in a room, `rtc` is readable by any signed-in device that knows the
  room code (the `.read` on `rooms/$code`). Realtime Database read rules can't be narrowed below a level that already
  grants read, so making `rtc` readable only by the room's members would mean moving `.read` from `$code` down into
  each child (`state`, `seats`, … and `rtc`) with a membership test: a change to the existing `rooms` rules, which I
  was asked not to make. Worth knowing: the notes contain the devices' network addresses (that is what ICE
  candidates are), visible to someone who guesses a live room code (~9,000 possible codes) during the game. No sound,
  picture or name is in them.
- **Deleting**: the room delete rule (host, or anyone after 2 days) removes `rtc` with the room.
- **Not run through the Firebase rules simulator** (no access). Please simulate once when publishing: a guest writing
  `rooms/X/rtc/1/hi` (allowed), a guest writing `rooms/X/rtc/0/hi` (refused), the host deleting `rooms/X/rtc/2`
  (allowed), a guest writing `rooms/X/rtc/1/1/17` with a 100-character string (allowed) and `rooms/X/rtc/1/1/abc`
  (refused). Publishing is the lead's step with the owner's OK; I didn't touch the console.

## Please paste (I edited none of these files)

**1. `index.html`** (optional: `js/online.js` loads both files itself when they're missing). After
`<script src="js/online.js"></script>` add `<script src="js/voice.js"></script><!-- VOICE -->`, and with the other
stylesheets add `<link rel="stylesheet" href="css/voice.css"><!-- VOICE -->`.

**2. `js/screens.js`, `renderSettings()` → Parent corner** (the "Allow talking in online games" row), right after the
Bonus line `(window.Bonus ? Bonus.parentHTML() : '') + // BONUS …`:
```js
    (window.VoiceChat ? VoiceChat.parentHTML() : '') + // VOICE: allow talking in online games (press and hold), per device
```
(If voice.js loads after the Settings screen was first drawn, the row appears the next time Settings is opened.)

**3. `js/sound.js`: lower the music a little while someone is talking.** Near `var musVol = 0.3, duckF = 1,
duckToken = 0;` add `var talkF = 1;`; in `refreshMus` change `var v = musVol * duckF;` to
`var v = musVol * duckF * talkF;`; and add to the returned public API:
```js
    duckTalk: function (on) { talkF = on ? 0.55 : 1; refreshMus(on ? 0.25 : 0.9); }, // VOICE (js/voice.js): someone is talking online
```
A separate factor (not `duck()`) so the game's own short ducks don't end the talking duck early.

## How to test on one computer (no Firebase, no camera / microphone)

Same harness as docs/handoff/online.md (one origin, three iframes): `python -m http.server 3535 --bind 127.0.0.1`,
open any page on that origin (its 404 page works) and add three `<iframe src="/?onlinetest=1&p=a|b|c">`.
With `?onlinetest=1` (or `?fakemedia=1` on a real setup) the "microphone" is a WebAudio oscillator that hums in 1.3-s
bursts (a different note per tab) and the "camera" is an animated canvas (`canvas.captureStream`) with the tab's
letter, so no permission prompt ever appears, and the peer connections are real (`iceServers: []`: host candidates
only, which is all one machine needs).

Console helpers in each frame (`TataVoice`): `allow(true)`, `talk(cam)`, `hang()`, `mic(off)`, `cam(on)`, `spk(off)`,
`peers()` (per seat: `iceConnectionState`, signalling state, `stats` with bytes in / out, round trip, lost packets,
quality, flags), `st()`, `block(true)` (drop every candidate both ways and strip them from descriptions = a network
where nothing connects), `decline(true)` (the next mic / camera request is refused), `ducked()`, `tree()`.
`&rtcrules=0` in a frame's address makes every talking write refused, like the v2 rules.
Clean up: remove the localStorage keys matching `/^tataNet|\.test\.|tataOnline|tataVoice/`.

## What I verified (Chrome, the browser pane, three iframes on 127.0.0.1:3535, fake media) and what I didn't

Verified:
- `node tests/voice.test.js` 61/61 (parsing, two-device connect, glare both ways round at the link level, a renegotiation
  clash on a live link, late joiner, reload with stale notes in the room, notes meant for an older session, hang up and
  come back, candidates before the offer, out-of-order note numbers, refused writes, the caps, renew after a lost
  connection). `node tests/engine.test.js` 831/831.
- Lobby: "Ask a grown-up" → safety text → a short tap and a 0.6-s press did **not** allow; a 2.2-s press did; the box
  then shows Talk / See each other.
- **Two** devices: `iceConnectionState` connected on both, audio bytes flowing both ways (getStats), remote `<audio>`
  playing. **Three** devices (the third with "See each other"): all six link ends connected; the third player's
  camera bytes arriving at both others (the third seat is the answering side on both its links, so this also checks
  sending video on answered transceivers).
- In the match: the floating control and bubbles appear when the lobby closes; the talking ring lit on chips, bubbles
  and the mic button with the humming fake mic; `ducked()` turned on and off with the bursts.
- Mute: the others saw `mic: false` and the 🔇; unmute back. Camera on from the host mid-match: the others got the
  flag, a bubble and growing video bytes, my own mirrored bubble showed; camera off: bubbles gone on both sides.
  Speaker off / on: the remote audio elements muted / unmuted.
- **Reload of all three devices at once** mid-match (twice): each rejoined by itself with a new session id, all links
  connected again, the camera came back on for the one that had it.
- Hang up: links closed on the other two devices, this device's notes deleted, audio elements removed. Rejoin with the
  microphone refused (`decline`): in the call, hearing both others (bytes in, 0 out), the others saw `mic: false`,
  the "microphone isn't allowed" line shown.
- **ICE blocked** (`block(true)`): the "Voice could not connect on this network…" line appeared after **10.1 s**, on
  that device and on the device whose link to it failed, while the other link and the game kept going.
- `&rtcrules=0`: the "Tata needs to switch talking on first…" line in the match, the game unaffected.
- A guest leaving (Menu): their call ended, their notes deleted, the others' links to them closed. The host leaving:
  every device's call ended, no room data left.
- Wi-Fi off / on on a guest (`TataOnline.drop`): the guest came back with a new session and the link reconnected.

Not verified (honestly):
- **Real devices, real networks, real microphones / cameras / headphones**: everything ran in one Chrome on one PC with
  fake media. No iPad, no iPhone, **no Safari** at all (so the iOS audio session, autoplay "Tap to hear", wake lock,
  the device-change swap and echo cancellation in a real room are untested), no Firefox.
- **The public STUN servers** (test mode uses no STUN) and how often real home networks fail without TURN.
- **The real Firebase back end and the v3 rules** (not simulated; `onDisconnect` cleanup only by reading the code).
- `Snd.duckTalk` (needs snippet 3), the Parent-corner row inside Settings (needs snippet 2: the row's HTML and the
  hold gate were checked through the lobby box, which uses the same code), the "Talk again" button (only shown on real
  devices when the mic permission isn't already granted), and the 3D table layout (I tested with 3D switched off; the
  control and bubbles are fixed-position over whatever is underneath, and both can be dragged).
- In the harness a link sometimes took 8–12 s to connect (three busy iframes on one machine); when that crossed 10 s
  the failure line showed briefly and cleared itself on connecting.

## Judgment calls

- **Allow = press and hold, per device, in localStorage** (not in the save `S`): the save can be synced to other
  devices by the account feature, and "allowed on this iPad" shouldn't travel. The hold gate copies the "For Tata" page
  rather than inventing a password.
- **Test mode uses no STUN** so the harness never touches the network; production uses the three public servers.
- **Auto-rejoin after a reload only when no prompt would appear**; otherwise one tap ("🎙 Talk again").
- **The control floats top-right, the bubbles top-left**; I first tried bottom-left for the control, but on the match
  screen it covered "Build the Goal" and Pip's line.
- **The control stays above pop-ups** (results, questions), so a child can always mute or hang up.
- **My own "talking" ring** also lights when nobody is connected (it shows my mic works).
- **Reading `rtc`** follows the existing room read rule (anyone signed in with the code), see the rules section.
- **No looping animation** anywhere: the ring is switched by the sound level, the hold button fills once.

## Known limits

- No TURN: some networks can't connect (the kind message, play goes on).
- Mesh: fine for 3 people; more would need a server (never needed here: rooms hold 3).
- iOS Safari before 16.4 has no `navigator.audioSession`: the game's sounds may go quieter / to the earpiece while
  the mic is on (Apple's default "play and record" routing). Untested either way.
- If two people hang up and rejoin many times in one game, note numbers keep counting within a session (cap 9999).
