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
function zoneCubes(z) { return G.cubes.filter(function (c) { return c.zone === z; }).sort(function (a, b) { return a.order - b.order; }); }
function syms(z) { return zoneCubes(z).map(function (c) { return c.s; }); }
function snapshot() { return { req: syms('required'), perm: syms('permitted'), res: syms('resources') }; }
function isAI(i) { return !!G.players[i].ai; }
function profileIdx() { return 0; } // player 0 is the owner of this device's progress

function creatureMood(m) { if (T3.creatureMood) T3.creatureMood(m); }
function setCreature(k) { if (T3.setCreature) T3.setCreature(k); }
// The computer's creature reaches over and moves the cube (3D), or it just moves (flat mat).
function aiPlace(id, zone, who) {
  if (T3.active() && T3.creatureMove) { G.busy = true; G.carrying = true; renderGame(); T3.creatureMove(id, zone, function () { if (!G) return; G.busy = false; G.carrying = false; placeCube(id, zone, who); }); }
  else placeCube(id, zone, who);
}
function startMatch(mode, oppIdx, cfg) {
  var shakes = S.set.shakes || 3;
  G = { mode: mode, oppIdx: oppIdx, cfg: cfg, shakes: shakes, shake: 1, setter: 0, players: [], trailed: false };
  G.players.push({ name: S.name, ai: null, score: 0, list: [] });
  if (mode === 'ai') G.players.push({ name: OPPONENTS[oppIdx].name, ai: OPPONENTS[oppIdx], score: 0, list: [] });
  else if (mode === 'p3') {
    G.players.push({ name: cfg.n2 || 'Tata', ai: null, score: 0, list: [] });
    if (cfg.creature >= 0) G.players.push({ name: OPPONENTS[cfg.creature].name, ai: OPPONENTS[cfg.creature], score: 0, list: [] });
    else G.players.push({ name: cfg.n3 || 'Mama', ai: null, score: 0, list: [] });
  }
  else G.players.push({ name: 'Player 2', ai: null, score: 0, list: [] });
  go('game'); Snd.setMood('play');
  var ai = firstAI();
  setCreature(ai ? ai.kind : null);
  newShake();
}
function newShake(fixedCubes) {
  var st = stageInfo();
  G.ops = st.ops.slice(); G.fractions = st.fractions;
  G.cubes = (fixedCubes || Eq.roll()).map(function (c) { return { id: c.id, color: c.color, s: c.s, zone: 'resources', order: c.id, locked: false }; });
  function lockOps() { G.cubes.forEach(function (c) { if (!Eq.isDigit(c.s) && G.ops.indexOf(c.s) < 0) { c.zone = 'forbidden'; c.locked = true; c.order = ++orderCounter; } }); }
  G.goalTokens = []; G.goal = null; G.lastMover = null; G.selected = null; G.hintUsed = false; G.turn = G.setter;
  G.busy = false; G.aiPlan = null; G.justMoved = null; G.highlight = null;
  xpLog = [];
  G.phase = 'roll'; G.rolling = true;
  cue('reset'); Snd.setMood('play');
  say('pip', 'Rolling the cubes…');
  if (T3.active()) {
    renderGame();
    T3.pour(G.cubes, function (res) {
      if (!G) return;
      if (!fixedCubes) res.forEach(function (s, i) { G.cubes[i].s = s; });
      G.rolling = false; renderGame();
      setTimeout(function () {
        if (!G) return;
        lockOps();
        if (G.cubes.some(function (c) { return c.locked; })) say('pip', '🔒 Operations you haven\'t unlocked yet go to Forbidden. Coming soon!');
        G.phase = 'goal'; renderGame(); setTimeout(function () { if (G) startGoalPhase(); }, 700);
      }, 500);
    });
  } else {
    lockOps(); renderGame(); Snd.clatter();
    setTimeout(function () { G.rolling = false; G.phase = 'goal'; startGoalPhase(); }, 1500);
  }
}
function cue(name) { if (T3.cue) T3.cue(name); }
// Read a line aloud (only when 'Read lines aloud' is on in Settings).
function speakLine(who, text) { if (S.set.voice !== true || !Snd.speak) return; var ai = who === 'opp' ? firstAI() : null; Snd.speak(text, ai ? ai.kind : 'pip'); }
function say(who, text, mood) { if (!G) return; if (!G.speech || G.speech.text !== text) speakLine(who, text); G.speech = { who: who, text: text, mood: mood || 'happy', fresh: !G.speech || G.speech.text !== text }; if (current === 'game') { var el = $('#speech'); if (el) el.outerHTML = speechHTML(); } }
function speechHTML() {
  var sp = G.speech || { who: 'pip', text: '' }, face;
  if (sp.who === 'opp' && firstAI()) face = avatarHTML(firstAI());
  else face = pipHTML(sp.mood, 54, '');
  sp.fresh = false;
  return '<div class="speech" id="speech"><div class="who">' + face + '</div><div class="txt">' + sp.text + '</div></div>';
}

