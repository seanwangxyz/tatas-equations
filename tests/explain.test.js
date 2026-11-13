// Tests for "Explain this Solution" (js/explain.js), the step-by-step walk through a Solution.
// Run with:  node tests/explain.test.js
// Every case checks that the steps are CONSISTENT with the engine: each rewritten expression, turned back
// into engine tokens, evaluates (Eq.evaluate) to the same final value; the last step equals the engine's
// value for the whole Solution; every step has a reason. Then a fuzz test over solver-made Solutions.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('Engine markers not found'); process.exit(1); }
const Eq = new Function(m[1] + '\nreturn Eq;')();
const Explain = new Function('Eq', fs.readFileSync(path.join(root, 'js', 'explain.js'), 'utf8') + '\nreturn Explain;')(Eq);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const F = (n, d = 1) => ({ n, d });
const vEq = (a, b) => !!(a && b && a.n === b.n && a.d === b.d);
const T = s => (typeof s === 'string' ? s.split('') : s);
const M = (vars, set, fr = true) => Eq.mathMode(fr, vars, null, set);
const sym = t => (typeof t === 'string' ? t : t.s);

ok('mode-proof number writing works with this engine', !!Explain._enc());

// The consistency check every case goes through. Returns the explanation.
function consistent(name, tokens, ctx) {
  ctx = ctx || {};
  const res = Explain.steps(tokens, ctx);
  const mode = ctx.fractions !== undefined ? ctx.fractions : false;
  const w = res.wild == null ? undefined : res.wild;
  const whole = Eq.evaluate(tokens, { fractions: mode, wild: w });
  ok(name + ': no fallback', !res.fallback, Explain._why());
  if (res.fallback) return res;
  if (whole.ok) {
    ok(name + ': final value = engine value', vEq(res.value, whole.value), [res.value, whole.value]);
    res.steps.forEach((st, k) => {
      ok(name + ': step ' + k + ' has a reason', typeof st.text === 'string' && st.text.length > 5 && typeof st.why === 'string' && st.why.length > 0, st);
      ok(name + ': step ' + k + ' has a value', !!st.value);
      ok(name + ': step ' + k + ' has a highlighted part', st.before.some(g => g.f));
      if (st.check) {
        const e = Eq.evaluate(st.check, { fractions: mode, wild: w });
        ok(name + ': step ' + k + ' rewritten line evaluates to the same value', e.ok && vEq(e.value, whole.value), [st.line, e.code]);
      } else ok(name + ': step ' + k + ' can be checked', false);
      if (k > 0) ok(name + ': step ' + k + ' starts where the last one ended', Explain.segText(st.before) === Explain.segText(res.steps[k - 1].after));
    });
    const opSteps = res.steps.filter(s => s.kind === 'op');
    if (opSteps.length) {
      const last = res.steps[res.steps.length - 1];
      ok(name + ': last step leaves one number', last.after.length === 1 && !!last.after[0].v && vEq(last.after[0].v, whole.value), Explain.segText(last.after));
    }
  } else {
    ok(name + ': engine error reported', !!res.error && res.error.code === whole.code, [res.error, whole.code]);
    ok(name + ': no value claimed', res.value === null);
    res.steps.forEach((st, k) => { if (st.kind !== 'error') { const e = st.check && Eq.evaluate(st.check, { fractions: mode, wild: w }); ok(name + ': step ' + k + ' before the error still fails the same way', !e || (!e.ok && e.code === whole.code), e && e.code); } });
    if (res.steps.length) ok(name + ': the walk ends at the error', res.steps[res.steps.length - 1].kind === 'error');
  }
  ok(name + ': has an end line', !!(res.end && res.end.text));
  return res;
}
function why(res) { return res.steps.map(s => s.text).join(' | '); }

