// The kid's own footballer, built from three.js primitives (no downloaded assets).
// Origin = his hips. Like the creatures he is built facing +z; player.js turns him round so we see his back
// (name and number) from the camera. Arms use the shared two-bone ArmRig from common.js.
import * as THREE from 'three';
import { std, ArmRig, clamp } from './common.js';

// Kits for the kid. The first one matches his red jersey badge in the HUD; player.js picks another
// when the opponent's shirt is too close in colour.
export const KITS = {
  // Home kit: deep red with sea-green trim and tone-on-tone waves (national-team style; no crest or maker's logo).
  red: { jersey: '#c9342c', dark: '#b12a23', trim: '#2f8f7c', shorts: '#1f6b5a', sock: '#c9342c', waves: '#e2584b', ink: '#ffffff' },
  purple: { jersey: '#7048e8', dark: '#5730cf', trim: '#ffd43b', shorts: '#2b2f77', sock: '#7048e8' },
  teal: { jersey: '#0ca678', dark: '#087f5b', trim: '#ffffff', shorts: '#1d2b3a', sock: '#0ca678' }
};

export const KID = {
  SH_Y: 1.55, SH_X: 0.8,     // shoulders
  NECK_Y: 1.98, HEAD_UP: 0.62, HEAD_R: 0.74,
  TOP: 3.42, HIP_LOW: -0.66, // top of the hair, bottom of the shorts (local units)
  FOOT: -2.28                // soles of the boots
};

// Back of the shirt: lathe u = 0 is the chest (+z), u = 0.5 the back (-z). Name over the number, like a real kit.
export function kidJerseyTexture(kit, num, name) {
  const W = 512, H = 160, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = kit.jersey; g.fillRect(0, 0, W, H);
  if (kit.waves) {
    // tone-on-tone wavy lines all round the shirt (whole number of waves so the seam matches)
    g.strokeStyle = kit.waves; g.globalAlpha = 0.6; g.lineWidth = 1.6;
    for (let y = 16; y < H; y += 11) { g.beginPath(); for (let x = 0; x <= W; x += 4) { const yy = y + Math.sin(x / W * Math.PI * 2 * 9 + y * 0.35) * 2.6; if (x) g.lineTo(x, yy); else g.moveTo(x, yy); } g.stroke(); }
    g.globalAlpha = 1;
    // collar band in the trim colour with a thin red line through it; no hem band
    g.fillStyle = kit.trim; g.fillRect(0, 0, W, 11); g.fillStyle = kit.jersey; g.fillRect(0, 5, W, 1.5);
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, 11, W, 3);
  } else {
    // two soft side panels in the darker shade (under the arms)
    g.fillStyle = kit.dark; g.fillRect(W * 0.2, 0, W * 0.07, H); g.fillRect(W * 0.73, 0, W * 0.07, H);
    // collar and hem trim
    g.fillStyle = kit.trim; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 9, W, 9);
    g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, 10, W, 4);
    // little crest on the chest (wearer's left), seen only when he turns
    g.fillStyle = '#fff'; g.beginPath(); g.arc(W * 0.06, 52, 11, 0, 7); g.fill();
    g.fillStyle = kit.dark; g.beginPath(); g.arc(W * 0.06, 52, 5, 0, 7); g.fill();
  }
  const cx = W * 0.5;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const nm = String(name || '').toUpperCase().slice(0, 12);
  if (nm) {
    let fs = 24; g.font = '900 ' + fs + 'px "Arial Black", Impact, "Trebuchet MS", sans-serif';
    const maxW = W * 0.3; while (fs > 12 && g.measureText(nm).width > maxW) { fs -= 1; g.font = '900 ' + fs + 'px "Arial Black", Impact, "Trebuchet MS", sans-serif'; }
    g.lineWidth = kit.ink ? 3 : 5; g.strokeStyle = kit.ink ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.35)'; g.strokeText(nm, cx, 34);
    g.fillStyle = kit.ink || (kit.trim === '#ffffff' ? '#ffffff' : kit.trim); g.fillText(nm, cx, 34);
  }
  const n = String(num || '7').slice(0, 2);
  g.font = '900 ' + (n.length > 1 ? 84 : 92) + 'px "Arial Black", Impact, "Trebuchet MS", sans-serif';
  if (!kit.ink) { g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,.4)'; g.strokeText(n, cx, 98); }
  g.lineWidth = kit.ink ? 5 : 6; g.strokeStyle = kit.trim === '#ffffff' ? kit.dark : kit.trim; g.strokeText(n, cx, 98);
  g.fillStyle = '#fff'; g.fillText(n, cx, 98);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2; return tex;
}

// Hair: one displaced sphere. Vertices outside the hairline are pushed inside the head so they never show.
function hairGeometry(R) {
  const g = new THREE.SphereGeometry(1, 28, 18), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // hairline: high over the forehead (+z), low at the nape (-z), above the ears at the sides
    const front = clamp(v.z, 0, 1), back = clamp(-v.z, 0, 1);
    const line = 0.32 * front - 0.42 * back + 0.05 * (1 - front - back) - 0.12 * Math.abs(v.x) * back;
    let r;
    if (v.y > line) {
      const th = Math.atan2(v.x, v.z), ph = Math.acos(clamp(v.y, -1, 1));
      r = R * (1.075 + 0.035 * Math.sin(th * 6 + ph * 3) * Math.sin(ph * 5) + 0.03 * clamp((v.y - line) * 4, 0, 1));
    } else r = R * 0.9;
    p.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  g.computeVertexNormals();
  return g;
}

