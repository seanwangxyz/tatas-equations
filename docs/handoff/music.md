# Music and sound design round (overnight creative pass)

Owner files: `js/music.js` (new), `js/sound.js`, `js/crowd-sfx.js`, `js/soundcheck.js`. Read `sound.md` first (one
AudioContext, category buses, limiter, targets). **Nobody listened.** Everything below was checked by offline
rendering and measurement, and by reading the note events. It still needs ears on an iPad (see the last section).

## 1. What the game sounds like now

- **One tune for the whole game.** The theme is an original 8-bar tune in C major. Its first bars are the title
  fanfare's own notes (G C E ... E G A G | F A C), so the opening, the menu and the matches share it. The menu plays the
  whole theme, then a gentle development, then the theme varied (ornamented, in thirds, or passed between two
  instruments), then a breath of pad only. Match music is calmer: mostly fragments of the theme (its cells, called and
  answered, each on a chord tone near the last note), now and then a quiet quote of the opening, and short rests.
- **Leagues** change mode, instruments and tempo, never the tune. Classic: C major, kalimba, warm pad, 88 bpm.
  Monster League ("Messy"): C Mixolydian (B flat), pizzicato and bassoon, reedy organ pad, swung, 96 bpm. Legend:
  C Lydian (F sharp; the IV chord becomes D major), celesta and harp, string pad, long bass, 78 bpm.
- **Venues**: stadium by day has brushes; night (the night mat, or a stadium match at dusk or night) has vibraphone,
  no kick, slower and darker; beach has steel drum and a soft shaker, swung; volcano has low marimba and a log-drum
  pulse; the other mats have no drums.
- **Late evening lullaby**: after 19:30 or before 6:30 on the device clock, a music box, 15 % slower, about 2.5 dB
  softer, no drums.
- **On-Sets**: the theme as a waltz (3/4), harp with an oom-pah-pah harp accompaniment.
- **Thinking** (the Solution builder): no pulse, chords held for two bars, a few unhurried notes off the grid, often
  silence. **Few Resources left**: a soft pulse on the bass root and a little more melody (about +1.3 dB at the
  extreme). No ticking.
