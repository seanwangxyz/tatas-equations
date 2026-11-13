'use strict';
// ======================= CUP TOURNAMENTS =======================
// Three matches in a row against rising opponents (quarter-final, semi-final, final), then a trophy lift.
// Losing or tying a round never knocks you out: you just have another go at that round, as often as
// you like. A cup in progress is saved (S.cups.run) and can be resumed or left at any time, no penalty.
//
// Inert until wired: it needs js/game.js loaded first (startMatch, ACT) and one hook in endMatch().
// See docs/handoff/cup.md. Everything optional (T3, Snd.*, FX, Social, drainQueue, addXP) is feature-detected.
//
// Public API:
//   Cup.open()            show the cup screen (resumes the saved cup if there is one)
//   Cup.active()          true while the CURRENT match G is a cup round
//   Cup.onMatchEnd(r)     r = {won, tie, you, them, oppIdx}; records the round, returns HTML for the result
//                         pop-up's button row (replaces Play again / Menu)
//   Cup.setupHTML()       a "Cups" section for the opponent picker (renderSetup)
//   Cup.trophyHTML()      the cup shelf for the Trophy Room (renderTrophies)
//   Cup.trophySVG(id, px) a trophy picture
//   Cup.CUPS, Cup.isOpen(cupOrId), Cup.state()
var Cup = (function () {
  // Opponent indexes (js/config.js OPPONENTS): 0 Snoozy*, 1 Penny**, 2 Rusty***, 3 Ollie****, 4 Mondo*****,
  // 5 Grub***, 6 Splosh****, 7 Blaze*****, 8 Hex*****+, 9 Messy (id zog)*****++
  // CAREER: 10 Bleep, 11 Flip, 12 Squiggle, 13 Nugget, 14 Chroma (Legend League, each with a signature rule)
  var CUPS = [
    { id: 'kickoff', name: 'Kick-off Cup', blurb: 'Your first cup! Three friendly matches.', opps: [0, 1, 5],
      metal: ['#ffe0b8', '#e39a52', '#9a5a1f'], ribbon: '#2f8cff', xpFirst: 100, xpAgain: 25,
      open: function () { return true; }, lockText: '' },
    { id: 'creature', name: 'Creature Cup', blurb: 'Rusty, Ollie and Mondo. The classic creatures at their best.', opps: [2, 3, 4],
      metal: ['#ffffff', '#c7d0dc', '#7d8898'], ribbon: '#22b573', xpFirst: 150, xpAgain: 30,
      open: function () { return oppOk(2); }, lockText: 'Beat Penny to open this cup.' },
    { id: 'monster', name: 'Monster Cup', blurb: 'Splosh, Blaze and Hex. The Monster League\'s tough ones.', opps: [6, 7, 8],
      metal: ['#e9ffd6', '#7fd35a', '#2f7a2a'], ribbon: '#7a3cf0', xpFirst: 200, xpAgain: 40,
      open: function () { return oppOk(6); }, lockText: 'Beat Grub to open this cup.' },
    { id: 'champions', name: 'Champions Cup', blurb: 'Mondo, Hex and King Messy. Only the very best!', opps: [4, 8, 9],
      metal: ['#fff7c2', '#ffc83d', '#c98a00'], ribbon: '#ef4565', xpFirst: 300, xpAgain: 50,
      open: function () { return beat(4) || beat(7) || wins('creature') > 0 || wins('monster') > 0; }, lockText: 'Beat Mondo or Blaze to open this cup.' },
    // CAREER: the Legend League's cup (each round brings that creature's special rule, js/career.js)
    { id: 'legend', name: 'Legend Cup', blurb: 'Flip, Squiggle and Nugget, with all their special rules!', opps: [11, 12, 13],
      metal: ['#e3fafc', '#66d9e8', '#0b7285'], ribbon: '#fab005', xpFirst: 350, xpAgain: 60,
      open: function () { return oppOk(11); }, lockText: 'Beat Bleep to open this cup.' }
  ];
  var ROUNDS = ['Quarter-final', 'Semi-final', 'Final'];
  var playing = null;   // the G object of the cup match in progress (in memory only)
  var lifting = null;   // {id, first, xp, count, opps} while the trophy lift is on screen
  var uid = 0;

  // ---------- small safe helpers ----------
  function has(name) { return typeof window[name] === 'function'; }
  function snd(name) { try { if (typeof Snd !== 'undefined' && Snd && typeof Snd[name] === 'function') return Snd[name].apply(Snd, [].slice.call(arguments, 1)); } catch (e) {} }
  function E(s) { return has('esc') ? esc(s) : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function I(name) { return has('ico') ? ico(name) : ''; }
  function q(sel) { return document.querySelector(sel); }
  function opp(i) { return (typeof OPPONENTS !== 'undefined' && OPPONENTS[i]) || { name: '?', title: '', emoji: '?', color: '#eee', stars: 0 }; }
  function face(i, cls) { var o = opp(i); return has('avatarHTML') ? avatarHTML(o, cls) : '<span class="avatar ' + (cls || '') + '">' + o.emoji + '</span>'; }
  function oppOk(i) { return has('oppOpen') ? oppOpen(i) : true; }
  function beat(i) { return !!(typeof S !== 'undefined' && S.beaten && S.beaten[i]); }
  function stars(i) { var o = opp(i); return has('oppStars') ? oppStars(o) : '★'.repeat(o.stars || 0); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function save() { if (has('persist')) persist(); }
  function dayStr() { if (has('today')) return today(); var d = new Date(); return d.toISOString().slice(0, 10); }
  function byId(id) { for (var i = 0; i < CUPS.length; i++) if (CUPS[i].id === id) return CUPS[i]; return null; }
  function coachBox(text, mood) {
    var pip = has('pipHTML') ? pipHTML(mood || 'happy', 70, '') : '';
    return '<div class="panel cup-coach"><div class="row">' + pip + '<div class="bubble">' + text + '</div></div></div>';
  }

  // ---------- saved data: S.cups = {run, won: {cupId: n}, list: [{id, date, first}]} ----------
  function state() {
    if (typeof S === 'undefined') return { run: null, won: {}, list: [] };
    var c = S.cups;
    if (!c || typeof c !== 'object' || Array.isArray(c)) c = S.cups = { run: null, won: {}, list: [] };
    if (!c.won || typeof c.won !== 'object') c.won = {};
    if (!Array.isArray(c.list)) c.list = [];
    if (c.run && (!byId(c.run.id) || !(c.run.round >= 0 && c.run.round <= 2))) c.run = null;
    if (c.run && !Array.isArray(c.run.scores)) c.run.scores = [null, null, null];
    return c;
  }
  function wins(id) { return (state().won[id] || 0); }
  function isOpen(c) { c = typeof c === 'string' ? byId(c) : c; if (!c) return false; try { return !!c.open(); } catch (e) { return false; } }

  // ---------- leaving a match screen the way ACT.toMenu does ----------
  function tidyMatch() {
    snd('ambience', 'off'); snd('stopDance');
    try { if (window.Social && Social.clearBubbles) Social.clearBubbles(); } catch (e) {}
    playing = null;
    if (typeof G !== 'undefined') G = null;
  }
  function afterQueue(fn) { if (has('drainQueue')) drainQueue(fn); else fn(); }
  function screen() {
    var el = q('#cup');
    if (!el) { // create the screen if index.html does not have one yet
      el = document.createElement('section'); el.id = 'cup'; el.className = 'screen';
      var anchor = q('#builder'); if (anchor) document.body.insertBefore(el, anchor); else document.body.appendChild(el);
    }
    return el;
  }
  function goCup() { screen(); if (has('go')) go('cup'); snd('setMood', 'menu'); }

  // ---------- the trophy picture ----------
  function trophySVG(id, px, locked) {
    var c = byId(id) || CUPS[0], k = 'cupg' + (++uid), m = locked ? ['#eef1f7', '#c4cad6', '#8d95a6'] : c.metal, rib = locked ? '#aeb5c2' : c.ribbon;
    px = px || 120;
    return '<svg class="cup-trophy' + (locked ? ' off' : '') + '" viewBox="0 0 120 150" width="' + px + '" height="' + Math.round(px * 1.25) + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + k + '" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="' + m[1] + '"/><stop offset=".28" stop-color="' + m[0] + '"/><stop offset=".62" stop-color="' + m[1] + '"/><stop offset="1" stop-color="' + m[2] + '"/></linearGradient>' +
      '<linearGradient id="' + k + 'b" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5b3a22"/><stop offset="1" stop-color="#2e1c10"/></linearGradient></defs>' +
      // ribbons hanging from the handles
      '<path d="M22 44 L14 92 L22 86 L28 96 L32 50 Z" fill="' + rib + '" opacity=".95"/><path d="M98 44 L106 92 L98 86 L92 96 L88 50 Z" fill="' + rib + '" opacity=".95"/>' +
      // handles
      '<path d="M32 26 C10 26 10 64 40 66" fill="none" stroke="url(#' + k + ')" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="M88 26 C110 26 110 64 80 66" fill="none" stroke="url(#' + k + ')" stroke-width="8" stroke-linecap="round"/>' +
      // bowl, rim, shine
      '<path d="M28 18 H92 V44 C92 70 76 84 60 86 C44 84 28 70 28 44 Z" fill="url(#' + k + ')" stroke="' + m[2] + '" stroke-width="2"/>' +
      '<ellipse cx="60" cy="18" rx="32" ry="6" fill="' + m[0] + '" stroke="' + m[2] + '" stroke-width="2"/>' +
      '<path d="M38 26 C38 50 42 64 50 74" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".45"/>' +
      // a football on the front
      '<circle cx="62" cy="46" r="13" fill="#fff" stroke="#1d2340" stroke-width="2"/>' +
      '<path d="M62 39.5 L68.2 44 L65.8 51.3 H58.2 L55.8 44 Z" fill="#1d2340"/>' +
      '<path d="M62 33 V39.5 M68.2 44 L74.6 41.6 M65.8 51.3 L69.6 57 M58.2 51.3 L54.4 57 M55.8 44 L49.4 41.6" stroke="#1d2340" stroke-width="1.8" fill="none"/>' +
      // stem, knot, base, name plate
      '<rect x="54" y="85" width="12" height="16" fill="url(#' + k + ')"/>' +
      '<ellipse cx="60" cy="102" rx="16" ry="5" fill="url(#' + k + ')" stroke="' + m[2] + '" stroke-width="1.5"/>' +
      '<path d="M36 112 H84 L90 140 H30 Z" fill="url(#' + k + 'b)"/>' +
      '<rect x="40" y="119" width="40" height="12" rx="3" fill="url(#' + k + ')"/>' +
      '<rect x="30" y="139" width="60" height="6" rx="2" fill="#24160c"/>' +
      '</svg>';
  }

  // ---------- screens ----------
  function open() { state(); if (lifting) { renderLift(); goCup(); return; } if (state().run) renderBracket(); else renderList(); goCup(); }

  function header(title, back) {
    return '<div class="hdr"><button class="btn small" data-act="' + back + '">' + I('back') + ' Back</button><h2>' + I('trophy') + ' ' + title + '</h2></div>';
  }
  function renderList() {
    var st = state(), run = st.run;
    var cards = CUPS.map(function (c) {
      var ok = isOpen(c), n = st.won[c.id] || 0, here = run && run.id === c.id;
      return '<div class="opp cup-card' + (ok ? '' : ' lock') + (here ? ' here' : '') + '" data-act="' + (ok ? 'cupPick' : 'cupLocked') + '" data-arg="' + c.id + '">' +
        (n ? '<span class="done">' + I('check') + '</span>' : '') + trophySVG(c.id, 74, !ok) +
        '<h3>' + E(c.name) + '</h3>' +
        '<div class="cup-faces">' + c.opps.map(function (i) { return face(i, 'sm'); }).join('') + '</div>' +
        '<div class="otitle">' + E(c.blurb) + '</div>' +
        (here ? '<div class="cup-chip next">' + ROUNDS[run.round] + ' next!</div>' : n ? '<div class="cup-chip won">Won ' + (n === 1 ? 'once' : n + ' times') + '</div>' : '') +
        (ok ? '' : '<div class="lockbadge">' + I('lock') + ' ' + E(c.lockText) + '</div>') + '</div>';
    }).join('');
    var msg = run ? 'You\'re playing the <b>' + E(byId(run.id).name) + '</b>. Tap it to carry on!' :
      'Pick a cup! Win three matches in a row to lift the trophy. If a match doesn\'t go your way, just have another go. You can never be knocked out!';
    screen().innerHTML = header('Cups', 'setup') + coachBox(msg) + '<div class="panel" style="margin-top:12px"><div class="opps cup-list">' + cards + '</div></div>';
  }

  function renderBracket() {
    var st = state(), run = st.run; if (!run) { renderList(); return; }
    var c = byId(run.id), nextI = c.opps[run.round], nextName = E(opp(nextI).name);
    var steps = c.opps.map(function (oi, r) {
      var done = r < run.round, now = r === run.round, sc = run.scores[r];
      return '<div class="cup-step' + (done ? ' done' : now ? ' now' : ' later') + '">' +
        '<div class="cup-round">' + ROUNDS[r] + '</div>' + face(oi, 'lg') +
        '<b class="cup-name">' + E(opp(oi).name) + '</b><div class="stars">' + stars(oi) + '</div>' +
        (done ? '<div class="cup-chip won">' + I('check') + ' Won' + (sc ? ' ' + sc[0] + '–' + sc[1] : '') + '</div>' :
          now ? '<div class="cup-chip next">Next match!</div>' : '<div class="cup-chip">To come</div>') + '</div>';
    }).join('<div class="cup-link" aria-hidden="true"></div>');
    steps += '<div class="cup-link" aria-hidden="true"></div><div class="cup-step prize"><div class="cup-round">Trophy</div>' + trophySVG(c.id, 84, true) + '<b class="cup-name">' + E(c.name) + '</b></div>';
    var msg;
    if (run.last === 'lost') msg = 'Good try! You\'re still in the cup. Have another go against <b>' + nextName + '</b> whenever you like.';
    else if (run.last === 'tie') msg = 'A tie! In a cup, a tie means the round is played again. Ready for another go against <b>' + nextName + '</b>?';
    else if (run.round === 0) msg = 'Welcome to the <b>' + E(c.name) + '</b>! Win three matches in a row to lift the trophy. First up: <b>' + nextName + '</b>!';
    else if (run.round === 1) msg = 'You\'re in the <b>semi-final</b>! Next up: <b>' + nextName + '</b>.';
    else msg = 'It\'s the <b>FINAL</b>! Beat <b>' + nextName + '</b> to lift the ' + E(c.name) + '!';
    var tip = opp(nextI).tip ? '<p class="cup-tip">' + I('bulb') + ' Tip: ' + E(opp(nextI).tip) + '</p>' : '';
    screen().innerHTML = header(E(c.name), 'cupList') + coachBox(msg, run.last ? 'happy' : 'cheer') +
      '<div class="panel cup-panel" style="margin-top:12px"><div class="cup-bracket">' + steps + '</div>' + tip +
      '<div class="row cup-play" style="margin-top:14px"><button class="btn big green" data-act="cupPlay">' + I('play') + ' Play the ' + ROUNDS[run.round].toLowerCase() + '</button></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn small" data-act="cupLeave">Leave this cup</button></div></div>';
  }

  function renderLift() {
    var L = lifting; if (!L) { renderList(); return; }
    var c = byId(L.id), name = typeof S !== 'undefined' ? S.name : '';
    var jersey = typeof S !== 'undefined' ? (S.jersey || '7') : '7';
    screen().innerHTML = '<div class="cup-lift">' +
      '<div class="cup-lift-title">CHAMPIONS!</div>' +
      '<div class="cup-lift-stage"><div class="cup-lift-glow" aria-hidden="true"></div><div class="cup-lift-trophy">' + trophySVG(c.id, 170) + '</div>' +
      '<div class="cup-lift-player"><span class="jersey">' + E(jersey) + '</span><b>' + E(name) + '</b></div></div>' +
      '<div class="panel cup-lift-panel"><h2 class="hero">You won the ' + E(c.name) + '!</h2>' +
      '<div class="cup-faces big">' + L.opps.map(function (i) { return face(i, ''); }).join('') + '</div>' +
      '<p style="text-align:center">You beat ' + L.opps.map(function (i) { return '<b>' + E(opp(i).name) + '</b>'; }).join(', ').replace(/, ([^,]*)$/, ' and $1') + '.</p>' +
      '<p style="text-align:center">' + (L.first ? 'Your very first ' + E(c.name) + '! It\'s on your shelf in the Trophy Room now.' : 'That\'s your ' + ord(L.count) + ' ' + E(c.name) + '!') + '</p>' +
      (L.xp ? '<div class="xplist">+' + L.xp + ' XP · ' + (L.first ? 'First ' : '') + E(c.name) + '</div>' : '') +
      '<div class="row" style="margin-top:12px"><button class="btn green big" data-act="cupLiftDone">' + I('trophy') + ' Back to the cups</button></div></div></div>';
  }

  function celebrate() {
    if (has('victoryFX')) victoryFX(); else if (typeof FX !== 'undefined' && FX.confetti) FX.confetti(160);
    snd('fanfare'); setTimeout(function () { snd('crowd'); snd('crowdReact', 'cheer'); }, 500);
    setTimeout(function () { snd('crowdReact', 'chant'); }, 1800);
    setTimeout(function () { if (typeof FX !== 'undefined' && FX.burst) { var t = q('.cup-lift-trophy'); if (t) { var r = t.getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top + r.height * 0.3, 90); } } }, 900);
  }

  // ---------- playing a round ----------
  function playRound() {
    var run = state().run; if (!run) { open(); return; }
    if (!has('startMatch')) return;
    var oi = byId(run.id).opps[run.round];
    run.last = null; save(); // the bracket message is about the last FINISHED match
    var go = function () {
      startMatch('ai', oi, { sigSeen: true }); // (CAREER: sigSeen = the signature screen was already shown, js/career.js)
      playing = (typeof G !== 'undefined') ? G : null;
      if (playing) playing.cup = { id: run.id, round: run.round };
    };
    // CAREER: a creature with a signature rule announces it first (one screen), then the round starts
    if (window.Career && Career.announce(oi, go)) return;
    go();
  }
  function active() { return !!(playing && typeof G !== 'undefined' && G === playing && state().run); }

  // Called from endMatch() in js/game.js. Returns HTML for the pop-up's button row.
  function onMatchEnd(r) {
    var st = state(), run = st.run, me = playing; playing = null;
    if (!run || !me || !me.cup || me.cup.id !== run.id || me.cup.round !== run.round) return '';
    var c = byId(run.id), round = run.round, oi = c.opps[round];
    if (r && r.oppIdx != null && r.oppIdx !== oi) return '';
    var row = function (msg, btns) { return '<div class="cup-result">' + I('trophy') + ' <span>' + msg + '</span></div><div class="row" style="margin-top:12px">' + btns + '</div>'; };
    var toBracket = '<button class="btn" data-act="cupBracket">' + I('trophy') + ' Back to the cup</button>';
    if (r.won) {
      run.scores[round] = [r.you, r.them]; run.last = null;
      if (round < 2) {
        run.round++; save();
        return row(ROUNDS[round] + ' won! Next: the <b>' + ROUNDS[run.round].toLowerCase() + '</b> against <b>' + E(opp(c.opps[run.round]).name) + '</b>.',
          '<button class="btn green" data-act="cupNext">' + I('play') + ' Next round</button>' + toBracket);
      }
      // the final is won: the trophy is saved right now, the lift is only the celebration
      var first = !st.won[c.id];
      st.won[c.id] = (st.won[c.id] || 0) + 1;
      st.list.push({ id: c.id, date: dayStr(), first: first });
      st.run = null;
      var xp = first ? c.xpFirst : c.xpAgain;
      if (has('addXP')) addXP(xp, (first ? 'First ' : '') + c.name + '!');
      lifting = { id: c.id, first: first, xp: xp, count: st.won[c.id], opps: c.opps.slice() };
      if (has('checkBadges')) checkBadges({ type: 'cup', cup: c.id, first: first, count: st.won[c.id] });
      save();
      return row('You won the final! The <b>' + E(c.name) + '</b> is yours!', '<button class="btn green big" data-act="cupLift">' + I('trophy') + ' Lift the trophy!</button>');
    }
    run.last = r.tie ? 'tie' : 'lost'; run.tries = (run.tries || 0) + 1; save();
    if (r.tie) return row('A tie! In a cup the round is played again.', '<button class="btn green" data-act="cupRetry">' + I('play') + ' Replay the round</button>' + toBracket);
    return row('You\'re still in the cup! Have another go at the ' + ROUNDS[round].toLowerCase() + ' whenever you like.', '<button class="btn green" data-act="cupRetry">' + I('play') + ' Try again</button>' + toBracket);
  }

  // ---------- pieces for other screens ----------
  function setupHTML() {
    var run = state().run, sub = run ? E(byId(run.id).name) + ': ' + ROUNDS[run.round].toLowerCase() + ' next!' : 'Win 3 matches in a row and lift a trophy!';
    return '<h3 class="tierh">' + I('trophy') + ' Cups</h3><div class="opps"><div class="opp mode cup-entry" data-act="cup">' +
      '<span class="avatar lg" style="background:#fff3bf">' + trophySVG(run ? run.id : 'kickoff', 52) + '</span><h3>Cup Tournaments</h3><div class="otitle">' + sub + '</div></div></div>';
  }
  function trophyHTML() {
    var st = state(), got = CUPS.filter(function (c) { return st.won[c.id]; }).length;
    return '<h3 class="tierh">' + I('trophy') + ' Cup Trophies<small>' + got + ' / ' + CUPS.length + '</small></h3><div class="cup-shelf">' + CUPS.map(function (c) {
      var n = st.won[c.id] || 0, firstOne = null;
      for (var i = 0; i < st.list.length; i++) if (st.list[i].id === c.id) { firstOne = st.list[i]; break; }
      return '<div class="cup-shelf-it' + (n ? '' : ' off') + '">' + trophySVG(c.id, 70, !n) + '<b>' + (n ? E(c.name) : '???') + '</b><small>' +
        (n ? (n > 1 ? 'Won ' + n + ' times' : 'Won') + (firstOne ? ' · first on ' + E(firstOne.date) : '') : (isOpen(c) ? 'Win this cup to put it here.' : E(c.lockText))) + '</small></div>';
    }).join('') + '</div>';
  }

  // ---------- tap handlers ----------
  if (typeof ACT !== 'undefined') {
    ACT.cup = function () { open(); };
    ACT.cupList = function () { renderList(); goCup(); };
    ACT.cupPick = function (el) {
      var id = el.dataset.arg, c = byId(id), st = state(); if (!c || !isOpen(c)) return;
      snd('pop');
      if (st.run && st.run.id === id) { renderBracket(); return; }
      if (st.run) {
        var cur = byId(st.run.id);
        if (has('modal')) { modal('<h2 class="hero">Switch cups?</h2><p style="text-align:center">You\'re in the <b>' + ROUNDS[st.run.round].toLowerCase() + '</b> of the <b>' + E(cur.name) + '</b>. Leave it and start the <b>' + E(c.name) + '</b>? You can start any cup again whenever you like.</p>' +
          '<div class="row"><button class="btn green" data-act="cupSwitch" data-arg="' + id + '">Start the ' + E(c.name) + '</button><button class="btn" data-act="closeModal">Keep playing ' + E(cur.name) + '</button></div>'); return; }
      }
      st.run = { id: id, round: 0, scores: [null, null, null], tries: 0, last: null, started: dayStr() }; save(); renderBracket();
    };
    ACT.cupSwitch = function (el) { var st = state(); st.run = null; if (has('closeModal')) closeModal(); ACT.cupPick(el); };
    ACT.cupLocked = function (el) {
      var c = byId(el.dataset.arg); snd('boop');
      if (c && has('modal')) modal('<h2 class="hero">Not yet!</h2><div style="text-align:center">' + trophySVG(c.id, 70, true) + '</div><p style="text-align:center">' + E(c.lockText) + '</p><div class="row"><button class="btn" data-act="closeModal">OK</button></div>');
    };
    ACT.cupPlay = function () { playRound(); };
    ACT.cupLeave = function () {
      var run = state().run; if (!run || !has('modal')) { state().run = null; save(); renderList(); return; }
      modal('<h2 class="hero">Leave the ' + E(byId(run.id).name) + '?</h2><p style="text-align:center">That\'s OK! Nothing is lost, and you can start this cup again whenever you like.</p>' +
        '<div class="row"><button class="btn" data-act="cupLeaveYes">Leave the cup</button><button class="btn green" data-act="closeModal">Stay in the cup</button></div>');
    };
    ACT.cupLeaveYes = function () { state().run = null; save(); if (has('closeModal')) closeModal(); renderList(); };
    // from the end-of-match pop-up
    ACT.cupNext = function () { if (has('closeModal')) closeModal(); afterQueue(playRound); };
    ACT.cupRetry = ACT.cupNext;
    ACT.cupBracket = function () { if (has('closeModal')) closeModal(); afterQueue(function () { tidyMatch(); open(); }); };
    ACT.cupLift = function () {
      if (has('closeModal')) closeModal();
      tidyMatch(); renderLift(); goCup(); snd('setMood', 'win'); celebrate();
    };
    ACT.cupLiftDone = function () { lifting = null; snd('setMood', 'menu'); afterQueue(function () { renderList(); goCup(); }); };
  }

  return { CUPS: CUPS, ROUNDS: ROUNDS, open: open, active: active, onMatchEnd: onMatchEnd, setupHTML: setupHTML, trophyHTML: trophyHTML,
    trophySVG: trophySVG, isOpen: isOpen, state: state };
})();
