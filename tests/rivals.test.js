// Tests for "creatures that remember" (js/rivals.js): the memory and its caps, facts pulled from synthetic match
// streams, template filling for every creature and many fact combinations, the "encouraging, not gloating" rule
// after a losing streak, the gloat / trash-talk switches, the HTML lines, and the cloud-save merge rule.
// Run with:  node tests/rivals.test.js
// Loads the real js/engine.js, js/config.js (OPPONENTS, defaults), js/parent.js (Solution text helpers) and js/rivals.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const ctx = vm.createContext({ console, location: { search: '' }, window: {}, Math, Date, JSON });
['js/engine.js', 'js/config.js', 'js/parent.js', 'js/rivals.js'].forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
const R = vm.runInContext('Rivals', ctx);
const OPP = vm.runInContext('OPPONENTS', ctx);
const today = vm.runInContext('today()', ctx);

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }

// ---------- helpers ----------
function freshSave(set) { vm.runInContext('S = merge(defaults(), null); S.rivals = {};', ctx); if (set) Object.assign(ctx.S.set, set); R._x.reset(); }
function seq(vals) { let i = 0; return () => vals[i++ % vals.length]; }
const T = (str, id0) => str.split(' ').map((s, k) => (s === '(' || s === ')' || s === '!') ? s : { s: s, id: (id0 || 0) + k }); // "6 * 7" -> tokens
function sol(str, more) { const t = T(str); return { ok: true, tokens: t, chk: Object.assign({ ok: true, cubes: t.filter(x => typeof x === 'object').length, madeFraction: false }, more || {}) }; }
function newG(mode, idxs) {
  const g = { mode, oppIdx: mode === 'ai' ? idxs[0] : null, shakes: 3, shake: 1, setter: 0, players: [{ name: 'Kid', ai: null, score: 0, list: [] }], cubes: [], fractions: true, vari: null };
  idxs.forEach(i => g.players.push({ name: OPP[i].name, ai: OPP[i], score: 0, list: [] }));
  return g;
}
// one shake: pts = [kid, creature(, creature2)], opts: {kidSol, oppSol, ch:{kind, challenger, mover}, vari, goal}
function shake(g, pts, opts) {
  opts = opts || {};
  g.cubes = [];               // a new shake has new cubes (identity is how a challenge is tied to its shake)
  g.vari = opts.vari || null; g.setter = opts.setter == null ? 0 : opts.setter; g.goal = opts.goal == null ? { n: 10, d: 1 } : opts.goal;
  if (opts.ch) { g.ch = opts.ch; R.note('challenge', { g }); }
  const r = { pts: {}, sols: {}, lines: [] };
  pts.forEach((p, i) => { r.pts[i] = p; g.players[i].score += p; g.players[i].list.push(p); });
  if (opts.kidSol) r.sols[0] = opts.kidSol;
  if (opts.oppSol) r.sols[1] = opts.oppSol;
  R.note('shake', { g, r });
  g.shake++;
}
function match(idx, shakes, mode, season) {
  const g = newG(mode || 'ai', Array.isArray(idx) ? idx : [idx]);
  R.note('start', { g });
  shakes.forEach(s => shake(g, s[0], s[1]));
  R.note('end', { g, season: season || null });
  return g;
}
const mem = i => ctx.S.rivals[OPP[i].id];
const WIN = [[[6, 2], { kidSol: sol('2 + 3') }], [[4, 2], { kidSol: sol('4 - 1') }], [[2, 6], {}]];
const LOSS = [[[2, 6], {}], [[2, 4], {}], [[6, 2], { kidSol: sol('1 + 1') }]];
const BAD = /undefined|null|NaN|\{|\}/;

