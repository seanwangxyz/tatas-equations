// Tests for MATCH MISSIONS + SKILLS PASSPORT (js/missions.js, a house feature): the catalogue, every checker
// against synthetic match records (positive and negative), the facts taken from Solutions, the chooser over
// 2,000 seeded matches, the swap, diminishing repeats, ranks, the cloud-save merge (and the copy in
// docs/handoff/missions.md), the save size, and a whole match driven through Missions.note.
// Run with:  node tests/missions.test.js
// Loads the real js/engine.js, js/config.js (OPPONENTS, STAGES, S, esc, today) and js/missions.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const ctx = vm.createContext({ console, location: { search: '' }, window: {}, Math, Date, JSON, setTimeout, clearTimeout });
['js/engine.js', 'js/config.js', 'js/missions.js'].forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
const M = vm.runInContext('Missions', ctx);
const Eq = vm.runInContext('Eq', ctx);
const OPP = vm.runInContext('OPPONENTS', ctx);
const STAGES = vm.runInContext('STAGES', ctx);

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
const clone = x => JSON.parse(JSON.stringify(x));

// ---------------- the catalogue ----------------
const CAT = M.CATALOGUE, FAM = M.FAMILIES.map(f => f.id);
ok('at least 40 missions', CAT.length >= 40, CAT.length);
ok('ids unique', new Set(CAT.map(x => x.id)).size === CAT.length);
CAT.forEach(x => {
  ok('family ' + x.id, FAM.indexOf(x.f) >= 0);
  ok('difficulty 1-5 ' + x.id, x.d >= 1 && x.d <= 5 && Math.round(x.d) === x.d);
  ok('text and tip ' + x.id, typeof x.t === 'string' && x.t.length > 5 && typeof x.h === 'string' && x.h.length > 5);
  ok('kind words ' + x.id, !/\b(fail|failed|wrong|missed|lose|lost|bad|hurry|fast|quick|seconds?)\b/i.test(x.t + ' ' + x.h), x.t + ' / ' + x.h);
  ok('checker ' + x.id, typeof x.c === 'function');
});
FAM.forEach(f => ok('family has 3+ missions ' + f, CAT.filter(x => x.f === f).length >= 3));
[1, 2, 3, 4, 5].forEach(d => ok('some missions at difficulty ' + d, CAT.some(x => x.d === d)));
OPP.forEach(o => ok('persona for ' + o.id, Array.isArray(M.PERSONA[o.id]) && M.PERSONA[o.id].length > 0));
Object.keys(M.PERSONA).forEach(k => M.PERSONA[k].forEach(id => ok('persona mission exists ' + id, CAT.some(x => x.id === id))));
ok('ranks ascend', M.RANKS.every((r, i) => !i || r.at > M.RANKS[i - 1].at) && M.RANKS[0].at === 0);
ok('every rank has a reward', M.RANKS.every(r => r.reward && r.reward.name));
ok('rank rewards are existing cosmetics or covers', M.RANKS.every(r => {
  const w = r.reward, list = { skin: 'SKINS', mat: 'MATS', victory: 'VICTORIES' }[w.kind];
  return w.kind === 'cover' ? !!M.COVERS[w.id] : !!list && vm.runInContext(list, ctx).some(c => c.id === w.id);
}));

