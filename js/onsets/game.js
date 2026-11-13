'use strict';
// ======================= ON-SETS: MATCH FLOW =======================
// Two or three players: the kid against one creature ('ai'), pass-and-play ('pvp'), the kid against two creatures
// ('ai3'), or a family game ('p3': the kid + a second person + a creature or a third person). Names, faces and talk
// come from OPPONENTS in js/config.js; On-Sets strength from js/onsets/ai.js. Untimed. Elementary basic rules (no
// Restrictions, no variations, no bonus moves): see ONSETS_RULES_SUMMARY.md. State lives in OG.
// The match is drawn on the 3D table in the stadium when it can be (js/onsets/view3d.js + js/three/onsets3d.js, on
// the #game screen, like Equations), otherwise on the flat mat (the #onsets screen). The rules code below is the same
// for both: OG.three only changes how things are drawn and who carries the cubes.
var OG = null;

// ---- Saving: On-Sets progress lives in S.onsets, separate from Equations ----
var OS_LEVELS = [
  { at: 0, name: 'Card Spotter' }, { at: 4, name: 'Set Seeker' }, { at: 10, name: 'Union Builder' },
  { at: 18, name: 'Intersection Ace' }, { at: 28, name: 'Minus Master' }, { at: 40, name: 'Not-So-Simple Solver' },
  { at: 55, name: 'Universe Explorer' }, { at: 75, name: 'Set Wizard' }
];
function osState() {
  if (!S.onsets || typeof S.onsets !== 'object') S.onsets = {};
  var o = S.onsets;
  if (o.v == null) o.v = 1;
  if (typeof o.stars !== 'number') o.stars = 0;
  if (!Array.isArray(o.beaten)) o.beaten = [];
  for (var i = 0; i < OPPONENTS.length; i++) o.beaten[i] = !!o.beaten[i];
  if (!o.drills) o.drills = {};
  if (!o.stats) o.stats = { shakes: 0, correct: 0, attempts: 0, nowWins: 0, impWins: 0, matches: 0, wins: 0 };
  if (typeof o.deal !== 'number') o.deal = 8;
  if (typeof o.tutorialDone !== 'boolean') o.tutorialDone = false;
  if (o.row == null) o.row = 0;
  if (!o.p2) o.p2 = 'Tata';
  if (!o.p3) o.p3 = 'Mama';
  return o;
}
function osLevel(stars) { var L = 0; for (var i = 0; i < OS_LEVELS.length; i++) if (stars >= OS_LEVELS[i].at) L = i; return L; }
// One On-Sets skill star (reward for skill, never for speed). Celebrates a new On-Sets level.
function osStar(why, n) {
  var o = osState(), before = osLevel(o.stars);
  o.stars += (n || 1); persist();
  if (typeof OG !== 'undefined' && OG) { (OG.starsShake = OG.starsShake || []).push(why); (OG.starsMatch = OG.starsMatch || []).push(why); }
  osToast(ico('star') + ' ' + why);
  var after = osLevel(o.stars);
  if (after > before) setTimeout(function () { osToast(ico('crown') + ' New On-Sets level: ' + OS_LEVELS[after].name + '!'); if (Snd.fanfare) Snd.fanfare(); }, 900);
}
function osToast(text) {
  var box = document.getElementById('toasts'); if (!box) return;
  var t = document.createElement('div'); t.className = 'toast os-toast'; t.innerHTML = '<span>' + text + '</span>';
  box.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
}
function osOpen(i) { return i % LEAGUE === 0 || !!osState().beaten[i - 1]; }

// The 3D glue loads itself (no index.html edit needed): a classic script and an ES module next to the 3D table.
(function () {
  if (typeof document === 'undefined') return;
  function add(src, mod) {
    if (document.querySelector('script[src="' + src + '"]')) return;
    var s = document.createElement('script'); s.src = src; if (mod) s.type = 'module'; s.async = false; document.head.appendChild(s);
  }
  add('js/onsets/view3d.js'); add('js/three/onsets3d.js', true);
})();
function os3d() { return !!(OG && OG.three && window.OS3D); }

// ---- Little helpers ----
function osCubes(z) { return OG.cubes.filter(function (c) { return c.zone === z; }).sort(function (a, b) { return a.order - b.order; }); }
function osSyms(z) { return osCubes(z).map(function (c) { return c.s; }); }
function osSnap() { return { req: osSyms('required'), perm: osSyms('permitted'), res: osSyms('resources') }; }
function osRes() { return osCubes('resources').map(function (c) { return { id: c.id, s: c.s }; }); }
function osN() { return OG.players.length; }
function osNext(i) { return (i + 1) % osN(); }            // play passes to the left (rules IV-A)
function osPrev(i) { return (i + osN() - 1) % osN(); }     // the player to the right (deals the Universe, rules II-B)
function osOther(i) { return osNext(i); }
function osIdx() { return OG.players.map(function (p, i) { return i; }); }
function osIsAI(i) { return !!(OG.players[i] && OG.players[i].ai); }
function osHumans() { return osIdx().filter(function (i) { return !osIsAI(i); }); }
function osAIs() { return osIdx().filter(osIsAI); }
function osName(i) { return esc(OG.players[i].name); }
function osMulti() { return osHumans().length > 1; }
function osThird(a, b) { if (osN() < 3) return null; var r = osIdx().filter(function (i) { return i !== a && i !== b; }); return r.length ? r[0] : null; }
function osVsCreature() { return osAIs().length > 0 && !osIsAI(0); } // the device owner earns On-Sets stars only against creatures
// which creature at the table plays for player i (two creatures: the first AI player is creature 0)
function osSeat(i) { var n = -1; for (var j = 0; j <= i && j < OG.players.length; j++) if (OG.players[j].ai) n++; n = n < 0 ? 0 : n; return n; } // (creatures in play order; js/onsets/view3d.js alone mirrors the figures' seats so play goes clockwise)
// was: }  // CLOCKWISE: OG.seatFlip puts the first creature to play on the kid's left (wide table: creature seat 1)
// the creature that is 'up' (speaks, is shown in the speech line)
function osFocus(i) {
  if (!OG || !osIsAI(i)) return;
  var changed = OG.act !== i; OG.act = i;
  if (os3d()) OS3D.use(osSeat(i));
  if (changed) { var el = document.getElementById('osSpeech'); if (el && OG.speech && OG.speech.who === 'opp') el.outerHTML = osSpeechHTML(); }
}
var osOrder = 0;
function osSit() { return { g: OG, cubes: OG && OG.cubes, phase: OG && OG.phase, oc: osOrder, ch: OG && OG.ch }; }
function osStill(s) { return !!OG && OG === s.g && OG.cubes === s.cubes && OG.phase === s.phase && osOrder === s.oc && OG.ch === s.ch; }
function osThink(task, args, minMs) {
  var pause = new Promise(function (ok) { setTimeout(ok, minMs || 0); });
  return Promise.all([OSThink.run(task, args), pause]).then(function (x) { return x[0]; });
}
function osOops(e) { if (window.console) console.error('[On-Sets computer player]', e); }
function osTalk(o, kind) { return o && o.talk && o.talk[kind] ? pick(o.talk[kind]) : ''; }
function osMood(i, m) { if (os3d()) OS3D.mood(i, m); }
function osCrowd(kind) { try { if (os3d()) OS3D.crowd(kind); else if (typeof crowdReact === 'function') crowdReact(kind); } catch (e) {} }
function osKid(m) { if (os3d()) try { OS3D.kid(m); } catch (e) {} }   // the kid's own moods: wave, now, win, lose, yes, proud, gg
// the cube kinds the 3D table draws (js/three/onsets3d.js). Colour and operation cubes have 4 symbols on 6 faces:
// each cube gets one of two face layouts at random every shake (two symbols doubled), so each symbol still comes up
// with exactly a 1 in 4 chance (ONSETS_RULES_SUMMARY.md, interpretation 1).
function osKindName(kind) {
  if (kind === 'digit') return 'osD';
  if (kind === 'color') return Math.random() < 0.5 ? 'osC1' : 'osC2';
  if (kind === 'op') return Math.random() < 0.5 ? 'osO1' : 'osO2';
  return 'osR';
}

// ---- Speech (Pip or a creature) ----
function osSay(who, text, mood) {
  if (!OG) return;
  var fresh = !OG.speech || OG.speech.text !== text;
  OG.speech = { who: who, text: text, mood: mood || 'happy' };
  var plain = String(text).replace(/<[^>]+>/g, '');
  if (fresh && who === 'opp') {
    var ai = osAI();
    if (ai && Snd.talk) { var ms = Snd.talk(plain, ai.kind); if (ms && os3d()) OS3D.talk(ms); }
    if (os3d() && window.Social && Social.bubble) Social.bubble('opp', plain);
  } else if (fresh && who === 'pip' && S.set.voice === true && Snd.speak) Snd.speak(plain, 'pip');
  var el = document.getElementById('osSpeech'); if (el) el.outerHTML = osSpeechHTML();
}
function osAI() {
  if (!OG) return null;
  if (OG.act != null && OG.players[OG.act] && OG.players[OG.act].ai) return OG.players[OG.act].ai;
  for (var i = 0; i < OG.players.length; i++) if (OG.players[i].ai) return OG.players[i].ai;
  return null;
}
function osSpeechHTML() {
  var sp = OG.speech || { who: 'pip', text: '' }, face = sp.who === 'opp' && osAI() ? avatarHTML(osAI()) : pipHTML(sp.mood, 54, '');
  return '<div class="speech" id="osSpeech"><div class="who">' + face + '</div><div class="txt">' + sp.text + '</div></div>';
}

