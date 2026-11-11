// 3D table: felt mat, dice, cup pour (physics), taps and drags.
// Loaded as an ES module; it fills in window.T3 (see the stand-in in js/config.js).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

(function () {
  var api = window.T3;
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); if (!renderer.getContext()) return; } catch (e) { return; }
  var hooks = { frame: [], extents: [] }; // other modules (creatures) plug in here
  var ctx = { held: null };              // shared with other 3D modules; filled in at the bottom
  api.supported = true;

  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1.5, 0.1, 300);
  var host = null, layout = null, layoutName = '', felt = null, zonePlanes = {}, rimGroup = null, meshes = [], anims = [], dirty = true;
  var world = null, pour = null, parenSprites = [], dragS = null, lastHit = 0, lastFrame = 0, pulseId = null;
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = 'none';

  // ----- Lights -----
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.3));
  var sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-6, 22, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  var sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // ----- Layouts (table units; a cube is 1 unit) -----
  var LAYOUTS = {
    wide: { W: 18, D: 13.6, z: { goal: [-5, -6.5, 10, 2.5], required: [-8.7, -3.7, 5.65, 4.3], permitted: [-2.825, -3.7, 5.65, 4.3], forbidden: [3.05, -3.7, 5.65, 4.3], resources: [-8.7, 0.9, 17.4, 5.6] }, tilt: 1.02 },
    tall: { W: 11.4, D: 19.6, z: { goal: [-5.3, -9.4, 10.6, 2.5], required: [-5.3, -6.6, 3.45, 5.6], permitted: [-1.725, -6.6, 3.45, 5.6], forbidden: [1.85, -6.6, 3.45, 5.6], resources: [-5.3, -0.7, 10.6, 10.1] }, tilt: 1.15 }
  };
  var LABELS = {
    wide: { goal: '🎯 GOAL', required: '✅ REQUIRED · must use', permitted: '👍 PERMITTED · may use', forbidden: "⛔ FORBIDDEN · can't use", resources: '🎲 RESOURCES' },
    tall: { goal: '🎯 GOAL', required: '✅ REQUIRED', permitted: '👍 PERMITTED', forbidden: '⛔ FORBIDDEN', resources: '🎲 RESOURCES' }
  };
  var ZCOL = { goal: '#ffffff', required: '#8ce99a', permitted: '#a5d8ff', forbidden: '#ffa8a8', resources: '#ffffff' };
  var FELT = { felt: '#2e8b57', space: '#2b2f77', jungle: '#3f7f2f', ocean: '#1c6ea4' };

  // ----- Textures -----
  var CUBECOL = { red: ['#ff6b6b', '#c92a2a'], blue: ['#4dabf7', '#1864ab'], green: ['#51cf66', '#2b8a3e'], black: ['#6c7078', '#16171a'] };
  var texCache = {};
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function faceTex(color, s, skin) {
    var key = color + s + skin;
    if (texCache[key]) return texCache[key];
    var cv = document.createElement('canvas'); cv.width = cv.height = 128; var g = cv.getContext('2d');
    var c = CUBECOL[color], ink = '#fff', shadow = 'rgba(0,0,0,.45)';
    if (skin === 'candy') {
      var light = { red: '#ffc2d1', blue: '#c5e6ff', green: '#d3f9d8', black: '#d0bfff' }[color], dark = { red: '#ff8fab', blue: '#74c0fc', green: '#8ce99a', black: '#9775fa' }[color];
      g.fillStyle = light; g.fillRect(0, 0, 128, 128); g.strokeStyle = dark; g.lineWidth = 12;
      for (var i = -128; i < 256; i += 28) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
    } else if (skin === 'lava') {
      var gr = g.createRadialGradient(40, 40, 5, 64, 64, 95); gr.addColorStop(0, '#ffd43b'); gr.addColorStop(0.45, '#f76707'); gr.addColorStop(1, '#4a1500');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.strokeStyle = c[0]; g.lineWidth = 12; g.strokeRect(6, 6, 116, 116);
    } else if (skin === 'galaxy') {
      var gg = g.createRadialGradient(40, 40, 5, 64, 64, 100); gg.addColorStop(0, '#7048e8'); gg.addColorStop(1, '#14082e');
      g.fillStyle = gg; g.fillRect(0, 0, 128, 128);
      for (var k = 0; k < 40; k++) { g.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.7) + ')'; g.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5); }
      g.strokeStyle = c[0]; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
    } else if (skin === 'gold') {
      var go = g.createLinearGradient(0, 0, 128, 128); go.addColorStop(0, '#fff3bf'); go.addColorStop(0.45, '#fcc419'); go.addColorStop(1, '#d9480f');
      g.fillStyle = go; g.fillRect(0, 0, 128, 128); g.strokeStyle = c[1]; g.lineWidth = 12; g.strokeRect(6, 6, 116, 116);
      ink = '#5c3c00'; shadow = 'rgba(255,255,255,.6)';
    } else {
      var lg = g.createLinearGradient(0, 0, 128, 128); lg.addColorStop(0, c[0]); lg.addColorStop(1, c[1]);
      g.fillStyle = lg; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(255,255,255,.18)'; rr(g, 12, 10, 104, 30, 14); g.fill();
    }
    var label = Eq.SHOW[s] || s;
    g.font = '900 ' + (s === 'r' ? 84 : 80) + 'px "Trebuchet MS", "Segoe UI", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = shadow; g.fillText(label, 66, 70);
    g.fillStyle = ink; g.fillText(label, 64, 66);
    if (s === '6' || s === '9') { g.fillRect(44, 104, 40, 7); } // underline so 6 and 9 can't be confused
    var t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texCache[key] = t;
    return t;
  }
  function spriteTex(txt, size) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 128; var g = cv.getContext('2d');
    g.font = '900 ' + (size || 100) + 'px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(txt, 67, 69); g.fillStyle = '#fff'; g.fillText(txt, 64, 64);
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  var lockTex = null;

  // ----- Rounded cube geometry (BoxGeometry with its corners pushed round) -----
  var cubeGeo = (function () {
    var g = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5), p = g.attributes.position, n = g.attributes.normal, r = 0.14, h = 0.5 - r, v = new THREE.Vector3(), inner = new THREE.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      inner.set(Math.max(-h, Math.min(h, v.x)), Math.max(-h, Math.min(h, v.y)), Math.max(-h, Math.min(h, v.z)));
      v.sub(inner).normalize(); n.setXYZ(i, v.x, v.y, v.z); v.multiplyScalar(r).add(inner); p.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  })();
  // Rotation that puts face k on top with its symbol upright (readable from the player's side).
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z. [normal, texture-right, texture-up]
  var FACES = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  var FACEQ = FACES.map(function (f) {
    var L = new THREE.Matrix4().makeBasis(new THREE.Vector3().fromArray(f[1]), new THREE.Vector3().fromArray(f[0]), new THREE.Vector3().fromArray(f[2]));
    var T = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
    return new THREE.Quaternion().setFromRotationMatrix(T.multiply(L.transpose()));
  });
  var NORMALS = FACES.map(function (f) { return new THREE.Vector3().fromArray(f[0]); });

  function skin() { return S.cos.skin || 'classic'; }
  function buildMats(m) {
    var color = m.userData.color, faces = Eq.CUBE_FACES[color], sk = skin();
    m.material = faces.map(function (s) { return new THREE.MeshStandardMaterial({ map: faceTex(color, s, sk), roughness: sk === 'gold' ? 0.3 : 0.45, metalness: sk === 'gold' ? 0.35 : 0.04 }); });
  }
  function ensureCubes() {
    if (meshes.length) return;
    if (!lockTex) lockTex = spriteTex('🔒', 90);
    var id = 0;
    Eq.COLORS.forEach(function (color) {
      for (var i = 0; i < 6; i++) {
        var m = new THREE.Mesh(cubeGeo, []);
        m.userData = { id: id, color: color, jit: (Math.random() - 0.5) * 0.12 };
        buildMats(m); m.castShadow = true; m.receiveShadow = true; m.visible = false;
        var lk = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTex, depthTest: false })); lk.scale.set(0.6, 0.6, 0.6); lk.position.set(0.35, 0.8, 0); lk.visible = false; lk.renderOrder = 5;
        m.add(lk); m.userData.lock = lk;
        scene.add(m); meshes.push(m); id++;
      }
    });
  }

  // ----- Table -----
  function buildTable() {
    if (felt) { scene.remove(felt); felt.geometry.dispose(); felt.material.map.dispose(); felt.material.dispose(); }
    if (rimGroup) scene.remove(rimGroup);
    Object.keys(zonePlanes).forEach(function (k) { scene.remove(zonePlanes[k]); });
    zonePlanes = {};
    var W = layout.W, D = layout.D, ppu = 72, cv = document.createElement('canvas');
    cv.width = Math.round(W * ppu); cv.height = Math.round(D * ppu);
    var g = cv.getContext('2d'), base = FELT[S.cos.mat] || FELT.felt;
    g.fillStyle = base; g.fillRect(0, 0, cv.width, cv.height);
    for (var i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; g.fillRect(Math.random() * cv.width, Math.random() * cv.height, 2, 2); }
    var vg = g.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.3, cv.width / 2, cv.height / 2, cv.width * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,.08)'); vg.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = vg; g.fillRect(0, 0, cv.width, cv.height);
    var labels = LABELS[layoutName];
    Object.keys(layout.z).forEach(function (z) {
      var r = layout.z[z], x = (r[0] + W / 2) * ppu, y = (r[1] + D / 2) * ppu, w = r[2] * ppu, h = r[3] * ppu;
      g.fillStyle = z === 'goal' ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.07)'; rr(g, x, y, w, h, 22); g.fill();
      g.setLineDash(z === 'goal' ? [] : [22, 14]); g.lineWidth = 6; g.strokeStyle = ZCOL[z]; g.globalAlpha = 0.8; rr(g, x, y, w, h, 22); g.stroke(); g.globalAlpha = 1; g.setLineDash([]);
      g.font = '800 ' + Math.round(0.42 * ppu) + 'px "Trebuchet MS", sans-serif'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(labels[z], x + 0.32 * ppu + 2, y + 0.45 * ppu + 2);
      g.fillStyle = '#fff'; g.fillText(labels[z], x + 0.32 * ppu, y + 0.45 * ppu);
      var zp = new THREE.Mesh(new THREE.PlaneGeometry(r[2], r[3]), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, depthWrite: false }));
      zp.rotation.x = -Math.PI / 2; zp.position.set(r[0] + r[2] / 2, 0.02, r[1] + r[3] / 2); zp.userData.zone = z;
      scene.add(zp); zonePlanes[z] = zp;
    });
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    felt = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; scene.add(felt);
    rimGroup = new THREE.Group();
    var wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 }), t = 0.7, hgt = 0.8;
    [[0, -D / 2 - t / 2, W + 2 * t, t], [0, D / 2 + t / 2, W + 2 * t, t], [-W / 2 - t / 2, 0, t, D], [W / 2 + t / 2, 0, t, D]].forEach(function (b) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(b[2], hgt, b[3]), wood); m.position.set(b[0], hgt / 2 - 0.15, b[1]); m.castShadow = true; m.receiveShadow = true; rimGroup.add(m);
    });
    var under = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * t, 0.6, D + 2 * t), new THREE.MeshStandardMaterial({ color: 0x5c3a1c, roughness: 0.8 }));
    under.position.y = -0.31; rimGroup.add(under);
    scene.add(rimGroup);
    world = null; // walls depend on the layout
    dirty = true;
  }
  function chooseLayout() {
    if (!host) return;
    var w = host.clientWidth || 800, h = host.clientHeight || 500, name = (w / h < 0.9) ? 'tall' : 'wide';
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (name !== layoutName) { layoutName = name; layout = LAYOUTS[name]; buildTable(); }
    fitCamera(); dirty = true;
  }
  function fitCamera() {
    var W = layout.W, D = layout.D, tilt = layout.tilt, look = new THREE.Vector3(0, 0, layoutName === 'tall' ? 0.7 : 0.6);
    var corners = [[-W / 2 - 0.7, 0.6, -D / 2 - 0.7], [W / 2 + 0.7, 0.6, -D / 2 - 0.7], [-W / 2 - 0.7, 0.6, D / 2 + 0.7], [W / 2 + 0.7, 0.6, D / 2 + 0.7]], v = new THREE.Vector3();
    hooks.extents.forEach(function (f) { f(corners, W, D); });
    for (var d = 8; d < 120; d += 0.5) {
      camera.position.set(0, Math.sin(tilt) * d, look.z + Math.cos(tilt) * d); camera.lookAt(look); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      var ok = corners.every(function (c) { v.set(c[0], c[1], c[2]).project(camera); return Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.97; });
      if (ok) break;
    }
  }
  var ro = window.ResizeObserver ? new ResizeObserver(function () { chooseLayout(); if (api.lastG) api.sync(api.lastG, true); }) : null;
  api.attach = function (el) {
    if (host === el && renderer.domElement.parentNode === el) return;
    host = el; el.innerHTML = ''; el.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    if (ro) { ro.disconnect(); ro.observe(el); } else window.addEventListener('resize', chooseLayout);
    ensureCubes(); chooseLayout(); startLoop();
  };
  api.retheme = function () {
    texCache = {};
    meshes.forEach(buildMats);
    if (layout) buildTable();
    dirty = true;
  };

  // ----- Placing cubes on the mat -----
  function zoneArea(z) { var r = layout.z[z]; return { x: r[0] + 0.25, z: r[1] + 1.05, w: r[2] - 0.5, d: r[3] - 1.25 }; }
  function gridSlots(z, n) {
    var a = zoneArea(z), s = 1.25, cols, rows;
    while (s > 0.45) { cols = Math.max(1, Math.floor(a.w / s)); rows = Math.max(1, Math.floor(a.d / s)); if (cols * rows >= n) break; s -= 0.05; }
    cols = Math.max(1, Math.floor(a.w / s));
    var out = [], used = Math.min(n, cols), off = (a.w - used * s) / 2;
    for (var i = 0; i < n; i++) { var r = Math.floor(i / cols), c = i % cols; out.push({ x: a.x + off + s / 2 + c * s, z: a.z + s / 2 + r * s, scale: Math.min(1, s / 1.25) }); }
    return out;
  }
  function slotQuat(c, m) {
    var k = Eq.CUBE_FACES[c.color].indexOf(c.s); if (k < 0) k = 2;
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.userData.jit).multiply(FACEQ[k]);
  }
  function tweenTo(m, pos, q, scale, opts) {
    anims = anims.filter(function (a) { return a.m !== m; });
    anims.push({ m: m, p0: m.position.clone(), p1: pos, q0: m.quaternion.clone(), q1: q, s0: m.scale.x, s1: scale, t0: performance.now(), dur: opts.dur, arc: opts.arc, land: opts.land });
    if (opts.land && opts.arc > 1) Snd.pickup();
    dirty = true;
  }
  api.sync = function (G, force) {
    api.lastG = G;
    if (!G || !layout) return;
    ensureCubes();
    if (pour) return; // physics is moving the cubes right now
    var targets = {};
    ['required', 'permitted', 'forbidden', 'resources'].forEach(function (z) {
      var cs = G.cubes.filter(function (c) { return c.zone === z; }).sort(function (a, b) { return a.order - b.order; }), sl = gridSlots(z, cs.length);
      cs.forEach(function (c, i) { targets[c.id] = sl[i]; });
    });
    // Goal: cubes plus parentheses in one centred row
    parenSprites.forEach(function (sp) { sp.visible = false; });
    var gt = G.goalTokens || [], a = zoneArea('goal'), widths = gt.map(function (t) { return (t === '(' || t === ')') ? 0.55 : 1.2; });
    var total = widths.reduce(function (x, y) { return x + y; }, 0), gs = Math.min(1, a.w / Math.max(total, 1)), x = a.x + (a.w - total * gs) / 2, pi = 0;
    gt.forEach(function (t, i) {
      var cx = x + widths[i] * gs / 2;
      if (typeof t === 'object') targets[t.id] = { x: cx, z: a.z + a.d / 2, scale: Math.min(1, gs) };
      else if (t === '(' || t === ')') {
        if (!parenSprites[pi]) { parenSprites[pi] = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, depthTest: true })); scene.add(parenSprites[pi]); }
        var sp = parenSprites[pi++]; sp.material.map = spriteTex(t, 110); sp.material.needsUpdate = true; sp.scale.set(1.1 * gs, 1.1 * gs, 1); sp.position.set(cx, 0.6, a.z + a.d / 2); sp.visible = true;
      }
      x += widths[i] * gs;
    });
    var tz = api.handlers.targetZones ? api.handlers.targetZones() : [];
    Object.keys(zonePlanes).forEach(function (z) { zonePlanes[z].material.opacity = tz.indexOf(z) >= 0 ? 0.22 : 0; });
    pulseId = G.highlight != null ? G.highlight : null;
    G.cubes.forEach(function (c) {
      var m = meshes[c.id], t = targets[c.id]; if (!m) return;
      if (!t) { m.visible = false; return; }
      m.visible = true;
      if (dragS && dragS.id === c.id && dragS.on) return;
      if (ctx.held === c.id) return;
      var lift = (G.selected === c.id) ? 0.8 : 0;
      var pos = new THREE.Vector3(t.x, 0.5 * t.scale + lift, t.z), q = slotQuat(c, m), u = m.userData;
      m.userData.lock.visible = !!c.locked;
      m.material.forEach(function (mt) { mt.color.setHex(c.locked ? 0x9a9a9a : 0xffffff); mt.emissive.setHex(G.selected === c.id ? 0x6b5200 : 0x000000); });
      var same = u.tpos && u.tpos.distanceTo(pos) < 0.01 && Math.abs(u.tscale - t.scale) < 0.01 && u.tq && u.tq.angleTo(q) < 0.01;
      if (same && !force) return;
      var moved = u.zone && u.zone !== c.zone, fromPour = u.fromPour, dropped = u.dropped; u.dropped = false;
      u.tpos = pos.clone(); u.tq = q.clone(); u.tscale = t.scale; u.zone = c.zone; u.fromPour = false;
      if (force && same) { m.position.copy(pos); m.quaternion.copy(q); m.scale.setScalar(t.scale); return; }
      tweenTo(m, pos, q, t.scale, dropped ? { dur: 380, arc: 0.3, land: true } : moved ? { dur: 650, arc: 3, land: true } : fromPour ? { dur: 750 + Math.random() * 250, arc: 1.2 } : { dur: 220, arc: 0 });
    });
    dirty = true;
  };

  // ----- Pouring the cubes out of a cup -----
  var cup = (function () {
    var g = new THREE.Group();
    var leather = new THREE.MeshStandardMaterial({ color: 0x7a3e1d, roughness: 0.7, side: THREE.DoubleSide });
    var body = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.35, 3.2, 32, 1, true), leather); body.castShadow = true; g.add(body);
    var bottom = new THREE.Mesh(new THREE.CircleGeometry(1.35, 32), leather); bottom.rotation.x = Math.PI / 2; bottom.position.y = -1.6; g.add(bottom);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.12, 10, 40), new THREE.MeshStandardMaterial({ color: 0xffd43b, metalness: 0.6, roughness: 0.3 })); ring.rotation.x = Math.PI / 2; ring.position.y = 1.6; g.add(ring);
    var band = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.09, 10, 40), ring.material); band.rotation.x = Math.PI / 2; band.position.y = 0; g.add(band);
    g.visible = false; scene.add(g);
    return g;
  })();
  function buildWorld() {
    world = new CANNON.World(); world.gravity.set(0, -32, 0); world.broadphase = new CANNON.NaiveBroadphase(); world.solver.iterations = 12; world.allowSleep = true;
    var dm = new CANNON.Material('dice'), fm = new CANNON.Material('floor');
    world.addContactMaterial(new CANNON.ContactMaterial(dm, fm, { friction: 0.28, restitution: 0.38 }));
    world.addContactMaterial(new CANNON.ContactMaterial(dm, dm, { friction: 0.12, restitution: 0.3 }));
    world.diceMat = dm;
    var ground = new CANNON.Body({ mass: 0, material: fm }); ground.addShape(new CANNON.Plane()); ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); world.addBody(ground);
    var W = layout.W, D = layout.D;
    [[0, -D / 2 - 0.5, W + 2, 1], [0, D / 2 + 0.5, W + 2, 1], [-W / 2 - 0.5, 0, 1, D + 2], [W / 2 + 0.5, 0, 1, D + 2]].forEach(function (b) {
      var wall = new CANNON.Body({ mass: 0, material: fm }); wall.addShape(new CANNON.Box(new CANNON.Vec3(b[2] / 2, 5, b[3] / 2))); wall.position.set(b[0], 5, b[1]); world.addBody(wall);
    });
  }
  api.pour = function (cubes, done) {
    if (!layout) { done(cubes.map(function (c) { return c.s; })); return; }
    ensureCubes(); if (!world) buildWorld();
    meshes.forEach(function (m) { m.visible = false; m.userData.tpos = null; m.userData.zone = null; m.userData.lock.visible = false; m.material.forEach(function (mt) { mt.color.setHex(0xffffff); mt.emissive.setHex(0); }); });
    anims = []; parenSprites.forEach(function (sp) { sp.visible = false; });
    Object.keys(zonePlanes).forEach(function (z) { zonePlanes[z].material.opacity = 0; });
    var W = layout.W, D = layout.D, side = layoutName === 'tall';
    pour = { t0: performance.now(), bodies: [], spawned: 0, order: shuffle(meshes.map(function (m, i) { return i; })), done: done, settledAt: 0, sim: 0,
      from: new THREE.Vector3(W / 2 + 5, 8, side ? -3 : -1.5), at: new THREE.Vector3(W / 2 - (side ? 1.5 : 2.6), 6.2, side ? -3 : -1.5) };
    cup.visible = true; cup.position.copy(pour.from); cup.rotation.set(0, 0, 0);
    Snd.cupRattle();
    if (document.hidden) { finishPourFast(); return; }
    startLoop();
  };
  function spawnDie(i) {
    var m = meshes[i], mouth = new THREE.Vector3(0, 1.5, 0).applyMatrix4(cup.matrixWorld);
    var b = new CANNON.Body({ mass: 1, material: world.diceMat }); b.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
    b.position.set(mouth.x + (Math.random() - 0.5) * 0.9, Math.max(1.2, mouth.y + (Math.random() - 0.5) * 0.6), mouth.z + (Math.random() - 0.5) * 1.2);
    var tx = (Math.random() - 0.5) * layout.W * 0.55, tz = (Math.random() - 0.3) * layout.D * 0.5, dx = tx - b.position.x, dz = tz - b.position.z, len = Math.hypot(dx, dz) || 1, sp = 6 + Math.random() * 6;
    b.velocity.set(dx / len * sp, -1 + Math.random() * 3, dz / len * sp);
    b.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    b.quaternion.setFromEuler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    b.linearDamping = 0.08; b.angularDamping = 0.08; b.allowSleep = true; b.sleepSpeedLimit = 0.3; b.sleepTimeLimit = 0.35;
    b.addEventListener('collide', function (e) {
      var v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v < 1.2) return;
      var n = performance.now(); if (n - lastHit < 14) return; lastHit = n;
      Snd.diceHit(Math.min(1, v / 11));
    });
    world.addBody(b); pour.bodies[i] = b; m.visible = true; m.scale.setScalar(1);
  }
  function syncBodies() { pour.bodies.forEach(function (b, i) { if (!b) return; meshes[i].position.set(b.position.x, b.position.y, b.position.z); meshes[i].quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w); }); }
  function finishPour() {
    var results = pour.bodies.map(function (b, i) {
      var q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), best = 0, by = -9;
      NORMALS.forEach(function (n, k) { var y = n.clone().applyQuaternion(q).y; if (y > by) { by = y; best = k; } });
      world.removeBody(b);
      meshes[i].userData.fromPour = true;
      return Eq.CUBE_FACES[meshes[i].userData.color][best];
    });
    cup.visible = false;
    var done = pour.done; pour = null; dirty = true;
    done(results);
  }
  function finishPourFast() {
    cup.updateMatrixWorld(); cup.position.copy(pour.at); cup.rotation.z = 2.0; cup.updateMatrixWorld();
    pour.order.forEach(spawnDie);
    for (var k = 0; k < 600; k++) world.step(1 / 60);
    syncBodies(); finishPour();
  }
  function tickPour(now, dt) {
    var t = (now - pour.t0) / 1000, e = function (x) { return x < 0 ? 0 : x > 1 ? 1 : (1 - Math.cos(x * Math.PI)) / 2; };
    if (t < 0.55) cup.position.lerpVectors(pour.from, pour.at, e(t / 0.55));
    cup.rotation.z = 2.05 * e((t - 0.5) / 0.4) * (1 - e((t - 1.45) / 0.45));
    if (t > 1.45) cup.position.lerpVectors(pour.at, pour.from, e((t - 1.45) / 0.6));
    if (t > 2.1) cup.visible = false;
    cup.updateMatrixWorld();
    if (t > 0.72) { var want = Math.min(24, Math.floor((t - 0.72) * 55) + 1); while (pour.spawned < want) spawnDie(pour.order[pour.spawned++]); }
    if (pour.spawned) { world.step(1 / 60, dt, 5); pour.sim += dt; syncBodies(); }
    if (pour.spawned === 24 && !pour.settledAt) {
      var asleep = pour.bodies.every(function (b) { return b.sleepState === CANNON.Body.SLEEPING || b.velocity.length() < 0.08; });
      if (asleep || pour.sim > 5.5 || t > 9) pour.settledAt = now;
    }
    if (pour.settledAt && now - pour.settledAt > 650) finishPour();
  }

  // ----- Animation loop -----
  var looping = false, wd = null;
  function startLoop() {
    if (looping) return; looping = true; lastFrame = performance.now();
    requestAnimationFrame(frame);
    if (!wd) wd = setInterval(function () { if (looping && performance.now() - lastFrame > 150) frame(performance.now(), true); }, 100);
  }
  function frame(now, fromWatchdog) {
    if (!looping) return;
    now = now || performance.now();
    var dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    if (pour) { if (document.hidden) finishPourFast(); else tickPour(now, dt); dirty = true; }
    if (anims.length) {
      anims = anims.filter(function (a) {
        var k = Math.min(1, (now - a.t0) / a.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        a.m.position.lerpVectors(a.p0, a.p1, e); a.m.position.y += Math.sin(k * Math.PI) * a.arc;
        a.m.quaternion.copy(a.q0).slerp(a.q1, e); a.m.scale.setScalar(a.s0 + (a.s1 - a.s0) * e);
        if (k >= 1 && a.land) { Snd.thunk(); if (api.handlers.landed) api.handlers.landed(a.m.userData.id); }
        return k < 1;
      });
      dirty = true;
    }
    hooks.frame.forEach(function (f) { f(now); });
    if (pulseId != null && meshes[pulseId]) { var p = 0.5 + 0.5 * Math.sin(now / 180); meshes[pulseId].material.forEach(function (mt) { mt.emissive.setRGB(0.45 * p, 0.36 * p, 0); }); dirty = true; }
    if (dirty && host && document.body.contains(renderer.domElement) && current === 'game') { renderer.render(scene, camera); dirty = false; }
    if (current !== 'game' && !pour) { looping = false; return; }
    if (!fromWatchdog) requestAnimationFrame(frame);
  }
  api.kick = function () { dirty = true; startLoop(); };
  // ----- Taps and drags on the 3D table -----
  function pick(ev, objs) {
    var r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objs, false)[0] || null;
  }
  function zoneAt(ev) { var h = pick(ev, Object.keys(zonePlanes).map(function (k) { return zonePlanes[k]; })); return h ? h.object.userData.zone : null; }
  var dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.6), hitP = new THREE.Vector3();
  renderer.domElement.addEventListener('pointerdown', function (ev) {
    if (pour) return;
    var h = pick(ev, meshes.filter(function (m) { return m.visible; }));
    dragS = { x: ev.clientX, y: ev.clientY, id: h ? h.object.userData.id : null, on: false };
    if (dragS.id != null && api.handlers.canDrag && api.handlers.canDrag(dragS.id)) { dragS.can = true; renderer.domElement.setPointerCapture(ev.pointerId); }
  });
  renderer.domElement.addEventListener('pointermove', function (ev) {
    if (!dragS || !dragS.can) return;
    if (!dragS.on && Math.hypot(ev.clientX - dragS.x, ev.clientY - dragS.y) > 8) { dragS.on = true; Snd.pickup(); if (api.handlers.dragStart) api.handlers.dragStart(dragS.id); }
    if (dragS.on) {
      pick(ev, []); if (ray.ray.intersectPlane(dragPlane, hitP)) { var m = meshes[dragS.id]; anims = anims.filter(function (a) { return a.m !== m; }); m.position.copy(hitP); m.userData.tpos = null; }
      var z = zoneAt(ev), tz = api.handlers.targetZones ? api.handlers.targetZones() : [];
      Object.keys(zonePlanes).forEach(function (k) { zonePlanes[k].material.opacity = tz.indexOf(k) >= 0 ? (k === z ? 0.4 : 0.18) : 0; });
      dirty = true; startLoop();
    }
  });
  renderer.domElement.addEventListener('pointerup', function (ev) {
    var d = dragS; dragS = null; if (!d) return;
    if (d.on) { var z = zoneAt(ev); if (api.handlers.drop) api.handlers.drop(d.id, z); return; }
    if (d.id != null) { if (api.handlers.cubeTap) api.handlers.cubeTap(d.id); return; }
    var zz = zoneAt(ev); if (zz && api.handlers.zoneTap) api.handlers.zoneTap(zz);
  });
  renderer.domElement.addEventListener('pointercancel', function () { if (dragS && dragS.on && api.handlers.drop) api.handlers.drop(dragS.id, null); dragS = null; });

  // Screen position of a cube (for effects like bursts)
  api.screenPos = function (id) {
    var m = meshes[id]; if (!m || !host) return null;
    var v = m.position.clone().project(camera), r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  };
  api.isPouring = function () { return !!pour; };
  // What other 3D modules may use
  Object.assign(ctx, {
    scene: scene, camera: camera, renderer: renderer, meshes: meshes, hooks: hooks,
    dirty: function () { dirty = true; }, startLoop: startLoop,
    refit: function () { if (layout) { fitCamera(); dirty = true; } },
    dropAnims: function (m) { anims = anims.filter(function (a) { return a.m !== m; }); }
  });
  Object.defineProperty(ctx, 'layout', { get: function () { return layout; } });
  Object.defineProperty(ctx, 'layoutName', { get: function () { return layoutName; } });
  api.ctx = ctx;
})();
