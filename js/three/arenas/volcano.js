// Volcano venue: the Monster League's home ground. A green pitch inside a friendly cartoon crater:
// a glowing lava stream around the pitch, rock terraces packed with cheerful little monsters,
// monster banners on the crater wall, puffy clouds on the rim and a stone scoreboard.
// Warm and fun, never scary. All static at rest; the crowd reactions and the sparkles are one-shot.
import * as THREE from 'three';
import { rng, cvs, ctex, stdm, softTex, mergeGeos, mtx, sweep, uPath, alongPath, makeBoard, makeBlockCrowd, HEAD_TOP, venueApi, keyLight, venueLayout } from './common.js';
import { pitchTexture } from '../stadium.js';

var BOARD = { bg0: '#2b1250', bg1: '#170833', rows: 'rgba(255,255,255,.04)', head: '#ff7a1a', headText: '#fff1d6', title: '🌋  MONSTER LEAGUE  🌋', text: '#ffe066', glow: '#ff6a00', edge: '#7a4b2a' };
var MONSTER = ['#94d82d', '#9775fa', '#ff922b', '#22b8cf', '#f783ac', '#ffd43b', '#4dabf7', '#69db7c', '#e599f7'];

function lavaTexture() {
  var c = cvs(256, 64), g = c.getContext('2d'), R = rng(31), gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, '#ff6a00'); gr.addColorStop(0.5, '#ffb000'); gr.addColorStop(1, '#ff6a00');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
  for (var i = 0; i < 26; i++) { g.fillStyle = 'rgba(214,72,10,.55)'; g.beginPath(); g.ellipse(R() * 256, R() * 64, 6 + R() * 16, 2 + R() * 5, R() * 3, 0, 6.28); g.fill(); } // soft crust patches
  for (var k = 0; k < 18; k++) { var x = R() * 256, y = 8 + R() * 48, r = 2 + R() * 4; g.fillStyle = 'rgba(255,240,150,.9)'; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, 6.28); g.fill(); } // bubbles
  var t = ctex(c, 4); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function rockTexture(aniso, base) {
  var c = cvs(256, 256), g = c.getContext('2d'), R = rng(44);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (var i = 0; i < 40; i++) { var x = R() * 256, y = R() * 256, r = 10 + R() * 30, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, R() < 0.5 ? 'rgba(255,220,200,.10)' : 'rgba(30,10,30,.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (var k = 0; k < 3000; k++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.09)'; g.fillRect(R() * 256, R() * 256, 2, 2); }
  return ctex(c, aniso, [1, 1]);
}
// Six hanging banners in one atlas: friendly monster faces, a paw print and cheers
function bannerAtlas() {
  var c = cvs(768, 256), g = c.getContext('2d');
  var bgs = ['#7048e8', '#f76707', '#0ca678', '#d6336c', '#1c7ed6', '#f59f00'];
  function face(cx, cy, col, eyes) {
    g.fillStyle = col; g.beginPath(); g.arc(cx, cy, 40, 0, 6.28); g.fill();
    g.fillStyle = col; g.beginPath(); g.moveTo(cx - 30, cy - 26); g.lineTo(cx - 22, cy - 56); g.lineTo(cx - 10, cy - 34); g.fill(); g.beginPath(); g.moveTo(cx + 30, cy - 26); g.lineTo(cx + 22, cy - 56); g.lineTo(cx + 10, cy - 34); g.fill(); // little horns
    for (var e = 0; e < eyes; e++) { var ex = cx + (eyes === 1 ? 0 : (e ? 14 : -14)); g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, cy - 8, eyes === 1 ? 15 : 10, 0, 6.28); g.fill(); g.fillStyle = '#212529'; g.beginPath(); g.arc(ex + 2, cy - 6, eyes === 1 ? 7 : 5, 0, 6.28); g.fill(); }
    g.strokeStyle = '#212529'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy + 8, 16, 0.2, Math.PI - 0.2); g.stroke(); // big smile
    g.fillStyle = '#fff'; g.fillRect(cx - 6, cy + 22, 6, 6); // one goofy tooth
  }
  function text(t, x, y, size) { g.font = '900 ' + size + 'px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeText(t, x, y); g.fillStyle = '#fff'; g.fillText(t, x, y); }
  for (var i = 0; i < 6; i++) {
    var x0 = i * 128, cx = x0 + 64;
    g.fillStyle = bgs[i]; g.beginPath(); g.moveTo(x0 + 6, 0); g.lineTo(x0 + 122, 0); g.lineTo(x0 + 122, 226); g.lineTo(cx, 252); g.lineTo(x0 + 6, 226); g.closePath(); g.fill(); // pennant tail
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x0 + 6, 0, 116, 14);
    if (i === 0) { face(cx, 100, '#94d82d', 2); text('ROAR!', cx, 190, 30); }
    else if (i === 1) { text('GO', cx, 60, 44); text('MON-', cx, 120, 34); text('STERS', cx, 160, 30); text('!', cx, 205, 40); }
    else if (i === 2) { face(cx, 100, '#ffd43b', 1); text('GOAL!', cx, 190, 30); }
    else if (i === 3) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx, 120, 26, 22, 0, 0, 6.28); g.fill(); [[-26, -30], [-9, -44], [9, -44], [26, -30]].forEach(function (p) { g.beginPath(); g.ellipse(cx + p[0], 120 + p[1], 9, 12, 0, 0, 6.28); g.fill(); }); text('STOMP', cx, 190, 26); }
    else if (i === 4) { face(cx, 100, '#e599f7', 2); text('YAY!', cx, 190, 32); }
    else { text('★', cx, 70, 60); text('MATH', cx, 140, 30); text('MONSTERS', cx, 180, 19); }
  }
  return ctex(c, 4);
}
// Block-monster face for the cube head (neck pivot at y 0; the head's front face is at z 0.17): two big
// eyes (white with dark pupils) and a little smile, as flat discs just in front of the face. Vertex coloured,
// about 40 triangles: hundreds of monsters must stay cheap on an iPad.
function faceGeometry() {
  var parts = [], zf = 0.172;
  [-1, 1].forEach(function (s) {
    parts.push({ geo: new THREE.CircleGeometry(0.07, 8), color: 0xffffff, m: mtx(s * 0.08, 0.22, zf) });
    parts.push({ geo: new THREE.CircleGeometry(0.035, 6), color: 0x1b1b2a, m: mtx(s * 0.08, 0.21, zf + 0.004) });
  });
  parts.push({ geo: new THREE.RingGeometry(0.035, 0.055, 6, 1, Math.PI * 1.1, Math.PI * 0.8), color: 0x1b1b2a, m: mtx(0, 0.12, zf + 0.002) });
  return mergeGeos(parts.map(function (p) { p.geo.deleteAttribute('uv'); return p; }));
}
// two little horns on top of the cube head
function hornGeometry() {
  return mergeGeos([-1, 1].map(function (s) { var gg = new THREE.ConeGeometry(0.055, 0.18, 6); gg.deleteAttribute('uv'); return { geo: gg, color: 0xffffff, m: mtx(s * 0.11, HEAD_TOP + 0.07, 0, 0, 0, -s * 0.35) }; }));
}
function lighter(css, k) { return '#' + new THREE.Color(css).lerp(new THREE.Color(0xffffff), k).getHexString(); }

