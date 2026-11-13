'use strict';
// ======================= GAME =======================
var G = null, orderCounter = 0;
function nP() { return G.players.length; }
function nextP(i) { return (i + 1) % nP(); }
function other(i) { return nextP(i); }
function idxs() { return G.players.map(function (p, i) { return i; }); }
function humans() { return idxs().filter(function (i) { return !isAI(i); }); }
function multiHuman() { return !!G && humans().length > 1; }
function firstAI() { for (var i = 0; i < G.players.length; i++) if (G.players[i].ai) return G.players[i].ai; return null; }
// With two creatures at the table (mode 'ai3') one of them is 'up': it is the one shown in 3D and the one speaking.
function curAI() { return (G && G.act != null && G.players[G.act] && G.players[G.act].ai) || firstAI(); }
// Which creature at the table plays for player i (two creatures: the first AI player is creature 0, the second is creature 1).
function aiSeat(i) { var n = -1; for (var j = 0; j <= i && j < G.players.length; j++) if (G.players[j].ai) n++; return n < 0 ? 0 : n; }
// Run fn with player i's creature addressed by the T3.creature* calls (then the previous one again).
function creatureAt(i, fn) { if (T3.creatureWith) T3.creatureWith(aiSeat(i), fn); else fn(); }
function focusAI(i) {
  if (!G || !G.players[i] || !G.players[i].ai) return;
  if (T3.creatureUse) T3.creatureUse(aiSeat(i));           // both creatures stay at the table: just address this one
  if (G.act === i) return;
  var had = G.act != null; G.act = i;
  if (had && current === 'game') renderGame();             // the speech bubble's face follows the creature that is up
}
// Every creature at the table walks in (the second one a moment later, from its own side).
function creaturesEnter() {
  if (!T3.creatureEnter) return;
  if (!(T3.creatureCount && T3.creatureCount() > 1)) { T3.creatureEnter(); return; }
  T3.creatureWith(0, function () { T3.creatureEnter(); });
  setTimeout(function () { if (G && T3.creatureWith) T3.creatureWith(1, function () { T3.creatureEnter(); }); }, 450);
}
function zoneCubes(z) { return G.cubes.filter(function (c) { return c.zone === z; }).sort(function (a, b) { return a.order - b.order; }); }
function syms(z) { return zoneCubes(z).map(function (c) { return c.s; }); }
function snapshot() { return { req: syms('required'), perm: syms('permitted'), res: syms('resources') }; }
function isAI(i) { return !!G.players[i].ai; }
function profileIdx() { return 0; } // player 0 is the owner of this device's progress

// How a creature takes losing, by personality.
function loseMood(o) {
  var r = Math.random(), k = o && o.kind;
  if (k === 'fox' || k === 'wizard') return r < 0.6 ? 'tantrum' : r < 0.8 ? 'cry' : 'sad';
  if (k === 'owl') return r < 0.6 ? 'sad' : r < 0.8 ? 'cry' : 'tantrum';
  return r < 0.6 ? 'cry' : r < 0.9 ? 'sad' : 'tantrum';
}
function talkLine(o, kind) { return o && o.talk && o.talk[kind] ? pick(o.talk[kind]) : ''; }
function playerMood(m, opts) { if (T3.playerMood) T3.playerMood(m, opts); }
function playerShow() { if (T3.playerShow) T3.playerShow(S.set.avatar !== false); }
function playerCelebrate() { if (T3.playerCelebrate) T3.playerCelebrate(typeof Kit !== 'undefined' ? Kit.celebration() : undefined); else playerMood('cheer'); }
function mateShow(o) { if (T3.mate) T3.mate(o || null); }
function mateMood(m) { if (T3.mateMood) T3.mateMood(m); }
// Who the people at the table look like. This device's player is a kid unless Settings says grown-up.
function seatPeople(mode, cfg) {
  var grown = S.set.me === 'tata';
  if (T3.playerSet) T3.playerSet({ who: grown ? 'tata' : 'kid', name: grown ? S.name : backName(), number: S.jersey || '7' });
  var other = grown ? 'kid' : 'tata', p1 = G.players[1];
  if (mode === 'pvp') mateShow({ who: other, seat: 'far', name: p1.name, number: grown ? '7' : '17' });
  else if (mode === 'online') mateShow({ who: other, seat: 'far', name: p1.name, number: p1.jersey || (grown ? '7' : '17') });
  else if (mode === 'team' && G.team) mateShow({ who: other, seat: 'left', name: G.team.names[1], number: G.team.jerseys[1] });
  else if (mode === 'p3') mateShow({ who: other, seat: 'left', name: p1.name, number: grown ? '7' : '17' });
  else if (mode === 'tourney' && humans().length > 1) mateShow({ who: other, seat: nP() > 2 ? 'left' : 'far', name: G.players[humans()[1]].name, number: grown ? '7' : '17' }); // TOURNEY
  else mateShow(null);
}
function creatureMood(m) { if (T3.creatureMood) T3.creatureMood(m); if (m === 'dance' && Snd.danceMusic) Snd.danceMusic(3200); }
function setCreature(k, pack) { if (T3.setCreature) T3.setCreature(k, pack || 'classic'); }
// The computer's creature reaches over and moves the cube (3D), or it just moves (flat mat).
function aiPlace(id, zone, who) {
  if (T3.active() && T3.creatureMove) { G.busy = true; G.carrying = true; renderGame(); if (T3.creatureUse) T3.creatureUse(aiSeat(who)); T3.creatureMove(id, zone, function () { if (!G) return; G.busy = false; G.carrying = false; placeCube(id, zone, who); }); }
  else placeCube(id, zone, who);
}
// Which person at the table reaches over for a human's move (3D): this device's player, or the second human (mate).
// (Online keeps the plain move: remote moves are applied in one step by js/online.js.)
function avatarMoveFn(who) {
  if (!T3.active() || !T3.playerMove || G.mode === 'tutorial') return null;
  if (G.mode === 'online') return window.Online && Online.moveFn ? Online.moveFn(who) : null; // host: its player / the mate carry the cube
  if (G.team && who === 0) return G.team.cur === 0 ? T3.playerMove : T3.mateMove;   // Team-up: whoever's go it is
  if (who === 0) return T3.playerMove;
  if (who === 1 && !isAI(1) && (G.mode === 'pvp' || G.mode === 'p3' || G.mode === 'tourney')) return T3.mateMove; // (TOURNEY: + tourney)
  return null;
}
// A human's move: the kid (or the mate) picks the cube up and lobs it into the zone, like aiPlace for creatures.
function humanPlace(id, zone, who) {
  var fn = avatarMoveFn(who);
  if (!fn) { placeCube(id, zone, who); return; }
  var sit = G.cubes; G.busy = true; G.carrying = true; renderGame();
  fn(id, zone, function () { if (!G || G.cubes !== sit) return; G.busy = false; G.carrying = false; placeCube(id, zone, who); });
}
function humanGoal(tokens, val) {
  var fn = avatarMoveFn(G.setter); if (!fn) { setGoal(tokens, val); return; }
  var sit = G.cubes, k = 0; G.busy = true; G.carrying = true; renderGame();
  if (T3.goalPlan) T3.goalPlan(tokens);   // VARI3D: a turned Goal cube turns in the kid's hand and lands turned
  (function next() {
    if (!G || G.cubes !== sit) return;
    while (k < tokens.length && typeof tokens[k] !== 'object') k++;                 // parentheses: nothing to carry
    if (k >= tokens.length || G.skipCarry) { G.skipCarry = false; G.carrying = false; G.busy = false; setGoal(tokens, val); return; }
    var tk = tokens[k];
    fn(tk.id, 'goal', function () { if (!G || G.cubes !== sit) return; G.cubes[tk.id].zone = 'goal'; G.goalTokens = tokens.slice(0, k + 1); k++; renderGame(); setTimeout(next, 60); }, { quick: true });
  })();
}
function startMatch(mode, oppIdx, cfg) {
  if (mode === 'ai' && window.Career && !(cfg && cfg.sigSeen) && Career.announce(oppIdx, function () { startMatch(mode, oppIdx, Object.assign({}, cfg || {}, { sigSeen: true })); })) return; // CAREER: a signature rule is announced first
  var shakes = S.set.shakes || 3;
  G = { mode: mode, oppIdx: oppIdx, cfg: cfg, shakes: shakes, shake: 1, setter: 0, players: [], trailed: false };
  var wx = T3.matchWeather ? T3.matchWeather() : null;   // this match's time of day and weather (stadium venues)
  G.players.push({ name: S.name, ai: null, score: 0, list: [] });
  if (mode === 'ai') G.players.push({ name: OPPONENTS[oppIdx].name, ai: OPPONENTS[oppIdx], score: 0, list: [] });
  else if (mode === 'ai3') [cfg.a, cfg.b].forEach(function (k) { G.players.push({ name: OPPONENTS[k].name, ai: OPPONENTS[k], score: 0, list: [] }); });
  else if (mode === 'p3') {
    G.players.push({ name: cfg.n2 || 'Tata', ai: null, score: 0, list: [] });
    if (cfg.creature >= 0) G.players.push({ name: OPPONENTS[cfg.creature].name, ai: OPPONENTS[cfg.creature], score: 0, list: [] });
    else G.players.push({ name: cfg.n3 || 'Mama', ai: null, score: 0, list: [] });
  }
  else if (mode === 'team') Team.setup(G, oppIdx, cfg); // the kid + a grown-up as one side vs a creature (js/team.js)
  else if (mode === 'online') Online.setup(G, cfg); // the other player is on another device (js/online.js)
  else if (mode === 'tourney' && window.Tourney) Tourney.setup(G, cfg); // TOURNEY: tournament practice (js/tourney.js): players, division, options
  else G.players.push({ name: 'Player 2', ai: null, score: 0, list: [] });
  if (window.Recorder) Recorder.start(G); // REVIEW: notes for "One thing Pip spotted" (js/review.js)
  if (window.Parent) Parent.note('matchStart'); // PARENT page
  if (window.Career) Career.matchStart(G); // CAREER: remember this match's signature rule
  if (window.Rivals) Rivals.note('start', { g: G }); // RIVALS: creatures that remember
  for (var fa = 0; fa < G.players.length; fa++) if (G.players[fa].ai) { G.act = fa; break; }
  go('game'); Snd.setMood('play');
  var ai = firstAI();
  var ais = G.players.filter(function (p) { return p.ai; });
  if (ais.length > 1 && T3.setCreatures) T3.setCreatures(ais.map(function (p) { return { kind: p.ai.kind, pack: p.ai.pack || 'classic' }; }));
  else setCreature(ai ? ai.kind : null, ai && ai.pack);
  playerShow(); seatPeople(mode, cfg);
  if (T3.playerWalkSide) T3.playerWalkSide(mode === 'ai3' || (mode === 'tourney' && ais.length > 1) ? 'right' : 'auto'); // (TOURNEY: two creatures stand like Three at the table)   // the second creature stands at the far left corner
  var begin = function () { if (!G) return; if (Snd.ambience) Snd.ambience(['stadium', 'night', 'beach', 'volcano'].indexOf(S.cos.mat) >= 0 ? 'stadium' : 'room');
    var stadiumMat = ['stadium', 'night'].indexOf(S.cos.mat) >= 0;
    if (window.WeatherSfx) WeatherSfx.set(stadiumMat && wx ? wx.ambience : 'off');
    var news = stadiumMat && T3.stadiumNews ? T3.stadiumNews() : '';   // once per new stadium tier
    // MATCHDAY (js/matchday.js): the walk-out and the toss for the first Goal (it sets G.setter), then the match itself
    var kick = function (md) { if (!G) return;
      if (news) { persist(); setTimeout(function () { if (G) say('pip', news, 'cheer'); }, 2400); }
      if (ai && Snd.theme) Snd.theme(ai.kind); if (!(md && md.entered)) creaturesEnter(); setTimeout(function () { if (G) playerMood('wave'); }, 500); if (G.tour && window.Tourney) Tourney.firstSetter(function () { newShake(); }); else newShake(); /* TOURNEY: red-cube roll for the first Goal-setter */ if (window.Commentary) Commentary.say('kickoff'); if (ai) { var hi = (window.Rivals && Rivals.greet(OPPONENTS.indexOf(ai))) || talkLine(ai, 'greet'); if (hi) setTimeout(function () { if (G && G.phase === 'roll') say('opp', hi); }, 600); } };
    if (window.Matchday) Matchday.matchStart(G, kick); else kick(); };
  if (window.Social && Social.vsScreen) Social.vsScreen(G.players, begin); else begin();
}
// Operation cubes we are not playing with yet (say, powers and roots) are rolled again until they show something
// usable, instead of being parked in Forbidden. (House rule; a fixed set of cubes, like the tutorial's, keeps the old lock.)
function rerollOps(done) {
  var g0 = G, c0 = G.cubes, rounds = 0;
  function okSym(s) { return Eq.isDigit(s) || G.ops.indexOf(s) >= 0; }
  function okC(c) { return (window.Bonus && Bonus.isCube(c)) ? Bonus.okFace(c.color, c.s) : okSym(c.s); } // BONUS: a bonus die's face Tata switched off is rolled again too
  function bad() { return G.cubes.filter(function (c) { return !okC(c); }); }
  var b = bad(); if (!b.length) { done(); return; }
  var names = { '^': 'powers', 'r': 'roots', '*': 'times', '/': 'dividing' }, miss = [];
  ['*', '/', '^', 'r'].forEach(function (s) { if (b.some(function (c) { return c.s === s && !(window.Bonus && Bonus.isCube(c)); })) miss.push(names[s]); });
  if (window.Bonus && b.some(Bonus.isCube)) miss.push('that bonus-die face'); // BONUS
  var list = miss.length > 1 ? miss.slice(0, -1).join(', ') + ' or ' + miss[miss.length - 1] : miss[0];
  say('pip', 'We aren\'t playing with <b>' + list + '</b> yet, so let me roll ' + (b.length > 1 ? 'these ' + b.length + ' cubes' : 'this cube') + ' again to get something we can use!', 'think');
  renderGame();
  function step() {
    if (!G || G !== g0 || G.cubes !== c0) return;
    var now = bad();
    if (!now.length) { say('pip', 'There! Now every cube is one we can use.', 'happy'); renderGame(); setTimeout(function () { if (G && G === g0 && G.cubes === c0) done(); }, 500); return; }
    rounds++;
    var roll = now.map(function (c) { var f = Eq.CUBE_FACES[c.color]; if (rounds > 6) f = f.filter(function (s) { return okC({ color: c.color, s: s }); }); c.s = f[Math.floor(Math.random() * f.length)]; return { id: c.id, s: c.s }; }); // (BONUS: okC)
    var next = function () { if (!G || G !== g0 || G.cubes !== c0) return; renderGame(); setTimeout(step, 350); };
    if (T3.active() && T3.reroll) T3.reroll(roll, next);   // they hop up, tumble and land showing the new face (about 1 s, with the clatter)
    else { Snd.clatter(); renderGame(); setTimeout(step, 700); }   // flat table: as before
  }
  setTimeout(step, 1500);
}
function newShake(fixedCubes) {
  var st = stageInfo();
  G.ops = st.ops.slice(); G.fractions = st.fractions;
  if (G.tour && window.Tourney) Tourney.fixOps(); // TOURNEY: fractions on, all six operations (or the unlocked ones)
  G.cubes = (fixedCubes || Eq.roll()).map(function (c) { return { id: c.id, color: c.color, s: c.s, zone: 'resources', order: c.id, locked: false }; });
  if (window.Bonus) Bonus.onShake(G, !!fixedCubes); // BONUS (house rule): the earned bonus dice join the roll (js/bonus.js)
  if (window.Career) Career.onShake(G, !!fixedCubes); // CAREER: a creature's bonus die (Nugget) joins the roll
  function lockOps() { G.cubes.forEach(function (c) { if (!Eq.isDigit(c.s) && G.ops.indexOf(c.s) < 0) { c.zone = 'forbidden'; c.locked = true; c.order = ++orderCounter; } }); }
  G.goalTokens = []; G.goal = null; G.lastMover = null; G.selected = null; G.hintUsed = false; G.turn = G.setter;
  G.busy = false; G.aiPlan = null; G.justMoved = null; G.highlight = null;
  if (window.Vari) Vari.reset(); // VARIATIONS (js/variations.js): no card yet this shake
  if (G.tour && window.Tourney) Tourney.onShake(); // TOURNEY: the division's rules, no card yet, bonus moves reset
  xpLog = [];
  G.phase = 'roll'; G.rolling = true;
  cue('reset'); Snd.setMood('play'); board('');
  say('pip', 'Rolling the cubes…');
  if (T3.active()) {
    renderGame();
    var g0 = G, c0 = G.cubes;   // (a pour that belongs to a match he already left must not touch the new one)
    T3.pour(G.cubes, function (res) {
      if (!G || G !== g0 || G.cubes !== c0) return;
      if (!fixedCubes) res.forEach(function (s, i) { G.cubes[i].s = s; });
      G.rolling = false; renderGame();
      setTimeout(function () {
        if (!G || G !== g0 || G.cubes !== c0) return;
        var toGoal = function () { G.phase = 'goal'; renderGame(); setTimeout(function () { if (G && G === g0 && G.cubes === c0) startGoalPhase(); }, 700); };
        if (fixedCubes) { lockOps(); if (G.cubes.some(function (c) { return c.locked; })) say('pip', '🔒 Operations you haven\'t unlocked yet go to Forbidden. Coming soon!'); toGoal(); }
        else rerollOps(toGoal);
      }, 500);
    });
  } else {
    if (fixedCubes) lockOps();
    renderGame(); Snd.clatter();
    var gF = G, cF = G.cubes;
    setTimeout(function () { if (!G || G !== gF || G.cubes !== cF) return; var go2 = function () { G.rolling = false; G.phase = 'goal'; startGoalPhase(); }; if (fixedCubes) go2(); else rerollOps(go2); }, fixedCubes ? 1500 : 900);
  }
}
function cue(name) { if (T3.cue) T3.cue(name); }
function shot(name, opts) { return !!(T3.active() && T3.shot && T3.shot(name, opts)); }
function fx3(name, opts) { if (T3.fx) T3.fx(name, opts); }
function board(text) { if (T3.setBoard) T3.setBoard(text); }
// Read a line aloud (only when 'Read lines aloud' is on in Settings).
// Creatures talk in their babble voice (or real speech if 'Read lines aloud' is on) and move their mouth for as long as it lasts.
// Pip only speaks when 'Read lines aloud' is on, so instructions don't babble constantly.
function speakLine(who, text) {
  var ai = who === 'opp' ? curAI() : null;
  if (!ai) { if (S.set.voice === true && Snd.speak) Snd.speak(text, 'pip'); return; }
  var ms = Snd.talk ? Snd.talk(text, ai.kind) : (S.set.voice === true && Snd.speak ? (Snd.speak(text, ai.kind), 1500) : 0);
  if (ms && T3.creatureTalk) T3.creatureTalk(ms);
}
function crowdSay(kind, opts) { if (typeof crowdReact === 'function') crowdReact(kind, opts); else if (Snd.crowdReact) Snd.crowdReact(kind); }
function say(who, text, mood) { if (!G) return; if (who === 'opp' && window.Social && Social.bubble && (!G.speech || G.speech.text !== text)) Social.bubble('opp', String(text).replace(/<[^>]+>/g, '')); if (!G.speech || G.speech.text !== text) speakLine(who, text); G.speech = { who: who, text: text, mood: mood || 'happy', fresh: !G.speech || G.speech.text !== text }; if (current === 'game') { var el = $('#speech'); if (el) el.outerHTML = speechHTML(); } }
function speechHTML() {
  var sp = G.speech || { who: 'pip', text: '' }, face;
  if (sp.who === 'opp' && curAI()) face = avatarHTML(curAI());
  else face = pipHTML(sp.mood, 54, '');
  sp.fresh = false;
  return '<div class="speech" id="speech"><div class="who">' + face + '</div><div class="txt">' + sp.text + '</div></div>';
}

