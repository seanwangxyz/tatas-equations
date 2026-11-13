'use strict';
// ======================= ON-SETS: MATCH FLOW (flat 2D mat) =======================
// Two players: pass-and-play, or the kid against one of the creatures (names, faces and talk from OPPONENTS in
// js/config.js; On-Sets strength from js/onsets/ai.js). Untimed. Elementary basic rules (no Restrictions, no
// variations, no bonus moves): see ONSETS_RULES_SUMMARY.md. State lives in OG; the screen is #onsets.
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
  return o;
}
function osLevel(stars) { var L = 0; for (var i = 0; i < OS_LEVELS.length; i++) if (stars >= OS_LEVELS[i].at) L = i; return L; }
// One On-Sets skill star (reward for skill, never for speed). Celebrates a new On-Sets level.
function osStar(why, n) {
  var o = osState(), before = osLevel(o.stars);
  o.stars += (n || 1); persist();
  osToast('⭐ ' + why);
  var after = osLevel(o.stars);
  if (after > before) setTimeout(function () { osToast('🎉 New On-Sets level: ' + OS_LEVELS[after].name + '!'); if (Snd.fanfare) Snd.fanfare(); }, 900);
}
function osToast(text) {
  var box = document.getElementById('toasts'); if (!box) return;
  var t = document.createElement('div'); t.className = 'toast os-toast'; t.innerHTML = '<span>' + text + '</span>';
  box.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
}
function osOpen(i) { return i % LEAGUE === 0 || !!osState().beaten[i - 1]; }

// ---- Little helpers ----
function osCubes(z) { return OG.cubes.filter(function (c) { return c.zone === z; }).sort(function (a, b) { return a.order - b.order; }); }
function osSyms(z) { return osCubes(z).map(function (c) { return c.s; }); }
function osSnap() { return { req: osSyms('required'), perm: osSyms('permitted'), res: osSyms('resources') }; }
function osRes() { return osCubes('resources').map(function (c) { return { id: c.id, s: c.s }; }); }
function osIsAI(i) { return !!OG.players[i].ai; }
function osOther(i) { return 1 - i; }
function osName(i) { return esc(OG.players[i].name); }
function osMulti() { return !OG.players[0].ai && !OG.players[1].ai; }
var osOrder = 0;
function osSit() { return { g: OG, cubes: OG && OG.cubes, phase: OG && OG.phase, oc: osOrder, ch: OG && OG.ch }; }
function osStill(s) { return !!OG && OG === s.g && OG.cubes === s.cubes && OG.phase === s.phase && osOrder === s.oc && OG.ch === s.ch; }
function osThink(task, args, minMs) {
  var pause = new Promise(function (ok) { setTimeout(ok, minMs || 0); });
  return Promise.all([OSThink.run(task, args), pause]).then(function (x) { return x[0]; });
}
function osOops(e) { if (window.console) console.error('[On-Sets computer player]', e); }
function osTalk(o, kind) { return o && o.talk && o.talk[kind] ? pick(o.talk[kind]) : ''; }

// ---- Speech (Pip or the creature) ----
function osSay(who, text, mood) {
  if (!OG) return;
  var fresh = !OG.speech || OG.speech.text !== text;
  OG.speech = { who: who, text: text, mood: mood || 'happy' };
  if (fresh && who === 'opp') { var ai = osAI(); if (ai && Snd.talk) Snd.talk(text.replace(/<[^>]+>/g, ''), ai.kind); }
  else if (fresh && who === 'pip' && S.set.voice === true && Snd.speak) Snd.speak(text.replace(/<[^>]+>/g, ''), 'pip');
  var el = document.getElementById('osSpeech'); if (el) el.outerHTML = osSpeechHTML();
}
function osAI() { return OG && (OG.players[1].ai || OG.players[0].ai); }
function osSpeechHTML() {
  var sp = OG.speech || { who: 'pip', text: '' }, face = sp.who === 'opp' && osAI() ? avatarHTML(osAI()) : pipHTML(sp.mood, 54, '');
  return '<div class="speech" id="osSpeech"><div class="who">' + face + '</div><div class="txt">' + sp.text + '</div></div>';
}

