'use strict';
// ======================= WHY DID THEY DO THAT? =======================
// After a move, a small "🤔 Why?" button explains what that move CHANGED, in kid words, with the cubes
// drawn as cubes. A teaching aid about the move already made, never a hint for the next one.
//
//   Engine (pure)  Why.analyze(input, opts) -> { facts, text } computed with Eq.solve under small caps.
//                  Why.facts / Why.compose are the two halves. Needs only Eq; tests/why.test.js runs it in node.
//   UI (page)      Why.note('move', {before, cubeId, zone, who}) from game.js placeCube (before the cube moves),
//                  Why.buttonHTML() in the action bar, Why.shakeHTML() in the end-of-shake pop-up,
//                  Why.reset() at a new shake, Why.settingsHTML() for Settings (S.set.why, on by default).
//
// HONESTY RULES (the owner's):
//   - Every sentence is backed by a solver result: a Solution the engine found AND Eq.checkSolution accepts,
//     or a search the engine says was COMPLETE (every Solution with up to 6 number cubes looked at, and
//     there were no more number cubes than that). Anything else is "unknown" and the text says less.
//   - Counts are lower bounds ("I found 2 ways"), never "there are only 2".
//   - It never says what to play next. While the shake is still going and somebody other than the mover
//     could still challenge, the card leaves out whether Now! or Impossible! is true after the move (that
//     would be a hint); the end-of-shake pop-up tells the whole story.
//   - Never "mistake", "wrong", "should". The kid's own moves get the same neutral words.
//
// input = { cubes: [{id, s, zone, color?, locked?, order?}] (BEFORE the move), id, zone: 'required' |
//           'permitted' | 'forbidden', goal: {n,d}, fractions: the math mode exactly as G.fractions,
//           name: 'Rusty', mine: true for the kid's own move, taste: {text, syms} or null }
// opts  = { live: true = the shake is still on (leave out the after-move challenge facts),
//           sliceMs: cap per solver call, budgetMs: cap for the whole analysis, cache: {} to reuse }
var Why = (function () {
  var MAXD = 6;            // number cubes the solver looks at (the engine's own top limit)
  var SLICE = 120;         // ms per solver call (one call = one slice on the page)
  var BUDGET = 1400;       // ms for one move's whole analysis
  var WAYCAP = 4;          // count different ways up to this many ("lots")
  var ZN = { required: 'Required', permitted: 'Permitted', forbidden: 'Forbidden' };
  var PAUSE = { pause: true }; // thrown when the page's one-call-per-slice allowance is used up (see run())

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function show(s) { return (Eq.SHOW && Eq.SHOW[s]) || s; }
  function sym(t) { return typeof t === 'string' ? t : t.s; }
  function copyCubes(cubes) {
    return (cubes || []).map(function (c) { return { id: c.id, s: c.s, zone: c.zone, color: c.color, locked: !!c.locked, order: c.order || 0 }; });
  }
  function byOrder(a, b) { return (a.order || 0) - (b.order || 0) || a.id - b.id; }
  function zoneOf(cubes, z) { return cubes.filter(function (c) { return c.zone === z; }).sort(byOrder); }
  // The mat as the solver wants it (the same lists game.js snapshot() builds).
  function stOf(cubes) {
    var f = function (z) { return zoneOf(cubes, z).map(function (c) { return c.s; }); };
    return { req: f('required'), perm: f('permitted'), res: f('resources') };
  }
  function applyMove(cubes, id, zone) {
    var out = copyCubes(cubes), mx = 0;
    out.forEach(function (c) { if (c.order > mx) mx = c.order; });
    out.forEach(function (c) { if (c.id === id) { c.zone = zone; c.order = mx + 1; } });
    return out;
  }
  function key(p) { return [p.mode, p.req.join(''), p.opt.join(''), p.res.join('')].join('|'); }
  function vEq(a, b) { return !!(a && b && a.n === b.n && a.d === b.d); }

  // ---- One solver question ----
  // A "question" is {mode, req, opt, res, cubes (for the check), ctxMode}. Answer: {r: 'yes'|'no'|'?', tokens?, ms}
  //   yes = a Solution the engine found and Eq.checkSolution accepted on these cubes (tokens point at real cubes)
  //   no  = the search was complete and found nothing        ? = ran out of time / skipped / not checkable
  function ask(q, ctx) {
    var k = key(q), hit = ctx.cache[k];
    if (hit && (hit.r !== '?' || hit.cap >= ctx.slice)) return hit;
    if (ctx.st.spent >= ctx.budget) return { r: '?', skipped: true, ms: 0, cap: 0 };
    if (ctx.allow !== undefined) { if (ctx.allow <= 0) throw PAUSE; ctx.allow--; }
    var t0 = now(), a;
    try {
      var res = Eq.solve({ goal: ctx.goal, req: q.req, opt: q.opt, res: q.res, mode: q.mode, fractions: ctx.fractions,
        maxDigits: MAXD, timeMs: Math.max(5, Math.min(ctx.slice, ctx.budget - ctx.st.spent)) });
      if (res.found) a = verify(res, q, ctx);
      else a = { r: res.complete ? 'no' : '?' };
    } catch (e) { a = { r: '?', err: String(e && e.message || e) }; }
    a.ms = now() - t0; a.cap = ctx.slice;
    ctx.st.spent += a.ms; ctx.st.calls++; if (a.ms > ctx.st.worst) ctx.st.worst = a.ms;
    ctx.cache[k] = a;
    return a;
  }
  // Turn the solver's symbols into real cubes and let the engine's own checker agree, or it does not count.
  function verify(res, q, ctx) {
    var pools = q.cubes.filter(function (c) { return c.zone === 'required'; }).sort(byOrder)
      .concat(q.cubes.filter(function (c) { return c.zone === 'permitted'; }).sort(byOrder),
        q.cubes.filter(function (c) { return c.zone === 'resources'; }).sort(byOrder));
    var toks;
    try { toks = Eq.cubeTokens(res.tokens, pools, ctx.fractions); } catch (e) { return { r: '?', bad: 'map' }; }
    if (toks.some(function (t) { return typeof t === 'object' && t.id < 0; })) return { r: '?', bad: 'map' };
    var chk = Eq.checkSolution(toks, solCtx(q.cubes, q.ctxMode || q.mode, ctx));
    if (!chk.ok) return { r: '?', bad: 'check', reasons: chk.reasons };
    return { r: 'yes', tokens: toks, wild: chk.wildAs, n: Eq.cubeCount(toks) };
  }
  function solCtx(cubes, mode, ctx) {
    var by = {}; cubes.forEach(function (c) { by[c.id] = c; });
    return { goal: ctx.goal, zone: function (id) { return by[id] ? by[id].zone : 'forbidden'; },
      required: cubes.filter(function (c) { return c.zone === 'required'; }).map(function (c) { return c.id; }),
      mode: mode, fractions: ctx.fractions, label: function (id) { return by[id] ? show(by[id].s) : '?'; } };
  }

  // ---- The questions ----
  function Q(cubes, mode) { var st = stOf(cubes); return { mode: mode, req: st.req, opt: st.perm, res: st.res, cubes: cubes }; }
  function nowAllowed(cubes) { var st = stOf(cubes); return st.res.length >= 2 && st.req.length + st.perm.length > 0; }
  function faceKey(toks) {
    return toks.filter(function (t) { return typeof t === 'object'; }).map(function (t) { return Eq.cubeOf(t.s) || t.s; }).sort().join(' ');
  }
  // Different ways (different sets of cubes) to make the Goal, counted up to WAYCAP. A lower bound:
  // after each way it looks again with one of that way's free cubes taken out, so the next one differs.
  function countWays(cubes, ctx, first) {
    var found = [], keys = {}, tried = {}, queue = [cubes], calls = 0;
    if (first && first.r === 'no') return { n: 0, sure: true };
    if (first && first.r === 'yes') { found.push(first.tokens); keys[faceKey(first.tokens)] = 1; queue = []; push(first.tokens, cubes); }
    while (queue.length && found.length < WAYCAP && calls < 7 && ctx.st.spent < ctx.budget) {
      var cs = queue.shift(), a = ask(Q(cs, 'impossible'), ctx); calls++;
      if (a.r !== 'yes') continue;
      var k = faceKey(a.tokens);
      if (!keys[k]) { keys[k] = 1; found.push(a.tokens); }
      push(a.tokens, cs);
    }
    return { n: found.length, sure: false };
    function push(toks, base) {
      toks.forEach(function (t) {
        if (typeof t !== 'object') return;
        var c = base.filter(function (x) { return x.id === t.id; })[0];
        if (!c || c.zone === 'required') return;
        var tk = base.filter(function (x) { return x.zone === 'forbidden'; }).map(function (x) { return x.id; }).concat([c.id]).sort().join(',');
        if (tried[tk]) return; tried[tk] = 1;
        queue.push(applyMove(base, c.id, 'forbidden'));
      });
    }
  }

  // ---- The facts about one move ----
  // Returns { sym, face, zone, name, mine, live, possB, possA, use, avoid, nowB, nowA, waysB, waysA, resLeft,
  //           last, liked, taste, spent, calls, worst }. Each solver fact is {r: 'yes'|'no'|'?'|'na', tokens?}.
  //   use   = a way (before the move) that USES the moved cube     avoid = a way that does NOT use it
  function facts(input, opts) {
    opts = opts || {};
    var cubes = copyCubes(input.cubes), mv = cubes.filter(function (c) { return c.id === input.id; })[0];
    if (!mv || mv.zone !== 'resources' || !ZN[input.zone] || !input.goal) return null;
    var ctx = { goal: input.goal, fractions: input.fractions, cache: opts.cache || {}, slice: opts.sliceMs || SLICE,
      budget: opts.budgetMs || BUDGET, allow: opts.allow, st: opts.state || { spent: 0, calls: 0, worst: 0 } };
    var z = input.zone, after = applyMove(cubes, input.id, z), U = { r: '?' };
    var withIt = applyMove(cubes, input.id, 'required'), without = applyMove(cubes, input.id, 'forbidden');
    var F = { sym: mv.s, face: Eq.cubeOf(mv.s) || mv.s, id: mv.id, zone: z, name: input.name || 'They', mine: !!input.mine,
      live: !!opts.live, resLeft: stOf(after).res.length, before: cubes, after: after };
    F.last = F.resLeft === 0;
    // 1. Could the Goal be made before the move (all Required, any Permitted and Resources)?
    F.possB = ask(Q(cubes, 'impossible'), ctx);
    var none = F.possB.r === 'no' ? { r: 'no' } : null;      // no way before: no way with or without the cube
    // 2. The question that tells what changed. By the rules: after Forbidden = "a way without it";
    //    after Required = "a way with it"; Permitted changes neither (Resources already count as Permitted).
    if (z === 'forbidden') {
      F.use = none || ask(Q(withIt, 'impossible'), ctx);
      F.avoid = none || (F.use.r === 'no' && F.possB.r === 'yes' ? F.possB : ask(Q(without, 'impossible'), ctx));
      F.possA = F.avoid;
    } else if (z === 'required') {
      F.use = none || ask(Q(withIt, 'impossible'), ctx);
      F.avoid = none || (F.use.r === 'no' && F.possB.r === 'yes' ? F.possB : ask(Q(without, 'impossible'), ctx));
      F.possA = F.use;
    } else { F.use = U; F.avoid = U; F.possA = F.possB; }
    // Plain logic: a way with (or without) the cube is a way before the move; "with" and "without" can't both be "no" if one exists.
    [F.use, F.avoid].forEach(function (x) { if (x.r === 'yes' && F.possB.r !== 'yes') F.possB = x; });
    if (F.use.r === 'no' && F.avoid.r === 'no') F.possB = { r: 'no' };
    // 3. Now! = the mat plus at most ONE Resource cube (only where Now! may be called: 2+ Resources, a cube on the mat).
    F.nowOkA = nowAllowed(after); F.nowOkB = nowAllowed(cubes);
    F.nowA = !F.nowOkA ? { r: 'na' } : F.possA.r === 'no' ? { r: 'no' } : ask(Q(after, 'now'), ctx);
    F.nowB = !F.nowOkB ? { r: 'na' } : F.possB.r === 'no' ? { r: 'no' } : ask(Q(cubes, 'now'), ctx);
    // 4. How many different ways before and after (only Forbidden and Required can change it).
    if (z !== 'permitted') { F.waysB = countWays(cubes, ctx, F.possB); F.waysA = countWays(after, ctx, F.possA); }
    // 5. Taste (js/config.js likes.syms): a favourite cube kept in play.
    var t = input.taste || null;
    F.liked = !!(t && t.syms && t.syms.indexOf(F.face) >= 0 && z !== 'forbidden');
    F.taste = t && t.text ? t.text : '';
    F.spent = Math.round(ctx.st.spent); F.calls = ctx.st.calls; F.worst = Math.round(ctx.st.worst);
    return F;
  }

  // ======================= The words =======================
  // compose(F) -> { head, lines: [sentences], ex: {tokens, when, label} | null, note, score, kinds: [...] }
  // Candidate sentences each carry a priority p and a kind; the best two are kept (in story order),
  // so every mix of facts reads as 1 to 3 short true sentences. "Live" leaves out after-move challenge facts
  // and any example that is still a Solution after the move.
  function tokText(toks) {
    return toks.map(function (t) { var s = sym(t); return s === '(' || s === ')' ? s : s === 'a' ? '+' : show(s); }).join(' ') // (Average card: the kid sees a + cube)
      .replace(/\( /g, '(').replace(/ \)/g, ')');
  }
  function many(n) { return n >= WAYCAP ? 'lots of ways' : n >= 2 ? 'a few ways' : n === 1 ? 'one way' : 'no way'; }
  function Y(x) { return !!x && x.r === 'yes'; }
  function N(x) { return !!x && x.r === 'no'; }
  function tasteLine(F) {
    var t = (F.taste || '').trim();
    if (!/^Loves /.test(t)) return '';
    return 'Maybe that\'s why: ' + F.name + ' l' + t.slice(1).replace(/\.?$/, '.');
  }
  function compose(F) {
    if (!F) return null;
    var c = 'the ' + show(F.sym), C = 'The ' + show(F.sym), who = F.mine ? 'You' : F.name, full = !F.live, z = F.zone;
    var L = [], add = function (p, kind, text, ex) { L.push({ p: p, kind: kind, text: text, ex: ex || null, i: L.length }); };
    var head = z === 'forbidden' ? who + ' put ' + c + ' in Forbidden, so nobody may use it now.'
      : z === 'required' ? who + ' put ' + c + ' in Required, so every Solution must use it now.'
      : who + ' put ' + c + ' in Permitted, so it may be used or left out.';
    var exUse = Y(F.use) ? { tokens: F.use.tokens, when: 'before' } : null, exAvoid = Y(F.avoid) ? { tokens: F.avoid.tokens, when: 'before' } : null;
    if (N(F.possB)) {
      if (full) add(99, 'never', 'Even before this move there was no way to make the Goal, so this move didn\'t change that.');
    } else if (z === 'forbidden') {
      if (Y(F.use)) add(90, 'lost', 'Before, ' + tokText(F.use.tokens) + ' made the Goal, but it uses ' + c + ', so that way is gone.', exUse);
      else if (N(F.use)) add(85, 'unused', C + ' wasn\'t part of any way to make the Goal, so forbidding it takes no way away.');
      else add(40, 'unsure', 'I couldn\'t find a way that uses ' + c + ', so I can\'t tell if forbidding it took a way away.');
      if (full && Y(F.use) && Y(F.possA)) add(80, 'still', F.waysA && F.waysA.n >= 2 ? 'I can still find ' + many(F.waysA.n) + ' to make the Goal without it.' : 'I can still find another way to make the Goal without it.', { tokens: F.possA.tokens, when: 'after' });
    } else if (z === 'required') {
      if (Y(F.avoid)) add(90, 'ruledout', 'Before, ' + tokText(F.avoid.tokens) + ' made the Goal without ' + c + ', but now that doesn\'t count, because it leaves out a Required cube.', exAvoid);
      else if (N(F.avoid)) add(85, 'needed', 'Every way to make the Goal already used ' + c + ', so this takes no way away.', full ? exUse : null);
      else add(40, 'unsure', 'I can\'t tell for sure if a way without ' + c + ' was lost.');
      if (full && Y(F.avoid) && Y(F.possA)) add(80, 'still', 'There is still a way that uses ' + c + ', like ' + tokText(F.possA.tokens) + '.', { tokens: F.possA.tokens, when: 'after' });
    } else {
      add(60, 'quietperm', 'Moving a cube to Permitted never takes a way away, so it doesn\'t block anything.');
    }
    if (full && !N(F.possB) && z !== 'permitted') {
      if (N(F.possA)) add(100, 'gone', F.mine ? 'Now there is no way left to make the Goal, so if someone calls Impossible!, you would have to show a Solution, and there isn\'t one.'
        : 'Now there is no way left to make the Goal at all, so Impossible! is true.');
      else if (F.possA.r === '?' && (Y(F.use) || Y(F.avoid) || F.possB.r === '?')) add(70, 'maybegone', 'I couldn\'t find a way that is still allowed, so I can\'t be sure one is left.');
    }
    if (full && Y(F.nowA)) add(Y(F.nowB) ? 75 : 95, 'now', 'With the cubes on the mat plus just one more from Resources, the Goal can be made now, so somebody could call Now!', { tokens: F.nowA.tokens, when: 'now' });
    else if (full && N(F.nowA) && Y(F.possA)) add(62, 'quiet', 'Nobody can call Now! right after it, and the Goal can still be made: a safe, quiet move.');
    if (full && z !== 'permitted' && F.waysB && F.waysA && F.waysB.n > F.waysA.n && F.waysA.n > 0 && Y(F.possB))
      add(55, 'fewer', 'Before, I could find ' + many(F.waysB.n) + ' to make the Goal; now I can find ' + many(F.waysA.n) + '.');
    if (F.last) add(88, 'last', 'That was the last Resource cube, so now everyone writes a Solution from the mat (unless someone calls Impossible!).');
    else if (F.resLeft === 1) add(45, 'one', 'Only one cube is left in Resources, and it can\'t go in Forbidden.');
    else if (F.resLeft <= 3) add(30, 'low', 'Only ' + F.resLeft + ' cubes are left in Resources.');
    return pick(F, head, L);
  }
  // Priority order for the end-of-shake pop-up: made the Goal impossible > made Now! possible > took a way
  // away (Forbidden) or ruled one out (Required) > the last cube > the rest (quiet moves are never picked).
  var IMP = { gone: 100, lost: 90, ruledout: 90, last: 65, never: 55, unused: 40, needed: 40, maybegone: 30, quiet: 20, quietperm: 10, unsure: 10, one: 10, low: 5 };
  var EXLABEL = { before: 'Before the move:', after: 'Still works:', now: 'With one cube from Resources:' };
  function pick(F, head, L) {
    var top = L.slice().sort(function (a, b) { return b.p - a.p || a.i - b.i; });
    var best = top.length ? top[0].p : 0, neutral = best <= 62, keep = top.slice(0, neutral ? 1 : 2);
    var lines = keep.slice().sort(function (a, b) { return a.i - b.i; }).map(function (x) { return x.text; });
    var kinds = keep.map(function (x) { return x.kind; });
    // Personality only when the facts are quiet, only for a creature (never the kid), and only as a "maybe".
    if (neutral && !F.mine && F.isAI) {
      var t = F.liked ? tasteLine(F) : '';
      if (t) { lines.push(t); kinds.push('taste'); }
      else if (F.zone === 'forbidden') { lines.push('I can\'t be sure why ' + F.name + ' picked that cube.'); kinds.push('shrug'); }
      else { lines.push('I can\'t be sure why. Maybe ' + F.name + ' just likes ' + (Eq.isDigit(F.face) ? show(F.face) + 's' : 'that cube') + '!'); kinds.push('shrug'); }
    }
    var ex = null;
    for (var i = 0; i < keep.length && !ex; i++) {
      var e = keep[i].ex;
      if (e && e.tokens && (!F.live || e.when === 'before')) ex = { tokens: e.tokens, when: e.when, label: EXLABEL[e.when] };
    }
    // How important the move was (for the end-of-shake pop-up): the biggest change among ALL the facts.
    var score = 0; L.forEach(function (x) { var v = x.kind === 'now' ? x.p : (IMP[x.kind] || 0); if (v > score) score = v; });
    return { head: head, lines: lines, ex: ex, kinds: kinds, score: score + (score && !F.mine ? 3 : 0),
      note: F.live ? 'I\'ll tell you the rest after the shake, so I don\'t spoil your turn.' : '' };
  }
  // facts + words in one go (synchronous: node tests, and the page through run() below).
  function analyze(input, opts) {
    var F = facts(input, opts);
    if (!F) return null;
    F.isAI = !!input.isAI;
    return { facts: F, text: compose(F) };
  }
  // Runs analyze() one solver call at a time. step(fn) schedules the next slice (setTimeout on the page;
  // omit it to run straight through). The cache makes every re-run free up to the next new question.
  function run(input, opts, done, step) {
    opts = Object.assign({}, opts || {}); opts.cache = opts.cache || {}; opts.state = opts.state || { spent: 0, calls: 0, worst: 0 };
    var t0 = now(), worstSlice = 0;
    function go() {
      var s0 = now(), r;
      try { r = analyze(input, Object.assign({}, opts, { allow: step ? 1 : undefined })); }
      catch (e) {
        if (e !== PAUSE) { done(null, e); return; }
        worstSlice = Math.max(worstSlice, now() - s0); step(go); return;
      }
      worstSlice = Math.max(worstSlice, now() - s0);
      if (r) { r.facts.wall = Math.round(now() - t0); r.facts.worstSlice = Math.round(worstSlice); }
      done(r);
    }
    go();
  }


  var api = { analyze: analyze, facts: facts, compose: compose, run: run, applyMove: applyMove, stOf: stOf, tokText: tokText,
    LIMITS: { maxDigits: MAXD, sliceMs: SLICE, budgetMs: BUDGET, wayCap: WAYCAP } };
  // ======================= UI (page side) =======================
  if (typeof window === 'undefined' || typeof document === 'undefined') return api;
  var NOTES = [], SEQ = 0, QUEUE = [], WORKING = null, OPEN = null;
  var BG = { sliceMs: 40, budgetMs: 1200 };          // background: small slices while the game goes on
  var FG = { sliceMs: 120, budgetMs: 1400 };         // the kid is waiting on the card: a little bigger
  function escH(s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hasG() { return typeof G !== 'undefined' && G; }
  // On: the Setting (S.set.why, on unless switched off), a real match (not online, not the guided tutorial).
  function on() {
    if (typeof S === 'undefined' || !S || !S.set || S.set.why === false) return false;
    return !!(hasG() && G.mode !== 'online' && G.mode !== 'tutorial' && G.goal);
  }
  function aiOf(who) { return hasG() && G.players && G.players[who] && G.players[who].ai || null; }
  // game.js placeCube calls this BEFORE the cube moves: Why.note('move', {before: G.cubes, cubeId, zone, who}).
  function note(kind, d) {
    if (kind !== 'move' || !d || !on()) return;
    var who = d.who, ai = aiOf(who), P = G.players && G.players[who];
    var n = { seq: ++SEQ, shake: G.shake, who: who, id: d.cubeId, zone: d.zone, isAI: !!ai, mine: who === 0 && !ai,
      input: { cubes: copyCubes(d.before || G.cubes), id: d.cubeId, zone: d.zone, goal: G.goal ? { n: G.goal.n, d: G.goal.d } : null,
        fractions: G.fractions, name: P ? String(P.name || '').replace(/<[^>]+>/g, '') : 'They', isAI: !!ai, mine: who === 0 && !ai,
        taste: ai ? { text: ai.taste || '', syms: (ai.likes && ai.likes.syms) || [] } : null },
      F: null, busy: false, err: null };
    var c = n.input.cubes.filter(function (x) { return x.id === d.cubeId; })[0];
    if (!c || c.zone !== 'resources' || !n.input.goal) return;
    n.sym = c.s; NOTES.push(n); if (NOTES.length > 40) NOTES.shift();
    QUEUE.push(n); pump();
  }
  function reset() { NOTES = []; QUEUE = []; WORKING = null; closeCard(); }
  // One analysis at a time, one solver call per slice, with a breath between slices for the picture.
  function pump() {
    if (WORKING || !QUEUE.length) return;
    var n = QUEUE.shift(); if (n.F || n.busy) { pump(); return; }
    WORKING = n; n.busy = true;
    var fg = OPEN && OPEN.n === n, gen = NOTES;
    run(n.input, fg ? FG : BG, function (r, e) {
      n.busy = false; if (WORKING === n) WORKING = null;
      if (gen !== NOTES) return;                      // a new shake started meanwhile
      if (r) n.F = r.facts; else n.err = e || 'none';
      if (OPEN && OPEN.n === n) renderCard();
      refreshShake();
      pump();
    }, function (fn) { setTimeout(fn, (OPEN && OPEN.n === n) ? 0 : 24); });
  }
  function latest() { return NOTES.length ? NOTES[NOTES.length - 1] : null; }
  function stillLatest(n) {
    return !!(n && hasG() && G.phase === 'move' && n.shake === G.shake && G.lastMover === n.who && G.cubes && G.cubes[n.id] && G.cubes[n.id].zone === n.zone);
  }
  // Live = the shake is on, this is the latest move, and a person other than the mover could still challenge it.
  function liveFor(n) {
    if (!stillLatest(n)) return false;
    return G.players.some(function (p, i) { return i !== n.who && !p.ai; });
  }
  function textFor(n, live) {
    if (!n.F) return null;
    var F = Object.assign({}, n.F, { live: live, isAI: n.isAI });
    return compose(F);
  }
  // ---- Buttons ----
  function buttonHTML() {
    var n = latest();
    if (!on() || !n || !stillLatest(n) || G.carrying) return '';
    return '<button class="btn small why-btn" data-act="whyOpen" data-arg="' + n.seq + '" title="What did that move change?">🤔 ' + (n.mine ? 'What did my move do?' : 'Why?') + '</button>';
  }
  function shakeLabel(n) {
    var c = show(n.sym);
    if (n.mine) return 'What did my ' + c + ' in ' + ZN[n.zone] + ' do?';
    var name = n.input.name;
    return n.zone === 'forbidden' ? 'Why did ' + name + ' forbid the ' + c + '?' : n.zone === 'required' ? 'Why did ' + name + ' make the ' + c + ' Required?' : 'Why did ' + name + ' put the ' + c + ' in Permitted?';
  }
  // The two most important moves of this shake (score from the full story; quiet moves are left out).
  function topMoves() {
    var sh = hasG() ? G.shake : null;
    return NOTES.filter(function (n) { return n.shake === sh && n.F; })
      .map(function (n) { return { n: n, t: textFor(n, false) }; })
      .filter(function (x) { return x.t && x.t.score >= 75; })
      .sort(function (a, b) { return b.t.score - a.t.score || b.n.seq - a.n.seq; }).slice(0, 2)
      .sort(function (a, b) { return a.n.seq - b.n.seq; });
  }
  function shakeInner() {
    return topMoves().map(function (x) { return '<button class="btn small why-btn" data-act="whyOpen" data-arg="' + x.n.seq + '">🤔 ' + escH(shakeLabel(x.n)) + '</button>'; }).join('');
  }
  function shakeHTML() {
    if (!on()) return '';
    return '<div class="why-shake" id="whyShake">' + shakeInner() + '</div>';
  }
  function refreshShake() { var el = document.getElementById('whyShake'); if (el) el.innerHTML = shakeInner(); }
  // ---- The card (the Explain card's look: its own layer just above the pop-ups) ----
  function cubeMap(cubes) { var m = {}; (cubes || []).forEach(function (c) { m[c.id] = { color: c.color || 'none' }; }); return m; }
  function drawTokens(toks, cubes, mode) {
    var cols = cubeMap(cubes);
    if (window.Vari && Vari.exprHTML) return Vari.exprHTML(toks, cols, mode);
    if (typeof tokensHTML === 'function') return tokensHTML(toks, cols);
    return escH(tokText(toks));
  }
  var ZICON = { required: '✅', permitted: '👍', forbidden: '⛔' };
  function moveHTML(n) {
    var c = n.input.cubes.filter(function (x) { return x.id === n.id; })[0];
    return '<div class="why-move"><span class="why-who">' + escH(n.mine ? 'You' : n.input.name) + '</span>' +
      '<span class="expr vari-expr why-cube">' + drawTokens([{ s: c.s, id: c.id }], n.input.cubes, n.input.fractions) + '</span>' +
      '<span class="why-arrow" aria-hidden="true">→</span><span class="why-zone z-' + n.zone + '">' + ZICON[n.zone] + ' ' + ZN[n.zone] + '</span></div>';
  }
  function speakText(s) { return s.replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/−/g, ' minus ').replace(/√/g, ' root ').replace(/\s+/g, ' '); }
  function sayIt(s) { try { if (typeof S !== 'undefined' && S.set && S.set.voice === true && typeof Snd !== 'undefined' && Snd.speak) Snd.speak(speakText(s), 'pip'); } catch (e) {} }
  function renderCard() {
    if (!OPEN) return;
    var n = OPEN.n, ov = document.getElementById('whyOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'whyOv'; ov.className = 'xp-back why-back'; document.body.appendChild(ov); ov.addEventListener('click', function (ev) { if (ev.target === ov) closeCard(); }); }
    var body, t = null, spoken = '';
    if (n.F) t = textFor(n, OPEN.live);
    if (t) {
      body = '<p class="why-text"><b>' + escH(t.head) + '</b></p>' + t.lines.map(function (l) { return '<p class="why-text">' + escH(l) + '</p>'; }).join('');
      if (t.ex) body += '<div class="why-ex"><div class="why-exlabel">' + escH(t.ex.label) + '</div><div class="expr vari-expr">' + drawTokens(t.ex.tokens, n.input.cubes, n.input.fractions) +
        '</div><div class="why-goal">= ' + escH(Eq.fmt(n.input.goal)) + (Eq.rulesOf(n.input.fractions).multk ? ' <small>(a multiple of ' + Eq.rulesOf(n.input.fractions).k + ' away counts)</small>' : '') + '</div></div>';
      if (t.note) body += '<p class="why-note">' + escH(t.note) + '</p>';
      spoken = [t.head].concat(t.lines).join(' ');
    } else if (n.err) {
      body = '<p class="why-text">I can\'t be sure what this move changed. Some puzzles are too big for me to check quickly!</p>';
      spoken = 'I can\'t be sure what this move changed.';
    } else body = '<p class="why-text why-wait">Let me look at that move…</p>';
    ov.innerHTML = '<div class="xp-card why-card" role="dialog" aria-modal="true" aria-label="Why?">' +
      '<div class="xp-head"><h2>🤔 ' + (n.mine ? 'What did my move do?' : 'Why?') + '</h2><button class="btn small xp-x" data-act="whyClose" aria-label="Close">✕</button></div>' +
      moveHTML(n) + '<div class="xp-body">' + body + '</div>' +
      '<div class="row xp-nav"><button class="btn small green" data-act="whyClose">Got it</button></div></div>';
    ov.classList.add('on');
    if (spoken && !OPEN.spoke) { OPEN.spoke = true; sayIt(spoken); }
  }
  function openCard(seq) {
    var n = NOTES.filter(function (x) { return x.seq === +seq; })[0];
    if (!n) return;
    OPEN = { n: n, live: liveFor(n), spoke: false };
    if (typeof Snd !== 'undefined' && Snd.pop) Snd.pop();
    document.removeEventListener('keydown', onKey); document.addEventListener('keydown', onKey);
    renderCard();
    if (!n.F && !n.err) { QUEUE = QUEUE.filter(function (x) { return x !== n; }); QUEUE.unshift(n); pump(); }
  }
  function closeCard() {
    OPEN = null; document.removeEventListener('keydown', onKey);
    var ov = document.getElementById('whyOv'); if (ov) { ov.classList.remove('on'); ov.innerHTML = ''; }
    try { if (typeof S !== 'undefined' && S.set && S.set.voice === true && typeof Snd !== 'undefined' && Snd.stopSpeak) Snd.stopSpeak(); } catch (e) {}
  }
  function onKey(e) { if (OPEN && e.key === 'Escape') { closeCard(); e.preventDefault(); } }
  function settingsHTML() {
    var onS = typeof S !== 'undefined' && S.set && S.set.why !== false;
    return '<div class="setrow"><label>Why? button<br><small style="font-weight:600">After a move, a "🤔 Why?" button tells what that move changed. It never says what to play next.</small></label>' +
      '<button class="btn small ' + (onS ? 'green' : '') + '" data-act="toggleSet" data-arg="why" data-def="1">' + (onS ? '✔ On' : 'Off') + '</button></div>';
  }
  function hook() {
    if (typeof ACT === 'undefined') return false;
    ACT.whyOpen = function (el) { openCard(el && el.dataset ? el.dataset.arg : null); };
    ACT.whyClose = function () { closeCard(); };
    return true;
  }
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
  api.note = note; api.reset = reset; api.buttonHTML = buttonHTML; api.shakeHTML = shakeHTML; api.settingsHTML = settingsHTML;
  api.open = openCard; api.close = closeCard; api.isOpen = function () { return !!OPEN; };
  api._notes = function () { return NOTES; };
  return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Why;
