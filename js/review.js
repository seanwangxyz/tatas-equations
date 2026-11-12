'use strict';
// ======================= ONE THING PIP SPOTTED =======================
// After a match against a creature, Pip may offer ONE friendly tip about a moment where a stronger
// move existed (or, if there is none, one of the kid's best moments). Three parts:
//
//   Recorder  (page)  game.js calls Recorder.note(kind, snapshot) at the kid's decision points.
//                     It only copies 24 tiny cube records per note. No thinking during play.
//   Review    (pure)  after the match: turns the notes into small jobs, runs them with the solver
//                     (Eq.solve) under a hard time cap, and picks the single most teachable moment.
//                     Needs only Eq (js/engine.js), so tests/engine.test.js runs it under node.
//   Review UI (page)  the optional "💡 One thing Pip spotted" button on the match-end screen.
//
// RULE: a tip is shown only when the engine can PROVE it: a concrete Solution (Now!, a Solution,
// a Goal), a complete search that finds nothing (Impossible!), or a concrete safe move. If nothing
// is provable, nothing is shown. Wording never says mistake / wrong / should have / missed.
//
// Note shapes (what Recorder stores; game.js passes the live objects, Recorder copies them):
//   every note: { k: kind, by: player index (0 = the kid), goal: {n,d} or null, fr: G.fractions,
//                 cubes: [{ i: id, s: symbol, c: color, z: zone, o: order, l: locked 0/1 }] }
//   'goal'      + gt: Goal tokens [{s, c} or '(' / ')'], shake: shake number   (cubes: AFTER the Goal)
//   'move'      + i: cube id, s: its symbol, zone: where it goes                 (cubes: BEFORE the move)
//   'challenge' + kind: 'now' | 'impossible'                                     (cubes: at the call)
//   'solution'  + mode: 'now' | 'impossible' | 'last', ok: bool, toks: [{s, c} or parens] or null
var Review = (function () {
  var BUDGET = 1500;          // ms for the whole analysis, then it stops
  var KID_DIGITS = 4;         // Pip only shows Solutions with at most this many number cubes
  var ORDER = ['now', 'imp', 'safe', 'solution', 'goal']; // most teachable first; 'nice' is the fallback
  var ZN = { required: 'Required', permitted: 'Permitted', forbidden: 'Forbidden' };

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function sym(t) { return typeof t === 'string' ? t : t.s; }
  function isParen(s) { return s === '(' || s === ')'; }
  function rank(k) { var r = ORDER.indexOf(k); return r < 0 ? 99 : r; }

  // ---- The mat at a note ----
  function byZone(cubes) {
    var m = { goal: [], required: [], permitted: [], forbidden: [], resources: [] };
    cubes.slice().sort(function (a, b) { return a.o - b.o; }).forEach(function (c) { if (m[c.z]) m[c.z].push(c); });
    return m;
  }
  function stOf(cubes) {
    var m = byZone(cubes), f = function (c) { return c.s; };
    return { req: m.required.map(f), perm: m.permitted.map(f), res: m.resources.filter(function (c) { return !c.l; }).map(f) };
  }
  function moved(cubes, id, zone) {
    var top = 0; cubes.forEach(function (c) { if (c.o > top) top = c.o; });
    return cubes.map(function (c) { return c.i === id ? { i: c.i, s: c.s, c: c.c, z: zone, o: top + 1, l: c.l } : c; });
  }
  function nowAllowed(st) { return st.res.length >= 2 && st.req.length + st.perm.length > 0; }

  // ---- Solver, with a double check of every Solution it returns ----
  function verify(tokens, goal, fr, wild) {
    var ev = Eq.evaluate(tokens, { fractions: fr, wild: typeof wild === 'number' ? wild : undefined });
    if (!ev.ok) return false;
    var RU = Eq.rulesOf(fr), g = goal;
    if (RU.wild && RU.goal && RU.goal.indexOf('0') >= 0 && typeof wild === 'number') g = Eq.goalAt(RU.goal, wild, fr);
    return !!g && Eq.eqF(ev.value, g);
  }
  // mode: 'now' | 'impossible' | 'last' (mat only). Returns the Eq.solve result.
  function solve(n, st, mode, maxD, ms) {
    var r = Eq.solve({ goal: n.goal, req: st.req, opt: st.perm, res: mode === 'last' ? [] : st.res, mode: mode === 'last' ? 'free' : mode,
      fractions: n.fr, maxDigits: maxD, timeMs: ms });
    if (r.found && !verify(r.tokens, n.goal, n.fr, r.wild)) return { found: false, complete: false };
    return r;
  }
  // A Solution to SHOW the kid: first try with only + − × ÷ (roots and powers stay in only when Required),
  // then with everything. Leaving cubes out only makes the search stricter, so what it finds is still a real Solution.
  function plainOnly(list) { return list.filter(function (s) { return s !== 'r' && s !== '^'; }); }
  function showSolve(n, st, mode, maxD, ms) {
    var plain = { req: st.req, perm: plainOnly(st.perm), res: plainOnly(st.res) };
    if (plain.perm.length !== st.perm.length || plain.res.length !== st.res.length) {
      var r = solve(n, plain, mode, maxD, Math.round(ms / 2));
      if (r.found) return r;
    }
    return solve(n, st, mode, maxD, ms);
  }
  function nowWin(n, st, maxD, ms) { if (!nowAllowed(st)) return null; var r = showSolve(n, st, 'now', maxD, ms); return r.found ? r : null; }
  // Proven: no Solution at all (complete search, nothing found).
  // (The solver can only finish a search over at most 6 number cubes, so with more there is nothing to prove.)
  function digitCount(list) { return list.filter(Eq.isDigit).length; }
  function provenImpossible(n, st, ms) {
    if (digitCount(st.req.concat(st.perm, st.res)) > 6) return false;
    var r = solve(n, st, 'impossible', 6, ms); return !r.found && r.complete;
  }
  // Proven safe: the Goal can still be made (a concrete Solution) AND no Now! exists (complete search or not allowed).
  function provenSafe(n, st) {
    if (nowAllowed(st) && digitCount(st.req.concat(st.perm)) + 1 > 6) return null; // a "no Now!" proof is out of reach
    var p = solve(n, st, 'impossible', 6, 60);
    if (!p.found) return null;
    if (nowAllowed(st)) { var r = solve(n, st, 'now', 6, 80); if (r.found || !r.complete) return null; }
    return p;
  }

  // ---- Turning the notes into jobs ----
  function shakesOf(notes) {
    var out = [], cur = null;
    notes.forEach(function (n) { if (n.k === 'goal') { cur = [n]; out.push(cur); } else if (cur) cur.push(n); });
    return out;
  }
  function cubeCount(toks) { return toks.filter(function (t) { return !isParen(sym(t)); }).length; }
  // A job: { kind, run(): candidate | null | { next: [jobs] } }. Candidates: { kind, ...facts for the words and the picture }.
  function plan(log) {
    var A = [], B = [], C = [], N = [];
    shakesOf(log.notes || []).forEach(function (sh) {
      var g = sh[0], shake = g.shake || 1;
      for (var j = 0; j < sh.length; j++) (function (n, prev, next) {
        var kid = n.by === 0, oppActed = prev && prev.by !== 0 && (prev.k === 'move' || prev.k === 'goal');
        // (a) The creature just acted and the kid did not challenge (moved, or wrote after the last cube),
        //     or called Impossible! and the creature then wrote a Solution.
        var lostImp = n.k === 'challenge' && kid && n.kind === 'impossible' && next && next.k === 'solution' && next.by !== 0 && next.ok;
        var decided = kid && oppActed && ((n.k === 'move') || (n.k === 'solution' && n.mode === 'last') || lostImp);
        if (decided) {
          var st = stOf(n.cubes), ctx = { shake: shake, g: g, at: n, opp: prev };
          A.push({ kind: 'now', run: function () {
            var r = nowWin(n, st, KID_DIGITS, 90);
            return r && { kind: 'now', ctx: ctx, sol: r.tokens, wild: r.wild, st: st, cubes: n.cubes, hl: prev.k === 'move' ? prev.i : null };
          } });
          if (!lostImp) A.push({ kind: 'imp', run: function () {
            return provenImpossible(n, st, 160) ? { kind: 'imp', ctx: ctx, st: st, cubes: n.cubes, hl: prev.k === 'move' ? prev.i : null } : null;
          } });
        }
        // (b) The kid's move gave the creature a winning challenge, and a safe move existed.
        if (kid && n.k === 'move') {
          var called = next && next.k === 'challenge' && next.by !== 0;
          (called ? B.unshift : B.push).call(B, { kind: 'safe', run: function () {
            var before = stOf(n.cubes), afterCubes = moved(n.cubes, n.i, n.zone), after = stOf(afterCubes);
            var hn = nowWin(n, after, 5, 90), hi = !hn && provenImpossible(n, after, 160);
            if (!hn && !hi) return null;
            // Try the same cube in another zone first, then the other cubes.
            var res = byZone(n.cubes).resources.filter(function (c) { return !c.l; }), seen = {}, alts = [];
            var zones = ['forbidden', 'permitted', 'required'];
            res.slice().sort(function (a, b) { return (b.i === n.i) - (a.i === n.i); }).forEach(function (c) {
              zones.forEach(function (z) {
                if (z === 'forbidden' && res.length < 2) return;
                if (c.s === n.s && z === n.zone) return;
                var key = c.s + '>' + z; if (seen[key]) return; seen[key] = 1;
                alts.push({ kind: 'safe', run: function () {
                  var p = provenSafe(n, stOf(moved(n.cubes, c.i, z)));
                  return p && { kind: 'safe', ctx: { shake: shake, g: g, at: n }, handed: hn ? 'now' : 'imp', oppSol: hn ? hn.tokens : null, oppWild: hn ? hn.wild : null,
                    alt: { s: c.s, zone: z }, proof: p.tokens, st: after, cubes: afterCubes, hl: n.i, before: before };
                } });
              });
            });
            return { next: alts };
          } });
        }
        // (c) A Solution the kid wrote: a correct one existed, or a much shorter one.
        if (kid && n.k === 'solution') C.push({ kind: 'solution', run: function () {
          var st = stOf(n.cubes), r = n.ok ? solve(n, st, n.mode, 6, 120) : showSolve(n, st, n.mode, 5, 120);
          if (!r.found) return null;
          var base = { kind: 'solution', ctx: { shake: shake, g: g, at: n }, sol: r.tokens, wild: r.wild, st: st, cubes: n.cubes, mode: n.mode };
          if (!n.ok) { base.variant = 'found'; return base; }
          var mine = n.toks ? cubeCount(n.toks) : 0, theirs = cubeCount(r.tokens);
          if (mine && mine - theirs >= 2) { base.variant = 'short'; base.mine = mine; base.theirs = theirs; return base; }
          return null;
        } });
        // (c) A Goal the kid set that no Solution can reach (complete search), plus a Goal that works.
        if (kid && n.k === 'goal') C.push({ kind: 'goal', run: function () {
          var st = stOf(n.cubes);
          if (!provenImpossible(n, st, 200)) return null;
          var free = (n.gt || []).map(sym).filter(function (s) { return !isParen(s); }).concat(st.res), t0 = now();
          var fr0 = n.fr && typeof n.fr === 'object' ? Eq.mathMode(n.fr.fractions, n.fr.vars) : n.fr;
          var ideas = Eq.goalIdeas(free, { fractions: fr0 }).filter(function (x) { return x.value.d === 1 && x.value.n >= 1; });
          ideas.sort(function (a, b) { return b.tokens.length - a.tokens.length || a.value.n - b.value.n; });
          for (var i = 0; i < ideas.length && now() - t0 < 150; i++) {
            var rest = free.slice(); ideas[i].tokens.forEach(function (s) { rest.splice(rest.indexOf(s), 1); });
            var fx = Eq.withGoal(fr0, ideas[i].tokens);
            var r = Eq.solve({ goal: ideas[i].value, req: [], opt: rest, mode: 'free', fractions: fx, maxDigits: 3, timeMs: 25 });
            if (r.found && verify(r.tokens, ideas[i].value, fx, r.wild)) return { kind: 'goal', ctx: { shake: shake, g: g, at: n }, st: st, cubes: n.cubes, alt: ideas[i].tokens, altVal: ideas[i].value, sol: r.tokens, wild: r.wild };
          }
          return null;
        } });
        // Nice moments (no solver needed: the game already checked these Solutions).
        if (kid && n.k === 'challenge' && n.kind === 'now' && next && next.k === 'solution' && next.by === 0 && next.ok && next.toks)
          N.push({ kind: 'nice', run: function () { return { kind: 'nice', variant: 'now', ctx: { shake: shake, g: g, at: n, opp: prev }, sol: next.toks, st: stOf(n.cubes), cubes: n.cubes, hl: prev && prev.k === 'move' ? prev.i : null }; } });
        if (kid && n.k === 'challenge' && n.kind === 'impossible' && next && next.k === 'solution' && next.by !== 0 && !next.ok)
          N.push({ kind: 'nice', run: function () { return { kind: 'nice', variant: 'imp', ctx: { shake: shake, g: g, at: n, opp: prev }, st: stOf(n.cubes), cubes: n.cubes, hl: prev && prev.k === 'move' ? prev.i : null }; } });
        if (!kid && n.k === 'challenge' && n.kind === 'impossible' && next && next.k === 'solution' && next.by === 0 && next.ok && next.toks)
          N.push({ kind: 'nice', run: function () { return { kind: 'nice', variant: 'mover', ctx: { shake: shake, g: g, at: n }, sol: next.toks, st: stOf(n.cubes), cubes: n.cubes }; } });
      })(sh[j], sh[j - 1], sh[j + 1]);
    });
    return A.concat(B, C, N);
  }

  // ---- Picking ONE tip ----
  // recent = the kinds of the last tips he opened (oldest first). The same kind is not given three
  // matches in a row when another kind was found.
  function blocked(k, recent) { return !!recent && recent.length >= 2 && recent[recent.length - 1] === k && recent[recent.length - 2] === k; }
  function choose(cands, recent) {
    var avail = ORDER.filter(function (k) { return cands[k]; });
    if (!avail.length) return cands.nice || null;
    if (blocked(avail[0], recent) && avail.length > 1) return cands[avail[1]];
    return cands[avail[0]];
  }
  // Can we stop early? The pick cannot get better from the jobs that are left.
  function settled(cands, jobs, recent) {
    var c = choose(cands, recent);
    if (!c || c.kind === 'nice') return false;
    return !jobs.some(function (j) { return !cands[j.kind] && j.kind !== 'nice' && (rank(j.kind) < rank(c.kind) || blocked(c.kind, recent)); });
  }
  // One slice of work. Returns true when finished.
  function step(state, sliceMs) {
    var end = now() + sliceMs;
    while (state.jobs.length) {
      if (now() - state.t0 > state.budget) return true; // the hard cap: keep what is proven so far
      if (settled(state.cands, state.jobs, state.recent)) return true;
      var j = state.jobs.shift();
      if (state.cands[j.kind]) continue;
      var r = j.run();
      if (r && r.next) Array.prototype.unshift.apply(state.jobs, r.next);
      else if (r && !state.cands[r.kind]) state.cands[r.kind] = r;
      if (now() > end) return !state.jobs.length;
    }
    return true;
  }
  function begin(log, opts) { opts = opts || {}; return { t0: now(), budget: opts.budgetMs || BUDGET, recent: opts.recent || [], jobs: plan(log), cands: {} }; }
  function finish(state, log) { var c = choose(state.cands, state.recent); return c ? dress(c, log) : null; }
  // Synchronous (tests, or a Web Worker): returns the tip or null.
  function analyse(log, opts) {
    try { var s = begin(log, opts); while (!step(s, 1e9)) { /* keep going */ } return finish(s, log); } catch (e) { return null; }
  }
  // On the page: small slices with setTimeout so the picture never freezes. cb(tip or null), always called once.
  function analyseAsync(log, opts, cb) {
    var s;
    try { s = begin(log, opts); } catch (e) { cb(null); return; }
    (function tick() {
      var done;
      try { done = step(s, 30); } catch (e) { cb(null); return; }
      if (done) { var t = null; try { t = finish(s, log); } catch (e) { t = null; } cb(t); }
      else setTimeout(tick, 0);
    })();
  }

  // ---- Words (an 8-year-old's reading level) and the picture ----
  var SPACED = { '+': 1, '-': 1, '*': 1, '/': 1, 'm': 1 };
  function exprText(tokens) {
    return tokens.map(sym).map(function (s) { var t = Eq.SHOW[s] || s; return SPACED[s] ? ' ' + t + ' ' : t; }).join('').replace(/\s+/g, ' ').trim();
  }
  function wildNote(w) { return typeof w === 'number' && w !== 0 ? ' (every 0 stands for ' + w + ')' : ''; }
  function cubeWord(s) { return 'the ' + (Eq.SHOW[s] || s) + (Eq.isDigit(s) ? '' : ' cube'); }
  // What the extra Resource cube in a Now! Solution is (null if the mat alone makes it).
  function extraCube(tokens, st, fr) {
    var req = st.req.slice(), perm = st.perm.slice(), extra = null, multi = Eq.rulesOf(fr).multi;
    tokens.map(sym).forEach(function (s) {
      if (isParen(s)) return;
      var k = req.indexOf(s); if (k >= 0) { req.splice(k, 1); return; }
      k = perm.indexOf(s); if (k >= 0) { perm.splice(k, 1); return; }
      if (s === 'm' && (k = perm.indexOf('/')) >= 0) { perm.splice(k, 1); return; }
      if (multi && !Eq.isDigit(s) && (st.req.indexOf(s) >= 0 || st.perm.indexOf(s) >= 0)) return; // an operation used again (Use It Again card)
      if (extra === null) extra = s;
    });
    return extra;
  }
  // Colour solution tokens like the cubes they would use (Required, then Permitted, then Resources).
  function colourise(tokens, cubes, mode) {
    var m = byZone(cubes), pool = m.required.concat(m.permitted, mode === 'last' ? [] : m.resources.filter(function (c) { return !c.l; })), used = {};
    return tokens.map(function (t) {
      var s = sym(t);
      if (isParen(s)) return s;
      if (typeof t === 'object' && t.c) return { s: s, c: t.c };
      var want = s === 'm' ? '/' : s, c = pool.find(function (x) { return x.s === want && !used[x.i]; });
      if (c) used[c.i] = 1;
      return { s: s, c: c ? c.c : 'none' };
    });
  }
  function picture(c) {
    var m = byZone(c.cubes), f = function (x) { return { s: x.s, c: x.c, hl: x.i === c.hl }; };
    var pic = { goal: (c.ctx.g.gt || []).map(function (t) { return typeof t === 'string' ? t : { s: t.s, c: t.c }; }), goalVal: Eq.fmt(c.ctx.g.goal),
      required: m.required.map(f), permitted: m.permitted.map(f), forbidden: m.forbidden.filter(function (x) { return !x.l; }).map(f),
      resources: m.resources.filter(function (x) { return !x.l; }).map(f), sol: null };
    var sol = c.kind === 'safe' ? (c.oppSol || null) : c.kind === 'goal' ? null : (c.sol || null);
    if (sol) { pic.sol = colourise(sol, c.cubes, c.mode); pic.solVal = Eq.fmt(c.ctx.g.goal); }
    return pic;
  }
  function words(c, opp) {
    var g = Eq.fmt(c.ctx.g.goal), sh = 'In shake ' + c.ctx.shake + ', ', o = c.ctx.opp, L = [];
    var oppDid = !o ? '' : o.k === 'goal' ? sh + opp + ' set the Goal ' + g + '.' :
      (c.st && c.st.res.length === 0 ? sh + opp + ' played the last cube: ' + cubeWord(o.s) + ' in ' + ZN[o.zone] + '.' : sh + opp + ' put ' + cubeWord(o.s) + ' in ' + ZN[o.zone] + '.');
    switch (c.kind) {
      case 'now':
        var x = extraCube(c.sol, c.st, c.ctx.at.fr);
        L.push(oppDid);
        L.push('After that, ' + exprText(c.sol) + ' could make ' + g + wildNote(c.wild) + (x ? ' with just one more cube, ' + cubeWord(x) + '.' : ' with the cubes already on the mat.'));
        L.push('That is a Now! moment. Next time, look for it!');
        break;
      case 'imp':
        L.push(oppDid);
        L.push(o.k === 'goal' ? 'With these cubes, no Solution could ever make ' + g + '. Pip checked every way!' : 'After that, no Solution could make ' + g + ' any more. Pip checked every way!');
        L.push('That is an Impossible! moment. Next time, look for it!');
        break;
      case 'safe':
        L.push(sh + 'you put ' + cubeWord(c.ctx.at.s) + ' in ' + ZN[c.ctx.at.zone] + '.');
        L.push(c.handed === 'now' ? 'That gave ' + opp + ' a Now! chance: ' + exprText(c.oppSol) + ' = ' + g + wildNote(c.oppWild) + '.'
          : 'After that, ' + g + ' could not be made any more, so ' + opp + ' had an Impossible! chance.');
        L.push('Pip found a safe move: ' + cubeWord(c.alt.s) + ' in ' + ZN[c.alt.zone] + '. Then ' + opp + ' had nothing to call!');
        break;
      case 'solution':
        if (c.variant === 'short') {
          L.push(sh + 'you made ' + g + ' with ' + c.mine + ' cubes. Great work!');
          L.push('Pip found a shorter way with only ' + c.theirs + ': ' + exprText(c.sol) + wildNote(c.wild) + '.');
          L.push('Short Solutions are quick to write!');
        } else {
          var x2 = c.mode === 'now' ? extraCube(c.sol, c.st, c.ctx.at.fr) : null;
          L.push(sh + (c.mode === 'now' ? 'you called Now! and' : 'you') + ' looked for a Solution for ' + g + '.');
          L.push('Pip found one way: ' + exprText(c.sol) + wildNote(c.wild) + '.' + (x2 ? ' It uses one more cube, ' + cubeWord(x2) + '.' : ''));
          L.push('Can you spot it in the picture?');
        }
        break;
      case 'goal':
        L.push(sh + 'you set the Goal ' + g + '.');
        L.push('Pip checked every way, and these cubes could not make ' + g + '.');
        L.push('A Goal like ' + exprText(c.alt) + (c.alt.length > 1 ? ' = ' + Eq.fmt(c.altVal) : '') + ' can be made: ' + exprText(c.sol) + wildNote(c.wild) + '. Fun to try next time!');
        break;
      case 'nice':
        if (c.variant === 'mover') {
          L.push(sh + opp + ' called Impossible! on your move.');
          L.push('You found ' + exprText(c.sol) + ' = ' + g + ' anyway.');
          L.push('Super thinking!');
        } else if (c.variant === 'imp') {
          if (oppDid) L.push(oppDid);
          L.push('You called Impossible! and ' + opp + ' could not make ' + g + '.');
          L.push('Great detective work!');
        } else {
          if (oppDid) L.push(oppDid);
          L.push('You spotted ' + exprText(c.sol) + ' = ' + g + ' and called Now!');
          L.push('Sharp eyes!');
        }
        break;
    }
    return L.filter(Boolean);
  }
  // The finished tip: { kind, variant, lines: [sentences], pic: {...} }
  function dress(c, log) {
    var opp = (log && log.opp) || 'your opponent';
    return { kind: c.kind, variant: c.variant || null, lines: words(c, opp), pic: picture(c), raw: c };
  }

  return { analyse: analyse, analyseAsync: analyseAsync, choose: choose, plan: plan, exprText: exprText, stOf: stOf,
    ORDER: ORDER, BUDGET: BUDGET, KID_DIGITS: KID_DIGITS };
})();

