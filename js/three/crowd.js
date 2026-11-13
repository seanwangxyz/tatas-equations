// Toy-figure crowd for the venues (stadium, night, beach, volcano).
//
// The figure is our own design, somewhere between a building-toy figure and a voxel character but neither:
// a big bevelled cube head with a small nose and printed face, a short neck, a straight bevelled torso with a
// printed shirt, square arms with a cuff and a mitten hand (a block with a thumb nub, no claw), and seated
// legs (hips, thighs, shins, shoes) on a little seat. Hair pieces, hats, helmets and masks sit on the head;
// a few fans hold a scarf, a flag or a foam finger, and a few are characters (astronaut, chef, knight,
// skeleton, robot, superhero with a cape, animal mascots, wizard, firefighter, police, builder). The volcano
// crowd uses the same figure as friendly monsters (horns, antennae, fins, one or three eyes, fangs).
//
// Cheap on purpose (iPad): everything is instanced, one InstancedMesh per part type (seats, legs, torsos,
// heads, arms, each head-gear piece, each held thing, capes), all sharing ONE material (one shader program)
// and ONE small texture atlas (1024x512). Per-instance attributes carry three colours and an atlas cell, so
// faces, shirt prints and badges come from the atlas, not from extra meshes. The low quality tier has a third
// fewer people and plain boxes instead of bevels, no shins/shoes, ears, nose, cuffs or thumbs. The medium tier
// (where tablets start) keeps the bevels but has no shins/shoes, cuffs or thumbs, and a sixth fewer people.
//
// HARD RULE: nothing moves at rest. A reaction is a one-shot, 1.3-2.4 s long; while one runs step() returns
// true (the table keeps rendering), and when the last one ends every instance matrix is copied back from the
// rest pose, step() returns false and the crowd is completely still again. (The rest pose itself has a little
// per-person variety, head turns and arm positions, but it is fixed: nothing loops.)
//
// Reactions (T3.crowd(kind, opts) / venue.crowd(kind, opts)):
//   'clap'  a small section claps briefly          opts.at: 0..1 along the stands (left, round the back, right)
//   'ooh'   lean in, some put their hands up by their heads
//   'gasp'  a quick lean back, some put their hands to their cheeks
//   'cheer' people hop with arms up (scarves, flags and foam fingers go up too)   opts.wave: true adds a wave
//   'aw'    a gentle slump with the head tilted (sympathetic, never mocking); 'aww' is accepted too
//   'wave'  the classic stadium wave (up, arms up, down), used by T3.fx('wave')
//
// THE CROWD AS A CHARACTER (stadium and night stadium only; docs/handoff/crowd2.md). The same calls now mean more:
// crowd.js asks crowdstory.js what the moment is (kick-off, a Goal set, a challenge, a great or brilliant shake, a lost
// shake, a replay, a match win, a trophy lift) and the supporters answer it in their own way, picking different sections
// each time: scarves up at kick-off and held, flags raised for the rest of a shake, everyone leaning in during a
// challenge (held, still) then exploding or sighing kindly (and an encouraging clap after a lost shake: never booing),
// a single Mexican wave after a brilliant Solution, heads turning to the big screen for a replay, a card stunt (tifo)
// showing his number or GOAL, confetti cannons and, at night, phone lights after a win (crowdshow.js). At rest they
// are a still tableau: the home end in his kit (S.kit), an away corner in the creature's colours, families, friends
// in matching face paint, a brass band, standing fans, a kid on shoulders, stewards, a TV camera platform, the home
// mascot, hand-made banners with his shirt name and number, empty seats on small grounds. "Pose changes" (stances)
// move once to a new still pose; every animation still ends with every instance matrix copied from the rest pose.
import * as THREE from 'three';
import { FLOOR_Y } from './environment.js';
import { stadiumTier } from './weather.js';
import * as story from './crowdstory.js';
import { makeBanners, makeTifo, tifoPicture, makeConfetti, makePhones } from './crowdshow.js';

// ----- figure layout (person-local units, y up, facing +z, origin on the step under the seat) -----
var SEAT_Y = 0.17, HIP_Y = 0.25, NECK = 0.34, SH_X = 0.245, SH_Y = 0.29, HAND = 0.3, REST_RAISE = 0.38, REST_ROLL = 0.1;
export var HEAD_TOP = 0.36; // top of the head above the neck pivot
var DUR = { clap: 1500, ooh: 1800, gasp: 1300, cheer: 2400, aw: 2000, wave: 1700, mwave: 3800 };
var RAISE = 0.24; // a standing figure's origin is this far above the ground (its legs reach down to it)
// ---- COLLECT (spot the fan) block: one person waves once (see T3.crowdWave below) ----
DUR.hi = 1900;
// ---- end COLLECT block ----
var FRAC = { ooh: 0.8, gasp: 0.85, cheer: 0.85, aw: 0.75 };
var COLS = 16, ROWS = 8, CELL = 64, PAD = 0.03;

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// =====================================================================================================
// Geometry: bevelled boxes with per-vertex paint channel (0 = colour A, 1 = B, 2 = C, 3 = fixed colour),
// a shade multiplier, and decal uvs on chosen faces (u < 0: no decal; u in 2..3: the instance's second cell).
// =====================================================================================================
var _col = new THREE.Color(), _v = new THREE.Vector3(), _e = new THREE.Euler();
function GB() { return { p: [], n: [], u: [], ch: [], vc: [], ix: [], vari: 0 }; }
function poly(g, pts, ctr, ch, vc, uvs) {
  var a = pts[0], b = pts[1], c = pts[2];
  var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
  var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
  if (l < 1e-10) return; // a zero-size bevel strip
  nx /= l; ny /= l; nz /= l;
  var mx = 0, my = 0, mz = 0, k;
  for (k = 0; k < pts.length; k++) { mx += pts[k][0]; my += pts[k][1]; mz += pts[k][2]; }
  mx /= pts.length; my /= pts.length; mz /= pts.length;
  var flip = (mx - ctr[0]) * nx + (my - ctr[1]) * ny + (mz - ctr[2]) * nz < 0;
  if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  var base = g.p.length / 3;
  for (k = 0; k < pts.length; k++) {
    g.p.push(pts[k][0], pts[k][1], pts[k][2]); g.n.push(nx, ny, nz);
    if (uvs) g.u.push(uvs[k][0], uvs[k][1]); else g.u.push(-1, -1);
    g.ch.push(ch, g.vari); g.vc.push(vc[0], vc[1], vc[2]);
  }
  if (pts.length === 3) { if (flip) g.ix.push(base, base + 2, base + 1); else g.ix.push(base, base + 1, base + 2); }
  else if (flip) g.ix.push(base, base + 2, base + 1, base, base + 3, base + 2); else g.ix.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
// o: { x, y, z, w, h, d, b (bevel), ch, vc (shade number or '#hex' with ch 3), fc / bc ('x' | 'y': decal on the
//      +z / -z face from the instance's first / second cell), uvF ([u0, v0, u1, v1] part of the cell), taper
//      (top scale), rx, ry, rz, no (faces never seen, dropped with their bevels: 'l' -x, 'r' +x, 'b' -y, 't' +y,
//      'k' -z, 'f' +z) }
function cbox(g, o) {
  var hx = o.w / 2, hy = o.h / 2, hz = o.d / 2, H = [hx, hy, hz];
  var b = Math.min(o.b || 0, hx * 0.45, hy * 0.45, hz * 0.45);
  var ch = o.ch || 0, vc;
  if (typeof o.vc === 'string') { _col.set(o.vc); vc = [_col.r, _col.g, _col.b]; ch = 3; } else { var s = o.vc == null ? 1 : o.vc; vc = [s, s, s]; }
  var rot = (o.rx || o.ry || o.rz) ? _e.set(o.rx || 0, o.ry || 0, o.rz || 0) : null, ctr = [o.x || 0, o.y || 0, o.z || 0];
  function P(s, a) { return [s[0] * (a === 0 ? H[0] : H[0] - b), s[1] * (a === 1 ? H[1] : H[1] - b), s[2] * (a === 2 ? H[2] : H[2] - b)]; }
  function X(q) { // local point -> geometry space
    var x = q[0], y = q[1], z = q[2];
    if (o.taper && y > 0) { x *= o.taper; z *= o.taper; }
    if (rot) { _v.set(x, y, z).applyEuler(rot); x = _v.x; y = _v.y; z = _v.z; }
    return [x + ctr[0], y + ctr[1], z + ctr[2]];
  }
  function UV(q, back) { // decal uv over the face's full extent, mapped into uvF
    var u = (q[0] + hx) / (2 * hx), v = (q[1] + hy) / (2 * hy), F = o.uvF || [0, 0, 1, 1];
    if (back) u = 1 - u;
    u = F[0] + u * (F[2] - F[0]); v = F[1] + v * (F[3] - F[1]);
    return [u + ((back ? o.bc : o.fc) === 'y' ? 2 : 0), v];
  }
  var a, sg, k, quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]], no = o.no || '', FK = ['lr', 'bt', 'kf'];
  function hid(ax, sgn) { return no.indexOf(FK[ax][sgn > 0 ? 1 : 0]) >= 0; }
  for (a = 0; a < 3; a++) for (sg = -1; sg <= 1; sg += 2) {
    if (hid(a, sg)) continue;
    var e1 = (a + 1) % 3, e2 = (a + 2) % 3, pts = [], loc = [];
    for (k = 0; k < 4; k++) { var s3 = [0, 0, 0]; s3[a] = sg; s3[e1] = quad[k][0]; s3[e2] = quad[k][1]; var q = P(s3, a); loc.push(q); pts.push(X(q)); }
    var dec = a === 2 && (sg > 0 ? o.fc : o.bc);
    poly(g, pts, ctr, ch, vc, dec ? loc.map(function (q) { return UV(q, sg < 0); }) : null);
  }
  if (b > 0) {
    var pairs = [[0, 1], [1, 2], [0, 2]];
    pairs.forEach(function (pr) {
      var A = pr[0], C = pr[1], E = 3 - A - C;
      [-1, 1].forEach(function (sa) { [-1, 1].forEach(function (sc) {
        if (hid(A, sa) || hid(C, sc)) return;
        var sm = [0, 0, 0], sp = [0, 0, 0]; sm[A] = sp[A] = sa; sm[C] = sp[C] = sc; sm[E] = -1; sp[E] = 1;
        poly(g, [X(P(sm, A)), X(P(sp, A)), X(P(sp, C)), X(P(sm, C))], ctr, ch, vc, null);
      }); });
    });
    for (var c8 = 0; c8 < 8; c8++) { var s = [c8 & 1 ? 1 : -1, c8 & 2 ? 1 : -1, c8 & 4 ? 1 : -1]; if (hid(0, s[0]) || hid(1, s[1]) || hid(2, s[2])) continue; poly(g, [X(P(s, 0)), X(P(s, 1)), X(P(s, 2))], ctr, ch, vc, null); }
  }
}
function finish(g) {
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
  geo.setAttribute('duv', new THREE.Float32BufferAttribute(g.u, 2));
  geo.setAttribute('cv', new THREE.Float32BufferAttribute(g.ch, 2)); // paint channel, variant (0 = always drawn)
  geo.setAttribute('vcol', new THREE.Float32BufferAttribute(g.vc, 3));
  geo.setIndex(g.ix);
  return geo;
}
// d: detail 2 (high: bevels and the small parts), 1 (medium: bevels), 0 (low: plain boxes)
function build(fn, d) { var g = GB(); fn(g, d, function (v) { return d ? v : 0; }); return finish(g); }
// several rare parts in one mesh: each instance shows only its own variant (the others collapse to a point)
function buildMix(fns, d) { var g = GB(); fns.forEach(function (fn, k) { g.vari = k + 1; fn(g, d, function (v) { return d ? v : 0; }); }); return finish(g); }

/// ----- body parts (d: detail level; B(v): bevel v, or none on the low tier) -----
function seatGeo(g, d, B) {
  cbox(g, { y: 0.085, z: -0.02, w: 0.5, h: 0.17, d: 0.38, no: 'b' });
  if (d > 0) cbox(g, { y: 0.3, z: -0.205, w: 0.46, h: 0.3, d: 0.05, vc: 0.92, no: 'b' });
}
function legsGeo(g, d, B) { // A pants, B shins (pants or skin), C shoes
  cbox(g, { y: 0.21, z: -0.01, w: 0.36, h: 0.09, d: 0.24, no: 'b' });
  [-1, 1].forEach(function (s) {
    cbox(g, { x: s * 0.088, y: 0.22, z: 0.15, w: 0.15, h: 0.12, d: 0.3, no: 'b' });
    if (d > 1) { cbox(g, { x: s * 0.088, y: 0.1, z: 0.27, w: 0.13, h: 0.16, d: 0.13, ch: 1, no: 'tb' }); cbox(g, { x: s * 0.088, y: 0.035, z: 0.3, w: 0.14, h: 0.07, d: 0.19, ch: 2, no: 'b' }); }
  });
}
function torsoGeo(g, d, B) { cbox(g, { y: 0.17, w: 0.38, h: 0.34, d: 0.22, b: B(0.04), fc: 'x', bc: 'y', taper: 0.96, no: 'b' }); } // A shirt; print from the atlas
function capeGeo(g, d, B) {
  cbox(g, { y: 0.33, z: -0.015, w: 0.4, h: 0.04, d: 0.25, vc: 0.85, no: 'b' });
  cbox(g, { y: 0.08, z: -0.13, w: 0.42, h: 0.5, d: 0.025, taper: 0.85 });
}
function headGeo(monster) {
  return function (g, d, B) { // A skin; face from the atlas
    if (d > 0) cbox(g, { y: 0.02, w: 0.12, h: 0.06, d: 0.11, vc: 0.88, no: 'tb' });
    cbox(g, { y: 0.205, w: 0.34, h: 0.31, d: 0.3, b: B(0.045), fc: 'x', no: 'b' });
    if (d > 0 && !monster) {
      [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.178, y: 0.19, z: -0.01, w: 0.03, h: 0.075, d: 0.06, vc: 0.94, no: s < 0 ? 'r' : 'l' }); });
      cbox(g, { y: 0.198, z: 0.158, w: 0.045, h: 0.036, d: 0.026, vc: 1.02, no: 'k' });
    }
  };
}
function armGeo(g, d, B) { // A sleeve top, B forearm (sleeve or skin), C hand
  if (d > 0) { cbox(g, { y: -0.035, w: 0.105, h: 0.1, d: 0.115 }); cbox(g, { y: -0.16, w: 0.092, h: 0.16, d: 0.1, ch: 1, no: 'tb' }); }
  else cbox(g, { y: -0.115, w: 0.1, h: 0.26, d: 0.11, no: 'b' }); // low tier: one sleeve block
  if (d > 1) cbox(g, { y: -0.245, w: 0.1, h: 0.03, d: 0.108, vc: 0.8, no: 'tb' });
  cbox(g, { y: -0.3, w: 0.088, h: 0.085, d: 0.095, ch: 2, no: 't' });
  if (d > 1) cbox(g, { y: -0.282, z: 0.055, w: 0.032, h: 0.04, d: 0.03, ch: 2, no: 'k' });
}

