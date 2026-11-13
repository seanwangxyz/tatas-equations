'use strict';
// ======================= TRAINING CAMP =======================
// Solo drills that teach the skills of the game. Every puzzle is made and checked by the solver,
// so the drills never run out. No timers, no streaks to lose. Each drill has levels 1-5:
// three right in a row moves up a level, two misses move down one.
var CAMP = null; // the drill on screen: {drill, P (position), ...}
var DRILLS = [
  { id: 'make', icon: 'pencil', name: 'Make the Goal', blurb: 'Build a Solution from the cubes.', color: '#d3f9d8' },
  { id: 'now', icon: 'bolt', name: 'Now or not yet?', blurb: 'Would calling Now! work?', color: '#fff3bf' },
  { id: 'imp', icon: 'ban', name: 'Impossible detective', blurb: 'Can the Goal still be made?', color: '#e5dbff' },
  { id: 'safe', icon: 'bulb', name: 'Safe move', blurb: 'Pick the move that keeps you safe.', color: '#d0ebff' },
  { id: 'goal', icon: 'target', name: 'Set a sneaky Goal', blurb: 'Choose a Goal that CAN be made.', color: '#ffe8cc' }
];
function campState(id) {
  if (!S.camp) S.camp = { quizRow: 0 };
  if (!S.camp[id]) S.camp[id] = { lvl: 1, row: 0, miss: 0, done: 0 };
  return S.camp[id];
}
function campResult(id, ok) {
  var c = campState(id), note = '';
  if (ok) { c.done++; c.row++; c.miss = 0; if (c.row >= 3 && c.lvl < 5) { c.lvl++; c.row = 0; note = 'Level up! This drill is now level ' + c.lvl + '.'; } }
  else { c.row = 0; c.miss++; if (c.miss >= 2 && c.lvl > 1) { c.lvl--; c.miss = 0; note = 'Let\'s practice a slightly easier one next.'; } }
  persist();
  return note;
}
// Yes/no and pick-one drills: 10 XP each, and a skill star for every 3 right in a row
// (so guessing can't unlock operations).
function campQuizReward(ok) {
  if (!S.camp) S.camp = { quizRow: 0 };
  if (!ok) { S.camp.quizRow = 0; return; }
  addXP(10, 'Training Camp');
  S.camp.quizRow = (S.camp.quizRow || 0) + 1;
  if (S.camp.quizRow >= 3) { S.camp.quizRow = 0; addStar(); xpLog.push('⭐ Skill star: 3 right in a row!'); }
}

// ----- Making positions -----
// Returns {cubes, goalTokens, goal, fractions} with cubes dealt into zones by `n` = {req, perm, res, forb}.
// Cubes not needed are zone 'out' (not shown, not usable).
function campDeal(rand, n, goalFilter) {
  var st = stageInfo();
  var cubes = Eq.roll(rand).map(function (c) { return { id: c.id, color: c.color, s: c.s, zone: 'out', order: c.id, locked: false }; });
  var free = cubes.filter(function (c) { return Eq.isDigit(c.s) || st.ops.indexOf(c.s) >= 0; });
  var ideas = Eq.goalIdeas(free.map(function (c) { return c.s; }), { fractions: st.fractions }).filter(function (g) { return g.value.d === 1 && g.value.n >= 2 && g.value.n <= st.maxGoal && (!goalFilter || goalFilter(g)); });
  if (!ideas.length) return null;
  var gi = ideas[Math.floor(rand() * ideas.length)], used = {};
  var gt = gi.tokens.map(function (s) { var c = free.find(function (x) { return x.s === s && !used[x.id]; }); used[c.id] = 1; c.zone = 'goal'; return { s: s, id: c.id }; });
  var rest = shuffle(free.filter(function (c) { return !used[c.id]; }), rand);
  // keep a healthy mix: roughly two digits for every operation
  var digs = rest.filter(function (c) { return Eq.isDigit(c.s); }), ops = rest.filter(function (c) { return !Eq.isDigit(c.s); }), mix = [];
  for (var mi = 0; digs.length || ops.length; mi++) { if (mi % 3 === 1 && ops.length) mix.push(ops.shift()); else if (digs.length) mix.push(digs.shift()); else mix.push(ops.shift()); } // digit, op, digit, digit, op, digit…
  var order = ['required', 'permitted', 'resources', 'forbidden'], counts = [n.req || 0, n.perm || 0, n.res || 0, n.forb || 0], k = 0, o = 0;
  order.forEach(function (z, zi) { for (var i = 0; i < counts[zi] && k < mix.length; i++) { mix[k].zone = z; mix[k].order = ++o; k++; } });
  return { cubes: cubes, goalTokens: gt, goal: gi.value, fractions: st.fractions };
}
function zsyms(P, z) { return P.cubes.filter(function (c) { return c.zone === z; }).map(function (c) { return c.s; }); }
function campSolve(P, mode) {
  return Eq.solve({ goal: P.goal, req: zsyms(P, 'required'), opt: zsyms(P, 'permitted'), res: zsyms(P, 'resources'), mode: mode, fractions: P.fractions, maxDigits: 6, timeMs: 700 });
}
function campRand() { return Eq.rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0); }

