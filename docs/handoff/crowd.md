# Handoff from `crowd`: toy-figure crowd that reacts (and is still otherwise)

Built in my files only: `js/three/crowd.js`, `js/crowd-sfx.js`, and `js/three/stadium.js`,
`js/three/arenas/common.js`, `beach.js`, `volcano.js`. Second pass (the figure redesign) touched
`crowd.js`, `stadium.js`, `beach.js`, `volcano.js`, `common.js` (one comment) and this note only.

## What exists now

- **The figure** (our own design, between a building-toy figure and a voxel character, neither): a big
  bevelled cube head with a small nose bump, ears and a printed face; a short neck; a straight bevelled
  torso with a printed shirt (front, and back for stripes/numbers); square arms with a shirt-coloured cuff
  and a mitten hand (a block with a thumb nub, no claw); seated legs (hips, thighs, shins, shoes) on a little
  seat with a backrest (team colours in the stadium, wood at the beach, stone at the volcano). Kids are
  smaller with bigger heads and sit higher on the seat.
- **Variety**: 20 people faces (dot eyes, happy, wink, wow, grin, shout, content, freckles, round/square
  glasses, sunglasses, moustache, beard, beard + glasses, face paint stripes, half-face paint, blush, eye
  patch...), 25 shirt prints (plain, hoops, stripes, numbers 1/4/7/9/10/23, sash, halves, star, polo collar,
  heart, GO!, 1+2, soccer ball, hoodie, suit and tie, hi-vis, overalls, leather jacket, life vest, flowers),
  14 head pieces (short, bob, long, pigtails, curls, bun, spiky, mohawk, bald, cap, cap backwards, beanie,
  headphones, sun hat), held things (team scarf held between the hands, flag, foam finger), sleeves or bare
  arms, shorts at the beach. 8 skin tones, 10 hair colours plus greys and a few dyed. About 6.5% are
  characters: astronaut, chef, knight, skeleton costume, robot, superhero with a cape, wolf/bear/cat
  mascots, wizard, firefighter, police, builder. Volcano: the same figure as monsters (10 body colours,
  7 monster faces with one to four eyes, fangs, tongues; horns, one horn, antennae, fins, spikes, some in
  caps and beanies). `wardrobeVariety()` (exported) counts it: 20 x 25 x 14 x 4 x 2 = **56,000 part
  combinations for people** before colours, plus 13 characters, and 2,268 for monsters before their colours.
- **How it is drawn** (iPad budget): one InstancedMesh per part type (seats, legs, torsos, heads, arms, each
  common head piece), plus two pooled meshes for rare parts (held things + capes; head pieces worn by fewer
  than 2%): each instance shows only its own variant, the others collapse to a point in the vertex shader.
  **All parts share one material (one shader program) and one 1024x512 atlas** (64 px cells, 79 of 128
  used). Per-instance attributes carry three colours and an atlas cell; the atlas packs four coverage layers
  (colour B, colour C, ink, white) so one face/print cell works with any skin, hair, team or paint colour.
  Faces never seen (undersides, faces against the head) are not built.
- **Quality tiers** (chosen when the venue is built): high = everything; medium = no shins/shoes, cuffs or
  thumbs; low = a third fewer people, plain boxes (no bevels), no ears, nose, neck or seat backs, one-block
  sleeves.
- `T3.crowd(kind, opts)` is installed by `crowd.js` itself (no `table.js` change needed); it kicks the
  render loop through `T3.kick()`. Returns true if a reaction started. Kinds:
  `'clap'` (a small section, `opts.at` 0..1 along the stands; hands meet in front), `'ooh'` (lean in, some
  raise their hands up by their heads), `'gasp'` (lean back, some put their hands to their cheeks),
  `'cheer'` (hop, arms up; scarves go overhead, flags and foam fingers up; `opts.wave: true` adds a wave),
  `'aw'` (`'aww'` accepted: slump, head down and tilted, hands to the lap). 1.3 to 2.4 s each.
