// The kid's own player at the near side of the table (name + number on his back), plus an optional second human
// (Tata) at another seat. Plugs into the 3D table through T3.ctx the same way creatures.js does. Inert until
// T3.playerShow(true) / T3.mate({...}).
//
//   T3.playerShow(on)            show / hide him (hidden by default). Returns whether he is actually on screen.
//   T3.playerMood(name, opts)    one-shot reactions that play once and settle; null eases back to rest.
//                                'think' holds (hand on head) until the next mood or null (or 60 s).
//                                'now' takes {kind:'impossible'} for the arms-out version.
//                                'reach' takes {cube:id} or {x, z} (world) and gestures toward that spot.
//                                Each mood also changes his face a little (eyes, brows, mouth), once.
//   T3.playerCelebrate(name)     one of T3.playerCelebrations() ('jump', 'spin', 'robot', 'slide'), 2-3 s, once.
//                                No name: the one saved in S.kit.celebrate. Returns true if it plays.
//   T3.playerMoods()             list of mood names
//   T3.playerSet(o | null)       who stands at his spot and how he looks: { who: 'kid' | 'tata', kit, name, number }.
//                                Missing fields come from the save (S.kit, S.name, S.jersey) for the kid, or Tata's
//                                defaults (yellow, 17). kit: the saved shape { shirt, pattern, trim, shorts, hair,
//                                hairStyle } or a full kit object. null: back to the save.
//   T3.playerRefresh()           re-read S.kit, S.jersey and S.name (call after the kit panel or a name change)
//   T3.mate(o | null)            a second human: { who: 'tata' | 'kid', seat: 'left' | 'far', kit, name, number }.
//                                'left' = beside the left end of the table, on the kid's side (Team-up).
//                                'far'  = across the table where a creature would stand (2 Players / Online, no
//                                creature; hidden while a creature is at the table). null removes him.
//   T3.mateMood(name, opts)      the same moods (and celebrations) for the second human
//   T3.playerPortrait(o, size, view) -> Promise of a PNG data URL (or null): o like playerSet, view 'front' | 'back' |
//                                'face' | { yaw, close } (any angle; close = head and shoulders).
//                                For the kit designer's live preview. Drawn offscreen with the main renderer.
//   T3.playerMove(id, zone, done, {quick}?)  he picks the cube up by hand, runs round the nearest end of the table with
//                                it and sets it down in its slot (no throwing), then walks back to his seat. Same
//                                contract as T3.creatureMove: done() exactly once, the moment the cube is down (~1.2-1.6 s;
//                                at once if he can't); safety timeout. The walk back is free: a new move starts from
//                                wherever he is. quick (Goal cubes one after another): faster, and he waits a moment
//                                where he put the cube down instead of walking straight back. T3.mateMove: the same for
//                                the mate.
//   T3.playerMoveFinish()        finish any move now (the cube goes into its slot at once, done() fires; he walks back).
//                                T3.playerMoving(): true until the cube is down.
//   T3.playerWalkSide(side)      'auto' | 'right' (never round the left side, e.g. a creature sits there) | 'left'
//   T3.playerState()             debugging: {shown, fits, visible, mood, scale, pos, trip, ...}
//   T3.playerSeat(o) / T3.playerMoveTuning(o)   tuning hooks (see SEAT / WALK)
//
// Placement: his home seat is the middle of the near side, his back to the seat camera, feet on the pitch just
// outside the near rim, sized so his head just shows below the rim (see seatFor). The camera fit keeps a band of room
// for his head (the extents hook marks those points 'soft', see table.js). If his head can't be on screen he stays
// hidden. The 'left' mate (Team-up) is placed by a small search beside the left end of the table.
// Style rule (Tata's): at rest a person is completely still, apart from an occasional single blink (the creatures
// blink too). Everything else is a one-shot in response to an event, and it settles back to rest.
import * as THREE from 'three';
import { clamp, lerp, sstep, easeIO, easeOut } from './creatures/common.js';
import { buildHuman, KITS, KID, kitFromSave, KIT_DEFAULT, TATA_KIT } from './creatures/kid.js';
import { TATA, TATA_LOOK } from './creatures/grownup.js';
import { FLOOR_Y } from './environment.js';

