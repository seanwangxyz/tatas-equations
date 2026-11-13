'use strict';
// ======================= HOW MANY WAYS? =======================
// One Goal, one set of cubes: find as many DIFFERENT Solutions as you can. No clock; he decides
// when he's done. The engine (Eq.allWays / Eq.wayKey) lists every distinct way and decides when two
// Solutions are "the same way" (see the comment above Eq.wayKey in js/engine.js).
// Inert until wired: it only adds ACT handlers (waysOpen, ...). Nothing shows until a button with
// data-act="waysOpen" exists. Renders into <section id="ways"> if there is one, else into #camp.
var WAYS = null; // the puzzle on screen
var waysOn = false, waysJob = null; // is the How Many Ways screen showing? / the puzzle being made

var WAYS_LEVELS = [null, // digits / operation cubes dealt, how many ways the Goal should have, Goal size
  { digits: 4, ops: 2, lo: 3, hi: 6, minGoal: 2, maxGoal: 10 },
  { digits: 4, ops: 3, lo: 4, hi: 8, minGoal: 3, maxGoal: 15 },
  { digits: 5, ops: 3, lo: 5, hi: 12, minGoal: 4, maxGoal: 20 },
  { digits: 5, ops: 3, lo: 6, hi: 15, minGoal: 6, maxGoal: 30 },
  { digits: 5, ops: 4, lo: 8, hi: 20, minGoal: 8, maxGoal: 99 }
];
var WAYS_XP = { way: 8, bronze: 10, silver: 15, gold: 25, all: 20 };
var MEDAL_NAMES = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
var MEDAL_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇' };
var MEDAL_RANK = { '': 0, bronze: 1, silver: 2, gold: 3 };

function waysSave() {
  if (!S.ways) S.ways = { lvl: 1, row: 0, miss: 0, done: 0, total: 0, best: {} };
  if (!S.ways.best) S.ways.best = {};
  return S.ways;
}
function waysSnd(name) { try { if (window.Snd && Snd[name]) Snd[name](); } catch (e) {} }
function waysEl() { return $('#ways') || $('#camp'); }