// ---------- the lines themselves ----------
{
  const ids = OPP.map(o => o.id);
  ok('every creature has lines', ids.every(id => R.LINES[id]), ids.filter(id => !R.LINES[id]));
  ok('no lines for unknown creatures', Object.keys(R.LINES).every(id => ids.indexOf(id) >= 0));
  ids.forEach(id => {
    const L = R.LINES[id];
    ok(id + ': 8+ greetings', L.g.length >= 8, L.g.length);
    ok(id + ': 4+ mid-match lines', L.m.length >= 4, L.m.length);
    ok(id + ': 4+ end lines', L.e.length >= 4, L.e.length);
    ['g', 'm', 'e'].forEach(p => {
      ok(id + ' ' + p + ': has a kind encouraging (so) line', L[p].some(x => x.c === 'so' && x.tone === 'k'));
      L[p].forEach(x => { ok(id + ' tone is k/b/t: ' + x.t, ['k', 'b', 't'].indexOf(x.tone) >= 0); ok(id + ' so lines are kind: ' + x.t, x.c !== 'so' || x.tone === 'k'); });
    });
    // kind fallbacks for the common situations, so switching gloat/trash off still leaves something to say
    ok(id + ': kind greeting after it won', L.g.some(x => x.c === 'll' && x.tone === 'k'));
    ok(id + ': kind rematch line', L.e.some(x => x.c === 're' && x.tone === 'k'));
    ok(id + ': has a brag line for gloat', L.e.some(x => x.c === 're' && x.tone === 'b'));
    ok(id + ': first-win line', L.e.some(x => x.c === 'fw'));
    ok(id + ': "good at" line', L.e.some(x => x.c === 'gd' && /\{op\}/.test(x.t)));
    ok(id + ': item callback greeting', L.g.some(x => x.c === 'it' && /\{item\}/i.test(x.t)));
  });
  // full value set: every template fills, with no leftovers
  const full = { ks: '10', os: '6', w: '5', l: '3', n: '12', streak: '3', next: '4', days: '9', goal: '48', old: '36', adm: '9 − 3 × 4 + 7', adk: 'dipping below zero',
    sol: '6 × 7', osol: '2 + 5', item: 'a factorial', op: 'multiplying', cup: 'final', pos: '2nd', lg: 'Classic League' };
  let n = 0;
  ids.forEach(id => ['g', 'm', 'e'].forEach(p => R.LINES[id][p].forEach(x => {
    const s = R._x.fill(x.t, full); n++;
    ok('fills: ' + id + ' ' + x.t, s && !BAD.test(s), s);
    ok('no shaming words: ' + x.t, !/\b(stupid|dumb|bad at (maths?|numbers|this)|loser|useless|baby)\b/i.test(x.t));
  })));
  ok('counted all templates (' + n + ')', n >= 15 * 16);
  ok('a missing value refuses the line', R._x.fill('You beat me with {item}.', {}) === null);
  ok('capital placeholder capitalises', R._x.fill('{Item} again!', { item: 'a factorial' }) === 'A factorial again!');
}

// ---------- facts from a Solution ----------
{
  const f = R._x.solFacts(sol('6 * 7'), null, true);
  ok('Solution text uses kid symbols', f.text === '6 × 7', f.text);
  ok('item: times', JSON.stringify(R._x.itemOf(f)) === '["op","*"]');
  const fb = R._x.solFacts({ ok: true, tokens: [{ s: '3', id: 0 }, '!', { s: '+', id: 1 }, { s: '1', id: 2 }], chk: { ok: true, cubes: 3 } }, null, true);
  ok('factorial beats plus', JSON.stringify(R._x.itemOf(fb)) === '["op","!"]', R._x.itemOf(fb));
  ok('factorial phrase', R._x.itemPhrase(R._x.itemOf(fb)) === 'a factorial');
  const fg = R._x.solFacts({ ok: true, tokens: [{ s: '4', id: 0 }, { s: 'Q', id: 9 }, { s: '-', id: 1 }, { s: '1', id: 2 }], chk: { ok: true } }, null, true);
  ok('gold Power die first', JSON.stringify(R._x.itemOf(fg)) === '["b","Q"]', R._x.itemOf(fg));
  ok('gold die phrase', R._x.itemPhrase(['b', 'Q']) === 'the gold x² cube', R._x.itemPhrase(['b', 'Q']));
  const fc = R._x.solFacts(sol('2 + 3'), 'upside', true);
  ok('card beats plain ops', JSON.stringify(R._x.itemOf(fc)) === '["v","upside"]');
  ok('card phrase', R._x.itemPhrase(['v', 'upside']) === 'the Upside-down card');
  ok('wrong Solution: no facts', R._x.solFacts({ ok: false, tokens: T('1 + 1') }) === null);
  const fn = R._x.solFacts(sol('2 - 5 + 9'), null, true);
  ok('went below zero (parent helper reused)', fn.neg === true && fn.keys.indexOf('ng') >= 0, fn);
  ok('keyWords', R._x.keyWords('*') === 'multiplying' && R._x.keyWords('fr') === 'fractions' && R._x.keyWords('v:factorial') === 'the Factorial card');
}

