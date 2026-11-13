'use strict';
// ======================= PACE: creatures that react at his speed =======================
// House feature (not part of official Equations). In a race to call Now! / Impossible! (three at the table), how quickly
// a creature calls is set from how quickly HE calls, measured per level:
//   - Every time he calls Now! or Impossible!, the time since the move that made the call possible is one sample.
//     Each level keeps a running average (the newest calls count most), in S.pace.lv[level].
//   - A level is the strongest creature at the table (its place on the ladder, 0..14).
//   - A creature's reaction = his average x its strength factor (a 1-star creature is slower than him, a 5-star a
//     little quicker), plus "slack", plus a little randomness.
//   - Slack: after a shake he loses, a small random amount (0.3 to 0.8 s) is added for the next shake (at most 3 s in
//     all); after a shake he wins or ties, the slack shrinks to 60 %.
//   - A new level (a stronger creature than any he has calibrated) starts slightly harder: 90 % of his average on the
//     nearest easier level, then calibrates again from his own calls there.
//   - Until a level has an average, the creature's built-in time is used (game.js reactMs fallback).
//   - His record against each creature (S.rivals, its last 5 results): every extra win over losses makes THAT creature
//     6 % quicker, every extra loss 6 % slower (from 25 % quicker to 25 % slower).
//   - Grown-ups can switch to a fixed time in the Parent corner: S.set.paceMode = 'manual', S.set.paceSec seconds,
//     give or take 0.75 s (no calibration, no record, no slack).
//   - The measurements belong to the save, so they follow whoever is signed in (the cloud save of that account).
var Pace = (function () {
  var STEP_UP = 0.9, SLACK_MAX = 3000, MIN_MS = 1500, MAX_MS = 15000;
  var FACTOR = [1.3, 1.5, 1.3, 1.15, 1.0, 0.9];   // by stars (index 0 unused); each fire icon takes 0.05 off
  var moveAt = 0, called = false;
  function st() {
    var p = S.pace;
    if (!p || typeof p !== 'object') p = S.pace = { v: 1, lv: {} };
    if (!p.lv || typeof p.lv !== 'object') p.lv = {};
    return p;
  }
  function active() { return !!G && G.mode !== 'tutorial' && G.mode !== 'online' && !!G.players && !G.players[0].ai && G.players.some(function (p) { return p.ai; }); }
  function key() {
    var best = -1;
    G.players.forEach(function (p) { if (p.ai) { var i = OPPONENTS.indexOf(p.ai); if (i > best) best = i; } });
    return best < 0 ? null : String(best);
  }
  function lvl(k, make) {
    var p = st(), L = p.lv[k];
    if (!L && make) {
      var prev = null;
      for (var i = +k - 1; i >= 0; i--) if (p.lv[i] && p.lv[i].avg > 0) { prev = p.lv[i]; break; }
      L = p.lv[k] = { n: prev ? 1 : 0, avg: prev ? Math.round(prev.avg * STEP_UP) : 0, slack: 0, from: prev ? 'step' : '' };
    }
    return L || null;
  }
  // a move (or a Goal) just landed: the clock for his next call starts
  function moved() { moveAt = performance.now(); called = false; }
  // he called Now! or Impossible!
  function kidCalled() {
    if (!active() || !moveAt || called) return;
    called = true;
    var dt = performance.now() - moveAt;
    if (dt < 500 || dt > 45000) return;               // a slip of the finger, or he wandered off
    var k = key(); if (k == null) return;
    var L = lvl(k, true);
    L.n = (L.n || 0) + 1;
    var w = Math.max(0.15, 1 / Math.min(L.n, 8));    // the first calls settle the average fast, then the newest count 15 %
    L.avg = Math.round(L.avg > 0 ? L.avg * (1 - w) + dt * w : dt);
    L.from = '';
    persist();
  }
  // the shake is over: kidLost = he scored less than the best creature
  function shakeEnd(kidLost) {
    if (!active()) return;
    var k = key(); if (k == null) return;
    var L = lvl(k, true);
    L.slack = kidLost ? Math.min(SLACK_MAX, (L.slack || 0) + 300 + Math.round(Math.random() * 500)) : Math.round((L.slack || 0) * 0.6);
    persist();
  }
  // his last 5 results against this creature: wins - losses -> 0.75 .. 1.25 (fewer wins for him = more time)
  function recordFactor(o) {
    var r = S.rivals && o && S.rivals[o.id], list = r && Array.isArray(r.r) ? r.r : [];
    var d = 0; list.forEach(function (x) { if (x && x[0] === 'w') d++; else if (x && x[0] === 'l') d--; });
    return Math.max(0.75, Math.min(1.25, 1 - 0.06 * d));
  }
  function manual() { return S.set && S.set.paceMode === 'manual'; }
  // how long creature p takes to call Now! / Impossible!; base = its built-in time
  function reactMs(p, base) {
    if (!active() || !G.players[p] || !G.players[p].ai) return base;
    if (manual()) { var sec = Math.max(0.5, Math.min(20, +S.set.paceSec || 5)); return Math.round(sec * 1000 + (Math.random() * 2 - 1) * 750); }
    var k = key(); if (k == null) return base;
    var L = lvl(k, true);
    if (!(L.avg > 0)) return base * recordFactor(G.players[p].ai) + (L.slack || 0);
    var o = G.players[p].ai, f = ((FACTOR[o.stars] || 1) - 0.05 * (o.fire || 0)) * recordFactor(o);
    return Math.max(MIN_MS, Math.min(MAX_MS, L.avg * f + (L.slack || 0) + Math.random() * 900));
  }
  // for Tata: one line per level that has a measurement
  function parentHTML() {
    var p = st(), rows = Object.keys(p.lv).filter(function (k) { return p.lv[k].avg > 0 && OPPONENTS[k]; }).sort(function (a, b) { return a - b; });
    var body = rows.length ? rows.map(function (k) {
      var L = p.lv[k];
      return '<li><b>' + esc(OPPONENTS[k].name) + '</b>: he calls in about ' + (L.avg / 1000).toFixed(1) + ' s' +
        (L.from === 'step' ? ' (started 10 % quicker than the level before; measuring now)' : ' (' + L.n + ' call' + (L.n === 1 ? '' : 's') + ')') +
        (L.slack > 0 ? ', creatures ' + (L.slack / 1000).toFixed(1) + ' s slower after lost shakes' : '') + '</li>';
    }).join('') : '<li>No calls measured yet: creatures use their own speed.</li>';
    return '<div class="setrow" style="display:block"><label>Creature reaction speed (three at the table)<br><small style="font-weight:600">Set from how quickly ' + esc(S.name) + ' calls Now! or Impossible!, per level. Slower after a lost shake; a new level starts a little quicker.</small></label><ul style="margin:6px 0 0 18px;font-size:14px">' + body + '</ul></div>';
  }
  return { recordFactor: recordFactor, manual: manual, moved: moved, kidCalled: kidCalled, shakeEnd: shakeEnd, reactMs: reactMs, parentHTML: parentHTML, _lvl: lvl, _key: key };
})();
