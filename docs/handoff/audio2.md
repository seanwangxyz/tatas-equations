# Audio upgrade 2: crackles, the birthday choir, a quality pass

Owner feedback: "the singing could be better, some of the sounds are a little crackly at times. i think the audio in
general could use an upgrade."

Files: `js/sound.js`, `js/birthday-sfx.js` (rewritten), `js/title-sfx.js`, `js/music.js`, `js/crowd-sfx.js`,
`js/soundcheck.js`, new `js/audio-check.js` (a developer tool, not loaded by the game). No other file was touched;
**no call site has to change** (same API, same sounds in the same places, same loudness targets).

**Measured vs not.** Every number here is from offline renders (OfflineAudioContext, 48 kHz, Chromium on this Windows
laptop) through the real mix chain at the default volumes. Nobody listened: how the choir sounds, how it feels on iPad
speakers, and whether the crackles are gone on a real iPad are **not verified by ear**. The structural causes that
make an iPad crackle (too many live nodes at once, gain steps) were measured before and after.

## 1. Crackles: what caused them, what fixed them

| Cause (found by measuring) | Fix |
|---|---|
| **Too many live nodes at once in the busiest moments.** The birthday song built ~1,190 nodes in one go (3 voices per note x 25 notes, each a saw + triangle + 3 filters + vibrato, plus 70 accompaniment oscillators) and kept them all connected for 15 s. A match win peaked at 87 voices / ~1,240 nodes, the title opening at 62 voices / ~940 nodes. On an iPad the audio thread must pull every connected node every 2.7 ms; when it misses one block it is heard as a crackle (an underrun). | **Pre-rendering** the heavy, fixed pieces once, offline, in the background, into AudioBuffers that then play as ONE source each: the birthday song (whole choir + waltz + room, stereo), the birthday "Hooray!", the win fanfare, the win roar (2 variants, played in turn) and the title fanfare. Birthday song: 1,190 nodes -> 1 source. Match win: 87 -> 50-52 voices, ~1,240 -> ~700 nodes. Title opening: 62 -> 27 voices, ~940 -> ~460 nodes. Live versions remain as the fallback. |
| **Gain steps in sustained notes.** `brass()` (fanfare, slam, stings) ramped up to its level and then *jumped* to 85 % with `setValueAtTime`; creature babble did the same on every syllable (a 15 % step in a sawtooth = a click per syllable, the sound heard most often). The old choir did it on every note. | Linear ramps instead of jumps (`sound.js` brass and babble). The new choir uses only ramps/targets. crowd-sfx's bus level now glides (`setTargetAtTime`). |
| **A raspy low babble.** Snoozy, the Wizard and the Monster League talk on a 92-120 Hz sawtooth through low-Q band-passes: its sharp edge got through, and on iPad speakers (no bass) it is heard as ~100 clicks a second. The checker counted 125-144 click spikes per line (sloth, wizard, grub, zog, nugget), 48-50 for owl/splosh. | A gentle 2.6 kHz low-pass on the babble source before the formants: **0 spikes** for every creature, same loudness. |
| **The master clipper bent everything.** A tanh curve from 0: every loud sound got a little distortion, and pile-ups intermodulated. | Exactly linear up to -6 dBFS, then a smooth knee to the -1 dBFS ceiling; 4x oversampled (was 2x). The old curve's small-signal gain (x1.125) is kept so every sound stays at its measured level. Match-win peaks: -4.7 before, -3.9 to -4.3 dBFS now (a little less shaving below the knee), no clipping. |
| **The smallest output buffer on touch devices.** The default `latencyHint: 'interactive'` asks for ~3 ms blocks. | `latencyHint: 'balanced'` on touch devices (iPad, phones; not laptops): more room for the audio thread, ~10-20 ms more latency, not noticeable on a tap sound. Safari may ignore the hint; it cannot hurt. |
| Checked and **not** a cause | No ScriptProcessorNode anywhere (main-thread stalls cannot crackle WebAudio here). No setValueAtTime jumps left on a sounding gain (grep + the checker). Every source starts and ends at silence (onset/end columns). DC <= 0.0003. Nothing clips (0 samples > 0.99 in every render, true peak <= -3.8 dBTP). The limiter (DynamicsCompressor) already has a built-in ~6 ms look-ahead in Chrome and WebKit, so no extra delay line was added. Denormals: browsers flush them on the audio thread (ARM does by default), and the only feedback loop (music echo) has a low-pass in it. |

### The offline checker (`js/audio-check.js`)

```js
var s = document.createElement('script'); s.src = 'js/audio-check.js'; document.head.appendChild(s);
AudioCheck.run().then(function (rows) { console.log(AudioCheck.table(rows)); });   // ~3 min, every Sound check item
AudioCheck.run(['scene.win', 'birthday.song']);                                   // or just some
```

It renders every Sound check item, the three pile-up scenes (`SoundCheck.SCENES`) and the birthday song through
`Snd._measure` and reports: max sample jump (and where), **click spikes** (second difference > 10x its local 15 ms RMS
and > 0.005: a discontinuity, tested on synthetic phase/gain steps), clip count (> 0.99), true peak (4x oversampled),
DC, onset level (first ms) and end level (last ms), **peak sources playing at once** and **nodes created** (it wraps
the factory methods of offline contexts). "Nodes" in the table below excludes the ~95 nodes of the mix itself, which
every render builds. The pre-rendered pieces show 1 source because they are one buffer by the time they play.

## 2. The birthday song (js/birthday-sfx.js)