// ---------- memory from synthetic match streams ----------
{
  freshSave();
  ok('nothing remembered before playing', R.greet(0, { always: true }) === '' && !mem(0));
  // a win decided by a Now! with 6 × 7
  match(0, [[[6, 2], { kidSol: sol('6 * 7'), ch: { kind: 'now', challenger: 0, mover: 1 } }], [[2, 4], {}], [[4, 2], { kidSol: sol('1 + 2') }]]);
  let m = mem(0);
  ok('one match counted', m.n === 1 && m.w === 1 && m.l === 0 && m.st === 1, m);
  ok('score remembered', m.r[0][0] === 'w' && m.r[0][1] === 12 && m.r[0][2] === 8, m.r);
  ok('decided by his Now!', m.last.how === 'now' && m.last.who === 'k' && m.last.sol === '6 × 7', m.last);
  ok('decider item: times', JSON.stringify(m.last.it) === '["op","*"]', m.last.it);
  ok('first win milestone', m.ms.fw === today);
  ok('ops counted once per won match', m.ops['*'] === 1 && m.ops['+'] === 1, m.ops);
  ok('his Goal remembered', Array.isArray(m.big) && m.big[1] === '10', m.big);
  R._x.setRandom(() => 0);
  const gr = R.greet(0, { always: true });
  ok('greeting refers to last time', gr && !BAD.test(gr), gr);
  ok('greeting from a strong memory (Now! / item)', ['nw', 'it'].indexOf(R._x.last().c) >= 0, R._x.last());

  // a factorial win, then the creature wins twice, then three, streaks flip
  match(0, [[[6, 2], { kidSol: { ok: true, tokens: [{ s: '3', id: 0 }, '!', { s: '+', id: 1 }, { s: '4', id: 2 }], chk: { ok: true, cubes: 3 } } }], [[4, 4], {}], [[2, 4], {}]]);
  m = mem(0);
  ok('win streak 2', m.st === 2 && m.bs === 2, m);
  ok('factorial remembered', JSON.stringify(m.last.it) === '["op","!"]');
  ok('"you beat me with a factorial" fills', /a factorial/.test(R._x.fill(R.LINES.snoozy.g.find(x => x.c === 'it').t, R._x.values(m))));
  match(0, LOSS); match(0, LOSS);
  m = mem(0);
  ok('losing streak counted', m.st === -2 && m.l === 2 && m.bs === 2, m);
  match(0, LOSS);
  ok('three in a row for the creature', mem(0).st === -3);
  match(0, WIN);
  ok('streak resets on his win', mem(0).st === 1);
  // a tie
  match(0, [[[4, 4], {}], [[2, 2], {}], [[6, 6], {}]]);
  ok('tie resets streak', mem(0).st === 0 && mem(0).t === 1);

  // caps: 40 more matches
  for (let k = 0; k < 40; k++) match(0, k % 3 ? WIN : LOSS);
  m = mem(0);
  ok('recent results capped at 5', m.r.length === 5, m.r.length);
  ok('most recent first', m.r[0][0] === (39 % 3 ? 'w' : 'l'));
  ok('ops capped', Object.keys(m.ops).length <= 10);
  ok('counts add up', m.n === m.w + m.l + m.t, m);
  ok('5th and 10th win milestones', m.ms.w5 && m.ms.w10, m.ms);
}

