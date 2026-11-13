// Quality tiers for the 3D table, chosen by measuring real frame times.
//
//   level 2 'high'   : soft shadows (2048 map) + glow on bright lights, pixel ratio up to 2, full weather / fireworks
//   level 1 'medium' : soft shadows (1024 map), no glow, pixel ratio up to 1.5, fewer particles, medium crowd figures
//   level 0 'low'    : no shadow map (the cheap contact blobs under the cubes stay), no glow, pixel ratio 1, the fewest
//                      particles, the simplest crowd figures
//   level 0 'low' + scaled : the same, drawn at 0.75 of the screen's pixels (the last resort for a very slow device)
//
// So the costliest things go first: glow and the big shadow map (high -> medium), then shadows, crowd detail and most
// particles (medium -> low), then resolution (low -> low scaled). Other modules read the level number (0..2) only.
//
// Mode comes from S.set.quality: 'auto' (default) | 'low' | 'high' ('medium' is accepted too).
//
// Auto mode, the rule:
//   1. Start: the level measured on this device before (kept 30 days) if there is one; otherwise 'medium' on a touch
//      device (a tablet or phone: coarse pointer, or an iPad that reports itself as a Mac) and 'high' elsewhere.
//      The venue (crowd figures, shadows) is built for the level in use, so tablets start on the medium figure tier.
//   2. Every pair of consecutive rendered animation frames is timed (the pour, the cubes flying, the crowd cheering...).
//      After a short settle, a window of 30 such gaps decides: more than 55% slower than 25 ms -> one step down;
//      more than 85% slower than 45 ms -> two steps down. Takes about a second of animation.
//   3. Only measured while the page is visible: a window is thrown away when the tab was hidden at any moment during it
//      (background tabs throttle frames), gaps over 150 ms and watchdog frames never count, and a step is only
//      remembered on the device when it was measured with the tab visible and focused the whole window.
//   4. Never stuck low: when the level in use is below this device's starting level, after 6 clean, fast windows in a
//      row (at most 10% of gaps over 20 ms: about 6 seconds of smooth animation) it tries ONE step up, once per visit.
//      If that step makes frames slow again it goes back down at once and does not try again for 7 days; if it holds
//      for 4 windows it is remembered.
//   table.js rebuilds the venue at the start of the next pour when the level has changed from what it was built for.
//
// createQuality(apply) -> { level, name(), mode(), set(q), sample(now, rendered, fromWatchdog), forget(), stats(), log(), frames() }
// apply(level, L) is called whenever the level changes (and once at start); L = { name, pr, shadow, glow, scaled }.
//
// PERF overlay: ?perf=1 in the address (or localStorage 'tataEq.perf' = '1', the Parent corner switch) loads js/perf.js.

export var LEVELS = [
  { name: 'low', pr: 1, shadow: 0, glow: false },
  { name: 'medium', pr: 1.5, shadow: 1024, glow: false },
  { name: 'high', pr: 2, shadow: 2048, glow: true }
];
var SCALED = { name: 'low', pr: 0.75, shadow: 0, glow: false, scaled: true };
var KEY = 'tataEq.quality3d', KEEP_MS = 30 * 24 * 3600 * 1000, PROBE_WAIT_MS = 7 * 24 * 3600 * 1000;
var WINDOW = 30, SLOW_MS = 25, SLOW_SHARE = 0.55, SETTLE = 8, VSLOW_MS = 45, VSLOW_SHARE = 0.85;
var FAST_MS = 20, FAST_SHARE = 0.1, FAST_WINDOWS = 6, HOLD_WINDOWS = 4;
// a tablet or phone (not a laptop that merely has a touch screen)
export function touchDevice() {
  try {
    var n = navigator, coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    var ipad = /iPad|iPhone|iPod|Android/.test(n.userAgent) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
    return coarse || ipad;
  } catch (e) { return false; }
}