// ======================= STARTING =======================
// mode 'ai' (oppIdx = creature), 'pvp' (cfg.p2), 'ai3' (cfg.a, cfg.b = two creatures),
// 'p3' (cfg.n2 = second person; cfg.creature >= 0 = a creature, else cfg.n3 = a third person)
function osAddAI(k) { var o = OPPONENTS[k]; OG.players.push({ name: o.name, ai: o, oppIdx: k, skill: OSAI.skill(o), score: 0, list: [] }); }
function osStartMatch(mode, oppIdx, cfg) {
  osState();
  cfg = cfg || {};
  OG = { mode: mode, oppIdx: oppIdx, cfg: cfg, shakes: S.set.shakes || 3, shake: 1, setter: 0, players: [], trailed: false, act: null };
  OG.players.push({ name: S.name, ai: null, score: 0, list: [] });
  if (mode === 'ai') osAddAI(oppIdx);
  else if (mode === 'ai3') { osAddAI(cfg.a); osAddAI(cfg.b); }
  else if (mode === 'p3') {
    OG.players.push({ name: cfg.n2 || 'Tata', ai: null, score: 0, list: [] });
    if (cfg.creature >= 0) osAddAI(cfg.creature); else OG.players.push({ name: cfg.n3 || 'Mama', ai: null, score: 0, list: [] });
  } else OG.players.push({ name: cfg.p2 || 'Player 2', ai: null, score: 0, list: [] });
  for (var i = 0; i < OG.players.length; i++) if (OG.players[i].ai) { OG.act = i; break; }
  OG.three = !!(window.OS3D && OS3D.can());
  Onsets.view = 'game';
  if (OG.three) { OS3D.begin(); osClockwise(); } else go('onsets');
  Snd.setMood('play');
  osNewShake();
  var first = osAI();
  if (first) { var hi = osTalk(first, 'greet'); if (hi) setTimeout(function () { if (OG && OG.phase === 'setup') osSay('opp', hi); }, 300); }
}
// CLOCKWISE (two creatures): play goes kid -> the creature on his left -> the one on his right. On the wide table creature
// seat 1 stands on the left (js/three/creatures.js PAIR) and on the tall one seat 0 does, so on the wide table the first
// creature to play is given seat 1: osSeat() flips and the two kinds are set again in the opposite order (view3d.js
// seats them in player order, and is not edited here). Same wide/tall test as js/three/table.js chooseLayout.
function osClockwise() { OG.seatFlip = false; } // the seat mirror lives in js/onsets/view3d.js (begin + seatOf); doing it here as well flipped it twice
function osNewShake() {
  OG.universe = []; OG.cubes = []; OG.goal = null; OG.goalValue = null; OG.lastMover = null; OG.selected = null; OG.ch = null;
  OG.busy = false; OG.highlight = null; OG.hintUsed = false; OG.phase = 'setup'; OG.turn = OG.setter; OG.dealt = false;
  OG.lit = null; OG.carrying = false; OG.looked = -1;
  if (os3d()) OS3D.newShake();
  osRender();
  var setter = OG.setter, dealer = osPrev(setter);
  // 1) the Goal-setter sets out two V and one Λ, or one V and two Λ (Elementary, rules II-A-3)
  function chooseVN(done) {
    if (osIsAI(setter)) { osFocus(setter); var vn = OSAI.chooseVN(); osSay('opp', 'I\'ll set out ' + (vn === 'VVN' ? 'two V and one Λ' : 'one V and two Λ') + '.'); setTimeout(function () { done(vn); }, 900); return; }
    osSay('pip', (osMulti() ? osName(setter) + ', you' : 'You') + ' set the Goal this shake. First, set out the three white cubes!');
    ACT.osVN = function (el) { var v = el.dataset.arg; ACT.osVN = null; closeModal(); done(v); };
    var cb = function (s) { return OSUI.cubeHTML({ s: s }, 'mini'); };
    modal('<h2 class="hero">' + (osMulti() ? osName(setter) + ': ' : '') + 'Set out the white cubes</h2>' +
      '<div class="os-vnexp"><div>' + cb('V') + '<span><b>V</b> means EVERY card</span></div><div>' + cb('N') + '<span><b>Λ</b> means NO cards</span></div></div>' +
      '<p class="os-note">In the Elementary game these three cubes are not rolled: you choose.</p>' +
      '<div class="os-choices"><button class="os-choice" data-act="osVN" data-arg="VVN"><span class="cs">' + cb('V') + cb('V') + cb('N') + '</span><b>Two V, one Λ</b></button>' +
      '<button class="os-choice" data-act="osVN" data-arg="VNN"><span class="cs">' + cb('V') + cb('N') + cb('N') + '</span><b>One V, two Λ</b></button></div>');
  }
  // 2) the dealer (the player to the setter's right) chooses how many cards (6 to 12 in Elementary, rules II-B-1)
  function chooseDeal(done) {
    if (osIsAI(dealer)) { osFocus(dealer); var n = OSAI.chooseDeal(OG.players[dealer].skill); osSay('opp', 'I\'ll deal ' + n + ' cards.'); setTimeout(function () { done(n); }, 900); return; }
    var st = osState();
    ACT.osDeal = function (el) { var n = +el.dataset.arg; ACT.osDeal = null; st.deal = n; persist(); closeModal(); done(n); };
    modal('<h2 class="hero">' + (osMulti() || osIsAI(setter) ? osName(dealer) + ': ' : '') + 'Deal the cards</h2>' +
      '<p class="os-note">You are the dealer. How many cards go in the <b>Universe</b>?</p>' +
      '<div class="os-numgrid os-deal">' + [6, 7, 8, 9, 10, 11, 12].map(function (n) { return '<button class="os-num' + (n === st.deal ? ' on' : '') + '" data-act="osDeal" data-arg="' + n + '"><b>' + n + '</b><small>cards</small></button>'; }).join('') + '</div>' +
      '<p class="os-note">Fewer cards make smaller Goals. More cards give more ways to make a set.</p>');
  }
  var g0 = OG;
  chooseVN(function (vn) {
    if (OG !== g0) return;
    chooseDeal(function (n) {
      if (OG !== g0) return;
      OG.cubes = OSE.roll(Math.random, { vn: vn }).map(function (c) { return { id: c.id, kind: c.kind, s: c.s, zone: 'resources', order: c.id, color: osKindName(c.kind) }; });
      OG.universe = OSE.deal(n, Math.random);
      OG.dealt = true;
      osSay('pip', 'Rolling the cubes and dealing ' + n + ' cards…');
      if (os3d()) {
        var c0 = OG.cubes;
        OS3D.rollAndDeal(dealer, function () { if (OG === g0 && OG.cubes === c0 && OG.phase === 'setup') setTimeout(function () { if (OG === g0 && OG.cubes === c0 && OG.phase === 'setup') osGoalPhase(); }, 400); });
        return;
      }
      OG.rolling = true;
      if (Snd.clatter) Snd.clatter(); OSUI.cardSnd('place');
      osRender(); OG.rolling = false;
      setTimeout(function () { if (OG === g0 && OG.phase === 'setup') osGoalPhase(); }, 1100);
    });
  });
}