// ---------------- 1. Hand-checked expressions: every operation ----------------
// [name, tokens, ctx, expected final (fmt) or 'ERR:code', optional regex the step texts must match, optional step count]
const PLAIN = [
  ['plus', '3+4', {}, '7', /3 \+ 4 = 7/, 1],
  ['minus', '9-4', {}, '5', /9 − 4 = 5/, 1],
  ['times', '6*7', {}, '42', /6 × 7 = 42/, 1],
  ['divide', '8/2', {}, '4', /8 ÷ 2 = 4/, 1],
  ['times before plus', '3+4*2', {}, '11', /Times and divide come before plus and minus/, 2],
  ['divide before minus', '9-6/3', {}, '7', /come before plus and minus/, 2],
  ['left to right minus', '8-3-2', {}, '3', /left to right/, 2],
  ['left to right divide', '8/4*2', {}, '4', /left to right/, 2],
  ['brackets first', '(3+4)*2', {}, '14', /Brackets first/, 2],
  ['brackets on the right', '2*(9-4)', {}, '10', /Brackets first/, 2],
  ['brackets beat a left step', '3*4+(2+1)', {}, '15', /^Brackets first/, 3],
  ['nested brackets', '((1+2)*(3+1))-5', {}, '7', /Brackets first/, 4],
  ['deep nesting', '(2*(3+(4-1)))', {}, '12', /Brackets first/, 3],
  ['power', '2^3', {}, '8', /2 × 2 × 2 = 8/, 1],
  ['power before times', '3*2^2', {}, '12', /Powers come before times and divide/, 2],
  ['power tower right to left', '2^3^2', {}, '512', /start with the top one, on the right/, 2],
  ['power 0', '5^0', {}, '1', /power 0 is 1/, 1],
  ['square root', 'r9+1', {}, '4', /√9 asks/, 2],
  ['root with index', '3r8', {}, '2', /multiplied by itself 3 times/, 1],
  ['root of a bracket', 'r(7+2)', {}, '3', /Brackets first/, 2],
  ['root binds tight', '4*r9', {}, '12', /√ works on the number right after it/, 2],
  ['index root then times', '2r9*2', {}, '6', /3 × 2 = 6|3 × 2/, 2],
  ['zero times', '0*7+5', {}, '5', null, 2],
  ['long creature Solution', '(9-1)/(3-1)*2+6-5', {}, '9', /Brackets first/, 6],
  ['fractions on', '7/2', { fractions: true }, '3 1/2', /3 1\/2/, 1],
  ['fraction chain', '1/2+1/3', { fractions: true }, '5/6', /5\/6/, 3],
  ['negative middle value', '(2-5)*3+9', {}, '0', /−3/, 3],
  ['negative result', '2-9', {}, '−7', /= −7/, 1],
  ['fraction times', '(1/3)*6', { fractions: true }, '2', /1\/3/, 2],
];
PLAIN.forEach(([name, e, ctx, want, re, n]) => {
  const tk = T(e), res = consistent(name, tk, ctx);
  const got = res.value ? Eq.fmt(res.value) : 'ERR:' + (res.error && res.error.code);
  ok(name + ': value ' + want, got === want, got);
  if (re) ok(name + ': reason words', re.test(why(res)), why(res));
  if (n !== undefined) ok(name + ': ' + n + ' steps', res.steps.length === n, res.steps.length);
});

