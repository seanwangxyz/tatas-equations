// Soccer kit for the glTF monsters: a fitted jersey that is skinned to the monster's own spine bones (so it bends,
// breathes and leans with the body), plus a team scarf. Both are built from the model's own geometry at load time.
//
//   buildJerseyData(skinnedMesh, bones, cfg)  -> geometry for a vest cut from the torso triangles, UV-mapped around the chest
//   makeJerseyMesh(data, team, skinnedMesh)   -> THREE.SkinnedMesh sharing that skeleton
//   makeScarf(team, ...)                      -> ring + tails (meshes in the model's bind space; the caller attaches them to a bone)
import * as THREE from 'three';

const TAU = Math.PI * 2;

// ---------- textures ----------
// The jersey wraps around the torso: u = 0.5 is the chest, v = 1 is the neckline. C / Hh are the world size of the wrap
// (circumference, height) so the number is drawn undistorted whatever the torso proportions are.
export function fitJerseyTexture(t, C, Hh) {
  const W = 1024, H = 512, ax = C / W, ay = Hh / H, sx = ay / ax;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = t.jersey; g.fillRect(0, 0, W, H);
  switch (t.pattern) {
    case 'stripes': g.fillStyle = t.dark; for (let x = 0; x < W; x += 96) g.fillRect(x, 0, 48, H); break;
    case 'hoops': g.fillStyle = t.dark; for (let y = 40; y < H; y += 120) g.fillRect(0, y, W, 56); break;
    case 'sash': g.fillStyle = t.dark; g.beginPath(); g.moveTo(300, 0); g.lineTo(470, 0); g.lineTo(720, H); g.lineTo(550, H); g.fill(); break;
    case 'chevron': g.strokeStyle = t.dark; g.lineWidth = 30; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(272, 90 + k * 110); g.lineTo(512, 180 + k * 110); g.lineTo(752, 90 + k * 110); g.stroke(); } break;
    default: break;
  }
  // collar band at the top, hem at the bottom, and a darker rim under the collar so the neckline reads
  g.fillStyle = t.trim; g.fillRect(0, 0, W, H * 0.09); g.fillRect(0, H * 0.94, W, H * 0.06);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, H * 0.09, W, H * 0.025);
  // big number on the chest (and on the back, split across the wrap seam), outlined so it reads on any colour at game size
  const drawNum = (cx) => {
    g.save(); g.translate(cx, H * 0.54); g.scale(sx, 1);
    g.font = '900 ' + Math.round(H * (t.num.length > 1 ? 0.4 : 0.48)) + 'px "Arial Black", Impact, "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 46; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(t.num, 0, 0);
    g.lineWidth = 26; g.strokeStyle = t.trim; g.strokeText(t.num, 0, 0);
    g.fillStyle = '#fff'; g.fillText(t.num, 0, 0); g.restore();
  };
  drawNum(W * 0.5); drawNum(0); drawNum(W);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
function scarfTexture(t) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const g = cv.getContext('2d');
  const cols = [t.jersey, '#ffffff', t.trim, '#ffffff'];
  for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * 32, 0, 32, 64); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex;
}

