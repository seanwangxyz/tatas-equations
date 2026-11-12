'use strict';
// ======================= TEAM-UP VS THE BOSS =======================
// The kid and a grown-up (Tata, Mama...) play on ONE side, on one device, against one creature.
// The game stays a normal two-sided game: G.players[0] is the team (one shared score), G.players[1]
// is the creature, and the official two-player scoring is used unchanged. This file only adds:
//   - who inside the team takes the team's turn (they alternate: G.team.cur),
//   - who called a challenge ("Who spotted it?") and who holds the pencil for a Solution,
//   - the setup pop-up, the HUD badge, the team bar, XP, and the end-of-match celebration.
// House rules are written out in docs/handoff/team.md.
//
// Hooks in js/game.js (each one line, all guarded by `G.team`):
//   startMatch   -> Team.setup(G, oppIdx, cfg)       renderGame -> Team.hudHTML / Team.barHTML
//   placeCube, nextTurn -> Team.sync()               nextTurn   -> Team.yourName()
//   writeSolution -> Team.write(mode, cb)            challenge  -> Team.callerName / Team.writerName
//   resolveChallenge -> Team.challengeXP / Team.challengeLines     endMatch -> Team.endMatch()
// Plus, from this file: ACT.callNow / ACT.callImp / ACT.lastImp are wrapped to ask "Who spotted it?",
// and openGoalBuilder is wrapped to put the teammate's name on the Goal builder.
var Team = (function () {
  function T() { return G && G.team; }
  function on() { return !!T(); }
  function nm(k) { return T().names[k]; }
  function jerseyHTML(k, cls) { var t = T(); return '<span class="jersey' + (k === 1 ? ' j2' : '') + (cls ? ' ' + cls : '') + '">' + esc(t.jerseys[k]) + '</span>'; }
  function both() { return nm(0) + ' & ' + nm(1); }

  // The strongest creature he has unlocked (most stars, then most fire; later ones win ties).
  function strongest() {
    var best = 0, sc = -1;
    OPPONENTS.forEach(function (o, i) { if (!oppOpen(i)) return; var v = (o.stars || 0) * 10 + (o.fire || 0); if (v >= sc) { sc = v; best = i; } });
    return best;
  }

  // ---------- Match start ----------
  function setup(g, oppIdx, cfg) {
    cfg = cfg || {};
    g.team = { names: [S.name, cfg.mate || 'Tata'], jerseys: [S.jersey || '7', cfg.mjersey || '10'], cur: 0, lastBy: null, caller: null, wrote: null, seen: -1 };
    g.players[0].name = g.team.names[0] + ' & ' + g.team.names[1];
    var o = OPPONENTS[oppIdx];
    g.players.push({ name: o.name, ai: o, score: 0, list: [] });
  }

  // ---------- Whose go inside the team ----------
  // Called after every move. When the team has just moved (a cube or the Goal), the other teammate is up next.
  // orderCounter goes up on every move, so the same move is never counted twice.
  function sync() {
    var t = T(); if (!t) return;
    if (G.lastMover === 0 && t.seen !== orderCounter) { t.seen = orderCounter; t.lastBy = t.cur; t.cur = 1 - t.cur; }
  }
  function yourName() { return '<b>' + esc(nm(T().cur)) + '</b>, your'; }
  function callerName() { var t = T(); return nm(t.caller != null ? t.caller : t.cur); }
  function writerFor(mode) {
    var t = T(), ch = G.ch;
    if (mode === 'now' && ch && ch.challenger === 0 && t.caller != null) return t.caller;     // you spotted it, you write it
    if (mode === 'impossible' && ch && ch.mover === 0 && t.lastBy != null) return t.lastBy;    // you made the move, you defend it
    return t.cur;                                                                               // last cube: whoever is up next
  }
  function writerName() { return nm(writerFor(G.ch ? G.ch.kind : 'last')); }

  // ---------- HUD ----------
  function hudHTML(p, isTurn) {
    sync(); // a render can come before nextTurn (e.g. right after the Goal is set)
    var t = T(), up = (G.phase === 'move' && G.turn === 0) || (G.phase === 'goal' && G.setter === 0) ? t.cur : -1;
    return '<div class="pl team-pl' + (isTurn ? ' turn' : '') + '" data-pi="0" data-go="' + esc(nm(t.cur)) + '\'s go">' +
      '<span class="tm-js">' + jerseyHTML(0, up === 0 ? 'tm-on' : up === 1 ? 'tm-off' : '') + jerseyHTML(1, up === 1 ? 'tm-on' : up === 0 ? 'tm-off' : '') + '</span>' +
      '<span class="tm-nm"><small>' + ico('people') + ' Team</small><b>' + esc(p.name) + '</b></span>' +
      '<span class="pts" data-v="' + p.score + '">' + p.score + '</span></div>';
  }
  function barHTML() {
    var t = T(), k = t.cur, line = '';
    if (G.phase === 'goal' && G.setter === 0 && !G.busy) line = jerseyHTML(k, 'tm-on') + ' <span><b>' + esc(nm(k)) + '</b> sets the Goal for the team</span>';
    else if (G.phase === 'move' && G.turn === 0 && !G.busy && !G.carrying) line = jerseyHTML(k, 'tm-on') + ' <span><b>' + esc(nm(k)) + '</b>\'s turn for the team. ' + esc(nm(1 - k)) + ' can help! Either of you can call a challenge.</span>';
    else if (G.phase === 'move' && G.turn !== 0) line = '<span>Next for the team: <b>' + esc(nm(k)) + '</b></span> ' + jerseyHTML(k);
    return line ? '<div class="teambar">' + line + '</div>' : '';
  }

  // ---------- "Who spotted it?" ----------
  var pending = null;
  function askWho(kind, go, canCancel) {
    pending = go;
    modal('<h2 class="hero">' + (kind === 'now' ? ico('bolt') + ' Now!' : ico('ban') + ' Impossible!') + '</h2>' +
      '<p style="text-align:center;font-size:19px"><b>Who spotted it?</b>' + (kind === 'now' ? '<br><small>That player writes the team\'s Solution.</small>' : '') + '</p>' +
      '<div class="row tm-who">' + [0, 1].map(function (k) { return '<button class="btn big ' + (k ? 'blue' : 'green') + '" data-act="teamWho" data-arg="' + k + '">' + jerseyHTML(k) + ' ' + esc(nm(k)) + '</button>'; }).join('') + '</div>' +
      (canCancel ? '<div class="row"><button class="btn small" data-act="teamWhoCancel">Oops, never mind</button></div>' : ''));
  }
  ACT.teamWho = function (el) { var go = pending; pending = null; if (!G || !G.team || !go) { closeModal(); return; } G.team.caller = +el.dataset.arg; closeModal(); go(); };
  ACT.teamWhoCancel = function () { pending = null; closeModal(); };
  function wrapCall(name, kind) {
    var orig = ACT[name];
    ACT[name] = function (el) {
      if (!on() || challengerFrom(el) !== 0) return orig(el);
      // Let the normal checks speak first ("no move to challenge yet", "Now! needs..."), so we never ask for nothing.
      if (!canChallengeNowish(0) || (kind === 'now' && nowCheckFor(0))) return orig(el);
      askWho(kind, function () { orig({ dataset: { arg: '0' } }); }, true);
    };
  }
  wrapCall('callNow', 'now'); wrapCall('callImp', 'impossible');
  var origLastImp = ACT.lastImp;
  ACT.lastImp = function (el) {
    if (!on() || +el.dataset.arg !== 0) return origLastImp(el);
    closeModal(); askWho('impossible', function () { challenge('impossible', 0); }, false);
  };

  // The Goal builder shows the name of the teammate who sets it.
  if (typeof openGoalBuilder === 'function') {
    var origGoalB = openGoalBuilder;
    openGoalBuilder = function (pi, onDone, noCancel) {
      origGoalB(pi, onDone, noCancel);
      if (on() && pi === 0 && B && !noCancel) { B.title = esc(nm(T().cur)) + ': Build the Goal for the team'; renderBuilder(); }
    };
  }

  // ---------- Writing a Solution for the team ----------
  // ONE Solution per team. The writer holds the device; the teammate may help with ideas.
  // If the writer taps "I can't find one" (nothing checked yet), the pencil can go to the teammate once.
  function write(mode, cb) {
    var t = T(), first = writerFor(mode), tried = {};
    function ready(k) {
      tried[k] = true;
      modal('<h2 class="hero">' + ico('pencil') + ' ' + esc(nm(k)) + ' writes it</h2>' +
        '<div class="row">' + jerseyHTML(k, 'tm-big') + '</div>' +
        '<p style="text-align:center">' + esc(nm(k)) + ' holds the pencil and taps the cubes. ' + esc(nm(1 - k)) + ', you can help with ideas!</p>' +
        '<div class="row"><button class="btn green big" data-act="closeModal">Ready!</button></div>', function () { open(k); });
    }
    function done(k, ok, tokens, chk) {
      if (!G || !G.team) return;
      if (!tokens && !tried[1 - k]) {
        pendingHand = { yes: function () { ready(1 - k); }, no: function () { t.wrote = k; cb(ok, tokens, chk); } };
        modal('<h2 class="hero">Pass the pencil?</h2><p style="text-align:center">' + esc(nm(k)) + ' couldn\'t find one. That\'s OK! Do you want <b>' + esc(nm(1 - k)) + '</b> to have a go? The team still writes just one Solution.</p>' +
          '<div class="row"><button class="btn green" data-act="teamHandYes">' + jerseyHTML(1 - k) + ' ' + esc(nm(1 - k)) + ' tries</button><button class="btn" data-act="teamHandNo">We\'re done</button></div>');
        return;
      }
      t.wrote = k; cb(ok, tokens, chk);
    }
    function open(k) {
      if (!G || !G.team) return;
      openSolutionBuilder(0, mode, function (ok, tokens, chk) { done(k, ok, tokens, chk); });
      if (!B) return;
      B.title = esc(nm(k)) + ': ' + B.title;
      if (k !== 0) {
        // The teammate's Solution is the team's, but it doesn't go into the kid's own stats, stars or streaks.
        B.onDone = function (tokens, gaveUp) {
          var chk = tokens ? Eq.checkSolution(tokens, solCtx(mode)) : null;
          done(k, !!(chk && chk.ok), tokens, chk || { reasons: [gaveUp ? 'No Solution was written.' : 'No Solution.'] });
        };
      }
      renderBuilder();
    }
    ready(first);
  }
  var pendingHand = null;
  ACT.teamHandYes = function () { var h = pendingHand; pendingHand = null; closeModal(); if (h) h.yes(); };
  ACT.teamHandNo = function () { var h = pendingHand; pendingHand = null; closeModal(); if (h) h.no(); };

  // ---------- Challenge results ----------
  function challengeLines(ch, ok, lines) {
    var t = T(), bits = [];
    if (ch.challenger === 0 && t.caller != null) bits.push(esc(nm(t.caller)) + ' made the ' + (ch.kind === 'now' ? 'Now!' : 'Impossible!') + ' call');
    var wroteForTeam = (ch.kind === 'now' && ch.challenger === 0) || (ch.kind === 'impossible' && ch.mover === 0);
    if (wroteForTeam && t.wrote != null) bits.push(esc(nm(t.wrote)) + ' wrote the team\'s Solution');
    if (bits.length) lines.push(ico('people') + ' ' + bits.join(', ') + '. The points go to the whole team!');
    // A challenge on the team's turn uses up that turn too, so the other teammate starts next time.
    if (ch.challenger === 0 && G.turn === 0) t.cur = 1 - t.cur;
  }
  // XP for the kid (player 0 on this device). His own skill earns the normal amounts;
  // a correct call by his teammate earns a small Teamwork bonus. Solution XP comes from the builder (kid only).
  function challengeXP(ch, pts) {
    var t = T();
    if (ch.challenger === 0) {
      var won = pts[0] === 6;
      if (t.caller === 0) {
        S.stats.challenges++;
        if (won) { S.stats.challengeWins++; if (ch.kind === 'now') { S.stats.nowWins++; addXP(25, 'Correct Now! challenge'); } else { S.stats.impWins++; addXP(30, 'Correct Impossible! call'); addStar(); } }
        checkBadges({ type: 'challenge', kind: ch.kind, won: won });
      } else if (won) addXP(10, 'Teamwork: ' + nm(1) + '\'s great call');
    } else if (ch.mover === 0 && pts[0] === 6 && ch.kind === 'now' && t.lastBy === 0) addXP(15, 'Clever move: their Now! failed');
  }

  // ---------- End of match ----------
  function endMatch() {
    var t = T(), a = G.players[0].score, b = G.players[1].score, won = a > b, tie = a === b;
    var o = G.players[1].ai, idx = G.oppIdx, html;
    if (!S.teamWins) S.teamWins = {};
    if (won) {
      var first = !S.teamWins[idx]; S.teamWins[idx] = (S.teamWins[idx] || 0) + 1;
      addXP(first ? 40 : 15, first ? 'First team win against ' + o.name + '!' : 'Team win against ' + o.name);
      victoryFX(); Snd.fanfare(); setTimeout(Snd.crowd, 500); banner('⚽ GOOOAL!', both() + ' win!'); creatureMood(loseMood(o)); Snd.setMood('win');
      if (!shot('win')) cue('win'); playerMood('cheer'); fx3('confetti'); fx3('wave'); fx3('flash'); board('GOOOAL!');
    } else if (!tie) { creatureMood('dance'); if (!shot('lose')) cue('lose'); playerMood('aw'); }
    else playerMood('clap');
    persist();
    var sayO = won ? (Math.random() < 0.5 ? o.lose : talkLine(o, 'sore') || o.lose) : tie ? 'A tie! Let\'s play again!' : o.win + ' Want a rematch?';
    html = '<h2 class="hero">' + (won ? 'TEAM WIN!' : tie ? 'It\'s a tie!' : 'Good game, team!') + '</h2>' +
      '<div class="tm-end' + (won ? ' won' : '') + '">' + jerseyHTML(0, 'tm-big') + '<span class="tm-amp">&amp;</span>' + jerseyHTML(1, 'tm-big') + '</div>' +
      '<p class="tm-endline">' + (won ? '<b>' + esc(nm(0)) + '</b> and <b>' + esc(nm(1)) + '</b> beat ' + esc(o.name) + ' together!' :
        tie ? esc(nm(0)) + ' and ' + esc(nm(1)) + ' drew with ' + esc(o.name) + '.' : esc(nm(0)) + ' and ' + esc(nm(1)) + ' played as a team. ' + esc(o.name) + ' won this time.') + '</p>' +
      '<div class="row">' + avatarHTML(o, 'lg') + '<div class="bubble">' + sayO + '</div></div>' +
      '<div class="score-line' + (won ? ' win' : '') + '"><span>' + (won ? ico('trophy') + ' ' : '') + ico('people') + ' ' + esc(G.players[0].name) + '</span><span class="p">' + a + '</span></div>' +
      '<div class="score-line' + (!won && !tie ? ' win' : '') + '"><span>' + esc(o.name) + '</span><span class="p">' + b + '</span></div>' +
      (xpLog.length ? '<div class="xplist">' + xpLog.map(esc).join('<br>') + '</div>' : '');
    // Player of the Match card only when the team won or tied (on a loss it would crown the creature).
    if ((won || tie) && window.Social && Social.matchCard) { try { html += Social.matchCard({}); } catch (e) {} }
    html += '<div class="row" style="margin-top:12px"><button class="btn green" data-act="rematch">Play again</button><button class="btn" data-act="toMenu">' + ico('home') + ' Menu</button></div>';
    modal(html, null);
  }

  // ---------- Setup (opponent picker) ----------
  function setupCardHTML() {
    return '<div class="opp mode" data-act="playTeam"><span class="avatar lg tm-card-av">' + ico('people') + '</span><h3>Team-up</h3><div class="otitle">You and a grown-up on the same team against one tough creature</div></div>';
  }
  var pickBoss = 0;
  ACT.playTeam = function () {
    var c = S.team || {};
    pickBoss = (c.boss != null && oppOpen(c.boss)) ? c.boss : strongest();
    var bosses = OPPONENTS.map(function (o, i) {
      if (!oppOpen(i)) return '';
      return '<button class="tm-boss' + (i === pickBoss ? ' on' : '') + '" data-act="teamBoss" data-arg="' + i + '">' + avatarHTML(o, 'sm') + '<b>' + esc(o.name) + '</b><span class="stars">' + oppStars(o) + '</span></button>';
    }).join('');
    modal('<h2 class="hero">Team-up vs the boss</h2>' +
      '<div class="setrow"><label>Player 1</label><b>' + esc(S.name) + '</b> <span class="jersey">' + esc(S.jersey || '7') + '</span></div>' +
      '<div class="setrow"><label>Teammate</label><input type="text" id="tmName" maxlength="14" value="' + esc(c.mate || 'Tata') + '"></div>' +
      '<div class="setrow"><label>Teammate\'s jersey</label><input type="text" id="tmJersey" maxlength="2" style="width:70px" value="' + esc(c.mjersey || '10') + '"></div>' +
      '<h3 style="margin:10px 0 6px">The boss</h3><div class="tm-bosses">' + bosses + '</div>' +
      '<ul class="tm-rules"><li>One team, one score: every point is shared.</li><li>You take turns moving for the team.</li><li>Either of you can call <b>Now!</b> or <b>Impossible!</b></li><li>One of you writes the Solution, the other can help.</li></ul>' +
      '<div class="row"><button class="btn green big" data-act="startTeam">' + ico('play') + ' Kick off!</button><button class="btn" data-act="closeModal">Cancel</button></div>');
  };
  ACT.teamBoss = function (el) {
    pickBoss = +el.dataset.arg;
    Array.prototype.forEach.call(document.querySelectorAll('.tm-boss'), function (b) { b.classList.toggle('on', b === el); });
    Snd.click();
  };
  ACT.startTeam = function () {
    var mate = ($('#tmName').value || '').trim().slice(0, 14) || 'Tata';
    var mj = ($('#tmJersey').value || '').replace(/[^0-9]/g, '').slice(0, 2) || '10';
    S.team = { mate: mate, mjersey: mj, boss: pickBoss }; persist();
    closeModal(); startMatch('team', pickBoss, S.team);
  };

  return { on: on, setup: setup, sync: sync, yourName: yourName, callerName: callerName, writerName: writerName, hudHTML: hudHTML, barHTML: barHTML,
    write: write, challengeLines: challengeLines, challengeXP: challengeXP, endMatch: endMatch, setupCardHTML: setupCardHTML, strongest: strongest };
})();