// ---------------- 2. Variation cards that change how a Solution is worked out ----------------
const U = Eq.UD, SW = Eq.SW, EX = Eq.EX;
const CARDS = [
  ['upside-down', [U[3], '*', '4', '+', '2'], { fractions: M(['upside']), goal: F(-10) }, '−10', /upside-down, so it means −3/],
  ['upside-down twice', ['5', '-', U[2], '-', U[1]], { fractions: M(['upside']) }, '8', /means −2/],
  ['sideways', [SW[3], '+', '2'], { fractions: M(['sideways']) }, '2 1/3', /one third/],
  ['sideways divide', ['1', '/', SW[3]], { fractions: M(['sideways']) }, '3', /lying on its side/],
  ['average', ['7', '+', '9'], { fractions: M(['average']), goal: F(8) }, '8', /\+ means the average/],
  ['average chain', ['4', '+', '6', '+', '9'], { fractions: M(['average']) }, '7', /left to right/],
  ['average after times', ['5', '+', '4', '*', '2'], { fractions: M(['average']) }, '6 1/2', /Times and divide come before/],
  ['base 8', ['2', '3', '+', '5'], { fractions: M(['basem'], { base: 8 }), goal: F(24) }, '24', /In base 8, 23 means 2 eights and 3 = 19/],
  ['base 9', ['1', '2', '*', '2'], { fractions: M(['basem'], { base: 9 }) }, '22', /In base 9, 12 means 1 nine and 2 = 11/],
  ['base 8 example', ['3', '7', '+', '5'], { fractions: M(['basem'], { base: 8 }) }, '36', /31/],
  ['wild 0', ['5', '+', '0'], { fractions: M(['wild0']), goal: F(8) }, '8', /wild 0 stands for 3/],
  ['wild 0 found without help', ['0', '*', '2'], { fractions: M(['wild0']), goal: F(14) }, '14', /stands for 7/],
  ['two-digit numbers', ['2', '3', '+', '1'], { fractions: M(['twodigit']), goal: F(24) }, '24', /23 \+ 1 = 24/],
  ['remainder', ['7', 'm', '3'], { fractions: M(['remainder']) }, '1', /left over/],
  ['remainder in a sum', ['1', '+', '9', 'm', '4'], { fractions: M(['remainder']) }, '2', /rem goes with times and divide/],
  ['exponent colour', ['5', EX[2], '+', '1'], { fractions: M(['expo']) }, '26', /little raised 2 means squared/],
  ['exponent stacks', ['2', EX[2], EX[3]], { fractions: M(['expo']) }, '64', /cubed/],
  ['multiple of k counts', ['8', '+', '9'], { fractions: M(['multk'], { k: 6 }), goal: F(11) }, '17', null],
  ['powers of ten', ['T', '+', '1'], { fractions: M(['powbase']) }, '11', /stands for 10/],
  ['powers of ten small', ['t', '*', '5'], { fractions: M(['powbase']) }, '1/2', /stands for 0\.1/],
  ['factorial', ['4', '!', '/', '3'], { fractions: M(['factorial']) }, '8', /4 × 3 × 2 × 1 = 24/],
  ['factorial of a bracket', ['(', '8', '-', '5', ')', '!', '+', '2'], { fractions: M(['factorial']) }, '8', /Brackets first/],
  ['double factorial', ['3', '!', '!'], { fractions: M(['factorial']) }, '720', /6!/],
  ['0 factorial', ['5', '*', '4', '/', '0', '!'], { fractions: M(['factorial']) }, '20', /0! is 1/],
  ['number of factors', ['*', '1', '2', '-', '1'], { fractions: M(['nfactors', 'twodigit']) }, '5', /\(1, 2, 3, 4, 6, 12\)/],
  ['number of factors after a number', ['3', '*', '*', '7'], { fractions: M(['nfactors']) }, '6', /no number in front/],
  ['smallest prime', ['*', '7'], { fractions: M(['sprime']) }, '11', /next prime/],
  ['smallest prime of a fraction', ['*', '(', '9', '/', '2', ')'], { fractions: M(['sprime']) }, '5', /bigger than 4 1\/2/],
  ['lcm', ['6', 'l', '8'], { fractions: M(['lcm']) }, '24', /lowest common multiple/],
  ['lcm with root', ['6', 'l', 'r', '9'], { fractions: M(['lcm']) }, '6', /√9/],
  ['gcf', ['8', 'g', '6'], { fractions: M(['gcf']) }, '2', /greatest common factor/],
  ['percent', ['2', '5', '%', '1', '6'], { fractions: M(['percent']) }, '4', /25 percent of 16/],
  ['percent fraction', ['6', '%', '8'], { fractions: M(['percent']) }, '12/25', /6 percent of 8/],
  ['decimal point', ['2', '.', '5', '*', '2'], { fractions: M(['decimal']) }, '5', /decimal point/],
  ['decimal leading point', ['.', '2', '5', '*', '4'], { fractions: M(['decimal']) }, '1', /\.25/],
  ['three operations card', ['4', '+', '3', '*', '2', '-', '1'], { fractions: M(['threeops']) }, '9', /come before/],
  ['use it again', ['1', '+', '2', '+', '3'], { fractions: M(['multiops']) }, '6', /left to right/],
];
CARDS.forEach(([name, tk, ctx, want, re]) => {
  const res = consistent(name, tk, ctx);
  const got = res.value ? Eq.fmt(res.value) : 'ERR:' + (res.error && res.error.code);
  ok(name + ': value ' + want, got === want, got);
  if (re) ok(name + ': reason words', re.test(why(res)), why(res));
});
// Multiple of k end lines
(function () {
  const ctx = { fractions: M(['multk'], { k: 6 }), goal: F(12) };
  let r = consistent('multk miss', T('8+9'), ctx);
  ok('multk: "17 is 5 more than 12, and 5 is not a multiple of 6"', /17 is 5 more than the Goal 12, and 5 is not a multiple of 6/.test(r.end.text), r.end.text);
  ok('multk miss is wrong', r.verdict === 'wrong');
  r = consistent('multk hit', T('9+9'), ctx);
  ok('multk: 18 is 6 more, a multiple ✔', /18 is 6 more than the Goal 12, and 6 is a multiple of 6 ✔/.test(r.end.text) && r.verdict === 'right', r.end.text);
  r = consistent('multk exact', T('6+6'), ctx);
  ok('multk: exactly the Goal does not count', /exactly the Goal/.test(r.end.text) && r.verdict === 'wrong', r.end.text);
})();