- **Challenge**: A minor, low drone, a soft heartbeat, and the theme's head in minor as a muted ostinato.
- **Codas** (on the music bus, so they follow the music volume): win (the theme's last phrase, broad, after the
  fanfare's big chord), loss (the theme's head in a music box, then a plagal "it's alright" ending on the bright third,
  after the creature's dance), shake end (warm V-I when it went well, a soft IV-I when it did not), challenge resolved
  (bright for right, gentle for wrong). Nothing like a sad trombone.
- **Every match gets its own seed**, so sections, progressions, motif choices and quotes differ from match to match.
- **Transitions**: calm changes (menu, play, think) start on the next bar line that has not been scheduled yet.
  Urgent ones (challenge, win, off) move straight away.
- **15 creature leitmotifs** (plus Pip). Each is 2 to 4 notes from the theme's cells, on an instrument that suits it.
  Snoozy: a slow tuba with a yawn. Penny: xylophone. Rusty: sly pizzicato. Ollie: clarinet hoots. Mondo: celesta over
  a drone. Grub: a grumpy bassoon. Splosh: careful marimba steps. Blaze: a quick muted horn. Hex: accordion with a
  tricky B flat. King Messy: oom-pah tuba. Bleep: bleeps with a glitch. Flip: flute, the head upside down. Squiggle:
  wobbly glides. Nugget: a horn call with timpani. Chroma: harp arpeggios that change colour (major, minor, major).
  `Snd.theme(kind)` now plays them on entrance. The Monster League shares its models' kinds with the Classic League
  (Grub's kind is 'sloth'), so the creature is found among the current match's players.
- **15 babble voices**: the 10 new ones (Grub, Splosh, Blaze, Hex, King Messy, Bleep, Flip, Squiggle, Nugget, Chroma)
  each have their own pitch range, vowel sharpness, rhythm and scoop. They are found the same way as the motifs.
- **Cube skins** sound like what they look like: Classic plastic, Candy (hard candy), Lava (stone), Galaxy (glass) and
  Gold (metal). This applies to the dice knocks in the pour and to the landing thunk (a small ring of the material).
  Every strike stays below 4 kHz.
- **Landings by zone** (optional hook): required is firm, permitted plain, forbidden muffled (never a "wrong" sound),
  goal bright, resources soft.
- **Denser cup**: a leather "thup" on each shake, 7 to 11 dice knocks per shake, fading.
- **Crowd in key**: ooh, cheer, aw and gasp voices start on C major chord tones and glide by musical intervals (ooh up
  a tone, cheer up a major third, aw down a fourth). The win roar's chant is now the theme's head, sung and clapped. A
  new `chant` crowd kind does the same for a great moment.
- **New sounds needing a caller**: felt slide, Solution readout arpeggio (one rising note per cube, ending on a
  cadence note), and On-Sets card lift, place and flip.

## 2. Mix fix: the meter was fooled at t = 0, and five sounds really were too loud

`Snd._measure` rendered every sound from a fresh graph. A fresh DynamicsCompressor starts clamped and lets go over its
release time, so a sound started at t = 0 measured 10-20 dB too quiet. Evidence (same sound at 0 s vs 0.5 s):
click -32.6 vs -20.1 LUFS, thunk -29.8 vs -20.6, one dice hit -50 vs -30. The first audit trimmed against those
numbers, so in the real game the click peaked at -2.7 dBFS (about -20 LUFS, louder than the voices). Live, the
compressors are always settled.

Fixed: `Snd._measure(fn, sec, { preroll })` now renders 0.5 s of silence first and cuts it off (`preroll: 0` gives the
old behaviour). `api.at(t)` and `api.bar(t)` count from the end of the preroll. Re-trimmed in `TRIM` (sound.js) and
`KTRIM` (crowd-sfx.js): click 2.2 -> 0.31, pop 0.87 -> 0.19, thunk 0.5 -> 0.2, boop 0.76 -> 0.54, sting.emote
1.6 -> 0.64, crowd clap 1.0 -> 0.78. Longer sounds (chime, babble, fanfare) measured the same either way. **Not
re-measured with the settled meter** (worth a full "Measure every sound" pass on the Sound check screen): the other
short sounds in title-sfx.js (it has its own compressor), fx-sfx.js, and the old 6 entrance tunes (now only a fallback).

## 3. Measurements (settled meter, 48 or 24 kHz, default volumes)

This is a representative subset, measured with one render each. The full catalogue is on the Sound check screen
("Measure every sound"). M-max = loudest 400 ms (LUFS); peak in dBFS; >4k = share of energy above 4 kHz. No new or
changed sound clips or has a "hard stop"; click and thunk keep their designed "hard start" (a knock).

| Sound | Target | M-max | Peak | >4k % |
|---|---|---|---|---|
| music.menu (the whole theme) | about -32 | -32.0 | -23.1 | 0 |
| music.play (Classic, day) | about -32 | -32.0 | -20.9 | 0.7 |
| music.think | about -32 (calm) | -32.8 | -23.3 | 0 |
| music.challenge | about -32 | -31.7 | -22.3 | 0 |
| music.win | about -32 | -32.5 | -20.7 | 0.2 |
| music.messy / legend | about -32 | -33.0 / -31.4 | -22.3 / -22.4 | 0.6 / 0.2 |
| music.night / beach / volcano | about -32 | -32.1 / -33.5 / -32.2 | -21.5 / -21.6 / -20.6 | 0.4 / 0.5 / 0.2 |
| music.late (lullaby, softer on purpose) | -35 | -35.5 | -24.1 | 0 |
| music.onsets (waltz) | about -32 | -33.1 | -22.1 | 0 |
| music.tension (Resources almost gone) | -32 + a little | -30.7 | -20.4 | 0.4 |
| coda.win / coda.loss | -30 to -26 | -25.9 / -27.6 | -17.6 / -20.0 | 0 |
| coda.shakeGood / shakeKind | -30 to -26 | -29.7 / -31.0 | -22.1 / -22.5 | 0 |
| coda.challengeRight / Wrong | -30 to -26 | -28.5 / -29.4 | -21.2 / -21.5 | 0 |
| 16 leitmotifs (motif.*) | about -21 | -21.9 to -19.9 | -17 to -10.4 | 0 |
| 16 babble voices | about -21 | -22.0 to -20.2 | -11.6 to -5.7 | 0 to 0.2 |
| click (was really -20.3, peak -2.6) | -32 to -30 | -30.6 | -12.1 | 0 |
| pop (was really -20.0) | -32 to -30 | -32.2 | -17.3 | 0 |
| thunk (was really -20.4) | -28 to -23 | -27.0 | -10.5 | 0 |
| thunk per skin (plastic / candy / stone / glass / metal) | as thunk | within 0.5 dB of each other | | 0 |
| dice knock per skin | quiet, many at once | within 1.8 dB of each other | | 0.2 to 15.5 (glass) |
| boop (was really -22.7) | -28 to -23 | -25.9 | -15.3 | 0 |
| sting.emote (was really -24.6) | -32 to -30 | -32.3 | -16.8 | 0 |
| crowd.clap (was really -24.8) | -27 | -27.9 | -9.4 | 1.0 |
| readout | about -21 | -22.1 | -13.2 | 0.2 |
| slide | UI, -32 | -30.9 | -13.4 | 0.4 |
| card.lift / place / flip | UI, -32 | -32.1 / -30.6 / -33.9 | -17 / -10.9 / -15.4 | 0 / 0 / 4.9 |
| crowd.chant / roar (theme chant) | -24 / -21 | -24.9 / -21.5 | -8.5 / -12.9 | 0.8 / 2.6 |
| chime, babble.pip, fanfare (unchanged) | -21 / -21 / -18 | -21.2 / -21.3 / -17.7 | | |

The thunk-per-skin and dice rows were measured before the meter fix (the material differs by timbre, not level). They
were re-trimmed only through the shared thunk trim.

## 4. CPU and nodes

This was a simulated 10-minute session: the moods changed every 40 s (menu, play, think, play, challenge, play,
think, win, menu, play, think, challenge, play, win, off), and the bars were scheduled one ahead exactly as the live
scheduler does. I counted the live sources (oscillators and buffer players; each brings 1-2 gain/filter nodes) at
every bar.

| State | Live sources, average | Peak | About this many nodes at the peak |
|---|---|---|---|
| menu | 11 | 17 | 45 |
| play | 12 | 17 | 45 |
| think | 8.5 | 17 (12 typical) | 35 |
| challenge | 7 | 16 | 40 |
| win (bed + coda) | 16.5 | 24 | 65 |

**No growth**: play averaged 12.4 sources at minute 1 and 11.2 at minute 9, and it was back to 0 after the render.
The shared pad and drone filters are disconnected by `HOST.release` once their notes end. The old bed peaked at about
29 sources (sound.md), so the new score costs less. Leitmotifs add about 10-25 short voices for 2-3 s.

## 5. API

```js
Snd.setMood('menu'|'play'|'think'|'challenge'|'win'|'off')  // as before; the score picks the flavour itself
Snd.theme(kind)              // entrance leitmotif (the creature is found among the match's players)
Snd.motif(idOrKind, how)     // how: 'enter' | 'win' (won a shake) | 'beaten' (friendly shrug); returns ms
Snd.thunk(zone)              // zone optional: 'required'|'permitted'|'forbidden'|'goal'|'resources'
Snd.slide(sec)               // a cube dragged across the felt
Snd.readout(values, goal)    // correct Solution: values = the cubes in order (numbers / operator strings); returns ms
Snd.card('lift'|'place'|'flip')   // On-Sets cards
Snd.material()               // 'plastic'|'candy'|'stone'|'glass'|'metal' from S.cos.skin
crowdReact('chant') / CrowdSfx.play('chant')   // the stands chant the theme's head once
Snd.score()                  // the Music object (js/music.js), or null until it has loaded
Music.flavour(mood)          // what would play now: league, venue, late, onsets, bpm, mode, instruments
Music.coda(kind, delay)      // 'win'|'loss'|'shakeGood'|'shakeKind'|'challengeRight'|'challengeWrong'
Music.force({league, venue, late, onsets}) / Music.late(bool) / Music.tension(0..1)   // Sound check / tests
Music._log(true); ...; Music._events()   // note events {t, n (pitch name), d, i (instrument)}
Snd._measure(fn, sec, { defaults: true, preroll: 0.5, sampleRate })
```

Hooked automatically through the existing calls (no new hooks needed): the leagues and venues (from `G` / `OG`,
`OPPONENTS`, `S.cos.mat`, `S.wx.cur.time`), late evening, On-Sets (`OG`, or the 'onsets' screen), tension (Resources
in `G.cubes` / `OG.cubes`), the shake and challenge codas (`setMood('play')` while `G.phase === 'over'`, good when
`G.lastShake.pts[0] >= 4`), the win coda (`setMood('win')`), the loss coda (`Snd.danceMusic` while the match is over),
leitmotifs on entrance (`Snd.theme`), the 15 babble voices (`Snd.babble` / `Snd.talk`), skins (`S.cos.skin`), the
crowd's key and the roar's chant.

**Loading.** `js/music.js` loads on demand: `Snd` adds `<script src="js/music.js">` when it makes the AudioContext.
Until it arrives (or if it cannot load), the older built-in bed plays. index.html does not need a change. It is picked
up by `node tools/build-precache.js` (it scans js/) for offline play: run that before publishing.

## 6. Optional hook lines (files I do not own)

- **js/game.js**, creature wins a shake. In `endShake`, after the line with `Snd.chime(); FX.confetti(70);`, the
  `else` branch (kid did not do well), add: `if (G.mode === 'ai' && G.players[1] && G.players[1].ai && Snd.motif) Snd.motif(G.players[1].ai.kind, 'win');`
- **js/game.js**, creature beaten. In `endMatch`, in `if (won) {`, after `creatureMood(loseMood(o));` add:
  `if (Snd.motif) setTimeout(function () { Snd.motif(o.kind, 'beaten'); }, 3600);` (after the fanfare)
- **js/game.js**, correct Solution reads out. Where a Solution is accepted (`resolveChallenge`, when `ok`), add:
  `if (ok && Snd.readout) Snd.readout(tokens.map(function (t) { return typeof t === 'string' ? t : t.s; }), G.goal);`
  (the cubes' symbols in order; the goal argument is accepted but the closing note is the next C/E/G cadence note)
- **js/three/table.js** line ~1157, `if (k >= 1 && a.land) { Snd.thunk();`: pass the zone if the animation knows it:
  `Snd.thunk(a.zone);`
- **js/three/table.js** drag start (`dragS.on = true; Snd.pickup();`), on release add `Snd.slide(0.3);`
- **js/onsets/** and **js/three/onsets3d.js**: `Snd.card('lift')` when a card is picked up, `Snd.card('place')` when
  it lands, `Snd.card('flip')` when turned.
- **js/game.js**, a great moment (a 5-cube Solution, a perfect match): `crowdReact('chant');`

## 7. Note events (for a musician)

These are dumped with `Music._log` (times in seconds from the downbeat; Classic at 88 bpm, so a beat is 0.68 s).

**The theme** (menu, kalimba), 8 bars, 4/4:
G4 C5 E5. D5 E5 | G5 - E5 C5 | A4 C5 F5. E5 F5 | A5 - G5 - | E5 G5 A5 G5 | F5 A5 C6 - | B5 G5 B5 D6 B5 | C6 - - -
(dotted pairs as 8th + 8th, the first note of bars 1 and 3 a dotted quarter). Chords per half bar:
C C | C Am | F F | Dm G | C Am | F F | G G | C C. Voicings come out as C4 E4 G4, A3 C4 E4, F3 A3 C4, F3 A3 D4, G3 B3 D4.

**Legend League** (Lydian): bar 3 becomes A4 C5 F#5. E5 F#5 over a D bass (D2), then A5 G5. The F sharp is sung
over D major instead of a diminished F sharp chord.

**Messy, play** (bass line): C2 G2 | Bb2 F3 (A2 passing) | F2 C3 (E2 passing) | C2 G2: the B flat of Mixolydian.

**Challenge ostinato** (A minor, the theme's head): A2 D3 F3 E3 F3 at 0, 0.71, 1.07, 1.79, 2.14 s, triangle,
low-passed, under a drone on A1.

**On-Sets waltz** (3/4, 116 bpm): bass on beat 1 (C2, C2, F2, D2), the theme's notes re-timed into three beats
(E4 ... G4 E4 C4 | F4 ... A4 G4), a soft harp "pah-pah" on beats 2 and 3.

**Thinking**: chords held two bars (F3 A3 C4, then G3 B3 D4); 1-3 kalimba notes per bar at most, off the grid, at
0.98 and 2.45 s, then nothing for 6 s, then two more (after this dump the range is clamped to G4 to E6).

**Win coda** (100 bpm, starting 1.9 s after the fanfare): celesta F5 A5 C6 | B5 G5 B5 D6 | C6 (held) doubled an octave
down by a soft horn; bass F2 G2 C2; harp C5 E5 G5 C6 E6 rising at the end.

**Loss coda** (84 bpm, music box): G4 C5 E5. D5 E5 | A5 G5 E5 (held); chords C, F, C; it ends on the third (E), up.

**Leitmotifs** (midi in `MOTIFS`, js/music.js): Pip G5 C6 E6 (chirps); Snoozy G2 C3 E3 then a glide to D3 (tuba);
Penny E5 D5 E5 G5 (xylophone); Rusty G4 C5 D#5-E5 (pizzicato, a grace note); Ollie E4 G4 A4 G4 (clarinet); Mondo
F4 A4 C5 E5 over F2 (celesta); Grub C3 G2 Bb2 (bassoon); Splosh C4 D4 E4 . C4 (marimba); Blaze G4 C5 E5 G5 quick
(muted horn); Hex E4 D4 E4 Bb4 (accordion); King Messy C3 G3 E3 C3 with pizz G4 Bb4 G4 (oom-pah); Bleep C5 E5 G5 C6
C6-C6 (bleeps); Flip C6 G5 E5 (flute); Squiggle E4 G4 A4 G4 (wobble); Nugget G3 C4 E4 with timpani C2 (horn); Chroma
F4 A4 C5 E5 then F4 Ab4 C5 Eb5 then E5 (harp, changing colour). An entrance plays the motif and a softer echo over a
soft chord; "won a shake" is a fourth higher and 12 % faster; "beaten" is 18 % slower with a friendly major-sixth harp
chord at the end.

## 8. Verified vs not

Measured: the loudness and peaks above, energy above 4 kHz, no clipping, no "hard stop" flags on the new sounds, and
the node counts. Read: the note events of the theme and states (below). **Not verified (nobody heard it):** whether
it is pleasant for an hour (variation was designed in, not listened to), the instruments' character on iPad speakers,
whether the codas land musically against the game's chime and boop in real timing, the lullaby time switch on a real
device, and the On-Sets screen detection in real play.
