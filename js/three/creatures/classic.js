// The "classic" pack: five soccer-jersey animal/wizard opponents plus Pip, all built from
// three.js primitives. Origin of every actor = its hips; it faces +z (toward the player).
import * as THREE from 'three';
import { std, shade, roundedBox, jerseyTorso, TEAM, ArmRig, clamp } from './common.js';

// Personality: speed (<1 faster), anticipate (s), overshoot (0..1), look (gaze follow rate /s),
// breath (period s), blink {close, open, gap:[min,max]}, lid (resting eyelid openness), moodScale (reaction length).
export const STYLE = {
  sloth: { dances: ['sky', 'shuffle', 'slide'], danceAmp: 0.5, turns: 0, speed: 1.35, anticipate: 0.45, overshoot: 0, look: 2.6, breath: 6.2, blink: { c: 0.2, o: 0.28, g: [3.2, 6.5] }, lid: 0.62, moodScale: 1.3, headGain: 0.5, hand: 0.9 },
  penguin: { dances: ['shuffle', 'plane', 'spin'], danceAmp: 1, turns: 1, speed: 1.0, anticipate: 0.24, overshoot: 0.35, look: 5.5, breath: 4.4, blink: { c: 0.09, o: 0.14, g: [2.6, 5.2] }, lid: 0.9, moodScale: 1, headGain: 0.55, hand: 1.0 },
  fox: { dances: ['plane', 'slide', 'spin'], danceAmp: 1.25, turns: 2, speed: 0.78, anticipate: 0.12, overshoot: 0.9, look: 9, breath: 3.6, blink: { c: 0.07, o: 0.12, g: [2.2, 4.6] }, lid: 0.82, moodScale: 0.85, headGain: 0.55, hand: 1.0 },
  owl: { dances: ['robot', 'sky', 'plane'], danceAmp: 1, turns: 1, speed: 1.05, anticipate: 0.3, overshoot: 0.2, look: 5, breath: 5.0, blink: { c: 0.12, o: 0.2, g: [3.5, 7] }, lid: 0.92, moodScale: 1.1, headGain: 0.85, hand: 1.0 },
  wizard: { dances: ['spin', 'sky', 'shuffle'], danceAmp: 0.9, turns: 1, speed: 1.05, anticipate: 0.3, overshoot: 0.5, look: 4.5, breath: 5.2, blink: { c: 0.11, o: 0.18, g: [3, 6] }, lid: 0.88, moodScale: 1.1, headGain: 0.55, hand: 1.0, flourish: true },
  pip: { dances: ['robot', 'plane', 'slide'], danceAmp: 1.1, turns: 1, speed: 0.95, anticipate: 0.2, overshoot: 0.6, look: 6.5, breath: 4.0, blink: { c: 0.08, o: 0.13, g: [2.4, 5] }, lid: 0.92, moodScale: 0.95, headGain: 0.55, hand: 1.0 }
};

const SPEC = {
  sloth: { color: 0x9a7b57, head: [1.06, 0.95, 0.95], torsoW: 1.0, top: 3.3, L1: 1.4, L2: 1.5 },
  penguin: { color: 0x262b36, head: [1.02, 0.95, 0.95], torsoW: 1.0, top: 3.3, L1: 1.3, L2: 1.4 },
  fox: { color: 0xf08c3a, head: [1.04, 0.9, 0.95], torsoW: 0.95, top: 4.1, L1: 1.3, L2: 1.4 },
  owl: { color: 0x7d5ba6, head: [1.14, 0.95, 0.95], torsoW: 1.0, top: 3.9, L1: 1.3, L2: 1.4 },
  wizard: { color: 0xf1c9a5, head: [0.98, 1.0, 0.95], torsoW: 1.0, top: 5.3, L1: 1.3, L2: 1.4 },
  pip: { color: 0xffd43b, head: [0.93, 0.88, 0.88], torsoW: 0.9, top: 3.4, L1: 1.25, L2: 1.35 }
};