// ======================= RECORDER (page side) =======================
// Keeps the notes of the CURRENT match only (start() forgets the last one). Only matches against a
// creature (G.mode === 'ai', 2 players), only when Settings allows it (S.set.review !== false).
var Recorder = (function () {
  var log = null, MAX = 600;
  function copyCubes(cubes) { return cubes.map(function (c) { return { i: c.id, s: c.s, c: c.color, z: c.zone, o: c.order, l: c.locked ? 1 : 0 }; }); }
  function copyToks(list, cubes) {
    return (list || []).map(function (t) { if (typeof t === 'string') return t; var c = t && t.id != null && cubes[t.id]; return { s: t.s, c: c ? c.color : 'none' }; });
  }
  function start(g) {
    log = null;
    try {
      if (!g || g.mode !== 'ai' || !g.players || g.players.length !== 2 || g.players[0].ai || !g.players[1].ai) return;
      if (typeof S !== 'undefined' && S && S.set && S.set.review === false) return;
      log = { opp: g.players[1].name, notes: [] };
    } catch (e) { log = null; }
  }
  function note(kind, x) {
    if (!log || !x || !x.cubes || log.notes.length >= MAX) return;
    try {
      var n = { k: kind, by: x.by, goal: x.goal || null, fr: x.fr === undefined ? false : x.fr, cubes: copyCubes(x.cubes) };
      if (kind === 'goal') { n.gt = copyToks(x.goalTokens, x.cubes); n.shake = x.shake; }
      else if (kind === 'move') { n.i = x.id; n.s = x.cubes[x.id] ? x.cubes[x.id].s : '?'; n.zone = x.zone; }
      else if (kind === 'challenge') n.kind = x.kind;
      else if (kind === 'solution') { n.mode = x.mode; n.ok = !!x.ok; n.toks = x.tokens ? copyToks(x.tokens, x.cubes) : null; }
      log.notes.push(n);
    } catch (e) { /* never get in the way of the game */ }
  }
  function armed() { return !!log; }
  function take() { var l = log; log = null; return l; } // the match is over: hand the notes over and forget them
  function peek() { return log; }
  return { start: start, note: note, armed: armed, take: take, peek: peek };
})();

