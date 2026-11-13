# Handoff: the human avatars' acting and finish (agent `avatars`)

Files (all mine): `js/three/player.js`, new `js/three/poses.js` (the acting vocabulary), `js/three/creatures/kid.js`
(two small finish touches), this note. `grownup.js` unchanged. Nothing else touched. `node tests/engine.test.js`: 948 passed.
Public API unchanged (T3.playerMove / mateMove / playerMood / mateMood / playerCelebrate / playerScript / seats / portraits);
MATCHDAY blocks untouched and checked (walk-out, toss, trophy lift).

## 1. Held poses at the seat (stances), chosen by the game state

player.js reads `G` (read-only) every frame and picks a stance for each person; a change is ONE eased move (0.75 s,
smootherstep, exact at the end) and then the pose is held perfectly still. Already visible through the existing game flow,
no wiring needed:

| Game state | Stance | What you see (from behind) |
|---|---|---|
| his go (`move`, his turn) or his Goal to set | `study` | leans in over the rail, both hands ON the rail (found by a ray to the table outline, so it works at any seat), elbows out, head down to the cubes |
| anyone else's go, a creature writing / thinking, a challenge | `wait` | chin on his right fist, left hand on his hip, head tipped |
| after `playerMood('cheer')` (great shake) until the phase changes | `proud` | hands on hips, chin up, big grin |
| the Goal replay is playing (`T3.replayActive()`) | `look` | hands on the rail, head up to the big board |
| otherwise (roll, shake over) | `rest` | standing easy |

Head and eyes go to what matters: a cube someone else is carrying (follows it while it moves), the creature's head (or the
other person's) on their go, the cube he selected / the Resources on his go. Changes under 0.06 rad are ignored, so a
creature that sways never makes him move. Moods play on top (the stance fades under them and comes back after).
The builder's existing `playerMood('think')` keeps working (hand on head, held).
Seats: kid (bottom), Tata at the left seat (Team-up / 3 players) and Tata across the table (2 Players / online) all use
it; whose turn it is follows `G.team.cur` in Team-up.

