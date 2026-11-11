// Playtest: the creatures play each other at full speed, using the real engine, the real
// opponent settings (js/config.js) and the real move chooser (aiChooseMove in js/game.js).
// The turn logic below mirrors aiTurn/aiWrite/lastCubePlayed in js/game.js.
// Run with:  node tests/playtest.js [shakesPerPairing] [stage 0-4]
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const N = +process.argv[2] || 40, STAGE = process.argv[3] === undefined ? 0 : +process.argv[3];

// A fake browser, just enough for the scripts to load. Nothing is drawn.
const store = {};
const el = () => new Proxy(function () {}, { get: (t, k) => k === 'classList' ? { add() {}, remove() {}, toggle() {} } : k === 'style' || k === 'dataset' ? {} : el(), apply: () => el() });
const ctx = { console, Math, Date, JSON, setTimeout, clearTimeout, performance,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  document: { querySelector: () => el(), querySelectorAll: () => [], addEventListener() {}, createElement: () => el(), body: el() },
  addEventListener() {}, navigator: {}, innerWidth: 1000, innerHeight: 800 };
ctx.window = ctx; vm.createContext(ctx);
['engine', 'config', 'game'].forEach(f => vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' }));
const { Eq, OPPONENTS, STAGES } = vm.runInContext('({Eq:Eq, OPPONENTS:OPPONENTS, STAGES:STAGES})', ctx);
const stage = STAGES[STAGE];

// A stand-in for a beginner: never challenges, moves at random, and only finds short Solutions.
const BEGINNER = { name: 'Beginner kid', beginner: true, maxDigits: 2, timeMs: 100, seeNow: 0, seeImp: 0, smart: 0, goalCubes: 1, goalMax: 12 };
// A kid who has practiced: spots about half the Now! chances, careful half the time.
const PRACTICED = { name: 'Practiced kid', maxDigits: 3, timeMs: 150, seeNow: 0.5, seeImp: 0.3, smart: 0.5, goalCubes: 2, goalMax: 20 };

const zone = (G, z) => G.cubes.filter(c => c.zone === z).sort((a, b) => a.order - b.order);
const syms = (G, z) => zone(G, z).map(c => c.s);
const snap = G => ({ req: syms(G, 'required'), perm: syms(G, 'permitted'), res: syms(G, 'resources') });
const solve = (G, o, mode, extra) => { if (extra && o.fumble && Math.random() < o.fumble) return { found: false }; const s = snap(G); return Eq.solve(Object.assign({ goal: G.goal, req: s.req, opt: s.perm, res: mode === 'last' ? [] : s.res, mode: mode === 'last' ? 'free' : mode, fractions: G.fractions, maxDigits: o.maxDigits, timeMs: o.timeMs }, extra || {})); };
const truth = (G, mode) => { const s = snap(G); return Eq.solve({ goal: G.goal, req: s.req, opt: s.perm, res: mode === 'last' ? [] : s.res, mode: mode === 'last' ? 'free' : mode, fractions: G.fractions, maxDigits: 6, timeMs: 400 }); };
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function setGoal(G, o) { // mirrors aiSetGoal
  const free = zone(G, 'resources');
  let ideas = Eq.goalIdeas(free.map(c => c.s), { fractions: G.fractions }).filter(g => g.value.d === 1 && g.value.n >= 1 && g.value.n <= Math.min(o.goalMax, stage.maxGoal) && g.tokens.length <= o.goalCubes);
  shuffle(ideas);
  if (o.goalCubes > 1) ideas.sort((a, b) => (b.tokens.length - a.tokens.length) + (Math.random() - 0.5) * 2.2);
  for (let i = 0; i < ideas.length && i < 30; i++) {
    const g = ideas[i], rest = free.map(c => c.s); g.tokens.forEach(s => rest.splice(rest.indexOf(s), 1));
    if (Eq.solve({ goal: g.value, req: [], opt: rest, mode: 'free', fractions: G.fractions, maxDigits: 3, timeMs: 60 }).found) {
      const used = {}; g.tokens.forEach(s => { const c = free.find(x => x.s === s && !used[x.id]); used[c.id] = 1; c.zone = 'goal'; });
      G.goal = g.value; G.goalCubes = g.tokens.length; return true;
    }
  }
  return false;
}

function playShake(A, B, setter, stats) {
  const P = [A, B];
  const G = { cubes: Eq.roll().map(c => ({ id: c.id, color: c.color, s: c.s, zone: 'resources', order: c.id, locked: false })), fractions: stage.fractions, players: [{ ai: A }, { ai: B }] };
  G.cubes.forEach(c => { if (!Eq.isDigit(c.s) && stage.ops.indexOf(c.s) < 0) { c.zone = 'forbidden'; c.locked = true; } });
  ctx.G = G; vm.runInContext('G = window.G', ctx);
  if (!setGoal(G, P[setter])) { stats.noGoal++; return [0, 0]; }
  let last = setter, turn = 1 - setter, order = 100, moves = 0;
  const pts = [0, 0], end = (how, who) => { stats.ends[how] = (stats.ends[how] || 0) + 1; stats.moves += moves; stats.shakes++; if (who !== undefined) stats.by[who][how] = (stats.by[who][how] || 0) + 1; return pts; };
  for (;;) {
    const o = P[turn], s = snap(G);
    if (last !== turn) {
      if (s.res.length >= 2 && s.req.length + s.perm.length > 0 && Math.random() < o.seeNow) {
        const r = solve(G, o, 'now');
        if (r.found) { pts[turn] = 6; pts[1 - turn] = 2; return end('Now! (correct)', turn); }
      }
      if (Math.random() < o.seeImp) {
        const r2 = solve(G, o, 'impossible');
        if (!r2.found && (r2.complete || Math.random() < 0.3)) {
          const mover = P[last], w = solve(G, mover, 'impossible', { maxDigits: Math.min(6, mover.maxDigits + 1), timeMs: mover.timeMs * 2 });
          const really = !truth(G, 'impossible').found;
          if (w.found) { pts[last] = 6; pts[turn] = 2; return end('Impossible! (wrong: Solution shown)', turn); }
          pts[turn] = 6; pts[last] = 2; return end(really ? 'Impossible! (correct)' : 'Impossible! (wrong, but mover missed it)', turn);
        }
      }
    }
    // move
    let mv;
    if (o.beginner) { const res = zone(G, 'resources'), c = res[Math.floor(Math.random() * res.length)]; mv = { id: c.id, zone: res.length === 1 ? 'permitted' : ['required', 'permitted', 'forbidden'][Math.floor(Math.random() * 3)] }; }
    else mv = ctx.aiChooseMove(o);
    const c = G.cubes[mv.id]; c.zone = mv.zone; c.order = ++order; last = turn; moves++;
    stats.zones[turn][mv.zone]++;
    if (zone(G, 'resources').length === 0) {
      const opp = 1 - turn, oo = P[opp];
      if (!solve(G, oo, 'last').found && Math.random() < oo.seeImp) {
        const w = solve(G, o, 'last', { maxDigits: Math.min(6, o.maxDigits + 1), timeMs: o.timeMs * 2 });
        if (w.found) { pts[turn] = 6; pts[opp] = 2; return end('Impossible! (wrong: Solution shown)', opp); }
        pts[opp] = 6; pts[turn] = 2; return end(truth(G, 'last').found ? 'Impossible! (wrong, but mover missed it)' : 'Impossible! (correct)', opp);
      }
      [0, 1].forEach(i => { pts[i] = solve(G, P[i], 'last', { maxDigits: Math.min(6, P[i].maxDigits + 1), timeMs: P[i].timeMs * 2 }).found ? 4 : 2; });
      return end('Last cube (everyone writes)');
    }
    turn = 1 - turn;
  }
}

function pairing(A, B) {
  const stats = { shakes: 0, moves: 0, noGoal: 0, ends: {}, by: [{}, {}], zones: [{ required: 0, permitted: 0, forbidden: 0 }, { required: 0, permitted: 0, forbidden: 0 }] };
  const tot = [0, 0], t0 = Date.now(); let slow = 0;
  for (let k = 0; k < N; k++) { const t1 = Date.now(), p = playShake(A, B, k % 2, stats); slow = Math.max(slow, Date.now() - t1); tot[0] += p[0]; tot[1] += p[1]; }
  const z = i => { const q = stats.zones[i], n = q.required + q.permitted + q.forbidden || 1; return `R ${Math.round(100 * q.required / n)}% / P ${Math.round(100 * q.permitted / n)}% / F ${Math.round(100 * q.forbidden / n)}%`; };
  console.log(`\n${A.name} vs ${B.name}  (${stats.shakes} shakes, ${((Date.now() - t0) / 1000).toFixed(1)}s, slowest shake ${slow}ms)`);
  console.log(`  average points per shake: ${A.name} ${(tot[0] / stats.shakes).toFixed(2)}  |  ${B.name} ${(tot[1] / stats.shakes).toFixed(2)}`);
  console.log(`  average moves before it ends: ${(stats.moves / stats.shakes).toFixed(1)}`);
  console.log(`  how shakes end: ` + Object.keys(stats.ends).sort().map(k => `${k}: ${stats.ends[k]}`).join('; '));
  console.log(`  ${A.name} challenges: ${JSON.stringify(stats.by[0])}   moves: ${z(0)}`);
  console.log(`  ${B.name} challenges: ${JSON.stringify(stats.by[1])}   moves: ${z(1)}`);
  return tot[0] / stats.shakes - tot[1] / stats.shakes;
}

console.log(`Playtest at stage ${STAGE} (${stage.name}), ${N} shakes per pairing`);
for (let i = 0; i < OPPONENTS.length - 1; i++) pairing(OPPONENTS[i], OPPONENTS[i + 1]);
OPPONENTS.forEach(o => pairing(BEGINNER, o));
[0, 2, 4].forEach(i => pairing(PRACTICED, OPPONENTS[i]));
