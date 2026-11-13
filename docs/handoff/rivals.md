# Rivals: creatures that remember

Each of the 15 creatures keeps a small memory of its matches with him and talks about it in its own voice:
"Last time you beat me with a factorial!", "Your Now! with 6 × 7… it gave me chills!",
"3 in a row! Okay, okay, you're the boss of naps now." Each creature also gets a rival level that grows with
matches played: 🙂 New face (0-1) → 👋 Familiar (2-4) → ⚔️ Rival (5-9) → 🛡️ Old rival (10-19) → 🤝 Friend (20+),
shown on its picker card and in the Career screen with a short "history with you".

New files (nothing else was edited):

| File | What |
|---|---|
| `js/rivals.js` | memory, fact extraction, the lines for all 15 creatures, picker/Career HTML, the merge rule |
| `css/rivals.css` | the card line and the Career "Rivals" rows |
| `tests/rivals.test.js` | plain node: `node tests/rivals.test.js` (about 2000 checks) |

## What is remembered (S.rivals, keyed by creature id)

Per creature, about 300-570 bytes; **8.6 KB for all 15 creatures after 30 busy matches each** (the test prints it).

| Key | Meaning |
|---|---|
| `n w l t` | matches played / he won / it won / tied |
| `st`, `bs` | streak (+3 = he won the last 3, −2 = it won the last 2), his best win streak |
| `f`, `d` | first and last day played |
| `r` | last 5 results, newest first: `[res, his score, its score, day, mode]` (mode `a` one-on-one, `c` Cup, `3` Three at the table, `m` Team-up, `p` 3 players) |
| `last` | how the last match was decided: `how` (`now`/`imp`/`other`), `who` (`k` him / `o` it), `it` the deciding thing (`['op','!']`, `['b','Q']` gold Power die, `['g',sym]` purple die, `['v','upside']` card), `sol` his deciding Solution text, `osol` its, `cb` comeback, `pf` perfect, `k` skill keys he used |
| `big` | his biggest Goal against it `[value, text]` |
| `adm` | the Solution it admired most `[long/frac/neg, text, score]` (fractions and below-zero count extra) |
| `ms` | milestones with the day: `fw` first win, `w5`, `w10`, `cb`, `pf`, `cup: [day, round]`, `tr` (Three-at-the-table crown) |
| `sea` | his season place after the last league fixture against it `[place, league, day]` |
| `ops` | won matches per skill (`*`, `!`, `fr`, `ng`, `b:Q`, `v:upside` …), 10 keys at most: "you're getting good at ×" |

The deciding thing of a match is taken from the shake with the biggest swing his way (or its way, if it won):
gold/purple die → factorial → the variation card in force → √ → ^ → ÷ → × → − → +.
Solution text and "went below zero" reuse `Parent._facts.showText` / `negUsed` (js/parent.js).
Tutorial, online and people-only matches are not remembered.

## The lines

Per creature: 13-15 greetings, 5-6 mid-match callbacks, 12 end lines (every line written for that creature's
voice). Each line has a situation and a tone: **k** kind (always), **b** brag about itself (only with Settings
"gloat" on), **t** tease (only with "trash talk" on). Every situation that has a brag or tease also has kind lines
somewhere in its group, so turning both switches off still leaves things to say.

**Losing streak rule:** when he has lost 2+ in a row against a creature, it only uses kind lines and only these
memories: encouraging (`so`), days away, old rival, his biggest Goal, a Solution it admired. No "I won last time",
no teasing. The end line after a loss becomes encouragement ("You'll get me next time. You're getting closer!").

Templates fill real facts: `{ks}–{os}` last score, `{w}–{l}` record, `{streak}`, `{next}`, `{days}`, `{goal}`,
`{old}`, `{adm}` + `{adk}`, `{sol}` / `{osol}`, `{item}` ("a factorial", "the Upside-down card", "the gold x² cube"),
`{op}` ("multiplying", "fractions"), `{cup}` ("final"), `{pos}` + `{lg}`. A line is only used if every placeholder has a
real value, so nothing ever says "undefined".