function makeDrill(id) {
  if (id === 'bonus') return window.Bonus ? Bonus.makeDrill(campState(id).lvl, campRand()) : null; // BONUS dice (house rule): Make the Goal with a bonus cube in Required
  var L = campState(id).lvl, rand = campRand(), P, t, target = rand() < 0.5; // target: the right answer we aim for in yes/no drills
  for (var tries = 0; tries < 60; tries++) {
    if (id === 'make') {
      P = campDeal(rand, { req: L >= 4 ? 2 : L >= 2 ? 1 : 0, perm: 4 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0), forb: L >= 3 ? 2 : 1 }, function (g) { return g.tokens.length >= (L >= 3 ? 2 : 1); });
      if (!P) continue;
      t = campSolve(P, 'free');
      if (t.found && t.tokens.filter(function (s) { return s !== '(' && s !== ')'; }).length >= 3) { P.sample = t.tokens; return { drill: id, P: P }; }
    } else if (id === 'now') {
      P = campDeal(rand, { req: L >= 3 ? 2 : 1, perm: 1 + (L >= 2 ? 1 : 0) + (L >= 4 ? 1 : 0), res: 3 + (L >= 5 ? 1 : 0) });
      if (!P) continue;
      t = campSolve(P, 'now');
      if (!t.found && !t.complete) continue;
      if (t.found !== target && tries < 55) continue;
      var later = t.found ? null : campSolve(P, 'impossible');
      return { drill: id, P: P, answer: t.found, sample: t.found ? t.tokens : (later && later.found ? later.tokens : null) };
    } else if (id === 'imp') {
      P = campDeal(rand, { req: 1 + (L >= 2 ? 1 : 0) + (L >= 4 ? 1 : 0), perm: 1 + (L >= 3 ? 1 : 0), res: 2 + (L >= 5 ? 1 : 0) });
      if (!P) continue;
      t = campSolve(P, 'impossible');
      if (!t.found && !t.complete) continue;
      if (t.found !== target && tries < 55) continue;
      return { drill: id, P: P, answer: t.found, sample: t.found ? t.tokens : null };
    } else if (id === 'safe') {
      P = campDeal(rand, { req: L >= 3 ? 1 : 0, perm: 1 + (L >= 4 ? 1 : 0), res: 4 + (L >= 2 ? 1 : 0) });
      if (!P) continue;
      var st = { req: zsyms(P, 'required'), perm: zsyms(P, 'permitted'), res: zsyms(P, 'resources') };
      var base = { goal: P.goal, fractions: P.fractions, maxDigits: 6, timeMs: 250 }, safe = [], bad = [], seen = {};
      P.cubes.filter(function (c) { return c.zone === 'resources'; }).forEach(function (c) {
        ['required', 'permitted', 'forbidden'].forEach(function (z) {
          if (seen[c.s + z]) return; seen[c.s + z] = 1;
          var a = applySym(st, c.s, z);
          var poss = Eq.solve(Object.assign({ req: a.req, opt: a.perm, res: a.res, mode: 'impossible' }, base));
          if (!poss.found) { if (poss.complete) bad.push({ id: c.id, s: c.s, zone: z, why: 'imp' }); return; }
          var nw = (a.req.length + a.perm.length) > 0 && a.res.length >= 2 ? Eq.solve(Object.assign({ req: a.req, opt: a.perm, res: a.res, mode: 'now' }, base)) : { found: false, complete: true };
          if (nw.found) bad.push({ id: c.id, s: c.s, zone: z, why: 'now', sol: nw.tokens });
          else if (nw.complete) safe.push({ id: c.id, s: c.s, zone: z });
        });
      });
      if (!safe.length || bad.length < 2) continue;
      var opts = shuffle([safe[Math.floor(rand() * safe.length)]].concat(shuffle(bad, rand).slice(0, 2)), rand);
      return { drill: id, P: P, options: opts };
    } else if (id === 'goal') {
      P = campDeal(rand, { res: 7 + L }, null);
      if (!P) continue;
      // nothing is pre-set: the Goal cubes go back into Resources for him to choose from
      P.cubes.forEach(function (c) { if (c.zone === 'goal') c.zone = 'resources'; });
      P.goalTokens = []; P.goal = null;
      return { drill: id, P: P };
    }
  }
  return null;
}

