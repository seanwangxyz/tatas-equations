# Sound audit and mix (real-device and sound pass)

Owner files: `js/sound.js`, `js/crowd-sfx.js`, `js/fx-sfx.js`, `js/title-sfx.js`, `js/weather-sfx.js`, new
`js/soundcheck.js` + `css/soundcheck.css` (Sound check screen, loaded on demand). Speed work: see the end of this file
and `js/three/quality.js`, `js/three/postfx.js`, new `js/perf.js`. Tata's hands-on list: `device-checklist.md`.

**What was measured vs what was not.** Every number below comes from offline renders (OfflineAudioContext, 48 kHz,
in Chromium on Windows) through the real mix chain, at the default volumes (music 0.35, effects 0.8). Nobody listened.
Not measured and needing a human: how it sounds on iPad speakers and headphones, the device speech voices
(speechSynthesis plays outside Web Audio and cannot be recorded), the silent switch, lock/unlock and phone-call
recovery on a real iPad, and Safari's own audio quirks.

## 1. How the sound is wired now

Before: five files, **four AudioContexts** (sound.js, crowd-sfx.js, fx-sfx.js, title-sfx.js; weather-sfx.js used
sound.js's if it existed, but sound.js never exposed it). Each had its own unlock, its own volume handling and its own
(or no) limiter, and the OS simply added them up. A match win summed to -2.4 dBFS peaks with nothing guarding it, and
iOS needed several unlocks.

Now: **one AudioContext, one master chain**, owned by `js/sound.js`:

```
every sound -> category bus -> Effects / Music volume -> Mute -> glue compressor (-20 dB, 2.5:1, make-up removed)
            -> limiter (-10 dB, 20:1, 2 ms) -> soft tanh clipper, ceiling 0.89 (-1 dBFS) -> speakers
```

Category buses (`Snd.bus(cat)`): `music` (music volume, ducked under voices), `sfx`, `ui`, `crowd` (Effects x
Crowd balance, with a 3.8 kHz low-pass so claps never hiss), `voice` (Effects x Voices balance), `amb`
(Effects x Ambience balance). Mute and both sliders now reach **every** sound, including the title, crowd, fireworks
and weather files (before, those followed Mute/Effects only by re-reading the settings at play time; already-playing
beds did not change).

### For the other helpers: adopting the shared context (js/matchday-sfx.js, js/voice.js)

```js
var c = Snd.context();                 // the shared AudioContext (made on first use; it runs after the first tap)
var out = Snd.bus('crowd');            // 'music' | 'sfx' | 'ui' | 'crowd' | 'voice' | 'amb'  -> a GainNode
myLastNode.connect(out);               // do NOT multiply by S.set.sfx / S.set.music yourself: the bus does it
if (Snd.level('crowd') <= 0) return;   // 0..1.5, 0 = muted or turned down: skip the work
Snd.duck(0.35, 2.5);                   // a voice is speaking: music (and ambience) at 35 % for 2.5 s
```

Re-ask `Snd.bus()` each time you start a sound (the Sound check can rebuild the mix after measuring; the node then
changes). Fall back to your own context only when `typeof Snd === 'undefined'`. Voice chat (`js/voice.js`): route
the remote voice through `Snd.bus('voice')` (a MediaStreamAudioSourceNode on `Snd.context()`), call
`Snd.duck(0.4, 1)` every second while someone talks, and do not create a second AudioContext (iOS would need another
unlock and the volumes would not apply). Targets for new sounds: see the table in section 3.

Offline checks for new sounds: `Snd._measure(function (api) { /* play into api.bus('sfx') at time 0 */ }, seconds,
{ defaults: true }).then(SoundMeter.analyze)` (with js/soundcheck.js loaded). Add your sound to the catalogue in
`js/soundcheck.js` (`add(id, cat, label, sec, live, offline, where)`) so Tata can hear it on the Sound check screen.

## 2. Inventory: every sound the game can make

| Sound | Code | Triggered by | Length (s) | Overlap / limit |
|---|---|---|---|---|
| **UI** | | | | |
| click | `Snd.click` | every button (main.js, screens.js, game.js, ...), table.js photo | 0.08 | yes, 35 ms min gap |
| pop | `Snd.pop` | picks, small rewards (fx.js, progress.js, screens.js, ...) | 0.59 | yes, 50 ms gap |
| pickup | `Snd.pickup` | grabbing a cube (three/table.js, player.js, creatures.js) | 0.27 | yes, 60 ms gap |
| sting.emote | `Snd.sting(emote)` | emote bubbles | 0.15 | 200 ms per kind |
| title.hover | `TitleSfx.ui(hover)` | mouse over a title button (ui.js) | 0.03 | 70 ms gap |
| title.press | `TitleSfx.ui(press)` | pressing a title button (ui.js) | 0.07 | yes |
| **Effects** | | | | |
| diceHit | `Snd.diceHit` | 3D pour, every collision (three/table.js) | 0.32 | voice cap 22-34, 11 ms soft-hit gap |
| clatter | `Snd.clatter` | flat-mat roll, title (game.js, ui.js) | 1.87 | 250 ms gap |
| cupRattle | `Snd.cupRattle` | cup shake before the pour (three/table.js) | 1.18 | 250 ms gap |
| thunk | `Snd.thunk` | a cube lands in a zone (three/table.js, replay) | 0.78 | 30 ms gap |
| boop | `Snd.boop` | not quite / wrong (builder, camp, game, ...) | 0.98 | 150 ms gap |
| chime | `Snd.chime` | good move, saved, replay flash (many) | 1.74 | 150 ms gap |
| whistle | `Snd.whistle` | no caller (Sound check only) | 1.18 | 0.3 s gap |
| slam | `Snd.slam` | a challenge (game.js); ducks music | 1.88 | 1.2 s gap |
| fanfare | `Snd.fanfare` | match / cup / level-up wins (game, progress, team, ...) | 3.69 | 2 s gap; ducks music |
| sting.card | `Snd.sting(card)` | card earned (progress.js) | 1.53 | 200 ms per kind |
| sting.levelup | `Snd.sting(levelup)` | level up, with the fanfare (progress.js) | 2.41 | 200 ms per kind |
| sting.vs | `Snd.sting(vs)` | versus screen | 1.56 | 200 ms per kind |
| theme.pip | `Snd.theme(who)` | a creature walks in (game.js); 6 tunes | 2.36 | 0.5 s gap; ducks music |
| theme.sloth | `Snd.theme` | as above | 3.58 |  |
| theme.penguin | `Snd.theme` | as above | 2.36 |  |
| theme.fox | `Snd.theme` | as above | 3.11 |  |
| theme.owl | `Snd.theme` | as above | 2.85 |  |
| theme.wizard | `Snd.theme` | as above | 3.58 |  |
| fx.boom | `FxSfx.boom` | fireworks (three/fireworks.js), replay celebration (replay.js) | 1.09 | max 3 per 0.25 s |
| fx.launch | `FxSfx.launch` | each rocket (three/fireworks.js) | 0.58 | max 3 per 0.25 s |
| fx.swish | `FxSfx.swish` | Goal replay lift-off (three/replay.js) | 0.2 | yes |
| **Crowd** | | | | |
| crowd.clap | `crowdReact(clap) in crowd-sfx.js` | ordinary move (game.js crowdSay) | 1.73 | ~1 crowd sound per second |
| crowd.ooh | `crowdReact(ooh)` | clever move | 1.98 | as above |
| crowd.gasp | `crowdReact(gasp)` | a challenge | 1.33 | as above |
| crowd.cheer | `crowdReact(cheer)` | win, Goal set, right Solution, replays | 2.08 | as above |
| crowd.aw | `crowdReact(aw)` | lost a shake | 1.89 | as above |
| snd.crowd.ooh | `Snd.crowdReact` | fallback when crowd-sfx.js is missing | 2.27 | 120 ms any / 350 ms per kind |
| snd.crowd.aww | `Snd.crowdReact` | as above | 2.3 |  |
| snd.crowd.cheer | `Snd.crowdReact` | as above | 1.87 |  |
| snd.crowd.gasp | `Snd.crowdReact` | as above | 1.48 |  |
| snd.crowd.laugh | `Snd.crowdReact` | as above | 2.25 |  |
| snd.crowd.clap | `Snd.crowdReact` | as above | 2.12 |  |
| snd.crowd.chant | `Snd.crowdReact` | as above | 1.99 |  |
| roar | `Snd.crowd` | 0.5 s after a win fanfare (game.js), screens.js | 6.82 | 3 s gap; ducks music |
| **Voices** | | | | |
| babble.pip | `Snd.babble / Snd.talk` | every creature line when "read aloud" is off (game.js) | 2.08 | one at a time (a new line cuts the old); ducks music |
| babble.sloth | `Snd.babble` | as above | 2.96 |  |
| babble.penguin | `Snd.babble` | as above | 2.19 |  |
| babble.fox | `Snd.babble` | as above | 2.6 |  |
| babble.owl | `Snd.babble` | as above | 2.96 |  |
| babble.wizard | `Snd.babble` | as above | 2.96 |  |
| speech | `Snd.speak (speechSynthesis)` | lines when "Read lines aloud" is on (game.js, screens.js) | speech | one at a time; ducks music to 35 %; not measurable |
| commentator | `Commentary -> Snd.speak(owl)` | big moments (commentary.js), never over Pip | speech | as above |
| **Ambience** | | | | |
| amb.stadium | `Snd.ambience(stadium)` | stadium / beach / volcano matches (game.js) | 5.86 | one bed, cross-fades |
| amb.room | `Snd.ambience(room)` | other mats | 5.74 | one bed |
| amb.rain | `WeatherSfx.set(rain)` | rainy stadium matches (game.js) | 5.89 | one bed |
| amb.wind | `WeatherSfx.set(wind)` | windy matches | 5.88 | one bed |
| amb.title | `TitleSfx.ambience` | resting title screen (three/title.js) | 5.97 | one bed |
| **Music** | | | | |
| music.menu | `Snd.setMood(menu)` | menus | 10.84 | one adaptive score, layers cross-fade |
| music.play | `Snd.setMood(play)` | a match | 10.93 |  |
| music.think | `Snd.setMood(think)` | working out a Solution | 10.92 |  |
| music.challenge | `Snd.setMood(challenge)` | a challenge | 10.93 |  |
| music.win | `Snd.setMood(win) + sting` | a win | 10.93 |  |
| music.dance | `Snd.danceMusic` | creature dances (game.js) | 5.63 | one at a time; ducks the score |
| **Title screen** | | | | |
| title.intro | `TitleSfx score` | the 3D opening (three/title.js scheduleIntroSound) | 6.62 | once per visit; skip fades it |
| title.fanfare | `TitleSfx fanfare` | part of the opening | 6.13 |  |
| title.thud | `TitleSfx thud` | each cube landing (x12) | 0.27 |  |
| title.lightsUp | `TitleSfx lightsUp` | floodlights | 0.82 |  |
| title.whoosh | `TitleSfx whoosh` | title flies in | 0.53 |  |
| title.sparkle | `TitleSfx sparkle` | title lands | 1 |  |
| title.chime | `TitleSfx chime` | short opening / reduced motion | 1.04 |  |
| title.crowd | `TitleSfx crowd` | the pose | 2.14 |  |
| title.confetti | `TitleSfx confetti` | the pose | 0.4 |  |
| title.boing | `TitleSfx boing` | a fan hops (rest) | 0.46 |  |
| title.pat | `TitleSfx pat` | lands again | 0.11 |  |
| title.hi | `TitleSfx hi` | a wave (rest, every 12-20 s) | 0.53 |  |
| title.clack | `TitleSfx clack` | a cube rolls (rest) | 0.09 |  |
| title.twinkle | `TitleSfx twinkle` | a shooting star (rest) | 1.19 |  |
| title.tick | `TitleSfx tick` | short opening cube landings | 0.08 |  |
| title.liftoff | `TitleSfx liftoff` | opening after the splash | 0.35 |  |

Not in the list: `Snd.sting` / theme `sample` overrides from `assets/audio/manifest.json` (none shipped), and `js/matchday-sfx.js` / `js/voice.js` (other helpers, in progress).

## 3. Measurements, before and after

**Summary.** Before, the loudest-400-ms spread of single sounds was 47 dB (dice hit -33.7 to chime -13.8, ambience
-48.6, rain -36.6 louder than the stadium murmur by 12 dB), creature babble was louder on average than the win
fanfare, and the match-win pile-up hit -13.2 LUFS with -2.4 dBFS peaks on four unguarded contexts. After: each
category sits on its target within about 2 dB (UI -34 to -31, the mouse-only title hover/press quieter, table -30 to -22, crowd -28 to -24, voices -22 to -21,
stingers -23 to -21, fanfare/slam -18, ambience -46 to -45, music -33 to -31); the match win is -14.9 LUFS with
-4.5 dBFS peaks, the challenge -18.3, the title opening -17.1; nothing clips; the two harsh sounds are below 13 %
above 4 kHz (were 32 % and 53 %).

Columns: **M-max** = loudest 400 ms (LUFS, BS.1770 K-weighted; the best single number for a short sound),
**LUFS-I** = integrated (gated), **peak** = sample peak dBFS, **>4k** = share of energy above 4 kHz (above ~25 %
sounds bright or harsh on small speakers). Each sound rendered 3 times (music 2) and averaged as energy, because many
are slightly random. "Before" is the base commit `40863c4`, each old file rendered through its own old chain (that is
how it reached the speaker), pile-ups summed sample by sample.

Clicks: no sound starts or stops on a discontinuity (every start reaches its level over 0.7 ms or more; every end
fades). Sample buffers now get a 0.7 ms fade-in, a 2 ms fade-out and their DC removed; the largest DC offset before
was 0.0015 (dice spill, cup), now at most 0.0008 (thunk) and below 0.0003 for everything else. The "hard start" left on click/thunk/dice is the designed knock of a
percussive sound (full level within 0.3 ms by design), not a discontinuity.

| Sound | M-max before | M-max after | LUFS-I after | peak before | peak after | >4k % before / after | warnings after |
|---|---|---|---|---|---|---|---|
| **UI** | | | | | | | |
| click | -31.6 | **-32.2** | -32.2 | -14.5 | -15 | 0 / 0 | hard start |
| pop | -27.1 | **-34.3** | -38.4 | -15.2 | -24.2 | 0 / 0 | - |
| pickup | -24.1 | **-30.7** | -32.1 | -11.6 | -18.6 | 22.5 / 23.5 | - |
| sting.emote | -25.7 | **-32.6** | -34.2 | -8.8 | -15.4 | 0 / 0 | - |
| title.hover | n/a | **-51.6** | -51.6 | n/a | -34.6 | n/a / 0 | - |
| title.press | n/a | **-40.4** | -40.4 | n/a | -21.1 | n/a / 0.2 | - |
| **Effects** | | | | | | | |
| diceHit | -33.7 | **-49.2** | -49.2 | -11.9 | -26.3 | 3 / 7.8 | - |
| clatter | -17.6 | **-24.2** | -27.1 | -2.8 | -8.5 | 2.6 / 1.1 | - |
| cupRattle | -18.4 | **-22.4** | -23.8 | -4 | -8.3 | 12.1 / 11.9 | - |
| thunk | -20.3 | **-30** | -33.3 | -8.8 | -19.7 | 0 / 0 | - |
| boop | -23.2 | **-26.6** | -27.8 | -10.7 | -13.7 | 0 / 0 | - |
| chime | -13.8 | **-21.5** | -24.9 | -6.6 | -13.7 | 1.3 / 1.5 | - |
| whistle | -21.7 | **-25.4** | -27.4 | -22 | -26.3 | 0 / 0 | - |
| slam | -16.7 | **-18.2** | -21.5 | -4.8 | -6.6 | 2.6 / 2.4 | - |
| fanfare | -14.9 | **-17.7** | -21.6 | -3.9 | -7 | 2.1 / 2 | - |
| sting.card | -16.3 | **-23.3** | -26.7 | -8.5 | -15 | 1.4 / 1.6 | - |
| sting.levelup | -15.9 | **-20.9** | -22.5 | -8.3 | -12.9 | 0.2 / 0.2 | - |
| sting.vs | -19.6 | **-21.5** | -23.9 | -7.9 | -10.1 | 0.3 / 0.3 | - |
| theme.pip | -18.7 | **-21.6** | -23.7 | -6.5 | -9.2 | 0 / 0 | - |
| theme.sloth | -18.5 | **-21** | -23.7 | -14.3 | -16.5 | 0 / 0 | - |
| theme.penguin | -20.8 | **-21.7** | -23.2 | -6.5 | -7.6 | 0.1 / 0.1 | - |
| theme.fox | -20.2 | **-21.8** | -24 | -5.7 | -7.4 | 0 / 0 | - |
| theme.owl | -19 | **-22** | -24.7 | -12 | -16 | 0 / 0 | - |
| theme.wizard | -20.7 | **-21.1** | -22.6 | -9.1 | -9.3 | 0.1 / 0 | - |
| fx.boom | -20 | **-23.1** | -25.9 | -8.9 | -13.6 | 0 / 0 | - |
| fx.launch | -39.7 | **-36.5** | -38 | -25.3 | -22.3 | 0.7 / 0.8 | - |
| fx.swish | -45 | **-36.8** | -36.8 | -28.7 | -20.9 | 1.5 / 1.6 | - |
| **Crowd** | | | | | | | |
| crowd.clap | -30 | **-26.6** | -29.2 | -10.5 | -8.8 | 3.5 / 1.9 | - |
| crowd.ooh | -23.9 | **-23.9** | -26 | -16.7 | -14.9 | 0 / 0 | - |
| crowd.gasp | -34.1 | **-27.4** | -31 | -20.5 | -16.1 | 2.1 / 0.7 | - |
| crowd.cheer | -26.7 | **-23.8** | -26.3 | -13.4 | -9.7 | 0.4 / 0.2 | - |
| crowd.aw | -29.2 | **-23.9** | -25.8 | -21.3 | -15.7 | 0 / 0 | - |
| snd.crowd.ooh | -23.9 | **-25.1** | -27.9 | -13.8 | -16 | 0.7 / 0.3 | - |
| snd.crowd.aww | -23.7 | **-23.6** | -25.8 | -12.4 | -12.8 | 0.5 / 0.2 | - |
| snd.crowd.cheer | -20.8 | **-24.5** | -27 | -10.3 | -14.8 | 11.1 / 3.7 | - |
| snd.crowd.gasp | -22.9 | **-24.1** | -25.8 | -11.1 | -13 | 3.1 / 1.3 | - |
| snd.crowd.laugh | -25.9 | **-25.5** | -27.8 | -13.1 | -13.4 | 1.9 / 0.7 | - |
| snd.crowd.clap | -19.7 | **-25.5** | -27.3 | -7.3 | -12.8 | 32 / 12.9 | - |
| snd.crowd.chant | -22 | **-28.7** | -31.2 | -4.5 | -9.9 | 52.6 / 12.5 | - |
| roar | -16.3 | **-21.1** | -23.5 | -6.7 | -12.1 | 7 / 2.4 | - |
| **Voices** | | | | | | | |
| babble.pip | -17.5 | **-21.9** | -24.9 | -5.7 | -9.7 | 0 / 0 | - |
| babble.sloth | -19.2 | **-21.7** | -24.1 | -4 | -6.4 | 0 / 0 | - |
| babble.penguin | -20.1 | **-21.4** | -24.4 | -9.1 | -10.5 | 0.3 / 0.3 | - |
| babble.fox | -17 | **-21.5** | -24.6 | -5.9 | -10.2 | 0.1 / 0.1 | - |
| babble.owl | -17.5 | **-21.5** | -23.7 | -4.6 | -8.5 | 0 / 0 | - |
| babble.wizard | -18.6 | **-21.6** | -24.6 | -3.9 | -7 | 0 / 0 | - |
| speech | - | - | - | - | - | - | device speech: not measurable |
| commentator | - | - | - | - | - | - | device speech: not measurable |
| **Ambience** | | | | | | | |
| amb.stadium | -48.6 | **-45.3** | -47.2 | -35.5 | -33.6 | 0.6 / 0.6 | - |
| amb.room | -60.9 | **-55.9** | -57.5 | -48 | -42.2 | 0 / 0 | - |
| amb.rain | -36.6 | **-45.2** | -46 | -28.8 | -36.9 | 7.8 / 7.8 | - |
| amb.wind | -43 | **-45.1** | -46.5 | -30.9 | -31.6 | 0 / 0 | - |
| amb.title | n/a | **-46** | -46.3 | n/a | -35.4 | n/a / 0 | - |
| **Music** | | | | | | | |
| music.menu | -32.4 | **-31.9** | -34.7 | -24.9 | -23.7 | 0 / 0 | - |
| music.play | -32 | **-31.1** | -33.9 | -19 | -19.6 | 0.6 / 0.4 | - |
| music.think | -33.4 | **-32.8** | -34.4 | -25.4 | -24 | 0 / 0 | - |
| music.challenge | -30.3 | **-31.5** | -34.7 | -20.2 | -21.2 | 0 / 0 | - |
| music.win | -31 | **-32** | -34.2 | -19.9 | -22 | 0.3 / 0.3 | - |
| music.dance | -22.2 | **-24.3** | -27.7 | -8.3 | -10 | 1.8 / 1.7 | - |
| **Title screen** | | | | | | | |
| title.intro | -14.9 | **-17.2** | -19.9 | -4.5 | -5.7 | 0.7 / 0.6 | - |
| title.fanfare | -14.8 | **-17.1** | -20.3 | -5.3 | -7.9 | 0.5 / 0.7 | - |
| title.thud | -29.8 | **-29.7** | -30.6 | -15.7 | -17.2 | 0 / 0 | hard start |
| title.lightsUp | -29.8 | **-29** | -30.1 | -12.8 | -13.3 | 0.1 / 0.1 | - |
| title.whoosh | -40.5 | **-33.7** | -34.7 | -24.6 | -17.7 | 8.6 / 8.3 | - |
| title.sparkle | -31.2 | **-30** | -31.9 | -24.3 | -22.8 | 2.7 / 2.9 | - |
| title.chime | -27.8 | **-28** | -30.1 | -18.5 | -18.7 | 0 / 0 | - |
| title.crowd | -39.1 | **-30.6** | -33.6 | -29.3 | -21.9 | 1.5 / 1.4 | - |
| title.confetti | -36.5 | **-33.2** | -33.5 | -17.8 | -13.9 | 1.7 / 1.4 | - |
| title.boing | -40.5 | **-35.6** | -36.1 | -27.8 | -24.5 | 0 / 0 | - |
| title.pat | -39.1 | **-35.9** | -37.6 | -22.4 | -20 | 0 / 0 | - |
| title.hi | -41.8 | **-34.3** | -35.3 | -30 | -21.5 | 0 / 0 | - |
| title.clack | -41.2 | **-36.1** | -38 | -23 | -18.5 | 0 / 0 | - |
| title.twinkle | -32.4 | **-30** | -32.2 | -25.2 | -22.5 | 2.9 / 3 | - |
| title.tick | -42.2 | **-36** | -38.4 | -20.5 | -16.4 | 0 / 0 | - |
| title.liftoff | -37.1 | **-35.5** | -37.3 | -26.8 | -25.6 | 0.3 / 0.4 | - |
| **Worst-case pile-ups** | | | | | | | |
| Match win: fanfare + roar + crowd cheer + win music & sting + 6 rockets + creature babble + chime | -13.2 | **-14.9** | -18 | -2.4 | -4.5 | 1.3 / 0.6 | no clipping |
| Challenge: slam + crowd gasp + challenge music | -16.8 | **-18.3** | -26.3 | -5 | -6.6 | 2.6 / 2.2 | no clipping |
| Title opening + menu music starting | -14.8 | **-17.1** | -19.9 | -4.4 | -5.8 | 0.7 / 0.6 | no clipping |

n/a: the old title UI sounds and title murmur had no offline hook. Before, the commentator / device speech also played over un-ducked music.

### Category targets (loudest 400 ms, at the default volumes)

| Category | Target | Examples |
|---|---|---|
| UI ticks | -32 to -30 | click, pop, pick-up, emote |
| Ambience | about -45 | stadium murmur, rain, wind, title murmur |
| Music beds | about -32 | menu / play / think / challenge / win |
| Table sounds | -28 to -23 | thunk, cup, dice spill, boop |
| Crowd reactions | about -24 (claps -27: they are frequent) | cheer, ooh, gasp, aw |
| Voices | about -21 (babble); device speech ducks the music to 35 % | creature babble, commentator |
| Chimes, stingers, entrance tunes, booms | about -21 | chime, card, level-up, themes, firework boom |
| Fanfares, slam | -18 to -17 (the loudest single sounds) | win fanfare, challenge slam, title fanfare |
| Worst pile-up | about -15, peaks below -4 dBFS, never clipping | match win |

## 4. What was changed

**Mix (js/sound.js, per-sound trims from the measurements).** Chime was the loudest sound in the game (-13.8, louder
than the win fanfare); level-up and card stings -16; creature babble -17 to -19 (louder than the fanfare's average);
the title fanfare -14.8 while the tiny title hops were -40. All pulled to the targets above: `TRIM`, `REACT_TRIM`,
`MOOD_GAIN`, the babble `vol` per creature and `AMB` in sound.js; `KTRIM` in crowd-sfx.js; `TR` in fx-sfx.js;
`LEVEL` in weather-sfx.js; `TRIM`, `AMB` and the UI gain in title-sfx.js. Each constant says where it came from.

**Harsh sounds.** The big-crowd clap (32 % of its energy above 4 kHz) and chant (53 %) were the only "bright" sounds:
the crowd bus now has a 3.8 kHz low-pass and the chant's claps were lowered.

**Shared master.** Glue compressor (pile-ups eased 2-4 dB; WebAudio adds make-up gain to a compressor, about +5 dB
here, so it is taken back out), then the limiter and a -1 dBFS soft clipper. All five files go through it.

**Ducking.** Music (and the ambience) duck under: device speech and the commentator (to 35 %, lifted when the line
ends, or after its estimated length + 1.5 s if Safari drops the end event), babble (50 %), fanfare/slam/roar/themes
(as before), and anything another file asks for with `Snd.duck()`.

**Rate limits** (no machine-gunning): click 35 ms, pop 50 ms, pick-up 60 ms, thunk 30 ms, chime 150 ms, boop 150 ms,
cup / spill 250 ms, whistle 0.3 s, slam 1.2 s, fanfare 2 s, roar 3 s; crowd reactions ~1 per second (crowd-sfx) and
120 ms / 350 ms per kind (sound.js); firework booms and launches at most 3 starting within any 0.25 s; dice hits
already had a voice cap.

**iPad / iOS.**
- One unlock: any tap, click or key anywhere creates/resumes the shared context and starts a one-sample silent buffer
  inside the gesture (older iOS needs a sound to start in the tap), repeated until the context really runs.
- Back from the background, the app switcher, the lock screen or a phone call: `visibilitychange`, `pageshow` and
  `focus` resume it; `statechange` to `suspended`/`interrupted` while visible retries every second for 15 s; the next
  tap always does. When the page hides, the context is suspended (battery) and speech is cancelled cleanly.
- The silent (ring) switch: by default iPadOS treats web audio as "ambient", so **the game is silent when the iPad is
  on silent** (side switch on older iPads, the bell in Control Center on newer ones), while the device's own speech may
  still be heard. On iPadOS 16.4+ the Sound check has "Play sound even when the iPad is set to silent"
  (`S.set.playOnSilent`, sets `navigator.audioSession.type = 'playback'`; this also pauses other apps' music).
- Speech: the voice list arrives late (Chrome, Safari): a line waits up to 1.2 s for it rather than use a random voice;
  the first tap speaks a silent warm-up line when "Read lines aloud" is on (iOS only lets speech start from a tap);
  a "paused" synthesiser is resumed; lines are cancelled when the page hides (iOS cuts them anyway);
  `utterance.volume` follows Effects x Voices (Safari ignores it: device speech is always at full volume there).

**Sound check screen** (`js/soundcheck.js`, opened by `Snd.soundCheck()`): every sound by category with a play button
and where it is triggered; sliders Music (`S.set.music`), Effects (`S.set.sfx`), Crowd / Voices / Ambience
(`S.set.mix.crowd|voice|amb`, 0-150 %, default 100 %); "Play the loudest moment", "Play a challenge", "Play the
title opening", "Stop"; a flag per sound cycling through too loud / too quiet / harsh / clicks / did not play /
plays late / other, which copies the report; "Copy report" (flags, measured levels, settings, audio state, device);
"Measure every sound" fills in each sound's loudness and warnings offline (about 30 s on a fronted tab).

## 5. Integration snippets (files other helpers own)

**js/screens.js**, Settings → Sound group. Anchor: the line ending
`data-act="toggleMute">' + (S.set.mute ? 'Muted' : 'Sound on') + '</button></div></div>' +`. Replace its final
`</div></div>' +` so the new row sits inside the Sound group:

```js
    '<div class="setrow"><label>Mute everything</label><button class="btn small ' + (S.set.mute ? 'pink' : '') + '" data-act="toggleMute">' + (S.set.mute ? 'Muted' : 'Sound on') + '</button></div>' +
    '<div class="setrow"><label>Sound check<br><small style="font-weight:600">Hear every sound, balance music, crowd, voices and ambience, and report one that sounds wrong.</small></label><button class="btn small" data-act="soundCheck">Open</button></div></div>' +
```

and next to `ACT.toggleMute`:

```js
ACT.soundCheck = function () { Snd.soundCheck(); };
```

**js/screens.js**, Parent corner group (optional "Speed overlay" switch). Anchor: the `Pip's tip after a match` row;
add before it:

```js
    (T3.supported ? '<div class="setrow"><label>Speed overlay<br><small style="font-weight:600">A small box with the frame rate and a 20-second benchmark (for sending a speed report).</small></label><button class="btn small ' + (localStorage.getItem('tataEq.perf') === '1' ? 'green' : '') + '" data-act="perfToggle">' + (localStorage.getItem('tataEq.perf') === '1' ? '✔ On' : 'Off') + '</button></div>' : '') +
```

```js
ACT.perfToggle = function () { var on = localStorage.getItem('tataEq.perf') !== '1'; try { localStorage.setItem('tataEq.perf', on ? '1' : '0'); } catch (e) {} if (on && window.tataLoadPerf) tataLoadPerf(); else if (window.PerfHUD) PerfHUD.hide(); Snd.click(); renderSettings(); };
```

**index.html**: nothing required. `js/soundcheck.js` (and its CSS) load on demand from `Snd.soundCheck()`;
`js/perf.js` loads on demand from `js/three/quality.js` (`?perf=1`, the switch above, or `tataLoadPerf()`).

**js/config.js save defaults** (optional; missing values already mean these): in
`set: { music: 0.35, sfx: 0.8, mute: false, ...` add `mix: { crowd: 1, voice: 1, amb: 1 }, playOnSilent: false`.

**Callers elsewhere**: nothing must change. `Snd.apply()` (already called by the Settings sliders and Mute) now also
updates the crowd/voice/ambience balance and the weather bed. Unused: `Snd.whistle()` has no caller (it is in the
Sound check).

## 6. Speed check (js/three/quality.js, js/three/postfx.js, js/perf.js)

### Performance overlay

`?perf=1` in the address (or the Parent corner switch above, `localStorage['tataEq.perf'] = '1'`) loads
`js/perf.js`: fps (2 s average) and 1 % low (last 10 s), a frame-time graph (green < 16.7 ms, yellow < 33 ms,
red above), 3D frames drawn per second (about 12 when nothing moves: the table idles on purpose), draw calls and
triangles per drawn frame (all passes, glow included), textures / geometries / shader programs, quality level (and
"scaled"), canvas pixel size, pixel ratio and device pixel ratio, glow / shadows on, weather and firework particles
in the scene, JS heap (Chrome only; Safari has none) and live audio voices. **Run 20-second benchmark** (needs the
3D table on screen): every 5 s a crowd cheer with a wave, a 7-rocket firework show and both creatures dancing, rain
for the whole 20 s, the table drawn every frame; then a verdict:

| Result (average / 1 % low) | Verdict shown |
|---|---|
| >= 55 / >= 40 fps | Very smooth. Auto or Pretty. |
| >= 40 / >= 25 fps | Smooth enough. Keep Auto. |
| >= 25 fps | A bit slow in busy moments. Choose Fast if it feels jerky. |
| below | Too slow: choose Fast; if still jerky, switch the 3D table off. |
| fewer than 200 frames | Not enough frames (screen locked / page hidden): run it again. |

It also says when Auto moved during the test, and puts the weather back afterwards. **Copy report** copies all of it
plus the quality log and the device string.

Measured here (Chromium, Windows laptop, pane in the background, so the fps are not meaningful): a running stadium
match at medium = 184-234 draw calls, 134-143 k triangles, 32-90 textures, 160-390 geometries, ~29-90 programs;
the busy benchmark adds two particle sets (about 1,900 points). Real iPad fps: **not measured** (checklist step 4).

### The automatic quality rules (iPads of different ages)

| Step | Pixel ratio cap | Shadows | Glow (post) | Particles / crowd | When |
|---|---|---|---|---|---|
| high | 2 | 2048 map | on | most / detailed | laptops start here |
| medium | 1.5 | 1024 map | off (render targets freed) | fewer / medium | tablets start here |
| low | 1 | none (contact blobs stay) | off | fewest / simplest | after slow frames |
| low, scaled | 0.75 | none | off | fewest / simplest | still slow on low |

- The costliest things go first: glow and the big shadow map, then shadows + crowd detail + most particles, then
  resolution. A 2018 iPad (A10, 2048x1536, DPR 2) is expected to settle on low; an M1/M2 iPad on medium (it can be
  set to Pretty by hand); a laptop with a decent GPU stays on high.
- Steps down after ~1 s of animation that is mostly slower than 25 ms a frame (2 steps if mostly slower than 45 ms).
- **Never stuck low:** after 6 clean, smooth windows in a row (about 6 s of animation with at most 10 % of frames over
  20 ms) below the device's starting level, it tries one step up, once per visit; if that is slow it drops straight
  back and waits 7 days before trying again; if it holds for 4 windows it is remembered.
- Background tabs, a locked screen, another app in front, or a lost focus never count: those windows are thrown away
  and nothing is remembered from them.
- Remembered per device (localStorage `tataEq.quality3d`, 30 days, plus the date of a failed step-up). Choosing Auto
  again in Settings forgets it and measures afresh. Manual Fast / Pretty (S.set.quality) always wins.
- The glow's render targets fall back to 8-bit on older iPads without half-float render targets.

**Simulated slow device** (rAF driven at 60 Hz by a script because background tabs get no animation frames, plus
30 ms of extra work added to every drawn frame): medium -> low after 1 s, low -> low scaled (pixel ratio 0.75) 2 s
later; 3 s hidden with 80 ms frames changed nothing; with the extra work removed, after about 5 s it probed up to low
(unscaled), held for 4 windows and remembered it. Log: `start (touch device)`, `slow 30/30`, `slow 30/30`,
`probe up (smooth for 6 windows)`, `probe held`.

table.js needed no change: it already applies `L.pr` via `setPixelRatio(min(devicePixelRatio, L.pr))` and rebuilds the
venue for the new tier at the next pour (on the way up as well as down).

### Memory: 10 matches, 5 title visits (scripted)

| Moment | Geometries | Textures | Programs | Live audio sources | Connected audio nodes |
|---|---|---|---|---|---|
| after a warm-up match | 392 | 81 | 91 | 29 | 70 |
| after 5 more matches | 389 | 85 | 87 | 30 | 67 |
| after 10 more matches | 391 | 90 | 89 | 32 | 86 |
| after a warm-up title visit | 390 | 90 | 88 | 24 | 61 |
| after 5 more title visits | 390 | 90 | 88 | 28 | 71 |

(Live audio sources include the menu music's long pad notes; "connected audio nodes" counts nodes with an outgoing
connection, patched in for the test.) **Audio: no leak** (no growth across matches or title visits; every one-shot
disconnects itself; the title file's 0 live voices after leaving). **Geometries: no leak.** **Textures: +1 per match**
(confirmed with 12 matches against the same creature: 62 -> 66 -> 70 -> 74 while playing, 94 -> 98 -> 102 after
quitting). Not in my files: a texture created per match and never disposed somewhere in the 3D match set-up (three
candidates by size among textures created during a match and still alive: 4x4, 256x256, 512x256). About 1 MB per
10 matches at worst; worth a look by the owner of the 3D match/scoreboard/labels code. postfx.js now frees its glow
targets when the quality drops below high.