// ---------------- a tiny match builder (real tokens, real Eq) ----------------
// tk('3+4', 10) -> [{s:'3',id:10},{s:'+',id:11},{s:'4',id:12}] ; parentheses stay plain strings
function tk(expr, base) { let id = base || 0; return expr.split('').map(ch => (ch === '(' || ch === ')') ? ch : { s: ch, id: id++ }); }
function val(expr, fr) { const e = Eq.evaluate(expr.split(''), { fractions: fr === undefined ? true : fr }); if (!e.ok) throw new Error('bad test expr ' + expr); return e.value; }
function sol(expr, okv, base) { const toks = tk(expr, base || 300), e = Eq.evaluate(expr.split(''), { fractions: true }); return { ok: okv !== false, tokens: toks, chk: { ok: okv !== false, madeFraction: !!(e.ok && e.madeFraction) } }; }
function Rec(np) {
  const R = M.newRecord(np || 2), cubes = {}; let goalV = null, shake = 0;
  const api = {
    R, cubes,
    goal(by, expr, o) { o = o || {}; const toks = tk(expr, o.base || 0); (o.big || []).forEach(k => { cubes[toks[k].id] = { color: 'big' }; }); goalV = val(expr); M.apply(R, 'goal', { by, tokens: toks, val: goalV, cubes, card: o.card || null, shake: ++shake }); return api; },
    move(by, s, zone, o) { o = o || {}; M.apply(R, 'move', { by, id: o.id == null ? 900 + R.moves.length : o.id, s, zone, bonus: !!o.bonus }); return api; },
    call(by, kind, mover, tp) { M.apply(R, 'challenge', { by, kind, mover, tp: tp == null ? null : tp }); return api; },
    shake(phase, pts, sols, o) { o = o || {}; M.apply(R, 'shake', { phase, pts, sols: sols || {}, hint: !!o.hint, cubes: o.cubes || cubes, fr: o.fr === undefined ? true : o.fr, goal: o.goal || goalV, card: o.card || null }); return api; }
  };
  return api;
}
// A correct (or not) Now! Solution by `me` against `o1`; a last-cube round.
function nowSol(r, me, o1, expr, okv, extra) { const s = {}; s[me] = sol(expr, okv, extra && extra.base); r.call(me, 'now', o1).shake('challenge', { [me]: okv === false ? 2 : 6, [o1]: okv === false ? 6 : 2 }, s, extra); return r; }
function lastSol(r, me, o1, expr, okv, extra) { const s = {}; s[me] = sol(expr, okv); s[o1] = sol('1+1', false); r.shake('lastwrite', { [me]: okv === false ? 2 : 4, [o1]: 2 }, s, extra); return r; }
// Each scenario: (me, o1, o2) -> builder. pos must be true for me = 0; the same scenario with the roles swapped
// (me = 1: someone else did it) must be false, and neg must be false.
const SC = {
  g_set: { pos: (me, o) => Rec().goal(me, '3+4'), neg: (me, o) => Rec().goal(o, '3+4') },
  g_two: { pos: (me, o) => Rec().goal(me, '3+4'), neg: (me, o) => Rec().goal(me, '7') },
  g_minus: { pos: (me, o) => Rec().goal(me, '9-2'), neg: (me, o) => Rec().goal(me, '9+2') },
  g_three: { pos: (me, o) => Rec().goal(me, '3+4'), neg: (me, o) => Rec().goal(me, 'r9') },
  g_big20: { pos: (me, o) => Rec().goal(me, '8*3'), neg: (me, o) => Rec().goal(me, '4*5') },
  g_times: { pos: (me, o) => Rec().goal(me, '4*5'), neg: (me, o) => Rec().goal(me, '4+5') },
  g_div: { pos: (me, o) => Rec().goal(me, '8/2'), neg: (me, o) => Rec().goal(me, '8-2') },
  g_paren: { pos: (me, o) => Rec().goal(me, '(2+3)*4'), neg: (me, o) => Rec().goal(me, '2+3*4') },
  g_big50: { pos: (me, o) => Rec().goal(me, '9*6'), neg: (me, o) => Rec().goal(me, '9*5') },
  g_frac: { pos: (me, o) => Rec().goal(me, '3/4'), neg: (me, o) => Rec().goal(me, '8/4') },
  g_pow: { pos: (me, o) => Rec().goal(me, '2^3'), neg: (me, o) => Rec().goal(me, '2*3') },
  g_five: { pos: (me, o) => Rec().goal(me, '3+4*2'), neg: (me, o) => Rec().goal(me, '3+4') },
  o_sol: { pos: (me, o) => nowSol(Rec().goal(o, '3+4'), me, o, '3+4'), neg: (me, o) => nowSol(Rec().goal(o, '3+4'), me, o, '3+4', false) },
  o_two_ops: { pos: (me, o) => nowSol(Rec().goal(o, '7'), me, o, '5+3-1'), neg: (me, o) => nowSol(Rec().goal(o, '9'), me, o, '5+3+1') },
  o_pm: { pos: (me, o) => nowSol(Rec().goal(o, '7'), me, o, '6+4-3'), neg: (me, o) => nowSol(Rec().goal(o, '6'), me, o, '6*4/4') },
  o_times: { pos: (me, o) => nowSol(Rec().goal(o, '6*2'), me, o, '3*4'), neg: (me, o) => nowSol(Rec().goal(o, '7'), me, o, '3+4') },
  o_div: { pos: (me, o) => nowSol(Rec().goal(o, '4'), me, o, '8/2'), neg: (me, o) => nowSol(Rec().goal(o, '8*2'), me, o, '8*2') },
  o_paren: { pos: (me, o) => nowSol(Rec().goal(o, '5*4'), me, o, '(2+3)*4'), neg: (me, o) => nowSol(Rec().goal(o, '7*2'), me, o, '2+3*4') },
  o_five: { pos: (me, o) => nowSol(Rec().goal(o, '6'), me, o, '1+2+3'), neg: (me, o) => nowSol(Rec().goal(o, '3'), me, o, '1+2') },
  o_pow: { pos: (me, o) => nowSol(Rec().goal(o, '8'), me, o, '2^3'), neg: (me, o) => nowSol(Rec().goal(o, '6'), me, o, '2*3') },
  o_root: { pos: (me, o) => nowSol(Rec().goal(o, '4'), me, o, 'r9+1'), neg: (me, o) => nowSol(Rec().goal(o, '9+1'), me, o, '9+1') },
  o_all4: { pos: (me, o) => nowSol(Rec().goal(o, '9'), me, o, '8/2*3+1-4'), neg: (me, o) => nowSol(Rec().goal(o, '9'), me, o, '8/2*3+1+4', false) },
  o_seven: { pos: (me, o) => nowSol(Rec().goal(o, '9+1'), me, o, '1+2+3+4'), neg: (me, o) => nowSol(Rec().goal(o, '6'), me, o, '1+2+3') },
  f_zero: { pos: (me, o) => nowSol(Rec().goal(o, '5'), me, o, '5+0'), neg: (me, o) => nowSol(Rec().goal(o, '6'), me, o, '5+1') },
  f_frac: { pos: (me, o) => nowSol(Rec().goal(o, '1'), me, o, '1/2+1/2'), neg: (me, o) => nowSol(Rec().goal(o, '2'), me, o, '2/2+1') },
  f_neg: { pos: (me, o) => nowSol(Rec().goal(o, '6'), me, o, '(2-5)+9'), neg: (me, o) => nowSol(Rec().goal(o, '6'), me, o, '(5-2)+3') },
  f_fracgoal: { pos: (me, o) => nowSol(Rec().goal(o, '1/2'), me, o, '2/4'), neg: (me, o) => nowSol(Rec().goal(o, '2'), me, o, '4/2') },
  f_frac_neg: { pos: (me, o) => nowSol(Rec().goal(o, '7/2'), me, o, '(1-4)/2+5'), neg: (me, o) => nowSol(Rec().goal(o, '1'), me, o, '1/2+1/2') },
  c_nohint: { pos: (me, o) => Rec().goal(o, '3+4').shake('lastwrite', { [me]: 4, [o]: 2 }, {}), neg: (me, o) => Rec().goal(o, '3+4').shake('lastwrite', { [me]: 4, [o]: 2 }, {}, { hint: true }) },
  c_last: { pos: (me, o) => lastSol(Rec().goal(o, '3+4'), me, o, '3+4'), neg: (me, o) => lastSol(Rec().goal(o, '3+4'), me, o, '3+4', false) },
  c_now: { pos: (me, o) => nowSol(Rec().goal(o, '3+4'), me, o, '3+4'), neg: (me, o) => nowSol(Rec().goal(o, '3+4'), me, o, '3+3', false) },
  c_defend: { pos: (me, o) => Rec().goal(o, '3+4').call(o, 'impossible', me).shake('challenge', { [me]: 6, [o]: 2 }, { [me]: sol('3+4') }),
    neg: (me, o) => Rec().goal(o, '3+4').call(o, 'impossible', me).shake('challenge', { [me]: 2, [o]: 6 }, { [me]: sol('3+3', false) }) },
  c_twoshakes: { pos: (me, o) => Rec().goal(o, '3+4').shake('lastwrite', { [me]: 4, [o]: 2 }, {}).goal(me, '5').shake('lastwrite', { [me]: 6, [o]: 2 }, {}),
    neg: (me, o) => Rec().goal(o, '3+4').shake('lastwrite', { [me]: 4, [o]: 2 }, {}).goal(me, '5').shake('lastwrite', { [me]: 2, [o]: 4 }, {}) },
  c_imp: { pos: (me, o) => Rec().goal(o, '3+4').call(me, 'impossible', o).shake('challenge', { [me]: 6, [o]: 2 }, { [o]: sol('3+3', false) }),
    neg: (me, o) => Rec().goal(o, '3+4').call(me, 'impossible', o).shake('challenge', { [me]: 2, [o]: 6 }, { [o]: sol('3+4') }) },
  c_nowfail: { pos: (me, o) => Rec().goal(me, '3+4').call(o, 'now', me).shake('challenge', { [me]: 6, [o]: 2 }, { [o]: sol('3+3', false) }),
    neg: (me, o) => Rec().goal(me, '3+4').call(o, 'now', me).shake('challenge', { [me]: 2, [o]: 6 }, { [o]: sol('3+4') }) },
  s_required: { pos: (me, o) => Rec().goal(o, '3+4').move(me, '3', 'required'), neg: (me, o) => Rec().goal(o, '3+4').move(me, '3', 'permitted') },
  s_forbid_op: { pos: (me, o) => Rec().goal(o, '3+4').move(me, '+', 'forbidden'), neg: (me, o) => Rec().goal(o, '3+4').move(me, '3', 'forbidden') },
  s_forbid_num: { pos: (me, o) => Rec().goal(o, '3+4').move(me, '3', 'forbidden'), neg: (me, o) => Rec().goal(o, '3+4').move(me, '+', 'forbidden') },
  s_forbid3: { pos: (me, o) => Rec().goal(o, '3+4').move(me, '1', 'forbidden').move(o, '2', 'permitted').move(me, '-', 'forbidden').move(o, '5', 'required').move(me, '6', 'forbidden'),
    neg: (me, o) => Rec().goal(o, '3+4').move(me, '1', 'forbidden').move(me, '-', 'forbidden').shake('lastwrite', { [me]: 2, [o]: 2 }, {}).goal(me, '5').move(me, '6', 'forbidden') },
  s_req_used: { pos: (me, o) => nowSol(Rec().goal(o, '7').move(me, '3', 'required', { id: 100 }), me, o, '3+4', true, { base: 100 }),
    neg: (me, o) => nowSol(Rec().goal(o, '7').move(me, '3', 'required', { id: 100 }), me, o, '3+4', true, { base: 200 }) },
  s_three: { pos: (me, o) => Rec().goal(o, '3+4').move(me, '1', 'forbidden').move(me, '2', 'permitted').move(me, '6', 'forbidden').shake('lastwrite', { [me]: 4, [o]: 2 }, {}),
    neg: (me, o) => Rec().goal(o, '3+4').move(me, '1', 'forbidden').move(me, '2', 'permitted').shake('lastwrite', { [me]: 4, [o]: 2 }, {}) },
  v_goal: { pos: (me, o) => Rec().goal(me, '3+4', { card: 'wild0' }), neg: (me, o) => Rec().goal(me, '3+4') },
  v_play: { pos: (me, o) => nowSol(Rec().goal(o, '7'), me, o, '3+4', true, { card: 'wild0' }), neg: (me, o) => nowSol(Rec().goal(o, '7'), me, o, '3+4') },
  v_power: { pos: (me, o) => nowSol(Rec().goal(o, '9+6'), me, o, '12+3', true, { card: 'twodigit', goal: { n: 15, d: 1 } }), neg: (me, o) => nowSol(Rec().goal(o, '7'), me, o, '3+4', true, { card: 'wild0' }) },
  b_forbid: { pos: (me, o) => Rec().goal(o, '3+4').move(me, '7', 'forbidden', { bonus: true }), neg: (me, o) => Rec().goal(o, '3+4').move(me, '7', 'forbidden') },
  b_goal: { pos: (me, o) => Rec().goal(me, '3+4', { big: [2] }), neg: (me, o) => Rec().goal(me, '3+4') },
  b_use: { pos: (me, o) => { const r = Rec().goal(o, '7'); r.cubes[300] = { color: 'power' }; return nowSol(r, me, o, '3+4'); }, neg: (me, o) => nowSol(Rec().goal(o, '7'), me, o, '3+4') },
  t_goal3: { pos: (me, o) => Rec(3).goal(me, '3+4'), neg: (me, o) => Rec(2).goal(me, '3+4') },
  t_last3: { pos: (me, o) => lastSol(Rec(3).goal(o, '3+4'), me, o, '3+4'), neg: (me, o) => lastSol(Rec(2).goal(o, '3+4'), me, o, '3+4') },
  t_third: { pos: (me, o, o2) => Rec(3).goal(o, '3+4').call(o, 'now', o2, me).shake('challenge', { [o]: 6, [o2]: 2, [me]: 4 }, { [o]: sol('3+4'), [me]: sol('4+3') }),
    neg: (me, o, o2) => Rec(3).goal(o, '3+4').call(o, 'now', o2, me).shake('challenge', { [o]: 6, [o2]: 2, [me]: 2 }, { [o]: sol('3+4'), [me]: sol('4+4', false) }) },
  t_call3: { pos: (me, o) => nowSol(Rec(3).goal(o, '3+4'), me, o, '3+4'), neg: (me, o) => nowSol(Rec(2).goal(o, '3+4'), me, o, '3+4') }
};
CAT.forEach(x => ok('scenario written for ' + x.id, !!SC[x.id]));
Object.keys(SC).forEach(id => {
  const s = SC[id];
  let pos, swapped, neg;
  try { pos = M.check(id, s.pos(0, 1, 2).R); swapped = M.check(id, s.pos(1, 0, 2).R); neg = M.check(id, s.neg(0, 1, 2).R); } catch (e) { ok('scenario runs ' + id, false, String(e)); return; }
  ok('positive ' + id, pos === true);
  ok('someone else did it ' + id, swapped === false);
  ok('negative ' + id, neg === false);
});
// ---------------- facts taken from Solutions ----------------
ok('negUsed: dips below zero', M.negUsed('(2-5)+9'.split(''), true) === true);
ok('negUsed: 9 - 5 + 2 stays positive', M.negUsed('9-5+2'.split(''), true) === false);
ok('negUsed: 2 - 5 + 9 is read left to right (−3 on the way)', M.negUsed('2-5+9'.split(''), true) === true);
let sf = M.solFacts({ by: 0, mode: 'now', role: 'w', ok: true, tokens: tk('3+3'), chk: null, cubes: {}, fr: true, goal: { n: 6, d: 1 }, card: 'multiops' });
ok('vp: a cube used twice (Use It Again)', (() => { const t = [{ s: '3', id: 1 }, { s: '+', id: 2 }, { s: '3', id: 1 }]; return M.solFacts({ ok: true, tokens: t, cubes: {}, fr: true, goal: { n: 6, d: 1 }, card: 'multiops' }).vp; })() === true);
ok('vp: plain Solution under a card is not the card power', sf.vp === false);
ok('vp: Three Operations counts any correct Solution', M.solFacts({ ok: true, tokens: tk('1+2+3-4'), cubes: {}, fr: true, goal: { n: 2, d: 1 }, card: 'threeops' }).vp === true);
ok('vp: needs a correct Solution', M.solFacts({ ok: false, tokens: tk('12+3'), cubes: {}, fr: true, goal: { n: 15, d: 1 }, card: 'twodigit' }).vp === false);
ok('frac from evaluate when chk missing', M.solFacts({ ok: true, tokens: tk('1/2+1/2'), cubes: {}, fr: true, goal: { n: 1, d: 1 } }).frac === true);
ok('a wrong Solution never counts as below zero', M.solFacts({ ok: false, tokens: tk('(2-5)+9'), cubes: {}, fr: true }).neg === false);
ok('goal facts: fraction, ops, brackets', (() => { const g = M.goalFacts({ by: 0, tokens: tk('(3)/4'), val: { n: 3, d: 4 }, cubes: {} }); return g.frac && g.ops.indexOf('/') >= 0 && g.par && g.cubes === 3; })());
ok('a no-Goal challenge Solution is mode free', (() => { const r = Rec().goal(1, '3+4'); r.shake('goal', { 0: 6, 1: 2 }, { 0: sol('3+4') }); return r.R.sols[0].mode === 'free' && M.check('o_sol', r.R); })());
ok('a challenge record clears for the next shake', (() => { const r = Rec().goal(1, '3+4').call(0, 'now', 1); r.shake('challenge', { 0: 6, 1: 2 }, { 0: sol('3+4') }); return r.R.pend === null && r.R.calls.length === 1; })());

