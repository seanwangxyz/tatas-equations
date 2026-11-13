'use strict';
// ======================= MATCH MISSIONS + SKILLS PASSPORT (HOUSE FEATURE) =======================
// HOUSE FEATURE: not part of official Equations. At the start of a match Pip offers up to three optional
// missions about HOW he plays (never about speed). A mission is stamped the moment the skill is shown.
// Stamps go into the Skills Passport (Trophy Room). Stars measure breadth: a mission gives its difficulty
// in stars the first 3 times, after that only a "practised" tick. Nothing is ever lost, timed or random:
// a missed mission simply stays available. Settings switch "Match missions" (S.set.missions) hides the
// chips, the card and the end line; the stamps stay.
//
// Three layers:
//   pure (node-testable): CATALOGUE, facts from Solutions/Goals, the match record, checkers, the chooser,
//                         stars, ranks, the cloud-save merge. Needs only Eq (js/engine.js).
//   page:                 Missions.note(event, data) from js/game.js, chips, the start card, the swap.
//   screens:              the Passport screen, matchLineHTML(), parentHTML(), settingsHTML().
// Hooks and snippets: docs/handoff/missions.md. Tests: tests/missions.test.js.
//
// Save (S.missions, compact):
//   { v: 1, n: matches offered, cv: passport cover id, rk: highest rank announced,
//     s: { missionId: [count, 'YYYY-MM-DD' first stamp, creature index or -1, offered, swapped] } }
var Missions = (function () {
  var V = 1;
  var FAMILIES = [
    { id: 'g', name: 'Goals', icon: '🎯' },
    { id: 'o', name: 'Operations', icon: '➗' },
    { id: 'f', name: 'Fractions and negatives', icon: '🍕' },
    { id: 'c', name: 'Challenges', icon: '⚡' },
    { id: 's', name: 'Strategy: Forbidden and Required', icon: '🧠' },
    { id: 'v', name: 'Variation cards', icon: '🃏' },
    { id: 'b', name: 'Bonus items', icon: '🎲' },
    { id: 't', name: 'Three players', icon: '👥' }
  ];
  var FULL = 3; // a mission counts fully this many times, then it is a "practised" tick
  // Ranks (HOUSE FEATURE): fixed, visible rewards, shown in advance. Only existing cosmetics, unlocked early.
  var RANKS = [
    { id: 'ball', name: 'Ball Kid', at: 0, icon: '⚽', reward: { kind: 'cover', id: 'green', name: 'Grass-green passport cover' } },
    { id: 'squad', name: 'Squad Player', at: 12, icon: '👟', reward: { kind: 'victory', id: 'fireworks', name: 'Fireworks celebration (early: normally Level 4)', cover: 'blue' } },
    { id: 'play', name: 'Playmaker', at: 35, icon: '🎯', reward: { kind: 'mat', id: 'ocean', name: 'Underwater mat (early: normally Level 6)' } },
    { id: 'capt', name: 'Captain', at: 70, icon: '©️', reward: { kind: 'skin', id: 'galaxy', name: 'Galaxy cubes (early: normally Level 7)', cover: 'red' } },
    { id: 'star', name: 'Star Striker', at: 120, icon: '🌟', reward: { kind: 'victory', id: 'stars', name: 'Star Shower celebration (early: normally Level 8)' } },
    { id: 'legend', name: 'Legend of the Table', at: 180, icon: '🏆', reward: { kind: 'skin', id: 'gold', name: 'Gold cubes (early: normally Level 10)', cover: 'gold' } }
  ];
  var COVERS = { green: { name: 'Grass green', rank: 'ball' }, blue: { name: 'Sky blue', rank: 'squad' }, red: { name: 'Captain red', rank: 'capt' }, gold: { name: 'Legend gold', rank: 'legend' } };

  // ---- helpers for checkers. A checker gets (M, mine): M = the match record, mine(by) = "is this one of ours?" ----
  function has(list, x) { return !!list && list.indexOf(x) >= 0; }
  function anyOf(list, fn) { for (var i = 0; i < (list || []).length; i++) if (fn(list[i])) return true; return false; }
  function okSol(M, mine, fn) { return anyOf(M.sols, function (s) { return mine(s.by) && s.ok && (!fn || fn(s)); }); }
  function goal(M, mine, fn) { return anyOf(M.goals, function (g) { return mine(g.by) && (!fn || fn(g)); }); }
  function move(M, mine, fn) { return anyOf(M.moves, function (m) { return mine(m.by) && (!fn || fn(m)); }); }
  function rightCall(M, mine, kind) { return anyOf(M.calls, function (c) { return mine(c.by) && c.kind === kind && c.pts[c.by] === 6; }); }
  function shakeWins(M, mine, fn) { return (M.shakes || []).filter(function (s) { return Object.keys(s.pts).some(function (k) { return mine(+k) && s.pts[k] >= 4; }) && (!fn || fn(s)); }).length; }
  function perShake(M, mine, fn) { // the largest number of our moves in one shake that pass fn
    var n = {}; (M.moves || []).forEach(function (m) { if (mine(m.by) && fn(m)) n[m.sh] = (n[m.sh] || 0) + 1; });
    var best = 0; Object.keys(n).forEach(function (k) { if (n[k] > best) best = n[k]; }); return best;
  }

  // ---- THE CATALOGUE: id, family, difficulty 1-5, kid text, a one-line "how" tip, needs, checker ----
  // needs: ops (every one must be in play), fr (fractions on), p3 (three players), card (variation cards can
  // come up), bonus (bonus dice in this match), sh2 (2+ shakes), minus ('-' in play).
  var CATALOGUE = [
    // Goals
    { id: 'g_set', f: 'g', d: 1, t: 'Set a Goal', h: 'When it is your turn to set the Goal, build one from the cubes.', c: function (M, m) { return goal(M, m); } },
    { id: 'g_two', f: 'g', d: 1, t: 'Set a Goal with 2 or more cubes', h: 'Put two cubes together, like 3 and 4 to make 3 + 4.', c: function (M, m) { return goal(M, m, function (g) { return g.cubes >= 2; }); } },
    { id: 'g_minus', f: 'g', d: 1, t: 'Use − in the Goal', h: 'Take away in your Goal: 9 − 2 is a Goal of 7.', need: { minus: 1 }, c: function (M, m) { return goal(M, m, function (g) { return has(g.ops, '-'); }); } },
    { id: 'g_three', f: 'g', d: 2, t: 'Set a Goal with 3 or more cubes', h: 'Longer Goals are harder for the other side to reach.', c: function (M, m) { return goal(M, m, function (g) { return g.cubes >= 3; }); } },
    { id: 'g_big20', f: 'g', d: 2, t: 'Set a Goal bigger than 20', h: 'Try × or two big numbers: 8 × 3 = 24.', c: function (M, m) { return goal(M, m, function (g) { return g.v > 20; }); } },
    { id: 'g_times', f: 'g', d: 2, t: 'Use × in the Goal', h: 'A Goal like 4 × 5 = 20 uses the times cube.', need: { ops: ['*'] }, c: function (M, m) { return goal(M, m, function (g) { return has(g.ops, '*'); }); } },
    { id: 'g_div', f: 'g', d: 3, t: 'Use ÷ in the Goal', h: 'Share it out: 8 ÷ 2 is a Goal of 4.', need: { ops: ['/'] }, c: function (M, m) { return goal(M, m, function (g) { return has(g.ops, '/'); }); } },
    { id: 'g_paren', f: 'g', d: 3, t: 'Use brackets in the Goal', h: 'Brackets go first: (2 + 3) × 4 = 20.', c: function (M, m) { return goal(M, m, function (g) { return g.par; }); } },
    { id: 'g_big50', f: 'g', d: 3, t: 'Set a Goal of 50 or more', h: 'Big numbers times each other make big Goals: 9 × 6 = 54.', c: function (M, m) { return goal(M, m, function (g) { return g.v >= 50; }); } },
    { id: 'g_frac', f: 'g', d: 4, t: 'Set a Goal that is a fraction', h: 'A Goal can be 3 ÷ 4. Can you still make it?', need: { fr: 1, ops: ['/'] }, c: function (M, m) { return goal(M, m, function (g) { return g.frac; }); } },
    { id: 'g_pow', f: 'g', d: 4, t: 'Use ^ in the Goal', h: '2 ^ 3 = 8: powers make a Goal grow.', need: { ops: ['^'] }, c: function (M, m) { return goal(M, m, function (g) { return has(g.ops, '^'); }); } },
    { id: 'g_five', f: 'g', d: 4, t: 'Set a Goal with 5 or more cubes', h: 'A long Goal like 3 + 4 × 2 keeps the other side thinking.', c: function (M, m) { return goal(M, m, function (g) { return g.cubes >= 5; }); } },
    // Operations (a correct Solution that ...)
    { id: 'o_sol', f: 'o', d: 1, t: 'Write a correct Solution', h: 'Call Now!, answer an Impossible! with a Solution, or write one after the last cube.', c: function (M, m) { return okSol(M, m); } },
    { id: 'o_two_ops', f: 'o', d: 2, t: 'Write a Solution with two different operations', h: 'Mix them: 5 + 3 − 1.', c: function (M, m) { return okSol(M, m, function (s) { return s.ops.length >= 2; }); } },
    { id: 'o_pm', f: 'o', d: 2, t: 'Write a Solution that uses + and −', h: 'Add some, take some away: 6 + 4 − 3.', need: { minus: 1 }, c: function (M, m) { return okSol(M, m, function (s) { return has(s.ops, '+') && has(s.ops, '-'); }); } },
    { id: 'o_times', f: 'o', d: 2, t: 'Write a Solution that uses ×', h: '× means groups of: 3 × 4 = 12.', need: { ops: ['*'] }, c: function (M, m) { return okSol(M, m, function (s) { return has(s.ops, '*'); }); } },
    { id: 'o_div', f: 'o', d: 3, t: 'Write a Solution that uses ÷', h: '÷ means share equally: 12 ÷ 3 = 4.', need: { ops: ['/'] }, c: function (M, m) { return okSol(M, m, function (s) { return has(s.ops, '/'); }); } },
    { id: 'o_paren', f: 'o', d: 3, t: 'Write a Solution that uses brackets', h: '(2 + 3) × 4 is not the same as 2 + 3 × 4.', c: function (M, m) { return okSol(M, m, function (s) { return s.par; }); } },
    { id: 'o_five', f: 'o', d: 3, t: 'Write a Solution that uses 5 or more cubes', h: 'Use more of the mat: every cube counts.', c: function (M, m) { return okSol(M, m, function (s) { return s.cubes >= 5; }); } },
    { id: 'o_pow', f: 'o', d: 4, t: 'Write a Solution that uses ^', h: '2 ^ 3 = 2 × 2 × 2 = 8.', need: { ops: ['^'] }, c: function (M, m) { return okSol(M, m, function (s) { return has(s.ops, '^'); }); } },
    { id: 'o_root', f: 'o', d: 4, t: 'Write a Solution that uses √', h: '√9 = 3, because 3 × 3 = 9.', need: { ops: ['r'] }, c: function (M, m) { return okSol(M, m, function (s) { return has(s.ops, 'r'); }); } },
    { id: 'o_all4', f: 'o', d: 5, t: 'Write a Solution with + − × and ÷ all in it', h: 'A long one: 8 ÷ 2 × 3 + 1 − 4.', need: { ops: ['*', '/'], minus: 1 }, c: function (M, m) { return okSol(M, m, function (s) { return ['+', '-', '*', '/'].every(function (o) { return has(s.ops, o); }); }); } },
    { id: 'o_seven', f: 'o', d: 5, t: 'Write a Solution that uses 7 or more cubes', h: 'A mega Solution: put lots of cubes to work.', c: function (M, m) { return okSol(M, m, function (s) { return s.cubes >= 7; }); } },
    // Fractions and negatives
    { id: 'f_zero', f: 'f', d: 2, t: 'Write a Solution that uses a 0 cube', h: 'Anything × 0 is 0, and 5 + 0 is still 5.', c: function (M, m) { return okSol(M, m, function (s) { return s.zero; }); } },
    { id: 'f_frac', f: 'f', d: 3, t: 'Write a Solution with a fraction in the middle', h: '1 ÷ 2 + 1 ÷ 2 = 1: halves can add up to whole numbers.', need: { fr: 1, ops: ['/'] }, c: function (M, m) { return okSol(M, m, function (s) { return s.frac; }); } },
    { id: 'f_neg', f: 'f', d: 4, t: 'Write a Solution that goes below zero on the way', h: '(2 − 5) + 9 = 6: it dips below zero, then comes back.', need: { minus: 1 }, c: function (M, m) { return okSol(M, m, function (s) { return s.neg; }); } },
    { id: 'f_fracgoal', f: 'f', d: 4, t: 'Write a Solution for a Goal that is a fraction', h: 'If the Goal is 1 ÷ 2, find another way to make one half.', need: { fr: 1, ops: ['/'] }, c: function (M, m) { return okSol(M, m, function (s) { return s.gfrac; }); } },
    { id: 'f_frac_neg', f: 'f', d: 5, t: 'Write a Solution with a fraction AND below zero', h: 'Both at once: (1 − 4) ÷ 2 + 5 = 3½.', need: { fr: 1, ops: ['/'], minus: 1 }, c: function (M, m) { return okSol(M, m, function (s) { return s.frac && s.neg; }); } },
    // Challenges
    { id: 'c_nohint', f: 'c', d: 2, t: 'Score 4 or more in a shake without a hint', h: 'Trust your own eyes this shake: no Hint button.', c: function (M, m) { return shakeWins(M, m, function (s) { return !s.hint; }) >= 1; } },
    { id: 'c_last', f: 'c', d: 2, t: 'Write a correct Solution after the last cube', h: 'When the last cube is played, everybody writes one.', c: function (M, m) { return okSol(M, m, function (s) { return s.mode === 'last'; }); } },
    { id: 'c_now', f: 'c', d: 3, t: 'Call Now! and be right', h: 'After a move, look: can the mat plus ONE more cube make the Goal?', c: function (M, m) { return rightCall(M, m, 'now'); } },
    { id: 'c_defend', f: 'c', d: 3, t: 'Someone calls Impossible! on you: write a Solution', h: 'Only make moves you can still solve. Then prove it!', c: function (M, m) { return okSol(M, m, function (s) { return s.mode === 'impossible' && s.role === 'w'; }); } },
    { id: 'c_twoshakes', f: 'c', d: 3, t: 'Score 4 or more in two shakes without a hint', h: 'Two good shakes, all by yourself.', need: { sh2: 1 }, c: function (M, m) { return shakeWins(M, m, function (s) { return !s.hint; }) >= 2; } },
    { id: 'c_imp', f: 'c', d: 4, t: 'Call Impossible! and be right', h: 'If no Solution can be made any more, say so!', c: function (M, m) { return rightCall(M, m, 'impossible'); } },
    { id: 'c_nowfail', f: 'c', d: 4, t: 'Someone calls Now! on your move and can\'t do it', h: 'Leave the mat so that one more cube is never enough.', c: function (M, m) { return anyOf(M.calls, function (c) { return c.kind === 'now' && m(c.mover) && !m(c.by) && (c.pts[c.mover] || 0) >= 4; }); } },
    // Strategy: Forbidden and Required
    { id: 's_required', f: 's', d: 1, t: 'Put a cube in Required', h: 'Required cubes MUST be used in every Solution.', c: function (M, m) { return move(M, m, function (x) { return x.zone === 'required'; }); } },
    { id: 's_forbid_op', f: 's', d: 1, t: 'Put an operation cube in Forbidden', h: 'Take away a sign the other side wanted.', c: function (M, m) { return move(M, m, function (x) { return x.zone === 'forbidden' && x.op; }); } },
    { id: 's_forbid_num', f: 's', d: 1, t: 'Put a number cube in Forbidden', h: 'A number nobody may use any more.', c: function (M, m) { return move(M, m, function (x) { return x.zone === 'forbidden' && !x.op; }); } },
    { id: 's_forbid3', f: 's', d: 2, t: 'Put 3 cubes in Forbidden in one shake', h: 'Forbidden keeps the mat small and safe.', c: function (M, m) { return perShake(M, m, function (x) { return x.zone === 'forbidden'; }) >= 3; } },
    { id: 's_req_used', f: 's', d: 3, t: 'Put a cube in Required, then use it in your correct Solution', h: 'Plan ahead: Require a cube you know how to use.', c: function (M, m) { return okSol(M, m, function (s) { return s.myReq; }); } },
    { id: 's_three', f: 's', d: 3, t: 'Make 3 moves in one shake, then score 4 or more', h: 'Safe moves first: do not hand the other side a Now!.', c: function (M, m) { return anyOf(M.shakes, function (s) { return Object.keys(s.pts).some(function (k) { return m(+k) && s.pts[k] >= 4 && (s.mv[k] || 0) >= 3; }); }); } },
    // Variation cards
    { id: 'v_goal', f: 'v', d: 2, t: 'Set a Goal while a variation card is in play', h: 'When you set the Goal, you may pick a card first.', need: { card: 1 }, c: function (M, m) { return goal(M, m, function (g) { return !!g.card; }); } },
    { id: 'v_play', f: 'v', d: 2, t: 'Write a correct Solution while a variation card is in play', h: 'Read the card, then solve with its rule in mind.', need: { card: 1 }, c: function (M, m) { return okSol(M, m, function (s) { return !!s.card; }); } },
    { id: 'v_power', f: 'v', d: 4, t: 'Use the variation card\'s power in a Solution', h: 'Make the card do the work: a Solution that only works with its rule.', need: { card: 1 }, c: function (M, m) { return okSol(M, m, function (s) { return s.vp; }); } },
    // Bonus items (HOUSE RULE dice)
    { id: 'b_forbid', f: 'b', d: 2, t: 'Put a bonus cube in Forbidden', h: 'A bonus cube can be Forbidden like any other.', need: { bonus: 1 }, c: function (M, m) { return move(M, m, function (x) { return x.zone === 'forbidden' && x.bonus; }); } },
    { id: 'b_goal', f: 'b', d: 3, t: 'Put a bonus cube in your Goal', h: 'A bonus cube in the Goal makes a surprising number.', need: { bonus: 1 }, c: function (M, m) { return goal(M, m, function (g) { return g.bonus; }); } },
    { id: 'b_use', f: 'b', d: 3, t: 'Use a bonus cube in a correct Solution', h: 'Read its face, then make it part of your Solution.', need: { bonus: 1 }, c: function (M, m) { return okSol(M, m, function (s) { return s.bonus; }); } },
    // Three players
    { id: 't_goal3', f: 't', d: 2, t: 'Set a Goal with 3 or more cubes at a table of three', h: 'Two players will try to reach it: make it a good one.', need: { p3: 1 }, c: function (M, m) { return M.np >= 3 && goal(M, m, function (g) { return g.cubes >= 3; }); } },
    { id: 't_last3', f: 't', d: 3, t: 'Write a correct Solution after the last cube at a table of three', h: 'Everyone writes one: make yours count.', need: { p3: 1 }, c: function (M, m) { return M.np >= 3 && okSol(M, m, function (s) { return s.mode === 'last'; }); } },
    { id: 't_third', f: 't', d: 4, t: 'Be the Third Party who writes a correct Solution', h: 'When two others argue, you may write one too: 4 or 6 points!', need: { p3: 1 }, c: function (M, m) { return okSol(M, m, function (s) { return s.role === 'tp'; }); } },
    { id: 't_call3', f: 't', d: 4, t: 'Challenge at a table of three and be right', h: 'You can challenge any move, even when it is not your turn.', need: { p3: 1 }, c: function (M, m) { return M.np >= 3 && (rightCall(M, m, 'now') || rightCall(M, m, 'impossible')); } }
  ];
  var BY_ID = {}; CATALOGUE.forEach(function (x) { BY_ID[x.id] = x; });
  function fam(id) { for (var i = 0; i < FAMILIES.length; i++) if (FAMILIES[i].id === id) return FAMILIES[i]; return null; }
  // Training Camp drill that practises each family (js/camp.js DRILLS ids), for the parent page
  var DRILL = { g: 'goal', o: 'make', f: 'make', c: 'now', s: 'safe', t: 'now' };
  var DRILL_BY_ID = { c_imp: 'imp', c_defend: 'safe', c_nowfail: 'safe', c_last: 'make', c_nohint: 'make', c_twoshakes: 'make', t_last3: 'make', t_third: 'make', t_goal3: 'goal' };
  var DRILL_NAME = { make: 'Make the Goal', now: 'Now or not yet?', imp: 'Impossible detective', safe: 'Safe move', goal: 'Set a sneaky Goal' };
  function drillFor(id) { var x = BY_ID[id]; return x ? (DRILL_BY_ID[id] || DRILL[x.f] || null) : null; }

  // Opponent personality -> wildcard missions, best first (creature ids from js/config.js)
  var PERSONA = {
    snoozy: ['c_defend', 'o_five', 'o_paren'],         // Snoozy only sees short Solutions and calls Impossible! too soon
    penny: ['c_imp', 's_forbid_op', 'g_three'],        // Penny never calls Impossible!
    fox: ['o_div', 'o_times', 'c_nowfail'],            // Rusty loves × and ÷ and pounces on Now!
    owl: ['s_three', 'g_big20', 'o_paren'],            // Ollie: plan two moves ahead
    wizard: ['o_pow', 'o_root', 'g_pow', 'c_nohint'],  // Mondo: powers and roots
    grub: ['g_big20', 'g_big50', 'o_five'],            // Grub: big numbers
    splosh: ['c_now', 's_req_used', 'g_two'],          // Splosh: a Now! she is not expecting
    blaze: ['c_nowfail', 's_three', 's_forbid3'],      // Blaze never misses a Now!
    hex: ['f_frac', 'o_div', 'g_frac'],                // Hex: ÷ and fractions
    zog: ['c_imp', 'g_five', 'o_seven'],               // King Messy: the longest Goals
    bleep: ['v_power', 'v_play', 'o_two_ops'],         // Use It Again card
    flip: ['f_neg', 'v_power', 'o_pm'],                // Upside-down card, below zero
    squiggle: ['v_power', 'o_two_ops', 'g_two'],       // Base 8 card
    nugget: ['b_use', 'b_goal', 'o_pow'],              // the gold Power die
    chroma: ['v_power', 'v_goal', 'g_five']            // a different card every shake
  };

  // ======================= FACTS (pure; need Eq) =======================
  function symOf(t) { return typeof t === 'string' ? t : (t && t.s); }
  function isParen(s) { return s === '(' || s === ')'; }
  function isNum(s) { return Eq.isNumSym ? Eq.isNumSym(s) : Eq.isDigit(s); }
  function isBonusCube(t, cubes) { var c = t && typeof t === 'object' && t.id != null && cubes ? cubes[t.id] : null; return !!(c && (c.color === 'power' || c.color === 'big')) || !!(Eq.isBonusOp && Eq.isBonusOp(symOf(t))); }
  // Does some part of the Solution come out below zero on the way? (same idea as the parent page)
  function negUsed(syms, fr) {
    var s = syms || [];
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
  function opsIn(tokens) {
    var out = []; (tokens || []).forEach(function (t) { var s = symOf(t); if (typeof t === 'object' && Eq.OPS.indexOf(s) >= 0 && out.indexOf(s) < 0) out.push(s); });
    return out;
  }
  // x: { by, mode, role, ok, tokens, chk, cubes, fr, goal {n,d}, card, req: [cube ids he put in Required this shake] }
  function solFacts(x) {
    var toks = x.tokens || [], syms = toks.map(symOf), cubeToks = toks.filter(function (t) { return t && typeof t === 'object'; });
    var ok = !!x.ok, f = { by: x.by, mode: x.mode, role: x.role, ok: ok, ops: opsIn(toks), cubes: cubeToks.length, par: syms.indexOf('(') >= 0 };
    var frac = !!(x.chk && x.chk.madeFraction);
    if (!x.chk && ok) { try { var e0 = Eq.evaluate(syms, { fractions: x.fr }); frac = !!(e0.ok && e0.madeFraction); } catch (e) { frac = false; } }
    f.frac = ok && frac;
    f.neg = ok && negUsed(syms, Eq.fracOn ? Eq.fracOn(x.fr) : !!x.fr);
    f.zero = cubeToks.some(function (t) { return t.s === '0'; });
    f.bonus = cubeToks.some(function (t) { return isBonusCube(t, x.cubes); });
    f.card = x.card || null;
    f.gfrac = !!(x.goal && x.goal.d !== 1);
    var req = x.req || [];
    f.myReq = ok && cubeToks.some(function (t) { return t.id != null && req.indexOf(t.id) >= 0; });
    // The card's power: a correct Solution with a card in play that the plain rules would NOT accept
    // (a turned or glued number, a cube used twice, a wild 0 ...). Three Operations is a rule about the
    // Solution itself, so any correct Solution under it counts.
    var vp = false;
    if (ok && f.card) {
      var ids = cubeToks.map(function (t) { return t.id; }), dup = ids.some(function (id, k) { return id != null && ids.indexOf(id) !== k; });
      if (f.card === 'threeops' || dup) vp = true;
      else {
        var plain = null; try { plain = Eq.evaluate(syms, { fractions: Eq.fracOn ? Eq.fracOn(x.fr) : !!x.fr }); } catch (e) { plain = null; }
        vp = !(plain && plain.ok && x.goal && Eq.eqF(plain.value, x.goal));
      }
    }
    f.vp = vp;
    return f;
  }
  // x: { by, tokens, val {n,d}, cubes, card }
  function goalFacts(x) {
    var toks = x.tokens || [], cubeToks = toks.filter(function (t) { return t && typeof t === 'object'; }), v = x.val || { n: 0, d: 1 };
    return { by: x.by, cubes: cubeToks.length, ops: opsIn(toks), par: toks.some(function (t) { return t === '('; }), v: v.n / (v.d || 1), frac: v.d !== 1,
      bonus: cubeToks.some(function (t) { return isBonusCube(t, x.cubes); }), card: x.card || null };
  }

  // ======================= THE MATCH RECORD (pure) =======================
  function newRecord(np) { return { np: np || 2, sh: 0, goals: [], moves: [], calls: [], sols: [], shakes: [], pend: null, cur: { req: {}, mv: {} } }; }
  // Events (plain data, so tests can feed synthetic matches):
  //   'goal'      { by, tokens, val, cubes, card, shake }
  //   'move'      { by, id, s, zone, bonus }
  //   'challenge' { by, kind, mover, tp }
  //   'shake'     { phase: G.phase at the start of endShake, pts, sols: { i: {ok, tokens, chk} }, hint, cubes, fr, goal, card }
  function apply(M, ev, x) {
    if (!M || !x) return M;
    if (ev === 'goal') {
      M.sh = x.shake || (M.sh + 1); M.cur = { req: {}, mv: {} }; M.pend = null;
      M.goals.push(goalFacts(x)); M.goals[M.goals.length - 1].sh = M.sh;
    } else if (ev === 'move') {
      M.moves.push({ by: x.by, s: x.s, zone: x.zone, op: !isNum(x.s) && !isParen(x.s), bonus: !!x.bonus, sh: M.sh });
      M.cur.mv[x.by] = (M.cur.mv[x.by] || 0) + 1;
      if (x.zone === 'required') (M.cur.req[x.by] = M.cur.req[x.by] || []).push(x.id);
    } else if (ev === 'challenge') {
      M.pend = { by: x.by, kind: x.kind, mover: x.mover, tp: x.tp == null ? null : x.tp };
    } else if (ev === 'shake') {
      var pts = {}; Object.keys(x.pts || {}).forEach(function (k) { pts[k] = +x.pts[k] || 0; });
      var sols = x.sols || {}, base = { cubes: x.cubes, fr: x.fr, goal: x.goal, card: x.card };
      var add = function (i, mode, role) {
        var s = sols[i]; if (!s) return;
        M.sols.push(solFacts({ by: +i, mode: mode, role: role, ok: s.ok, tokens: s.tokens, chk: s.chk, cubes: base.cubes, fr: base.fr, goal: base.goal, card: base.card, req: M.cur.req[i] || [] }));
      };
      if (x.phase === 'challenge' && M.pend) {
        var p = M.pend;
        M.calls.push({ by: p.by, kind: p.kind, mover: p.mover, tp: p.tp, pts: pts });
        add(p.kind === 'now' ? p.by : p.mover, p.kind, 'w');
        if (p.tp != null) add(p.tp, p.kind, 'tp');
      } else if (x.phase === 'lastwrite') Object.keys(sols).forEach(function (i) { add(i, 'last', 'last'); });
      else Object.keys(sols).forEach(function (i) { add(i, 'free', 'free'); });
      var mv = {}; Object.keys(M.cur.mv).forEach(function (k) { mv[k] = M.cur.mv[k]; });
      M.shakes.push({ sh: M.sh, pts: pts, hint: !!x.hint, mv: mv });
      M.pend = null;
    }
    return M;
  }
  function check(id, M, mine) { var x = BY_ID[id]; if (!x || !M) return false; try { return !!x.c(M, mine || function (by) { return by === 0; }); } catch (e) { return false; } }

  // ======================= CHOOSING (pure, deterministic: seeded by the match number) =======================
  // ctx: { mode, ops: [...], fr, np, cards, bonus, shakes, oppId, sig: 'card'|'bonus'|null }
  var MODES = ['ai', 'ai3', 'team', 'tourney', 'p3', 'pvp'];
  var FAMILY_MODES = ['p3', 'pvp'];
  function available(x, ctx) {
    var n = x.need || {};
    if (n.ops && !n.ops.every(function (o) { return has(ctx.ops, o); })) return false;
    if (n.minus && !has(ctx.ops, '-')) return false;
    if (n.fr && !ctx.fr) return false;
    if (n.p3 && !(ctx.np >= 3)) return false;
    if (n.card && !ctx.cards) return false;
    if (n.bonus && !ctx.bonus) return false;
    if (n.sh2 && !(ctx.shakes >= 2)) return false;
    return true;
  }
  function rng(seed) { var a = (seed * 2654435761) >>> 0 || 1; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function seededOrder(list, seed) { var r = rng(seed), a = list.map(function (x) { return { x: x, k: r() }; }); a.sort(function (p, q) { return p.k - q.k; }); return a.map(function (p) { return p.x; }); }
  function cnt(save, id) { var e = save && save.s && save.s[id]; return Array.isArray(e) ? (+e[0] || 0) : 0; }
  // "He has shown this before" from what the game already saved (so a brand-new passport still knows him).
  function bootSeen(S0) {
    var out = {}; if (!S0) return out;
    var st = S0.stats || {}, ou = S0.opsUsed || {}, b = S0.badges || {};
    var add = function (id, on) { if (on) out[id] = 1; };
    add('g_set', st.goalsSet > 0); add('o_sol', st.correct > 0); add('c_now', st.nowWins > 0); add('c_imp', st.impWins > 0);
    add('o_times', ou['*'] > 0); add('o_div', ou['/'] > 0); add('o_pow', ou['^'] > 0); add('o_root', ou.r > 0);
    add('f_frac', st.fractionSolutions > 0); add('o_five', !!b.big); add('o_seven', !!b.mega); add('c_last', !!b.last);
    add('c_defend', !!b.defend); add('o_all4', !!b.all4); add('f_zero', !!b.zero); add('c_nohint', !!b.nohint);
    return out;
  }
  function doneBefore(save, boot, id) { return cnt(save, id) > 0 || !!(boot && boot[id]); }
  // Returns up to three { id, role: 'comfy' | 'stretch' | 'wild' }, every one from a different skill family.
  function choose(ctx, save, seed, boot) {
    var av = CATALOGUE.filter(function (x) { return available(x, ctx); }), picked = [], fams = {};
    if (!av.length) return [];
    var take = function (x, role) { picked.push({ id: x.id, role: role }); fams[x.f] = 1; };
    var free = function (x) { return !fams[x.f] && !picked.some(function (p) { return p.id === x.id; }); };
    var done = av.filter(function (x) { return doneBefore(save, boot, x.id); });
    var L = 1; done.forEach(function (x) { if (x.d > L) L = x.d; });
    // 1. comfortable: something he has done before, still earning stars first
    var comfy = seededOrder(done, seed * 3 + 1).sort(function (a, b) { return (cnt(save, a.id) >= FULL) - (cnt(save, b.id) >= FULL) || a.d - b.d; });
    if (!comfy.length) comfy = seededOrder(av.filter(function (x) { return x.d === 1; }), seed * 3 + 1);
    if (comfy.length) take(comfy[0], 'comfy');
    // 2. stretch: the next skill he has never shown (then rarely), close to one step above his best
    var target = Math.min(5, L + 1);
    var pool = av.filter(function (x) { return free(x) && !doneBefore(save, boot, x.id); });
    if (!pool.length) pool = av.filter(function (x) { return free(x) && cnt(save, x.id) <= 1; });
    if (!pool.length) pool = av.filter(free);
    pool = seededOrder(pool, seed * 3 + 2).sort(function (a, b) { return Math.abs(a.d - target) - Math.abs(b.d - target) || a.d - b.d; });
    if (pool.length) take(pool[0], 'stretch');
    // 3. wildcard: the opponent's personality, this match's card or bonus dice, three players
    var ids = [];
    if (ctx.sig === 'bonus') ids.push('b_use', 'b_goal');
    if (ctx.sig === 'card') ids.push('v_power', 'v_play');
    ids = ids.concat(PERSONA[ctx.oppId] || []);
    if (ctx.np >= 3) ids.push('t_third', 't_call3', 't_last3', 't_goal3');
    if (ctx.bonus) ids.push('b_use', 'b_goal', 'b_forbid');
    if (ctx.cards) ids.push(L >= 3 ? 'v_power' : 'v_play', 'v_goal');
    var wild = ids.map(function (id) { return BY_ID[id]; }).filter(function (x, k, arr) { return x && arr.indexOf(x) === k && available(x, ctx) && free(x); });
    wild.sort(function (a, b) { return (cnt(save, a.id) >= FULL) - (cnt(save, b.id) >= FULL); });
    if (wild.length) take(wild[seed % Math.min(2, wild.length)], 'wild');
    else {
      var any = seededOrder(av.filter(free), seed * 3 + 3).sort(function (a, b) { return (cnt(save, a.id) >= FULL) - (cnt(save, b.id) >= FULL); });
      if (any.length) take(any[0], 'wild');
    }
    return picked;
  }
  // "Not today": another mission of the same difficulty (else the nearest), from a family none of the others use.
  function swapFor(ctx, save, list, idx, seed, avoid) {
    var cur = BY_ID[list[idx].id]; if (!cur) return null;
    var others = list.filter(function (p, k) { return k !== idx; }).map(function (p) { return BY_ID[p.id]; });
    var pool = CATALOGUE.filter(function (x) {
      return available(x, ctx) && x.id !== cur.id && !(avoid && avoid.indexOf(x.id) >= 0) && !others.some(function (o) { return o && (o.id === x.id || o.f === x.f); });
    });
    pool = seededOrder(pool, seed * 7 + idx).sort(function (a, b) { return Math.abs(a.d - cur.d) - Math.abs(b.d - cur.d) || (cnt(save, a.id) >= FULL) - (cnt(save, b.id) >= FULL); });
    return pool.length ? { id: pool[0].id, role: list[idx].role } : null;
  }

  // ======================= SAVE, STARS, RANKS (pure over a save object) =======================
  function blank() { return { v: V, n: 0, s: {} }; }
  function normalize(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) m = blank();
    if (!m.s || typeof m.s !== 'object' || Array.isArray(m.s)) m.s = {};
    m.v = V; m.n = +m.n || 0;
    Object.keys(m.s).forEach(function (id) { var e = m.s[id]; if (!Array.isArray(e)) { delete m.s[id]; return; } while (e.length < 5) e.push(e.length === 1 ? '' : e.length === 2 ? -1 : 0); });
    return m;
  }
  function entry(m, id) { var e = m.s[id]; if (!Array.isArray(e)) e = m.s[id] = [0, '', -1, 0, 0]; return e; }
  function starsFor(d, count) { return d * Math.min(count, FULL); }
  function totalStars(m) {
    var t = 0; Object.keys((m && m.s) || {}).forEach(function (id) { var x = BY_ID[id]; if (x) t += starsFor(x.d, cnt(m, id)); });
    return t;
  }
  function maxStars() { return CATALOGUE.reduce(function (t, x) { return t + starsFor(x.d, FULL); }, 0); }
  function rankIdx(stars) { var k = 0; RANKS.forEach(function (r, i) { if (stars >= r.at) k = i; }); return k; }
  // A mission shown in a match: count it, stamp the first one with the date and the creature.
  // Returns { stars: what it gave now, first: a brand-new stamp, practised: past the full-star times }
  function award(m, id, day, creature) {
    var x = BY_ID[id]; if (!x) return { stars: 0, first: false, practised: false };
    var e = entry(m, id); e[0] = (+e[0] || 0) + 1;
    if (e[0] === 1 || !e[1]) { e[1] = day || ''; e[2] = creature == null ? -1 : creature; }
    return { stars: e[0] <= FULL ? x.d : 0, first: e[0] === 1, practised: e[0] > FULL };
  }
  function offered(m, id) { entry(m, id)[3]++; }
  function swapped(m, id) { entry(m, id)[4]++; }
  // Rewards reached: cosmetics opened early and passport covers.
  function rewardsAt(stars) { return RANKS.filter(function (r) { return stars >= r.at; }).map(function (r) { return r.reward; }); }
  function cosmeticOpenAt(stars, kind, id) { return rewardsAt(stars).some(function (w) { return w.kind === kind && w.id === id; }); }
  function coversAt(stars) { var out = []; rewardsAt(stars).forEach(function (w) { var c = w.kind === 'cover' ? w.id : w.cover; if (c && out.indexOf(c) < 0) out.push(c); }); return out; }

  // ======================= CLOUD-SAVE MERGE (also pasted into js/account.js RULES) =======================
  // Stamps: union. Count, offered, swapped: highest. First-stamp date: the earliest (with its creature).
  // n and rk: highest. cv (cover picked): the newer device.
  /*MISSIONS-MERGE-START*/
  function missionsMerge(a, b, c) {
    var isO = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
    var cp = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
    if (!isO(a)) return cp(b); if (!isO(b)) return cp(a);
    var newer = c && c.newer === 'a' ? a : b, older = newer === a ? b : a;
    var out = { v: Math.max(+a.v || 0, +b.v || 0) || 1, n: Math.max(+a.n || 0, +b.n || 0), s: {} };
    if (a.rk !== undefined || b.rk !== undefined) out.rk = Math.max(+a.rk || 0, +b.rk || 0);
    var cv = newer.cv !== undefined ? newer.cv : older.cv; if (cv !== undefined) out.cv = cp(cv);
    var sa = isO(a.s) ? a.s : {}, sb = isO(b.s) ? b.s : {};
    Object.keys(sa).concat(Object.keys(sb)).forEach(function (id) {
      if (id in out.s) return;
      var x = sa[id], y = sb[id];
      if (!Array.isArray(x) || !Array.isArray(y)) { out.s[id] = cp(Array.isArray(x) ? x : y); return; }
      var dx = String(x[1] || ''), dy = String(y[1] || ''), cx = x[2] == null ? -1 : +x[2], cy = y[2] == null ? -1 : +y[2];
      var useX = dx && dy ? (dx < dy || (dx === dy && cx <= cy)) : dx ? true : dy ? false : cx <= cy; // earliest day; same day: the lower creature number, so the merge is symmetric
      var first = useX ? x : y;
      out.s[id] = [Math.max(+x[0] || 0, +y[0] || 0), first[1] || '', first[2] == null ? -1 : first[2], Math.max(+x[3] || 0, +y[3] || 0), Math.max(+x[4] || 0, +y[4] || 0)];
    });
    return out;
  }
  /*MISSIONS-MERGE-END*/

  // ======================= PAGE SIDE: the live match =======================
  var PAGE = typeof window !== 'undefined' && typeof document !== 'undefined';
  var A = null; // this match: { g, ctx, n, opp, family, list: [{ id, role, done, by, stars, first, practised, just }], swapUsed, seen, rec, cardShown, flash, rank0 }
  function hasS() { return typeof S !== 'undefined' && !!S; }
  function on() { return hasS() && !!S.set && S.set.missions !== false; }
  function store() { if (!hasS()) return blank(); S.missions = normalize(S.missions); return S.missions; }
  function save() { if (typeof persist === 'function') persist(); }
  function dayNow() { return typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10); }
  function oppList() { return typeof OPPONENTS !== 'undefined' ? OPPONENTS : []; }
  function firstAIIdx(g) { for (var i = 0; i < g.players.length; i++) if (g.players[i].ai) return oppList().indexOf(g.players[i].ai); return -1; }
  function ctxOf(g) {
    var st = typeof stageInfo === 'function' ? stageInfo() : { ops: Eq.OPS.slice(), fractions: true };
    var oi = firstAIIdx(g), o = oi >= 0 ? oppList()[oi] : null, sg = g.sig && g.sig.s ? g.sig.s : null;
    var sigCard = !!(sg && (sg.kind === 'card' || sg.kind === 'shuffle') && !sg.light), sigBonus = !!(sg && sg.kind === 'bonus');
    var cards = !!(PAGE && window.Vari && Vari.unlockedCount && Vari.unlockedCount() > 0 && S.set.variations !== false && g.mode !== 'tourney') || sigCard;
    var bonus = false;
    try { bonus = !!(PAGE && window.Bonus && Bonus.activeFor(g) && (Bonus.dieOn('big') || Bonus.dieOn('power'))) || sigBonus; } catch (e) { bonus = sigBonus; }
    return { mode: g.mode, ops: (st.ops || []).slice(), fr: g.mode === 'tourney' ? true : !!st.fractions, np: g.players.length, shakes: g.shakes || 3,
      cards: cards, bonus: bonus, oppId: o ? o.id : null, sig: sigBonus ? 'bonus' : sigCard ? 'card' : null };
  }
  function eligible(g) { return !!g && MODES.indexOf(g.mode) >= 0 && g.players && g.players[0] && !g.players[0].ai; }
  function start(g) {
    A = null; closeOv();
    if (!on() || !eligible(g)) return;
    var m = store(), ctx = ctxOf(g); m.n++;
    var list = choose(ctx, m, m.n, bootSeen(S));
    list.forEach(function (p) { offered(m, p.id); });
    save();
    A = { g: g, ctx: ctx, n: m.n, opp: firstAIIdx(g), family: FAMILY_MODES.indexOf(g.mode) >= 0, swapUsed: false, cardShown: false, flash: '',
      list: list.map(function (p) { return { id: p.id, role: p.role, done: false, by: null, stars: 0, first: false, practised: false, just: false }; }),
      seen: list.map(function (p) { return p.id; }), rec: newRecord(g.players.length), rank0: rankIdx(totalStars(m)) };
  }
  function live() { return !!A && on() && typeof G !== 'undefined' && A.g === G; }
  function humanIdx(g) { return g.players.map(function (p, i) { return p.ai ? -1 : i; }).filter(function (i) { return i >= 0; }); }
  // Run the checkers for the missions not done yet. A stamp lands once, the moment the skill is shown.
  function evaluate() {
    if (!live()) return;
    var m = store(), news = [];
    A.list.forEach(function (it) {
      if (it.done) return;
      if (check(it.id, A.rec, function (by) { return by === 0; })) {
        var r = award(m, it.id, dayNow(), A.opp);
        it.done = true; it.by = 0; it.stars = r.stars; it.first = r.first; it.practised = r.practised; it.just = true; news.push(it);
      } else if (A.family) {
        var who = humanIdx(A.g).filter(function (i) { return i !== 0 && check(it.id, A.rec, function (by) { return by === i; }); })[0];
        if (who !== undefined) { it.done = true; it.by = who; it.just = true; news.push(it); } // a family helper did it: a team tick, no stars (stars are his own skill)
      }
    });
    if (!news.length) return;
    save();
    var it = news[0], x = BY_ID[it.id], rk = rankIdx(totalStars(m));
    if (it.by === 0) A.flash = (it.first ? 'New stamp! ' : it.practised ? 'Practised! ' : 'Stamp! ') + x.t + (it.stars ? ' ' + starStr(it.stars) : '');
    else A.flash = esc0(A.g.players[it.by].name) + ' did one: ' + x.t + '. Team tick!';
    if (rk > A.rank0 && rk > (+m.rk || 0)) { m.rk = rk; save(); A.flash += ' New rank: ' + RANKS[rk].name + '!'; }
    if (PAGE && window.Snd && Snd.pop) { try { Snd.pop(); } catch (e) {} }
    refreshChips();
  }
  function esc0(s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"']/g, ''); }
  function starStr(n) { return n > 6 ? '⭐×' + n : new Array(n + 1).join('⭐'); }
  // game.js hooks (see docs/handoff/missions.md for where each one goes)
  function note(ev, x) {
    try {
      if (ev === 'start') { start(x && x.g); return; }
      if (!live() || !x || x.g !== A.g) return;
      var g = A.g;
      if (ev === 'goal') apply(A.rec, 'goal', { by: g.setter, tokens: x.tokens, val: x.val, cubes: g.cubes, card: g.vari || null, shake: g.shake });
      else if (ev === 'move') { var c = g.cubes[x.id]; apply(A.rec, 'move', { by: x.by, id: x.id, s: c ? c.s : '?', zone: x.zone, bonus: !!c && (c.color === 'power' || c.color === 'big') }); }
      else if (ev === 'challenge') {
        var mover = g.lastMover, tp = null;
        if (g.players.length >= 3) for (var i = 0; i < g.players.length; i++) if (i !== x.by && i !== mover) { tp = i; break; }
        apply(A.rec, 'challenge', { by: x.by, kind: x.kind, mover: mover, tp: tp });
      } else if (ev === 'shake') {
        closeOv(); // a start card or tip still open would sit on top of the shake's result pop-up
        var r = x.r || {};
        apply(A.rec, 'shake', { phase: x.phase || g.phase, pts: r.pts, sols: r.sols, hint: !!g.hintUsed, cubes: g.cubes, fr: g.fractions, goal: g.goal, card: g.vari || null });
      } else if (ev === 'end') { closeOv(); A.ended = true; save(); return; }
      evaluate();
    } catch (e) { if (typeof console !== 'undefined') console.warn('[missions]', e); } // never get in the way of the game
  }

  // ======================= CHIPS, THE START CARD, THE TIP, THE SWAP =======================
  var ROLE = { comfy: 'Warm-up', stretch: 'Stretch', wild: 'Wildcard' };
  function dots(d) { var s = ''; for (var i = 1; i <= 5; i++) s += '<i class="' + (i <= d ? 'on' : '') + '"></i>'; return '<span class="msn-dots" aria-label="difficulty ' + d + ' of 5">' + s + '</span>'; }
  function chipHTML(it, k) {
    var x = BY_ID[it.id], f = fam(x.f);
    var cls = 'msn-chip' + (it.done ? ' done' : '') + (it.just ? ' just' : '') + (it.done && it.by !== 0 ? ' helper' : '');
    var label = esc0(x.t) + (it.done ? (it.by === 0 ? ': stamped' : ': done by ' + esc0(A.g.players[it.by].name)) : ': tap for a tip');
    return '<button type="button" class="' + cls + '" data-act="msnTip" data-arg="' + k + '" aria-label="' + label + '"><span class="msn-ic" aria-hidden="true">' + f.icon + '</span><span class="msn-t">' + esc0(x.t) + '</span>' +
      (it.done ? '<span class="msn-stamp" aria-hidden="true">' + (it.by === 0 ? '✔' : '🤝') + '</span>' : '') + '</button>';
  }
  // Where the lead places it: the side column on wide windows, above the action bar otherwise.
  function chipsHTML() {
    if (!live() || !A.list.length) return '';
    var g = A.g;
    if (!A.cardShown && g.phase !== 'roll' && !g.rolling) { A.cardShown = true; setTimeout(function () { if (live()) showCard(); }, 0); }
    var html = '<div id="msnChips" class="msn-chips" role="group" aria-label="Pip\'s missions for this match"><span class="msn-head">Missions</span>' + A.list.map(chipHTML).join('') +
      (A.flash ? '<span class="msn-flash" role="status">' + A.flash + '</span>' : '') + '</div>';
    A.list.forEach(function (it) { it.just = false; }); // the stamp animation plays once, in this one render
    return html;
  }
  function refreshChips() {
    if (!PAGE) return;
    var el = document.getElementById('msnChips'); if (!el) return;
    var tmp = document.createElement('div'); tmp.innerHTML = chipsHTML(); if (tmp.firstChild) el.replaceWith(tmp.firstChild);
  }
  function overlay() {
    var ov = document.getElementById('msnOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'msnOv'; ov.className = 'msn-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'false'); document.body.appendChild(ov); }
    return ov;
  }
  function closeOv() { var ov = PAGE && document.getElementById('msnOv'); if (ov) { ov.classList.remove('on'); ov.innerHTML = ''; } }
  function itemHTML(it, k, withSwap) {
    var x = BY_ID[it.id], f = fam(x.f);
    return '<div class="msn-item' + (it.done ? ' done' : '') + '"><div class="msn-item-top"><span class="msn-role msn-' + it.role + '">' + ROLE[it.role] + '</span><span class="msn-fam">' + f.icon + ' ' + esc0(f.name) + '</span>' + dots(x.d) + '</div>' +
      '<b class="msn-text">' + esc0(x.t) + '</b><p class="msn-how">' + esc0(x.h) + '</p>' +
      (it.done ? '<p class="msn-got">' + (it.by === 0 ? '✔ Stamped' + (it.stars ? ' ' + starStr(it.stars) : it.practised ? ' (practised)' : '') : '🤝 Done by ' + esc0(A.g.players[it.by].name)) + '</p>'
        : withSwap && !A.swapUsed ? '<button type="button" class="btn small ghost msn-swap" data-act="msnSwap" data-arg="' + k + '">Not today: swap it</button>' : '') + '</div>';
  }
  function showCard() {
    if (!PAGE || !live()) return;
    var ov = overlay();
    ov.setAttribute('aria-label', 'Pip\'s missions for this match');
    ov.innerHTML = '<div class="msn-card"><div class="msn-card-h">' + (typeof pipHTML === 'function' ? pipHTML('happy', 46) : '') + '<div><h3>Pip\'s missions for this match</h3>' +
      '<p class="msn-small">Just for fun: you don\'t need them to win. A mission you don\'t do stays for another day.' + (A.family ? ' Family game: everyone can help, and stamps go to ' + esc0(A.g.players[0].name) + '\'s passport.' : '') + '</p></div></div>' +
      A.list.map(function (it, k) { return itemHTML(it, k, true); }).join('') +
      '<p class="msn-house">House feature: missions and the Skills Passport are not part of official Equations.</p>' +
      '<div class="row"><button type="button" class="btn green" data-act="msnClose">Let\'s play!</button></div></div>';
    ov.classList.add('on');
  }
  function showTip(k) {
    if (!PAGE || !live() || !A.list[k]) return;
    var ov = overlay();
    ov.setAttribute('aria-label', 'Mission tip');
    ov.innerHTML = '<div class="msn-card msn-tipcard">' + itemHTML(A.list[k], k, true) + '<div class="row"><button type="button" class="btn green" data-act="msnClose">OK</button></div></div>';
    ov.classList.add('on');
  }
  function swap(k) {
    if (!live() || A.swapUsed || !A.list[k] || A.list[k].done) return false;
    var m = store(), rep = swapFor(A.ctx, m, A.list.map(function (it) { return { id: it.id, role: it.role }; }), k, A.n, A.seen);
    if (!rep) return false;
    swapped(m, A.list[k].id); offered(m, rep.id); save();
    A.list[k] = { id: rep.id, role: A.list[k].role, done: false, by: null, stars: 0, first: false, practised: false, just: false };
    A.seen.push(rep.id); A.swapUsed = true;
    evaluate(); // (already shown earlier in this match? then it stamps straight away)
    return true;
  }
  // One line for the end-of-match pop-up.
  function matchLineHTML() {
    if (!A || !on() || !A.list.length) return '';
    var mine = A.list.filter(function (it) { return it.done && it.by === 0; }), stars = mine.reduce(function (t, it) { return t + it.stars; }, 0);
    var fresh = mine.filter(function (it) { return it.first; }).map(function (it) { return BY_ID[it.id].t; });
    var help = A.list.filter(function (it) { return it.done && it.by !== 0; }).length;
    var rk = rankIdx(totalStars(store())), up = rk > A.rank0 ? RANKS[rk] : null;
    return '<div class="msn-line"><b>Missions: ' + mine.length + ' of ' + A.list.length + '</b>' + (stars ? ' ' + starStr(stars) : '') +
      (fresh.length ? ' <span>(new stamp' + (fresh.length > 1 ? 's' : '') + ': ' + fresh.map(esc0).join(', ') + ')</span>' : '') +
      (help ? ' <span>+ ' + help + ' team tick' + (help > 1 ? 's' : '') + '</span>' : '') +
      (!mine.length && !help ? ' <span>They wait for you next time.</span>' : '') +
      (up ? '<br><span class="msn-up">' + up.icon + ' New rank: <b>' + esc0(up.name) + '</b>! Reward: ' + esc0(up.reward.name) + '</span>' : '') + '</div>';
  }

  // ======================= THE SKILLS PASSPORT SCREEN =======================
  var page = 'g', backTo = 'trophies';
  function oppName(i) { var o = oppList()[i]; return i >= 0 && o ? o.name : 'a family game'; }
  function niceDate(d) { if (!d) return ''; var p = String(d).split('-'); var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return p.length === 3 ? (+p[2]) + ' ' + M[(+p[1] - 1) % 12] + ' ' + p[0] : esc0(d); }
  function slotHTML(x, m) {
    var c = cnt(m, x.id), e = m.s[x.id], got = c > 0;
    var ticks = c > FULL ? '<span class="msn-ticks" title="practised">' + new Array(Math.min(c - FULL, 9) + 1).join('✓') + (c - FULL > 9 ? '+' : '') + '</span>' : '';
    return '<div class="msn-slot' + (got ? ' got' : '') + '" role="listitem"><div class="msn-slot-top">' + dots(x.d) + (got ? '<span class="msn-slot-st">' + starStr(starsFor(x.d, c)) + '</span>' : '') + '</div>' +
      '<b>' + esc0(x.t) + '</b>' +
      (got ? '<div class="msn-ink" aria-hidden="true">STAMPED</div><small>' + niceDate(e[1]) + ' · vs ' + esc0(oppName(+e[2])) + (c > 1 ? ' · ' + c + ' times' : '') + '</small>' + ticks
        : '<small class="msn-tip">How: ' + esc0(x.h) + '</small>') + '</div>';
  }
  function passportHTML() {
    var m = store(), stars = totalStars(m), rk = rankIdx(stars), next = RANKS[rk + 1], covers = coversAt(stars);
    var cv = covers.indexOf(m.cv) >= 0 ? m.cv : covers[covers.length - 1] || 'green';
    var stamped = CATALOGUE.filter(function (x) { return cnt(m, x.id) > 0; }).length;
    var I = typeof ico === 'function' ? ico : function () { return ''; };
    var html = '<div class="hdr"><button class="btn small" data-act="passportBack">' + I('back') + ' Back</button><h2>📘 Skills Passport</h2></div><div class="panel msn-pass">' +
      '<div class="msn-cover cv-' + cv + '"><div class="msn-cover-rank"><span class="msn-rank-ic">' + RANKS[rk].icon + '</span><div><small>Rank</small><b>' + esc0(RANKS[rk].name) + '</b></div></div>' +
      '<div class="msn-cover-num"><b>' + stars + ' ⭐</b><small>' + stamped + ' of ' + CATALOGUE.length + ' stamps</small></div>' +
      (next ? '<div class="msn-bar" role="img" aria-label="' + (next.at - stars) + ' stars to ' + esc0(next.name) + '"><i style="width:' + Math.round(100 * (stars - RANKS[rk].at) / (next.at - RANKS[rk].at)) + '%"></i></div><small class="msn-next">' + (next.at - stars) + ' more ⭐ to ' + esc0(next.name) + '</small>' : '<small class="msn-next">The top rank. Every stamp still counts!</small>') + '</div>' +
      '<p class="msn-small">A mission gives its difficulty in stars the first ' + FULL + ' times. After that it is a "practised" tick: stars grow when you try NEW skills. <b>House feature: not part of official Equations.</b></p>' +
      (covers.length > 1 ? '<div class="msn-covers"><span>Cover:</span>' + covers.map(function (k) { return '<button type="button" class="msn-cv cv-' + k + (k === cv ? ' on' : '') + '" data-act="msnCover" data-arg="' + k + '" aria-label="' + esc0(COVERS[k].name) + ' cover"></button>'; }).join('') + '</div>' : '') +
      '<details class="msn-ranks"><summary>Ranks and rewards</summary><ol>' + RANKS.map(function (r, i) {
        return '<li class="' + (i <= rk ? 'got' : '') + '"><span>' + r.icon + '</span><b>' + esc0(r.name) + '</b> <small>' + (r.at ? r.at + ' ⭐' : 'start') + '</small><em>' + esc0(r.reward.name) + (r.reward.cover && r.reward.kind !== 'cover' ? ' + ' + esc0(COVERS[r.reward.cover].name.toLowerCase()) + ' cover' : '') + '</em>' + (i <= rk ? ' ✔' : '') + '</li>';
      }).join('') + '</ol></details>' +
      '<div class="seg msn-pages" role="tablist">' + FAMILIES.map(function (f) {
        var list = CATALOGUE.filter(function (x) { return x.f === f.id; }), got = list.filter(function (x) { return cnt(m, x.id) > 0; }).length;
        return '<button role="tab" aria-selected="' + (f.id === page) + '" class="' + (f.id === page ? 'on' : '') + '" data-act="msnPage" data-arg="' + f.id + '">' + f.icon + ' <span class="lbl">' + esc0(f.name) + '</span> <small>' + got + '/' + list.length + '</small></button>';
      }).join('') + '</div>';
    var f = fam(page) || FAMILIES[0];
    html += '<h3 class="tierh">' + f.icon + ' ' + esc0(f.name) + '</h3><div class="msn-slots" role="list">' + CATALOGUE.filter(function (x) { return x.f === f.id; }).sort(function (a, b) { return a.d - b.d; }).map(function (x) { return slotHTML(x, m); }).join('') + '</div></div>';
    return html;
  }
  function ensureScreen() {
    if (document.getElementById('passport')) return;
    var s = document.createElement('section'); s.id = 'passport'; s.className = 'screen';
    var anchor = document.getElementById('builder'); document.body.insertBefore(s, anchor || null);
  }
  function renderPassport() { if (!PAGE) return; ensureScreen(); document.getElementById('passport').innerHTML = passportHTML(); }
  function openPassport(from) { if (!PAGE) return; backTo = from || (typeof current !== 'undefined' ? current : 'trophies'); renderPassport(); if (typeof go === 'function') go('passport'); }
  function buttonHTML(cls) { return '<button class="btn ' + (cls || 'blue') + '" data-act="passport">📘 Skills Passport</button>'; }
  function cosmeticOpen(kind, id) { return cosmeticOpenAt(totalStars(store()), kind, id); }
  function rankFor(kind, id) { for (var i = 0; i < RANKS.length; i++) if (RANKS[i].reward.kind === kind && RANKS[i].reward.id === id) return RANKS[i]; return null; }

  // ======================= PARENT PAGE, SETTINGS =======================
  // "Keeps being skipped": tapped "Not today" twice or more, or offered 3+ times and not shown yet. Not a failure:
  // a hint about what to practise together.
  function skipped(m) {
    return CATALOGUE.filter(function (x) { var e = m.s[x.id]; return Array.isArray(e) && cnt(m, x.id) === 0 && ((+e[4] || 0) >= 2 || (+e[3] || 0) >= 3); })
      .sort(function (a, b) { return ((+m.s[b.id][4]) * 2 + (+m.s[b.id][3])) - ((+m.s[a.id][4]) * 2 + (+m.s[a.id][3])); });
  }
  function parentHTML() {
    var m = store(), stars = totalStars(m), rk = rankIdx(stars), sk = skipped(m).slice(0, 5);
    var rows = FAMILIES.map(function (f) {
      var list = CATALOGUE.filter(function (x) { return x.f === f.id; }), got = list.filter(function (x) { return cnt(m, x.id) > 0; });
      return '<tr><td>' + f.icon + ' ' + esc0(f.name) + '</td><td>' + got.length + ' of ' + list.length + '</td><td>' + (got.length ? got.map(function (x) { return esc0(x.t) + (cnt(m, x.id) > 1 ? ' <small>×' + cnt(m, x.id) + '</small>' : ''); }).join('; ') : '<span class="pp-muted">none yet</span>') + '</td></tr>';
    }).join('');
    return '<section class="pp-sec msn-pp"><h3>Skills Passport <small>(house feature)</small></h3>' +
      '<p class="pp-muted">Match missions are optional skill goals Pip offers at the start of a match (never about speed). Each one is stamped the first time he shows the skill; stars count a mission fully ' + FULL + ' times, so they grow with new skills, not with repeats. ' + (on() ? '' : '<b>Match missions are switched off in Settings</b> (stamps are kept). ') + '</p>' +
      '<div class="pp-tiles"><div class="pp-tile"><div class="pp-v">' + stars + '</div><div class="pp-l">stars (of ' + maxStars() + ' possible)</div></div><div class="pp-tile"><div class="pp-v">' + RANKS[rk].icon + '</div><div class="pp-l">rank: ' + esc0(RANKS[rk].name) + '</div></div><div class="pp-tile"><div class="pp-v">' + m.n + '</div><div class="pp-l">matches with missions</div></div></div>' +
      '<table class="pp-table"><thead><tr><th>Skill family</th><th>Stamped</th><th>Which</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      (sk.length ? '<h4>Missions he keeps passing on</h4><p class="pp-muted">Swapped with "Not today", or offered a few times without coming up yet. Worth trying together:</p><ul class="pp-list">' + sk.map(function (x) {
        var e = m.s[x.id], d = drillFor(x.id);
        return '<li><b>' + esc0(x.t) + '</b> <small>(offered ' + e[3] + ', swapped ' + e[4] + ')</small><br><small>' + esc0(x.h) + '</small>' + (d ? ' <button class="btn small green pp-noprint" data-act="parentTry" data-arg="drill:' + d + '">' + esc0(DRILL_NAME[d]) + ' ▶</button>' : '') + '</li>';
      }).join('') + '</ul>' : '') + '</section>';
  }
  function settingsHTML() {
    var onNow = on();
    return '<div class="setrow"><label>Match missions<br><small style="font-weight:600">House feature (not part of official Equations): Pip offers up to three optional skill missions per match, stamped into the Skills Passport. Off hides the missions; stamps stay.</small></label>' +
      '<button class="btn small ' + (onNow ? 'green' : '') + '" data-act="toggleSet" data-arg="missions" data-def="1">' + (onNow ? '✔ On' : 'Off') + '</button></div>';
  }
  function bytes() { try { return JSON.stringify(store()).length; } catch (e) { return 0; } }

  // ======================= TAP HANDLERS =======================
  if (PAGE && typeof ACT !== 'undefined') {
    ACT.msnTip = function (el) { showTip(+el.dataset.arg); };
    ACT.msnClose = function () { closeOv(); };
    ACT.msnSwap = function (el) { var k = +el.dataset.arg; if (swap(k)) { if (window.Snd && Snd.click) Snd.click(); var ov = document.getElementById('msnOv'); if (ov && ov.querySelector('.msn-tipcard')) showTip(k); else showCard(); refreshChips(); } };
    ACT.passport = function () { if (window.Snd && Snd.click) Snd.click(); openPassport(typeof current !== 'undefined' ? current : 'trophies'); };
    ACT.passportBack = function () { if (backTo === 'trophies' && ACT.trophies) ACT.trophies(); else if (backTo === 'title' && typeof gotoTitle === 'function') gotoTitle(); else if (ACT.trophies) ACT.trophies(); };
    ACT.msnPage = function (el) { page = el.dataset.arg; renderPassport(); };
    ACT.msnCover = function (el) { var m = store(); if (coversAt(totalStars(m)).indexOf(el.dataset.arg) < 0) return; m.cv = el.dataset.arg; save(); renderPassport(); };
  }
  if (PAGE) document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var ov = document.getElementById('msnOv'); if (ov && ov.classList.contains('on')) closeOv(); } });

  return {
    // game hooks and HTML pieces
    note: note, chipsHTML: chipsHTML, matchLineHTML: matchLineHTML, parentHTML: parentHTML, settingsHTML: settingsHTML, buttonHTML: buttonHTML,
    open: openPassport, close: closeOv, swap: swap, cosmeticOpen: cosmeticOpen, rankFor: rankFor, on: on, bytes: bytes, current: function () { return A; },
    // pure parts (tests)
    CATALOGUE: CATALOGUE, FAMILIES: FAMILIES, RANKS: RANKS, COVERS: COVERS, PERSONA: PERSONA, FULL: FULL, MODES: MODES,
    available: available, choose: choose, swapFor: swapFor, bootSeen: bootSeen, newRecord: newRecord, apply: apply, check: check,
    solFacts: solFacts, goalFacts: goalFacts, negUsed: negUsed, blank: blank, normalize: normalize, award: award, offered: offered, swapped: swapped,
    totalStars: totalStars, maxStars: maxStars, rankIdx: rankIdx, coversAt: coversAt, cosmeticOpenAt: cosmeticOpenAt, merge: missionsMerge, skipped: skipped, drillFor: drillFor,
    _passportHTML: passportHTML
  };
})();
