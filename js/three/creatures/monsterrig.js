// Procedural skeleton driver for the glTF monsters (Unreal-style humanoid rig, no animation clips needed).
//
// The runtime (../creatures.js) hands every character the same pose struct P (lean, hop, turn, sway, headYaw/Pitch/Roll,
// shrug, breath, happy/sad amounts, mouth-open, ...) and, for each arm, a hand target in the creature's space (the
// gestures and the reach/carry planner ask for those through C.arm()). This file turns that into bone rotations:
//   * spine_01..03, neck, head   rotations in the BODY frame (so "pitch" is always forward/back whatever the bone's local axes are)
//   * clavicles                  shrug / relaxed shoulders
//   * arms                       analytic two-bone IK to the requested hand target on the REAL arm bones. When the target is
//                                farther than the arm reaches, the arm stretches (cartoon rubber arm): the bones are scaled along
//                                their length, so the real mesh and textures stay in use and the colours always match.
//   * fingers                    curl with the hand's `open` value (fist <-> open), thumb included
// Upper arm, forearm and hand get explicit world matrices (matrixAutoUpdate off) so stretching can never shear the hand.
// No per-frame allocations: every temporary below is module-level.
import * as THREE from 'three';
import { clamp, sstep } from './common.js';

const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1), DOWN = new THREE.Vector3(0, -1, 0);
const e1 = new THREE.Euler(0, 0, 0, 'YXZ');
const dq = new THREE.Quaternion(), w0 = new THREE.Quaternion(), qi = new THREE.Quaternion(), qr = new THREE.Quaternion(), qa = new THREE.Quaternion();
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), vE = new THREE.Vector3(), vW = new THREE.Vector3(), vd1 = new THREE.Vector3(), vd2 = new THREE.Vector3(), vh = new THREE.Vector3(), vS = new THREE.Vector3();
const vs = new THREE.Vector3(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mU = new THREE.Matrix4(), mL = new THREE.Matrix4(), mH = new THREE.Matrix4();
const ONES = [1, 1];
const MAXK = 3.0;                   // longest the arm may stretch, as a multiple of its natural length

// bone-name patterns of the Unreal-style humanoid (override any of them in the manifest slot's "bones")
export const BONE_NAMES = { pelvis: 'pelvis', spine: ['spine_01', 'spine_02', 'spine_03'], neck: 'neck_01', head: 'Head', clav: 'clavicle_', up: 'upperarm_', lo: 'lowerarm_', hand: 'hand_' };

function modelQuat(bone, model, out) {                 // product of the local rotations from `model` down to `bone` (inclusive)
  out.identity(); const st = []; for (let o = bone; o && o !== model; o = o.parent) st.push(o);
  for (let i = st.length - 1; i >= 0; i--) out.multiply(st[i].quaternion); return out;
}
const restOf = (b) => ({ b, q0: b.quaternion.clone(), p0: b.position.clone() });

// body-frame rotation `dq` applied on top of bone R's rest rotation, given the parent's body-frame orientation.
// Writes the bone's local quaternion and returns its own body-frame orientation in `out`.
function applyDelta(R, parentQ, d, out) {
  out.copy(parentQ).multiply(R.q0); out.premultiply(d);
  qi.copy(parentQ).invert(); R.b.quaternion.copy(qi).multiply(out);
  return out;
}

export class MonsterArm {
  constructor(rig, idx, side, o) {
    this.rig = rig; this.idx = idx; this.side = side;
    this.clav = o.clav; this.up = o.up; this.lo = o.lo; this.hand = o.hand; this.fingers = o.fingers;
    this.L1 = o.L1; this.L2 = o.L2; this.handLen = o.handLen; this.k0 = o.k0;
    this.S = new THREE.Vector3(); this.baseShoulder = new THREE.Vector3(); this.rest = new THREE.Vector3(); this.pos = new THREE.Vector3();
    this.stretch = 1; this.open = 0.3; this.qParent = new THREE.Quaternion(); this.wu = new THREE.Quaternion(); this.wl = new THREE.Quaternion(); this.wh = new THREE.Quaternion();
  }
  setShoulderLift() {}
  solve(tx, ty, tz, align, yaw) { this.rig.solveArm(this, tx, ty, tz, align, yaw); }
}

export class MonsterRig {
  // o: { model, body, root, bones: { pelvis, spine[3], neck, head, clav[2], up[2], lo[2], hand[2], fingers[2][] }, sc, cfg }
  constructor(o) {
    this.model = o.model; this.body = o.body; this.sc = o.sc; this.cfg = o.cfg; const B = o.bones, cfg = this.cfg;
    this.pose = Object.assign({ slouch: 0.16, headDown: 0.05, headTilt: 0, shoulderDrop: 0.06, bodyShare: 0.55 }, cfg.pose || {});
    this.hs = cfg.handScale !== undefined ? cfg.handScale : 0.85;
    this.curl = cfg.curl !== undefined ? cfg.curl : 1.15;
    this.clipMode = false;
    this.invBW = new THREE.Matrix4(); this.BW = new THREE.Matrix4();
    this.pelvis = restOf(B.pelvis); this.spine = B.spine.map(restOf); this.neck = restOf(B.neck); this.head = restOf(B.head);
    // path of nodes from the model down to the pelvis (for the pelvis' body-frame orientation, which is constant in procedural mode)
    this.pelPath = []; for (let n = B.pelvis; n && n !== this.model; n = n.parent) this.pelPath.unshift(n);
    this.qPel = new THREE.Quaternion(); this.qS = [0, 1, 2].map(() => new THREE.Quaternion()); this.qN = new THREE.Quaternion(); this.qH = new THREE.Quaternion();
    this.qC = [new THREE.Quaternion(), new THREE.Quaternion()];
    this.refs = [this.spine[0], this.spine[1], this.spine[2], this.neck, this.head];
    // arms: index 0 = the one on the creature's -x side (screen left, since it faces +z toward the player)
    model_update(this.model);
    const px = (b) => vS.setFromMatrixPosition(b.matrixWorld).x;
    const order = [0, 1].sort((a, b) => px(B.up[a]) - px(B.up[b]));
    const dist = (a, b) => va.setFromMatrixPosition(a.matrixWorld).distanceTo(vb.setFromMatrixPosition(b.matrixWorld));
    this.arms = order.map((j, i) => {
      const ups = B.up[j], los = B.lo[j], hands = B.hand[j];
      const L1 = dist(ups, los), L2 = dist(los, hands);           // body-space lengths (the rig is built with the root at the origin, unscaled)
      const fingers = (B.fingers[j] || []).map((b) => ({ b, q0: b.quaternion.clone(), w: /thumb/i.test(b.name) ? 0.55 : (/_01/.test(b.name) ? 0.85 : /_02/.test(b.name) ? 1.0 : 0.75), thumb: /thumb/i.test(b.name) }));
      let tip = 0; hands.traverse((n) => { if (/leaf|_04/i.test(n.name)) tip = Math.max(tip, dist(hands, n)); });
      const lenNat = L1 + L2, k0 = cfg.armLen !== undefined ? cfg.armLen : clamp(2.55 / lenNat, 1, 1.45);
      const a = new MonsterArm(this, i, i ? 1 : -1, { clav: restOf(B.clav[j]), up: restOf(ups), lo: restOf(los), hand: restOf(hands), fingers, L1, L2, k0, handLen: tip });
      ups.matrixAutoUpdate = false; los.matrixAutoUpdate = false; hands.matrixAutoUpdate = false;
      return a;
    });
    this.talk = 0; this.talkT = 0;
    // first pose with a neutral P, to read the relaxed shoulder positions and hang the rest hands from them
    this.restP = { lean: 0, hop: 0, slide: 0, turn: 0, sway: 0, headYaw: 0, headPitch: 0, headRoll: 0, shrug: 0, breath: 0, happyAmt: 0, sadAmt: 0, open: 0, pitchAdd: 0, talk: 0, talkT: 0 };
    this.update(this.restP);
    const rf = cfg.rest || [0.17, 0.72, 0.3];
    for (const a of this.arms) {
      a.baseShoulder.copy(a.S); const R = (a.L1 + a.L2) * a.k0;
      a.rest.set(a.S.x + a.side * rf[0] * R, a.S.y - rf[1] * R, a.S.z + rf[2] * R);
    }
  }

  // ----- the whole pose, once per frame (the body group's own transform has already been set by the caller) -----
  update(P) {
    const cfg = this.cfg, pz = this.pose, body = this.body, clip = this.clipMode;
    body.updateWorldMatrix(true, false); this.BW.copy(body.matrixWorld); this.invBW.copy(this.BW).invert();
    if (clip) for (let i = 0; i < this.refs.length; i++) this.refs[i].q0.copy(this.refs[i].b.quaternion);
    // pelvis orientation (body frame) = model rotation * the rig's rotations down to the pelvis
    this.qPel.copy(this.model.quaternion); for (let i = 0; i < this.pelPath.length; i++) this.qPel.multiply(this.pelPath[i].quaternion);
    const br = P.breath || 0, ls = P.lean * (1 - pz.bodyShare), hap = P.happyAmt || 0, sad = P.sadAmt || 0, op = P.open || 0;
    const talk = this.talk = P.talk || 0; this.talkT = P.talkT || 0; this.taskArm = P.task || 0;
    if (!clip) {
      let q = this._set(this.spine[0], this.qPel, this.qS[0], ls * 0.25 + pz.slouch * 0.30 - br * 0.008, 0, 0);
      q = this._set(this.spine[1], q, this.qS[1], ls * 0.35 + pz.slouch * 0.35 - br * 0.015 - hap * 0.03 + sad * 0.06, P.headYaw * 0.06, P.headRoll * 0.10);
      q = this._set(this.spine[2], q, this.qS[2], ls * 0.40 + pz.slouch * 0.35 - br * 0.014 - hap * 0.05 + sad * 0.08 - op * 0.03, P.headYaw * 0.10, P.headRoll * 0.10);
      const hp = P.headPitch + pz.headDown - op * 0.09;
      this._set(this.neck, q, this.qN, hp * 0.4, P.headYaw * 0.4, P.headRoll * 0.4 + pz.headTilt * 0.4);
      this._set(this.head, this.qN, this.qH, hp * 0.6, P.headYaw * 0.6, P.headRoll * 0.6 + pz.headTilt * 0.6);
    } else {
      const hp = P.headPitch - op * 0.06;
      e1.set(hp * 0.4, P.headYaw * 0.4, P.headRoll * 0.4, 'YXZ'); dq.setFromEuler(e1);
      this.qS[2].copy(this.qPel); for (let i = 0; i < 3; i++) this.qS[2].multiply(this.spine[i].b.quaternion);   // chest orientation from the clip pose
      applyDelta(this.neck, this.qS[2], dq, this.qN);
      e1.set(hp * 0.6, P.headYaw * 0.6, P.headRoll * 0.6, 'YXZ'); dq.setFromEuler(e1); applyDelta(this.head, this.qN, dq, this.qH);
    }
    // clavicles: relaxed (a little down), lifted by shrugs and breathing
    for (let ai = 0; ai < 2; ai++) {
      const a = this.arms[ai], R = a.clav; if (clip) R.q0.copy(R.b.quaternion);
      const ang = (P.shrug || 0) * 0.24 - pz.shoulderDrop + br * 0.012, s = a.side;
      dq.setFromAxisAngle(AZ, s * ang);
      applyDelta(R, this.qS[2], dq, this.qC[a.idx]); a.qParent.copy(this.qC[a.idx]);
      R.b.updateWorldMatrix(true, false);
      vS.copy(a.up.p0).applyMatrix4(R.b.matrixWorld).applyMatrix4(this.invBW); a.S.copy(vS);
    }
  }

  _set(R, parent, out, pitch, yaw, roll) { e1.set(pitch, yaw, roll, 'YXZ'); dq.setFromEuler(e1); return applyDelta(R, parent, dq, out); }

  solveArm(a, tx, ty, tz, align, yaw) {
    const cfg = this.cfg, sc = this.sc, S = a.S, side = a.side, clip = this.clipMode;
    // talking: the nearer hand makes small speaking gestures when the target is (near) the rest position
    if (this.talk > 0 && a.idx === 1) {
      const dr = Math.hypot(tx - a.rest.x, ty - a.rest.y, tz - a.rest.z), g = this.talk * (1 - sstep(dr / 0.7)), t = this.talkT;
      if (g > 0) { tx += 0.4 * Math.sin(t * 3.1) * g; ty += (0.55 + 0.35 * Math.sin(t * 2.3 + 1)) * g; tz += 0.35 * g; align = 0.3; }
    }
    // clip mode: leave the clip's arm alone unless something asks for a target away from the rest position
    if (clip) {
      const far = Math.hypot(tx - a.rest.x, ty - a.rest.y, tz - a.rest.z) > 0.35;
      if (!far) { if (!a.up.b.matrixAutoUpdate) { a.up.b.matrixAutoUpdate = a.lo.b.matrixAutoUpdate = a.hand.b.matrixAutoUpdate = true; } this.curlFingers(a, a.open); a.pos.set(tx, ty, tz); return; }
      a.up.b.matrixAutoUpdate = a.lo.b.matrixAutoUpdate = a.hand.b.matrixAutoUpdate = false;
    }
    va.set(tx - S.x, ty - S.y, tz - S.z); let d = va.length();
    const Ls = a.L1 + a.L2, base = Ls * a.k0, reach = base * 0.985; let k = a.k0;
    // only the arm that is carrying a die may stretch a long way; in gestures the hand just stops a little short of far targets
    if (d > reach) { let s = d / reach; const mx = this.taskArm === a.idx + 1 ? MAXK : 1.3; if (s > mx) { s = mx; d = reach * s; va.setLength(d); } k = a.k0 * s; }
    if (d < 0.45) { d = 0.45; if (va.lengthSq() < 1e-6) va.set(0, -1, 0); va.setLength(d); }
    a.stretch = k / a.k0;
    const l1 = a.L1 * k, l2 = a.L2 * k, vx = va.x / d, vy = va.y / d, vz = va.z / d;
    const aa = (d * d + l1 * l1 - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - aa * aa));
    // elbow bends out, down and a bit back
    vb.set(side * 0.55, -0.8, -0.3); const dot = vb.x * vx + vb.y * vy + vb.z * vz;
    vb.set(vb.x - vx * dot, vb.y - vy * dot, vb.z - vz * dot); if (vb.lengthSq() < 1e-4) vb.set(0, -1, 0); else vb.normalize();
    vE.set(S.x + vx * aa + vb.x * h, S.y + vy * aa + vb.y * h, S.z + vz * aa + vb.z * h);
    vW.set(S.x + va.x, S.y + va.y, S.z + va.z); a.pos.copy(vW);
    vd1.subVectors(vE, S).normalize(); vd2.subVectors(vW, vE).normalize();
    const tk = clamp(Math.sqrt(a.k0 / k), 0.82, 1);
    // upper arm: swing from its rest direction (given where the clavicle now is) to the elbow direction
    const U = a.up, Lw = a.lo, H = a.hand;
    w0.copy(a.qParent).multiply(U.q0); vc.copy(AY).applyQuaternion(w0); dq.setFromUnitVectors(vc, vd1); const Wu = qa.copy(dq).multiply(w0);
    // forearm
    const wu = a.wu.copy(Wu);
    w0.copy(wu).multiply(Lw.q0); vc.copy(AY).applyQuaternion(w0); dq.setFromUnitVectors(vc, vd2); const wl = a.wl.copy(dq).multiply(w0);
    // hand: direction between the forearm's and straight down, then the roll that keeps the palm toward the body
    vh.copy(vd2).lerp(DOWN, align); if (vh.lengthSq() < 1e-4) vh.copy(vd2); else vh.normalize();
    w0.copy(wl).multiply(H.q0); vc.copy(AY).applyQuaternion(w0); dq.setFromUnitVectors(vc, vh);
    const wh = a.wh.copy(dq).multiply(w0);
    qr.setFromAxisAngle(vh, (yaw || 0) * align + (cfg.handRoll || 0) * Math.PI / 180 * (side < 0 ? -1 : 1)); wh.premultiply(qr);
    // explicit world matrices: upper arm and forearm stretch along their own axis, the hand keeps its size
    vs.set(sc * tk, sc * k, sc * tk);
    mA.compose(S, wu, vs); mU.multiplyMatrices(this.BW, mA);                          // upper arm, world
    mA.compose(vE, wl, vs); mL.multiplyMatrices(this.BW, mA);                         // forearm, world
    const hs = sc * this.hs; vs.set(hs, hs, hs);
    mA.compose(vW, wh, vs); mH.multiplyMatrices(this.BW, mA);                         // hand, world
    mB.copy(a.clav.b.matrixWorld).invert(); U.b.matrix.multiplyMatrices(mB, mU); U.b.matrixWorldNeedsUpdate = true;
    mB.copy(mU).invert(); Lw.b.matrix.multiplyMatrices(mB, mL); Lw.b.matrixWorldNeedsUpdate = true;
    mB.copy(mL).invert(); H.b.matrix.multiplyMatrices(mB, mH); H.b.matrixWorldNeedsUpdate = true;
    this.curlFingers(a, a.open);
  }

  curlFingers(a, open) {
    const ang = (1 - clamp(open, 0, 1)) * this.curl, ax = this.cfg.curlAxis || AX, sg = (this.cfg.curlSign || ONES)[a.idx] || 1, ts = this.cfg.thumbSign || 1;
    for (let i = 0; i < a.fingers.length; i++) {
      const f = a.fingers[i];
      qa.setFromAxisAngle(f.thumb ? (this.cfg.thumbAxis || ax) : ax, sg * (f.thumb ? ts : 1) * ang * f.w); f.b.quaternion.copy(f.q0).multiply(qa);
    }
  }

  // procedural mode: put every driven bone back to its bind rotation before the next frame's pose
  reset() {
    for (const R of this.refs) R.b.quaternion.copy(R.q0);
  }
}
function model_update(m) { m.updateWorldMatrix(true, true); }
