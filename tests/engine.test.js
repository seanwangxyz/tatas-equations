// Unit tests for the Tata's Equations math engine.
// Run with:  node tests/engine.test.js
// The engine lives in js/engine.js between /*ENGINE-START*/ and /*ENGINE-END*/,
// so these tests check exactly the code the game runs.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('Engine markers not found'); process.exit(1); }
const Eq = new Function(m[1] + '\nreturn Eq;')();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; } else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const t = s => s.split('');               // "3+4*2" -> tokens
const F = (n, d = 1) => Eq.frac(n, d);
function val(expr, opts) { const r = Eq.evaluate(t(expr), opts); return r.ok ? Eq.fmt(r.value) : 'ERR:' + r.code; }

// ---------------- Evaluator: hand-checked cases ----------------
const cases = [
  // [expression (internal symbols: * / ^ r), options, expected]
  ['3+4*2', {}, '11'],                      // order of operations: × before +
  ['(3+4)*2', {}, '14'],                    // parentheses first
  ['8-3-2', {}, '3'],                       // left to right
  ['8-(3-2)', {}, '7'],
  ['2^3^2', {}, '512'],                     // powers go right to left: 2^(3^2)
  ['(2^3)^2', {}, '64'],
  ['5/0', {}, 'ERR:divzero'],               // division by zero
  ['5/(3-3)', {}, 'ERR:divzero'],
  ['0/5', {}, '0'],
  ['7/2', {}, 'ERR:fraction'],              // fractions locked
  ['7/2', { fractions: true }, '3 1/2'],    // exact fraction
  ['1/3+1/6', { fractions: true }, '1/2'],  // exact: no 0.49999
  ['(1/3)*3', { fractions: true }, '1'],
  ['2-5', {}, '−3'],                        // negative results are fine
  ['-3', {}, 'ERR:sign'],                   // − can't be a negative sign
  ['4*-2', {}, 'ERR:sign'],
  ['+7', {}, 'ERR:sign'],
  ['23', {}, 'ERR:concat'],                 // concatenation in a Solution
  ['2(3)', {}, 'ERR:missingop'],
  ['23', { multiDigit: true }, '23'],       // two-digit numeral OK in Goal
  ['123', { multiDigit: true }, 'ERR:threedigit'],
  ['r9', {}, '3'],                          // √9
  ['3r8', {}, '2'],                         // cube root of 8
  ['4*r9', {}, '12'],                       // 4 × √9
  ['r4+5', {}, '7'],                        // √ applies to just the next number
  ['r(4+5)', {}, '3'],
  ['r5', {}, 'ERR:rootnotwhole'],           // Elementary: root must be whole
  ['0r4', {}, 'ERR:rootindex'],             // 0th root undefined
  ['r(2-6)', {}, 'ERR:rootwhole'],          // root of a negative
  ['0^0', {}, 'ERR:zerozero'],
  ['7^0', {}, '1'],
  ['0^9', {}, '0'],
  ['2^(1-3)', {}, 'ERR:powwhole'],          // Elementary: whole exponent
  ['(2-5)^4', {}, 'ERR:powwhole'],
  ['9^9', {}, 'ERR:big'],
  ['(3+4', {}, 'ERR:paren'],
  ['3+4)', {}, 'ERR:paren'],
  ['()', {}, 'ERR:emptyparen'],
  ['3+', {}, 'ERR:incomplete'],
  ['*3', {}, 'ERR:opstart'],
  ['3rr9', {}, 'ERR:rootnotwhole'],         // cube root of √9 = cube root of 3
  ['(1+1)r(3*3)', {}, '3'],
];
cases.forEach(([e, o, want]) => { const got = val(e, o); ok(`evaluate ${e} ${JSON.stringify(o)} → ${want}`, got === want, got); });

// ---------------- Validator ----------------
// A small mat: ids 1..n with zones
function mat(spec) { // spec: [[id, sym, zone], ...]
  const z = {}, s = {};
  spec.forEach(([id, sy, zo]) => { z[id] = zo; s[id] = sy; });
  return { zone: id => z[id], label: id => Eq.SHOW[s[id]] || s[id], sym: s, required: spec.filter(x => x[2] === 'required').map(x => x[0]) };
}
function sol(M, list) { // list like [1,'(',2,')'] using ids
  return list.map(x => typeof x === 'number' ? { s: M.sym[x], id: x } : x);
}
{
  const M = mat([[1, '3', 'required'], [2, '+', 'permitted'], [3, '4', 'permitted'], [4, '2', 'forbidden'], [5, '*', 'resources'], [6, '2', 'resources'], [7, '-', 'resources']]);
  const ctx = (mode, goal) => ({ goal: F(goal), zone: M.zone, required: M.required, mode, label: M.label });
  let r = Eq.checkSolution(sol(M, [1, 2, 3]), ctx('now', 7));
  ok('valid 3+4=7 using Required 3', r.ok, r.reasons);
  r = Eq.checkSolution(sol(M, [3, 2, 3]), ctx('now', 8));
  ok('same cube twice is rejected', !r.ok);
  r = Eq.checkSolution(sol(M, [3]), ctx('now', 4));
  ok('one cube is not a Solution', !r.ok && r.reasons.some(x => /two cubes/.test(x)), r.reasons);
  r = Eq.checkSolution(sol(M, [3, 2, 4]), ctx('now', 6));
  ok('Forbidden cube used → rejected; Required missing → rejected', !r.ok && r.reasons.some(x => /Forbidden/.test(x)) && r.reasons.some(x => /Required/.test(x)), r.reasons);
  r = Eq.checkSolution(sol(M, [1, 5, 6]), ctx('now', 6));
  ok('Now: one Resource cube (×2) is not enough — uses two Resources', !r.ok && r.reasons.some(x => /ONE cube/.test(x)), r.reasons);
  r = Eq.checkSolution(sol(M, [1, 5, 6]), ctx('impossible', 6));
  ok('Impossible: Resources count as Permitted', r.ok, r.reasons);
  r = Eq.checkSolution(sol(M, [1, 2, 3, 5, 6]), ctx('impossible', 11));
  ok('3+4×2 = 11 (order of operations)', r.ok, r.reasons);
  r = Eq.checkSolution(sol(M, ['(', 1, 2, 3, ')', 5, 6]), ctx('impossible', 14));
  ok('(3+4)×2 = 14', r.ok, r.reasons);
  r = Eq.checkSolution(sol(M, [1, 3]), ctx('impossible', 34));
  ok('concatenation 3,4 → 34 is rejected', !r.ok && r.reasons.some(x => /two-digit/.test(x)), r.reasons);
  r = Eq.checkSolution(sol(M, [1, 2, 3]), ctx('now', 8));
  ok('wrong value says what it equals', !r.ok && r.reasons.some(x => /equals 7, but the Goal is 8/.test(x)), r.reasons);
}
// Goal checks
ok('Goal 23 legal', Eq.checkGoal(t('23')).ok);
ok('Goal 1+2+3+4 has 7 cubes → illegal', !Eq.checkGoal(t('1+2+3+4')).ok);
ok('Goal 125 illegal', !Eq.checkGoal(t('125')).ok);
ok('Goal 8/0 illegal', !Eq.checkGoal(t('8/0')).ok);
ok('Goal 17*8 = 136', Eq.fmt(Eq.checkGoal(t('17*8')).value) === '136');

// ---------------- Solver ----------------
function solveCheck(name, p, expectFound, fractions) {
  const t0 = Date.now();
  const r = Eq.solve(Object.assign({ timeMs: 1500, fractions }, p));
  const ms = Date.now() - t0;
  ok(name + ` (found=${expectFound})`, r.found === expectFound, r);
  if (r.found) {
    // the solver's answer must pass the evaluator and equal the goal
    const ev = Eq.evaluate(r.tokens, { fractions });
    ok(name + ' — answer re-checks: ' + r.expr, ev.ok && Eq.eqF(ev.value, p.goal), ev);
    // uses all required symbols, and only available symbols
    const cnt = a => a.reduce((m, s) => (m[s] = (m[s] || 0) + 1, m), {});
    const used = cnt(r.tokens.filter(s => s !== '(' && s !== ')'));
    const req = cnt(p.req || []), avail = cnt((p.req || []).concat(p.opt || [], p.res || []));
    ok(name + ' — uses all Required', Object.keys(req).every(k => (used[k] || 0) >= req[k]), { used, req });
    ok(name + ' — uses only available cubes', Object.keys(used).every(k => (avail[k] || 0) >= used[k]), { used, avail });
    if (p.mode === 'now') {
      const base = cnt((p.req || []).concat(p.opt || []));
      let extra = 0; Object.keys(used).forEach(k => extra += Math.max(0, used[k] - (base[k] || 0)));
      ok(name + ' — Now uses ≤1 Resource', extra <= 1, { used, base });
    }
  }
  ok(name + ' — fast (' + ms + 'ms)', ms < 1000);
  return r;
}
solveCheck('7 from 3,+,4', { goal: F(7), req: ['3'], opt: ['+', '4'], mode: 'impossible' }, true);
solveCheck('24 from 3,8,×', { goal: F(24), req: ['3', '8', '*'], opt: [], mode: 'impossible' }, true);
solveCheck('24 needs ×, only + given', { goal: F(24), req: ['3', '8'], opt: ['+'], mode: 'impossible' }, false);
solveCheck('Required − must be used: 10 = 6+5−1', { goal: F(10), req: ['-'], opt: ['6', '5', '1', '+', '+'], mode: 'impossible' }, true);
solveCheck('Now: needs one Resource cube', { goal: F(9), req: ['4'], opt: ['+'], res: ['5', '7', '-'], mode: 'now' }, true);
solveCheck('Now: needs two Resource cubes → not found', { goal: F(9), req: ['4'], opt: [], res: ['5', '+', '7'], mode: 'now' }, false);
solveCheck('√ unary: 3 = √9 (two cubes)', { goal: F(3), req: ['r'], opt: ['9'], mode: 'impossible' }, true);
solveCheck('cube root: 2 = 3√8', { goal: F(2), req: ['r', '3', '8'], opt: [], mode: 'impossible' }, true);
solveCheck('fraction goal 1/2 needs fractions', { goal: F(1, 2), req: [], opt: ['1', '2', '/'], mode: 'impossible' }, false, false);
solveCheck('fraction goal 1/2 with fractions', { goal: F(1, 2), req: [], opt: ['1', '2', '/'], mode: 'impossible' }, true, true);
solveCheck('only one cube can never be a Solution', { goal: F(5), req: [], opt: ['5'], mode: 'impossible' }, false);
solveCheck('no concatenation: 12 from 1,2 alone', { goal: F(12), req: ['1', '2'], opt: [], mode: 'impossible' }, false);
solveCheck('power: 81 = 9^2 or 3^4', { goal: F(81), req: ['^'], opt: ['3', '4', '9', '2'], mode: 'impossible' }, true);
solveCheck('big mixed pool', { goal: F(47), req: ['7', '*'], opt: ['6', '5', '+', '-', '2', '3', '/', '8', '1'], mode: 'impossible' }, true);
solveCheck('negative goal 0−3 style: −3 = 2−5', { goal: F(-3), req: [], opt: ['2', '5', '-'], mode: 'impossible' }, true);

// Speed on a full random roll (like the AI does)
{
  const rand = Eq.rng(12345);
  let worst = 0;
  for (let k = 0; k < 20; k++) {
    const cubes = Eq.roll(rand).map(c => c.s);
    const goal = F(1 + Math.floor(rand() * 40));
    const t0 = Date.now();
    Eq.solve({ goal, req: [], opt: [], res: cubes, mode: 'impossible', timeMs: 700, maxDigits: 5 });
    worst = Math.max(worst, Date.now() - t0);
  }
  ok('20 random full-roll searches each under 1s (worst ' + worst + 'ms)', worst < 1000);
}

// Roll: 24 cubes, 6 per color, faces from the table
{
  const cubes = Eq.roll(Eq.rng(7));
  ok('roll gives 24 cubes', cubes.length === 24);
  ok('6 of each color', Eq.COLORS.every(c => cubes.filter(x => x.color === c).length === 6));
  ok('faces come from that color', cubes.every(x => Eq.CUBE_FACES[x.color].includes(x.s)));
}

