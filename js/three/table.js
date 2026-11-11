// 3D table: felt mat, dice, cup pour (physics), taps and drags.
// Loaded as an ES module; it fills in window.T3 (see the stand-in in js/config.js).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { THEMES, FLOOR_Y, makeEnvMap, softTexture, blobTexture, vignetteTexture, gradientBg, rectShadowTexture, feltBumpTile, paintFelt, woodTexture, buildEnvironment } from './environment.js';

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
  var tableGroup = null, blobs = [], squashes = [], puffs = [], puffPool = [], zoneGlow = {};
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = 'none';
  scene.add(camera); // the vignette is a child of the camera

  // ----- Quality tiers (the governor in frame() steps down if frames get slow) -----
  var QUAL = [{ pr: 1, shadow: 0 }, { pr: 1.5, shadow: 1024 }, { pr: 2, shadow: 2048 }], qual = 2;
  function applyQuality() {
    var q = QUAL[qual];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
    sun.castShadow = q.shadow > 0;
    if (q.shadow) { if (sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } }
    if (host) renderer.setSize(host.clientWidth || 800, host.clientHeight || 500, false);
    dirty = true;
  }

  // ----- Lights (colours and strengths come from the mat theme; see applyTheme) -----
  var hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.8); scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(-6, 22, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  var sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun);
  var fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(14, 10, -12); scene.add(fill);
  try { scene.environment = makeEnvMap(renderer); } catch (e) { scene.environment = null; }
  var blobTex = blobTexture(), puffTex = softTexture();
  var vignette = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: vignetteTexture(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  vignette.position.z = -0.5; vignette.renderOrder = 1000; vignette.frustumCulled = false; camera.add(vignette);
  function applyTheme() {
    var T = THEMES[S.cos.mat] || THEMES.felt;
    hemi.color.setHex(T.sky); hemi.groundColor.setHex(T.ground); hemi.intensity = T.hemiI;
    sun.color.setHex(T.sun); sun.intensity = T.sunI;
    fill.color.setHex(T.fill); fill.intensity = T.fillI;
    scene.environmentIntensity = T.env;
    if (scene.background && scene.background.dispose) scene.background.dispose();
    scene.background = gradientBg(T.bg);
    scene.fog = T.fog ? new THREE.Fog(T.fog[0], T.fog[1], T.fog[2]) : null;
  }

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
    var cv = document.createElement('canvas'); cv.width = cv.height = 256; var g = cv.getContext('2d'); g.scale(2, 2);
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
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 3; rr(g, 3, 3, 122, 122, 14); g.stroke();
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
    var g = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6), p = g.attributes.position, n = g.attributes.normal, r = 0.14, h = 0.5 - r, v = new THREE.Vector3(), inner = new THREE.Vector3();
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
    var gold = sk === 'gold', glossy = sk === 'candy' || sk === 'galaxy';
    m.material = faces.map(function (s) {
      return new THREE.MeshPhysicalMaterial({ map: faceTex(color, s, sk), roughness: gold ? 0.28 : glossy ? 0.25 : 0.4, metalness: gold ? 0.55 : 0.0,
        clearcoat: gold ? 0.2 : glossy ? 1 : 0.55, clearcoatRoughness: glossy ? 0.12 : 0.25, envMapIntensity: gold ? 1.4 : 1 });
    });
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
        var bl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0, fog: false })); bl.rotation.x = -Math.PI / 2; bl.visible = false; bl.renderOrder = 1; scene.add(bl); blobs.push(bl);
        scene.add(m); meshes.push(m); id++;
      }
    });
  }

  // ----- Table -----
  function disposeTree(o) {
    o.traverse(function (n) {
      if (n.geometry) n.geometry.dispose();
      var ms = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
      ms.forEach(function (mt) { Object.keys(mt).forEach(function (k) { var v = mt[k]; if (v && v.isTexture && v !== blobTex && v !== puffTex) v.dispose(); }); mt.dispose(); });
    });
  }
  function rrp(p, x, y, w, h, r) {
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r); p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r); p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  }
  function glowTex(w, h, css) {
    var cv = document.createElement('canvas'); cv.width = Math.round(w * 36); cv.height = Math.round(h * 36); var g = cv.getContext('2d');
    g.fillStyle = css; g.globalAlpha = 0.16; rr(g, 6, 6, cv.width - 12, cv.height - 12, 22); g.fill(); g.globalAlpha = 1;
    g.shadowColor = css; g.shadowBlur = 26; g.strokeStyle = css; g.lineWidth = 5; rr(g, 9, 9, cv.width - 18, cv.height - 18, 20); g.stroke(); g.stroke();
    g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.5; rr(g, 9, 9, cv.width - 18, cv.height - 18, 20); g.stroke();
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function buildTable() {
    if (tableGroup) { scene.remove(tableGroup); disposeTree(tableGroup); }
    zonePlanes = {}; zoneGlow = {};
    tableGroup = new THREE.Group(); scene.add(tableGroup);
    var name = S.cos.mat in THEMES ? S.cos.mat : 'felt', T = THEMES[name], aniso = renderer.capabilities.getMaxAnisotropy();
    applyTheme();
    var W = layout.W, D = layout.D, ppu = 72, PAD = 0.25, cv = document.createElement('canvas');
    cv.width = Math.round((W + 2 * PAD) * ppu); cv.height = Math.round((D + 2 * PAD) * ppu);
    var g = cv.getContext('2d');
    paintFelt(g, cv.width, cv.height, T, name);
    var labels = LABELS[layoutName];
    Object.keys(layout.z).forEach(function (z) {
      var r = layout.z[z], x = (r[0] + W / 2 + PAD) * ppu, y = (r[1] + D / 2 + PAD) * ppu, w = r[2] * ppu, h = r[3] * ppu;
      g.fillStyle = z === 'goal' ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.07)'; rr(g, x, y, w, h, 22); g.fill();
      g.setLineDash(z === 'goal' ? [] : [22, 14]); g.lineWidth = 6; g.strokeStyle = ZCOL[z]; g.globalAlpha = 0.8; rr(g, x, y, w, h, 22); g.stroke(); g.globalAlpha = 1; g.setLineDash([]);
      g.font = '800 ' + Math.round(0.42 * ppu) + 'px "Trebuchet MS", sans-serif'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(labels[z], x + 0.32 * ppu + 2, y + 0.45 * ppu + 2);
      g.fillStyle = '#fff'; g.fillText(labels[z], x + 0.32 * ppu, y + 0.45 * ppu);
      var zp = new THREE.Mesh(new THREE.PlaneGeometry(r[2], r[3]), new THREE.MeshBasicMaterial({ map: glowTex(r[2], r[3], ZCOL[z] === '#ffffff' ? '#ffe066' : ZCOL[z]), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      zp.rotation.x = -Math.PI / 2; zp.position.set(r[0] + r[2] / 2, 0.02, r[1] + r[3] / 2); zp.userData.zone = z; zp.visible = false; zp.renderOrder = 2;
      tableGroup.add(zp); zonePlanes[z] = zp; zoneGlow[z] = 0;
    });
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
    var bump = feltBumpTile(); bump.repeat.set((W + 2 * PAD) / 1.2, (D + 2 * PAD) / 1.2);
    felt = new THREE.Mesh(new THREE.PlaneGeometry(W + 2 * PAD, D + 2 * PAD), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 1, bumpMap: bump, bumpScale: 1.2, sheen: 1, sheenRoughness: 0.7, sheenColor: new THREE.Color(T.felt).lerp(new THREE.Color(0xffffff), 0.45) }));
    felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; tableGroup.add(felt);
    // wooden rim: one rounded, bevelled frame
    var t = 0.7, hgt = 0.5, ow = W / 2 + t - 0.15, od = D / 2 + t - 0.15;
    var shape = new THREE.Shape(); rrp(shape, -ow, -od, 2 * ow, 2 * od, 0.9);
    var hole = new THREE.Path(); rrp(hole, -W / 2, -D / 2, W, D, 0.2); shape.holes.push(hole);
    var rimGeo = new THREE.ExtrudeGeometry(shape, { depth: hgt, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 4, curveSegments: 10 });
    var wood = new THREE.MeshPhysicalMaterial({ map: woodTexture(T.rim, 3, aniso), roughness: T.rimRough, metalness: T.rimMetal, clearcoat: 0.45, clearcoatRoughness: 0.35 });
    var rim = new THREE.Mesh(rimGeo, wood); rim.rotation.x = -Math.PI / 2; rim.position.y = 0; rim.castShadow = true; rim.receiveShadow = true; tableGroup.add(rim);
    var darkWood = new THREE.MeshStandardMaterial({ map: woodTexture(T.rim, 7, aniso), color: 0x9a8a80, roughness: 0.7 });
    var apron = new THREE.Mesh(new THREE.BoxGeometry(2 * ow - 0.4, 0.9, 2 * od - 0.4), darkWood); apron.position.y = -0.55; apron.castShadow = true; tableGroup.add(apron);
    var env = buildEnvironment(name, W, D, aniso); tableGroup.add(env.group);
    if (env.legs) {
      var lh = -0.9 - FLOOR_Y;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
        var leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, lh, 1.2), darkWood); leg.position.set(c[0] * (ow - 1.1), -0.9 - lh / 2, c[1] * (od - 1.1)); leg.castShadow = true; tableGroup.add(leg);
      });
      var sh = new THREE.Mesh(new THREE.PlaneGeometry(2 * ow + 9, 2 * od + 9), new THREE.MeshBasicMaterial({ map: rectShadowTexture(), transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
      sh.rotation.x = -Math.PI / 2; sh.position.y = FLOOR_Y + 0.04; sh.renderOrder = 0; tableGroup.add(sh);
    }
    if (name === 'space') { // glowing trim around the table
      var trim = new THREE.MeshBasicMaterial({ color: 0x5cf0ff, toneMapped: false, fog: false });
      [[0, -D / 2 - t / 2, W + 2 * t - 1.6, 0.09], [0, D / 2 + t / 2, W + 2 * t - 1.6, 0.09], [-W / 2 - t / 2, 0, 0.09, D + 2 * t - 1.6], [W / 2 + t / 2, 0, 0.09, D + 2 * t - 1.6]].forEach(function (b) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(b[2], 0.05, b[3]), trim); m.position.set(b[0], 0.66, b[1]); tableGroup.add(m);
      });
    }
    // sun shadows only need to cover the table
    sc.left = -(ow + 3); sc.right = ow + 3; sc.top = od + 3; sc.bottom = -(od + 3); sc.updateProjectionMatrix();
    if (!pour) world = null; // walls depend on the layout
    dirty = true;
  }
  function chooseLayout() {
    if (!host) return;
    var w = host.clientWidth || 800, h = host.clientHeight || 500, name = (w / h < 0.9) ? 'tall' : 'wide';
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    var vh = 2 * 0.5 * Math.tan(camera.fov * Math.PI / 360); vignette.scale.set(vh * camera.aspect * 1.01, vh * 1.01, 1);
    if (name !== layoutName) { layoutName = name; layout = LAYOUTS[name]; buildTable(); }
    fitCamera(); dirty = true;
  }

  // ----- Camera: a fitted base view plus small, temporary offsets (follow the pour, cues) -----
  var base = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, camOff = { dolly: 0, yaw: 0, lift: 0, panX: 0, panZ: 0 }, CAMKEYS = ['dolly', 'yaw', 'lift', 'panX', 'panZ'], cueG = null, camTmp = new THREE.Vector3(), camLook = new THREE.Vector3();
  function camZero() { return CAMKEYS.every(function (k) { return camOff[k] === 0; }); }
  function applyCam() {
    if (camZero()) { camera.position.copy(base.pos); camera.lookAt(base.look); }
    else {
      camTmp.copy(base.pos).sub(base.look);
      var cy = Math.cos(camOff.yaw), sy = Math.sin(camOff.yaw), x = camTmp.x * cy + camTmp.z * sy, z = -camTmp.x * sy + camTmp.z * cy;
      camTmp.set(x, camTmp.y, z).multiplyScalar(1 - camOff.dolly); camTmp.y += camOff.lift;
      camLook.copy(base.look); camLook.x += camOff.panX; camLook.z += camOff.panZ;
      camera.position.copy(base.look).add(camTmp); camera.position.x += camOff.panX; camera.position.z += camOff.panZ; camera.lookAt(camLook);
    }
    camera.updateMatrixWorld();
  }
  // Put the camera exactly on the fitted view right now (taps and drags must be accurate).
  function camSnap() {
    cueG = null;
    if (camZero()) return;
    CAMKEYS.forEach(function (k) { camOff[k] = 0; }); applyCam(); dirty = true;
  }
  function camGoal(now) {
    if (pour) {
      if (pour.settledAt || pour.fast) return null;
      var t = (now - pour.t0) / 1000, px = pour.cupPos.x, pz = pour.cupPos.z, cx = 0, cz = 0, n = 0;
      pour.bodies.forEach(function (b) { if (b) { cx += b.position.x; cz += b.position.z; n++; } });
      if (n) { cx /= n; cz /= n; }
      var w = n ? Math.min(1, Math.max(0, (t - 1.1) / 0.9)) : 0, fx = px + (cx - px) * w, fz = pz + (cz - pz) * w;
      return { dolly: 0.05 + 0.03 * w, panX: Math.max(-1.6, Math.min(1.6, fx * 0.16)), panZ: Math.max(-1.2, Math.min(1.2, fz * 0.16)), lift: 0, yaw: 0 };
    }
    if (cueG) { var k = (now - cueG.t0) / cueG.dur; if (k >= 1) { cueG = null; return null; } return cueG.fn(k); }
    return null;
  }
  function stepCam(now, dt) {
    var goal = camGoal(now);
    if (!goal && camZero()) return;
    var k = 1 - Math.exp(-dt * (pour ? 3 : 4)), moving = false;
    CAMKEYS.forEach(function (key) {
      var tgt = goal ? (goal[key] || 0) : 0, diff = tgt - camOff[key];
      if (Math.abs(diff) < 0.0008) { if (camOff[key] !== tgt) { camOff[key] = tgt; moving = true; } }
      else { camOff[key] += diff * k; moving = true; }
    });
    if (moving) { applyCam(); dirty = true; }
  }
  var bump3 = function (k, a, b) { var x = k < a ? k / a : k > b ? (1 - k) / (1 - b) : 1; return x * x * (3 - 2 * x); };
  var CUES = {
    challenge: { dur: 1700, fn: function (k) { var p = bump3(k, 0.25, 0.7); return { dolly: 0.13 * p, panZ: -1.0 * p, lift: -0.3 * p }; } },
    win: { dur: 4600, fn: function (k) { var p = Math.sin(Math.PI * k); p = p * p * (3 - 2 * p); return { yaw: 0.26 * p, lift: 1.4 * p, dolly: 0.05 * p }; } },
    lose: { dur: 1800, fn: function (k) { var p = bump3(k, 0.3, 0.6); return { dolly: -0.03 * p, lift: 0.7 * p }; } }
  };
  api.cue = function (name) {
    if (document.hidden || !layout) return;
    if (name === 'reset') { cueG = null; dirty = true; startLoop(); return; }
    var c = CUES[name]; if (!c || pour) return;
    cueG = { t0: performance.now(), dur: c.dur, fn: c.fn }; dirty = true; startLoop();
  };
  function fitCamera() {
    var W = layout.W, D = layout.D, tilt = layout.tilt, look = new THREE.Vector3(0, 0, layoutName === 'tall' ? 0.7 : 0.6);
    var corners = [[-W / 2 - 0.7, 0.6, -D / 2 - 0.7], [W / 2 + 0.7, 0.6, -D / 2 - 0.7], [-W / 2 - 0.7, 0.6, D / 2 + 0.7], [W / 2 + 0.7, 0.6, D / 2 + 0.7]], v = new THREE.Vector3();
    hooks.extents.forEach(function (f) { f(corners, W, D); });
    for (var d = 8; d < 120; d += 0.5) {
      camera.position.set(0, Math.sin(tilt) * d, look.z + Math.cos(tilt) * d); camera.lookAt(look); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      var ok = corners.every(function (c) { v.set(c[0], c[1], c[2]).project(camera); return Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.97; });
      if (ok) break;
    }
    base.pos.copy(camera.position); base.look.copy(look); applyCam();
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
    Object.keys(texCache).forEach(function (k) { texCache[k].dispose(); });
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
    anims = anims.filter(function (a) { return a.m !== m; }); dropSquash(m);
    anims.push({ m: m, p0: m.position.clone(), p1: pos, q0: m.quaternion.clone(), q1: q, s0: m.scale.x, s1: scale, t0: performance.now(), dur: opts.dur, arc: opts.arc, land: opts.land });
    if (opts.land && opts.arc > 1) Snd.pickup();
    dirty = true;
  }
  function setGlow(z, v, instant) {
    var zp = zonePlanes[z]; if (!zp) return;
    zoneGlow[z] = v;
    if (instant) { zp.material.opacity = v; zp.visible = v > 0.004; }
    else if (zp.material.opacity !== v) { zp.visible = true; startLoop(); }
    dirty = true;
  }
  function dropSquash(m) { squashes = squashes.filter(function (q) { if (q.m !== m) return true; m.scale.setScalar(q.s); return false; }); }
  // Dust puff where a cube lands or smacks the mat
  function spawnPuff(x, z, scale, power) {
    if (document.hidden) return;
    var T = THEMES[S.cos.mat] || THEMES.felt, n = power > 0.7 ? 6 : 4;
    for (var i = 0; i < n; i++) {
      var sp = puffPool.pop();
      if (!sp) { if (puffs.length > 48) break; sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, fog: false })); sp.renderOrder = 3; scene.add(sp); }
      var a = (i / n + Math.random() * 0.15) * Math.PI * 2, u = sp.userData;
      u.t0 = performance.now(); u.x = x; u.z = z; u.dx = Math.cos(a); u.dz = Math.sin(a); u.r = (0.45 + 0.4 * power) * scale; u.s = (0.45 + 0.25 * power) * scale; u.life = 420 + Math.random() * 160; u.op = 0.32 * (0.5 + 0.5 * power);
      sp.material.color.setHex(T.dust); sp.material.opacity = u.op; sp.position.set(x, 0.12, z); sp.scale.set(u.s * 0.5, u.s * 0.5, 1); sp.visible = true;
      puffs.push(sp);
    }
    dirty = true;
  }
  function landFx(a, now) {
    var power = a.arc > 1 ? 1 : 0.5;
    spawnPuff(a.p1.x, a.p1.z, a.s1, power);
    dropSquash(a.m); squashes.push({ m: a.m, t0: now, s: a.s1, y: a.p1.y, amp: power });
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
    Object.keys(zonePlanes).forEach(function (z) { setGlow(z, tz.indexOf(z) >= 0 ? 0.3 : 0); });
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
      m.material.forEach(function (mt) { mt.color.setHex(c.locked ? 0x9a9a9a : 0xffffff); mt.emissive.setHex(G.selected === c.id ? 0x6b5200 : G.highlight === c.id ? 0x665200 : 0x000000); });
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
    var lc = document.createElement('canvas'); lc.width = lc.height = 256; var lg = lc.getContext('2d');
    lg.fillStyle = '#7a3e1d'; lg.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 5000; i++) { lg.fillStyle = Math.random() < 0.5 ? 'rgba(255,200,140,.07)' : 'rgba(0,0,0,.10)'; lg.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    var lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace; lt.wrapS = lt.wrapT = THREE.RepeatWrapping; lt.repeat.set(3, 1.5);
    var leather = new THREE.MeshPhysicalMaterial({ map: lt, bumpMap: lt, bumpScale: 0.6, color: 0xffffff, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.5, side: THREE.DoubleSide });
    var prof = [[0, -1.6], [1.15, -1.6], [1.33, -1.52], [1.7, 1.52], [1.74, 1.62], [1.66, 1.7], [1.58, 1.62], [1.3, -1.42], [0, -1.42]].map(function (q) { return new THREE.Vector2(q[0], q[1]); });
    var body = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), leather); body.castShadow = true; body.receiveShadow = true; g.add(body);
    var gold = new THREE.MeshPhysicalMaterial({ color: 0xffd43b, metalness: 0.85, roughness: 0.28, clearcoat: 0.3 });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.1, 12, 48), gold); ring.rotation.x = Math.PI / 2; ring.position.y = 1.55; g.add(ring);
    var band = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.08, 12, 48), gold); band.rotation.x = Math.PI / 2; band.position.y = 0; g.add(band);
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
    Object.keys(zonePlanes).forEach(function (z) { setGlow(z, 0, true); });
    var W = layout.W, D = layout.D, side = layoutName === 'tall';
    pour = { t0: performance.now(), bodies: [], spawned: 0, order: shuffle(meshes.map(function (m, i) { return i; })), done: done, settledAt: 0, sim: 0,
      from: new THREE.Vector3(W / 2 + 5, 8, side ? -3 : -1.5), at: new THREE.Vector3(W / 2 - (side ? 1.5 : 2.6), 6.2, side ? -3 : -1.5) };
    cup.visible = true; cup.position.copy(pour.from); cup.rotation.set(0, 0, 0);
    Snd.cupRattle();
    camSnap(); pour.cupPos = cup.position;
    if (document.hidden) { pour.fast = true; finishPourFast(); return; }
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
      if (v > 4 && b.position.y < 1.2 && !document.hidden) spawnPuff(b.position.x, b.position.z, 0.8, Math.min(1, v / 12));
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
  var perf = { n: 0, slow: 0, prev: 0, prevRendered: false };
  function governor(now, rendered, fromWatchdog) {
    // Only count gaps between two consecutive rendered animation frames; step quality down if most are slow.
    if (fromWatchdog || !rendered) { perf.prevRendered = false; return; }
    if (perf.prevRendered) {
      var gap = now - perf.prev;
      if (gap < 120) { perf.n++; if (gap > 26) perf.slow++; }
      if (perf.n >= 60) {
        if (perf.slow > 36 && qual > 0) { qual--; applyQuality(); }
        perf.n = 0; perf.slow = 0;
      }
    }
    perf.prev = now; perf.prevRendered = true;
  }
  function frame(now, fromWatchdog) {
    if (!looping) return;
    now = now || performance.now();
    var dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    if (pour) { if (document.hidden) { pour.fast = true; finishPourFast(); } else tickPour(now, dt); dirty = true; }
    if (anims.length) {
      anims = anims.filter(function (a) {
        var k = Math.min(1, (now - a.t0) / a.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        a.m.position.lerpVectors(a.p0, a.p1, e); a.m.position.y += Math.sin(k * Math.PI) * a.arc;
        a.m.quaternion.copy(a.q0).slerp(a.q1, e); a.m.scale.setScalar(a.s0 + (a.s1 - a.s0) * e);
        if (k >= 1 && a.land) { Snd.thunk(); landFx(a, now); if (api.handlers.landed) api.handlers.landed(a.m.userData.id); }
        return k < 1;
      });
      dirty = true;
    }
    if (squashes.length) {
      squashes = squashes.filter(function (q) {
        var k = (now - q.t0) / 340, m = q.m;
        if (k >= 1 || !m.visible || (dragS && dragS.on && dragS.id === m.userData.id) || ctx.held === m.userData.id) { if (m.visible) { m.scale.setScalar(q.s); m.position.y = q.y; } return false; }
        var e = q.amp * Math.exp(-k * 3.8) * Math.cos(k * 7.5), sy = 1 - 0.17 * e;
        m.scale.set(q.s * (1 + 0.09 * e), q.s * sy, q.s * (1 + 0.09 * e)); m.position.y = q.y - 0.5 * q.s * (1 - sy);
        return true;
      });
      dirty = true;
    }
    if (puffs.length) {
      puffs = puffs.filter(function (sp) {
        var u = sp.userData, k = (now - u.t0) / u.life;
        if (k >= 1) { sp.visible = false; puffPool.push(sp); return false; }
        var e = 1 - Math.pow(1 - k, 2);
        sp.position.set(u.x + u.dx * u.r * e, 0.12 + 0.35 * e, u.z + u.dz * u.r * e);
        var sz = u.s * (0.5 + 0.9 * e); sp.scale.set(sz, sz, 1); sp.material.opacity = u.op * (1 - k) * (1 - k);
        return true;
      });
      dirty = true;
    }
    stepCam(now, dt);
    var zk = 1 - Math.exp(-dt * 13);
    Object.keys(zonePlanes).forEach(function (z) {
      var zp = zonePlanes[z], tgt = zoneGlow[z] || 0, d = tgt - zp.material.opacity;
      if (d === 0) return;
      if (Math.abs(d) < 0.01) zp.material.opacity = tgt; else zp.material.opacity += d * zk;
      zp.visible = zp.material.opacity > 0.004; dirty = true;
    });
    hooks.frame.forEach(function (f) { f(now); });
    var rendered = false;
    if (dirty && host && document.body.contains(renderer.domElement) && current === 'game') {
      // soft contact shadow under every visible cube (follows drags and lifts too)
      for (var i = 0; i < meshes.length; i++) {
        var m = meshes[i], bl = blobs[i]; if (!bl) continue;
        if (!m.visible) { bl.visible = false; continue; }
        var sc0 = m.scale.x, h = Math.max(0, m.position.y - 0.5 * sc0), size = sc0 * (1.7 + h * 0.45);
        bl.visible = true; bl.position.set(m.position.x, 0.012, m.position.z); bl.scale.set(size, size, 1); bl.material.opacity = 0.34 / (1 + h * 0.9);
      }
      renderer.render(scene, camera); dirty = false; rendered = true;
    }
    governor(now, rendered, fromWatchdog);
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
    cueG = null; // a touch ends any camera cue; picking always uses the camera as drawn, so taps stay accurate while it eases home
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
      Object.keys(zonePlanes).forEach(function (k) { setGlow(k, tz.indexOf(k) >= 0 ? (k === z ? 0.85 : 0.3) : 0); });
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
    dropAnims: function (m) { anims = anims.filter(function (a) { return a.m !== m; }); dropSquash(m); }
  });
  Object.defineProperty(ctx, 'layout', { get: function () { return layout; } });
  Object.defineProperty(ctx, 'layoutName', { get: function () { return layoutName; } });
  applyQuality();
  api.ctx = ctx;
})();