// ---------- comeback, perfect, admired, Cup, Trio, season ----------
{
  freshSave();
  match(2, [[[2, 6], {}], [[6, 2], { kidSol: sol('8 / 2 - 1 + 3') }], [[6, 2], { kidSol: sol('5 * 2') }]]);
  let m = mem(2);
  ok('comeback from behind', m.last.cb === 1 && m.ms.cb === today, m.last);
  ok('long Solution admired', Array.isArray(m.adm) && m.adm[0] === 'long' && m.adm[1] === '8 ÷ 2 − 1 + 3', m.adm);
  match(2, [[[4, 2], { kidSol: sol('2 - 5 + 9') }], [[6, 2], { kidSol: sol('1 + 2') }], [[4, 2], { kidSol: sol('3 * 3') }]]);
  m = mem(2);
  ok('perfect match', m.last.pf === 1 && m.ms.pf === today);
  ok('below-zero Solution admired over a plain long one', m.adm[0] === 'neg', m.adm);
  // Cup final
  ctx.Cup = { active: () => true }; ctx.S.cups = { run: { id: 'x', round: 2, scores: [] }, won: {}, list: [] };
  match(3, WIN);
  ok('Cup round remembered', Array.isArray(mem(3).ms.cup) && mem(3).ms.cup[1] === 'final' && mem(3).r[0][4] === 'c', mem(3));
  delete ctx.Cup;
  R._x.setRandom(() => 0);
  ok('Cup line available', /Cup final/.test(R._x.fill(R.LINES.owl.g.concat(R.LINES.wizard.g).find(x => x.c === 'cup').t, R._x.values(mem(3)))));
  // Three at the table: he wins alone -> both creatures remember the crown; each gets its own result
  const g3 = newG('ai3', [5, 6]); R.note('start', { g: g3 });
  shake(g3, [6, 2, 2], { kidSol: sol('2 * 4') }); shake(g3, [2, 4, 2], {}); shake(g3, [4, 2, 2], { kidSol: sol('1 + 3') });
  R.note('end', { g: g3 });
  ok('trio: both remember', mem(5).n === 1 && mem(6).n === 1 && mem(5).ms.tr && mem(6).ms.tr && mem(5).r[0][4] === '3');
  // season fixture
  match(1, WIN, 'ai', { after: 2, before: 4, lg: 'c', friendly: false });
  ok('season place remembered', JSON.stringify(mem(1).sea.slice(0, 2)) === '[2,"c"]');
  ok('season greeting fills', /2nd in the Classic League/.test(R._x.fill(R.LINES.penny.g.find(x => x.c === 'sea').t, R._x.values(mem(1)))));
  // tutorial / online never count
  match(4, WIN, 'tutorial'); match(4, WIN, 'online');
  ok('tutorial and online ignored', !mem(4));
  // a creature's winning Now!
  match(7, [[[2, 6], { oppSol: sol('9 - 2'), ch: { kind: 'now', challenger: 1, mover: 0 } }], [[2, 4], {}], [[4, 2], { kidSol: sol('1 + 1') }]]);
  ok('its Now! remembered', mem(7).last.who === 'o' && mem(7).last.osol === '9 − 2', mem(7).last);
}

// ---------- template filling for every creature x many random memories ----------
{
  freshSave();
  let rs = 12345; const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };
  const pickR = a => a[Math.floor(rnd() * a.length)];
  const items = [['op', '+'], ['op', '!'], ['op', 'r'], ['b', 'F'], ['b', 'Q'], ['g', 'μ'], ['v', 'upside'], ['v', 'factorial'], null];
  let said = 0, tried = 0, badOut = [];
  for (let k = 0; k < 4000; k++) {
    const i = k % OPP.length, o = OPP[i], n = 1 + Math.floor(rnd() * 30), st = Math.floor(rnd() * 9) - 4;
    const res = st > 0 ? 'w' : st < 0 ? 'l' : pickR(['w', 'l', 't']);
    const m = { n, w: Math.floor(rnd() * n), l: Math.floor(rnd() * n), t: 0, st, bs: Math.max(0, st), f: '2026-01-01', d: pickR([today, '2026-01-01', '2025-12-25']),
      r: rnd() < 0.95 ? [[res, Math.floor(rnd() * 18), Math.floor(rnd() * 18), today, 'a']] : [], ms: {}, ops: {} };
    const last = { how: pickR(['now', 'imp', 'other']), who: pickR(['k', 'o', '']) };
    const it = pickR(items); if (it) last.it = it;
    if (rnd() < 0.5) last.sol = pickR(['6 × 7', '3! + 1', '9 − 2 × 4']);
    if (rnd() < 0.3) last.osol = '2 + 2';
    if (rnd() < 0.2) last.cb = 1; if (rnd() < 0.2) last.pf = 1;
    if (rnd() < 0.5) last.k = ['*', 'fr', 'b:F', 'v:basem'].filter(() => rnd() < 0.6);
    m.last = last;
    if (rnd() < 0.4) m.big = [48, '48']; if (rnd() < 0.4) m.adm = [pickR(['long', 'frac', 'neg']), '1 ÷ 2 + 7', 9];
    if (rnd() < 0.2) m.ms.cup = [today, pickR(['quarter-final', 'semi-final', 'final'])]; if (rnd() < 0.2) m.ms.tr = today;
    if (rnd() < 0.3) m.sea = [1 + Math.floor(rnd() * 6), pickR(['c', 'm', 'l']), today];
    if (rnd() < 0.5) (m.last.k || []).forEach(x => { m.ops[x] = Math.floor(rnd() * 6); });
    ctx.S.rivals = {}; ctx.S.rivals[o.id] = m;
    ctx.S.set.gloat = rnd() < 0.5; ctx.S.set.trash = rnd() < 0.5;
    R._x.setRandom(rnd);
    const g = newG('ai', [i]); g.shake = 1 + Math.floor(rnd() * 3); g.players[0].score = Math.floor(rnd() * 10); g.players[1].score = Math.floor(rnd() * 10); g.setter = 0; g.goal = { n: 60, d: 1 }; g.vari = pickR([null, 'upside']);
    R._x.reset();
    const outs = [R.greet(i, { always: true }), R.midLine(i, { g, sym: pickR(['+', '!', 'F', '7']) }, { always: true }), R.midLine(i, { g, goal: 1 }, { always: true }), R.endLine(i, pickR(['w', 'l', 't', undefined]), { always: true }),
      R.cardLineHTML(i), R.historyHTML(i)];
    outs.forEach(s => { tried++; if (typeof s !== 'string' || BAD.test(s.replace(/<[^>]*>/g, ''))) badOut.push(s); else if (s) said++; });
  }
  ok('no undefined / empty placeholders in ' + tried + ' outputs', badOut.length === 0, badOut.slice(0, 3));
  ok('lines are actually produced', said > tried / 3, said);
  ctx.S.set.gloat = true; ctx.S.set.trash = true;
}

