'use strict';
// ======================= BUILDER (tap-to-build expressions) =======================
var B = null;
function openGoalBuilder(pi, onDone, noCancel) {
  var pool = zoneCubes('resources').filter(function (c) { return !c.locked; }).map(function (c) { return c.id; });
  B = { kind: 'goal', pi: pi, tokens: [], pools: [{ label: '🎲 Resources', ids: pool }], cubes: G.cubes, onDone: onDone, noCancel: noCancel, fractions: G.fractions,
    title: (multiHuman() ? esc(G.players[pi].name) + ': ' : '') + 'Build the Goal 🎯', t0: Date.now() };
  renderBuilder(); $('#builder').classList.add('on');
}
function openSolutionBuilder(pi, mode, cb) {
  var pools = [{ label: '✅ Required (use them ALL)', ids: zoneCubes('required').map(function (c) { return c.id; }), req: true },
    { label: '👍 Permitted (use any)', ids: zoneCubes('permitted').map(function (c) { return c.id; }) }];
  if (mode === 'now') pools.push({ label: '🎲 Resources (you may add ONE)', ids: zoneCubes('resources').map(function (c) { return c.id; }), max: 1 });
  if (mode === 'impossible') pools.push({ label: '🎲 Resources (count as Permitted now)', ids: zoneCubes('resources').map(function (c) { return c.id; }) });
  if (mode === 'free') pools = [{ label: '🎲 Resources', ids: zoneCubes('resources').filter(function (c) { return !c.locked; }).map(function (c) { return c.id; }) }];
  pools.push({ label: '⛔ Forbidden (can\'t use)', ids: zoneCubes('forbidden').map(function (c) { return c.id; }), forb: true });
  var t0 = Date.now();
  var titles = { now: 'Now! Write your Solution', impossible: 'Prove it! Write a Solution', last: 'Last cube: write a Solution', free: 'Write a Solution' };
  B = { kind: 'solution', pi: pi, mode: mode, tokens: [], pools: pools, cubes: G.cubes, goal: G.goal, goalTokens: G.goalTokens, fractions: G.fractions,
    title: (multiHuman() ? esc(G.players[pi].name) + ': ' : '') + titles[mode] + ' ✏️', t0: Date.now(),
    onDone: function (tokens, gaveUp) {
      var chk = tokens ? Eq.checkSolution(tokens, solCtx(mode)) : null;
      var ok = !!(chk && chk.ok);
      if (pi === 0 && G.mode !== 'tutorial') recordSolution(chk, Date.now() - t0, tokens, mode, G.goal);
      if (G.mode === 'tutorial') { tutAfterSolution(ok, tokens, chk); return; }
      cb(ok, tokens, chk || { reasons: [gaveUp ? 'No Solution was written.' : 'No Solution.'] });
    } };
  renderBuilder(); $('#builder').classList.add('on');
}
function builderUsed() { var u = {}; B.tokens.forEach(function (t) { if (typeof t === 'object') u[t.id] = 1; }); return u; }
function renderBuilder() {
  var used = builderUsed(), cubes = B.cubes, live = '', liveCls = 'meh', checks = '';
  if (B.tokens.length) {
    if (B.kind === 'goal') {
      var g = Eq.checkGoal(B.tokens, B.fractions);
      if (g.ok) { live = '= ' + Eq.fmt(g.value); liveCls = 'good'; } else live = g.reasons[0];
    } else {
      var ev = Eq.evaluate(B.tokens, { fractions: B.fractions });
      if (ev.ok) { live = '= ' + Eq.fmt(ev.value) + (Eq.eqF(ev.value, B.goal) ? ' 🎯 matches the Goal!' : ''); liveCls = Eq.eqF(ev.value, B.goal) ? 'good' : ''; }
      else live = (ev.code === 'incomplete' || ev.code === 'paren') ? '…keep building' : ev.msg;
    }
  } else live = B.kind === 'goal' ? 'Tap cubes to build your Goal' : 'Tap cubes and ( ) to build a Solution';
  if (B.kind === 'solution') {
    var chk = Eq.checkSolution(B.tokens, solCtx(B.mode, B.goal, cubes, B.fractions)), R = chk.reasons.join(' ');
    var reqIds = cubes.filter(function (c) { return c.zone === 'required'; }).map(function (c) { return c.id; });
    var reqUsed = reqIds.filter(function (id) { return used[id]; }).length;
    var items = [[(chk.cubes || 0) >= 2, 'At least 2 cubes'], [reqUsed === reqIds.length, 'All Required used (' + reqUsed + '/' + reqIds.length + ')']];
    if (B.mode === 'now') items.push([(chk.resUsed || 0) <= 1, 'At most 1 Resource (' + (chk.resUsed || 0) + ')']);
    items.push([!/two-digit/.test(R), 'One-digit numbers only']);
    items.push([chk.value && Eq.eqF(chk.value, B.goal), 'Equals the Goal']);
    checks = '<div class="checks">' + items.map(function (x) { return '<span class="' + (x[0] ? 'y' : 'n') + '">' + (x[0] ? '✔' : '○') + ' ' + x[1] + '</span>'; }).join('') + '</div>';
  }
  var pools = B.pools.map(function (p) {
    if (!p.ids.length && !p.req) return '';
    var countUsed = p.ids.filter(function (id) { return used[id]; }).length, full = p.max && countUsed >= p.max;
    return '<div class="pool' + (p.forb ? ' forb' : '') + '"><h4>' + p.label + '</h4><div class="cubes">' +
      (p.ids.map(function (id) { var c = cubes[id]; return cubeHTML(c, 'mini' + (used[id] ? ' used' : '') + (p.forb ? '' : '') + (full && !used[id] ? ' used' : ''), '').replace('class="cube', p.forb ? 'class="cube' : 'data-act="bAdd" class="cube'); }).join('') || '<span style="color:#868e96">none</span>') + '</div></div>';
  }).join('');
  var goalLine = B.kind === 'solution' ? '<div class="b-goal">Goal: <span class="expr" style="padding:4px 8px">' + tokensHTML(B.goalTokens, cubes) + '</span> = ' + Eq.fmt(B.goal) + '</div>' : '';
  $('#builderBox').innerHTML = '<h2>' + B.title + '</h2>' + goalLine +
    '<div class="expr" id="bExpr" style="margin-top:8px">' + (B.tokens.length ? tokensHTML(B.tokens, cubes).replace(/data-bi=/g, 'data-act="bRemove" data-bi=') : '<span style="color:rgba(255,255,255,.7)">tap cubes below…</span>') + '</div>' +
    '<div class="b-live ' + liveCls + '">' + live + '</div>' + checks +
    '<div class="b-tools"><button class="btn" data-act="bParen" data-arg="(">(</button><button class="btn" data-act="bParen" data-arg=")">)</button><button class="btn" data-act="bBack">⌫</button><button class="btn small" data-act="bClear">Clear</button></div>' +
    pools +
    '<div class="row" style="margin-top:12px">' + (B.kind === 'goal' ? '<button class="btn big green" data-act="bSubmit">🎯 Set this Goal!</button>' + (B.noCancel ? '' : '<button class="btn" data-act="bCancel">Cancel</button>')
      : '<button class="btn big green" data-act="bSubmit">✅ Check my Solution!</button>' + (B.mode === 'daily' ? '<button class="btn" data-act="bCancel">Close</button>' : '<button class="btn" data-act="bGiveUp">🏳️ I can\'t find one</button>')) + '</div>' +
    '<p style="text-align:center;font-size:14px;color:#868e96;margin:6px 0 0">Tip: tap a cube in your expression to take it back out.</p>';
}
ACT.bAdd = function (el) {
  var id = +el.dataset.id; if (builderUsed()[id]) return;
  var pool = B.pools.find(function (p) { return p.ids.indexOf(id) >= 0; });
  if (!pool || pool.forb) return;
  if (pool.max) { var u = builderUsed(); if (pool.ids.filter(function (x) { return u[x]; }).length >= pool.max) { Snd.boop(); return; } }
  B.tokens.push({ s: B.cubes[id].s, id: id }); Snd.click(); renderBuilder();
};
ACT.bRemove = function (el) { var i = +el.dataset.bi; B.tokens.splice(i, 1); Snd.click(); renderBuilder(); };
ACT.bParen = function (el) { B.tokens.push(el.dataset.arg); Snd.click(); renderBuilder(); };
ACT.bBack = function () { B.tokens.pop(); Snd.click(); renderBuilder(); };
ACT.bClear = function () { B.tokens = []; renderBuilder(); };
ACT.bCancel = function () { $('#builder').classList.remove('on'); B = null; };
ACT.bGiveUp = function () { var b = B; $('#builder').classList.remove('on'); B = null; b.onDone(null, true); };
ACT.bSubmit = function () {
  var b = B;
  if (b.kind === 'goal') {
    var g = Eq.checkGoal(b.tokens, b.fractions);
    if (!g.ok) { Snd.boop(); $('#builderBox .b-live').textContent = g.reasons[0]; return; }
    if (G && G.mode === 'tutorial' && !tutGoalOK(b.tokens)) return;
    $('#builder').classList.remove('on'); B = null; b.onDone(b.tokens, g.value);
  } else {
    if (!b.tokens.length) { Snd.boop(); return; }
    $('#builder').classList.remove('on'); B = null; b.onDone(b.tokens.slice(), false);
  }
};