function startGoalPhase() {
  if (G.tour && window.Tourney && Tourney.beforeGoal(startGoalPhase)) return; // TOURNEY: every player picks a card first (II-B)
  if (window.Bonus && Bonus.beforeGoal(startGoalPhase)) return; // BONUS: a newly earned die is celebrated, the Twist card is drawn (it may pick this shake's card)
  if (window.Career && Career.beforeGoal(startGoalPhase)) return; // CAREER: the creature's signature card is dealt
  if (window.Vari && Vari.beforeGoal(startGoalPhase)) return; // VARIATIONS: the Goal-setter may pick a card first, then this runs again
  var P = G.players[G.setter];
  if (P.ai) { G.busy = true; say('opp', pick(P.ai.think)); renderGame(); creatureAt(G.setter, function () { if (T3.creatureMood) T3.creatureMood('think'); }); /* ACTING */ setTimeout(aiSetGoal, 1100); }
  else {
    if (G.mode !== 'tutorial') say('pip', (multiHuman() ? '<b>' + esc(P.name) + '</b>, you' : 'You') + ' rolled the cubes, so you set the <b>Goal</b>! Use 1 to 6 cubes. Two digit cubes side by side make a two-digit number, like 2 and 4 → 24.');
    renderGame();
  }
}

// ----- Rendering -----
function cubeHTML(c, cls, style) {
  return '<div class="cube c-' + c.color + (c.locked ? ' locked' : '') + (cls ? ' ' + cls : '') + '" data-id="' + c.id + '"' + (style ? ' style="' + style + '"' : '') + '><span>' + (window.Bonus && Bonus.isCube(c) ? Bonus.tile(c) : show(c.s)) + '</span></div>'; // (BONUS: a bonus tile shows its die face)
}
function zoneHTML(z, title, sub) {
  var cs = zoneCubes(z), tgt = (G.selected != null && G.phase === 'move' && canMoveTo(z)) ? ' target' : '';
  return '<div class="zone z-' + z + tgt + '" data-zone="' + z + '" data-act="zoneTap" data-arg="' + z + '"><h3>' + title + ' <small>' + sub + '</small></h3><div class="cubes">' +
    (cs.map(function (c) { return cubeHTML(c, (c.id === G.justMoved ? 'thunk' : '') + (c.locked ? '' : '')); }).join('') || '<span class="empty">empty</span>') + '</div></div>';
}
function canMoveTo(z) { if (z === 'forbidden') return zoneCubes('resources').length > 1; return z === 'required' || z === 'permitted'; }
function humanTurn() { return G && G.phase === 'move' && !G.busy && !isAI(G.turn); }
function nowCheck() { return nowCheckFor(G.turn); }
function nowCheckFor(p) {
  if (G.lastMover === null || G.lastMover === p) return 'There is no move to challenge yet.';
  if (zoneCubes('resources').length < 2) return 'Now! needs at least two cubes left in Resources.';
  if (zoneCubes('required').length + zoneCubes('permitted').length === 0) return 'Now! needs at least one cube in Required or Permitted first.';
  return '';
}
function renderGame() {
  if (!G) return;
  var el = $('#game'), three = T3.active(), resC = zoneCubes('resources');
  var scores = G.players.map(function (p, i) {
    if (G.team && i === 0) return Team.hudHTML(p, i === G.turn && G.phase === 'move');
    var face = p.ai ? avatarHTML(p.ai, 'sm') : (i === 0 ? '<span class="jersey">' + esc(S.jersey || '7') + '</span>' : '<span class="jersey j' + (i + 1) + '">' + (p.jersey ? esc(p.jersey) : (i + 1)) + '</span>');
    return '<div class="pl' + (i === G.turn && G.phase === 'move' ? ' turn' + (isAI(i) ? ' opp-turn' : '') : '') + '" data-pi="' + i + '">' + face + '<b>' + esc(p.name) + '</b><span class="pts" data-v="' + p.score + '">' + p.score + '</span></div>';
  }).join('');
  var goalHTML = G.goalTokens.length ? G.goalTokens.map(function (t) { return typeof t === 'string' ? ((t === '(' || t === ')') ? '<span class="paren">' + t + '</span>' : '<div class="cube c-none"><span>' + show(t) + '</span></div>') : cubeHTML(G.cubes[t.id], t.id === G.justMoved ? 'thunk' : ''); }).join('') : '<span class="empty">' + (G.phase === 'goal' ? 'waiting for the Goal…' : '') + '</span>';
  if (window.Vari && Vari.goalHTML) { var vgH = Vari.goalHTML(''); if (vgH) goalHTML = vgH; } // VARIATIONS: turned cubes and second meanings in the Goal
  var resHTML = resC.map(function (c, i) {
    var cls = (G.selected === c.id ? 'sel' : '') + (G.highlight === c.id ? ' hl' : '');
    if (G.rolling) return cubeHTML(c, 'tumble', '--tx:' + Math.round((Math.random() - 0.5) * 400) + 'px;--rot:' + Math.round((Math.random() - 0.5) * 1080) + 'deg;animation-delay:' + (i * 35) + 'ms');
    return cubeHTML(c, cls);
  }).join('') || '<span class="empty">empty</span>';
  if (!$('#gTop')) el.innerHTML = '<div id="gTop" class="game-top"></div><div id="gGoal"></div><div id="gMat"></div><div id="gAct" class="actionbar"></div>';
  el.classList.toggle('three', three);
  $('#gTop').innerHTML = '<button class="btn small ghost" data-act="quitGame" aria-label="Menu">' + ico('back') + '<span class="lbl">Menu</span></button><div class="scores">' + scores + '</div>' +
    '<div class="shake-no">' + (G.mode === 'tutorial' ? '<b>Practice</b>' : '<small>Shake</small><b>' + G.shake + '/' + G.shakes + '</b>') + '</div>' + (G.tour && window.Tourney ? Tourney.topHTML() : ''); // (TOURNEY: division, penalties, practice clock)
  if (three) {
    $('#gGoal').innerHTML = G.goal ? '<div class="goalhud"><div class="gl">' + ico('target') + '<span>GOAL</span></div><span class="expr">' + ((window.Vari && Vari.goalHTML && Vari.goalHTML('mini')) || tokensHTML(G.goalTokens, G.cubes)) + '</span><span class="gv">= ' + Eq.fmt(G.goal) + (window.Vari && Vari.wildNote() ? ' <small>(0 is wild)</small>' : '') + '</span></div>' : '';
    T3.attach($('#gMat')); T3.sync(G);
  } else {
    $('#gGoal').innerHTML = '';
    $('#gMat').innerHTML = '<div class="mat">' +
    '<div class="zone z-goal" data-zone="goal"><h3>🎯 GOAL ' + (G.goal ? '<span class="gval">= ' + Eq.fmt(G.goal) + (window.Vari && Vari.wildNote() ? ' (0 is wild)' : '') + '</span>' : '') + '</h3><div class="cubes">' + goalHTML + '</div></div>' +
    '<div class="zrow">' + zoneHTML('required', '✅ REQUIRED', 'must use') + zoneHTML('permitted', '👍 PERMITTED', 'may use') + zoneHTML('forbidden', '⛔ FORBIDDEN', "can't use") + '</div>' +
    '<div class="zone z-res" data-zone="resources"><h3>🎲 RESOURCES <small>' + resC.length + ' left</small></h3><div class="cubes">' + resHTML + '</div></div>' +
    '</div>' ;
  }
  $('#gAct').innerHTML = speechHTML() + '<div class="acts">' + (G.team ? Team.barHTML() : '') + actionsHTML() + '</div>';
  G.justMoved = null;
  hudCountUp();
}
function actionsHTML() {
  if (G.phase === 'goal' && G.tour && window.Tourney && Tourney.selPending()) return '<button class="btn big green" data-act="tResumeSel">🃏 Pick the cards first</button>'; // TOURNEY: the card pick is not finished
  if (G.phase === 'goal' && !isAI(G.setter) && !G.busy) {
    return (multiHuman() ? '<div style="width:100%;text-align:center;font-weight:800">' + esc(G.players[G.setter].name) + ' sets the Goal</div>' : '') +
      '<button class="btn big green" data-act="buildGoal">' + ico('target') + ' Build the Goal</button>' + (G.mode === 'tutorial' ? '' : '<button class="btn" data-act="noGoal">No Goal possible</button>') +
      (G.tour && window.Tourney ? Tourney.bonusButtonHTML() : '') + (window.Tourney ? Tourney.judgeButtonHTML() : ''); // TOURNEY: bonus move before the Goal; Ask the Judge
  }
  if (G.phase !== 'move') return '';
  var out = '';
  if (humanTurn()) {
    var nc = nowCheck();
    out += (multiHuman() ? '<div style="width:100%;text-align:center;font-weight:800">' + esc(G.players[G.turn].name) + ': your turn!</div>' : '') +
      '<button class="btn now" data-act="callNow" data-arg="' + G.turn + '"' + (nc ? ' title="' + esc(nc) + '"' : '') + '>' + ico('bolt') + ' Now!</button>' +
      '<button class="btn imp" data-act="callImp" data-arg="' + G.turn + '">' + ico('ban') + ' Impossible!</button>' +
      (G.mode === 'tutorial' ? '' : '<button class="btn" data-act="hint">' + ico('bulb') + ' Hint</button>') +
      (G.tour && window.Tourney ? Tourney.bonusButtonHTML() : ''); // TOURNEY: bonus move
  }
  if (window.Tourney && !G.carrying) out += Tourney.judgeButtonHTML(); // TOURNEY: Ask the Judge (normal matches too)
  if (nP() > 2 && G.lastMover !== null && !G.carrying) {
    var others = humans().filter(function (i) { return i !== G.turn && i !== G.lastMover; });
    if (others.length) out += '<div class="also">' + others.map(function (i) {
      return '<span>' + esc(G.players[i].name) + ' can challenge too:</span><button class="btn small now" data-act="callNow" data-arg="' + i + '">' + ico('bolt') + ' Now!</button><button class="btn small imp" data-act="callImp" data-arg="' + i + '">' + ico('ban') + ' Impossible!</button>';
    }).join('') + '</div>';
  }
  if (G.wait) out += '<button class="btn big green" data-act="goOn">Go on ▶</button>';
  if (window.Social && Social.emoteBar && T3.active() && firstAI() && G.mode !== 'tutorial') out += Social.emoteBar();
  return out;
}