// ---------- encouraging, not gloating, after a losing streak ----------
{
  freshSave();
  match(4, WIN); match(4, LOSS); match(4, LOSS); match(4, LOSS);
  const m = mem(4);
  ok('creature on a 3-match streak', m.st === -3);
  const conds = R._x.greetConds(m);
  ok('only kind memories after a losing streak', conds.every(c => ['so', 'aw', 'od', 'gl', 'ad'].indexOf(c) >= 0) && conds[0] === 'so', conds);
  let allKind = true, allSo = true;
  for (let k = 0; k < 200; k++) {
    R._x.setRandom(() => (k % 10) / 10);
    const s = R.greet(4, { always: true }); const p = R._x.last();
    if (!s || p.tone !== 'k') allKind = false;
    const e = R.endLine(4, 'l', { always: true }); const pe = R._x.last();
    if (!e || pe.c !== 'so' || pe.tone !== 'k') allSo = false;
  }
  ok('greetings stay kind (200 tries)', allKind);
  ok('end lines encourage (200 tries)', allSo);
  // mid-match: the creature leading during its streak only encourages, never "revenge"
  const g = newG('ai', [4]); g.players[1].score = 6; g.players[0].score = 2; R._x.reset();
  const ml = R.midLine(4, { g, sym: '+' }, { always: true });
  ok('mid line during its streak is encouraging', ml && R._x.last().c === 'so' && R._x.last().tone === 'k', [ml, R._x.last()]);
  // one loss only (st -1): a brag is allowed with gloat on
  freshSave(); match(4, WIN); match(4, LOSS);
  let bragSeen = false; for (let k = 0; k < 40; k++) { R._x.setRandom(() => (k % 7) / 7); R.endLine(4, 'l', { always: true }); if (R._x.last().tone === 'b') bragSeen = true; }
  ok('after a single loss a brag can happen (gloat on)', bragSeen);
}

// ---------- switches ----------
{
  freshSave({ gloat: false, trash: false });
  match(2, LOSS); // creature won once
  let tonesOk = true;
  for (let k = 0; k < 100; k++) {
    R._x.setRandom(() => (k % 9) / 9);
    [R.greet(2, { always: true }) && R._x.last(), R.endLine(2, 'l', { always: true }) && R._x.last()].forEach(p => { if (p && p.tone !== 'k') tonesOk = false; });
  }
  ok('gloat + trash off: only kind lines', tonesOk);
  ok('still something to say with both off', !!R.endLine(2, 'l', { always: true }) && !!R.greet(2, { always: true }));
  freshSave({ trash: false });
  match(2, [[[6, 2], { kidSol: { ok: true, tokens: [{ s: '3', id: 0 }, '!'], chk: { ok: true, cubes: 1 } } }], [[4, 2], {}], [[2, 2], {}]]);
  let noTease = true; for (let k = 0; k < 100; k++) { R._x.setRandom(() => (k % 11) / 11); R.greet(2, { always: true }); if (R._x.last() && R._x.last().tone === 't') noTease = false; }
  ok('trash off: no teasing', noTease);
  freshSave({ gloat: false });
  match(2, LOSS);
  let noBrag = true; for (let k = 0; k < 100; k++) { R._x.setRandom(() => (k % 11) / 11); R.greet(2, { always: true }); const a = R._x.last(); R.endLine(2, 'l', { always: true }); const b = R._x.last(); if ((a && a.tone === 'b') || (b && b.tone === 'b')) noBrag = false; }
  ok('gloat off: no bragging', noBrag);
}