export function buildVolcano(W, D, aniso, layoutName, quality, FY) {
  var g = new THREE.Group(), R = rng(1313), L = venueLayout(W, D, layoutName), tall = L.tall, lineZ = L.lineZ;
  var hx = W / 2 + (tall ? 2.0 : 3.0), zb = lineZ - (tall ? 1.0 : 1.3), cr = tall ? 2.5 : 3.0, zf = D / 2 + 8;
  var rows = tall ? 5 : 6, rowD = 1.1, rise = 0.55, TW = rows * rowD, TH = rows * rise;
  var path = uPath(hx, zb, cr, zf, 1.0);

  // ----- Ground: a green pitch on the crater floor, warm rock beyond -----
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial({ color: 0x4a3046, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = FY - 0.04; g.add(floor);
  var pitch = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ map: pitchTexture(aniso, { lineZ: lineZ + 0.3, gx: hx - 0.6, goals: false, cols: ['#3f9446', '#36833b', '#4a3046'], size: 1024 }), roughness: 0.95 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = FY; pitch.receiveShadow = true; g.add(pitch);

  // ----- Lava stream between the pitch and the terraces (glows by itself; stage may add bloom) -----
  var lava = new THREE.Mesh(sweep([[-1.55, 0.06], [-0.05, 0.06]], path, 3.0), new THREE.MeshBasicMaterial({ map: lavaTexture(), toneMapped: false, side: THREE.DoubleSide }));
  lava.position.y = FY; g.add(lava);
  var rockM = new THREE.MeshStandardMaterial({ map: rockTexture(aniso, '#8c6a80'), roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  var curb = new THREE.Mesh(sweep([[-1.95, 0], [-1.85, 0.3], [-1.6, 0.34], [-1.5, 0.06]], path), rockM);
  curb.position.y = FY; curb.receiveShadow = true; g.add(curb);
  var haze = softTex();
  [[-hx * 0.6, zb - 0.8], [hx * 0.15, zb - 0.8], [-hx - cr * 0.7 - 0.8, zb + cr * 0.3], [hx + cr * 0.7 + 0.8, zb + cr * 0.3], [-hx - cr - 0.8, 0], [hx + cr + 0.8, 0]].forEach(function (p) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haze, color: 0xff8a2a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.set(6, 2.4, 1); s.position.set(p[0], FY + 0.6, p[1]); g.add(s);
  });

  // ----- Rock terraces and the crater wall, swept along the U -----
  var prof = [[0, 0]];
  for (var i = 0; i < rows; i++) { prof.push([i * rowD, (i + 1) * rise], [(i + 1) * rowD, (i + 1) * rise]); }
  prof.push([TW + 0.4, TH + 1.1], [TW + 1.1, TH + 2.9], [TW + 1.7, TH + 4.2], [TW + 2.3, TH + 4.5], [TW + 4.5, TH + 3.0], [TW + 9, 0]);
  var terr = new THREE.Mesh(sweep(prof, path), rockM); terr.position.y = FY; terr.receiveShadow = true; terr.castShadow = true; g.add(terr);
  var rimY = FY + TH + 4.5, rimU = TW + 2.3;

  // ----- Scoreboard: a stone frame with a glowing screen, sitting on the back terraces -----
  var bw = L.boardW, bh = L.boardH, bx = L.boardX, bzA = zb - 1.0 * rowD, by0 = FY + 1.2;
  var board = makeBoard({ w: bw, h: bh, pal: BOARD, aniso: aniso, casing: new THREE.MeshStandardMaterial({ map: rockTexture(aniso, '#5c4a6b'), roughness: 0.85, flatShading: true }), glow: 0xff9a3c });
  board.group.position.set(bx, by0 + bh / 2, bzA); board.group.rotation.x = -0.3; g.add(board.group);
  [-1, 1].forEach(function (s) { var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 3.0, 6), rockM); pole.position.set(bx + s * bw * 0.38, FY + 1.0, bzA - 0.5); g.add(pole); });

  // ----- Monster crowd: bodies, faces, and horns on about half of them -----
  var pts = [];
  for (var r = 0; r < rows; r++) {
    var u = r * rowD + rowD * 0.55, seats = alongPath(path, 0.8, 0.12, R);
    seats.forEach(function (s) {
      if (R() < 0.06) return;
      var x = s.x + s.nx * u, z = s.z + s.nz * u, y = FY + (r + 1) * rise;
      if (z > zf - 1.5) return;
      if (x > bx - bw / 2 - 0.4 && x < bx + bw / 2 + 0.4 && z < bzA + 0.2 && z > zb - TW - 0.5 && y < by0 + bh + 0.4) return; // hidden behind the scoreboard
      var col = MONSTER[Math.floor(R() * MONSTER.length)];
      pts.push({ x: x, y: y, z: z, ry: Math.atan2(-s.nx, -s.nz) + (R() - 0.5) * 0.4, sc: 1.0 + R() * 0.3, shirt: col, skin: lighter(col, 0.18), hair: null, face: 1, horn: R() < 0.5 ? (R() < 0.6 ? '#fff4e6' : '#ffd8a8') : null, key: s.t });
    });
  }
  // block monsters: a cube head (lighter than the body) with a cartoon face, horns on about half of them
  var crowd = makeBlockCrowd(g, pts, { quality: quality, eyes: false, armCol: 'shirt', extras: [
    { geo: faceGeometry(), mat: stdm(0xffffff, 0.5, { vertexColors: true, flatShading: false, side: THREE.DoubleSide }), has: 'face', col: null },
    { geo: hornGeometry(), mat: stdm(0xffffff, 0.6, { vertexColors: true }), has: 'horn', col: 'horn' }
  ] });
  pts = crowd.pts;

  // ----- Banners hanging on the crater wall (one merged mesh using the atlas) -----
  // the lower wall runs from (TW+0.4, TH+1.1) to (TW+1.1, TH+2.9): lean the banners back with it, just in front of it
  var banParts = [], wallU = TW + 0.5, wallY = FY + TH + 2.15, wallTilt = Math.atan2(0.7, 1.8), bannerAt = alongPath(path, tall ? 3.6 : 4.2, 0, R);
  bannerAt.forEach(function (s, i) {
    if (s.z > 2) return; // only around the back half, where the camera can see them
    var geo = new THREE.PlaneGeometry(1.3, 2.1), uv = geo.attributes.uv, slot = i % 6;
    for (var k = 0; k < uv.count; k++) uv.setX(k, (slot + uv.getX(k)) / 6);
    var ry = Math.atan2(-s.nx, -s.nz), m = new THREE.Matrix4().makeRotationY(ry).multiply(new THREE.Matrix4().makeRotationX(-wallTilt));
    m.setPosition(s.x + s.nx * wallU, wallY, s.z + s.nz * wallU);
    banParts.push({ geo: geo, m: m });
  });
  if (banParts.length) {
    var banners = new THREE.Mesh(mergeGeos(banParts), new THREE.MeshStandardMaterial({ map: bannerAtlas(), roughness: 0.8, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.12, emissiveMap: null }));
    banners.material.emissiveMap = banners.material.map; g.add(banners);
  }

  // ----- Rim: chunky rounded rocks, glowing crystals, and two puffy clouds -----
  var rimPts = alongPath(path, 1.6, 0.4, R).filter(function (s) { return s.z < zf - 2; });
  var rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.9, 0), rockM, rimPts.length);
  rimPts.forEach(function (s, i) { rocks.setMatrixAt(i, mtx(s.x + s.nx * (rimU + (R() - 0.5) * 0.6), rimY + 0.1 + R() * 0.3, s.z + s.nz * (rimU + (R() - 0.5) * 0.6), R() * 3, R() * 3, R() * 3, 0.8 + R() * 0.7, 0.6 + R() * 0.5, 0.8 + R() * 0.7)); });
  rocks.castShadow = true; rocks.frustumCulled = false; g.add(rocks);
  var cry = [], cryCols = [0x63e6be, 0xf783ac, 0x74c0fc, 0xffe066];
  function crystal(x, y, z, s, col) { for (var c = 0; c < 3; c++) { var gg = new THREE.OctahedronGeometry(0.5, 0); gg.deleteAttribute('uv'); cry.push({ geo: gg, color: col, m: mtx(x + (c - 1) * 0.42 * s, y + 0.45 * s, z + (c % 2) * 0.25 * s, 0, R() * 3, (c - 1) * 0.3, s, (1.2 + R() * 0.5) * s, s) }); } }
  // a few crystal clusters on the rim, between the banners
  alongPath(path, tall ? 7 : 8.4, 0, R).forEach(function (s, i) { if (s.z < zf - 3) crystal(s.x + s.nx * (rimU - 0.4), rimY - 0.1, s.z + s.nz * (rimU - 0.4), 1.0, cryCols[i % 4]); });
  [[-hx - cr - 1.2, -1.5], [hx + cr + 1.2, 1.5], [-hx - cr - 1.0, 4.5]].forEach(function (p, i) { crystal(p[0], FY - 0.2, p[1], 0.8, cryCols[(i + 1) % 4]); });
  var crystals = new THREE.Mesh(mergeGeos(cry), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.0 }));
  crystals.material.onBeforeCompile = function (sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 0.45;'); }; // crystals glow in their own colour
  g.add(crystals);
  var cloudParts = [], cloudAt = [[-hx * 0.55, zb - rimU - 0.6, 1.0], [hx * 0.7, zb - rimU - 0.4, 0.8]];
  cloudAt.forEach(function (c) { [[0, 0, 1.3], [1.2, -0.2, 1.0], [-1.1, -0.3, 0.95], [0.5, 0.9, 0.9], [-0.4, 0.7, 0.8]].forEach(function (b) { var gg = new THREE.IcosahedronGeometry(b[2] * c[2], 1); gg.deleteAttribute('uv'); cloudParts.push({ geo: gg, color: 0xf3e8ff, m: mtx(c[0] + b[0] * c[2], rimY + 2.3 + b[1] * c[2], c[1] + (b[0] * 0.2)) }); }); });
  var clouds = new THREE.Mesh(mergeGeos(cloudParts), stdm(0xffffff, 0.95, { vertexColors: true, emissive: 0x3a1a2a, fog: false }));
  g.add(clouds);

  // ----- Warm key light from in front (the table must stay crisp; the lava adds warm fill from THEMES) -----
  var key = keyLight(0xffeedd, 1.2, 9, FY + 34, 15, W, D); g.add(key);

  return venueApi({ group: g, crowd: crowd, pts: pts, quality: quality, setBoard: board.setBoard, flashColor: 0xffd27a, flashN: 22, key: key });
}
