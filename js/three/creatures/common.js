// Shared helpers for the creature packs: math, materials, jersey textures, and the
// two-bone stretchy arm with a gripping hand. No per-frame allocations in solve().
import * as THREE from 'three';

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export const easeIO = (x) => { x = clamp(x, 0, 1); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
export const easeOut = (x) => { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };
// ease out with a little overshoot (follow-through); c = 0 gives a plain ease-out
export const easeBack = (x, c) => {
  x = clamp(x, 0, 1); if (!c) return easeOut(x);
  const c3 = c + 1; return 1 + c3 * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

export function std(color, o) {
  return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.62, metalness: 0 }, o || {}));
}

// Soft fake ambient occlusion: darken vertices toward the bottom of a geometry (needs vertexColors on the material).
export function shade(geo, top, bottom) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, p = geo.attributes.position, c = new Float32Array(p.count * 3), h = (bb.max.y - bb.min.y) || 1;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - bb.min.y) / h, v = bottom + (top - bottom) * Math.pow(t, 0.8);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// Box with rounded corners built from a subdivided BoxGeometry (no addon import needed).
export function roundedBox(w, h, d, r, seg) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new THREE.Vector3(), inner = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    v.sub(inner); const l = v.length() || 1; v.divideScalar(l);
    n.setXYZ(i, v.x, v.y, v.z); p.setXYZ(i, inner.x + v.x * r, inner.y + v.y * r, inner.z + v.z * r);
  }
  return g;
}

export function dispose(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }
  });
}

// ----- Jersey texture: wraps the torso; u = 0.5 is the chest, number on the front. -----
export const TEAM = {
  sloth: { jersey: '#2f9e44', dark: '#237a35', trim: '#d8f5a2', num: '1', pattern: 'sash' },
  penguin: { jersey: '#4dabf7', dark: '#2f8fe0', trim: '#ffffff', num: '4', pattern: 'stripes' },
  fox: { jersey: '#e03131', dark: '#b52424', trim: '#ffffff', num: '9', pattern: 'hoops' },
  owl: { jersey: '#1c3d8c', dark: '#142c68', trim: '#ffd43b', num: '8', pattern: 'chevron' },
  wizard: { jersey: '#fab005', dark: '#d99200', trim: '#5f3dc4', num: '99', pattern: 'stars' },
  pip: { jersey: '#ff922b', dark: '#e8710a', trim: '#ffffff', num: 'P', pattern: 'dots' }
};
export function jerseyTexture(t) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = t.jersey; g.fillRect(0, 0, 1024, 256);
  g.save();
  switch (t.pattern) {
    case 'stripes': g.fillStyle = t.dark; for (let x = 0; x < 1024; x += 64) g.fillRect(x, 0, 32, 256); break;
    case 'hoops': g.fillStyle = t.dark; for (let y = 30; y < 256; y += 56) g.fillRect(0, y, 1024, 26); break;
    case 'sash': g.fillStyle = t.dark; g.beginPath(); g.moveTo(360, 0); g.lineTo(470, 0); g.lineTo(670, 256); g.lineTo(560, 256); g.fill(); break;
    case 'chevron': g.strokeStyle = t.dark; g.lineWidth = 16; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(312, 40 + k * 60); g.lineTo(512, 100 + k * 60); g.lineTo(712, 40 + k * 60); g.stroke(); } break;
    case 'stars': g.fillStyle = t.dark; for (let i = 0; i < 40; i++) { const x = (i * 197) % 1024, y = (i * 83) % 230 + 14; star(g, x, y, 11, 5); } break;
    case 'dots': g.fillStyle = t.dark; for (let i = 0; i < 60; i++) { g.beginPath(); g.arc((i * 151) % 1024, (i * 71) % 220 + 20, 9, 0, 7); g.fill(); } break;
  }
  g.restore();
  // trim: collar at the top, hem at the bottom
  g.fillStyle = t.trim; g.fillRect(0, 0, 1024, 20); g.fillRect(0, 236, 1024, 20);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 20, 1024, 8);
  // little soccer-ball crest on the wearer's left chest
  g.fillStyle = '#fff'; g.beginPath(); g.arc(670, 96, 24, 0, 7); g.fill();
  g.fillStyle = '#222'; g.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 0.4; g.lineTo(670 + Math.cos(a) * 11, 96 + Math.sin(a) * 11); } g.fill();
  g.lineWidth = 4; g.strokeStyle = t.trim; g.beginPath(); g.arc(670, 96, 27, 0, 7); g.stroke();
  // big number, outlined so it reads at any jersey color
  g.font = '900 ' + (t.num.length > 1 ? 150 : 170) + 'px "Arial Black", Impact, "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = 'rgba(0,0,0,.45)'; g.strokeText(t.num, 512, 140);
  g.lineWidth = 12; g.strokeStyle = t.trim; g.strokeText(t.num, 512, 140);
  g.fillStyle = '#fff'; g.fillText(t.num, 512, 140);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
