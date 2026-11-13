'use strict';
// ======================= MATCH DAY (classic script) =======================
// The walk-out before a match, the toss for who sets the first Goal, and the trophy lift after a big win.
// The 3D side is js/three/matchday.js (T3.mdWalkOut / T3.mdToss / T3.mdLift); this file is the glue: the captions,
// the tap-to-skip layer, the buttons, the seeded toss and its saving, and the flat 2D versions (3D off).
// Inert until wired from js/game.js and js/cup.js (docs/handoff/matchday.md). Every optional piece is feature-detected.
//
//   Matchday.matchStart(G, go)   after the VS screen: walk-out, then the toss, then go({ entered }) exactly once
//                                (entered = the creatures already made their entrance during the walk-out, so the game
//                                must not call creaturesEnter() again). Sets G.setter (and G.toss) when there is a toss.
//                                Anything failing: go() at once. The tutorial: go() at once.
//   Matchday.trophyLift(info, done) -> bool   info: { kind: 'cup' | 'shield' | 'crown', name, metal, ribbon, color,
//                                first, count, xp, line }. true = it is on screen and done() comes once (Continue);
//                                false = nothing shown (a cup without 3D: cup.js keeps its own trophy screen).
//   Matchday.makeToss(G)         the toss record for this match (seeded, saved; the same match after a reload gets the
//                                same record): { method: 'coin' | 'cubes', winner, face, spins, rolls, n }
//   Matchday.playToss(rec, names, done)   show a known toss (an online guest replaying the host's toss)
//   Matchday.active()            '' | 'walkout' | 'toss' | 'lift'
//
// Settings (S.set): walkout (false = no walk-out), toss (false = "he always goes first": no toss, G.setter stays 0).
// Saved: S.matchday = { seed, n, pend } (pend = the toss of a match whose first Goal was not set yet).
var Matchday = (function () {
  var on = '', walked = false;
  function $q(s) { return document.querySelector(s); }
  function E(s) { return typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function setOn(k) { return !(typeof S !== 'undefined' && S.set && S.set[k] === false); }
  function reduced() { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function sfx(n, v) { try { if (window.MdSfx && MdSfx[n]) MdSfx[n](v); } catch (e) {} }
  function three() { try { return !!(typeof T3 !== 'undefined' && T3.active && T3.active()); } catch (e) { return false; } }
  function save() { if (typeof persist === 'function') persist(); }

  // ---------- seeds: one per match, saved, so a reload cannot toss again ----------
  function st() {
    if (typeof S === 'undefined') return { seed: 1, n: 0, pend: null };
    var m = S.matchday; if (!m || typeof m !== 'object') m = S.matchday = {};
    if (!(m.seed >>> 0)) m.seed = (Math.floor(Math.random() * 4294967295) >>> 0) || 1;
    if (!(m.n >= 0)) m.n = 0;
    return m;
  }
  function mix(a, b) { var h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ h >>> 16, 0x7feb352d); h = Math.imul(h ^ h >>> 15, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function keyOf(g) { return [g.mode, g.oppIdx == null ? '' : g.oppIdx, g.players.map(function (p) { return p.name; }).join('|'), g.cup ? g.cup.id + g.cup.round : ''].join('#'); }
  function makeToss(g) {
    var m = st(), key = keyOf(g);
    if (m.pend && m.pend.key === key && m.pend.rec && Date.now() - (m.pend.at || 0) < 12 * 3600 * 1000 && m.pend.rec.np === g.players.length) return m.pend.rec;
    m.n++;
    var r = rng(mix(m.seed, m.n)), n = g.players.length, rec;
    if (n === 2) {
      var w = r() < 0.5 ? 0 : 1;
      rec = { method: 'coin', winner: w, face: w === 0 ? 'eq' : 'star', spins: 3 + Math.floor(r() * 3), rolls: [] };
    } else {
      // the official rule: each rolls a red cube; an operation sign is out; the highest digit sets the Goal; a tie rolls again
      var faces = Eq.CUBE_FACES.red, alive = [], rolls = [], win = -1;
      for (var i = 0; i < n; i++) alive.push(i);
      for (var round = 0; round < 8 && win < 0; round++) {
        var roll = alive.map(function (p) { return { p: p, s: faces[Math.floor(r() * 6)] }; }), dg = roll.filter(function (e) { return Eq.isDigit(e.s); });
        rolls.push(roll);
        if (!dg.length) continue;                                              // everyone rolled a sign: all roll again
        var top = Math.max.apply(null, dg.map(function (e) { return +e.s; })), best = dg.filter(function (e) { return +e.s === top; });
        if (best.length === 1) win = best[0].p; else alive = best.map(function (e) { return e.p; });
      }
      if (win < 0) win = alive[Math.floor(r() * alive.length)];               // (never seen in practice: 8 tied rounds)
      rec = { method: 'cubes', winner: win, rolls: rolls };
    }
    rec.n = m.n; rec.np = n;
    m.pend = { key: key, at: Date.now(), rec: rec }; save();
    watch(g);
    return rec;
  }
  // the toss counts once the first Goal is set (or the match moved on): the next match gets a new one
  function watch(g) {
    var iv = setInterval(function () {
      if (typeof G === 'undefined' || G !== g) { clearInterval(iv); return; }
      if (g.goal != null || g.shake > 1 || g.phase === 'move') { var m = st(); if (m.pend && m.pend.rec && m.pend.rec.n === (g.toss && g.toss.n)) { m.pend = null; save(); } clearInterval(iv); }
    }, 1500);
  }

  // ---------- the stage: the 3D picture must be in the match screen before the first renderGame() ----------
  function stage() {
    if (!three()) return false;
    var el = $q('#game'); if (!el) return false;
    if (!$q('#gMat')) el.innerHTML = '<div id="gTop" class="game-top"></div><div id="gGoal"></div><div id="gMat"></div><div id="gAct" class="actionbar"></div>';   // the same scaffolding renderGame builds
    el.classList.add('three');
    try { T3.attach($q('#gMat')); } catch (e) { return false; }
    return !!(T3.ctx && T3.ctx.layout);
  }
  function layer(cls, html) {
    var d = document.createElement('div'); d.className = 'md-layer ' + cls; d.innerHTML = html || '';
    document.body.appendChild(d); return d;
  }
  function names(g) { return g.players.map(function (p) { return String(p.name || ''); }); }
  function kitCol() { try { return (S.kit && S.kit.shirt) || '#c9342c'; } catch (e) { return '#c9342c'; } }
  function colors(g) { return g.players.map(function (p, i) { return p.ai ? (p.ai.color || '#8ce99a') : i === 0 ? kitCol() : '#ffd43b'; }); }

  // ---------- 1. the walk-out ----------
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function records(g) {
    var out = g.players.map(function (p, i) {
      if (p.ai) return (p.ai.stars ? '★'.repeat(Math.min(6, p.ai.stars)) + ' ' : '') + E(p.ai.title || '');
      if (i === 0) return 'Level ' + (typeof level === 'function' ? level() : 1);
      return '';
    });
    try {
      if (g.mode === 'ai' && window.Season && Season.table && typeof leagueOf === 'function') {
        var lg = ['c', 'm', 'l'][leagueOf(g.oppIdx)], rows = Season.table(lg), first = leagueOf(g.oppIdx) * (typeof LEAGUE === 'number' ? LEAGUE : 5);
        rows.forEach(function (row, k) {
          var line = ord(k + 1) + ' · W' + row.W + ' D' + row.D + ' L' + row.L;
          if (row.r === 0) out[0] = line; else if (row.r - 1 + first === g.oppIdx) out[1] = line;
        });
      }
    } catch (e) {}
    return out;
  }
  function badge(p, i) {
    if (p.ai && typeof avatarHTML === 'function') return '<span class="md-face">' + avatarHTML(p.ai, 'sm') + '</span>';
    var num = i === 0 ? (S.jersey || '7') : (p.jersey || (i + 1));
    return '<span class="md-num" style="background:' + (i === 0 ? kitCol() : '#ffd43b') + '">' + E(num) + '</span>';
  }
  function lowerThird(g, short) {
    var rec = records(g);
    return '<div class="md-third' + (short ? ' short' : '') + '"><div class="md-third-tag">MATCH DAY</div><div class="md-third-row">' + g.players.map(function (p, i) {
      return (i ? '<span class="md-vs">' + (g.players.length > 2 ? '·' : 'v') + '</span>' : '') + '<div class="md-side">' + badge(p, i) + '<div><b>' + E(p.name) + '</b>' + (rec[i] && !short ? '<small>' + rec[i] + '</small>' : '') + '</div></div>';
    }).join('') + '</div></div>';
  }
  function walkOut(g, cb) {
    var fired = false;
    function out(en) { if (fired) return; fired = true; cb(!!en); }
    try {
      if (!setOn('walkout') || !three() || !T3.mdWalkOut || !stage()) { out(false); return; }
      var short = walked; walked = true;
      var game = $q('#game'); if (game) game.classList.add('md-hud-off');
      var lay = layer('md-walk' + (reduced() ? ' still' : ''), '<div class="md-fade"></div><div class="md-bars"></div>' + lowerThird(g, short) + '<div class="md-skip">Tap to skip</div>');
      var tm = [], ended = false;
      var board = g.players.length === 2 ? 'KICK-OFF!\n' + String(g.players[0].name).toUpperCase().slice(0, 10) + ' v ' + String(g.players[1].name).toUpperCase().slice(0, 10) : 'KICK-OFF!';
      function end(en) {
        if (ended) return; ended = true; on = on === 'walkout' ? '' : on;
        tm.forEach(clearTimeout); lay.removeEventListener('click', tap); document.removeEventListener('keydown', key);
        lay.classList.add('out'); setTimeout(function () { lay.remove(); }, 260);
        if (game) game.classList.remove('md-hud-off');
        out(en);
      }
      var h = T3.mdWalkOut({ short: short, board: board, kick: function () { if (typeof creaturesEnter === 'function') creaturesEnter(); else if (T3.creatureEnter) T3.creatureEnter(); } }, function (name, d) {
        if (name === 'end') end(d && d.entered);
      });
      if (!h) { ended = true; lay.remove(); if (game) game.classList.remove('md-hud-off'); out(false); return; }
      on = 'walkout';
      function tap(e) { if (e) { e.preventDefault(); e.stopPropagation(); } h.skip(); }
      function key(e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); h.skip(); } }
      lay.addEventListener('click', tap); document.addEventListener('keydown', key);
      var full = !short && ['stadium', 'night'].indexOf(S.cos.mat) >= 0, TEND = short ? 2.0 : full ? 5.9 : 3.5;
      if (!short) sfx('walkout');
      tm.push(setTimeout(function () { lay.classList.add('third-in'); }, short ? 150 : 450));
      tm.push(setTimeout(function () { lay.classList.remove('third-in'); }, (TEND - (short ? 0.35 : 1.2)) * 1000));
      tm.push(setTimeout(function () { try { if (typeof crowdReact === 'function') crowdReact('cheer', { wave: !short }); } catch (e) {} }, short ? 200 : 700));
      tm.push(setTimeout(function () { h.skip(); }, TEND * 1000 + 3000));    // safety
    } catch (e) { console.warn('walk-out', e); out(false); }
  }

  // ---------- 2. the toss ----------
  function sideTag(face) { return face === 'eq' ? '<span class="md-eq">=</span>' : '<span class="md-star">★</span>'; }
  function introLine(rec, nm) {
    if (rec.method === 'coin') return 'Coin toss for the first Goal! ' + sideTag('eq') + ' <b>' + E(nm[0]) + '</b> &nbsp; ' + sideTag('star') + ' <b>' + E(nm[1]) + '</b>';
    return 'Who sets the first Goal? Everyone rolls a <b class="md-red">red cube</b>: the highest number wins. A <b>+</b> or <b>−</b> is out!';
  }
  function roundLine(d, nm) {
    var dg = d.roll.filter(function (e) { return Eq.isDigit(e.s); });
    if (!dg.length) return 'Only signs! Everyone rolls again.';
    var top = Math.max.apply(null, dg.map(function (e) { return +e.s; })), best = dg.filter(function (e) { return +e.s === top; });
    if (best.length > 1) return 'A tie on <b>' + top + '</b>! ' + best.map(function (e) { return '<b>' + E(nm[e.p]) + '</b>'; }).join(' and ') + ' roll again.';
    return '';
  }
  function resultLine(rec, nm) {
    var w = '<b>' + E(nm[rec.winner]) + '</b>';
    if (rec.method === 'coin') return sideTag(rec.face) + ' ' + (rec.face === 'eq' ? 'The cube side!' : 'The star side!') + ' ' + w + ' sets the first Goal.';
    return w + ' rolled the highest, so ' + w + ' sets the first Goal!';
  }
  function playToss(rec, nm, done, cols) {
    var fired = false, lay = null, tm = [], h = null, landed = false, ending = false;
    function out() { if (fired) return; fired = true; tm.forEach(clearTimeout); if (lay) { var l = lay; l.classList.add('out'); setTimeout(function () { l.remove(); }, 240); } if (on === 'toss') on = ''; document.removeEventListener('keydown', key); try { done(); } catch (e) { setTimeout(function () { throw e; }); } }
    function cap(html, cls) { if (!lay) return; var c = lay.querySelector('.md-cap'); c.innerHTML = html; c.className = 'md-cap show' + (cls ? ' ' + cls : ''); }
    function result() { if (landed) return; landed = true; cap(resultLine(rec, nm), 'win'); sfx('result'); }
    // a tap: straight to the result (shown for a moment), a second tap goes on at once
    function skip() {
      if (ending) { out(); return; }
      ending = true;
      if (h) { var hh = h; h = null; hh.skip(); }
      if (lay) lay.classList.add('done');
      result(); tm.push(setTimeout(out, 1100));
    }
    function key(e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); skip(); } }
    try {
      on = 'toss';
      var use3d = three() && T3.mdToss && stage();
      lay = layer('md-toss' + (use3d ? '' : ' flat'), '<div class="md-cap"></div>' + (use3d ? '' : flatToss(rec, nm, cols)) + '<div class="md-skip">Tap to skip</div>');
      lay.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); skip(); });
      document.addEventListener('keydown', key);
      cap(introLine(rec, nm));
      if (use3d) {
        h = T3.mdToss(rec, { names: nm, colors: cols }, function (name, d) {
          if (name === 'round' && !d.last) { var l = roundLine(d, nm); if (l) cap(l); }
          if (name === 'landed') result();
          if (name === 'end') { h = null; if (!ending) { ending = true; result(); tm.push(setTimeout(out, 350)); } }
        });
        if (!h) { lay.classList.add('flat'); lay.insertAdjacentHTML('beforeend', flatToss(rec, nm, cols)); use3d = false; }
        else tm.push(setTimeout(skip, 16000));                                  // safety
      }
      if (!use3d) tm.push(setTimeout(skip, 20000));                              // safety
      if (!use3d) runFlat(lay, rec, nm, function (kind, d) {
        if (kind === 'round') { var l = roundLine(d, nm); if (l) cap(l); }
        if (kind === 'landed' && !ending) { result(); ending = true; tm.push(setTimeout(out, 1500)); }
      }, tm);
    } catch (e) { console.warn('toss', e); out(); }
  }
  // the flat versions: a CSS coin that flips (Web Animations, it ends exactly on the winning side), or red cube tiles
  function flatToss(rec, nm, cols) {
    if (rec.method === 'coin') return '<div class="md-coin2d"><div class="md-coin-hop"><div class="md-coin-spin"><div class="md-cf front"><span class="md-cf-cube">=</span></div><div class="md-cf back">★</div></div></div></div>';
    var order = nm.length === 3 ? [1, 0, 2] : [0, 1];
    return '<div class="md-dice">' + order.map(function (p) { return '<div class="md-die-box" data-p="' + p + '"><div class="md-die">?</div><b style="border-color:' + ((cols || [])[p] || '#ffd43b') + '">' + E(nm[p]) + '</b><small></small></div>'; }).join('') + '</div>';
  }
  function runFlat(lay, rec, nm, ev, tm) {
    var still = reduced();
    if (rec.method === 'coin') {
      var spin = lay.querySelector('.md-coin-spin'), hop = lay.querySelector('.md-coin-hop'), endDeg = 360 * (rec.spins || 4) + (rec.face === 'star' ? 180 : 0);
      if (still || !spin.animate) { spin.style.transform = 'rotateX(' + endDeg + 'deg)'; tm.push(setTimeout(function () { ev('landed'); }, 300)); return; }
      tm.push(setTimeout(function () {
        sfx('flip');
        hop.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-150px)', offset: 0.5 }, { transform: 'translateY(0)' }], { duration: 1050, easing: 'cubic-bezier(.3,0,.7,1)', fill: 'forwards' });
        spin.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(' + (endDeg + 14) + 'deg)', offset: 0.82 }, { transform: 'rotateX(' + (endDeg - 6) + 'deg)', offset: 0.92 }, { transform: 'rotateX(' + endDeg + 'deg)' }], { duration: 1500, easing: 'ease-out', fill: 'forwards' });
        tm.push(setTimeout(function () { sfx('clink', 0.9); }, 1060)); tm.push(setTimeout(function () { sfx('clink', 0.3); }, 1300));
        tm.push(setTimeout(function () { ev('landed'); }, 1560));                 // (a timer, not onfinish: a hidden page may never finish the animation)
      }, 500));
      return;
    }
    var rolls = rec.rolls || [], r = 0;
    function box(p) { return lay.querySelector('.md-die-box[data-p="' + p + '"]'); }
    function next() {
      var roll = rolls[r], last = r === rolls.length - 1; if (!roll) return;
      roll.forEach(function (e) { var b = box(e.p); if (!b) return; var d = b.querySelector('.md-die'); d.textContent = '?'; b.classList.remove('out', 'top', 'win'); d.classList.remove('rolled'); void d.offsetWidth; d.classList.add(still ? 'rolled' : 'rolling'); });
      lay.querySelectorAll('.md-die-box').forEach(function (b) { if (!roll.some(function (e) { return String(e.p) === b.dataset.p; })) b.classList.add('dim'); });
      tm.push(setTimeout(function () {
        var dg = roll.filter(function (e) { return Eq.isDigit(e.s); }), top = dg.length ? Math.max.apply(null, dg.map(function (e) { return +e.s; })) : -1;
        roll.forEach(function (e) {
          var b = box(e.p); if (!b) return; var d = b.querySelector('.md-die'), dig = Eq.isDigit(e.s);
          d.classList.remove('rolling'); d.classList.add('rolled'); d.textContent = e.s === '-' ? '−' : e.s;
          b.querySelector('small').textContent = dig ? '' : 'out';
          b.classList.toggle('out', !dig); b.classList.toggle('top', dig && +e.s === top); b.classList.toggle('win', last && e.p === rec.winner);
        });
        sfx('cube', 0.7);
        ev('round', { r: r, roll: roll, last: last });
        if (last) ev('landed'); else { r++; tm.push(setTimeout(next, 1100)); }
      }, still ? 200 : 750));
    }
    tm.push(setTimeout(next, 600));
  }
  function toss(g, cb) {
    try {
      if (!setOn('toss') || !g.players || g.players.length < 2) { cb(); return; }
      if (g.tour || g.mode === 'tourney') { cb(); return; }                     // Tournament practice: its own official red-cube roll (Tourney.firstSetter) picks the setter
      if (g.mode === 'online' && !(window.Online && Online.isHost && Online.isHost())) { cb(); return; }   // a guest: the host's toss arrives in the state
      var rec = makeToss(g);
      g.toss = rec; g.setter = rec.winner;
      playToss(rec, names(g), cb, colors(g));
    } catch (e) { console.warn('toss', e); cb(); }
  }

  // ---------- the match start: walk-out, then toss, then the game ----------
  function matchStart(g, go) {
    var fired = false, entered = false;
    function next() { if (fired) return; fired = true; clearTimeout(safety); if (typeof G !== 'undefined' && G !== g) return; try { go({ entered: entered }); } catch (e) { setTimeout(function () { throw e; }); } }
    var safety = setTimeout(next, 40000);
    try {
      if (!g || g.mode === 'tutorial') { next(); return; }
      walkOut(g, function (en) {
        entered = en;
        if (typeof G !== 'undefined' && G !== g) { fired = true; clearTimeout(safety); return; }
        toss(g, next);
      });
    } catch (e) { console.warn('matchday', e); next(); }
  }

  // ---------- 3. the trophy lift ----------
  function crownSVG() { return '<svg viewBox="0 0 120 100" width="150" height="125" aria-hidden="true"><path d="M10 80 L18 28 L42 56 L60 14 L78 56 L102 28 L110 80 Z" fill="#ffc83d" stroke="#b07800" stroke-width="5" stroke-linejoin="round"/><rect x="10" y="78" width="100" height="14" rx="4" fill="#e8a10f" stroke="#b07800" stroke-width="4"/><circle cx="36" cy="85" r="4" fill="#e03131"/><circle cx="60" cy="85" r="4" fill="#1c7ed6"/><circle cx="84" cy="85" r="4" fill="#2f9e44"/></svg>'; }
  function shieldSVG(col, mark) { return '<svg viewBox="0 0 120 140" width="130" height="152" aria-hidden="true"><path d="M14 10 H106 V58 C106 98 82 122 60 132 C38 122 14 98 14 58 Z" fill="' + (col || '#ffc83d') + '" stroke="#5c3d00" stroke-width="5"/><path d="M60 34 L67 54 L88 54 L71 66 L78 87 L60 74 L42 87 L49 66 L32 54 L53 54 Z" fill="#fff7d6"/><text x="60" y="118" text-anchor="middle" font-size="22" font-weight="900" fill="#fff7d6" font-family="Trebuchet MS, sans-serif">' + E(mark || '') + '</text></svg>'; }
  function trophyLift(info, done) {
    info = info || {};
    var fired = false;
    function out() { if (fired) return; fired = true; if (on === 'lift') on = ''; try { if (done) done(); } catch (e) { setTimeout(function () { throw e; }); } }
    try {
      var title = info.kind === 'cup' ? 'CHAMPIONS!' : info.kind === 'crown' ? 'TRIO CROWN!' : 'LEAGUE WON!';
      var lines = '<div class="md-lift-name">' + E(info.name || '') + '</div>' + (info.line ? '<div class="md-lift-sub">' + info.line + '</div>' : '') + (info.xp ? '<div class="md-lift-xp">+' + (info.xp | 0) + ' XP</div>' : '');
      var h = null;
      if (three() && T3.mdLift && window.current === 'game') {
        var clap = []; try { var n = T3.creatureCount ? T3.creatureCount() : 0; for (var i = 0; i < n; i++) clap.push(i); } catch (e) {}
        h = T3.mdLift({ kind: info.kind, metal: info.metal, ribbon: info.ribbon, color: info.color || (info.metal ? info.metal[1] : null), mark: info.mark, clap: clap }, function (name) { if (name === 'hold') showButtons(); });
      }
      if (!h && info.kind === 'cup') return false;                               // cup.js has its own 2D trophy screen
      on = 'lift';
      var flat = !h, lay = layer('md-lift' + (flat ? ' flat' : '') + (reduced() ? ' still' : ''),
        (flat ? '<div class="md-lift-bg"></div><div class="md-lift-art">' + (info.kind === 'crown' ? crownSVG() : shieldSVG(info.color, info.mark)) + '</div>' : '') +
        '<div class="md-lift-top"><div class="md-lift-title">' + title + '</div>' + lines + '</div>' +
        '<div class="md-lift-btns">' + (flat ? '' : '<button class="btn" data-md="photo">📷 Take a photo</button>') + '<button class="btn green big" data-md="go">Continue ▶</button></div>');
      var shown = false, tm = [];
      function showButtons() { if (shown) return; shown = true; lay.classList.add('btns'); }
      lay.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-md]');
        e.preventDefault(); e.stopPropagation();
        if (!b) { showButtons(); return; }                                      // a tap anywhere: the buttons right away
        if (b.dataset.md === 'photo') { if (h) h.photo(); return; }
        tm.forEach(clearTimeout); if (h) h.end();
        lay.classList.add('out'); setTimeout(function () { lay.remove(); }, 240);
        out();
      });
      sfx('trophy');
      setTimeout(function () { lay.classList.add('in'); }, 30);
      if (flat) {
        tm.push(setTimeout(function () { try { if (typeof FX !== 'undefined' && FX.confetti) FX.confetti(140); } catch (e) {} try { if (typeof crowdReact === 'function') crowdReact('cheer'); } catch (e) {} }, reduced() ? 0 : 1300));
        tm.push(setTimeout(showButtons, reduced() ? 300 : 2600));
      } else tm.push(setTimeout(showButtons, 7000));                             // safety: 'hold' normally comes at 6 s
      return true;
    } catch (e) { console.warn('trophy lift', e); return false; }
  }

  return { matchStart: matchStart, trophyLift: trophyLift, makeToss: makeToss, playToss: function (rec, nm, done) { playToss(rec, nm, done, []); }, active: function () { return on; } };
})();
