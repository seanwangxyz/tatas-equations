// Tests for "Why did they do that?" (js/why.js): the facts a move changed and the words for them.
// Run with:  node tests/why.test.js
// Every claim is cross-checked against an independent brute force (every way to combine the cubes with
// + − × ÷ ^ in every grouping, using the engine's own arithmetic Eq.opCore) on small cube sets, or, with a
// variation card, against a much longer solver run. Then a fuzz test over 300 rolled positions.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('Engine markers not found'); process.exit(1); }
const Eq = new Function(m[1] + '\nreturn Eq;')();
// WHY_PROFILE=1: report the slowest single call of each engine function the analysis uses.
const PROF = {};
if (process.env.WHY_PROFILE) ['solve', 'cubeTokens', 'checkSolution'].forEach(fn => {
  const orig = Eq[fn];
  Eq[fn] = function () { const t0 = performance.now(), r = orig.apply(this, arguments), dt = performance.now() - t0;
    if (!PROF[fn] || dt > PROF[fn].ms) PROF[fn] = { ms: Math.round(dt), arg: JSON.stringify(arguments[0]).slice(0, 300), p: fn === 'solve' ? { md: arguments[0].maxDigits, t: arguments[0].timeMs, mode: arguments[0].mode } : null };
    return r; };
});
process.on('exit', () => { if (process.env.WHY_PROFILE) console.log(JSON.stringify(PROF, null, 1)); });
const Why = new Function('Eq', fs.readFileSync(path.join(root, 'js', 'why.js'), 'utf8') + '\nreturn Why;')(Eq);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ''); }
}
const F = (n, d = 1) => ({ n, d });
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---- Positions ----
// P({goal, req, perm, forb, res, fr}) -> {cubes, goal, fr}; zone strings are space-separated symbols.
function P(o) {
  const cubes = []; let id = 0;
  const add = (str, zone) => (str || '').split(' ').filter(Boolean).forEach(s => cubes.push({ id: id++, s, zone, color: ['red', 'blue', 'green', 'black'][id % 4], order: id }));
  add(o.req, 'required'); add(o.perm, 'permitted'); add(o.forb, 'forbidden'); add(o.res, 'resources'); add(o.goalCubes || '9', 'goal');
  return { cubes, goal: typeof o.goal === 'object' ? o.goal : F(o.goal), fr: o.fr === undefined ? false : o.fr };
}
// The cube id of the first Resource cube showing symbol s.
function rid(pos, s) { const c = pos.cubes.find(c => c.zone === 'resources' && c.s === s); if (!c) throw new Error('no resource ' + s); return c.id; }
function input(pos, s, zone, extra) {
  return Object.assign({ cubes: pos.cubes, id: rid(pos, s), zone, goal: pos.goal, fractions: pos.fr, name: 'Rusty', isAI: true, mine: false,
    taste: { text: 'Loves × and ÷.', syms: ['*', '/'] } }, extra || {});
}