// ----- Human actions -----
var ACT = {};
ACT.start = function () { Snd.init(); runIntro(); };
ACT.closeModal = function () { closeModal(); };
ACT.setup = function () { renderSetup(); go('setup'); };
ACT.home = function () { gotoTitle(); };
ACT.daily = function () { openDaily(); };
ACT.trophies = function () { renderTrophies(); go('trophies'); };
ACT.stats = function () { renderStats(); go('stats'); };
ACT.settings = function () { renderSettings(); go('settings'); };
ACT.tutorial = function () { startTutorial(); };
ACT.quitGame = function () {
  modal('<h2>Leave the game?</h2><p style="text-align:center">The points in this match won\'t count, but all your XP and badges are saved.</p><div class="row"><button class="btn" data-act="closeModal">Keep playing</button><button class="btn pink" data-act="reallyQuit">Leave</button></div>');
};
ACT.reallyQuit = function () { closeModal(); mateShow(null); if (window.Commentary) Commentary.hide(); if (window.WeatherSfx) WeatherSfx.set('off'); if (Snd.ambience) Snd.ambience('off'); if (Snd.stopBabble) Snd.stopBabble(); if (window.Social && Social.clearBubbles) Social.clearBubbles(); $('#builder').classList.remove('on'); G = null; TUT = null; gotoTitle(); };