// ----- head gear (neck pivot; the head spans x +-0.17, y 0.05..0.36, z +-0.15) -----
// hair pieces: A hair, B hair tie. hats: A main, B trim, C the hair peeking out.
function hairPeek(g, low) {
  cbox(g, { y: low ? 0.22 : 0.25, z: -0.145, w: 0.35, h: 0.16, d: 0.04, ch: 2, no: 'f' });
  [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.175, y: 0.27, z: -0.04, w: 0.02, h: 0.08, d: 0.18, ch: 2, no: s < 0 ? 'r' : 'l' }); });
}
function shortHair(g, B, ch, fringe) {
  cbox(g, { y: 0.35, z: -0.005, w: 0.36, h: 0.06, d: 0.32, b: B(0.02), ch: ch, no: 'b' });
  cbox(g, { y: 0.26, z: -0.14, w: 0.36, h: 0.2, d: 0.05, ch: ch, no: 'f' });
  if (fringe !== false) cbox(g, { y: 0.322, z: 0.15, w: 0.36, h: 0.045, d: 0.03, ch: ch, no: 'k' });
  [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.177, y: 0.29, z: -0.03, w: 0.025, h: 0.1, d: 0.22, ch: ch, no: s < 0 ? 'r' : 'l' }); });
}
function bob(g, B, long) {
  cbox(g, { y: 0.355, z: -0.005, w: 0.38, h: 0.07, d: 0.34, b: B(0.025), no: 'b' });
  cbox(g, long ? { y: 0.15, z: -0.16, w: 0.38, h: 0.44, d: 0.06, no: 'f' } : { y: 0.2, z: -0.15, w: 0.38, h: 0.32, d: 0.06, no: 'f' });
  [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.185, y: long ? 0.19 : 0.22, z: 0.0, w: 0.04, h: long ? 0.34 : 0.28, d: 0.3, no: s < 0 ? 'r' : 'l' }); });
  cbox(g, { y: 0.31, z: 0.155, w: 0.3, h: 0.06, d: 0.03, no: 'k' });
}
var GEAR = {
  short: function (g, d, B) { shortHair(g, B, 0); },
  bob: function (g, d, B) { bob(g, B, false); },
  long: function (g, d, B) { bob(g, B, true); },
  pigtails: function (g, d, B) {
    shortHair(g, B, 0);
    [-1, 1].forEach(function (s) {
      cbox(g, { x: s * 0.235, y: 0.23, z: -0.06, w: 0.09, h: 0.15, d: 0.09, rz: s * 0.25 });
      cbox(g, { x: s * 0.195, y: 0.28, z: -0.06, w: 0.04, h: 0.05, d: 0.06, ch: 1, no: s < 0 ? 'r' : 'l' });
    });
  },
  curls: function (g, d, B) { // a crown of chunky curls, shaded alternately
    var k = 0;
    [-0.11, 0, 0.11].forEach(function (x) { [-0.1, 0.0, 0.1].forEach(function (z) { cbox(g, { x: x, y: 0.385 + ((k++ % 2) ? 0.012 : 0), z: z, w: 0.13, h: 0.11, d: 0.12, vc: k % 2 ? 1 : 0.86, no: 'b' }); }); });
    [-0.12, 0, 0.12].forEach(function (x, j) { cbox(g, { x: x, y: 0.25, z: -0.155, w: 0.13, h: 0.16, d: 0.07, vc: j % 2 ? 0.86 : 1, no: 'f' }); });
    [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.185, y: 0.3, z: -0.04, w: 0.05, h: 0.13, d: 0.2, vc: 0.92, no: s < 0 ? 'r' : 'l' }); });
  },
  bun: function (g, d, B) {
    shortHair(g, B, 0);
    cbox(g, { y: 0.44, z: -0.05, w: 0.14, h: 0.12, d: 0.14, b: B(0.035), no: 'b' });
    cbox(g, { y: 0.39, z: -0.05, w: 0.1, h: 0.03, d: 0.1, ch: 1, no: 'tb' });
  },
  spiky: function (g, d, B) {
    shortHair(g, B, 0, false);
    [[-0.09, -0.07], [0.09, -0.07], [0, 0], [-0.09, 0.07], [0.09, 0.07]].forEach(function (q, j) { cbox(g, { x: q[0], y: 0.425, z: q[1], w: 0.09, h: 0.11, d: 0.09, taper: 0.25, rx: q[1] * 3, rz: -q[0] * 3, vc: j % 2 ? 0.9 : 1, no: 'b' }); });
  },
  mohawk: function (g, d, B) {
    cbox(g, { y: 0.35, z: -0.005, w: 0.2, h: 0.05, d: 0.3, ch: 0, vc: 0.85, no: 'b' });
    [-0.11, -0.04, 0.03, 0.1].forEach(function (z) { cbox(g, { y: 0.43, z: z, w: 0.07, h: 0.13, d: 0.09, taper: 0.3, rx: z * 2, no: 'b' }); });
  },
  cap: function (g, d, B) { // A crown (logo on the front), B peak
    cbox(g, { y: 0.375, z: -0.005, w: 0.37, h: 0.11, d: 0.33, b: B(0.02), fc: 'x', uvF: [0, 0.35, 1, 0.65], no: 'b' });
    cbox(g, { y: 0.33, z: 0.215, w: 0.3, h: 0.022, d: 0.14, ch: 1 });
    cbox(g, { y: 0.437, w: 0.045, h: 0.02, d: 0.045, ch: 1, no: 'b' });
    hairPeek(g);
  },
  capBack: function (g, d, B) { // the same cap worn backwards (logo at the back, peak over the neck)
    cbox(g, { y: 0.375, z: 0.005, w: 0.37, h: 0.11, d: 0.33, b: B(0.02), bc: 'x', uvF: [0, 0.35, 1, 0.65], no: 'b' });
    cbox(g, { y: 0.33, z: -0.215, w: 0.3, h: 0.022, d: 0.14, ch: 1 });
    cbox(g, { y: 0.437, w: 0.045, h: 0.02, d: 0.045, ch: 1, no: 'b' });
    [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.175, y: 0.27, z: -0.04, w: 0.02, h: 0.08, d: 0.18, ch: 2, no: s < 0 ? 'r' : 'l' }); });
    cbox(g, { y: 0.31, z: 0.15, w: 0.3, h: 0.035, d: 0.025, ch: 2, no: 'k' });
  },
  beanie: function (g, d, B) { // A knit, B pompom
    cbox(g, { y: 0.37, z: -0.005, w: 0.375, h: 0.15, d: 0.335, b: B(0.05), no: 'b' });
    cbox(g, { y: 0.305, z: -0.005, w: 0.385, h: 0.055, d: 0.345, vc: 0.82, no: 'tb' });
    cbox(g, { y: 0.47, w: 0.09, h: 0.08, d: 0.09, ch: 1, no: 'b' });
    hairPeek(g, true);
  },
  hardhat: function (g, d, B) {
    cbox(g, { y: 0.385, w: 0.36, h: 0.13, d: 0.33, b: B(0.035), fc: 'x', uvF: [0, 0.32, 1, 0.68], no: 'b' });
    cbox(g, { y: 0.33, z: 0.02, w: 0.42, h: 0.022, d: 0.41, vc: 0.9 });
    cbox(g, { y: 0.452, w: 0.06, h: 0.03, d: 0.3, vc: 1.08, no: 'b' });
    hairPeek(g, true);
  },
  chef: function (g, d, B) {
    cbox(g, { y: 0.375, w: 0.36, h: 0.08, d: 0.32, vc: 0.95, no: 'tb' });
    cbox(g, { y: 0.5, w: 0.4, h: 0.19, d: 0.36, b: B(0.07), taper: 1.1 });
    hairPeek(g, true);
  },
  police: function (g, d, B) { // A crown, B band (badge on the front)
    cbox(g, { y: 0.36, w: 0.36, h: 0.07, d: 0.32, ch: 1, fc: 'x', uvF: [0, 0.4, 1, 0.6], no: 'tb' });
    cbox(g, { y: 0.425, z: -0.01, w: 0.4, h: 0.07, d: 0.38, b: B(0.025) });
    cbox(g, { y: 0.33, z: 0.19, w: 0.3, h: 0.02, d: 0.1, vc: '#1b1e24' });
    hairPeek(g, true);
  },
  wizard: function (g, d, B) {
    cbox(g, { y: 0.36, w: 0.46, h: 0.03, d: 0.44 });
    cbox(g, { y: 0.53, z: -0.01, w: 0.3, h: 0.32, d: 0.3, taper: 0.12, rx: -0.12, fc: 'x', no: 'b' });
    cbox(g, { y: 0.39, w: 0.305, h: 0.035, d: 0.305, ch: 1, no: 'tb' });
  },
  headphones: function (g, d, B) { // C hair, A band, B ear cups
    shortHair(g, B, 2);
    cbox(g, { y: 0.405, w: 0.4, h: 0.03, d: 0.06 });
    [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.2, y: 0.33, w: 0.03, h: 0.15, d: 0.06, no: 'tb' }); cbox(g, { x: s * 0.2, y: 0.22, w: 0.065, h: 0.11, d: 0.12, ch: 1, no: s < 0 ? 'r' : 'l' }); });
  },
  sunhat: function (g, d, B) {
    cbox(g, { y: 0.405, w: 0.32, h: 0.1, d: 0.3, b: B(0.03), no: 'b' });
    cbox(g, { y: 0.375, w: 0.325, h: 0.03, d: 0.305, ch: 1, no: 'tb' });
    cbox(g, { y: 0.355, w: 0.64, h: 0.022, d: 0.62, vc: 0.95 });
    hairPeek(g, true);
  },
  helmet: function (g, d, B) { // covers the head: knight, robot, astronaut (the look comes from the atlas cell)
    cbox(g, { y: 0.205, w: 0.4, h: 0.37, d: 0.36, b: B(0.06), fc: 'x', no: 'b' });
    [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.21, y: 0.2, w: 0.04, h: 0.1, d: 0.1, ch: 1, no: s < 0 ? 'r' : 'l' }); });
    cbox(g, { y: 0.4, z: -0.02, w: 0.05, h: 0.05, d: 0.26, ch: 1, no: 'b' });
  },
  mask: function (g, d, B) { // animal mascot head: A fur, B muzzle and inner ears
    cbox(g, { y: 0.205, w: 0.4, h: 0.37, d: 0.36, b: B(0.06), fc: 'x', no: 'b' });
    [-1, 1].forEach(function (s) {
      cbox(g, { x: s * 0.12, y: 0.43, z: -0.02, w: 0.11, h: 0.11, d: 0.05, taper: 0.35, no: 'b' });
      cbox(g, { x: s * 0.12, y: 0.425, z: 0.007, w: 0.06, h: 0.065, d: 0.012, taper: 0.35, ch: 1, no: 'bk' });
    });
    cbox(g, { y: 0.14, z: 0.205, w: 0.15, h: 0.1, d: 0.06, b: B(0.02), ch: 1, fc: 'x', uvF: [0.3125, 0.189, 0.6875, 0.459], no: 'k' });
  },
  bandhat: function (g, d, B) { // the brass band's tall hat: A crown, B band and plume
    cbox(g, { y: 0.47, w: 0.33, h: 0.24, d: 0.31, b: B(0.02), no: 'b' });
    cbox(g, { y: 0.37, w: 0.34, h: 0.05, d: 0.32, ch: 1, no: 'tb' });
    cbox(g, { y: 0.35, z: 0.2, w: 0.28, h: 0.02, d: 0.1, vc: '#1b1e24' });
    cbox(g, { y: 0.64, z: 0.03, w: 0.06, h: 0.13, d: 0.06, ch: 1, taper: 0.6, no: 'b' });
    hairPeek(g, true);
  },
  cubehead: function (g, d, B) { // the home mascot's big cube head (an original "Cubey" costume): A cube, face from the atlas
    cbox(g, { y: 0.25, w: 0.52, h: 0.48, d: 0.48, b: B(0.07), fc: 'x', no: 'b' });
    [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.13, y: 0.5, w: 0.05, h: 0.05, d: 0.05, ch: 1, no: 'b' }); }); // two little dots on top
  },
  // monsters: A horn / stalk colour, B tip
  horns: function (g, d, B) { [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.11, y: 0.42, w: 0.065, h: 0.15, d: 0.065, taper: 0.25, rz: -s * 0.4, no: 'b' }); }); },
  horn1: function (g, d, B) { cbox(g, { y: 0.45, z: 0.03, w: 0.085, h: 0.19, d: 0.085, taper: 0.22, rx: 0.2, no: 'b' }); },
  antennae: function (g, d, B) {
    [-1, 1].forEach(function (s) {
      cbox(g, { x: s * 0.085, y: 0.44, w: 0.025, h: 0.17, d: 0.025, rz: -s * 0.3, no: 'tb' });
      cbox(g, { x: s * 0.11, y: 0.53, w: 0.065, h: 0.065, d: 0.065, ch: 1 });
    });
  },
  fins: function (g, d, B) { [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.205, y: 0.26, z: -0.02, w: 0.03, h: 0.17, d: 0.15, taper: 0.4, rz: -s * 0.35 }); }); },
  spikes: function (g, d, B) { [-0.1, 0, 0.1].forEach(function (z, j) { cbox(g, { y: 0.415, z: z, w: 0.06, h: 0.11 - j * 0.01, d: 0.08, taper: 0.22, vc: j % 2 ? 0.9 : 1, no: 'b' }); }); }
};
// held things: A main, B second. flag and finger stand upright in the right hand; the scarf stretches between the hands.
var HELD = {
  flag: { code: 5, fn: function (g, d, B) {
    cbox(g, { y: 0.38, w: 0.022, h: 0.8, d: 0.022, vc: '#d8c39a' });
    cbox(g, { x: 0.17, y: 0.66, w: 0.32, h: 0.22, d: 0.012, fc: 'x', bc: 'x', uvF: [0, 0.155, 1, 0.845] });
  } },
  finger: { code: 5, fn: function (g, d, B) {
    cbox(g, { y: 0.02, w: 0.12, h: 0.08, d: 0.1, ch: 1, no: 't' });
    cbox(g, { y: 0.12, w: 0.15, h: 0.13, d: 0.08, fc: 'x', bc: 'x' });
    cbox(g, { x: 0.035, y: 0.27, w: 0.05, h: 0.18, d: 0.06, no: 'b' });
    cbox(g, { x: -0.085, y: 0.15, w: 0.05, h: 0.04, d: 0.05, rz: 0.4, no: 'r' });
  } },
  scarf: { code: 6, fn: function (g, d, B) {
    cbox(g, { w: 1.0, h: 0.11, d: 0.015, fc: 'x', bc: 'x' });
    [-1, 1].forEach(function (s) { [-1, 1].forEach(function (t) { cbox(g, { x: s * 0.5 + t * 0.012, y: -0.075, w: 0.01, h: 0.06, d: 0.016, ch: 1, no: 'tb' }); }); });
  } },
  drink: { code: 5, fn: function (g, d, B) { // a paper cup with a lid: A cup, B lid
    cbox(g, { y: 0.065, w: 0.075, h: 0.12, d: 0.075, taper: 1.15, no: 'b' });
    cbox(g, { y: 0.13, w: 0.088, h: 0.02, d: 0.088, ch: 1 });
  } }
};
// rare big props, pooled in one more mesh ('x:' keys). Codes as for held things (0 body, 1 torso, 2 head, 5 right hand).
var PROPS = {
  stand: { code: 0, fn: function (g, d, B) { // standing legs (origin RAISE above the ground): A trousers, B shins, C shoes
    cbox(g, { y: 0.21, z: -0.01, w: 0.36, h: 0.09, d: 0.23, no: 'b' });
    [-1, 1].forEach(function (s) {
      cbox(g, { x: s * 0.09, y: 0.05, w: 0.15, h: 0.24, d: 0.17, no: 'tb' });
      cbox(g, { x: s * 0.09, y: -0.12, w: 0.13, h: 0.12, d: 0.14, ch: 1, no: 'tb' });
      cbox(g, { x: s * 0.09, y: -0.205, z: 0.03, w: 0.14, h: 0.07, d: 0.21, ch: 2 });
    });
  } },
  shoulders: { code: 0, fn: function (g, d, B) { // a kid's legs either side of the grown-up's head
    cbox(g, { y: 0.21, z: -0.01, w: 0.52, h: 0.08, d: 0.2, no: 'b' });
    [-1, 1].forEach(function (s) {
      cbox(g, { x: s * 0.25, y: 0.2, z: 0.12, w: 0.13, h: 0.11, d: 0.28 });
      cbox(g, { x: s * 0.25, y: 0.06, z: 0.23, w: 0.11, h: 0.19, d: 0.11, ch: 1, no: 't' });
      cbox(g, { x: s * 0.25, y: -0.06, z: 0.26, w: 0.12, h: 0.06, d: 0.16, ch: 2 });
    });
  } },
  rig: { code: 0, fn: function (g, d, B) { // the TV camera platform: deck under the operator's feet, legs to the ground, camera on a tripod
    var top = -RAISE, H = 0.9;
    cbox(g, { y: top - 0.05, z: 0.1, w: 1.3, h: 0.1, d: 1.4, vc: '#5c636a' });
    [[-0.58, -0.5], [0.58, -0.5], [-0.58, 0.7], [0.58, 0.7]].forEach(function (q) { cbox(g, { x: q[0], y: top - 0.1 - H / 2, z: q[1], w: 0.08, h: H, d: 0.08, vc: '#868e96', no: 'tb' }); });
    cbox(g, { y: top - 0.1 - H * 0.55, z: 0.1, w: 1.2, h: 0.05, d: 0.05, vc: '#868e96' });
    cbox(g, { y: top + 0.4, z: -0.62, w: 1.3, h: 0.05, d: 0.05, vc: '#ced4da' }); // rail behind
    [-0.62, 0.62].forEach(function (x) { cbox(g, { x: x, y: top + 0.2, z: -0.62, w: 0.05, h: 0.4, d: 0.05, vc: '#ced4da', no: 'tb' }); });
    cbox(g, { y: top + 0.36, z: 0.5, w: 0.05, h: 0.72, d: 0.05, vc: '#343a40', no: 'tb' }); // tripod column
    [-1, 1].forEach(function (s) { cbox(g, { x: s * 0.13, y: top + 0.18, z: 0.5, w: 0.035, h: 0.4, d: 0.035, rz: s * 0.4, vc: '#343a40' }); });
    cbox(g, { y: top + 0.78, z: 0.52, w: 0.2, h: 0.22, d: 0.5, b: B(0.02), vc: '#2b2f3a' });
    cbox(g, { y: top + 0.78, z: 0.82, w: 0.15, h: 0.15, d: 0.12, vc: '#121417' });
    cbox(g, { x: 0.13, y: top + 0.82, z: 0.38, w: 0.06, h: 0.08, d: 0.12, vc: '#121417' });
    cbox(g, { x: -0.115, y: top + 0.8, z: 0.52, w: 0.012, h: 0.08, d: 0.2, vc: '#e03131' }); // the red "on air" stripe
  } },
  drum: { code: 1, fn: function (g, d, B) { // a bass drum on the chest: A shell, B rims
    cbox(g, { y: 0.11, z: 0.25, w: 0.4, h: 0.36, d: 0.2, b: B(0.02) });
    [-1, 1].forEach(function (s) { cbox(g, { y: 0.11, z: 0.25 + s * 0.095, w: 0.42, h: 0.38, d: 0.025, ch: 1 }); });
    cbox(g, { y: 0.11, z: 0.365, w: 0.32, h: 0.28, d: 0.01, vc: '#f1f3f5', no: 'k' });
  } },
  horn: { code: 2, fn: function (g, d, B) { // a trumpet from the mouth, gold
    cbox(g, { y: 0.135, z: 0.24, w: 0.04, h: 0.04, d: 0.2, vc: '#f2c230' });
    cbox(g, { y: 0.135, z: 0.37, w: 0.12, h: 0.12, d: 0.07, vc: '#f7d154' });
    cbox(g, { x: 0.03, y: 0.17, z: 0.24, w: 0.02, h: 0.04, d: 0.08, vc: '#d4a017' });
  } }
};
// the tifo card: front plate (colour A: the picture) and back plate (B), pivot on the bottom edge, front +z
function cardGeo(g, d, B) {
  cbox(g, { y: 0.275, z: 0.006, w: 0.6, h: 0.55, d: 0.012, ch: 0, no: 'k' });
  cbox(g, { y: 0.275, z: -0.006, w: 0.6, h: 0.55, d: 0.012, ch: 1, no: 'f' });
}

