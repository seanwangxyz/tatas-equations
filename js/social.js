'use strict';
// ======================= SOCIAL: emotes, comic bubbles, VS screen, Player of the Match =======================
// Safe to load before it is wired: nothing runs until one of these is called. Optional game APIs (T3, Snd, G, S,
// avatarHTML, pipHTML, ico...) are feature-tested, never assumed. Everything is one-shot: nothing loops or bounces.
//
//   Social.emoteBar()                  HTML for the row of emote chips (put it in #gAct)
//   ACT.emote                          tap handler for a chip (data-act="emote" data-arg="<emoteId>")
//   Social.onEmote(id)                 the creature answers after a short beat
//   Social.reactionFor(id, opp?)       { line, mood }  mood: nod|laugh|gasp|shrug|wave|clap|gloat|sad
//   Social.moodHook                    optional function(mood) the lead sets, e.g. maps to T3.creatureMood
//   Social.bubble(who, text, opts?)    comic bubble over the 3D table ('opp' | 'kid')
//   Social.clearBubbles()              remove bubbles now (call when leaving the game screen)
//   Social.vsScreen(players, done)     2.2 s broadcast intro, skippable, done() fires exactly once
//   Social.matchCard(summary?)         HTML for the end-of-match award card
var Social = (function () {
  var reduce = function () { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var qs = function (s) { return document.querySelector(s); };
  var E = function (s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pickOne = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var gameG = function () { return (typeof G !== 'undefined') ? G : null; };
  var aiOf = function () { var g = gameG(); if (!g || !g.players) return null; for (var i = 0; i < g.players.length; i++) if (g.players[i].ai) return g.players[i].ai; return null; };
  var sound = function (n, a) { try { if (typeof Snd !== 'undefined' && Snd[n]) Snd[n](a); } catch (e) { /* sound is optional */ } };

  // ---------------------------------------------------------------- 1. Emotes
  // type picks the creature's answer: friendly replies are friendly, cheeky ones cheeky, think ones thoughtful.
  var EMOTES = [
    { id: 'watch', label: 'Watch this!', type: 'cheeky', say: 'Watch this!', moods: ['gasp', 'laugh'] },
    { id: 'nice', label: 'Nice try!', type: 'cheeky', say: 'Nice try!', moods: ['laugh', 'shrug'] },
    { id: 'hmm', label: 'Hmm…', type: 'think', say: 'Hmm…', moods: ['shrug', 'nod'] },
    { id: 'good', label: 'Good one!', type: 'friendly', say: 'Good one!', moods: ['clap', 'nod'] },
    { id: 'cool', label: '😎', type: 'cheeky', say: '😎', aria: 'Cool', moods: ['gloat', 'laugh'] },
    { id: 'shake', label: '🤝', type: 'friendly', say: '🤝', aria: 'Good game', moods: ['wave', 'clap', 'nod'] }
  ];
  var GENERIC = { friendly: ['Thanks! Good game!', 'Nice one!'], cheeky: ['Ha! Bring it on!', 'Ooh, cheeky!'], think: ['Take your time!', 'Hmm, me too!'] };
  var COOLDOWN = 3000, lastEmote = 0;

  function emoteById(id) { for (var i = 0; i < EMOTES.length; i++) if (EMOTES[i].id === id) return EMOTES[i]; return null; }
  function emoteBar() {
    return '<div class="emote-bar" id="emoteBar" role="group" aria-label="Say something to your opponent">' + EMOTES.map(function (e) {
      return '<button type="button" class="emote ' + e.type + (e.label.length <= 2 ? ' icon' : '') + '" data-act="emote" data-arg="' + e.id + '"' + (e.aria ? ' aria-label="' + E(e.aria) + '"' : '') + '>' + E(e.label) + '</button>';
    }).join('') + '</div>';
  }
  function reactionFor(emoteId, o) {
    var e = emoteById(emoteId) || EMOTES[3];
    o = o || aiOf();
    var pool = o && o.talk && o.talk.reply && o.talk.reply[e.type];
    if (!pool || !pool.length) pool = GENERIC[e.type];
    return { line: pickOne(pool), mood: pickOne(e.moods) };
  }
  var moodHook = null;
  function onEmote(id) {
    var o = aiOf(); if (!o) return null;           // 2-player games: nobody to answer
    var r = reactionFor(id, o);
    setTimeout(function () {
      if (!gameG()) return;
      bubble('opp', r.line);
      try { if (typeof api.moodHook === 'function') api.moodHook(r.mood, r); } catch (e) { /* the hook is the lead's */ }
    }, 750 + Math.floor(Math.random() * 350));
    return r;
  }
  function emote(el) {
    var id = el && el.dataset ? el.dataset.arg : el, e = emoteById(id); if (!e) return;
    var now = Date.now();
    if (now - lastEmote < COOLDOWN) return;       // one emote per few seconds
    lastEmote = now;
    var bar = qs('#emoteBar');
    if (bar) { bar.classList.add('wait'); setTimeout(function () { var b = qs('#emoteBar'); if (b) b.classList.remove('wait'); }, COOLDOWN); }
    sound('pop');
    bubble('kid', e.say, { big: e.label.length <= 2 });
    onEmote(e.id);
  }

  // ---------------------------------------------------------------- 2. Comic bubbles
  var bubbles = { opp: null, kid: null };
  function matIs3D() {
    var mat = qs('#gMat'); if (!mat) return null;
    if (!mat.querySelector('canvas') || mat.querySelector('.mat')) return null; // flat 2D mat: nothing to sit over
    var scr = qs('#game'); if (scr && !scr.classList.contains('on')) return null;
    return mat;
  }
  function place(rec) {
    var mat = qs('#gMat'); if (!mat || !rec.el.isConnected) return;
    var r = mat.getBoundingClientRect(), el = rec.el, o = rec.opts || {};
    el.style.left = '0px'; el.style.maxWidth = Math.min(300, Math.max(140, r.width - 24)) + 'px';
    var w = el.offsetWidth, cx = o.x != null ? o.x : r.left + r.width / 2;
    var left = Math.max(8, Math.min(innerWidth - w - 8, cx - w / 2));
    el.style.left = left + 'px';
    // tail follows the anchor even when the bubble is pushed sideways at the edges
    el.style.setProperty('--tail', Math.max(18, Math.min(w - 18, cx - left)) + 'px');
    if (rec.who === 'opp') { el.style.top = (o.y != null ? o.y : r.top + Math.max(12, r.height * 0.2)) + 'px'; el.style.bottom = 'auto'; }
    else { el.style.bottom = (innerHeight - r.bottom + Math.max(12, r.height * 0.07)) + 'px'; el.style.top = 'auto'; }
  }
  function drop(who, fast) {
    var rec = bubbles[who]; if (!rec) return;
    bubbles[who] = null; clearTimeout(rec.t);
    if (fast || reduce()) { rec.el.remove(); return; }
    rec.el.classList.add('out'); setTimeout(function () { rec.el.remove(); }, 260);
  }
  // who: 'opp' (the creature, top centre, tail up) or 'kid' (bottom, tail down). Text is plain text.
  function bubble(who, text, opts) {
    who = who === 'opp' || who === 'creature' ? 'opp' : 'kid';
    opts = opts || {};
    if (!matIs3D() || text == null || text === '') return null;
    drop(who, true);
    var el = document.createElement('div');
    el.className = 'sbub ' + (who === 'opp' ? 'theirs' : 'mine') + (opts.big ? ' big' : '');
    el.setAttribute('aria-hidden', 'true');   // the same line is in the action bar for screen readers
    el.innerHTML = '<div class="sb-in">' + E(text) + '</div>';
    document.body.appendChild(el);
    var ms = Math.max(2200, Math.min(6000, 1500 + String(text).length * 60));
    var rec = { el: el, who: who, opts: opts, t: setTimeout(function () { drop(who); }, opts.ms || ms) };
    bubbles[who] = rec; place(rec);
    return el;
  }
  function clearBubbles() { drop('opp', true); drop('kid', true); }
  window.addEventListener('resize', function () { if (bubbles.opp) place(bubbles.opp); if (bubbles.kid) place(bubbles.kid); });

  // ---------------------------------------------------------------- 3. VS screen
  var vsActive = null;
  function stars(n) { var s = ''; for (var i = 0; i < 5; i++) s += '<span class="' + (i < n ? 'on' : '') + '">★</span>'; return '<div class="vs-stars" aria-label="' + n + ' stars">' + s + '</div>'; }
  function vsCard(p, i, side) {
    var o = p && p.ai, name = E(p && p.name ? p.name : 'Player ' + (i + 1));
    if (o) {
      return '<div class="vs-card vs-them ' + side + '"><div class="vs-av">' + (typeof avatarHTML === 'function' ? avatarHTML(o, 'lg') : '<span class="vs-emo">' + E(o.emoji || '') + '</span>') + '</div>' +
        '<div class="vs-info"><div class="vs-name">' + name + '</div><div class="vs-sub">' + E(o.title || '') + '</div>' +
        '<div class="vs-row"><span class="vs-jer">' + E(o.num || '0') + '</span>' + stars(o.stars || 0) + '</div>' +
        (o.tip ? '<div class="vs-tip">' + E(o.tip) + '</div>' : '') + '</div></div>';
    }
    var first = i === 0, sv = (typeof S !== 'undefined') ? S : null, jer = first && sv && sv.jersey ? sv.jersey : (p && p.jersey) || ['7', '10', '3'][i % 3];
    var lv = first && typeof level === 'function' ? level() : 0, st = '';
    if (first && sv && sv.stats) {
      st = '<div class="vs-facts"><span><b>' + (sv.stats.correct || 0) + '</b> Solutions</span><span><b>' + Object.keys(sv.badges || {}).length + '</b> badges</span></div>';
    }
    return '<div class="vs-card vs-me ' + side + '"><div class="vs-av"><span class="vs-shirt">' + E(jer) + '</span></div>' +
      '<div class="vs-info"><div class="vs-name">' + name + '</div>' + (lv ? '<div class="vs-sub">Level ' + lv + '</div>' : '<div class="vs-sub">Player ' + (i + 1) + '</div>') + st + '</div></div>';
  }
  // players: an array like G.players ({name, ai}). 2 or 3 players. done() fires exactly once.
  function vsScreen(players, done) {
    if (vsActive) vsActive.finish(true);
    players = (players || []).slice(0, 3);
    var finished = false, root = document.createElement('div'), tm = [];
    function finish(quick) {
      if (finished) return; finished = true;
      tm.forEach(clearTimeout); vsActive = null;
      root.removeEventListener('click', skip); document.removeEventListener('keydown', key);
      function end() { root.remove(); if (typeof done === 'function') { try { done(); } catch (e) { setTimeout(function () { throw e; }); } } }
      if (quick === true || reduce()) end(); else { root.classList.add('out'); setTimeout(end, 220); }
    }
    function skip() { finish(false); }
    function key(e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); skip(); } }
    if (players.length < 2) { finished = true; if (typeof done === 'function') done(); return; }
    root.id = 'vsScreen'; root.className = 'vs n' + players.length; root.tabIndex = 0;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Match starting. Tap to skip.');
    var cards = players.map(function (p, i) { return vsCard(p, i, i === 0 ? 'from-l' : i === 1 ? 'from-r' : 'from-b'); });
    root.innerHTML = '<div class="vs-bg"></div><div class="vs-cards">' + cards[0] + '<div class="vs-vs" aria-hidden="true"><span>VS</span></div>' + cards.slice(1).join('') + '</div><div class="vs-skip">Tap to skip</div>';
    document.body.appendChild(root);
    root.addEventListener('click', skip); document.addEventListener('keydown', key);
    try { root.focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ }
    vsActive = { finish: finish };
    tm.push(setTimeout(function () { sound('sting', 'vs'); }, 620));
    tm.push(setTimeout(function () { finish(false); }, 2200));
    return { skip: skip };
  }

  // ---------------------------------------------------------------- 4. Player of the Match
  function perShake(p) { return (p && p.list) || []; }
  function nGreat(p) { return perShake(p).filter(function (v) { return v >= 4; }).length; }
  function jerseyOf(p, i) { if (p.ai) return p.ai.num || '0'; return i === 0 && typeof S !== 'undefined' && S.jersey ? S.jersey : p.jersey || ['7', '10', '3'][i % 3]; }
  function who(p, i) {
    var face = p.ai ? (typeof avatarHTML === 'function' ? avatarHTML(p.ai, 'sm') : '') : '<span class="jersey' + (i === 1 ? ' j2' : i === 2 ? ' j3' : '') + '">' + E(jerseyOf(p, i)) + '</span>';
    return '<div class="potm-who">' + face + '<b>' + E(p.name) + '</b></div>';
  }
  function reasonFor(p, i, g, best) {
    var l = perShake(p), n = l.length, great = nGreat(p);
    var bc = best && best.bestCubes;
    if (n >= 2 && great === n) return 'Perfect match: every shake a winner!';
    if (i === 0 && g.trailed && !p.ai) return 'Comeback! Behind early and ahead at the end.';
    if (bc && bc >= 5 && i === 0) return 'Built a ' + bc + '-cube Solution. Wow!';
    if (great >= 2) return great + ' great shakes with 4 or more points.';
    if (great === 1) return 'One big shake made the difference.';
    return 'Most points: ' + p.score + '.';
  }
  function effortLine(p) {
    var great = nGreat(p), any = perShake(p).filter(function (v) { return v > 0; }).length;
    if (great) return great + ' great ' + (great === 1 ? 'move' : 'moves') + '!';
    if (any) return any + ' good ' + (any === 1 ? 'move' : 'moves') + '. Nice work!';
    return 'You kept going. That\'s what champions do!';
  }
  // summary (all optional): { bestCubes: longest Solution (cubes) this match }. Everything else is read from G.
  function matchCard(summary) {
    var g = gameG(); if (!g || !g.players || !g.players.length) return '';
    var ps = g.players, top = Math.max.apply(null, ps.map(function (p) { return p.score; }));
    var winners = ps.map(function (p, i) { return i; }).filter(function (i) { return ps[i].score === top; });
    var kidWon = winners.indexOf(0) >= 0, tie = winners.length > 1;
    var head, body, cls = 'potm';
    if (g.mode === 'ai') {
      var kid = ps[0];
      if (kidWon && !tie) { head = 'Player of the Match'; body = who(kid, 0) + '<div class="potm-why">' + E(reasonFor(kid, 0, g, summary)) + '</div>'; }
      else if (tie) { head = 'Great match!'; body = who(kid, 0) + '<div class="potm-why">All square! ' + E(ps[1].name) + ' played well too.</div>'; cls += ' kind'; }
      else { head = 'Best effort'; body = who(kid, 0) + '<div class="potm-why">' + E(effortLine(kid)) + '</div>'; cls += ' kind'; }
    } else {
      head = tie ? 'Players of the Match' : 'Player of the Match';
      body = winners.map(function (i) { return who(ps[i], i) + '<div class="potm-why">' + E(reasonFor(ps[i], i, g, i === 0 ? summary : null)) + '</div>'; }).join('');
    }
    return '<div class="' + cls + '"><div class="potm-badge">' + E(head) + '</div>' + body + '</div>';
  }

  var api = { emotes: EMOTES, emoteBar: emoteBar, emote: emote, onEmote: onEmote, reactionFor: reactionFor, moodHook: moodHook, bubble: bubble, clearBubbles: clearBubbles, vsScreen: vsScreen, matchCard: matchCard };
  return api;
})();

if (typeof ACT !== 'undefined') ACT.emote = function (el) { Social.emote(el); };
