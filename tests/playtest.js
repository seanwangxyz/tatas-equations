// Playtest: the creatures play each other at full speed, using the real engine, the real
// opponent settings (js/config.js) and the REAL computer-player decisions from js/ai.js
// (the same file the game runs in its background worker): AI.chooseGoal, AI.chooseMove,
// AI.decideChallenge (Now!/Impossible!), AI.callsLastImpossible and AI.write.
// Only the turn order, the scoring and the stand-in kids below are written here.
// Run with:  node tests/playtest.js [shakesPerPairing] [stage 0-4] [notaste]
//   notaste = the same creatures with their math tastes switched off (to compare strength and taste rates).
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const N = +process.argv[2] || 40, STAGE = process.argv[3] === undefined ? 0 : +process.argv[3], NOTASTE = process.argv[4] === 'notaste';

// A fake browser, just enough for the scripts to load. Nothing is drawn.
const store = {};
const el = () => new Proxy(function () {}, { get: (t, k) => k === 'classList' ? { add() {}, remove() {}, toggle() {} } : k === 'style' || k === 'dataset' ? {} : el(), apply: () => el() });
const ctx = { console, Math, Date, JSON, setTimeout, clearTimeout, performance,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  document: { querySelector: () => el(), querySelectorAll: () => [], addEventListener() {}, createElement: () => el(), body: el() },
  addEventListener() {}, navigator: {}, innerWidth: 1000, innerHeight: 800 };
