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
import { buildHuman, KID, KID_LOOK, KITS, KIT_ART, torsoProfile } from './kid.js';
import { std, clamp, roundedBox } from './common.js';
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
  // a kid with lashes: a little bigger, rounder, more open eyes (the cute look; the lashes then read from the table)
  if (!adult && a.lashes) { look.eyeK = 1.08; look.eyeH = Math.max(look.eyeH, 1.0); look.happy = Math.min(look.happy, 0.22); }
  if (L < 0.5) look.mouthCol = L < 0.33 ? '#120306' : '#2e0a10';
  return look;
}
// what forces a rebuild (everything else is a colour that setAvatar can change in place)
const SHAPE = ['body', 'height', 'hairStyle', 'glasses', 'beard', 'freckles', 'lashes', 'cheeks', 'acc', 'gems', 'outfit', 'bottom', 'shoes', 'fit1', 'fit2', 'fit3', 'shoeCol'];
export function personKey(avatar) { const p = P(), a = cleanAv(avatar); return p ? p.pack(a) : JSON.stringify(a); }
function sameShape(a, b) { return !SHAPE.some((k) => a[k] !== b[k]); }
export function buildPerson(spec) {
  spec = spec || {};
  const av = cleanAv(spec.avatar);
  const D = personDims(av), hs = { dims: D, kit: spec.kit || KITS.red, num: spec.num, name: spec.name, front: spec.front, look: personLook(av) };
  // everyday clothes (anything but the football kit): dressed on the same rig, the kit argument only gives name and number
  if (av.outfit && av.outfit !== 'kit') { hs.cloth = clothFor(D, av); hs.dress = dressFor(av, topDims(D, av.outfit), spec); }
  const model = buildHuman(hs);
  model.avatar = av;
  model.setAvatar = function (next) {
    const b = cleanAv(next);
    if (!sameShape(model.avatar, b)) return false;
    if (model.recolor) model.recolor(personLook(b));
    model.avatar = b; return true;
  };
  return model;
}

// ======================= EVERYDAY OUTFITS (avatar.outfit other than 'kit') =======================
// The football kit is drawn by kid.js as before. Any other outfit is put on by dress() below, which buildHuman calls once
// the figure is built (spec.dress): the kit's shirt, badges, sock and boot meshes are hidden and the outfit's own pieces are
// added to the same skeleton, so every pose, lean, kneel and arm rig drives them exactly as it drives the kit. All pieces
// are rigid on their bone (no cloth simulation, nothing moves at rest). A skirt is the one skinned piece: its waist follows
// the leaning upper body, its hips the pelvis and each side the thigh under it, so it goes wherever the legs go.
const { TORSO_CTRL, styledNumber, artCanvas, artTexture, mixHex, lumOf, star, sstep01, gauss, SEAM, TAU } = KIT_ART;
// The tops. roomy: extra width below the chest (oversized); hem: how far below the waist the hem hangs (x hipY); rib: a
// gathered knitted band at the hem; v: a V opening down to this height (x torsoY), 0 = closed; arm: sleeve roominess;
// long: long sleeves (else the big T-shirt's wide short sleeves)
const TOPS = {
  school: { roomy: 0.05, hem: 0.56, rib: 0, v: 1.0, long: true, arm: 1.16 },
  cardigan: { roomy: 0.06, hem: 0.5, rib: 1, v: 1.1, long: true, arm: 1.2 },
  hoodie: { roomy: 0.1, hem: 0.52, rib: 1, v: 0, long: true, arm: 1.3 },
  varsity: { roomy: 0.08, hem: 0.38, rib: 1, v: 0, long: true, arm: 1.22 },
  tee: { roomy: 0.09, hem: 0.48, rib: 0, v: 0, long: false, arm: 1 }
};
const LONG_HAIR = { long: 1, wavy: 1, curtain: 1, halfup: 1, braids: 1, ponytail: 1, highpony: 1, pigtails: 0.5, bob: 0.4 };
// the body's own shirt profile as r(y), both in units of torsoX / torsoY (the profile runs up monotonically in y)
const _base = new Map();
function baseR(D) {
  const ctrl = D.torsoCtrl || TORSO_CTRL; let f = _base.get(ctrl); if (f) return f;
  const pts = new THREE.SplineCurve(ctrl.map((q) => new THREE.Vector2(q[0], q[1]))).getPoints(90);
  f = (y) => { if (y <= pts[0].y) return pts[0].x; for (let j = 1; j < pts.length; j++) if (pts[j].y >= y) { const a = pts[j - 1], b = pts[j], t = (y - a.y) / ((b.y - a.y) || 1e-6); return a.x + (b.x - a.x) * t; } return 0.001; };
  _base.set(ctrl, f); return f;
}
// the top's own profile (units of torsoX / torsoY, bottom to top): the body's shirt line with the waist filled out and a
// little roomier below the chest, a cloth thickness everywhere, continued straight down past the waist to the hem, where
// the cloth turns in a little (an open hem: the lathe is not closed at the bottom). Near the shoulders and the neck it
// stays close, so the arms' shoulder balls and the neck sit as they do in the kit.
function topR(D, o) {
  const rb = baseR(D), tx = D.torsoX, th = 0.022 / tx;
  let chest = 0; for (let y = 0.7; y <= 1.3; y += 0.05) chest = Math.max(chest, rb(y));
  return (y) => {
    const w = sstep01((1.42 - y) / 0.55), body = rb(clamp(y, 0.42, 1.9));
    const fill = Math.max(body, chest * (0.94 + 0.04 * w)) * (1 + o.roomy * w);
    return (y > 1.42 ? rb(y) : body + (fill - body) * w) + th;
  };
}
const _tops = new Map();
export function topDims(D, outfit) {
  const key = outfit; let m = _tops.get(D); if (!m) { m = {}; _tops.set(D, m); }
  if (m[key]) return m[key];
  const o = TOPS[outfit] || TOPS.tee, f = topR(D, o), ty = D.torsoY, yH = D.hipY * o.hem / ty, ctrl = [];
  const rH = f(0.3) * (o.rib ? 0.95 : 1.0);
  ctrl.push([rH * 0.9, yH + 0.06], [rH * 0.96, yH + 0.005], [rH, yH + 0.03]);
  if (o.rib) ctrl.push([rH * 1.004, yH + 0.1], [f(0.3) * 0.99, yH + 0.2]);
  for (let y = Math.max(yH + (o.rib ? 0.3 : 0.14), 0.0); y < 1.74; y += 0.12) ctrl.push([f(Math.max(y, 0.3)), y]);
  ctrl.push([f(1.78), 1.78], [Math.max(0.4, f(1.86)), 1.86], [0.001, 1.885]);
  const T = Object.assign({}, D, { torsoCtrl: ctrl, openHem: true, profN: 60, muscle: 0, hemY: yH * ty, top: o, outfit });
  T.prof = torsoProfile(T);
  m[key] = T; return T;
}

