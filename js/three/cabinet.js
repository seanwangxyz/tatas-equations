// 3D trophy cabinet: a small room with his achievements as real objects. Loaded on demand by js/cabinet.js
// (dynamic import), with its OWN small WebGL renderer, created on entering and fully disposed on leaving.
// It never touches the match renderer (window.T3), apart from asking T3.portrait for creature pictures.
//
//   mount(host, items, { onTap(item), quality: 'high'|'low' }) -> { select(id), resize(), dispose(), info() }
//   items: [{ id, type: 'cup'|'crown'|'medal'|'pennant'|'plaque', won, ...per type: see js/cabinet.js }]
//
// Calm by design: nothing moves by itself. Drag turns the view, a wheel / pinch zooms, and a tapped item makes ONE
// slow turn (2.6 s) and stops facing front again. It only draws when something changed (no render loop at rest).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

var TIER = { bronze: ['#f0b27a', '#b8692c', '#7a3f12'], silver: ['#ffffff', '#c3ccd8', '#7d8898'], gold: ['#fff2a8', '#ffc83d', '#b07800'], special: ['#f3e6ff', '#b38cff', '#6a3fc4'] };
var PEN = { gold: ['#ffd84a', '#c98a00'], silver: ['#eef2f7', '#8a96a8'], bronze: ['#f2b27a', '#a35a21'], blue: ['#7cc0ff', '#1f63c9'] };
var ROOM = { w: 7.4, d: 6.2, h: 3.4, backZ: -2.95, leftX: -3.6, rightX: 3.6 };
var EYE0 = new THREE.Vector3(0, 1.48, 1.7);