// =====================================================================================================
// Texture atlas: 16 x 8 cells of 64 px, four coverage layers packed into RGBA:
//   R = colour B tint, A = colour C tint, B = dark ink, G = white. Composited in that order (white on top),
//   so to show ink over white, cut the white layer there.
// Cell drawing is in unit coordinates, y down; the top of the cell is the top of the face it sits on.
// =====================================================================================================
var CELLS = [], CI = {};
function C(name, draw) { if (CI[name] != null) throw new Error('crowd atlas: duplicate cell ' + name); CI[name] = CELLS.length; CELLS.push(draw); }
var EY = 0.4, EXL = 0.35, EXR = 0.65;
function eyesDot(D, big) { [EXL, EXR].forEach(function (x) { D.ell('k', x, EY, big ? 0.056 : 0.044, big ? 0.075 : 0.064); D.circ('w', x + 0.014, EY - 0.026, big ? 0.021 : 0.016); }); }
function eyeball(D, x, y, r, pr, dx, dy) { D.circ('w', x, y, r); D.on('w', 'cut'); D.circ('w', x + (dx || 0), y + (dy || 0), pr); D.on('w'); D.circ('k', x + (dx || 0), y + (dy || 0), pr); D.circ('w', x + (dx || 0) + pr * 0.35, y + (dy || 0) - pr * 0.4, pr * 0.32); }
function eyesHappy(D) { [EXL, EXR].forEach(function (x) { D.arc('k', x, EY + 0.03, 0.048, Math.PI + 0.35, 2 * Math.PI - 0.35, 0.032); }); }
function eyesContent(D) { [EXL, EXR].forEach(function (x) { D.arc('k', x, EY - 0.025, 0.045, 0.35, Math.PI - 0.35, 0.03); }); }
function brows(D, up) { var y = up ? 0.24 : 0.28; D.line('b', [[EXL - 0.065, y + 0.01], [EXL + 0.05, y - (up ? 0.02 : 0.005)]], 0.035); D.line('b', [[EXR + 0.065, y + 0.01], [EXR - 0.05, y - (up ? 0.02 : 0.005)]], 0.035); }
function smile(D, r, y) { D.arc('k', 0.5, y || 0.6, r || 0.13, 0.2 * Math.PI, 0.8 * Math.PI, 0.034); }
function grin(D) { D.chord('k', 0.5, 0.615, 0.13, 0, Math.PI); D.rect('w', 0.4, 0.615, 0.2, 0.034); }
function blush(D) { D.ell('c', 0.23, 0.6, 0.065, 0.04); D.ell('c', 0.77, 0.6, 0.065, 0.04); }
function shout(D) { D.ell('k', 0.5, 0.68, 0.085, 0.085); D.on('k', 'cut'); D.ell('k', 0.5, 0.735, 0.05, 0.03); D.on('k'); D.ell('c', 0.5, 0.735, 0.05, 0.03); D.rect('w', 0.44, 0.6, 0.12, 0.03); }
function glassesRound(D) { [EXL, EXR].forEach(function (x) { D.ring('k', x, EY, 0.085, 0.026); }); D.line('k', [[0.435, EY - 0.01], [0.565, EY - 0.01]], 0.024); D.line('k', [[0.12, EY - 0.03], [0.265, EY - 0.01]], 0.024); D.line('k', [[0.88, EY - 0.03], [0.735, EY - 0.01]], 0.024); }
function shades(D) { [EXL, EXR].forEach(function (x) { D.rr('k', x - 0.105, EY - 0.065, 0.21, 0.13, 0.045); D.line('w', [[x - 0.06, EY - 0.015], [x - 0.025, EY - 0.045]], 0.018); }); D.line('k', [[0.24, EY - 0.055], [0.76, EY - 0.055]], 0.03); D.line('k', [[0.12, EY - 0.05], [0.25, EY - 0.05]], 0.026); D.line('k', [[0.88, EY - 0.05], [0.75, EY - 0.05]], 0.026); }
function tache(D) { D.ell('b', 0.44, 0.6, 0.075, 0.032, -0.25); D.ell('b', 0.56, 0.6, 0.075, 0.032, 0.25); }
function beard(D, long) {
  if (long) D.ell('b', 0.5, 0.86, 0.38, 0.34); else D.ell('b', 0.5, 0.76, 0.36, 0.2);
  D.rect('b', 0.12, 0.44, 0.08, 0.32); D.rect('b', 0.8, 0.44, 0.08, 0.32); tache(D);
}
// --- faces (people); the 3D nose sits at about (0.5, 0.52) ---
C('smile', function (D) { brows(D); eyesDot(D); smile(D); });
C('grin', function (D) { brows(D); eyesDot(D); grin(D); });
C('happy', function (D) { eyesHappy(D); smile(D); blush(D); });
C('wink', function (D) { brows(D); D.ell('k', EXL, EY, 0.044, 0.064); D.circ('w', EXL + 0.014, EY - 0.026, 0.016); D.arc('k', EXR, EY + 0.03, 0.048, Math.PI + 0.35, 2 * Math.PI - 0.35, 0.032); grin(D); });
C('wow', function (D) { brows(D, true); eyeball(D, EXL, EY, 0.07, 0.034); eyeball(D, EXR, EY, 0.07, 0.034); D.ell('k', 0.5, 0.68, 0.045, 0.055); });
C('freckle', function (D) { brows(D); eyesDot(D); smile(D); D.alpha('k', 0.5); [[0.2, 0.55], [0.25, 0.6], [0.18, 0.62], [0.8, 0.55], [0.75, 0.6], [0.82, 0.62]].forEach(function (q) { D.circ('k', q[0], q[1], 0.013); }); D.alpha('k', 1); });
C('glasses', function (D) { brows(D); eyesDot(D); glassesRound(D); smile(D); });
C('specs', function (D) { brows(D); eyesDot(D); [EXL, EXR].forEach(function (x) { D.rr('k', x - 0.095, EY - 0.07, 0.19, 0.14, 0.03, 0.026); }); D.line('k', [[0.445, EY - 0.01], [0.555, EY - 0.01]], 0.024); smile(D, 0.09, 0.62); });
C('shades', function (D) { shades(D); grin(D); });
C('tache', function (D) { brows(D); eyesDot(D); tache(D); smile(D, 0.08, 0.63); });
C('beard', function (D) { brows(D); eyesDot(D); beard(D); smile(D, 0.08, 0.63); });
C('paint', function (D) { brows(D); eyesDot(D); [0.22, 0.78].forEach(function (x) { D.line('c', [[x - 0.06, 0.53], [x + 0.06, 0.53]], 0.035); D.line('c', [[x - 0.06, 0.6], [x + 0.06, 0.6]], 0.035); }); grin(D); });
C('half', function (D) { D.rect('c', 0, 0, 0.5, 1); brows(D); eyesDot(D); smile(D); });
C('blush', function (D) { brows(D); eyesDot(D); blush(D); D.chord('k', 0.5, 0.62, 0.1, 0, Math.PI); });
C('shout', function (D) { brows(D, true); eyesHappy(D); shout(D); });
C('content', function (D) { brows(D); eyesContent(D); smile(D, 0.1, 0.61); });
C('hero', function (D) { D.rr('c', 0.15, 0.3, 0.7, 0.19, 0.09); eyeball(D, EXL, EY, 0.05, 0.022); eyeball(D, EXR, EY, 0.05, 0.022); smile(D); });
C('patch', function (D) { brows(D); D.ell('k', EXL, EY, 0.044, 0.064); D.circ('w', EXL + 0.014, EY - 0.026, 0.016); D.line('k', [[0.14, 0.24], [0.88, 0.46]], 0.026); D.ell('k', EXR, EY + 0.01, 0.085, 0.075); grin(D); });
C('skull', function (D) { D.ell('k', EXL, 0.41, 0.09, 0.1); D.ell('k', EXR, 0.41, 0.09, 0.1); D.line('k', [[0.3, 0.71], [0.7, 0.71]], 0.024); [0.36, 0.43, 0.5, 0.57, 0.64].forEach(function (x) { D.line('k', [[x, 0.66], [x, 0.76]], 0.02); }); });
C('beardglasses', function (D) { brows(D); eyesDot(D); beard(D); glassesRound(D); smile(D, 0.08, 0.63); });
C('tacheShades', function (D) { shades(D); tache(D); smile(D, 0.08, 0.63); });
C('kid', function (D) { eyesDot(D, true); blush(D); D.chord('k', 0.5, 0.63, 0.075, 0, Math.PI); });
C('wizard', function (D) { brows(D); eyesDot(D); beard(D, true); D.arc('k', 0.5, 0.64, 0.06, 0.2 * Math.PI, 0.8 * Math.PI, 0.03); });
// --- monster faces (no nose) ---
function fang(D, x, y, s) { D.poly('w', [[x - 0.03 * s, y], [x + 0.03 * s, y], [x, y + 0.075 * s]]); }
C('m1', function (D) { eyeball(D, 0.5, 0.36, 0.16, 0.07, 0, 0.02); D.arc('k', 0.5, 0.58, 0.2, 0.15 * Math.PI, 0.85 * Math.PI, 0.04); fang(D, 0.38, 0.745, 1); fang(D, 0.62, 0.745, 1); });
C('m2', function (D) { eyeball(D, 0.33, 0.37, 0.1, 0.045, 0.01, 0.01); eyeball(D, 0.67, 0.37, 0.1, 0.045, -0.01, 0.01); smile(D, 0.16, 0.58); fang(D, 0.6, 0.71, 1); });
C('m3', function (D) { eyeball(D, 0.26, 0.4, 0.085, 0.04); eyeball(D, 0.5, 0.31, 0.085, 0.04); eyeball(D, 0.74, 0.4, 0.085, 0.04); smile(D, 0.14, 0.6); });
C('m2t', function (D) { eyeball(D, 0.32, 0.37, 0.12, 0.05, 0.02, 0.02); eyeball(D, 0.7, 0.4, 0.08, 0.04, -0.01, 0.01); D.chord('k', 0.5, 0.62, 0.16, 0, Math.PI); D.on('k', 'cut'); D.ell('k', 0.5, 0.73, 0.07, 0.04); D.on('k'); D.ell('c', 0.5, 0.73, 0.07, 0.04); });
C('m1t', function (D) { eyeball(D, 0.5, 0.36, 0.15, 0.065); D.chord('k', 0.5, 0.62, 0.2, 0, Math.PI); [0.38, 0.46, 0.54, 0.62].forEach(function (x) { D.rect('w', x - 0.03, 0.62, 0.06, 0.05); }); });
C('m2s', function (D) { [0.33, 0.67].forEach(function (x) { D.arc('k', x, 0.42, 0.07, Math.PI + 0.3, 2 * Math.PI - 0.3, 0.04); }); D.arc('k', 0.5, 0.55, 0.2, 0.15 * Math.PI, 0.85 * Math.PI, 0.04); fang(D, 0.4, 0.725, 1.3); fang(D, 0.6, 0.725, 1.3); D.ell('c', 0.2, 0.58, 0.06, 0.035); D.ell('c', 0.8, 0.58, 0.06, 0.035); });
C('m4', function (D) { [[0.3, 0.33], [0.7, 0.33], [0.4, 0.47], [0.6, 0.47]].forEach(function (q, j) { eyeball(D, q[0], q[1], j < 2 ? 0.07 : 0.055, j < 2 ? 0.032 : 0.026); }); smile(D, 0.12, 0.62); });
// --- torso prints (front; the neck is at the top). B = print colour, C = second colour (overalls) ---
C('hstripe', function (D) { [0.16, 0.44, 0.72].forEach(function (y) { D.rect('b', 0, y, 1, 0.14); }); });
C('vstripe', function (D) { [0.18, 0.39, 0.61, 0.82].forEach(function (x) { D.rect('b', x - 0.055, 0, 0.11, 1); }); });
['7', '10', '9', '23', '1', '4'].forEach(function (n) { C('n' + n, function (D) { D.text('b', n, 0.5, 0.56, n.length > 1 ? 0.5 : 0.6); }); });
C('sash', function (D) { D.poly('b', [[0.0, 0.1], [0.28, 0.1], [1, 0.78], [1, 1], [0.75, 1], [0, 0.34]]); });
C('halves', function (D) { D.rect('b', 0.5, 0, 0.5, 1); });
C('star', function (D) { D.star('b', 0.5, 0.53, 0.27); });
C('collar', function (D) { D.poly('b', [[0.28, 0.0], [0.5, 0.3], [0.72, 0.0], [0.62, 0.0], [0.5, 0.17], [0.38, 0.0]]); D.circ('k', 0.5, 0.36, 0.02); D.circ('k', 0.5, 0.46, 0.02); });
C('hoop', function (D) { D.rect('b', 0, 0.38, 1, 0.2); D.rect('w', 0, 0.35, 1, 0.025); D.rect('w', 0, 0.595, 1, 0.025); });
C('heart', function (D) { D.heart('b', 0.5, 0.5, 0.2); });
C('go', function (D) { D.text('b', 'GO!', 0.5, 0.55, 0.36); });
C('math', function (D) { D.text('b', '1+2', 0.5, 0.55, 0.34); });
C('ball', function (D) { D.ring('k', 0.5, 0.52, 0.21, 0.025); D.circ('w', 0.5, 0.52, 0.2); D.on('w', 'cut'); D.ngon('w', 0.5, 0.52, 0.075, 5); [0, 1, 2, 3, 4].forEach(function (k) { var a = -Math.PI / 2 + k * 2 * Math.PI / 5; D.ngon('w', 0.5 + Math.cos(a) * 0.19, 0.52 + Math.sin(a) * 0.19, 0.055, 5, a); }); D.on('w'); D.ngon('k', 0.5, 0.52, 0.075, 5); [0, 1, 2, 3, 4].forEach(function (k) { var a = -Math.PI / 2 + k * 2 * Math.PI / 5; D.ngon('k', 0.5 + Math.cos(a) * 0.19, 0.52 + Math.sin(a) * 0.19, 0.055, 5, a); }); });
C('hoodie', function (D) { D.alpha('k', 0.35); D.rr('k', 0.24, 0.58, 0.52, 0.26, 0.05, 0.03); D.line('k', [[0.3, 0.0], [0.5, 0.14], [0.7, 0.0]], 0.03); D.alpha('k', 1); D.line('w', [[0.43, 0.1], [0.42, 0.34]], 0.025); D.line('w', [[0.57, 0.1], [0.58, 0.34]], 0.025); });
C('suit', function (D) { var tie = [[0.47, 0.05], [0.53, 0.05], [0.565, 0.42], [0.5, 0.5], [0.435, 0.42]]; D.poly('w', [[0.35, 0], [0.65, 0], [0.5, 0.52]]); D.on('w', 'cut'); D.poly('w', tie); D.on('w'); D.poly('b', tie); D.line('k', [[0.32, 0.0], [0.5, 0.56], [0.68, 0.0]], 0.026); D.circ('k', 0.5, 0.68, 0.022); D.circ('k', 0.5, 0.8, 0.022); });
C('hivis', function (D) { D.rect('w', 0, 0.56, 1, 0.08); D.rect('w', 0.24, 0, 0.08, 0.56); D.rect('w', 0.68, 0, 0.08, 0.56); D.alpha('k', 0.3); D.rect('k', 0, 0.54, 1, 0.015); D.rect('k', 0, 0.645, 1, 0.015); D.alpha('k', 1); });
C('overalls', function (D) { D.rect('c', 0.24, 0.4, 0.52, 0.6); D.rect('c', 0.24, 0, 0.1, 0.42); D.rect('c', 0.66, 0, 0.1, 0.42); D.circ('w', 0.29, 0.45, 0.03); D.circ('w', 0.71, 0.45, 0.03); D.alpha('k', 0.35); D.rr('k', 0.38, 0.55, 0.24, 0.16, 0.02, 0.022); D.alpha('k', 1); });
C('jacket', function (D) { D.rect('b', 0.4, 0, 0.2, 1); D.line('k', [[0.4, 0.0], [0.3, 0.3], [0.4, 0.46]], 0.03); D.line('k', [[0.6, 0.0], [0.7, 0.3], [0.6, 0.46]], 0.03); D.line('k', [[0.4, 0.46], [0.4, 1]], 0.02); D.line('k', [[0.15, 0.66], [0.3, 0.66]], 0.025); D.line('k', [[0.7, 0.66], [0.85, 0.66]], 0.025); D.line('w', [[0.41, 0.48], [0.41, 1]], 0.012); });
C('lifevest', function (D) { D.line('k', [[0.32, 0.0], [0.5, 0.25], [0.68, 0.0]], 0.03); D.alpha('k', 0.8); D.rect('k', 0, 0.46, 1, 0.055); D.rect('k', 0, 0.7, 1, 0.055); D.alpha('k', 1); D.rect('w', 0.45, 0.44, 0.1, 0.095); D.rect('w', 0.45, 0.68, 0.1, 0.095); });
C('chef', function (D) { [0.32, 0.5, 0.68].forEach(function (y) { D.circ('k', 0.38, y, 0.025); D.circ('k', 0.62, y, 0.025); }); D.alpha('k', 0.3); D.line('k', [[0.3, 0.02], [0.5, 0.16], [0.7, 0.02]], 0.03); D.alpha('k', 1); });
C('armor', function (D) { D.rect('b', 0.25, 0.04, 0.5, 0.96); D.rect('w', 0.46, 0.2, 0.08, 0.5); D.rect('w', 0.35, 0.36, 0.3, 0.08); [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]].forEach(function (q) { D.circ('k', q[0], q[1], 0.025); }); });
C('astro', function (D) { D.rr('k', 0.3, 0.3, 0.4, 0.3, 0.04); D.circ('w', 0.4, 0.4, 0.035); D.circ('w', 0.5, 0.4, 0.035); D.rect('w', 0.36, 0.48, 0.28, 0.04); D.rect('b', 0.12, 0.12, 0.15, 0.1); D.alpha('k', 0.3); D.rect('k', 0, 0.8, 1, 0.03); D.alpha('k', 1); });
C('robot', function (D) { D.rect('b', 0.28, 0.1, 0.44, 0.07); D.rr('k', 0.22, 0.26, 0.56, 0.46, 0.05); D.circ('w', 0.35, 0.38, 0.04); D.circ('w', 0.5, 0.38, 0.04); D.circ('w', 0.65, 0.38, 0.04); [0.32, 0.44, 0.56].forEach(function (x) { D.rect('w', x, 0.52, 0.09, 0.12); }); });
C('bones', function (D) { D.rect('w', 0.47, 0.08, 0.06, 0.84); [0.22, 0.34, 0.46, 0.58].forEach(function (y) { D.arc('w', 0.5, y - 0.12, 0.27, 0.25 * Math.PI, 0.75 * Math.PI, 0.045); }); D.ell('w', 0.5, 0.86, 0.17, 0.06); });
C('heroT', function (D) { var bolt = [[0.54, 0.28], [0.4, 0.48], [0.49, 0.48], [0.45, 0.63], [0.6, 0.42], [0.51, 0.42], [0.57, 0.28]]; D.ring('k', 0.5, 0.45, 0.205, 0.022); D.circ('w', 0.5, 0.45, 0.2); D.on('w', 'cut'); D.poly('w', bolt); D.on('w'); D.poly('b', bolt); });
C('belly', function (D) { D.ell('b', 0.5, 0.6, 0.3, 0.33); });
C('police', function (D) { D.star('b', 0.3, 0.3, 0.07); D.line('k', [[0.58, 0.24], [0.8, 0.24]], 0.02); D.rr('k', 0.58, 0.24, 0.22, 0.16, 0.02, 0.02); D.poly('k', [[0.47, 0.03], [0.53, 0.03], [0.555, 0.38], [0.5, 0.45], [0.445, 0.38]]); D.circ('k', 0.5, 0.6, 0.02); D.circ('k', 0.5, 0.75, 0.02); });
C('fire', function (D) { D.rect('b', 0, 0.48, 1, 0.1); D.rect('w', 0, 0.515, 1, 0.03); D.rect('b', 0, 0.76, 1, 0.1); D.rect('w', 0, 0.795, 1, 0.03); D.line('k', [[0.5, 0.0], [0.5, 0.46]], 0.02); });
C('hawaii', function (D) { [[0.2, 0.2], [0.65, 0.15], [0.42, 0.45], [0.82, 0.48], [0.18, 0.72], [0.6, 0.78], [0.95, 0.9]].forEach(function (q, j) { for (var k = 0; k < 5; k++) { var a = k * 1.2566 + j; D.circ('b', q[0] + Math.cos(a) * 0.05, q[1] + Math.sin(a) * 0.05, 0.04); } D.circ('w', q[0], q[1], 0.025); }); });
C('wizardT', function (D) { [[0.25, 0.25], [0.75, 0.35], [0.3, 0.7], [0.7, 0.8], [0.5, 0.5]].forEach(function (q, j) { D.star('b', q[0], q[1], j === 4 ? 0.08 : 0.05); }); D.circ('w', 0.72, 0.6, 0.07); D.on('w', 'cut'); D.circ('w', 0.75, 0.57, 0.06); D.on('w'); });
// --- head-gear, flag, scarf and foam-finger decals ---
C('logoT', function (D) { D.text('w', 'T', 0.5, 0.505, 0.27); });
C('logoStar', function (D) { D.star('w', 0.5, 0.5, 0.12); });
C('badge', function (D) { D.poly('w', [[0.44, 0.43], [0.56, 0.43], [0.56, 0.52], [0.5, 0.57], [0.44, 0.52]]); D.on('w', 'cut'); D.star('w', 0.5, 0.49, 0.03); D.on('w'); D.star('k', 0.5, 0.49, 0.03); });
C('fireBadge', function (D) { D.poly('w', [[0.42, 0.37], [0.58, 0.37], [0.58, 0.55], [0.5, 0.63], [0.42, 0.55]]); D.on('w', 'cut'); D.rect('w', 0.485, 0.41, 0.03, 0.15); D.rect('w', 0.44, 0.465, 0.12, 0.03); D.on('w'); D.rect('k', 0.485, 0.41, 0.03, 0.15); D.rect('k', 0.44, 0.465, 0.12, 0.03); });
C('knight', function (D) { D.rect('k', 0.12, 0.38, 0.76, 0.075); D.rect('k', 0.48, 0.3, 0.04, 0.5); [0.35, 0.42, 0.58, 0.65].forEach(function (x) { D.rect('k', x - 0.012, 0.56, 0.024, 0.14); }); [[0.18, 0.2], [0.82, 0.2], [0.18, 0.8], [0.82, 0.8]].forEach(function (q) { D.circ('w', q[0], q[1], 0.025); }); });
C('robotFace', function (D) { D.rr('k', 0.12, 0.2, 0.76, 0.6, 0.08); D.rect('w', 0.26, 0.34, 0.14, 0.12); D.rect('w', 0.6, 0.34, 0.14, 0.12); [0.32, 0.42, 0.52, 0.62].forEach(function (x) { D.rect('w', x, 0.6, 0.06, 0.06); }); });
C('astroVisor', function (D) { D.rr('b', 0.06, 0.13, 0.88, 0.72, 0.2); D.rr('k', 0.1, 0.17, 0.8, 0.64, 0.17); D.arc('w', 0.5, 0.62, 0.3, 1.15 * Math.PI, 1.42 * Math.PI, 0.035); D.circ('w', 0.74, 0.32, 0.025); });
function maskEyes(D, r) { [0.32, 0.68].forEach(function (x) { D.ell('k', x, 0.4, r, r * 1.25); D.circ('w', x + r * 0.3, 0.4 - r * 0.45, r * 0.35); }); }
C('wolf', function (D) { D.poly('w', [[0.1, 0.55], [0.3, 0.5], [0.25, 0.85]]); D.poly('w', [[0.9, 0.55], [0.7, 0.5], [0.75, 0.85]]); maskEyes(D, 0.05); D.line('k', [[0.22, 0.3], [0.38, 0.33]], 0.03); D.line('k', [[0.78, 0.3], [0.62, 0.33]], 0.03); D.ell('k', 0.5, 0.6, 0.075, 0.045); D.line('k', [[0.5, 0.63], [0.5, 0.7]], 0.02); D.arc('k', 0.45, 0.69, 0.05, 0.1 * Math.PI, 0.9 * Math.PI, 0.02); D.arc('k', 0.55, 0.69, 0.05, 0.1 * Math.PI, 0.9 * Math.PI, 0.02); });
C('bear', function (D) { maskEyes(D, 0.045); D.ell('k', 0.5, 0.6, 0.085, 0.055); D.line('k', [[0.5, 0.64], [0.5, 0.71]], 0.022); D.arc('k', 0.5, 0.66, 0.07, 0.15 * Math.PI, 0.85 * Math.PI, 0.022); });
C('cat', function (D) { [0.32, 0.68].forEach(function (x) { D.ell('w', x, 0.4, 0.065, 0.06); D.on('w', 'cut'); D.ell('w', x, 0.4, 0.022, 0.05); D.on('w'); D.ell('k', x, 0.4, 0.022, 0.05); }); D.poly('k', [[0.45, 0.57], [0.55, 0.57], [0.5, 0.63]]); D.line('k', [[0.5, 0.63], [0.5, 0.68]], 0.02); [[0.55], [0.62], [0.69]].forEach(function (y) { D.line('k', [[0.06, y[0] - 0.02], [0.3, y[0]]], 0.014); D.line('k', [[0.94, y[0] - 0.02], [0.7, y[0]]], 0.014); }); });
C('wizStar', function (D) { D.star('w', 0.5, 0.62, 0.15); D.circ('b', 0.62, 0.32, 0.06); D.on('b', 'cut'); D.circ('b', 0.645, 0.3, 0.05); D.on('b'); });
C('flagStripe', function (D) { D.rect('b', 0, 0, 0.34, 1); D.rect('w', 0.34, 0, 0.33, 1); });
C('flagStar', function (D) { D.rect('b', 0, 0.42, 1, 0.16); D.star('w', 0.5, 0.5, 0.2); });
C('scarfBands', function (D) { [0.04, 0.29, 0.54, 0.79].forEach(function (x) { D.rect('b', x, 0, 0.12, 1); }); D.rect('w', 0, 0.0, 1, 0.12); D.rect('w', 0, 0.88, 1, 0.12); });
C('finger1', function (D) { D.text('w', '#1', 0.5, 0.55, 0.42); });
// --- the crowd as a character: his number on replica shirts (redrawn when it changes), band, stewards, mascot ---
var KIDNUM = '7';
C('kidnum', function (D) { D.text('b', KIDNUM, 0.5, 0.56, KIDNUM.length > 1 ? 0.5 : 0.62); D.rect('b', 0.36, 0.08, 0.28, 0.05); });
C('band', function (D) { [0.3, 0.45, 0.6, 0.75].forEach(function (y) { D.rect('b', 0.22, y, 0.56, 0.035); D.circ('b', 0.22, y + 0.017, 0.03); D.circ('b', 0.78, y + 0.017, 0.03); }); D.rect('b', 0.47, 0.0, 0.06, 1); D.rect('w', 0.3, 0.0, 0.4, 0.06); });
C('stewardB', function (D) { D.rect('w', 0, 0.62, 1, 0.08); D.text('k', 'STEWARD', 0.5, 0.36, 0.17); });
C('cubey', function (D) { eyeball(D, 0.33, 0.4, 0.11, 0.05, 0.01, 0.01); eyeball(D, 0.67, 0.4, 0.11, 0.05, -0.01, 0.01); D.chord('k', 0.5, 0.62, 0.17, 0, Math.PI); D.on('k', 'cut'); D.ell('k', 0.5, 0.74, 0.08, 0.045); D.on('k'); D.ell('c', 0.5, 0.74, 0.08, 0.045); D.ell('c', 0.18, 0.62, 0.07, 0.045); D.ell('c', 0.82, 0.62, 0.07, 0.045); [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].forEach(function (q) { D.circ('k', q[0], q[1], 0.035); }); });

