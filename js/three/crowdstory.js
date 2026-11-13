// The crowd as a character: what the supporters know about him (read from the saved progress and the game on the
// table) and what a reaction means right now. No 3D here: crowd.js and crowdshow.js ask, this file answers.
//
//   palette()        { home: {shirt, alt, trim, seat}, away: {...}, awayName, awayId } the home end wears his kit
//                    (S.kit), the away section the colours of the creature he is playing (OPPONENTS[i].color, made bolder)
//   sig()            a short string that changes when the kit, his number / shirt name or the opponent changes
//   bannerLines(n)   n hand-made banner lines for the home end (his shirt name, his number, friendly maths puns)
//   rivalLine()      the away fans' own banner once a rivalry has formed (S.rivals[id].n >= 3), else ''
//   found()          the Spot the Fan characters he has found (S.fans.k)
//   moment(kind, o)  what a T3.crowd(kind, opts) call means: 'kickoff' | 'trophy' | 'win' | 'brilliant' | 'shake' |
//                    'goal' | 'replay' | 'challenge' | 'lost' | 'move' | 'plain' (read from G, Matchday, T3.replayActive)
//   calm(), reduced() A11y.calm() ("Reduce flashing") and prefers-reduced-motion
//
// Everything is feature-detected and wrapped: with no game loaded (the title screen) it answers with safe defaults.

function W() { return typeof window !== 'undefined' ? window : {}; }
function gS() { var w = W(); return w.S || null; }
function gG() { var w = W(); try { return typeof w.G !== 'undefined' ? w.G : null; } catch (e) { return null; } }
function hex(c, d) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : d; }

// ----- colour helpers (no THREE: this file is also loaded by node checks) -----
function toRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
function toHex(r) { return '#' + r.map(function (v) { var k = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return k.length < 2 ? '0' + k : k; }).join(''); }
function hsl(h) {
  var c = toRgb(h), mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), l = (mx + mn) / 2, s = 0, hu = 0, d = mx - mn;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hu = mx === c[0] ? (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0) : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
    hu /= 6;
  }
  return [hu, s, l];
}
function fromHsl(h, s, l) {
  function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
  if (s < 1e-6) return toHex([l, l, l]);
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return toHex([f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)]);
}
export function shade(h, k) { var c = toRgb(h); return toHex([c[0] * k, c[1] * k, c[2] * k]); }
export function mix(a, b, k) { var x = toRgb(a), y = toRgb(b); return toHex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]); }
// a creature's pastel card colour made into a proper football shirt colour
export function bold(h) { var c = hsl(h); return fromHsl(c[0], Math.max(0.55, Math.min(0.85, c[1] * 1.1)), 0.47); }
function lum(h) { var c = toRgb(h); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }

