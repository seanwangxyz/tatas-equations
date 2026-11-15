// PEOPLE IN 3D: one human figure from an avatar (the shape described in js/people-data.js, global People).
//
// THE CONTRACT (js/three/player.js and the portraits rely on exactly this; keep the names and meanings):
//   buildPerson({ avatar, kit, num, name, front })  -> a model with the same interface as buildHuman() in kid.js
//                                    (root, setKit, setHair, setFace, the arm rigs ...). avatar: any object, cleaned
//                                    with People.clean(). kit: a full kit object (kitFromSave) or nothing.
//                                    Extra: model.setAvatar(avatar) -> true when the change was applied in place (only
//                                    colours changed: skin, hair, eyes, glasses, accessory, streak colour), false when
//                                    the figure must be rebuilt (call buildPerson again). model.avatar: the clean avatar.
//   personDims(avatar)               -> the body measurements used for that avatar (the same shape as KID / TATA in
//                                    kid.js / grownup.js: SH_Y, TOP, FOOT, L1, L2, handS ...), for seats and reach
//   personLook(avatar)               -> the look object handed to buildHuman (skin, hair, hairStyle, eyes, ...)
//   personKey(avatar)                -> a short string that changes whenever the figure must be rebuilt (it changes
//                                    on every visible change, colours included, so a caller that only compares keys
//                                    never shows a stale figure; setAvatar can spare the rebuild for colours)
//   personAdult(avatar)              -> true for the grown-up bodies (they use the grown-up reactions)
//
// People.DEFAULT gives exactly today's kid (KID dims, KID_LOOK) and People.GROWN exactly "Tata" (TATA dims, TATA_LOOK).
import * as THREE from 'three';
import { buildHuman, KID, KID_LOOK, KITS } from './kid.js';
import { TATA, TATA_LOOK } from './grownup.js';

function P() { return (typeof window !== 'undefined' && window.People) || (typeof globalThis !== 'undefined' && globalThis.People) || null; }
function cleanAv(avatar) { const p = P(); return p ? p.clean(avatar) : Object.assign({ body: 'kid', height: 0 }, avatar || {}); }
export function personAdult(avatar) { const a = cleanAv(avatar); return a.body === 'adult-a' || a.body === 'adult-b'; }

