'use strict';
// ======================= ON-SETS COMPUTER PLAYER: DECISIONS =======================
// Plain functions of the mat (no page, no OG). Loads on the page (OSThink below runs them in a Web Worker
// so the picture never freezes), in the worker (js/onsets/ai-worker.js), and in node (tests/onsets.test.js).
// Needs only OSE (js/onsets/engine.js).
//
// A creature's On-Sets strength comes from its stars in js/config.js (OPPONENTS), in four levels:
//   level 1 (1 star)  : sees Set-Names of up to 3 cubes, often misses chances, sometimes moves carelessly
//   level 2 (2 stars) : up to 5 cubes
//   level 3 (3 stars) : up to 7 cubes, careful most of the time
//   level 4 (4-5 stars): sees every Set-Name (the 4 operation cubes allow at most 9 cubes), never misses
// A weaker creature trusts its short view: if it can't see a Solution it may call Impossible! when a longer
// one exists. Then the kid wins 6 points by showing it (the same blind spot Snoozy has in Equations).
//
// Shapes:  st = { req: [syms], perm: [syms], res: [syms] };  res = [{id, s}] (Resource cubes it may move);
//          U = the universe (array of cards); goal = a whole number.
var OSAI = (function () {
  var VERSION = 2;
  var LEVELS = {
    1: { maxCubes: 3, seeNow: 0.55, seeImp: 0.35, smart: 0.45, goalCubes: 1, deal: [6, 8] },
    2: { maxCubes: 5, seeNow: 0.75, seeImp: 0.6, smart: 0.7, goalCubes: 2, deal: [6, 9] },
    3: { maxCubes: 7, seeNow: 0.9, seeImp: 0.85, smart: 0.9, goalCubes: 3, deal: [7, 11] },
    4: { maxCubes: 9, seeNow: 1, seeImp: 1, smart: 1, goalCubes: 3, deal: [8, 12] }
  };
  var E = (typeof OSE !== 'undefined') ? OSE : null;
  function eng() { if (!E && typeof OSE !== 'undefined') E = OSE; return E; }
  function level(o) { var s = (o && o.stars) || 1; return s <= 1 ? 1 : s === 2 ? 2 : s === 3 ? 3 : 4; }
  function skill(o) {
    var L = level(o), b = LEVELS[L];
    return { name: o && o.name, level: L, maxCubes: b.maxCubes, seeNow: b.seeNow, seeImp: b.seeImp, smart: b.smart, goalCubes: b.goalCubes, deal: b.deal, timeMs: 250 + 100 * L };
  }
  function rnd() { return Math.random(); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function applySym(st, s, zone) {
    var res = st.res.slice(), i = res.indexOf(s); if (i >= 0) res.splice(i, 1);
    var o = { req: st.req.slice(), perm: st.perm.slice(), res: res };
    if (zone === 'required') o.req.push(s); else if (zone === 'permitted') o.perm.push(s);
    return o;
  }
  function solveView(o, st, goal, U, mode, extra) {
    var q = { universe: U, goal: goal, req: st.req, perm: st.perm, res: st.res, mode: mode, maxCubes: o.maxCubes, timeMs: o.timeMs || 400 };
    if (extra) for (var k in extra) q[k] = extra[k];
    return eng().solve(q);
  }
  function nowPossible(o, st, goal, U) {
    if (st.res.length < 2 || st.req.length + st.perm.length === 0) return false;
    return solveView(o, st, goal, U, 'now').found;
  }
  function stillPossible(o, st, goal, U) {
    var r = solveView(o, st, goal, U, st.res.length ? 'impossible' : 'last');
    return r.found || (!r.complete && r.timedOut); // ran out of time: assume it is still possible
  }
  // Challenge the last move? nowOk = a Now! would be legal; impOk = an Impossible! would be legal.
  function decideChallenge(o, st, goal, U, nowOk, impOk) {
    if (impOk !== false && rnd() < o.seeImp) {
      var ri = solveView(o, st, goal, U, 'impossible');
      if (!ri.found && !ri.timedOut) return { kind: 'impossible' };
    }
    if (nowOk && rnd() < o.seeNow) {
      var rn = solveView(o, st, goal, U, 'now');
      if (rn.found) return { kind: 'now', plan: { found: true, tokens: rn.tokens } };
    }
    return null;
  }
  // Which cube to move where. A careful creature (chance = smart) checks that the move does not hand the
  // opponent a Now! and keeps the Goal possible (otherwise the opponent calls Impossible!).
  function chooseMove(o, st, res, goal, U) {
    var seen = {}, cands = [], last = res.length === 1;
    res.forEach(function (c) {
      if (seen[c.s]) return; seen[c.s] = 1;
      (last ? ['required', 'permitted'] : ['required', 'permitted', 'forbidden']).forEach(function (z) { cands.push({ id: c.id, s: c.s, zone: z }); });
    });
    shuffle(cands);
    if (rnd() >= o.smart) return cands[0];
    var keep = [], safe = [];
    for (var i = 0; i < cands.length; i++) {
      var m = cands[i], after = applySym(st, m.s, m.zone);
      if (!stillPossible(o, after, goal, U)) continue;
      keep.push(m);
      if (!nowPossible(o, after, goal, U)) safe.push(m);
    }
    // a little taste: careful creatures like putting cubes in Forbidden when it is safe (it shrinks the opponent's options)
    var pickFrom = safe.length ? safe : keep.length ? keep : cands;
    var forb = pickFrom.filter(function (m) { return m.zone === 'forbidden'; });
    if (forb.length && rnd() < 0.4) return forb[0];
    return pickFrom[0];
  }
  // A whole turn: challenge (if the last move was the opponent's) or move.
  function turn(o, st, res, goal, U, canChallenge, nowOk) {
    if (canChallenge) {
      var d = decideChallenge(o, st, goal, U, nowOk, true);
      if (d) return { challenge: d };
    }
    return { move: chooseMove(o, st, res, goal, U) };
  }
  // Write a Solution after a challenge or the last cube. A creature can stretch a little past what it notices.
  function write(o, st, goal, U, mode) {
    var r = eng().solve({ universe: U, goal: goal, req: st.req, perm: st.perm, res: mode === 'last' ? [] : st.res, mode: mode, maxCubes: Math.min(9, o.maxCubes + 2), timeMs: 1500 });
    return r.found ? { found: true, tokens: r.tokens } : { found: false };
  }
  function callsLastImpossible(o, st, goal, U) {
    if (rnd() >= o.seeImp) return false;
    var r = solveView(o, st, goal, U, 'last');
    return !r.found && !r.timedOut;
  }
  // Choose a Goal from the Resource cubes. Returns {goal: {shape, digits:[{s, neg, id}]}, value, cubes} or null.
  // Weaker creatures use fewer digit cubes and never turn a cube upside down. The Goal is always one the
  // creature itself can make, between 1 and the number of cards (a strong one may also try 0).
  function chooseGoal(o, cubes, U) {
    var E2 = eng(), dig = cubes.filter(function (c) { return E2.isDigit(c.s); });
    var pool = cubes.filter(function (c) { return !E2.isDigit(c.s); }).map(function (c) { return c.s; });
    if (!dig.length) return null;
    var ideas = E2.goalIdeas(dig.map(function (c) { return c.s; }), { neg: o.level >= 3 }).filter(function (g) {
      return g.digits.length <= o.goalCubes && g.value >= (o.level >= 4 ? 0 : 1) && g.value <= U.length;
    });
    if (!ideas.length) return null;
    var byVal = {}, vals = [];
    ideas.forEach(function (g) { if (!byVal[g.value]) { byVal[g.value] = []; vals.push(g.value); } byVal[g.value].push(g); });
    var ok = [];
    shuffle(vals).forEach(function (v) {
      var r = E2.solve({ universe: U, goal: v, req: [], perm: [], res: pool, mode: 'impossible', maxCubes: o.maxCubes, timeMs: 300 });
      if (r.found) ok.push({ v: v, cubes: r.cubes });
    });
    if (!ok.length) return null;
    // stronger creatures like Goals that need longer Set-Names
    if (o.level >= 3) ok.sort(function (a, b) { return b.cubes - a.cubes; });
    var top = ok.slice(0, o.level >= 3 ? 2 : ok.length), pickV = top[Math.floor(rnd() * top.length)];
    var opts = byVal[pickV.v];
    // prefer using more digit cubes when the creature is strong (fancier Goals), fewer when weak
    opts.sort(function (a, b) { return o.level >= 3 ? b.digits.length - a.digits.length : a.digits.length - b.digits.length; });
    var best = opts.filter(function (g) { return g.digits.length === opts[0].digits.length; });
    var g = best[Math.floor(rnd() * best.length)];
    return { goal: { shape: g.shape, digits: g.digits.map(function (d) { return { s: d.s, neg: d.neg, id: dig[d.i].id }; }) }, value: g.value, cubes: pickV.cubes };
  }
  // THREE PLAYERS. After a challenge the Third Party MAY present a Solution (rules IV-B, page O3). A creature that can
  // see one presents it (presenting a correct Solution never scores less than staying quiet: rule VI-C), but a weak
  // one sometimes doesn't bother. Returns {found, tokens} or {found: false}.
  function thirdParty(o, st, goal, U, kind) {
    var r = write(o, st, goal, U, kind);
    if (r.found && rnd() < o.smart + 0.15) return r;
    return { found: false };
  }
  // A creature that is NOT next may still challenge the move just made ("anyone may challenge", rules V).
  // list = [{p, o, nowOk}] -> {p, d: {kind, plan?}} for the first one that challenges, or null.
  function interject(list, st, goal, U) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i], d = decideChallenge(c.o, st, goal, U, c.nowOk, true);
      if (d) return { p: c.p, d: d };
    }
    return null;
  }
  // The dealer chooses how many cards (rules II-B-1: 6 to 12 in Elementary).
  function chooseDeal(o) { var r = o.deal || [6, 12]; return r[0] + Math.floor(rnd() * (r[1] - r[0] + 1)); }
  // The Goal-setter sets out two V and one Λ, or one V and two Λ (rules II-A-3).
  function chooseVN() { return rnd() < 0.5 ? 'VVN' : 'VNN'; }
  // "No Goal" challenge: is there ANY Goal (from these digits) with a Solution (any Resource cubes)?
  function findAnyGoal(cubes, U) {
    var full = skill({ stars: 5 }); full.goalCubes = 3; full.level = 4; full.maxCubes = 9;
    return chooseGoal(full, cubes, U);
  }
  return {
    VERSION: VERSION, LEVELS: LEVELS, level: level, skill: skill, applySym: applySym,
    decideChallenge: decideChallenge, chooseMove: chooseMove, turn: turn, write: write, callsLastImpossible: callsLastImpossible,
    chooseGoal: chooseGoal, chooseDeal: chooseDeal, chooseVN: chooseVN, findAnyGoal: findAnyGoal, thirdParty: thirdParty, interject: interject,
    TASKS: ['decideChallenge', 'chooseMove', 'turn', 'write', 'callsLastImpossible', 'chooseGoal', 'findAnyGoal', 'thirdParty', 'interject']
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OSAI;

// ======================= THINKING IN THE BACKGROUND =======================
// OSThink.run(task, args) -> Promise of OSAI[task](...args), computed in a Web Worker (js/onsets/ai-worker.js)
// so the page never freezes. If a worker can't start, errors, or hangs, the same function runs on the page.
var OSThink = (function () {
  var inPage = typeof window !== 'undefined' && typeof document !== 'undefined';
  var worker = null, broken = !inPage, seq = 0, pending = {}, HANG_MS = 8000;
  function runSync(task, args) { return OSAI[task].apply(null, args); }
  function giveUp(why) {
    if (worker) { try { worker.terminate(); } catch (e) {} }
    worker = null; broken = true;
    if (typeof console !== 'undefined') console.warn('[OSThink] thinking on the page instead (' + why + ')');
    Object.keys(pending).forEach(function (id) { var p = pending[id]; delete pending[id]; clearTimeout(p.timer); try { p.resolve(runSync(p.task, p.args)); } catch (e) { p.reject(e); } });
  }
  function start() {
    if (worker || broken || typeof Worker === 'undefined') return worker;
    try {
      worker = new Worker('js/onsets/ai-worker.js?v=' + OSAI.VERSION);
      worker.onmessage = function (e) {
        var m = e.data || {}, p = pending[m.id];
        if (m.v !== OSAI.VERSION) { giveUp('old worker file'); return; }
        if (!p) return;
        delete pending[m.id]; clearTimeout(p.timer);
        if (m.err) { pending[m.id] = p; giveUp(m.err); return; }
        p.resolve(m.result);
      };
      worker.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); giveUp((e && e.message) || 'worker error'); };
    } catch (e) { worker = null; broken = true; }
    return worker;
  }
  function run(task, args) {
    return new Promise(function (resolve, reject) {
      var p = { task: task, args: args, resolve: resolve, reject: reject };
      if (OSAI.TASKS.indexOf(task) < 0) { reject(new Error('unknown task ' + task)); return; }
      var w = start();
      if (!w) { setTimeout(function () { try { resolve(runSync(task, args)); } catch (e) { reject(e); } }, 0); return; }
      var id = ++seq; pending[id] = p;
      p.timer = setTimeout(function () { if (pending[id]) giveUp('no answer'); }, HANG_MS);
      try { w.postMessage({ id: id, v: OSAI.VERSION, task: task, args: args }); } catch (e) { giveUp('could not send'); }
    });
  }
  function mode() { return broken || !worker ? (broken ? 'sync' : 'idle') : 'worker'; }
  return { run: run, mode: mode };
})();
