// Match-day atmosphere in 3D: the walk-out before a match, the toss for who sets the first Goal (a big coin for two
// players, the official red-cube roll for three), and the trophy lift on a podium after a big win.
// Plugs into the table through T3.ctx (js/three/table.js) like fireworks.js does, and moves the people through the
// public calls of player.js (T3.playerScript, T3.playerMood) and creatures.js (T3.creatureMood / creatureWith).
// The glue (captions, skip layer, buttons, the 2D versions, seeds and saving) is js/matchday.js; this file only
// animates. Every sequence plays once and settles; nothing loops; a skip ends it at once and leaves nothing behind.
//
//   T3.mdWalkOut(o, ev) -> { skip(), entered() } | null      o: { short, board, kick() } (kick = the creatures' entrance)
//       ev('cut') when the broadcast cuts to the wide shot, ev('end', { entered }) once at the end (also after skip()).
//   T3.mdToss(rec, o, ev) -> { skip() } | null                rec: { method: 'coin' | 'cubes', winner, spins, face, rolls }
//       o: { names: [...] }. ev('round', { r, roll }) after each cube round, ev('landed') when decided, ev('end') once.
//   T3.mdLift(info, ev) -> { photo(), end(), active() } | null   info: { kind: 'cup' | 'crown' | 'shield', metal, ribbon,
//       color, text, clap: [creature indexes] }. ev('peak') at the lift, ev('hold') when it has settled (~6 s).
//   T3.mdActive() -> name of the sequence on screen, or ''
//
// The camera: each sequence drives ctx.camera from a frame hook (after table.js has placed it, before the frame is
// drawn), then hands back with ctx.refit(), which puts the camera exactly on the fitted seat view again.
// The figures are far bigger than the stadium's tunnel and the creatures are upper bodies standing behind the table
// (they have no legs), so the kid (and Tata) walk out on the pitch, past the tunnel, while the creatures make their own
// entrance behind the far rim at the cut (see docs/handoff/matchday.md).
import * as THREE from 'three';
import { FLOOR_Y } from './environment.js';

(function boot(tries) {
  var T3 = window.T3;
  if (!T3) return;
  if (!T3.ctx || !T3.ctx.scene || !T3.ctx.camera || !T3.ctx.hooks) { if (tries < 80) setTimeout(function () { boot(tries + 1); }, 100); return; }
  install(T3, T3.ctx);
})(0);