// ---------- greeting frequency, mid-match limits ----------
{
  freshSave(); match(1, WIN); match(1, WIN);
  let n = 0; for (let k = 0; k < 100; k++) { R._x.setRandom(() => k / 100); if (R.greet(1)) n++; }
  ok('greeting varies: not every time (' + n + '/100)', n > 30 && n < 90);
  // the remembered item comes back during the next match
  freshSave(); match(1, [[[6, 2], { kidSol: sol('6 * 7') }], [[4, 2], {}], [[4, 2], {}]]);
  R._x.setRandom(() => 0);
  const g = newG('ai', [1]); R.note('start', { g });
  const a = R.midLine(1, { g, sym: '*' });
  ok('item callback when the × comes back', a && R._x.last().c === 'it', [a, R._x.last()]);
  ok('only one per shake', R.midLine(1, { g, sym: '*' }) === '');
  g.shake = 2; const b = R.midLine(1, { g, sym: '*' }); g.shake = 3;
  ok('second shake may speak', !!b);
  ok('at most two per match', R.midLine(1, { g, sym: '*' }) === '');
  ok('unrelated cube: nothing', (() => { R._x.reset(); const g2 = newG('ai', [1]); return R.midLine(1, { g: g2, sym: '3' }) === ''; })());
  // a bigger Goal than his record
  R._x.reset(); const g3 = newG('ai', [1]); g3.setter = 0; g3.goal = { n: 99, d: 1 };
  const gl = R.midLine(1, { g: g3, goal: 1 });
  ok('bigger Goal callback', /99/.test(gl) && /10/.test(gl), gl);
}

// ---------- end lines: milestones and "good at" ----------
{
  freshSave(); R._x.setRandom(() => 0);
  match(9, WIN);
  ok('first win line', R.endLine(9, 'w') && R._x.last().c === 'fw');
  match(9, WIN); match(9, WIN);
  const l3 = R.endLine(9, 'w');
  ok('three in a row line', l3 && R._x.last().c === 'sk' && /3/.test(l3), [l3, R._x.last()]);
  const s = R._x.values(mem(9), { op: 'adding' });
  ok('"good at" fills', /adding/.test(R._x.fill(R.LINES.zog.e.find(x => x.c === 'gd').t, s)));
  match(9, LOSS);
  const e = R.endLine(9, 'l', { always: true });
  ok('rematch line after a single loss', e && R._x.last().c === 're');
  freshSave(); for (let k = 0; k < 4; k++) match(9, [[[6, 2], { kidSol: sol('2 * 3') }], [[2, 4], {}], [[2, 2], {}]]);
  ok('"good at times" after 3+ wins with ×', mem(9).ops['*'] >= 3 && /multiplying/.test(R.endLine(9, 'w', { always: true }) + R.endLine(9, 'w', { always: true }) + R.endLine(9, 'w', { always: true }) + R.endLine(9, 'w', { always: true })));
}

// ---------- rival levels and HTML ----------
{
  freshSave();
  ok('new face before playing', R.level(0).name === 'New face' && /New face/.test(R.cardLineHTML(0)));
  for (let k = 0; k < 5; k++) match(0, WIN);
  ok('rival after 5 matches', R.level(0).name === 'Rival');
  for (let k = 0; k < 5; k++) match(0, LOSS);
  ok('old rival after 10', R.level(0).name === 'Old rival');
  for (let k = 0; k < 10; k++) match(0, WIN);
  ok('friend after 20', R.level(0).name === 'Friend' && R.level(0).toNext === 0);
  const h = R.historyHTML(0);
  ok('history has record, last result, a memory', /15 won · 5 lost/.test(h) && /Last time \(today\): you won/.test(h) && /remembers/.test(h), h);
  ok('card line has the record', /15–5/.test(R.cardLineHTML(0)));
  ok('career section lists played creatures', /Snoozy/.test(R.careerHTML()) && !/Penny/.test(R.careerHTML()));
  freshSave(); ok('career section without matches', /start to remember/.test(R.careerHTML()));
}

