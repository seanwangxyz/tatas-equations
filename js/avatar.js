'use strict';
// ======================= THE AVATAR MAKER =======================
// Everyone who plays makes their own person: body, skin, face, hair, and (through the kit designer) their own kit.
// The look is a People avatar (js/people-data.js is the contract); this file only draws and edits it.
//
//   Avatar.open(target, opts)   target { kind: 'own' } | { kind: 'crew', id } | { kind: 'new' }
//                               opts.onDone(personOrNull): called once when it closes (null = Cancel)
//   Avatar.firstRun(done)       a one-time "Make your player!" invitation for a new save (S.avatarAsked)
//   Avatar.flat(p, view, crop)  SVG string of the flat drawing. p = { avatar, kit (saved or full shape), name, number }
//                               view 'front' | 'side' | 'back'; crop 'bust' (head and shoulders) | 'head'
// Live picture: T3.playerPortrait({ avatar, kit, name, number }, size, view) when 3D is on, the flat drawing meanwhile
// (and always when 3D is off). Nothing moves by itself: a tap on Front / Side / Back changes the view once.
var Avatar = (function () {
  // ---------- the flat drawing ----------
  // per body: head radius, shoulder half-width, neck half-width, neck length (viewBox 0 0 200 220)
  var BODY = { 'kid-s': [52, 56, 14, 14], kid: [49, 63, 15, 17], teen: [45, 71, 16, 21], 'adult-a': [42, 76, 17, 24], 'adult-b': [43, 90, 22, 22] };
  var EYE = { 'kid-s': 1.15, kid: 1.1, teen: 1, 'adult-a': 0.94, 'adult-b': 0.94 };
  function shade(hex, t) {
    var n = parseInt(String(hex).slice(1), 16) || 0, r = n >> 16, g = (n >> 8) & 255, b = n & 255, m = t < 0 ? 0 : 255, a = Math.abs(t);
    r = Math.round(r + (m - r) * a); g = Math.round(g + (m - g) * a); b = Math.round(b + (m - b) * a);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function lum(hex) { var n = parseInt(String(hex).slice(1), 16) || 0; return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; }
  function f(n) { return Math.round(n * 1000) / 1000; }
  // small round bumps along an elliptical arc (angles in degrees, 90 = straight up): curls, coils, the afro's edge
  function bumps(cx, cy, rx, ry, a0, a1, n, r) {
    var s = '';
    for (var i = 0; i < n; i++) { var a = (a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1))) * Math.PI / 180; s += 'M' + f(cx + rx * Math.cos(a) + r) + ' ' + f(cy - ry * Math.sin(a)) + 'a' + r + ' ' + r + ' 0 1 1 ' + f(-2 * r) + ' 0a' + r + ' ' + r + ' 0 1 1 ' + f(2 * r) + ' 0'; }
    return s;
  }
  function chain(x0, y0, x1, y1, n, r) {   // a braid: overlapping beads from (x0,y0) to (x1,y1)
    var s = ''; for (var i = 0; i < n; i++) { var t = i / (n - 1), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, rr = r * (1 - 0.25 * t); s += 'M' + f(x - rr) + ' ' + f(y) + 'a' + f(rr) + ' ' + f(rr * 0.85) + ' 0 1 1 ' + f(2 * rr) + ' 0a' + f(rr) + ' ' + f(rr * 0.85) + ' 0 1 1 ' + f(-2 * rr) + ' 0'; }
    return s;
  }
  // ----- hair shapes, in head units (head = ellipse rx .9, ry 1 at 0,0; y grows downwards) -----
  var CAP = 'M-.98 .1C-1.04 -.8 -.6 -1.16 0 -1.16C.6 -1.16 1.04 -.8 .98 .1';
  var CAPT = 'M-.95 .02C-1 -.76 -.58 -1.07 0 -1.07C.58 -1.07 1 -.76 .95 .02';
  var BACKCAP = CAP + 'C.92 .42 .6 .58 0 .6C-.6 .58 -.92 .42 -.98 .1Z';
  var PULLED = 'L.9 -.05C.86 -.5 .5 -.64 0 -.64C-.5 -.64 -.86 -.5 -.9 -.05Z';
  var PART = 'L.92 .02C.9 -.35 .5 -.62 .05 -.64L0 -.54L-.05 -.64C-.5 -.62 -.9 -.35 -.92 .02Z';
  var FRONT = {
    short: CAP + 'L.9 -.1C.86 -.46 .55 -.56 0 -.56C-.55 -.56 -.86 -.46 -.9 -.1Z',
    swept: CAP + 'L.92 -.12C.84 -.5 .62 -.64 .32 -.62C.02 -.6 -.3 -.46 -.56 -.3C-.72 -.2 -.86 -.12 -.92 .06Z',
    spiky: 'M-.95 .02L-1 -.52L-1.16 -.66L-.88 -.84L-.98 -1.1L-.58 -1.04L-.46 -1.36L-.2 -1.12L0 -1.44L.2 -1.12L.46 -1.36L.58 -1.04L.98 -1.1L.88 -.84L1.16 -.66L1 -.52L.95 .02L.88 -.2C.82 -.44 .56 -.5 .4 -.44L.24 -.58L.06 -.44L-.14 -.58L-.32 -.44C-.52 -.52 -.8 -.44 -.88 -.2Z',
    curly: CAP + 'L.9 -.12C.86 -.42 .55 -.5 0 -.5C-.55 -.5 -.86 -.42 -.9 -.12Z' + bumps(0, -.08, 1, 1.1, -8, 188, 12, .2) + bumps(0, -.5, .58, 0, 180, 0, 5, .15),
    long: CAP + PART,
    tousled: 'M-.98 .1C-1.06 -.6 -.86 -.96 -.62 -1.06L-.5 -1.24L-.3 -1.12L-.1 -1.28L.06 -1.14L.3 -1.24L.42 -1.1C.8 -1.04 1.04 -.7 .98 .1L.9 -.1L.8 -.42L.62 -.3L.5 -.62L.3 -.42L.12 -.64L-.04 -.4L-.24 -.62L-.4 -.36L-.6 -.56L-.72 -.3L-.9 -.1Z',
    buzz: CAPT + 'L.88 -.16C.84 -.46 .55 -.54 0 -.54C-.55 -.54 -.84 -.46 -.88 -.16Z',
    side: CAP + 'L.92 -.1C.9 -.42 .72 -.54 .42 -.56C.12 -.58 -.16 -.54 -.34 -.66C-.56 -.56 -.82 -.44 -.92 -.1Z',
    thin: 'M-.97 .1C-1 -.36 -.86 -.62 -.62 -.74C-.76 -.46 -.82 -.2 -.86 .1ZM.97 .1C1 -.36 .86 -.62 .62 -.74C.76 -.46 .82 -.2 .86 .1Z',
    bald: '',
    coils: CAP + 'L.9 -.14C.86 -.44 .55 -.52 0 -.52C-.55 -.52 -.86 -.44 -.9 -.14Z' + bumps(0, -.1, .98, 1.08, -6, 186, 16, .12),
    afro: CAP + 'L.9 -.1C.86 -.44 .55 -.52 0 -.52C-.55 -.52 -.86 -.44 -.9 -.1Z',
    bob: CAP + 'L.98 .56L.84 .56C.84 .1 .8 -.28 .74 -.32L-.74 -.32C-.8 -.28 -.84 .1 -.84 .56L-.98 .56Z',
    wavy: CAP + PART,
    ponytail: CAP + PULLED, pigtails: CAP + PART, braids: CAP + PART, bun: CAP + PULLED,
    highpony: CAP + PULLED, spacebuns: CAP + PART, halfup: CAP + PART,
    curtain: CAP + 'L.94 .12C.9 -.18 .62 -.4 .2 -.4C.1 -.4 .04 -.5 0 -.58C-.04 -.5 -.1 -.4 -.2 -.4C-.62 -.4 -.9 -.18 -.94 .12Z'
  };
  // hair that hangs behind the head in the front view (and in front of it in the back view)
  var HANG = {
    long: 'M-1 -.3C-1.12 .5 -1.1 1.2 -1.06 1.62L-.62 1.62C-.7 1.1 -.78 .6 -.8 .1ZM1 -.3C1.12 .5 1.1 1.2 1.06 1.62L.62 1.62C.7 1.1 .78 .6 .8 .1Z',
    wavy: 'M-1 -.3C-1.26 .2 -.94 .5 -1.16 .86C-1.3 1.2 -1 1.4 -1.12 1.66L-.64 1.66C-.56 1.4 -.82 1.2 -.7 .9C-.6 .6 -.84 .4 -.8 .1ZM1 -.3C1.26 .2 .94 .5 1.16 .86C1.3 1.2 1 1.4 1.12 1.66L.64 1.66C.56 1.4 .82 1.2 .7 .9C.6 .6 .84 .4 .8 .1Z',
    bob: 'M-1.02 -.4C-1.12 .2 -1.08 .5 -1 .62L1 .62C1.08 .5 1.12 .2 1.02 -.4Z',
    afro: 'M-1.38 -.3a1.38 1.38 0 1 1 2.76 0a1.38 1.38 0 1 1 -2.76 0Z' + bumps(0, -.3, 1.38, 1.38, 0, 340, 18, .24),
    ponytail: 'M.32 -.96C1.1 -1.12 1.36 -.5 1.22 .2C1.16 .6 1.02 .92 .96 1.12C.9 .7 .96 .2 .8 -.3Z',
    pigtails: 'M-.84 -.36C-1.42 -.42 -1.48 .3 -1.26 .78C-1.16 .42 -1 .12 -.9 -.04ZM.84 -.36C1.42 -.42 1.48 .3 1.26 .78C1.16 .42 1 .12 .9 -.04Z',
    braids: chain(-.86, .02, -.92, 1.5, 8, .17) + chain(.86, .02, .92, 1.5, 8, .17),
    bun: 'M-.36 -1.12a.36 .36 0 1 1 .72 0a.36 .36 0 1 1 -.72 0Z',
    highpony: 'M-.24 -1.12a.24 .22 0 1 1 .48 0a.24 .22 0 1 1 -.48 0ZM.1 -1.26C.7 -1.5 1.3 -1.1 1.24 -.3C1.2 .2 1.08 .6 1.02 .86C.96 .4 .96 -.2 .74 -.62C.6 -.9 .4 -1.04 .14 -1.02Z',
    spacebuns: 'M-.92 -.98a.32 .32 0 1 1 .64 0a.32 .32 0 1 1 -.64 0ZM.28 -.98a.32 .32 0 1 1 .64 0a.32 .32 0 1 1 -.64 0Z',
    halfup: 'M-1 -.3C-1.12 .5 -1.1 1.2 -1.06 1.62L-.62 1.62C-.7 1.1 -.78 .6 -.8 .1ZM1 -.3C1.12 .5 1.1 1.2 1.06 1.62L.62 1.62C.7 1.1 .78 .6 .8 .1ZM-.22 -1.14a.22 .2 0 1 1 .44 0a.22 .2 0 1 1 -.44 0Z',
    curtain: 'M-1 -.3C-1.12 .5 -1.1 1.2 -1.06 1.62L-.62 1.62C-.7 1.1 -.78 .6 -.8 .1ZM1 -.3C1.12 .5 1.1 1.2 1.06 1.62L.62 1.62C.7 1.1 .78 .6 .8 .1Z'
  };
  // the back view: the back of the head, plus what hangs down
  var BACKV = {
    thin: 'M-.98 .1C-1 -.3 -.9 -.5 -.75 -.6C-.3 -.4 .3 -.4 .75 -.6C.9 -.5 1 -.3 .98 .1C.92 .42 .6 .58 0 .6C-.6 .58 -.92 .42 -.98 .1Z',
    spiky: BACKCAP + 'M-.8 -.8L-.66 -1.3L-.4 -1.02L-.2 -1.42L0 -1.12L.2 -1.42L.4 -1.02L.66 -1.3L.8 -.8Z',
    curly: BACKCAP + bumps(0, -.05, 1, 1.12, -20, 200, 14, .2), coils: BACKCAP + bumps(0, -.05, .99, 1.1, -20, 200, 18, .12),
    tousled: BACKCAP + 'M-.6 -1.04L-.5 -1.24L-.3 -1.12L-.1 -1.28L.06 -1.14L.3 -1.24L.42 -1.08Z',
    ponytail: BACKCAP + 'M-.18 -.62C-.3 0 -.24 .8 0 1.3C.24 .8 .3 0 .18 -.62Z',
    bun: BACKCAP + 'M-.36 -.86a.36 .36 0 1 1 .72 0a.36 .36 0 1 1 -.72 0Z',
    braids: BACKCAP + chain(-.5, .45, -.58, 1.62, 6, .17) + chain(.5, .45, .58, 1.62, 6, .17),
    highpony: BACKCAP + 'M-.24 -1.06a.24 .22 0 1 1 .48 0a.24 .22 0 1 1 -.48 0ZM-.2 -1C-.34 -.4 -.26 .5 0 1C.26 .5 .34 -.4 .2 -1Z',
    spacebuns: BACKCAP + 'M-.92 -.98a.32 .32 0 1 1 .64 0a.32 .32 0 1 1 -.64 0ZM.28 -.98a.32 .32 0 1 1 .64 0a.32 .32 0 1 1 -.64 0Z',
    halfup: BACKCAP + 'M-.22 -.8a.22 .2 0 1 1 .44 0a.22 .2 0 1 1 -.44 0Z'
  };
  // the side view (facing right): the hair over the top and back of the head, plus extras
  var SIDECAP = 'M.74 -.52C.64 -.92 .3 -1.14 -.12 -1.14C-.64 -1.14 -1.02 -.72 -1.02 -.12C-1.02 .2 -.92 .46 -.76 .58L-.42 .36C-.34 .1 -.24 -.08 -.08 -.14C.12 -.3 .42 -.44 .74 -.52Z';
  var SIDEX = {
    long: 'M-.96 -.3C-1.12 .4 -.92 1.1 -.72 1.62L-.12 1.62C-.32 1.04 -.4 .5 -.4 .2Z',
    wavy: 'M-.96 -.3C-1.2 .3 -.84 .6 -1 1C-1.1 1.3 -.8 1.5 -.82 1.66L-.2 1.66C-.3 1.4 -.5 1.2 -.4 .9C-.3 .6 -.5 .4 -.4 .2Z',
    bob: 'M-1 -.3C-1.08 .2 -1 .5 -.86 .64L-.1 .64C-.3 .4 -.38 .2 -.4 .1Z',
    afro: 'M-1.6 -.36a1.38 1.38 0 1 1 2.76 0a1.38 1.38 0 1 1 -2.76 0Z' + bumps(-.22, -.36, 1.38, 1.38, 0, 340, 18, .24),
    ponytail: 'M-.8 -.7C-1.4 -.7 -1.56 .1 -1.36 .9C-1.2 .5 -1.1 0 -.86 -.3Z',
    pigtails: 'M-.6 -.4C-1.1 -.4 -1.12 .3 -.92 .76C-.84 .4 -.7 .1 -.56 -.04Z',
    braids: chain(-.42, .2, -.5, 1.5, 7, .16),
    bun: 'M-1.08 -.86a.33 .33 0 1 1 .66 0a.33 .33 0 1 1 -.66 0Z',
    spiky: 'M.5 -.8L.6 -1.2L.3 -1L.2 -1.42L0 -1.12L-.2 -1.44L-.36 -1.1L-.66 -1.3L-.7 -.9Z',
    curly: bumps(-.12, -.1, 1, 1.12, 20, 200, 10, .2), coils: bumps(-.12, -.1, .98, 1.1, 20, 200, 13, .12),
    tousled: 'M.5 -.9L.62 -1.16L.3 -1.08L.12 -1.3L-.1 -1.12L-.36 -1.26L-.5 -1Z',
    highpony: 'M-.42 -1.12a.24 .22 0 1 1 .48 0a.24 .22 0 1 1 -.48 0ZM-.3 -1.2C-1 -1.4 -1.5 -.8 -1.4 .1C-1.36 .4 -1.3 .6 -1.24 .76C-1.16 .3 -1.06 -.3 -.84 -.66C-.7 -.9 -.5 -1.02 -.3 -1.02Z',
    spacebuns: 'M-.3 -1.06a.32 .32 0 1 1 .64 0a.32 .32 0 1 1 -.64 0Z',
    halfup: 'M-.96 -.3C-1.12 .4 -.92 1.1 -.72 1.62L-.12 1.62C-.32 1.04 -.4 .5 -.4 .2ZM-.82 -.88a.22 .2 0 1 1 .44 0a.22 .2 0 1 1 -.44 0Z',
    curtain: 'M-.96 -.3C-1.12 .4 -.92 1.1 -.72 1.62L-.12 1.62C-.32 1.04 -.4 .5 -.4 .2Z'
  };
  var SIDE_TOP = { spiky: 1, curly: 1, coils: 1, tousled: 1, spacebuns: 1 };          // side extras drawn over the cap
  var BACK_HANG = { long: 1, wavy: 1, bob: 1, afro: 1, pigtails: 1, curtain: 1, halfup: 1 };   // HANG shapes also seen from behind
  var uid = 0;
  function kitFull(k) { return window.Kit && Kit.fill ? Kit.fill(k || {}) : Object.assign({ shirt: '#c9342c', trim: '#2f8f7c', shorts: '#1f6b5a', pattern: 'waves', collar: 'v', frontNum: true }, k || {}); }
  // drawn twice (a dark outline underneath, the colour on top) so curls and bumps merge into one shape with one outline
  function hairPath(d, col, extra) {
    if (!d) return '';
    var dk = shade(col, lum(col) < 0.12 ? 0.25 : -0.3), parts = subs(d);
    return '<g' + (extra || '') + '><g fill="' + dk + '" stroke="' + dk + '" stroke-width=".07" stroke-linejoin="round">' + parts + '</g><g fill="' + col + '">' + parts + '</g></g>';
  }
  // each sub-shape as its own path, so overlapping shapes never cut holes in each other (whatever way they were drawn)
  function subs(d) { return d.split(/(?=M)/).map(function (x) { return '<path d="' + x + '"/>'; }).join(''); }
  function butterfly(x, y, s, col) {
    var d = shade(col, -0.35);
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M0 0C-.5 -.8 -1.2 -.6 -1 0C-1.2 .5 -.5 .7 0 0C.5 .7 1.2 .5 1 0C1.2 -.6 .5 -.8 0 0Z" fill="' + col + '" stroke="' + d + '" stroke-width=".2"/><path d="M0 -.4V.4" stroke="' + d + '" stroke-width=".28" stroke-linecap="round"/></g>';
  }
  function scrunchie(x, y, col) { return '<path d="' + bumps(x, y, .12, .12, 0, 315, 8, .065) + '" fill="' + col + '" stroke="' + shade(col, -0.3) + '" stroke-width=".02"/>'; }
  // a tiny four-point sparkle (coloured, with a darker edge, so it never reads as a tear)
  function gem(x, y, s, col) {
    var q = s * 0.28;
    return '<path d="M' + x + ' ' + f(y - s) + 'L' + f(x + q) + ' ' + f(y - q) + 'L' + f(x + s) + ' ' + y + 'L' + f(x + q) + ' ' + f(y + q) + 'L' + x + ' ' + f(y + s) + 'L' + f(x - q) + ' ' + f(y + q) + 'L' + f(x - s) + ' ' + y + 'L' + f(x - q) + ' ' + f(y - q) + 'Z" fill="' + col + '" stroke="' + shade(col, -0.45) + '" stroke-width=".018" stroke-linejoin="round"/>';
  }
  function eye(x, y, e, a, rx) {
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(rx * e) + '" ry="' + f(.13 * e) + '" fill="#fff"/>' +
      '<circle cx="' + f(x + (rx < .15 ? .025 : 0)) + '" cy="' + f(y + .01) + '" r="' + f(.095 * e) + '" fill="' + a.eyes + '"/><circle cx="' + f(x + (rx < .15 ? .03 : 0)) + '" cy="' + f(y + .01) + '" r="' + f(.05 * e) + '" fill="#140c08"/>' +
      '<circle cx="' + f(x + .035) + '" cy="' + f(y - .03) + '" r="' + f(.03 * e) + '" fill="#fff"/>' +
      '<path d="M' + f(x - rx * e) + ' ' + f(y - .02) + 'Q' + x + ' ' + f(y - .17 * e) + ' ' + f(x + rx * e) + ' ' + f(y - .02) + '" fill="none" stroke="#2a1a12" stroke-width="' + (a.lashes ? .05 : .025) + '" stroke-linecap="round"/>';
  }
  function browCol(a) { return lum(a.hair) > 0.6 ? shade(a.hair, -0.35) : shade(a.hair, -0.1); }
  // the face, front view (head units)
  function faceFront(a, e) {
    var h = '';
    [-1, 1].forEach(function (s) {
      var x = s * 0.33, y = 0.08;
      h += eye(x, y, e, a, .15) + '<path d="M' + f(x - s * .15) + ' ' + f(y - .28) + 'Q' + x + ' ' + f(y - .37) + ' ' + f(x + s * .16) + ' ' + f(y - .29) + '" fill="none" stroke="' + browCol(a) + '" stroke-width=".06" stroke-linecap="round"/>';
      if (a.lashes) h += '<path d="M' + f(x + s * .14 * e) + ' ' + f(y - .05) + 'l' + f(s * .08) + ' -.07M' + f(x + s * .08 * e) + ' ' + f(y - .11) + 'l' + f(s * .05) + ' -.09" stroke="#2a1a12" stroke-width=".035" stroke-linecap="round"/>';
      if (a.cheeks) h += '<circle cx="' + f(s * .54) + '" cy=".38" r=".13" fill="#ff6f86" opacity=".32"/>';
      if (a.freckles) [[.4, .27], [.5, .22], [.56, .31], [.46, .35], [.62, .24]].forEach(function (p) { h += '<circle cx="' + f(s * p[0]) + '" cy="' + p[1] + '" r=".024" fill="' + shade(a.skin, -0.42) + '" opacity=".85"/>'; });
      if (a.gems) h += gem(f(s * .6), .2, .085, '#b67cff') + gem(f(s * .7), .34, .06, '#3cc8f0') + gem(f(s * .55), .37, .05, '#ff6fb5');
    });
    h += '<path d="M-.04 .24Q.02 .33 .06 .27" fill="none" stroke="' + shade(a.skin, -0.3) + '" stroke-width=".035" stroke-linecap="round"/>';
    if (a.beard === 'stubble') h += '<path d="M-.84 .1Q-.8 .86 0 1Q.8 .86 .84 .1Q.62 .52 .3 .44Q0 .4 -.3 .44Q-.62 .52 -.84 .1Z" fill="' + a.hair + '" opacity=".3"/>';
    if (a.beard === 'goatee') h += hairPath('M-.17 .68Q0 .63 .17 .68Q.15 .92 0 .96Q-.15 .92 -.17 .68Z', a.hair);
    if (a.beard === 'beard') h += hairPath('M-.88 0Q-.92 .72 -.4 .96Q0 1.14 .4 .96Q.92 .72 .88 0Q.76 .46 .46 .52Q.2 .44 0 .47Q-.2 .44 -.46 .52Q-.76 .46 -.88 0Z', a.hair);
    h += '<path d="M-.2 .52Q0 .72 .2 .52Q0 .6 -.2 .52Z" fill="#7a2630" stroke="#7a2630" stroke-width=".03" stroke-linejoin="round"/>';
    if (a.beard === 'moustache' || a.beard === 'goatee' || a.beard === 'beard') h += hairPath('M-.3 .46Q-.16 .34 0 .41Q.16 .34 .3 .46Q.16 .5 0 .46Q-.16 .5 -.3 .46Z', a.hair);
    if (a.glasses !== 'none') {
      var lens = '';
      [-1, 1].forEach(function (s) { lens += a.glasses === 'round' ? '<circle cx="' + f(s * .33) + '" cy=".08" r=".21"/>' : '<rect x="' + f(s * .33 - .22) + '" y="-.08" width=".44" height=".32" rx=".07"/>'; });
      h += '<g fill="#fff" fill-opacity=".18" stroke="' + a.glassCol + '" stroke-width=".05">' + lens + '</g><path d="M-.12 .05Q0 -.01 .12 .05M-.54 .03L-.88 -.02M.54 .03L.88 -.02" fill="none" stroke="' + a.glassCol + '" stroke-width=".045"/>';
    }
    return h;
  }
  // the face in profile, looking right
  function faceSide(a, e) {
    var h = eye(.5, .06, e, a, .09) + '<path d="M.36 -.2Q.5 -.28 .64 -.2" fill="none" stroke="' + browCol(a) + '" stroke-width=".06" stroke-linecap="round"/>';
    if (a.lashes) h += '<path d="M.58 -.04l.07 -.07M.53 -.08l.05 -.09" stroke="#2a1a12" stroke-width=".035" stroke-linecap="round"/>';
    if (a.cheeks) h += '<circle cx=".56" cy=".37" r=".12" fill="#ff6f86" opacity=".32"/>';
    if (a.freckles) [[.5, .26], [.6, .23], [.66, .31], [.55, .33]].forEach(function (p) { h += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r=".024" fill="' + shade(a.skin, -0.42) + '" opacity=".85"/>'; });
    if (a.gems) h += gem(.34, .2, .085, '#b67cff') + gem(.44, .34, .06, '#3cc8f0');
    if (a.beard === 'stubble') h += '<path d="M-.05 .2C.1 .6 .35 .92 .72 .86C.86 .72 .9 .56 .88 .4C.7 .46 .5 .36 .3 .3C.15 .3 .05 .26 -.05 .2Z" fill="' + a.hair + '" opacity=".3"/>';
    if (a.beard === 'goatee') h += hairPath('M.55 .7Q.7 .67 .8 .72Q.76 .93 .58 .9Z', a.hair);
    if (a.beard === 'beard') h += hairPath('M-.06 .1C.05 .6 .3 .96 .7 .9C.88 .76 .92 .6 .9 .5C.75 .5 .62 .44 .5 .38C.3 .34 .12 .24 -.06 .1Z', a.hair);
    h += '<path d="M.64 .54Q.74 .6 .83 .52" fill="none" stroke="#7a2630" stroke-width=".05" stroke-linecap="round"/>';
    if (a.beard === 'moustache' || a.beard === 'goatee' || a.beard === 'beard') h += hairPath('M.62 .44Q.76 .38 .88 .44Q.76 .49 .62 .47Z', a.hair);
    if (a.glasses !== 'none') h += (a.glasses === 'round' ? '<ellipse cx=".55" cy=".07" rx=".1" ry=".19"' : '<rect x=".46" y="-.08" width=".18" height=".3" rx=".05"') + ' fill="#fff" fill-opacity=".18" stroke="' + a.glassCol + '" stroke-width=".05"/><path d="M.45 .03L-.02 -.02" stroke="' + a.glassCol + '" stroke-width=".045"/>';
    return h;
  }
  // coloured streaks: a few strands of another colour, clipped to a hair shape
  function streakIn(d, a, id) {
    if (!d || !a.streaks || a.streaks === 'none') return '';
    return '<clipPath id="' + id + '">' + subs(d) + '</clipPath><g clip-path="url(#' + id + ')" fill="none" stroke="' + a.streaks + '" stroke-width=".12" stroke-linecap="round">' +
      '<path d="M-.5 -1.5C-.56 -.6 -.66 .4 -.84 1.8M-.12 -1.5C-.12 -1 -.06 -.6 -.02 -.36M.56 -1.5C.6 -.6 .7 .4 .86 1.8"/></g>';
  }
  // bow, headband, butterfly clips, scrunchie, cap (head units); s = 1 front, -1 back (mirrored), 0 side
  var TIE = { ponytail: [[.6, -.96], [0, -.62], [-.84, -.66]], highpony: [[0, -1.2], [0, -1.0], [-.3, -1.14]], pigtails: [[-.9, -.32], [.9, -.32], [-.6, -.36]] };
  function accOf(a, view) {
    var c = a.accCol, d = shade(c, -0.3), v = view === 'back' ? 1 : view === 'side' ? 2 : 0, s = view === 'back' ? -1 : 1, h = '';
    if (a.acc === 'bow') {
      var bx = v === 2 ? -.42 : s * .62, by = v === 2 ? -1 : -.88;
      h = '<g transform="translate(' + bx + ' ' + by + ') rotate(' + (v === 2 ? -10 : s * 18) + ')"><path d="M0 0L-.32 -.2L-.32 .2ZM0 0L.32 -.2L.32 .2Z" fill="' + c + '" stroke="' + d + '" stroke-width=".035" stroke-linejoin="round"/><circle r=".08" fill="' + d + '"/></g>';
    } else if (a.acc === 'band') {
      h = '<path d="' + (v === 2 ? 'M.18 -1.14C.02 -.6 -.06 -.3 -.06 -.12' : v === 1 ? 'M-.94 -.1C-.9 .2 .9 .2 .94 -.1' : 'M-.92 -.28C-.86 -1.02 .86 -1.02 .92 -.28') + '" fill="none" stroke="' + c + '" stroke-width=".15" stroke-linecap="round"/>';
    } else if (a.acc === 'clips') {
      var pts = v === 2 ? [[.36, -.76], [.12, -.92]] : v === 1 ? [[-.42, -.5], [.44, -.56]] : [[-.52, -.64], [.5, -.68], [.24, -.84]];
      pts.forEach(function (p, i) { h += butterfly(p[0], p[1], .16,i % 2 ? c : shade(c, 0.35)); });
    } else if (a.acc === 'scrunchie') {
      var t = TIE[a.hairStyle];
      if (a.hairStyle === 'pigtails' && v !== 2) h = scrunchie(-.9, -.32, c) + scrunchie(.9, -.32, c);
      else { var q = t ? t[v] : (v === 2 ? [-.72, -.72] : v === 1 ? [0, -.62] : [.8, -.62]); h = scrunchie(q[0], q[1], c); }
    } else if (a.acc === 'cap') {
      if (v === 2) h = '<path d="M-.94 -.3C-.96 -1.24 .82 -1.24 .86 -.42Z" fill="' + c + '" stroke="' + d + '" stroke-width=".035"/><path d="M.74 -.46L1.5 -.36Q1.3 -.54 .8 -.58Z" fill="' + d + '"/>';
      else h = '<path d="M-.98 -.32C-1 -1.26 1 -1.26 .98 -.32Z" fill="' + c + '" stroke="' + d + '" stroke-width=".035"/><path d="M0 -1.02V-.32" stroke="' + d + '" stroke-width=".03"/><circle cy="-1.02" r=".06" fill="' + d + '"/>' +
        (v === 1 ? '<path d="M-.22 -.32Q0 -.56 .22 -.32Z" fill="' + shade(a.hair, 0) + '"/>' : '<path d="M-1.02 -.34C-.6 -.1 .6 -.1 1.02 -.34C.6 -.24 -.6 -.24 -1.02 -.34Z" fill="' + d + '"/>');
    }
    return h;
  }
  var COVER_EAR = { long: 1, wavy: 1, bob: 1, curtain: 1, halfup: 1, afro: 1 };
  var THIN_SIDE = 'M-1.02 -.12C-1.02 .2 -.92 .46 -.76 .58L-.42 .36C-.4 .1 -.5 -.2 -.7 -.5C-.9 -.5 -1 -.35 -1.02 -.12Z';
  function headAndHair(a, view, e, id, skD) {
    var st = a.hairStyle, hc = a.hair, sk = 'fill="' + a.skin + '" stroke="' + skD + '" stroke-width=".035"', h = '', op = st === 'buzz' ? ' opacity=".62"' : '';
    function ear(x) { return '<ellipse cx="' + x + '" cy=".06" rx=".14" ry=".2" ' + sk + '/><path d="M' + f(x - .04) + ' -.02Q' + x + ' .06 ' + f(x - .03) + ' .14" fill="none" stroke="' + skD + '" stroke-width=".03"/>'; }
    if (view === 'side') {
      var cap = st === 'bald' ? '' : st === 'thin' ? THIN_SIDE : SIDECAP, e1 = ear(-.06);
      h += '<ellipse rx=".92" ry="1" ' + sk + '/><path d="M.88 .06Q1.07 .26 .86 .34" ' + sk + '/>' + faceSide(a, e);
      if (COVER_EAR[st]) h += e1;
      h += hairPath(cap, hc, op) + streakIn(cap, a, id + 'c');
      if (!COVER_EAR[st]) h += e1;
      if (SIDE_TOP[st]) h += hairPath(SIDEX[st], hc);
    } else if (view === 'back') {
      var bk = BACKV[st] || (st === 'bald' ? '' : BACKCAP);
      h += ear(-.9) + ear(.9) + '<ellipse rx=".9" ry="1" ' + sk + '/>' + hairPath(bk, hc, op) + streakIn(bk, a, id + 'c');
      if (BACK_HANG[st]) h += hairPath(HANG[st], hc) + streakIn(HANG[st], a, id + 'b');
    } else {
      var fr = FRONT[st] != null ? FRONT[st] : FRONT.short;
      h += ear(-.9) + ear(.9) + '<ellipse rx=".9" ry="1" ' + sk + '/>';
      if (st === 'bald' || st === 'thin') h += '<ellipse cx="-.32" cy="-.72" rx=".2" ry=".1" fill="#fff" opacity=".3" transform="rotate(-25 -.32 -.72)"/>';
      h += faceFront(a, e) + hairPath(fr, hc, op) + streakIn(fr, a, id + 'c');
      if (st === 'thin') h += '<path d="M-.34 -.94Q0 -1.06 .34 -.94M-.2 -.98Q.04 -1.08 .26 -1" fill="none" stroke="' + hc + '" stroke-width=".04" stroke-linecap="round" opacity=".8"/>';
      if (st !== 'bald' && st !== 'thin' && st !== 'buzz') h += '<path d="M-.5 -.98Q-.2 -1.1 .2 -1.06" fill="none" stroke="#fff" stroke-width=".05" stroke-linecap="round" opacity=".22"/>';
    }
    return h + accOf(a, view);
  }
  // ----- the whole drawing -----
  function flat(p, view, crop) {
    p = p || {};
    var a = People.clean(p.avatar), k = kitFull(p.kit), b = BODY[a.body] || BODY.kid, R = b[0], sw = b[1], nk = b[2], st = a.hairStyle;
    var hy = 98 - (a.height || 0) * 7, sT = f(hy + R * 0.92 + b[3]), id = 'av' + (++uid), e = EYE[a.body] || 1, back = view === 'back', side = view === 'side';
    var skD = shade(a.skin, -0.28), hc = a.hair, dk = shade(k.shirt, -0.2), acc = lum(k.shirt) > 0.55 ? (lum(k.trim) < 0.5 ? k.trim : '#1d2b3a') : '#ffffff';
    function G(inner) { return inner ? '<g transform="translate(100 ' + f(hy) + ') scale(' + R + ')">' + inner + '</g>' : ''; }
    var vb = crop === 'head' ? f(100 - 1.55 * R) + ' ' + f(hy - 1.75 * R) + ' ' + f(3.1 * R) + ' ' + f(3.1 * R) : '0 0 200 220';
    var h = '<svg class="av-flat" viewBox="' + vb + '" aria-hidden="true" focusable="false">';
    // shirt
    var ws = side ? sw * 0.58 : sw, L = 100 - ws, Rr = 100 + ws, top = sT;
    var shirt = side ? 'M' + f(L) + ' 222L' + f(L) + ' ' + f(top + 26) + 'Q' + f(L) + ' ' + f(top + 2) + ' ' + f(100 - nk) + ' ' + f(top - 3) + 'L' + f(100 + nk) + ' ' + f(top - 3) + 'Q' + f(Rr + 2) + ' ' + f(top + 2) + ' ' + f(Rr + 4) + ' ' + f(top + 28) + 'L' + f(Rr) + ' 222Z'
      : 'M' + f(L) + ' 222L' + f(L) + ' ' + f(top + 30) + 'Q' + f(L) + ' ' + f(top + 4) + ' ' + f(L + 28) + ' ' + f(top) + 'L' + f(100 - nk - 4) + ' ' + f(top - 3) + 'Q100 ' + f(top + 12) + ' ' + f(100 + nk + 4) + ' ' + f(top - 3) + 'L' + f(Rr - 28) + ' ' + f(top) + 'Q' + f(Rr) + ' ' + f(top + 4) + ' ' + f(Rr) + ' ' + f(top + 30) + 'L' + f(Rr) + ' 222Z';
    var pat = '';
    if (k.pattern === 'stripes') for (var x = L + 6; x < Rr; x += 18) pat += '<rect x="' + f(x) + '" y="' + top + '" width="8" height="70" fill="' + dk + '"/>';
    else if (k.pattern === 'hoops') for (var y = top + 10; y < 222; y += 16) pat += '<rect x="0" y="' + f(y) + '" width="200" height="7" fill="' + dk + '"/>';
    else if (k.pattern === 'sash') pat = '<path d="M' + f(L + 10) + ' ' + top + 'L' + f(L + 36) + ' ' + top + 'L' + f(Rr) + ' 210L' + f(Rr) + ' 230L' + f(Rr - 20) + ' 230Z" fill="' + dk + '"/>';
    else if (k.pattern === 'waves') for (var w = top + 12; w < 222; w += 9) pat += '<path d="M0 ' + f(w) + 'q10 -3 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0" fill="none" stroke="' + shade(k.shirt, 0.25) + '" stroke-width="1.3" opacity=".5"/>';
    h += '<clipPath id="' + id + 's"><path d="' + shirt + '"/></clipPath><g clip-path="url(#' + id + 's)"><rect width="200" height="222" fill="' + k.shirt + '"/>' + pat + '</g>' +
      '<path d="' + shirt + '" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="2.5" stroke-linejoin="round"/>';
    if (!side) h += '<path d="M' + f(L + 24) + ' ' + f(top + 2) + 'Q' + f(L + 16) + ' ' + f(top + 34) + ' ' + f(L + 20) + ' 222M' + f(Rr - 24) + ' ' + f(top + 2) + 'Q' + f(Rr - 16) + ' ' + f(top + 34) + ' ' + f(Rr - 20) + ' 222" fill="none" stroke="' + dk + '" stroke-width="1.5" opacity=".6"/>';
    if (back) h += '<text x="100" y="' + f(top + 18) + '" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="10" fill="' + acc + '">' + esc(String(p.name || '').toUpperCase().slice(0, 12)) + '</text>' +
      '<text x="100" y="' + f(top + 52) + '" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="32" fill="' + acc + '">' + esc(String(p.number || '')) + '</text>';
    else if (!side && k.frontNum !== false) h += '<text x="100" y="' + f(top + 42) + '" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="18" fill="' + acc + '">' + esc(String(p.number || '')) + '</text>';
    var hang = HANG[st] || '';
    if (!back && !side) h += G(hairPath(hang, hc) + streakIn(hang, a, id + 'h'));
    if (side) h += G(SIDE_TOP[st] ? '' : hairPath(SIDEX[st] || '', hc));
    // neck, collar
    h += '<rect x="' + f(100 - nk) + '" y="' + f(hy + R * 0.55) + '" width="' + f(2 * nk) + '" height="' + f(top - hy - R * 0.55 + 6) + '" fill="' + a.skin + '"/>' +
      '<ellipse cx="100" cy="' + f(hy + R * 0.92) + '" rx="' + f(nk) + '" ry="' + f(nk * 0.45) + '" fill="' + skD + '" opacity=".35"/>';
    if (side) h += '<path d="M' + f(100 - nk - 2) + ' ' + f(top - 3) + 'Q100 ' + f(top + 4) + ' ' + f(100 + nk + 2) + ' ' + f(top - 3) + '" fill="none" stroke="' + k.trim + '" stroke-width="5" stroke-linecap="round"/>';
    else if (back || k.collar === 'round') h += '<path d="M' + f(100 - nk - 4) + ' ' + f(top - 3) + 'Q100 ' + f(top + (back ? 6 : 12)) + ' ' + f(100 + nk + 4) + ' ' + f(top - 3) + '" fill="none" stroke="' + k.trim + '" stroke-width="5" stroke-linecap="round"/>';
    else h += '<path d="M' + f(100 - nk - 3) + ' ' + f(top - 4) + 'L100 ' + f(top + 18) + 'L' + f(100 + nk + 3) + ' ' + f(top - 4) + 'Z" fill="' + a.skin + '"/><path d="M' + f(100 - nk - 4) + ' ' + f(top - 4) + 'L100 ' + f(top + 19) + 'L' + f(100 + nk + 4) + ' ' + f(top - 4) + '" fill="none" stroke="' + k.trim + '" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>';
    h += G(headAndHair(a, view, e, id, skD));
    return h + '</svg>';
  }
  // ======================= THE MAKER =======================
  var M = null;                                  // { t, opts, p (the person being made), start, view, tab, beard, shots }
  var TABS = [['who', 'Who'], ['body', 'Body'], ['skin', 'Skin'], ['face', 'Face'], ['hair', 'Hair'], ['kit', 'Kit']];
  var VIEWS3D = { front: { yaw: -0.2 }, side: { yaw: -Math.PI / 2 }, back: { yaw: Math.PI } };
  var OLD_STYLES = ['swept', 'short', 'spiky', 'curly', 'long'];   // the styles the old kit (and older 3D code) knew
  var PLACEHOLDER_NAME = 'Champ', PLACEHOLDER_BACK = 'TYSON W.';
  function clone(o) { return JSON.parse(JSON.stringify(o == null ? {} : o)); }
  function beardOK(body) { return body === 'teen' || body === 'adult-a' || body === 'adult-b'; }
  function sv(s) { return typeof s === 'string' ? s : ''; }
  // the person being made: name, number, back name, avatar, and the kit fields in the shape of S.kit / S.kits / S.kitUse
  function personOf(t) {
    if (t.kind === 'own') {
      if (window.Kit) Kit.get();
      // a brand-new save has placeholders (config.js): name 'Champ', back 'TYSON W.' (the owner's son's shirt). Those count as
      // not chosen: the name box starts empty and the back name follows the typed name until someone types their own.
      var nm = sv(S.name), bk = S.backName == null ? 'TYSON W.' : sv(S.backName);
      if (nm === PLACEHOLDER_NAME) nm = '';
      if (bk === PLACEHOLDER_BACK && !/^tyson\b/i.test(nm)) bk = '';
      return { id: 'own', name: nm, back: bk, jersey: String(S.jersey || '7'), avatar: People.own(),
        kit: clone(S.kit), kits: clone(S.kits), kitUse: S.kitUse || 'home' };
    }
    var m = t.kind === 'crew' ? People.member(t.id) : null;
    if (m) return { id: m.id, name: m.name, back: m.back || '', jersey: m.jersey, avatar: People.clean(m.avatar), kit: clone(m.kit), kits: clone(m.kits), kitUse: m.kitUse };
    var used = {}; People.crew().forEach(function (c) { used[c.jersey] = 1; }); used[String(S.jersey || '7')] = 1;
    var n = 8; while (used[String(n)] && n < 99) n++;
    return { id: null, name: '', back: '', jersey: String(n), avatar: People.clean({}), kit: {}, kits: { away: {}, third: {} }, kitUse: 'home' };
  }
  function printed(p) { var b = sv(p.back).trim(); return (b || sv(p.name).trim() || 'PLAYER').toUpperCase().slice(0, 12); }
  function shown(p) { var a = People.clean(p.avatar), k = window.Kit && Kit.viewOf ? Kit.viewOf(p) : p.kit; return { avatar: a, kit: k, name: printed(p), number: People.cleanJersey(p.jersey, '7') }; }
  function has3D() { return typeof T3 !== 'undefined' && T3 && T3.playerPortrait && T3.ctx && S.set && S.set.three !== false; }
  // what the 3D portrait gets: the avatar, the full kit, the printed name and number (plus the hair in the kit, for older 3D code)
  function portraitInput(d) {
    var k = Object.assign({}, d.kit); k.hair = d.avatar.hair; if (OLD_STYLES.indexOf(d.avatar.hairStyle) >= 0) k.hairStyle = d.avatar.hairStyle;
    return { avatar: d.avatar, kit: k, name: d.name, number: d.number };
  }
  // ---------- the big picture ----------
  function picHTML() {
    var d = shown(M.p), key = JSON.stringify([d, M.view]), url = M.shots[key];
    return '<div class="av-pic' + (url ? ' ready' : '') + '" data-key="' + esc(String(hash(key))) + '">' + flat(d, M.view, 'bust') + '<img alt="" src="' + (url || '') + '"></div>';
  }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function ask3D() {
    if (!has3D()) return;
    var d = shown(M.p), view = M.view, key = JSON.stringify([d, view]), my = ++M.serial, m = M;
    if (m.shots[key]) return;
    T3.playerPortrait(portraitInput(d), 400, VIEWS3D[view]).then(function (url) {
      if (!url || M !== m) return; m.shots[key] = url;
      if (my !== m.serial) return;
      var el = document.querySelector('#modalBox .av-pic'); if (!el) return;
      var img = el.querySelector('img'); img.src = url; el.classList.add('ready');
    });
  }
  function drawPic() {
    var box = document.querySelector('#modalBox .av-picbox'); if (!box || !M) return;
    box.innerHTML = picHTML(); ask3D();
    document.querySelectorAll('#modalBox [data-act="avTurn"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.arg === M.view)); });
  }
  // ---------- choices ----------
  function chip(k, v, on, label, inner, cls) {
    return '<button type="button" class="av-c' + (cls ? ' ' + cls : '') + (on ? ' on' : '') + '" data-act="avPick" data-k="' + k + '" data-arg="' + esc(String(v)) + '" aria-pressed="' + on + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + inner + '</button>';
  }
  function dots(k, list, cur, label) {
    return '<div class="av-row">' + list.map(function (c, i) { return chip(k, c[0], String(cur).toLowerCase() === String(c[0]).toLowerCase(), label ? label(c, i) : c[1], '<span class="av-dot" style="background:' + c[0] + '"></span>', 'dot'); }).join('') + '</div>';
  }
  function with_(over) { var a = Object.assign(People.clean(M.p.avatar), over); return a; }
  function headPic(over) { return flat({ avatar: with_(over), kit: shown(M.p).kit, number: '' }, 'front', 'head'); }
  function tiles(k, list, cur, over, cls) {
    return '<div class="av-row tiles">' + list.map(function (c) { var o = {}; o[k] = c[0]; return chip(k, c[0], cur === c[0], c[1], headPic(Object.assign(o, over && over(c))), 'tile ' + (cls || '')); }).join('') + '</div>';
  }
  function pair(k, label, onLabel, offLabel) {
    var on = !!People.clean(M.p.avatar)[k], o0 = {}, o1 = {}; o0[k] = false; o1[k] = true;
    return '<div class="av-pair"><h4>' + esc(label) + '</h4><div class="av-row">' + chip(k, '0', !on, offLabel, headPic(o0), 'tile') + chip(k, '1', on, onLabel, headPic(o1), 'tile') + '</div></div>';
  }
  function h3(t) { return '<h3>' + esc(t) + '</h3>'; }
  // ---------- the sections ----------
  function heightPic(h, a, k) {
    var y = 30 - h * 8, c = a.skin;
    return '<svg class="av-hpic" viewBox="0 0 40 64" aria-hidden="true"><rect x="2" y="61" width="36" height="2" rx="1" fill="#9aa6c0"/><rect x="11" y="' + (y + 13) + '" width="18" height="' + (48 - y) + '" rx="7" fill="' + k.shirt + '"/><circle cx="20" cy="' + (y + 6) + '" r="8" fill="' + c + '" stroke="' + shade(c, -0.3) + '"/></svg>';
  }
  function whoHTML(p) {
    var h = '<label class="av-lab" for="avName">' + esc(M.t.kind === 'own' ? 'Your name' : 'Name') + '</label><input class="av-in" id="avName" type="text" maxlength="12" autocomplete="off" spellcheck="false" value="' + esc(p.name) + '" placeholder="Type a name">';
    h += '<label class="av-lab" for="avNum">Shirt number</label><div class="av-num"><button type="button" class="btn small" data-act="avNum" data-arg="-1" aria-label="Smaller number">−</button>' +
      '<input class="av-in" id="avNum" type="text" inputmode="numeric" maxlength="2" value="' + esc(p.jersey) + '" aria-label="Shirt number"><button type="button" class="btn small" data-act="avNum" data-arg="1" aria-label="Bigger number">+</button></div>';
    h += '<label class="av-lab" for="avBack">Name on the back of the shirt</label><input class="av-in" id="avBack" type="text" maxlength="12" autocomplete="off" spellcheck="false" value="' + esc(p.back) + '" placeholder="' + esc(printed(p)) + '">';
    return h + '<p class="av-tip">Tap <b>Back</b> under the picture to see it.</p>';
  }
  function section() {
    var p = M.p, a = People.clean(p.avatar), d = shown(p), h = '';
    if (M.tab === 'who') h += whoHTML(p);
    else if (M.tab === 'body') {
      h += h3('Body') + '<div class="av-row tiles">' + People.BODIES.map(function (b) {
        return chip('body', b[0], a.body === b[0], b[1] + ', ' + b[2], flat({ avatar: with_({ body: b[0] }), kit: d.kit, number: '' }, 'front', 'bust') + '<b>' + esc(b[1]) + '</b><small>' + esc(b[2]) + '</small>', 'tile body');
      }).join('') + '</div>';
      h += h3('Height') + '<div class="av-row">' + People.HEIGHTS.map(function (x) { return chip('height', x[0], a.height === x[0], x[1], heightPic(x[0], a, d.kit) + '<small>' + esc(x[1]) + '</small>', 'tile ht'); }).join('') + '</div>';
    } else if (M.tab === 'skin') {
      h += h3('Skin') + dots('skin', People.SKINS, a.skin, function (c, i) { return 'Tone ' + (i + 1); });
    } else if (M.tab === 'face') {
      h += h3('Eyes') + '<div class="av-row">' + People.EYES.map(function (c) {
        return chip('eyes', c[0], a.eyes === c[0], c[1] + ' eyes', '<svg class="av-eye" viewBox="0 0 40 24" aria-hidden="true"><path d="M2 12Q20 -4 38 12Q20 28 2 12Z" fill="#fff" stroke="#8a93a8" stroke-width="1.5"/><circle cx="20" cy="12" r="7" fill="' + c[0] + '"/><circle cx="20" cy="12" r="3.4" fill="#140c08"/><circle cx="22.5" cy="9.5" r="1.8" fill="#fff"/></svg>', 'dot eye');
      }).join('') + '</div>';
      h += h3('Glasses') + tiles('glasses', People.GLASSES, a.glasses);
      if (a.glasses !== 'none') h += dots('glassCol', People.GLASS_COLORS, a.glassCol, function (c) { return c[1] + ' frames'; });
      h += '<div class="av-pairs">' + pair('freckles', 'Freckles', 'Freckles', 'No freckles') + pair('lashes', 'Lashes', 'Longer lashes', 'Short lashes') +
        pair('cheeks', 'Rosy cheeks', 'Rosy cheeks', 'Plain cheeks') + pair('gems', 'Sparkles', 'Face sparkles', 'No sparkles') + '</div>';
      if (beardOK(a.body)) h += h3('Beard') + tiles('beard', People.BEARDS, a.beard, function () { return { glasses: 'none' }; });
    } else if (M.tab === 'hair') {
      h += h3('Hair') + tiles('hairStyle', People.HAIR_STYLES, a.hairStyle, function () { return { acc: 'none' }; }, 'hair');
      h += h3('Colour') + dots('hair', People.HAIR_COLORS, a.hair);
      h += h3('Streaks') + '<div class="av-row">' + chip('streaks', 'none', a.streaks === 'none', 'No streaks', '<span class="av-dot none"></span>', 'dot') +
        People.HAIR_COLORS.filter(function (c) { return c[0] !== a.hair; }).map(function (c) { return chip('streaks', c[0], a.streaks === c[0], c[1] + ' streaks', '<span class="av-dot streak" style="--h:' + a.hair + ';--s:' + c[0] + '"></span>', 'dot'); }).join('') + '</div>';
      h += h3('Extras') + tiles('acc', People.ACCS, a.acc);
      if (a.acc !== 'none') h += dots('accCol', People.ACC_COLORS, a.accCol);
    } else if (M.tab === 'kit') {
      var use = p.kitUse === 'away' ? 'away' : p.kitUse === 'third' ? 'third' : 'home';
      h += h3('Kit') + '<div class="av-kit">' + flat(d, 'front', 'bust') + flat(d, 'back', 'bust') + '</div>' +
        '<p class="av-tip">Wearing the ' + use + ' kit.</p><div class="row"><button type="button" class="btn blue" data-act="avKit">' + (typeof ico === 'function' ? ico('shirt') : '') + ' Design the kit</button></div>';
    }
    return h;
  }
  // ---------- the panel ----------
  function title() { return M.t.kind === 'new' ? 'New player' : M.t.kind === 'own' ? 'Make your player' : 'Change ' + esc(sv(M.p.name) || 'player') + '’s look'; }
  function html() {
    var turn = [['front', 'Front'], ['side', 'Side'], ['back', 'Back']].map(function (v) { return '<button type="button" class="av-turn" data-act="avTurn" data-arg="' + v[0] + '" aria-pressed="' + (M.view === v[0]) + '">' + v[1] + '</button>'; }).join('');
    var tabs = TABS.map(function (t) { return '<button type="button" role="tab" id="avTab-' + t[0] + '" class="av-tab' + (M.tab === t[0] ? ' on' : '') + '" aria-selected="' + (M.tab === t[0]) + '" aria-controls="avOpts" data-act="avTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('');
    return '<div class="av"><h2 class="av-h" tabindex="-1">' + title() + '</h2><div class="av-body">' +
      '<div class="av-side"><div class="av-picbox" aria-live="polite">' + picHTML() + '</div>' +
      '<div class="av-turns" role="group" aria-label="Turn the picture">' + turn + '</div>' +
      '<div class="av-fun"><button type="button" class="btn small yellow" data-act="avSurprise">' + (typeof ico === 'function' ? ico('dice') : '') + ' Surprise me</button><button type="button" class="btn small" data-act="avReset">Start again</button></div></div>' +
      '<div class="av-main"><div class="av-tabs" role="tablist" aria-label="Parts">' + tabs + '</div><div class="av-opts" id="avOpts" role="tabpanel" aria-labelledby="avTab-' + M.tab + '">' + section() + '</div></div></div>' +
      '<div class="av-foot"><button type="button" class="btn" data-act="avCancel">Cancel</button><button type="button" class="btn green" data-act="avDone">Done</button></div></div>';
  }
  function wire() {
    var n = document.getElementById('avName'), j = document.getElementById('avNum'), b = document.getElementById('avBack');
    if (n) n.addEventListener('input', function () { M.p.name = n.value; if (b) b.placeholder = printed(M.p); drawPic(); });
    if (b) b.addEventListener('input', function () { M.p.back = b.value; drawPic(); });
    if (j) j.addEventListener('change', function () { M.p.jersey = clampNum(j.value); j.value = M.p.jersey; drawPic(); });
  }
  function clampNum(v) { var n = parseInt(String(v).replace(/[^0-9]/g, ''), 10); if (!(n >= 1)) n = 1; if (n > 99) n = 99; return String(n); }
  // first draw (a new pop-up) or a redraw in place, keeping the scroll position and the focused choice
  function render(first) {
    var box = document.getElementById('modalBox');
    if (first || !box || !box.querySelector('.av')) {
      modal(html(), onClosed);
      box = document.getElementById('modalBox'); box.classList.add('av-modal');
      var hd = box.querySelector('.av-h'); if (hd) try { hd.focus({ preventScroll: true }); } catch (e) {}
    } else {
      var opts = box.querySelector('.av-opts'), sc = opts ? opts.scrollTop : 0, f = document.activeElement, fk = f && f.dataset ? [f.dataset.act, f.dataset.k, f.dataset.arg] : null;
      box.querySelector('.av').outerHTML = html();
      opts = box.querySelector('.av-opts'); if (opts) opts.scrollTop = sc;
      if (fk && fk[0]) { var sel = '[data-act="' + fk[0] + '"]' + (fk[1] ? '[data-k="' + fk[1] + '"]' : '') + (fk[2] != null ? '[data-arg="' + String(fk[2]).replace(/"/g, '') + '"]' : ''); var el = box.querySelector(sel); if (el) try { el.focus({ preventScroll: true }); } catch (e) {} }
    }
    wire(); ask3D();
  }
  function onClosed() {
    var box = document.getElementById('modalBox'); if (box) box.classList.remove('av-modal');
    var m = M; M = null; if (!m) return;
    if (m.opts && typeof m.opts.onDone === 'function') m.opts.onDone(m.result || null);
  }
  function open(target, opts) {
    var t = target && typeof target === 'object' ? target : { kind: 'own' };
    if (t.kind === 'crew' && !People.member(t.id)) t = { kind: 'new' };
    if (t.kind === 'new' && People.crew().length >= People.MAX_CREW) { full(opts); return; }
    var p = personOf(t);
    M = { t: t, opts: opts || {}, p: p, start: clone(p), view: 'front', tab: (opts && opts.tab) || 'who', beard: null, shots: {}, serial: 0, result: null };
    render(true);
  }
  function full(opts) {
    modal('<h2>The list is full</h2><p style="text-align:center">There are already ' + People.MAX_CREW + ' players on this device. Remove one to make room.</p><div class="row"><button class="btn green" data-act="closeModal">OK</button></div>',
      function () { if (opts && opts.onDone) opts.onDone(null); });
  }
  function pop() { if (typeof Snd !== 'undefined' && Snd.pop) Snd.pop(); }
  // ---------- surprise me: any look the lists allow, body and height kept ----------
  function hue(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.08) return { h: 0, s: 0 };
    var h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(mx + mn - 1) || 1) };
  }
  function fun(hex) { var x = hue(hex); return x.s > 0.3 && x.h > 55 && x.h < 350; }   // blue, green, purple, pink hair
  function any(list) { var x = list[Math.floor(Math.random() * list.length)]; return x ? x[0] : undefined; }
  function chance(p) { return Math.random() < p; }
  function surprise(a) {
    var cols = People.HAIR_COLORS, natural = cols.filter(function (c) { return !fun(c[0]); }), wild = cols.filter(function (c) { return fun(c[0]); });
    var n = People.clean(a);
    if (!People.isAdult(n)) natural = natural.filter(function (c) { return !(hue(c[0]).s === 0 && lum(c[0]) > 0.45); });   // grey and white: rarer on the young ones
    n.skin = any(People.SKINS); n.eyes = any(People.EYES); n.hairStyle = any(People.HAIR_STYLES);
    n.hair = any(chance(0.15) && wild.length ? wild : natural);
    var others = cols.filter(function (c) { return c[0] !== n.hair; });
    var wildOthers = wild.filter(function (c) { return c[0] !== n.hair; }), pool = chance(0.7) && wildOthers.length ? wildOthers : others;
    n.streaks = chance(0.25) && pool.length ? any(pool) : 'none';
    n.glasses = chance(0.25) ? any(People.GLASSES.filter(function (g) { return g[0] !== 'none'; })) : 'none'; n.glassCol = any(People.GLASS_COLORS);
    n.acc = chance(0.4) ? any(People.ACCS.filter(function (g) { return g[0] !== 'none'; })) : 'none'; n.accCol = any(People.ACC_COLORS);
    n.freckles = chance(0.3); n.lashes = chance(0.45); n.cheeks = chance(0.75); n.gems = chance(0.25);
    n.beard = beardOK(n.body) && chance(0.4) ? any(People.BEARDS.filter(function (g) { return g[0] !== 'none'; })) : 'none';
    return People.clean(n);
  }
  // ---------- saving ----------
  function save() {
    var p = M.p, a = People.clean(p.avatar), now = Date.now(); a.at = now;
    var kit = clone(p.kit), kits = clone(p.kits), use = p.kitUse === 'away' || p.kitUse === 'third' ? p.kitUse : 'home';
    if (M.t.kind === 'own') {
      S.avatar = a;
      if (!S.set) S.set = {};
      S.set.me = People.isAdult(a) ? 'tata' : 'kid';
      var nm = sv(p.name).trim();
      if (nm) S.name = People.cleanName(nm, S.name || 'Champ');
      S.backName = sv(p.back).trim() ? People.cleanName(p.back, '').toUpperCase() : printed({ name: nm ? S.name : (S.name === PLACEHOLDER_NAME ? '' : S.name) });
      S.jersey = People.cleanJersey(p.jersey, S.jersey || '7');
      kit.hair = a.hair; if (OLD_STYLES.indexOf(a.hairStyle) >= 0) kit.hairStyle = a.hairStyle;   // older 3D code reads the hair from the kit
      S.kit = kit; S.kits = kits; S.kitUse = use; S.avatarAsked = true;
      if (typeof persist === 'function') persist();
      if (typeof T3 !== 'undefined' && T3.playerRefresh) T3.playerRefresh();
      return window.Crew && Crew.person ? Crew.person('own') : { id: 'own', name: S.name, jersey: S.jersey, back: S.backName, avatar: a, kit: window.Kit ? Kit.current() : kit };
    }
    var n = People.crew().length + (p.id ? 0 : 1);
    var c = People.saveMember({ id: p.id || undefined, name: People.cleanName(p.name, 'Player ' + n), jersey: People.cleanJersey(p.jersey, '8'),
      back: sv(p.back).trim() ? People.cleanName(p.back, null) : null, avatar: a, kit: kit, kits: kits, kitUse: use });
    if (!c) return null;
    if (typeof persist === 'function') persist();
    if (window.Crew && Crew.forget) Crew.forget(c.id);
    return c;
  }
  // ---------- taps ----------
  ACT.avTab = function (el) { if (!M) return; M.tab = el.dataset.arg; pop(); render(); var t = document.getElementById('avTab-' + M.tab); if (t) t.focus(); };
  ACT.avTurn = function (el) { if (!M) return; M.view = el.dataset.arg; pop(); drawPic(); };
  ACT.avPick = function (el) {
    if (!M) return;
    var k = el.dataset.k, v = el.dataset.arg, a = People.clean(M.p.avatar);
    if (k === 'height') v = +v; else if (k === 'freckles' || k === 'lashes' || k === 'cheeks' || k === 'gems') v = v === '1';
    if (k === 'body') {                      // a beard only on the bodies that offer one; it comes back if they switch back
      if (!beardOK(v) && a.beard !== 'none') { M.beard = a.beard; a.beard = 'none'; }
      else if (beardOK(v) && a.beard === 'none' && M.beard) { a.beard = M.beard; M.beard = null; }
    }
    if (k === 'hair' && a.streaks === v) a.streaks = 'none';
    a[k] = v; M.p.avatar = People.clean(a); pop(); render();
  };
  ACT.avNum = function (el) { if (!M) return; var n = (parseInt(M.p.jersey, 10) || 7) + (+el.dataset.arg || 0); if (n < 1) n = 99; if (n > 99) n = 1; M.p.jersey = String(n); var j = document.getElementById('avNum'); if (j) j.value = M.p.jersey; pop(); drawPic(); };
  ACT.avSurprise = function () { if (!M) return; M.p.avatar = surprise(M.p.avatar); if (typeof Snd !== 'undefined' && Snd.chime) Snd.chime(); render(); };
  ACT.avReset = function () { if (!M) return; M.p = clone(M.start); M.beard = null; pop(); render(); };
  ACT.avCancel = function () { if (!M) return; M.result = null; closeModal(); };
  ACT.avDone = function () {
    if (!M) return;
    var r = save();
    if (!r) { M.result = null; closeModal(); return; }
    M.result = r; if (typeof Snd !== 'undefined' && Snd.chime) Snd.chime(); closeModal();
  };
  // the kit designer for this same person (a draft: nothing is saved until Done here), then back to the maker
  ACT.avKit = function () {
    if (!M || !window.Kit) return;
    var m = M, box = document.getElementById('modalBox'); if (box) box.classList.remove('av-modal');
    pop();
    Kit.open({ kind: 'draft', person: m.p, title: m.t.kind === 'own' ? 'My kit' : (sv(m.p.name) || 'Player') + "'s kit", onDone: function () { M = m; m.shots = {}; render(true); } });
  };
  // ---------- first time: a warm invitation, once ----------
  // Leads with the name (the first thing a new player does), then "Make it!" opens the maker. Shown at most once by itself:
  // S.avatarAsked = true the moment it appears (and it never appears for a save that already has S.avatar).
  var FR = null;
  function keepName() {
    var n = document.getElementById('avFirstName'), v = n ? n.value.trim() : '';
    if (!v) return;
    S.name = People.cleanName(v, S.name || PLACEHOLDER_NAME);
    if (S.backName == null || S.backName === PLACEHOLDER_BACK) { if (!/^tyson\b/i.test(S.name)) S.backName = S.name.toUpperCase().slice(0, 12); }
    if (typeof persist === 'function') persist();
  }
  function firstRun(done) {
    function finish() { var d = done; done = null; if (typeof d === 'function') d(); }
    if (S.avatar || S.avatarAsked) { finish(); return; }
    S.avatarAsked = true; if (typeof persist === 'function') persist();
    var nm = sv(S.name) === PLACEHOLDER_NAME ? '' : sv(S.name);
    FR = finish;
    modal('<div class="av-first"><h2>Make your player!</h2><div class="av-first-pic">' + flat({ avatar: People.own(), kit: window.Kit ? Kit.current() : {}, number: S.jersey || '7' }, 'front', 'bust') + '</div>' +
      '<label class="av-lab" for="avFirstName">Your name</label><input class="av-in" id="avFirstName" type="text" maxlength="12" autocomplete="off" spellcheck="false" value="' + esc(nm) + '" placeholder="Type your name">' +
      '<p>Pick your hair, your face and your football kit. You can change it any time.</p>' +
      '<div class="row"><button class="btn big green" data-act="avFirstGo">Make it!</button><button class="btn" data-act="avFirstSkip">Skip for now</button></div></div>',
      function () { var f = FR; FR = null; if (f) f(); });
    var inp = document.getElementById('avFirstName'); if (inp) try { inp.focus({ preventScroll: true }); } catch (e) {}
  }
  ACT.avFirstGo = function () {
    keepName(); var f = FR; FR = null;              // the pop-up closes without "skipping": the maker calls done when it closes
    open({ kind: 'own' }, { tab: sv(S.name) && S.name !== PLACEHOLDER_NAME ? 'body' : 'who', onDone: function () { if (f) f(); } });
  };
  ACT.avFirstSkip = function () { keepName(); closeModal(); };

  return { open: open, firstRun: firstRun, flat: flat, surprise: surprise, active: function () { return !!M; } };
})();

