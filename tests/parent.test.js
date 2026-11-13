// Tests for the parent page's numbers (js/parent.js): bucketing by day, the 60-day window and size cap,
// levels, trends, reason codes, the page model and the "Try this next" suggestions.
// Run with:  node tests/parent.test.js
// Uses synthetic event streams. The engine is loaded from js/engine.js exactly like tests/engine.test.js.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const esrc = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8');
const em = esrc.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
const Eq = new Function(em[1] + '\nreturn Eq;')();
const psrc = fs.readFileSync(path.join(root, 'js', 'parent.js'), 'utf8');
const Parent = new Function('Eq', psrc + '\nreturn Parent;')(Eq);
const P0 = Parent.core, F = Parent._facts;

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra) : ''); } }

const TODAY = '2026-11-12';
const day = n => P0.addDays(TODAY, n); // day(-1) = yesterday
function sol(P, d, ok_, keys, more) { return P0.record(P, 'solution', Object.assign({ ok: ok_, keys: keys || [], mode: 'now', cubes: 3, ms: 30000 }, more || {}), d); }
function ctx(extra) {
  return Object.assign({ today: TODAY, name: 'Ty', stats: { attempts: 0, correct: 0, challenges: 0, challengeWins: 0, nowWins: 0, impWins: 0 }, opsUsed: {}, history: [], best: { mostCubes: 0 },
    stageOps: ['+', '-', '*', '/'], ladder: { stage: 1, stars: 2 }, stages: [{ name: 'A', icon: 'a', need: 5 }, { name: 'B', icon: 'b', need: 6 }, { name: 'C', icon: 'c', need: 6 }],
    badges: { got: 1, total: 10 }, opponents: [{ name: 'Snoozy', beaten: true, open: true }, { name: 'Penny', beaten: false, open: true }], cards: [], cardsTotal: 19, drills: [] }, extra || {});
}

// ---------------- normalize / blank ----------------
{
  ok('blank has the version and since', P0.blank(TODAY).v === 1 && P0.blank(TODAY).since === TODAY);
  ok('garbage becomes a blank store', P0.normalize('nope', TODAY).since === TODAY && typeof P0.normalize(null, TODAY).days === 'object');
  const kept = P0.normalize({ v: 1, since: '2026-10-01', days: { '2026-10-02': { a: 5 } }, L: [], ex: 3 }, TODAY);
  ok('a valid since is kept, broken parts are repaired', kept.since === '2026-10-01' && kept.days['2026-10-02'].a === 5 && !Array.isArray(kept.L) && typeof kept.ex === 'object');
  ok('a broken since is replaced', P0.normalize({ since: 'yesterday' }, TODAY).since === TODAY);
}

