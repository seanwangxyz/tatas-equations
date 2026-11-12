// Beach venue: a sunny beach-soccer pitch. Sand with rope lines, the sea and a hazy horizon behind,
// palm trees, umbrellas and towels, and a small wooden stand of spectators beside a wooden scoreboard.
// All static (no waves rolling, no swaying palms); the crowd reactions and camera flashes are one-shot.
import * as THREE from 'three';
import { rng, cvs, ctex, stdm, softTex, mergeGeos, mtx, makeBoard, makeBlockCrowd, venueApi, keyLight, venueLayout } from './common.js';

var BOARD = { bg0: '#0b4f6c', bg1: '#06324a', rows: 'rgba(255,255,255,.035)', head: '#f08c00', headText: '#fff4d6', title: "🌴  TATA'S EQUATIONS  🌴", text: '#ffe066', glow: '#ff9500', edge: '#c98a3c' };

function sandTile(seed, base, aniso, rep) {
  var c = cvs(256, 256), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (var i = 0; i < 14; i++) { var x = R() * 256, y = R() * 256, r = 30 + R() * 60, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, R() < 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(120,80,30,.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (var k = 0; k < 5000; k++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.16)' : 'rgba(110,70,20,.13)'; g.fillRect(R() * 256, R() * 256, 1.5, 1.5); }
  return ctex(c, aniso, rep);
}
// The sea: turquoise near the shore, deep blue further out, a few soft static wave lines
function seaTexture(aniso) {
  var c = cvs(256, 512), g = c.getContext('2d'), R = rng(8), gr = g.createLinearGradient(0, 512, 0, 0);
  gr.addColorStop(0, '#5fd6d0'); gr.addColorStop(0.18, '#2bb3c8'); gr.addColorStop(0.5, '#1683b8'); gr.addColorStop(1, '#0f5f99');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2;
  for (var i = 0; i < 70; i++) { var y = R() * 512, x = R() * 256, w = 12 + R() * 30 * (y / 512 + 0.3); g.globalAlpha = 0.3 + 0.7 * (y / 512); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke(); }
  g.globalAlpha = 1;
  var t = ctex(c, aniso); t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); return t;
}
// Foam and wet sand where the sea meets the beach (u along the shore, v from the dry sand to the water)
function shoreTexture() {
  var c = cvs(512, 64), g = c.getContext('2d'), gr = g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, 'rgba(176,140,92,0)'); gr.addColorStop(0.45, 'rgba(176,140,92,.75)'); gr.addColorStop(0.62, 'rgba(255,255,255,.95)'); gr.addColorStop(0.8, 'rgba(220,250,255,.55)'); gr.addColorStop(1, 'rgba(120,220,230,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 64);
  g.fillStyle = 'rgba(255,255,255,.9)';
  for (var x = 0; x < 512; x += 2) { var y = 22 + Math.sin(x / 23) * 4 + Math.sin(x / 7.3) * 1.5; g.fillRect(x, y, 2, 3); }
  var t = ctex(c, 4); t.wrapS = THREE.RepeatWrapping; t.repeat.set(10, 1); return t;
}
function woodTex(aniso) {
  var c = cvs(256, 64), g = c.getContext('2d'), R = rng(12);
  for (var r = 0; r < 4; r++) { g.fillStyle = 'hsl(' + (30 + R() * 6) + ',' + (40 + R() * 10) + '%,' + (52 + R() * 8) + '%)'; g.fillRect(0, r * 16, 256, 16); g.fillStyle = 'rgba(60,30,10,.45)'; g.fillRect(0, r * 16 + 15, 256, 1.5); }
  for (var i = 0; i < 120; i++) { g.strokeStyle = R() < 0.5 ? 'rgba(255,230,190,.12)' : 'rgba(70,35,10,.14)'; g.lineWidth = 1; var y = R() * 64; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + (R() - 0.5) * 3); g.stroke(); }
  return ctex(c, aniso, [1, 1]);
}