// ---------------- bodies ----------------
// Each build is a full dims object (every field kid.js / player.js / poses.js read), derived from KID or TATA.
// kid-s: a little kid (5 to 7): shorter legs and arms, a narrower body, the head a little smaller but big for the body,
//   rounder cheeks and bigger eyes. teen: a big kid (11 to 15): between the kid and a grown-up, longer legs, a slimmer
//   face with a hint of a chin. adult-a: a slimmer grown-up: narrower softer shoulders, no heavy muscle, slim arms and
//   legs, an oval face with a soft jaw (not Tata's long chin). kid and adult-b are KID and TATA themselves.
const SLIM_CTRL = [[0.001, 0], [0.6, 0.03], [0.66, 0.24], [0.68, 0.5], [0.71, 0.76], [0.79, 1.02], [0.84, 1.24], [0.835, 1.44], [0.75, 1.6], [0.57, 1.76], [0.38, 1.86], [0.001, 1.88]];
const TEEN_CTRL = [[0.001, 0], [0.6, 0.035], [0.76, 0.3], [0.8, 0.72], [0.82, 1.16], [0.8, 1.48], [0.6, 1.76], [0.4, 1.86], [0.001, 1.88]];
const BODY = {
  'kid-s': Object.assign({}, KID, {
    SH_X: 0.72, HEAD_R: 0.71, HEAD_UP: 0.6, torsoX: 0.9, torsoY: 0.82, neckLen: 0.42, neckR: 0.92,
    hipY: -0.5, thigh: 0.56, shin: 0.6, legR: 0.9, hipX: 0.33, waistTop: 0.11, hemL: 0.36, shortsRb: 0.25,
    L1: 0.74, L2: 0.78, armR: 0.9, handS: 0.54,
    head: { sx: 0.97, sy: 1.04, sz: 0.98, jaw: 0.2, chin: 0, cheek: 0.095, back: 0.05 },
    face: { eyeX: 0.32, eyeY: 0.0, eyeR: 0.19, browY: 0.29, browLen: 0.2, browTh: 0.033, mouthY: -0.42, mouthW: 0.95, noseY: -0.15, cheekX: 0.5, cheekY: -0.3, cheekR: 0.15 }
  }),
  teen: Object.assign({}, KID, {
    SH_X: 0.87, HEAD_R: 0.68, HEAD_UP: 0.6, torsoX: 1.0, torsoY: 1.13, neckLen: 0.56, neckR: 0.98, torsoCtrl: TEEN_CTRL,
    hipY: -0.66, thigh: 0.96, shin: 1.02, legR: 1.02, hipX: 0.38, waistTop: 0.13, hemL: 0.54, shortsRb: 0.29,
    L1: 1.06, L2: 1.12, armR: 1.04, handS: 0.63,
    head: { sx: 0.9, sy: 1.08, sz: 0.97, jaw: 0.18, chin: 0.22, cheek: 0.04, back: 0.04 },
    face: { eyeX: 0.32, eyeY: 0.03, eyeR: 0.162, browY: 0.28, browLen: 0.22, browTh: 0.036, mouthY: -0.44, mouthW: 0.98, noseY: -0.13, cheekX: 0.49, cheekY: -0.28, cheekR: 0.12 }
  }),
  'adult-a': Object.assign({}, TATA, {
    SH_X: 0.86, HEAD_R: 0.61, HEAD_UP: 0.58, torsoX: 1.0, torsoY: 1.2, neckLen: 0.6, neckR: 0.9, zs: 0.86, muscle: 0, torsoCtrl: SLIM_CTRL,
    hipY: -0.7, thigh: 1.12, shin: 1.16, legR: 0.98, hipX: 0.37, waistTop: 0.14, hemL: 0.58, shortsRb: 0.3,
    L1: 1.12, L2: 1.18, armR: 0.98, handS: 0.62, sleeveK: 1,
    head: { sx: 0.88, sy: 1.08, sz: 0.97, jaw: 0.1, chin: 0.2, cheek: 0.035, back: 0.03 },
    face: { eyeX: 0.31, eyeY: 0.03, eyeR: 0.158, browY: 0.27, browLen: 0.24, browTh: 0.04, mouthY: -0.43, mouthW: 0.92, noseY: -0.12, cheekX: 0.47, cheekY: -0.25, cheekR: 0.11 }
  })
};
// the look that goes with each build (eye shape, how smiley the resting eyes are, nose, the grown-up mouth)
const BODY_LOOK = {
  'kid-s': { eyeW: 1.12, eyeH: 1.0, tilt: 0.05, happy: 0.26, iris: 0.76, adult: false, vneck: false },
  kid: { eyeW: KID_LOOK.eyeW, eyeH: KID_LOOK.eyeH, tilt: KID_LOOK.tilt, happy: KID_LOOK.happy, iris: KID_LOOK.iris, adult: false, vneck: false },
  teen: { eyeW: 1.14, eyeH: 0.94, tilt: 0.06, happy: 0.26, iris: 0.72, adult: false, vneck: false },
  'adult-a': { eyeW: 1.1, eyeH: 0.98, tilt: 0.04, happy: 0.16, iris: 0.7, adult: true, vneck: true },
  'adult-b': { eyeW: TATA_LOOK.eyeW, eyeH: TATA_LOOK.eyeH, tilt: TATA_LOOK.tilt, happy: TATA_LOOK.happy, iris: TATA_LOOK.iris != null ? TATA_LOOK.iris : KID_LOOK.iris, adult: true, vneck: true }
};
// heights: the top of the hair (kids' hair sits closer to the head than Tata's tousled mop) and the soles
function finish(D, adult) {
  D.TOP = D.NECK_Y + D.HEAD_UP + D.HEAD_R * D.head.sy * (adult ? 1.27 : 1.1);
  D.FOOT = D.hipY - D.thigh - D.shin - 0.14;
  D.HIP_LOW = D.hipY - D.hemL;
  return D;
}
// shoulders and neck follow the torso's height (KID: torso 1 -> shoulders 1.55, neck 1.98; TATA 1.24 -> 1.9, 2.4)
function place(D) { D.SH_Y = 1.53 * D.torsoY; D.NECK_Y = 1.88 * D.torsoY + 0.1 + (D.neckLen - 0.5) * 0.25; return D; }
['kid-s', 'teen', 'adult-a'].forEach((k) => finish(place(BODY[k]), k === 'adult-a'));
BODY.kid = KID; BODY['adult-b'] = TATA;
// height -1 / 0 / 1: about 6 % shorter / taller overall, mostly in the legs, a little in the body; the head keeps its size
const _dims = new Map();
function sized(body, h) {
  const base = BODY[body] || KID; if (!h) return base;
  const key = body + h; let D = _dims.get(key); if (D) return D;
  const H0 = base.TOP - base.FOOT;
  D = Object.assign({}, base, { head: Object.assign({}, base.head), face: Object.assign({}, base.face) });
  // solve for the leg / body stretch that changes the whole height by 6 %
  const want = H0 * 0.06 * h, legs = base.thigh + base.shin, kb = 0.55;            // the body takes kb of the change per unit of leg change
  const k = want / (legs + kb * (base.NECK_Y - base.hipY));
  D.thigh = base.thigh * (1 + k); D.shin = base.shin * (1 + k);
  const ty = 1 + k * kb; D.torsoY = base.torsoY * ty; D.SH_Y = base.SH_Y * ty; D.NECK_Y = base.NECK_Y * ty; D.hipY = base.hipY * ty;
  D.L1 = base.L1 * (1 + k * 0.8); D.L2 = base.L2 * (1 + k * 0.8);
  D.torsoX = base.torsoX * (1 + k * 0.25); D.SH_X = base.SH_X * (1 + k * 0.25);
  D.TOP = base.TOP + (D.NECK_Y - base.NECK_Y); D.FOOT = D.hipY - D.thigh - D.shin - 0.14; D.HIP_LOW = D.hipY - D.hemL;
  _dims.set(key, D); return D;
}
// tall hair styles raise the top of the figure (seats and framing use TOP)
const TALL = { afro: 0.42, bun: 0.38, spacebuns: 0.3, highpony: 0.18, spiky: 0.12 };
export function personDims(avatar) {
  const a = cleanAv(avatar), D = sized(a.body, a.height), extra = TALL[a.hairStyle] || 0;
  if (!extra) return D;
  const key = a.body + a.height + a.hairStyle; let E = _dims.get(key);
  if (!E) { E = Object.assign({}, D); E.TOP = D.TOP + extra * D.HEAD_R; _dims.set(key, E); }
  return E;
}