// ---------------- day bucketing and lifetime totals ----------------
{
  const P = P0.blank(day(-10));
  sol(P, day(-2), true, ['+', '*']); sol(P, day(-2), false, ['*'], { codes: ['value'], ex: { s: '3 × 4', g: '10', v: '12' } });
  sol(P, day(0), true, ['+'], { cubes: 5, ms: 10000, par: true, neg: true });
  ok('solutions go into their own day', P.days[day(-2)].so[0] === 2 && P.days[day(-2)].so[1] === 1 && P.days[day(0)].so[0] === 1);
  ok('lifetime adds the days up', P.L.so[0] === 3 && P.L.so[1] === 2);
  ok('skill keys counted per day and lifetime', P.days[day(-2)].k['*'][0] === 2 && P.days[day(-2)].k['*'][1] === 1 && P.L.k['+'][0] === 2 && P.L.k['+'][1] === 2);
  ok('wrong Solutions count by reason, with one real example', P.L.rs.value === 1 && P.ex.value[1] === '3 × 4' && P.ex.value[2] === '10' && P.ex.value[0] === day(-2));
  ok('right Solutions: size, thinking time, habits', P.L.len['5'] === 1 && P.L.len['3'] === 1 && P.L.tm[0] === 1 && P.L.tm[1] === 1 && P.L.fx.par === 1 && P.L.fx.neg === 1);
  ok('by mode', P.L.md.now[0] === 3);
  P0.record(P, 'solution', { ok: false, keys: [], mode: 'camp', drill: 'make', codes: [] }, day(0));
  ok('a camp Solution counts as a drill try; no codes = "other"', P.L.dk.make[0] === 1 && P.days[day(0)].dr[0] === 1 && P.L.rs.other === 1);
  P0.record(P, 'goal', { cubes: 2, ops: ['+'], two: true, frac: false }, day(0));
  P0.record(P, 'goal', { cubes: 4, ops: ['*', '-'], two: false, frac: true }, day(0));
  ok('Goals: count, size, two-digit, fraction, operations', P.L.g === 2 && P.days[day(0)].g === 2 && P.L.gl['2'] === 1 && P.L.gl['4'] === 1 && P.L.g2 === 1 && P.L.gf === 1 && P.L.gop['*'] === 1);
  P0.record(P, 'challenge', { kind: 'now', role: 'caller', won: true }, day(0));
  P0.record(P, 'challenge', { kind: 'impossible', role: 'caller', won: false }, day(0));
  P0.record(P, 'challenge', { kind: 'now', role: 'mover', won: false }, day(0));
  ok('challenges: calls by kind; his move challenged', P.L.cn[0] === 1 && P.L.cn[1] === 1 && P.L.ci[0] === 1 && P.L.ci[1] === 0 && P.days[day(0)].cn[0] === 1 && P.L.chm[0] === 1 && P.L.chm[1] === 0);
  P0.record(P, 'shake', { hint: true, won: true }, day(0)); P0.record(P, 'shake', { hint: false }, day(0));
  ok('shakes and hints', P.L.sh === 2 && P.L.h === 1 && P.days[day(0)].h === 1 && P.L.shw === 1);
  P0.record(P, 'match', { mode: 'ai', opp: 2, result: 'w', shakes: 3, min: 7.4 }, day(0));
  P0.record(P, 'match', { mode: 'pvp', opp: null, result: 't', shakes: 3, min: 500 }, day(0));
  ok('matches: played/won/tied, by creature, by mode, length (minutes capped at 120)', P.L.m[0] === 2 && P.L.m[1] === 1 && P.L.m[2] === 1 && P.L.opp[2][0] === 1 && P.L.opp[2][1] === 1 && P.L.mm.pvp === 1 && P.L.mlen[2] === 7 + 120);
  const divBefore = (P.L.k['/'] || [0, 0])[0], soBefore = P.L.so[0];
  sol(P, day(0), false, ['/'], { codes: ['required'] });
  ok('a rules-only slip counts as a Solution and a reason, not against the operation', (P.L.k['/'] || [0, 0])[0] === divBefore && P.L.so[0] === soBefore + 1 && P.L.rs.required === 1);
  sol(P, day(0), false, ['/'], { codes: ['required', 'value'] });
  ok('a slip that is also about the maths does count against the operation', P.L.k['/'][0] === divBefore + 1 && P.L.k['/'][1] === 0);
  P0.record(P, 'drill', { id: 'imp', ok: true }, day(0));
  ok('quiz drills', P.L.dk.imp[1] === 1 && P.L.dr[0] === 2);
  P0.record(P, 'missed', { moments: 6, now: 2, imp: 1 }, day(0));
  ok('proved chances', P.L.mc[0] === 6 && P.L.mc[1] === 2 && P.L.mc[2] === 1 && P.L.mcn === 1);
  P0.record(P, 'active', { sec: 90.4, session: true }, day(0)); P0.record(P, 'active', { sec: 30 }, day(0));
  ok('active seconds and sessions', P.days[day(0)].a === 120 && P.days[day(0)].n === 1 && P.L.a === 120 && P.L.n === 1);
}

