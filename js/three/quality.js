// Quality tiers for the 3D table, chosen by measuring real frame times.
//
//   level 2 'high'   : soft shadows (2048 map) + glow on bright lights, pixel ratio up to 2
//   level 1 'medium' : soft shadows (1024 map), no glow, pixel ratio up to 1.5   (an automatic stepping stone)
//   level 0 'low'    : no shadow map (the cheap contact blobs under the cubes stay), no glow, pixel ratio 1
//
// Mode comes from S.set.quality: 'auto' (default) | 'low' | 'high' ('medium' is accepted too).
//
// Auto mode, the rule:
//   1. Start: the level measured on this device before (kept 4 days) if there is one; otherwise 'medium' on a touch
//      device (a tablet or phone: coarse pointer, or an iPad that reports itself as a Mac) and 'high' elsewhere.
//      The venue (crowd figures, shadows) is built for the level in use, so tablets start on the medium figure tier.
//   2. Every pair of consecutive rendered animation frames is timed (the pour, the cubes flying, the crowd cheering...).
//      After a short settle, a window of 30 such gaps decides: more than 55% slower than 25 ms -> one level down;
//      more than 85% slower than 45 ms -> two levels down. Takes about a second of animation. Never steps up by itself.
//   3. Only measured while the page is visible: a window is thrown away when the tab was hidden at any moment during it
//      (background tabs throttle frames), gaps over 150 ms and watchdog frames never count, and a step-down is only
//      remembered on the device when it was measured with the tab visible and focused the whole window.
//   table.js rebuilds the venue at the start of the next pour when the level has dropped below what it was built for.
//
// createQuality(apply) -> { level, name(), mode(), set(q), sample(now, rendered, fromWatchdog), forget(), stats(), log() }
// apply(level, LEVELS[level]) is called whenever the level changes (and once at start).

export var LEVELS = [
  { name: 'low', pr: 1, shadow: 0, glow: false },
  { name: 'medium', pr: 1.5, shadow: 1024, glow: false },
  { name: 'high', pr: 2, shadow: 2048, glow: true }
];
var KEY = 'tataEq.quality3d', KEEP_MS = 4 * 24 * 3600 * 1000;
var WINDOW = 30, SLOW_MS = 25, SLOW_SHARE = 0.55, SETTLE = 8, VSLOW_MS = 45, VSLOW_SHARE = 0.85;
// a tablet or phone (not a laptop that merely has a touch screen)
export function touchDevice() {
  try {
    var n = navigator, coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    var ipad = /iPad|iPhone|iPod|Android/.test(n.userAgent) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
    return coarse || ipad;
  } catch (e) { return false; }
}

function byName(q) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].name === q) return i; return -1; }
function readStored() {
  try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.t && Date.now() - o.t < KEEP_MS && o.lvl >= 0 && o.lvl < LEVELS.length) return o.lvl; } catch (e) {}
  return -1;
}
function store(lvl) { try { localStorage.setItem(KEY, JSON.stringify({ lvl: lvl, t: Date.now() })); } catch (e) {} }
function settingMode() {
  var q = (typeof S !== 'undefined' && S && S.set) ? S.set.quality : null;
  return (q === 'low' || q === 'medium' || q === 'high') ? q : 'auto';
}

export function createQuality(apply) {
  var mode = 'auto', level = 2, n = 0, slow = 0, vslow = 0, skip = SETTLE, prev = 0, prevOK = false, log = [], clean = true;
  function restart() { n = slow = vslow = 0; skip = SETTLE; prevOK = false; clean = true; }
  function setLevel(l, why) {
    l = Math.max(0, Math.min(LEVELS.length - 1, l));
    if (log.length > 20) log.shift();
    log.push({ t: Math.round(performance.now()), from: level, to: l, why: why });
    level = l; restart();
    apply(level, LEVELS[level]);
  }
  // hidden at any moment (or focus lost): this window's frames may be throttled, start over
  try {
    document.addEventListener('visibilitychange', restart);
    window.addEventListener('blur', function () { clean = false; });
  } catch (e) {}
  function choose(q) {
    mode = q || settingMode();
    if (mode !== 'auto') { setLevel(byName(mode), 'setting'); return; }
    var st = readStored(), touch = touchDevice();
    setLevel(st >= 0 ? st : touch ? 1 : 2, st >= 0 ? 'remembered' : touch ? 'start (touch device)' : 'start');
  }
  var Q = {
    get level() { return level; },
    name: function () { return LEVELS[level].name; },
    mode: function () { return mode; },
    log: function () { return log.slice(); },
    // q: 'auto' | 'low' | 'medium' | 'high'; anything else re-reads S.set.quality
    set: function (q) { choose(q === 'auto' || byName(q) >= 0 ? q : null); },
    // forget the remembered measurement (used by setQuality('auto') so a fresh measurement can happen)
    forget: function () { try { localStorage.removeItem(KEY); } catch (e) {} },
    // Feed every animation frame. Only gaps between two consecutive *rendered* rAF frames count.
    sample: function (now, rendered, fromWatchdog) {
      if (fromWatchdog || !rendered || document.hidden) { prevOK = false; return; }
      if (prevOK && mode === 'auto' && level > 0) {
        var gap = now - prev;
        if (gap < 150) {
          if (skip > 0) skip--; // frames right after a change include shader compiles and new shadow maps
          else {
            n++; if (gap > SLOW_MS) slow++; if (gap > VSLOW_MS) vslow++;
            if (n >= WINDOW) {
              var keep = clean && !document.hidden && (!document.hasFocus || document.hasFocus()), drop = vslow > WINDOW * VSLOW_SHARE ? 2 : slow > WINDOW * SLOW_SHARE ? 1 : 0;
              if (drop) { setLevel(level - drop, 'slow ' + slow + '/' + n + (drop > 1 ? ' (very)' : '') + (keep ? '' : ' (not remembered)')); if (keep) store(level); }
              else restart();
            }
          }
        }
      }
      prev = now; prevOK = true;
    },
    stats: function () { return { level: level, name: LEVELS[level].name, mode: mode, window: n, slow: slow, touch: touchDevice() }; }
  };
  choose();
  return Q;
}