**Stillness:** the idle blink timer is gone (owner's rule). Measured with the creature removed: 0 renders in 3 s while he
holds `study`. After every gesture / trip the root, arms and head were identical 1 s apart.

## 2. Walking and handling polish

- **Turning on the spot** before he sets off at an angle (e.g. from facing the table to running along it): a short turn
  segment with two little steps (0.2-0.3 s). Also before the walk back. Adds ~0.25 s to a move (cube down at 1.6-1.8 s
  for the kid in 'ai', was 1.3-1.55).
- **Gait:** the stride now grows with speed (walk = short steps, run = long ones with a little flight), so the feet keep
  pace with the ground instead of skating; the hip swing grows with speed too. **Tata's gait:** longer, calmer steps, more
  upright, less bounce, a smaller arm swing.
- **Hands:** a finger / thumb curl channel (`curl(A, i, c, w, thumb)` in poses): real fists (chin on fist, fist pump),
  a grip, a thumbs-up. Applied after the shared ArmRig solve (common.js untouched).
- **Contact shadow** under each person (a soft ellipse on the pitch, on the felt when he is up on the table, on the
  podium in the trophy lift), smaller and lighter as he jumps. One draw call each.
- The carried move itself (reach, crouch, kneel on the table, hand-to-slot) is unchanged: verified exact.

## 3. Celebrations and feelings

`T3.playerCelebrations()` now returns 8: `jump`, `spin`, `robot`, `slide`, plus new `plane`, `heel`, `brain`, `number`.

- **Knee Slide** (`slide`, existing id) now really slides: he turns, runs round the near corner onto the pitch beside the
  table (right side; left if Tata stands at the left seat or the side is ruled out), drops to his knees and glides along
  the side, leans back with arms flung up (shout -> grin), gets up, walks back to his seat. ~4.1 s + walk back.
- **Aeroplane** (`plane`, new): runs out the same way, then a gentle loop with arms out like wings, banking into the curve,
  ends with both arms up in a V, walks back.
- Both travel only when the spot is on screen at head height, nothing is in the way, and motion is not reduced
  (`A11y.calm()` or prefers-reduced-motion): otherwise the in-place version plays (a pose change instead of travel).
  On tall phones the side is off screen, so they play in place.
- **Heel Click** (`heel`): crouch, jump, heels clicked out to one side, land, arms up in a V.
- **Big Brain** (`brain`): two fingers to the temple with a little tap ("calculating..."), then he points at the table.
- **That's Me** (`number`): fists to his chest, then arms open wide and low, chin up, a turn that shows name and number.
- **High five with Tata:** whenever the kid celebrates and Tata stands at the left seat (Team-up, 3 players), Tata waits
  for the celebration (and his own cheer) to finish, walks over, they high-five once, he walks back. Automatic.
- **After a loss** (`aw`, reworked, used by game.js at a lost match): a small "ah well" (palms up, a tilt of the head), a
  determined nod with a fist at his side, then two claps toward the opponent. No slump anywhere.
- **Tata as proud dad:** `mateMood('clap')` on Tata plays `proudClap` (three warm claps and a thumbs-up);
  `mateMood('aw')` plays `chinUp` (a calm nod and a thumbs-up). He never travels for these, never upstages the kid.
- All original moves (generic football joy); none copies a real player's signature celebration.

## 4. Hook lines for the lead (optional; everything above already shows through existing calls)

All guarded; unknown names are ignored by older builds.

1. **js/kit.js** — make the new celebrations pickable. After the line
   `{ id: 'slide', name: 'Knee Slide', icon: '⚡', how: 'Slide on your knees, arms up', beat: 3 }` add a comma and:
   ```js
   { id: 'plane', name: 'Aeroplane', icon: '✈️', how: 'Run out with your arms out like wings' },
   { id: 'heel', name: 'Heel Click', icon: '👟', how: 'Jump and click your heels together' },
   { id: 'brain', name: 'Big Brain', icon: '🧠', how: 'Fingers to your temple, then point at the table', lvl: 3 },
   { id: 'number', name: "That's Me", icon: '🔟', how: 'Show off the name and number on your back', beat: 2 }
   ```
   (unlock rules are a suggestion; `celebOpen` already understands `lvl` and `beat`.)
2. **js/game.js, challenge result** — a fist pump when his challenge is right. In the line starting
   `if (won) { S.stats.challengeWins++;` add right after the opening brace: `playerMood('yes'); `
3. **js/game.js `setGoal`** — pleased with his Goal. After the line starting
   `if (!isAI(G.setter) && G.setter === 0 && G.mode !== 'tutorial') { S.stats.goalsSet++;` add:
   `if (G.setter === 0 && !isAI(0)) setTimeout(function () { if (G && G.phase === 'move') playerMood('proud'); }, 900);`
   (held until the next mood or `playerMood(null)`, 60 s at most; his own go then shows the study stance under it.)
4. **js/game.js `endMatch` ('ai' branch)** — the sporting "good game" to the creature after a WIN too (a loss already ends
   with applause inside `aw`). After `playerCelebrate();` in the `if (won) {...}` line add:
   `setTimeout(function () { if (G && G.phase === 'over') playerMood('gg'); }, 4600);`
5. **Trophy lift: Tata's arm round the kid** — not done (matchday.js is not mine; Tata is not on the podium). A later
   round could script Tata to the "2" block with `T3.playerScript('mate', {...})`.
6. **Handshake with the creature** — needs a creature hand to meet (creatures.js is another helper's). Ships instead:
   applause toward the creature after a loss (`aw`) and `gg` (nod, claps, raised open hand). If creatures.js later
   offers e.g. `T3.creatureMood('shake')`, a walk to the far corner can be added in player.js `celebTrip`.

New mood names (T3.playerMood / T3.mateMood): `yes`, `proud`, `gg`, `five`, `proudClap`, `chinUp`; celebrations
(T3.playerCelebrate / kit list): `plane`, `heel`, `brain`, `number`.

## 5. Finish on the figures (kid.js)

- Hair: a soft sheen band round the crown (per-vertex shading; reads from behind). Shape and face unchanged.
- Socks: a shin pad under each sock (a flat-topped rise at the front of the shin).
- Contact shadows and finger/thumb curl (player.js, above).
- Not done this round: extra cloth-fold shading in the shirt texture, joint changes (the existing ball joints stayed clean
  in every pose looked at). Armband / long sleeves / gloves ride on the arm segments, so they follow every new pose.

## 6. Performance

Per person per frame: one stance function, one ray to the table outline (study / look only), one head-target angle; a
small weights object only while a stance cross-fades. +1 draw call per person (the shadow). At rest nothing is dirtied.

## 7. Verified / not verified

Verified in my own headless Chrome (1280x800, SwiftShader; canvas pictures looked at):
- study / wait stances from behind, side and the seat camera (the head never covers a cube; hands on the rail), proud;
- knee slide and aeroplane strips from the seat camera (visible beside the table, back home, then still);
- heel, brain, number, aw close up; the high five in Team-up (Tata walks over and back);
- Tata's proud applause across the table (2 Players);
- carried moves to Required / Permitted / Forbidden: kid in 'ai', kid and Tata in Team-up, Tata from the far seat in
  'pvp': cube exactly in its slot (error 0.0000), done() fired, still afterwards;
- Matchday: walk-out (scripted walk), coin toss, trophy lift (lift pose on the podium, Continue -> back at his seat);
- `node tests/engine.test.js` 948 passed.
Not verified: real devices / 60 fps feel; tall phones and 1024x768 for the travelling celebrations (they fall back to in
place when the side is off screen, by design); online; the 'p3' high five (same path as Team-up); reduced-motion versions
were exercised (this machine has reduced motion on) but not looked at closely.