// ======================= REVIEW UI (page side) =======================
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var seq = 0, tip = null;
  function tally() {
    if (typeof S === 'undefined' || !S) return { seen: 0, kinds: {}, last: [] };
    if (!S.tips || typeof S.tips !== 'object') S.tips = { seen: 0, kinds: {}, last: [] };
    if (!S.tips.kinds) S.tips.kinds = {};
    if (!Array.isArray(S.tips.last)) S.tips.last = [];
    return S.tips;
  }
  function cubesRow(list, cls) {
    if (!list || !list.length) return '<span class="ps-empty">empty</span>';
    var fake = [], toks = list.map(function (t, k) { if (typeof t === 'string') return t; fake[k] = { color: t.c || 'none' }; return { s: t.s, id: k }; });
    var html = typeof tokensHTML === 'function' ? tokensHTML(toks, fake, cls || 'tiny') : '';
    // mark the cube that just moved
    var hl = list.map(function (t) { return typeof t === 'object' && t.hl; }), k = 0;
    return html.replace(/<span class="cube /g, function (m) { var on = hl[k++]; return on ? '<span class="cube ps-hl ' : m; });
  }
  function picHTML(p) {
    function zone(cls, title, list) { return '<div class="ps-zone ' + cls + '"><b>' + title + '</b><div class="ps-cubes">' + cubesRow(list) + '</div></div>'; }
    return '<div class="ps-pic">' +
      '<div class="ps-zone ps-goal"><b>🎯 Goal = ' + esc(p.goalVal) + '</b><div class="ps-cubes">' + cubesRow(p.goal) + '</div></div>' +
      '<div class="ps-row">' + zone('ps-req', '✅ Required', p.required) + zone('ps-perm', '👍 Permitted', p.permitted) + zone('ps-forb', '⛔ Forbidden', p.forbidden) + '</div>' +
      zone('ps-res', '🎲 Resources', p.resources) +
      (p.sol ? '<div class="ps-sol"><div class="ps-cubes">' + cubesRow(p.sol) + '<span class="ps-eq">= ' + esc(p.solVal) + '</span></div></div>' : '') +
      '</div>';
  }
  function buttonHTML() { return '<button class="btn small yellow ps-btn" data-act="pipSpot">💡 One thing Pip spotted</button>'; }
  function cardHTML(t) {
    var face = typeof pipHTML === 'function' ? pipHTML(t.kind === 'nice' ? 'cheer' : 'think', 48, '') : '';
    return '<div class="ps-card"><div class="ps-head">' + face + '<h3>' + (t.kind === 'nice' ? '⭐ A moment Pip loved' : '💡 One thing Pip spotted') + '</h3></div>' +
      picHTML(t.pic) + '<div class="ps-words">' + t.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>' +
      '<div class="row"><button class="btn green small" data-act="pipSpotDone">Got it</button></div></div>';
  }
  // Put this in the match-end html (an empty spot; the button appears in it only if Pip found something).
  Review.slotHTML = function () { if (!Recorder.armed()) return ''; seq++; return '<div id="pipSpot" class="ps-slot" data-tok="' + seq + '"></div>'; };
  // Call right after modal(html) at the end of the match. Thinks for at most ~1.5 s, in small slices.
  Review.afterMatch = function () {
    var lg = Recorder.take(), my = seq;
    tip = null;
    if (!lg || !lg.notes.length) return;
    Review.analyseAsync(lg, { recent: tally().last }, function (t) {
      var el = document.getElementById('pipSpot');
      if (!t || !el || el.dataset.tok !== String(my)) return; // the match-end screen is gone, or another match ended
      tip = t; el.innerHTML = buttonHTML();
    });
  };
  Review.current = function () { return tip; };
  if (typeof ACT === 'undefined') return;
  ACT.pipSpot = function () {
    var el = document.getElementById('pipSpot'); if (!el || !tip) return;
    if (!tip.counted) {
      tip.counted = true;
      var T = tally(); T.seen = (T.seen || 0) + 1; T.kinds[tip.kind] = (T.kinds[tip.kind] || 0) + 1;
      T.last.push(tip.kind); while (T.last.length > 2) T.last.shift();
      if (typeof persist === 'function') persist();
    }
    if (typeof Snd !== 'undefined' && Snd.pop) Snd.pop();
    el.innerHTML = cardHTML(tip);
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  ACT.pipSpotDone = function () { var el = document.getElementById('pipSpot'); if (el) el.innerHTML = buttonHTML(); if (typeof Snd !== 'undefined' && Snd.click) Snd.click(); };
})();
