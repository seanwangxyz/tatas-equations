// 3D table: felt mat, dice, cup pour (physics), taps and drags.
// Loaded as an ES module; it fills in window.T3 (see the stand-in in js/config.js).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildStadium } from './stadium.js';
import { createFx3d } from './fx3d.js';
import { createQuality, LEVELS } from './quality.js';
import { createShots } from './shots.js';
import { createPostFx } from './postfx.js';
import { createOrbit, createOrbitUI, photoCanvas, savePhoto } from './orbit.js';
import { variRow, anyVari, createLabels, bangTex, heldTurn } from './varilabels.js'; // VARI3D: turned cubes and labels for the variation cards
import { THEMES, FLOOR_Y, makeEnvMap, softTexture, blobTexture, vignetteTexture, gradientBg, rectShadowTexture, feltBumpTile, paintFelt, woodTexture, buildEnvironment } from './environment.js';

(function () {
  var api = window.T3;
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); if (!renderer.getContext()) return; } catch (e) { return; }
  var hooks = { frame: [], extents: [], shrink: [] }; // other modules (creatures) plug in here
  var ctx = { held: null };              // shared with other 3D modules; filled in at the bottom
  // ---- COLLECT (spot the fan) block: hooks.tap = [fn(ray, info)], called for a tap that hit no cube and no zone ----
  hooks.tap = [];
  // ---- end COLLECT block ----
  api.supported = true;

  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1.5, 0.1, 300);
  var host = null, layout = null, layoutName = '', felt = null, zonePlanes = {}, rimGroup = null, meshes = [], anims = [], dirty = true;
  var world = null, pour = null, parenSprites = [], dragS = null, lastHit = 0, lastSpark = 0, lastFrame = 0, pulseId = null;
  var envFx = null, boardText = '', lightK = 1, baseL = null, sparks = [], sparkPool = [], slow = null, shake = null, shx = 0, shy = 0, fx3 = null;
  var tableGroup = null, blobs = [], squashes = [], puffs = [], puffPool = [], zoneGlow = {}, shots = null, orbit = null, orbitUI = null;
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = 'none';
  scene.add(camera); // the vignette is a child of the camera
  var vplan = null, vlab = createLabels({ camera: camera, renderer: renderer, scene: scene }); // VARI3D (js/three/varilabels.js)

  // ----- Quality tiers (js/three/quality.js measures frame times and steps down if frames get slow) -----
  // qual is the numeric level (0 low, 1 medium, 2 high) that the venues and effects read.
  var qual = 2, Q = null, post = null, texRes = 0;
  function applyQuality(level, L) {
    qual = level;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, L.pr));
    if (host) { renderer.setSize(host.clientWidth || 800, host.clientHeight || 500, false); }
    if (post) { post.enable(L.glow); post.setSize(host ? host.clientWidth || 800 : 800, host ? host.clientHeight || 500 : 500); }
    configShadows();
    var res = level >= 2 ? 512 : 256;
    if (res !== texRes || (meshes.length && meshes[0].userData.matLevel !== (level > 0))) {
      texRes = res;
      if (meshes.length) { Object.keys(texCache).forEach(function (k) { texCache[k].dispose(); }); texCache = {}; meshes.forEach(buildMats); if (api.lastG && !pour) api.sync(api.lastG); }
    }
    dirty = true;
  }
  // Shadows: the venue's key light (userData.key = true) casts them, else the first DirectionalLight found.
  // Only that one light casts; its shadow camera is fitted tightly around the table so the map stays sharp.
  var shV = new THREE.Vector3(), shT = new THREE.Vector3(), shadowKey = null;
  function keyLight() {
    var key = null, first = null;
    scene.traverse(function (o) { if (!o.isDirectionalLight) return; if (!first) first = o; if (!key && o.userData && o.userData.key) key = o; });
    return key || first;
  }
  function configShadows() {
    var L = LEVELS[qual], key = keyLight(), on = L.shadow > 0 && !!layout;
    scene.traverse(function (o) { if (o.isDirectionalLight) o.castShadow = on && o === key; });
    shadowKey = on ? key : null;
    if (!shadowKey) { dirty = true; return; }
    var sh = key.shadow, cam = sh.camera;
    if (sh.mapSize.x !== L.shadow) { sh.mapSize.set(L.shadow, L.shadow); if (sh.map) { sh.map.dispose(); sh.map = null; } }
    sh.bias = -0.0006; sh.normalBias = 0.03;
    key.updateWorldMatrix(true, false); key.target.updateWorldMatrix(true, false);
    key.getWorldPosition(shV); key.target.getWorldPosition(shT);
    cam.position.copy(shV); cam.lookAt(shT); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    // receivers: the felt and rim (plus a margin for cubes being lifted or dragged near the edge)
    var ow = layout.W / 2 + 1.4, od = layout.D / 2 + 1.4, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { [-1.2, 2].forEach(function (y) {
      shT.set(sx * ow, y, sz * od).applyMatrix4(cam.matrixWorldInverse);
      x0 = Math.min(x0, shT.x); x1 = Math.max(x1, shT.x); y0 = Math.min(y0, shT.y); y1 = Math.max(y1, shT.y); z0 = Math.min(z0, shT.z); z1 = Math.max(z1, shT.z);
    }); }); });
    cam.left = x0; cam.right = x1; cam.bottom = y0; cam.top = y1;
    cam.near = Math.max(0.1, -z1 - 30); cam.far = -z0 + 2; // casters up to 30 units toward the light (the cup, a creature's arms)
    cam.updateProjectionMatrix();
    sh.needsUpdate = true; dirty = true;
  }

  // ----- Lights (colours and strengths come from the mat theme; see applyTheme) -----
  var hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.8); scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(-6, 22, 10); // shadows are set up in configShadows (on this light unless a venue brings a key light)
  scene.add(sun);
  var fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(14, 10, -12); scene.add(fill);
  try { scene.environment = makeEnvMap(renderer); } catch (e) { scene.environment = null; }
  var blobTex = blobTexture(), puffTex = softTexture();
  var vignette = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: vignetteTexture(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  vignette.position.z = -0.5; vignette.renderOrder = 1000; vignette.frustumCulled = false; camera.add(vignette);
  // dim the whole room a little (spotlight effect); no lights are added, so no shader recompiles
  function setLightK(k) {
    lightK = k; if (!baseL) return;
    hemi.intensity = baseL.hemiI * k; sun.intensity = baseL.sunI * k; fill.intensity = baseL.fillI * k; scene.environmentIntensity = baseL.env * k;
    // lights a venue brings (its key light, lamps) dim along with the table's own
    if (tableGroup) tableGroup.traverse(function (o) {
      if (!o.isLight) return;
      if (o.userData.baseI === undefined) { if (k === 1) return; o.userData.baseI = o.intensity; }
      o.intensity = o.userData.baseI * k; if (k === 1) delete o.userData.baseI;
    });
    dirty = true;
  }
  function applyTheme() {
    var T = THEMES[S.cos.mat] || THEMES.felt;
    hemi.color.setHex(T.sky); hemi.groundColor.setHex(T.ground);
    sun.color.setHex(T.sun); fill.color.setHex(T.fill);
    baseL = T; setLightK(1);
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
  // ---- ONSETS block: T3.tableLayouts({layouts, labels, zcol}) paints another set of zones (same 'wide' / 'tall' names,
  // each zone [x, z, w, d]); T3.tableLayouts(null) puts Equations' back. The table is rebuilt at once if it is on screen. ----
  var EQ_LAY = [LAYOUTS, LABELS, ZCOL];
  api.tableLayouts = function (set) {
    var L = set ? [set.layouts, set.labels, Object.assign({}, ZCOL, set.zcol || {})] : EQ_LAY;
    if (LAYOUTS === L[0]) return;
    LAYOUTS = L[0]; LABELS = L[1]; ZCOL = L[2]; layoutName = '';
    if (host) chooseLayout();
  };
  // ---- end ONSETS block ----

  // ----- Textures -----
  var CUBECOL = { red: ['#ff6b6b', '#c92a2a'], blue: ['#4dabf7', '#1864ab'], green: ['#51cf66', '#2b8a3e'], black: ['#6c7078', '#16171a'] };
  var texCache = {};
  // ---- ONSETS block: other kinds of cube (js/three/onsets3d.js registers the On-Sets ones). T3.cubeKind(name, {faces, tex})
  // adds name to Eq.CUBE_FACES (6 symbols, face k = atlas cell k, like the colours) and tex(res) -> its 3x2 face texture.
  // A mesh takes the kind of the cube with its id in T3.sync / T3.pour (kindRole). Equations' colours never change. ----
  var KINDS = {};
  api.cubeKind = function (name, def) { KINDS[name] = def; Eq.CUBE_FACES[name] = def.faces.slice(); Object.keys(texCache).forEach(function (k) { if (k.indexOf('atlas' + name) === 0) { texCache[k].dispose(); delete texCache[k]; } }); };
  function kindRole(m, color) { if (m && !m.userData.d20 && color && m.userData.color !== color && Eq.CUBE_FACES[color] && (KINDS[color] || CUBECOL[color])) { m.userData.color = color; buildMats(m); } }
  // ---- end ONSETS block ----
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // All six faces of one colour in a 3 x 2 atlas (face k in cell k % 3, row k / 3), so a cube is one draw call.
  // CRAFT: besides the colour map, a skin may bring more layers of the same layout (drawn by faceLayer below):
  //   'bump'  the symbol pressed into the face (real light and shade on the inset), every skin, medium and high quality
  //   'glow'  what shines by itself (lava veins, galaxy stars, candy's inner light), added on top of the lighting
  //   'orm'   gold: where it is metal (the gold) and where it is not (the enamel band and the engraved symbol)
  function atlasTex(color, skin, layer) {
    var res = texRes || 256, key = 'atlas' + color + skin + res + (layer || '') + (window.A11y ? A11y.key() : ''); // (A11Y: the helpers change the faces)
    if (texCache[key]) return texCache[key];
    if (KINDS[color]) return layer ? null : (texCache[key] = KINDS[color].tex(res)); // ONSETS: a registered cube kind brings its own faces
    if (layer) res = Math.min(res, 256); // the extra layers are soft: 256 per face is plenty
    var cv = document.createElement('canvas'); cv.width = 3 * res; cv.height = 2 * res; var g = cv.getContext('2d');
    Eq.CUBE_FACES[color].forEach(function (s, k) {
      g.save(); g.translate((k % 3) * res, Math.floor(k / 3) * res); g.beginPath(); g.rect(0, 0, res, res); g.clip(); g.scale(res / 128, res / 128);
      if (layer) faceLayer(g, color, s, skin, layer, k); else drawFace(g, color, s, skin, k);
      g.restore();
    });
    var t = new THREE.CanvasTexture(cv);
    t.colorSpace = layer === 'bump' || layer === 'orm' ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texCache[key] = t;
    return t;
  }
  // ---- CRAFT: the five skins, each with its own character (the symbol is always the clearest thing on the face) ----
  // classic: glossy toy plastic. candy: boiled-sweet pastel with a soft inner light and DARK symbols (white on pastel was
  // about 1.5:1; these are 4.6:1 or better on every stripe). lava: dark basalt with glowing veins kept to the edges and a
  // band in the cube's colour. galaxy: a nebula in the cube's own colour with a few glittering stars. gold: polished metal
  // with an enamel band in the cube's colour and an engraved symbol. Everything is seeded, so a face is the same each time.
  var CANDY = { red: ['#ffd0dc', '#ffadc2', '#6e0f2c'], blue: ['#d3ecff', '#a5d6fd', '#0a3d6b'], green: ['#dcfbe1', '#b5f1bf', '#14532d'], black: ['#ded2ff', '#c0aafc', '#2a1260'] };
  function srnd(seed) { var x = (seed * 9301 + 49297) % 233280; return function () { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }
  function colorSeed(color) { return { red: 1, blue: 2, green: 3, black: 4 }[color] || 5; }
  // lava veins: short wandering cracks from the edge inward, never into the middle where the symbol is
  function lavaVeins(color, k) {
    var R = srnd(colorSeed(color) * 31 + k * 7 + 3), out = [];
    for (var v = 0; v < 5; v++) {
      var side = Math.floor(R() * 4), t = 14 + R() * 100, x = side === 0 ? t : side === 1 ? 122 : side === 2 ? t : 6, y = side === 0 ? 6 : side === 1 ? t : side === 2 ? 122 : t;
      var pts = [[x, y]], ang = Math.atan2(64 - y, 64 - x) + (R() - 0.5) * 1.4, len = 16 + R() * 20;
      for (var s = 0; s < 5; s++) {
        ang += (R() - 0.5) * 1.1; x += Math.cos(ang) * len / 5; y += Math.sin(ang) * len / 5;
        if (Math.hypot(x - 64, y - 66) < 42) break;
        pts.push([x, y]);
      }
      out.push({ pts: pts, w: 1.4 + R() * 1.8 });
    }
    return out;
  }
  function strokeVeins(g, veins, css, wk) {
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = css;
    veins.forEach(function (v) { if (v.pts.length < 2) return; g.lineWidth = v.w * wk; g.beginPath(); g.moveTo(v.pts[0][0], v.pts[0][1]); for (var i = 1; i < v.pts.length; i++) g.lineTo(v.pts[i][0], v.pts[i][1]); g.stroke(); });
  }
  function galaxyStars(color, k) {
    var R = srnd(colorSeed(color) * 17 + k * 5 + 11), out = [];
    for (var i = 0; i < 24; i++) { var x = 8 + R() * 112, y = 8 + R() * 112, mid = Math.hypot(x - 64, y - 66) < 40; out.push([x, y, (R() < 0.18 ? 1.7 : 0.95) * (mid ? 0.7 : 1), mid ? 0.3 : 0.55 + R() * 0.45]); }
    return out;
  }
  function symbolInk(color, skin, hcc) {
    if (skin === 'candy') return { ink: (CANDY[color] || CANDY.black)[2], edge: 'rgba(255,255,255,.75)', drop: 'rgba(255,255,255,.6)', lip: 'rgba(0,0,0,.45)' };
    if (skin === 'gold') return { ink: '#4a2f00', edge: 'rgba(255,244,210,.7)', drop: 'rgba(255,255,255,.5)', lip: 'rgba(0,0,0,.45)' };
    if (skin === 'lava') return { ink: '#fff4e2', edge: 'rgba(20,6,0,.8)', drop: 'rgba(0,0,0,.6)', lip: 'rgba(150,80,30,.7)' };
    if (skin === 'galaxy') return { ink: '#ffffff', edge: 'rgba(8,4,30,.75)', drop: 'rgba(0,0,0,.55)', lip: 'rgba(130,140,210,.7)' };
    if (hcc && hcc[2] !== '#fff') return { ink: hcc[2], edge: 'rgba(255,255,255,.55)', drop: 'rgba(255,255,255,.5)', lip: 'rgba(0,0,0,.35)' }; // A11Y: the light green takes a dark symbol
    return { ink: '#fff', edge: 'rgba(0,0,0,.42)', drop: 'rgba(0,0,0,.42)', lip: 'rgba(110,120,140,.8)' };
  }
  function symbolFont(s) { return '900 ' + (s === 'r' ? 84 : 80) + 'px "Trebuchet MS", "Segoe UI", sans-serif'; }
  function drawFace(g, color, s, skin, k) {
    var c = CUBECOL[color] || CUBECOL.black;
    var hcc = window.A11y && A11y.faceCols(color); if (hcc) c = hcc; // A11Y: high-contrast cube colours (docs/handoff/a11y.md)
    k = k || 0;
    if (skin === 'candy') {
      var cc = CANDY[color] || CANDY.black;
      g.fillStyle = cc[0]; g.fillRect(0, 0, 128, 128); g.strokeStyle = cc[1]; g.lineWidth = 11;
      for (var i = -128; i < 256; i += 30) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
      var cg = g.createRadialGradient(46, 40, 6, 64, 64, 96); cg.addColorStop(0, 'rgba(255,255,255,.45)'); cg.addColorStop(0.5, 'rgba(255,255,255,.08)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cg; g.fillRect(0, 0, 128, 128);
    } else if (skin === 'lava') {
      var lg0 = g.createRadialGradient(44, 40, 6, 64, 64, 100); lg0.addColorStop(0, '#4a2c22'); lg0.addColorStop(1, '#170c09'); g.fillStyle = lg0; g.fillRect(0, 0, 128, 128);
      var R0 = srnd(colorSeed(color) * 13 + k); for (var q = 0; q < 160; q++) { g.fillStyle = R0() < 0.5 ? 'rgba(255,190,140,.06)' : 'rgba(0,0,0,.18)'; g.fillRect(R0() * 128, R0() * 128, 2, 2); }
      var veins = lavaVeins(color, k); strokeVeins(g, veins, 'rgba(255,120,20,.5)', 2.2); strokeVeins(g, veins, '#ffb347', 1);
      g.strokeStyle = c[0]; g.lineWidth = 9; rr(g, 9, 9, 110, 110, 16); g.stroke();
    } else if (skin === 'galaxy') {
      g.fillStyle = '#0b0820'; g.fillRect(0, 0, 128, 128);
      var R1 = srnd(colorSeed(color) * 7 + k * 3);
      for (var n = 0; n < 3; n++) { var nx = 20 + R1() * 88, ny = 20 + R1() * 88, nr = 40 + R1() * 40, ng = g.createRadialGradient(nx, ny, 2, nx, ny, nr); ng.addColorStop(0, c[0] + '99'); ng.addColorStop(1, c[0] + '00'); g.fillStyle = ng; g.fillRect(0, 0, 128, 128); }
      galaxyStars(color, k).forEach(function (st) { g.fillStyle = 'rgba(255,255,255,' + st[3] + ')'; g.beginPath(); g.arc(st[0], st[1], st[2], 0, 6.283); g.fill(); });
      g.strokeStyle = c[0]; g.lineWidth = 8; rr(g, 8, 8, 112, 112, 16); g.stroke();
    } else if (skin === 'gold') {
      var go = g.createLinearGradient(0, 0, 128, 128); go.addColorStop(0, '#fff1b8'); go.addColorStop(0.4, '#f5c542'); go.addColorStop(0.75, '#e0a72e'); go.addColorStop(1, '#c4851a');
      g.fillStyle = go; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1; for (var b = 6; b < 128; b += 5) { g.beginPath(); g.moveTo(0, b); g.lineTo(128, b + 3); g.stroke(); } // fine brushed lines
      g.strokeStyle = c[0]; g.lineWidth = 13; rr(g, 9, 9, 110, 110, 16); g.stroke(); g.strokeStyle = c[1]; g.lineWidth = 2; rr(g, 15.5, 15.5, 97, 97, 11); g.stroke(); // the enamel band
      g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.5; rr(g, 14.5, 14.5, 99, 99, 12); g.stroke();
    } else {
      var lg = g.createLinearGradient(0, 0, 128, 128); lg.addColorStop(0, c[0]); lg.addColorStop(1, c[1]);
      g.fillStyle = lg; g.fillRect(0, 0, 128, 128);
      // soft darkening toward the edges (they fall on the rounded part of the cube), so the faces read as moulded plastic
      var eg = g.createRadialGradient(56, 52, 44, 64, 64, 96); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,.22)');
      g.fillStyle = eg; g.fillRect(0, 0, 128, 128);
    }
    if (window.A11y) A11y.drawFacePattern(g, color, 128, { skin: skin }); // A11Y: a pattern (and letter) per colour, under the symbol
    var label = Eq.SHOW[s] || s, si = symbolInk(color, skin, hcc);
    g.font = symbolFont(s); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.fillStyle = si.drop; g.fillText(label, 65.5, 68.5);
    // a firm outline keeps the symbol crisp against every colour and skin
    g.strokeStyle = si.edge; g.lineWidth = 5; g.strokeText(label, 64, 66);
    g.fillStyle = si.ink; g.fillText(label, 64, 66);
    inset(g, label, si); // pressed in: a thin shaded lip along the symbol's top-left inner edge (the bump layer adds real light)
    if (s === '6' || s === '9') { g.fillStyle = si.ink; g.strokeStyle = si.edge; g.lineWidth = 3; g.strokeRect(44, 104, 40, 7); g.fillRect(44, 104, 40, 7); } // underline so 6 and 9 can't be confused
  }
  var insetCv = null;
  function inset(g, label, si) {
    try {
      if (!insetCv) { insetCv = document.createElement('canvas'); insetCv.width = insetCv.height = 128; }
      var h = insetCv.getContext('2d'); h.clearRect(0, 0, 128, 128);
      h.font = g.font; h.textAlign = 'center'; h.textBaseline = 'middle';
      h.globalCompositeOperation = 'source-over'; h.fillStyle = si.lip; h.fillText(label, 64, 66);
      h.globalCompositeOperation = 'destination-out'; h.fillText(label, 65.4, 67.6); h.globalCompositeOperation = 'source-over';
      g.drawImage(insetCv, 0, 0);
    } catch (e) {}
  }
  // the extra layers (same cell layout as drawFace)
  function faceLayer(g, color, s, skin, layer, k) {
    var label = Eq.SHOW[s] || s;
    g.font = symbolFont(s); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (layer === 'bump') { // a white face with the symbol pressed in (darker = lower), softened a little
      g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
      if (skin === 'gold' || skin === 'lava' || skin === 'galaxy') { g.strokeStyle = '#e4e4e4'; g.lineWidth = 9; rr(g, 9, 9, 110, 110, 16); g.stroke(); } // the band sits a hair lower
      try { g.filter = 'blur(1.1px)'; } catch (e) {}
      g.fillStyle = '#606060'; g.strokeStyle = '#909090'; g.lineWidth = 4; g.strokeText(label, 64, 66); g.fillText(label, 64, 66);
      if (s === '6' || s === '9') g.fillRect(44, 104, 40, 7);
      try { g.filter = 'none'; } catch (e) {}
      return;
    }
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    if (layer === 'glow') {
      if (skin === 'lava') { var veins = lavaVeins(color, k); strokeVeins(g, veins, 'rgba(255,90,0,.5)', 2.4); strokeVeins(g, veins, '#ff9a3c', 1); }
      else if (skin === 'galaxy') galaxyStars(color, k).forEach(function (st) { if (st[3] < 0.5) return; g.fillStyle = 'rgba(255,255,255,' + st[3] + ')'; g.beginPath(); g.arc(st[0], st[1], st[2] * 1.1, 0, 6.283); g.fill(); });
      else if (skin === 'candy') { var cc = CANDY[color] || CANDY.black; g.fillStyle = cc[1]; g.fillRect(0, 0, 128, 128); g.fillStyle = '#000'; g.lineWidth = 8; g.strokeStyle = '#000'; g.strokeText(label, 64, 66); g.fillText(label, 64, 66); } // the sugar glows from inside, the symbol does not
      return;
    }
    if (layer === 'orm') { // three.js reads roughness from green and metalness from blue: gold = metal and smooth, enamel and symbol = not metal
      g.fillStyle = 'rgb(0,60,200)'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgb(0,90,0)'; g.lineWidth = 13; rr(g, 9, 9, 110, 110, 16); g.stroke();
      g.fillStyle = 'rgb(0,170,30)'; g.strokeStyle = 'rgb(0,170,30)'; g.lineWidth = 5; g.strokeText(label, 64, 66); g.fillText(label, 64, 66);
      if (s === '6' || s === '9') g.fillRect(44, 104, 40, 7);
    }
  }
  // ---- end CRAFT skins ----
  function spriteTex(txt, size) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 128; var g = cv.getContext('2d');
    g.font = '900 ' + (size || 100) + 'px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(txt, 67, 69); g.fillStyle = '#fff'; g.fillText(txt, 64, 64);
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  var lockTex = null;

  // ----- Rounded cube geometry (BoxGeometry with its corners pushed round) -----
  // CRAFT: 8 segments per side, spaced so that 3 of them sweep each rounded edge in even 15-degree steps (a smooth,
  // soft edge that catches a highlight) and the flat middle of the face, where the symbol is, stays flat. The face
  // texture runs across the rounded band too, so its outer 15% (the darker edge of the paint) wraps round the edge.
  var CUBE_R = 0.15;
  var cubeGeo = (function () {
    var N = 8, g = new THREE.BoxGeometry(1, 1, 1, N, N, N), p = g.attributes.position, n = g.attributes.normal, r = CUBE_R, h = 0.5 - r, v = new THREE.Vector3(), inner = new THREE.Vector3();
    var T = [0, Math.tan(Math.PI / 12), Math.tan(Math.PI / 6), 1].map(function (t) { return h + r * t; }); // band: 0, 15, 30, 45 degrees
    var at = [-T[3], -T[2], -T[1], -T[0], 0, T[0], T[1], T[2], T[3]];                                     // grid index -> coordinate
    function remap(x) { return at[Math.max(0, Math.min(N, Math.round((x + 0.5) * N)))]; }
    var uv = g.attributes.uv;
    for (var i = 0; i < p.count; i++) {
      v.set(remap(p.getX(i)), remap(p.getY(i)), remap(p.getZ(i)));
      uv.setXY(i, remap(uv.getX(i) - 0.5) + 0.5, remap(uv.getY(i) - 0.5) + 0.5); // the texture follows the new spacing
      inner.set(Math.max(-h, Math.min(h, v.x)), Math.max(-h, Math.min(h, v.y)), Math.max(-h, Math.min(h, v.z)));
      v.sub(inner); if (v.lengthSq() < 1e-12) v.set(0, 1, 0); v.normalize(); n.setXYZ(i, v.x, v.y, v.z); v.multiplyScalar(r).add(inner); p.setXYZ(i, v.x, v.y, v.z);
    }
    // point each face's UVs at its atlas cell (BoxGeometry faces don't share vertices), then drop the groups
    var idx = g.index, seen = {};
    g.groups.forEach(function (gr) {
      var k = gr.materialIndex, cx = k % 3, cy = Math.floor(k / 3);
      for (var j = gr.start; j < gr.start + gr.count; j++) {
        var vi = idx.getX(j); if (seen[vi]) continue; seen[vi] = 1;
        uv.setXY(vi, (cx + 0.004 + uv.getX(vi) * 0.992) / 3, (1 - cy + 0.004 + uv.getY(vi) * 0.992) / 2);
      }
    });
    g.clearGroups();
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
  // ---- BONUS dice (house rule, js/bonus.js): twenty-sided dice (icosahedra) for the Big-number and Power dice ----
  // Meshes 24 and 25 are the bonus CUBES (their role, 'big' or 'power', follows G.cubes[id].color each shake). (The Twist
  // deck is not a die: see the BONUS Twist deck block near the end.) Each face k shows face k of
  // Eq.CUBE_FACES[color]. Resting on a face, the centre is D20IN above the felt
  // (a little bigger than a cube, 0.5). At rest a die is still (no idle animation).
  var D20IN = 0.575, D20R = D20IN / 0.7946544722917661;
  var d20Geo = (function () {
    var g = new THREE.IcosahedronGeometry(D20R, 0), p = g.attributes.position, uv = g.attributes.uv, N = [], UPV = [], RTV = [];
    for (var f = 0; f < 20; f++) {
      var a = new THREE.Vector3().fromBufferAttribute(p, 3 * f), b = new THREE.Vector3().fromBufferAttribute(p, 3 * f + 1), c = new THREE.Vector3().fromBufferAttribute(p, 3 * f + 2);
      var cx = f % 5, cy = Math.floor(f / 5);   // cell f of a 5 x 4 atlas: a = apex (top middle), b = bottom left, c = bottom right
      uv.setXY(3 * f, (cx + 0.5) / 5, 1 - (cy + 0.08) / 4); uv.setXY(3 * f + 1, (cx + 0.06) / 5, 1 - (cy + 0.84) / 4); uv.setXY(3 * f + 2, (cx + 0.94) / 5, 1 - (cy + 0.84) / 4);
      var cen = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      N.push(cen.clone().normalize()); UPV.push(a.clone().sub(cen).normalize()); RTV.push(c.clone().sub(b).normalize());
    }
    uv.needsUpdate = true;
    g.userData = { N: N, UPV: UPV, RTV: RTV };
    return g;
  })();
  // rotation that puts face k on top, its label upright from the player's side (the same construction as FACEQ)
  var D20Q = d20Geo.userData.N.map(function (n, k) {
    var L = new THREE.Matrix4().makeBasis(d20Geo.userData.RTV[k], n, d20Geo.userData.UPV[k]);
    var T = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
    return new THREE.Quaternion().setFromRotationMatrix(T.multiply(L.transpose()));
  });
  var D20COL = { power: ['#ffe066', '#e8590c', '#5c3c00'], big: ['#b197fc', '#5f3dc4', '#ffffff'] };
  function d20Label(color, k) { try { return window.Bonus ? Bonus.faceLabel(color, k) : String(k + 1); } catch (e) { return String(k + 1); } }
  function d20Tex(color) {
    var res = Math.min(256, texRes || 256), key = 'd20' + color + res + (window.A11y ? A11y.key() : ''); // (A11Y)
    if (texCache[key]) return texCache[key];
    var cv = document.createElement('canvas'); cv.width = 5 * res; cv.height = 4 * res; var g = cv.getContext('2d'), C = D20COL[color] || D20COL.power;
    for (var k = 0; k < 20; k++) {
      g.save(); g.translate((k % 5) * res, Math.floor(k / 5) * res); g.scale(res / 128, res / 128);
      var lg = g.createLinearGradient(0, 0, 128, 128); lg.addColorStop(0, C[0]); lg.addColorStop(1, C[1]); g.fillStyle = lg; g.fillRect(0, 0, 128, 128);
      // a light rim just inside the face's edges (reads as a bevel), then the label at the triangle's centre
      g.beginPath(); g.moveTo(64, 16); g.lineTo(13, 103); g.lineTo(115, 103); g.closePath(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.stroke();
      if (window.A11y) A11y.drawFacePattern(g, color, 128, { ink: color === 'power' ? 'dark' : 'light', tri: true }); // A11Y: Power = double rim, Big-number = dotted rim
      var label = d20Label(color, k), size = label.length >= 4 ? 28 : label.length === 3 ? 36 : 46;
      g.font = '900 ' + size + 'px "Trebuchet MS", "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.strokeStyle = C[2] === '#ffffff' ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.6)'; g.lineWidth = 4; g.strokeText(label, 64, 79);
      g.fillStyle = C[2]; g.fillText(label, 64, 79);
      g.restore();
    }
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texCache[key] = t; return t;
  }
  var d20Pts = null;
  function d20Shape(scale) {
    if (!d20Pts) { // the 12 corners and 20 faces (same winding as the mesh: counter-clockwise from outside)
      var p = d20Geo.attributes.position, vs = [], fs = [];
      for (var f = 0; f < 20; f++) {
        var tri = [];
        for (var j = 0; j < 3; j++) {
          var v = new THREE.Vector3().fromBufferAttribute(p, 3 * f + j), at = -1;
          for (var q = 0; q < vs.length; q++) if (vs[q].distanceTo(v) < 1e-4) { at = q; break; }
          if (at < 0) { at = vs.length; vs.push(v); }
          tri.push(at);
        }
        fs.push(tri);
      }
      d20Pts = { vs: vs, fs: fs };
    }
    return new CANNON.ConvexPolyhedron({ vertices: d20Pts.vs.map(function (v) { return new CANNON.Vec3(v.x * scale, v.y * scale, v.z * scale); }), faces: d20Pts.fs.map(function (f) { return f.slice(); }) });
  }
  function isD20(m) { return !!(m && m.userData && m.userData.d20); }
  function restY(m) { return isD20(m) ? D20IN : 0.5; }
  function restQ(m, k) { return isD20(m) ? D20Q[k] || D20Q[0] : FACEQ[k]; }
  function facesOf(m) { return Eq.CUBE_FACES[m.userData.color] || []; }
  // ---- end BONUS block ----

  function skin() { return S.cos.skin || 'classic'; }
  // CRAFT: one material per cube (each can be tinted on its own), but every cube of a skin shares one shader program and
  // the per-colour atlases. Per skin: classic = glossy plastic, candy = boiled sweet (clear coat, a soft inner light so
  // its shaded sides never go muddy), lava = matt rock with glowing veins, galaxy = polished with glittering stars,
  // gold = real metal where it is gold (metalness map), enamel and engraving not. The low tier keeps the colour map only
  // (no clear coat, no bump, no extra layers: a cheaper shader).
  var SKINMAT = {
    classic: { rough: 0.3, coat: 0.8, coatR: 0.1, env: 1.1 },
    candy: { rough: 0.18, coat: 1, coatR: 0.04, env: 1.2, glow: 0.22, irid: 0.25 },
    lava: { rough: 0.78, coat: 0.12, coatR: 0.5, env: 0.7, glow: 2.2 },
    galaxy: { rough: 0.22, coat: 1, coatR: 0.06, env: 1.0, glow: 1.6 },
    gold: { rough: 1, metal: 1, coat: 0.25, coatR: 0.2, env: 1.35, orm: true }
  };
  function addGlow(mt, glowTex, k) {
    var uMap = { value: glowTex }, uK = { value: k }; // (kept out of userData: Material.clone() deep-copies that as JSON)
    mt.onBeforeCompile = function (sh) {
      sh.uniforms.uGlowMap = uMap; sh.uniforms.uGlowK = uK;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uGlowMap;\nuniform float uGlowK;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_MAP\n\ttotalEmissiveRadiance += texture2D( uGlowMap, vMapUv ).rgb * uGlowK;\n#endif');
    };
    mt.customProgramCacheKey = function () { return 'craft-cube-glow'; };
  }
  function buildMats(m) {
    var color = m.userData.color, sk = skin(), d20 = !!m.userData.d20, rich = qual > 0, P = SKINMAT[sk] || SKINMAT.classic;
    if (d20 || KINDS[color]) P = SKINMAT.classic; // the bonus dice and On-Sets cubes bring their own faces: plain glossy plastic
    var old = m.material && m.material.isMaterial ? m.material : null;
    var mt = new THREE.MeshPhysicalMaterial({ map: d20 ? d20Tex(color) : atlasTex(color, sk), // (BONUS: a twenty-sided die has its own atlas)
      roughness: P.rough, metalness: P.metal || 0, envMapIntensity: P.env,
      clearcoat: rich ? P.coat : 0, clearcoatRoughness: P.coatR });
    if (rich && !d20 && CUBECOL[color]) {
      mt.bumpMap = atlasTex(color, sk, 'bump'); mt.bumpScale = 1.6;
      if (P.orm) { var orm = atlasTex(color, sk, 'orm'); mt.roughnessMap = orm; mt.metalnessMap = orm; }
      if (P.glow) addGlow(mt, atlasTex(color, sk, 'glow'), P.glow);
      if (P.irid && qual >= 2) { mt.iridescence = P.irid; mt.iridescenceIOR = 1.4; }
    } else if (P.orm) { mt.metalness = 0.6; mt.roughness = 0.3; }
    if (old) { mt.color.copy(old.color); mt.emissive.copy(old.emissive); old.dispose(); } // keep locked / selected tints
    m.material = mt;
    m.userData.matLevel = rich;
  }
  // tint one cube: grey when locked, warm glow when selected or highlighted
  function tint(m, color, emissive) { m.material.color.setHex(color); m.material.emissive.setHex(emissive); }
  function ensureCubes() {
    if (meshes.length) return;
    if (!lockTex) lockTex = spriteTex('🔒', 90);
    var id = 0;
    Eq.COLORS.forEach(function (color) {
      for (var i = 0; i < 6; i++) {
        var m = new THREE.Mesh(cubeGeo, null);
        m.userData = { id: id, color: color, jit: (Math.random() - 0.5) * 0.05 }; // (CRAFT: a hair of hand-placed turn, tidy rows)
        buildMats(m); m.castShadow = true; m.receiveShadow = true; m.visible = false;
        var lk = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTex, depthTest: false })); lk.scale.set(0.6, 0.6, 0.6); lk.position.set(0.35, 0.8, 0); lk.visible = false; lk.renderOrder = 5;
        m.add(lk); m.userData.lock = lk;
        var bl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0, fog: false })); bl.rotation.x = -Math.PI / 2; bl.visible = false; bl.renderOrder = 1; scene.add(bl); blobs.push(bl);
        scene.add(m); meshes.push(m); id++;
      }
    });
    // BONUS: meshes 24 and 25 (the bonus cubes)
    ['big', 'power'].forEach(function (color, k) {
      var m = new THREE.Mesh(d20Geo, null);
      m.userData = { id: 24 + k, color: color, d20: true, jit: (Math.random() - 0.5) * 0.12 };
      buildMats(m); m.castShadow = true; m.receiveShadow = true; m.visible = false;
      var lk = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTex, depthTest: false })); lk.visible = false; m.add(lk); m.userData.lock = lk;
      scene.add(m);
      var bl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0, fog: false })); bl.rotation.x = -Math.PI / 2; bl.visible = false; bl.renderOrder = 1; scene.add(bl); blobs.push(bl);
      meshes.push(m);
    });
  }
  // BONUS: a d20 mesh takes the role (Big-number or Power) of the bonus cube with its id this shake
  function d20Role(m, color) { if (isD20(m) && color && m.userData.color !== color && D20COL[color]) { m.userData.color = color; buildMats(m); } }

  // ----- Table -----
  function disposeTree(o) {
    o.traverse(function (n) {
      if (n.isInstancedMesh) n.dispose();
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
  // The venue's scoreboard screen, for the 'goal' close-up: env.board, or a mesh marked userData.board,
  // or else the largest unlit (toneMapped: false) picture plane in the venue.
  var boardRef = null;
  function findBoard(env) {
    if (env.board && env.board.isObject3D) return env.board;
    var marked = null, best = null, area = 0;
    env.group.traverse(function (o) {
      if (o.userData && o.userData.board && !marked) marked = o;
      var m = o.material, p = o.geometry && o.geometry.parameters;
      if (o.isMesh && m && !Array.isArray(m) && m.isMeshBasicMaterial && m.map && m.toneMapped === false && m.fog === false && o.geometry.type === 'PlaneGeometry' && p.width * p.height > area) { area = p.width * p.height; best = o; }
    });
    return marked || best;
  }
  var bv1 = new THREE.Vector3(), bv2 = new THREE.Vector3(), bq = new THREE.Quaternion();
  function boardInfo() {
    var b = boardRef; if (!b || !b.parent) return null;
    b.updateWorldMatrix(true, false);
    var box = new THREE.Box3().setFromObject(b), center = box.getCenter(new THREE.Vector3());
    b.matrixWorld.decompose(bv1, bq, bv2);
    var p = b.geometry && b.geometry.parameters, w, h;
    if (p && p.width) { w = p.width * bv2.x; h = p.height * bv2.y; } else { var s = box.getSize(new THREE.Vector3()); w = Math.max(s.x, s.z); h = s.y; }
    return { center: center, normal: new THREE.Vector3(0, 0, 1).applyQuaternion(bq).normalize(), w: w, h: h };
  }
  // ---- CRAFT: the cloth, the sewn zones and the Goal's plinth ----
  function hexA(hex, a) { var n = parseInt(String(hex).replace('#', ''), 16); if (!isFinite(n)) return 'rgba(255,255,255,' + a + ')'; return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function feltNap(g, w, h) { // the nap of the cloth: thousands of tiny short strokes, all one way
    var R = srnd(77);
    for (var i = 0; i < 3200; i++) { var x = R() * w, y = R() * h, l = 5 + R() * 12; g.strokeStyle = R() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.045)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + l * 0.12); g.stroke(); }
  }
  function zoneBed(g, z, x, y, w, h) {
    g.save(); rr(g, x, y, w, h, 22); g.clip();
    g.fillStyle = z === 'resources' ? 'rgba(0,0,0,.13)' : z === 'goal' ? 'rgba(255,255,255,.1)' : hexA(ZCOL[z], 0.08); g.fillRect(x, y, w, h);
    if (z !== 'goal') { // pressed into the cloth: a soft shadow inside the top edge (deeper for the Resources tray)
      var tray = z === 'resources';
      g.shadowColor = 'rgba(0,0,0,' + (tray ? 0.55 : 0.3) + ')'; g.shadowBlur = tray ? 22 : 14; g.shadowOffsetY = tray ? 7 : 4;
      g.lineWidth = 24; g.strokeStyle = '#000'; rr(g, x - 12, y - 12, w + 24, h + 24, 34); g.stroke();
    }
    g.restore();
  }
  function satin(og, w, h) { // a satin-stitch texture on the cords only (source-atop keeps every dash exactly as drawn)
    og.save(); og.globalCompositeOperation = 'source-atop'; og.lineWidth = 1.5;
    for (var k = -h; k < w; k += 5) { og.strokeStyle = 'rgba(0,0,0,.24)'; og.beginPath(); og.moveTo(k, h); og.lineTo(k + h, 0); og.stroke(); og.strokeStyle = 'rgba(255,255,255,.2)'; og.beginPath(); og.moveTo(k + 2.5, h); og.lineTo(k + 2.5 + h, 0); og.stroke(); }
    og.restore();
  }
  function zonePatch(g, z, text, x, y, w, ppu) {
    if (!text) return;
    var fs = Math.round(0.5 * ppu * (window.A11y ? A11y.textScale() : 1)), F = function () { return '800 ' + fs + 'px "Trebuchet MS", sans-serif'; };
    g.font = F(); while (fs > 18 && g.measureText(text).width > w - 0.75 * ppu) { fs -= 2; g.font = F(); }
    var tw = g.measureText(text).width, ph = Math.round(fs * 1.5), px = x + 0.2 * ppu, py = y + 0.13 * ppu, pw = tw + fs * 1.1;
    g.save(); g.shadowColor = 'rgba(0,0,0,.42)'; g.shadowBlur = 6; g.shadowOffsetY = 2; rr(g, px, py, pw, ph, ph / 2); g.fillStyle = 'rgba(10,26,22,.66)'; g.fill(); g.restore();
    rr(g, px, py, pw, ph, ph / 2); g.fillStyle = hexA(ZCOL[z], 0.2); g.fill();
    g.lineWidth = 3; g.strokeStyle = hexA(ZCOL[z], 0.95); g.stroke();
    g.setLineDash([5, 4]); g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,.55)'; rr(g, px + 5, py + 5, pw - 10, ph - 10, (ph - 10) / 2); g.stroke(); g.setLineDash([]);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round';
    g.lineWidth = Math.max(4, fs * 0.17); g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(text, px + fs * 0.55, py + ph / 2 + 1);
    g.fillStyle = '#fff'; g.fillText(text, px + fs * 0.55, py + ph / 2 + 1);
  }
  // The Goal's plinth: a low brass frame round the Goal area. At rest it is still; when a Goal is set it warms up and
  // fades back once (plinthFlash), about 1.4 s.
  var plinth = null, plinthT = 0;
  function buildPlinth() {
    plinth = null; var r = layout && layout.z.goal; if (!r) return;
    var o = 0.1, i = 0.07, sh = new THREE.Shape(); rrp(sh, r[0] - o, -(r[1] + r[3]) - o, r[2] + 2 * o, r[3] + 2 * o, 0.38);
    var hole = new THREE.Path(); rrp(hole, r[0] + i, -(r[1] + r[3]) + i, r[2] - 2 * i, r[3] - 2 * i, 0.26); sh.holes.push(hole);
    var geo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 8 });
    var mat = new THREE.MeshStandardMaterial({ color: 0xe2bd62, metalness: 0.75, roughness: 0.32, emissive: 0xffc44d, emissiveIntensity: 0 });
    plinth = new THREE.Mesh(geo, mat); plinth.rotation.x = -Math.PI / 2; plinth.position.y = 0.005; plinth.receiveShadow = true; plinth.userData.plinth = true;
    tableGroup.add(plinth); plinthT = 0;
  }
  function plinthFlash() { if (!plinth || document.hidden) return; plinthT = performance.now(); dirty = true; startLoop(); }
  function stepPlinth(now) {
    if (!plinthT || !plinth) return false;
    var k = (now - plinthT) / 1400; if (k >= 1) { plinthT = 0; plinth.material.emissiveIntensity = 0; return true; }
    var e = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75; e = e * e * (3 - 2 * e); // up quickly, down slowly, once
    plinth.material.emissiveIntensity = e * (calm() ? 0.45 : 0.9); return true;
  }
  function calm() { try { return !!(window.A11y && A11y.calm()) || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  // ---- end CRAFT cloth ----
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
    feltNap(g, cv.width, cv.height);
    var labels = LABELS[layoutName];
    // CRAFT: the zones are sewn into the cloth. Each area has a faint tint of its own colour and is pressed in a little
    // (a soft inner shadow); Resources is a deeper tray. The outlines are raised cords with a satin-stitch texture (the
    // dash pattern, solid / dashed / dotted for the colour helpers, is kept exactly), and every label sits on a sewn
    // patch so it reads at seat distance on any felt.
    var oc = document.createElement('canvas'); oc.width = cv.width; oc.height = cv.height; var og = oc.getContext('2d');
    Object.keys(layout.z).forEach(function (z) {
      var r = layout.z[z], x = (r[0] + W / 2 + PAD) * ppu, y = (r[1] + D / 2 + PAD) * ppu, w = r[2] * ppu, h = r[3] * ppu;
      zoneBed(g, z, x, y, w, h);
      // A11Y: with colour helpers on, the edges differ by line too (Required solid, Permitted dashed, Forbidden dotted + hatch); labels follow the text size
      var zs = window.A11y && A11y.zoneStyle(z);
      if (zs && zs.hatch) A11y.drawHatch(g, x + 8, y + 0.8 * ppu, w - 16, h - 0.8 * ppu - 8);
      og.setLineDash(zs ? zs.dash : z === 'goal' ? [] : [22, 14]); og.lineCap = zs ? zs.cap : 'butt'; og.lineWidth = zs ? zs.width : 6; og.strokeStyle = ZCOL[z]; og.globalAlpha = zs ? 0.95 : 0.85; rr(og, x, y, w, h, 22); og.stroke(); og.globalAlpha = 1; og.setLineDash([]); og.lineCap = 'butt';
    });
    satin(og, oc.width, oc.height);
    g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 4; g.shadowOffsetY = 2; g.drawImage(oc, 0, 0); g.restore(); // the cords stand up off the cloth
    Object.keys(layout.z).forEach(function (z) {
      var r = layout.z[z], x = (r[0] + W / 2 + PAD) * ppu, y = (r[1] + D / 2 + PAD) * ppu, w = r[2] * ppu;
      zonePatch(g, z, labels[z], x, y, w, ppu); // (A11Y: the label size follows the text size setting, and still fits the zone)
    });
    Object.keys(layout.z).forEach(function (z) {
      var r = layout.z[z];
      var zp = new THREE.Mesh(new THREE.PlaneGeometry(r[2], r[3]), new THREE.MeshBasicMaterial({ map: glowTex(r[2], r[3], ZCOL[z] === '#ffffff' ? '#ffe066' : ZCOL[z]), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      zp.rotation.x = -Math.PI / 2; zp.position.set(r[0] + r[2] / 2, 0.02, r[1] + r[3] / 2); zp.userData.zone = z; zp.visible = false; zp.renderOrder = 2;
      tableGroup.add(zp); zonePlanes[z] = zp; zoneGlow[z] = 0;
    });
    var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
    var bump = feltBumpTile(); bump.repeat.set((W + 2 * PAD) / 1.2, (D + 2 * PAD) / 1.2);
    felt = new THREE.Mesh(new THREE.PlaneGeometry(W + 2 * PAD, D + 2 * PAD), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 1, bumpMap: bump, bumpScale: 1.2, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(T.felt).lerp(new THREE.Color(0xffffff), 0.2) })); // (CRAFT: a deeper cloth; the paler sheen washed it out)
    felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; felt.userData.occ = true; tableGroup.add(felt);
    buildPlinth(); // CRAFT: the Goal's raised frame
    // wooden rim: one rounded, bevelled frame
    var t = 0.7, hgt = 0.5, ow = W / 2 + t - 0.15, od = D / 2 + t - 0.15;
    var shape = new THREE.Shape(); rrp(shape, -ow, -od, 2 * ow, 2 * od, 0.9);
    var hole = new THREE.Path(); rrp(hole, -W / 2, -D / 2, W, D, 0.2); shape.holes.push(hole);
    var rimGeo = new THREE.ExtrudeGeometry(shape, { depth: hgt, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 4, curveSegments: 10 });
    var wood = new THREE.MeshPhysicalMaterial({ map: woodTexture(T.rim, 3, aniso), roughness: T.rimRough, metalness: T.rimMetal, clearcoat: 0.45, clearcoatRoughness: 0.35 });
    var rim = new THREE.Mesh(rimGeo, wood); rim.rotation.x = -Math.PI / 2; rim.position.y = 0; rim.castShadow = true; rim.receiveShadow = true; rim.userData.occ = true; tableGroup.add(rim);
    var darkWood = new THREE.MeshStandardMaterial({ map: woodTexture(T.rim, 7, aniso), color: T.apron || 0x9a8a80, roughness: 0.7 });
    var apron = new THREE.Mesh(new THREE.BoxGeometry(2 * ow - 0.4, 0.9, 2 * od - 0.4), darkWood); apron.position.y = -0.55; apron.castShadow = true; apron.userData.occ = true; tableGroup.add(apron);
    if (envFx) { envFx.dispose(); envFx = null; } if (fx3) fx3.reset(); slow = null;
    var env = name === 'stadium' ? buildStadium(W, D, aniso, layoutName, function () { return qual; }) : buildEnvironment(name, W, D, aniso, layoutName, function () { return qual; }); tableGroup.add(env.group);
    if (env.setBoard) { envFx = env; env.setBoard(boardText); }
    if (env.legs) {
      var lh = -0.9 - FLOOR_Y;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
        var leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, lh, 1.2), darkWood); leg.position.set(c[0] * (ow - 1.1), -0.9 - lh / 2, c[1] * (od - 1.1)); leg.castShadow = true; leg.userData.occ = true; tableGroup.add(leg);
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
    boardRef = findBoard(env);
    configShadows(); // the venue may bring its own key light
    if (post) post.tag();
    if (!pour) world = null; // walls depend on the layout
    else setWalls(world, true); // the layout changed mid-pour (a resize): new walls, and every cube is put back inside them
    builtTier = tierOf(qual); venueBox = measureVenue(env.group); colliders = null;
    dirty = true;
  }
  // The crowd and the venue details are built for the quality level in use when the table is built. When the level has
  // changed since (the automatic step-down, or the setting), the venue is rebuilt at the start of the next pour, where
  // a short hitch does not show (the pour runs on its own clock).
  var builtTier = -1, venueBox = null, colliders = null, collidersT = 0;
  function tierOf(q) { return q >= 2 ? 2 : q >= 1 ? 1 : 0; }
  // the box the look-around camera's look-at point stays in: the venue (stands, crowd, props), not the endless floor
  function measureVenue(g) {
    var box = new THREE.Box3(), b = new THREE.Box3();
    g.updateWorldMatrix(true, true);
    g.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); b.copy(o.boundingBox).applyMatrix4(o.matrixWorld); }
      else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); }
      var s = b.getSize(camTmpB); if (Math.max(s.x, s.z) > 70 || b.isEmpty()) return; // the ground / sky planes
      box.union(b);
    });
    var W = layout.W, D = layout.D;
    box.union(new THREE.Box3(new THREE.Vector3(-W / 2 - 3, FLOOR_Y, -D / 2 - 3), new THREE.Vector3(W / 2 + 3, 6, D / 2 + 3)));
    box.min.x += 0.5; box.max.x -= 0.5; box.min.z += 0.5; box.max.z -= 0.5;
    box.min.y = FLOOR_Y + 0.3; box.max.y = Math.max(4, Math.min(box.max.y, 14));
    return box;
  }
  var camTmpB = new THREE.Vector3();
  // what the look-around camera must not pass through: the table, the venue (not the crowd figures themselves: the
  // stands under them are enough), the creature, the kid, the cubes. Rebuilt at most once a second while looking around.
  function getColliders() {
    var now = performance.now();
    if (colliders && now - collidersT < 1000) return colliders;
    colliders = []; collidersT = now;
    scene.traverseVisible(function (o) {
      if (!o.isMesh || o.isInstancedMesh || o === vignette || blobs.indexOf(o) >= 0) return;
      var m = o.material; if (!m || Array.isArray(m)) { if (m) colliders.push(o); return; }
      if (m.depthWrite === false || (m.transparent && m.opacity < 0.5) || m.blending === THREE.AdditiveBlending) return;
      colliders.push(o);
    });
    return colliders;
  }
  var clipRay = new THREE.Raycaster(), clipDir = new THREE.Vector3();
  // keep the camera (pos, looking at look) short of the first solid thing between them, and above the floor
  function clipCam(look, pos) {
    clipDir.copy(pos).sub(look); var len = clipDir.length(); if (len < 1e-4) return;
    clipDir.divideScalar(len);
    clipRay.set(look, clipDir); clipRay.near = 0.05; clipRay.far = len + 0.7;
    var hit = clipRay.intersectObjects(getColliders(), false)[0];
    if (hit) { var d = Math.max(0.35, hit.distance - 0.7); if (d < len) pos.copy(look).addScaledVector(clipDir, d); }
    var fy = FLOOR_Y + 0.6;
    if (pos.y < fy) { if (look.y > fy + 0.01 && clipDir.y < -1e-3) pos.copy(look).addScaledVector(clipDir, (fy - look.y) / clipDir.y); else pos.y = fy; }
  }
  // the world point under a screen position (for zooming toward the mouse / the fingers), or null
  function aimAt(cx, cy) {
    var r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    clipRay.setFromCamera(ndc, camera); clipRay.near = 0.1; clipRay.far = 200;
    var hit = clipRay.intersectObjects(getColliders(), false)[0];
    // a little off the surface it hit (on the stands: about head height of the people sitting there)
    if (hit) { var pt = hit.point.clone(); if (hit.face) pt.addScaledVector(hit.face.normal.clone().transformDirection(hit.object.matrixWorld), 0.5); return pt; }
    var d = camera.position.distanceTo(camLook); // nothing there (the sky): a point as far away as the look-at point
    return clipRay.ray.at(d, new THREE.Vector3());
  }
  function chooseLayout() {
    if (!host) return;
    var w = host.clientWidth || 800, h = host.clientHeight || 500, name = (w / h < 0.9) ? 'tall' : 'wide';
    renderer.setSize(w, h, false); if (post) post.setSize(w, h);
    camera.aspect = w / h;
    var vh = 2 * 0.5 * Math.tan(camera.fov * Math.PI / 360); vignette.scale.set(vh * camera.aspect * 1.01, vh * 1.01, 1);
    if (name !== layoutName) { layoutName = name; layout = LAYOUTS[name]; buildTable(); }
    fitCamera(); dirty = true;
  }

  // ----- Camera: a fitted base view plus small, temporary offsets (follow the pour, cues) -----
  var base = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, camOff = { dolly: 0, yaw: 0, lift: 0, panX: 0, panZ: 0 }, CAMKEYS = ['dolly', 'yaw', 'lift', 'panX', 'panZ'], cueG = null, camTmp = new THREE.Vector3(), camLook = new THREE.Vector3();
  function camZero() { return CAMKEYS.every(function (k) { return camOff[k] === 0; }); }
  function applyCam() {
    if (camZero()) { camera.position.copy(base.pos); camLook.copy(base.look); }
    else {
      camTmp.copy(base.pos).sub(base.look);
      var cy = Math.cos(camOff.yaw), sy = Math.sin(camOff.yaw), x = camTmp.x * cy + camTmp.z * sy, z = -camTmp.x * sy + camTmp.z * cy;
      camTmp.set(x, camTmp.y, z).multiplyScalar(1 - camOff.dolly); camTmp.y += camOff.lift;
      camLook.copy(base.look); camLook.x += camOff.panX; camLook.z += camOff.panZ;
      camera.position.copy(base.look).add(camTmp); camera.position.x += camOff.panX; camera.position.z += camOff.panZ;
    }
    if (orbit) orbit.apply(camera.position, camLook); // the player looking around (js/three/orbit.js); a no-op at the seat
    var sw = 1;
    if (shots && shots.active()) { shots.apply(camera.position, camLook); sw = 1 - 0.85 * shots.weight(); } // a shake is much smaller during a close-up
    camera.lookAt(camLook);
    if (shx || shy) { camera.position.x += shx * sw; camera.position.y += shy * sw; }
    camera.updateMatrixWorld();
  }
  // A very small, quick camera shake (translation only). It always ends at exactly zero; a touch ends it at once.
  function endShake() { shake = null; if (shx || shy) { shx = shy = 0; applyCam(); dirty = true; } }
  // Put the camera exactly on the fitted view right now (taps and drags must be accurate).
  function camSnap() {
    cueG = null; endShake();
    if (shots && shots.active()) { shots.cancel(); applyCam(); dirty = true; }
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
    if (name === 'reset') { cueG = null; if (orbit) orbit.reset(); dirty = true; startLoop(); return; }
    var c = CUES[name]; if (!c || pour || (shots && shots.active())) return; // a close-up is already framing the moment
    if (orbitBusy()) return; // the player is looking around: their view is left alone (no cue on top of it)
    cueG = { t0: performance.now(), dur: c.dur, fn: c.fn }; dirty = true; startLoop();
  };
  // Fit: the closest distance (along the fixed tilt) at which the table, and then whatever other modules ask
  // for through hooks.extents (a creature's head, a kid in front), fits on screen. The extra points may push the
  // camera back by at most 35% beyond what the table alone needs, so a very tall creature or an object right
  // next to the camera can never shrink the table to a postage stamp. Points behind or right at the camera don't fit.
  // Hooks are called with the camera already standing at a sensible view (first the table-only fit, then the result
  // of the first pass), so a module that places something relative to the view (the kid behind the near rim) can
  // read ctx.camera. A point may carry a 4th value: true = a must (the top of a creature's head: the creature shrinks
  // until it fits). Points the fit cannot include (beyond the 35% cap) are simply left out of view: their module
  // checks visibility itself (ctx.camBase).
  var extraPts = [], CAP = 1.35, CAP_SOFT = 1.4;
  api._fitCaps = function (a, b) { if (a) CAP = a; if (b) CAP_SOFT = b; if (layout) { fitCamera(); dirty = true; } return [CAP, CAP_SOFT]; }; // tuning / tests
  function fitCamera() {
    var W = layout.W, D = layout.D, tilt = layout.tilt, look = new THREE.Vector3(0, 0, layoutName === 'tall' ? 0.7 : 0.6);
    var table = [[-W / 2 - 0.7, 0.6, -D / 2 - 0.7], [W / 2 + 0.7, 0.6, -D / 2 - 0.7], [-W / 2 - 0.7, 0.6, D / 2 + 0.7], [W / 2 + 0.7, 0.6, D / 2 + 0.7]], v = new THREE.Vector3(), extra = [];
    function gather(s) {
      hooks.shrink.forEach(function (f) { try { f(s); } catch (e) {} });
      extra = []; hooks.extents.forEach(function (f) { try { f(extra, W, D); } catch (e) {} });
      extra = extra.filter(function (c) { return c && isFinite(c[0]) && isFinite(c[1]) && isFinite(c[2]); });
      extraPts = extra;
    }
    camera.updateProjectionMatrix();
    function at(d) { camera.position.set(0, Math.sin(tilt) * d, look.z + Math.cos(tilt) * d); camera.lookAt(look); camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); }
    function inView(c) {
      v.set(c[0], c[1], c[2]).applyMatrix4(camera.matrixWorldInverse); if (v.z > -0.5) return false; // behind or touching the lens
      v.applyMatrix4(camera.projectionMatrix); return Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.97;
    }
    function search(pts, lo, hi) { for (var d = lo; d < hi; d += 0.25) { at(d); if (pts.every(inView)) return d; } return hi; }
    var dT = search(table, 8, 120), d = dT, z00 = look.z;
    at(dT); gather(1);
    // The closest view that holds the table and the extra points, aiming along the table: toward the far side (uses
    // the empty band below the near edge, for a creature's head) or toward the near side (room below the near rim,
    // for the kid standing there). Keeps the aim that needs the least distance; never more than 35% further back.
    function solve() {
      // 'soft' points (the kid's head below the near rim) may take the camera a little further back (40% instead of
      // 35%), so that on wide, short screens the creature does not have to shrink as much to make room for him
      var cap = extra.some(function (c) { return c[3] === 'soft'; }) ? CAP_SOFT : CAP;
      var all = table.concat(extra), z0 = z00, bestZ = z0; look.z = z0; d = search(all, dT, dT * cap);
      for (var k = 1; k <= 10; k++) {
        look.z = z0 - k * 0.5; var dk = search(all, 8, d); if (dk < d - 0.01) { d = dk; bestZ = look.z; }
        look.z = z0 + k * 0.4; dk = search(all, 8, d); if (dk < d - 0.01) { d = dk; bestZ = look.z; }
      }
      look.z = bestZ; at(d);
    }
    function mustOK() { return extra.every(function (c) { return c[3] !== true || inView(c); }); }
    // If the head still does not fit (a wide, short screen), the creature itself gets a little smaller, step by step.
    for (var s = 1; extra.length && s > 0.5; s -= 0.06) {
      if (s < 1) gather(s);
      solve();
      if (mustOK()) break;   // only points marked as a must (the top of the head)
    }
    if (s <= 0.5) s += 0.06;
    // a second pass with the camera where the first one put it: view-relative placements (the kid) settle
    if (extra.length) { gather(s); solve(); }
    at(d);
    api._fit = { d: d, dT: dT, s: s, lookZ: look.z, pts: extra.map(function (c) { return [c[0].toFixed(1), c[1].toFixed(1), c[2].toFixed(1), !!c[3], inView(c)]; }), table: table.every(inView) };
    base.pos.copy(camera.position); base.look.copy(look); applyCam();
  }
  // Where the opponent's head is, for close-ups: T3.creatureFocus() if the creature module offers it, else an
  // estimate from the highest point the creature asked to keep in view (behind the far edge of the table).
  function creatureInfo() {
    if (api.creatureVisible && !api.creatureVisible()) return null;
    if (api.creatureFocus) { try { var f = api.creatureFocus(); if (f && f.head) return { head: f.head.clone ? f.head.clone() : new THREE.Vector3(f.head.x, f.head.y, f.head.z), height: f.height || 3 }; } catch (e) {} }
    if (!layout || !api.creatureVisible) return null;
    // the creature is a top-level object behind the far edge of the table that this module didn't add
    var found = null, box = new THREE.Box3(), wp = new THREE.Vector3();
    scene.children.forEach(function (o) {
      if (found || !o.visible || o.isLight || o.isSprite || o.isCamera || o === tableGroup || o === cup || meshes.indexOf(o) >= 0 || blobs.indexOf(o) >= 0) return;
      o.getWorldPosition(wp); if (wp.z > -layout.D / 2) return;
      box.setFromObject(o); if (!box.isEmpty() && box.max.y > 1) found = o;
    });
    var top = null;
    extraPts.forEach(function (c) { if (c[2] < -layout.D / 2 && (!top || c[1] > top[1])) top = c; });
    if (found) { // a rough guess (the model may lean toward the table), so it is framed a little wider than measured
      var ty = Math.max(box.max.y, top ? top[1] : 0), hh = Math.max(1.5, ty - Math.max(box.min.y, 0.2));
      return { head: new THREE.Vector3(wp.x, ty - hh * 0.2, (wp.z + (box.min.z + box.max.z) / 2) / 2), height: hh * 1.25 };
    }
    if (!top) return null;
    var h = Math.max(1.5, top[1] - 0.2);
    return { head: new THREE.Vector3(0, top[1] - h * 0.18, top[2]), height: h };
  }
  var ro = window.ResizeObserver ? new ResizeObserver(function () { chooseLayout(); if (api.lastG) api.sync(api.lastG, true); }) : null;
  api.attach = function (el) {
    if (host === el && renderer.domElement.parentNode === el) return;
    host = el; el.innerHTML = ''; el.appendChild(renderer.domElement); orbitUI.mount(el);
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
    var k = (Eq.CUBE_FACES[c.color] || []).indexOf(c.s); if (k < 0) k = isD20(m) ? 0 : 2; // (BONUS: a d20 rests on face k too)
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.userData.jit).multiply(restQ(m, k));
  }
  function tweenTo(m, pos, q, scale, opts) {
    anims = anims.filter(function (a) { return a.m !== m; }); dropSquash(m);
    anims.push({ m: m, p0: m.position.clone(), p1: pos, q0: m.quaternion.clone(), q1: q, s0: m.scale.x, s1: scale, t0: performance.now(), dur: opts.dur, arc: opts.arc, land: opts.land, lin: !!opts.lin, tidy: !!opts.tidy });
    if (opts.land && opts.arc > 1 && !opts.quiet) Snd.pickup();
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
    // CRAFT: set down = a tiny squash and ONE soft ring on the cloth in the colour of the zone it landed in
    var z = a.m.userData.zone, col = z && ZCOL[z] ? ZCOL[z] : '#ffffff';
    if (z === 'goal' || z === 'resources' || !ZCOL[z]) col = '#fff3bf';
    craftRing(a.p1.x, a.p1.z, col, 1.5 + 0.6 * power * a.s1, 520, 0.55);
    dropSquash(a.m); squashes.push({ m: a.m, t0: now, s: a.s1, y: a.p1.y, amp: power * 0.75 });
  }
  // ---- CRAFT: one-shot moments on the cloth. Everything here is a single move that ends at rest (nothing loops):
  //   craftRing(x, z, css, size, ms, alpha)  a soft ring that opens out and fades (pooled flat sprites)
  //   hop(m, delay, h)                         a cube rises h and lands back exactly where it was (Now! / Impossible!)
  //   nope(m)                                  a small "no" wobble (twice side to side, smaller each time), once
  //   glowCubes(ids)                           the cubes of a correct Solution warm up one by one, left to right, once
  // With "Reduce flashing" (A11y.calm / prefers-reduced-motion) rings are fainter, nothing hops and the glow is softer. ----
  var rings = [], ringPool = [], hops = [], nopes = [], glows = [], ringTex = null, ringGeo = new THREE.PlaneGeometry(1, 1);
  function ringTexture() {
    if (ringTex) return ringTex;
    var cv = document.createElement('canvas'); cv.width = cv.height = 128; var g = cv.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 63); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.62, 'rgba(255,255,255,0)'); gr.addColorStop(0.8, 'rgba(255,255,255,.35)'); gr.addColorStop(0.87, 'rgba(255,255,255,1)'); gr.addColorStop(0.93, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    ringTex = new THREE.CanvasTexture(cv); ringTex.colorSpace = THREE.SRGBColorSpace; return ringTex;
  }
  function craftRing(x, z, css, size, ms, alpha) {
    if (document.hidden || !layout) return;
    var m = ringPool.pop();
    if (!m) { if (rings.length > 30) return; m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 3; scene.add(m); }
    var u = m.userData; u.t0 = performance.now(); u.ms = ms; u.size = size; u.a = alpha * (calm() ? 0.55 : 1);
    m.material.color.set(css); m.material.opacity = 0; m.position.set(x, 0.03, z); m.scale.set(size * 0.3, size * 0.3, 1); m.visible = true;
    rings.push(m); dirty = true; startLoop();
  }
  function cubeFree(m) { return m.visible && !anims.some(function (a) { return a.m === m; }) && ctx.held !== m.userData.id && !(dragS && dragS.on && dragS.id === m.userData.id) && !(tumble && tumble.ids[m.userData.id] !== undefined); }
  function hop(m, delay, h) {
    if (calm() || !cubeFree(m) || hops.some(function (o) { return o.m === m; })) return;
    hops.push({ m: m, t0: performance.now() + delay, y0: null, h: h, ms: 260 });
  }
  function nope(m) {
    if (!m || document.hidden) return;
    nopes = nopes.filter(function (o) { return o.m !== m; });
    nopes.push({ m: m, t0: performance.now() + 250, q0: null, ms: 460, a: calm() ? 0.09 : 0.17 }); dirty = true; startLoop();
  }
  var glowCol = new THREE.Color(0xffd98a), tmpCol = new THREE.Color();
  function glowCubes(ids) {
    var t = performance.now() + 350;
    ids.forEach(function (id, i) { var m = meshes[id]; if (!m || !m.visible) return; glows = glows.filter(function (o) { return o.m !== m; }); glows.push({ m: m, t0: t + i * 190, ms: 720, base: m.material.emissive.getHex() }); });
    if (glows.length) { dirty = true; startLoop(); }
  }
  function stepCraft(now) {
    var any = false;
    if (rings.length) {
      rings = rings.filter(function (m) {
        var u = m.userData, k = (now - u.t0) / u.ms;
        if (k >= 1) { m.visible = false; ringPool.push(m); return false; }
        var e = 1 - Math.pow(1 - k, 3), s = u.size * (0.3 + 0.7 * e); m.scale.set(s, s, 1);
        m.material.opacity = u.a * Math.min(1, k * 8) * Math.pow(1 - k, 1.5); return true;
      });
      any = true;
    }
    if (hops.length) {
      hops = hops.filter(function (o) {
        var m = o.m, k = (now - o.t0) / o.ms;
        if (k < 0) return true;
        if (o.y0 === null) { if (!cubeFree(m)) return false; o.y0 = m.position.y; }
        else if (anims.some(function (a) { return a.m === m; }) || ctx.held === m.userData.id || (dragS && dragS.on && dragS.id === m.userData.id)) return false; // something else took it: leave it to that
        if (k >= 1) { m.position.y = o.y0; return false; }
        m.position.y = o.y0 + o.h * Math.sin(Math.PI * k); return true;
      });
      any = true;
    }
    if (nopes.length) {
      nopes = nopes.filter(function (o) {
        var m = o.m, k = (now - o.t0) / o.ms;
        if (k < 0) return true;
        if (o.q0 === null) { if (!cubeFree(m)) return false; o.q0 = m.quaternion.clone(); }
        else if (anims.some(function (a) { return a.m === m; }) || ctx.held === m.userData.id || (dragS && dragS.on && dragS.id === m.userData.id)) return false;
        if (k >= 1) { m.quaternion.copy(o.q0); return false; }
        var ang = o.a * Math.sin(k * Math.PI * 4) * (1 - k); // two swings side to side, each smaller, then still
        m.quaternion.setFromAxisAngle(YAXIS, ang).multiply(o.q0); return true;
      });
      any = true;
    }
    if (glows.length) {
      glows = glows.filter(function (o) {
        var m = o.m, k = (now - o.t0) / o.ms;
        if (k < 0) return true;
        if (k >= 1 || !m.visible) { m.material.emissive.setHex(o.base); return false; }
        var e = Math.sin(Math.PI * Math.min(1, k)); e = e * e * (calm() ? 0.45 : 0.8);
        m.material.emissive.copy(tmpCol.setHex(o.base).lerp(glowCol, e)); return true;
      });
      any = true;
    }
    return any;
  }
  // a big soft ring across the cloth from the middle of the table, and every resting cube hops a hair as it passes (once)
  function shockwave(css) {
    if (!layout) return;
    var W = layout.W, D = layout.D, size = Math.hypot(W, D) * 1.15, ms = 1000, cx = 0, cz = (layout.z.required[1] + layout.z.required[3] / 2);
    craftRing(cx, cz, css, size, ms, 0.8);
    meshes.forEach(function (m) {
      if (!m.visible) return;
      // when the ring's bright edge (radius 0.43 x its size, opening as 0.3 + 0.7 e, e = 1 - (1 - k)^3) passes the cube
      var d = Math.hypot(m.position.x - cx, m.position.z - cz), e = Math.max(0, Math.min(0.999, (d / (0.43 * size) - 0.3) / 0.7));
      hop(m, ms * (1 - Math.cbrt(1 - e)), 0.07 * m.scale.x);
    });
  }
  api.nope = function (id) { nope(meshes[id]); }; // CRAFT: other modules may ask for the "no" wobble on a cube
  api._craft = function (cmd, a) { if (cmd === 'ring') craftRing(a.x, a.z, a.css || '#ffffff', a.size || 2, a.ms || 520, a.alpha || 0.55); if (cmd === 'shock') shockwave(a || '#ffe066'); if (cmd === 'glow') glowCubes(a); if (cmd === 'plinth') plinthFlash(); return { rings: rings.length, pool: ringPool.length, hops: hops.length, nopes: nopes.length, glows: glows.length, plinth: !!plinth }; }; // checks / debugging
  // read from the game state on every T3.sync: the Goal just set (the plinth warms once), a shake just ended with a
  // correct Solution (its cubes glow in the order they are read)
  var lastPhase = null, lastShakeSeen = null;
  function craftMoments(G) {
    try {
      var ph = G.phase;
      if (lastPhase === 'goal' && ph === 'move' && G.goalTokens && G.goalTokens.length) setTimeout(plinthFlash, 250);
      if (ph === 'over' && G.lastShake && G.lastShake !== lastShakeSeen) {
        lastShakeSeen = G.lastShake;
        var sols = G.lastShake.sols || {}, keys = Object.keys(sols).sort(function (a, b) { return (+a === 0 ? -1 : 0) - (+b === 0 ? -1 : 0); }), pick = null; // the player's own first
        keys.forEach(function (k) { var s = sols[k]; if (!pick && s && s.ok && s.tokens) pick = s; });
        if (pick) glowCubes(pick.tokens.filter(function (t) { return t && typeof t === 'object' && t.id != null; }).map(function (t) { return t.id; }));
      }
      lastPhase = ph;
    } catch (e) {}
  }
  // ---- end CRAFT moments ----
  // Sparks where two dice smack together hard (additive sprites, pooled, thinned by quality)
  function spawnSparks(x, y, z, power) {
    if (document.hidden || qual < 1) return;
    var T = THEMES[S.cos.mat] || THEMES.felt, n = qual >= 2 ? 6 : 3, now = performance.now();
    for (var i = 0; i < n; i++) {
      var sp = sparkPool.pop();
      if (!sp) { if (sparks.length > 36) break; sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false })); sp.renderOrder = 4; scene.add(sp); }
      var a = Math.random() * 6.283, v = 2.5 + Math.random() * 3.5 * power, u = sp.userData;
      u.t0 = now; u.x = x; u.y = Math.max(0.2, y); u.z = z; u.vx = Math.cos(a) * v; u.vz = Math.sin(a) * v; u.vy = 2 + Math.random() * 3; u.life = 260 + Math.random() * 160; u.sz = 0.22 + Math.random() * 0.16;
      sp.material.color.setHex(T.spark || 0xffd27a); sp.material.opacity = 1; sp.position.set(x, u.y, z); sp.scale.set(u.sz, u.sz, 1); sp.visible = true;
      sparks.push(sp);
    }
    dirty = true;
  }
  function stepSparks(now, dt) {
    if (!sparks.length) return;
    sparks = sparks.filter(function (sp) {
      var u = sp.userData, k = (now - u.t0) / u.life;
      if (k >= 1) { sp.visible = false; sparkPool.push(sp); return false; }
      u.vy -= 14 * dt; u.x += u.vx * dt; u.z += u.vz * dt; u.y = Math.max(0.06, u.y + u.vy * dt);
      sp.position.set(u.x, u.y, u.z); var sz = u.sz * (1 - 0.6 * k); sp.scale.set(sz, sz, 1); sp.material.opacity = 1 - k;
      return true;
    });
    dirty = true;
  }
  // Slow-motion beat as the last die settles: physics time eases to ~30% and back (adds about 0.2s)
  function slowScale(now) {
    if (!slow) return 1;
    var k = (now - slow.t0) / slow.dur; if (k >= 1) { slow = null; return 1; }
    var e = function (x) { return x * x * (3 - 2 * x); };
    return 1 - 0.7 * Math.min(e(Math.min(1, k / 0.22)), e(Math.min(1, (1 - k) / 0.38)));
  }
  api.sync = function (G, force) {
    api.lastG = G;
    if (!G || !layout) return;
    ensureCubes();
    if (pour) return; // physics is moving the cubes right now
    craftMoments(G);
    var targets = {};
    ['required', 'permitted', 'forbidden', 'resources'].forEach(function (z) {
      var cs = G.cubes.filter(function (c) { return c.zone === z; }).sort(function (a, b) { return a.order - b.order; }), sl = gridSlots(z, cs.length);
      cs.forEach(function (c, i) { targets[c.id] = sl[i]; });
    });
    // Goal: cubes plus parentheses in one centred row
    parenSprites.forEach(function (sp) { sp.visible = false; });
    var gt = G.goalTokens || [], a = zoneArea('goal'), vr = G.vari ? variRow(gt, G.fractions) : null, vlist = []; // VARI3D: vr = turns, exponents, "!" and labels
    if (vr && !anyVari(vr)) vr = null;
    var widths = gt.map(function (t, i) { return (t === '(' || t === ')') ? 0.55 : vr && vr[i].bang ? 0.5 : vr && vr[i].exp ? 0.62 : 1.2; });
    var total = widths.reduce(function (x, y) { return x + y; }, 0), gs = Math.min(1, a.w / Math.max(total, 1)), x = a.x + (a.w - total * gs) / 2, pi = 0;
    gt.forEach(function (t, i) {
      var cx = x + widths[i] * gs / 2;
      var v = vr && vr[i]; // VARI3D: an exponent sits raised, smaller, top-right of the slot before it; a turned cube rests turned
      if (typeof t === 'object') { targets[t.id] = v ? { x: cx - (v.exp ? 0.12 * gs : 0), z: a.z + a.d / 2 - (v.exp ? 0.28 * gs : 0), scale: Math.min(1, gs) * (v.exp ? 0.58 : 1), y: v.exp ? 0.98 * gs : null, turn: v.turn } : { x: cx, z: a.z + a.d / 2, scale: Math.min(1, gs) }; if (v && v.cap && meshes[t.id]) vlist.push({ mesh: meshes[t.id], text: v.cap }); }
      else if (t === '(' || t === ')' || (v && v.bang)) {
        if (!parenSprites[pi]) { parenSprites[pi] = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, depthTest: true })); scene.add(parenSprites[pi]); }
        var sp = parenSprites[pi++]; sp.material.map = v && v.bang ? bangTex() : spriteTex(t, 110); sp.material.needsUpdate = true; sp.scale.set((v && v.bang ? 0.62 : 1.1) * gs, (v && v.bang ? 1.24 : 1.1) * gs, 1); sp.position.set(cx, v && v.bang ? 0.66 : 0.6, a.z + a.d / 2); sp.visible = true;
      }
      x += widths[i] * gs;
    });
    if (vr || vlab.count()) vlab.set(vlist, gt.filter(function (t) { return typeof t === 'object' && meshes[t.id]; }).map(function (t) { return meshes[t.id]; })); // VARI3D
    if (G.slots) Object.keys(G.slots).forEach(function (id) { targets[id] = G.slots[id]; }); // ONSETS: places the caller chose itself (an On-Sets Goal: stacked, side by side, upside down = turn)
    var tz = api.handlers.targetZones ? api.handlers.targetZones() : [];
    Object.keys(zonePlanes).forEach(function (z) { setGlow(z, tz.indexOf(z) >= 0 ? 0.3 : 0); });
    pulseId = G.highlight != null ? G.highlight : null;
    G.cubes.forEach(function (c) {
      var m = meshes[c.id], t = targets[c.id]; if (!m) return;
      d20Role(m, c.color); kindRole(m, c.color); // (BONUS) (ONSETS: kindRole)
      if (!t) { m.visible = false; return; }
      m.visible = true;
      if (dragS && dragS.id === c.id && dragS.on) return;
      if (ctx.held === c.id) return;
      if (tumble && tumble.ids[c.id] !== undefined) return; // rolling again (T3.reroll): it lands first
      var lift = (G.selected === c.id) ? 0.8 : 0;
      var pos = new THREE.Vector3(t.x, (t.y != null ? t.y : restY(m) * t.scale) + lift, t.z), q = slotQuat(c, m), u = m.userData; // (BONUS: restY)
      if (t.turn) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.turn)); // VARI3D: a turned Goal cube
      m.userData.lock.visible = !!c.locked;
      tint(m, c.locked ? 0x9a9a9a : 0xffffff, G.selected === c.id ? 0x6b5200 : G.highlight === c.id ? 0x665200 : 0x000000);
      var same = u.tpos && u.tpos.distanceTo(pos) < 0.01 && Math.abs(u.tscale - t.scale) < 0.01 && u.tq && u.tq.angleTo(q) < 0.01;
      if (same && !force) return;
      var moved = u.zone && u.zone !== c.zone, fromPour = u.fromPour, dropped = u.dropped, toss = u.toss; u.dropped = false; u.toss = false;
      if (u.vturn) { var vq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), u.vturn).multiply(m.quaternion); if (vq.angleTo(q) < m.quaternion.angleTo(q)) m.quaternion.copy(vq); u.vturn = 0; } // VARI3D: turned in the hand, stays turned
      u.tpos = pos.clone(); u.tq = q.clone(); u.tscale = t.scale; u.zone = c.zone; u.fromPour = false;
      if (force && same) { m.position.copy(pos); m.quaternion.copy(q); m.scale.setScalar(t.scale); return; }
      // toss: let go of from a hand short of the slot (the kid's player), a quick lob that lands with the usual thunk
      var td = toss ? m.position.distanceTo(pos) : 0;
      tweenTo(m, pos, q, t.scale, toss ? { dur: Math.min(560, Math.max(300, 230 + 34 * td)), arc: Math.min(2.6, Math.max(0.6, 0.35 + 0.2 * td)), land: true, lin: true, quiet: true } : dropped ? { dur: 380, arc: 0.3, land: true } : moved ? { dur: 650, arc: 3, land: true } : fromPour ? { dur: 750 + Math.random() * 250, arc: 1.2 } : { dur: 320, arc: 0, tidy: true });
    });
    dirty = true;
  };

  // ----- Pouring the cubes out of a cup -----
  // CRAFT: the dice cup: stitched leather (two rows of saddle stitching), a rolled leather lip, a soft dark-red felt
  // lining (the inside is what you see as it tips), two thin brass bands and a brass "=" medallion facing the seat.
  var cup = (function () {
    var g = new THREE.Group(), R = srnd(5);
    var lc = document.createElement('canvas'); lc.width = 512; lc.height = 256; var lg = lc.getContext('2d');
    var bgL = lg.createLinearGradient(0, 0, 0, 256); bgL.addColorStop(0, '#8a4722'); bgL.addColorStop(1, '#6a3417'); lg.fillStyle = bgL; lg.fillRect(0, 0, 512, 256);
    for (var i = 0; i < 9000; i++) { lg.fillStyle = R() < 0.5 ? 'rgba(255,200,140,.07)' : 'rgba(0,0,0,.11)'; lg.fillRect(R() * 512, R() * 256, 2, 2); }
    // the wall runs from v = 1/3 (canvas y 171) to v = 1 (y 0): stitches near the lip and near the base
    [16, 156].forEach(function (y) {
      lg.strokeStyle = 'rgba(0,0,0,.35)'; lg.lineWidth = 3; lg.beginPath(); lg.moveTo(0, y - 6); lg.lineTo(512, y - 6); lg.moveTo(0, y + 6); lg.lineTo(512, y + 6); lg.stroke();
      for (var x = 2; x < 512; x += 12) { lg.strokeStyle = 'rgba(40,18,6,.6)'; lg.lineWidth = 3; lg.beginPath(); lg.moveTo(x + 1, y + 1); lg.lineTo(x + 8, y + 1); lg.stroke(); lg.strokeStyle = '#f1d9a8'; lg.lineWidth = 2.2; lg.beginPath(); lg.moveTo(x, y); lg.lineTo(x + 7, y); lg.stroke(); }
    });
    var lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace; lt.wrapS = THREE.RepeatWrapping;
    var leather = new THREE.MeshPhysicalMaterial({ map: lt, bumpMap: lt, bumpScale: 0.5, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5 });
    var V = function (a) { return a.map(function (q) { return new THREE.Vector2(q[0], q[1]); }); };
    var body = new THREE.Mesh(new THREE.LatheGeometry(V([[0, -1.6], [1.2, -1.6], [1.36, -1.5], [1.45, -0.75], [1.54, 0], [1.63, 0.75], [1.72, 1.5]]), 56), leather); body.castShadow = true; body.receiveShadow = true; g.add(body);
    var felt = new THREE.MeshStandardMaterial({ color: 0x5c1420, roughness: 1, side: THREE.DoubleSide });
    var lining = new THREE.Mesh(new THREE.LatheGeometry(V([[0, -1.42], [1.24, -1.42], [1.32, -1.34], [1.58, 1.52]]), 40), felt); g.add(lining);
    var lip = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.11, 12, 56), new THREE.MeshPhysicalMaterial({ map: lt, color: 0xd9b9a0, roughness: 0.5, clearcoat: 0.3 })); lip.rotation.x = Math.PI / 2; lip.position.y = 1.55; lip.castShadow = true; g.add(lip);
    var brass = new THREE.MeshPhysicalMaterial({ color: 0xe8be55, metalness: 0.85, roughness: 0.3, clearcoat: 0.3 });
    [[1.36, 1.69, 0.035], [-1.25, 1.39, 0.04]].forEach(function (b) { var r = new THREE.Mesh(new THREE.TorusGeometry(b[1], b[2], 8, 56), brass); r.rotation.x = Math.PI / 2; r.position.y = b[0]; g.add(r); });
    var mc = document.createElement('canvas'); mc.width = mc.height = 128; var mg = mc.getContext('2d');
    var mgr = mg.createRadialGradient(48, 44, 6, 64, 64, 64); mgr.addColorStop(0, '#fff2bf'); mgr.addColorStop(0.6, '#e8be55'); mgr.addColorStop(1, '#a77a1e'); mg.fillStyle = mgr; mg.beginPath(); mg.arc(64, 64, 62, 0, 6.283); mg.fill();
    mg.strokeStyle = 'rgba(90,60,10,.6)'; mg.lineWidth = 4; mg.beginPath(); mg.arc(64, 64, 52, 0, 6.283); mg.stroke();
    mg.fillStyle = '#5c3c00'; mg.fillRect(36, 44, 56, 13); mg.fillRect(36, 71, 56, 13); mg.fillStyle = 'rgba(255,255,255,.45)'; mg.fillRect(36, 57, 56, 2); mg.fillRect(36, 84, 56, 2);
    var mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
    var med = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshStandardMaterial({ map: mt, metalness: 0.7, roughness: 0.35, transparent: true, alphaTest: 0.5 }));
    med.position.set(0, 0.25, 1.6); med.rotation.x = -0.12; g.add(med);
    g.visible = false; scene.add(g);
    return g;
  })();
  function buildWorld() {
    world = new CANNON.World(); world.gravity.set(0, -32, 0); world.broadphase = new CANNON.NaiveBroadphase(); world.solver.iterations = 12; world.allowSleep = true;
    var dm = new CANNON.Material('dice'), fm = new CANNON.Material('floor');
    world.addContactMaterial(new CANNON.ContactMaterial(dm, fm, { friction: 0.28, restitution: 0.38 }));
    world.addContactMaterial(new CANNON.ContactMaterial(dm, dm, { friction: 0.12, restitution: 0.3 }));
    world.diceMat = dm; world.floorMat = fm;
    var ground = new CANNON.Body({ mass: 0, material: fm }); ground.addShape(new CANNON.Plane()); ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); world.addBody(ground);
    setWalls(world);
  }
  // the four rim walls of the current layout (inner faces exactly on the felt's edge), 10 units high
  function setWalls(w, refit) {
    if (!w || !layout) return;
    (w.walls || []).forEach(function (b) { w.removeBody(b); });
    var W = layout.W, D = layout.D; w.walls = [];
    [[0, -D / 2 - 0.5, W + 2, 1], [0, D / 2 + 0.5, W + 2, 1], [-W / 2 - 0.5, 0, 1, D + 2], [W / 2 + 0.5, 0, 1, D + 2]].forEach(function (b) {
      var wall = new CANNON.Body({ mass: 0, material: w.floorMat }); wall.addShape(new CANNON.Box(new CANNON.Vec3(b[2] / 2, 5, b[3] / 2))); wall.position.set(b[0], 5, b[1]); w.addBody(wall); w.walls.push(wall);
    });
    if (refit) w.bodies.forEach(function (b) { if (b.mass > 0) { b.position.x = clampIn(b.position.x, W); b.position.z = clampIn(b.position.z, D); b.wakeUp(); } });
  }
  function clampIn(v, size) { var h = size / 2 - 0.6; return v < -h ? -h : v > h ? h : v; }
  api.pour = function (cubes, done) {
    if (!layout) { done(cubes.map(function (c) { return c.s; })); return; }
    if (tumble) endTumble(); // a reroll still in the air lands at once
    if (builtTier >= 0 && tierOf(qual) !== builtTier && !document.hidden) buildTable(); // the level changed (dropped): a venue and crowd built for it
    ensureCubes(); if (!world) buildWorld();
    // CRAFT: the cubes still on the table from the last shake sweep back into the cup first (nearest first, each on a
    // little arc), then the cup tips as before. The pour's own timeline simply starts that much later (pour.lag).
    var gather = [], gat = new THREE.Vector3(layout.W / 2 - (layoutName === 'tall' ? 1.5 : 2.6), 7.7, layoutName === 'tall' ? -3 : -1.5);
    if (!document.hidden && host && current === 'game') meshes.forEach(function (m) { if (m.visible && ctx.held !== m.userData.id) gather.push({ m: m, p0: m.position.clone(), q0: m.quaternion.clone(), s0: m.scale.x, qs: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28)), d: m.position.distanceTo(gat) }); });
    gather.sort(function (a, b) { return a.d - b.d; });
    var gEnd = 0; gather.forEach(function (o, i) { o.delay = i * Math.min(0.022, 0.5 / gather.length); o.dur = 0.42 + o.d * 0.012; gEnd = Math.max(gEnd, o.delay + o.dur); });
    hops = []; nopes = []; glows.forEach(function (o) { o.m.material.emissive.setHex(o.base); }); glows = [];
    meshes.forEach(function (m) { if (!gather.some(function (o) { return o.m === m; })) m.visible = false; m.userData.tpos = null; m.userData.zone = null; m.userData.lock.visible = false; tint(m, 0xffffff, 0); });
    cubes.forEach(function (c) { d20Role(meshes[c.id], c.color); kindRole(meshes[c.id], c.color); }); // BONUS: the bonus cubes' roles this shake (ONSETS: kindRole)
    twistPour(); // BONUS: the Twist deck for this shake (its drawn card goes back on the deck)
    anims = []; parenSprites.forEach(function (sp) { sp.visible = false; }); vlab.clear(); vplan = null; // (VARI3D)
    Object.keys(zonePlanes).forEach(function (z) { setGlow(z, 0, true); });
    var W = layout.W, D = layout.D, side = layoutName === 'tall';
    var ids = cubes.map(function (c) { return c.id; }).filter(function (i) { return !!meshes[i]; }); // (BONUS: the cubes in play, not every mesh)
    pour = { t0: performance.now(), bodies: [], spawned: 0, order: shuffle(ids), n: ids.length, done: done, settledAt: 0, sim: 0,
      from: new THREE.Vector3(W / 2 + 5, 8, side ? -3 : -1.5), at: new THREE.Vector3(W / 2 - (side ? 1.5 : 2.6), 6.2, side ? -3 : -1.5),
      gather: gather, lag: gather.length ? Math.max(0, 0.3 + gEnd - 0.45) : 0 }; // (CRAFT: the sweep)
    cup.visible = true; cup.position.copy(pour.from); cup.rotation.set(0, 0, 0);
    Snd.cupRattle();
    camSnap(); if (orbit) orbit.reset(); pour.cupPos = cup.position; // a new shake: back to the seat (a half-second ease)
    if (document.hidden) { pour.fast = true; finishPourFast(); return; }
    startLoop();
  };
  function spawnDie(i) {
    var m = meshes[i], mouth = new THREE.Vector3(0, 1.5, 0).applyMatrix4(cup.matrixWorld);
    var b = new CANNON.Body({ mass: 1, material: world.diceMat }); b.addShape(isD20(m) ? d20Shape(1) : new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5))); // (BONUS: an icosahedron)
    b.position.set(mouth.x + (Math.random() - 0.5) * 0.9, Math.max(1.2, mouth.y + (Math.random() - 0.5) * 0.6), mouth.z + (Math.random() - 0.5) * 1.2);
    // never outside the rim (the walls only keep in what starts inside)
    b.position.x = Math.max(-layout.W / 2 + 1, Math.min(layout.W / 2 - 1, b.position.x)); b.position.z = Math.max(-layout.D / 2 + 1, Math.min(layout.D / 2 - 1, b.position.z));
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
      if (v > 6.5 && e.body && e.body.material === world.diceMat && n - lastSpark > 45) { lastSpark = n; var c = e.contact; spawnSparks(c.bi.position.x + c.ri.x, c.bi.position.y + c.ri.y, c.bi.position.z + c.ri.z, Math.min(1, v / 12)); }
    });
    world.addBody(b); pour.bodies[i] = b; m.visible = true; m.scale.setScalar(1);
  }
  function pourBodies() { return pour.bodies.filter(function (b) { return !!b; }); }
  function meshOfBody(b) { return meshes[pour.bodies.indexOf(b)]; }
  function syncBodies() {
    var ip = !!slow;
    pour.bodies.forEach(function (b, i) {
      if (!b) return; var p = ip ? b.interpolatedPosition : b.position, q = ip ? b.interpolatedQuaternion : b.quaternion;
      meshes[i].position.set(p.x, p.y, p.z); meshes[i].quaternion.set(q.x, q.y, q.z, q.w);
    });
  }
  // the face of a cube that points most nearly up (index into FACES / Eq.CUBE_FACES[color]) and how well (1 = flat)
  function upFace(q, m) {
    var best = 0, by = -9, NS = isD20(m) ? d20Geo.userData.N : NORMALS; // (BONUS: a d20 has 20 faces)
    for (var k = 0; k < NS.length; k++) { var y = upTmp.copy(NS[k]).applyQuaternion(q).y; if (y > by) { by = y; best = k; } }
    return { k: best, up: by };
  }
  var upTmp = new THREE.Vector3(), yawQ = new THREE.Quaternion(), YAXIS = new THREE.Vector3(0, 1, 0);
  // Safety net: a cube outside the felt (or under it, or stuck high up) is put back flat on the felt, inside the rim,
  // showing face k, before anything reads the result. Returns true if it was moved. (A cube left leaning on another
  // one stays as it is: the result is its most nearly upright face, and the slot tween lays it flat a moment later.)
  function settleInside(m, q, k) {
    var W = layout.W, D = layout.D, s = m.scale.x, p = m.position, inX = Math.abs(p.x) <= W / 2 - 0.45 * s, inZ = Math.abs(p.z) <= D / 2 - 0.45 * s;
    if (inX && inZ && p.y > 0.2 * s && p.y < 3) return false;
    p.set(clampIn(p.x, W), restY(m) * s, clampIn(p.z, D));
    yawQ.setFromAxisAngle(YAXIS, Math.random() * 6.283); m.quaternion.copy(yawQ).multiply(restQ(m, k)); // (BONUS: restY / restQ)
    return true;
  }
  function finishPour() {
    var fixed = 0, raw = [];
    var results = pour.bodies.map(function (b, i) {
      var q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), best = upFace(q, meshes[i]).k;
      raw.push([+b.position.x.toFixed(2), +b.position.y.toFixed(2), +b.position.z.toFixed(2), +upFace(q, meshes[i]).up.toFixed(3)]);
      world.removeBody(b);
      meshes[i].position.set(b.position.x, b.position.y, b.position.z); meshes[i].quaternion.copy(q);
      if (settleInside(meshes[i], q, best)) fixed++;
      meshes[i].userData.fromPour = true;
      return Eq.CUBE_FACES[meshes[i].userData.color][best];
    });
    api._lastPour = { fixed: fixed, raw: raw, W: layout.W, D: layout.D, at: meshes.map(function (m) { return [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)]; }) }; // checks / debugging
    cup.visible = false; slow = null;
    var done = pour.done; pour = null; dirty = true;
    done(results);
  }
  // CRAFT: the sweep: each cube rises on an arc, turns over and drops into the cup's mouth, a little smaller as it goes in
  var gMouth = new THREE.Vector3(), gLastTick = 0;
  function stepGather(tc) {
    gMouth.set(0, 1.5, 0).applyMatrix4(cup.matrixWorld);
    pour.gather = pour.gather.filter(function (o) {
      var k = (tc - 0.3 - o.delay) / o.dur, m = o.m;
      if (k <= 0) return true;
      if (k >= 1) { m.visible = false; var n = performance.now(); if (n - gLastTick > 55) { gLastTick = n; try { Snd.diceHit(0.16); } catch (e) {} } return false; }
      var ek = k * k * (3 - 2 * k);
      m.position.lerpVectors(o.p0, gMouth, ek); m.position.y += 2.4 * Math.sin(Math.PI * ek) * (1 - 0.35 * ek);
      m.quaternion.copy(o.q0).slerp(o.qs, ek); m.scale.setScalar(o.s0 * (1 - 0.42 * ek));
      return true;
    });
  }
  function finishPourFast() {
    if (pour.gather) { pour.gather.forEach(function (o) { o.m.visible = false; }); pour.gather = []; }
    cup.position.copy(pour.at); cup.rotation.z = 2.0; cup.updateMatrixWorld();
    pour.order.forEach(spawnDie);
    for (var k = 0; k < 600; k++) world.step(1 / 60);
    syncBodies(); finishPour();
  }
  function tickPour(now, dt) {
    // the pour runs on its own clock that never jumps: after a long frame (the stadium loading) the cup would otherwise
    // already be on its way out and the cubes would fall beside the table
    pour.clock = (pour.clock || 0) + Math.min(Math.max(dt, 0), 0.05);
    var tc = pour.clock, t = tc - (pour.lag || 0), e = function (x) { return x < 0 ? 0 : x > 1 ? 1 : (1 - Math.cos(x * Math.PI)) / 2; }; // (CRAFT: tc = the cup coming in; t = the rest, after the sweep)
    if (tc < 0.55) cup.position.lerpVectors(pour.from, pour.at, e(tc / 0.55)); else if (t <= 1.45) cup.position.copy(pour.at);
    cup.rotation.z = 2.05 * e((t - 0.5) / 0.4) * (1 - e((t - 1.45) / 0.45));
    if (t > 1.45) cup.position.lerpVectors(pour.at, pour.from, e((t - 1.45) / 0.6));
    if (t > 2.1) cup.visible = false;
    cup.updateMatrixWorld();
    if (pour.gather && pour.gather.length) stepGather(tc);
    if (t > 0.72) { var want = Math.min(pour.n, Math.floor((t - 0.72) * 55) + 1); while (pour.spawned < want) spawnDie(pour.order[pour.spawned++]); } // (BONUS: pour.n = the cubes in play)
    if (pour.spawned) {
      var ts = slowScale(now); world.step(1 / 60, dt * ts, 5); pour.sim += dt * ts; syncBodies();
      if (!pour.slowDone && pour.spawned === pour.n && !pour.settledAt && !document.hidden && qual >= 1) {
        var moving = pourBodies().filter(function (b) { return b.sleepState !== CANNON.Body.SLEEPING && b.velocity.length() > 0.3; });
        if (moving.length === 1) { var sp1 = moving[0].velocity.length(); if (sp1 < 5) { pour.slowDone = true; if (sp1 > 0.6) { slow = { t0: now, dur: 430 }; } } }
      }
    }
    if (pour.spawned === pour.n && !pour.settledAt) {
      var asleep = pourBodies().every(function (b) { return b.sleepState === CANNON.Body.SLEEPING || b.velocity.length() < 0.08; }), nud = pour.nudges || 0;
      if (asleep || pour.sim > (pour.cap || 5.5) || t > 9 + 1.1 * nud) {
        // a cube left leaning on another one, or lying on top of one, gets a small nudge so it tips over flat (twice at most)
        var lean = nud < 2 ? pourBodies().filter(function (b) { return b.position.y > 0.8 || upFace(tq1.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), meshOfBody(b)).up < 0.96; }) : [];
        if (lean.length) {
          lean.forEach(function (b) {
            var a = Math.random() * 6.283; b.wakeUp();
            b.velocity.set(Math.cos(a) * 1.6, 3 + Math.random(), Math.sin(a) * 1.6); b.angularVelocity.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 9);
          });
          pour.nudges = nud + 1; pour.cap = pour.sim + 1.1;
        } else pour.settledAt = now;
      }
    }
    if (pour.settledAt && now - pour.settledAt > 650) finishPour();
  }

  // ----- Rolling some cubes again where they lie (T3.reroll) -----
  // list: [{ id, s }] (the face each cube must end up showing). Those cubes hop up, tumble with the dice physics and land
  // in or near their place showing s; the other cubes are solid but never move. The motion is simulated in full first
  // (about a second), then the result is relabelled: a cube is the same from every side, so turning each frame's
  // orientation by one fixed cube symmetry gives an equally real tumble that ends on face s. Then it plays back on a
  // clock that cannot jump. done() fires exactly once: at once when 3D is off or hidden, else when the cubes are down
  // (or after a 2.5 s safety timeout). The game then re-syncs, which slides each cube into its slot.
  var tumble = null;
  api.reroll = function (list, done) {
    var once = false, fin = function () { if (once) return; once = true; if (typeof done === 'function') done(); };
    list = (list || []).filter(function (e) { return e && meshes[e.id] && meshes[e.id].visible; });
    // BONUS: a twenty-sided die hops straight up and lands on its new face (the cube tumble below relabels cube symmetries)
    var dl = list.filter(function (e) { return isD20(meshes[e.id]); }); list = list.filter(function (e) { return !isD20(meshes[e.id]); });
    if (dl.length && layout && host && !document.hidden) {
      dl.forEach(function (e) { var m = meshes[e.id], k = facesOf(m).indexOf(e.s); if (k < 0) k = 0; m.userData.tpos = null; tweenTo(m, new THREE.Vector3(m.position.x, restY(m) * m.scale.x, m.position.z), new THREE.Quaternion().setFromAxisAngle(YAXIS, m.userData.jit + 2.4).multiply(restQ(m, k)), m.scale.x, { dur: 760, arc: 2.4, land: true }); });
      try { if (!list.length && Snd.clatter) Snd.clatter(); } catch (e) {}
      if (!list.length) { setTimeout(fin, 800); dirty = true; startLoop(); return true; }
    }
    if (!list.length || !layout || !host || document.hidden || current !== 'game' || pour || !document.body.contains(renderer.domElement)) { fin(); return false; }
    if (tumble) endTumble();
    try { tumble = simTumble(list); } catch (e) { tumble = null; }
    if (!tumble) { fin(); return false; }
    tumble.done = fin;
    tumble.timer = setTimeout(function () { if (tumble && tumble.done === fin) endTumble(); else fin(); }, 2500);
    try { if (Snd.clatter) Snd.clatter(); } catch (e) {}
    dirty = true; startLoop();
    return true;
  };
  api.rerolling = function () { return !!tumble; };
  function simTumble(list) {
    var w = new CANNON.World(); w.gravity.set(0, -32, 0); w.broadphase = new CANNON.NaiveBroadphase(); w.solver.iterations = 10; w.allowSleep = true;
    var dm = new CANNON.Material('dice'), fm = new CANNON.Material('floor');
    w.addContactMaterial(new CANNON.ContactMaterial(dm, fm, { friction: 0.4, restitution: 0.22 }));
    w.addContactMaterial(new CANNON.ContactMaterial(dm, dm, { friction: 0.15, restitution: 0.25 }));
    w.floorMat = fm;
    var ground = new CANNON.Body({ mass: 0, material: fm }); ground.addShape(new CANNON.Plane()); ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); w.addBody(ground);
    setWalls(w);
    var ids = {}; list.forEach(function (e) { ids[e.id] = e.s; });
    // the other cubes: solid, never moving (their slots are not disturbed)
    meshes.forEach(function (m, i) {
      if (!m.visible || ids[i] !== undefined || ctx.held === i || (dragS && dragS.on && dragS.id === i)) return;
      var hs = restY(m) * m.scale.x, b = new CANNON.Body({ mass: 0, material: dm }); b.addShape(new CANNON.Box(new CANNON.Vec3(hs, hs, hs))); // (BONUS: a d20 is a solid box of its size here)
      b.position.set(m.position.x, m.position.y, m.position.z); b.quaternion.set(m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w); w.addBody(b);
    });
    var T = { cubes: [], frames: 0, clock: 0, hits: [], hi: 0 };
    list.forEach(function (e) {
      var m = meshes[e.id], s = m.scale.x, hs = 0.5 * s;
      anims = anims.filter(function (a) { return a.m !== m; }); dropSquash(m);
      var b = new CANNON.Body({ mass: 1, material: dm }); b.addShape(new CANNON.Box(new CANNON.Vec3(hs, hs, hs)));
      b.position.set(clampIn(m.position.x, layout.W), Math.max(m.position.y, hs) + 0.05, clampIn(m.position.z, layout.D));
      b.quaternion.set(m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w);
      // straight up and down (it lands back on its own spot, not on a neighbour), spinning hard
      var a = Math.random() * 6.283, h = 0.1 + Math.random() * 0.3, sx = Math.random() < 0.5 ? -1 : 1, sz = Math.random() < 0.5 ? -1 : 1;
      b.velocity.set(Math.cos(a) * h, 7.6 + Math.random() * 1.2, Math.sin(a) * h);
      b.angularVelocity.set(sx * (14 + Math.random() * 10), (Math.random() - 0.5) * 8, sz * (14 + Math.random() * 10));
      b.linearDamping = 0.12; b.angularDamping = 0.12; b.allowSleep = true; b.sleepSpeedLimit = 0.25; b.sleepTimeLimit = 0.2;
      var c = { id: e.id, s: e.s, m: m, b: b, pos: [], q: [], R: null, home: m.position.clone() };
      b.addEventListener('collide', function (ev) { var v = Math.abs(ev.contact.getImpactVelocityAlongNormal()); if (v > 1.2) T.hits.push([T.frames, Math.min(1, v / 11)]); });
      w.addBody(b); T.cubes.push(c);
    });
    // simulate up to 1.2 s at 60 Hz (or until everything has settled), recording every step
    var q = new THREE.Quaternion();
    for (var f = 0; f < 72; f++) {
      w.step(1 / 60); T.frames = f + 1;
      var still = true;
      T.cubes.forEach(function (c) {
        var b = c.b; c.pos.push(b.position.x, b.position.y, b.position.z); c.q.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        if (b.sleepState !== CANNON.Body.SLEEPING && (b.velocity.length() > 0.08 || b.angularVelocity.length() > 0.15)) still = false;
      });
      if (still && f > 24) break;
    }
    // relabel: R turns the face physics left on top (k) into the wanted face (s): q_shown = q_physics * R, R = FACEQ[k]^-1 * FACEQ[s]
    T.cubes.forEach(function (c) {
      var n = T.frames - 1; q.set(c.q[n * 4], c.q[n * 4 + 1], c.q[n * 4 + 2], c.q[n * 4 + 3]);
      var k = upFace(q).k, ks = Eq.CUBE_FACES[c.m.userData.color].indexOf(c.s); if (ks < 0) ks = k;
      c.R = FACEQ[k].clone().invert().multiply(FACEQ[ks]);
      c.m.userData.tpos = null; c.m.userData.lock.visible = false;
    });
    T.ids = ids;
    return T;
  }
  var tq1 = new THREE.Quaternion();
  function poseTumble(T, f) {
    f = Math.max(0, Math.min(T.frames - 1, f));
    T.cubes.forEach(function (c) {
      c.m.position.set(c.pos[f * 3], c.pos[f * 3 + 1], c.pos[f * 3 + 2]);
      tq1.set(c.q[f * 4], c.q[f * 4 + 1], c.q[f * 4 + 2], c.q[f * 4 + 3]); c.m.quaternion.copy(tq1).multiply(c.R);
    });
  }
  function tickTumble(dt) {
    var T = tumble;
    T.clock += Math.min(Math.max(dt, 0), 0.05);
    var f = Math.floor(T.clock * 60);
    while (T.hi < T.hits.length && T.hits[T.hi][0] <= f) { var hv = T.hits[T.hi++]; if (hv[0] >= f - 2) { try { Snd.diceHit(hv[1]); } catch (e) {} } }
    poseTumble(T, f);
    if (f >= T.frames - 1) endTumble();
  }
  // land now (the last recorded frame), make sure every tossed cube is flat inside the felt, then done()
  function endTumble() {
    var T = tumble; if (!T) return;
    tumble = null; clearTimeout(T.timer);
    poseTumble(T, T.frames - 1);
    T.cubes.forEach(function (c) {
      var ks = Eq.CUBE_FACES[c.m.userData.color].indexOf(c.s);
      settleInside(c.m, c.m.quaternion, ks >= 0 ? ks : upFace(c.m.quaternion).k);
      c.m.userData.tpos = null; spawnPuff(c.m.position.x, c.m.position.z, c.m.scale.x * 0.8, 0.5);
    });
    dirty = true;
    if (T.done) T.done();
  }

  // ----- Animation loop -----
  var looping = false, wd = null;
  function renderNow() {
    // soft contact shadow under every visible cube (follows drags and lifts too)
    for (var i = 0; i < meshes.length; i++) {
      var m = meshes[i], bl = blobs[i]; if (!bl) continue;
      if (!m.visible) { bl.visible = false; continue; }
      var sc0 = m.scale.x, h = Math.max(0, m.position.y - 0.5 * sc0), size = sc0 * (1.7 - Math.min(h, 1.6) * 0.3); // (CRAFT: lifted, its shadow draws in and fades)
      bl.visible = true; bl.position.set(m.position.x, 0.012, m.position.z); bl.scale.set(size, size, 1); bl.material.opacity = 0.34 / (1 + h * 0.9);
    }
    if (post && post.on) post.render(); else renderer.render(scene, camera);
    dirty = false; amb = false;
    // listeners that follow things on screen (speech bubbles): after every drawn frame, told whether the camera moved
    if (viewFns.length) {
      var me = camera.matrixWorld.elements, moved = false;
      for (var j = 0; j < 16; j++) if (me[j] !== lastCamM[j]) { moved = true; lastCamM[j] = me[j]; }
      viewFns.slice().forEach(function (f) { try { f(moved); } catch (e) {} });
    }
  }
  var viewFns = [], lastCamM = new Float32Array(16);
  // Idle rendering. At rest the creature still breathes and blinks and the kid blinks; their per-frame hooks ask for a
  // redraw for that. When nothing else needs drawing (no cube, camera, effect or crowd moving, nobody gesturing, talking
  // or reaching), those "ambient" redraws are drawn at most AMB_FPS times a second instead of every frame.
  // ctx.ambient(): a module can ask for such a low-rate redraw directly (instead of ctx.dirty()).
  var amb = false, ambLast = 0, AMB_MS = 1000 / 12, talkUntil = 0;
  function hooksQuiet(now) {
    try {
      if (now < talkUntil) return false;
      if (api.creatureStage && api.creatureStage() >= 0) return false;
      var cs = api.creatureStats ? api.creatureStats() : null;
      if (cs && (cs.gesture || cs.pose > 0.002 || Math.abs(cs.offX) > 0.002 || Math.abs(cs.offZ) > 0.002)) return false;
      if (api.playerMoving && api.playerMoving()) return false;
      var ps = api.playerState ? api.playerState() : null;
      if (ps && (ps.mood || (ps.mate && ps.mate.mood))) return false;
      return true;
    } catch (e) { return false; }
  }
  // the creature's mouth moves while it talks: no low-rate drawing then (T3.creatureTalk is wrapped once, lazily)
  function watchTalk() {
    var f = api.creatureTalk; if (!f || f.__t3wrap) return;
    var w = function (ms) { talkUntil = ms > 0 ? performance.now() + ms + 400 : 0; return f.apply(this, arguments); };
    w.__t3wrap = true; api.creatureTalk = w;
  }
  function startLoop() {
    if (looping) return; looping = true; lastFrame = performance.now();
    requestAnimationFrame(frame);
    if (!wd) wd = setInterval(function () { if (looping && performance.now() - lastFrame > 150) frame(performance.now(), true); }, 100);
  }
  function frame(now, fromWatchdog) {
    if (!looping) return;
    now = now || performance.now();
    var dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    if (pour) { if (document.hidden) { pour.fast = true; finishPourFast(); } else tickPour(now, dt); dirty = true; }
    if (tumble) { if (document.hidden) endTumble(); else tickTumble(dt); dirty = true; }
    if (anims.length) {
      anims = anims.filter(function (a) {
        var k = Math.min(1, (now - a.t0) / a.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        if (a.tidy) { var k1 = k - 1; e = 1 + 1.9 * k1 * k1 * k1 + 0.9 * k1 * k1; } // CRAFT: sliding into a tidy slot: eases out with a hair of overshoot, then still
        // lin (a toss): the cube already moves as it leaves the hand, so it flies at an even pace along a parabola
        a.m.position.lerpVectors(a.p0, a.p1, a.lin ? k : e); a.m.position.y += a.lin ? 4 * k * (1 - k) * a.arc : Math.sin(k * Math.PI) * a.arc;
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
    if (orbit && orbit.step(now)) { applyCam(); dirty = true; }
    if (shots && shots.step(now)) { applyCam(); dirty = true; }
    if (orbitUI) orbitUI.update(orbit.away(), !!layout && current === 'game');
    if (shake) {
      var sk = (now - shake.t0) / shake.dur;
      if (sk >= 1) { shake = null; shx = shy = 0; } else { var se = Math.exp(-sk * 3.5) * shake.amp; shx = Math.sin(sk * 38) * se; shy = Math.cos(sk * 47) * se * 0.6; }
      applyCam(); dirty = true;
    }
    if (envFx && envFx.step(now)) dirty = true;
    if (stepPlinth(now)) dirty = true; // CRAFT
    if (stepCraft(now)) dirty = true;  // CRAFT: rings, hops, the solution glow, the "no" wobble
    if (fx3 && fx3.step(now, dt)) dirty = true;
    stepSparks(now, dt);
    var zk = 1 - Math.exp(-dt * 13);
    Object.keys(zonePlanes).forEach(function (z) {
      var zp = zonePlanes[z], tgt = zoneGlow[z] || 0, d = tgt - zp.material.opacity;
      if (d === 0) return;
      if (Math.abs(d) < 0.01) zp.material.opacity = tgt; else zp.material.opacity += d * zk;
      zp.visible = zp.material.opacity > 0.004; dirty = true;
    });
    var busy = dirty;
    watchTalk();
    hooks.frame.forEach(function (f) { f(now); });
    if (vplan || ctx.held != null) { var vh = ctx.held != null && vplan && api.lastG && api.lastG.phase === 'goal' ? vplan[ctx.held] || 0 : 0; heldTurn(vh ? meshes[ctx.held] : null, vh, now); } // VARI3D: a Goal cube turns in the hand
    // only the per-frame hooks asked for this frame, and nobody is doing anything: an ambient (low-rate) redraw
    if (dirty && !busy && hooksQuiet(now)) { dirty = false; amb = true; }
    if (!dirty && amb && now - ambLast >= AMB_MS) dirty = true;
    if (dirty) ambLast = now;
    var rendered = false;
    if (dirty && host && document.body.contains(renderer.domElement) && current === 'game') { vlab.frame(!!pour || !!tumble || ctx.held != null || !!(dragS && dragS.on) || !!(api.replayActive && api.replayActive()), function (m) { return anims.some(function (a) { return a.m === m; }); }); renderNow(); rendered = true; } // (VARI3D labels)
    if (Q) Q.sample(now, rendered, fromWatchdog);
    if (current !== 'game' && !pour) { looping = false; return; }
    if (!fromWatchdog) requestAnimationFrame(frame);
  }
  api.kick = function () { dirty = true; startLoop(); };
  // VARI3D: T3.goalPlan(tokens) before a Goal is carried in cube by cube (js/game.js humanGoal / aiSetGoal): each turned
  // cube turns in the hand on the way, so it lands already turned. null forgets it (a new shake forgets it too).
  api.goalPlan = function (tokens) {
    vplan = null; var G = api.lastG;
    if (!tokens || !G || !G.vari) return;
    variRow(tokens, G.fractions).forEach(function (v, i) { if (v.turn && typeof tokens[i] === 'object') (vplan = vplan || {})[tokens[i].id] = v.turn; });
  };
  // T3.project(v) -> { x, y, visible, behind }: where a world point (THREE.Vector3 or {x,y,z}) is on the page right now
  // (client pixels, as drawn), whether it is inside the picture, and whether it is behind the camera. null without a picture.
  var projV = new THREE.Vector3();
  api.project = function (p) {
    if (!host || !layout || !p) return null;
    camera.updateMatrixWorld(); projV.set(p.x, p.y, p.z).applyMatrix4(camera.matrixWorldInverse);
    var depth = -projV.z, behind = depth < 0.05; projV.applyMatrix4(camera.projectionMatrix);
    var r = renderer.domElement.getBoundingClientRect(), x = r.left + (projV.x + 1) / 2 * r.width, y = r.top + (1 - projV.y) / 2 * r.height;
    // ppu: screen pixels per world unit at that depth (for offsets that scale with the zoom)
    var ppu = behind ? 0 : r.height / (2 * depth * Math.tan(camera.fov * Math.PI / 360));
    return { x: x, y: y, visible: !behind && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom, behind: behind, ppu: ppu, rect: r };
  };
  // T3.onView(fn) -> off(): fn(cameraMoved) after every drawn frame (the camera or something on screen changed).
  api.onView = function (fn) {
    if (typeof fn !== 'function') return function () {};
    viewFns.push(fn);
    return function () { var i = viewFns.indexOf(fn); if (i >= 0) viewFns.splice(i, 1); };
  };
  // T3.anchor('opp' | 'kid') -> a function returning that head's world position right now (or null when it is not at the
  // table). 'opp' holds on to the creature in use when it is called (another creature taking over later does not move it).
  api.anchor = function (who) {
    if (who === 'kid') {
      return function () {
        try { var md = api.playerModels && api.playerModels().me; if (!md || !md.root || !md.root.visible || !md.head) return null; return md.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6 * (md.root.scale.x || 1), 0)); } catch (e) { return null; }
      };
    }
    var actor = null; try { actor = api._creatureActor ? api._creatureActor() : null; } catch (e) {}
    if (!actor) return function () { var f = api.creatureFocus ? api.creatureFocus() : null; return f ? f.head : null; };
    return function () {
      try {
        if (!actor.root || !actor.root.visible || !actor.root.parent) return null;
        actor.root.updateMatrixWorld(true);
        var h = actor.headC.clone(); if (actor.headObj) actor.headObj.getWorldPosition(h); else h.applyMatrix4(actor.body.matrixWorld);
        return h;
      } catch (e) { return null; }
    };
  };
  api._frame = function (now) { frame(now, true); }; // test hook: advance one frame with a given clock (used by headless checks)
  api._relayout = function () { chooseLayout(); if (api.lastG) api.sync(api.lastG, true); }; // test hook: what the ResizeObserver does (background tabs delay it)
  // ----- Taps and drags on the 3D table -----
  function pick(ev, objs) {
    var r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objs, false)[0] || null;
  }
  function zoneAt(ev) { var h = pick(ev, Object.keys(zonePlanes).map(function (k) { return zonePlanes[k]; })); return h ? h.object.userData.zone : null; }
  var dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.6), hitP = new THREE.Vector3();
  // Pointers. One finger / the mouse on a cube: tap or drag it, exactly as before. The mouse (or a pen) dragged on
  // anything that is not a cube swings the view around the table (js/three/orbit.js); a press without moving is
  // still a tap on a zone. On touch screens one finger never moves the view: two fingers do (drag to swing, pinch
  // to zoom), and a second finger landing during a cube drag puts that cube back. The mouse wheel zooms.
  var ptrs = {}, nPtr = 0, pinch = null, multi = false;
  function canvasSize() { var r = renderer.domElement.getBoundingClientRect(); return { w: r.width || 1, h: r.height || 1 }; }
  function twoTouches() { var out = []; Object.keys(ptrs).forEach(function (k) { if (ptrs[k].touch && out.length < 2) out.push(ptrs[k]); }); return out.length === 2 ? out : null; }
  function pinchInfo(t) { return { cx: (t[0].x + t[1].x) / 2, cy: (t[0].y + t[1].y) / 2, d: Math.max(20, Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y)) }; }
  function cancelCubeDrag() { var d = dragS; dragS = null; if (d && d.on && api.handlers.drop) api.handlers.drop(d.id, null); }
  function dropPtr(ev) {
    if (!ptrs[ev.pointerId]) return false;
    delete ptrs[ev.pointerId]; nPtr = Math.max(0, nPtr - 1);
    if (pinch && !twoTouches()) { pinch = null; if (orbit) orbit.end(); }
    var wasMulti = multi; if (!nPtr) multi = false;
    return wasMulti;
  }
  renderer.domElement.addEventListener('pointerdown', function (ev) {
    var touch = ev.pointerType === 'touch';
    if (!ptrs[ev.pointerId]) nPtr++;
    ptrs[ev.pointerId] = { x: ev.clientX, y: ev.clientY, touch: touch };
    if (touch && nPtr >= 2) {
      // a second finger: this is a look-around gesture, never a tap or a cube drag
      multi = true; cancelCubeDrag();
      var t = twoTouches();
      if (t && !pinch && !pour && !(shots && shots.active()) && orbit && orbit.begin()) { pinch = pinchInfo(t); pinch.at = aimAt(pinch.cx, pinch.cy); cueG = null; endShake(); }
      dirty = true; startLoop(); return;
    }
    if (multi) return; // a finger left over from a two-finger gesture
    if (pour) return;
    // a tap during a close-up only skips it (the camera eases home quickly); it doesn't pick a cube seen from the close-up
    if (shots && shots.active()) { shots.skip(); dragS = null; dirty = true; startLoop(); return; }
    cueG = null; endShake(); // a touch ends any camera cue; picking always uses the camera as drawn, so taps stay accurate while it eases home
    // the right (or middle) button, or shift + drag, slides the view (pan) instead; a shift-press without moving is still a tap
    var panBtn = !touch && (ev.button === 2 || ev.button === 1 || (ev.button === 0 && ev.shiftKey));
    var h = ev.button === 0 ? pick(ev, meshes.filter(function (m) { return m.visible && !(tumble && tumble.ids[m.userData.id] !== undefined); })) : null;
    dragS = { x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, id: h ? h.object.userData.id : null, on: false };
    if (panBtn) { if (ev.button !== 0) dragS.id = null; if (orbitOk()) { dragS.look = true; dragS.pan = true; try { renderer.domElement.setPointerCapture(ev.pointerId); } catch (e) {} } }
    else if (dragS.id != null && api.handlers.canDrag && api.handlers.canDrag(dragS.id)) { dragS.can = true; renderer.domElement.setPointerCapture(ev.pointerId); }
    else if (dragS.id == null && !touch && ev.button === 0 && orbitOk()) { dragS.look = true; try { renderer.domElement.setPointerCapture(ev.pointerId); } catch (e) {} }
  });
  renderer.domElement.addEventListener('contextmenu', function (ev) { if (layout && current === 'game') ev.preventDefault(); }); // the right button pans
  renderer.domElement.addEventListener('pointermove', function (ev) {
    var p = ptrs[ev.pointerId]; if (p) { p.x = ev.clientX; p.y = ev.clientY; }
    if (pinch) {
      var t = twoTouches(); if (!t) return;
      var q = pinchInfo(t), sz = canvasSize();
      orbit.rotate((q.cx - pinch.cx) / sz.w, (q.cy - pinch.cy) / sz.h); orbit.zoomBy(pinch.d / q.d, pinch.at); // zooms toward where the fingers are
      q.at = pinch.at; pinch = q; return;
    }
    if (multi || !dragS) return;
    if (dragS.look) {
      if (!dragS.orb && Math.hypot(ev.clientX - dragS.x, ev.clientY - dragS.y) > 6) { if (!orbit.begin()) { dragS.look = false; return; } dragS.orb = true; dragS.lx = dragS.x; dragS.ly = dragS.y; }
      if (dragS.orb) {
        var s2 = canvasSize(), fx = (ev.clientX - dragS.lx) / s2.w, fy = (ev.clientY - dragS.ly) / s2.h;
        if (dragS.pan) orbit.panBy(fx, fy, s2.w / s2.h, camera.fov * Math.PI / 180); else orbit.rotate(fx, fy);
        dragS.lx = ev.clientX; dragS.ly = ev.clientY;
      }
      return;
    }
    if (!dragS.can) return;
    if (!dragS.on && Math.hypot(ev.clientX - dragS.x, ev.clientY - dragS.y) > 8) { dragS.on = true; Snd.pickup(); if (api.handlers.dragStart) api.handlers.dragStart(dragS.id); }
    if (dragS.on) {
      pick(ev, []); if (ray.ray.intersectPlane(dragPlane, hitP)) { var m = meshes[dragS.id]; anims = anims.filter(function (a) { return a.m !== m; }); m.position.copy(hitP); m.userData.tpos = null; }
      var z = zoneAt(ev), tz = api.handlers.targetZones ? api.handlers.targetZones() : [];
      Object.keys(zonePlanes).forEach(function (k) { setGlow(k, tz.indexOf(k) >= 0 ? (k === z ? 0.85 : 0.3) : 0); });
      dirty = true; startLoop();
    }
  });
  renderer.domElement.addEventListener('pointerup', function (ev) {
    if (dropPtr(ev)) { dragS = null; return; } // the end of a two-finger gesture: no tap
    var d = dragS; dragS = null; if (!d) return;
    if (d.orb) { orbit.end(); return; }
    if (d.pan && ev.button !== 0) return; // a right / middle click is never a tap
    // CRAFT: a cube that cannot go to the zone it was dropped on (or tapped toward) gives one small "no" wobble
    var tzs = api.handlers.targetZones ? api.handlers.targetZones() : [], playZ = ['required', 'permitted', 'forbidden'];
    function refused(z) { return z && playZ.indexOf(z) >= 0 && tzs.length > 0 && tzs.indexOf(z) < 0; }
    if (d.on) { var z = zoneAt(ev); if (api.handlers.drop) api.handlers.drop(d.id, z); if (refused(z)) nope(meshes[d.id]); return; }
    if (d.id != null) { if (api.handlers.cubeTap) api.handlers.cubeTap(d.id); return; }
    var zz = zoneAt(ev), selId = api.lastG ? api.lastG.selected : null; if (zz && api.handlers.zoneTap) api.handlers.zoneTap(zz);
    if (selId != null && refused(zz)) nope(meshes[selId]);
    // ---- COLLECT (spot the fan) block: a plain tap (no drag, no cube, no zone) is offered to ctx.hooks.tap ----
    // fn(ray, info): ray = a copy of the world-space THREE.Ray under the pointer; info = { x, y, w, h, camera }
    if (!zz && hooks.tap.length && ev.button === 0) {
      pick(ev, []); var tr = ray.ray.clone(), cr = renderer.domElement.getBoundingClientRect();
      var tinfo = { x: ev.clientX - cr.left, y: ev.clientY - cr.top, w: cr.width, h: cr.height, camera: camera };
      hooks.tap.forEach(function (f) { try { f(tr, tinfo); } catch (e) {} });
    }
    // ---- end COLLECT block ----
  });
  renderer.domElement.addEventListener('pointercancel', function (ev) {
    dropPtr(ev);
    if (dragS && dragS.orb) orbit.end();
    cancelCubeDrag();
  });
  renderer.domElement.addEventListener('wheel', function (ev) {
    if (!layout || current !== 'game') return;
    ev.preventDefault(); // never scroll or zoom the page from over the picture
    if (pour || dragS || pinch || (shots && shots.active()) || !orbitOk()) return;
    var dy = ev.deltaY * (ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 400 : 1);
    dy = Math.max(-120, Math.min(120, dy)); // one notch, however the device reports it
    var f = Math.exp(dy * (ev.ctrlKey ? 0.006 : 0.0016)); // ctrlKey: a trackpad pinch
    orbit.zoomBy(f, f < 1 ? aimAt(ev.clientX, ev.clientY) : null); // in: toward the mouse; out: back toward the table
  }, { passive: false });
  // iPad Safari's own pinch gesture events: keep them from zooming the page
  ['gesturestart', 'gesturechange'].forEach(function (n) { renderer.domElement.addEventListener(n, function (e) { e.preventDefault(); }); });

  // Screen position of a cube (for effects like bursts)
  api.screenPos = function (id) {
    var m = meshes[id]; if (!m || !host) return null;
    var v = m.position.clone().project(camera), r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  };
  api.isPouring = function () { return !!pour; };
  // ---- BONUS: the Twist deck (house rule, js/bonus.js). A deck of teal cards on a small stand just outside the right-hand
  // rim, near the player's end: clear of the felt (no cube lands on it), the zones, the cup's path, the creature behind the
  // far side and the kid at the near centre. On top: the deck (near) and a marked spot for the drawn card (far).
  // twistDeck(on): show / hide it; the next pour keeps it only if asked (a pour nobody asked about, like online play's,
  // hides it), and puts last shake's card back on the deck. twistDraw(info, reveal): the top card lifts and flips, glides
  // up in front of the camera so its face can be read, then settles face up on its spot (about 1.9 s, once; a tap skips
  // to the end). reveal() runs once, as the face turns to the camera (at once without a picture). At rest nothing moves.
  // info = Bonus.cardInfo(): { icon, name, line, card } (card: a variation card). ----
  var TW = { on: false, next: false, g: null, top: null, front: null, frontTex: null, anim: null, lay: '' }, CW = 0.95, CH = 1.33, TWH = 0.55;
  var twV = new THREE.Vector3(), twQ = new THREE.Quaternion(), twFwd = new THREE.Vector3();
  var TWQDOWN = new THREE.Quaternion().setFromAxisAngle(YAXIS, Math.PI).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  var TWQUP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), TWFLIP = new THREE.Vector3(0, 0, 1);
  function twCanvas(w, h) { var cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
  function twTex(cv) { var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; }
  function twWrap(g, text, maxW) { var out = [], line = ''; String(text).split(' ').forEach(function (w) { var t = line ? line + ' ' + w : w; if (line && g.measureText(t).width > maxW) { out.push(line); line = w; } else line = t; }); if (line) out.push(line); return out; }
  var TWFONT = '"Trebuchet MS", "Segoe UI", sans-serif', TWEMO = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  // the back of every card: teal, a woven diamond pattern, a gold frame, a swirl and TWIST (640 x 896, rounded corners)
  function twBackTex() {
    var cv = twCanvas(640, 896), g = cv.getContext('2d');
    rr(g, 0, 0, 640, 896, 56); g.save(); g.clip();
    var bg = g.createLinearGradient(0, 0, 640, 896); bg.addColorStop(0, '#20c997'); bg.addColorStop(0.55, '#0c8599'); bg.addColorStop(1, '#0b5563'); g.fillStyle = bg; g.fillRect(0, 0, 640, 896);
    g.strokeStyle = 'rgba(255,255,255,.13)'; g.lineWidth = 6;
    for (var i = -896; i < 896 + 640; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 896, 896); g.stroke(); g.beginPath(); g.moveTo(i, 896); g.lineTo(i + 896, 0); g.stroke(); }
    g.restore();
    g.strokeStyle = '#fff'; g.lineWidth = 14; rr(g, 26, 26, 588, 844, 38); g.stroke();
    g.strokeStyle = '#fcc419'; g.lineWidth = 7; rr(g, 46, 46, 548, 804, 28); g.stroke();
    // the swirl: one spiral line, gold on a dark disc
    g.fillStyle = 'rgba(8,50,60,.55)'; g.beginPath(); g.arc(320, 400, 190, 0, 6.283); g.fill();
    g.strokeStyle = '#ffe066'; g.lineWidth = 16; g.lineCap = 'round'; g.beginPath();
    for (var a = 0; a <= 4.2 * Math.PI; a += 0.08) { var r = 12 + a * 12.5, x = 320 + Math.cos(a) * r, y = 400 + Math.sin(a) * r; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.font = '900 120px ' + TWFONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 18; g.strokeStyle = '#0b4a55'; g.strokeText('TWIST', 320, 700); g.fillStyle = '#fff'; g.fillText('TWIST', 320, 700);
    return twTex(cv);
  }
  // the face of one card: a big icon, the name, one short line (a variation card or a bonus twist, marked at the bottom)
  function twFrontTex(info) {
    var cv = twCanvas(640, 896), g = cv.getContext('2d'), gold = !info.card;
    rr(g, 0, 0, 640, 896, 56); g.fillStyle = '#fffaf0'; g.fill();
    g.strokeStyle = '#0c8599'; g.lineWidth = 22; rr(g, 22, 22, 596, 852, 40); g.stroke();
    g.fillStyle = '#0c8599'; rr(g, 22, 22, 596, 96, 40); g.fill(); g.fillRect(22, 80, 596, 38);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.font = '900 50px ' + TWFONT; g.fillText('TWIST', 320, 72);
    var halo = g.createRadialGradient(320, 300, 20, 320, 300, 170); halo.addColorStop(0, gold ? 'rgba(255,212,59,.55)' : 'rgba(99,230,190,.5)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo; g.fillRect(120, 120, 400, 360);
    g.font = '200px ' + TWEMO; g.fillStyle = '#1d2340'; g.fillText(info.icon || '🌀', 320, 305);
    g.font = '900 68px ' + TWFONT; var nl = twWrap(g, info.name, 540); if (nl.length > 2) { g.font = '900 54px ' + TWFONT; nl = twWrap(g, info.name, 540); }
    var y = 520 - (nl.length - 1) * 36; g.fillStyle = '#1d2340';
    nl.forEach(function (l) { g.fillText(l, 320, y); y += 72; });
    g.font = '700 44px ' + TWFONT; g.fillStyle = '#343a40'; y += 4;
    twWrap(g, info.line || '', 530).slice(0, 3).forEach(function (l) { g.fillText(l, 320, y); y += 54; });
    g.fillStyle = gold ? '#fcc419' : '#c3fae8'; rr(g, 150, 776, 340, 56, 28); g.fill();
    g.fillStyle = gold ? '#5c3c00' : '#0b7285'; g.font = '900 32px ' + TWFONT; g.fillText(gold ? 'BONUS TWIST' : 'VARIATION CARD', 320, 805);
    return twTex(cv);
  }
  function twPlateTex() { // the stand's top: dark teal felt, a gold frame, the deck's place and the card's dashed spot
    var cv = twCanvas(300, 740), g = cv.getContext('2d');
    g.fillStyle = '#0b4f5a'; g.fillRect(0, 0, 300, 740);
    g.strokeStyle = '#fcc419'; g.lineWidth = 8; rr(g, 10, 10, 280, 720, 26); g.stroke();
    g.setLineDash([16, 12]); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 6; rr(g, 52, 70, 196, 272, 22); g.stroke(); g.setLineDash([]);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '900 120px ' + TWFONT; g.fillText('?', 150, 210);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; rr(g, 52, 398, 196, 272, 22); g.stroke();
    return twTex(cv);
  }
  function twSignTex() { // the stand's front: TWIST
    var cv = twCanvas(600, 220), g = cv.getContext('2d');
    var bg = g.createLinearGradient(0, 0, 0, 220); bg.addColorStop(0, '#12b886'); bg.addColorStop(1, '#0b7285'); g.fillStyle = bg; g.fillRect(0, 0, 600, 220);
    g.strokeStyle = '#fcc419'; g.lineWidth = 10; g.strokeRect(5, 5, 590, 210);
    g.font = '900 150px ' + TWFONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 16; g.strokeStyle = '#08414a'; g.strokeText('TWIST', 300, 118); g.fillStyle = '#fff'; g.fillText('TWIST', 300, 118);
    return twTex(cv);
  }
  function twShape() { var s = new THREE.Shape(); rrp(s, -CW / 2, -CH / 2, CW, CH, 0.08); return s; }
  function twFace(mat) { // a flat rounded card face whose UVs cover the whole texture
    var geo = new THREE.ShapeGeometry(twShape(), 4), p = geo.attributes.position, uv = geo.attributes.uv;
    for (var i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + CW / 2) / CW, (p.getY(i) + CH / 2) / CH);
    return new THREE.Mesh(geo, mat);
  }
  function twLit(map, k) { return new THREE.MeshStandardMaterial({ map: map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: k, roughness: 0.55, transparent: false }); }
  function twBuild() {
    if (TW.g) return;
    var g = new THREE.Group(), backTex = twBackTex(), backMat = twLit(backTex, 0.18), edgeMat = new THREE.MeshStandardMaterial({ color: 0xf8f9fa, roughness: 0.6 });
    var lacq = new THREE.MeshPhysicalMaterial({ color: 0x0b7285, roughness: 0.35, clearcoat: 0.6 }), goldM = new THREE.MeshPhysicalMaterial({ color: 0xfcc419, metalness: 0.8, roughness: 0.3 });
    var block = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 3.7), lacq); block.position.y = TWH - 0.25; block.castShadow = true; block.receiveShadow = true; g.add(block);
    var plate = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 3.66), new THREE.MeshStandardMaterial({ map: twPlateTex(), roughness: 0.9 })); plate.rotation.x = -Math.PI / 2; plate.position.y = TWH + 0.002; plate.receiveShadow = true; g.add(plate);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.46), new THREE.MeshStandardMaterial({ map: twSignTex(), emissiveMap: null, roughness: 0.5 })); sign.position.set(0, TWH - 0.25, 1.852); g.add(sign);
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, TWH - 0.5 - FLOOR_Y, 16), lacq); stem.position.y = (TWH - 0.5 + FLOOR_Y) / 2; stem.castShadow = true; g.add(stem);
    var foot = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.16, 24), goldM); foot.position.y = FLOOR_Y + 0.08; g.add(foot);
    // the deck: a stack of card edges, the back of the next card on top, and the top card (the one that is drawn)
    var slab = new THREE.ExtrudeGeometry(twShape(), { depth: 0.022, bevelEnabled: false, curveSegments: 4 });
    for (var i = 0; i < 6; i++) { var c = new THREE.Mesh(slab, i % 2 ? edgeMat : new THREE.MeshStandardMaterial({ color: 0xdee2e6, roughness: 0.6 })); c.rotation.x = -Math.PI / 2; c.position.set(0, TWH + 0.003 + i * 0.024, 0.85); c.castShadow = true; g.add(c); }
    var under = twFace(backMat); under.rotation.x = -Math.PI / 2; under.position.set(0, TWH + 0.15, 0.85); g.add(under);
    var top = new THREE.Group(), edge = new THREE.Mesh(new THREE.ExtrudeGeometry(twShape(), { depth: 0.014, bevelEnabled: false, curveSegments: 4 }), edgeMat); edge.position.z = -0.007; top.add(edge);
    var back = twFace(backMat); back.rotation.y = Math.PI; back.position.z = -0.009; top.add(back);
    TW.front = twFace(twLit(null, 0.32)); TW.front.position.z = 0.009; top.add(TW.front);
    top.traverse(function (o) { o.castShadow = true; });
    g.add(top); TW.top = top; TW.g = g; g.visible = false; scene.add(g);
  }
  function twBase() { return new THREE.Vector3(layout.W / 2 + 1.75, 0, layout.D / 2 - 2.2); }
  function twDeckPose(p, q) { p.set(0, TWH + 0.168, 0.85); q.copy(TWQDOWN); }
  function twRestPose(p, q) { p.set(0, TWH + 0.012, -0.85); q.copy(twQ.setFromAxisAngle(YAXIS, 0.06)).multiply(TWQUP); }
  function twPlace() { if (!TW.g || !layout) return; TW.g.position.copy(twBase()); TW.g.updateMatrixWorld(true); TW.lay = layoutName; dirty = true; }
  function twToDeck() { if (!TW.top) return; TW.anim = null; twDeckPose(TW.top.position, TW.top.quaternion); dirty = true; }
  function twToRest() { if (!TW.top) return; twRestPose(TW.top.position, TW.top.quaternion); dirty = true; }
  function twShow(on) { if (on) twBuild(); if (TW.g) { TW.g.visible = !!on; twPlace(); } }
  function twistPour() { TW.on = TW.next; TW.next = false; twShow(TW.on); twToDeck(); }
  // one clean motion: lift + flip (0-0.35 s), glide up to the camera (to 0.85 s), hold (to 1.45 s), settle (to 1.9 s)
  var TWT = [0.35, 0.85, 1.45, 1.9];
  function twFinish() { var a = TW.anim; if (!a) return; TW.anim = null; twToRest(); if (a.reveal) { var r = a.reveal; a.reveal = null; r(); } try { if (Snd.thunk) Snd.thunk(); } catch (e) {} }
  function twShowPose(p, q) { // in front of the camera as it is now, facing it, about 45% of the picture's height (local to the stand)
    var th = 2 * Math.tan(camera.fov * Math.PI / 360), d = Math.max(CH / (0.46 * th), CW / (0.62 * th * camera.aspect), 1.2);
    camera.getWorldDirection(twFwd); p.copy(camera.position).addScaledVector(twFwd, d); TW.g.worldToLocal(p);
    q.copy(TW.g.quaternion).invert().multiply(camera.quaternion);
  }
  var twA = { p0: new THREE.Vector3(), q0: new THREE.Quaternion(), p1: new THREE.Vector3(), q1: new THREE.Quaternion(), ps: new THREE.Vector3(), qs: new THREE.Quaternion() };
  function twStep(now) {
    var a = TW.anim, t = (now - a.t0) / 1000, s = function (x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }, m = TW.top;
    if (t >= TWT[3]) { twFinish(); return; }
    twDeckPose(twA.p0, twA.q0); twA.p1.copy(twA.p0); twA.p1.y += 0.9;
    twA.q1.setFromAxisAngle(TWFLIP, Math.PI).multiply(twA.q0); // turned over about the axis pointing at the player
    if (t < TWT[0]) { var k = s(t / TWT[0]); m.position.lerpVectors(twA.p0, twA.p1, k); m.quaternion.setFromAxisAngle(TWFLIP, Math.PI * k).multiply(twA.q0); return; }
    twShowPose(twA.ps, twA.qs);
    if (t < TWT[1]) { var k2 = s((t - TWT[0]) / (TWT[1] - TWT[0])); m.position.lerpVectors(twA.p1, twA.ps, k2); m.quaternion.copy(twA.q1).slerp(twA.qs, k2); if (k2 > 0.7 && a.reveal) { var r = a.reveal; a.reveal = null; r(); } return; }
    if (a.reveal) { var r2 = a.reveal; a.reveal = null; r2(); }
    if (t < TWT[2]) { m.position.copy(twA.ps); m.quaternion.copy(twA.qs); return; }
    var k3 = s((t - TWT[2]) / (TWT[3] - TWT[2])); twRestPose(twA.p0, twA.q0);
    m.position.lerpVectors(twA.ps, twA.p0, k3); m.position.y += Math.sin(k3 * Math.PI) * 0.4; m.quaternion.copy(twA.qs).slerp(twA.q0, k3);
  }
  hooks.frame.push(function (now) {
    if (TW.g && TW.g.visible && TW.lay !== layoutName) twPlace();
    if (TW.anim) { twStep(now); dirty = true; talkUntil = Math.max(talkUntil, now + 40); } // (drawn at full rate, not as a low-rate ambient redraw)
  });
  // a tap anywhere on the picture during the draw skips straight to the card lying face up (and is not a tap on the table)
  renderer.domElement.addEventListener('pointerdown', function (ev) { if (!TW.anim) return; ev.stopImmediatePropagation(); twFinish(); dirty = true; startLoop(); }, true);
  api.twistDeck = function (on) { TW.next = !!on; if (!on) { TW.on = false; twShow(false); } else { TW.on = true; twShow(true); twToDeck(); } dirty = true; };
  api.twistDraw = function (info, reveal) {
    var once = false, fin = function () { if (once) return; once = true; if (typeof reveal === 'function') reveal(); };
    if (!TW.on || !layout) { fin(); return; }
    twBuild();
    if (TW.frontTex) TW.frontTex.dispose();
    TW.frontTex = twFrontTex(info || {}); TW.front.material.map = TW.frontTex; TW.front.material.emissiveMap = TW.frontTex; TW.front.material.needsUpdate = true;
    if (!host || document.hidden || current !== 'game') { twToRest(); fin(); return; }
    twToDeck(); TW.anim = { t0: performance.now(), reveal: fin };
    try { if (Snd.pickup) Snd.pickup(); } catch (e) {}
    dirty = true; startLoop();
  };
  api.twistDrawing = function () { return !!TW.anim; };
  api._twistFace = function (info) { return twFrontTex(info).image; }; // test hook: one card face as a canvas
  // Text for the stadium scoreboard (e.g. 'GOAL 24'); a no-op in the other themes. Remembered across theme changes.
  api.setBoard = function (text) {
    boardText = text == null ? '' : String(text);
    if (envFx) { envFx.setBoard(boardText); dirty = true; startLoop(); }
  };
  // One-shot effects: 'confetti' | 'flash' | 'wave' | 'shake' | 'spotlight' ({zone:'goal'} or {cube:id}). Safe no-ops when unavailable.
  api.fx = function (name, opts) {
    try {
      if (!layout || !host || document.hidden || current !== 'game') return false;
      var ok = false;
      if (name === 'confetti') ok = !!(fx3 && fx3.confetti(opts));
      else if (name === 'spotlight') ok = !!(fx3 && fx3.spotlight(opts));
      else if (name === 'flash') ok = !!(envFx && envFx.flash());
      else if (name === 'wave') ok = !!(envFx && envFx.wave());
      else if (name === 'shake') {
        // CRAFT: Now! / Impossible!: one shock ring across the cloth (yellow for Now!, rose for Impossible!) and the cubes
        // hop a hair as it passes; the camera nudge is smaller than before and left out with "Reduce flashing"
        var gch = (typeof G !== 'undefined' && G && G.ch) || (api.lastG && api.lastG.ch), imp = gch && gch.kind !== 'now';
        if (!pour) { shockwave(imp ? '#ffb3b3' : '#ffe066'); ok = true; }
        if (!pour && !dragS && !calm()) { shake = { t0: performance.now(), dur: 300, amp: (opts && opts.amp) || 0.18 }; ok = true; }
      }
      if (ok) { dirty = true; startLoop(); }
      return ok;
    } catch (e) { return false; }
  };
  // Camera close-ups: 'challenge' | 'win' | 'lose' (the opponent) and 'goal' (the scoreboard, or the Goal row).
  // Returns true if it started. Off when S.set.shots === false; never during the pour or while a cube is held.
  // opts: { hold: seconds at the close framing, done: called when the camera is back }
  api.shot = function (name, opts) {
    try {
      if (!shots || (typeof S !== 'undefined' && S.set && S.set.shots === false)) return false;
      if (orbitBusy()) return false; // the player is looking around: no close-up yanks the view away
      var ok = shots.start(name, opts);
      if (ok) { cueG = null; dirty = true; startLoop(); }
      return ok;
    } catch (e) { return false; }
  };
  api.shotActive = function () { return !!(shots && shots.active()); };
  // Quality: T3.quality() -> 'high' | 'medium' | 'low' (what is in use now); T3.setQuality('auto' | 'low' | 'high')
  api.quality = function () { return Q ? Q.name() : 'high'; };
  api.qualityInfo = function () { return Q ? Object.assign(Q.stats(), { glow: !!(post && post.on), shadows: !!shadowKey, pixelRatio: renderer.getPixelRatio(), log: Q.log() }) : null; };
  api.setQuality = function (q) { if (!Q) return; if (q === 'auto') Q.forget(); Q.set(q); dirty = true; startLoop(); };
  // What other 3D modules may use
  Object.assign(ctx, {
    scene: scene, camera: camera, renderer: renderer, meshes: meshes, hooks: hooks, camBase: base, // camBase: the fitted seat view {pos, look}, without orbit or cue offsets
    dirty: function () { dirty = true; }, startLoop: startLoop,
    ambient: function () { amb = true; startLoop(); }, // a gentle redraw (breathing at rest): drawn at most ~12 times a second
    refit: function () { if (layout) { fitCamera(); if (post) post.tag(); dirty = true; } },
    dropAnims: function (m) { anims = anims.filter(function (a) { return a.m !== m; }); dropSquash(m); }
  });
  Object.defineProperty(ctx, 'layout', { get: function () { return layout; } });
  Object.defineProperty(ctx, 'layoutName', { get: function () { return layoutName; } });
  fx3 = createFx3d({ scene: scene, layout: function () { return layout; }, layoutName: function () { return layoutName; }, quality: function () { return qual; }, dim: setLightK,
    cubePos: function (id) { var m = meshes[id]; return m && m.visible ? m.position : null; }, dirty: function () { dirty = true; }, startLoop: startLoop });
  post = createPostFx(renderer, scene, camera);
  // what hides a glow behind it: the table itself, and whole characters (creature, kid) and the cup; not the cubes
  post.isOccluder = function (o) {
    if (o.userData.occ) return true;
    var top = o; while (top.parent && top.parent !== scene) top = top.parent;
    return top !== tableGroup && top !== camera && meshes.indexOf(top) < 0;
  };
  shots = createShots({
    camera: camera,
    base: function () { return layout ? base : null; },
    creature: creatureInfo,
    board: boardInfo,
    goalZone: function () { if (!layout) return null; var r = layout.z.goal; return { center: new THREE.Vector3(r[0] + r[2] / 2, 0.5, r[1] + r[3] / 2), w: r[2], d: r[3] }; },
    blocked: function () { return !layout || !host || !!pour || !!dragS || !!pinch || orbitBusy() || document.hidden || current !== 'game'; }
  });
  // ----- Looking around (orbit) and photos -----
  var orbitOn = true;
  function orbitOk() { return !!orbit && orbitOn && !(typeof S !== 'undefined' && S.set && S.set.orbit === false) && !!layout && !!host && current === 'game' && !pour; }
  function orbitBusy() { return !!orbit && (orbit.away() || orbit.dragging()); }
  orbit = createOrbit({
    allowed: orbitOk, changed: function () { applyCam(); dirty = true; startLoop(); },
    bounds: function () { return venueBox; }, floor: FLOOR_Y, clip: clipCam,
    table: function () { return layout ? { hw: layout.W / 2 + 0.7, hd: layout.D / 2 + 0.7, cz: 0 } : null; }
  });
  orbitUI = createOrbitUI({
    seat: function () { Snd.click(); orbit.reset(0.5); },
    photo: function () { api.photo(); }
  });
  // T3.orbit.active(): the view is away from the seat (or being moved). reset(): ease back (about 0.5 s).
  // enabled(bool): allow / forbid looking around (forbidding also eases back); enabled() reads it.
  // S.set.orbit === false switches it off from Settings.
  api.orbit = {
    active: function () { return orbitBusy(); },
    reset: function () { orbit.reset(0.5); dirty = true; startLoop(); },
    enabled: function (on) {
      if (arguments.length) { orbitOn = !!on; if (!orbitOn) { pinch = null; if (dragS && dragS.orb) dragS = null; orbit.reset(0.5); startLoop(); } }
      return orbitOn && !(typeof S !== 'undefined' && S.set && S.set.orbit === false);
    }
  };
  // T3.photo(): saves the 3D picture as it is right now (glow included) with a "Tata's Equations" strip at the bottom.
  // Renders one frame and copies the canvas in the same tick (the WebGL drawing buffer is not kept between frames).
  // Returns 'download' | 'share' | 'view' (iPad fallback pop-over) | '' when there is no 3D picture.
  api.photo = function () {
    try {
      if (!layout || !host || !document.body.contains(renderer.domElement)) return '';
      applyCam(); renderNow();
      var cv = photoCanvas(renderer.domElement); if (!cv) return '';
      dirty = true; startLoop();
      var how = savePhoto(cv);
      orbitUI.flash();
      try { Snd.click(); setTimeout(function () { Snd.click(); }, 85); } catch (e) {} // a soft "ka-chik"
      return how;
    } catch (e) { return ''; }
  };
  Q = createQuality(applyQuality);
  api.drawCubeFace = drawFace; // (g, color, symbol, skin) on a 128x128 canvas space: the title screen's cubes (js/three/title.js) use it
  api.ctx = ctx;
})();
