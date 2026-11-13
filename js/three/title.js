// The 3D title screen: a night stadium, the game's cubes spelling TATA'S EQUATIONS on a stage, the kid in his own kit,
// Pip and the creatures he has unlocked. Loaded as a module after table.js / player.js; it fills in window.Title3D.
//
// Renderer: the 3D table's own WebGLRenderer (T3.ctx.renderer). Its canvas is borrowed: moved into the fixed layer
// #t3title while the splash / title is up (T3.attach takes it back the next time the table is drawn). One WebGL context
// for the whole game, so nothing to leak; the renderer settings that are changed (size, pixel ratio, exposure) are put
// back when the title is left. The table never draws while current !== 'game', so the two never fight.
//
// Style rule (Tata's): the opening plays ONCE (about 6 s the first time in a session, about 1.5 s after that, any tap
// skips it), then the scene is a STILL picture behind the menu: no drift, no blinks, no one-offs; the render loop stops
// (SHOWPIECES: the old rest-time drift / blinks / waves were taken out; Title3D._oneOff still works for checks).
// The wordmark: the cube letters plus a knitted football scarf in his kit colours that unrolls once across the front of
// the stage. prefers-reduced-motion (unless S.set.titleFx === true), Reduce flashing (A11y.calm) or
// S.set.titleFx === false: one still frame.
//
//   Title3D.ok()                 the 3D title can run (WebGL, 3D switched on, the module built fine)
//   Title3D.show(mode, opts)     mode 'splash' | 'title'; opts.intro 'full' | 'short' | 'none'. Returns true if it shows.
//   Title3D.screen(id)           called by go(): any screen other than splash / intro / dedication / title stops it
//   Title3D.skip()               jump to the end of the opening (also: any pointerdown while it plays)
//   Title3D.stats()              debugging and checks: renders, draw calls, memory, state
//   Title3D.onIntroEnd           set by ui.js: called once the opening is over (or skipped)
import * as THREE from 'three';
import { buildStadium } from './stadium.js';
import { FLOOR_Y, softTexture, gradientBg } from './environment.js';
import { LEVELS } from './quality.js';
import { buildClassic } from './creatures/classic.js';
import { buildHuman, kitFromSave, KIT_DEFAULT, TATA_KIT, KID } from './creatures/kid.js';
import { TATA, TATA_LOOK } from './creatures/grownup.js';
import { roundedBox } from './creatures/common.js';

