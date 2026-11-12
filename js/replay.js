'use strict';
// ======================= GOAL REPLAY + FIREWORKS: glue and the flat versions (classic script) =======================
// Replay.play(r, done)   call from endShake(r) BEFORE the result pop-up. If the shake ended with a correct
//                        Solution and S.set.replay !== false, it plays the replay, then calls done() EXACTLY ONCE.
//                        3D table: the big-cube replay (js/three/replay.js), skippable by any tap, with a safety
//                        timeout. Flat mat (or no 3D, or anything fails): done() is called straight away and the
//                        result pop-up gets the small HTML/CSS replay instead (Replay.popupHTML). Never throws and
//                        never holds the game up for more than ~6.5 s.
// Replay.popupHTML(r)    HTML for the result pop-up: the Solution flying together, "= 37 GOAL!" (flat mat only;
//                        '' when the 3D replay already played for this r, or there is nothing to replay).
// Replay.pick(r)         {i, sol} the Solution the replay shows: the kid's correct one first, else any correct one.
// Replay.active()        true while a 3D replay is on screen.
//
// Fireworks.show(opts)   a fireworks show for a big win (S.set.fireworks !== false). 3D table on the game
//                        screen: T3.fireworks(opts) (js/three/fireworks.js). Otherwise (flat mat, another
//                        screen, a pop-up over everything): the canvas fireworks from js/fx.js, with the soft
//                        booms from js/fx-sfx.js. Returns '3d' | 'flat' | ''. opts: {rockets, flat: true (force flat)}
var Replay = (function () {
  var last3d = null, lastFlat = null, live = null, hooked = false;
  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function on() { return setg().replay !== false; }
  function reduced() { try { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function pick(r) {
    if (!r || !r.sols) return null;
    var keys = Object.keys(r.sols).sort(function (a, b) { return (+a === 0 ? -1 : 0) - (+b === 0 ? -1 : 0) || a - b; });
    for (var i = 0; i < keys.length; i++) {
      var s = r.sols[keys[i]];
      if (s && s.ok && Array.isArray(s.tokens) && s.tokens.some(function (t) { return t && typeof t === 'object'; })) return { i: +keys[i], sol: s };
    }
    return null;
  }
  function wildOf(sol) { try { return sol.chk && typeof sol.chk.wild === 'number' ? sol.chk.wild : undefined; } catch (e) { return undefined; } }

  // a see-through layer over the game while the 3D replay plays: any tap skips it (a click, so the tap
  // can't fall through to a button underneath once the layer is gone)
  function overlay(skip) {
    var d = document.createElement('div'); d.className = 'wh-skip';
    d.innerHTML = '<span class="wh-skip-pill">Tap to skip ⏭</span>';
    var go = function (e) { if (e) { e.preventDefault(); e.stopPropagation(); } skip(); };
    d.addEventListener('click', go);
    d.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    var key = function (e) { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') go(e); };
    document.addEventListener('keydown', key, true);
    document.body.appendChild(d);
    return function () { document.removeEventListener('keydown', key, true); if (d.parentNode) d.parentNode.removeChild(d); };
  }

  function play(r, done) {
    var called = false, unOverlay = null, safety = null;
    function fin() {
      if (called) return; called = true;
      clearTimeout(safety); live = null;
      try { if (unOverlay) unOverlay(); } catch (e) {}
      try { if (done) done(); } catch (e) { try { console.error(e); } catch (e2) {} }
    }
    try {
      last3d = null; lastFlat = null;
      var p = on() && typeof G !== 'undefined' && G && G.mode !== 'tutorial' ? pick(r) : null;
      if (!p) { fin(); return false; }
      var three = typeof T3 !== 'undefined' && T3.active && T3.active() && T3.replay && (typeof current === 'undefined' || current === 'game') && !document.hidden;
      if (three) {
        var h = T3.replay(p.sol.tokens, { goal: G.goal ? Eq.fmt(G.goal) : null, cubes: G.cubes, fractions: G.fractions, wild: wildOf(p.sol) }, fin);
        if (h) {
          last3d = r; live = h;
          unOverlay = overlay(function () { try { h.skip(); } catch (e) {} fin(); });
          safety = setTimeout(fin, 6500);
          return true;
        }
      }
      lastFlat = r;   // the result pop-up shows the small replay instead
      fin(); return false;
    } catch (e) { fin(); return false; }
  }

  // ----- the flat version, inside the result pop-up -----
  function esc2(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function popupHTML(r) {
    try {
      if (!on() || !r || r === last3d || (lastFlat && r !== lastFlat)) return '';
      var p = pick(r); if (!p) return '';
      hook();
      var cubes = (typeof G !== 'undefined' && G && G.cubes) || [], k = 0;
      var row = p.sol.tokens.map(function (t) {
        var s = typeof t === 'string' ? t : t.s, i = k++;
        var label = (typeof show === 'function') ? show(s) : s;
        if (s === '(' || s === ')') return '<span class="paren wh-rp-c" style="--i:' + i + '">' + esc2(label) + '</span>';
        var color = (t && t.id != null && cubes[t.id]) ? cubes[t.id].color : 'none';
        return '<span class="cube mini c-' + color + ' wh-rp-c wh-rp-cube" style="--i:' + i + '"><span>' + esc2(label) + '</span></span>';
      }).join('');
      var goal = (typeof G !== 'undefined' && G && G.goal) ? Eq.fmt(G.goal) : '';
      var who = '';
      try { who = p.i === 0 ? '' : esc2(G.players[p.i].name) + '’s '; } catch (e) {}
      return '<div class="wh-replay' + (reduced() ? ' still' : '') + '" style="--n:' + k + '" role="img" aria-label="Replay: ' + who + 'Solution equals ' + esc2(goal) + '">' +
        '<div class="wh-rp-tag">↻ REPLAY' + (who ? ' · ' + who.replace(/’s $/, '') : '') + '</div>' +
        '<div class="wh-rp-row expr">' + row + '</div>' +
        '<div class="wh-rp-eq">= ' + esc2(goal) + ' <b>GOAL!</b></div></div>';
    } catch (e) { return ''; }
  }
  // thunks as the flat cubes land, one cheer when "GOAL!" flashes; a tap jumps to the end
  function hook() {
    if (hooked || typeof document === 'undefined') return; hooked = true;
    document.addEventListener('animationend', function (e) {
      var t = e.target; if (!t || !t.classList) return;
      if (e.animationName === 'whFly' && t.classList.contains('wh-rp-cube') && !t.closest('.wh-replay.skip')) { try { Snd.thunk(); } catch (er) {} }
    });
    document.addEventListener('animationstart', function (e) {
      var t = e.target; if (!t || !t.classList) return;
      if (e.animationName === 'whFlash' && !t.closest('.wh-replay.skip')) { try { Snd.chime(); if (typeof crowdReact === 'function') crowdReact('cheer'); } catch (er) {} }
    });
    document.addEventListener('click', function (e) { var b = e.target && e.target.closest && e.target.closest('.wh-replay'); if (b) b.classList.add('skip'); });
  }
  return { play: play, popupHTML: popupHTML, pick: pick, active: function () { return !!live; } };
})();

var Fireworks = (function () {
  var flatUntil = 0;
  function setg() { return (typeof S !== 'undefined' && S && S.set) ? S.set : {}; }
  function modalOpen() { try { var m = document.getElementById('modal'); return !!(m && m.classList.contains('on')); } catch (e) { return false; } }
  function flat() {
    var t = Date.now(); if (t < flatUntil) return '';   // one flat show at a time
    if (typeof FX === 'undefined' || !FX.fireworks) return '';
    flatUntil = t + 3500;
    FX.fireworks();
    // FX.fireworks: up to 7 rockets 380 ms apart, each bursts about 1.1 s after it leaves (2 with reduced motion)
    var red = false; try { red = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    if (typeof FxSfx !== 'undefined') for (var i = 0; i < (red ? 2 : 7); i++) if (i % 2 === 0 || red) FxSfx.boom({ delay: i * 0.38 + 1.1, size: 0.5, pan: (Math.random() - 0.5) * 1.2 });
    return 'flat';
  }
  function showFw(opts) {
    try {
      opts = opts || {};
      if (setg().fireworks === false) return '';
      var three = !opts.flat && typeof T3 !== 'undefined' && T3.active && T3.active() && T3.fireworks && (typeof current === 'undefined' || current === 'game') && !document.hidden && !modalOpen();
      if (three && T3.fireworks(opts)) return '3d';
      return flat();
    } catch (e) { return ''; }
  }
  return { show: showFw };
})();