**How it is made.** Ten synthesised singers in four sections: two sections on the tune (left / right of centre), three
big low monsters an octave down, one small bright creature. Each singer is ONE continuous voice for the whole song, so
the legato is real (pitch glides between notes, ~26 ms time constant) instead of a new beep per note:

- **Source**: a soft glottal-pulse PeriodicWave (48 harmonics at about -7 dB/octave, the top ones eased out), not a
  buzzy sawtooth.
- **Formants**: three peaking filters (F1 +13 dB, F2 +11..14, F3 +5..9) on each section that move from vowel to vowel
  with the words, with short linear ramps (articulation). Formant sets per vowel (Hz): ae 760/1850/2700, i
  320/2350/3000, er 500/1400/1750, e 520/1850/2550, u 360/880/2300, ah 780/1220/2600, uh 640/1200/2550, n
  280/1500/2500; scaled 0.83 (monsters) to 1.22 (the small creature).
- **Words**: one syllable per note, with the consonant just *before* the beat so the vowel lands on it: h = a soft
  breath, p/t = a short closure and a little puff, b/d = a short voiced dip, y = a glide from "ee", s = a soft hiss,
  r = through "er"; diphthongs glide late in the note (day e>i, dear i>er, Ty ah>i, son uh>n).
- **Expression**: a 70-cent scoop into each line, vibrato that starts ~0.25 s into notes longer than 0.45 s
  (14-30 cents, 4.9-6.4 Hz per singer), a small swell on the held notes, softer pickups ("py"), line 3 ("dear Tyson")
  a little louder, the last note held and released over ~0.5 s.
- **A group, not a robot**: per-singer tuning (-11..+15 cents), timing (-12..+40 ms plus +-8 ms per note), vibrato
  rate and depth, level, and stereo place.
- **Accompaniment**: a warm 3/4 waltz synthesised in js (additive, each partial with its own decay, upper partials
  dying first, felt-hammer attack, damper at release): piano bass + soft octave on beat 1, piano chords under the
  voices on 2 and 3, and a quiet music box doubling the tune an octave up. It sits ~7 dB under the choir.
- **Room**: a small Freeverb-style room (8 damped combs + 4 all-passes a side, ~1 s) run in js on the reverb send,
  about 14 dB under the dry sound.
- **Tone**: the whole choir is high-passed at 90 Hz and low-passed at 3.6 kHz. Measured spectrum of the song (share of
  energy): 0-150 Hz -9.7 dB (the bass), 150-300 -5.3, 300-600 -4.2, 600-1200 -8.7, 1.2-2.4 kHz -11.9, 2.4-4 kHz -18.2,
  above 4 kHz -29 dB (0.1 % of the energy: nothing harsh).

**Rendered once, offline.** `BirthdaySfx.prerender()` renders the song (17.6 s) in an OfflineAudioContext with 4
channels (dry + reverb send), then mixes the waltz and the room in js in 0.75 s slices (the page never stalls), and
normalises it to a fixed RMS (the old choir's level). Graph: ~85 nodes for the whole song (was ~1,190 live).
Measured here: render 0.9-1.2 s + waltz/room 0.5 s, ready **~2.0 s after the show starts** (the song starts at 10.2 s).
The "Hooray!" is rendered right after (1.9 s buffer). On an iPad expect roughly 2-4x longer: still well before the song.

**When it renders.** `js/title-sfx.js` watches `<body>` for the show's `.bday-on` class and loads
`js/birthday-sfx.js` as a plain script right away; the file starts rendering when it loads. (The show itself only
imports it 9.6 s in; it then finds `window.BirthdaySfx` already there. Loading the file twice is harmless.) No user
gesture is needed for an offline render. The Sound check also has "Birthday song" and "Birthday Hooray!".

**The timing contract is unchanged.** `BirthdaySfx.song(plan, delay) -> { t0, stop() }`, `t0` = audio time of beat
0, `pop(kind)`, `stopAll()`. The buffer starts 0.3 s before beat 0 (room for the first breath) and is started at
`t0 - 0.3` (or at once with the matching offset), so beat 0 of the buffer is exactly `t0`; birthday.js keeps the
mouths on the audio clock from `t0` as before. Checked in the show: `TataBirthday.play()` -> song ready after 2.0 s ->
`seek(10.1)` -> `song()` returned mode "buffer", `t0` = buffer beat 0; after 2 s of playback the show clock and the
audio clock agreed within the 21 ms of the manual seek; skip faded it out (0 sources 0.6 s later); end gave the title
back; no warnings. In the buffer, each line's vowel onset is at its note time (level -40 dB just before, -23 dB just
after "Hap" at 0, 3.36, 6.72, 11.20 s). If the show's plan ever differs from the built-in copy (a different tune or
beat), or there is no OfflineAudioContext, the song is sung live (~85 nodes plus the waltz as short buffers); if the render is late, the buffer joins
on the right beat with a 0.12 s fade-in.

**The notes and syllables** (`BirthdaySfx._syllables()`; times in s from beat 0, 0.56 s a beat, C major, 3/4):

| # | t | dur | note | word | sound |
|---|---|---|---|---|---|
| 0-5 | 0.00 0.42 0.56 1.12 1.68 2.24 | .42 .14 .56 .56 .56 1.12 | G4 G4 A4 G4 C5 B4 | Hap-py birth-day to you | h-ae, p-i, b-er, d-e>i, t-u, y-u |
| 6-11 | 3.36 3.78 3.92 4.48 5.04 5.60 | same | G4 G4 A4 G4 D5 C5 | Hap-py birth-day to you | as above |
| 12-18 | 6.72 7.14 7.28 7.84 8.40 8.96 9.52 | .42 .14 .56 .56 .56 .56 1.68 | G4 G4 G5 E5 C5 B4 A4 | Hap-py birth-day dear Ty-son | ..., d-i>er, t-ah>i, s-uh>n |
| 19-24 | 11.20 11.62 11.76 12.32 12.88 13.44 | .42 .14 .56 .56 .56 1.68 | F5 F5 E5 C5 D5 C5 | Hap-py birth-day to you | as line 1 |