var T3 = window.T3;
(function () {
  if (!T3 || !T3.ctx || !T3.ctx.renderer) return;
  var ctx = T3.ctx, renderer = ctx.renderer, FY = FLOOR_Y, TAU = Math.PI * 2;
  var W0 = 18, D0 = 13.6;                                 // the table size the stadium is laid out for (wide layout)
  var C = 2.3, GAP = 0.1, STEP = C + GAP;                 // title cube size and spacing
  var STAGE = { w: 33, h: 4.2, d: 4.8, z: -4.6 }, TOPY = FY + STAGE.h;
  var KID_H = 5.1;                                        // the kid's height on screen (world units)
  var G = 32, E = 0.36;                                   // cube gravity and bounce
  var PITCH = -13;                                        // the resting camera looks down a little
  var FULL = { end: 5.8, cam: 4.6, pose: 4.0 }, SHORT = { end: 1.5, cam: 1.5 };

  // ---------------------------------------------------------------- small helpers
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function eio(x) { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function eout(x) { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function save() { return (typeof S !== 'undefined' && S) ? S : { set: {}, cos: {} }; }
  function reduced() { if (window.Title3D && Title3D._forceMotion) return false; try { var s0 = save(); if (s0.set && s0.set.titleFx === true) return false; } catch (e0) {}   // the owner asked for the show: the game's own switch decides
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function calmA11y() { try { return !!(window.A11y && A11y.calm && A11y.calm()); } catch (e) { return false; } }
  function fxOn() { var s = save(); return !(s.set && s.set.titleFx === false) && !reduced() && !calmA11y(); }
  function sfx() { return window.TitleSfx || null; }
  function qLevel() { var n = T3.quality ? T3.quality() : 'high'; for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].name === n) return i; return 2; }
  function cur() { return typeof current !== 'undefined' ? current : ''; }

  // ---------------------------------------------------------------- state
  var host = null, B = null;                 // B: the built scene (null until needed, null again after dispose)
  var mode = 'off', running = false, raf = 0, wakeT = 0, disposeT = 0, failed = false;
  var intro = null;                          // { kind, t0, end, fired: {}, skipped }
  var drift = null, rest = false, nextOneOff = 0, oneOffs = [], lastOne = '';
  var saved = null, dirty = true, stats = { renders: 0, builds: 0, disposes: 0, buildMs: 0, lastRender: 0, slowFrames: 0, frames: 0 };
  var camState = { yaw: 0, pitch: PITCH, dist: 1, lift: 0 }, fit = null, sizeKey = '', bubbleKey = '';
  var shownSplash = false, lastFrameT = 0, frameGaps = [];
  var bday = { own: false, abort: null, taps: [] };   // BIRTHDAY: the easter egg (js/three/birthday.js) owns the scene while bday.own

  // ---------------------------------------------------------------- the cubes' faces (one atlas for every cube)
  var CUBECOL = { red: ['#ff6b6b', '#c92a2a'], blue: ['#4dabf7', '#1864ab'], green: ['#51cf66', '#2b8a3e'], black: ['#6c7078', '#16171a'] };
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function drawFaceFallback(g, color, s) {   // the classic skin, as on the table (used if table.js has no drawCubeFace)
    var c = CUBECOL[color], lg = g.createLinearGradient(0, 0, 128, 128); lg.addColorStop(0, c[0]); lg.addColorStop(1, c[1]);
    g.fillStyle = lg; g.fillRect(0, 0, 128, 128);
    var eg = g.createRadialGradient(54, 50, 40, 64, 64, 98); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,.28)'); g.fillStyle = eg; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,.16)'; rr(g, 12, 10, 104, 28, 14); g.fill();
    var label = (window.Eq && Eq.SHOW[s]) || s;
    g.font = '900 80px "Trebuchet MS", "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillText(label, 65.5, 69.5); g.strokeStyle = 'rgba(0,0,0,.38)'; g.lineWidth = 5; g.strokeText(label, 64, 66); g.fillStyle = '#fff'; g.fillText(label, 64, 66);
  }
  function drawLetter(g, color, ch, skin) {
    // the same face as a game cube, with the letter in the logo's display font on top of a cleared centre
    if (T3.drawCubeFace) T3.drawCubeFace(g, color, ' ', skin); else drawFaceFallback(g, color, ' ');
    var gold = skin === 'gold', ink = gold ? '#5c3c00' : '#fff';
    g.font = '400 ' + (ch === "'" ? 120 : 96) + 'px "Lilita One", "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    var y = ch === "'" ? 80 : 70;
    g.fillStyle = gold ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.42)'; g.fillText(ch, 66, y + 4);
    g.strokeStyle = gold ? 'rgba(255,255,255,.6)' : 'rgba(11,23,48,.7)'; g.lineWidth = 8; g.strokeText(ch, 64, y);
    g.fillStyle = ink; g.fillText(ch, 64, y);
  }
  function buildAtlas(list, res) {
    // list: [{ key, color, s, letter }] -> one canvas texture, cell lookup by key
    var cols = 8, rows = Math.ceil(list.length / cols), cv = document.createElement('canvas'); cv.width = cols * res; cv.height = rows * res;
    var g = cv.getContext('2d'), cells = {}, skin = (save().cos && save().cos.skin) || 'classic';
    list.forEach(function (it, k) {
      var cx = k % cols, cy = Math.floor(k / cols);
      g.save(); g.translate(cx * res, cy * res); g.beginPath(); g.rect(0, 0, res, res); g.clip(); g.scale(res / 128, res / 128);
      try { if (it.letter) drawLetter(g, it.color, it.s, skin); else if (T3.drawCubeFace) T3.drawCubeFace(g, it.color, it.s, skin); else drawFaceFallback(g, it.color, it.s); } catch (e) { drawFaceFallback(g, it.color, it.s); }
      g.restore();
      cells[it.key] = { cx: cx, cy: cy };
    });
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return { tex: t, cells: cells, cols: cols, rows: rows };
  }
  // a rounded cube whose six faces point at atlas cells (face order +x, -x, +y, -y, +z, -z), one draw call
  function cubeGeometry(size, atlas, faceKeys) {
    var g = roundedBox(size, size, size, size * 0.14, 5), uv = g.attributes.uv, idx = g.index, seen = {}, pad = 0.004;
    g.groups.forEach(function (gr) {
      var c = atlas.cells[faceKeys[gr.materialIndex]] || { cx: 0, cy: 0 };
      for (var j = gr.start; j < gr.start + gr.count; j++) {
        var v = idx.getX(j); if (seen[v]) continue; seen[v] = 1;
        var u0 = uv.getX(v), v0 = uv.getY(v);
        uv.setXY(v, (c.cx + pad + u0 * (1 - 2 * pad)) / atlas.cols, 1 - (c.cy + 1 - pad - v0 * (1 - 2 * pad)) / atlas.rows);
      }
    });
    g.clearGroups();
    return g;
  }

  // ---------------------------------------------------------------- characters
  function neutralP() {
    return { breath: 0, breathAmp: 1, lean: -0.04, hop: 0, slide: 0, turn: 0, sway: 0, headYaw: 0, headPitch: -0.04, headRoll: 0, eyeX: 0, eyeY: 0.1, eyeAddX: 0, eyeAddY: 0,
      lid: 0.95, blink: 0, lidAsym: 0, browRaise: 0.15, browTilt: 0, browAsym: 0, smile: 0.7, open: 0, shrug: 0, happyAmt: 0.3, sadAmt: 0, dt: 0.016,
      rx: 0, ry: 0, rz: 0, rYaw: 0, rScale: 1, eyeWide: 0, pupil: 0, mouthW: 1, sweat: 0, sweatT: 0, gulp: 0, earL: 0, earR: 0, earUp: 0, hatTilt: 0, hatLift: 0, armRate: 9,
      gazeThink: 0, gazeSad: 0, gazeCam: 1, cry: 0, cryT: 0, steam: 0, steamT: 0, angry: 0, pitchAdd: 0, tailLift: 0, beardSway: 0, talk: 0, talkT: 0, task: 0 };
  }
  // who he is, exactly as the table builds him (T3.playerSpec from player.js); a copy of its rules as a fallback
  function kidSpec() {
    var s = save(), grown = s.set && s.set.me === 'tata', o = { who: grown ? 'tata' : 'kid', name: grown ? s.name : (s.backName != null ? s.backName : 'TYSON W.'), number: s.jersey || '7' }, sp = null;
    try { if (T3.playerSpec) sp = T3.playerSpec(o); } catch (e) { sp = null; }
    if (!sp) {
      if (grown) sp = { who: 'tata', dims: TATA, kit: kitFromSave(Object.assign({}, TATA_KIT)), num: String(o.number), name: String(s.name || ''), look: Object.assign({}, TATA_LOOK) };
      else { var sk = Object.assign({}, KIT_DEFAULT, s.kit || {}); sp = { who: 'kid', dims: KID, kit: kitFromSave(sk), num: String(o.number), name: String(o.name || ''), look: { hair: sk.hair || KIT_DEFAULT.hair, hairStyle: sk.hairStyle || 'swept' } }; }
    }
    sp = Object.assign({}, sp, { front: true });            // seen from the front here: his number on the chest too
    return sp;
  }
  function specKey(sp) { try { return JSON.stringify([sp.who, sp.kit, sp.num, sp.name, sp.look]); } catch (e) { return String(Math.random()); } }
  // Pip greets; up to two creatures he can already play (the newest two of the first league)
  function cast() {
    var list = [];
    try {
      for (var i = 0; i < 5 && typeof OPPONENTS !== 'undefined' && i < OPPONENTS.length; i++) if (typeof oppOpen !== 'function' || oppOpen(i)) list.push(OPPONENTS[i].kind || 'sloth');
    } catch (e) {}
    if (!list.length) list = ['sloth'];
    return list.slice(-2);
  }

  // ---------------------------------------------------------------- textures
  function streakTex() {
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 32; var g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 12, 256, 8); g.globalAlpha = 0.35; g.fillRect(0, 8, 256, 16);
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function trailTex() {
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 16; var g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.85, 'rgba(220,235,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 8); g.lineTo(250, 3); g.lineTo(256, 8); g.lineTo(250, 13); g.closePath(); g.fill();
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function ledTex() {
    var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 16; var g = cv.getContext('2d'), cols = ['#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b'];
    g.fillStyle = '#0a1230'; g.fillRect(0, 0, 1024, 16);
    for (var i = 0; i < 64; i++) { g.fillStyle = cols[i % 4]; g.beginPath(); g.arc(i * 16 + 8, 8, 5, 0, TAU); g.fill(); }
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // the scarf's knit: his shirt colour and trim in bands, a row of little cubes, the name in the middle, fringe at the ends
  function scarfTex() {
    var s0 = save(), kit = s0.kit || {}, a = kit.shirt || '#c9342c', b = kit.trim || '#2f8f7c', W = 2048, H = 128;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d'), FR = 70;
    g.clearRect(0, 0, W, H);
    g.fillStyle = a; g.fillRect(FR, 14, W - 2 * FR, H - 28);
    g.fillStyle = '#ffffff'; g.fillRect(FR, 22, W - 2 * FR, 8); g.fillRect(FR, H - 30, W - 2 * FR, 8);
    g.fillStyle = b; g.fillRect(FR, 30, W - 2 * FR, 6); g.fillRect(FR, H - 36, W - 2 * FR, 6);
    for (var k = 0; k < 8; k++) { var x0 = FR + k * 40; g.fillStyle = k % 2 ? '#ffffff' : b; g.fillRect(x0, 14, 40, H - 28); g.fillRect(W - x0 - 40, 14, 40, H - 28); }   // end blocks
    var cols = ['#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b'];
    for (var c = 0; c < 2; c++) for (var j = 0; j < 9; j++) { var cx = (c ? W - FR - 330 - 300 : FR + 330) + j * 34; g.fillStyle = cols[j % 4]; g.fillRect(cx, H / 2 - 12, 24, 24); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(cx + 3, H / 2 - 9, 18, 5); }
    g.font = '400 58px "Lilita One", "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeText("TATA'S EQUATIONS", W / 2, H / 2 + 3); g.fillStyle = '#ffffff'; g.fillText("TATA'S EQUATIONS", W / 2, H / 2 + 3);
    // knit: faint vertical stitches
    g.globalAlpha = 0.12; g.fillStyle = '#000'; for (var x = FR; x < W - FR; x += 6) g.fillRect(x, 14, 2, H - 28); g.globalAlpha = 1;
    // fringe
    g.strokeStyle = a; g.lineWidth = 6; g.lineCap = 'round';
    for (var f = 0; f < 9; f++) { var y = 20 + f * (H - 40) / 8; g.beginPath(); g.moveTo(FR, y); g.lineTo(8, y + (f % 2 ? 4 : -4)); g.stroke(); g.beginPath(); g.moveTo(W - FR, y); g.lineTo(W - 8, y + (f % 2 ? -4 : 4)); g.stroke(); }
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
  }

  // ---------------------------------------------------------------- build the whole scene
  function build() {
    var t0 = performance.now(), qi = qLevel(), L = LEVELS[qi];
    var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1.5, 0.5, 400);
    var owned = { tex: [], geo: [], mat: [] };               // everything made here that is not inside the scene graph
    scene.background = gradientBg(['#0e2152', '#02040c']); owned.tex.push(scene.background);
    scene.fog = new THREE.Fog(0x050b22, 70, 170);
    scene.environment = ctx.scene.environment || null;      // the table's soft room reflections (owned by table.js: never disposed here)
    scene.environmentIntensity = 0.38;
    // lights: a cool floodlight key from the front left (the only one that casts shadows), a blue rim from behind, a warm fill
    var hemi = new THREE.HemisphereLight(0x9fb2e6, 0x10251a, 0.55); scene.add(hemi);
    var key = new THREE.DirectionalLight(0xf2f6ff, 2.5); key.position.set(-15, 24, 20); key.target.position.set(0, FY + 2, STAGE.z + 1); scene.add(key); scene.add(key.target);
    var rim = new THREE.DirectionalLight(0x8aa2ff, 1.1); rim.position.set(14, 12, -30); scene.add(rim);
    var fill = new THREE.DirectionalLight(0xffe2bd, 0.5); fill.position.set(10, 4, 30); scene.add(fill);
    var glint = new THREE.PointLight(0xffffff, 0, 16, 2); glint.position.set(-16, TOPY + C, STAGE.z + 3.2); scene.add(glint);
    var shadowsOn = L.shadow > 0;
    if (shadowsOn) {
      key.castShadow = true; var sc = key.shadow.camera; key.shadow.mapSize.set(Math.min(2048, L.shadow), Math.min(2048, L.shadow));
      sc.left = -16; sc.right = 16; sc.top = 14; sc.bottom = -10; sc.near = 5; sc.far = 80; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.04;
    }

    // the night stadium (crowd, floodlights, scoreboard), built for this quality tier; its crowd is never T3.crowd's
    var venue = buildStadium(W0, D0, Math.min(8, renderer.capabilities.getMaxAnisotropy()), 'wide', function () { return qi; }, { night: true, detached: true, pitchSize: qi >= 2 ? 2048 : 1024 });
    scene.add(venue.group);
    if (venue.key && venue.key.parent) venue.key.parent.remove(venue.key);   // its key light is aimed at the table; ours is aimed at the stage
    try { var nm = String(save().name || 'Champ').toUpperCase(); venue.setBoard(nm.length > 12 ? "LET'S PLAY!" : 'HI, ' + nm + '!'); } catch (e) {}
    var towers = [];
    venue.group.traverse(function (o) { if (o.isSprite && Math.abs(o.position.y - (FY + 16)) < 0.05) towers.push(o); });
    var streakT = streakTex(); owned.tex.push(streakT);
    var flares = towers.map(function (tw) {
      var a = new THREE.Sprite(new THREE.SpriteMaterial({ map: tw.material.map, color: 0xf3f7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      var b = new THREE.Sprite(new THREE.SpriteMaterial({ map: streakT, color: 0xdfe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      a.position.copy(tw.position); b.position.copy(tw.position); a.renderOrder = b.renderOrder = 5; a.visible = b.visible = false;
      scene.add(a); scene.add(b); return { a: a, b: b, base: tw.material.opacity };
    });

    // stars (static) and a pooled shooting star
    var starN = qi >= 1 ? 420 : 220, sp = new Float32Array(starN * 3);
    for (var i = 0; i < starN; i++) { var th = rnd(-1.4, 1.4), el = rnd(0.16, 0.9), r = 150; sp[i * 3] = Math.sin(th) * Math.cos(el) * r; sp[i * 3 + 1] = FY + Math.sin(el) * r * 0.75 + 12; sp[i * 3 + 2] = -Math.cos(th) * Math.cos(el) * r; }
    var starG = new THREE.BufferGeometry(); starG.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    var stars = new THREE.Points(starG, new THREE.PointsMaterial({ color: 0xdfe8ff, size: qi >= 2 ? 2.2 : 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
    stars.renderOrder = -1; scene.add(stars);
    var trailT = trailTex(); owned.tex.push(trailT);
    var shoot = new THREE.Sprite(new THREE.SpriteMaterial({ map: trailT, color: 0xeaf2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    shoot.visible = false; shoot.renderOrder = 0; scene.add(shoot);

    // the stage the title stands on
    var stageG = new THREE.Group(); scene.add(stageG);
    var stageM = new THREE.MeshStandardMaterial({ color: 0x18275c, roughness: 0.45, metalness: 0.25 });
    var stage = new THREE.Mesh(roundedBox(STAGE.w, STAGE.h, STAGE.d, 0.25, 3), stageM); stage.position.set(0, FY + STAGE.h / 2, STAGE.z); stage.receiveShadow = shadowsOn; stage.castShadow = shadowsOn; stageG.add(stage);
    var trimM = new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.3, metalness: 0.4, emissive: 0x4a3000 });
    var trim = new THREE.Mesh(new THREE.BoxGeometry(STAGE.w + 0.1, 0.22, 0.22), trimM); trim.position.set(0, TOPY - 0.08, STAGE.z + STAGE.d / 2 + 0.02); stageG.add(trim);
    var ledT = ledTex(); ledT.wrapS = THREE.RepeatWrapping; ledT.repeat.set(1.6, 1); owned.tex.push(ledT);
    var led = new THREE.Mesh(new THREE.PlaneGeometry(STAGE.w - 1.2, 0.42), new THREE.MeshBasicMaterial({ map: ledT, toneMapped: false })); led.position.set(0, FY + 0.75, STAGE.z + STAGE.d / 2 + 0.03); stageG.add(led);
    var glowT = softTexture(); owned.tex.push(glowT);
    var under = new THREE.Mesh(new THREE.PlaneGeometry(STAGE.w * 1.5, 13), new THREE.MeshBasicMaterial({ map: glowT, color: 0x5577ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    under.rotation.x = -Math.PI / 2; under.position.set(0, FY + 0.02, STAGE.z + 4.5); stageG.add(under);
    // the scarf: a knitted football scarf in his kit colours, hung in a gentle sag across the front of the stage
    var scarfT = scarfTex(); owned.tex.push(scarfT);
    var SW = STAGE.w - 3.2, SH = 1.25, sg = new THREE.PlaneGeometry(SW, SH, 48, 1), sp0 = sg.attributes.position;
    for (var si = 0; si < sp0.count; si++) { var sx = sp0.getX(si) / (SW / 2); sp0.setY(si, sp0.getY(si) - (1 - sx * sx) * 0.35); sp0.setZ(si, (1 - sx * sx) * 0.18); }
    sg.computeVertexNormals();
    var scarf = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: scarfT, transparent: true, alphaTest: 0.3, roughness: 0.95, side: THREE.DoubleSide }));
    scarf.position.set(0, TOPY - 1.05, STAGE.z + STAGE.d / 2 + 0.08); scarf.receiveShadow = shadowsOn; stageG.add(scarf);

    // ----- the cubes: TATA'S on top of EQUATIONS, plus three loose game cubes on the pitch -----
    var colors = ['red', 'blue', 'green', 'black'], ck = 0, faces = (window.Eq && Eq.CUBE_FACES) || { red: ['0', '1', '2', '3', '+', '-'], blue: ['0', '1', '2', '3', '+', '-'], green: ['0', '1', '2', '3', '+', '-'], black: ['0', '1', '2', '3', '+', '-'] };
    var defs = [], rows = [["TATA'S", 1], ['EQUATIONS', 0]];
    rows.forEach(function (rw) {
      var word = rw[0].split(''), n = word.length;
      word.forEach(function (ch, j) {
        var color = colors[ck++ % 4];
        defs.push({ ch: ch, color: color, row: rw[1], j: j, n: n, x: (j - (n - 1) / 2) * STEP, y: TOPY + C / 2 + rw[1] * C, z: STAGE.z, size: C });
      });
    });
    var loose = [{ s: '7', color: 'red', x: -10.6, z: 1.2, yaw: 0.35 }, { s: '+', color: 'blue', x: 9.4, z: 2.4, yaw: -0.5 }, { s: '3', color: 'green', x: 11.6, z: 0.9, yaw: 0.2 }];
    loose.forEach(function (l) { defs.push({ ch: l.s, color: l.color, loose: true, x: l.x, y: FY + 0.65, z: l.z, size: 1.3, yaw: l.yaw }); });
    var need = {}, list = [];
    function needCell(color, s, letter) { var k = color + '|' + s + (letter ? '|L' : ''); if (!need[k]) { need[k] = 1; list.push({ key: k, color: color, s: s, letter: letter }); } return k; }
    defs.forEach(function (d) {
      var f = faces[d.color] || faces.red, keys = [];
      for (var k = 0; k < 6; k++) keys.push(needCell(d.color, f[k % f.length], false));
      if (d.loose) { keys[4] = needCell(d.color, d.ch, false); keys[2] = needCell(d.color, f[(f.indexOf(d.ch) + 3) % f.length] || f[0], false); }
      else keys[4] = needCell(d.color, d.ch, true);
      d.keys = keys;
    });
    var atlas = buildAtlas(list, qi >= 2 ? 192 : 128); owned.tex.push(atlas.tex);
    var cubeM = new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.3, metalness: 0, envMapIntensity: 1.1 });
    var cubes = defs.map(function (d) {
      var m = new THREE.Mesh(cubeGeometry(d.size, atlas, d.keys), cubeM);
      m.castShadow = shadowsOn; m.receiveShadow = shadowsOn; m.position.set(d.x, d.y, d.z);
      if (d.loose) m.rotation.y = d.yaw;
      scene.add(m);
      return { m: m, d: d, rest: new THREE.Vector3(d.x, d.y, d.z), restQ: m.quaternion.clone(), anim: null, roll: null };
    });

    // ----- the kid -----
    var spec = kidSpec(), kid = makeKid(spec, shadowsOn); scene.add(kid.model.root);

    // ----- Pip on top of the title, the creatures on the ends of the EQUATIONS row -----
    var kinds = cast(), actors = [];
    var pip = makeActor('pip', 0, TOPY + 2 * C, STAGE.z + 0.1, 2.5, 0, shadowsOn); scene.add(pip.actor.root); actors.push(pip);
    var endX = 4 * STEP + C / 2 + 2.3;                      // on the stage, just beyond the ends of the EQUATIONS row
    kinds.forEach(function (k, i) {
      var side = kinds.length === 1 ? 1 : (i === 0 ? -1 : 1);
      var a = makeActor(k, side * endX, TOPY, STAGE.z + 0.4, 3.6, -side * 0.3, shadowsOn); scene.add(a.actor.root); actors.push(a);
    });

    // ----- confetti (instanced, pooled; pieces that reach the pitch lie there, still) -----
    var CN = qi >= 2 ? 240 : qi === 1 ? 150 : 70;
    var confG = new THREE.PlaneGeometry(0.26, 0.15), confM = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: true });
    var conf = new THREE.InstancedMesh(confG, confM, CN); conf.frustumCulled = false; conf.visible = false; conf.count = CN;
    var palette = ['#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b', '#ffffff', '#b197fc', '#ff922b'], tc = new THREE.Color(), zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
    for (var c2 = 0; c2 < CN; c2++) { conf.setColorAt(c2, tc.set(palette[c2 % palette.length])); conf.setMatrixAt(c2, zeroM); }
    scene.add(conf);

    // characters' world points the camera keeps in the picture
    var pts = [];
    cubes.forEach(function (c) { if (c.d.loose) pts.push(c.rest.clone().add(new THREE.Vector3(0, -0.65, 0.65))); });
    cubes.forEach(function (c) { if (!c.d.loose) { pts.push(c.rest.clone().add(new THREE.Vector3(-C / 2, C / 2, C / 2))); pts.push(c.rest.clone().add(new THREE.Vector3(C / 2, C / 2, C / 2))); } });
    actors.forEach(function (a) { pts.push(new THREE.Vector3(a.x, a.y + a.h + (a.kind === 'pip' ? 1.6 : 0.3), a.z)); pts.push(new THREE.Vector3(a.x + 1.4 * Math.sign(a.x || 1), a.y + a.h * 0.5, a.z)); });
    pts.push(new THREE.Vector3(kid.x, FY, kid.z + 0.8)); pts.push(new THREE.Vector3(kid.x, FY + kid.h + 0.2, kid.z));

    stats.builds++; stats.buildMs = Math.round(performance.now() - t0);
    return { scene: scene, camera: camera, owned: owned, venue: venue, cubes: cubes, kid: kid, actors: actors, conf: conf, confP: null, flares: flares, towers: towers, glint: glint, scarf: scarf,
      shoot: shoot, stars: stars, pts: pts, qi: qi, shadowsOn: shadowsOn, key: key, specKey: specKey(spec), cast: kinds.join(','), compiled: false, confRest: 0 };
  }

  function makeKid(spec, shadows) {
    var model = buildHuman({ dims: spec.dims, kit: spec.kit, num: spec.num, name: spec.name, look: spec.look, front: true });
    var D = spec.dims || KID, s = KID_H / ((KID.TOP - KID.FOOT) || 5.7), h = (D.TOP - D.FOOT) * s;
    model.root.scale.setScalar(s);
    model.root.traverse(function (o) { if (o.isMesh) { o.castShadow = shadows; } });
    var k = { model: model, s: s, h: h, foot: D.FOOT, x: -4.2, z: STAGE.z + STAGE.d / 2 + 3.4, dims: D, face: {}, blinkT: -1e9, nextBlink: performance.now() + rnd(3000, 6000) };
    kidPose(k, 'rest', 1, 0);
    return k;
  }
  // map arm targets made for the kid onto a grown-up's longer arms (as player.js does)
  function mapArm(k, v) {
    var D = k.dims; if (D === KID) return v;
    var r = (D.L1 + D.L2) / (KID.L1 + KID.L2); v.x = v.x + Math.sign(v.x) * (D.SH_X - KID.SH_X); v.y = D.SH_Y + (v.y - KID.SH_Y) * r; v.z *= r; return v;
  }
  var ARM = {
    rest: [[-0.74, 0.25, 0.08], [0.74, 0.25, 0.08]],                 // hands on hips: a confident stance
    hang: [[-1.0, -0.28, 0.12], [1.0, -0.28, 0.12]],
    pose: [[-0.86, 3.45, 0.22], [0.74, 0.25, 0.08]]                   // right fist up
  };
  var _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function solveArms(k, a, b, mix, open) {
    for (var i = 0; i < 2; i++) {
      _v.set(lerp(a[i][0], b[i][0], mix), lerp(a[i][1], b[i][1], mix), lerp(a[i][2], b[i][2], mix)); mapArm(k, _v);
      var arm = k.model.arms[i]; arm.open = open == null ? 0.3 : open; arm.setShoulderLift(0); arm.solve(_v.x, _v.y, _v.z, 0.2, 0);
    }
  }
  function kidPose(k, which, mix, now) {
    var m = k.model; m.setKnees(0, 0, 0, 0); m.body.rotation.set(0, 0, 0); m.neck.rotation.set(0.02, 0, 0); m.head.rotation.set(0.04, 0, 0);
    if (m.legs) { m.legs[0].rotation.z = -0.07; m.legs[1].rotation.z = 0.07; }
    m.root.position.set(k.x, FY - k.foot * k.s, k.z); m.root.rotation.set(0, 0.16, 0);
    if (which === 'rest') { solveArms(k, ARM.rest, ARM.rest, 1); k.face = {}; m.setFace(k.face); }
  }

  function makeActor(kind, x, y, z, h, yaw, shadows) {
    var actor = buildClassic(kind), s = h / (actor.top || 4), P = neutralP();
    if (actor.lean) P.lean += actor.lean;
    actor.root.scale.setScalar(s); actor.root.position.set(x, y + 0.02, z); actor.root.rotation.y = yaw;
    actor.root.traverse(function (o) { if (o.isMesh) o.castShadow = shadows; });
    var a = { kind: kind, actor: actor, P: P, s: s, x: x, y: y, z: z, h: h, yaw: yaw, side: x < -0.5 ? -1 : x > 0.5 ? 1 : 1, hop: null, wave: null, blinkT: -1e9, nextBlink: performance.now() + rnd(2500, 7000) };
    applyActor(a, performance.now());
    return a;
  }
  function applyActor(a, now) {
    var ac = a.actor; ac.apply(a.P, now);
    // arms: relaxed, hands a little in front (in root space, turned into the body's space the arms live in)
    for (var i = 0; i < 2; i++) {
      var arm = ac.arms[i], sd = arm.side || (i ? 1 : -1), t = arm.userData && arm.userData.t;
      _w.set(sd * 1.3, 0.45, 1.05);
      if (a.armUp != null && a.armUp > 0) { _v.set(sd * 1.35, 2.7, 0.7); _w.lerp(_v, a.armUp); }
      if (a.wave && sd === a.wave.side) { _w.lerp(_v.set(sd * (1.45 + a.wave.x), 3.05, 0.85), a.wave.k); }
      _w.applyMatrix4(ac.invBody); arm.open = 0.5; arm.solve(_w.x, _w.y, _w.z, 0.5, 0);
    }
  }

  // ---------------------------------------------------------------- the camera: fitted to the free part of the screen
  function freeRect(W, H) {
    var r = { x: 0, y: 0, w: W, h: H };
    try {
      if (mode === 'splash') {
        var b = document.querySelector('#splash .tapgo'); if (b) { var br = b.getBoundingClientRect(); if (br.height) r.h = Math.max(H * 0.45, br.top - 14); }
      } else {
        var p = document.querySelector('#title .t-panel'); if (p) {
          var pr = p.getBoundingClientRect(), sc = document.getElementById('title'), st = sc ? sc.scrollTop : 0;
          if (pr.width && pr.left > W * 0.4) { r.w = Math.max(W * 0.4, pr.left - 8); }
          else if (pr.height) { r.h = Math.max(H * 0.3, pr.top + st - 6); }
        }
      }
    } catch (e) {}
    return r;
  }
  var _d = new THREE.Vector3(), _p = new THREE.Vector3(), LOOK = new THREE.Vector3(0, FY + 4.6, STAGE.z + 1.5);
  function placeCam(cam, yawDeg, pitchDeg, dist, lift) {
    var y = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
    _d.set(Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p));
    cam.position.copy(LOOK).addScaledVector(_d, dist); cam.position.y += lift || 0;
    cam.lookAt(LOOK); cam.updateMatrixWorld();
  }
  function computeFit(W, H) {
    var cam = B.camera, fr = freeRect(W, H), m = Math.min(fr.w, fr.h) * 0.06, aw = fr.w - 2 * m, ah = fr.h - 2 * m;
    cam.aspect = W / H; cam.clearViewOffset(); cam.updateProjectionMatrix();
    function box(d) {
      placeCam(cam, 0, PITCH, d, 0);
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      B.pts.forEach(function (q) { _p.copy(q).project(cam); var px = (_p.x + 1) / 2 * W, py = (1 - _p.y) / 2 * H; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); });
      return { x0: x0, x1: x1, y0: y0, y1: y1 };
    }
    var lo = 12, hi = 260, bx = null;
    for (var it = 0; it < 30; it++) { var mid = (lo + hi) / 2, b = box(mid); if (b.x1 - b.x0 <= aw && b.y1 - b.y0 <= ah) hi = mid; else lo = mid; }
    bx = box(hi);
    var dx = (fr.x + fr.w / 2) - (bx.x0 + bx.x1) / 2, dy = (fr.y + fr.h / 2) - (bx.y0 + bx.y1) / 2;
    return { dist: hi, ox: -dx, oy: -dy, W: W, H: H, fr: fr };
  }
  function applyCamera() {
    var cam = B.camera, f = fit; if (!f) return;
    cam.aspect = f.W / f.H; cam.setViewOffset(f.W, f.H, f.ox, f.oy, f.W, f.H); cam.updateProjectionMatrix();
    placeCam(cam, camState.yaw, camState.pitch, f.dist * camState.dist, camState.lift);
  }

  // ---------------------------------------------------------------- the renderer: borrow, size, give back
  function borrow() {
    if (!saved) saved = { pr: renderer.getPixelRatio(), exp: renderer.toneMappingExposure, size: renderer.getSize(new THREE.Vector2()) };
    if (renderer.domElement.parentNode !== host) host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    sizeKey = '';
  }
  function giveBack() {
    if (!saved) return;
    renderer.setPixelRatio(saved.pr); renderer.toneMappingExposure = saved.exp;
    renderer.setSize(saved.size.x || 800, saved.size.y || 500, false);
    saved = null; try { ctx.dirty(); } catch (e) {}
  }
  function pixelRatio() {
    var L = LEVELS[B ? B.qi : 2], pr = Math.min(window.devicePixelRatio || 1, L.pr);
    if (B && B.lowRes) pr = 1;
    var W = host.clientWidth || innerWidth, H = host.clientHeight || innerHeight;
    if (W * H * pr * pr > 4.2e6) pr = Math.sqrt(4.2e6 / (W * H));     // a cap on pixels drawn (big desktop screens)
    return Math.max(0.75, pr);
  }
  function ensureSize() {
    var W = host.clientWidth || innerWidth, H = host.clientHeight || innerHeight, pr = pixelRatio(), k = W + 'x' + H + '@' + pr.toFixed(3) + mode;
    var buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (k === sizeKey && Math.abs(buf.x - Math.floor(W * pr)) <= 1) return false;
    sizeKey = k; renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    fit = computeFit(W, H); applyCamera(); dirty = true; bubbleKey = '';
    return true;
  }

  // ---------------------------------------------------------------- the opening
  // a cube's path: from y0 with upward speed v0, landing on yr, bouncing (impacts listed for the thuds)
  function bounce(y0, yr, v0, tStart) {
    var segs = [], imps = [], t = tStart, tau = (v0 + Math.sqrt(v0 * v0 + 2 * G * (y0 - yr))) / G;
    segs.push({ t0: t, y0: y0, v0: v0, dur: tau }); var vi = G * tau - v0; t += tau; imps.push({ t: t, v: vi });
    var v = vi * E;
    while (v > 1.4) { var d = 2 * v / G; segs.push({ t0: t, y0: yr, v0: v, dur: d }); t += d; imps.push({ t: t, v: v }); v *= E; }
    return { segs: segs, imps: imps, tStart: tStart, tFirst: imps[0].t, tEnd: t, yr: yr, y0: y0 };
  }
  function bounceY(b, t) {
    if (t <= b.tStart) return b.y0;
    for (var i = 0; i < b.segs.length; i++) { var s = b.segs[i], u = t - s.t0; if (u <= s.dur) return s.y0 + s.v0 * u - G / 2 * u * u; }
    return b.yr;
  }
  var _ax = new THREE.Vector3(), _q = new THREE.Quaternion();
  function planCubes(kind) {
    var vmax = 1, plan = [];
    B.cubes.forEach(function (c, i) {
      c.anim = null; if (c.d.loose) return;
      var top = c.d.row === 1, j = c.d.j, yr = c.rest.y, b;
      if (kind === 'kick') b = bounce(yr, yr, top ? 22.6 : 17.9, (top ? 0.95 : 0.3) + j * (top ? 0.05 : 0.045));
      else if (kind === 'drop') b = bounce(yr + 12, yr, 0, (top ? 1.35 : 0.2) + j * (top ? 0.06 : 0.05));
      else if (kind === 'ripple') b = bounce(yr, yr, 4.2, 0.1 + (top ? 0.25 : 0) + j * 0.04);
      if (!b) return;
      _ax.set(rnd(-1, 1), rnd(-1, 1), rnd(-0.4, 0.4)).normalize();
      var spin = kind === 'kick' ? TAU * (Math.random() < 0.5 ? 1 : 2) * (Math.random() < 0.5 ? -1 : 1) : kind === 'drop' ? rnd(2.4, 4.6) * (Math.random() < 0.5 ? -1 : 1) : 0;
      c.anim = { b: b, axis: _ax.clone(), spin: spin, kind: kind, sq: [] };
      b.imps.forEach(function (im) { vmax = Math.max(vmax, im.v); plan.push({ t: im.t, v: im.v, x: c.rest.x, top: top }); });
    });
    plan.forEach(function (p) { p.k = p.v / vmax; });
    return plan;
  }
  function stepCubes(t) {
    var busy = false;
    B.cubes.forEach(function (c) {
      var a = c.anim; if (!a) return;
      var b = a.b, y = bounceY(b, t), m = c.m;
      m.position.set(c.rest.x, y, c.rest.z);
      // tumble: a kick turns whole times round (ends square), a drop starts turned and comes square by the first bounce
      var k = clamp((t - b.tStart) / (b.tFirst - b.tStart + 0.22), 0, 1), ang = a.kind === 'kick' ? a.spin * eio(k) : a.spin * (1 - eout(k));
      _q.setFromAxisAngle(a.axis, ang); m.quaternion.copy(c.restQ).multiply(_q);
      // squash on each impact
      var sq = 0; for (var i = 0; i < b.imps.length; i++) { var dt = t - b.imps[i].t; if (dt >= 0 && dt < 0.22) sq = Math.max(sq, (b.imps[i].v / 22) * Math.exp(-dt * 16) * Math.cos(dt * 26)); }
      sq = clamp(sq, -0.12, 0.2);
      m.scale.set(1 + sq * 0.45, 1 - sq, 1 + sq * 0.45); if (sq) m.position.y -= C * sq / 2;
      if (t < b.tEnd + 0.25) busy = true; else { m.position.copy(c.rest); m.quaternion.copy(c.restQ); m.scale.setScalar(1); c.anim = null; }
    });
    return busy;
  }

  // the kid running in from the right, turning to us, fist up, then hands on hips
  var KID_T = { run0: 2.4, run1: 3.6, turn1: 3.86, pose: 4.0, hold: 5.1, down: 5.7 };
  function stepKid(t, kind) {
    var k = B.kid, m = k.model, now = performance.now();
    if (kind !== 'full') { kidPose(k, 'rest', 1, now); return false; }
    var x0 = 17.5, xr = k.x;
    if (t < KID_T.run0) { m.root.visible = false; return true; }
    m.root.visible = true;
    m.setKnees(0, 0, 0, 0); m.body.rotation.set(0, 0, 0); m.neck.rotation.set(0.02, 0, 0); m.head.rotation.set(0.04, 0, 0);
    if (m.legs) { m.legs[0].rotation.z = -0.07; m.legs[1].rotation.z = 0.07; }
    var baseY = FY - k.foot * k.s;
    if (t < KID_T.run1) {
      var u = (t - KID_T.run0) / (KID_T.run1 - KID_T.run0), e = 1 - Math.pow(1 - u, 1.7), x = lerp(x0, xr, e), speed = 1 - u * 0.85;
      var ph = (t - KID_T.run0) * 16, sw = Math.sin(ph) * 0.75 * speed;
      m.setKnees(-sw, sw, 0.25 + Math.max(0, Math.sin(ph)) * 1.0 * speed, 0.25 + Math.max(0, -Math.sin(ph)) * 1.0 * speed);
      m.body.rotation.x = 0.2 * speed; m.root.position.set(x, baseY + Math.abs(Math.sin(ph)) * 0.22 * k.s * speed, k.z); m.root.rotation.set(0, -Math.PI / 2, 0);
      for (var i = 0; i < 2; i++) { var sg = i ? -1 : 1, q = Math.sin(ph) * sg * speed; _v.set(i ? 0.95 : -0.95, 0.1 + 0.25 * Math.abs(q), 0.15 + 0.6 * q); mapArm(k, _v); m.arms[i].open = 0.1; m.arms[i].solve(_v.x, _v.y, _v.z, 0.2, 0); }
      m.setFace({ mouth: { big: 0.6 }, squint: 0.2 });
      // a footstep sound each time a foot comes down
      var stepN = Math.floor(ph / Math.PI); if (stepN !== k.lastStep) { k.lastStep = stepN; if (intro && !intro.skipped && sfx() && speed > 0.3) sfx().ui('step', 0.5 * speed); }
      return true;
    }
    m.root.position.set(xr, baseY, k.z);
    if (t < KID_T.turn1) {
      var w = sstep((t - KID_T.run1) / (KID_T.turn1 - KID_T.run1));
      m.root.rotation.set(0, lerp(-Math.PI / 2, 0.16, w), 0); solveArms(k, ARM.hang, ARM.hang, 1, 0.3); m.setFace({ mouth: { big: 0.4 } });
      return true;
    }
    m.root.rotation.set(0, 0.16, 0);
    if (t < KID_T.hold) {
      var pu = sstep((t - KID_T.turn1) / 0.2), hop = t > KID_T.pose ? Math.max(0, Math.sin(Math.min(1, (t - KID_T.pose) / 0.36) * Math.PI)) * 0.55 * k.s : 0;
      m.root.position.y = baseY + hop;
      if (hop > 0) m.setKnees(-0.15, -0.15, 0.3, 0.3);
      solveArms(k, ARM.hang, ARM.pose, pu, pu > 0.5 ? 0 : 0.3);
      m.setFace({ mouth: { big: 1 }, squint: 0.45, browUp: 0.3 });
      return true;
    }
    if (t < KID_T.down) {
      var dn = sstep((t - KID_T.hold) / (KID_T.down - KID_T.hold));
      solveArms(k, ARM.pose, ARM.rest, dn, 0.3); m.setFace(dn > 0.6 ? {} : { mouth: { big: 1 - dn }, squint: 0.4 * (1 - dn) });
      return true;
    }
    kidPose(k, 'rest', 1, now);
    return false;
  }
  // Pip and the creatures hop in once: an arc from off to the side, a squash on landing
  function planHops(kind) {
    B.actors.forEach(function (a, i) {
      a.hop = null; a.armUp = 0; a.actor.root.visible = true;
      if (kind !== 'full') return;
      var t0 = a.kind === 'pip' ? 2.9 : 3.05 + (i - 1) * 0.2, dir = a.kind === 'pip' ? -1 : (a.x < 0 ? -1 : 1);
      a.hop = { t0: t0, t1: t0 + 0.62, from: new THREE.Vector3(a.x + dir * 7, a.y + 6.5, a.z + 1.5), landed: false, took: false };
    });
  }
  function stepActors(t, now) {
    var busy = false;
    B.actors.forEach(function (a) {
      var r = a.actor.root, h = a.hop, P = a.P;
      P.blink = 0; P.open = 0; P.smile = 0.7; P.eyeWide = 0;
      if (h) {
        if (t < h.t0) { r.visible = false; busy = true; return; }
        r.visible = true;
        if (!h.took) { h.took = true; if (!intro.skipped && sfx()) sfx().play('boing', 0, { pan: clamp(a.x / 14, -1, 1) }, true); }
        var u = (t - h.t0) / (h.t1 - h.t0);
        if (u < 1) {
          var e = sstep(u); r.position.set(lerp(h.from.x, a.x, e), lerp(h.from.y, a.y, u) + Math.sin(u * Math.PI) * 3.2 + 0.02, lerp(h.from.z, a.z, e));
          r.rotation.y = a.yaw + (1 - e) * (a.x < 0 ? 1 : -1) * 0.9; r.scale.setScalar(a.s); a.armUp = Math.sin(u * Math.PI);
          P.open = 0.55; P.eyeWide = 0.4; P.smile = 1; busy = true;
        } else {
          if (!h.landed) { h.landed = true; if (!intro.skipped && sfx()) sfx().play('pat', 0, { pan: clamp(a.x / 14, -1, 1) }, true); }
          var dt = t - h.t1, sq = 0.16 * Math.exp(-dt * 9) * Math.cos(dt * 19);
          r.position.set(a.x, a.y + 0.02, a.z); r.rotation.y = a.yaw; r.scale.set(a.s * (1 + sq * 0.5), a.s * (1 - sq), a.s * (1 + sq * 0.5)); a.armUp = 0;
          P.smile = 0.7 + 0.3 * Math.exp(-dt * 3);
          if (dt < 0.6) busy = true; else { a.hop = null; r.scale.setScalar(a.s); }
        }
      } else { r.visible = true; r.position.set(a.x, a.y + 0.02, a.z); r.rotation.y = a.yaw; r.scale.setScalar(a.s); }
      // one-off wave
      if (a.wave) {
        var wt = (now - a.wave.t0) / 1000, up = wt < 0.35 ? sstep(wt / 0.35) : wt < 1.2 ? 1 : 1 - sstep((wt - 1.2) / 0.4);
        a.wave.k = up; a.wave.x = wt > 0.3 && wt < 1.25 ? Math.sin((wt - 0.3) / 0.95 * TAU * 2) * 0.38 : 0; P.smile = 1; P.headRoll = a.wave.side * -0.08 * up;
        if (wt > 1.6) { a.wave = null; P.headRoll = 0; } else busy = true;
      }
      // a single blink now and then
      var bt = now - a.blinkT; if (bt >= 0 && bt < 170) { P.blink = bt < 70 ? bt / 70 : 1 - (bt - 70) / 100; busy = true; }
      applyActor(a, now);
    });
    return busy;
  }
  function stepKidBlink(now) {
    var k = B.kid, bt = now - k.blinkT;
    if (bt >= 0 && bt < 160) { k.model.setFace(Object.assign({}, k.face, { lid: bt < 60 ? 0.95 - bt / 60 * 0.9 : 0.05 + (bt - 60) / 100 * 0.9 })); return true; }
    if (k.blinking) { k.blinking = false; k.model.setFace(k.face); return true; }
    return false;
  }

  // confetti from two little cannons at the stage corners, plus a shower over the title
  function startConfetti() {
    var n = B.conf.count, P = [];
    for (var i = 0; i < n; i++) {
      var side = i % 3 === 0 ? 0 : i % 3 === 1 ? -1 : 1, p = {};
      if (side) { p.x = side * (STAGE.w / 2 - 0.5); p.y = TOPY + 0.6; p.z = STAGE.z + 2; p.vx = -side * rnd(3, 9); p.vy = rnd(13, 21); p.vz = rnd(0, 5); }
      else { p.x = rnd(-13, 13); p.y = TOPY + 2 * C + rnd(5, 9); p.z = STAGE.z + rnd(0, 6); p.vx = rnd(-1, 1); p.vy = rnd(-1, 1); p.vz = rnd(-0.5, 1.5); }
      p.ax = rnd(-1, 1); p.ay = rnd(-1, 1); p.az = rnd(-1, 1); p.spin = rnd(6, 14); p.ph = rnd(0, TAU); p.done = false; p.t0 = side ? rnd(0, 0.15) : rnd(0, 0.6);
      P.push(p);
    }
    B.confP = { list: P, t0: performance.now() }; B.conf.visible = true;
  }
  var _m4 = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _e = new THREE.Euler(), _s1 = new THREE.Vector3(1, 1, 1), _pos = new THREE.Vector3();
  function stepConfetti(now, dt) {
    var cp = B.confP; if (!cp) return false;
    var live = 0, t = (now - cp.t0) / 1000;
    cp.list.forEach(function (p, i) {
      if (p.done) return;
      if (t < p.t0) { live++; return; }
      p.vy -= 16 * dt; var drag = Math.exp(-dt * 2.4); p.vx *= drag; p.vz *= drag; if (p.vy < -3.2) p.vy = -3.2 + (p.vy + 3.2) * Math.exp(-dt * 6);
      p.x += (p.vx + Math.sin(t * 3 + p.ph) * 0.9) * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      var floor = (Math.abs(p.x) < STAGE.w / 2 && p.z > STAGE.z - STAGE.d / 2 && p.z < STAGE.z + STAGE.d / 2) ? TOPY + 0.01 : FY + 0.015;
      if (p.y <= floor && p.vy < 0) { p.y = floor; p.done = true; _e.set(-Math.PI / 2, 0, p.ph); _qq.setFromEuler(_e); }
      else { var a = t * p.spin + p.ph; _e.set(p.ax * a, p.ay * a, p.az * a); _qq.setFromEuler(_e); live++; }
      _pos.set(p.x, p.y, p.z); _m4.compose(_pos, _qq, _s1); B.conf.setMatrixAt(i, _m4);
    });
    B.conf.instanceMatrix.needsUpdate = true;
    if (!live) { B.confP = null; return true; }
    return true;
  }
  // floodlight flares: one bright bloom and a streak per tower, then a faint glint that stays
  function stepFlares(t, kind) {
    if (!B.flares.length) return false;
    var tp = kind === 'full' ? FULL.pose : -1, busy = false;
    B.flares.forEach(function (f, i) {
      var k = tp < 0 ? 9 : (t - tp - i * 0.07) / 1.1, a = k < 0 ? 0 : k < 0.12 ? k / 0.12 : Math.max(0, 1 - (k - 0.12) / 0.88);
      var calm = kind === 'full' ? 0.12 * sstep(k * 2) : 0.12;
      f.a.visible = a > 0.01; f.a.material.opacity = 0.9 * a; f.a.scale.setScalar(26 + 30 * a);
      f.b.visible = true; f.b.material.opacity = Math.max(calm, 0.85 * a); f.b.scale.set(40 + 50 * a, 2.2 + 2 * a, 1);
      if (k >= 0 && k < 1.05) busy = true;
    });
    return busy;
  }

  // ---------------------------------------------------------------- the score the sound follows
  function scheduleIntroSound(kind, cubePlan) {
    var X = sfx(); if (!X) return;
    var on = fxOn();
    X.begin();
    if (!on) { if (save().set.titleFx !== false) X.play('chime', 0.05); return; }   // reduced motion: a soft chime; title show off: quiet
    if (kind === 'full') {
      X.play('lightsUp', 0);
      if (B.wasSplash) X.play('liftoff', 0.28);
      cubePlan.forEach(function (p) { X.play('thud', p.t, { v: p.k, pan: clamp(p.x / 14, -0.9, 0.9), top: p.top }); });
      X.play('fanfare', 0.45, { beat: (FULL.pose - 0.45) / 8 });
      X.play('whoosh', 2.95); X.play('sparkle', 3.05);
      X.play('crowd', FULL.pose - 0.15); X.play('confetti', FULL.pose + 0.02);
    } else if (kind === 'short') {
      cubePlan.forEach(function (p) { if (p.k > 0.5) X.play('tick', p.t, { v: p.k * 0.6, pan: clamp(p.x / 14, -0.9, 0.9) }); });
      X.play('sparkle', 0.85); X.play('chime', 0.95);
    }
  }

  // ---------------------------------------------------------------- one-offs at rest (every 12-20 s, never twice in a row)
  function planNextOneOff(now) { nextOneOff = now + rnd(12000, 20000); wake(nextOneOff - now); }
  function startOneOff(now, force) {
    var kinds = ['wave', 'roll', 'star'], pick = force;
    if (!force) do { pick = kinds[Math.floor(Math.random() * kinds.length)]; } while (pick === lastOne && kinds.length > 1);
    lastOne = pick;
    if (pick === 'wave') {
      var a = B.actors[Math.floor(Math.random() * B.actors.length)];
      a.wave = { t0: now, side: a.x < -0.5 ? -1 : 1, k: 0, x: 0 };
      if (sfx()) sfx().play('hi', 0.1, { pan: clamp(a.x / 14, -0.9, 0.9) }, true);
    } else if (pick === 'roll') {
      var ls = B.cubes.filter(function (c) { return c.d.loose; }), c = ls[Math.floor(Math.random() * ls.length)];
      var axis = new THREE.Vector3(1, 0, 0).applyQuaternion(c.m.quaternion); axis.y = 0; axis.normalize();
      c.roll = { t0: now, q0: c.m.quaternion.clone(), axis: axis, p0: c.m.position.clone(), dir: new THREE.Vector3(0, 1, 0).cross(axis).normalize().negate(), clacked: false };
    } else {
      var sx = rnd(-60, -20), sy = FY + rnd(38, 52);
      B.shootP = { t0: now, a: new THREE.Vector3(sx, sy, -95), b: new THREE.Vector3(sx + rnd(40, 60), sy - rnd(8, 14), -95) };
      if (sfx()) sfx().play('twinkle', 0.15, {}, true);
    }
    planNextOneOff(now);
  }
  function stepOneOffs(now) {
    var busy = false;
    B.cubes.forEach(function (c) {
      var r = c.roll; if (!r) return;
      var k = (now - r.t0) / 520, e = k >= 1 ? 1 : eio(k), s = c.d.size, ang = e * Math.PI / 2;
      _q.setFromAxisAngle(r.axis, -ang); c.m.quaternion.copy(_q).multiply(r.q0);
      // roll over the front-bottom edge: the centre travels on a quarter circle round that edge
      var R = s / 2 * Math.SQRT2, a0 = Math.PI / 4;
      c.m.position.copy(r.p0).addScaledVector(r.dir, s / 2 - Math.cos(a0 + ang) * R); c.m.position.y = FY + Math.sin(a0 + ang) * R;
      if (!r.clacked && k >= 0.92) { r.clacked = true; if (sfx()) sfx().play('clack', 0, {}, true); }
      if (k >= 1) { c.m.position.y = FY + s / 2; c.rest.copy(c.m.position); c.restQ.copy(c.m.quaternion); c.roll = null; } else busy = true;
    });
    if (B.shootP) {
      var sp = B.shootP, u = (now - sp.t0) / 1100, sh = B.shoot;
      if (u >= 1) { sh.visible = false; B.shootP = null; }
      else {
        sh.visible = true; sh.position.lerpVectors(sp.a, sp.b, eio(u)); sh.material.opacity = Math.sin(u * Math.PI) * 0.95;
        sh.material.rotation = Math.atan2(sp.b.y - sp.a.y, sp.b.x - sp.a.x); sh.scale.set(14, 0.9, 1); busy = true;
      }
    }
    return busy;
  }

  // ---------------------------------------------------------------- the loop
  function wake(ms) {
    if (!running) return;
    clearTimeout(wakeT); wakeT = setTimeout(function () { wakeT = 0; kick(); }, Math.max(0, ms || 0));
  }
  function kick() { if (running && !raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0; if (!running || !B) return;
    if (bday.own) return;                    // BIRTHDAY: the birthday show draws this scene itself while it plays
    now = now || performance.now();
    var dt = Math.min(0.05, (now - (lastFrameT || now)) / 1000); lastFrameT = now;
    var busy = false, t = intro ? (now - intro.t0) / 1000 : 99, kind = intro ? intro.kind : 'none';
    if (intro) {
      if (intro.skipped) t = intro.end + 1;
      // camera
      var cu = clamp(t / intro.cam, 0, 1), ce = eio(cu), a = intro.from, b = intro.to;
      camState.yaw = lerp(a.yaw, b.yaw, ce); camState.pitch = lerp(a.pitch, b.pitch, ce); camState.dist = lerp(a.dist, b.dist, ce); camState.lift = lerp(a.lift, b.lift, ce);
      applyCamera();
      if (kind === 'full') renderer.toneMappingExposure = lerp(intro.exp0, 1.0, sstep(t / 0.9));
      if (stepCubes(t)) busy = true;
      if (stepKid(t, kind)) busy = true;
      // events
      if (kind === 'full' && !intro.skipped) {
        if (!intro.fired.glint && t >= 2.95) { intro.fired.glint = true; intro.glintT = now; }
        if (!intro.fired.pose && t >= FULL.pose) {
          intro.fired.pose = true;
          try { B.venue.crowd('cheer', { wave: true }); } catch (e) {}
          try { B.venue.flash(); } catch (e) {}
          startConfetti();
        }
      }
      if (stepFlares(t, kind)) busy = true;
      if (B.scarf) { var su0 = kind === 'full' ? 2.8 : kind === 'short' ? 0.2 : -9, sk = sstep((t - su0) / (kind === 'full' ? 0.9 : 0.6)); B.scarf.scale.set(Math.max(0.001, sk), 0.4 + 0.6 * sstep((t - su0) / 0.3), 1); if (t < su0 + 1) busy = true; }
      if (kind === 'short' && !intro.skipped && !intro.fired.glint && t >= 0.85) { intro.fired.glint = true; intro.glintT = now; }
      if (t < intro.end) busy = true;
      else endIntro(now);
    } else if (drift) {
      var du = (now - drift.t0) / drift.dur;
      if (du >= 1) { drift = null; }
      else {
        var de = sstep(du); camState.yaw = lerp(0, drift.yaw, de); camState.dist = lerp(1, drift.dist, de); applyCamera();
        // drawn at about 30 fps: the drift is so slow that more would only use battery
        if (now - stats.lastRender < 30) { raf = requestAnimationFrame(frame); return; }
        busy = true; dirty = true;
      }
    }
    if (B.splashPush) {
      var su = (now - B.splashPush.t0) / B.splashPush.dur;   // (once: 6 s)
      if (su >= 1) B.splashPush = null; else { camState.dist = lerp(B.splashPush.d0, B.splashPush.d1, sstep(su)); applyCamera(); dirty = true; busy = true; if (now - stats.lastRender < 30) { raf = requestAnimationFrame(frame); return; } }
    }
    // the glint: a small bright light sweeping across the front of the cubes
    if (intro && intro.glintT) {
      var gu = (now - intro.glintT) / 750;
      if (gu < 1) { B.glint.intensity = Math.sin(gu * Math.PI) * 260; B.glint.position.x = lerp(-15, 15, gu); busy = true; }
      else { B.glint.intensity = 0; intro.glintT = 0; dirty = true; }
    }
    if (mode === 'title' && stepActors(intro ? t : 99, now)) busy = true;
    if (mode === 'title' && stepKidBlink(now)) busy = true;
    if (stepConfetti(now, dt)) busy = true;
    if (B.venue && B.venue.step(now)) busy = true;
    if (rest && fxOn() && API._restLife) {   // (off: the rest is still; _restLife = true brings back the old blinks and one-offs)
      if (stepOneOffs(now)) busy = true;
      if (nextOneOff && now >= nextOneOff && mode === 'title') startOneOff(now);
      // next blinks
      if (mode === 'title') {
        if (now >= B.kid.nextBlink) { B.kid.blinkT = now; B.kid.blinking = true; B.kid.nextBlink = now + rnd(4500, 9000); busy = true; }
        B.actors.forEach(function (a) { if (now >= a.nextBlink) { a.blinkT = now; a.nextBlink = now + rnd(3500, 9000); busy = true; } });
      }
    }
    if (busy) dirty = true;
    ensureSize();
    if (dirty) render(now);
    if (busy) raf = requestAnimationFrame(frame);
    else if (running && rest && fxOn() && mode === 'title' && API._restLife) {
      var nb = Math.min(B.kid.nextBlink, nextOneOff || 1e15); B.actors.forEach(function (a) { nb = Math.min(nb, a.nextBlink); });
      wake(nb - performance.now());
    }
  }
  function render(now) {
    try {
      renderer.setRenderTarget(null); renderer.render(B.scene, B.camera);
      stats.renders++; stats.lastRender = now || performance.now(); dirty = false;
      if (intro) watchSpeed(now);
      placeBubble();
    } catch (e) { fail(e); }
  }
  // if the opening runs slowly (an older tablet), draw fewer pixels and drop the shadow map for the rest of the visit
  function watchSpeed(now) {
    if (stats.lastGap) frameGaps.push(now - stats.lastGap); stats.lastGap = now;
    if (frameGaps.length >= 40) {
      var slow = frameGaps.filter(function (g) { return g > 34 && g < 200; }).length; frameGaps = [];
      if (slow > 24 && !B.lowRes) { B.lowRes = true; stats.slowFrames = slow; if (B.shadowsOn) { B.key.castShadow = false; } sizeKey = ''; }
    }
  }
  // Pip's greeting bubble sits over his head (HTML, placed from the 3D position)
  function placeBubble() {
    if (mode !== 'title') return;
    var el = document.querySelector('#title.t3 .t-greet'); if (!el) return;
    var pip = B.actors[0]; if (!pip) return;
    _p.set(pip.x, pip.y + pip.h + 0.35, pip.z).project(B.camera);
    var W = host.clientWidth || innerWidth, H = host.clientHeight || innerHeight, x = (_p.x + 1) / 2 * W, y = Math.max((1 - _p.y) / 2 * H, (el.offsetHeight || 50) + 14);
    var key = Math.round(x) + ',' + Math.round(y); if (key === bubbleKey) return; bubbleKey = key;
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
  }
  function endIntro(now) {
    var kind = intro.kind; intro = null; rest = true;
    renderer.toneMappingExposure = 1.0; B.glint.intensity = 0; if (B.scarf) B.scarf.scale.set(1, 1, 1);
    camState = { yaw: 0, pitch: PITCH, dist: 1, lift: 0 }; applyCamera();
    B.cubes.forEach(function (c) { if (c.anim) { c.m.position.copy(c.rest); c.m.quaternion.copy(c.restQ); c.m.scale.setScalar(1); c.anim = null; } });
    kidPose(B.kid, 'rest', 1, now);
    B.actors.forEach(function (a) { a.hop = null; a.armUp = 0; });
    stepFlares(99, 'none');
    drift = null;   // SHOWPIECES: the rest is a still picture (no slow drift)
    var hostT = document.getElementById('title'); if (hostT) hostT.classList.add('t3-rest');
    if (sfx()) sfx().ambience(true);
    dirty = true;
    try { if (typeof API.onIntroEnd === 'function') API.onIntroEnd(kind); } catch (e) {}
  }

  // ---------------------------------------------------------------- show / hide
  function ensureBuilt() {
    if (B) {
      // his kit or name changed, or a new creature was unlocked: build again (cheap enough, and only then)
      var k = specKey(kidSpec()), cs = cast().join(','), qi = qLevel();
      if (k === B.specKey && cs === B.cast && qi === B.qi) return true;
      disposeScene();
    }
    try { B = build(); return true; } catch (e) { fail(e); return false; }
  }
  function ok() { return !failed && !!(T3.active && T3.active()) && !!host; }
  function show(m, opts) {
    opts = opts || {};
    if (!ok()) return false;
    clearTimeout(disposeT); disposeT = 0;
    if (!ensureBuilt()) return false;
    var was = mode; mode = m; running = true;
    document.body.classList.add('t3on'); host.classList.toggle('t3-low', B.qi === 0);
    borrow(); ensureSize();
    if (!B.compiled) { B.compiled = true; try { if (renderer.compile) renderer.compile(B.scene, B.camera); } catch (e) {} dirty = true; kick(); /* plain warm-up: three r170's compileAsync throws from its own timer when a material is freed while compiling */ }
    if (m === 'splash') {
      shownSplash = true; rest = false; intro = null; drift = null;
      renderer.toneMappingExposure = 0.78;
      B.kid.model.root.visible = false; B.actors.forEach(function (a) { a.actor.root.visible = false; });
      B.cubes.forEach(function (c) { c.anim = null; c.m.position.copy(c.rest); c.m.quaternion.copy(c.restQ); c.m.scale.setScalar(1); });
      stepFlares(-1, 'splash'); B.flares.forEach(function (f) { f.b.visible = false; });
      camState = { yaw: -4, pitch: -17, dist: 1.42, lift: 0 }; applyCamera();
      if (fxOn()) B.splashPush = { t0: performance.now(), dur: 6000, d0: 1.42, d1: 1.3 };
      B.wasSplash = true;
    } else {
      var kind = opts.intro || 'short';
      if (!fxOn()) kind = 'none';
      var hostT = document.getElementById('title'); if (hostT) hostT.classList.remove('t3-rest');
      B.splashPush = null; rest = false; drift = null; nextOneOff = 0;
      B.cubes.forEach(function (c) { c.roll = null; });
      var now = performance.now(), from;
      if (kind === 'full') from = (was === 'splash' || B.wasSplash) ? { yaw: camState.yaw, pitch: camState.pitch, dist: camState.dist, lift: 0 } : { yaw: -20, pitch: -22, dist: 1.9, lift: 0 };
      else from = { yaw: -6, pitch: PITCH - 3, dist: 1.14, lift: 0 };
      var cubeKind = kind === 'full' ? (B.wasSplash ? 'kick' : 'drop') : kind === 'short' ? 'ripple' : 'none';
      var plan = cubeKind === 'none' ? [] : planCubes(cubeKind);
      planHops(kind);
      B.kid.model.root.visible = kind !== 'full';
      if (kind !== 'full') kidPose(B.kid, 'rest', 1, now);
      intro = { kind: kind, t0: now + 60, end: kind === 'full' ? FULL.end : kind === 'short' ? SHORT.end : 0, cam: kind === 'full' ? FULL.cam : SHORT.cam, from: from, to: { yaw: 0, pitch: PITCH, dist: 1, lift: 0 },
        fired: {}, skipped: false, exp0: renderer.toneMappingExposure < 0.95 ? renderer.toneMappingExposure : 0.7 };
      if (kind === 'none') { intro.t0 = now - 1000; }
      scheduleIntroSound(kind, plan);
      B.wasSplash = false;
    }
    host.classList.add('on');
    dirty = true; lastFrameT = 0; frameGaps = []; stats.lastGap = 0; kick();
    return true;
  }
  function skip() {
    if (!intro || intro.skipped || intro.kind === 'none') return;
    intro.skipped = true;
    if (sfx()) sfx().cancel();
    B.confP = null; B.conf.visible = false;
    try { B.venue.dispose(); } catch (e) {}  // puts the crowd straight back at rest
    kick();
  }
  function stop() {
    if (bday.own && bday.abort) { try { bday.abort(); } catch (e) { bday.own = false; } }   // BIRTHDAY: leaving the title ends the show at once
    running = false; mode = 'off';
    if (raf) cancelAnimationFrame(raf); raf = 0; clearTimeout(wakeT); wakeT = 0;
    if (sfx()) sfx().stopAll();
    if (intro && B) { var ik = intro.kind; intro.skipped = true; endIntroQuiet(); try { if (typeof API.onIntroEnd === 'function') API.onIntroEnd(ik); } catch (e) {} }
    drift = null; rest = false; nextOneOff = 0;
    if (B) { B.splashPush = null; B.confP = null; B.conf.visible = false; B.cubes.forEach(function (c) { c.roll = null; }); try { B.venue.dispose(); } catch (e) {} }
    host.classList.remove('on'); document.body.classList.remove('t3on');
    giveBack();
  }
  function endIntroQuiet() {
    intro = null; B.glint.intensity = 0; if (B.scarf) B.scarf.scale.set(1, 1, 1);
    B.cubes.forEach(function (c) { c.anim = null; c.m.position.copy(c.rest); c.m.quaternion.copy(c.restQ); c.m.scale.setScalar(1); });
    kidPose(B.kid, 'rest', 1, performance.now()); B.actors.forEach(function (a) { a.hop = null; a.armUp = 0; a.wave = null; });
  }
  function screen(id) {
    if (id === 'splash' || id === 'intro' || id === 'dedication' || id === 'title') { if (mode === 'title' && id !== 'title') { stop(); } return; }
    if (mode !== 'off') stop();
    // free the memory: at once when a match starts, otherwise after a while away (Settings and back keeps it)
    clearTimeout(disposeT);
    if (id === 'game') disposeScene(); else disposeT = setTimeout(disposeScene, 45000);
  }
  function disposeScene() {
    clearTimeout(disposeT); disposeT = 0;
    if (!B) return;
    if (mode !== 'off') stop();
    var Bd = B; B = null; fit = null;
    if (Bd.compiling) { Bd.freeLater = true; return; }   // freed when its shaders have finished compiling
    freeScene(Bd);
  }
  function freeScene(B) {
    var geos = new Set(), mats = new Set(), texs = new Set(B.owned.tex);
    B.scene.traverse(function (o) {
      if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) geos.add(o.geometry);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { mats.add(m); });
      if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
    });
    mats.forEach(function (m) { ['map', 'lightMap', 'emissiveMap', 'alphaMap', 'normalMap', 'roughnessMap', 'bumpMap'].forEach(function (k) { if (m[k] && m[k].isTexture) texs.add(m[k]); }); });
    if (B.scene.environment === ctx.scene.environment) B.scene.environment = null;   // the table's: not ours to free
    texs.delete(ctx.scene.environment);
    try { if (B.venue && B.venue.dispose) B.venue.dispose(); } catch (e) {}
    geos.forEach(function (g) { g.dispose(); }); mats.forEach(function (m) { m.dispose(); }); texs.forEach(function (t) { if (t && t.dispose) t.dispose(); });
    if (B.conf.dispose) B.conf.dispose();
    stats.disposes++;
  }
  function fail(e) {
    console.warn('Title3D', e); failed = true;
    try { stop(); } catch (x) {}
    try { disposeScene(); } catch (x) {}
    try { if (typeof window.titleSceneFailed === 'function') window.titleSceneFailed(); } catch (x) {}
  }

  // ---------------------------------------------------------------- wiring
  function mountHost() {
    host = document.getElementById('t3title');
    if (!host) { host = document.createElement('div'); host.id = 't3title'; host.setAttribute('aria-hidden', 'true'); document.body.insertBefore(host, document.body.firstChild); }
  }
  mountHost();
  window.addEventListener('resize', function () { if (running) { sizeKey = ''; dirty = true; kick(); } });
  // any tap skips the opening (the tap still does what it was for: the menu works at once)
  document.addEventListener('pointerdown', function () { if (running && intro && !intro.skipped && intro.kind !== 'none' && mode === 'title') skip(); }, true);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && running) { sizeKey = ''; dirty = true; kick(); } });

  // ---------------------------------------------------------------- BIRTHDAY: the easter egg (js/three/birthday.js)
  // Five quick taps (within 2.5 s) on the "T" of EQUATIONS start the birthday show; TataBirthday.play() replays it.
  // Only taps that reach the scene count (not the menu panel or any button). The show module is loaded on demand.
  function bdayTapOnT(e) {
    if (!B || !running || (mode !== 'title' && mode !== 'splash')) return false;
    var t = null; B.cubes.forEach(function (c) { if (!c.d.loose && c.d.row === 0 && c.d.ch === 'T') t = c; });
    if (!t || !host) return false;
    var r = host.getBoundingClientRect(), W = r.width || innerWidth, H = r.height || innerHeight;
    t.m.getWorldPosition(_p); _p.project(B.camera); var cx = (_p.x + 1) / 2 * W + r.left, cy = (1 - _p.y) / 2 * H + r.top;
    t.m.getWorldPosition(_p); _p.x += C * 0.5 * 1.4; _p.project(B.camera); var rad = Math.abs((_p.x + 1) / 2 * W + r.left - cx);
    var dx = e.clientX - cx, dy = e.clientY - cy;
    return dx * dx + dy * dy <= rad * rad;
  }
  document.addEventListener('pointerdown', function (e) {
    if (bday.own || !running) return;
    var tg = e.target; if (tg && tg.closest && tg.closest('button, a, input, select, textarea, label, .t-panel, .mm, .tapgo, [role="button"]')) return;
    if (!bdayTapOnT(e)) { bday.taps = []; return; }
    var now = performance.now(); bday.taps = bday.taps.filter(function (x) { return now - x < 2500; }); bday.taps.push(now);
    if (bday.taps.length >= 5) { bday.taps = []; bdayPlay(); }
  }, true);
  function bdayLoad() { return import('./birthday.js'); }
  function bdayPlay() {
    if (bday.own || !running || !B || (mode !== 'title' && mode !== 'splash')) return Promise.resolve(false);
    return bdayLoad().then(function (m) { return m.play(bdayHooks()); }, function (e) { console.warn('birthday', e); return false; });
  }
  function bdayHooks() {
    return {
      THREE: THREE, B: B, renderer: renderer, host: host, mode: mode, FY: FY, C: C, STEP: STEP, TOPY: TOPY, STAGE: STAGE, KID_H: KID_H,
      cubeGeometry: cubeGeometry, buildAtlas: buildAtlas, neutralP: neutralP, fxOn: fxOn, calm: calmA11y, qLevel: qLevel, sfx: sfx, save: save,
      startConfetti: function () { startConfetti(); }, stepConfetti: function (now, dt) { return stepConfetti(now, dt); },
      // take the scene: the opening (if any) jumps to its end, the title's figures hide, the title stops drawing
      take: function (abort) {
        if (!B || bday.own) return false;
        if (intro) { var ik = intro.kind; intro.skipped = true; if (sfx()) sfx().cancel(); endIntroQuiet(); rest = true; try { if (typeof API.onIntroEnd === 'function') API.onIntroEnd(ik); } catch (e) {} }
        B.splashPush = null; B.confP = null; B.conf.visible = false; try { B.venue.dispose(); } catch (e) {}
        bday.own = true; bday.abort = abort || null; bday.mode = mode;
        if (raf) cancelAnimationFrame(raf); raf = 0; clearTimeout(wakeT); wakeT = 0;
        bday.vis = { kid: B.kid.model.root.visible, actors: B.actors.map(function (a) { return a.actor.root.visible; }) };
        B.kid.model.root.visible = false; B.actors.forEach(function (a) { a.actor.root.visible = false; });
        return true;
      },
      // give it back exactly as it was: figures, camera fit, a fresh picture, then still again
      give: function () {
        if (!bday.own) return;
        bday.own = false; bday.abort = null;
        if (!B) return;
        var v = bday.vis || { kid: true, actors: [] };
        B.kid.model.root.visible = v.kid; B.actors.forEach(function (a, i) { a.actor.root.visible = v.actors[i] !== false; a.hop = null; a.wave = null; a.armUp = 0; applyActor(a, performance.now()); });
        kidPose(B.kid, 'rest', 1, performance.now());
        B.confP = null; B.conf.visible = false; for (var i = 0; i < B.conf.count; i++) B.conf.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); B.conf.instanceMatrix.needsUpdate = true;
        camState = bday.mode === 'splash' ? { yaw: -4, pitch: -17, dist: 1.3, lift: 0 } : { yaw: 0, pitch: PITCH, dist: 1, lift: 0 };
        renderer.toneMappingExposure = bday.mode === 'splash' ? 0.78 : 1.0;
        sizeKey = ''; dirty = true; lastFrameT = 0; if (running) kick();
      }
    };
  }
  window.TataBirthday = { play: function () { return bdayPlay(); }, active: function () { return bday.own; } };

  var API = {
    ok: ok, show: show, screen: screen, skip: skip,
    relayout: function () { if (running) { sizeKey = ''; dirty = true; kick(); } },
    onIntroEnd: null,
    stats: function () {
      var info = renderer.info;
      return { mode: mode, running: running, built: !!B, intro: intro ? intro.kind : null, rest: rest, drift: !!drift, renders: stats.renders, builds: stats.builds, disposes: stats.disposes, buildMs: stats.buildMs,
        calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : null,
        quality: B ? LEVELS[B.qi].name : null, lowRes: !!(B && B.lowRes), pixelRatio: renderer.getPixelRatio(), cast: B ? B.cast : null, fit: fit ? { dist: +fit.dist.toFixed(1), free: fit.fr } : null };
    },
    _dispose: disposeScene, _frame: function (now) { frame(now); },
    // checks: draw the opening as it is t seconds in (the loop keeps going from there unless rAF is stubbed)
    _oneOff: function (k) { if (!B || !rest) return false; startOneOff(performance.now(), k); kick(); return true; },
    _restLife: false,
    _scene: function () { return B ? { scene: B.scene, camera: B.camera, renderer: renderer } : null; },
    _at: function (t) { if (!intro) return false; intro.t0 = performance.now() - t * 1000; frame(performance.now()); return true; }
  };
  window.Title3D = API;
  try { if (typeof window.titleSceneReady === 'function') window.titleSceneReady(); } catch (e) { console.warn(e); }
})();