// ---------------- 3. Bonus dice (house rule) ----------------
const big = v => Eq.BIG_FACES.find(s => vEq(Eq.bigOf(s), v));
const BONUS = [
  ['bonus factorial', ['3', 'F', '+', '1'], '7', /3 × 2 × 1 = 6/],
  ['bonus squared', ['(', '2', '-', '5', ')', 'Q'], '9', /squared/],
  ['bonus squared fraction', [big(F(1, 2)), 'Q', '+', '1'], '1 1/4', /purple bonus cube is the number 1\/2/],
  ['bonus cubed', ['2', 'C', '-', '1'], '7', /cubed/],
  ['bonus abs', ['A', '(', '2', '-', '5', ')'], '3', /distance from 0/],
  ['bonus mod', ['7', 'M', '3', '+', '1'], '2', /left over/],
  ['bonus percent', [big(F(50)), 'E', '8'], '4', /50 percent of 8/],
  ['bonus max', ['3', 'X', '5', '*', '2'], '10', /bigger one of 3 and 5/],
  ['bonus min', ['3', 'I', '5'], '3', /smaller one/],
  ['bonus avg level', ['1', '+', '3', 'Y', '5'], '4 1/2', /left to right/],
  ['bonus gcf', ['8', 'G', '6'], '2', /greatest common factor/],
  ['bonus lcm', ['4', 'L', '6'], '12', /lowest common multiple/],
  ['bonus double', ['D', '7', '-', '1'], '13', /doubles it/],
  ['bonus half', ['B', '7'], '3 1/2', /half of 7/],
  ['bonus negative', ['U', '3', '+', '5'], '2', /opposite of 3 is −3/],
  ['bonus negative of a square', ['U', '3', 'Q'], '−9', /squared/],
  ['bonus one over', ['O', '4', '*', '2'], '1/2', /1 ÷ 4/],
  ['bonus root', ['R', '9', '!'], null, null],
  ['bonus root plain', ['R', '9', '+', '1'], '4', /which number times itself makes 9/],
  ['bonus digit sum', ['S', big(F(36)), '*', '2'], '18', /3 \+ 6 = 9/],
  ['bonus factors', ['N', big(F(12))], '6', /12 has 6 factors/],
  ['bonus big number', [big(F(100)), '/', '4'], '25', /100 ÷ 4 = 25/],
];
BONUS.forEach(([name, tk, want, re]) => {
  const res = consistent(name, tk, { fractions: true });
  const got = res.value ? Eq.fmt(res.value) : 'ERR:' + (res.error && res.error.code);
  if (want) ok(name + ': value ' + want, got === want, got);
  if (re) ok(name + ': reason words', re.test(why(res)), why(res));
});

