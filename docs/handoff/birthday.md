# Handoff: the birthday easter egg

Tap the "T" in EQUATIONS on the 3D title 5 times quickly. The creatures sing "Happy Birthday" to Tyson, Tata makes a
heart with his hands, and game cubes rain down and get put together into a message. It plays once, then holds a still picture.

## Files

| File | What |
|---|---|
| `js/three/birthday.js` (new, ES module) | The show. The message block is at the very top |
| `js/birthday-sfx.js` (new) | The creature choir and the waltz accompaniment (Web Audio, on `Snd.context()` / `Snd.bus('music')`) |
| `css/birthday.css` (new) | The overlay: captions, "Tap to skip", "Take a photo" / "Done" |
| `js/three/title.js` | Small additive hooks, all marked `BIRTHDAY`: tap counting on the T, `TataBirthday`, take/give hooks, one guard line in `frame()` and one in `stop()` |

**No `index.html` change is needed.** title.js loads `js/three/birthday.js` with a dynamic `import()` only when the egg fires.
birthday.js then loads `js/birthday-sfx.js` (dynamic import) and adds `<link href="css/birthday.css">` itself.
No other module was touched. **Offline:** the three new files only go into the offline list after
`node tools/build-precache.js` (run it when you publish, as usual). Until then the egg only works online.

If you would rather list them in index.html, these lines are optional (loading still works without them):

```html
<link rel="stylesheet" href="css/birthday.css"><!-- BIRTHDAY -->
<script src="js/birthday-sfx.js"></script><!-- BIRTHDAY -->
```

## How to trigger / replay

- **Kid way:** tap the "T" cube of EQUATIONS (the middle letter) 5 times within 2.5 s. Works on the splash and on the title
  menu. Only taps that reach the scene count, so the menu panel and buttons work as normal. Any tap that misses the T
  starts the count again.
- **Tata way:** `TataBirthday.play()` in the console while the splash or title is showing. `TataBirthday.active()` says
  whether it is playing.
- Without 3D (switched off, no WebGL) nothing happens. title.js only runs when 3D works, and `play()` returns false
  when the 3D title is not showing.

## How to change the words

At the top of `js/three/birthday.js`:

```js
export var BIRTHDAY = {
  name: 'Tyson',                                                 // the name in "Happy birthday, dear ___" (blank: the save's name)
  lines: ['HAPPY BIRTHDAY TYSON', 'ICE CREAM MAN', 'LOVE, TATA']  // the cube message, one line per row
};
```

Allowed characters are A-Z, 0-9 and `, . ! ? ' & -`. Spaces leave gaps. Up to 5 lines. Lowercase becomes uppercase.
You can also override it from the save without editing code:
`S.bday = { name: 'Tyson', lines: ['HAPPY 9TH', 'BIRTHDAY!'] }` then `persist()` (read each time the show starts)
On a phone held upright, long lines are split at spaces so no row has more than 10 cubes
(for example HAPPY / BIRTHDAY / TYSON / ICE CREAM / MAN / LOVE, TATA). On wider screens a row can have up to 22 cubes.

## The show, beat by beat (1280x800; times are seconds from the 5th tap)

