// ON-SETS on the 3D table (an ES module next to js/three/table.js; loaded by js/onsets/game.js).
// What it adds to the shared 3D world, through the small ONSETS hooks in table.js and T3.ctx:
//   - the On-Sets cube kinds (T3.cubeKind): digit cubes 1 1 2 3 4 5, colour cubes (a coloured dot), operation cubes
//     ∪ ∩ − ′ and the white V / Λ cubes. All their faces are drawn into ONE atlas canvas; each kind is a view of it
//     (a texture clone with its own offset: the image is uploaded once).
//   - the Universe: up to 16 real cards lying face up in a neat grid in the table's 'universe' zone. Three instanced
//     meshes (card bodies, faces from one 4 x 4 atlas of the 16 cards, a soft glow under lifted cards): three draw calls.
//   - the teaching motion: the cards of a set LIFT (one smooth ease, tilted a little toward the seat camera) and glow,
//     the others dim, and a label above them says how many ("R ∪ B: 7 cards"). Nothing loops: every change is one
//     ease to a new resting pose, and the render loop goes back to idle when it is done.
//   - the forming replay: a short sequence of those lifts, step by step (R rises, then ∪ B joins...), ending with the
//     count next to the Goal. A tap skips it.
// API: T3.onsets = { ready, enter(), exit(), clear(), deal(universe, side, done), highlight(mask | null, label),
//                    form(steps, {final, ok}, done) -> bool, forming() }
// Colour-blind hooks (another helper's js/a11y.js): A11y.dotShape(colour), A11y.cubeMark(colour) and
// A11y.drawFacePattern(ctx, colour, size) are used when they exist (colour = 'blue' | 'red' | 'green' | 'yellow').
import * as THREE from 'three';

(function boot(tries) {
  var T3 = window.T3;
  if (!T3) return;
  if (!T3.ctx || !T3.ctx.scene || !T3.cubeKind) { if (tries < 80) setTimeout(function () { boot(tries + 1); }, 100); return; }
  install(T3, T3.ctx);
})(0);

