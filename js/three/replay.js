// Goal replay in 3D: when a shake ends with a correct Solution, big copies of its cubes lift off the table and
// fly together into one row in front of the camera, left to right, with the parentheses; each lands with a thunk,
// a running value counts up underneath, then "= 37 GOAL!" flashes, the stadium board shows the Solution and the
// crowd cheers once. About 3 to 4 seconds. Then everything is removed: nothing is left moving.
//
//   T3.replay(tokens, opts, done) -> handle {skip()} | null
//     tokens: the Solution as game tokens ('(' / ')' strings and {s, id} cube tokens; id -1 = no real cube)
//     opts:   {goal: '37' (text), cubes: G.cubes (for colours), fractions: G.fractions, wild: digit for a wild 0}
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
  var run = null;

  function isCube(t) { return t && typeof t === 'object' && t.s !== '(' && t.s !== ')'; }
  function sym(t) { return typeof t === 'string' ? t : t && t.s; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function easeOutBack(k) { var c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }

  function canvasTex(w, h, paint) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var g = cv.getContext('2d'); paint(g, w, h);
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.userData = { cv: cv, paint: paint }; return t;
  }
  function textSprite(w, h, paint, order) {
    var tex = canvasTex(w, h, paint);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    sp.renderOrder = order || 12; return sp;
  }
  function parenPaint(ch) {
    return function (g, w, h) {
      g.font = '900 ' + Math.round(h * 0.86) + 'px "Trebuchet MS", "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = h * 0.08; g.strokeStyle = 'rgba(10,20,50,.85)'; g.strokeText(ch, w / 2, h * 0.5); g.fillStyle = '#ffffff'; g.fillText(ch, w / 2, h * 0.5);
    };
  }
  // the dark "REPLAY" band behind the row
  function bandPaint(g, w, h) {
    var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(6,16,44,0)'); gr.addColorStop(0.18, 'rgba(6,16,44,.62)'); gr.addColorStop(0.82, 'rgba(6,16,44,.62)'); gr.addColorStop(1, 'rgba(6,16,44,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,212,59,.9)'; g.fillRect(0, h * 0.18, w, 3); g.fillRect(0, h * 0.82 - 3, w, 3);
    g.font = '900 ' + Math.round(h * 0.085) + 'px "Trebuchet MS", sans-serif'; g.textBaseline = 'top'; g.fillStyle = '#ffd43b';
    g.fillText('↻  REPLAY', w * 0.075, h * 0.2 + 8);
  }
  // a stand-in cube (no real cube to copy): a box with the symbol on its front, in the cube's colours
  function standInTex(s, color) {
    var c = COL[color] || COL.none;
    return canvasTex(128, 128, function (g) {
      var lg = g.createLinearGradient(0, 0, 128, 128); lg.addColorStop(0, c[0]); lg.addColorStop(1, c[1]); g.fillStyle = lg; g.fillRect(0, 0, 128, 128);
      g.font = '900 80px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillText(SHOW(s), 66, 70); g.fillStyle = color === 'none' ? '#222' : '#fff'; g.fillText(SHOW(s), 64, 66);
    });
  }
  // The value of the Solution so far, read left to right: trailing operators and '(' are left off, open
  // parentheses are closed. null when it doesn't make a number yet.
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
  // a symbol a value can end on: a number (also a turned cube, a power of ten, the big die), ')', '!', an exponent, x²
  function endsNumber(s) {
    if (/^[0-9]$/.test(s) || s === ')') return true;
    try { return Eq.isNumSym(s) || s === '!' || Eq.exOf(s) >= 0 || !!(Eq.OPDEF[s] && Eq.OPDEF[s].kind === 'post'); } catch (e) { return false; }
  }
  function fmt(v) { try { return Eq.fmt(v); } catch (e) { return String(v); } }

  function start(tokens, opts, done) {
    if (run || !Array.isArray(tokens) || !tokens.length) return null;
    if (!ctx.layout || document.hidden || (typeof current !== 'undefined' && current !== 'game')) return null;
    opts = opts || {};
    var camera = ctx.camera, meshes = ctx.meshes || [], cubes = opts.cubes || [];
    var R = { items: [], disp: [], t0: performance.now(), done: done, over: false };
    function own(x) { R.disp.push(x); return x; }
    try {
      camera.updateMatrixWorld();
      var group = new THREE.Group(); group.renderOrder = 10; R.group = group;
      var fovR = camera.fov * Math.PI / 180, DIST = 10, vh = 2 * DIST * Math.tan(fovR / 2), vw = vh * (camera.aspect || 1.5);
      // slot widths (in cube sizes): cube 1, parenthesis 0.42, a small gap between
      // VARI3D: with a variation card, a turned cube flies in turned, an exponent sits raised and small, labels float over cubes
      var vr = null; try { if (Eq.rulesOf(opts.fractions).any) { vr = variRow(tokens, opts.fractions); if (!anyVari(vr)) vr = null; } } catch (e) { vr = null; }
      var GAP = 0.14, widths = tokens.map(function (t, i) { return isCube(t) ? (vr && vr[i].exp ? 0.6 : 1) : 0.42; });
      var total = widths.reduce(function (a, b) { return a + b; }, 0) + GAP * (tokens.length - 1);
      var size = Math.min(vh * 0.2, (vw * 0.84) / Math.max(total, 3.2));
      var rowY = vh * 0.06, labelY = rowY - size * 1.15;
      // the band behind
      var band = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), own(new THREE.MeshBasicMaterial({ map: own(canvasTex(1024, 256, bandPaint)), transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false })));
      band.renderOrder = 10; band.scale.set(vw * 1.1, size * 3.6, 1); band.position.set(0, rowY - size * 0.42, -DIST - 0.5); group.add(band); R.band = band;
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
        var v = vr && vr[i], it = { kind: isCube(t) ? 'cube' : 'paren', s: sym(t), seq: seq++, p1: new THREE.Vector3(cx, rowY, -DIST), landed: false, sz: size };
        if (v && v.exp) { it.p1.set(cx - 0.12 * size, rowY + 0.42 * size, -DIST); it.sz = size * 0.58; }
        var qT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), v ? v.turn : 0);   // about the table's up axis
        if (it.kind === 'cube') {
          var src = t.id != null && t.id >= 0 ? meshes[t.id] : null, mesh;
          if (src && src.visible && src.material && src.geometry) {
            mesh = new THREE.Mesh(src.geometry, copyMat(src.material));
            src.getWorldPosition(ws); src.getWorldQuaternion(wq);
            it.p0 = camera.worldToLocal(ws.clone());
            it.q0 = camQi.clone().multiply(wq);
            it.q1 = RX.clone().multiply(qT).multiply(wq);       // the face that was on top now faces the camera, upright (or turned)
            it.s0 = src.scale.x * 1.02;
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
        R.items.push(it);
      });
      if (vr) layoutLabels(R.items, size);
      // running value + "= GOAL" label
      R.label = textSprite(1024, 200, function () {}, 13); own(R.label.material); own(R.label.material.map); R.label.scale.set(size * 5.1, size * 1.0, 1); R.label.position.set(0, labelY, -DIST); R.label.visible = false; group.add(R.label);
      R.size = size; R.labelScale = R.label.scale.clone();
      // timing (seconds): cubes start one after another; everything lands within ~2.3 s
      var n = R.items.length;
      R.stag = Math.min(0.26, 1.3 / Math.max(1, n - 1)); R.fly = 0.6; R.lead = 0.25;
      R.items.forEach(function (it) { it.ts = R.lead + it.seq * R.stag; it.tl = it.ts + R.fly; });
      R.tLand = R.items[n - 1].tl; R.tGoal = R.tLand + 0.3; R.tOut = R.tGoal + 1.15; R.tEnd = R.tOut + 0.35;
      // the running values, worked out once
      var syms = tokens.map(sym), vals = [];
      for (var k = 0; k < n; k++) vals.push(prefixValue(syms.slice(0, k + 1), opts));
      R.vals = vals; R.shown = null; R.from = null; R.to = null; R.tv = 0;
      R.goal = opts.goal != null ? String(opts.goal) : (vals[n - 1] != null ? fmt(vals[n - 1]) : '');
      R.expr = syms.map(SHOW).join('');
      camera.add(group);
      R.hook = function (now) { try { step(R, now); } catch (e) { try { console.warn('[replay]', e); } catch (e2) {} finish(R); } };
      ctx.hooks.frame.push(R.hook);
      R.safety = setTimeout(function () { finish(R); }, 7000);
      run = R;
      paintLabel(R, '', false);
      if (T3.setBoard) T3.setBoard('REPLAY');
      ctx.dirty(); ctx.startLoop();
      return { skip: function () { finish(R); } };
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
    labs.forEach(function (l) { l.it.lab.position.set((l.x0 + l.x1) / 2 + l.dx, -((l.y0 + l.y1) / 2 - l.lift), -DIST_L); });
  }
  var DIST_L = 10;   // the row's distance in front of the camera (DIST in start)
  function paintLabel(R, text, gold) {
    var tex = R.label.material.map, cv = tex.userData.cv, g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.clearRect(0, 0, w, h);
    if (text) {
      g.font = '900 ' + Math.round(h * 0.62) + 'px "Trebuchet MS", "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = h * 0.1; g.strokeStyle = 'rgba(6,16,44,.9)'; g.strokeText(text, w / 2, h * 0.53);
      if (gold) { g.shadowColor = '#ffb000'; g.shadowBlur = 26; }
      g.fillStyle = gold ? '#ffd43b' : '#ffffff'; g.fillText(text, w / 2, h * 0.53); g.shadowBlur = 0;
    }
    tex.needsUpdate = true;
  }

  function landed(R, it, k) {
    it.landed = true; it.tLanded = (performance.now() - R.t0) / 1000;
    if (it.kind === 'cube') { try { Snd.thunk(); } catch (e) {} }
    var v = R.vals[k];
    if (v != null) {
      var sv = fmt(v);
      if (R.shown !== sv) {
        // count up between whole numbers; anything else just switches
        var a = R.cur, ok = a && a.d === 1 && v.d === 1 && Math.abs(v.n - a.n) <= 400;
        R.from = ok ? a.n : null; R.to = v; R.tv = it.tLanded; R.cur = v;
        if (!ok) { R.shown = sv; paintLabel(R, '= ' + sv, false); }
        R.label.visible = true;
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
    var t = (now - R.t0) / 1000, cam = ctx.camera;
    // band fades in, and out at the end
    var fadeOut = clamp01((t - R.tOut) / (R.tEnd - R.tOut));
    R.band.material.opacity = Math.min(clamp01(t / 0.25), 1 - fadeOut);
    R.items.forEach(function (it, k) {
      var u = clamp01((t - it.ts) / R.fly), m = it.m;
      if (it.kind === 'cube') {
        if (t < it.ts) { m.visible = false; return; }
        if (!m.visible && !R.swished) { R.swished = true; try { if (typeof FxSfx !== 'undefined') FxSfx.swish(); } catch (e) {} }   // one soft swish as they lift off
        m.visible = true;
        var e = easeInOut(u);
        m.position.lerpVectors(it.p0, it.p1, e);
        m.position.y += Math.sin(Math.PI * Math.min(1, u * 1.15)) * R.size * 1.1 * (1 - u * 0.4);   // lift off, arc over
        m.quaternion.copy(it.q0).slerp(it.q1, Math.min(1, easeOutBack(u)));
        var sc = it.s0 + (it.sz - it.s0) * e;
        if (it.landed) { var q = (t - it.tLanded) / 0.22; if (q < 1) { var sq = Math.sin(q * Math.PI) * 0.12 * (1 - q); m.scale.set(sc * (1 + sq), sc * (1 - sq), sc * (1 + sq)); } else m.scale.setScalar(sc); }
        else m.scale.setScalar(sc);
      } else {
        if (t < it.tl - 0.12) { m.visible = false; return; }
        m.visible = true; var p = clamp01((t - (it.tl - 0.12)) / 0.24), s = easeOutBack(p);
        m.scale.set(R.size * 0.5 * s, R.size * 1.25 * s, 1);
      }
      if (u >= 1 && !it.landed) landed(R, it, k);
      if (it.lab) it.lab.visible = it.landed;
    });
    // the counting value
    if (R.to && R.from != null) {
      var cu = clamp01((t - R.tv) / 0.26), val = Math.round(R.from + (R.to.n - R.from) * cu), txt = cu >= 1 ? fmt(R.to) : String(val);
      if (txt !== R.shown) { R.shown = txt; paintLabel(R, '= ' + txt, false); }
      if (cu >= 1) R.from = null;
    }
    // = GOAL!
    if (t >= R.tGoal && !R.goalShown) {
      R.goalShown = true; R.label.visible = true;
      paintLabel(R, '= ' + R.goal + '   GOAL!', true);
      try { if (typeof crowdReact === 'function') crowdReact('cheer'); else if (T3.crowd) T3.crowd('cheer'); } catch (e) {}
      try { Snd.chime(); } catch (e) {}
      try { if (T3.fx) T3.fx('flash'); } catch (e) {}
      if (T3.setBoard) T3.setBoard(R.expr + '\n= ' + R.goal + '  GOAL!');
    }
    if (R.goalShown) {
      var gp = clamp01((t - R.tGoal) / 0.45), pulse = 1 + Math.sin(gp * Math.PI) * 0.22;
      R.label.scale.set(R.labelScale.x * pulse, R.labelScale.y * pulse, 1);
    }
    // fade out: everything shrinks a little and goes see-through
    if (fadeOut > 0) {
      var a = 1 - fadeOut;
      Object.keys(R.mats).forEach(function (k) { R.mats[k].opacity = a; });
      R.items.forEach(function (it) { if (it.m.material) it.m.material.opacity = a; });
      R.label.material.opacity = a;
      R.items.forEach(function (it) { if (it.lab) it.lab.material.opacity = a; });
    }
    ctx.dirty();
    if (t >= R.tEnd) finish(R);
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
}
