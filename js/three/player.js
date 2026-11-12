// The kid's own player at the near side of the table, seen from behind (name + number on his back).
// Plugs into the 3D table through T3.ctx the same way creatures.js does. Inert until T3.playerShow(true).
//
//   T3.playerShow(on)            show / hide him (hidden by default). Returns whether he is actually on screen.
//   T3.playerMood(name, opts)    one-shot reactions that play once and settle; null eases back to rest.
//                                'think' holds (hand on chin) until the next mood or null (or 60 s).
//                                'now' takes {kind:'impossible'} for the crossed-arms version.
//                                'reach' takes {cube:id} or {x, z} (world) and gestures toward that spot.
//   T3.playerMoods()             list of mood names
//   T3.playerRefresh()           re-read S.jersey, S.name and the opponent's kit colour
//   T3.playerState()             debugging: {shown, fits, visible, mood, scale}
//
// Placement: he stands just off the near-left corner of the table, low at the bottom edge. Every time the camera
// is fitted (resize, layout change) a small search finds the biggest spot where no part of him overlaps the table
// (mat, cubes, labels). If nothing fits (tall phones), he stays hidden.
// Style rule: at rest he only breathes, slowly. Everything else is a one-shot in response to an event.
import * as THREE from 'three';
import { clamp, lerp, sstep, easeIO, easeOut, TEAM } from './creatures/common.js';
import { buildKid, KITS, KID } from './creatures/kid.js';
import { FLOOR_Y } from './environment.js';