// ======================= THE GOAL =======================
function osGoalPhase() {
  OG.phase = 'goal'; OG.turn = OG.setter;
  var P = OG.players[OG.setter];
  if (P.ai) {
    osFocus(OG.setter);
    OG.busy = true; osSay('opp', pick(P.ai.think)); osMood(OG.setter, 'think'); osRender();
    var sit = osSit(), who = OG.setter;
    osThink('chooseGoal', [P.skill, osRes(), OG.universe], 1100).then(function (g) {
      if (!osStill(sit)) return;
      if (g) { osSay('opp', P.ai.goal || 'Here is a Goal!'); osCarryGoal(g.goal, g.value, who); }
      else { OG.busy = false; osSay('opp', 'I don\'t think any Goal can be made!'); osNoGoal(OG.setter); }
    }).catch(osOops);
  } else {
    osSay('pip', (osMulti() ? '<b>' + osName(OG.setter) + '</b>, you' : 'You') + ' set the <b>Goal</b>: a number of cards. Use 1, 2 or 3 digit cubes. Side by side means add, stacked means multiply.');
    osRender();
  }
}
ACT.osBuildGoal = function () {
  if (!OG || OG.phase !== 'goal' || osIsAI(OG.setter) || OG.busy) return;
  var who = OG.setter;
  OSUI.openGoalBuilder({ universe: OG.universe, digits: osCubes('resources').filter(function (c) { return c.kind === 'digit'; }), title: (osMulti() ? osName(OG.setter) + ': ' : '') + 'Set the Goal', dock: os3d(),
    onDone: function (g, v) { osCarryGoal(g, v, who); }, onCancel: function () {} });
};
// The setter's hand (a creature, the kid or the mate) carries the Goal's digit cubes over one by one (3D), then the Goal is set.
function osCarryGoal(goal, value, who) {
  if (!os3d() || !OS3D.canCarry(who)) { osSetGoal(goal, value); return; }
  var g0 = OG, c0 = OG.cubes, k = 0; OG.busy = true; OG.carrying = true; osRender();
  (function next() {
    if (OG !== g0 || OG.cubes !== c0) return;
    if (k >= goal.digits.length || OG.skipCarry) { OG.skipCarry = false; OG.carrying = false; osSetGoal(goal, value); return; }
    var d = goal.digits[k], c = OG.cubes[d.id];
    OS3D.carry(who, d.id, 'goal', function () {
      if (OG !== g0 || OG.cubes !== c0) return;
      c.zone = 'goal'; c.neg = d.neg; c.order = ++osOrder; OG.goal = { shape: goal.shape, digits: goal.digits.slice(0, k + 1) }; k++; osRender(); setTimeout(next, 120);
    }, { quick: true, goal: goal, k: k });
  })();
}
function osSetGoal(goal, value) {
  goal.digits.forEach(function (d) { var c = OG.cubes[d.id]; c.zone = 'goal'; c.neg = d.neg; c.order = ++osOrder; });
  OG.goal = goal; OG.goalValue = value;
  // the digit cubes not in the Goal go to Forbidden: they are never used in Solutions (rules III-B comment, page O6; manual OS-B1)
  var spare = osCubes('resources').filter(function (c) { return c.kind === 'digit'; });
  spare.forEach(function (c) { c.zone = 'forbidden'; c.order = ++osOrder; });
  OG.lastMover = OG.setter; OG.turn = osNext(OG.setter); OG.phase = 'move'; OG.busy = false; OG.carrying = false;
  if (Snd.thunk) Snd.thunk(); if (Snd.chime) Snd.chime();
  banner('🎯 GOAL: ' + value, value + ' card' + (value === 1 ? '' : 's'));
  if (os3d()) OS3D.goalSet(value);
  else osCrowd(goal.digits.length >= 3 ? 'ooh' : 'cheer');
  if (osIsAI(OG.setter)) osMood(OG.setter, 'proud');
  else { osKid('proud'); if (value >= 10 || goal.digits.length >= 3) osAIs().forEach(function (i, k) { setTimeout(function () { if (OG && OG.phase === 'move') osMood(i, 'impressed'); }, 600 + k * 350); }); }
  if (Snd.getMood && Snd.getMood() === 'think') Snd.setMood('play');
  osRender();
  setTimeout(function () { if (OG && OG.phase === 'move') { var told = spare.length && !osIsAI(OG.turn); if (told) osSay('pip', 'The Goal is <b>' + value + '</b> card' + (value === 1 ? '' : 's') + '. The spare digit cube' + (spare.length > 1 ? 's go' : ' goes') + ' to Forbidden (digits are only for the Goal). ' + (osMulti() ? '<b>' + osName(OG.turn) + '</b>, your' : 'Your') + ' turn: move a cube, or challenge!'); osNextTurn(told); } }, 900);
}

// ======================= MOVES =======================
function osHumanTurn() { return OG && OG.phase === 'move' && !OG.busy && !osIsAI(OG.turn); }
function osNowCheck(p) {
  if (OG.lastMover === null || OG.lastMover === p) return 'There is no move to challenge yet.';
  if (osCubes('resources').length < 2) return 'Now! needs at least two cubes left in Resources.';
  if (osCubes('required').length + osCubes('permitted').length === 0) return 'Now! needs at least one cube in Required or Permitted first.';
  return '';
}
function osNextTurn(quiet) {
  if (!OG || OG.phase !== 'move') return;
  osInterject(); // RACE: a creature that is not moving may call after its reaction time (it never holds up the turn)
  if (osIsAI(OG.turn)) { setTimeout(osAITurn, 500); return; }
  var last = osCubes('resources').length === 1, name = osMulti() ? '<b>' + osName(OG.turn) + '</b>, your' : 'Your';
  if (last) osSay('pip', name + ' turn. Only ONE cube left! Move it to <b>Required</b> or <b>Permitted</b>, or call <b>Impossible!</b> if nobody can make the Goal.', 'think');
  else if (!quiet) osSay('pip', name + ' turn! Tap a Resource cube, then tap a section. Or challenge: <b>Now!</b> or <b>Impossible!</b>');
  osRender();
}
// RACE (three players, no "Go on" pause): after every move, everyone except the mover may challenge, and it is a race.
// A creature that spots something calls after its own reaction time (stronger creatures are quicker, nobody sees a timer);
// a person can beat it to the button. Any new move or challenge cancels a call that has not happened yet (osStill), and the
// mover can never challenge their own move. Same idea as aiInterject / reactMs in js/game.js (Pace is Equations-only).
function osReactMs(p) { var o = (OG.players[p] && OG.players[p].ai) || {}, s = o.stars || 3, f = o.fire || 0; return Math.max(1800, 6800 - s * 900 - f * 450) + Math.random() * 1200; }
function osInterject() {
  if (osN() < 3 || OG.lastMover === null) return false;
  var cands = osIdx().filter(function (i) { return osIsAI(i) && i !== OG.lastMover && i !== OG.turn; });
  if (!cands.length || OG.looked === osOrder) return false; // already looked at this move
  OG.looked = osOrder;
  var sit = osSit(), list = cands.map(function (p) { return { p: p, o: OG.players[p].skill, nowOk: !osNowCheck(p) }; });
  osThink('interject', [list, osSnap(), OG.goalValue, OG.universe], 300).then(function (hit) {
    if (!hit || !osStill(sit)) return;
    setTimeout(function () {
      if (!osStill(sit) || OG.carrying || OG.phase !== 'move') return; // someone moved or called first
      if (hit.d.kind === 'now') OG.aiPlan = hit.d.plan;
      OG.busy = false; osChallenge(hit.d.kind, hit.p);
    }, osReactMs(hit.p));
  }).catch(osOops);
  return true;
}
// tapping a Resource cube: pick it up (select). A colour, V or Λ cube also lifts the cards in its set.
ACT.osCube = function (el) {
  if (!OG) return;
  if (OG.carrying && os3d()) { OS3D.finishCarry(); return; }
  var id = +el.dataset.arg, c = OG.cubes[id];
  if (!c || c.zone !== 'resources') return;
  if (!osHumanTurn()) { if (OG.phase === 'goal' && !osIsAI(OG.setter)) osSay('pip', 'First, tap <b>Build the Goal</b>!'); return; }
  if (c.kind === 'digit') { osSay('pip', 'Digit cubes are only for the Goal.'); return; }
  Snd.click();
  OG.selected = OG.selected === id ? null : id;
  osLitFor(OG.selected);
  if (OG.selected != null) osSay('pip', 'Now tap <b>Required</b>, <b>Permitted</b> or <b>Forbidden</b> for that cube.' + (OG.lit != null ? ' (The ' + OG.litCount + ' card' + (OG.litCount === 1 ? '' : 's') + ' in ' + esc(OSE.show(c.s)) + ' are lifted.)' : '') + (osCubes('resources').length === 1 ? ' (The last cube can\'t go to Forbidden.)' : ''));
  osRender();
};
function osLitFor(id) {
  var c = id != null ? OG.cubes[id] : null;
  if (c && OSE.isSetSym(c.s)) { OG.lit = OSE.leafSet(c.s, OG.universe); OG.litCount = OSE.popcount(OG.lit); if (!os3d()) OSUI.cardSnd('lift'); if (os3d()) OS3D.highlight(OG.lit, OSE.show(c.s) + ': ' + OG.litCount + ' card' + (OG.litCount === 1 ? '' : 's')); }
  else { OG.lit = null; if (os3d()) OS3D.highlight(null); }
}
ACT.osZone = function (el) {
  if (!OG || OG.selected == null || !osHumanTurn()) return;
  osTryMove(OG.selected, el.dataset.arg, false);
};
// dragged = dropped by hand on the 3D table (no walk-over carry then)
function osTryMove(id, zone, dragged) {
  if (['required', 'permitted', 'forbidden'].indexOf(zone) < 0 || !OG.cubes[id] || OG.cubes[id].zone !== 'resources') return false;
  if (zone === 'forbidden' && osCubes('resources').length === 1) { osSay('pip', 'The very last cube can\'t go to Forbidden. Put it in <b>Required</b> or <b>Permitted</b>!', 'think'); Snd.boop(); return false; }
  OG.selected = null; osLitFor(null);
  var who = OG.turn;
  if (dragged || !os3d() || !OS3D.canCarry(who)) { osPlace(id, zone, who); return true; }
  var g0 = OG, c0 = OG.cubes; OG.busy = true; OG.carrying = true; osRender();
  OS3D.carry(who, id, zone, function () { if (OG !== g0 || OG.cubes !== c0) return; OG.busy = false; OG.carrying = false; osPlace(id, zone, who); });
  return true;
}
function osPlace(id, zone, who) {
  var c = OG.cubes[id];
  c.zone = zone; c.order = ++osOrder; OG.justMoved = id; OG.highlight = null; OG.lastMover = who;
  if (Snd.thunk && !os3d()) Snd.thunk();
  if (osCubes('resources').length === 0) { osRender(); var gL = OG, cL = OG.cubes; setTimeout(function () { if (OG === gL && OG.cubes === cL) osLastCubePlayed(); }, 600); return; }
  OG.turn = osNext(who);
  osCrowd('clap');
  if (!osIsAI(who) && osAIs().length) { osSay('pip', pick(['Nice move!', 'Good thinking!', 'Placed!', 'Ooh, interesting!'])); if (Math.random() < 0.25) osMood(osAIs()[0], pick(['nod', 'gasp'])); }
  osRender();
  osNextTurn(false);
}
function osAITurn() {
  if (!OG || OG.phase !== 'move' || !osIsAI(OG.turn)) return;
  var me = OG.turn, P = OG.players[me], o = P.ai;
  osFocus(me);
  OG.busy = true; osSay('opp', (S.set.trash !== false && o.talk && Math.random() < 0.25) ? osTalk(o, 'trash') : pick(o.think)); osMood(me, 'think'); osRender();
  var sit = osSit(), canCh = OG.lastMover !== null && OG.lastMover !== me, nowOk = !osNowCheck(me);
  if (osCubes('resources').length === 1) nowOk = false;
  var pause = osN() > 2 ? 2300 + Math.random() * 1300 : 900 + Math.random() * 600, t0 = performance.now(); // RACE: with three at the table, a moment for the others to call first
  osThink('turn', [P.skill, osSnap(), osRes(), OG.goalValue, OG.universe, canCh, nowOk], pause).then(function (t) {
    if (!osStill(sit) || OG.turn !== me) return;
    if (t.challenge) {
      var d = t.challenge, callIt = function () { if (!osStill(sit) || OG.turn !== me || OG.carrying) return; OG.busy = false; if (d.kind === 'now') OG.aiPlan = d.plan; osChallenge(d.kind, me); };
      var wait = osN() > 2 ? osReactMs(me) - (performance.now() - t0) : 0; // a call waits its reaction time, so a person can beat it
      if (wait > 0) { OG.busy = false; osRender(); setTimeout(callIt, wait); } else callIt();
      return;
    }
    var mv = t.move, c = OG.cubes[mv.id];
    osSay('opp', 'I\'ll put the ' + osCubeWord(c.s) + ' in ' + { required: 'Required', permitted: 'Permitted', forbidden: 'Forbidden' }[mv.zone] + '.');
    if (os3d() && OS3D.canCarry(me)) {
      OG.carrying = true; osRender();
      var c0 = OG.cubes, g0 = OG;
      OS3D.carry(me, mv.id, mv.zone, function () { if (OG !== g0 || OG.cubes !== c0) return; OG.busy = false; OG.carrying = false; osPlace(mv.id, mv.zone, me); });
    } else { OG.busy = false; osPlace(mv.id, mv.zone, me); }
  }).catch(osOops);
}
function osCubeWord(s) { return OSE.isColor(s) ? '<b class="os-w-' + s + '">' + s + '</b> cube' : '<b>' + esc(OSE.show(s)) + '</b>'; }