ctx.window = ctx; vm.createContext(ctx);
['engine', 'config', 'ai'].forEach(f => vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' }));
const { Eq, OPPONENTS, STAGES, AI } = vm.runInContext('({Eq:Eq, OPPONENTS:OPPONENTS, STAGES:STAGES, AI:AI})', ctx);
const stage = STAGES[STAGE];
const LIKES = {}; OPPONENTS.forEach(o => { LIKES[o.name] = o.likes; if (NOTASTE) o.likes = null; }); // tastes are still measured when switched off

// A stand-in for a beginner: never challenges, moves at random, and only finds short Solutions.
const BEGINNER = { name: 'Beginner kid', beginner: true, maxDigits: 2, timeMs: 100, seeNow: 0, seeImp: 0, smart: 0, goalCubes: 1, goalMax: 12 };
// A kid who has practiced: spots about half the Now! chances, careful half the time.
const PRACTICED = { name: 'Practiced kid', maxDigits: 3, timeMs: 150, seeNow: 0.5, seeImp: 0.3, smart: 0.5, goalCubes: 2, goalMax: 20 };
// The same kid, who has also learned each creature's blind spot (read from the creature's flags):
//   vs a shortView creature (Snoozy): sets Goals and makes moves that need 3+ number cubes
//     (Snoozy then misses Now! and wrongly calls Impossible!, and the kid shows a longer Solution);
//   vs a creature that never calls Impossible! (Penny): makes safe-from-Now! moves that make the Goal
//     impossible, then calls Impossible! herself (seeImp 0.95, with a solver that can prove it).
const TRICK = { name: 'Kid who knows the trick', trick: true, maxDigits: 3, timeMs: 150, seeNow: 0.5, seeImp: 0.3, smart: 0.5, goalCubes: 2, goalMax: 20 };
const tuned = (kid, opp) => !kid.trick ? kid : opp.callsImpossible === false ? Object.assign({}, kid, { seeImp: 0.95, maxDigits: 4, timeMs: 250 }) : kid;

const zone = (G, z) => G.cubes.filter(c => c.zone === z).sort((a, b) => a.order - b.order);
const syms = (G, z) => zone(G, z).map(c => c.s);
const snap = G => ({ req: syms(G, 'required'), perm: syms(G, 'permitted'), res: syms(G, 'resources') });
const solve = (G, o, mode, extra) => { const s = snap(G); return Eq.solve(Object.assign({ goal: G.goal, req: s.req, opt: s.perm, res: mode === 'last' ? [] : s.res, mode: mode === 'last' ? 'free' : mode, fractions: G.fractions, maxDigits: o.maxDigits, timeMs: o.timeMs }, extra || {})); };
const truth = (G, mode) => solve(G, { maxDigits: 6, timeMs: 400 }, mode);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---- Taste counters: how often each creature's Goals, Required/Permitted cubes and Solutions match its taste ----
const TASTE = {};
const tasteOf = name => TASTE[name] || (TASTE[name] = { goals: 0, goalsLiked: 0, rp: 0, rpLiked: 0, sols: 0, solsLiked: 0 });
const usesAll = (tokens, want) => { const t = tokens.slice(); return want.every(s => { const k = t.indexOf(s); if (k < 0) return false; t.splice(k, 1); return true; }); };
function solLiked(o, tokens) { const L = LIKES[o.name]; if (!L) return false; if (L.mix) return new Set(tokens.filter(s => '+-*/^r'.includes(s))).size >= 2; return (L.sol || []).some(w => usesAll(tokens, w)); }
function countSol(o, r) { if (!LIKES[o.name] || !r || !r.found) return; const t = tasteOf(o.name); t.sols++; if (solLiked(o, r.tokens)) t.solsLiked++; }
const write = (G, o, mode) => { const r = AI.write(o, snap(G), G.goal, G.fractions, mode); countSol(o, r); return r; };

function setGoal(G, o, opp) {
  const free = zone(G, 'resources');
  if (!o.trick) { // creatures and the ordinary kids: the game's own Goal chooser
    const g = AI.chooseGoal(o, free.map(c => ({ id: c.id, s: c.s })), G.fractions, stage.maxGoal);
    if (!g) return false;
    g.toks.forEach(t => { G.cubes[t.id].zone = 'goal'; });
    const L = LIKES[o.name];
    if (L) { // liked = looks tasty, or can be made with a favourite operation (the same test the creature uses)
      const t = tasteOf(o.name), rest = zone(G, 'resources').map(c => c.s), p = { goal: g.value, req: [], opt: rest, mode: 'free', fractions: G.fractions, maxDigits: AI.goalDigits(o), timeMs: 30 };
      const yum = AI.goalLooksLiked({ likes: L }, { tokens: g.toks.map(x => x.s), value: g.value }) || AI.reachableWith(L.ops, p);
      t.goals++; if (yum) t.goalsLiked++;
    }
    G.goal = g.value; return true;
  }
  // the trick kid prefers Goals that need 3+ numbers against Snoozy
  let ideas = Eq.goalIdeas(free.map(c => c.s), { fractions: G.fractions }).filter(g => g.value.d === 1 && g.value.n >= 1 && g.value.n <= Math.min(o.goalMax, stage.maxGoal) && g.tokens.length <= o.goalCubes);
  shuffle(ideas);
  if (o.goalCubes > 1) ideas.sort((a, b) => (b.tokens.length - a.tokens.length) + (Math.random() - 0.5) * 2.2);
  let pick = null;
  for (let i = 0; i < ideas.length && i < 30; i++) {
    const g = ideas[i], rest = free.map(c => c.s); g.tokens.forEach(s => rest.splice(rest.indexOf(s), 1));
    const test = d => Eq.solve({ goal: g.value, req: [], opt: rest, mode: 'free', fractions: G.fractions, maxDigits: d, timeMs: 60 }).found;
    if (!test(AI.goalDigits(o))) continue;
    if (!pick) pick = g;
    if (!opp.shortView) break;
    if (!test(opp.maxDigits) && test(4)) { pick = g; break; } // needs 3+ numbers: Snoozy can't see it
  }
  if (!pick) return false;
  const used = {}; pick.tokens.forEach(s => { const c = free.find(x => x.s === s && !used[x.id]); used[c.id] = 1; c.zone = 'goal'; });
  G.goal = pick.value; return true;
}
const chooseMove = (G, o) => AI.chooseMove(o, snap(G), zone(G, 'resources'), G.goal, G.fractions);

// The trick kid's move chooser: look at every (cube, zone), drop moves that hand the opponent a Now!,
// then prefer the move that exploits the opponent's blind spot. Falls back to a normal careful move.
function trickMove(G, o, opp) {
  const s = snap(G), res = zone(G, 'resources');
  if (res.length < 2 || !(opp.shortView || opp.callsImpossible === false)) return chooseMove(G, Object.assign({}, o, { smart: 1 }));
  const bySym = {}; res.forEach(c => { if (!bySym[c.s]) bySym[c.s] = c; });
  const cands = []; Object.keys(bySym).forEach(sym => ['required', 'permitted', 'forbidden'].forEach(z => cands.push({ id: bySym[sym].id, s: sym, zone: z })));
  shuffle(cands);
  const base = { goal: G.goal, fractions: G.fractions, timeMs: 80 }, t0 = Date.now(); let best = null, bestScore = 0;
  for (const cd of cands) {
    if (Date.now() - t0 > 700) break;
    const a = AI.applySym(s, cd.s, cd.zone);
    const nowable = a.res.length >= 2 && a.req.length + a.perm.length > 0 && Eq.solve(Object.assign({ req: a.req, opt: a.perm, res: a.res, mode: 'now', maxDigits: AI.viewDigits(opp) }, base)).found;
    if (nowable) continue;
    let score = 1;
    if (opp.shortView) { // the Goal must really be possible (kid sees 4 numbers) but invisible to Snoozy (2 numbers)
      const longOk = Eq.solve(Object.assign({ req: a.req, opt: a.perm, res: a.res, mode: 'impossible', maxDigits: AI.viewDigits(o) }, base)).found;
      if (!longOk) continue;
      if (!Eq.solve(Object.assign({ req: a.req, opt: a.perm, res: a.res, mode: 'impossible', maxDigits: opp.maxDigits }, base)).found) score = 2;
    } else { // Penny does not check the Goal: make it impossible, then call Impossible!
      const imp = Eq.solve(Object.assign({ req: a.req, opt: a.perm, res: a.res, mode: 'impossible', maxDigits: 6 }, base));
      if (!imp.found && imp.complete) score = 2;
    }
    if (score > bestScore) { best = cd; bestScore = score; if (score === 2) break; }
  }
  return best || chooseMove(G, Object.assign({}, o, { smart: 1 }));
}

function playShake(A0, B0, setter, stats) {
  const P = [tuned(A0, B0), tuned(B0, A0)];
  const A = P[0], B = P[1];
  const G = { cubes: Eq.roll().map(c => ({ id: c.id, color: c.color, s: c.s, zone: 'resources', order: c.id, locked: false })), fractions: stage.fractions };
  G.cubes.forEach(c => { if (!Eq.isDigit(c.s) && stage.ops.indexOf(c.s) < 0) { c.zone = 'forbidden'; c.locked = true; } });
  if (!setGoal(G, P[setter], P[1 - setter])) { stats.noGoal++; return [0, 0]; }
  let last = setter, turn = 1 - setter, order = 100, moves = 0;
  const pts = [0, 0], end = (how, who) => { stats.ends[how] = (stats.ends[how] || 0) + 1; stats.moves += moves; stats.shakes++; if (who !== undefined) stats.by[who][how] = (stats.by[who][how] || 0) + 1; return pts; };
  for (;;) {
    const o = P[turn], s = snap(G);
    if (last !== turn) {
      const nowOk = s.res.length >= 2 && s.req.length + s.perm.length > 0;
      const d = AI.decideChallenge(o, s, G.goal, G.fractions, nowOk, 1, false);
      if (d && d.kind === 'now') { countSol(o, d.plan); pts[turn] = 6; pts[1 - turn] = 2; return end('Now! (correct)', turn); }
      if (d && d.kind === 'impossible') {
        const mover = P[last], w = write(G, mover, 'impossible');
        const really = !truth(G, 'impossible').found;
        if (w.found) { pts[last] = 6; pts[turn] = 2; return end('Impossible! (wrong: Solution shown)', turn); }
        pts[turn] = 6; pts[last] = 2; return end(really ? 'Impossible! (correct)' : 'Impossible! (wrong, but mover missed it)', turn);
      }
    }
    // move
    let mv;
    if (o.beginner) { const res = zone(G, 'resources'), c = res[Math.floor(Math.random() * res.length)]; mv = { id: c.id, zone: res.length === 1 ? 'permitted' : ['required', 'permitted', 'forbidden'][Math.floor(Math.random() * 3)] }; }
    else if (o.trick) mv = trickMove(G, o, P[1 - turn]);
    else mv = chooseMove(G, o);
    const c = G.cubes[mv.id]; c.zone = mv.zone; c.order = ++order; last = turn; moves++;
    stats.zones[turn][mv.zone]++;
    if (LIKES[o.name] && mv.zone !== 'forbidden') { const t = tasteOf(o.name); t.rp++; if ((LIKES[o.name].syms || []).includes(c.s)) t.rpLiked++; }
    if (zone(G, 'resources').length === 0) {
      const opp = 1 - turn, oo = P[opp];
      if (AI.callsLastImpossible(oo, snap(G), G.goal, G.fractions)) {
        const w = write(G, o, 'last');
        if (w.found) { pts[turn] = 6; pts[opp] = 2; return end('Impossible! (wrong: Solution shown)', opp); }
        pts[opp] = 6; pts[turn] = 2; return end(truth(G, 'last').found ? 'Impossible! (wrong, but mover missed it)' : 'Impossible! (correct)', opp);
      }
      [0, 1].forEach(i => { pts[i] = write(G, P[i], 'last').found ? 4 : 2; });
      return end('Last cube (everyone writes)');
    }
    turn = 1 - turn;
  }
}

const results = [];
function pairing(A, B) {
  const stats = { shakes: 0, moves: 0, noGoal: 0, ends: {}, by: [{}, {}], zones: [{ required: 0, permitted: 0, forbidden: 0 }, { required: 0, permitted: 0, forbidden: 0 }] };
  const tot = [0, 0], t0 = Date.now(); let slow = 0;
  for (let k = 0; k < N; k++) { const t1 = Date.now(), p = playShake(A, B, k % 2, stats); slow = Math.max(slow, Date.now() - t1); tot[0] += p[0]; tot[1] += p[1]; }
  const z = i => { const q = stats.zones[i], n = q.required + q.permitted + q.forbidden || 1; return `R ${Math.round(100 * q.required / n)}% / P ${Math.round(100 * q.permitted / n)}% / F ${Math.round(100 * q.forbidden / n)}%`; };
  const a = tot[0] / stats.shakes, b = tot[1] / stats.shakes;
  results.push({ A: A.name, B: B.name, a, b });
  console.log(`\n${A.name} vs ${B.name}  (${stats.shakes} shakes, ${((Date.now() - t0) / 1000).toFixed(1)}s, slowest shake ${slow}ms)`);
  console.log(`  average points per shake: ${A.name} ${a.toFixed(2)}  |  ${B.name} ${b.toFixed(2)}`);
  console.log(`  average moves before it ends: ${(stats.moves / stats.shakes).toFixed(1)}`);
  console.log(`  how shakes end: ` + Object.keys(stats.ends).sort().map(k => `${k}: ${stats.ends[k]}`).join('; '));
  console.log(`  ${A.name} challenges: ${JSON.stringify(stats.by[0])}   moves: ${z(0)}`);
  console.log(`  ${B.name} challenges: ${JSON.stringify(stats.by[1])}   moves: ${z(1)}`);
  return a - b;
}

console.log(`Playtest at stage ${STAGE} (${stage.name}), ${N} shakes per pairing${NOTASTE ? ', math tastes OFF' : ''}`);
for (let i = 0; i < OPPONENTS.length - 1; i++) pairing(OPPONENTS[i], OPPONENTS[i + 1]);
OPPONENTS.forEach(o => pairing(BEGINNER, o));
[0, 1, 2, 4].forEach(i => pairing(PRACTICED, OPPONENTS[i]));
[0, 1].forEach(i => pairing(TRICK, OPPONENTS[i]));

// ---- Summary (stage and shakes are in the first line) ----
const R = (A, B) => results.find(r => r.A === A && r.B === B);
const line = (A, B) => { const r = R(A, B); return `${A} ${r.a.toFixed(2)} - ${r.b.toFixed(2)} ${B}  (margin ${(r.a - r.b >= 0 ? '+' : '') + (r.a - r.b).toFixed(2)})`; };
console.log(`\n===== SUMMARY: stage ${STAGE}, ${N} shakes per pairing, average points per shake${NOTASTE ? ', math tastes OFF' : ''} =====`);
console.log('Ladder (each should beat the one below it, i.e. the second name should win):');
for (let i = 0; i < OPPONENTS.length - 1; i++) console.log('  ' + line(OPPONENTS[i].name, OPPONENTS[i + 1].name));
console.log('Kids:');
console.log('  ' + line('Beginner kid', OPPONENTS[0].name));
console.log('  ' + line('Beginner kid', OPPONENTS[1].name));
[0, 1].forEach(i => {
  const p = R(PRACTICED.name, OPPONENTS[i].name), t = R(TRICK.name, OPPONENTS[i].name);
  console.log('  ' + line(PRACTICED.name, OPPONENTS[i].name));
  console.log('  ' + line(TRICK.name, OPPONENTS[i].name) + `   <- trick kid margin minus practiced kid margin: ${((t.a - t.b) - (p.a - p.b) >= 0 ? '+' : '') + ((t.a - t.b) - (p.a - p.b)).toFixed(2)}`);
});
console.log('  ' + line(PRACTICED.name, OPPONENTS[2].name));
console.log('  ' + line(PRACTICED.name, OPPONENTS[4].name));
const pc = (a, b) => b ? Math.round(100 * a / b) + '% of ' + b : '-';
console.log('Math tastes (share of Goals set / cubes put in Required+Permitted / Solutions found that match the taste):');
OPPONENTS.forEach(o => { const t = TASTE[o.name] || tasteOf(o.name); console.log(`  ${(o.name + ':').padEnd(8)} Goals ${pc(t.goalsLiked, t.goals).padEnd(10)}  cubes ${pc(t.rpLiked, t.rp).padEnd(10)}  Solutions ${pc(t.solsLiked, t.sols)}`); });