// ---------------- the chooser: 2,000 seeded matches ----------------
let seed = 4242; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = n => Math.floor(rnd() * n), coin = () => rnd() < 0.5, pickA = a => a[ri(a.length)];
const ALL_OPS = ['+', '-', '*', '/', '^', 'r'];
function randomCtx() {
  const mode = pickA(M.MODES);
  let ops, fr;
  if (rnd() < 0.8) { const st = STAGES[ri(STAGES.length)]; ops = st.ops.slice(); fr = st.fractions; }
  else { ops = ALL_OPS.filter(() => coin()); if (!ops.length) ops = ['+']; fr = coin(); } // Tata's hand-picked operations
  const np = mode === 'ai3' || mode === 'p3' ? 3 : mode === 'tourney' ? 2 + ri(2) : 2;
  const opp = mode === 'pvp' || (mode === 'p3' && coin()) ? null : pickA(OPP).id;
  return { mode, ops, fr, np, cards: coin(), bonus: rnd() < 0.3, shakes: pickA([1, 3, 5]), oppId: opp, sig: pickA([null, null, 'card', 'bonus']) };
}
function randomSave() {
  const m = M.blank(); m.n = ri(300);
  CAT.forEach(x => { if (rnd() < 0.35) m.s[x.id] = [ri(6), '2026-0' + (1 + ri(9)) + '-1' + ri(9), ri(15) - 1, ri(9), ri(3)]; });
  return m;
}
function randomBoot() { const b = {}; CAT.forEach(x => { if (rnd() < 0.1) b[x.id] = 1; }); return b; }
const byId = {}; CAT.forEach(x => { byId[x.id] = x; });
let chooserBad = {}, swapBad = {}, nSwaps = 0, sameD = 0;
const bump = (o, k, ex) => { o[k] = (o[k] || 0) + 1; if (o[k] === 1) console.log('  first problem (' + k + '):', JSON.stringify(ex).slice(0, 300)); };
for (let i = 0; i < 2000; i++) {
  const c = randomCtx(), sv = randomSave(), boot = randomBoot(), n = 1 + ri(5000);
  const list = M.choose(c, sv, n, boot);
  if (list.length !== 3) bump(chooserBad, 'three missions', { c, list });
  if (list.some(p => !M.available(byId[p.id], c))) bump(chooserBad, 'impossible mission offered', { c, list });
  if (new Set(list.map(p => byId[p.id].f)).size !== list.length) bump(chooserBad, 'two of the same skill', { c, list });
  if (new Set(list.map(p => p.id)).size !== list.length) bump(chooserBad, 'duplicate mission', { c, list });
  if (list.map(p => p.role).join() !== 'comfy,stretch,wild') bump(chooserBad, 'roles', { list });
  if (JSON.stringify(M.choose(c, clone(sv), n, boot)) !== JSON.stringify(list)) bump(chooserBad, 'not deterministic', { c });
  // the stretch is a never-shown skill whenever one exists in another family than the warm-up
  const comfyF = byId[list[0].id].f, neverOk = CAT.some(x => M.available(x, c) && x.f !== comfyF && !(sv.s[x.id] && sv.s[x.id][0] > 0) && !boot[x.id]);
  const st = list[1] && byId[list[1].id];
  if (neverOk && st && ((sv.s[st.id] && sv.s[st.id][0] > 0) || boot[st.id])) bump(chooserBad, 'stretch was already shown', { c, list });
  // the warm-up is something he has shown before whenever there is one
  const shownAny = CAT.some(x => M.available(x, c) && ((sv.s[x.id] && sv.s[x.id][0] > 0) || boot[x.id]));
  if (shownAny && !((sv.s[list[0].id] && sv.s[list[0].id][0] > 0) || boot[list[0].id])) bump(chooserBad, 'warm-up never shown before', { list });
  // persona: in a match against a creature, the wildcard is from its personality list when one fits
  // the swap
  const k = ri(3), rep = M.swapFor(c, sv, list, k, n, list.map(p => p.id));
  if (rep) {
    nSwaps++;
    const after = list.slice(); after[k] = rep;
    if (!M.available(byId[rep.id], c)) bump(swapBad, 'swap offered an impossible mission', { c, rep });
    if (new Set(after.map(p => byId[p.id].f)).size !== 3) bump(swapBad, 'swap made two of the same skill', { after });
    if (list.some(p => p.id === rep.id)) bump(swapBad, 'swap gave back a mission already there', { rep });
    const others = after.filter((p, j) => j !== k).map(p => byId[p.id].f);
    const sameAvail = CAT.some(x => M.available(x, c) && x.d === byId[list[k].id].d && x.id !== list[k].id && others.indexOf(x.f) < 0 && !list.some(p => p.id === x.id));
    if (sameAvail && byId[rep.id].d !== byId[list[k].id].d) bump(swapBad, 'swap changed difficulty though one existed', { list, rep });
    if (byId[rep.id].d === byId[list[k].id].d) sameD++;
  }
}
ok('chooser: 2,000 matches, never impossible, never two of the same skill, deterministic', !Object.keys(chooserBad).length, chooserBad);
ok('swap: always possible, same difficulty when it exists', !Object.keys(swapBad).length && nSwaps === 2000, { swapBad, nSwaps });
console.log('Swaps with the same difficulty: ' + sameD + ' of ' + nSwaps);
ok('no ÷ mission on the + − stage', (() => { const c = { mode: 'ai', ops: ['+', '-'], fr: true, np: 2, cards: false, bonus: false, shakes: 3, oppId: 'fox', sig: null };
  for (let n = 1; n < 300; n++) if (M.choose(c, M.blank(), n, {}).some(p => /div|all4|frac|times|pow|root/.test(p.id))) return false; return true; })());
