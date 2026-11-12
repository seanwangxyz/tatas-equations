# Two creatures at the table (Three at the table, mode 'ai3')

`js/three/creatures.js` now holds up to two creatures at once. Each one has its own state (pose, reach task,
gesture, talk, blinks, steps), so creature 0 can still be bringing its arm home while creature 1 starts to move.
Nothing changes for one creature: every existing call works as before and talks to creature 0.

## API

| Call | What it does |
|---|---|
| `T3.setCreature(kind, pack)` | **One** creature (unchanged). It is creature 0; a second creature, if any, leaves; creature 0 is in use. `setCreature(null)` clears the table. |
| `T3.setCreatures([{kind, pack}, {kind, pack}])` | Both at once (creature 0 and creature 1). One entry = one creature, `null`/`[]` = none. Creature 0 is in use afterwards. |
| `T3.setCreature2(kind, pack)` | Creature 1 joins (or leaves with `null`); creature 0 is left alone. |
| `T3.creatureUse(i)` | Which creature (0 or 1) the calls below address. No argument: returns the current one. |
| `T3.creatureWith(i, fn)` | Runs `fn()` with creature `i` in use, then puts the previous choice back. Handy for "the other one reacts too". |
| `T3.creatureCount()` | 0, 1 or 2. |

Address the creature in use: `creatureMove`, `creatureMood`, `creatureTalk`, `creatureEnter`, `creatureExit`,
`creatureFocus(i?)`, `creatureVisible(i?)`, `creatureStage(i?)`, `creatureStats(i?)`, `creatureDances`, `creatureFrame`.
`creatureFocus` / `creatureVisible` / `creatureStage` also take an explicit index. `creatureMove(id, zone, done)` binds
to the creature in use **at the moment of the call** (switching afterwards does not move the task).
The close-ups in `js/three/shots.js` frame the creature in use (they call `creatureFocus()` through table.js), so call
`creatureUse(k)` before `shot(...)`.

## Seats (what I chose)

- **One creature:** unchanged, far side, middle.
- **Two creatures:** creature 0 stays (almost) in the middle of the far side; creature 1 stands at the **far corner on
  the side away from the stadium scoreboard**: on the left on wide screens (the scoreboard hangs at the back on the
  right), on the right on the tall layout (there the scoreboard is on the left). Both face the camera, turned a touch
  toward each other. Wide: x = +0.7 and -7.2, full size. Tall: x = -0.6 and +4.3, both at 0.8 so they fit side by side
  on the narrow table. (`PAIR` in creatures.js; tunable live with `T3.creatureFrame('wide', {pair: {x: [..], s: ..}})`.)
- Why not the left side of the table: on the tall layout a creature at the side widens the picture and the whole table
  shrinks by about a quarter, the creature is seen side-on, and the left seat is where the Team-up grown-up and the
  kid's walk-around go. At the far corner both heads stay inside the band the single creature already keeps in view,
  so the table keeps its size (measured: tall camera distance 38.75 with two creatures vs 40.5 with one; wide unchanged).
