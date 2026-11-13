'use strict';
// ======================= TOURNAMENT PRACTICE + JUDGE PIP =======================
// A match run the way an Academic Games tournament runs it (AGLOA Equations Tournament Rules 2026-27, read from the
// PDF; the judges' manual is cited by situation number only, never copied). RULES_SUMMARY.md section 8 lists what is
// official, what is interpreted (⚠) and what is left out. docs/handoff/tourney.md has the hooks and snippets.
//
// Two parts:
//   TourneyRules  pure rules (no page): the division lists, "may I pick this card?", match points, the first
//                 Goal-setter roll, bonus-move eligibility, ambiguity notes. tests/engine.test.js and
//                 tests/playtest.js load this part in node.
//   Tourney       the mode on the page (mode 'tourney' in js/game.js): setup, intro, card picking for every player,
//                 bonus moves, the optional practice clock, strict penalties (off by default), match points, the
//                 saved record S.tourney, and Judge Pip (also reachable from normal matches).

// ----------------------------------------------------------------------------------------------------------------
var TourneyRules = (function () {
  // The 2026-27 lists (PDF section XIII). Elementary: XIII-A-1..7 every year + the odd-year group XIII-A-8..11
  // ("These odd-year variations will be played in Elementary in 2026-27"). Middle: XIII-B-1..5 (Elementary cards also
  // played in Middle), B-6, B-7 (every year), B-8 (Elementary odd-year card played in Middle in 2026-27), B-9, B-10.
  var LISTS = {
    E: ['sideways', 'upside', 'wild0', 'factorial', 'multiops', 'threeops', 'remainder', 'twodigit', 'lcm', 'gcf', 'nfactors'],
    M: ['sideways', 'upside', 'wild0', 'factorial', 'multiops', 'basem', 'multk', 'nfactors', 'expo', 'powbase']
  };
  var REF = {
    sideways: { E: 'XIII-A-1', M: 'XIII-B-1' }, upside: { E: 'XIII-A-2', M: 'XIII-B-2' }, wild0: { E: 'XIII-A-3', M: 'XIII-B-3' },
    factorial: { E: 'XIII-A-4', M: 'XIII-B-4' }, multiops: { E: 'XIII-A-5', M: 'XIII-B-5' }, threeops: { E: 'XIII-A-6' },
    remainder: { E: 'XIII-A-7' }, twodigit: { E: 'XIII-A-8' }, lcm: { E: 'XIII-A-9' }, gcf: { E: 'XIII-A-10' },
    nfactors: { E: 'XIII-A-11', M: 'XIII-B-8' }, basem: { M: 'XIII-B-6' }, multk: { M: 'XIII-B-7' }, expo: { M: 'XIII-B-9' }, powbase: { M: 'XIII-B-10' }
  };
  var NAME = { sideways: 'Sideways', upside: 'Upside-down', wild0: '0 is Wild', factorial: 'Factorial', multiops: 'Use It Again', threeops: 'Three Operations',
    remainder: 'Remainder', twodigit: 'Two-digit Numbers', lcm: 'LCM', gcf: 'GCF', nfactors: 'Number of Factors', basem: 'Base m', multk: 'Multiple of k',
    expo: 'Exponent Colour', powbase: 'Powers of the Base' };
  // Cards and pairs the game does not offer in practice yet (too subtle to get exactly right; RULES_SUMMARY.md 8).
  var NOT_YET_CARD = { M: { wild0: 'In the Middle list a 0 may stand for ANY symbol, even an operation (XIII-B-3). The game only knows the Elementary 0 that stands for a digit, so this card is not in Middle practice yet.' } };
  var NOT_YET_PAIR = [
    ['expo', 'sideways', 'With Exponent Colour, a sideways cube could itself be an exponent (manual E52). The game cannot draw or check a turned exponent yet.'],
    ['expo', 'upside', 'With Exponent Colour, an upside-down cube could itself be an exponent (manual E53). The game cannot draw or check a turned exponent yet.'],
    ['expo', 'powbase', 'A 1 of the exponent colour could be both an exponent and a power of the base (manual F25). The game cannot check that yet.'],
    ['expo', 'factorial', 'A ! written behind an exponent can belong to the exponent (XIII-B-9 comment (b)). The game reads ! differently, so this pair is not in practice yet.']
  ];
  // Short kid-level notes about how two cards mix (shown when both are in a shake). Our own words; manual numbers cited.
  var PAIR_NOTE = {
    'sideways+upside': ['In a Solution (not the Goal) one cube can be BOTH sideways and upside-down: 3 becomes −1/3.', 'XIII-A-2 comment (a), manual F1'],
    'sideways+wild0': ['A wild 0 can be turned sideways: if the 0 stands for 6, a sideways 0 is 1/6. Every 0 still stands for the same digit.', 'manual F2'],
    'upside+wild0': ['A wild 0 can be turned upside-down: if the 0 stands for 6, it is −6. A 0 in the Goal looks the same upside-down, so it may be read either way.', 'manual F3, General Principle 11'],
    'factorial+sideways': ['A factorial needs a whole number, so (1/3)! does not work.', 'manual F6'],
    'factorial+upside': ['A factorial needs a whole number 0 or more, so (−3)! does not work.', 'manual F7'],
    'factorial+multiops': ['Your Solution may use as many ! as you like. The Goal still has at most two.', 'XIII-A-5'],
    'factorial+threeops': ['A ! counts as one of the three operation signs.', 'XIII-A-6'],
    'factorial+nfactors': ['×7! could mean ×(7!) or (×7)!. A real judge calls that ambiguous, so add ( ). The game reads it as ×(7!).', 'manual E41'],
    'multiops+nfactors': ['A × can count factors again and again: ××12 = #(#12) = 4. The same × can multiply too.', 'manual F4, F5'],
    'lcm+multiops': ['A √ can be used again, sometimes as LCM and sometimes as a root.', 'manual F10'],
    'gcf+multiops': ['A ^ can be used again, sometimes as GCF and sometimes as a power.', 'manual F10'],
    'nfactors+sideways': ['Number of Factors needs a counting number, so #(1/3) does not work.', 'manual F8'],
    'nfactors+threeops': ['A × used to count factors is an operation sign too.', 'XIII-A-6 comment'],
    'remainder+threeops': ['A sideways ÷ (remainder) is an operation sign too.', 'XIII-A-6 comment'],
    'lcm+threeops': ['A √ used as LCM is an operation sign too.', 'XIII-A-6 comment'],
    'gcf+threeops': ['A ^ used as GCF is an operation sign too.', 'XIII-A-6 comment'],
    'twodigit+upside': ['A turned cube is a number by itself: it can never be half of a two-digit number.', 'XIII-A-2 example'],
    'sideways+twodigit': ['A turned cube is a number by itself: it can never be half of a two-digit number.', 'XIII-A-2 example, manual F15'],
    'basem+multk': ['First count the Goal in tens, then add or take away k, 2k, 3k …', 'manual F23'],
    'basem+sideways': ['Two sideways cubes can not make one two-digit number.', 'manual F15'],
    'basem+upside': ['Two upside-down cubes can not make one two-digit number.', 'manual F16'],
    'basem+powbase': ['A 1 stands for a power of the BASE: in base 8 it can be 8, 64, 1/8 …', 'XIII-B-10'],
    'basem+expo': ['An exponent must be a digit of the base too: in base 8 a black 8 or 9 can not be anything.', 'manual A27'],
    'powbase+upside': ['An upside-down 1 can be −10, −100, −0.1 …', 'manual F17'],
    'powbase+sideways': ['A sideways 1 is allowed, but 0.1, 0.01 … are already powers of ten, so it adds nothing new.', 'manual F14'],
    'multk+wild0': ['Find what the 0 stands for first, then miss the Goal by k, 2k, 3k …', 'XIII-B-7']
  };
  function pairKey(a, b) { return [a, b].sort().join('+'); }
  function notYetPair(a, b) { for (var i = 0; i < NOT_YET_PAIR.length; i++) { var p = NOT_YET_PAIR[i]; if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return p[2]; } return ''; }

  // ctx = { res: [{s, color}] } the Resource cubes when cards are picked. chosen = [{id, set}] picked so far this shake.
  function ids(chosen) { return (chosen || []).map(function (c) { return c.id; }); }
  function setOf(chosen, id) { var c = (chosen || []).filter(function (x) { return x.id === id; })[0]; return c ? (c.set || {}) : null; }
  function canAffect(id, set, ctx, chosen) {
    var res = (ctx && ctx.res) || [], syms = res.map(function (c) { return c.s; }), has = function (s) { return syms.indexOf(s) >= 0; };
    var digits = syms.filter(Eq.isDigit), ops = syms.filter(function (s) { return !Eq.isDigit(s); }).length, ch = ids(chosen);
    var bset = setOf(chosen, 'basem'), base = bset && bset.base ? bset.base : 10;
    var wild = ch.indexOf('wild0') >= 0 && has('0');
    switch (id) {
      case 'sideways': case 'upside': return digits.some(function (d) { return d !== '0' && +d < base; }) || wild; // a nonzero numeral (a wild 0 may stand for one, manual F2/F3)
      case 'wild0': return has('0');                                // "illegal to choose 0 Wild with no 0 cube in Resources" (II-B-2)
      case 'factorial': return digits.length >= 1;
      case 'multiops': return ops >= 1;
      case 'threeops': return ops + (ch.indexOf('factorial') >= 0 ? 2 : 0) >= 3 || (ch.indexOf('multiops') >= 0 && ops >= 1); // ⚠ enough signs could ever be written
      case 'remainder': return has('/');
      case 'twodigit': return digits.length >= 3;                   // ⚠ some left over after a Goal to glue together
      case 'lcm': return has('r');
      case 'gcf': return has('^');
      case 'nfactors': return has('*');
      case 'basem': return set && +set.base === 10 ? digits.length >= 3 : digits.length >= 1;
      case 'multk': return digits.length >= 1;
      case 'expo': return !!(set && res.some(function (c) { return c.color === set.ecol && Eq.isDigit(c.s) && +c.s < base; })); // XIII-B-9 comment (c), manual A27
      case 'powbase': return has('1');
    }
    return false;
  }
  var COLS = ['red', 'blue', 'green', 'black'];
  function settingsFor(id, ctx, chosen) {
    if (id === 'multk') return [6, 7, 8, 9, 10, 11].map(function (k) { return { k: k }; });
    if (id === 'basem') return [8, 9, 10].map(function (b) { return { base: b }; });
    if (id === 'expo') return COLS.filter(function (c) { return canAffect('expo', { ecol: c }, ctx, chosen); }).map(function (c) { return { ecol: c }; });
    return null;
  }
  function settingOk(id, set) {
    if (id === 'multk') return !!set && set.k >= 6 && set.k <= 11;
    if (id === 'basem') return !!set && [8, 9, 10].indexOf(+set.base) >= 0;
    if (id === 'expo') return !!set && COLS.indexOf(set.ecol) >= 0;
    return true;
  }
  // May this player pick card id (with setting set) now? -> {ok} or {ok:false, code, why, ref}
  function check(id, set, chosen, ctx, div) {
    var list = LISTS[div] || LISTS.E, nm = NAME[id] || id;
    if (list.indexOf(id) < 0) return { ok: false, code: 'notlist', why: nm + ' is not on the ' + (div === 'M' ? 'Middle' : 'Elementary') + ' list this year.', ref: 'XIII' };
    if (ids(chosen).indexOf(id) >= 0) return { ok: false, code: 'already', why: nm + ' was already picked for this shake. A card can only be picked once, even with a different number or colour.', ref: 'II-B-2' };
    var ny = NOT_YET_CARD[div] && NOT_YET_CARD[div][id];
    if (ny) return { ok: false, code: 'notyet', why: ny, ref: REF[id] && REF[id][div] };
    for (var i = 0; i < (chosen || []).length; i++) { var w = notYetPair(id, chosen[i].id); if (w) return { ok: false, code: 'notyet', why: w + ' (Pick a different card: this is a game limit, not a rule, so it never costs a point.)', ref: '' }; }
    if (!settingOk(id, set)) return { ok: false, code: 'setting', why: 'Fill in the blank first (which ' + (id === 'multk' ? 'k' : id === 'basem' ? 'base' : 'colour') + ').', ref: 'II-B-1-c, manual A7' };
    if (!canAffect(id, set, ctx, chosen)) return { ok: false, code: 'noeffect', why: noEffectWhy(id, set, chosen), ref: 'II-B-2, General Principle 1' + (id === 'expo' ? ', XIII-B-9 comment (c), A27' : ', A6') };
    return { ok: true };
  }
  function noEffectWhy(id, set, chosen) {
    var bset = setOf(chosen, 'basem');
    switch (id) {
      case 'wild0': return 'There is no 0 in Resources, so 0 is Wild could never change this shake.';
      case 'remainder': return 'There is no ÷ in Resources to turn sideways.';
      case 'lcm': return 'There is no √ in Resources to use as LCM.';
      case 'gcf': return 'There is no ^ in Resources to use as GCF.';
      case 'nfactors': return 'There is no × in Resources to count factors with.';
      case 'powbase': return 'There is no 1 in Resources to stand for 10, 100, …';
      case 'multiops': return 'There is no operation cube in Resources to use again.';
      case 'threeops': return 'Not enough operation signs were rolled to ever write three of them.';
      case 'twodigit': return 'There are not enough number cubes left to glue two together.';
      case 'sideways': case 'upside': return 'There is no number cube (other than 0) to turn.';
      case 'expo': return 'There is no ' + (set && set.ecol || 'such') + ' number cube in Resources' + (bset ? ' that is a digit in base ' + bset.base : '') + ', so that colour could never be an exponent.';
    }
    return 'This card could not change anything in this shake.';
  }
  function legalFor(div, chosen, ctx) {
    return (LISTS[div] || LISTS.E).map(function (id) {
      var sets = settingsFor(id, ctx, chosen);
      if (sets) { sets = sets.filter(function (s) { return check(id, s, chosen, ctx, div).ok; }); return sets.length ? { id: id, sets: sets } : null; }
      return check(id, null, chosen, ctx, div).ok ? { id: id, sets: null } : null;
    }).filter(Boolean);
  }
  // Who picks, in order: the Goal-setter, then to the left (II-B-1). Two players: the other player picks TWO (II-B-3).
  function pickOrder(setter, n) {
    if (n === 2) return [{ p: setter, k: 1 }, { p: (setter + 1) % 2, k: 2 }];
    var out = []; for (var i = 0; i < n; i++) out.push({ p: (setter + i) % n, k: 1 }); return out;
  }
  // Bonus moves (IV-C, V-C): only a player who is not leading. Tied for the lead is fine (V-C comment (a)).
  function leading(scores, i) { return scores.every(function (s, j) { return j === i || scores[i] > s; }); }
  // Match points (XII-A). scores = shake totals. -> [{pts, place, tie}]
  function matchPoints(scores) {
    var n = scores.length;
    return scores.map(function (s) {
      var above = scores.filter(function (x) { return x > s; }).length, same = scores.filter(function (x) { return x === s; }).length;
      var place = above + 1, pts;
      if (n === 2) pts = above ? 4 : same === 2 ? 5 : 6;
      else if (place === 1) pts = same === 1 ? 6 : same === 2 ? 5 : 4;
      else if (place === 2) pts = same === 1 ? 4 : 3;
      else pts = 2;
      return { pts: pts, place: place, tie: same > 1 };
    });
  }
  // The first Goal-setter (I-D, manual A1): each player rolls a red cube; an operation sign is out unless everyone
  // rolled one; the highest digit sets the first Goal; ties roll again. faces[i] = the red face player who[i] rolled.
  function rollRound(who, faces) {
    var dig = who.filter(function (p, i) { return Eq.isDigit(faces[i]); });
    if (!dig.length) return { again: who.slice(), why: 'everyone rolled an operation sign' };
    var best = Math.max.apply(null, dig.map(function (p) { return +faces[who.indexOf(p)]; }));
    var top = dig.filter(function (p) { return +faces[who.indexOf(p)] === best; });
    return top.length === 1 ? { winner: top[0] } : { again: top, why: 'a tie for the highest digit' };
  }
  // Notes about expressions a real judge would call ambiguous (VII-B-6-c; manual E41, E46, E54, E55). The game reads
  // them one way (it shows the value it used); the Judge says when a tournament checker could read them another way.
  function ambiguities(tokens, m) {
    var RU = Eq.rulesOf(m), s = Eq.resolve(tokens || [], m).map(function (t) { return typeof t === 'string' ? t : t.s; }), out = [];
    function operandBefore(i) { var p = s[i - 1]; return i > 0 && (Eq.isNumSym(p) || p === ')' || p === '!' || Eq.exOf(p) >= 0); }
    for (var i = 0; i < s.length; i++) {
      var pre = (s[i] === 'r' && !operandBefore(i)) || s[i] === 'f' || s[i] === 'p';
      if (!pre) continue;
      var j = i + 1; if (!(j < s.length && Eq.isNumSym(s[j]))) continue;
      while (j < s.length && Eq.isDigit(s[j]) && Eq.isDigit(s[j + 1])) j++;
      var after = s[j + 1];
      if (after === '!' || Eq.exOf(after) >= 0) out.push((s[i] === 'r' ? '√' : '×') + ' in front and ' + (after === '!' ? '!' : 'an exponent') + ' behind the same number: a tournament checker may read it two ways. Add ( ) to show which one you mean. (The game reads it with the ' + (after === '!' ? '!' : 'exponent') + ' first.)');
    }
    return out.filter(function (x, k) { return out.indexOf(x) === k; });
  }
  return { LISTS: LISTS, REF: REF, NAME: NAME, NOT_YET_CARD: NOT_YET_CARD, NOT_YET_PAIR: NOT_YET_PAIR, PAIR_NOTE: PAIR_NOTE, pairKey: pairKey, notYetPair: notYetPair,
    canAffect: canAffect, settingsFor: settingsFor, check: check, legalFor: legalFor, pickOrder: pickOrder, leading: leading, matchPoints: matchPoints,
    rollRound: rollRound, ambiguities: ambiguities };
})();