// One palm tree as a single vertex-coloured geometry (trunk rings, fronds, coconuts); instanced afterwards.
function palmGeometry() {
  var parts = [], H = 7.2, segs = 7, lean = 1.6, R = rng(5);
  function trunkAt(t) { return new THREE.Vector3(lean * t * t, H * t, 0); }
  for (var i = 0; i < segs; i++) {
    var a = trunkAt(i / segs), b = trunkAt((i + 1) / segs), len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
    var m = new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1));
    parts.push({ geo: new THREE.CylinderGeometry(0.26 - i * 0.012, 0.32 - i * 0.012, len * 1.04, 7), color: i % 2 ? 0x9c6b3e : 0x86592f, m: m });
  }
  var top = trunkAt(1);
  for (var f = 0; f < 8; f++) { // fronds: long flat leaves drooping outward
    var ang = f / 8 * Math.PI * 2 + R() * 0.3, droop = 0.35 + R() * 0.35, geo = new THREE.BoxGeometry(3.6, 0.06, 0.95, 6, 1, 1), p = geo.attributes.position;
    for (var k = 0; k < p.count; k++) { var x = p.getX(k) + 1.8, w = 1 - Math.pow(x / 3.6, 1.6); p.setX(k, x); p.setZ(k, p.getZ(k) * Math.max(0.12, w)); p.setY(k, p.getY(k) - droop * x * x * 0.22); }
    geo.computeVertexNormals();
    parts.push({ geo: geo, color: f % 2 ? 0x2f9e44 : 0x40c057, m: mtx(top.x, top.y, top.z, 0, ang, 0.25) });
  }
  [[0.25, 0.1], [-0.2, 0.22], [0.05, -0.28]].forEach(function (c) { parts.push({ geo: new THREE.IcosahedronGeometry(0.24, 0), color: 0x6b4423, m: mtx(top.x + c[0], top.y - 0.3, top.z + c[1]) }); });
  return mergeGeos(parts);
}

// Beach umbrellas, towels, balls, a sandcastle, shells, corner flags: one merged, vertex-coloured mesh.
function propsGeometry(spots, R) {
  var parts = [], stripes = [[0xff6b6b, 0xffffff], [0x4dabf7, 0xffffff], [0xffd43b, 0xff922b], [0x51cf66, 0xffffff], [0xcc5de8, 0xffe3e3]];
  spots.forEach(function (s, i) {
    var x = s[0], z = s[1], y = s[2], kind = s[3], col = stripes[i % stripes.length];
    if (kind === 'umbrella') {
      parts.push({ geo: new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), color: 0xf1f3f5, m: mtx(x, y + 1.7, z, 0.06, 0, -0.08) });
      for (var k = 0; k < 8; k++) parts.push({ geo: new THREE.ConeGeometry(1.9, 0.75, 8, 1, true, k / 8 * Math.PI * 2, Math.PI * 2 / 8), color: col[k % 2], m: mtx(x - 0.27, y + 3.45, z + 0.2, 0.06, R() * 0.1, -0.08) });
      parts.push({ geo: new THREE.BoxGeometry(1.1, 0.03, 2.1), color: col[0], m: mtx(x + 0.9, y + 0.02, z + 0.5, 0, 0.3 + R() * 0.3, 0) }); // towel
      parts.push({ geo: new THREE.BoxGeometry(1.1, 0.035, 0.4), color: col[1], m: mtx(x + 0.9, y + 0.025, z + 0.5, 0, 0.3, 0) });
    } else if (kind === 'ball') {
      for (var b = 0; b < 6; b++) parts.push({ geo: new THREE.SphereGeometry(0.42, 12, 8, b / 6 * Math.PI * 2, Math.PI / 3), color: [0xff6b6b, 0xffffff, 0x4dabf7, 0xffffff, 0xffd43b, 0xffffff][b], m: mtx(x, y + 0.42, z, 0.4, 0.3, 0) });
    } else if (kind === 'castle') {
      var sand = 0xd9b77a;
      parts.push({ geo: new THREE.CylinderGeometry(0.75, 0.9, 0.7, 8), color: sand, m: mtx(x, y + 0.35, z) });
      [[-0.55, -0.4], [0.55, -0.4], [0, 0.55]].forEach(function (t) {
        parts.push({ geo: new THREE.CylinderGeometry(0.3, 0.34, 0.9, 7), color: sand, m: mtx(x + t[0], y + 0.85, z + t[1]) });
        parts.push({ geo: new THREE.ConeGeometry(0.36, 0.5, 7), color: 0xc9a46a, m: mtx(x + t[0], y + 1.55, z + t[1]) });
      });
      parts.push({ geo: new THREE.BoxGeometry(0.02, 0.4, 0.3), color: 0xff6b6b, m: mtx(x, y + 2.0, z + 0.7) });
      parts.push({ geo: new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), color: 0xffffff, m: mtx(x - 0.15, y + 1.95, z + 0.55) });
    } else if (kind === 'towel') {
      var ya = R() * 0.8 - 0.4; // a striped beach towel spread on the sand
      for (var st = 0; st < 5; st++) parts.push({ geo: new THREE.BoxGeometry(1.2, 0.03, 0.44), color: col[st % 2], m: mtx(x + Math.sin(ya) * (st - 2) * 0.44, y + 0.02, z + Math.cos(ya) * (st - 2) * 0.44, 0, ya, 0) });
    } else if (kind === 'shell') {
      parts.push({ geo: new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), color: [0xffc9c9, 0xfff3bf, 0xffffff][i % 3], m: mtx(x, y, z, 0, R() * 3, 0, 1, 0.5, 1) });
    } else if (kind === 'flag') { // corner flag on the rope line
      parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), color: 0xffffff, m: mtx(x, y + 1.1, z) });
      parts.push({ geo: new THREE.BoxGeometry(0.75, 0.5, 0.02), color: 0xff922b, m: mtx(x + (x < 0 ? 0.38 : -0.38), y + 1.95, z) });
    }
  });
  return mergeGeos(parts);
}