// ---------------- Challenge scoring (PDF section X) ----------------
// players: Challenger = 0, Mover = 1, Third Party = 2
{
  const sc = (kind, wOk, tp, tpPres, tpOk) => Eq.scoreChallenge(kind, 0, 1, tp, wOk, tp === null ? null : { presented: tpPres, ok: tpOk });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const rows = [
    // [label, args, expected {0,1,2}]
    ['2p Now, Challenger right', ['now', true, null], { 0: 6, 1: 2 }],
    ['2p Now, Challenger wrong', ['now', false, null], { 0: 2, 1: 6 }],
    ['2p Impossible, Mover finds one', ['impossible', true, null], { 0: 2, 1: 6 }],
    ['2p Impossible, Mover fails', ['impossible', false, null], { 0: 6, 1: 2 }],
    ['3p Now: both correct → TP 4', ['now', true, 2, true, true], { 0: 6, 1: 2, 2: 4 }],
    ['3p Now: Challenger wrong, TP correct → TP 6, Mover 2', ['now', false, 2, true, true], { 0: 2, 1: 2, 2: 6 }],
    ['3p Now: TP skips, Challenger wrong → TP 6, Mover 6', ['now', false, 2, false, false], { 0: 2, 1: 6, 2: 6 }],
    ['3p Now: TP skips, Challenger right → TP 2', ['now', true, 2, false, false], { 0: 6, 1: 2, 2: 2 }],
    ['3p Now: TP wrong → TP 2', ['now', true, 2, true, false], { 0: 6, 1: 2, 2: 2 }],
    ['3p Impossible: TP correct → TP 6, Challenger 2', ['impossible', false, 2, true, true], { 0: 2, 1: 2, 2: 6 }],
    ['3p Impossible: TP skips, Mover fails → TP 4', ['impossible', false, 2, false, false], { 0: 6, 1: 2, 2: 4 }],
    ['3p Impossible: TP skips, Mover correct → TP 2', ['impossible', true, 2, false, false], { 0: 2, 1: 6, 2: 2 }],
    ['3p Impossible: TP wrong, Mover fails → TP 2, Challenger 6', ['impossible', false, 2, true, false], { 0: 6, 1: 2, 2: 2 }],
  ];
  rows.forEach(([label, args, want]) => { const got = sc(...args); ok('scoring: ' + label, same(got, want), got); });
}

// ---------------- How Many Ways?: what counts as the same way ----------------
{
  const K = (e, fr) => { const r = Eq.wayKey(t(e), { fractions: fr }); return r.ok ? r.key : 'ERR:' + r.code; };
  const H = e => Eq.wayKey(t(e), { fractions: true }).helper;
  const same = [
    ['2+3', '3+2'], ['2*3', '3*2'], ['(2+3)+4', '2+(3+4)'], ['4+2+3', '3+(4+2)'],
    ['9-4+2', '9+2-4'], ['9-(4-2)', '9-4+2'], ['8/4*2', '8*2/4'], ['8/(4/2)', '8/4*2'],
    ['2*(3+4)', '(4+3)*2'], ['(6-1)*2', '2*(6-1)'],
    ['2+3+0', '2+3'], ['2+3-0', '3+2'], ['(2+3)*1', '2+3'], ['(2+3)/1', '2+3'], ['2+3+0*7', '2+3'],
    ['5*(3-2)', '5*1'], ['5+(3-3)', '5*1'], ['2+3+4-4', '2+3'], ['2*3*4/4', '2*3'], ['5^1', '5*1'],
    ['r9', '2r9'], ['1r9', '9*1'],
    ['8-1^3', '8-1'], ['8-1^3', '8-1^4'], ['6+0^2', '6+0'], ['r1+4', '1+4'], ['r0+4', '4+0'], ['7-1*1', '7-1'], ['7-(3-2)*1', '7-(3-2)'],
    ['3^0+6', '9^0+6'], ['4-2^(0+0)', '4-3^0'], ['2/2+3', '3+4/4'], ['5-5+2', '2+0'], ['(3-3)*4+2', '2+0'],
    ['7-(0-2)*7', '7-(0-7)*2'], ['7-(0-2*7)', '7+2*7'], ['0-5', '5*(0-1)'], ['9/(0-3)', '0-9/3'],
  ];
  same.forEach(([a, b]) => ok(`same way: ${a} = ${b}`, K(a, true) === K(b, true) && !/ERR/.test(K(a, true)), [K(a, true), K(b, true)]));
  const diff = [
    ['2+3', '1+4'], ['2+3', '6-1'], ['6-1', '2*3-1'], ['2+2', '2*2'], ['2*(3+4)', '2*3+2*4'],
    ['9-4+2', '9-(4+2)+5'], ['4+3/3', '4+1'], ['3+2/2', '3+2^0'], ['8-1^3', '8-(3-2)'], ['7+2*7', '7*2-7'], ['2^3', '3^2'], ['8-2', '2-8'], ['8/2', '2/8'],
    ['r9', '9'], ['3r8', '8r3'],
  ];
  diff.forEach(([a, b]) => ok(`different ways: ${a} ≠ ${b}`, K(a, true) !== K(b, true), [K(a, true), K(b, true)]));
  ok('helper flag: 2+3+0 has a helper', H('2+3+0') === true);
  ok('helper flag: 5*(3-2) has a helper', H('5*(3-2)') === true);
  ok('helper flag: 3+2 has none', H('3+2') === false);
  ok('helper flag: 9-(4-2) has none', H('9-(4-2)') === false);
  const TR = e => Eq.wayKey(t(e), { fractions: true }).trick;
  ok('trick flag: 3+2/2 and 9^0+6 are tricks, 3+2 is not', TR('3+2/2') && TR('9^0+6') && !TR('3+2'));
  ok('wayKey refuses 5/0', !Eq.wayKey(t('5/0')).ok);
  ok('wayKey refuses 7/2 with fractions locked', Eq.wayKey(t('7/2')).code === 'fraction');
  ok('wayKey refuses 23 (two-digit)', !Eq.wayKey(t('23')).ok);
  ok('wayKey reads cube tokens {s,id}', Eq.wayKey([{ s: '3', id: 4 }, { s: '+', id: 7 }, { s: '2', id: 1 }]).key === K('2+3'));
}