var atlasTex = null, atlasNum = '';
// his number changed (Settings): redraw the atlas in place (a one-off, about 10 ms)
function refreshAtlas(num) {
  num = String(num || '7').slice(0, 2);
  if (num === KIDNUM && atlasTex) return;
  KIDNUM = num;
  if (atlasTex) { drawAtlas(atlasTex.image.data); atlasTex.needsUpdate = true; atlasNum = num; }
}
function getAtlas() {
  if (atlasTex) return atlasTex;
  var data = drawAtlas(null), t = new THREE.DataTexture(data, COLS * CELL, ROWS * CELL, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
  atlasTex = t; atlasNum = KIDNUM;
  return t;
}
function drawAtlas(into) {
  var W = COLS * CELL, H = ROWS * CELL, cx = {}, cv = {}, ox = 0, oy = 0;
  'bwkc'.split('').forEach(function (l) { var c = document.createElement('canvas'); c.width = W; c.height = H; cv[l] = c; var g = c.getContext('2d'); g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = g.lineJoin = 'round'; cx[l] = g; });
  var D = {
    on: function (l, mode) { cx[l].globalCompositeOperation = mode === 'cut' ? 'destination-out' : 'source-over'; },
    alpha: function (l, a) { cx[l].globalAlpha = a; },
    rect: function (l, x, y, w, h) { cx[l].fillRect(x, y, w, h); },
    circ: function (l, x, y, r) { var g = cx[l]; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); },
    ell: function (l, x, y, rx, ry, rot) { var g = cx[l]; g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832); g.fill(); },
    ring: function (l, x, y, r, lw) { var g = cx[l]; g.lineWidth = lw; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.stroke(); },
    arc: function (l, x, y, r, a0, a1, lw) { var g = cx[l]; g.lineWidth = lw; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); },
    chord: function (l, x, y, r, a0, a1) { var g = cx[l]; g.beginPath(); g.arc(x, y, r, a0, a1); g.closePath(); g.fill(); },
    line: function (l, pts, lw) { var g = cx[l]; g.lineWidth = lw; g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke(); },
    poly: function (l, pts) { var g = cx[l]; g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); g.fill(); },
    ngon: function (l, x, y, r, n, rot) { var p = []; for (var k = 0; k < n; k++) { var a = (rot || -Math.PI / 2) + k * 2 * Math.PI / n; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } D.poly(l, p); },
    star: function (l, x, y, r) { var p = []; for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; p.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } D.poly(l, p); },
    heart: function (l, x, y, s) { D.circ(l, x - s * 0.5, y - s * 0.25, s * 0.55); D.circ(l, x + s * 0.5, y - s * 0.25, s * 0.55); D.poly(l, [[x - s * 1.03, y - s * 0.08], [x + s * 1.03, y - s * 0.08], [x, y + s * 1.1]]); },
    rr: function (l, x, y, w, h, r, lw) { var g = cx[l]; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); if (lw) { g.lineWidth = lw; g.stroke(); } else g.fill(); },
    text: function (l, s, x, y, size) { var g = cx[l]; g.save(); g.setTransform(1, 0, 0, 1, ox, oy); g.font = '900 ' + Math.round(size * CELL) + 'px "Trebuchet MS", "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x * CELL, y * CELL); g.restore(); }
  };
  CELLS.forEach(function (draw, idx) {
    ox = (idx % COLS) * CELL; oy = Math.floor(idx / COLS) * CELL;
    'bwkc'.split('').forEach(function (l) { var g = cx[l]; g.save(); g.setTransform(CELL, 0, 0, CELL, ox, oy); g.beginPath(); g.rect(0, 0, 1, 1); g.clip(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; });
    draw(D);
    'bwkc'.split('').forEach(function (l) { cx[l].restore(); });
  });
  var data = into || new Uint8Array(W * H * 4), im = {};
  'bwkc'.split('').forEach(function (l) { im[l] = cx[l].getImageData(0, 0, W, H).data; });
  for (var y = 0; y < H; y++) { // flip rows: texture v goes up like the faces
    var src = (H - 1 - y) * W * 4, dst = y * W * 4;
    for (var x = 0; x < W; x++, src += 4, dst += 4) { data[dst] = im.b[src + 3]; data[dst + 1] = im.w[src + 3]; data[dst + 2] = im.k[src + 3]; data[dst + 3] = im.c[src + 3]; }
  }
  return data;
}

// One material for every crowd part: colours come from the per-instance A/B/C attributes picked by the
// vertex's paint channel; decals from the atlas. dim darkens the whole crowd (the night stadium).
function crowdMaterial(dim) {
  var atlas = getAtlas(), m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
  m.onBeforeCompile = function (sh) {
    sh.uniforms.cAtlas = { value: atlas }; sh.uniforms.cDim = { value: dim };
    sh.vertexShader = 'attribute vec2 cv;\nattribute vec3 vcol;\nattribute vec2 duv;\nattribute vec3 iA;\nattribute vec3 iB;\nattribute vec3 iC;\nattribute vec3 iMeta;\nvarying vec3 vBase;\nvarying vec3 vTB;\nvarying vec3 vTC;\nvarying vec3 vDec;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  if (cv.y > 0.5 && abs(cv.y - iMeta.z) > 0.5) transformed = vec3(0.0);\n  float chan = cv.x; vec3 pc = chan < 0.5 ? iA : (chan < 1.5 ? iB : (chan < 2.5 ? iC : vec3(1.0)));\n  vBase = pc * vcol; vTB = iB; vTC = iC;\n  float useY = step(1.5, duv.x); float cel = mix(iMeta.x, iMeta.y, useY);\n  vDec = vec3(duv.x - 2.0 * useY, duv.y, (duv.x < -0.5 || cel < -0.5) ? -1.0 : cel);');
    sh.fragmentShader = 'uniform sampler2D cAtlas;\nuniform float cDim;\nvarying vec3 vBase;\nvarying vec3 vTB;\nvarying vec3 vTC;\nvarying vec3 vDec;\n' +
      sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  {\n    float cid = floor(vDec.z + 0.5), row = floor((cid + 0.5) / ' + COLS.toFixed(1) + '), col = cid - row * ' + COLS.toFixed(1) + ';\n' +
        '    vec2 auv = (vec2(col, ' + (ROWS - 1).toFixed(1) + ' - row) + ' + PAD.toFixed(3) + ' + clamp(vDec.xy, 0.0, 1.0) * ' + (1 - 2 * PAD).toFixed(3) + ') / vec2(' + COLS.toFixed(1) + ', ' + ROWS.toFixed(1) + ');\n' +
        '    vec4 dc = texture2D(cAtlas, auv) * step(-0.5, vDec.z);\n    vec3 cc = mix(vBase, vTB, dc.r); cc = mix(cc, vTC, dc.a); cc = mix(cc, vec3(0.018, 0.015, 0.024), dc.b); cc = mix(cc, vec3(0.86), dc.g);\n    diffuseColor.rgb *= cc * cDim;\n  }');
  };
  m.customProgramCacheKey = function () { return 'toycrowd1'; };
  return m;
}

// =====================================================================================================
// Wardrobe: who wears what. Every person gets L = { seat, skin, hair, paint, shirt, print, pc (print colour),
// pantsC, pants, shins, shoes, sleeve, fore, hands, face, gear {t, a, b, c, cell, back}, held {t, a, b, cell},
// cape } plus p.sc (size) and p.hs (head scale).
// =====================================================================================================
var SKINS = ['#ffe0c2', '#f7cfa6', '#eebb8e', '#e0a878', '#c98d5e', '#a8714a', '#875636', '#5e3b24'];
var HAIRS = ['#2a1b12', '#3d2616', '#16120f', '#5a3820', '#7a4a26', '#a8682f', '#d9a55a', '#ecc97c', '#b5471f', '#4a2a1a'];
var GREYS = ['#8f8f8f', '#bdbdbd', '#e6e6e6'], FUNHAIR = ['#ff6fae', '#8a5cff', '#2fb8ff', '#30d158'];
var BRIGHT = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ff922b', '#ffffff', '#20c997'];
var NEUTRAL = ['#f8f9fa', '#343a40', '#868e96', '#2f9e44', '#f08c00', '#7048e8', '#e64980', '#fab005', '#15aabf', '#a0522d', '#5c7cfa', '#ced4da'];
var PANTS = ['#34507a', '#34507a', '#2a3f63', '#2b2f3a', '#1f1f24', '#c2a878', '#6b4f3a', '#5c636a'];
var SHOES = ['#f8f9fa', '#f8f9fa', '#212529', '#212529', '#8b5a2b', '#e03131', '#1c7ed6'];
var SHORTS = ['#4dabf7', '#ff922b', '#f8f9fa', '#2f9e44', '#e64980', '#34507a', '#ffd43b', '#7048e8'];
var PINK = '#ff8fa3';
function pick(R, a) { return a[Math.floor(R() * a.length)]; }
function wpick(R, t) { var s = 0, i; for (i = 0; i < t.length; i += 2) s += t[i + 1]; var x = R() * s; for (i = 0; i < t.length; i += 2) { x -= t[i + 1]; if (x < 0) return t[i]; } return t[0]; }
function mixc(a, b, k) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString(); }

var TEAM_PRINTS = ['none', 20, 'hstripe', 12, 'vstripe', 10, 'n7', 3, 'n10', 4, 'n9', 3, 'n23', 3, 'n1', 2, 'n4', 2, 'sash', 6, 'halves', 5, 'star', 5, 'collar', 8, 'hoop', 6, 'heart', 2, 'go', 4];
var NEUTRAL_PRINTS = ['none', 18, 'hoodie', 12, 'suit', 6, 'hivis', 3, 'overalls', 5, 'jacket', 7, 'heart', 5, 'star', 4, 'ball', 5, 'math', 4, 'hstripe', 8, 'collar', 6];
var BEACH_PRINTS = ['none', 26, 'hawaii', 16, 'hstripe', 12, 'heart', 6, 'star', 6, 'ball', 6, 'lifevest', 4, 'math', 4, 'go', 3, 'n10', 3, 'n7', 2, 'sash', 3, 'halves', 3, 'vstripe', 4];
var BACKS = { hstripe: 1, vstripe: 1, halves: 1, hoop: 1, hivis: 1, fire: 1, overalls: 1, n7: 1, n10: 1, n9: 1, n23: 1, n1: 1, n4: 1, hawaii: 1, sash: 1, lifevest: 1 };
var LONG_SLEEVES = { suit: 1, jacket: 1, hoodie: 1, astro: 1, armor: 1, robot: 1, bones: 1, chef: 1, police: 1, fire: 1, wizardT: 1, belly: 1 };
var FACES_ADULT = ['smile', 14, 'grin', 12, 'happy', 8, 'wink', 5, 'wow', 4, 'freckle', 3, 'glasses', 6, 'specs', 5, 'shades', 4, 'tache', 4, 'beard', 5, 'paint', 7, 'half', 3, 'blush', 4, 'shout', 6, 'content', 4, 'patch', 1, 'tacheShades', 2];
var FACES_KID = ['kid', 9, 'happy', 5, 'smile', 5, 'grin', 5, 'blush', 5, 'wow', 3, 'freckle', 4, 'paint', 4, 'shout', 3, 'glasses', 2, 'wink', 2];
var FACES_ELDER = ['beardglasses', 4, 'specs', 5, 'glasses', 5, 'tache', 4, 'beard', 3, 'smile', 4, 'content', 4, 'happy', 2];
var GEAR_ADULT = ['short', 18, 'bob', 9, 'long', 5, 'pigtails', 2, 'curls', 8, 'bun', 5, 'spiky', 4, 'mohawk', 1, 'bald', 4, 'cap', 10, 'capBack', 3, 'beanie', 9, 'headphones', 3];
var GEAR_KID = ['short', 12, 'bob', 8, 'pigtails', 10, 'curls', 6, 'bun', 4, 'spiky', 5, 'cap', 8, 'capBack', 3, 'beanie', 10, 'headphones', 2];
var GEAR_ELDER = ['short', 14, 'bald', 12, 'bob', 6, 'curls', 3, 'cap', 6, 'beanie', 5, 'bun', 4];
var CHARACTERS = ['astronaut', 1, 'chef', 1, 'knight', 1, 'skeleton', 1, 'robot', 1, 'hero', 2, 'mascot', 2, 'wizard', 1, 'fire', 1, 'police', 1, 'builder', 1];
var MASCOTS = { wolf: ['#8e959c', '#eef0f2'], bear: ['#8d5524', '#e7c39a'], cat: ['#ff922b', '#fff3e0'] };

function hairGear(L, R, t) { return { t: t, a: L.hair, b: pick(R, BRIGHT), c: L.hair, cell: -1 }; }
// ---- COLLECT (spot the fan) block: the 13 character kinds a fan can be (mascots count by animal) ----
export var CHAR_KINDS = ['astronaut', 'chef', 'knight', 'skeleton', 'robot', 'hero', 'wolf', 'bear', 'cat', 'wizard', 'fire', 'police', 'builder'];
// ---- end COLLECT block ----
function character(L, p, R, T, kind) {
  var h = L.hair;
  L.bare = false; L.held = null;
  switch (kind) {
    case 'astronaut': L.shirt = L.pants = L.shins = '#eef0f2'; L.print = 'astro'; L.pc = T.shirt; L.shoes = '#9aa0a6'; L.hands = '#cfd4da'; L.gear = { t: 'helmet', a: '#eef0f2', b: T.shirt, c: h, cell: 'astroVisor' }; break;
    case 'chef': L.shirt = '#f8f9fa'; L.print = 'chef'; L.pants = L.shins = '#343a40'; L.gear = { t: 'chef', a: '#ffffff', b: '#ffffff', c: h, cell: -1 }; L.face = R() < 0.5 ? 'tache' : 'grin'; break;
    case 'knight': L.shirt = '#9aa3ad'; L.print = 'armor'; L.pc = T.shirt; L.pants = L.shins = '#7d858f'; L.shoes = '#5c636a'; L.hands = '#7d858f'; L.gear = { t: 'helmet', a: '#c3cad2', b: T.shirt, c: h, cell: 'knight' }; break;
    case 'skeleton': L.skin = L.hands = '#efe9dc'; L.face = 'skull'; L.shirt = L.pants = L.shins = L.shoes = '#1e1e24'; L.print = 'bones'; L.gear = null; break;
    case 'robot': L.shirt = '#a9b1ba'; L.print = 'robot'; L.pc = T.shirt; L.pants = L.shins = '#8a929b'; L.shoes = '#5c636a'; L.hands = '#5c636a'; L.gear = { t: 'helmet', a: '#b9c1ca', b: T.shirt, c: h, cell: 'robotFace' }; break;
    case 'hero': L.shirt = pick(R, [T.shirt, '#7048e8', '#2f9e44']); L.print = 'heroT'; L.pc = '#ffd43b'; L.cape = pick(R, ['#ffd43b', T.alt, '#e64980']); L.face = 'hero'; L.paint = L.cape; L.pants = L.shins = L.shirt; L.shoes = L.cape; break;
    case 'mascot': { var mk = pick(R, ['wolf', 'bear', 'cat']), mc = MASCOTS[mk]; L.shirt = L.pants = L.shins = mc[0]; L.print = 'belly'; L.pc = mc[1]; L.shoes = L.hands = mc[1]; L.gear = { t: 'mask', a: mc[0], b: mc[1], c: h, cell: mk }; break; }
    case 'wizard': L.shirt = L.pants = L.shins = '#5f3dc4'; L.print = 'wizardT'; L.pc = '#ffd43b'; L.hair = '#e9ecef'; L.face = 'wizard'; L.gear = { t: 'wizard', a: '#5f3dc4', b: '#ffd43b', c: '#e9ecef', cell: 'wizStar' }; break;
    case 'fire': L.shirt = L.pants = L.shins = '#2b2f3a'; L.print = 'fire'; L.pc = '#ffd43b'; L.shoes = '#212529'; L.gear = { t: 'hardhat', a: '#e03131', b: '#e03131', c: h, cell: 'fireBadge' }; break;
    case 'police': L.shirt = '#3b5bdb'; L.print = 'police'; L.pc = '#ffd43b'; L.pants = L.shins = '#1f2a44'; L.shoes = '#212529'; L.gear = { t: 'police', a: '#1f2a44', b: '#15192b', c: h, cell: 'badge' }; break;
    default: L.shirt = '#ff922b'; L.print = 'hivis'; L.pants = L.shins = '#34507a'; L.gear = { t: 'hardhat', a: '#fcc419', b: '#fcc419', c: h, cell: 'logoStar' }; // builder
  }
  // ---- COLLECT (spot the fan) block: which character this fan is (mascots count by animal) ----
  p.charKind = kind === 'mascot' ? L.gear.cell : CHAR_KINDS.indexOf(kind) >= 0 ? kind : 'builder';
  // ---- end COLLECT block ----
}
// style 'fans' (stadium, night) or 'beach'
function dressPerson(p, R, o, beach) {
  var T = o.teams[p.team ? 1 : 0], L = p.L = {};
  var kid = R() < (beach ? 0.22 : 0.17), elder = !kid && R() < 0.1;
  if (p.role) { kid = p.role === 'kid'; elder = p.role === 'elder'; } // groups (families, friends) decide
  p.sc = kid ? 0.74 + R() * 0.07 : 0.93 + R() * 0.15; p.hs = kid ? 1.15 : 0.98 + R() * 0.05;
  L.seat = o.seatCol || T.seat;
  L.skin = pick(R, SKINS); L.hair = elder ? pick(R, GREYS) : R() < 0.04 ? pick(R, FUNHAIR) : pick(R, HAIRS);
  L.paint = PINK; L.pants = L.shins = pick(R, PANTS); L.shoes = pick(R, SHOES); L.hands = L.skin; L.cape = null; L.held = null; L.pantsC = '#3b5b92';
  L.face = wpick(R, kid ? FACES_KID : elder ? FACES_ELDER : FACES_ADULT);
  if (L.face === 'paint' || L.face === 'half') L.paint = T.shirt;
  var gt = beach ? wpick(R, ['sunhat', 30, 'cap', 13, 'bob', 8, 'short', 12, 'long', 6, 'pigtails', kid ? 10 : 3, 'curls', 6, 'bun', 6, 'spiky', 3, 'bald', elder ? 8 : 2, 'headphones', 2])
    : wpick(R, kid ? GEAR_KID : elder ? GEAR_ELDER : GEAR_ADULT);
  if (beach && R() < 0.3) L.face = 'shades';
  if (gt === 'bald') L.gear = null;
  else if (gt === 'cap' || gt === 'capBack') { var ca = beach ? pick(R, BRIGHT) : R() < 0.7 ? T.shirt : pick(R, NEUTRAL); L.gear = { t: gt, a: ca, b: R() < 0.5 ? ca : (beach ? '#ffffff' : T.trim), c: L.hair, cell: R() < 0.5 ? 'logoT' : 'logoStar' }; }
  else if (gt === 'beanie') L.gear = { t: 'beanie', a: R() < 0.7 ? T.shirt : pick(R, NEUTRAL), b: R() < 0.7 ? T.trim : pick(R, BRIGHT), c: L.hair, cell: -1 };
  else if (gt === 'headphones') L.gear = { t: 'headphones', a: R() < 0.5 ? '#212529' : pick(R, BRIGHT), b: pick(R, BRIGHT), c: L.hair, cell: -1 };
  else if (gt === 'sunhat') L.gear = { t: 'sunhat', a: pick(R, ['#f4e1a1', '#fff8e1', '#ffd8a8', '#ffc9c9', '#a5d8ff', '#f4e1a1']), b: pick(R, BRIGHT), c: L.hair, cell: -1 };
  else L.gear = hairGear(L, R, gt);
  if (R() < (beach ? 0.03 : 0.065)) { character(L, p, R, T, beach ? pick(R, ['hero', 'mascot', 'robot', 'astronaut']) : wpick(R, CHARACTERS)); }
  else {
    if (beach) { L.shirt = pick(R, BRIGHT.concat(NEUTRAL)); L.print = wpick(R, BEACH_PRINTS); L.pc = pick(R, BRIGHT); if (L.pc === L.shirt) L.pc = '#ffffff'; if (L.print === 'lifevest') L.shirt = '#ff6a1a'; }
    else if (R() < 0.68) { L.shirt = R() < 0.75 ? T.shirt : T.alt; L.print = wpick(R, TEAM_PRINTS); L.pc = wpick(R, [T.trim, 7, '#ffd43b', 2, '#212529', 1]); }
    else {
      L.print = wpick(R, NEUTRAL_PRINTS); L.shirt = pick(R, NEUTRAL); L.pc = pick(R, BRIGHT); if (L.pc === L.shirt) L.pc = '#212529';
      if (L.print === 'suit') { L.shirt = pick(R, ['#2b2f3a', '#343a40', '#3d2f24', '#2c3e66']); L.pc = T.shirt; L.pants = L.shins = L.shirt; L.shoes = '#212529'; }
      else if (L.print === 'hivis') L.shirt = pick(R, ['#d4f218', '#ff922b']);
      else if (L.print === 'overalls') { L.pantsC = pick(R, ['#3b5b92', '#2f4f7f', '#c2a878', '#e03131']); L.pants = L.shins = L.pantsC; L.shirt = pick(R, ['#f8f9fa', '#fab005', '#e64980', '#4dabf7']); }
      else if (L.print === 'jacket') { L.shirt = pick(R, ['#262626', '#5a3a22', '#3b2a20']); L.pc = pick(R, ['#f8f9fa', T.shirt, '#868e96']); }
      else if (L.print === 'hstripe') { L.shirt = '#f8f9fa'; L.pc = pick(R, ['#1f3a68', '#e03131', '#2f9e44']); }
    }
    L.bare = beach ? R() < 0.85 : (!LONG_SLEEVES[L.print] && R() < 0.3);
    if (beach) { L.pants = pick(R, SHORTS); L.shins = L.skin; L.shoes = R() < 0.55 ? L.skin : pick(R, BRIGHT); }
    else if (R() < 0.08) { L.pants = T.shirt; L.shins = L.skin; } // shorts in team colours
    var hr = R(), hk = kid ? 1.6 : 1;
    if (!beach && hr < 0.11) L.held = { t: 'scarf', a: T.shirt, b: T.trim, cell: 'scarfBands' };
    else if (hr < (beach ? 0.04 : 0.11) + 0.05 * hk) L.held = { t: 'flag', a: beach ? pick(R, BRIGHT) : T.shirt, b: beach ? pick(R, BRIGHT) : T.trim, cell: R() < 0.5 ? 'flagStripe' : 'flagStar' };
    else if (hr < (beach ? 0.04 : 0.11) + 0.09 * hk) L.held = { t: 'finger', a: beach ? pick(R, BRIGHT) : pick(R, [T.shirt, T.shirt, '#ffd43b', '#69db7c']), b: '#ffffff', cell: 'finger1' };
    else if (o.drinks && !kid && hr < 0.24) L.held = { t: 'drink', a: pick(R, ['#f8f9fa', '#f8f9fa', '#e03131', '#1c7ed6', '#fab005']), b: '#ffffff', cell: -1 };
    // groups: a family's kids and friends who came together dress alike (his kit, his number, face paint, beanies)
    var th = p.theme;
    if (th === 'replica' && T.shirt) { L.shirt = T.shirt; L.print = 'kidnum'; L.pc = T.trim; L.bare = false; }
    else if (th === 'paint') { L.face = 'paint'; L.paint = T.shirt; if (R() < 0.6) { L.shirt = T.shirt; L.print = wpick(R, TEAM_PRINTS); L.pc = T.trim; } }
    else if (th === 'beanie') { L.gear = { t: 'beanie', a: T.shirt, b: T.trim, c: L.hair, cell: -1 }; L.shirt = R() < 0.5 ? T.shirt : T.alt; L.print = R() < 0.5 ? 'hstripe' : 'none'; L.pc = T.trim; }
    else if (th === 'scarf' && !L.held) { L.held = { t: 'scarf', a: T.shirt, b: T.trim, cell: 'scarfBands' }; }
  }
}
var MONSTER = ['#94d82d', '#9775fa', '#ff922b', '#22b8cf', '#f783ac', '#ffd43b', '#4dabf7', '#69db7c', '#e599f7', '#ff6b6b'];
function dressMonster(p, R, o) {
  var L = p.L = {}, col = pick(R, MONSTER), light = mixc(col, '#ffffff', 0.22), dark = mixc(col, '#2a1a3a', 0.3);
  p.sc = 0.92 + R() * 0.32; p.hs = 1.06 + R() * 0.14;
  L.seat = o.seatCol || '#6e5566';
  L.skin = light; L.hair = dark; L.paint = pick(R, ['#ff6b9a', '#ff8787', '#e64980']);
  L.shirt = col; L.print = wpick(R, ['belly', 40, 'none', 20, 'hstripe', 12, 'n1', 3, 'n7', 3, 'n10', 3, 'star', 5, 'heart', 3, 'go', 3]);
  L.pc = L.print === 'belly' ? mixc(col, '#ffffff', 0.5) : pick(R, ['#ffffff', '#ffd43b', pick(R, MONSTER)]);
  L.pants = L.shins = col; L.shoes = L.hands = dark; L.bare = false; L.cape = null; L.pantsC = dark;
  L.face = wpick(R, ['m1', 14, 'm2', 18, 'm3', 14, 'm2t', 12, 'm1t', 10, 'm2s', 12, 'm4', 8]);
  var hornC = pick(R, ['#fff4e6', '#ffd8a8', '#e9d8fd', dark]), gt = wpick(R, ['horns', 30, 'horn1', 10, 'antennae', 14, 'fins', 12, 'spikes', 12, 'cap', 5, 'beanie', 5, 'none', 12]);
  if (gt === 'none') L.gear = null;
  else if (gt === 'cap') L.gear = { t: R() < 0.3 ? 'capBack' : 'cap', a: pick(R, BRIGHT), b: pick(R, BRIGHT), c: dark, cell: 'logoStar' };
  else if (gt === 'beanie') L.gear = { t: 'beanie', a: pick(R, BRIGHT), b: '#ffffff', c: dark, cell: -1 };
  else L.gear = { t: gt, a: gt === 'fins' || gt === 'spikes' ? dark : hornC, b: pick(R, ['#ffe066', '#ff8fa3', '#ffffff']), c: dark, cell: -1 };
  var hr = R();
  L.held = hr < 0.06 ? { t: 'scarf', a: pick(R, BRIGHT), b: '#ffffff', cell: 'scarfBands' } : hr < 0.11 ? { t: 'flag', a: '#ff7a1a', b: '#ffd43b', cell: 'flagStar' } : hr < 0.15 ? { t: 'finger', a: pick(R, BRIGHT), b: '#ffffff', cell: 'finger1' } : null;
}
// How many visibly different figures the wardrobe can make: part choices only (faces, shirt prints, head
// pieces, held things, sleeves), not counting skin, hair, shirt or team colours.
export function wardrobeVariety() {
  function names(t) { var o = {}; for (var i = 0; i < t.length; i += 2) o[t[i]] = 1; return o; }
  function n(o) { return Object.keys(o).length; }
  var faces = Object.assign(names(FACES_ADULT), names(FACES_KID), names(FACES_ELDER)), prints = Object.assign(names(TEAM_PRINTS), names(NEUTRAL_PRINTS), names(BEACH_PRINTS));
  var heads = Object.assign(names(GEAR_ADULT), names(GEAR_KID), names(GEAR_ELDER), { sunhat: 1 });
  var people = n(faces) * n(prints) * n(heads) * 4 * 2;
  var monsters = 7 * 9 * 9 * 4;
  return { faces: n(faces), prints: n(prints), heads: n(heads), held: 4, sleeves: 2, characters: CHARACTERS.length / 2 + 2, peopleCombos: people, monsterCombos: monsters, atlasCells: CELLS.length };
}

