'use strict';
// ======================= COMPUTER PLAYER: DECISIONS =======================
// Everything the computer player decides, as plain functions of the mat (no G, no screen).
// The same file loads in three places, so they can never drift apart:
//   - the page (index.html), where AIThink below runs these in a Web Worker so the picture never freezes;
//   - the Web Worker itself (js/ai-worker.js loads engine.js + this file);
//   - node, for tests/playtest.js.
// Needs only Eq (js/engine.js).
//
// Shapes used below:
//   o   = a creature's skill (an OPPONENTS entry from js/config.js, or AI.skill(o) of one)
//   st  = { req: [symbols], perm: [symbols], res: [symbols] }   (what is on the mat)
//   res = [{ id, s }]  the Resource cubes the creature may move (locked ones are already in Forbidden)
//
// MATH TASTES (o.likes, set per creature in js/config.js). A taste only ever chooses BETWEEN moves,
// Goals and Solutions the creature already found with its normal skill: it never makes it miss
// something and never makes it see further. A taste for a symbol shows only when that cube is on
// the table, so locked operations (still in Forbidden) never show up.
//   likes.syms  = cubes it likes to put in Required / Permitted (and keeps out of Forbidden)
//   likes.goal  = what Goals it prefers: 'small' | 'prime' | 'even' | 'big' | 'square' | 'pow' | 'div' | 'long'
//   likes.ops   = operations whose Goals it likes (a Goal that uses one, or one it can reach with one)
//   likes.sol   = sets of symbols it tries to work into its Solutions, in order (e.g. [['*','+'], ['*']])
//   likes.mix   = true: tries Solutions that mix two different operations (Zog)
var AI = (function () {
  var VERSION = 3; // bump when the messages between the page and the worker change

  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function assign(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function has(list, s) { return !!list && list.indexOf(s) >= 0; }

  // Only the fields the decisions read (a creature's talk lines stay on the page).
  var FIELDS = ['name', 'maxDigits', 'timeMs', 'seeNow', 'seeImp', 'smart', 'shortView', 'callsImpossible', 'keepGoal', 'goalCubes', 'goalMax', 'likes'];
  function skill(o) { var s = {}; FIELDS.forEach(function (k) { if (o[k] !== undefined) s[k] = o[k]; }); return s; }
  // The same creature with no tastes (Pip's hints use a creature's eye but should not have its taste).
  function plain(o) { return assign(o, { likes: null }); }

  // How long a Solution a creature can think about when WRITING or checking an opponent's move.
  // Normal creatures can stretch one number cube past what they notice; a shortView creature cannot.
  function viewDigits(o) { return o.shortView ? o.maxDigits : Math.min(6, o.maxDigits + 1); }
  // How long a Solution it looks for when choosing a Goal (shortView creatures set Goals they can solve themselves).
  function goalDigits(o) { return o.shortView ? o.maxDigits : 3; }

  function applySym(st, s, zone) {
    var res = st.res.slice(), i = res.indexOf(s); res.splice(i, 1);
    var o = { req: st.req.slice(), perm: st.perm.slice(), res: res };
    if (zone === 'required') o.req.push(s); else if (zone === 'permitted') o.perm.push(s);
    return o;
  }

  // ---- Tastes ----
  function isPrime(n) { if (n < 2) return false; for (var k = 2; k * k <= n; k++) if (n % k === 0) return false; return true; }
  function isSquare(n) { var r = Math.round(Math.sqrt(n)); return n > 0 && r * r === n; }
  function goalKind(kind, g) {
    var n = g.value.n, t = g.tokens;
    switch (kind) {
      case 'small': return n <= 6;
      case 'prime': return isPrime(n);
      case 'even': return n % 2 === 0;
      case 'big': return n >= 20;
      case 'square': return isSquare(n) || (t.length === 3 && ((t[1] === '+' && t[0] === t[2]) || (t[1] === '*' && (t[0] === '2' || t[2] === '2'))));
      case 'pow': return has(t, '^');
      case 'div': return has(t, '/');
      case 'long': return t.length >= 3;
      default: return false;
    }
  }
  // Does this Goal (an Eq.goalIdeas entry) look tasty from its numbers and symbols alone?
  function goalLooksLiked(o, g) {
    var L = o.likes; if (!L) return false;
    if (L.goal && goalKind(L.goal, g)) return true;
    return !!L.ops && g.tokens.some(function (s) { return has(L.ops, s); });
  }
  // Move `want` symbols into Required for a solver call, taking them from Permitted, then Resources.
  // In 'now' mode a symbol taken from Resources is the ONE extra cube, so no other Resource may join.
  function force(p, want) {
    var req = p.req.slice(), opt = (p.opt || []).slice(), res = (p.res || []).slice(), fromRes = 0;
    for (var i = 0; i < want.length; i++) {
      var s = want[i], k = opt.indexOf(s);
      if (k >= 0) { opt.splice(k, 1); req.push(s); continue; }
      k = res.indexOf(s);
      if (k < 0) return null;
      res.splice(k, 1); req.push(s); fromRes++;
    }
    if (p.mode === 'now') { if (fromRes > 1) return null; if (fromRes === 1) res = []; }
    return assign(p, { req: req, opt: opt, res: res });
  }
  // A favourite operation squeezed in for nothing (1 × …, … ÷ 1, + 0, ^ 1) is not a taste, just padding.
  var PADDING = /(^|[^0-9)])1\*|\*1($|[^0-9(])|\/1($|[^0-9(])|[-+]0($|[^0-9(])|(^|[^0-9)])0\+|\^1($|[^0-9(])/;
  function padded(r) { return PADDING.test(r.expr || r.tokens.join('')); }
  function usesAll(tokens, want) { var t = tokens.slice(); return want.every(function (s) { var k = t.indexOf(s); if (k < 0) return false; t.splice(k, 1); return true; }); }
  function tasteSets(o, p) {
    var L = o.likes; if (!L) return [];
    var sets = (L.sol || []).slice();
    if (L.mix) {
      var pool = (p.req || []).concat(p.opt || [], p.res || []), ops = shuffle(['+', '-', '*', '/', '^', 'r'].filter(function (s) { return has(pool, s); }));
      for (var i = 0; i + 1 < ops.length && sets.length < 3; i += 2) sets.push([ops[i], ops[i + 1]]);
    }
    return sets;
  }
  // r0 is a Solution the creature already found with search p. Try to find one in its taste instead
  // (a little extra thinking, capped); if that fails it keeps r0. So a taste never loses a Solution.
  function tasteSolve(o, p, r0) {
    if (!r0 || !r0.found || !o.likes) return r0;
    var sets = tasteSets(o, p), t0 = now();
    for (var i = 0; i < sets.length; i++) {
      if (usesAll(r0.tokens, sets[i])) return mark(o, p, assign(r0, { liked: sets[i].join('') }));
    }
    for (var j = 0; j < sets.length && now() - t0 < 200; j++) {
      var r = forcedSolve(p, sets[j], Math.min(80, p.timeMs || 80));
      if (r) return mark(o, p, assign(r, { liked: sets[j].join('') }));
    }
    return r0;
  }
  // A Solution of search p that uses all of `want` for real (not as padding), or null.
  // If the first one found is padding (1 × …), look once more without the spare 1s and 0s.
  function forcedSolve(p, want, ms) {
    var q = force(p, want); if (!q) return null;
    var r = Eq.solve(assign(q, { timeMs: ms }));
    if (r.found && padded(r)) {
      var keep = function (s) { return s !== '1' && s !== '0'; };
      r = Eq.solve(assign(q, { opt: q.opt.filter(keep), res: q.res.filter(keep), timeMs: ms }));
    }
    return r.found && !padded(r) ? r : null;
  }
  // Can the Goal of search p be made with one of these operations?
  function reachableWith(ops, p) { return !!ops && ops.some(function (s) { return !!forcedSolve(p, [s], 30); }); }
  // Hex: notice when his Solution goes through a fraction on the way.
  function mark(o, p, r) {
    if (p.fractions && o.likes && o.likes.frac) { var ev = Eq.evaluate(r.tokens, { fractions: true }); if (ev.ok && ev.madeFraction) r.frac = true; }
    return r;
  }

  // ---- Challenges ----
  // Should this creature challenge the move just made? Returns {kind:'now', plan} / {kind:'impossible'} / null.
  //   nowOk = a Now! challenge is allowed here; scale = 1 on its own turn, 0.8 when it interjects (3 players);
  //   strictImp = only call Impossible! when the search was complete (interjecting).
  // Creature style flags (js/config.js): shortView = "I can't find one" counts as "there is none";
  // callsImpossible === false = never calls Impossible!.
  function decideChallenge(o, st, goal, fractions, nowOk, scale, strictImp) {
    var base = { goal: goal, req: st.req, opt: st.perm, res: st.res, fractions: fractions, maxDigits: o.maxDigits, timeMs: o.timeMs };
    if (nowOk && Math.random() < o.seeNow * scale) {
      var p = assign(base, { mode: 'now' }), r = Eq.solve(p);
      if (r.found) return { kind: 'now', plan: tasteSolve(o, p, r) };
    }
    if (o.callsImpossible !== false && Math.random() < o.seeImp * scale) {
      var r2 = Eq.solve(assign(base, { mode: 'impossible' }));
      if (!r2.found && (o.shortView || r2.complete || (!strictImp && Math.random() < 0.3))) return { kind: 'impossible' };
    }
    return null;
  }
  // After the last cube: does this creature (not the mover) call Impossible!?
  function callsLastImpossible(o, st, goal, fractions) {
    if (o.callsImpossible === false || !(Math.random() < o.seeImp)) return false;
    return !Eq.solve({ goal: goal, req: st.req, opt: st.perm, res: [], mode: 'free', fractions: fractions, maxDigits: o.maxDigits, timeMs: o.timeMs }).found;
  }
  // 3 players: computer players who are NOT next may challenge the move just made. list = [{p, o, nowOk}].
  function interject(list, st, goal, fractions) {
    for (var k = 0; k < list.length; k++) {
      var d = decideChallenge(list[k].o, st, goal, fractions, list[k].nowOk, 0.8, true);
      if (d) return { p: list[k].p, d: d };
    }
    return null;
  }

  // ---- Moves ----
  // Returns {id, zone, liked}. liked = the cube is one of its favourites going to Required/Permitted.
  function chooseMove(o, st, res, goal, fractions) {
    res = res.filter(function (c) { return !c.locked; });
    if (!res.length) return null;
    var likes = (o.likes && o.likes.syms) || [];
    var base = { goal: goal, fractions: fractions, maxDigits: o.maxDigits, timeMs: 90 };
    function possible(after) { return Eq.solve(assign(base, { req: after.req, opt: after.perm, res: after.res, mode: 'impossible' })).found; }
    function out(cd) { return cd && { id: cd.id, zone: cd.zone, liked: cd.zone !== 'forbidden' && has(likes, cd.s) }; }
    if (res.length === 1) {
      var c = res[0], z;
      if (o.keepGoal === false) z = Math.random() < 0.5 ? 'required' : 'permitted'; // does not check the Goal (Penny)
      else {
        var zr = possible(applySym(st, c.s, 'required')), zp = possible(applySym(st, c.s, 'permitted'));
        z = zr && (!zp || Math.random() < 0.5) ? 'required' : 'permitted';
      }
      return out({ id: c.id, s: c.s, zone: z });
    }
    var bySym = {}; res.forEach(function (c) { if (!bySym[c.s]) bySym[c.s] = c; });
    // Choose WHERE to play first, so the computer uses the whole mat (not just Forbidden),
    // then look for a cube that is safe to put there. Zones are tried in a weighted random order.
    var W = { required: 0.36, permitted: 0.32, forbidden: 0.32 }, zones = [], pool = ['required', 'permitted', 'forbidden'];
    while (pool.length) {
      var tot = pool.reduce(function (a, z) { return a + W[z]; }, 0), r = Math.random() * tot, pick1 = pool[pool.length - 1];
      for (var zi = 0; zi < pool.length; zi++) { r -= W[pool[zi]]; if (r <= 0) { pick1 = pool[zi]; break; } }
      zones.push(pick1); pool.splice(pool.indexOf(pick1), 1);
    }
    var symList = Object.keys(bySym), cands = [];
    zones.forEach(function (z) {
      var l = shuffle(symList.slice());
      // Taste: favourite cubes are looked at first for Required/Permitted, last for Forbidden.
      if (likes.length && Math.random() < 0.75) {
        var fav = l.filter(function (s) { return has(likes, s); }), rest = l.filter(function (s) { return !has(likes, s); });
        l = z === 'forbidden' ? rest.concat(fav) : fav.concat(rest);
      }
      l.slice(0, 4).forEach(function (s) { cands.push({ id: bySym[s].id, s: s, zone: z }); });
    });
    if (Math.random() > o.smart) return out(cands[0]); // a casual (not-so-careful) move
    var fallback = null, t0 = now();
    for (var i = 0; i < cands.length; i++) {
      var cd = cands[i], after = applySym(st, cd.s, cd.zone);
      if (o.keepGoal !== false && !possible(after)) continue; // keepGoal === false: never checks that the Goal stays possible
      if (!fallback) fallback = cd;
      var nowable = after.res.length >= 2 && (after.req.length + after.perm.length) > 0 &&
        Eq.solve(assign(base, { req: after.req, opt: after.perm, res: after.res, mode: 'now', maxDigits: viewDigits(o) })).found;
      if (!nowable) return out(cd);
      if (now() - t0 > 900) break;
    }
    return out(fallback || cands[0]);
  }
  // A whole turn: challenge the last move (when allowed) or else choose a move. -> {challenge} or {move}
  function turn(o, st, res, goal, fractions, mayChallenge, nowOk) {
    if (mayChallenge) { var d = decideChallenge(o, st, goal, fractions, nowOk, 1, false); if (d) return { challenge: d }; }
    return { move: chooseMove(o, st, res, goal, fractions) };
  }

  // ---- Writing a Solution ----
  // mode: 'now' | 'impossible' | 'last'. Returns the solver result ({found, tokens, liked?}).
  function write(o, st, goal, fractions, mode) {
    var p = { goal: goal, req: st.req, opt: st.perm, res: mode === 'last' ? [] : st.res, mode: mode === 'last' ? 'free' : mode, fractions: fractions, maxDigits: viewDigits(o), timeMs: o.timeMs * 2 };
    return tasteSolve(o, p, Eq.solve(p));
  }
  // The Third Party (3 players) looks for a Solution of its own after a challenge.
  function thirdParty(o, st, goal, fractions, kind) {
    var p = { goal: goal, req: st.req, opt: st.perm, res: st.res, mode: kind === 'last' ? 'free' : kind, fractions: fractions, maxDigits: o.maxDigits, timeMs: o.timeMs };
    return tasteSolve(o, p, Eq.solve(p));
  }

  // ---- Setting the Goal ----
  // free = the Resource cubes [{id, s}]. Returns {toks:[{s,id}], value, liked} or null (= "No Goal").
  function chooseGoal(o, free, fractions, maxGoal) {
    var L = o.likes;
    var ideas = Eq.goalIdeas(free.map(function (c) { return c.s; }), { fractions: fractions }).filter(function (g) {
      return g.value.d === 1 && g.value.n >= 1 && g.value.n <= Math.min(o.goalMax, maxGoal) && g.tokens.length <= o.goalCubes;
    });
    // Longer Goals first (with some randomness). A taste counts about as much as one more cube; Zog loves length.
    shuffle(ideas);
    if (!L) { if (o.goalCubes > 1) ideas.sort(function (a, b) { return (b.tokens.length - a.tokens.length) + (Math.random() - 0.5) * 2.2; }); } // as it always was
    else {
      var lenW = o.goalCubes > 1 ? (L.goal === 'long' ? 2 : 1) : 0;
      ideas.forEach(function (g) { g.key = lenW * g.tokens.length + (goalLooksLiked(o, g) ? 1 : 0) + (Math.random() - 0.5) * 2.2; });
      ideas.sort(function (a, b) { return b.key - a.key; });
    }
    var t0 = now(), pick = null, liked = false, seen = 0;
    for (var i = 0; i < ideas.length && i < 30 && now() - t0 < 1000; i++) {
      var g = ideas[i], rest = free.map(function (c) { return c.s; });
      g.tokens.forEach(function (s) { rest.splice(rest.indexOf(s), 1); });
      var p = { goal: g.value, req: [], opt: rest, mode: 'free', fractions: fractions, maxDigits: goalDigits(o), timeMs: 60 };
      if (!Eq.solve(p).found) continue;
      if (!pick) pick = g;
      if (!L) break; // no taste: the first Goal it can solve, as always
      // Taste: a Goal that looks tasty, or one it can make with a favourite operation ("I can take away to 7!").
      var yum = goalLooksLiked(o, g) || reachableWith(L.ops, p);
      if (yum) { pick = g; liked = true; break; }
      if (++seen >= 4) break; // looks at a few Goals it can solve, then settles for the first one
    }
    if (!pick) return null;
    var used = {}, toks = pick.tokens.map(function (s) { var c = free.find(function (x) { return x.s === s && !used[x.id]; }); used[c.id] = 1; return { s: s, id: c.id }; });
    return { toks: toks, value: pick.value, liked: liked };
  }
  // "No Goal" was called: can the creature find ANY Goal plus a Solution? (free = Resource symbols)
  function findAnyEquation(free, fractions) {
    var ideas = shuffle(Eq.goalIdeas(free, { fractions: fractions }).filter(function (g) { return g.value.d === 1; }));
    var t0 = now();
    for (var i = 0; i < ideas.length && now() - t0 < 1500; i++) {
      var rest = free.slice(); ideas[i].tokens.forEach(function (s) { rest.splice(rest.indexOf(s), 1); });
      var r = Eq.solve({ goal: ideas[i].value, req: [], opt: rest, mode: 'free', fractions: fractions, maxDigits: 4, timeMs: 80 });
      if (r.found) return { goal: ideas[i].tokens, value: ideas[i].value, sol: r.tokens };
    }
    return null;
  }

  return {
    VERSION: VERSION, skill: skill, plain: plain, viewDigits: viewDigits, goalDigits: goalDigits, applySym: applySym,
    decideChallenge: decideChallenge, callsLastImpossible: callsLastImpossible, interject: interject,
    chooseMove: chooseMove, turn: turn, write: write, thirdParty: thirdParty, chooseGoal: chooseGoal, findAnyEquation: findAnyEquation,
    tasteSolve: tasteSolve, goalLooksLiked: goalLooksLiked, reachableWith: reachableWith, padded: padded,
    // what the worker may run
    TASKS: ['decideChallenge', 'callsLastImpossible', 'interject', 'chooseMove', 'turn', 'write', 'thirdParty', 'chooseGoal', 'findAnyEquation']
  };
})();

// ======================= THINKING IN THE BACKGROUND =======================
// AIThink.run(task, args) -> Promise of AI[task](...args), computed in a Web Worker so the 3D
// table and the buttons keep moving. If a worker can't be made (old browser, page opened as a
// file), errors, or doesn't answer in time, the same function runs here on the page instead
// (the old way: the picture pauses while it thinks), so the game always goes on.
var AIThink = (function () {
  var worker = null, broken = false, failures = 0, seq = 0, pending = {};
  var HANG_MS = 8000; // the slowest search (Zog setting a Goal on an iPad) is well under this
  var debug = { forceSync: false, timeoutMs: 0, last: null };
  var inPage = typeof window !== 'undefined' && typeof document !== 'undefined';

  function runSync(task, args) { return AI[task].apply(null, args); }
  function giveUp(why) {
    failures++;
    if (worker) { try { worker.terminate(); } catch (e) {} }
    worker = null;
    if (failures >= 2) broken = true; // twice is enough: think on the page for the rest of the visit
    if (typeof console !== 'undefined') console.warn('[AIThink] background thinking failed (' + why + '); thinking on the page instead.');
    var ids = Object.keys(pending);
    ids.forEach(function (id) { var p = pending[id]; delete pending[id]; clearTimeout(p.timer); finish(p, 'sync', function () { return runSync(p.task, p.args); }); });
  }
  function finish(p, how, get) {
    try { var v = get(); debug.last = { task: p.task, how: how, ms: Date.now() - p.t0 }; p.resolve(v); }
    catch (e) { p.reject(e); }
  }
  function start() {
    if (worker || broken) return worker;
    try {
      worker = new Worker('js/ai-worker.js?v=' + AI.VERSION);
      worker.onmessage = function (e) {
        var m = e.data || {}, p = pending[m.id];
        if (m.v !== AI.VERSION) { giveUp('old worker file'); return; } // a cached old ai.js in the worker
        if (!p) return;
        delete pending[m.id]; clearTimeout(p.timer);
        if (m.err) { pending[m.id] = p; giveUp(m.err); return; }
        failures = 0;
        finish(p, 'worker', function () { return m.result; });
      };
      worker.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); giveUp((e && e.message) || 'worker error'); };
    } catch (e) { worker = null; broken = true; }
    return worker;
  }
  function run(task, args) {
    return new Promise(function (resolve, reject) {
      var p = { task: task, args: args, resolve: resolve, reject: reject, t0: Date.now() };
      if (AI.TASKS.indexOf(task) < 0) { reject(new Error('unknown task ' + task)); return; }
      var w = (!inPage || debug.forceSync || typeof Worker === 'undefined') ? null : start();
      if (!w) { setTimeout(function () { finish(p, 'sync', function () { return runSync(task, args); }); }, 0); return; }
      var id = ++seq;
      pending[id] = p;
      p.timer = setTimeout(function () { if (pending[id]) giveUp('no answer after ' + (debug.timeoutMs || HANG_MS) + 'ms'); }, debug.timeoutMs || HANG_MS);
      try { w.postMessage({ id: id, v: AI.VERSION, task: task, args: args }); }
      catch (e) { giveUp('could not send: ' + e.message); }
    });
  }
  function mode() { return debug.forceSync || broken || !inPage || typeof Worker === 'undefined' ? 'sync' : 'worker'; }
  function reset() { broken = false; failures = 0; if (worker) { try { worker.terminate(); } catch (e) {} } worker = null; }
  return { run: run, mode: mode, reset: reset, debug: debug };
})();
