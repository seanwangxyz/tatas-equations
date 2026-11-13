'use strict';
// ======================= ON-SETS ENGINE (pure, no page) =======================
// The math of ON-SETS: The Game of Set Theory, as read from the AGLOA On-Sets Tournament Rules
// 2026-27 (see ONSETS_RULES_SUMMARY.md for page references and every interpretation).
// Loads in three places: the page (global OSE), the On-Sets Web Worker (js/onsets/ai-worker.js),
// and node (tests/onsets.test.js: module.exports).
//
// Shapes used below:
//   card      = a 4-bit number: B=1, R=2, G=4, Y=8 (0 is the blank card). There are 16 cards.
//   universe  = an array of distinct cards (the cards dealt face up, 6 to 12 in Elementary).
//   set       = a bitmask over the universe's POSITIONS (bit i on = universe[i] is in the set).
//   token     = a symbol string, or {s, id} pointing at a real cube.
//   symbols   = 'B' 'R' 'G' 'Y' (colour cubes), 'V' (universe), 'N' (null set, shown Λ),
//               'U' (union ∪), 'I' (intersection ∩), '-' (minus −), "'" (complement ′),
//               '=' and 'S' (subset ⊆) for Restrictions, digits '1'..'5' (Goal only), '(' ')'.
var OSE = (function () {
  var COLORS = ['B', 'R', 'G', 'Y'];
  var BIT = { B: 1, R: 2, G: 4, Y: 8 };
  var COLOR_NAME = { B: 'blue', R: 'red', G: 'green', Y: 'yellow' };
  var SHOW = { B: 'B', R: 'R', G: 'G', Y: 'Y', V: 'V', N: 'Λ', U: '∪', I: '∩', '-': '−', "'": '′', '=': '=', S: '⊆', '(': '(', ')': ')' };
  var WORD = { U: 'union (∪)', I: 'intersection (∩)', '-': 'minus (−)', "'": 'not (′)', V: 'V (every card)', N: 'Λ (no cards)', '=': '=', S: '⊆' };
  // Faces of each kind of cube (rules I-B-2, page O3, and the Glossary "Digit cube", page OG2).
  // Digit cubes: "the digit 1 on two of its faces and the digits 2, 3, 4, and 5 on the other four faces".
  // The other cubes: the rules name the four symbols on each kind but not which two are repeated, so the
  // game rolls each of the four symbols with an equal chance (INTERPRETATION, see the rules summary).
  var FACES = { digit: ['1', '1', '2', '3', '4', '5'], color: ['B', 'R', 'G', 'Y'], op: ['U', 'I', '-', "'"], restr: ['V', 'N', '=', 'S'] };
  var COUNTS = { digit: 3, color: 8, op: 4, restr: 3 };

  function isColor(s) { return s === 'B' || s === 'R' || s === 'G' || s === 'Y'; }
  function isSetSym(s) { return isColor(s) || s === 'V' || s === 'N'; }
  function isBinOp(s) { return s === 'U' || s === 'I' || s === '-'; }
  function isOp(s) { return isBinOp(s) || s === "'"; }
  function isDigit(s) { return typeof s === 'string' && /^[0-9]$/.test(s); }
  function isRel(s) { return s === '=' || s === 'S'; }
  function symOf(t) { return typeof t === 'string' ? t : t && t.s; }
  function isCubeTok(t) { var s = symOf(t); return s !== '(' && s !== ')'; }
  function show(s) { return SHOW[s] || s; }
  function popcount(m) { var c = 0; while (m) { m &= m - 1; c++; } return c; }

  // ---- Random numbers (seedable, for drills and tests) ----
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(a, rand) { rand = rand || Math.random; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ---- Cards ----
  function cardHas(card, c) { return (card & BIT[c]) !== 0; }
  function cardColors(card) { return COLORS.filter(function (c) { return cardHas(card, c); }); }
  function cardName(card) { var c = cardColors(card); return c.length ? c.join('') : 'blank'; }
  // Deal n distinct cards from a shuffled deck of all 16 (rules II-B: 6 to 12 cards in Elementary).
  function deal(n, rand) { var deck = []; for (var i = 0; i < 16; i++) deck.push(i); return shuffle(deck, rand).slice(0, n); }
  function fullSet(universe) { return universe.length >= 31 ? -1 : (1 << universe.length) - 1; }
  function leafSet(s, universe) {
    if (s === 'V') return fullSet(universe);
    if (s === 'N') return 0;
    var m = 0; for (var i = 0; i < universe.length; i++) if (universe[i] & BIT[s]) m |= (1 << i);
    return m;
  }
  function apply(op, a, b, full) {
    if (op === 'U') return a | b;
    if (op === 'I') return a & b;
    if (op === '-') return a & ~b & full;
    if (op === "'") return full & ~a;
    throw new Error('bad op ' + op);
  }
  function setCards(m, universe) { var out = []; for (var i = 0; i < universe.length; i++) if (m & (1 << i)) out.push(universe[i]); return out; }

  // ---- Rolling the cubes ----
  // Elementary (rules II-A-3, page O4): the three Restriction cubes are NOT rolled; the Goal-setter sets out
  // two V and one Λ, or one V and two Λ (vn = 'VVN' or 'VNN'). The other 15 cubes are rolled.
  // Returns [{id, kind, s}] with ids 0-2 digit, 3-10 colour, 11-14 operation, 15-17 Restriction cubes.
  function roll(rand, opts) {
    rand = rand || Math.random; opts = opts || {};
    var out = [], id = 0, elem = opts.division ? opts.division === 'E' : true, vn = opts.vn === 'VNN' ? 'VNN' : 'VVN';
    ['digit', 'color', 'op', 'restr'].forEach(function (k) {
      for (var i = 0; i < COUNTS[k]; i++) {
        var s;
        if (k === 'restr' && elem) s = vn.charAt(i);
        else s = FACES[k][Math.floor(rand() * FACES[k].length)];
        out.push({ id: id++, kind: k, s: s });
      }
    });
    return out;
  }
  function kindOf(s) { return isDigit(s) ? 'digit' : isColor(s) ? 'color' : isOp(s) ? 'op' : 'restr'; }

  // ---- Goals (rules III-B, page O5) ----
  // The only legal configurations. 'h' = side by side (add), 'v' = stacked (multiply).
  var SHAPES = [
    { id: 'A', n: 1, label: 'A', f: function (a) { return a; } },
    { id: 'A+B', n: 2, label: 'A + B', f: function (a, b) { return a + b; } },
    { id: 'A+B+C', n: 3, label: 'A + B + C', f: function (a, b, c) { return a + b + c; } },
    { id: 'AxB', n: 2, label: 'A × B', f: function (a, b) { return a * b; } },
    { id: 'AxBxC', n: 3, label: 'A × B × C', f: function (a, b, c) { return a * b * c; } },
    { id: 'Ax(B+C)', n: 3, label: 'A × (B + C)', f: function (a, b, c) { return a * (b + c); } },
    { id: 'AxB+C', n: 3, label: '(A × B) + C', f: function (a, b, c) { return a * b + c; } }
  ];
  var SHAPE = {}; SHAPES.forEach(function (sh) { SHAPE[sh.id] = sh; });
  // goal = { shape: 'A+B', digits: [{s:'3', neg:false, id?}, ...] }  -> {ok, value, reasons}
  function goalValue(goal) {
    var sh = goal && SHAPE[goal.shape], d = (goal && goal.digits) || [];
    if (!sh) return { ok: false, reasons: ['Pick one of the Goal shapes.'] };
    if (d.length !== sh.n) return { ok: false, reasons: ['This shape needs ' + sh.n + ' digit cube' + (sh.n > 1 ? 's' : '') + '.'] };
    var vals = [];
    for (var i = 0; i < d.length; i++) {
      var s = symOf(d[i]);
      if (!isDigit(s)) return { ok: false, reasons: ['Only digit cubes go in the Goal.'] };
      vals.push((d[i].neg ? -1 : 1) * (+s));
    }
    return { ok: true, value: sh.f.apply(null, vals) };
  }
  // Every Goal that a set of digit cubes can make: [{shape, digits:[{s,neg,i}], value}] (i = index in `digits`).
  function goalIdeas(digits, opts) {
    opts = opts || {};
    var out = [], seen = {}, n = digits.length, allowNeg = opts.neg !== false;
    function perms(k) {
      var res = [];
      (function rec(cur, used) {
        if (cur.length === k) { res.push(cur.slice()); return; }
        for (var i = 0; i < n; i++) if (!used[i]) { used[i] = 1; cur.push(i); rec(cur, used); cur.pop(); used[i] = 0; }
      })([], {});
      return res;
    }
    SHAPES.forEach(function (sh) {
      if (sh.n > n) return;
      perms(sh.n).forEach(function (p) {
        for (var negMask = 0; negMask < (allowNeg ? (1 << sh.n) : 1); negMask++) {
          var ds = p.map(function (i, j) { return { s: digits[i], neg: !!(negMask & (1 << j)), i: i }; });
          var key = sh.id + ':' + ds.map(function (x) { return (x.neg ? '-' : '') + x.s; }).join(',');
          if (seen[key]) continue; seen[key] = 1;
          var v = goalValue({ shape: sh.id, digits: ds });
          if (v.ok) out.push({ shape: sh.id, digits: ds, value: v.value });
        }
      });
    });
    return out;
  }
  function goalText(goal) {
    var sh = SHAPE[goal.shape]; if (!sh) return '?';
    var d = goal.digits.map(function (x) { var s = symOf(x); return x.neg ? '(−' + s + ')' : s; });
    return sh.label.replace('A', d[0]).replace('B', d[1]).replace('C', d[2]);
  }

  // ---- Parsing a Set-Name, with every legal reading ----
  // Rules VI-A and VII-B-6 (pages O8, O10-O12): the only order of operations is that ′ comes before the
  // binary operations ∪ ∩ −. Without parentheses, a chain like B ∪ G − R can be grouped either way, and the
  // Solution is wrong if ANY legal grouping does not equal the Goal. So we keep ALL the readings.
  // Returns {ok, alts: Map(set -> example text), code, msg}  (code: 'empty' 'paren' 'prime' 'adjacent'
  // 'missing' 'digit' 'rel' 'bad').
  function err(code, msg) { return { ok: false, code: code, msg: msg }; }
  function interpret(tokens, universe) {
    var syms = tokens.map(symOf), full = fullSet(universe), pos = 0;
    if (!syms.length) return err('empty', 'Tap some cubes to build a set.');
    for (var k = 0; k < syms.length; k++) {
      if (isDigit(syms[k])) return err('digit', 'Digit cubes are only for the Goal, not for a Set Name.');
      if (isRel(syms[k])) return err('rel', '= and ⊆ make Restrictions; they can\'t go in a Set Name.');
      if (!isSetSym(syms[k]) && !isOp(syms[k]) && syms[k] !== '(' && syms[k] !== ')') return err('bad', 'That symbol has no meaning here.');
    }
    function parseSeq() {
      var terms = [], ops = [];
      var t = parseTerm(); if (!t.ok) return t; terms.push(t);
      while (pos < syms.length && isBinOp(syms[pos])) {
        var op = syms[pos]; pos++;
        if (pos >= syms.length || syms[pos] === ')') return err('missing', 'Something is missing after the ' + show(op) + '. Put a set there, like R or B.');
        var t2 = parseTerm(); if (!t2.ok) return t2;
        ops.push(op); terms.push(t2);
      }
      // all groupings of the chain (interval DP); each interval keeps every set it can be and one example text
      var n = terms.length, A = [];
      for (var i = 0; i < n; i++) { A[i] = []; A[i][i] = terms[i].alts; }
      for (var len = 2; len <= n; len++) {
        for (var a = 0; a + len - 1 < n; a++) {
          var b = a + len - 1, m = new Map();
          for (var c = a; c < b; c++) {
            var L = A[a][c], R = A[c + 1][b], op2 = ops[c];
            L.forEach(function (lt, lm) { R.forEach(function (rt, rm) {
              var v = apply(op2, lm, rm, full);
              if (!m.has(v)) m.set(v, wrap(lt, c > a) + ' ' + show(op2) + ' ' + wrap(rt, b > c + 1));
            }); });
          }
          A[a][b] = m;
        }
      }
      return { ok: true, alts: A[0][n - 1], chain: n };
    }
    function wrap(txt, isChain) { return isChain ? '(' + txt + ')' : txt; }
    function parseTerm() {
      if (pos >= syms.length) return err('missing', 'Something is missing at the end. Finish it with a set, like R.');
      var s = syms[pos], alts;
      if (s === "'") return err('prime', 'A ′ (not) goes right AFTER a set, like G′ or (R ∪ B)′.');
      if (isBinOp(s)) return err('missing', 'A ' + show(s) + ' needs a set on each side, like R ' + show(s) + ' B.');
      if (s === ')') return err('paren', 'There is a ) without a ( before it.');
      if (s === '(') {
        pos++;
        if (pos < syms.length && syms[pos] === ')') return err('paren', 'There is nothing inside the ( ).');
        var inner = parseSeq(); if (!inner.ok) return inner;
        if (pos >= syms.length || syms[pos] !== ')') return err('paren', 'Every ( needs a ) to close it.');
        pos++;
        alts = new Map(); inner.alts.forEach(function (txt, m) { alts.set(m, inner.chain > 1 ? '(' + txt + ')' : txt); });
      } else if (isSetSym(s)) {
        pos++; alts = new Map([[leafSet(s, universe), show(s)]]);
      } else return err('bad', 'That symbol has no meaning here.');
      while (pos < syms.length && syms[pos] === "'") {
        pos++;
        var nx = new Map(); alts.forEach(function (txt, m) { nx.set(apply("'", m, 0, full), txt + '′'); }); alts = nx;
      }
      if (pos < syms.length && (isSetSym(syms[pos]) || syms[pos] === '(')) return err('adjacent', 'Two sets need an operation between them, like R ∪ B.');
      return { ok: true, alts: alts };
    }
    var r = parseSeq();
    if (!r.ok) return r;
    if (pos < syms.length) return syms[pos] === ')' ? err('paren', 'There is a ) without a ( before it.') : err('bad', 'Something after the end doesn\'t fit.');
    return { ok: true, alts: r.alts };
  }
  // Every count a Set-Name can have: {ok, sets:[...], counts:[...distinct], count (if only one), ambiguous, examples}
  function evaluate(tokens, universe) {
    var r = interpret(tokens, universe);
    if (!r.ok) return r;
    var sets = [], counts = [], ex = {};
    r.alts.forEach(function (txt, m) { sets.push(m); var c = popcount(m); if (counts.indexOf(c) < 0) { counts.push(c); ex[c] = txt; } });
    return { ok: true, sets: sets, set: sets.length === 1 ? sets[0] : null, counts: counts, count: counts.length === 1 ? counts[0] : null, ambiguous: sets.length > 1, examples: ex };
  }
  function exprText(tokens) {
    var out = '';
    tokens.map(symOf).forEach(function (s, i, a) {
      if (isBinOp(s) || isRel(s)) out += ' ' + show(s) + ' ';
      else out += show(s);
    });
    return out.replace(/\s+/g, ' ').trim();
  }

  // ---- How a set forms, step by step (for the 3D "watch the set form" replay; the math is the same as evaluate) ----
  // Returns [{set, count, text}] in the order a person would work it out: each colour (or V/Λ) on its own, then each
  // ′ and each operation as it joins in, ending with the whole Set-Name. A leaf straight under a ′ is skipped (G′ is
  // shown at once). Chains without ( ) are read left to right; that is only done when every legal reading names the
  // same set (otherwise null: the replay then shows the final count only). Long names keep the first set and the
  // operations only (at most `max` steps, default 7). null when the tokens are not a legal Set-Name.
  function formSteps(tokens, universe, max) {
    var ev = evaluate(tokens, universe);
    if (!ev.ok || ev.sets.length !== 1) return null;
    var syms = tokens.map(symOf), pos = 0, full = fullSet(universe);
    function seq() {
      var node = term();
      while (pos < syms.length && isBinOp(syms[pos])) { var op = syms[pos++]; node = { op: op, a: node, b: term() }; }
      return node;
    }
    function term() {
      var node;
      if (syms[pos] === '(') { pos++; node = seq(); pos++; node = { paren: true, a: node }; }
      else node = { leaf: syms[pos++] };
      while (syms[pos] === "'") { pos++; node = { op: "'", a: node }; }
      return node;
    }
    var root = seq(), out = [];
    function strip(n) { while (n.paren) n = n.a; return n; }
    function text(n) {
      if (n.paren) { var inner = strip(n); return inner.op && inner.op !== "'" ? '(' + text(inner) + ')' : text(inner); }
      if (n.leaf) return show(n.leaf);
      if (n.op === "'") { var a = strip(n.a); return (a.op && a.op !== "'" ? '(' + text(a) + ')' : text(n.a)) + '′'; }
      return text(n.a) + ' ' + show(n.op) + ' ' + text(n.b);
    }
    function val(n) {
      if (n.paren) return val(n.a);
      if (n.leaf) return leafSet(n.leaf, universe);
      if (n.op === "'") return apply("'", val(n.a), 0, full);
      return apply(n.op, val(n.a), val(n.b), full);
    }
    function walk(n, underNot) {
      if (n.paren) { walk(n.a, underNot); return; }
      if (n.leaf) { if (!underNot) out.push({ node: n, leaf: true }); return; }
      if (n.op === "'") { walk(n.a, true); out.push({ node: n }); return; }
      walk(n.a, false); walk(n.b, false); out.push({ node: n });
    }
    walk(root, false);
    var steps = out.map(function (o, i) { var m = val(o.node); return { set: m, count: popcount(m), text: text(o.node), leaf: !!o.leaf }; });
    max = max || 7;
    if (steps.length > max) steps = steps.filter(function (s, i) { return i === 0 || !s.leaf; });
    if (steps.length > max) steps = steps.slice(steps.length - max);
    if (steps[steps.length - 1].set !== ev.sets[0]) return null; // (never: the same math)
    return steps;
  }

  // ---- Restrictions (rules VI-B, pages O8-O9; NOT used in Elementary, kept here for later divisions) ----
  // A Restriction is Set1 = Set2, Set1 ⊆ Set2, or a chain (A ⊆ B = C ...: each neighbouring pair).
  // A card that breaks it is set aside while that Solution is checked. No ( ) may enclose = or ⊆.
  // A side with more than one reading is ambiguous: we report it (code 'ambiguous') rather than guess.
  function parseRestriction(tokens, universe) {
    var syms = tokens.map(symOf), parts = [[]], rels = [];
    if (syms.length && syms[0] === '(' && syms[syms.length - 1] === ')') {
      // parentheses around the whole Restriction are allowed (useless but not wrong) if they match each other
      var depth = 0, wraps = true;
      for (var k = 0; k < syms.length - 1; k++) { if (syms[k] === '(') depth++; else if (syms[k] === ')') depth--; if (depth === 0) { wraps = false; break; } }
      if (wraps) { syms = syms.slice(1, -1); tokens = tokens.slice(1, -1); }
    }
    var d = 0;
    for (var i = 0; i < syms.length; i++) {
      if (syms[i] === '(') d++; else if (syms[i] === ')') d--;
      if (isRel(syms[i])) {
        if (d !== 0) return err('paren', 'No ( ) may go around a = or ⊆ in a Restriction.');
        rels.push(syms[i]); parts.push([]);
      } else parts[parts.length - 1].push(tokens[i]);
    }
    if (!rels.length) return err('rel', 'A Restriction needs a = or ⊆.');
    var sides = [];
    for (var p = 0; p < parts.length; p++) {
      var ev = evaluate(parts[p], universe);
      if (!ev.ok) return ev;
      if (ev.ambiguous) return { ok: false, code: 'ambiguous', msg: 'One side of the Restriction can be read more than one way.', sets: ev.sets };
      sides.push(ev.set);
    }
    return { ok: true, rels: rels, sides: sides };
  }
  // Apply Restrictions to the universe. Returns {ok, universe (the cards that stay), removed (cards set aside)}.
  function applyRestrictions(universe, restrictions) {
    var keep = fullSet(universe);
    for (var r = 0; r < restrictions.length; r++) {
      var pr = parseRestriction(restrictions[r], universe);
      if (!pr.ok) return pr;
      for (var j = 0; j < pr.rels.length; j++) {
        var a = pr.sides[j], b = pr.sides[j + 1];
        var bad = pr.rels[j] === 'S' ? (a & ~b) : (a ^ b);
        keep &= ~bad;
      }
    }
    var out = [], removed = [];
    for (var i = 0; i < universe.length; i++) (keep & (1 << i) ? out : removed).push(universe[i]);
    return { ok: true, universe: out, removed: removed };
  }

  // ---- Checking a Solution (rules III, VI, VII-B; pages O2, O8-O12) ----
  // ctx = { universe, goal (a number, or {shape,digits}), mode: 'now'|'impossible'|'last'|'free',
  //         zone(id) -> 'required'|'permitted'|'resources'|'forbidden'|'goal', required: [ids],
  //         restrictions: [[tokens]...] (optional, not in Elementary), division: 'E' (default) }
  // Returns {ok, reasons: [kind sentences], cubes, resUsed, count, counts, ambiguous, sets}
  function checkSolution(tokens, ctx) {
    ctx = ctx || {};
    var reasons = [], out = { ok: false, reasons: reasons, cubes: 0, resUsed: 0 };
    var goal = ctx.goal, gv;
    if (goal && typeof goal === 'object') { var g = goalValue(goal); if (!g.ok) { reasons.push('The Goal isn\'t a legal Goal, so no Solution can match it.'); return out; } gv = g.value; }
    else gv = goal;
    var restr = ctx.restrictions || [], elem = (ctx.division || 'E') === 'E';
    if (!tokens || !tokens.length) { reasons.push('No Solution was written.'); return out; }
    // which cubes are used, and where they came from
    var setIds = {}, restrIds = {}, twice = false, digit = false, rel = false;
    tokens.forEach(function (t) { if (!isCubeTok(t)) return; out.cubes++; var s = symOf(t); if (isDigit(s)) digit = true; if (isRel(s)) rel = true; if (typeof t === 'object' && t.id != null && t.id >= 0) { if (setIds[t.id]) twice = true; setIds[t.id] = 1; } });
    restr.forEach(function (line) { line.forEach(function (t) { if (!isCubeTok(t)) return; if (typeof t === 'object' && t.id != null && t.id >= 0) { if (restrIds[t.id] === line) twice = true; restrIds[t.id] = line; } }); });
    // cubes in the whole Solution: a cube used in a Restriction AND in the Set-Name is still one cube (R VII-B-4-a example)
    var anon = 0, ids = {};
    tokens.forEach(function (t) { if (!isCubeTok(t)) return; if (typeof t === 'object' && t.id != null && t.id >= 0) ids[t.id] = 1; else anon++; });
    restr.forEach(function (line) { line.forEach(function (t) { if (!isCubeTok(t)) return; if (typeof t === 'object' && t.id != null && t.id >= 0) ids[t.id] = 1; else anon++; }); });
    var totalCubes = anon + Object.keys(ids).length; out.cubes = totalCubes;
    // the Set-Name itself
    var uni = ctx.universe || [];
    if (restr.length) {
      if (elem) { reasons.push('Restrictions (with = or ⊆) are not used in the Elementary game.'); return out; }
      var ar = applyRestrictions(uni, restr);
      if (!ar.ok) { reasons.push('Restriction: ' + ar.msg); return out; }
      uni = ar.universe; out.restricted = ar.universe; out.removed = ar.removed;
    }
    var ev = evaluate(tokens, uni);
    if (!ev.ok) {
      if (digit) reasons.push('Digit cubes are only for the Goal, not for a Solution.');
      else if (rel) reasons.push('= and ⊆ can\'t go in the Set Name. (In Elementary they aren\'t used at all.)');
      else reasons.push(ev.msg);
      return out;
    }
    out.sets = ev.sets; out.counts = ev.counts; out.count = ev.count; out.ambiguous = ev.ambiguous; out.examples = ev.examples;
    // cube rules (VII-B-4)
    var zone = ctx.zone || function () { return 'permitted'; };
    if (totalCubes < 2) reasons.push('A Solution needs at least 2 cubes. Try adding an operation and another set.');
    if (twice) reasons.push('Each cube can be used only once.');
    var allIds = {}; Object.keys(setIds).forEach(function (k) { allIds[k] = 1; }); Object.keys(restrIds).forEach(function (k) { allIds[k] = 1; });
    var forb = [], resIds = [], badZone = false;
    Object.keys(allIds).forEach(function (k) {
      var z = zone(+k);
      if (z === 'forbidden') forb.push(+k);
      else if (z === 'resources') resIds.push(+k);
      else if (z !== 'required' && z !== 'permitted') badZone = true;
    });
    out.resUsed = resIds.length;
    if (forb.length) reasons.push('You used a cube from Forbidden. Forbidden cubes can\'t be used.');
    if (badZone) reasons.push('One of those cubes isn\'t on the mat.');
    if (resIds.length) {
      if (ctx.mode === 'now' && resIds.length > 1) reasons.push('After Now! you may add only ONE cube from Resources. You used ' + resIds.length + '.');
      else if (ctx.mode === 'last' || ctx.mode === undefined) reasons.push('Resource cubes can\'t be used here.');
    }
    var miss = (ctx.required || []).filter(function (id) { return !setIds[id] && !(isRel(ctx.symOf ? ctx.symOf(id) : '') && restrIds[id]); });
    // Required cubes (except = and ⊆) must be in the Set-Name; with a Restriction part they must be there too (VII-B-4-b)
    if (miss.length) reasons.push('You still need ' + (miss.length === 1 ? 'the Required cube' : 'all ' + miss.length + ' Required cubes') + (ctx.label ? ': ' + miss.map(ctx.label).join(' ') : '') + '. Required cubes must ALL be used.');
    if (restr.length && ctx.required) {
      var missR = ctx.required.filter(function (id) { return !restrIds[id]; });
      if (missR.length) reasons.push('With a Restriction, every Required cube must be in the Restriction too.');
    }
    // the count (VII-B-3 and VII-B-6: every legal reading must equal the Goal)
    if (gv == null || gv < 0) reasons.push('The Goal is below zero, so no set of cards can match it.');
    else if (!ev.ambiguous || ev.counts.length === 1) {
      var c = ev.counts[0];
      if (c !== gv) reasons.push('Your set has ' + c + ' card' + (c === 1 ? '' : 's') + ', but the Goal is ' + gv + '.');
    } else {
      var right = ev.counts.indexOf(gv) >= 0, wrong = ev.counts.filter(function (x) { return x !== gv; })[0];
      if (right) reasons.push('This can be read two ways: ' + ev.examples[gv] + ' has ' + gv + ' card' + (gv === 1 ? '' : 's') + ', but ' + ev.examples[wrong] + ' has ' + wrong + '. Add ( ) so it can only be read one way.');
      else reasons.push('Your set has ' + ev.counts.join(' or ') + ' cards (it can be read more than one way), but the Goal is ' + gv + '.');
    }
    out.ok = reasons.length === 0;
    return out;
  }

  // ---- Solver ----
  // Can a Set-Name with exactly `goal` cards be made from these cubes?
  // opts = { universe, goal, req: [syms], perm: [syms], res: [syms], mode: 'now'|'impossible'|'last'|'free',
  //          maxCubes (default all), timeMs (default 400), minCubes (default 2) }
  // mode 'now': all of req, any of perm, at most ONE of res. 'impossible': res count as Permitted.
  // 'last' / 'free': req + perm only (free: perm is simply the pool).
  // Returns {found, tokens, cubes, complete}. complete=false means the search stopped early (time or
  // maxCubes), so a 'not found' then proves NOTHING. complete=true with found=false is a proof.
  var LEAF = ['B', 'R', 'G', 'Y', 'V', 'N'], OPS = ['U', 'I', '-', "'"], ALL = LEAF.concat(OPS), NS = ALL.length;
  var IDX = {}; ALL.forEach(function (s, i) { IDX[s] = i; });
  var BASE = 19, POW = []; for (var pi = 0, pw = 1; pi < NS; pi++, pw *= BASE) POW.push(pw);
  function countVec(list) { var v = new Array(NS).fill(0); (list || []).forEach(function (s) { if (IDX[s] !== undefined) v[IDX[s]]++; }); return v; }
  function keyOf(v) { var k = 0; for (var i = 0; i < NS; i++) k += v[i] * POW[i]; return k; }
  function clock() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function treeTokens(t, out, top) {
    out = out || [];
    if (t.t === 'leaf') out.push(t.s);
    else if (t.t === 'not') {
      var needP = t.a.t === 'bin';
      if (needP) out.push('('); treeTokens(t.a, out, true); if (needP) out.push(')'); out.push("'");
    } else {
      if (!top) out.push('(');
      treeTokens(t.a, out, false); out.push(t.op); treeTokens(t.b, out, false);
      if (!top) out.push(')');
    }
    return out;
  }
  function solve(opts) {
    var U = opts.universe || [], goal = opts.goal, full = fullSet(U), mode = opts.mode || 'impossible';
    var t0 = clock(), limit = opts.timeMs == null ? 400 : opts.timeMs, minC = opts.minCubes == null ? 2 : opts.minCubes;
    var req = countVec(opts.req), perm = countVec(opts.perm), res = countVec(mode === 'last' || mode === 'free' ? [] : opts.res);
    var base = req.map(function (x, i) { return x + perm[i]; }), pool = base.map(function (x, i) { return x + res[i]; });
    var total = pool.reduce(function (a, b) { return a + b; }, 0);
    var maxC = Math.min(opts.maxCubes || 99, total), capped = !!opts.maxCubes && opts.maxCubes < total;
    if (typeof goal !== 'number' || goal < 0 || goal > U.length || goal !== Math.floor(goal)) return { found: false, complete: true, reason: 'goal' };
    var reqTotal = req.reduce(function (a, b) { return a + b; }, 0);
    if (reqTotal > maxC) return { found: false, complete: !capped };
    var levels = [], timedOut = false;
    function excess(v) { var e = 0; for (var i = 0; i < NS; i++) if (v[i] > base[i]) e += v[i] - base[i]; return e; }
    function okVec(v) { for (var i = 0; i < NS; i++) if (v[i] > pool[i]) return false; return mode !== 'now' || excess(v) <= 1; }
    function hasReq(v) { for (var i = 0; i < NS; i++) if (v[i] < req[i]) return false; return true; }
    function entry(level, v) { var k = keyOf(v), e = level.get(k); if (!e) { e = { v: v, m: new Map() }; level.set(k, e); } return e; }
    function finish(t, cubes) { return { found: true, tokens: treeTokens(t, [], true), cubes: cubes, complete: true }; }
    levels[0] = new Map();
    for (var s = 1; s <= maxC; s++) {
      var L = new Map(); levels[s] = L;
      if (s === 1) {
        LEAF.forEach(function (sym) {
          if (!pool[IDX[sym]]) return;
          var v = new Array(NS).fill(0); v[IDX[sym]] = 1; if (!okVec(v)) return;
          entry(L, v).m.set(leafSet(sym, U), { t: 'leaf', s: sym });
        });
      } else {
        // complement of a (s-1)-cube Set-Name
        var pIdx = IDX["'"];
        if (pool[pIdx]) levels[s - 1].forEach(function (e) {
          var v = e.v.slice(); v[pIdx]++; if (!okVec(v)) return;
          var tgt = entry(L, v);
          e.m.forEach(function (t, m) { var nm = full & ~m; if (!tgt.m.has(nm)) tgt.m.set(nm, { t: 'not', a: t }); });
        });
        // A op B with a + b + 1 = s
        for (var oi = 0; oi < 3; oi++) {
          var op = OPS[oi], oIdx = IDX[op]; if (!pool[oIdx]) continue;
          var comm = op !== '-';
          for (var a = 1; a <= s - 2; a++) {
            var b = s - 1 - a; if (comm && a > b) continue;
            var LA = levels[a], LB = levels[b];
            LA.forEach(function (ea, ka) {
              LB.forEach(function (eb, kb) {
                if (comm && a === b && ka > kb) return;
                var v = new Array(NS); for (var i = 0; i < NS; i++) v[i] = ea.v[i] + eb.v[i]; v[oIdx]++;
                if (!okVec(v)) return;
                var tgt = entry(L, v);
                ea.m.forEach(function (ta, ma) { eb.m.forEach(function (tb, mb) {
                  var nm = op === 'U' ? (ma | mb) : op === 'I' ? (ma & mb) : (ma & ~mb & full);
                  if (!tgt.m.has(nm)) tgt.m.set(nm, { t: 'bin', op: op, a: ta, b: tb });
                }); });
              });
              if (clock() - t0 > limit) timedOut = true;
            });
            if (timedOut) return { found: false, complete: false, timedOut: true };
          }
        }
      }
      if (s >= minC) {
        var hit = null;
        L.forEach(function (e) { if (hit || !hasReq(e.v)) return; e.m.forEach(function (t, m) { if (!hit && popcount(m) === goal) hit = t; }); });
        if (hit) return finish(hit, s);
      }
      if (clock() - t0 > limit) return { found: false, complete: false, timedOut: true };
    }
    return { found: false, complete: !capped };
  }

  // ---- Scoring after a challenge (rules VI and X-B, pages O2 and O15) ----
  // Same 2/4/6 rule as Equations (tests check it matches Eq.scoreChallenge for every case).
  // kind 'now'|'impossible'; ch = Challenger, mv = Mover, tp = Third Party (or null); wOk = the required
  // writer's Solution was correct; tpRes = {presented, ok} for the Third Party.
  function scoreChallenge(kind, ch, mv, tp, wOk, tpRes) {
    var pts = {}, tpPres = !!(tpRes && tpRes.presented), tpOk = tpPres && !!tpRes.ok;
    if (kind === 'now') {
      pts[ch] = wOk ? 6 : 2;
      pts[mv] = (wOk || tpOk) ? 2 : 6;
      if (tp !== null && tp !== undefined) pts[tp] = tpPres ? (tpOk ? (wOk ? 4 : 6) : 2) : (wOk ? 2 : 6);
    } else {
      pts[mv] = wOk ? 6 : 2;
      pts[ch] = (wOk || tpOk) ? 2 : 6;
      if (tp !== null && tp !== undefined) pts[tp] = tpPres ? (tpOk ? 6 : 2) : (wOk ? 2 : 4);
    }
    return pts;
  }
  // After the last cube (rule X-C): correct 4, not correct 2.
  function scoreLast(oks) { var pts = {}; Object.keys(oks).forEach(function (k) { pts[k] = oks[k] ? 4 : 2; }); return pts; }

  return {
    COLORS: COLORS, BIT: BIT, COLOR_NAME: COLOR_NAME, SHOW: SHOW, WORD: WORD, FACES: FACES, COUNTS: COUNTS, SHAPES: SHAPES, SHAPE: SHAPE,
    isColor: isColor, isSetSym: isSetSym, isBinOp: isBinOp, isOp: isOp, isDigit: isDigit, isRel: isRel, symOf: symOf, isCubeTok: isCubeTok, show: show, kindOf: kindOf,
    popcount: popcount, rng: rng, shuffle: shuffle,
    cardHas: cardHas, cardColors: cardColors, cardName: cardName, deal: deal, fullSet: fullSet, leafSet: leafSet, apply: apply, setCards: setCards,
    roll: roll, goalValue: goalValue, goalIdeas: goalIdeas, goalText: goalText,
    interpret: interpret, evaluate: evaluate, exprText: exprText, formSteps: formSteps,
    parseRestriction: parseRestriction, applyRestrictions: applyRestrictions,
    checkSolution: checkSolution, solve: solve, treeTokens: treeTokens,
    scoreChallenge: scoreChallenge, scoreLast: scoreLast
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OSE;