export const HOLD = 0.66;              // wrist height above the center of a held die (actor units)
export function restPos(side) { return new THREE.Vector3(side * 1.75, 0.2, 1.45); }

function hex(s) { return new THREE.Color(s).getHex(); }

export function buildClassic(kind) {
  if (!SPEC[kind]) kind = 'pip';
  const sp = SPEC[kind], team = TEAM[kind], H = sp.head, root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const fur = std(sp.color, { vertexColors: true }), furP = std(sp.color), black = std(0x15161a, { roughness: 0.35 }), white = std(0xffffff, { roughness: 0.3 });
  const jerseyM = std(hex(team.jersey)), trimM = std(hex(team.trim));
  const ex = []; // per-frame extras: functions (P, now)
  const mesh = (geo, mat, parent, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (sx) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz); parent.add(m); return m; };
  const sph = (r, mat, parent, x, y, z, sx, sy, sz) => mesh(new THREE.SphereGeometry(r, 24, 16), mat, parent, x, y, z, sx, sy, sz);
  const cone = (r, h, mat, parent, x, y, z, seg) => mesh(new THREE.ConeGeometry(r, h, seg || 20), mat, parent, x, y, z);

  // ----- torso + collar -----
  const torso = jerseyTorso(team, sp.torsoW); body.add(torso);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.64 * sp.torsoW, 0.1, 8, 30), trimM); collar.rotation.x = Math.PI / 2; collar.position.y = 1.8; body.add(collar);

  // ----- head -----
  const neck = new THREE.Group(); neck.position.set(0, 1.7, 0.02); neck.rotation.order = 'YXZ'; body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.66, 0.08); neck.add(head);
  let hg;
  if (kind === 'pip') hg = shade(roundedBox(H[0] * 2, H[1] * 2, H[2] * 2, 0.5, 10), 1, 0.86);
  else { hg = new THREE.SphereGeometry(1, 40, 28); hg.scale(H[0], H[1], H[2]); shade(hg, 1, 0.82); }
  const headMesh = new THREE.Mesh(hg, fur); head.add(headMesh);
  // put an object on the head surface, facing outward
  const on = (o, yaw, pitch, depth, roll) => {
    const cp = Math.cos(pitch), k = 1 + (depth || 0);
    o.position.set(Math.sin(yaw) * cp * H[0] * k, Math.sin(pitch) * H[1] * k, Math.cos(yaw) * cp * H[2] * k);
    o.rotation.order = 'YXZ'; o.rotation.set(-pitch, yaw, roll || 0); head.add(o); return o;
  };

  // ----- eyes -----
  const E = { er: 0.26, yaw: 0.4, pitch: 0.12, depth: -0.02, sclera: 0xffffff, iris: 0x3b2a1a, irisR: 0.6, pupilR: 0.36, lidC: sp.color, lid: 0.9 };
  const B = { color: 0x2a1c12, len: 0.46, th: 0.07, yaw: 0.42, pitch: 0.62, depth: 0.0, tilt0: 0 };
  const M = { pitch: -0.42, depth: 0.0, yaw: 0, R: 0.19, col: 0x3a1e1e, tongue: 0xff8fa3, mode: 'arc', t: 0.04, base: 0 };
  switch (kind) {
    case 'sloth': Object.assign(E, { er: 0.26, yaw: 0.44, pitch: 0.1, depth: 0.03, sclera: 0xf6f0de, iris: 0x2d2118, irisR: 0.7, pupilR: 0.5, lid: 0.6 }); Object.assign(B, { color: 0x4a3426, len: 0.34, th: 0.045, pitch: 0.66, yaw: 0.44, tilt0: -0.18 }); Object.assign(M, { pitch: -0.42, depth: 0.16, R: 0.15, base: 0.35, col: 0x2d2118 }); break;
    case 'penguin': Object.assign(E, { er: 0.3, yaw: 0.4, pitch: 0.16, depth: 0.05, sclera: 0xffffff, iris: 0x111111, irisR: 0.8, pupilR: 0.5, lidC: 0xffffff, lid: 0.92 }); Object.assign(B, { color: 0x15161a, len: 0.46, th: 0.07, pitch: 0.7, yaw: 0.4 }); M.mode = 'beak'; break;
    case 'fox': Object.assign(E, { er: 0.23, yaw: 0.5, pitch: 0.2, sclera: 0xfffaf0, iris: 0xd97706, irisR: 0.66, pupilR: 0.4, lid: 0.82 }); Object.assign(B, { color: 0x9a4a0b, len: 0.46, th: 0.075, pitch: 0.58, yaw: 0.5, tilt0: 0.16 }); Object.assign(M, { pitch: -0.18, depth: 0, R: 0.14, col: 0x2b1b12 }); M.snout = true; break;
    case 'owl': Object.assign(E, { er: 0.32, yaw: 0.47, pitch: 0.1, depth: 0.04, sclera: 0xffd23f, iris: 0x111111, irisR: 0.01, pupilR: 0.5, lid: 0.92 }); Object.assign(B, { color: 0x4a3470, len: 0.56, th: 0.12, pitch: 0.62, yaw: 0.5, tilt0: 0.12 }); M.mode = 'beak'; break;
    case 'wizard': Object.assign(E, { er: 0.2, yaw: 0.38, pitch: 0.16, sclera: 0xffffff, iris: 0x3d6ad9, irisR: 0.75, pupilR: 0.4, lid: 0.88 }); Object.assign(B, { color: 0xf8f9fa, len: 0.62, th: 0.17, pitch: 0.46, yaw: 0.38, tilt0: 0.1, depth: 0.04 }); Object.assign(M, { pitch: -0.5, depth: 0.1, R: 0.17, col: 0x5a2a2a }); M.mode = 'hidden'; break;
    case 'pip': Object.assign(E, { er: 0.24, yaw: 0.44, pitch: 0.12, depth: 0.02, sclera: 0x1b1b1f, iris: 0x1b1b1f, irisR: 0.01, pupilR: 0.7, lid: 0.92 }); Object.assign(B, { color: 0x6a3d00, len: 0.4, th: 0.07, pitch: 0.55, yaw: 0.44, depth: 0.06 }); Object.assign(M, { pitch: -0.42, depth: 0.06, R: 0.26, col: 0x5a2a1a, t: 0.05, base: 0.3 }); break;
  }
  const scleraM = std(E.sclera, { roughness: 0.2 }), irisM = std(E.iris, { roughness: 0.25 }), pupilM = std(0x050505, { roughness: 0.2 }), glintM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lidM = std(E.lidC, { roughness: 0.7 });
  const tearGeo = new THREE.SphereGeometry(1, 10, 8), tearM = std(0x8ed1ff, { roughness: 0.1, transparent: true, opacity: 0.9, emissive: 0x1d5f8f });
  const lidGeo = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2); lidGeo.scale(1.14 * E.er, 0.92 * E.er, 1.14 * E.er); lidGeo.rotateX(Math.PI / 2);
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group(); on(g, s * E.yaw, E.pitch, E.depth);
    const sc = sph(E.er, scleraM, g, 0, 0, 0, 1, 1.06, 0.72);
    const pu = new THREE.Group(); g.add(pu);
    const ir = sph(E.er * E.irisR, irisM, pu, 0, 0, 0, 1, 1, 0.3);
    const pp = sph(E.er * E.pupilR, pupilM, pu, 0, 0, E.er * 0.04, 1, 1, 0.3);
    const gl = sph(E.er * 0.17, glintM, pu, E.er * 0.17, E.er * 0.2, E.er * 0.2, 1, 1, 0.6);
    const gl2 = sph(E.er * 0.08, glintM, pu, -E.er * 0.14, -E.er * 0.16, E.er * 0.18, 1, 1, 0.6);
    const lid = mesh(lidGeo, lidM, g, 0, 0, 0); lid.rotation.x = -Math.PI * 0.95;
    const tears = [0, 1].map(() => { const t = new THREE.Mesh(tearGeo, tearM); t.visible = false; g.add(t); return t; });
    return { g, pu, pp, lid, side: s, tears };
  });
  const eyeZ = (x, y) => E.er * 0.7 * Math.sqrt(Math.max(0.02, 1 - (x / E.er) * (x / E.er) - (y / (E.er * 1.06)) * (y / (E.er * 1.06))));

  // ----- brows -----
  const browGeo = new THREE.CapsuleGeometry(B.th, B.len, 4, 8); browGeo.rotateZ(Math.PI / 2);
  const browM = std(B.color, { roughness: 0.8 });
  const brows = [-1, 1].map((s) => { const g = new THREE.Group(); on(g, s * B.yaw, B.pitch, B.depth); const m = mesh(browGeo, browM, g, 0, 0, 0.02); return { g, baseY: g.position.y, side: s, m }; });

  // ----- mouth: lip arc + open-mouth fill (arc mode); jaw (beak mode) -----
  let mouth = null, jaw = null, beakTop = null;
  if (M.mode === 'arc' || M.mode === 'hidden') {
    const g = new THREE.Group();
    if (M.snout) { g.position.set(0, -0.4, 1.485); g.rotation.x = 0.45; head.add(g); } else if (M.mode === 'hidden') { g.position.set(0, -0.5, 1.14); head.add(g); } else on(g, M.yaw, M.pitch, M.depth);
    const lip = mesh(new THREE.TorusGeometry(M.R, M.t, 8, 22, Math.PI), std(M.col, { roughness: 0.5 }), g, 0, 0, 0.01);
    const fill = mesh(new THREE.CircleGeometry(M.R * 0.97, 24, Math.PI, Math.PI), std(0x4a0f18, { roughness: 0.6, side: THREE.DoubleSide }), g, 0, 0, 0.005);
    const tongue = sph(M.R * 0.5, std(M.tongue), fill, 0, -M.R * 0.55, 0.01, 1, 0.6, 0.3);
    mouth = { g, lip, fill };
  }

  // ----- species details -----
  const bodyParts = {}; // named bits for extras
  const faceMat = (c) => std(c, { vertexColors: false });
  if (kind === 'sloth') {
    const cream = std(0xe9d6ae), dk = std(0x4a3426);
    on(sph(1, cream, head, 0, 0, 0, 0.76, 0.6, 0.32), 0, -0.04, -0.08).position.z = 0.8;
    [-1, 1].forEach((s) => { const p = sph(1, dk, head, 0, 0, 0, 0.3, 0.19, 0.08); on(p, s * 0.45, 0.1, 0.14, s * -0.5); });
    on(sph(1, black, head, 0, 0, 0, 0.17, 0.12, 0.1), 0, -0.14, 0.18);
    [-1, 1].forEach((s) => { on(sph(0.2, furP, head, 0, 0, 0), s * 1.28, 0.38, -0.02); });
    const leaf = sph(1, std(0x5fb04a), head, 0.42, 0.9, -0.1, 0.36, 0.06, 0.18); leaf.rotation.z = -0.55; leaf.rotation.y = 0.3;
    mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.2, 6), std(0x3f8a34), head, 0.3, 0.88, -0.1).rotation.z = 0.9;
  }
  if (kind === 'penguin') {
    const wm = std(0xf7fbff);
    [-1, 1].forEach((s) => { on(sph(1, wm, head, 0, 0, 0, 0.66, 0.72, 0.13), s * 0.42, 0.06, 0.0).translateZ(-0.03); });
    on(sph(1, wm, head, 0, 0, 0, 0.6, 0.42, 0.12), 0, -0.42, 0.0).translateZ(-0.02);
    [-1, 1].forEach((s) => { on(sph(1, std(0xff9aa8), head, 0, 0, 0, 0.17, 0.11, 0.05), s * 0.82, -0.26, 0.1); });
    beakTop = cone(0.24, 0.56, std(0xff9f1c, { roughness: 0.4 }), head, 0, -0.2, 1.06); beakTop.rotation.x = Math.PI / 2; beakTop.scale.set(1, 1, 0.7);
    jaw = new THREE.Group(); jaw.position.set(0, -0.3, 0.98); head.add(jaw);
    const lo = cone(0.19, 0.4, std(0xf08a00, { roughness: 0.4 }), jaw, 0, 0, 0.17); lo.rotation.x = Math.PI / 2; lo.scale.set(1, 1, 0.55);
    for (let i = -1; i <= 1; i++) { const t = cone(0.07, 0.34, black, head, i * 0.12, 0.98, 0.02, 10); t.rotation.z = -i * 0.35; t.rotation.x = -0.2; }
  }
  const ears = [];
  if (kind === 'fox') {
    const wm = std(0xfff8ee), or = std(0xf08c3a), tipM = black;
    const sn = sph(1, wm, head, 0, -0.26, 0.86, 0.5, 0.4, 0.62);
    sph(1, or, head, 0, 0.02, 0.92, 0.3, 0.22, 0.5);
    sph(0.14, black, head, 0, -0.1, 1.44);
    [-1, 1].forEach((s) => {
      const ch = cone(0.2, 0.62, wm, head, s * 0.82, -0.3, 0.3, 14); ch.rotation.z = -s * 1.2; ch.rotation.y = s * 0.3;
      const ear = new THREE.Group(); ear.position.set(s * 0.62, 0.8, -0.05); ear.rotation.z = -s * 0.3; ear.rotation.x = -0.1; head.add(ear); ears.push({ g: ear, s: s, z: -s * 0.3, x: -0.1 });
      cone(0.42, 1.08, or, ear, 0, 0.5, 0, 16);
      cone(0.27, 0.8, std(0xfff1dd), ear, 0, 0.43, 0.12, 16);
      cone(0.2, 0.36, tipM, ear, 0, 0.9, -0.01, 14);
    });
    const tail = new THREE.Group(); tail.position.set(1.0, 0.35, -0.85); tail.rotation.set(-0.35, 0.2, -0.9); body.add(tail);
    sph(1, or, tail, 0, 0.7, 0, 0.55, 0.95, 0.55); sph(1, wm, tail, 0, 1.45, 0, 0.42, 0.55, 0.42);
    bodyParts.tail = tail;
    ex.push((P, now) => { tail.rotation.z = -0.9 + Math.sin(now / 1400) * 0.04 + P.tailLift * 0.35; });
    ex.push((P) => { for (let i = 0; i < 2; i++) { const e = ears[i], f = e.s < 0 ? P.earL : P.earR; e.g.rotation.z = e.z - e.s * (f - 0.16 * P.earUp + 0.4 * P.sadAmt); e.g.rotation.x = e.x - 0.3 * P.sadAmt + 0.12 * P.earUp; } });
  }
  if (kind === 'owl') {
    const dm = std(0xf4e8c8), dk = std(0x5a3f82);
    [-1, 1].forEach((s) => { on(sph(1, dm, head, 0, 0, 0, 0.64, 0.68, 0.13), s * 0.5, 0.06, 0.0).translateZ(-0.03); });
    beakTop = cone(0.15, 0.36, std(0xff9f1c, { roughness: 0.4 }), head, 0, -0.14, 1.04); beakTop.rotation.x = Math.PI / 2 + 0.35; beakTop.scale.set(1, 1, 0.8);
    jaw = new THREE.Group(); jaw.position.set(0, -0.22, 1.0); head.add(jaw);
    const lo = cone(0.1, 0.22, std(0xf08a00), jaw, 0, 0, 0.06); lo.rotation.x = Math.PI / 2 + 0.2;
    [-1, 1].forEach((s) => { const t = cone(0.22, 0.8, dk, head, s * 0.78, 0.86, -0.05, 14); t.rotation.z = -s * 0.5; t.rotation.x = -0.15; ears.push({ g: t, s: s, z: -s * 0.5, x: -0.15 }); });
    ex.push((P) => { for (let i = 0; i < 2; i++) { const e = ears[i], f = e.s < 0 ? P.earL : P.earR; e.g.rotation.z = e.z - e.s * (f - 0.2 * P.earUp + 0.25 * P.sadAmt); } });
  }
  if (kind === 'wizard') {
    const nose = sph(1, std(0xe8a98a), head, 0, -0.1, 1.04, 0.24, 0.24, 0.27);
    const wh = std(0xf8f9fa, { roughness: 0.9 });
    const beardGeo = new THREE.ConeGeometry(0.78, 2.0, 28); shade(beardGeo, 1, 0.78);
    const beard = mesh(beardGeo, std(0xf8f9fa, { roughness: 0.9, vertexColors: true }), head, 0, -1.02, 0.5); beard.rotation.x = Math.PI + 0.12;
    const mus = new THREE.Group(); mus.position.set(0, -0.3, 1.2); head.add(mus);
    const mus1 = mesh(new THREE.CapsuleGeometry(0.15, 0.5, 4, 10), wh, mus, 0, 0, 0); mus1.rotation.z = 1.2; mus1.position.x = -0.32;
    const mus2 = mesh(new THREE.CapsuleGeometry(0.15, 0.5, 4, 10), wh, mus, 0, 0, 0); mus2.rotation.z = -1.2; mus2.position.x = 0.32;
    const hat = new THREE.Group(); hat.position.set(0, 0.84, -0.02); hat.rotation.x = -0.1; head.add(hat);
    const purple = std(0x5f3dc4, { roughness: 0.7 }), purple2 = std(0x4c2bbf, { roughness: 0.7 });
    mesh(new THREE.CylinderGeometry(1.42, 1.5, 0.12, 40), purple, hat, 0, 0, 0);
    mesh(new THREE.CylinderGeometry(0.9, 0.98, 0.3, 32), purple2, hat, 0, 0.18, 0);
    mesh(new THREE.TorusGeometry(0.94, 0.08, 8, 36), std(0xffd43b, { metalness: 0.5, roughness: 0.3 }), hat, 0, 0.3, 0).rotation.x = Math.PI / 2;
    const c1 = cone(0.9, 1.5, purple2, hat, 0, 1.05, 0, 32);
    const tip = new THREE.Group(); tip.position.set(0, 1.7, 0); tip.rotation.z = -0.55; hat.add(tip);
    cone(0.5, 1.2, purple2, tip, 0, 0.45, 0, 28);
    const sg = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.11 : 0.26; sg[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    const star = mesh(new THREE.ExtrudeGeometry(sg, { depth: 0.05, bevelEnabled: false }), std(0xffe066, { emissive: 0x806000, roughness: 0.4 }), hat, 0, 0.75, 0.82); star.rotation.x = -0.18;
    ex.push((P, now) => { hat.rotation.z = P.hatTilt; hat.position.y = 0.84 + P.hatLift; star.rotation.y = Math.sin(now / 2200) * 0.15; mus.rotation.z = P.smile * 0.12; mus.position.y = -0.3 + P.smile * 0.03; beard.rotation.x = Math.PI + 0.12 + P.beardSway; });
  }
  if (kind === 'pip') {
    on(sph(1, std(0xff9a3d), head, 0, 0, 0, 0.16, 0.1, 0.05), 0.8, -0.2, 0.08); on(sph(1, std(0xff9a3d), head, 0, 0, 0, 0.16, 0.1, 0.05), -0.8, -0.2, 0.08);
    const ant = new THREE.Group(); ant.position.set(0, H[1] * 0.92, 0); head.add(ant);
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.62, 8), std(0xe8590c), ant, 0, 0.31, 0);
    const ball = sph(0.17, std(0xff5a5a, { emissive: 0x4a0000, roughness: 0.3 }), ant, 0, 0.68, 0);
    ex.push((P, now) => { ant.rotation.z = Math.sin(now / 1900) * 0.05 - P.headRoll * 0.6 + P.hatTilt; ant.rotation.x = P.headPitch * -0.3 + Math.sin(now / 2300) * 0.03; });
  }
  const steamM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), puffGeo = new THREE.SphereGeometry(1, 12, 10);
  const puffs = [];
  [-1, 1].forEach((s) => { for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(puffGeo, steamM); m.visible = false; head.add(m); puffs.push({ m, s, k }); } });
  // sweat drop (nervous): one bead that forms on the temple and runs down
  const sweat = new THREE.Group(); head.add(sweat); sweat.visible = false;
  { const bead = mesh(new THREE.SphereGeometry(1, 12, 10), tearM, sweat, 0, 0, 0, 0.13, 0.16, 0.12), tip = cone(0.1, 0.22, tearM, sweat, 0, 0.17, 0, 10); tip.scale.set(1, 1, 0.9); on(sweat, 0.78, 0.45, 0.04); }
  // ----- arms -----
  const armColor = { sloth: 0x9a7b57, penguin: 0x262b36, fox: 0xf08c3a, owl: 0x7d5ba6, wizard: 0xf1c9a5, pip: 0xffd43b }[kind];
  const foreC = armColor;
  const hand = {
    sloth: { mat: std(0xa3e635, { roughness: 0.5 }), scale: 1.12, stripe: std(0xffffff) },
    penguin: { mat: std(0x262b36), scale: 1.05 },
    fox: { mat: std(0x24262c), scale: 1.0 },
    owl: { mat: std(0x7d5ba6), scale: 1.0, tip: std(0xf4e8c8) },
    wizard: { mat: std(0xf1c9a5), scale: 1.0 },
    pip: { mat: std(0xe8590c), scale: 1.05 }
  }[kind];
  const arms = [-1, 1].map((s) => {
    const a = new ArmRig(body, s, {
      L1: sp.L1, L2: sp.L2, shoulder: [s * 1.0, 1.42, 0.02], maxStretch: 3.8,
      furMat: std(armColor), foreMat: std(foreC), sleeveMat: jerseyM, trimMat: trimM,
      cuffMat: kind === 'sloth' ? std(0xffffff) : kind === 'fox' ? std(0x24262c) : null, hand
    });
    a.rest = restPos(s); a.hand.userData.hand = true; a.side = s; return a;
  });

  // ----- pose application -----
  const lidBase = STYLE[kind].lid;
  const invBody = new THREE.Matrix4();
  const actor = {
    kind, root, body, arms, style: STYLE[kind], top: sp.top, headC: new THREE.Vector3(0, 1.7 + 0.66, 0.1), invBody,
    // P: pose from the performer (see creatures.js)
    apply(P, now) {
      P.tailLift = P.happyAmt || 0; P.beardSway = Math.sin(now / 2600) * 0.02 + (P.sadAmt || 0) * 0.08;
      const br = P.breath;
      body.position.set(0, P.hop, P.slide); body.rotation.set(P.lean, P.turn, P.sway); body.updateMatrix(); invBody.copy(body.matrix).invert();
      torso.scale.set(1 + 0.012 * br, 1 + 0.02 * br, 1 + 0.014 * br);
      neck.position.y = 1.7 + 0.018 * br + P.shrug * 0.04 - P.gulp * 0.07;
      neck.rotation.set(P.headPitch + P.gulp * 0.1, P.headYaw, P.headRoll);
      // eyes
      for (let i = 0; i < 2; i++) {
        let e = eyes[i], ex_ = P.eyeX * E.er * 0.42, ey = P.eyeY * E.er * 0.4;
        ex_ += P.eyeAddX * E.er * 0.3; ey += P.eyeAddY * E.er * 0.3;
        e.pu.position.set(ex_, ey, eyeZ(ex_, ey) * 0.98); e.pu.rotation.set(-ey / E.er * 0.7, ex_ / E.er * 0.7, 0);
        e.g.scale.setScalar(1 + 0.2 * P.eyeWide); { const ps = 1 + P.pupil * 0.6; e.pp.scale.set(ps, ps, 0.3); }
        const o = clamp(P.lid * lidBase / 0.9 * (1 - P.blink) + (e.side > 0 ? P.lidAsym : 0), 0, 1);
        e.lid.rotation.x = -Math.PI * (0.04 + 0.96 * Math.pow(o, 0.9)) ;
        const b = brows[i]; b.g.position.y = b.baseY + (P.browRaise + (e.side > 0 ? P.browAsym : -P.browAsym * 0.2)) * 0.13;
        b.g.rotation.z = e.side * (B.tilt0 + P.browTilt * 0.55);
      }
      // mouth
      const sm = P.smile + M.base * (1 - Math.abs(P.smile)), op = P.open;
      if (mouth) {
        const depth = op > 0.05 ? Math.max(op, sm) : sm;
        mouth.lip.scale.set((1 + op * 0.1) * P.mouthW, -(Math.abs(depth) < 0.07 ? 0.07 * (depth < 0 ? -1 : 1) : depth), 1);
        mouth.fill.scale.set(P.mouthW, Math.max(0.001, op), 1); mouth.fill.visible = op > 0.04;
      }
      if (jaw) { jaw.rotation.x = op * 0.5; if (beakTop) beakTop.rotation.x = Math.PI / 2 + (kind === 'owl' ? 0.35 : 0) - op * 0.14 - sm * 0.06; }
      for (let i = 0; i < ex.length; i++) ex[i](P, now);
      // tears (cry) and steam puffs (tantrum), flush of anger on the head
      for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) {
        const t = eyes[i].tears[k];
        if (P.cry > 0.03) {
          const ph = (P.cryT * 0.9 + k * 0.5 + i * 0.2) % 1, sz = P.cry * Math.min(1, ph / 0.12) * (1 - Math.max(0, (ph - 0.75) / 0.25));
          t.visible = sz > 0.02; t.position.set(eyes[i].side * 0.04, -E.er * 0.6 - ph * 0.9, E.er * 0.4 - ph * 0.3); t.scale.set(E.er * 0.4 * sz, E.er * 0.6 * sz, E.er * 0.4 * sz);
        } else t.visible = false;
      }
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        if (P.steam > 0.03) { const ph = (P.steamT * 1.3 + p.k * 0.33) % 1, sz = P.steam * (0.12 + ph * 0.3) * (1 - ph * ph * ph); p.m.visible = true; p.m.position.set(p.s * (1.15 + ph * 0.35), 0.75 + ph * 1.3, 0); p.m.scale.setScalar(sz); } else p.m.visible = false;
      }
      if (P.sweat > 0.03) { const ph = Math.min(1, (P.sweatT % 1.5) / 1.1); sweat.visible = true; sweat.scale.setScalar(P.sweat * Math.min(1, ph * 6) * (1 - Math.max(0, (ph - 0.8) / 0.2))); sweat.children[0].position.y = -ph * 0.7; sweat.children[1].position.y = 0.17 - ph * 0.7; } else sweat.visible = false;
      fur.emissive.setRGB(0.28 * P.angry, 0.02 * P.angry, 0);
      // arms
      for (let i = 0; i < 2; i++) arms[i].setShoulderLift(P.shrug * 0.12 + br * 0.015);
    },
    dispose() { }
  };
  actor.eyeObjs = eyes;
  return actor;
}