ok('no three-player mission at a table of two', (() => { const c = { mode: 'ai', ops: ALL_OPS, fr: true, np: 2, cards: true, bonus: true, shakes: 3, oppId: 'zog', sig: null };
  for (let n = 1; n < 300; n++) if (M.choose(c, M.blank(), n, {}).some(p => p.id[0] === 't')) return false; return true; })());
ok('persona wildcard: Penny brings Call Impossible!', M.choose({ mode: 'ai', ops: ['+', '-', '*', '/'], fr: true, np: 2, cards: false, bonus: false, shakes: 3, oppId: 'penny', sig: null }, M.blank(), 2, {})[2].id === 'c_imp');
ok('a brand-new player gets a difficulty-1 warm-up', M.choose({ mode: 'ai', ops: ['+', '-'], fr: true, np: 2, shakes: 3, oppId: 'snoozy' }, M.blank(), 1, {}).every((p, i) => i || byId[p.id].d === 1));
ok('bootSeen reads old stats and badges', (() => { const b = M.bootSeen({ stats: { nowWins: 2, correct: 5 }, opsUsed: { '*': 3 }, badges: { big: '2026-01-01' } }); return b.c_now && b.o_sol && b.o_times && b.o_five && !b.c_imp; })());
// ---------------- stars: diminishing repeats, ranks ----------------
(() => {
  const m = M.blank(), got = [];
  for (let i = 0; i < 5; i++) got.push(M.award(m, 'c_now', '2026-11-1' + i, 2));
  ok('full stars the first 3 times, then a practised tick', got.map(r => r.stars).join() === '3,3,3,0,0', got);
  ok('only the first is a new stamp', got.map(r => r.first).join() === 'true,false,false,false,false');
  ok('practised from the 4th time', got.map(r => r.practised).join() === 'false,false,false,true,true');
  ok('first date and creature kept', m.s.c_now[1] === '2026-11-10' && m.s.c_now[2] === 2 && m.s.c_now[0] === 5);
  ok('total stars = difficulty x 3 at most', M.totalStars(m) === 9);
  M.award(m, 'g_set', '2026-11-20', -1); ok('stars add across missions', M.totalStars(m) === 10);
  ok('unknown mission gives nothing', M.award(m, 'nope', 'x', 0).stars === 0 && !m.s.nope);
  ok('rank thresholds', M.rankIdx(0) === 0 && M.rankIdx(11) === 0 && M.rankIdx(12) === 1 && M.rankIdx(70) === 3 && M.rankIdx(9999) === M.RANKS.length - 1);
  ok('top rank reachable', M.maxStars() >= M.RANKS[M.RANKS.length - 1].at, M.maxStars());
  ok('Galaxy cubes open early at Captain', !M.cosmeticOpenAt(69, 'skin', 'galaxy') && M.cosmeticOpenAt(70, 'skin', 'galaxy'));
  ok('covers grow with rank', M.coversAt(0).join() === 'green' && M.coversAt(200).join() === 'green,blue,red,gold');
  const k = M.blank(); M.offered(k, 'c_imp'); M.offered(k, 'c_imp'); M.swapped(k, 'c_imp'); M.swapped(k, 'c_imp');
  ok('skipped list: swapped twice, never shown', M.skipped(k).map(x => x.id).join() === 'c_imp');
  M.award(k, 'c_imp', '2026-11-13', 1); ok('shown once: no longer listed as skipped', M.skipped(k).length === 0);
  ok('normalize repairs junk', (() => { const n = M.normalize({ n: 'x', s: { a: 5, g_set: [2] } }); return n.n === 0 && !n.s.a && n.s.g_set.length === 5; })());
})();