// ---- Brute force (independent of the solver) ----
// Every Solution on the allowed cubes: returns [{mask, ids, faces}] for the given state and mode.
function brute(cubes, goal, fr, mode) {
  const pool = cubes.filter(c => c.zone === 'required' || c.zone === 'permitted' || c.zone === 'resources');
  const n = pool.length, vals = new Array(1 << n), isD = pool.map(c => Eq.isDigit(c.s));
  const key = v => v.n + '/' + v.d;
  const masks = []; for (let k = 1; k < (1 << n); k++) masks.push(k);
  const pc = x => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
  masks.sort((a, b) => pc(a) - pc(b));
  for (const M of masks) {
    const map = new Map();
    if (pc(M) === 1) { const i = Math.log2(M); if (isD[i]) map.set(key(F(+pool[i].s)), F(+pool[i].s)); vals[M] = map; continue; }
    for (let i = 0; i < n; i++) {
      if (!(M >> i & 1) || isD[i]) continue;
      const rest = M & ~(1 << i);
      for (let A = (rest - 1) & rest; A > 0; A = (A - 1) & rest) {
        const B = rest & ~A; if (!B) continue;
        const va = vals[A], vb = vals[B]; if (!va || !vb || !va.size || !vb.size) continue;
        for (const a of va.values()) for (const b of vb.values()) {
          const r = Eq.opCore(pool[i].s, a, b, Eq.fracOn(fr));
          if (typeof r !== 'string' && r && Math.abs(r.n) < 1e9) map.set(key(r), r);
        }
      }
    }
    vals[M] = map;
  }
  const req = pool.map((c, i) => c.zone === 'required' ? i : -1).filter(i => i >= 0);
  const out = [];
  for (const M of masks) {
    if (pc(M) < 2 || !vals[M].has(key(goal))) continue;
    if (!req.every(i => M >> i & 1)) continue;
    const ids = pool.filter((c, i) => M >> i & 1);
    if (mode === 'now' && ids.filter(c => c.zone === 'resources').length > 1) continue;
    out.push({ mask: M, ids: ids.map(c => c.id), faces: ids.map(c => c.s).sort().join(' ') });
  }
  return out;
}
function distinctFaces(list) { return new Set(list.map(x => x.faces)).size; }
// ---- The cross-check every case goes through ----
const AFTER_KINDS = ['gone', 'still', 'now', 'quiet', 'never', 'fewer', 'maybegone'];
const BAD_WORDS = /undefined|NaN|null|\[object|mistake|wrong|should|bad move|silly/i;
function solCtx(cubes, mode, pos) {
  const by = {}; cubes.forEach(c => { by[c.id] = c; });
  return { goal: pos.goal, zone: id => (by[id] ? by[id].zone : 'forbidden'), required: cubes.filter(c => c.zone === 'required').map(c => c.id), mode, fractions: pos.fr };
}
function solOk(tokens, cubes, mode, pos) { return !!tokens && Eq.checkSolution(tokens, solCtx(cubes, mode, pos)).ok; }
function nowAllowed(cubes) { const st = Why.stOf(cubes); return st.res.length >= 2 && st.req.length + st.perm.length > 0; }
function textOk(name, T) {
  const all = [T.head].concat(T.lines, T.note ? [T.note] : [], T.ex ? [T.ex.label] : []).join(' ');
  ok(name + ': no bad words or holes', !BAD_WORDS.test(all), all);
  ok(name + ': 1 to 3 sentences', T.lines.length <= 2 && T.lines.every(l => (l.match(/[.!?](\s|$)/g) || []).length <= 2), T.lines);
  ok(name + ': no contradiction', !(T.kinds.indexOf('gone') >= 0 && (T.kinds.indexOf('still') >= 0 || T.kinds.indexOf('quiet') >= 0)), T.kinds);
}
// Full check. useBrute = false for variation cards: then "no" claims are checked with a long solver run instead.
function check(name, pos, s, zone, extra, useBrute = true) {
  const inp = input(pos, s, zone, extra), cache = {};
  const R = Why.analyze(inp, { cache, sliceMs: 400, budgetMs: 4000 });
  ok(name + ': analysed', !!R, inp);
  if (!R) return null;
  const Fa = R.facts, T = R.text, TL = Why.compose(Object.assign({}, Fa, { live: true }));
  const before = pos.cubes, after = Why.applyMove(before, inp.id, zone);
  const W = Why.states(before, inp.id, zone), withIt = W.withIt, without = W.without;
  let truth;
  if (useBrute) {
    // Independent of Why.states: count how many cubes with the moved cube's face each Solution uses.
    const face = Eq.cubeOf(pos.cubes.find(c => c.id === inp.id).s);
    const live = pos.cubes.filter(c => Eq.cubeOf(c.s) === face && ['required', 'permitted', 'resources'].indexOf(c.zone) >= 0);
    const copies = live.length, reqCopies = live.filter(c => c.zone === 'required').length;
    const B = brute(before, pos.goal, pos.fr), A = brute(after, pos.goal, pos.fr), cnt = x => x.faces.split(' ').filter(f => f === face).length;
    truth = { B: B.length > 0, A: A.length > 0, NA: nowAllowed(after) && brute(after, pos.goal, pos.fr, 'now').length > 0, nB: distinctFaces(B), nA: distinctFaces(A),
      U: zone === 'forbidden' ? B.some(x => cnt(x) === copies) : A.length > 0,          // a way that needs every twin / a way after
      V: zone === 'required' ? B.some(x => cnt(x) === reqCopies) : A.length > 0,        // a way with only the Required twins / a way after
      afterFaces: new Set(A.map(x => x.faces)) };
    // A "lost" or "ruled out" example really can't be rebuilt after the move, even by swapping twin cubes.
    const exFaces = t => t.filter(x => typeof x === 'object').map(x => Eq.cubeOf(x.s)).sort().join(' ');
    [T, Why.compose(Object.assign({}, Fa, { live: true }))].forEach(TT => {
      if (TT.ex && TT.ex.when === 'before' && (TT.kinds.indexOf('lost') >= 0 || TT.kinds.indexOf('ruledout') >= 0))
        ok(name + ': the lost way can\'t be rebuilt after the move', !truth.afterFaces.has(exFaces(TT.ex.tokens)), TT.ex);
    });
  } else {
    const long = (cubes, mode) => { const st = Why.stOf(cubes); return Eq.solve({ goal: pos.goal, req: st.req, opt: st.perm, res: st.res, mode, fractions: pos.fr, maxDigits: 6, timeMs: 3000 }).found; };
    truth = { B: long(before, 'impossible'), A: long(after, 'impossible'), U: long(withIt, 'impossible'), V: long(without, 'impossible'),
      NA: nowAllowed(after) && long(after, 'now'), nB: 99, nA: 99 };
  }
  const tri = (label, f, t) => { if (f.r === 'yes') ok(name + ': ' + label + ' yes is true', t); if (f.r === 'no') ok(name + ': ' + label + ' no is true', !t); };
  tri('possible before', Fa.possB, truth.B); tri('possible after', Fa.possA, truth.A);
  if (zone !== 'permitted') { tri('a way with it', Fa.use, truth.U); tri('a way without it', Fa.avoid, truth.V); }
  if (Fa.nowA.r !== 'na') tri('Now! after', Fa.nowA, truth.NA);
  if (Fa.waysB) ok(name + ': ways before is a lower bound', Fa.waysB.n <= truth.nB, [Fa.waysB, truth.nB]);
  if (Fa.waysA) ok(name + ': ways after is a lower bound', Fa.waysA.n <= truth.nA, [Fa.waysA, truth.nA]);
  // Every Solution the facts hold passes the engine's own checker on the right cubes.
  [['possB', before, 'impossible'], ['use', withIt, 'impossible'], ['avoid', without, 'impossible'], ['possA', after, 'impossible'], ['nowA', after, 'now']].forEach(([k, cs, md]) => {
    if (Fa[k] && Fa[k].r === 'yes') ok(name + ': ' + k + ' Solution checks', solOk(Fa[k].tokens, cs, md, pos), Fa[k].tokens);
  });
  // Each sentence kind against the truth.
  const K = T.kinds.concat(TL.kinds), has = k => K.indexOf(k) >= 0;
  if (has('gone')) ok(name + ': "no way left" is true', !truth.A);
  if (has('never')) ok(name + ': "no way even before" is true', !truth.B);
  if (has('lost')) ok(name + ': "a way used it" is true', truth.U);
  if (has('unused')) ok(name + ': "no way used it" is true', !truth.U);
  if (has('ruledout')) ok(name + ': "a way without it" is true', truth.V);
  if (has('needed')) ok(name + ': "every way used it" is true', !truth.V && truth.B);
  if (has('still')) ok(name + ': "still a way" is true', truth.A);
  if (has('now')) ok(name + ': "somebody could call Now!" is true', truth.NA);
  if (has('quiet')) ok(name + ': "safe, quiet" is true', !truth.NA && truth.A);
  if (process.env.WHY_SHOW) console.log('- ' + name + '\n  FULL: ' + [T.head].concat(T.lines).join(' ') + (T.ex ? '  [' + T.ex.label + ' ' + Why.tokText(T.ex.tokens) + ']' : '') + '\n  LIVE: ' + TL.lines.join(' ') + (TL.ex ? '  [' + Why.tokText(TL.ex.tokens) + ']' : ''));
  textOk(name + ' (full)', T); textOk(name + ' (live)', TL);
  if (T.ex) ok(name + ': full example checks', solOk(T.ex.tokens, T.ex.when === 'before' ? before : after, T.ex.when === 'now' ? 'now' : 'impossible', pos), T.ex);
  // Live: nothing about after the move, and the example is NOT a Solution any more (no hint).
  ok(name + ': live leaves out after-move facts', !TL.kinds.some(k => AFTER_KINDS.indexOf(k) >= 0), TL.kinds);
  if (TL.ex) {
    ok(name + ': live example is from before', TL.ex.when === 'before');
    ok(name + ': live example no longer works', !solOk(TL.ex.tokens, after, 'impossible', pos), TL.ex);
  }
  return { F: Fa, T, TL, truth };
}
// ---- Named positions: each fact type ----
const hasK = (r, k) => !!r && r.T.kinds.indexOf(k) >= 0;
let r;
// Forbidden
r = check('forbid a needed cube, other ways left', P({ goal: 9, res: '7 2 + 4 5 3' }), '7', 'forbidden');
ok('…says the way is gone', hasK(r, 'lost') && /made the Goal, but it uses the 7/.test(r.T.lines.join(' ')), r && r.T);
ok('…says other ways are left', hasK(r, 'still'), r && r.T);
r = check('forbid the last way', P({ goal: 9, res: '7 2 + 3' }), '7', 'forbidden');
ok('…says no way left (proved)', hasK(r, 'gone') && r.F.possA.r === 'no', r && r.T);
ok('…shows the lost way as cubes', !!r.T.ex && r.T.ex.when === 'before', r && r.T);
r = check('forbid an unneeded cube', P({ goal: 9, res: '7 2 + 8' }), '8', 'forbidden');
ok('…says it takes no way away', hasK(r, 'unused'), r && r.T);
ok('…shrugs about the reason (creature, quiet facts)', r.T.kinds.indexOf('shrug') >= 0 || r.T.kinds.length >= 2, r && r.T);
r = check('forbid when the Goal was already impossible', P({ goal: 50, res: '1 2 + 3' }), '3', 'forbidden');
ok('…says nothing changed (full)', hasK(r, 'never'), r && r.T);
ok('…live says nothing about it', r.TL.kinds.indexOf('never') < 0, r && r.TL);
// Required
r = check('require a cube some ways used', P({ goal: 9, res: '7 2 + 4 5 3' }), '7', 'required');
ok('…says a way without it no longer counts', hasK(r, 'ruledout'), r && r.T);
ok('…says a way with it is left', hasK(r, 'still'), r && r.T);
r = check('require a cube no way used', P({ goal: 9, res: '7 2 + 6' }), '6', 'required');
ok('…rules out 7 + 2 and says none is left', hasK(r, 'ruledout') && hasK(r, 'gone'), r && r.T);
r = check('require a cube every way used', P({ goal: 9, res: '7 2 + 8' }), '7', 'required');
ok('…says every way already used it', hasK(r, 'needed'), r && r.T);
r = check('require an operation sign', P({ goal: 6, res: '3 2 * + 4 1' }), '*', 'required');
ok('…facts are definite', r.F.use.r !== '?' && r.F.avoid.r !== '?', r && r.F.use);
// Permitted
r = check('permitted makes Now! possible', P({ goal: 9, perm: '7', res: '2 + 5 6' }), '+', 'permitted');
ok('…explains the Now! danger', hasK(r, 'now') && /call Now!/.test(r.T.lines.join(' ')), r && r.T);
ok('…shows the one-extra-cube way', !!r.T.ex && r.T.ex.when === 'now', r && r.T);
ok('…ranks high for the shake pop-up', r.T.score >= 90, r && r.T.score);
r = check('permitted, safe and quiet', P({ goal: 9, res: '7 2 + 5 6 8' }), '8', 'permitted');
ok('…says safe and quiet', hasK(r, 'quiet'), r && r.T);
ok('…not picked for the shake pop-up', r.T.score < 75, r && r.T.score);
r = check('permitted liked cube shows the taste', P({ goal: 8, res: '4 2 * 5 6 9' }), '*', 'permitted');
ok('…mentions the taste as a maybe', r.T.lines.some(l => /^Maybe that's why: Rusty loves × and ÷\.$/.test(l)), r && r.T);
// One cube from Now! via Required and Forbidden
r = check('required makes Now! possible', P({ goal: 5, req: '2', res: '3 + 7 8' }), '+', 'required');
ok('…explains the Now! danger', hasK(r, 'now'), r && r.T);
r = check('forbid leaves Now! off', P({ goal: 5, perm: '2 +', res: '3 7 8 9' }), '3', 'forbidden');
ok('…no Now! after (proved)', r.F.nowA.r === 'no', r && r.F.nowA);
// Resources running low and the last cube
r = check('last cube to Required', P({ goal: 9, req: '7 +', forb: '5', res: '2' }), '2', 'required');
ok('…says it was the last Resource cube', hasK(r, 'last'), r && r.T);
r = check('one cube left after the move', P({ goal: 9, perm: '7 +', res: '2 4' }), '4', 'forbidden');
ok('…mentions the one cube left or bigger facts', r.T.kinds.length >= 1, r && r.T);
r = check('two cubes left after the move', P({ goal: 9, perm: '7 +', res: '2 4 6' }), '6', 'permitted');
// Fractions
r = check('fractions: forbid the 1', P({ goal: F(1, 2), fr: true, res: '1 2 / 3 6 +' }), '1', 'forbidden');
ok('…Solutions use fractions mode', r.F.possB.r === 'yes', r && r.F.possB);
r = check('fractions: require the 3', P({ goal: F(1, 2), fr: true, res: '1 2 / 3 6' }), '3', 'required');
r = check('fractions: permitted ÷', P({ goal: F(3, 2), fr: true, perm: '3', res: '/ 2 4 5' }), '/', 'permitted');
// Three zones mixed
r = check('mixed zones: forbid', P({ goal: 9, req: '2', perm: '+', forb: '5', res: '7 3 4 * 6' }), '7', 'forbidden');
r = check('mixed zones: require', P({ goal: 9, req: '2', perm: '+', forb: '5', res: '7 3 4 * 6' }), '3', 'required');
r = check('mixed zones: permitted', P({ goal: 9, req: '2', perm: '+', forb: '5', res: '7 3 4 * 6' }), '*', 'permitted');
r = check('mixed zones: forbid the ×', P({ goal: 12, req: '3', perm: '4', forb: '1', res: '* + 8 2 6' }), '*', 'forbidden');
r = check('mixed zones: powers', P({ goal: 8, req: '2', perm: '^', res: '3 + 5 6' }), '3', 'forbidden');
// The kid's own move: same facts, no personality, neutral words
r = check('own move removes the last way', P({ goal: 9, res: '7 2 + 3' }), '7', 'forbidden', { mine: true, isAI: false, name: 'Champ', taste: null });
ok('…starts with "You"', /^You put the 7/.test(r.T.head), r && r.T.head);
ok('…gives the Impossible! information neutrally', hasK(r, 'gone') && /you would have to show a Solution/.test(r.T.lines.join(' ')), r && r.T);
r = check('own quiet move has no personality line', P({ goal: 9, res: '7 2 + 5 6 8' }), '8', 'permitted', { mine: true, isAI: false, name: 'Champ', taste: null });
ok('…no shrug or taste', r.T.kinds.indexOf('shrug') < 0 && r.T.kinds.indexOf('taste') < 0, r && r.T);
// ---- Twin cubes (two cubes with the same face): a swap is not a lost way (found in play: "without the 2" used the other 2) ----
r = check('twins: forbid one 7 when another 7 is free', P({ goal: 9, res: '7 7 2 + 3' }), '7', 'forbidden');
ok('…does not say the way is gone', !hasK(r, 'lost') && hasK(r, 'unused'), r && r.T);
ok('…says no way needed every 7', /needed every 7 cube/.test(r.T.lines.join(' ')), r && r.T);
r = check('twins: forbid one 7 when the way needs both', P({ goal: 14, res: '7 7 + 3' }), '7', 'forbidden');
ok('…says the way needed both 7s', hasK(r, 'lost') && /needs both 7 cubes/.test(r.T.lines.join(' ')), r && r.T);
r = check('twins: require a 2 when ways use the other 2', P({ goal: 9, res: '2 2 * 7 - 5 4' }), '2', 'required');
ok('…never shows a "without the 2" way that has a 2', !(r.T.kinds.indexOf('ruledout') >= 0 && /\b2\b/.test(Why.tokText(r.T.ex.tokens))), r && r.T);
r = check('twins: require a second 2', P({ goal: 4, req: '2', res: '2 + 1 3' }), '2', 'required');
ok('…talks about fewer 2s', hasK(r, 'ruledout') ? /fewer 2 cubes/.test(r.T.lines.join(' ')) : true, r && r.T);
r = check('twins: two + cubes, forbid one', P({ goal: 10, res: '+ + 2 3 5' }), '+', 'forbidden');
ok('…says the way needed both + cubes', hasK(r, 'lost') && /needs both \+ cubes/.test(r.T.lines.join(' ')), r && r.T);

// ---- Variation cards and several cards at once (checked against a long solver run) ----
const M = (vars, set, fr = false) => Eq.mathMode(fr, vars, null, set);
r = check('Average card: forbid the +', P({ goal: 5, fr: M(['average']), res: '4 6 + 1 2 3' }), '+', 'forbidden', null, false);
ok('…the lost way uses the Average +', hasK(r, 'lost') || hasK(r, 'unused') || hasK(r, 'unsure'), r && r.T);
r = check('Average card: require the 6', P({ goal: 5, fr: M(['average']), res: '4 6 + 1 2 3' }), '6', 'required', null, false);
r = check('Use It Again card: permitted ×', P({ goal: 8, fr: M(['multiops']), perm: '2', res: '* 4 3 1' }), '*', 'permitted', null, false);
r = check('Use It Again card: forbid the 2', P({ goal: 8, fr: M(['multiops']), res: '2 * 4 3 1' }), '2', 'forbidden', null, false);
r = check('Upside-down card: forbid the 6', P({ goal: 9, fr: M(['upside']), res: '6 3 + 1 5' }), '6', 'forbidden', null, false);
r = check('Base 8 card: require the 7', P({ goal: 9, fr: M(['basem'], { base: 8 }), res: '7 2 + 1 3' }), '7', 'required', null, false);
r = check('two cards at once (tournament practice)', P({ goal: 5, fr: M(['average', 'multiops'], { div: 'E' }), res: '4 6 + 2 8 1' }), '4', 'forbidden', null, false);
r = check('two cards at once: permitted', P({ goal: 6, fr: M(['upside', 'multiops'], { div: 'M' }), perm: '9', res: '+ 3 1 2' }), '+', 'permitted', null, false);
r = check('fractions plus a card', P({ goal: F(5, 2), fr: M(['average'], null, true), res: '2 3 + / 5 1' }), '/', 'forbidden', null, false);

// ---- A grid of small positions, every zone, all against the brute force ----
const GRID = [
  { goal: 10, res: '5 2 * + 3 7' }, { goal: 4, res: '8 2 / - 6 1' }, { goal: 1, res: '3 2 - 4 5 +' },
  { goal: 12, req: '6', res: '2 * + 4 8' }, { goal: 7, perm: '-', res: '9 2 1 8 +' }, { goal: 16, res: '2 ^ 4 * 8 1' },
  { goal: 0, res: '3 3 - 5 +' }, { goal: 15, forb: '+', res: '3 5 * 1 2 -' }
];
GRID.forEach((g, gi) => {
  const pos = P(g), resSyms = pos.cubes.filter(c => c.zone === 'resources').map(c => c.s);
  ['forbidden', 'required', 'permitted'].forEach((z, zi) => {
    const s = resSyms[(gi + zi * 2) % resSyms.length];
    check('grid ' + gi + ' ' + z + ' ' + s, pos, s, z);
  });
});
// ---- Slicing: run() gives the same answer one solver call at a time ----
{
  const pos = P({ goal: 9, res: '7 2 + 4 5 3' }), inp = input(pos, '7', 'forbidden');
  const a = Why.analyze(inp, { sliceMs: 400, budgetMs: 4000 });
  let b = null, slices = 0;
  Why.run(inp, { sliceMs: 400, budgetMs: 4000 }, res => { b = res; }, fn => { slices++; fn(); });
  ok('run() in slices finishes', !!b);
  ok('run() in slices gives the same words', b && JSON.stringify(a.text) === JSON.stringify(b.text), [a.text, b && b.text]);
  ok('run() really sliced (one solver call per slice)', slices + 1 >= b.facts.calls, [slices, b.facts.calls]);
  ok('run() reports its longest slice', typeof b.facts.worstSlice === 'number');
  ok('a move that is not from Resources is ignored', Why.analyze(Object.assign({}, inp, { id: pos.cubes.find(c => c.zone === 'goal').id }), {}) === null);
  ok('a bad zone is ignored', Why.analyze(Object.assign({}, inp, { zone: 'goal' }), {}) === null);
}

// ---- Fuzz: 300 rolled positions (Eq.roll), random play, then one more move explained ----
{
  const SL = 60, BU = 300, rand = Eq.rng(20261113);
  const ri = n => Math.floor(rand() * n);
  const modes = [false, true, M(['average']), M(['multiops']), M(['upside']), M(['average', 'multiops'], { div: 'E' })];
  let worst = 0, worstTotal = 0, gone = 0, nos = 0, yes = 0, threw = 0, maxWall = 0, looks = 0, slowCalls = 0, slowLooks = 0;
  for (let k = 0; k < 300; k++) {
    const cubes = Eq.roll(rand).map((c, i) => ({ id: c.id, s: c.s, color: c.color, zone: 'resources', order: i }));
    const fr = modes[k % modes.length];
    const ideas = Eq.goalIdeas(cubes.map(c => c.s), { fractions: fr }) || [];
    if (!ideas.length) continue;
    const idea = ideas[ri(ideas.length)];
    idea.tokens.forEach(s => { const c = cubes.find(x => x.zone === 'resources' && x.s === (Eq.cubeOf(s) || s)); if (c) c.zone = 'goal'; });
    const moves = ri(20);
    for (let j = 0; j < moves; j++) {
      const res = cubes.filter(c => c.zone === 'resources'); if (res.length <= 3) break;
      res[ri(res.length)].zone = ['required', 'permitted', 'forbidden', 'forbidden'][ri(4)];
    }
    cubes.forEach((c, i) => { c.order = i + (c.zone === 'resources' ? 0 : 100); });
    const res = cubes.filter(c => c.zone === 'resources');
    const mv = res[ri(res.length)], zone = res.length < 2 ? 'required' : ['required', 'permitted', 'forbidden'][ri(3)];
    const pos = { cubes, goal: idea.value, fr };
    const inp = { cubes, id: mv.id, zone, goal: idea.value, fractions: fr, name: 'Ollie', isAI: true, taste: { text: 'Loves prime numbers: 2, 3, 5, 7, 11, 13…', syms: ['2', '3', '5', '7'] } };
    let R = null; const t0 = now();
    try { R = Why.analyze(inp, { sliceMs: SL, budgetMs: BU }); } catch (e) { threw++; console.log('threw', e); continue; }
    const wall = now() - t0; if (wall > maxWall) maxWall = wall;
    if (!R) { ok('fuzz ' + k + ': analysed', false); continue; }
    const Fz = R.facts, T = R.text, TL = Why.compose(Object.assign({}, Fz, { live: true }));
    worst = Math.max(worst, Fz.worst); worstTotal = Math.max(worstTotal, Fz.spent);
    looks++; if (Fz.worst > SL + 60) slowCalls++; if (Fz.spent > BU + SL + 60) slowLooks++;
    const after = Why.applyMove(cubes, mv.id, zone);
    [['possB', cubes, 'impossible'], ['use', Why.applyMove(cubes, mv.id, 'required'), 'impossible'], ['avoid', Why.applyMove(cubes, mv.id, 'forbidden'), 'impossible'],
      ['possA', after, 'impossible'], ['nowA', after, 'now'], ['nowB', cubes, 'now']].forEach(([key, cs, md]) => {
      const f = Fz[key]; if (!f) return;
      if (f.r === 'yes') { yes++; ok('fuzz ' + k + ': ' + key + ' Solution checks', solOk(f.tokens, cs, md, pos), f.tokens); }
    });
    if (T.ex) ok('fuzz ' + k + ': example checks', solOk(T.ex.tokens, T.ex.when === 'before' ? cubes : after, T.ex.when === 'now' ? 'now' : 'impossible', pos), T.ex);
    if (TL.ex) ok('fuzz ' + k + ': live example no longer works', !solOk(TL.ex.tokens, after, 'impossible', pos), TL.ex);
    const long = (cs, md) => { const st = Why.stOf(cs); return Eq.solve({ goal: pos.goal, req: st.req, opt: st.perm, res: st.res, mode: md, fractions: fr, maxDigits: 6, timeMs: 2000 }); };
    if (T.kinds.indexOf('gone') >= 0) { gone++; const L = long(after, 'impossible'); ok('fuzz ' + k + ': "no way left" holds up', !L.found, L); }
    if (T.kinds.indexOf('never') >= 0) { const L = long(cubes, 'impossible'); ok('fuzz ' + k + ': "no way even before" holds up', !L.found, L); }
    if (Fz.possA.r === 'no') { nos++; const L = long(after, 'impossible'); ok('fuzz ' + k + ': possA "no" holds up', !L.found, L); }
    if (Fz.nowA.r === 'no') { const L = long(after, 'now'); ok('fuzz ' + k + ': Now! "no" holds up', !L.found, L); }
    textOk('fuzz ' + k + ' (full)', T); textOk('fuzz ' + k + ' (live)', TL);
    ok('fuzz ' + k + ': live leaves out after-move facts', !TL.kinds.some(x => AFTER_KINDS.indexOf(x) >= 0), TL.kinds);
  }
  ok('fuzz never threw', threw === 0, threw);
  // Time caps: a busy machine (other programs, garbage collection) can stretch a rare call, so 99% must stay near the cap.
  ok('fuzz: 99% of looks keep every solver call near its cap (' + SL + ' ms + 60)', slowCalls <= looks * 0.01, [slowCalls, looks]);
  ok('fuzz: 99% of looks stay near the whole budget (' + BU + ' ms)', slowLooks <= looks * 0.01, [slowLooks, looks]);
  console.log('fuzz: longest solver call ' + Math.round(worst) + ' ms (cap ' + SL + '), longest whole look ' + Math.round(worstTotal) + ' ms solver / ' + Math.round(maxWall) + ' ms wall (budget ' + BU + '); ' +
    yes + ' Solutions re-checked, ' + nos + ' proved "no way left" facts, ' + gone + ' "no way left" sentences');
}
console.log('why tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail && fail <= 2) console.log('(If only the two "99% of looks" timing checks failed, the machine was busy: rerun once.)');
process.exit(fail ? 1 : 0);
