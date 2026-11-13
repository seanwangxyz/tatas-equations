// Goal replay in 3D, made like a television replay for a kid. When a shake ends with a correct Solution:
//   1. ASSEMBLE  big copies of the winning cubes lift off the table one by one (slow motion: long, soft easing) and
//                fly into one row in front of the camera, in reading order; the brackets pop in. A gold "REPLAY" tab
//                slides in over a dark band.
//   2. WORK IT   the Solution is worked out in front of him, in the order of operations (js/explain.js
//                Explain.steps: brackets first, then the strong steps, then left to right): the cubes of each step
//                rise, glide together and merge into a gold tile with the result (a soft flash); the rest of the row
//                closes up. The reason ("Brackets first.") shows underneath. Without Explain (or when it can't show
//                steps) the old reading is used: a running value under the row.
//   3. GOAL      one tile is left: "= 37 GOAL!" with ONE burst of sparks, the crowd cheers once, flashbulbs, the
//                stadium board shows the Solution.
//   4. BACK      the cubes come back out of the tile and fly home to the table, shrinking onto the real cubes.
// 4 to 7 seconds, then everything is removed (nothing keeps moving). Any tap skips (js/replay.js). Reduce flashing
// (A11y.calm) or prefers-reduced-motion: a still picture of the row and "= 37 GOAL!" for 2.4 s, faded in and out.
//
//   T3.replay(tokens, opts, done) -> handle {skip(), duration} | null
//     tokens: the Solution as game tokens ('(' / ')' strings and {s, id} cube tokens; id -1 = no real cube)
//     opts:   {goal: '37' (text), goalV: {n,d} (optional), cubes: G.cubes (for colours), fractions: G.fractions, wild: digit for a wild 0}
//     done(): called exactly once, when the replay is over or skipped (or failed after starting). Not called when
//             T3.replay returns null (it didn't start: no 3D picture, hidden page, another replay running).
//   T3.replayActive() -> bool
//
// Plugs in through T3.ctx (js/three/table.js): the copies are children of the camera (so they stay in view
// whatever the camera does), drawn on top of everything, and animated from a ctx.hooks.frame hook that is removed
// at the end. The real cubes are not touched. Glue (tap to skip, the flat version, settings): js/replay.js.
import * as THREE from 'three';
import { variRow, anyVari, labelTex, bangTex, stack } from './varilabels.js'; // VARI3D: turned cubes, labels, chalk "!"

(function boot(tries) {
  var T3 = window.T3;
  if (!T3) return;
  if (!T3.ctx || !T3.ctx.scene || !T3.ctx.camera) { if (tries < 60) setTimeout(function () { boot(tries + 1); }, 100); return; }
  install(T3, T3.ctx);
})(0);

