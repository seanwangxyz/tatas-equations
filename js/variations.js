'use strict';
// ======================= VARIATION CARDS =======================
// Adventurous Equations "variations" (official rulebook, PDF section II-B and XIII-A): an extra rule
// for ONE shake, chosen after the roll and before the Goal is set. See RULES_SUMMARY.md, "Variations".
//
// How it plugs in (small, commented hooks in js/game.js):
//   newShake       -> Vari.reset()             (no card yet; the old true/false fractions value is back)
//   startGoalPhase -> Vari.beforeGoal(again)   (the Goal-setter may pick a card; the creature may pick one)
//   setGoal        -> Vari.afterGoal(tokens)   (0 Wild needs to know which cubes are in the Goal)
//   symsToCubeTokens -> Vari.cubeTokens(...)   (a sideways ÷ and re-used operation cubes)
// The card itself travels to every solver call inside G.fractions, which becomes a "math mode"
// (Eq.mathMode: {fractions, vars, goal}) while a card is in play. With no card it stays true/false,
// so a shake without a card is exactly the old game.
//
// SIMPLIFIED on purpose (also listed in RULES_SUMMARY.md):
//   - Officially EVERY player picks a card (in 2-player games the other player must pick TWO).
//     Here only the Goal-setter may pick, at most one card, and "No card" is always allowed.
//   - Officially there is a 15-second limit to choose. Here there is no timer.
//   - Officially a card that "has no effect" (like 0 Wild with no 0 rolled) costs a point. Here such
//     cards are simply not offered.
var Vari = (function () {
  // In the order they unlock. ex = a tiny example (internal symbols), exNote = what it shows.
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
      ex: '7m3', exNote: '7 ÷ 3 is 2 with 1 left over, so 7 rem 3 = 1.' }
  ];
  var STAR_STEP = 4;     // one new card every 4 skill points after the first
  var FIRST_STAGE = 2;   // the first card arrives when the ladder reaches Fractions (+ − × ÷ mastered)
  function card(id) { return CARDS.filter(function (c) { return c.id === id; })[0] || null; }

  // ---- Unlocking ----
  // Skill points = correct Solutions + correct Impossible! calls (both already saved in S.stats).
  function points() { return (S.stats.correct || 0) + (S.stats.impWins || 0); }
  function store() { if (!S.vari || typeof S.vari !== 'object') S.vari = { base: null, seen: 0 }; return S.vari; }
  function enabled() { return !!S.set && S.set.variations !== false; }
  // How many cards are unlocked (0-5).
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
  function freeCubes() { return G.cubes.filter(function (c) { return c.zone === 'resources' && !c.locked; }); }
  function hasEffect(id) {
    var f = freeCubes(), syms = f.map(function (c) { return c.s; });
    var digits = syms.filter(Eq.isDigit).length, ops = syms.filter(function (s) { return !Eq.isDigit(s); }).length;
    switch (id) {
      case 'twodigit': return digits >= 3;                        // the Goal can take some, two must be left to glue
      case 'multiops': return ops >= 1;
      case 'wild0': return syms.indexOf('0') >= 0;                // "illegal to choose 0 Wild with no 0 cube in Resources"
      case 'threeops': return ops >= 3;                           // fewer than 3 signs rolled: no Solution could ever qualify
      case 'remainder': return syms.indexOf('/') >= 0;
    }
    return false;
  }
  function offered() { return unlocked().filter(function (c) { return hasEffect(c.id); }).map(function (c) { return c.id; }); }

  // ---- Shake hooks ----
  function reset() {
    if (!G) return;
    G.vari = null; G.variDone = false;
    chip();
  }
  function apply(id) {
    var c = card(id);
    if (!c) return;
    G.vari = id;
    G.fractions = Eq.mathMode(Eq.fracOn(G.fractions), [id]);
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
      if (typeof say === 'function') say('opp', 'I pick a card: <b>' + c.icon + ' ' + esc(c.name) + '</b>!');
      if (Snd.pop) Snd.pop();
      modal('<h2>' + esc(P.ai.name) + ' picked a card</h2>' + (fresh && fresh.id === pickId ? '<p class="vari-new-line">✨ A brand-new card!</p>' : '') +
        '<div class="vari-cards one">' + cardHTML(c, false) + '</div>' +
        '<p class="vari-small">This rule is for this shake only.</p>' +
        '<div class="row"><button class="btn green big" data-act="closeModal">Got it!</button></div>', go);
      return true;
    }
    // A person sets the Goal: offer the cards, with "No card" always there.
    ACT.variPick = function (el) {
      var id = el.dataset.arg || '';
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
  // After the Goal is set: the math mode learns the Goal's symbols (0 Wild uses them).
  function afterGoal(tokens) {
    if (!G || !G.vari) return;
    G.fractions = Eq.withGoal(G.fractions, tokens);
    chip();
  }

  // ---- Solver symbols -> real cubes (used by symsToCubeTokens in js/game.js while a card is in play) ----
  // 'm' (a sideways ÷) uses a ÷ cube. With Multiple Operations an operation symbol that has no fresh
  // cube re-uses the cube already used for it (Required cubes first, so every Required cube is used).
  function cubeTokens(list, mode) {
    var RU = Eq.rulesOf(G.fractions);
    var req = zoneCubes('required'), pools = req.concat(zoneCubes('permitted'), (mode === 'last' ? [] : zoneCubes('resources'))), used = {}, again = {};
    return list.map(function (s) {
      if (s === '(' || s === ')') return s;
      var cs = s === 'm' ? '/' : s, c = null;
      if (RU.multi && !Eq.isDigit(s)) {
        c = req.find(function (x) { return x.s === cs && !used[x.id] && !x.locked; });
        if (!c && again[cs] !== undefined) return { s: s, id: again[cs] };
      }
      if (!c) c = pools.find(function (x) { return x.s === cs && !used[x.id] && !x.locked; });
      if (!c) return { s: s, id: -1 };
      used[c.id] = 1; again[cs] = c.id;
      return { s: s, id: c.id };
    });
  }

  // ---- Looks ----
  function cardHTML(c, pickable, isNew) {
    var tag = pickable ? 'button' : 'div';
    return '<' + tag + ' class="vari-card' + (isNew ? ' new' : '') + '"' + (pickable ? ' data-act="variPick" data-arg="' + c.id + '"' : '') + '>' +
      (isNew ? '<span class="vc-new">NEW</span>' : '') +
      '<span class="vc-icon">' + c.icon + '</span><b>' + esc(c.name) + '</b>' +
      '<span class="vc-rule">' + esc(c.rule) + '</span>' +
      '<span class="vc-ex">' + exprBox(c.ex.split('')) + '<small>' + esc(c.exNote) + '</small></span></' + tag + '>';
  }
  function newCardHTML(c) {
    return '<h2>✨ New variation card!</h2><div class="vari-cards one">' + cardHTML(c, false) + '</div>' +
      '<p class="vari-small">When you set the Goal, you may pick a card like this one: an extra rule for that shake only. The creatures may pick one too!</p>' +
      '<div class="row"><button class="btn green big" data-act="closeModal">Cool!</button></div>';
  }
  // The small reminder card on the table while a card is in play (tap it to read the rule again).
  function chip(dealt) {
    var host = document.getElementById('game');
    var el = document.getElementById('variChip');
    if (!G || !G.vari || !host) { if (el) el.remove(); return; }
    var c = card(G.vari);
    if (!el || el.parentNode !== host) { if (el) el.remove(); el = document.createElement('button'); el.id = 'variChip'; el.className = 'vari-chip'; el.setAttribute('data-act', 'variInfo'); host.appendChild(el); }
    el.innerHTML = '<span class="vc-icon">' + c.icon + '</span><span><small>This shake</small><b>' + esc(c.name) + '</b></span>' + (wildNote() ? '<em>' + wildNote() + '</em>' : '');
    if (dealt) { el.classList.remove('dealt'); void el.offsetWidth; el.classList.add('dealt'); } // one gentle "deal" when it arrives
  }
  ACT.variInfo = function () {
    if (!G || !G.vari) return;
    var c = card(G.vari);
    modal('<h2>This shake\'s card</h2><div class="vari-cards one">' + cardHTML(c, false) + '</div><p class="vari-small">Official rule: ' + esc(c.ref) + '.</p><div class="row"><button class="btn green" data-act="closeModal">OK</button></div>');
  };
  // 0 Wild with a 0 in the Goal: the Goal's value depends on the 0.
  function wildNote() {
    if (!G || G.vari !== 'wild0' || !G.goalTokens || !G.goalTokens.some(function (t) { return (typeof t === 'string' ? t : t.s) === '0'; })) return '';
    return 'The 0 in the Goal is wild too';
  }
  // For the builders: one line about the card in play (empty if none).
  function builderNote(m) {
    var vs = Eq.varsOf(m);
    if (!vs.length) return '';
    return vs.map(function (id) { var c = card(id); return c ? '<div class="vari-note"><span class="vc-icon">' + c.icon + '</span><b>' + esc(c.name) + ':</b> ' + esc(c.rule) + '</div>' : ''; }).join('');
  }
  function on() { return !!(G && G.vari); }

  return { CARDS: CARDS, card: card, unlocked: unlocked, unlockedCount: unlockedCount, offered: offered, hasEffect: hasEffect,
    reset: reset, apply: apply, beforeGoal: beforeGoal, afterGoal: afterGoal, cubeTokens: cubeTokens, builderNote: builderNote,
    wildNote: wildNote, chip: chip, on: on, cardHTML: cardHTML, STAR_STEP: STAR_STEP, FIRST_STAGE: FIRST_STAGE };
})();