function smooth(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10); }
function canvasTex(w, h, draw, srgb) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var g = c.getContext('2d'); draw(g, w, h);
  var t = new THREE.CanvasTexture(c); if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function woodTex(base, dark, rep) {
  var t = canvasTex(256, 256, function (g, w, h) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 70; i++) {
      var y = Math.random() * h, a = 0.05 + Math.random() * 0.12;
      g.strokeStyle = 'rgba(' + dark + ',' + a + ')'; g.lineWidth = 1 + Math.random() * 3;
      g.beginPath(); g.moveTo(0, y);
      for (var x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / 40 + i) * 3);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
function fitText(g, s, max, size, font) { var f = size; g.font = (font || '900 ') + f + 'px "Lilita One", "Trebuchet MS", sans-serif'; while (g.measureText(s).width > max && f > 10) { f -= 2; g.font = (font || '900 ') + f + 'px "Lilita One", "Trebuchet MS", sans-serif'; } }

export function mount(host, items, opts) {
  opts = opts || {};
  var low = opts.quality === 'low';
  var renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  var cv = renderer.domElement; cv.className = 'cab-canvas'; cv.setAttribute('aria-label', 'Trophy cabinet'); host.appendChild(cv);

  var scene = new THREE.Scene(); scene.background = new THREE.Color('#1c2440');
  var pmrem = new THREE.PMREMGenerator(renderer), envRT = pmrem.fromScene(new RoomEnvironment(), 0.03);
  scene.environment = envRT.texture; scene.environmentIntensity = 0.9;
  var camera = new THREE.PerspectiveCamera(50, 1.5, 0.05, 40);
  var EYE = EYE0.clone(), yaw = 0, pitch = -0.04, fovK = 1;

  // ---------- lights: warm and soft, a pool of light on each shelf and wall ----------
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a2238, 0.55));
  var key = new THREE.DirectionalLight(0xfff0d8, 1.1); key.position.set(1.5, 3.2, 3); scene.add(key);
  function spot(x, y, z, tx, ty, tz, inten, ang) { var s = new THREE.SpotLight(0xffe6c4, inten, 9, ang || 0.6, 0.65, 1.2); s.position.set(x, y, z); s.target.position.set(tx, ty, tz); scene.add(s); scene.add(s.target); return s; }
  spot(0, 3.3, -1.2, 0, 1.4, ROOM.backZ, 14, 0.75);
  spot(-1.8, 3.3, 0.2, ROOM.leftX, 1.6, -0.9, 9, 0.7);
  spot(1.8, 3.3, 0.2, ROOM.rightX, 1.6, -0.9, 9, 0.7);

  // ---------- the room ----------
  var stdm = function (o) { return new THREE.MeshStandardMaterial(o); };
  var floorT = woodTex('#9a6a3c', '60,30,10', [4, 4]);
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), stdm({ map: floorT, roughness: 0.6, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = ROOM.backZ + ROOM.d / 2; scene.add(floor);
  var rug = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), stdm({ color: '#2f6fbf', roughness: 0.95 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.005, -0.4); scene.add(rug);
  var rug2 = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.48, 48), stdm({ color: '#ffd84a', roughness: 0.9 })); rug2.rotation.x = -Math.PI / 2; rug2.position.set(0, 0.008, -0.4); scene.add(rug2);
  var wallM = stdm({ color: '#f3e7cf', roughness: 0.92 }), wallM2 = stdm({ color: '#dfeaf7', roughness: 0.92 });
  function wall(w, h, x, y, z, ry, m) { var p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; scene.add(p); return p; }
  wall(ROOM.w, ROOM.h, 0, ROOM.h / 2, ROOM.backZ - 0.01, 0, wallM);
  wall(ROOM.d, ROOM.h, ROOM.leftX, ROOM.h / 2, ROOM.backZ + ROOM.d / 2, Math.PI / 2, wallM2);
  wall(ROOM.d, ROOM.h, ROOM.rightX, ROOM.h / 2, ROOM.backZ + ROOM.d / 2, -Math.PI / 2, wallM2);
  wall(ROOM.w, ROOM.h, 0, ROOM.h / 2, ROOM.backZ + ROOM.d, Math.PI, wallM);
  var ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), stdm({ color: '#fbf6ec', roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, ROOM.h, ROOM.backZ + ROOM.d / 2); scene.add(ceil);
  // skirting boards
  var skM = stdm({ color: '#6b4426', roughness: 0.7 });
  [[ROOM.w, 0, ROOM.backZ + 0.02, 0], [ROOM.d, ROOM.leftX + 0.02, ROOM.backZ + ROOM.d / 2, Math.PI / 2], [ROOM.d, ROOM.rightX - 0.02, ROOM.backZ + ROOM.d / 2, -Math.PI / 2]].forEach(function (s) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(s[0], 0.14, 0.03), skM); b.position.set(s[1], 0.07, s[2]); b.rotation.y = s[3]; scene.add(b);
  });

  // the cabinet on the back wall: three shelves (cups on top, crowns, plaques)
  var woodT = woodTex('#8a5530', '50,22,6', [2, 1]), woodM = stdm({ map: woodT, color: '#c48a5c', roughness: 0.45, metalness: 0.05 });
  var velvet = stdm({ color: '#23305e', roughness: 1 });
  var CW = 4.9, CH = 2.95, CD = 0.56, cz = ROOM.backZ + CD / 2 + 0.01;
  function box(w, h, d, x, y, z, m) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; }
  box(CW, CH, 0.04, 0, CH / 2, ROOM.backZ + 0.03, velvet);                  // back
  box(0.1, CH, CD, -CW / 2, CH / 2, cz, woodM); box(0.1, CH, CD, CW / 2, CH / 2, cz, woodM); // sides
  box(CW + 0.16, 0.12, CD + 0.08, 0, CH + 0.06, cz + 0.02, woodM);           // top
  box(CW, 0.3, CD, 0, 0.15, cz, woodM);                                     // plinth
  var SHELF = [0.3, 1.18, 2.06];
  SHELF.slice(1).forEach(function (y) { box(CW - 0.1, 0.06, CD, 0, y - 0.03, cz, woodM); });
  // soft glow strips under each shelf (no light cost: just bright material)
  var glowM = new THREE.MeshBasicMaterial({ color: '#ffe9b8' });
  [1.12, 2.0, CH - 0.02].forEach(function (y) { box(CW - 0.3, 0.012, 0.03, 0, y, ROOM.backZ + CD - 0.03, glowM); });
  // velvet boards on the side walls (medals left, pennants right)
  function board(x, ry, title, color) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.15, 0.05), stdm({ color: color, roughness: 1 }));
    b.position.set(x, 1.62, -0.85); b.rotation.y = ry; scene.add(b);
    var fr = new THREE.Mesh(new THREE.BoxGeometry(3.44, 2.29, 0.03), woodM); fr.position.copy(b.position); fr.rotation.y = ry; fr.position.x += (x < 0 ? -0.012 : 0.012); scene.add(fr);
    var tt = canvasTex(512, 64, function (g, w, h) { g.fillStyle = '#ffe9b0'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, title, w - 20, 44); g.fillText(title, w / 2, h / 2 + 2); });
    var lab = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.225), new THREE.MeshBasicMaterial({ map: tt, transparent: true })); lab.position.set(x + (x < 0 ? 0.035 : -0.035), 2.5, -0.85); lab.rotation.y = ry; scene.add(lab);
  }
  board(ROOM.leftX + 0.04, Math.PI / 2, 'My Badges', '#3a245e');
  board(ROOM.rightX - 0.04, -Math.PI / 2, 'Season Pennants', '#173d5a');
  var ct = canvasTex(512, 64, function (g, w, h) { g.fillStyle = '#ffe9b0'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'Trophy Cabinet', w - 20, 46); g.fillText('Trophy Cabinet', w / 2, h / 2 + 2); });
  var ctl = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.25), new THREE.MeshBasicMaterial({ map: ct, transparent: true })); ctl.position.set(0, CH + 0.3, ROOM.backZ + 0.05); scene.add(ctl);

  // ---------- materials shared by the items ----------
  function metal(col, rough) { return new THREE.MeshPhysicalMaterial({ color: col, metalness: 1, roughness: rough == null ? 0.2 : rough, clearcoat: 0.6, clearcoatRoughness: 0.15 }); }
  var ghostM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, depthWrite: false });
  var lineM = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.38 });
  var hitM = new THREE.MeshBasicMaterial({ visible: false });
  var blackM = stdm({ color: '#1d1d24', roughness: 0.35, metalness: 0.2 });
  var spinners = [], byId = {}, hitBoxes = [];

  // an empty place: the same shape, see-through, with a soft outline
  function ghostify(g) {
    var lines = [];
    g.traverse(function (o) {
      if (!o.isMesh) return;
      o.material = ghostM;
      var e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 35), lineM);
      e.position.copy(o.position); e.rotation.copy(o.rotation); e.scale.copy(o.scale);
      lines.push([o.parent, e]);
    });
    lines.forEach(function (l) { l[0].add(l[1]); });
  }

  // ---------- item builders (each returns a Group facing +z, standing on y = 0) ----------
  var cupProfile = (function () {
    var p = [[0, 0], [0.2, 0], [0.205, 0.04], [0.16, 0.06], [0.07, 0.1], [0.045, 0.16], [0.04, 0.24], [0.06, 0.28], [0.045, 0.31], [0.1, 0.36], [0.2, 0.44], [0.25, 0.56], [0.265, 0.68], [0.28, 0.71], [0.262, 0.715], [0.245, 0.68], [0.23, 0.57], [0.18, 0.47], [0.08, 0.41], [0, 0.395]];
    return p.map(function (q) { return new THREE.Vector2(q[0], q[1]); });
  })();
  var cupGeo = new THREE.LatheGeometry(cupProfile, low ? 28 : 48);
  function buildCup(it) {
    var g = new THREE.Group(), m = metal(it.metal ? it.metal[1] : '#ffc83d', 0.16);
    var plinth = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), blackM); plinth.position.y = 0.07; g.add(plinth);
    var plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.08), new THREE.MeshStandardMaterial({ map: canvasTex(256, 60, function (c, w, h) { c.fillStyle = it.won ? '#f4d27a' : '#666'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a2a00'; c.textAlign = 'center'; c.textBaseline = 'middle'; fitText(c, it.title, w - 16, 34); c.fillText(it.title, w / 2, h / 2 + 2); }), metalness: 0.6, roughness: 0.3 }));
    plate.position.set(0, 0.07, 0.231); g.add(plate);
    var cup = new THREE.Mesh(cupGeo, m); cup.position.y = 0.14; g.add(cup);
    [-1, 1].forEach(function (s) {
      var h = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.02, 10, 24, Math.PI), m);
      h.position.set(s * 0.255, 0.69, 0); h.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(h);
    });
    var rib = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.05, 24), stdm({ color: it.ribbon || '#2f8cff', roughness: 0.5 })); rib.position.y = 0.42; g.add(rib);
    if (it.won && it.count > 1) {
      var badge = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, function (c) { c.fillStyle = '#ef4565'; c.beginPath(); c.arc(32, 32, 31, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '900 34px Trebuchet MS, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('x' + Math.min(99, it.count), 32, 34); }) }));
      badge.position.set(0.19, 0.12, 0.24); g.add(badge);
    }
    return g;
  }
  function buildCrown(it) {
    var g = new THREE.Group(), m = metal(it.color || '#ffc83d', 0.18);
    var cush = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 12), stdm({ color: it.cushion || '#c92a4a', roughness: 0.9 })); cush.scale.set(1.15, 0.32, 1.15); cush.position.y = 0.05; g.add(cush);
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.115, 0.085, 32, 1, true), m); band.material.side = THREE.DoubleSide; band.position.y = 0.14; g.add(band);
    var cap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), stdm({ color: it.cushion || '#c92a4a', roughness: 0.9 })); cap.scale.y = 0.7; cap.position.y = 0.15; g.add(cap);
    for (var k = 0; k < 6; k++) {
      var a = k / 6 * Math.PI * 2, pt = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 10), m);
      pt.position.set(Math.sin(a) * 0.118, 0.225, Math.cos(a) * 0.118); g.add(pt);
      var ball = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), m); ball.position.set(Math.sin(a) * 0.118, 0.282, Math.cos(a) * 0.118); g.add(ball);
      var gem = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshPhysicalMaterial({ color: (it.gems || ['#e03131', '#1c7ed6', '#2f9e44'])[k % 3], metalness: 0, roughness: 0.05, transmission: 0, clearcoat: 1 }));
      gem.position.set(Math.sin(a) * 0.123, 0.14, Math.cos(a) * 0.123); gem.scale.z = 0.6; gem.lookAt(new THREE.Vector3(Math.sin(a), 0.14, Math.cos(a)).multiplyScalar(2)); g.add(gem);
    }
    var orb = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), m); orb.position.y = 0.245; g.add(orb);
    return g;
  }
  function medalFace(it) {
    var t = TIER[it.tier] || TIER.gold;
    return canvasTex(160, 160, function (c, w, h) {
      var gr = c.createRadialGradient(w * 0.4, h * 0.35, 8, w / 2, h / 2, w / 2);
      gr.addColorStop(0, t[0]); gr.addColorStop(0.7, t[1]); gr.addColorStop(1, t[2]);
      c.fillStyle = gr; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 5; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 12, 0, 7); c.stroke();
      c.font = '78px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(it.icon || '★', w / 2, h / 2 + 5);
    });
  }
  var medalRim = new THREE.CylinderGeometry(0.1, 0.1, 0.022, low ? 24 : 40), medalFaceGeo = new THREE.CircleGeometry(0.086, low ? 24 : 40);
  function buildMedal(it) {
    var g = new THREE.Group(), t = TIER[it.tier] || TIER.gold, m = metal(t[1], 0.22);
    var rim = new THREE.Mesh(medalRim, m); rim.rotation.x = Math.PI / 2; rim.position.y = 0.1; g.add(rim);
    var face = new THREE.Mesh(medalFaceGeo, it.won ? new THREE.MeshStandardMaterial({ map: medalFace(it), metalness: 0.45, roughness: 0.3 }) : ghostM); face.position.set(0, 0.1, 0.0115); g.add(face);
    var back = new THREE.Mesh(medalFaceGeo, m); back.rotation.y = Math.PI; back.position.set(0, 0.1, -0.0115); g.add(back);
    var ribM = stdm({ color: it.ribbon || '#2f8cff', roughness: 0.7 });
    [-1, 1].forEach(function (s) { var r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.006), ribM); r.position.set(s * 0.032, 0.25, -0.004); r.rotation.z = s * 0.32; g.add(r); });
    return g;
  }
  function pennantTex(it) {
    var c = PEN[it.kind] || PEN.blue;
    return canvasTex(256, 140, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h / 2); g.lineTo(0, h); g.closePath(); g.fill();
      g.fillStyle = it.kind === 'silver' ? '#3d4768' : '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, it.big || '', 120, 46); g.fillText(it.big || '', 82, h / 2 - 12);
      fitText(g, it.small || '', 130, 20, '800 '); g.fillText(it.small || '', 80, h / 2 + 24);
    });
  }
  function buildPennant(it) {
    var g = new THREE.Group();
    var shape = new THREE.Shape(); shape.moveTo(0, 0.13); shape.lineTo(0.5, 0); shape.lineTo(0, -0.13); shape.closePath();
    var geo = new THREE.ShapeGeometry(shape); geo.computeBoundingBox();
    var uv = geo.attributes.uv, pos = geo.attributes.position; for (var i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.5, (pos.getY(i) + 0.13) / 0.26);
    var flag = new THREE.Mesh(geo, it.won ? new THREE.MeshStandardMaterial({ map: pennantTex(it), side: THREE.DoubleSide, roughness: 0.85 }) : ghostM);
    flag.position.set(0.02, 0.2, 0); g.add(flag);
    var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 8), stdm({ color: '#7a5230', roughness: 0.6 })); stick.position.set(0.012, 0.18, 0); g.add(stick);
    var knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), metal('#ffc83d')); knob.position.set(0.012, 0.37, 0); g.add(knob);
    return g;
  }
  function plaqueTex(it, img) {
    return canvasTex(200, 240, function (c, w, h) {
      c.fillStyle = it.won ? '#fff7e0' : '#ddd'; c.fillRect(0, 0, w, h);
      c.fillStyle = it.color || '#ffe8a3'; c.beginPath(); c.arc(w / 2, 92, 72, 0, 7); c.fill();
      if (img) { c.save(); c.beginPath(); c.arc(w / 2, 92, 72, 0, 7); c.clip(); c.drawImage(img, w / 2 - 72, 20, 144, 144); c.restore(); }
      else { c.font = '90px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(it.icon || '?', w / 2, 98); }
      c.fillStyle = '#3a2a00'; c.textAlign = 'center'; c.textBaseline = 'middle';
      fitText(c, it.name || '', w - 20, 34); c.fillText(it.name || '', w / 2, 190);
      fitText(c, it.boss ? 'BOSS BEATEN!' : 'BEATEN!', w - 30, 20, '800 '); c.fillStyle = it.boss ? '#b07800' : '#2f6fbf'; c.fillText(it.boss ? 'BOSS BEATEN!' : 'BEATEN!', w / 2, 220);
    });
  }
  function buildPlaque(it) {
    var g = new THREE.Group();
    var wood = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.035), it.boss ? metal('#ffc83d', 0.25) : woodM); wood.position.y = 0.23; wood.rotation.x = -0.12; g.add(wood);
    var front = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.348), it.won ? new THREE.MeshStandardMaterial({ map: plaqueTex(it), roughness: 0.5, metalness: 0.1 }) : ghostM);
    front.position.set(0, 0.23 + 0.0022, 0.019); front.rotation.x = -0.12; g.add(front);
    var foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.12), blackM); foot.position.set(0, 0.015, -0.02); g.add(foot);
    if (it.won && it.portrait) {
      // a creature picture from the match renderer's portrait maker (js/three/portraits.js), when it can make one
      Promise.resolve(it.portrait()).then(function (url) {
        if (!url || disposed) return;
        var img = new Image(); img.onload = function () { if (disposed) return; var old = front.material.map; front.material.map = plaqueTex(it, img); front.material.needsUpdate = true; if (old) old.dispose(); need(); }; img.src = url;
      }, function () {});
    }
    return g;
  }
  var BUILD = { cup: buildCup, crown: buildCrown, medal: buildMedal, pennant: buildPennant, plaque: buildPlaque };

  // ---------- placing everything ----------
  function place(it, x, y, z, ry, scale) {
    var holder = new THREE.Group(), spin = new THREE.Group(), body = BUILD[it.type](it);
    if (!it.won) ghostify(body);
    // the tap box, measured while the item has no parent (so in its own space, which is also the holder's)
    body.updateMatrixWorld(true);
    var bb = new THREE.Box3().setFromObject(body), sz = bb.getSize(new THREE.Vector3()), cn = bb.getCenter(new THREE.Vector3());
    var hit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sz.x, 0.12) * 1.15, Math.max(sz.y, 0.12) * 1.1, Math.max(sz.z, 0.12) * 1.4), hitM);
    hit.position.copy(cn); hit.userData.item = it;
    holder.position.set(x, y, z); holder.rotation.y = ry || 0; if (scale) holder.scale.setScalar(scale);
    spin.add(body); holder.add(spin); holder.add(hit); scene.add(holder); hitBoxes.push(hit);
    byId[it.id] = { it: it, spin: spin, holder: holder };
  }
  var cups = items.filter(function (i) { return i.type === 'cup'; }), crowns = items.filter(function (i) { return i.type === 'crown'; });
  var plaques = items.filter(function (i) { return i.type === 'plaque'; }), medals = items.filter(function (i) { return i.type === 'medal'; });
  var pennants = items.filter(function (i) { return i.type === 'pennant'; }).slice(0, 24);
  var iz = ROOM.backZ + 0.3;
  function row(list, y, width, fn) { var n = list.length; list.forEach(function (it, k) { var x = n === 1 ? 0 : -width / 2 + width * k / (n - 1); fn(it, x, y); }); }
  // (CAREER: with three leagues there are 5 cups, 14 crowns and 15 plaques; when a shelf gets crowded every item on it
  //  shrinks a little so neighbours never overlap: k = room per item / the item's natural width)
  function fit(n, width, natural) { return n > 1 ? Math.min(1, (width / (n - 1)) / natural) : 1; }
  var cupW = Math.min(CW - 1.0, cups.length * 1.0), crW = Math.min(CW - 0.6, crowns.length * 0.5), plW = Math.min(CW - 0.5, plaques.length * 0.45);
  var cupK = fit(cups.length, cupW, 0.9), crK = fit(crowns.length, crW, 0.48), plK = fit(plaques.length, plW, 0.4);
  row(cups, SHELF[2], cupW, function (it, x, y) { place(it, x, y, iz, 0, 0.98 * cupK); });
  row(crowns, SHELF[1], crW, function (it, x, y) { place(it, x, y, iz, 0, 1.25 * crK); });
  row(plaques, SHELF[0], plW, function (it, x, y) { place(it, x, y, iz, 0, plK); });
  // medals: one row per tier on the left wall (facing +x)
  var tiers = ['bronze', 'silver', 'gold', 'special'], rowsM = [];
  tiers.forEach(function (t) { var l = medals.filter(function (m) { return m.tier === t; }); while (l.length) rowsM.push(l.splice(0, 14)); });
  rowsM.forEach(function (l, r) {
    var y = 2.02 - r * (rowsM.length > 4 ? 1.4 / (rowsM.length - 1) : 0.46);
    l.forEach(function (it, k) { var z = -0.85 - 1.45 + 2.9 * (l.length === 1 ? 0.5 : k / 13); place(it, ROOM.leftX + 0.1, y, z, Math.PI / 2, 1.05); });
  });
  // pennants: rows of 6 on the right wall (facing -x), newest first
  pennants.forEach(function (it, k) {
    var r = Math.floor(k / 6), c = k % 6;
    place(it, ROOM.rightX - 0.09, 2.0 - r * 0.42, 0.2 - c * 0.52, -Math.PI / 2, 1);
  });

  // ---------- drawing on demand ----------
  var raf = 0, disposed = false, turning = null, lastDraw = 0, draws = 0;
  function aim() {
    var look = new THREE.Vector3(Math.sin(yaw) * -1 * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.position.copy(EYE); camera.lookAt(EYE.clone().add(look));
  }
  function draw(now) {
    raf = 0; if (disposed) return;
    var more = false;
    if (turning) {
      var k = (now - turning.t0) / turning.dur;
      if (k >= 1) { turning.spin.rotation.y = 0; turning = null; }
      else { turning.spin.rotation.y = smooth(k) * Math.PI * 2; more = true; }
    }
    aim(); renderer.render(scene, camera); draws++; lastDraw = now;
    if (more) need();
  }
  function need() { if (!raf && !disposed) raf = requestAnimationFrame(draw); }
  function resize() {
    if (disposed) return;
    var r = host.getBoundingClientRect(), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false); cv.style.width = w + 'px'; cv.style.height = h + 'px';
    camera.aspect = w / h;
    var base = camera.aspect < 0.8 ? 60 : camera.aspect < 1.2 ? 56 : 50;
    EYE.z = camera.aspect < 0.8 ? 2.95 : camera.aspect < 1.2 ? 2.3 : 1.7;   // narrow screens stand further back to see more of the cabinet
    camera.fov = Math.max(26, Math.min(76, base * fovK)); camera.updateProjectionMatrix();
    need();
  }
  var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(host); window.addEventListener('resize', resize);

  // ---------- input: drag to look, wheel / pinch to zoom, tap an item ----------
  var ptr = {}, nP = 0, drag = null, pinchD = 0, rayc = new THREE.Raycaster(), ndc = new THREE.Vector2();
  var YAW = 1.15, PMIN = -0.42, PMAX = 0.3;
  function clampView() { yaw = Math.max(-YAW, Math.min(YAW, yaw)); pitch = Math.max(PMIN, Math.min(PMAX, pitch)); }
  function onDown(e) {
    ptr[e.pointerId] = { x: e.clientX, y: e.clientY }; nP++;
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    if (nP === 1) drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
    else { drag = null; var ks = Object.keys(ptr); pinchD = Math.hypot(ptr[ks[0]].x - ptr[ks[1]].x, ptr[ks[0]].y - ptr[ks[1]].y); }
  }
  function onMove(e) {
    var p = ptr[e.pointerId]; if (!p) return; p.x = e.clientX; p.y = e.clientY;
    if (nP >= 2) { var ks = Object.keys(ptr), d = Math.hypot(ptr[ks[0]].x - ptr[ks[1]].x, ptr[ks[0]].y - ptr[ks[1]].y); if (pinchD > 10) { fovK = Math.max(0.55, Math.min(1.15, fovK * pinchD / d)); resize(); } pinchD = d; return; }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
    if (drag.moved) {
      var r = cv.getBoundingClientRect(), f = camera.fov * Math.PI / 180;
      yaw += (e.clientX - drag.lx) / r.height * f; pitch += (e.clientY - drag.ly) / r.height * f; clampView();
      drag.lx = e.clientX; drag.ly = e.clientY; need();
    }
  }
  function onUp(e) {
    if (!ptr[e.pointerId]) return;
    delete ptr[e.pointerId]; nP = Math.max(0, nP - 1);
    var d = drag; drag = null;
    if (!d || d.moved || nP) return;
    var it = itemAt(e.clientX, e.clientY);
    if (it) { select(it.id); if (opts.onTap) opts.onTap(it); }
  }
  function itemAt(x, y) {
    var r = cv.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    aim(); camera.updateMatrixWorld(); scene.updateMatrixWorld(); rayc.setFromCamera(ndc, camera);
    var h = rayc.intersectObjects(hitBoxes, false)[0];
    return h && h.object.userData.item || null;
  }
  function onWheel(e) { e.preventDefault(); var dy = Math.max(-120, Math.min(120, e.deltaY)); fovK = Math.max(0.55, Math.min(1.15, fovK * Math.exp(dy * 0.0012))); resize(); }
  function onCancel(e) { if (ptr[e.pointerId]) { delete ptr[e.pointerId]; nP = Math.max(0, nP - 1); } drag = null; }
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onCancel);
  cv.addEventListener('wheel', onWheel, { passive: false });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // one slow turn of the tapped item, then it stops facing front
  function select(id) {
    var b = byId[id]; if (!b) return false;
    if (turning && turning.spin !== b.spin) turning.spin.rotation.y = 0;
    turning = { spin: b.spin, t0: performance.now(), dur: 2600 };
    need(); return true;
  }
  // look at an item (for the 2D list / tests): turns the view, no animation
  function lookAt(id) {
    var b = byId[id]; if (!b) return false;
    var p = new THREE.Vector3(); b.holder.getWorldPosition(p); p.sub(EYE);
    yaw = Math.atan2(-p.x, -p.z); pitch = Math.atan2(p.y + 0.2, Math.hypot(p.x, p.z)); clampView(); need(); return true;
  }
  function dispose() {
    if (disposed) return; disposed = true;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (ro) ro.disconnect(); window.removeEventListener('resize', resize);
    var geos = new Set(), mats = new Set(), texs = new Set();
    scene.traverse(function (o) {
      if (o.geometry) geos.add(o.geometry);
      var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(function (m) { mats.add(m); ['map', 'roughnessMap', 'normalMap'].forEach(function (k) { if (m[k]) texs.add(m[k]); }); });
    });
    geos.forEach(function (g) { g.dispose(); }); mats.forEach(function (m) { m.dispose(); }); texs.forEach(function (t) { t.dispose(); });
    cupGeo.dispose(); medalRim.dispose(); medalFaceGeo.dispose();
    envRT.dispose(); pmrem.dispose();
    renderer.renderLists.dispose(); renderer.dispose();
    try { renderer.forceContextLoss(); } catch (e) {}
    if (cv.parentNode) cv.parentNode.removeChild(cv);
    scene.clear();
  }
  resize(); if (camera.aspect < 0.8) pitch = 0.02; aim(); need();   // tall screens: look a little up, at the shelves rather than the rug
  return {
    select: select, lookAt: lookAt, itemAt: itemAt,
    resize: resize, dispose: dispose, redraw: need,
    view: function (y, p, z) { if (y != null) yaw = y; if (p != null) pitch = p; if (z != null) { fovK = z; resize(); } clampView(); need(); },
    info: function () { return { draws: draws, items: Object.keys(byId).length, turning: !!turning, yaw: yaw, pitch: pitch, fov: camera.fov, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; }
  };
}
