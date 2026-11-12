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
import * as THREE from 'three';

// ----- figure layout (person-local units, y up, facing +z, origin on the step under the seat) -----
var SEAT_Y = 0.17, HIP_Y = 0.25, NECK = 0.34, SH_X = 0.245, SH_Y = 0.29, HAND = 0.3, REST_RAISE = 0.38, REST_ROLL = 0.1;
export var HEAD_TOP = 0.36; // top of the head above the neck pivot
var DUR = { clap: 1500, ooh: 1800, gasp: 1300, cheer: 2400, aw: 2000, wave: 1700 };
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
  } }
};

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

var atlasTex = null;
function getAtlas() {
  if (atlasTex) return atlasTex;
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
  var data = new Uint8Array(W * H * 4), im = {};
  'bwkc'.split('').forEach(function (l) { im[l] = cx[l].getImageData(0, 0, W, H).data; });
  for (var y = 0; y < H; y++) { // flip rows: texture v goes up like the faces
    var src = (H - 1 - y) * W * 4, dst = y * W * 4;
    for (var x = 0; x < W; x++, src += 4, dst += 4) { data[dst] = im.b[src + 3]; data[dst + 1] = im.w[src + 3]; data[dst + 2] = im.k[src + 3]; data[dst + 3] = im.c[src + 3]; }
  }
  var t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
  atlasTex = t;
  return t;
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
}
// style 'fans' (stadium, night) or 'beach'
function dressPerson(p, R, o, beach) {
  var T = o.teams[p.team ? 1 : 0], L = p.L = {};
  var kid = R() < (beach ? 0.22 : 0.17), elder = !kid && R() < 0.1;
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
// for headless checks and debugging: the crowd T3.crowd drives right now (or null)
export function currentCrowd() { return current; }

// pts: [{ x, y, z, ry (facing the pitch), seatRy (optional, the seat's facing), key (0..1 along the stands), team (0 | 1) }]
// o: { quality(), style ('fans' | 'beach' | 'monsters'), teams ([{ shirt, alt, trim, seat }, ...]), seatCol,
//      seats (true), dim (1), seed, redress (optional, for checks: (p, i, asCharacter) after dressing) }
// Returns { pts, N, meshes, react(kind, opts), step(now), reset(), busy(), stats() }.
export function makeBlockCrowd(group, pts, o) {
  o = o || {};
  var quality = o.quality || function () { return 2; }, q0 = quality(), det = q0 >= 2 ? 2 : q0 >= 1 ? 1 : 0, dim = o.dim == null ? 1 : o.dim, style = o.style || 'fans';
  o.teams = o.teams || [{ shirt: '#e03131', alt: '#c92a2a', trim: '#ffffff', seat: '#c73a3a' }, { shirt: '#1c7ed6', alt: '#1864ab', trim: '#ffffff', seat: '#2f66c4' }];
  if (q0 < 1) pts = pts.filter(function (p, i) { return i % 3 !== 2; }); // low tier: a third fewer people
  else if (q0 < 2) pts = pts.filter(function (p, i) { return i % 6 !== 5; }); // medium (tablets start here): a sixth fewer, a few empty seats
  var N = pts.length, R = rng(o.seed || 4242), mat = crowdMaterial(dim);
  pts.forEach(function (p) { if (style === 'monsters') dressMonster(p, R, o); else dressPerson(p, R, o, style === 'beach'); });
  if (o.redress) pts.forEach(function (p, i) { o.redress(p, i, function (kind) { character(p.L, p, R, o.teams[p.team ? 1 : 0], kind); }); }); // for checks: dress someone up

  // ----- what each person wears: one entry per instance -----
  var ents = [], count = {}, headFn = headGeo(style === 'monsters');
  function add(i, key, fn, code, a, b, c, c0, c1) {
    ents.push({ i: i, key: key, fn: fn, code: code, a: a, b: b, c: c, c0: c0 == null || c0 === -1 ? -1 : CI[c0], c1: c1 == null || c1 === -1 ? -1 : CI[c1] });
    count[key] = (count[key] || 0) + 1;
  }
  pts.forEach(function (p, i) {
    var L = p.L;
    if (o.seats !== false) add(i, 'seat', seatGeo, -1, L.seat, L.seat, L.seat);
    add(i, 'legs', legsGeo, 0, L.pants, L.shins, L.shoes);
    var tp = L.print && L.print !== 'none' ? L.print : -1;
    add(i, 'torso', torsoGeo, 1, L.shirt, L.pc || '#ffffff', L.pantsC, tp, tp !== -1 && BACKS[tp] ? tp : -1);
    if (L.cape) add(i, 'cape', capeGeo, 1, L.cape, L.cape, L.cape);
    add(i, 'head', headFn, 2, L.skin, L.hair, L.paint, L.face);
    if (L.gear) add(i, 'g:' + L.gear.t, GEAR[L.gear.t], 2, L.gear.a, L.gear.b, L.gear.c, L.gear.cell);
    var fore = L.bare ? L.skin : L.shirt;
    add(i, 'arms', armGeo, 3, L.shirt, fore, L.hands); add(i, 'arms', armGeo, 4, L.shirt, fore, L.hands);
    if (L.held) add(i, 'h:' + L.held.t, HELD[L.held.t].fn, HELD[L.held.t].code, L.held.a, L.held.b, L.held.b, L.held.cell, L.held.cell);
  });
  // rare parts share a mesh: held things and capes in one, head gear worn by fewer than 2% in another. A draw
  // call each would cost more than the few vertices that collapse (each instance shows only its own variant)
  function rare(key) { return key === 'cape' || key.charAt(1) === ':' && (key.charAt(0) === 'h' || count[key] < Math.max(4, 0.02 * N)); }
  var parts = [], partIx = {}, mixFns = { mixH: [], mixG: [] }, mixVar = {};
  var attStart = new Int32Array(N + 1), attPart = [], attSlot = [], attCode = [], attPerson = []; // codes: 0 legs, 1 torso, 2 head, 3/4 arms, 5 right-hand upright, 6 scarf
  ents.forEach(function (e) {
    var key = e.key, vr = 0;
    if (rare(key)) { var mk = key.charAt(0) === 'g' ? 'mixG' : 'mixH'; if (mixVar[key] == null) { mixFns[mk].push(e.fn); mixVar[key] = mixFns[mk].length; } vr = mixVar[key]; key = mk; }
    if (partIx[key] == null) { partIx[key] = parts.length; parts.push({ key: key, fn: e.fn, list: [] }); }
    var k = partIx[key], P = parts[k];
    P.list.push(e.a, e.b, e.c, e.c0, e.c1, vr);
    if (e.code >= 0) { attPerson.push(e.i); attPart.push(k); attSlot.push(P.list.length / 6 - 1); attCode.push(e.code); }
  });
  // attachments come in person order: attStart[i] .. attStart[i + 1] are person i's
  for (var i1 = 0, j1 = 0; i1 <= N; i1++) { while (j1 < attPerson.length && attPerson[j1] < i1) j1++; attStart[i1] = j1; }

  // ----- one InstancedMesh per part type -----
  var meshes = [], dyn = [], seatMesh = null, tc = new THREE.Color();
  parts.forEach(function (P) {
    var n = P.list.length / 6, geo = mixFns[P.key] ? buildMix(mixFns[P.key], det) : build(P.fn, det), A = new Float32Array(n * 3), B = new Float32Array(n * 3), Cc = new Float32Array(n * 3), Me = new Float32Array(n * 3);
    for (var j = 0; j < n; j++) {
      var L6 = j * 6;
      tc.set(P.list[L6]); A[j * 3] = tc.r; A[j * 3 + 1] = tc.g; A[j * 3 + 2] = tc.b;
      tc.set(P.list[L6 + 1]); B[j * 3] = tc.r; B[j * 3 + 1] = tc.g; B[j * 3 + 2] = tc.b;
      tc.set(P.list[L6 + 2]); Cc[j * 3] = tc.r; Cc[j * 3 + 1] = tc.g; Cc[j * 3 + 2] = tc.b;
      Me[j * 3] = P.list[L6 + 3]; Me[j * 3 + 1] = P.list[L6 + 4]; Me[j * 3 + 2] = P.list[L6 + 5];
    }
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 3)); geo.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 3));
    geo.setAttribute('iC', new THREE.InstancedBufferAttribute(Cc, 3)); geo.setAttribute('iMeta', new THREE.InstancedBufferAttribute(Me, 3));
    var m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.name = 'crowd:' + P.key;
    group.add(m); meshes.push(m); P.mesh = m;
    if (P.key === 'seat') seatMesh = m; else dyn.push(m);
  });
  var partArr = parts.map(function (P) { return P.mesh.instanceMatrix.array; });

  // ----- base matrix per person: T(x, y, z) * Ry(ry) * scale, and a fixed (never moving) rest pose -----
  var base = new Float32Array(12 * N), key = new Float32Array(N), rA = new Float32Array(N), rB = new Float32Array(N), hs = new Float32Array(N), kidF = new Uint8Array(N);
  var rRa0 = new Float32Array(N), rRa1 = new Float32Array(N), rYaw = new Float32Array(N), rHd = new Float32Array(N), rTilt = new Float32Array(N), rHy = new Float32Array(N);
  var S = new Float64Array(12);
  pts.forEach(function (p, i) {
    var k = p.sc || 1, ry = (p.ry || 0) + (R() - 0.5) * 0.3, c = Math.cos(ry), s = Math.sin(ry), b = i * 12, y = p.y + SEAT_Y * (1 - k);
    base[b] = c * k; base[b + 1] = 0; base[b + 2] = s * k; base[b + 3] = p.x;
    base[b + 4] = 0; base[b + 5] = k; base[b + 6] = 0; base[b + 7] = y;
    base[b + 8] = -s * k; base[b + 9] = 0; base[b + 10] = c * k; base[b + 11] = p.z;
    key[i] = p.key || 0; rA[i] = R(); rB[i] = R(); hs[i] = p.hs || 1; kidF[i] = p.sc < 0.85 ? 1 : 0;
    rHd[i] = (R() - 0.5) * 0.14; rTilt[i] = (R() - 0.5) * 0.16; rHy[i] = (R() - 0.5) * 0.4;
    var held = p.L.held && p.L.held.t, r = R();
    if (held === 'scarf') { rRa0[i] = rRa1[i] = 0.5; rYaw[i] = 0.25; }
    else if (held) { rRa0[i] = (R() - 0.5) * 0.12; rRa1[i] = 0.55; }
    else if (r < 0.18) { rRa0[i] = rRa1[i] = 0.22; rYaw[i] = 0.18; } // hands together on the lap
    else { rRa0[i] = (R() - 0.5) * 0.16; rRa1[i] = (R() - 0.5) * 0.16; }
    if (seatMesh) { // seats: not scaled, never move
      var ry0 = p.seatRy != null ? p.seatRy : (p.ry || 0), c0 = Math.cos(ry0), s0 = Math.sin(ry0);
      S[0] = c0; S[1] = 0; S[2] = s0; S[3] = p.x; S[4] = 0; S[5] = 1; S[6] = 0; S[7] = p.y; S[8] = -s0; S[9] = 0; S[10] = c0; S[11] = p.z;
      put(seatMesh.instanceMatrix.array, i, S);
    }
  });

  // pose accumulators (added on top of the rest pose)
  var aDy = new Float32Array(N), aLean = new Float32Array(N), aHead = new Float32Array(N), aTilt = new Float32Array(N);
  var aRa0 = new Float32Array(N), aRa1 = new Float32Array(N), aRoll = new Float32Array(N), aYaw = new Float32Array(N);
  var Pm = new Float64Array(12), Tm = new Float64Array(12), J = new Float64Array(12), Hm = new Float64Array(12), A0 = new Float64Array(12), A1 = new Float64Array(12), M = new Float64Array(12);
  function pose(i, dy, lean, hd, tilt, ra0, ra1, roll, yaw) {
    var b = i * 12, k, j;
    for (k = 0; k < 12; k++) Pm[k] = base[b + k];
    Pm[7] += dy;
    mul(Pm, joint(0, HIP_Y, 0, 0, 0, lean, 1, J), Tm);
    mul(Tm, joint(0, NECK, 0, rHy[i], rTilt[i] + tilt, rHd[i] + hd, hs[i], J), Hm);
    // side 0 is local -x, side 1 is +x. roll is "outward", weighted by cos(raise) so raised arms make a V;
    // yaw is "inward" (toward the other hand: clapping, hands to the face)
    var r0 = REST_RAISE + rRa0[i] + ra0, r1 = REST_RAISE + rRa1[i] + ra1, ro = REST_ROLL + roll, yw = rYaw[i] + yaw;
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
  for (var i0 = 0; i0 < N; i0++) pose(i0, 0, 0, 0, 0, 0, 0, 0, 0);
  var rest = dyn.map(function (m) { return m.instanceMatrix.array.slice(); }), restOf = parts.map(function (P) { return P.mesh === seatMesh ? null : rest[dyn.indexOf(P.mesh)]; });
  meshes.forEach(function (m) { m.instanceMatrix.needsUpdate = true; });
  function uploadAll() { for (var k = 0; k < dyn.length; k++) dyn[k].instanceMatrix.needsUpdate = true; }
  function restoreAll() { dyn.forEach(function (m, k) { m.instanceMatrix.array.set(rest[k]); m.instanceMatrix.needsUpdate = true; }); }
  function restorePerson(i) {
    for (var j = attStart[i]; j < attStart[i + 1]; j++) { var a = partArr[attPart[j]], r = restOf[attPart[j]], o2 = attSlot[j] * 16; for (var q = 0; q < 16; q++) a[o2 + q] = r[o2 + q]; }
  }

  // ----- reactions -----
  var reacts = [], stamp = 1, mark = new Int32Array(N), cur = new Int32Array(N), prev = new Int32Array(N), nCur = 0, nPrev = 0, pending = false;
  function pick2(kind, opts, low) {
    var list = [], i;
    if (kind === 'wave') { for (i = 0; i < N; i++) list.push(i); return list; }
    if (kind === 'clap') {
      var c = typeof opts.at === 'number' ? Math.max(0, Math.min(1, opts.at)) : 0.15 + Math.random() * 0.7, w = 0.13;
      for (i = 0; i < N; i++) if (Math.abs(key[i] - c) < w && Math.random() < (low ? 0.5 : 0.8)) list.push(i);
      return list;
    }
    var f = (FRAC[kind] || 0.8) * (low ? 0.6 : 1);
    for (i = 0; i < N; i++) if (Math.random() < f) list.push(i);
    return list;
  }
  // one person's contribution from one reaction at s ms since it started. Arm targets are absolute angles,
  // so people holding a scarf or a flag end up in the same pose as everyone else.
  function add2(r, i, s) {
    var u = rA[i], v = rB[i], e, t = s / 1000, dur = r.dur / 1000, b0 = REST_RAISE + rRa0[i], b1 = REST_RAISE + rRa1[i];
    switch (r.kind) {
      case 'clap': {
        var tt = t - 0.15 * u; e = env(tt, 0.2, 0.3, dur - 0.25); if (!e) return;
        aRa0[i] += (1.3 - b0) * e; aRa1[i] += (1.3 - b1) * e;
        aYaw[i] += (0.62 + 0.16 * Math.sin(6.2832 * 3.6 * tt + 6.2832 * v) - rYaw[i]) * e; aLean[i] += 0.04 * e; return;
      }
      case 'ooh': {
        e = env(t - 0.2 * u, 0.35, 0.6, dur - 0.2); if (!e) return;
        aLean[i] += 0.18 * e; aHead[i] += 0.12 * e;
        if (v < 0.3) { var ea = env(t - 0.2 - 0.2 * u, 0.3, 0.5, dur - 0.45); aRa0[i] += (2.9 - b0) * ea; aRa1[i] += (2.9 - b1) * ea; aYaw[i] += (0.5 - rYaw[i]) * ea; aRoll[i] -= 0.1 * ea; }
        return;
      }
      case 'gasp': {
        var tg = t - 0.06 * u; e = tg <= 0 ? 0 : sm(tg / 0.12) * (tg < 0.5 ? 1 : sm((dur - tg) / 0.75)); if (!e) return;
        aLean[i] -= 0.18 * e; aDy[i] += 0.02 * e; aHead[i] -= 0.08 * e;
        if (v < 0.35) { aRa0[i] += (2.35 - b0) * e; aRa1[i] += (2.35 - b1) * e; aYaw[i] += (0.62 - rYaw[i]) * e; aRoll[i] -= 0.1 * e; }
        return;
      }
      case 'cheer': {
        var tc2 = t - 0.15 * u; e = env(tc2, 0.25, 0.45, dur - 0.15); if (!e) return;
        var per = 0.36 + 0.12 * v; aDy[i] += (kidF[i] ? 0.27 : 0.2) * Math.abs(Math.sin(Math.PI * tc2 / per)) * e;
        aRa0[i] += (2.75 - b0) * e; aRa1[i] += (2.75 - b1) * e; aYaw[i] -= rYaw[i] * e; aRoll[i] += 0.3 * e; aLean[i] -= 0.04 * e; aHead[i] -= 0.08 * e; return;
      }
      case 'aw': {
        e = env(t - 0.2 * u, 0.5, 0.7, dur - 0.2); if (!e) return;
        aLean[i] += 0.1 * e; aHead[i] += 0.22 * e; aTilt[i] += (v < 0.5 ? 0.2 : -0.2) * e; aDy[i] -= 0.03 * e;
        aRa0[i] += (0.2 - b0) * e; aRa1[i] += (0.2 - b1) * e; return;
      }
      case 'wave': {
        var f = (s / r.dur) * 1.5 - 0.25, dd = (key[i] - f) / 0.15; if (dd <= -1 || dd >= 1) return;
        var up = 0.5 * (1 + Math.cos(Math.PI * dd));
        aDy[i] += 0.5 * up; aRa0[i] += (2.8 - b0) * up; aRa1[i] += (2.8 - b1) * up; aYaw[i] -= rYaw[i] * up; aRoll[i] += 0.25 * up; return;
      }
    }
  }
  var api = {
    pts: pts, N: N, meshes: meshes, group: group,
    attached: function () { var p = group; while (p.parent) p = p.parent; return !!p.isScene; },
    busy: function () { return reacts.length > 0 || pending; },
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
      return { people: N, draws: meshes.length, tris: Math.round(t), drawn: dr, parts: parts.map(function (P) { return P.key + ':' + P.mesh.count; }) };
    },
    // returns true if a reaction started (or the same one is already under way)
    react: function (kind, opts) {
      if (!N) return false;
      kind = kind === 'aww' ? 'aw' : String(kind || '');
      if (!DUR[kind]) return false;
      opts = opts || {};
      var now = performance.now(), low = quality() < 1;
      for (var k = 0; k < reacts.length; k++) if (reacts[k].kind === kind && now - reacts[k].t0 < 400) return true; // no stacking up
      var list = pick2(kind, opts, low); if (!list.length) return false;
      if (reacts.length >= 4) reacts.shift();
      reacts.push({ kind: kind, t0: now, dur: DUR[kind], idx: list });
      if (kind === 'cheer' && opts.wave && !low) reacts.push({ kind: 'wave', t0: now + 250, dur: DUR.wave, idx: pick2('wave', opts, low) });
      return true;
    },
    // true while something moved this frame (the table keeps rendering); false once everyone is still
    step: function (now) {
      if (!reacts.length) { if (pending) { pending = false; restoreAll(); return true; } return false; }
      stamp++; nCur = 0;
      var nl = 0, r, j, i, s;
      for (var k = 0; k < reacts.length; k++) {
        r = reacts[k]; s = now - r.t0;
        if (s >= r.dur) continue;
        reacts[nl++] = r; // keep the live ones, in place (no garbage per frame)
        if (s < 0) continue;
        for (j = 0; j < r.idx.length; j++) {
          i = r.idx[j];
          if (mark[i] !== stamp) { mark[i] = stamp; cur[nCur++] = i; aDy[i] = aLean[i] = aHead[i] = aTilt[i] = aRa0[i] = aRa1[i] = aRoll[i] = aYaw[i] = 0; }
          add2(r, i, s);
        }
      }
      reacts.length = nl;
      for (j = 0; j < nCur; j++) { i = cur[j]; pose(i, aDy[i], aLean[i], aHead[i], aTilt[i], aRa0[i], aRa1[i], aRoll[i], aYaw[i]); }
      for (j = 0; j < nPrev; j++) { i = prev[j]; if (mark[i] !== stamp) restorePerson(i); }
      var sw = prev; prev = cur; cur = sw; nPrev = nCur;
      if (!reacts.length) { restoreAll(); nPrev = 0; pending = false; return true; } // exactly the rest pose: completely still
      uploadAll(); pending = true;
      return true;
    },
    reset: function () { reacts = []; nPrev = 0; pending = false; restoreAll(); if (current === api) current = null; }
  };
  if (!o.detached) current = api; // o.detached: a crowd T3.crowd never drives (the title screen's own stadium)
  install();
  return api;
}