function star(g, x, y, r, n) {
  g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill();
}

// Smooth chunky torso (lathe) with the jersey wrapped on it. Origin at the hips, neck at y ~ 1.85.
export function jerseyTorso(team, scaleX) {
  const pts = new THREE.SplineCurve([[0.001, 0], [0.7, 0.04], [1.02, 0.28], [1.1, 0.7], [1.04, 1.2], [0.92, 1.58], [0.66, 1.82], [0.42, 1.9], [0.001, 1.92]].map((p) => new THREE.Vector2(p[0] * (scaleX || 1), p[1]))).getPoints(34);
  pts[0].x = 0.001;
  const geo = new THREE.LatheGeometry(pts, 48, Math.PI, Math.PI * 2);
  const mesh = new THREE.Mesh(geo, std(0xffffff, { map: jerseyTexture(team), roughness: 0.85 }));
  mesh.castShadow = false;
  return mesh;
}

// ----- Two-bone stretchy arm with a gripping hand -----
const _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1), _DOWN = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _E = new THREE.Vector3(), _W = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
let _cyl = null, _cylSleeve = null;

function sphere(r, mat, parent, shadow) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat); m.castShadow = !!shadow; parent.add(m); return m;
}
function placeSeg(m, A, B, r) {
  _e.subVectors(B, A); const len = _e.length() || 1e-4;
  m.position.set((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  m.scale.set(r, len, r); m.quaternion.setFromUnitVectors(_Y, _e.divideScalar(len));
}

export class ArmRig {
  // o: { L1, L2, shoulder:[x,y,z], maxStretch, rUp, rFore, furMat, sleeveMat, trimMat, cuffMat, hand:{...} }
  constructor(parent, side, o) {
    this.side = side; this.L1 = o.L1; this.L2 = o.L2; this.maxStretch = o.maxStretch || 3.6;
    this.rUp = o.rUp || 0.22; this.rFore = o.rFore || 0.2; this.sleeveR = o.sleeveR || 0.3; this.hasSleeve = o.sleeveMat != null;
    this.baseShoulder = new THREE.Vector3(o.shoulder[0], o.shoulder[1], o.shoulder[2]);
    this.shoulder = this.baseShoulder.clone();
    this.pos = new THREE.Vector3(); this.stretch = 1; this.open = 0.3; this.glove = o.cuffMat != null;
    this.group = new THREE.Group(); parent.add(this.group);
    if (!_cyl) { _cyl = new THREE.CylinderGeometry(1, 1, 1, 16, 1); _cyl.userData.shared = true; _cylSleeve = new THREE.CylinderGeometry(0.94, 1, 1, 20, 1); _cylSleeve.userData.shared = true; }
    const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; this.group.add(m); return m; };
    this.upper = mk(_cyl, o.furMat); this.fore = mk(_cyl, o.foreMat || o.furMat);
    this.elbow = sphere(1, o.foreMat || o.furMat, this.group, true);
    this.sBall = sphere(1, o.sleeveMat || o.furMat, this.group, false);
    if (o.sleeveMat) {
      this.sleeve = mk(_cylSleeve, o.sleeveMat);
      this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.17, 8, 24), o.trimMat); this.ring.castShadow = false; this.group.add(this.ring);
    }
    if (o.cuffMat) { this.cuff = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 8, 20), o.cuffMat); this.cuff.castShadow = true; this.group.add(this.cuff); }
    this.hand = this._buildHand(o.hand || {}, side); this.group.add(this.hand);
  }
  _buildHand(h, side) {
    const g = new THREE.Group(), skin = h.mat, sc = h.scale || 1;
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), skin); palm.scale.set(0.58 * sc, 0.27 * sc, 0.46 * sc); palm.castShadow = true; g.add(palm);
    const mkPad = (x, n, r, len, tipMat) => {
      const piv = new THREE.Group(); piv.position.set(x, -0.1 * sc, 0); g.add(piv);
      for (let i = 0; i < n; i++) {
        const c = new THREE.Mesh(new THREE.CapsuleGeometry(r * sc, len * sc, 4, 10), skin); c.castShadow = true;
        c.position.set(0, -(len * 0.5 + r) * sc * 0.95, n > 1 ? (i - (n - 1) / 2) * r * 2.05 * sc : 0); piv.add(c);
        if (tipMat) { const t = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62 * sc, 10, 8), tipMat); t.position.set(0, -(len + r * 1.6) * sc * 0.95, c.position.z); t.scale.y = 0.75; piv.add(t); }
      }
      return piv;
    };
    // thumb on the side toward the body's midline, three fingers on the outside
    this.padT = mkPad(-side * 0.56 * sc, 1, 0.15, 0.3, h.tip); this.padF = mkPad(side * 0.56 * sc, 3, 0.115, 0.34, h.tip);
    this.padT.userData.dir = -side; this.padF.userData.dir = side;
    if (h.stripe) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.1 * sc, 0.05, 0.12 * sc), h.stripe); s.position.set(0, 0.2 * sc, 0.4 * sc); g.add(s); }
    return g;
  }
  setShoulderLift(dy) { this.shoulder.y = this.baseShoulder.y + dy; }
  // Solve for wrist target (tx,ty,tz in the parent's space). align: 0 hang along forearm .. 1 pads straight down.
  solve(tx, ty, tz, align, yaw) {
    const S = this.shoulder, side = this.side;
    _a.set(tx - S.x, ty - S.y, tz - S.z); let d = _a.length();
    const reach = (this.L1 + this.L2) * 0.985; let s = 1;
    if (d > reach) { s = d / reach; if (s > this.maxStretch) { s = this.maxStretch; d = reach * s; _a.setLength(d); } }
    if (d < 0.45) { d = 0.45; if (_a.lengthSq() < 1e-6) _a.set(0, -1, 0); _a.setLength(d); }
    this.stretch = s;
    const l1 = this.L1 * s, l2 = this.L2 * s, vx = _a.x / d, vy = _a.y / d, vz = _a.z / d;
    const a = (d * d + l1 * l1 - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    // elbow bends out, down and a bit back
    _b.set(side * 0.55, -0.8, -0.3); const dot = _b.x * vx + _b.y * vy + _b.z * vz;
    _b.set(_b.x - vx * dot, _b.y - vy * dot, _b.z - vz * dot);
    if (_b.lengthSq() < 1e-4) _b.set(0, -1, 0); else _b.normalize();
    _E.set(S.x + vx * a + _b.x * h, S.y + vy * a + _b.y * h, S.z + vz * a + _b.z * h);
    _W.set(S.x + _a.x, S.y + _a.y, S.z + _a.z);
    this.pos.copy(_W);
    const tk = clamp(1 / Math.sqrt(s), 0.78, 1);
    placeSeg(this.upper, S, _E, this.rUp * tk); placeSeg(this.fore, _E, _W, this.rFore * tk);
    this.elbow.position.copy(_E); this.elbow.scale.setScalar(this.rFore * tk * 1.08);
    this.sBall.position.copy(S); this.sBall.scale.setScalar((this.hasSleeve ? this.sleeveR : this.rUp) * 1.03 * Math.pow(tk, 0.5));
    // upper-arm direction
    _f.subVectors(_E, S).normalize();
    if (this.sleeve) {
      const sl = Math.min(l1 * 0.62, 0.78); _b.copy(S).addScaledVector(_f, sl);
      placeSeg(this.sleeve, S, _b, this.sleeveR * Math.pow(tk, 0.5));
      this.ring.position.copy(_b); this.ring.quaternion.setFromUnitVectors(_Z, _f); this.ring.scale.setScalar(this.sleeveR * Math.pow(tk, 0.5) * 0.99);
    }
    // forearm direction → hand
    _f.subVectors(_W, _E).normalize();
    if (this.cuff) { this.cuff.position.copy(_W).addScaledVector(_f, -0.1); this.cuff.quaternion.setFromUnitVectors(_Z, _f); this.cuff.scale.setScalar(this.rFore * tk * 1.12); }
    this.hand.position.copy(_W);
    _b.copy(_f).lerp(_DOWN, align); if (_b.lengthSq() < 1e-4) _b.copy(_f); else _b.normalize();
    _q.setFromUnitVectors(_DOWN, _b); _q2.setFromAxisAngle(_Y, yaw * align); _q.multiply(_q2); this.hand.quaternion.copy(_q);
    const ang = this.open * 0.66 - 0.04;
    this.padT.rotation.z = this.padT.userData.dir * ang; this.padF.rotation.z = this.padF.userData.dir * ang;
  }
}