// ======================= CHALLENGES =======================
// who challenges: the button's data-arg (another person at a 3-player table), else the player whose turn it is
function osChallengerFrom(el) { return (el && el.dataset && el.dataset.arg !== undefined && el.dataset.arg !== '') ? +el.dataset.arg : OG.turn; }
function osCanChallenge(p) {
  if (!OG || OG.phase !== 'move' || osIsAI(p) || OG.lastMover === null || p === OG.lastMover || OG.carrying) return false;
  return p === OG.turn ? osHumanTurn() : true;
}
ACT.osNow = function (el) {
  if (!OG) return;
  var p = osChallengerFrom(el);
  if (!osCanChallenge(p)) return;
  var why = osNowCheck(p);
  if (why) { osSay('pip', why, 'think'); Snd.boop(); return; }
  osChallenge('now', p);
};
ACT.osImp = function (el) {
  if (!OG) return;
  var p = osChallengerFrom(el);
  if (OG.phase === 'move' && (OG.lastMover === null || OG.lastMover === p)) { osSay('pip', 'There is no move to challenge yet.'); return; }
  if (!osCanChallenge(p)) return;
  osChallenge('impossible', p);
};
ACT.osHint = function () {
  if (!osHumanTurn()) return;
  OG.hintUsed = true;
  var st = osSnap(), base = { universe: OG.universe, goal: OG.goalValue, req: st.req, perm: st.perm, res: st.res, timeMs: 800 };
  if (!osNowCheck(OG.turn)) { var r = OSE.solve(Object.assign({ mode: 'now' }, base)); if (r.found) { osSay('pip', 'Psst… I think a Solution is possible RIGHT NOW, using the mat plus at most ONE Resource cube. You could call <b>⚡ Now!</b>', 'think'); return; } }
  var imp = OSE.solve(Object.assign({ mode: 'impossible' }, base));
  if (!imp.found && imp.complete) { osSay('pip', 'Hmm… I can\'t find ANY set with ' + OG.goalValue + ' card' + (OG.goalValue === 1 ? '' : 's') + ' using these cubes. Maybe it\'s <b>🚫 Impossible!</b>', 'think'); return; }
  var mv = OSAI.chooseMove(OSAI.skill({ stars: 5 }), st, osRes(), OG.goalValue, OG.universe);
  if (mv) { OG.highlight = mv.id; osSay('pip', 'Here\'s an idea: move the glowing ' + osCubeWord(OG.cubes[mv.id].s) + ' to <b>' + { required: 'Required', permitted: 'Permitted', forbidden: 'Forbidden' }[mv.zone] + '</b>. That looks safe!', 'think'); osRender(); }
};
function osChallenge(kind, who) {
  var mover = OG.lastMover, tp = osThird(who, mover);
  OG.phase = 'challenge'; OG.ch = { kind: kind, challenger: who, mover: mover, tp: tp }; OG.selected = null; OG.busy = false; osLitFor(null);
  banner(kind === 'now' ? '⚡ NOW!' : '🚫 IMPOSSIBLE!', OG.players[who].name + ' challenges!');
  if (Snd.slam) Snd.slam(); Snd.setMood('challenge');
  if (os3d()) OS3D.challenge(kind, who, mover);
  if (osIsAI(who)) { osFocus(who); osMood(who, 'challenge'); osSay('opp', kind === 'now' ? OG.players[who].ai.now : OG.players[who].ai.imp); }
  else if (osIsAI(mover)) { osFocus(mover); osMood(mover, 'nervous'); var kc = osTalk(OG.players[mover].ai, 'kidChallenge'); osSay('opp', kc || 'Oh! Let\'s see…'); }
  else osSay('pip', kind === 'now' ? osName(who) + ' says Now! and must write a Solution using the mat plus at most ONE Resource cube.' : 'Impossible! Now ' + osName(mover) + ' must try to write a Solution.', 'cheer');
  if (window.Commentary) try { Commentary.say('challenge', { kind: kind, by: OG.players[who].name }); } catch (e) {}
  osRender();
  var writer = kind === 'now' ? who : mover, g0 = OG;
  setTimeout(function () {
    if (OG !== g0) return;
    osWrite(writer, kind, function (res) {
      if (OG !== g0) return;
      if (tp === null) osResolve(res, null);
      else osAskThirdParty(tp, kind, function (tpRes) { osResolve(res, tpRes); });
    });
  }, 1400);
}
// Write a Solution: res = {ok, tokens, chk}
function osWrite(pi, mode, cb) {
  if (osIsAI(pi)) { osAIWrite(pi, mode, cb); return; }
  var open = function () { osOpenSolution(pi, mode, cb); };
  if (osMulti()) {
    modal('<h2 class="hero">Pass to ' + osName(pi) + '</h2><div class="os-pass">' + osRcFace(pi) + '<p>' + osName(pi) + ', it\'s your turn to write a Solution.' + (mode === 'last' || osN() > 2 ? ' No peeking, everybody else!' : '') + '</p></div><div class="row"><button class="btn green big" data-act="closeModal">I\'m ready!</button></div>', open);
  } else open();
}
function osCtx(mode) {
  var cubes = OG.cubes;
  return { universe: OG.universe, goal: OG.goalValue, mode: mode, zone: function (id) { return cubes[id] ? cubes[id].zone : 'forbidden'; },
    required: cubes.filter(function (c) { return c.zone === 'required'; }).map(function (c) { return c.id; }),
    label: function (id) { return cubes[id] ? OSE.show(cubes[id].s) : '?'; } };
}
function osOpenSolution(pi, mode, cb) {
  var ids = function (z) { return osCubes(z).map(function (c) { return c.id; }); };
  var pools = [{ label: 'Required (use them ALL)', ids: ids('required'), req: true }, { label: 'Permitted (use any)', ids: ids('permitted') }];
  if (mode === 'now') pools.push({ label: 'Resources (you may add ONE)', ids: ids('resources'), max: 1 });
  if (mode === 'impossible') pools.push({ label: 'Resources (count as Permitted now)', ids: ids('resources') });
  pools.push({ label: '⛔ Forbidden (can\'t use)', ids: ids('forbidden').filter(function (id) { return OG.cubes[id].kind !== 'digit'; }), forb: true });
  var titles = { now: 'Now! Write your Solution', impossible: 'Prove it! Write a Solution', last: 'Last cube: write a Solution' };
  var ctx = osCtx(mode);
  OSUI.openSetBuilder({ title: (osMulti() ? osName(pi) + ': ' : '') + titles[mode], universe: OG.universe, goal: OG.goalValue, goalPic: OSUI.goalPicHTML(OG.goal, true), pools: pools, cubes: OG.cubes, mode: mode,
    dock: os3d(), onLive: os3d() ? function (set, label) { OS3D.highlight(set, label); } : null,
    check: function (tokens) { return OSE.checkSolution(tokens, ctx); },
    onDone: function (tokens) {
      var chk = tokens ? OSE.checkSolution(tokens, ctx) : null, ok = !!(chk && chk.ok);
      if (pi === 0 && osVsCreature()) { var st = osState(); st.stats.attempts++; if (ok) st.stats.correct++; persist(); }
      cb({ ok: ok, tokens: tokens, chk: chk || { reasons: ['No Solution was written.'] } });
    } });
}
function osSymsToTokens(list, mode) {
  var pools = osCubes('required').concat(osCubes('permitted'), mode === 'last' ? [] : osCubes('resources')), used = {};
  return list.map(function (s) {
    if (s === '(' || s === ')') return s;
    var c = pools.find(function (x) { return x.s === s && !used[x.id]; });
    if (!c) return { s: s, id: -1 };
    used[c.id] = 1; return { s: s, id: c.id };
  });
}
function osAIWrite(pi, mode, cb) {
  var P = OG.players[pi], sit = osSit(), plan = null;
  osFocus(pi); osMood(pi, 'think');
  osSay('opp', esc(P.name) + ' is writing a Solution…'); osRender();
  if (mode === 'now' && OG.aiPlan) { plan = OG.aiPlan; OG.aiPlan = null; }
  var job = plan ? new Promise(function (ok) { setTimeout(function () { ok(plan); }, 1500); }) : osThink('write', [P.skill, osSnap(), OG.goalValue, OG.universe, mode], 1500);
  job.then(function (r) {
    if (!osStill(sit)) return;
    if (r && r.found) { var toks = osSymsToTokens(r.tokens, mode), chk = OSE.checkSolution(toks, osCtx(mode)); osSay('opp', chk.ok ? 'Done!' : 'Hmm…'); osMood(pi, chk.ok ? 'proud' : 'sheepish'); cb({ ok: chk.ok, tokens: toks, chk: chk }); }
    else { osSay('opp', 'I… couldn\'t find one!'); osMood(pi, 'sheepish'); cb({ ok: false, tokens: null, chk: { reasons: ['No Solution was written.'] } }); }
  }).catch(osOops);
}
// After a challenge in a 3-player match the Third Party MAY present a Solution (rules IV-B, page O3).
function osAskThirdParty(tp, kind, cb) {
  if (osIsAI(tp)) {
    osFocus(tp);
    var P = OG.players[tp], sit = osSit();
    osSay('opp', esc(P.name) + ' is deciding whether to write a Solution too…'); osRender();
    osThink('thirdParty', [P.skill, osSnap(), OG.goalValue, OG.universe, kind], 1300).then(function (r) {
      if (!osStill(sit)) return;
      if (r && r.found) { var toks = osSymsToTokens(r.tokens, kind), chk = OSE.checkSolution(toks, osCtx(kind)); osSay('opp', 'I wrote one too!'); cb({ presented: true, ok: chk.ok, tokens: toks, chk: chk }); }
      else { osSay('opp', 'I\'ll sit this one out.'); cb({ presented: false }); }
    }).catch(osOops);
    return;
  }
  ACT.osTpYes = function () { closeModal(); osWrite(tp, kind, function (res) { cb({ presented: true, ok: res.ok, tokens: res.tokens, chk: res.chk }); }); };
  ACT.osTpNo = function () { closeModal(); cb({ presented: false }); };
  modal('<h2 class="hero">' + osName(tp) + ': Third Party</h2><p class="os-note">You may write a Solution too, but you don\'t have to.</p>' +
    '<div class="os-pts"><div><b>4 or 6</b><span>Write a correct one</span></div><div><b>2</b><span>Write one that is not right</span></div><div><b>' + (kind === 'impossible' ? '4' : '6') + ' or 2</b><span>Skip it: ' + (kind === 'impossible' ? '4 if Impossible! was right' : '6 if the Now! Solution is wrong') + '</span></div></div>' +
    '<div class="row"><button class="btn green big" data-act="osTpYes">' + ico('pencil') + ' I\'ll write one</button><button class="btn quiet" data-act="osTpNo">No thanks</button></div>');
}
function osResolve(res, tpRes) {
  var ch = OG.ch, pts = OSE.scoreChallenge(ch.kind, ch.challenger, ch.mover, ch.tp, res.ok, tpRes), lines = [];
  var cn = osName(ch.challenger), mn = osName(ch.mover);
  if (ch.kind === 'now') lines.push(res.ok ? cn + ' called <b>Now!</b> and wrote a correct Solution.' : cn + ' called <b>Now!</b> but the Solution wasn\'t correct.');
  else lines.push(res.ok ? cn + ' called <b>Impossible!</b>, but ' + mn + ' found a Solution!' : cn + ' called <b>Impossible!</b> and ' + mn + ' couldn\'t write a correct Solution.');
  if (ch.tp !== null) lines.push(tpRes && tpRes.presented ? osName(ch.tp) + ' (Third Party) also wrote a Solution: ' + (tpRes.ok ? 'correct!' : 'not correct.') : osName(ch.tp) + ' (Third Party) didn\'t write one.');
  if (osVsCreature()) {
    if (ch.challenger === 0 && pts[0] === 6) {
      osKid('yes');
      var st = osState(); if (ch.kind === 'now') st.stats.nowWins++; else st.stats.impWins++;
      osStar(ch.kind === 'now' ? 'Correct Now! challenge' : 'Correct Impossible! call');
    } else if (ch.mover === 0 && ch.kind === 'impossible' && res.ok) osStar('Proved it wasn\'t impossible!');
    else if (ch.tp === 0 && tpRes && tpRes.presented && tpRes.ok) osStar('Smart Third Party Solution');
  }
  var sols = {}; sols[ch.kind === 'now' ? ch.challenger : ch.mover] = res;
  if (tpRes && tpRes.presented) sols[ch.tp] = { ok: tpRes.ok, tokens: tpRes.tokens, chk: tpRes.chk };
  osEndShake({ pts: pts, lines: lines, sols: sols });
}
// The last cube is on the mat: any other player may still call Impossible! (rules VII), otherwise everybody writes.
function osLastCubePlayed() {
  var mover = OG.lastMover, others = osIdx().filter(function (i) { return i !== mover; });
  OG.phase = 'lastcheck';
  var ais = others.filter(osIsAI), g0 = OG;
  function askHumans() {
    var hs = others.filter(function (i) { return !osIsAI(i); });
    if (!hs.length) { osLastWrite(); return; }
    osSay('pip', 'The last cube is on the mat!', 'think'); osRender();
    ACT.osLastImp = function (el) { closeModal(); var p = el && el.dataset.arg !== undefined ? +el.dataset.arg : hs[0]; OG.phase = 'move'; osChallenge('impossible', p); };
    ACT.osLastWrite = function () { closeModal(); osLastWrite(); };
    modal('<h2 class="hero">Last cube played!</h2><p class="os-note">If you think NOBODY can make the Goal now, call Impossible! Otherwise everybody writes a Solution: 4 points if it is right, 2 if not.</p>' +
      '<div class="row">' + hs.map(function (i) { return '<button class="btn imp" data-act="osLastImp" data-arg="' + i + '">' + ico('ban') + ' ' + (osMulti() ? osName(i) + ': ' : '') + 'Impossible!</button>'; }).join('') +
      '<button class="btn green big" data-act="osLastWrite">' + ico('pencil') + ' Let\'s write!</button></div>');
  }
  if (ais.length) {
    var k = 0;
    (function nextAI() {
      if (OG !== g0) return;
      if (k >= ais.length) { askHumans(); return; }
      var p = ais[k++], P = OG.players[p], sit = osSit();
      osFocus(p); osSay('opp', osTalk(P.ai, 'lastCube') || pick(P.ai.think)); osRender();
      osThink('callsLastImpossible', [P.skill, osSnap(), OG.goalValue, OG.universe], 1200).then(function (imp) {
        if (!osStill(sit)) return;
        if (imp) osChallenge('impossible', p); else nextAI();
      }).catch(osOops);
    })();
    return;
  }
  askHumans();
}
function osLastWrite() {
  OG.phase = 'lastwrite';
  osSay('pip', 'Everybody writes a Solution! Correct = 4 points, not correct = 2.', 'cheer'); osRender();
  var results = {}, g0 = OG;
  (function step(k) {
    if (OG !== g0) return;
    if (k >= osN()) {
      var oks = {}, lines = ['After the last cube, everyone wrote a Solution.'];
      osIdx().forEach(function (i) { oks[i] = results[i].ok; lines.push(osName(i) + (results[i].ok ? ' was correct: 4 points!' : ' scores 2.')); });
      if (osVsCreature() && results[0].ok) osStar('Correct Solution after the last cube');
      osEndShake({ pts: OSE.scoreLast(oks), lines: lines, sols: results });
      return;
    }
    osWrite(k, 'last', function (res) { results[k] = res; step(k + 1); });
  })(0);
}