// Record a Solution attempt by the device owner: stats, XP, personal bests, badges.
function recordSolution(chk, ms, tokens, mode, goal) {
  var ok = !!(chk && chk.ok);
  S.stats.attempts++;
  S.history.push({ t: Date.now(), ok: ok, ms: ms, g: goal ? Eq.fmt(goal) : '', c: chk ? chk.cubes : 0 });
  if (S.history.length > 600) S.history.shift();
  if (!ok) { S.stats.streak = 0; S.stats.lastWrong = true; persist(); return; }
  S.stats.correct++; S.stats.streak++;
  var ops = [], hasZero = false;
  tokens.forEach(function (t) { if (typeof t === 'object') { if (!Eq.isDigit(t.s) && ops.indexOf(t.s) < 0) ops.push(t.s); if (t.s === '0') hasZero = true; } });
  ops.forEach(function (o) { if (!S.opsUsed[o]) addXP(20, 'First time using ' + show(o) + '!'); S.opsUsed[o] = (S.opsUsed[o] || 0) + 1; });
  addXP(20 + Math.min(30, 5 * Math.max(0, chk.cubes - 2)), 'Correct Solution (' + chk.cubes + ' cubes)');
  if (G && !G.hintUsed) addXP(10, 'No hint needed');
  if (mode === 'impossible') addXP(25, 'Proved it wasn\'t impossible!');
  var gAbs = Math.abs(goal.n / goal.d);
  if (S.best.fastMs && ms < S.best.fastMs) addXP(15, 'New fastest Solution! You\'re getting quicker!');
  if (!S.best.fastMs || ms < S.best.fastMs) S.best.fastMs = ms;
  if (S.best.hardGoal !== null && gAbs > S.best.hardGoal) addXP(15, 'Your biggest Goal ever!');
  if (S.best.hardGoal === null || gAbs > S.best.hardGoal) { S.best.hardGoal = gAbs; S.best.hardGoalText = Eq.fmt(goal); }
  if (S.best.mostCubes && chk.cubes > S.best.mostCubes) addXP(15, 'Your longest Solution ever!');
  if (chk.cubes > S.best.mostCubes) S.best.mostCubes = chk.cubes;
  if (chk.madeFraction) S.stats.fractionSolutions++;
  var bounce = S.stats.lastWrong; S.stats.lastWrong = false;
  addStar();
  checkBadges({ type: 'solution', ok: true, mode: mode, cubes: chk.cubes, ms: ms, ops: ops, goalAbs: gAbs, bounce: bounce, hasZero: hasZero });
  persist();
}