// ----- Making a puzzle -----
// Real cubes: digits come from a normal roll of all 24; the operation cubes are only ones he has
// unlocked (stageInfo), different kinds where possible, and at most one ^ or √ so the count stays sane.
function waysDeal(rand, L) {
  var st = stageInfo(), cfg = WAYS_LEVELS[L], roll = Eq.roll(rand);
  var digs = shuffle(roll.filter(function (c) { return Eq.isDigit(c.s); }), rand).slice(0, cfg.digits);
  var opsAll = shuffle(roll.filter(function (c) { return !Eq.isDigit(c.s) && st.ops.indexOf(c.s) >= 0; }), rand);
  var ops = [], kinds = {}, hard = 0;
  opsAll.forEach(function (c) { // first pass: one of each kind
    if (ops.length >= cfg.ops || kinds[c.s]) return;
    var h = c.s === '^' || c.s === 'r'; if (h && hard) return;
    ops.push(c); kinds[c.s] = 1; if (h) hard++;
  });
  opsAll.forEach(function (c) { // second pass: repeats of + − × ÷ if still short
    if (ops.length >= cfg.ops || ops.indexOf(c) >= 0 || c.s === '^' || c.s === 'r') return;
    ops.push(c);
  });
  if (digs.length < cfg.digits || ops.length < cfg.ops) return null;
  var cubes = digs.concat(ops).map(function (c, i) { return { id: i, color: c.color, s: c.s, zone: 'permitted', order: i, locked: false }; });
  cubes.sort(function (a, b) { var da = Eq.isDigit(a.s), db = Eq.isDigit(b.s); return da !== db ? (da ? -1 : 1) : (a.s < b.s ? -1 : a.s > b.s ? 1 : 0); });
  cubes.forEach(function (c, i) { c.id = i; c.order = i; });
  return { cubes: cubes, fractions: st.fractions, maxGoal: Math.min(cfg.maxGoal, st.maxGoal || 99) };
}
function waysPickGoal(D, cfg, rand, slack) {
  var a = Eq.allWays({ cubes: D.cubes.map(function (c) { return c.s; }), fractions: D.fractions, timeMs: 150, maxNodes: 60000 });
  if (!a.complete) return null; // too big to count for sure: deal again
  var lo = Math.max(3, cfg.lo - slack), hi = cfg.hi + slack * 2, goals = [];
  Object.keys(a.byValue).forEach(function (k) {
    var p = k.split('/'), n = +p[0], list = a.byValue[k];
    if (p[1] !== '1' || n < cfg.minGoal || n > D.maxGoal || list.length < lo || list.length > hi) return;
    var kinds = {}; list.forEach(function (w) { w.ops.forEach(function (o) { kinds[o] = 1; }); });
    if (Object.keys(kinds).length < 2 && slack < 2) return; // needs at least two kinds of operation
    goals.push({ goal: { n: n, d: 1 }, ways: list });
  });
  if (!goals.length) return null;
  var g = goals[Math.floor(rand() * goals.length)];
  return { ways: g.ways, goal: g.goal, ms: a.ms };
}
// Goal shown as cubes, like a real Goal: digit cubes of a color that has that digit.
function waysGoalCubes(goal, cubes) {
  var col = { 0: 'red', 1: 'blue', 2: 'red', 3: 'blue', 4: 'green', 5: 'green', 6: 'green', 7: 'black', 8: 'black', 9: 'black' };
  return String(goal.n).split('').map(function (d) {
    var c = { id: cubes.length, color: col[d], s: d, zone: 'goal', order: cubes.length, locked: false };
    cubes.push(c); return { s: d, id: c.id };
  });
}
// Builds a puzzle a few tries at a time (setTimeout between chunks, so the screen never freezes).
function waysMake(L, done) {
  var rand = (typeof campRand === 'function') ? campRand() : Eq.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  var tries = 0, cfg = WAYS_LEVELS[L];
  (function chunk() {
    var t0 = Date.now();
    while (Date.now() - t0 < 120 && tries < 60) {
      tries++;
      var D = waysDeal(rand, L);
      if (!D) continue;
      var g = waysPickGoal(D, cfg, rand, tries > 40 ? 2 : tries > 20 ? 1 : 0);
      if (!g) continue;
      var gt = waysGoalCubes(g.goal, D.cubes);
      done({ lvl: L, cubes: D.cubes, fractions: D.fractions, goal: g.goal, goalTokens: gt, all: g.ways.slice(), total: g.ways.length, medals: Eq.wayMedals(g.ways.length), ms: g.ms, tries: tries });
      return;
    }
    if (tries >= 60) { done(null); return; }
    setTimeout(chunk, 0);
  })();
}

// The Training Camp tile (the camp menu calls this; see docs/handoff/ways.md).
function waysTileHTML() {
  var sv = waysSave(), best = sv.best[sv.lvl];
  return '<div class="opp mode" data-act="waysOpen"><span class="avatar lg" style="background:#f3d9fa;color:#1d2340;font-size:44px">' + ico('star') + '</span><h3>How Many Ways?</h3><div class="otitle">One Goal. Find lots of Solutions!</div>' +
    '<div class="stars">' + '★'.repeat(sv.lvl) + '<span style="opacity:.3">' + '★'.repeat(5 - sv.lvl) + '</span></div><div class="otitle">Level ' + sv.lvl + (best ? ' · best ' + MEDAL_ICON[best] : '') + ' · ' + sv.total + ' ways found</div></div>';
}