function install(T3, ctx) {
  var seq = null;                 // the sequence on screen: { name, step(now), abort() }
  var TAU = Math.PI * 2, FY = FLOOR_Y;
  function sm(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (6 * x - 15) + 10); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function V(x, y, z) { return new THREE.Vector3(x, y, z); }
  function cur() { return window.current; }
  function ok3d() {
    try { return !!(T3.active && T3.active() && ctx.layout && !document.hidden && cur() === 'game' && document.body.contains(ctx.renderer.domElement)); } catch (e) { return false; }
  }
  function qual() { try { var q = T3.quality ? T3.quality() : 'high'; return q === 'low' ? 0 : q === 'medium' ? 1 : 2; } catch (e) { return 2; } }
  function reduced() { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function calm() { try { return !!(window.A11y && A11y.calm && A11y.calm()); } catch (e) { return false; } }   // 'Reduce flashing' (main's A11y)
  function seatView() { var b = ctx.camBase; return { pos: b.pos.clone(), look: b.look.clone() }; }
  var lastPos = new THREE.Vector3(), lastLook = new THREE.Vector3();
  function setCam(pos, look) {
    var cam = ctx.camera;
    cam.position.copy(pos); cam.lookAt(look); cam.updateMatrixWorld();
    lastPos.copy(pos); lastLook.copy(look);
    ctx.dirty();
  }
  function restoreCam() { try { ctx.refit(); } catch (e) {} ctx.dirty(); ctx.startLoop(); }
  function dispose(o) {
    if (!o) return; if (o.parent) o.parent.remove(o);
    o.traverse(function (x) {
      if (x.geometry) x.geometry.dispose();
      if (x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function people() {
    var ps = null; try { ps = T3.playerState ? T3.playerState() : null; } catch (e) {}
    // the first match: the picture was only just attached, so his seat is worked out on the next frame; do it now
    try { if (ps && ps.shown && !ps.visible && T3.playerShow) { T3.playerShow(true); ps = T3.playerState(); } } catch (e) {}
    var out = { me: null, mate: null };
    if (ps && ps.visible) out.me = { s: ps.scale, at: ps.at.slice(), rot: ps.rot };
    if (ps && ps.mate && ps.mate.visible) out.mate = { s: ps.mate.scale, at: ps.mate.at.slice(), rot: ps.mate.rot, seat: ps.mate.seat };
    return out;
  }
  function rootOf(who) { try { var md = T3.playerModels && T3.playerModels()[who]; return md && md.root && md.root.visible ? md.root.position : null; } catch (e) { return null; } }
  function plen(pts) { var L = 0; for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
  function pathAt(pts, d) {
    for (var i = 1; i < pts.length; i++) {
      var sg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d <= sg || i === pts.length - 1) { var k = sg > 0 ? d / sg : 0; return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]; }
      d -= sg;
    }
    return pts[pts.length - 1];
  }
  // a polyline shifted back by `back` along its own length (extrapolated before the start): someone walking behind
  function trail(pts, back) {
    var d0 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], l0 = Math.hypot(d0[0], d0[1]) || 1, L = plen(pts), out = [[pts[0][0] - d0[0] / l0 * back, pts[0][1] - d0[1] / l0 * back]];
    for (var i = 0; i < pts.length; i++) { var cum = plen(pts.slice(0, i + 1)); if (cum < L - back) out.push(pts[i]); }
    out.push(pathAt(pts, L - back)); return out;
  }
  // walk someone along pts (then to his seat unless stay) so that the walk takes about dur seconds
  function walk(who, P, pts, dur, extra) {
    if (!T3.playerScript || !P) return 0;
    var all = pts.slice(); if (!(extra && extra.stay)) all.push(P.at);
    var L = plen(all), v = Math.max(1.5, L / Math.max(0.3, dur - 0.15));
    T3.playerScript(who, Object.assign({ path: pts, v: v }, extra || {}));
    return L;
  }
  function endWalks() { ['me', 'mate'].forEach(function (w) { try { if (T3.playerScripted && T3.playerScripted(w)) T3.playerScript(w, null); } catch (e) {} }); }
  // the table before a match: no cubes from the last match, no Goal parentheses, a fresh scoreboard text
  function clearTable(board) {
    try { var prev = T3.lastG; T3.sync({ cubes: [], goalTokens: [], highlight: null }); T3.lastG = prev; } catch (e) {}
    (ctx.meshes || []).forEach(function (m) { m.visible = false; });
    try { if (T3.setBoard) T3.setBoard(board || ''); } catch (e) {}
    ctx.dirty();
  }
  // before the first shake there are no cubes in play: keep any from an earlier match out of sight (a pour of a match he
  // left a moment ago may still be landing them)
  function noStrayCubes() { if (window.G && !window.G.cubes) (ctx.meshes || []).forEach(function (m) { if (m.visible) { m.visible = false; ctx.dirty(); } }); }
  function run(name, step, abort) {
    if (seq) { var o = seq; seq = null; try { o.abort(); } catch (e) {} }
    seq = { name: name, step: step, abort: abort };
    ctx.dirty(); ctx.startLoop();
  }
  ctx.hooks.frame.push(function (now) {
    if (!seq) return;
    try { seq.step(now); }
    catch (e) { console.warn('matchday', e); var o = seq; seq = null; try { o.abort(); } catch (e2) {} }
  });
  T3.mdActive = function () { return seq ? seq.name : ''; };

  // =====================================================================================================
  // 1. THE WALK-OUT
  // full (stadium venues): shot 1 low on the pitch at the tunnel (or the corner flag below tier 4), the kid (and Tata)
  //   walk out and along the side of the table (0 - 2.6 s); CUT to a high wide shot: the creatures make their entrance
  //   behind the far rim, he walks round to his seat (2.6 - 5.2 s); the camera eases down to the seat view (-> 5.9 s).
  // mid (beach, volcano, the felt rooms): only the wide shot, he walks in from the side (3.5 s).
  // short (every match after the first one of the session): the last few steps, 2.0 s.
  // =====================================================================================================
  T3.mdWalkOut = function (o, ev) {
    o = o || {}; ev = ev || function () {};
    if (!ok3d()) return null;
    var L = ctx.layout, W = L.W, D = L.D, tall = ctx.layoutName === 'tall', mat = (window.S && S.cos && S.cos.mat) || '', stad = mat === 'stadium' || mat === 'night';
    var tier = 0; try { tier = stad && T3.stadiumTier ? T3.stadiumTier() : 0; } catch (e) {}
    var mode = o.short ? 'short' : stad ? 'full' : 'mid', tunnel = stad && tier >= 4;
    var sx = tall ? 1 : -1, lineZ = -D / 2 - (tall ? 2 : 3.4), standX = W / 2 + (tall ? 2.5 : 8.2), lane = tall ? W / 2 + 1.5 : W / 2 + 3.4;
    var P = people(), me = P.me, mt = P.mate, s = me ? me.s : 1.6, H = 5.7 * s;
    var TCUT = mode === 'full' ? 2.6 : 0, TEND = mode === 'full' ? 5.9 : mode === 'mid' ? 3.5 : 2.0;
    clearTable(o.board);
    try { if (T3.orbit && T3.orbit.active()) T3.orbit.reset(); } catch (e) {}
    var t0 = performance.now(), kicked = false, cut = false, ended = false, last = t0;
    // the creatures stay out of shot 1 (their entrance at the cut shows them again: creatures.js unhides on enter)
    var hid = [];
    function hideCreatures(on) {
      try {
        var n = T3.creatureCount ? T3.creatureCount() : 0;
        for (var i = 0; i < n; i++) { var a = T3._creatureActor && T3._creatureActor(i); if (a && a.root) { if (on) { if (a.root.visible) { a.root.visible = false; hid.push(a.root); } } } }
        if (!on) { hid.forEach(function (r) { r.visible = true; }); hid = []; }
      } catch (e) {}
      ctx.dirty();
    }
    function kick() { if (kicked) return; kicked = true; hid = []; try { if (o.kick) o.kick(); } catch (e) { console.warn(e); } }
    // shot 1: from the tunnel (or the corner flag) along the side of the table
    var p0 = tunnel ? [tall ? 3.6 : -9.4, lineZ - 0.4] : [sx * Math.min(lane + 3, standX - 1.8), lineZ + 0.3];
    var shot1 = [p0, [sx * lane, -D / 2 - 1.2], [sx * lane, -D / 2 + (tall ? 0.22 : 0.3) * D]], L1 = plen(shot1);
    // (tall: the camera stands in his lane, looking up it: from beside the narrow table, the table would hide him)
    var c1a = V(sx * (tall ? lane : Math.min(lane + 3.4, standX - 1.4)), FY + 4.6, D / 2 + (tall ? 4 : 4.5)), c1b = c1a.clone().add(V(0, 0.9, 1.6)), look1 = null;
    function shotTwo() {
      cut = true;
      var home = me ? me.at : [0, D / 2 + 3], q;
      if (mode === 'full') q = [[sx * lane, D / 2 - (tall ? 3.2 : 2.6)], [sx * (W / 2 + 2.4), home[1]]];
      else if (mode === 'mid') q = [[sx * (W / 2 + 13), home[1] + 1.5], [sx * (W / 2 + 2.4), home[1]]];
      else q = [[sx * (W / 2 + 2.4), home[1]]];
      var dur = mode === 'full' ? 2.6 : mode === 'mid' ? 3.0 : 1.6;
      if (me) walk('me', me, q, dur);
      if (mt) {
        if (mt.seat === 'far') walk('mate', mt, [[sx * (W / 2 + (mode === 'short' ? 1.5 : 3)), -D / 2 - 2.8]], dur);
        else walk('mate', mt, [[mt.at[0] - 0.4, mt.at[1] + (mode === 'short' ? 3 : 6.5)]], dur);
      }
      setTimeout(function () { if (!ended) kick(); }, mode === 'full' ? 80 : 250);
      if (mode === 'full') ev('cut');
    }
    var sv = seatView(), off = sv.pos.clone().sub(sv.look), a = -sx * (mode === 'short' ? 0.1 : 0.2), ca = Math.cos(a), sa = Math.sin(a);
    var cw = { pos: V(off.x * ca + off.z * sa, off.y, -off.x * sa + off.z * ca).multiplyScalar(mode === 'short' ? 1.06 : 1.2).add(sv.look).add(V(0, mode === 'short' ? 1.2 : 2.0, 0)), look: sv.look.clone() };
    if (mode === 'full') {
      hideCreatures(true);
      if (me) walk('me', me, shot1, 2.6, { stay: true, yaw: 0 });
      if (mt) {
        var mp = tall ? trail(shot1, 3.2) : shot1.map(function (p, i) { return [p[0] + sx * (i ? 2.8 : 2.2), p[1] + (i ? 0 : 0.9)]; });
        walk('mate', mt, mp, 2.6, { stay: true, yaw: 0 });
      }
    } else shotTwo();
    var tmpP = V(0, 0, 0), tmpL = V(0, 0, 0);
    function finish() {
      if (ended) return; ended = true;
      if (seq && seq.name === 'walkout') seq = null;
      if (!kicked) hideCreatures(false);
      endWalks(); restoreCam();
      ev('end', { entered: kicked });
    }
    run('walkout', function (now) {
      var t = (now - t0) / 1000, dt = clamp((now - last) / 1000, 0.001, 0.05); last = now;
      if (!ok3d()) { finish(); return; }
      noStrayCubes();
      if (t < TCUT) {
        // shot 1: follow him (or where he would be) with a calm, smoothed look; the camera drifts back a little
        var r = rootOf('me'), tgt;
        if (r) tgt = V(r.x, FY + 0.62 * H, r.z);
        else { var pp = pathAt(shot1, L1 * sm(t / TCUT)); tgt = V(pp[0], FY + 0.62 * H, pp[1]); }
        if (!look1) look1 = tgt.clone(); else look1.lerp(tgt, 1 - Math.exp(-5 * dt));
        tmpP.lerpVectors(c1a, c1b, sm(t / TCUT)); setCam(tmpP, look1);
      } else {
        if (!cut) shotTwo();
        var k = sm((t - TCUT) / (TEND - TCUT)), b = ctx.camBase;   // the live seat view (a resize may have refitted it)
        tmpP.lerpVectors(cw.pos, b.pos, k); tmpL.lerpVectors(cw.look, b.look, k); setCam(tmpP, tmpL);
        if (t >= TEND) finish();
      }
    }, finish);
    return { skip: finish, entered: function () { return kicked; } };
  };

  // =====================================================================================================
  // 2. THE TOSS
  // =====================================================================================================
  function coinFace(kind) {
    return canvasTex(512, 512, function (g, w, h) {
      var gr = g.createRadialGradient(w * 0.4, h * 0.36, 20, w / 2, h / 2, w / 2);
      gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.55, '#f2c240'); gr.addColorStop(1, '#b07a12');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(120,70,0,.55)'; g.lineWidth = 14; g.beginPath(); g.arc(w / 2, h / 2, w * 0.43, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,250,215,.7)'; g.lineWidth = 5; g.beginPath(); g.arc(w / 2, h / 2, w * 0.405, 0, TAU); g.stroke();
      for (var i = 0; i < 24; i++) { var a = i / 24 * TAU; g.fillStyle = 'rgba(120,70,0,.35)'; g.beginPath(); g.arc(w / 2 + Math.cos(a) * w * 0.465, h / 2 + Math.sin(a) * h * 0.465, 5, 0, TAU); g.fill(); }
      g.save(); g.translate(w / 2, h / 2);
      g.shadowColor = 'rgba(90,50,0,.55)'; g.shadowOffsetX = 4; g.shadowOffsetY = 6; g.shadowBlur = 6;
      if (kind === 'eq') {
        // a cube (rounded square) with "=" on it: the game's own sign
        var sz = 230, r = 38; g.fillStyle = '#fff6d0'; g.strokeStyle = '#8a5a00'; g.lineWidth = 12;
        g.beginPath(); g.moveTo(-sz / 2 + r, -sz / 2); g.arcTo(sz / 2, -sz / 2, sz / 2, sz / 2, r); g.arcTo(sz / 2, sz / 2, -sz / 2, sz / 2, r); g.arcTo(-sz / 2, sz / 2, -sz / 2, -sz / 2, r); g.arcTo(-sz / 2, -sz / 2, sz / 2, -sz / 2, r); g.closePath(); g.fill(); g.stroke();
        g.shadowColor = 'transparent'; g.fillStyle = '#c2410c';
        g.fillRect(-72, -52, 144, 34); g.fillRect(-72, 18, 144, 34);
      } else {
        g.fillStyle = '#fff6d0'; g.strokeStyle = '#8a5a00'; g.lineWidth = 12; g.beginPath();
        for (var k = 0; k < 10; k++) { var b = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 62 : 150; g.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); }
        g.closePath(); g.fill(); g.stroke();
        g.shadowColor = 'transparent'; g.fillStyle = '#e8a10f'; g.beginPath(); g.arc(0, 8, 26, 0, TAU); g.fill();
      }
      g.restore();
    });
  }
  function edgeTex() {
    var t = canvasTex(256, 32, function (g, w, h) { g.fillStyle = '#d9a521'; g.fillRect(0, 0, w, h); for (var x = 0; x < w; x += 4) { g.fillStyle = 'rgba(110,60,0,.45)'; g.fillRect(x, 0, 2, h); } });
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(8, 1); return t;
  }
  function label(text, sub, col) {
    var t = canvasTex(512, 160, function (g, w, h) {
      g.fillStyle = 'rgba(12,20,48,.82)'; var r = 34; g.beginPath(); g.moveTo(r, 8); g.arcTo(w - 4, 8, w - 4, h - 8, r); g.arcTo(w - 4, h - 8, 4, h - 8, r); g.arcTo(4, h - 8, 4, 8, r); g.arcTo(4, 8, w - 4, 8, r); g.closePath(); g.fill();
      g.strokeStyle = col || '#ffd43b'; g.lineWidth = 6; g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      var f = 64; do { g.font = '900 ' + f + 'px "Lilita One", "Trebuchet MS", sans-serif'; f -= 4; } while (g.measureText(text).width > w - 60 && f > 20);
      g.fillText(text, w / 2, sub ? 58 : h / 2 + 2);
      if (sub) { g.fillStyle = col || '#ffd43b'; g.font = '900 46px "Lilita One", "Trebuchet MS", sans-serif'; g.fillText(sub, w / 2, 118); }
    });
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    sp.renderOrder = 20; return sp;
  }
  function setLabel(sp, text, sub, col) { var old = sp.material.map; sp.material.map = label(text, sub, col).material.map; sp.material.needsUpdate = true; if (old) old.dispose(); }
  function sfx(name, v) { try { if (window.MdSfx && MdSfx[name]) MdSfx[name](v); } catch (e) {} }

  T3.mdToss = function (rec, o, ev) {
    o = o || {}; ev = ev || function () {};
    if (!ok3d() || !rec) return null;
    clearTable(o.board);
    var L = ctx.layout, tall = ctx.layoutName === 'tall', grp = new THREE.Group(); ctx.scene.add(grp);
    var sv0 = seatView(), t0 = performance.now(), ended = false, landedAt = 0, fired = {};
    var center = V(0, 0, tall ? 0.5 : 0.6), step, total;
    function once(k) { if (fired[k]) return false; fired[k] = true; return true; }
    if (rec.method === 'coin') {
      var R = tall ? 1.75 : 2.1, TH = 0.26;
      var coin = new THREE.Mesh(new THREE.CylinderGeometry(R, R, TH, 56, 1, false), [
        new THREE.MeshStandardMaterial({ map: edgeTex(), metalness: 0.85, roughness: 0.35 }),
        new THREE.MeshStandardMaterial({ map: coinFace('eq'), metalness: 0.55, roughness: 0.32 }),
        new THREE.MeshStandardMaterial({ map: coinFace('star'), metalness: 0.55, roughness: 0.32 })]);
      coin.castShadow = true; grp.add(coin);
      var shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.05, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.set(center.x, 0.015, center.z); grp.add(shadow);
      // the face that must end up: '=' (top cap) for player 0's side, the star (bottom cap) for the other side
      var faceB = rec.face === 'star', spins = clamp(rec.spins | 0, 3, 6), yaw0 = -Math.PI / 2;   // (-pi/2: the '=' reads level from the seat)
      var TL = 0.6, T1 = 1.0, T2 = 0.36, T3w = 1.05, base = spins * TAU + (faceB ? Math.PI : 0), del = 0.42, dx = (rec.winner % 2 ? 0.45 : -0.45);
      var yl = TH / 2 * Math.cos(del) + R * Math.sin(del), a0 = -0.1, yw0 = TH / 2 * Math.cos(a0) + R * Math.sin(-a0);
      var qY = new THREE.Quaternion(), qX = new THREE.Quaternion(), qT = new THREE.Quaternion(), qB = new THREE.Quaternion(), ax = V(1, 0, 0), ay = V(0, 1, 0), ticks = 0;
      var TLAND = TL + T1 + T2 + T3w; total = TLAND + 1.5 + 0.3;
      step = function (t) {
        var x = center.x, y = TH / 2, z = center.z, th = 0, sc = 1, wob = null;
        if (t < TL) { sc = t < 0.32 ? sm(t / 0.32) * (1 + 0.12 * Math.sin(Math.PI * clamp(t / 0.32, 0, 1))) : 1; }
        else if (t < TL + T1) {
          var u = (t - TL) / T1; if (once('flip')) sfx('flip');
          y = lerp(TH / 2, yl, u) + 4 * 5.2 * u * (1 - u); th = (base + del) * u; x = center.x + dx * u;
        } else if (t < TL + T1 + T2) {
          var v = (t - TL - T1) / T2; if (once('land')) sfx('clink', 1);
          y = lerp(yl, yw0, v) + 4 * 0.55 * v * (1 - v); th = lerp(base + del, base + a0, sm(v)); x = center.x + dx;
        } else if (t < TLAND) {
          var w = (t - TL - T1 - T2) / T3w, al = a0 * Math.pow(1 - w, 1.5), ph = yaw0 + TAU * (2 * w + 2.6 * w * w);
          var nt = Math.floor((ph - yaw0) / Math.PI); if (nt > ticks) { ticks = nt; sfx('clink', 0.08 + 0.3 * (1 - w)); }
          wob = { al: al, ph: ph }; x = center.x + dx; y = TH / 2 * Math.cos(al) + R * Math.abs(Math.sin(al));
        } else {
          x = center.x + dx; th = base;
          if (once('landed')) { landedAt = t; ev('landed'); }
          if (t > TLAND + 1.5) sc = 1 - sm((t - TLAND - 1.5) / 0.3);
        }
        if (wob) {
          qY.setFromAxisAngle(ay, wob.ph); qT.setFromAxisAngle(ax, wob.al); qB.setFromAxisAngle(ay, -wob.ph);
          coin.quaternion.copy(qY).multiply(qT).multiply(qB).multiply(qX.setFromAxisAngle(ay, yaw0)).multiply(new THREE.Quaternion().setFromAxisAngle(ax, base));
        } else { qY.setFromAxisAngle(ay, yaw0); qX.setFromAxisAngle(ax, th); coin.quaternion.copy(qY).multiply(qX); }
        coin.position.set(x, y, z); coin.scale.setScalar(Math.max(0.001, sc));
        shadow.position.x = x; var hk = clamp((y - TH) / 6, 0, 1); shadow.material.opacity = 0.28 * (1 - 0.7 * hk) * sc; shadow.scale.setScalar(Math.max(0.001, sc * (1 + 0.4 * hk)));
      };
    } else {
      // the official rule (three players): each rolls a red cube, the highest digit sets the Goal, an operation sign is out
      var CS = 1.6, n = (o.names || []).length || 3, order = n === 3 ? [1, 0, 2] : [0, 1], spread = tall ? 3.3 : 4.6, faces = Eq.CUBE_FACES.red;
      var mats = faces.map(function (sym) {
        return new THREE.MeshStandardMaterial({ roughness: 0.45, map: canvasTex(128, 128, function (g) {
          if (T3.drawCubeFace) { try { T3.drawCubeFace(g, 'red', sym, (window.S && S.cos && S.cos.skin) || 'classic'); return; } catch (e) {} }
          g.fillStyle = '#e03131'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff'; g.font = '900 80px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sym === '-' ? '−' : sym, 64, 68);
        }) });
      });
      var QK = [[0, 0, Math.PI / 2], [0, 0, -Math.PI / 2], [0, 0, 0], [Math.PI, 0, 0], [-Math.PI / 2, 0, 0], [Math.PI / 2, 0, 0]].map(function (e) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2])); });
      var cubes = {}, labels = {};
      order.forEach(function (p, i) {
        var x = (i - (order.length - 1) / 2) * spread, m = new THREE.Mesh(new THREE.BoxGeometry(CS, CS, CS), mats.map(function (q) { return q.clone(); }));
        m.castShadow = true; m.visible = false; grp.add(m);
        var lb = label(String((o.names || [])[p] || 'Player ' + (p + 1)), '', (o.colors || [])[p]); var lw = Math.min(4.4, spread * 0.96); lb.scale.set(lw, lw * 0.314, 1); lb.position.set(x, 0.4, center.z + 2.3); grp.add(lb);
        cubes[p] = { m: m, x: x, roll: null, t0: 0, ax: V(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), turns: 3 + Math.random() * 2, yaw: (Math.random() - 0.5) * 0.5, landed: 0 };
        labels[p] = lb;
      });
      var rolls = rec.rolls || [], RT = 1.05, GAP = 1.15, rounds = rolls.length;
      total = rounds * (RT + GAP) - GAP + 1.7 + 0.3;
      var qa = new THREE.Quaternion(), qy = new THREE.Quaternion(), ay2 = V(0, 1, 0);
      step = function (t) {
        var r = Math.min(rounds - 1, Math.floor(t / (RT + GAP))), tr = t - r * (RT + GAP);
        if (once('r' + r)) {
          (rolls[r] || []).forEach(function (e, j) { var c = cubes[e.p]; if (!c) return; c.roll = e.s; c.t0 = r * (RT + GAP) + j * 0.07; c.landed = 0; c.m.visible = true; c.ax.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(); c.turns = 3 + Math.random() * 2; c.yaw = (Math.random() - 0.5) * 0.5; });
          order.forEach(function (p) { var rolling = (rolls[r] || []).some(function (e) { return e.p === p; }); if (!rolling && cubes[p].m.visible) cubes[p].m.material.forEach(function (q) { q.color.setHex(0x6b6b6b); }); });
        }
        order.forEach(function (p) {
          var c = cubes[p]; if (!c.m.visible || c.roll == null) return;
          var u = t - c.t0, k = Math.max(0, faces.indexOf(c.roll)), y, x = c.x, z = center.z, ang = 0;
          if (u < 0) { c.m.scale.setScalar(0.001); return; }
          if (u < 0.72) { var f = u / 0.72; y = lerp(5.2, CS / 2, f) + 4 * 1.6 * f * (1 - f); z = lerp(center.z + 3.4, center.z, f); x = c.x + (1 - f) * (c.x > 0 ? 0.8 : c.x < 0 ? -0.8 : 0); ang = c.turns * Math.PI * Math.pow(1 - f, 1.3); }
          else if (u < 1.0) { var g2 = (u - 0.72) / 0.28; if (c.landed < 1) { c.landed = 1; sfx('cube', 0.8); } y = CS / 2 + 4 * 0.32 * g2 * (1 - g2); ang = 0.22 * Math.sin(Math.PI * g2); }
          else { y = CS / 2; if (c.landed < 2) { c.landed = 2; sfx('cube', 0.3); } }
          qa.setFromAxisAngle(c.ax, ang); qy.setFromAxisAngle(ay2, c.yaw);
          c.m.quaternion.copy(qy).multiply(qa).multiply(QK[k]); c.m.position.set(x, y, z); c.m.scale.setScalar(1);
        });
        if (tr >= RT && once('res' + r)) {
          var roll = rolls[r] || [], digits = roll.filter(function (e) { return Eq.isDigit(e.s); }), top = digits.length ? Math.max.apply(null, digits.map(function (e) { return +e.s; })) : -1, last = r === rounds - 1;
          roll.forEach(function (e) {
            var dg = Eq.isDigit(e.s), win = last && e.p === rec.winner;
            setLabel(labels[e.p], String((o.names || [])[e.p] || ''), dg ? (win ? '★ ' + e.s + ' ★' : e.s) : (e.s === '-' ? '−' : e.s) + ' out', win ? '#ffd43b' : dg && +e.s === top ? '#8ce99a' : '#ffa8a8');
          });
          ev('round', { r: r, roll: roll, last: last });
          if (last && once('landed')) { landedAt = t; ev('landed'); }
        }
        if (landedAt && t > landedAt + 1.7) {
          var fo = 1 - sm((t - landedAt - 1.7) / 0.3);
          order.forEach(function (p) { cubes[p].m.scale.setScalar(Math.max(0.001, fo)); labels[p].material.opacity = fo; });
        }
      };
    }
    function finish() {
      if (ended) return; ended = true;
      if (seq && seq.name === 'toss') seq = null;
      dispose(grp); restoreCam();
      ev('end');
    }
    var pushed = { pos: V(0, 0, 0), look: V(0, 0, 0) }, last = t0;
    run('toss', function (now) {
      if (!ok3d()) { finish(); return; }
      var t = (now - t0) / 1000;
      noStrayCubes(); step(t);
      // a gentle push toward the middle of the table and back (smootherstep, no sway)
      var b = ctx.camBase, close = b.pos.clone().sub(b.look).setLength(14).add(center), w = 0.38 * sm(t / 0.6) * (1 - sm((t - (total - 0.75)) / 0.6));
      pushed.pos.lerpVectors(b.pos, close, w); pushed.look.lerpVectors(b.look, center, w); setCam(pushed.pos, pushed.look);
      if (t >= total) finish();
    }, finish);
    return { skip: finish };
  };

  // =====================================================================================================
  // 3. THE TROPHY LIFT
  // 0 s: on the podium in front of the table, holding the trophy at his chest; 0.9-1.5 s: up over his head (one hop);
  // 1.5 s: confetti from above, flashbulbs, the crowd cheers, fireworks; 1.7 s: the beaten creatures clap; the camera
  // pushes in once (0-6 s) and then holds still. Confetti stays where it lands.
  // =====================================================================================================
  var cabinetMod = null;
  function trophyGroup(info, cb) {
    function mine() {
      // the league shield (and a fallback cup if the cabinet module can't load)
      var g = new THREE.Group(), col = new THREE.Color(info.color || '#ffc83d');
      if (info.kind === 'shield') {
        var sh = new THREE.Shape(); sh.moveTo(-0.3, 0.42); sh.lineTo(0.3, 0.42); sh.lineTo(0.3, 0.12); sh.quadraticCurveTo(0.28, -0.22, 0, -0.38); sh.quadraticCurveTo(-0.28, -0.22, -0.3, 0.12); sh.closePath();
        var geo = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.025, bevelSegments: 2 }); geo.translate(0, 0.38, -0.03);
        var face = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: col, metalness: 0.9, roughness: 0.25, clearcoat: 0.5 })); g.add(face);
        var st = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(256, 256, function (c) {
          c.fillStyle = '#fff7d6'; c.beginPath(); for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 46 : 112; c.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } c.closePath(); c.fill();
          c.fillStyle = info.ribbon || '#1c7ed6'; c.font = '900 64px "Lilita One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(info.mark || '1'), 128, 140);
        }) }));
        st.position.set(0, 0.4, 0.06); g.add(st);
        g.userData.h = 0.8; g.userData.grip = 0.05;
      } else {
        var m = new THREE.MeshPhysicalMaterial({ color: col, metalness: 1, roughness: 0.2 }), bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.12, 0.35, 32), m); bowl.position.y = 0.55; g.add(bowl);
        var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 16), m); stem.position.y = 0.25; g.add(stem);
        var foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.1, 24), m); foot.position.y = 0.05; g.add(foot);
        g.userData.h = 0.75; g.userData.grip = 0.22;
      }
      cb(g);
    }
    if (info.kind === 'shield') { mine(); return; }
    var go = function (mod) {
      try {
        var g = mod.buildTrophy(info.kind === 'crown' ? { type: 'crown', color: info.color, cushion: info.ribbon } : { type: 'cup', metal: info.metal, ribbon: info.ribbon }, { low: qual() === 0 });
        // the display plinth stays in the cabinet: in his hands the cup is held by its foot
        if (info.kind !== 'crown') g.children.forEach(function (c) { if (c.geometry && c.geometry.type === 'BoxGeometry') c.visible = false; });
        g.userData.h = info.kind === 'crown' ? 0.2 : 0.72; g.userData.grip = info.kind === 'crown' ? 0.02 : 0.2; cb(g);
      } catch (e) { console.warn('trophy', e); mine(); }
    };
    if (cabinetMod) { go(cabinetMod); return; }
    import('./cabinet.js').then(function (mod) { cabinetMod = mod; go(mod); }).catch(function () { mine(); });
  }
  function podium(info, Hp, s) {
    var g = new THREE.Group(), navy = new THREE.MeshStandardMaterial({ color: 0x1d2b64, roughness: 0.6 }), trim = new THREE.MeshPhysicalMaterial({ color: info.ribbon || '#ffc83d', metalness: 0.6, roughness: 0.35 });
    var w = 2.4 * s, d = 2.3 * s;
    [[0, Hp, '1'], [-w, Hp * 0.62, '2'], [w, Hp * 0.42, '3']].forEach(function (b) {
      var box = new THREE.Mesh(new THREE.BoxGeometry(w, b[1], d), navy); box.position.set(b[0], FY + b[1] / 2, 0); box.receiveShadow = true; g.add(box);
      var top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.12, d + 0.08), trim); top.position.set(b[0], FY + b[1] + 0.03, 0); g.add(top);
      var plate = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, Math.min(b[1] * 0.7, w * 0.5)), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(256, 256, function (c) {
        c.fillStyle = b[2] === '1' ? '#ffd43b' : '#dfe6f2'; c.font = '900 210px "Lilita One", "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b[2], 128, 140);
      }) }));
      plate.position.set(b[0], FY + b[1] * 0.5, d / 2 + 0.01); g.add(plate);
    });
    return g;
  }
  function confetti(n, cx, cz, yTop, radius, podTop, podHalf) {
    var colors = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2, 0xffa94d, 0xffffff];
    var mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.2), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 }), n);
    var P = [], o = new THREE.Object3D(), col = new THREE.Color();
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius;
      P.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r * 0.8, y: yTop + Math.random() * 3, t: Math.random() * 0.7, vy: 2.6 + Math.random() * 1.6, ph: Math.random() * TAU, sp: 2 + Math.random() * 4, rx: Math.random() * TAU, ry: Math.random() * TAU, done: false });
      mesh.setColorAt(i, col.setHex(colors[i % colors.length]));
      o.position.set(0, -999, 0); o.scale.setScalar(0.0001); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
    }
    mesh.frustumCulled = false;
    function step(t, dt) {
      var live = 0;
      for (var i = 0; i < n; i++) {
        var p = P[i]; if (p.done || t < p.t) { if (!p.done) live++; continue; }
        var onPod = Math.abs(p.x - cx) < podHalf[0] && Math.abs(p.z - cz) < podHalf[1], floor = (onPod ? podTop : FY) + 0.02;
        p.y -= p.vy * dt; p.x += Math.sin(p.ph + t * 2.3) * 0.6 * dt; p.rx += p.sp * dt; p.ry += p.sp * 0.7 * dt;
        if (p.y <= floor) { p.y = floor; p.done = true; p.rx = -Math.PI / 2; } else live++;
        o.position.set(p.x, p.y, p.z); o.rotation.set(p.rx, p.ry, 0); o.scale.setScalar(1); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      return live > 0;
    }
    return { mesh: mesh, step: step };
  }

  T3.mdLift = function (info, ev) {
    info = info || {}; ev = ev || function () {};
    if (!ok3d() || !T3.playerScript || !T3.playerModels) return null;
    var ps0 = null; try { ps0 = T3.playerState(); } catch (e) {}
    if (!ps0) return null;
    var wasShown = ps0.shown;
    if (!wasShown && T3.playerShow) T3.playerShow(true);
    var md = T3.playerModels().me; if (!md) { if (!wasShown && T3.playerShow) T3.playerShow(false); return null; }
    var L = ctx.layout, W = L.W, D = L.D, tall = ctx.layoutName === 'tall', ps = T3.playerState(), s = ps.scale || 1.6, H = 5.7 * s;
    var Hp = 0.24 * H, px = tall ? 0 : -3.6, pz = (ps.at ? ps.at[1] : D / 2 + 3) + (tall ? 3.6 : 4.4);
    var grp = new THREE.Group(); ctx.scene.add(grp);
    var pod = podium(info, Hp, s); pod.position.set(px, 0, pz); grp.add(pod);
    var nConf = reduced() ? 0 : [50, 100, 160][qual()], conf = nConf ? confetti(nConf, px, pz, FY + Hp + 1.25 * H, 2.6 * s, FY + Hp + 0.06, [1.2 * s, 1.15 * s]) : null;
    if (conf) grp.add(conf.mesh);
    var trophy = null, tScale = 1;
    trophyGroup(info, function (g) {
      if (ended) { dispose(g); return; }
      trophy = g; tScale = (info.kind === 'crown' ? 0.26 : info.kind === 'shield' ? 0.4 : 0.42) * H / (g.userData.h || 0.8);
      g.scale.setScalar(0.001); grp.add(g);
    });
    try { T3.playerScript('me', { path: [[px, pz]], stay: true, yaw: 0, force: true, up: Hp }); } catch (e) {}
    try { T3.playerMood('lift'); } catch (e) {}
    try { if (T3.orbit && T3.orbit.active()) T3.orbit.reset(); } catch (e) {}
    var look0 = V(px, FY + Hp + 0.6 * H, pz), dirC = V(tall ? 0.18 : 0.42, 0.2, 1).normalize();
    var aspect = ctx.camera.aspect || 1.5, fh = 1.7 * H, fw = 1.6 * H, tn = Math.tan(ctx.camera.fov * Math.PI / 360);
    var dfit = Math.max(fh / 2 / tn, fw / 2 / (tn * aspect));
    var camA = look0.clone().addScaledVector(dirC, dfit * 1.32), camB = look0.clone().addScaledVector(dirC, dfit), lookA = look0.clone().add(V(0, -0.1 * H, 0));
    var t0 = performance.now(), last = t0, ended = false, held = false, fired = {}, hw0 = V(0, 0, 0), hw1 = V(0, 0, 0), mid = V(0, 0, 0), camNow = V(0, 0, 0), lookNow = V(0, 0, 0), confLive = true;
    function once(k) { if (fired[k]) return false; fired[k] = true; return true; }
    function cleanup() {
      if (ended) return; ended = true;
      if (seq && seq.name === 'lift') seq = null;
      dispose(grp); if (trophy && trophy.parent) dispose(trophy);
      try { T3.playerMood(null); } catch (e) {}
      try { T3.playerScript('me', null); } catch (e) {}
      if (!wasShown && T3.playerShow) T3.playerShow(false);
      (info.clap || []).forEach(function (i) { try { if (T3.creatureWith) T3.creatureWith(i, function () { T3.creatureMood(null); }); } catch (e) {} });
      restoreCam();
    }
    run('lift', function (now) {
      var t = (now - t0) / 1000, dt = clamp((now - last) / 1000, 0.001, 0.05); last = now;
      if (document.hidden || cur() !== 'game') return;                       // frozen (the glue's buttons still work)
      var k = sm(t / 6);
      camNow.lerpVectors(camA, camB, k); lookNow.lerpVectors(lookA, look0, k);
      var moved = t < 6.3 || camNow.distanceToSquared(ctx.camera.position) > 1e-6;
      if (moved) setCam(camNow, lookNow);
      // the trophy rides in his two hands
      var m = T3.playerModels().me;
      if (trophy && m && m.arms && m.chest) {
        m.root.updateMatrixWorld(true);
        hw0.copy(m.arms[0].pos).applyMatrix4(m.chest.matrixWorld); hw1.copy(m.arms[1].pos).applyMatrix4(m.chest.matrixWorld);
        mid.addVectors(hw0, hw1).multiplyScalar(0.5);
        var sc = tScale * (t < 0.35 ? sm(t / 0.35) : 1);
        trophy.scale.setScalar(Math.max(0.001, sc)); trophy.position.set(mid.x, mid.y - (trophy.userData.grip || 0.2) * sc, mid.z + 0.15 * s); trophy.rotation.set(0, 0, 0);
        if (t < 6.5) ctx.dirty();
      }
      if (t >= 1.5 && once('peak')) {
        try { if (T3.fx && !calm() && !reduced()) T3.fx('flash'); } catch (e) {}   // flashbulbs: not with Reduce flashing / reduced motion
        try { if (typeof crowdReact === 'function') crowdReact('cheer', { wave: true }); } catch (e) {}
        try { if (T3.fireworks && !calm() && !(window.S && S.set && S.set.fireworks === false)) T3.fireworks({ rockets: reduced() ? 3 : 6 }); } catch (e) {}
        ev('peak');
      }
      if (t >= 1.7 && once('clap')) (info.clap || []).forEach(function (i, j) { setTimeout(function () { if (!ended) try { T3.creatureWith(i, function () { T3.creatureMood('clap'); }); } catch (e) {} }, j * 260); });
      if (conf && t >= 1.45 && confLive) { confLive = conf.step(t - 1.45, dt); ctx.dirty(); }
      if (t >= 6 && !held) { held = true; ev('hold'); }
    }, cleanup);
    return {
      active: function () { return !ended; },
      end: cleanup,
      // the photo is taken from this camera, not the seat (T3.photo puts the camera on the fitted view first)
      photo: function () {
        if (ended || !T3.photo) return '';
        var b = ctx.camBase, sp = b.pos.clone(), sl = b.look.clone(), r = '';
        try { b.pos.copy(ctx.camera.position); b.look.copy(lastLook); r = T3.photo(); } catch (e) {}
        b.pos.copy(sp); b.look.copy(sl); ctx.dirty();
        return r;
      }
    };
  };
}