- Idle = nothing moves. The rest pose has fixed per-person variety (head turns, hands on the lap, a flag held
  up), but nothing loops. When the last reaction ends every instance matrix is copied back from the stored
  rest pose and `step()` returns false.
- `T3.fx('wave')` still works (people pop up with arms up as it passes). It still returns false on the low
  tier, as before.
- `makeBlockCrowd(group, pts, o)`: pts are just `{ x, y, z, ry, seatRy?, key, team }`; the crowd dresses
  everyone itself. `o.style`: `'fans'` (stadium, night), `'beach'`, `'monsters'`; `o.teams`, `o.seatCol`,
  `o.dim` (night), `o.seed`, `o.redress(p, i, asCharacter)` (for checks). The returned crowd has `stats()`
  (people, draw calls, triangles sent and drawn, parts).
- `js/crowd-sfx.js` (classic script): `CrowdSfx.play(kind)` (soft synthesised clap/ooh/gasp/cheer/aw, at most
  one about every 0.95 s, honours `S.set.mute` and `S.set.sfx`) and the global helper
  `crowdReact(kind, opts)`: does `T3.crowd` (when `T3.active()`) plus `CrowdSfx.play`, and does nothing when
  `S.set.crowd === false`. (Unchanged in the second pass.)

### Numbers (measured in desktop Chrome; crowd only)

| Venue / tier | People | Draw calls | Triangles sent (drawn) | Cheer + wave, JS per frame |
|---|---|---|---|---|
| Stadium high, before | 1190 | 4 | 110,808 | about 0.5 ms |
| Stadium high, now | 1185 | 18 | 492,932 (438,738) | 0.5 to 1.7 ms average, median 0.5 to 1.4 ms |
| Stadium medium, now | 1185 | 18 | 407,612 (353,418) | about the same |
| Stadium low, before | 794 | 3 | 54,912 | about 0.3 ms |
| Stadium low, now | 790 | 18 | 167,864 (135,346) | about 0.3 ms |
| Volcano high, before / now | 480 / 493 | 5 / 14 | 47,928 / 143,674 | 0.3 / 0.25 ms |
| Beach high, before / now | 51 / 52 | 5 / 13 | 6,176 / 21,984 | under 0.1 ms |

The JS timing on this machine is noisy (other tabs share the browser; single frames spike to 10-20 ms at
random, also with no allocation in the loop), so read the medians. The instance matrix upload during a
reaction is about 0.5 MB per frame for the full stadium (about 7,400 matrices) (all the dynamic meshes are re-uploaded); nothing is
uploaded at rest.

## 1. `index.html`: load the sound file (required for `crowdReact`)

After

```html
<script src="js/sound.js"></script>
```

add

```html
<script src="js/crowd-sfx.js"></script>
```

## 2. `js/screens.js`: Settings toggle row (optional but asked for)

In the toggle list (line ~189) that starts
`[['gloat', 'Creatures gloat when they win', true], ...`, append one entry before the closing `]`:

```js
, ['crowd', 'Crowd reactions (claps, cheers, oohs)', true]
```

so the end reads `... ['shots', 'Camera close-ups (challenges, wins, the Goal)', true], ['crowd', 'Crowd reactions (claps, cheers, oohs)', true]].map(`.
Default on; `crowdReact` treats only `false` as off, so no `config.js` default is needed.

## 3. `js/game.js`: where to call `crowdReact` (proposal)

Note: `game.js` already has `function crowdSay(kind) { if (Snd.crowdReact) Snd.crowdReact(kind); }` which plays
**sound.js's own** crowd sounds. If you switch those calls to `crowdReact`, the sound comes from
`crowd-sfx.js` instead (softer). Do not call both for the same event, or there will be two crowd sounds.
Simplest: make `crowdSay` the bridge, then edit the call sites below:

```js
function crowdSay(kind, opts) { if (typeof crowdReact === 'function') crowdReact(kind, opts); else if (Snd.crowdReact) Snd.crowdReact(kind); }
```