// =====================================================================================================
// Matrices: 12 numbers, row-major [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz]
// =====================================================================================================
function mul(A, B, o) {
  for (var r = 0; r < 3; r++) {
    var a0 = A[r * 4], a1 = A[r * 4 + 1], a2 = A[r * 4 + 2];
    o[r * 4] = a0 * B[0] + a1 * B[4] + a2 * B[8];
    o[r * 4 + 1] = a0 * B[1] + a1 * B[5] + a2 * B[9];
    o[r * 4 + 2] = a0 * B[2] + a1 * B[6] + a2 * B[10];
    o[r * 4 + 3] = a0 * B[3] + a1 * B[7] + a2 * B[11] + A[r * 4 + 3];
  }
  return o;
}
// translate (tx, ty, tz), then Ry(a) * Rz(b) * Rx(c), then uniform scale s
function joint(tx, ty, tz, a, b, c, s, o) {
  var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  var m00 = cb, m01 = -sb * cc, m02 = sb * sc, m10 = sb, m11 = cb * cc, m12 = -cb * sc, m21 = sc, m22 = cc;
  o[0] = ca * m00 * s; o[1] = (ca * m01 + sa * m21) * s; o[2] = (ca * m02 + sa * m22) * s; o[3] = tx;
  o[4] = m10 * s; o[5] = m11 * s; o[6] = m12 * s; o[7] = ty;
  o[8] = -sa * m00 * s; o[9] = (-sa * m01 + ca * m21) * s; o[10] = (-sa * m02 + ca * m22) * s; o[11] = tz;
  return o;
}
function put(arr, slot, M) { // column-major 4x4 into an instanceMatrix array
  var o = slot * 16;
  arr[o] = M[0]; arr[o + 1] = M[4]; arr[o + 2] = M[8]; arr[o + 3] = 0;
  arr[o + 4] = M[1]; arr[o + 5] = M[5]; arr[o + 6] = M[9]; arr[o + 7] = 0;
  arr[o + 8] = M[2]; arr[o + 9] = M[6]; arr[o + 10] = M[10]; arr[o + 11] = 0;
  arr[o + 12] = M[3]; arr[o + 13] = M[7]; arr[o + 14] = M[11]; arr[o + 15] = 1;
}
function sm(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
function env(s, a, r, dur) { return s <= 0 || s >= dur ? 0 : sm(s / a) * sm((dur - s) / r); }

// ----- the one crowd T3.crowd talks to (the venue that is on the table right now) -----
var current = null;
function install() {
  if (typeof window === 'undefined' || !window.T3 || window.T3.crowd) return;
  window.T3.crowd = function (kind, opts) {
    try {
      if (!current || (typeof document !== 'undefined' && document.hidden) || !current.attached()) return false;
      var ok = current.react(kind, opts || {});
      if (ok && window.T3.kick) window.T3.kick();
      return ok;
    } catch (e) { return false; }
  };
}
install();
// ---- COLLECT (spot the fan) block: T3.crowdChars() / T3.crowdPick(ray) / T3.crowdWave(i) on the venue on the table now ----
(function () {
  if (typeof window === 'undefined' || !window.T3 || window.T3.crowdPick) return;
  function live() { return current && !(typeof document !== 'undefined' && document.hidden) && current.attached() ? current : null; }
  window.T3.crowdChars = function () { try { var c = live(); return c ? c.chars() : []; } catch (e) { return []; } };
  window.T3.crowdPick = function (ray) { try { var c = live(); return c ? c.pick(ray) : null; } catch (e) { return null; } };
  window.T3.crowdWhere = function (i) { try { var c = live(); return c ? c.where(i) : null; } catch (e) { return null; } };
  window.T3.crowdWave = function (i) { try { var c = live(), ok = !!c && c.waveOne(i); if (ok && window.T3.kick) window.T3.kick(); return ok; } catch (e) { return false; } };
  window.T3.crowdKinds = CHAR_KINDS.slice();
})();
// ---- end COLLECT block ----
// for headless checks and debugging: the crowd T3.crowd drives right now (or null)
export function currentCrowd() { return current; }

// =====================================================================================================
// The crowd as a character: casting the tableau (stadium only, docs/handoff/crowd2.md)
// =====================================================================================================
// team colours as tokens ('@0s' = home shirt ...), painted from crowdstory.palette() and repainted when it changes
function tokTeam(t) { return { shirt: '@' + t + 's', alt: '@' + t + 'a', trim: '@' + t + 't', seat: '@' + t + 'e' }; }
function tokColour(tok, pal) { var t = tok.charAt(1) === '1' ? pal.away : pal.home, k = tok.charAt(2); return k === 's' ? t.shirt : k === 'a' ? t.alt : k === 't' ? t.trim : t.seat; }
var AWAY0 = 0.665, AWAYW = [0, 0.07, 0.08, 0.095, 0.11, 0.125];
function standOf(ry) { return Math.round(ry * 10); }
// rows of seats: people grouped by stand and step, sorted along the stand. Sets p.row, p.level (0 = front), p.s (along)
function rowsOf(pts, skip) {
  var map = {}, rows = [], stands = {};
  pts.forEach(function (p, i) {
    if (skip && skip(p)) return;
    var ry = p.seatRy != null ? p.seatRy : (p.ry || 0), st = standOf(ry), k = st + ':' + Math.round(p.y * 10);
    p.sRy = ry; p.s = p.x * Math.cos(ry) - p.z * Math.sin(ry);
    var r = map[k]; if (!r) { r = map[k] = { stand: st, y: p.y, ry: ry, list: [] }; rows.push(r); }
    r.list.push(i); p.row = r;
  });
  rows.forEach(function (r) { r.list.sort(function (a, b) { return pts[a].s - pts[b].s; }); (stands[r.stand] = stands[r.stand] || []).push(r); });
  Object.keys(stands).forEach(function (k) { stands[k].sort(function (a, b) { return a.y - b.y; }); stands[k].forEach(function (r, l) { r.level = l; r.top = l === stands[k].length - 1; }); });
  rows.forEach(function (r) { r.list.forEach(function (i, j) { pts[i].level = r.level; pts[i].ri = j; }); });
  return { rows: rows, stands: stands };
}
// the person in `cands` whose key is nearest t and who passes ok(i)
function nearestKey(pts, cands, t, ok) { var b = -1, bd = 9; cands.forEach(function (i) { var d = Math.abs(pts[i].key - t); if (d < bd && ok(i)) { bd = d; b = i; } }); return b; }
function plainFan(p) { return !p.charKind && !p.job && !p.vip && !p.band && !p.stand && !p.hold; }

// ----- the tableau before dressing: home end and away corner, families and friends -----
function castTeams(pts, rows, R2, tier) {
  var a1 = AWAY0 + AWAYW[tier];
  pts.forEach(function (p) { p.away = p.key >= AWAY0 && p.key <= a1; p.team = p.away && R2() > 0.06 ? 1 : 0; });
  rows.rows.forEach(function (r) {
    var L = r.list, j = 0;
    while (j < L.length) {
      if (R2() > 0.5) { j++; continue; }
      var size = 2 + Math.floor(R2() * 3), g = [L[j]];
      for (var k = j + 1; k < L.length && g.length < size; k++) { var a = pts[L[k - 1]], b = pts[L[k]]; if (b.s - a.s > 0.95 || b.team !== a.team) break; g.push(L[k]); }
      j += g.length + 1;
      if (g.length < 2) continue;
      var t = R2();
      if (t < 0.4) { // a family: a grown-up (or two) and kids in his kit
        g.forEach(function (i, n) { var p = pts[i]; p.role = n === 0 || (n === 3 && g.length === 4) ? 'adult' : 'kid'; p.theme = p.role === 'kid' ? (R2() < 0.65 ? 'replica' : '') : (R2() < 0.3 ? 'replica' : ''); });
      } else if (t < 0.78) { // friends who came together: the same face paint, beanies, scarves or shirts
        var th = ['paint', 'beanie', 'replica', 'scarf'][Math.floor(R2() * 4)];
        g.forEach(function (i) { pts[i].role = 'adult'; pts[i].theme = th; });
      } else g.forEach(function (i) { pts[i].role = R2() < 0.5 ? 'elder' : 'adult'; }); // a couple
    }
  });
}
function plainL(R, o, kind) { // staff and the mascot: dressed by hand
  var skin = pick(R, SKINS), hair = pick(R, HAIRS);
  var L = { seat: null, skin: skin, hair: hair, paint: PINK, pantsC: '#3b5b92', pants: '#1f2a44', shins: '#1f2a44', shoes: '#212529', hands: skin, cape: null, held: null, bare: false, face: pick(R, ['smile', 'content', 'specs', 'tache', 'beard']) };
  if (kind === 'steward') { L.shirt = '#d4f218'; L.print = 'hivis'; L.pc = '#ffffff'; L.back = 'stewardB'; L.gear = R() < 0.5 ? { t: 'cap', a: '#1f2a44', b: '#1f2a44', c: hair, cell: 'logoStar' } : hairGear(L, R, pick(R, ['short', 'bob', 'bun', 'curls'])); }
  else if (kind === 'camera') { L.shirt = '#2b2f3a'; L.print = 'hoodie'; L.pc = '#ffffff'; L.face = 'smile'; L.gear = { t: 'headphones', a: '#212529', b: '#e03131', c: hair, cell: -1 }; }
  else if (kind === 'mascot') { L.shirt = '@0s'; L.print = 'kidnum'; L.pc = '@0t'; L.pants = L.shins = '@0s'; L.shoes = '@0t'; L.hands = '#ffd43b'; L.skin = '#ffd43b'; L.face = 'kid'; L.gear = { t: 'cubehead', a: '#ffd43b', b: '@0t', c: hair, cell: 'cubey' }; }
  return L;
}
// ----- after dressing: found fans to better seats, the band, standing fans, banner holders, staff and the mascot -----
function castExtras(pts, rows, R2, R, tier, o, board) {
  var T0 = o.teams[0], back = rows.stands[0] || [], extras = [], out = { holders: [], rival: null, op: null };
  var frontBack = []; back.forEach(function (r) { if (r.level <= 1) frontBack = frontBack.concat(r.list); });
  // 1. Spot the Fan characters he has found move to the front rows of the back stand, where he can see them
  var targets = [0.4, 0.6, 0.36, 0.64, 0.44, 0.56, 0.32, 0.68, 0.28, 0.72, 0.24, 0.76, 0.2], ti = 0;
  CHAR_KINDS.filter(function (k) { return story.found().indexOf(k) >= 0; }).forEach(function (kind) {
    var c = -1; for (var i = 0; i < pts.length; i++) if (pts[i].charKind === kind && !pts[i].vip) { c = i; break; }
    if (c < 0 || ti >= targets.length) return;
    var d = nearestKey(pts, frontBack, targets[ti++], function (i) { return i !== c && plainFan(pts[i]) && !pts[i].away && !pts[i].L.held; });
    if (d < 0) return;
    var A = pts[c], B = pts[d], sw = ['L', 'charKind', 'sc', 'hs'];
    sw.forEach(function (k) { var t = A[k]; A[k] = B[k]; B[k] = t; });
    if (!A.charKind) delete A.charKind;
    A.L.seat = o.teams[A.team ? 1 : 0].seat; B.L.seat = o.teams[B.team ? 1 : 0].seat; B.vip = true;
  });
  // 2. the brass band (tier 2+): two short rows in the home part of the back stand, horns and a drum each row
  if (tier >= 2) {
    var per = tier >= 4 ? 4 : 3;
    back.filter(function (r) { return r.level === 1 || r.level === 2; }).forEach(function (r) {
      var c = nearestKey(pts, r.list, 0.31, function (i) { return plainFan(pts[i]) && !pts[i].away; }); if (c < 0) return;
      var j0 = Math.max(0, pts[c].ri - Math.floor(per / 2)), run = r.list.slice(j0, j0 + per).filter(function (i) { return plainFan(pts[i]) && !pts[i].away; });
      run.forEach(function (i, n) {
        var p = pts[i], L = p.L, drum = n === Math.floor(run.length / 2);
        p.band = drum ? 'drum' : 'horn'; p.sc = 0.95 + R2() * 0.08; p.hs = 1;
        L.shirt = T0.trim; L.print = 'band'; L.pc = '#ffd43b'; L.pants = L.shins = '#1f2a44'; L.shoes = '#212529'; L.bare = false; L.held = null; L.cape = null; L.hands = L.skin;
        L.gear = { t: 'bandhat', a: T0.shirt, b: '#ffd43b', c: L.hair, cell: -1 }; if (L.face === 'shades' || L.face === 'tacheShades') L.face = 'smile';
        p.pose = drum ? { ra0: 0.75, ra1: 0.75, yaw: 0.32 } : { ra0: 1.22, ra1: 1.22, yaw: 0.56, hd: -0.06 }; p.armK = 0;
      });
    });
  }
  // 3. a few fans stand in the back rows; from tier 2 one of them carries a kid on the shoulders
  var tops = []; Object.keys(rows.stands).forEach(function (k) { var st = rows.stands[k]; if (st.length) tops = tops.concat(st[st.length - 1].list); });
  var nst = [0, 2, 3, 4, 5, 6][tier], stT = [0.42, 0.58, 0.3, 0.7, 0.22, 0.78], carriers = [];
  for (var s = 0; s < nst; s++) {
    var c2 = nearestKey(pts, tops, stT[s], function (i) { var p = pts[i]; return plainFan(p) && p.team === 0 && p.sc > 0.9 && !p.L.cape; });
    if (c2 < 0) continue;
    var P2 = pts[c2]; P2.stand = true;
    if (tier >= 2 && s % 2 === 0) { P2.L.held = null; P2.carry = true; P2.pose = { ra0: 2.25, ra1: 2.25, yaw: 0.05, roll: -0.35 }; P2.armK = 0; P2.hopK = 0; carriers.push(P2); }
  }
  // 4. hand-made banners, held up by two fans in the front rows (a third one may sit behind it)
  function pairNear(t, ok) {
    var best = null, bd = 9;
    rows.rows.forEach(function (r) {
      if (r.level > 1) return;
      for (var j = 0; j < r.list.length; j++) for (var q = j + 1; q <= j + 2 && q < r.list.length; q++) {
        var a = pts[r.list[j]], b = pts[r.list[q]], gap = b.s - a.s;
        if (gap < 1.05 || gap > 2.5 || !ok(a) || !ok(b)) continue;
        if (q === j + 2 && !plainFan(pts[r.list[j + 1]])) continue;
        var d = Math.abs((a.key + b.key) / 2 - t) + r.level * 0.01;
        if (d < bd) { bd = d; best = [r.list[j], r.list[q]]; }
      }
    });
    return best;
  }
  var nb = [0, 2, 3, 4, 6, 8][tier], bT = [0.4, 0.6, 0.33, 0.66, 0.26, 0.45, 0.18, 0.82, 0.1, 0.9];
  function holder(p) { return plainFan(p) && !p.used && p.sc > 0.85; }
  for (var b = 0; b < nb && b < bT.length; b++) {
    var pr = pairNear(bT[b], function (p) { return holder(p) && !p.away; });
    if (!pr) continue;
    out.holders.push([pts[pr[0]], pts[pr[1]]]);
    pr.forEach(function (i) { var p = pts[i]; p.hold = true; p.used = true; p.L.held = null; p.pose = { ra0: 1.32, ra1: 1.32, yaw: 0.12 }; p.armK = 0; var r = p.row; [-1, 1].forEach(function (dj) { var q = r.list[p.ri + dj]; if (q != null) pts[q].used = true; }); });
  }
  var rp = pairNear(AWAY0 + AWAYW[tier] / 2, function (p) { return holder(p) && p.away && p.team === 1; });
  if (rp) { out.rival = [pts[rp[0]], pts[rp[1]]]; rp.forEach(function (i) { var p = pts[i]; p.hold = true; p.L.held = null; p.pose = { ra0: 1.32, ra1: 1.32, yaw: 0.12 }; p.armK = 0; }); }
  // 5. staff: stewards on the ground in front of each stand (facing the fans), a TV camera on the back stand's top row
  function extra(p) { p.job = p.job || 'x'; p.noSeat = true; p.rk = p.rk == null ? 0 : p.rk; extras.push(p); return p; }
  var nsw = tier <= 2 ? 1 : tier <= 4 ? 2 : 3;
  Object.keys(rows.stands).forEach(function (k) {
    var fr = rows.stands[k][0]; if (!fr || fr.list.length < 4) return;
    for (var m = 0; m < nsw; m++) {
      var p = pts[fr.list[Math.floor((m + 0.5) / nsw * fr.list.length)]], nx = Math.sin(fr.ry), nz = Math.cos(fr.ry);
      extra({ x: p.x + nx * 1.25, y: FLOOR_Y, z: p.z + nz * 1.25, ry: fr.ry + Math.PI, key: p.key, team: 0, job: 'steward', stand: true, sc: 0.98 + R2() * 0.06, hs: 1, L: plainL(R2, o, 'steward') });
    }
  });
  if (back.length) {
    var top = back[back.length - 1], want = board && board.x > 0 ? -6 : 6, c3 = -1, cd = 1e9;
    top.list.forEach(function (i) { var d = Math.abs(pts[i].x - want); if (d < cd && !pts[i].charKind) { cd = d; c3 = i; } });
    if (c3 >= 0) {
      var P3 = pts[c3];
      // the camera operator takes this seat and the two beside it (they become the platform)
      [-1, 1].forEach(function (dj) { var q = top.list[P3.ri + dj]; if (q != null) pts[q].gone = true; });
      out.op = extra({ x: P3.x, y: P3.y + 0.12, z: P3.z, ry: Math.atan2(-P3.x, -P3.z), key: P3.key, team: 0, job: 'camera', stand: true, rig: true, sc: 1, hs: 1, L: plainL(R2, o, 'camera') });
      P3.gone = true;
      out.op.pose = { ra0: 1.05, ra1: 1.15, yaw: 0.22 };
    }
  }
  // 6. the home mascot, on the grass in front of the back stand (behind the ad boards), left of the table
  var fb = back[0];
  if (fb && fb.list.length > 6) {
    var wantM = board && board.x > 0 ? -5.5 : 5.5, cm = -1, md = 1e9;
    var hx = []; out.holders.forEach(function (pr) { hx.push(pr[0].x, pr[1].x); }); // not in front of a banner
    fb.list.forEach(function (i) { var d = Math.abs(pts[i].x - wantM); for (var h = 0; h < hx.length; h++) if (Math.abs(pts[i].x - hx[h]) < 1.6) d += 50; if (d < md) { md = d; cm = i; } });
    if (cm >= 0) { var PM = pts[cm]; extra({ x: PM.x, y: FLOOR_Y, z: PM.z + 1.0, ry: Math.atan2(-PM.x, -(PM.z + 1.0)), key: PM.key, team: 0, job: 'mascot', stand: true, rk: 1, sc: 1.28, hs: 1, L: plainL(R2, o, 'mascot') }); }
  }
  // 7. the kids on shoulders
  carriers.forEach(function (c) {
    var p = { x: c.x, y: c.y, z: c.z, ry: c.ry, key: c.key, team: 0, role: 'kid', theme: 'replica', job: 'rider', riderP: c, rk: 1, hopK: 0 };
    for (var tries = 0; tries < 8; tries++) { dressPerson(p, R2, o, false); if (!p.charKind) break; delete p.charKind; }
    p.L.held = null; p.L.cape = null; p.sc = 0.76; p.hs = 1.15;
    p.pose = { ra0: 0.5, ra1: 2.55, yaw: 0, roll: 0.15 }; p.armK = 0.6;
    extra(p);
  });
  return { extras: extras, holders: out.holders, rival: out.rival, op: out.op };
}
// seats with nobody in them: gaps of one to three seats in a row (small grounds have many; tier 5 a few)
function emptySeats(pts, rows, tier, avoid) {
  var out = [], a1 = AWAY0 + AWAYW[tier];
  rows.rows.forEach(function (r) {
    for (var j = 1; j < r.list.length; j++) {
      var a = pts[r.list[j - 1]], b = pts[r.list[j]], gap = b.s - a.s, n = Math.round(gap / 0.62) - 1;
      if (n < 1 || gap > 2.7) continue;
      for (var k = 1; k <= n; k++) {
        var f = k / (n + 1), x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, key = a.key + (b.key - a.key) * f;
        if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 1.0) continue;
        out.push({ x: x, y: r.y, z: z, ry: r.ry, key: key, level: r.level, stand: r.stand, s: a.s + (b.s - a.s) * f, tok: key >= AWAY0 && key <= a1 ? '@1e' : '@0e' });
      }
    }
  });
  return out;
}
function findBoard(group) {
  var scr = null; group.traverse(function (o2) { if (o2.userData && o2.userData.board) scr = o2; });
  if (!scr || !scr.parent) return null;
  var w = scr.geometry && scr.geometry.parameters ? scr.geometry.parameters.width : 6;
  return { x: scr.parent.position.x, y: scr.parent.position.y, z: scr.parent.position.z, w: w };
}