// ======================= STARTING =======================
// mode 'ai' (oppIdx = creature) or 'pvp' (cfg.p2 = second player's name)
function osStartMatch(mode, oppIdx, cfg) {
  osState();
  OG = { mode: mode, oppIdx: oppIdx, cfg: cfg || {}, shakes: S.set.shakes || 3, shake: 1, setter: 0, players: [], trailed: false };
  OG.players.push({ name: S.name, ai: null, score: 0, list: [] });
  if (mode === 'ai') { var o = OPPONENTS[oppIdx]; OG.players.push({ name: o.name, ai: o, skill: OSAI.skill(o), score: 0, list: [] }); }
  else OG.players.push({ name: (cfg && cfg.p2) || 'Player 2', ai: null, score: 0, list: [] });
  Onsets.view = 'game'; go('onsets'); Snd.setMood('play');
  osNewShake();
  if (mode === 'ai') { var hi = osTalk(OG.players[1].ai, 'greet'); if (hi) setTimeout(function () { if (OG && OG.phase === 'setup') osSay('opp', hi); }, 300); }
}
function osNewShake() {
  OG.universe = []; OG.cubes = []; OG.goal = null; OG.goalValue = null; OG.lastMover = null; OG.selected = null; OG.ch = null;
  OG.busy = false; OG.highlight = null; OG.hintUsed = false; OG.phase = 'setup'; OG.turn = OG.setter; OG.dealt = false; OG.wait = false;
  osRender();
  var setter = OG.setter, dealer = osOther(setter); // two players: the player to the right of the Goal-setter is the other one
  // 1) the Goal-setter sets out two V and one Λ, or one V and two Λ (Elementary, rules II-A-3)
  function chooseVN(done) {
    if (osIsAI(setter)) { var vn = OSAI.chooseVN(); osSay('opp', 'I\'ll set out ' + (vn === 'VVN' ? 'two V and one Λ' : 'one V and two Λ') + '.'); setTimeout(function () { done(vn); }, 900); return; }
    osSay('pip', (osMulti() ? osName(setter) + ', you' : 'You') + ' set the Goal this shake. First, set out the three white cubes!');
    ACT.osVN = function (el) { var v = el.dataset.arg; ACT.osVN = null; closeModal(); done(v); };
    modal('<h2 class="hero">' + (osMulti() ? osName(setter) + ': ' : '') + 'Set out the white cubes</h2>' +
      '<p style="text-align:center"><b>V</b> means EVERY card. <b>Λ</b> means NO cards. In the Elementary game these three cubes are not rolled: you choose.</p>' +
      '<div class="row os-vn"><button class="btn" data-act="osVN" data-arg="VVN">' + OSUI.cubeHTML({ s: 'V' }, 'mini') + OSUI.cubeHTML({ s: 'V' }, 'mini') + OSUI.cubeHTML({ s: 'N' }, 'mini') + ' Two V, one Λ</button>' +
      '<button class="btn" data-act="osVN" data-arg="VNN">' + OSUI.cubeHTML({ s: 'V' }, 'mini') + OSUI.cubeHTML({ s: 'N' }, 'mini') + OSUI.cubeHTML({ s: 'N' }, 'mini') + ' One V, two Λ</button></div>');
  }
  // 2) the dealer chooses how many cards (6 to 12 in Elementary, rules II-B-1)
  function chooseDeal(done) {
    if (osIsAI(dealer)) { var n = OSAI.chooseDeal(OG.players[dealer].skill); osSay('opp', 'I\'ll deal ' + n + ' cards.'); setTimeout(function () { done(n); }, 900); return; }
    var st = osState();
    ACT.osDeal = function (el) { var n = +el.dataset.arg; ACT.osDeal = null; st.deal = n; persist(); closeModal(); done(n); };
    modal('<h2 class="hero">' + (osMulti() || osIsAI(setter) ? osName(dealer) + ': ' : '') + 'Deal the cards</h2>' +
      '<p style="text-align:center">You are the dealer. How many cards go in the <b>Universe</b>? (6 to 12.) Fewer cards make smaller Goals; more cards give more ways to make a set.</p>' +
      '<div class="row os-deal">' + [6, 7, 8, 9, 10, 11, 12].map(function (n) { return '<button class="btn' + (n === st.deal ? ' yellow' : '') + '" data-act="osDeal" data-arg="' + n + '">' + n + '</button>'; }).join('') + '</div>');
  }
  chooseVN(function (vn) {
    if (!OG) return;
    chooseDeal(function (n) {
      if (!OG) return;
      OG.cubes = OSE.roll(Math.random, { vn: vn }).map(function (c) { return { id: c.id, kind: c.kind, s: c.s, zone: 'resources', order: c.id }; });
      OG.universe = OSE.deal(n, Math.random);
      OG.dealt = true; OG.rolling = true;
      if (Snd.clatter) Snd.clatter();
      osSay('pip', 'Rolling the cubes and dealing ' + n + ' cards…');
      osRender(); OG.rolling = false;
      setTimeout(function () { if (OG && OG.phase === 'setup') osGoalPhase(); }, 1100);
    });
  });
}