// ---------------- How Many Ways?: enumeration ----------------
{
  const vkey = v => v.n + '/' + v.d;
  const has = (cubes, toks) => { const c = {}; cubes.forEach(s => c[s] = (c[s] || 0) + 1); return toks.every(s => s === '(' || s === ')' || (c[s]-- > 0)); };
  const w6 = Eq.waysFor({ cubes: t('2346+-*'), goal: F(6) });
  ok('ways to make 6 from 2 3 4 6 + − ×: 7 and complete', w6.ways.length === 7 && w6.complete, w6.ways.map(w => w.expr));
  ok('ways list starts with the fewest cubes', w6.ways[0].cubes === 3);
  // every listed way is a real, distinct Solution made of the given cubes, and wayKey agrees with it
  const sets = [['1235+-', false], ['2346+-*', false], ['12345+-*/', false], ['12345+-*/', true], ['0368+-*/', true], ['2349+*^r', false], ['1349r-*', false]];
  sets.forEach(([cs, fr]) => {
    const cubes = t(cs), a = Eq.allWays({ cubes, fractions: fr, timeMs: 5000 });
    let bad = 0, n = 0;
    Object.keys(a.byValue).forEach(k => {
      const keys = {};
      a.byValue[k].forEach(w => {
        n++;
        const ev = Eq.evaluate(w.tokens, { fractions: fr }), wk = Eq.wayKey(w.tokens, { fractions: fr });
        if (!ev.ok || vkey(ev.value) !== k || !wk.ok || wk.key !== w.key || keys[w.key] || w.cubes < 2 || Eq.cubeCount(w.tokens) !== w.cubes || !has(cubes, w.tokens)) bad++;
        keys[w.key] = 1;
      });
    });
    ok(`allWays ${cs}${fr ? ' (fractions)' : ''}: ${n} ways, all valid, distinct and matching wayKey`, a.complete && n > 0 && bad === 0, { bad, n, complete: a.complete });
  });
  // brute force: build every fully-parenthesized expression from the cubes and count distinct keys
  function brute(cs, goal, fr) {
    const D = t(cs).filter(Eq.isDigit), O = t(cs).filter(s => !Eq.isDigit(s)), keys = new Set();
    function trees(leaves) { // leaves: array of strings -> all fully parenthesized trees with '?' op slots in order
      if (leaves.length === 1) return [{ s: leaves[0], k: 0 }];
      const out = [];
      for (let i = 1; i < leaves.length; i++) trees(leaves.slice(0, i)).forEach(L => trees(leaves.slice(i)).forEach(R => out.push({ s: '(' + L.s + '#' + R.s + ')', k: L.k + R.k + 1 })));
      return out;
    }
    function perms(arr, k) { if (k === 0) return [[]]; const out = []; arr.forEach((x, i) => perms(arr.slice(0, i).concat(arr.slice(i + 1)), k - 1).forEach(p => out.push([x].concat(p)))); return out; }
    for (let k = 1; k <= Math.min(D.length, O.length + 1); k++) {
      const dps = new Set(perms(D, k).map(p => p.join(''))), ops = new Set(perms(O, k - 1).map(p => p.join('')));
      dps.forEach(dp => trees(dp.split('')).forEach(tr => ops.forEach(op => {
        let i = 0; const s = tr.s.replace(/#/g, () => op[i++]);
        if (k < 2) return;
        const ev = Eq.evaluate(t(s), { fractions: fr });
        if (ev.ok && Eq.eqF(ev.value, goal)) keys.add(Eq.wayKey(t(s), { fractions: fr }).key);
      })));
    }
    return keys;
  }
  [['1234+-*', 5, false], ['2346+-/', 3, false], ['2346+-/', 3, true], ['0125+-*', 5, false], ['1236+*-', 6, false]].forEach(([cs, g, fr]) => {
    const bk = brute(cs, F(g), fr), w = Eq.waysFor({ cubes: t(cs), goal: F(g), fractions: fr });
    const wk = new Set(w.ways.map(x => x.key)), same = bk.size === wk.size && [...bk].every(k => wk.has(k));
    ok(`brute force agrees: ${cs} make ${g}${fr ? ' (fractions)' : ''} → ${bk.size} ways`, same && w.complete, { brute: bk.size, ways: wk.size });
  });
  // square roots count √x and √√x
  ok('square root: 9 √ makes 3 one way (√9)', Eq.waysFor({ cubes: t('9r'), goal: F(3) }).ways.length === 1);
  const rr = Eq.waysFor({ cubes: t('97+rr'), goal: F(2) }).ways.map(w => w.expr);
  ok('two √ cubes: √√(9+7) = 2 is found', rr.some(e => /rr/.test(e)), rr);
  // the time budget is honoured and reported
  const big = Eq.allWays({ cubes: t('234689+-*/^r'), fractions: true, timeMs: 60 });
  ok('a giant deal stops on time and says it is not complete', !big.complete && big.ms < 400, big.ms);
  const t0 = Date.now(), lv5 = Eq.allWays({ cubes: t('12345+-*/'), fractions: true, timeMs: 2000 });
  ok('a level-5 sized deal (5 digits, 4 operations) finishes quickly', lv5.complete && Date.now() - t0 < 400, Date.now() - t0);
}

// ---------------- Variation cards (Adventurous Equations, PDF section XIII-A) ----------------
{
  const MM = (vars, fr, goal) => Eq.mathMode(!!fr, vars, goal ? t(goal) : null);
  // default: no variation = plain boolean = the old behaviour
  ok('mathMode with no variation is just the fractions boolean', Eq.mathMode(true, []) === true && Eq.mathMode(false) === false);
  ok('unknown variation ids are dropped', Eq.mathMode(false, ['nope']) === false);
  ok('fracOn reads both shapes', Eq.fracOn(true) && !Eq.fracOn(MM(['twodigit'])) && Eq.fracOn(MM(['twodigit'], true)));
  ok('withGoal adds the Goal symbols (and leaves booleans alone)', Eq.withGoal(true, t('10')) === true && Eq.withGoal(MM(['wild0']), [{ s: '1', id: 3 }, '(', { s: '0', id: 4 }, ')']).goal.join('') === '10');

  // --- evaluate ---
  const vcases = [
    ['23', { fractions: MM(['twodigit']) }, '23'],          // Two-digit: glued digits in a Solution
    ['23+4', { fractions: MM(['twodigit']) }, '27'],
    ['123', { fractions: MM(['twodigit']) }, 'ERR:threedigit2'],
    ['23', { fractions: MM(['threeops']) }, 'ERR:concat'],   // other cards don't allow gluing
    ['7m3', { fractions: MM(['remainder']) }, '1'],          // 7 ÷ 3 = 2 remainder 1
    ['15m2', { fractions: MM(['remainder', 'twodigit']) }, '1'],
    ['3m7', { fractions: MM(['remainder']) }, '3'],          // A < B: the remainder is A
    ['8m8', { fractions: MM(['remainder']) }, '0'],
    ['2+7m3', { fractions: MM(['remainder']) }, '3'],        // m sits with × ÷
    ['(2+7)m4', { fractions: MM(['remainder']) }, '1'],
    ['0m3', { fractions: MM(['remainder']) }, 'ERR:remwhole'], // A must be a counting number
    ['7m0', { fractions: MM(['remainder']) }, 'ERR:remwhole'],
    ['(1-3)m2', { fractions: MM(['remainder']) }, 'ERR:remwhole'],
    ['7m3', {}, 'ERR:syntax'],                               // no Remainder card: m is not a symbol
    ['5+0', { fractions: MM(['wild0']), wild: 4 }, '9'],     // 0 Wild: 0 stands for 4
    ['5+0', { fractions: MM(['wild0']) }, '5'],              // default: 0 means 0
    ['5+0', { wild: 4 }, '5'],                               // wild ignored without the card
    ['10', { fractions: MM(['wild0']), wild: 7, multiDigit: true }, '17'],
    ['0*6/0', { fractions: MM(['wild0']), wild: 3 }, '6'],   // every 0 is the same digit
  ];
  vcases.forEach(([e, o, want]) => { const got = val(e, o); ok(`variation evaluate ${e} ${JSON.stringify(o)} → ${want}`, got === want, got); });
  ok('Remainder is not allowed in a Goal', Eq.evaluate(t('7m3'), { fractions: MM(['remainder']), inGoal: true }).code === 'remgoal');

  // --- Goal check with 0 Wild ---
  const g1 = Eq.checkGoal(t('8/0'), MM(['wild0']));
  ok('0 Wild: Goal 8÷0 is legal (0 can be 1, 2, 4 or 8…) and reads 8÷1 = 8 first', g1.ok && Eq.fmt(g1.value) === '8' && Eq.fmt(g1.wildValues[2]) === '4' && !g1.wildValues[0], g1);
  ok('no 0 Wild: Goal 8÷0 is still illegal', !Eq.checkGoal(t('8/0'), false).ok);
  ok('0 Wild: Goal 10 reads 10 when 0 means 0', Eq.fmt(Eq.checkGoal(t('10'), MM(['wild0'])).value) === '10');

  // --- Solution check ---
  const M = mat([[1, '5', 'required'], [2, '+', 'permitted'], [3, '0', 'permitted'], [4, '3', 'permitted'], [5, '*', 'permitted'], [6, '2', 'resources'], [7, '/', 'permitted'], [8, '1', 'permitted'], [9, '-', 'permitted']]);
  const ctx = (mode, goal, fr) => ({ goal: F(goal), zone: M.zone, required: M.required, mode, label: M.label, fractions: fr });
  let r = Eq.checkSolution(sol(M, [1, 4]), ctx('impossible', 53, MM(['twodigit'])));
  ok('Two-digit: 53 made from 5 and 3 (two cubes)', r.ok, r.reasons);
  r = Eq.checkSolution(sol(M, [1, 4]), ctx('impossible', 53, false));
  ok('no card: 5,3 glued is rejected', !r.ok);
  r = Eq.checkSolution(sol(M, [1, 2, 4, 5, 8, 9, 4]), ctx('impossible', 7, MM(['threeops'])));
  ok('the same digit cube twice is still rejected with a card on', !r.ok && r.reasons.some(x => /twice/.test(x)), r.reasons);
  r = Eq.checkSolution(sol(M, [1, 2, 4]), ctx('impossible', 8, MM(['threeops'])));
  ok('Three-operation: 5+3 has only 1 operation → not correct', !r.ok && r.reasons.some(x => /at least 3 operation/.test(x)), r.reasons);
  r = Eq.checkSolution(sol(M, [1, 2, 4, 5, 8, 9, 8]), ctx('impossible', 7, MM(['threeops'])));
  ok('digit cube 1 used twice is rejected', !r.ok);
  r = Eq.checkSolution(sol(M, [1, 2, 4, 5, 8, 9, 3]), ctx('impossible', 8, MM(['threeops'])));
  ok('Three-operation: 5+3×1−0 = 8 has 3 operations → correct', r.ok && r.ops === 3, r);
  r = Eq.checkSolution(sol(M, [1, 2, 4, 2, 8]), ctx('impossible', 9, MM(['multiops'])));
  ok('Multiple Operations: 5+3+1 uses the + cube twice → correct', r.ok && r.cubes === 4, r);
  r = Eq.checkSolution(sol(M, [1, 2, 4, 2, 8]), ctx('impossible', 9, false));
  ok('no card: the + cube twice is rejected', !r.ok && r.reasons.some(x => /twice/.test(x)), r.reasons);
  r = Eq.checkSolution([{ s: '5', id: 1 }, { s: 'm', id: 7 }, { s: '3', id: 4 }], ctx('impossible', 2, MM(['remainder'])));
  ok('Remainder: 5 (sideways ÷) 3 = 2', r.ok, r.reasons);
  r = Eq.checkSolution([{ s: '5', id: 1 }, { s: 'm', id: 7 }, { s: '3', id: 4 }], ctx('impossible', 2, false));
  ok('no card: a sideways ÷ is not allowed', !r.ok);
  r = Eq.checkSolution(sol(M, [1, 2, 3]), ctx('impossible', 8, MM(['wild0'])));
  ok('0 Wild: 5+0 = 8 when 0 means 3, and says so', r.ok && r.wildAs === 3, r);
  r = Eq.checkSolution(sol(M, [1, 2, 3]), ctx('impossible', 15, MM(['wild0'])));
  ok('0 Wild: 5+0 can never be 15 (0 is at most 9)', !r.ok && r.reasons.some(x => /every digit/.test(x)), r.reasons);
  // Goal "10" with 0 Wild: the Goal's 0 and the Solution's 0 are the same digit
  const wg = (g) => Eq.mathMode(false, ['wild0'], t(g));
  r = Eq.checkSolution(sol(M, [1, 5, 4]), Object.assign(ctx('impossible', 10, wg('10')), {}));
  ok('0 Wild Goal 10: 5×3 = 15 works when the Goal 0 means 5', r.ok && r.wildAs === 5, r);
  r = Eq.checkSolution(sol(M, [1, 2, 3]), ctx('impossible', 10, wg('10')));
  ok('0 Wild Goal 10: 5+0 never works (5+w ≠ 10+w)', !r.ok, r.reasons);
  r = Eq.checkSolution(sol(M, [1, 2, 3]), ctx('impossible', 10, MM(['wild0'])));
  ok('0 Wild Goal 10 read as just 10 if the Goal symbols are unknown: 5+0 with 0=5', r.ok && r.wildAs === 5, r);

  // --- Solver: hand-made cases ---
  const S = (name, p, want, fr) => solveCheckV(name, p, want, fr);
  function solveCheckV(name, p, want, fr) {
    const r = Eq.solve(Object.assign({ timeMs: 1500, fractions: fr }, p));
    ok(name + ` (found=${want})`, r.found === want, r);
    if (r.found) {
      const RU = Eq.rulesOf(fr);
      const ev = Eq.evaluate(r.tokens, { fractions: fr, wild: r.wild });
      const goal = RU.goal && RU.goal.includes('0') ? Eq.goalAt(RU.goal, r.wild, fr) : p.goal;
      ok(name + ' — answer re-checks: ' + r.expr + (r.wild != null ? ' (0=' + r.wild + ')' : ''), ev.ok && goal && Eq.eqF(ev.value, goal), ev);
      if (RU.three) ok(name + ' — has 3+ operations', r.tokens.filter(s => !Eq.isDigit(s) && s !== '(' && s !== ')').length >= 3, r.tokens);
    }
    return r;
  }
  S('Two-digit: 53 from 5, 3', { goal: F(53), req: ['5', '3'], opt: [], mode: 'impossible' }, true, MM(['twodigit']));
  S('Two-digit: 26 can not be made from 2, 3, 1 and one +', { goal: F(26), req: [], opt: ['2', '3', '+', '1'], mode: 'impossible' }, false, MM(['twodigit']));
  S('Two-digit: 24 = 23+1', { goal: F(24), req: [], opt: ['2', '3', '+', '1'], mode: 'impossible' }, true, MM(['twodigit']));
  S('no card: 24 from 2,3,+,1 is impossible', { goal: F(24), req: [], opt: ['2', '3', '+', '1'], mode: 'impossible' }, false, false);
  S('Three-operation: 6 from 1,2,3,+,+ needs 3 ops → no', { goal: F(6), req: [], opt: ['1', '2', '3', '+', '+'], mode: 'impossible' }, false, MM(['threeops']));
  S('Three-operation: 6 = 1+2+3×1? uses 4 digits: 1,2,3,1,+,+,*', { goal: F(6), req: [], opt: ['1', '2', '3', '1', '+', '+', '*'], mode: 'impossible' }, true, MM(['threeops']));
  S('Three-operation: √9+√4 = 5 has 3 operation signs', { goal: F(5), req: [], opt: ['9', '4', '+', 'r', 'r'], mode: 'impossible' }, true, MM(['threeops']));
  S('Multiple Operations: 1+2+3 = 6 with one + cube', { goal: F(6), req: ['1', '2', '3'], opt: ['+'], mode: 'impossible' }, true, MM(['multiops']));
  S('no card: 1+2+3 needs two + cubes', { goal: F(6), req: ['1', '2', '3'], opt: ['+'], mode: 'impossible' }, false, false);
  S('Multiple Operations: 2×3×4 = 24 with one Required ×', { goal: F(24), req: ['*'], opt: ['2', '3', '4'], mode: 'impossible' }, true, MM(['multiops']));
  S('Multiple Operations: √√(8×2) = 2 with one √', { goal: F(2), req: ['r', '8', '2', '*'], opt: [], mode: 'impossible' }, true, MM(['multiops']));
  S('Multiple Operations + Now: the Resource + may repeat', { goal: F(6), req: ['1', '2', '3'], opt: [], res: ['+', '7'], mode: 'now' }, true, MM(['multiops']));
  S('Remainder: 1 = 7 (sideways ÷) 3', { goal: F(1), req: ['7', '3', '/'], opt: [], mode: 'impossible' }, true, MM(['remainder']));
  S('no card: 7,3,÷ never makes 1', { goal: F(1), req: ['7', '3', '/'], opt: [], mode: 'impossible' }, false, false);
  S('Remainder and ÷ from two cubes: (8÷2)m3 = 1 ', { goal: F(1), req: ['8', '2', '3', '/', '/'], opt: [], mode: 'impossible' }, true, MM(['remainder']));
  S('0 Wild: 8 = 5+0 (0 means 3)', { goal: F(8), req: ['5', '0', '+'], opt: [], mode: 'impossible' }, true, MM(['wild0']));
  S('no card: 5+0 is 5, not 8', { goal: F(8), req: ['5', '0', '+'], opt: [], mode: 'impossible' }, false, false);
  S('0 Wild: two 0s are the same digit: 0+0 = 7 is impossible', { goal: F(7), req: ['0', '0', '+'], opt: [], mode: 'impossible' }, false, MM(['wild0']));
  S('0 Wild: 0+0 = 8 (both 4)', { goal: F(8), req: ['0', '0', '+'], opt: [], mode: 'impossible' }, true, MM(['wild0']));
  S('0 Wild Goal 10: 5×3 (Goal 0 = 5)', { goal: F(10), req: ['5', '3', '*'], opt: [], mode: 'impossible' }, true, wg('10'));
  S('0 Wild Goal 10: 5+0 never', { goal: F(10), req: ['5', '0', '+'], opt: [], mode: 'impossible' }, false, wg('10'));
  S('0 Wild Goal 8÷0 (illegal when 0 = 0): 2+2 with 0 = 2', { goal: F(8), req: ['2', '2', '+'], opt: [], mode: 'impossible' }, true, wg('8/0'));
  S('0 Wild + Two-digit: 35 = 0 and 5 glued, 0 meaning 3', { goal: F(35), req: ['0', '5'], opt: [], mode: 'impossible' }, true, MM(['wild0', 'twodigit']));

  // --- Solver agrees with brute force on small cube sets ---
  // brute: build every fully parenthesized expression from a sub-multiset of the cubes (Required
  // always in), evaluate it with Eq.evaluate, and collect every value it can make.
  function bruteVals(req, opt, fr, w) {
    const RU = Eq.rulesOf(fr), all = req.concat(opt);
    const availO = {}; all.filter(s => !Eq.isDigit(s)).forEach(s => availO[s] = (availO[s] || 0) + 1);
    const reqO = {}; req.filter(s => !Eq.isDigit(s)).forEach(s => reqO[s] = (reqO[s] || 0) + 1);
    const opTypes = Object.keys(availO).filter(s => s !== 'r');
    if (RU.rem && availO['/']) opTypes.push('m');
    const hasR = !!availO.r, maxRoots = RU.multi ? 3 : (availO.r || 0);
    const memo = {};
    function gen(D) { // D: array of digit symbols (ordered splits handled by trying all subsets)
      const key = D.slice().sort().join('');
      if (memo[key]) return memo[key];
      let out = [];
      if (D.length === 1) out.push({ s: D[0], u: {} });
      if (RU.two && D.length === 2) { out.push({ s: D[0] + D[1], u: {} }); out.push({ s: D[1] + D[0], u: {} }); }
      const n = D.length;
      for (let mask = 1; mask < (1 << n) - 1; mask++) {
        const A = [], B = [];
        for (let i = 0; i < n; i++) (mask & (1 << i) ? A : B).push(D[i]);
        const gA = gen(A), gB = gen(B);
        gA.forEach(a => gB.forEach(b => {
          opTypes.forEach(o => { const u = Object.assign({}, a.u); for (const k in b.u) u[k] = (u[k] || 0) + b.u[k]; const ct = o === 'm' ? '/' : o; u[ct] = (u[ct] || 0) + 1; out.push({ s: '(' + a.s + o + b.s + ')', u }); });
          if (hasR) { const u = Object.assign({}, a.u); for (const k in b.u) u[k] = (u[k] || 0) + b.u[k]; u.r = (u.r || 0) + 1; out.push({ s: '(' + a.s + 'r' + b.s + ')', u }); }
        }));
      }
      if (hasR) { // unary roots, up to maxRoots deep
        let layer = out;
        for (let d = 0; d < maxRoots; d++) { layer = layer.map(e => ({ s: 'r(' + e.s + ')', u: Object.assign({}, e.u, { r: (e.u.r || 0) + 1 }) })); out = out.concat(layer); }
      }
      // keep only what the cube counts allow (Multiple Operations: no limit)
      out = out.filter(e => RU.multi || Object.keys(e.u).every(k => e.u[k] <= (availO[k] || 0)));
      memo[key] = out;
      return out;
    }
    const reqD = req.filter(Eq.isDigit), optD = opt.filter(Eq.isDigit), vals = new Set();
    for (let mask = 0; mask < (1 << optD.length); mask++) {
      const D = reqD.slice(); optD.forEach((d, i) => { if (mask & (1 << i)) D.push(d); });
      if (!D.length) continue;
      gen(D).forEach(e => {
        if (!Object.keys(reqO).every(k => (e.u[k] || 0) >= reqO[k])) return;
        const cubes = D.length + Object.keys(e.u).reduce((a, k) => a + (RU.multi ? Math.min(1, e.u[k]) : e.u[k]), 0);
        if (cubes < 2) return;
        const nOps = Object.keys(e.u).reduce((a, k) => a + e.u[k], 0);
        if (RU.three && nOps < 3) return;
        const ev = Eq.evaluate(t(e.s), { fractions: fr, wild: w });
        if (ev.ok) vals.add(ev.value.n + '/' + ev.value.d);
      });
    }
    return vals;
  }
  const bruteSets = [
    ['twodigit', [], ['1', '2', '3', '+', '-']],
    ['twodigit', ['*'], ['2', '4', '0', '-']],
    ['threeops', [], ['1', '2', '3', '4', '+', '-', '*']],
    ['threeops', [], ['9', '4', '2', '+', 'r', '-']],
    ['multiops', [], ['1', '2', '3', '+', '*']],
    ['multiops', ['-'], ['2', '5', '7', 'r']],
    ['multiops', ['+'], ['1', '2', '3', '4', '*']],
    ['multiops', [], ['2', '8', '*', 'r', '1']],
    ['remainder', [], ['7', '3', '2', '/', '+']],
    ['remainder', ['/'], ['9', '4', '5', '-', '/']],
    ['wild0', [], ['0', '3', '2', '+', '*']],
    ['wild0', ['0'], ['0', '5', '-', '/']],
  ];
  bruteSets.forEach(([v, req, opt]) => {
    const fr = MM([v]);
    const zero = req.concat(opt).includes('0') && v === 'wild0';
    const reach = new Set();
    (zero ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [undefined]).forEach(w => bruteVals(req, opt, fr, w).forEach(k => reach.add(k)));
    let agree = 0, bad = [];
    for (let g = -12; g <= 99; g++) {
      const r = Eq.solve({ goal: F(g), req, opt, mode: 'impossible', fractions: fr, maxDigits: 6, timeMs: 1500 });
      const want = reach.has(g + '/1');
      if (r.found === want && (want || r.complete)) agree++; else bad.push(g);
    }
    ok(`brute force agrees with the solver: ${v}, Required [${req}] + [${opt}] (${reach.size} values)`, bad.length === 0, bad);
  });
  // fractions on as well (Remainder + fractions, Two-digit + fractions)
  [['remainder', ['8', '3', '/', '/', '+']], ['twodigit', ['1', '2', '4', '/', '+']]].forEach(([v, opt]) => {
    const fr = MM([v], true), reach = bruteVals([], opt, fr, undefined);
    let bad = [];
    [...reach].slice(0, 400).forEach(k => { const [n, d] = k.split('/').map(Number); if (!Eq.solve({ goal: F(n, d), req: [], opt, mode: 'impossible', fractions: fr, timeMs: 1500 }).found) bad.push(k); });
    ok(`brute force (fractions): solver finds every value of ${v} [${opt}] (${reach.size})`, bad.length === 0, bad.slice(0, 5));
  });

  // --- default unchanged: the solver gives the same answers with a math mode that has no card ---
  {
    const rand = Eq.rng(99); let same = true;
    for (let k = 0; k < 12; k++) {
      const cubes = Eq.roll(rand).map(c => c.s), goal = F(1 + Math.floor(rand() * 30));
      const a = Eq.solve({ goal, req: [], opt: [], res: cubes, mode: 'impossible', timeMs: 800, maxDigits: 4 });
      const b = Eq.solve({ goal, req: [], opt: [], res: cubes, mode: 'impossible', timeMs: 800, maxDigits: 4, fractions: { fractions: false, vars: [] } });
      if (a.found !== b.found || a.expr !== b.expr) same = false;
    }
    ok('no variation: identical answers on 12 random rolls', same);
  }
  // --- speed: a full roll under each card stays inside the time budget ---
  Eq.VARIATIONS.forEach(v => {
    const rand = Eq.rng(4242); let worst = 0;
    for (let k = 0; k < 8; k++) {
      const cubes = Eq.roll(rand).map(c => c.s), goal = F(1 + Math.floor(rand() * 40));
      const t0 = Date.now();
      Eq.solve({ goal, req: [], opt: [], res: cubes, mode: 'impossible', timeMs: 700, maxDigits: 5, fractions: Eq.mathMode(false, [v], v === 'wild0' ? ['1', '0'] : null) });
      worst = Math.max(worst, Date.now() - t0);
    }
    ok(`${v}: 8 full-roll searches each under 1s (worst ${worst}ms)`, worst < 1000);
  });
}

// ================= MIDDLE-DIVISION VARIATION CARDS (RULES_SUMMARY.md section 6) =================
// Hand-checked cases from the 2026-27 rules PDF (section XIII, examples quoted by letter) and the judges'
// manual (situation numbers like E58). Then: every Solution the solver returns passes checkSolution after
// the game's own cube mapping (Eq.cubeTokens), and on small cube sets an independent brute-force
// enumerator agrees with the solver about which Goals can be made at all. Combinations of cards are not
// supported (one card per shake), so none are tested.
{
  const MM = (v, set, goal, fr) => Eq.mathMode(fr !== false, [v], goal ? t(goal) : null, set);
  const U = Eq.UD, SW = Eq.SW, X = Eq.EX;
  const vals = (cases, label) => cases.forEach(([e, o, want, why]) => { const got = val(e, o); ok(`${label}: ${e} → ${want}${why ? ' (' + why + ')' : ''}`, got === want, got); });
  // checkSolution on plain symbols: every token is its own cube (ids 0..n), all Permitted
  function chkSol(expr, goal, m, extra) {
    const toks = t(expr).map((s, i) => (s === '(' || s === ')' || s === '!') ? s : { s, id: i });
    return Eq.checkSolution(toks, Object.assign({ goal, zone: () => 'permitted', required: [], mode: 'impossible', fractions: m, label: id => String(id) }, extra || {}));
  }
  const found = (m, goal, cubes, extra) => Eq.solve(Object.assign({ goal, req: [], opt: cubes, res: [], mode: 'free', fractions: m, maxDigits: 6, timeMs: 3000 }, extra || {}));

  // ---- Upside-down (XIII-B-2; XIII-A-2 examples) ----
  const ud = { fractions: MM('upside') };
  vals([
    ['6*' + U[2], ud, '−12', 'PDF XIII-A-2: 6 × (−2) = −12'],
    ['6' + U[2], ud, 'ERR:flipnext', 'PDF: "62 is not legal for 6 − 2 or 60 + (−2)"; manual B48, B49, E34'],
    ['7' + U[5], ud, 'ERR:flipnext', 'manual E33: an upside-down 5 is −5, never the minus of 7 − 5'],
    ['2*2+' + U[2], ud, '2', 'manual E32: one 2 upright and another upside-down is fine'],
    ['3+' + U[0], ud, '3', 'manual B52: an upside-down 0 is still 0'],
    ['6*' + U[2], {}, 'ERR:nocard', 'manual E28/B42: a turned cube without the card is undefined'],
  ], 'Upside-down');
  ok('Upside-down solver: 5 × 2 can make −10 only with the card', found(MM('upside'), F(-10), ['5', '*', '2']).found && !Eq.solve({ goal: F(-10), req: [], opt: ['5', '*', '2'], mode: 'free', fractions: true, maxDigits: 6 }).found);
  { const r = found(MM('upside'), F(3), ['5', '*', '2']); ok('Upside-down solver: 5 × 2 cannot make 3 even turned (complete search)', !r.found && r.complete, r); }

  // ---- Sideways (XIII-B-1; XIII-A-1 examples) ----
  const sw = { fractions: MM('sideways') };
  vals([
    ['1+2+' + SW[2], sw, '3 1/2', 'PDF XIII-A-1: 1 + 2 + 1/2 = 3.5'],
    ['1/' + SW[3], sw, '3', 'PDF XIII-A-1: 1 ÷ (1/3) = 3'],
    ['5+' + SW[0], sw, 'ERR:sw0', 'PDF: only a NONZERO number may go sideways'],
    ['6' + SW[3], sw, 'ERR:flipnext', 'manual B45, E30: an operation sign must separate a sideways cube from another digit'],
    ['2*2+' + SW[2], sw, '4 1/2', 'manual E29: one 2 upright, another sideways'],
    ['6*' + SW[3], { fractions: MM('sideways', null, null, false) }, 'ERR:frac2', 'game: with fractions switched off a sideways cube (a fraction) is refused'],
  ], 'Sideways');
  ok('Sideways solver: 6 × 3 makes 2 only with the card (6 × 1/3)', found(MM('sideways'), F(2), ['6', '*', '3']).found && !found(true, F(2), ['6', '*', '3']).found);

  // ---- Average (XIII-B-11; XIII-A-12 examples) ----
  const av = { fractions: MM('average') };
  vals([
    ['7+9', av, '8', 'PDF XIII-A-12 (a)'],
    ['7-(0-9)', av, '16', 'PDF (a): − is untouched'],
    ['5+(4*2)', av, '6 1/2', 'PDF (b)'],
    ['4+6+9', av, '7', 'PDF (c) (4+6)+9 = 7; the game reads left to right'],
    ['4+(6+9)', av, '5 3/4', 'PDF (c) 4+(6+9) = 5.75'],
    ['7a9', av, '8', 'the explicit average symbol'],
    ['7a9', {}, 'ERR:nocard', 'no card: no average'],
    ['3+4', { fractions: MM('average', null, null, false) }, 'ERR:frac2', 'game: fractions off, an average must come out whole'],
  ], 'Average');
  { const c = chkSol('3+5', F(8), MM('average')); ok('Average: 3 + 5 is 4 (average), so it does not equal 8 (PDF VII-C-5-f example (b))', !c.ok && c.value && Eq.fmt(c.value) === '4', c.reasons); }
  ok('Average solver: 3 + 5 makes 4, never 8', found(MM('average'), F(4), ['3', '+', '5']).found && !found(MM('average'), F(8), ['3', '+', '5']).found);

  // ---- Exponent colour (XIII-B-9; VII-B-6-b-iii) ----
  const exm = MM('expo', { ecol: 'red', eids: [1, 2] });
  const ex = { fractions: exm };
  vals([
    ['5' + X[2], ex, '25', 'PDF XIII-B-9 (b): 5² with a blue/red 2'],
    ['5' + X[2] + X[3], ex, '15625', 'PDF (c): (5²)³ = 5⁶, never 5^(2^3)'],
    ['4+3' + X[2], ex, '13', 'PDF VII-B-6-b-iii and manual E50: 4 + (3²), not (4 + 3)²'],
    ['(4+1)' + X[2], ex, '25', 'Appendix A: (4+1)² is a recommended way to write it'],
    [X[2] + '+3', ex, 'ERR:postfix', 'an exponent needs a number in front of it'],
  ], 'Exponent');
  { const g = Eq.checkGoal(['2', '5', X[3]], exm); ok('Exponent: Goal 25 then a red 3 means 25³ (PDF (a)), never a three-digit numeral', g.ok && Eq.fmt(g.value) === '15625'); }
  ok('Exponent: Goal 932 with a plain 2 is a three-digit numeral, illegal (manual B71)', !Eq.checkGoal(t('932'), exm).ok);
  { const c = Eq.checkSolution([{ s: '5', id: 0 }, { s: X[2], id: 9 }], { goal: F(25), zone: () => 'permitted', required: [], mode: 'impossible', fractions: exm }); ok('Exponent: a cube that is not the chosen colour cannot be an exponent', !c.ok && c.reasons.some(r => /colour/.test(r)), c.reasons); }
  {
    // the solver reads the zones' exponent-colour digits from the mode (`ex`), as the game keeps it fresh
    const withEx = Eq.mathMode(true, ['expo'], null, { ecol: 'red', eids: [1], ex: { req: { 5: 0 }, perm: { 2: 1 }, res: {} } });
    const noEx = Eq.mathMode(true, ['expo'], null, { ecol: 'red', eids: [], ex: { req: {}, perm: {}, res: {} } });
    const r = Eq.solve({ goal: F(25), req: ['5'], opt: ['2'], res: [], mode: 'impossible', fractions: withEx, maxDigits: 6 });
    ok('Exponent solver: a red 2 in Permitted makes 5² = 25', r.found && r.expr === '5' + X[2], r);
    ok('Exponent solver: a plain 2 cannot (complete search)', (x => !x.found && x.complete)(Eq.solve({ goal: F(25), req: ['5'], opt: ['2'], res: [], mode: 'impossible', fractions: noEx, maxDigits: 6 })));
    const cubes = [{ id: 0, s: '5', zone: 'required', color: 'blue' }, { id: 1, s: '2', zone: 'permitted', color: 'red' }];
    const toks = Eq.cubeTokens(r.tokens, cubes, withEx);
    ok('Exponent: the exponent is mapped to the red cube', toks[1].id === 1 && Eq.checkSolution(toks, { goal: F(25), zone: id => cubes[id].zone, required: [0], mode: 'impossible', fractions: withEx }).ok, toks);
  }
  {
    // the zone counts: a red 2 that moved to Forbidden is not counted
    const cubes = [{ id: 0, s: '2', color: 'red', zone: 'forbidden' }, { id: 1, s: '2', color: 'red', zone: 'permitted' }, { id: 2, s: '3', color: 'blue', zone: 'permitted' }];
    const exc = Eq.expCounts(cubes, 'red');
    ok('Exponent: expCounts counts the colour per zone', exc.perm['2'] === 1 && !exc.req['2'] && !exc.res['2'], exc);
  }

  // ---- Multiple of k (XIII-B-7; manual E58-E61) ----
  const k6 = MM('multk', { k: 6 });
  ok('Multiple of k: k = 6, Goal 5, Solution 11 is correct (PDF example)', chkSol('8+3', F(5), k6).ok);
  ok('Multiple of k: k = 6, Goal 5, Solution −1 is correct (PDF example)', chkSol('2-3', F(5), k6).ok);
  { const c = chkSol('2+3', F(5), k6); ok('Multiple of k: a Solution equal to the Goal is wrong (PDF example; manual E58)', !c.ok && /equals the Goal exactly/.test(c.reasons.join(' ')), c.reasons); }
  { const c = chkSol('5+3', F(5), k6); ok('Multiple of k: 8 is 3 away from 5, not a multiple of 6', !c.ok && /3 away/.test(c.reasons.join(' ')), c.reasons); }
  ok('Multiple of k: Goal 3, Solution −3 (manual E59)', chkSol('3-6', F(3), k6).ok);
  ok('Multiple of k: Goal 1/2, Solution 6 1/2 (manual E60)', chkSol('6+1/2', F(1, 2), k6).ok);
  ok('Multiple of k: Goal 1/2, no whole-number Solution can count (manual E60 comment)', !chkSol('3+3', F(1, 2), k6).ok);
  ok('Multiple of k: a Goal above 1000 is refused (PDF XIII-B-7)', !Eq.checkGoal(t('99*99'), k6).ok && Eq.checkGoal(t('99*9'), k6).ok);
  ok('Multiple of k solver: cubes 8 + 3 make 11 for Goal 5 (k = 6)', (r => r.found && r.expr.length === 3)(found(k6, F(5), ['8', '+', '3'])));
  { const r = found(MM('multk', { k: 7 }), F(5), ['8', '+', '3']); ok('Multiple of k solver: with k = 7 nothing works (complete)', !r.found && r.complete, r); }
  { const r = found(k6, F(11), ['8', '+', '3']); ok('Multiple of k solver: it never offers a Solution equal to the Goal (8 + 3 = 11, Goal 11)', !r.found && r.complete, r); }

  // ---- Powers of the Base (XIII-B-10; manual E57, C40) ----
  const pb = { fractions: MM('powbase') };
  vals([
    ['9+T', pb, '19', 'PDF (a): 9 + 10'], ['9+K', pb, '1009', 'PDF (a): 9 + 1000'], ['9+t', pb, '9 1/10', 'PDF (a): 9 + 0.1'],
    ['9+1', pb, '10', 'PDF (a): 1 can still be 1 (10⁰)'],
    ['T*h', pb, '1/10', 'manual E57: two 1s may be different powers'],
    ['T2', { fractions: MM('powbase'), multiDigit: true }, 'ERR:flipnext', 'PDF: a 1 inside a two-digit numeral stands for 1'],
  ], 'Powers of the Base');
  ok('Powers of the Base solver: 9 + 1 makes 19 only with the card', found(MM('powbase'), F(19), ['9', '+', '1']).found && !found(true, F(19), ['9', '+', '1']).found);

  // ---- Factorial (XIII-B-4; XIII-A-4 examples; manual E44, E45) ----
  const fa = MM('factorial');
  vals([
    ['5*4/0!', { fractions: fa }, '20', 'PDF XIII-A-4 example (c): 0! = 1'],
    ['3!!', { fractions: fa }, '720', 'PDF example (e)'],
    ['(1/2)!', { fractions: fa }, 'ERR:factwhole', 'PDF example (f)'],
    ['1/(2!)', { fractions: fa }, '1/2', 'PDF example (f)'],
    ['0-(3!)', { fractions: fa }, '−6', 'PDF example (f)'],
    ['4+7!', { fractions: fa }, '5044', 'manual E45: 4 + (7!), not (4 + 7)!'],
    ['3+9!', { fractions: fa }, '362883', '9! is the biggest the checker allows'],
    ['(9+1)!', { fractions: fa }, 'ERR:factbig', 'game limit: 10! is past the checker\'s ±1,000,000'],
  ], 'Factorial');
  ok('Factorial: (8 − 5)! + 2 = 4! ÷ 3 is correct (PDF example (d))', (c => c.ok)(chkSol('(8-5)!+2', F(8), Eq.mathMode(true, ['factorial'], ['4', '!', '/', '3']))));
  { const c = chkSol('5!', F(120), fa); ok('Factorial: 5! is one cube, not a Solution (PDF example (a); manual E44)', !c.ok && /two cubes/.test(c.reasons.join(' ')), c.reasons); }
  { const c = chkSol('8+1!', F(9), Eq.mathMode(true, ['factorial'], ['9', '!', '/', '8', '!'])); ok('Factorial: the Goal 9! ÷ 8! used both ! signs, so the Solution may use none (PDF example (b))', !c.ok && /already uses 2/.test(c.reasons.join(' ')), c.reasons); }
  ok('Factorial: a Goal may hold at most two ! signs', !Eq.checkGoal(['3', '!', '!', '!'], fa).ok && Eq.checkGoal(['3', '!', '!'], fa).ok);
  ok('Factorial solver: 3 + 0 makes 7 as 3! + 0!', (r => r.found && Eq.bangsIn(r.tokens) === 2)(found(fa, F(7), ['3', '+', '0'])));
  { const r = found(Eq.mathMode(true, ['factorial'], ['5', '!']), F(7), ['3', '+', '0']); ok('Factorial solver: with one ! left in the Goal, 7 from 3 + 0 is not possible (complete)', !r.found && r.complete, r); }

  // ---- Number of Factors (XIII-B-8; XIII-A-11 examples; manual B55, E39, E40) ----
  const nf = { fractions: MM('nfactors') }, nfG = { fractions: MM('nfactors'), multiDigit: true };
  vals([
    ['*1', nf, '1', 'PDF XIII-A-11 (a)'], ['*(6*2)', nf, '6', 'PDF (b)'], ['*(4*4)', nf, '5', 'PDF (c)'], ['*13', nfG, '2', 'PDF (d), in a Goal'],
    ['*0', nf, 'ERR:nfacwhole', 'PDF (e)'], ['*(1/2)', nf, 'ERR:nfacwhole', 'PDF (e)'], ['*(1-4)', nf, 'ERR:nfacwhole', 'PDF (e)'],
    ['*(5^4)', nf, '5', 'PDF (f): x625 is allowed in Middle'],
    ['**12', nfG, '4', 'PDF (g)'], ['3**7', nf, '6', 'PDF (h)'], ['*4*2', nf, '6', 'PDF (i): (x4) × 2'], ['*(4*2)', nf, '4', 'PDF (i): x(4×2)'],
    ['34*5', nfG, '170', 'manual B55: the × in 34×5 is multiplication'],
    ['5**(7-3)', nf, '15', 'manual E39: one × multiplies, the other counts factors'],
    ['*7+9', nf, '11', 'manual E40: (x7) + 9, not x(7 + 9)'],
    ['f6', nf, '4', 'the explicit symbol the solver writes'],
  ], 'Number of Factors');
  ok('Number of Factors: Eq.resolve writes a × with nothing before it as f', Eq.resolve(t('3**7'), MM('nfactors')).join('') === '3*f7');
  ok('Number of Factors solver: × and 6 make 4 (x6), only with the card', found(MM('nfactors'), F(4), ['*', '6']).found && !found(true, F(4), ['*', '6']).found);

  // ---- Smallest Prime (XIII-A-13 examples; VII-C-5-b) ----
  const sp = { fractions: MM('sprime') }, spG = { fractions: MM('sprime'), multiDigit: true };
  vals([
    ['*7', sp, '11', 'PDF (a)'], ['*(9/2)', sp, '5', 'PDF (b)'], ['*(0-3)', sp, '2', 'PDF (c): 1 is not prime'], ['**5', sp, '11', 'PDF (d)'],
    ['*r49', spG, '11', 'PDF (e)'], ['2**5', sp, '14', 'PDF (f)'], ['*5*7', sp, '49', 'PDF (g)'], ['*(5*7)', sp, '37', 'PDF (g)'], ['***9', sp, '17', 'PDF (h)'],
    ['*(20*11)', spG, 'ERR:sprimebig', 'PDF VII-C-5-b: x(20 × 11) is past 200'],
  ], 'Smallest Prime');
  ok('Smallest Prime solver: 7 − 2 and a × make 9 (x7 − 2)', found(MM('sprime'), F(9), ['*', '7', '-', '2']).found);

  // ---- LCM (XIII-A-9 examples; manual E47) ----
  const lc = { fractions: MM('lcm') };
  vals([
    ['6l8', lc, '24', 'PDF (a)'], ['(2*3)l(5+4)', lc, '18', 'PDF (b)'], ['2l4', lc, '4', 'PDF (c) with LCM'], ['2r4', lc, '2', 'PDF (c) with root (the default)'],
    ['0l5', lc, 'ERR:lcmwhole', 'PDF (d)'], ['6lr9', lc, '6', 'PDF (e): LCM of 6 and √9'], ['r9l2', lc, '6', 'manual E47: root and LCM in one expression'],
  ], 'LCM');
  ok('LCM solver: 6, √ and 8 make 24', found(MM('lcm'), F(24), ['6', 'r', '8']).found && !found(true, F(24), ['6', 'r', '8']).found);

  // ---- GCF (XIII-A-10 examples) ----
  const gc = { fractions: MM('gcf') };
  vals([
    ['8g6', gc, '2', 'PDF (a) with GCF'], ['8^6', gc, '262144', 'PDF (a) with exponentiation (the default)'], ['(4*2)g(6+3)', gc, '1', 'PDF (b)'],
    ['5g0', gc, '5', 'PDF: GCF(A, 0) = A'], ['0g0', gc, 'ERR:gcfzero', 'PDF: at least one of them not 0'],
  ], 'GCF');
  ok('GCF solver: 8, ^ and 6 make 2', found(MM('gcf'), F(2), ['8', '^', '6']).found && !found(true, F(2), ['8', '^', '6']).found);

  // ---- Percent (XIII-B-12; XIII-A-14 examples; manual E48) ----
  const pc = { fractions: MM('percent') };
  vals([
    ['25%16', pc, '4', 'PDF (a), two-digit numerals next to % in a Solution'], ['6%8', pc, '12/25', 'PDF (b): 0.48'], ['(8-3)%(4+2)', pc, '3/10', 'PDF (c)'],
    ['25+16', pc, 'ERR:pctdigits', 'two digits only next to %'], ['r4%50', pc, '1', 'manual E48: a root and a percent in one expression'],
    ['2%6', {}, 'ERR:nocard', 'no card: no percent'], ['25%16', {}, 'ERR:concat', 'no card: 25 is two glued digits'],
  ], 'Percent');
  ok('Percent solver: 5, 0, √ and 8 make 4 as 50 % 8', (r => r.found)(found(MM('percent'), F(4), ['5', '0', 'r', '8'])));

  // ---- Decimal Point (XIII-B-13; XIII-A-15 examples; manual E49) ----
  const dp = { fractions: MM('decimal') };
  vals([
    ['2.5', dp, '2 1/2', 'PDF XIII-A-15 (a)'], ['12.5', dp, '12 1/2', 'PDF (c)'], ['1.25', dp, '1 1/4', 'PDF (c)'], ['255.', dp, '255', 'PDF (e)'], ['.050', dp, '1/20', 'PDF (e)'],
    ['15.25', dp, 'ERR:decbig', 'PDF (f): four digits'], ['2.4*2', dp, '4 4/5', 'PDF (b): 2.4 × 2, not 2.(4 × 2)'], ['4.^5', dp, '1024', 'PDF XIII-B-13 (a): 4.^5'],
    ['1.5*2^2', dp, '6', 'manual E49: one ^ a point, another a power'], ['2..5', dp, 'ERR:twodots', 'one point per number'],
    ['23', dp, 'ERR:concat', 'without a point, Solution numbers still have one digit'],
  ], 'Decimal Point');
  ok('Decimal Point solver: 2, 5, ^, ×, 2 make 5 as 2.5 × 2, only with the card', found(MM('decimal'), F(5), ['2', '5', '^', '*', '2']).found && !found(true, F(5), ['2', '5', '^', '*', '2']).found);

  // ---- Base m (XIII-B-6 examples; manual C42, E62, E63) ----
  const b8 = { fractions: MM('basem', { base: 8 }) }, b9 = { fractions: MM('basem', { base: 9 }) };
  vals([
    ['37+5', b8, '36', 'PDF (a): 37 + 5 = 6^2 in base eight'], ['6^2', b8, '36', 'PDF (a)'], ['34+5', b9, '36', 'PDF (b): 34 + 5 = 6^2 in base nine'],
    ['3+8', b8, 'ERR:basedigit', 'PDF (c); manual E62'], ['39', { fractions: MM('basem', { base: 9 }), multiDigit: true }, 'ERR:basedigit', 'PDF (c): 39 is illegal in base nine'],
    ['07', b8, '7', 'manual E63: 00 to 07 are two-digit numerals in base eight'], ['10', b8, '8', 'base eight: 10 means eight'],
  ], 'Base m');
  ok('Base m: the PDF Equation 37 + 5 = 6 ^ 2 is correct in base eight', chkSol('37+5', Eq.checkGoal(t('6^2'), MM('basem', { base: 8 })).value, MM('basem', { base: 8 })).ok);
  ok('Base m solver: 3, 7, +, 5 make 36 in base eight, not in base ten', found(MM('basem', { base: 8 }), F(36), ['3', '7', '+', '5']).found && !found(true, F(36), ['3', '7', '+', '5']).found);
  { const r = Eq.solve({ goal: F(8), req: ['8'], opt: ['+', '1'], res: [], mode: 'impossible', fractions: MM('basem', { base: 8 }), maxDigits: 6 }); ok('Base m solver: an 8 in Required makes every Goal impossible in base eight (manual C42)', !r.found && r.complete); }

  // ---- Settings travel with the Goal; plain data ----
  {
    const m = Eq.withGoal(Eq.mathMode(true, ['multk'], null, { k: 9 }), t('5'));
    ok('withGoal keeps a card setting (k)', Eq.rulesOf(m).k === 9 && m.goal.join('') === '5' && JSON.parse(JSON.stringify(m)).k === 9);
    ok('cubeOf: every Middle symbol names the cube it uses', [U[3], SW[4], X[2], 'T', 'a', 'f', 'p', 'l', 'g', '%', '.'].map(Eq.cubeOf).join(' ') === '3 4 2 1 + * * r ^ r ^');
    ok('orient/withOrient round trip', Eq.withOrient(3, 'u') === U[3] && Eq.orient(U[3]).o === 'u' && Eq.orient(SW[5]).d === 5 && Eq.withOrient(7, '') === '7');
  }

  // ---- Round trip: every Solution the solver returns passes checkSolution (mid-shake, random rolls) ----
  const MIDCARDS = [['upside'], ['sideways'], ['average'], ['expo', { ecol: 'green' }], ['multk', { k: 7 }], ['powbase'], ['factorial'], ['nfactors'], ['sprime'], ['lcm'], ['gcf'], ['percent'], ['decimal'], ['basem', { base: 8 }], ['basem', { base: 9 }]];
  MIDCARDS.forEach(([id, set0]) => {
    const rand = Eq.rng(9000 + id.length); let n = 0, good = 0, bad = [], worst = 0;
    for (let k = 0; k < 10; k++) {
      const cubes = Eq.roll(rand).map(c => ({ id: c.id, s: c.s, color: c.color, zone: 'resources' }));
      const order = cubes.slice().sort(() => rand() - 0.5);
      order.slice(0, 2).forEach(c => c.zone = 'goal'); order.slice(2, 4).forEach(c => c.zone = 'required');
      order.slice(4, 6).forEach(c => c.zone = 'permitted'); order.slice(6, 9).forEach(c => c.zone = 'forbidden');
      const set = Object.assign({}, set0 || {});
      if (id === 'expo') { set.eids = cubes.filter(c => c.color === set.ecol && Eq.isDigit(c.s)).map(c => c.id); set.ex = Eq.expCounts(cubes, set.ecol); }
      const mode = Eq.mathMode(true, [id], [], set), z = nm => cubes.filter(c => c.zone === nm).map(c => c.s);
      ['impossible', 'now'].forEach(md => {
        const goal = F(1 + Math.floor(rand() * 40)), t0 = Date.now();
        const r = Eq.solve({ goal, req: z('required'), opt: z('permitted'), res: z('resources'), mode: md, fractions: mode, maxDigits: 5, timeMs: 700 });
        worst = Math.max(worst, Date.now() - t0);
        if (!r.found) return;
        n++;
        const pool = cubes.filter(c => c.zone === 'required' || c.zone === 'permitted' || c.zone === 'resources');
        const toks = Eq.cubeTokens(r.tokens, pool, mode);
        const chk = Eq.checkSolution(toks, { goal, zone: i => cubes[i] ? cubes[i].zone : 'forbidden', required: cubes.filter(c => c.zone === 'required').map(c => c.id), mode: md, fractions: mode });
        if (chk.ok) good++; else bad.push(r.expr + ' → ' + chk.reasons.join(' '));
      });
    }
    ok(`${id}${set0 ? ' ' + JSON.stringify(set0) : ''}: all ${n} solver Solutions pass checkSolution after cube mapping (worst search ${worst}ms)`, n >= 5 && good === n && worst < 1500, bad.slice(0, 2));
  });

  // ---- Brute force: on small cube sets, the solver finds a Goal exactly when an independent enumeration does ----
  // brute(items, RU) = every value of every expression using each item at most once (at least two real cubes).
  // It builds expression trees directly (an operation cube is a two-number op, a one-number op, or a decimal
  // point), so it shares nothing with the solver's search except the arithmetic (Eq.opCore / Eq.unCore).
  function brute(items, m) {
    const RU = Eq.rulesOf(m), memo = new Map();
    const Bs = RU.basem ? RU.base : 10;
    function leafVals(d) {
      const v = +d, out = [];
      if (v >= Bs) return out;
      out.push(F(v));
      if (RU.ud && v) out.push(F(-v));
      if (RU.sw && v) out.push(F(1, v));
      if (RU.pob && d === '1') for (let k = -6; k <= 6; k++) if (k) out.push(k > 0 ? F(Math.pow(10, k)) : F(1, Math.pow(10, -k)));
      return out;
    }
    const binOf = { '+': RU.avg ? ['a'] : ['+'], '-': ['-'], '*': ['*'], '/': ['/'], '^': ['^'].concat(RU.gcf ? ['g'] : []), r: ['r'].concat(RU.lcm ? ['l'] : [], RU.pct ? ['%'] : []) };
    const unOf = { r: ['sqrt'], '*': RU.nfac ? ['f'] : RU.sprime ? ['p'] : [], '!': ['!'] };
    function vals(key) { // key = sorted item string; every value using exactly these items
      if (memo.has(key)) return memo.get(key);
      const it = key.split(''), out = new Map(), add = v => { if (typeof v !== 'string') out.set(v.n + '/' + v.d, v); };
      const digs = it.filter(Eq.isDigit), ops = it.filter(s => !Eq.isDigit(s));
      if (it.length === 1 && digs.length === 1) leafVals(it[0]).forEach(add);
      if (it.length === 2 && digs.length === 2 && (RU.two || RU.basem) && +it[0] < Bs && +it[1] < Bs) { add(F(+it[0] * Bs + +it[1])); add(F(+it[1] * Bs + +it[0])); }
      for (const o of Eq.uniq(ops)) {
        const rest = it.slice(); rest.splice(rest.indexOf(o), 1);
        // one-number ops on the rest
        if (rest.length) for (const u of (unOf[o] || [])) vals(rest.sort().join('')).forEach(v => add(u === 'sqrt' ? Eq.opCore('r', F(2), v, RU.fr) : Eq.unCore(u, v, RU.fr)));
        // two-number ops: split the rest into two non-empty parts
        const n = rest.length;
        for (let mask = 1; mask < (1 << n) - 1; mask++) {
          const A = [], Bp = []; rest.forEach((s, i) => (mask >> i) & 1 ? A.push(s) : Bp.push(s));
          const vA = vals(A.sort().join('')), vB = vals(Bp.sort().join(''));
          for (const bo of (binOf[o] || [])) vA.forEach(a => vB.forEach(b => add(Eq.opCore(bo, a, b, RU.fr))));
        }
      }
      memo.set(key, out);
      return out;
    }
    const all = new Map(), n = items.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const sub = items.filter((s, i) => (mask >> i) & 1);
      if (sub.filter(s => s !== '!').length < 2) continue;
      vals(sub.slice().sort().join('')).forEach((v, k) => all.set(k, v));
    }
    return all;
  }
  const BF = [
    ['upside', null, ['3', '5', '-', '*']], ['sideways', null, ['2', '3', '+', '/']], ['average', null, ['4', '7', '+', '-']],
    ['powbase', null, ['1', '3', '*', '-']], ['nfactors', null, ['6', '4', '*', '+']], ['sprime', null, ['7', '2', '*', '-']],
    ['lcm', null, ['6', '4', 'r', '+']], ['gcf', null, ['8', '6', '^', '-']], ['factorial', null, ['3', '2', '+', '!', '!']],
    ['basem', { base: 8 }, ['3', '7', '5', '+']], ['multk', { k: 6 }, ['3', '5', '+', '*']]
  ];
  BF.forEach(([id, set, items]) => {
    const m = Eq.mathMode(true, [id], null, set), cubes = items.filter(s => s !== '!');
    const reach = brute(items, m), RU = Eq.rulesOf(m);
    // Goals to try: everything the brute force reached (small ones), plus near misses that it did not reach
    const goals = [];
    reach.forEach(v => { if (Math.abs(v.n) <= 2000 && v.d <= 1000) goals.push(v); });
    for (let g = -12; g <= 40; g++) goals.push(F(g));
    [F(1, 2), F(3, 4), F(7, 3), F(1, 6), F(5, 2)].forEach(g => goals.push(g));
    let agree = 0, dis = [];
    goals.forEach(g => {
      let want;
      if (RU.multk) { want = false; reach.forEach(v => { if (Eq.multOk(v, g, RU.k)) want = true; }); }
      else want = reach.has(g.n + '/' + g.d);
      const r = Eq.solve({ goal: g, req: [], opt: cubes, res: [], mode: 'free', fractions: m, maxDigits: 6, timeMs: 3000 });
      if (r.found === want && (r.found || r.complete)) agree++; else if (dis.length < 3) dis.push(Eq.fmt(g) + ' brute ' + want + ' solver ' + r.found + (r.expr ? ' ' + r.expr : ''));
    });
    ok(`${id}: solver and brute force agree on ${goals.length} Goals for cubes ${items.join(' ')}`, agree === goals.length, dis);
  });

  // ---- Goal ideas for creatures under each card: legal Goals that use the card ----
  {
    const syms = ['3', '5', '1', '7', '+', '*', '^', 'r', '-', '/'];
    [['average', 'a'], ['upside', U[5]], ['factorial', '!'], ['nfactors', 'f'], ['lcm', 'l'], ['gcf', 'g'], ['powbase', 'T'], ['decimal', '.']].forEach(([id, s]) => {
      const m = Eq.mathMode(true, [id]), ideas = Eq.goalIdeas(syms, { fractions: m });
      ok(`goalIdeas (${id}): some Goals use the card, and all are legal Goals`, ideas.some(g => g.tokens.includes(s)) && ideas.every(g => Eq.checkGoal(g.tokens, m).ok));
    });
  }
}
// ================= END MIDDLE-DIVISION VARIATION CARDS =================

