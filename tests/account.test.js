// Tests for the cloud-save merge ("Combine: keep the best of both") in js/account.js.
// Run with:  node tests/account.test.js
// The merge lives between /*MERGE-START*/ and /*MERGE-END*/ in js/account.js; defaults() is read from js/config.js,
// so these tests check exactly the code the game runs.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const acc = fs.readFileSync(path.join(root, 'js', 'account.js'), 'utf8');
const m = acc.match(/\/\*MERGE-START\*\/([\s\S]*?)\/\*MERGE-END\*\//);
if (!m) { console.error('Merge markers not found'); process.exit(1); }
const AM = new Function(m[1] + '\nreturn AccountMerge;')();
const cfg = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const dm = cfg.match(/function defaults\(\) \{[\s\S]*?\r?\n\}\r?\n/);
if (!dm) { console.error('defaults() not found in js/config.js'); process.exit(1); }
const OPPONENTS = Array.from({ length: 10 }, (_, i) => ({ name: 'C' + i }));
const defaults = new Function('OPPONENTS', dm[0] + '\nreturn defaults;')(OPPONENTS);

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
const clone = x => JSON.parse(JSON.stringify(x));
const C = (a, b, aAt = 1, bAt = 2) => AM.combine(a, b, { aAt, bAt }); // b is newer by default

// Keys other features add to S outside defaults() (found with: grep -ohE "\bS\.[a-zA-Z_]+" js/*.js js/three/*.js)
const FEATURE_KEYS = ['camp', 'wx', 'puz', 'cards', 'stadiumTierSeen', 'season', 'fans', 'parent', 'onsets', 'rivals', 'tourney', 'matchday', 'missions', 'pace', 'pin', 'career', 'mmLast'];
const ALL_KEYS = Object.keys(defaults()).concat(FEATURE_KEYS);

// ---------------- every top-level key has an explicit rule and a plain-words description ----------------
ALL_KEYS.forEach(k => { ok('rule for ' + k, typeof AM.RULES[k] === 'function'); ok('described ' + k, typeof AM.DESCRIBE[k] === 'string'); });
Object.keys(AM.RULES).forEach(k => ok('rule ' + k + ' is a real key', ALL_KEYS.indexOf(k) >= 0));

// ---------------- each key, by hand ----------------
const A = defaults(), B = defaults();
// identity
ok('defaults + defaults = defaults', AM.same(C(defaults(), defaults()), defaults()));
// v, xp
A.xp = 900; B.xp = 400; ok('xp max', C(A, B).xp === 900 && C(B, A).xp === 900);
A.v = 1; B.v = 2; ok('v max', C(A, B).v === 2);
// latest-wins identity/settings
A.name = 'Old'; B.name = 'Tyson'; ok('name latest (b newer)', C(A, B).name === 'Tyson'); ok('name latest (a newer)', C(A, B, 5, 2).name === 'Old');
A.backName = 'A'; B.backName = 'B'; ok('backName latest', C(A, B).backName === 'B');
A.jersey = '9'; B.jersey = '10'; ok('jersey latest', C(A, B).jersey === '10');
A.oppNames[0] = 'Fluffy'; ok('oppNames latest', C(A, B).oppNames[0] === '' && C(A, B, 3, 2).oppNames[0] === 'Fluffy');
A.lastDedication = '2026-11-01'; B.lastDedication = '2026-10-01'; ok('lastDedication latest date', C(A, B).lastDedication === '2026-11-01');
A.unlockAll = true; B.unlockAll = false; ok('unlockAll latest', C(A, B).unlockAll === false && C(A, B, 9, 1).unlockAll === true);
A.opsManual = { ops: ['+'], fractions: false }; ok('opsManual latest', C(A, B).opsManual === null && C(A, B, 9, 1).opsManual.ops[0] === '+');
A.kitUse = 'away'; ok('kitUse latest', C(A, B).kitUse === 'home');
A.kit.shirt = '#000'; B.kit.shirt = '#fff'; ok('kit latest', C(A, B).kit.shirt === '#fff');
A.kits.away = { shirt: '#123' }; ok('kits latest keeps keys from both', C(A, B).kits.away.shirt === '#123');
A.team = { mate: 'Mom', mjersey: '3', boss: 1 }; ok('team latest', C(A, B).team.mate === 'Tata' && C(A, B, 9, 1).team.mate === 'Mom');
A.cos = { skin: 'gold', mat: 'space', victory: 'stars', stadiumIntro: true }; B.cos = { skin: 'candy', mat: 'stadium', victory: 'confetti' };
let r = C(A, B); ok('cos latest', r.cos.skin === 'candy' && r.cos.stadiumIntro === true);
A.set.music = 0.1; A.set.weather = 'rain'; B.set.music = 0.9; r = C(A, B); ok('set latest + keys from both', r.set.music === 0.9 && r.set.weather === 'rain');
// badges
A.badges = { first: '2026-01-05', times: '2026-02-01' }; B.badges = { first: '2026-01-02', root: '2026-03-01' };
r = C(A, B); ok('badges union earliest', r.badges.first === '2026-01-02' && r.badges.times && r.badges.root && Object.keys(r.badges).length === 3);
// stats
A.stats.correct = 50; B.stats.correct = 70; A.stats.bestMatch = 18; B.stats.bestMatch = 12; A.stats.streak = 9; B.stats.streak = 1; A.stats.lastWrong = false; B.stats.lastWrong = true;
r = C(A, B); ok('stats totals max', r.stats.correct === 70 && r.stats.bestMatch === 18); ok('stats streak latest', r.stats.streak === 1 && r.stats.lastWrong === true);
// history
A.history = [{ t: 1, ok: true, ms: 5, g: '3', c: 3 }, { t: 3, ok: false, ms: 9, g: '4', c: 2 }]; B.history = [{ t: 2, ok: true, ms: 7, g: '5', c: 3 }, { t: 3, ok: false, ms: 9, g: '4', c: 2 }];
r = C(A, B); ok('history union sorted', r.history.length === 3 && r.history.map(h => h.t).join() === '1,2,3');
A.history = Array.from({ length: 590 }, (_, i) => ({ t: i * 2, ok: true, ms: 1, g: '1', c: 1 })); B.history = Array.from({ length: 590 }, (_, i) => ({ t: i * 2 + 1, ok: true, ms: 1, g: '1', c: 1 }));
r = C(A, B); ok('history capped at 600, newest kept', r.history.length === 600 && r.history[599].t === 1179);
// best
A.best = { fastMs: 4000, hardGoal: 40, hardGoalText: '40', mostCubes: 5 }; B.best = { fastMs: 2500, hardGoal: 12, hardGoalText: '12', mostCubes: 9 };
r = C(A, B); ok('best', r.best.fastMs === 2500 && r.best.hardGoal === 40 && r.best.hardGoalText === '40' && r.best.mostCubes === 9);
ok('best fastMs 0 means none', C({ best: { fastMs: 0, hardGoal: null } }, { best: { fastMs: 3000, hardGoal: null } }).best.fastMs === 3000);
// opsUsed
A.opsUsed = { '+': 5, '*': 1 }; B.opsUsed = { '+': 3, '^': 2 }; r = C(A, B); ok('opsUsed max', r.opsUsed['+'] === 5 && r.opsUsed['*'] === 1 && r.opsUsed['^'] === 2);
// ladder
A.ladder = { stage: 3, stars: 1 }; B.ladder = { stage: 2, stars: 5 }; ok('ladder stage first', C(A, B).ladder.stage === 3 && C(A, B).ladder.stars === 1);
A.ladder = { stage: 2, stars: 1 }; B.ladder = { stage: 2, stars: 4 }; ok('ladder then stars', C(A, B).ladder.stars === 4);
// beaten
A.beaten = [true, false, false, true, false, false, false, false, false, false]; B.beaten = [false, true, false, false, false, false, false, false, false, false];
ok('beaten OR', C(A, B).beaten.filter(Boolean).length === 3);
// cups
A.cups = { run: { id: 'x', round: 1 }, won: { a: 2, b: 1 }, list: [{ id: 'a', date: '2026-01-01', first: true }] };
B.cups = { run: null, won: { a: 1, c: 1 }, list: [{ id: 'c', date: '2026-02-01', first: true }, { id: 'a', date: '2026-01-01', first: true }] };
r = C(A, B); ok('cups', r.cups.won.a === 2 && r.cups.won.b === 1 && r.cups.won.c === 1 && r.cups.list.length === 2 && r.cups.run === null);
ok('cups run from newer', C(A, B, 9, 1).cups.run.id === 'x');
// ways
A.ways = { lvl: 4, row: 1, miss: 0, done: 20, total: 60, best: { 1: 'gold', 2: 'bronze' } }; B.ways = { lvl: 2, row: 0, miss: 1, done: 8, total: 70, best: { 2: 'silver', 3: 'bronze' } };
r = C(A, B); ok('ways', r.ways.lvl === 4 && r.ways.done === 20 && r.ways.total === 70 && r.ways.best[1] === 'gold' && r.ways.best[2] === 'silver' && r.ways.best[3] === 'bronze');
// gift
A.gift = { made: [{ code: 'X1', t: 5 }], solved: { P1: { t: 10 }, P2: { t: 3 } } }; B.gift = { made: [{ code: 'X2', t: 9 }, { code: 'X1', t: 5 }], solved: { P1: { t: 4 }, P3: { t: 1 } } };
r = C(A, B); ok('gift', r.gift.made.length === 2 && r.gift.made[0].code === 'X2' && Object.keys(r.gift.solved).length === 3 && r.gift.solved.P1.t === 4);
// tips
A.tips = { seen: 4, kinds: { a: 2 }, last: ['a'] }; B.tips = { seen: 2, kinds: { a: 1, b: 1 }, last: ['b'] }; r = C(A, B); ok('tips', r.tips.seen === 4 && r.tips.kinds.a === 2 && r.tips.kinds.b === 1 && r.tips.last[0] === 'b');
// trios
A.trios = { '0-1': true }; B.trios = { '2-3': true }; ok('trios union', Object.keys(C(A, B).trios).length === 2);
// vari
A.vari = { base: 30, seen: 2 }; B.vari = { base: null, seen: 5 }; r = C(A, B); ok('vari', r.vari.base === 30 && r.vari.seen === 5);
ok('vari earliest base', C({ vari: { base: 30, seen: 0 } }, { vari: { base: 12, seen: 0 } }).vari.base === 12);
// bonus
A.bonus = { base: 50, seen: { twist: true }, force: { big: true }, off: {}, opOff: {}, opsSeen: { '%': true } }; B.bonus = { base: 40, seen: { big: true }, force: {}, off: { twist: true }, opOff: {}, opsSeen: {} };
r = C(A, B); ok('bonus', r.bonus.base === 40 && r.bonus.seen.twist && r.bonus.seen.big && r.bonus.opsSeen['%'] && r.bonus.off.twist && !r.bonus.force.big);
// teamWins, tutorialDone, dailyDone
A.teamWins = { 0: 2 }; B.teamWins = { 0: 1, 3: 1 }; r = C(A, B); ok('teamWins max', r.teamWins[0] === 2 && r.teamWins[3] === 1);
A.tutorialDone = true; B.tutorialDone = false; ok('tutorialDone OR', C(A, B).tutorialDone === true);
A.dailyDone = { '2026-01-01': true }; B.dailyDone = { '2026-01-02': true }; ok('dailyDone union', Object.keys(C(A, B).dailyDone).length === 2);
// feature keys
r = C({ camp: { quizRow: 2, add: { lvl: 3, row: 0, miss: 0, done: 9 } } }, { camp: { quizRow: 0, add: { lvl: 1, row: 1, miss: 0, done: 2 }, mul: { lvl: 2, row: 0, miss: 0, done: 1 } } });
ok('camp', r.camp.add.lvl === 3 && r.camp.add.done === 9 && r.camp.mul.lvl === 2 && r.camp.quizRow === 0);
r = C({ wx: { n: 9, cur: { sky: 'rain' } } }, { wx: { n: 3, cur: { sky: 'clear' } } }); ok('wx', r.wx.n === 9 && r.wx.cur.sky === 'clear');
r = C({ puz: { date: '2026-11-12', cur: 3, extra: 1 } }, { puz: { date: '2026-11-12', cur: 1, extra: 2 } }); ok('puz same day', r.puz.cur === 3 && r.puz.extra === 2);
r = C({ puz: { date: '2026-11-12', cur: 3, extra: 1 } }, { puz: { date: '2026-11-11', cur: 5, extra: 2 } }); ok('puz later day', r.puz.cur === 3);
r = C({ cards: { a: '2026-02-01' } }, { cards: { a: '2026-01-01', b: '2026-03-01' } }); ok('cards', r.cards.a === '2026-01-01' && r.cards.b);
ok('stadiumTierSeen max', C({ stadiumTierSeen: 3 }, { stadiumTierSeen: 2 }).stadiumTierSeen === 3);
const lg = (n, k, sim) => ({ n, seed: 1, t: [[k, 0, 0, 0, 0, 0]], f: [''], pl: [0, 0, 0, 0, 0], k, sim, last: null });
r = C({ season: { v: 1, last: 'c', c: lg(2, 3, 6), m: lg(1, 9, 18), hist: [{ lg: 'c', n: 1, date: '2026-05-01', place: 2 }], won: { gold: 0, silver: 1, bronze: 0, blue: 0 }, cer: null } },
  { season: { v: 1, last: 'm', c: lg(1, 10, 20), m: lg(1, 4, 8), hist: [], won: { gold: 0, silver: 0, bronze: 0, blue: 0 }, cer: null } });
ok('season', r.season.c.n === 2 && r.season.m.k === 9 && r.season.hist.length === 1 && r.season.won.silver === 1 && r.season.last === 'm');
r = C({ fans: { v: 1, k: { chef: { d: '2026-03-02', at: ['stadium'] } } } }, { fans: { v: 1, k: { chef: { d: '2026-03-01', at: ['beach'] }, cat: { d: '2026-04-01', at: ['night'] } } } });
ok('fans', r.fans.k.chef.d === '2026-03-01' && r.fans.k.chef.at.length === 2 && r.fans.k.cat);
A.career = { seen: { flip: 1 } }; B.career = { seen: { chroma: 1 } }; r = C(A, B); ok('career seen union', r.career.seen.flip === 1 && r.career.seen.chroma === 1);
A.mmLast = 3; B.mmLast = 5; ok('mmLast latest', C(A, B).mmLast === 5);
// unknown keys from a future feature: kept from either side, objects merged key by key
r = C({ newThing: { a: 1, deep: { x: 1 } } }, { newThing: { b: 2, deep: { y: 2 } }, other: 5 }); ok('unknown keys kept', r.newThing.a === 1 && r.newThing.b === 2 && r.newThing.deep.x === 1 && r.newThing.deep.y === 2 && r.other === 5);

// ---------------- summary / isFresh ----------------
ok('fresh default', AM.isFresh(defaults()));
const P = defaults(); P.xp = 10; ok('not fresh with xp', !AM.isFresh(P));
const P2 = defaults(); P2.name = 'Tyson'; P2.kit.shirt = '#000'; ok('settings alone still fresh', AM.isFresh(P2));
const sm = AM.summary({ xp: 150, beaten: [true, true, false], badges: { a: '1', b: '2' }, stats: { correct: 4 }, history: [{ t: 5 }, { t: 9 }] });
ok('summary', sm.level === 2 && sm.beaten === 2 && sm.creatures === 3 && sm.badges === 2 && sm.correct === 4 && sm.last === 9, sm);

// ---------------- "never loses progress" with random saves ----------------
let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = n => Math.floor(rnd() * n), coin = () => rnd() < 0.5, date = () => '2026-' + String(1 + ri(12)).padStart(2, '0') + '-' + String(1 + ri(28)).padStart(2, '0');
const BADGES = ['first', 'times', 'divide', 'power', 'root', 'streak5', 'daily', 'champ'], OPS = ['+', '-', '*', '/', '^', 'r'];
function randomSave() {
  const s = defaults();
  s.xp = ri(5000); s.name = coin() ? 'Tyson' : 'T';
  BADGES.forEach(b => { if (coin()) s.badges[b] = date(); });
  Object.keys(s.stats).forEach(k => { if (typeof s.stats[k] === 'number') s.stats[k] = ri(200); });
  s.history = Array.from({ length: ri(700) }, () => ({ t: ri(1e6), ok: coin(), ms: ri(9000), g: String(ri(50)), c: ri(9) }));
  s.history.sort((a, b) => a.t - b.t); s.history = s.history.slice(-600);
  s.best = { fastMs: coin() ? 0 : 1000 + ri(9000), hardGoal: coin() ? null : ri(99), hardGoalText: '', mostCubes: ri(12) };
  OPS.forEach(o => { if (coin()) s.opsUsed[o] = ri(50); });
  s.ladder = { stage: 1 + ri(4), stars: ri(6) };
  s.beaten = s.beaten.map(() => coin());
  s.cups.won = { a: ri(3), b: ri(3) }; s.cups.list = Array.from({ length: ri(4) }, () => ({ id: coin() ? 'a' : 'b', date: date(), first: coin() }));
  s.ways = { lvl: 1 + ri(5), row: ri(2), miss: ri(2), done: ri(40), total: ri(200), best: { 1: ['', 'bronze', 'silver', 'gold'][ri(4)], 2: ['', 'bronze', 'gold'][ri(3)] } };
  s.gift.made = Array.from({ length: ri(5) }, (_, i) => ({ code: 'M' + ri(9), t: ri(1e6) }));
  for (let i = ri(6); i > 0; i--) s.gift.solved['G' + ri(20)] = { t: ri(1e6) };
  s.tips = { seen: ri(20), kinds: { a: ri(5), b: ri(5) }, last: ['a'] };
  for (let i = ri(5); i > 0; i--) s.trios[ri(10) + '-' + ri(10)] = true;
  s.vari = { base: coin() ? null : ri(100), seen: ri(19) };
  s.bonus.base = coin() ? null : ri(100); ['twist', 'big', 'power'].forEach(d => { if (coin()) s.bonus.seen[d] = true; });
  for (let i = ri(4); i > 0; i--) s.teamWins[ri(10)] = 1 + ri(5);
  s.tutorialDone = coin();
  for (let i = ri(8); i > 0; i--) s.dailyDone[date()] = true;
  s.camp = { quizRow: ri(3), add: { lvl: 1 + ri(5), row: 0, miss: 0, done: ri(30) } };
  s.wx = { n: ri(50) }; s.cards = {}; ['c1', 'c2', 'c3'].forEach(c => { if (coin()) s.cards[c] = date(); });
  s.stadiumTierSeen = 1 + ri(4); s.matchday = { seed: ri(99999), n: ri(50) }; s.tourney = { rounds: ri(9), wins: ri(5), ties: ri(3), mp: ri(40), best: ri(18), log: [{ t: 1000 + ri(5000), div: 'E', n: 3, sc: [ri(20), ri(20), ri(20)], mp: [6, 4, 2], names: ['A', 'B', 'C'] }], opt: { on: ri(2) === 1, strict: false } }; s.rivals = { rusty: { n: ri(9), w: ri(5), l: ri(4), d: '2026-11-1' + ri(9), bs: ri(4), ms: {} } }; s.onsets = { v: 1, stars: ri(20), beaten: [], stats: { shakes: ri(30), wins: ri(9) }, tutorialDone: ri(2) === 1 }; s.parent = { v: 1, tot: { sol: ri(50), ok: ri(40) }, days: { [date()]: { min: ri(30), sol: ri(9) } } }; s.puz = { date: date(), cur: ri(4), extra: ri(3) };
  s.season = { v: 1, last: 'c', c: lg(1 + ri(3), ri(11), ri(21)), m: lg(1 + ri(3), ri(11), ri(21)), hist: Array.from({ length: ri(4) }, (_, i) => ({ lg: coin() ? 'c' : 'm', n: i + 1, date: date(), place: 1 + ri(6) })), won: { gold: ri(3), silver: ri(3), bronze: ri(3), blue: ri(3) }, cer: null };
  s.fans = { v: 1, k: {} }; ['chef', 'cat', 'wizard'].forEach(k => { if (coin()) s.fans.k[k] = { d: date(), at: ['stadium'] }; });
  s.pin = { s: 'salt' + ri(99), h: 'ab' + ri(9999) };
  s.career = { seen: {} }; ['flip', 'nugget'].forEach(k => { if (coin()) s.career.seen[k] = 1; }); s.mmLast = ri(15);
  s.pace = { v: 1, lv: { 0: { n: ri(9), avg: 2000 + ri(6000), slack: ri(2000) } } };
  s.missions = { v: 1, n: ri(300), s: {} }; if (coin()) s.missions.cv = 'blue'; ['g_set', 'c_now', 'o_div', 'f_frac'].forEach(id => { if (coin()) s.missions.s[id] = [1 + ri(6), date(), ri(15) - 1, ri(9), ri(3)]; });
  return s;
}
const sub = (a, b) => Object.keys(a || {}).filter(k => a[k]).every(k => b && b[k]); // every truthy key of a is in b
let bad = 0;
for (let i = 0; i < 400; i++) {
  const a = randomSave(), b = randomSave(), ca = clone(a), cb = clone(b);
  const out = C(a, b, ri(10), ri(10));
  const checks = {
    inputsUntouched: AM.same(a, ca) && AM.same(b, cb),
    xp: out.xp >= a.xp && out.xp >= b.xp,
    level: AM.levelFor(out.xp) >= Math.max(AM.levelFor(a.xp), AM.levelFor(b.xp)),
    badges: sub(a.badges, out.badges) && sub(b.badges, out.badges),
    beaten: a.beaten.every((v, j) => !v || out.beaten[j]) && b.beaten.every((v, j) => !v || out.beaten[j]),
    stats: Object.keys(a.stats).filter(k => !/streak|noHint|lastWrong/.test(k)).every(k => out.stats[k] >= a.stats[k] && out.stats[k] >= b.stats[k]),
    ladder: [a, b].every(s => out.ladder.stage > s.ladder.stage || (out.ladder.stage === s.ladder.stage && out.ladder.stars >= s.ladder.stars)),
    opsUsed: OPS.every(o => (out.opsUsed[o] || 0) >= Math.max(a.opsUsed[o] || 0, b.opsUsed[o] || 0)),
    best: out.best.mostCubes >= Math.max(a.best.mostCubes, b.best.mostCubes) && [a, b].every(s => !s.best.fastMs || out.best.fastMs <= s.best.fastMs) && [a, b].every(s => s.best.hardGoal === null || out.best.hardGoal >= s.best.hardGoal),
    history: (() => { const keys = new Set(out.history.map(h => h.t + '|' + h.ms + '|' + h.g + '|' + h.ok)); const all = a.history.concat(b.history).sort((x, y) => x.t - y.t); const newest = all.slice(-Math.min(600, keys.size)); return out.history.length === Math.min(600, new Set(all.map(h => h.t + '|' + h.ms + '|' + h.g + '|' + h.ok)).size) && newest.slice(-50).every(h => keys.has(h.t + '|' + h.ms + '|' + h.g + '|' + h.ok)); })(),
    cups: ['a', 'b'].every(k => out.cups.won[k] >= Math.max(a.cups.won[k], b.cups.won[k])) && a.cups.list.concat(b.cups.list).every(x => out.cups.list.some(y => JSON.stringify(y) === JSON.stringify(x))),
    ways: out.ways.done >= Math.max(a.ways.done, b.ways.done) && out.ways.total >= Math.max(a.ways.total, b.ways.total),
    gift: sub(a.gift.solved, out.gift.solved) && sub(b.gift.solved, out.gift.solved) && a.gift.made.concat(b.gift.made).every(x => out.gift.made.some(y => y.code === x.code)),
    tips: out.tips.seen >= Math.max(a.tips.seen, b.tips.seen),
    trios: sub(a.trios, out.trios) && sub(b.trios, out.trios),
    vari: out.vari.seen >= Math.max(a.vari.seen, b.vari.seen) && [a, b].every(s => s.vari.base === null || out.vari.base <= s.vari.base),
    bonus: sub(a.bonus.seen, out.bonus.seen) && sub(b.bonus.seen, out.bonus.seen) && [a, b].every(s => s.bonus.base === null || out.bonus.base <= s.bonus.base),
    teamWins: Object.keys(a.teamWins).concat(Object.keys(b.teamWins)).every(k => out.teamWins[k] >= Math.max(a.teamWins[k] || 0, b.teamWins[k] || 0)),
    tutorial: out.tutorialDone === (a.tutorialDone || b.tutorialDone),
    daily: sub(a.dailyDone, out.dailyDone) && sub(b.dailyDone, out.dailyDone),
    camp: out.camp.add.done >= Math.max(a.camp.add.done, b.camp.add.done),
    wx: out.wx.n >= Math.max(a.wx.n, b.wx.n),
    cards: sub(a.cards, out.cards) && sub(b.cards, out.cards),
    tier: out.stadiumTierSeen >= Math.max(a.stadiumTierSeen, b.stadiumTierSeen),
    season: ['gold', 'silver', 'bronze', 'blue'].every(k => out.season.won[k] >= Math.max(a.season.won[k], b.season.won[k])) && ['c', 'm'].every(l => out.season[l].n >= Math.max(a.season[l].n, b.season[l].n)),
    fans: sub(a.fans.k, out.fans.k) && sub(b.fans.k, out.fans.k),
    everyKey: ALL_KEYS.every(k => k in out),
    idempotent: AM.same(C(out, out), out),
    commutative: (() => { const x = C(a, b, 1, 2), y = C(b, a, 2, 1); return x.xp === y.xp && AM.same(x.badges, y.badges) && AM.same(x.history, y.history) && AM.same(x.beaten, y.beaten) && AM.same(x.ladder, y.ladder) && x.name === y.name; })()
  };
  Object.keys(checks).forEach(k => { if (!checks[k]) { bad++; if (bad < 10) ok('random #' + i + ' ' + k, false); } });
  pass++;
}
ok('random saves never lose progress (400 pairs)', bad === 0, bad);

// ---------------- size of a typical save (what goes to the cloud) ----------------
const typical = randomSave(); typical.history = typical.history.slice(-300);
const full = randomSave(); full.history = Array.from({ length: 600 }, (_, i) => ({ t: 1.7e12 + i * 6e4, ok: true, ms: 12345, g: '3 1/2', c: 5 }));
const kb = s => (JSON.stringify(s).length / 1024).toFixed(1);
console.log('Save size: default ' + kb(defaults()) + ' KB, typical (300 history) ' + kb(typical) + ' KB, full history (600) ' + kb(full) + ' KB');
ok('full save well under the 300000-character rule limit', JSON.stringify(full).length < 300000);

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
