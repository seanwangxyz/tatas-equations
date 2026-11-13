'use strict';
// ======================= EXPLAIN THIS SOLUTION =======================
// A step-by-step walk through any Solution, one operation at a time, with the running value.
// Two parts:
//   Engine (pure)  Explain.steps(tokens, ctx) -> the ordered steps, the end line, rules broken, a near fix.
//                  Needs only Eq (js/engine.js); tests/explain.test.js runs it under plain node.
//   UI (page)      Explain.buttonHTML(tokens, ctx) -> an "Explain it" button for any Solution on screen;
//                  Explain.open(tokens, ctx) -> the step-through card (its own layer above the pop-up).
//
// HONESTY RULE: the steps are only shown when the engine agrees with them.
//   - The grouping is read with the engine's own operator table (Eq.OPDEF: kind, lvl, card), never a
//     second hand-written list of operators.
//   - Every sub-result is computed by the engine (Eq.opCore / Eq.unCore) AND cross-checked with
//     Eq.evaluate on the same piece of the Solution.
//   - Every rewritten expression is turned back into engine tokens (worked-out numbers are written with
//     mode-proof bonus symbols) and Eq.evaluate must give the same final value.
//   - The final value must equal Eq.evaluate of the whole Solution.
//   If anything disagrees (or a symbol is unknown) the explanation falls back to the honest
//   "I can show the answer but not the steps for this one."
//
// ctx (all optional): {
//   goal: {n,d}            the Goal's value (as the game shows it)
//   fractions | mode       the shake's math mode (true/false or an Eq.mathMode object), as G.fractions
//   wild: digit            0 Wild: the digit the 0 cubes stand for (else found like checkSolution does)
//   chk: checkSolution result, or reasons: [strings], or check: a checkSolution ctx (rules broken)
//   cubes: G.cubes (or {id: {color}}) for cube colours;  who: 'Ollie' (name shown on the card)
// }
// Engine functions used: Eq.evaluate, Eq.opCore, Eq.unCore, Eq.OPDEF, Eq.rulesOf, Eq.resolve, Eq.fmt,
// Eq.orient, Eq.pobOf, Eq.exOf, Eq.isNumSym, Eq.isDigit, Eq.bigOf, Eq.bigIdx, Eq.BIG_FACES, Eq.goalAt,
// Eq.multOk, Eq.checkSolution, Eq.MSG, Eq.SHOW, Eq.cubeOf, Eq.isBonusOp (each guarded where optional).
var Explain = (function () {
  var FALLBACK = 'I can show the answer but not the steps for this one.';
  var LASTWHY = null; // why the last explanation fell back (for tests and debugging)
  var LEVELWORD = { 1: 'plus and minus', 2: 'times and divide', 3: 'powers', 3.5: 'roots' };
  var MAINOPS = { 1: ['+', '-'], 2: ['*', '/'], 3: ['^'], 3.5: ['r'] };
  var OPNAME = { a: '+ (average)', m: 'rem', '%': '%', g: 'gcf', l: 'lcm', M: 'mod', E: '%', X: 'max', I: 'min', Y: 'avg', G: 'gcf', L: 'lcm' };

  function sym(t) { return typeof t === 'string' ? t : (t && t.s); }
  function vEq(a, b) { return !!(a && b && a.n === b.n && a.d === b.d); }
  function has(fn) { return typeof Eq !== 'undefined' && Eq && typeof Eq[fn] === 'function'; }
  function fmt(v) { return v ? Eq.fmt(v) : '?'; }
  function isWhole(v) { return v && v.d === 1; }
  // A value inside a sentence: negatives on the right and mixed numbers get brackets ("5 × (−3)").
  function opnd(v, right) { var s = fmt(v); return ((right && v.n < 0) || (v.d !== 1 && Math.abs(v.n) > v.d)) ? '(' + s + ')' : s; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function opdef(k) { return (Eq.OPDEF && Eq.OPDEF[k]) || null; }
  function opLabel(k) { return OPNAME[k] || (Eq.SHOW && Eq.SHOW[k]) || k; }

  // ---------- small maths for the kid sentences (words only; every value comes from the engine) ----------
  function factorList(n) { var f = []; for (var k = 1; k <= n; k++) if (n % k === 0) f.push(k); return f; }
  function times(x, k) { var a = []; for (var i = 0; i < k; i++) a.push(x); return a.join(' × '); }

  // ---------- 1. Read the tokens into leaves and operators ----------
  function lex(R, RU, mode, w) {
    var L = [], i = 0, digit = Eq.isDigit;
    while (i < R.length) {
      var s = sym(R[i]);
      if (digit(s) || (s === '.' && RU.dec)) {
        var j = i;
        while (j + 1 < R.length && (digit(sym(R[j + 1])) || (sym(R[j + 1]) === '.' && RU.dec))) j++;
        L.push(leaf(R, i, j, RU, mode, w)); i = j + 1; continue;
      }
      if (Eq.isNumSym(s)) { L.push(leaf(R, i, i, RU, mode, w)); i++; continue; }
      if (Eq.exOf(s) >= 0) { L.push({ k: 'e', d: Eq.exOf(s), i: i, j: i }); i++; continue; }
      if (s === '(' || s === ')' || opdef(s)) { L.push({ k: s, i: i, j: i }); i++; continue; }
      throw { unknown: s };
    }
    return L;
  }
  // A number all by itself: digits (a numeral), a turned cube, a power of ten, the big-number die.
  // Its value comes from Eq.evaluate on just those cubes; .read = it needs a "what this cube means" step.
  function leaf(R, i, j, RU, mode, w) {
    var toks = R.slice(i, j + 1), syms = toks.map(sym);
    var ev = Eq.evaluate(toks, { fractions: mode, wild: w, multiDigit: true });
    var n = { k: 'n', i: i, j: j, type: 'leaf', syms: syms, err: ev.ok ? null : ev, v: ev.ok ? ev.value : null, read: null };
    if (!ev.ok) return n;
    var s0 = syms[0], o = Eq.orient(s0), v = ev.value;
    if (syms.length === 1 && o && o.o === 'u' && o.d) n.read = { why: 'Upside-down cube.', what: 'This ' + o.d + ' is upside-down, so it means ' + fmt(v) + '.' };
    else if (syms.length === 1 && o && o.o === 's') n.read = { why: 'Cube on its side.', what: 'This ' + o.d + ' is lying on its side, so it means 1/' + o.d + (o.d === 1 ? '' : ' (one ' + ['', '', 'half', 'third', 'quarter', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'][o.d] + ')') + '.' };
    else if (syms.length === 1 && Eq.pobOf(s0) !== null) n.read = { why: 'Powers of Ten card.', what: 'This 1 stands for ' + (Eq.SHOW[s0] || fmt(v)) + (v.d !== 1 ? ' (that is ' + fmt(v) + ')' : '') + '.' };
    else if (syms.length === 1 && has('bigIdx') && Eq.bigIdx(s0) >= 0) { if (v.d !== 1) n.read = { why: 'Purple bonus cube.', what: 'The purple bonus cube is the number ' + fmt(v) + '.' }; }
    else if (syms.indexOf('.') >= 0) {
      var txt = syms.map(function (c) { return c === '0' && RU.wild ? String(w) : c; }).join('');
      n.read = { why: 'Decimal point.', what: 'The ^ cube is a decimal point here, so these cubes make ' + txt + (v.d !== 1 ? ' (that is ' + fmt(v) + ')' : '') + '.' };
    } else {
      var hasZero = syms.indexOf('0') >= 0 && RU.wild && w !== 0;
      var shown = syms.map(function (c) { return c === '0' && RU.wild ? String(w) : c; });
      if (RU.basem && syms.length === 2) {
        n.read = { why: 'Base ' + RU.base + '.', what: (hasZero ? 'The wild 0 stands for ' + w + ', so this is ' + shown.join('') + '. ' : '') + 'In base ' + RU.base + ', ' + shown.join('') + ' means ' + shown[0] + ' ' + (RU.base === 8 ? 'eight' : RU.base === 9 ? 'nine' : 'group') + (shown[0] === '1' ? '' : 's') + ' and ' + shown[1] + ' = ' + fmt(v) + '.' };
      } else if (hasZero) n.read = { why: 'Wild 0.', what: syms.length > 1 ? 'The wild 0 stands for ' + w + ' here, so these cubes make ' + fmt(v) + '.' : 'The wild 0 stands for ' + w + ' here.' };
    }
    return n;
  }

  // ---------- 2. Group them the way the engine does, from its operator table ----------
  // Levels come from Eq.OPDEF (binary ops: lvl; 'pre' / 'post' ops bind to one number). The power level
  // (the level of '^') groups right to left, like the engine; every other level left to right.
  function parse(L, RU) {
    var p = 0, levels = [], RIGHT = opdef('^') ? opdef('^').lvl : 3;
    Object.keys(Eq.OPDEF).forEach(function (k) { var lv = lvlOf(k); if (lv && levels.indexOf(lv) < 0) levels.push(lv); });
    levels.sort(function (a, b) { return a - b; });
    function lvlOf(k) { var d = opdef(k); return d && d.kind === 'bin' && (!d.card || RU[d.card]) ? d.lvl : 0; }
    function peek() { return L[p] ? L[p].k : null; }
    function bad() { throw { parse: true }; }
    function bin(op, l, r, at) { return { type: 'bin', op: op, lvl: lvlOf(op), l: l, r: r, i: l.i, j: r.j, at: at }; }
    function level(ix) {
      if (ix >= levels.length) return atom();
      var lv = levels[ix], l = level(ix + 1), at;
      if (lv === RIGHT) {
        if (lvlOf(peek()) === lv) { at = L[p].i; var o = L[p++].k; return bin(o, l, level(ix), at); }
        return l;
      }
      while (lvlOf(peek()) === lv) { at = L[p].i; var op = L[p++].k; l = bin(op, l, level(ix + 1), at); }
      return l;
    }
    function isPost(k) { var d = opdef(k); return k === 'e' || !!(d && d.kind === 'post'); }
    function atom() {
      var v = primary();
      while (isPost(peek())) { var t = L[p++]; v = { type: 'post', op: t.k, ex: t.d, c: v, i: v.i, j: t.j, at: t.i }; }
      return v;
    }
    function primary() {
      var t = L[p]; if (!t) bad();
      if (t.k === 'n') { p++; return t; }
      if (t.k === '(') {
        p++; if (peek() === ')' || peek() === null) bad();
        var c = level(0); if (peek() !== ')') bad();
        var e = L[p++]; return { type: 'group', c: c, i: t.i, j: e.j };
      }
      var d = opdef(t.k);
      if (t.k === 'r' || (d && d.kind === 'pre')) { p++; var x = atom(); return { type: 'pre', op: t.k, c: x, i: t.i, j: x.j, at: t.i }; }
      bad();
    }
    var root = level(0);
    if (p < L.length) bad();
    return root;
  }

  // ---------- 3. Mode-proof engine tokens for a worked-out number (for the double check) ----------
  // Digits change meaning with cards (base 8, the wild 0), and + does too (Average), so a worked-out
  // number is written with the big-number die's numbers, − × ÷ and the gold "negative" cube (U), which
  // no card changes. null = this engine can't do that (the double check of rewritten lines is skipped).
  var ENC = null;
  function encInit() {
    if (ENC !== null) return ENC;
    ENC = false;
    try {
      if (!Eq.BIG_FACES || !has('bigOf') || !opdef('U') || !opdef('-') || !opdef('*') || !opdef('/')) return ENC;
      var by = {}; Eq.BIG_FACES.forEach(function (s) { var v = Eq.bigOf(s); if (v && v.d === 1 && by[v.n] === undefined) by[v.n] = s; });
      var need = [10, 11, 12, 15, 20, 24, 30, 36];
      if (need.some(function (n) { return by[n] === undefined; })) return ENC;
      var b = function (n) { return by[n]; };
      var D = [['(', b(10), '-', b(10), ')'], ['(', b(11), '-', b(10), ')'], ['(', b(12), '-', b(10), ')'], ['(', b(15), '-', b(12), ')'], ['(', b(24), '-', b(20), ')'],
        ['(', b(15), '-', b(10), ')'], ['(', b(36), '-', b(30), ')'], ['(', b(12), '-', '(', b(15), '-', b(10), ')', ')'], ['(', b(20), '-', b(12), ')'], ['(', b(24), '-', b(15), ')']];
      var TEN = b(10);
      var enc = function (v) {
        if (v.d !== 1) return ['('].concat(enc({ n: v.n, d: 1 }), ['/'], enc({ n: v.d, d: 1 }), [')']);
        if (v.n < 0) return ['(', 'U'].concat(enc({ n: -v.n, d: 1 }), [')']);
        if (v.n < 10) return D[v.n].slice();
        return ['(', '('].concat(enc({ n: Math.floor(v.n / 10), d: 1 }), ['*', TEN, ')', '-', '(', 'U'], D[v.n % 10], [')', ')']);
      };
      // self-test in the plainest mode before trusting it
      var ok = [0, 7, 9, 10, 99, 123, 5040, 362880, -3, -45].every(function (n) { var e = Eq.evaluate(enc({ n: n, d: 1 }), { fractions: true }); return e.ok && e.value.n === n && e.value.d === 1; }) &&
        [[1, 2], [-7, 3], [22, 7]].every(function (x) { var e = Eq.evaluate(enc({ n: x[0], d: x[1] }), { fractions: true }); return e.ok && e.value.n === x[0] && e.value.d === x[1]; });
      if (ok) ENC = enc;
    } catch (e) { ENC = false; }
    return ENC;
  }

  // ---------- 4. Walk the tree in "careful person" order ----------
  function kids(n) { return n.type === 'bin' ? [n.l, n.r] : (n.type === 'pre' || n.type === 'post' || n.type === 'group') ? [n.c] : []; }
  function valued(n) { if (n.type === 'leaf') return !!n.v; if (n.type === 'group') return valued(n.c); return !!n.val; }
  function valOf(n) { if (n.type === 'leaf') return n.v; if (n.type === 'group') return valOf(n.c); return n.val; }
  function each(n, f, par, depth, grp) {
    n.par = par || null; n.depth = depth || 0; n.grp = grp || null; f(n);
    var d = n.type === 'group' ? n.depth + 1 : n.depth, g = n.type === 'group' ? n : n.grp;
    kids(n).forEach(function (c) { each(c, f, n, d, g); });
  }
  function rankOf(n) { return n.type === 'post' ? 10 : n.type === 'pre' ? 9 : n.lvl || 0; }
  function inside(n, a) { for (var x = n; x; x = x.par) if (x === a) return true; return false; }

  // The current expression as display segments. A segment: {tok, idx} (a cube, bracket or !), or {v} (a
  // worked-out number), with .f = true when it belongs to the part being worked on.
  function segs(n, R, focus, out, inF) {
    out = out || []; var f = inF || n === focus;
    if ((n.type === 'leaf' && n.read && n.readDone) || (n.type !== 'leaf' && n.type !== 'group' && n.val)) { out.push({ v: valOf(n), f: f, i: n.i, j: n.j }); return out; }
    if (n.type === 'group' && valued(n.c) && n.c.type !== 'leaf') { out.push({ v: valOf(n), f: f, i: n.i, j: n.j }); return out; }
    if (n.type === 'group' && n.c.type === 'leaf' && (!n.c.read || n.c.readDone)) { // (3) is just 3 once it is read
      if (n.c.read) { out.push({ v: n.c.v, f: f || n.c === focus, i: n.i, j: n.j }); return out; }
    }
    if (n.type === 'leaf') { for (var k = n.i; k <= n.j; k++) out.push({ tok: R[k], idx: k, f: f }); return out; }
    if (n.type === 'group') { out.push({ tok: R[n.i], idx: n.i, f: f }); segs(n.c, R, focus, out, f); out.push({ tok: R[n.j], idx: n.j, f: f }); return out; }
    if (n.type === 'bin') { segs(n.l, R, focus, out, f); for (var a = n.l.j + 1; a < n.r.i; a++) out.push({ tok: R[a], idx: a, f: f }); segs(n.r, R, focus, out, f); return out; }
    if (n.type === 'pre') { for (var b = n.i; b < n.c.i; b++) out.push({ tok: R[b], idx: b, f: f }); segs(n.c, R, focus, out, f); return out; }
    if (n.type === 'post') { segs(n.c, R, focus, out, f); for (var c = n.c.j + 1; c <= n.j; c++) out.push({ tok: R[c], idx: c, f: f }); return out; }
    return out;
  }
  function tokText(s) {
    if (s === 'a') return '+';
    if (s === 'f' || s === 'p') return '×';
    if (s === 'F') return '!';
    if (s === 'Q') return '²';
    if (s === 'C') return '³';
    return (Eq.SHOW && Eq.SHOW[s]) || s;
  }
  function segText(list) {
    var many = list.length > 1, out = [];
    list.forEach(function (g, k) {
      if (g.v) { var s = fmt(g.v); out.push(many && (g.v.n < 0 || g.v.d !== 1) ? '(' + s + ')' : s); return; }
      var t = sym(g.tok), prev = k > 0 && !list[k - 1].v ? sym(list[k - 1].tok) : null;
      var glue = prev !== null && (Eq.isDigit(prev) || prev === '.') && (Eq.isDigit(t) || t === '.');
      if (glue) out[out.length - 1] += tokText(t); else out.push(tokText(t)); // a numeral's digits stay together: 23, 2.5
    });
    return out.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/ ([!²³⁰¹⁴⁵⁶⁷⁸⁹])/g, '$1');
  }
  function segTokens(list, enc) {
    var out = [];
    for (var k = 0; k < list.length; k++) { var g = list[k]; if (g.v) { if (!enc) return null; out = out.concat(enc(g.v)); } else out.push(g.tok); }
    return out;
  }

  // ---------- 5. Words for one operation ----------
  function whatOf(n, a, b, r, RU) {
    var op = n.op;
    switch (op) {
      case '+': return opnd(a) + ' + ' + opnd(b, 1) + ' = ' + fmt(r) + '.';
      case '-': return opnd(a) + ' − ' + opnd(b, 1) + ' = ' + fmt(r) + '.';
      case '*': return opnd(a) + ' × ' + opnd(b, 1) + ' = ' + fmt(r) + '.';
      case '/': return opnd(a) + ' ÷ ' + opnd(b, 1) + ' = ' + fmt(r) + '.';
      case '^':
        if (b.n === 0) return opnd(a) + ' to the power 0 is 1 (that is the rule for power 0).';
        if (b.n === 1) return opnd(a) + ' to the power 1 is just ' + fmt(a) + '.';
        return opnd(a) + ' to the power ' + fmt(b) + ' means ' + (b.n <= 5 ? times(opnd(a, 1), b.n) : fmt(a) + ' multiplied ' + fmt(b) + ' times') + ' = ' + fmt(r) + '.';
      case 'e':
        return 'The little raised ' + b.n + ' means ' + (b.n === 2 ? 'squared' : b.n === 3 ? 'cubed' : 'to the power ' + b.n) + ': ' + (b.n === 0 ? 'anything to the power 0 is 1' : b.n === 1 ? 'to the power 1 is just ' + fmt(a) : times(opnd(a, 1), b.n) + ' = ' + fmt(r)) + '.';
      case 'R': return '√x asks: which number times itself makes ' + fmt(a) + '? It is ' + fmt(r) + ', because ' + times(fmt(r), 2) + ' = ' + fmt(a) + '.';
      case 'r':
        if (a.n === 1) return '1√' + fmt(b) + ' is just ' + fmt(b) + '.';
        if (a.n === 2) return '√' + fmt(b) + ' asks: which number times itself makes ' + fmt(b) + '? It is ' + fmt(r) + ', because ' + times(fmt(r), 2) + ' = ' + fmt(b) + '.';
        return a.n + '√' + fmt(b) + ' asks: which number, multiplied by itself ' + a.n + ' times, makes ' + fmt(b) + '? It is ' + fmt(r) + ', because ' + times(fmt(r), a.n) + ' = ' + fmt(b) + '.';
      case 'm': case 'M':
        return opnd(a) + ' ' + (op === 'm' ? 'rem' : 'mod') + ' ' + opnd(b, 1) + ': ' + fmt(a) + ' ÷ ' + fmt(b) + ' is ' + Math.floor(a.n / b.n) + ' with ' + fmt(r) + ' left over, so it is ' + fmt(r) + '.' + (op === 'm' ? ' (A sideways ÷ means what is left over.)' : '');
      case 'a': return 'On this card + means the average: halfway between ' + fmt(a) + ' and ' + fmt(b) + ' is ' + fmt(r) + '.';
      case 'Y': return 'avg means the average: halfway between ' + fmt(a) + ' and ' + fmt(b) + ' is ' + fmt(r) + '.';
      case '%': case 'E': return opnd(a) + ' % ' + opnd(b, 1) + ' means ' + fmt(a) + ' percent of ' + fmt(b) + ': ' + opnd(a) + ' × ' + opnd(b, 1) + ' ÷ 100 = ' + fmt(r) + '.';
      case 'g': case 'G': return 'The greatest common factor of ' + fmt(a) + ' and ' + fmt(b) + ' (the biggest number that goes into both) is ' + fmt(r) + '.';
      case 'l': case 'L': return 'The lowest common multiple of ' + fmt(a) + ' and ' + fmt(b) + ' (the smallest number they both go into) is ' + fmt(r) + '.';
      case 'X': return 'max picks the bigger one of ' + fmt(a) + ' and ' + fmt(b) + ': ' + fmt(r) + '.';
      case 'I': return 'min picks the smaller one of ' + fmt(a) + ' and ' + fmt(b) + ': ' + fmt(r) + '.';
      case 'f': case 'N':
        var fl = isWhole(a) && a.n > 0 && a.n <= 1000 ? factorList(a.n) : null;
        return (op === 'f' ? 'A × with no number in front of it counts factors: ' : '# counts factors: ') + fmt(a) + ' has ' + fmt(r) + ' factor' + (r.n === 1 ? '' : 's') + (fl && fl.length <= 12 ? ' (' + fl.join(', ') + ')' : '') + '.';
      case 'p': return 'A × with no number in front of it means the next prime: the smallest prime bigger than ' + fmt(a) + ' is ' + fmt(r) + '.';
      case '!': case 'F':
        if (a.n <= 1) return fmt(a) + '! is 1 (that is the rule for 0! and 1!).';
        var fs = []; for (var k = a.n; k >= 1; k--) fs.push(k);
        return fmt(a) + '! means ' + fs.join(' × ') + ' = ' + fmt(r) + '.';
      case 'Q': return 'x² means squared: ' + opnd(a, 1) + ' × ' + opnd(a, 1) + ' = ' + fmt(r) + '.';
      case 'C': return 'x³ means cubed: ' + times(opnd(a, 1), 3) + ' = ' + fmt(r) + '.';
      case 'A': return '|x| is the distance from 0: ' + fmt(a) + ' is ' + fmt(r) + ' away from 0.';
      case 'D': return '2× doubles it: 2 × ' + opnd(a, 1) + ' = ' + fmt(r) + '.';
      case 'B': return '½× takes half: half of ' + fmt(a) + ' is ' + fmt(r) + '.';
      case 'U': return '−x makes the opposite number: the opposite of ' + fmt(a) + ' is ' + fmt(r) + '.';
      case 'O': return '1/x turns it upside down: 1 ÷ ' + opnd(a, 1) + ' = ' + fmt(r) + '.';
      case 'S': return 'Σ adds up the digits of ' + fmt(a) + ': ' + String(Math.abs(a.n)).split('').join(' + ') + ' = ' + fmt(r) + '.';
    }
    var sh = (Eq.SHOW && Eq.SHOW[op]) || op;
    if (n.type === 'bin') return opnd(a) + ' ' + sh + ' ' + opnd(b, 1) + ' = ' + fmt(r) + '.';
    return sh + ' with ' + fmt(a) + ' gives ' + fmt(r) + '.';
  }
  function whyOf(n, root, started, isLast) {
    // brackets first
    var g = n.grp, fresh = false;
    for (var x = g; x; x = x.grp) if (!started[x.i]) fresh = true;
    if (fresh) { for (var y = g; y; y = y.grp) started[y.i] = true; return 'Brackets first: work out the inside of the ( ) before anything else.'; }
    if (n.type === 'post') {
      if (n.op === 'e') return 'A little raised number is a power for the number right before it.';
      return isLast ? (root.nOps > 1 ? 'Last step.' : 'Just one step.') : (n.op === '!' ? 'The ! belongs to the number right before it, so it goes first.' : 'The gold ' + tokText(n.op) + ' cube works on the number right before it, so it goes first.');
    }
    if (n.type === 'pre') {
      if (isLast) return root.nOps > 1 ? 'Last step.' : 'Just one step.';
      if (n.op === 'r') return '√ works on the number right after it, so it goes first.';
      if (n.op === 'f' || n.op === 'p') return 'This × has no number in front of it, so it works on the number right after it first.';
      return 'The gold ' + tokText(n.op) + ' cube works on the number right after it, so it goes first.';
    }
    // a lower level still waiting in the same brackets?
    var low = null;
    each(root, function (m) {
      if (m.type === 'bin' && !m.val && m !== n && m.grp === n.grp && !inside(m, n) && m.lvl < n.lvl && (low === null || m.lvl < low)) low = m.lvl;
    });
    if (low !== null) {
      var main = MAINOPS[n.lvl] && MAINOPS[n.lvl].indexOf(n.op) >= 0, lw = LEVELWORD[low] || 'the others';
      if (main && LEVELWORD[n.lvl]) return cap(LEVELWORD[n.lvl]) + ' come before ' + lw + '.';
      return opLabel(n.op) + ' goes with ' + (LEVELWORD[n.lvl] || 'the strong steps') + ', so it comes before ' + lw + '.';
    }
    var par = n.par; while (par && par.type === 'group') par = null;
    if (par && par.type === 'bin' && !par.val && par.lvl === n.lvl) {
      var RIGHT = opdef('^') ? opdef('^').lvl : 3;
      if (n.lvl === RIGHT && par.r === n) return 'Two powers in a row: start with the top one, on the right.';
      if (par.l === n) return 'Same kind of step twice, so go from left to right.';
    }
    return isLast ? (root.nOps > 1 ? 'Last step.' : 'Just one step.') : 'Next, this part is ready to work out.';
  }

  // ---------- 6. The whole explanation ----------
  function steps(tokens, ctx) {
    ctx = ctx || {};
    var out = { ok: false, fallback: false, steps: [], value: null, error: null, end: null, rules: [], fix: null, verdict: null, wild: null, tokens: tokens || [] };
    try { return build(tokens || [], ctx, out); }
    catch (e) { LASTWHY = e; return fallback(out, tokens || [], ctx); }
  }
  function fallback(out, tokens, ctx) {
    out.fallback = true; out.text = FALLBACK; out.steps = [];
    try {
      var mode = modeOf(ctx), ev = Eq.evaluate(tokens, { fractions: mode, wild: typeof ctx.wild === 'number' ? ctx.wild : undefined });
      out.value = ev.ok ? ev.value : null; out.error = ev.ok ? null : { code: ev.code, msg: ev.msg };
      out.end = endLine(out.value, ctx, Eq.rulesOf(mode), mode, out.wild);
      out.rules = rulesOf(ctx, tokens, mode);
      out.verdict = verdictOf(out, ctx);
    } catch (e2) { /* nothing more to say */ }
    return out;
  }
  function modeOf(ctx) { return ctx.fractions !== undefined ? ctx.fractions : ctx.mode !== undefined ? ctx.mode : false; }
  function goalAt(ctx, RU, mode, w) {
    if (!ctx.goal) return null;
    if (RU.wild && RU.goal && RU.goal.indexOf('0') >= 0 && typeof w === 'number' && has('goalAt')) return Eq.goalAt(RU.goal, w, mode) || ctx.goal;
    return ctx.goal;
  }
  function pickWild(tokens, ctx, RU, mode) {
    var zs = tokens.some(function (t) { return sym(t) === '0'; }), zg = RU.wild && RU.goal && RU.goal.indexOf('0') >= 0;
    if (!RU.wild || (!zs && !zg)) return undefined;
    if (typeof ctx.wild === 'number') return ctx.wild;
    if (ctx.chk && typeof ctx.chk.wildAs === 'number') return ctx.chk.wildAs;
    var first = null;
    for (var w = 0; w <= 9; w++) {
      var e = Eq.evaluate(tokens, { fractions: mode, wild: w });
      if (!e.ok) continue;
      if (first === null) first = w;
      var g = goalAt(ctx, RU, mode, w);
      if (g && (RU.multk && has('multOk') ? Eq.multOk(e.value, g, RU.k) : vEq(e.value, g))) return w;
    }
    return first === null ? 0 : first;
  }
  function build(tokens, ctx, out) {
    var mode = modeOf(ctx), RU = Eq.rulesOf(mode);
    if (!tokens.length) { out.ok = true; out.error = { code: 'empty', msg: Eq.MSG.empty }; out.end = { text: Eq.MSG.empty, ok: false }; out.verdict = 'wrong'; return out; }
    var w = pickWild(tokens, ctx, RU, mode); out.wild = typeof w === 'number' ? w : null;
    var opts = { fractions: mode, wild: w };
    var whole = Eq.evaluate(tokens, opts);
    var R = has('resolve') ? Eq.resolve(tokens, mode) : tokens.slice();
    var rr = Eq.evaluate(R, opts);
    if (rr.ok !== whole.ok || (whole.ok && !vEq(rr.value, whole.value))) throw { disagree: 'resolve' };
    out.rules = rulesOf(ctx, tokens, mode);
    var L, root;
    try { L = lex(R, RU, mode, w); root = parse(L, RU); }
    catch (e) {
      if (e && e.unknown !== undefined && whole.ok) throw e;           // a symbol this file does not know: fallback
      if (whole.ok) throw { disagree: 'parse' };
      return stuck(out, whole, ctx, RU, mode, tokens); // the engine can't read it either: say why, no steps
    }
    out.start = segs(root, R, null);
    var enc = encInit(), finalV = whole.ok ? whole.value : null, started = {};
    function check(list) {
      if (!enc || !finalV) return true;
      var tk = segTokens(list, enc); if (!tk) return true;
      var e = Eq.evaluate(tk, opts);
      return e.ok && vEq(e.value, finalV);
    }
    if (!check(out.start)) throw { disagree: 'start' };
    each(root, function () {});
    // (a) what the special cubes mean, left to right
    var leaves = []; each(root, function (n) { if (n.type === 'leaf') leaves.push(n); });
    for (var q = 0; q < leaves.length; q++) {
      var lf = leaves[q];
      if (lf.err) {
        if (whole.ok) throw { disagree: 'leaf' };
        if (lf.err.code !== whole.code) { out.steps = []; return stuck(out, whole, ctx, RU, mode, tokens); }
        out.steps.push({ kind: 'error', why: 'This cube can\'t be read.', what: lf.err.msg, text: 'This cube can\'t be read. ' + lf.err.msg, before: segs(root, R, lf), after: null, value: null });
        return stuck(out, whole, ctx, RU, mode, tokens, true);
      }
      if (!lf.read) continue;
      var before = segs(root, R, lf); lf.readDone = true; var after = segs(root, R, null);
      var okA = check(after); if (!okA) throw { disagree: 'read' };
      out.steps.push({ kind: 'read', why: lf.read.why, what: lf.read.what, text: lf.read.why + ' ' + lf.read.what, before: before, after: after, value: lf.v, line: segText(after), check: enc ? segTokens(after, enc) : null });
    }
    // (b) the operations: innermost brackets first, then the strongest step, then left to right
    var ops = []; each(root, function (n) { if (n.type === 'bin' || n.type === 'pre' || n.type === 'post') ops.push(n); });
    var left = ops.length; root.nOps = ops.length + out.steps.length; // (read steps count: after one, the only operation is the "last step")
    while (left > 0) {
      var ready = ops.filter(function (n) { return !n.val && kids(n).every(valued); });
      if (!ready.length) throw { disagree: 'stuck' };
      ready.sort(function (x, y) { return (y.depth - x.depth) || (rankOf(y) - rankOf(x)) || (x.i - y.i); });
      var n = ready[0], r, a, b;
      if (n.type === 'bin') { a = valOf(n.l); b = valOf(n.r); r = Eq.opCore(n.op, a, b, RU.fr); }
      else if (n.type === 'pre') { a = valOf(n.c); b = null; if (n.op === 'r') { b = a; a = { n: 2, d: 1 }; r = Eq.opCore('r', a, b, RU.fr); } else r = Eq.unCore(n.op, a, RU.fr); }
      else { a = valOf(n.c); if (n.op === 'e') { b = { n: n.ex, d: 1 }; r = Eq.opCore('^', a, b, RU.fr); } else r = Eq.unCore(n.op, a, RU.fr); }
      // cross-check with Eq.evaluate on just this piece of the Solution
      var piece = Eq.evaluate(R.slice(n.i, n.j + 1), opts);
      var bef = segs(root, R, n);
      if (typeof r === 'string' || !r) {
        if (piece.ok || whole.ok) throw { disagree: 'op-error' };
        if (piece.code !== whole.code) { out.steps = []; return stuck(out, whole, ctx, RU, mode, tokens); } // the engine stops somewhere else first
        var msg = piece.msg || Eq.MSG[r] || '';
        out.steps.push({ kind: 'error', why: 'Here it gets stuck.', what: msg, text: 'Here it gets stuck. ' + msg, before: bef, after: null, value: null, code: piece.code });
        return stuck(out, whole, ctx, RU, mode, tokens, true);
      }
      if (!piece.ok && !whole.ok) { out.steps = []; return stuck(out, whole, ctx, RU, mode, tokens); } // a reading rule (like glued digits): say it, no steps
      if (!piece.ok || !vEq(piece.value, r)) throw { disagree: 'op' };
      var isLast = left === 1, why = whyOf(n, root, started, isLast);
      n.val = r; left--;
      var aft = segs(root, R, null);
      if (!check(aft)) throw { disagree: 'line' };
      var what = whatOf(n, a, b, r, RU);
      out.steps.push({ kind: 'op', op: n.op, why: why, what: what, text: (why === 'Next:' || !why ? '' : why + ' ') + what, before: bef, after: aft, value: r, line: segText(aft), check: enc ? segTokens(aft, enc) : null });
    }
    var finalMine = valOf(root);
    if (!whole.ok) { out.steps = []; return stuck(out, whole, ctx, RU, mode, tokens); } // e.g. two digits glued where they may not be: the rule, no steps
    if (!vEq(finalMine, whole.value)) throw { disagree: 'final' };
    out.ok = true; out.value = finalMine;
    out.end = endLine(finalMine, ctx, RU, mode, w);
    out.verdict = verdictOf(out, ctx);
    if (out.verdict === 'wrong' && !out.rules.length && ctx.goal) out.fix = nearFix(tokens, ctx, RU, mode, w);
    return out;
  }
  // The engine can't finish this Solution: show where it stopped and why, kindly.
  function stuck(out, whole, ctx, RU, mode, tokens, walked) {
    out.ok = true; out.value = null;
    out.error = { code: whole.code, msg: whole.msg };
    out.end = { text: walked ? 'So this Solution doesn\'t make a number yet.' : whole.msg, ok: false };
    out.verdict = 'wrong';
    if (ctx.goal && !RU.wild) out.fix = nearFix(tokens, ctx, RU, mode, undefined);
    return out;
  }
  function endLine(v, ctx, RU, mode, w) {
    if (!v) return { text: 'It doesn\'t make a number.', ok: false };
    var g = goalAt(ctx, RU, mode, w);
    if (!g) return { text: '= ' + fmt(v) + '.', ok: null };
    var wnote = (RU.wild && typeof w === 'number' && w !== 0) ? ' (with every 0 meaning ' + w + ')' : '';
    if (RU.multk) {
      var dn = Eq.opCore('-', v, g, true), k = RU.k;
      if (vEq(v, g)) return { text: '= ' + fmt(v) + ', exactly the Goal' + wnote + '. With Multiple of ' + k + ' it has to miss the Goal by ' + k + ', ' + 2 * k + ', ' + 3 * k + ' …', ok: false };
      var away = { n: Math.abs(dn.n), d: dn.d }, good = has('multOk') ? Eq.multOk(v, g, k) : (dn.d === 1 && dn.n % k === 0);
      return { text: fmt(v) + ' is ' + fmt(away) + ' ' + (dn.n > 0 ? 'more' : 'less') + ' than the Goal ' + fmt(g) + wnote + ', and ' + fmt(away) + (good ? ' is a multiple of ' + k + ' ✔' : ' is not a multiple of ' + k + '.'), ok: good };
    }
    if (vEq(v, g)) return { text: '= ' + fmt(v) + ', and the Goal is ' + fmt(g) + wnote + ' ✔', ok: true };
    var d = Eq.opCore('-', v, g, true), dd = { n: Math.abs(d.n), d: d.d };
    return { text: '= ' + fmt(v) + ', and the Goal is ' + fmt(g) + wnote + ': that is ' + fmt(dd) + ' ' + (d.n > 0 ? 'more than' : 'less than') + ' the Goal.', ok: false };
  }
  // Rules the Solution broke (from checkSolution), without the "equals …" lines this card already explains.
  function rulesOf(ctx, tokens, mode) {
    var rs = null;
    if (ctx.chk && ctx.chk.reasons) rs = ctx.chk.reasons;
    else if (ctx.reasons) rs = ctx.reasons;
    else if (ctx.check && has('checkSolution')) { try { rs = Eq.checkSolution(tokens, ctx.check).reasons; } catch (e) { rs = null; } }
    var msgs = Eq.MSG ? Object.keys(Eq.MSG).map(function (k) { return Eq.MSG[k]; }) : [];
    return (rs || []).filter(function (r) {
      if (typeof r !== 'string' || !r) return false;
      if (/^Your Solution equals/.test(r)) return false;           // the end line says this, step by step
      if (msgs.indexOf(r) >= 0 && r !== Eq.MSG.empty) return false; // an evaluation message: the steps show it
      if (/^In base \d+ the digits/.test(r)) return false;
      if (/^That needs the .* card/.test(r)) return false;
      return true;
    });
  }
  function verdictOf(out, ctx) {
    if (ctx.chk && typeof ctx.chk.ok === 'boolean') return ctx.chk.ok ? 'right' : 'wrong';
    if (out.rules.length || out.error) return 'wrong';
    if (!out.end || out.end.ok === null) return 'unknown';
    return out.end.ok ? 'right' : 'wrong';
  }
  // A near fix that keeps exactly the same cubes: one pair of brackets added, or one pair taken away.
  function nearFix(tokens, ctx, RU, mode, w) {
    try {
      if (tokens.length > 17) return null;
      var opts = { fractions: mode, wild: w }, best = null;
      var good = function (tk) {
        var e = Eq.evaluate(tk, opts); if (!e.ok) return null;
        var g = goalAt(ctx, RU, mode, w); if (!g) return null;
        var ok = RU.multk ? (has('multOk') && Eq.multOk(e.value, g, RU.k)) : vEq(e.value, g);
        return ok ? e.value : null;
      };
      var n = tokens.length, S = tokens.map(sym);
      // first: take one pair of brackets away
      for (var a = 0; a < n && !best; a++) {
        if (S[a] !== '(') continue;
        for (var b = a, depth = 0; b < n; b++) {
          if (S[b] === '(') depth++; else if (S[b] === ')') depth--;
          if (depth === 0) { var tk2 = tokens.slice(0, a).concat(tokens.slice(a + 1, b), tokens.slice(b + 1)); var v2 = good(tk2); if (v2) best = { tokens: tk2, v: v2, inner: tokens.slice(a + 1, b), add: false }; break; }
        }
      }
      // then: add one pair around a balanced piece that has an operation in it
      var opAt = function (k) { var d = opdef(S[k]); return !!(d && d.kind === 'bin'); };
      for (var i = 0; i < n && !best; i++) {
        if (opAt(i) || S[i] === ')') continue;
        for (var j = i + 2, dep = 0, bad = false; j < n; j++) {
          dep = 0; bad = false;
          for (var q = i; q <= j; q++) { if (S[q] === '(') dep++; else if (S[q] === ')') { dep--; if (dep < 0) { bad = true; break; } } }
          if (bad) break;
          if (dep !== 0 || opAt(j) || S[j] === '(') continue;
          if (i === 0 && j === n - 1) continue;
          if (S[i] === '(' && S[j] === ')' && (function () { for (var z = i + 1, dz = 1; z < j; z++) { if (S[z] === '(') dz++; else if (S[z] === ')') { dz--; if (dz === 0) return false; } } return true; })()) continue; // already one bracket pair
          var tk = tokens.slice(0, i).concat(['('], tokens.slice(i, j + 1), [')'], tokens.slice(j + 1));
          var v = good(tk);
          if (v && (!best || j - i < best.len)) best = { len: j - i, tokens: tk, v: v, inner: tokens.slice(i, j + 1), add: true };
        }
      }
      if (!best) return null;
      var inner = best.inner.map(function (t) { return tokText(sym(t)); }).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
      var whole = best.tokens.map(function (t) { return tokText(sym(t)); }).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
      var text = best.add ? 'So close! With brackets around ' + inner + ', the same cubes make ' + fmt(best.v) + ': ' + whole + '.'
        : 'So close! Without the brackets around ' + inner + ', the same cubes make ' + fmt(best.v) + ': ' + whole + '.';
      if (!RU.multk) text = text.replace(/\.$/, ', the Goal!'); else text = text.replace(/\.$/, ', and that counts for Multiple of ' + RU.k + '!');
      return { text: text, tokens: best.tokens, value: best.v };
    } catch (e) { return null; }
  }

  var api = { steps: steps, FALLBACK: FALLBACK, segText: segText, _enc: function () { return encInit(); }, _why: function () { return LASTWHY; } };

  // ======================= UI (page side) =======================
  if (typeof window === 'undefined' || typeof document === 'undefined') return api;
  var REG = {}, regSeq = 0, REGMAX = 80, XP = null;
  function escH(s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function colourMap(tokens, cubes) {
    var m = {};
    (tokens || []).forEach(function (t, i) {
      var s = sym(t), col = null;
      if (typeof t === 'object' && t && t.id != null && cubes && cubes[t.id] && cubes[t.id].color) col = cubes[t.id].color;
      if (!col && has('isBonusOp') && Eq.isBonusOp(s)) col = 'power';
      if (!col && has('bigIdx') && Eq.bigIdx(s) >= 0) col = 'big';
      m['x' + i] = { color: col || 'none' };
    });
    return m;
  }
  function snap(tokens, ctx) {
    ctx = ctx || {};
    var toks = (tokens || []).map(function (t) { return typeof t === 'string' ? t : { s: t.s, id: t.id }; });
    var c = { goal: ctx.goal ? { n: ctx.goal.n, d: ctx.goal.d } : null, fractions: modeOf(ctx), wild: ctx.wild, who: ctx.who || '', cols: colourMap(tokens, ctx.cubes) };
    if (ctx.chk) c.chk = { ok: ctx.chk.ok, reasons: (ctx.chk.reasons || []).slice(), wildAs: ctx.chk.wildAs };
    else if (ctx.reasons) c.reasons = ctx.reasons.slice();
    else if (ctx.check && has('checkSolution')) { try { var k = Eq.checkSolution(toks, ctx.check); c.chk = { ok: k.ok, reasons: k.reasons.slice(), wildAs: k.wildAs }; } catch (e) {} }
    return { tokens: toks, ctx: c };
  }
  function buttonHTML(tokens, ctx, label) {
    if (!tokens || !tokens.length) return '';
    var id = 'e' + (++regSeq); REG[id] = snap(tokens, ctx);
    var old = 'e' + (regSeq - REGMAX); if (REG[old]) delete REG[old];
    return '<button class="btn small xp-btn" data-act="explainOpen" data-arg="' + id + '" title="Show this Solution step by step">🔎 ' + escH(label || 'Explain it') + '</button>';
  }
  // ---- drawing ----
  function valHTML(v) {
    if (v.d === 1) return escH(fmt(v));
    var neg = v.n < 0, n = Math.abs(v.n), w = Math.floor(n / v.d), r = n % v.d;
    return (neg ? '−' : '') + (w ? w : '') + '<span class="xp-frac"><span>' + r + '</span><span>' + v.d + '</span></span>';
  }
  function tokHTML(tok, i, cols, mode) {
    var s = sym(tok);
    if (s === '(' || s === ')') return '<span class="paren">' + s + '</span>';
    if (s === '!') return '<span class="vari-bang">!</span>';
    var t1 = { s: s, id: 'x' + i };
    if (window.Vari && Vari.exprHTML) return Vari.exprHTML([t1], cols, mode);
    if (typeof tokensHTML === 'function') return tokensHTML([t1], cols);
    return '<span class="cube mini c-none"><span>' + escH(tokText(s)) + '</span></span>';
  }
  function exprHTML(list, cols, mode) {
    var html = '', inF = false;
    list.forEach(function (g) {
      if (g.f && !inF) { html += '<span class="xp-focus">'; inF = true; }
      if (!g.f && inF) { html += '</span>'; inF = false; }
      html += g.v ? '<span class="xp-val' + (g.f ? '' : '') + '">' + valHTML(g.v) + '</span>' : tokHTML(g.tok, g.idx, cols, mode);
    });
    if (inF) html += '</span>';
    return html;
  }
  function solutionHTML(entry) {
    var c = entry.ctx, mode = c.fractions;
    var R = entry.tokens; try { if (has('resolve')) R = Eq.resolve(entry.tokens, mode); } catch (e) { R = entry.tokens; }
    var list = R.map(function (t, i) { return { tok: t, idx: i }; });
    return '<div class="expr vari-expr xp-sol">' + exprHTML(list, c.cols, mode) + '</div>';
  }
  function speakText(s) { return s.replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/−/g, ' minus ').replace(/√/g, ' root ').replace(/✔/g, '').replace(/\s+/g, ' '); }
  function say(s) { try { if (typeof S !== 'undefined' && S && S.set && S.set.voice === true && typeof Snd !== 'undefined' && Snd.speak) Snd.speak(speakText(s), 'pip'); } catch (e) {} }
  function endHTML(res) {
    var e = res.end || { text: '', ok: null }, cls = e.ok === true ? 'ok' : e.ok === false ? 'no' : '';
    var h = '<div class="xp-end ' + cls + '">' + escH(e.text) + '</div>';
    if (res.rules.length) h += '<div class="xp-rules"><b>' + (e.ok ? 'The number is right! One more thing to fix:' : 'One more thing to fix:') + '</b><ul class="reasons">' + res.rules.map(function (r) { return '<li>' + escH(r) + '</li>'; }).join('') + '</ul></div>';
    if (res.fix) h += '<div class="xp-fix">💡 ' + escH(res.fix.text) + '</div>';
    return h;
  }
  function render() {
    if (!XP) return;
    var ov = document.getElementById('explainOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'explainOv'; ov.className = 'xp-back'; document.body.appendChild(ov); ov.addEventListener('click', function (ev) { if (ev.target === ov) close(); }); }
    var res = XP.res, c = XP.entry.ctx, mode = c.fractions, nSteps = res.steps.length, page = XP.page, body = '';
    var head = '<div class="xp-head"><h2>🔎 Step by step</h2><button class="btn small xp-x" data-act="xpClose" aria-label="Close">✕</button></div>' +
      (c.who ? '<div class="xp-who">' + escH(c.who) + '</div>' : '') + solutionHTML(XP.entry) +
      (c.goal ? '<div class="xp-goal">🎯 Goal: <b>' + valHTML(c.goal) + '</b>' + (Eq.rulesOf(mode).basem ? ' <small>(counted in tens)</small>' : '') + '</div>' : '');
    if (res.fallback) {
      body = '<div class="xp-page"><p class="xp-why">' + escH(FALLBACK) + '</p>' + endHTML(res) + '</div>';
    } else if (XP.all) {
      body = '<ol class="xp-list">' + res.steps.map(function (st) {
        return '<li><span class="xp-line">' + escH(segText(st.before)) + '</span><span class="xp-ltext">' + escH(st.text) + '</span>' + (st.after ? '<span class="xp-line to">→ ' + escH(segText(st.after)) + '</span>' : '') + '</li>';
      }).join('') + '</ol>' + endHTML(res);
    } else if (page < nSteps) {
      var st = res.steps[page];
      body = '<div class="xp-page" data-p="' + page + '"><div class="xp-count">Step ' + (page + 1) + ' of ' + nSteps + '</div>' +
        '<div class="expr vari-expr xp-run">' + exprHTML(st.before, c.cols, mode) + '</div>' +
        '<p class="xp-why">' + (st.why && st.why !== 'Next:' ? '<b>' + escH(st.why) + '</b> ' : '') + escH(st.what) + '</p>' +
        (st.after ? '<div class="xp-arrow" aria-hidden="true">↓</div><div class="expr vari-expr xp-run">' + exprHTML(st.after, c.cols, mode) + '</div>' : '') + '</div>';
    } else {
      body = '<div class="xp-page" data-p="end">' + (nSteps ? '<div class="xp-count">The answer</div>' : '') +
        (res.value && nSteps ? '<div class="expr xp-run"><span class="xp-val big">' + valHTML(res.value) + '</span></div>' : (res.error && !nSteps ? '<p class="xp-why">' + escH(res.error.msg) + '</p>' : '')) + endHTML(res) + '</div>';
    }
    var last = res.fallback || XP.all || page >= nSteps;
    var nav = '<div class="row xp-nav">' +
      (!res.fallback && !XP.all && page > 0 ? '<button class="btn small" data-act="xpBack">◀ Back</button>' : '') +
      (!last ? '<button class="btn small green" data-act="xpNext">' + (page === nSteps - 1 ? 'See the answer' : 'Next') + ' ▶</button>' : '<button class="btn small green" data-act="xpClose">Got it</button>') +
      (!res.fallback && nSteps > 1 ? '<button class="btn small" data-act="xpAll">' + (XP.all ? 'One step at a time' : 'Show all steps') + '</button>' : '') + '</div>';
    ov.innerHTML = '<div class="xp-card" role="dialog" aria-modal="true" aria-label="Step by step">' + head + '<div class="xp-body">' + body + '</div>' + nav + '</div>';
    ov.classList.add('on');
    var b = ov.querySelector('.xp-body'); if (b) b.scrollTop = 0;
    if (XP.all) say('Here are all the steps.');
    else if (!res.fallback && page < nSteps) say(res.steps[page].text);
    else say(res.fallback ? FALLBACK : (res.end ? res.end.text : ''));
  }
  function onKey(e) {
    if (!XP) return;
    if (e.key === 'Escape') { close(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
  }
  function go(d) {
    if (!XP || XP.all || XP.res.fallback) return;
    var p = XP.page + d; if (p < 0 || p > XP.res.steps.length) return;
    XP.page = p; if (typeof Snd !== 'undefined' && Snd.click) Snd.click(); render();
  }
  function openEntry(entry) {
    XP = { entry: entry, res: steps(entry.tokens, entry.ctx), page: 0, all: false };
    document.removeEventListener('keydown', onKey); document.addEventListener('keydown', onKey);
    if (typeof Snd !== 'undefined' && Snd.pop) Snd.pop();
    render();
  }
  function open(tokens, ctx) { openEntry(snap(tokens, ctx)); }
  function close() {
    XP = null; document.removeEventListener('keydown', onKey);
    var ov = document.getElementById('explainOv'); if (ov) { ov.classList.remove('on'); ov.innerHTML = ''; }
    try { if (typeof S !== 'undefined' && S && S.set && S.set.voice === true && Snd.stopSpeak) Snd.stopSpeak(); } catch (e) {}
  }
  function hook() {
    if (typeof ACT === 'undefined') return false;
    ACT.explainOpen = function (el) { var e = REG[el.dataset.arg]; if (e) openEntry(e); };
    ACT.xpNext = function () { go(1); };
    ACT.xpBack = function () { go(-1); };
    ACT.xpAll = function () { if (!XP) return; XP.all = !XP.all; if (typeof Snd !== 'undefined' && Snd.click) Snd.click(); render(); };
    ACT.xpClose = function () { close(); };
    return true;
  }
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
  api.buttonHTML = buttonHTML; api.open = open; api.close = close; api.isOpen = function () { return !!XP; };
  return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Explain;