// ---------------- 4. Wrong Solutions, explained kindly ----------------
(function () {
  let r = consistent('wrong value', T('3+4*2'), { goal: F(14) });
  ok('wrong value: end says how far off', /= 11, and the Goal is 14: that is 3 less than the Goal/.test(r.end.text), r.end.text);
  ok('wrong value: verdict', r.verdict === 'wrong');
  ok('wrong value: brackets near fix', r.fix && /brackets around 3 \+ 4/.test(r.fix.text) && /the Goal!/.test(r.fix.text), r.fix);
  ok('wrong value: fix really works', r.fix && vEq(Eq.evaluate(r.fix.tokens, {}).value, F(14)));
  r = consistent('wrong extra brackets', T('(3+4)*2'), { goal: F(11) });
  ok('wrong: taking brackets away is suggested', r.fix && /Without the brackets around 3 \+ 4/.test(r.fix.text), r.fix);
  r = consistent('wrong far', T('1+1'), { goal: F(50) });
  ok('wrong far: no fake fix', r.fix === null);
  ok('never "should have" anywhere', !/should have|wrong|mistake/i.test(JSON.stringify([r.end, r.fix, r.steps.map(s => s.text)])));
  r = consistent('uneven division, fractions off', T('7/2+1'), { goal: F(4) });
  ok('uneven division: stuck at the ÷ step', r.steps.length === 1 && r.steps[0].kind === 'error' && /doesn't come out even/.test(r.steps[0].what), why(r));
  r = consistent('division by zero after steps', T('(2+3)/(1-1)'), {});
  ok('divide by zero: walks the brackets, then stops', r.steps.length === 3 && r.steps[2].kind === 'error' && /divide by zero/.test(r.steps[2].what), why(r));
  r = consistent('root not whole', T('r8+1'), { goal: F(3) });
  ok('root not whole: stuck kindly', r.steps[0].kind === 'error' && /isn't a whole number/.test(r.steps[0].what), why(r));
  r = consistent('glued digits', T('23+1'), { goal: F(24) });
  ok('glued digits: the rule, no made-up steps', r.steps.length === 0 && r.error.code === 'concat' && /two-digit/.test(r.end.text), r);
  r = consistent('base digit 9 in base 8', ['9', '+', '1'], { fractions: M(['basem'], { base: 8 }) });
  ok('base 8 digit 9: explained', r.error && /In base 8/.test(r.error.msg), r.error);
  r = consistent('syntax', T('3+*4'), {});
  ok('syntax: engine message', r.error && r.steps.length === 0, r);
  r = consistent('average solution that only works if + adds', ['3', '+', '5'], { fractions: M(['average']), goal: F(8) });
  ok('average misread: end shows 4 vs 8', /= 4, and the Goal is 8/.test(r.end.text), r.end.text);
  // rule-breaks from checkSolution
  const cubes = [{ id: 0, s: '3', zone: 'required' }, { id: 1, s: '+', zone: 'permitted' }, { id: 2, s: '4', zone: 'permitted' }, { id: 3, s: '*', zone: 'forbidden' }, { id: 4, s: '2', zone: 'permitted' }, { id: 5, s: '5', zone: 'required' }];
  const chkCtx = { goal: F(11), zone: id => cubes[id].zone, required: [0, 5], mode: 'free', fractions: false, label: id => cubes[id].s };
  const toks = [{ s: '3', id: 0 }, { s: '+', id: 1 }, { s: '4', id: 2 }, { s: '*', id: 3 }, { s: '2', id: 4 }];
  r = consistent('rule-breaks', toks, { goal: F(11), check: chkCtx });
  ok('rule-breaks: Forbidden and Required listed', r.rules.length === 2 && /Forbidden/.test(r.rules.join()) && /Required/.test(r.rules.join()), r.rules);
  ok('rule-breaks: value still right', r.end.ok === true && r.verdict === 'wrong', [r.end, r.verdict]);
  ok('rule-breaks: no bracket fix offered for a rule', r.fix === null);
  const twice = [{ s: '3', id: 0 }, { s: '+', id: 1 }, { s: '3', id: 0 }, { s: '+', id: 1 }, { s: '5', id: 5 }];
  r = consistent('cube used twice', twice, { goal: F(11), chk: Eq.checkSolution(twice, chkCtx) });
  ok('cube used twice: listed', /used twice/.test(r.rules.join()), r.rules);
  ok('cube used twice: the "equals" line is not repeated as a rule', !r.rules.some(x => /^Your Solution equals/.test(x)));
})();

// ---------------- 5. Fallback honesty ----------------
(function () {
  const r = Explain.steps(['3', '+', 'ж'], {});
  ok('unknown symbol the engine refuses too: engine message, no steps', !r.fallback && r.steps.length === 0 && r.error && r.error.code === 'syntax', r);
  // an engine whose step maths disagrees with its own evaluator: the explanation must not pretend
  const Liar = Object.assign({}, Eq, { opCore: function (op, a, b, fr) { const v = Eq.opCore(op, a, b, fr); return (op === '*' && typeof v === 'object') ? { n: v.n + 1, d: v.d } : v; } });
  const X2 = new Function('Eq', fs.readFileSync(path.join(root, 'js', 'explain.js'), 'utf8') + '\nreturn Explain;')(Liar);
  const l = X2.steps(T('3+4*2'), { goal: F(11) });
  ok('disagreement: honest fallback', l.fallback === true && l.text === Explain.FALLBACK && l.steps.length === 0, l);
  ok('disagreement: still shows the answer', l.value && Eq.fmt(l.value) === '11' && /✔/.test(l.end.text), l.end);
  const ok2 = X2.steps(T('3+4'), {});
  ok('disagreement only where it happens', !ok2.fallback);
  const e = Explain.steps([], {});
  ok('empty: no crash', !!e.end && e.verdict === 'wrong');
})();

// ---------------- 6. Fuzz: random valid Solutions from the solver and a random generator ----------------
(function () {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const modes = [false, true, M(['upside']), M(['average']), M(['factorial']), M(['remainder']), M(['expo'], { ex: null }), M(['nfactors']), M(['basem'], { base: 8 }), M(['twodigit']), M(['powbase'])];
  let solved = 0, checked = 0, fellBack = 0;
  for (let k = 0; k < 120 && solved < 60; k++) {
    const roll = Eq.roll(rnd), syms = roll.map(c => c.s);
    const mode = modes[k % modes.length];
    const ideas = Eq.goalIdeas(syms.slice(0, 8), { fractions: mode });
    if (!ideas.length) continue;
    const goal = ideas[Math.floor(rnd() * ideas.length)].value;
    const r = Eq.solve({ goal: goal, req: [], opt: syms.slice(8, 20), res: [], mode: 'free', fractions: mode, maxDigits: 6, timeMs: 150 });
    if (!r.found) continue;
    solved++;
    const res = consistent('fuzz solver #' + k + ' ' + r.expr, r.tokens, { fractions: mode, goal: goal, wild: r.wild });
    checked++; if (res.fallback) fellBack++;
    ok('fuzz solver #' + k + ': explains a right Solution as right', res.verdict === 'right', [r.expr, res.end && res.end.text]);
  }
  ok('fuzz: solver produced enough Solutions (' + solved + ')', solved >= 40, solved);
  // random expressions over every plain operation, with brackets
  const OPS = ['+', '-', '*', '/', '^'];
  let made = 0;
  for (let k = 0; k < 2000 && made < 150; k++) {
    const n = 2 + Math.floor(rnd() * 4), out = [];
    let open = 0;
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.25) { out.push('('); open++; }
      if (rnd() < 0.15) out.push('r');
      out.push(String(Math.floor(rnd() * 10)));
      if (open && rnd() < 0.4) { out.push(')'); open--; }
      if (i < n - 1) out.push(OPS[Math.floor(rnd() * OPS.length)]);
    }
    while (open-- > 0) out.push(')');
    const fr = rnd() < 0.5;
    if (!Eq.evaluate(out, { fractions: fr }).ok) {
      if (k % 7 === 0) consistent('fuzz bad ' + out.join(''), out, { fractions: fr, goal: F(10) }); // wrong ones too
      continue;
    }
    made++;
    consistent('fuzz random ' + out.join(''), out, { fractions: fr, goal: F(10) });
  }
  ok('fuzz: random generator produced enough expressions (' + made + ')', made >= 100, made);
  ok('fuzz: nothing fell back', fellBack === 0, fellBack);
})();

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