// ---------------- 60-day window and size cap ----------------
{
  const P = P0.blank(day(-120));
  for (let i = -100; i <= 0; i++) sol(P, day(i), i % 2 === 0, ['+']);
  const keys = Object.keys(P.days).sort();
  ok('only the last 60 days are kept', keys.length === 60 && keys[0] === day(-59) && keys[keys.length - 1] === TODAY, keys.length);
  ok('lifetime totals keep everything', P.L.so[0] === 101);
  // a very heavy player: many skill keys on every day
  const H = P0.blank(day(-80));
  const many = ['+', '-', '*', '/', '^', 'r', 'fr', 'v:twodigit', 'v:multiops', 'v:wild0', 'v:threeops', 'v:remainder', 'b:!', 'b:q', 'big', 'v:average', 'v:upside', 'v:sideways', 'v:expo', 'v:multk'];
  for (let i = -70; i <= 0; i++) for (let j = 0; j < 30; j++) sol(H, day(i), j % 3 > 0, many.slice(0, 1 + (j % many.length)), { codes: ['value', 'required'], ex: { s: '1 + 2 + 3 + 4 + 5 + 6 + 7 + 8', g: '99', v: '36' } });
  for (const k in H.days) { const d = H.days[k]; for (let q = 0; q < 10; q++) { d.k['pad' + q] = [99999, 99999]; } }
  P0.cap(H, TODAY);
  ok('the store never grows past the byte cap', P0.bytes(H) <= P0.MAX_BYTES, P0.bytes(H));
  const hk = Object.keys(H.days).sort();
  ok('the cap drops the oldest days first and keeps today', hk[hk.length - 1] === TODAY && hk[0] > day(-59), hk[0]);
  ok('a normal month of play is small (under 8 KB)', (function () { const N = P0.blank(day(-40)); for (let i = -30; i <= 0; i++) { for (let j = 0; j < 12; j++) sol(N, day(i), j % 4 > 0, ['+', '*'].slice(0, 1 + j % 2)); P0.record(N, 'active', { sec: 1200, session: true }, day(i)); P0.record(N, 'match', { mode: 'ai', opp: 1, result: 'w', shakes: 3, min: 8 }, day(i)); } return P0.bytes(N) < 8000; })());
}

// ---------------- levels ----------------
{
  ok('level: no tries', P0.level(0, 0, 0, 0) === 'none');
  ok('level: 1-7 tries is New', P0.level(7, 7, 7, 7) === 'new' && P0.level(1, 0, 0, 0) === 'new');
  ok('level: 8 tries at 75% is Solid', P0.level(8, 6, 0, 0) === 'solid');
  ok('level: 8 tries at 62% is Getting there', P0.level(8, 5, 0, 0) === 'getting');
  ok('level: recent 30 days decide when they have 8+ tries', P0.level(40, 10, 10, 9) === 'solid' && P0.level(40, 38, 10, 5) === 'getting');
  ok('level: too few recent tries -> all tries decide', P0.level(40, 38, 3, 0) === 'solid');
}

// ---------------- trend ----------------
{
  const P = P0.blank(day(-40));
  for (let i = 0; i < 10; i++) sol(P, day(-20), i < 4, ['/']);   // earlier 2 weeks: 40%
  for (let i = 0; i < 10; i++) sol(P, day(-3), i < 8, ['/']);    // last 2 weeks: 80%
  ok('trend up', P0.trend(P, '/', TODAY) === 'up');
  for (let i = 0; i < 10; i++) sol(P, day(-20), i < 8, ['*']); for (let i = 0; i < 10; i++) sol(P, day(-1), i < 3, ['*']);
  ok('trend down', P0.trend(P, '*', TODAY) === 'down');
  for (let i = 0; i < 10; i++) { sol(P, day(-20), i < 7, ['+']); sol(P, day(-1), i < 7, ['+']); }
  ok('trend steady', P0.trend(P, '+', TODAY) === 'flat');
  sol(P, day(-1), true, ['^']);
  ok('trend unknown with few tries', P0.trend(P, '^', TODAY) === null);
}