export function buildKid(kit, num, name) {
  const root = new THREE.Group(), body = new THREE.Group(), chest = new THREE.Group();
  root.add(body); body.add(chest);
  const skin = std(0xf2c39b, { roughness: 0.7 }), hairM = std(0x4a2c17, { roughness: 0.85 }), dark = std(0x231a16, { roughness: 0.35 });
  const jerseyTex = kidJerseyTexture(kit, num, name);
  const shirtM = std(0xffffff, { map: jerseyTex, roughness: 0.85 }), sleeveM = std(new THREE.Color(kit.jersey).getHex(), { roughness: 0.85 });
  const trimM = std(new THREE.Color(kit.trim).getHex(), { roughness: 0.7 }), shortsM = std(new THREE.Color(kit.shorts).getHex(), { roughness: 0.8 });
  const add = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m; };

  // ----- torso (lathe, u = 0 at the chest so the back number sits mid-texture) -----
  const pts = new THREE.SplineCurve([[0.001, 0], [0.62, 0.04], [0.82, 0.3], [0.86, 0.75], [0.84, 1.2], [0.8, 1.52], [0.6, 1.78], [0.4, 1.86], [0.001, 1.88]]
    .map((q) => new THREE.Vector2(q[0], q[1]))).getPoints(22);
  pts[0].x = 0.001;
  const torso = add(new THREE.LatheGeometry(pts, 32, 0, Math.PI * 2), shirtM, chest);
  const collar = add(new THREE.TorusGeometry(0.4, 0.075, 6, 24), trimM, chest, 0, 1.8, 0); collar.rotation.x = Math.PI / 2;
  // shorts below the shirt (the screen edge normally cuts him off around here)
  add(new THREE.CylinderGeometry(0.8, 0.84, 0.72, 24, 1, true), shortsM, body, 0, -0.3, 0);
  // legs, socks and boots down to the pitch (feet at KID.FOOT). Children of root, so a lean bends only the upper body.
  const sockM = std(new THREE.Color(kit.sock).getHex(), { roughness: 0.85 }), bootM = std(0x1f2430, { roughness: 0.45 });
  const thighG = new THREE.CylinderGeometry(0.19, 0.17, 0.62, 10), sockG = new THREE.CylinderGeometry(0.18, 0.15, 0.95, 10), bootG = new THREE.SphereGeometry(1, 12, 8);
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group(); leg.position.set(s * 0.38, -0.6, 0); root.add(leg);
    add(thighG, skin, leg, 0, -0.28, 0);
    add(sockG, sockM, leg, 0, -1.0, 0);
    const b = add(bootG, bootM, leg, 0, -1.55, 0.1); b.scale.set(0.2, 0.13, 0.32);
    return leg;
  });

  // ----- head -----
  const neck = new THREE.Group(); neck.position.set(0, KID.NECK_Y - 0.25, 0); neck.rotation.order = 'YXZ'; chest.add(neck);
  add(new THREE.CylinderGeometry(0.22, 0.25, 0.5, 12), skin, neck, 0, 0.18, 0);
  const head = new THREE.Group(); head.position.set(0, 0.25 + KID.HEAD_UP, 0.04); head.rotation.order = 'YXZ'; neck.add(head);
  const hg = new THREE.SphereGeometry(KID.HEAD_R, 28, 20); hg.scale(1, 1.02, 0.98);
  add(hg, skin, head);
  add(hairGeometry(KID.HEAD_R), hairM, head);
  // a cowlick at the crown: the bit of personality you see from behind
  const tuft = add(new THREE.ConeGeometry(0.11, 0.36, 8), hairM, head, -0.04, KID.HEAD_R * 1.0, -0.24); tuft.rotation.set(-0.55, 0, 0.25);
  // ears
  const earG = new THREE.SphereGeometry(1, 12, 8);
  [-1, 1].forEach((s) => { const e = add(earG, skin, head, s * KID.HEAD_R * 0.97, -0.02, -0.02); e.scale.set(0.1, 0.19, 0.14); });
  // eyes, for the moments he turns his head (he mostly faces the table, so that's all the face he needs)
  const eyeG = new THREE.SphereGeometry(1, 10, 8);
  [-1, 1].forEach((s) => { const e = add(eyeG, dark, head, s * 0.25, 0.06, KID.HEAD_R * 0.9); e.scale.set(0.075, 0.105, 0.05); });

  // ----- arms: index 0 = his right (local -x), 1 = his left (local +x) -----
  const arms = [-1, 1].map((side) => new ArmRig(chest, side, {
    L1: 0.92, L2: 0.98, shoulder: [side * KID.SH_X, KID.SH_Y, 0], maxStretch: 1.12, rUp: 0.15, rFore: 0.14, sleeveR: 0.22,
    furMat: skin, sleeveMat: sleeveM, trimMat: trimM, hand: { mat: skin, scale: 0.6 }
  }));
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  function setKit(k, n, nm) {
    const old = shirtM.map; shirtM.map = kidJerseyTexture(k, n, nm); shirtM.needsUpdate = true; if (old) old.dispose();
    sleeveM.color.set(k.jersey); trimM.color.set(k.trim); shortsM.color.set(k.shorts); sockM.color.set(k.sock);
  }
  return { root, body, chest, neck, head, torso, arms, legs, setKit };
}