ACT.cubeTap = function (el) {
  if (G && G.carrying && T3.playerMoveFinish) { G.skipCarry = G.phase === 'goal'; T3.playerMoveFinish(); }   // a tap lands the lob at once
  if (!G) return;
  if (G.tour && window.Tourney && Tourney.bonusTap(+el.dataset.id)) return; // TOURNEY: a bonus move goes straight to Forbidden
  var id = +el.dataset.id, c = G.cubes[id];
  if (c.locked) { say('pip', 'That ' + show(c.s) + ' cube is locked 🔒. <b>Coming soon!</b> Keep solving to unlock it.'); return; }
  if (c.zone !== 'resources') return;
  if (!humanTurn()) { if (G.phase === 'goal' && !isAI(G.setter)) say('pip', 'First, tap <b>Build the Goal</b>!'); return; }
  Snd.click();
  G.selected = (G.selected === id) ? null : id;
  if (G.selected != null) say('pip', 'Now tap <b>Required</b>, <b>Permitted</b> or <b>Forbidden</b> for the ' + show(c.s) + ' cube.' + (zoneCubes('resources').length === 1 ? ' (The last cube can\'t go to Forbidden.)' : ''));
  renderGame();
};
ACT.zoneTap = function (el, e) {
  var lc = e && e.target.closest('.cube.locked'); if (lc) { ACT.cubeTap(lc); return; }
  if (!G || G.selected == null || !humanTurn()) return;
  doMove(G.selected, el.dataset.arg);
};
function doMove(id, zone, dragged) {
  var c = G.cubes[id];
  if (!humanTurn() || c.zone !== 'resources' || c.locked) return;
  if (['required', 'permitted', 'forbidden'].indexOf(zone) < 0) return;
  if (zone === 'forbidden' && zoneCubes('resources').length === 1 && G.tour && window.Tourney) { Tourney.illegal(G.turn, 'lastForbid'); return; } // TOURNEY: the Judge explains (VIII-A)
  if (zone === 'forbidden' && zoneCubes('resources').length === 1) { say('pip', 'The very last cube can\'t go to Forbidden. Put it in <b>Required</b> or <b>Permitted</b>!', 'think'); Snd.boop(); return; }
  if (G.mode === 'tutorial' && !tutAllowMove(c, zone)) return;
  G.selected = null;
  if (dragged) placeCube(id, zone, G.turn); else humanPlace(id, zone, G.turn);
}
function placeCube(id, zone, who) {
  var c = G.cubes[id];
  if (window.Recorder) Recorder.note('move', { by: who, id: id, zone: zone, cubes: G.cubes, goal: G.goal, fr: G.fractions }); // REVIEW (before the cube moves)
  c.zone = zone; c.order = ++orderCounter; G.justMoved = id; G.highlight = null;
  G.lastMover = who;
  if (G.tour) { G.tour.bonusBy = null; G.tour.armed = null; } // TOURNEY: the next player may make their own bonus move
  if (G.team) Team.sync(); // the other teammate takes the team's next turn
  if (!T3.active()) Snd.thunk();
  var left = zoneCubes('resources').length;
  if (left === 0) { renderGame(); setTimeout(lastCubePlayed, 600); return; }
  G.turn = nextP(who); // play passes to the left
  if (G.clever && window.Commentary) Commentary.say('clever', { by: G.players[who].name });
  crowdSay(G.clever ? 'ooh' : 'clap'); G.clever = false;
  if (!isAI(who)) say('pip', pick(['Nice move!', 'Good thinking!', 'Thunk! Placed.', 'Ooh, interesting!']), 'happy');
  if (!isAI(who) && firstAI() && Math.random() < 0.25) creatureMood(pick(['nod', 'nod', 'gasp']));
  if (who === 0 && !isAI(0) && window.Rivals && firstAI() && window.Social && Social.bubble) { var rvl = Rivals.midLine(OPPONENTS.indexOf(firstAI()), { g: G, sym: c.s }); if (rvl) setTimeout(function () { if (G && G.phase === 'move') Social.bubble('opp', rvl); }, 700); } // RIVALS
  renderGame();
  nextTurn();
}
// In a 3-player game, a computer player who is NOT next may still challenge the move that was just made.
// It thinks in the background: returns true while it is looking, then either challenges or carries on with nextTurn().
function aiInterject() {
  if (G.mode === 'tutorial' || nP() < 3) return false;
  var cands = idxs().filter(function (i) { return isAI(i) && i !== G.lastMover && i !== G.turn; });
  if (!cands.length || G.aiLooked === orderCounter) return false; // already looked at this move
  G.aiLooked = orderCounter; G.busy = true; renderGame();
  var sit = aiSituation(), list = cands.map(function (p) { return { p: p, o: AI.skill(G.players[p].ai), nowOk: !nowCheckFor(p) }; });
  AIThink.run('interject', [list, snapshot(), G.goal, G.fractions]).then(function (hit) {
    if (!aiStill(sit)) return;
    G.busy = false;
    if (hit) { if (hit.d.kind === 'now') G.aiPlan = hit.d.plan; challenge(hit.d.kind, hit.p); }
    else nextTurn();
  }).catch(aiOops);
  return true;
}
function nextTurn() {
  if (G.phase !== 'move') return;
  if (G.team) Team.sync(); // (also catches the Goal the team just set)
  if (aiInterject()) return;
  // (untimed) with two creatures, the kid gets to look at one creature's move before the other one plays
  if (isAI(G.turn) && (G.mode === 'ai3' || G.mode === 'tourney') && G.lastMover !== null && isAI(G.lastMover)) { // (TOURNEY: + tourney)
    G.wait = true; G.busy = false;
    say('pip', '<b>' + esc(G.players[G.lastMover].name) + '</b> moved. Spot something? Call <b>Now!</b> or <b>Impossible!</b> Or tap <b>Go on</b> to let ' + esc(G.players[G.turn].name) + ' play. Take your time!');
    renderGame(); return;
  }
  if (isAI(G.turn)) { setTimeout(aiTurn, 500); return; }
  var last = zoneCubes('resources').length === 1;
  if (G.mode === 'tutorial') { tutPrompt(); renderGame(); return; }
  var name = G.team ? Team.yourName() : multiHuman() ? '<b>' + esc(G.players[G.turn].name) + '</b>, your' : 'Your';
  if (last) say('pip', name + ' turn. Only ONE cube left! Move it to <b>Required</b> or <b>Permitted</b>, or call <b>Impossible!</b> if no Solution can be made.', 'think');
  else say('pip', name + ' turn! Tap a Resource cube, then tap a section. Or, if you spot something, challenge: <b>Now!</b> or <b>Impossible!</b>');
  renderGame();
}
ACT.tResumeSel = function () { if (G && G.tour && window.Tourney) Tourney.resumeSel(); }; // TOURNEY
ACT.goOn = function () { if (!G || !G.wait || G.phase !== 'move') return; G.wait = false; Snd.click(); aiTurn(); };
ACT.buildGoal = function () {
  if (!G || G.phase !== 'goal' || isAI(G.setter)) return;
  if (G.tour && window.Tourney && Tourney.resumeSel()) return; // TOURNEY: every card is picked before the Goal (II-B, A12)

  openGoalBuilder(G.setter, function (tokens, val) { humanGoal(tokens, val); });
};
function setGoal(tokens, val) {
  tokens.forEach(function (t) { if (typeof t === 'object') { G.cubes[t.id].zone = 'goal'; G.cubes[t.id].order = ++orderCounter; } });
  G.goalTokens = tokens; G.goal = val; G.lastMover = G.setter; G.turn = nextP(G.setter); G.phase = 'move'; G.busy = false;
  if (window.Vari) Vari.afterGoal(tokens); // VARIATIONS: 0 Wild needs the Goal's cubes in the math mode
  if (window.Recorder) Recorder.note('goal', { by: G.setter, goal: val, goalTokens: tokens, cubes: G.cubes, fr: G.fractions, shake: G.shake }); // REVIEW
  if (Snd.getMood && Snd.getMood() === 'think') Snd.setMood('play');
  Snd.thunk(); Snd.chime(); board('GOAL' + String.fromCharCode(10) + Eq.fmt(val)); shot('goal'); crowdSay(tokens.filter(function (t) { return typeof t === 'object'; }).length >= 4 ? 'ooh' : 'cheer');
  if (window.Commentary) Commentary.say('goal', { goal: Eq.fmt(val), by: G.players[G.setter].name, cubes: tokens.filter(function (t) { return typeof t === 'object'; }).length });
  if (!isAI(G.setter) && G.setter === 0 && G.mode !== 'tutorial') { S.stats.goalsSet++; if (window.Parent) Parent.note('goal', { tokens: tokens, value: val }); checkBadges({ type: 'goal' }); }
  if (G.setter === 0 && !isAI(0)) setTimeout(function () { if (G && G.phase === 'move') playerMood('proud'); }, 900); // AVATARS: pleased with his Goal
  if (G.setter === 0 && !isAI(0) && G.mode !== 'tutorial' && window.Rivals && firstAI() && window.Social && Social.bubble) { var rvg = Rivals.midLine(OPPONENTS.indexOf(firstAI()), { g: G, goal: 1 }); if (rvg) setTimeout(function () { if (G && G.phase === 'move') Social.bubble('opp', rvg); }, 900); } // RIVALS
  if (G.mode === 'tutorial') { tutAfterGoal(); return; }
  renderGame(); nextTurn();
}
// Who is challenging: the button says (data-arg), otherwise the player whose turn it is.
function challengerFrom(el) { return (el && el.dataset && el.dataset.arg !== undefined && el.dataset.arg !== '') ? +el.dataset.arg : G.turn; }
function canChallengeNowish(p) {
  if (!G || G.phase !== 'move' || isAI(p) || G.lastMover === null || p === G.lastMover) return false;
  return p === G.turn ? humanTurn() : !G.carrying;
}
ACT.callNow = function (el) {
  var p = challengerFrom(el);
  if (G && G.tour && window.Tourney && G.phase === 'move' && !isAI(p) && (G.lastMover === null || G.lastMover === p)) { Tourney.illegal(p, G.lastMover === null ? 'noMove' : 'self'); return; } // TOURNEY
  if (!canChallengeNowish(p)) return;
  var why = nowCheckFor(p);
  if (why && G.tour && window.Tourney) { Tourney.illegal(p, /two cubes/.test(why) ? 'nowRes' : /Required or Permitted/.test(why) ? 'nowMat' : 'noMove'); return; } // TOURNEY: the Judge explains (VI-A-2)
  if (why) { say('pip', why, 'think'); Snd.boop(); return; }
  if (G.mode === 'tutorial' && !tutAllowChallenge('now')) return;
  challenge('now', p);
};
ACT.callImp = function (el) {
  var p = challengerFrom(el);
  if (!G || G.phase !== 'move') return;
  if ((G.lastMover === null || G.lastMover === p) && G.tour && window.Tourney && !isAI(p)) { Tourney.illegal(p, G.lastMover === null ? 'noMove' : 'self'); return; } // TOURNEY
  if (G.lastMover === null || G.lastMover === p) { say('pip', 'There is no move to challenge yet.'); return; }
  if (!canChallengeNowish(p)) return;
  if (G.mode === 'tutorial' && !tutAllowChallenge('impossible')) return;
  challenge('impossible', p);
};
ACT.hint = function () {
  if (!humanTurn()) return;
  G.hintUsed = !(window.Bonus && Bonus.freeHint()); // BONUS: the Twist card Free hint
  var st = snapshot(), strong = { fractions: G.fractions, maxDigits: 5, timeMs: 500 };
  if (!nowCheck()) {
    var r = Eq.solve(Object.assign({ goal: G.goal, req: st.req, opt: st.perm, res: st.res, mode: 'now' }, strong));
    if (r.found) { say('pip', 'Psst… I think a Solution is possible RIGHT NOW, using the mat plus at most ONE Resource cube. You could call <b>⚡ Now!</b>', 'think'); return; }
  }
  var imp = Eq.solve(Object.assign({ goal: G.goal, req: st.req, opt: st.perm, res: st.res, mode: 'impossible' }, strong));
  if (!imp.found && imp.complete) { say('pip', 'Hmm… I can\'t find ANY way to make the Goal with these cubes. Maybe it\'s <b>🚫 Impossible!</b>', 'think'); return; }
  var mv = aiChooseMove(OPPONENTS[4]);
  if (mv) {
    var c = G.cubes[mv.id]; G.highlight = mv.id;
    var zn = { required: 'Required', permitted: 'Permitted', forbidden: 'Forbidden' }[mv.zone];
    say('pip', 'Here\'s an idea: move the glowing <b>' + show(c.s) + '</b> cube to <b>' + zn + '</b>. That looks safe!', 'think');
    renderGame();
  }
};