// ======================= NO GOAL =======================
ACT.osNoGoal = function () {
  if (!OG || OG.phase !== 'goal' || osIsAI(OG.setter) || OG.busy) return;
  osNoGoal(OG.setter);
};
// Scores for a "No Goal" challenge (section III, page O6-O7): Challenger 6 if correct else 2; the setter 2 if the
// challenger is correct else 6; a Third Party who does not present a Solution: 6 if the challenger is wrong, 2 if right.
// (The app never asks a Third Party to write here: interpretation 15.)
function osNoGoalPts(ci, setter, ok) {
  var pts = {}; pts[ci] = ok ? 6 : 2; pts[setter] = ok ? 2 : 6;
  osIdx().forEach(function (i) { if (i !== ci && i !== setter) pts[i] = ok ? 2 : 6; });
  return pts;
}
function osNoGoal(setter) {
  var others = osIdx().filter(function (i) { return i !== setter; }), ai = others.filter(osIsAI)[0], hs = others.filter(function (i) { return !osIsAI(i); });
  if (ai !== undefined) {
    var P = OG.players[ai], sit = osSit(); OG.busy = true;
    osFocus(ai); osSay('opp', pick(P.ai.think)); osRender();
    osThink('findAnyGoal', [osRes(), OG.universe], 1200).then(function (g) {
      if (!osStill(sit)) return;
      OG.busy = false;
      if (g) {
        var pool = osCubes('resources').filter(function (c) { return c.kind !== 'digit'; }).map(function (c) { return c.s; });
        var r = OSE.solve({ universe: OG.universe, goal: g.value, req: [], perm: [], res: pool, mode: 'impossible', timeMs: 1500 });
        OG.goal = g.goal; OG.goalValue = g.value;
        g.goal.digits.forEach(function (d) { OG.cubes[d.id].zone = 'goal'; OG.cubes[d.id].neg = d.neg; });
        var sols = {}; sols[ai] = { ok: true, tokens: r.found ? osSymsToTokens(r.tokens, 'impossible') : null };
        osEndShake({ pts: osNoGoalPts(ai, setter, true), lines: [osName(ai) + ' challenged the "No Goal" call and found a Goal AND a Solution!'], sols: sols });
      } else { osSay('opp', 'I agree: no Goal!'); if (hs.length) osAskNoGoal(setter, hs); else osNoGoalAgreed(); }
    }).catch(osOops);
    return;
  }
  osAskNoGoal(setter, hs);
}
function osAskNoGoal(setter, hs) {
  ACT.osNGAgree = function () { closeModal(); osNoGoalAgreed(); };
  ACT.osNGChallenge = function (el) {
    closeModal();
    var other = el && el.dataset.arg !== undefined ? +el.dataset.arg : hs[0];
    osSay('pip', osName(other) + ': build a Goal, then a Solution for it, using any Resource cubes!');
    OSUI.openGoalBuilder({ universe: OG.universe, digits: osCubes('resources').filter(function (c) { return c.kind === 'digit'; }), title: osName(other) + ': build a Goal', dock: os3d(),
      onDone: function (g, v) {
        OG.goal = g; OG.goalValue = v; g.digits.forEach(function (d) { OG.cubes[d.id].zone = 'goal'; OG.cubes[d.id].neg = d.neg; }); osRender();
        var ctx = osCtx('impossible'), ids = osCubes('resources').filter(function (c) { return c.kind !== 'digit'; }).map(function (c) { return c.id; });
        OSUI.openSetBuilder({ title: osName(other) + ': now a Solution', universe: OG.universe, goal: v, pools: [{ label: 'Resources (use any)', ids: ids }], cubes: OG.cubes, mode: 'impossible',
          dock: os3d(), onLive: os3d() ? function (set, label) { OS3D.highlight(set, label); } : null,
          check: function (t) { return OSE.checkSolution(t, ctx); },
          onDone: function (t) { var chk = t ? OSE.checkSolution(t, ctx) : null, ok = !!(chk && chk.ok), sols = {}; sols[other] = { ok: ok, tokens: t, chk: chk };
            osEndShake({ pts: osNoGoalPts(other, setter, ok), lines: [osName(other) + (ok ? ' proved a Goal was possible!' : '\'s Solution wasn\'t correct, so the "No Goal" call stands.')], sols: sols }); } });
      } });
  };
  modal('<h2 class="hero">No Goal?</h2><p class="os-note"><b>' + osName(setter) + '</b> says no Goal can be made with these cubes and cards. ' + (hs.length > 1 ? 'Does everyone agree?' : osName(hs[0]) + ', do you agree?') + '</p>' +
    '<div class="row"><button class="btn green big" data-act="osNGAgree">' + (hs.length > 1 ? 'We agree' : 'I agree') + ': roll again</button>' +
    hs.map(function (i) { return '<button class="btn now" data-act="osNGChallenge" data-arg="' + i + '">' + (hs.length > 1 ? osName(i) + ': ' : '') + 'Challenge! I can make one</button>'; }).join('') + '</div>');
}
function osNoGoalAgreed() {
  modal('<h2 class="hero">Agreed!</h2><p class="os-note">Nobody could find a Goal, so this shake doesn\'t count. The same player rolls again!</p><div class="row"><button class="btn green big" data-act="closeModal">Roll again ' + ico('play') + '</button></div>', function () { if (OG) osNewShake(); });
}