function startGoalPhase() {
  var P = G.players[G.setter];
  if (P.ai) { G.busy = true; say('opp', pick(P.ai.think)); renderGame(); setTimeout(aiSetGoal, 1100); }
  else {
    if (G.mode !== 'tutorial') say('pip', (multiHuman() ? '<b>' + esc(P.name) + '</b>, you' : 'You') + ' rolled the cubes, so you set the <b>Goal</b>! Use 1 to 6 cubes. Two digit cubes side by side make a two-digit number, like 2 and 4 → 24.');
    renderGame();
  }
}

// ----- Rendering -----
function cubeHTML(c, cls, style) {
  return '<div class="cube c-' + c.color + (c.locked ? ' locked' : '') + (cls ? ' ' + cls : '') + '" data-id="' + c.id + '"' + (style ? ' style="' + style + '"' : '') + '><span>' + show(c.s) + '</span></div>';
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
    var face = p.ai ? avatarHTML(p.ai, 'sm') : (i === 0 ? '<span class="jersey">' + esc(S.jersey || '7') + '</span>' : '<span class="jersey j' + (i + 1) + '">' + (i + 1) + '</span>');
    return '<div class="pl' + (i === G.turn && G.phase === 'move' ? ' turn' + (isAI(i) ? ' opp-turn' : '') : '') + '" data-pi="' + i + '">' + face + '<b>' + esc(p.name) + '</b><span class="pts" data-v="' + p.score + '">' + p.score + '</span></div>';
  }).join('');
  var goalHTML = G.goalTokens.length ? G.goalTokens.map(function (t) { return typeof t === 'string' ? ((t === '(' || t === ')') ? '<span class="paren">' + t + '</span>' : '<div class="cube c-none"><span>' + show(t) + '</span></div>') : cubeHTML(G.cubes[t.id], t.id === G.justMoved ? 'thunk' : ''); }).join('') : '<span class="empty">' + (G.phase === 'goal' ? 'waiting for the Goal…' : '') + '</span>';
  var resHTML = resC.map(function (c, i) {
    var cls = (G.selected === c.id ? 'sel' : '') + (G.highlight === c.id ? ' hl' : '');
    if (G.rolling) return cubeHTML(c, 'tumble', '--tx:' + Math.round((Math.random() - 0.5) * 400) + 'px;--rot:' + Math.round((Math.random() - 0.5) * 1080) + 'deg;animation-delay:' + (i * 35) + 'ms');
    return cubeHTML(c, cls);
  }).join('') || '<span class="empty">empty</span>';
  if (!$('#gTop')) el.innerHTML = '<div id="gTop" class="game-top"></div><div id="gGoal"></div><div id="gMat"></div><div id="gAct" class="actionbar"></div>';
  el.classList.toggle('three', three);
  $('#gTop').innerHTML = '<button class="btn small ghost" data-act="quitGame" aria-label="Menu">' + ico('back') + '<span class="lbl">Menu</span></button><div class="scores">' + scores + '</div>' +
    '<div class="shake-no">' + (G.mode === 'tutorial' ? '<b>Practice</b>' : '<small>Shake</small><b>' + G.shake + '/' + G.shakes + '</b>') + '</div>';
  if (three) {
    $('#gGoal').innerHTML = G.goal ? '<div class="goalhud"><div class="gl">' + ico('target') + '<span>GOAL</span></div><span class="expr">' + tokensHTML(G.goalTokens, G.cubes) + '</span><span class="gv">= ' + Eq.fmt(G.goal) + '</span></div>' : '';
    T3.attach($('#gMat')); T3.sync(G);
  } else {
    $('#gGoal').innerHTML = '';
    $('#gMat').innerHTML = '<div class="mat">' +
    '<div class="zone z-goal" data-zone="goal"><h3>🎯 GOAL ' + (G.goal ? '<span class="gval">= ' + Eq.fmt(G.goal) + '</span>' : '') + '</h3><div class="cubes">' + goalHTML + '</div></div>' +
    '<div class="zrow">' + zoneHTML('required', '✅ REQUIRED', 'must use') + zoneHTML('permitted', '👍 PERMITTED', 'may use') + zoneHTML('forbidden', '⛔ FORBIDDEN', "can't use") + '</div>' +
    '<div class="zone z-res" data-zone="resources"><h3>🎲 RESOURCES <small>' + resC.length + ' left</small></h3><div class="cubes">' + resHTML + '</div></div>' +
    '</div>' ;
  }
  $('#gAct').innerHTML = speechHTML() + '<div class="acts">' + actionsHTML() + '</div>';
  G.justMoved = null;
  hudCountUp();
}
function actionsHTML() {
  if (G.phase === 'goal' && !isAI(G.setter) && !G.busy) {
    return (multiHuman() ? '<div style="width:100%;text-align:center;font-weight:800">' + esc(G.players[G.setter].name) + ' sets the Goal</div>' : '') +
      '<button class="btn big green" data-act="buildGoal">' + ico('target') + ' Build the Goal</button>' + (G.mode === 'tutorial' ? '' : '<button class="btn" data-act="noGoal">No Goal possible</button>');
  }
  if (G.phase !== 'move') return '';
  var out = '';
  if (humanTurn()) {
    var nc = nowCheck();
    out += (multiHuman() ? '<div style="width:100%;text-align:center;font-weight:800">' + esc(G.players[G.turn].name) + ': your turn!</div>' : '') +
      '<button class="btn now" data-act="callNow" data-arg="' + G.turn + '"' + (nc ? ' title="' + esc(nc) + '"' : '') + '>' + ico('bolt') + ' Now!</button>' +
      '<button class="btn imp" data-act="callImp" data-arg="' + G.turn + '">' + ico('ban') + ' Impossible!</button>' +
      (G.mode === 'tutorial' ? '' : '<button class="btn" data-act="hint">' + ico('bulb') + ' Hint</button>');
  }
  if (nP() > 2 && G.lastMover !== null && !G.carrying) {
    var others = humans().filter(function (i) { return i !== G.turn && i !== G.lastMover; });
    if (others.length) out += '<div class="also">' + others.map(function (i) {
      return '<span>' + esc(G.players[i].name) + ' can challenge too:</span><button class="btn small now" data-act="callNow" data-arg="' + i + '">' + ico('bolt') + ' Now!</button><button class="btn small imp" data-act="callImp" data-arg="' + i + '">' + ico('ban') + ' Impossible!</button>';
    }).join('') + '</div>';
  }
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
ACT.reallyQuit = function () { closeModal(); $('#builder').classList.remove('on'); G = null; TUT = null; gotoTitle(); };

ACT.cubeTap = function (el) {
  if (!G) return;
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
function doMove(id, zone) {
  var c = G.cubes[id];
  if (!humanTurn() || c.zone !== 'resources' || c.locked) return;
  if (['required', 'permitted', 'forbidden'].indexOf(zone) < 0) return;
  if (zone === 'forbidden' && zoneCubes('resources').length === 1) { say('pip', 'The very last cube can\'t go to Forbidden. Put it in <b>Required</b> or <b>Permitted</b>!', 'think'); Snd.boop(); return; }
  if (G.mode === 'tutorial' && !tutAllowMove(c, zone)) return;
  G.selected = null;
  placeCube(id, zone, G.turn);
}
function placeCube(id, zone, who) {
  var c = G.cubes[id];
  c.zone = zone; c.order = ++orderCounter; G.justMoved = id; G.highlight = null;
  G.lastMover = who;
  if (!T3.active()) Snd.thunk();
  var left = zoneCubes('resources').length;
  if (left === 0) { renderGame(); setTimeout(lastCubePlayed, 600); return; }
  G.turn = nextP(who); // play passes to the left
  if (!isAI(who)) say('pip', pick(['Nice move!', 'Good thinking!', 'Thunk! Placed.', 'Ooh, interesting!']), 'happy');
  renderGame();
  nextTurn();
}
// In a 3-player game, a computer player who is NOT next may still challenge the move that was just made.
function aiInterject() {
  if (G.mode === 'tutorial' || nP() < 3) return false;
  var cands = idxs().filter(function (i) { return isAI(i) && i !== G.lastMover && i !== G.turn; });
  for (var k = 0; k < cands.length; k++) {
    var p = cands[k], o = G.players[p].ai, st = snapshot(), base = { goal: G.goal, req: st.req, opt: st.perm, res: st.res, fractions: G.fractions, maxDigits: o.maxDigits, timeMs: o.timeMs };
    if (!nowCheckFor(p) && Math.random() < o.seeNow * 0.8) { var r = Eq.solve(Object.assign({ mode: 'now' }, base)); if (r.found) { G.aiPlan = r; challenge('now', p); return true; } }
    if (Math.random() < o.seeImp * 0.8) { var r2 = Eq.solve(Object.assign({ mode: 'impossible' }, base)); if (!r2.found && r2.complete) { challenge('impossible', p); return true; } }
  }
  return false;
}
function nextTurn() {
  if (G.phase !== 'move') return;
  if (aiInterject()) return;
  if (isAI(G.turn)) { setTimeout(aiTurn, 500); return; }
  var last = zoneCubes('resources').length === 1;
  if (G.mode === 'tutorial') { tutPrompt(); renderGame(); return; }
  var name = multiHuman() ? '<b>' + esc(G.players[G.turn].name) + '</b>, your' : 'Your';
  if (last) say('pip', name + ' turn. Only ONE cube left! Move it to <b>Required</b> or <b>Permitted</b>, or call <b>Impossible!</b> if no Solution can be made.', 'think');
  else say('pip', name + ' turn! Tap a Resource cube, then tap a section. Or, if you spot something, challenge: <b>Now!</b> or <b>Impossible!</b>');
  renderGame();
}
ACT.buildGoal = function () {
  if (!G || G.phase !== 'goal' || isAI(G.setter)) return;
  openGoalBuilder(G.setter, function (tokens, val) { setGoal(tokens, val); });
};
function setGoal(tokens, val) {
  tokens.forEach(function (t) { if (typeof t === 'object') { G.cubes[t.id].zone = 'goal'; G.cubes[t.id].order = ++orderCounter; } });
  G.goalTokens = tokens; G.goal = val; G.lastMover = G.setter; G.turn = nextP(G.setter); G.phase = 'move'; G.busy = false;
  Snd.thunk(); Snd.chime();
  if (!isAI(G.setter) && G.setter === 0 && G.mode !== 'tutorial') { S.stats.goalsSet++; checkBadges({ type: 'goal' }); }
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
  if (!canChallengeNowish(p)) return;
  var why = nowCheckFor(p);
  if (why) { say('pip', why, 'think'); Snd.boop(); return; }
  if (G.mode === 'tutorial' && !tutAllowChallenge('now')) return;
  challenge('now', p);
};
ACT.callImp = function (el) {
  var p = challengerFrom(el);
  if (!G || G.phase !== 'move') return;
  if (G.lastMover === null || G.lastMover === p) { say('pip', 'There is no move to challenge yet.'); return; }
  if (!canChallengeNowish(p)) return;
  if (G.mode === 'tutorial' && !tutAllowChallenge('impossible')) return;
  challenge('impossible', p);
};
ACT.hint = function () {
  if (!humanTurn()) return;
  G.hintUsed = true;
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
  var mover = G.lastMover;
  G.phase = 'challenge'; G.ch = { kind: kind, challenger: who, mover: mover, tp: thirdOf(who, mover) }; G.selected = null; G.busy = false;
  banner(kind === 'now' ? '⚡ NOW!' : '🚫 IMPOSSIBLE!', G.players[who].name + ' challenges!');
  if (isAI(who)) creatureMood('challenge');
  Snd.slam(); Snd.setMood('challenge'); cue('challenge');
  if (isAI(who)) say('opp', kind === 'now' ? G.players[who].ai.now : G.players[who].ai.imp);
  else say('pip', kind === 'now' ? esc(G.players[who].name) + ' says Now! and must write a Solution using the mat plus at most ONE Resource cube.' : 'Impossible! Now ' + esc(G.players[mover].name) + ' must try to write a Solution.', 'cheer');
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
  if (isAI(pi)) aiWrite(pi, mode, cb);
  else if (multiHuman()) passTo(pi, mode, function () { openSolutionBuilder(pi, mode, cb); });
  else openSolutionBuilder(pi, mode, cb);
}
function passTo(pi, mode, then) {
  modal('<h2 class="hero">Pass to ' + esc(G.players[pi].name) + '</h2><p style="text-align:center">' + esc(G.players[pi].name) + ', it\'s your turn to write a Solution.' + (mode === 'last' || nP() > 2 ? ' No peeking, everybody else!' : '') + '</p><div class="row"><button class="btn green big" data-act="closeModal">I\'m ready!</button></div>', then);
}
// After a challenge in a 3-player game, the Third Party MAY also write a Solution.
function askThirdParty(tp, kind, cb) {
  if (isAI(tp)) {
    var o = G.players[tp].ai;
    say('opp', esc(o.name) + ' is deciding whether to write a Solution too…'); renderGame();
    setTimeout(function () {
      var st = snapshot(), r = Eq.solve({ goal: G.goal, req: st.req, opt: st.perm, res: st.res, mode: kind === 'last' ? 'free' : kind, fractions: G.fractions, maxDigits: o.maxDigits, timeMs: o.timeMs });
      if (r.found && Math.random() < o.smart + 0.15) {
        var toks = symsToCubeTokens(r.tokens, kind), chk = Eq.checkSolution(toks, solCtx(kind));
        say('opp', 'I wrote one too!'); cb({ presented: true, ok: chk.ok, tokens: toks, chk: chk });
      } else { say('opp', 'I\'ll sit this one out.'); cb({ presented: false }); }
    }, 1300);
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
  var ch = G.ch, lines = [], pts = scoreChallenge(ch.kind, ch.challenger, ch.mover, ch.tp, ok, tpRes);
  var cn = esc(G.players[ch.challenger].name), mn = esc(G.players[ch.mover].name);
  if (ch.kind === 'now') lines.push(ok ? cn + ' called <b>Now!</b> and wrote a correct Solution.' : cn + ' called <b>Now!</b> but the Solution wasn\'t correct.');
  else lines.push(ok ? cn + ' called <b>Impossible!</b>, but ' + mn + ' found a Solution!' : cn + ' called <b>Impossible!</b> and ' + mn + ' couldn\'t write a correct Solution.');
  if (ch.tp !== null) {
    var tn = esc(G.players[ch.tp].name);
    lines.push(tpRes && tpRes.presented ? tn + ' (Third Party) also wrote a Solution: ' + (tpRes.ok ? 'correct!' : 'not correct.') : tn + ' (Third Party) didn\'t write one.');
  }
  if (!isAI(0) && G.mode !== 'tutorial') {
    if (ch.challenger === 0) {
      S.stats.challenges++;
      var won = pts[0] === 6;
      if (won) { S.stats.challengeWins++; if (ch.kind === 'now') { S.stats.nowWins++; addXP(25, 'Correct Now! challenge'); } else { S.stats.impWins++; addXP(30, 'Correct Impossible! call'); addStar(); } }
      checkBadges({ type: 'challenge', kind: ch.kind, won: won });
    } else if (ch.mover === 0 && pts[0] === 6 && ch.kind === 'now') addXP(15, 'Clever move: their Now! failed');
    else if (ch.tp === 0 && pts[0] >= 4) addXP(15, 'Smart Third Party play');
  }
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
    var p = ais[0], o = G.players[p].ai, st = snapshot();
    say('opp', pick(o.think)); renderGame();
    setTimeout(function () {
      var r = Eq.solve({ goal: G.goal, req: st.req, opt: st.perm, res: [], mode: 'free', fractions: G.fractions, maxDigits: o.maxDigits, timeMs: o.timeMs });
      if (!r.found && Math.random() < o.seeImp) { G.lastMover = mover; challenge('impossible', p); }
      else askHumans();
    }, 1200);
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
      idxs().forEach(function (i) { pts[i] = results[i].ok ? 4 : 2; lines.push(esc(G.players[i].name) + (results[i].ok ? ' was correct: 4 points!' : ' scores 2.')); });
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
    G.goalTokens = tokens; G.goal = val; renderGame();
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
  return r.found ? r.tokens : null;
}
function solHTML(i, s) {
  if (!s) return '';
  var head = '<b>' + esc(G.players[i].name) + '\'s Solution:</b> ' + (s.ok ? '<span style="color:var(--good)">' + ico('check') + ' correct</span>' : '<span style="color:var(--mute)">not quite</span>');
  if (!s.tokens) return '<p>' + head + ' (no Solution written)</p>';
  var body = exprBox(s.tokens, G.cubes);
  if (!s.ok && s.chk && s.chk.reasons && s.chk.reasons.length) body += '<ul class="reasons">' + s.chk.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
  return '<div style="margin:8px 0">' + head + body + '</div>';
}
function endShake(r) {
  G.phase = 'over'; G.busy = false; G.carrying = false;
  Snd.setMood('play');
  idxs().forEach(function (i) { var v = r.pts[i] || 0; G.players[i].score += v; G.players[i].list.push(v); });
  var best = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
  if (G.players[0].score < best) G.trailed = true;
  if (G.mode !== 'tutorial') {
    S.stats.shakes++;
    if (G.mode === 'pvp' || G.mode === 'p3') S.stats.pvpShakes++;
    if (G.hintUsed) S.stats.noHint = 0; else S.stats.noHint++;
    checkBadges({ type: 'shake' });
    persist();
  }
  renderGame();
  var aiI = idxs().filter(isAI)[0];
  if (aiI !== undefined) creatureMood((r.pts[aiI] || 0) > (r.pts[0] || 0) ? 'happy' : (r.pts[aiI] || 0) < (r.pts[0] || 0) ? 'sad' : null);
  var sample = sampleSolution();
  if (sample && r.sols) Object.keys(r.sols).forEach(function (k) { var s = r.sols[k]; if (sample && s && s.ok && s.tokens && s.tokens.map(function (x) { return typeof x === 'string' ? x : x.s; }).join('') === sample.join('')) sample = null; });
  var anyOk = r.sols && Object.keys(r.sols).some(function (k) { return r.sols[k] && r.sols[k].ok; });
  var p0 = r.pts[0] || 0, good = !isAI(0) && p0 >= 4;
  if (G.mode === 'ai') { if (good) { Snd.chime(); FX.confetti(70); say('pip', 'Great shake!', 'cheer'); } else { Snd.boop(); say('pip', 'Good try! Every shake teaches your brain something new.', 'happy'); } }
  else Snd.chime();
  var html = '<h2 class="hero">' + (G.mode === 'ai' ? (good ? 'Great shake!' : 'Nice try!') : 'Shake over!') + '</h2>' +
    '<div style="text-align:center;font-size:18px">Goal: <b>' + (G.goal ? Eq.fmt(G.goal) : '?') + '</b></div>' +
    r.lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') +
    idxs().map(function (i) { return solHTML(i, r.sols && r.sols[i]); }).join('') +
    (sample ? '<p><b>' + (anyOk ? 'Another way' : 'One way that works') + ':</b></p>' + exprBox(sample) + '<p style="text-align:center;font-weight:800">= ' + Eq.fmt(G.goal) + '</p>' :
      (G.goal && !anyOk ? '<div class="okbox">I searched and couldn\'t find any Solution with these cubes.</div>' : '')) +
    idxs().map(function (i) { return '<div class="score-line' + ((r.pts[i] || 0) >= 4 ? ' win' : '') + '"><span>' + esc(G.players[i].name) + '</span><span class="p">+' + (r.pts[i] || 0) + ' → ' + G.players[i].score + '</span></div>'; }).join('') +
    (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '') +
    '<div class="row" style="margin-top:12px"><button class="btn green big" data-act="closeModal">' + (G.shake >= G.shakes ? 'See the results' : 'Next shake') + ' ' + ico('play') + '</button></div>';
  setTimeout(function () { modal(html, function () { drainQueue(nextShake); }); }, 700);
}
function nextShake() {
  if (!G) return;
  if (G.shake >= G.shakes) { endMatch(); return; }
  G.shake++; G.setter = nextP(G.setter); newShake();
}
function endMatch() {
  var a = G.players[0].score, html;
  if (G.mode === 'ai') {
    var b = G.players[1].score, won = a > b, tie = a === b;
    var o = G.players[1].ai, idx = G.oppIdx;
    var perfect = G.players[0].list.every(function (v) { return v >= 4; });
    S.stats.bestMatch = Math.max(S.stats.bestMatch, a);
    if (won) {
      var first = !S.beaten[idx]; S.beaten[idx] = true;
      addXP(first ? 60 : 20, first ? 'First win against ' + o.name + '!' : 'Won against ' + o.name);
      victoryFX(); Snd.fanfare(); setTimeout(Snd.crowd, 500); banner('⚽ GOOOAL!', S.name + ' wins!'); creatureMood('sad'); Snd.setMood('win'); cue('win');
    }
    if (!won && !tie) { creatureMood('happy'); cue('lose'); }
    checkBadges({ type: 'match', won: won, trailed: G.trailed, perfect: perfect });
    persist();
    var nextO = OPPONENTS[idx + 1];
    html = '<h2 class="hero">' + (won ? 'YOU WIN!' : tie ? 'It\'s a tie!' : 'Good game!') + '</h2>' +
      '<div class="row">' + avatarHTML(o, 'lg') + '<div class="bubble">' + (won ? o.lose : tie ? 'A tie! Let\'s play again!' : o.win + ' Want a rematch?') + '</div></div>' +
      '<div class="score-line"><span>' + esc(G.players[0].name) + '</span><span class="p">' + a + '</span></div><div class="score-line"><span>' + esc(o.name) + '</span><span class="p">' + b + '</span></div>' +
      (won && nextO ? '<p style="text-align:center">' + ico('star') + ' <b>' + esc(nextO.name) + ' ' + esc(nextO.title) + '</b> is ready to play!</p>' : '') +
      (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '');
  } else {
    var top = Math.max.apply(null, G.players.map(function (p) { return p.score; }));
    var winners = idxs().filter(function (i) { return G.players[i].score === top; });
    var names = winners.map(function (i) { return esc(G.players[i].name); });
    victoryFX(); Snd.fanfare(); setTimeout(Snd.crowd, 500); Snd.setMood('win'); cue('win');
    banner('⚽ GOOOAL!', winners.length > 1 ? 'It\'s a tie!' : G.players[winners[0]].name + ' wins!');
    var aiI = idxs().filter(isAI)[0];
    if (aiI !== undefined) creatureMood(winners.indexOf(aiI) >= 0 ? 'happy' : 'sad');
    if (winners.indexOf(0) >= 0 && winners.length === 1) checkBadges({ type: 'match', won: true, trailed: G.trailed, perfect: G.players[0].list.every(function (v) { return v >= 4; }) });
    var order = idxs().sort(function (x, y) { return G.players[y].score - G.players[x].score; });
    html = '<h2 class="hero">' + (winners.length > 1 ? 'Tie: ' + names.join(' & ') + '!' : names[0] + ' wins!') + '</h2>' +
      order.map(function (i) { return '<div class="score-line' + (G.players[i].score === top ? ' win' : '') + '"><span>' + (G.players[i].score === top ? ico('trophy') + ' ' : '') + esc(G.players[i].name) + '</span><span class="p">' + G.players[i].score + '</span></div>'; }).join('') +
      (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '');
  }
  html += '<div class="row" style="margin-top:12px"><button class="btn green" data-act="rematch">Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Menu</button></div>';
  modal(html, null);
}
ACT.rematch = function () { var m = G.mode, o = G.oppIdx, cfg = G.cfg; closeModal(); drainQueue(function () { startMatch(m, o, cfg); }); };
ACT.toMenu = function () { closeModal(); drainQueue(function () { G = null; gotoTitle(); }); };

// ======================= COMPUTER PLAYER =======================
function applySym(st, s, zone) {
  var res = st.res.slice(), i = res.indexOf(s); res.splice(i, 1);
  var o = { req: st.req.slice(), perm: st.perm.slice(), res: res };
  if (zone === 'required') o.req.push(s); else if (zone === 'permitted') o.perm.push(s);
  return o;
}
function aiChooseMove(o) {
  var st = snapshot(), res = zoneCubes('resources').filter(function (c) { return !c.locked; });
  if (!res.length) return null;
  var base = { goal: G.goal, fractions: G.fractions, maxDigits: o.maxDigits, timeMs: 90 };
  function possible(after) { return Eq.solve(Object.assign({ req: after.req, opt: after.perm, res: after.res, mode: 'impossible' }, base)).found; }
  if (res.length === 1) {
    var c = res[0], zr = possible(applySym(st, c.s, 'required')), zp = possible(applySym(st, c.s, 'permitted'));
    return { id: c.id, zone: zr && (!zp || Math.random() < 0.5) ? 'required' : 'permitted' };
  }
  var bySym = {}; res.forEach(function (c) { if (!bySym[c.s]) bySym[c.s] = c; });
  var cands = [];
  Object.keys(bySym).forEach(function (s) { ['forbidden', 'permitted', 'required'].forEach(function (z) { cands.push({ id: bySym[s].id, s: s, zone: z, w: Math.random() + (z === 'forbidden' ? 0.35 : 0) }); }); });
  cands.sort(function (a, b) { return b.w - a.w; });
  if (Math.random() > o.smart) return cands[0]; // a casual (not-so-careful) move
  var fallback = null, t0 = Date.now();
  for (var i = 0; i < cands.length && i < 8; i++) {
    var cd = cands[i], after = applySym(st, cd.s, cd.zone);
    if (!possible(after)) continue;
    if (!fallback) fallback = cd;
    var nowable = after.res.length >= 2 && (after.req.length + after.perm.length) > 0 &&
      Eq.solve(Object.assign({ req: after.req, opt: after.perm, res: after.res, mode: 'now' }, base, { maxDigits: Math.min(6, o.maxDigits + 1) })).found;
    if (!nowable) return cd;
    if (Date.now() - t0 > 900) break;
  }
  return fallback || cands[0];
}
function aiTurn() {
  if (!G || G.phase !== 'move' || !isAI(G.turn)) return;
  var me = G.turn, o = G.players[me].ai;
  G.busy = true; say('opp', pick(o.think)); creatureMood('think'); renderGame();
  setTimeout(function () {
    if (!G || G.phase !== 'move') return;
    if (G.mode === 'tutorial') { tutAiMove(); return; }
    var st = snapshot(), base = { goal: G.goal, req: st.req, opt: st.perm, res: st.res, fractions: G.fractions, maxDigits: o.maxDigits, timeMs: o.timeMs };
    if (G.lastMover !== null && G.lastMover !== me) {
      if (!nowCheck() && Math.random() < o.seeNow) {
        var r = Eq.solve(Object.assign({ mode: 'now' }, base));
        if (r.found) { G.busy = false; G.aiPlan = r; challenge('now', me); return; }
      }
      if (Math.random() < o.seeImp) {
        var r2 = Eq.solve(Object.assign({ mode: 'impossible' }, base));
        if (!r2.found && (r2.complete || Math.random() < 0.3)) { G.busy = false; challenge('impossible', me); return; }
      }
    }
    var mv = aiChooseMove(o);
    G.busy = false;
    var c = G.cubes[mv.id];
    say('opp', 'I\'ll put the ' + show(c.s) + ' in ' + { required: 'Required', permitted: 'Permitted', forbidden: 'Forbidden' }[mv.zone] + '.');
    aiPlace(mv.id, mv.zone, me);
  }, 900 + Math.random() * 700);
}
// Turn solver symbols into tokens that point at real cubes (Required first, then Permitted, then Resources)
function symsToCubeTokens(list, mode) {
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
  var o = G.players[pi].ai;
  say('opp', esc(o.name) + ' is writing a Solution…'); renderGame();
  setTimeout(function () {
    var st = snapshot(), r = null;
    if (mode === 'now' && G.aiPlan) { r = G.aiPlan; G.aiPlan = null; }
    else r = Eq.solve({ goal: G.goal, req: st.req, opt: st.perm, res: mode === 'last' ? [] : st.res, mode: mode === 'last' ? 'free' : mode, fractions: G.fractions, maxDigits: Math.min(6, o.maxDigits + 1), timeMs: o.timeMs * 2 });
    if (r && r.found) {
      var toks = symsToCubeTokens(r.tokens, mode), chk = Eq.checkSolution(toks, solCtx(mode));
      say('opp', chk.ok ? 'Done!' : 'Hmm…'); cb(chk.ok, toks, chk);
    } else { say('opp', 'I… couldn\'t find one!'); cb(false, null, null); }
  }, 1500);
}
function aiSetGoal() {
  if (!G) return;
  var o = G.players[G.setter].ai, st = stageInfo();
  var free = zoneCubes('resources');
  var ideas = Eq.goalIdeas(free.map(function (c) { return c.s; }), { fractions: G.fractions }).filter(function (g) {
    return g.value.d === 1 && g.value.n >= 1 && g.value.n <= Math.min(o.goalMax, st.maxGoal) && g.tokens.length <= o.goalCubes;
  });
  shuffle(ideas);
  if (o.goalCubes > 1) ideas.sort(function (a, b) { return (b.tokens.length - a.tokens.length) + (Math.random() - 0.5) * 2.2; });
  var t0 = Date.now();
  for (var i = 0; i < ideas.length && i < 30 && Date.now() - t0 < 1000; i++) {
    var g = ideas[i], rest = free.map(function (c) { return c.s; });
    g.tokens.forEach(function (s) { rest.splice(rest.indexOf(s), 1); });
    var r = Eq.solve({ goal: g.value, req: [], opt: rest, mode: 'free', fractions: G.fractions, maxDigits: 3, timeMs: 60 });
    if (r.found) {
      var used = {}, toks = g.tokens.map(function (s) { var c = free.find(function (x) { return x.s === s && !used[x.id]; }); used[c.id] = 1; return { s: s, id: c.id }; });
      say('opp', o.goal);
      if (T3.active() && T3.creatureMove) {
        var k = 0;
        (function nextG() {
          if (!G) return;
          if (k >= toks.length) { setGoal(toks, g.value); return; }
          var tk = toks[k];
          T3.creatureMove(tk.id, 'goal', function () { if (!G) return; G.cubes[tk.id].zone = 'goal'; G.goalTokens = toks.slice(0, k + 1); k++; renderGame(); setTimeout(nextG, 200); });
        })();
      } else setGoal(toks, g.value);
      return;
    }
  }
  // The computer can't find a Goal: it declares "No Goal"
  G.busy = false;
  say('opp', 'I don\'t think any Goal is possible!');
  renderGame();
  askNoGoal(G.setter);
}
function aiFindAnyEquation(o) {
  var free = zoneCubes('resources').map(function (c) { return c.s; });
  var ideas = shuffle(Eq.goalIdeas(free, { fractions: G.fractions }).filter(function (g) { return g.value.d === 1; }));
  var t0 = Date.now();
  for (var i = 0; i < ideas.length && Date.now() - t0 < 1500; i++) {
    var rest = free.slice(); ideas[i].tokens.forEach(function (s) { rest.splice(rest.indexOf(s), 1); });
    var r = Eq.solve({ goal: ideas[i].value, req: [], opt: rest, mode: 'free', fractions: G.fractions, maxDigits: 4, timeMs: 80 });
    if (r.found) return { goal: ideas[i].tokens, value: ideas[i].value, sol: r.tokens };
  }
  return null;
}