Frequency: the memory greeting replaces the plain one about 75% of the time after a memorable match (Now!, item,
comeback, perfect, Cup, Trio, his streak) and 45% otherwise (including the encouraging lines, two per creature, so they
do not repeat every match); never on a first meeting; never the same line twice in a row.
Mid-match: at most 2 per match, 1 per shake, 60% chance when something matches. End: milestones always, others ~50%
(the game's usual line is used otherwise).

## API

```js
Rivals.note('start', { g: G })                    // startMatch
Rivals.note('challenge', { g: G })                // challenge(), after G.ch is set
Rivals.note('shake', { g: G, r: r })              // endShake, after points are added
Rivals.note('end', { g: G, season: seasonRes })   // endMatch (one-on-one: after Season.onMatch, before Cup.onMatchEnd)
Rivals.greet(oppIdx)              // -> line or ''
Rivals.midLine(oppIdx, { g: G, sym: c.s })   // after his cube move -> line or ''
Rivals.midLine(oppIdx, { g: G, goal: 1 })    // after he sets a Goal -> line or ''
Rivals.endLine(oppIdx, 'w' | 'l' | 't')      // after note('end') -> line or ''
Rivals.level(i)                   // {k, name, icon, n, toNext, nextName}
Rivals.cardLineHTML(i)            // picker card line
Rivals.historyHTML(i), Rivals.careerHTML()   // Career screen
Rivals.bytes()                    // size of S.rivals in characters
Rivals.merge(a, b)                // the cloud-save merge rule (same code as below)
```

## Snippets to apply (exact anchors)

### index.html

After `<link rel="stylesheet" href="css/parent.css"><!-- PARENT page -->` add:

```html
<link rel="stylesheet" href="css/rivals.css"><!-- RIVALS -->
```

After `<script src="js/parent.js"></script><!-- PARENT page -->` add:

```html
<script src="js/rivals.js"></script><!-- RIVALS -->
```

### js/config.js — save default

In `defaults()`, change `kits: { away: {}, third: {} }, kitUse: 'home'` to:

```js
    kits: { away: {}, third: {} }, kitUse: 'home', rivals: {}
```

### js/account.js — merge rule (tests/account.test.js needs one for every top-level key)

In `RULES`, after the line `    parent: function (a, b, c) { return deepMax(a, b, c); },` add (same code as
`Rivals.merge`; tests/rivals.test.js checks the two are identical):

```js
    /*RIVALS-MERGE-START*/
    rivals: function rivalsMerge(a, b) {
    var isO = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
    var cp = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
    a = isO(a) ? a : {}; b = isO(b) ? b : {};
    var out = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (id) {
      if (id in out) return;
      var x = a[id], y = b[id];
      if (!isO(x) || !isO(y)) { out[id] = cp(isO(x) ? x : isO(y) ? y : (x !== undefined ? x : y)); return; }
      // the side that played more matches against this creature wins; same count: the later day
      var nx = +x.n || 0, ny = +y.n || 0, useX = nx !== ny ? nx > ny : String(x.d || '') >= String(y.d || '');
      var w = cp(useX ? x : y), o = useX ? y : x;
      w.bs = Math.max(+x.bs || 0, +y.bs || 0);
      w.f = x.f && y.f ? (String(x.f) < String(y.f) ? x.f : y.f) : (x.f || y.f);
      // milestones: union, earliest day for each
      var ms = isO(w.ms) ? w.ms : {}, om = isO(o.ms) ? o.ms : {};
      Object.keys(om).forEach(function (k) {
        var p = ms[k], q = om[k], dp = Array.isArray(p) ? p[0] : p, dq = Array.isArray(q) ? q[0] : q;
        if (p === undefined || (dq && dp && String(dq) < String(dp))) ms[k] = cp(q);
      });
      w.ms = ms;
      if (Array.isArray(o.big) && (!Array.isArray(w.big) || +o.big[0] > +w.big[0])) w.big = cp(o.big);
      if (Array.isArray(o.adm) && (!Array.isArray(w.adm) || +o.adm[2] > +w.adm[2])) w.adm = cp(o.adm);
      out[id] = w;
    });
    return out;
  },
    /*RIVALS-MERGE-END*/
```

In `DESCRIBE`, after `onsets: 'On-Sets: stars and totals highest; creatures beaten on either',` add:

```js
    rivals: 'per creature: the side with more matches; milestones: union (earliest); best streak, biggest Goal, admired Solution: best of both',
```

Rule in words: per creature keep the side that played more matches against it (same count: the later day);
milestones are a union keeping the earliest day; best streak, biggest Goal and admired Solution keep the best of
both; creatures known on only one side are kept.

### js/game.js

1. `startMatch`, after `  if (window.Career) Career.matchStart(G); // CAREER: remember this match's signature rule` add:

```js
  if (window.Rivals) Rivals.note('start', { g: G }); // RIVALS: creatures that remember
```

2. `startMatch`, in `begin`, replace `var hi = talkLine(ai, 'greet');` with:

```js
var hi = (window.Rivals && Rivals.greet(OPPONENTS.indexOf(ai))) || talkLine(ai, 'greet');
```

3. `challenge`, after the line that starts `  G.phase = 'challenge'; G.ch = { kind: kind, challenger: who,` add:

```js
  if (window.Rivals) Rivals.note('challenge', { g: G }); // RIVALS
```

4. `endShake`, right before `  renderGame();` that is followed by `  var aiI = idxs().filter(isAI).sort(function (x, y) { return (r.pts[y] || 0) - (r.pts[x] || 0); })[0];` add:

```js
  if (window.Rivals && G.mode !== 'tutorial') Rivals.note('shake', { g: G, r: r }); // RIVALS
```

5. `endMatch`, after `  if (window.Parent && G.mode !== 'tutorial') Parent.note('match'); // PARENT page (reads G; peeks at Pip's review notes)` add:

```js
  if (window.Rivals && G.mode !== 'ai') Rivals.note('end', { g: G }); // RIVALS (Team-up, Three at the table, 3 players; one-on-one below)
```

6. `endMatch`, one-on-one branch, after `    var seasonRes = window.Season ? Season.onMatch({ oppIdx: idx, you: a, them: b, won: won, tie: tie, mode: window.Cup && Cup.active() ? 'cup' : 'ai' }) : null;` add:

```js
    if (window.Rivals) Rivals.note('end', { g: G, season: seasonRes }); // RIVALS (before Cup.onMatchEnd, which moves the Cup round on)
    var rivalEnd = window.Rivals ? Rivals.endLine(idx, won ? 'w' : tie ? 't' : 'l') : '';
```

   and in the `html = …` line just below, replace the bubble text
   `(won ? (Math.random() < 0.5 ? o.lose : talkLine(o, 'sore') || o.lose) : tie ? 'A tie! Let\'s play again!' : (S.set.gloat !== false ? talkLine(o, 'gloat') || o.win : o.win) + ' Want a rematch?')`
   with:

```js
(rivalEnd || (won ? (Math.random() < 0.5 ? o.lose : talkLine(o, 'sore') || o.lose) : tie ? 'A tie! Let\'s play again!' : (S.set.gloat !== false ? talkLine(o, 'gloat') || o.win : o.win) + ' Want a rematch?'))
```

7. `placeCube`, after `  if (!isAI(who) && firstAI() && Math.random() < 0.25) creatureMood(pick(['nod', 'nod', 'gasp']));` add:

```js
  if (who === 0 && !isAI(0) && window.Rivals && firstAI() && window.Social && Social.bubble) { var rvl = Rivals.midLine(OPPONENTS.indexOf(firstAI()), { g: G, sym: c.s }); if (rvl) setTimeout(function () { if (G && G.phase === 'move') Social.bubble('opp', rvl); }, 700); } // RIVALS
```

8. `setGoal`, after the line `  if (!isAI(G.setter) && G.setter === 0 && G.mode !== 'tutorial') { S.stats.goalsSet++; …` add:

```js
  if (G.setter === 0 && !isAI(0) && G.mode !== 'tutorial' && window.Rivals && firstAI() && window.Social && Social.bubble) { var rvg = Rivals.midLine(OPPONENTS.indexOf(firstAI()), { g: G, goal: 1 }); if (rvg) setTimeout(function () { if (G && G.phase === 'move') Social.bubble('opp', rvg); }, 900); } // RIVALS
```

(Optional, Three at the table: in `endMatch`'s other branch after `if (aiI !== undefined) focusAI(aiI);` add
`if (window.Rivals && aiI !== undefined) { var rv3 = Rivals.endLine(OPPONENTS.indexOf(G.players[aiI].ai)); if (rv3) setTimeout(function () { if (G) say('opp', rv3); }, 900); }`.)

### js/screens.js — picker card

In `renderSetup`, after `      (window.Career ? Career.tagHTML(i) : '') + // CAREER: "Special rule: Use It Again"` add:

```js
      (window.Rivals && open ? Rivals.cardLineHTML(i) : '') + // RIVALS: "⚔️ Rival 3–2 · Last: you won 10–6"
```

### js/career.js — history

In `html()`, replace `      nextLine + leagues +` with:

```js
      nextLine + leagues + (typeof Rivals !== 'undefined' ? Rivals.careerHTML() : '') +
```

## Judgment calls

- Memory is keyed by creature id (`o.id`), not index, so renamed creatures (`S.oppNames`) and reordering keep it.
- Team-up, Three at the table and 3-player matches with a creature count toward the record (the creature was
  there); online, tutorial and people-only matches do not.
- Mid-match callbacks use `Social.bubble` (like the existing `kidChallenge` line), so Pip's instructions in the
  speech panel are not overwritten.
- A loss shows as a calm blue dot in the history, not red, and is worded as the creature's win ("Penny won 12–6"), never "you lost".
- "Friend" is the top level: after 20 matches the rival becomes a friend, which suits a good-natured rivalry.