// ---------------- cloud-save merge (and the copy pasted into js/account.js) ----------------
const docPath = path.join(root, 'docs', 'handoff', 'missions.md');
const src = read('js/missions.js').match(/\/\*MISSIONS-MERGE-START\*\/([\s\S]*?)\/\*MISSIONS-MERGE-END\*\//);
ok('merge markers in js/missions.js', !!src);
const standalone = new Function(src[1] + '\nreturn missionsMerge;')(); // must not need anything from the closure
let docMerge = null;
if (fs.existsSync(docPath)) { const d = fs.readFileSync(docPath, 'utf8').match(/missions: (function missionsMerge[\s\S]*?\n {4}\}),\s*\/\*MISSIONS-MERGE-END\*\//); if (d) docMerge = new Function('return ' + d[1])(); }
ok('handoff snippet found in docs/handoff/missions.md', !!docMerge);
(() => {
  const a = { v: 1, n: 5, cv: 'blue', s: { c_now: [2, '2026-11-02', 3, 4, 0], g_set: [1, '2026-11-05', 1, 2, 0] } };
  const b = { v: 1, n: 9, cv: 'red', rk: 2, s: { c_now: [1, '2026-11-01', 7, 6, 1], o_sol: [3, '2026-10-01', -1, 3, 0] } };
  const r = M.merge(a, b, { newer: 'b' });
  ok('merge: union of stamps', !!(r.s.c_now && r.s.g_set && r.s.o_sol));
  ok('merge: counts highest, earliest date with its creature', JSON.stringify(r.s.c_now) === JSON.stringify([2, '2026-11-01', 7, 6, 1]));
  ok('merge: n and rk highest, cover from the newer device', r.n === 9 && r.rk === 2 && r.cv === 'red' && M.merge(a, b, { newer: 'a' }).cv === 'blue');
  ok('merge: one side missing', JSON.stringify(M.merge(undefined, b, {})) === JSON.stringify(b) && JSON.stringify(M.merge(a, null, {})) === JSON.stringify(a));
  const ca = clone(a), cb = clone(b); M.merge(a, b, {}); ok('merge: inputs untouched', JSON.stringify(a) === JSON.stringify(ca) && JSON.stringify(b) === JSON.stringify(cb));
})();
let mergeBad = 0;
for (let i = 0; i < 400; i++) {
  const a = randomSave(), b = randomSave(); if (coin()) a.cv = 'blue'; if (coin()) b.rk = ri(5);
  const r = M.merge(a, b, { newer: coin() ? 'a' : 'b' });
  const lost = [a, b].some(s => Object.keys(s.s).some(id => !r.s[id] || r.s[id][0] < s.s[id][0] || r.s[id][3] < s.s[id][3] || r.s[id][4] < s.s[id][4] || (s.s[id][1] && String(r.s[id][1]) > String(s.s[id][1]))));
  const sorted = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
  const sym = sorted(M.merge(a, b, { newer: 'b' }).s) === sorted(M.merge(b, a, { newer: 'a' }).s);
  const idem = JSON.stringify(M.merge(r, r, { newer: 'a' })) === JSON.stringify(r);
  const stars = M.totalStars(r) >= Math.max(M.totalStars(a), M.totalStars(b));
  const same = !standalone || JSON.stringify(standalone(a, b, { newer: 'b' })) === JSON.stringify(M.merge(a, b, { newer: 'b' }));
  const docSame = !docMerge || JSON.stringify(docMerge(a, b, { newer: 'b' })) === JSON.stringify(M.merge(a, b, { newer: 'b' }));
  if (lost || !sym || !idem || !stars || !same || !docSame) { mergeBad++; if (mergeBad < 4) console.log('  merge problem', { lost, sym, idem, stars, same, docSame }); }
}
ok('merge never loses a stamp, star or count (400 random pairs); symmetric; idempotent; snippet identical', mergeBad === 0, mergeBad);

// ---------------- save size ----------------
(() => {
  const heavy = M.blank(); heavy.n = 2500; heavy.cv = 'gold'; heavy.rk = 5;
  CAT.forEach((x, i) => { heavy.s[x.id] = [99, '2026-11-13', 14, 250, 9]; });
  const bytes = JSON.stringify(heavy).length, typical = JSON.stringify(randomSave()).length;
  console.log('S.missions size: heavy user (every stamp, 2,500 matches) ' + bytes + ' bytes, typical ' + typical + ' bytes');
  ok('heavy save under 3 KB', bytes < 3072, bytes);
})();
// ---------------- a whole match through Missions.note (page side, no DOM) ----------------
(() => {
  const run = code => vm.runInContext(code, ctx);
  run('S.missions = undefined; S.set.missions = true; var persist = function () {};');
  const mk = (mode, np) => run('(function(){ var p=[{name:"Tyson",ai:null,score:0,list:[]}]; for (var i=1;i<' + np + ';i++) p.push({name:OPPONENTS[i].name,ai:OPPONENTS[i],score:0,list:[]}); G = { mode: "' + mode + '", players: p, shakes: 3, shake: 1, setter: 0, cubes: [], phase: "roll" }; return G; })()');
  // switched off: nothing at all
  run('S.set.missions = false'); let g = mk('ai', 2); M.note('start', { g });
  ok('switch off: no missions, no chips, no end line', M.current() === null && M.chipsHTML() === '' && M.matchLineHTML() === '');
  run('S.set.missions = true');
  ['tutorial', 'online'].forEach(md => { g = mk(md, 2); M.note('start', { g }); ok('no missions in ' + md, M.current() === null); });
  g = mk('ai', 2); M.note('start', { g });
  const A = M.current();
  ok('three missions offered vs a creature', A && A.list.length === 3, A && A.list);
  ok('offered counted in the save', A.list.every(it => run('S.missions').s[it.id][3] === 1) && run('S.missions').n === 1);
  // make the warm-up happen: force a known mission into slot 0
  A.list[0] = { id: 'g_set', role: 'comfy', done: false, by: null, stars: 0 };
  run('G.cubes = [{s:"3",color:"red"},{s:"+",color:"blue"},{s:"4",color:"red"}]; G.phase = "move";');
  M.note('goal', { g, tokens: [{ s: '3', id: 0 }, { s: '+', id: 1 }, { s: '4', id: 2 }], val: { n: 7, d: 1 } });
  ok('stamp lands the moment the Goal is set', A.list[0].done && A.list[0].by === 0 && A.list[0].stars === 1 && A.list[0].first);
  ok('chips show the stamp once', /msn-chip done just/.test(M.chipsHTML()) && !/just/.test(M.chipsHTML()));
  ok('saved in the passport', run('S.missions').s.g_set[0] === 1 && run('S.missions').s.g_set[1] === run('today()') && run('S.missions').s.g_set[2] === 1);
  // a second goal does not stamp twice in the same match
  M.note('goal', { g, tokens: [{ s: '3', id: 0 }, { s: '+', id: 1 }, { s: '4', id: 2 }], val: { n: 7, d: 1 } });
  ok('one stamp per mission per match', run('S.missions').s.g_set[0] === 1);
  // swap one (Not today): same difficulty, counted
  const before = A.list[1], bd = byId[before.id].d;
  ok('Not today: swap works once', M.swap(1) === true && A.list[1].id !== before.id && M.swap(2) === false);
  console.log('Swap in the test match: difficulty ' + bd + ' -> ' + byId[A.list[1].id].d);
  ok('swap counted (swapped + offered)', run('S.missions').s[before.id][4] === 1 && run('S.missions').s[A.list[1].id][3] >= 1);
  ok('swap keeps three different skills', new Set(A.list.map(it => byId[it.id].f)).size === 3);
  const line = M.matchLineHTML();
  ok('end line: 1 of 3 with a star and the new stamp', /Missions: 1 of 3/.test(line) && /⭐/.test(line) && /new stamp: Set a Goal/.test(line), line);
  ok('end line never says failed or missed', !/\b(fail|failed|missed|wrong)\b/i.test(line));
  // a different match object is ignored
  M.note('goal', { g: { players: [] }, tokens: [], val: { n: 1, d: 1 } });
  ok('notes from another match are ignored', run('S.missions').s.g_set[0] === 1);
  // family game: a helper's mission is a team tick, no stars
  run('G = { mode: "pvp", players: [{name:"Tyson",ai:null},{name:"Tata",ai:null}], shakes: 3, shake: 1, setter: 1, cubes: [{s:"3",color:"red"},{s:"+",color:"blue"},{s:"4",color:"red"}], phase: "move" };');
  g = run('G'); M.note('start', { g }); const F = M.current();
  F.list[0] = { id: 'g_set', role: 'comfy', done: false, by: null, stars: 0 };
  const starsBefore = M.totalStars(run('S.missions'));
  M.note('goal', { g, tokens: [{ s: '3', id: 0 }, { s: '+', id: 1 }, { s: '4', id: 2 }], val: { n: 7, d: 1 } });
  ok('family: Tata\'s Goal is a team tick without stars', F.list[0].done && F.list[0].by === 1 && M.totalStars(run('S.missions')) === starsBefore);
  ok('family end line mentions the team tick', /team tick/.test(M.matchLineHTML()));
  // the HTML pieces render without a DOM and use kind words
  const pp = M._passportHTML(), par = M.parentHTML(), set = M.settingsHTML();
  ok('passport renders: rank, stars, stamp slots', /Skills Passport/.test(pp) && /Ball Kid/.test(pp) && /msn-slot got/.test(pp) && /msn-slot"/.test(pp));
  ok('passport says house feature', /House feature/.test(pp));
  ok('parent view renders with families', /Skills Passport/.test(par) && /Strategy: Forbidden and Required/.test(par));
  ok('settings row uses the shared toggle', /data-act="toggleSet" data-arg="missions" data-def="1"/.test(set) && /House feature/.test(set));
  ok('no shaming words in any screen', !/\b(fail|failed|wrong|missed)\b/i.test(pp + par + set));
  run('S.set.missions = false');
  ok('switch off keeps stamps (passport still shows them)', /msn-slot got/.test(M._passportHTML()) && M.chipsHTML() === '' && M.matchLineHTML() === '');
  run('S.set.missions = true');
  console.log('Bytes after this test match: ' + M.bytes());
})();

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
