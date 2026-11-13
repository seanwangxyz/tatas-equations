'use strict';
// ======================= PARENT PAGE ("For Tata") =======================
// A page for the grown-up: which operations and cards he's solid on, where he gets stuck, and how much
// he has played. Reached from Settings -> Parent corner and from My Stats ("For Tata"), behind a
// "press and hold for 2 seconds" gate (no password).
//
// Three parts:
//   core   (pure)  record(P, event, facts, day) adds one event to the saved numbers; model(P, ctx) turns the
//                  saved numbers plus the rest of the save into what the page shows; level(), trend(),
//                  suggestions(), summaryText(), csv(). Needs only Eq (js/engine.js), so
//                  tests/parent.test.js runs it under plain node.
//   notes  (page)  Parent.note(event, data): the game calls it at the meaningful moments (hooks listed in
//                  docs/handoff/parent.md). Each call turns live game objects into small facts and records them.
//                  Active play time is counted here too, from taps and keys (the clock stops 60 s after the
//                  last input). Nothing leaves the device: it all lives in the save (S.parent).
//   page   (page)  Parent.open(from) draws the #parent screen.
//
// Save shape (S.parent), versioned and capped (about 24 KB at most; old days are dropped first):
//   { v: 1, since: 'YYYY-MM-DD' (first day this page counted),
//     days: { 'YYYY-MM-DD': Day } (the last 60 days only),
//     L: Totals (everything since `since`),
//     ex: { reasonCode: [day, solution text, Goal text, what it made] } (one real example per reason, the latest),
//     unl: { key: day or '' } (when something unlocked; '' = it was already unlocked before this page) }
//   Day / Totals share these fields (all optional, created when first used):
//     a: active seconds, n: play sessions, so: [Solutions tried, right], k: { skillKey: [tried, right] },
//     g: Goals set, sh: shakes, h: shakes where a hint was used, m: [matches, won, tied],
//     cn: [Now! calls, right], ci: [Impossible! calls, right], dr: [drills tried, right],
//     mc: [moments checked, Now! chances, Impossible! chances] (the game could PROVE these; see analyseLog)
//   Totals only: rs: { reasonCode: n } (wrong Solutions by reason), len: { cubes: n } (right Solutions by size),
//     tm: [right Solutions by thinking time: <20 s, <45 s, <90 s, <3 min, longer], fx: { par, neg, two, frac }
//     (right Solutions with parentheses / a step below zero / a two-digit number / a fraction), hs: [tried, right]
//     with a hint in that shake, md: { mode: [tried, right] }, dk: { drillId: [tried, right] }, gl: { cubes: n }
//     (Goals by size), g2: Goals with a two-digit number, gf: fraction Goals, gop: { op: n }, opp: { idx: [played, won] },
//     mm: { matchMode: n }, mlen: [matches timed, shakes, minutes], shw: shakes won (4+ points),
//     chm: [times a creature/player challenged his move, times he came out ahead], mcn: matches checked.
//   Skill keys: '+', '-', '*', '/', '^', 'r' (operations), 'fr' (a step made a fraction), 'v:<card id>' (that
//     variation card was in play), 'b:<symbol>' (a gold Power-die operation), 'big' (the purple Big-number die).
var Parent = (function () {
  var V = 1, DAYS_KEPT = 60, MAX_BYTES = 24000, IDLE_S = 60, SESSION_GAP_S = 600, EX_LEN = 60;
  var SOLID_RATE = 0.75, SOLID_MIN = 8, RECENT_DAYS = 30, TREND_DAYS = 14, TREND_MIN = 5, TREND_STEP = 0.10;
  var OPS = ['+', '-', '*', '/', '^', 'r'];
  var SHOWS = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', 'r': '√', 'm': 'rem' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---------- days ----------
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function keyOf(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function parseKey(k) { var a = String(k).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
  function daysBetween(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 864e5); } // b - a
  function niceDay(k) { if (!k) return ''; var d = parseKey(k); return MONTHS[d.getMonth()] + ' ' + d.getDate(); }

  // ---------- small counters ----------
  function inc(o, k, n) { o[k] = (o[k] || 0) + (n === undefined ? 1 : n); }
  function tr(o, k, ok) { var a = o[k] || (o[k] = [0, 0]); a[0]++; if (ok) a[1]++; return a; }
  function obj(o, k) { return o[k] || (o[k] = {}); }
  function arr(o, k, n) { var a = o[k]; if (!Array.isArray(a)) { a = o[k] = []; } while (a.length < n) a.push(0); return a; }
  function A(x, i) { return Array.isArray(x) ? (x[i] || 0) : 0; }

  function blank(day) { return { v: V, since: day, days: {}, L: {}, ex: {}, unl: {} }; }
  // Make any stored value safe to use (an older or damaged save, or one from a newer game).
  function normalize(P, day) {
    if (!P || typeof P !== 'object' || Array.isArray(P)) return blank(day);
    if (typeof P.since !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(P.since)) P.since = day;
    ['days', 'L', 'ex', 'unl'].forEach(function (k) { if (!P[k] || typeof P[k] !== 'object' || Array.isArray(P[k])) P[k] = {}; });
    if (!P.v) P.v = V;
    return P;
  }
  function bucket(P, day) { return P.days[day] || (P.days[day] = {}); }
  function bytes(P) { try { return JSON.stringify(P).length; } catch (e) { return 0; } }
  // Keep the last 60 days, then drop the oldest days until it fits in MAX_BYTES.
  function cap(P, day) {
    var oldest = addDays(day, -(DAYS_KEPT - 1));
    Object.keys(P.days).forEach(function (k) { if (k < oldest) delete P.days[k]; });
    var keys = Object.keys(P.days).sort();
    while (bytes(P) > MAX_BYTES && keys.length > 1) delete P.days[keys.shift()];
    return P;
  }

  // Slips about the RULES, not the maths: they don't count against an operation (skill keys), only against the
  // Solution total and "Where he gets stuck". (A left-out Required cube says nothing about how well he divides.)
  var RULE_SLIPS = { required: 1, forbidden: 1, twice: 1, few: 1, now1: 1, matonly: 1, goalcube: 1, none: 1, card: 1 };
  function rulesOnly(codes) { return !!(codes && codes.length) && codes.every(function (c) { return RULE_SLIPS[c]; }); }
  // ---------- recording one event (pure) ----------
  // f = plain facts (see the page-side turners below for how each is made).
  function record(P, ev, f, day) {
    var D = bucket(P, day), L = P.L, both = [D, L];
    f = f || {};
    if (ev === 'solution') {
      var skillKeys = !f.ok && rulesOnly(f.codes) ? [] : (f.keys || []);
      both.forEach(function (o) { tr(o, 'so', f.ok); if (skillKeys.length) { var k = obj(o, 'k'); skillKeys.forEach(function (key) { tr(k, key, f.ok); }); } });
      tr(obj(L, 'md'), f.mode || 'other', f.ok);
      if (f.hint) tr(L, 'hs', f.ok);
      if (f.drill) { tr(D, 'dr', f.ok); tr(L, 'dr', f.ok); tr(obj(L, 'dk'), f.drill, f.ok); }
      if (f.ok) {
        inc(obj(L, 'len'), String(f.cubes || 0));
        var ms = f.ms || 0, b = ms < 20000 ? 0 : ms < 45000 ? 1 : ms < 90000 ? 2 : ms < 180000 ? 3 : 4;
        arr(L, 'tm', 5)[b]++;
        var fx = obj(L, 'fx'); ['par', 'neg', 'two', 'frac'].forEach(function (x) { if (f[x]) inc(fx, x); });
      } else {
        var rs = obj(L, 'rs');
        (f.codes && f.codes.length ? f.codes : ['other']).forEach(function (c) {
          inc(rs, c);
          if (f.ex) P.ex[c] = [day, String(f.ex.s || '').slice(0, EX_LEN), String(f.ex.g || '').slice(0, 12), String(f.ex.v || '').slice(0, 12)];
        });
      }
    } else if (ev === 'goal') {
      both.forEach(function (o) { inc(o, 'g'); });
      inc(obj(L, 'gl'), String(f.cubes || 0));
      if (f.two) inc(L, 'g2');
      if (f.frac) inc(L, 'gf');
      var gop = obj(L, 'gop'); (f.ops || []).forEach(function (o) { inc(gop, o); });
    } else if (ev === 'challenge') {
      if (f.role === 'caller') both.forEach(function (o) { tr(o, f.kind === 'now' ? 'cn' : 'ci', f.won); });
      else if (f.role === 'mover') tr(L, 'chm', f.won);
    } else if (ev === 'shake') {
      both.forEach(function (o) { inc(o, 'sh'); if (f.hint) inc(o, 'h'); });
      if (f.won) inc(L, 'shw');
    } else if (ev === 'match') {
      both.forEach(function (o) { var m = arr(o, 'm', 3); m[0]++; if (f.result === 'w') m[1]++; if (f.result === 't') m[2]++; });
      inc(obj(L, 'mm'), f.mode || 'other');
      if (typeof f.opp === 'number' && f.opp >= 0) { var po = obj(L, 'opp'), pr = po[f.opp] || (po[f.opp] = [0, 0]); pr[0]++; if (f.result === 'w') pr[1]++; }
      if (f.shakes) { var ml = arr(L, 'mlen', 3); ml[0]++; ml[1] += f.shakes; ml[2] += Math.max(0, Math.min(120, Math.round(f.min || 0))); }
    } else if (ev === 'drill') {
      both.forEach(function (o) { tr(o, 'dr', f.ok); });
      tr(obj(L, 'dk'), f.id || 'other', f.ok);
    } else if (ev === 'missed') {
      both.forEach(function (o) { var mc = arr(o, 'mc', 3); mc[0] += f.moments || 0; mc[1] += f.now || 0; mc[2] += f.imp || 0; });
      inc(L, 'mcn');
    } else if (ev === 'active') {
      var s = Math.max(0, Math.round(f.sec || 0));
      both.forEach(function (o) { inc(o, 'a', s); if (f.session) inc(o, 'n'); });
    }
    return cap(P, day);
  }

  // ---------- reading the numbers (pure) ----------
  function rate(t, r) { return t ? r / t : null; }
  function pct(t, r) { return t ? Math.round(100 * r / t) : null; }
  // Sum a [tried, right]-style field over the days from `from` to `to` (inclusive).
  function sumDays(P, from, to, get) {
    var t = 0, r = 0;
    Object.keys(P.days).forEach(function (k) { if (k >= from && k <= to) { var x = get(P.days[k]); if (x) { t += x[0] || 0; r += x[1] || 0; } } });
    return [t, r];
  }
  // The level rule (stated on the page):
  //   Not tried yet: no tries.  New: 1-7 tries.
  //   Solid: 8+ tries and at least 75% right (counting only the last 30 days when there are 8+ tries in them).
  //   Getting there: 8+ tries and under 75% right.
  function level(t, r, rt, rr) {
    if (!t) return 'none';
    if (t < SOLID_MIN) return 'new';
    var x = (rt || 0) >= SOLID_MIN ? rr / rt : r / t;
    return x >= SOLID_RATE ? 'solid' : 'getting';
  }
  var LEVEL_WORDS = { solid: 'Solid', getting: 'Getting there', 'new': 'New', none: 'Not tried yet' };
  // Trend: share right in the last 14 days against the 14 days before (5+ tries in each), 10 points or more = a change.
  function trend(P, key, day, get) {
    get = get || function (d) { return d.k && d.k[key]; };
    var a = sumDays(P, addDays(day, -(TREND_DAYS - 1)), day, get), b = sumDays(P, addDays(day, -(2 * TREND_DAYS - 1)), addDays(day, -TREND_DAYS), get);
    if (a[0] < TREND_MIN || b[0] < TREND_MIN) return null;
    var d = a[1] / a[0] - b[1] / b[0];
    return d >= TREND_STEP ? 'up' : d <= -TREND_STEP ? 'down' : 'flat';
  }
  function median(list) { if (!list.length) return null; var s = list.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  // Plain words for each reason code (why a Solution did not count).
  var REASONS = {
    value: 'The answer came out to a different number than the Goal',
    required: 'Left out a Required cube (every Required cube must be used)',
    forbidden: 'Used a Forbidden cube',
    twice: 'Used the same cube twice',
    few: 'Used only one cube (a Solution needs two or more)',
    now1: 'After calling Now!, used more than one Resources cube',
    matonly: 'Used a Resources cube where only mat cubes count',
    goalcube: 'Tried to use a cube that is part of the Goal',
    concat: 'Put two number cubes side by side (in a Solution each cube is its own one-digit number)',
    divzero: 'Divided by zero',
    frac: 'A division that doesn\'t come out even while fractions were off',
    pow: 'A power the rules don\'t allow (like 0^0, or a fraction as the power)',
    root: 'A root that isn\'t a whole number',
    unfinished: 'Unfinished: it ends with a sign or an open parenthesis',
    paren: 'Parentheses that don\'t match up',
    sign: 'Used + or − as a sign in front of a number',
    syntax: 'Two things side by side with no sign between them (or another tapping slip)',
    big: 'A number too big for the game to check',
    card: 'A variation-card rule (like Three Operations or 0 is Wild)',
    none: 'Didn\'t write a Solution ("I can\'t find one")',
    other: 'Something else'
  };
  // The engine's own codes (Eq.evaluate) -> our reason codes.
  var EVMAP = { concat: 'concat', divzero: 'divzero', fraction: 'frac', frac2: 'frac', bigfrac: 'frac', powwhole: 'pow', zerozero: 'pow',
    rootindex: 'root', rootwhole: 'root', rootnotwhole: 'root', incomplete: 'unfinished', opstart: 'unfinished', paren: 'paren', emptyparen: 'paren',
    sign: 'sign', missingop: 'syntax', syntax: 'syntax', bignext: 'syntax', flipnext: 'card', empty: 'none', big: 'big' };
  // checkSolution's sentences -> reason codes (the engine words them for the kid; these patterns follow js/engine.js).
  var RX = [[/at least two cubes/i, 'few'], [/same cube was used twice/i, 'twice'], [/Forbidden cube/i, 'forbidden'], [/leaves out Required/i, 'required'],
    [/only ONE cube from Resources/i, 'now1'], [/Only cubes on the mat/i, 'matonly'], [/Cubes in the Goal stay/i, 'goalcube'],
    [/Three-operation|! signs|colour|Multiple of|wild 0|base \d/i, 'card'], [/^Your Solution equals/i, 'value']];
  function classify(evCode, reasons) {
    var out = [];
    function add(c) { if (c && out.indexOf(c) < 0) out.push(c); }
    if (evCode) add(EVMAP[evCode] || 'card');
    (reasons || []).forEach(function (r) { for (var i = 0; i < RX.length; i++) if (RX[i][0].test(r)) { add(RX[i][1]); return; } });
    if (!out.length) add('other');
    return out;
  }

  var OP_LABEL = { '+': 'Adding (+)', '-': 'Taking away (−)', '*': 'Times (×)', '/': 'Dividing (÷)', '^': 'Powers (^)', 'r': 'Roots (√)', fr: 'Fractions' };
  // ctx: everything else the page needs from the save (built by ctxFromSave() on the page; synthetic in tests):
  //   today, name, stats, opsUsed, history [{t, ok, ms, c}], best, stageOps, ladder {stage, stars}, stages [{name, icon, need}], ladderOff,
  //   badges {got, total}, lvl, xp, opponents [{name, beaten, open}], cards [{id, name, icon}] (unlocked), cardsTotal,
  //   dice [{id, name, unlocked}], bonusNames {sym: name}, pennants [{league, n, place, date}], drills [{id, name, lvl, done}], tipsSeen
  function model(P, C) {
    var day = C.today, L = P.L, since = P.since, h = C.history || [];
    var histDay = {};
    h.forEach(function (x) { var k = keyOf(new Date(x.t)); var o = histDay[k] || (histDay[k] = [0, 0]); o[0]++; if (x.ok) o[1]++; });
    function dayRow(k) {
      var tracked = k >= since, d = P.days[k] || {}, so = tracked ? (d.so || [0, 0]) : (histDay[k] || [0, 0]);
      var mins = tracked ? Math.round((d.a || 0) / 60) : null, m = tracked ? A(d.m, 0) : null;
      return { d: k, tracked: tracked, min: mins, tried: so[0] || 0, right: so[1] || 0, matches: m, won: tracked ? A(d.m, 1) : null, shakes: tracked ? (d.sh || 0) : null,
        played: !!((d.a || 0) >= 30 || so[0] || A(d.m, 0) || (d.sh || 0) || A(d.dr, 0)) };
    }
    function windowSum(n) {
      var rows = []; for (var i = n - 1; i >= 0; i--) rows.push(dayRow(addDays(day, -i)));
      var s = { days: n, played: 0, min: 0, matches: 0, won: 0, shakes: 0, tried: 0, right: 0, partial: rows[0].d < since, rows: rows };
      rows.forEach(function (r) { if (r.played) s.played++; s.min += r.min || 0; s.matches += r.matches || 0; s.won += r.won || 0; s.shakes += r.shakes || 0; s.tried += r.tried; s.right += r.right; });
      return s;
    }
    var week = windowSum(7), month = windowSum(28);
    var stageOps = C.stageOps || OPS.slice(0, 4), recentFrom = addDays(day, -(RECENT_DAYS - 1));
    function skillRow(key, label, kind, old) {
      var x = (L.k && L.k[key]) || [0, 0], rc = sumDays(P, recentFrom, day, function (d) { return d.k && d.k[key]; });
      return { key: key, label: label, kind: kind, t: x[0], r: x[1], rate: rate(x[0], x[1]), recent: rc, trend: trend(P, key, day),
        level: level(x[0], x[1], rc[0], rc[1]), old: Math.max(0, (old || 0) - x[1]), open: kind !== 'op' || stageOps.indexOf(key) >= 0 };
    }
    // (old = right Solutions the game counted that this page did not: opsUsed and fractionSolutions include the page's own)
    var skills = OPS.map(function (o) { return skillRow(o, OP_LABEL[o], 'op', (C.opsUsed || {})[o]); });
    skills.push(skillRow('fr', OP_LABEL.fr, 'idea', (C.stats || {}).fractionSolutions));
    var cardRows = (C.cards || []).map(function (c) { var r = skillRow('v:' + c.id, c.icon + ' ' + c.name, 'card', 0); r.since = P.unl['card:' + c.id]; return r; });
    var bonusRows = [];
    Object.keys(L.k || {}).forEach(function (k) {
      if (k === 'big') bonusRows.push(skillRow('big', '🟣 Big-number die', 'bonus', (C.opsUsed || {}).big));
      else if (k.indexOf('b:') === 0) { var sym = k.slice(2); bonusRows.push(skillRow(k, '🟡 ' + ((C.bonusNames || {})[sym] || sym), 'bonus', (C.opsUsed || {})[sym])); }
    });
    // habits
    var okH = h.filter(function (x) { return x.ok; }), so = L.so || [0, 0], fx = L.fx || {};
    var habits = {
      medianCubes: median(okH.map(function (x) { return x.c || 0; }).filter(Boolean)), longest: (C.best && C.best.mostCubes) || 0,
      medianMs: median(okH.map(function (x) { return x.ms || 0; }).filter(Boolean)),
      right: so[1], par: fx.par || 0, neg: fx.neg || 0, two: fx.two || 0, frac: fx.frac || 0,
      goals: L.g || 0, goal2: L.g2 || 0, goalFrac: L.gf || 0,
      goalAvgCubes: (function () { var n = 0, s = 0; Object.keys(L.gl || {}).forEach(function (k) { n += L.gl[k]; s += (+k) * L.gl[k]; }); return n ? s / n : null; })(),
      allTime: { tried: (C.stats || {}).attempts || 0, right: (C.stats || {}).correct || 0 }
    };
    // where he gets stuck
    var wrong = so[0] - so[1];
    var stuck = Object.keys(L.rs || {}).map(function (c) { return { code: c, n: L.rs[c], words: REASONS[c] || REASONS.other, ex: P.ex[c] || null }; })
      .sort(function (a, b) { return b.n - a.n; });
    var st = C.stats || {};
    var ch = { now: L.cn || [0, 0], imp: L.ci || [0, 0], moved: L.chm || [0, 0], mc: L.mc || [0, 0, 0], checked: L.mcn || 0,
      all: { calls: st.challenges || 0, won: st.challengeWins || 0, nowWins: st.nowWins || 0, impWins: st.impWins || 0 } };
    var hints = { shakes: L.sh || 0, withHint: L.h || 0, hs: L.hs || [0, 0] };
    var drills = (C.drills || []).map(function (d) { var x = (L.dk || {})[d.id] || [0, 0]; return { id: d.id, name: d.name, lvl: d.lvl, done: d.done, t: x[0], r: x[1] }; });
    var m = { day: day, since: since, sinceToday: since === day, name: C.name || 'him', week: week, month: month, skills: skills, cards: cardRows, bonus: bonusRows,
      habits: habits, stuck: stuck, wrong: wrong, tracked: { tried: so[0], right: so[1] }, ch: ch, hints: hints, drills: drills,
      matches: { all: L.m || [0, 0, 0], opp: L.opp || {}, modes: L.mm || {}, len: L.mlen || [0, 0, 0], shakesWon: L.shw || 0 },
      goals: { n: L.g || 0, ops: L.gop || {} }, active: { sec: L.a || 0, sessions: L.n || 0 }, C: C, P: P };
    m.suggest = suggestions(m);
    return m;
  }

  // ---------- "Try this next" (pure) ----------
  // Each: { id, text, act: 'drill:<id>' | 'daily' | 'setup' | 'ways' | '', label }. At most 3, kindest and most useful first.
  function suggestions(m) {
    var out = [], C = m.C || {}, sk = {}, name = m.name;
    m.skills.forEach(function (s) { sk[s.key] = s; });
    function add(pr, id, text, act, label) { out.push({ pr: pr, id: id, text: text, act: act || '', label: label || '' }); }
    var anyPlay = m.tracked.tried || m.habits.allTime.tried || A(m.matches.all, 0);
    if (anyPlay && m.week.played === 0) add(95, 'back', 'No play yet this week. A Daily Puzzle together is a gentle way back in.', 'daily', 'Open the Daily Puzzle');
    // a shaky operation
    var shaky = m.skills.filter(function (s) { return s.kind === 'op' && s.level === 'getting'; }).sort(function (a, b) { return a.rate - b.rate; })[0];
    if (shaky) add(90, 'shaky', shaky.label + ' is still tricky: ' + shaky.r + ' of ' + shaky.t + ' Solutions with it were right. A few "Make the Goal" drills side by side, saying each step out loud, usually help.', 'drill:make', 'Make the Goal drill');
    // an operation he can use but rarely does
    var ops = m.skills.filter(function (s) { return s.kind === 'op' && s.open; }), top = ops.slice().sort(function (a, b) { return b.t - a.t; })[0];
    if (top && top.t >= 15) {
      var rare = ops.filter(function (s) { return s !== top && s.key !== '+' && s.key !== '-' && s.t <= Math.max(2, 0.2 * top.t); }).sort(function (a, b) { return a.t - b.t; })[0];
      if (rare) add(80, 'rare', 'He uses ' + SHOWS[top.key] + ' a lot (' + top.t + ' Solutions) but ' + SHOWS[rare.key] + ' only ' + (rare.t === 1 ? 'once' : rare.t + ' times') + '. In "Make the Goal", look for a way with ' + SHOWS[rare.key] + ' together.', 'drill:make', 'Make the Goal drill');
    }
    var ch = m.ch, impCalls = A(ch.imp, 0) + (ch.all.impWins || 0), shakes = m.hints.shakes;
    if (impCalls === 0 && (shakes >= 10 || A(ch.mc, 2) > 0)) {
      var spot = A(ch.mc, 2);
      add(85 + (spot ? 10 : 0), 'imp', 'He hasn\'t called Impossible! yet' + (spot ? ', and the game spotted ' + spot + ' moment' + (spot > 1 ? 's' : '') + ' where it would have won' : '') + '. The Impossible detective drill is a good start, or play a few shakes together and hunt for one.', 'drill:imp', 'Impossible detective');
    }
    var nowMiss = A(ch.mc, 1);
    if (nowMiss >= 3 && nowMiss > A(ch.now, 1)) add(75 + Math.min(10, nowMiss), 'now', 'The game spotted ' + nowMiss + ' times he could have called Now! and won. "Now or not yet?" practises spotting exactly that.', 'drill:now', 'Now or not yet?');
    var rs = {}; m.stuck.forEach(function (s) { rs[s.code] = s.n; });
    if ((rs.required || 0) >= 3 && rs.required >= 0.25 * m.wrong) add(70, 'required', 'Many slips are a left-out Required cube. Before he taps Check, count the Required cubes together: every one must be in.', 'drill:make', 'Make the Goal drill');
    if (A(ch.moved, 0) - A(ch.moved, 1) >= 3 && A(ch.moved, 1) * 2 <= A(ch.moved, 0)) add(68, 'safe', 'Other players often catch his moves with a challenge. The "Safe move" drill practises moves that don\'t hand them a win.', 'drill:safe', 'Safe move drill');
    if ((rs.concat || 0) >= 3) add(65, 'concat', 'He sometimes puts two number cubes side by side (like 1 and 2 to make 12). In a Solution each cube is its own number: 1 + 2, or 1 × 2.', 'drill:make', 'Make the Goal drill');
    if ((rs.value || 0) >= 4 && m.tracked.tried >= 10 && m.tracked.right / m.tracked.tried < 0.6) add(60, 'value', 'Most misses come out to a different number. The line under his Solution shows what it makes before he checks: worth pointing out.', 'drill:make', 'Make the Goal drill');
    if (m.habits.goals >= 8 && m.habits.goalAvgCubes !== null && m.habits.goalAvgCubes < 2.2) add(55, 'goal', 'His Goals are short (about ' + (Math.round(m.habits.goalAvgCubes * 10) / 10) + ' cubes). "Set a sneaky Goal" shows how a bigger Goal makes life harder for the other side.', 'drill:goal', 'Set a sneaky Goal');
    if (m.habits.right >= 15 && !m.habits.par && (C.stageOps || []).indexOf('*') >= 0) add(50, 'paren', 'He hasn\'t used parentheses yet. Showing (2 + 3) × 4 = 20 next to 2 + 3 × 4 = 14 opens up many more Solutions.', 'drill:make', 'Make the Goal drill');
    if (shakes >= 6 && m.hints.withHint / shakes > 0.5) add(45, 'hint', 'He takes a hint in most shakes, which is fine. Next time, try thinking out loud together for a minute before tapping it.', '', '');
    var nextOpp = (C.opponents || []).filter(function (o) { return o.open && !o.beaten; })[0];
    if (nextOpp) add(12, 'next', 'When he wants a stretch, ' + nextOpp.name + ' is the next creature to beat.', 'setup', 'Pick a match');
    add(8, 'ways', '"How Many Ways?" (in Training Camp) is a calm way to explore: one Goal, as many different Solutions as he can find.', 'ways', 'How Many Ways?');
    out.sort(function (a, b) { return b.pr - a.pr; });
    var seen = {}, pick = [];
    out.forEach(function (s) { var k = s.act || s.id; if (pick.length < 3 && !seen[k]) { seen[k] = 1; pick.push(s); } });
    return pick;
  }

  // ---------- export (pure) ----------
  function levelList(m, lv) { return m.skills.concat(m.cards, m.bonus).filter(function (s) { return s.level === lv && (s.open || s.t); }).map(function (s) { return s.label; }); }
  function summaryText(m) {
    var C = m.C || {}, w = m.week, mo = m.month, L = [];
    L.push('Tata\'s Equations: how ' + m.name + ' is doing (' + niceDay(m.day) + ')');
    L.push('');
    function line(lbl, s) { return lbl + ': played ' + s.played + ' of ' + s.days + ' days' + (s.partial ? '' : ', ' + s.min + ' active minutes') + ', ' + s.matches + ' matches (' + s.won + ' won), ' + s.shakes + ' shakes, ' + s.right + ' of ' + s.tried + ' Solutions right.'; }
    L.push(line('This week', w));
    L.push(line('Last 4 weeks', mo));
    ['solid', 'getting', 'new'].forEach(function (lv) { var l = levelList(m, lv); if (l.length) L.push(LEVEL_WORDS[lv] + ': ' + l.join(', ') + '.'); });
    if (m.habits.medianCubes) L.push('A typical Solution uses ' + m.habits.medianCubes + ' cubes (longest: ' + m.habits.longest + ').');
    if (m.stuck.length) L.push('Most common slip: ' + m.stuck[0].words.charAt(0).toLowerCase() + m.stuck[0].words.slice(1) + ' (' + m.stuck[0].n + ' times).');
    function calls(x) { return A(x, 0) ? A(x, 0) + ' called (' + A(x, 1) + ' right)' : 'not called yet'; }
    L.push('Challenges: Now! ' + calls(m.ch.now) + ', Impossible! ' + calls(m.ch.imp) + '.');
    if (C.stages && C.ladder) { var s = C.stages[Math.min(C.ladder.stage, C.stages.length - 1)]; if (s) L.push('Ladder: ' + s.name + (C.ladder.stage < C.stages.length - 1 && !C.ladderOff ? ' (' + C.ladder.stars + ' of ' + s.need + ' stars to the next step)' : '') + '.'); }
    if (C.opponents) L.push('Creatures beaten: ' + C.opponents.filter(function (o) { return o.beaten; }).length + ' of ' + C.opponents.length + '. Variation cards: ' + (C.cards || []).length + ' of ' + (C.cardsTotal || 0) + '.');
    if (m.suggest.length) { L.push(''); L.push('Try next:'); m.suggest.forEach(function (s) { L.push('- ' + s.text); }); }
    L.push('');
    L.push('(Active minutes, matches, challenges and slips are counted since ' + niceDay(m.since) + ', when this page was added.)');
    return L.join('\n');
  }
  function csv(m) {
    var rows = [['date', 'active_minutes', 'sessions', 'solutions_tried', 'solutions_right', 'matches', 'matches_won', 'shakes', 'goals_set', 'now_calls', 'now_right', 'impossible_calls', 'impossible_right', 'hint_shakes', 'drills_tried', 'drills_right', 'source']];
    var P = m.P, hist = {}, from = addDays(m.day, -(DAYS_KEPT - 1));
    (m.C.history || []).forEach(function (x) { var k = keyOf(new Date(x.t)); var o = hist[k] || (hist[k] = [0, 0]); o[0]++; if (x.ok) o[1]++; });
    for (var k = from; k <= m.day; k = addDays(k, 1)) {
      var d = P.days[k], tracked = k >= P.since;
      if (tracked && d) rows.push([k, Math.round((d.a || 0) / 60), d.n || 0, A(d.so, 0), A(d.so, 1), A(d.m, 0), A(d.m, 1), d.sh || 0, d.g || 0, A(d.cn, 0), A(d.cn, 1), A(d.ci, 0), A(d.ci, 1), d.h || 0, A(d.dr, 0), A(d.dr, 1), 'this page']);
      else if (!tracked && hist[k]) rows.push([k, '', '', hist[k][0], hist[k][1], '', '', '', '', '', '', '', '', '', '', '', 'older record (Solutions only)']);
    }
    return rows.map(function (r) { return r.join(','); }).join('\n') + '\n';
  }

  var core = { V: V, MAX_BYTES: MAX_BYTES, DAYS_KEPT: DAYS_KEPT, blank: blank, normalize: normalize, record: record, cap: cap, bytes: bytes, level: level, trend: trend,
    classify: classify, model: model, suggestions: suggestions, summaryText: summaryText, csv: csv, keyOf: keyOf, addDays: addDays, daysBetween: daysBetween,
    REASONS: REASONS, LEVEL_WORDS: LEVEL_WORDS };

  // =================== facts from live game objects (needs Eq) ===================
  function symOf(t) { return typeof t === 'string' ? t : (t && t.s); }
  function isDig(s) { return typeof Eq !== 'undefined' ? Eq.isDigit(s) : /^[0-9]$/.test(s); }
  function cubeSym(t) { var s = symOf(t); return (typeof Eq !== 'undefined' && Eq.cubeOf && Eq.cubeOf(s)) || s; }
  function showText(tokens) {
    return (tokens || []).map(symOf).map(function (s) { var t = (typeof Eq !== 'undefined' && Eq.SHOW[s]) || SHOWS[s] || s; return /^[+\-*/m]$/.test(s) ? ' ' + t + ' ' : t; }).join('').replace(/\s+/g, ' ').trim();
  }
  function fmtV(v) { try { return v ? Eq.fmt(v) : ''; } catch (e) { return ''; } }
  // Did any step go below zero? Only for plain symbols (digits, + − × ÷ ^ √, parentheses); anything else: false.
  function negUsed(tokens, fr) {
    var s = (tokens || []).map(symOf);
    if (!s.length || !s.every(function (x) { return /^[0-9+\-*/^r()]$/.test(x); })) return false;
    var i = 0, found = false, n = s.length;
    function span(a, b) { if (found || b - a < 2) return; var e = Eq.evaluate(s.slice(a, b), { fractions: fr }); if (e.ok && e.value && e.value.n < 0) found = true; }
    function atom() { if (s[i] === '(') { var a = i; i++; expr(); if (s[i] === ')') i++; span(a, i); } else i++; }
    function un() { if (s[i] === 'r') { i++; un(); return; } atom(); if (i < n && s[i] === 'r') { i++; un(); } }
    function pw() { var a = i; un(); if (s[i] === '^') { i++; pw(); span(a, i); } }
    function term() { var a = i; pw(); while (i < n && (s[i] === '*' || s[i] === '/')) { i++; pw(); span(a, i); } }
    function expr() { var a = i; term(); while (i < n && (s[i] === '+' || s[i] === '-')) { i++; term(); span(a, i); } }
    try { expr(); span(0, n); } catch (e) { return false; }
    return found;
  }
  function twoDigit(tokens) { var s = (tokens || []).map(symOf); for (var i = 1; i < s.length; i++) if (isDig(s[i]) && isDig(s[i - 1])) return true; return false; }
  function curFractions() {
    try {
      if (typeof G !== 'undefined' && G && G.fractions !== undefined) return G.fractions;
      if (typeof CAMP !== 'undefined' && CAMP && CAMP.P) return CAMP.P.fractions;
      if (typeof WAYS !== 'undefined' && WAYS && WAYS.P && current === 'camp') return WAYS.P.fractions;
      if (typeof D !== 'undefined' && D && current === 'daily') return D.fractions;
      return stageInfo().fractions;
    } catch (e) { return true; }
  }
  // {chk, ms, tokens, mode, goal} -> facts for record('solution')
  function solutionFacts(x) {
    var chk = x.chk || null, ok = !!(chk && chk.ok), tokens = x.tokens || null, fr = x.fr !== undefined ? x.fr : curFractions();
    var keys = [], f = { ok: ok, mode: x.mode || 'other', ms: x.ms || 0 };
    if (tokens) tokens.forEach(function (t) {
      if (typeof t !== 'object') return;
      var s = cubeSym(t), k = null;
      if (OPS.indexOf(s) >= 0) k = s;
      else if (Eq.isBonusOp && Eq.isBonusOp(s)) k = 'b:' + s;
      else if (Eq.bigIdx && Eq.bigIdx(s) >= 0) k = 'big';
      if (k && keys.indexOf(k) < 0) keys.push(k);
    });
    if (chk && chk.madeFraction) keys.push('fr');
    var g = typeof G !== 'undefined' ? G : null, inMatch = !!(g && ['now', 'impossible', 'last', 'free'].indexOf(f.mode) >= 0);
    if (inMatch && g.vari) keys.push('v:' + g.vari);
    f.keys = keys;
    f.cubes = (chk && chk.cubes) || (tokens || []).filter(function (t) { return typeof t === 'object'; }).length;
    f.hint = inMatch ? !!g.hintUsed : false;
    f.par = !!tokens && tokens.some(function (t) { return t === '('; });
    f.two = twoDigit(tokens);
    f.frac = !!(chk && chk.madeFraction);
    f.neg = ok && negUsed(tokens, fr);
    if (f.mode === 'camp' && typeof CAMP !== 'undefined' && CAMP && CAMP.drill) f.drill = CAMP.drill;
    if (!ok) {
      if (!tokens || !tokens.length) f.codes = ['none'];
      else { var ev = null; try { ev = Eq.evaluate(tokens, { fractions: fr }); } catch (e) { ev = null; } f.codes = classify(ev && !ev.ok ? ev.code : null, chk ? chk.reasons : []); }
      f.ex = { s: tokens ? showText(tokens) : '', g: fmtV(x.goal), v: chk && chk.value ? fmtV(chk.value) : '' };
    }
    return f;
  }
  function goalFacts(x) {
    var tokens = x.tokens || [], ops = [];
    tokens.forEach(function (t) { if (typeof t === 'object') { var s = cubeSym(t); if (!isDig(s) && ops.indexOf(s) < 0) ops.push(s); } });
    return { cubes: tokens.filter(function (t) { return typeof t === 'object'; }).length, ops: ops, two: twoDigit(tokens), frac: !!(x.value && x.value.d !== 1) };
  }

  // =================== page side ===================
  if (typeof window === 'undefined' || typeof document === 'undefined') return { core: core, _facts: { solutionFacts: solutionFacts, goalFacts: goalFacts, negUsed: negUsed, showText: showText } };

  function now() { return Date.now(); }
  function dayNow() { return keyOf(new Date()); }
  function store() {
    if (typeof S === 'undefined' || !S) return null;
    var fresh = !S.parent;
    S.parent = normalize(S.parent, dayNow());
    if (fresh) scanUnlocks(true);
    return S.parent;
  }
  function safe(fn) { try { return fn(); } catch (e) { if (window.console) console.warn('[parent page]', e); return null; } }

  // ---- unlock dates (first seen by this page; '' = already unlocked when the page was added) ----
  function scanUnlocks(first) {
    var P = S.parent; if (!P) return;
    var d = first ? '' : dayNow(), changed = false;
    function mark(k) { if (!(k in P.unl)) { P.unl[k] = d; changed = true; } }
    safe(function () {
      for (var i = 1; i <= Math.min(S.ladder.stage, STAGES.length - 1); i++) mark('st:' + i);
      if (window.Vari) Vari.unlocked().forEach(function (c) { mark('card:' + c.id); });
      if (window.Bonus) Bonus.ORDER.forEach(function (id) { if (Bonus.unlocked(id)) mark('die:' + id); });
      (S.beaten || []).forEach(function (b, i) { if (b) mark('beat:' + i); });
    });
    return changed;
  }

  // ---- active time ----
  var lastIn = 0, pend = 0, paused = false, pausedAt = 0, newSes = false;
  function flush() {
    var P = store(); if (!P || (pend < 1 && !newSes)) return;
    record(P, 'active', { sec: pend, session: newSes }, dayNow());
    pend = 0; newSes = false;
  }
  function onInput() {
    var t = now();
    if (paused) { paused = false; if (t - pausedAt > SESSION_GAP_S * 1000) newSes = true; lastIn = t; return; }
    if (!lastIn || t - lastIn > SESSION_GAP_S * 1000) newSes = true;
    else pend += Math.min(t - lastIn, IDLE_S * 1000) / 1000;
    lastIn = t;
    if (pend >= 20 || newSes) flush();
  }
  function onHide() {
    if (lastIn && !paused) { pend += Math.min(now() - lastIn, IDLE_S * 1000) / 1000; paused = true; pausedAt = now(); }
    flush(); if (typeof persist === 'function') persist();
  }
  ['pointerdown', 'keydown', 'wheel'].forEach(function (ev) { document.addEventListener(ev, onInput, { capture: true, passive: true }); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) onHide(); });
  window.addEventListener('pagehide', onHide);

  // ---- notes from the game ----
  var matchT0 = 0;
  function gMode() { var g = typeof G !== 'undefined' ? G : null; if (!g) return ''; return g.mode === 'ai' && window.Cup && Cup.active && Cup.active() ? 'cup' : g.mode; }
  function note(ev, x) {
    safe(function () {
      var P = store(); if (!P) return;
      var day = dayNow(), g = typeof G !== 'undefined' ? G : null;
      flush();
      x = x || {};
      if (ev === 'solution') record(P, 'solution', solutionFacts(x), day);
      else if (ev === 'goal') record(P, 'goal', goalFacts(x), day);
      else if (ev === 'challenge') record(P, 'challenge', { kind: x.kind, role: x.role, won: !!x.won }, day);
      else if (ev === 'shake') record(P, 'shake', { hint: !!(g && g.hintUsed), won: !!(x.pts && x.pts[0] >= 4) }, day);
      else if (ev === 'matchStart') matchT0 = now();
      else if (ev === 'match' && g && g.players && g.players.length) {
        var top = Math.max.apply(null, g.players.map(function (p) { return p.score; })), n = g.players.filter(function (p) { return p.score === top; }).length;
        var me = g.players[0].score === top, res = me && n === 1 ? 'w' : me ? 't' : 'l';
        var opp = (g.mode === 'ai' || g.mode === 'team') && typeof g.oppIdx === 'number' ? g.oppIdx : null;
        record(P, 'match', { mode: gMode(), opp: opp, result: res, shakes: g.shakes || 0, min: matchT0 ? (now() - matchT0) / 60000 : 0 }, day);
        matchT0 = 0;
        if (window.Recorder && Recorder.peek) { var lg = Recorder.peek(); if (lg && lg.notes && lg.notes.length) setTimeout(function () { analyseLog(lg); }, 4500); }
      }
      else if (ev === 'drill') record(P, 'drill', { id: x.id, ok: !!x.ok }, day);
      scanUnlocks(false);
    });
  }

  // ---- chances the game can PROVE he had (reuses the "One thing Pip spotted" analysis, js/review.js) ----
  // After a match against a creature: every moment where the creature had just acted and he moved on (or wrote after
  // the last cube) is checked. A Now! chance = a concrete Solution with at most one more cube; an Impossible! chance =
  // a complete search that finds nothing. Runs in small slices, at most ~3 s in total; unchecked moments are not counted.
  function analyseLog(lg) {
    if (!window.Review || !Review.plan) return;
    var jobs; try { jobs = Review.plan(lg).filter(function (j) { return j.kind === 'now' || j.kind === 'imp'; }); } catch (e) { return; }
    if (!jobs.length) { safe(function () { record(store(), 'missed', { moments: 0 }, dayNow()); }); return; }
    var i = 0, res = { moments: 0, now: 0, imp: 0 }, spent = 0, open = null, day = dayNow();
    (function tick() {
      var t0 = now();
      while (i < jobs.length && now() - t0 < 25) {
        var j = jobs[i++];
        if (j.kind === 'now') { open = { now: false, imp: false }; res.moments++; }
        var r = null; try { r = j.run(); } catch (e) { r = null; }
        if (r && open && !open[r.kind]) { open[r.kind] = true; res[r.kind]++; }
      }
      spent += now() - t0;
      if (i < jobs.length && spent < 3000) { setTimeout(tick, 0); return; }
      safe(function () { record(store(), 'missed', res, day); if (typeof persist === 'function') persist(); });
    })();
  }

  // ---- the context for model() from the live save ----
  function ctxFromSave() {
    var c = { today: dayNow(), name: S.name || 'him', stats: S.stats || {}, opsUsed: S.opsUsed || {}, history: S.history || [], best: S.best || {},
      ladder: S.ladder || { stage: 1, stars: 0 }, lvl: typeof levelFor === 'function' ? safe(function () { return levelFor(S.xp); }) : null, xp: S.xp || 0, tipsSeen: (S.tips && S.tips.seen) || 0 };
    safe(function () { var st = stageInfo(); c.stageOps = st.ops.slice(); c.fractionsOn = !!st.fractions; });
    c.stages = typeof STAGES !== 'undefined' ? STAGES.map(function (s) { return { name: s.name, icon: s.icon, need: s.need }; }) : [];
    c.ladderOff = typeof ladderOff === 'function' ? !!safe(ladderOff) : false;
    c.badges = typeof BADGES !== 'undefined' ? { got: BADGES.filter(function (b) { return S.badges && S.badges[b.id]; }).length, total: BADGES.length } : { got: 0, total: 0 };
    c.opponents = typeof OPPONENTS !== 'undefined' ? OPPONENTS.map(function (o, i) { return { name: o.name, emoji: o.emoji, beaten: !!(S.beaten && S.beaten[i]), open: typeof oppOpen === 'function' ? !!safe(function () { return oppOpen(i); }) : true }; }) : [];
    c.cards = window.Vari ? (safe(function () { return Vari.unlocked(); }) || []).map(function (x) { return { id: x.id, name: x.name, icon: x.icon }; }) : [];
    c.cardsTotal = window.Vari ? Vari.CARDS.length : 0;
    c.dice = window.Bonus ? Bonus.ORDER.map(function (id) { return { id: id, name: Bonus.DIE[id].name, icon: Bonus.DIE[id].icon, unlocked: !!safe(function () { return Bonus.unlocked(id); }) }; }) : [];
    c.bonusNames = {}; if (window.Bonus && Bonus.OPS) Object.keys(Bonus.OPS).forEach(function (k) { c.bonusNames[k] = Bonus.OPS[k].name; });
    c.pennants = window.Season && Season.pennants ? (safe(function () { return Season.pennants(); }) || []) : [];
    c.drills = (typeof DRILLS !== 'undefined' ? DRILLS : []).map(function (d) { var s = S.camp && S.camp[d.id]; return { id: d.id, name: d.name, lvl: s ? s.lvl : 1, done: s ? s.done : 0 }; });
    if (window.Bonus && Bonus.DRILL && S.camp && S.camp.bonus && Bonus.ORDER.some(function (id) { return safe(function () { return Bonus.unlocked(id); }); })) c.drills.push({ id: 'bonus', name: Bonus.DRILL.name, lvl: S.camp.bonus.lvl, done: S.camp.bonus.done });
    if (S.ways) c.ways = { done: S.ways.done || 0, total: S.ways.total || 0 };
    c.daily = (S.stats && S.stats.daily) || 0;
    return c;
  }

  // ---- drawing ----
  var from = 'settings', gateUntil = 0, lastModel = null;
  function E(s) { return typeof esc === 'function' ? esc(s) : String(s); }
  function mark() { return '<span class="pp-since" title="Counted since this page was added">◔</span>'; }
  function tile(v, l, sub) { return '<div class="pp-tile"><div class="pp-v">' + v + '</div><div class="pp-l">' + l + '</div>' + (sub ? '<div class="pp-sub">' + sub + '</div>' : '') + '</div>'; }
  function weekTiles(s, title) {
    return '<div class="pp-win"><h4>' + title + '</h4><div class="pp-tiles">' +
      tile(s.played + '<small>/' + s.days + '</small>', 'days played') +
      tile(s.min, 'active minutes' + (s.partial ? ' ' + mark() : '')) +
      tile(s.matches, 'matches' + (s.partial ? ' ' + mark() : ''), s.matches ? s.won + ' won' : '') +
      tile(s.shakes, 'shakes' + (s.partial ? ' ' + mark() : '')) +
      tile(s.tried ? Math.round(100 * s.right / s.tried) + '<small>%</small>' : '–', s.right + ' of ' + s.tried + ' Solutions right') +
      '</div></div>';
  }
  function barChart(rows, get, title, unit, stacked) {
    var max = 1; rows.forEach(function (r) { var v = stacked ? r.tried : get(r); if (v > max) max = v; });
    var nice = max <= 5 ? 5 : max <= 10 ? 10 : Math.ceil(max / 10) * 10;
    var cols = rows.map(function (r, i) {
      var d = parseKey(r.d), lab = (i % 7 === 6 || i === rows.length - 1) ? niceDay(r.d) : (rows.length <= 7 ? DOW[d.getDay()] : ''), tip, inner;
      if (stacked) {
        var hr = 100 * r.right / nice, hw = 100 * (r.tried - r.right) / nice;
        tip = niceDay(r.d) + ': ' + r.right + ' of ' + r.tried + ' right';
        inner = r.tried ? '<i class="pp-seg pp-ok" style="height:' + hr + '%"></i><i class="pp-seg pp-no" style="height:' + hw + '%"></i>' : '';
      } else {
        var v = get(r);
        tip = niceDay(r.d) + ': ' + (v === null ? 'not counted yet' : v + ' ' + unit);
        inner = v === null ? '<i class="pp-seg pp-na"></i>' : v ? '<i class="pp-seg pp-min" style="height:' + (100 * v / nice) + '%"></i>' : '';
      }
      return '<div class="pp-col' + (r.d === lastModel.day ? ' pp-today' : '') + '" title="' + E(tip) + '" aria-label="' + E(tip) + '"><div class="pp-bar">' + inner + '</div><span class="pp-x">' + lab + '</span></div>';
    }).join('');
    return '<div class="pp-chart"><div class="pp-ch-h"><b>' + title + '</b>' + (stacked ? '<span class="pp-key"><i class="pp-ok"></i>right <i class="pp-no"></i>not right yet</span>' : '') + '</div>' +
      '<div class="pp-plot"><div class="pp-y"><span>' + nice + '</span><span>' + (nice / 2) + '</span><span>0</span></div><div class="pp-cols">' + cols + '</div></div></div>';
  }
  function chip(lv) { return '<span class="pp-lv pp-lv-' + lv + '">' + LEVEL_WORDS[lv] + '</span>'; }
  function arrow(t) { return t === 'up' ? '<span class="pp-tr up" title="Better than the 2 weeks before">▲ better</span>' : t === 'down' ? '<span class="pp-tr down" title="Lower than the 2 weeks before">▼ lower</span>' : t === 'flat' ? '<span class="pp-tr">● steady</span>' : '<span class="pp-tr na">–</span>'; }
  function skillTable(rows, oldNote) {
    return '<table class="pp-table"><thead><tr><th>Skill</th><th>Tries</th><th>Right</th><th class="pp-hide-s">Trend</th><th>Level</th></tr></thead><tbody>' + rows.map(function (s) {
      var p = s.t ? Math.round(100 * s.r / s.t) : null;
      var note = s.kind === 'op' && !s.open && !s.t ? '<small>not unlocked on the ladder yet</small>' : (s.old && oldNote && s.t < 8 ? '<small>used in ' + s.old + ' right Solution' + (s.old > 1 ? 's' : '') + ' before this page</small>' : (s.since ? '<small>unlocked ' + niceDay(s.since) + '</small>' : ''));
      return '<tr><td><b>' + E(s.label) + '</b>' + (note ? '<br>' + note : '') + '</td><td>' + s.t + '</td><td>' + (p === null ? '–' : '<span class="pp-rate"><i style="width:' + p + '%"></i></span>' + p + '%') + '</td><td class="pp-hide-s">' + arrow(s.trend) + '</td><td>' + chip(s.level) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function exText(ex) { if (!ex) return ''; return 'Goal ' + E(ex[2]) + ': <span class="pp-ex">' + E(ex[1] || '(nothing written)') + '</span>' + (ex[3] ? ' made ' + E(ex[3]) : '') + ' <small>(' + niceDay(ex[0]) + ')</small>'; }
  function pl(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function pc(n, d) { return d ? Math.round(100 * n / d) + '%' : '–'; }
  function render() {
    var el = document.getElementById('parent'); if (!el) return;
    if (now() > gateUntil) { el.innerHTML = gateHTML(); return; }
    var P = store(); flush();
    var m = lastModel = model(P, ctxFromSave()), C = m.C, h = m.habits, ch = m.ch;
    var sinceTxt = m.sinceToday ? 'today' : niceDay(m.since);
    var html = '<div class="hdr pp-noprint"><button class="btn small" data-act="parentBack">' + ico('back') + ' Back</button><h2>' + ico('cap') + ' For Tata</h2></div>' +
      '<div class="panel pp">' +
      '<div class="pp-head"><div><h3>How ' + E(m.name) + ' is doing</h3><p class="pp-muted">' + niceDay(m.day) + '. Everything here stays on this device, inside the game\'s save.</p></div>' +
      '<div class="pp-actions pp-noprint"><button class="btn small" data-act="parentCopy">Copy a summary</button><button class="btn small" data-act="parentCsv">Daily numbers (CSV)</button><button class="btn small" data-act="parentPrint">Print</button></div></div>' +
      '<p class="pp-note">' + mark() + ' = counted since ' + sinceTxt + ', when this page was added. Older numbers come from what the game already kept (Solutions, stats, badges).</p>' +
      // 1. time
      '<section class="pp-sec"><h3>Playing time</h3><div class="pp-wins">' + weekTiles(m.week, 'This week') + weekTiles(m.month, 'Last 4 weeks') + '</div>' +
      barChart(m.month.rows, function (r) { return r.min; }, 'Active minutes per day ' + mark(), 'min') +
      barChart(m.month.rows, null, 'Solutions per day', '', true) +
      '<p class="pp-muted">Active time counts only while he is tapping: the clock stops 60 seconds after the last tap. ' + (m.active.sessions ? m.active.sessions + ' play session' + (m.active.sessions > 1 ? 's' : '') + ' since ' + sinceTxt + '.' : '') + '</p></section>' +
      // 2. try next
      '<section class="pp-sec pp-try"><h3>Try this next</h3>' + m.suggest.map(function (s) { return '<div class="pp-sug"><p>' + E(s.text) + '</p>' + (s.act ? '<button class="btn small green pp-noprint" data-act="parentTry" data-arg="' + s.act + '">' + E(s.label) + ' ▶</button>' : '') + '</div>'; }).join('') + '</section>' +
      // 3. skills
      '<section class="pp-sec"><h3>Skills</h3>' + skillTable(m.skills, true) +
      (m.cards.length ? '<h4>Variation cards he has unlocked</h4><p class="pp-muted">A try counts for a card when that card was in play for the shake.</p>' + skillTable(m.cards) : '') +
      (m.bonus.length ? '<h4>Bonus dice (house rule)</h4>' + skillTable(m.bonus) : '') +
      '<div class="pp-rules"><b>How the levels work</b><ul>' +
      '<li>' + chip('solid') + ' 8 or more tries and at least 3 out of 4 right (counting just the last 30 days once he has 8 tries in them).</li>' +
      '<li>' + chip('getting') + ' 8 or more tries, fewer than 3 out of 4 right.</li>' +
      '<li>' + chip('new') + ' 1 to 7 tries: too early to say.</li><li>' + chip('none') + ' no tries yet.</li></ul>' +
      '<p>A Solution counts as a try for every operation in it. Slips about the rules (a left-out Required cube, a Forbidden cube, "I can\'t find one") don\'t count against an operation; they show under "Where he gets stuck". Trend compares the last 2 weeks with the 2 weeks before (5+ tries in each). Counted since ' + sinceTxt + '.</p></div>' +
      '<div class="pp-habits">' +
      tile(h.medianCubes || '–', 'cubes in a typical right Solution', h.longest ? 'longest ever: ' + h.longest : '') +
      tile(h.medianMs ? Math.round(h.medianMs / 1000) + '<small>s</small>' : '–', 'typical thinking time (right Solutions)') +
      tile(pc(h.par, h.right), 'right Solutions with parentheses ' + mark()) +
      tile(pc(h.neg, h.right), 'right Solutions that go below zero ' + mark()) +
      tile(pc(h.frac, h.right), 'right Solutions that make a fraction ' + mark()) +
      tile(pc(h.goal2, h.goals), 'Goals with a two-digit number ' + mark(), h.goals ? pl(h.goals, 'Goal') + ' set' + (h.goalAvgCubes ? ', about ' + (Math.round(h.goalAvgCubes * 10) / 10) + ' cubes each' : '') : '') +
      '</div></section>' +
      // 4. stuck
      '<section class="pp-sec"><h3>Where he gets stuck</h3>' +
      (m.stuck.length ? '<p class="pp-muted">' + m.wrong + ' of ' + pl(m.tracked.tried, 'Solution') + ' ' + mark() + ' didn\'t count yet. The usual reasons (one Solution can have more than one):</p><ol class="pp-stuck">' +
        m.stuck.slice(0, 5).map(function (s) { return '<li><b>' + E(s.words) + '</b> <span class="pp-n">' + s.n + '×</span>' + (s.ex ? '<br><small>For example: ' + exText(s.ex) + '</small>' : '') + '</li>'; }).join('') + '</ol>'
        : '<p class="pp-muted">No Solutions that missed ' + mark() + ' yet.</p>') +
      '<div class="pp-tiles">' +
      tile(A(ch.now, 0) ? A(ch.now, 1) + '<small>/' + A(ch.now, 0) + '</small>' : '0', 'Now! calls right ' + mark()) +
      tile(A(ch.imp, 0) ? A(ch.imp, 1) + '<small>/' + A(ch.imp, 0) + '</small>' : '0', 'Impossible! calls right ' + mark()) +
      tile(ch.checked ? A(ch.mc, 1) : '–', 'Now! chances he let pass ' + mark(), ch.checked ? 'in ' + pl(ch.checked, 'checked match', 'checked matches') : 'checked after matches vs a creature') +
      tile(ch.checked ? A(ch.mc, 2) : '–', 'Impossible! chances he let pass ' + mark(), ch.checked ? pl(A(ch.mc, 0), 'moment') + ' checked' : '') +
      tile(A(ch.moved, 0) ? A(ch.moved, 1) + '<small>/' + A(ch.moved, 0) + '</small>' : '0', 'times his move was challenged and he came out ahead ' + mark()) +
      tile(m.hints.shakes ? pc(m.hints.withHint, m.hints.shakes) : '–', 'shakes with a hint ' + mark(), m.hints.shakes ? m.hints.withHint + ' of ' + m.hints.shakes : '') +
      '</div><p class="pp-muted">All time (from the game\'s own stats): ' + ch.all.won + ' of ' + ch.all.calls + ' challenges won, ' + ch.all.nowWins + ' by Now!, ' + ch.all.impWins + ' by Impossible!. ' +
      '"Chances he let pass" are only counted when the game can prove them (a real Solution for Now!, or a complete search for Impossible!), using the same check as Pip\'s tip after a match. They are checked only in one-on-one matches against a creature, with Pip\'s tip switched on.</p></section>' +
      // 5. progress
      '<section class="pp-sec"><h3>Progress</h3>' + progressHTML(m) + '</section>' +
      '<p class="pp-foot">Saved numbers for this page: ' + Math.round(bytes(P) / 100) / 10 + ' KB (kept small: the last ' + DAYS_KEPT + ' days and running totals).</p>' +
      '</div>';
    el.innerHTML = html;
  }
  function progressHTML(m) {
    var C = m.C, P = m.P, out = '';
    var stage = Math.min(C.ladder.stage, C.stages.length - 1);
    out += '<h4>Operations ladder</h4><div class="pp-ladder">' + C.stages.map(function (s, i) {
      var got = i <= stage, d = i ? P.unl['st:' + i] : null;
      return '<div class="pp-step' + (got ? ' got' : '') + (i === stage ? ' cur' : '') + '"><span>' + s.icon + '</span><b>' + E(s.name) + '</b><small>' +
        (i === stage && i < C.stages.length - 1 && !C.ladderOff ? C.ladder.stars + ' of ' + s.need + ' stars' : got ? (d ? 'reached ' + niceDay(d) : i ? 'reached' : 'start') : 'not yet') + '</small></div>';
    }).join('') + '</div>' + (C.ladderOff ? '<p class="pp-muted">The operations are set by hand in the Parent corner, so stars are not unlocking anything right now.</p>' : '');
    out += '<div class="pp-tiles">' + tile('Lv ' + (C.lvl || '–'), C.xp + ' XP') + tile(C.badges.got + '<small>/' + C.badges.total + '</small>', 'badges') +
      tile(C.opponents.filter(function (o) { return o.beaten; }).length + '<small>/' + C.opponents.length + '</small>', 'creatures beaten') +
      tile(C.cards.length + '<small>/' + C.cardsTotal + '</small>', 'variation cards') + tile(C.daily, 'Daily Puzzles solved') +
      (C.ways ? tile(C.ways.done, 'How Many Ways? Goals finished') : '') + '</div>';
    if (C.cards.length) out += '<h4>Cards unlocked</h4><div class="pp-chips">' + C.cards.map(function (c) { var d = P.unl['card:' + c.id]; return '<span class="pp-chipc">' + c.icon + ' ' + E(c.name) + ' <small>' + (d ? niceDay(d) : 'before ' + niceDay(P.since)) + '</small></span>'; }).join('') + '</div>';
    var dice = (C.dice || []).filter(function (d) { return d.unlocked; });
    if (dice.length) out += '<h4>Bonus dice earned</h4><div class="pp-chips">' + dice.map(function (d) { var k = P.unl['die:' + d.id]; return '<span class="pp-chipc">' + d.icon + ' ' + E(d.name) + ' <small>' + (k ? niceDay(k) : 'before ' + niceDay(P.since)) + '</small></span>'; }).join('') + '</div>';
    out += '<h4>Creatures</h4><div class="pp-opps">' + C.opponents.map(function (o, i) {
      var rec = m.matches.opp[i], d = P.unl['beat:' + i];
      return '<div class="pp-opp' + (o.beaten ? ' got' : '') + '"><span>' + (o.emoji || '') + '</span><b>' + E(o.name) + '</b><small>' + (o.beaten ? '✔ beaten' + (d ? ' ' + niceDay(d) : '') : o.open ? 'open' : 'locked') + (rec ? ' · ' + rec[1] + ' of ' + rec[0] + ' won' : '') + '</small></div>';
    }).join('') + '</div>';
    var mt = m.matches;
    if (A(mt.all, 0)) out += '<p class="pp-muted">' + mark() + ' ' + pl(A(mt.all, 0), 'match', 'matches') + ' finished: ' + A(mt.all, 1) + ' won, ' + A(mt.all, 2) + ' tied. ' + (A(mt.len, 0) ? 'Typical match: ' + pl(Math.round(A(mt.len, 1) / A(mt.len, 0)), 'shake') + ', about ' + pl(Math.max(1, Math.round(A(mt.len, 2) / A(mt.len, 0))), 'minute') + '. ' : '') +
      Object.keys(mt.modes).map(function (k) { return ({ ai: 'vs a creature', cup: 'cup', pvp: '2 players', p3: '3 players', ai3: 'three at the table', team: 'team-up', online: 'online' }[k] || k) + ': ' + mt.modes[k]; }).join(', ') + '.</p>';
    if (C.pennants.length) out += '<h4>Seasons finished</h4><ul class="pp-list">' + C.pennants.slice(0, 8).map(function (p) { return '<li>' + E(p.league) + ' season ' + p.n + ': place ' + p.place + (p.date ? ' <small>(' + E(p.date) + ')</small>' : '') + '</li>'; }).join('') + '</ul>';
    if (m.drills.length) out += '<h4>Training Camp</h4><table class="pp-table"><thead><tr><th>Drill</th><th>Level</th><th>Solved</th><th>Right ' + mark() + '</th></tr></thead><tbody>' + m.drills.map(function (d) { return '<tr><td>' + E(d.name) + '</td><td>' + d.lvl + ' of 5</td><td>' + d.done + '</td><td>' + (d.t ? d.r + ' of ' + d.t : '–') + '</td></tr>'; }).join('') + '</tbody></table>';
    return out;
  }
  function gateHTML() {
    return '<div class="hdr"><button class="btn small" data-act="parentBack">' + ico('back') + ' Back</button><h2>' + ico('cap') + ' For Tata</h2></div>' +
      '<div class="panel pp-gate"><h3>Grown-ups only</h3><p>Press and hold the button for 2 seconds.</p>' +
      '<button class="btn big pp-hold" id="ppHold" type="button"><span class="pp-fill"></span><span class="pp-holdt">Hold to open</span></button></div>';
  }
  // the hold-for-2-seconds gate
  var holdT = null;
  function holdStart(e) { var b = document.getElementById('ppHold'); if (!b || holdT) return; if (e && e.cancelable && e.type !== 'keydown') e.preventDefault(); b.classList.add('holding'); holdT = setTimeout(function () { holdT = null; gateUntil = now() + 15 * 60000; if (typeof Snd !== 'undefined' && Snd.chime) Snd.chime(); render(); }, 2000); }
  function holdStop() { var b = document.getElementById('ppHold'); if (b) b.classList.remove('holding'); if (holdT) { clearTimeout(holdT); holdT = null; } }
  document.addEventListener('pointerdown', function (e) { if (e.target && e.target.closest && e.target.closest('#ppHold')) holdStart(e); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (holdT && (ev !== 'pointerleave' || (e.target && e.target.id === 'ppHold'))) holdStop(); }, true); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.id === 'ppHold') { e.preventDefault(); if (!e.repeat) holdStart(e); } });
  document.addEventListener('keyup', function (e) { if (e.key === 'Enter' || e.key === ' ') holdStop(); });
  document.addEventListener('contextmenu', function (e) { if (e.target && e.target.closest && e.target.closest('#ppHold')) e.preventDefault(); });

  function ensureScreen() {
    if (document.getElementById('parent')) return;
    var s = document.createElement('section'); s.id = 'parent'; s.className = 'screen';
    var anchor = document.getElementById('builder'); document.body.insertBefore(s, anchor || null);
  }
  function open(fromScreen) {
    ensureScreen();
    from = fromScreen || (typeof current !== 'undefined' ? current : 'settings');
    render(); go('parent');
  }
  function copyText(t) {
    var done = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t); done = true; } } catch (e) { done = false; }
    if (!done) { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); }
  }
  if (typeof ACT !== 'undefined') {
    ACT.parentOpen = function (el) { open(el && el.dataset && el.dataset.arg); };
    ACT.parentBack = function () { holdStop(); if (from === 'stats' && typeof renderStats === 'function') { renderStats(); go('stats'); } else if (from === 'title' && typeof gotoTitle === 'function') gotoTitle(); else { if (typeof renderSettings === 'function') renderSettings(); go('settings'); } };
    ACT.parentCopy = function () {
      var t = summaryText(lastModel || model(store(), ctxFromSave()));
      copyText(t);
      if (typeof modal === 'function') modal('<h2>Summary copied</h2><p style="text-align:center">Paste it into a message or an email.</p><textarea class="pp-copybox" readonly>' + E(t) + '</textarea><div class="row"><button class="btn green" data-act="closeModal">OK</button></div>');
    };
    ACT.parentCsv = function () {
      var t = csv(lastModel || model(store(), ctxFromSave()));
      try {
        var blob = new Blob([t], { type: 'text/csv' }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'tatas-equations-daily-' + dayNow() + '.csv';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (e) { copyText(t); }
    };
    ACT.parentPrint = function () { window.print(); };
    // "Try this next" buttons: open the drill or mode
    ACT.parentTry = function (el) {
      var a = (el && el.dataset.arg) || '';
      if (a.indexOf('drill:') === 0 && typeof startDrill === 'function') { if (typeof renderCamp === 'function') renderCamp(); startDrill(a.slice(6)); }
      else if (a === 'daily' && ACT.daily) ACT.daily();
      else if (a === 'setup' && ACT.setup) ACT.setup();
      else if (a === 'ways' && ACT.waysOpen) ACT.waysOpen();
      else if (ACT.camp) ACT.camp();
    };
  }

  // the first look at the save (marks what was already unlocked before this page)
  setTimeout(function () { safe(function () { store(); scanUnlocks(false); }); }, 0);

  return { note: note, open: open, render: render, model: function () { return model(store(), ctxFromSave()); }, bytes: function () { return bytes(store()); },
    flush: flush, analyseLog: analyseLog, core: core, _facts: { solutionFacts: solutionFacts, goalFacts: goalFacts, negUsed: negUsed, showText: showText } };
})();
