'use strict';
// ======================= BONUS DICE (HOUSE RULE, not part of the official game) =======================
// Three twenty-sided bonus dice the kid EARNS with skill points, for higher levels of play
// (RULES_SUMMARY.md section 7 lists every face, its exact meaning, the caps and every judgment call;
// docs/handoff/bonus.md says how the pieces fit together).
//   BIG-NUMBER DIE (purple): one extra cube with a number the normal cubes don't have (10, 12, 100, ½, …).
//   POWER DIE (gold): one extra cube with a new operation (n!, x², √x, mod, max, half, …).
//   TWIST DIE (teal): read once and set aside. It switches on an official variation card for this shake,
//                     or a friendly scoring twist (Golden Goal, Bonus +2, Free hint). Never a punishment.
// The Big-number and Power dice are real cubes in G.cubes (ids 24 and 25, after the 24 official cubes), so every
// rule that counts cubes (last cube, Required must be used, Now! = one more cube, the Goal's 1-6 cubes) counts them.
// The engine knows their maths (js/engine.js, BONUS block: Eq.BIG, Eq.POWER_FACES, OPDEF entries).
//
// Hooks (small, marked "BONUS" in the other files):
//   js/game.js     newShake -> Bonus.onShake(G, fixed)      (add the bonus cubes; tell the 3D table about the Twist die)
//                  rerollOps -> Bonus.isCube / Bonus.okFace  (a switched-off face is rolled again, like a locked operation)
//                  startGoalPhase -> Bonus.beforeGoal(again)  (celebrate a new die, read the Twist die)
//                  endShake -> Bonus.adjust(r)              (Golden Goal / Bonus +2)
//                  ACT.hint -> Bonus.freeHint()             (Free hint)
//                  cubeHTML -> Bonus.tile(c)                (the label on a bonus tile: "n!" rather than "!")
//   js/builder.js  Bonus.builderNote(B)                      (what the bonus cube in the pools means)
//   js/screens.js  Bonus.parentHTML()                        (Parent corner: a switch per die and per Power operation, unlock now)
//   js/camp.js     Bonus.campTileHTML(), Bonus.makeDrill()   (Training Camp: practise with a bonus die)
//   js/three/table.js  T3.twistDie / T3.twistFace / T3.twistShow  (the 3D icosahedra)
// Online play: never (the bonus dice are not synced). Only normal matches against a creature and pass-and-play.
var Bonus = (function () {
  var ORDER = ['big', 'power', 'twist'];
  // step = skill points needed AFTER the ladder reaches its last stage (Roots: every operation unlocked).
  // Skill points are the same ones the variation cards use: correct Solutions + correct Impossible! calls.
  var DIE = {
    big: { id: 'big', name: 'Big-number die', short: 'Big-number', icon: '🟣', color: 'big', step: 8,
      rule: 'One extra purple cube with a number the normal cubes don\'t have: 10, 12, 25, 100, ½, ¼ … It is ONE number all by itself: it never joins another digit to make a longer number.' },
    power: { id: 'power', name: 'Power die', short: 'Power', icon: '🟡', color: 'power', step: 20,
      rule: 'One extra gold cube with a brand-new operation: n!, x², √x, mod, the bigger of two, half, … Move it and use it like any operation cube.' },
    twist: { id: 'twist', name: 'Twist die', short: 'Twist', icon: '🌀', color: 'twist', step: 36,
      rule: 'A teal die that is read once and set aside. It switches on a variation card for this shake, or a friendly twist like Golden Goal (this shake\'s points count double).' }
  };
  // Power die operations: face label, name, rule, and three worked examples (internal symbols; values come from the engine).
  // Big-number symbols used in examples: γ = 12, η = 25, κ = 50, μ = 100.
  var OPS = {
    F: { face: 'n!', name: 'Factorial', rule: 'n! means n × (n − 1) × … × 1. 4! = 4 × 3 × 2 × 1 = 24. (0! = 1, and 9! is the biggest the game can check.)',
      lesson: [['4F', '4 × 3 × 2 × 1 = 24.'], ['3F+1', '3! = 6, then 6 + 1 = 7.'], ['(1+2)F', 'Group first: (1 + 2)! = 3! = 6.']] },
    Q: { face: 'x²', name: 'Squared', rule: 'The number times itself: 5² = 5 × 5 = 25. It works on fractions and negative numbers too.',
      lesson: [['5Q', '5 × 5 = 25.'], ['(1+2)Q', '(1 + 2)² = 3 × 3 = 9.'], ['(1/2)Q', 'Half of a half is a quarter.']] },
    C: { face: 'x³', name: 'Cubed', rule: 'The number times itself three times: 2³ = 2 × 2 × 2 = 8.',
      lesson: [['2C', '2 × 2 × 2 = 8.'], ['3C', '3 × 3 × 3 = 27.'], ['(4-5)C', '(−1) × (−1) × (−1) = −1.']] },
    A: { face: '|x|', name: 'Distance from 0', rule: '|x| is how far a number is from 0, so it is never negative: |2 − 5| = 3.',
      lesson: [['A(2-5)', '2 − 5 = −3, and −3 is 3 steps from 0.'], ['A7', '7 is already 7 steps from 0.'], ['A(1-9)+2', '|1 − 9| = 8, and 8 + 2 = 10.']] },
    M: { face: 'mod', name: 'Mod (remainder)', rule: 'A mod B is what is left over when you share A into groups of B: 7 mod 3 = 1. Counting numbers only, and A at most 1000.',
      lesson: [['7M3', '7 = 3 + 3 + 1, so 1 is left over.'], ['9M5', '9 = 5 + 4, so 4 is left over.'], ['6M3', '6 = 3 + 3: nothing is left over, so 0.']] },
    E: { face: '%', name: 'Percent of', rule: 'A % B means A percent of B: 50 % 8 is half of 8, which is 4.',
      lesson: [['κE8', '50% is half. Half of 8 is 4.'], ['ηEμ', '25% of 100 is 25.'], ['5E4', '5% of 4 is one fifth.']] },
    X: { face: 'max', name: 'The bigger one', rule: 'A max B is the bigger of the two numbers: 3 max 8 = 8.',
      lesson: [['3X8', '8 is bigger than 3.'], ['(2*4)X7', '2 × 4 = 8, and 8 is bigger than 7.'], ['5X5', 'Both are 5, so it is 5.']] },
    I: { face: 'min', name: 'The smaller one', rule: 'A min B is the smaller of the two numbers: 3 min 8 = 3.',
      lesson: [['3I8', '3 is smaller than 8.'], ['9I(2+4)', '2 + 4 = 6, and 6 is smaller than 9.'], ['(1-4)I2', '1 − 4 = −3, and −3 is smaller than 2.']] },
    Y: { face: 'avg', name: 'Average', rule: 'A avg B is the number exactly halfway between them: 3 avg 9 = 6.',
      lesson: [['3Y9', 'Halfway from 3 to 9 is 6.'], ['4Y5', 'Halfway between 4 and 5 is 4 1/2.'], ['(2*5)Y2', '2 × 5 = 10, and halfway between 10 and 2 is 6.']] },
    G: { face: 'gcf', name: 'Greatest common factor', rule: 'A gcf B is the biggest number that goes into both: 8 gcf 6 = 2.',
      lesson: [['8G6', '1 and 2 go into both 8 and 6. The biggest is 2.'], ['9G6', '3 goes into 9 and into 6.'], ['γG8', '4 goes into 12 and into 8.']] },
    L: { face: 'lcm', name: 'Lowest common multiple', rule: 'A lcm B is the smallest number both of them go into: 4 lcm 6 = 12.',
      lesson: [['4L6', 'Count by 4s: 4, 8, 12. By 6s: 6, 12. They meet at 12.'], ['2L3', '2 and 3 first meet at 6.'], ['5L(2*5)', '5 lcm 10 = 10.']] },
    D: { face: '2×', name: 'Double', rule: 'Double the number right after it: 2× 7 = 14.',
      lesson: [['D7', '7 + 7 = 14.'], ['D(2+3)', 'Group first: double 5 is 10.'], ['D4-1', 'Double 4 is 8, then 8 − 1 = 7.']] },
    B: { face: '½×', name: 'Half', rule: 'Half of the number right after it: ½× 8 = 4 (and half of 7 is 3 1/2).',
      lesson: [['B8', 'Half of 8 is 4.'], ['B(3+3)', 'Half of 6 is 3.'], ['B7', 'Half of 7 is 3 1/2.']] },
    U: { face: '−x', name: 'Negative', rule: 'Turns the number right after it into its negative: neg 3 = −3. (This gold cube is the only way to make a minus SIGN.)',
      lesson: [['U3', 'Negative 3 is −3.'], ['9+U4', '9 + (−4) = 5: adding a negative takes away.'], ['5-U2', '5 − (−2) = 7: taking away a negative adds.']] },
    O: { face: '1/x', name: 'One over', rule: '1 divided by the number right after it: 1÷ 4 = 1/4.',
      lesson: [['O4', '1 ÷ 4 = 1/4.'], ['O(1/3)', 'How many thirds fit in 1? Three.'], ['8*O2', '8 × 1/2 = 4.']] },
    R: { face: '√x', name: 'Square root', rule: 'The number that times itself makes this one: √9 = 3. Only whole answers count, like the √ cube.',
      lesson: [['R9', '3 × 3 = 9, so √9 = 3.'], ['R(9+7)', '√16 = 4.'], ['R4+5', 'It grabs just the number right after it: √4 + 5 = 7.']] },
    S: { face: 'Σ', name: 'Sum of digits', rule: 'Adds up the digits of a whole number: sum of 47 is 4 + 7 = 11.',
      lesson: [['S(9*9)', '9 × 9 = 81, and 8 + 1 = 9.'], ['S(6*7)', '6 × 7 = 42, and 4 + 2 = 6.'], ['Sμ', '100: 1 + 0 + 0 = 1.']] },
    N: { face: '#', name: 'How many factors', rule: 'How many counting numbers divide it exactly: # 6 = 4 (1, 2, 3 and 6). Up to 1000.',
      lesson: [['N6', '1, 2, 3 and 6: 4 factors.'], ['N(3*4)', '12 has 6 factors: 1, 2, 3, 4, 6, 12.'], ['N7', '7 is prime: only 1 and 7, so 2.']] }
  };
  // Twist die: 20 faces. card = an official variation card switched on for this shake (with its setting);
  // otherwise a scoring twist of our own. Only faces that can change this shake count: any other face is rolled again.
  var TWIST = [
    { k: 'base8', card: 'basem', set: { base: 8 }, face: '8s' }, { k: 'base9', card: 'basem', set: { base: 9 }, face: '9s' },
    { k: 'wild0', card: 'wild0', face: '0?' }, { k: 'upside', card: 'upside', face: '−3' }, { k: 'sideways', card: 'sideways', face: '1/3' },
    { k: 'average', card: 'average', face: 'avg' }, { k: 'multiops', card: 'multiops', face: '↻' },
    { k: 'multk6', card: 'multk', set: { k: 6 }, face: 'k6' }, { k: 'multk10', card: 'multk', set: { k: 10 }, face: 'k10' },
    { k: 'expo', card: 'expo', face: 'xⁿ' }, { k: 'powbase', card: 'powbase', face: '10ⁿ' }, { k: 'twodigit', card: 'twodigit', face: '23' },
    { k: 'remainder', card: 'remainder', face: 'rem' }, { k: 'factorial', card: 'factorial', face: '!!' }, { k: 'nfactors', card: 'nfactors', face: '#' },
    { k: 'golden', face: '×2', name: 'Golden Goal', rule: 'Every score this shake counts double, for everybody.' },
    { k: 'golden', face: '×2', name: 'Golden Goal', rule: 'Every score this shake counts double, for everybody.' },
    { k: 'bonus2', face: '+2', name: 'Bonus +2', rule: 'A correct Solution that uses a bonus cube scores 2 extra points.' },
    { k: 'bonus2', face: '+2', name: 'Bonus +2', rule: 'A correct Solution that uses a bonus cube scores 2 extra points.' },
    { k: 'freehint', face: 'tip', name: 'Free hint', rule: 'Using Pip\'s Hint this shake doesn\'t cost your "no hint needed" bonus.' }
  ];

  // ---- Saved progress (S.bonus) ----
  function store() {
    if (!S.bonus || typeof S.bonus !== 'object') S.bonus = {};
    var b = S.bonus;
    ['seen', 'force', 'off', 'opOff', 'opsSeen'].forEach(function (k) { if (!b[k] || typeof b[k] !== 'object') b[k] = {}; });
    if (b.base === undefined) b.base = null;
    return b;
  }
  function points() { return (S.stats.correct || 0) + (S.stats.impWins || 0); }
  // The ladder must have reached its last stage (every operation), or Tata switched everything on.
  function gate() { return !!(S.unlockAll || (typeof stageIdx === 'function' && typeof STAGES !== 'undefined' && stageIdx() >= STAGES.length - 1)); }
  function progress() {
    var b = store();
    if (!gate()) return null;
    if (b.base === null) { b.base = points(); if (typeof persist === 'function') persist(); }
    return Math.max(0, points() - b.base);
  }
  function unlocked(id) {
    var b = store();
    if (S.unlockAll || b.force[id]) return true;
    var p = progress();
    return p !== null && p >= DIE[id].step;
  }
  function opOn(sym) { return !store().opOff[sym]; }
  function powerFacesOn() { return Eq.POWER_FACES.filter(opOn); }
  function dieOn(id) { return unlocked(id) && !store().off[id] && (id !== 'power' || powerFacesOn().length > 0); }
  // Bonus dice play only in normal matches against creatures and in pass-and-play (not online, Team-up, Three at the table, Cups' own modes, the tutorial).
  function activeFor(g) { return !!g && (g.mode === 'ai' || g.mode === 'pvp'); }
  function isCube(c) { return !!c && (c.color === 'power' || c.color === 'big'); }
  // Is this face allowed on this die right now? (Power: Tata's switch per operation; Big: fractions need fractions on.)
  function okFace(color, s) {
    if (color === 'power') return Eq.POWER_FACES.indexOf(s) >= 0 && opOn(s);
    if (color === 'big') { var v = Eq.bigOf(s); return !!v && (v.d === 1 || Eq.fracOn(G ? G.fractions : true)); }
    return true;
  }

  // ---- Each shake ----
  function onShake(g, fixed) {
    g.twist = null; g.bonusDone = false; g.twistRoll = null;
    chip();
    var on = !fixed && activeFor(g);
    if (window.T3 && T3.twistDie) T3.twistDie(on && dieOn('twist'));
    if (!on) return;
    var id = g.cubes.length;
    ['big', 'power'].forEach(function (d) {
      if (!dieOn(d)) return;
      var faces = Eq.CUBE_FACES[d];
      g.cubes.push({ id: id, color: d, s: faces[Math.floor(Math.random() * faces.length)], zone: 'resources', order: id, locked: false });
      id++;
    });
    if (dieOn('twist')) g.twistRoll = Math.floor(Math.random() * 20); // the flat table's roll (the 3D table reads its own die)
  }
  function bonusCubes() { return G ? G.cubes.filter(isCube) : []; }

  // Can this Twist face change this shake?
  function twistOk(f) {
    var T = TWIST[f];
    if (!T) return false;
    if (T.card) {
      if (!window.Vari || !Vari.card(T.card) || !Vari.cardOn(T.card)) return false;
      if (!Vari.unlocked().some(function (c) { return c.id === T.card; })) return false; // only cards the kid has earned
      return Vari.hasEffect(T.card);
    }
    if (T.k === 'bonus2') return bonusCubes().length > 0;
    return true;
  }
  function twistName(f, set) { var T = TWIST[f]; return T.card ? Vari.cardName(T.card, set || T.set || {}) : T.name; }
  function twistRule(f) {
    var T = TWIST[f];
    if (!T.card) return T.rule;
    var c = Vari.card(T.card), set = T.set || (G && G.variSet) || {};
    if (T.card === 'multk') return 'Your Solution must NOT equal the Goal. It must miss it by exactly ' + set.k + ', ' + (2 * set.k) + ', ' + (3 * set.k) + ', … (more or less).';
    if (T.card === 'basem') return 'Count in ' + (set.base === 8 ? 'eights' : 'nines') + '! Every number is read in base ' + set.base + ', and two cubes can join into a two-digit number in your Solution.';
    if (T.card === 'expo' && G && G.variSet && G.variSet.ecol) return 'A number on a ' + G.variSet.ecol + ' cube can be a power all by itself, with no ^ cube.';
    return c.rule;
  }

  // Called at the start of the Goal phase (before the variation cards). Returns true if it took over; then it calls again().
  function beforeGoal(again) {
    if (!G || G.bonusDone || !activeFor(G)) return false;
    G.bonusDone = true;
    var steps = [];
    var b = store(), fresh = ORDER.filter(function (id) { return dieOn(id) && !b.seen[id]; }); // (a die Tata switched off is celebrated when it first rolls)
    fresh.forEach(function (id) { steps.push(function (next) { b.seen[id] = true; if (typeof persist === 'function') persist(); celebrate(id, next); }); });
    bonusCubes().forEach(function (c) {
      if (c.color !== 'power' || b.opsSeen[c.s]) return;
      steps.push(function (next) { b.opsSeen[c.s] = true; if (typeof persist === 'function') persist(); newOp(c.s, next); });
    });
    if (G.twistRoll !== null && G.twistRoll !== undefined && dieOn('twist')) steps.push(readTwist);
    if (!steps.length) return false;
    var g0 = G, k = 0;
    (function run() {
      if (!G || G !== g0) return;
      if (k >= steps.length) { again(); return; }
      steps[k++](run);
    })();
    return true;
  }
  function readTwist(next) {
    var g0 = G, f = (window.T3 && T3.active && T3.active() && T3.twistFace && T3.twistFace() !== null) ? T3.twistFace() : G.twistRoll;
    function apply(ff, rerolled) {
      if (!G || G !== g0) return;
      var T = TWIST[ff];
      G.twist = { f: ff, k: T.k, card: T.card || null };
      if (T.card) { Vari.apply(T.card, T.set || null); G.variDone = true; } // the Twist picked this shake's card: no other card this shake
      var name = twistName(ff, G.variSet);
      G.twist.name = name;
      chip(true);
      if (typeof banner === 'function') banner('🌀 TWIST!', name);
      if (typeof board === 'function') board('TWIST' + String.fromCharCode(10) + name.toUpperCase());
      if (Snd.pop) Snd.pop();
      if (typeof say === 'function') say('pip', (rerolled ? 'Rolled again: ' : '') + 'The Twist die says <b>' + esc(name) + '</b>! ' + esc(twistRule(ff)) + (T.card ? ' (No other card this shake.)' : ''), 'cheer');
      if (typeof renderGame === 'function') renderGame();
      setTimeout(function () { if (G && G === g0) next(); }, 1700);
    }
    if (twistOk(f)) { apply(f, false); return; }
    // This face can't change anything this shake: roll the Twist die again (straight to a face that can).
    var okList = []; for (var i = 0; i < 20; i++) if (twistOk(i)) okList.push(i);
    var nf = okList[Math.floor(Math.random() * okList.length)];
    if (typeof say === 'function') say('pip', 'The Twist die shows <b>' + esc(TWIST[f].card ? Vari.cardName(TWIST[f].card, TWIST[f].set || {}) : TWIST[f].name) + '</b>, but that can\'t change anything this shake, so I\'ll roll it again!', 'think');
    var done = function () { apply(nf, true); };
    if (window.T3 && T3.active && T3.active() && T3.twistShow) T3.twistShow(nf, function () { setTimeout(done, 200); });
    else setTimeout(done, 900);
  }
  function celebrate(id, next) {
    var d = DIE[id];
    if (Snd.fanfare) Snd.fanfare(); else if (Snd.chime) Snd.chime();
    if (window.FX && FX.confetti) FX.confetti(90);
    modal('<h2 class="hero">✨ You earned the ' + esc(d.name) + '!</h2><div class="bonus-new">' + dieIcon(id, 'lg') + '<p>' + esc(d.rule) + '</p></div>' +
      '<p class="vari-small">A house rule from Tata, not part of the official game. You earned it with your skill points, and it rolls with the cubes from now on' + (id === 'twist' ? '' : ' (Tata can switch it off in the Parent corner)') + '.</p>' +
      '<div class="row"><button class="btn" data-act="bonusLesson" data-arg="' + id + '">How it works</button><button class="btn green big" data-act="closeModal">Let\'s roll!</button></div>', next);
  }
  function newOp(sym, next) {
    var o = OPS[sym];
    modal('<h2>🟡 New on the Power die: ' + esc(o.name) + '</h2>' + opLessonBody(sym) +
      '<div class="row"><button class="btn green big" data-act="closeModal">Got it!</button></div>', next);
  }

  // ---- Scoring twists (js/game.js endShake) ----
  function adjust(r) {
    if (!G || !G.twist || !r || !r.pts) return;
    if (G.twist.k === 'golden') {
      Object.keys(r.pts).forEach(function (i) { r.pts[i] = (r.pts[i] || 0) * 2; });
      r.lines.push('🌟 <b>Golden Goal</b> (Twist die): every score this shake counts double!');
    } else if (G.twist.k === 'bonus2' && r.sols) {
      Object.keys(r.sols).forEach(function (i) {
        var s = r.sols[i];
        if (!s || !s.ok || !s.tokens) return;
        var used = s.tokens.some(function (t) { return t && typeof t === 'object' && G.cubes[t.id] && isCube(G.cubes[t.id]); });
        if (!used) return;
        r.pts[i] = (r.pts[i] || 0) + 2;
        r.lines.push('➕ <b>Bonus +2</b> (Twist die): ' + esc(G.players[i].name) + '\'s Solution used a bonus cube!');
      });
    }
  }
  function freeHint() { return !!(G && G.twist && G.twist.k === 'freehint'); }

  // ---- Looks ----
  function tile(c) { return c.color === 'power' && OPS[c.s] ? OPS[c.s].face : show(c.s); }
  function faceLabel(color, k) {
    if (color === 'twist') return TWIST[k] ? TWIST[k].face : '?';
    var s = (Eq.CUBE_FACES[color] || [])[k];
    return color === 'power' && OPS[s] ? OPS[s].face : (Eq.SHOW[s] || s || '?');
  }
  function dieIcon(id, size) { return '<span class="bonus-die bd-' + id + (size ? ' ' + size : '') + '" aria-hidden="true"></span>'; }
  // the small chip on the table while a Twist is in play (tap it to read it again)
  function chip(dealt) {
    var host = document.getElementById('game'), el = document.getElementById('bonusChip');
    if (!G || !G.twist || !host) { if (el) el.remove(); return; }
    if (!el || el.parentNode !== host) { if (el) el.remove(); el = document.createElement('button'); el.id = 'bonusChip'; el.className = 'bonus-chip' + (G.vari ? ' below' : ''); el.setAttribute('data-act', 'bonusTwistInfo'); host.appendChild(el); }
    el.className = 'bonus-chip' + (G.vari ? ' below' : '');
    el.innerHTML = dieIcon('twist') + '<span><small>Twist die</small><b>' + esc(G.twist.name || '') + '</b></span>';
    if (dealt) { el.classList.remove('dealt'); void el.offsetWidth; el.classList.add('dealt'); }
  }
  ACT.bonusTwistInfo = function () {
    if (!G || !G.twist) return;
    var f = G.twist.f;
    modal('<h2>🌀 This shake\'s Twist</h2><div class="bonus-new">' + dieIcon('twist', 'lg') + '<p><b>' + esc(G.twist.name) + '</b>: ' + esc(twistRule(f)) + '</p></div>' +
      '<p class="vari-small">The Twist die is a house rule from Tata (not in the official game). ' + (G.twist.card ? 'It picked this shake\'s variation card, so no other card is picked this shake.' : 'Scoring twists never take points away.') + '</p>' +
      '<div class="row"><button class="btn" data-act="bonusLesson" data-arg="twist">How it works</button><button class="btn green" data-act="closeModal">OK</button></div>');
  };
  // one line in the builder about each bonus cube it offers
  function builderNote(Bd) {
    if (!Bd || !Bd.pools || !Bd.cubes) return '';
    var seen = {};
    return Bd.pools.map(function (p) { return p.forb ? [] : p.ids; }).reduce(function (a, b) { return a.concat(b); }, []).map(function (id) {
      var c = Bd.cubes[id]; if (!isCube(c) || seen[c.s]) return ''; seen[c.s] = 1;
      if (c.color === 'power') { var o = OPS[c.s]; return o ? '<div class="vari-note bonus-note">' + dieIcon('power') + '<b>Gold cube ' + esc(o.face) + ' (' + esc(o.name) + '):</b> ' + esc(o.rule) + ' <button class="btn small" data-act="bonusLesson" data-arg="' + c.s + '">How?</button></div>' : ''; }
      return '<div class="vari-note bonus-note">' + dieIcon('big') + '<b>Purple cube ' + esc(show(c.s)) + ':</b> one number all by itself (it can\'t join another digit).</div>';
    }).join('');
  }

  // ---- "How it works" (same style as Vari.lessonHTML) ----
  function rowHTML(expr, note) {
    var toks = expr.split(''), ev = Eq.evaluate(toks, { fractions: true });
    return '<div class="vl-row"><div class="vl-expr">' + tokensHTML(toks.map(function (s) { return isOpSym(s) ? { s: s, id: s } : s; }), FAKE) + '<span class="vl-val">' + (ev.ok ? ' = <b>' + Eq.fmt(ev.value) + '</b>' : '') + '</span></div><p>' + esc(note) + '</p></div>';
  }
  function isOpSym(s) { return Eq.isBonusOp(s) || Eq.bigIdx(s) >= 0; }
  // a stand-in "cubes" map so tokensHTML colours bonus symbols gold / purple in the lessons
  var FAKE = new Proxy({}, { get: function (o, k) { return { color: Eq.bigIdx(k) >= 0 ? 'big' : 'power' }; } });
  function opLessonBody(sym) {
    var o = OPS[sym];
    return '<div class="bonus-new">' + dieIcon('power') + '<p><b>' + esc(o.face) + '</b>: ' + esc(o.rule) + '</p></div><div class="vari-lesson">' + o.lesson.map(function (L) { return rowHTML(L[0], L[1]); }).join('') + '</div>';
  }
  function lessonHTML(id) {
    if (OPS[id]) return '<h2>🟡 How it works: ' + esc(OPS[id].name) + '</h2>' + opLessonBody(id) + '<p class="vari-small">Power die, a house rule (not in the official game).</p>';
    var d = DIE[id]; if (!d) return '';
    var head = '<h2>' + dieIcon(id) + ' How it works: the ' + esc(d.name) + '</h2><p class="vari-small">' + esc(d.rule) + '</p>';
    var body = '';
    if (id === 'big') {
      body = '<div class="vari-lesson">' + rowHTML('γ/4', '12 ÷ 4 = 3: the purple cube is twelve, all in one cube.') + rowHTML('ξ+3', 'A half and 3 make 3 1/2.') + rowHTML('μ-1', '100 − 1 = 99.') + '</div>' +
        '<p class="vari-small">It can\'t join a digit: a 1 next to the 12 cube is NOT 112. Put an operation between them. The faces are ' + Eq.BIG_FACES.map(function (s) { return show(s); }).join(', ') + ' (fraction faces only when fractions are on).</p>';
    } else if (id === 'power') {
      body = '<p class="vari-small">Twenty faces. Tap one to see how it works:</p><div class="bonus-oplist">' + Object.keys(OPS).map(function (s) {
        return '<button class="btn small' + (opOn(s) ? '' : ' vari-locked') + '" data-act="bonusLesson" data-arg="' + s + '"><b>' + esc(OPS[s].face) + '</b> ' + esc(OPS[s].name) + '</button>';
      }).join('') + '</div><div class="vari-lesson">' + rowHTML('4F', 'n! after a number: 4! = 24.') + rowHTML('R9+1', '√x in front of a number: √9 + 1 = 4.') + rowHTML('7M3', 'mod between two numbers: 7 mod 3 = 1.') + '</div>' +
        '<p class="vari-small">Some faces work on the number BEFORE them (n!, x², x³), some on the number AFTER them (|x|, 2×, ½×, −x, 1/x, √x, Σ, #), and the rest go BETWEEN two numbers (mod, %, max, min, avg, gcf, lcm).</p>';
    } else {
      body = '<p class="vari-small">Its 20 faces:</p><ul class="bonus-twists">' + TWIST.map(function (T, i) {
        return '<li><b>' + esc(T.face) + '</b> ' + esc(T.card ? Vari.cardName(T.card, T.set || {}) : T.name) + (T.card ? ' <small>(variation card)</small>' : ' <small>' + esc(T.rule) + '</small>') + '</li>';
      }).join('') + '</ul><p class="vari-small">Only a face that can change the shake counts (a card you haven\'t earned yet, or one with nothing to change, is rolled again). When the Twist die picks a card, nobody picks another card that shake.</p>';
    }
    return head + body + '<p class="vari-small">A house rule from Tata: not part of the official game.</p>';
  }
  ACT.bonusLesson = function (el) {
    var id = el && el.dataset ? el.dataset.arg : null; if (!id) return;
    var keep = typeof modalOnClose !== 'undefined' ? modalOnClose : null;
    modal(lessonHTML(id) + '<div class="row"><button class="btn green" data-act="closeModal">Got it!</button></div>', keep);
  };

  // ---- Parent corner ----
  function statusText(id) {
    var b = store();
    if (b.force[id] && !(progress() !== null && progress() >= DIE[id].step)) return 'unlocked by Tata';
    if (unlocked(id)) return 'earned ✔';
    var p = progress();
    if (p === null) return 'starts after the last operation (roots) is unlocked, then ' + DIE[id].step + ' skill points';
    return (DIE[id].step - p) + ' more skill points to earn it';
  }
  function parentHTML() {
    var b = store();
    return '<div class="setrow bonus-parent"><label>🎲 Bonus dice <span class="bonus-house">house rule, not in the official game</span><br><small style="font-weight:600">Three twenty-sided dice he earns with skill points once every operation is unlocked: ' +
      ORDER.map(function (id) { return DIE[id].short + ' after ' + DIE[id].step; }).join(', ') + ' skill points. Bonus dice play in matches against creatures and in pass-and-play (not online).</small></label>' +
      '<div class="bonus-rows">' + ORDER.map(function (id) {
        var on = !b.off[id], got = unlocked(id);
        return '<div class="bonus-row">' + dieIcon(id) + '<b>' + esc(DIE[id].name) + '</b><small>' + esc(statusText(id)) + '</small>' +
          '<button class="btn small ' + (on ? 'green' : '') + '" data-act="bonusToggle" data-arg="' + id + '">' + (on ? '✔ On' : 'Off') + '</button>' +
          (got ? '' : '<button class="btn small" data-act="bonusUnlock" data-arg="' + id + '">Unlock now</button>') + '</div>';
      }).join('') + '</div>' +
      '<div class="bonus-ops"><small>Power die faces (tap to switch one off or on):</small><div class="vari-switches">' + Object.keys(OPS).map(function (s) {
        return '<button class="btn small ' + (opOn(s) ? 'green' : '') + '" data-act="bonusOp" data-arg="' + s + '" title="' + esc(OPS[s].name) + '">' + esc(OPS[s].face) + '</button>';
      }).join('') + '</div></div></div>';
  }
  function reRender() { if (typeof persist === 'function') persist(); if (Snd.click) Snd.click(); if (typeof renderSettings === 'function') renderSettings(); }
  ACT.bonusToggle = function (el) { var id = el.dataset.arg, b = store(); if (!DIE[id]) return; if (b.off[id]) delete b.off[id]; else b.off[id] = true; reRender(); };
  ACT.bonusUnlock = function (el) { var id = el.dataset.arg, b = store(); if (!DIE[id]) return; b.force[id] = true; reRender(); };
  ACT.bonusOp = function (el) { var s = el.dataset.arg, b = store(); if (!OPS[s]) return; if (b.opOff[s]) delete b.opOff[s]; else b.opOff[s] = true; reRender(); };

  // ---- Training Camp: "Bonus dice" (one tile; the drill is Make the Goal with a bonus cube in Required) ----
  var DRILL = { id: 'bonus', icon: 'star', name: 'Bonus dice', blurb: 'Make the Goal with a bonus cube.', color: '#fff0c2' };
  function cubeDice() { return ['big', 'power'].filter(dieOn); }
  function campTileHTML() {
    var any = ORDER.some(unlocked), c = (typeof campState === 'function') ? campState('bonus') : { lvl: 1, done: 0 };
    return '<div class="opp mode bonus-tile" data-act="bonusCamp"><span class="avatar lg" style="background:' + DRILL.color + ';color:#1d2340;font-size:44px">' + dieIcon(any ? (cubeDice()[0] || 'twist') : 'power', 'lg') + '</span><h3>Bonus dice</h3>' +
      '<div class="otitle">' + (any ? DRILL.blurb : '🔒 Earned later with skill points') + '</div><div class="otitle">' + (any ? 'Level ' + c.lvl + ' · ' + c.done + ' solved' : 'House rule') + '</div></div>';
  }
  ACT.bonusCamp = function () {
    var got = ORDER.filter(unlocked), p = progress();
    var how = '<div class="bonus-rows">' + ORDER.map(function (id) {
      return '<div class="bonus-row">' + dieIcon(id) + '<b>' + esc(DIE[id].name) + '</b><small>' + esc(statusText(id)) + '</small>' + (unlocked(id) ? '<button class="btn small" data-act="bonusLesson" data-arg="' + id + '">How it works</button>' : '') + '</div>';
    }).join('') + '</div>';
    modal('<h2>🎲 Bonus dice</h2><p class="vari-small">Three twenty-sided dice for big players: a house rule from Tata, not part of the official game. You earn them with skill points' + (p === null ? ', once every operation is unlocked.' : '.') + '</p>' + how +
      '<div class="row">' + (cubeDice().length ? '<button class="btn green big" data-act="bonusPractice">Practise with a bonus cube</button>' : '') + '<button class="btn" data-act="closeModal">' + (got.length ? 'Back' : 'OK') + '</button></div>');
  };
  ACT.bonusPractice = function () { closeModal(); if (typeof startDrill === 'function') startDrill('bonus'); };
  function makeDrill(L, rand) {
    var dice = cubeDice();
    if (!dice.length || typeof campDeal !== 'function') return null;
    for (var tries = 0; tries < 80; tries++) {
      var P = campDeal(rand, { req: L >= 4 ? 1 : 0, perm: 3 + (L >= 2 ? 1 : 0) + (L >= 4 ? 1 : 0), forb: L >= 3 ? 1 : 0 }, null);
      if (!P) continue;
      var die = dice[Math.floor(rand() * dice.length)], faces = Eq.CUBE_FACES[die].filter(function (s) { return okFace(die, s) && (die !== 'big' || Eq.fracOn(P.fractions) || Eq.bigOf(s).d === 1); });
      var s = faces[Math.floor(rand() * faces.length)];
      P.cubes.push({ id: P.cubes.length, color: die, s: s, zone: 'required', order: 0, locked: false });
      var t = Eq.solve({ goal: P.goal, req: zsyms(P, 'required'), opt: zsyms(P, 'permitted'), res: [], mode: 'free', fractions: P.fractions, maxDigits: 4, timeMs: 150 });
      if (t.found && t.tokens.filter(function (x) { return x !== '(' && x !== ')'; }).length >= 2) { P.sample = t.tokens; return { drill: 'bonus', P: P, die: die, face: s }; }
    }
    return null;
  }
  function drillPrompt(D) {
    var c = D.P.cubes.filter(isCube)[0], line = c.color === 'power' ? '<b>' + esc(OPS[c.s].face) + '</b> (' + esc(OPS[c.s].name) + '): ' + esc(OPS[c.s].rule) : 'The purple cube is <b>' + esc(show(c.s)) + '</b>, one number all by itself.';
    return 'Make the Goal! The bonus cube is in <b>Required</b>, so your Solution must use it. ' + line;
  }

  return { ORDER: ORDER, DIE: DIE, OPS: OPS, TWIST: TWIST, store: store, unlocked: unlocked, dieOn: dieOn, opOn: opOn, activeFor: activeFor, progress: progress,
    isCube: isCube, okFace: okFace, onShake: onShake, beforeGoal: beforeGoal, adjust: adjust, freeHint: freeHint, twistOk: twistOk, twistName: twistName,
    tile: tile, faceLabel: faceLabel, chip: chip, builderNote: builderNote, lessonHTML: lessonHTML, parentHTML: parentHTML,
    campTileHTML: campTileHTML, makeDrill: makeDrill, drillPrompt: drillPrompt, DRILL: DRILL };
})();