function install(T3, ctx) {
  var HEX = { B: '#1c7ed6', R: '#e03131', G: '#2f9e44', Y: '#f5b400' }, LIGHT = { B: '#74c0fc', R: '#ff8787', G: '#8ce99a', Y: '#ffec99' };
  var NAME = { B: 'blue', R: 'red', G: 'green', Y: 'yellow' }, ORDER = ['B', 'R', 'G', 'Y'];
  var SHOW = { U: '∪', I: '∩', '-': '−', "'": '′', V: 'V', N: 'Λ', '=': '=', S: '⊆' };
  var FONT = '"Trebuchet MS", "Segoe UI Symbol", "Segoe UI", "Arial Unicode MS", sans-serif';
  var KINDS = [
    { name: 'osD', faces: ['1', '1', '2', '3', '4', '5'], look: 'digit' },
    { name: 'osC1', faces: ['B', 'R', 'G', 'Y', 'B', 'R'], look: 'color' },
    { name: 'osC2', faces: ['B', 'R', 'G', 'Y', 'G', 'Y'], look: 'color' },
    { name: 'osO1', faces: ['U', 'I', '-', "'", 'U', 'I'], look: 'op' },
    { name: 'osO2', faces: ['U', 'I', '-', "'", '-', "'"], look: 'op' },
    { name: 'osR', faces: ['V', 'N', '=', 'S', 'V', 'N'], look: 'restr' }
  ];
  function a11y(fn) { try { return typeof A11y !== 'undefined' && A11y && typeof A11y[fn] === 'function' ? A11y[fn] : null; } catch (e) { return null; } }
  function a11ySig() { var f = a11y('dotShape'), m = a11y('cubeMark'); try { return ORDER.map(function (c) { return (f ? f(NAME[c]) : '') + '/' + (m ? m(NAME[c]) : ''); }).join(',') + (a11y('drawFacePattern') ? '+p' : ''); } catch (e) { return ''; } }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // one coloured dot (a circle, or the colour-blind shape when that setting gives one)
  function dot(g, cx, cy, r, c) {
    var shape = null, f = a11y('dotShape'); try { shape = f ? f(NAME[c]) : null; } catch (e) {}
    g.save(); g.beginPath();
    if (shape === 'square') rr(g, cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72, r * 0.25);
    else if (shape === 'triangle') { g.moveTo(cx, cy - r * 1.05); g.lineTo(cx + r * 1.0, cy + r * 0.8); g.lineTo(cx - r * 1.0, cy + r * 0.8); g.closePath(); }
    else if (shape === 'diamond') { g.moveTo(cx, cy - r * 1.1); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r * 1.1); g.lineTo(cx - r, cy); g.closePath(); }
    else if (shape === 'star') { for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rk = k % 2 ? r * 0.48 : r * 1.08; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rk, cy + Math.sin(a) * rk); } g.closePath(); }
    else g.arc(cx, cy, r, 0, Math.PI * 2);
    var gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1); gr.addColorStop(0, LIGHT[c]); gr.addColorStop(0.7, HEX[c]); gr.addColorStop(1, HEX[c]);
    g.fillStyle = gr; g.fill();
    g.lineWidth = Math.max(1.5, r * 0.08); g.strokeStyle = 'rgba(0,0,0,.22)'; g.stroke();
    g.clip();
    var pat = a11y('drawFacePattern');
    if (pat) { try { g.translate(cx - r, cy - r); pat(g, NAME[c], 2 * r); } catch (e) {} }
    g.restore();
    var mk = a11y('cubeMark'), letter = null; try { letter = mk ? mk(NAME[c]) : null; } catch (e) {}
    if (letter) { g.font = '900 ' + Math.round(r * 0.95) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = r * 0.16; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(String(letter), cx, cy + r * 0.05); g.fillStyle = '#fff'; g.fillText(String(letter), cx, cy + r * 0.05); }
  }

  // ---------------- the cube faces: one atlas, 6 kinds in a 2 x 3 grid of 3 x 2 face blocks ----------------
  function drawCubeFace(g, look, s) {
    var bg = look === 'digit' ? ['#ffb15c', '#e8590c'] : look === 'op' ? ['#5b6aa0', '#1f2a52'] : look === 'restr' ? ['#c5b3ff', '#6741d9'] : ['#fffdf4', '#e3ddcc'];
    var lg = g.createLinearGradient(0, 0, 128, 128); lg.addColorStop(0, bg[0]); lg.addColorStop(1, bg[1]); g.fillStyle = lg; g.fillRect(0, 0, 128, 128);
    var eg = g.createRadialGradient(54, 50, 40, 64, 64, 98); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, look === 'color' ? 'rgba(80,60,20,.18)' : 'rgba(0,0,0,.28)'); g.fillStyle = eg; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,.16)'; rr(g, 12, 10, 104, 26, 13); g.fill();
    if (look === 'color') { dot(g, 64, 66, 33, s); return; }
    var label = SHOW[s] || s, size = s === "'" ? 120 : label === '⊆' ? 76 : 84;
    g.font = '900 ' + size + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    var y = s === "'" ? 86 : 68, x = s === "'" ? 60 : 64;
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillText(label, x + 1.5, y + 3.5);
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.38)'; g.strokeText(label, x, y);
    g.fillStyle = '#fff'; g.fillText(label, x, y);
  }
  var cubeAtlas = { res: 0, sig: null, base: null };
  function cubeBase(res) {
    res = Math.min(res || 256, 384);
    if (cubeAtlas.base && cubeAtlas.res === res) return cubeAtlas.base;
    if (cubeAtlas.base) cubeAtlas.base.dispose();
    var cv = document.createElement('canvas'); cv.width = 6 * res; cv.height = 6 * res; var g = cv.getContext('2d');
    KINDS.forEach(function (K, b) {
      var bx = b % 2, by = Math.floor(b / 2);
      K.faces.forEach(function (s, k) {
        g.save(); g.translate((bx * 3 + k % 3) * res, (by * 2 + Math.floor(k / 3)) * res); g.beginPath(); g.rect(0, 0, res, res); g.clip(); g.scale(res / 128, res / 128);
        drawCubeFace(g, K.look, s); g.restore();
      });
    });
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    cubeAtlas.base = t; cubeAtlas.res = res; cubeAtlas.sig = a11ySig();
    return t;
  }
  function registerKinds() {
    KINDS.forEach(function (K, b) {
      T3.cubeKind(K.name, { faces: K.faces, tex: function (res) {
        var t = cubeBase(res).clone(); t.repeat.set(0.5, 1 / 3); t.offset.set((b % 2) * 0.5, 1 - (Math.floor(b / 2) + 1) / 3); t.needsUpdate = true; return t;
      } });
    });
  }
  registerKinds();

  // ---------------- the cards ----------------
  var CW = 1.3, CH = 1.72, CT = 0.05, MAXC = 16;
  var cardAtlas = null, cardSig = null;
  function cardAtlasTex() {
    var sig = a11ySig();
    if (cardAtlas && cardSig === sig) return cardAtlas;
    var cw = 256, ch = 340, cv = document.createElement('canvas'); cv.width = 4 * cw; cv.height = 4 * ch; var g = cv.getContext('2d');
    for (var card = 0; card < 16; card++) {
      g.save(); g.translate((card % 4) * cw, Math.floor(card / 4) * ch);
      var bg = g.createLinearGradient(0, 0, 0, ch); bg.addColorStop(0, '#fffdf6'); bg.addColorStop(1, '#f1ece0'); g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
      g.lineWidth = 7; g.strokeStyle = '#d6cfbd'; rr(g, 9, 9, cw - 18, ch - 18, 24); g.stroke();
      ORDER.forEach(function (c, k) { if (card & (1 << k)) dot(g, cw * (k % 2 ? 0.7 : 0.3), ch * (k < 2 ? 0.31 : 0.69), cw * 0.165, c); });
      g.restore();
    }
    if (cardAtlas) cardAtlas.dispose();
    cardAtlas = new THREE.CanvasTexture(cv); cardAtlas.colorSpace = THREE.SRGBColorSpace; cardAtlas.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    cardSig = sig;
    if (faceMat) { faceMat.map = cardAtlas; faceMat.needsUpdate = true; }
    return cardAtlas;
  }
  function roundShape(w, h, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  var group = new THREE.Group(); group.visible = false; group.name = 'onsets-cards'; ctx.scene.add(group);
  var bodyGeo = new THREE.ExtrudeGeometry(roundShape(CW, CH, 0.12), { depth: CT, bevelEnabled: false, curveSegments: 5 }); bodyGeo.rotateX(-Math.PI / 2);
  var faceGeo = (function () {
    var w = CW - 0.06, h = CH - 0.06, g = new THREE.ShapeGeometry(roundShape(w, h, 0.1), 5), p = g.attributes.position, uv = g.attributes.uv;
    for (var i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
    g.rotateX(-Math.PI / 2); g.translate(0, CT + 0.003, 0);
    g.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 2), 2));
    return g;
  })();
  var bodyMat = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.7 });
  var faceMat = new THREE.MeshStandardMaterial({ map: null, roughness: 0.55, metalness: 0 });
  faceMat.onBeforeCompile = function (sh) {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv = vMapUv * 0.25 + aCell;\n#endif');
  };
  faceMat.customProgramCacheKey = function () { return 'onsets-card-face'; };
  var haloTex = (function () {
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 160; var g = cv.getContext('2d');
    g.shadowColor = '#ffd43b'; g.shadowBlur = 26; g.strokeStyle = 'rgba(255,224,102,.95)'; g.lineWidth = 10; rr(g, 22, 22, 84, 116, 14); g.stroke(); g.stroke();
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  var haloGeo = new THREE.PlaneGeometry(CW * 1.5, CH * 1.42); haloGeo.rotateX(-Math.PI / 2);
  var haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  var bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, MAXC), faces = new THREE.InstancedMesh(faceGeo, faceMat, MAXC), halos = new THREE.InstancedMesh(haloGeo, haloMat, MAXC);
  bodies.castShadow = true; bodies.receiveShadow = true; faces.receiveShadow = true; halos.renderOrder = 2;
  [bodies, faces, halos].forEach(function (m) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); });
  faces.setColorAt(0, new THREE.Color(1, 1, 1));
  // the label above the lifted cards (and next to the Goal at the end of a replay)
  var labelCv = document.createElement('canvas'); labelCv.width = 1024; labelCv.height = 192;
  var labelTex = new THREE.CanvasTexture(labelCv); labelTex.colorSpace = THREE.SRGBColorSpace;
  var label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  label.renderOrder = 20; label.visible = false; group.add(label);
  var labelK = 0, labelTgt = 0, labelAt = 'uni';
  function paintLabel(text, good) {
    var g = labelCv.getContext('2d'); g.clearRect(0, 0, 1024, 192);
    g.font = '900 84px ' + FONT; var w = Math.min(1000, g.measureText(text).width + 90);
    rr(g, (1024 - w) / 2, 24, w, 144, 72); g.fillStyle = good ? 'rgba(20,90,40,.88)' : 'rgba(10,22,58,.86)'; g.fill();
    g.lineWidth = 6; g.strokeStyle = good ? '#8ce99a' : '#ffd43b'; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    var fs = 84; while (fs > 40 && g.measureText(text).width > 940) { fs -= 4; g.font = '900 ' + fs + 'px ' + FONT; }
    g.fillText(text, 512, 98);
    labelTex.needsUpdate = true;
  }

  // ---------------- state ----------------
  var st = { on: false, uni: [], base: [], s: 1, lift: [], liftT: [], dim: [], dimT: [], deal: null, layKey: '', lastNow: 0, form: null };
  var M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
  function zoneRect(z) { var L = ctx.layout; return L && L.z && L.z[z] ? L.z[z] : null; }
  function layout() {
    var r = zoneRect('universe'), n = st.uni.length; st.base = [];
    if (!r || !n) return;
    var ax = r[0] + 0.3, az = r[1] + 0.95, aw = r[2] - 0.6, ad = r[3] - 1.15, best = null;
    for (var c = 1; c <= n; c++) {
      var rows = Math.ceil(n / c), s = Math.min(1.5, aw / (c * CW * 1.12), ad / (rows * CH * 1.08));
      if (!best || s > best.s + 1e-6) best = { c: c, rows: rows, s: s };
    }
    st.s = best.s;
    var gx = CW * 1.12 * best.s, gz = CH * 1.08 * best.s, x0 = ax + (aw - best.c * gx) / 2 + gx / 2, z0 = az + (ad - best.rows * gz) / 2 + gz / 2;
    for (var i = 0; i < n; i++) {
      var row = Math.floor(i / best.c), inRow = row < best.rows - 1 ? best.c : n - row * best.c, col = i % best.c, xr = ax + (aw - inRow * gx) / 2 + gx / 2;
      st.base.push({ x: xr + col * gx, z: z0 + row * gz });
    }
    st.layKey = ctx.layoutName + ':' + r.join(',');
  }
  function labelPos() {
    var r = zoneRect(labelAt === 'goal' ? 'goal' : 'universe'); if (!r) return;
    label.position.set(r[0] + r[2] / 2, labelAt === 'goal' ? 2.7 : 2.3, r[1] + (labelAt === 'goal' ? r[3] * 0.45 : 0.45));
    var w = Math.min(r[2] + 1, 7.5) * (labelAt === 'goal' ? 1.05 : 1); label.scale.set(w, w * 192 / 1024, 1);
  }
  function pose(now) {
    var n = st.uni.length, cells = faceGeo.attributes.aCell, dl = st.deal;
    for (var i = 0; i < n; i++) {
      var b = st.base[i]; if (!b) continue;
      var l = st.lift[i], s = st.s, y = 0.0, x = b.x, z = b.z, rotY = 0, k = 1;
      if (dl) {
        k = Math.max(0, Math.min(1, (now - dl.t0 - i * dl.gap) / dl.dur));
        var e = k * k * (3 - 2 * k);
        x = dl.from.x + (b.x - dl.from.x) * e; z = dl.from.z + (b.z - dl.from.z) * e; y = dl.from.y * (1 - e) + Math.sin(Math.PI * e) * 1.1; rotY = (1 - e) * dl.spin;
        if (k <= 0) s = 0.0001;
      }
      P.set(x, y + l * 0.5 * s, z); E.set(0.24 * l, rotY, 0); Q.setFromEuler(E); SC.set(s, s, s);
      M.compose(P, Q, SC); bodies.setMatrixAt(i, M); faces.setMatrixAt(i, M);
      SC.setScalar(Math.max(0.0001, s * l)); P.y = 0.02; E.set(0, 0, 0); Q.setFromEuler(E); M.compose(P, Q, SC); halos.setMatrixAt(i, M);
      var d = st.dim[i]; C.setRGB(1 - 0.48 * d, 1 - 0.48 * d, 1 - 0.44 * d); faces.setColorAt(i, C);
      cells.setXY(i, (st.uni[i] % 4) * 0.25, 1 - (Math.floor(st.uni[i] / 4) + 1) * 0.25);
    }
    bodies.count = faces.count = halos.count = n;
    bodies.instanceMatrix.needsUpdate = faces.instanceMatrix.needsUpdate = halos.instanceMatrix.needsUpdate = true;
    if (faces.instanceColor) faces.instanceColor.needsUpdate = true;
    cells.needsUpdate = true;
    label.material.opacity = labelK; label.visible = labelK > 0.01;
    if (label.visible) labelPos();
  }
  ctx.hooks.frame.push(function (now) {
    if (!st.on) { st.lastNow = now; return; }
    var dt = Math.min(0.05, Math.max(0, (now - (st.lastNow || now)) / 1000)); st.lastNow = now;
    var key = ctx.layoutName + ':' + (zoneRect('universe') || []).join(',');
    var moving = key !== st.layKey;
    if (moving) layout();
    var k = 1 - Math.exp(-dt * 7);
    for (var i = 0; i < st.uni.length; i++) {
      var dl = st.liftT[i] - st.lift[i], dd = st.dimT[i] - st.dim[i];
      if (Math.abs(dl) > 0.002) { st.lift[i] += dl * k; moving = true; } else if (dl) { st.lift[i] = st.liftT[i]; moving = true; }
      if (Math.abs(dd) > 0.002) { st.dim[i] += dd * k; moving = true; } else if (dd) { st.dim[i] = st.dimT[i]; moving = true; }
    }
    var dlb = labelTgt - labelK; if (Math.abs(dlb) > 0.004) { labelK += dlb * (1 - Math.exp(-dt * 9)); moving = true; } else if (dlb) { labelK = labelTgt; moving = true; }
    if (st.deal) {
      moving = true;
      if (now - st.deal.t0 > st.deal.dur + st.uni.length * st.deal.gap) { var dn = st.deal.done; st.deal = null; pose(now); if (dn) dn(); }
    }
    if (moving) { pose(now); ctx.dirty(); }
  });

  function setUni(uni) {
    st.uni = (uni || []).slice(0, MAXC); var n = st.uni.length;
    st.lift = new Array(n).fill(0); st.liftT = new Array(n).fill(0); st.dim = new Array(n).fill(0); st.dimT = new Array(n).fill(0);
    labelK = 0; labelTgt = 0; labelAt = 'uni';
    layout(); group.visible = st.on && n > 0; pose(performance.now());
  }
  function highlight(mask, text) {
    var on = mask != null;
    for (var i = 0; i < st.uni.length; i++) { var inSet = on && (mask & (1 << i)) !== 0; st.liftT[i] = inSet ? 1 : 0; st.dimT[i] = on && !inSet ? 1 : 0; }
    if (on && text) { paintLabel(text, false); labelAt = 'uni'; labelTgt = 1; labelPos(); } else labelTgt = 0;
    ctx.dirty(); ctx.startLoop();
  }
  // tap anywhere on the picture during a replay: skip to its end
  ctx.renderer.domElement.addEventListener('pointerdown', function (ev) { if (!st.form) return; ev.stopImmediatePropagation(); finishForm(); }, true);
  function finishForm() {
    var f = st.form; if (!f) return;
    st.form = null; f.timers.forEach(clearTimeout); highlight(null);
    if (f.done) { var d = f.done; f.done = null; d(); }
  }

  T3.onsets = {
    ready: true,
    enter: function () {
      st.on = true;
      if (cubeAtlas.base && cubeAtlas.sig !== a11ySig()) { cubeAtlas.base.dispose(); cubeAtlas.base = null; registerKinds(); if (T3.retheme) T3.retheme(); } // the colour-blind setting changed
      faceMat.map = cardAtlasTex(); faceMat.needsUpdate = true;
      setUni([]);
    },
    exit: function () { finishForm(); st.on = false; st.deal = null; setUni([]); group.visible = false; ctx.dirty(); },
    clear: function () { finishForm(); st.deal = null; setUni([]); ctx.dirty(); },
    // the dealer lays the cards out one by one, from their side of the table ('near' | 'far' | 'left' | 'right')
    deal: function (uni, side, done) {
      setUni(uni);
      var L = ctx.layout, W = L ? L.W : 18, D = L ? L.D : 14;
      var from = side === 'far' ? { x: 0, y: 1.6, z: -D / 2 - 1.2 } : side === 'left' ? { x: -W / 2 - 1.2, y: 1.6, z: 0 } : side === 'right' ? { x: W / 2 + 1.2, y: 1.6, z: 0 } : { x: 0, y: 1.6, z: D / 2 + 1.2 };
      if (document.hidden || !L) { pose(performance.now()); ctx.dirty(); if (done) done(); return; }
      st.deal = { t0: performance.now(), gap: 95, dur: 520, from: from, spin: side === 'far' ? Math.PI : 0, done: done };
      try { if (window.Snd && Snd.pickup) Snd.pickup(); } catch (e) {}
      ctx.dirty(); ctx.startLoop();
    },
    highlight: function (mask, text) { if (!st.on || st.form) return; highlight(mask, text); },
    // steps: [{set, count, text}] -> each step lifts its cards (about 1.1 s apart), then opts.final shows by the Goal
    form: function (steps, opts, done) {
      if (!st.on || !steps || !steps.length || document.hidden || !st.uni.length || !ctx.layout) return false;
      finishForm();
      var f = st.form = { timers: [], done: done }, gap = 1100, t = 350;
      steps.forEach(function (sp, k) {
        f.timers.push(setTimeout(function () { if (st.form !== f) return; highlight(sp.set, sp.text + ': ' + sp.count + ' card' + (sp.count === 1 ? '' : 's')); try { if (window.Snd && Snd.click) Snd.click(); } catch (e) {} }, t + k * gap));
      });
      var tEnd = t + steps.length * gap;
      f.timers.push(setTimeout(function () {
        if (st.form !== f) return;
        paintLabel(opts && opts.final ? opts.final : '', !!(opts && opts.ok)); labelAt = 'goal'; labelTgt = 1; labelPos(); ctx.dirty(); ctx.startLoop();
        try { if (window.Snd) { if (opts && opts.ok && Snd.chime) Snd.chime(); else if (Snd.click) Snd.click(); } } catch (e) {}
      }, tEnd));
      f.timers.push(setTimeout(function () { if (st.form === f) finishForm(); }, tEnd + 1700));
      ctx.startLoop();
      return true;
    },
    forming: function () { return !!st.form; },
    skip: finishForm,
    _state: function () { return { on: st.on, n: st.uni.length, s: st.s, lift: st.lift.slice(), dim: st.dim.slice(), base: st.base.slice(), label: labelK, dealing: !!st.deal, forming: !!st.form, draws: group.children.length }; } // checks / debugging
  };
}