function byName(q) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].name === q) return i; return -1; }
function readAll() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } }
function readStored() {
  var o = readAll();
  if (o && o.t && Date.now() - o.t < KEEP_MS && o.lvl >= 0 && o.lvl < LEVELS.length) return { lvl: o.lvl, scaled: !!o.scaled };
  return null;
}
function store(lvl, scaled) { try { var o = readAll(); o.lvl = lvl; o.scaled = !!scaled; o.t = Date.now(); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
function probeFailedRecently() { var o = readAll(); return !!(o.pf && Date.now() - o.pf < PROBE_WAIT_MS); }
function markProbeFailed() { try { var o = readAll(); o.pf = Date.now(); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
function settingMode() {
  var q = (typeof S !== 'undefined' && S && S.set) ? S.set.quality : null;
  return (q === 'low' || q === 'medium' || q === 'high') ? q : 'auto';
}
// rank: 0 = low scaled, 1 = low, 2 = medium, 3 = high
function rankOf(l, sc) { return l === 0 && sc ? 0 : l + 1; }

export function createQuality(apply) {
  var mode = 'auto', level = 2, scaled = false, n = 0, slow = 0, vslow = 0, fastGaps = 0, skip = SETTLE, prev = 0, prevOK = false, log = [], clean = true;
  var startRank = 3, fastRun = 0, probe = null, probedThisVisit = false;
  var ring = new Float32Array(600), ringN = 0; // the last 600 rendered-frame gaps, for the PERF overlay
  function restart() { n = slow = vslow = fastGaps = 0; skip = SETTLE; prevOK = false; clean = true; }
  function setRank(r, why) {
    r = Math.max(0, Math.min(3, r));
    var l = r === 0 ? 0 : r - 1, sc = r === 0;
    if (log.length > 30) log.shift();
    log.push({ t: Math.round(performance.now()), from: level + (scaled ? 's' : ''), to: l + (sc ? 's' : ''), why: why });
    level = l; scaled = sc; restart(); fastRun = 0;
    apply(level, scaled ? SCALED : LEVELS[level]);
  }
  // hidden at any moment (or focus lost): this window's frames may be throttled, start over
  try {
    document.addEventListener('visibilitychange', restart);
    window.addEventListener('blur', function () { clean = false; });
  } catch (e) {}
  function choose(q) {
    mode = q || settingMode(); probe = null;
    if (mode !== 'auto') { setRank(byName(mode) + 1, 'setting'); return; }
    var st = readStored(), touch = touchDevice();
    startRank = touch ? 2 : 3;
    if (st) setRank(rankOf(st.lvl, st.scaled), 'remembered'); else setRank(startRank, touch ? 'start (touch device)' : 'start');
  }
  function windowDone(keep) {
    var r = rankOf(level, scaled), drop = vslow > WINDOW * VSLOW_SHARE ? 2 : slow > WINDOW * SLOW_SHARE ? 1 : 0;
    if (probe) {
      if (drop) { setRank(probe.from, 'probe failed: slow ' + slow + '/' + n); markProbeFailed(); probe = null; return; }
      if (++probe.held >= HOLD_WINDOWS) { if (keep) store(level, scaled); log.push({ t: Math.round(performance.now()), from: '', to: level + (scaled ? 's' : ''), why: 'probe held' + (keep ? '' : ' (not remembered)') }); probe = null; }
      restart(); return;
    }
    if (drop && r > 0) { setRank(r - drop, 'slow ' + slow + '/' + n + (drop > 1 ? ' (very)' : '') + (keep ? '' : ' (not remembered)')); if (keep) store(level, scaled); return; }
    // fast and clean: count towards one careful step back up
    if (keep && fastGaps <= WINDOW * FAST_SHARE) fastRun++; else fastRun = 0;
    if (fastRun >= FAST_WINDOWS && r < startRank && !probedThisVisit && !probeFailedRecently()) {
      probedThisVisit = true; var from = r; setRank(r + 1, 'probe up (smooth for ' + FAST_WINDOWS + ' windows)'); probe = { from: from, held: 0 }; return;
    }
    restart();
  }
  var Q = {
    get level() { return level; },
    get scaled() { return scaled; },
    name: function () { return LEVELS[level].name; },
    mode: function () { return mode; },
    log: function () { return log.slice(); },
    // q: 'auto' | 'low' | 'medium' | 'high'; anything else re-reads S.set.quality
    set: function (q) { choose(q === 'auto' || byName(q) >= 0 ? q : null); },
    // forget the remembered measurement (used by setQuality('auto') so a fresh measurement can happen)
    forget: function () { try { localStorage.removeItem(KEY); } catch (e) {} probedThisVisit = false; },
    // Feed every animation frame. Only gaps between two consecutive *rendered* rAF frames count.
    sample: function (now, rendered, fromWatchdog) {
      if (fromWatchdog || !rendered || document.hidden) { prevOK = false; return; }
      if (prevOK) {
        var gap = now - prev;
        if (gap < 150) {
          ring[ringN % ring.length] = gap; ringN++;
          if (mode === 'auto') {
            if (skip > 0) skip--; // frames right after a change include shader compiles and new shadow maps
            else {
              n++; if (gap > SLOW_MS) slow++; if (gap > VSLOW_MS) vslow++; if (gap > FAST_MS) fastGaps++;
              if (n >= WINDOW) windowDone(clean && !document.hidden && (!document.hasFocus || document.hasFocus()));
            }
          }
        }
      }
      prev = now; prevOK = true;
    },
    // the last rendered-frame gaps in ms, oldest first (PERF overlay)
    frames: function () { var k = Math.min(ringN, ring.length), out = new Array(k); for (var i = 0; i < k; i++) out[i] = ring[(ringN - k + i) % ring.length]; return out; },
    stats: function () { return { level: level, name: LEVELS[level].name, scaled: scaled, mode: mode, window: n, slow: slow, fastRun: fastRun, probe: !!probe, startLevel: startRank === 3 ? 'high' : 'medium', touch: touchDevice(), remembered: readStored() }; }
  };
  choose();
  return Q;
}

// PERF: load the performance overlay (js/perf.js) when asked: ?perf=1 or the Parent corner switch (localStorage).
export function perfWanted() {
  try { return /[?&]perf=1\b/.test(location.search) || localStorage.getItem('tataEq.perf') === '1'; } catch (e) { return false; }
}
(function () {
  try {
    window.tataLoadPerf = function () {
      if (window.PerfHUD) { window.PerfHUD.show(); return; }
      var s = document.createElement('script'); s.src = 'js/perf.js'; s.onload = function () { try { window.PerfHUD.show(); } catch (e) {} }; document.head.appendChild(s);
    };
    if (perfWanted()) setTimeout(window.tataLoadPerf, 500);
  } catch (e) {}
})();
