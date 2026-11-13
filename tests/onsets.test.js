// Unit tests for the On-Sets engine (js/onsets/engine.js) and computer player (js/onsets/ai.js).
// Run with:  node tests/onsets.test.js
// Rule references: "R" = On-Sets Tournament Rules 2026-27 (agloa.org), page numbers O2..O17, OG = Glossary.
// "M" = the AGLOA Judges' Manual 2026-27, On-Sets situation numbers (OS-B4, OS-E3, ...). The manual's text is
// not copied here; each case just names the situation it checks.
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const OSE = require(path.join(root, 'js', 'onsets', 'engine.js'));
global.OSE = OSE;
const OSAI = require(path.join(root, 'js', 'onsets', 'ai.js'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
// Cards: 'BR' -> mask. Universe from a list of names ('-' = blank card).
const C = s => s === '-' ? 0 : s.split('').reduce((m, c) => m | OSE.BIT[c], 0);
const Uni = list => list.map(C);
// Tokens from a compact string: B R G Y V N(Λ) U(∪) I(∩) - ' ( ) = S(⊆), spaces ignored.
const T = s => s.replace(/\s+/g, '').split('');
const count = (expr, U) => { const r = OSE.evaluate(T(expr), U); return r.ok ? (r.ambiguous && r.counts.length > 1 ? 'AMB:' + r.counts.sort((a, b) => a - b).join('/') : r.counts[0]) : 'ERR:' + r.code; };
const cards = (expr, U) => { const r = OSE.evaluate(T(expr), U); return r.ok && r.set !== null ? OSE.setCards(r.set, U).map(OSE.cardName).sort().join(' ') : 'ERR'; };

// A universe with all 16 cards, and a smaller hand-checked one.
const ALL16 = Array.from({ length: 16 }, (_, i) => i);
const U8 = Uni(['B', 'R', 'BR', 'G', 'GY', 'BRG', 'Y', '-']);

// ---------------- The four operations (R I-B-2-c, page O3) ----------------
ok('B ∪ G: cards that are B or G', cards('BUG', U8) === 'B BR BRG G GY', cards('BUG', U8));
ok('R ∩ Y: cards that are both R and Y (none here)', cards('RIY', U8) === '');
ok('B − Y: B but not Y', cards('B-Y', U8) === 'B BR BRG', cards('B-Y', U8));
ok("G′: cards that are not G", cards("G'", U8) === 'B BR R Y blank', cards("G'", U8));
ok('V names every card (R I-B-2-d)', count('V', U8) === 8);
ok('Λ names no cards', count('N', U8) === 0);
ok('each colour on 8 of the 16 cards', ['B', 'R', 'G', 'Y'].every(c => count(c, ALL16) === 8));
ok("the blank card is in R′ (only cards with no red dot)", cards("R'", U8).split(' ').indexOf('blank') >= 0);
ok("double complement R′′ = R", count("R''", U8) === count('R', U8));

// ---------------- Order of operations: ′ first, nothing else (R III-E page O2, VII-B-6-b page O10) ----------------
ok("R ∪ G′ is not ambiguous: it means R ∪ (G′) (R VII-C-5-c example b, page O12)", count("RUG'", U8) === 6, count("RUG'", U8));
ok("…and differs from (R ∪ G)′", count("(RUG)'", U8) === 3);
ok("M OS-E3: R ∪ B′ is read R ∪ (B′), never (R ∪ B)′", count("RUB'", U8) === count("RU(B')", U8) && count("RUB'", U8) !== count("(RUB)'", U8));
ok('B ∪ G − R is ambiguous (R VII-C-5-c example a)', count('BUG-R', U8) === 'AMB:3/5', count('BUG-R', U8));
ok('(B ∪ G) − R has one reading', count('(BUG)-R', U8) === 3);
ok('B ∪ (G − R) has one reading', count('BU(G-R)', U8) === 5);
const amb = OSE.evaluate(T('BUG-R'), U8);
ok('both groupings are reported with example text', amb.examples[3] === '(B ∪ G) − R' && amb.examples[5] === 'B ∪ (G − R)', amb.examples);
ok('B ∪ G ∪ R: every grouping gives the same set, so one set', OSE.evaluate(T('BUGUR'), U8).sets.length === 1);
ok('B ∩ R ∩ G: one set', OSE.evaluate(T('BIRIG'), U8).sets.length === 1);
ok('B − R − G is ambiguous', OSE.evaluate(T('B-R-G'), U8).sets.length === 2);
ok('three-operation chain: every grouping kept (5 groupings max)', OSE.evaluate(T('B-R-G-Y'), ALL16).sets.length >= 2);

// ---------------- Legal and undefined Set-Names (R VI-A page O8, Glossary "Undefined" OG7) ----------------
['R\'', 'GUY', '(RIB)-N', "(V-G)'UR"].forEach(e => ok('legal Set-Name ' + e + ' (R VI-A examples)', OSE.evaluate(T(e), U8).ok, e));
ok("'B is undefined (Glossary)", count("'B", U8) === 'ERR:prime');
ok('G ∪ is undefined (Glossary)', count('GU', U8) === 'ERR:missing');
ok('− R is undefined (Glossary)', count('-R', U8) === 'ERR:missing');
ok("R ∪ ′B is undefined (R VII-C-5-d example a)", count("RU'B", U8) === 'ERR:prime');
ok('R Λ G is undefined (R VII-C-5-d example a)', count('RNG', U8) === 'ERR:adjacent');
ok('RB (two sets side by side) is undefined', count('RB', U8) === 'ERR:adjacent');
ok("M OS-E6: B′ (−G) is undefined", String(count("B'(-G)", U8)).indexOf('ERR') === 0);
ok('unmatched ( is caught', count('(BUR', U8) === 'ERR:paren');
ok('unmatched ) is caught', count('BUR)', U8) === 'ERR:paren');
ok('empty ( ) is caught', count('()', U8) === 'ERR:paren');
ok('(R)(B) is undefined', count('(R)(B)', U8) === 'ERR:adjacent');
ok('extra parentheses are fine: ((R))', count('((R))', U8) === count('R', U8));
ok('= in a Set-Name is automatically wrong (R VI-A page O8)', count('B=R', U8) === 'ERR:rel');
ok('digits are not part of a Set-Name', count('B U 3', U8) === 'ERR:digit');

// ---------------- Goals (R III-B, pages O5-O6) ----------------
const G = (shape, ...d) => OSE.goalValue({ shape, digits: d.map(x => ({ s: String(Math.abs(x)), neg: x < 0 || Object.is(x, -0) })) });
ok('A', G('A', 4).value === 4);
ok('A + B side by side', G('A+B', 2, 3).value === 5);
ok('A + B + C', G('A+B+C', 1, 2, 3).value === 6);
ok('A × B stacked', G('AxB', 3, 4).value === 12);
ok('A × B × C', G('AxBxC', 2, 2, 3).value === 12);
ok('A × (B + C) (upside-down T)', G('Ax(B+C)', 2, 1, 3).value === 8);
ok('(A × B) + C (L shape)', G('AxB+C', 2, 3, 1).value === 7);
ok('upside-down digit is negative: 2 + (−2) = 0', G('A+B', 2, -2).value === 0);
ok('a Goal can be negative (then Impossible is right, M OS-B4)', G('A', -3).value === -3);
ok('wrong number of cubes for a shape is refused', !G('A+B', 2).ok);
ok('an unknown shape (like a backwards L) is refused (M OS-B2)', !OSE.goalValue({ shape: 'backL', digits: [{ s: '1' }, { s: '2' }, { s: '3' }] }).ok);
ok('digit cube faces: 1 1 2 3 4 5 (Glossary "Digit cube")', OSE.FACES.digit.join('') === '112345');
const ideas = OSE.goalIdeas(['1', '2', '3']);
ok('goal ideas from 1,2,3 include 9 = 3 × (1 + 2)', ideas.some(g => g.value === 9 && g.shape === 'Ax(B+C)'));
ok('goal ideas include 0 (2 + upside-down... no: 1 + 2 − 3)', ideas.some(g => g.value === 0));
ok('goal ideas without negatives never go below 1', OSE.goalIdeas(['1', '2', '3'], { neg: false }).every(g => g.value >= 1));
ok('largest goal from 5,5,5 is 5 × (5 + 5) = 50', Math.max(...OSE.goalIdeas(['5', '5', '5']).map(g => g.value)) === 125); // 5×5×5

// ---------------- Rolling (R I-B-2 page O3, II-A-3 page O4) ----------------
const rr = OSE.roll(OSE.rng(7), { vn: 'VNN' });
ok('18 cubes', rr.length === 18);
ok('3 digit, 8 colour, 4 operation, 3 Restriction cubes', ['digit', 'color', 'op', 'restr'].map(k => rr.filter(c => c.kind === k).length).join() === '3,8,4,3');
ok('Elementary: the Restriction cubes are set out as V/Λ, not rolled (one V, two Λ here)', rr.filter(c => c.kind === 'restr').map(c => c.s).join('') === 'VNN');
ok('Elementary default: two V and one Λ', OSE.roll(OSE.rng(1)).filter(c => c.kind === 'restr').map(c => c.s).join('') === 'VVN');
let okFaces = true; for (let i = 0; i < 200; i++) OSE.roll(OSE.rng(i)).forEach(c => { if (OSE.FACES[c.kind].indexOf(c.s) < 0 && !(c.kind === 'restr')) okFaces = false; });
ok('every rolled face is a real face of its kind of cube', okFaces);
const d12 = OSE.deal(12, OSE.rng(3));
ok('dealt cards are distinct', new Set(d12).size === 12 && d12.every(c => c >= 0 && c < 16));

// ---------------- Restrictions (R VI-B pages O8-O9; not used in Elementary) ----------------
const restr = (list, U) => { const r = OSE.applyRestrictions(U, list.map(T)); return r.ok ? r.universe.map(OSE.cardName).sort().join(' ') : 'ERR:' + r.code; };
ok("B ⊆ R′ removes cards that are B and R", restr(["BSR'"], U8) === 'B G GY R Y blank', restr(["BSR'"], U8));
ok('G − Y ⊆ Λ removes G cards without Y', restr(['G-YSN'], U8) === 'B BR GY R Y blank', restr(['G-YSN'], U8));
ok('B ∪ Y ⊆ B ∪ Y removes nothing', restr(['BUYSBUY'], U8).split(' ').length === 8);
ok('B = R removes cards with exactly one of B, R', restr(['B=R'], U8) === 'BR BRG G GY Y blank', restr(['B=R'], U8));
ok('R = R removes nothing', restr(['R=R'], U8).split(' ').length === 8);
ok('G − Y = V keeps only cards in G − Y', restr(['G-Y=V'], U8) === 'BRG G', restr(['G-Y=V'], U8));
ok("(B ∩ G)′ = Y − R is legal", restr(["(BIG)'=Y-R"], U8) !== 'ERR');
ok("B − R ⊆ (G ∩ V)′ is legal", restr(["B-RS(GIV)'"], U8).indexOf('ERR') < 0);
ok('chain A ⊆ B ⊆ C means A ⊆ B and B ⊆ C', restr(['BSRSG'], U8) === restr(['BSR', 'RSG'], U8));
ok('chain A = B ⊆ C', restr(['B=RSG'], U8) === restr(['B=R', 'RSG'], U8));
ok('( ) around a whole Restriction are allowed: (B ⊆ R ∪ G)', restr(['(BSRUG)'], U8) === restr(['BSRUG'], U8));
ok('( ) around one side are allowed: B ⊆ (R ∪ G)', restr(['BS(RUG)'], U8) === restr(['BSRUG'], U8));
ok('(A ⊆ B) ⊆ C is meaningless', restr(['(BSR)SG'], U8) === 'ERR:paren');
ok("(B = R)′ is meaningless", restr(["(B=R)'"], U8).indexOf('ERR') === 0);
ok('a Restriction needs = or ⊆', restr(['BUR'], U8) === 'ERR:rel');
ok("M OS-E10 / R VII-B-4-a: Restriction B = B with Set-Name B is 3 cubes (Middle)", (() => {
  const U = Uni(['B', 'R', 'BR']);
  const ids = [0, 1, 2], z = () => 'permitted';
  const c = OSE.checkSolution([{ s: 'B', id: 2 }], { universe: U, goal: 2, mode: 'last', zone: z, restrictions: [[{ s: 'B', id: 0 }, { s: '=', id: 1 }, { s: 'B', id: 2 }]], division: 'M' });
  return c.cubes === 3 && !c.reasons.some(r => /at least 2/.test(r));
})());
ok('Restrictions are refused in Elementary', !OSE.checkSolution([{ s: 'B', id: 0 }], { universe: U8, goal: 3, mode: 'last', zone: () => 'permitted', restrictions: [T('B=B')] }).ok);

// ---------------- Checking Solutions (R III, VII-B) ----------------
// Mat: ids -> zone. Build tokens from "sym@id" pairs.
function mat(spec) { const z = {}; Object.keys(spec).forEach(k => spec[k].forEach(id => z[id] = k)); return id => z[id] || 'forbidden'; }
const tok = s => s.split(' ').map(p => { if (p === '(' || p === ')') return p; const [sym, id] = p.split('@'); return { s: sym, id: +id }; });
const zone1 = mat({ required: [1], permitted: [2, 3, 4], resources: [5, 6], forbidden: [7] });
const ctx = (goal, mode, extra) => Object.assign({ universe: U8, goal, mode, zone: zone1, required: [1] }, extra || {});
// cube 1 = B (Required), 2 = U, 3 = G, 4 = -, 5 = R, 6 = I, 7 = Y (Forbidden)
let r = OSE.checkSolution(tok('B@1 U@2 G@3'), ctx(5, 'last'));
ok('correct: B ∪ G has 5 cards', r.ok, r.reasons);
r = OSE.checkSolution(tok('B@1 U@2 G@3'), ctx(4, 'last'));
ok('wrong count gives a kind reason with both numbers', !r.ok && /has 5 cards, but the Goal is 4/.test(r.reasons[0]), r.reasons);
r = OSE.checkSolution(tok('G@3 U@2 R@5'), ctx(6, 'now'));
ok('missing Required cube (R VII-B-4-b)', !r.ok && r.reasons.some(x => /Required/.test(x)), r.reasons);
r = OSE.checkSolution(tok('B@1 U@2 Y@7'), ctx(5, 'impossible'));
ok('Forbidden cube used (R VII-B-4-d)', !r.ok && r.reasons.some(x => /Forbidden/.test(x)), r.reasons);
r = OSE.checkSolution(tok('B@1 U@2 R@5'), ctx(4, 'now'));
ok('Now!: one Resource cube is fine (R VII-B-4-e)', r.ok, r.reasons);
r = OSE.checkSolution(tok('( B@1 U@2 R@5 ) I@6 G@3'), ctx(1, 'now'));
ok('Now!: two Resource cubes is not', !r.ok && r.reasons.some(x => /only ONE/.test(x)), r.reasons);
r = OSE.checkSolution(tok('( B@1 U@2 R@5 ) I@6 G@3'), ctx(1, 'impossible'));
ok('Impossible!: Resource cubes count as Permitted (R VII-B-4-f)', r.ok, r.reasons);
r = OSE.checkSolution(tok('B@1 U@2 R@5'), ctx(4, 'last'));
ok('after the last cube there are no Resources to use', !r.ok);
r = OSE.checkSolution(tok('B@1'), ctx(4, 'last'));
ok('at least two cubes (R III-A, VII-B-4-a)', !r.ok && r.reasons.some(x => /at least 2/.test(x)), r.reasons);
r = OSE.checkSolution(tok('B@1 U@2 B@1'), ctx(4, 'last'));
ok('a cube may be used only once', !r.ok && r.reasons.some(x => /only once/.test(x)), r.reasons);
r = OSE.checkSolution(tok('B@1 U@2 G@3 =@9 5@0'), ctx(5, 'last'));
ok('M OS-E2: writing "= Goal" after the Set-Name is automatically wrong', !r.ok, r.reasons);
// ambiguity: B ∪ G − R on U8 has 3 or 5 cards
r = OSE.checkSolution(tok('B@1 U@2 G@3 -@4 R@5'), ctx(3, 'impossible'));
ok('ambiguous Solution with a wrong reading is incorrect (R VII-B-6-a)', !r.ok && /two ways/.test(r.reasons[0]), r.reasons);
r = OSE.checkSolution(tok('( B@1 U@2 G@3 ) -@4 R@5'), ctx(3, 'impossible'));
ok('…and correct once grouped', r.ok, r.reasons);
// A chain like B ∪ G ∪ R needs no ( ): every grouping names the same set.
r = OSE.checkSolution(tok('B@1 U@2 G@3 U@6 R@5'), ctx(6, 'impossible'));
ok('B ∪ G ∪ R needs no parentheses', r.ok && !r.ambiguous, r.reasons);
ok('a negative Goal can never be matched (M OS-B4)', !OSE.checkSolution(tok('B@1 U@2 G@3'), ctx(-1, 'last')).ok);
ok('Goal given as a configuration works too', OSE.checkSolution(tok('B@1 U@2 G@3'), ctx({ shape: 'A+B', digits: [{ s: '2' }, { s: '3' }] }, 'last')).ok);

// ---------------- Solver ----------------
let s = OSE.solve({ universe: U8, goal: 5, req: ['B'], perm: ['U', 'G'], res: [], mode: 'last' });
ok('solver finds B ∪ G', s.found && OSE.evaluate(s.tokens, U8).count === 5, s);
s = OSE.solve({ universe: U8, goal: 9, req: ['B'], perm: ['U', 'G'], res: [], mode: 'impossible' });
ok('Goal bigger than the Universe: proved impossible', !s.found && s.complete);
s = OSE.solve({ universe: U8, goal: 3, req: ['B', 'R'], perm: [], res: ['G', 'Y'], mode: 'impossible' });
ok('two Required sets and no operation: proved impossible', !s.found && s.complete, s);
s = OSE.solve({ universe: U8, goal: 3, req: ['B'], perm: [], res: ['I', 'R', 'U'], mode: 'now' });
ok('Now!: only one Resource cube, so B + one cube can\'t make a 2-cube Set-Name with a set', !s.found && s.complete, s);
s = OSE.solve({ universe: U8, goal: 5, req: ['B'], perm: ["'"], res: [], mode: 'last' });
ok("B′ has 5 cards here", s.found && s.cubes === 2, s);
s = OSE.solve({ universe: U8, goal: 2, req: [], perm: ['B', 'R', 'I', 'U', 'G'], res: [], mode: 'last', maxCubes: 3 });
ok('maxCubes limits the search and then nothing is proved if not found', s.found || !s.complete, s);
s = OSE.solve({ universe: U8, goal: 0, req: ['G'], perm: ['N', 'I'], res: [], mode: 'last' });
ok('Goal 0: G ∩ Λ', s.found, s);
s = OSE.solve({ universe: U8, goal: 3, req: [], perm: [], res: ['B', 'U', 'R', 'I', 'G', '-', 'Y', "'", 'V', 'N'], mode: 'impossible', timeMs: 2000 });
ok('a big pool is searched completely in time', s.found && s.complete, s);

// Round trips: whatever the solver finds, the checker accepts (with real cube ids), across many random mats.
function randomMat(rand) {
  const cubes = OSE.roll(rand, { vn: rand() < 0.5 ? 'VVN' : 'VNN' }).filter(c => c.kind !== 'digit');
  const n = 6 + Math.floor(rand() * 7), U = OSE.deal(n, rand);
  OSE.shuffle(cubes, rand);
  const nr = Math.floor(rand() * 3), np = Math.floor(rand() * 4), nres = 2 + Math.floor(rand() * 5);
  const z = {}; cubes.forEach((c, i) => z[c.id] = i < nr ? 'required' : i < nr + np ? 'permitted' : i < nr + np + nres ? 'resources' : 'forbidden');
  return { cubes, U, z };
}
function toIds(syms, cubes, z, mode) {
  const order = ['required', 'permitted'].concat(mode === 'last' ? [] : ['resources']), used = {};
  return syms.map(sym => {
    if (sym === '(' || sym === ')') return sym;
    for (const zn of order) { const c = cubes.find(x => x.s === sym && z[x.id] === zn && !used[x.id]); if (c) { used[c.id] = 1; return { s: sym, id: c.id }; } }
    return { s: sym, id: -1 };
  });
}
let trips = 0, tripsOk = 0, proofs = 0, rand = OSE.rng(2026);
for (let i = 0; i < 300; i++) {
  const { cubes, U, z } = randomMat(rand);
  const st = k => cubes.filter(c => z[c.id] === k).map(c => c.s);
  ['now', 'impossible'].forEach(mode => {
    const goal = Math.floor(rand() * (U.length + 1));
    const r1 = OSE.solve({ universe: U, goal, req: st('required'), perm: st('permitted'), res: st('resources'), mode, timeMs: 3000 });
    if (r1.found) {
      trips++;
      const chk = OSE.checkSolution(toIds(r1.tokens, cubes, z, mode), { universe: U, goal, mode, zone: id => z[id], required: cubes.filter(c => z[c.id] === 'required').map(c => c.id) });
      if (chk.ok) tripsOk++; else if (tripsOk + 3 > trips) console.log('  round trip failed:', OSE.exprText(r1.tokens), chk.reasons);
    } else if (r1.complete) proofs++;
  });
}
ok('solver round trips: every Solution found is accepted by the checker (' + trips + ' found, ' + proofs + ' proved impossible)', trips > 50 && tripsOk === trips, { trips, tripsOk });

// Brute force: an independent enumerator of every fully-bracketed Set-Name from a small pool, read back by the
// parser, must agree with the solver on which Goals are possible (for each goal 0..n).
function brute(U, pool, req) {
  // pool: array of symbols; returns Set of counts reachable by unambiguous Set-Names that use all of req.
  const leaves = ['B', 'R', 'G', 'Y', 'V', 'N'];
  const counts = new Set();
  function multisetOK(list) { const c = {}; list.forEach(x => c[x] = (c[x] || 0) + 1); const p = {}; pool.forEach(x => p[x] = (p[x] || 0) + 1); return Object.keys(c).every(k => c[k] <= (p[k] || 0)); }
  function hasReq(list) { const c = {}; list.forEach(x => c[x] = (c[x] || 0) + 1); const q = {}; req.forEach(x => q[x] = (q[x] || 0) + 1); return Object.keys(q).every(k => (c[k] || 0) >= q[k]); }
  // generate expressions by size, as token arrays (always bracket binary sub-expressions)
  const bySize = [[], []];
  leaves.forEach(l => { if (pool.indexOf(l) >= 0) bySize[1].push([l]); });
  const max = pool.length;
  for (let s = 2; s <= max; s++) {
    const out = [];
    if (pool.indexOf("'") >= 0) bySize[s - 1].forEach(e => { const w = e.length > 1 && e[e.length - 1] !== "'" ? ['('].concat(e, [')', "'"]) : e.concat(["'"]); if (multisetOK(w.filter(x => x !== '(' && x !== ')'))) out.push(w); });
    ['U', 'I', '-'].forEach(op => {
      if (pool.indexOf(op) < 0) return;
      for (let a = 1; a <= s - 2; a++) {
        const b = s - 1 - a;
        bySize[a].forEach(x => bySize[b].forEach(y => {
          const w = ['('].concat(x, [')', op, '('], y, [')']);
          if (multisetOK(w.filter(t => t !== '(' && t !== ')'))) out.push(w);
        }));
      }
    });
    bySize[s] = out;
    if (s >= 2) out.forEach(w => { const syms = w.filter(t => t !== '(' && t !== ')'); if (!hasReq(syms)) return; const ev = OSE.evaluate(w, U); if (ev.ok && !ev.ambiguous) counts.add(ev.count); });
  }
  return counts;
}
let bfCases = 0, bfAgree = 0; rand = OSE.rng(99);
const symsAll = ['B', 'R', 'G', 'Y', 'V', 'N', 'U', 'I', '-', "'"];
for (let i = 0; i < 60; i++) {
  const n = 3 + Math.floor(rand() * 4), U = OSE.deal(n, rand);
  const size = 3 + Math.floor(rand() * 3), pool = [];
  for (let k = 0; k < size; k++) pool.push(symsAll[Math.floor(rand() * symsAll.length)]);
  if (!pool.some(x => ['U', 'I', '-'].indexOf(x) >= 0)) pool.push('U');
  const req = rand() < 0.5 ? [pool[0]] : [];
  const b = brute(U, pool, req);
  for (let g = 0; g <= n; g++) {
    bfCases++;
    const sv = OSE.solve({ universe: U, goal: g, req, perm: pool.filter((x, j) => !(req.length && j === 0)), res: [], mode: 'last', timeMs: 3000 });
    if (sv.complete && sv.found === b.has(g)) bfAgree++;
    else console.log('  brute force disagrees:', { U: U.map(OSE.cardName), pool, req, g, solver: sv.found, brute: b.has(g) });
  }
}
ok('solver agrees with brute force on every small case (' + bfCases + ' cases)', bfAgree === bfCases, { bfCases, bfAgree });

// Speed: the full search on a large mat stays well under a second.
let worst = 0; rand = OSE.rng(5);
for (let i = 0; i < 40; i++) {
  const U = OSE.deal(12, rand), pool = OSE.roll(rand).filter(c => c.kind !== 'digit').map(c => c.s);
  const t0 = Date.now(); const sv = OSE.solve({ universe: U, goal: Math.floor(rand() * 13), req: [], perm: [], res: pool, mode: 'impossible', timeMs: 5000 }); const dt = Date.now() - t0;
  worst = Math.max(worst, dt); if (!sv.complete) console.log('  incomplete search', dt);
}
ok('worst full search with all 15 non-digit cubes and 12 cards < 1500 ms (was ' + worst + ' ms)', worst < 1500);

// ---------------- Scoring (R VI page O2, X-B page O15) ----------------
let eqSrc = fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8').match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
const Eq = eqSrc ? new Function(eqSrc[1] + '\nreturn Eq;')() : null;
let same = 0, combos = 0;
['now', 'impossible'].forEach(kind => [true, false].forEach(wOk => [null, { presented: false }, { presented: true, ok: true }, { presented: true, ok: false }].forEach(tpRes => [null, 2].forEach(tp => {
  if (tp === null && tpRes) return;
  combos++;
  const a = OSE.scoreChallenge(kind, 0, 1, tp, wOk, tpRes), b = Eq ? Eq.scoreChallenge(kind, 0, 1, tp, wOk, tpRes) : null;
  if (JSON.stringify(a) === JSON.stringify(b)) same++;
}))));
ok('On-Sets challenge scoring is identical to the Equations engine in all ' + combos + ' cases', Eq && same === combos);
let p = OSE.scoreChallenge('now', 0, 1, null, true); ok('correct Now!: Challenger 6, Mover 2', p[0] === 6 && p[1] === 2);
p = OSE.scoreChallenge('now', 0, 1, null, false); ok('wrong Now!: Challenger 2, Mover 6', p[0] === 2 && p[1] === 6);
p = OSE.scoreChallenge('impossible', 0, 1, null, true); ok('Impossible! but the Mover writes one: Mover 6, Challenger 2', p[1] === 6 && p[0] === 2);
p = OSE.scoreChallenge('impossible', 0, 1, null, false); ok('correct Impossible!: Challenger 6, Mover 2', p[0] === 6 && p[1] === 2);
p = OSE.scoreChallenge('now', 0, 1, 2, true, { presented: true, ok: true }); ok('3 players, both correct after Now!: Third Party 4 (R VI-C)', p[2] === 4);
p = OSE.scoreChallenge('impossible', 0, 1, 2, false, { presented: false }); ok('3 players, Impossible right, Third Party silent: 4', p[2] === 4);
p = OSE.scoreLast({ 0: true, 1: false }); ok('last cube: correct 4, not correct 2 (R X-C)', p[0] === 4 && p[1] === 2);

// ---------------- Computer player (js/onsets/ai.js) ----------------
ok('four strengths from the creatures\' stars', [1, 2, 3, 4, 5].map(st => OSAI.level({ stars: st })).join() === '1,2,3,4,4');
const strong = OSAI.skill({ stars: 5, name: 'X' }), weak = OSAI.skill({ stars: 1, name: 'Y' });
ok('strong creatures see longer Set-Names than weak ones', strong.maxCubes > weak.maxCubes);
// Goal choice: always possible with the creature's own view, within the Universe size, never negative
rand = OSE.rng(11); let goalsOk = 0, goalsN = 0;
for (let i = 0; i < 40; i++) {
  const cubes = OSE.roll(rand).map(c => ({ id: c.id, s: c.s })), U = OSE.deal(6 + Math.floor(rand() * 7), rand);
  const g = OSAI.chooseGoal(i % 2 ? strong : weak, cubes, U);
  goalsN++;
  if (!g) continue;
  const v = OSE.goalValue(g.goal).value;
  const nonDig = cubes.filter(c => !OSE.isDigit(c.s)).map(c => c.s);
  const sv = OSE.solve({ universe: U, goal: v, req: [], perm: [], res: nonDig, mode: 'impossible', timeMs: 2000 });
  if (v >= 0 && v <= U.length && sv.found) goalsOk++;
}
ok('creatures only set Goals that can be made (' + goalsOk + '/' + goalsN + ')', goalsOk >= goalsN - 1, { goalsOk, goalsN });
// A strong creature calls Now! when it is there, and Impossible! only when it is proved
const st1 = { req: ['B'], perm: ['U'], res: ['G', 'R', 'I'] };
const t1 = OSAI.turn(Object.assign({}, strong, { seeNow: 1 }), st1, [{ id: 1, s: 'G' }, { id: 2, s: 'R' }, { id: 3, s: 'I' }], 5, U8, true, true);
ok('strong creature calls Now! when B ∪ G makes 5', t1.challenge && t1.challenge.kind === 'now', t1);
const st2 = { req: ['B', 'R'], perm: [], res: ['G', 'Y'] };
const t2 = OSAI.turn(Object.assign({}, strong, { seeImp: 1 }), st2, [{ id: 1, s: 'G' }, { id: 2, s: 'Y' }], 3, U8, true, false);
ok('strong creature calls Impossible! when no operation is left', t2.challenge && t2.challenge.kind === 'impossible', t2);
// Moves: a careful creature never hands over an easy Now!
const st3 = { req: ['B'], perm: [], res: ['U', 'G', 'R', 'Y', 'I'] };
let safeCount = 0;
for (let i = 0; i < 20; i++) {
  const mv = OSAI.chooseMove(Object.assign({}, strong, { smart: 1 }), st3, [{ id: 1, s: 'U' }, { id: 2, s: 'G' }, { id: 3, s: 'R' }, { id: 4, s: 'Y' }, { id: 5, s: 'I' }], 5, U8);
  const after = OSAI.applySym(st3, [{ id: 1, s: 'U' }, { id: 2, s: 'G' }, { id: 3, s: 'R' }, { id: 4, s: 'Y' }, { id: 5, s: 'I' }].find(c => c.id === mv.id).s, mv.zone);
  const now = OSE.solve({ universe: U8, goal: 5, req: after.req, perm: after.perm, res: after.res, mode: 'now' });
  if (!now.found) safeCount++;
}
ok('a careful creature\'s moves never leave a Now! (20 tries)', safeCount === 20, safeCount);
// write: finds a Solution and it checks out
const w = OSAI.write(strong, { req: ['B'], perm: ['U', 'G'], res: [] }, 5, U8, 'last');
ok('creature writes B ∪ G', w.found && OSE.evaluate(w.tokens, U8).count === 5, w);

// ---------------- THREE PLAYERS: Third Party scoring, every case of rule VI-C (page O3) ----------------
// VI-A: anyone not correct scores 2. VI-B: a correct Challenger or Mover scores 6. VI-C: a correct Third Party scores 6
// if (a) a correct Solution after Impossible!, (b) a correct Solution after Now! when the Challenger's is not correct,
// (c) no Solution after Now! and the Challenger's is incorrect; otherwise a correct Third Party scores 4.
// V: correct = wrote a correct Solution (had to or chose to), or didn't have to and nobody wrote a correct one.
(function () {
  const cases = [];
  ['now', 'impossible'].forEach(kind => [true, false].forEach(wOk => [null, true, false].forEach(tp => cases.push({ kind, wOk, tp }))));
  let good = 0;
  cases.forEach(c => {
    const tpRes = c.tp === null ? { presented: false } : { presented: true, ok: c.tp };
    const p = OSE.scoreChallenge(c.kind, 0, 1, 2, c.wOk, tpRes);
    const anyOk = c.wOk || c.tp === true;
    const chCorrect = c.kind === 'now' ? c.wOk : !anyOk, mvCorrect = c.kind === 'now' ? !anyOk : c.wOk;
    const tpCorrect = c.tp === null ? !anyOk : c.tp;
    let tpPts = 2;
    if (tpCorrect) {
      if (c.kind === 'impossible' && c.tp === true) tpPts = 6;                     // (a)
      else if (c.kind === 'now' && c.tp === true && !c.wOk) tpPts = 6;             // (b)
      else if (c.kind === 'now' && c.tp === null && !c.wOk) tpPts = 6;             // (c)
      else tpPts = 4;
    }
    const exp = { 0: chCorrect ? 6 : 2, 1: mvCorrect ? 6 : 2, 2: tpPts };
    if (p[0] === exp[0] && p[1] === exp[1] && p[2] === exp[2]) good++; else console.log('  case', JSON.stringify(c), 'got', JSON.stringify(p), 'expected', JSON.stringify(exp));
  });
  ok('3 players: all ' + cases.length + ' challenge cases score as rules V and VI-C say (' + good + ')', good === cases.length);
})();
ok('3 players, last cube: correct 4, not correct 2 for everyone (R VII)', JSON.stringify(OSE.scoreLast({ 0: true, 1: false, 2: true })) === JSON.stringify({ 0: 4, 1: 2, 2: 4 }));

// ---------------- Watching a set form, step by step (the 3D replay; js/three/onsets3d.js draws it) ----------------
(function () {
  const steps = OSE.formSteps(T("R U B'"), U8);
  ok("R ∪ B′ forms as R, then B′, then R ∪ B′", steps && steps.map(s => s.text).join(' | ') === 'R | B′ | R ∪ B′', steps && steps.map(s => s.text));
  ok('each step\'s count is the size of its set', steps && steps.every(s => s.count === OSE.popcount(s.set)));
  ok('the last step is the whole Set-Name', steps && steps[steps.length - 1].count === count("RUB'", U8));
  const s2 = OSE.formSteps(T("(R U B) I G'"), U8);
  ok('(R ∪ B) ∩ G′: R, B, R ∪ B, G′, then all of it', s2 && s2.map(s => s.text).join(' | ') === 'R | B | R ∪ B | G′ | (R ∪ B) ∩ G′', s2 && s2.map(s => s.text));
  const s3 = OSE.formSteps(T("(B U G)'"), U8);
  ok('(B ∪ G)′ ends with the complement of the union', s3 && s3[s3.length - 1].text === '(B ∪ G)′' && s3[s3.length - 1].count === count("(BUG)'", U8), s3 && s3.map(s => s.text));
  ok('a chain with one meaning (B ∪ G ∪ R) is read left to right', (OSE.formSteps(T('B U G U R'), U8) || []).map(s => s.text).join(' | ') === 'B | G | B ∪ G | R | B ∪ G ∪ R');
  const amb = OSE.evaluate(T('B U G - R'), U8);
  ok('a Set-Name whose readings name different sets has no steps (null)', amb.sets.length > 1 && OSE.formSteps(T('B U G - R'), U8) === null, amb.sets);
  ok('not a Set-Name: null', OSE.formSteps(T('B U'), U8) === null);
  const long = OSE.formSteps(T("((B U G) - (R I Y))'"), ALL16);
  ok('long names stay short (at most 7 steps)', long && long.length <= 7 && long[long.length - 1].count === count("((BUG)-(RIY))'", ALL16), long && long.length);
  ok('works with real cube tokens ({s, id})', (OSE.formSteps([{ s: 'R', id: 4 }, { s: 'U', id: 11 }, { s: 'B', id: 3 }], U8) || []).length === 3);
})();

// ---------------- Computer player with three at the table ----------------
(function () {
  const strong1 = Object.assign({}, OSAI.skill({ stars: 5 }), { smart: 1, seeNow: 1, seeImp: 1 });
  const st = { req: ['B'], perm: ['U', 'G'], res: ['R', 'Y'] };
  const tp = OSAI.thirdParty(strong1, st, 5, U8, 'now');
  ok('a strong Third Party presents a correct Solution when there is one', tp.found && OSE.evaluate(tp.tokens, U8).count === 5, tp);
  const none = OSAI.thirdParty(strong1, { req: ['B', 'R'], perm: [], res: [] }, 3, U8, 'last');
  ok('a Third Party with nothing to write stays quiet', !none.found);
  const hit = OSAI.interject([{ p: 2, o: strong1, nowOk: true }], { req: ['B'], perm: ['U'], res: ['G', 'R', 'I'] }, 5, U8);
  ok('a creature that is not next can challenge (Now! when B ∪ G makes 5)', hit && hit.p === 2 && hit.d.kind === 'now', hit);
  const quiet = OSAI.interject([{ p: 2, o: Object.assign({}, strong1, { seeNow: 0, seeImp: 0 }), nowOk: true }], st, 5, U8);
  ok('...and one that sees nothing lets the turn go on', quiet === null);
  ok('the new tasks can run in the worker', OSAI.TASKS.indexOf('thirdParty') >= 0 && OSAI.TASKS.indexOf('interject') >= 0);
})();

// ---------------- The 3D table: zones (js/onsets/view3d.js) and cube faces (js/three/onsets3d.js) ----------------
(function () {
  const vm = require('vm');
  const sb = {}; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'onsets', 'view3d.js'), 'utf8') + '\nthis.OS3D = OS3D;', sb);
  const L = sb.OS3D.LAYOUTS;
  ['wide', 'tall'].forEach(name => {
    const lay = L[name], z = lay.z, keys = Object.keys(z);
    ok(name + ': has the six On-Sets zones', ['universe', 'goal', 'required', 'permitted', 'forbidden', 'resources'].every(k => keys.indexOf(k) >= 0));
    ok(name + ': every zone is on the felt', keys.every(k => { const r = z[k]; return r[0] >= -lay.W / 2 && r[0] + r[2] <= lay.W / 2 && r[1] >= -lay.D / 2 && r[1] + r[3] <= lay.D / 2; }));
    let overlap = false;
    keys.forEach((a, i) => keys.slice(i + 1).forEach(b => { const p = z[a], q = z[b]; if (p[0] < q[0] + q[2] - 1e-6 && q[0] < p[0] + p[2] - 1e-6 && p[1] < q[1] + q[3] - 1e-6 && q[1] < p[1] + p[3] - 1e-6) overlap = true; }));
    ok(name + ': no two zones overlap', !overlap);
    // 12 cards fit the Universe at a readable size (the same grid search as onsets3d.js); 18 cubes fit Resources at full size
    const r = z.universe, aw = r[2] - 0.6, ad = r[3] - 1.15; let best = 0;
    for (let c = 1; c <= 12; c++) best = Math.max(best, Math.min(1.12, aw / (c * 1.3 * 1.12), ad / (Math.ceil(12 / c) * 1.72 * 1.08)));
    ok(name + ': 12 cards fit the Universe at 85% size or more (' + best.toFixed(2) + ')', best >= 0.85);
    const rs = z.resources, cols = Math.floor((rs[2] - 0.5) / 1.25), rows = Math.floor((rs[3] - 1.25) / 1.25);
    ok(name + ': 18 cubes fit in Resources without shrinking', cols * rows >= 18, { cols, rows });
    const g = z.goal; ok(name + ': a Goal row of 3 cubes fits', g[2] - 0.5 >= 3 * 1.06);
  });
  // colour and operation cubes have 4 symbols on 6 faces: two layouts with different doubled symbols, picked half the
  // time each, give every symbol exactly 1 in 4 (interpretation 1). Read straight from the module so they can't drift.
  const src = fs.readFileSync(path.join(root, 'js', 'three', 'onsets3d.js'), 'utf8');
  const faces = name => { const m = src.match(new RegExp("name: '" + name + "', faces: (\\[[^\\]]*\\])")); return m ? JSON.parse(m[1].replace(/'/g, '"').replace(/"""/g, '"\'"')) : null; };
  [['osC1', 'osC2', ['B', 'R', 'G', 'Y']], ['osO1', 'osO2', ['U', 'I', '-', "'"]]].forEach(([a, b, syms]) => {
    const fa = faces(a), fb = faces(b);
    const pr = s => 0.5 * fa.filter(x => x === s).length / 6 + 0.5 * fb.filter(x => x === s).length / 6;
    ok(a + '/' + b + ': each of ' + syms.join(' ') + ' comes up 1 time in 4', fa && fb && fa.length === 6 && fb.length === 6 && syms.every(s => Math.abs(pr(s) - 0.25) < 1e-9), { fa, fb });
  });
  const fd = faces('osD'); ok('digit cubes are 1 1 2 3 4 5 (R Glossary, page OG2)', fd && fd.join('') === '112345', fd);
  const gsrc = fs.readFileSync(path.join(root, 'js', 'onsets', 'game.js'), 'utf8');
  ok('the match picks each of the two layouts half the time', /color'\) return Math\.random\(\) < 0\.5 \? 'osC1' : 'osC2'/.test(gsrc) && /op'\) return Math\.random\(\) < 0\.5 \? 'osO1' : 'osO2'/.test(gsrc));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