| t | What happens |
|---|---|
| 0-3.2 | The menu hides. The camera eases from the title picture to a view behind Tyson. A sparkle and chime. Tyson (his kit, number and name from the save) runs from his title spot to the middle of the pitch and turns to face the stage. The glTF monsters load meanwhile (up to 1.8 s). |
| 2.6-6.6 | **Parade:** two lines of creatures hop in from both sides on little coloured party drums (they are upper-body figures, as at the table). There are 15 opponents plus Pip, with a boing each. They form two curved rows in front of Tyson, Pip in the middle, the back row on taller drums like a choir. **Tata** (yellow/navy grown-up kit) runs in at 4.2 s and takes the gap in the middle of the front row. |
| 9.6 | The crowd claps. |
| 10.2-25.3 | **The song:** "Happy Birthday to You" in C, 3/4, 0.56 s a beat, with a held note on the name. There is a three-voice creature choir (the tune, a big low monster an octave down, a small bright one) over an oom-pah-pah waltz. Big captions: "Happy birthday to you" ×2, "Happy birthday, dear **Tyson**", "Happy birthday to you!". Every creature's mouth opens on each note (vowel shapes: "oo" narrower, "ee" wider). They bob on the downbeat and sway once per bar. On "dear Tyson" they reach their arms toward him, and on the last "you" they raise their arms. Tata dances (knees on the beat, a sway per bar, arms taking turns up). Tyson looks left and right at the singers. |
| 25.5 | "Hooray!" caption, a "hooray" from the choir, a crowd cheer and wave. Every creature cheers once and Tyson claps. |
| 26.9-31.3 | **Silly moves:** three single moves each, in character. Snoozy yawns and stretches. Penny does a belly-slide sway, claps and spins. Rusty spins, waves and hops. Ollie turns his head right round. Mondo throws stars, spins and bows. Bleep flashes his antenna with stiff robot arms (twice). Flip spreads his wings. Squiggle waves both arms. Nugget puffs smoke twice. Chroma spins, waves and bows. Pip hops, spins and cheers. The monsters hop, wave and spin. |
| 27.2-32.9 | **Tata's heart:** he walks forward (a little to Tyson's side, turned slightly toward us) and makes a heart with both hands in front of his chin: wrists together, fingers curled in. He holds it for about 3.5 s while the camera eases round and in to see him past Tyson. A soft pink heart glows above his head (once), and 7 little hearts float up and fade. Tyson claps. |
| 33.1-34.6 | The creatures hop to two groups on the sides, and Tata goes to stand next to Tyson. The camera rises to a higher view. |
| 34.7 | A white 3- or 4-step riser with gold trim rises out of the pitch in front of the stage. |
| 35.6-38.4 | **Cubes rain down:** 38 game cubes (the title's own cube look and his cube skin, with letters in the logo font), staggered, from 15-22 units up. They tumble, bounce once with a squash and a thud, and lie scrambled: some letter-up, some on their sides, number faces showing. |
| 39.6-46 | **Bleep picks them up:** he hops beside a cube, reaches down, lifts it (the cube turns letter-forward in his hands), hops to the riser and tosses it into its place in reading order (H, A, P...). It lands with a clack. He gets quicker each time (3 cubes). Then Pip, Penny and Rusty join, each placing 2 more in parallel. |
| ~46.5-50 | Mondo raises his arms (stars), and the remaining cubes hop onto the riser one after another, 75 ms apart, each in a spinning arc with a tick. |
| ~53 | Message complete: a ripple hop runs along every row with a sparkle sound. Caption "Happy birthday, **Tyson**!". |
| ~54.5 | **Finale:** 5 firework shells over the side stands (night). With Reduce flashing there are none, only confetti. Title confetti, a crowd cheer and wave, every creature cheers or hops, Tyson throws a fist up and Tata waves. The camera settles over 3.2 s on the message, with Tyson and Tata in front and the creatures beside. |
| ~59 | **Still picture** with "Take a photo" and "Done". Once the fireworks and confetti have landed the loop stops and nothing moves. |

The exact end time depends on where the cubes landed (random). It measured 53.1-54.0 s to "message complete" and
about 59-60 s to the buttons.

**Skip / end:** any tap (or Esc / Enter / Space) during the show jumps straight to the final picture: everything in place,
the song stops at once with a short fade, no fireworks. A second tap anywhere, or "Done", ends it. "Take a photo" saves the picture with the
game's own photo frame (`photoCanvas` / `savePhoto` from orbit.js). Leaving the title for another screen ends the show
at once (title.js `stop()` calls it).

**Giving the title back:** the menu screens were only hidden (`body.bday-on`), never re-rendered. The title's own Tyson,
Pip, creatures and loose cubes come back. The camera fit is recomputed, the crowd is put back at rest, the menu music
mood is restored (`Snd.setMood`, if it was on) and the title's resting murmur comes back.

## Rules followed

- Finite: every move is a single move. The song and the dances end. After the finale the render loop stops (0 renders
  measured in 2.5 s after the end).
- Reduce flashing (`A11y.calm()`): no fireworks, only confetti. Nothing else flashes (the heart glow fades in softly).
  The show does not refuse to play under OS reduced motion.
- Audio: one shared context. The song goes to `Snd.bus('music')` (or to `'sfx'` if the music is switched off but effects
  are on; silent when muted). The thuds, boings, pats and cheers use TitleSfx (the `'sfx'` bus), so Mute and both
  sliders apply. The menu music is paused (`Snd.setMood('off')`) during the show and restored after.
- Original designs only: the party drums, riser, heart and fireworks are all drawn in code. The tune is the
  traditional public-domain melody.

## Performance and cleanup (Chrome in the desktop app's pane, 1280x800, medium tier)

- Cast: 16 creatures (5 of them glTF monsters, when the Monsters pack is available; the ones not ready after 1.8 s are
  left out). On **low quality: 8 classic creatures** (Pip, Bleep, Mondo, Penny, Rusty, Nugget, Squiggle, Ollie) and fewer
  firework sparks.
- Shared: one drum geometry, one rim geometry and 8 drum materials for every creature; one atlas texture and one
  material for all 38 cubes; one sprite pool (36) for stars and hearts; one Points object for the fireworks.
- `renderer.info.memory` on the title before / during / after: 226/39 → about 840-950/118-122 → 226/39, the same after
  each of 3 runs (a full show, a skip right away, a show ended mid-way). The very first run in a session keeps
  +5..13 geometries: these are the Monsters pack's own per-model caches (`userData.shared`), the same ones the table uses.
  Scene children, the camera position and the title's HTML are identical before and after. Shader programs +1 (cached).
- Choir rendered offline into the music bus (before the music volume): peak -6.8 dBFS, RMS -19.5 dB, no NaNs.
  With the default music volume (0.35) and the shared limiter, that is about the level of the menu music.

## Test hooks

`TataBirthday.play()`, `TataBirthday.active()`. While playing: `TataBirthdayShow.stats()`, `.skip()`, `.end()`,
`.seek(t)` (fast-forwards the show clock to t seconds without drawing, then draws once), `._x()` (the internal state).
After the show, `TataBirthdayShow.stats().last` gives the memory deltas, renders, cast size and length.

## Verified / not verified

Verified (pane, rAF shimmed, pictures rendered from the title's renderer and looked at):
- The 5-tap trigger, using real pointer events on the T.
- The full strip at 1280x800 (walk, parade, singing, dance, silly moves, heart, flank, riser, rain, Bleep and helpers,
  cascade, ripple, fireworks, final).
- The final picture and the cube phase at 390x844 (6 rows).
- Skip → final → Done, and the title given back exactly as before.
- No leaks over 3 runs.
- `node tests/engine.test.js`: 948 passed.

Not verified:
- Heard sound: the choir was only rendered and measured offline.
- Real iPad / phone frame rate. Around 950 extra geometries while it plays; there is no automatic quality drop
  during the show beyond the 8-creature low tier.
- The overlay's look in a visible window: the pane was hidden, so CSS transitions did not run. Text and layout were
  checked by measuring.
- "Take a photo" actually saving a file. `photoCanvas` was checked; the download itself was not.
- The splash-mode trigger. The first splash tap opens the title, so the 5 taps land on the title. `TataBirthday.play()`
  on the splash is handled (it gives back the splash camera), but it was not tested visually.
