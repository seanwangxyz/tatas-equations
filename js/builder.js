'use strict';
// ======================= BUILDER (tap-to-build expressions) =======================
var B = null;
function openGoalBuilder(pi, onDone, noCancel) {
  if (pi === 0 && typeof playerMood === 'function') playerMood('think');
  if (Snd.getMood && Snd.getMood() === 'play') Snd.setMood('think'); // calmer music while he works it out
  var pool = zoneCubes('resources').filter(function (c) { return !c.locked; }).map(function (c) { return c.id; });
  B = { kind: 'goal', pi: pi, tokens: [], pools: [{ label: '🎲 Resources', ids: pool }], cubes: G.cubes, onDone: onDone, noCancel: noCancel, fractions: G.fractions,
    title: (multiHuman() ? esc(G.players[pi].name) + ': ' : '') + 'Build the Goal', t0: Date.now() };
  renderBuilder(); $('#builder').classList.add('on');
}
function openSolutionBuilder(pi, mode, cb) {
  if (pi === 0 && typeof playerMood === 'function') playerMood('think');
  if (Snd.getMood && Snd.getMood() !== 'off') Snd.setMood('think');
  var pools = [{ label: '✅ Required (use them ALL)', ids: zoneCubes('required').map(function (c) { return c.id; }), req: true },
    { label: '👍 Permitted (use any)', ids: zoneCubes('permitted').map(function (c) { return c.id; }) }];
  if (mode === 'now') pools.push({ label: '🎲 Resources (you may add ONE)', ids: zoneCubes('resources').map(function (c) { return c.id; }), max: 1 });
  if (mode === 'impossible') pools.push({ label: '🎲 Resources (count as Permitted now)', ids: zoneCubes('resources').map(function (c) { return c.id; }) });
  if (mode === 'free') pools = [{ label: '🎲 Resources', ids: zoneCubes('resources').filter(function (c) { return !c.locked; }).map(function (c) { return c.id; }) }];
  pools.push({ label: '⛔ Forbidden (can\'t use)', ids: zoneCubes('forbidden').map(function (c) { return c.id; }), forb: true });
  var t0 = Date.now();
  var titles = { now: 'Now! Write your Solution', impossible: 'Prove it! Write a Solution', last: 'Last cube: write a Solution', free: 'Write a Solution' };
  B = { kind: 'solution', pi: pi, mode: mode, tokens: [], pools: pools, cubes: G.cubes, goal: G.goal, goalTokens: G.goalTokens, fractions: G.fractions,
    title: (multiHuman() ? esc(G.players[pi].name) + ': ' : '') + titles[mode] + '', t0: Date.now(),
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
  var RU = Eq.rulesOf(B.fractions); // a variation card in play? (js/variations.js; plain true/false = none)
  var chk = B.kind === 'solution' ? Eq.checkSolution(B.tokens, solCtx(B.mode, B.goal, cubes, B.fractions)) : null;
  if (B.tokens.length) {
    if (B.kind === 'goal') {
      var g = Eq.checkGoal(B.tokens, B.fractions);
      if (g.ok) {
        live = '= ' + Eq.fmt(g.value); liveCls = 'good';
        if (g.wildValues) { var w0 = Object.keys(g.wildValues)[0]; live += ' when the 0 means ' + w0 + '. The 0 is wild, so it can mean another digit too!'; }
      } else live = g.reasons[0];
    } else {
      var ev = Eq.evaluate(B.tokens, { fractions: B.fractions });
      if (chk.equal && RU.multk) { live = '= ' + Eq.fmt(chk.value) + ': that is ' + Eq.fmt(Eq.opCore('-', chk.value, B.goal, true)).replace('−', '') + ' away from the Goal, a multiple of ' + RU.k + '. It counts!'; liveCls = 'good'; }
      else if (chk.equal) { live = '= ' + Eq.fmt(chk.value) + (chk.wildAs ? ' (with the 0 meaning ' + chk.wildAs + ')' : '') + ' matches the Goal!'; liveCls = 'good'; }
      else if (ev.ok && RU.multk && Eq.eqF(ev.value, B.goal)) { live = '= ' + Eq.fmt(ev.value) + ': exactly the Goal. With this card it must miss by ' + RU.k + ', ' + (2 * RU.k) + ', ' + (3 * RU.k) + '…'; liveCls = ''; }
      else if (ev.ok) { live = '= ' + Eq.fmt(ev.value) + (RU.wild && B.tokens.some(function (t) { return t.s === '0'; }) ? ' when the 0 means 0. No digit for the 0 makes it match yet.' : ''); liveCls = ''; }
      else live = (ev.code === 'incomplete' || ev.code === 'paren') ? '…keep building' : ev.msg;
    }
  } else live = B.kind === 'goal' ? 'Tap cubes to build your Goal' : 'Tap cubes and ( ) to build a Solution';
  if (B.kind === 'solution') {
    var R = chk.reasons.join(' ');
    var reqIds = cubes.filter(function (c) { return c.zone === 'required'; }).map(function (c) { return c.id; });
    var reqUsed = reqIds.filter(function (id) { return used[id]; }).length;
    var items = [[(chk.cubes || 0) >= 2, 'At least 2 cubes']];
    if (reqIds.length) items.push([reqUsed === reqIds.length, 'All Required used (' + reqUsed + '/' + reqIds.length + ')']);
    if (B.mode === 'now') items.push([(chk.resUsed || 0) <= 1, 'At most 1 Resource (' + (chk.resUsed || 0) + ')']);
    if (RU.two || RU.basem) items.push([!/three-digit/.test(R), 'Numbers up to two digits']);
    else if (RU.pct) items.push([!/two digits|two-digit|three-digit/.test(R), 'Two digits only next to %']);
    else if (RU.dec) items.push([!/two-digit|three-digit|at most three digits|one decimal point/.test(R), 'One digit, or up to 3 with a point']);
    else items.push([!/two-digit/.test(R), 'One-digit numbers only']);
    if (RU.basem) items.push([!/In base/.test(R), 'Base ' + RU.base + ' digits only (0 to ' + (RU.base - 1) + ')']);
    if (RU.three) items.push([(chk.ops || 0) >= 3, 'At least 3 operation signs (' + (chk.ops || 0) + ')']);
    if (RU.fact) { var bu = Eq.bangsIn(B.tokens), ba = 2 - Eq.bangsIn(B.goalTokens); items.push([bu <= ba, '! signs: ' + bu + ' of ' + ba]); }
    items.push([!!chk.equal, RU.multk ? 'Misses the Goal by a multiple of ' + RU.k : 'Equals the Goal']);
    checks = '<div class="checks">' + items.map(function (x) { return '<span class="' + (x[0] ? 'y' : 'n') + '">' + (x[0] ? '✔' : '○') + ' ' + x[1] + '</span>'; }).join('') + '</div>';
  }
  var pools = B.pools.map(function (p) {
    if (!p.ids.length && !p.req) return '';
    var countUsed = p.ids.filter(function (id) { return used[id]; }).length, full = p.max && countUsed >= p.max;
    return '<div class="pool' + (p.forb ? ' forb' : '') + '"><h4>' + p.label + '</h4><div class="cubes">' +
      (p.ids.map(function (id) { var c = cubes[id], again = reusable(c); return cubeHTML(c, 'mini' + (used[id] && !again ? ' used' : '') + (used[id] && again ? ' again' : '') + (full && !used[id] ? ' used' : ''), '').replace('class="cube', p.forb ? 'class="cube' : 'data-act="bAdd" class="cube'); }).join('') || '<span style="color:#868e96">none</span>') + '</div></div>';
  }).join('');
  var gZero = RU.wild && B.goalTokens && B.goalTokens.some(function (t) { return (typeof t === 'string' ? t : t.s) === '0'; });
  var mid = window.Vari && midCard(RU), turnable = mid && B.tokens.some(function (t, i) { return canCycle(i); });
  var goalLine = B.kind === 'solution' ? '<div class="b-goal">' + ico('target') + ' Goal: <span class="expr" style="padding:4px 8px">' + (mid ? Vari.exprHTML(B.goalTokens, cubes, B.fractions) : tokensHTML(B.goalTokens, cubes)) + '</span> = ' + Eq.fmt(B.goal) + (gZero ? ' <small>(when the 0 means 0: the 0 is wild!)</small>' : '') + (RU.basem ? ' <small>(counted in tens)</small>' : '') + '</div>' : '';
  var side = B.kind === 'solution' && RU.rem ? '<button class="btn small" data-act="bSide" title="Remainder card: turn the last ÷ sideways">↪ Turn ÷ sideways</button>' : '';
  var bang = RU.fact ? '<button class="btn" data-act="bBang" title="Factorial card: two ! signs for the whole Equation">!</button>' : '';
  var exprIn = !B.tokens.length ? '<span style="color:rgba(255,255,255,.7)">tap cubes below…</span>'
    : mid ? Vari.exprHTML(B.tokens, cubes, B.fractions, function (i) { return canCycle(i) ? 'data-act="bCycle"' : 'data-act="bRemove"'; }, canCycle)
    : tokensHTML(B.tokens, cubes).replace(/data-bi=/g, 'data-act="bRemove" data-bi=');
  $('#builderBox').innerHTML = '<h2>' + B.title + '</h2>' + (window.Vari ? Vari.builderNote(B.fractions) : '') + (window.Bonus ? Bonus.builderNote(B) : '') + goalLine + // (BONUS: what a bonus cube means)
    '<div class="expr' + (mid ? ' vari-expr' : '') + '" id="bExpr" style="margin-top:8px">' + exprIn + '</div>' +
    '<div class="b-live ' + liveCls + '">' + live + '</div>' + checks +
    '<div class="b-tools"><button class="btn" data-act="bParen" data-arg="(">(</button><button class="btn" data-act="bParen" data-arg=")">)</button>' + bang + '<button class="btn" data-act="bBack">⌫</button><button class="btn small" data-act="bClear">Clear</button>' + side + '</div>' +
    pools +
    '<div class="row" style="margin-top:12px">' + (B.kind === 'goal' ? '<button class="btn big green" data-act="bSubmit">' + ico('target') + ' Set this Goal!</button>' + (B.noCancel ? '' : '<button class="btn" data-act="bCancel">Cancel</button>')
      : '<button class="btn big green" data-act="bSubmit">' + ico('check') + ' Check my Solution!</button>' + (B.mode === 'daily' ? '<button class="btn" data-act="bCancel">Close</button>' : '<button class="btn" data-act="bGiveUp">I can\'t find one</button>')) + '</div>' +
    '<p style="text-align:center;font-size:14px;color:#868e96;margin:6px 0 0">' + (turnable ? 'Tip: tap a cube with ✕ to turn it or change what it means; the ✕ takes it back out. Tap any other cube to take it out.' : 'Tip: tap a cube in your expression to take it back out.') + '</p>';
}
// ---- Middle-tier variation cards (js/variations.js, RULES_SUMMARY.md section 6) ----
function midCard(RU) { return RU.ud || RU.sw || RU.avg || RU.expo || RU.multk || RU.pob || RU.fact || RU.nfac || RU.sprime || RU.lcm || RU.gcf || RU.pct || RU.dec || RU.basem; }
// What a placed cube may mean with the card in play, in tap order (the first is how the cube was placed):
// a number cube upright / upside-down / sideways, a 1 as 10, 100, 1000, 0.1, 0.01, 0.001, an exponent-colour
// digit as an exponent, √ as root / LCM / percent, ^ as power / GCF / decimal point. (+ is always an
// average with that card, and a × is read by its place, so those two never need tapping.)
function cycleOf(t) {
  if (!t || typeof t !== 'object') return [];
  var RU = Eq.rulesOf(B.fractions), c = B.cubes[t.id], face = c ? c.s : Eq.cubeOf(t.s);
  if (Eq.isDigit(face)) {
    var d = +face, list = [face];
    if (RU.ud && d) list.push(Eq.UD[d]);
    if (RU.sw && d && RU.fr) list.push(Eq.SW[d]);
    if (RU.pob && face === '1') list = list.concat(['T', 'H', 'K', 't', 'h', 'k'].filter(function (k) { return RU.fr || Eq.POB[k] > 0; }));
    if (RU.expo && RU.eids && RU.eids.indexOf(t.id) >= 0) list.push(Eq.EX[d]);
    return list;
  }
  if (face === 'r') return RU.lcm ? ['r', 'l'] : RU.pct ? ['r', '%'] : ['r'];
  if (face === '^') return RU.gcf ? ['^', 'g'] : RU.dec ? ['^', '.'] : ['^'];
  return [t.s];
}
function canCycle(i) { return cycleOf(B.tokens[i]).length > 1; }
ACT.bCycle = function (el) {
  var i = +el.dataset.bi, t = B.tokens[i], list = cycleOf(t);
  if (list.length < 2) { ACT.bRemove(el); return; }
  var k = list.indexOf(t.s);
  B.tokens[i] = { s: list[(k + 1) % list.length], id: t.id };
  Snd.click(); renderBuilder();
};
// Factorial card: a ! sign (written in, not a cube). Two for the whole Equation (Goal and Solution together).
ACT.bBang = function () {
  var allowed = 2 - (B.kind === 'solution' ? Eq.bangsIn(B.goalTokens) : 0);
  if (Eq.bangsIn(B.tokens) >= allowed) { Snd.boop(); var el = $('#builderBox .b-live'); if (el) el.textContent = allowed > 0 ? 'Only ' + allowed + ' ! sign' + (allowed > 1 ? 's' : '') + ' for this ' + (B.kind === 'goal' ? 'Goal' : 'Solution') + '.' : 'The Goal already used both ! signs.'; return; }
  B.tokens.push('!'); Snd.click(); renderBuilder();
};
// How a freshly tapped cube goes in: with Average a + is always the average; with an exponent colour, a
// digit of that colour tapped right after a number in a Solution goes in as its exponent (a Solution can't
// glue two digits, so that is the only thing it can mean there; tap it to bring it back down).
function addSym(c) {
  var RU = Eq.rulesOf(B.fractions), s = c.s;
  if (RU.avg && s === '+') return 'a';
  if (RU.expo && B.kind === 'solution' && Eq.isDigit(s) && RU.eids && RU.eids.indexOf(c.id) >= 0 && !RU.two && !RU.basem) {
    var prev = B.tokens.length ? B.tokens[B.tokens.length - 1] : null, ps = prev === null ? null : (typeof prev === 'string' ? prev : prev.s);
    if (ps !== null && (Eq.isNumSym(ps) || ps === ')' || ps === '!' || Eq.exOf(ps) >= 0 || (Eq.OPDEF[ps] && Eq.OPDEF[ps].kind === 'post'))) return Eq.EX[+s]; // (BONUS: + x², x³, n!)
  }
  return s;
}
// Multiple Operations card: an operation cube in a Solution may be tapped again (the cube stays bright).
function reusable(c) { return !!B && B.kind === 'solution' && Eq.rulesOf(B.fractions).multi && !Eq.isDigit(c.s); }
ACT.bAdd = function (el) {
  var id = +el.dataset.id, u = builderUsed();
  if (u[id] && !reusable(B.cubes[id])) return;
  var pool = B.pools.find(function (p) { return p.ids.indexOf(id) >= 0; });
  if (!pool || pool.forb) return;
  if (pool.max && !u[id]) { if (pool.ids.filter(function (x) { return u[x]; }).length >= pool.max) { Snd.boop(); return; } }
  B.tokens.push({ s: addSym(B.cubes[id]), id: id }); Snd.click(); renderBuilder();
};
// Remainder card: turn the last ÷ in the Solution sideways (÷ <-> rem), or back again.
ACT.bSide = function () {
  for (var i = B.tokens.length - 1; i >= 0; i--) {
    var t = B.tokens[i];
    if (typeof t === 'object' && (t.s === '/' || t.s === 'm')) { B.tokens[i] = { s: t.s === '/' ? 'm' : '/', id: t.id }; Snd.click(); renderBuilder(); return; }
  }
  Snd.boop(); var el = $('#builderBox .b-live'); if (el) el.textContent = 'Put a ÷ cube in your Solution first, then turn it sideways.';
};
ACT.bRemove = function (el) { var i = +el.dataset.bi; B.tokens.splice(i, 1); Snd.click(); renderBuilder(); };
ACT.bParen = function (el) { B.tokens.push(el.dataset.arg); Snd.click(); renderBuilder(); };
ACT.bBack = function () { B.tokens.pop(); Snd.click(); renderBuilder(); };
ACT.bClear = function () { B.tokens = []; renderBuilder(); };
ACT.bCancel = function () { if (typeof playerMood === 'function') playerMood(null); $('#builder').classList.remove('on'); B = null; };
ACT.bGiveUp = function () { if (typeof playerMood === 'function') playerMood(null); var b = B; $('#builder').classList.remove('on'); B = null; b.onDone(null, true); };
ACT.bSubmit = function () { if (typeof playerMood === 'function') playerMood(null);
  var b = B;
  if (b.kind === 'goal') {
    var g = Eq.checkGoal(b.tokens, b.fractions);
    if (!g.ok) { Snd.boop(); $('#builderBox .b-live').textContent = g.reasons[0]; return; }
    if (G && G.mode === 'tutorial' && !tutGoalOK(b.tokens)) return;
    $('#builder').classList.remove('on'); B = null; b.onDone(Eq.resolve(b.tokens, b.fractions), g.value); // (explicit symbols: an average, a × used for # factors)
  } else {
    if (!b.tokens.length) { Snd.boop(); return; }
    $('#builder').classList.remove('on'); B = null; b.onDone(Eq.resolve(b.tokens, b.fractions), false);
  }
};

// Record a Solution attempt by the device owner: stats, XP, personal bests, badges.
function recordSolution(chk, ms, tokens, mode, goal, noStar) {
  var ok = !!(chk && chk.ok);
  if (window.Parent) Parent.note('solution', { chk: chk, ms: ms, tokens: tokens, mode: mode, goal: goal }); // PARENT page
  S.stats.attempts++;
  S.history.push({ t: Date.now(), ok: ok, ms: ms, g: goal ? Eq.fmt(goal) : '', c: chk ? chk.cubes : 0 });
  if (S.history.length > 600) S.history.shift();
  if (!ok) { S.stats.streak = 0; S.stats.lastWrong = true; persist(); return; }
  S.stats.correct++; S.stats.streak++;
  var ops = [], hasZero = false;
  // (a variation card's symbols count as the cube they use: an average is a +, a turned 3 is a 3)
  tokens.forEach(function (t) { if (typeof t === 'object') { var cs = Eq.cubeOf(t.s) || t.s; if (!Eq.isDigit(cs) && ops.indexOf(cs) < 0) ops.push(cs); if (cs === '0') hasZero = true; } });
  ops.forEach(function (o) { if (!S.opsUsed[o]) addXP(20, 'First time using ' + (Eq.isBonusOp && Eq.isBonusOp(o) ? 'the gold ' + show(o) + ' cube' : show(o)) + '!'); S.opsUsed[o] = (S.opsUsed[o] || 0) + 1; }); // (BONUS: names a gold cube)
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
  if (!noStar) addStar(); // (a daily puzzle already solved today earns no second star)
  checkBadges({ type: 'solution', ok: true, mode: mode, cubes: chk.cubes, ms: ms, ops: ops, goalAbs: gAbs, bounce: bounce, hasZero: hasZero });
  persist();
}
