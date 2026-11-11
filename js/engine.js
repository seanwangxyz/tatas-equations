/*ENGINE-START*/
// ===================== TATA'S EQUATIONS — MATH ENGINE =====================
// Exact fractions, expression evaluator, Solution validator and solver.
// No floating point is used for game values: every number is {n, d} (numerator/denominator).
var Eq = (function () {
  'use strict';

  // ---- Cube faces (see RULES_SUMMARY.md §1; change here if your set differs) ----
  var CUBE_FACES = {
    red:   ['0', '1', '2', '3', '+', '-'],
    blue:  ['0', '1', '2', '3', '*', '/'],
    green: ['4', '5', '6', '-', '*', '^'],
    black: ['7', '8', '9', '+', '/', 'r']
  };
  var COLORS = ['red', 'blue', 'green', 'black'];
  var OPS = ['+', '-', '*', '/', '^', 'r'];            // r = root (√)
  var SHOW = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', 'r': '√', '(': '(', ')': ')' };
  var LIMIT = 1000000;                                  // biggest numerator/denominator we check
  var TWO = { n: 2, d: 1 };

  function isDigit(s) { return typeof s === 'string' && s.length === 1 && s >= '0' && s <= '9'; }
  function sym(t) { return typeof t === 'string' ? t : t.s; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }

  // Make a reduced fraction, or return an error code string.
  function frac(n, d) {
    if (d === undefined) d = 1;
    if (d === 0) return 'divzero';
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d);
    if (g > 1) { n /= g; d /= g; }
    if (n === 0) { n = 0; d = 1; }
    if (Math.abs(n) > LIMIT || d > LIMIT) return 'big';
    return { n: n, d: d };
  }
  function F(n, d) { var r = frac(n, d); if (typeof r === 'string') throw new Error(r); return r; }
  function eqF(a, b) { return a.n === b.n && a.d === b.d; }
  function fmt(v) {
    if (!v) return '?';
    if (v.d === 1) return String(v.n).replace('-', '−');
    var neg = v.n < 0, n = Math.abs(v.n), w = Math.floor(n / v.d), r = n % v.d;
    var s = w ? (w + ' ' + r + '/' + v.d) : (r + '/' + v.d);
    return (neg ? '−' : '') + s;
  }

  // One operation on two fractions. Returns a fraction or an error code string.
  // fr = fractions unlocked? (if not, every division must come out whole)
  // Powers and roots follow the Elementary "General Rule": whole numbers only.
  function opCore(op, a, b, fr) {
    switch (op) {
      case '+': return frac(a.n * b.d + b.n * a.d, a.d * b.d);
      case '-': return frac(a.n * b.d - b.n * a.d, a.d * b.d);
      case '*': return frac(a.n * b.n, a.d * b.d);
      case '/':
        if (b.n === 0) return 'divzero';
        var q = frac(a.n * b.d, a.d * b.n);
        if (typeof q !== 'string' && !fr && q.d !== 1) return 'fraction';
        return q;
      case '^':
        if (a.d !== 1 || b.d !== 1 || a.n < 0 || b.n < 0) return 'powwhole';
        if (a.n === 0 && b.n === 0) return 'zerozero';
        var x = 1;
        for (var i = 0; i < b.n; i++) { x *= a.n; if (x > LIMIT) return 'big'; if (a.n <= 1) break; }
        return { n: x, d: 1 };
      case 'r': // a = index, b = radicand
        if (a.d !== 1 || a.n < 1) return 'rootindex';
        if (b.d !== 1 || b.n < 0) return 'rootwhole';
        if (a.n === 1) return { n: b.n, d: 1 };
        var g = Math.round(Math.pow(b.n, 1 / a.n));
        for (var c = Math.max(0, g - 1); c <= g + 1; c++) if (Math.pow(c, a.n) === b.n) return { n: c, d: 1 };
        return 'rootnotwhole';
    }
    return 'syntax';
  }

  var MSG = {
    divzero: "You can't divide by zero. Nobody can, not even the wizard!",
    big: "That number got too gigantic for our cubes to check.",
    fraction: "That division doesn't come out even. Fractions unlock later, so try a different division!",
    powwhole: "For powers (^), both numbers must be whole numbers like 0, 1, 2, 3.",
    zerozero: "0 ^ 0 isn't a number. Even grown-up mathematicians argue about it!",
    rootindex: "The number in front of √ must be 1, 2, 3, … (no number in front means 2).",
    rootwhole: "The number under √ must be a whole number (0, 1, 2, …).",
    rootnotwhole: "That root isn't a whole number. Square roots that work: √0, √1, √4, √9, √16, √25, …",
    concat: "Two digit cubes are touching, so they make a two-digit number. In a Solution every cube is its own one-digit number. Put an operation between them!",
    threedigit: "Three digits in a row make a three-digit number. The Goal can only use one- or two-digit numbers.",
    sign: "+ and − can only add or subtract. They can't be a plus or minus sign in front of a number.",
    opstart: "An operation needs a number on both sides.",
    incomplete: "It isn't finished yet. It ends with an operation or an open parenthesis.",
    missingop: "Two things are side by side with no operation between them.",
    paren: "The parentheses don't match up.",
    emptyparen: "There's an empty pair of parentheses.",
    empty: "Nothing built yet!",
    syntax: "That doesn't make a math expression."
  };
  function err(code) { return { ok: false, code: code, msg: MSG[code] || code }; }

  // ---- Evaluator ----
  // tokens: array of symbols ('0'-'9', '+', '-', '*', '/', '^', 'r', '(', ')') or objects {s:symbol,...}
  // opts.multiDigit: allow two-digit numerals (Goal only). opts.fractions: fractions unlocked.
  // Order: ( ) first, then roots (√ binds to the item right after it; a number right
  // before √ is its index), then ^ (right to left), then × ÷, then + − (left to right).
  function evaluate(tokens, opts) {
    opts = opts || {};
    var fr = !!opts.fractions, maxD = opts.multiDigit ? 2 : 1, madeFraction = false;
    var toks = [], i = 0;
    while (i < tokens.length) {
      var s = sym(tokens[i]);
      if (isDigit(s)) {
        var j = i, str = '';
        while (j < tokens.length && isDigit(sym(tokens[j]))) { str += sym(tokens[j]); j++; }
        if (str.length > maxD) return err(maxD === 1 ? 'concat' : 'threedigit');
        toks.push({ k: 'n', v: { n: parseInt(str, 10), d: 1 } });
        i = j;
      } else if (OPS.indexOf(s) >= 0 || s === '(' || s === ')') { toks.push({ k: s }); i++; }
      else return err('syntax');
    }
    if (!toks.length) return err('empty');
    var p = 0;
    function peek() { return toks[p] ? toks[p].k : null; }
    function fail(c) { throw { code: c }; }
    function chk(r) { if (typeof r === 'string') fail(r); if (r.d !== 1) madeFraction = true; return r; }
    function expr() {
      var l = term();
      while (peek() === '+' || peek() === '-') { var o = toks[p++].k; var r = term(); l = chk(opCore(o, l, r, fr)); }
      return l;
    }
    function term() {
      var l = power();
      while (peek() === '*' || peek() === '/') { var o = toks[p++].k; var r = power(); l = chk(opCore(o, l, r, fr)); }
      return l;
    }
    function power() {
      var b = rootChain();
      if (peek() === '^') { p++; var e = power(); return chk(opCore('^', b, e, fr)); }
      return b;
    }
    function rootChain() {
      var a = atom();
      while (peek() === 'r') { p++; var b = atom(); a = chk(opCore('r', a, b, fr)); }
      return a;
    }
    function atom() {
      var k = peek();
      if (k === 'n') return toks[p++].v;
      if (k === '(') {
        p++;
        if (peek() === ')') fail('emptyparen');
        var v = expr();
        if (peek() === null) fail('paren');
        if (peek() !== ')') fail('missingop');
        p++; return v;
      }
      if (k === 'r') { p++; var x = atom(); return chk(opCore('r', TWO, x, fr)); }
      if (k === '+' || k === '-') fail('sign');
      if (k === '*' || k === '/' || k === '^') fail('opstart');
      if (k === ')') fail(p === 0 ? 'paren' : 'opstart');
      fail('incomplete');
    }
    try {
      var v = expr();
      if (p < toks.length) fail(peek() === ')' ? 'paren' : 'missingop');
      return { ok: true, value: v, madeFraction: madeFraction };
    } catch (e) {
      if (e && e.code) return err(e.code);
      throw e;
    }
  }

  function cubeCount(tokens) { var n = 0; tokens.forEach(function (t) { var s = sym(t); if (s !== '(' && s !== ')') n++; }); return n; }

  // ---- Goal check ----
  function checkGoal(tokens, fractions) {
    var n = cubeCount(tokens);
    if (n < 1) return { ok: false, reasons: [MSG.empty] };
    if (n > 6) return { ok: false, reasons: ['A Goal can have at most six cubes.'] };
    var ev = evaluate(tokens, { multiDigit: true, fractions: fractions });
    if (!ev.ok) return { ok: false, reasons: [ev.msg] };
    return { ok: true, value: ev.value, reasons: [] };
  }

  // ---- Solution check ----
  // tokens: [{s, id}] for cubes and '(' ')' strings for parentheses.
  // ctx: {goal, zone(id)->'required'|'permitted'|'forbidden'|'resources'|'goal',
  //       required:[ids], mode:'now'|'impossible'|'last'|'free'|'daily', fractions, label(id)->string}
  function checkSolution(tokens, ctx) {
    var reasons = [], ids = [];
    tokens.forEach(function (t) { if (typeof t === 'object' && t.id != null) ids.push(t.id); });
    if (!ids.length) return { ok: false, value: null, reasons: [MSG.empty] };
    var label = ctx.label || function (id) { return String(id); };
    if (ids.length < 2) reasons.push('A Solution needs at least two cubes.');
    var forb = [], res = 0, goalUsed = false, seen = {};
    ids.forEach(function (id) {
      if (seen[id]) reasons.push('The same cube was used twice.');
      seen[id] = true;
      var z = ctx.zone(id);
      if (z === 'forbidden') forb.push(id);
      else if (z === 'resources') res++;
      else if (z === 'goal') goalUsed = true;
    });
    if (forb.length) reasons.push('It uses a Forbidden cube (' + forb.map(label).join(', ') + '). Forbidden cubes are off-limits.');
    var missing = (ctx.required || []).filter(function (id) { return ids.indexOf(id) < 0; });
    if (missing.length) reasons.push('It leaves out Required cube' + (missing.length > 1 ? 's ' : ' ') + missing.map(label).join(', ') + '. Every Required cube must be used.');
    if (ctx.mode === 'now' && res > 1) reasons.push('After a Now! challenge you may add only ONE cube from Resources (this uses ' + res + ').');
    if ((ctx.mode === 'last' || ctx.mode === 'daily') && res > 0) reasons.push('Only cubes on the mat (Required and Permitted) may be used.');
    if (goalUsed) reasons.push('Cubes in the Goal stay in the Goal. They can\'t go in the Solution.');
    var ev = evaluate(tokens, { fractions: ctx.fractions });
    var value = null;
    if (!ev.ok) reasons.push(ev.msg);
    else {
      value = ev.value;
      if (!eqF(value, ctx.goal)) reasons.push('Your Solution equals ' + fmt(value) + ', but the Goal is ' + fmt(ctx.goal) + '.');
    }
    return { ok: reasons.length === 0, value: value, reasons: reasons, madeFraction: !!ev.madeFraction, cubes: ids.length, resUsed: res };
  }

  // ---- Solver ----
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function countMap(arr) { var m = {}; arr.forEach(function (s) { m[s] = (m[s] || 0) + 1; }); return m; }
  function uniq(arr) { var o = []; arr.forEach(function (s) { if (o.indexOf(s) < 0) o.push(s); }); return o; }
  var TIMEOUT = { timeout: true };

  // Build the expression text with as few parentheses as possible (internal symbols).
  function wrap(e, need) { return e.p < need ? '(' + e.s + ')' : e.s; }
  function combine(o, L, R, v) {
    switch (o) {
      case '+': case '-': return { v: v, s: L.s + o + (R.p <= 1 ? '(' + R.s + ')' : R.s), p: 1 };
      case '*': case '/': return { v: v, s: wrap(L, 2) + o + (R.p <= 2 ? '(' + R.s + ')' : R.s), p: 2 };
      case '^': return { v: v, s: (L.p <= 3 ? '(' + L.s + ')' : L.s) + '^' + wrap(R, 3), p: 3 };
      case 'r': return { v: v, s: wrap(L, 4) + 'r' + wrap(R, 4), p: 3.5 };
    }
  }

  // Sub-multiset splits of a sorted digit string: [[A,B], ...] with A,B non-empty.
  var splitCache = {};
  function splits(S) {
    if (splitCache[S]) return splitCache[S];
    var vals = uniq(S.split('')), cnt = vals.map(function (v) { return S.split(v).length - 1; });
    var out = [], cur = vals.map(function () { return 0; });
    (function rec(i) {
      if (i === vals.length) {
        var a = '', b = '', na = 0;
        for (var k = 0; k < vals.length; k++) { a += vals[k].repeat(cur[k]); b += vals[k].repeat(cnt[k] - cur[k]); na += cur[k]; }
        if (na > 0 && na < S.length) out.push([a, b]);
        return;
      }
      for (var c = 0; c <= cnt[i]; c++) { cur[i] = c; rec(i + 1); }
    })(0);
    splitCache[S] = out;
    return out;
  }

  // p: {goal, req:[symbols], opt:[symbols], res:[symbols], mode:'now'|'impossible'|'free',
  //     fractions, maxDigits, timeMs}
  // 'now': all req + any opt + at most one res. 'impossible'/'free': all req + any of opt∪res.
  // Returns {found:true, expr, tokens} or {found:false, complete:bool}.
  // complete=false means it ran out of time or hit the size limit, so "not found" isn't proof.
  function solve(p) {
    var deadline = nowMs() + (p.timeMs || 500);
    var base = { goal: p.goal, req: p.req || [], fractions: !!p.fractions, maxDigits: p.maxDigits || 6, deadline: deadline, memo: new Map() };
    var scen = [];
    var opt = p.opt || [], res = p.res || [];
    if (p.mode === 'now') {
      scen.push({ opt: opt, must: null });
      uniq(res).forEach(function (s) { scen.push({ opt: opt.concat([s]), must: s }); });
    } else scen.push({ opt: opt.concat(res), must: null });
    var complete = true;
    for (var i = 0; i < scen.length; i++) {
      var r = core(base, scen[i].opt, scen[i].must);
      if (r.found) return r;
      if (!r.complete) complete = false;
      if (nowMs() > deadline) { complete = false; break; }
    }
    return { found: false, complete: complete };
  }

  function core(base, opt, must) {
    var all = base.req.concat(opt);
    var reqD = base.req.filter(isDigit).sort();
    var reqO = countMap(base.req.filter(function (s) { return !isDigit(s); }));
    var availD = countMap(all.filter(isDigit));
    var availO = countMap(all.filter(function (s) { return !isDigit(s); }));
    var maxD = base.maxDigits;
    var complete = true;
    if (reqD.length > maxD) return { found: false, complete: false };
    var totalD = 0; for (var dk in availD) totalD += availD[dk];
    if (totalD > maxD) complete = false; // bigger Solutions exist that we won't search

    // Only "track" (count) op types that could run out; plentiful ones are treated as unlimited.
    var tracked = [], caps = [], idx = {};
    OPS.forEach(function (t) {
      var a = availO[t] || 0;
      if (!a) return;
      if (t === 'r' || (reqO[t] || 0) > 0 || a < maxD - 1 || must === t) { idx[t] = tracked.length; tracked.push(t); caps.push(a); }
    });
    var radix = [], mul = 1, unit = {};
    tracked.forEach(function (t, i) { unit[t] = mul; radix.push(mul); mul *= caps[i] + 1; });
    function dec(u, i) { return Math.floor(u / radix[i]) % (caps[i] + 1); }
    function addU(u1, u2) {
      for (var i = 0; i < tracked.length; i++) if (dec(u1, i) + dec(u2, i) > caps[i]) return -1;
      return u1 + u2;
    }
    var binOps = OPS.filter(function (t) { return (availO[t] || 0) > 0; });
    var hasRoot = (availO.r || 0) > 0;
    var cfg = tracked.map(function (t, i) { return t + caps[i]; }).join(',') + '|' + binOps.join('') + '|' + (base.fractions ? 'F' : '');
    var tick = 0;

    function put(m, u, e) {
      var out = m.get(u); if (!out) { out = new Map(); m.set(u, out); }
      var k = e.v.n + '/' + e.v.d;
      if (!out.has(k)) out.set(k, e);
    }
    function dp(S) {
      var key = cfg + '#' + S, m = base.memo.get(key);
      if (m) return m;
      if (nowMs() > base.deadline) throw TIMEOUT;
      m = new Map();
      if (S.length === 1) put(m, 0, { v: { n: +S, d: 1 }, s: S, p: 4 });
      else {
        var sp = splits(S);
        for (var si = 0; si < sp.length; si++) {
          var A = sp[si][0], B = sp[si][1];
          var mA = dp(A), mB = dp(B);
          mA.forEach(function (vmA, uA) {
            mB.forEach(function (vmB, uB) {
              var uAB = addU(uA, uB);
              if (uAB < 0) return;
              for (var oi = 0; oi < binOps.length; oi++) {
                var o = binOps[oi], u = uAB;
                if (o === 'r') { /* binary root needs a √ cube: always tracked */ }
                if (idx[o] !== undefined) { u = addU(uAB, unit[o]); if (u < 0) continue; }
                if ((o === '+' || o === '*') && A > B) continue;
                var out = m.get(u); if (!out) { out = new Map(); m.set(u, out); }
                vmA.forEach(function (ea) {
                  vmB.forEach(function (eb) {
                    if (((++tick) & 4095) === 0 && nowMs() > base.deadline) throw TIMEOUT;
                    var r = opCore(o, ea.v, eb.v, base.fractions);
                    if (typeof r === 'string') return;
                    var k = r.n + '/' + r.d;
                    if (!out.has(k)) out.set(k, combine(o, ea, eb, r));
                  });
                });
              }
            });
          });
        }
      }
      if (hasRoot) {
        var adds = [];
        m.forEach(function (vm, u) {
          var u2 = addU(u, unit.r);
          if (u2 < 0) return;
          vm.forEach(function (e) {
            if (e.v.d !== 1 || e.v.n < 0) return;
            var r = opCore('r', TWO, e.v, false);
            if (typeof r !== 'string') adds.push([u2, { v: r, s: 'r' + wrap(e, 4), p: 4 }]);
          });
        });
        adds.forEach(function (a) { put(m, a[0], a[1]); });
      }
      base.memo.set(key, m);
      return m;
    }

    // Candidate digit multisets: all Required digits + some optional digits, smallest first.
    var extra = {}; Object.keys(availD).forEach(function (d) { extra[d] = availD[d] - (reqD.filter(function (x) { return x === d; }).length); });
    var dks = Object.keys(extra).sort(), cands = [];
    (function rec(i, cur) {
      if (cur.length > maxD) return;
      if (i === dks.length) { cands.push(cur); return; }
      for (var c = 0; c <= extra[dks[i]]; c++) rec(i + 1, cur.concat(Array(c).fill(dks[i])));
    })(0, reqD.slice());
    cands = cands.filter(function (c) { return c.length >= 1; }).map(function (c) { return c.sort().join(''); });
    cands.sort(function (a, b) { return a.length - b.length; });
    var gk = base.goal.n + '/' + base.goal.d;
    try {
      for (var ci = 0; ci < cands.length; ci++) {
        var T = cands[ci];
        if (must && isDigit(must) && (T.split(must).length - 1) !== availD[must]) continue;
        var m = dp(T), hit = null;
        m.forEach(function (vm, u) {
          if (hit) return;
          if (T.length === 1 && u === 0) return; // single cube: not a Solution
          for (var t in reqO) if (dec(u, idx[t]) < reqO[t]) return;
          if (must && !isDigit(must) && dec(u, idx[must]) !== caps[idx[must]]) return;
          var e = vm.get(gk);
          if (e) hit = e;
        });
        if (hit) return { found: true, expr: hit.s, tokens: hit.s.split('') };
      }
    } catch (x) {
      if (x === TIMEOUT) return { found: false, complete: false };
      throw x;
    }
    return { found: false, complete: complete };
  }

  // ---- Goal ideas (for the computer and daily puzzles) ----
  // Returns [{tokens:[symbols], value}] using 1-3 cubes from the given symbols.
  function goalIdeas(syms, opts) {
    opts = opts || {};
    var digits = syms.filter(isDigit), ops = uniq(syms.filter(function (s) { return !isDigit(s) && s !== 'r'; }));
    var out = [], seen = {};
    function add(t) {
      var key = t.join('');
      if (seen[key]) return; seen[key] = 1;
      var c = countMap(syms), need = countMap(t);
      for (var k in need) if ((c[k] || 0) < need[k]) return;
      var ev = evaluate(t, { multiDigit: true, fractions: opts.fractions });
      if (!ev.ok) return;
      out.push({ tokens: t, value: ev.value });
    }
    uniq(digits).forEach(function (a) { add([a]); });
    digits.forEach(function (a) { digits.forEach(function (b) { if (a !== '0') add([a, b]); }); });
    digits.forEach(function (a) { ops.forEach(function (o) { digits.forEach(function (b) { add([a, o, b]); }); }); });
    return out;
  }

  // Seeded random numbers (so the daily puzzle is the same all day).
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Roll all 24 cubes: [{id, color, s}]
  function roll(rand) {
    rand = rand || Math.random;
    var cubes = [], id = 0;
    COLORS.forEach(function (c) { for (var i = 0; i < 6; i++) cubes.push({ id: id++, color: c, s: CUBE_FACES[c][Math.floor(rand() * 6)] }); });
    return cubes;
  }

  // ---- Challenge scoring (PDF section X: Scoring a Shake) ----
  // kind 'now'|'impossible'; ch = Challenger, mv = Mover, tp = Third Party (null in 2-player games);
  // wOk = the player who had to write (Challenger after Now!, Mover after Impossible!) was correct;
  // tpRes = {presented, ok} for the Third Party. Returns {playerIndex: points}.
  function scoreChallenge(kind, ch, mv, tp, wOk, tpRes) {
    var pts = {}, tpPres = !!(tpRes && tpRes.presented), tpOk = tpPres && !!tpRes.ok;
    if (kind === 'now') {
      pts[ch] = wOk ? 6 : 2;
      pts[mv] = (wOk || tpOk) ? 2 : 6;            // Mover is correct only if no opponent wrote a correct Solution
      if (tp !== null && tp !== undefined) pts[tp] = tpPres ? (tpOk ? (wOk ? 4 : 6) : 2) : (wOk ? 2 : 6);
    } else {
      pts[mv] = wOk ? 6 : 2;
      pts[ch] = (wOk || tpOk) ? 2 : 6;            // Impossible! is correct only if nobody wrote a correct Solution
      if (tp !== null && tp !== undefined) pts[tp] = tpPres ? (tpOk ? 6 : 2) : (wOk ? 2 : 4);
    }
    return pts;
  }

  return {
    scoreChallenge: scoreChallenge,
    CUBE_FACES: CUBE_FACES, COLORS: COLORS, OPS: OPS, SHOW: SHOW, MSG: MSG,
    frac: F, eqF: eqF, fmt: fmt, isDigit: isDigit, opCore: opCore,
    evaluate: evaluate, checkGoal: checkGoal, checkSolution: checkSolution, cubeCount: cubeCount,
    solve: solve, goalIdeas: goalIdeas, rng: rng, roll: roll, uniq: uniq
  };
})();
/*ENGINE-END*/