// ---------------- How Many Ways?: medals ----------------
{
  const M = Eq.wayMedals;
  ok('medals for 3 ways: 1 / 2 / 3', JSON.stringify(M(3)) === JSON.stringify({ bronze: 1, silver: 2, gold: 3 }));
  let good = true;
  for (let n = 4; n <= 200; n++) { const m = M(n); if (!(m.bronze >= 1 && m.bronze < m.silver && m.silver < m.gold && m.gold < n && m.gold <= 10)) good = false; }
  ok('medals for 4-200 ways: bronze < silver < gold < every way, gold at most 10', good);
  ok('medals for 10 ways: gold is 6', M(10).gold === 6);
}

// ======================= PUZZLE FROM TATA: puzzle codes (js/gift.js) =======================
// Added block (agent `gift`): the code lives in js/gift.js between /*GIFT-CODEC-START*/ and
// /*GIFT-CODEC-END*/, so these checks run exactly the code the game runs.
{
  const gsrc = fs.readFileSync(path.join(root, 'js', 'gift.js'), 'utf8');
  const gm = gsrc.match(/\/\*GIFT-CODEC-START\*\/([\s\S]*?)\/\*GIFT-CODEC-END\*\//);
  ok('gift: codec markers found', !!gm);
  const GC = new Function('Eq', gm[1] + '\nreturn GiftCode;')(Eq);
  const A = GC.ALPHA;
  ok('gift: alphabet is 32 characters with no 0, O, 1, I', A.length === 32 && !/[01OI]/.test(A) && new Set(A).size === 32);
  const cube = (color, s) => ({ color, s });
  const sample = { fr: false, goal: [cube('blue', '1'), cube('red', '2')], req: [cube('green', '4')], forb: [cube('black', '9')],
    perm: [cube('red', '3'), cube('blue', '*'), cube('black', '+'), cube('green', '5')] };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const code = GC.encode(sample);
  ok('gift: code starts with the version character T', code[0] === 'T');
  ok('gift: 8 cubes make a 14-character code', code.length === 14, code);
  ok('gift: pretty code is grouped in fours', /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/.test(GC.pretty(code)), GC.pretty(code));
  const d0 = GC.decode(code);
  ok('gift: decode gives the same puzzle back', d0.ok && same(d0.p.goal, sample.goal) && d0.p.fr === false && d0.p.req.length === 1 && d0.p.forb.length === 1 && d0.p.perm.length === 4 && d0.code === code);
  ok('gift: spaces, dashes and lower case are fine', GC.decode('  ' + GC.pretty(code).toLowerCase().replace(/-/g, ' - ') + ' ').code === code);
  // the same puzzle with its cubes in another order has the same code
  const shuffled = Object.assign({}, sample, { perm: sample.perm.slice().reverse() });
  ok('gift: cube order on the table does not change the code', GC.encode(shuffled) === code);
  // Goal with ( ) and fractions on
  const pz = { fr: true, goal: ['(', cube('red', '3'), cube('black', '+'), cube('green', '4'), ')', cube('blue', '/'), cube('red', '2')], req: [], forb: [], perm: [cube('green', '6'), cube('blue', '1'), cube('red', '-'), cube('black', '7')] };
  const pc = GC.encode(pz), pd = GC.decode(pc);
  ok('gift: Goal with ( ) and fractions round-trips', pd.ok && same(pd.p.goal, pz.goal) && pd.p.fr === true && pd.p.req.length === 0, pd);
  // random puzzles from real rolls: encode -> decode -> encode is stable
  {
    const rand = Eq.rng(2026), cols = Eq.COLORS;
    let good = 0, tried = 0, longest = 0;
    for (let k = 0; k < 400; k++) {
      const roll = Eq.roll(rand).sort(() => rand() - 0.5), n = 6 + Math.floor(rand() * 9), table = roll.slice(0, n).map(c => cube(c.color, c.s));
      const gi = table.findIndex(c => Eq.isDigit(c.s) && c.s !== '0');
      if (gi < 0) continue;
      const goal = [table[gi]], rest = table.filter((c, i) => i !== gi), p = { fr: rand() < 0.5, goal, req: [], forb: [], perm: [] };
      rest.forEach(c => { const r = rand(); (r < 0.2 ? p.req : r < 0.35 ? p.forb : p.perm).push(c); });
      if (GC.problem(p)) continue;
      tried++;
      const c1 = GC.encode(p), d = GC.decode(c1);
      longest = Math.max(longest, c1.length);
      if (d.ok && d.code === c1 && GC.encode(d.p) === c1 && d.p.req.length === p.req.length && d.p.forb.length === p.forb.length && d.p.perm.length === p.perm.length && d.p.fr === p.fr) good++;
    }
    ok('gift: 400 random rolls: every valid puzzle round-trips (' + tried + ' puzzles)', tried > 200 && good === tried, { good, tried });
    ok('gift: codes are never longer than 32 characters (longest ' + longest + ')', longest <= 32);
  }
  // check character: every single wrong character and every swap of two neighbours is caught
  {
    let missed = 0, total = 0;
    [code, pc].forEach(c => {
      for (let i = 0; i < c.length; i++) for (const ch of A) {
        if (ch === c[i]) continue;
        total++; if (GC.decode(c.slice(0, i) + ch + c.slice(i + 1)).ok) missed++;
      }
      for (let i = 0; i + 1 < c.length; i++) {
        if (c[i] === c[i + 1]) continue;
        total++; if (GC.decode(c.slice(0, i) + c[i + 1] + c[i] + c.slice(i + 2)).ok) missed++;
      }
    });
    ok('gift: every one-letter typo and neighbour swap is caught (' + total + ' tried)', missed === 0, missed);
    ok('gift: a typo says the check letter does not match', GC.decode(code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6)).why === 'check');
    ok('gift: a missing letter is caught', !GC.decode(code.slice(0, -2) + code.slice(-1)).ok);
  }
  ok('gift: 0 / O / 1 / I get their own kind message', GC.decode('T0AB-CDEF').why === 'confusable' && GC.decode('TIAB-CDEF').why === 'confusable');
  ok('gift: other symbols are refused', GC.decode('TA#B-CDEF').why === 'badchar');
  ok('gift: empty and short codes are refused', GC.decode('  ').why === 'empty' && GC.decode('TAB').why === 'short');
  {
    // a code with another version character (and a correct check) is "from a newer version"
    const vals = code.split('').map(ch => A.indexOf(ch)); vals.pop(); vals[0] = A.indexOf('U');
    const v2 = vals.map(v => A[v]).join('') + A[GC.checkValue(vals)];
    ok('gift: unknown version is refused kindly', GC.decode(v2).why === 'version');
    const f = code.split('').map(ch => A.indexOf(ch)); f.pop(); f[1] = 2;
    ok('gift: unknown flags are refused', GC.decode(f.map(v => A[v]).join('') + A[GC.checkValue(f)]).why === 'version');
  }
  // puzzle rules
  ok('gift: fewer than 6 cubes is refused', !!GC.problem({ fr: false, goal: [cube('red', '2')], req: [], forb: [], perm: [cube('red', '3'), cube('red', '+'), cube('blue', '1')] }));
  ok('gift: more than 14 cubes is refused', !!GC.problem({ fr: false, goal: [cube('red', '2')], req: [], forb: [], perm: Array.from({ length: 14 }, (x, i) => cube(Eq.COLORS[i % 4], Eq.CUBE_FACES[Eq.COLORS[i % 4]][0])) }));
  ok('gift: 7 cubes of one colour is refused', /only 6 red/.test(GC.problem({ fr: false, goal: [cube('red', '2')], req: [], forb: [], perm: Array.from({ length: 6 }, () => cube('red', '3')) })));
  ok('gift: a fraction Goal needs fractions on', !!GC.problem({ fr: false, goal: [cube('black', '7'), cube('blue', '/'), cube('red', '2')], req: [], forb: [], perm: [cube('red', '3'), cube('red', '+'), cube('blue', '1')] }) &&
    !GC.problem({ fr: true, goal: [cube('black', '7'), cube('blue', '/'), cube('red', '2')], req: [], forb: [], perm: [cube('red', '3'), cube('red', '+'), cube('blue', '1')] }));
  ok('gift: a face the cube does not have is refused', !!GC.problem({ fr: false, goal: [cube('red', '9')], req: [], forb: [], perm: sample.perm.concat([cube('blue', '2')]) }));
  // receipts
  {
    const r0 = GC.receipt(code, 0), r2 = GC.receipt(code, 2);
    ok('gift: receipt is 4 characters from the alphabet', /^[A-Z2-9]{4}$/.test(r0) && [...r0].every(ch => A.includes(ch)));
    ok('gift: receipt is the same every time', GC.receipt(code, 0) === r0 && GC.receipt(GC.pretty(code).toLowerCase(), 0) === r0);
    ok('gift: receipt check finds how many hints', GC.checkReceipt(code, r0).ok && GC.checkReceipt(code, r0).hints === 0 && GC.checkReceipt(code, r2.toLowerCase()).hints === 2);
    ok('gift: 5 or more hints count as 3', GC.receipt(code, 7) === GC.receipt(code, 3));
    ok('gift: a wrong receipt is refused', !GC.checkReceipt(code, r0.slice(0, 3) + (r0[3] === 'A' ? 'B' : 'A')).ok || GC.checkReceipt(code, r0.slice(0, 3) + (r0[3] === 'A' ? 'B' : 'A')).hints !== 0);
    ok('gift: another puzzle has another receipt', GC.receipt(pc, 0) !== r0);
  }
  // message and link
  {
    const msg = 'Bet you can\'t get this one! 🎲 & more';
    const L = GC.link(code, msg, 'http://127.0.0.1:3474/index.html');
    const h = GC.parseHash(L.slice(L.indexOf('#')));
    ok('gift: link carries the code and the message', h && GC.decode(h.code).code === code && h.msg === msg, h);
    ok('gift: link without a message has no m=', GC.link(code, '   ').indexOf('&m=') < 0);
    ok('gift: other hashes are ignored', GC.parseHash('#settings') === null && GC.parseHash('') === null);
    ok('gift: message is cut to 60 characters', Array.from(GC.cleanMsg('x'.repeat(100))).length === 60);
    ok('gift: message loses control characters and extra spaces', GC.cleanMsg(' hi\n\tthere\u0000  you ') === 'hi there you');
    ok('gift: a broken %-escape in the link does not crash', (GC.parseHash('#puzzle=' + code + '&m=%E0%A4%A') || {}).msg === '');
  }
}
// ================= REVIEW ("One thing Pip spotted", js/review.js) — added by the review helper =================
// Hand-built match notes, one per tip kind, plus "nothing provable -> no tip". Loads js/review.js with this Eq.
{
  const RV = new Function('Eq', fs.readFileSync(path.join(root, 'js', 'review.js'), 'utf8') + '\nreturn { Review: Review, Recorder: Recorder };')(Eq);
  const Review = RV.Review;
  // cubes from zone lists: mk({ goal: ['7'], required: ['3'], resources: ['4', '8'] }) -> recorded cube copies
  function mk(z) {
    const out = []; let id = 0, o = 0;
    ['goal', 'required', 'permitted', 'forbidden', 'resources'].forEach(k => (z[k] || []).forEach(s => out.push({ i: id++, s, c: 'red', z: k, o: o++, l: 0 })));
    return out;
  }
  const idOf = (cubes, s, zone) => cubes.find(c => c.s === s && c.z === (zone || 'resources')).i;
  const goalNote = (by, v, gsyms, cubes) => ({ k: 'goal', by, goal: F(v), fr: false, cubes, gt: gsyms.map(s => ({ s, c: 'red' })), shake: 1 });
  const move = (by, cubes, s, zone, v) => ({ k: 'move', by, goal: F(v), fr: false, cubes, i: idOf(cubes, s), s, zone });
  const BANNED = /mistake|wrong|should have|missed|\bmiss\b|bad move|oops/i;
  const allTips = [];
  function run(name, notes, opts) { const t = Review.analyse({ opp: 'Rusty', notes }, opts || { budgetMs: 3000 }); if (t) allTips.push(t); return t; }

  // (a) Now!: Rusty puts the 3 in Required, so 3 + 4 = 7 with one more cube; the kid just moves an 8.
  {
    const c0 = mk({ goal: ['7'], resources: ['3', '+', '4', '8', '8'] });
    const c1 = mk({ goal: ['7'], required: ['+'], resources: ['3', '4', '8', '8'] });
    const c2 = mk({ goal: ['7'], required: ['+', '3'], resources: ['4', '8', '8'] });
    const t = run('now', [goalNote(1, 7, ['7'], c0), move(0, c0, '+', 'required', 7), move(1, c1, '3', 'required', 7), move(0, c2, '8', 'forbidden', 7)]);
    ok('review (a) Now!: a Now! tip', t && t.kind === 'now', t && t.kind);
    ok('review (a) Now!: the Solution is real and = 7', t && Eq.evaluate(t.raw.sol, {}).ok && Eq.fmt(Eq.evaluate(t.raw.sol, {}).value) === '7');
    ok('review (a) Now!: names the extra cube (the 4) and the 3 Rusty moved', t && /one more cube, the 4/.test(t.lines.join(' ')) && /Rusty put the 3 in Required/.test(t.lines[0]), t && t.lines);
    ok('review (a) Now!: the picture marks the 3 that just moved', t && t.pic.required.some(x => x.s === '3' && x.hl));
  }
  // (a) Now! whose extra cube is a second copy of a digit already in Required (2 + 2 = 4: the extra cube is the 2).
  {
    const c0 = mk({ goal: ['4'], required: ['2'], resources: ['+', '2', '9', '8'] });
    const c1 = mk({ goal: ['4'], required: ['2', '+'], resources: ['2', '9', '8'] });
    const t = run('now2', [goalNote(1, 4, ['4'], c0), move(1, c0, '+', 'required', 4), move(0, c1, '9', 'forbidden', 4)]);
    ok('review (a) Now!: a repeated digit counts as the one extra cube', t && t.kind === 'now' && /one more cube, the 2\./.test(t.lines.join(' ')), t && t.lines);
  }
  // (a) Impossible!: Rusty puts × in Required with 2; only 2, 8 left: 9 can never be made.
  {
    const c0 = mk({ goal: ['9'], required: ['2'], resources: ['*', '2', '8'] });
    const c1 = mk({ goal: ['9'], required: ['2', '*'], resources: ['2', '8'] });
    const t = run('imp', [goalNote(1, 9, ['9'], c0), move(1, c0, '*', 'required', 9), move(0, c1, '8', 'permitted', 9)]);
    ok('review (a) Impossible!: an Impossible! tip', t && t.kind === 'imp', t && t.kind);
    ok('review (a) Impossible!: says Pip checked every way', t && /Pip checked every way/.test(t.lines.join(' ')));
  }
  // (b) Safe move: the kid puts the 3 in Required (3 + 4 = 7 is now a Now! for Rusty); the 9 in Forbidden was safe.
  {
    const c0 = mk({ goal: ['7'], resources: ['+', '3', '4', '9', '9'] });
    const c1 = mk({ goal: ['7'], required: ['+'], resources: ['3', '4', '9', '9'] });
    const c2 = mk({ goal: ['7'], required: ['+', '3'], resources: ['4', '9', '9'] });
    const t = run('safe', [goalNote(0, 7, ['7'], c0), move(1, c0, '+', 'required', 7), move(0, c1, '3', 'required', 7),
      { k: 'challenge', by: 1, kind: 'now', goal: F(7), fr: false, cubes: c2 }, { k: 'solution', by: 1, mode: 'now', ok: true, goal: F(7), fr: false, cubes: c2, toks: [{ s: '3' }, { s: '+' }, { s: '4' }] }]);
    ok('review (b) safe move: a safe-move tip', t && t.kind === 'safe', t && t.kind);
    const alt = t && t.raw.alt;
    // the safe move it names really is safe: the Goal stays possible and no Now! exists after it
    let safe = false;
    if (alt) {
      const id = c1.find(c => c.s === alt.s && c.z === 'resources').i;
      const after = Review.stOf(c1.map(c => c.i === id ? Object.assign({}, c, { z: alt.zone, o: 99 }) : c));
      const p = Eq.solve({ goal: F(7), req: after.req, opt: after.perm, res: after.res, mode: 'impossible', timeMs: 500 });
      const nw = Eq.solve({ goal: F(7), req: after.req, opt: after.perm, res: after.res, mode: 'now', timeMs: 500 });
      safe = p.found && !nw.found && nw.complete;
    }
    ok('review (b) safe move: the named move is proven safe', safe, alt);
    ok('review (b) safe move: shows Rusty\'s Now! Solution', t && /Now! chance: (3 \+ 4|4 \+ 3) = 7/.test(t.lines.join(' ')), t && t.lines);
  }
  // (c) Solution: Rusty calls Impossible! on the kid's move; the kid's Solution 5 + 1 is not 10, but 5 × 2 works.
  {
    const c0 = mk({ goal: ['1', '0'], resources: ['5', '*', '2', '1'] });
    const c1 = mk({ goal: ['1', '0'], required: ['5'], resources: ['*', '2', '1'] });
    const t = run('solution', [goalNote(1, 10, ['1', '0'], c0), move(0, c0, '5', 'required', 10),
      { k: 'challenge', by: 1, kind: 'impossible', goal: F(10), fr: false, cubes: c1 },
      { k: 'solution', by: 0, mode: 'impossible', ok: false, goal: F(10), fr: false, cubes: c1, toks: [{ s: '5' }, { s: '+' }, { s: '1' }] }]);
    ok('review (c) Solution: a Solution tip', t && t.kind === 'solution' && t.variant === 'found', t && [t.kind, t.variant]);
    ok('review (c) Solution: shows 5 × 2 (or 2 × 5)', t && /(5 × 2|2 × 5)/.test(t.lines.join(' ')), t && t.lines);
  }
  // (c) Goal: the kid sets 50 with only 1, 2, 3, + left (no Solution); Pip shows a Goal that works.
  {
    const c0 = mk({ goal: ['5', '0'], resources: ['1', '2', '+', '3'] });
    const t = run('goal', [goalNote(0, 50, ['5', '0'], c0)]);
    ok('review (c) Goal: a Goal tip with a Goal that works', t && t.kind === 'goal' && t.raw.sol && Eq.eqF(Eq.evaluate(t.raw.sol, {}).value, t.raw.altVal), t && t.kind);
  }
  // Nothing provable: early in a shake (lots of cubes, nothing to call) -> no tip at all.
  {
    const c0 = mk({ goal: ['1', '2'], resources: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '-', '*', '/', '+', '0', '3'] });
    const c1 = mk({ goal: ['1', '2'], forbidden: ['9'], resources: ['1', '2', '3', '4', '5', '6', '7', '8', '+', '-', '*', '/', '+', '0', '3'] });
    const t = run('none', [goalNote(1, 12, ['1', '2'], c0), move(0, c0, '9', 'forbidden', 12), move(1, c1, '8', 'forbidden', 12)]);
    ok('review: nothing provable -> no tip', t === null, t && t.kind);
    ok('review: an empty log -> no tip', Review.analyse({ opp: 'Rusty', notes: [] }) === null);
  }
  // Nice moment: the kid called Now! and wrote 3 + 4 -> a "nice move" highlight, not a tip.
  {
    const c0 = mk({ goal: ['7'], resources: ['3', '+', '4', '8', '8'] });
    const c1 = mk({ goal: ['7'], required: ['+'], resources: ['3', '4', '8', '8'] });
    const c2 = mk({ goal: ['7'], required: ['+', '3'], resources: ['4', '8', '8'] });
    const t = run('nice', [goalNote(1, 7, ['7'], c0), move(0, c0, '+', 'required', 7), move(1, c1, '3', 'required', 7),
      { k: 'challenge', by: 0, kind: 'now', goal: F(7), fr: false, cubes: c2 }, { k: 'solution', by: 0, mode: 'now', ok: true, goal: F(7), fr: false, cubes: c2, toks: [{ s: '3', c: 'red' }, { s: '+', c: 'red' }, { s: '4', c: 'red' }] }]);
    ok('review: a winning Now! call -> the nice-moment highlight', t && t.kind === 'nice' && t.variant === 'now', t && [t.kind, t.variant]);
  }
  // Picking: the same kind is not given three matches in a row when another kind was found.
  {
    const cands = { now: { kind: 'now' }, safe: { kind: 'safe' } };
    ok('review choose: Now! comes first', Review.choose(cands, []).kind === 'now');
    ok('review choose: after two Now! tips in a row, the other kind', Review.choose(cands, ['now', 'now']).kind === 'safe');
    ok('review choose: only one kind found -> still that kind', Review.choose({ now: { kind: 'now' } }, ['now', 'now']).kind === 'now');
    ok('review choose: nothing -> null', Review.choose({}, []) === null);
  }
  // Time cap: a tiny budget gives up quickly and never throws.
  {
    const cubes = mk({ goal: ['7'], resources: ['3', '+', '4', '8', '8'] });
    const t0 = Date.now(); Review.analyse({ opp: 'Rusty', notes: [goalNote(1, 7, ['7'], cubes), move(0, cubes, '8', 'forbidden', 7)] }, { budgetMs: 1 });
    ok('review: a 1 ms budget returns fast', Date.now() - t0 < 400);
  }
  // Tone: no tip text uses the words the owner does not want.
  ok('review tone: no banned words in ' + allTips.length + ' tips', allTips.length >= 6 && allTips.every(t => !BANNED.test(t.lines.join(' '))), allTips.map(t => t.lines.join(' ')).filter(s => BANNED.test(s)));
  ok('review tone: every tip is 2-3 sentences of plain text', allTips.every(t => t.lines.length >= 2 && t.lines.length <= 3 && t.lines.every(l => !/[<>]/.test(l))));
}
// ================= END REVIEW =================

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