// ----- Opening / starting -----
ACT.waysOpen = function () {
  if (WAYS && !WAYS.over) { waysGo(); waysRender(); return; }
  waysNew();
};
function waysGo() { var el = waysEl(); waysOn = true; go(el.id); if (window.Snd && Snd.setMood) Snd.setMood('think'); }
function waysNew() {
  var L = waysSave().lvl;
  WAYS = null;
  var el = waysEl();
  el.innerHTML = waysHdr() + waysCoach('Shaking the cubes for a new puzzle…', 'think');
  waysGo();
  var job = waysJob = {};
  waysMake(L, function (P) {
    if (waysJob !== job || !waysOn) return; // he left before it was ready
    if (!P) { el.innerHTML = waysHdr() + waysCoach('Hmm, the cubes got tangled. Let\'s try again!', 'think') + '<div class="row" style="margin-top:14px"><button class="btn big green" data-act="waysAgain">Try again</button></div>'; return; }
    WAYS = { P: P, found: [], hint: 0, over: false, xp0: S.xp, star: false, medal: '', missedShown: 0,
      msg: { text: 'Make <b>' + Eq.fmt(P.goal) + '</b> as many <b>different</b> ways as you can! Use any of the cubes. Take as long as you like, and tap <b>I\'m done</b> when you want to stop.', mood: 'happy' } };
    waysRender();
  });
}
ACT.waysAgain = function () { closeModal(); waysNew(); };
ACT.waysBack = function () {
  waysOn = false; waysJob = null;
  closeModal();
  if (ACT.camp && $('#camp')) ACT.camp(); else if (ACT.home) ACT.home();
};

// ----- Screen -----
function waysHdr() {
  var lvl = waysSave().lvl;
  return '<div class="hdr wy-hdr"><button class="btn small" data-act="waysBack">' + ico('back') + ' Camp</button><h2>' + ico('star') + ' How Many Ways? <small style="font-size:16px;opacity:.85">Level ' + lvl + '</small></h2>' +
    '<button class="btn small" data-act="waysRules" aria-label="What counts as a new way?">?</button></div>';
}
function waysCoach(text, mood, cls) {
  return '<div class="panel wy-coach' + (cls ? ' ' + cls : '') + '" style="background:rgba(255,253,246,.97)"><div class="row">' + pipHTML(mood || 'happy', 70, '') + '<div class="bubble">' + text + '</div></div></div>';
}
function waysTrack() {
  var W = WAYS, m = W.P.medals, n = W.found.length, pct = Math.min(100, Math.round(100 * n / m.gold));
  var stops = ['bronze', 'silver', 'gold'].map(function (t) {
    var got = n >= m[t], left = Math.round(100 * m[t] / m.gold);
    return '<div class="wy-stop' + (got ? ' got' : '') + (W.justMedal === t ? ' wy-pop' : '') + '" style="left:' + left + '%"><div class="medal tier-' + t + (got ? '' : ' locked') + '"><span>' + (got ? MEDAL_ICON[t] : m[t]) + '</span></div><small>' + MEDAL_NAMES[t] + '</small></div>';
  }).join('');
  return '<div class="wy-trackbox"><div class="wy-count"><b>' + n + '</b> way' + (n === 1 ? '' : 's') + ' found</div>' +
    '<div class="wy-track"><div class="wy-fill" style="width:' + pct + '%"></div>' + stops + '</div></div>';
}
function waysShelf() {
  var W = WAYS;
  if (!W.found.length) return '<div class="wy-shelf empty">Your ways will line up here.</div>';
  return '<div class="wy-shelf">' + W.found.map(function (f, i) {
    var cls = (W.justFound === i ? ' wy-new' : '') + (W.sameAs === i ? ' wy-same' : '');
    return '<div class="wy-way' + cls + '"><span class="wy-num">' + (i + 1) + '</span><div class="expr">' + tokensHTML(f.tokens, W.P.cubes) + '</div></div>';
  }).join('') + '</div>';
}
function waysRender() {
  var W = WAYS, P = W.P, el = waysEl();
  if (!waysOn || current !== el.id) return;
  el.innerHTML = waysHdr() + waysCoach(W.msg.text, W.msg.mood, W.msg.cls) +
    '<div class="mat wy-mat" style="margin-top:10px">' +
    '<div class="zone z-goal"><h3>🎯 GOAL <span class="gval">= ' + Eq.fmt(P.goal) + '</span></h3><div class="cubes">' + P.goalTokens.map(function (t) { return cubeHTML(P.cubes[t.id], 'mini'); }).join('') + '</div></div>' +
    '<div class="zone z-permitted"><h3>👍 YOUR CUBES <small>use any of them, in every way</small></h3><div class="cubes">' + P.cubes.filter(function (c) { return c.zone === 'permitted'; }).map(function (c) { return cubeHTML(c, 'mini'); }).join('') + '</div></div></div>' +
    '<div class="panel wy-panel">' + waysTrack() + waysShelf() + '</div>' +
    '<div class="row" style="margin-top:14px">' +
    (W.over ? '<button class="btn big green" data-act="waysAgain">' + ico('play') + ' New puzzle</button>' + (waysMissing().length ? '<button class="btn" data-act="waysMissed">' + ico('bulb') + ' Show me one I missed</button>' : '')
      : '<button class="btn big green" data-act="waysBuild">' + ico('pencil') + ' Build a way</button><button class="btn" data-act="waysHint">' + ico('bulb') + ' Hint</button><button class="btn" data-act="waysDone">' + ico('check') + ' I\'m done</button>') +
    '</div>';
  W.justFound = W.sameAs = W.justMedal = null; // animations play once
}
ACT.waysRules = function () {
  modal('<h2>What is a new way?</h2>' +
    '<p>These are the <b>same</b> way, so they only count once:</p><ul class="reasons">' +
    '<li>Swapping the order: <b>2 + 3</b> and <b>3 + 2</b>, or <b>2 × 3</b> and <b>3 × 2</b>.</li>' +
    '<li>Moving the ( ): <b>(2 + 3) + 4</b> and <b>2 + (3 + 4)</b>.</li>' +
    '<li>Adding a helper that changes nothing: <b>+ 0</b>, <b>× 1</b>, <b>+ 4 − 4</b>, or <b>× (3 − 2)</b>.</li>' +
    '<li>The same trick with another number: <b>2 ÷ 2</b> and <b>4 ÷ 4</b> both make 1.</li></ul>' +
    '<p>These are <b>different</b> ways:</p><ul class="reasons">' +
    '<li>Different cubes: <b>2 + 3</b> and <b>1 + 4</b>.</li>' +
    '<li>A different operation: <b>2 + 3</b> and <b>6 − 1</b>.</li>' +
    '<li>A different shape: <b>2 × (3 + 4)</b> and <b>2 × 3 + 2 × 4</b>.</li></ul>' +
    '<div class="row"><button class="btn green" data-act="closeModal">Got it!</button></div>');
};

