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

  // ---- Middle-tier variation symbols (RULES_SUMMARY.md section 6) ----
  // Each is ONE character, so the solver's expression strings still split into tokens with split('').
  // A token like {s: UD[3], id: 7} means "cube 7 (a 3) used upside-down"; Eq.cubeOf(s) gives the
  // face the cube really shows, and Eq.orient(s) gives {d, o} for the orientation cards.
  var UD = '₀₁₂₃₄₅₆₇₈₉';                 // upside-down digit d  = −d          (Upside-down card)
  var SW = '⓪①②③④⑤⑥⑦⑧⑨';                 // sideways digit d     = 1/d         (Sideways card; ⓪ is never legal)
  var EX = '⁰¹²³⁴⁵⁶⁷⁸⁹';                 // exponent-colour digit d used as an exponent: x⁽ᵈ⁾ = x^d (Exponent card)
  var POB = { T: 1, H: 2, K: 3, W: 4, V: 5, Z: 6, t: -1, h: -2, k: -3, w: -4, v: -5, z: -6 }; // a 1 cube = 10^k (Powers of the Base)
  var POBK = {}; Object.keys(POB).forEach(function (c) { POBK[POB[c]] = c; });
  // TOURNEY (several variation cards at once, RULES_SUMMARY.md section 8): two more symbol sets that only exist
  // when two cards are in play together.
  var NS = '⓿❶❷❸❹❺❻❼❽❾';                 // a digit cube BOTH sideways and upside-down = −1/d (Sideways + Upside-down; Solution only, XIII-A-2 comment (a), manual F1)
  var NPOB = { 'ⅰ': 1, 'ⅱ': 2, 'ⅲ': 3, 'ⅳ': 4, 'ⅴ': 5, 'ⅵ': 6, 'Ⅰ': -1, 'Ⅱ': -2, 'Ⅲ': -3, 'Ⅳ': -4, 'Ⅴ': -5, 'Ⅵ': -6 }; // an upside-down 1 = −(a power of the base) (Powers of the Base + Upside-down, manual F17)
  var NPOBK = {}; Object.keys(NPOB).forEach(function (c) { NPOBK[NPOB[c]] = c; });
  function udOf(s) { var i = typeof s === 'string' && s.length === 1 ? UD.indexOf(s) : -1; return i; }
  function swOf(s) { var i = typeof s === 'string' && s.length === 1 ? SW.indexOf(s) : -1; return i; }
  function nsOf(s) { var i = typeof s === 'string' && s.length === 1 ? NS.indexOf(s) : -1; return i; }
  function exOf(s) { var i = typeof s === 'string' && s.length === 1 ? EX.indexOf(s) : -1; return i; }
  function pobOf(s) { return typeof s === 'string' && POB[s] !== undefined ? POB[s] : null; }
  function npobOf(s) { return typeof s === 'string' && NPOB[s] !== undefined ? NPOB[s] : null; }
  for (var di = 0; di <= 9; di++) {
    SHOW[UD[di]] = di === 0 ? '0' : '−' + di;
    if (di) SHOW[SW[di]] = '1/' + di;
    if (di) SHOW[NS[di]] = '−1/' + di;
    SHOW[EX[di]] = EX[di];
  }
  Object.keys(POB).forEach(function (c) { var k = POB[c]; SHOW[c] = k > 0 ? '1' + '0'.repeat(k) : '0.' + '0'.repeat(-k - 1) + '1'; });
  Object.keys(NPOB).forEach(function (c) { var k = NPOB[c]; SHOW[c] = '−' + (k > 0 ? '1' + '0'.repeat(k) : '0.' + '0'.repeat(-k - 1) + '1'); });

  // ---- OPERATOR TABLE ----
  // Every operation symbol the evaluator and the solver know. To add an operator (e.g. a house-rule
  // "bonus cube"), add one entry here, its maths in opCore/unCore, a MSG line for its errors, and (if it
  // belongs to a variation card) the card id in VARIATIONS + a flag in rulesOf. Nothing else needs to change:
  // the parser, the solver's search and the expression printer all read this table.
  //   kind: 'bin' (a o b) | 'pre' (o a: applies to the number right after it) | 'post' (a o: the number right before it)
  //   lvl : binary ops only. 1 = with + −, 2 = with × ÷, 3 = with ^ (right to left), 3.5 = binds tightest (like a root index)
  //   cube: the cube face it uses ('!' is written in, not a cube: it is tracked as a pseudo-cube with a budget)
  //   card: the rulesOf flag that switches it on (null = always on)
  //   comm: true if a o b = b o a (the solver then tries only one order)
  var OPDEF = {
    '+': { kind: 'bin', lvl: 1, cube: '+', card: null, comm: true },
    '-': { kind: 'bin', lvl: 1, cube: '-', card: null },
    '*': { kind: 'bin', lvl: 2, cube: '*', card: null, comm: true },
    '/': { kind: 'bin', lvl: 2, cube: '/', card: null },
    '^': { kind: 'bin', lvl: 3, cube: '^', card: null },
    'r': { kind: 'bin', lvl: 3.5, cube: 'r', card: null },    // index root (3√8); the prefix √ is handled with it
    'm': { kind: 'bin', lvl: 2, cube: '/', card: 'rem' },      // Remainder: sideways ÷
    'a': { kind: 'bin', lvl: 1, cube: '+', card: 'avg', comm: true },  // Average: + means "the average of"
    '%': { kind: 'bin', lvl: 2, cube: 'r', card: 'pct', comm: true },  // Percent: upside-down √, A % B = A% of B
    'g': { kind: 'bin', lvl: 3, cube: '^', card: 'gcf', comm: true },  // GCF: ^ used for the greatest common factor
    'l': { kind: 'bin', lvl: 3.5, cube: 'r', card: 'lcm', comm: true }, // LCM: √ used for the least common multiple
    'f': { kind: 'pre', cube: '*', card: 'nfac' },             // Number of Factors: × in front of a number
    'p': { kind: 'pre', cube: '*', card: 'sprime' },           // Smallest Prime: × in front of a number
    '!': { kind: 'post', cube: '!', card: 'fact' }             // Factorial (written in; two for the whole Equation)
  };
  // ---- BONUS (HOUSE RULE, not in the official game): two twenty-sided bonus dice that become cubes ----
  // (RULES_SUMMARY.md section 7, docs/handoff/bonus.md). Each face is ONE internal character, like the Middle cards.
  // POWER DIE (gold): a new operation; the symbol is also the die's face (cube: itself), so it only exists when rolled.
  //   post (works on the number right before it, binds tightest): F n!   Q x²   C x³
  //   pre  (works on the number right after it):  A |x|  D double  B half  U negative  O 1/x  R √x  S sum of digits  N how many factors
  //   bin  (between two numbers): M mod (remainder)  E percent of  X the bigger  I the smaller  Y average  G gcf  L lcm
  // BIG-NUMBER DIE (purple): one number all by itself (never glued to a digit). Symbols BIG[k] = value BIGV[k].
  var BIG = 'αβγδεζηθικλμνξοπρστυ';
  var BIGV = [[10, 1], [11, 1], [12, 1], [15, 1], [20, 1], [24, 1], [25, 1], [30, 1], [36, 1], [50, 1], [60, 1], [100, 1], [1000, 1],
    [1, 2], [1, 4], [3, 4], [1, 3], [2, 3], [1, 10], [3, 2]].map(function (x) { return { n: x[0], d: x[1] }; });
  var BIGSHOW = ['10', '11', '12', '15', '20', '24', '25', '30', '36', '50', '60', '100', '1000', '½', '¼', '¾', '⅓', '⅔', '1/10', '1½'];
  var POWER_FACES = ['F', 'Q', 'C', 'A', 'M', 'E', 'X', 'I', 'Y', 'G', 'L', 'D', 'B', 'U', 'O', 'R', 'S', 'N', 'Q', 'D']; // x² and double twice
  var BIG_FACES = BIG.split('');
  function bigIdx(s) { return typeof s === 'string' && s.length === 1 ? BIG.indexOf(s) : -1; }
  function bigOf(s) { var k = bigIdx(s); return k >= 0 ? BIGV[k] : null; }
  [['F', 'post'], ['Q', 'post'], ['C', 'post'], ['A', 'pre'], ['D', 'pre'], ['B', 'pre'], ['U', 'pre'], ['O', 'pre'], ['R', 'pre'], ['S', 'pre'], ['N', 'pre'],
    ['M', 'bin', 2], ['E', 'bin', 2, true], ['X', 'bin', 2, true], ['I', 'bin', 2, true], ['Y', 'bin', 1, true], ['G', 'bin', 3, true], ['L', 'bin', 3, true]].forEach(function (b) {
    OPDEF[b[0]] = { kind: b[1], cube: b[0], card: null, bonus: true };
    if (b[1] === 'bin') { OPDEF[b[0]].lvl = b[2]; if (b[3]) OPDEF[b[0]].comm = true; }
  });
  Object.assign(SHOW, { F: 'n!', Q: 'x²', C: 'x³', A: '|x|', D: '2×', B: '½×', U: '−x', O: '1/x', R: '√x', S: 'Σ', N: '#', M: 'mod', E: '%', X: 'max', I: 'min', Y: 'avg', G: 'gcf', L: 'lcm' }); // the die's face label, everywhere
  BIG_FACES.forEach(function (s, k) { SHOW[s] = BIGSHOW[k]; });
  CUBE_FACES.power = POWER_FACES; CUBE_FACES.big = BIG_FACES; // (not in COLORS: Eq.roll() still rolls exactly the 24 official cubes)
  function isBonusOp(s) { return !!(OPDEF[s] && OPDEF[s].bonus); }
  function digitSum(n) { var t = 0; n = Math.abs(n); while (n > 0) { t += n % 10; n = Math.floor(n / 10); } return t; }
  // ---- end BONUS block ----
  // Every cube face an operation spends (the solver counts these), plus '!' (two written-in signs).
  var CUBE_TYPES = []; OPS.concat(Object.keys(OPDEF).map(function (o) { return OPDEF[o].cube; })).forEach(function (c) { if (CUBE_TYPES.indexOf(c) < 0) CUBE_TYPES.push(c); });
  SHOW.a = 'avg'; SHOW['%'] = '%'; SHOW.g = 'gcf'; SHOW.l = 'lcm'; SHOW.f = '#'; SHOW.p = 'P'; SHOW['!'] = '!'; SHOW['.'] = '.';
  // The cube face a symbol uses (null for '!' and parentheses).
  function cubeOf(s) {
    if (isDigit(s)) return s;
    var k = udOf(s); if (k >= 0) return String(k);
    k = swOf(s); if (k >= 0) return String(k);
    k = nsOf(s); if (k >= 0) return String(k);   // TOURNEY
    k = exOf(s); if (k >= 0) return String(k);
    if (pobOf(s) !== null || npobOf(s) !== null) return '1'; // (TOURNEY: + an upside-down power of the base)
    if (bigIdx(s) >= 0) return s; // BONUS: the big-number die is its own face
    if (s === '.') return '^';
    if (OPDEF[s]) return OPDEF[s].cube === '!' ? null : OPDEF[s].cube;
    return null;
  }
  // Orientation of a number token: {d: digit, o: ''|'u'|'s'} or null if it is not a number cube.
  function orient(s) {
    if (isDigit(s)) return { d: +s, o: '' };
    var k = udOf(s); if (k >= 0) return { d: k, o: 'u' };
    k = swOf(s); if (k >= 0) return { d: k, o: 's' };
    k = nsOf(s); if (k >= 0) return { d: k, o: 'n' };   // TOURNEY: both turns at once
    return null;
  }
  // The symbol for digit d in orientation o ('' upright, 'u' upside-down, 's' sideways, 'n' both: TOURNEY).
  function withOrient(d, o) { d = +d; return o === 'u' ? UD[d] : o === 's' ? SW[d] : o === 'n' ? NS[d] : String(d); }
  // Does this symbol stand for a number by itself (a leaf)?
  function isNumSym(s) { return isDigit(s) || udOf(s) >= 0 || swOf(s) >= 0 || nsOf(s) >= 0 || pobOf(s) !== null || npobOf(s) !== null || bigIdx(s) >= 0; } // (BONUS: + the big-number die; TOURNEY: + both turns, upside-down powers)

  // ---- small number helpers ----
  function isPrime(n) { if (n < 2) return false; for (var k = 2; k * k <= n; k++) if (n % k === 0) return false; return true; }
  function numFactors(n) { var c = 0; for (var k = 1; k * k <= n; k++) if (n % k === 0) c += (k * k === n) ? 1 : 2; return c; }
  function nextPrime(v) { var n = Math.floor(v.n / v.d) + 1; if (n < 2) n = 2; while (!isPrime(n)) n++; return n; }
  function pow10(k, B) { B = B || 10; var x = 1; for (var i = 0; i < Math.abs(k); i++) x *= B; return k >= 0 ? frac(x, 1) : frac(1, x); } // (TOURNEY: B = the base, Powers of the Base + Base m, XIII-B-10)
  // TOURNEY: Middle-division powers and roots (section III-C; no Elementary "General Rule"), kept exact: a value that is not a
  // fraction (like √2) is refused. Only used when a tournament-practice shake is played with the Middle list (rulesOf().mpow).
  function iroot(n, q) { // the whole number r with r^q = n (n ≥ 0), or -1
    if (n < 0) return -1; if (n < 2) return n;
    var g = Math.round(Math.pow(n, 1 / q));
    for (var c = Math.max(0, g - 1); c <= g + 1; c++) { var x = 1, k; for (k = 0; k < q && x <= n; k++) x *= c; if (k === q && x === n) return c; }
    return -1;
  }
  function powQ(a, e) { // a^e for fractions a, e (e reduced); an error code if undefined or not a fraction
    var p = e.n, q = e.d;
    if (a.n === 0) return p > 0 ? { n: 0, d: 1 } : p === 0 ? 'zerozero' : 'divzero'; // 0^a is undefined for a ≤ 0 (III-C-2-b)
    var n = a.n, d = a.d;
    if (q > 1) {
      if (n < 0 && q % 2 === 0) return 'evenneg';
      if (q > 64) return 'irrational';
      var rn = iroot(Math.abs(n), q), rd = iroot(d, q);
      if (rn < 0 || rd < 0) return 'irrational';
      n = n < 0 ? -rn : rn; d = rd;
    }
    var ap = Math.abs(p), xn = 1, xd = 1;
    if (Math.abs(n) === 1 && d === 1) xn = (n === -1 && ap % 2 === 1) ? -1 : 1;
    else for (var i = 0; i < ap; i++) { xn *= n; xd *= d; if (Math.abs(xn) > LIMIT || xd > LIMIT) return 'big'; }
    return p >= 0 ? frac(xn, xd) : frac(xd, xn);
  }

  // One operation on two fractions. Returns a fraction or an error code string.
  // fr = fractions unlocked? (if not, every division must come out whole)
  // Powers and roots follow the Elementary "General Rule": whole numbers only.
  function opCore(op, a, b, fr, R) {
    var r;
    if (R && R.mpow && (op === '^' || op === 'r')) { // TOURNEY: Middle list (III-C): any real power or root, kept exact
      if (op === '^') return powQ(a, b);
      if (a.n === 0) return 'rootindex';                               // 0√b is undefined (III-C-2-a)
      return powQ(b, { n: a.n < 0 ? -a.d : a.d, d: Math.abs(a.n) });  // a√b = b^(1/a); even-root rules come from powQ (III-C-2-c, d)
    }
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
      case 'a': // Average (XIII-A-12 / XIII-B-11): the average of the two numbers
        r = frac(a.n * b.d + b.n * a.d, 2 * a.d * b.d);
        return (typeof r !== 'string' && !fr && r.d !== 1) ? 'frac2' : r;
      case '%': // Percent (XIII-A-14 / XIII-B-12): A % B = A percent of B = A × B ÷ 100
        r = frac(a.n * b.n, 100 * a.d * b.d);
        return (typeof r !== 'string' && !fr && r.d !== 1) ? 'frac2' : r;
      case 'l': // LCM (XIII-A-9): two counting numbers
        if (a.d !== 1 || b.d !== 1 || a.n < 1 || b.n < 1) return 'lcmwhole';
        return frac(a.n / gcd(a.n, b.n) * b.n, 1);
      case 'g': // GCF (XIII-A-10): two whole numbers, not both 0
        if (a.d !== 1 || b.d !== 1 || a.n < 0 || b.n < 0) return 'gcfwhole';
        if (a.n === 0 && b.n === 0) return 'gcfzero';
        return { n: gcd(a.n, b.n), d: 1 };
      // ---- BONUS: Power die operations between two numbers (house rule) ----
      case 'M': // mod: the remainder, exactly the Remainder card's maths (counting numbers, A ≤ 1000)
        r = opCore('m', a, b, fr);
        return r === 'remwhole' ? 'bmodwhole' : r === 'rembig' ? 'bmodbig' : r;
      case 'E': return opCore('%', a, b, fr);   // A percent of B
      case 'X': return (a.n * b.d >= b.n * a.d) ? a : b; // the bigger of the two
      case 'I': return (a.n * b.d <= b.n * a.d) ? a : b; // the smaller of the two
      case 'Y': return opCore('a', a, b, fr);   // the average
      case 'G': return opCore('g', a, b, fr);   // greatest common factor
      case 'L': return opCore('l', a, b, fr);   // lowest common multiple
    }
    return 'syntax';
  }
  // One-number operations: 'f' Number of Factors, 'p' Smallest Prime, '!' factorial.
  function unCore(op, a, fr, R) {
    switch (op) {
      case 'f': // XIII-B-8 (Middle): A a counting number, A ≤ 1000 (TOURNEY Elementary list: A ≤ 200, XIII-A-11)
        if (a.d !== 1 || a.n < 1) return 'nfacwhole';
        if (R && R.nfmax === 200 && a.n > 200) return 'nfacbig200';
        if (a.n > 1000) return 'nfacbig';
        return { n: numFactors(a.n), d: 1 };
      case 'p': // XIII-A-13: A a rational number ≤ 200
        if (a.n > 200 * a.d) return 'sprimebig';
        return { n: nextPrime(a), d: 1 };
      case '!': // XIII-A-4: n! for whole n (0! = 1). 9! is the biggest that fits the checker.
        if (a.d !== 1 || a.n < 0) return 'factwhole';
        if (a.n > 9) return 'factbig';
        var x = 1; for (var i = 2; i <= a.n; i++) x *= i;
        return { n: x, d: 1 };
      // ---- BONUS: Power die operations on one number (house rule). Exact only: anything not rational is refused. ----
      case 'F': return unCore('!', a, fr);                         // n! (whole n, 9! at most)
      case 'Q': if (Math.abs(a.n) > 1000 || a.d > 1000) return 'big'; return frac(a.n * a.n, a.d * a.d);           // x² (any number)
      case 'C': if (Math.abs(a.n) > 100 || a.d > 100) return 'big'; return frac(a.n * a.n * a.n, a.d * a.d * a.d);  // x³ (any number)
      case 'A': return { n: Math.abs(a.n), d: a.d };              // |x|
      case 'D': return frac(2 * a.n, a.d);                         // double
      case 'B': var h = frac(a.n, 2 * a.d); return (typeof h !== 'string' && !fr && h.d !== 1) ? 'frac2' : h; // half
      case 'U': return { n: a.n === 0 ? 0 : -a.n, d: a.d };        // negative
      case 'O': if (a.n === 0) return 'divzero'; var rc = frac(a.d, a.n); return (typeof rc !== 'string' && !fr && rc.d !== 1) ? 'frac2' : rc; // 1/x
      case 'R': return opCore('r', TWO, a, fr);                    // √x (whole numbers with a whole root, like the √ cube)
      case 'S': if (a.d !== 1 || a.n < 0) return 'bsumwhole'; return { n: digitSum(a.n), d: 1 }; // sum of the digits
      case 'N': var nf = unCore('f', a, fr); return nf === 'nfacwhole' ? 'bnfacwhole' : nf === 'nfacbig' ? 'bnfacbig' : nf; // how many factors
    }
    return 'syntax';
  }

  // ---- Variations (Adventurous Equations, PDF section XIII-A, Elementary) ----
  // A "math mode" value is what the game passes everywhere as `fractions`: either a plain
  // true/false (no variation: exactly the old behaviour), or a plain-data object
  //   { fractions: true/false, vars: ['wild0', ...], goal: [Goal symbols], ...card settings }
  // (plain data so it can travel to the Web Worker). `goal` is only needed for 0 Wild (a 0 in the Goal
  // may stand for another digit too) and Factorial (! signs in the Goal use up the two allowed). Variation ids:
  //   wild0     0 Wild (XIII-A-3): every 0 cube stands for the same digit 0-9, in Goal and Solution.
  //   twodigit  Two-digit Numerals (XIII-A-8): two digit cubes side by side make a number in a Solution.
  //   threeops  Three-operation Solution (XIII-A-6): a Solution needs at least three operation signs.
  //   multiops  Multiple Operations (XIII-A-5): an operation cube the Solution may use can be used many times.
  //   remainder Remainder (XIII-A-7): a ÷ cube turned sideways means "the remainder of A ÷ B" (symbol m).
  // Middle tier (RULES_SUMMARY.md section 6; one card per shake):
  //   upside    Upside-down (XIII-B-2): a number cube upside-down is its opposite (−3). Symbols UD.
  //   sideways  Sideways (XIII-B-1): a nonzero number cube sideways is its reciprocal (1/3). Symbols SW.
  //   average   Average (XIII-B-11): + means the average of two numbers (symbol a).
  //   expo      Exponent (XIII-B-9): a numeral on a cube of the chosen colour may be an exponent with no ^ cube.
  //             Settings: ecol (colour), eids (ids of that colour's cubes), ex (how many of each digit of that
  //             colour are in each zone right now: {req:{d:n}, perm:{}, res:{}}; js/variations.js keeps it fresh).
  //   multk     Multiple of k (XIII-B-7): the Solution must differ from the Goal by a nonzero multiple of k. Setting: k (6-11).
  //   powbase   Powers of the Base (XIII-B-10): a 1 cube may stand for 10, 100, 0.1, … (symbols POB).
  //   factorial Factorial (XIII-B-4): two ! signs for the whole Equation (symbol !).
  //   nfactors  Number of Factors (XIII-B-8): × in front of a number = how many factors it has (symbol f).
  //   sprime    Smallest Prime (XIII-A-13): × in front of a number = the smallest prime bigger than it (symbol p).
  //   lcm       LCM (XIII-A-9): √ between two numbers may mean their least common multiple (symbol l).
  //   gcf       GCF (XIII-A-10): ^ between two numbers may mean their greatest common factor (symbol g).
  //   percent   Percent (XIII-B-12): an upside-down √ means "percent of" (symbol %).
  //   decimal   Decimal Point (XIII-B-13): ^ may be a decimal point joining up to three digits (symbol .).
  //   basem     Base m (XIII-B-6): every numeral is read in base m (8 or 9); two-digit numerals allowed in Solutions. Setting: base.
  var VARIATIONS = ['wild0', 'twodigit', 'threeops', 'multiops', 'remainder',
    'upside', 'sideways', 'average', 'expo', 'multk', 'powbase', 'factorial', 'nfactors', 'sprime', 'lcm', 'gcf', 'percent', 'decimal', 'basem'];
  var FLAG = { wild0: 'wild', twodigit: 'two', threeops: 'three', multiops: 'multi', remainder: 'rem',
    upside: 'ud', sideways: 'sw', average: 'avg', expo: 'expo', multk: 'multk', powbase: 'pob', factorial: 'fact',
    nfactors: 'nfac', sprime: 'sprime', lcm: 'lcm', gcf: 'gcf', percent: 'pct', decimal: 'dec', basem: 'basem' };
  // TOURNEY: 'div' = 'E' or 'M' marks a tournament-practice shake (the division's list). It switches on the few
  // rules that differ by division: Number of Factors up to 200 in Elementary (XIII-A-11) or 1000 in Middle (XIII-B-8),
  // and Middle-division powers and roots (no "General Rule", section III-C) for the Middle list. Without it nothing changes.
  var SETTINGS = ['k', 'base', 'ecol', 'eids', 'ex', 'div']; // card settings a math mode carries along
  function rulesOf(x) {
    var R = { fr: false, goal: null, any: false, k: 6, base: 0, ecol: null, eids: null, ex: null, sig: '', div: null, nfmax: 1000, mpow: false };
    Object.keys(FLAG).forEach(function (v) { R[FLAG[v]] = false; });
    if (x && typeof x === 'object') {
      R.fr = !!x.fractions; R.goal = x.goal || null;
      (x.vars || []).forEach(function (v) { if (FLAG[v]) { R[FLAG[v]] = true; R.any = true; R.sig += FLAG[v] + ','; } });
      if (R.multk) R.k = (x.k >= 2 && x.k <= 99) ? x.k | 0 : 6;
      if (R.basem) R.base = (x.base >= 2 && x.base <= 10) ? x.base | 0 : 8;
      if (R.expo) { R.ecol = x.ecol || null; R.eids = x.eids || null; R.ex = x.ex || null; }
      if (x.div === 'E' || x.div === 'M') { R.div = x.div; R.nfmax = x.div === 'E' ? 200 : 1000; R.mpow = x.div === 'M'; }
      R.sig += 'k' + R.k + 'b' + R.base + (R.div ? 'd' + R.div : '');
    } else R.fr = !!x;
    R.udsw = R.ud && R.sw; R.pobud = R.pob && R.ud; // TOURNEY: symbols that need two cards at once
    return R;
  }
  // Build a math mode. With no variations it is just the fractions boolean (so nothing changes).
  // set = optional card settings ({k}, {base}, {ecol, eids, ex}).
  function mathMode(fractions, vars, goalSyms, set) {
    vars = (vars || []).filter(function (v) { return VARIATIONS.indexOf(v) >= 0; });
    if (!vars.length && !(set && (set.div === 'E' || set.div === 'M'))) return !!fractions; // (TOURNEY: a tournament shake keeps its division even with no card)
    var m = { fractions: !!fractions, vars: vars.slice() };
    if (goalSyms) m.goal = goalSyms.slice();
    if (set) SETTINGS.forEach(function (k) { if (set[k] !== undefined && set[k] !== null) m[k] = set[k]; });
    return m;
  }
  // The same math mode, now knowing the Goal's symbols (0 Wild and Factorial need them).
  function withGoal(m, goalSyms) {
    if (!m || typeof m !== 'object') return m;
    return mathMode(m.fractions, m.vars, (goalSyms || []).map(sym).filter(function (s) { return s !== '(' && s !== ')'; }), m);
  }
  function fracOn(m) { return rulesOf(m).fr; }
  function varsOf(m) { return (m && typeof m === 'object' && m.vars) ? m.vars.slice() : []; }
  function hasZero(list) { return list.some(function (t) { var s = sym(t); return s === '0' || s === UD[0] || s === SW[0] || s === NS[0]; }); } // (TOURNEY: a turned 0 is wild too, manual F2, F3)
  function bangsIn(list) { var n = 0; (list || []).forEach(function (t) { if (sym(t) === '!') n++; }); return n; }
  // Which card switches a symbol on (null = always allowed)
  function symCard(s) {
    if (udOf(s) >= 0) return 'ud';
    if (swOf(s) >= 0) return 'sw';
    if (nsOf(s) >= 0) return 'udsw';      // TOURNEY
    if (npobOf(s) !== null) return 'pobud'; // TOURNEY
    if (exOf(s) >= 0) return 'expo';
    if (pobOf(s) !== null) return 'pob';
    if (s === '.') return 'dec';
    return OPDEF[s] ? OPDEF[s].card : null;
  }
  var CARDNAME = { udsw: 'Sideways and the Upside-down', pobud: 'Powers of the Base and the Upside-down', ud: 'Upside-down', sw: 'Sideways', expo: 'Exponent', pob: 'Powers of the Base', dec: 'Decimal Point', rem: 'Remainder',
    avg: 'Average', pct: 'Percent', gcf: 'GCF', lcm: 'LCM', nfac: 'Number of Factors', sprime: 'Smallest Prime', fact: 'Factorial' };
  // Make every symbol explicit for a card: under Average every + is 'a'; under Number of Factors /
  // Smallest Prime a × with no number in front of it is 'f' / 'p' (its place decides, PDF XIII-A-11 comment (a)).
  function resolve(tokens, m) {
    var RU = rulesOf(m), prev = null;
    return (tokens || []).map(function (t) {
      var s = sym(t), out = s;
      if (s === '+' && RU.avg) out = 'a';
      else if (s === '*' && (RU.nfac || RU.sprime)) {
        var operandBefore = prev !== null && (isNumSym(prev) || prev === ')' || prev === '!' || exOf(prev) >= 0 || (OPDEF[prev] && OPDEF[prev].kind === 'post')); // (BONUS: + x², x³, n!)
        if (!operandBefore) out = RU.nfac ? 'f' : 'p';
      }
      prev = s;
      if (out === s) return t;
      return typeof t === 'string' ? out : { s: out, id: t.id };
    });
  }

  var MSG = {
    divzero: "You can't divide by zero. Nobody can, not even the wizard!",
    big: "That number got too gigantic for our cubes to check.",
    fraction: "That division doesn't come out even. Fractions are switched off in Settings, so try a different division!",
    frac2: "That makes a fraction, and fractions are switched off in Settings. Try different numbers!",
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
    syntax: "That doesn't make a math expression.",
    // Middle-tier cards
    nocard: "That needs a variation card that isn't in play this shake.",
    sw0: "A sideways 0 would mean 1 ÷ 0, and nobody can divide by zero. Only 1 to 9 can go sideways.",
    flipnext: "A turned cube (upside-down or sideways) is a number all by itself, so it can't touch another number cube. Put an operation between them.",
    nfacwhole: "Number of Factors (a × in front of a number) only works on counting numbers: 1, 2, 3, …",
    nfacbig: "Number of Factors only works on numbers up to 1000.",
    sprimebig: "Smallest Prime (a × in front of a number) only works on numbers up to 200.",
    lcmwhole: "LCM needs two counting numbers: 1, 2, 3, …",
    gcfwhole: "GCF needs two whole numbers: 0, 1, 2, …",
    gcfzero: "GCF needs at least one number that isn't 0.",
    factwhole: "Factorial (!) only works on whole numbers: 0, 1, 2, 3, …",
    factbig: "That factorial is too gigantic to check. 9! is the biggest one the game can do.",
    bangs: "There are only two ! signs for the whole Equation (the Goal and the Solution together).",
    postfix: "! and exponent cubes go right after a number, like 3! or 5².",
    decbig: "A decimal point can join at most three digits, like 2.5, .25 or 12.5.",
    twodots: "One number can only have one decimal point.",
    decalone: "A decimal point needs at least one digit next to it.",
    pctdigits: "In a Solution, only the numbers right next to % may have two digits.",
    multkgoal: "With Multiple of k, the Goal must be between −1000 and 1000.",
    expcolor: "Only a cube of the Exponent colour can be an exponent all by itself.",
    // TOURNEY (several cards at once)
    nfacbig200: "In the Elementary list, Number of Factors only works on numbers up to 200.",
    bothgoal: "A cube can be sideways AND upside-down only in a Solution, not in the Goal.",
    irrational: "That power or root doesn't come out as a whole number or a neat fraction, so the game can't check it exactly.",
    evenneg: "An even root (like a square root) of a number below zero isn't a real number.",
    // BONUS dice (house rule)
    bignext: "The big-number die is one number all by itself, so it can't join other number cubes. Put an operation between them.",
    bigfrac: "That big-number die shows a fraction, and fractions are switched off in Settings.",
    bpost: "That gold cube works on the number right BEFORE it, like 4! or 5². Put a number first, then the gold cube.",
    bmodwhole: "For mod (the remainder), both numbers must be counting numbers: 1, 2, 3, …",
    bmodbig: "For mod (the remainder), the first number must be 1000 or less.",
    bsumwhole: "Sum of digits only works on whole numbers: 0, 1, 2, 3, …",
    bnfacwhole: "How many factors only works on counting numbers: 1, 2, 3, …",
    bnfacbig: "How many factors only works on numbers up to 1000."
  };
  function err(code, msg) { return { ok: false, code: code, msg: msg || MSG[code] || code }; }
  function baseMsg(b) { return 'In base ' + b + ' the digits are 0 to ' + (b - 1) + ', so ' + (b === 8 ? '8 and 9 don\'t' : b === 9 ? '9 doesn\'t' : 'bigger digits don\'t') + ' exist.'; }

  // ---- Evaluator ----
  // tokens: array of symbols ('0'-'9', '+', '-', '*', '/', '^', 'r', '(', ')') or objects {s:symbol,...}
  // opts.multiDigit: allow two-digit numerals (Goal only). opts.fractions: fractions unlocked.
  // Order: ( ) first, then roots (√ binds to the item right after it; a number right
  // before √ is its index), then ^ (right to left), then × ÷, then + − (left to right).
  // opts.fractions may be a math mode (see Variations above). opts.wild = the digit the 0 cubes stand
  // for (0 Wild; default 0). opts.inGoal = this is a Goal (a sideways ÷ is not allowed there).
  // With Remainder, 'm' (a sideways ÷) sits with × and ÷ (left to right).
  // Middle tier: the levels come from OPDEF. Prefix ops (√, # factors, smallest prime) take the item right
  // after them; postfix ops (!, an exponent cube) take the item right before them and bind tightest of all,
  // so √9! = √(9!) and 2+3! = 2+(3!). (The tournament calls some of these ambiguous; the game reads them
  // this one way and shows the value, as it does for the order of operations. RULES_SUMMARY.md section 6.)
  function evaluate(tokens, opts) {
    opts = opts || {};
    var RU = rulesOf(opts.fractions);
    var fr = RU.fr, maxD = (opts.multiDigit || RU.two || RU.basem) ? 2 : 1, madeFraction = false;
    var w = (RU.wild && typeof opts.wild === 'number') ? String(opts.wild) : '0';
    var B = RU.basem ? RU.base : 10;
    var toks = [], i = 0;
    while (i < tokens.length) {
      var s = sym(tokens[i]);
      if (isDigit(s) || (s === '.' && RU.dec)) {
        // a numeral: a run of digit cubes (and, with Decimal Point, at most one point)
        var j = i, str = '', dots = 0;
        while (j < tokens.length) {
          var c = sym(tokens[j]);
          if (isDigit(c)) str += c === '0' ? w : c;
          else if (c === '.' && RU.dec) { dots++; str += '.'; }
          else break;
          j++;
        }
        var digs = str.replace('.', '');
        if (dots > 1) return err('twodots');
        var v;
        if (dots === 1) {
          if (!digs.length) return err('decalone');
          if (digs.length > 3) return err('decbig');
          var after = str.length - 1 - str.indexOf('.');
          v = frac(parseInt(digs, 10), Math.pow(10, after));
          if (v.d !== 1 && !fr) return err('frac2');
        } else {
          var lim = maxD;
          if (RU.pct && lim < 2) lim = 2; // checked below: only next to %
          if (digs.length > lim) return err(lim === 1 ? 'concat' : opts.multiDigit ? 'threedigit' : (RU.two || RU.basem) ? 'threedigit2' : 'threedigit');
          var nv = 0;
          for (var q = 0; q < digs.length; q++) { var dv = +digs[q]; if (dv >= B) return err('basedigit', baseMsg(B)); nv = nv * B + dv; }
          v = { n: nv, d: 1 };
        }
        toks.push({ k: 'n', v: v, len: digs.length, dec: dots });
        i = j;
        continue;
      }
      var card = symCard(s);
      if (card === 'rem' && !RU.rem) return err('syntax'); // (as before the Middle cards: m is not a symbol without Remainder)
      if (card && !RU[card]) return err('nocard', 'That needs the ' + CARDNAME[card] + ' card, and it isn\'t in play this shake.');
      if (bigIdx(s) >= 0) { // BONUS: the big-number die, one number all by itself (its value never changes with a card)
        var bgv = bigOf(s); if (bgv.d !== 1 && !fr) return err('bigfrac');
        toks.push({ k: 'n', v: bgv, len: 1, big: true }); i++; continue;
      }
      if (isNumSym(s)) { // a turned digit cube or a power of ten: a number all by itself
        var o = orient(s), nvx;
        var od = o ? ((o.d === 0 && RU.wild) ? +w : o.d) : 0; // TOURNEY: a turned wild 0 is the wild digit turned (manual F2, F3)
        if (o && o.o === 'u') { if (od >= B) return err('basedigit', baseMsg(B)); nvx = { n: -od, d: 1 }; }
        else if (o && o.o === 's') { if (od === 0) return err('sw0'); if (od >= B) return err('basedigit', baseMsg(B)); if (!fr) return err('frac2'); nvx = { n: 1, d: od }; } // (TOURNEY: base check, manual F15)
        else if (o && o.o === 'n') { // TOURNEY: sideways and upside-down at once, Solution only (XIII-A-2 comment (a), manual F1)
          if (opts.inGoal) return err('bothgoal');
          if (od === 0) return err('sw0'); if (od >= B) return err('basedigit', baseMsg(B)); if (!fr) return err('frac2');
          nvx = { n: -1, d: od };
        }
        else if (npobOf(s) !== null) { var nk = npobOf(s); if (nk < 0 && !fr) return err('frac2'); nvx = pow10(nk, B); if (typeof nvx === 'string') return err(nvx); nvx = { n: -nvx.n, d: nvx.d }; } // TOURNEY: manual F17
        else { var pk = pobOf(s); if (pk < 0 && !fr) return err('frac2'); nvx = pow10(pk, B); if (typeof nvx === 'string') return err(nvx); } // (TOURNEY: B, Powers of the Base + Base m)
        toks.push({ k: 'n', v: nvx, len: 1, turned: true });
        i++;
        continue;
      }
      if (exOf(s) >= 0) { if (exOf(s) >= B) return err('basedigit', baseMsg(B)); toks.push({ k: 'e', d: exOf(s) }); i++; continue; } // (TOURNEY: base check, manual A27)
      if (s === '+' && RU.avg) { toks.push({ k: 'a' }); i++; continue; }
      if (OPDEF[s] || s === '(' || s === ')') {
        if (s === 'm' && opts.inGoal) return err('remgoal');
        toks.push({ k: s }); i++; continue;
      }
      return err('syntax');
    }
    if (!toks.length) return err('empty');
    for (var ti = 0; ti < toks.length; ti++) {
      var tk = toks[ti];
      // two numbers touching: a turned cube can't be glued to another number (PDF manual B45, B48, E30, E34)
      if (tk.k === 'n' && toks[ti + 1] && toks[ti + 1].k === 'n') return err((tk.big || toks[ti + 1].big) ? 'bignext' : (tk.turned || toks[ti + 1].turned) ? 'flipnext' : 'missingop'); // (BONUS: bignext)
      // Percent: a two-digit numeral in a Solution is only allowed right next to % (XIII-A-14)
      if (tk.k === 'n' && !tk.dec && tk.len === 2 && maxD < 2) {
        var nextTo = (toks[ti - 1] && toks[ti - 1].k === '%') || (toks[ti + 1] && toks[ti + 1].k === '%');
        if (!nextTo) return err('pctdigits');
      }
    }
    var p = 0;
    function peek() { return toks[p] ? toks[p].k : null; }
    function fail(c, msg) { throw { code: c, msg: msg }; }
    function chk(r) { if (typeof r === 'string') fail(r); if (r.d !== 1) madeFraction = true; return r; }
    function lvlOf(k) { return OPDEF[k] && OPDEF[k].kind === 'bin' && (!OPDEF[k].card || RU[OPDEF[k].card]) ? OPDEF[k].lvl : 0; }
    function expr() {
      var l = term();
      while (lvlOf(peek()) === 1) { var o = toks[p++].k; var r = term(); l = chk(opCore(o, l, r, fr, RU)); }
      return l;
    }
    function term() {
      var l = power();
      while (lvlOf(peek()) === 2) { var o = toks[p++].k; var r = power(); l = chk(opCore(o, l, r, fr, RU)); }
      return l;
    }
    function power() {
      var b = rootChain();
      if (lvlOf(peek()) === 3) { var o = toks[p++].k; var e = power(); return chk(opCore(o, b, e, fr, RU)); }
      return b;
    }
    function rootChain() {
      var a = atom();
      while (lvlOf(peek()) === 3.5) { var o = toks[p++].k; var b = atom(); a = chk(opCore(o, a, b, fr, RU)); }
      return a;
    }
    // an item, then any postfix ops (! and exponent cubes) that follow it
    function atom() {
      var v = primary();
      while (peek() === '!' || peek() === 'e' || isBonusPost(peek())) { // (BONUS: + the Power die's x², x³, n!)
        var t = toks[p++];
        v = t.k === 'e' ? chk(opCore('^', v, { n: t.d, d: 1 }, fr, RU)) : chk(unCore(t.k, v, fr, RU));
      }
      return v;
    }
    function isBonusPost(k) { return !!(OPDEF[k] && OPDEF[k].bonus && OPDEF[k].kind === 'post'); }
    function primary() {
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
      if (k === 'r') { p++; var x = atom(); return chk(opCore('r', TWO, x, fr, RU)); }
      if (OPDEF[k] && OPDEF[k].bonus && OPDEF[k].kind === 'pre') { p++; var bx = atom(); return chk(unCore(k, bx, fr)); } // BONUS: a Power die op in front of a number
      if (isBonusPost(k)) fail('bpost');
      // a × with no number before it: Number of Factors / Smallest Prime (its place decides)
      if (k === 'f' || k === 'p' || (k === '*' && (RU.nfac || RU.sprime))) {
        p++; var y = atom(); return chk(unCore(k === '*' ? (RU.nfac ? 'f' : 'p') : k, y, fr, RU));
      }
      if (k === '!' || k === 'e') fail('postfix');
      if (k === '+' || k === '-') fail('sign');
      if (lvlOf(k)) fail('opstart');
      if (k === ')') fail(p === 0 ? 'paren' : 'opstart');
      fail('incomplete');
    }
    try {
      var v = expr();
      if (p < toks.length) fail(peek() === ')' ? 'paren' : 'missingop');
      return { ok: true, value: v, madeFraction: madeFraction };
    } catch (e) {
      if (e && e.code) return err(e.code, e.msg);
      throw e;
    }
  }

  function cubeCount(tokens) { var n = 0; tokens.forEach(function (t) { var s = sym(t); if (s !== '(' && s !== ')' && s !== '!') n++; }); return n; }

  // ---- Goal check ----
  function checkGoal(tokens, fractions) {
    var n = cubeCount(tokens);
    if (n < 1) return { ok: false, reasons: [MSG.empty] };
    if (n > 6) return { ok: false, reasons: ['A Goal can have at most six cubes.'] };
    var RU = rulesOf(fractions);
    if (bangsIn(tokens) > 2) return { ok: false, reasons: [MSG.bangs] };
    var ev = evaluate(tokens, { multiDigit: true, fractions: fractions, inGoal: true });
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
    if (RU.multk && Math.abs(ev.value.n) > 1000 * ev.value.d) return { ok: false, reasons: [MSG.multkgoal] };
    return { ok: true, value: ev.value, reasons: [] };
  }
  // 0 Wild: the Goal's value when every 0 stands for digit w (null if that is not legal).
  function goalAt(goalSyms, w, fractions) {
    var e = evaluate(goalSyms, { multiDigit: true, fractions: fractions, inGoal: true, wild: w });
    return e.ok ? e.value : null;
  }
  // TOURNEY: every value the Goal may have when every 0 stands for digit w. With 0 Wild AND Upside-down a 0 in the
  // Goal looks the same upside-down, so each writer may read each Goal 0 either way (manual General Principle 11).
  // Otherwise this is just [goalAt(...)] (or [] if that is not legal).
  function goalVals(goalSyms, w, fractions) {
    var RU = rulesOf(fractions), base = (goalSyms || []).map(sym), zi = [], out = [], seen = {};
    if (RU.wild && RU.ud) base.forEach(function (s, i) { if (s === '0') zi.push(i); });
    for (var mask = 0; mask < (1 << zi.length); mask++) {
      var t = base.slice(); zi.forEach(function (i, b) { if ((mask >> b) & 1) t[i] = UD[0]; });
      var e = evaluate(t, { multiDigit: true, fractions: fractions, inGoal: true, wild: w });
      if (e.ok && !seen[e.value.n + '/' + e.value.d]) { seen[e.value.n + '/' + e.value.d] = 1; out.push(e.value); }
    }
    return out;
  }
  // Multiple of k: does value v differ from the Goal g by a nonzero whole-number multiple of k?
  function multOk(v, g, k) {
    var dn = v.n * g.d - g.n * v.d, dd = v.d * g.d; // v − g = dn/dd
    if (dn === 0 || dn % dd !== 0) return false;
    return (dn / dd) % k === 0;
  }

  // ---- Solution check ----
  // tokens: [{s, id}] for cubes and '(' ')' strings for parentheses ('!' too, with the Factorial card).
  // ctx: {goal, zone(id)->'required'|'permitted'|'forbidden'|'resources'|'goal',
  //       required:[ids], mode:'now'|'impossible'|'last'|'free'|'daily', fractions, label(id)->string}
  function checkSolution(tokens, ctx) {
    var reasons = [], ids = [];
    tokens.forEach(function (t) { if (typeof t === 'object' && t.id != null) ids.push(t.id); });
    if (!ids.length) return { ok: false, value: null, reasons: [MSG.empty] };
    var label = ctx.label || function (id) { return String(id); };
    var RU = rulesOf(ctx.fractions);
    var opCount = 0;
    tokens.forEach(function (t) { if (typeof t === 'object' && t.id != null && !isNumSym(t.s) && exOf(t.s) < 0 && !(t.s === '.' && RU.three)) opCount++; }); // (TOURNEY: a decimal point is not an operation sign, XIII-A-6 comment)
    if (RU.fact && RU.three) opCount += bangsIn(tokens); // TOURNEY: with Factorial, ! counts as an operation sign (XIII-A-6)
    var distinct = uniq(ids).length;
    if (distinct < 2) reasons.push('A Solution needs at least two cubes.');
    var forb = [], res = 0, goalUsed = false, seen = {};
    tokens.forEach(function (t) {
      if (typeof t !== 'object' || t.id == null) return;
      var id = t.id;
      if (seen[id] && RU.multi && !isNumSym(t.s)) return; // Multiple Operations: an operation cube may be used again (BONUS: isNumSym, so the big-number die is never 'used again')
      if (seen[id]) reasons.push('The same cube was used twice.');
      seen[id] = true;
      var z = ctx.zone(id);
      if (z === 'forbidden') forb.push(id);
      else if (z === 'resources') res++;
      else if (z === 'goal') goalUsed = true;
      // Exponent card: a cube used as an exponent must be one of the chosen colour (when the game told us which)
      if (RU.expo && exOf(t.s) >= 0 && RU.eids && RU.eids.indexOf(id) < 0) reasons.push(MSG.expcolor + ' (This ' + label(id) + ' isn\'t ' + (RU.ecol || 'that colour') + '.)');
    });
    if (RU.three && opCount < 3) reasons.push('With the Three-operation card, a Solution needs at least 3 operation signs (this one has ' + opCount + ').');
    if (RU.fact && !RU.multi && bangsIn(tokens) + bangsIn(RU.goal) > 2) reasons.push(bangsIn(RU.goal) ? 'The Goal already uses ' + bangsIn(RU.goal) + ' of the two ! signs, so your Solution may use only ' + (2 - bangsIn(RU.goal)) + '.' : MSG.bangs);
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
        var gws = gZero ? goalVals(RU.goal, w, ctx.fractions) : [ctx.goal]; // (TOURNEY: goalVals, manual General Principle 11)
        if (gws.some(function (gw) { return gw && eqF(ew.value, gw); })) { equal = true; ev = ew; wildAs = w; }
      }
      if (!equal && firstOk) ev = firstOk;
      if (!ev.ok) reasons.push(ev.msg);
      else {
        value = ev.value;
        if (!equal) reasons.push('Your Solution equals ' + fmt(value) + (sZero ? ' when 0 means 0' : '') + (gZero ? '' : ', but the Goal is ' + fmt(ctx.goal)) + '. I tried every digit 0 to 9 for the wild 0, and none of them makes it equal the Goal.');
      }
    } else if (!ev.ok) reasons.push(ev.msg);
    else if (RU.multk) {
      // Multiple of k (XIII-B-7): the Solution must NOT equal the Goal; it must be k, 2k, 3k, … more or less.
      value = ev.value; equal = multOk(value, ctx.goal, RU.k);
      if (eqF(value, ctx.goal)) reasons.push('Your Solution equals the Goal exactly, ' + fmt(value) + '. With Multiple of ' + RU.k + ', it must be ' + RU.k + ' or ' + (2 * RU.k) + ' or ' + (3 * RU.k) + ' … more or less than the Goal, never the same.');
      else if (!equal) reasons.push('Your Solution equals ' + fmt(value) + '. That is ' + fmt(opCore('-', value, ctx.goal, true)) + ' away from the Goal ' + fmt(ctx.goal) + ', and with Multiple of ' + RU.k + ' it must be ' + RU.k + ', ' + (2 * RU.k) + ', ' + (3 * RU.k) + ' … away (like ' + fmt(opCore('+', ctx.goal, { n: RU.k, d: 1 }, true)) + ' or ' + fmt(opCore('-', ctx.goal, { n: RU.k, d: 1 }, true)) + ').');
    } else {
      value = ev.value; equal = eqF(value, ctx.goal);
      if (!equal) reasons.push('Your Solution equals ' + fmt(value) + ', but the Goal is ' + fmt(ctx.goal) + '.' + cardHint(tokens, RU));
    }
    return { ok: reasons.length === 0, value: value, equal: equal, wildAs: wildAs, ops: opCount, reasons: reasons, madeFraction: !!ev.madeFraction, cubes: distinct, resUsed: res };
  }

  // A friendly reminder of what the card changed, added when a Solution misses the Goal (only if it uses the card).
  function cardHint(tokens, RU) {
    var ss = tokens.map(sym), has = function (f) { return ss.some(f); };
    if (RU.avg && has(function (s) { return s === 'a' || s === '+'; })) return ' Remember: with the Average card, + means halfway between two numbers, not adding.';
    if (RU.basem && has(function (s) { return isDigit(s); })) return ' Remember: numbers are read in base ' + RU.base + ' (10 means ' + (RU.base === 8 ? 'eight' : 'nine') + '), and the values here are counted in tens.';
    if ((RU.nfac || RU.sprime) && has(function (s) { return s === 'f' || s === 'p'; })) return RU.nfac ? ' A × with no number in front of it counts the factors of the number after it.' : ' A × with no number in front of it gives the next prime after the number behind it.';
    if (RU.pct && has(function (s) { return s === '%'; })) return ' Remember: A % B means A percent of B (50 % 8 is half of 8).';
    return '';
  }

  // ---- Solver ----
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function countMap(arr) { var m = {}; arr.forEach(function (s) { m[s] = (m[s] || 0) + 1; }); return m; }
  function uniq(arr) { var o = []; arr.forEach(function (s) { if (o.indexOf(s) < 0) o.push(s); }); return o; }
  var TIMEOUT = { timeout: true };

  // Build the expression text with as few parentheses as possible (internal symbols).
  function wrap(e, need) { return e.p < need ? '(' + e.s + ')' : e.s; }
  function combine(o, L, R, v) {
    switch (OPDEF[o].lvl) {
      case 1: return { v: v, s: L.s + o + (R.p <= 1 ? '(' + R.s + ')' : R.s), p: 1 };
      case 2: return { v: v, s: wrap(L, 2) + o + (R.p <= 2 ? '(' + R.s + ')' : R.s), p: 2 };
      case 3: return { v: v, s: (L.p <= 3 ? '(' + L.s + ')' : L.s) + o + wrap(R, 3), p: 3 };
      case 3.5: return { v: v, s: wrap(L, 4) + o + wrap(R, 4), p: 3.5 };
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
  // Distinct orderings of the characters of S (for decimal numerals, at most 3 characters).
  function perms(S) {
    if (S.length <= 1) return [S];
    var out = [];
    for (var i = 0; i < S.length; i++) {
      if (S.indexOf(S[i]) !== i) continue;
      perms(S.slice(0, i) + S.slice(i + 1)).forEach(function (r) { out.push(S[i] + r); });
    }
    return out;
  }
  // Exponent card: mark the digits of the exponent colour. counts = {digit: how many of them in this list}.
  function tagExp(list, counts) {
    if (!counts) return list;
    var left = {}; Object.keys(counts).forEach(function (d) { left[d] = counts[d]; });
    return list.map(function (s) { if (isDigit(s) && left[s] > 0) { left[s]--; return EX[+s]; } return s; });
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
  // Middle tier: a number cube may also be its upside-down / sideways self, a 1 any power of ten from
  // 10^-6 to 10^6 (the checker's own limit, so nothing is left out), ^ a decimal point, + an average,
  // × a one-number operation, √/^ LCM/GCF/percent, and ! (two for the Equation) a factorial.
  // Exponent: the mode's `ex` counts say which digits in each zone are on exponent-colour cubes (they
  // become EX symbols here, unless p.tagged says the lists already carry them). Multiple of k accepts any
  // value that differs from the Goal by a nonzero multiple of k.
  function solve(p) {
    var deadline = nowMs() + (p.timeMs || 500);
    var RU = rulesOf(p.fractions);
    var opt = p.opt || [], res = p.res || [], req = p.req || [];
    if (RU.expo && RU.ex && !p.tagged) { req = tagExp(req, RU.ex.req); opt = tagExp(opt, RU.ex.perm); res = tagExp(res, RU.ex.res); }
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
      var w = ws[wi], goals = gZero ? goalVals(RU.goal, w, p.fractions) : [p.goal]; // (TOURNEY: goalVals; with 0 Wild + Upside-down a Goal 0 may be read either way)
      for (var gi = 0; gi < goals.length; gi++) { // (no Goal value: the Goal is not legal when 0 means this digit)
        var base = { goal: goals[gi], req: req, fractions: RU.fr, RU: RU, wild: w, maxDigits: p.maxDigits || 6, deadline: deadline, memo: memo,
          bangs: RU.fact ? (RU.multi ? 1 : Math.max(0, 2 - bangsIn(RU.goal))) : 0 }; // (TOURNEY: Factorial + Multiple Operations: any number of ! in a Solution, XIII-A-5)
        for (var i = 0; i < scen.length; i++) {
          var r = core(base, scen[i].opt, scen[i].must);
          if (r.found) { if (w !== null) r.wild = w; return r; }
          if (!r.complete) complete = false;
          if (nowMs() > deadline) return { found: false, complete: false };
        }
      }
    }
    return { found: false, complete: complete };
  }

  function core(base, opt, must) {
    var RU = base.RU, multi = RU.multi, fr = base.fractions;
    var leafSym = function (s) { return isDigit(s) || exOf(s) >= 0 || bigIdx(s) >= 0; }; // (BONUS: + the big-number die)
    var B = RU.basem ? RU.base : 10;
    var req = base.req;
    if (RU.basem) { // digits the base doesn't have can never be used (PDF manual C42, C43, E62)
      if (req.some(function (s) { return isDigit(s) && +s >= B; })) return { found: false, complete: true };
      opt = opt.filter(function (s) { return !(isDigit(s) && +s >= B); });
      if (must && isDigit(must) && +must >= B) return { found: false, complete: true };
    }
    var all = req.concat(opt);
    var reqD = req.filter(leafSym).sort();
    var reqO = countMap(req.filter(function (s) { return !leafSym(s); }));
    var availD = countMap(all.filter(leafSym));
    var availO = countMap(all.filter(function (s) { return !leafSym(s); }));
    if (RU.fact && base.bangs > 0) availO['!'] = base.bangs;
    var maxD = base.maxDigits;
    var complete = true;
    if (reqD.length > maxD) return { found: false, complete: false };
    var totalD = 0; for (var dk in availD) totalD += availD[dk];
    if (totalD > maxD) complete = false; // bigger Solutions exist that we won't search

    // Which operations (binary and one-number) this mode may use, and the cube type each one spends.
    function on(o) { var d = OPDEF[o]; return !d.card || RU[d.card]; }
    var binOps = [], unOps = [];
    Object.keys(OPDEF).forEach(function (o) {
      var d = OPDEF[o];
      if (!on(o) || !(availO[d.cube] > 0)) return;
      if (o === '+' && RU.avg) return;               // Average: + is never addition
      if (d.kind === 'bin') binOps.push(o); else unOps.push(o);
    });
    var hasRoot = (availO.r || 0) > 0;
    var unaryCubes = { r: 1 }; unOps.forEach(function (o) { unaryCubes[OPDEF[o].cube] = 1; });
    if (RU.dec) unaryCubes['^'] = 1; // a decimal point spends a ^ cube without joining two numbers
    // Only "track" (count) cube types that could run out; plentiful ones are treated as unlimited.
    // Multiple Operations: every available type is tracked as "used yet?" (a count that stops at
    // the number of Required cubes of that type, at least 1) and never runs out.
    var tracked = [], caps = [], idx = {};
    CUBE_TYPES.forEach(function (t) {
      var a = availO[t] || 0;
      if (!a) return;
      if (multi) { idx[t] = tracked.length; tracked.push(t); caps.push(Math.max(1, reqO[t] || 0)); return; }
      if (unaryCubes[t] || (reqO[t] || 0) > 0 || a < maxD - 1 || must === t) { idx[t] = tracked.length; tracked.push(t); caps.push(a); }
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
    var three = RU.three, glue = RU.two || RU.basem;
    var cfg = tracked.map(function (t, i) { return t + caps[i]; }).join(',') + '|' + binOps.join('') + unOps.join('') + '|' + (fr ? 'F' : '') +
      (RU.any ? '|' + RU.sig + 'w' + base.wild : '');
    var tick = 0;
    var W = base.wild;
    var preP = (RU.fact || RU.expo || unOps.some(function (o) { return OPDEF[o].kind === 'post'; })) ? 3.9 : 4; // a prefix op followed by a postfix op needs parentheses: (√9)! (BONUS: also the Power die's post ops)
    function leafV(ch) { return (ch === '0' && W !== null && W !== undefined) ? W : +ch; }
    // value key: the value, plus (Three-operation) how many operation signs, capped at 3
    function vkey(v, o) { return three ? v.n + '/' + v.d + '#' + Math.min(3, o) : v.n + '/' + v.d; }

    function put(m, u, e) {
      var out = m.get(u); if (!out) { out = new Map(); m.set(u, out); }
      var k = vkey(e.v, e.o);
      if (!out.has(k)) out.set(k, e);
    }
    // the numbers one cube can be
    function leaves(m, ch) {
      if (exOf(ch) >= 0) { if (exOf(ch) < B) put(m, 0, { v: { n: exOf(ch), d: 1 }, s: String(exOf(ch)), p: 4, o: 0 }); return; } // an exponent-colour digit used plainly (TOURNEY: < B)
      if (bigIdx(ch) >= 0) { var bv = bigOf(ch); if (bv.d === 1 || fr) put(m, 0, { v: bv, s: ch, p: 4, o: 0 }); return; } // BONUS: the big-number die
      var d = leafV(ch);
      if (d >= B) return;
      put(m, 0, { v: { n: d, d: 1 }, s: ch, p: 4, o: 0 });
      var cd = +ch; // (TOURNEY: the turned symbol names the cube's own digit, so a turned wild 0 stays a 0 cube: manual F2, F3)
      if (RU.ud && d !== 0) put(m, 0, { v: { n: -d, d: 1 }, s: UD[cd], p: 4, o: 0 });
      if (RU.sw && d !== 0 && fr) put(m, 0, { v: { n: 1, d: d }, s: SW[cd], p: 4, o: 0 });
      if (RU.udsw && d !== 0 && fr) put(m, 0, { v: { n: -1, d: d }, s: NS[cd], p: 4, o: 0 }); // TOURNEY: manual F1
      if (RU.pob && ch === '1') for (var k = -6; k <= 6; k++) {
        if (!k || (k < 0 && !fr)) continue;
        var pv = pow10(k, B); if (typeof pv === 'string') continue; // (TOURNEY: powers of the base, XIII-B-10)
        put(m, 0, { v: pv, s: POBK[k], p: 4, o: 0 });
        if (RU.ud) put(m, 0, { v: { n: -pv.n, d: pv.d }, s: NPOBK[k], p: 4, o: 0 }); // TOURNEY: manual F17
      }
    }
    function dp(S) {
      var key = cfg + '#' + S, m = base.memo.get(key);
      if (m) return m;
      if (nowMs() > base.deadline) throw TIMEOUT;
      m = new Map();
      if (S.length === 1) leaves(m, S);
      else {
        if (glue && S.length === 2 && isDigit(S[0]) && isDigit(S[1]) && leafV(S[0]) < B && leafV(S[1]) < B) { // Two-digit Numerals / Base m: the two cubes glued, both orders
          put(m, 0, { v: { n: leafV(S[0]) * B + leafV(S[1]), d: 1 }, s: S, p: 4, o: 0 });
          if (S[0] !== S[1]) put(m, 0, { v: { n: leafV(S[1]) * B + leafV(S[0]), d: 1 }, s: S[1] + S[0], p: 4, o: 0 });
        }
        var sp = splits(S);
        for (var si = 0; si < sp.length; si++) {
          var A = sp[si][0], Bs = sp[si][1];
          var mA = dp(A), mB = dp(Bs);
          // Exponent card: an exponent-colour digit right after a number raises it to that power
          if (RU.expo && Bs.length === 1 && exOf(Bs) >= 0 && exOf(Bs) < B) { // (TOURNEY: < B, manual A27)
            var ed = { n: exOf(Bs), d: 1 };
            mA.forEach(function (vmA, uA) {
              vmA.forEach(function (ea) {
                var r = opCore('^', ea.v, ed, fr, RU);
                if (typeof r !== 'string') put(m, uA, { v: r, s: wrap(ea, 4) + Bs, p: 4, o: ea.o + 1 });
              });
            });
          }
          for (var oi = 0; oi < binOps.length; oi++) {
            var o = binOps[oi], cubeT = OPDEF[o].cube;
            if (OPDEF[o].comm && A > Bs) continue;
            var oA = o === '%' ? pctMap(A) : mA, oB = o === '%' ? pctMap(Bs) : mB;
            oA.forEach(function (vmA, uA) {
              oB.forEach(function (vmB, uB) {
                var u = addU(uA, uB);
                if (u < 0) return;
                if (idx[cubeT] !== undefined) { u = addU(u, unit[cubeT]); if (u < 0) return; }
                var out = m.get(u); if (!out) { out = new Map(); m.set(u, out); }
                vmA.forEach(function (ea) {
                  vmB.forEach(function (eb) {
                    if (((++tick) & 4095) === 0 && nowMs() > base.deadline) throw TIMEOUT;
                    var r = opCore(o, ea.v, eb.v, fr, RU);
                    if (typeof r === 'string') return;
                    var oc = ea.o + eb.o + 1, k = vkey(r, oc);
                    if (!out.has(k)) { var e = combine(o, ea, eb, r); e.o = oc; out.set(k, e); }
                  });
                });
              });
            });
          }
        }
      }
      // Decimal Point: these digits (at most three) and a ^ cube as the point, in any order
      if (RU.dec && S.length <= 3 && S.split('').every(isDigit) && idx['^'] !== undefined) {
        var uD = useOp(0, '^');
        if (uD >= 0) perms(S).forEach(function (P) {
          for (var at = 0; at <= P.length; at++) {
            var v = frac(parseInt(P, 10), Math.pow(10, P.length - at));
            if (typeof v === 'string' || (v.d !== 1 && !fr)) continue;
            put(m, uD, { v: v, s: P.slice(0, at) + '.' + P.slice(at), p: 4, o: 0 });
          }
        });
      }
      if (hasRoot || unOps.length) {
        // one-number operations on everything found so far: √ (no index cube), and with the Middle cards
        // Number of Factors / Smallest Prime (× in front) and factorial (!). They may stack (√√16, ××12, 3!!)
        // as far as the cubes (and the two ! signs) allow. Multiple Operations: √ may repeat, up to 3 deep.
        var reps = (RU.div && multi) ? 12 : (unOps.length ? 3 : (multi ? 3 : 1)); // (TOURNEY: with Multiple Operations a one-number op may repeat without limit (manual F5); the loop stops when nothing new appears)
        var pre = unOps.filter(function (o) { return OPDEF[o].kind === 'pre'; }), post = unOps.filter(function (o) { return OPDEF[o].kind === 'post'; });
        for (var rep = 0; rep < reps; rep++) {
          if (RU.div && nowMs() > base.deadline) throw TIMEOUT; // (TOURNEY: deep repeats with Multiple Operations keep to the time cap)
          var adds = [];
          m.forEach(function (vm, u) {
            if (hasRoot) {
              var u2 = useOp(u, 'r');
              if (u2 >= 0) vm.forEach(function (e) {
                if (!RU.mpow && (e.v.d !== 1 || e.v.n < 0)) return;
                var r = opCore('r', TWO, e.v, false, RU); // (TOURNEY: Middle list: square roots of fractions too, √(1/4) = 1/2)
                if (typeof r !== 'string') adds.push([u2, { v: r, s: 'r' + wrap(e, 4), p: preP, o: e.o + 1 }]);
              });
            }
            pre.forEach(function (o) {
              var u3 = useOp(u, OPDEF[o].cube); if (u3 < 0) return;
              vm.forEach(function (e) { var r = unCore(o, e.v, fr, RU); if (typeof r !== 'string') adds.push([u3, { v: r, s: o + wrap(e, 4), p: preP, o: e.o + 1 }]); });
            });
            post.forEach(function (o) {
              var u4 = useOp(u, OPDEF[o].cube); if (u4 < 0) return;
              vm.forEach(function (e) { var r = unCore(o, e.v, fr, RU); if (typeof r !== 'string') adds.push([u4, { v: r, s: wrap(e, 4) + o, p: 4, o: e.o + 1 }]); });
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
    // Percent: next to % a two-digit numeral is allowed even in a Solution (XIII-A-14)
    function pctMap(S) {
      var m = dp(S);
      if (S.length !== 2 || !isDigit(S[0]) || !isDigit(S[1])) return m;
      var key = cfg + '#%' + S, g = base.memo.get(key);
      if (g) return g;
      g = new Map(); m.forEach(function (vm, u) { g.set(u, new Map(vm)); });
      put(g, 0, { v: { n: leafV(S[0]) * 10 + leafV(S[1]), d: 1 }, s: S, p: 4, o: 0 });
      if (S[0] !== S[1]) put(g, 0, { v: { n: leafV(S[1]) * 10 + leafV(S[0]), d: 1 }, s: S[1] + S[0], p: 4, o: 0 });
      base.memo.set(key, g);
      return g;
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
        if (must && leafSym(must) && (T.split(must).length - 1) !== availD[must]) continue;
        var m = dp(T), hit = null;
        m.forEach(function (vm, u) {
          if (hit) return;
          if (T.length === 1 && (idx['!'] === undefined ? u : u - dec(u, idx['!']) * radix[idx['!']]) === 0) return; // single cube: not a Solution (a ! is not a cube)
          for (var t in reqO) if (dec(u, idx[t]) < reqO[t]) return;
          if (must && !leafSym(must) && dec(u, idx[must]) !== caps[idx[must]]) return;
          if (RU.multk) { vm.forEach(function (e) { if (!hit && (!three || e.o >= 3) && multOk(e.v, base.goal, RU.k)) hit = e; }); return; }
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
  // With a Middle card it also tries Goals that use the card (an upside-down cube, an average, a
  // factorial, …) so a creature's Goal can show the card off.
  function goalIdeas(syms, opts) {
    opts = opts || {};
    var RU = rulesOf(opts.fractions);
    var leafs = syms.filter(function (s) { return isDigit(s) || exOf(s) >= 0 || bigIdx(s) >= 0; }); // (BONUS: + the big-number die)
    var digits = leafs.map(function (s) { return exOf(s) >= 0 ? String(exOf(s)) : s; });
    var ops = uniq(syms.filter(function (s) { return !isDigit(s) && exOf(s) < 0 && s !== 'r' && bigIdx(s) < 0 && !(isBonusOp(s) && OPDEF[s].kind !== 'bin'); })); // (BONUS: one-number Power ops below)
    if (RU.avg) ops = ops.map(function (o) { return o === '+' ? 'a' : o; });
    var have = countMap(syms.map(function (s) { return exOf(s) >= 0 ? String(exOf(s)) : s; }));
    var haveEx = countMap(syms.filter(function (s) { return exOf(s) >= 0; }));
    var out = [], seen = {};
    function add(t) {
      var key = t.join('');
      if (seen[key]) return; seen[key] = 1;
      var need = {}, needEx = {};
      t.forEach(function (s) {
        if (exOf(s) >= 0) { needEx[s] = (needEx[s] || 0) + 1; }
        var c = cubeOf(s); if (c) need[c] = (need[c] || 0) + 1;
      });
      for (var k in need) if ((have[k] || 0) < need[k]) return;
      for (var e in needEx) if ((haveEx[e] || 0) < needEx[e]) return;
      if (bangsIn(t) > 2) return;
      var ev = evaluate(t, { multiDigit: true, fractions: opts.fractions, inGoal: true });
      if (!ev.ok) return;
      if (RU.multk && Math.abs(ev.value.n) > 1000 * ev.value.d) return;
      out.push({ tokens: t, value: ev.value });
    }
    uniq(digits).forEach(function (a) { add([a]); });
    digits.forEach(function (a) { digits.forEach(function (b) { if (a !== '0') add([a, b]); }); });
    digits.forEach(function (a) { ops.forEach(function (o) { digits.forEach(function (b) { add([a, o, b]); }); }); });
    // BONUS: Goals with the Power die's one-number operation (n!, x², √x, double, …)
    uniq(syms.filter(function (s) { return isBonusOp(s) && OPDEF[s].kind !== 'bin'; })).forEach(function (o) {
      var post = OPDEF[o].kind === 'post', D2 = uniq(digits), bins = ops.filter(function (x) { return OPDEF[x] && OPDEF[x].kind === 'bin'; });
      D2.forEach(function (a) {
        add(post ? [a, o] : [o, a]);
        D2.forEach(function (b) {
          add(post ? [a, b, o] : [o, a, b]);
          bins.forEach(function (bn) { if (post) { add([a, o, bn, b]); add([a, bn, b, o]); } else { add([o, a, bn, b]); add([a, bn, o, b]); } });
        });
      });
    });
    if (!RU.any) return out;
    var D = uniq(digits).filter(isDigit); // (BONUS: card ideas turn digit cubes only, never the big-number die)
    var binOnly = ops.filter(function (o) { return OPDEF[o] && OPDEF[o].kind === 'bin' && o !== 'f' && o !== 'p'; });
    D.forEach(function (a) {
      D.forEach(function (b) {
        if (RU.ud && b !== '0') { binOnly.forEach(function (o) { add([a, o, UD[+b]]); }); add([UD[+a]]); }
        if (RU.sw && b !== '0' && RU.fr) binOnly.forEach(function (o) { add([a, o, SW[+b]]); });
        if (RU.pob && b === '1') { add(['T']); add(['H']); binOnly.forEach(function (o) { add([a, o, 'T']); add([a, o, 'H']); }); }
        if (RU.fact) { add([a, '!']); binOnly.forEach(function (o) { add([a, o, b, '!']); add([a, '!', o, b]); }); }
        if (RU.nfac || RU.sprime) { var u = RU.nfac ? 'f' : 'p'; add([u, a]); add([u, a, b]); binOnly.forEach(function (o) { add([a, o, u, b]); }); }
        if (RU.dec && b !== a) { add([a, '.', b]); add(['.', a, b]); }
        if (RU.lcm) add([a, 'l', b]);
        if (RU.gcf) add([a, 'g', b]);
        if (RU.pct) { add([a, b, '%', a]); add([a, '%', b]); }
      });
    });
    if (RU.expo) leafs.filter(function (s) { return exOf(s) >= 0; }).forEach(function (e) { D.forEach(function (a) { add([a, e]); }); });
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

  // ---- Solver symbols -> real cubes ----
  // list: solver tokens (symbols). cubes: the cubes the Solution may use, each {id, s, zone, color?, locked?},
  // in the order to prefer them (Required, then Permitted, then Resources). m: the math mode.
  // Returns tokens {s, id} (id -1 if no cube fits), with '(' ')' and '!' left as plain strings.
  // A turned cube keeps its symbol (UD/SW/POB/EX) and points at the digit cube it really is; an average,
  // a percent, LCM, GCF, # factors, smallest prime and a decimal point point at the cube they use.
  // Exponent card: exponents are given exponent-colour cubes first; plain digits then take cubes zone by
  // zone (Required first), plain-coloured before exponent-coloured within a zone, so Required cubes stay covered.
  // Multiple Operations: an operation symbol with no fresh cube re-uses the one already used for it
  // (Required cubes first, so every Required cube is used).
  function cubeTokens(list, cubes, m) {
    var RU = rulesOf(m), used = {}, again = {}, out = new Array(list.length);
    var free = (cubes || []).filter(function (c) { return !c.locked; });
    var rank = { required: 0, permitted: 1 };
    function zr(c) { return rank[c.zone] !== undefined ? rank[c.zone] : 2; }
    function colored(c) { return !!(RU.eids && RU.eids.indexOf(c.id) >= 0); }
    function pick(test, pref) {
      var best = null;
      free.forEach(function (c, i) {
        if (used[c.id] || !test(c)) return;
        var k = zr(c) * 1000 + (pref ? pref(c) : 0) * 100 + i * 0.001;
        if (!best || k < best.k) best = { c: c, k: k };
      });
      return best && best.c;
    }
    // pass 1: exponents (they need a cube of the Exponent colour)
    list.forEach(function (s, i) {
      if (exOf(s) < 0) return;
      var d = String(exOf(s)), c = pick(function (x) { return x.s === d && colored(x); });
      if (c) used[c.id] = 1;
      out[i] = { s: s, id: c ? c.id : -1 };
    });
    // pass 2: everything else
    list.forEach(function (s, i) {
      if (out[i]) return;
      if (s === '(' || s === ')') { out[i] = s; return; }
      var cs = cubeOf(s);
      if (cs === null) { out[i] = s; return; } // '!' is written in, not a cube
      var c = null;
      if (RU.multi && !isNumSym(s)) { // (BONUS: isNumSym: the big-number die is a number, never re-used)
        c = pick(function (x) { return x.s === cs && x.zone === 'required'; });
        if (!c && again[cs] !== undefined) { out[i] = { s: s, id: again[cs] }; return; }
      }
      if (!c) c = pick(function (x) { return x.s === cs; }, RU.expo && isDigit(cs) ? function (x) { return colored(x) ? 1 : 0; } : null);
      if (!c) { out[i] = { s: s, id: -1 }; return; }
      used[c.id] = 1; again[cs] = c.id;
      out[i] = { s: s, id: c.id };
    });
    return out;
  }
  // Exponent card: how many digits of the chosen colour each zone holds, for the math mode's `ex`.
  // cubes: [{id, s, zone, color, locked}]; color: 'red' | 'blue' | 'green' | 'black'.
  function expCounts(cubes, color) {
    var ex = { req: {}, perm: {}, res: {} }, key = { required: 'req', permitted: 'perm', resources: 'res' };
    (cubes || []).forEach(function (c) {
      if (c.color !== color || c.locked || !isDigit(c.s) || !key[c.zone]) return;
      var z = ex[key[c.zone]]; z[c.s] = (z[c.s] || 0) + 1;
    });
    return ex;
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
    frac: F, eqF: eqF, fmt: fmt, isDigit: isDigit, opCore: opCore, unCore: unCore,
    evaluate: evaluate, checkGoal: checkGoal, checkSolution: checkSolution, cubeCount: cubeCount,
    solve: solve, goalIdeas: goalIdeas, rng: rng, roll: roll, uniq: uniq,
    VARIATIONS: VARIATIONS, mathMode: mathMode, withGoal: withGoal, fracOn: fracOn, varsOf: varsOf, rulesOf: rulesOf, goalAt: goalAt,
    // Middle tier
    OPDEF: OPDEF, UD: UD, SW: SW, EX: EX, POB: POB, POBK: POBK, cubeOf: cubeOf, orient: orient, withOrient: withOrient, isNumSym: isNumSym,
    exOf: exOf, pobOf: pobOf, resolve: resolve, multOk: multOk, tagExp: tagExp, bangsIn: bangsIn, isPrime: isPrime, numFactors: numFactors,
    cubeTokens: cubeTokens, expCounts: expCounts,
    // TOURNEY: several cards at once
    NS: NS, NPOB: NPOB, NPOBK: NPOBK, nsOf: nsOf, npobOf: npobOf, goalVals: goalVals, powQ: powQ,
    // BONUS dice (house rule)
    BIG: BIG, BIG_FACES: BIG_FACES, POWER_FACES: POWER_FACES, bigOf: bigOf, bigIdx: bigIdx, isBonusOp: isBonusOp, digitSum: digitSum
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