function install(T3, ctx) {
  var RX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  var COL = { red: ['#ff6b6b', '#c92a2a'], blue: ['#4dabf7', '#1864ab'], green: ['#51cf66', '#2b8a3e'], black: ['#6c7078', '#16171a'], none: ['#e9ecef', '#adb5bd'], power: ['#ffe066', '#e8590c'], big: ['#b197fc', '#5f3dc4'] }; // (BONUS dice stand-ins)
  var SHOW = function (s) { return (window.Eq && Eq.SHOW && Eq.SHOW[s]) || s; };
  var DIST = 10;   // the row's distance in front of the camera
  var run = null, dotTex = null;

  function isCube(t) { return t && typeof t === 'object' && t.s !== '(' && t.s !== ')'; }
  function sym(t) { return typeof t === 'string' ? t : t && t.s; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function sstep(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function slowmo(k) { k = clamp01(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }   // a long soft start and landing
  function easeOutBack(k) { var c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }
  function calm() {
    try { if (window.A11y && A11y.calm && A11y.calm()) return true; } catch (e) {}
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function snd(n) { try { if (typeof Snd !== 'undefined' && Snd && typeof Snd[n] === 'function') Snd[n](); } catch (e) {} }

  function canvasTex(w, h, paint) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var g = cv.getContext('2d'); paint(g, w, h);
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.userData = { cv: cv, paint: paint }; return t;
  }
  function overlayMat(map, extra) {
    return new THREE.MeshBasicMaterial(Object.assign({ map: map, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }, extra || {}));
  }
  function textSprite(w, h, paint, order) {
    var tex = canvasTex(w, h, paint);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    sp.renderOrder = order || 12; return sp;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function parenPaint(ch) {
    return function (g, w, h) {
      g.font = '900 ' + Math.round(h * 0.86) + 'px "Trebuchet MS", "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = h * 0.08; g.strokeStyle = 'rgba(10,20,50,.85)'; g.strokeText(ch, w / 2, h * 0.5); g.fillStyle = '#ffffff'; g.fillText(ch, w / 2, h * 0.5);
    };
  }
  // the dark band behind the row: navy, soft edges, a thin gold line top and bottom
  function bandPaint(g, w, h) {
    var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(6,16,44,0)'); gr.addColorStop(0.16, 'rgba(6,16,44,.66)'); gr.addColorStop(0.84, 'rgba(6,16,44,.66)'); gr.addColorStop(1, 'rgba(6,16,44,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    var lg = g.createLinearGradient(0, 0, w, 0); lg.addColorStop(0, 'rgba(255,212,59,0)'); lg.addColorStop(0.2, 'rgba(255,212,59,.9)'); lg.addColorStop(0.8, 'rgba(255,212,59,.9)'); lg.addColorStop(1, 'rgba(255,212,59,0)');
    g.fillStyle = lg; g.fillRect(0, h * 0.16, w, 3); g.fillRect(0, h * 0.84 - 3, w, 3);
  }
  // the "REPLAY" tab: a slanted gold tag with a round arrow (an original design, no broadcaster's graphics)
  function tabPaint(g, w, h) {
    g.save(); g.translate(18, 0);
    g.beginPath(); g.moveTo(22, 4); g.lineTo(w - 36, 4); g.lineTo(w - 58, h - 4); g.lineTo(0, h - 4); g.closePath();
    var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe36e'); gr.addColorStop(1, '#f5a700'); g.fillStyle = gr; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#7a4a00'; g.stroke();
    // round arrow
    var cx = 62, cy = h / 2, r = h * 0.24;
    g.lineWidth = 9; g.strokeStyle = '#3d2500'; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, r, -Math.PI * 0.15, Math.PI * 1.45); g.stroke();
    var ax = cx + Math.cos(-Math.PI * 0.15) * r, ay = cy + Math.sin(-Math.PI * 0.15) * r;
    g.fillStyle = '#3d2500'; g.beginPath(); g.moveTo(ax + 13, ay - 2); g.lineTo(ax - 9, ay - 12); g.lineTo(ax - 4, ay + 13); g.closePath(); g.fill();
    g.font = '900 ' + Math.round(h * 0.56) + 'px "Lilita One", "Trebuchet MS", sans-serif'; g.textBaseline = 'middle'; g.fillStyle = '#3d2500';
    g.fillText('REPLAY', 104, h * 0.54);
    g.restore();
  }
  // a result tile: the cube shape in gold, the number big in the middle
  function tilePaint(text) {
    return function (g, w, h) {
      g.clearRect(0, 0, w, h);
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.55, '#ffcf3d'); gr.addColorStop(1, '#e89a00');
      rr(g, 6, 6, w - 12, h - 12, h * 0.2); g.fillStyle = gr; g.fill();
      g.lineWidth = 6; g.strokeStyle = '#9a5e00'; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.35)'; rr(g, 18, 14, w - 36, h * 0.22, h * 0.1); g.fill();
      var f = Math.round(h * 0.6); g.font = '900 ' + f + 'px "Trebuchet MS", "Segoe UI", sans-serif';
      while (g.measureText(text).width > w - 40 && f > 20) { f -= 4; g.font = '900 ' + f + 'px "Trebuchet MS", "Segoe UI", sans-serif'; }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(120,70,0,.35)'; g.fillText(text, w / 2 + 2, h * 0.55 + 3);
      g.fillStyle = '#3d2500'; g.fillText(text, w / 2, h * 0.55);
    };
  }
  function glowTex() {
    return canvasTex(128, 128, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.35, 'rgba(255,215,90,.55)'); gr.addColorStop(1, 'rgba(255,200,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }
  function dot() {
    if (dotTex) return dotTex;
    dotTex = canvasTex(64, 64, function (g, w) { var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
    return dotTex;
  }
  // a stand-in cube (no real cube to copy): a box with the symbol on its front, in the cube's colours
  function standInTex(s, color) {
    var c = (window.A11y && A11y.faceCols(color)) || COL[color] || COL.none; // A11Y: high-contrast colours
    return canvasTex(128, 128, function (g) {
      var lg = g.createLinearGradient(0, 0, 128, 128); lg.addColorStop(0, c[0]); lg.addColorStop(1, c[1]); g.fillStyle = lg; g.fillRect(0, 0, 128, 128);
      if (window.A11y) A11y.drawFacePattern(g, color, 128); // A11Y: the colour's pattern (and letter)
      g.font = '900 80px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillText(SHOW(s), 66, 70); g.fillStyle = color === 'none' ? '#222' : '#fff'; g.fillText(SHOW(s), 64, 66);
    });
  }
  // The value of the Solution so far, read left to right (the fallback when the steps can't be shown)
  function prefixValue(syms, o) {
    try {
      var a = syms.slice();
      while (a.length && !endsNumber(a[a.length - 1])) a.pop();
      if (!a.length) return null;
      var open = 0; a.forEach(function (s) { if (s === '(') open++; else if (s === ')') open--; });
      while (open-- > 0) a.push(')');
      var r = Eq.evaluate(a, { fractions: o.fractions, wild: o.wild });
      return r && r.ok ? r.value : null;
    } catch (e) { return null; }
  }
  function endsNumber(s) {
    if (/^[0-9]$/.test(s) || s === ')') return true;
    try { return Eq.isNumSym(s) || s === '!' || Eq.exOf(s) >= 0 || !!(Eq.OPDEF[s] && Eq.OPDEF[s].kind === 'post'); } catch (e) { return false; }
  }
  function fmt(v) { try { return Eq.fmt(v); } catch (e) { return String(v); } }
  function goalText(R, v) { var s = fmt(v); return R.goal && s !== R.goal ? null : s; }

  // The order-of-operations walk from js/explain.js, as a plan: each step = { consume: [element keys], i, j, v, why }.
  // null when it isn't available or can't be trusted (any 'error' step, a fallback, a mismatch).
  function planSteps(tokens, opts) {
    try {
      if (!window.Explain || typeof Explain.steps !== 'function') return null;
      var ex = Explain.steps(tokens, { goal: opts.goalV, fractions: opts.fractions, wild: opts.wild });
      if (!ex || !ex.ok || ex.fallback || !ex.steps || !ex.steps.length) return null;
      var row = tokens.map(function (t, i) { return { key: 't' + i, i: i, j: i, tok: true }; }), plan = [];
      for (var k = 0; k < ex.steps.length; k++) {
        var st = ex.steps[k];
        if (st.kind !== 'op' && st.kind !== 'read') return null;
        if (!st.after) return null;
        var next = [], made = null;
        st.after.forEach(function (sg) {
          if (sg.v) {
            var keep = row.filter(function (e) { return !e.tok && e.i === sg.i && e.j === sg.j; })[0];
            if (keep) { next.push(keep); return; }
            var nv = { key: 'v' + k + '_' + sg.i, i: sg.i, j: sg.j, v: sg.v, tok: false };
            nv.from = row.filter(function (e) { return e.i >= sg.i && e.j <= sg.j; }).map(function (e) { return e.key; });
            next.push(nv); made = made || nv;
          } else {
            var t = row.filter(function (e) { return e.tok && e.i === sg.idx; })[0];
            if (!t) throw new Error('lost token');
            next.push(t);
          }
        });
        if (!made) return null;
        var why = String(st.why || '').split(':')[0].trim();
        plan.push({ make: made, row: next, why: shortWhy(why) });
        row = next;
      }
      if (row.length !== 1 || row[0].tok) return null;
      return { steps: plan, value: ex.value };
    } catch (e) { return null; }
  }

  // the reason under the row, in a few words a child reads at a glance
  function shortWhy(w) {
    w = w.replace(/[.:!]+$/, '');
    if (/^next/i.test(w)) return '';
    if (/times and divide/i.test(w)) return '× and ÷ before + and −';
    if (/left to right/i.test(w)) return 'Left to right';
    if (/^brackets/i.test(w)) return 'Brackets first';
    if (/powers?|roots?/i.test(w) && w.length > 26) return 'Powers and roots first';
    return w.length <= 26 ? w : '';
  }

  function start(tokens, opts, done) {
    if (run || !Array.isArray(tokens) || !tokens.length) return null;
    if (!ctx.layout || document.hidden || (typeof current !== 'undefined' && current !== 'game')) return null;
    opts = opts || {};
    var camera = ctx.camera, meshes = ctx.meshes || [], cubes = opts.cubes || [];
    var R = { items: [], disp: [], t0: performance.now(), done: done, over: false, calm: calm(), els: {} };
    function own(x) { R.disp.push(x); return x; }
    try {
      camera.updateMatrixWorld();
      var group = new THREE.Group(); group.renderOrder = 10; R.group = group;
      var fovR = camera.fov * Math.PI / 180, vh = 2 * DIST * Math.tan(fovR / 2), vw = vh * (camera.aspect || 1.5);
      R.vh = vh; R.vw = vw;
      // VARI3D: with a variation card, a turned cube flies in turned, an exponent sits raised and small, labels float over cubes
      var vr = null; try { if (Eq.rulesOf(opts.fractions).any) { vr = variRow(tokens, opts.fractions); if (!anyVari(vr)) vr = null; } } catch (e) { vr = null; }
      var GAP = 0.14, widths = tokens.map(function (t, i) { return isCube(t) ? (vr && vr[i].exp ? 0.6 : 1) : 0.42; });
      var total = widths.reduce(function (a, b) { return a + b; }, 0) + GAP * (tokens.length - 1);
      var size = Math.min(vh * 0.19, (vw * 0.82) / Math.max(total, 3.2));
      var rowY = vh * 0.05, labelY = rowY - size * 1.2;
      R.size = size; R.rowY = rowY; R.GAP = GAP;
      // the band and the REPLAY tab
      var band = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(overlayMat(own(canvasTex(1024, 256, bandPaint)))));
      band.renderOrder = 10; band.scale.set(vw * 1.1, size * 4.0, 1); band.position.set(0, rowY - size * 0.45, -DIST - 0.5); group.add(band); R.band = band;
      var tabH = Math.min(size * 0.62, vh * 0.075), tab = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(overlayMat(own(canvasTex(512, 96, tabPaint)))));
      tab.renderOrder = 12; tab.scale.set(tabH * 512 / 96, tabH, 1); R.tabX = -vw / 2 + tab.scale.x / 2 + vw * 0.03; tab.position.set(R.tabX, rowY + size * 1.15 + tabH * 0.2, -DIST - 0.4); group.add(tab); R.tab = tab;
      // materials: one see-through-everything copy per real material (shared by its cubes)
      var matCopies = {};
      function copyMat(m) {
        if (!matCopies[m.uuid]) { var c = own(m.clone()); c.depthTest = false; c.depthWrite = false; c.transparent = true; c.opacity = 1; c.fog = false; matCopies[m.uuid] = c; }
        return matCopies[m.uuid];
      }
      R.mats = matCopies;
      var x = -total * size / 2, seq = 0, ws = new THREE.Vector3(), wq = new THREE.Quaternion(), camQi = new THREE.Quaternion();
      camera.getWorldQuaternion(camQi); camQi.invert();
      tokens.forEach(function (t, i) {
        var w = widths[i] * size, cx = x + w / 2; x += w + GAP * size;
        var v = vr && vr[i], it = { key: 't' + i, kind: isCube(t) ? 'cube' : 'paren', s: sym(t), seq: seq++, p1: new THREE.Vector3(cx, rowY, -DIST), landed: false, sz: size, w: widths[i], exp: !!(v && v.exp), op: 1, x: cx, dy: 0 };
        if (v && v.exp) { it.p1.set(cx - 0.12 * size, rowY + 0.42 * size, -DIST); it.sz = size * 0.58; it.x = it.p1.x; it.dy = 0.42 * size; }
        var qT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), v ? v.turn : 0);   // about the table's up axis
        if (it.kind === 'cube') {
          var src = t.id != null && t.id >= 0 ? meshes[t.id] : null, mesh;
          if (src && src.visible && src.material && src.geometry) {
            mesh = new THREE.Mesh(src.geometry, copyMat(src.material));
            src.getWorldPosition(ws); src.getWorldQuaternion(wq);
            it.p0 = camera.worldToLocal(ws.clone());
            it.q0 = camQi.clone().multiply(wq);
            it.q1 = RX.clone().multiply(qT).multiply(wq);       // the face that was on top now faces the camera, upright (or turned)
            it.s0 = src.scale.x * 1.02; it.real = true;
          } else {
            var col = (t.id != null && cubes[t.id]) ? cubes[t.id].color : 'none';
            var tex = own(standInTex(it.s, col));
            mesh = new THREE.Mesh(own(new THREE.BoxGeometry(1, 1, 1)), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false })));
            it.p0 = new THREE.Vector3(cx * 0.6, -vh * 0.62, -DIST);
            it.q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0.6, 0)); it.q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), v ? v.turn : 0); it.s0 = size * 0.6;
          }
          mesh.renderOrder = 11; mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
          it.m = mesh; group.add(mesh);
          if (v && v.cap) {   // its label, shown once it has landed (laid out below, clear of the other labels and cubes)
            var L = labelTex(v.cap); own(L.tex);
            var lsp = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: L.tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false })));
            lsp.renderOrder = 13; lsp.visible = false; lsp.userData.h = size * 0.36 * L.hk; lsp.scale.set(lsp.userData.h * L.aspect, lsp.userData.h, 1); group.add(lsp); it.lab = lsp;
          }
        } else {
          var sp;
          if (v && v.bang) { sp = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: bangTex(), transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }))); sp.renderOrder = 12; } // chalk "!" (shared texture)
          else { sp = textSprite(64, 160, parenPaint(it.s), 12); own(sp.material); own(sp.material.map); }
          sp.scale.set(size * 0.5, size * 1.25, 1); sp.position.copy(it.p1); sp.visible = false; it.m = sp; group.add(sp);
        }
        R.items.push(it); R.els[it.key] = it;
      });
      if (vr) layoutLabels(R.items, size);
      // the label under the row (running value / the reason for a step / GOAL!) and the caption over it at the end
      R.label = textSprite(1024, 200, function () {}, 13); own(R.label.material); own(R.label.material.map); R.label.scale.set(size * 5.1, size, 1); R.label.position.set(0, labelY, -DIST); R.label.visible = false; group.add(R.label);
      R.labelScale = R.label.scale.clone();
      R.cap = textSprite(1024, 120, function () {}, 13); own(R.cap.material); own(R.cap.material.map); R.cap.scale.set(size * 5.1, size * 0.6, 1); R.cap.position.set(0, rowY + size * 1.0, -DIST); R.cap.visible = false; group.add(R.cap);
      // the soft glow behind a step, and the flash when cubes merge
      R.glowT = own(glowTex());
      R.glow = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(overlayMat(R.glowT, { blending: THREE.AdditiveBlending })));
      R.glow.renderOrder = 10; R.glow.visible = false; R.glow.position.set(0, rowY, -DIST - 0.3); group.add(R.glow);
      R.flash = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(overlayMat(R.glowT, { blending: THREE.AdditiveBlending })));
      R.flash.renderOrder = 14; R.flash.visible = false; R.flash.position.set(0, rowY, -DIST + 0.2); group.add(R.flash);

      // ---- the timeline (seconds) ----
      var n = R.items.length, syms = tokens.map(sym);
      R.expr = syms.map(SHOW).join('');
      R.goal = opts.goal != null ? String(opts.goal) : '';
      if (R.calm) {
        R.items.forEach(function (it) { it.ts = 0; it.tl = 0; });
        R.tLand = 0; R.plan = null; R.tSteps = 0; R.tGoal = 0.1; R.tBack = 2.4; R.tEnd = 2.8;
        var cv = prefixValue(syms, opts); if (!R.goal && cv) R.goal = fmt(cv);
      } else {
        R.stag = Math.min(0.22, 1.15 / Math.max(1, n - 1)); R.fly = 0.62; R.lead = 0.25;
        R.items.forEach(function (it) { it.ts = R.lead + it.seq * R.stag; it.tl = it.ts + R.fly; });
        R.tLand = R.items[n - 1].tl;
        R.plan = planSteps(tokens, opts);
        if (R.plan) {
          var k = R.plan.steps.length;
          R.S = Math.max(0.36, Math.min(0.78, 3.0 / k));
          R.tSteps = R.tLand + 0.35;
          R.plan.steps.forEach(function (st, i) { st.t = R.tSteps + i * R.S; });
          R.tGoal = R.tSteps + k * R.S + 0.05;
          if (!R.goal) R.goal = fmt(R.plan.value);
        } else {
          // fallback: the running value as it is read left to right
          var vals = []; for (var q = 0; q < n; q++) vals.push(prefixValue(syms.slice(0, q + 1), opts));
          R.vals = vals; R.tGoal = R.tLand + 0.35;
          if (!R.goal && vals[n - 1] != null) R.goal = fmt(vals[n - 1]);
        }
        R.tBack = R.tGoal + 1.1; R.tEnd = R.tBack + 0.8;
      }
      R.shown = null; R.from = null; R.to = null; R.tv = 0;
      camera.add(group);
      R.hook = function (now) { try { step(R, now); } catch (e) { try { console.warn('[replay]', e); } catch (e2) {} finish(R); } };
      ctx.hooks.frame.push(R.hook);
      R.safety = setTimeout(function () { finish(R); }, (R.tEnd + 1.5) * 1000);
      run = R;
      paintLabel(R, '', false);
      if (T3.setBoard) T3.setBoard('REPLAY');
      ctx.dirty(); ctx.startLoop();
      return { skip: function () { finish(R); }, duration: R.tEnd };
    } catch (e) {
      try { console.warn('[replay]', e); } catch (e2) {}
      cleanup(R); run = null;
      return null;
    }
  }

  // VARI3D: each label sits just over its cube; labels that would touch another label or a cube go up a row
  function layoutLabels(items, size) {
    var obst = [], labs = [];
    items.forEach(function (it) {
      if (it.kind !== 'cube') return;
      var hs = it.sz / 2; obst.push({ x0: it.p1.x - hs, x1: it.p1.x + hs, y0: -(it.p1.y + hs), y1: -(it.p1.y - hs), id: it.seq });
      if (it.lab) { var h = it.lab.userData.h, w = it.lab.scale.x, b = -(it.p1.y + hs) - size * 0.04; labs.push({ it: it, x0: it.p1.x - w / 2, x1: it.p1.x + w / 2, y0: b - h, y1: b, own: it.seq, h: h }); }
    });
    if (!labs.length) return;
    stack(labs, obst, size * 0.03);
    labs.forEach(function (l) { l.it.lab.position.set((l.x0 + l.x1) / 2 + l.dx, -((l.y0 + l.y1) / 2 - l.lift), -DIST); });
  }
  function paintText(sp, text, o) {
    var tex = sp.material.map, cv = tex.userData.cv, g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.clearRect(0, 0, w, h);
    if (text) {
      var f = Math.round(h * (o.k || 0.62)); g.font = '900 ' + f + 'px "Trebuchet MS", "Segoe UI", sans-serif';
      while (g.measureText(text).width > w - 30 && f > 16) { f -= 3; g.font = '900 ' + f + 'px "Trebuchet MS", "Segoe UI", sans-serif'; }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = f * 0.16; g.strokeStyle = 'rgba(6,16,44,.92)'; g.strokeText(text, w / 2, h * 0.53);
      if (o.gold) { g.shadowColor = '#ffb000'; g.shadowBlur = 24; }
      g.fillStyle = o.gold ? '#ffd43b' : o.soft ? '#d8e6ff' : '#ffffff'; g.fillText(text, w / 2, h * 0.53); g.shadowBlur = 0;
    }
    tex.needsUpdate = true;
  }
  function paintLabel(R, text, gold, soft) { paintText(R.label, text, { gold: gold, soft: soft }); }

  // ---- the row while the steps are worked out ----
  function widthOf(R, e) { return e.w; }
  function layoutRow(R, row) {
    var tot = 0; row.forEach(function (e, i) { tot += widthOf(R, R.els[e.key]) + (i ? R.GAP : 0); });
    var x = -tot * R.size / 2, out = {};
    row.forEach(function (e) { var el = R.els[e.key], w = widthOf(R, el) * R.size; out[e.key] = x + w / 2; x += w + R.GAP * R.size; });
    return out;
  }
  function makeTile(R, e) {
    var text = fmt(e.v), wk = Math.max(1, 0.36 + text.length * 0.3);
    var tex = canvasTex(Math.round(160 * wk), 160, tilePaint(text)); R.disp.push(tex);
    var geo = new THREE.PlaneGeometry(1, 1); R.disp.push(geo);
    var mat = overlayMat(tex); mat.opacity = 1; R.disp.push(mat);
    var m = new THREE.Mesh(geo, mat); m.renderOrder = 12; m.visible = false; m.frustumCulled = false;
    R.group.add(m);
    var el = { key: e.key, kind: null, w: wk, m: m, x: 0, dy: 0, sz: R.size, tile: true, text: text, op: 1 };
    R.els[e.key] = el; return el;
  }
  function beginStep(R, st, t) {
    var newX = null;
    if (!R.els[st.make.key]) makeTile(R, st.make);
    newX = layoutRow(R, st.row);
    st.moves = {};
    Object.keys(newX).forEach(function (k) { var el = R.els[k]; if (k !== st.make.key) st.moves[k] = { a: el.x, b: newX[k] }; });
    st.tileX = newX[st.make.key];
    st.from = st.make.from.map(function (k) { var el = R.els[k]; return { el: el, x: el.x, y: R.rowY + (el.dy || 0) }; });
    var x0 = 1e9, x1 = -1e9; st.from.forEach(function (f) { var hw = widthOf(R, f.el) * R.size / 2; x0 = Math.min(x0, f.x - hw); x1 = Math.max(x1, f.x + hw); });
    st.span = { c: (x0 + x1) / 2, w: x1 - x0 };
    st.begun = true;
    if (st.why) { paintLabel(R, st.why, false, true); R.label.visible = true; } else R.label.visible = false;
  }
  function stepRow(R, t) {
    var plan = R.plan, S = R.S;
    for (var i = 0; i < plan.steps.length; i++) {
      var st = plan.steps[i];
      if (t < st.t) break;
      if (!st.begun) beginStep(R, st, t);
      if (st.ended) continue;
      var u = (t - st.t) / S;
      var hl = sstep(u / 0.24), mv = slowmo((u - 0.22) / 0.4), pop = clamp01((u - 0.6) / 0.4);
      // the glow behind the cubes being worked on
      R.glow.visible = u < 0.66; R.glow.material.opacity = (R.calm ? 0 : 0.55) * hl * (1 - clamp01((u - 0.5) / 0.16));
      R.glow.position.x = st.span.c + (st.tileX - st.span.c) * mv; R.glow.scale.set(st.span.w * (1 - 0.5 * mv) + R.size * 1.2, R.size * 2.1, 1);
      // the step's cubes rise a little, then glide together into the tile's place and shrink
      st.from.forEach(function (f) {
        var el = f.el, m = el.m;
        if (u >= 0.6) { m.visible = false; el.gone = true; if (el.lab) el.lab.visible = false; return; }
        m.visible = true;
        var x = f.x + (st.tileX - f.x) * mv, lift = R.size * 0.16 * hl * (1 - mv);
        m.position.set(x, f.y + lift, m.position.z);
        var s = el.sz * (1 + 0.06 * hl) * (1 - 0.45 * mv);
        if (el.kind === 'paren') m.scale.set(R.size * 0.5 * (1 - 0.45 * mv), R.size * 1.25 * (1 - 0.45 * mv), 1);
        else if (el.tile) m.scale.set(el.w * R.size * (1 - 0.45 * mv), R.size * (1 - 0.45 * mv), 1);
        else m.scale.setScalar(s);
        if (el.lab) el.lab.visible = mv < 0.05;
        el.x = x;
      });
      // everything else closes up
      Object.keys(st.moves).forEach(function (k) {
        var el = R.els[k], mvk = st.moves[k], xx = mvk.a + (mvk.b - mvk.a) * mv;
        el.x = xx; el.m.position.x = xx;
        if (el.lab) el.lab.visible = mv < 0.05 || mv >= 1;
      });
      // the result pops in, with a soft flash
      var tile = R.els[st.make.key];
      if (u >= 0.6) {
        if (!st.popped) {
          st.popped = true; snd(typeof Snd !== 'undefined' && Snd && Snd.merge ? 'merge' : 'pop');
          tile.m.visible = true; tile.x = st.tileX;
        }
        var sc = 0.55 + 0.45 * easeOutBack(pop);
        tile.m.position.set(st.tileX, R.rowY, -DIST); tile.m.scale.set(tile.w * R.size * sc, R.size * sc, 1);
        R.flash.visible = !R.calm && pop < 1; R.flash.position.x = st.tileX;
        var fk = Math.sin(clamp01(pop / 0.7) * Math.PI); R.flash.material.opacity = 0.75 * fk; R.flash.scale.setScalar(R.size * (1.4 + 1.6 * pop));
      }
      if (u >= 1) {
        st.ended = true; R.flash.visible = false; R.glow.visible = false;
        tile.m.scale.set(tile.w * R.size, R.size, 1);
        Object.keys(st.moves).forEach(function (k) { var el = R.els[k]; el.x = st.moves[k].b; el.m.position.x = el.x; if (el.lab) { el.lab.visible = true; el.lab.position.x = el.x; } });
      }
    }
  }

  function landed(R, it, k) {
    it.landed = true; it.tLanded = (performance.now() - R.t0) / 1000;
    if (it.kind === 'cube' && !R.calm) snd('thunk');
    if (R.vals) {
      var v = R.vals[k];
      if (v != null) {
        var sv = fmt(v);
        if (R.shown !== sv) {
          var a = R.cur, ok = a && a.d === 1 && v.d === 1 && Math.abs(v.n - a.n) <= 400;
          R.from = ok ? a.n : null; R.to = v; R.tv = it.tLanded; R.cur = v;
          if (!ok) { R.shown = sv; paintLabel(R, '= ' + sv, false); }
          R.label.visible = true;
        }
      }
    }
    if (T3.setBoard) {
      var partial = R.items.slice(0, k + 1).map(function (x) { return SHOW(x.s); }).join('');
      T3.setBoard('REPLAY\n' + partial);
    }
  }

  function step(R, now) {
    if (R.over) return;
    if (typeof current !== 'undefined' && current !== 'game') { finish(R); return; }
    var t = (now - R.t0) / 1000;
    // the dressing: band and tab in at the start, out at the end
    var inK = R.calm ? sstep(t / 0.4) : sstep(t / 0.35), outK = sstep((t - R.tBack) / (R.tEnd - R.tBack)), dress = inK * (1 - outK);
    R.band.material.opacity = dress;
    R.tab.material.opacity = dress; R.tab.position.x = R.tabX - (1 - slowmo(R.calm ? 1 : t / 0.55)) * R.vw * 0.35;
    // 1. assemble
    var back = t >= R.tBack ? slowmo((t - R.tBack) / (R.tEnd - R.tBack - 0.05)) : 0;
    R.items.forEach(function (it, k) {
      var m = it.m;
      if (it.merged && !back) return;               // gone into a result tile (the step code draws it until then)
      if (R.calm) {
        m.visible = true; m.position.copy(it.p1);
        if (it.kind === 'cube') { m.quaternion.copy(it.q1); m.scale.setScalar(it.sz); } else m.scale.set(R.size * 0.5, R.size * 1.25, 1);
        setOp(R, it, dress);
        if (!it.landed) landed(R, it, k);
        if (it.lab) it.lab.visible = true;
        return;
      }
      if (back > 0) {   // 4. home again: out of the tile, back down onto the real cubes
        if (it.kind !== 'cube') { m.visible = !it.merged && back < 0.3; setOp(R, it, 1 - clamp01(back / 0.3)); return; }
        m.visible = true;
        var hb = slowmo(back);
        m.position.lerpVectors(it.p1, it.p0, hb); m.position.y += Math.sin(Math.PI * hb) * R.size * 0.8;
        m.quaternion.copy(it.q1).slerp(it.q0, hb);
        m.scale.setScalar(it.sz + (it.s0 - it.sz) * hb);
        setOp(R, it, Math.min(clamp01(back / 0.18), 1 - clamp01((back - 0.78) / 0.22)));
        if (it.lab) it.lab.visible = false;
        return;
      }
      var u = clamp01((t - it.ts) / R.fly);
      if (it.kind === 'cube') {
        if (t < it.ts) { m.visible = false; return; }
        if (!m.visible && !R.swished) { R.swished = true; try { if (typeof FxSfx !== 'undefined') FxSfx.swish(); } catch (e) {} }   // one soft swish as they lift off
        m.visible = true;
        var e = slowmo(u);
        if (!it.landed || !R.plan || !R.plan.steps[0].begun) {
          m.position.lerpVectors(it.p0, it.p1, e);
          m.position.y += Math.sin(Math.PI * Math.min(1, u * 1.1)) * R.size * 1.1 * (1 - u * 0.4);   // lift off, arc over
          m.quaternion.copy(it.q0).slerp(it.q1, Math.min(1, easeOutBack(u)));
          var sc = it.s0 + (it.sz - it.s0) * e;
          if (it.landed) { var q = (t - it.tLanded) / 0.26; if (q < 1) { var sq = Math.sin(q * Math.PI) * 0.1 * (1 - q); m.scale.set(sc * (1 + sq), sc * (1 - sq), sc * (1 + sq)); } else m.scale.setScalar(sc); }
          else m.scale.setScalar(sc);
        }
      } else {
        if (t < it.tl - 0.12) { m.visible = false; return; }
        m.visible = true;
        if (!R.plan || !R.plan.steps[0].begun) { var p = clamp01((t - (it.tl - 0.12)) / 0.24), s = easeOutBack(p); m.scale.set(R.size * 0.5 * s, R.size * 1.25 * s, 1); }
      }
      if (u >= 1 && !it.landed) landed(R, it, k);
      if (it.lab && !(R.plan && R.plan.steps[0].begun)) it.lab.visible = it.landed;
    });
    // 2. work it out
    if (R.plan && !R.calm && t >= R.tSteps && !back) {
      stepRow(R, t);
      R.plan.steps.forEach(function (st) { if (st.popped) st.make.from.forEach(function (k) { var el = R.els[k]; if (el.seq != null) el.merged = true; }); });
    }
    // the counting value (fallback only)
    if (R.to && R.from != null) {
      var cu = clamp01((t - R.tv) / 0.26), val = Math.round(R.from + (R.to.n - R.from) * cu), txt = cu >= 1 ? fmt(R.to) : String(val);
      if (txt !== R.shown) { R.shown = txt; paintLabel(R, '= ' + txt, false); }
      if (cu >= 1) R.from = null;
    }
    // 3. = GOAL!
    if (t >= R.tGoal && !R.goalShown) {
      R.goalShown = true; R.label.visible = true;
      var last = R.plan ? R.els[R.plan.steps[R.plan.steps.length - 1].make.key] : null;
      var gt = R.plan ? goalText(R, R.plan.value) : R.goal;
      paintLabel(R, last ? (gt != null ? '= ' + R.goal + '   GOAL!' : 'GOAL!') : '= ' + R.goal + '   GOAL!', true);
      if (last) { paintText(R.cap, R.expr, { soft: true, k: 0.7 }); R.cap.visible = true; }
      try { if (typeof crowdReact === 'function') crowdReact('cheer'); else if (T3.crowd) T3.crowd('cheer'); } catch (e) {}
      snd('chime');
      if (!R.calm) { try { if (T3.fx) T3.fx('flash'); } catch (e) {} burst(R, last ? last.x : 0); }
      if (T3.setBoard) T3.setBoard(R.expr + '\n= ' + R.goal + '  GOAL!');
    }
    if (R.goalShown && !R.calm) {
      var gp = clamp01((t - R.tGoal) / 0.5), pulse = 1 + Math.sin(gp * Math.PI) * 0.16;
      R.label.scale.set(R.labelScale.x * pulse, R.labelScale.y * pulse, 1);
      if (R.plan && !back) {   // the last tile grows a little: the answer is the star
        var lt = R.els[R.plan.steps[R.plan.steps.length - 1].make.key], gk = 1 + 0.3 * easeOutBack(clamp01((t - R.tGoal) / 0.45));
        if (lt && lt.m.visible) lt.m.scale.set(lt.w * R.size * gk, R.size * gk, 1);
      }
    }
    stepBurst(R, t);
    // the tiles, labels and caption go before the cubes fly home
    if (back > 0 || (R.calm && outK > 0)) {
      var a = 1 - clamp01((R.calm ? outK : back / 0.3));
      R.label.material.opacity = a; R.cap.material.opacity = a;
      Object.keys(R.els).forEach(function (k) { var el = R.els[k]; if (el.tile && !el.gone) { el.m.material.opacity = a; el.m.visible = a > 0.01; el.m.scale.multiplyScalar(1 + (1 - a) * 0.02); } });
    }
    ctx.dirty();
    if (t >= R.tEnd) finish(R);
  }
  function setOp(R, it, a) {
    if (it.kind === 'cube' && it.real) { if (!it.ownMat) { it.ownMat = it.m.material.clone(); R.disp.push(it.ownMat); it.m.material = it.ownMat; } }
    if (it.m.material) it.m.material.opacity = a;
    if (it.lab) it.lab.material.opacity = a;
  }

  // ONE burst of sparks round the result (camera space, additive points)
  function burst(R, cx) {
    var N = 36, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), geo = new THREE.BufferGeometry(), sp = [];
    for (var i = 0; i < N; i++) { var a = i / N * Math.PI * 2 + Math.random() * 0.1, v = R.size * (1.6 + Math.random() * 1.1); sp.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, c: i % 3 === 0 ? [1, 1, 1] : i % 3 === 1 ? [1, 0.82, 0.25] : [1, 0.55, 0.2] }); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({ size: R.size * 0.32, map: dot(), vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false, toneMapped: false });
    var pts = new THREE.Points(geo, mat); pts.renderOrder = 15; pts.frustumCulled = false; R.group.add(pts);
    R.disp.push(geo); R.disp.push(mat);
    R.burst = { pts: pts, sp: sp, t0: R.tGoal, cx: cx, pos: pos, col: col, geo: geo };
  }
  function stepBurst(R, t) {
    var b = R.burst; if (!b) return;
    var age = t - b.t0, L = age / 0.9;
    if (L >= 1) { b.pts.visible = false; R.burst = null; return; }
    var ex = 1 - Math.exp(-age * 4.5), fade = Math.pow(1 - L, 1.4);
    b.sp.forEach(function (p, i) {
      var j = i * 3; b.pos[j] = b.cx + p.vx * ex; b.pos[j + 1] = R.rowY + p.vy * ex - age * age * R.size * 0.9; b.pos[j + 2] = -DIST + 0.3;
      b.col[j] = p.c[0] * fade; b.col[j + 1] = p.c[1] * fade; b.col[j + 2] = p.c[2] * fade;
    });
    b.geo.attributes.position.needsUpdate = true; b.geo.attributes.color.needsUpdate = true;
  }

  function cleanup(R) {
    try { if (R.hook) { var i = ctx.hooks.frame.indexOf(R.hook); if (i >= 0) ctx.hooks.frame.splice(i, 1); } } catch (e) {}
    try { if (R.group && R.group.parent) R.group.parent.remove(R.group); } catch (e) {}
    // only what the replay made itself (the cube copies share the real cubes' geometry and textures: those stay)
    (R.disp || []).forEach(function (x) { try { x.dispose(); } catch (e) {} });
    R.disp = [];
  }
  function finish(R) {
    if (!R || R.over) return;
    R.over = true; clearTimeout(R.safety);
    cleanup(R);
    if (!R.goalShown && R.expr && T3.setBoard) { try { T3.setBoard(R.expr + '\n= ' + R.goal + '  GOAL!'); } catch (e) {} }   // skipped: the board still ends on the Solution
    if (run === R) run = null;
    try { ctx.dirty(); ctx.startLoop(); } catch (e) {}
    var d = R.done; R.done = null;
    if (d) { try { d(); } catch (e) { try { console.error(e); } catch (e2) {} } }
  }

  T3.replay = function (tokens, opts, done) { try { return start(tokens, opts, done); } catch (e) { return null; } };
  T3.replayActive = function () { return !!run; };
  T3._replayPlan = function (tokens, opts) { return planSteps(tokens, opts || {}); };   // checks
  T3._replayRun = function () { return run; };                                         // checks
}