- Neither covers a zone or the scoreboard at rest (resting hands stay on the far rim and never past the table's end).
- Camera fit: one extents hook covers both creatures (both heads are marked as a must); both shrink together through the
  shrink hook when a short wide screen needs it. table.js is untouched.
- Reaching: each creature plans from its own seat with the same planner (1.25x arm cap, lean, side shuffle along the far
  edge, step over the table). The shuffle keeps the hips within the usual range of the table's middle, or at its own
  corner seat. While one reaches, the other steps back and aside if the reacher comes past it along the far edge (when
  the reacher is out over the table it simply passes in front), watches the cube being carried, and glances over while
  the other one talks. Entrances and exits come from each creature's own side so they never cross; dances sway less
  far sideways when there are two. No new looping motion: everything eases in once and back to rest.

## game.js wiring (exact)

Player index -> creature index: in 'ai3', `G.players[1]` is creature 0 and `G.players[2]` is creature 1.
Add next to `curAI()`:

```js
// Which creature at the table plays for player i (two creatures: the first AI player is creature 0, the second is creature 1).
function aiSeat(i) { var n = -1; for (var j = 0; j <= i && j < G.players.length; j++) if (G.players[j].ai) n++; return n < 0 ? 0 : n; }
// Run fn with player i's creature addressed by the T3.creature* calls (then the previous one again).
function creatureAt(i, fn) { if (T3.creatureWith) T3.creatureWith(aiSeat(i), fn); else fn(); }
```

### focusAI: select instead of swapping

```js
function focusAI(i) {
  if (!G || !G.players[i] || !G.players[i].ai) return;
  if (T3.creatureUse) T3.creatureUse(aiSeat(i));           // both creatures stay at the table: just address this one
  if (G.act === i) return;
  var had = G.act != null; G.act = i;
  if (had && current === 'game') renderGame();             // the speech bubble's face follows the creature that is up
}
```

(Update the comment above `curAI()`: "one of them is 'up': it is the one speaking and the one the 3D calls address".)

### aiPlace: pin the mover (the think time is async; a challenge may have re-focused meanwhile)

```js
function aiPlace(id, zone, who) {
  if (T3.active() && T3.creatureMove) { G.busy = true; G.carrying = true; renderGame(); if (T3.creatureUse) T3.creatureUse(aiSeat(who)); T3.creatureMove(id, zone, function () { if (!G) return; G.busy = false; G.carrying = false; placeCube(id, zone, who); }); }
  else placeCube(id, zone, who);
}
```

Same in `aiSetGoal`, inside `nextG` right before `T3.creatureMove(tk.id, 'goal', ...)`:
`if (T3.creatureUse) T3.creatureUse(aiSeat(G.setter));`

### startMatch

Replace `setCreature(ai ? ai.kind : null, ai && ai.pack);` with:

```js
  var ais = G.players.filter(function (p) { return p.ai; });
  if (ais.length > 1 && T3.setCreatures) T3.setCreatures(ais.map(function (p) { return { kind: p.ai.kind, pack: p.ai.pack || 'classic' }; }));
  else setCreature(ai ? ai.kind : null, ai && ai.pack);
```

(`p3` with one creature and `team` keep the one-creature path, as before.)
In `begin`, replace `if (T3.creatureEnter) T3.creatureEnter();` with `creaturesEnter();` and add:

```js
// Every creature at the table walks in (the second one a moment later, from its own side).
function creaturesEnter() {
  if (!T3.creatureEnter) return;
  if (!(T3.creatureCount && T3.creatureCount() > 1)) { T3.creatureEnter(); return; }
  T3.creatureWith(0, function () { T3.creatureEnter(); });
  setTimeout(function () { if (G && T3.creatureWith) T3.creatureWith(1, function () { T3.creatureEnter(); }); }, 450);
}
```

The greeting line still comes from `firstAI()` (creature 0), so creature 0 is in use at the start (setCreatures does that).

### endShake: both react to their own shake

Keep `focusAI(aiI)` (the best-scoring creature speaks). Replace the two `creatureMood(...)` calls in the
`if (aiI !== undefined) { ... }` block so that every creature reacts to its own points, the talker as before:

```js
  if (aiI !== undefined) {
    var ao = G.players[aiI].ai, ap = r.pts[aiI] || 0, hp = r.pts[0] || 0;
    if (ap > hp) { var gl = S.set.gloat !== false && Math.random() < 0.5; creatureMood(gl ? 'gloat' : 'happy'); aiTalk = gl ? talkLine(ao, 'gloat') : (talkLine(ao, 'kidWrong') || ''); }
    else if (ap < hp) { creatureMood(Math.random() < 0.3 ? 'cry' : 'sad'); if (Math.random() < 0.7) aiTalk = talkLine(ao, Math.random() < 0.5 ? 'kidGoodMove' : 'sore') || talkLine(ao, 'sore'); }
    // the other creature (Three at the table) reacts to its own shake, a beat later
    idxs().filter(function (i) { return isAI(i) && i !== aiI; }).forEach(function (i) {
      var p = r.pts[i] || 0, m = p > hp ? (Math.random() < 0.5 ? 'happy' : 'clap') : p < hp ? (Math.random() < 0.5 ? 'sad' : 'shrug') : null;
      if (m) setTimeout(function () { if (G && G.phase === 'over') creatureAt(i, function () { if (T3.creatureMood) T3.creatureMood(m); }); }, 350);
    });
  }
```

### endMatch ('ai3'): winners dance, losers sulk, both visible

Replace `if (aiI !== undefined) creatureMood(winners.indexOf(aiI) >= 0 ? 'dance' : loseMood(G.players[aiI].ai));` with:

```js
    idxs().filter(isAI).forEach(function (i) {
      var m = winners.indexOf(i) >= 0 ? 'dance' : loseMood(G.players[i].ai);
      creatureAt(i, function () { if (T3.creatureMood) T3.creatureMood(m); });
    });
    if (aiI !== undefined && winners.indexOf(aiI) >= 0 && Snd.danceMusic) Snd.danceMusic(3200);   // once, even if both dance
```

(`focusAI(aiI)` just above stays, so the best-placed creature remains the one in use for anything after.)
The 'ai' and team branches keep `creatureMood(...)`: with one creature it addresses creature 0.

### Optional touches

- `placeCube` (kid's move, `Math.random() < 0.25` nod/gasp): in 'ai3' let a random creature react:
  `creatureAt(pick(idxs().filter(isAI)), function () { creatureMood(pick(['nod', 'nod', 'gasp'])); });`
- `challenge()`: when one creature challenges, the other could `gasp` via `creatureAt(otherAI, ...)`.
- `say('opp', ...)` / `speakLine` need no change: they use `curAI()` and `T3.creatureTalk`, both following `focusAI`.

## Leaving a two-creature match

Any later `setCreature(...)` (the next 'ai' match, tutorial, online's `setCreature(null)`) sends creature 1 away and
puts creature 0 back in the middle, so nothing else needs to know about the second creature.

## Debugging

`T3.creatureStats(i)` (steps, yield, pose, gesture), `T3.creatureStage(i)`, `T3._creatureActor(i)`,
`T3.creatureFrame()` (current seat values, FRAME and PAIR), `T3.creatureTempo = 3` (slow reaches).