// ----- Building a way -----
ACT.waysBuild = function (el, e, keep) {
  var W = WAYS, P = W.P;
  B = { kind: 'solution', mode: 'daily', tokens: keep ? keep.slice() : [], pools: [{ label: '👍 Your cubes (use any)', ids: P.cubes.filter(function (c) { return c.zone === 'permitted'; }).map(function (c) { return c.id; }) }],
    cubes: P.cubes, goal: P.goal, goalTokens: P.goalTokens, fractions: P.fractions, title: 'Way number ' + (W.found.length + 1), onDone: waysChecked };
  renderBuilder(); $('#builder').classList.add('on');
};
function waysCtx(P) {
  return { goal: P.goal, zone: function (id) { return P.cubes[id] ? P.cubes[id].zone : 'forbidden'; }, required: [], mode: 'daily', fractions: P.fractions, label: function (id) { return show(P.cubes[id].s); } };
}
function waysOpsOf(tokens) { var o = []; tokens.forEach(function (t) { var s = typeof t === 'string' ? t : t.s; if (Eq.OPS.indexOf(s) >= 0 && o.indexOf(s) < 0) o.push(s); }); return o; }
function waysMissing() { var W = WAYS, got = {}; W.found.forEach(function (f) { got[f.key] = 1; }); return W.P.all.filter(function (w) { return !got[w.key]; }); }
// An operation that some missed way uses but none of his ways do yet (or null).
function waysFreshOp() {
  var usedOps = {}; WAYS.found.forEach(function (f) { f.ops.forEach(function (o) { usedOps[o] = 1; }); });
  var miss = waysMissing();
  for (var i = 0; i < miss.length; i++) for (var j = 0; j < miss[i].ops.length; j++) if (!usedOps[miss[i].ops[j]]) return miss[i].ops[j];
  return null;
}
function waysChecked(tokens) {
  if (!tokens) return; // closed the builder
  var W = WAYS, P = W.P, chk = Eq.checkSolution(tokens, waysCtx(P));
  if (window.Parent) Parent.note('solution', { chk: chk, ms: 0, tokens: tokens, mode: 'ways', goal: P.goal, fr: P.fractions }); // PARENT page
  if (!chk.ok) {
    waysSnd('boop');
    W.retry = tokens;
    modal('<h2>🤔 Not quite!</h2>' + exprBox(tokens, P.cubes) + '<ul class="reasons">' + chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
      '<p style="text-align:center">That\'s OK! Fix it, or start a new one. Trying never costs anything.</p>' +
      '<div class="row"><button class="btn green" data-act="waysFix">' + ico('pencil') + ' Fix it</button><button class="btn" data-act="waysFresh">Start fresh</button><button class="btn" data-act="closeModal">Not now</button></div>');
    return;
  }
  var wk = Eq.wayKey(tokens, { fractions: P.fractions }), dup = -1;
  for (var i = 0; i < W.found.length; i++) if (W.found[i].key === wk.key) { dup = i; break; }
  if (dup >= 0) {
    var f = W.found[dup], fresh = waysFreshOp();
    var cubesOf = function (ts) { return ts.map(function (t) { return typeof t === 'string' ? t : t.s; }).filter(function (s) { return s !== '(' && s !== ')'; }).sort().join(''); };
    var why = cubesOf(tokens) === cubesOf(f.tokens) ? 'Swapping the order or moving the ( ) doesn\'t make a new way.'
      : (wk.helper || f.helper) ? 'Adding 0 or multiplying by 1 (or by something that equals 1) doesn\'t change it.'
      : (wk.trick && f.trick) ? 'It\'s the same trick with a different number: any number divided by itself is 1 (and any number to the power 0 is 1).'
      : 'Swapping the order or moving the ( ) doesn\'t make a new way.';
    var tip = fresh ? ' Can you find one with <b>' + show(fresh) + '</b>?' : ' Try different cubes or a different operation!';
    W.sameAs = dup;
    W.msg = { text: 'That\'s the same as your way number ' + (dup + 1) + ' <span class="wy-inline">' + tokensHTML(f.tokens, P.cubes, 'tiny') + '</span>. ' + why + tip, mood: 'think', cls: 'wy-nudge' };
    waysSnd('pop');
    waysRender();
    return;
  }
  // a brand-new way!
  xpLog = [];
  var ops = waysOpsOf(tokens);
  W.found.push({ key: wk.key, tokens: tokens.slice(), helper: wk.helper, trick: wk.trick, ops: ops });
  if (!P.all.some(function (w) { return w.key === wk.key; })) { P.all.push({ key: wk.key, tokens: tokens.map(function (t) { return typeof t === 'string' ? t : t.s; }), cubes: Eq.cubeCount(tokens), ops: ops }); P.total = P.all.length; } // (shouldn't happen: the list is complete)
  W.justFound = W.found.length - 1;
  addXP(WAYS_XP.way, 'New way to make ' + Eq.fmt(P.goal));
  var n = W.found.length, m = P.medals, newMedal = '';
  ['bronze', 'silver', 'gold'].forEach(function (t) { if (n === m[t] && MEDAL_RANK[t] > MEDAL_RANK[W.medal]) newMedal = t; });
  var text;
  if (newMedal) {
    W.medal = newMedal; W.justMedal = newMedal;
    addXP(WAYS_XP[newMedal], MEDAL_NAMES[newMedal] + ' medal');
    if (newMedal === 'gold') { W.star = !ladderOff() && S.ladder.stage < STAGES.length - 1; addStar(); }
    waysSnd(newMedal === 'gold' ? 'fanfare' : 'chime');
    if (window.FX && FX.confetti) FX.confetti(newMedal === 'gold' ? 140 : 60);
    text = MEDAL_ICON[newMedal] + ' <b>' + MEDAL_NAMES[newMedal] + ' medal!</b> ' + (newMedal === 'gold' ? 'Amazing! You can keep going and find even more.' : 'Next medal at ' + m[newMedal === 'bronze' ? 'silver' : 'gold'] + ' ways.');
  } else {
    waysSnd('chime');
    text = ['A new way! 🎉', 'Nice, that one is different! ✨', 'Another way! 🌟', 'Yes! A new one! 🎯'][(n - 1) % 4] + ' <b>+' + WAYS_XP.way + ' XP</b>';
  }
  if (n >= P.total) { waysFinish(true); return; }
  W.msg = { text: text, mood: newMedal ? 'cheer' : 'happy' };
  waysRender();
  if (celebrateQ.length) drainQueue(waysRender);
}
ACT.waysFix = function () { closeModal(); ACT.waysBuild(null, null, WAYS.retry || []); };
ACT.waysFresh = function () { closeModal(); ACT.waysBuild(); };

