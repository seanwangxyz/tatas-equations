// Stadium theme: the table sits on a striped pitch in a stylised soccer ground.
// Raked stands with an instanced low-poly crowd, floodlights, goals with nets, corner flags,
// ad boards and a scoreboard. All static: nothing here animates at rest. The crowd "wave" and
// camera flashbulbs are one-shot effects driven by step(); they finish and stop asking for frames.
import * as THREE from 'three';
import { FLOOR_Y, softTexture } from './environment.js';
import { keyLight } from './arenas/common.js';

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function cvs(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctex(cv, aniso, rep) {
  var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso || 1;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function ease(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }

var PITCH = 100, PPU = 20.48; // pitch plane size in units, canvas pixels per unit

// o.cols (optional): [stripe A, stripe B, trackside] for other venues; o.size: canvas size (default 2048)
export function pitchTexture(aniso, o) {
  var S = o.size || 2048, c = cvs(S, S), g = c.getContext('2d'), R = rng(77), k = S / PITCH, cols = o.cols || ['#2f8a36', '#277a2d', '#25422a'];
  var band = 3.6, z0 = o.lineZ - 40; // stripes run parallel to the touchline
  for (var i = 0; i < 40; i++) { var z = z0 + i * band; g.fillStyle = i % 2 ? cols[0] : cols[1]; g.fillRect(0, (z + 50) * k, S, band * k + 1); }
  for (var n = 0; n < 9000; n++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; g.fillRect(R() * S, R() * S, 2, 2); }
  // everything behind the touchline is plain trackside
  g.fillStyle = cols[2]; g.fillRect(0, 0, S, (o.lineZ + 50) * k);
  g.strokeStyle = 'rgba(255,255,255,.88)'; g.lineWidth = 0.22 * k; g.lineCap = 'butt';
  var X = function (x) { return (x + 50) * k; }, Z = function (z) { return (z + 50) * k; };
  g.beginPath(); g.moveTo(X(-o.gx), Z(o.lineZ)); g.lineTo(X(o.gx), Z(o.lineZ)); g.stroke(); // touchline
  if (o.goals) {
    g.beginPath(); g.moveTo(X(-o.gx), Z(o.lineZ)); g.lineTo(X(-o.gx), Z(o.lineZ + 40)); g.moveTo(X(o.gx), Z(o.lineZ)); g.lineTo(X(o.gx), Z(o.lineZ + 40)); g.stroke(); // goal lines
    [-1, 1].forEach(function (s) { // goal area and penalty box
      g.strokeRect(s < 0 ? X(-o.gx) : X(o.gx - 3.2), Z(o.goalZ - 4.2), 3.2 * k, 8.4 * k);
      g.strokeRect(s < 0 ? X(-o.gx) : X(o.gx - 7), Z(o.goalZ - 7.5), 7 * k, 15 * k);
    });
    g.beginPath(); g.arc(X(0), Z(o.goalZ + 14), 5 * k, 0, 6.2832); g.stroke(); // centre circle (partly under the table)
  }
  // corner arcs at the two back corners
  [[-o.gx, 0], [o.gx, 1]].forEach(function (p) { g.beginPath(); g.arc(X(p[0]), Z(o.lineZ), 1.1 * k, p[1] ? Math.PI * 0.5 : 0, p[1] ? Math.PI : Math.PI * 0.5); g.stroke(); });
  return ctex(c, aniso);
}

function adTexture(aniso) {
  var c = cvs(2048, 64), g = c.getContext('2d'), words = ['TATA', 'MATH', 'GOAL!', 'EQUATIONS', 'SOCCER', 'MATH', 'TATA', 'GOAL!'], cols = ['#e03131', '#1c7ed6', '#f08c00', '#2f9e44', '#7048e8', '#1c7ed6', '#e03131', '#f08c00'];
  for (var i = 0; i < 8; i++) {
    g.fillStyle = cols[i]; g.fillRect(i * 256, 0, 256, 64); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(i * 256, 0, 256, 8);
    g.font = '900 40px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(words[i], i * 256 + 128, 35);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * 256, 0, 3, 64);
  }
  return ctex(c, aniso);
}
function netTexture() {
  var c = cvs(128, 128), g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
  for (var i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  var t = ctex(c, 4, [1, 1]); t.anisotropy = 4; return t;
}
function flashTexture() {
  var c = cvs(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(31, 4, 2, 56); g.fillRect(4, 31, 56, 2);
  return ctex(c, 1);
}

// Night: floodlit pool of light on the pitch, brightest round the table, fading toward the stands
function lightPool() {
  var c = cvs(128, 128), g = c.getContext('2d');
  g.fillStyle = '#05070c'; g.fillRect(0, 0, 128, 128);
  var gr = g.createRadialGradient(64, 66, 4, 64, 66, 30); // 100-unit plane: 30px is about 23 units
  gr.addColorStop(0, '#e8efff'); gr.addColorStop(0.55, '#8e9bb8'); gr.addColorStop(1, 'rgba(5,7,12,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function stdm(color, rough, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: rough == null ? 0.8 : rough, flatShading: true }, extra || {})); }

// Draws text on the big scoreboard
function paintBoard(cv, text) {
  var g = cv.getContext('2d'), w = cv.width, h = cv.height;
  var bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0b1a45'); bg.addColorStop(1, '#050b24'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.035)'; for (var y = 0; y < h; y += 6) g.fillRect(0, y, w, 2); // LED rows
  var hb = Math.round(h * 0.17); g.fillStyle = '#12306e'; g.fillRect(0, 0, w, hb);
  g.font = '800 ' + Math.round(hb * 0.55) + 'px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#8fd3ff'; g.fillText("⚽  TATA'S EQUATIONS  ⚽", w / 2, hb / 2 + 2);
  var lines = String(text == null || text === '' ? 'LET’S PLAY!' : text).split('\n').slice(0, 3), avail = h - hb - 24, lh, size = Math.min(210, Math.floor(avail / lines.length / 1.05));
  g.textBaseline = 'middle';
  for (;;) {
    g.font = '900 ' + size + 'px "Trebuchet MS", "Segoe UI", sans-serif';
    var mx = 0; lines.forEach(function (l) { mx = Math.max(mx, g.measureText(l).width); });
    if (mx < w - 110 || size < 26) break; size -= 6;
  }
  lh = size * 1.05; var top = hb + (h - hb) / 2 - (lines.length - 1) * lh / 2;
  g.shadowColor = '#ffb000'; g.shadowBlur = 22; g.fillStyle = '#ffd43b';
  lines.forEach(function (l, i) { g.fillText(l, w / 2, top + i * lh); });
  g.shadowBlur = 0; g.strokeStyle = '#2b4a9a'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
}

// opts.night: the same ground under floodlights (darker sky, lit pitch, crowd in shadow, beams, a key light).
export function buildStadium(W, D, aniso, layoutName, quality, opts) {
  var g = new THREE.Group(), R = rng(2024), tall = layoutName === 'tall', FY = FLOOR_Y, night = !!(opts && opts.night);
  var rows = tall ? 8 : 9, rowD = 1.15, rise = 0.6;
  var lineZ = -D / 2 - (tall ? 2.0 : 3.4);
  var sideGap = tall ? 2.5 : 8.2, standX = W / 2 + sideGap;
  var gx = standX - (tall ? 0.6 : 1.2), goals = !tall, goalZ = -1.5;
  var z0 = lineZ - 2.4; // where the back stand starts
  var backL = tall ? W + 16 : W + 30;
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: night ? 0x0d2614 : 0x1d4d25, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = FY - 0.04; g.add(floor);
  var pitchMap = pitchTexture(aniso, { lineZ: lineZ, gx: gx, goals: goals, goalZ: goalZ });
  // at night the pitch glows a little by itself (the floodlights), so it reads brighter than the stands
  var pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH, PITCH), new THREE.MeshStandardMaterial(night ? { map: pitchMap, color: 0x3c3c40, lightMap: lightPool(), lightMapIntensity: 7, roughness: 0.95 } : { map: pitchMap, roughness: 0.95 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = FY; pitch.receiveShadow = true; g.add(pitch);

  // ----- Stands -----
  var profile = new THREE.Shape(); profile.moveTo(0, 0);
  for (var i = 0; i < rows; i++) { profile.lineTo(i * rowD, (i + 1) * rise); profile.lineTo((i + 1) * rowD, (i + 1) * rise); }
  profile.lineTo(rows * rowD, 0); profile.lineTo(0, 0);
  var concrete = stdm(night ? 0x3a4152 : 0x7d8798, 0.9), seats = [];
  function stand(theta, px, pz, len, team) { // outward = local +x; extruded length = local +z
    var geo = new THREE.ExtrudeGeometry(profile, { depth: len, bevelEnabled: false }), m = new THREE.Mesh(geo, concrete);
    m.rotation.y = theta; m.position.set(px, FY, pz); m.updateMatrix(); g.add(m);
    seats.push({ m: m.matrix.clone(), len: len, team: team });
  }
  stand(Math.PI / 2, -backL / 2, z0, backL, 'back');
  var sideZ0 = z0 + 1, sideZ1 = D / 2 + (tall ? 5 : 7);
  stand(Math.PI, -standX, sideZ1, sideZ1 - sideZ0, 'left');
  stand(0, standX, sideZ0, sideZ1 - sideZ0, 'right');

  // ----- Crowd (two instanced meshes: bodies and heads) -----
  var reds = ['#e03131', '#e03131', '#e03131', '#e03131', '#e03131', '#c92a2a', '#ffffff', '#ffffff', '#ffd43b'], blues = ['#1c7ed6', '#1c7ed6', '#1c7ed6', '#1c7ed6', '#1971c2', '#1971c2', '#ffffff', '#ffffff', '#ffd43b'];
  var skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a9714b'], pts = [], v = new THREE.Vector3(), tmpc = new THREE.Color();
  seats.forEach(function (s) {
    for (var r = 0; r < rows; r++) {
      var step = 0.62, cnt = Math.floor((s.len - 1.2) / step);
      for (var k = 0; k < cnt; k++) {
        if (R() < 0.05) continue;
        var u = r * rowD + rowD * 0.55 + (R() - 0.5) * 0.12, sv = 0.6 + k * step + (R() - 0.5) * 0.12, y = (r + 1) * rise;
        v.set(u, y, sv).applyMatrix4(s.m);
        var left = s.team === 'left' ? true : s.team === 'right' ? false : v.x < 0;
        if (R() < 0.12) left = !left;
        pts.push({ x: v.x, y: v.y, z: v.z, body: (left ? reds : blues)[Math.floor(R() * 9)], head: skins[Math.floor(R() * 6)], sc: 0.9 + R() * 0.25 });
      }
    }
  });
  // leave a hole in the back stand where the scoreboard hangs (its rows are hidden behind it anyway)
  var boardW = tall ? 5.6 : 10.5, boardH = tall ? 2.5 : 3.4, boardX = tall ? -6.0 : 9.4;
  var bx0 = boardX - boardW / 2 - 0.3, bx1 = boardX + boardW / 2 + 0.3, bzA = z0 - 1.0 * rowD, boardY0 = FY + 1.2;
  pts = pts.filter(function (p) { return !(p.x > bx0 && p.x < bx1 && p.z < bzA - 0.2 && p.y < boardY0 + boardH + 0.4); });
  var N = pts.length, bodyGeo = new THREE.BoxGeometry(0.46, 0.5, 0.34).translate(0, 0.27, 0), headGeo = new THREE.IcosahedronGeometry(0.19, 0).translate(0, 0.74, 0);
  var bodies = new THREE.InstancedMesh(bodyGeo, stdm(0xffffff, 0.85), N), heads = new THREE.InstancedMesh(headGeo, stdm(0xffffff, 0.8), N), mt = new THREE.Matrix4();
  bodies.frustumCulled = heads.frustumCulled = false;
  pts.forEach(function (p, i) {
    mt.makeScale(p.sc, p.sc, p.sc).setPosition(p.x, p.y, p.z); bodies.setMatrixAt(i, mt); heads.setMatrixAt(i, mt);
    bodies.setColorAt(i, night ? tmpc.set(p.body).multiplyScalar(0.3) : tmpc.set(p.body)); heads.setColorAt(i, night ? tmpc.set(p.head).multiplyScalar(0.3) : tmpc.set(p.head));
  });
  g.add(bodies); g.add(heads);
  var baseY = new Float32Array(N), key = new Float32Array(N);
  pts.forEach(function (p, i) { baseY[i] = p.y; var th = Math.atan2(p.x, -(p.z - D / 2)); key[i] = (th + 1.75) / 3.5; }); // 0..1 from the left side, round the back, to the right

  // ----- Ad boards along the touchline, trackside -----
  var adT = adTexture(aniso), adLen = backL - 6; adT.wrapS = THREE.RepeatWrapping; adT.repeat.set(adLen / 16, 1);
  var ads = new THREE.Mesh(new THREE.BoxGeometry(adLen, 0.9, 0.22), new THREE.MeshBasicMaterial({ map: adT, toneMapped: false })); ads.position.set(0, FY + 0.45, lineZ - 1.0); g.add(ads);

  // ----- Scoreboard (jumbotron) -----
  var bcv = cvs(1024, Math.round(1024 * boardH / boardW)), btex = ctex(bcv, aniso); paintBoard(bcv, '');
  var board = new THREE.Group(); board.position.set(boardX, boardY0 + boardH / 2, bzA); board.rotation.x = -0.32; g.add(board);
  var casing = new THREE.Mesh(new THREE.BoxGeometry(boardW + 0.7, boardH + 0.7, 0.5), stdm(0x1b2233, 0.5, { flatShading: false })); casing.position.z = -0.3; board.add(casing);
  var screen = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), new THREE.MeshBasicMaterial({ map: btex, toneMapped: false, fog: false })); screen.position.z = 0.0; board.add(screen);
  var glowB = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: 0x4aa8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glowB.scale.set(boardW * 1.5, boardH * 1.7, 1); glowB.position.z = 0.2; board.add(glowB);
  [-1, 1].forEach(function (s) { var pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.5), stdm(0x2a3144, 0.6)); pole.position.set(s * boardW * 0.38, -boardH / 2 - 1.2, -0.5); pole.rotation.x = 0.32; board.add(pole); });

  // ----- Floodlight towers (static lamps and soft glows) -----
  var lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }), glowTex = softTexture();
  function tower(x, z) {
    var h = 15;
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, h, 8), stdm(0x4a5266, 0.5)); pole.position.set(x, FY + h / 2, z); g.add(pole);
    var head = new THREE.Group(); head.position.set(x, FY + h + 1, z); head.lookAt(0, FY + 3, 0); g.add(head);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.0, 0.4), stdm(0x2a3144, 0.5)); head.add(frame);
    for (var a = 0; a < 3; a++) for (var b = 0; b < 4; b++) { var l = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.12), lampMat); l.position.set(-1.5 + b * 1.0, -0.9 + a * 0.9, 0.26); head.add(l); }
    var gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xdfeaff, transparent: true, opacity: night ? 0.9 : 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); gl.scale.set(night ? 24 : 15, night ? 24 : 15, 1); gl.position.set(x, FY + h + 1, z); g.add(gl);
    if (night) { // a faint, static beam from the lamp head down to the pitch
      var top = new THREE.Vector3(x, FY + h + 1, z), aim = new THREE.Vector3(x * 0.25, FY, z * 0.25 + 1), len = top.distanceTo(aim);
      var beam = new THREE.Mesh(beamGeo, beamMat); beam.scale.set(1, len, 1); beam.position.copy(top).add(aim).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim.clone().sub(top).normalize()); beam.renderOrder = 3; g.add(beam);
    }
  }
  var beamGeo = null, beamMat = null;
  if (night) {
    var bc = cvs(4, 64), bg2 = bc.getContext('2d'), bgr = bg2.createLinearGradient(0, 0, 0, 64);
    bgr.addColorStop(0, 'rgba(225,235,255,.55)'); bgr.addColorStop(1, 'rgba(225,235,255,0)'); bg2.fillStyle = bgr; bg2.fillRect(0, 0, 4, 64);
    beamGeo = new THREE.CylinderGeometry(0.9, 5.5, 1, 20, 1, true);
    beamMat = new THREE.MeshBasicMaterial({ map: ctex(bc, 1), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
  }
  var tx = backL / 2 + 1.5, tz = z0 - rows * rowD - 1.5;
  tower(-tx, tz); tower(tx, tz); tower(-standX - rows * rowD - 1.5, D / 2 + 4); tower(standX + rows * rowD + 1.5, D / 2 + 4);

  // ----- Corner flags -----
  var poleM = stdm(0xf8f9fa, 0.5), flagM = new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.7, side: THREE.DoubleSide });
  [-1, 1].forEach(function (s) {
    var x = s * gx, pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), poleM); pole.position.set(x, FY + 1.2, lineZ); g.add(pole);
    var fl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.55), flagM); fl.position.set(x - s * 0.4, FY + 2.1, lineZ); g.add(fl);
  });

  // ----- Goals with nets (wide layout only: tall has no room) -----
  if (goals) {
    var netT = netTexture(), postM = stdm(0xffffff, 0.35, { flatShading: false }), gw = 7, gh = 2.5, gd = 2.4;
    [-1, 1].forEach(function (s) {
      var gg = new THREE.Group(), x = s * gx, front = -s; // the mouth faces the table (toward the centre)
      gg.position.set(x, FY, goalZ);
      function bar(w, h, d, px, py, pz) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), postM); b.position.set(px, py, pz); gg.add(b); }
      bar(0.14, gh, 0.14, 0, gh / 2, -gw / 2); bar(0.14, gh, 0.14, 0, gh / 2, gw / 2); bar(0.14, 0.14, gw + 0.14, 0, gh, 0);
      var back = -front * gd; // goal depth runs away from the table
      function net(w, h, px, py, pz, rx, ry, reps) {
        var t = netT.clone(); t.needsUpdate = true; t.repeat.set(reps[0], reps[1]);
        var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, fog: true }));
        m.position.set(px, py, pz); m.rotation.set(rx, ry, 0); gg.add(m);
      }
      net(gw, gh, back, gh / 2, 0, 0, Math.PI / 2, [gw / 0.35, gh / 0.35]);
      net(gd, gh, back / 2, gh / 2, -gw / 2, 0, 0, [gd / 0.35, gh / 0.35]); net(gd, gh, back / 2, gh / 2, gw / 2, 0, 0, [gd / 0.35, gh / 0.35]);
      net(gd, gw, back / 2, gh, 0, Math.PI / 2, 0, [gd / 0.35, gw / 0.35]);
      bar(Math.abs(back), 0.08, 0.08, back / 2, gh, -gw / 2); bar(Math.abs(back), 0.08, 0.08, back / 2, gh, gw / 2);
      g.add(gg);
    });
  }

  // ----- Camera flashbulbs: pooled sprites, used once per 'flash' -----
  var fT = flashTexture(), flashes = [], FN = 28;
  for (var q = 0; q < FN; q++) { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fT, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.visible = false; sp.renderOrder = 4; g.add(sp); flashes.push({ sp: sp, t0: 0, dur: 0 }); }

  // ----- One-shot effects: wave and flashbulbs -----
  // night: the main light comes from the front-left floodlight tower (key light for the stage agent's shadows)
  var keyL = null; // (not "key": that name is the crowd-wave array above)
  if (night) { keyL = keyLight(0xeef3ff, 1.35, -standX - rows * rowD - 1.5, FY + 30, D / 2 + 9, W, D); g.add(keyL); }

  var waveS = null, flashing = false;
  function setWave(t) { // t in 0..1 along the stands
    var ya = bodies.instanceMatrix.array, yb = heads.instanceMatrix.array, f = t * 1.5 - 0.25, wd = 0.15;
    for (var i = 0; i < N; i++) {
      var d = (key[i] - f) / wd, up = d > -1 && d < 1 ? 0.5 * (1 + Math.cos(Math.PI * d)) : 0, y = baseY[i] + 0.9 * up;
      ya[i * 16 + 13] = y; yb[i * 16 + 13] = y;
    }
    bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
  }
  var api = {
    group: g, legs: true, key: keyL,
    setBoard: function (text) { paintBoard(bcv, text); btex.needsUpdate = true; },
    wave: function () { if (document.hidden || quality() < 1) return false; waveS = { t0: performance.now(), dur: 1700 }; return true; },
    flash: function () {
      if (document.hidden) return false;
      var q = quality(), n = q >= 2 ? FN : q === 1 ? 14 : 6, now = performance.now();
      for (var i = 0; i < FN; i++) {
        var f = flashes[i]; if (i >= n) { f.dur = 0; continue; }
        var p = pts[Math.floor(R() * N)]; f.sp.position.set(p.x, p.y + 1.1, p.z); f.t0 = now + R() * 1300; f.dur = 200 + R() * 120; f.sp.visible = false; f.sp.material.opacity = 0;
        f.sc = 1.6 + R() * 1.4;
      }
      flashing = true; return true;
    },
    step: function (now) { // returns true while something is still moving
      var busy = false;
      if (waveS) {
        var k = (now - waveS.t0) / waveS.dur;
        if (k >= 1) { setWave(-1); waveS = null; } else { setWave(k); busy = true; }
      }
      if (flashing) {
        var live = false;
        for (var i = 0; i < FN; i++) {
          var f = flashes[i]; if (!f.dur) continue;
          var kk = (now - f.t0) / f.dur;
          if (kk < 0) { live = true; continue; }
          if (kk >= 1) { f.sp.visible = false; f.sp.material.opacity = 0; f.dur = 0; continue; }
          live = true; var a = kk < 0.2 ? kk / 0.2 : 1 - (kk - 0.2) / 0.8; f.sp.visible = true; f.sp.material.opacity = a; f.sp.scale.setScalar(f.sc * (0.5 + a));
        }
        if (!live) flashing = false; else busy = true;
      }
      return busy;
    },
    dispose: function () { waveS = null; flashing = false; }
  };
  return api;
}
