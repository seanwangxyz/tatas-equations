# The creatures' acting (agent `acting`, free creative round)

Files (mine only): new `js/three/acting.js`; `js/three/creatures.js`, `js/three/creatures/gestures.js`,
`js/three/creatures/classic.js`, `js/three/creatures/gltfpack.js`, `js/three/creatures/monsterrig.js`; this note.
Nothing in game.js / config.js / table.js / css was touched. `node tests/engine.test.js`: 948 passed.

## 1. The owner's rules, now enforced in code

- **At rest nothing moves.** Removed: the breathing loop, the blink timer, the idle flairs (every 25-45 s), and the
  clock-driven wiggles in classic.js (fox tail sway, wizard star spin and beard sway, Pip's antenna sway). A glTF idle
  clip only plays if a manifest slot asks for it (`"idleLoop": true`; none does).
- **The render loop idles.** Each frame the pose is rebuilt and compared with what was last drawn (`SIGKEYS` + root +
  arm targets). Only a real change calls `ctx.dirty()`. A settled creature goes `quiet`: it then only checks, cheaply,
  whether something happened (a cube moving, a reaction, a line, the other creature, the camera moving), with one
  silent re-check every 1.5 s as a safety net. A held pose (e.g. thinking) also draws nothing once it has settled.
- **Every reaction is one calm move into a held pose**, then an ease back to rest. Rewritten so nothing loops:
  `tantrum` is now a good loser's huff (arms folded, chin up, looks away), `cry` is one sniff and one tear per eye,
  `sad` a sigh and a droop (no head shaking), `nervous` one glance + one gulp + one sweat bead, `laugh` one lift,
  `clap` two claps then hands held together, `wave` one slow swing, dances are one celebration move into a held victory
  pose. Talking: the mouth follows the line (allowed) and stops when it ends; the head tilts in once and holds (the
  sine head-nodding is gone). Monsters (no mouth): the near hand comes up palm-open and stays while the line lasts
  (was a waving loop) and the head dips a touch on syllables. Moods no longer cut a line short.
- **Blinks only as part of something**: a big change of where it looks, the end of an entrance, or a reaction that
  asks for one (e.g. Ollie's slow wise blink).
- **Calm**: `A11y.calm()` or `prefers-reduced-motion` -> no hops, nods, slides or sparkles, slower ease-in (a plain
  pose change); entrances become "it is there and raises a hand", exits "raises a hand and is gone"; no aha beat.
- **Quality**: star sparkles are thinned on medium (70%) and low (40%). Nothing else costs per quality level.

## 2. How the acting works (`js/three/acting.js`)

A reaction is DATA (a spec) played by one generic `perform()`: a face preset (curious, thinking, delighted,
impressed, worried, sheepish, proud, sleepy, sad, determined, surprised, smug, grumpy, happy, content), held body
offsets, arm poses from a small library built from each creature's own head / shoulder measurements (`chin`, `cheek`,
`mouth`, `temple`, `head`, `nap`, `beard`, `hat`, `nose`, `fold`, `clasp`, `heart`, `belly`, `hip`, `behind`, `up`,
`fist`, `finger`, `thumb`, `point`, `pointUp`, `out`, `shrug`, `wings`, `present`, `face`, `tuck`, `rim`, `wave`,
`clap`), single beats (nod, hop, jolt, tilt, bow, sniff, sigh, gulp, lift, ears, glow), where to look, and one-off
extras (robot antenna light, chameleon colour, chameleon split eyes, one sweat bead / tear / smoke puff, sparkles).
Each of the 15 opponents (+ Pip) overrides only what makes it itself; `DEFAULTS` fill the rest. `whoOf(kind, pack)`
maps kind + pack to the opponent (the monsters pack reuses kind names: sloth = Grub, penguin = Splosh, fox = Blaze,
owl = Hex, wizard = Messy).

Faces/eyes: the eyes jump to what matters (fast saccade), the head follows at the creature's own speed, then both are
still. Looks at 'kid' / 'table' / 'goal' / 'down' are aimed partly toward the seat camera so the face stays readable
from the high camera. The puglins never tip their head up past +0.2 (`pitchMin`): they already carry it lifted, and
looking up at the high camera turned their face away (that was also true before this round, whenever they looked
at the camera).

## 3. What each creature gained

Every creature: a resting posture of its own (lean / chin / head tilt), a thinking pose held while its turn is worked
out, an "aha" beat before it reaches, and its own version of: good move by the kid (`nod`, `gasp`), challenging
(`challenge`), being challenged (`nervous`), winning a shake (`happy`, `gloat`), losing a shake (`sad`, `cry`),
losing the match (`tantrum` / `cry` / `sad`), winning the match (`dance`, 3 variants), a huge Goal (`impressed`).

| # | Creature | Thinks | Signature touches |
|---|---|---|---|
| 1 | Snoozy (sloth) | chin on hand, eyes half shut, head tilted | slow content nod, hands behind head to gloat, falls asleep on folded arms when he loses ("Zzz… you got me") |
| 2 | Penny (penguin) | head tipped right over the puzzle, flippers out | two claps for a good move, "flippers up" challenge, belly-slide lean to celebrate |
| 3 | Rusty (fox) | sly squint at the cubes, chin on hand, one ear turned | ear flick + thumbs up, nose tap, sheepish head-scratch with flat ears ("Outfoxed!"), knee slide |
| 4 | Ollie (owl) | head turned aside, wing at chest | slow wise blink and nod, "hoo" aha with a raised wingtip, feathers puff when nervous |
| 5 | Mondo (wizard) | strokes his beard, eyes to the stars | tips his hat, a few stars on the aha / challenge / celebration, tugs his hat brim when nervous |
| 6 | Grub (puglin) | arms folded, frown | grudging nod with folded arms, "hmph" aha nod, huff and look away when he loses; new entrance: stomps in, folds his arms, one "hmph" nod |
| 7 | Splosh (puglin) | peers closely, hands together ("check twice") | hands to cheeks, hands to mouth when nervous, tidy little hop |
| 8 | Blaze (imp) | crouched forward, fists ready | thumbs up, fist-pump aha, quick point challenge |
| 9 | Hex (imp) | fingertips together, sly tilt | nose tap, points at the cube on the aha, innocent look-away (hands behind back) when nervous |
| 10 | Messy (imp king) | royal ponder (hand on chin, arm folded) | the decree finger, a royal nod with an offered palm, hands behind back to gloat, a bow when he loses |
| 11 | Bleep (robot) | head tilts, eyes up, the antenna light comes on and stays on | "ding" flash on the aha, two "loading" flashes when nervous, powers down (droops, lids low) when he loses |
| 12 | Flip (bat) | head rolled right over (an upside-down look) | ears perk, wings spread to celebrate |
| 13 | Squiggle (octopus) | one hand at the temple, one at the chin | spare arms curl in when nervous, everything floats up when happy |
| 14 | Nugget (dragon) | eyes closed, hands on belly ("a dragon never rushes") | a single smoke puff from the nostrils on the aha / nod / challenge / celebration |
| 15 | Chroma (chameleon queen) | one eye on the cubes, the other wandering; her colour cools | colour warms gold on the aha and when proud, pales blue when nervous, a gracious nod |

**Two creatures at the table**: when one reacts, the other answers 0.38 s later if it is free: a jealous side-look
(the other one is happy / gloats / dances), a sympathetic nod (sad / cry / nervous / huff), a little cheer (nod / clap
/ impressed / gasp), a glance (challenge). Its own reaction (game.js endShake / endMatch) simply replaces the answer.

**Huge Goal, no hook needed**: creatures.js watches the game state; when the kid sets a Goal, the free creatures look
at it, and a Goal of 50+ or 4+ cubes earns `impressed` (the second creature a beat later).

## 4. API additions (creatures.js)

- New mood names (also in `T3.creatureMoods()`): `impressed`, `proud`, `sheepish`, `curious`, `glance`, `jealous`,
  `sympathy`, `cheer`. All old names work as before.
- `'think'` is now **held** (up to 18 s x the creature's tempo) until the creature moves, reacts or `creatureMood(null)`.
  `T3.creatureMove` right after a think plays the aha beat first (anticipation stretched by at most 0.42 s).
- `T3.creatureLook(what, ms?)` — look at `'kid' | 'goal' | 'table' | 'cam' | 'partner' | 'down' | 'up' | 'sky' | 'side' | 'away'`.
- `T3.creatureQuiet(i?)` — true when that creature has settled and asks for no frames (tests).
- `T3.creatureIdleFlair()` is kept but always returns false.
- `T3.creatureStats(i)` also returns `who, quiet, gm, headPitch, headYaw, open, eyeX, eyeY` (debugging).

## 5. One-line hooks for js/game.js (optional; everything looks right without them)

1. The creature thinks while it picks a **Goal**. In `startGoalPhase`, anchor
   `if (P.ai) { G.busy = true; say('opp', pick(P.ai.think)); renderGame(); setTimeout(aiSetGoal, 1100); }` — insert
   right after `renderGame();`:
   `creatureAt(G.setter, function () { if (T3.creatureMood) T3.creatureMood('think'); });`
2. The creature thinks while it **writes a Solution**. In `aiWrite`, after
   `say('opp', esc(o.name) + ' is writing a Solution…'); renderGame();` add:
   `if (T3.creatureMood) T3.creatureMood('think');`
   and in the same function after `say('opp', chk.ok ? (yum || 'Done!') : 'Hmm…');` add:
   `if (T3.creatureMood) T3.creatureMood(chk.ok ? 'proud' : 'sheepish');`
3. The creature thinks about calling Impossible after the **last cube**. In `lastCubePlayed`, after
   `say('opp', pick(o.think)); renderGame();` (the `if (ais.length)` branch) add:
   `creatureAt(p, function () { if (T3.creatureMood) T3.creatureMood('think'); });`
4. (Three at the table) the kid's good move: in `placeCube`, replace
   `creatureMood(pick(['nod', 'nod', 'gasp']));` with
   `creatureAt(pick(idxs().filter(isAI)), function () { if (T3.creatureMood) T3.creatureMood(pick(['nod', 'nod', 'gasp'])); });`
   (with one creature it behaves as now; the other creature then answers with a little cheer by itself).

Do not add a hook for the big Goal (section 3): creatures.js already does it.

## 6. Performance

- At rest: **0 frames** requested by the creatures (before: an ambient redraw ~11 per second for breathing and
  blinking). Measured: bone/mesh world matrices identical 1 s apart after each of 15 reactions; `creatureQuiet()` true;
  0 frames from the creature during a held think. (Other modules can still ask for frames: in a rainy venue the scene
  still drew ~15/s with the creature quiet and the kid hidden, so that is weather/venue, not the creatures.)
- Per frame while acting: one spec evaluation + a 60-float compare; no allocations in the hot path.

## 7. Verified / not verified

Verified in the browser pane (port 3542, fake clock driving frames, frames rendered and looked at): all 15 creatures
at rest; reaction sheets (start / mid / held, wide camera crop) for Snoozy (think, move with aha, nod, gasp, challenge,
nervous, happy), Penny, Rusty, Ollie, Mondo, Grub, Splosh, Blaze, Messy, Bleep, Chroma, Squiggle (impressed), Nugget
(talk); the quiet check after 15 moods; Three at the table (Rusty + Flip: gloat -> jealous answer, dance -> answer,
both quiet afterwards); calm entrance / exit / reaction; the big-Goal observer; talking (mouth moves, closes at the
end). No console errors.

Not verified: Hex, Flip and Squiggle sheets in full (spot checks only), the tall layout, real devices / 60 fps feel
(timings are from a fake clock), the game.js hooks above (not applied, by the rules). Props/costume touches (item 5 of
the brief) were not done: the existing kit (monster armbands and scarves, Chroma's crown, Mondo's hat) stays as is.