// ----- Hints (free) -----
ACT.waysHint = function () {
  var W = WAYS, miss = waysMissing();
  if (!miss.length) return;
  var fresh = waysFreshOp(), w = fresh ? miss.filter(function (x) { return x.ops.indexOf(fresh) >= 0; })[0] : miss[0];
  W.hint++;
  var digits = w.tokens.filter(Eq.isDigit);
  var text = W.hint % 2 === 1
    ? 'Hint: there\'s a way that uses <b>' + w.ops.map(show).join(' and ') + '</b> and ' + w.cubes + ' cubes.'
    : 'Bigger hint: try <b>' + w.ops.map(show).join(' and ') + '</b> with the cubes <b>' + digits.join(', ') + '</b>.';
  W.msg = { text: text, mood: 'think' };
  waysSnd('pop');
  waysRender();
};

// ----- Finishing -----
ACT.waysDone = function () {
  var W = WAYS;
  if (!W.found.length) {
    modal('<h2>Done already?</h2><p style="text-align:center">That\'s fine! You can stop now, or try one more. Even one way is great.</p>' +
      '<div class="row"><button class="btn green" data-act="waysKeep">Keep trying</button><button class="btn" data-act="waysStop">Stop here</button></div>');
    return;
  }
  waysFinish(false);
};
ACT.waysKeep = function () { closeModal(); };
ACT.waysStop = function () { closeModal(); waysFinish(false); };
function waysFinish(all) {
  var W = WAYS, P = W.P, sv = waysSave(), n = W.found.length, L = P.lvl;
  W.over = true;
  if (all && P.total >= 3) addXP(WAYS_XP.all, 'Found every way!');
  // best medal per level, and the silent difficulty step (like the camp drills)
  sv.done++; sv.total += n;
  if (MEDAL_RANK[W.medal] > MEDAL_RANK[sv.best[L] || '']) sv.best[L] = W.medal;
  if (MEDAL_RANK[W.medal] >= 2) { sv.row++; sv.miss = 0; if (sv.row >= 2 && sv.lvl < 5) { sv.lvl++; sv.row = 0; } }
  else if (!W.medal) { sv.row = 0; sv.miss++; if (sv.miss >= 2 && sv.lvl > 1) { sv.lvl--; sv.miss = 0; } }
  else { sv.row = 0; sv.miss = 0; }
  persist();
  if (typeof checkBadges === 'function') checkBadges({ type: 'ways' });
  var medal = W.medal ? '<div class="medal tier-' + W.medal + ' wy-pop" style="margin:6px auto"><span>' + MEDAL_ICON[W.medal] + '</span></div>' : '';
  var head = all ? '🏆 You found every way!' : W.medal === 'gold' ? '🥇 Gold!' : W.medal ? MEDAL_ICON[W.medal] + ' ' + MEDAL_NAMES[W.medal] + ' medal!' : '👏 Nice thinking!';
  var body = '<p style="text-align:center">You found <b>' + n + '</b> of the <b>' + P.total + '</b> ways to make <b>' + Eq.fmt(P.goal) + '</b>' + (all ? '. Every single one!' : '.') + '</p>' +
    (!W.medal ? '<p style="text-align:center">Bronze was at ' + P.medals.bronze + '. Every way you find makes you sharper!</p>' : '');
  if (all) { waysSnd('fanfare'); if (typeof victoryFX === 'function') victoryFX(); }
  waysShowOver(all);
  modal('<h2>' + head + '</h2>' + medal + body + waysXpLine(W) +
    '<div class="row" style="margin-top:12px">' + (all ? '' : '<button class="btn" data-act="waysMissed">' + ico('bulb') + ' Show me one I missed</button>') +
    '<button class="btn green big" data-act="waysAgain">Next puzzle ▶</button><button class="btn" data-act="waysBack">Back to camp</button></div>', waysDrain);
}
// The screen behind the pop-ups already shows the finished puzzle; closing a pop-up only plays
// any level-up / unlock celebrations that are waiting.
function waysDrain() { drainQueue(function () {}); }
function waysShowOver(all) {
  WAYS.msg = { text: all ? 'You found them all! Want another puzzle?' : 'Want to see a way you didn\'t find? Tap <b>Show me one I missed</b>.', mood: 'cheer' };
  waysRender();
}
function waysXpLine(W) {
  var gained = S.xp - (W.xp0 || 0), lines = [];
  if (gained > 0) lines.push('+' + gained + ' XP from this puzzle');
  if (W.star) lines.push('⭐ Skill star for a gold medal!');
  return lines.length ? '<div class="xplist" style="text-align:center">' + lines.map(esc).join('<br>') + '</div>' : '';
}
// Teaching moment: one way he didn't find, preferring one with an operation he didn't use.
ACT.waysMissed = function () {
  var W = WAYS, P = W.P, miss = waysMissing();
  if (!miss.length) { closeModal(); return; }
  var fresh = waysFreshOp(), pool = fresh ? miss.filter(function (x) { return x.ops.indexOf(fresh) >= 0; }) : miss;
  var w = pool[W.missedShown % pool.length]; W.missedShown++;
  var used = {}, toks = w.tokens.map(function (s) { // color the cubes like his own cubes
    if (s === '(' || s === ')') return s;
    var c = P.cubes.filter(function (x) { return x.zone === 'permitted' && x.s === s && !used[x.id]; })[0];
    if (!c) return s; used[c.id] = 1; return { s: s, id: c.id };
  });
  var usedD = {}; W.found.forEach(function (f) { f.tokens.forEach(function (t) { var s = typeof t === 'string' ? t : t.s; if (Eq.isDigit(s)) usedD[s] = 1; }); });
  var newD = Eq.uniq(w.tokens.filter(function (s) { return Eq.isDigit(s) && !usedD[s]; })), info = Eq.wayKey(w.tokens, { fractions: P.fractions });
  var why = fresh ? 'This one uses <b>' + show(fresh) + '</b>, an operation none of your ways used. Next time, try it!'
    : info.helper ? 'Times 1 (or plus 0) keeps a number the same, so this is really just one cube with a helper. That counts as a way too!'
    : newD.length ? 'None of your ways used the <b>' + newD.join('</b> or the <b>') + '</b>. Every cube can open up a new way!'
    : 'It puts the cubes together in a different shape. Next time, try moving the ( ) around!';
  modal('<h2>💡 One you missed</h2>' + exprBox(toks, P.cubes) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(P.goal) + '</p><p style="text-align:center">' + why + '</p>' +
    '<p style="text-align:center;color:#6b7592">' + (miss.length > 1 ? 'There ' + (miss.length - 1 === 1 ? 'is 1 more' : 'are ' + (miss.length - 1) + ' more') + ' you didn\'t find.' : 'That was the last one!') + '</p>' +
    '<div class="row">' + (miss.length > 1 ? '<button class="btn" data-act="waysMissed">Show another</button>' : '') + '<button class="btn green big" data-act="waysAgain">Next puzzle ▶</button><button class="btn" data-act="closeModal">Close</button></div>', waysDrain);
};