// ----- Challenges -----
function banner(text, sub) {
  var b = document.createElement('div'); b.className = 'banner' + (/GOOO/.test(text) ? ' goal' : /IMPOSS/.test(text) ? ' imp' : /NOW/.test(text) ? ' now' : ''); b.innerHTML = text + (sub ? '<small>' + esc(sub) + '</small>' : '');
  document.body.appendChild(b); setTimeout(function () { b.remove(); }, 1400);
}
function thirdOf(a, b) { if (nP() < 3) return null; var r = idxs().filter(function (i) { return i !== a && i !== b; }); return r.length ? r[0] : null; }
function challenge(kind, who) {
  if (window.Recorder) Recorder.note('challenge', { by: who, kind: kind, cubes: G.cubes, goal: G.goal, fr: G.fractions }); // REVIEW
  var mover = G.lastMover;
  G.phase = 'challenge'; G.ch = { kind: kind, challenger: who, mover: mover, tp: thirdOf(who, mover) }; G.selected = null; G.busy = false;
  if (window.Rivals) Rivals.note('challenge', { g: G }); // RIVALS
  var cname = (G.team && who === 0) ? Team.callerName() : G.players[who].name, mname = (G.team && mover === 0) ? Team.writerName() : G.players[mover].name;
  banner(kind === 'now' ? '⚡ NOW!' : '🚫 IMPOSSIBLE!', cname + ' challenges!');
  if (window.Commentary) Commentary.say('challenge', { kind: kind, by: cname });
  G.wait = false;
  if (isAI(who)) { focusAI(who); creatureMood('challenge'); }
  else if (who === 0) playerMood('now', { kind: kind });
  else if (isAI(mover)) { focusAI(mover); creatureMood('nervous'); var kc = talkLine(G.players[mover].ai, 'kidChallenge'); if (kc && window.Social && Social.bubble) Social.bubble('opp', kc); }
  Snd.slam(); Snd.setMood('challenge'); if (!((isAI(who) || isAI(mover)) && shot('challenge'))) cue('challenge'); fx3('shake'); board(kind === 'now' ? 'NOW!' : 'IMPOSSIBLE!'); crowdSay('gasp');
  if (isAI(who)) say('opp', kind === 'now' ? G.players[who].ai.now : G.players[who].ai.imp);
  else say('pip', kind === 'now' ? esc(cname) + ' says Now! and must write a Solution using the mat plus at most ONE Resource cube.' : 'Impossible! Now ' + esc(mname) + ' must try to write a Solution.', 'cheer');
  renderGame();
  var writer = kind === 'now' ? who : mover;
  setTimeout(function () {
    writeSolution(writer, kind, function (ok, tokens, chk) {
      if (G.ch.tp === null) resolveChallenge(ok, tokens, chk, null);
      else askThirdParty(G.ch.tp, kind, function (tpRes) { resolveChallenge(ok, tokens, chk, tpRes); });
    });
  }, 1400);
}
function writeSolution(pi, mode, cb) {
  if (window.Recorder && Recorder.armed()) { var cb0 = cb; cb = function (ok, tokens, chk) { if (G) Recorder.note('solution', { by: pi, mode: mode, ok: ok, tokens: tokens, cubes: G.cubes, goal: G.goal, fr: G.fractions }); cb0(ok, tokens, chk); }; } // REVIEW
  if (isAI(pi)) aiWrite(pi, mode, cb);
  else if (G.team && pi === 0) Team.write(mode, cb); // one teammate writes, the other may help
  else if (multiHuman()) passTo(pi, mode, function () { openSolutionBuilder(pi, mode, cb); });
  else openSolutionBuilder(pi, mode, cb);
}
function passTo(pi, mode, then) {
  modal('<h2 class="hero">Pass to ' + esc(G.players[pi].name) + '</h2><p style="text-align:center">' + esc(G.players[pi].name) + ', it\'s your turn to write a Solution.' + (mode === 'last' || nP() > 2 ? ' No peeking, everybody else!' : '') + '</p><div class="row"><button class="btn green big" data-act="closeModal">I\'m ready!</button></div>', then);
}
// After a challenge in a 3-player game, the Third Party MAY also write a Solution.
function askThirdParty(tp, kind, cb) {
  if (isAI(tp)) {
    focusAI(tp);
    var o = G.players[tp].ai, sit = aiSituation();
    say('opp', esc(o.name) + ' is deciding whether to write a Solution too…'); renderGame();
    aiThink('thirdParty', [AI.skill(o), snapshot(), G.goal, G.fractions, kind], 1300).then(function (r) {
      if (!aiStill(sit)) return;
      if (r.found && Math.random() < o.smart + 0.15) {
        var toks = symsToCubeTokens(r.tokens, kind), chk = Eq.checkSolution(toks, solCtx(kind));
        say('opp', 'I wrote one too!'); cb({ presented: true, ok: chk.ok, tokens: toks, chk: chk });
      } else { say('opp', 'I\'ll sit this one out.'); cb({ presented: false }); }
    }).catch(aiOops);
    return;
  }
  ACT.tpYes = function () { closeModal(); writeSolution(tp, kind, function (ok, tokens, chk) { cb({ presented: true, ok: ok, tokens: tokens, chk: chk }); }); };
  ACT.tpNo = function () { closeModal(); cb({ presented: false }); };
  modal('<h2 class="hero">' + esc(G.players[tp].name) + ': Third Party</h2><p style="text-align:center">You may write a Solution too, but you don\'t have to.</p>' +
    '<ul class="reasons" style="background:#e7f5ff"><li>Write a correct one: you score <b>4 or 6</b>.</li><li>Write a wrong one: you score <b>2</b>.</li><li>Skip it: you score by who turns out to be right' + (kind === 'impossible' ? ' (4 if Impossible was right)' : ' (6 if the Now! Solution is wrong)') + '.</li></ul>' +
    '<div class="row"><button class="btn green" data-act="tpYes">' + ico('pencil') + ' I\'ll write one</button><button class="btn" data-act="tpNo">No thanks</button></div>');
}
var scoreChallenge = Eq.scoreChallenge; // official 2/3-player scoring lives in the engine (unit-tested)
function resolveChallenge(ok, tokens, chk, tpRes) {
  if (ok && tokens && Snd.readout) { try { Snd.readout(tokens.map(function (t) { return typeof t === 'string' ? t : t.s; }), G.goal); } catch (e) {} } // MUSIC: a correct Solution reads out, one note per cube
  var ch = G.ch, lines = [], pts = scoreChallenge(ch.kind, ch.challenger, ch.mover, ch.tp, ok, tpRes);
  var cn = esc(G.players[ch.challenger].name), mn = esc(G.players[ch.mover].name);
  if (ch.kind === 'now') lines.push(ok ? cn + ' called <b>Now!</b> and wrote a correct Solution.' : cn + ' called <b>Now!</b> but the Solution wasn\'t correct.');
  else lines.push(ok ? cn + ' called <b>Impossible!</b>, but ' + mn + ' found a Solution!' : cn + ' called <b>Impossible!</b> and ' + mn + ' couldn\'t write a correct Solution.');
  if (ch.tp !== null) {
    var tn = esc(G.players[ch.tp].name);
    lines.push(tpRes && tpRes.presented ? tn + ' (Third Party) also wrote a Solution: ' + (tpRes.ok ? 'correct!' : 'not correct.') : tn + ' (Third Party) didn\'t write one.');
  }
  if (G.team) { Team.challengeLines(ch, ok, lines); Team.challengeXP(ch, pts); }
  else if (!isAI(0) && G.mode !== 'tutorial') {
    if (ch.challenger === 0) {
      S.stats.challenges++;
      var won = pts[0] === 6;
      if (won) { playerMood('yes'); S.stats.challengeWins++; if (ch.kind === 'now') { S.stats.nowWins++; addXP(25, 'Correct Now! challenge'); } else { S.stats.impWins++; addXP(30, 'Correct Impossible! call'); addStar(); } }
      checkBadges({ type: 'challenge', kind: ch.kind, won: won });
    } else if (ch.mover === 0 && pts[0] === 6 && ch.kind === 'now') addXP(15, 'Clever move: their Now! failed');
    else if (ch.tp === 0 && pts[0] >= 4) addXP(15, 'Smart Third Party play');
  }
  if (window.Parent && !isAI(0) && G.mode !== 'tutorial') { var pRole = ch.challenger === 0 ? 'caller' : ch.mover === 0 ? 'mover' : 'third'; Parent.note('challenge', { kind: ch.kind, role: pRole, won: pRole === 'caller' ? pts[0] === 6 : (pts[0] || 0) >= 4 }); } // PARENT page
  var sols = {}; sols[ch.kind === 'now' ? ch.challenger : ch.mover] = { ok: ok, tokens: tokens, chk: chk };
  if (tpRes && tpRes.presented) sols[ch.tp] = { ok: tpRes.ok, tokens: tpRes.tokens, chk: tpRes.chk };
  endShake({ pts: pts, lines: lines, sols: sols });
}
function lastCubePlayed() {
  var mover = G.lastMover, others = idxs().filter(function (i) { return i !== mover; });
  G.phase = 'lastcheck';
  var ais = others.filter(isAI);
  function askHumans() {
    var hs = others.filter(function (i) { return !isAI(i); });
    if (!hs.length) { startLastWrite(); return; }
    say('pip', 'The last cube is on the mat!', 'think'); renderGame();
    modal('<h2 class="hero">Last cube played!</h2><p style="text-align:center">If you think NOBODY can make the Goal now, call Impossible! Otherwise everybody writes a Solution (4 points if correct, 2 if not).</p>' +
      '<div class="row">' + hs.map(function (i) { return '<button class="btn imp" data-act="lastImp" data-arg="' + i + '">' + ico('ban') + ' ' + (multiHuman() ? esc(G.players[i].name) + ': ' : '') + 'Impossible!</button>'; }).join('') +
      '<button class="btn green" data-act="lastWrite">' + ico('pencil') + ' Let\'s write!</button></div>');
  }
  if (ais.length) {
    var p = ais[0], o = G.players[p].ai, st = snapshot(), sit = aiSituation();
    say('opp', pick(o.think)); renderGame();
    aiThink('callsLastImpossible', [AI.skill(o), st, G.goal, G.fractions], 1200).then(function (imp) {
      if (!aiStill(sit)) return;
      if (imp) { G.lastMover = mover; challenge('impossible', p); }
      else askHumans();
    }).catch(aiOops);
  } else askHumans();
}
ACT.lastImp = function (el) { closeModal(); challenge('impossible', +el.dataset.arg); };
ACT.lastWrite = function () { closeModal(); startLastWrite(); };
function startLastWrite() {
  G.phase = 'lastwrite';
  say('pip', 'Everybody writes a Solution! Correct = 4 points, not correct = 2.', 'cheer'); renderGame();
  var results = {};
  function step(k) {
    if (k >= nP()) {
      var pts = {}, lines = ['After the last cube, everyone wrote a Solution.'];
      idxs().forEach(function (i) { pts[i] = results[i].ok ? 4 : 2; lines.push(esc(G.players[i].name) + (results[i].ok ? (G.team && i === 0 ? ' were' : ' was') + ' correct: 4 points!' : (G.team && i === 0 ? ' score 2.' : ' scores 2.'))); });
      endShake({ pts: pts, lines: lines, sols: results });
      return;
    }
    writeSolution(k, 'last', function (ok, tokens, chk) { results[k] = { ok: ok, tokens: tokens, chk: chk }; step(k + 1); });
  }
  step(0);
}