// ---------- painting the cloth (canvas over the top's surface: x round the body from the seam under the right arm,
// y by arc length down from the neck, exactly like the kit's shirt texture) ----------
function clothCanvas(P, W, H) {
  const cv = artCanvas(W, H), g = cv.getContext('2d');
  const X = (phi) => { let u = (phi - SEAM) / TAU; u -= Math.floor(u); return u * W; };
  const Y = (s) => s / P.sTot * H, pyU = H / P.sTot, pxU = (s) => W / (TAU * Math.max(0.05, P.at(s).r));
  // draws something in body units centred on (phi, sC) without stretching it on a tapering body (row by row, as the kit does)
  const warp = (phi, sC, wU, hU, draw) => {
    const pxR = pxU(sC), wP = Math.ceil(wU * pxR) + 8, hP = Math.ceil(hU * pyU) + 8, off = artCanvas(wP, hP), o = off.getContext('2d');
    o.setTransform(pxR, 0, 0, pyU, wP / 2, hP / 2); draw(o, pxR);
    const x0 = X(phi), y0 = Y(sC) - hP / 2;
    for (let y = 0; y < hP; y++) { const w = wP * pxU(sC + (y + 0.5 - hP / 2) / pyU) / pxR; for (const ox of [0, W, -W]) g.drawImage(off, 0, y, wP, 1, x0 - w / 2 + ox, y0 + y, w, 1); }
  };
  // a point given as x across in body units from the front middle (+ = his left) and s down -> canvas
  const at = (x, s) => [X(x / Math.max(0.05, P.at(s).r)), Y(s)];
  return { cv, g, X, Y, pyU, pxU, warp, at, W, H, P };
}
const FONT_BOLD = '"Arial Black", Impact, "Trebuchet MS", sans-serif', FONT_NEAT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif', FONT_SLAB = 'Rockwell, "Roboto Slab", Georgia, serif';
// the name: in an arc (f.R > 0, units) or straight, f.size units tall, at most f.maxW wide; drawn into a warp() box (o, pxR)
function nameText(o, pxR, pyU, nm, f) {
  if (!nm) return;
  const k = pxR / pyU; let fs = f.size * pyU; o.font = (f.weight || '900') + ' ' + fs + 'px ' + f.font;
  const maxW = f.maxW * pxR; let wid = o.measureText(nm).width * k;
  if (wid > maxW) { fs *= maxW / wid; o.font = (f.weight || '900') + ' ' + fs + 'px ' + f.font; wid = maxW; }
  const x0 = o.canvas.width / 2, y0 = o.canvas.height / 2, sp = fs * (f.space || 0.06), R = (f.R || 0) * pxR;
  let cur = -(wid + sp * (nm.length - 1)) / 2;
  o.textAlign = 'center'; o.textBaseline = 'middle'; o.lineJoin = 'round';
  for (const ch of nm) {
    const cw = o.measureText(ch).width * k, a = R ? (cur + cw / 2) / R : 0;
    o.setTransform(1, 0, 0, 1, x0 + (R ? Math.sin(a) * R : cur + cw / 2), y0 + (R ? (1 - Math.cos(a)) * R : 0)); o.rotate(a); o.scale(k, 1);
    if (f.edge) { o.lineWidth = fs * (f.edgeW || 0.2); o.strokeStyle = f.edge; o.strokeText(ch, 0, 0); }
    o.fillStyle = f.fill; o.fillText(ch, 0, 0);
    cur += cw + sp;
  }
}
// knit / weave / fleece surfaces: soft and fine, never busy at table distance
function fabric(C, kind, col) {
  const { g, W, H } = C;
  g.fillStyle = col; g.fillRect(0, 0, W, H);
  const L = lumOf(col), dk = L > 0.75 ? 'rgba(0,0,0,.05)' : 'rgba(0,0,0,.09)', lt = L > 0.75 ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.06)';
  if (kind === 'knit') { for (let x = 0; x < W; x += 6) { g.fillStyle = dk; g.fillRect(x, 0, 2, H); g.fillStyle = lt; g.fillRect(x + 3, 0, 2, H); } }
  else if (kind === 'twill') { g.strokeStyle = dk; g.lineWidth = 1.2; for (let x = -H; x < W; x += 7) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke(); } }
  else if (kind === 'fleece') { for (let i = 0; i < 2600; i++) { const x = (i * 733) % W, y = (i * 389 + (i >> 3) * 17) % H; g.fillStyle = i % 2 ? dk : lt; g.fillRect(x, y, 3, 2); } }
}
// the side seams under the arms
function seams(C, col) {
  const { g, X, H } = C; g.fillStyle = mixHex(col, '#000000', 0.22);
  [Math.PI / 2, -Math.PI / 2].forEach((phi) => { const x = X(phi); for (const ox of [0, C.W]) g.fillRect(x + ox - 1.5, 0, 3, H); });
}
// a ribbed band all round between two arc lengths; stripes: [[from, to, colour]] as fractions across the band
function ribBand(C, s0, s1, col, stripes) {
  const { g, W, Y } = C, y0 = Y(s0), y1 = Y(s1);
  g.fillStyle = mixHex(col, '#000000', 0.06); g.fillRect(0, y0, W, y1 - y0);
  (stripes || []).forEach((q) => { g.fillStyle = q[2]; g.fillRect(0, y0 + (y1 - y0) * q[0], W, (y1 - y0) * (q[1] - q[0])); });
  for (let x = 0; x < W; x += 7) { g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(x, y0, 2, y1 - y0); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 3, y0, 2, y1 - y0); }
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y0 - 1, W, 2);
}
// a colour that reads on bg: pref when it contrasts enough, else navy on light cloth / white on dark
function ink(bg, pref) { const a = lumOf(bg); return pref && Math.abs(lumOf(pref) - a) > 0.28 ? pref : a > 0.55 ? '#1d2b3a' : '#f8f9fa'; }
const SHIRT = '#f8f9fa';
// where things are on a top (shared by the painting and the shapes): the neckline, the V and its lapels / button band,
// the hem and its ribbed band, the hoodie's pocket. x across in body units (+ = his left), s = arc length down.
function topPlan(T) {
  const P = T.prof, tx = T.torsoX, ty = T.torsoY, o = T.top, plan = { P, tx, ty, o };
  plan.s0 = P.sAtR(0.42 * tx); plan.sHem = P.sAtY(T.hemY + 0.004); plan.sRib = o.rib ? P.sAtY(T.hemY + 0.19 * ty) : plan.sHem;
  if (o.v) {
    plan.sTip = P.sAtY(o.v * ty); plan.xN = 0.2 * tx;
    plan.xV = (s) => plan.xN * clamp((plan.sTip - s) / (plan.sTip - plan.s0), 0, 1);
    // lapels (school): widest near the top, narrowing to the point of the V; a cardigan's button band is narrow and even
    plan.wL = T.outfit === 'school' ? (s) => 0.015 * tx + 0.15 * tx * (1 - Math.pow(clamp((s - plan.s0) / (plan.sTip - plan.s0), 0, 1), 1.5)) : () => 0.055 * tx;
  }
  if (T.outfit === 'hoodie') { plan.pTop = P.sAtY(0.6 * ty); plan.pBot = P.sAtY(0.1 * ty); plan.pX = (s) => { const t = clamp((s - plan.pTop) / (plan.pBot - plan.pTop), 0, 1); return tx * (0.27 + 0.2 * Math.min(1, t / 0.55)); }; }
  return plan;
}
// the whole top's texture: cloth, seams, bands, the front details and the name and number on the back
function topTexture(T, av, num, name) {
  const plan = topPlan(T), P = T.prof, tx = T.torsoX, ty = T.torsoY, c1 = av.fit1, c2 = av.fit2, kind = T.outfit;
  const C = clothCanvas(P, 2048, 1024), { g, X, Y, at, warp } = C, sy = (y) => P.sAtY(y * ty);
  fabric(C, kind === 'cardigan' ? 'knit' : kind === 'hoodie' ? 'fleece' : kind === 'tee' ? 'fleece' : 'twill', c1);
  seams(C, c1);
  // inside the neck (only seen when he bends right over) and the turned-in hem: a shade darker
  g.fillStyle = mixHex(c1, '#000000', 0.35); g.fillRect(0, 0, C.W, Y(plan.s0 - 0.02)); g.fillRect(0, Y(plan.sHem), C.W, C.H - Y(plan.sHem));
  const poly = (pts, fill, stroke, lw) => { g.beginPath(); pts.forEach((p, i) => { const q = at(p[0], p[1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 3; g.stroke(); } };
  const line = (pts, col, lw, dash) => { g.beginPath(); pts.forEach((p, i) => { const q = at(p[0], p[1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.strokeStyle = col; g.lineWidth = lw || 3; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]); };
  const dark = mixHex(c1, '#000000', 0.25), stitch = lumOf(c1) > 0.6 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.28)';
  if (plan.sRib < plan.sHem) ribBand(C, plan.sRib, plan.sHem, c1, kind === 'varsity' ? [[0.25, 0.4, c2], [0.58, 0.73, c2]] : null);
  else line([[-9, plan.sHem - 0.05 * ty], [9, plan.sHem - 0.05 * ty]], stitch, 2, [7, 6]);
  const V = (n) => { const out = []; for (let k = 0; k <= n; k++) { const s = plan.s0 + (plan.sTip - plan.s0) * k / n; out.push([-plan.xV(s), s]); } for (let k = n; k >= 0; k--) { const s = plan.s0 + (plan.sTip - plan.s0) * k / n; out.push([plan.xV(s), s]); } return out; };
  if (kind === 'school' || kind === 'cardigan') {
    // the shirt in the V (and above it, under the collar)
    const shirt = kind === 'school' ? (lumOf(c1) > 0.85 ? '#dfe7ef' : SHIRT) : c2;
    poly(V(12).concat([[plan.xN * 1.4, 0], [-plan.xN * 1.4, 0]]), shirt);
    line([[0, plan.s0 + 0.04 * ty], [0, plan.sTip]], 'rgba(0,0,0,.18)', 2);
    if (kind === 'school') {
      // the tie: a knot under the collar, widening down to a point (it carries on under the closed blazer)
      const tw = (s) => tx * (0.04 + 0.035 * clamp((s - plan.s0) / (plan.sTip - plan.s0), 0, 1));
      const tiePts = []; for (let k = 0; k <= 8; k++) { const s = plan.s0 + 0.03 * ty + (plan.sTip + 0.1 * ty - plan.s0) * k / 8; tiePts.push([tw(s), s]); }
      const tie = tiePts.concat(tiePts.slice().reverse().map((p) => [-p[0], p[1]]));
      poly(tie, c2);
      g.save(); g.beginPath(); tie.forEach((p, i) => { const q = at(p[0], p[1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.clip();
      g.strokeStyle = mixHex(c2, '#ffffff', 0.35); g.lineWidth = 6; for (let y = Y(plan.s0) - 200; y < Y(plan.sTip + 0.2); y += 22) { g.beginPath(); g.moveTo(X(0) - 80, y); g.lineTo(X(0) + 80, y + 70); g.stroke(); }
      g.restore();
      // the lapels a touch lighter, with a crisp edge and a notch; the front edge (left over right) and two pockets
      [-1, 1].forEach((sd) => {
        const pts = []; for (let k = 0; k <= 10; k++) { const s = plan.s0 + (plan.sTip - plan.s0) * k / 10; pts.push([sd * plan.xV(s), s]); }
        for (let k = 10; k >= 0; k--) { const s = plan.s0 + (plan.sTip - plan.s0) * k / 10; pts.push([sd * (plan.xV(s) + plan.wL(s)), s]); }
        poly(pts, mixHex(c1, '#ffffff', 0.07), mixHex(c1, '#000000', 0.35), 3);
        const sn = plan.s0 + 0.28 * (plan.sTip - plan.s0); line([[sd * (plan.xV(sn) + plan.wL(sn)), sn], [sd * (plan.xV(sn) + plan.wL(sn) * 0.45), sn + 0.03 * ty]], mixHex(c1, '#000000', 0.4), 3);
      });
      line([[-0.015 * tx, plan.sTip], [-0.015 * tx, plan.sHem]], mixHex(c1, '#000000', 0.35), 3);
      line([[0.3 * tx, sy(1.28)], [0.46 * tx, sy(1.3)]], dark, 4);
      [-1, 1].forEach((sd) => poly([[sd * 0.32 * tx, sy(0.42)], [sd * 0.58 * tx, sy(0.42)], [sd * 0.58 * tx, sy(0.3)], [sd * 0.32 * tx, sy(0.3)]], mixHex(c1, '#000000', 0.04), dark, 3));
      line([[Math.PI * P.at(sy(0.25)).r, sy(0.25)], [Math.PI * P.at(plan.sHem).r, plan.sHem]], dark, 3);
    } else {
      // the shirt's placket and two tiny buttons; the cardigan's button band round the V and down the front
      [0.3, 0.6].forEach((t) => { const q = at(0, plan.s0 + (plan.sTip - plan.s0) * t); g.fillStyle = ink(c2, '#ffffff'); g.beginPath(); g.arc(q[0], q[1], 5, 0, TAU); g.fill(); });
      const band = (sd) => {
        const inner = [], outer = [];
        for (let k = 0; k <= 10; k++) { const s = plan.s0 + (plan.sTip - plan.s0) * k / 10; inner.push([sd * plan.xV(s), s]); outer.push([sd * (plan.xV(s) + plan.wL(s)), s]); }
        inner.push([0, plan.sHem]); outer.push([sd * plan.wL(plan.sHem), plan.sHem]);
        return inner.concat(outer.reverse());
      };
      [-1, 1].forEach((sd) => poly(band(sd), mixHex(c1, '#000000', 0.08), mixHex(c1, '#000000', 0.25), 2));
    }
  } else if (kind === 'hoodie') {
    const pts = []; for (let k = 0; k <= 10; k++) { const s = plan.pTop + (plan.pBot - plan.pTop) * k / 10; pts.push([plan.pX(s), s]); }
    const outline = pts.concat(pts.slice().reverse().map((p) => [-p[0], p[1]]));
    poly(outline, null, stitch, 2.5);
    [-1, 1].forEach((sd) => line(pts.slice(0, 7).map((p) => [sd * (p[0] - 0.012 * tx), p[1]]), 'rgba(0,0,0,.35)', 7));
  } else if (kind === 'varsity') {
    line([[0, plan.s0], [0, plan.sHem]], mixHex(c1, '#000000', 0.35), 3);
    [-1, 1].forEach((sd) => poly([[sd * 0.4 * tx, sy(0.62)], [sd * 0.47 * tx, sy(0.62)], [sd * 0.54 * tx, sy(0.3)], [sd * 0.47 * tx, sy(0.3)]], c2, mixHex(c2, '#000000', 0.3), 2));
    // the patch: a round felt badge with an "=" (our own, for a game about equations)
    warp(0.42, sy(1.22), 0.3 * tx, 0.3 * tx, (o) => { const r = 0.12 * tx; o.beginPath(); o.arc(0, 0, r, 0, TAU); o.fillStyle = '#f8f9fa'; o.fill(); o.lineWidth = r * 0.16; o.strokeStyle = c2; o.stroke();
      o.fillStyle = c2; o.fillRect(-r * 0.5, -r * 0.36, r, r * 0.22); o.fillRect(-r * 0.5, r * 0.14, r, r * 0.22); });
  } else if (kind === 'tee') {
    // a big star on the chest, our own simple graphic
    const sc2 = ink(c1, c2);
    warp(0, sy(1.08), 0.62 * tx, 0.62 * tx, (o) => { o.beginPath(); star(o, 0, 0.02 * tx, 0.24 * tx, 5, 0.46); o.lineJoin = 'round'; o.lineWidth = 0.05 * tx; o.strokeStyle = sc2; o.stroke();
      o.beginPath(); star(o, 0, 0.03 * tx, 0.09 * tx, 5, 0.46); o.fillStyle = sc2; o.fill(); });
  }
  backPrint(C, T, av, num, name);
  return artTexture(C.cv);
}
// The player's name and number on the back (the game knows players from behind), in a style that suits the garment:
// a casual tee number, a varsity-style number on the hoodie and the jacket, a neat small name over a small number on the
// blazer and the cardigan. Nothing on the front but what belongs to the garment.
function backPrint(C, T, av, num, name) {
  const P = T.prof, tx = T.torsoX, ty = T.torsoY, c1 = av.fit1, c2 = av.fit2, sy = (y) => P.sAtY(y * ty), B = Math.PI;
  const nm = String(name == null ? '' : name).toUpperCase().slice(0, 12), n = String(num == null ? '' : num).replace(/[^0-9]/g, '').slice(0, 2);
  const a = ink(c1, T.outfit === 'school' ? mixHex(c2, '#ffffff', 0.35) : c2);
  const S = {
    tee: { y: 1.34, f: { font: FONT_BOLD, size: 0.13, R: 1.6, maxW: 1.0 }, ny: 0.86, nh: 0.5, style: 'round' },
    hoodie: { y: 1.13, f: { font: FONT_BOLD, size: 0.11, R: 1.5, maxW: 0.9 }, ny: 0.7, nh: 0.44, style: 'college' },
    varsity: { y: 1.36, f: { font: FONT_SLAB, weight: '700', size: 0.15, R: 1.7, maxW: 1.05, edgeW: 0.28 }, ny: 0.83, nh: 0.56, style: 'college' },
    school: { y: 1.3, f: { font: FONT_NEAT, weight: '700', size: 0.075, maxW: 0.7, space: 0.12 }, ny: 1.1, nh: 0.2, style: 'thin' },
    cardigan: { y: 1.3, f: { font: FONT_NEAT, weight: '700', size: 0.08, maxW: 0.72, space: 0.1 }, ny: 1.09, nh: 0.2, style: 'round' }
  }[T.outfit] || {};
  const e = T.outfit === 'varsity' ? (lumOf(a) > 0.8 ? mixHex(c1, '#000000', 0.4) : '#f8f9fa') : T.outfit === 'tee' ? mixHex(c1, lumOf(c1) > 0.5 ? '#000000' : '#ffffff', 0.25) : c1;
  if (nm && S.f) {
    const f = Object.assign({}, S.f, { size: S.f.size * ty, R: S.f.R ? S.f.R * tx : 0, maxW: S.f.maxW * tx, fill: a, edge: T.outfit === 'varsity' ? e : null });
    C.warp(B, sy(S.y), 1.3 * tx, 0.5 * ty, (o, pxR) => nameText(o, pxR, C.pyU, nm, f));
  }
  if (n && S.nh) {
    const h = S.nh * ty, shadow = T.outfit === 'school' || T.outfit === 'cardigan' ? null : lumOf(c1) > 0.55 ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.3)';
    C.warp(B, sy(S.ny), 1.6 * h, 1.4 * h, (o) => styledNumber(o, n, h, S.style, 'b', { a, e, s: c1 }, shadow));
  }
}
// ---------- shapes on the top (all in the shirt group's space, before its front-to-back squash) ----------
const uvOf = (P, phi, s, out, i) => { let u = (phi - SEAM) / TAU; u -= Math.floor(u); out[i * 2] = u; out[i * 2 + 1] = 1 - s / P.sTot; };
// a patch lying on the top: fn(a, b) -> [x across (+ = his left), s down, lift off the cloth], a and b in 0..1. Its
// uv are the top's own, so with the top's material it shows exactly the cloth painted under it (a raised panel).
function patchGeo(P, NU, NV, fn) {
  const pos = new Float32Array((NU + 1) * (NV + 1) * 3), uv = new Float32Array((NU + 1) * (NV + 1) * 2), idx = [], v = new THREE.Vector3();
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const k = j * (NU + 1) + i, q = fn(i / NU, j / NV), phi = q[0] / Math.max(0.05, P.at(q[1]).r);
    P.pos(phi, q[1], q[2], v); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; uvOf(P, phi, q[1], uv, k);
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // keep the normals facing out of the body whichever way the patch was wound
  const n = g.attributes.normal; let flip = 0; for (let k = 0; k < n.count; k++) { v.fromBufferAttribute(g.attributes.position, k); flip += n.getX(k) * v.x + n.getZ(k) * v.z; }
  if (flip < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); }
  return g;
}
const wall = (a, w) => sstep01(a / w) * sstep01((1 - a) / w);
// the top's radius at a body height (scanning down from the neck; fine above the hem)
function rAtY(P, y) { const q = P.pts; for (let j = q.length - 1; j > 0; j--) { const a = q[j], b = q[j - 1]; if (b.y <= y && a.y >= y) return a.x + (b.x - a.x) * (a.y - y) / ((a.y - b.y) || 1e-6); } return q[0].x; }
// a ring round the base of the neck (crew neck, a hood's edge, a knitted collar, a shirt collar): pts [r, y] bottom to top
function neckRing(rIn, rOut, y, h, phi0, len) {
  const pts = [[rOut + 0.004, y - 0.035], [rOut + 0.008, y + h * 0.35], [rOut * 0.55 + rIn * 0.45, y + h], [rIn + 0.004, y + h * 0.82], [rIn, y - 0.04]];
  const g = new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(q[0], q[1])), 40, phi0 == null ? 0 : phi0, len == null ? TAU : len);
  return g;
}
// a small canvas texture repeated round a band: knitted ribs, optional stripes across ([from, to, colour], 0 = bottom)
function ribTexture(col, stripes, rep) {
  const cv = artCanvas(64, 64), g = cv.getContext('2d');
  g.fillStyle = col; g.fillRect(0, 0, 64, 64);
  (stripes || []).forEach((q) => { g.fillStyle = q[2]; g.fillRect(0, (1 - q[1]) * 64, 64, (q[1] - q[0]) * 64); });
  for (let x = 0; x < 64; x += 8) { g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x, 0, 3, 64); g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x + 5, 0, 2, 64); }
  const t = artTexture(cv); t.wrapS = THREE.RepeatWrapping; t.repeat.set(rep || 12, 1); return t;
}
// the hood lying behind the neck: its size, and how far it stands off the back at a body height (cloth.back, so long
// hair, ponytails and braids hang over it). Long hair gets a flatter hood, lower down (the hair lies on top of it).
function hoodSpec(T, hairStyle) {
  const tx = T.torsoX, ty = T.torsoY, flat = LONG_HAIR[hairStyle] || 0;
  return { yc: T.SH_Y + 0.12 * ty - 0.04 * flat * ty, hw: (0.42 - 0.04 * flat) * tx, hh: (0.27 - 0.05 * flat) * ty, hd: (0.2 - 0.09 * flat) * tx, flat };
}
function hoodBack(H, zs) { return (yc) => H.hd * zs * gauss((yc - H.yc) / H.hh, 0.8) * (yc > H.yc - H.hh ? 1 : 0); }
function hoodGeo(T, H, rn) {
  const P = T.prof, g = new THREE.SphereGeometry(1, 30, 18), p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3();
  const yTop = T.prof.pts[T.prof.pts.length - 1].y;
  for (let k = 0; k < p.count; k++) {
    v.fromBufferAttribute(p, k);
    const nx = v.x, ny = v.y, nz = v.z;
    // a soft pouch: fuller at the bottom where the cloth gathers, the top rim rolled round the back of the neck
    const x = nx * H.hw * (1 - 0.18 * Math.max(0, ny)), y = H.yc + ny * H.hh, R = rAtY(P, Math.min(y, yTop - 0.005));
    // the inner half lies on the back of the top, the outer half bulges out by the hood's depth
    const z = -Math.sqrt(Math.max(0, R * R - x * x)) - 0.008 - H.hd * Math.max(0, -nz) * (1 + 0.2 * Math.max(0, -ny));
    // round the neck: never inside the neck, the rim standing just behind it
    const rr = Math.hypot(x, z); let X = x, Z = z;
    if (y > yTop - 0.15 && rr < rn + 0.05) { const f = (rn + 0.05) / Math.max(rr, 1e-4); X *= f; Z *= f; }
    p.setXYZ(k, X, y, Z);
    // the lining: the hood's open top shows its darker inside
    const lin = ny > 0.25 && nz > -0.55 ? 0.62 : 1;
    col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = lin * (0.9 + 0.1 * clamp(-nz, 0, 1));
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}
// a button / snap lying on the top at (x, s)
function onTop(P, mesh, x, s, lift) {
  const phi = x / Math.max(0.05, P.at(s).r), v = new THREE.Vector3(), n = new THREE.Vector3();
  P.pos(phi, s, lift, v); P.nrm(phi, s, n); mesh.position.copy(v); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); return mesh;
}
// a cord lying on the top's surface: points (x, s) -> a thin tube just off the cloth
function cordGeo(P, pts, r, lift) {
  const v3 = pts.map((q) => P.pos(q[0] / Math.max(0.05, P.at(q[1]).r), q[1], lift, new THREE.Vector3()));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v3), 16, r, 6, false);
}
// The top: the cloth (a lathe like the kit's shirt, with its own roomier profile), then what belongs to the garment:
// collars, the hood, drawstrings, pockets, lapels, button bands, buttons and snaps, the tie knot.
function buildTop(rig, T, av, num, name) {
  const P = T.prof, tx = T.torsoX, ty = T.torsoY, kind = T.outfit, c1 = av.fit1, c2 = av.fit2, D = rig.D, plan = topPlan(T);
  const G = new THREE.Group(); rig.shirtG.add(G);
  const mat = std(0xffffff, { map: topTexture(T, av, num, name), roughness: kind === 'varsity' ? 0.78 : 0.9, side: THREE.DoubleSide });
  const geo = new THREE.LatheGeometry(P.pts, 64, SEAM, TAU);
  { const uv = geo.attributes.uv; for (let i = 0; i <= 64; i++) for (let j = 0; j < P.n; j++) uv.setY(i * P.n + j, 1 - P.S[j] / P.sTot); }
  const add = (g, m) => rig.add(g, m, G);
  add(geo, mat);
  const plain = (col, o) => std(new THREE.Color(col).getHex(), Object.assign({ roughness: 0.85 }, o || {}));
  const yAtR = (r) => P.at(P.sAtR(r)).y, rn = 0.25 * (D.neckR || 1) + 0.012, y0 = P.at(plan.s0).y;
  const lapel = (sd, wFn, NU, NV, lift, sEnd) => add(patchGeo(P, NU, NV, (a, b) => {
    const s = plan.s0 + ((sEnd || plan.sTip) - plan.s0) * b, xi = s <= plan.sTip ? plan.xV(s) : 0;
    return [sd * (xi + a * wFn(s)), s, 0.002 + lift * sstep01(a / 0.12) * (1 - 0.5 * a) * (1 - sstep01((a - 0.86) / 0.14))];
  }), mat);
  const collarPoint = (sd, round, col) => add(patchGeo(P, 8, 6, (a, b) => {
    if (round) { const th = a * Math.PI, rx = 0.09 * tx, ry = 0.075 * ty; return [sd * (0.1 * tx + Math.cos(th) * rx * b), plan.s0 - 0.005 + Math.sin(th) * ry * b, 0.016]; }
    const Ax = 0.035 * tx, As = plan.s0 - 0.012, Bx = 0.19 * tx, Bs = plan.s0 - 0.004, Cx = 0.1 * tx, Cs = plan.s0 + 0.13 * ty;
    return [sd * ((Ax + (Bx - Ax) * a) * (1 - b) + Cx * b), (As + (Bs - As) * a) * (1 - b) + Cs * b, 0.014 + 0.006 * (1 - b)];
  }), plain(col, { side: THREE.DoubleSide }));
  const button = (x, s, r, m) => onTop(P, rig.add(new THREE.CylinderGeometry(r, r * 1.05, r * 0.45, 12).rotateX(Math.PI / 2), m, G), x, s, 0.012);
  const pieces = { hood: null };
  if (kind === 'tee') {
    add(neckRing(rn, 0.37 * tx, yAtR(0.37 * tx), 0.045), std(0xffffff, { map: ribTexture(ink(c1, c2), null, 14), roughness: 0.85 }));
  } else if (kind === 'hoodie') {
    add(neckRing(rn, 0.43 * tx, y0, 0.075), plain(mixHex(c1, '#000000', 0.04)));
    pieces.hoodMat = std(new THREE.Color(c1).getHex(), { roughness: 0.92, vertexColors: true });
    // the drawstrings: two cords from the hood's edge down the chest, with tipped ends
    const cordM = plain(ink(c1, c2), { roughness: 0.6 });
    [-1, 1].forEach((sd) => {
      const x = sd * 0.085 * tx, sA = P.sAtR(0.43 * tx) + 0.01, sB = sA + 0.36 * ty;
      add(cordGeo(P, [[x, sA], [x * 1.1, (sA + sB) / 2], [x * 1.18, sB]], 0.014 * tx, 0.016), cordM);
      onTop(P, rig.add(new THREE.CylinderGeometry(0.02 * tx, 0.02 * tx, 0.07 * ty, 8), cordM, G), x * 1.18, sB + 0.03 * ty, 0.018);
    });
    add(patchGeo(P, 18, 10, (a, b) => { const s = plan.pTop + (plan.pBot - plan.pTop) * b; return [(a * 2 - 1) * plan.pX(s), s, 0.004 + 0.02 * wall(a, 0.05) * wall(b, 0.06)]; }), mat);
  } else if (kind === 'varsity') {
    add(neckRing(rn, 0.41 * tx, y0, 0.095), std(0xffffff, { map: ribTexture(c1, [[0.3, 0.42, c2], [0.55, 0.67, c2]], 16), roughness: 0.85 }));
    const snapM = plain(mixHex(c2, '#adb5bd', 0.3), { roughness: 0.35, metalness: 0.4 });
    for (let k = 0; k < 5; k++) button(0, plan.s0 + 0.13 * ty + (plan.sRib - 0.06 * ty - plan.s0 - 0.13 * ty) * k / 4, 0.028 * tx, snapM);
  } else if (kind === 'school' || kind === 'cardigan') {
    const shirt = kind === 'school' ? (lumOf(c1) > 0.85 ? '#dfe7ef' : SHIRT) : c2;
    add(neckRing(rn, rn + 0.065, yAtR(rn + 0.065), 0.075), plain(shirt));
    [-1, 1].forEach((sd) => collarPoint(sd, kind === 'cardigan', shirt));
    // the collar round the back of the neck (the blazer's own, or the cardigan's knitted band)
    const back = kind === 'school' ? plain(mixHex(c1, '#ffffff', 0.05)) : std(0xffffff, { map: ribTexture(mixHex(c1, '#000000', 0.08), null, 10), roughness: 0.9 });
    add(neckRing(rn + 0.05, 0.43 * tx, y0 + 0.005, kind === 'school' ? 0.075 : 0.05, 0.75, TAU - 1.5), back);
    if (kind === 'school') {
      [-1, 1].forEach((sd) => lapel(sd, plan.wL, 6, 16, 0.028));
      const knot = rig.add(roundedBox(0.085 * tx, 0.075 * ty, 0.05 * tx, 0.018 * tx, 3), plain(c2), G); onTop(P, knot, 0, plan.s0 + 0.035 * ty, 0.03);
      const btnM = plain(lumOf(c1) < 0.4 ? '#c9a227' : mixHex(c1, '#000000', 0.55), { roughness: 0.4, metalness: lumOf(c1) < 0.4 ? 0.5 : 0 });
      [0.12, 0.34].forEach((d) => button(-0.015 * tx, plan.sTip + d * ty, 0.032 * tx, btnM));
    } else {
      [-1, 1].forEach((sd) => lapel(sd, plan.wL, 3, 24, 0.016, plan.sRib));
      const btnM = plain(mixHex(ink(c1, c2), '#ffffff', 0.3), { roughness: 0.35 });
      for (let k = 0; k < 4; k++) button(0, plan.sTip + 0.06 * ty + (plan.sRib - plan.sTip - 0.16 * ty) * k / 3, 0.027 * tx, btnM);
    }
  }
  return { G, mat, plan, pieces, repaint(n, nm) { const o = mat.map; mat.map = topTexture(T, av, n, nm); mat.needsUpdate = true; if (o) o.dispose(); } };
}
// ---------- sleeves ----------
// Long sleeves (school, cardigan, hoodie, varsity): the whole arm in the sleeve's cloth, roomier, with a cuff at the wrist
// (knitted, striped on the varsity jacket, a white shirt cuff under the blazer). The big T-shirt: wide short sleeves to
// above the elbow with a contrast band. The arm rig is the kit's own (player.js drives it unchanged).
function dressArms(rig, T, av) {
  const o = T.top, kind = T.outfit, c1 = av.fit1, c2 = av.fit2, mus = rig.sizes.mus;
  rig.armband.visible = false; rig.shoulderMarks.forEach((m) => { m.visible = false; });
  rig.gloves.forEach((G) => { G.parts.forEach((p) => { p.material = rig.skin; }); G.strap.visible = false; G.arm.hand.scale.setScalar(1); });
  rig.wrists.forEach((w) => { w.visible = false; });
  // the shoulder ball sits a little lower and flatter under cloth (no puffed shoulders)
  const ballG = new THREE.SphereGeometry(1, 18, 12).scale(1, 0.84, 1).translate(0, -0.1, 0);
  rig.arms.forEach((arm) => { arm.sBall.geometry = ballG; });
  const sleeveM = std(new THREE.Color(kind === 'varsity' ? c2 : c1).getHex(), { roughness: kind === 'varsity' ? 0.55 : 0.9 });
  if (o.long) {
    const cuffMat = kind === 'school' ? std(new THREE.Color(lumOf(c1) > 0.85 ? '#dfe7ef' : SHIRT).getHex(), { roughness: 0.8 })
      : std(0xffffff, { map: ribTexture(kind === 'varsity' ? c1 : mixHex(c1, '#000000', 0.07), kind === 'varsity' ? [[0.3, 0.45, c2], [0.6, 0.75, c2]] : null, 10), roughness: 0.85 });
    const upG = new THREE.CylinderGeometry(0.95, 1, 1, 16), foreG = new THREE.CylinderGeometry(0.86, 1, 1, 16);
    rig.arms.forEach((arm) => {
      arm.rUp *= o.arm; arm.rFore *= o.arm * 1.02; arm.sleeveR = arm.rUp * 1.06;          // (sleeveR sizes the shoulder ball)
      if (mus) { arm.upper.geometry = upG; arm.fore.geometry = foreG; }
      arm.upper.material = arm.fore.material = arm.elbow.material = arm.sBall.material = sleeveM;
      if (arm.sleeve) arm.sleeve.visible = false; if (arm.ring) arm.ring.visible = false;
      // the cuff: a band at the end of the forearm, its own size whatever the arm's stretch (as the kit's long-sleeve cuff)
      rig.onSegment(new THREE.Mesh(rig.wristGeo, cuffMat), arm.fore, (m, r, len) => { const k = kind === 'school' ? 0.9 : 0.97; m.scale.set(k, (kind === 'school' ? 0.75 : 1.25) * r / len, k); m.position.set(0, 0.5 - 0.06 * r / len, 0); });
    });
  } else {
    const bandM = std(0xffffff, { map: ribTexture(ink(c1, c2), null, 14), roughness: 0.85 });
    rig.arms.forEach((arm) => {
      arm.sleeveR *= 1.14; arm.sleeveFrac = 0.7; arm.sleeveMax = 0.95;
      if (arm.sleeve) { arm.sleeve.material = sleeveM; arm.sleeve.visible = true; if (mus) arm.sleeve.geometry = new THREE.CylinderGeometry(1, 0.96, 1, 20); }
      arm.sBall.material = sleeveM; if (arm.ring) { arm.ring.material = bandM; arm.ring.visible = true; }
      arm.upper.material = arm.fore.material = arm.elbow.material = rig.skin;
    });
  }
}
// ---------- bottoms ----------
const swapMap = (m, t) => { const o = m.map; m.map = t; m.needsUpdate = true; if (o && o !== t) o.dispose(); };
const radial = (v, phi, amt) => { v.x += Math.sin(phi) * amt; v.z += Math.cos(phi) * amt; };
// the seat (hips and waistband, the kit's skinned piece) in the bottoms' cloth: L = the kit's seat layout
function seatTex(col, L, denim) {
  const W = 512, H = 128, cv = artCanvas(W, H), g = cv.getContext('2d'), Y = (t) => (1 - t) * H, yb0 = Y(L.t[L.band[0]]), yb1 = Y(L.t[L.band[1]]);
  g.fillStyle = col; g.fillRect(0, 0, W, H);
  if (denim) twill(g, W, H, col);
  g.fillStyle = 'rgba(0,0,0,.2)'; [0, W / 2, W].forEach((x) => g.fillRect(x - 1.5, yb0, 3, H - yb0));
  g.fillStyle = mixHex(col, '#000000', 0.12); g.fillRect(0, yb1, W, yb0 - yb1);
  g.fillStyle = mixHex(col, '#000000', 0.45); g.fillRect(0, 0, W, Math.max(0, yb1 - 1));
  return artTexture(cv);
}
function twill(g, W, H, col) {
  g.strokeStyle = lumOf(col) > 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.07)'; g.lineWidth = 1.5;
  for (let x = -H; x < W; x += 5) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H, 0); g.stroke(); }
}
// one leg of shorts / trousers: u = 0 the inner seam, 0.5 the outside; v = 0 the hem. o: { hemV, cuffV, stripe, denim, front }
function legTex(col, o) {
  const W = 512, H = 256, cv = artCanvas(W, H), g = cv.getContext('2d'), Y = (v) => (1 - v) * H;
  g.fillStyle = col; g.fillRect(0, 0, W, H);
  if (o.denim) {
    twill(g, W, H, col);
    // a soft lighter fade down the front of the thigh and at the knee
    if (o.front != null) { const x = o.front * W, gr = g.createLinearGradient(x - 90, 0, x + 90, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.13)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - 90, 0, 180, H); }
  }
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H); g.fillRect(W / 2 - 1.5, 0, 3, H);
  if (o.denim) { g.strokeStyle = '#d9a441'; g.lineWidth = 2; g.setLineDash([6, 5]); [W / 2 - 7, W / 2 + 7].forEach((x) => { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }); g.setLineDash([]); }
  if (o.stripe) { g.fillStyle = o.stripe; g.fillRect(W / 2 - 9, 0, 6, H); g.fillRect(W / 2 + 3, 0, 6, H); }
  if (o.cuffV) { const y = Y(o.cuffV); g.fillStyle = mixHex(col, '#000000', 0.06); g.fillRect(0, y, W, H - y); for (let x = 0; x < W; x += 8) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x, y, 3, H - y); } g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, y - 2, W, 3); }
  if (o.hemV) { const y = Y(o.hemV); g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, y, W, 3); if (o.denim) { g.strokeStyle = '#d9a441'; g.setLineDash([6, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(0, y + 8); g.lineTo(W, y + 8); g.stroke(); g.setLineDash([]); } }
  g.fillStyle = mixHex(col, '#000000', 0.35); g.fillRect(0, Y(0.02), W, H - Y(0.02));
  return artTexture(cv);
}
// how the trousers sit: rt the round top round the hip joint (x the kit shorts' size), rk at the knee, rh at the hem,
// hem: how far above the sole line the hem ends, cuff: a gathered ankle band (joggers)
const TROUSERS = {
  cargos: { rt: 1.12, rk: 0.215, rh: 0.205, hem: 0.12, gather: 0.92 },
  jeans: { rt: 1.1, rk: 0.205, rh: 0.27, hem: 0.035 },
  joggers: { rt: 1.08, rk: 0.19, rh: 0.15, hem: 0.11, cuff: 0.1 }
};
function dressBottom(rig, av) {
  const D = rig.D, Z = rig.sizes, lr = Z.lr, mus = Z.mus, kind = av.bottom, col = av.fit3, legs = rig.legs.map((l) => l.userData);
  rig.bow.visible = false;
  swapMap(rig.seatM, seatTex(col, rig.seatL, kind === 'jeans'));
  legs.forEach((u) => { u.sock.visible = false; });
  // the bare lower leg (shorts, skirt): the kit's sock shape without the shin pad, in skin
  const shinPts = rig.smoothProfile([0.165, 0.168, 0.172 + 0.02 * mus, 0.15 + 0.008 * mus, 0.12, 0.124].map((r) => r * lr), [0, 0.06, 0.28, 0.58, 0.88, 1], -0.02, -D.shin + 0.04, 16);
  const calf = (v, phi, j, t) => radial(v, phi, (0.022 + 0.012 * mus) * lr * gauss(t - 0.7, 0.18) * Math.max(0, -Math.cos(phi)));
  const shinR = (y) => { for (let j = 1; j < shinPts.length; j++) if (shinPts[j][1] >= y) { const a = shinPts[j - 1], b = shinPts[j], t = (y - a[1]) / ((b[1] - a[1]) || 1e-6); return a[0] + (b[0] - a[0]) * t; } return shinPts[shinPts.length - 1][0]; };
  const out = { parts: [] };
  if (kind === 'shorts' || kind === 'skirt') {
    const shinG = rig.lathe(shinPts, 18, 0, calf);
    legs.forEach((u) => { out.parts.push(rig.add(shinG, rig.skin, u.knee)); });
    const under = kind === 'skirt' ? mixHex(col, '#000000', 0.22) : col;
    rig.shortLegs.forEach((q) => swapMap(q.mat, legTex(under, { hemV: q.L.t[q.L.hem] + 0.06 })));
    legs.forEach((u) => { if (kind === 'shorts') u.shorts.scale.set(1.08, 1.32, 1.08); else u.shorts.scale.set(1, 0.8, 1); });
    if (kind === 'skirt') out.parts.push(skirt(rig, col));
  } else {
    const S = TROUSERS[kind], Rt = Z.Rb * S.rt, rk = S.rk * lr, rh = S.rh * lr, th = D.thigh;
    const thighPts = [[rk, -th], [(Rt + rk) / 2 * 1.02, -0.55 * th], [Rt * 0.98, -0.2 * th], [Rt, -0.02]];
    for (let k = 1; k <= 7; k++) { const a = k / 8 * Math.PI / 2; thighPts.push([Rt * Math.cos(a), Rt * Math.sin(a)]); }
    thighPts.push([0.001, Rt]);
    const yh = -D.shin + S.hem, shinT = [];
    if (S.cuff) { const rc = rh * 0.86; shinT.push([rc * 0.9, yh + 0.04], [rc, yh], [rc * 1.02, yh + S.cuff * 0.9], [rh * 1.08, yh + S.cuff * 1.05]); }
    else shinT.push([rh * 0.9, yh + 0.05], [rh * 0.97, yh + 0.004], [rh * (S.gather || 1), yh + 0.03], [rh, yh + 0.12]);
    shinT.push([(rh + rk) / 2, yh * 0.45], [rk, -0.03], [rk * 0.97, 0.0], [0.001, 0.005]);
    const cuffV = S.cuff ? (S.cuff * 0.95) / (D.shin - S.hem + 0.03) : 0;
    rig.legs.forEach((leg, i) => {
      const u = legs[i], sd = i ? 1 : -1, front = sd > 0 ? 0.25 : 0.75;
      u.shorts.visible = false; u.thigh.visible = false;
      const m1 = std(0xffffff, { map: legTex(col, { denim: kind === 'jeans', front, stripe: kind === 'joggers' ? ink(col, mixHex(col, '#ffffff', 0.55)) : null }), roughness: 0.9 });
      const m2 = std(0xffffff, { map: legTex(col, { denim: kind === 'jeans', front, cuffV, hemV: S.cuff ? 0 : 0.06, stripe: kind === 'joggers' ? ink(col, mixHex(col, '#ffffff', 0.55)) : null }), roughness: 0.9 });
      out.parts.push(rig.add(rig.lathe(thighPts, 24, -sd * Math.PI / 2), m1, leg), rig.add(rig.lathe(shinT, 24, -sd * Math.PI / 2), m2, u.knee));
      out.parts.push(rig.add(new THREE.SphereGeometry(rk * 1.01, 18, 12), m1, u.knee));
      if (kind === 'cargos') {
        // side pockets with a flap on the outside of each thigh
        const pm = std(new THREE.Color(mixHex(col, '#000000', 0.08)).getHex(), { roughness: 0.9 }), y = -0.56 * th, x = sd * ((Rt + rk) / 2 * 1.02 + 0.018 * lr);
        rig.add(roundedBox(0.06 * lr, 0.28 * lr, 0.22 * lr, 0.02 * lr, 2), pm, leg, x, y, 0);
        rig.add(roundedBox(0.075 * lr, 0.08 * lr, 0.24 * lr, 0.02 * lr, 2), pm, leg, x + sd * 0.008 * lr, y + 0.12 * lr, 0);
      }
    });
  }
  out.shinR = shinR;
  return out;
}
// The pleated skirt, to just above the knee: knife pleats all round (deeper toward the hem), a waistband, a solid inside
// (double sided) and shorts in the skirt's colour under it (the kit's shorts, plain and darker), so nothing ever shows
// under it. One skinned mesh on four bones: the waistband follows the leaning upper body (like the kit's seat), the hips
// the pelvis, and below the hips each side follows the thigh under it (blended across the middle), so a crouch, a kneel,
// a stride, a slide or a jump carries the skirt with the legs instead of letting a knee poke through.
function skirt(rig, col) {
  const D = rig.D, Z = rig.sizes, lr = Z.lr, sc = Z.sc, zs = Z.zs, yTop = Z.yTop, yH = Z.yH, hipX = Z.hipX, hipR = Z.hipR, wR = Z.wR;
  const yB = yTop - Z.bandH, yHip = yH + 0.14 * sc, yHem = yH - D.thigh + 0.17 * lr, NU = 72, NP = 18, NV = 14;
  const rxW = wR + 0.014, rzW = (wR + 0.014) * zs, rxH = hipR + 0.05, rzH = 0.74 * hipR * zs + 0.075;
  const rxE = Math.max(rxH + 0.1, hipX + 0.2 * lr + 0.2), rzE = Math.max(rzH + 0.06, 0.2 * lr + 0.24);
  const rows = [[yTop + 0.004, rxW - 0.02, rzW - 0.02, 0, 0.6], [yTop, rxW, rzW, 0, 0.85], [yB, rxW + 0.004, rzW + 0.004, 0, 0.85]];
  for (let k = 1; k <= NV; k++) {
    const y = yB + (yHem - yB) * k / NV;
    let rx, rz;
    if (y >= yHip) { const f = sstep01((yB - y) / (yB - yHip)); rx = rxW + (rxH - rxW) * f; rz = rzW + (rzH - rzW) * f; }
    else { const f = Math.pow((yHip - y) / (yHip - yHem), 0.9); rx = rxH + (rxE - rxH) * f; rz = rzH + (rzE - rzH) * f; }
    rows.push([y, rx, rz, 0.012 * sc + 0.032 * sc * clamp((yB - y) / (yB - yHem), 0, 1), k === NV ? 0.92 : 1]);
  }
  const last = rows[rows.length - 1]; rows.push([yHem + 0.04, last[1] - 0.025, last[2] - 0.025, last[3], 0.6]);
  const NR = rows.length, cnt = (NU + 1) * NR, pos = new Float32Array(cnt * 3), colA = new Float32Array(cnt * 3), si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4), idx = [];
  const bw = 0.1 * D.torsoX, yW0 = yH + 0.1 * sc;
  for (let j = 0; j < NR; j++) for (let i = 0; i <= NU; i++) {
    const k = j * (NU + 1) + i, q = rows[j], phi = i / NU * TAU, p = (phi * NP / TAU) % 1, tri = p < 0.78 ? p / 0.78 : (1 - p) / 0.22;
    const s = Math.sin(phi), c = Math.cos(phi), rb = q[1] * q[2] / Math.sqrt(Math.pow(q[2] * s, 2) + Math.pow(q[1] * c, 2));
    const bulge = 0.035 * sc * gauss((q[0] - (yH + 0.06 * sc)) / (0.22 * sc), 1) * Math.pow(Math.max(0, -c), 2), r = rb + bulge + q[3] * (tri - 0.5);
    const x = s * r, y = q[0], z = c * r; pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    colA[k * 3] = colA[k * 3 + 1] = colA[k * 3 + 2] = q[4] * (q[3] ? 0.8 + 0.22 * tri : 1);
    const wb = sstep01((y - yW0) / (yB - yW0)), wl = (1 - wb) * sstep01((yHip - y) / (0.3 * (yHip - yHem))), f = sstep01((x + bw) / (2 * bw));
    si[k * 4] = 0; si[k * 4 + 1] = 1; si[k * 4 + 2] = 2; si[k * 4 + 3] = 3;
    sw[k * 4] = 1 - wb - wl; sw[k * 4 + 1] = wb; sw[k * 4 + 2] = wl * (1 - f); sw[k * 4 + 3] = wl * f;
  }
  for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, cc = a + NU + 1, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = std(new THREE.Color(col).getHex(), { roughness: 0.85, vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.frustumCulled = false; rig.root.add(mesh);
  const b0 = new THREE.Bone(), b1 = new THREE.Bone(); rig.legs[0].add(b0); rig.legs[1].add(b1);
  rig.root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([rig.hipBone, rig.waistBone, b0, b1]));
  return mesh;
}
// ---------- socks and shoes ----------
// socks: knee socks with a skirt and school shoes, crew socks otherwise (just above the shoe; under trousers too, so a
// gap under a wide hem shows sock, not air)
function dressSocks(rig, av, bottom) {
  const D = rig.D, lr = rig.sizes.lr, knee = av.bottom === 'skirt' && av.shoes === 'loafers';
  const col = av.bottom === 'skirt' && lumOf(av.fit3) > 0.85 ? '#1f3a68' : '#f1f3f5';
  const y0 = -D.shin + 0.035, y1 = knee ? -(0.12 * lr + 0.03) : -D.shin + (av.shoes === 'hightops' ? 0.36 : 0.3) * D.shin, r = (y) => bottom.shinR(y) * 1.05 + 0.006;
  const pts = [[r(y0) * 0.8, y0 - 0.01]]; for (let k = 0; k <= 8; k++) { const y = y0 + (y1 - 0.03 - y0) * k / 8; pts.push([r(y), y]); }
  pts.push([r(y1) + 0.01, y1 - 0.03], [r(y1) + 0.012, y1], [r(y1) * 0.9, y1 + 0.006]);
  const cv = artCanvas(64, 128), g = cv.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 64, 128);
  for (let x = 0; x < 64; x += 6) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(x, 0, 2, 128); }
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 0, 64, 128 * 0.1); g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, 128 * 0.1, 64, 2);
  const m = std(0xffffff, { map: artTexture(cv), roughness: 0.9 });
  const geo = rig.lathe(pts, 18, 0, (v, phi, j, t) => radial(v, phi, (0.022 + 0.012 * rig.sizes.mus) * lr * gauss(((v.y - y0) / (-0.02 - y0)) - 0.7, 0.18) * Math.max(0, -Math.cos(phi)) * 1.05));
  return rig.legs.map((l) => rig.add(geo, m, l.userData.knee));
}
// shoes, in the boot's place (bt: at the end of the shin, the sole line 0.14 below it, toes toward +z)
function dressShoes(rig, av) {
  const lr = rig.sizes.lr, kind = av.shoes, col = av.shoeCol, L = lumOf(col), boots = rig.legs.map((l) => l.userData.boot);
  if (kind === 'boots') { rig.bootM.color.set(col); rig.soleM.color.set(L > 0.55 ? '#25262b' : '#f1f3f5'); return; }
  boots.forEach((bt) => bt.children.forEach((c) => { c.visible = false; }));
  const upM = std(new THREE.Color(col).getHex(), { roughness: kind === 'loafers' ? 0.32 : 0.6 });
  const soleCol = kind === 'loafers' ? '#2b1d14' : L > 0.8 ? '#e9ecef' : '#f8f9fa', soleM = std(new THREE.Color(soleCol).getHex(), { roughness: 0.6 });
  const trimM = std(new THREE.Color(kind === 'loafers' ? mixHex(col, '#000000', 0.3) : L > 0.8 ? '#ced4da' : '#ffffff').getHex(), { roughness: 0.55 });
  const sph = new THREE.SphereGeometry(1, 16, 10);
  boots.forEach((bt) => {
    const add = (g, m, x, y, z, sx, sy, sz) => { const o = rig.add(g, m, bt, x, y, z); if (sx) o.scale.set(sx, sy, sz); return o; };
    if (kind === 'loafers') {
      add(sph, upM, 0, -0.045, 0.01 * lr, 0.19 * lr, 0.095, 0.31 * lr);
      add(roundedBox(0.4 * lr, 0.035, 0.66 * lr, 0.015, 2), soleM, 0, -0.122, 0.0);
      add(roundedBox(0.3 * lr, 0.05, 0.16 * lr, 0.015, 2), soleM, 0, -0.115, -0.24 * lr);
      // the strap across the top of the shoe
      const st = add(new THREE.TorusGeometry(0.16 * lr, 0.018, 6, 18, Math.PI), trimM, 0, -0.03, 0.12 * lr); st.scale.set(1, 0.55, 1); st.rotation.y = Math.PI / 2; st.rotation.z = 0; st.rotation.order = 'YXZ'; st.rotation.x = -0.3;
    } else {
      // trainers / high-tops: a soft upper, a chunky sole, a toe cap, laces, a padded collar
      const hi = kind === 'hightops', soleH = hi ? 0.06 : 0.085;
      add(sph, upM, 0, -0.02, 0.0, 0.215 * lr, 0.12, 0.33 * lr);
      add(roundedBox(0.47 * lr, soleH, 0.74 * lr, 0.03, 3), soleM, 0, -0.14 + soleH / 2, 0.005 * lr);
      add(sph, soleM, 0, -0.07, 0.22 * lr, 0.19 * lr, 0.065, 0.13 * lr);
      const laceG = new THREE.BoxGeometry(0.12 * lr, 0.016, 0.024);
      [[0.04, 0.085], [0.11, 0.072], [0.18, 0.05]].forEach((q) => { const l = add(laceG, trimM, 0, q[1], q[0] * lr); l.rotation.x = q[0] * 1.8; });
      if (hi) {
        add(new THREE.CylinderGeometry(0.165 * lr, 0.19 * lr, 0.28, 18, 1, true), upM, 0, 0.12, -0.07 * lr);
        add(new THREE.TorusGeometry(0.165 * lr, 0.025, 8, 20), trimM, 0, 0.26, -0.07 * lr).rotation.x = Math.PI / 2;
        [0.15, 0.21].forEach((y) => add(laceG, trimM, 0, y, 0.1 * lr));
      } else {
        add(new THREE.TorusGeometry(0.14 * lr, 0.035, 8, 20), upM, 0, 0.085, -0.1 * lr).rotation.x = Math.PI / 2 + 0.2;
      }
      add(roundedBox(0.08 * lr, 0.09, 0.04 * lr, 0.015, 2), trimM, 0, hi ? 0.0 : 0.04, -0.33 * lr);
    }
  });
}
// ---------- putting it all on ----------
// buildHuman's spec.cloth for an outfit (known before the hair is built): the top's radius and the hood's depth behind
function clothFor(D, av) {
  const T = topDims(D, av.outfit), P = T.prof, yTop = P.pts[P.pts.length - 1].y, yBot = T.hemY;
  const H = av.outfit === 'hoodie' ? hoodSpec(T, av.hairStyle) : null, hb = H ? hoodBack(H, D.zs || 1) : null;
  return { r: (yc) => (yc > yBot && yc < yTop ? rAtY(P, yc) : 0), back: (yc) => (hb ? hb(yc) : 0) };
}
function dressFor(av, T, spec) {
  return (rig) => {
    // the kit's own shirt, collar and badges stay built (a later outfit change rebuilds the figure) but are not drawn
    rig.torso.visible = false; if (rig.band) rig.band.visible = false; rig.crestMesh.visible = false; rig.markMesh.visible = false;
    const top = buildTop(rig, T, av, spec.num, spec.name);
    let hood = null;
    const hoodFor = (style) => {
      if (T.outfit !== 'hoodie') return;
      if (hood) { top.G.remove(hood); hood.geometry.dispose(); }
      hood = rig.add(hoodGeo(T, hoodSpec(T, style), 0.25 * (rig.D.neckR || 1) + 0.03), top.pieces.hoodMat, top.G);
    };
    hoodFor(rig.look.hairStyle);
    dressArms(rig, T, av);
    const bottom = dressBottom(rig, av);
    dressSocks(rig, av, bottom);
    dressShoes(rig, av);
    return {
      // an outfit keeps the player's name and number on its back; the kit itself is not worn
      setKit(k, n, nm) { top.repaint(n, nm); },
      onHair(style) { hoodFor(style); }
    };
  };
}
