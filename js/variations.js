'use strict';
// ======================= VARIATION CARDS =======================
// Adventurous Equations "variations" (official rulebook, PDF section II-B and XIII): an extra rule
// for ONE shake, chosen after the roll and before the Goal is set. See RULES_SUMMARY.md, sections 5 and 6.
//
// How it plugs in (small, commented hooks in js/game.js):
//   newShake       -> Vari.reset()             (no card yet; the old true/false fractions value is back)
//   startGoalPhase -> Vari.beforeGoal(again)   (the Goal-setter may pick a card; the creature may pick one)
//   setGoal        -> Vari.afterGoal(tokens)   (0 Wild and Factorial need to know which cubes are in the Goal)
//   symsToCubeTokens -> Vari.cubeTokens(...)   (solver symbols -> real cubes; see Eq.cubeTokens)
// The card itself travels to every solver call inside G.fractions, which becomes a "math mode"
// (Eq.mathMode: {fractions, vars, goal, ...settings}) while a card is in play. With no card it stays
// true/false, so a shake without a card is exactly the old game.
//
// Two tiers: the five Elementary cards (section 5), then fourteen Middle-division cards (section 6),
// earned in the order of CARDS below. Some Middle cards have a setting the picker chooses when the card is
// picked (Multiple of k: k = 6..11; Base m: 8 or 9; Exponent: a colour).
//
// SIMPLIFIED on purpose (also listed in RULES_SUMMARY.md):
//   - Officially EVERY player picks a card (in 2-player games the other player must pick TWO).
//     Here only the Goal-setter may pick, at most one card, and "No card" is always allowed.
//   - Officially there is a 15-second limit to choose. Here there is no timer.
//   - Officially a card that "has no effect" (like 0 Wild with no 0 rolled) costs a point. Here such
//     cards are simply not offered.
var Vari = (function () {
  // In the order they unlock. ex = a tiny example (internal symbols, one character each), exNote = what it shows.
  // set = the card has a setting (k, base or colour). tier 2 = Middle division (creatures need 4+ stars to pick these).
  // lesson = worked examples for "How it works" (Vari.lessonHTML): [expression, Goal or null, explanation].
  var U = Eq.UD, SWS = Eq.SW, EXP = Eq.EX;
  var CARDS = [
    { id: 'twodigit', icon: '🔢', name: 'Two-digit Numbers', ref: 'XIII-A-8 Two-digit Numerals',
      rule: 'In your Solution, two number cubes side by side can make one two-digit number.',
      ex: '23+1', exNote: '2 and 3 together make 23, and 23 + 1 = 24.' },
    { id: 'multiops', icon: '🔁', name: 'Use It Again', ref: 'XIII-A-5 Multiple Operations',
      rule: 'Any operation cube you may use can be used again and again in your Solution.',
      ex: '1+2+3', exNote: 'Only one + cube, but you can write + twice: 1 + 2 + 3 = 6.' },
    { id: 'wild0', icon: '🃏', name: '0 is Wild', ref: 'XIII-A-3 0 Wild',
      rule: 'A 0 cube can stand for any digit from 0 to 9, but every 0 means the same digit (in the Goal too).',
      ex: '5+0', exNote: 'If the Goal is 8, then 5 + 0 works: the 0 stands for 3.' },
    { id: 'threeops', icon: '3️⃣', name: 'Three Operations', ref: 'XIII-A-6 Three-operation Solution',
      rule: 'Every Solution must use at least three operation signs (like + − × ÷).',
      ex: '4+3*2-1', exNote: '4 + 3 × 2 − 1 = 9 uses three signs: +, × and −.' },
    { id: 'remainder', icon: '↪️', name: 'Remainder', ref: 'XIII-A-7 Remainder',
      rule: 'Turn a ÷ cube sideways and it means "what is left over" when you divide.',
      ex: '7m3', exNote: '7 ÷ 3 is 2 with 1 left over, so 7 rem 3 = 1.' },
    // ---- Middle division (tier 2) ----
    { id: 'average', tier: 2, icon: '⚖️', name: 'Average', ref: 'XIII-B-11 Average (Elementary XIII-A-12)',
      rule: 'The + cube stops adding: it means the average, the number exactly halfway between two numbers.',
      ex: '7a9', exNote: 'Halfway between 7 and 9 is 8, so 7 avg 9 = 8.',
      lesson: [['7a9', null, '7 and 9: the number halfway between them is 8.'], ['2a(4*2)', null, 'First 4 × 2 = 8. Halfway between 2 and 8 is 5.'], ['3a4', null, 'Halfway between 3 and 4 is 3 1/2. Averages can make halves!']] },
    { id: 'upside', tier: 2, icon: '🙃', name: 'Upside-down', ref: 'XIII-B-2 Upside-down',
      rule: 'Turn a number cube upside-down and it becomes its opposite: 3 becomes −3. Tap a cube in your Solution to turn it.',
      ex: '9+' + U[3], exNote: '9 + (−3) = 6: adding an upside-down 3 takes 3 away.',
      lesson: [['9+' + U[3], null, 'An upside-down 3 is −3. Adding −3 is the same as taking away 3, so 9 + (−3) = 6.'], ['5-' + U[2], null, 'Taking away −2 is the same as adding 2: 5 − (−2) = 7.'], ['6*' + U[2], null, '6 groups of −2 make −12.']] },
    { id: 'sideways', tier: 2, icon: '🔃', name: 'Sideways', ref: 'XIII-B-1 Sideways',
      rule: 'Turn a number cube on its side and it becomes 1 divided by that number: 3 becomes 1/3. Tap a cube in your Solution to turn it.',
      ex: '6*' + SWS[3], exNote: '6 × 1/3 = 2: a third of 6.',
      lesson: [['6*' + SWS[3], null, 'A sideways 3 is 1/3. A third of 6 is 2.'], ['1/' + SWS[4], null, '1 ÷ 1/4 asks "how many quarters fit in 1?" Four!'], ['2+' + SWS[2], null, '2 and a half: 2 + 1/2 = 2 1/2.']] },
    { id: 'expo', tier: 2, icon: '🎨', name: 'Exponent Colour', ref: 'XIII-B-9 Exponent', set: 'color',
      rule: 'A number on a cube of the chosen colour can be a power all by itself, with no ^ cube. Tap that cube in your Solution to raise it up.',
      ex: '5' + EXP[2], exNote: '5 with a coloured 2 as its exponent: 5² = 5 × 5 = 25.',
      lesson: [['5' + EXP[2], null, 'The coloured 2 sits up high: 5² = 5 × 5 = 25.'], ['(1+2)' + EXP[2], null, 'An exponent can go on a whole group: (1 + 2)² = 3 × 3 = 9.'], ['4+3' + EXP[2], null, 'It only grabs the number right before it: 4 + 3² = 4 + 9 = 13.']] },
    { id: 'multk', tier: 2, icon: '🎯', name: 'Multiple of k', ref: 'XIII-B-7 Multiple of k', set: 'k',
      rule: 'Your Solution must NOT equal the Goal. It must miss it by exactly k, 2k, 3k, … (more or less).',
      ex: '8+3', exNote: 'With k = 6 and the Goal 5: 8 + 3 = 11 works, because 11 is 6 more than 5.',
      lesson: [['8+3', '5', 'k = 6, Goal 5: 11 is 6 more than 5. Correct!'], ['2-3', '5', 'k = 6, Goal 5: −1 is 6 less than 5. Also correct!'], ['2+3', '5', 'k = 6, Goal 5: 5 equals the Goal exactly, so it does NOT count.']] },
    { id: 'powbase', tier: 2, icon: '🔟', name: 'Powers of Ten', ref: 'XIII-B-10 Powers of the Base',
      rule: 'A 1 cube may stand for 10, 100, 1000, … or 0.1, 0.01, … Tap a 1 in your Solution to change it.',
      ex: '9+T', exNote: 'The 1 cube stands for 10: 9 + 10 = 19.',
      lesson: [['9+T', null, 'The 1 means 10 this time: 9 + 10 = 19.'], ['H-1', null, 'One 1 can be 100 and another 1 can be just 1: 100 − 1 = 99.'], ['5*t', null, 'A 1 can even be 0.1 (one tenth): 5 × 0.1 = 1/2.']] },
    { id: 'factorial', tier: 2, icon: '❗', name: 'Factorial', ref: 'XIII-B-4 Factorial',
      rule: 'You get two ! signs for the whole Equation. 4! means 4 × 3 × 2 × 1 = 24.',
      ex: '4!-3', exNote: '4! = 24, and 24 − 3 = 21.',
      lesson: [['3!', null, '3! = 3 × 2 × 1 = 6. (A Solution still needs two cubes, so 3! alone is not enough.)'], ['4!/2', null, '4! = 24, and 24 ÷ 2 = 12.'], ['(1+2)!', null, 'Group first: (1 + 2)! = 3! = 6. And 0! = 1, just because mathematicians say so.']] },
    { id: 'nfactors', tier: 2, icon: '#️⃣', name: 'Number of Factors', ref: 'XIII-B-8 Number of Factors',
      rule: 'A × with no number in front of it means "how many numbers divide this one": #6 = 4 (1, 2, 3 and 6).',
      ex: 'f6+1', exNote: '6 has 4 factors (1, 2, 3, 6), and 4 + 1 = 5.',
      lesson: [['f6', null, '1, 2, 3 and 6 all divide 6 exactly: 4 factors.'], ['f(3*4)', null, '12 has 6 factors: 1, 2, 3, 4, 6, 12.'], ['3*f7', null, 'The first × multiplies; the second has no number in front, so it counts factors. 7 has 2 (1 and 7): 3 × 2 = 6.']] },
    { id: 'sprime', tier: 2, icon: '⏭️', name: 'Smallest Prime', ref: 'XIII-A-13 Smallest Prime',
      rule: 'A × with no number in front of it means "the next prime number after this one": P7 = 11.',
      ex: 'p7-2', exNote: 'The next prime after 7 is 11, and 11 − 2 = 9.',
      lesson: [['p7', null, 'Primes are 2, 3, 5, 7, 11, 13, … The next one after 7 is 11.'], ['p(9/2)', null, 'After 4 1/2 the next prime is 5.'], ['p(0-3)', null, 'After −3 the next prime is 2 (1 is not a prime).']] },
    { id: 'lcm', tier: 2, icon: '🤝', name: 'LCM', ref: 'XIII-A-9 LCM',
      rule: 'A √ between two numbers can mean their LCM: the smallest number both of them go into. Tap the √ in your Solution to switch.',
      ex: '6l8', exNote: '6 and 8 both go into 24 (and nothing smaller), so 6 lcm 8 = 24.',
      lesson: [['6l8', null, 'Count by 6s: 6, 12, 18, 24. Count by 8s: 8, 16, 24. They meet at 24.'], ['2l3', null, '2 and 3 first meet at 6.'], ['(2*3)l(5+4)', null, '6 lcm 9 = 18.']] },
    { id: 'gcf', tier: 2, icon: '🧩', name: 'GCF', ref: 'XIII-A-10 GCF',
      rule: 'A ^ between two numbers can mean their GCF: the biggest number that goes into both. Tap the ^ in your Solution to switch.',
      ex: '8g6', exNote: '2 goes into 8 and into 6, and nothing bigger does, so 8 gcf 6 = 2.',
      lesson: [['8g6', null, 'Numbers that go into 8: 1, 2, 4, 8. Into 6: 1, 2, 3, 6. The biggest in both lists is 2.'], ['9g6', null, '3 goes into 9 and 6.'], ['5g0', null, 'Every number goes into 0, so 5 gcf 0 = 5.']] },
    { id: 'percent', tier: 2, icon: '💯', name: 'Percent', ref: 'XIII-B-12 Percent',
      rule: 'Turn √ upside-down and it means "percent of": 50 % 8 = half of 8 = 4. Numbers next to it may have two digits. Tap the √ in your Solution to turn it.',
      ex: '25%8', exNote: '25% means a quarter: a quarter of 8 is 2.',
      lesson: [['50%8', null, '50% is half. Half of 8 is 4.'], ['25%16', null, '25% is a quarter. A quarter of 16 is 4.'], ['10%(3+7)', null, '10% of 10 is 1.']] },
    { id: 'decimal', tier: 2, icon: '🔸', name: 'Decimal Point', ref: 'XIII-B-13 Decimal Point',
      rule: 'A ^ cube can be a decimal point that joins up to three digits: 2 . 5 is 2.5. Tap the ^ in your Solution to switch.',
      ex: '2.5*2', exNote: '2.5 is two and a half; 2.5 × 2 = 5.',
      lesson: [['2.5*2', null, '2.5 is 2 and a half. Two of them make 5.'], ['.5+3', null, '.5 is a half: 3 1/2.'], ['12.5', null, 'Three digits can join one point: 12.5 is twelve and a half.']] },
    { id: 'basem', tier: 2, icon: '🛸', name: 'Base m', ref: 'XIII-B-6 Base m', set: 'base',
      rule: 'Count in eights (or nines)! Every number is read in that base, and two cubes can join into a two-digit number in your Solution.',
      ex: '37+5', exNote: 'In base 8, 37 means 3 eights and 7 = 31. 31 + 5 = 36.',
      lesson: [['10', null, 'In base 8, 10 means one eight and nothing more: eight.'], ['37+5', null, 'Base 8: 37 is 3 × 8 + 7 = 31, and 31 + 5 = 36.'], ['6^2', null, '6 squared is 36 in any base. In base 8 an 8 or a 9 cube can\'t be used at all.']] }
  ];
  var STAR_STEP = 4;     // one new card every 4 skill points after the first
  var FIRST_STAGE = 2;   // the first card arrives when the ladder reaches Fractions (+ − × ÷ mastered)
  var KS = [6, 7, 8, 9, 10, 11], BASES = [8, 9], COLS = ['red', 'blue', 'green', 'black'];
  var COLNAME = { red: 'Red', blue: 'Blue', green: 'Green', black: 'Black' };
  function card(id) { return CARDS.filter(function (c) { return c.id === id; })[0] || null; }
  // The card's name with its setting: "Multiple of 7", "Base 8", "Red Exponent".
  function cardName(id, set) {
    var c = card(id); if (!c) return '';
    set = set || (G && G.vari === id ? G.variSet : null) || {};
    if (id === 'multk' && set.k) return 'Multiple of ' + set.k;
    if (id === 'basem' && set.base) return 'Base ' + set.base;
    if (id === 'expo' && set.ecol) return COLNAME[set.ecol] + ' Exponent';
    return c.name;
  }

  // ---- Unlocking ----
  // Skill points = correct Solutions + correct Impossible! calls (both already saved in S.stats).
  function points() { return (S.stats.correct || 0) + (S.stats.impWins || 0); }
  function store() { if (!S.vari || typeof S.vari !== 'object') S.vari = { base: null, seen: 0 }; return S.vari; }
  function enabled() { return !!S.set && S.set.variations !== false; }
  // Parent corner: one switch per card (S.set.variOff[id] = true switches it off). On by default.
  function cardOn(id) { return !(S.set && S.set.variOff && S.set.variOff[id]); }
  // How many cards are unlocked (0-19).
  function unlockedCount() {
    if (!enabled()) return 0;
    if (S.unlockAll) return CARDS.length;
    var gate = (typeof ladderOff === 'function' && ladderOff()) || (S.ladder && S.ladder.stage >= FIRST_STAGE);
    if (!gate) return 0;
    var v = store();
    if (v.base === null || v.base === undefined) { v.base = points(); if (typeof persist === 'function') persist(); }
    return Math.min(CARDS.length, 1 + Math.floor(Math.max(0, points() - v.base) / STAR_STEP));
  }
  function unlocked() { return CARDS.slice(0, unlockedCount()); }

  // ---- Which cards change something this shake ----
  // Official principle (II-B-2; manual "General Principles" 1): a card must have the potential to affect the shake.
  function freeCubes() { return G.cubes.filter(function (c) { return c.zone === 'resources' && !c.locked; }); }
  function opsOn(o) { return !G.ops || G.ops.indexOf(o) >= 0; }
  // Colours that have at least one digit in Resources (Exponent: "no digits of the selected colour" is illegal, XIII-B-9 comment (c)).
  function expoColors() { var f = freeCubes(); return COLS.filter(function (col) { return f.some(function (c) { return c.color === col && Eq.isDigit(c.s); }); }); }
  function hasEffect(id) {
    var f = freeCubes(), syms = f.map(function (c) { return c.s; });
    var digits = syms.filter(Eq.isDigit).length, ops = syms.filter(function (s) { return !Eq.isNumSym(s); }).length; // (BONUS: the big-number die is a number, not an operation)
    var has = function (s) { return syms.indexOf(s) >= 0; }, fr = Eq.fracOn(G.fractions);
    switch (id) {
      case 'twodigit': return digits >= 3;                        // the Goal can take some, two must be left to glue
      case 'multiops': return ops >= 1;
      case 'wild0': return has('0');                              // "illegal to choose 0 Wild with no 0 cube in Resources"
      case 'threeops': return ops >= 3;                           // fewer than 3 signs rolled: no Solution could ever qualify
      case 'remainder': return has('/');
      case 'average': return has('+');                            // "illegal to choose ... Average when no + was rolled" (II-B-2)
      case 'upside': return syms.some(function (s) { return Eq.isDigit(s) && s !== '0'; }); // an upside-down 0 is still 0
      case 'sideways': return fr && syms.some(function (s) { return Eq.isDigit(s) && s !== '0'; });
      case 'expo': return opsOn('^') && expoColors().length > 0;  // powers must be unlocked: an exponent is a power
      case 'multk': return digits >= 2;
      case 'powbase': return has('1');
      case 'factorial': return digits >= 2;
      case 'nfactors': case 'sprime': return has('*');
      case 'lcm': return has('r');
      case 'gcf': return has('^');
      case 'percent': return fr && has('r');
      case 'decimal': return fr && has('^');
      case 'basem': return digits >= 2;                           // every numeral changes meaning; 8 and 9 can't be used
    }
    return false;
  }
  function offered() { return unlocked().filter(function (c) { return cardOn(c.id) && hasEffect(c.id); }).map(function (c) { return c.id; }); }
  // A setting for a card picked by a creature (or the default shown first in the picker).
  function randomSet(id) {
    if (id === 'multk') return { k: KS[Math.floor(Math.random() * KS.length)] };
    if (id === 'basem') return { base: BASES[Math.floor(Math.random() * BASES.length)] };
    if (id === 'expo') { var cs = expoColors(); return { ecol: cs[Math.floor(Math.random() * cs.length)] }; }
    return null;
  }

  // ---- Shake hooks ----
  function unlive() {
    // drop the live G.fractions (Exponent card) and keep its current value as a plain field
    var d = Object.getOwnPropertyDescriptor(G, 'fractions');
    if (d && d.get) { var v = G.fractions; delete G.fractions; G.fractions = v; }
  }
  function reset() {
    if (!G) return;
    unlive();
    G.vari = null; G.variSet = null; G.variDone = false;
    chip();
  }
  // Exponent card: which cubes have the chosen colour is fixed for the shake, but which ZONE each one is in
  // changes with every move, and the solver needs that (a red 2 in Forbidden can't be an exponent). So while
  // this card is in play G.fractions is a live value: every read returns the math mode with fresh counts
  // (Eq.expCounts). Assignments (Vari.afterGoal, game code) are kept as the base. Plain data still goes to the worker.
  function makeLive() {
    var kept = G.fractions;
    delete G.fractions;
    Object.defineProperty(G, 'fractions', { configurable: true, enumerable: true,
      get: function () {
        if (!kept || typeof kept !== 'object' || !G || G.vari !== 'expo') return kept;
        var c = {}; for (var k in kept) c[k] = kept[k];
        c.ex = Eq.expCounts(G.cubes, kept.ecol);
        return c;
      },
      set: function (v) { kept = v; } });
  }
  function apply(id, set) {
    var c = card(id);
    if (!c) return;
    set = set || randomSet(id) || {};
    if (id === 'expo') set = { ecol: set.ecol, eids: G.cubes.filter(function (x) { return x.color === set.ecol && Eq.isDigit(x.s); }).map(function (x) { return x.id; }) };
    G.vari = id; G.variSet = set;
    G.fractions = Eq.mathMode(Eq.fracOn(G.fractions), [id], null, set);
    if (id === 'expo') makeLive();
    chip(true);
  }
  // Called at the start of the Goal phase. Returns true if it took over (it calls again() when done).
  function beforeGoal(again) {
    if (!G || G.variDone || G.mode === 'tutorial') return false;
    G.variDone = true;
    var cards = offered(), v = store();
    if (!cards.length) return false;
    var fresh = unlockedCount() > (v.seen || 0) ? unlocked()[unlockedCount() - 1] : null;
    if (fresh) { v.seen = unlockedCount(); if (typeof persist === 'function') persist(); }
    var P = G.players[G.setter], done = false;
    function go() { if (done) return; done = true; if (G) again(); }
    if (P.ai) {
      var pickId = (typeof AI !== 'undefined' && AI.chooseVariation) ? AI.chooseVariation(P.ai, cards) : null;
      if (!pickId) {
        if (!fresh) return false;
        modal(newCardHTML(fresh), go); return true; // tell the kid about the new card anyway
      }
      apply(pickId);
      var c = card(pickId);
      if (typeof say === 'function') say('opp', 'I pick a card: <b>' + c.icon + ' ' + esc(cardName(pickId)) + '</b>!');
      if (Snd.pop) Snd.pop();
      modal('<h2>' + esc(P.ai.name) + ' picked a card</h2>' + (fresh && fresh.id === pickId ? '<p class="vari-new-line">✨ A brand-new card!</p>' : '') +
        '<div class="vari-cards one">' + cardHTML(c, false, false, G.variSet) + '</div>' +
        '<p class="vari-small">This rule is for this shake only.</p>' +
        '<div class="row"><button class="btn green big" data-act="closeModal">Got it!</button></div>', go);
      return true;
    }
    // A person sets the Goal: offer the cards, with "No card" always there.
    ACT.variPick = function (el) {
      var id = el.dataset.arg || '';
      if (id && card(id) && card(id).set) { if (Snd.click) Snd.click(); pickSetting(id, go); return; }
      if (id) apply(id);
      if (Snd.click) Snd.click();
      closeModal();
    };
    var who = (typeof multiHuman === 'function' && multiHuman()) ? esc(P.name) + ', you' : 'You';
    modal('<h2>Variation card?</h2>' +
      (fresh ? '<p class="vari-new-line">✨ New card unlocked: <b>' + fresh.icon + ' ' + esc(fresh.name) + '</b>!</p>' : '') +
      '<p class="vari-small">' + who + ' set the Goal, so you may pick ONE extra rule for this shake. Or play without one.</p>' +
      '<div class="vari-cards">' + cards.map(function (id) { return cardHTML(card(id), true, fresh && fresh.id === id); }).join('') +
      '<button class="vari-card none" data-act="variPick" data-arg=""><span class="vc-icon">🙂</span><b>No card</b><span class="vc-rule">Normal rules this shake.</span></button></div>', go);
    return true;
  }
  // Cards with a setting: a second small choice (which k, which base, which colour). Official: the
  // player fills in the blank when they circle the card (II-B-1-c).
  function pickSetting(id, go) {
    var c = card(id), opts, label;
    if (id === 'multk') { opts = KS.map(function (k) { return { v: 'k' + k, t: String(k) }; }); label = 'Pick k: the Solution must miss the Goal by k, 2k, 3k, …'; }
    else if (id === 'basem') { opts = BASES.map(function (b) { return { v: 'b' + b, t: 'Base ' + b }; }); label = 'Count in eights or in nines?'; }
    else { opts = expoColors().map(function (col) { return { v: 'c' + col, t: COLNAME[col], col: col }; }); label = 'Which colour of number cube can be an exponent?'; }
    ACT.variSet = function (el) {
      var a = el.dataset.arg || '', set = a[0] === 'k' ? { k: +a.slice(1) } : a[0] === 'b' ? { base: +a.slice(1) } : { ecol: a.slice(1) };
      apply(id, set); if (Snd.click) Snd.click(); closeModal();
    };
    ACT.variBack = function () { G.variDone = false; beforeGoal(go); };
    // replace the open card modal with the setting choice (modal() swaps the page without running the
    // old close callback); closing this one continues the Goal phase
    modal('<h2>' + c.icon + ' ' + esc(c.name) + '</h2><p class="vari-small">' + esc(label) + '</p>' +
      '<div class="vari-set">' + opts.map(function (o) { return '<button class="btn' + (o.col ? ' vari-col vc-' + o.col : '') + '" data-act="variSet" data-arg="' + o.v + '">' + esc(o.t) + '</button>'; }).join('') + '</div>' +
      '<div class="row"><button class="btn small" data-act="variBack">Back to the cards</button></div>', go);
  }
  // After the Goal is set: the math mode learns the Goal's symbols (0 Wild and Factorial use them).
  function afterGoal(tokens) {
    if (!G || !G.vari) return;
    G.fractions = Eq.withGoal(G.fractions, tokens);
    chip();
  }

  // ---- Solver symbols -> real cubes (used by symsToCubeTokens in js/game.js while a card is in play) ----
  // Required cubes first, then Permitted, then Resources (not after the last cube). See Eq.cubeTokens.
  function cubeTokens(list, mode) {
    var pools = zoneCubes('required').concat(zoneCubes('permitted'), (mode === 'last' ? [] : zoneCubes('resources')));
    return Eq.cubeTokens(list, pools, G.fractions);
  }

  // ---- Looks ----
  function cardHTML(c, pickable, isNew, set) {
    var tag = pickable ? 'button' : 'div';
    return '<' + tag + ' class="vari-card' + (c.tier === 2 ? ' mid' : '') + (isNew ? ' new' : '') + '"' + (pickable ? ' data-act="variPick" data-arg="' + c.id + '"' : '') + '>' +
      (isNew ? '<span class="vc-new">NEW</span>' : '') +
      '<span class="vc-icon">' + c.icon + '</span><b>' + esc(set ? cardName(c.id, set) : c.name) + '</b>' +
      '<span class="vc-rule">' + esc(ruleText(c, set)) + '</span>' +
      '<span class="vc-ex">' + exprBox(c.ex.split('')) + '<small>' + esc(c.exNote) + '</small></span></' + tag + '>';
  }
  function ruleText(c, set) {
    set = set || {};
    if (c.id === 'multk' && set.k) return 'Your Solution must NOT equal the Goal. It must miss it by exactly ' + set.k + ', ' + (2 * set.k) + ', ' + (3 * set.k) + ', … (more or less).';
    if (c.id === 'basem' && set.base) return 'Count in ' + (set.base === 8 ? 'eights' : 'nines') + '! Every number is read in base ' + set.base + ' (' + (set.base === 8 ? '8 and 9 don\'t exist' : '9 doesn\'t exist') + '), and two cubes can join into a two-digit number in your Solution.';
    if (c.id === 'expo' && set.ecol) return 'A number on a ' + set.ecol + ' cube can be a power all by itself, with no ^ cube. Tap that cube in your Solution to raise it up.';
    return c.rule;
  }
  function newCardHTML(c) {
    return '<h2>✨ New variation card!</h2><div class="vari-cards one">' + cardHTML(c, false) + '</div>' +
      '<p class="vari-small">When you set the Goal, you may pick a card like this one: an extra rule for that shake only. The creatures may pick one too!</p>' +
      (c.lesson ? '<div class="row"><button class="btn" data-act="variLesson" data-arg="' + c.id + '">How it works</button></div>' : '') +
      '<div class="row"><button class="btn green big" data-act="closeModal">Cool!</button></div>';
  }
  // The small reminder card on the table while a card is in play (tap it to read the rule again).
  function chip(dealt) {
    var host = document.getElementById('game');
    var el = document.getElementById('variChip');
    if (!G || !G.vari || !host) { if (el) el.remove(); return; }
    var c = card(G.vari);
    if (!el || el.parentNode !== host) { if (el) el.remove(); el = document.createElement('button'); el.id = 'variChip'; el.className = 'vari-chip'; el.setAttribute('data-act', 'variInfo'); host.appendChild(el); }
    var note = wildNote() || extraNote();
    el.innerHTML = '<span class="vc-icon">' + c.icon + '</span><span><small>This shake</small><b>' + esc(cardName(G.vari)) + '</b></span>' + (note ? '<em>' + note + '</em>' : '');
    if (dealt) { el.classList.remove('dealt'); void el.offsetWidth; el.classList.add('dealt'); } // one gentle "deal" when it arrives
  }
  ACT.variInfo = function () {
    if (!G || !G.vari) return;
    var c = card(G.vari);
    modal('<h2>This shake\'s card</h2><div class="vari-cards one">' + cardHTML(c, false, false, G.variSet) + '</div><p class="vari-small">Official rule: ' + esc(c.ref) + '.</p>' +
      '<div class="row">' + (c.lesson ? '<button class="btn" data-act="variLesson" data-arg="' + c.id + '">How it works</button>' : '') + '<button class="btn green" data-act="closeModal">OK</button></div>');
  };
  // (keeps the open pop-up's close callback, so a new-card pop-up still continues the Goal phase afterwards)
  ACT.variLesson = function (el) {
    var id = el && el.dataset ? el.dataset.arg : null; if (!id) return;
    var keep = typeof modalOnClose !== 'undefined' ? modalOnClose : null;
    modal(lessonHTML(id) + '<div class="row"><button class="btn green" data-act="closeModal">Got it!</button></div>', keep);
  };
  // 0 Wild with a 0 in the Goal: the Goal's value depends on the 0.
  function wildNote() {
    if (!G || G.vari !== 'wild0' || !G.goalTokens || !G.goalTokens.some(function (t) { return (typeof t === 'string' ? t : t.s) === '0'; })) return '';
    return 'The 0 in the Goal is wild too';
  }
  // A one-line reminder under the chip for cards that change what counts as a Solution.
  function extraNote() {
    if (!G || !G.vari) return '';
    var set = G.variSet || {};
    if (G.vari === 'multk') return 'Miss the Goal by ' + set.k + ', ' + (2 * set.k) + ', ' + (3 * set.k) + '…';
    if (G.vari === 'basem') return 'Count in ' + (set.base === 8 ? 'eights' : 'nines');
    if (G.vari === 'factorial' && G.goalTokens) { var b = Eq.bangsIn(G.goalTokens); return (2 - b) + ' ! left for Solutions'; }
    return '';
  }
  // For the builders: one line about the card in play (empty if none).
  function builderNote(m) {
    var vs = Eq.varsOf(m);
    if (!vs.length) return '';
    var set = (m && typeof m === 'object') ? m : {};
    return vs.map(function (id) { var c = card(id); return c ? '<div class="vari-note"><span class="vc-icon">' + c.icon + '</span><b>' + esc(cardName(id, set)) + ':</b> ' + esc(ruleText(c, set)) + '</div>' : ''; }).join('');
  }
  function on() { return !!(G && G.vari); }

  // ---- Teaching: "How it works" with 2-3 worked examples (for Training Camp or the card pop-up) ----
  // Returns HTML (no buttons): the card, then each example with its value worked out by the real engine.
  function lessonHTML(id) {
    var c = card(id); if (!c) return '';
    var set = id === 'multk' ? { k: 6 } : id === 'basem' ? { base: 8 } : id === 'expo' ? { ecol: 'green' } : null;
    var m = Eq.mathMode(true, [id], null, set);
    var rows = (c.lesson || [[c.ex, null, c.exNote]]).map(function (L) {
      var toks = L[0].split(''), ev = Eq.evaluate(toks, { fractions: m, multiDigit: id === 'basem' || /^\d\d$/.test(L[0]) });
      var v = ev.ok ? ' = <b>' + Eq.fmt(ev.value) + '</b>' + (id === 'basem' ? ' <small>(in base ten)</small>' : '') : '';
      var goal = L[1] ? '<span class="vl-goal">Goal ' + esc(L[1]) + '</span>' : '';
      return '<div class="vl-row">' + goal + '<div class="vl-expr">' + exprHTML(toks, null, m) + '<span class="vl-val">' + v + '</span></div><p>' + esc(L[2]) + '</p></div>';
    }).join('');
    return '<h2>' + c.icon + ' How it works: ' + esc(c.name) + '</h2><p class="vari-small">' + esc(c.rule) + '</p><div class="vari-lesson">' + rows + '</div>' +
      '<p class="vari-small">Official rule: ' + esc(c.ref) + '.</p>';
  }

  // ---- Drawing an expression with the card's meanings visible (used by the builder and the lessons) ----
  // A turned cube is drawn turned (upside-down / on its side) with a small label underneath ("−3", "1/3");
  // a cube with a second meaning shows its face plus a label (avg, lcm, gcf, %, point, # factors, next prime,
  // 10, 100 …); an exponent is drawn small and raised. cubes = G.cubes (for colours) or null.
  var CAP = { a: 'average', l: 'lcm', g: 'gcf', '%': 'percent of', '.': 'point', f: '# factors', p: 'next prime', m: 'remainder' }; // (m added with the BONUS dice: a sideways ÷ in an end-of-shake Solution showed as a plain ÷)
  function capOf(s, RU, tokens, i) {
    var o = Eq.orient(s);
    if (o && o.o === 'u') return o.d ? '−' + o.d : '0';
    if (o && o.o === 's') return '1/' + o.d;
    if (Eq.pobOf(s) !== null) return Eq.SHOW[s];
    if (Eq.exOf(s) >= 0) return 'power';
    if (CAP[s]) return CAP[s];
    if (s === '*' && RU && (RU.nfac || RU.sprime) && tokens) { // a plain × read by its place
      var prev = i > 0 ? (typeof tokens[i - 1] === 'string' ? tokens[i - 1] : tokens[i - 1].s) : null;
      var operand = prev !== null && (Eq.isNumSym(prev) || prev === ')' || prev === '!' || Eq.exOf(prev) >= 0);
      if (!operand) return RU.nfac ? '# factors' : 'next prime';
    }
    if (s === '+' && RU && RU.avg) return 'average';
    return '';
  }
  // act(i, s) = optional extra attributes for token i (the builder: data-act="bCycle" or "bRemove");
  // xFor(i) = true puts a small ✕ on token i (to take a turnable cube back out).
  // cubeCls = the cube size class ('mini' by default; '' for full-size cubes on the flat mat).
  function exprHTML(tokens, cubes, m, act, xFor, cubeCls) {
    if (cubeCls === undefined) cubeCls = 'mini';
    var RU = Eq.rulesOf(m);
    return tokens.map(function (t, i) {
      var s = typeof t === 'string' ? t : t.s;
      var actAttr = typeof act === 'function' ? act(i, s) : act;
      if (s === '(' || s === ')') return '<span class="paren"' + (actAttr ? ' ' + actAttr : '') + ' data-bi="' + i + '">' + s + '</span>';
      if (s === '!') return '<span class="vari-bang"' + (actAttr ? ' ' + actAttr : '') + ' data-bi="' + i + '">!</span>';
      var color = (typeof t === 'object' && t.id != null && cubes && cubes[t.id]) ? cubes[t.id].color : 'none';
      var face = Eq.cubeOf(s) || s, o = Eq.orient(s), cls = '';
      if (o && o.o === 'u') cls = ' vt-ud'; else if (o && o.o === 's') cls = ' vt-sw';
      if (Eq.exOf(s) >= 0) cls = ' vt-exp';
      if (s === '%') cls = ' vt-ud';                         // Percent: an upside-down √
      var cap = capOf(s, RU, tokens, i);
      return '<span class="vtok' + cls + (cap ? ' cap' : '') + '"' + (actAttr ? ' ' + actAttr : '') + ' data-bi="' + i + '"><span class="cube ' + cubeCls + ' c-' + color + '"><span>' + (face === s ? Eq.SHOW[s] || s : (Eq.SHOW[face] || face)) + '</span></span>' + (cap ? '<small>' + esc(cap) + '</small>' : '') +
        (xFor && xFor(i) ? '<b class="vx" data-act="bRemove" data-bi="' + i + '" title="Take it out">✕</b>' : '') + '</span>';
    }).join('');
  }

  // The Goal drawn with the card's meanings (a turned cube turned, an average labelled, ...), for js/game.js.
  // Returns '' when no card is in play or nothing in the Goal has a second meaning, so the game draws it as always.
  // size: '' for the flat mat's full-size cubes, 'mini' for the 3D HUD.
  function goalHTML(size) {
    if (!G || !G.vari || !G.goalTokens || !G.goalTokens.length) return '';
    var RU = Eq.rulesOf(G.fractions);
    var special = G.goalTokens.some(function (t, i) { var s = typeof t === 'string' ? t : t.s; return s === '!' || !!capOf(s, RU, G.goalTokens, i); });
    if (!special) return '';
    return '<span class="vari-goal">' + exprHTML(G.goalTokens, G.cubes, G.fractions, null, null, size === undefined ? '' : size) + '</span>';
  }

  // ---- Parent corner: one switch per card ----
  // js/screens.js puts Vari.parentHTML() inside the Parent corner (see docs/handoff/vari2.md).
  function parentHTML() {
    var n = unlockedCount();
    return '<div class="setrow vari-parent"><label>Which variation cards may be offered<br><small style="font-weight:600">Unlocked so far: ' + n + ' of ' + CARDS.length +
      '. The first five are Elementary; the rest are Middle-division cards (upside-down numbers, averages, factorials, bases…). Tap a card to switch it off or on.</small></label>' +
      '<div class="vari-switches">' + CARDS.map(function (c, i) {
        var onNow = cardOn(c.id), got = i < n;
        return '<button class="btn small ' + (onNow ? 'green' : '') + (got ? '' : ' vari-locked') + '" data-act="variToggle" data-arg="' + c.id + '" title="' + esc(c.ref) + '">' + c.icon + ' ' + esc(c.name) + (got ? '' : ' 🔒') + '</button>';
      }).join('') + '</div></div>';
  }
  ACT.variToggle = function (el) {
    var id = el.dataset.arg; if (!card(id)) return;
    if (!S.set.variOff || typeof S.set.variOff !== 'object') S.set.variOff = {};
    if (S.set.variOff[id]) delete S.set.variOff[id]; else S.set.variOff[id] = true;
    if (typeof persist === 'function') persist();
    if (Snd.click) Snd.click();
    if (typeof renderSettings === 'function') renderSettings();
  };

  return { CARDS: CARDS, card: card, cardName: cardName, unlocked: unlocked, unlockedCount: unlockedCount, offered: offered, hasEffect: hasEffect,
    reset: reset, apply: apply, beforeGoal: beforeGoal, afterGoal: afterGoal, cubeTokens: cubeTokens, builderNote: builderNote,
    wildNote: wildNote, chip: chip, on: on, cardHTML: cardHTML, cardOn: cardOn, lessonHTML: lessonHTML, exprHTML: exprHTML, capOf: capOf,
    parentHTML: parentHTML, goalHTML: goalHTML, randomSet: randomSet, STAR_STEP: STAR_STEP, FIRST_STAGE: FIRST_STAGE };
})();