// ======================= THE GOAL =======================
function osGoalPhase() {
  OG.phase = 'goal'; OG.turn = OG.setter;
  var P = OG.players[OG.setter];
  if (P.ai) {
    OG.busy = true; osSay('opp', pick(P.ai.think)); osRender();
    var sit = osSit();
    osThink('chooseGoal', [P.skill, osRes(), OG.universe], 1100).then(function (g) {
      if (!osStill(sit)) return;
      OG.busy = false;
      if (g) { osSay('opp', P.ai.goal || 'Here is a Goal!'); osSetGoal(g.goal, g.value); }
      else { osSay('opp', 'I don\'t think any Goal can be made!'); osNoGoal(OG.setter); }
    }).catch(osOops);
  } else {
    osSay('pip', (osMulti() ? '<b>' + osName(OG.setter) + '</b>, you' : 'You') + ' set the <b>Goal</b>: a number of cards. Use 1, 2 or 3 digit cubes. Side by side means add, stacked means multiply.');
    osRender();
  }
}
ACT.osBuildGoal = function () {
  if (!OG || OG.phase !== 'goal' || osIsAI(OG.setter) || OG.busy) return;
  OSUI.openGoalBuilder({ universe: OG.universe, digits: osCubes('resources').filter(function (c) { return c.kind === 'digit'; }), title: (osMulti() ? osName(OG.setter) + ': ' : '') + 'Set the Goal',
    onDone: function (g, v) { osSetGoal(g, v); }, onCancel: function () {} });
};
function osSetGoal(goal, value) {
  goal.digits.forEach(function (d) { var c = OG.cubes[d.id]; c.zone = 'goal'; c.neg = d.neg; c.order = ++osOrder; });
  OG.goal = goal; OG.goalValue = value;
  // the digit cubes not in the Goal go to Forbidden: they are never used in Solutions (rules III-B comment, page O6; manual OS-B1)
  var spare = osCubes('resources').filter(function (c) { return c.kind === 'digit'; });
  spare.forEach(function (c) { c.zone = 'forbidden'; c.order = ++osOrder; });
  OG.lastMover = OG.setter; OG.turn = osOther(OG.setter); OG.phase = 'move'; OG.busy = false;
  if (Snd.thunk) Snd.thunk(); if (Snd.chime) Snd.chime();
  banner('🎯 GOAL: ' + value, value + ' card' + (value === 1 ? '' : 's'));
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
  if (osIsAI(OG.turn)) { setTimeout(osAITurn, 500); return; }
  var last = osCubes('resources').length === 1, name = osMulti() ? '<b>' + osName(OG.turn) + '</b>, your' : 'Your';
  if (last) osSay('pip', name + ' turn. Only ONE cube left! Move it to <b>Required</b> or <b>Permitted</b>, or call <b>Impossible!</b> if nobody can make the Goal.', 'think');
  else if (!quiet) osSay('pip', name + ' turn! Tap a Resource cube, then tap a section. Or challenge: <b>Now!</b> or <b>Impossible!</b>');
  osRender();
}
ACT.osCube = function (el) {
  if (!OG) return;
  var id = +el.dataset.arg, c = OG.cubes[id];
  if (!c || c.zone !== 'resources') return;
  if (!osHumanTurn()) { if (OG.phase === 'goal' && !osIsAI(OG.setter)) osSay('pip', 'First, tap <b>Build the Goal</b>!'); return; }
  if (c.kind === 'digit') { osSay('pip', 'Digit cubes are only for the Goal.'); return; }
  Snd.click();
  OG.selected = OG.selected === id ? null : id;
  if (OG.selected != null) osSay('pip', 'Now tap <b>Required</b>, <b>Permitted</b> or <b>Forbidden</b> for that cube.' + (osCubes('resources').length === 1 ? ' (The last cube can\'t go to Forbidden.)' : ''));
  osRender();
};
ACT.osZone = function (el) {
  if (!OG || OG.selected == null || !osHumanTurn()) return;
  var zone = el.dataset.arg, id = OG.selected;
  if (['required', 'permitted', 'forbidden'].indexOf(zone) < 0) return;
  if (zone === 'forbidden' && osCubes('resources').length === 1) { osSay('pip', 'The very last cube can\'t go to Forbidden. Put it in <b>Required</b> or <b>Permitted</b>!', 'think'); Snd.boop(); return; }
  OG.selected = null;
  osPlace(id, zone, OG.turn);
};
function osPlace(id, zone, who) {
  var c = OG.cubes[id];
  c.zone = zone; c.order = ++osOrder; OG.justMoved = id; OG.highlight = null; OG.lastMover = who;
  if (Snd.thunk) Snd.thunk();
  if (osCubes('resources').length === 0) { osRender(); setTimeout(osLastCubePlayed, 600); return; }
  OG.turn = osOther(who);
  if (!osIsAI(who) && osIsAI(OG.turn)) osSay('pip', pick(['Nice move!', 'Good thinking!', 'Placed!', 'Ooh, interesting!']));
  osRender();
  osNextTurn(false);
}
function osAITurn() {
  if (!OG || OG.phase !== 'move' || !osIsAI(OG.turn)) return;
  var me = OG.turn, P = OG.players[me], o = P.ai;
  OG.busy = true; osSay('opp', (S.set.trash !== false && o.talk && Math.random() < 0.25) ? osTalk(o, 'trash') : pick(o.think)); osRender();
  var sit = osSit(), canCh = OG.lastMover !== null && OG.lastMover !== me, nowOk = !osNowCheck(me);
  if (osCubes('resources').length === 1) nowOk = false;
  osThink('turn', [P.skill, osSnap(), osRes(), OG.goalValue, OG.universe, canCh, nowOk], 900 + Math.random() * 600).then(function (t) {
    if (!osStill(sit) || OG.turn !== me) return;
    OG.busy = false;
    if (t.challenge) { if (t.challenge.kind === 'now') OG.aiPlan = t.challenge.plan; osChallenge(t.challenge.kind, me); return; }
    var mv = t.move, c = OG.cubes[mv.id];
    osSay('opp', 'I\'ll put the ' + osCubeWord(c.s) + ' in ' + { required: 'Required', permitted: 'Permitted', forbidden: 'Forbidden' }[mv.zone] + '.');
    osPlace(mv.id, mv.zone, me);
  }).catch(osOops);
}
function osCubeWord(s) { return OSE.isColor(s) ? '<b class="os-w-' + s + '">' + s + '</b> cube' : '<b>' + esc(OSE.show(s)) + '</b>'; }