// ======================= END OF SHAKE / MATCH =======================
// RESULTS (same cards as Equations: the .rc-* classes in css/style.css). A player's picture: the creature's portrait, the kid's own
// shirt (kit colour, trim and number), other people a numbered shirt in their seat colour.
function osRcFace(i) {
  var p = OG.players[i];
  if (p.ai) return avatarHTML(p.ai, 'lg');
  var sh = ['#c9342c', '#1c7ed6', '#2f9e44'][i % 3], tr = '#ffffff', num = String(i + 1);
  if (i === 0) { num = S.jersey || '7'; try { var k = typeof Kit !== 'undefined' && Kit.current ? Kit.current() : null; if (k && k.shirt) { sh = k.shirt; tr = k.trim || tr; } } catch (e) {} }
  var light = typeof rcLight === 'function' && rcLight(sh);
  return '<span class="rc-shirt' + (light ? ' light' : '') + '" style="--shirt:' + sh + ';--trim:' + tr + '" aria-hidden="true">' + esc(num) + '</span>';
}
// gain: points this shake (counts up once, "+n this shake"); without it the tile shows the final score only
function osRcSide(i, top, gain) {
  var p = OG.players[i], g = gain == null ? null : gain;
  return '<div class="rc-side' + (top ? ' top' : '') + '"><div class="rc-face">' + osRcFace(i) + '</div><div class="rc-name">' + osName(i) + '</div>' +
    '<div class="rc-score" data-count="' + p.score + '" data-from="' + (g == null ? 0 : p.score - g) + '">' + p.score + '</div>' +
    (g == null ? '' : '<div class="rc-gain"><b>+<span data-count="' + g + '">' + g + '</span></b> this shake</div>') + '</div>';
}
function osRcXP(list) { return list && list.length ? '<div class="xplist">' + list.map(function (l) { return '<span>' + ico('star') + ' ' + esc(l) + '</span>'; }).join('') + '</div>' : ''; }
// "5 cards · the Goal is 5": the Solution's card count against the Goal (calm when it is not the same number)
function osCmp(count, goal) {
  var same = goal != null && count === goal, cs = count + ' card' + (count === 1 ? '' : 's');
  return '<div class="os-cmp' + (same ? ' ok' : '') + '"><span class="oc-n">' + count + '</span><span class="oc-t">' + (same ? cs + ' = the Goal ' + ico('check') : goal != null ? cs + ' · the Goal is ' + goal : cs) + '</span></div>';
}
function osSolCard(label, tokens, ok, chk, tag) {
  var head = '<div class="rc-h">' + label + (tag === false ? '' : ok ? ' <span class="rc-tag ok">' + ico('check') + ' correct</span>' : ' <span class="rc-tag try">not quite</span>') + '</div>';
  if (!tokens) return '<div class="rc-sol">' + head + '<p style="margin:0">No Solution written.</p></div>';
  var ev = OSE.evaluate(tokens, OG.universe), body = '<div class="expr os-expr">' + OSUI.exprHTML(tokens, OG.cubes) + '</div>';
  if (ev.ok && !ev.ambiguous) body += OSUI.universeHTML(OG.universe, ev.set, { small: true, cls: 'os-resuni' }) + osCmp(ev.count, OG.goalValue);
  if (!ok && chk && chk.reasons && chk.reasons.length) body += '<ul class="reasons">' + chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
  return '<div class="rc-sol' + (ok ? ' ok' : '') + '">' + head + body + '</div>';
}
function osSolHTML(i, s) {
  if (!s) return '';
  return osSolCard(osName(i) + '\'s Solution', s.tokens, s.ok, s.chk);
}
// the one Solution the 3D table shows forming: the kid's correct one, else anyone's correct one, else the kid's try,
// else a sample that works
function osReplayPick(r, sample) {
  var sols = r.sols || {}, keys = Object.keys(sols).map(Number), pickK = null;
  if (sols[0] && sols[0].ok && sols[0].tokens) pickK = 0;
  else keys.forEach(function (k) { if (pickK === null && sols[k] && sols[k].ok && sols[k].tokens) pickK = k; });
  if (pickK === null && sols[0] && sols[0].tokens && !osIsAI(0)) pickK = 0;
  if (pickK !== null) return { tokens: sols[pickK].tokens, who: OG.players[pickK].name, ok: !!sols[pickK].ok };
  return sample ? { tokens: sample, who: 'One way', ok: true, sample: true } : null;
}
function osEndShake(r) {
  OG.phase = 'over'; OG.busy = false; OG.carrying = false; Snd.setMood('play');
  osIdx().forEach(function (i) { var v = r.pts[i] || 0; OG.players[i].score += v; OG.players[i].list.push(v); });
  var best = Math.max.apply(null, OG.players.map(function (p) { return p.score; }));
  if (OG.players[0].score < best) OG.trailed = true;
  var st = osState(); st.stats.shakes++; persist();
  osLitFor(null);
  osRender();
  var anyOk = Object.keys(r.sols || {}).some(function (k) { return r.sols[k] && r.sols[k].ok; }), sample = null;
  if (OG.goalValue != null && !anyOk) {
    var sn = osSnap(), sv = OSE.solve({ universe: OG.universe, goal: OG.goalValue, req: sn.req, perm: sn.perm, res: sn.res, mode: 'impossible', timeMs: 1500 });
    sample = sv.found ? sv.tokens : null; OG.sampleComplete = sv.complete;
  }
  var p0 = r.pts[0] || 0, good = !osIsAI(0) && p0 >= 4;
  // creatures react (the top-scoring one speaks)
  var aiI = osAIs().sort(function (x, y) { return (r.pts[y] || 0) - (r.pts[x] || 0); })[0], aiTalk = '';
  if (aiI !== undefined) {
    osFocus(aiI);
    var ao = OG.players[aiI].ai, ap = r.pts[aiI] || 0;
    if (ap > p0) { var gl = S.set.gloat !== false && Math.random() < 0.5; osMood(aiI, gl ? 'gloat' : 'happy'); aiTalk = gl ? osTalk(ao, 'gloat') : osTalk(ao, 'kidWrong'); }
    else if (ap < p0) { osMood(aiI, Math.random() < 0.3 ? 'cry' : 'sad'); aiTalk = osTalk(ao, Math.random() < 0.5 ? 'kidGoodMove' : 'sore'); }
    osAIs().filter(function (i) { return i !== aiI; }).forEach(function (i) {
      var p = r.pts[i] || 0, m = p > p0 ? (Math.random() < 0.5 ? 'happy' : 'clap') : p < p0 ? (Math.random() < 0.5 ? 'sad' : 'shrug') : null;
      if (m) setTimeout(function () { if (OG && OG.phase === 'over') osMood(i, m); }, 350);
    });
  }
  if (osAIs().length) {
    if (good) { Snd.chime(); FX.confetti(70); osCrowd('cheer'); if (os3d()) OS3D.kid('cheer'); osSay('pip', 'Great shake!', 'cheer'); }
    else { Snd.boop(); osCrowd('aw'); if (os3d()) OS3D.kid('clap'); osSay('pip', 'Good try! Every shake teaches your brain something new.'); }
  } else Snd.chime();
  if (aiTalk) setTimeout(function () { if (OG && OG.phase === 'over') osSay('opp', aiTalk); }, 400);
  // RESULTS: the end-of-shake card (Equations' .rc cards): every side's tile (points count up once), what happened, the Solutions
  // as cubes with their card count against the Goal, what was earned, one clear button. Never shaming: a miss is "Nice try!".
  var vsAI = osAIs().length > 0 && !osMulti(), gv = OG.goalValue;
  var solsHTML = osIdx().map(function (i) { return osSolHTML(i, r.sols && r.sols[i]); }).join('') +
    (sample ? osSolCard(anyOk ? 'Another way' : 'One way that works', sample, true, null, false) : '');
  var html = '<div class="rc rc-shake' + (vsAI ? (good ? ' win' : ' kind') : '') + '"><h2 class="hero">' + (vsAI ? (good ? 'Great shake!' : 'Nice try!') : 'Shake over!') + '</h2>' +
    '<div class="rc-meta"><span class="rc-chip">Shake ' + OG.shake + ' of ' + OG.shakes + '</span><span class="rc-chip gold">' + ico('target') + ' Goal <b>' + (gv != null ? gv : '?') + '</b> card' + (gv === 1 ? '' : 's') + '</span></div>' +
    '<div class="rc-board" style="--n:' + osN() + '">' + osIdx().map(function (i) { return osRcSide(i, (r.pts[i] || 0) >= 4, r.pts[i] || 0); }).join('') + '</div>' +
    (r.lines.length ? '<div class="rc-lines">' + r.lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') + '</div>' : '') +
    (solsHTML ? '<div class="rc-sols">' + solsHTML + '</div>' : '') +
    (gv != null && !sample && !anyOk ? '<div class="okbox">I searched and there is no Solution with these cubes.' + (OG.sampleComplete === false ? ' <small>(I ran out of searching time, so that does not prove there is none.)</small>' : '') + '</div>' : '') +
    osRcXP(OG.starsShake) +
    '<div class="row"><button class="btn green big" data-act="closeModal">' + (OG.shake >= OG.shakes ? 'See the results' : 'Next shake') + ' ' + ico('play') + '</button></div></div>';
  var g0 = OG, show = function () { if (OG === g0) modal(html, osNextShake); };
  var rp = os3d() && OG.goalValue != null ? osReplayPick(r, sample) : null;
  if (rp && OS3D.form(rp, OG.goalValue, function () { setTimeout(show, 300); })) return;
  setTimeout(show, 700);
}
function osNextShake() {
  if (!OG) return;
  if (OG.shake >= OG.shakes) { osEndMatch(); return; }
  OG.shake++; OG.setter = osNext(OG.setter); osNewShake();
}
function osEndMatch() {
  var st = osState(), html, tone = '', a = OG.players[0].score;
  st.stats.matches++;
  if (OG.mode === 'ai') {
    var b = OG.players[1].score, o = OG.players[1].ai, idx = OG.oppIdx, won = a > b, tie = a === b, first = false;
    if (won) {
      st.stats.wins++;
      first = !st.beaten[idx]; st.beaten[idx] = true;
      osStar(first ? 'First On-Sets win against ' + o.name + '!' : 'Won against ' + o.name, first ? 2 : 1);
      if (window.victoryFX) victoryFX(); if (Snd.fanfare) Snd.fanfare(); banner('🏆 YOU WIN!', S.name + ' wins!'); Snd.setMood('win');
    }
    osFinale(won ? [0] : tie ? [0, 1] : [1]);
    persist();
    var nextO = (idx + 1) % LEAGUE ? OPPONENTS[idx + 1] : null;
    tone = won ? ' win' : tie ? ' tie' : ' kind';
    html = '<h2 class="hero">' + (won ? 'YOU WIN!' : tie ? 'It\'s a tie!' : 'Good game!') + '</h2>' +
      '<div class="rc-board final n2">' + osRcSide(0, won) + '<div class="rc-vs" aria-hidden="true">VS</div>' + osRcSide(1, !won && !tie) + '</div>' +
      '<div class="rc-say">' + avatarHTML(o) + '<div class="bubble">' + (won ? (osTalk(o, 'sore') || o.lose) : tie ? 'A tie! Let\'s play again!' : (S.set.gloat !== false ? osTalk(o, 'gloat') || o.win : o.win) + ' Want a rematch?') + '</div></div>' +
      (won && nextO && first ? '<p class="rc-next">' + ico('star') + ' <b>' + esc(nextO.name) + ' ' + esc(nextO.title) + '</b> is ready to play On-Sets!</p>' : '') +
      osRcXP(OG.starsMatch);
  } else {
    var top = Math.max.apply(null, OG.players.map(function (p) { return p.score; }));
    var winners = osIdx().filter(function (i) { return OG.players[i].score === top; });
    if (window.victoryFX) victoryFX(); if (Snd.fanfare) Snd.fanfare();
    if (OG.mode === 'ai3' && winners.length === 1 && winners[0] === 0) { st.stats.wins++; osStar('Beat ' + OG.players[1].name + ' and ' + OG.players[2].name + ' at On-Sets!'); }
    osFinale(winners);
    persist();
    var order = osIdx().sort(function (x, y) { return OG.players[y].score - OG.players[x].score; });
    tone = winners.indexOf(0) >= 0 || !osIsAI(winners[0]) ? ' win' : ' kind';
    html = '<h2 class="hero">' + (winners.length > 1 ? 'Tie: ' + winners.map(osName).join(' & ') + '!' : osName(winners[0]) + ' wins!') + '</h2>' +
      '<div class="rc-board final" style="--n:' + osN() + '">' + order.map(function (i) { return osRcSide(i, OG.players[i].score === top); }).join('') + '</div>' +
      osRcXP(OG.starsMatch);
  }
  html += '<div class="row"><button class="btn green big" data-act="osRematch">' + ico('play') + ' Play again</button><button class="btn" data-act="osToMenu">' + ico('home') + ' On-Sets menu</button></div>';
  modal('<div class="rc rc-match' + tone + '">' + html + '</div>', null);
}
// The end of the match, felt like an Equations match: the table celebrates (3D), the crowd, a sporting "good game" from the kid, the
// beaten creature's own little tune. Every call is guarded, so a missing module is simply skipped.
function osFinale(winners) {
  if (os3d()) OS3D.matchEnd(winners);
  var kidWon = winners.length === 1 && winners[0] === 0;
  if (os3d()) {
    setTimeout(function () { if (OG && OG.phase === 'over' && os3d()) OS3D.kid(kidWon ? 'gg' : 'clap'); }, 4600);
    if (kidWon && osAIs().length && window.Snd && Snd.motif) { var lo = OG.players[osAIs()[0]].ai; setTimeout(function () { if (OG && lo) try { Snd.motif(lo.kind, 'beaten'); } catch (e) {} }, 3600); }
  }
}
function osLeave() { if (window.OS3D) OS3D.end(); OG = null; OSUI.closeAll(); if (Snd.stopBabble) Snd.stopBabble(); }
ACT.osRematch = function () { var m = OG.mode, o = OG.oppIdx, cfg = OG.cfg; closeModal(); osStartMatch(m, o, cfg); };
ACT.osToMenu = function () { closeModal(); osLeave(); Onsets.open(); };
ACT.osQuit = function () {
  modal('<h2 class="hero">Leave the game?</h2><p class="os-note">The points in this match won\'t count, but your On-Sets stars are saved.</p><div class="row"><button class="btn green big" data-act="closeModal">Keep playing</button><button class="btn quiet" data-act="osReallyQuit">Leave</button></div>');
};
ACT.osReallyQuit = function () { closeModal(); osLeave(); Onsets.open(); };

// ======================= DRAWING (scores and buttons are shared by the flat mat and the 3D screen) =======================
function osScoresHTML() {
  return OG.players.map(function (p, i) {
    var face = p.ai ? avatarHTML(p.ai, 'sm') : '<span class="jersey' + (i ? ' j' + (i + 1) : '') + '">' + (i ? (i + 1) : esc(S.jersey || '7')) + '</span>';
    var turn = i === OG.turn && OG.phase === 'move';
    return '<div class="pl' + (turn ? ' turn' + (p.ai ? ' opp-turn' : '') : '') + '">' + face + '<b>' + esc(p.name) + '</b><span class="pts">' + p.score + '</span></div>';
  }).join('');
}
function osTopHTML() {
  return '<button class="btn small ghost" data-act="osQuit" aria-label="Menu">' + ico('back') + '<span class="lbl">Menu</span></button><div class="scores">' + osScoresHTML() + '</div><div class="shake-no"><small>Shake</small><b>' + OG.shake + '/' + OG.shakes + '</b></div>';
}
function osZoneHTML(z, title, sub) {
  var cs = osCubes(z), tgt = OG.selected != null && OG.phase === 'move' && (z !== 'forbidden' || osCubes('resources').length > 1) ? ' target' : '';
  return '<div class="zone os-zone z-' + z + tgt + '" data-act="osZone" data-arg="' + z + '"><h3>' + title + ' <small>' + sub + '</small></h3><div class="cubes">' +
    (cs.map(function (c) { return OSUI.cubeHTML(c, c.id === OG.justMoved ? 'thunk' : ''); }).join('') || '<span class="empty">empty</span>') + '</div></div>';
}
function osActionsHTML() {
  if (OG.phase === 'goal' && !osIsAI(OG.setter) && !OG.busy)
    return (osMulti() ? '<div class="os-whose">' + osName(OG.setter) + ' sets the Goal</div>' : '') + '<button class="btn big green" data-act="osBuildGoal">' + ico('target') + ' Build the Goal</button><button class="btn" data-act="osNoGoal">No Goal possible</button>';
  if (OG.phase !== 'move') return '';
  var out = '';
  if (osHumanTurn()) {
    var p = OG.turn, nc = osNowCheck(p);
    out += (osMulti() ? '<div class="os-whose">' + osName(OG.turn) + ': your turn!</div>' : '') +
      '<button class="btn now" data-act="osNow" data-arg="' + p + '"' + (nc ? ' title="' + esc(nc) + '"' : '') + '>' + ico('bolt') + ' Now!</button>' +
      '<button class="btn imp" data-act="osImp" data-arg="' + p + '">' + ico('ban') + ' Impossible!</button>' +
      (osHumanTurn() ? '<button class="btn" data-act="osHint">' + ico('bulb') + ' Hint</button>' : '');
  }
  // three players: the other people at the table may challenge the move just made too
  if (osN() > 2 && OG.lastMover !== null && !OG.carrying) {
    var others = osHumans().filter(function (i) { return i !== OG.turn && i !== OG.lastMover; });
    if (others.length) out += '<div class="also">' + others.map(function (i) {
      return '<span>' + (osMulti() ? osName(i) + ' can challenge too:' : 'Spot something? You can call too:') + '</span><button class="btn small now" data-act="osNow" data-arg="' + i + '">' + ico('bolt') + ' Now!</button><button class="btn small imp" data-act="osImp" data-arg="' + i + '">' + ico('ban') + ' Impossible!</button>';
    }).join('') + '</div>';
  }
  return out;
}
function osRender() {
  if (!OG || Onsets.view !== 'game') return;
  if (os3d()) { OS3D.render(); OG.justMoved = null; return; }
  var el = $('#onsets');
  if (!$('#osTop')) el.innerHTML = '<div id="osTop" class="game-top os-top"></div><div id="osMat" class="os-matwrap"></div><div id="osAct" class="actionbar os-act"></div>';
  $('#osTop').innerHTML = osTopHTML();
  var resC = osCubes('resources');
  var gv = OG.goalValue, goalInner = OG.goal ? '<span class="expr os-gexpr">' + OSUI.goalPicHTML(OG.goal, true) + '</span><span class="gv">= ' + gv + ' card' + (gv === 1 ? '' : 's') + '</span>' : '<span class="gv os-gwait">' + (OG.phase === 'goal' ? 'waiting for the Goal…' : '…') + '</span>';
  $('#osMat').innerHTML = '<div class="mat os-mat">' +
    '<div class="os-unibox"><h3>🃏 UNIVERSE <small>' + (OG.universe.length ? OG.universe.length + ' cards' : 'dealing…') + '</small></h3>' + (OG.universe.length ? OSUI.universeHTML(OG.universe, OG.lit, { cls: 'os-mainuni' + (OG.rolling ? ' dealin' : '') }) : '<div class="os-uni"><span class="empty">The dealer is choosing how many cards…</span></div>') + '</div>' +
    (OG.goal || OG.phase === 'goal' ? '<div class="os-goalz"><div class="goalhud os-ghud"><div class="gl">' + ico('target') + '<span>GOAL</span></div>' + goalInner + '</div></div>' : '') +
    '<div class="zrow">' + osZoneHTML('required', '✅ REQUIRED', 'must use') + osZoneHTML('permitted', '👍 PERMITTED', 'may use') + osZoneHTML('forbidden', '⛔ FORBIDDEN', 'can\'t use') + '</div>' +
    '<div class="zone z-res os-res"><h3>🎲 RESOURCES <small>' + resC.length + ' left</small></h3><div class="cubes">' +
    (resC.map(function (c, i) { return OSUI.cubeHTML(c, (OG.selected === c.id ? 'sel' : '') + (OG.highlight === c.id ? ' hl' : '') + (OG.rolling ? ' dropin' : ''), 'osCube'); }).join('') || '<span class="empty">' + (OG.dealt ? 'empty' : 'the cubes are coming…') + '</span>') + '</div></div>' +
    '</div>';
  $('#osAct').innerHTML = osSpeechHTML() + '<div class="acts">' + osActionsHTML() + '</div>';
  OG.justMoved = null;
}