// ----------------------------------------------------------------------------------------------------------------
// The mode on the page. Everything below only runs in the browser.
var Tourney = (function () {
  var R = TourneyRules;
  var COLNAME = { red: 'Red', blue: 'Blue', green: 'Green', black: 'Black' };

  // ---- Saved record and options: S.tourney ----
  function st() {
    if (!S.tourney || typeof S.tourney !== 'object') S.tourney = {};
    var t = S.tourney;
    if (!t.opt || typeof t.opt !== 'object') t.opt = {};
    ['rounds', 'wins', 'ties', 'mp', 'best'].forEach(function (k) { if (typeof t[k] !== 'number') t[k] = 0; });
    if (!Array.isArray(t.log)) t.log = [];
    return t;
  }
  function opt() { var o = st().opt; if (!o.div) o.div = 'E'; if (!o.seats) o.seats = null; return o; }
  function beatenCount() { return (S.beaten || []).filter(Boolean).length; }
  // Unlock (house rule, proposed): + − × ÷ done on the ladder (it reached Bigger Goals) and 3 creatures beaten, or Tata's switch.
  function unlocked() { var o = opt(); return !!(o.on || S.unlockAll || (((typeof ladderOff === 'function' && ladderOff()) || (S.ladder && S.ladder.stage >= 2)) && beatenCount() >= 3)); }
  function middleOpen() { var o = opt(); return !!(o.middleOn || S.unlockAll || (window.Vari && Vari.unlockedCount() >= Vari.CARDS.length)); }
  function allOpsReady() { return (typeof ladderOff === 'function' && ladderOff()) || (S.ladder && S.ladder.stage >= STAGES.length - 1); }

  // ---- Judge Pip's face: Pip in a referee cap with a whistle (original drawing on top of Pip) ----
  function judgeFace(size, mood) {
    size = size || 64;
    return '<span class="tj-face" style="width:' + size + 'px;height:' + Math.round(size * 1.12) + 'px">' + pipHTML(mood || 'happy', size, '') +
      '<svg class="tj-gear" viewBox="0 0 100 112" aria-hidden="true">' +
      '<path d="M18 22 Q50 2 82 22 L80 30 Q50 18 20 30 Z" fill="#212529"/><rect x="20" y="27" width="60" height="6" rx="3" fill="#f8f9fa"/>' +
      '<path d="M60 30 l26 4 -4 6 -24 -3z" fill="#212529"/>' +
      '<path d="M50 74 q10 10 22 14" stroke="#f1f3f5" stroke-width="2.5" fill="none"/><circle cx="76" cy="90" r="6" fill="#adb5bd" stroke="#495057" stroke-width="2"/><rect x="66" y="86" width="9" height="5" rx="2" fill="#868e96"/>' +
      '</svg></span>';
  }

  // ---- Entry: the Play screen tile (js/screens.js shows it) ----
  function tileHTML() {
    if (!unlocked()) return '<div class="opp mode lock" data-act="tourneyLocked">' + judgeFace(70) + '<h3>Tournament practice</h3><div class="otitle">Play like a real Academic Games tournament</div><div class="lockbadge">' + (typeof ico === 'function' ? ico('lock') : '🔒') + ' Finish + − × ÷ and beat 3 creatures</div></div>';
    var t = st();
    return '<div class="opp mode" data-act="tourneyOpen">' + judgeFace(70) + '<h3>Tournament practice</h3><div class="otitle">Three players, everyone picks a card, Judge Pip answers "is this legal?"</div>' +
      (t.rounds ? '<div class="otitle" style="font-size:13px">Rounds: ' + t.rounds + ' · first place: ' + t.wins + (t.ties ? ' · shared first: ' + t.ties : '') + '</div>' : '') + '</div>';
  }
  function introHTML() {
    return '<div class="tj-intro">' + judgeFace(72, 'cheer') + '<div><h2>Tournament practice</h2><p class="vari-small">Hi, I\'m <b>Judge Pip</b>! This is how a real Academic Games tournament plays a shake. Here is what is different from normal play:</p></div></div>' +
      '<ul class="tj-list">' +
      '<li>🎲 <b>Who starts:</b> everyone rolls a red cube. Highest number sets the first Goal; an operation sign is out.</li>' +
      '<li>🃏 <b>Everyone picks a card</b> every shake, the Goal-setter first. With two players, the other player picks <b>two</b>. Up to three cards mix together!</li>' +
      '<li>🚫 A card must be able to change the shake, and nobody can pick a card that was already picked.</li>' +
      '<li>➕ <b>Bonus move:</b> if you are not in the lead, you may first put one cube in Forbidden, then make your normal move.</li>' +
      '<li>⚡ Anyone may challenge the player who just moved. The third player may write a Solution too.</li>' +
      '<li>🏅 At the end, places give <b>match points</b>: 6 for first, 4 for second, 2 for third (ties share).</li>' +
      '<li>½ Fractions are always on, like in a tournament.</li>' +
      '</ul><h3 class="tierh">What I left out or changed</h3><ul class="tj-list small">' +
      '<li>⏱ No sand timer. A <b>practice clock</b> can show the tournament time limits; it is off unless Tata turns it on, and it never costs points unless Tata also turns on <b>strict penalties</b>.</li>' +
      '<li>➖ The −1 penalties (a card that can\'t change anything, a bonus move while leading, a challenge that isn\'t allowed) only count in strict mode. Otherwise I just explain and you try again.</li>' +
      '<li>📝 No paper and no 2-minute checking: the game checks every Solution itself. It reads + − × ÷ in school order; I tell you when a real checker could read something another way.</li>' +
      '<li>🔒 Some Middle-list cards and pairs are not in practice yet (I say which, and why).</li>' +
      '<li>🕐 A real round lasts 30 minutes; here you choose how many shakes.</li>' +
      '</ul>';
  }

  // ---- Setup ----
  function openSetup() {
    var o = opt(), seats = o.seats || defaultSeats();
    o.seats = seats;
    var opp = OPPONENTS.map(function (x, i) { return { x: x, i: i }; }).filter(function (q) { return oppOpen(q.i); });
    function seatSel(k) {
      var s = seats[k] || { kind: k === 2 ? 'none' : 'ai', idx: 0 };
      return '<select id="tSeat' + k + '">' + (k === 2 ? '<option value="none"' + (s.kind === 'none' ? ' selected' : '') + '>nobody (2 players)</option>' : '') +
        '<option value="person"' + (s.kind === 'person' ? ' selected' : '') + '>a person: ' + esc(s.name || (k === 1 ? 'Tata' : 'Mama')) + '</option>' +
        opp.map(function (q) { return '<option value="ai' + q.i + '"' + (s.kind === 'ai' && s.idx === q.i ? ' selected' : '') + '>' + q.x.emoji + ' ' + esc(q.x.name) + ' (' + q.x.stars + '★)</option>'; }).join('') + '</select>';
    }
    var mid = middleOpen();
    modal('<h2 class="hero">' + judgeFace(44) + ' Tournament practice</h2>' +
      '<div class="setrow"><label>Player 1</label><b>' + esc(S.name) + '</b></div>' +
      '<div class="setrow"><label>Player 2 is…</label>' + seatSel(1) + '</div><div class="setrow"><label>Name (if a person)</label><input type="text" id="tName1" maxlength="14" value="' + esc((seats[1] && seats[1].name) || 'Tata') + '"></div>' +
      '<div class="setrow"><label>Player 3 is…</label>' + seatSel(2) + '</div><div class="setrow"><label>Name (if a person)</label><input type="text" id="tName2" maxlength="14" value="' + esc((seats[2] && seats[2].name) || 'Mama') + '"></div>' +
      '<div class="setrow"><label>Card list</label><div class="seg"><button class="' + (o.div !== 'M' ? 'on' : '') + '" data-act="tDiv" data-arg="E">Elementary</button><button class="' + (o.div === 'M' && mid ? 'on' : '') + (mid ? '' : ' vari-locked') + '" data-act="tDiv" data-arg="M">Middle' + (mid ? '' : ' 🔒') + '</button></div></div>' +
      '<div class="setrow"><label>Each player sets the Goal</label><div class="seg">' + [1, 2].map(function (n) { return '<button class="' + ((o.per || 1) === n ? 'on' : '') + '" data-act="tPer" data-arg="' + n + '">' + n + '×</button>'; }).join('') + '</div></div>' +
      '<div class="setrow"><label>Operations</label><div class="seg"><button class="' + (o.allOps !== false && allOpsReady() || o.allOps === true ? 'on' : '') + '" data-act="tOps" data-arg="all">All six (official)</button><button class="' + (!(o.allOps !== false && allOpsReady() || o.allOps === true) ? 'on' : '') + '" data-act="tOps" data-arg="mine">Only the ones I unlocked</button></div></div>' +
      '<p class="vari-small">Tata\'s switches: practice clock <b>' + (o.clock ? 'on' : 'off') + '</b>, strict penalties <b>' + (o.strict ? 'on' : 'off') + '</b> (see the Parent corner).</p>' +
      '<div class="row"><button class="btn green big" data-act="tStart">' + ico('play') + ' Start</button><button class="btn" data-act="tIntro">What\'s different?</button><button class="btn" data-act="closeModal">Cancel</button></div>');
  }
  function defaultSeats() {
    var open = OPPONENTS.map(function (x, i) { return i; }).filter(function (i) { return oppOpen(i) && i < 10; });
    var a = open[Math.max(0, open.length - 2)] || 0, b = open[Math.max(0, open.length - 3)] || 1;
    return [{ kind: 'kid' }, { kind: 'ai', idx: a }, { kind: 'ai', idx: b === a ? (a + 1) % 5 : b }];
  }
  function readSeats() {
    var o = opt(), seats = [{ kind: 'kid' }];
    [1, 2].forEach(function (k) {
      var v = ($('#tSeat' + k) || {}).value || 'none', nm = (($('#tName' + k) || {}).value || '').trim().slice(0, 14) || (k === 1 ? 'Tata' : 'Mama');
      if (v === 'none') seats.push({ kind: 'none' });
      else if (v === 'person') seats.push({ kind: 'person', name: nm });
      else seats.push({ kind: 'ai', idx: +v.slice(2), name: nm });
    });
    o.seats = seats; persist();
    return seats;
  }
  // Called from startMatch (mode 'tourney'): the players and the match settings.
  function setup(g, cfg) {
    var o = opt(), seats = (cfg && cfg.seats) || o.seats || defaultSeats();
    seats.slice(1).forEach(function (s) {
      if (!s || s.kind === 'none') return;
      if (s.kind === 'person') g.players.push({ name: s.name || 'Tata', ai: null, score: 0, list: [] });
      else g.players.push({ name: OPPONENTS[s.idx].name, ai: OPPONENTS[s.idx], score: 0, list: [] });
    });
    if (g.players.length < 2) g.players.push({ name: OPPONENTS[0].name, ai: OPPONENTS[0], score: 0, list: [] });
    var div = (o.div === 'M' && middleOpen()) ? 'M' : 'E';
    g.shakes = g.players.length * (o.per || 1);
    g.tour = { div: div, strict: !!o.strict, clock: !!o.clock, allOps: o.allOps === true || (o.allOps !== false && allOpsReady()), pen: g.players.map(function () { return 0; }), penLog: [], sel: null, armed: null, bonusBy: null, setterBonus: false, clk: null };
  }

  // ---- The first Goal-setter: everyone rolls a red cube (I-D, manual A1) ----
  function firstSetter(then) {
    var g = G, who = G.players.map(function (p, i) { return i; }), rounds = [], guard = 0, res;
    do {
      var faces = who.map(function () { return Eq.CUBE_FACES.red[Math.floor(Math.random() * 6)]; });
      res = R.rollRound(who, faces); rounds.push({ who: who.slice(), faces: faces, res: res });
      if (res.again) who = res.again;
    } while (!res.winner && res.winner !== 0 && ++guard < 20);
    if (res.winner === undefined) res.winner = 0;
    G.setter = res.winner;
    var html = '<h2 class="hero">' + judgeFace(44) + ' Who sets the first Goal?</h2><p class="vari-small">Everyone rolls a red cube. The highest number goes first. An operation sign is out (unless everybody rolls one). A tie rolls again.</p>' +
      rounds.map(function (r, k) {
        return '<div class="tj-roll">' + (k ? '<small>Roll again: ' + esc(rounds[k - 1].res.why) + '</small>' : '') + r.who.map(function (p, i) {
          var f = r.faces[i], out = !Eq.isDigit(f) && r.who.some(function (q, j) { return Eq.isDigit(r.faces[j]); });
          return '<span class="tj-r' + (r.res.winner === p ? ' win' : '') + (out ? ' out' : '') + '"><span class="cube mini c-red"><span>' + show(f) + '</span></span><b>' + esc(G.players[p].name) + '</b>' + (out ? '<small>out</small>' : '') + '</span>';
        }).join('') + '</div>';
      }).join('') + '<p style="text-align:center"><b>' + esc(G.players[G.setter].name) + '</b> sets the first Goal! Then it goes to the left.</p>' +
      '<div class="row"><button class="btn green big" data-act="closeModal">Let\'s play!</button></div>';
    if (Snd.clatter) Snd.clatter();
    modal(html, function () { if (G === g) then(); });
  }

  // ---- Each shake ----
  function onShake() {
    if (!G || !G.tour) return;
    var T = G.tour; T.sel = null; T.armed = null; T.bonusBy = null; T.setterBonus = false; T.clk = null;
    G.fractions = Eq.mathMode(true, [], null, { div: T.div }); // fractions on, the division's rules, no card yet
  }
  function fixOps() { if (G && G.tour && G.tour.allOps) G.ops = Eq.OPS.slice(); if (G && G.tour) G.fractions = true; }
  function ctxNow() { return { res: G.cubes.filter(function (c) { return c.zone === 'resources' && !c.locked; }).map(function (c) { return { s: c.s, color: c.color }; }) }; }

  // Card picking for every player (II-B). Returns true while it is running; calls again() when done.
  function beforeGoal(again) {
    if (!G || !G.tour) return false;
    var T = G.tour;
    if (T.sel && T.sel.done) return false;
    if (!T.sel) T.sel = { order: R.pickOrder(G.setter, G.players.length), step: 0, got: 0, picks: [], tries: {}, again: again, done: false };
    T.sel.again = again;
    nextPicker();
    return true;
  }
  // The card pick is still going on (its pop-up was closed some other way): open it again. -> true if it did.
  function resumeSel() {
    if (!G || !G.tour || !G.tour.sel || G.tour.sel.done) return false;
    var pk = picker(); if (!pk) return false;
    if (G.players[pk.p].ai) nextPicker(); else showPicker();
    return true;
  }
  function selPending() { return !!(G && G.tour && G.tour.sel && !G.tour.sel.done); }
  function picker() { var S2 = G.tour.sel; return S2.order[S2.step]; }
  function nextPicker() {
    var T = G.tour, sel = T.sel;
    if (!sel || sel.done) return;
    if (sel.step >= sel.order.length) { finishSel(); return; }
    var pk = picker(), P = G.players[pk.p];
    if (P.ai) {
      var legal = R.legalFor(T.div, sel.picks, ctxNow()), c = (typeof AI !== 'undefined' && AI.chooseTourneyCard) ? AI.chooseTourneyCard(P.ai, legal) : (legal[0] ? { id: legal[0].id, set: legal[0].sets ? legal[0].sets[0] : null } : null);
      if (c) recordPick(pk.p, c.id, c.set);
      if (typeof focusAI === 'function') focusAI(pk.p);
      var card = c && Vari.card(c.id);
      if (typeof say === 'function') say('opp', c ? 'I pick ' + esc(cardName(c.id, c.set)) + '!' : 'No card can change this shake.');
      if (Snd.pop) Snd.pop();
      modal('<h2>' + esc(P.name) + ' picks a card</h2>' + (card ? '<div class="vari-cards one">' + Vari.cardHTML(card, false, false, c.set) + '</div>' : '<p>No card could change this shake, so ' + esc(P.name) + ' skips.</p>') +
        picksLine() + '<div class="row"><button class="btn green big" data-act="closeModal">OK</button></div>', function () { advance(); });
      return;
    }
    showPicker();
  }
  function advance() { var sel = G.tour.sel; sel.got++; if (sel.got >= picker().k) { sel.step++; sel.got = 0; } nextPicker(); }
  function cardName(id, set) { var n = Vari.cardName(id, set || {}); return n || R.NAME[id]; }
  function picksLine() {
    var p = G.tour.sel.picks; if (!p.length) return '';
    return '<p class="vari-small tj-picks">Cards so far: ' + p.map(function (x) { var c = Vari.card(x.id); return '<b>' + (c ? c.icon + ' ' : '') + esc(cardName(x.id, x.set)) + '</b> (' + esc(G.players[x.p].name) + ')'; }).join(', ') + '</p>';
  }
  function showPicker(note) {
    var T = G.tour, sel = T.sel, pk = picker(), P = G.players[pk.p], ctx = ctxNow();
    var list = R.LISTS[T.div].map(function (id) {
      var c = Vari.card(id) || { icon: '🃏', name: R.NAME[id], rule: '' }, sets = R.settingsFor(id, ctx, sel.picks);
      var chk = sets ? (sets.some(function (s) { return R.check(id, s, sel.picks, ctx, T.div).ok; }) ? { ok: true } : R.check(id, sets[0] || { ecol: 'red' }, sel.picks, ctx, T.div)) : R.check(id, null, sel.picks, ctx, T.div);
      return '<button class="vari-card tj-card' + (chk.ok ? '' : ' tj-no tj-' + chk.code) + '" data-act="tPick" data-arg="' + id + '"><span class="vc-icon">' + c.icon + '</span><b>' + esc(c.name) + '</b><span class="vc-rule">' + esc(c.rule || '') + '</span>' +
        (chk.ok ? '' : '<span class="tj-why">' + (chk.code === 'notyet' ? '🔒 Not in practice yet' : chk.code === 'already' ? 'Already picked' : 'Can\'t change this shake') + '</span>') + '<small class="tj-ref">' + esc((R.REF[id] && R.REF[id][T.div]) || '') + '</small></button>';
    }).join('');
    var two = pk.k === 2 ? (sel.got === 0 ? ' (you pick TWO cards: this is the first)' : ' (your second card)') : '';
    modal('<h2>' + (typeof multiHuman === 'function' && multiHuman() ? esc(P.name) + ', pick' : 'Pick') + ' a card' + two + '</h2>' +
      '<p class="vari-small">' + (pk.p === G.setter ? 'You rolled, so you pick first.' : 'Every player picks a card for this shake' + (G.players.length === 2 ? '; with two players the one who did not roll picks two.' : '.')) + ' (' + (T.div === 'M' ? 'Middle' : 'Elementary') + ' list)</p>' +
      (note ? '<div class="tj-say">' + judgeFace(40) + '<div>' + note + '</div></div>' : '') + picksLine() +
      '<div class="vari-cards">' + list + '</div><div class="row"><button class="btn small" data-act="tJudge">' + judgeFace(22) + ' Ask the Judge</button></div>');
  }
  function recordPick(p, id, set) { G.tour.sel.picks.push({ p: p, id: id, set: set || null }); }
  function tryPick(id, set) {
    var T = G.tour, sel = T.sel, pk = picker(), ctx = ctxNow();
    var sets = R.settingsFor(id, ctx, sel.picks);
    if (sets && !set) {
      var good = sets.filter(function (s) { return R.check(id, s, sel.picks, ctx, T.div).ok; });
      if (good.length) { pickSetting(id, good); return; }
    }
    var chk = R.check(id, set || (sets && sets[0]) || null, sel.picks, ctx, T.div);
    if (!chk.ok) {
      Snd.boop();
      var msg = '<b>Judge Pip:</b> ' + esc(chk.why) + (chk.ref ? ' <small>(' + esc(chk.ref) + ')</small>' : '');
      if (chk.code !== 'notyet' && T.strict) {
        sel.tries[pk.p] = (sel.tries[pk.p] || 0) + 1;
        penalize(pk.p, 'a card that is not allowed', 'II-B-2');
        msg += '<br>Strict mode: that costs 1 point.';
        if (sel.tries[pk.p] >= 2) { msg += ' That was the second try, so no card for you this shake.'; modal('<div class="tj-say">' + judgeFace(48, 'think') + '<div>' + msg + '</div></div><div class="row"><button class="btn green" data-act="closeModal">OK</button></div>', function () { sel.step++; sel.got = 0; nextPicker(); }); return; }
        msg += ' Pick again.';
      } else msg += '<br>No points lost. Pick another card.';
      showPicker(msg);
      return;
    }
    recordPick(pk.p, id, set); if (Snd.click) Snd.click();
    closeModal(); advance();
  }
  function pickSetting(id, good) {
    var c = Vari.card(id), label = id === 'multk' ? 'Fill in k: the Solution must miss the Goal by k, 2k, 3k, …' : id === 'basem' ? 'Fill in the base: count in eights, nines or tens?' : 'Fill in the colour: which colour of number cube can be an exponent?';
    modal('<h2>' + c.icon + ' ' + esc(c.name) + '</h2><p class="vari-small">' + esc(label) + '</p><div class="vari-set">' + good.map(function (s) {
      var t = s.k ? String(s.k) : s.base ? 'Base ' + s.base : COLNAME[s.ecol];
      return '<button class="btn' + (s.ecol ? ' vari-col vc-' + s.ecol : '') + '" data-act="tSet" data-arg="' + id + '|' + JSON.stringify(s).replace(/"/g, '&quot;') + '">' + esc(t) + '</button>';
    }).join('') + '</div><div class="row"><button class="btn small" data-act="tBackPick">Back to the cards</button></div>');
  }
  function finishSel() {
    var T = G.tour, sel = T.sel; sel.done = true;
    var ids = sel.picks.map(function (x) { return x.id; }), set = { div: T.div };
    sel.picks.forEach(function (x) { if (x.set) Object.keys(x.set).forEach(function (k) { set[k] = x.set[k]; }); });
    if (window.Vari && Vari.applySet) Vari.applySet(ids, set); else G.fractions = Eq.mathMode(true, ids, null, set);
    var notes = pairNotes(ids);
    modal('<h2>This shake\'s cards</h2><div class="vari-cards one tj-sum">' + sel.picks.map(function (x) { return Vari.cardHTML(Vari.card(x.id), false, false, x.set); }).join('') + '</div>' +
      (notes.length ? '<div class="tj-say">' + judgeFace(44) + '<div><b>How they mix:</b><ul>' + notes.map(function (n) { return '<li>' + esc(n[0]) + ' <small>(' + esc(n[1]) + ')</small></li>'; }).join('') + '</ul></div></div>' : '') +
      (!ids.length ? '<p class="vari-small">No card could change this shake, so it is played with the basic rules.</p>' : '') +
      '<p class="vari-small">These rules are for this shake only. Tap the cards on the table to read them again.</p><div class="row"><button class="btn green big" data-act="closeModal">Got it!</button></div>', function () { var a = sel.again; if (G && a) a(); });
  }
  function pairNotes(ids) {
    var out = [];
    for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) { var n = R.PAIR_NOTE[R.pairKey(ids[i], ids[j])]; if (n) out.push(n); }
    return out;
  }

  // ---- Bonus moves (IV-C, V-C) ----
  function scores() { return G.players.map(function (p) { return p.score; }); }
  function mayBonus(p) {
    if (!G || !G.tour) return false;
    var res = G.cubes.filter(function (c) { return c.zone === 'resources' && !c.locked; }).length;
    if (G.phase === 'goal') return p === G.setter && !G.tour.setterBonus && !G.goalTokens.length && res >= 2 && !R.leading(scores(), p);
    return G.phase === 'move' && p === G.turn && !(G.tour.bonusBy === p) && res >= 2 && !R.leading(scores(), p);
  }
  function bonusButtonHTML() {
    if (!G || !G.tour || G.busy) return '';
    var p = G.phase === 'goal' ? G.setter : G.turn;
    if (!G.players[p] || G.players[p].ai) return '';
    if (G.phase !== 'goal' && G.phase !== 'move') return '';
    if (G.tour.armed === p) return '<button class="btn tj-bonus on" data-act="tBonus">Bonus: tap a cube for Forbidden (tap here to cancel)</button>';
    if (G.tour.bonusBy === p || (G.phase === 'goal' && (G.tour.setterBonus || G.goalTokens.length))) return '';
    return '<button class="btn tj-bonus" data-act="tBonus" title="One cube to Forbidden first (not allowed for the leader)">➕ Bonus move</button>';
  }
  function bonusTap(id) {
    if (!G || !G.tour || G.tour.armed == null) return false;
    var p = G.tour.armed, c = G.cubes[id];
    if (c.zone !== 'resources' || c.locked) return true;
    if (!mayBonus(p)) { G.tour.armed = null; renderGame(); return true; }
    c.zone = 'forbidden'; c.order = ++orderCounter; G.justMoved = id; G.selected = null; G.tour.armed = null;
    if (G.phase === 'goal') G.tour.setterBonus = true; else G.tour.bonusBy = p;
    if (!T3.active() && Snd.thunk) Snd.thunk();
    say('pip', 'Bonus! The ' + show(c.s) + ' went to Forbidden. ' + (G.phase === 'goal' ? 'Now set your Goal (and no "No Goal" call after a bonus move).' : 'Now make your normal move.'));
    renderGame();
    return true;
  }
  ACTs();
  function ACTs() {
    if (typeof ACT === 'undefined') return;
    ACT.tourneyOpen = function () { var o = opt(); if (!o.introSeen) { o.introSeen = true; persist(); showIntro(true); } else openSetup(); };
    ACT.tourneyLocked = function () { Snd.boop(); modal('<h2>' + ico('lock') + ' Not yet!</h2><div class="tj-say">' + judgeFace(56) + '<div>Tournament practice opens when you have finished + − × ÷ on the ladder and beaten <b>3 creatures</b> (you have beaten ' + beatenCount() + '). Tata can also switch it on in the Parent corner.</div></div><div class="row"><button class="btn green" data-act="closeModal">OK</button></div>'); };
    ACT.tIntro = function () { showIntro(true); };
    ACT.tDiv = function (el) { var d = el.dataset.arg; if (d === 'M' && !middleOpen()) { Snd.boop(); return; } readSeats(); opt().div = d; persist(); openSetup(); };
    ACT.tPer = function (el) { readSeats(); opt().per = +el.dataset.arg; persist(); openSetup(); };
    ACT.tOps = function (el) { readSeats(); opt().allOps = el.dataset.arg === 'all'; persist(); openSetup(); };
    ACT.tStart = function () { var seats = readSeats(); closeModal(); startMatch('tourney', null, { seats: seats }); };
    ACT.tPick = function (el) { if (!G || !G.tour || !G.tour.sel || G.tour.sel.done) return; var pk = picker(); if (G.players[pk.p].ai) return; tryPick(el.dataset.arg, null); };
    ACT.tSet = function (el) { var a = el.dataset.arg, k = a.indexOf('|'); tryPick(a.slice(0, k), JSON.parse(a.slice(k + 1))); };
    ACT.tBackPick = function () { showPicker(); };
    ACT.tBonus = function () {
      if (!G || !G.tour) return;
      var p = G.phase === 'goal' ? G.setter : G.turn;
      if (G.tour.armed === p) { G.tour.armed = null; say('pip', 'No bonus move then.'); renderGame(); return; }
      if (R.leading(scores(), p)) { illegal(p, 'bonusLead'); return; }
      if (!mayBonus(p)) { Snd.boop(); return; }
      G.tour.armed = p; G.selected = null; Snd.click();
      say('pip', '<b>Bonus move:</b> tap any Resource cube. It goes straight to Forbidden.' + (G.phase === 'goal' ? ' Then you set the Goal.' : ' Then you make your normal move.'), 'think');
      renderGame();
    };
    ACT.tJudge = function () { judge(); };
    ACT.tJudgeQ = function (el) { judge(el.dataset.arg); };
    ACT.tJudgeBack = function () { var b = judgeBack; judgeBack = null; if (b) b(); else closeModal(); };
    ACT.tRuling = function (el) { judge('ruling:' + el.dataset.arg); };
    ACT.tToggle = function (el) { var o = opt(), k = el.dataset.arg; o[k] = !o[k]; persist(); if (Snd.click) Snd.click(); if (typeof renderSettings === 'function') renderSettings(); };
    ACT.tAgain = function () { var cfg = G && G.cfg; closeModal(); drainQueue(function () { startMatch('tourney', null, cfg); }); };
  }
  function showIntro(thenSetup) {
    modal(introHTML() + '<div class="row"><button class="btn green big" data-act="' + (thenSetup ? 'tourneySetupGo' : 'closeModal') + '">' + (thenSetup ? 'Set up a match' : 'OK') + '</button></div>');
    if (typeof ACT !== 'undefined') ACT.tourneySetupGo = function () { openSetup(); };
  }

  // ---- Illegal procedure (IX-A): the Judge explains kindly; a penalty only in strict mode ----
  var ILLEGAL = {
    bonusLead: ['You are in the lead, so no bonus move for you. Only a player who is NOT leading may take one (tied for the lead is fine).', 'IV-C-2, V-C-2', true],
    nowRes: ['Now! needs at least two cubes left in Resources.', 'VI-A-2-a', true],
    nowMat: ['Now! needs at least one cube in Required or Permitted first (a Solution needs two cubes).', 'VI-A-2-b', true],
    self: ['You moved last, and nobody can challenge their own move.', 'VI-B (a), General Principle 9', true],
    noMove: ['Nobody has moved yet, so there is nothing to challenge.', 'VI-B (d)', true],
    lastForbid: ['The very last cube can\'t go to Forbidden. Put it in Required or Permitted, or call Impossible!', 'VIII-A', false],
    noGoalBonus: ['You made a bonus move, so you have promised to set a Goal: no "No Goal" call now.', 'IV-D-1 comment (c)', false]
  };
  function illegal(p, code) {
    var x = ILLEGAL[code]; if (!x) return;
    Snd.boop();
    var strict = G && G.tour && G.tour.strict && x[2];
    if (strict) penalize(p, x[0], x[1]);
    say('pip', '<b>Judge Pip:</b> ' + x[0] + ' <small>(' + x[1] + ')</small>' + (strict ? ' Strict mode: −1 point.' : ' No points lost.'), 'think');
    if (typeof renderGame === 'function') renderGame();
  }
  function penalize(p, why, ref) {
    if (!G || !G.tour) return;
    G.players[p].score -= 1; G.tour.pen[p] = (G.tour.pen[p] || 0) + 1; G.tour.penLog.push({ p: p, why: why, ref: ref, shake: G.shake });
  }

  // ---- Practice clock (XI-A time limits), OFF unless Tata switches it on. Never acts by itself. ----
  var clockTimer = null;
  function clockTask() {
    if (!G || !G.tour || !G.tour.clock) return null;
    if (typeof B !== 'undefined' && B && B.kind === 'solution') return { key: 'w' + G.shake + B.pi, who: B.pi, task: 'Write your Solution', limit: 120 };
    if (G.tour.sel && !G.tour.sel.done && G.tour.sel.step < G.tour.sel.order.length) { var pk = G.tour.sel.order[G.tour.sel.step]; if (!G.players[pk.p].ai) return { key: 's' + G.shake + pk.p + G.tour.sel.step, who: pk.p, task: 'Pick a card', limit: 15 }; }
    if (G.phase === 'goal' && !isAI(G.setter)) return { key: 'g' + G.shake, who: G.setter, task: 'Set the Goal', limit: 120 };
    if (G.phase === 'move' && !isAI(G.turn) && !G.wait) { var first = G.lastMover === G.setter && zoneCubes('required').length + zoneCubes('permitted').length + zoneCubes('forbidden').filter(function (c) { return !c.locked; }).length === 0; return { key: 'm' + orderCounter + G.turn, who: G.turn, task: first ? 'First move after the Goal' : 'Your move', limit: first ? 120 : 60 }; }
    return null;
  }
  function clockTick() {
    if (!G || !G.tour || !G.tour.clock) { stopClock(); return; }
    var t = clockTask(), T = G.tour, el = document.getElementById('tClock');
    if (!t) { T.clk = null; if (el) el.style.display = 'none'; return; }
    if (!T.clk || T.clk.key !== t.key) T.clk = { key: t.key, t0: Date.now(), over: 0 };
    var left = Math.ceil(t.limit + 60 * T.clk.over - (Date.now() - T.clk.t0) / 1000);
    if (left <= 0 && T.clk.over < 2) {
      T.clk.over++;
      var pen = T.strict;
      if (pen) penalize(t.who, 'over the time limit: ' + t.task, 'XI-A');
      if (typeof say === 'function') say('pip', '⏱ Time! (practice clock: ' + t.task + ', ' + (t.limit >= 60 ? t.limit / 60 + ' min' : t.limit + ' s') + '). ' + (pen ? 'Strict mode: −1 point, and one more minute.' : 'No points lost: take the time you need.'), 'think');
      if (typeof renderGame === 'function' && pen) renderGame();
      left = 60;
    }
    if (!el) return;
    el.style.display = '';
    el.textContent = '⏱ ' + t.task + ': ' + (left > 0 ? Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : 'time!');
    el.classList.toggle('low', left <= 10);
  }
  function startClock() { if (!clockTimer) clockTimer = setInterval(clockTick, 1000); }
  function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }
  // A small strip for the top bar (js/game.js renderGame): the division, penalties, the clock.
  function topHTML() {
    if (!G || !G.tour) return '';
    if (G.tour.clock) startClock();
    var pens = G.tour.pen.some(function (x) { return x; }) ? ' · penalties: ' + G.players.map(function (p, i) { return G.tour.pen[i] ? esc(p.name) + ' −' + G.tour.pen[i] : ''; }).filter(Boolean).join(', ') : '';
    return '<div class="tj-top"><span>' + (G.tour.div === 'M' ? 'Middle' : 'Elementary') + ' tournament' + pens + '</span>' + (G.tour.clock ? '<span id="tClock" class="tj-clock"></span>' : '') + '</div>';
  }

  // ---- Match end (XII-A): places and match points ----
  function endMatch() {
    stopClock();
    var sc = scores(), mp = R.matchPoints(sc), me = mp[0], t = st();
    t.rounds++; t.mp += me.pts; t.best = Math.max(t.best, me.pts);
    if (me.place === 1 && !me.tie) t.wins++; else if (me.place === 1) t.ties++;
    t.log.push({ t: Date.now(), div: G.tour.div, n: G.players.length, sc: sc, mp: mp.map(function (x) { return x.pts; }), names: G.players.map(function (p) { return p.name; }) });
    if (t.log.length > 20) t.log.shift();
    persist();
    var order = G.players.map(function (p, i) { return i; }).sort(function (a, b) { return sc[b] - sc[a]; });
    var placeName = function (x) { return x.place === 1 ? (x.tie ? 'Tied for first' : 'First place') : x.place === 2 ? (x.tie ? 'Tied for second' : 'Second place') : 'Third place'; };
    if (me.place === 1) { victoryFX(); Snd.fanfare(); if (typeof playerCelebrate === 'function' && !me.tie) playerCelebrate(); } else { Snd.chime(); if (typeof playerMood === 'function') playerMood('clap'); }
    G.players.forEach(function (p, i) { if (p.ai && typeof creatureAt === 'function') creatureAt(i, function () { if (T3.creatureMood) T3.creatureMood(mp[i].place === 1 ? 'dance' : 'clap'); }); });
    var html = '<h2 class="hero">' + (me.place === 1 && !me.tie ? 'You win the round!' : me.place === 1 ? 'Shared first place!' : 'Round over!') + '</h2>' +
      '<div class="tj-say">' + judgeFace(48, me.place === 1 ? 'cheer' : 'happy') + '<div>In a tournament, the shake points decide the places, and the places give <b>match points</b>.</div></div>' +
      '<table class="tj-table"><tr><th>Player</th><th>Shake points</th><th>Place</th><th>Match points</th></tr>' + order.map(function (i) { return '<tr' + (i === 0 ? ' class="me"' : '') + '><td>' + esc(G.players[i].name) + '</td><td>' + sc[i] + (G.tour.pen[i] ? ' <small>(−' + G.tour.pen[i] + ')</small>' : '') + '</td><td>' + placeName(mp[i]) + '</td><td><b>' + mp[i].pts + '</b></td></tr>'; }).join('') + '</table>' +
      '<p class="vari-small">Match points (XII-A): ' + (G.players.length === 3 ? 'first 6 · two tied for first 5 each · all three tied 4 each · second 4 · two tied for second 3 each · third 2.' : 'first 6 · tied 5 each · second 4.') + '</p>' +
      '<p class="vari-small">Your record: ' + t.rounds + ' round' + (t.rounds > 1 ? 's' : '') + ', ' + t.wins + ' first place' + (t.wins === 1 ? '' : 's') + (t.ties ? ', ' + t.ties + ' shared' : '') + ', ' + t.mp + ' match points in all.</p>' +
      (typeof xpLog !== 'undefined' && xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '') +
      (window.Missions ? Missions.matchLineHTML() : '') + '<div class="row" style="margin-top:12px"><button class="btn green" data-act="tAgain">Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Menu</button></div>';
    modal(html, null);
  }

  // ---- JUDGE PIP ----
  // Answers about the CURRENT position, worked out by the engine. It says what is allowed, never what is clever
  // (the manual's officiating guidelines: a judge never helps a player decide whether to challenge or how to solve).
  var judgeBack = null;
  function judge(q) {
    if (!G) { judgeRulings(q); return; }
    if (q === undefined) {
      var keep = typeof modalOnClose !== 'undefined' ? modalOnClose : null, open = $('#modal') && $('#modal').classList.contains('on');
      if (open && !judgeBack) { var prevHTML = $('#modalBox').innerHTML; judgeBack = function () { modal(prevHTML, keep); }; }
    }
    var ans = q ? answer(q) : '';
    var qs = questions();
    modal('<h2 class="tj-h">' + judgeFace(56) + ' Judge Pip</h2>' +
      (ans ? '<div class="tj-ans">' + ans + '</div>' : '<p class="vari-small">Ask me "is this allowed?" about the game right now. I never tell you whether a move is clever: that part is up to you!</p>') +
      '<div class="tj-qs">' + qs.map(function (x) { return '<button class="btn small' + (q === x[0] ? ' green' : '') + '" data-act="tJudgeQ" data-arg="' + x[0] + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="row"><button class="btn green" data-act="tJudgeBack">' + (judgeBack ? 'Back' : 'Thanks, Judge!') + '</button></div>');
  }
  function questions() {
    var out = [];
    var selPhase = G.tour && G.tour.sel && !G.tour.sel.done;
    if (G.phase === 'move' || G.phase === 'goal') out.push(['move', 'Is this move legal?']);
    out.push(['card', selPhase ? 'Can I pick this card?' : 'What do this shake\'s cards do together?']);
    if (G.goal || (typeof B !== 'undefined' && B && B.kind === 'goal')) out.push(['goal', 'Is this Goal legal?']);
    if ((typeof B !== 'undefined' && B && B.kind === 'solution') || G.lastShake) out.push(['sol', 'Does this Solution count? Why not?']);
    out.push(['who', 'Who can challenge now?'], ['score', 'How is this shake scored?'], ['rulings', 'Rulings list']);
    return out;
  }
  function li(a) { return '<ul class="tj-ul">' + a.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
  function ref(r) { return r ? ' <small class="tj-ref">(' + esc(r) + ')</small>' : ''; }
  function nm(i) { return esc(G.players[i].name); }
  function answer(q) {
    if (q.indexOf('ruling:') === 0) return rulingHTML(q.slice(7));
    switch (q) {
      case 'move': return ansMove();
      case 'card': return ansCard();
      case 'goal': return ansGoal();
      case 'sol': return ansSol();
      case 'who': return ansWho();
      case 'score': return ansScore();
      case 'rulings': return rulingsListHTML();
    }
    return '';
  }
  function ansMove() {
    var out = [], p = G.phase === 'goal' ? G.setter : G.turn, res = zoneCubes('resources').filter(function (c) { return !c.locked; });
    if (G.phase === 'goal') {
      out.push(nm(G.setter) + ' rolled, so ' + nm(G.setter) + ' sets the Goal: 1 to 6 cubes from Resources that make a real number. Numbers may have one or two digits.' + ref('IV-A, IV-B'));
      if (G.tour) out.push(R.leading(scores(), p) ? nm(p) + ' is leading, so no bonus move before the Goal.' + ref('IV-C-2') : nm(p) + ' is not leading, so ' + nm(p) + ' may make ONE bonus move (a cube to Forbidden) before the first Goal cube.' + ref('IV-C'));
      return '<b>Setting the Goal</b>' + li(out);
    }
    if (G.phase !== 'move') return 'Moves happen after the Goal is set. Right now nobody moves.';
    out.push('It is <b>' + nm(p) + '</b>\'s turn. A turn is ONE cube from Resources to Required, Permitted or Forbidden, or a challenge.' + ref('V-B'));
    if (G.selected != null && G.cubes[G.selected]) {
      var c = G.cubes[G.selected];
      ['required', 'permitted', 'forbidden'].forEach(function (z) {
        var okz = !(z === 'forbidden' && res.length === 1);
        out.push('The ' + show(c.s) + ' to <b>' + z + '</b>: ' + (okz ? 'allowed.' : 'not allowed: the last cube can\'t go to Forbidden.' + ref('VIII-A')));
      });
      out.push('(Allowed does not mean safe. Whether a move is a good idea is your job!)');
    } else if (res.length === 1) out.push('Only one cube is left: it must go to Required or Permitted, or someone calls Impossible!' + ref('VIII-A'));
    else out.push('Tap a Resource cube first, then ask me again to hear where it may go.');
    if (G.tour) {
      if (G.tour.bonusBy === p) out.push(nm(p) + ' already made a bonus move this turn: now the normal move.');
      else out.push(R.leading(scores(), p) ? nm(p) + ' is leading, so no bonus move this turn.' + ref('V-C-2') : nm(p) + ' is not leading, so a bonus move (one cube to Forbidden, then the normal move) is allowed.' + ref('V-C, V-C comment (a): tied for the lead is fine'));
    }
    return '<b>Moves</b>' + li(out);
  }
  function curIds() { var m = G.fractions; return Eq.varsOf(m); }
  function ansCard() {
    var T = G.tour;
    if (T && T.sel && !T.sel.done) {
      var pk = T.sel.order[T.sel.step], ctx = ctxNow();
      var rows = R.LISTS[T.div].map(function (id) {
        var sets = R.settingsFor(id, ctx, T.sel.picks), chk;
        if (sets) { var good = sets.filter(function (s) { return R.check(id, s, T.sel.picks, ctx, T.div).ok; }); chk = good.length ? { ok: true, why: 'allowed with ' + good.map(function (s) { return s.k ? 'k = ' + s.k : s.base ? 'base ' + s.base : COLNAME[s.ecol]; }).join(', ') } : R.check(id, sets[0] || { ecol: 'red' }, T.sel.picks, ctx, T.div); }
        else chk = R.check(id, null, T.sel.picks, ctx, T.div);
        return (chk.ok ? '✔ ' : '✘ ') + '<b>' + esc(cardName(id)) + '</b>: ' + (chk.ok ? (chk.why || 'allowed.') : esc(chk.why)) + ref(chk.ref);
      });
      return '<b>Cards ' + nm(pk.p) + ' may pick now</b> (' + (T.div === 'M' ? 'Middle' : 'Elementary') + ' list)' + li(rows) + '<p class="vari-small">A card must be able to change the shake, and a card already picked can\'t be picked again.' + ref('II-B-2, General Principle 1') + '</p>';
    }
    var ids = curIds();
    if (!ids.length) return 'No variation card is in play this shake.' + (T ? '' : ' (In normal play only the Goal-setter may pick one card; in Tournament practice everyone picks.)');
    var notes = pairNotes(ids);
    return '<b>This shake\'s cards</b>' + li(ids.map(function (id) { var c = Vari.card(id); return (c ? c.icon + ' ' : '') + '<b>' + esc(cardName(id, G.variSet)) + '</b>: ' + esc(c ? c.rule : ''); })) +
      (notes.length ? '<b>Together</b>' + li(notes.map(function (n) { return esc(n[0]) + ref(n[1]); })) : (ids.length > 1 ? '<p class="vari-small">These cards don\'t change each other: each one simply does its own job.</p>' : ''));
  }
  function goalTokensNow() { return (typeof B !== 'undefined' && B && B.kind === 'goal') ? B.tokens : G.goalTokens; }
  function ansGoal() {
    var toks = goalTokensNow();
    if (!toks || !toks.length) return 'There is no Goal yet.';
    var g = Eq.checkGoal(toks, G.fractions), out = [];
    if (!g.ok) out.push('✘ Not a legal Goal: ' + esc(g.reasons[0]) + ref('IV-B, III'));
    else {
      out.push('✔ Legal: ' + Eq.cubeCount(toks) + ' cube' + (Eq.cubeCount(toks) > 1 ? 's' : '') + ' (1 to 6), and it makes a real number' + ref('IV-B') + '.');
      var RU = Eq.rulesOf(G.fractions);
      if (g.wildValues) { var vs = Object.keys(g.wildValues).map(function (w) { return Eq.fmt(g.wildValues[w]) + ' (0 = ' + w + ')'; }); out.push('The 0 is wild, so the Goal can be ' + vs.slice(0, 6).join(', ') + (vs.length > 6 ? ' …' : '') + '. Each writer says which.' + ref('XIII-A-3')); }
      if (RU.wild && RU.ud && toks.some(function (t) { return (typeof t === 'string' ? t : t.s) === '0'; })) out.push('A 0 looks the same upside-down, so a writer may also read a Goal 0 as an upside-down 0.' + ref('General Principle 11'));
      else if (!g.wildValues) out.push('Its value is <b>' + Eq.fmt(g.value) + '</b>.');
    }
    R.ambiguities(toks, G.fractions).forEach(function (a) { out.push('⚠ ' + esc(a) + ref('VII-B-6-c')); });
    return '<b>The Goal</b>' + li(out);
  }
  var REASON_REF = [[/two cubes/, 'VII-B-3-a'], [/Required/, 'VII-B-3-b'], [/Forbidden/, 'VII-B-3-c'], [/ONE cube from Resources/, 'VII-B-3-e'], [/on the mat/, 'VIII-A'], [/stay in the Goal/, 'VII-B-3'],
    [/two-digit|three-digit|digit cubes are touching/, 'VII-B-4'], [/3 operation/, 'XIII-A-6'], [/! sign/, 'XIII-A-4'], [/Multiple of/, 'XIII-B-7'], [/wild/, 'XIII-A-3'], [/base/, 'XIII-B-6'], [/equals/, 'VII-B-2'], [/same cube/, 'VII-B-3']];
  function reasonRef(r) { for (var i = 0; i < REASON_REF.length; i++) if (REASON_REF[i][0].test(r)) return REASON_REF[i][1]; return 'VII-B'; }
  function solExplain(tokens, chk, who) {
    var out = [];
    if (!tokens || !tokens.length) return (who ? who + ': ' : '') + 'no Solution was written.';
    if (chk && chk.ok) out.push('✔ It counts: it uses the cubes correctly and equals the Goal' + (Eq.rulesOf(G.fractions).multk ? ' (missed by a multiple of k, as the card says)' : '') + '.' + ref('VII-B'));
    else (chk && chk.reasons || []).forEach(function (r) { out.push('✘ ' + esc(r) + ref(reasonRef(r))); });
    R.ambiguities(tokens, G.fractions).forEach(function (a) { out.push('⚠ ' + esc(a) + ref('VII-B-6-c')); });
    return (who ? '<b>' + who + '</b>' : '') + li(out);
  }
  function ansSol() {
    if (typeof B !== 'undefined' && B && B.kind === 'solution') {
      if (!B.tokens.length) return 'Build a Solution first, then ask me.';
      return solExplain(B.tokens, Eq.checkSolution(B.tokens, solCtx(B.mode, B.goal, B.cubes, B.fractions)), 'Your Solution so far');
    }
    var r = G.lastShake; if (!r || !r.sols) return 'No Solution has been written yet this shake.';
    return Object.keys(r.sols).map(function (k) { var s = r.sols[k]; return solExplain(s && s.tokens, s && s.chk, nm(+k) + '\'s Solution'); }).join('');
  }
  function ansWho() {
    var out = [];
    if (G.phase === 'goal' || G.lastMover === null) return 'Nobody can challenge yet: a challenge comes right after the Goal is set or a cube is moved.' + ref('VI-A, VI-B (d)');
    if (G.phase !== 'move') return 'The mat is frozen: a challenge was made or the last cube is down. No more challenges this shake' + (G.phase === 'lastcheck' ? ', except Impossible! against the last move' : '') + '.' + ref('General Principle 8, VIII-B');
    out.push('A challenge is always against the player who moved last: <b>' + nm(G.lastMover) + '</b>.' + ref('General Principle 9'));
    G.players.forEach(function (p, i) {
      if (i === G.lastMover) { out.push(nm(i) + ': no (nobody challenges their own move).' + ref('VI-B (a)')); return; }
      var why = nowCheckFor(i);
      out.push(nm(i) + ': Impossible! yes; Now! ' + (why ? 'no (' + esc(why) + ')' : 'yes') + '.' + (nP() > 2 && i !== G.turn ? ' (Even though it is not ' + nm(i) + '\'s turn.)' : ''));
    });
    out.push('Now! means "a Solution can be written with the mat plus at most ONE more cube from Resources". Impossible! means "no Solution can ever be written".' + ref('VI-A-1, VI-A-2'));
    return '<b>Who can challenge</b>' + li(out);
  }
  function ansScore() {
    var out = [], n = nP();
    if (G.phase === 'challenge' && G.ch) {
      var ch = G.ch, kind = ch.kind;
      out.push(nm(ch.challenger) + ' called <b>' + (kind === 'now' ? 'Now!' : 'Impossible!') + '</b> against ' + nm(ch.mover) + '.');
      out.push(kind === 'now' ? nm(ch.challenger) + ' must write a Solution (mat + at most one Resource cube); ' + nm(ch.mover) + ' may not.' : nm(ch.mover) + ' must write a Solution (Resources count as Permitted now); ' + nm(ch.challenger) + ' may not.');
      var w = kind === 'now' ? ch.challenger : ch.mover;
      [true, false].forEach(function (ok) {
        var pts = Eq.scoreChallenge(kind, ch.challenger, ch.mover, ch.tp, ok, { presented: false });
        out.push('If ' + nm(w) + '\'s Solution is ' + (ok ? 'correct' : 'not correct') + ': ' + G.players.map(function (p, i) { return nm(i) + ' ' + (pts[i] || 0); }).join(', ') + (ch.tp !== null ? ' (with ' + nm(ch.tp) + ' not writing)' : '') + '.');
      });
      if (ch.tp !== null) out.push(nm(ch.tp) + ' is the Third Party and may write too: correct = ' + (kind === 'impossible' ? '6' : '4 if the ' + 'challenger is also correct, 6 if not') + '; not correct = 2.' + ref('X-B-3, X-B-4'));
      return '<b>Scoring this challenge</b>' + li(out) + ref('X-A, X-B');
    }
    out.push('After a challenge: whoever is correct scores 6, whoever is not scores 2.' + ref('X-B-1, X-B-2'));
    if (n > 2) out.push('The Third Party scores 6, 4 or 2: 6 for a correct Solution after Impossible!, 4 for sitting out an Impossible! that was right, 2 for a wrong Solution …' + ref('X-B-3, X-B-4'));
    out.push('If the last cube is played and nobody calls Impossible!, everyone writes: correct 4, not correct 2.' + ref('VIII-A, X-C'));
    if (G.tour) {
      var mp = R.matchPoints(scores());
      out.push('At the end of the round, places give match points: ' + (n === 3 ? '6 / 4 / 2 (ties: 5 or 4 or 3)' : '6 / 4 (a tie: 5 each)') + '.' + ref('XII-A'));
      out.push('If the round ended now: ' + G.players.map(function (p, i) { return nm(i) + ' ' + p.score + ' → ' + mp[i].pts + ' match points'; }).join(', ') + '.');
      if (G.tour.strict) out.push('Strict penalties are on: some illegal actions cost 1 point.' + ref('II-B-2, V-C-2, VI-B, XI-A'));
    }
    return '<b>How a shake is scored</b>' + li(out);
  }

  // ---- Rulings: common situations in our own words, each with a tiny example and the official references ----
  var RULINGS = [
    ['first', 'Who sets the first Goal?', 'Everyone rolls a red cube. Highest number wins. An operation sign is out, unless everybody rolls one. A tie rolls again.', 'Tata 3, Pip ×, you 3 → Pip is out, you and Tata roll again.', 'I-D, A1'],
    ['order', 'Who picks cards, and how many?', 'The Goal-setter picks first, then the player on the left, then the third player. With only two players, the one who did not roll picks TWO cards.', 'Two players: you roll and pick Upside-down; Tata picks Factorial and LCM.', 'II-B-1, II-B-3, A20, A21'],
    ['effect', 'A card must be able to change the shake', 'You can\'t pick a card that could never matter, like 0 is Wild when no 0 was rolled. In a tournament that costs 1 point and you pick again.', 'No ÷ in Resources → Remainder is not allowed.', 'II-B-2, General Principle 1, A6, A17, A18'],
    ['twice', 'The same card twice', 'Once a card is picked for a shake, nobody can pick it again (not even with a different k or base).', 'Tata picked Multiple of 7; you can\'t pick Multiple of 9.', 'II-B-2'],
    ['missed', 'Nobody noticed a bad card', 'If a card that could not change the shake is not pointed out before the next good pick (or the Goal), there is no penalty, but the card is simply ignored.', 'Someone picks 0 is Wild with no 0, nobody says anything: play as if it was never picked.', 'II-B-2, A10, A23'],
    ['bonus', 'Bonus moves', 'If you are NOT in the lead, you may say "Bonus" and put one cube in Forbidden, then make your normal move. The Goal-setter may do it once before setting the Goal.', 'Score 4-6-6: the player with 4 may bonus. Tied for the lead may bonus too.', 'IV-C, V-C, V-C comment (a)'],
    ['bonuslead', 'A bonus move by the leader', 'The leader may not take a bonus move. If someone points it out in time, the cube goes back and the leader loses a point. If nobody notices before the next move, it stays (it is "insulated").', 'The leader bonuses, the next player moves: too late to complain.', 'IV-C-2, V-C-2, IX-B, General Principle 4, A15'],
    ['against', 'Who can be challenged?', 'Any player may challenge, even when it is not their turn, but a challenge is always against the player who moved last (or set the Goal).', 'You moved; Tata and Mondo may challenge you. You can\'t challenge yourself.', 'VI-A, VI-B, General Principle 9'],
    ['nowlimits', 'When Now! is not allowed', 'Now! needs at least two cubes left in Resources, and something in Required or Permitted.', 'One cube left: only Impossible! is possible.', 'VI-A-2-a, VI-A-2-b'],
    ['lastcube', 'The last cube', 'With one cube left, the next player puts it in Required or Permitted (never Forbidden), or calls Impossible!. Then everybody writes a Solution: correct 4, not correct 2.', 'Last cube: a 3. It must go to Required or Permitted.', 'VIII-A, VIII-B, X-C'],
    ['writers', 'Who writes after a challenge?', 'After Now!, the challenger must write and the mover may not. After Impossible!, the mover must write and the challenger may not. The third player may write either way.', 'Mondo calls Now! on you: Mondo writes, you don\'t.', 'VII-A'],
    ['third', 'The Third Party\'s points', 'The player who did not challenge and did not move may write a Solution or sit out. A correct Solution after Impossible! scores 6; sitting out an Impossible! that was right scores 4; a wrong Solution scores 2.', 'Impossible! was right and you sat out: 4 points.', 'X-B-3, X-B-4'],
    ['match', 'Match points', 'The shake points decide the places. Three players: first 6, second 4, third 2; two tied for first get 5 each, all three tied get 4, two tied for second get 3.', 'Scores 14, 10, 10 → 6, 3, 3 match points.', 'XII-A'],
    ['both', 'Sideways AND upside-down', 'With both cards, a cube in a Solution (not in the Goal) may be turned both ways at once: 3 becomes −1/3.', '6 + (−1/3) = 5 2/3.', 'XIII-A-2 comment (a), F1'],
    ['wildturn', 'A wild 0, turned', 'A wild 0 can be turned sideways or upside-down. Every 0 still stands for the same digit, but each 0 may be turned its own way. A Goal 0 looks the same upside-down, so it may be read either way.', '0 stands for 6: one 0 is 6, a sideways 0 is 1/6, an upside-down 0 is −6.', 'F2, F3, General Principle 11'],
    ['factmulti', 'Factorial with Use It Again', 'With both cards, a Solution may use as many ! signs as you like. The Goal still has at most two.', '3!! = 720 and still more ! in the Solution.', 'XIII-A-5'],
    ['factturn', 'Factorial needs whole numbers', 'A factorial only works on 0, 1, 2, 3, … so a sideways or upside-down cube can\'t have a ! right behind it.', '(1/3)! and (−3)! are not allowed; (1 + (−1))! = 0! = 1 is fine.', 'XIII-A-4 comment (a), F6, F7'],
    ['threecount', 'What counts for Three Operations', 'Every operation sign counts: + − × ÷ ^ √, a ! with Factorial, a × used for Number of Factors, a sideways ÷, a √ used as LCM, a ^ used as GCF.', '#6 + 2! = 6 uses three signs: ×, + and !.', 'XIII-A-6'],
    ['nfmulti', 'Counting factors again and again', 'With Use It Again, a × may count factors many times in a row, and the same × can also multiply.', '××12 = #(#12) = #6 = 4.', 'F4, F5'],
    ['nflimit', 'How big for Number of Factors?', 'Elementary: the number must be a counting number up to 200. Middle: up to 1000.', 'Elementary: #(5^4) = #625 is not allowed; Middle: it is 5.', 'XIII-A-11, XIII-B-8'],
    ['lcmmulti', 'LCM or GCF with Use It Again', 'A √ (or ^) can be used again, sometimes as LCM (GCF) and sometimes as root (power). The writer says which is which.', '6 lcm 4 + √9 uses one √ cube twice.', 'F10, E47'],
    ['ambig', 'Two rules pull on the same number', 'A √ or a "count the factors" × in front of a number and a ! or an exponent behind it: a tournament checker may read it either way, so a careful writer adds ( ). The game reads the ! or exponent first and shows the value.', '√9! could be √(9!) or (√9)! = 6.', 'VII-B-6-c, E41, E46, E54, E55'],
    ['basek', 'Base m with Multiple of k', 'Change the Goal into tens first, then miss it by k, 2k, 3k …', 'Base 8, Goal 24 (= twenty), k = 6: Solutions equal to 26, 14, 32 … count.', 'F23'],
    ['pobturn', 'Powers of the Base, turned', 'With Upside-down, a 1 can be −10, −100, −0.1 … With Sideways a 1 may be turned, but that adds nothing new. With Base m, a 1 means 8, 64, … in base 8.', 'Upside-down 1 as −100: 5 + (−100) = −95.', 'F14, F17, XIII-B-10'],
    ['twoturn', 'Turned cubes and two-digit numbers', 'A turned cube is a number all by itself. It can\'t sit next to another number to make a two-digit number.', 'An upside-down 6 next to a 2 is not "−62".', 'XIII-A-2 example, F15, F16'],
    ['insulate', 'Mistakes that get "insulated"', 'If somebody does something not allowed and the NEXT player makes a legal move or challenge, it is too late to fix: the mistake stands. You can\'t insulate your own mistake.', 'You place a cube out of turn, the next player moves: it stays.', 'IX-B, General Principle 4']
  ];
  function rulingsListHTML() {
    return '<b>Rulings</b> <small>(my own words; the numbers are the official rule and judges\' manual references)</small><div class="tj-rulings">' + RULINGS.map(function (r) { return '<button class="btn small" data-act="tRuling" data-arg="' + r[0] + '">' + esc(r[1]) + '</button>'; }).join('') + '</div>';
  }
  function rulingHTML(id) {
    var r = RULINGS.filter(function (x) { return x[0] === id; })[0]; if (!r) return '';
    return '<b>' + esc(r[1]) + '</b><p>' + esc(r[2]) + '</p><p class="tj-ex">Example: ' + esc(r[3]) + '</p><p class="tj-ref">Official: ' + esc(r[4]) + '</p>' + rulingsListHTML();
  }
  // From a menu (no game): just the rulings.
  function judgeRulings(q) {
    modal('<h2 class="tj-h">' + judgeFace(56) + ' Judge Pip</h2><div class="tj-ans">' + (q && q.indexOf('ruling:') === 0 ? rulingHTML(q.slice(7)) : rulingsListHTML()) + '</div><div class="row"><button class="btn green" data-act="closeModal">Thanks, Judge!</button></div>');
  }
  // From the builder (js/builder.js): Goal or Solution being built right now.
  function judgeBuilder() {
    if (typeof B === 'undefined' || !B) return;
    var html = B.kind === 'goal' ? ansGoal() : ansSol();
    var box = document.getElementById('bJudge');
    if (box) { box.innerHTML = '<div class="tj-say">' + judgeFace(36) + '<div>' + html + '</div></div>'; box.style.display = ''; }
  }
  function judgeButtonHTML() { return (G && G.mode !== 'tutorial' && G.mode !== 'online') ? '<button class="btn small tj-jbtn" data-act="tJudge" title="Ask the Judge">' + judgeFace(22) + ' Judge</button>' : ''; }
  // Parent corner rows (js/screens.js puts these in; docs/handoff/tourney.md).
  function parentHTML() {
    var o = opt();
    function sw(k, label, sub) { return '<div class="setrow"><label>' + label + '<br><small style="font-weight:600">' + sub + '</small></label><button class="btn small ' + (o[k] ? 'green' : '') + '" data-act="tToggle" data-arg="' + k + '">' + (o[k] ? '✔ On' : 'Off') + '</button></div>'; }
    return sw('on', 'Tournament practice: open it now', 'Normally it opens after + − × ÷ and 3 creatures beaten.') +
      sw('middleOn', 'Tournament practice: allow the Middle list', 'Normally after every variation card is unlocked.') +
      sw('clock', 'Tournament practice clock', 'Shows the official time limits. Off by default; it never costs points unless strict penalties are on too.') +
      sw('strict', 'Tournament strict penalties', 'The official −1 penalties (bad card pick, bonus move while leading, a challenge that isn\'t allowed, the clock). Off by default.');
  }
  return { resumeSel: resumeSel, selPending: selPending, setup: setup, firstSetter: firstSetter, onShake: onShake, fixOps: fixOps, beforeGoal: beforeGoal, mayBonus: mayBonus, bonusButtonHTML: bonusButtonHTML, bonusTap: bonusTap,
    illegal: illegal, penalize: penalize, topHTML: topHTML, endMatch: endMatch, judge: judge, judgeBuilder: judgeBuilder, judgeButtonHTML: judgeButtonHTML, judgeFace: judgeFace,
    tileHTML: tileHTML, introHTML: introHTML, openSetup: openSetup, parentHTML: parentHTML, unlocked: unlocked, middleOpen: middleOpen, stopClock: stopClock, RULINGS: RULINGS };
})();