// ----- No Goal -----
function noGoalScore(ci, setter, ok) {
  var pts = {}; pts[ci] = ok ? 6 : 2; pts[setter] = ok ? 2 : 6;
  idxs().forEach(function (i) { if (i !== ci && i !== setter) pts[i] = ok ? 2 : 6; }); // a Third Party who doesn't write
  return pts;
}
function askNoGoal(setter) {
  var hs = idxs().filter(function (i) { return i !== setter && !isAI(i); });
  if (!hs.length) { newShake(); return; }
  modal('<h2>🤷 No Goal?</h2><p style="text-align:center"><b>' + esc(G.players[setter].name) + '</b> says no Goal can be made with these cubes. Does everyone agree?</p>' +
    '<div class="row"><button class="btn green" data-act="noGoalAgree">We agree: roll again</button>' +
    hs.map(function (i) { return '<button class="btn now" data-act="noGoalChallenge" data-arg="' + i + '">' + (hs.length > 1 || multiHuman() ? esc(G.players[i].name) + ': ' : '') + 'Challenge! I can make one</button>'; }).join('') + '</div>');
}
ACT.noGoal = function () {
  if (!G || G.phase !== 'goal' || isAI(G.setter)) return;
  if (G.tour && G.tour.setterBonus && window.Tourney) { Tourney.illegal(G.setter, 'noGoalBonus'); return; } // TOURNEY: IV-D-1 comment (c)
  if (G.tour && window.Tourney && Tourney.resumeSel()) return; // TOURNEY: cards first
  var setter = G.setter, ai = idxs().filter(function (i) { return i !== setter && isAI(i); })[0];
  if (ai !== undefined) {
    var o = G.players[ai].ai; G.busy = true;
    say('opp', pick(o.think)); renderGame();
    setTimeout(function () {
      var found = aiFindAnyEquation(o);
      G.busy = false;
      if (found) {
        G.goalTokens = found.goal.slice(); G.goal = found.value;
        var sols = {}; sols[ai] = { ok: true, tokens: found.sol };
        endShake({ pts: noGoalScore(ai, setter, true), lines: [esc(o.name) + ' challenged the "No Goal" call and found a Goal AND a Solution!'], sols: sols });
      } else { say('opp', 'I agree, no Goal!'); askNoGoal(setter); }
    }, 1200);
  } else askNoGoal(setter);
};
ACT.noGoalAgree = function () {
  closeModal();
  modal('<h2>🤝 Agreed!</h2><p style="text-align:center">Nobody could find a Goal, so this shake doesn\'t count. Same player rolls again!</p><div class="row"><button class="btn green" data-act="closeModal">Roll again</button></div>', function () { newShake(); });
};
ACT.noGoalChallenge = function (el) { closeModal(); humanChallengesNoGoal(+el.dataset.arg, G.setter); };
function humanChallengesNoGoal(ci, setter) {
  say('pip', esc(G.players[ci].name) + ': build a Goal, then a Solution for it, using any Resource cubes!');
  openGoalBuilder(ci, function (tokens, val) {
    tokens.forEach(function (t) { if (typeof t === 'object') G.cubes[t.id].zone = 'goal'; });
    G.goalTokens = tokens; G.goal = val; if (window.Vari) Vari.afterGoal(tokens); renderGame();
    openSolutionBuilder(ci, 'free', function (ok, sol, chk) {
      var sols = {}; sols[ci] = { ok: ok, tokens: sol, chk: chk };
      endShake({ pts: noGoalScore(ci, setter, ok), lines: [esc(G.players[ci].name) + (ok ? ' proved a Goal was possible!' : '\'s Equation wasn\'t correct, so the "No Goal" call stands.')], sols: sols });
    });
  }, true);
}