var T3 = window.T3;
var NAMES = ['wave', 'cheer', 'clap', 'think', 'aw', 'now', 'reach', 'nod'];
if (T3 && !T3.ctx) {
  // no 3D: keep the API callable
  T3.playerShow = function () { return false; }; T3.playerMood = function () {}; T3.playerMoods = function () { return NAMES.slice(); }; T3.playerRefresh = function () {};
}
if (T3 && T3.ctx) (function () {
  var ctx = T3.ctx, TAU = Math.PI * 2;
  var kid = null, shown = false, fits = false, needPlace = true, placedOnce = false, kitKey = '', oppKey = null;
  var place = { x: 0, y: -0.2, z: 0, s: 1, yaw: 0 };
  var lastNow = 0, lastDirty = 0, settled = true;
  // pose: targets written by the gesture each frame, then smoothed into `cur`
  var P = { lean: 0, twist: 0, hop: 0, headYaw: 0, headPitch: 0, headRoll: 0, shrug: 0, breath: 1 };
  var cur = { lean: 0, twist: 0, hop: 0, headYaw: 0, headPitch: 0, headRoll: 0, shrug: 0 };
  var REST = [new THREE.Vector3(-1.0, -0.28, 0.12), new THREE.Vector3(1.0, -0.28, 0.12)];
  var arm = [mkArm(0), mkArm(1)];
  function mkArm(i) { return { des: REST[i].clone(), goal: REST[i].clone(), al: 0.2, op: 0.35, dAl: 0.2, dOp: 0.35 }; }
  var g = null;           // current gesture {n, t0, dur, opts, fade}
  var v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), inv = new THREE.Matrix4();

  // ---------- kit ----------
  function oppJersey() {
    try {
      if (typeof G === 'undefined' || !G || !G.players) return null;
      for (var i = 0; i < G.players.length; i++) { var a = G.players[i].ai; if (a) return { key: a.kind + ':' + (a.pack || ''), col: (TEAM[a.kind] || TEAM.pip).jersey }; }
    } catch (e) {}
    return null;
  }
  function rgb(h) { var c = new THREE.Color(h); return [c.r * 255, c.g * 255, c.b * 255]; }
  function dist(a, b) { var x = rgb(a), y = rgb(b), dr = x[0] - y[0], dg = x[1] - y[1], db = x[2] - y[2]; return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / 3; }
  function pickKit(op) {
    var order = ['red', 'purple', 'teal'];
    if (!op) return 'red';
    for (var i = 0; i < order.length; i++) if (dist(KITS[order[i]].jersey, op.col) > 75) return order[i];
    return 'teal';
  }
  function info() {
    var s = (typeof S !== 'undefined' && S) ? S : {};
    return { num: String(s.jersey || '7'), name: String(s.name || '') };
  }
  function refresh() {
    var op = oppJersey(); oppKey = op ? op.key : '';
    var k = pickKit(op), inf = info(), key = k + '|' + inf.num + '|' + inf.name;
    if (!kid) { kid = buildKid(KITS[k], inf.num, inf.name); kid.root.visible = false; ctx.scene.add(kid.root); }
    else if (key !== kitKey) kid.setKit(KITS[k], inf.num, inf.name);
    kitKey = key; ctx.dirty();
  }

  // ---------- placement ----------
  // sample points of his silhouette (local units, built facing +z), including raised hands for the cheer
  var SAMPLES = [[0, KID.TOP, 0], [-1.05, 3.55, 0.35], [1.05, 3.55, 0.35], [-1.45, 3.25, 0.35], [-1.3, 3.05, 1.2], [-2.05, 1.75, 0.2], [-0.4, 2.3, 1.25], [0, 2.6, 0.8]];
  (function () {
    // outline every 0.25 units from the boots to the top of the head
    for (var h = KID.FOOT; h <= KID.TOP; h += 0.25) {
      var w = h < -0.6 ? 0.6 : h < 0.9 ? 0.92 : h < 1.75 ? 1.08 : h < 1.95 ? 0.4 : 0.84;
      SAMPLES.push([-w, h, 0], [w, h, 0], [0, h, -0.6], [0, h, 0.6]);
    }
  })();
  var HEAD = [[0, KID.TOP, 0], [-0.82, 2.6, 0], [0.82, 2.6, 0], [0, 1.85, 0]];
  var quad = [[0, 0], [0, 0], [0, 0], [0, 0]], aspect = 1;
  var pcam = new THREE.PerspectiveCamera();
  function proj(x, y, z, out) { v3.set(x, y, z).project(pcam); out[0] = v3.x; out[1] = v3.y; out[2] = v3.z; return out; }
  var pp = [0, 0, 0];
  function worldOf(c, px, pz, s, yaw, out) {
    // local (facing +z) -> world: turned by PI + yaw so his back faces the camera
    var a = Math.PI + yaw, ca = Math.cos(a), sa = Math.sin(a), x = c[0] * s, z = c[2] * s;
    out[0] = px + x * ca + z * sa; out[1] = FLOOR_Y - drop + (c[1] - KID.FOOT) * s; out[2] = pz - x * sa + z * ca; return out;
  }
  function insideQuad(x, y, m) {
    // convex quad (any winding): inside if on the same side of every edge, with a margin m in aspect-corrected NDC
    var allPos = true, allNeg = true;
    for (var i = 0; i < 4; i++) {
      var a = quad[i], b = quad[(i + 1) % 4], ex = (b[0] - a[0]) * aspect, ey = b[1] - a[1], len = Math.sqrt(ex * ex + ey * ey) || 1;
      var d = (ex * (y - a[1]) - ey * (x - a[0]) * aspect) / len;
      if (d < -m) allPos = false; if (d > m) allNeg = false;
    }
    return allPos || allNeg;
  }
  var wp = [0, 0, 0], why = { head: 0, table: 0, sunk: 0 }, drop = 0;
  var tbl = { ow: 10, od: 7 };
  function fitsAt(px, pz, s, yaw) {
    // never inside the table itself
    var r = 1.0 * s; if (Math.abs(px) < tbl.ow + r && Math.abs(pz) < tbl.od + r) { why.table++; return 0; }
    // head fully on screen, not cut by the bottom edge, and not hidden behind the table
    for (var i = 0; i < HEAD.length; i++) {
      worldOf(HEAD[i], px, pz, s, yaw, wp); proj(wp[0], wp[1], wp[2], pp);
      if (pp[2] > 1 || pp[2] < -1 || pp[0] < -0.97 || pp[0] > 0.97 || pp[1] > 0.93 || pp[1] < -0.95) { why.head++; return 0; }
      if (wp[1] < 0.5 && insideQuad(pp[0], pp[1], 0.0)) { why.head++; return 0; }
    }
    // most of his outer shoulder on screen too (an over-the-shoulder crop is fine, half a kid is not)
    for (var q = 0; q < 2; q++) {
      worldOf([q ? 0.75 : -0.75, KID.SH_Y, 0], px, pz, s, yaw, wp); proj(wp[0], wp[1], wp[2], pp);
      if (pp[0] < -1.0 || pp[0] > 1.0) { why.head++; return 0; }
    }
    // nothing over the table. A point below the table top that lands inside the table's outline on screen is
    // hidden BY the table (he stands beside it), so only points above the rim count.
    for (var k = 0; k < SAMPLES.length; k++) {
      worldOf(SAMPLES[k], px, pz, s, yaw, wp); if (wp[1] < 0.5) continue;
      proj(wp[0], wp[1], wp[2], pp);
      if (pp[2] < 1 && insideQuad(pp[0], pp[1], 0.035)) { why.table++; return 0; }
    }
    // standing lower than the pitch (drop > 0) is fine only where the pitch line across his legs can't be seen:
    // below the bottom edge of the screen or behind the table
    if (drop > 0) {
      for (var f = 0; f < 2; f++) {
        var hy = KID.FOOT + drop / s; if (hy > KID.TOP) { why.sunk++; return 0; }
        worldOf([f ? 0.92 : -0.92, hy, 0], px, pz, s, yaw, wp); proj(wp[0], wp[1], wp[2], pp);
        if (pp[1] > -1.02 && !insideQuad(pp[0], pp[1], -0.02)) { why.sunk++; return 0; }
      }
    }
    // size on screen: head height in NDC (2 = full canvas height)
    worldOf(HEAD[0], px, pz, s, yaw, wp); proj(wp[0], wp[1], wp[2], pp); var top = pp[1];
    worldOf(HEAD[3], px, pz, s, yaw, wp); proj(wp[0], wp[1], wp[2], pp);
    return top - pp[1];
  }
  function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function computePlace() {
    needPlace = false;
    var L = ctx.layout; if (!L) { fits = false; return; }
    // project with the fitted view: ctx.camBase {pos, look} if table.js offers it, else the camera as it is now
    var cam = ctx.camera; cam.updateMatrixWorld();
    pcam.fov = cam.fov; pcam.aspect = cam.aspect; pcam.near = cam.near; pcam.far = cam.far; pcam.updateProjectionMatrix();
    if (ctx.camBase && ctx.camBase.pos && ctx.camBase.look) { pcam.position.copy(ctx.camBase.pos); pcam.lookAt(ctx.camBase.look); }
    else { pcam.position.copy(cam.position); pcam.quaternion.copy(cam.quaternion); }
    pcam.updateMatrixWorld(); aspect = cam.aspect || 1;
    var ow = L.W / 2 + 0.55, od = L.D / 2 + 0.55; tbl.ow = ow; tbl.od = od;
    [[-ow, od], [ow, od], [ow, -od], [-ow, -od]].forEach(function (c, i) { proj(c[0], 0.6, c[1], pp); quad[i][0] = pp[0]; quad[i][1] = pp[1]; });
    why.head = why.table = why.sunk = 0;
    // big enough to read: his head at least ~30 CSS px tall (NDC height 2 = the whole canvas)
    var ch = (ctx.renderer && ctx.renderer.domElement.clientHeight) || 600;
    var best = null, bestScore = -1e9, CAP = 0.34, MIN = Math.max(0.06, 60 / ch);
    var ax = -ow - 1.4, az = od - 0.6;   // the spot he would like best: just off the near-left corner
    var SIZES = [1.8, 1.6, 1.45, 1.3, 1.15, 1.0];
    for (var si = 0; si < SIZES.length; si++) {
      var s = SIZES[si];
      for (var di = 0; di < 4; di++) {
        drop = di * 1.5;
        for (var x = -ow - 9; x <= 0.01; x += 0.5) {
          for (var z = od - 5; z <= od + 6; z += 0.5) {
            // mostly back-to-camera (so the name and number read), turned a little toward the middle of the table
            var away = wrap(Math.atan2(x - pcam.position.x, z - pcam.position.z) - Math.PI), toward = wrap(Math.atan2(-x, L.D * 0.1 - z) - Math.PI);
            var yaw = clamp(away * 0.65 + toward * 0.35, -0.6, 0.6);
            var hd = fitsAt(x, z, s, yaw); if (hd < MIN) continue;
            var dx = x - ax, dz = z - az;
            var sc = Math.min(hd, CAP) * 10 - Math.max(0, hd - CAP) * 4 - 0.04 * Math.sqrt(dx * dx + dz * dz) + s * 0.3 - drop * 0.03;
            if (sc > bestScore) { bestScore = sc; best = { x: x, z: z, s: s, yaw: yaw, hd: hd, drop: drop }; }
          }
        }
      }
    }
    fits = !!best; placedOnce = true;
    if (best) { place.y = FLOOR_Y - best.drop - KID.FOOT * best.s; place.drop = best.drop; place.x = best.x; place.z = best.z; place.s = best.s; place.yaw = best.yaw; place.hd = best.hd; }
    applyVis();
  }
  function applyVis() { if (kid) { kid.root.visible = shown && fits; ctx.dirty(); ctx.startLoop(); } }

  // ---------- gestures ----------
  function env(u, dur, att, rel) { if (u < 0 || u > dur) return 0; return sstep(u / att) * (1 - sstep((u - (dur - rel)) / rel)); }
  function win(u, a, b, r) { return sstep((u - a) / r) * (1 - sstep((u - b) / r)); }
  function setArm(i, x, y, z, w, al, op) { if (!(w > 0)) return; v4.set(x, y, z); arm[i].des.lerp(v4, Math.min(1, w)); arm[i].dAl += (al - arm[i].dAl) * w; arm[i].dOp += (op - arm[i].dOp) * w; }
  // where a world point is, in his chest space
  function toChest(wx, wy, wz, out) { kid.chest.updateMatrixWorld(); inv.copy(kid.chest.matrixWorld).invert(); return out.set(wx, wy, wz).applyMatrix4(inv); }
  var GEST = {
    wave: { dur: 2.6, att: 0.35, rel: 0.6, fn: function (u, e) {
      var w = win(u, 0.45, 2.0, 0.25), sw = Math.sin((u - 0.45) * TAU * 1.5) * w;
      setArm(0, -1.2 + 0.28 * sw, 2.95, 0.4, e, 0.0, 1);
      P.headPitch += -0.12 * e; P.headRoll += 0.08 * sw * e; P.twist += 0.06 * e;
    } },
    cheer: { dur: 2.6, att: 0.25, rel: 0.7, fn: function (u, e) {
      var dip = sstep(u / 0.25) * (1 - sstep((u - 0.25) / 0.15)), up = Math.max(0, Math.sin(clamp((u - 0.32) / 0.55, 0, 1) * Math.PI));
      var up2 = Math.max(0, Math.sin(clamp((u - 1.0) / 0.4, 0, 1) * Math.PI)) * 0.4;
      P.hop += (-0.18 * dip + 0.42 * up + 0.42 * up2) * e;
      var arms = sstep((u - 0.2) / 0.25);
      setArm(0, -1.0, 3.25, 0.3, e * arms, 0.0, 1); setArm(1, 1.0, 3.25, 0.3, e * arms, 0.0, 1);
      P.headPitch += -0.3 * e * arms; P.lean += -0.08 * e * arms;
    } },
    clap: { dur: 2.3, att: 0.3, rel: 0.55, fn: function (u, e) {
      var w = win(u, 0.35, 1.75, 0.12), sep = 1 - w * (0.5 - 0.5 * Math.cos((u - 0.35) * TAU * 2.4));
      // up at face height and a little wide, so the claps still read from behind
      var x = 0.12 + 0.5 * sep;
      setArm(0, -x, 2.55, 0.75, e, 0.1, 0.9); setArm(1, x, 2.55, 0.75, e, 0.1, 0.9);
      P.headPitch += (0.06 * (1 - sep) - 0.05) * e; P.lean += 0.03 * e;
    } },
    think: { dur: 60, att: 0.5, rel: 0.8, fn: function (u, e) {
      // hand on the back of his head, the other on his hip: a "hmm..." that reads from behind. Held still.
      setArm(0, -0.62, 2.7, -0.3, e, 0.0, 0.6); setArm(1, 0.98, 0.62, -0.05, e, 0.5, 0.3);
      P.headRoll += 0.16 * e; P.headPitch += -0.22 * e; P.headYaw += -0.2 * e; P.twist += -0.05 * e;
    } },
    aw: { dur: 2.6, att: 0.4, rel: 0.9, fn: function (u, e) {
      var sh = sstep(u / 0.35) * (1 - sstep((u - 0.75) / 0.4));      // a small shrug...
      var sl = sstep((u - 0.6) / 0.5) * (1 - sstep((u - 1.8) / 0.6)); // ...then a soft slump, then back up ("next time")
      P.shrug += 0.13 * sh * e; P.lean += 0.1 * sl * e; P.headPitch += 0.28 * sl * e; P.headRoll += -0.06 * sh * e;
      setArm(0, -0.8, 0.05 + 0.25 * sh, 0.5, e * sh, 0.0, 0.85); setArm(1, 0.8, 0.05 + 0.25 * sh, 0.5, e * sh, 0.0, 0.85);
      P.breath = 1 + 1.2 * sl;
    } },
    now: { dur: 2.0, att: 0.18, rel: 0.6, fn: function (u, e, o) {
      if (o && o.kind === 'impossible') {
        var c = sstep((u - 0.1) / 0.25);
        // both arms straight out to the sides, palms open, like a referee's "no!" (reads from behind)
        setArm(0, -1.95, 1.75, 0.2, e * c, 0.0, 1); setArm(1, 1.95, 1.75, 0.2, e * c, 0.0, 1);
        P.headPitch += -0.1 * e; P.lean += 0.04 * e;
        return;
      }
      var back = sstep(u / 0.16) * (1 - sstep((u - 0.16) / 0.12)), go = sstep((u - 0.2) / 0.22);
      setArm(0, lerp(-1.0, -1.15, go), lerp(1.4, 2.95, go), lerp(-0.2, 1.15, go), e, 0.0, 0.55);
      setArm(1, 0.85, 0.65, 0.55, e * go, 0.4, 0.0);
      P.lean += (-0.06 * back + 0.12 * go) * e; P.headPitch += -0.12 * go * e;
    } },
    reach: { dur: 1.5, att: 0.3, rel: 0.65, fn: function (u, e, o) {
      if (!o || !o.hand) return;
      var h = o.hand;
      setArm(o.arm, h.x, h.y, h.z, e, 0.85, 0.85);
      P.headYaw += clamp(Math.atan2(o.loc.x, o.loc.z), -0.6, 0.6) * e; P.headPitch += 0.2 * e; P.lean += 0.05 * e;
    } },
    nod: { dur: 1.1, att: 0.15, rel: 0.3, fn: function (u, e) {
      P.headPitch += 0.16 * Math.max(0, Math.sin(clamp(u / 0.9, 0, 1) * TAU)) * e;
    } }
  };

  // The hand goes toward the cube but stops short of the table: it must never cover the mat or a cube.
  function reachHand(o) {
    var t = o.loc, i = t.x < 0 ? 0 : 1, sx = (i === 0 ? -1 : 1) * KID.SH_X;
    var dx = t.x - sx, dy = t.y - KID.SH_Y, dz = t.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    for (var r = 1.6; r >= 0.95; r -= 0.08) {
      var k = Math.min(d, r) / d, h = new THREE.Vector3(sx + dx * k, Math.max(KID.SH_Y + dy * k + 0.25, 0.9), dz * k);
      v4.copy(h).applyMatrix4(kid.chest.matrixWorld);
      proj(v4.x, v4.y, v4.z, pp);
      if (v4.y < 0.5 || !insideQuad(pp[0], pp[1], 0.03)) { o.hand = h; o.arm = i; return true; }
    }
    return false;
  }

  // ---------- public API ----------
  T3.playerMoods = function () { return NAMES.slice(); };
  T3.playerShow = function (on) {
    shown = !!on;
    if (shown) { refresh(); if (needPlace || !placedOnce) computePlace(); else applyVis(); }
    else { g = null; applyVis(); }
    return shown && fits;
  };
  T3.playerRefresh = function () { if (kid) refresh(); };
  T3.playerMood = function (m, opts) {
    if (!kid || !shown) return;
    var now = performance.now();
    if (!m) { if (g && !g.fade) g.fade = now; return; }
    var d = GEST[m]; if (!d) return;
    if (document.hidden) return;
    var o = opts ? Object.assign({}, opts) : {};
    if (m === 'reach') {
      var p = null;
      if (o.cube != null && ctx.meshes[o.cube] && ctx.meshes[o.cube].visible) p = ctx.meshes[o.cube].position;
      else if (typeof o.x === 'number' && typeof o.z === 'number') p = { x: o.x, y: o.y || 0.6, z: o.z };
      if (!p) return;
      kid.root.updateMatrixWorld(true); o.loc = toChest(p.x, p.y, p.z, new THREE.Vector3());
      if (!reachHand(o)) return;
    }
    g = { n: m, t0: now, dur: d.dur, opts: o, fade: 0 };
    settled = false; ctx.dirty(); ctx.startLoop();
  };
  T3.playerState = function () { return { shown: shown, fits: fits, visible: !!(kid && kid.root.visible), mood: g ? g.n : null, scale: place.s, at: [place.x, place.z], headNDC: place.hd, drop: place.drop, rejected: why, quad: quad }; };

  // ---------- per frame ----------
  function update(now) {
    if (needPlace && ctx.layout) computePlace();   // right after a camera fit, even while hidden (the view has no offsets yet)
    if (!kid || !shown) { lastNow = now; return; }
    // a new opponent (new match) may need a different shirt colour
    var op = oppJersey(), ok = op ? op.key : '';
    if (ok !== oppKey) refresh();
    if (!kid.root.visible) { lastNow = now; return; }
    var dt = clamp((now - lastNow) / 1000, 0.001, 0.05); lastNow = now;
    if (document.hidden && g) g = null;

    P.lean = 0; P.twist = 0; P.hop = 0; P.headYaw = 0; P.headPitch = 0.22; P.headRoll = 0; P.shrug = 0; P.breath = 1;
    for (var i = 0; i < 2; i++) { arm[i].des.copy(REST[i]); arm[i].dAl = 0.2; arm[i].dOp = 0.35; }
    if (g) {
      var d = GEST[g.n], u = (now - g.t0) / 1000, fd = 1;
      if (g.fade) fd = 1 - sstep((now - g.fade) / 450);
      if (u > g.dur || fd <= 0) g = null;
      else d.fn(u, env(u, g.dur, d.att, d.rel) * fd, g.opts);
    }
    // smooth everything toward the targets (calm follow-through, never a snap)
    var kb = 1 - Math.exp(-14 * dt), ka = 1 - Math.exp(-10 * dt), moving = !!g;
    for (var key in cur) { var df = P[key] - cur[key]; if (Math.abs(df) > 1e-4) moving = true; cur[key] += df * kb; }
    for (i = 0; i < 2; i++) {
      var A = arm[i]; if (A.goal.distanceToSquared(A.des) > 1e-6) moving = true;
      A.goal.lerp(A.des, ka); A.al += (A.dAl - A.al) * ka; A.op += (A.dOp - A.op) * ka;
    }
    // apply
    var R = kid.root, br = Math.sin(now / 1000 * TAU / 4.8) * P.breath;
    R.position.set(place.x, place.y + cur.hop * place.s, place.z); R.rotation.y = Math.PI + place.yaw; R.scale.setScalar(place.s);
    kid.body.rotation.set(cur.lean, cur.twist, 0);
    kid.chest.scale.set(1 + 0.006 * br, 1 + 0.008 * br, 1 + 0.006 * br);
    kid.neck.rotation.set(cur.headPitch * 0.45, cur.headYaw * 0.4, cur.headRoll * 0.4);
    kid.head.rotation.set(cur.headPitch * 0.55, cur.headYaw * 0.6, cur.headRoll * 0.6);
    for (i = 0; i < 2; i++) {
      var a = kid.arms[i]; a.setShoulderLift(cur.shrug + 0.012 * br); a.open = arm[i].op;
      a.solve(arm[i].goal.x, arm[i].goal.y, arm[i].goal.z, arm[i].al, 0);
    }
    // only ask for frames while something is happening; at rest his breathing rides along with other renders
    if (moving) { settled = false; ctx.dirty(); }
    else if (!settled) { settled = true; ctx.dirty(); }
  }
  ctx.hooks.frame.push(update);
  // the camera was fitted again (resize / layout): find his spot on the next frame, when the camera is in place
  ctx.hooks.extents.push(function () { needPlace = true; });
})();
