// Quality tiers for the 3D table, chosen by measuring real frame times.
//
//   level 2 'high'   : soft shadows (2048 map) + glow on bright lights, pixel ratio up to 2
//   level 1 'medium' : soft shadows (1024 map), no glow, pixel ratio up to 1.5   (an automatic stepping stone)
//   level 0 'low'    : no shadow map (the cheap contact blobs under the cubes stay), no glow, pixel ratio 1
//
// Mode comes from S.set.quality: 'auto' (default) | 'low' | 'high' ('medium' is accepted too).
// In auto mode the gaps between consecutive rendered animation frames are watched (the dice pour is the
// first long stretch of animation); if most frames in a window take longer than ~25 ms the level steps down
// one notch. It never steps up by itself. The measured level is remembered on this device for a few days
// so an iPad that struggled once starts at the right level next time.
//
// createQuality(apply) -> { level, name(), mode(), set(q), sample(now, rendered, fromWatchdog), reset() }
// apply(level, LEVELS[level]) is called whenever the level changes (and once at start).

export var LEVELS = [
  { name: 'low', pr: 1, shadow: 0, glow: false },
  { name: 'medium', pr: 1.5, shadow: 1024, glow: false },
  { name: 'high', pr: 2, shadow: 2048, glow: true }
];
var KEY = 'tataEq.quality3d', KEEP_MS = 4 * 24 * 3600 * 1000;
var WINDOW = 40, SLOW_MS = 25, SLOW_SHARE = 0.55, SETTLE = 12;

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
  var mode = 'auto', level = 2, n = 0, slow = 0, skip = SETTLE, prev = 0, prevOK = false, log = [];
  function setLevel(l, why) {
    l = Math.max(0, Math.min(LEVELS.length - 1, l));
    if (log.length > 20) log.shift();
    log.push({ t: Math.round(performance.now()), from: level, to: l, why: why });
    level = l; n = slow = 0; skip = SETTLE; prevOK = false;
    apply(level, LEVELS[level]);
  }
  function choose(q) {
    mode = q || settingMode();
    if (mode !== 'auto') { setLevel(byName(mode), 'setting'); return; }
    var st = readStored();
    setLevel(st >= 0 ? st : 2, st >= 0 ? 'remembered' : 'start');
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
            n++; if (gap > SLOW_MS) slow++;
            if (n >= WINDOW) {
              if (slow > WINDOW * SLOW_SHARE) { setLevel(level - 1, 'slow ' + slow + '/' + n); store(level); }
              n = slow = 0;
            }
          }
        }
      }
      prev = now; prevOK = true;
    },
    stats: function () { return { level: level, name: LEVELS[level].name, mode: mode, window: n, slow: slow }; }
  };
  choose();
  return Q;
}