Chords (beat): C (1), G (4), G (7), C (10), C7 (13), F (16), C (20), G (23), C (24): the bass on the beat, the chord
on the next beats. **Pitch check** on the rendered buffer (energy at the written pitch vs one semitone either side, in
the middle of each note): every note is at its written pitch by 13-64 dB (the shortest notes, "py", lowest).

## 3. The general pass

- **Master**: the clipper above; the glue compressor and limiter as before (they measured fine: no clipping, peaks about -4 dBFS at worst,
  true peak never above -3.8 dBTP); `latencyHint` above.
- **Pre-rendered** (idle, one at a time, 2.5 s after the first tap; `Snd._baked()` lists them): fanfare 0.5-0.7 s,
  roar 0.85-1.4 s each, title fanfare 0.7-0.9 s (rendered 0.4 s after the page loads, for the opening's beat). The
  baked buffer is what the sound sends to the master (reverb included) at unity volume, played into the same place
  (after its category balance, before Mute/limiter), so Mute, the sliders and ducking still apply. The bake never
  touches the live mix: the graph is built on the offline context and the live state is put back before rendering.
  Loudness the same within the render-to-render spread (fanfare -17.7 -> -18.0, roar -20.9 -> -20.6..-21.5).
- **Babble**: the source low-pass (no rasp) and no per-syllable gain step.
- **Brass** (fanfare, slam, stings): no gain step on the sustain.
- **Cymbals** (fanfare/slam crash, title fanfare): band-passed at 4.2 kHz + 6 kHz instead of a 5.5 kHz high-pass +
  8-9 kHz: the same splash, nothing piercing on small speakers.
- **Music instruments** (`js/music.js`): kalimba, marimba, music box, celesta and vibes now have a body (a few soft
  partials in one PeriodicWave each, so no extra nodes) instead of a bare sine; the bright strike partial stays.
  Music beds still measure -31 to -36 LUFS (as before).
- **Sound check**: new items "Birthday song" and "Birthday Hooray!" (music).
- **iOS**: still one context, unlocked on the first tap, resumed after the background; prerendering needs no gesture
  (offline contexts never do) and never blocks the page.

Not changed (measured fine, or game logic): which sounds play when, the rate limits, the category targets, the cube
sound banks (no clicks or spikes measured; their designed knock is the "hard start" of a percussive sound), the
crowd, weather, fireworks and matchday files (no gain steps found).

## 4. Snippets for other files

None required. Optional, in `js/three/birthday.js` `timeline()` (anchor: `at(0.15, function () { var s = H.sfx();`),
start loading the choir at the very start of the show too (title-sfx.js already does this; this is belt and braces):

```js
  at(0.15, function () { loadSfx(); var s = H.sfx(); if (s) { s.begin(); s.play('sparkle', 0.05); s.play('chime', 0.3); } });
```

## 5. Verified / not verified

Verified (measured): the checker numbers below; 0 clipped samples everywhere; the babble rasp gone (0 spikes); the
pre-rendered pieces at the same loudness as the live ones; node and voice counts in the worst moments; the birthday
show end to end in the pane (song ready 2 s in, buffer mode, beat 0 = `t0`, skip and end clean, no warnings); the
song's pitches and syllable timing in the rendered buffer; `node tests/engine.test.js` 948 passed.

Not verified: anything by ear (the choir's charm, the vowels' clarity, the waltz balance, the new instrument bodies);
a real iPad (render times there, whether 'balanced' latency is honoured, the crackles actually gone on the device);
Safari's offline rendering (the code handles the old callback form `oncomplete` as well as the promise).

## 6. The checker table, before and after

Before = the base commit `83b0aa1` (served from a copy), after = this branch; one render each (many sounds are a
little random, so single numbers move by up to ~1 dB, and a "2" in the spikes column is one event on both channels).
**M-max** = loudest 400 ms (LUFS), **true peak** dBTP, **clip** = samples > 0.99, **max jump** = largest sample step,
**click spikes** (section 1), **onset / end** = level in the first / last ms (cut = still sounding at the end of the
render window), **peak sources** = sources playing at once, **nodes** = nodes created (minus the ~95 of the mix).
Rows marked "not rendered" are title sounds the offline hook does not render (silent in both runs). The remaining
2-spike events are slope corners (e.g. the fanfare at 1.072 s: the slope goes from -0.005 a sample to 0 at the
timpani entry, a -46 dB detail, not a step); the 125-144-spike rows were the babble rasp.

| Sound | M-max before / after | true peak dBTP before / after | clip >0.99 | max jump before / after | click spikes before / after | DC after | onset / end dB after | peak sources before / after | nodes before / after |
|---|---|---|---|---|---|---|---|---|---|
| click | -31.5 / -30.1 | -12.8 / -12.3 | 0 / 0 | 0.053 / 0.065 | 0 / 0 | -0.00006 | -12 / -60 | 1 / 1 | 2 / 2 |
| pop | -32.3 / -31.9 | -17.3 / -17.2 | 0 / 0 | 0.012 / 0.011 | 0 / 0 | 0 | -28 / -60 | 1 / 1 | 4 / 4 |
| pickup | -29.8 / -29.2 | -17.9 / -16.4 | 0 / 0 | 0.059 / 0.061 | 0 / 0 | -0.00002 | -28 / -54 | 1 / 1 | 3 / 3 |
| sting.emote | -32.3 / -32.2 | -17 / -16.5 | 0 / 0 | 0.011 / 0.011 | 0 / 0 | 0.00001 | -40 / -59 | 2 / 2 | 7 / 7 |
| title.hover | (not rendered by the offline hook) | | | | | | | | |
| title.press | (not rendered by the offline hook) | | | | | | | | |
| diceHit | -26.3 / -26.4 | -5.9 / -5.7 | 0 / 0 | 0.075 / 0.066 | 0 / 0 | -0.00009 | -7 / -55 | 1 / 1 | 3 / 3 |
| clatter | -23.4 / -23.2 | -8.1 / -6.8 | 0 / 0 | 0.212 / 0.26 | 0 / 0 | -0.0002 | -8 / -60 | 3 / 3 | 48 / 48 |
| cupRattle | -21.9 / -21.4 | -8.1 / -8 | 0 / 0 | 0.16 / 0.245 | 0 / 0 | -0.00001 | -35 / cut | 1 / 1 | 4 / 4 |
| thunk | -26.7 / -26.3 | -10.2 / -11 | 0 / 0 | 0.018 / 0.017 | 0 / 0 | -0.00006 | -13 / -60 | 2 / 2 | 6 / 6 |
| boop | -25.9 / -26 | -15.2 / -15.1 | 0 / 0 | 0.01 / 0.01 | 0 / 0 | -0.00001 | -53 / cut | 6 / 6 | 16 / 16 |
| chime | -20.8 / -20.9 | -14.1 / -13.1 | 0 / 0 | 0.053 / 0.052 | 0 / 0 | 0 | -47 / -60 | 21 / 21 | 64 / 64 |
| whistle | -25.4 / -25.3 | -26.2 / -25.7 | 0 / 0 | 0.019 / 0.019 | 0 / 0 | 0 | -53 / cut | 6 / 6 | 16 / 16 |
| slam | -18.1 / -18 | -6.7 / -6.5 | 0 / 0 | 0.331 / 0.358 | 0 / 0 | -0.00006 | -59 / -60 | 19 / 19 | 45 / 45 |
| fanfare | -17.7 / -18 | -7.1 / -7.1 | 0 / 0 | 0.14 / 0.065 | 0 / 2 | -0.0002 | -50 / -59 | 41 / 1 | 260 / 3 |
| sting.card | -21.3 / -21.3 | -14.2 / -13.3 | 0 / 0 | 0.073 / 0.074 | 0 / 0 | 0 | -42 / -60 | 21 / 21 | 65 / 65 |
| sting.levelup | -20.6 / -20.6 | -13.2 / -13.4 | 0 / 0 | 0.05 / 0.047 | 0 / 0 | -0.00001 | -34 / -59 | 28 / 28 | 93 / 93 |
| sting.vs | -21.5 / -21.3 | -10.1 / -9.6 | 0 / 0 | 0.179 / 0.192 | 0 / 0 | 0.00007 | -59 / -59 | 8 / 8 | 20 / 20 |
| motif.pip | -21.6 / -21.4 | -11.8 / -11.6 | 0 / 0 | 0.033 / 0.033 | 0 / 0 | 0 | -46 / -60 | 8 / 8 | 28 / 28 |
| motif.snoozy | -20.9 / -20.6 | -15.8 / -15.8 | 0 / 0 | 0.005 / 0.006 | 0 / 0 | 0 | -53 / cut | 9 / 9 | 34 / 34 |
| motif.penny | -21.4 / -21.5 | -10.6 / -10.5 | 0 / 0 | 0.04 / 0.042 | 2 / 0 | 0.00005 | -29 / -58 | 10 / 10 | 48 / 48 |
| motif.fox | -21 / -21.1 | -10.9 / -10.4 | 0 / 0 | 0.051 / 0.051 | 0 / 0 | 0 | -45 / -60 | 8 / 8 | 28 / 28 |
| motif.owl | -20.6 / -20.1 | -15.4 / -15.1 | 0 / 0 | 0.02 / 0.02 | 0 / 0 | 0 | -50 / -60 | 7 / 7 | 28 / 28 |
| motif.wizard | -20.6 / -19.9 | -13.6 / -12.8 | 0 / 0 | 0.012 / 0.018 | 0 / 0 | -0.00001 | -54 / -60 | 13 / 13 | 34 / 34 |
| motif.grub | -20.4 / -20 | -16.6 / -16.9 | 0 / 0 | 0.008 / 0.008 | 0 / 0 | 0 | -48 / -60 | 7 / 7 | 25 / 25 |
| motif.splosh | -21.4 / -21.3 | -11.8 / -11.6 | 0 / 0 | 0.014 / 0.016 | 4 / 6 | 0.00006 | -40 / -60 | 9 / 9 | 32 / 32 |
| motif.blaze | -21 / -20.8 | -14.8 / -15.1 | 0 / 0 | 0.014 / 0.015 | 0 / 0 | 0 | -53 / -60 | 14 / 14 | 56 / 56 |
| motif.hex | -21.2 / -21.3 | -14.9 / -15.1 | 0 / 0 | 0.019 / 0.017 | 0 / 0 | 0 | -51 / -60 | 10 / 10 | 40 / 40 |
| motif.zog | -20.8 / -20 | -16.6 / -16.1 | 0 / 0 | 0.01 / 0.01 | 0 / 0 | 0 | -53 / -60 | 9 / 9 | 45 / 45 |
| motif.bleep | -20.8 / -21.2 | -14.8 / -14.9 | 0 / 0 | 0.022 / 0.021 | 0 / 0 | 0 | -36 / -59 | 8 / 8 | 52 / 52 |
| motif.flip | -20.9 / -20 | -16 / -15.1 | 0 / 0 | 0.015 / 0.015 | 0 / 0 | 0 | -54 / cut | 10 / 10 | 40 / 40 |
| motif.squiggle | -21.3 / -21.2 | -12 / -12 | 0 / 0 | 0.014 / 0.014 | 0 / 0 | 0 | -52 / -60 | 9 / 9 | 32 / 32 |
| motif.nugget | -20.9 / -20.9 | -12 / -12 | 0 / 0 | 0.009 / 0.008 | 0 / 2 | -0.00016 | -47 / -59 | 11 / 11 | 35 / 35 |
| motif.chroma | -21.6 / -22 | -12.7 / -13 | 0 / 0 | 0.017 / 0.015 | 0 / 0 | 0.00001 | -37 / -60 | 15 / 15 | 43 / 43 |
| motif.fox.win | -22 / -21.8 | -12.2 / -11.9 | 0 / 0 | 0.048 / 0.048 | 0 / 0 | 0 | -52 / -60 | 8 / 8 | 28 / 28 |
| motif.fox.beaten | -19.1 / -18.9 | -10.9 / -10.4 | 0 / 0 | 0.042 / 0.042 | 0 / 0 | 0 | -46 / -60 | 9 / 9 | 37 / 37 |
| thunk.plastic | -26.5 / -26.7 | -10.1 / -9.8 | 0 / 0 | 0.02 / 0.021 | 0 / 0 | -0.00005 | -13 / cut | 2 / 2 | 6 / 6 |
| dice.plastic | -25.2 / -28.1 | -7.5 / -6.3 | 0 / 0 | 0.205 / 0.259 | 0 / 0 | -0.00012 | -7 / -58 | 2 / 2 | 6 / 6 |
| thunk.candy | -27.3 / -26.4 | -11 / -10.5 | 0 / 0 | 0.027 / 0.024 | 0 / 0 | -0.00007 | -12 / -56 | 2 / 2 | 6 / 6 |
| dice.candy | -25.6 / -25.4 | -5.4 / -5.3 | 0 / 0 | 0.32 / 0.244 | 0 / 0 | -0.0001 | -5 / -58 | 2 / 2 | 6 / 6 |
| thunk.stone | -27.1 / -26.7 | -11.3 / -10.8 | 0 / 0 | 0.013 / 0.015 | 0 / 0 | -0.00007 | -14 / cut | 2 / 2 | 6 / 6 |
| dice.stone | -25.9 / -24.2 | -7.2 / -5.9 | 0 / 0 | 0.169 / 0.076 | 0 / 0 | -0.00013 | -6 / -60 | 2 / 2 | 6 / 6 |
| thunk.glass | -27.2 / -26.7 | -11.2 / -9.9 | 0 / 0 | 0.022 / 0.024 | 0 / 0 | -0.00006 | -13 / -60 | 2 / 2 | 6 / 6 |
| dice.glass | -25.2 / -24.4 | -6.7 / -6 | 0 / 0 | 0.311 / 0.198 | 0 / 0 | -0.00011 | -7 / -60 | 2 / 2 | 6 / 6 |
| thunk.metal | -27.1 / -27.3 | -11.1 / -11.3 | 0 / 0 | 0.023 / 0.022 | 0 / 0 | -0.00006 | -13 / -59 | 2 / 2 | 6 / 6 |
| dice.metal | -23.1 / -23.1 | -6.6 / -6.2 | 0 / 0 | 0.229 / 0.082 | 0 / 0 | -0.00018 | -6 / cut | 2 / 2 | 6 / 6 |
| thunk.zone.required | -25.8 / -25.7 | -9.8 / -9.9 | 0 / 0 | 0.019 / 0.02 | 0 / 0 | -0.00006 | -12 / cut | 2 / 2 | 6 / 6 |
| thunk.zone.permitted | -26.8 / -26.9 | -10.1 / -10 | 0 / 0 | 0.019 / 0.017 | 0 / 0 | -0.00006 | -12 / -57 | 2 / 2 | 6 / 6 |
| thunk.zone.forbidden | -27.9 / -28.1 | -12.5 / -12.5 | 0 / 0 | 0.01 / 0.011 | 0 / 0 | -0.00004 | -14 / -58 | 2 / 2 | 7 / 7 |
| thunk.zone.goal | -27.3 / -26.5 | -11.5 / -10.9 | 0 / 0 | 0.021 / 0.023 | 0 / 0 | -0.00007 | -13 / -56 | 2 / 2 | 6 / 6 |
| thunk.zone.resources | -28.7 / -29.1 | -11.8 / -13.1 | 0 / 0 | 0.015 / 0.014 | 0 / 0 | -0.00005 | -16 / -60 | 2 / 2 | 6 / 6 |
| slide | -31.5 / -31.9 | -13.6 / -13.2 | 0 / 0 | 0.031 / 0.03 | 0 / 0 | -0.00008 | -59 / -58 | 1 / 1 | 4 / 4 |
| card.lift | -32 / -32.2 | -14.8 / -16.5 | 0 / 0 | 0.02 / 0.018 | 0 / 0 | 0.00001 | -59 / -59 | 2 / 2 | 6 / 6 |
| card.place | -32 / -31.7 | -13.1 / -11.6 | 0 / 0 | 0.019 / 0.014 | 1 / 1 | -0.00011 | -28 / -59 | 2 / 2 | 6 / 6 |
| card.flip | -34.9 / -36.1 | -12.6 / -18.2 | 0 / 0 | 0.098 / 0.08 | 0 / 0 | 0.0001 | -53 / -59 | 2 / 2 | 8 / 8 |
| crowd.chant | -28.2 / -27 | -8.8 / -10 | 0 / 0 | 0.084 / 0.084 | 0 / 0 | 0.00001 | -19 / -54 | 7 / 7 | 174 / 174 |
| readout | -22.6 / -22.3 | -14 / -13.6 | 0 / 0 | 0.042 / 0.041 | 0 / 0 | 0 | -47 / -60 | 12 / 12 | 46 / 46 |
| fx.boom | -30.4 / -30.2 | -13.4 / -13.5 | 0 / 0 | 0.029 / 0.017 | 0 / 0 | 0.00013 | -20 / -58 | 4 / 3 | 30 / 24 |
| fx.launch | -47.8 / -47.5 | -34.1 / -35.9 | 0 / 0 | 0.002 / 0.003 | 0 / 0 | 0 | -46 / -60 | 1 / 1 | 7 / 7 |
| fx.swish | (not rendered by the offline hook) | | | | | | | | |
| crowd.clap | -28.8 / -28.4 | -11.1 / -10.7 | 0 / 0 | 0.083 / 0.109 | 0 / 0 | 0.00001 | -34 / -60 | 3 / 3 | 68 / 68 |
| crowd.ooh | -18.3 / -19.9 | -12.5 / -13.5 | 0 / 0 | 0.011 / 0.01 | 0 / 0 | -0.00001 | -60 / -59 | 6 / 6 | 38 / 38 |
| crowd.gasp | -22.6 / -22.5 | -9.9 / -9.8 | 0 / 0 | 0.079 / 0.083 | 0 / 0 | -0.00001 | -44 / -59 | 4 / 4 | 26 / 26 |
| crowd.cheer | -24.4 / -22.8 | -10.2 / -11.2 | 0 / 0 | 0.084 / 0.074 | 0 / 0 | -0.00003 | -59 / -58 | 9 / 9 | 100 / 100 |
| crowd.aw | -24.2 / -20.9 | -16.3 / -14.4 | 0 / 0 | 0.011 / 0.012 | 0 / 0 | 0 | -60 / -59 | 5 / 5 | 34 / 34 |
| snd.crowd.ooh | -24.8 / -24.6 | -16.3 / -15.9 | 0 / 0 | 0.018 / 0.022 | 0 / 2 | 0 | -60 / -58 | 19 / 19 | 76 / 76 |
| snd.crowd.aww | -23.8 / -23.8 | -11.9 / -13.2 | 0 / 0 | 0.028 / 0.027 | 0 / 0 | 0 | -59 / -60 | 19 / 19 | 76 / 76 |
| snd.crowd.cheer | -24.4 / -24.9 | -14.8 / -14 | 0 / 0 | 0.058 / 0.052 | 0 / 0 | 0 | -57 / -59 | 22 / 22 | 87 / 87 |
| snd.crowd.gasp | -23.6 / -24 | -14.1 / -11.5 | 0 / 0 | 0.041 / 0.035 | 0 / 0 | 0 | -54 / -60 | 15 / 15 | 60 / 60 |
| snd.crowd.laugh | -25.2 / -24.8 | -12.7 / -13.3 | 0 / 0 | 0.035 / 0.03 | 2 / 0 | 0 | -59 / -60 | 8 / 8 | 46 / 46 |
| snd.crowd.clap | -26.7 / -27 | -14.9 / -14.3 | 0 / 0 | 0.082 / 0.071 | 0 / 0 | 0 | -58 / -58 | 1 / 1 | 4 / 4 |
| snd.crowd.chant | -28.8 / -27.8 | -12 / -10 | 0 / 0 | 0.106 / 0.13 | 0 / 0 | 0 | -18 / -57 | 7 / 7 | 131 / 131 |
| roar | -20.9 / -20.6 | -12.4 / -10.9 | 0 / 0 | 0.067 / 0.078 | 2 / 2 | 0 | -58 / -59 | 24 / 1 | 300 / 3 |
| babble.pip | -21.3 / -21.2 | -9.7 / -9.5 | 0 / 0 | 0.041 / 0.036 | 0 / 0 | 0 | -40 / -59 | 2 / 2 | 10 / 11 |
| babble.sloth | -21.6 / -21.8 | -6.5 / -6 | 0 / 0 | 0.056 / 0.049 | 128 / 0 | 0.00004 | -36 / cut | 3 / 3 | 12 / 13 |
| babble.penguin | -21.4 / -21.4 | -10.1 / -9.5 | 0 / 0 | 0.07 / 0.05 | 2 / 0 | 0 | -30 / -58 | 2 / 2 | 10 / 11 |
| babble.fox | -21.4 / -21.5 | -10.3 / -10.2 | 0 / 0 | 0.058 / 0.044 | 0 / 0 | 0 | -32 / -60 | 2 / 2 | 10 / 11 |
| babble.owl | -21.4 / -21.6 | -8.5 / -7.9 | 0 / 0 | 0.035 / 0.031 | 48 / 0 | 0.00002 | -38 / -57 | 3 / 3 | 12 / 13 |
| babble.wizard | -21.4 / -21.6 | -7 / -6.8 | 0 / 0 | 0.045 / 0.04 | 125 / 0 | -0.00007 | -28 / -53 | 5 / 5 | 16 / 17 |
| babble.grub | -20.8 / -21.1 | -6.9 / -6.3 | 0 / 0 | 0.045 / 0.042 | 142 / 0 | 0 | -37 / cut | 3 / 3 | 12 / 13 |
| babble.splosh | -21.4 / -21.6 | -7.7 / -7.2 | 0 / 0 | 0.048 / 0.039 | 50 / 0 | -0.00001 | -39 / cut | 3 / 3 | 12 / 13 |
| babble.blaze | -21.1 / -21.1 | -9.7 / -9.8 | 0 / 0 | 0.059 / 0.044 | 0 / 0 | 0 | -31 / -60 | 2 / 2 | 10 / 11 |
| babble.hex | -21.7 / -21.7 | -9.4 / -9.5 | 0 / 0 | 0.059 / 0.043 | 8 / 0 | 0 | -33 / -58 | 2 / 2 | 10 / 11 |
| babble.zog | -21.1 / -21.3 | -6.5 / -5.9 | 0 / 0 | 0.044 / 0.043 | 128 / 0 | 0.0001 | -36 / cut | 3 / 3 | 12 / 13 |
| babble.bleep | -22.1 / -22.3 | -10.6 / -10.8 | 0 / 0 | 0.027 / 0.027 | 0 / 0 | 0 | -36 / -59 | 2 / 2 | 10 / 11 |
| babble.flip | -21.7 / -21.7 | -9.2 / -9.4 | 0 / 0 | 0.051 / 0.044 | 0 / 0 | 0 | -38 / -59 | 2 / 2 | 10 / 11 |
| babble.squiggle | -20.2 / -20.5 | -10.6 / -10.3 | 0 / 0 | 0.029 / 0.027 | 0 / 0 | -0.00001 | -32 / -56 | 4 / 4 | 14 / 15 |
| babble.nugget | -20.9 / -21.1 | -6.7 / -6.3 | 0 / 0 | 0.046 / 0.042 | 144 / 0 | 0.00006 | -36 / cut | 3 / 3 | 12 / 13 |
| babble.chroma | -20.9 / -21.2 | -11.8 / -11.6 | 0 / 0 | 0.029 / 0.026 | 2 / 0 | 0 | -38 / -53 | 2 / 2 | 10 / 11 |
| amb.stadium | -44.7 / -45.3 | -33.4 / -33 | 0 / 0 | 0.002 / 0.002 | 0 / 0 | -0.00011 | -59 / cut | 6 / 6 | 16 / 16 |
| amb.room | -55.8 / -56.2 | -43.6 / -43 | 0 / 0 | 0 / 0 | 0 / 0 | -0.0001 | -60 / -55 | 4 / 4 | 11 / 11 |
| amb.rain | -45.2 / -45 | -37.2 / -36.8 | 0 / 0 | 0.004 / 0.004 | 0 / 0 | 0 | -60 / cut | 1 / 1 | 4 / 4 |
| amb.wind | -45.1 / -44.8 | -32.9 / -33 | 0 / 0 | 0.001 / 0.001 | 0 / 0 | -0.00012 | -59 / cut | 2 / 2 | 6 / 6 |
| amb.title | -45.1 / -46 | -35.9 / -35.9 | 0 / 0 | 0.002 / 0.001 | 0 / 0 | 0 | -51 / cut | 1 / 1 | 13 / 13 |
| music.menu | -32.3 / -32.8 | -24 / -23.6 | 0 / 0 | 0.007 / 0.007 | 0 / 0 | 0 | -54 / cut | 29 / 29 | 346 / 346 |
| music.play | -32.7 / -32.8 | -20.9 / -20.8 | 0 / 0 | 0.031 / 0.03 | 0 / 0 | 0.00001 | -47 / cut | 18 / 18 | 368 / 368 |
| music.think | -33.5 / -33.1 | -23.6 / -23.9 | 0 / 0 | 0.002 / 0.002 | 0 / 0 | 0 | -59 / cut | 15 / 15 | 80 / 80 |
| music.challenge | -32.4 / -32.8 | -22.9 / -23 | 0 / 0 | 0.003 / 0.003 | 0 / 0 | 0 | -50 / cut | 9 / 9 | 224 / 224 |
| music.win | -32.3 / -32.1 | -19.2 / -18.9 | 0 / 0 | 0.021 / 0.021 | 0 / 0 | 0 | -50 / cut | 33 / 33 | 642 / 642 |
| music.messy | -34 / -34.2 | -23.2 / -23.6 | 0 / 0 | 0.028 / 0.026 | 0 / 0 | 0 | -47 / -59 | 15 / 15 | 315 / 315 |
| music.legend | -31 / -31 | -22.7 / -22.6 | 0 / 0 | 0.026 / 0.025 | 0 / 0 | 0 | -48 / cut | 19 / 19 | 316 / 316 |
| music.night | -33.9 / -33.4 | -22.7 / -22.8 | 0 / 0 | 0.02 / 0.02 | 0 / 0 | 0 | -52 / cut | 17 / 17 | 280 / 280 |
| music.beach | -33.5 / -34 | -21.6 / -21.7 | 0 / 0 | 0.015 / 0.016 | 0 / 0 | 0 | -54 / cut | 18 / 18 | 432 / 432 |
| music.volcano | -32.3 / -32.4 | -19.7 / -19.2 | 0 / 0 | 0.01 / 0.009 | 0 / 0 | 0.00001 | -52 / cut | 18 / 18 | 352 / 352 |
| music.room | -34.2 / -34.4 | -21.4 / -21.7 | 0 / 0 | 0.003 / 0.003 | 0 / 0 | 0 | -49 / cut | 17 / 17 | 240 / 240 |
| music.late | -36.2 / -36.6 | -25.5 / -25.4 | 0 / 0 | 0.002 / 0.002 | 0 / 0 | 0.00001 | -51 / cut | 16 / 16 | 240 / 240 |
| music.onsets | -34.5 / -34.1 | -24.1 / -24.2 | 0 / 0 | 0.002 / 0.003 | 0 / 0 | 0.00001 | -50 / -60 | 21 / 21 | 284 / 284 |
| music.tension | -32.8 / -32.6 | -21.3 / -20.9 | 0 / 0 | 0.025 / 0.027 | 0 / 0 | 0.00003 | -47 / cut | 22 / 22 | 464 / 464 |
| coda.win | -24.8 / -25.3 | -18 / -18.8 | 0 / 0 | 0.01 / 0.015 | 0 / 0 | 0 | -53 / cut | 25 / 25 | 135 / 135 |
| coda.loss | -27.1 / -26.1 | -20 / -20.2 | 0 / 0 | 0.005 / 0.006 | 0 / 0 | -0.00001 | -50 / cut | 18 / 18 | 80 / 80 |
| coda.shakeGood | -29.4 / -29.6 | -21.2 / -21.5 | 0 / 0 | 0.008 / 0.008 | 0 / 0 | 0 | -53 / -60 | 18 / 18 | 44 / 44 |
| coda.shakeKind | -30.4 / -30.5 | -22.5 / -21.4 | 0 / 0 | 0.006 / 0.007 | 0 / 0 | 0 | -48 / -60 | 17 / 17 | 40 / 40 |
| coda.challengeRight | -28.3 / -29.1 | -21.4 / -20.6 | 0 / 0 | 0.006 / 0.006 | 0 / 0 | 0 | -51 / -59 | 18 / 18 | 44 / 44 |
| coda.challengeWrong | -30.2 / -30.3 | -22.2 / -22.2 | 0 / 0 | 0.005 / 0.005 | 0 / 0 | 0 | -54 / cut | 18 / 18 | 44 / 44 |
| music.dance | -24.4 / -24.6 | -9.9 / -9.6 | 0 / 0 | 0.067 / 0.07 | 2 / 2 | -0.00002 | -46 / -60 | 17 / 17 | 317 / 317 |
| title.intro | -17.2 / -17.4 | -5.7 / -5.2 | 0 / 0 | 0.156 / 0.078 | 0 / 0 | -0.00024 | -27 / -59 | 52 / 12 | 803 / 322 |
| title.fanfare | -17.1 / -17.1 | -8 / -7.9 | 0 / 0 | 0.137 / 0.066 | 2 / 0 | 0 | -30 / -60 | 46 / 46 | 492 / 492 |
| title.thud | (not rendered by the offline hook) | | | | | | | | |
| title.lightsUp | -32.8 / -32.8 | -15.2 / -14.8 | 0 / 0 | 0.045 / 0.027 | 0 / 0 | -0.00001 | -32 / -58 | 5 / 5 | 58 / 58 |
| title.whoosh | -48.8 / -48.5 | -33.1 / -34.6 | 0 / 0 | 0.006 / 0.005 | 0 / 0 | 0 | -43 / -60 | 1 / 1 | 16 / 16 |
| title.sparkle | -40.6 / -40.1 | -29.5 / -29.4 | 0 / 0 | 0.015 / 0.015 | 1 / 1 | 0 | -29 / -60 | 8 / 8 | 53 / 53 |
| title.chime | -35.2 / -35.1 | -24.9 / -24.5 | 0 / 0 | 0.006 / 0.007 | 0 / 0 | 0 | -29 / -60 | 4 / 4 | 26 / 26 |
| title.crowd | -30.7 / -30.5 | -21.4 / -21.5 | 0 / 0 | 0.018 / 0.02 | 0 / 0 | 0 | -40 / -60 | 9 / 9 | 60 / 60 |
| title.confetti | (not rendered by the offline hook) | | | | | | | | |
| title.boing | (not rendered by the offline hook) | | | | | | | | |
| title.pat | (not rendered by the offline hook) | | | | | | | | |
| title.hi | (not rendered by the offline hook) | | | | | | | | |
| title.clack | (not rendered by the offline hook) | | | | | | | | |
| title.twinkle | -34.3 / -35.1 | -24.6 / -24.3 | 0 / 0 | 0.029 / 0.03 | 1 / 1 | 0 | -30 / -59 | 8 / 8 | 53 / 53 |
| title.tick | (not rendered by the offline hook) | | | | | | | | |
| title.liftoff | -66 / -66 | -45.8 / -45.2 | 0 / 0 | 0.001 / 0.001 | 0 / 0 | 0 | -45 / -56 | 2 / 2 | 16 / 16 |
| scene.win | -14.8 / -14.6 | -4.7 / -3.9 | 0 / 0 | 0.144 / 0.102 | 0 / 0 | -0.00023 | -50 / cut | 87 / 50 | 1240 / 700 |
| scene.challenge | -18.2 / -17.9 | -6.7 / -6.4 | 0 / 0 | 0.342 / 0.283 | 0 / 0 | -0.00005 | -55 / cut | 29 / 27 | 155 / 155 |
| scene.title | -17.1 / -17.4 | -6.2 / -5.2 | 0 / 0 | 0.141 / 0.076 | 0 / 1 | -0.0002 | -27 / cut | 62 / 27 | 941 / 460 |
| birthday.song | -19.4 / -19.2 | -14.2 / -11.2 | 0 / 0 | 0.016 / 0.044 | 28 / 0 | 0 | -58 / -60 | 26 / 1 | 1192 / 2 |