// ---------------- the look ----------------
const lum = (hex) => { const c = new THREE.Color(hex); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; };     // like kid.js
const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
// brows a shade darker than the hair, and never the same lightness as the skin (white hair on light skin, black on dark)
function browsFor(hair, skin) {
  let c = '#' + new THREE.Color(hair).multiplyScalar(0.85).getHexString();
  const L = lum(c), S = lum(skin);
  if (Math.abs(L - S) < 0.22) c = S > 0.45 ? mix(c, '#3a2a20', 0.55) : mix(c, '#0e0a08', 0.6);
  return c;
}
// rosy cheeks: a warm flush of the skin itself (deeper skin gets a subtler, browner flush, so it never looks painted on)
function cheeksFor(skin) { const L = lum(skin); return mix(skin, L > 0.5 ? '#e8746a' : '#b4413a', 0.22 + 0.36 * L); }
export function personLook(avatar) {
  const a = cleanAv(avatar), adult = a.body === 'adult-a' || a.body === 'adult-b', base = adult ? TATA_LOOK : KID_LOOK;
  const L = lum(a.skin), hl = a.streaks && a.streaks !== 'none' ? a.streaks : null;
  const look = Object.assign({}, base, BODY_LOOK[a.body] || {}, {
    skin: a.skin, hair: a.hair, hairStyle: a.hairStyle, eyes: a.eyes,
    brows: a.hair === base.hair && a.skin === base.skin ? base.brows : browsFor(a.hair, a.skin),
    cheeks: !a.cheeks ? null : a.skin === base.skin ? base.cheeks : cheeksFor(a.skin),
    stubble: a.beard === 'stubble', beard: a.beard,
    // Tata's few lighter strands belong to his own black tousled hair
    streaks: a.body === 'adult-b' && a.hairStyle === 'tousled' && a.hair === TATA_LOOK.hair && !hl ? TATA_LOOK.streaks : null,
    highlight: hl, glasses: a.glasses, glassCol: a.glassCol, freckles: !!a.freckles, lashes: !!a.lashes, gems: !!a.gems, acc: a.acc, accCol: a.accCol
  });
  // the stubble's dots in the hair colour (Tata's own stay as they are); a deeper mouth on deeper skin so a closed smile still reads
  if (a.beard === 'stubble' && !(a.hair === TATA_LOOK.hair && adult)) look.stubbleCol = a.hair;
  if (L < 0.5) look.mouthCol = L < 0.33 ? '#2a0b10' : '#43121a';
  return look;
}
// what forces a rebuild (everything else is a colour that setAvatar can change in place)
const SHAPE = ['body', 'height', 'hairStyle', 'glasses', 'beard', 'freckles', 'lashes', 'cheeks', 'acc', 'gems'];
export function personKey(avatar) { const p = P(), a = cleanAv(avatar); return p ? p.pack(a) : JSON.stringify(a); }
function sameShape(a, b) {
  if (SHAPE.some((k) => a[k] !== b[k])) return false;
  if ((a.streaks === 'none') !== (b.streaks === 'none')) return false;
  const la = personLook(a), lb = personLook(b);
  return !!la.streaks === !!lb.streaks && !!la.stubbleCol === !!lb.stubbleCol && !!la.mouthCol === !!lb.mouthCol;
}
export function buildPerson(spec) {
  spec = spec || {};
  const av = cleanAv(spec.avatar);
  const model = buildHuman({ dims: personDims(av), kit: spec.kit || KITS.red, num: spec.num, name: spec.name, front: spec.front, look: personLook(av) });
  model.avatar = av;
  model.setAvatar = function (next) {
    const b = cleanAv(next);
    if (!sameShape(model.avatar, b)) return false;
    if (model.recolor) model.recolor(personLook(b));
    model.avatar = b; return true;
  };
  return model;
}