// ----- Screens -----
function matHTML(P) {
  function z(name) { return P.cubes.filter(function (c) { return c.zone === name; }).sort(function (a, b) { return a.order - b.order; }).map(function (c) { return cubeHTML(c, 'mini'); }).join('') || '<span class="empty">empty</span>'; }
  function has(name) { return P.cubes.some(function (c) { return c.zone === name; }); }
  return '<div class="mat" style="margin-top:10px">' +
    (P.goal ? '<div class="zone z-goal"><h3>🎯 GOAL <span class="gval">= ' + Eq.fmt(P.goal) + '</span></h3><div class="cubes">' + P.goalTokens.map(function (t) { return cubeHTML(P.cubes[t.id], 'mini'); }).join('') + '</div></div>' : '') +
    '<div class="zrow">' + (has('required') || has('permitted') || has('forbidden') ? '<div class="zone z-required"><h3>✅ REQUIRED <small>must use</small></h3><div class="cubes">' + z('required') + '</div></div>' +
    '<div class="zone z-permitted"><h3>👍 PERMITTED <small>may use</small></h3><div class="cubes">' + z('permitted') + '</div></div>' +
    (has('forbidden') ? '<div class="zone z-forbidden"><h3>⛔ FORBIDDEN <small>can\'t use</small></h3><div class="cubes">' + z('forbidden') + '</div></div>' : '') : '') + '</div>' +
    (has('resources') ? '<div class="zone z-res"><h3>🎲 RESOURCES <small>not played yet</small></h3><div class="cubes">' + z('resources') + '</div></div>' : '') + '</div>';
}
function campHdr(title) { return '<div class="hdr"><button class="btn small" data-act="camp">' + ico('back') + ' Camp</button><h2>' + title + '</h2></div>'; }
function coach(text, mood) { return '<div class="panel" style="background:rgba(255,253,246,.97)"><div class="row">' + pipHTML(mood || 'happy', 70, '') + '<div class="bubble">' + text + '</div></div></div>'; }