// ----- who he is -----
export function kit() { var S = gS(), k = (S && S.kit) || {}; return { shirt: hex(k.shirt, '#c9342c'), trim: hex(k.trim, '#2f8f7c') }; }
export function shirtName() {
  var w = W(), n = '';
  try { n = typeof w.backName === 'function' ? w.backName() : (gS() && gS().name) || ''; } catch (e) { n = ''; }
  n = String(n || '').toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 12);
  return n || 'OUR HERO';
}
export function firstName() { var n = shirtName().split(' ')[0].replace(/[^A-Z0-9'-]/g, ''); return n || 'HERO'; }
export function jersey() { var S = gS(), j = String((S && S.jersey) || '7').replace(/[^0-9]/g, '').slice(0, 2); return j || '7'; }

// the creature he is playing right now (the first creature at the table), or null
export function opponent() {
  var G = gG(), w = W();
  try {
    if (!G || !G.players) return null;
    for (var i = 0; i < G.players.length; i++) { var a = G.players[i] && G.players[i].ai; if (a && a.id && a.name && a.id !== 'pip') return a; }
  } catch (e) {}
  return null;
}
export function palette() {
  var k = kit(), o = opponent(), home = { shirt: k.shirt, alt: shade(k.shirt, 0.8), trim: k.trim, seat: mix(k.shirt, '#5a5f6a', 0.18) };
  var ac = o && o.color ? bold(o.color) : '#4a6fa5';
  if (Math.abs(lum(ac) - lum(home.shirt)) < 0.04 && Math.abs(hsl(ac)[0] - hsl(home.shirt)[0]) < 0.06) ac = fromHsl((hsl(ac)[0] + 0.5) % 1, 0.6, 0.47); // never the same as his kit
  var trim = lum(ac) > 0.45 ? shade(ac, 0.45) : '#f8f9fa';
  return { home: home, away: { shirt: ac, alt: shade(ac, 0.8), trim: trim, seat: mix(ac, '#5a5f6a', 0.18) }, awayName: o ? String(o.name).toUpperCase() : '', awayId: o ? o.id : '' };
}
export function sig() { var p = palette(); return [p.home.shirt, p.home.trim, p.away.shirt, p.awayId, jersey(), shirtName(), rivalLine()].join('|'); }

// ----- banners: original lines, kind and a bit silly -----
var PUNS = [
  function (n, j) { return n + ' ' + j; },
  function (n, j, f) { return 'GO ' + f + ' GO!'; },
  function () { return 'WE ♥ MATHS'; },
  function (n, j, f) { return f + ' + GOALS = ♥'; },
  function (n, j) { return 'LUCKY NUMBER ' + j; },
  function () { return 'SUM-BODY STOP HIM!'; },
  function (n, j, f) { return 'TATA ♥ ' + f; },
  function () { return '1 + 1 = WIN!'; },
  function (n, j, f) { return '√ ROOT FOR ' + f; },
  function (n, j, f) { return '100% ' + f; },
  function () { return 'NUMBERS ARE FUN!'; },
  function (n, j, f) { return f + ' = OUR HERO'; }
];
export function bannerLines(n) {
  var nm = shirtName(), j = jersey(), f = firstName(), out = [];
  for (var i = 0; i < Math.min(n, PUNS.length); i++) out.push(PUNS[i](nm, j, f));
  return out;
}
export function rivalLine() {
  var S = gS(), o = opponent();
  try {
    if (!S || !o || !S.rivals || !S.rivals[o.id]) return '';
    var r = S.rivals[o.id], n = +r.n || 0, name = String(o.name).toUpperCase().slice(0, 10);
    if (n < 3) return '';
    return n >= 10 ? 'OLD FRIENDS: ' + name + ' & ' + firstName() : n >= 6 ? name + "'S CREW IS BACK!" : name + ' FAN CLUB';
  } catch (e) { return ''; }
}
export function found() {
  var S = gS(), out = [];
  try { var k = S && S.fans && S.fans.k; if (k && typeof k === 'object') for (var key in k) if (k[key]) out.push(key); } catch (e) {}
  return out;
}

// ----- accessibility -----
export function calm() { var w = W(); try { return !!(w.A11y && typeof w.A11y.calm === 'function' && w.A11y.calm()); } catch (e) { return false; } }
export function reduced() { var w = W(); try { return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }

// ----- what a reaction means right now -----
function mdActive() { var w = W(); try { return w.Matchday && typeof w.Matchday.active === 'function' ? w.Matchday.active() : ''; } catch (e) { return ''; } }
function replaying() { var w = W(); try { return !!(w.T3 && typeof w.T3.replayActive === 'function' && w.T3.replayActive()); } catch (e) { return false; } }
var lastGoalRef = null;
export function moment(kind, opts) {
  opts = opts || {};
  var md = mdActive(), G = gG();
  if (kind === 'gasp') return 'challenge';
  if (kind === 'aw' || kind === 'aww') return 'lost';
  if (kind === 'clap') return 'move';
  if (md === 'walkout') return 'kickoff';
  if (md === 'lift') return 'trophy';
  if (replaying()) return 'replay';
  try {
    if (G && G.phase === 'over' && G.players && G.players.length > 1 && opts.wave) {
      var me = G.players[0].score, best = 0;
      for (var i = 1; i < G.players.length; i++) best = Math.max(best, G.players[i].score);
      if (me > best) return 'win';
    }
    if (G && G.phase === 'over' && G.lastShake && kind === 'cheer') {
      var r = G.lastShake, p0 = (r.pts && r.pts[0]) || 0, sol = r.sols && r.sols[0], len = sol && sol.tokens ? sol.tokens.length : 0;
      return p0 >= 6 || len >= 7 ? 'brilliant' : 'shake';
    }
    if (G && G.goalTokens && G.goalTokens !== lastGoalRef && (kind === 'cheer' || kind === 'ooh')) { lastGoalRef = G.goalTokens; return 'goal'; }
  } catch (e) {}
  return 'plain';
}
// the game state the crowd watches between reactions (checked a few times a second while frames are drawn)
export function watch() {
  var G = gG(), md = mdActive();
  return { g: G, shake: G ? G.shake : 0, phase: G ? G.phase : '', replay: replaying(), md: md };
}
