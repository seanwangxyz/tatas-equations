# Handoff from `crowd`: blocky crowd that reacts (and is still otherwise)

Built in my files only: new `js/three/crowd.js`, new `js/crowd-sfx.js`, and `js/three/stadium.js`,
`js/three/arenas/common.js`, `beach.js`, `volcano.js`.

## What exists now

- Every venue crowd (stadium, night, beach, volcano) is made of block people: cube head with dot eyes, a
  tapered "jumper" body, two short box arms, a hair cap (several hair tones, some bald), mixed shirts and
  skin tones. Beach: t-shirts (bare arms) and sun hats. Volcano: block monsters (lighter cube head,
  big cartoon eyes, horns on about half). All instanced: 4 draw calls per crowd (+1 per extra such as hats,
  horns, monster faces). Low quality tier: a third fewer people, no arms mesh at all.
- `T3.crowd(kind, opts)` is installed by `crowd.js` itself (no `table.js` change needed); it kicks the
  render loop through `T3.kick()`. Returns true if a reaction started. Kinds:
  `'clap'` (a small section, `opts.at` 0..1 along the stands), `'ooh'`, `'gasp'`, `'cheer'`
  (`opts.wave: true` adds a wave), `'aw'` (`'aww'` accepted). 1.3 to 2.4 s each.
- Idle = nothing moves. When the last reaction ends every instance matrix is copied back from the stored
  rest pose and `step()` returns false, so the table stops rendering.
- `T3.fx('wave')` still works (now people stand up with arms up as it passes). It still returns false on
  the low tier, as before.
- `js/crowd-sfx.js` (classic script): `CrowdSfx.play(kind)` (soft synthesised clap/ooh/gasp/cheer/aw, at most
  one about every 0.95 s, honours `S.set.mute` and `S.set.sfx`) and the global helper
  `crowdReact(kind, opts)`: does `T3.crowd` (when `T3.active()`) plus `CrowdSfx.play`, and does nothing when
  `S.set.crowd === false`.

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

- Not run on a real iPad. Desktop Chrome: a full-crowd cheer (1190 people) costs about 1 ms of JS per frame
  for its 2.4 s; idle costs nothing (no frames). Low tier halves the work (fewer people, no arms).
- Quality changes after the venue is built do not rebuild the crowd: if auto-quality steps down to low
  mid-game, arms are hidden at the next reaction, but the crowd is not thinned until the next table build.