// pts: [{ x, y, z, ry (facing the pitch), seatRy (optional, the seat's facing), key (0..1 along the stands), team (0 | 1) }]
// o: { quality(), style ('fans' | 'beach' | 'monsters'), teams ([{ shirt, alt, trim, seat }, ...]), seatCol,
//      seats (true), dim (1), seed, redress (optional, for checks: (p, i, asCharacter) after dressing),
//      detached (the title screen: T3.crowd never drives it), plain (true: no character, the old crowd) }
// 'fans' without o.teams = the stadium: the crowd as a character (his kit, the away corner, displays, directed reactions).
// Returns { pts, N, meshes, react(kind, opts), step(now), reset(), busy(), stats(), ... }.
export function makeBlockCrowd(group, pts, o) {
  o = o || {};
  var quality = o.quality || function () { return 2; }, q0 = quality(), det = q0 >= 2 ? 2 : q0 >= 1 ? 1 : 0, dim = o.dim == null ? 1 : o.dim, style = o.style || 'fans';
  var live = style === 'fans' && !o.teams && !o.plain, tier = live ? Math.max(1, Math.min(5, +stadiumTier() || 1)) : 0;
  if (live) { o.teams = [tokTeam(0), tokTeam(1)]; o.drinks = true; refreshAtlas(story.jersey()); }
  o.teams = o.teams || [{ shirt: '#e03131', alt: '#c92a2a', trim: '#ffffff', seat: '#c73a3a' }, { shirt: '#1c7ed6', alt: '#1864ab', trim: '#ffffff', seat: '#2f66c4' }];
  if (q0 < 1) pts = pts.filter(function (p, i) { return i % 3 !== 2; }); // low tier: a third fewer people
  else if (q0 < 2) pts = pts.filter(function (p, i) { return i % 6 !== 5; }); // medium (tablets start here): a sixth fewer, a few empty seats
  var R = rng(o.seed || 4242), R2 = rng((o.seed || 4242) + 77), mat = crowdMaterial(dim), board = live ? findBoard(group) : null;
  var rows = live ? rowsOf(pts) : null;
  if (live) castTeams(pts, rows, R2, tier);
  pts.forEach(function (p) { if (style === 'monsters') dressMonster(p, R, o); else dressPerson(p, R, o, style === 'beach'); });
  var cast = live ? castExtras(pts, rows, R2, R, tier, o, board) : null;
  if (cast) { pts = pts.filter(function (p) { return !p.gone; }).concat(cast.extras); }
  var N = pts.length;
  if (cast) { // indexes moved (the operator's seats went): find the holders and the carriers again, and the rows
    var ix = new Map(); pts.forEach(function (p, i) { ix.set(p, i); });
    cast.holders = cast.holders.map(function (pr) { return [ix.get(pr[0]), ix.get(pr[1])]; });
    if (cast.rival) cast.rival = [ix.get(cast.rival[0]), ix.get(cast.rival[1])];
    pts.forEach(function (p) { if (p.riderP) p.rider = ix.get(p.riderP); });
    rows = rowsOf(pts, function (p) { return p.noSeat; });
  }
  if (o.redress) pts.forEach(function (p, i) { o.redress(p, i, function (kind) { character(p.L, p, R, o.teams[p.team ? 1 : 0], kind); }); }); // for checks: dress someone up

  // ----- what each person wears: one entry per instance -----
  var ents = [], count = {}, headFn = headGeo(style === 'monsters');
  function add(i, key, fn, code, a, b, c, c0, c1) {
    ents.push({ i: i, key: key, fn: fn, code: code, a: a, b: b, c: c, c0: c0 == null || c0 === -1 ? -1 : CI[c0], c1: c1 == null || c1 === -1 ? -1 : CI[c1] });
    count[key] = (count[key] || 0) + 1;
  }
  pts.forEach(function (p, i) {
    var L = p.L;
    if (o.seats !== false && !p.noSeat) add(i, 'seat', seatGeo, -1, L.seat, L.seat, L.seat);
    if (p.stand) add(i, 'x:stand', PROPS.stand.fn, 0, L.pants, L.shins, L.shoes); else add(i, 'legs', legsGeo, 0, L.pants, L.shins, L.shoes);
    if (p.rig) add(i, 'x:rig', PROPS.rig.fn, 0, '#5c636a', '#5c636a', '#5c636a');
    if (p.rider != null) add(i, 'x:shoulders', PROPS.shoulders.fn, 0, L.pants, L.shins, L.shoes);
    var tp = L.print && L.print !== 'none' ? L.print : -1;
    add(i, 'torso', torsoGeo, 1, L.shirt, L.pc || '#ffffff', L.pantsC, tp, L.back || (tp !== -1 && BACKS[tp] ? tp : -1));
    if (L.cape) add(i, 'cape', capeGeo, 1, L.cape, L.cape, L.cape);
    add(i, 'head', headFn, 2, L.skin, L.hair, L.paint, L.face);
    if (L.gear) add(i, 'g:' + L.gear.t, GEAR[L.gear.t], 2, L.gear.a, L.gear.b, L.gear.c, L.gear.cell);
    var fore = L.bare ? L.skin : L.shirt;
    add(i, 'arms', armGeo, 3, L.shirt, fore, L.hands); add(i, 'arms', armGeo, 4, L.shirt, fore, L.hands);
    if (L.held) add(i, 'h:' + L.held.t, HELD[L.held.t].fn, HELD[L.held.t].code, L.held.a, L.held.b, L.held.b, L.held.cell, L.held.cell);
    if (p.band) add(i, 'x:' + p.band, PROPS[p.band].fn, PROPS[p.band].code, o.teams[0].shirt, '#f1f3f5', '#f1f3f5');
  });
  var empties = live ? emptySeats(pts, rows, tier, cast && cast.op) : [];
  if (o.seats !== false) empties.forEach(function (e) { add(-1, 'seat', seatGeo, -1, e.tok, e.tok, e.tok); });
  // rare parts share a mesh: held things and capes in one, head gear worn by fewer than 2% in another, big props
  // (standing legs, the camera platform, instruments) in a third. A draw call each would cost more than the few
  // vertices that collapse (each instance shows only its own variant)
  function rare(key) { var c0 = key.charAt(0); return key === 'cape' || key.charAt(1) === ':' && (c0 === 'h' || c0 === 'x' || count[key] < Math.max(4, 0.02 * N)); }
  var parts = [], partIx = {}, mixFns = { mixH: [], mixG: [], mixX: [] }, mixVar = {}, seatSlot = new Int32Array(N).fill(-1), emptySlot = [];
  var attStart = new Int32Array(N + 1), attPart = [], attSlot = [], attCode = [], attPerson = []; // codes: 0 legs, 1 torso, 2 head, 3/4 arms, 5 right-hand upright, 6 scarf
  ents.forEach(function (e) {
    var key = e.key, vr = 0;
    if (rare(key)) { var c0 = key.charAt(0), mk = c0 === 'g' ? 'mixG' : c0 === 'x' ? 'mixX' : 'mixH'; if (mixVar[key] == null) { mixFns[mk].push(e.fn); mixVar[key] = mixFns[mk].length; } vr = mixVar[key]; key = mk; }
    if (partIx[key] == null) { partIx[key] = parts.length; parts.push({ key: key, fn: e.fn, list: [] }); }
    var k = partIx[key], P = parts[k];
    P.list.push(e.a, e.b, e.c, e.c0, e.c1, vr);
    var slot = P.list.length / 6 - 1;
    if (key === 'seat') { if (e.i >= 0) seatSlot[e.i] = slot; else emptySlot.push(slot); }
    if (e.code >= 0) { attPerson.push(e.i); attPart.push(k); attSlot.push(slot); attCode.push(e.code); }
  });
  // attachments come in person order: attStart[i] .. attStart[i + 1] are person i's
  for (var i1 = 0, j1 = 0; i1 <= N; i1++) { while (j1 < attPerson.length && attPerson[j1] < i1) j1++; attStart[i1] = j1; }

  // ----- one InstancedMesh per part type -----
  var meshes = [], dyn = [], seatMesh = null, tc = new THREE.Color(), pal = live ? story.palette() : null, toks = [];
  function colourOf(c, arr, at) { if (typeof c === 'string' && c.charAt(0) === '@') { toks.push(arr, at, c); return tokColour(c, pal); } return c; }
  parts.forEach(function (P) {
    var n = P.list.length / 6, geo = mixFns[P.key] ? buildMix(mixFns[P.key], det) : build(P.fn, det), A = new Float32Array(n * 3), B = new Float32Array(n * 3), Cc = new Float32Array(n * 3), Me = new Float32Array(n * 3);
    for (var j = 0; j < n; j++) {
      var L6 = j * 6;
      tc.set(colourOf(P.list[L6], A, j * 3)); A[j * 3] = tc.r; A[j * 3 + 1] = tc.g; A[j * 3 + 2] = tc.b;
      tc.set(colourOf(P.list[L6 + 1], B, j * 3)); B[j * 3] = tc.r; B[j * 3 + 1] = tc.g; B[j * 3 + 2] = tc.b;
      tc.set(colourOf(P.list[L6 + 2], Cc, j * 3)); Cc[j * 3] = tc.r; Cc[j * 3 + 1] = tc.g; Cc[j * 3 + 2] = tc.b;
      Me[j * 3] = P.list[L6 + 3]; Me[j * 3 + 1] = P.list[L6 + 4]; Me[j * 3 + 2] = P.list[L6 + 5];
    }
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 3)); geo.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 3));
    geo.setAttribute('iC', new THREE.InstancedBufferAttribute(Cc, 3)); geo.setAttribute('iMeta', new THREE.InstancedBufferAttribute(Me, 3));
    var m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.name = 'crowd:' + P.key;
    group.add(m); meshes.push(m); P.mesh = m; P.geo = geo;
    if (P.key === 'seat') seatMesh = m; else dyn.push(m);
  });
  var partArr = parts.map(function (P) { return P.mesh.instanceMatrix.array; });
  // the home kit, the away colours, his number changed (or a new opponent): repaint the tokens in place
  function repaint() {
    if (!live) return;
    pal = story.palette();
    for (var k = 0; k < toks.length; k += 3) { tc.set(tokColour(toks[k + 2], pal)); var a = toks[k], at = toks[k + 1]; a[at] = tc.r; a[at + 1] = tc.g; a[at + 2] = tc.b; }
    parts.forEach(function (P) { P.geo.attributes.iA.needsUpdate = P.geo.attributes.iB.needsUpdate = P.geo.attributes.iC.needsUpdate = true; });
    refreshAtlas(story.jersey());
    if (banners) { styleBanners(); banners.retext(bannerTexts()); }
  }

  // ----- base matrix per person: T(x, y, z) * Ry(ry) * scale, and a fixed (never moving) rest pose -----
  var base = new Float32Array(12 * N), key = new Float32Array(N), rA = new Float32Array(N), rB = new Float32Array(N), hs = new Float32Array(N), kidF = new Uint8Array(N), bRy = new Float32Array(N);
  var rRa0 = new Float32Array(N), rRa1 = new Float32Array(N), rYaw = new Float32Array(N), rHd = new Float32Array(N), rTilt = new Float32Array(N), rHy = new Float32Array(N);
  var rDy = new Float32Array(N), rLean = new Float32Array(N), rRoll = new Float32Array(N);
  var rk = new Uint8Array(N).fill(1), armK = new Float32Array(N).fill(1), hopK = new Float32Array(N).fill(1), away = new Uint8Array(N), heldT = new Uint8Array(N), clasp = new Uint8Array(N);
  var S = new Float64Array(12);
  pts.forEach(function (p, i) {
    var k = p.sc || 1, ry = (p.ry || 0) + (R() - 0.5) * 0.3, b = i * 12, y = p.stand ? p.y + RAISE * k : p.y + SEAT_Y * (1 - k);
    if (p.job) ry = p.ry || 0; // staff, the mascot and riders face exactly where they should
    if (p.rider != null) { // on the shoulders of the grown-up (who is already placed: riders come last)
      var c = p.rider, cb = c * 12, kc = base[cb + 5], fx = base[cb + 2] / kc, fz = base[cb + 10] / kc;
      ry = Math.atan2(fx, fz); y = base[cb + 7] + (HIP_Y + NECK + 0.02) * kc - HIP_Y * k;
      p.x = base[cb + 3] - fx * 0.15 * kc; p.z = base[cb + 11] - fz * 0.15 * kc;
    }
    var c2 = Math.cos(ry), s = Math.sin(ry);
    base[b] = c2 * k; base[b + 1] = 0; base[b + 2] = s * k; base[b + 3] = p.x;
    base[b + 4] = 0; base[b + 5] = k; base[b + 6] = 0; base[b + 7] = y;
    base[b + 8] = -s * k; base[b + 9] = 0; base[b + 10] = c2 * k; base[b + 11] = p.z;
    bRy[i] = ry;
    key[i] = p.key || 0; rA[i] = R(); rB[i] = R(); hs[i] = p.hs || 1; kidF[i] = p.sc < 0.85 ? 1 : 0;
    rHd[i] = (R() - 0.5) * 0.14; rTilt[i] = (R() - 0.5) * 0.16; rHy[i] = (R() - 0.5) * 0.4;
    var held = p.L.held && p.L.held.t, r = R();
    if (held === 'scarf') { rRa0[i] = rRa1[i] = 0.5; rYaw[i] = 0.25; }
    else if (held) { rRa0[i] = (R() - 0.5) * 0.12; rRa1[i] = held === 'drink' ? 0.42 : 0.55; }
    else if (r < 0.18) { rRa0[i] = rRa1[i] = 0.22; rYaw[i] = 0.18; } // hands together on the lap
    else { rRa0[i] = (R() - 0.5) * 0.16; rRa1[i] = (R() - 0.5) * 0.16; }
    if (seatMesh && seatSlot[i] >= 0) { // seats: not scaled, never move
      var ry0 = p.seatRy != null ? p.seatRy : (p.ry || 0), c0 = Math.cos(ry0), s0 = Math.sin(ry0);
      S[0] = c0; S[1] = 0; S[2] = s0; S[3] = p.x; S[4] = 0; S[5] = 1; S[6] = 0; S[7] = p.y; S[8] = -s0; S[9] = 0; S[10] = c0; S[11] = p.z;
      put(seatMesh.instanceMatrix.array, seatSlot[i], S);
    }
    // the character's own still pose and how they join in
    var po = p.pose; if (po) { if (po.ra0 != null) rRa0[i] = po.ra0; if (po.ra1 != null) rRa1[i] = po.ra1; if (po.yaw != null) rYaw[i] = po.yaw; if (po.roll != null) rRoll[i] = po.roll; if (po.hd != null) rHd[i] = po.hd; }
    if (p.job === 'camera' || p.job === 'mascot' || p.job === 'rider') rHy[i] = 0;
    if (p.rk != null) rk[i] = p.rk; if (p.armK != null) armK[i] = p.armK; if (p.hopK != null) hopK[i] = p.hopK;
    away[i] = p.team === 1 ? 1 : 0; heldT[i] = held === 'flag' ? 1 : held === 'finger' ? 2 : held === 'scarf' ? 3 : held ? 4 : 0;
  });
  if (live) { var RC = rng(909); for (var ic = 0; ic < N; ic++) clasp[ic] = RC() < 0.3 ? 1 : 0; }
  if (seatMesh) empties.forEach(function (e, j) { var c0 = Math.cos(e.ry), s0 = Math.sin(e.ry); S[0] = c0; S[1] = 0; S[2] = s0; S[3] = e.x; S[4] = 0; S[5] = 1; S[6] = 0; S[7] = e.y; S[8] = -s0; S[9] = 0; S[10] = c0; S[11] = e.z; put(seatMesh.instanceMatrix.array, emptySlot[j], S); });

  // pose accumulators (added on top of the rest pose)
  var aDy = new Float32Array(N), aLean = new Float32Array(N), aHead = new Float32Array(N), aTilt = new Float32Array(N), aHy = new Float32Array(N);
  var aRa0 = new Float32Array(N), aRa1 = new Float32Array(N), aRoll = new Float32Array(N), aYaw = new Float32Array(N);
  var Pm = new Float64Array(12), Tm = new Float64Array(12), J = new Float64Array(12), Hm = new Float64Array(12), A0 = new Float64Array(12), A1 = new Float64Array(12), M = new Float64Array(12);
  // acc: add the reaction accumulators (false: the rest pose)
  function pose(i, acc) {
    var b = i * 12, k, j;
    var dy = rDy[i], lean = rLean[i], hd = rHd[i], tilt = rTilt[i], hy = rHy[i], ra0 = rRa0[i], ra1 = rRa1[i], yaw = rYaw[i], roll = rRoll[i];
    if (acc) { dy += aDy[i]; lean += aLean[i]; hd += aHead[i]; tilt += aTilt[i]; hy += aHy[i]; ra0 += aRa0[i]; ra1 += aRa1[i]; yaw += aYaw[i]; roll += aRoll[i]; }
    for (k = 0; k < 12; k++) Pm[k] = base[b + k];
    Pm[7] += dy;
    mul(Pm, joint(0, HIP_Y, 0, 0, 0, lean, 1, J), Tm);
    mul(Tm, joint(0, NECK, 0, hy, tilt, hd, hs[i], J), Hm);
    // side 0 is local -x, side 1 is +x. roll is "outward", weighted by cos(raise) so raised arms make a V;
    // yaw is "inward" (toward the other hand: clapping, hands to the face)
    var r0 = REST_RAISE + ra0, r1 = REST_RAISE + ra1, ro = REST_ROLL + roll, yw = yaw;
    if (r0 > 3.0) r0 = 3.0; if (r1 > 3.0) r1 = 3.0;
    mul(Tm, joint(-SH_X, SH_Y, 0, yw, -ro * Math.cos(r0), -r0, 1, J), A0);
    mul(Tm, joint(SH_X, SH_Y, 0, -yw, ro * Math.cos(r1), -r1, 1, J), A1);
    for (j = attStart[i]; j < attStart[i + 1]; j++) {
      var arr = partArr[attPart[j]], slot = attSlot[j];
      switch (attCode[j]) {
        case 0: put(arr, slot, Pm); break;
        case 1: put(arr, slot, Tm); break;
        case 2: put(arr, slot, Hm); break;
        case 3: put(arr, slot, A0); break;
        case 4: put(arr, slot, A1); break;
        case 5: // upright in the right hand: the torso's rotation, at the hand
          for (k = 0; k < 12; k++) M[k] = Tm[k];
          M[3] = A1[3] - HAND * A1[1]; M[7] = A1[7] - HAND * A1[5]; M[11] = A1[11] - HAND * A1[9];
          put(arr, slot, M); break;
        case 6: { // scarf stretched between the two hands, kept upright
          var h0x = A0[3] - HAND * A0[1], h0y = A0[7] - HAND * A0[5], h0z = A0[11] - HAND * A0[9];
          var h1x = A1[3] - HAND * A1[1], h1y = A1[7] - HAND * A1[5], h1z = A1[11] - HAND * A1[9];
          var sc = Math.hypot(Tm[1], Tm[5], Tm[9]), xx = (h1x - h0x) * 1.2, xy = (h1y - h0y) * 1.2, xz = (h1z - h0z) * 1.2, xl = Math.hypot(xx, xy, xz);
          if (xl < 0.3 * sc) { var f = xl > 1e-6 ? 0.3 * sc / xl : 0; if (!f) { xx = Tm[0] * 0.3; xy = Tm[4] * 0.3; xz = Tm[8] * 0.3; } else { xx *= f; xy *= f; xz *= f; } xl = 0.3 * sc; }
          var ux = xx / xl, uy = xy / xl, uz = xz / xl, yx = Tm[1], yy = Tm[5], yz = Tm[9], d = yx * ux + yy * uy + yz * uz;
          yx -= d * ux; yy -= d * uy; yz -= d * uz; var yl = Math.hypot(yx, yy, yz) || 1; yx *= sc / yl; yy *= sc / yl; yz *= sc / yl;
          M[0] = xx; M[4] = xy; M[8] = xz; M[1] = yx; M[5] = yy; M[9] = yz;
          M[2] = (uy * yz - uz * yy); M[6] = (uz * yx - ux * yz); M[10] = (ux * yy - uy * yx);
          M[3] = (h0x + h1x) / 2; M[7] = (h0y + h1y) / 2; M[11] = (h0z + h1z) / 2;
          put(arr, slot, M); break;
        }
      }
    }
  }
  for (var i0 = 0; i0 < N; i0++) pose(i0, false);
  var rest = dyn.map(function (m) { return m.instanceMatrix.array.slice(); }), restOf = parts.map(function (P) { return P.mesh === seatMesh ? null : rest[dyn.indexOf(P.mesh)]; });
  meshes.forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
  function uploadAll() { for (var k = 0; k < dyn.length; k++) dyn[k].instanceMatrix.needsUpdate = true; }
  function restoreAll() { dyn.forEach(function (m, k) { m.instanceMatrix.array.set(rest[k]); m.instanceMatrix.needsUpdate = true; }); }
  function restorePerson(i) {
    for (var j = attStart[i]; j < attStart[i + 1]; j++) { var a = partArr[attPart[j]], r = restOf[attPart[j]], o2 = attSlot[j] * 16; for (var q = 0; q < 16; q++) a[o2 + q] = r[o2 + q]; }
  }
  function poseRest(i) { var live0 = partArr; partArr = restOf; pose(i, false); partArr = live0; } // a new still pose: written into the rest copy only
  // a hand's place in group space from the rest pose (side 0 left, 1 right)
  function handAt(i, side) {
    for (var j = attStart[i]; j < attStart[i + 1]; j++) if (attCode[j] === 3 + side) { var r = restOf[attPart[j]], o2 = attSlot[j] * 16; return { x: r[o2 + 12] - HAND * r[o2 + 4], y: r[o2 + 13] - HAND * r[o2 + 5], z: r[o2 + 14] - HAND * r[o2 + 6] }; }
    return null;
  }

  // ===== stances: a held pose that changes once (flags up, scarves up, leaning in, looking at the big screen, phones up) =====
  var NP = 9, B_LEAN = 1, B_FLAG = 2, B_SCARF = 4, B_LOOK = 8, B_PHONE = 16;
  var rest0 = new Float32Array(N * NP), bits = new Uint8Array(N), lookYaw = new Float32Array(N), cur9 = new Float32Array(NP), new9 = new Float32Array(NP);
  function getP(i, out) { out[0] = rDy[i]; out[1] = rLean[i]; out[2] = rHd[i]; out[3] = rTilt[i]; out[4] = rHy[i]; out[5] = rRa0[i]; out[6] = rRa1[i]; out[7] = rYaw[i]; out[8] = rRoll[i]; }
  function setP(i, v) { rDy[i] = v[0]; rLean[i] = v[1]; rHd[i] = v[2]; rTilt[i] = v[3]; rHy[i] = v[4]; rRa0[i] = v[5]; rRa1[i] = v[6]; rYaw[i] = v[7]; rRoll[i] = v[8]; }
  for (var ip = 0; ip < N; ip++) { getP(ip, cur9); rest0.set(cur9, ip * NP); }
  function target(i, out) {
    for (var k = 0; k < NP; k++) out[k] = rest0[i * NP + k];
    var b = bits[i], h = heldT[i];
    if (b & B_LEAN) { out[1] += 0.17; out[2] += 0.12; if (clasp[i] && armK[i] > 0) { out[5] = out[6] = 1.2; out[7] = 0.55; } }
    if (b & B_FLAG) { if (h === 1) { out[6] = 2.7; out[8] = 0.1; } else if (h === 2) out[6] = 2.55; else if (h === 3) { out[5] = out[6] = 2.5; out[7] = 0; out[8] = 0.2; } }
    if (b & B_SCARF && h === 3) { out[5] = out[6] = 2.68; out[7] = 0; out[8] = 0.28; }
    if (b & B_LOOK) { out[4] = lookYaw[i]; out[2] -= 0.06; }
    if (b & B_PHONE) { out[6] = 2.3; out[7] = 0.05; }
  }
  // move `list` into (on) or out of (off) a stance once: ms long, each person after delay(i) ms
  function stance(list, bit, on, now, ms, delay) {
    var L = [];
    for (var j = 0; j < list.length; j++) { var i = list[j]; if (!!(bits[i] & bit) !== on) L.push(i); }
    if (!L.length) return false;
    var d = new Float32Array(L.length * NP), del = new Float32Array(L.length), mx = 0;
    for (j = 0; j < L.length; j++) {
      i = L[j]; getP(i, cur9); bits[i] = on ? bits[i] | bit : bits[i] & ~bit; target(i, new9);
      for (var k = 0; k < NP; k++) d[j * NP + k] = cur9[k] - new9[k];
      setP(i, new9); poseRest(i);
      del[j] = delay ? delay(i) : 0; if (del[j] > mx) mx = del[j];
    }
    reacts.push({ kind: 'shift', t0: now, dur: mx + ms + 30, len: ms, idx: L, d: d, del: del });
    return true;
  }
  function withBit(bit) { var l = []; for (var i = 0; i < N; i++) if (bits[i] & bit) l.push(i); return l; }
  function release(bit, now, ms) { return stance(withBit(bit), bit, false, now, ms || 600, null); }

  // ----- reactions -----
  var reacts = [], stamp = 1, mark = new Int32Array(N), cur = new Int32Array(N), prev = new Int32Array(N), nCur = 0, nPrev = 0, pending = false;
  function pick2(kind, opts, low) {
    var list = [], i;
    if (kind === 'wave') { for (i = 0; i < N; i++) if (rk[i]) list.push(i); return list; }
    if (kind === 'clap') {
      var c = typeof opts.at === 'number' ? Math.max(0, Math.min(1, opts.at)) : 0.15 + Math.random() * 0.7, w = opts.w || 0.13;
      for (i = 0; i < N; i++) if (rk[i] && Math.abs(key[i] - c) < w && Math.random() < (low ? 0.5 : 0.8)) list.push(i);
      return list;
    }
    var f = (FRAC[kind] || 0.8) * (low ? 0.6 : 1);
    for (i = 0; i < N; i++) if (rk[i] && Math.random() < f) list.push(i);
    return list;
  }
  // one person's contribution from one reaction at s ms since it started (j: the person's place in r.idx). Arm targets
  // are absolute angles, so people holding a scarf or a flag end up in the same pose as everyone else. Arms are scaled
  // by armK (banner holders and the band keep their hands where they are), hops by hopK and r.hop (reduced motion: 0).
  function add2(r, i, s, j) {
    var u = rA[i], v = rB[i], e, t = s / 1000, dur = r.dur / 1000, b0 = REST_RAISE + rRa0[i], b1 = REST_RAISE + rRa1[i];
    var dy = 0, ln = 0, hd = 0, tl = 0, hy = 0, a0 = 0, a1 = 0, yw = 0, rl = 0;
    switch (r.kind) {
      case 'shift': { // a stance change: the old pose fades into the new one (applied as is: no scaling)
        var w = 1 - sm((s - r.del[j]) / r.len); if (w <= 0) return;
        var q = j * NP, D = r.d;
        aDy[i] += D[q] * w; aLean[i] += D[q + 1] * w; aHead[i] += D[q + 2] * w; aTilt[i] += D[q + 3] * w; aHy[i] += D[q + 4] * w;
        aRa0[i] += D[q + 5] * w; aRa1[i] += D[q + 6] * w; aYaw[i] += D[q + 7] * w; aRoll[i] += D[q + 8] * w;
        return;
      }
      case 'clap': {
        var tt = t - 0.15 * u; e = env(tt, 0.2, 0.3, (r.base || r.dur) / 1000 - 0.25); if (!e) return;
        a0 = (1.3 - b0) * e; a1 = (1.3 - b1) * e;
        yw = (0.62 + 0.16 * Math.sin(6.2832 * 3.6 * tt + 6.2832 * v) - rYaw[i]) * e; ln = 0.04 * e; break;
      }
      case 'ooh': {
        e = env(t - 0.2 * u, 0.35, 0.6, dur - 0.2); if (!e) return;
        ln = 0.18 * e; hd = 0.12 * e;
        if (v < 0.3) { var ea = env(t - 0.2 - 0.2 * u, 0.3, 0.5, dur - 0.45); a0 = (2.9 - b0) * ea; a1 = (2.9 - b1) * ea; yw = (0.5 - rYaw[i]) * ea; rl = -0.1 * ea; }
        break;
      }
      case 'gasp': {
        var tg = t - 0.06 * u; e = tg <= 0 ? 0 : sm(tg / 0.12) * (tg < 0.5 ? 1 : sm((dur - tg) / 0.75)); if (!e) return;
        ln = -0.18 * e; dy = 0.02 * e; hd = -0.08 * e;
        if (v < 0.35) { a0 = (2.35 - b0) * e; a1 = (2.35 - b1) * e; yw = (0.62 - rYaw[i]) * e; rl = -0.1 * e; }
        break;
      }
      case 'cheer': { // r.k0 / r.spread: the cheer ripples out from one place; r.big: bigger hops
        var tc2 = t - 0.15 * u - (r.spread ? Math.abs(key[i] - r.k0) * r.spread : 0); e = env(tc2, 0.25, 0.45, (r.base || r.dur) / 1000 - 0.15); if (!e) return;
        var per = 0.36 + 0.12 * v; dy = (kidF[i] ? 0.27 : 0.2) * (r.big ? 1.2 : 1) * Math.abs(Math.sin(Math.PI * tc2 / per)) * e;
        a0 = (2.75 - b0) * e; a1 = (2.75 - b1) * e; yw = -rYaw[i] * e; rl = 0.3 * e; ln = -0.04 * e; hd = -0.08 * e; break;
      }
      case 'aw': {
        e = env(t - 0.2 * u, 0.5, 0.7, dur - 0.2); if (!e) return;
        ln = 0.1 * e; hd = 0.22 * e; tl = (v < 0.5 ? 0.2 : -0.2) * e; dy = -0.03 * e;
        a0 = (0.2 - b0) * e; a1 = (0.2 - b1) * e; break;
      }
      // ---- COLLECT (spot the fan) block: 'hi' = one fan waves once (right arm up, three side-to-side waves, down) ----
      case 'hi': {
        e = env(t, 0.3, 0.45, dur); if (!e) return;
        var wv = Math.sin(6.2832 * 1.7 * Math.max(0, t - 0.3)) * sm((t - 0.25) / 0.2) * sm((dur - 0.45 - t) / 0.25);
        a1 = (2.75 - b1 + 0.28 * wv) * e; yw = -rYaw[i] * e; dy = 0.05 * e; hd = -0.06 * e; tl = 0.12 * wv * e;
        aRa1[i] += a1; aYaw[i] += yw; aDy[i] += dy; aHead[i] += hd; aTilt[i] += tl; // a fan he tapped always waves, whatever they hold
        return;
      }
      // ---- end COLLECT block ----
      case 'wave': {
        var f = (s / r.dur) * 1.5 - 0.25, dd = (key[i] - f) / 0.15; if (dd <= -1 || dd >= 1) return;
        var up = 0.5 * (1 + Math.cos(Math.PI * dd));
        dy = 0.5 * up; a0 = (2.8 - b0) * up; a1 = (2.8 - b1) * up; yw = -rYaw[i] * up; rl = 0.25 * up; break;
      }
      case 'mwave': { // one Mexican wave, once round the ground (r.dir: +1 left to right, -1 right to left)
        var f2 = (s / r.dur) * 1.4 - 0.2, pos = r.dir > 0 ? key[i] : 1 - key[i], d2 = (pos - f2) / 0.075; if (d2 <= -1 || d2 >= 1) return;
        var up2 = 0.5 * (1 + Math.cos(Math.PI * d2));
        dy = 0.4 * up2; a0 = (2.85 - b0) * up2; a1 = (2.85 - b1) * up2; yw = -rYaw[i] * up2; rl = 0.22 * up2; ln = -0.06 * up2; break;
      }
      case 'card': { // tifo: hold a card up over the head (in step with the cards), then down again
        var tq = s - r.del[j], downAt = 750 + r.up + r.hold;
        e = tq <= 0 ? 0 : sm(tq / r.up); if (s > downAt) e = Math.min(e, 1 - sm((s - downAt - r.del[j] * 0.3) / r.down)); if (e <= 0) return;
        a0 = (1.75 - b0) * e; a1 = (1.75 - b1) * e; yw = (0.45 - rYaw[i]) * e; hd = -0.06 * e; break;
      }
      default: return;
    }
    var ak = armK[i], hk = hopK[i] * (r.hop == null ? 1 : r.hop);
    aDy[i] += dy * hk; aLean[i] += ln; aHead[i] += hd; aTilt[i] += tl; aHy[i] += hy;
    aRa0[i] += a0 * ak; aRa1[i] += a1 * ak; aYaw[i] += yw * ak; aRoll[i] += rl * ak;
  }
  // keep at most 12 reactions; never drop a stance change (that would make someone jump)
  function pushR(r) {
    if (!r.idx || !r.idx.length) return false;
    if (reacts.length >= 12) { for (var k = 0; k < reacts.length; k++) if (reacts[k].kind !== 'shift') { reacts.splice(k, 1); break; } }
    reacts.push(r); return true;
  }

  // ===== the displays (banners, tifo, confetti cannons, phone lights): built for the stadium only =====
  var banners = null, tifo = null, confetti = null, phones = null, tifoOf = null, phoneIdx = [], cannons = [], night = dim <= 0.66;
  function bannerTexts() {
    if (!banners) return [];
    var lines = story.bannerLines(banners.nHome), out = [];
    for (var k = 0; k < banners.specs.length; k++) out.push(k < banners.nHome ? lines[k] || '' : story.rivalLine());
    return out;
  }
  function styleBanners() {
    var p2 = story.palette();
    banners.specs.forEach(function (s, k) {
      var st = s.look;
      if (st === 'away') { s.bg = p2.away.shirt; s.fg = p2.away.trim; s.fg2 = null; s.out = 'rgba(0,0,0,.35)'; s.edge = p2.away.trim; }
      else if (st === 'cream') { s.bg = '#fbf6e9'; s.fg = p2.home.shirt; s.fg2 = p2.home.trim; s.out = 'rgba(0,0,0,.18)'; s.edge = p2.home.shirt; }
      else if (st === 'shirt') { s.bg = p2.home.shirt; s.fg = '#ffffff'; s.fg2 = null; s.out = 'rgba(0,0,0,.35)'; s.edge = p2.home.trim; }
      else { s.bg = p2.home.trim; s.fg = '#ffffff'; s.fg2 = '#ffe066'; s.out = 'rgba(0,0,0,.35)'; s.edge = '#ffffff'; }
    });
  }
  if (live && cast) {
    // banners: between the holders' hands, facing the pitch
    var specs = [];
    function bannerSpec(pr, look) {
      var ha = [handAt(pr[0], 0), handAt(pr[0], 1)], hb = [handAt(pr[1], 0), handAt(pr[1], 1)];
      if (!ha[0] || !hb[0]) return null;
      var pa = { x: (ha[0].x + ha[1].x) / 2, y: (ha[0].y + ha[1].y) / 2, z: (ha[0].z + ha[1].z) / 2 }, pb = { x: (hb[0].x + hb[1].x) / 2, y: (hb[0].y + hb[1].y) / 2, z: (hb[0].z + hb[1].z) / 2 };
      var ry = pts[pr[0]].sRy != null ? pts[pr[0]].sRy : pts[pr[0]].ry, nx = Math.sin(ry), nz = Math.cos(ry), ax = nz, az = -nx;
      var w = Math.abs((pb.x - pa.x) * ax + (pb.z - pa.z) * az) + 0.34, h = Math.max(0.42, Math.min(0.66, w * 0.27));
      return { x: (pa.x + pb.x) / 2 + nx * 0.07, y: Math.max(pa.y, pb.y) + 0.06, z: (pa.z + pb.z) / 2 + nz * 0.07, ax: ax, az: az, nx: nx, nz: nz, w: w, h: h, look: look, text: '' };
    }
    var looks = ['cream', 'shirt', 'trim', 'cream', 'shirt', 'cream', 'trim', 'shirt'];
    cast.holders.forEach(function (pr, k) { var s = bannerSpec(pr, looks[k % looks.length]); if (s) specs.push(s); });
    var nHome = specs.length;
    if (cast.rival) { var sr = bannerSpec(cast.rival, 'away'); if (sr) specs.push(sr); }
    if (specs.length) {
      banners = makeBanners(group, specs); banners.nHome = nHome;
      styleBanners(); banners.retext(bannerTexts());
      if (o.detached) banners.setOpen();
    }
  }
  if (live && !o.detached) {
    // tifo (tier 3+): the lower rows of the back stand, a block clear of the scoreboard, as close to the middle as it gets
    var backRows = (rows.stands[0] || []).slice();
    if (tier >= 3 && backRows.length >= 4) {
      // the top rows (the upper tier at tier 5): clear of the tunnel, the banners and the band in the front rows
      var lower = [backRows[backRows.length - 1]], fy0 = backRows[0].y;
      for (var lr = backRows.length - 2; lr >= 0 && lower.length < 7; lr--) { var ro = backRows[lr]; if (lower[0].y - ro.y > 0.9 || ro.level < 3 || ro.y < fy0 + 2.0) break; lower.unshift(ro); }
      var xmin = 1e9, xmax = -1e9; lower.forEach(function (r) { r.list.forEach(function (i) { xmin = Math.min(xmin, pts[i].x); xmax = Math.max(xmax, pts[i].x); }); });
      var ivs = [[xmin + 0.3, xmax - 0.3]];
      if (board) { var b0x = board.x - board.w / 2 - 1.2, b1x = board.x + board.w / 2 + 1.2; ivs = [[xmin + 0.3, Math.min(xmax - 0.3, b0x)], [Math.max(xmin + 0.3, b1x), xmax - 0.3]].filter(function (v) { return v[1] - v[0] > 4; }); }
      // beside the creature (it hides the middle from his seat), on the side away from the scoreboard
      var tx = board && board.x < 0 ? 7.5 : -7.5, bestIv = null, bestD = 1e9; ivs.forEach(function (v) { var c = Math.max(v[0], Math.min(v[1], tx)), d = Math.abs(c - tx) - (v[1] - v[0]) * 0.05; if (d < bestD) { bestD = d; bestIv = v; } });
      if (bestIv) {
        var hw = Math.min(5.0, (bestIv[1] - bestIv[0]) / 2), cx = Math.max(bestIv[0] + hw, Math.min(bestIv[1] - hw, tx)), x0 = cx - hw, cardList = [], owner = [];
        tifoOf = new Int32Array(N).fill(-1);
        lower.forEach(function (r, lv) {
          var nx = Math.sin(r.ry), nz = Math.cos(r.ry), up = lower[lv + 1] ? lower[lv + 1].y - r.y : lv ? r.y - lower[lv - 1].y : 0.6, hy = Math.max(1, (up - 0.02) / 0.55 / 0.96);
          function addCard(x, z, who) { if (x < x0 - 0.01 || x > cx + hw + 0.01) return; cardList.push({ x: x + nx * 0.34, y: r.y + 0.6, z: z + nz * 0.34, ry: r.ry, hy: hy, c: Math.round((x - x0) / 0.62), r: lv }); owner.push(who); }
          r.list.forEach(function (i) { if (!pts[i].hold && !pts[i].band) addCard(pts[i].x, pts[i].z, i); });
          empties.forEach(function (e) { if (e.stand === r.stand && Math.abs(e.y - r.y) < 0.05) addCard(e.x, e.z, -1); });
        });
        var cols = 0; cardList.forEach(function (cd) { cols = Math.max(cols, cd.c + 1); });
        var tgeo = build(cardGeo, 0);
        tifo = makeTifo(group, cardList, tgeo, mat, cols, lower.length);
        if (tifo) { tifo.cols = cols; tifo.rows = lower.length; owner.forEach(function (who, ci) { if (who >= 0) tifoOf[who] = ci; }); }
      }
    }
    // confetti cannons on the stand fronts
    Object.keys(rows.stands).forEach(function (k) {
      var fr = rows.stands[k][0]; if (!fr || fr.list.length < 6) return;
      [0.15, 0.5, 0.85].forEach(function (f) { var p = pts[fr.list[Math.floor(f * (fr.list.length - 1))]], nx = Math.sin(fr.ry), nz = Math.cos(fr.ry); cannons.push({ x: p.x + nx * 0.9, y: p.y + 0.1, z: p.z + nz * 0.9, nx: nx, nz: nz }); });
    });
    confetti = makeConfetti(group, [300, 550, 850][det], FLOOR_Y);
    // phone lights at dusk and night (after a win)
    if (night) {
      var spots = [], RP = rng(4711);
      for (var ph = 0; ph < N; ph++) {
        var pp = pts[ph]; if (!rk[ph] || pp.job || armK[ph] < 1 || heldT[ph] || RP() > 0.42) continue;
        var bb = ph * 12, kk = base[bb + 5], fx2 = base[bb + 2] / kk, fz2 = base[bb + 10] / kk, sx = base[bb] / kk, sz = base[bb + 8] / kk; // forward and the person's +x (right)
        spots.push({ x: base[bb + 3] + (sx * 0.27 + fx2 * 0.12) * kk, y: base[bb + 7] + 1.12 * kk, z: base[bb + 11] + (sz * 0.27 + fz2 * 0.12) * kk, d: Math.abs(key[ph] - 0.5) * 1800 + RP() * 250 });
        phoneIdx.push(ph);
      }
      phones = makePhones(group, spots);
    }
    // where everyone looks for a replay: the big screen
    if (board) for (var il = 0; il < N; il++) {
      var bi = il * 12, ang = Math.atan2(board.x - base[bi + 3], board.z - base[bi + 11]) - bRy[il];
      while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
      lookYaw[il] = Math.max(-1.15, Math.min(1.15, ang));
    }
  }

  // ===== the director: what a reaction means, and how these supporters answer it =====
  var recent = [], tifoN = 0, waveDir = 1, goodN = 0;
  function centre(lo, hi) { // a place along the stands away from the last few used
    var best = (lo + hi) / 2, bd = -1;
    for (var k = 0; k < 7; k++) { var c = lo + Math.random() * (hi - lo), d = 1; for (var j = 0; j < recent.length; j++) d = Math.min(d, Math.abs(c - recent[j])); if (d > bd) { bd = d; best = c; } }
    recent.push(best); if (recent.length > 3) recent.shift();
    return best;
  }
  function who(fn, frac) { var l = []; for (var i = 0; i < N; i++) if (rk[i] && fn(i) && Math.random() < frac) l.push(i); return l; }
  function R_(kind, idx, now, x) { return pushR(Object.assign({ kind: kind, t0: now, dur: DUR[kind], base: DUR[kind], idx: idx, hop: hopG }, x || {})); }
  function cheerFrom(idx, k0, spread, now, big) { // a cheer that ripples out from k0
    var mx = 0; for (var j = 0; j < idx.length; j++) mx = Math.max(mx, Math.abs(key[idx[j]] - k0));
    if (reducedNow) spread = 0;
    return R_('cheer', idx, now, { k0: k0, spread: spread, big: !!big, dur: DUR.cheer + mx * spread * 1000 });
  }
  function awayClap(now) { var l = who(function (i) { return away[i]; }, 0.85); return l.length ? R_('clap', l, now + 250, { dur: 2200, base: 2200 }) : false; }
  function flagsUp(now, k0) { var l = []; for (var i = 0; i < N; i++) if (rk[i] && heldT[i] && heldT[i] < 4 && !away[i]) l.push(i); return stance(l, B_FLAG, true, now, reducedNow ? 250 : 650, function (i) { return reducedNow ? 0 : 250 + Math.abs(key[i] - k0) * 900; }); }
  function stunt(pic, now) {
    if (!tifo || tifo.busy()) return false;
    var p2 = story.palette(), cols3 = [p2.home.shirt, '#ffffff', p2.home.trim];
    var sh = tifo.show(pic, cols3, now, reducedNow), l = [], del = [];
    for (var i = 0; i < N; i++) if (tifoOf[i] >= 0 && rk[i]) { l.push(i); del.push(sh.delay[tifoOf[i]]); }
    R_('card', l, now, { del: Float32Array.from(del), up: sh.up, hold: sh.hold, down: sh.down, dur: sh.dur, hop: 0 });
    return true;
  }
  function picture(kind) { if (tifo && tifo.rows < 5 && (kind === 'num' || kind === 'goal')) kind = 'cube'; return tifo ? tifoPicture(kind === 'num' ? 'word' : kind, tifo.cols, tifo.rows, kind === 'num' ? story.jersey() : kind === 'goal' ? 'GOAL' : '') : null; }
  var hopG = 1, reducedNow = false;
  function direct(kind, opts, now, low) {
    var m = story.moment(kind, opts), any = false;
    reducedNow = story.reduced(); hopG = reducedNow ? 0 : 1;
    var home = function (i) { return !away[i]; }, all = function () { return true; };
    if (banners && !banners.isOpen() && banners.unfurl(now, reducedNow)) any = true; // the banners unroll at the first reaction of a match
    if (kind !== 'gasp' && withBit(B_LEAN).length) any = release(B_LEAN, now, m === 'lost' ? 1100 : 380) || any; // the challenge is over
    if (m !== 'kickoff' && withBit(B_SCARF).length) any = release(B_SCARF, now, 800) || any;
    var lf = low ? 0.6 : 1;
    switch (m) {
      case 'move': { var c = centre(0.06, 0.94); any = R_('clap', who(function (i) { return Math.abs(key[i] - c) < 0.12; }, 0.8 * lf), now) || any; break; }
      case 'challenge': { // a gasp, then most of the ground leans in and stays leaning in (still) until it is decided
        any = R_('gasp', who(all, 0.85 * lf), now) || any;
        any = stance(who(all, 0.8), B_LEAN, true, now, reducedNow ? 250 : 700, function () { return reducedNow ? 0 : 350 + Math.random() * 250; }) || any;
        break;
      }
      case 'lost': { // a kind sigh (never a boo), then an encouraging clap from two sections
        any = R_('aw', who(home, 0.75 * lf), now) || any;
        var c1 = centre(0.1, 0.9), c2 = centre(0.1, 0.9);
        any = R_('clap', who(function (i) { return Math.abs(key[i] - c1) < 0.15 || Math.abs(key[i] - c2) < 0.15 || away[i]; }, 0.8 * lf), now + 1600, { dur: 2000, base: 2000 }) || any;
        break;
      }
      case 'kickoff': { // the teams come out: a cheer from the home end, scarves up (and held), flags up
        any = cheerFrom(who(home, 0.85 * lf), 0.3, 1.1, now, false) || any;
        any = R_('cheer', who(function (i) { return away[i]; }, 0.85 * lf), now + 150) || any;
        var sl = []; for (var i = 0; i < N; i++) if (rk[i] && heldT[i] === 3) sl.push(i);
        any = stance(sl, B_SCARF, true, now, reducedNow ? 250 : 800, function (i) { return reducedNow ? 0 : 900 + Math.abs(key[i] - 0.3) * 1100; }) || any;
        any = flagsUp(now + 400, 0.3) || any;
        break;
      }
      case 'goal': { // a Goal is set: one or two sections cheer, the flags go up and stay up for the shake
        var cg = centre(0.1, 0.9);
        any = cheerFrom(who(function (i) { return home(i) && Math.abs(key[i] - cg) < 0.2; }, 0.85 * lf), cg, 1.6, now, false) || any;
        any = flagsUp(now, cg) || any;
        break;
      }
      case 'shake': case 'brilliant': { // a great shake: the whole home end, rippling from a new place; something extra each time
        goodN++;
        var k0 = centre(0.15, 0.85);
        any = cheerFrom(who(home, 0.85 * lf), k0, 1.2, now, m === 'brilliant') || any;
        any = awayClap(now) || any; any = flagsUp(now, k0) || any;
        if (m === 'brilliant' && !low && !reducedNow) { any = R_('mwave', who(all, 1), now + 1300, { dir: waveDir, hop: 1 }) || any; waveDir = -waveDir; }
        if (tifo && (m === 'brilliant' || goodN % 2 === 0)) any = stunt(picture(tifoN++ % 2 ? 'cube' : 'num'), now + 500) || any;
        break;
      }
      case 'win': case 'trophy': { // the big one: everyone, a wave once round, the card stunt, confetti, phones at night
        any = cheerFrom(who(home, 0.9), 0.5, 0.8, now, true) || any;
        any = awayClap(now) || any; any = flagsUp(now, 0.5) || any;
        if (!low && !reducedNow) { any = R_('mwave', who(all, 1), now + 1500, { dir: waveDir, hop: 1 }) || any; waveDir = -waveDir; }
        if (tifo) any = stunt(picture(m === 'win' ? 'goal' : 'star'), now + 700) || any;
        if (confetti && !reducedNow && cannons.length) any = confetti.burst(cannons, [story.palette().home.shirt, story.palette().home.trim, '#ffffff', '#ffd43b'], now + 300, Math.round((confetti.points.geometry.attributes.aAlpha.count) * (story.calm() ? 0.35 : 1))) || any;
        if (phones && !phones.on()) {
          any = stance(phoneIdx, B_PHONE, true, now, reducedNow ? 250 : 600, function (i) { return reducedNow ? 0 : 1400 + Math.abs(key[i] - 0.5) * 1800; }) || any;
          phones.place(function (k) { var h = handAt(phoneIdx[k], 1); return h ? { x: h.x, y: h.y + 0.06, z: h.z } : null; }); // the raised hands (rest pose, already updated)
          phones.light(now + 1400, reducedNow);
        }
        break;
      }
      case 'replay': { // (heads already turned to the screen) the section nearest the screen cheers the replayed Goal
        var cb = board ? Math.max(0.3, Math.min(0.7, 0.5 + board.x / 60)) : 0.6;
        any = cheerFrom(who(function (i) { return home(i) && Math.abs(key[i] - cb) < 0.22; }, 0.85 * lf), cb, 1.5, now, false) || any;
        break;
      }
      default: return plain(kind, opts, now, low) || any;
    }
    return any;
  }
  function plain(kind, opts, now, low) { // the first crowd's reactions, as they were
    var list = pick2(kind, opts, low); if (!list.length) return false;
    pushR({ kind: kind, t0: now, dur: DUR[kind], idx: list });
    if (kind === 'cheer' && opts.wave && !low) pushR({ kind: 'wave', t0: now + 250, dur: DUR.wave, idx: pick2('wave', opts, low) });
    return true;
  }

  // ===== the watcher: a few times a second while frames are drawn, looks at the game (no work at rest otherwise) =====
  var w0 = live && !o.detached ? story.watch() : null, wLast = -1e9, wG = w0 ? w0.g : null, wShake = w0 ? w0.shake : 0, wRep = false, wSig = live ? story.sig() : '';
  function watcher(now) {
    if (Math.abs(now - wLast) < 250) return;
    wLast = now;
    var w = story.watch(), sg = story.sig();
    if (sg !== wSig) { wSig = sg; repaint(); }
    if (w.g !== wG) { wG = w.g; wShake = w.shake; newMatch(now); }
    else if (w.shake !== wShake) { wShake = w.shake; release(B_FLAG, now, 700); release(B_LEAN, now, 500); } // a new shake: flags down, done leaning
    if (w.replay !== wRep) {
      wRep = w.replay;
      if (wRep && board) stance(who(function (i) { return !pts[i].job; }, 0.85), B_LOOK, true, now, reducedNow ? 250 : 550, function (i) { return reducedNow ? 0 : Math.min(900, Math.hypot(base[i * 12 + 3] - board.x, base[i * 12 + 11] - board.z) * 28); });
      else release(B_LOOK, now, 650);
    }
  }
  function newMatch(now) { // a new match on the same venue: everyone settles back into the plain still tableau
    for (var b = 1; b <= 16; b *= 2) release(b, now, 500);
    if (banners) banners.furl();
    if (phones) phones.off();
    if (tifo) tifo.stop();
    if (confetti) confetti.stop();
  }

  var api = {
    pts: pts, N: N, meshes: meshes, group: group,
    attached: function () { var p = group; while (p.parent) p = p.parent; return !!p.isScene; },
    busy: function () { return reacts.length > 0 || pending || !!(tifo && tifo.busy()) || !!(confetti && confetti.busy()); },
    // draw calls and triangles this crowd adds (for the notes and for checks)
    // tris: triangles sent (vertex work); drawn: triangles that are not collapsed (raster work)
    stats: function () {
      var t = 0, dr = 0;
      meshes.forEach(function (m) {
        var g = m.geometry, ix = g.index.array, cvA = g.attributes.cv.array, perVar = {}, k;
        t += ix.length / 3 * m.count;
        for (k = 0; k < ix.length; k += 3) { var vr = cvA[ix[k] * 2 + 1]; perVar[vr] = (perVar[vr] || 0) + 1; }
        var meta = g.attributes.iMeta.array;
        for (k = 0; k < m.count; k++) dr += (perVar[0] || 0) + (meta[k * 3 + 2] ? perVar[meta[k * 3 + 2]] || 0 : 0);
      });
      var shows = { banners: banners ? banners.specs.length : 0, tifoCards: tifo ? tifo.cards.length : 0, confetti: !!confetti, phones: phoneIdx.length, emptySeats: empties.length,
        staff: pts.filter(function (p) { return p.job; }).map(function (p) { return p.job; }), band: pts.filter(function (p) { return p.band; }).length, standing: pts.filter(function (p) { return p.stand && !p.job; }).length, away: away.reduce(function (s2, v) { return s2 + v; }, 0) };
      var showDraws = (banners ? 1 : 0) + (tifo && tifo.mesh.visible ? 1 : 0) + (confetti && confetti.points.visible ? 1 : 0) + (phones && phones.points.visible ? 1 : 0);
      return { people: N, draws: meshes.length, showDraws: showDraws, tris: Math.round(t), drawn: dr, parts: parts.map(function (P) { return P.key + ':' + P.mesh.count; }), shows: shows };
    },
    // returns true if a reaction started (or the same one is already under way)
    react: function (kind, opts) {
      if (!N) return false;
      kind = kind === 'aww' ? 'aw' : String(kind || '');
      if (!DUR[kind] || kind === 'mwave') return false;
      opts = opts || {};
      var now = performance.now(), low = quality() < 1;
      for (var k = 0; k < reacts.length; k++) if (reacts[k].kind === kind && now - reacts[k].t0 < 400 && reacts[k].t0 <= now) return true; // no stacking up
      if (live && !o.detached && kind !== 'wave' && kind !== 'hi') return direct(kind, opts, now, low);
      return plain(kind, opts, now, low);
    },
    // true while something moved this frame (the table keeps rendering); false once everyone is still
    step: function (now) {
      var busy = false;
      if (w0) watcher(now);
      if (banners && banners.step(now)) busy = true;
      if (tifo && tifo.step(now)) busy = true;
      if (confetti && confetti.step(now)) busy = true;
      if (phones && phones.step(now)) busy = true;
      if (!reacts.length) { if (pending) { pending = false; restoreAll(); return true; } return busy; }
      stamp++; nCur = 0;
      var nl = 0, r, j, i, s;
      for (var k = 0; k < reacts.length; k++) {
        r = reacts[k]; s = now - r.t0;
        if (s >= r.dur) continue;
        reacts[nl++] = r; // keep the live ones, in place (no garbage per frame)
        if (s < 0) { if (r.kind !== 'shift') continue; s = 0; } // a stance change holds the old pose until it starts
        for (j = 0; j < r.idx.length; j++) {
          i = r.idx[j];
          if (mark[i] !== stamp) { mark[i] = stamp; cur[nCur++] = i; aDy[i] = aLean[i] = aHead[i] = aTilt[i] = aHy[i] = aRa0[i] = aRa1[i] = aRoll[i] = aYaw[i] = 0; }
          add2(r, i, s, j);
        }
      }
      reacts.length = nl;
      for (j = 0; j < nCur; j++) { i = cur[j]; pose(i, true); }
      for (j = 0; j < nPrev; j++) { i = prev[j]; if (mark[i] !== stamp) restorePerson(i); }
      var sw = prev; prev = cur; cur = sw; nPrev = nCur;
      if (!reacts.length) { restoreAll(); nPrev = 0; pending = false; return true; } // exactly the rest pose: completely still
      uploadAll(); pending = true;
      return true;
    },
    reset: function () { reacts = []; nPrev = 0; pending = false; restoreAll(); if (tifo) tifo.stop(); if (confetti) confetti.stop(); if (current === api) current = null; },
    // for checks: the rest pose arrays and the live ones are identical (the crowd is perfectly still)
    stillCheck: function () { var d = 0; dyn.forEach(function (m, k) { var a = m.instanceMatrix.array, r2 = rest[k]; for (var q = 0; q < a.length; q++) d = Math.max(d, Math.abs(a[q] - r2[q])); }); return { maxDiff: d, reacts: reacts.length, pending: pending, busy: api.busy() }; },
    // for checks: which stances are held now ({ lean, flag, scarf, look, phone } counts) and the displays
    stances: function () { var c = { lean: 0, flag: 0, scarf: 0, look: 0, phone: 0 }; for (var i = 0; i < N; i++) { var b = bits[i]; if (b & B_LEAN) c.lean++; if (b & B_FLAG) c.flag++; if (b & B_SCARF) c.scarf++; if (b & B_LOOK) c.look++; if (b & B_PHONE) c.phone++; } c.bannersOpen = banners ? banners.isOpen() : null; c.phonesOn = phones ? phones.on() : null; return c; },
    // for checks and the notes: the displays (null where this venue has none)
    shows: function () { return { banners: banners, tifo: tifo, confetti: confetti, phones: phones }; },
    // ---- COLLECT (spot the fan) block: picking and the one-person wave (additive; nothing above uses it) ----
    // chars(): [{ i, kind }] the character fans of this crowd (the same ones every time this venue is built at this tier)
    chars: function () { var out = []; for (var i = 0; i < N; i++) if (pts[i].charKind) out.push({ i: i, kind: pts[i].charKind }); return out; },
    // pick(ray): the nearest fan whose body sphere the world-space THREE.Ray goes through, or null.
    // { i, kind (null for an ordinary fan), t (distance along the ray), r (sphere radius), center (world) }.
    // Every fan is tested (about 1,200 sphere tests, well under a millisecond), so a character hidden behind
    // the fan in front is not picked through them.
    pick: function (ray) {
      if (!N || !ray) return null;
      group.updateWorldMatrix(true, false);
      var mw = group.matrixWorld, e = mw.elements, ws = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
      var c = new THREE.Vector3(), d = new THREE.Vector3(), best = null, bt = Infinity;
      for (var i = 0; i < N; i++) {
        var b = i * 12, k = base[b + 5];
        c.set(base[b + 3], base[b + 7] + 0.55 * k, base[b + 11]).applyMatrix4(mw);
        var r = 0.45 * k * ws; d.subVectors(c, ray.origin);
        var along = d.dot(ray.direction); if (along < 0) continue;
        var q = d.lengthSq() - along * along; if (q > r * r) continue;
        var t = along - Math.sqrt(r * r - q);
        if (t < bt) { bt = t; best = { i: i, kind: pts[i].charKind || null, t: t, r: r, center: c.clone() }; }
      }
      return best;
    },
    // where(i): { center (world), r } of fan i's body sphere (the one pick() uses), or null
    where: function (i) {
      if (!(i >= 0 && i < N)) return null;
      group.updateWorldMatrix(true, false);
      var e = group.matrixWorld.elements, ws = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10])), b = i * 12, k = base[b + 5];
      return { center: new THREE.Vector3(base[b + 3], base[b + 7] + 0.55 * k, base[b + 11]).applyMatrix4(group.matrixWorld), r: 0.45 * k * ws };
    },
    // waveOne(i): that one fan waves once (1.9 s) and is exactly back at rest afterwards
    waveOne: function (i) {
      if (!(i >= 0 && i < N)) return false;
      var now = performance.now();
      for (var k = 0; k < reacts.length; k++) if (reacts[k].kind === 'hi' && reacts[k].idx[0] === i && now - reacts[k].t0 < reacts[k].dur) return true;
      pushR({ kind: 'hi', t0: now, dur: DUR.hi, idx: [i] });
      return true;
    }
    // ---- end COLLECT block ----
  };
  if (!o.detached) current = api; // o.detached: a crowd T3.crowd never drives (the title screen's own stadium)
  install();
  return api;
}