// ---------------- reason codes ----------------
{
  ok('engine code concat', P0.classify('concat', []).join() === 'concat');
  ok('engine code divzero / paren / incomplete', P0.classify('divzero', [])[0] === 'divzero' && P0.classify('emptyparen', [])[0] === 'paren' && P0.classify('incomplete', [])[0] === 'unfinished');
  ok('unknown engine code is a card rule', P0.classify('sw0', [])[0] === 'card');
  ok('structural reasons', P0.classify(null, ['It leaves out Required cube 3. Every Required cube must be used.', 'Your Solution equals 7, but the Goal is 9.']).join() === 'required,value');
  ok('Now! with two Resources', P0.classify(null, ['After a Now! challenge you may add only ONE cube from Resources (this uses 2).'])[0] === 'now1');
  ok('nothing recognised -> other', P0.classify(null, ['Hmm.'])[0] === 'other');
  ok('every code has plain words', ['value', 'required', 'forbidden', 'twice', 'few', 'now1', 'matonly', 'goalcube', 'concat', 'divzero', 'frac', 'pow', 'root', 'unfinished', 'paren', 'sign', 'syntax', 'big', 'card', 'none', 'other'].every(c => typeof P0.REASONS[c] === 'string'));
}

// ---------------- facts from real engine tokens ----------------
{
  const T = (s, id0) => s.split('').map((c, i) => c === '(' || c === ')' ? c : { s: c, id: (id0 || 0) + i });
  ok('negatives: 3 − 5 + 4 goes below zero', F.negUsed(T('3-5+4'), true) === true);
  ok('negatives: 2 × (1 − 4) goes below zero', F.negUsed(T('2*(1-4)'), true) === true);
  ok('negatives: (2 + 3) × 4 does not', F.negUsed(T('(2+3)*4'), true) === false);
  ok('negatives: 8 − 3 − 2 does not', F.negUsed(T('8-3-2'), true) === false);
  ok('negatives: other symbols are not guessed', F.negUsed([{ s: '3', id: 0 }, { s: 'a', id: 1 }, { s: '5', id: 2 }], true) === false);
  const zone = () => 'permitted';
  const good = T('(2+3)*4'), chkG = Eq.checkSolution(good, { goal: Eq.frac(20, 1), zone, required: [], mode: 'impossible', fractions: true });
  const fg = F.solutionFacts({ chk: chkG, tokens: good, mode: 'impossible', goal: Eq.frac(20, 1), ms: 5000, fr: true });
  ok('right Solution facts: operations, parentheses, cubes (operation cubes count too)', fg.ok && fg.keys.indexOf('+') >= 0 && fg.keys.indexOf('*') >= 0 && fg.par && fg.cubes === 5 && !fg.codes, fg);
  const bad = T('12+3'), chkB = Eq.checkSolution(bad, { goal: Eq.frac(15, 1), zone, required: [], mode: 'impossible', fractions: true });
  const fb = F.solutionFacts({ chk: chkB, tokens: bad, mode: 'impossible', goal: Eq.frac(15, 1), fr: true });
  ok('wrong Solution: two digits touching -> concat, with an example', !fb.ok && fb.codes.indexOf('concat') >= 0 && fb.ex.s === '12 + 3' && fb.ex.g === '15' && fb.two, fb);
  const miss = T('2+3'), chkM = Eq.checkSolution(miss, { goal: Eq.frac(6, 1), zone, required: [9], mode: 'impossible', fractions: true, label: () => '1' });
  const fm = F.solutionFacts({ chk: chkM, tokens: miss, mode: 'impossible', goal: Eq.frac(6, 1), fr: true });
  ok('wrong Solution: Required left out and wrong total', fm.codes.indexOf('required') >= 0 && fm.codes.indexOf('value') >= 0 && fm.ex.v === '5', fm.codes);
  const fn = F.solutionFacts({ chk: null, tokens: null, mode: 'now', goal: Eq.frac(6, 1), fr: true });
  ok('"I can\'t find one" -> none', fn.codes.join() === 'none' && fn.ok === false);
  const frT = T('7/2+1'), chkF = Eq.checkSolution(frT, { goal: Eq.frac(9, 2), zone, required: [], mode: 'impossible', fractions: true });
  ok('a fraction step adds the fractions skill', F.solutionFacts({ chk: chkF, tokens: frT, mode: 'impossible', goal: Eq.frac(9, 2), fr: true }).keys.indexOf('fr') >= 0);
  const gf = F.goalFacts({ tokens: T('12*3'), value: Eq.frac(36, 1) });
  ok('Goal facts: cubes, operations, two-digit', gf.cubes === 4 && gf.ops.join() === '*' && gf.two && !gf.frac);
}