// ----- End of shake / match -----
function sampleSolution() {
  if (!G.goal) return null;
  var st = snapshot();
  var r = Eq.solve({ goal: G.goal, req: st.req, opt: st.perm, res: st.res, mode: 'impossible', fractions: G.fractions, maxDigits: 6, timeMs: 900 });
  G.sampleWild = r.found ? r.wild : null;
  G.sampleComplete = r.complete !== false; // BONUS: a search that ran out of time proves nothing (bigger searches with bonus cubes)
  return r.found ? r.tokens : null;
}
// RESULTS (round 9): one Solution as a small card (cubes, what to fix, the Explain button)
function solHTML(i, s) {
  if (!s) return '';
  var head = '<div class="rc-h">' + esc(G.players[i].name) + '\'s Solution ' + (s.ok ? '<span class="rc-tag ok">' + ico('check') + ' correct</span>' : '<span class="rc-tag try">not quite</span>');
  if (!s.tokens) return '<div class="rc-sol">' + head + '</div><p style="margin:0">No Solution written.</p></div>';
  var body = (window.Vari && Vari.on()) ? '<div class="expr vari-expr">' + Vari.exprHTML(s.tokens, G.cubes, G.fractions) + '</div>' : exprBox(s.tokens, G.cubes);
  if (!s.ok && s.chk && s.chk.reasons && s.chk.reasons.length) body += '<ul class="reasons">' + s.chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
  if (window.Explain) body += Explain.buttonHTML(s.tokens, { goal: G.goal, fractions: G.fractions, cubes: G.cubes, chk: s.chk, who: G.players[i].name + '\'s Solution' }); // EXPLAIN
  return '<div class="rc-sol' + (s.ok ? ' ok' : '') + '">' + head + '</div>' + body + '</div>';
}
// RESULTS (round 9): a player's picture for the results cards: the creature's portrait, the kid's own shirt
// (kit colour, trim and number), other people a numbered shirt in their seat colour.
function rcLight(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return false; var n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 190; }
function rcFace(i) {
  var p = G.players[i];
  if (p.ai) return avatarHTML(p.ai, 'lg');
  var sh = ['#c9342c', '#1c7ed6', '#2f9e44'][i % 3], tr = '#ffffff', num = p.jersey || String(i + 1);
  if (i === 0) { num = S.jersey || '7'; try { var k = typeof Kit !== 'undefined' && Kit.current ? Kit.current() : null; if (k && k.shirt) { sh = k.shirt; tr = k.trim || tr; } } catch (e) {} }
  return '<span class="rc-shirt' + (rcLight(sh) ? ' light' : '') + '" style="--shirt:' + sh + ';--trim:' + tr + '" aria-hidden="true">' + esc(num) + '</span>';
}
// gain: points this shake (shown as "+n this shake"); without it the tile shows the final score only
function rcSide(i, top, gain) {
  var p = G.players[i], g = gain == null ? null : gain;
  return '<div class="rc-side' + (top ? ' top' : '') + '"><div class="rc-face">' + rcFace(i) + '</div><div class="rc-name">' + esc(p.name) + '</div>' +
    '<div class="rc-score" data-count="' + p.score + '" data-from="' + (g == null ? 0 : p.score - g) + '">' + p.score + '</div>' +
    (g == null ? '' : '<div class="rc-gain"><b>+<span data-count="' + g + '">' + g + '</span></b> this shake</div>') + '</div>';
}
function rcXP() { return xpLog.length ? '<div class="xplist">' + xpLog.map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('') + '</div>' : ''; }
function endShake(r) {
  G.phase = 'over'; G.busy = false; G.carrying = false;
  G.lastShake = r; // TOURNEY: Judge Pip can explain why each Solution counted or not
  if (window.Bonus) Bonus.adjust(r); // BONUS: Twist card scoring (Golden Goal doubles, Bonus +2); never takes points away
  Snd.setMood('play');
  idxs().forEach(function (i) { var v = r.pts[i] || 0; G.players[i].score += v; G.players[i].list.push(v); });
  var best = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
  if (G.players[0].score < best) G.trailed = true;
  if (G.mode !== 'tutorial') {
    S.stats.shakes++;
    if (G.mode === 'pvp' || G.mode === 'p3' || G.mode === 'online') S.stats.pvpShakes++;
    if (G.hintUsed) S.stats.noHint = 0; else S.stats.noHint++;
    if (window.Parent) Parent.note('shake', { pts: r.pts }); // PARENT page
    checkBadges({ type: 'shake' });
    persist();
  }
  if (window.Rivals && G.mode !== 'tutorial') Rivals.note('shake', { g: G, r: r }); // RIVALS
  renderGame();
  var aiI = idxs().filter(isAI).sort(function (x, y) { return (r.pts[y] || 0) - (r.pts[x] || 0); })[0];
  if (aiI !== undefined) focusAI(aiI);
  var aiTalk = '';
  if (aiI !== undefined) {
    var ao = G.players[aiI].ai, ap = r.pts[aiI] || 0, hp = r.pts[0] || 0;
    if (ap > hp) { var gl = S.set.gloat !== false && Math.random() < 0.5; creatureMood(gl ? 'gloat' : 'happy'); aiTalk = gl ? talkLine(ao, 'gloat') : (talkLine(ao, 'kidWrong') || ''); }
    else if (ap < hp) { creatureMood(Math.random() < 0.3 ? 'cry' : 'sad'); if (Math.random() < 0.7) aiTalk = talkLine(ao, Math.random() < 0.5 ? 'kidGoodMove' : 'sore') || talkLine(ao, 'sore'); }
    // the other creature (Three at the table) reacts to its own shake, a beat later
    idxs().filter(function (i) { return isAI(i) && i !== aiI; }).forEach(function (i) {
      var p = r.pts[i] || 0, m = p > hp ? (Math.random() < 0.5 ? 'happy' : 'clap') : p < hp ? (Math.random() < 0.5 ? 'sad' : 'shrug') : null;
      if (m) setTimeout(function () { if (G && G.phase === 'over') creatureAt(i, function () { if (T3.creatureMood) T3.creatureMood(m); }); }, 350);
    });
  }
  var sample = sampleSolution();
  if (sample && r.sols) Object.keys(r.sols).forEach(function (k) { var s = r.sols[k]; if (sample && s && s.ok && s.tokens && s.tokens.map(function (x) { return typeof x === 'string' ? x : x.s; }).join('') === sample.join('')) sample = null; });
  var anyOk = r.sols && Object.keys(r.sols).some(function (k) { return r.sols[k] && r.sols[k].ok; });
  var p0 = r.pts[0] || 0, good = !isAI(0) && p0 >= 4;
  if (G.mode === 'ai' || G.mode === 'ai3' || G.mode === 'team' || G.mode === 'tourney') { if (good) { Snd.chime(); FX.confetti(70); fx3('confetti'); fx3('flash'); crowdSay('cheer'); say('pip', 'Great shake!', 'cheer'); playerMood('cheer'); } else { playerMood('clap'); Snd.boop(); crowdSay('aww'); say('pip', 'Good try! Every shake teaches your brain something new.', 'happy'); } }
  else Snd.chime();
  if (aiTalk) setTimeout(function () { if (G && G.phase === 'over') say('opp', aiTalk); }, 400);
  // RESULTS (round 9): the end-of-shake card: every side's tile (points count up once), what happened, the Solutions as
  // cubes (each with Explain), what was earned, one clear button. Same content and hooks as before (<!--replay--> below).
  var vsAI = G.mode === 'ai' || G.mode === 'ai3' || G.mode === 'team' || G.mode === 'tourney';
  var sampleHTML = sample ? '<div class="rc-sol"><div class="rc-h">' + (anyOk ? 'Another way' : 'One way that works') + '</div>' + ((window.Vari && Vari.on()) ? '<div class="expr vari-expr">' + Vari.exprHTML(sample, null, G.fractions) + '</div>' : exprBox(sample)) + '<p class="rc-eq">= ' + (Eq.rulesOf(G.fractions).multk ? (function () { var e = Eq.evaluate(sample, { fractions: G.fractions }); return e.ok ? Eq.fmt(e.value) + ' <small>(the Goal is ' + Eq.fmt(G.goal) + ': a multiple of ' + Eq.rulesOf(G.fractions).k + ' away)</small>' : Eq.fmt(G.goal); })() : Eq.fmt(G.goal)) + (G.sampleWild != null ? ' <small>(every 0 stands for ' + G.sampleWild + ')</small>' : '') + '</p>' + (window.Explain ? Explain.buttonHTML(sample, { goal: G.goal, fractions: G.fractions, wild: G.sampleWild, who: anyOk ? 'Another way' : 'One way that works' }) : '') + '</div>' : ''; // EXPLAIN
  var solsHTML = idxs().map(function (i) { return solHTML(i, r.sols && r.sols[i]); }).join('') + sampleHTML;
  var html = '<div class="rc rc-shake' + (vsAI ? (good ? ' win' : ' kind') : '') + '"><h2 class="hero">' + (vsAI ? (good ? 'Great shake!' : 'Nice try!') : 'Shake over!') + '</h2>' +
    '<div class="rc-meta">' + (G.mode === 'tutorial' ? '<span class="rc-chip">Practice</span>' : '<span class="rc-chip">Shake ' + G.shake + ' of ' + G.shakes + '</span>') + '<span class="rc-chip gold">' + ico('target') + ' Goal <b>' + (G.goal ? Eq.fmt(G.goal) : '?') + '</b></span></div>' +
    '<div class="rc-board" style="--n:' + nP() + '">' + idxs().map(function (i) { return rcSide(i, (r.pts[i] || 0) >= 4, r.pts[i] || 0); }).join('') + '</div>' +
    '<!--replay-->' +
    (r.lines.length ? '<div class="rc-lines">' + r.lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') + '</div>' : '') +
    (solsHTML ? '<div class="rc-sols">' + solsHTML + '</div>' : '') +
    (!sample && G.goal && !anyOk ? '<div class="okbox">I searched and couldn\'t find any Solution with these cubes.' + (G.sampleComplete === false ? ' <small>(I ran out of searching time, so that does not prove there is none.)</small>' : '') + '</div>' : '') + // (BONUS: not proved)
    rcXP() +
    '<div class="row"><button class="btn green big" data-act="closeModal">' + (G.shake >= G.shakes ? 'See the results' : 'Next shake') + ' ' + ico('play') + '</button></div></div>';
  var showResult = function () {
    if (!G) return;
    var rp = window.Replay ? Replay.popupHTML(r) : '';
    modal(rp ? html.replace('<!--replay-->', rp) : html, function () { drainQueue(nextShake); });
  };
  if (window.Commentary) Commentary.say('shake', { r: r });
  if (window.Replay) Replay.play(r, function () { setTimeout(showResult, 300); }); else setTimeout(showResult, 700);
}
function nextShake() {
  if (!G) return;
  if (G.shake >= G.shakes) { endMatch(); return; }
  G.shake++; G.setter = nextP(G.setter); newShake();
  if (G.shake === G.shakes && G.shakes > 1 && window.Commentary) Commentary.say('matchpoint');
}
function endMatch() {
  if (window.Commentary) { var cmTop = Math.max.apply(null, G.players.map(function (p) { return p.score; })), cmN = G.players.filter(function (p) { return p.score === cmTop; }).length, cmMe = G.players[0].score === cmTop; Commentary.say('final', { won: cmMe && cmN === 1, tie: cmMe && cmN > 1 }); }
  if (window.Parent && G.mode !== 'tutorial') Parent.note('match'); // PARENT page (reads G; peeks at Pip's review notes)
  if (window.Rivals && G.mode !== 'ai') Rivals.note('end', { g: G }); // RIVALS (Team-up, Three at the table, 3 players; one-on-one below)
  if (G.team) { Team.endMatch(); return; } // team celebration naming both teammates (js/team.js)
  if (G.tour && window.Tourney) { Tourney.endMatch(); return; } // TOURNEY: places and official match points (XII-A), the saved record
  var a = G.players[0].score, html, rcTone = ''; // (RESULTS: rcTone = the card's mood: win / tie / kind)
  if (G.mode === 'ai') {
    var b = G.players[1].score, won = a > b, tie = a === b;
    var o = G.players[1].ai, idx = G.oppIdx;
    var perfect = G.players[0].list.every(function (v) { return v >= 4; });
    S.stats.bestMatch = Math.max(S.stats.bestMatch, a);
    if (won) {
      var first = !S.beaten[idx]; S.beaten[idx] = true;
      addXP(first ? 60 : 20, first ? 'First win against ' + o.name + '!' : 'Won against ' + o.name);
      victoryFX(); Snd.fanfare(); setTimeout(Snd.crowd, 500); banner('⚽ GOOOAL!', S.name + ' wins!'); creatureMood(loseMood(o)); setTimeout(function () { if (G && G.phase === 'over') playerMood('gg'); }, 4600); /* AVATARS: a sporting "good game" after a win too */ if (Snd.motif) setTimeout(function () { if (G) Snd.motif(o.kind, 'beaten'); }, 3600); /* MUSIC: the beaten creature's little tune */ Snd.setMood('win'); if (!shot('win')) cue('win'); playerCelebrate(); fx3('confetti'); crowdSay('cheer', { wave: true }); fx3('flash'); board('GOOOAL!');
    }
    if (!won && !tie) { creatureMood('dance'); if (!shot('lose')) cue('lose'); playerMood('aw'); }
    if (tie) playerMood('clap');
    var seasonRes = window.Season ? Season.onMatch({ oppIdx: idx, you: a, them: b, won: won, tie: tie, mode: window.Cup && Cup.active() ? 'cup' : 'ai' }) : null;
    if (window.Rivals) Rivals.note('end', { g: G, season: seasonRes }); // RIVALS (before Cup.onMatchEnd, which moves the Cup round on)
    var rivalEnd = window.Rivals ? Rivals.endLine(idx, won ? 'w' : tie ? 't' : 'l') : '';
    checkBadges({ type: 'match', won: won, trailed: G.trailed, perfect: perfect, oppIdx: G.oppIdx });
    persist();
    var nextO = (idx + 1) % LEAGUE ? OPPONENTS[idx + 1] : null;
    // RESULTS (round 9): the final score as two tiles (count up once), the creature's line in its bubble, then the rest
    rcTone = won ? ' win' : tie ? ' tie' : ' kind';
    html = '<h2 class="hero">' + (won ? 'YOU WIN!' : tie ? 'It\'s a tie!' : 'Good game!') + '</h2>' +
      '<div class="rc-board final n2">' + rcSide(0, won) + '<div class="rc-vs" aria-hidden="true">VS</div>' + rcSide(1, !won && !tie) + '</div>' +
      '<div class="rc-say">' + avatarHTML(o) + '<div class="bubble">' + (rivalEnd || (won ? (Math.random() < 0.5 ? o.lose : talkLine(o, 'sore') || o.lose) : tie ? 'A tie! Let\'s play again!' : (S.set.gloat !== false ? talkLine(o, 'gloat') || o.win : o.win) + ' Want a rematch?')) + '</div></div>' +
      (won && nextO ? '<p class="rc-next">' + ico('star') + ' <b>' + esc(nextO.name) + ' ' + esc(nextO.title) + '</b> is ready to play!</p>' : '') +
      rcXP() +
      (seasonRes ? Season.lineHTML(seasonRes) : '');
    html += (window.Career && won ? Career.bossLineHTML(idx, first) : ''); // CAREER: "League conquered!"
  } else {
    var top = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
    var winners = idxs().filter(function (i) { return G.players[i].score === top; });
    var names = winners.map(function (i) { return esc(G.players[i].name); });
    victoryFX(); Snd.fanfare(); setTimeout(Snd.crowd, 500); Snd.setMood('win'); cue('win');
    banner('⚽ GOOOAL!', winners.length > 1 ? 'It\'s a tie!' : G.players[winners[0]].name + ' wins!');
    var aiI = idxs().filter(isAI).sort(function (x, y) { return G.players[y].score - G.players[x].score; })[0];
    if (aiI !== undefined) focusAI(aiI);
    if (window.Rivals && aiI !== undefined) { var rv3 = Rivals.endLine(OPPONENTS.indexOf(G.players[aiI].ai)); if (rv3) setTimeout(function () { if (G) say('opp', rv3); }, 900); } // RIVALS
    if (G.mode === 'ai3') { var sole = winners.indexOf(0) >= 0 && winners.length === 1; if (window.Trio) Trio.onMatchEnd(sole); if (sole) playerCelebrate(); else playerMood(winners.indexOf(0) >= 0 ? 'clap' : 'aw'); if (sole) { fx3('confetti'); fx3('wave'); board('GOOOAL!'); } }
    if (G.mode !== 'ai3') { if (winners.indexOf(0) >= 0 && winners.length === 1) { playerCelebrate(); mateMood('clap'); } else if (winners.indexOf(1) >= 0 && !isAI(1)) { mateMood('cheer'); playerMood('clap'); } }
    idxs().filter(isAI).forEach(function (i) {
      var m = winners.indexOf(i) >= 0 ? 'dance' : loseMood(G.players[i].ai);
      creatureAt(i, function () { if (T3.creatureMood) T3.creatureMood(m); });
    });
    if (aiI !== undefined && winners.indexOf(aiI) >= 0 && Snd.danceMusic) Snd.danceMusic(3200);   // once, even if both dance
    if (winners.indexOf(0) >= 0 && winners.length === 1) checkBadges({ type: 'match', won: true, trailed: G.trailed, perfect: G.players[0].list.every(function (v) { return v >= 4; }) });
    var order = idxs().sort(function (x, y) { return G.players[y].score - G.players[x].score; });
    rcTone = winners.indexOf(0) >= 0 || !isAI(winners[0]) ? ' win' : ' kind'; // RESULTS (round 9)
    html = '<h2 class="hero">' + (winners.length > 1 ? 'Tie: ' + names.join(' & ') + '!' : names[0] + ' wins!') + '</h2>' +
      '<div class="rc-board final" style="--n:' + nP() + '">' + order.map(function (i) { return rcSide(i, G.players[i].score === top); }).join('') + '</div>' +
      rcXP();
  }
  if (window.Social && Social.matchCard) { try { html += Social.matchCard({}); } catch (e) {} }
  if (window.Review) html += Review.slotHTML(); // REVIEW: empty spot; the button appears only if Pip found something
  var cupRow = (G.mode === 'ai' && window.Cup && Cup.active()) ? Cup.onMatchEnd({ won: won, tie: tie, you: a, them: b, oppIdx: G.oppIdx }) : '';
  html += cupRow || '<div class="row"><button class="btn green big" data-act="rematch">' + ico('play') + ' Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Menu</button></div>';
  html = '<div class="rc rc-match' + rcTone + '">' + html + '</div>'; // RESULTS (round 9): one card around everything (Season, Career, Pip's tip, Cup rows included)
  // FIREWORKS (js/replay.js): a Cup final won, a league boss beaten for the first time, a Three-at-the-table crown
  var bigWin = (G.mode === 'ai' && won && ((first && (idx + 1) % LEAGUE === 0) || /data-act="cupLift"/.test(cupRow))) || (G.mode === 'ai3' && G.trioCrown);
  var showEnd = function () { modal(html, null); if (window.Review) Review.afterMatch(); }; // REVIEW: thinks at most ~1.5 s, in small slices
  // MATCHDAY: a league boss beaten for the first time, or a new Trio crown: the lift on the podium first (a cup final
  // keeps its "Lift the trophy!" button: js/cup.js plays the cup's own lift)
  var mdBoss = G.mode === 'ai' && won && first && (idx + 1) % LEAGUE === 0 && !/data-act="cupLift"/.test(cupRow), mdCrown = G.mode === 'ai3' && G.trioCrown;
  if (window.Matchday && (mdBoss || mdCrown)) {
    var mdG = G, mdInfo = mdBoss ? { kind: 'shield', name: (typeof LEAGUE_NAMES !== 'undefined' && LEAGUE_NAMES[leagueOf(idx)]) || 'League', mark: 'No.1', color: '#ffc83d', ribbon: '#1c7ed6', line: 'You beat ' + esc(o.name) + ', the league boss!' }
      : { kind: 'crown', name: 'Crown: ' + G.players.filter(function (p) { return p.ai; }).map(function (p) { return esc(p.name); }).join(' + '), color: '#ffc83d', ribbon: '#c92a4a', line: 'First at a table of three!' };
    setTimeout(function () { if (G !== mdG) return; if (!Matchday.trophyLift(mdInfo, function () { if (G === mdG) showEnd(); })) showEnd(); }, 1800);
    return;
  }
  var fw = bigWin && window.Fireworks ? Fireworks.show({ rockets: 7 }) : '';
  if (fw === '3d') setTimeout(function () { if (G) showEnd(); }, 2600); else showEnd();
}
ACT.rematch = function () { var m = G.mode, o = G.oppIdx, cfg = G.cfg; closeModal(); drainQueue(function () { startMatch(m, o, cfg); }); };
ACT.toMenu = function () { closeModal(); mateShow(null); if (window.Commentary) Commentary.hide(); if (window.WeatherSfx) WeatherSfx.set('off'); if (Snd.ambience) Snd.ambience('off'); if (Snd.stopDance) Snd.stopDance(); if (window.Social && Social.clearBubbles) Social.clearBubbles(); drainQueue(function () { G = null; gotoTitle(); }); };

// ======================= COMPUTER PLAYER =======================
// The decisions themselves live in js/ai.js (shared with the background worker and tests/playtest.js).
// The computer thinks in the background (AIThink): the table keeps moving while it thinks. A result
// that arrives after the situation changed (the kid left, a challenge, a new shake, a cube moved) is dropped.
function applySym(st, s, zone) { return AI.applySym(st, s, zone); }
function aiViewDigits(o) { return AI.viewDigits(o); }
function aiGoalDigits(o) { return AI.goalDigits(o); }
function aiDecideChallenge(o, st, goal, fractions, nowOk, scale, strictImp) { return AI.decideChallenge(o, st, goal, fractions, nowOk, scale, strictImp); }
function aiCallsLastImpossible(o, st, goal, fractions) { return AI.callsLastImpossible(o, st, goal, fractions); }
function aiFree() { return zoneCubes('resources').filter(function (c) { return !c.locked; }).map(function (c) { return { id: c.id, s: c.s }; }); }
// Right now, on the page, without the creature's math taste (Pip's hint uses this).
function aiChooseMove(o) { return AI.chooseMove(AI.plain(o), snapshot(), aiFree(), G.goal, G.fractions); }
function aiSituation() { return { g: G, cubes: G.cubes, phase: G.phase, oc: orderCounter, ch: G.ch }; }
function aiStill(s) { return !!G && G === s.g && G.cubes === s.cubes && G.phase === s.phase && orderCounter === s.oc && G.ch === s.ch; }
// Think in the background, and take at least minMs (the creature's calm thinking pause).
function aiThink(task, args, minMs) {
  var pause = new Promise(function (ok) { setTimeout(ok, minMs || 0); });
  return Promise.all([AIThink.run(task, args), pause]).then(function (x) { return x[0]; });
}
function aiOops(e) { if (window.console) console.error('[computer player]', e); }
function tasteLine(o, kind, chance) { return o.talk && o.talk[kind] && Math.random() < chance ? talkLine(o, kind) : ''; }
function aiTurn() {
  if (!G || G.phase !== 'move' || !isAI(G.turn)) return;
  var me = G.turn, o = G.players[me].ai;
  G.wait = false; focusAI(me);
  G.busy = true; say('opp', (S.set.trash !== false && o.talk && Math.random() < 0.3) ? talkLine(o, 'trash') : pick(o.think)); creatureMood('think'); renderGame();
  var pause = 900 + Math.random() * 700;
  if (G.mode === 'tutorial') { setTimeout(function () { if (!G || G.phase !== 'move') return; tutAiMove(); }, pause); return; }
  var sit = aiSituation();
  var tArgs = [AI.skill(o), snapshot(), aiFree(), G.goal, G.fractions, G.lastMover !== null && G.lastMover !== me, !nowCheck()];
  if (G.tour && window.Tourney) tArgs.push(Tourney.mayBonus(me)); // TOURNEY: a creature that is not leading may make a bonus move first (AI.turnT)
  aiThink(G.tour && window.Tourney ? 'turnT' : 'turn', tArgs, pause).then(function (t) {
    if (!aiStill(sit) || G.turn !== me) return;
    if (t.challenge) { var d = t.challenge; G.busy = false; if (d.kind === 'now') G.aiPlan = d.plan; challenge(d.kind, me); return; }
    if (t.bonus && G.tour && G.cubes[t.bonus.id] && G.cubes[t.bonus.id].zone === 'resources') { aiBonus(me, t.bonus.id, function () { aiMoveNow(me, o, t.move); }); return; } // TOURNEY
    aiMoveNow(me, o, t.move);
  }).catch(aiOops);
}
// TOURNEY: the creature's bonus move (IV-C, V-C): one cube to Forbidden, then its normal move.
function aiBonus(me, id, then) {
  var c = G.cubes[id], g0 = G, c0 = G.cubes;
  say('opp', 'Bonus! The ' + show(c.s) + ' goes to Forbidden first.');
  var land = function () { if (!G || G !== g0 || G.cubes !== c0) return; c.zone = 'forbidden'; c.order = ++orderCounter; G.justMoved = id; G.tour.bonusBy = me; G.busy = false; G.carrying = false; renderGame(); setTimeout(function () { if (G === g0 && G.cubes === c0 && G.phase === 'move') then(); }, 500); };
  if (T3.active() && T3.creatureMove) { G.busy = true; G.carrying = true; renderGame(); if (T3.creatureUse) T3.creatureUse(aiSeat(me)); T3.creatureMove(id, 'forbidden', land); }
  else setTimeout(land, 600);
}
function aiMoveNow(me, o, mv) {
  if (!mv) return;
  { // (the normal move, as before)
    G.busy = false;
    var c = G.cubes[mv.id], yum = mv.liked ? tasteLine(o, 'tasteMove', 0.4) : '';
    G.clever = !!mv.liked;
    say('opp', 'I\'ll put the ' + show(c.s) + ' in ' + { required: 'Required', permitted: 'Permitted', forbidden: 'Forbidden' }[mv.zone] + '.' + (yum ? ' ' + yum : (S.set.bluff === true && o.talk && Math.random() < 0.35 ? ' ' + talkLine(o, 'bluff') : '')));
    aiPlace(mv.id, mv.zone, me);
  }
}
// Turn solver symbols into tokens that point at real cubes (Required first, then Permitted, then Resources)
function symsToCubeTokens(list, mode) {
  if (window.Vari && Vari.on()) return Vari.cubeTokens(list, mode); // VARIATIONS: sideways ÷ and re-used operation cubes
  var pools = zoneCubes('required').concat(zoneCubes('permitted'), (mode === 'last' ? [] : zoneCubes('resources'))), used = {};
  return list.map(function (s) {
    if (s === '(' || s === ')') return s;
    var c = pools.find(function (x) { return x.s === s && !used[x.id] && !x.locked; });
    if (!c) return { s: s, id: -1 };
    used[c.id] = 1; return { s: s, id: c.id };
  });
}
function solCtx(mode, goal, cubes, fractions) {
  cubes = cubes || G.cubes;
  return { goal: goal || G.goal, zone: function (id) { return cubes[id] ? cubes[id].zone : 'forbidden'; },
    required: cubes.filter(function (c) { return c.zone === 'required'; }).map(function (c) { return c.id; }),
    mode: mode, fractions: fractions !== undefined ? fractions : (G ? G.fractions : stageInfo().fractions), label: function (id) { return cubes[id] ? show(cubes[id].s) : '?'; } };
}
function aiWrite(pi, mode, cb) {
  var o = G.players[pi].ai; focusAI(pi);
  say('opp', esc(o.name) + ' is writing a Solution…'); renderGame(); if (T3.creatureMood) T3.creatureMood('think'); // ACTING
  var sit = aiSituation(), plan = null;
  if (mode === 'now' && G.aiPlan) { plan = G.aiPlan; G.aiPlan = null; }
  var job = plan ? new Promise(function (ok) { setTimeout(function () { ok(plan); }, 1500); }) : aiThink('write', [AI.skill(o), snapshot(), G.goal, G.fractions, mode], 1500);
  job.then(function (r) {
    if (!aiStill(sit)) return;
    if (r && r.found) {
      var toks = symsToCubeTokens(r.tokens, mode), chk = Eq.checkSolution(toks, solCtx(mode));
      var yum = chk.ok && r.liked ? (r.frac && tasteLine(o, 'tasteFrac', 0.8)) || tasteLine(o, 'tasteSol', 0.6) : '';
      say('opp', chk.ok ? (yum || 'Done!') : 'Hmm…'); cb(chk.ok, toks, chk);
    } else { say('opp', 'I… couldn\'t find one!'); cb(false, null, null); }
  }).catch(aiOops);
}
function aiSetGoal() {
  if (!G) return;
  focusAI(G.setter);
  var o = G.players[G.setter].ai, st = stageInfo(), sit = aiSituation();
  AIThink.run('chooseGoal', [AI.skill(o), aiFree(), G.fractions, st.maxGoal]).then(function (pick) {
    if (!aiStill(sit)) return;
    if (pick) {
      var toks = pick.toks;
      say('opp', (pick.liked && tasteLine(o, 'tasteGoal', 0.6)) || o.goal);
      if (T3.active() && T3.creatureMove) {
        if (T3.goalPlan) T3.goalPlan(toks);   // VARI3D: a turned Goal cube turns in the creature's hand
        var k = 0;
        (function nextG() {
          if (!G || G.cubes !== sit.cubes) return;
          if (k >= toks.length) { setGoal(toks, pick.value); return; }
          var tk = toks[k];
          if (T3.creatureUse) T3.creatureUse(aiSeat(G.setter));
          T3.creatureMove(tk.id, 'goal', function () { if (!G || G.cubes !== sit.cubes) return; G.cubes[tk.id].zone = 'goal'; G.goalTokens = toks.slice(0, k + 1); k++; renderGame(); setTimeout(nextG, 200); });
        })();
      } else setGoal(toks, pick.value);
      return;
    }
    // The computer can't find a Goal: it declares "No Goal"
    G.busy = false;
    say('opp', 'I don\'t think any Goal is possible!');
    renderGame();
    askNoGoal(G.setter);
  }).catch(aiOops);
}
// Still thinks on the page (ACT.noGoal waits for the answer); docs/handoff/brain.md has the background version.
function aiFindAnyEquation(o) { return AI.findAnyEquation(zoneCubes('resources').map(function (c) { return c.s; }), G.fractions); }

// LIGHT: one soft clunk as each floodlight tower comes on at dusk (js/three/lighting.js sends the event)
window.addEventListener('tata:floodlight', function () { if (window.Snd && Snd.thunk) Snd.thunk(); });