function renderCamp() {
  var st = stageInfo(), daily = S.dailyDone[today()];
  var cards = DRILLS.map(function (d) {
    var c = campState(d.id);
    return '<div class="opp mode" data-act="campDrill" data-arg="' + d.id + '"><span class="avatar lg" style="background:' + d.color + ';color:#1d2340;font-size:44px">' + ico(d.icon) + '</span><h3>' + d.name + '</h3><div class="otitle">' + d.blurb + '</div>' +
      '<div class="stars">' + '★'.repeat(c.lvl) + '<span style="opacity:.3">' + '★'.repeat(5 - c.lvl) + '</span></div><div class="otitle">Level ' + c.lvl + ' · ' + c.done + ' solved</div></div>';
  }).join('');
  $('#camp').innerHTML = '<div class="hdr"><button class="btn small" data-act="home">' + ico('back') + ' Back</button><h2>' + ico('cap') + ' Training Camp</h2></div>' +
    coach('Welcome to Training Camp! Pick a drill. Every one makes you better at the real game. Take as long as you like on each puzzle.') +
    '<div class="panel" style="margin-top:12px"><div style="font-weight:800;margin-bottom:10px">' + st.icon + ' Training with: ' + st.name +
    (ladderOff() || stageIdx() === STAGES.length - 1 ? '' : ' · ⭐ ' + S.ladder.stars + '/' + STAGES[S.ladder.stage].need + ' skill stars to unlock the next operation') + '</div>' +
    '<div class="opps">' + cards + (typeof waysTileHTML === 'function' ? waysTileHTML() : '') + (window.Bonus ? Bonus.campTileHTML() : '') + // (BONUS tile)
    '<div class="opp mode" data-act="daily"><span class="avatar lg" style="background:#ffd6d6;color:#1d2340;font-size:44px">' + ico('cal') + '</span><h3>Puzzles</h3><div class="otitle">A Daily Puzzle, then as many more as you like.</div><div class="otitle">' + (daily ? '✔ Daily solved · keep going!' : 'New today!') + '</div></div>' +
    '</div>' + (function () { var ls = window.Vari && Vari.unlocked ? Vari.unlocked().filter(function (c) { return c.lesson; }) : []; return ls.length ? '<h3 class="tierh">🃏 How my cards work</h3><div class="row" style="justify-content:flex-start;flex-wrap:wrap;gap:8px">' + ls.map(function (c) { return '<button class="btn" data-act="variLesson" data-arg="' + c.id + '">' + c.icon + ' ' + esc(c.name) + '</button>'; }).join('') + '</div>' : ''; })() + '</div>';
}
ACT.camp = function () { CAMP = null; renderCamp(); go('camp'); Snd.setMood('menu'); };
ACT.campDrill = function (el) { startDrill(el.dataset.arg); };
ACT.campNext = function () { closeModal(); };
function startDrill(id) {
  CAMP = makeDrill(id);
  if (!CAMP) { modal('<h2>Hmm!</h2><p style="text-align:center">I couldn\'t make a puzzle this time. Try again!</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>'); return; }
  CAMP.t0 = Date.now();
  renderDrill(); go('camp');
}
function renderDrill() {
  var d = DRILLS.filter(function (x) { return x.id === CAMP.drill; })[0] || (window.Bonus && Bonus.DRILL), c = campState(d.id), P = CAMP.P, q = '', btns = ''; // (BONUS: its own drill)
  if (d.id === 'bonus') { q = Bonus.drillPrompt(CAMP); btns = '<button class="btn big green" data-act="campSolve">' + ico('pencil') + ' Build my Solution</button><button class="btn" data-act="campShow">Show me one</button><button class="btn" data-act="bonusLesson" data-arg="' + (CAMP.die === 'power' ? CAMP.face : 'big') + '">How it works</button>'; }
  if (d.id === 'make') { q = 'Make the Goal! Use <b>every Required cube</b> and any Permitted cubes you like.'; btns = '<button class="btn big green" data-act="campSolve">' + ico('pencil') + ' Build my Solution</button><button class="btn" data-act="campShow">Show me one</button>'; }
  if (d.id === 'now') { q = 'It\'s your turn. Would calling <b>Now!</b> work? (Now! means: a Solution using every Required cube, any Permitted cubes, and <b>at most ONE</b> cube from Resources.)'; btns = '<button class="btn big now" data-act="campAnswer" data-arg="1">' + ico('bolt') + ' Yes, call Now!</button><button class="btn big" data-act="campAnswer" data-arg="0">Not yet</button>'; }
  if (d.id === 'imp') { q = 'Be the detective: can the Goal <b>still be made</b>? Every Required cube must be used. Permitted and Resource cubes may all be used.'; btns = '<button class="btn big green" data-act="campAnswer" data-arg="1">' + ico('check') + ' It can be made</button><button class="btn big imp" data-act="campAnswer" data-arg="0">' + ico('ban') + ' Impossible!</button>'; }
  if (d.id === 'safe') { q = 'Your move! Two of these moves are mistakes: they let the other player win a challenge. <b>Pick the safe one.</b>'; btns = CAMP.options.map(function (o, i) { return '<button class="btn" data-act="campPick" data-arg="' + i + '">Move ' + tokensHTML([{ s: o.s, id: o.id }], P.cubes, 'tiny') + ' to <b>' + { required: 'Required', permitted: 'Permitted', forbidden: 'Forbidden' }[o.zone] + '</b></button>'; }).join(''); }
  if (d.id === 'goal') { q = 'You rolled these cubes. Set a Goal that <b>can be made</b> from the cubes left over. Sneaky Goals that need lots of cubes are the best!'; btns = '<button class="btn big green" data-act="campGoal">' + ico('target') + ' Build a Goal</button>'; }
  $('#camp').innerHTML = campHdr(ico(d.icon) + ' ' + d.name + ' <small style="font-size:16px;opacity:.85">Level ' + c.lvl + '</small>') + coach(q, 'think') + matHTML(P) +
    '<div class="row" style="margin-top:14px">' + btns + '</div>';
}
function campDone(ok, title, bodyHTML) {
  if (window.Parent && CAMP && CAMP.drill !== 'make' && CAMP.drill !== 'bonus') Parent.note('drill', { id: CAMP.drill, ok: ok }); // PARENT page (make/bonus come through recordSolution)
  var note = campResult(CAMP.drill, ok), id = CAMP.drill;
  if (ok) { Snd.chime(); FX.confetti(50); } else Snd.boop();
  checkBadges({ type: 'camp' });
  modal('<h2>' + title + '</h2>' + bodyHTML + (note ? '<p style="text-align:center;font-weight:800">' + note + '</p>' : '') +
    (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '') +
    '<div class="row" style="margin-top:12px"><button class="btn green big" data-act="closeModal">Next one ▶</button><button class="btn" data-act="campBack">Back to camp</button></div>',
    function () { drainQueue(function () { if (current !== 'camp') return; if (CAMP) startDrill(id); else renderCamp(); }); });
}
ACT.campBack = function () { CAMP = null; closeModal(); };
function solShow(tokens, P, label) { return tokens ? '<p><b>' + label + '</b></p>' + exprBox(tokens, P.cubes) + '<p style="text-align:center;font-weight:800">= ' + Eq.fmt(P.goal) + '</p>' : ''; }