// ---------------- the page model ----------------
{
  const since = day(-3);
  const P = P0.blank(since);
  // older record (before the page): S.history entries on day -10 and -5
  const t = (d, h) => { const x = new Date(...d.split('-').map((v, i) => i === 1 ? v - 1 : +v)); x.setHours(h || 12); return x.getTime(); };
  const history = [{ t: t(day(-10)), ok: true, ms: 20000, c: 4 }, { t: t(day(-10)), ok: false, ms: 9000, c: 2 }, { t: t(day(-5)), ok: true, ms: 40000, c: 3 }];
  for (let i = 0; i < 9; i++) sol(P, day(-1), i < 8, ['+', '-']);
  P0.record(P, 'active', { sec: 600, session: true }, day(-1));
  P0.record(P, 'match', { mode: 'ai', opp: 0, result: 'w', shakes: 3, min: 9 }, day(-1));
  P0.record(P, 'shake', {}, day(-1));
  const M = P0.model(P, ctx({ history, opsUsed: { '+': 40, '*': 3 }, stats: { attempts: 60, correct: 50, challenges: 4, challengeWins: 3, nowWins: 2, impWins: 1, fractionSolutions: 2 } }));
  ok('week: days played counts older-record days too', M.week.played === 2 && M.month.played === 3, [M.week.played, M.month.played]);
  ok('week: minutes and matches from this page', M.week.min === 10 && M.week.matches === 1 && M.week.won === 1);
  ok('windows that start before the page are marked partial', M.week.partial === true && M.month.partial === true);
  const r10 = M.month.rows.find(r => r.d === day(-10));
  ok('days before the page: Solutions from the older record, minutes unknown', r10 && r10.tried === 2 && r10.right === 1 && r10.min === null && !r10.tracked);
  ok('28 rows, oldest first, ending today', M.month.rows.length === 28 && M.month.rows[27].d === TODAY && M.month.rows[0].d === day(-27));
  const plus = M.skills.find(s => s.key === '+'), times = M.skills.find(s => s.key === '*'), pow = M.skills.find(s => s.key === '^');
  ok('skill rows: + is Solid with 9 tries', plus.t === 9 && plus.r === 8 && plus.level === 'solid');
  ok('skill rows: × not tried here but used before', times.t === 0 && times.old === 3 && times.level === 'none');
  ok('skill rows: ^ locked on the ladder', pow.open === false);
  ok('habits: median cubes from the older record', M.habits.medianCubes === 3.5);
  ok('lifetime challenge stats come from the game', M.ch.all.calls === 4 && M.ch.all.impWins === 1);
}

