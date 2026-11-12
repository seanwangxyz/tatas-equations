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
  var SHOW = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', 'r': '√', '(': '(', ')': ')', 'm': 'rem' }; // m = a sideways ÷ (Remainder card)
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
      case 'm': // Remainder variation (XIII-A-7): a sideways ÷. A and B counting numbers, A ≤ 1000.
        if (a.d !== 1 || b.d !== 1 || a.n < 1 || b.n < 1) return 'remwhole';
        if (a.n > 1000) return 'rembig';
        return { n: a.n % b.n, d: 1 };
    }
    return 'syntax';
  }

  // ---- Variations (Adventurous Equations, PDF section XIII-A, Elementary) ----
  // A "math mode" value is what the game passes everywhere as `fractions`: either a plain
  // true/false (no variation: exactly the old behaviour), or a plain-data object
  //   { fractions: true/false, vars: ['wild0', ...], goal: [Goal symbols] }
  // (plain data so it can travel to the Web Worker). `goal` is only needed for 0 Wild, where a 0
  // in the Goal may stand for another digit too. Variation ids:
  //   wild0     0 Wild (XIII-A-3): every 0 cube stands for the same digit 0-9, in Goal and Solution.
  //   twodigit  Two-digit Numerals (XIII-A-8): two digit cubes side by side make a number in a Solution.
  //   threeops  Three-operation Solution (XIII-A-6): a Solution needs at least three operation signs.
  //   multiops  Multiple Operations (XIII-A-5): an operation cube the Solution may use can be used many times.
  //   remainder Remainder (XIII-A-7): a ÷ cube turned sideways means "the remainder of A ÷ B" (symbol m).
  var VARIATIONS = ['wild0', 'twodigit', 'threeops', 'multiops', 'remainder'];
  function rulesOf(x) {
    var R = { fr: false, wild: false, two: false, three: false, multi: false, rem: false, goal: null, any: false };
    if (x && typeof x === 'object') {
      R.fr = !!x.fractions; R.goal = x.goal || null;
      (x.vars || []).forEach(function (v) {
        if (v === 'wild0') R.wild = true; else if (v === 'twodigit') R.two = true; else if (v === 'threeops') R.three = true;
        else if (v === 'multiops') R.multi = true; else if (v === 'remainder') R.rem = true;
      });
      R.any = R.wild || R.two || R.three || R.multi || R.rem;
    } else R.fr = !!x;
    return R;
  }
  // Build a math mode. With no variations it is just the fractions boolean (so nothing changes).
  function mathMode(fractions, vars, goalSyms) {
    vars = (vars || []).filter(function (v) { return VARIATIONS.indexOf(v) >= 0; });
    if (!vars.length) return !!fractions;
    var m = { fractions: !!fractions, vars: vars.slice() };
    if (goalSyms) m.goal = goalSyms.slice();
    return m;
  }
  // The same math mode, now knowing the Goal's symbols (0 Wild needs them).
  function withGoal(m, goalSyms) {
    if (!m || typeof m !== 'object') return m;
    return mathMode(m.fractions, m.vars, (goalSyms || []).map(sym).filter(function (s) { return s !== '(' && s !== ')'; }));
  }
  function fracOn(m) { return rulesOf(m).fr; }
  function varsOf(m) { return (m && typeof m === 'object' && m.vars) ? m.vars.slice() : []; }
  function hasZero(list) { return list.some(function (t) { return sym(t) === '0'; }); }

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
    threedigit2: "Three digits in a row make a three-digit number. Even with the Two-digit card, numbers can have at most two digits.",
    remwhole: "For a remainder (sideways ÷), both numbers must be counting numbers: 1, 2, 3, …",
    rembig: "For a remainder (sideways ÷), the first number must be 1000 or less.",
    remgoal: "A sideways ÷ (remainder) can only be used in a Solution, not in the Goal.",
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
  // opts.fractions may be a math mode (see Variations above). opts.wild = the digit the 0 cubes stand
  // for (0 Wild; default 0). opts.inGoal = this is a Goal (a sideways ÷ is not allowed there).
  // With Remainder, 'm' (a sideways ÷) sits with × and ÷ (left to right).
  function evaluate(tokens, opts) {
    opts = opts || {};
    var RU = rulesOf(opts.fractions);
    var fr = RU.fr, maxD = (opts.multiDigit || RU.two) ? 2 : 1, madeFraction = false;
    var w = (RU.wild && typeof opts.wild === 'number') ? String(opts.wild) : '0';
    var toks = [], i = 0;
    while (i < tokens.length) {
      var s = sym(tokens[i]);
      if (isDigit(s)) {
        var j = i, str = '';
        while (j < tokens.length && isDigit(sym(tokens[j]))) { var c = sym(tokens[j]); str += c === '0' ? w : c; j++; }
        if (str.length > maxD) return err(maxD === 1 ? 'concat' : opts.multiDigit ? 'threedigit' : 'threedigit2');
        toks.push({ k: 'n', v: { n: parseInt(str, 10), d: 1 } });
        i = j;
      } else if (OPS.indexOf(s) >= 0 || s === '(' || s === ')') { toks.push({ k: s }); i++; }
      else if (s === 'm' && RU.rem) { if (opts.inGoal) return err('remgoal'); toks.push({ k: s }); i++; }
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
      while (peek() === '*' || peek() === '/' || peek() === 'm') { var o = toks[p++].k; var r = power(); l = chk(opCore(o, l, r, fr)); }
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
      if (k === '*' || k === '/' || k === '^' || k === 'm') fail('opstart');
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
    var ev = evaluate(tokens, { multiDigit: true, fractions: fractions, inGoal: true });
    var RU = rulesOf(fractions);
    if (RU.wild && hasZero(tokens)) {
      // 0 Wild: the Goal is legal if the 0 can stand for SOME digit that makes it legal.
      // value = the value when 0 means 0 if that is legal, else the first digit that works.
      var vals = {}, first = null;
      for (var w = 0; w <= 9; w++) {
        var e2 = evaluate(tokens, { multiDigit: true, fractions: fractions, inGoal: true, wild: w });
        if (e2.ok) { vals[w] = e2.value; if (!first) first = e2; }
      }
      if (!first) return { ok: false, reasons: [ev.msg] };
      return { ok: true, value: first.value, reasons: [], wildValues: vals };
    }
    if (!ev.ok) return { ok: false, reasons: [ev.msg] };
    return { ok: true, value: ev.value, reasons: [] };
  }
  // 0 Wild: the Goal's value when every 0 stands for digit w (null if that is not legal).
  function goalAt(goalSyms, w, fractions) {
    var e = evaluate(goalSyms, { multiDigit: true, fractions: fractions, inGoal: true, wild: w });
    return e.ok ? e.value : null;
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
    var RU = rulesOf(ctx.fractions);
    var opCount = 0;
    tokens.forEach(function (t) { if (typeof t === 'object' && t.id != null && !isDigit(t.s)) opCount++; });
    var distinct = uniq(ids).length;
    if (distinct < 2) reasons.push('A Solution needs at least two cubes.');
    var forb = [], res = 0, goalUsed = false, seen = {};
    tokens.forEach(function (t) {
      if (typeof t !== 'object' || t.id == null) return;
      var id = t.id;
      if (seen[id] && RU.multi && !isDigit(t.s)) return; // Multiple Operations: an operation cube may be used again
      if (seen[id]) reasons.push('The same cube was used twice.');
      seen[id] = true;
      var z = ctx.zone(id);
      if (z === 'forbidden') forb.push(id);
      else if (z === 'resources') res++;
      else if (z === 'goal') goalUsed = true;
    });
    if (RU.three && opCount < 3) reasons.push('With the Three-operation card, a Solution needs at least 3 operation signs (this one has ' + opCount + ').');
    if (forb.length) reasons.push('It uses a Forbidden cube (' + forb.map(label).join(', ') + '). Forbidden cubes are off-limits.');
    var missing = (ctx.required || []).filter(function (id) { return ids.indexOf(id) < 0; });
    if (missing.length) reasons.push('It leaves out Required cube' + (missing.length > 1 ? 's ' : ' ') + missing.map(label).join(', ') + '. Every Required cube must be used.');
    if (ctx.mode === 'now' && res > 1) reasons.push('After a Now! challenge you may add only ONE cube from Resources (this uses ' + res + ').');
    if ((ctx.mode === 'last' || ctx.mode === 'daily') && res > 0) reasons.push('Only cubes on the mat (Required and Permitted) may be used.');
    if (goalUsed) reasons.push('Cubes in the Goal stay in the Goal. They can\'t go in the Solution.');
    var ev = evaluate(tokens, { fractions: ctx.fractions });
    var value = null, equal = false, wildAs = null;
    var gZero = RU.wild && RU.goal && hasZero(RU.goal), sZero = RU.wild && hasZero(tokens);
    if (gZero || sZero) {
      // 0 Wild: every 0 (Goal and Solution) stands for the same digit. The game tries 0 first, then
      // 1-9, and takes the first digit that makes the Equation true. (Officially the writer writes
      // down what the 0 means; here the game finds it for you and says which digit it used.)
      var firstOk = null;
      for (var w = 0; w <= 9 && !equal; w++) {
        var ew = evaluate(tokens, { fractions: ctx.fractions, wild: w });
        if (!ew.ok) continue;
        if (!firstOk) firstOk = ew;
        var gw = gZero ? goalAt(RU.goal, w, ctx.fractions) : ctx.goal;
        if (gw && eqF(ew.value, gw)) { equal = true; ev = ew; wildAs = w; }
      }
      if (!equal && firstOk) ev = firstOk;
      if (!ev.ok) reasons.push(ev.msg);
      else {
        value = ev.value;
        if (!equal) reasons.push('Your Solution equals ' + fmt(value) + (sZero ? ' when 0 means 0' : '') + (gZero ? '' : ', but the Goal is ' + fmt(ctx.goal)) + '. I tried every digit 0 to 9 for the wild 0, and none of them makes it equal the Goal.');
      }
    } else if (!ev.ok) reasons.push(ev.msg);
    else {
      value = ev.value; equal = eqF(value, ctx.goal);
      if (!equal) reasons.push('Your Solution equals ' + fmt(value) + ', but the Goal is ' + fmt(ctx.goal) + '.');
    }
    return { ok: reasons.length === 0, value: value, equal: equal, wildAs: wildAs, ops: opCount, reasons: reasons, madeFraction: !!ev.madeFraction, cubes: distinct, resUsed: res };
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
      case '*': case '/': case 'm': return { v: v, s: wrap(L, 2) + o + (R.p <= 2 ? '(' + R.s + ')' : R.s), p: 2 };
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
  //     fractions (true/false or a math mode with variations), maxDigits, timeMs}
  // 'now': all req + any opt + at most one res. 'impossible'/'free': all req + any of opt∪res.
  // Returns {found:true, expr, tokens, wild?} or {found:false, complete:bool}.
  // complete=false means it ran out of time or hit the size limit, so "not found" isn't proof.
  // Variations: 0 Wild tries every digit for the 0 cubes (and the Goal's 0s, from the math mode's
  // goal symbols); Two-digit adds glued pairs of digit cubes; Three-operation keeps, for every value,
  // the count of operation signs (capped at 3); Multiple Operations lets any available operation
  // repeat; Remainder lets a ÷ cube be used as 'm'. With no variation everything is as before.
  function solve(p) {
    var deadline = nowMs() + (p.timeMs || 500);
    var RU = rulesOf(p.fractions);
    var opt = p.opt || [], res = p.res || [], req = p.req || [];
    var memo = new Map();
    var scen = [];
    if (p.mode === 'now') {
      scen.push({ opt: opt, must: null });
      uniq(res).forEach(function (s) { scen.push({ opt: opt.concat([s]), must: s }); });
    } else scen.push({ opt: opt.concat(res), must: null });
    var gZero = RU.wild && RU.goal && hasZero(RU.goal);
    var sZero = RU.wild && hasZero(req.concat(opt, res));
    var ws = (gZero || sZero) ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [null];
    var complete = true;
    for (var wi = 0; wi < ws.length; wi++) {
      var w = ws[wi], goal = gZero ? goalAt(RU.goal, w, p.fractions) : p.goal;
      if (!goal) continue; // the Goal is not legal when 0 means this digit
      var base = { goal: goal, req: req, fractions: RU.fr, RU: RU, wild: w, maxDigits: p.maxDigits || 6, deadline: deadline, memo: memo };
      for (var i = 0; i < scen.length; i++) {
        var r = core(base, scen[i].opt, scen[i].must);
        if (r.found) { if (w !== null) r.wild = w; return r; }
        if (!r.complete) complete = false;
        if (nowMs() > deadline) return { found: false, complete: false };
      }
    }
    return { found: false, complete: complete };
  }

  function core(base, opt, must) {
    var RU = base.RU, multi = RU.multi;
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
    // Multiple Operations: every available type is tracked as "used yet?" (a count that stops at
    // the number of Required cubes of that type, at least 1) and never runs out.
    var tracked = [], caps = [], idx = {};
    OPS.forEach(function (t) {
      var a = availO[t] || 0;
      if (!a) return;
      if (multi) { idx[t] = tracked.length; tracked.push(t); caps.push(Math.max(1, reqO[t] || 0)); return; }
      if (t === 'r' || (reqO[t] || 0) > 0 || a < maxD - 1 || must === t) { idx[t] = tracked.length; tracked.push(t); caps.push(a); }
    });
    var radix = [], mul = 1, unit = {};
    tracked.forEach(function (t, i) { unit[t] = mul; radix.push(mul); mul *= caps[i] + 1; });
    function dec(u, i) { return Math.floor(u / radix[i]) % (caps[i] + 1); }
    function addU(u1, u2) {
      if (!multi) {
        for (var i = 0; i < tracked.length; i++) if (dec(u1, i) + dec(u2, i) > caps[i]) return -1;
        return u1 + u2;
      }
      var out = 0;
      for (var j = 0; j < tracked.length; j++) out += Math.min(caps[j], dec(u1, j) + dec(u2, j)) * radix[j];
      return out;
    }
    function useOp(u, t) { return idx[t] === undefined ? u : addU(u, unit[t]); }
    var binOps = OPS.filter(function (t) { return (availO[t] || 0) > 0; });
    if (RU.rem && (availO['/'] || 0) > 0) binOps.push('m'); // Remainder: a ÷ cube used sideways
    var hasRoot = (availO.r || 0) > 0;
    var three = RU.three, two = RU.two;
    var cfg = tracked.map(function (t, i) { return t + caps[i]; }).join(',') + '|' + binOps.join('') + '|' + (base.fractions ? 'F' : '') +
      (RU.any ? '|' + (two ? '2' : '') + (three ? '3' : '') + (multi ? 'M' : '') + (RU.rem ? 'R' : '') + 'w' + base.wild : '');
    var tick = 0;
    var W = base.wild;
    function leafV(ch) { return (ch === '0' && W !== null && W !== undefined) ? W : +ch; }
    // value key: the value, plus (Three-operation) how many operation signs, capped at 3
    function vkey(v, o) { return three ? v.n + '/' + v.d + '#' + Math.min(3, o) : v.n + '/' + v.d; }

    function put(m, u, e) {
      var out = m.get(u); if (!out) { out = new Map(); m.set(u, out); }
      var k = vkey(e.v, e.o);
      if (!out.has(k)) out.set(k, e);
    }
    function dp(S) {
      var key = cfg + '#' + S, m = base.memo.get(key);
      if (m) return m;
      if (nowMs() > base.deadline) throw TIMEOUT;
      m = new Map();
      if (S.length === 1) put(m, 0, { v: { n: leafV(S), d: 1 }, s: S, p: 4, o: 0 });
      else {
        if (two && S.length === 2) { // Two-digit Numerals: the two cubes glued, both orders
          put(m, 0, { v: { n: leafV(S[0]) * 10 + leafV(S[1]), d: 1 }, s: S, p: 4, o: 0 });
          if (S[0] !== S[1]) put(m, 0, { v: { n: leafV(S[1]) * 10 + leafV(S[0]), d: 1 }, s: S[1] + S[0], p: 4, o: 0 });
        }
        var sp = splits(S);
        for (var si = 0; si < sp.length; si++) {
          var A = sp[si][0], B = sp[si][1];
          var mA = dp(A), mB = dp(B);
          mA.forEach(function (vmA, uA) {
            mB.forEach(function (vmB, uB) {
              var uAB = addU(uA, uB);
              if (uAB < 0) return;
              for (var oi = 0; oi < binOps.length; oi++) {
                var o = binOps[oi], u = uAB, cubeT = o === 'm' ? '/' : o;
                if (idx[cubeT] !== undefined) { u = addU(uAB, unit[cubeT]); if (u < 0) continue; }
                if ((o === '+' || o === '*') && A > B) continue;
                var out = m.get(u); if (!out) { out = new Map(); m.set(u, out); }
                vmA.forEach(function (ea) {
                  vmB.forEach(function (eb) {
                    if (((++tick) & 4095) === 0 && nowMs() > base.deadline) throw TIMEOUT;
                    var r = opCore(o, ea.v, eb.v, base.fractions);
                    if (typeof r === 'string') return;
                    var oc = ea.o + eb.o + 1, k = vkey(r, oc);
                    if (!out.has(k)) { var e = combine(o, ea, eb, r); e.o = oc; out.set(k, e); }
                  });
                });
              }
            });
          });
        }
      }
      if (hasRoot) {
        // square roots with no index cube. Multiple Operations: √ may repeat (√√16), up to 3 deep.
        for (var rep = 0; rep < (multi ? 3 : 1); rep++) {
          var adds = [];
          m.forEach(function (vm, u) {
            var u2 = useOp(u, 'r');
            if (u2 < 0) return;
            vm.forEach(function (e) {
              if (e.v.d !== 1 || e.v.n < 0) return;
              var r = opCore('r', TWO, e.v, false);
              if (typeof r !== 'string') adds.push([u2, { v: r, s: 'r' + wrap(e, 4), p: 4, o: e.o + 1 }]);
            });
          });
          var before = 0; m.forEach(function (vm) { before += vm.size; });
          adds.forEach(function (a) { put(m, a[0], a[1]); });
          var after = 0; m.forEach(function (vm) { after += vm.size; });
          if (after === before) break;
        }
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
    var gk = vkey(base.goal, 3);
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
    solve: solve, goalIdeas: goalIdeas, rng: rng, roll: roll, uniq: uniq,
    VARIATIONS: VARIATIONS, mathMode: mathMode, withGoal: withGoal, fracOn: fracOn, varsOf: varsOf, rulesOf: rulesOf, goalAt: goalAt
  };
})();

// ===================== HOW MANY WAYS? (distinct Solutions) =====================
// Added on top of Eq; nothing above is changed. Exports: Eq.wayKey, Eq.allWays, Eq.waysFor, Eq.wayMedals.
//
// When are two Solutions the SAME way? (kid version; the game's "?" pop-up says the same)
//   1. Swapping the order of numbers you add, take away, multiply or divide:
//        2+3 = 3+2,  2×3 = 3×2,  9−4+2 = 9+2−4,  8÷4×2 = 8×2÷4.
//   2. Moving parentheses inside a chain of + and − (or a chain of × and ÷), or moving a minus:
//        (2+3)+4 = 2+(3+4),  9−(4−2) = 9−4+2,  8÷(4÷2) = 8÷4×2,  7−(0−2)×7 = 7−(0−7)×2 = 7+2×7.
//   3. Adding a helper that changes nothing: + or − a part that equals 0 (+0, +(3−3), +0×7),
//      × or ÷ a part that equals 1 (×1, ÷1, ×(5−4)), a number and its opposite (+4−4, ×4÷4),
//      a power or root that changes nothing (5^1, 1^3 = 1, 0^2 = 0, √1 = 1, √0 = 0, a root with
//      index 1), and writing the little 2 on a square root (2√9 = √9).
//   4. The same trick with a different number: 2÷2 = 4÷4 (a number divided by itself is 1),
//      3^0 = 9^0 (anything to the power 0 is 1), 3−3 = 5−5 (a number minus itself is 0).
// Everything else is a NEW way: different cubes (2+3 vs 1+4), a different operation
// (2+3 vs 6−1 vs 2×3−1), or a different shape (2×(3+4) vs 2×3+2×4).
// Which cube of a color is used never matters: only the symbols.
(function (Eq) {
  'use strict';
  var OPS = Eq.OPS, isDigit = Eq.isDigit, opCore = Eq.opCore;
  var TWO = { n: 2, d: 1 };
  function isOne(v) { return v.n === 1 && v.d === 1; }
  function vk(v) { return v.n + '/' + v.d; }
  function negV(v) { return { n: -v.n, d: v.d }; }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // ---- Canonical form ----
  // A node is {k: key string, v: value, t: 'n' (number) | 'S' (sum) | 'P' (product) | 'W' (power) |
  //   'R' (root) | 'x' (a trick like x÷x whose numbers don't matter), it: [[sign, node], ...] for S and P,
  //   h: a helper was removed somewhere, tr: a "same trick, any number" was used somewhere}.
  function atom(d) { return { k: d, v: { n: +d, d: 1 }, t: 'n', h: false, tr: false }; }
  var ATOM2 = atom('2');
  // biggest part first (so (3−2)×1 keeps the (3−2) and drops the ×1), then alphabetical
  function byKey(x, y) { var a = x[1].k, b = y[1].k; return b.length - a.length || (a < b ? -1 : a > b ? 1 : 0); }
  function chainKey(t, items) {
    var pos = [], neg = [];
    items.forEach(function (x) { (x[0] > 0 ? pos : neg).push(x[1].k); });
    return t + '(' + pos.sort().join(',') + '|' + neg.sort().join(',') + ')';
  }
  function copyH(n) { var c = {}; for (var q in n) c[q] = n[q]; c.h = true; return c; }
  function negate(n, v) { return { k: chainKey('S', [[-1, n]]), v: v, t: 'S', it: [[-1, n]], h: n.h, tr: n.tr }; }
  // t = 'S' (a ± b) or 'P' (a ×/÷ b); sb = +1 for + or ×, −1 for − or ÷; v = value of the whole thing
  function chain(t, a, b, sb, v) {
    var raw = [], kept = [], h = a.h || b.h, tr = a.tr || b.tr, dropped = false, neg = false;
    function isHelper(n) { return t === 'S' ? n.v.n === 0 : isOne(n.v); }
    function add(n, s) {
      // a minus inside a product moves out front: 7×(0−2) is −(7×2)
      if (t === 'P' && n.t === 'S' && n.it.length === 1 && n.it[0][0] < 0) { neg = !neg; n = n.it[0][1]; }
      var list = n.t === t ? n.it.map(function (x) { return [x[0] * s, x[1]]; }) : [[s, n]];
      list.forEach(function (x) { raw.push(x); });
      if (isHelper(n)) { dropped = true; return; }
      list.forEach(function (x) { kept.push(x); });
    }
    add(a, 1); add(b, sb);
    // a number and its opposite cancel (+4 −4, ×4 ÷4)
    for (var i = 0; i < kept.length; i++) {
      for (var j = i + 1; j < kept.length; j++) {
        if (kept[i][0] !== kept[j][0] && kept[i][1].k === kept[j][1].k) { kept.splice(j, 1); kept.splice(i, 1); i--; dropped = true; break; }
      }
    }
    var inner = neg ? negV(v) : v, res;
    if (!kept.length) {
      if (raw.some(function (x) { return !isHelper(x[1]); })) { // it all cancelled: x−x or x÷x, any x
        res = { k: t + '(=)', v: inner, t: 'x', h: h || raw.some(function (x) { return isHelper(x[1]); }), tr: true };
      } else { // nothing but helpers (1×1, (3−2)×1, 0+0): keep just one of them
        var pos = raw.filter(function (x) { return x[0] > 0; }).sort(byKey), one = (pos.length ? pos : raw.slice().sort(byKey))[0];
        res = one[0] > 0 ? copyH(one[1]) : negate(copyH(one[1]), inner);
      }
    } else if (kept.length === 1 && kept[0][0] > 0) {
      res = dropped ? copyH(kept[0][1]) : kept[0][1];
    } else {
      res = { k: chainKey(t, kept), v: inner, t: t, it: kept, h: h || dropped, tr: tr };
    }
    if (tr) res.tr = true;
    return neg ? negate(res, v) : res;
  }
  function mkNode(o, a, b, v) {
    var tr = a.tr || b.tr;
    switch (o) {
      case '+': return chain('S', a, b, 1, v);
      case '-': return chain('S', a, b, -1, v);
      case '*': return chain('P', a, b, 1, v);
      case '/': return chain('P', a, b, -1, v);
      case '^':
        if (isOne(b.v) || isOne(a.v) || a.v.n === 0) return withTr(copyH(a), tr); // 5^1, 1^3, 0^2 change nothing
        if (b.v.n === 0) return { k: 'W(*,0)', v: v, t: 'x', h: a.h || b.h, tr: true }; // anything^0 = 1
        return { k: 'W(' + a.k + ',' + b.k + ')', v: v, t: 'W', h: a.h || b.h, tr: tr };
      case 'r': // a = index, b = radicand
        if (isOne(a.v) || isOne(b.v) || b.v.n === 0) return withTr(copyH(b), tr); // 1√x, √1, √0
        return { k: 'R(' + a.k + ',' + b.k + ')', v: v, t: 'R', h: a.h || b.h || (a.k === '2' && a !== ATOM2), tr: tr };
    }
  }
  function withTr(n, tr) { if (tr) n.tr = true; return n; }

  // Key of a Solution the kid built. tokens: symbols or {s} objects, one-digit numbers only.
  // Returns {ok:true, key, value, helper, trick} or {ok:false, code, msg}. Same grammar as Eq.evaluate.
  function wayKey(tokens, opts) {
    opts = opts || {};
    var ev = Eq.evaluate(tokens, { fractions: opts.fractions });
    if (!ev.ok) return ev;
    var toks = tokens.map(function (t) { return typeof t === 'string' ? t : t.s; }), p = 0, fr = !!opts.fractions;
    function peek() { return toks[p]; }
    function bin(o, a, b) { var r = opCore(o, a.v, b.v, fr); if (typeof r === 'string') throw { code: r }; return mkNode(o, a, b, r); }
    function expr() { var l = term(); while (peek() === '+' || peek() === '-') { var o = toks[p++]; l = bin(o, l, term()); } return l; }
    function term() { var l = power(); while (peek() === '*' || peek() === '/') { var o = toks[p++]; l = bin(o, l, power()); } return l; }
    function power() { var b = rootChain(); if (peek() === '^') { p++; return bin('^', b, power()); } return b; }
    function rootChain() { var a = atomP(); while (peek() === 'r') { p++; a = bin('r', a, atomP()); } return a; }
    function atomP() {
      var k = toks[p++];
      if (isDigit(k)) return atom(k);
      if (k === '(') { var v = expr(); p++; return v; }
      if (k === 'r') { var x = atomP(); return bin('r', ATOM2, x); }
      throw { code: 'syntax' };
    }
    try { var n = expr(); return { ok: true, key: n.k, value: n.v, helper: !!n.h, trick: !!n.tr }; }
    catch (e) { if (e && e.code) return { ok: false, code: e.code, msg: Eq.MSG[e.code] || e.code }; throw e; }
  }

  // ---- Enumerate every distinct way ----
  function wrap(e, need) { return e.p < need ? '(' + e.s + ')' : e.s; }
  function text(o, L, R) { // fewest parentheses that Eq.evaluate reads back the same way
    switch (o) {
      case '+': case '-': return { s: L.s + o + (R.p <= 1 ? '(' + R.s + ')' : R.s), p: 1 };
      case '*': case '/': return { s: wrap(L, 2) + o + (R.p <= 2 ? '(' + R.s + ')' : R.s), p: 2 };
      case '^': return { s: (L.p <= 3 ? '(' + L.s + ')' : L.s) + '^' + wrap(R, 3), p: 3 };
      case 'r': return { s: wrap(L, 4) + 'r' + wrap(R, 4), p: 3.5 };
    }
  }
  var splitCache = {};
  function splits(S) {
    if (splitCache[S]) return splitCache[S];
    var vals = Eq.uniq(S.split('')), cnt = vals.map(function (v) { return S.split(v).length - 1; });
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
  var STOP = { stop: true };

  // p: {cubes: [symbols], fractions, timeMs (default 300), maxNodes (default 150000)}
  // Every cube is optional (like Permitted cubes). A Solution needs at least two cubes.
  // Returns {complete, ms, nodes, byValue: {'n/d': [way, ...]}} where
  // way = {key, expr (internal symbols), tokens, cubes (count), ops: [op symbols used]};
  // each value's list is sorted fewest cubes first. complete=false: ran out of time or room,
  // so there may be more ways than listed.
  function allWays(p) {
    var t0 = nowMs(), deadline = t0 + (p.timeMs || 300), maxNodes = p.maxNodes || 150000, fr = !!p.fractions;
    var syms = (p.cubes || []).map(function (s) { return typeof s === 'string' ? s : s.s; });
    var digits = syms.filter(isDigit).sort().join('');
    var cnt = {}; syms.forEach(function (s) { if (!isDigit(s)) cnt[s] = (cnt[s] || 0) + 1; });
    var types = OPS.filter(function (o) { return cnt[o] > 0; }), opsTotal = 0;
    types.forEach(function (o) { opsTotal += cnt[o]; });
    var radix = {}, mul = 1; types.forEach(function (o) { radix[o] = mul; mul *= cnt[o] + 1; });
    function dec(u, o) { return Math.floor(u / radix[o]) % (cnt[o] + 1); }
    function addU(a, b) { for (var i = 0; i < types.length; i++) { var o = types[i]; if (dec(a, o) + dec(b, o) > cnt[o]) return -1; } return a + b; }
    function used(u) { var n = 0; types.forEach(function (o) { n += dec(u, o); }); return n; }
    var memo = {}, nodes = 0, tick = 0, complete = true;
    function put(m, u, e) {
      var b = m.get(u); if (!b) { b = new Map(); m.set(u, b); }
      if (b.has(e.c.k)) return;
      b.set(e.c.k, e);
      if (++nodes > maxNodes) throw STOP;
    }
    function dp(S) {
      if (memo[S]) return memo[S];
      if (nowMs() > deadline) throw STOP;
      var m = new Map();
      if (S.length === 1) put(m, 0, { v: { n: +S, d: 1 }, c: atom(S), s: S, p: 4 });
      else if (S.length - 1 <= opsTotal) {
        splits(S).forEach(function (sp) {
          var A = sp[0], B = sp[1], mA = dp(A), mB = dp(B);
          mA.forEach(function (bA, uA) {
            mB.forEach(function (bB, uB) {
              var uAB = addU(uA, uB); if (uAB < 0) return;
              types.forEach(function (o) {
                if ((o === '+' || o === '*') && A > B) return; // the other order gives the same way
                var u = addU(uAB, radix[o]); if (u < 0) return;
                bA.forEach(function (ea) {
                  bB.forEach(function (eb) {
                    if (((++tick) & 2047) === 0 && nowMs() > deadline) throw STOP;
                    var r = opCore(o, ea.v, eb.v, fr);
                    if (typeof r === 'string') return;
                    var c = mkNode(o, ea.c, eb.c, r), tx = text(o, ea, eb);
                    put(m, u, { v: r, c: c, s: tx.s, p: tx.p });
                  });
                });
              });
            });
          });
        });
      }
      // square roots (no index cube): √x, and √√x if there are two √ cubes
      for (var rep = 0; rep < (cnt.r || 0); rep++) {
        var adds = [];
        m.forEach(function (b, u) {
          var u2 = addU(u, radix.r); if (u2 < 0) return;
          b.forEach(function (e) {
            if (e.v.d !== 1 || e.v.n < 0) return;
            var r = opCore('r', TWO, e.v, false);
            if (typeof r !== 'string') adds.push([u2, { v: r, c: mkNode('r', ATOM2, e.c, r), s: 'r' + wrap(e, 4), p: 4 }]);
          });
        });
        if (!adds.length) break;
        adds.forEach(function (a) { put(m, a[0], a[1]); });
      }
      memo[S] = m;
      return m;
    }
    // every sub-multiset of the digits, smallest first
    var subs = [''];
    Eq.uniq(digits.split('')).forEach(function (d) {
      var c = digits.split(d).length - 1, next = [];
      subs.forEach(function (s) { for (var k = 0; k <= c; k++) next.push(s + d.repeat(k)); });
      subs = next;
    });
    subs = subs.filter(function (s) { return s.length >= 1 && s.length - 1 <= opsTotal; }).map(function (s) { return s.split('').sort().join(''); });
    subs.sort(function (a, b) { return a.length - b.length || (a < b ? -1 : 1); });
    var byValue = {}, seen = {};
    try { subs.forEach(function (S) { dp(S); }); } catch (x) { if (x !== STOP) throw x; complete = false; }
    subs.forEach(function (S) {
      var m = memo[S]; if (!m) return;
      m.forEach(function (b, u) {
        var nc = S.length + used(u);
        if (nc < 2) return;
        b.forEach(function (e) {
          var k = vk(e.v), id = k + '#' + e.c.k;
          var w = { key: e.c.k, expr: e.s, tokens: e.s.split(''), cubes: nc, ops: types.filter(function (o) { return dec(u, o) > 0; }) };
          if (seen[id]) { if (nc < seen[id].cubes) { var L = byValue[k]; L[L.indexOf(seen[id])] = w; seen[id] = w; } return; }
          seen[id] = w; (byValue[k] = byValue[k] || []).push(w);
        });
      });
    });
    Object.keys(byValue).forEach(function (k) { byValue[k].sort(function (a, b) { return a.cubes - b.cubes || a.expr.length - b.expr.length; }); });
    return { complete: complete, ms: Math.round(nowMs() - t0), nodes: nodes, byValue: byValue };
  }
  // The distinct ways to make one Goal. p: like allWays plus goal ({n,d}).
  function waysFor(p) {
    var a = allWays(p);
    return { complete: a.complete, ms: a.ms, ways: a.byValue[vk(p.goal)] || [] };
  }
  // Medal thresholds for a puzzle with `total` ways. Gold never needs every way once there are 4+,
  // and tops out at 10, so a puzzle with lots of ways stays reachable.
  function wayMedals(total) {
    if (total <= 1) return { bronze: 1, silver: 1, gold: 1 };
    if (total === 2) return { bronze: 1, silver: 2, gold: 2 };
    if (total === 3) return { bronze: 1, silver: 2, gold: 3 };
    var gold = Math.min(10, Math.max(3, Math.ceil(total * 0.6)));
    var bronze = Math.max(1, Math.round(gold / 3)), silver = Math.max(bronze + 1, Math.round(gold * 2 / 3));
    if (silver >= gold) silver = gold - 1;
    return { bronze: bronze, silver: silver, gold: gold };
  }
  Eq.wayKey = wayKey; Eq.allWays = allWays; Eq.waysFor = waysFor; Eq.wayMedals = wayMedals;
})(Eq);
/*ENGINE-END*/