// ---------- save size ----------
{
  freshSave();
  const long = sol('9 - 8 + 7 * 6 / 3 - 2 + 1');
  for (let i = 0; i < OPP.length; i++) for (let k = 0; k < 30; k++) {
    match(i, [[[6, 2], { kidSol: long, ch: { kind: 'now', challenger: 0, mover: 1 }, vari: 'factorial', goal: { n: 1000 + k, d: 1 } }],
      [[2, 6], { oppSol: sol('9 * 9 - 8 * 7') }], [[k % 2 ? 4 : 2, 2], { kidSol: { ok: true, tokens: [{ s: '4', id: 0 }, { s: 'Q', id: 3 }, { s: '-', id: 1 }, { s: 'μ', id: 2 }], chk: { ok: true, madeFraction: true, cubes: 3 } } }]]);
  }
  const b = R.bytes();
  console.log('Save size, 15 creatures x 30 busy matches: ' + b + ' bytes (' + Math.round(b / OPP.length) + ' per creature)');
  ok('whole memory under 9000 bytes', b < 9000, b);
  ok('no creature over 600 bytes', OPP.every(o => JSON.stringify(ctx.S.rivals[o.id]).length < 600));
}

// ---------- the cloud-save merge rule ----------
{
  const a = { snoozy: { n: 5, w: 3, l: 2, t: 0, st: 1, bs: 2, f: '2026-02-01', d: '2026-03-01', r: [], ms: { fw: '2026-02-03' }, big: [20, '20'] },
    penny: { n: 1, d: '2026-01-01', ms: {} } };
  const b = { snoozy: { n: 7, w: 3, l: 4, t: 0, st: -1, bs: 1, f: '2026-02-05', d: '2026-02-20', r: [], ms: { fw: '2026-02-06', cb: '2026-02-10', cup: ['2026-02-11', 'final'] }, adm: ['neg', '2 − 5 + 9', 7] },
    fox: { n: 2, d: '2026-01-02', ms: {} } };
  const m = R.merge(a, b);
  ok('more matches wins', m.snoozy.n === 7 && m.snoozy.l === 4);
  ok('best streak: highest', m.snoozy.bs === 2);
  ok('first day: earliest', m.snoozy.f === '2026-02-01');
  ok('milestones: union, earliest', m.snoozy.ms.fw === '2026-02-03' && m.snoozy.ms.cb === '2026-02-10' && m.snoozy.ms.cup[1] === 'final', m.snoozy.ms);
  ok('biggest Goal kept from the other side', m.snoozy.big && m.snoozy.big[0] === 20);
  ok('admired Solution kept', m.snoozy.adm && m.snoozy.adm[0] === 'neg');
  ok('creatures from both sides', m.penny && m.fox);
  ok('same match count: later day', R.merge({ x: { n: 2, d: '2026-01-05', w: 2 } }, { x: { n: 2, d: '2026-01-04', w: 0 } }).x.w === 2);
  ok('garbage is safe', JSON.stringify(R.merge(null, 'nope')) === '{}' && R.merge({ x: 5 }, {}).x === 5);
  ok('symmetric on match counts', R.merge(b, a).snoozy.n === 7);
  // the snippet in docs/handoff/rivals.md must be the same code as js/rivals.js
  const doc = path.join(root, 'docs', 'handoff', 'rivals.md');
  if (fs.existsSync(doc)) {
    const grab = s => { const x = s.match(/\/\*RIVALS-MERGE-START\*\/([\s\S]*?)\/\*RIVALS-MERGE-END\*\//); return x ? x[1].replace(/\s+/g, ' ').trim() : null; };
    const fromJs = grab(read('js/rivals.js')), fromDoc = grab(fs.readFileSync(doc, 'utf8'));
    ok('docs merge snippet matches js/rivals.js', fromJs && fromDoc && fromDoc.indexOf(fromJs.replace(/^function rivalsMerge\(a, b\) /, '')) >= 0);
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