(`crowdReact` accepts `'aww'` as well as `'aw'`.)

| Event | Anchor line in `game.js` | Change |
|---|---|---|
| A cube is moved to a zone (any player) | in `placeCube`: `G.turn = nextP(who); // play passes to the left` | add after it: `crowdSay(G.clever ? 'ooh' : 'clap'); G.clever = false;` |
| Clever move (AI) | in `aiTurn`: `var c = G.cubes[mv.id], yum = mv.liked ? tasteLine(o, 'tasteMove', 0.4) : '';` | add after it: `G.clever = !!mv.liked;` |
| Challenge called | in `challenge`: `... board(kind === 'now' ? 'NOW!' : 'IMPOSSIBLE!'); crowdSay('ooh');` | change `crowdSay('ooh')` to `crowdSay('gasp')` |
| Goal set | in `setGoal`: `Snd.thunk(); Snd.chime(); board('GOAL' + String.fromCharCode(10) + Eq.fmt(val)); shot('goal');` | add after it: `crowdSay('cheer');` |
| Correct solution / good shake | in `endShake`: `if (good) { Snd.chime(); FX.confetti(70); fx3('confetti'); fx3('flash'); crowdSay('cheer'); ...` | keep (now cheers in 3D too) |
| Shake lost | same line: `} else { playerMood('clap'); Snd.boop(); crowdSay('aww'); ...` | keep (gentle slump) |
| Match won | in `endMatch`: `... playerMood('cheer'); fx3('confetti'); fx3('wave'); fx3('flash'); board('GOOOAL!');` | replace `fx3('wave')` with `crowdSay('cheer', { wave: true })` (the `Snd.crowd` roar at 500 ms stays) |

Honest caveat on "clever move": there is no existing rating of a *human* move. `mv.liked` is the AI's
taste flag, not strength. If you want human moves rated, the cheapest real signal I found is the hint's
own `aiChooseMove(OPPONENTS[4])`: compute it before the human's move in `doMove` and say `'ooh'` if the
human picked the same cube and zone. It runs the solver synchronously (like the Hint button), so I did not
want to put it on every move without you deciding. Same calls could go in `js/team.js` line ~185 and
`js/cup.js` line ~188 (they use `Snd.crowdReact` directly today).

## 4. Optional: share the audio context (`js/sound.js`)

`crowd-sfx.js` uses `Snd.context()` if it exists, else makes its own AudioContext (unlocked on the first
tap). To share one context, add to Snd's public API object: `context: function () { return ctx; },`

## Not done / not verified

- Not run on a real iPad. The redesign sends about 4.5x the triangles of the old block people on the high
  tier (493k vs 111k for the full stadium) and 18 instanced draw calls instead of 4, all with one shader and
  one texture. Apple GPUs should take that easily, and the table only renders while something moves, but it
  is the first thing to check on the device. Cheap levers if it is too much: drop shins/shoes on high too
  (about -60k), lower the people count per row, or treat medium like low.
- Verified in desktop Chrome (headless-style checks in a background tab): all four venues build at high,
  medium and low; every reaction (each alone, all five overlapping, cheer + wave, `T3.fx('wave')`) ends with
  every instance matrix exactly equal to the rest pose (max difference 0) and `step()` returning false.
  Looked at close-ups (a separate preview renderer with a close camera) at rest and mid-cheer, gasp and aw,
  stadium/night/beach/volcano, high and low.
- Seen while testing, not from this change: in a match waiting for the goal, the table keeps rendering every
  frame even when the crowd is idle (about 230 draws per frame). The committed HEAD build does the same in the
  same state, so it comes from something else that marks the table dirty (creature/player hooks?), not the crowd.
- Quality changes after the venue is built do not rebuild the crowd (it is built for the tier at table build
  time; the measured tier is remembered on the device, so the next start builds for it).
- The orbit camera's zoom limit (0.7x) keeps the crowd fairly far away in the game itself; the 64 px atlas
  cells are sized for that.