var T3 = window.T3;
var NAMES = ['wave', 'cheer', 'clap', 'think', 'aw', 'now', 'reach', 'nod'];
var CELEBS = ['jump', 'spin', 'robot', 'slide'];
if (T3 && !T3.ctx) {
  // no 3D: keep the API callable
  T3.playerShow = function () { return false; }; T3.playerMood = function () {}; T3.playerMoods = function () { return NAMES.slice(); }; T3.playerRefresh = function () {};
  T3.playerSet = function () {}; T3.mate = function () { return false; }; T3.mateMood = function () {}; T3.playerCelebrate = function () { return false; };
  T3.playerCelebrations = function () { return CELEBS.slice(); }; T3.playerPortrait = function () { return Promise.resolve(null); };
  T3.playerMove = T3.mateMove = function (id, zone, done) { try { if (done) done(); } catch (e) { console.warn(e); } };
  T3.playerMoveFinish = function () { return false; }; T3.playerMoving = function () { return false; }; T3.playerWalkSide = function () { return 'auto'; };
}
if (T3 && T3.ctx) (function () {
  var ctx = T3.ctx, TAU = Math.PI * 2;
  var v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), inv = new THREE.Matrix4();
  var REST0 = [[-1.0, -0.28, 0.12], [1.0, -0.28, 0.12]];
  var POSE = ['lean', 'twist', 'hop', 'headYaw', 'headPitch', 'headRoll', 'shrug', 'spin', 'crouch', 'kneel', 'fwd', 'side', 'flop', 'slide', 'lift', 'pitch', 'crawl'];
  var FACE = ['big', 'smile', 'hmm', 'o', 'shout', 'lid', 'squint', 'wide', 'browUp', 'browTilt', 'browAsym', 'gazeX', 'gazeY'];
  function zero(list, o) { o = o || {}; list.forEach(function (k) { o[k] = 0; }); return o; }

  // ---------- one person (the kid at his spot, or the mate) ----------
  function makeAvatar(role) {
    return { role: role, model: null, key: '', who: '', dims: KID, shown: false, fits: false, placedOnce: false,
      place: { x: 0, y: -0.2, z: 0, s: 1, rot: Math.PI, hd: 0, drop: 0 }, P: zero(POSE), cur: zero(POSE), F: zero(FACE), Fc: zero(FACE, { lid: 0.95 }),
      arm: [0, 1].map(function (i) { var r = new THREE.Vector3(REST0[i][0], REST0[i][1], REST0[i][2]); return { rest: r, des: r.clone(), goal: r.clone(), al: 0.2, op: 0.35, dAl: 0.2, dOp: 0.35 }; }),
      g: null, settled: true, lastNow: 0, nextBlink: 0, blinkT0: -1e9, samples: null, head: null, over: null, seat: null, trip: null,
      wk: { x: 0, z: 0, px: 0, pz: 0, yaw: Math.PI, yawT: Math.PI, ph: 0, spd: 0, ok: false } };   // wk: where he stands / walks now
  }
  var me = makeAvatar('main'), mate = makeAvatar('mate');
  var needPlace = true, lastLayout = null;

  // ---------- who and which kit ----------
  function save() { return (typeof S !== 'undefined' && S) ? S : {}; }
  function normKit(k, base) {
    if (k && k.jersey) return k;                                   // already a full kit object
    return kitFromSave(Object.assign({}, base, k || {}));
  }
  function specOf(over, role) {
    over = over || {};
    var s = save(), who = over.who === 'tata' ? 'tata' : 'kid';
    if (who === 'tata') {
      var tk = Object.assign({}, TATA_KIT, over.kit && !over.kit.jersey ? over.kit : {});
      return { who: 'tata', dims: TATA, kit: over.kit && over.kit.jersey ? over.kit : normKit(tk, TATA_KIT), num: String(over.number || '17'), name: over.name != null ? String(over.name) : 'Tata',
        look: Object.assign({}, TATA_LOOK, tk.hair ? { hair: tk.hair } : {}, tk.hairStyle ? { hairStyle: tk.hairStyle } : {}), front: role === 'mate' };
    }
    // the kid: his saved kit, with any override on top
    var sk = Object.assign({}, KIT_DEFAULT, s.kit || {}, over.kit && !over.kit.jersey ? over.kit : {});
    return { who: 'kid', dims: KID, kit: over.kit && over.kit.jersey ? over.kit : normKit(sk, KIT_DEFAULT), num: String(over.number || s.jersey || '7'), name: over.name != null ? String(over.name) : String(s.name || ''),
      look: { hair: sk.hair || KIT_DEFAULT.hair, hairStyle: sk.hairStyle || 'swept' }, front: role === 'mate' };
  }
  function specKey(sp) { return JSON.stringify([sp.who, sp.kit, sp.num, sp.name, sp.look.hair, sp.look.hairStyle, sp.front]); }
  function disposeModel(m) {
    if (!m) return; if (m.root.parent) m.root.parent.remove(m.root);
    m.root.traverse(function (o) { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (x) { if (x.map) x.map.dispose(); x.dispose(); }); });
  }
  // build or update the model for an avatar; returns true when the body itself changed (placement must be redone)
  function refreshAvatar(A, parent) {
    var sp = specOf(A.over, A.role), key = specKey(sp);
    if (A.model && key === A.key) return false;
    var rebuilt = false;
    if (!A.model || sp.who !== A.who) {
      disposeModel(A.model);
      A.model = buildHuman({ dims: sp.dims, kit: sp.kit, num: sp.num, name: sp.name, look: sp.look, front: sp.front });
      A.model.root.visible = false; (parent || ctx.scene).add(A.model.root);
      A.who = sp.who; A.dims = sp.dims; makeSamples(A); rebuilt = true;
      for (var i = 0; i < 2; i++) { A.arm[i].rest.set(REST0[i][0], REST0[i][1], REST0[i][2]); mapArm(A, A.arm[i].rest); A.arm[i].des.copy(A.arm[i].rest); A.arm[i].goal.copy(A.arm[i].rest); }
    } else {
      A.model.setKit(sp.kit, sp.num, sp.name, sp.front);
      A.model.setHair(sp.look.hair, sp.look.hairStyle);
    }
    A.key = key; A.settled = false; ctx.dirty();
    return rebuilt;
  }

  // gestures are written for the kid's proportions; a grown-up's arm targets are moved to his shoulders and reach
  function mapArm(A, v) {
    var D = A.dims; if (D === KID) return v;
    var k = (D.L1 + D.L2) / (KID.L1 + KID.L2);
    v.x = v.x + Math.sign(v.x) * (D.SH_X - KID.SH_X); v.y = D.SH_Y + (v.y - KID.SH_Y) * k; v.z *= k; return v;
  }

  // ---------- placement ----------
  // sample points of his silhouette (kid units, built facing +z), including raised hands for the cheer
  var KID_SAMPLES = [[0, KID.TOP, 0], [-1.05, 3.55, 0.35], [1.05, 3.55, 0.35], [-1.45, 3.25, 0.35], [-1.3, 3.05, 1.2], [-2.05, 1.75, 0.2], [-0.4, 2.3, 1.25], [0, 2.6, 0.8]];
  (function () {
    // outline every 0.25 units from the boots to the top of the head
    for (var h = KID.FOOT; h <= KID.TOP; h += 0.25) {
      var w = h < -0.6 ? 0.6 : h < 0.9 ? 0.92 : h < 1.75 ? 1.08 : h < 1.95 ? 0.4 : 0.84;
      KID_SAMPLES.push([-w, h, 0], [w, h, 0], [0, h, -0.6], [0, h, 0.6]);
    }
  })();
  function makeSamples(A) {
    var D = A.dims, ky = (D.TOP - D.FOOT) / (KID.TOP - KID.FOOT), kx = D.SH_X / KID.SH_X;
    A.samples = KID_SAMPLES.map(function (c) { return [c[0] * kx, D.FOOT + (c[1] - KID.FOOT) * ky, c[2] * ky]; });
    var hc = D.NECK_Y + D.HEAD_UP, hw = D.HEAD_R * 1.1 * (D.head ? D.head.sx : 1);
    A.head = [[0, D.TOP, 0], [-hw, hc, 0], [hw, hc, 0], [0, hc - D.HEAD_R * 1.02 * (D.head ? D.head.sy : 1), 0]];
  }
  makeSamples(me); makeSamples(mate);
  var quad = [[0, 0], [0, 0], [0, 0], [0, 0]], aspect = 1;
  var pcam = new THREE.PerspectiveCamera();
  function proj(x, y, z, out) { v3.set(x, y, z).project(pcam); out[0] = v3.x; out[1] = v3.y; out[2] = v3.z; return out; }
  var pp = [0, 0, 0];
  var drop = 0;
  function worldOf(A, c, px, pz, s, rot, out) {
    // local (facing +z) -> world, turned by rot (PI + yaw puts the kid's back to the camera)
    var ca = Math.cos(rot), sa = Math.sin(rot), x = c[0] * s, z = c[2] * s;
    out[0] = px + x * ca + z * sa; out[1] = FLOOR_Y - drop + (c[1] - A.dims.FOOT) * s; out[2] = pz - x * sa + z * ca; return out;
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
  var wp = [0, 0, 0], why = { head: 0, table: 0, sunk: 0, near: 0 };
  var tbl = { ow: 10, od: 7 };
  function fitsAt(A, px, pz, s, rot) {
    var D = A.dims;
    // never inside the table itself
    var r = 1.0 * s; if (Math.abs(px) < tbl.ow + r && Math.abs(pz) < tbl.od + r) { why.table++; return 0; }
    // head fully on screen, not cut by the bottom edge, and not hidden behind the table
    for (var i = 0; i < A.head.length; i++) {
      worldOf(A, A.head[i], px, pz, s, rot, wp); proj(wp[0], wp[1], wp[2], pp);
      if (pp[2] > 1 || pp[2] < -1 || pp[0] < -0.97 || pp[0] > 0.97 || pp[1] > 0.93 || pp[1] < -0.95) { why.head++; return 0; }
      if (wp[1] < 0.5 && insideQuad(pp[0], pp[1], 0.0)) { why.head++; return 0; }
    }
    // most of his outer shoulder on screen too (an over-the-shoulder crop is fine, half a kid is not)
    for (var q = 0; q < 2; q++) {
      worldOf(A, [(q ? 1 : -1) * D.SH_X * 0.94, D.SH_Y, 0], px, pz, s, rot, wp); proj(wp[0], wp[1], wp[2], pp);
      if (pp[0] < -1.0 || pp[0] > 1.0) { why.head++; return 0; }
    }
    // nothing over the table. A point below the table top that lands inside the table's outline on screen is
    // hidden BY the table (he stands beside it), so only points above the rim count.
    var SM = A.samples;
    for (var k = 0; k < SM.length; k++) {
      worldOf(A, SM[k], px, pz, s, rot, wp); if (wp[1] < 0.5) continue;
      proj(wp[0], wp[1], wp[2], pp);
      if (pp[2] < 1 && insideQuad(pp[0], pp[1], 0.035)) { why.table++; return 0; }
    }
    // standing lower than the pitch (drop > 0) is fine only where the pitch line across his legs can't be seen:
    // below the bottom edge of the screen or behind the table
    if (drop > 0) {
      for (var f = 0; f < 2; f++) {
        var hy = D.FOOT + drop / s; if (hy > D.TOP) { why.sunk++; return 0; }
        worldOf(A, [(f ? 1 : -1) * 0.92 * D.torsoX, hy, 0], px, pz, s, rot, wp); proj(wp[0], wp[1], wp[2], pp);
        if (pp[1] > -1.02 && !insideQuad(pp[0], pp[1], -0.02)) { why.sunk++; return 0; }
      }
    }
    // size on screen: head height in NDC (2 = full canvas height)
    worldOf(A, A.head[0], px, pz, s, rot, wp); proj(wp[0], wp[1], wp[2], pp); var top = pp[1];
    worldOf(A, A.head[3], px, pz, s, rot, wp); proj(wp[0], wp[1], wp[2], pp);
    return top - pp[1];
  }
  function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function setupProj() {
    var L = ctx.layout; if (!L) return null;
    // project with the fitted view: ctx.camBase {pos, look} if table.js offers it, else the camera as it is now
    var cam = ctx.camera; cam.updateMatrixWorld();
    pcam.fov = cam.fov; pcam.aspect = cam.aspect; pcam.near = cam.near; pcam.far = cam.far; pcam.updateProjectionMatrix();
    if (ctx.camBase && ctx.camBase.pos && ctx.camBase.look) { pcam.position.copy(ctx.camBase.pos); pcam.lookAt(ctx.camBase.look); }
    else { pcam.position.copy(cam.position); pcam.quaternion.copy(cam.quaternion); }
    pcam.updateMatrixWorld(); aspect = cam.aspect || 1;
    var ow = L.W / 2 + 0.55, od = L.D / 2 + 0.55; tbl.ow = ow; tbl.od = od;
    [[-ow, od], [ow, od], [ow, -od], [-ow, -od]].forEach(function (c, i) { proj(c[0], 0.6, c[1], pp); quad[i][0] = pp[0]; quad[i][1] = pp[1]; });
    return L;
  }
  // ----- his home seat: the middle of the near side, his back to the seat camera, feet on the pitch -----
  // He stands just outside the near rim. Seen from the seat camera (high behind him, looking down across the table),
  // anything lower than the line of sight through the rim's inner edge shows BELOW the rim on screen, so it never
  // covers the felt. He is sized so that the outline of his head (hair included) just touches that line: his hair
  // may overlap the wooden rim a little, never the felt, cubes or zone labels. The camera fit (extents hook) then
  // makes a band of room below the rim for his head and shoulders. Same rule on wide and tall screens.
  var SEAT = { gap: 0.25, hair: 1.16, into: 1.4, low: 0.15, minS: { kid: 1.0, tata: 0.85 }, maxS: { kid: 1.6, tata: 1.4 } };
  function headInfo(D, s, z) {
    // head centre (world y, z) and radius with the hair, for a person standing on the pitch with hips at z
    var hy = FLOOR_Y + (D.NECK_Y + D.HEAD_UP - D.FOOT) * s, hz = z - 0.12 * s;   // he looks a little down: the head sits a bit forward
    return { y: hy, z: hz, r: D.HEAD_R * SEAT.hair * Math.max(D.head ? D.head.sx : 1, D.head ? D.head.sy : 1) * s };
  }
  function seatZ(D, s, L) { return L.D / 2 + 0.85 + SEAT.gap + 0.86 * D.torsoX * s; }   // his tummy just clears the rim
  // The line of sight from the camera through a line across the felt just inside the near rim, in the (z, y) plane;
  // n points down / toward him. Cubes never lie that close to the near edge (the Resources slots fill from the far
  // side of the zone: 24 cubes take 2 rows on the wide table, 3 on the tall one, ending 2.5+ units short of the rim),
  // so his hair may cover the rim and that empty band of felt, nothing else.
  function sightLine(camPos, L) {
    var iz = L.D / 2 - SEAT.into, ry = 0.5, lz = camPos.z - iz, ly = camPos.y - ry, len = Math.sqrt(lz * lz + ly * ly) || 1;
    return { iz: iz, ry: ry, nz: ly / len, ny: -lz / len };
  }
  function seatFor(A, camPos, L) {
    var D = A.dims, ln = sightLine(camPos, L), key = D === KID ? 'kid' : 'tata', lo = SEAT.minS[key], hi = SEAT.maxS[key];
    function clear(s) { var z = seatZ(D, s, L), h = headInfo(D, s, z); return (h.z - ln.iz) * ln.nz + (h.y - ln.ry) * ln.ny - h.r; }
    if (clear(lo) < 0) return null;                    // even a small kid would cover the felt (camera too low): no seat
    if (clear(hi) >= 0) lo = hi;
    else for (var it = 0; it < 22; it++) { var mid = (lo + hi) / 2; if (clear(mid) >= 0) lo = mid; else hi = mid; }
    var s = lo, z = seatZ(D, s, L);
    return { x: 0, z: z, s: s, rot: Math.PI, hd: 0, drop: 0, head: headInfo(D, s, z), ln: ln };
  }
  // the points the camera fit should keep on screen for him: his whole head and the tops of his shoulders
  function seatPoints(A, b, out) {
    var h = b.head, ln = b.ln;   // 'soft': table.js may back the camera off a little more for these (see fitCamera)
    out.push([0, h.y + h.r * 0.95, h.z, 'soft'], [-h.r, h.y, h.z, 'soft'], [h.r, h.y, h.z, 'soft']);
    out.push([0, h.y + ln.ny * h.r * SEAT.low, h.z + ln.nz * h.r * SEAT.low, 'soft']);   // the low edge of his head on screen (the shoulders follow below)
  }
  function placeMain() {
    var A = me, L = ctx.layout;
    why.head = why.table = why.sunk = why.near = 0;
    // with the view the camera really ended up with (the fit's last pass used almost the same one)
    var b = seatFor(A, pcam.position, L);
    A.fits = false; A.placedOnce = true;
    if (!b) { why.table++; return; }
    // his head must really be on screen (the fit may have hit its limit on a very narrow screen)
    proj(0, b.head.y, b.head.z, pp);
    if (pp[2] > 1 || pp[1] < -0.97 || pp[1] > 0.97) { why.head++; return; }
    var hb = [0, 0, 0]; proj(0, b.head.y + b.head.r, b.head.z, hb); b.hd = hb[1] - pp[1];
    A.fits = true; setPlace(A, b);
  }
  function setPlace(A, b) {
    A.place.y = FLOOR_Y - b.drop - A.dims.FOOT * b.s; A.place.drop = b.drop; A.place.x = b.x; A.place.z = b.z; A.place.s = b.s; A.place.rot = b.rot; A.place.hd = b.hd;
  }
  // Team-up: the grown-up stands beside the left end of the table, on the kid's side of the creature (which is
  // always behind the far edge), at the same world scale as the kid (so a grown-up is taller), never on top of him.
  function placeLeft() {
    var A = mate, ow = tbl.ow, od = tbl.od, ch = (ctx.renderer && ctx.renderer.domElement.clientHeight) || 600;
    var MIN = Math.max(0.05, 50 / ch), best = null, bestScore = -1e9, s0 = me.fits ? me.place.s : 1.4, kr = me.fits ? me.place.s : 0;
    drop = 0;
    [1, 0.9, 0.8].forEach(function (f) {
      var s = s0 * f;
      for (var x = -ow - 0.8; x >= -ow - 7; x -= 0.5) {
        for (var z = od - 0.5; z >= -od + 1.2; z -= 0.5) {
          // keep clear of the kid (both bodies plus a gap)
          if (me.fits) { var ddx = x - me.place.x, ddz = z - me.place.z; if (Math.sqrt(ddx * ddx + ddz * ddz) < 1.25 * (s + kr)) { why.near++; continue; } }
          var rot = Math.atan2(-ow * 0.4 - x, -z * 0.3 - z);                      // turned toward the middle of the table
          var hd = fitsAt(A, x, z, s, rot); if (hd < MIN) continue;
          var dx = x - (-ow - 1.6), dz = z;
          var sc = Math.min(hd, 0.3) * 10 + f * 2 - 0.08 * Math.sqrt(dx * dx + dz * dz);
          if (sc > bestScore) { bestScore = sc; best = { x: x, z: z, s: s, rot: rot, hd: hd, drop: 0 }; }
        }
      }
    });
    A.fits = !!best; A.placedOnce = true;
    if (best) setPlace(A, best);
  }
  // 2 Players / Online: across the table where a creature would stand, facing the camera, standing on the pitch
  var FAR = { s: 1.35, front: 1.95, look: -0.5 };   // a little smaller than life next to the table, so his head fits the usual view like a creature's
  function creatureHere() { try { return !!(T3.creatureVisible && T3.creatureVisible()); } catch (e) { return false; } }
  function placeFar() {
    var A = mate, L = ctx.layout; if (!L) { A.fits = false; return; }
    setPlace(A, { x: 0, z: -L.D / 2 - FAR.front, s: FAR.s, rot: 0, hd: 0, drop: 0 });
    A.fits = !creatureHere(); A.placedOnce = true;
  }
  function computePlace() {
    needPlace = false;
    if (!setupProj()) { me.fits = false; mate.fits = false; return; }
    placeMain();
    if (mate.seat === 'far') placeFar(); else if (mate.seat === 'left') placeLeft();
    applyVis();
  }
  function applyVis() {
    if (me.model) me.model.root.visible = me.shown && me.fits;
    if (mate.model) mate.model.root.visible = mate.shown && mate.fits;
    ctx.dirty(); ctx.startLoop();
  }

  // ---------- gestures ----------
  function env(u, dur, att, rel) { if (u < 0 || u > dur) return 0; return sstep(u / att) * (1 - sstep((u - (dur - rel)) / rel)); }
  function win(u, a, b, r) { return sstep((u - a) / r) * (1 - sstep((u - b) / r)); }
  function ramp(u, a, b) { return sstep((u - a) / (b - a)); }
  var tv = new THREE.Vector3();
  function setArm(A, i, x, y, z, w, al, op, raw) {
    if (!(w > 0)) return; tv.set(x, y, z); if (!raw) mapArm(A, tv);
    var R = A.arm[i]; R.des.lerp(tv, Math.min(1, w)); R.dAl += (al - R.dAl) * w; R.dOp += (op - R.dOp) * w;
  }
  // add an expression, weighted (lid is a target, the rest are added)
  function face(A, f, w) { if (!(w > 0)) return; for (var k in f) { if (k === 'lid') A.F.lid += (f.lid - A.F.lid) * Math.min(1, w); else A.F[k] += f[k] * w; } }
  // where a world point is, in his chest space
  function toChest(A, wx, wy, wz, out) { A.model.chest.updateMatrixWorld(); inv.copy(A.model.chest.matrixWorld).invert(); return out.set(wx, wy, wz).applyMatrix4(inv); }
  var GEST = {
    wave: { dur: 2.6, att: 0.35, rel: 0.6, fn: function (A, u, e) {
      var P = A.P, w = win(u, 0.45, 2.0, 0.25), sw = Math.sin((u - 0.45) * TAU * 1.5) * w;
      setArm(A, 0, -1.2 + 0.28 * sw, 2.95, 0.4, e, 0.0, 1);
      P.headPitch += -0.12 * e; P.headRoll += 0.08 * sw * e; P.twist += 0.06 * e;
      face(A, { big: 0.3, browUp: 0.45, squint: 0.15 }, e);
    } },
    cheer: { dur: 2.6, att: 0.25, rel: 0.7, fn: function (A, u, e) {
      var P = A.P, dip = sstep(u / 0.25) * (1 - sstep((u - 0.25) / 0.15)), up = Math.max(0, Math.sin(clamp((u - 0.32) / 0.55, 0, 1) * Math.PI));
      var up2 = Math.max(0, Math.sin(clamp((u - 1.0) / 0.4, 0, 1) * Math.PI)) * 0.4;
      P.hop += (-0.18 * dip + 0.42 * up + 0.42 * up2) * e;
      var arms = sstep((u - 0.2) / 0.25);
      setArm(A, 0, -1.0, 3.25, 0.3, e * arms, 0.0, 1); setArm(A, 1, 1.0, 3.25, 0.3, e * arms, 0.0, 1);
      P.headPitch += -0.3 * e * arms; P.lean += -0.08 * e * arms;
      face(A, { big: 1, squint: 0.45, browUp: 0.7 }, e);
    } },
    clap: { dur: 2.3, att: 0.3, rel: 0.55, fn: function (A, u, e) {
      var P = A.P, w = win(u, 0.35, 1.75, 0.12), sep = 1 - w * (0.5 - 0.5 * Math.cos((u - 0.35) * TAU * 2.4));
      // up at face height and a little wide, so the claps still read from behind
      var x = 0.12 + 0.5 * sep;
      setArm(A, 0, -x, 2.55, 0.75, e, 0.1, 0.9); setArm(A, 1, x, 2.55, 0.75, e, 0.1, 0.9);
      P.headPitch += (0.06 * (1 - sep) - 0.05) * e; P.lean += 0.03 * e;
      face(A, { squint: 0.35, browUp: 0.25, smile: 0.2 }, e);
    } },
    think: { dur: 60, att: 0.5, rel: 0.8, fn: function (A, u, e) {
      // hand on the back of his head, the other on his hip: a "hmm..." that reads from behind. Held still.
      var P = A.P;
      setArm(A, 0, -0.62, 2.7, -0.3, e, 0.0, 0.6); setArm(A, 1, 0.98, 0.62, -0.05, e, 0.5, 0.3);
      P.headRoll += 0.16 * e; P.headPitch += -0.22 * e; P.headYaw += -0.2 * e; P.twist += -0.05 * e;
      face(A, { hmm: 1, browAsym: 0.55, gazeX: 0.45, gazeY: 0.55, lid: 0.85 }, e);
    } },
    aw: { dur: 2.6, att: 0.4, rel: 0.9, fn: function (A, u, e) {
      var P = A.P, sh = sstep(u / 0.35) * (1 - sstep((u - 0.75) / 0.4));      // a small shrug...
      var sl = sstep((u - 0.6) / 0.5) * (1 - sstep((u - 1.8) / 0.6)); // ...then a soft slump, then back up ("next time")
      P.shrug += 0.13 * sh * e; P.lean += 0.1 * sl * e; P.headPitch += 0.28 * sl * e; P.headRoll += -0.06 * sh * e;
      setArm(A, 0, -0.8, 0.05 + 0.25 * sh, 0.5, e * sh, 0.0, 0.85); setArm(A, 1, 0.8, 0.05 + 0.25 * sh, 0.5, e * sh, 0.0, 0.85);
      face(A, { o: 0.85, browTilt: 0.7, browUp: 0.15, gazeY: -0.35, lid: 0.8 }, e);
    } },
    now: { dur: 2.0, att: 0.18, rel: 0.6, fn: function (A, u, e, o) {
      var P = A.P;
      face(A, { shout: 1, browTilt: -0.75, wide: 0.6 }, e);
      if (o && o.kind === 'impossible') {
        var c = sstep((u - 0.1) / 0.25);
        // both arms straight out to the sides, palms open, like a referee's "no!" (reads from behind)
        setArm(A, 0, -1.95, 1.75, 0.2, e * c, 0.0, 1); setArm(A, 1, 1.95, 1.75, 0.2, e * c, 0.0, 1);
        P.headPitch += -0.1 * e; P.lean += 0.04 * e;
        return;
      }
      var back = sstep(u / 0.16) * (1 - sstep((u - 0.16) / 0.12)), go = sstep((u - 0.2) / 0.22);
      setArm(A, 0, lerp(-1.0, -1.15, go), lerp(1.4, 2.95, go), lerp(-0.2, 1.15, go), e, 0.0, 0.55);
      setArm(A, 1, 0.85, 0.65, 0.55, e * go, 0.4, 0.0);
      P.lean += (-0.06 * back + 0.12 * go) * e; P.headPitch += -0.12 * go * e;
    } },
    reach: { dur: 1.5, att: 0.3, rel: 0.65, fn: function (A, u, e, o) {
      if (!o || !o.hand) return;
      var P = A.P, h = o.hand;
      setArm(A, o.arm, h.x, h.y, h.z, e, 0.85, 0.85, true);
      P.headYaw += clamp(Math.atan2(o.loc.x, o.loc.z), -0.6, 0.6) * e; P.headPitch += 0.2 * e; P.lean += 0.05 * e;
      face(A, { gazeY: -0.5, browUp: 0.15 }, e);
    } },
    nod: { dur: 1.1, att: 0.15, rel: 0.3, fn: function (A, u, e) {
      A.P.headPitch += 0.16 * Math.max(0, Math.sin(clamp(u / 0.9, 0, 1) * TAU)) * e;
      face(A, { smile: 0.6 }, e);
    } },

    // ----- win celebrations (original moves, about 2.5-3 s each, played once) -----
    // Rocket jump: crouch, a big jump with one fist punched to the sky, land, then one "yes!" fist pump.
    jump: { dur: 2.8, att: 0.12, rel: 0.6, fn: function (A, u, e) {
      var P = A.P, crouch = win(u, 0.02, 0.32, 0.14) * 0.7 + win(u, 0.92, 1.12, 0.08) * 0.55;
      var air = clamp((u - 0.36) / 0.58, 0, 1), arc = Math.sin(air * Math.PI) * (u > 0.36 && u < 0.94 ? 1 : 0);
      P.crouch += (crouch + 0.3 * arc) * e; P.hop += 1.0 * arc * e; P.lean += (0.18 * crouch - 0.08 * arc) * e;
      var up = ramp(u, 0.3, 0.45) * (1 - ramp(u, 1.25, 1.45)), pump = ramp(u, 1.25, 1.45) * (1 - ramp(u, 2.0, 2.3)), back = 1 - ramp(u, 0.25, 0.4);
      setArm(A, 0, -0.95, 0.4, -0.55, e * back, 0, 0.5); setArm(A, 1, 0.95, 0.4, -0.55, e * back, 0, 0.5);
      setArm(A, 0, -0.8, 3.5, 0.25, e * up, 0, 0.3); setArm(A, 1, 0.55, 1.55, 0.8, e * up, 0, 0.3);
      setArm(A, 0, -1.2, 1.0, 0.45, e * pump, 0, 0.3); setArm(A, 1, 0.9, 0.25, 0.3, e * pump, 0, 0.35);
      P.headPitch += (-0.35 * up + 0.12 * pump) * e; P.lean += 0.1 * pump * e; P.twist += -0.12 * pump * e;
      face(A, { big: 1 - pump, shout: pump, squint: 0.4, browUp: 0.7 * up - 0.3 * pump }, e);
    } },
    // Spin and point: a little wind-up, one full turn on the spot with arms out, then both arms point up to the sky.
    spin: { dur: 2.7, att: 0.15, rel: 0.6, fn: function (A, u, e) {
      var P = A.P, wind = win(u, 0.0, 0.3, 0.15), t = clamp((u - 0.28) / 0.85, 0, 1);
      P.twist += -0.28 * wind * e; P.crouch += 0.3 * wind * e;
      P.spin = easeIO(t) * TAU;                                            // not weighted: the turn always completes
      P.hop += 0.3 * Math.sin(t * Math.PI) * e;
      var out = win(u, 0.3, 1.1, 0.12), point = ramp(u, 1.15, 1.35);
      setArm(A, 0, -1.75, 1.75, 0.15, e * out, 0, 1); setArm(A, 1, 1.75, 1.75, 0.15, e * out, 0, 1);
      setArm(A, 0, -1.3, 3.5, 0.6, e * point, 0, 0.3); setArm(A, 1, 1.3, 3.5, 0.6, e * point, 0, 0.3);
      P.headPitch += -0.32 * point * e;
      face(A, { big: 0.8, squint: 0.3 * point, browUp: 0.5 }, e);
    } },
    // Robot dance: four stiff, stepped poses (a quick snap into each, then held), then back to rest.
    robot: { dur: 2.9, att: 0.1, rel: 0.5, fn: function (A, u, e) {
      var P = A.P, B = [0.15, 0.7, 1.25, 1.8], k = -1;
      for (var i = 0; i < 4; i++) if (u >= B[i]) k = i;
      if (k < 0) return;
      var snap = sstep((u - B[k]) / 0.09), prev = k - 1;
      // [right arm, left arm, twist, headYaw, crouch]: elbows at the sides with forearms straight forward, then arms out
      var POS = [
        [[-0.9, 0.85, 1.05], [0.95, -0.2, 0.2], 0.25, 0.45, 0.1],
        [[-0.95, -0.2, 0.2], [0.9, 0.85, 1.05], -0.25, -0.45, 0.1],
        [[-0.85, 0.85, 1.05], [0.85, 0.85, 1.05], 0, 0, 0.3],
        [[-2.05, 1.6, 0.15], [2.05, 1.6, 0.15], 0, 0, 0.05]
      ];
      var a = POS[k], b = prev >= 0 ? POS[prev] : null, mix = function (j, c) { return b ? lerp(b[j][c], a[j][c], snap) : a[j][c]; }, mixS = function (j) { return b ? lerp(b[j], a[j], snap) : a[j] * snap; };
      var w = b ? e : e * snap;
      setArm(A, 0, mix(0, 0), mix(0, 1), mix(0, 2), w, 0, 0.6); setArm(A, 1, mix(1, 0), mix(1, 1), mix(1, 2), w, 0, 0.6);
      P.twist += mixS(2) * e; P.headYaw += mixS(3) * e; P.crouch += (mixS(4) + 0.12 * (1 - snap)) * e;
      face(A, { smile: 0.75, wide: 0.8, browUp: 0.35 }, e);
    } },
    // Knee slide: a quick lean-in, down onto both knees sliding a little forward, arms wide up to the sky, then up again.
    slide: { dur: 3.0, att: 0.15, rel: 0.75, fn: function (A, u, e) {
      var P = A.P, lean = win(u, 0.0, 0.4, 0.15), knee = ramp(u, 0.3, 0.6) * (1 - ramp(u, 2.0, 2.6));
      var go = easeOut(clamp((u - 0.32) / 0.9, 0, 1)) * (1 - ramp(u, 2.0, 2.7));
      P.lean += (0.22 * lean - 0.32 * knee) * e; P.kneel += knee * e; P.fwd += (0.2 * lean + 0.55 * go) * e;
      var arms = ramp(u, 0.45, 0.7) * (1 - ramp(u, 2.0, 2.4));
      setArm(A, 0, -0.95, 0.35, -0.5, e * lean, 0, 0.5); setArm(A, 1, 0.95, 0.35, -0.5, e * lean, 0, 0.5);
      setArm(A, 0, -1.95, 2.9, 0.3, e * arms, 0, 0.8); setArm(A, 1, 1.95, 2.9, 0.3, e * arms, 0, 0.8);
      P.headPitch += -0.4 * arms * e;
      face(A, { shout: arms * (1 - ramp(u, 1.3, 1.6)), big: ramp(u, 1.3, 1.6), squint: 0.35, browUp: 0.6 }, e);
    } }
  };

  // The hand goes toward the cube but stops short of the table: it must never cover the mat or a cube.
  function reachHand(A, o) {
    var D = A.dims, t = o.loc, i = t.x < 0 ? 0 : 1, sx = (i === 0 ? -1 : 1) * D.SH_X, k = (D.L1 + D.L2) / (KID.L1 + KID.L2);
    var dx = t.x - sx, dy = t.y - D.SH_Y, dz = t.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    for (var r = 1.6 * k; r >= 0.95 * k; r -= 0.08 * k) {
      var kk = Math.min(d, r) / d, h = new THREE.Vector3(sx + dx * kk, Math.max(D.SH_Y + dy * kk + 0.25, D.SH_Y - 0.65 * k), dz * kk);
      v4.copy(h).applyMatrix4(A.model.chest.matrixWorld);
      proj(v4.x, v4.y, v4.z, pp);
      if (v4.y < 0.5 || !insideQuad(pp[0], pp[1], 0.03)) { o.hand = h; o.arm = i; return true; }
    }
    return false;
  }
  function startMood(A, m, opts) {
    if (!A.model || !A.shown) return false;
    var now = performance.now();
    if (!m) { if (A.g && !A.g.fade) A.g.fade = now; return false; }
    var d = GEST[m]; if (!d) return false;
    if (document.hidden) return false;
    var o = opts ? Object.assign({}, opts) : {};
    if (m === 'reach') {
      var p = null;
      if (o.cube != null && ctx.meshes[o.cube] && ctx.meshes[o.cube].visible) p = ctx.meshes[o.cube].position;
      else if (typeof o.x === 'number' && typeof o.z === 'number') p = { x: o.x, y: o.y || 0.6, z: o.z };
      if (!p) return false;
      A.model.root.updateMatrixWorld(true); o.loc = toChest(A, p.x, p.y, p.z, new THREE.Vector3());
      if (!reachHand(A, o)) return false;
    }
    A.g = { n: m, t0: now, dur: d.dur, opts: o, fade: 0 };
    A.settled = false; ctx.dirty(); ctx.startLoop();
    return true;
  }

  // ---------- picking up a cube and putting it in its slot by hand (T3.playerMove / T3.mateMove) ----------
  // Like a creature, he picks the cube up with his hand, carries it and sets it down in its slot, no throwing. The zones
  // are across the table, more than an arm and a lean away from his seat, so he takes the cube, runs round the nearest
  // end of the table (on a "ring" just outside the rim, at the same belly clearance as his seat, corners rounded), sets
  // the cube down from the spot nearest to its slot and walks back to his seat. The middle of the table is out of reach
  // of a standing lean from every edge, so for those slots he hops up onto his tummy on the rim, feet in the air, and
  // slides in a little (a kid reaching across a big table). done() fires the moment the cube is down in its slot; the
  // walk back is free (a new move starts from wherever he is then).
  // The grab spot, the drop spot and the way round are picked by the shortest time (walk + grab + drop, plus a little
  // for the walk back), never through a creature or the person across the table (hard), round the other person at
  // the table on the outside (behind him), and never on a side ruled out by T3.playerWalkSide().
  // v / vBack / stride / fwd / slideMax are in his own units (x his scale); times in seconds.
  var WALK = { v: 18.5, vBack: 11, stretch: 1.1, lean: 0.85, fwd: 0.3, flopP: 1.2, crawlP: 1.0, slideMax: 3.4, maxTurn: 1.05,
    tGrab: 0.34, tGrabF: 0.44, tPlace: 0.36, tPlaceF: 0.46, linger: 0.45, quickV: 1.25, quickT: 0.8, safety: 2500, side: 'auto', stride: 4.2, h: 0.6 };
  function slotFor(id, zone) {
    // where a cube will come to rest in a zone (the same as creatures.js slotFor, which mirrors table.js gridSlots / the Goal row)
    var L = ctx.layout, Gm = (typeof G !== 'undefined') ? G : null, r = L && L.z[zone];
    if (!r) return null;
    var a = { x: r[0] + 0.25, z: r[1] + 1.05, w: r[2] - 0.5, d: r[3] - 1.25 }, i;
    if (!Gm || !Gm.cubes) return { x: a.x + a.w / 2, z: a.z + a.d / 2 };
    if (zone === 'goal') {
      var gt = Gm.goalTokens || [], total = 1.2, before = 0;
      for (i = 0; i < gt.length; i++) { if (typeof gt[i] === 'object' && gt[i].id === id) continue; var wd = (gt[i] === '(' || gt[i] === ')') ? 0.55 : 1.2; before += wd; total += wd; }
      var gs = Math.min(1, a.w / Math.max(total, 1)), x0 = a.x + (a.w - total * gs) / 2;
      return { x: x0 + before * gs + 0.6 * gs, z: a.z + a.d / 2 };
    }
    var n = 0; for (i = 0; i < Gm.cubes.length; i++) { var c = Gm.cubes[i]; if (c.zone === zone && c.id !== id) n++; }
    var cnt = n + 1, s = 1.25, cols, rows;
    while (s > 0.45) { cols = Math.max(1, Math.floor(a.w / s)); rows = Math.max(1, Math.floor(a.d / s)); if (cols * rows >= cnt) break; s -= 0.05; }
    cols = Math.max(1, Math.floor(a.w / s));
    var used = Math.min(cnt, cols), offx = (a.w - used * s) / 2;
    return { x: a.x + offx + s / 2 + (n % cols) * s, z: a.z + s / 2 + Math.floor(n / cols) * s };
  }

  // ----- the ring round the table -----
  // u = 0 at the middle of the near side (his seat), increasing toward +x: near-right, right side, far side, left side.
  function ringOf(A) {
    var L = ctx.layout, ow = L.W / 2 + 0.55, od = L.D / 2 + 0.55, c = 0.55 + 0.86 * A.dims.torsoX * A.place.s, q = Math.PI * c / 2;
    var b = [ow, ow + q, ow + q + 2 * od, ow + 2 * q + 2 * od, 3 * ow + 2 * q + 2 * od, 3 * ow + 3 * q + 2 * od, 3 * ow + 3 * q + 4 * od, 3 * ow + 4 * q + 4 * od, 4 * ow + 4 * q + 4 * od];
    return { ow: ow, od: od, c: c, b: b, L: b[8] };
  }
  function ringPt(R, u) {
    // {x, z, nx, nz}: n = the inward normal (toward the table)
    u = ((u % R.L) + R.L) % R.L;
    var b = R.b, ow = R.ow, od = R.od, c = R.c, t;
    function st(x, z, nx, nz) { return { x: x, z: z, nx: nx, nz: nz }; }
    function arc(cx, cz, dx, dz) { return { x: cx + dx * c, z: cz + dz * c, nx: -dx, nz: -dz }; }
    if (u < b[0]) return st(u, od + c, 0, -1);
    if (u < b[1]) { t = (u - b[0]) / c; return arc(ow, od, Math.sin(t), Math.cos(t)); }
    if (u < b[2]) return st(ow + c, od - (u - b[1]), -1, 0);
    if (u < b[3]) { t = (u - b[2]) / c; return arc(ow, -od, Math.cos(t), -Math.sin(t)); }
    if (u < b[4]) return st(ow - (u - b[3]), -od - c, 0, 1);
    if (u < b[5]) { t = (u - b[4]) / c; return arc(-ow, -od, -Math.sin(t), -Math.cos(t)); }
    if (u < b[6]) return st(-ow - c, -od + (u - b[5]), 1, 0);
    if (u < b[7]) { t = (u - b[6]) / c; return arc(-ow, od, -Math.cos(t), Math.sin(t)); }
    return st(-ow + (u - b[7]), od + c, 0, -1);
  }
  function ringU(R, x, z) {
    // the ring position nearest to a point (outside the table)
    var ow = R.ow, od = R.od, b = R.b, c = R.c;
    if (Math.abs(x) < ow && Math.abs(z) < od) { if (ow - Math.abs(x) < od - Math.abs(z)) x = (x < 0 ? -1 : 1) * (ow + 0.01); else z = (z < 0 ? -1 : 1) * (od + 0.01); }
    if (z >= od && Math.abs(x) <= ow) return x >= 0 ? x : R.L + x;
    if (x >= ow && z >= od) return b[0] + c * Math.atan2(x - ow, z - od);
    if (x >= ow && Math.abs(z) < od) return b[1] + (od - z);
    if (x >= ow && z <= -od) return b[2] + c * Math.atan2(-(z + od), x - ow);
    if (z <= -od && Math.abs(x) <= ow) return b[3] + (ow - x);
    if (x <= -ow && z <= -od) return b[4] + c * Math.atan2(-(x + ow), -(z + od));
    if (x <= -ow && Math.abs(z) < od) return b[5] + (z + od);
    return b[6] + c * Math.atan2(z - od, -(x + ow));
  }
  function outlineDist(R, x, z) { var dx = Math.max(0, Math.abs(x) - R.ow), dz = Math.max(0, Math.abs(z) - R.od); return Math.sqrt(dx * dx + dz * dz) * ((Math.abs(x) < R.ow && Math.abs(z) < R.od) ? -1 : 1); }
  function homeOf(A) { return { x: A.place.x, z: A.place.z, yaw: A.place.rot }; }
  // running speed (world units / s). The person across the table (smaller, and every Resource is on the near half)
  // runs a little faster so his moves don't drag.
  function runSpeed(A, quick) { return WALK.v * A.place.s * (quick ? WALK.quickV : 1) * (A === mate && mate.seat === 'far' ? 1.3 : 1); }
  function radiusOf(A) { return 1.0 * A.dims.torsoX * A.place.s; }
  function flopLift(A) {
    // root (waist) height when he lies on his tummy: the belly clears the cubes on the felt (cube tops at y = 1)
    var s = A.place.s, yF = 1.15 + 0.86 * A.dims.torsoX * s * Math.sin(WALK.flopP);
    return (yF - A.place.y) / s;   // his units above his standing height
  }
  // what is in his way: a creature across the table and the person standing there are hard (never walk there), the
  // other person at the table is soft (he goes round the outside, behind him); T3.playerWalkSide rules out one side
  function obstaclesFor(A) {
    var L = ctx.layout, out = [], other = A === me ? mate : me, rA = radiusOf(A);
    var farBusy = (!(A === mate && mate.seat === 'far') && creatureHere()) || (A === me && mate.seat === 'far' && mate.shown && mate.fits);
    if (farBusy) {
      // the creature (or the person) across the table: the whole far side is theirs, he only goes as far as its corners
      out.push({ x: 0, z: -L.D / 2 - 1.95, r: 5.2 + rA, hard: true });
      out.push({ box: [-L.W / 2 + 0.3, L.W / 2 - 0.3, -1e9, -L.D / 2 - 0.4], hard: true });
    }
    if (other.shown && other.model && other.model.root.visible && !(other === mate && mate.seat === 'far')) out.push({ x: other.wk.x, z: other.wk.z, r: 0.88 * (radiusOf(other) + rA) + 0.2, hard: false });
    return out;
  }
  function inObs(o, x, z) { if (o.box) return x > o.box[0] && x < o.box[1] && z > o.box[2] && z < o.box[3]; var ox = x - o.x, oz = z - o.z; return ox * ox + oz * oz < o.r * o.r; }
  function sideOff(R, x) { return (WALK.side === 'right' && x < -R.ow + 0.01) || (WALK.side === 'left' && x > R.ow - 0.01); }

  // ----- reaching from a spot -----
  // Can he reach target T (world; the wrist's spot) from a spot on the ring facing it? Standing: a lean (and a small
  // step in); else on his tummy over the rim, sliding in up to slideMax. null if not.
  function reachPlan(A, p, T, slideMax) {
    var D = A.dims, s = A.place.s, dx = T.x - p.x, dz = T.z - p.z, d = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    var ang = Math.acos(clamp((dx * p.nx + dz * p.nz) / d, -1, 1)); if (ang > WALK.maxTurn) return null;
    var yaw = Math.atan2(dx, dz), F = d / s, Y = (T.y - A.place.y) / s, R = (D.L1 + D.L2) * WALK.stretch * 0.97, a, f;
    for (a = 0; a <= WALK.lean + 1e-6; a += 0.05) {
      for (f = 0; f <= WALK.fwd + 1e-6; f += WALK.fwd / 3) {
        var sy = D.SH_Y * Math.cos(a), sz = D.SH_Y * Math.sin(a) + f;
        if ((Y - sy) * (Y - sy) + (F - sz) * (F - sz) + 0.3 * D.SH_X * D.SH_X <= R * R) return { yaw: yaw, mode: 'stand', lean: a, fwd: f, sl: 0, cost: 0.25 * a + 0.15 * ang };
      }
    }
    // how far in (his units) the waist must go to reach it with the body pitched forward by p and lifted by lift
    function need(p, lift) { var dy = Y - (lift + D.SH_Y * Math.cos(p)); if (Math.abs(dy) >= R) return null; return Math.max(0, F - D.SH_Y * Math.sin(p) - Math.sqrt(R * R - dy * dy)); }
    var c = (0.55 + 0.86 * D.torsoX * s) / s, hipB = -D.hipY;   // ring -> outer rim; waist -> hip joints (his units)
    // on his tummy over the rim, hips still outside it, legs hanging down the side of the table
    var sF = need(WALK.flopP, flopLift(A));
    if (sF != null && sF - hipB * Math.sin(WALK.flopP) <= c - 0.35) return { yaw: yaw, mode: 'flop', p: WALK.flopP, lift: flopLift(A), lean: 0, fwd: 0, sl: sF, cost: 0.12 + 0.08 * sF + 0.15 * ang };
    // further: he climbs up onto the table on his knees, one hand on the felt
    var pC = WALK.crawlP, lC = crawlLift(A, pC), sC = need(pC, lC), short = 0;
    if (sC == null) return null;
    sC = Math.max(sC, c + 0.25 + hipB * Math.sin(pC));                          // knees on the felt, just inside the rim
    if (sC > slideMax) { if (slideMax < 50) return null; short = sC - 6; sC = 6; }
    // kneeling on the table seen from behind (facing away from the seat camera) reads as standing on the felt, and it
    // hides the middle of the table: from the side (in profile) it reads as kneeling and only covers the table's edge
    var away = Math.max(0, -Math.cos(yaw) - 0.7) / 0.3;
    return { yaw: yaw, mode: 'crawl', p: pC, lift: lC, lean: 0, fwd: 0, sl: sC, cost: 0.28 + 0.06 * sC + 0.15 * ang + short + 3 * away * away };
  }
  function crawlLift(A, p) {
    // root (waist) height kneeling on the felt with the thighs upright and the body pitched forward by p
    var D = A.dims, s = A.place.s, y = 0.03 + (D.thigh + 0.18 * D.legR) * s + (-D.hipY) * s * Math.cos(p);
    return (y - A.place.y) / s;
  }

  // ----- planning: where to grab, where to drop, which way round -----
  function planTrip(A, S, Tg, Tp, slideMax, quick) {
    var R = ringOf(A), N = Math.max(16, Math.round(R.L / WALK.h)), h = R.L / N, obs = obstaclesFor(A), s = A.place.s, k, j;
    var pts = [], blk = new Uint8Array(N), soft = new Uint8Array(N), pb = new Int32Array(2 * N + 1), ps = new Int32Array(2 * N + 1);
    for (k = 0; k < N; k++) {
      var p = ringPt(R, k * h); pts.push(p);
      if (sideOff(R, p.x)) blk[k] = 1;
      for (j = 0; j < obs.length; j++) { var o = obs[j]; if (inObs(o, p.x, p.z)) { if (o.hard) blk[k] = 1; else soft[k] = 1; } }
    }
    for (k = 0; k < 2 * N; k++) { pb[k + 1] = pb[k] + blk[k % N]; ps[k + 1] = ps[k] + soft[k % N]; }
    // flags strictly after i up to and including j, going +1 (or -1)
    function cnt(pr, i, j, dir) {
      if (i === j) return 0;
      if (dir > 0) { var e = j > i ? j : j + N; return pr[e + 1] - pr[i + 1]; }
      var e2 = i > j ? i : i + N; return pr[e2] - pr[j];
    }
    function rd(i, j) {
      // the way round from sample i to sample j: { d, dir, soft } or null
      if (i === j) return { d: 0, dir: 1, soft: 0 };
      var dp = ((j - i + N) % N) * h, dn = R.L - dp, best = null;
      [[1, dp], [-1, dn]].forEach(function (c) {
        if (cnt(pb, i, j, c[0])) return;
        var sf = cnt(ps, i, j, c[0]), dd = c[1] + sf * h * 1.6 + (sf ? 3 * s : 0);   // going round someone: a detour
        if (!best || dd < best.d) best = { d: dd, dir: c[0], soft: sf, len: c[1] };
      });
      return best;
    }
    function nearest(x, z) { return Math.round(ringU(R, x, z) / h) % N; }
    var iS = nearest(S.x, S.z), offS = Math.hypot(S.x - pts[iS].x, S.z - pts[iS].z), H = homeOf(A), iH = nearest(H.x, H.z), offH = Math.hypot(H.x - pts[iH].x, H.z - pts[iH].z);
    var vq = runSpeed(A, quick), vb = WALK.vBack * s;
    function tw(d, v) { return d < 0.05 ? 0 : d / v + 0.15; }
    var gl = [], pl = [];
    // grab from right where he stands (e.g. the mate's seat beside the table)
    if (offS > 0.3) { var g0 = reachPlan(A, { x: S.x, z: S.z, nx: pts[iS].nx, nz: pts[iS].nz }, Tg, slideMax); if (g0) gl.push({ i: -1, p: { x: S.x, z: S.z }, plan: g0 }); }
    for (k = 0; k < N; k++) {
      if (blk[k] || soft[k]) continue;
      var gp = reachPlan(A, pts[k], Tg, slideMax); if (gp) gl.push({ i: k, p: pts[k], plan: gp });
      var pp = reachPlan(A, pts[k], Tp, slideMax); if (pp) pl.push({ i: k, p: pts[k], plan: pp });
    }
    var best = null;
    for (var a = 0; a < gl.length; a++) {
      var G1 = gl[a], dSG = G1.i < 0 ? { d: 0, dir: 1, len: 0 } : rd(iS, G1.i); if (!dSG) continue;
      var t1 = tw(G1.i < 0 ? 0 : offS + dSG.d, vq) + (G1.plan.mode === 'flop' ? WALK.tGrabF : WALK.tGrab) + G1.plan.cost;
      if (best && t1 >= best.t) continue;
      for (var b = 0; b < pl.length; b++) {
        var P1 = pl[b], from = G1.i < 0 ? iS : G1.i, dGP = rd(from, P1.i); if (!dGP) continue;
        var dBack = rd(P1.i, iH), t = t1 + tw((G1.i < 0 ? offS : 0) + dGP.d, vq) + (P1.plan.mode === 'flop' ? WALK.tPlaceF : WALK.tPlace) * 0.75 + P1.plan.cost + 0.3 * tw(dBack ? dBack.d + offH : 40, vb);
        if (!best || t < best.t) best = { t: t, G: G1, P: P1, dSG: dSG, dGP: dGP };
      }
    }
    if (!best) return null;
    best.R = R; best.pts = pts; best.N = N; best.h = h; best.obs = obs; best.iS = iS; best.offS = offS; best.iH = iH; best.offH = offH; best.rd = rd; best.nearest = nearest;
    return best;
  }
  // a walkable polyline along the ring from sample i to sample j (way dir), from / to points off the ring if given,
  // going round soft obstacles on the outside
  function ringPath(pl, i, j, dir, from, to) {
    var R = pl.R, N = pl.N, pts = [], k, it, n = 0;
    if (from) pts.push([from.x, from.z]);
    if (i >= 0) { for (k = i; ; k = (k + dir + N) % N) { pts.push([pl.pts[k].x, pl.pts[k].z]); if (k === j || ++n > N) break; } }
    if (to) pts.push([to.x, to.z]);
    var soft = pl.obs.filter(function (o) { return !o.hard; });
    for (var q = 0; q < pts.length; q++) {
      if ((q === 0 && from) || (q === pts.length - 1 && to)) continue;
      for (it = 0; it < soft.length; it++) {
        var o = soft[it], P = pts[q], rp = ringPt(R, ringU(R, P[0], P[1])), ox = o.x - P[0], oz = o.z - P[1];
        var along = -(ox * rp.nx + oz * rp.nz), perp2 = ox * ox + oz * oz - along * along;   // outward = -n
        if (perp2 >= o.r * o.r) continue;
        var t = along + Math.sqrt(o.r * o.r - perp2) + 0.1;
        if (t > 0) { P[0] -= rp.nx * t; P[1] -= rp.nz * t; }
      }
    }
    // smooth the detours a little, never inside the ring
    for (it = 0; it < 4 && soft.length; it++) {
      for (q = 1; q < pts.length - 1; q++) {
        var a = pts[q - 1], b = pts[q + 1], m2 = [(a[0] + b[0] + 2 * pts[q][0]) / 4, (a[1] + b[1] + 2 * pts[q][1]) / 4];
        if (outlineDist(R, m2[0], m2[1]) >= R.c - 0.05) { pts[q][0] = m2[0]; pts[q][1] = m2[1]; }
      }
    }
    return mkPath(pts);
  }
  function mkPath(pts) {
    var cum = [0];
    for (var q = 1; q < pts.length; q++) cum.push(cum[q - 1] + Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]));
    return { pts: pts, cum: cum, len: cum[cum.length - 1] };
  }
  function pathAt(W, d, out) {
    var c = W.cum, P = W.pts, q = 1;
    if (P.length < 2) { out.x = P[0][0]; out.z = P[0][1]; out.tx = 0; out.tz = 0; return out; }
    d = clamp(d, 0, W.len);
    while (q < c.length - 1 && c[q] < d) q++;
    var sg = c[q] - c[q - 1] || 1e-6, k = (d - c[q - 1]) / sg, a = P[q - 1], b = P[q];
    out.x = a[0] + (b[0] - a[0]) * k; out.z = a[1] + (b[1] - a[1]) * k; out.tx = (b[0] - a[0]) / sg; out.tz = (b[1] - a[1]) / sg; return out;
  }
  function walkSeg(path, v, endYaw, s, back) {
    return { k: 'walk', path: path, T: path.len < 0.05 ? 0 : path.len / v + 0.15, endYaw: endYaw, side: path.len < 1.6 * s, back: !!back };
  }

  // ----- a move -----
  function buildTrip(A, id, zone, m, sl, rest, quick, fin) {
    var s = A.place.s, D = A.dims, cs = m.scale.x, above = 0.5 * cs + 0.26 * D.handS * s;
    var Tg = new THREE.Vector3(rest.x, rest.y + above, rest.z), slotW = new THREE.Vector3(sl.x, 0.5 * cs, sl.z), Tp = new THREE.Vector3(sl.x, slotW.y + above, sl.z);
    var S = { x: A.wk.x, z: A.wk.z };
    var pl = planTrip(A, S, Tg, Tp, WALK.slideMax, quick) || planTrip(A, S, Tg, Tp, WALK.slideMax * 2.2, quick) || planTrip(A, S, Tg, Tp, 99, quick);
    if (!pl) return null;
    var q = quick ? WALK.quickT : 1, vq = runSpeed(A, quick), segs = [];
    var G1 = pl.G, P1 = pl.P;
    if (G1.i >= 0) { var w1 = ringPath(pl, pl.iS, G1.i, pl.dSG.dir, pl.offS > 0.05 ? S : null, null); if (w1.len > 0.05) segs.push(walkSeg(w1, vq, G1.plan.yaw, s)); }
    segs.push({ k: 'grab', x: G1.p.x, z: G1.p.z, plan: G1.plan, T: (G1.plan.mode === 'flop' ? WALK.tGrabF : WALK.tGrab) * q, tgt: Tg });
    var w2 = G1.i < 0 ? ringPath(pl, pl.iS, P1.i, pl.dGP.dir, S, null) : ringPath(pl, G1.i, P1.i, pl.dGP.dir, null, null);
    if (w2.len > 0.05) segs.push(walkSeg(w2, vq, P1.plan.yaw, s));
    segs.push({ k: 'place', x: P1.p.x, z: P1.p.z, plan: P1.plan, T: (P1.plan.mode === 'flop' ? WALK.tPlaceF : WALK.tPlace) * q, tgt: Tp });
    if (w2.len <= 0.05 && (G1.plan.mode === 'stand') === (P1.plan.mode === 'stand')) {
      // grab and drop from the same spot: he stays down (leaning / on his tummy) in between
      var gS = segs[segs.length - 2], pS = segs[segs.length - 1]; gS.holdOut = true; pS.holdIn = true; gS.T *= 0.8; pS.T *= 0.85;
    }
    if (quick) segs.push({ k: 'wait', x: P1.p.x, z: P1.p.z, T: WALK.linger });
    var tRel = 0; for (var i = 0; i < segs.length; i++) { if (segs[i].k === 'place') { tRel += segs[i].T * 0.75; break; } tRel += segs[i].T; }
    return { id: id, m: m, zone: zone, fin: fin, segs: segs, i: 0, t0: performance.now(), u: 0, phase: 'move', arm: 0, above: above, slotW: slotW,
      picked: false, released: false, qBase: m.quaternion.clone(), cube0: new THREE.Vector3().copy(rest), quick: !!quick, tRel: tRel, plan: pl };
  }
  function startTask(A, id, zone, done, opts) {
    var fired = false;
    function fin() { if (fired) return; fired = true; try { done && done(); } catch (e) { console.warn(e); } }
    try {
      if (A.trip && !A.trip.released) finishNow(A);
      var m = ctx.meshes[id], L = ctx.layout, sl = L && slotFor(id, zone);
      if (!A.model || !A.shown || !A.fits || !A.model.root.visible || document.hidden || !m || !m.visible || !sl || ctx.held != null) { fin(); return; }
      if (!A.trip) syncHome(A);
      if (A.g) A.g = null;                                                   // a reaction in progress gives way
      // where the cube rests (its slot target: a cube that was lifted as "selected" is just settling back down)
      var rest = m.userData.tpos && ctx.held !== id ? m.userData.tpos : m.position;
      var T = buildTrip(A, id, zone, m, sl, rest, opts && opts.quick, fin);
      if (!T) { fin(); return; }
      if (A.trip) clearTimeout(A.trip.timer);
      A.trip = T;
      T.timer = setTimeout(function () { if (A.trip === T) finishNow(A); else fin(); }, Math.max(WALK.safety, T.tRel * 1000 + 1500));
      A.settled = false; ctx.dirty(); ctx.startLoop();
    } catch (e) { console.warn('playerMove', e); try { finishNow(A); } catch (e2) {} fin(); }
  }
  function pickUp(T) {
    if (T.picked) return; T.picked = true; ctx.dropAnims(T.m); ctx.held = T.id; T.qBase.copy(T.m.quaternion); T.cube0.copy(T.m.position);
    if (typeof Snd !== 'undefined' && Snd.pickup) Snd.pickup();
  }
  function release(T) {
    if (T.released) return; T.released = true;
    clearTimeout(T.timer);
    if (ctx.held === T.id) ctx.held = null;
    ctx.dropAnims(T.m); T.m.position.copy(T.slotW); T.m.quaternion.copy(T.qBase);
    T.m.userData.dropped = true;
    T.fin();
    // if nobody re-synced the table (the game did not place the cube), put it back where the game says it is
    var m = T.m; setTimeout(function () { if (m.userData.dropped && T3.sync && T3.lastG && ctx.held !== T.id) { try { T3.sync(T3.lastG); } catch (e) {} } }, 700);
  }
  // finish the move now: the cube goes into its slot at once and done() fires; he then walks back from where he is
  // (snap: straight home, e.g. hidden)
  function finishNow(A, snap) {
    var T = A.trip; if (!T) return false;
    var had = !T.released;
    if (had) release(T);
    if (ctx.held === T.id) ctx.held = null;
    if (snap) { A.trip = null; syncHome(A); A.wk.yaw = A.wk.yawT; A.wk.spd = 0; for (var k in A.cur) A.cur[k] = 0; }
    else if (T.phase === 'move') toReturn(A, T);
    ctx.dirty(); ctx.startLoop();
    return had;
  }
  function syncHome(A) { var H = homeOf(A); A.wk.x = A.wk.px = H.x; A.wk.z = A.wk.pz = H.z; A.wk.yawT = H.yaw; if (!A.wk.ok) { A.wk.yaw = H.yaw; A.wk.ok = true; } }
  // the walk back to his seat, from wherever he is
  function toReturn(A, T) {
    var H = homeOf(A), s = A.place.s, R = ringOf(A), N = Math.max(16, Math.round(R.L / WALK.h)), h = R.L / N;
    T.phase = 'back'; T.i = 0; T.t0 = performance.now(); T.home = H;
    if (Math.hypot(A.wk.x - H.x, A.wk.z - H.z) < 0.05) { T.segs = [{ k: 'wait', x: H.x, z: H.z, T: 0.01 }]; return; }
    var path;
    var obs = obstaclesFor(A), pts = [], blk = [], soft = [];
    var ctxp = { R: R, N: N, h: h, obs: obs, pts: pts };
    for (var k = 0; k < N; k++) { var p = ringPt(R, k * h); pts.push(p); blk.push(sideOff(R, p.x) || obs.some(function (o) { return o.hard && inObs(o, p.x, p.z); })); }
    var iS = Math.round(ringU(R, A.wk.x, A.wk.z) / h) % N, iH = Math.round(ringU(R, H.x, H.z) / h) % N, dir = 1, ok = [true, true];
    [1, -1].forEach(function (d, di) { for (var n = (iS + d + N) % N, c = 0; c < N; n = (n + d + N) % N, c++) { if (blk[n] && n !== iH) { ok[di] = false; break; } if (n === iH) break; } });
    var dp = ((iH - iS + N) % N), dn = N - dp;
    dir = ok[0] && (!ok[1] || dp <= dn) ? 1 : ok[1] ? -1 : (dp <= dn ? 1 : -1);
    var from = { x: A.wk.x, z: A.wk.z }, offH = Math.hypot(H.x - pts[iH].x, H.z - pts[iH].z);
    path = ringPath(ctxp, iS, iH, dir, from, offH > 0.05 ? { x: H.x, z: H.z } : null);
    T.segs = [walkSeg(path, WALK.vBack * s, H.yaw, s, true)];
  }
  function tripEnd(A, T) {
    // all segments done: a move goes on to the walk back; back home (or the seat moved meanwhile: walk on)
    if (T.phase === 'move') { toReturn(A, T); return; }
    var H = homeOf(A);
    if (Math.hypot(H.x - A.wk.x, H.z - A.wk.z) > 0.3) { toReturn(A, T); return; }
    clearTimeout(T.timer); A.trip = null; syncHome(A);
  }
  function segEnd(A, T, g) { if (g.k === 'grab') pickUp(T); else if (g.k === 'place') release(T); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { finishNow(me, true); finishNow(mate, true); } });

  // the trip's pose for this frame (before smoothing): where he is, which way he faces, lean / tummy, arm targets
  var PA = { x: 0, z: 0, tx: 0, tz: 0 };
  function tripPose(A, T, now) {
    var u = (now - T.t0) / 1000, guard = 0;
    while (T.segs[T.i] && u >= T.segs[T.i].T && guard++ < 20) {
      var g0 = T.segs[T.i]; segEnd(A, T, g0); u -= g0.T; T.t0 += g0.T * 1000; T.i++;
      if (!T.segs[T.i]) { tripEnd(A, T); if (A.trip !== T) return false; u = (now - T.t0) / 1000; }
    }
    var g = T.segs[T.i]; if (!g) return false;
    T.u = u; T.g = g;
    var W = A.wk, P = A.P, s = A.place.s, k = g.T > 0 ? clamp(u / g.T, 0, 1) : 1;
    if (g.k === 'walk') {
      var r = Math.min(0.4, 0.15 / Math.max(g.T, 0.01)), vm = 1 / (1 - r), f;
      f = k < r ? 0.5 * vm * k * k / r : k > 1 - r ? 1 - 0.5 * vm * (1 - k) * (1 - k) / r : vm * (r / 2 + k - r);
      var d = f * g.path.len; pathAt(g.path, d, PA);
      W.x = PA.x; W.z = PA.z;
      var rem = g.path.len - d, ty = (PA.tx || PA.tz) ? Math.atan2(PA.tx, PA.tz) : W.yawT;
      if (g.side && g.endYaw != null) W.yawT = g.endYaw;
      else if (g.endYaw != null && rem < 1.2 * s) W.yawT = ty + wrap(g.endYaw - ty) * (1 - rem / (1.2 * s));
      else W.yawT = ty;
      P.headPitch += -0.12;
      face(A, { smile: 0.3, browUp: 0.15 }, 1);
    } else {
      W.x = g.x; W.z = g.z;
      if (g.plan) {
        W.yawT = g.plan.yaw;
        var grab = g.k === 'grab', wb = grab ? sstep(k / 0.45) * (g.holdOut ? 1 : 1 - sstep((k - 0.72) / 0.28)) : (g.holdIn ? 1 : sstep(k / 0.5)) * (1 - sstep((k - 0.78) / 0.22));
        if (g.plan.mode !== 'stand') {
          // up first (lift leads), then in over the rim (slide follows), so the hips never dip into the table's edge
          P.flop += wb; P.pitch += g.plan.p * wb; P.slide += g.plan.sl * wb * wb * wb; P.lift += g.plan.lift * Math.min(1, wb * 1.6); P.headPitch += -0.25 * wb;
          if (g.plan.mode === 'crawl') P.crawl += wb;
        }
        else { P.lean += g.plan.lean * wb; P.fwd += g.plan.fwd * wb; P.headPitch += 0.2 * wb; }
        face(A, { gazeY: -0.55, browUp: 0.2, big: grab ? 0 : 0.35 * wb }, 1);
      }
    }
    // the arms that are not reaching: swing while he runs, the cube hand holds it at his side
    var run = clamp(W.spd / (0.5 * WALK.v * s), 0, 1), ai = T.arm, holding = T.picked && !T.released;
    for (var i = 0; i < 2; i++) {
      var ph = W.ph + i * Math.PI, AR = A.arm[i];
      if (i === ai && holding) { carryPose(A, i, tv); tv.y += 0.05 * run * Math.abs(Math.cos(W.ph)); AR.des.copy(tv); AR.dAl = 0.6; AR.dOp = 0.1; }
      else if (!A.g) { tv.set(AR.rest.x, AR.rest.y + 0.3 * run * Math.abs(Math.sin(ph)), AR.rest.z - 0.65 * run * Math.sin(ph)); AR.des.copy(tv); }
    }
    return true;
  }
  // after the body is posed: the reaching hand goes straight to its target (anchored to the table), the free hand
  // props him up while he lies on the table, the cube rides in the hand
  var C1 = new THREE.Vector3(), C2 = new THREE.Vector3(), CH = new THREE.Vector3(), HW = new THREE.Vector3(), CW = new THREE.Vector3();
  // the cube hand while he walks: low at that hand's side, a little forward (chest space), so the cube is never over
  // the table while he stands at its edge (while he is still bent forward / getting up, the point is turned back)
  function carryPose(A, i, out) {
    var p = Math.max(0, A.cur.pitch) + Math.max(0, A.cur.lean), cp = Math.cos(p), sp = Math.sin(p);
    out.set(-1.15 * (i ? -1 : 1), 0.85 * cp + 0.45 * sp, -0.85 * sp + 0.45 * cp); return mapArm(A, out);
  }
  // a hand (wrist) target over the table stays high enough that the cube under it clears the felt and the rim
  function aboveTable(T, v) {
    var L = ctx.layout, cs = T.m.scale.x, mg = 0.5 * cs + 0.1;
    if (Math.abs(v.x) > L.W / 2 + 0.55 + mg || Math.abs(v.z) > L.D / 2 + 0.55 + mg) return v;
    var onFelt = Math.abs(v.x) < L.W / 2 - mg && Math.abs(v.z) < L.D / 2 - mg;
    v.y = Math.max(v.y, (onFelt ? 0.5 * cs : 0.62 + 0.5 * cs) + T.above);
    return v;
  }
  function tripArm(A, T, dt) {
    var m = A.model, g = T.g, ai = T.arm, R = A.arm[ai], arm = m.arms[ai], s = A.place.s;
    if (!g) return;
    m.root.updateMatrixWorld(true); inv.copy(m.chest.matrixWorld).invert();
    if ((g.k === 'grab' || g.k === 'place') && g.plan) {
      var k = g.T > 0 ? clamp(T.u / g.T, 0, 1) : 1, grab = g.k === 'grab', k1 = 0.5, k2 = grab ? 0.68 : 0.75, e, eh, open, align, low = g.plan.mode !== 'stand';
      // the path is worked out in the world (anchored to the table): from where the hand was, up first and then over
      // to above the cube / slot, down to it, and back up
      if (!g.startW) { g.startW = R.goal.clone().applyMatrix4(m.chest.matrixWorld); g.op0 = R.op; g.al0 = R.al; }
      C1.copy(g.tgt); C1.y += 0.3 * s; C2.copy(g.tgt);
      if (k < k1) {
        e = easeIO(k / k1); eh = sstep(k / k1 * 1.6);
        CW.set(lerp(g.startW.x, C1.x, e), lerp(g.startW.y, C1.y, eh) + 0.15 * s * Math.sin(Math.PI * e), lerp(g.startW.z, C1.z, e));
        open = grab ? lerp(g.op0, 1, e) : 0.1; align = lerp(g.al0, 1, e);
      } else if (k < k2) { e = easeIO((k - k1) / (k2 - k1)); CW.lerpVectors(C1, C2, e); open = grab ? 1 : 0.1; align = 1; }
      else {
        e = easeIO((k - k2) / (1 - k2));
        if (grab) {
          // after the grab the cube comes straight up off the felt; standing, he then brings it in to his side
          if (low) CW.lerpVectors(C2, C1, e);
          else {
            carryPose(A, ai, tv); tv.applyMatrix4(m.chest.matrixWorld); var eu = sstep(e / 0.45), eo = sstep((e - 0.3) / 0.7);
            CW.set(lerp(C2.x, tv.x, eo), lerp(lerp(C2.y, C1.y, eu), tv.y, eo), lerp(C2.z, tv.z, eo));
          }
          open = lerp(1, 0.1, sstep((k - k2) / 0.08)); align = lerp(1, 0.6, e);
        } else { CW.lerpVectors(C2, C1, e); open = lerp(0.1, 0.8, sstep((k - k2) / 0.12)); align = lerp(1, 0.4, e); }
      }
      if (T.picked && !T.released) aboveTable(T, CW);
      if (k >= k2) { if (grab) pickUp(T); else release(T); }
      CH.copy(CW).applyMatrix4(inv);
      arm.open = open; arm.solve(CH.x, CH.y, CH.z, align, 0);
      R.goal.copy(CH); R.des.copy(CH); R.al = R.dAl = align; R.op = R.dOp = open;
      // the other hand on the felt while he is up on the table (tummy on the rim, or kneeling)
      var fl = clamp(A.cur.flop, 0, 1);
      if (low && fl > 0.02) {
        var fi = 1 - ai, FR = A.arm[fi], fa = m.arms[fi], sg = fi ? 1 : -1, fx = Math.sin(A.wk.yaw), fz = Math.cos(A.wk.yaw), reach = (g.plan.sl + A.dims.SH_Y * Math.sin(g.plan.p) + 0.45) * s;
        C1.set(A.wk.x + fx * reach + fz * sg * 0.9 * s, 0.05 + 0.26 * A.dims.handS * s, A.wk.z + fz * reach - fx * sg * 0.9 * s).applyMatrix4(inv);
        FR.goal.lerp(C1, fl); FR.des.copy(FR.goal); fa.open = 1; fa.solve(FR.goal.x, FR.goal.y, FR.goal.z, 0.9, 0);
      }
      // the cube: picked up from where it lies, and set down exactly in its slot
      if (T.picked && !T.released) {
        HW.copy(arm.pos).applyMatrix4(m.chest.matrixWorld); HW.y -= T.above;
        if (grab) T.m.position.lerpVectors(T.cube0, HW, sstep((k - k2) / 0.15));
        else T.m.position.lerpVectors(HW, T.slotW, sstep((k - (k2 - 0.18)) / 0.18));
        T.m.quaternion.copy(T.qBase);
      }
      return;
    }
    if (T.picked && !T.released) {
      // walking with it: the hand follows its carry pose (smoothed); over the table edge it is kept up
      HW.copy(R.goal).applyMatrix4(m.chest.matrixWorld);
      if (aboveTable(T, HW.clone()).y !== HW.y) { aboveTable(T, HW); CH.copy(HW).applyMatrix4(inv); R.goal.copy(CH); arm.solve(CH.x, CH.y, CH.z, R.al, 0); }
      HW.copy(arm.pos).applyMatrix4(m.chest.matrixWorld); HW.y -= T.above; T.m.position.copy(HW); T.m.quaternion.copy(T.qBase);
    }
  }

  // ---------- per frame ----------
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function update(now) {
    if (needPlace && ctx.layout) computePlace();   // right after a camera fit, even while hidden (the view has no offsets yet)
    if (mate.seat === 'far' && mate.shown && mate.model) {
      // a creature arriving or leaving across the table hides / shows him
      var f = !creatureHere(); if (f !== mate.fits) { mate.fits = f; applyVis(); }
    }
    step(me, now); step(mate, now);
  }
  function step(A, now) {
    if (!A.model || !A.shown || !A.model.root.visible) { A.lastNow = now; if (A.trip) finishNow(A, true); syncHome(A); return; }
    var dt = clamp((now - A.lastNow) / 1000, 0.001, 0.05); A.lastNow = now;
    if (document.hidden && A.g) A.g = null;
    if (document.hidden && A.trip) finishNow(A, true);
    var P = A.P, F = A.F, i, k, W = A.wk;
    for (k in P) P[k] = 0; P.headPitch = 0.22;
    for (k in F) F[k] = 0; F.lid = 0.95;
    for (i = 0; i < 2; i++) { A.arm[i].des.copy(A.arm[i].rest); A.arm[i].dAl = 0.2; A.arm[i].dOp = 0.35; }
    if (A.g) {
      var d = GEST[A.g.n], u = (now - A.g.t0) / 1000, fd = 1;
      if (A.g.fade) fd = 1 - sstep((now - A.g.fade) / 450);
      if (u > A.g.dur || fd <= 0) A.g = null;
      else d.fn(A, u, env(u, A.g.dur, d.att, d.rel) * fd, A.g.opts);
    }
    var T = A.trip;
    if (T && !tripPose(A, T, now)) T = null;
    if (!A.trip) { T = null; syncHome(A); }
    if (A === mate && mate.seat === 'far' && !T) P.headPitch += FAR.look;   // across the table he looks up toward the camera, so his face shows
    // how fast he really moves (legs, arm swing) and which way he faces
    var mv = Math.hypot(W.x - W.px, W.z - W.pz); W.px = W.x; W.pz = W.z;
    W.spd += (mv / dt - W.spd) * (1 - Math.exp(-14 * dt)); if (!T && W.spd < 0.05) W.spd = 0;
    W.ph += mv / (WALK.stride * A.place.s) * Math.PI;
    var wy = wrap(W.yawT - W.yaw); W.yaw += wy * (1 - Math.exp(-(T ? 16 : 10) * dt)); if (Math.abs(wy) < 1e-4) W.yaw = W.yawT;
    var run = clamp(W.spd / (0.5 * WALK.v * A.place.s), 0, 1);
    P.lean += 0.16 * run; P.twist += 0.1 * run * Math.sin(W.ph); P.hop += 0.09 * run * Math.abs(Math.cos(W.ph));
    // smooth everything toward the targets (calm follow-through, never a snap; quicker while he moves a cube)
    var kb = 1 - Math.exp(-(T ? 24 : 14) * dt), ka = 1 - Math.exp(-(T ? 18 : 10) * dt), kf = 1 - Math.exp(-12 * dt), moving = !!A.g || !!T || W.spd > 0 || W.yaw !== W.yawT, cur = A.cur, Fc = A.Fc;
    while (cur.spin - P.spin > Math.PI) cur.spin -= TAU; while (P.spin - cur.spin > Math.PI) cur.spin += TAU;   // a finished turn is the same as none
    for (k in cur) { var df = P[k] - cur[k]; if (Math.abs(df) > 1e-4) { moving = true; cur[k] += df * kb; } else cur[k] = P[k]; }
    for (k in Fc) { var dff = F[k] - Fc[k]; if (Math.abs(dff) > 1e-3) moving = true; Fc[k] += dff * kf; }
    for (i = 0; i < 2; i++) {
      var AR = A.arm[i]; if (AR.goal.distanceToSquared(AR.des) > 1e-6) moving = true;
      AR.goal.lerp(AR.des, ka); AR.al += (AR.dAl - AR.al) * ka; AR.op += (AR.dOp - AR.op) * ka;
    }
    // an occasional single blink (only when nothing else is going on with his eyes closed)
    if (!A.nextBlink) A.nextBlink = now + rnd(2500, 6000);
    if (now >= A.nextBlink) { A.blinkT0 = now; A.nextBlink = now + rnd(3800, 7500); }
    var bt = (now - A.blinkT0) / 1000, blink = bt < 0 ? 0 : bt < 0.07 ? bt / 0.07 : bt < 0.11 ? 1 : bt < 0.24 ? 1 - (bt - 0.11) / 0.13 : 0;
    if (blink > 0 || bt < 0.3) moving = true;
    // apply
    var m = A.model, R = m.root, D = A.dims, s = A.place.s, fl = clamp(cur.flop, 0, 1);
    // legs: a crouch bends hips and knees (feet stay put), a kneel folds the shins back onto the pitch; running swings
    // them (stride matched to the ground speed); lying on the table they fold up behind him, feet in the air
    var ca = clamp(cur.crouch, 0, 1) * 0.85, kn = clamp(cur.kneel, 0, 1) * Math.PI / 2;
    var dropL = (D.thigh + D.shin) * (1 - Math.cos(ca)) + (D.shin + 0.13) * (1 - Math.cos(kn)) - 0.17 * D.legR * Math.sin(kn);
    var rl = run * (1 - fl), h0 = -0.75 * rl * Math.sin(W.ph), h1 = -h0, k0 = rl * (0.2 + 1.1 * Math.max(0, Math.cos(W.ph))), k1 = rl * (0.2 + 1.1 * Math.max(0, -Math.cos(W.ph)));
    // on his tummy: while his hips are still outside the rim his legs hang down the side of the table, feet off the
    // ground; further in, they lie out behind him with the feet up
    // thighs stay upright in the world (hanging down the table's side, or kneeling on the felt with the shins flat behind)
    var cr = clamp(cur.crawl, 0, 1), pit = Math.max(0, cur.pitch);
    m.setKnees(-ca + h0 - pit + 0.2 * fl, -ca + h1 - pit + 0.3 * fl, 2 * ca + kn + k0 + 0.35 * (fl - cr) + 1.5 * cr, 2 * ca + kn + k1 + 0.2 * (fl - cr) + 1.62 * cr);
    var rot = W.yaw + cur.spin, fx = Math.sin(W.yaw), fz = Math.cos(W.yaw), fw = (clamp(cur.fwd, 0, 0.75) + Math.max(0, cur.slide)) * s, sw = cur.side * s;
    // fwd: a step toward the way he faces; side: a step along his own left (+) / right (-)
    R.position.set(W.x + fx * fw + fz * sw, A.place.y + (cur.hop - dropL * (1 - fl) + Math.max(0, cur.lift)) * s, W.z + fz * fw - fx * sw);
    if (R.rotation.order !== 'YXZ') R.rotation.order = 'YXZ';
    R.rotation.set(pit, rot, 0); R.scale.setScalar(s);
    m.body.rotation.set(cur.lean + 0.25 * ca, cur.twist, 0);
    var hp = cur.headPitch;
    m.neck.rotation.set(hp * 0.45, cur.headYaw * 0.4, cur.headRoll * 0.4);
    m.head.rotation.set(hp * 0.55, cur.headYaw * 0.6, cur.headRoll * 0.6);
    for (i = 0; i < 2; i++) {
      var a = m.arms[i]; a.setShoulderLift(cur.shrug); a.open = A.arm[i].op;
      a.solve(A.arm[i].goal.x, A.arm[i].goal.y, A.arm[i].goal.z, A.arm[i].al, 0);
    }
    if (T && A.trip === T) tripArm(A, T, dt);
    var lid = Fc.lid * (1 - blink);
    m.setFace({ mouth: { big: Fc.big, smile: Fc.smile, hmm: Fc.hmm, o: Fc.o, shout: Fc.shout }, lid: lid, squint: Fc.squint, wide: Fc.wide, browUp: Fc.browUp, browTilt: Fc.browTilt, browAsym: Fc.browAsym, gazeX: Fc.gazeX, gazeY: Fc.gazeY });
    // only ask for frames while something is happening; at rest he is still
    if (moving) { A.settled = false; ctx.dirty(); }
    else if (!A.settled) { A.settled = true; ctx.dirty(); }
  }
  ctx.hooks.frame.push(update);
  // the camera was fitted again (resize / layout): find the spots on the next frame, when the camera is in place.
  // A grown-up across the table (no creature) asks to be kept in view, like a creature does.
  ctx.hooks.extents.push(function (corners, W, D) {
    needPlace = true;
    // his seat below the near rim needs a band of room at the bottom of the picture: table.js calls this with the
    // camera already standing at its first guess, so the seat is worked out from that view
    if (me.shown && me.model && ctx.layout) {
      try { ctx.camera.updateMatrixWorld(); var b = seatFor(me, ctx.camera.position, ctx.layout); if (b) seatPoints(me, b, corners); } catch (e) {}
    }
    if (mate.seat === 'far' && mate.shown && mate.model && !creatureHere()) {
      var top = FLOOR_Y + (mate.dims.TOP - mate.dims.FOOT) * FAR.s + 0.2, z = -D / 2 - FAR.front;
      corners.push([-3.4, top, z], [3.4, top, z]);
    }
  });

  // ---------- public API ----------
  T3.playerMoods = function () { return NAMES.slice(); };
  T3.playerCelebrations = function () { return CELEBS.slice(); };
  // showing / hiding him or changing who stands there changes the room the camera keeps below the rim: refit
  function refitFor() { needPlace = true; if (ctx.layout) ctx.refit(); computePlace(); }
  T3.playerShow = function (on) {
    var was = me.shown; me.shown = !!on;
    if (me.shown) { var re = refreshAvatar(me); if (re || !was || needPlace || !me.placedOnce) refitFor(); else applyVis(); }
    else { me.g = null; finishNow(me, true); applyVis(); if (was && ctx.layout) ctx.refit(); }
    return me.shown && me.fits;
  };
  T3.playerRefresh = function () { if (me.model && refreshAvatar(me)) refitFor(); };
  T3.playerSet = function (o) {
    me.over = o ? Object.assign({}, o) : null;
    if (me.model && refreshAvatar(me)) { finishNow(me, true); refitFor(); }
  };
  T3.playerMood = function (m, opts) { startMood(me, m, opts); };
  T3.playerCelebrate = function (name) {
    if (CELEBS.indexOf(name) < 0) { var s = save(); name = (s.kit && CELEBS.indexOf(s.kit.celebrate) >= 0) ? s.kit.celebrate : 'jump'; }
    return startMood(me, name);
  };
  T3.mate = function (o) {
    var wasFar = mate.seat === 'far' && mate.shown;
    finishNow(mate, true);
    if (!o) {
      mate.shown = false; mate.g = null; mate.seat = null; applyVis();
      if (wasFar) ctx.refit();
      return false;
    }
    mate.over = Object.assign({ who: 'tata' }, o); mate.seat = o.seat === 'far' ? 'far' : 'left'; mate.shown = true;
    refreshAvatar(mate);
    if (mate.seat === 'far' || wasFar) ctx.refit();                // the camera keeps his head in view (calls the extents hook)
    computePlace();
    return mate.fits;
  };
  T3.mateMood = function (m, opts) { if (CELEBS.indexOf(m) >= 0 || NAMES.indexOf(m) >= 0 || !m) startMood(mate, m, opts); };
  // Moving a cube (same contract as T3.creatureMove): done() fires exactly once, at the release (~0.6 s), or at once
  // when he can't do it (3D off, hidden, not on screen, tab hidden, another cube in a hand); 2.5 s safety timeout.
  // opts.quick: about 20% faster (e.g. several Goal cubes in a row).
  T3.playerMove = function (id, zone, done, opts) { startTask(me, id, zone, done, opts); };
  T3.mateMove = function (id, zone, done, opts) { startTask(mate, id, zone, done, opts); };
  // finish any move right now (the cube lobs to its slot, done() fires); e.g. when the player taps during the reach
  T3.playerMoveFinish = function () { var a = finishNow(me), b = finishNow(mate); return a || b; };
  // which sides of the table they may walk round: 'auto' (both), 'right' (never the left side, e.g. a second creature
  // sits there), 'left'. Applies to both people. No argument: the current value.
  T3.playerWalkSide = function (side) { if (side === 'left' || side === 'right' || side === 'auto') WALK.side = side; return WALK.side; };
  // tuning / tests: T3.playerMoveTuning({ stretch, lean, fwd, safety }) ; no argument: the values
  T3.playerMoveTuning = function (o) { if (o) Object.keys(WALK).forEach(function (k) { if (typeof o[k] === typeof WALK[k]) WALK[k] = o[k]; }); return JSON.parse(JSON.stringify(WALK)); };
  T3.playerMoving = function () { return !!((me.trip && !me.trip.released) || (mate.trip && !mate.trip.released)); };
  T3.playerState = function () {
    function st(A) {
      var T = A.trip, g = T && T.segs[T.i];
      return { shown: A.shown, fits: A.fits, visible: !!(A.model && A.model.root.visible), who: A.who, mood: A.g ? A.g.n : null, scale: A.place.s, at: [A.place.x, A.place.z], rot: A.place.rot, headNDC: A.place.hd, drop: A.place.drop,
        pos: [A.wk.x, A.wk.z], yaw: A.wk.yaw, trip: T ? { phase: T.phase, seg: g ? g.k : null, segs: T.segs.map(function (q) { return q.k + (q.plan ? ':' + q.plan.mode : '') + '@' + q.T.toFixed(2); }), released: T.released, tRel: T.tRel } : null };
    }
    var o = st(me); o.rejected = why; o.quad = quad; o.mate = Object.assign(st(mate), { seat: mate.seat }); return o;
  };
  // tuning hook (no effect unless called): T3.playerSeat({ into, low, gap, hair }) then it refits; no argument: the values
  T3.playerSeat = function (o) {
    if (!o) return JSON.parse(JSON.stringify(SEAT));
    ['into', 'low', 'gap', 'hair'].forEach(function (k) { if (typeof o[k] === 'number') SEAT[k] = o[k]; });
    refitFor(); return JSON.parse(JSON.stringify(SEAT));
  };
  // debugging / previews: the model objects (read-only use please)
  T3.playerModels = function () { return { me: me.model, mate: mate.model }; };

  // ---------- portraits for the kit designer ----------
  var pv = { scene: null, cam: null, model: null, who: '', style: '', busy: false, next: {} };
  function pvStage() {
    if (pv.scene) return;
    pv.scene = new THREE.Scene();
    pv.scene.add(new THREE.HemisphereLight(0xffffff, 0x6f7f99, 0.8));
    var k1 = new THREE.DirectionalLight(0xffffff, 1.7); k1.position.set(-3, 6, 9); pv.scene.add(k1);
    var k2 = new THREE.DirectionalLight(0xffffff, 0.9); k2.position.set(3, 4, -9); pv.scene.add(k2);
    var rim = new THREE.DirectionalLight(0xfff1d6, 0.6); rim.position.set(6, 3, 2); pv.scene.add(rim);
    pv.cam = new THREE.PerspectiveCamera(26, 0.8, 0.1, 100);
  }
  function pvPose(sp) {
    if (!pv.model || pv.who !== sp.who) {
      if (pv.model) { pv.scene.remove(pv.model.root); disposeModel(pv.model); }
      pv.model = buildHuman({ dims: sp.dims, kit: sp.kit, num: sp.num, name: sp.name, look: sp.look, front: sp.front }); pv.scene.add(pv.model.root); pv.who = sp.who;
    } else { pv.model.setKit(sp.kit, sp.num, sp.name, sp.front); pv.model.setHair(sp.look.hair, sp.look.hairStyle); }
    var m = pv.model, tmp = new THREE.Vector3(), A = { dims: sp.dims };
    m.setKnees(0, 0, 0, 0); m.body.rotation.set(0, 0, 0); m.neck.rotation.set(0.04, 0, 0); m.head.rotation.set(0.05, 0, 0);
    m.root.position.set(0, 0, 0); m.root.scale.setScalar(1); m.root.updateMatrixWorld(true);
    for (var i = 0; i < 2; i++) { tmp.set(REST0[i][0] * 1.05, REST0[i][1], REST0[i][2] + 0.05); mapArm(A, tmp); m.arms[i].setShoulderLift(0); m.arms[i].open = 0.35; m.arms[i].solve(tmp.x, tmp.y, tmp.z, 0.2, 0); }
    m.setFace({ lid: 0.95 });
  }
  function pvShoot(o, size, view) {
    pvStage();
    var sp = specOf(o, 'main'); pvPose(sp);
    if (o && o.face) pv.model.setFace(o.face);                       // an expression, e.g. { mouth: { big: 1 }, squint: 0.4 }
    var D = sp.dims, m = pv.model, W = size, H = Math.round(size * 1.25);
    // view: 'front' (3/4 front, whole body), 'back', 'face' (head and shoulders), or { yaw, close } for any angle
    var vo = view && typeof view === 'object' ? view : null, close = vo ? !!vo.close : view === 'face';
    m.root.rotation.y = vo ? (vo.yaw || 0) : view === 'back' ? Math.PI + 0.35 : view === 'face' ? 0.25 : -0.45;
    m.root.updateMatrixWorld(true);
    pv.cam.aspect = W / H; pv.cam.updateProjectionMatrix();
    var top, bot;
    if (close) { var hc = D.NECK_Y + D.HEAD_UP; top = D.TOP + 0.35; bot = hc - D.HEAD_R * 1.9; }
    else { top = D.TOP + 0.15; bot = D.FOOT - 0.1; }
    var h = top - bot, cy = (top + bot) / 2, dist = (h / 2) / Math.tan(pv.cam.fov * Math.PI / 360) * 1.06;
    pv.cam.position.set(0, cy + dist * (close ? 0.05 : 0.12), dist); pv.cam.lookAt(0, cy, 0); pv.cam.updateMatrixWorld();
    pv.scene.environment = ctx.scene.environment || null;
    var r = ctx.renderer, rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.UnsignedByteType });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    var prev = r.getRenderTarget(), cc = new THREE.Color(), ca = r.getClearAlpha(), sh = r.shadowMap.enabled, px = new Uint8Array(W * H * 4), read;
    r.getClearColor(cc);
    try {
      r.shadowMap.enabled = false; r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(pv.scene, pv.cam);
      read = r.readRenderTargetPixelsAsync ? r.readRenderTargetPixelsAsync(rt, 0, 0, W, H, px) : (r.readRenderTargetPixels(rt, 0, 0, W, H, px), Promise.resolve(px));
    } catch (e) { read = Promise.reject(e); }
    finally { r.setRenderTarget(prev); r.setClearColor(cc, ca); r.shadowMap.enabled = sh; ctx.dirty(); }
    return read.then(function () {
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d'), img = g.createImageData(W, H), row = W * 4;
      for (var y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * row, (H - y) * row), y * row);   // GL rows are bottom-up
      g.putImageData(img, 0, 0); rt.dispose(); return cv.toDataURL('image/png');
    }, function (e) { rt.dispose(); throw e; });
  }
  // one picture at a time; a newer request for the same view replaces one that is still waiting (it then resolves to null)
  function pvPump() {
    var keys = Object.keys(pv.next);
    if (pv.busy || !keys.length) return;
    var job = pv.next[keys[0]]; delete pv.next[keys[0]]; pv.busy = true;
    Promise.resolve().then(function () { return pvShoot(job.o, job.size, job.view); })
      .catch(function (e) { console.warn('playerPortrait', e); return null; })
      .then(function (url) { pv.busy = false; job.done(url); setTimeout(pvPump, 16); });
  }
  T3.playerPortrait = function (o, size, view) {
    size = Math.max(64, Math.min(512, size | 0 || 220));
    return new Promise(function (res) {
      var k = JSON.stringify([view || 'front', size]);
      if (pv.next[k]) pv.next[k].done(null);
      pv.next[k] = { o: o || null, size: size, view: view || 'front', done: res }; setTimeout(pvPump, 0);
    });
  };
})();