// ======================= CHALLENGES =======================
ACT.osNow = function () {
  if (!osHumanTurn()) return;
  var p = OG.turn, why = osNowCheck(p);
  if (why) { osSay('pip', why, 'think'); Snd.boop(); return; }
  osChallenge('now', p);
};
ACT.osImp = function () {
  if (!osHumanTurn()) return;
  var p = OG.turn;
  if (OG.lastMover === null || OG.lastMover === p) { osSay('pip', 'There is no move to challenge yet.'); return; }
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
  var mover = OG.lastMover;
  OG.phase = 'challenge'; OG.ch = { kind: kind, challenger: who, mover: mover }; OG.selected = null; OG.busy = false;
  banner(kind === 'now' ? '⚡ NOW!' : '🚫 IMPOSSIBLE!', OG.players[who].name + ' challenges!');
  if (Snd.slam) Snd.slam(); Snd.setMood('challenge');
  if (osIsAI(who)) osSay('opp', kind === 'now' ? OG.players[who].ai.now : OG.players[who].ai.imp);
  else if (osIsAI(mover)) { var kc = osTalk(OG.players[mover].ai, 'kidChallenge'); osSay('opp', kc || 'Oh! Let\'s see…'); }
  else osSay('pip', kind === 'now' ? osName(who) + ' says Now! and must write a Solution using the mat plus at most ONE Resource cube.' : 'Impossible! Now ' + osName(mover) + ' must try to write a Solution.', 'cheer');
  osRender();
  var writer = kind === 'now' ? who : mover;
  setTimeout(function () {
    if (!OG) return;
    osWrite(writer, kind, function (res) { osResolve(res); });
  }, 1400);
}
// Write a Solution: res = {ok, tokens, chk}
function osWrite(pi, mode, cb) {
  if (osIsAI(pi)) { osAIWrite(pi, mode, cb); return; }
  var open = function () { osOpenSolution(pi, mode, cb); };
  if (osMulti()) {
    modal('<h2 class="hero">Pass to ' + osName(pi) + '</h2><p style="text-align:center">' + osName(pi) + ', it\'s your turn to write a Solution.' + (mode === 'last' ? ' No peeking, everybody else!' : '') + '</p><div class="row"><button class="btn green big" data-act="closeModal">I\'m ready!</button></div>', open);
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
  var pools = [{ label: '✅ Required (use them ALL)', ids: ids('required'), req: true }, { label: '👍 Permitted (use any)', ids: ids('permitted') }];
  if (mode === 'now') pools.push({ label: '🎲 Resources (you may add ONE)', ids: ids('resources'), max: 1 });
  if (mode === 'impossible') pools.push({ label: '🎲 Resources (count as Permitted now)', ids: ids('resources') });
  pools.push({ label: '⛔ Forbidden (can\'t use)', ids: ids('forbidden').filter(function (id) { return OG.cubes[id].kind !== 'digit'; }), forb: true });
  var titles = { now: 'Now! Write your Solution', impossible: 'Prove it! Write a Solution', last: 'Last cube: write a Solution' };
  var ctx = osCtx(mode), t0 = Date.now();
  OSUI.openSetBuilder({ title: (osMulti() ? osName(pi) + ': ' : '') + titles[mode], universe: OG.universe, goal: OG.goalValue, goalPic: OSUI.goalPicHTML(OG.goal, true), pools: pools, cubes: OG.cubes, mode: mode,
    check: function (tokens) { return OSE.checkSolution(tokens, ctx); },
    onDone: function (tokens) {
      var chk = tokens ? OSE.checkSolution(tokens, ctx) : null, ok = !!(chk && chk.ok);
      if (pi === 0 && OG.mode === 'ai') { var st = osState(); st.stats.attempts++; if (ok) st.stats.correct++; persist(); }
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
  osSay('opp', esc(P.name) + ' is writing a Solution…'); osRender();
  if (mode === 'now' && OG.aiPlan) { plan = OG.aiPlan; OG.aiPlan = null; }
  var job = plan ? new Promise(function (ok) { setTimeout(function () { ok(plan); }, 1500); }) : osThink('write', [P.skill, osSnap(), OG.goalValue, OG.universe, mode], 1500);
  job.then(function (r) {
    if (!osStill(sit)) return;
    if (r && r.found) { var toks = osSymsToTokens(r.tokens, mode), chk = OSE.checkSolution(toks, osCtx(mode)); osSay('opp', chk.ok ? 'Done!' : 'Hmm…'); cb({ ok: chk.ok, tokens: toks, chk: chk }); }
    else { osSay('opp', 'I… couldn\'t find one!'); cb({ ok: false, tokens: null, chk: { reasons: ['No Solution was written.'] } }); }
  }).catch(osOops);
}
function osResolve(res) {
  var ch = OG.ch, pts = OSE.scoreChallenge(ch.kind, ch.challenger, ch.mover, null, res.ok, null), lines = [];
  var cn = osName(ch.challenger), mn = osName(ch.mover);
  if (ch.kind === 'now') lines.push(res.ok ? cn + ' called <b>Now!</b> and wrote a correct Solution.' : cn + ' called <b>Now!</b> but the Solution wasn\'t correct.');
  else lines.push(res.ok ? cn + ' called <b>Impossible!</b>, but ' + mn + ' found a Solution!' : cn + ' called <b>Impossible!</b> and ' + mn + ' couldn\'t write a correct Solution.');
  if (OG.mode === 'ai' && ch.challenger === 0 && pts[0] === 6) {
    var st = osState(); if (ch.kind === 'now') st.stats.nowWins++; else st.stats.impWins++;
    osStar(ch.kind === 'now' ? 'Correct Now! challenge' : 'Correct Impossible! call');
  } else if (OG.mode === 'ai' && ch.mover === 0 && ch.kind === 'impossible' && res.ok) osStar('Proved it wasn\'t impossible!');
  var sols = {}; sols[ch.kind === 'now' ? ch.challenger : ch.mover] = res;
  osEndShake({ pts: pts, lines: lines, sols: sols });
}
function osLastCubePlayed() {
  var mover = OG.lastMover, other = osOther(mover);
  OG.phase = 'lastcheck';
  if (osIsAI(other)) {
    var P = OG.players[other], sit = osSit();
    osSay('opp', osTalk(P.ai, 'lastCube') || pick(P.ai.think)); osRender();
    osThink('callsLastImpossible', [P.skill, osSnap(), OG.goalValue, OG.universe], 1200).then(function (imp) {
      if (!osStill(sit)) return;
      if (imp) osChallenge('impossible', other); else osLastWrite();
    }).catch(osOops);
    return;
  }
  osSay('pip', 'The last cube is on the mat!', 'think'); osRender();
  ACT.osLastImp = function () { closeModal(); osChallenge('impossible', other); };
  ACT.osLastWrite = function () { closeModal(); osLastWrite(); };
  modal('<h2 class="hero">Last cube played!</h2><p style="text-align:center">' + (osMulti() ? osName(other) + ': if' : 'If') + ' you think NOBODY can make the Goal now, call Impossible! Otherwise everybody writes a Solution (4 points if correct, 2 if not).</p>' +
    '<div class="row"><button class="btn imp" data-act="osLastImp">' + ico('ban') + ' Impossible!</button><button class="btn green" data-act="osLastWrite">' + ico('pencil') + ' Let\'s write!</button></div>');
}
function osLastWrite() {
  OG.phase = 'lastwrite';
  osSay('pip', 'Everybody writes a Solution! Correct = 4 points, not correct = 2.', 'cheer'); osRender();
  var results = {};
  (function step(k) {
    if (!OG) return;
    if (k >= 2) {
      var oks = {}, lines = ['After the last cube, everyone wrote a Solution.'];
      [0, 1].forEach(function (i) { oks[i] = results[i].ok; lines.push(osName(i) + (results[i].ok ? ' was correct: 4 points!' : ' scores 2.')); });
      if (OG.mode === 'ai' && results[0].ok) osStar('Correct Solution after the last cube');
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
function osNoGoal(setter) {
  var other = osOther(setter);
  if (osIsAI(other)) {
    var P = OG.players[other], sit = osSit(); OG.busy = true;
    osSay('opp', pick(P.ai.think)); osRender();
    osThink('findAnyGoal', [osRes(), OG.universe], 1200).then(function (g) {
      if (!osStill(sit)) return;
      OG.busy = false;
      if (g) {
        var pool = osCubes('resources').filter(function (c) { return c.kind !== 'digit'; }).map(function (c) { return c.s; });
        var r = OSE.solve({ universe: OG.universe, goal: g.value, req: [], perm: [], res: pool, mode: 'impossible', timeMs: 1500 });
        OG.goal = g.goal; OG.goalValue = g.value;
        g.goal.digits.forEach(function (d) { OG.cubes[d.id].zone = 'goal'; OG.cubes[d.id].neg = d.neg; });
        var sols = {}; sols[other] = { ok: true, tokens: r.found ? osSymsToTokens(r.tokens, 'impossible') : null };
        var pts = {}; pts[other] = 6; pts[setter] = 2;
        osEndShake({ pts: pts, lines: [osName(other) + ' challenged the "No Goal" call and found a Goal AND a Solution!'], sols: sols });
      } else { osSay('opp', 'I agree: no Goal!'); osNoGoalAgreed(); }
    }).catch(osOops);
    return;
  }
  ACT.osNGAgree = function () { closeModal(); osNoGoalAgreed(); };
  ACT.osNGChallenge = function () {
    closeModal();
    osSay('pip', osName(other) + ': build a Goal, then a Solution for it, using any Resource cubes!');
    OSUI.openGoalBuilder({ universe: OG.universe, digits: osCubes('resources').filter(function (c) { return c.kind === 'digit'; }), title: osName(other) + ': build a Goal',
      onDone: function (g, v) {
        OG.goal = g; OG.goalValue = v; g.digits.forEach(function (d) { OG.cubes[d.id].zone = 'goal'; OG.cubes[d.id].neg = d.neg; }); osRender();
        var ctx = osCtx('impossible'), ids = osCubes('resources').filter(function (c) { return c.kind !== 'digit'; }).map(function (c) { return c.id; });
        OSUI.openSetBuilder({ title: osName(other) + ': now a Solution', universe: OG.universe, goal: v, pools: [{ label: '🎲 Resources (use any)', ids: ids }], cubes: OG.cubes, mode: 'impossible',
          check: function (t) { return OSE.checkSolution(t, ctx); },
          onDone: function (t) { var chk = t ? OSE.checkSolution(t, ctx) : null, ok = !!(chk && chk.ok), pts = {}; pts[other] = ok ? 6 : 2; pts[setter] = ok ? 2 : 6; var sols = {}; sols[other] = { ok: ok, tokens: t, chk: chk };
            osEndShake({ pts: pts, lines: [osName(other) + (ok ? ' proved a Goal was possible!' : '\'s Solution wasn\'t correct, so the "No Goal" call stands.')], sols: sols }); } });
      } });
  };
  modal('<h2>🤷 No Goal?</h2><p style="text-align:center"><b>' + osName(setter) + '</b> says no Goal can be made with these cubes and cards. ' + osName(other) + ', do you agree?</p>' +
    '<div class="row"><button class="btn green" data-act="osNGAgree">I agree: roll again</button><button class="btn now" data-act="osNGChallenge">Challenge! I can make one</button></div>');
}
function osNoGoalAgreed() {
  modal('<h2>🤝 Agreed!</h2><p style="text-align:center">Nobody could find a Goal, so this shake doesn\'t count. Same player rolls again!</p><div class="row"><button class="btn green" data-act="closeModal">Roll again</button></div>', function () { if (OG) osNewShake(); });
}

// ======================= END OF SHAKE / MATCH =======================
function osSolHTML(i, s) {
  if (!s) return '';
  var head = '<b>' + osName(i) + '\'s Solution:</b> ' + (s.ok ? '<span style="color:var(--good)">' + ico('check') + ' correct</span>' : '<span style="color:var(--mute)">not quite</span>');
  if (!s.tokens) return '<p>' + head + ' (no Solution written)</p>';
  var ev = OSE.evaluate(s.tokens, OG.universe), body = '<div class="expr os-expr">' + OSUI.exprHTML(s.tokens, OG.cubes) + '</div>';
  if (ev.ok && !ev.ambiguous) body += OSUI.universeHTML(OG.universe, ev.set, { small: true, cls: 'os-resuni' }) + '<p class="os-cnt">' + ev.count + ' card' + (ev.count === 1 ? '' : 's') + '</p>';
  if (!s.ok && s.chk && s.chk.reasons && s.chk.reasons.length) body += '<ul class="reasons">' + s.chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
  return '<div style="margin:8px 0">' + head + body + '</div>';
}
function osEndShake(r) {
  OG.phase = 'over'; OG.busy = false; Snd.setMood('play');
  [0, 1].forEach(function (i) { var v = r.pts[i] || 0; OG.players[i].score += v; OG.players[i].list.push(v); });
  if (OG.players[0].score < OG.players[1].score) OG.trailed = true;
  var st = osState(); st.stats.shakes++; persist();
  osRender();
  var anyOk = Object.keys(r.sols || {}).some(function (k) { return r.sols[k] && r.sols[k].ok; }), sample = null;
  if (OG.goalValue != null && !anyOk) {
    var sn = osSnap(), sv = OSE.solve({ universe: OG.universe, goal: OG.goalValue, req: sn.req, perm: sn.perm, res: sn.res, mode: 'impossible', timeMs: 1500 });
    sample = sv.found ? sv.tokens : null; OG.sampleComplete = sv.complete;
  }
  var p0 = r.pts[0] || 0, good = p0 >= 4, ai = OG.players[1].ai, aiTalk = '';
  if (ai) { var ap = r.pts[1] || 0; aiTalk = ap > p0 ? (S.set.gloat !== false && Math.random() < 0.5 ? osTalk(ai, 'gloat') : osTalk(ai, 'kidWrong')) : ap < p0 ? osTalk(ai, Math.random() < 0.5 ? 'kidGoodMove' : 'sore') : ''; }
  if (OG.mode === 'ai') { if (good) { Snd.chime(); FX.confetti(70); osSay('pip', 'Great shake!', 'cheer'); } else { Snd.boop(); osSay('pip', 'Good try! Every shake teaches your brain something new.'); } } else Snd.chime();
  if (aiTalk) setTimeout(function () { if (OG && OG.phase === 'over') osSay('opp', aiTalk); }, 400);
  var html = '<h2 class="hero">' + (OG.mode === 'ai' ? (good ? 'Great shake!' : 'Nice try!') : 'Shake over!') + '</h2>' +
    '<div style="text-align:center;font-size:18px">Goal: <b>' + (OG.goalValue != null ? OG.goalValue + ' card' + (OG.goalValue === 1 ? '' : 's') : '?') + '</b></div>' +
    r.lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') +
    [0, 1].map(function (i) { return osSolHTML(i, r.sols && r.sols[i]); }).join('') +
    (sample ? '<p><b>One way that works:</b></p><div class="expr os-expr">' + OSUI.exprHTML(sample) + '</div>' + (function () { var e = OSE.evaluate(sample, OG.universe); return OSUI.universeHTML(OG.universe, e.set, { small: true, cls: 'os-resuni' }) + '<p class="os-cnt">' + e.count + ' cards</p>'; })()
      : (OG.goalValue != null && !anyOk ? '<div class="okbox">I searched and there is no Solution with these cubes.' + (OG.sampleComplete === false ? ' <small>(I ran out of searching time, so that does not prove there is none.)</small>' : '') + '</div>' : '')) +
    [0, 1].map(function (i) { return '<div class="score-line' + ((r.pts[i] || 0) >= 4 ? ' win' : '') + '"><span>' + osName(i) + '</span><span class="p">+' + (r.pts[i] || 0) + ' → ' + OG.players[i].score + '</span></div>'; }).join('') +
    '<div class="row" style="margin-top:12px"><button class="btn green big" data-act="closeModal">' + (OG.shake >= OG.shakes ? 'See the results' : 'Next shake') + ' ' + ico('play') + '</button></div>';
  setTimeout(function () { if (OG) modal(html, osNextShake); }, 700);
}
function osNextShake() {
  if (!OG) return;
  if (OG.shake >= OG.shakes) { osEndMatch(); return; }
  OG.shake++; OG.setter = osOther(OG.setter); osNewShake();
}
function osEndMatch() {
  var a = OG.players[0].score, b = OG.players[1].score, st = osState(), html;
  st.stats.matches++;
  if (OG.mode === 'ai') {
    var o = OG.players[1].ai, idx = OG.oppIdx, won = a > b, tie = a === b;
    if (won) {
      st.stats.wins++;
      var first = !st.beaten[idx]; st.beaten[idx] = true;
      osStar(first ? 'First On-Sets win against ' + o.name + '!' : 'Won against ' + o.name, first ? 2 : 1);
      if (window.victoryFX) victoryFX(); if (Snd.fanfare) Snd.fanfare(); banner('🏆 YOU WIN!', S.name + ' wins!'); Snd.setMood('win');
    }
    persist();
    var nextO = (idx + 1) % LEAGUE ? OPPONENTS[idx + 1] : null;
    html = '<h2 class="hero">' + (won ? 'YOU WIN!' : tie ? 'It\'s a tie!' : 'Good game!') + '</h2>' +
      '<div class="row">' + avatarHTML(o, 'lg') + '<div class="bubble">' + (won ? (osTalk(o, 'sore') || o.lose) : tie ? 'A tie! Let\'s play again!' : (S.set.gloat !== false ? osTalk(o, 'gloat') || o.win : o.win) + ' Want a rematch?') + '</div></div>' +
      '<div class="score-line"><span>' + osName(0) + '</span><span class="p">' + a + '</span></div><div class="score-line"><span>' + esc(o.name) + '</span><span class="p">' + b + '</span></div>' +
      (won && nextO && first ? '<p style="text-align:center">' + ico('star') + ' <b>' + esc(nextO.name) + ' ' + esc(nextO.title) + '</b> is ready to play On-Sets!</p>' : '');
  } else {
    var w = a > b ? 0 : b > a ? 1 : -1;
    if (window.victoryFX) victoryFX(); if (Snd.fanfare) Snd.fanfare();
    persist();
    html = '<h2 class="hero">' + (w < 0 ? 'It\'s a tie!' : osName(w) + ' wins!') + '</h2>' +
      [0, 1].map(function (i) { return '<div class="score-line' + (OG.players[i].score === Math.max(a, b) ? ' win' : '') + '"><span>' + osName(i) + '</span><span class="p">' + OG.players[i].score + '</span></div>'; }).join('');
  }
  html += '<div class="row" style="margin-top:12px"><button class="btn green" data-act="osRematch">Play again</button><button class="btn" data-act="osToMenu">' + ico('home') + ' On-Sets menu</button></div>';
  modal(html, null);
}
ACT.osRematch = function () { var m = OG.mode, o = OG.oppIdx, cfg = OG.cfg; closeModal(); osStartMatch(m, o, cfg); };
ACT.osToMenu = function () { closeModal(); OG = null; OSUI.closeAll(); Onsets.open(); };
ACT.osQuit = function () {
  modal('<h2>Leave the game?</h2><p style="text-align:center">The points in this match won\'t count, but your On-Sets stars are saved.</p><div class="row"><button class="btn" data-act="closeModal">Keep playing</button><button class="btn pink" data-act="osReallyQuit">Leave</button></div>');
};
ACT.osReallyQuit = function () { closeModal(); OG = null; OSUI.closeAll(); if (Snd.stopBabble) Snd.stopBabble(); Onsets.open(); };

// ======================= DRAWING THE MAT =======================
function osZoneHTML(z, title, sub) {
  var cs = osCubes(z), tgt = OG.selected != null && OG.phase === 'move' && (z !== 'forbidden' || osCubes('resources').length > 1) ? ' target' : '';
  return '<div class="zone os-zone z-' + z + tgt + '" data-act="osZone" data-arg="' + z + '"><h3>' + title + ' <small>' + sub + '</small></h3><div class="cubes">' +
    (cs.map(function (c) { return OSUI.cubeHTML(c, c.id === OG.justMoved ? 'thunk' : ''); }).join('') || '<span class="empty">empty</span>') + '</div></div>';
}
function osActionsHTML() {
  if (OG.phase === 'goal' && !osIsAI(OG.setter) && !OG.busy)
    return '<button class="btn big green" data-act="osBuildGoal">' + ico('target') + ' Build the Goal</button><button class="btn" data-act="osNoGoal">No Goal possible</button>';
  if (OG.phase !== 'move' || !osHumanTurn()) return '';
  var nc = osNowCheck(OG.turn);
  return (osMulti() ? '<div class="os-whose">' + osName(OG.turn) + ': your turn!</div>' : '') +
    '<button class="btn now" data-act="osNow"' + (nc ? ' title="' + esc(nc) + '"' : '') + '>' + ico('bolt') + ' Now!</button>' +
    '<button class="btn imp" data-act="osImp">' + ico('ban') + ' Impossible!</button>' +
    '<button class="btn" data-act="osHint">' + ico('bulb') + ' Hint</button>';
}
function osRender() {
  if (!OG || Onsets.view !== 'game') return;
  var el = $('#onsets');
  if (!$('#osTop')) el.innerHTML = '<div id="osTop" class="game-top os-top"></div><div id="osMat" class="os-matwrap"></div><div id="osAct" class="actionbar os-act"></div>';
  var scores = OG.players.map(function (p, i) {
    var face = p.ai ? avatarHTML(p.ai, 'sm') : '<span class="jersey' + (i ? ' j2' : '') + '">' + (i ? '2' : esc(S.jersey || '7')) + '</span>';
    var turn = i === OG.turn && OG.phase === 'move';
    return '<div class="pl' + (turn ? ' turn' + (p.ai ? ' opp-turn' : '') : '') + '">' + face + '<b>' + esc(p.name) + '</b><span class="pts">' + p.score + '</span></div>';
  }).join('');
  $('#osTop').innerHTML = '<button class="btn small ghost" data-act="osQuit" aria-label="Menu">' + ico('back') + '<span class="lbl">Menu</span></button><div class="scores">' + scores + '</div><div class="shake-no"><small>Shake</small><b>' + OG.shake + '/' + OG.shakes + '</b></div>';
  var resC = osCubes('resources');
  var goalInner = OG.goal ? OSUI.goalPicHTML(OG.goal, true) + '<span class="gval">= ' + OG.goalValue + ' card' + (OG.goalValue === 1 ? '' : 's') + '</span>' : '<span class="empty">' + (OG.phase === 'goal' ? 'waiting for the Goal…' : '') + '</span>';
  $('#osMat').innerHTML = '<div class="mat os-mat">' +
    '<div class="os-unibox"><h3>🃏 UNIVERSE <small>' + (OG.universe.length ? OG.universe.length + ' cards' : 'dealing…') + '</small></h3>' + (OG.universe.length ? OSUI.universeHTML(OG.universe, null, { cls: 'os-mainuni' + (OG.rolling ? ' dealin' : '') }) : '<div class="os-uni"><span class="empty">The dealer is choosing how many cards…</span></div>') + '</div>' +
    '<div class="zone z-goal os-goalz"><h3>🎯 GOAL</h3><div class="cubes">' + goalInner + '</div></div>' +
    '<div class="zrow">' + osZoneHTML('required', '✅ REQUIRED', 'must use') + osZoneHTML('permitted', '👍 PERMITTED', 'may use') + osZoneHTML('forbidden', '⛔ FORBIDDEN', 'can\'t use') + '</div>' +
    '<div class="zone z-res os-res"><h3>🎲 RESOURCES <small>' + resC.length + ' left</small></h3><div class="cubes">' +
    (resC.map(function (c, i) { return OSUI.cubeHTML(c, (OG.selected === c.id ? 'sel' : '') + (OG.highlight === c.id ? ' hl' : '') + (OG.rolling ? ' dropin' : ''), 'osCube'); }).join('') || '<span class="empty">' + (OG.dealt ? 'empty' : 'the cubes are coming…') + '</span>') + '</div></div>' +
    '</div>';
  $('#osAct').innerHTML = osSpeechHTML() + '<div class="acts">' + osActionsHTML() + '</div>';
  OG.justMoved = null;
}