// ---------------- suggestions ----------------
{
  // a kid who solves × well but rarely uses ÷, never calls Impossible!, and the game spotted 2 Impossible! chances
  const P = P0.blank(day(-20));
  for (let i = 0; i < 20; i++) sol(P, day(-1), i % 5 > 0, ['*', '+']);
  sol(P, day(-1), true, ['/']);
  for (let i = 0; i < 12; i++) P0.record(P, 'shake', {}, day(-1));
  P0.record(P, 'missed', { moments: 8, now: 0, imp: 2 }, day(-1));
  const M = P0.model(P, ctx());
  const ids = M.suggest.map(s => s.id);
  ok('at most 3 suggestions', M.suggest.length <= 3 && M.suggest.length >= 2, ids);
  ok('never called Impossible! (and the proved chances are named)', ids[0] === 'imp' && /2 moments/.test(M.suggest[0].text) && M.suggest[0].act === 'drill:imp', M.suggest[0]);
  ok('rarely uses ÷ next to a lot of ×', ids.indexOf('rare') >= 0 && /÷/.test(M.suggest.find(s => s.id === 'rare').text), ids);
  ok('one button per destination', new Set(M.suggest.map(s => s.act || s.id)).size === M.suggest.length);

  // a shaky operation
  const Q = P0.blank(day(-20));
  for (let i = 0; i < 12; i++) sol(Q, day(-2), i < 5, ['/']);
  for (let i = 0; i < 12; i++) sol(Q, day(-2), true, ['+']);
  P0.record(Q, 'challenge', { kind: 'impossible', role: 'caller', won: true }, day(-2));
  const MQ = P0.model(Q, ctx());
  ok('a shaky operation is named with its numbers', MQ.suggest[0].id === 'shaky' && /5 of 12/.test(MQ.suggest[0].text) && MQ.suggest[0].act === 'drill:make', MQ.suggest[0]);

  // no play this week -> a gentle way back in, first
  const R = P0.blank(day(-30));
  for (let i = 0; i < 5; i++) sol(R, day(-15), true, ['+']);
  const MR = P0.model(R, ctx());
  ok('no play this week -> Daily Puzzle first', MR.suggest[0].id === 'back' && MR.suggest[0].act === 'daily');

  // missed Now! chances and left-out Required cubes
  const N = P0.blank(day(-10));
  for (let i = 0; i < 10; i++) sol(N, day(-1), i < 4, ['+'], { codes: i < 4 ? [] : ['required'] });
  P0.record(N, 'missed', { moments: 10, now: 4, imp: 0 }, day(-1));
  P0.record(N, 'challenge', { kind: 'impossible', role: 'caller', won: true }, day(-1));
  const MN = P0.model(N, ctx());
  const nid = MN.suggest.map(s => s.id);
  ok('Now! chances he let pass -> "Now or not yet?"', nid.indexOf('now') >= 0 && MN.suggest.find(s => s.id === 'now').act === 'drill:now', nid);
  ok('left-out Required cubes are mentioned (same button as other Make the Goal tips, so at most one of them)', nid.filter(i => ['required', 'shaky', 'value', 'rare', 'concat', 'paren'].indexOf(i) >= 0).length <= 1);

  // a brand-new player: friendly defaults only
  const E0 = P0.model(P0.blank(TODAY), ctx());
  ok('brand-new: next creature and How Many Ways?', E0.suggest.map(s => s.id).join() === 'next,ways', E0.suggest.map(s => s.id));
  ok('suggestions never shame', [M, MQ, MR, MN, E0].every(m => m.suggest.every(s => !/wrong|bad|fail|mistake|lazy|should have/i.test(s.text))));
}

// ---------------- export ----------------
{
  const P = P0.blank(day(-2));
  sol(P, day(-1), true, ['+']); P0.record(P, 'active', { sec: 300, session: true }, day(-1));
  const history = [{ t: new Date(2026, 10, 1, 12).getTime(), ok: true, ms: 1, c: 3 }];
  const M = P0.model(P, ctx({ history }));
  const txt = P0.summaryText(M);
  ok('summary: title, week, ladder, creatures, the since note', /how Ty is doing/.test(txt) && /This week: played 1 of 7 days/.test(txt) && /Ladder: B/.test(txt) && /Creatures beaten: 1 of 2/.test(txt) && /since Nov 10/.test(txt), txt);
  const c = P0.csv(M).trim().split('\n');
  ok('csv: header + older-record day + page days', c[0].indexOf('date,active_minutes') === 0 && c.some(l => l.indexOf('2026-11-01') === 0 && /older record/.test(l)) && c.some(l => l.indexOf(day(-1) + ',5,1,1,1') === 0), c);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
