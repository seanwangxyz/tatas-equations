// Creature opponents across the table (original designs, in soccer jerseys).
// Plugs into the 3D table through T3.ctx (see js/three/table.js).
import * as THREE from 'three';

var T3 = window.T3;
if (T3.ctx) (function () {
  var ctx = T3.ctx;
  // ----- Creature opponent across the table (original designs, in soccer jerseys) -----
  var KINDS = {
    sloth: { body: 0x9c7a54, face: 0xe3cfa8, jersey: '#2f9e44', trim: '#ffffff', num: '1', hand: 0x63e6be },
    penguin: { body: 0x2b2f36, face: 0xffffff, jersey: '#4dabf7', trim: '#ffffff', num: '4', hand: 0x2b2f36 },
    fox: { body: 0xf08c3a, face: 0xffffff, jersey: '#e03131', trim: '#ffffff', num: '9', hand: 0x2b2f36 },
    owl: { body: 0x8d6a9f, face: 0xf1e3c0, jersey: '#1c3d8c', trim: '#ffd43b', num: '8', hand: 0x8d6a9f },
    wizard: { body: 0x7b5cf0, face: 0xc5b3ff, jersey: '#fab005', trim: '#5f3dc4', num: '99', hand: 0x7b5cf0 },
    pip: { body: 0xffd43b, face: 0xffe8a1, jersey: '#ff922b', trim: '#ffffff', num: 'P', hand: 0xe8590c }
  };
  var crea = null;
  function std(c, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6 }, o || {})); }
  function jerseyTex(k) {
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; var g = cv.getContext('2d');
    g.fillStyle = k.jersey; g.fillRect(0, 0, 512, 256);
    g.fillStyle = k.trim; g.fillRect(0, 0, 512, 22); g.fillRect(0, 234, 512, 22);
    g.globalAlpha = 0.18; for (var x = 0; x < 512; x += 64) g.fillRect(x, 22, 26, 212); g.globalAlpha = 1;
    g.font = '900 130px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = k.trim === '#ffffff' ? 'rgba(0,0,0,.35)' : k.trim; g.strokeText(k.num, 256, 136);
    g.fillStyle = '#fff'; g.fillText(k.num, 256, 136);
    var t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
  }
  function mk(geo, mat, x, y, z, parent) { var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (parent || this).add(m); return m; }
  function buildCreature(kind) {
    var k = KINDS[kind] || KINDS.pip, root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
    root.add(body); body.add(head);
    var skinM = std(k.body), faceM = std(k.face), white = std(0xffffff, { roughness: 0.3 }), black = std(0x111111, { roughness: 0.3 });
    // torso in a jersey (number faces the player)
    var torso = mk(new THREE.CylinderGeometry(1.0, 1.15, 1.7, 32, 1, false, Math.PI, Math.PI * 2), std(0xffffff, { map: jerseyTex(k), roughness: 0.8 }), 0, 1.25, 0, body);
    [-1, 1].forEach(function (s) { var sl = mk(new THREE.SphereGeometry(0.42, 16, 12), std(new THREE.Color(k.jersey).getHex()), s * 1.02, 1.85, 0.05, body); sl.scale.set(1, 0.8, 1); });
    head.position.set(0, 2.75, 0.1);
    if (kind === 'pip') mk(new THREE.BoxGeometry(1.7, 1.6, 1.6), skinM, 0, 0, 0, head);
    else mk(new THREE.SphereGeometry(1.0, 32, 24), skinM, 0, 0, 0, head);
    var muzzle = mk(new THREE.SphereGeometry(0.62, 24, 16), faceM, 0, -0.22, 0.55, head); muzzle.scale.set(1.15, 0.85, 0.75);
    var eyes = [];
    [-1, 1].forEach(function (s) {
      if (kind === 'sloth') { var patch = mk(new THREE.SphereGeometry(0.3, 16, 12), std(0x4a3426), s * 0.38, 0.12, 0.8, head); patch.scale.set(1.3, 0.8, 0.5); patch.rotation.z = s * -0.5; }
      if (kind === 'owl') { var ring = mk(new THREE.TorusGeometry(0.33, 0.07, 8, 24), std(0xffd43b), s * 0.38, 0.18, 0.86, head); }
      var e = mk(new THREE.SphereGeometry(kind === 'owl' ? 0.3 : 0.24, 16, 12), white, s * 0.38, 0.18, 0.82, head);
      var p = mk(new THREE.SphereGeometry(0.12, 12, 10), black, 0, 0, 0.18, e);
      if (kind === 'sloth') { var lid = mk(new THREE.SphereGeometry(0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), skinM, 0, 0.02, 0.01, e); lid.rotation.x = 0.35; }
      eyes.push(e);
    });
    mk(new THREE.SphereGeometry(0.11, 12, 10), black, 0, -0.08, 1.05, head); // nose
    if (kind === 'penguin') { var beak = mk(new THREE.ConeGeometry(0.2, 0.5, 16), std(0xff922b), 0, -0.12, 1.12, head); beak.rotation.x = Math.PI / 2; }
    if (kind === 'owl') { var ob = mk(new THREE.ConeGeometry(0.13, 0.32, 12), std(0xffa94d), 0, -0.1, 1.02, head); ob.rotation.x = Math.PI / 1.6; [-1, 1].forEach(function (s) { var tuft = mk(new THREE.ConeGeometry(0.22, 0.6, 12), skinM, s * 0.6, 0.95, 0, head); tuft.rotation.z = s * -0.4; }); }
    if (kind === 'fox') {
      [-1, 1].forEach(function (s) { var ear = mk(new THREE.ConeGeometry(0.34, 0.8, 4), skinM, s * 0.58, 0.95, 0, head); ear.rotation.z = s * -0.35; mk(new THREE.ConeGeometry(0.18, 0.45, 4), black, 0, 0.16, 0.08, ear); });
      var tail = mk(new THREE.SphereGeometry(0.55, 20, 14), skinM, 1.25, 0.9, -0.6, body); tail.scale.set(0.8, 1.6, 0.8); tail.rotation.z = -0.6;
      var tip = mk(new THREE.SphereGeometry(0.3, 16, 12), faceM, 0, 0.5, 0, tail);
    }
    if (kind === 'sloth') { [-1, 1].forEach(function (s) { mk(new THREE.SphereGeometry(0.2, 12, 10), skinM, s * 0.85, 0.55, 0, head); }); }
    if (kind === 'wizard') {
      var hat = mk(new THREE.ConeGeometry(0.85, 1.8, 24), std(0x4c2bbf), 0, 1.45, -0.05, head); hat.rotation.z = 0.15;
      mk(new THREE.TorusGeometry(0.85, 0.12, 8, 30), std(0xffd43b, { metalness: 0.5, roughness: 0.3 }), 0, 0.6, -0.02, head).rotation.x = Math.PI / 2;
      var star = mk(new THREE.OctahedronGeometry(0.22), std(0xffe066, { emissive: 0x806000 }), 0.1, 0.2, 0.5, hat);
      var beard = mk(new THREE.ConeGeometry(0.5, 1.0, 20), std(0xf8f9fa), 0, -0.85, 0.55, head); beard.rotation.x = Math.PI;
    }
    if (kind === 'pip') { var ant = mk(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), std(0xe8590c), 0, 1.1, 0, head); mk(new THREE.SphereGeometry(0.16, 12, 10), std(0xff6b6b), 0, 0.35, 0, ant); }
    // stretchy cartoon arms: shoulder → hand
    var arms = [-1, 1].map(function (s) {
      var cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 12), std(new THREE.Color(k.jersey).getHex())); cyl.castShadow = true; root.add(cyl);
      var hand = mk(new THREE.SphereGeometry(0.34, 16, 12), std(k.hand), 0, 0, 0, root);
      return { side: s, cyl: cyl, hand: hand, shoulder: new THREE.Vector3(s * 1.05, 1.85, 0.1), pos: new THREE.Vector3(), rest: new THREE.Vector3() };
    });
    root.userData = { kind: kind, head: head, body: body, eyes: eyes, arms: arms, mood: null, moodT: 0, task: null, blinkAt: 0 };
    return root;
  }
  function placeCreature() {
    if (!crea || !ctx.layout) return;
    var D = ctx.layout.D, zc = -D / 2 - 1.95;
    crea.position.set(0, -0.3, zc); crea.scale.setScalar(1.3);
    crea.userData.arms.forEach(function (a) { a.rest.set(a.side * 1.55, 0.55, 1.9); if (!a.busy) a.pos.copy(a.rest); });
  }
  T3.setCreature = function (kind) {
    if (crea) { ctx.scene.remove(crea); crea = null; }
    if (kind) { crea = buildCreature(kind); ctx.scene.add(crea); placeCreature(); }
    ctx.refit();
  };
  T3.creatureMood = function (m) { if (crea) { crea.userData.mood = m; crea.userData.moodT = performance.now(); ctx.dirty(); ctx.startLoop(); } };
  function setArm(a) {
    var sw = crea.localToWorld(a.shoulder.clone()), hw = crea.localToWorld(a.pos.clone());
    a.hand.position.copy(a.pos);
    var dir = hw.clone().sub(sw), len = Math.max(0.2, dir.length());
    var mid = a.shoulder.clone().add(a.pos).multiplyScalar(0.5);
    a.cyl.position.copy(mid); a.cyl.scale.set(1, len, 1);
    a.cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }
  // The creature reaches over, grabs cube `id`, carries it above `zone`, and lets go. Then calls done().
  T3.creatureMove = function (id, zone, done) {
    if (!crea || !ctx.layout || document.hidden || !ctx.meshes[id]) { done(); return; }
    var m = ctx.meshes[id], r = ctx.layout.z[zone], target = new THREE.Vector3(r[0] + r[2] / 2, 2.6, r[1] + r[3] / 2 + 0.3);
    var arm = crea.userData.arms[m.position.x < 0 ? 0 : 1]; arm.busy = true;
    crea.userData.task = { stage: 0, t0: performance.now(), id: id, arm: arm, target: target, done: done, from: arm.pos.clone() };
    ctx.startLoop();
  };
  function toLocal(v) { return crea.worldToLocal(v.clone()); }
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function updateCreature(now) {
    if (!crea) return;
    var u = crea.userData, t = now / 1000, slow = u.kind === 'sloth' ? 0.5 : 1;
    // gentle breathing only
    u.body.position.y = Math.sin(t * 1.6 * slow) * 0.03;
    u.head.rotation.set(0, 0, 0);
    // blink now and then
    if (now > u.blinkAt) { u.blinkAt = now + 2500 + Math.random() * 3000; u.blinkEnd = now + 140; }
    u.eyes.forEach(function (e) { e.scale.y = now < u.blinkEnd ? 0.15 : 1; });
    // short reactions (each plays once)
    var mt = (now - u.moodT) / 1000, lift = 0;
    if (u.mood === 'think' && mt < 2.5) { u.head.rotation.z = 0.18 * ease(mt * 2); u.head.rotation.x = -0.1; }
    else if (u.mood === 'happy' && mt < 1.0) { lift = Math.abs(Math.sin(mt * Math.PI * 2)) * 0.5; }
    else if (u.mood === 'sad' && mt < 1.8) { u.head.rotation.x = 0.35 * Math.sin(Math.min(1, mt / 1.8) * Math.PI); }
    else if (u.mood === 'challenge' && mt < 1.0) { lift = Math.sin(mt * Math.PI) * 0.6; }
    else u.mood = null;
    u.body.position.y += lift;
    var armsUp = (u.mood === 'challenge' || u.mood === 'happy');
    // carrying a cube
    var task = u.task;
    if (task) {
      var m = ctx.meshes[task.id], a = task.arm, k = (now - task.t0) / 1000;
      var above = toLocal(new THREE.Vector3(m.position.x, 1.9, m.position.z)), grab = toLocal(new THREE.Vector3(m.position.x, m.position.y + 0.75, m.position.z)), tgt = toLocal(task.target);
      if (task.stage === 0) { a.pos.lerpVectors(task.from, above, ease(k / 0.55)); if (k > 0.55) { task.stage = 1; task.t0 = now; } }
      else if (task.stage === 1) { a.pos.lerpVectors(above, grab, ease(k / 0.18)); if (k > 0.18) { task.stage = 2; task.t0 = now; ctx.held = task.id; task.lift0 = a.pos.clone(); Snd.pickup(); ctx.dropAnims(m); } }
      else if (task.stage === 2) {
        var p = ease(k / 0.75); a.pos.lerpVectors(task.lift0, tgt, p); a.pos.y += Math.sin(p * Math.PI) * 1.2;
        if (k > 0.75) { task.stage = 3; task.t0 = now; ctx.held = null; ctx.meshes[task.id].userData.dropped = true; var d = task.done; task.ret0 = a.pos.clone(); d(); }
      }
      else if (task.stage === 3) { a.pos.lerpVectors(task.ret0, a.rest, ease(k / 0.5)); if (k > 0.5) { a.busy = false; u.task = null; } }
      if (ctx.held === task.id) { var hw = crea.localToWorld(a.pos.clone()); m.position.set(hw.x, hw.y - 0.7, hw.z); }
    }
    u.arms.forEach(function (a) {
      if (!a.busy) { var want = armsUp ? new THREE.Vector3(a.side * 1.7, 3.6, 0.6) : a.rest; a.pos.lerp(want, 0.2); }
      setArm(a);
    });
    ctx.dirty();
  }

  ctx.hooks.frame.push(updateCreature);
  // keep the creature in view when the camera fits the table
  ctx.hooks.extents.push(function (corners, W, D) {
    placeCreature();
    if (crea) { var top = (crea.userData.kind === 'wizard' ? 5.5 : 4.2) * 1.3; corners.push([-3, top, -D / 2 - 1.95], [3, top, -D / 2 - 1.95]); }
  });
})();