export function buildBeach(W, D, aniso, layoutName, quality, FY) {
  var g = new THREE.Group(), R = rng(717), L = venueLayout(W, D, layoutName), tall = L.tall, lineZ = -D / 2 - 1.8;
  var sandC = '#ecd3a0';

  // ----- Sand, rope lines -----
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial({ map: sandTile(3, sandC, aniso, [320 / 9, 320 / 9]), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = FY; floor.receiveShadow = true; g.add(floor);
  var gx = W / 2 + (tall ? 2.3 : 4.2), sideZ1 = D / 2 + 8, ropeM = new THREE.MeshStandardMaterial({ color: 0x1c7ed6, roughness: 0.6 }), ropes = [];
  ropes.push({ geo: new THREE.BoxGeometry(2 * gx + 0.16, 0.06, 0.16), m: mtx(0, FY + 0.03, lineZ), color: 0x1c7ed6 });
  [-1, 1].forEach(function (s) { ropes.push({ geo: new THREE.BoxGeometry(0.16, 0.06, sideZ1 - lineZ), m: mtx(s * gx, FY + 0.03, (lineZ + sideZ1) / 2), color: 0x1c7ed6 }); });
  var rope = new THREE.Mesh(mergeGeos(ropes), ropeM); rope.receiveShadow = true; g.add(rope);

  // ----- Sea and shore -----
  // the camera only sees about 10 units past the table's back edge, so the shore is close: the stand's
  // back half stands on stilts in the shallow water, with sea showing beside and beyond it
  var standRows = 3, rowD = 1.15, rise = 0.55, shoreZ = -D / 2 - (tall ? 2.6 : 3.0), z0 = shoreZ + 0.8;
  var sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 200), new THREE.MeshStandardMaterial({ map: seaTexture(aniso), roughness: 0.25, metalness: 0.0 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, FY + 0.02, shoreZ - 100); g.add(sea);
  var shore = new THREE.Mesh(new THREE.PlaneGeometry(420, 3.2), new THREE.MeshStandardMaterial({ map: shoreTexture(), transparent: true, roughness: 0.6, depthWrite: false }));
  shore.rotation.x = -Math.PI / 2; shore.position.set(0, FY + 0.04, shoreZ - 0.3); shore.renderOrder = 1; g.add(shore);

  // ----- Small wooden stand (three rows) with spectators -----
  var standL = tall ? 10 : 13, standX = tall ? 3.0 : -5.6;
  var prof = new THREE.Shape(); prof.moveTo(0, 0);
  for (var i = 0; i < standRows; i++) { prof.lineTo(i * rowD, (i + 1) * rise); prof.lineTo((i + 1) * rowD, (i + 1) * rise); }
  prof.lineTo(standRows * rowD, 0); prof.lineTo(0, 0);
  var wood = new THREE.MeshStandardMaterial({ map: woodTex(aniso), roughness: 0.85 });
  var stand = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: standL, bevelEnabled: false }), wood);
  stand.rotation.y = Math.PI / 2; stand.position.set(standX - standL / 2, FY, z0); stand.castShadow = true; stand.receiveShadow = true; stand.updateMatrix(); g.add(stand);
  // a little striped awning roof over the stand, on four posts
  var roofY = FY + standRows * rise + 2.6, roofParts = [];
  [-1, 1].forEach(function (s) { [0, 1].forEach(function (b) { roofParts.push({ geo: new THREE.CylinderGeometry(0.08, 0.08, roofY - FY, 6), color: 0xf8f9fa, m: mtx(standX + s * (standL / 2 - 0.2), (roofY + FY) / 2, z0 - 0.1 - b * (standRows * rowD - 0.2)) }); }); });
  var nStr = Math.round(standL / 1.4);
  for (var sI = 0; sI < nStr; sI++) roofParts.push({ geo: new THREE.BoxGeometry(standL / nStr, 0.08, standRows * rowD + 0.8), color: sI % 2 ? 0xffffff : 0xff6b6b, m: mtx(standX - standL / 2 + (sI + 0.5) * standL / nStr, roofY + 0.25, z0 - standRows * rowD / 2, -0.18, 0, 0) });
  var roof = new THREE.Mesh(mergeGeos(roofParts), stdm(0xffffff, 0.8, { vertexColors: true })); roof.castShadow = true; g.add(roof);

  // spectators: toy figures in beach clothes (t-shirts, bare arms, shorts, sun hats, sunglasses), dressed by crowd.js
  var pts = [], v = new THREE.Vector3();
  for (var r = 0; r < standRows; r++) {
    var step = 0.66, cnt = Math.floor((standL - 1.0) / step);
    for (var k = 0; k < cnt; k++) {
      if (R() < 0.1) continue;
      v.set(r * rowD + rowD * 0.55 + (R() - 0.5) * 0.08, (r + 1) * rise, 0.5 + k * step + (R() - 0.5) * 0.1).applyMatrix4(stand.matrix);
      pts.push({ x: v.x, y: v.y, z: v.z, ry: Math.atan2(-v.x, -v.z), seatRy: 0, team: R() < 0.5 ? 0 : 1, key: (v.x - (standX - standL / 2)) / standL });
    }
  }
  var crowd = makeBlockCrowd(g, pts, { quality: quality, style: 'beach', seatCol: '#c9955f', seed: 717,
    teams: [{ shirt: '#ff6b6b', alt: '#ff922b', trim: '#ffffff', seat: '#c9955f' }, { shirt: '#4dabf7', alt: '#20c997', trim: '#ffffff', seat: '#c9955f' }] });
  pts = crowd.pts;

  // ----- Wooden scoreboard on posts in the sand -----
  var bw = L.boardW, bh = L.boardH, bx = L.boardX, bz = z0 - 1.4, by = FY + (tall ? 3.4 : 1.6) + bh / 2; // taller posts in portrait so the table corner never hides the text
  var board = makeBoard({ w: bw, h: bh, pal: BOARD, aniso: aniso, casing: new THREE.MeshStandardMaterial({ map: woodTex(aniso), color: 0xc8a070, roughness: 0.8 }), glow: 0x7fe0ff });
  board.group.position.set(bx, by, bz); board.group.rotation.x = -0.18; g.add(board.group);
  var postM = new THREE.MeshStandardMaterial({ map: woodTex(aniso), color: 0x9c7046, roughness: 0.9 });
  [-1, 1].forEach(function (s) { var pole = new THREE.Mesh(new THREE.BoxGeometry(0.35, by - FY, 0.35), postM); pole.position.set(bx + s * bw * 0.38, (by + FY) / 2 - 0.3, bz - 0.45); pole.castShadow = true; g.add(pole); });

  // ----- Palm trees (one instanced mesh) -----
  // palms only at the back corners and far out to the sides: never in front of the mat on screen.
  // [x, z, yaw (the trunk leans along local +x), scale]
  var palms = tall
    ? [[-W / 2 - 1.6, lineZ + 0.3, 2.4, 0.95], [W / 2 + 1.4, lineZ - 0.4, 0.5, 1.0], [-W / 2 - 4.2, -3.5, 3.1, 1.0], [W / 2 + 4.4, 0.5, 0.0, 1.05]]
    : [[-W / 2 - 3.2, lineZ + 0.8, 2.3, 1.0], [-W / 2 - 6.0, lineZ + 3.4, 3.0, 1.1], [W / 2 + 4.0, lineZ + 0.6, 0.7, 1.0], [W / 2 + 7.4, -3.2, 0.1, 1.08], [-W / 2 - 8.5, 1.5, 3.3, 1.1]];
  var palmMesh = new THREE.InstancedMesh(palmGeometry(), stdm(0xffffff, 0.8, { vertexColors: true }), palms.length);
  palms.forEach(function (p, i) { palmMesh.setMatrixAt(i, mtx(p[0], FY, p[1], 0, p[2], 0, p[3])); });
  palmMesh.castShadow = true; palmMesh.frustumCulled = false; g.add(palmMesh);

  // ----- Beach things on the sand around the pitch -----
  var spots = tall
    ? [[-W / 2 - 3.6, -4, FY, 'umbrella'], [W / 2 + 4.8, 3.5, FY, 'umbrella'], [-W / 2 - 1.6, 1.0, FY, 'ball'], [W / 2 + 1.5, -5.5, FY, 'castle'], [-W / 2 - 2.4, 6.5, FY, 'towel'],
       [-gx, lineZ, FY, 'flag'], [gx, lineZ, FY, 'flag'], [-3, D / 2 + 3, FY, 'shell'], [4, D / 2 + 2.4, FY, 'shell'], [W / 2 + 1.4, D / 2 + 2, FY, 'ball']]
    : [[-W / 2 - 4.2, -3.5, FY, 'umbrella'], [W / 2 + 4.4, 2.2, FY, 'umbrella'], [-W / 2 - 1.6, 0.8, FY, 'ball'], [W / 2 + 1.7, -4.6, FY, 'castle'], [W / 2 + 2.6, 6.0, FY, 'towel'], [W / 2 + 4.3, 5.6, FY, 'towel'],
       [-gx, lineZ, FY, 'flag'], [gx, lineZ, FY, 'flag'], [-5, D / 2 + 2.6, FY, 'shell'], [6, D / 2 + 3.4, FY, 'shell'], [1, D / 2 + 3.8, FY, 'shell'], [-W / 2 - 2.0, 5.0, FY, 'ball']];
  var props = new THREE.Mesh(propsGeometry(spots, R), stdm(0xffffff, 0.75, { vertexColors: true, side: THREE.DoubleSide })); props.castShadow = true; g.add(props);

  // ----- Sunshine: a warm key light from in front, high up (shadows fall away from the camera) -----
  var key = keyLight(0xfff1d6, 1.25, -8, FY + 34, 16, W, D); g.add(key);
  // a soft, static sun glow far away over the sea (only seen on wide screens or in the win camera move)
  var sunG = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xfff4c2, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunG.scale.set(40, 40, 1); sunG.position.set(30, FY + 18, shoreZ - 90); g.add(sunG);

  return venueApi({ group: g, crowd: crowd, pts: pts, quality: quality, setBoard: board.setBoard, flashColor: 0xfff6d0, flashN: 16, key: key });
}