// yes / no drills
ACT.campAnswer = function (el) {
  if (!CAMP || CAMP.answered) return; CAMP.answered = true;
  var said = el.dataset.arg === '1', ok = said === CAMP.answer, P = CAMP.P, body;
  xpLog = []; campQuizReward(ok);
  if (CAMP.drill === 'now') {
    body = CAMP.answer ? '<p>Now! <b>works</b> here.</p>' + solShow(CAMP.sample, P, 'This Solution uses at most one Resource cube:')
      : '<p>Now! would <b>not</b> work yet: every Solution needs more than one cube from Resources.</p>' + (CAMP.sample ? solShow(CAMP.sample, P, 'It can be made later, for example:') : '<p>In fact, this Goal can\'t be made at all with these cubes!</p>');
  } else {
    body = CAMP.answer ? '<p>The Goal <b>can</b> be made.</p>' + solShow(CAMP.sample, P, 'Here is one way:')
      : '<p>It really is <b>impossible</b>. I tried every way of using the Required cube' + (zsyms(P, 'required').length > 1 ? 's' : '') + ' with the others, and none equals ' + Eq.fmt(P.goal) + '.</p>';
  }
  campDone(ok, ok ? '🎯 Exactly right!' : '🤔 Not this time', body);
};
// safe move
ACT.campPick = function (el) {
  if (!CAMP || CAMP.answered) return; CAMP.answered = true;
  var o = CAMP.options[+el.dataset.arg], ok = !o.why, P = CAMP.P, body = '';
  xpLog = []; campQuizReward(ok);
  var zn = { required: 'Required', permitted: 'Permitted', forbidden: 'Forbidden' };
  if (ok) body = '<p>Moving ' + show(o.s) + ' to ' + zn[o.zone] + ' is <b>safe</b>: the Goal can still be made, and nobody can call Now! yet.</p>';
  else if (o.why === 'now') body = '<p>After ' + show(o.s) + ' goes to ' + zn[o.zone] + ', the other player can call <b>Now!</b> with this:</p>' + exprBox(o.sol) + '<p style="text-align:center;font-weight:800">= ' + Eq.fmt(P.goal) + '</p>';
  else body = '<p>After ' + show(o.s) + ' goes to ' + zn[o.zone] + ', the Goal <b>can\'t be made</b> any more, so the other player calls Impossible! and wins.</p>';
  var good = CAMP.options.filter(function (x) { return !x.why; })[0];
  if (!ok && good) body += '<p>The safe move was <b>' + show(good.s) + ' to ' + zn[good.zone] + '</b>.</p>';
  campDone(ok, ok ? '🛡️ Safe move!' : '🤔 That one was a trap', body);
};
// make the goal
function campBuilder(kind, onDone) {
  var P = CAMP.P, ids = function (z) { return P.cubes.filter(function (c) { return c.zone === z; }).map(function (c) { return c.id; }); };
  if (kind === 'goal') B = { kind: 'goal', tokens: [], pools: [{ label: '🎲 Resources', ids: ids('resources') }], cubes: P.cubes, fractions: P.fractions, title: 'Build a Goal', onDone: onDone };
  else B = { kind: 'solution', mode: 'daily', tokens: [], pools: [{ label: '✅ Required (use them ALL)', ids: ids('required'), req: true }, { label: '👍 Permitted (use any)', ids: ids('permitted') }, { label: '⛔ Forbidden (can\'t use)', ids: ids('forbidden'), forb: true }],
    cubes: P.cubes, goal: P.goal, goalTokens: P.goalTokens, fractions: P.fractions, title: 'Make the Goal', onDone: onDone };
  renderBuilder(); $('#builder').classList.add('on');
}
ACT.campSolve = function () {
  var P = CAMP.P;
  campBuilder('solution', function (tokens) {
    if (!tokens) return;
    var chk = Eq.checkSolution(tokens, { goal: P.goal, zone: function (id) { return P.cubes[id].zone; }, required: P.cubes.filter(function (c) { return c.zone === 'required'; }).map(function (c) { return c.id; }), mode: 'daily', fractions: P.fractions, label: function (id) { return show(P.cubes[id].s); } });
    xpLog = [];
    var gSave = G; G = null;
    if (!CAMP.shown) recordSolution(chk, Date.now() - CAMP.t0, tokens, 'camp', P.goal);
    G = gSave;
    if (chk.ok) campDone(true, '🎉 You made it!', exprBox(tokens, P.cubes) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(P.goal) + '</p>');
    else { Snd.boop(); modal('<h2>🤔 Not quite!</h2>' + exprBox(tokens, P.cubes) + '<p>Here\'s why:</p><ul class="reasons">' + chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul><p style="text-align:center">Try again. There\'s no rush!</p><div class="row"><button class="btn green" data-act="closeModal">Try again</button></div>'); }
  });
};
ACT.campShow = function () {
  CAMP.shown = true; // peeking is fine, it just doesn't count for stars
  modal('<h2>💡 One way to do it</h2>' + exprBox(CAMP.P.sample) + '<p style="text-align:center;font-size:22px;font-weight:900">= ' + Eq.fmt(CAMP.P.goal) + '</p><p style="text-align:center">Can you find a different one?</p><div class="row"><button class="btn green" data-act="closeModal">OK</button></div>');
};
// set a sneaky goal
ACT.campGoal = function () {
  var P = CAMP.P;
  campBuilder('goal', function (tokens, val) {
    var usedIds = {}; tokens.forEach(function (t) { if (typeof t === 'object') usedIds[t.id] = 1; });
    var rest = P.cubes.filter(function (c) { return c.zone === 'resources' && !usedIds[c.id]; }).map(function (c) { return c.s; });
    var r = Eq.solve({ goal: val, req: [], opt: rest, mode: 'free', fractions: P.fractions, maxDigits: 6, timeMs: 900 });
    xpLog = [];
    P.goal = val; P.goalTokens = tokens;
    if (r.found) {
      var n = r.tokens.filter(function (s) { return s !== '(' && s !== ')'; }).length;
      addXP(15 + Math.min(15, 5 * Math.max(0, n - 3)), 'A Goal that can be made');
      campQuizReward(true);
      campDone(true, n >= 5 ? '🦊 Very sneaky Goal!' : '🎯 Good Goal!', '<p>Your Goal <b>' + Eq.fmt(val) + '</b> can be made. The shortest way I found uses ' + n + ' cubes:</p>' + exprBox(r.tokens) + (n >= 5 ? '<p style="text-align:center">That\'s hard to spot. Nice!</p>' : '<p style="text-align:center">Tip: Goals that need more cubes are harder for the other player.</p>'));
    } else {
      campQuizReward(false);
      campDone(false, '🤔 Careful!', '<p>I couldn\'t find any way to make <b>' + Eq.fmt(val) + '</b> from the cubes that are left, so the other player would call <b>Impossible!</b> and win.</p><p style="text-align:center">Try a Goal you can already see a Solution for.</p>');
    }
  });
};