// ---------- fitted jersey ----------
// bones: the skeleton's bone list; torso = names whose weights make a vertex "torso".
export function buildJerseyData(sm, cfg) {
  const geo = sm.geometry, pos = geo.attributes.position, nor = geo.attributes.normal, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, idx = geo.index;
  if (!pos || !si || !sw || !idx) return null;
  const bones = sm.skeleton.bones, names = cfg.torso || ['pelvis', 'spine_01', 'spine_02', 'spine_03'];
  const tj = new Set(); bones.forEach((b, i) => { if (names.indexOf(b.name) >= 0) tj.add(i); });
  const n = pos.count, ok = new Uint8Array(n), thr = cfg.weight || 0.7;
  const yMin = cfg.yMin, yMax = cfg.yMax;
  for (let i = 0; i < n; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (tj.has(si.getComponent ? si.getComponent(i, k) : si.array[i * 4 + k])) w += sw.getComponent(i, k);
    const y = pos.getY(i);
    ok[i] = (w >= thr && y >= yMin && y <= yMax) ? 1 : 0;
  }
  const tris = [];
  for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (ok[a] && ok[b] && ok[c]) tris.push(a, b, c); }
  if (tris.length < 60) return null;
  // wrap centre, size
  let cx = 0, cz = 0, y0 = 1e9, y1 = -1e9, cnt = 0;
  for (let i = 0; i < tris.length; i++) { const v = tris[i]; cx += pos.getX(v); cz += pos.getZ(v); cnt++; const y = pos.getY(v); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  cx /= cnt; cz /= cnt; if (cfg.cz !== undefined) cz += cfg.cz;
  let rs = 0; for (let i = 0; i < tris.length; i++) { const v = tris[i]; rs += Math.hypot(pos.getX(v) - cx, pos.getZ(v) - cz); } rs /= cnt;
  const m = tris.length, P = new Float32Array(m * 3), N = new Float32Array(m * 3), UV = new Float32Array(m * 2), SI = new Float32Array(m * 4), SW = new Float32Array(m * 4);
  const eps = cfg.offset || 0.01, us = [0, 0, 0];
  for (let i = 0; i < m; i++) {
    const v = tris[i], x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v), nx = nor.getX(v), ny = nor.getY(v), nz = nor.getZ(v);
    P[i * 3] = x + nx * eps; P[i * 3 + 1] = y + ny * eps; P[i * 3 + 2] = z + nz * eps; N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz;
    UV[i * 2] = 0.5 + Math.atan2(x - cx, z - cz) / TAU; UV[i * 2 + 1] = (y - y0) / (y1 - y0 || 1);
    for (let k = 0; k < 4; k++) { SI[i * 4 + k] = si.getComponent(v, k); SW[i * 4 + k] = sw.getComponent(v, k); }
  }
  for (let t = 0; t < m; t += 3) {            // triangles that straddle the wrap seam (at the back): bring them to the same side
    const a = UV[t * 2], b = UV[t * 2 + 2], c = UV[t * 2 + 4], mx = Math.max(a, b, c), mn = Math.min(a, b, c);
    if (mx - mn > 0.5) { if (a < 0.5) UV[t * 2] += 1; if (b < 0.5) UV[t * 2 + 2] += 1; if (c < 0.5) UV[t * 2 + 4] += 1; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  g.userData.shared = true;               // cached per model and reused by every creature built from it: never disposed with one
  return { geo: g, C: TAU * rs, Hh: y1 - y0, y0, y1, cx, cz };
}
export function makeJerseyMesh(data, team, sm) {
  const mat = new THREE.MeshStandardMaterial({ map: fitJerseyTexture(team, data.C, data.Hh), roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.SkinnedMesh(data.geo, mat); m.name = 'Jersey'; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
  m.bind(sm.skeleton, sm.bindMatrix);
  return m;
}

// ---------- captain's armband ----------
// A band around the upper arm, sized from the arm's own geometry (bind pose, model space). pa/pb = shoulder / elbow positions.
export function makeArmband(sm, pa, pb, team, o) {
  o = o || {};
  const dir = new THREE.Vector3().subVectors(pb, pa), L = dir.length(); dir.divideScalar(L);
  const P = sm.geometry.attributes.position, t0 = (o.at !== undefined ? o.at : 0.5), v = new THREE.Vector3(), rs = [];
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).sub(pa); const t = v.dot(dir) / L; if (t < t0 - 0.06 || t > t0 + 0.06) continue;
    const d = v.addScaledVector(dir, -v.dot(dir)).length(); if (d < L * 0.5) rs.push(d);
  }
  if (rs.length < 8) return null;
  rs.sort((a, b) => a - b); const R = rs[Math.floor(rs.length * 0.85)] + (o.pad !== undefined ? o.pad : 0.006), w = (o.width !== undefined ? o.width : 0.2) * L;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const g = cv.getContext('2d');
  g.fillStyle = team.trim; g.fillRect(0, 0, 256, 64); g.fillStyle = team.jersey; g.fillRect(0, 0, 256, 10); g.fillRect(0, 54, 256, 10);
  g.fillStyle = '#111'; g.font = '900 52px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C', 128, 34);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.CylinderGeometry(R, R * 1.04, w, 28, 1, true), m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
  m.name = 'Armband'; m.castShadow = false; m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); m.position.copy(pa).addScaledVector(dir, t0 * L);
  return m;
}

// ---------- scarf ----------
// Everything is built in the model's bind space (model units, y up, facing +z), centred on `c` (the neck base).
// o: { R: ring radius, r: tube radius, tail: length, tailW: width, front: z of the chest surface below the knot }
export function makeScarf(team, c, o) {
  const g = new THREE.Group(); g.name = 'Scarf';
  const tex = scarfTexture(team), mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const tt = tex.clone(); tt.needsUpdate = true; tt.center.set(0.5, 0.5); tt.rotation = Math.PI / 2; tt.repeat.set(1, 1);      // tails: stripes run ACROSS the scarf
  const tmat = new THREE.MeshStandardMaterial({ map: tt, roughness: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(o.R, o.r, 12, 36), mat); ring.rotation.x = Math.PI / 2; ring.position.copy(c); ring.scale.set(1, 1.0, 0.8); g.add(ring);
  // knot + two tails hanging down the chest from the side of the neck (the middle of the chest stays free for the shirt number)
  const kx = c.x + o.R * 0.78, kz = c.z + o.R * 0.62;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(o.r * 1.4, 14, 10), mat); knot.position.set(kx, c.y - o.r * 0.3, kz); g.add(knot);
  for (let i = 0; i < (o.tails === false ? 0 : 2); i++) {
    const w = o.tailW, L = o.tail * (i ? 0.72 : 1);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(w, L, o.r * 0.6, 1, 1, 1), tmat);
    tail.position.set(kx + (i ? w * 0.55 : -w * 0.45), c.y - o.r - L / 2 + o.r * 0.3, o.front + o.r * 0.35 + i * 0.004);
    tail.rotation.z = (i ? -0.1 : 0.08); tail.rotation.x = -0.06 - i * 0.04; g.add(tail);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  return g;
}
