// The kid's own footballer (and, through the same rig, a grown-up: see grownup.js), built from three.js
// primitives (no downloaded assets). Origin = the hips. Like the creatures he is built facing +z; player.js turns
// him round so we see his back (name and number) from the usual camera, but the face is a full cartoon face that
// holds up from the front, the sides and 3/4 views too (the camera may orbit).
//
//   buildHuman(spec)                     -> model (see the end of this file)
//     spec: { dims: KID | TATA dims, kit, num, name, look: { skin, hair, hairStyle, eyes, ... }, front: bool }
//   buildKid(kit, num, name, look)       -> buildHuman with the kid's dims (kept for older callers)
//   kitFromSave(k)                       -> a full kit object from the saved shape (S.kit; see KIT_DEFAULT, savedKit)
//
// Faces: eyes with lids (blink, squint), brows, a conformal mouth with morph targets (open grin, big cheer, warm smile,
// "hmm", small "o", a shout) and conformal decals (cheeks, stubble). model.setFace(F) applies one expression; it is
// called by player.js only while something changes, so at rest nothing moves.
import * as THREE from 'three';
import { std, ArmRig, clamp } from './common.js';

// Kits. The first one matches his red jersey badge in the HUD.
// Full kit objects (what buildHuman draws). collar 'v' | 'round'; frontNum: the big number on the chest; crest / mark:
// our own badge and maker's mark (ids from CRESTS / MARKS below, or 'none'); accent: the colour of the numbers, the name
// and the marks; trim2: the thin stripe and inner edge of the knitted bands; sleeves 'short' | 'long'; numStyle: one of
// NUM_STYLES; boots: boot colour; gloves: goalkeeper gloves; armband / armbandCol: the captain's armband.
const GEAR = { trim2: null, sleeves: 'short', numStyle: 'thin', boots: '#1f2430', gloves: false, armband: false, armbandCol: '#ffd43b' };
export const KITS = {
  // Home kit: deep red, tone-on-tone waves, a teal V-neck band with a red stripe and edge, an icy-blue number,
  // our own crest and maker's mark (national-team style, but no real crest, maker's logo or wordmark).
  red: Object.assign({}, GEAR, { jersey: '#c9342c', dark: '#a9261f', light: '#e2584b', trim: '#2f8f7c', shorts: '#1f6b5a', sock: '#c9342c', waves: '#e2584b', ink: '#ffffff', pattern: 'waves',
    collar: 'v', frontNum: true, crest: 'cube', mark: 'cube', accent: '#cfe3e6' }),
  purple: { jersey: '#7048e8', dark: '#5730cf', trim: '#ffd43b', shorts: '#2b2f77', sock: '#7048e8' },
  teal: { jersey: '#0ca678', dark: '#087f5b', trim: '#ffffff', shorts: '#1d2b3a', sock: '#0ca678' },
  // Tata's default: sunny yellow, navy trim and shorts, navy numbers, his own crest (the roundel) and mark (the bolt)
  yellow: Object.assign({}, GEAR, { jersey: '#f5c518', dark: '#d9a90b', light: '#ffdc4d', trim: '#1f3a68', shorts: '#1f3a68', sock: '#f5c518', ink: '#ffffff', pattern: 'plain',
    collar: 'v', frontNum: true, crest: 'roundel', mark: 'bolt', accent: '#1f3a68' })
};
// The saved shape (S.kit is the home kit). Every key after celebrate is optional: old saves get these defaults.
export const KIT_DEFAULT = { shirt: '#c9342c', pattern: 'waves', trim: '#2f8f7c', shorts: '#1f6b5a', hair: '#3b2314', hairStyle: 'swept', celebrate: 'jump',
  collar: 'v', frontNum: true, crest: 'cube', mark: 'cube', sleeves: 'short', numStyle: 'thin', boots: '#1f2430', gloves: false, armband: false, armbandCol: '#ffd43b' };
// The away and third kits (S.kits.away / S.kits.third hold only what he changed). trim2 = the bands' stripe colour.
export const KIT_AWAY = { shirt: '#f1f3f5', pattern: 'waves', trim: '#2f8f7c', trim2: '#c9342c', shorts: '#1d2b3a', collar: 'v', frontNum: true, crest: 'cube', mark: 'cube', sleeves: 'short', numStyle: 'thin' };
export const KIT_THIRD = { shirt: '#16403d', pattern: 'waves', trim: '#cfe3e6', trim2: '#2f8f7c', shorts: '#25262b', collar: 'round', frontNum: true, crest: 'cube', mark: 'cube', sleeves: 'long', numStyle: 'block' };
export const KIT_SLOTS = { home: KIT_DEFAULT, away: KIT_AWAY, third: KIT_THIRD };
// his own things: the same whichever kit he wears (kept in S.kit)
export const KIT_PERSONAL = ['hair', 'hairStyle', 'celebrate', 'boots', 'gloves', 'armband', 'armbandCol'];
export const TATA_KIT = { shirt: '#f5c518', pattern: 'plain', trim: '#1f3a68', shorts: '#1f3a68', collar: 'v', frontNum: true, crest: 'roundel', mark: 'bolt',
  sleeves: 'short', numStyle: 'thin', boots: '#1f2430', gloves: false, armband: false };
// The saved shape of the kit he is wearing now: S.kitUse picks home / away / third; his own things come from S.kit.
export function savedKit(s) {
  s = s || {}; const home = Object.assign({}, KIT_DEFAULT, s.kit || {}), use = s.kitUse;
  if (use !== 'away' && use !== 'third') return home;
  const slot = Object.assign({}, KIT_SLOTS[use], (s.kits && s.kits[use]) || {});
  KIT_PERSONAL.forEach((k) => { if (home[k] != null) slot[k] = home[k]; });
  return slot;
}

// colour helpers
function mixHex(a, b, t) { const c = new THREE.Color(a).lerp(new THREE.Color(b), t); return '#' + c.getHexString(); }
function lumOf(hex) { const c = new THREE.Color(hex); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
// exact tones for the shirts whose shades were picked by hand (the rest are derived)
const TONES = { '#c9342c': { dark: '#a9261f', light: '#e2584b' }, '#f5c518': { dark: '#d9a90b', light: '#ffdc4d' } };
const ICY = '#cfe3e6';
const isOn = (v) => v === true || v === 'on';
export function kitFromSave(k) {
  k = k || {};
  const shirt = String(k.shirt || KIT_DEFAULT.shirt).toLowerCase(), pat = k.pattern || 'waves', t = TONES[shirt] || {}, L = lumOf(shirt);
  // a very light shirt gets slightly darker tone-on-tone lines (lighter ones would vanish)
  const dark = t.dark || mixHex(shirt, '#000000', L > 0.8 ? 0.1 : 0.18), light = t.light || (L > 0.8 ? mixHex(shirt, '#7f93a6', 0.28) : mixHex(shirt, '#ffffff', 0.24));
  const trim = k.trim || KIT_DEFAULT.trim;
  // the numbers and maker's marks: icy blue on a dark or strong shirt; on a light one the trim (if dark enough) or navy
  const accent = L > 0.55 ? (lumOf(trim) < 0.5 ? trim : '#1d2b3a') : ICY;
  const pick = (v, list, d) => (v === 'none' || (v && list[v])) ? v : d;
  return { jersey: shirt, dark: dark, light: light, waves: pat === 'waves' ? light : undefined, trim: trim, trim2: k.trim2 || shirt, shorts: k.shorts || KIT_DEFAULT.shorts,
    sock: k.socks || shirt, ink: L > 0.8 ? '#1d2b3a' : '#ffffff', pattern: pat,
    collar: k.collar === 'round' ? 'round' : 'v', frontNum: !(k.frontNum === false || k.frontNum === 'off'),
    crest: pick(k.crest, CRESTS, KIT_DEFAULT.crest), mark: pick(k.mark, MARKS, KIT_DEFAULT.mark), accent: accent,
    sleeves: k.sleeves === 'long' ? 'long' : 'short', numStyle: NUM_STYLES[k.numStyle] ? k.numStyle : 'thin',
    boots: k.boots || GEAR.boots, gloves: isOn(k.gloves), armband: isOn(k.armband), armbandCol: k.armbandCol || GEAR.armbandCol };
}

// Proportions (local units, origin at the hips). player.js reads these for placement and gestures.
export const KID = {
  SH_Y: 1.55, SH_X: 0.8,     // shoulders
  NECK_Y: 1.98, HEAD_UP: 0.62, HEAD_R: 0.74,
  TOP: 3.42, HIP_LOW: -1.05, // top of the hair, the hem of the shorts (local units)
  FOOT: -2.28,               // soles of the boots
  // body build (the grown-up uses other values). Legs: hip joint at hipY, thigh (hip -> knee), shin (knee -> sole
  // minus 0.14). Shorts: waistTop (top of the waistband), hemL (hem below the hip joint: mid-thigh), shortsRb (the
  // round top of each shorts leg, centred on the hip joint, so a swinging leg never tears the shorts), hipX (hip joints)
  torsoX: 1, torsoY: 1, neckLen: 0.5, hipY: -0.6, thigh: 0.75, shin: 0.8, legR: 1, hipX: 0.38,
  waistTop: 0.13, hemL: 0.45, shortsRb: 0.28, zs: 1, muscle: 0,
  L1: 0.92, L2: 0.98, armR: 1, handS: 0.6,
  // a soft oval: a little taller than wide, full round cheeks, a small chin, a round back of the head
  head: { sx: 0.95, sy: 1.06, sz: 0.98, jaw: 0.18, chin: 0, cheek: 0.075, back: 0.04 },
  face: { eyeX: 0.32, eyeY: 0.02, eyeR: 0.172, browY: 0.29, browLen: 0.21, browTh: 0.033, mouthY: -0.43, mouthW: 1, noseY: -0.14, cheekX: 0.5, cheekY: -0.3, cheekR: 0.14 }
};
// His look: light warm skin, dark-brown almond eyes that smile with the grin, thin dark brows, rosy cheeks
export const KID_LOOK = { skin: '#efc19d', hair: '#3b2314', hairStyle: 'swept', eyes: '#3f2412', brows: null, cheeks: '#f0938a', stubble: false, adult: false, streaks: null,
  eyeW: 1.14, eyeH: 0.92, tilt: 0.07, happy: 0.3, iris: 0.74, vneck: false };

// ================= the shirt =================
// The torso is a lathe. Its texture is laid out by arc length down the profile (canvas y = distance from the middle of
// the neck, over the shoulders and down to the hem), and by angle round the body (canvas x), with the lathe seam under
// his right arm so nothing on the front or the back straddles it. torsoProfile(D) gives the surface for any build, so
// the V-neck band, the badge decals and the texture all agree on where things are.
const TORSO_CTRL = [[0.001, 0], [0.62, 0.04], [0.82, 0.3], [0.86, 0.75], [0.84, 1.2], [0.8, 1.52], [0.6, 1.78], [0.4, 1.86], [0.001, 1.88]];
const SEAM = -Math.PI / 2, TAU = Math.PI * 2;
export function torsoProfile(D) {
  D = D || KID;
  const pts = new THREE.SplineCurve((D.torsoCtrl || TORSO_CTRL).map((q) => new THREE.Vector2(q[0] * D.torsoX, q[1] * D.torsoY))).getPoints(56);
  pts[0].x = 0.001; pts[pts.length - 1].x = 0.001;
  const n = pts.length, S = new Float32Array(n);           // S[j]: arc length from the top (S[n-1] = 0) down to point j
  for (let j = n - 2; j >= 0; j--) S[j] = S[j + 1] + pts[j].distanceTo(pts[j + 1]);
  const sTot = S[0];
  function at(s, o) {
    o = o || {}; s = clamp(s, 0, sTot);
    let j = 0; while (j < n - 2 && S[j + 1] > s) j++;
    const a = pts[j], b = pts[j + 1], L = (S[j] - S[j + 1]) || 1e-6, t = (S[j] - s) / L;
    o.r = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t;
    const tr = (a.x - b.x) / L, ty = (a.y - b.y) / L; o.nr = -ty; o.ny = tr;   // outward normal in the (r, y) plane
    return o;
  }
  // first crossing from the top (the front of the body: y falls steadily below the shoulders)
  function sAtY(y) {
    for (let j = n - 1; j > 0; j--) { const a = pts[j], b = pts[j - 1]; if (b.y <= y && a.y >= y && a.x > 0.45 * D.torsoX) return S[j] + (a.y - y) / ((a.y - b.y) || 1e-6) * (S[j - 1] - S[j]); }
    return sTot * 0.5;
  }
  function sAtR(r) {
    for (let j = n - 1; j > 0; j--) { const a = pts[j], b = pts[j - 1]; if (b.x >= r && a.x <= r) return S[j] + (r - a.x) / ((b.x - a.x) || 1e-6) * (S[j - 1] - S[j]); }
    return 0;
  }
  const _o = {};
  function pos(phi, s, lift, out) { at(s, _o); const r = _o.r + _o.nr * (lift || 0); return out.set(Math.sin(phi) * r, _o.y + _o.ny * (lift || 0), Math.cos(phi) * r); }
  function nrm(phi, s, out) { at(s, _o); return out.set(Math.sin(phi) * _o.nr, _o.ny, Math.cos(phi) * _o.nr).normalize(); }
  // nearest profile arc length to a point (r, y): for points just off the surface
  function nearS(r, y) {
    let best = 0, bd = 1e9;
    for (let j = 0; j < n - 1; j++) {
      const a = pts[j], b = pts[j + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-9, t = clamp(((r - a.x) * dx + (y - a.y) * dy) / l2, 0, 1);
      const ex = a.x + dx * t - r, ey = a.y + dy * t - y, d = ex * ex + ey * ey;
      if (d < bd) { bd = d; best = S[j] + (S[j + 1] - S[j]) * t; }
    }
    return best;
  }
  return { D, pts, S, n, sTot, at, sAtY, sAtR, pos, nrm, nearS };
}
// A fit build under the shirt (dims.muscle, Tata): a chest with two soft pecs and a breastbone groove, an upper back with
// the shoulder blades either side of the spine. A small lift along the surface normal; 0 for the kid. The torso mesh,
// the collar band and the badge decals all use it, so they stay on the surface.
const _bo = {};
const gauss = (x, w) => Math.exp(-(x / w) * (x / w));
function torsoBump(P, phi, s) {
  const D = P.D, m = D.muscle || 0; if (!m) return 0;
  const y = P.at(s, _bo).y / D.torsoY;
  let a = phi; while (a > Math.PI) a -= TAU; while (a <= -Math.PI) a += TAU;
  const b = Math.PI - Math.abs(a);                                    // angle from the middle of the back
  // pecs: soft on top, a clearer lower edge
  const yp = y - 1.27, pecY = yp > 0 ? gauss(yp, 0.2) : gauss(yp, 0.1);
  const pec = 0.066 * (gauss(Math.abs(a) - 0.42, 0.3)) * pecY * (Math.abs(a) < Math.PI / 2 ? 1 : 0);
  const sternum = -0.012 * gauss(a, 0.07) * gauss(y - 1.2, 0.22);
  const blades = 0.042 * gauss(b - 0.55, 0.36) * gauss(y - 1.3, 0.22), spine = -0.012 * gauss(b, 0.08) * gauss(y - 1.0, 0.5);
  return m * (pec + sternum + blades + spine) * D.torsoX;
}
// after computeVertexNormals on a lathe: the first and the last column are the same points, so share their normals
function fixSeam(geo, nu, nv) {
  const N = geo.attributes.normal, a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let j = 0; j < nv; j++) { a.fromBufferAttribute(N, j); b.fromBufferAttribute(N, nu * nv + j); a.add(b).normalize(); N.setXYZ(j, a.x, a.y, a.z); N.setXYZ(nu * nv + j, a.x, a.y, a.z); }
  N.needsUpdate = true;
}
const _PROF = new Map();
function profileOf(D) { let p = _PROF.get(D); if (!p) { p = torsoProfile(D); _PROF.set(D, p); } return p; }

// The neckline as a path round the body, in (phi, s): the round collar ring, and for a V-neck two straight sides
// down to a point at the middle of the chest. vw: 1 on the V, 0 round the back (the band stands up against the neck there).
function necklinePath(P, collar) {
  const D = P.D, tx = D.torsoX, ty = D.torsoY;
  const s0 = P.sAtR(0.4 * tx), r0 = P.at(s0).r, v = collar !== 'round';
  const sTip = P.sAtY(1.43 * ty), xc = 0.33 * tx, phiC = v ? xc / r0 : 0;
  const out = [], NR = 40, NV = 18, ramp = 0.55;
  const ringW = (phi) => v ? sstep01(1 - (Math.abs(phi) - phiC) / ramp) : 0;
  for (let k = 0; k <= NR; k++) { const phi = -Math.PI + (Math.PI - phiC) * k / NR; out.push({ phi, s: s0, vw: ringW(phi) }); }
  if (v) {
    for (let k = 1; k <= NV; k++) { const t = k / NV, s = s0 + (sTip - s0) * t, X = -xc * (1 - t); out.push({ phi: X / P.at(s).r, s, vw: 1, tip: k === NV }); }
    for (let k = 1; k <= NV; k++) { const t = k / NV, s = sTip + (s0 - sTip) * t, X = xc * t; out.push({ phi: X / P.at(s).r, s, vw: 1 }); }
  }
  for (let k = 1; k <= NR; k++) { const phi = phiC + (Math.PI - phiC) * k / NR; out.push({ phi, s: s0, vw: ringW(phi) }); }
  return { pts: out, s0, sTip, phiC, v, w: 0.088 * tx, th: 0.03 * tx, stand: 0.065 * ty, rec: 0.035 * tx };
}

// ---------- the number fonts: digits drawn as strokes (same on every machine, no web fonts) ----------
// unit box: x 0..1, y 0..2 (y down). Curvy digits (thin, rounded, outlined) ...
function digitPath(g, ch) {
  const P = Math.PI;
  switch (ch) {
    case '0': g.moveTo(0, 0.5); g.arc(0.5, 0.5, 0.5, P, 2 * P); g.lineTo(1, 1.5); g.arc(0.5, 1.5, 0.5, 0, P); g.closePath(); break;
    case '1': g.moveTo(0.18, 0.42); g.lineTo(0.62, 0); g.lineTo(0.62, 2); break;
    case '2': g.moveTo(0.02, 0.5); g.arc(0.5, 0.5, 0.48, P, 2 * P); g.bezierCurveTo(0.98, 0.98, 0.02, 1.42, 0.02, 2); g.lineTo(1, 2); break;
    case '3': g.moveTo(0.04, 0.3); g.arc(0.5, 0.47, 0.46, P * 1.12, P * 2.5); g.moveTo(0.5, 0.93); g.arc(0.5, 1.47, 0.52, -P / 2, P * 0.88); break;
    case '4': g.moveTo(0.76, 2); g.lineTo(0.76, 0); g.lineTo(0, 1.42); g.lineTo(1, 1.42); break;
    case '5': g.moveTo(0.94, 0); g.lineTo(0.12, 0); g.lineTo(0.06, 0.86); g.bezierCurveTo(0.34, 0.72, 1, 0.78, 1, 1.4); g.bezierCurveTo(1, 2.06, 0.18, 2.1, 0, 1.74); break;
    case '6': g.moveTo(0.86, 0.14); g.bezierCurveTo(0.6, -0.06, 0, 0.02, 0, 1.0); g.lineTo(0, 1.5); g.arc(0.5, 1.5, 0.5, P, 3 * P); break;
    case '7': g.moveTo(0, 0); g.lineTo(1, 0); g.lineTo(0.3, 2); break;
    case '8': g.moveTo(0.94, 0.47); g.arc(0.5, 0.47, 0.44, 0, 2 * P); g.moveTo(1, 1.46); g.arc(0.5, 1.46, 0.5, 0, 2 * P); break;
    case '9': g.moveTo(1, 0.5); g.arc(0.5, 0.5, 0.5, 0, 2 * P); g.lineTo(1, 1.0); g.bezierCurveTo(1, 1.94, 0.42, 2.06, 0.14, 1.86); break;
    default: break;
  }
}
// ... and square block digits (block, college): straight strokes, mitred corners
function blockPath(g, ch) {
  const L = (pts) => { g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); };
  switch (ch) {
    case '0': L([0, 0, 1, 0, 1, 2, 0, 2]); g.closePath(); break;
    case '1': L([0.22, 0.32, 0.6, 0, 0.6, 2]); break;
    case '2': L([0, 0, 1, 0, 1, 1, 0, 1, 0, 2, 1, 2]); break;
    case '3': L([0, 0, 1, 0, 1, 2, 0, 2]); L([0.3, 1, 1, 1]); break;
    case '4': L([0, 0, 0, 1.25, 1, 1.25]); L([0.78, 0.55, 0.78, 2]); break;
    case '5': L([1, 0, 0, 0, 0, 1, 1, 1, 1, 2, 0, 2]); break;
    case '6': L([1, 0, 0, 0, 0, 2, 1, 2, 1, 1, 0, 1]); break;
    case '7': L([0, 0, 1, 0, 1, 0.3, 0.42, 2]); break;
    case '8': L([0, 0, 1, 0, 1, 2, 0, 2]); g.closePath(); L([0, 1, 1, 1]); break;
    case '9': L([1, 1, 0, 1, 0, 0, 1, 0, 1, 2, 0, 2]); break;
    default: break;
  }
}
// Number styles. w: digit width / height; layers for the front (f) and the back (b): [colour role, line width / height].
// roles: 'a' the accent (numbers colour), 'e' the edge (trim), 's' the shirt colour (an outlined number's hollow)
export const NUM_STYLES = {
  thin: { name: 'Tall & thin', path: digitPath, w: 0.32, bw: 0.42, gap: 0.11, cap: 'round', f: [['a', 0.078]], b: [['e', 0.22], ['a', 0.145]] },
  block: { name: 'Block', path: blockPath, w: 0.4, gap: 0.14, cap: 'square', f: [['a', 0.13]], b: [['e', 0.21], ['a', 0.15]] },
  round: { name: 'Rounded', path: digitPath, w: 0.42, gap: 0.13, cap: 'round', f: [['a', 0.15]], b: [['e', 0.24], ['a', 0.17]] },
  college: { name: 'College', path: blockPath, w: 0.42, gap: 0.16, cap: 'square', f: [['e', 0.2], ['a', 0.12]], b: [['a', 0.28], ['e', 0.2], ['a', 0.12]] },
  outline: { name: 'Outline', path: digitPath, w: 0.38, gap: 0.13, cap: 'round', f: [['a', 0.14], ['s', 0.075]], b: [['e', 0.24], ['a', 0.17], ['s', 0.09]] }
};
// Strokes a number centred at the current origin, h tall. The current transform maps units to pixels.
// layers: [{ col, lw, dx, dy }] drawn in order (shadow, outline, fill).
function drawNumber(g, str, h, dw, gap, layers, style) {
  const st = NUM_STYLES[style] || NUM_STYLES.thin, path = st.path;
  const n = String(str).replace(/[^0-9]/g, '').slice(0, 2) || '7', tot = n.length * dw + (n.length - 1) * gap;
  g.lineCap = st.cap; g.lineJoin = st.cap === 'square' ? 'miter' : 'round'; g.miterLimit = 4;
  layers.forEach((L) => {
    g.beginPath();
    for (let i = 0; i < n.length; i++) {
      g.save(); g.translate(-tot / 2 + i * (dw + gap) + (L.dx || 0), -h / 2 + (L.dy || 0)); g.scale(dw, h / 2);
      path(g, n[i]); g.restore();
    }
    g.strokeStyle = L.col; g.lineWidth = L.lw; g.stroke();
  });
}
// a number in a style: where = 'f' (front, shorts) or 'b' (back); cols = { a, e, s }; shadow: a soft drop shadow colour
function styledNumber(g, str, h, style, where, cols, shadow) {
  const st = NUM_STYLES[style] || NUM_STYLES.thin, ls = st[where] || st.f, dw = (where === 'b' && st.bw ? st.bw : st.w) * h, gap = st.gap * h;
  const layers = ls.map((q) => ({ col: cols[q[0]], lw: q[1] * h }));
  if (shadow) layers.unshift({ col: shadow, lw: ls[0][1] * h * 1.12, dx: 0.012 * h, dy: 0.02 * h });
  drawNumber(g, str, h, dw, gap, layers, style);
}
// ---------- our own marks and crests (original designs; never a real maker's logo or a real crest) ----------
function star(g, x, y, r, pts, inner) {
  g.moveTo(x, y - r);
  for (let i = 1; i < pts * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / pts, rr = i % 2 ? r * (inner || 0.45) : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}
// maker's marks: one colour, unit box 0..1
export const MARKS = {
  // a cube with motion lines: the game's own cube, zooming along
  cube: { name: 'Speed cube', draw(g, c) {
    const cx = 0.6, cy = 0.53, r = 0.3, k = Math.cos(Math.PI / 6) * r, T = [cx, cy - r], UR = [cx + k, cy - r / 2], LR = [cx + k, cy + r / 2], B = [cx, cy + r], LL = [cx - k, cy + r / 2], UL = [cx - k, cy - r / 2];
    g.fillStyle = c; g.strokeStyle = c; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(T[0], T[1]); g.lineTo(UR[0], UR[1]); g.lineTo(cx, cy); g.lineTo(UL[0], UL[1]); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(UL[0], UL[1]); g.lineTo(LL[0], LL[1]); g.lineTo(B[0], B[1]); g.lineTo(LR[0], LR[1]); g.lineTo(UR[0], UR[1]); g.moveTo(cx, cy); g.lineTo(B[0], B[1]);
    g.lineWidth = 0.06; g.stroke();
    // the right face half-filled so it reads as a solid cube at a distance
    g.globalAlpha = 0.55; g.beginPath(); g.moveTo(cx, cy); g.lineTo(UR[0], UR[1]); g.lineTo(LR[0], LR[1]); g.lineTo(B[0], B[1]); g.closePath(); g.fill(); g.globalAlpha = 1;
    g.lineWidth = 0.055; g.beginPath(); [[0.07, 0.36, 0.22], [0.02, 0.53, 0.22], [0.1, 0.7, 0.22]].forEach((q) => { g.moveTo(q[0], q[1]); g.lineTo(q[2], q[1]); }); g.stroke();
  } },
  // a swift: swept wings and a forked tail, climbing
  swift: { name: 'Swift', draw(g, c) {
    g.fillStyle = c; g.beginPath();
    g.moveTo(0.04, 0.5); g.quadraticCurveTo(0.32, 0.36, 0.5, 0.47); g.quadraticCurveTo(0.66, 0.26, 0.97, 0.16);
    g.quadraticCurveTo(0.74, 0.42, 0.6, 0.58); g.lineTo(0.7, 0.86); g.lineTo(0.56, 0.68); g.lineTo(0.42, 0.88); g.lineTo(0.46, 0.62);
    g.quadraticCurveTo(0.3, 0.52, 0.04, 0.5); g.closePath(); g.fill();
    g.beginPath(); g.arc(0.53, 0.47, 0.075, 0, 7); g.fill();
  } },
  // a fox's face: big pointed ears, eyes cut out
  fox: { name: 'Fox', draw(g, c) {
    g.fillStyle = c; g.beginPath();
    g.moveTo(0.14, 0.1); g.lineTo(0.38, 0.34); g.lineTo(0.62, 0.34); g.lineTo(0.86, 0.1); g.lineTo(0.86, 0.5); g.lineTo(0.5, 0.92); g.lineTo(0.14, 0.5); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath();
    g.moveTo(0.27, 0.5); g.lineTo(0.42, 0.55); g.lineTo(0.31, 0.62); g.closePath(); g.moveTo(0.73, 0.5); g.lineTo(0.58, 0.55); g.lineTo(0.69, 0.62); g.closePath();
    g.moveTo(0.22, 0.2); g.lineTo(0.33, 0.33); g.lineTo(0.24, 0.38); g.closePath(); g.moveTo(0.78, 0.2); g.lineTo(0.67, 0.33); g.lineTo(0.76, 0.38); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
  } },
  // a little rocket with fins and a flame, tilted up and away
  rocket: { name: 'Rocket', draw(g, c) {
    g.save(); g.translate(0.5, 0.5); g.rotate(0.6); g.translate(-0.5, -0.5); g.fillStyle = c;
    g.beginPath(); g.moveTo(0.5, 0.02); g.bezierCurveTo(0.7, 0.18, 0.69, 0.48, 0.63, 0.68); g.lineTo(0.37, 0.68); g.bezierCurveTo(0.31, 0.48, 0.3, 0.18, 0.5, 0.02); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0.36, 0.5); g.lineTo(0.2, 0.74); g.lineTo(0.38, 0.68); g.closePath(); g.moveTo(0.64, 0.5); g.lineTo(0.8, 0.74); g.lineTo(0.62, 0.68); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0.4, 0.74); g.quadraticCurveTo(0.5, 1.02, 0.6, 0.74); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0.5, 0.33, 0.075, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    g.restore();
  } },
  // a lightning bolt
  bolt: { name: 'Bolt', draw(g, c) {
    g.fillStyle = c; g.beginPath();
    g.moveTo(0.6, 0.03); g.lineTo(0.2, 0.56); g.lineTo(0.46, 0.56); g.lineTo(0.36, 0.97); g.lineTo(0.82, 0.4); g.lineTo(0.55, 0.4); g.lineTo(0.72, 0.03); g.closePath(); g.fill();
  } },
  // Pip, the game's mascot: a round-cornered cube head with an antenna, eyes and a smile
  pip: { name: 'Pip', draw(g, c) {
    g.fillStyle = c; g.strokeStyle = c; g.beginPath(); g.roundRect(0.16, 0.2, 0.68, 0.66, 0.2); g.fill();
    g.lineWidth = 0.05; g.lineCap = 'round'; g.beginPath(); g.moveTo(0.5, 0.2); g.lineTo(0.5, 0.08); g.stroke(); g.beginPath(); g.arc(0.5, 0.07, 0.055, 0, 7); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0.37, 0.47, 0.075, 0, 7); g.arc(0.63, 0.47, 0.075, 0, 7); g.fill();
    g.lineWidth = 0.06; g.beginPath(); g.arc(0.5, 0.57, 0.15, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); g.globalCompositeOperation = 'source-over';
  } }
};
// crests: full colour badges, unit box 0..1 wide, 0..CREST_H tall
const CREST_H = 1.14;
function shield(g, i) {
  // a heater shield, inset by i
  g.beginPath(); g.moveTo(0.08 + i, 0.06 + i); g.lineTo(0.92 - i, 0.06 + i); g.lineTo(0.92 - i, 0.52);
  g.quadraticCurveTo(0.92 - i, 0.88 - i * 0.4, 0.5, 1.09 - i * 1.3); g.quadraticCurveTo(0.08 + i, 0.88 - i * 0.4, 0.08 + i, 0.52); g.closePath();
}
function isoCube(g, cx, cy, r, top, left, right, edge) {
  const k = Math.cos(Math.PI / 6) * r;
  const face = (pts, col) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = col; g.fill(); if (edge) { g.strokeStyle = edge; g.lineWidth = r * 0.09; g.lineJoin = 'round'; g.stroke(); } };
  face([[cx, cy - r], [cx + k, cy - r / 2], [cx, cy], [cx - k, cy - r / 2]], top);
  face([[cx - k, cy - r / 2], [cx, cy], [cx, cy + r], [cx - k, cy + r / 2]], left);
  face([[cx + k, cy - r / 2], [cx + k, cy + r / 2], [cx, cy + r], [cx, cy]], right);
  return k;
}
export const CRESTS = {
  // his default: a gold-edged shield, a red chief with three stars, and the game's cube showing "=" on a white field
  cube: { name: 'Cube shield', draw(g) {
    shield(g, 0); g.fillStyle = '#e9b824'; g.fill();
    shield(g, 0.035); g.fillStyle = '#1d2f5c'; g.fill();
    shield(g, 0.06); g.fillStyle = '#ffffff'; g.fill();
    g.save(); shield(g, 0.06); g.clip();
    g.fillStyle = '#d43a2f'; g.fillRect(0, 0, 1, 0.36); g.fillStyle = '#1d2f5c'; g.fillRect(0, 0.36, 1, 0.025);
    g.fillStyle = '#ffffff'; g.beginPath(); star(g, 0.3, 0.22, 0.075, 5); star(g, 0.5, 0.2, 0.09, 5); star(g, 0.7, 0.22, 0.075, 5); g.fill();
    isoCube(g, 0.5, 0.69, 0.22, '#5cc8ae', '#2f8f7c', '#1f6b5a', '#16304f');
    // "=" printed on the cube's left face (the unit square mapped onto that face)
    const k = Math.cos(Math.PI / 6) * 0.22, r = 0.22, cx = 0.5, cy = 0.69;
    g.save(); g.transform(k, r / 2, 0, r, cx - k, cy - r / 2); g.fillStyle = '#ffffff';
    g.fillRect(0.2, 0.28, 0.6, 0.14); g.fillRect(0.2, 0.56, 0.6, 0.14); g.restore();
    g.restore();
  } },
  // Tata's default: a navy roundel ringed with gold stars, a sunny centre and a white cube with a navy "x"
  roundel: { name: 'Star roundel', draw(g) {
    const cx = 0.5, cy = CREST_H / 2;
    g.beginPath(); g.arc(cx, cy, 0.49, 0, 7); g.fillStyle = '#e9b824'; g.fill();
    g.beginPath(); g.arc(cx, cy, 0.455, 0, 7); g.fillStyle = '#1f3a68'; g.fill();
    g.fillStyle = '#ffd43b'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10; star(g, cx + Math.cos(a) * 0.365, cy + Math.sin(a) * 0.365, 0.042, 5); } g.fill();
    g.beginPath(); g.arc(cx, cy, 0.285, 0, 7); g.fillStyle = '#ffffff'; g.fill();
    g.beginPath(); g.arc(cx, cy, 0.255, 0, 7); g.fillStyle = '#f5c518'; g.fill();
    g.save(); g.translate(cx, cy); g.rotate(-0.12);
    g.beginPath(); g.roundRect(-0.14, -0.14, 0.28, 0.28, 0.06); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 0.022; g.strokeStyle = '#1f3a68'; g.stroke();
    g.lineWidth = 0.05; g.lineCap = 'round'; g.beginPath(); g.moveTo(-0.07, -0.07); g.lineTo(0.07, 0.07); g.moveTo(0.07, -0.07); g.lineTo(-0.07, 0.07); g.stroke();
    g.restore();
  } },
  // sky-blue and white stripes on a navy-edged shield, a big gold star
  star: { name: 'Star stripes', draw(g) {
    shield(g, 0); g.fillStyle = '#1f3a68'; g.fill();
    g.save(); shield(g, 0.045); g.clip(); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1, 2);
    g.fillStyle = '#4dabf7'; for (let x = 0.08; x < 1; x += 0.2) g.fillRect(x, 0, 0.1, 2);
    g.restore();
    g.beginPath(); star(g, 0.5, 0.56, 0.27, 5, 0.46); g.fillStyle = '#ffd43b'; g.fill(); g.lineWidth = 0.035; g.lineJoin = 'round'; g.strokeStyle = '#1f3a68'; g.stroke();
  } },
  // a green shield with a white chevron, a gold "+" cube and a red ribbon
  ribbon: { name: 'Plus ribbon', draw(g) {
    shield(g, 0); g.fillStyle = '#ffffff'; g.fill();
    shield(g, 0.04); g.fillStyle = '#2f9e44'; g.fill();
    g.save(); shield(g, 0.04); g.clip();
    g.beginPath(); g.moveTo(0, 0.98); g.lineTo(0.5, 0.56); g.lineTo(1, 0.98); g.lineTo(1, 1.12); g.lineTo(0.5, 0.7); g.lineTo(0, 1.12); g.closePath(); g.fillStyle = '#ffffff'; g.fill();
    g.restore();
    g.beginPath(); g.roundRect(0.36, 0.18, 0.28, 0.28, 0.05); g.fillStyle = '#ffd43b'; g.fill(); g.lineWidth = 0.025; g.strokeStyle = '#1d2f5c'; g.stroke();
    g.fillStyle = '#1d2f5c'; g.fillRect(0.475, 0.23, 0.05, 0.18); g.fillRect(0.41, 0.295, 0.18, 0.05);
    // the ribbon across the bottom: folded ends behind, three white dots
    g.fillStyle = '#9c2a22'; g.beginPath(); g.moveTo(0.0, 0.78); g.lineTo(0.14, 0.76); g.lineTo(0.14, 0.9); g.lineTo(0.0, 0.92); g.lineTo(0.05, 0.85); g.closePath();
    g.moveTo(1.0, 0.78); g.lineTo(0.86, 0.76); g.lineTo(0.86, 0.9); g.lineTo(1.0, 0.92); g.lineTo(0.95, 0.85); g.closePath(); g.fill();
    g.fillStyle = '#d43a2f'; g.beginPath(); g.moveTo(0.1, 0.72); g.quadraticCurveTo(0.5, 0.8, 0.9, 0.72); g.lineTo(0.9, 0.86); g.quadraticCurveTo(0.5, 0.94, 0.1, 0.86); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); [0.36, 0.5, 0.64].forEach((x) => { g.moveTo(x + 0.025, 0.83); g.arc(x, 0.83, 0.025, 0, 7); }); g.fill();
  } },
  // an orange sun badge with a white die (five pips)
  dice: { name: 'Dice sun', draw(g) {
    const cx = 0.5, cy = CREST_H / 2;
    g.beginPath(); g.arc(cx, cy, 0.49, 0, 7); g.fillStyle = '#1d2f5c'; g.fill();
    g.beginPath(); g.arc(cx, cy, 0.45, 0, 7); g.fillStyle = '#f76707'; g.fill();
    g.fillStyle = '#ffa94d'; g.beginPath(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12, b = a + 0.13; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 0.45, cy + Math.sin(a) * 0.45); g.lineTo(cx + Math.cos(b) * 0.45, cy + Math.sin(b) * 0.45); g.closePath(); } g.fill();
    g.save(); g.translate(cx, cy); g.rotate(0.2);
    g.beginPath(); g.roundRect(-0.2, -0.2, 0.4, 0.4, 0.08); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 0.03; g.strokeStyle = '#1d2f5c'; g.stroke();
    g.fillStyle = '#1d2f5c'; g.beginPath(); [[-0.1, -0.1], [0.1, -0.1], [0, 0], [-0.1, 0.1], [0.1, 0.1]].forEach((q) => { g.moveTo(q[0] + 0.04, q[1]); g.arc(q[0], q[1], 0.04, 0, 7); }); g.fill();
    g.restore();
  } },
  // a purple diamond with a gold edge, a white "=" and two little stars
  diamond: { name: 'Equals diamond', draw(g) {
    const cx = 0.5, cy = CREST_H / 2, d = (i) => { g.beginPath(); g.moveTo(cx, 0.02 + i); g.lineTo(0.98 - i, cy); g.lineTo(cx, CREST_H - 0.02 - i); g.lineTo(0.02 + i, cy); g.closePath(); };
    d(0); g.fillStyle = '#e9b824'; g.fill(); d(0.05); g.fillStyle = '#5f3dc4'; g.fill(); d(0.09); g.fillStyle = '#7048e8'; g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(0.33, cy - 0.1, 0.34, 0.07, 0.03); g.roundRect(0.33, cy + 0.03, 0.34, 0.07, 0.03); g.fill();
    g.fillStyle = '#ffd43b'; g.beginPath(); star(g, 0.5, cy - 0.27, 0.06, 5); star(g, 0.5, cy + 0.27, 0.06, 5); g.fill();
  } }
};
function artCanvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
function crestCanvas(id, px) {
  const c = CRESTS[id]; if (!c) return null;
  const cv = artCanvas(px, Math.round(px * CREST_H)), g = cv.getContext('2d'); g.scale(px, px); c.draw(g); return cv;
}
function markCanvas(id, col, px) {
  const m = MARKS[id]; if (!m) return null;
  const cv = artCanvas(px, px), g = cv.getContext('2d'); g.scale(px, px); m.draw(g, col); return cv;
}
function artTexture(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
// for the kit designer (a classic script): thumbnails of the crests and marks
if (typeof window !== 'undefined') {
  window.KitArt = {
    crests: Object.keys(CRESTS).map((k) => [k, CRESTS[k].name]), marks: Object.keys(MARKS).map((k) => [k, MARKS[k].name]),
    crestURL: (id, px) => { const cv = crestCanvas(id, px || 64); return cv ? cv.toDataURL() : ''; },
    markURL: (id, col, px) => { const cv = markCanvas(id, col || ICY, px || 64); return cv ? cv.toDataURL() : ''; },
    crestH: CREST_H
  };
}

// ---------- the shirt texture ----------
// kit: a full kit object (kitFromSave); kit.skin: the colour inside a V-neck. front: legacy flag (a number on the chest
// for someone seen from the front) - the kit's frontNum now decides, this only matters for kits without it.
export function kidJerseyTexture(kit, num, name, front, D) {
  const P = profileOf(D || KID), DD = P.D, tx = DD.torsoX, ty = DD.torsoY;
  const W = 2048, H = 1024, cv = artCanvas(W, H), g = cv.getContext('2d');
  const X = (phi) => { let u = (phi - SEAM) / TAU; u -= Math.floor(u); return u * W; };
  const Y = (s) => s / P.sTot * H, pyU = H / P.sTot;
  const pxU = (s) => W / (TAU * Math.max(0.05, P.at(s).r));        // pixels per unit round the body at s
  const place = (phi, s) => g.setTransform(pxU(s), 0, 0, pyU, X(phi), Y(s));
  // Draws something (in body units, centred on the origin) onto the body at (phi, sC) without stretching it: it is
  // drawn flat first, then copied row by row with each row's own width scale. On a tapering torso (Tata's V shape) a
  // number placed with one scale would come out wider where the body is wider.
  const warp = (phi, sC, wU, hU, draw) => {
    const pxR = pxU(sC), wP = Math.ceil(wU * pxR) + 8, hP = Math.ceil(hU * pyU) + 8, off = artCanvas(wP, hP), o = off.getContext('2d');
    o.setTransform(pxR, 0, 0, pyU, wP / 2, hP / 2); draw(o, pxR);
    const x0 = X(phi), y0 = Y(sC) - hP / 2;
    for (let y = 0; y < hP; y++) { const w = wP * pxU(sC + (y + 0.5 - hP / 2) / pyU) / pxR; g.drawImage(off, 0, y, wP, 1, x0 - w / 2, y0 + y, w, 1); }
  };
  const pat = kit.pattern || (kit.waves ? 'waves' : null), light = kit.light || kit.waves || mixHex(kit.jersey, '#ffffff', 0.24);
  const accent = kit.accent || (lumOf(kit.jersey) > 0.55 ? '#1d2b3a' : ICY);
  g.fillStyle = kit.jersey; g.fillRect(0, 0, W, H);
  const sArm = P.sAtY(1.36 * ty), FRONT = X(0);
  // two soft side panels in the darker shade, under the arms
  [Math.PI / 2, -Math.PI / 2].forEach((phi) => {
    const x = X(phi) === 0 ? W : X(phi), hw = 0.13 * tx * pxU(sArm + 0.4);
    const grd = g.createLinearGradient(x - hw, 0, x + hw, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.18, kit.dark); grd.addColorStop(0.82, kit.dark); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.globalAlpha = pat === 'waves' ? 0.75 : 0.9; g.fillStyle = grd;
    for (const ox of [0, -W]) { g.beginPath(); g.moveTo(x + ox - hw, H); g.lineTo(x + ox - hw, Y(sArm) + 30); g.quadraticCurveTo(x + ox, Y(sArm) - 20, x + ox + hw, Y(sArm) + 30); g.lineTo(x + ox + hw, H); g.closePath(); g.fill(); }
    g.restore();
  });
  if (pat === 'waves') {
    // thin tone-on-tone wavy lines all round (a whole number of waves so the seam matches), with a faint shadow
    // under each line so they read as a woven sheen
    const step = 0.06 * ty, A = 0.011 * pyU, N = 44;
    for (let s = 0.03, row = 0; s < P.sTot; s += step, row++) {
      const y = Y(s), ph = row * 0.9;
      for (const L of [{ c: 'rgba(0,0,0,.12)', o: 2.2, w: 2.2 }, { c: light, o: 0, w: 2.4, a: 0.5 }]) {
        g.beginPath(); for (let x = 0; x <= W; x += 4) { const yy = y + L.o + Math.sin(x / W * TAU * N + ph) * A; if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
        g.globalAlpha = L.a || 1; g.strokeStyle = L.c; g.lineWidth = L.w; g.stroke(); g.globalAlpha = 1;
      }
    }
  } else if (pat === 'stripes') {
    g.fillStyle = kit.dark; for (let k = 0; k < 16; k++) { const x = (FRONT + W / 64 + k * W / 16) % W; g.fillRect(x, 0, W / 32, H); if (x + W / 32 > W) g.fillRect(x - W, 0, W / 32, H); }
  } else if (pat === 'hoops') {
    g.fillStyle = kit.dark; for (let s = P.sAtY(1.5 * ty); s < P.sTot; s += 0.27 * ty) g.fillRect(0, Y(s), W, 0.135 * ty * pyU);
  } else if (pat === 'sash') {
    // one diagonal band from his right shoulder across the chest to his left hip, and on round the back
    g.fillStyle = kit.dark;
    const band = (p0, s0, p1, s1, wd) => { g.beginPath(); g.moveTo(X(p0) - wd, Y(s0)); g.lineTo(X(p0) + wd, Y(s0)); g.lineTo(X(p1) + wd, Y(s1)); g.lineTo(X(p1) - wd, Y(s1)); g.closePath(); g.fill(); };
    const sTop = P.sAtR(0.62 * tx), sBot = P.sTot;
    band(-1.15, sTop, 1.05, sBot, 0.17 * tx * pxU(1.2)); band(Math.PI - 1.05 + TAU * 0, sTop, Math.PI + 1.15, sBot, 0.17 * tx * pxU(1.2));
  }
  // inside the collar (the top of the shirt round the neck) a shade darker
  const NL = necklinePath(P, kit.collar);
  g.fillStyle = mixHex(kit.jersey, '#000000', 0.3); g.fillRect(0, 0, W, Y(NL.s0 - 0.01));
  if (NL.v) {
    // the V: skin inside it, with a soft shadow just under the band
    const vp = NL.pts.filter((q) => q.vw === 1 || Math.abs(q.phi) <= NL.phiC + 1e-6);
    g.beginPath(); vp.forEach((q, i) => { const x = X(q.phi), y = Y(q.s); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.lineTo(X(NL.phiC), 0); g.lineTo(X(-NL.phiC), 0); g.closePath();
    g.save(); g.fillStyle = kit.skin || '#efc19d'; g.fill(); g.clip();
    g.beginPath(); vp.forEach((q, i) => { const x = X(q.phi), y = Y(q.s); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.strokeStyle = 'rgba(70,30,20,.35)'; g.lineWidth = NL.w * 2.9 * pyU; g.stroke();
    g.strokeStyle = 'rgba(70,30,20,.25)'; g.lineWidth = NL.w * 3.6 * pyU; g.stroke();
    g.restore();
  }
  // a little four-pointed compass star at the back of the neck, just under the collar band
  place(Math.PI, NL.s0 + 0.075 * ty); g.beginPath(); star(g, 0, 0, 0.042 * tx, 4, 0.3); g.fillStyle = accent; g.fill();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const dark = lumOf(kit.jersey) > 0.55;
  // the front number: tall, narrow and thin, centred on the chest and upper belly
  const showFront = kit.frontNum != null ? kit.frontNum : !!front;
  const edge = dark ? (lumOf(kit.trim) > 0.5 ? kit.dark : '#ffffff') : kit.trim === '#ffffff' ? kit.dark : kit.trim, cols = { a: accent, e: edge, s: kit.jersey };
  if (showFront) {
    warp(0, P.sAtY(0.76 * ty), 1.6 * 0.62 * ty, 1.4 * 0.62 * ty, (o) => styledNumber(o, num, 0.62 * ty, kit.numStyle, 'f', cols, dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.22)'));
  }
  // the back: the name in an arc over a big number
  const nm = String(name || '').toUpperCase().slice(0, 12), FONT = '"Arial Black", Impact, "Trebuchet MS", sans-serif';
  if (nm) {
    const sN = P.sAtY(1.33 * ty);
    // drawn in a box whose centre is 0.08 below the name's middle (the arc's ends hang lower than its middle)
    warp(Math.PI, sN + 0.08 * ty, 1.3 * tx, 0.5 * ty, (o, sx) => {
      const k = sx / pyU;
      let fs = 0.15 * ty * pyU; o.font = '900 ' + fs + 'px ' + FONT;
      const maxW = 1.05 * tx * sx; let wid = o.measureText(nm).width * k;
      if (wid > maxW) { fs *= maxW / wid; o.font = '900 ' + fs + 'px ' + FONT; wid = maxW; }
      const R = 1.7 * tx * sx, x0 = o.canvas.width / 2, y0 = o.canvas.height / 2 - 0.08 * ty * pyU, sp = fs * 0.06;
      let cur = -(wid + sp * (nm.length - 1)) / 2;
      o.textAlign = 'center'; o.textBaseline = 'middle'; o.lineJoin = 'round';
      for (const ch of nm) {
        const cw = o.measureText(ch).width * k, a = (cur + cw / 2) / R;
        o.setTransform(1, 0, 0, 1, x0 + Math.sin(a) * R, y0 + (1 - Math.cos(a)) * R); o.rotate(a); o.scale(k, 1);
        o.lineWidth = fs * 0.16; o.strokeStyle = dark ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.3)'; o.strokeText(ch, 0, fs * 0.04);
        o.fillStyle = accent; o.fillText(ch, 0, 0);
        cur += cw + sp;
      }
    });
  }
  warp(Math.PI, P.sAtY(0.76 * ty), 1.6 * 0.76 * ty, 1.4 * 0.76 * ty, (o) => styledNumber(o, num, 0.76 * ty, kit.numStyle, 'b', cols, dark ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.35)'));
  const tex = artTexture(cv); return tex;
}

// sleeves (and the shoulder balls): the same waves, as rings round the arm; plain otherwise
function sleeveTexture(kit) {
  const W = 512, H = 256, cv = artCanvas(W, H), g = cv.getContext('2d');
  g.fillStyle = kit.jersey; g.fillRect(0, 0, W, H);
  if ((kit.pattern || (kit.waves ? 'waves' : '')) === 'waves') {
    const light = kit.light || kit.waves, rows = 10, N = 10;
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) * H / rows;
      for (const L of [{ c: 'rgba(0,0,0,.12)', o: 2, w: 2 }, { c: light, o: 0, w: 2.4, a: 0.5 }]) {
        g.beginPath(); for (let x = 0; x <= W; x += 4) { const yy = y + L.o + Math.sin(x / W * TAU * N + r * 0.9) * 3; if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
        g.globalAlpha = L.a || 1; g.strokeStyle = L.c; g.lineWidth = L.w; g.stroke(); g.globalAlpha = 1;
      }
    }
  }
  return artTexture(cv);
}
// the knitted band (collar and cuffs): ribs along it, and across it from the shirt side: trim, a thin shirt-colour
// stripe, trim, then a shirt-colour inner edge
function bandTexture(kit, repeat) {
  const W = 64, H = 64, cv = artCanvas(W, H), g = cv.getContext('2d'), trim = kit.trim, red = kit.trim2 || kit.jersey;
  // canvas y = (1 - v) * H: v = 0 (the shirt side) is the bottom row
  const rowsV = [[0, 0.08, mixHex(trim, '#000000', 0.25)], [0.08, 0.5, trim], [0.5, 0.6, red], [0.6, 0.8, trim], [0.8, 1, red]];
  rowsV.forEach((q) => { g.fillStyle = q[2]; g.fillRect(0, (1 - q[1]) * H, W, (q[1] - q[0]) * H + 0.5); });
  // ribs: soft light / dark lines across the band
  for (let x = 0; x < W; x += 8) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, 0, 3, H); g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x + 5, 0, 2, H); }
  const t = artTexture(cv); t.wrapS = THREE.RepeatWrapping; t.repeat.set(repeat || 1, 1); return t;
}
// shorts (see buildHuman): the seat and the two legs each get their own texture, laid out by arc length up their
// profile (canvas y) and angle round (canvas x). The side stripe in the trim colour with a thin shirt-colour line, the
// same as a hem band round each leg, a small number on his left leg, a ribbed elastic waistband.
function shortsInk(kit) {
  const lightShorts = lumOf(kit.shorts) > 0.6, ink = lightShorts ? (lumOf(kit.trim) < 0.4 ? kit.trim : '#1d2b3a') : (kit.accent && lumOf(kit.accent) > 0.5 ? kit.accent : '#ffffff');
  const stripe = lumOf(kit.trim) > 0.85 && lightShorts ? kit.jersey : kit.trim, line = stripe === kit.jersey ? kit.trim : kit.jersey;
  return { ink, stripe, line };
}
// the seat: u = 0 the back seam, 0.25 his right side, 0.5 the front, 0.75 his left.
// L: { t: [v of each profile point], tot: arc length, R: hip radius, band: [j bottom, j top] }
function seatTexture(kit, L) {
  const W = 1024, H = 256, cv = artCanvas(W, H), g = cv.getContext('2d'), C = shortsInk(kit), Y = (t) => (1 - t) * H;
  const pxX = W / (TAU * L.R), pyU = H / L.tot, yb0 = Y(L.t[L.band[0]]), yb1 = Y(L.t[L.band[1]]);
  g.fillStyle = kit.shorts; g.fillRect(0, 0, W, H);
  // a soft shadow under the waistband; the centre seams front and back
  const gr = g.createLinearGradient(0, yb0, 0, yb0 + 0.07 * pyU); gr.addColorStop(0, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, yb0, W, 0.07 * pyU);
  g.fillStyle = 'rgba(0,0,0,.22)'; [0, W / 2, W].forEach((x) => g.fillRect(x - 1.5, yb0, 3, H - yb0));
  // side stripes, from the crotch up to the waistband
  [W / 4, 3 * W / 4].forEach((x) => { const hw = 0.05 * pxX; g.fillStyle = C.stripe; g.fillRect(x - hw, yb0, hw * 2, H - yb0); g.fillStyle = C.line; g.fillRect(x - 0.008 * pxX, yb0, 0.016 * pxX, H - yb0); });
  // the elastic waistband: a shade darker, ribbed, a light top edge
  g.fillStyle = mixHex(kit.shorts, '#000000', 0.1); g.fillRect(0, yb1, W, yb0 - yb1);
  for (let x = 0; x < W; x += 7) { g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x, yb1, 2, yb0 - yb1); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + 4, yb1, 1.5, yb0 - yb1); }
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, yb1, W, 2); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, yb0 - 2, W, 2);
  // inside the waist (seen only when he bends right over): dark
  g.fillStyle = mixHex(kit.shorts, '#000000', 0.45); g.fillRect(0, 0, W, Math.max(0, yb1 - 1));
  return artTexture(cv);
}
// one leg: u = 0 the inner seam, 0.5 the outside (the stripe); the front is u = 0.25 on his left leg, 0.75 on his right.
// L: { t, tot, hem: j of the hem's outer edge, R: radius, sc: size }
function legTexture(kit, num, left, L) {
  const W = 512, H = 256, cv = artCanvas(W, H), g = cv.getContext('2d'), C = shortsInk(kit), Y = (t) => (1 - t) * H;
  const pxX = W / (TAU * L.R), pyU = H / L.tot, yHem = Y(L.t[L.hem]);
  g.fillStyle = kit.shorts; g.fillRect(0, 0, W, H);
  // a few soft fold shadows rising from the hem
  [0.12, 0.38, 0.62, 0.86].forEach((u, i) => {
    const x = u * W, h = (0.12 + 0.05 * (i % 2)) * L.sc * pyU, gr = g.createLinearGradient(0, yHem, 0, yHem - h);
    gr.addColorStop(0, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr;
    g.beginPath(); g.moveTo(x - 9, yHem); g.quadraticCurveTo(x - 2, yHem - h * 0.5, x, yHem - h); g.quadraticCurveTo(x + 2, yHem - h * 0.5, x + 9, yHem); g.fill();
  });
  // the inner seam, the outside stripe
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H);
  const hw = 0.05 * pxX; g.fillStyle = C.stripe; g.fillRect(W / 2 - hw, 0, hw * 2, H); g.fillStyle = C.line; g.fillRect(W / 2 - 0.008 * pxX, 0, 0.016 * pxX, H);
  // the hem band (outside, folding round to the inside)
  const yb = yHem - 0.05 * L.sc * pyU;
  g.fillStyle = C.stripe; g.fillRect(0, yb, W, H - yb); g.fillStyle = C.line; g.fillRect(0, yb - 0.012 * L.sc * pyU, W, 0.01 * L.sc * pyU);
  if (left) {
    g.setTransform(pxX, 0, 0, pyU, 0.31 * W, yHem - 0.18 * L.sc * pyU);
    styledNumber(g, num, 0.15 * L.sc, kit.numStyle, 'f', { a: C.ink, e: kit.shorts, s: kit.shorts });
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  return artTexture(cv);
}
// socks: a band in the trim colour near the top, with a thin line under it
function sockTexture(kit) {
  const W = 128, H = 256, cv = artCanvas(W, H), g = cv.getContext('2d');
  g.fillStyle = kit.sock || kit.jersey; g.fillRect(0, 0, W, H);
  const trim = kit.trim, sameish = Math.abs(lumOf(trim) - lumOf(kit.sock || kit.jersey)) < 0.06;
  g.fillStyle = sameish ? '#ffffff' : trim; g.fillRect(0, 0, W, H * 0.035); g.fillRect(0, H * 0.08, W, H * 0.1); g.fillRect(0, H * 0.21, W, H * 0.025);
  for (let x = 0; x < W; x += 6) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(x, 0, 2, H); }
  return artTexture(cv);
}
// ---------------- head surface ----------------
// The head is a deformed sphere. surf(d) gives the surface point for a unit direction d, so the hair, the mouth and the
// cheek decals can all be laid exactly on it (radially), whatever the head shape.
function makeSurf(R, H) {
  const cheek = H.cheek || 0, back = H.back || 0;
  return function (dx, dy, dz, out) {
    // a softer, narrower jaw below the cheeks, and a chin that comes forward a little (grown-up)
    const low = clamp(-dy - 0.25, 0, 1), jaw = 1 - H.jaw * low * low * 1.6;
    const chin = H.chin * clamp(-dy - 0.45, 0, 1) * clamp(dz, 0, 1);
    // full round cheeks (a kid's): a soft bulge out and forward, low on the front half of the face
    const ch = cheek * Math.exp(-Math.pow((dy + 0.3) / 0.24, 2)) * clamp(dz * 1.6 + 0.25, 0, 1);
    // a rounder back of the head (the crown and occiput are what we see from the seat)
    const bk = back * clamp(-dz, 0, 1) * clamp(dy + 0.6, 0, 1);
    out.set(dx * R * H.sx * (jaw + ch + bk * 0.5), dy * R * H.sy - chin * R * 0.35, dz * R * H.sz * (1 - 0.4 * H.jaw * low * low + 0.6 * ch + bk) + chin * R * 0.25);
    return out;
  };
}
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
// a point on the face from front-plane coordinates (x, y in head radii, the face looks along +z), lifted off by `off` radii
function facePoint(surf, R, x, y, off, out) {
  const r2 = x * x + y * y, z = Math.sqrt(Math.max(0.0004, 1 - Math.min(r2, 0.9996)));
  _d.set(x, y, z).normalize(); surf(_d.x, _d.y, _d.z, out);
  _n.copy(out).normalize(); out.addScaledVector(_n, off * R); return out;
}

// Hair styles: a displaced shell around the head. line(d) = the hairline (unit-direction y below which there is no hair),
// thick(d) = how far the hair stands off the scalp (head radii). Vertices outside the hair are tucked inside the head.
// Strands that fan out from a crown whorl (a point at the back of the top of the head) and curl a little around it, so
// the hair reads as hair from behind and above (the seat camera) and the fringe flows across the forehead.
// Returns 0..1 (1 = the middle of a lock, 0 = the groove between two locks) and the distance from the crown (radians).
function whorl(C, E1, E2, N, twist) {
  return function (d, out) {
    const cd = clamp(d.x * C.x + d.y * C.y + d.z * C.z, -1, 1), dist = Math.acos(cd);
    const phi = Math.atan2(d.x * E2.x + d.y * E2.y + d.z * E2.z, d.x * E1.x + d.y * E1.y + d.z * E1.z);
    out.r = 0.5 + 0.5 * Math.cos(N * phi + twist * dist + 1.7 * Math.sin(dist * 3.1)); out.dist = dist;
    return out;
  };
}
function basis(cx, cy, cz) {
  const C = new THREE.Vector3(cx, cy, cz).normalize(), E1 = new THREE.Vector3().crossVectors(C, new THREE.Vector3(1, 0, 0)).normalize(), E2 = new THREE.Vector3().crossVectors(C, E1);
  return [C, E1, E2];
}
// his whorl: at the back of the crown, a little to his left; the twist sends the fringe across toward his right
const KW = basis(0.14, 0.74, -0.66), kidWhorl = whorl(KW[0], KW[1], KW[2], 19, -2.6), _w = { r: 0, dist: 0 };
export const HAIR_STYLES = {
  // his own: straight, thick and full, a longish cut. The fringe sweeps diagonally across the forehead from his left to
  // his right and ends just above the eyebrows (lowest over his right brow); the sides cover the top half of the ears;
  // full and round at the crown and the back. (Local +x is his left.)
  swept: {
    front: (x) => 0.45 + 0.13 * clamp(x, -1, 1) - 0.065 * Math.abs(Math.sin(x * 9 + 0.9)) + 0.06 * clamp((x - 0.5) * 3, 0, 1), side: -0.1, back: -0.62,
    thick: (d, line) => {
      kidWhorl(d, _w);
      const crown = 0.035 * Math.exp(-Math.pow(_w.dist / 0.45, 2));                         // a little lift at the whorl
      return 0.13 + 0.07 * clamp(d.y + 0.2, 0, 1) + crown + 0.03 * clamp(Math.abs(d.x) - 0.55, 0, 1) * clamp(d.y + 0.4, 0, 1)
        + 0.025 * clamp(1 - (d.y - line) * 5, 0, 1) * clamp(d.z, 0, 1);                     // a thick fringe
    },
    grain: (d) => { kidWhorl(d, _w); return 0.03 * (_w.r - 0.5) * clamp(_w.dist / 0.35, 0, 1); },
    shade: (d) => { kidWhorl(d, _w); const f = clamp(_w.dist / 0.35, 0, 1); return 0.8 + 0.3 * _w.r * f + 0.12 * (1 - f) + 0.1 * clamp(d.y, 0, 1); },
    jag: (a) => -0.06 * Math.pow(Math.abs(Math.sin(a * 8 + 0.4)), 0.7) - 0.03 * Math.abs(Math.sin(a * 19)),
    lift: 0.025, frontW: 0.8
  },
  // a short crop: thin, the ears and forehead show
  short: { front: (x) => 0.58 - 0.02 * Math.abs(Math.sin(x * 12)), side: 0.32, back: -0.32, thick: () => 0.045, grain: (d) => 0.006 * Math.sin(d.x * 30) * Math.sin(d.y * 30), lift: 0 },
  // short sides, spikes on top
  spiky: { front: (x) => 0.52 - 0.05 * Math.abs(Math.sin(x * 8)), side: 0.28, back: -0.34, thick: (d) => 0.06 + 0.03 * clamp(d.y, 0, 1), grain: () => 0, lift: 0, spikes: true },
  // soft curls all over
  curly: { front: (x) => 0.48 - 0.05 * Math.abs(Math.sin(x * 7)), side: 0.08, back: -0.45, thick: (d) => 0.13 + 0.04 * clamp(d.y, 0, 1),
    grain: (d) => 0.05 * Math.sin(d.x * 14 + 1) * Math.sin(d.y * 14) * Math.sin(d.z * 14 + 2), lift: 0.02 },
  // a long bob down to the jaw
  long: { front: (x) => 0.42 - 0.04 * Math.abs(Math.sin(x * 6)), side: -0.78, back: -0.85, thick: (d) => 0.1 + 0.05 * clamp(d.y, 0, 1) + 0.05 * clamp(-d.y, 0, 1),
    grain: (d) => 0.01 * Math.sin(Math.atan2(d.x, d.z) * 18), lift: 0.03, frontW: 0.62 },
  // Tata's: long on top and tousled, parted a little off the middle and falling to both sides like curtains, the
  // strands reaching down to the brows at the sides of the forehead (a narrow V of forehead shows at the parting)
  tousled: {
    front: (x) => { const ax = Math.abs(x - 0.06); return 0.6 - 0.36 * clamp(ax * 2.3, 0, 1) + 0.14 * clamp((ax - 0.6) * 2.5, 0, 1) - 0.045 * Math.abs(Math.sin(x * 12 + 0.4)); },
    side: 0.0, back: -0.56, frontW: 0.85,
    thick: (d, line) => 0.13 + 0.13 * clamp(d.y + 0.1, 0, 1) + 0.035 * clamp(1 - (d.y - line) * 5, 0, 1) + 0.02 * Math.sin(d.x * 7 + d.z * 4) * Math.sin(d.y * 9),
    // strands run from the parting down over the sides (rings around the front-back axis), a little wavy
    grain: (d) => 0.028 * (0.5 + 0.5 * Math.cos(30 * d.z + 2.2 * Math.sin(d.x * 5 + d.y * 3)) - 0.5) * clamp(d.y + 0.5, 0, 1),
    shade: (d) => 0.8 + 0.32 * (0.5 + 0.5 * Math.cos(30 * d.z + 2.2 * Math.sin(d.x * 5 + d.y * 3))) * clamp(d.y + 0.5, 0, 1),
    jag: (a) => -0.05 * Math.pow(Math.abs(Math.sin(a * 7 + 1.1)), 0.8),
    lift: 0.05
  }
};
function hairLine(st, d, out) {
  // blend front (fringe), sides and back by the direction around the head
  const fw = st.frontW || 0.85;
  const c = d.z / Math.max(1e-6, Math.sqrt(d.x * d.x + d.z * d.z));
  const wf = Math.pow(clamp((c - (1 - fw)) / fw, 0, 1), 1.3), wb = clamp(-c, 0, 1);
  if (out) out.wf = wf;
  // jag: uneven ends round the sides and back (so the cut doesn't read as a bowl)
  const jg = st.jag ? st.jag(Math.atan2(d.x, d.z)) * (1 - wf) : 0;
  return wf * st.front(d.x) + wb * st.back + (1 - wf - wb) * st.side + jg;
}
// The hair is a cap laid over the scalp from the crown down to the hairline, column by column around the head, so its
// edge follows the hairline exactly (clean fringe strands, no stair steps). A short rim turns the edge back into the
// scalp so it never looks hollow. Sides and back thin out toward the edge; the fringe stays thick (a blunt cut).
function hairGeometry(R, surf, st) {
  const NT = 176, NP = 44, rows = NP + 3, pos = new Float32Array(NT * rows * 3), col = new Float32Array(NT * rows * 3), d = new THREE.Vector3(), o = new THREE.Vector3(), info = { wf: 0 };
  // per-vertex shade (locks lighter, the grooves between them darker), multiplied with the hair colour
  const shadeOf = st.shade || ((dd) => 1 + 6 * st.grain(dd));
  const put = (j, i, x, y, z, sh) => { const k = (j * NT + i) * 3; pos[k] = x; pos[k + 1] = y; pos[k + 2] = z; col[k] = col[k + 1] = col[k + 2] = sh; };
  for (let i = 0; i < NT; i++) {
    const th = i / NT * Math.PI * 2, st0 = Math.sin(th), ct0 = Math.cos(th);
    let ph = Math.PI / 2;
    for (let it = 0; it < 8; it++) { d.set(Math.sin(ph) * st0, Math.cos(ph), Math.sin(ph) * ct0); ph = Math.acos(clamp(hairLine(st, d), -0.97, 0.97)); }
    d.set(Math.sin(ph) * st0, Math.cos(ph), Math.sin(ph) * ct0);
    const line = hairLine(st, d, info), wf = info.wf;
    let edgeTh = 0;
    for (let j = 0; j <= NP; j++) {
      const t = j / NP, p = ph * t;
      d.set(Math.sin(p) * st0, Math.cos(p), Math.sin(p) * ct0);
      const e = sstep01((1 - t) / 0.2), taper = 0.3 + 0.7 * (e + (1 - e) * wf);
      const thk = (st.thick(d, line) + st.grain(d)) * taper;
      surf(d.x, d.y, d.z, o); o.multiplyScalar(1 + thk);
      // a fringe stands a little proud of the forehead so it reads from the side too
      if (st.lift && d.z > 0.2) o.z += st.lift * R * clamp(1 - (d.y - line) * 4, 0, 1);
      // the cut ends a touch darker; a soft sheen band round the crown catches the light (reads from behind too)
      const sheen = 1 + 0.16 * Math.exp(-Math.pow((d.y - 0.6) / 0.13, 2)) * (0.6 + 0.4 * Math.max(0, -d.z));
      const sh = clamp(shadeOf(d) * sheen, 0.55, 1.45) * (0.9 + 0.1 * e);
      put(j, i, o.x, o.y, o.z, sh); if (j === NP) edgeTh = thk;
    }
    // rim: from the edge back under, into the scalp
    d.set(Math.sin(ph) * st0, Math.cos(ph), Math.sin(ph) * ct0); surf(d.x, d.y, d.z, o);
    const lz = st.lift && d.z > 0.2 ? st.lift * R * 0.5 : 0;
    put(NP + 1, i, o.x * (1 + edgeTh * 0.45), o.y * (1 + edgeTh * 0.45), o.z * (1 + edgeTh * 0.45) + lz, 0.78);
    put(NP + 2, i, o.x * 0.97, o.y * 0.97, o.z * 0.97, 0.7);
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < NT; i++) {
    const a = j * NT + i, b = j * NT + (i + 1) % NT, c = (j + 1) * NT + i, e = (j + 1) * NT + (i + 1) % NT;
    idx.push(a, c, b, b, c, e);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const sstep01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// A strip laid on the face, from a parametric shape: shape(u in -1..1, v in 0..1) -> [x, y] (head radii). Morph targets
// are the same strip for other shapes, so expressions blend smoothly.
function faceStrip(surf, R, shapes, off, NU, NV) {
  const g = new THREE.BufferGeometry(), n = (NU + 1) * (NV + 1), idx = [], uv = new Float32Array(n * 2);
  const fill = (shape) => {
    const a = new Float32Array(n * 3);
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const k = j * (NU + 1) + i, xy = shape(i / NU * 2 - 1, j / NV);
      facePoint(surf, R, xy[0], xy[1], off, _p); a[k * 3] = _p.x; a[k * 3 + 1] = _p.y; a[k * 3 + 2] = _p.z;
    }
    return new THREE.Float32BufferAttribute(a, 3);
  };
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) { const k = j * (NU + 1) + i; uv[k * 2] = i / NU; uv[k * 2 + 1] = 1 - j / NV; }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  g.setIndex(idx); g.setAttribute('position', fill(shapes[0])); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (shapes.length > 1) g.morphAttributes.position = shapes.slice(1).map(fill);
  // normals: straight out of the face (the strip is tiny, so one set serves every shape)
  const nr = new Float32Array(n * 3), pa = g.attributes.position;
  for (let k = 0; k < n; k++) { _n.set(pa.getX(k), pa.getY(k), pa.getZ(k)).normalize(); nr[k * 3] = _n.x; nr[k * 3 + 1] = _n.y; nr[k * 3 + 2] = _n.z; }
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
  return g;
}

// Mouth shapes (head radii; corners meet at |u| = 1). The first is the resting face: his big, wide, open grin.
// w width, cy corner height, tc / bc top / bottom edge at the middle, pt / pb roundness, sk tilt, xo sideways,
// teeth = upper teeth height, tongue = [width share, height]
export const MOUTHS = ['grin', 'big', 'smile', 'hmm', 'o', 'shout'];
function mouthSpecs(w0, y0, adult) {
  const m = {
    // his grin: very wide and open, the upper teeth showing with the two front teeth a little bigger
    grin: { w: 0.76, cy: 0.09, tc: -0.02, bc: -0.3, pt: 1.1, pb: 0.6, sk: 0, xo: 0, teeth: 0.1, front: 0.35, low: 0.035, tongue: [0.5, 0.07] },
    big: { w: 0.78, cy: 0.1, tc: -0.005, bc: -0.4, pt: 1.1, pb: 0.55, sk: 0, xo: 0, teeth: 0.09, front: 0.3, low: 0.03, tongue: [0.55, 0.1] },
    smile: { w: 0.5, cy: 0.05, tc: -0.03, bc: -0.07, pt: 1, pb: 0.9, sk: 0, xo: 0, teeth: 0, low: 0, tongue: [0, 0] },
    hmm: { w: 0.26, cy: -0.01, tc: -0.005, bc: -0.035, pt: 1, pb: 1, sk: 0.05, xo: 0.07, teeth: 0, low: 0, tongue: [0, 0] },
    o: { w: 0.2, cy: -0.06, tc: 0.025, bc: -0.15, pt: 0.5, pb: 0.5, sk: 0, xo: 0, teeth: 0, low: 0, tongue: [0.6, 0.04] },
    shout: { w: 0.36, cy: -0.1, tc: 0.03, bc: -0.33, pt: 0.5, pb: 0.5, sk: 0, xo: 0, teeth: 0.06, low: 0.02, tongue: [0.6, 0.09] }
  };
  if (adult) {
    // a grown-up's resting face is a gentle closed-mouth smile (Tata's), not a kid's huge grin
    m.grin = { w: 0.56, cy: 0.055, tc: -0.028, bc: -0.052, pt: 1, pb: 0.85, sk: 0, xo: 0, teeth: 0, low: 0, tongue: [0, 0] };
    m.smile = { w: 0.6, cy: 0.07, tc: -0.03, bc: -0.1, pt: 1, pb: 0.8, sk: 0, xo: 0, teeth: 0.04, low: 0, tongue: [0, 0] };
  }
  MOUTHS.forEach((k) => { m[k].w *= w0; m[k].xo *= w0; m[k].y0 = y0; });
  return m;
}
function edges(s, u) {
  const q = 1 - u * u, top = s.y0 + s.cy + (s.tc - s.cy) * Math.pow(q, s.pt) + s.sk * u, bot = s.y0 + s.cy + (s.bc - s.cy) * Math.pow(q, s.pb) + s.sk * u;
  return [top, bot];
}
const mouthShape = (s) => (u, v) => { const e = edges(s, u); return [s.xo + u * s.w / 2, e[0] + (e[1] - e[0]) * v]; };
const teethShape = (s) => (u, v) => {
  // the two front teeth a little longer (s.front), with a hint of a gap between them
  const ft = 1 + (s.front || 0) * clamp((0.27 - Math.abs(u)) / 0.05, 0, 1) * (Math.abs(u) < 0.02 ? 0.35 : 1);
  const e = edges(s, u), gap = e[0] - e[1], h = Math.min(s.teeth * Math.pow(1 - u * u, 0.25) * ft, gap * 0.55), t0 = Math.min(0.008, h * 0.5);
  return [s.xo + u * s.w / 2 * 0.94, e[0] - t0 - (h - t0) * v];
};
const lowTeethShape = (s) => (u, v) => {
  const uu = u * 0.62, e = edges(s, uu), gap = e[0] - e[1], h = Math.min(s.low * Math.pow(1 - u * u, 0.3), gap * 0.2);
  return [s.xo + uu * s.w / 2, e[1] + 0.006 + h * (1 - v)];
};
const tongueShape = (s) => (u, v) => {
  const tw = s.tongue[0], uu = u * tw, e = edges(s, uu), gap = e[0] - e[1], h = Math.min(s.tongue[1], gap * 0.42) * Math.pow(1 - u * u, 0.5);
  return [s.xo + uu * s.w / 2, e[1] + 0.006 + h * (1 - v)];
};

function stubbleTexture() {
  const W = 128, cv = document.createElement('canvas'); cv.width = cv.height = W; const g = cv.getContext('2d');
  // fixed pseudo-random dots (same every time), fading out toward the cheeks and the top edge
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W, y = rnd() * W, u = x / W * 2 - 1, v = y / W;
    const a = clamp((v - 0.08) * 3, 0, 1) * clamp((1 - Math.abs(u)) * 2.4, 0, 1);
    if (rnd() > a) continue;
    g.fillStyle = 'rgba(40,30,26,' + (0.35 + 0.4 * rnd()).toFixed(2) + ')'; g.fillRect(x, y, 1.4, 1.4);
  }
  const grd = g.createLinearGradient(0, 0, 0, W); grd.addColorStop(0, 'rgba(60,45,38,0)'); grd.addColorStop(0.3, 'rgba(60,45,38,.11)'); grd.addColorStop(1, 'rgba(60,45,38,.17)');
  g.globalCompositeOperation = 'destination-over'; g.fillStyle = grd; g.fillRect(0, 0, W, W);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// A soft disc / patch on the face (cheeks), as a polar grid laid on the surface
function faceDisc(surf, R, cx, cy, rx, ry, off) {
  const shape = (u, v) => { const a = (u + 1) * Math.PI; return [cx + Math.cos(a) * rx * v, cy + Math.sin(a) * ry * v]; };
  return faceStrip(surf, R, [shape], off, 20, 3);
}

// ---------------- the whole person ----------------
export function buildKid(kit, num, name, look) { return buildHuman({ dims: KID, kit: kit, num: num, name: name, look: look }); }

export function buildHuman(spec) {
  const D = spec.dims || KID, kit = spec.kit || KITS.red, look = Object.assign({}, KID_LOOK, spec.look || {});
  const root = new THREE.Group(), body = new THREE.Group(), chest = new THREE.Group();
  root.add(body); body.add(chest);
  const skin = std(new THREE.Color(look.skin).getHex(), { roughness: 0.68 }), hairM = std(new THREE.Color(look.hair).getHex(), { roughness: 0.8 }), dark = std(0x231a16, { roughness: 0.35 });
  // the hair shell carries per-vertex shading (locks and grooves); a little sheen so it reads as hair, not a helmet
  const hairShellM = std(new THREE.Color(look.hair).getHex(), { roughness: 0.55, vertexColors: true });
  // the kit with what the shirt needs to know about him: his skin (inside a V-neck) and the collar
  const withSkin = (k) => Object.assign({}, k, { skin: look.skin, collar: k.collar || (look.vneck ? 'v' : 'round') });
  let K = withSkin(kit);
  const P = profileOf(D);
  const shirtM = std(0xffffff, { map: kidJerseyTexture(K, spec.num, spec.name, spec.front, D), roughness: 0.85 });
  const sleeveM = std(0xffffff, { map: sleeveTexture(K), roughness: 0.85 });
  const bandM = std(0xffffff, { map: bandTexture(K, 1), roughness: 0.8, side: THREE.DoubleSide }), cuffM = std(0xffffff, { map: bandTexture(K, 14), roughness: 0.8 });
  const add = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m; };

  // ----- torso: a lathe whose texture runs by arc length (see torsoProfile); the seam is under his right arm -----
  // the shirt group: torso, collar band and badges. A grown-up's chest is less deep than wide (dims.zs squashes it front
  // to back; the texture is not stretched at the front or the back, where the tangent round the body runs along x)
  const shirtG = new THREE.Group(); shirtG.scale.z = D.zs || 1; chest.add(shirtG);
  const torsoGeo = new THREE.LatheGeometry(P.pts, 64, SEAM, TAU);
  { const uv = torsoGeo.attributes.uv; for (let i = 0; i <= 64; i++) for (let j = 0; j < P.n; j++) uv.setY(i * P.n + j, 1 - P.S[j] / P.sTot); }
  if (D.muscle) {
    const pa = torsoGeo.attributes.position, nn = new THREE.Vector3();
    for (let i = 0; i <= 64; i++) for (let j = 0; j < P.n; j++) {
      const phi = SEAM + i / 64 * TAU, lift = torsoBump(P, phi, P.S[j]); if (!lift) continue;
      P.nrm(phi, P.S[j], nn); const k = i * P.n + j; pa.setXYZ(k, pa.getX(k) + nn.x * lift, pa.getY(k) + nn.y * lift, pa.getZ(k) + nn.z * lift);
    }
    torsoGeo.computeVertexNormals(); fixSeam(torsoGeo, 64, P.n);
  }
  const basePos = torsoGeo.attributes.position.array.slice();
  const torso = add(torsoGeo, shirtM, shirtG);
  // ----- the collar: a raised knitted band along the neckline. For a V-neck the shirt inside the V is sunk a little
  // (the opening) and painted as skin; round the back the band stands up against the neck -----
  let band = null, collarKind = null;
  const _t = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function inPoly(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
    return c;
  }
  function applyCollar(kind) {
    if (kind === collarKind) return; collarKind = kind;
    const NL = necklinePath(P, kind), m = NL.pts.length, Pp = [], Nn = [];
    NL.pts.forEach((q) => { Pp.push(P.pos(q.phi, q.s, torsoBump(P, q.phi, q.s), new THREE.Vector3())); Nn.push(P.nrm(q.phi, q.s, new THREE.Vector3())); });
    // per segment: the direction across the band, toward the neck (mitred at the corners and at the point of the V)
    const Bs = []; let total = 0;
    for (let k = 0; k < m - 1; k++) {
      _t.subVectors(Pp[k + 1], Pp[k]); total += _t.length(); _t.normalize();
      const nn = new THREE.Vector3().addVectors(Nn[k], Nn[k + 1]).normalize(); Bs.push(new THREE.Vector3().crossVectors(nn, _t).normalize());
    }
    if (Bs[0].z < 0) Bs.forEach((b) => b.negate());      // at the back (phi = -pi, z < 0) "toward the neck" is +z
    const reps = Math.max(1, Math.round(total / (0.1 * D.torsoX))), V = [], UVs = [], idx = [], inner = [];
    // inner edge points (mitred); near the point of the V the two sides' inner edges would cross over the middle, so
    // any that do are pulled back to the mitre point of the tip (a clean V inside the band)
    const Qs = Pp.map((Pv, i) => {
      const b0 = Bs[Math.max(0, i - 1)], b1 = Bs[Math.min(m - 2, i)];
      const b = new THREE.Vector3().addVectors(b0, b1).normalize(), len = NL.w * Math.min(2.6, 1 / Math.max(0.38, b.dot(b0)));
      return Pv.clone().addScaledVector(b, len);
    });
    const ti = NL.pts.findIndex((q) => q.tip);
    if (ti >= 0) {
      const tq = Qs[ti];
      for (let i = 0; i < m; i++) { const ph = NL.pts[i].phi; if (i !== ti && NL.pts[i].vw === 1 && Math.abs(ph) < 0.6 && (Qs[i].x * Math.sign(ph) < tq.x * Math.sign(ph) || Qs[i].y < tq.y)) Qs[i].copy(tq); }
    }
    let arc = 0;
    for (let i = 0; i < m; i++) {
      const q = NL.pts[i];
      const Pv = Pp[i], N = Nn[i], Q = Qs[i], st = NL.stand * (1 - q.vw), rec = NL.rec * q.vw, th = NL.th;
      if (i) arc += Pp[i].distanceTo(Pp[i - 1]);
      const u = arc / total * reps;
      const top = Q.clone().addScaledVector(N, th * 0.9).addScaledVector(UP, st);
      [[Pv.clone().addScaledVector(N, -0.012), 0], [Pv.clone().addScaledVector(N, th), 0.08], [Pv.clone().addScaledVector(N, th), 0.08],
        [Pv.clone().lerp(Q, 0.5).addScaledVector(N, th * 1.35).addScaledVector(UP, st * 0.55), 0.45], [top, 0.86], [top.clone(), 0.86],
        [Q.clone().addScaledVector(N, -rec - 0.012), 1]].forEach((pp) => { V.push(pp[0].x, pp[0].y, pp[0].z); UVs.push(u, pp[1]); });
      if (q.vw === 1) inner.push([Math.atan2(Q.x, Q.z), P.nearS(Math.hypot(Q.x, Q.z), Q.y)]);
    }
    for (let i = 0; i < m - 1; i++) [[0, 1], [2, 3], [3, 4], [5, 6]].forEach((e) => { const A = i * 7 + e[0], B = i * 7 + e[1], C = A + 7, E = B + 7; idx.push(A, C, B, B, C, E); });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(V, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(UVs, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    if (band) { shirtG.remove(band); band.geometry.dispose(); }
    band = add(geo, bandM, shirtG);
    // the opening: sink the shirt inside the band's inner edge (it is painted skin there)
    const pa = torsoGeo.attributes.position, na = torsoGeo.attributes.normal; pa.array.set(basePos);
    if (NL.v && inner.length > 2) {
      const poly = inner.slice(); poly.push([inner[inner.length - 1][0], -0.05], [inner[0][0], -0.05]);
      for (let i = 0; i <= 64; i++) {
        let phi = SEAM + i / 64 * TAU; if (phi > Math.PI) phi -= TAU;
        for (let j = 0; j < P.n; j++) {
          if (P.S[j] < 0.18 * D.torsoX || !inPoly(poly, phi, P.S[j])) continue;
          const k = (i * P.n + j) * 3; pa.array[k] -= na.array[k] * NL.rec; pa.array[k + 1] -= na.array[k + 1] * NL.rec; pa.array[k + 2] -= na.array[k + 2] * NL.rec;
        }
      }
    }
    pa.needsUpdate = true; torsoGeo.computeBoundingSphere();
  }
  applyCollar(K.collar);
  // ----- badges: our crest on his left chest, our maker's mark on his right chest and on both shoulders (decals laid
  // on the surface, with their own sharp textures so they hold up close) -----
  const decalMat = () => std(0xffffff, { roughness: 0.7, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const crestM = decalMat(), markM = decalMat();
  function gridGeo(NU, NV, at) {
    const pos = [], uv = [], idx = [], v3 = new THREE.Vector3();
    for (let b = 0; b <= NV; b++) for (let a = 0; a <= NU; a++) { at(a / NU - 0.5, b / NV - 0.5, v3); pos.push(v3.x, v3.y, v3.z); uv.push(a / NU, b / NV); }
    for (let b = 0; b < NV; b++) for (let a = 0; a < NU; a++) { const i0 = b * (NU + 1) + a; idx.push(i0, i0 + 1, i0 + NU + 1, i0 + 1, i0 + NU + 2, i0 + NU + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // fa: across (+ = toward his left), fb: up
  const torsoDecal = (phi0, sc, w, h, mat) => add(gridGeo(10, 10, (fa, fb, o) => { const s = sc - fb * h, ph = phi0 + fa * w / Math.max(0.05, P.at(s).r); P.pos(ph, s, 0.004 + torsoBump(P, ph, s), o); }), mat, shirtG);
  const sBadge = P.sAtY(1.29 * D.torsoY);
  const crestMesh = torsoDecal(0.46, sBadge, 0.25 * D.torsoX, 0.25 * D.torsoX * CREST_H, crestM);
  const markMesh = torsoDecal(-0.46, sBadge - 0.01, 0.19 * D.torsoX, 0.19 * D.torsoX, markM);
  crestMesh.renderOrder = markMesh.renderOrder = 2;
  let badgeKey = '', shoulderMarks = [];
  function setBadges(k) {
    const key = [k.crest, k.mark, k.accent].join('|'); if (key === badgeKey) return; badgeKey = key;
    const put = (m, cv) => { const o = m.map; m.map = cv ? artTexture(cv) : null; m.needsUpdate = true; if (o) o.dispose(); };
    put(crestM, crestCanvas(k.crest, 512)); put(markM, markCanvas(k.mark, k.accent || ICY, 256));
    crestMesh.visible = !!CRESTS[k.crest]; const mv = !!MARKS[k.mark]; markMesh.visible = mv; shoulderMarks.forEach((s) => { s.visible = mv; });
  }
  // ----- shorts: football shorts in three pieces of the same cloth. The seat (elastic waistband with a little bow,
  // hips, crotch) hangs on root, not on the leaning upper body, so it stays with the legs. Each leg of the shorts hangs
  // on its thigh: its top is a ball centred on the hip joint (a swinging, crouching or kneeling leg turns inside it, so
  // nothing tears) and its hem ends mid-thigh, cut a little higher on the inside, loose and standing away from the
  // thigh, with a darker inside and a couple of folds. Bare thighs, knees, then the socks. -----
  const lr = D.legR, mus = D.muscle || 0, hipX = D.hipX || 0.38 * D.torsoX, Rb = D.shortsRb || 0.26 * lr, sc = Rb / 0.26, zs = D.zs || 1;
  const yTop = D.waistTop != null ? D.waistTop : 0.13, bandH = 0.11 * sc, hemL = D.hemL || 0.38, yH = D.hipY;
  // the shirt's radius at a height (its tucked-in lower edge), so the waistband sits just outside it
  const shirtR = (y) => { const q = P.pts; for (let j = 1; j < q.length; j++) if (q[j].y >= y) { const a = q[j - 1], b = q[j], t = (y - a.y) / ((b.y - a.y) || 1e-6); return a.x + (b.x - a.x) * t; } return q[q.length - 1].x; };
  const wR = shirtR(yTop) + 0.03 * sc, hipR = Math.max(wR - 0.01, hipX + Rb * 0.92);
  // a lathe from [r, y] points listed bottom to top; uv: u round (from phi0), v = arc length (0 first point .. 1 last)
  function lathe(pts, segs, phi0, deform, shadeFn) {
    const geo = new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(q[0], q[1])), segs, phi0, TAU), n = pts.length, S = [0];
    for (let j = 1; j < n; j++) S.push(S[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    const uv = geo.attributes.uv, pa = geo.attributes.position, v3 = new THREE.Vector3(), col = shadeFn ? new Float32Array(pa.count * 3) : null;
    for (let i = 0; i <= segs; i++) for (let j = 0; j < n; j++) {
      const k = i * n + j, phi = phi0 + i / segs * TAU, t = S[j] / S[n - 1];
      uv.setXY(k, i / segs, t);
      if (deform) { v3.fromBufferAttribute(pa, k); deform(v3, phi, j, t); pa.setXYZ(k, v3.x, v3.y, v3.z); }
      if (col) col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = shadeFn(j, t, phi);
    }
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals(); fixSeam(geo, segs, n);
    geo.userData.t = S.map((x) => x / S[n - 1]); geo.userData.tot = S[n - 1];
    return geo;
  }
  // a smooth profile through radii rs at fractions ts (0 = top .. 1 = bottom) between y0 (top) and y1, bottom to top
  function smoothProfile(rs, ts, y0, y1, n) {
    const c = new THREE.SplineCurve(rs.map((r, i) => new THREE.Vector2(r, y0 + (y1 - y0) * ts[i])).reverse()).getPoints(n);
    return c.map((p) => [p.x, p.y]);
  }
  const radial = (v, phi, amt) => { v.x += Math.sin(phi) * amt; v.z += Math.cos(phi) * amt; };
  // the seat
  // the crotch sits just below the hip joints, so the two legs of the shorts part clearly below it
  const yB = yTop - bandH, cr = 0.08 * sc;
  const seatPts = [[0.001, yH - cr], [0.16 * sc, yH - cr * 0.92], [0.33 * sc, yH - cr * 0.6], [hipR * 0.9, yH + 0.02 * sc], [hipR, yH + 0.14 * sc],
    [hipR + (wR - hipR) * 0.6, (yH + yB) / 2 + 0.05], [wR - 0.006, yB - 0.012],
    [wR + 0.014, yB + 0.006], [wR + 0.02, yTop - bandH * 0.5], [wR + 0.014, yTop - 0.008], [wR - 0.004, yTop],
    [wR - 0.03 * sc, yTop - 0.012], [wR * 0.55, yTop - 0.03 * sc], [0.001, yTop - 0.035 * sc]];
  const SEAT_BAND = [7, 10];
  const seatGeo = lathe(seatPts, 40, Math.PI, (v, phi) => {
    // a rounder seat at the back (two soft halves either side of the seam), a little flatter front to back lower down
    if (v.z < 0) radial(v, phi, 0.035 * sc * gauss(v.y - (yH + 0.06 * sc), 0.18 * sc) * Math.pow(-Math.cos(phi), 2) * (1 - 0.7 * gauss(v.x, 0.06 * sc)));
    // front to back the seat narrows from the waist (as deep as the shirt) down toward the legs of the shorts
    v.z *= zs * (1 - 0.5 * Math.pow(clamp((yB - v.y) / (yB - yH + 0.08 * sc), 0, 1), 1.3));
  }, (j) => j >= 11 ? 0.42 : j <= 1 ? 0.82 : 1);
  const seatM = std(0xffffff, { roughness: 0.8, vertexColors: true });
  const seatL = { t: seatGeo.userData.t, tot: seatGeo.userData.tot, R: hipR, band: SEAT_BAND };
  // The seat bends at the hips with him: from the waistband up it follows the leaning upper body (body), the hips stay
  // with the legs (root), blended in between. A two-bone skinned mesh, one bone on root and one on body (both at the
  // origin, bound while the whole figure is at rest), so the GPU keeps it in step with every lean and twist.
  const seatW = seatPts.map((q) => sstep01((q[1] - (yH + 0.1 * sc)) / (yB - 0.012 - (yH + 0.1 * sc))));
  {
    const cnt = seatGeo.attributes.position.count, si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
    for (let k = 0; k < cnt; k++) { const w = seatW[k % seatPts.length]; si[k * 4 + 1] = 1; sw[k * 4] = 1 - w; sw[k * 4 + 1] = w; }
    seatGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); seatGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }
  const hipBone = new THREE.Bone(), waistBone = new THREE.Bone(); root.add(hipBone); body.add(waistBone);
  const shortsMesh = new THREE.SkinnedMesh(seatGeo, seatM); shortsMesh.frustumCulled = false; root.add(shortsMesh);
  root.updateMatrixWorld(true); shortsMesh.bind(new THREE.Skeleton([hipBone, waistBone]));
  // the drawstring: a tiny bow at the front of the waistband (it moves with the waistband, i.e. with body)
  const cordM = std(0xffffff, { roughness: 0.6 });
  const bow = new THREE.Group(); bow.position.set(0, yTop - bandH * 0.5, (wR + 0.02) * zs + 0.006 * sc); body.add(bow);
  {
    const loopG = new THREE.TorusGeometry(0.026 * sc, 0.0075 * sc, 6, 14), tailG = new THREE.CylinderGeometry(0.0075 * sc, 0.0075 * sc, 0.09 * sc, 6);
    add(new THREE.SphereGeometry(0.014 * sc, 8, 6), cordM, bow);
    [-1, 1].forEach((sd) => {
      const l = add(loopG, cordM, bow, sd * 0.03 * sc, 0.006 * sc, 0); l.scale.set(1.15, 0.7, 0.6); l.rotation.z = sd * 0.25;
      const t = add(tailG, cordM, bow, sd * 0.016 * sc, -0.048 * sc, 0.004 * sc); t.rotation.z = sd * 0.22;
    });
  }
  // the legs of the shorts (one shape, mirrored): inner lip, hem, the tube up the thigh, the ball round the hip joint
  const hemR = Rb * 1.1;
  const legPts = [[hemR - 0.035 * sc, -hemL + 0.09 * sc], [hemR - 0.016 * sc, -hemL + 0.004], [hemR, -hemL], [hemR * 0.99, -hemL + 0.07 * sc], [Rb * 1.005, -hemL * 0.45], [Rb, -0.04]];
  for (let k = 1; k <= 7; k++) { const a = k / 8 * Math.PI / 2; legPts.push([Rb * Math.cos(a), Rb * Math.sin(a)]); }
  legPts.push([0.001, Rb]);
  const LEG_HEM = 2;
  const shortLegs = [-1, 1].map((sd) => {
    // seam on the inside of the leg: phi0 puts u = 0 there (left leg: -x, right leg: +x)
    const geo = lathe(legPts, 32, -sd * Math.PI / 2, (v, phi) => {
      const w = clamp((-v.y - 0.35 * hemL) / (0.65 * hemL), 0, 1), inner = Math.max(0, -sd * Math.sin(phi));
      const f = 1 + w * w * (0.03 * Math.sin(3 * phi + sd) + 0.02 * Math.sin(5 * phi + 2));     // a couple of soft folds
      v.x *= f; v.z *= f; v.x += sd * 0.016 * sc * w;                                            // the hem stands away a little
      v.y += 0.07 * sc * inner * w;                                                            // cut higher on the inside
    }, (j) => j <= 1 ? 0.5 : j === LEG_HEM ? 0.72 : 1);
    return { geo, mat: std(0xffffff, { roughness: 0.8, vertexColors: true }), L: { t: geo.userData.t, tot: geo.userData.tot, hem: LEG_HEM, R: Rb, sc } };
  });
  function setShortsTex(k, n) {
    const swap = (m, t) => { const o = m.map; m.map = t; m.needsUpdate = true; if (o && o !== t) o.dispose(); };
    swap(seatM, seatTexture(k, seatL));
    shortLegs.forEach((q, i) => swap(q.mat, legTexture(k, n, i === 1, q.L)));
    cordM.color.set(lumOf(k.shorts) > 0.6 ? k.trim : '#f1f3f5');
  }
  setShortsTex(K, spec.num);
  // legs with a knee each (hip -> thigh -> knee -> shin, sock and boot). Children of root, so a lean bends only the
  // upper body. The knee lets him crouch, jump and kneel in the celebrations. Thighs taper to the knee (a fit grown-up
  // gets fuller quads and the teardrop above the knee), a kneecap, calves fuller at the back, socks to just under the knee.
  const sockM = std(0xffffff, { map: sockTexture(K), roughness: 0.85 }), bootM = std(0x1f2430, { roughness: 0.45 }), bootG = new THREE.SphereGeometry(1, 12, 8);
  const thighPts = smoothProfile([0.2, 0.198 + 0.014 * mus, 0.186 + 0.022 * mus, 0.166 + 0.008 * mus, 0.155].map((r) => r * lr), [0, 0.3, 0.55, 0.85, 1], 0.02, -D.thigh, 14);
  const thighGs = [-1, 1].map((sd) => lathe(thighPts, 18, 0, (v, phi, j, t) => {
    if (!mus) return; const u = 1 - t;                                                         // u: 0 hip .. 1 knee
    radial(v, phi, mus * lr * (0.016 * gauss(u - 0.5, 0.22) * Math.max(0, Math.cos(phi)) + 0.02 * gauss(u - 0.83, 0.08) * Math.max(0, Math.cos(phi + sd * 0.9))));
  }));
  const kneeG = new THREE.SphereGeometry(0.152 * lr, 14, 10), capG = new THREE.SphereGeometry(0.058 * lr, 10, 8);
  const sockTop = -(0.12 * lr + 0.02);
  const sockPts = smoothProfile([0.168, 0.17, 0.174 + 0.02 * mus, 0.152 + 0.008 * mus, 0.122, 0.126].map((r) => r * lr), [0, 0.06, 0.28, 0.58, 0.88, 1], sockTop, -D.shin + 0.04, 16);
  sockPts.push([0.135 * lr, sockTop + 0.01]);                                                  // the top edge turns in (no hole)
  // calf at the back; a shin pad under the sock at the front (a flat-topped rise with a clear edge)
  const sockG = lathe(sockPts, 18, 0, (v, phi, j, t) => radial(v, phi, (0.022 + 0.012 * mus) * lr * gauss(t - 0.7, 0.18) * Math.max(0, -Math.cos(phi))
    + 0.022 * lr * sstep01((t - 0.12) / 0.08) * (1 - sstep01((t - 0.55) / 0.08)) * Math.pow(Math.max(0, Math.cos(phi)), 2)));
  // boots: the upper in his colour, a contrasting sole with studs underneath, laces on top and a heel tab
  const soleM = std(0xf1f3f5, { roughness: 0.5 }), studM = std(0xadb5bd, { roughness: 0.4, metalness: 0.3 });
  const laceG = new THREE.BoxGeometry(0.11 * lr, 0.016, 0.024), studG = new THREE.CylinderGeometry(0.02 * lr, 0.026 * lr, 0.03, 8);
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group(); leg.position.set(s * hipX, D.hipY, 0); root.add(leg);
    const sl = shortLegs[s < 0 ? 0 : 1]; add(sl.geo, sl.mat, leg);
    add(thighGs[s < 0 ? 0 : 1], skin, leg);
    const knee = new THREE.Group(); knee.position.set(0, -D.thigh, 0); leg.add(knee);
    add(kneeG, skin, knee, 0, 0.005, 0).scale.set(1, 1.1, 1.02);
    add(capG, skin, knee, 0, 0.005, 0.105 * lr).scale.set(1.1, 1.2, 0.6);
    add(sockG, sockM, knee);
    const bt = new THREE.Group(); bt.position.set(0, -D.shin, 0.1); knee.add(bt);
    const b = add(bootG, bootM, bt); b.scale.set(0.2 * lr, 0.13, 0.32 * lr);
    const so = add(bootG, soleM, bt, 0, -0.088, 0.008); so.scale.set(0.213 * lr, 0.045, 0.334 * lr);
    [[0.07, 0.124], [0.13, 0.112], [0.19, 0.094]].forEach((q) => { const l = add(laceG, soleM, bt, 0, q[1], q[0] * lr); l.rotation.x = q[0] * 1.6; });
    const tab = add(bootG, soleM, bt, 0, 0.03, -0.3 * lr); tab.scale.set(0.07 * lr, 0.07, 0.03);
    [[-0.09, -0.2], [0.09, -0.2], [-0.1, 0.06], [0.1, 0.06], [-0.07, 0.22], [0.07, 0.22]].forEach((q) => add(studG, studM, bt, q[0] * lr, -0.128, q[1] * lr));
    leg.userData.knee = knee;
    return leg;
  });

  // ----- head -----
  const R = D.HEAD_R, HS = D.head, F = D.face, surf = makeSurf(R, HS);
  const neck = new THREE.Group(); neck.position.set(0, D.NECK_Y - 0.25, 0); neck.rotation.order = 'YXZ'; chest.add(neck);
  add(new THREE.CylinderGeometry(0.22 * (D.neckR || 1), 0.25 * (D.neckR || 1), D.neckLen, 12), skin, neck, 0, D.neckLen * 0.36, 0);
  const head = new THREE.Group(); head.position.set(0, 0.25 + D.HEAD_UP, 0.04); head.rotation.order = 'YXZ'; neck.add(head);
  const hg = new THREE.SphereGeometry(1, 36, 26), hp = hg.attributes.position, hv = new THREE.Vector3(), ho = new THREE.Vector3();
  for (let i = 0; i < hp.count; i++) { hv.fromBufferAttribute(hp, i); surf(hv.x, hv.y, hv.z, ho); hp.setXYZ(i, ho.x, ho.y, ho.z); }
  hg.computeVertexNormals();
  add(hg, skin, head);
  // hair
  let hairMesh = null, hairExtras = new THREE.Group(); head.add(hairExtras);
  function buildHair(styleId, col) {
    const st = HAIR_STYLES[styleId] || HAIR_STYLES.swept;
    if (hairMesh) { head.remove(hairMesh); hairMesh.geometry.dispose(); }
    hairExtras.children.slice().forEach((c) => { hairExtras.remove(c); if (c.geometry) c.geometry.dispose(); if (c.material && c.material !== hairM) c.material.dispose(); });
    if (col) { hairM.color.set(col); hairShellM.color.set(col); }
    hairMesh = add(hairGeometry(R, surf, st), hairShellM, head);
    if (st.spikes) {
      const cg = new THREE.ConeGeometry(0.1 * R / 0.74, 0.34 * R / 0.74, 7);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, el = i === 0 ? Math.PI / 2 : 0.95;
        const dx = i === 0 ? 0 : Math.cos(a) * Math.cos(el), dz = i === 0 ? 0.1 : Math.sin(a) * Math.cos(el) * 0.9 + 0.1, dy = i === 0 ? 1 : Math.sin(el);
        _d.set(dx, dy, dz).normalize(); surf(_d.x, _d.y, _d.z, _p); _p.multiplyScalar(1.07);
        const c = add(cg, hairM, hairExtras, _p.x, _p.y, _p.z); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _d);
      }
    }
    if (look.streaks) {
      // a few lighter strands in Tata's hair: thin tapered locks falling to both sides of the parting
      const sm = std(new THREE.Color(look.streaks).getHex(), { roughness: 0.75 }), lg = new THREE.SphereGeometry(1, 10, 8);
      [[-0.24, 0.72, 0.62, -1], [0.3, 0.7, 0.62, 1], [-0.46, 0.55, 0.62, -1], [0.12, 0.8, 0.55, 1], [0.48, 0.55, 0.64, 1], [-0.1, 0.62, 0.76, -1], [0.22, 0.6, 0.74, 1], [-0.62, 0.62, 0.3, -1]].forEach((q, qi) => {
        _d.set(q[0], q[1], q[2]).normalize(); surf(_d.x, _d.y, _d.z, _p);
        const th = HAIR_STYLES.tousled.thick(_d, 0.3) * 0.95; _p.multiplyScalar(1 + th);
        const m = add(lg, sm, hairExtras, _p.x, _p.y, _p.z); m.scale.set(0.032 * R, (qi > 4 ? 0.3 : 0.25) * R, 0.02 * R);
        // lie along the hair, falling sideways and down from the parting
        _n.copy(_d); const down = new THREE.Vector3(q[3] * 0.75, -1, 0).projectOnPlane(_n).normalize();
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), down);
      });
    }
  }
  buildHair(look.hairStyle, null);

  // ears (the hair covers their tops)
  const earG = new THREE.SphereGeometry(1, 12, 8);
  [-1, 1].forEach((s) => { _d.set(s, -0.1, -0.04).normalize(); surf(_d.x, _d.y, _d.z, _p); const e = add(earG, skin, head, _p.x * 0.97, _p.y, _p.z); e.scale.set(0.09 * R / 0.74, 0.165 * R / 0.74, 0.13 * R / 0.74); });
  // nose: a small soft button
  facePoint(surf, R, 0, F.noseY, -0.02, _p); const nose = add(new THREE.SphereGeometry(1, 12, 10), std(new THREE.Color(look.skin).multiplyScalar(0.93).getHex(), { roughness: 0.6 }), head, _p.x, _p.y, _p.z);
  nose.scale.set(0.08 * R, 0.068 * R, 0.06 * R * (look.adult ? 1.6 : 1));
  // rosy cheeks
  const cheekM = std(new THREE.Color(look.cheeks).getHex(), { roughness: 0.75 });
  const cheeks = [-1, 1].map((s) => add(faceDisc(surf, R, s * F.cheekX, F.cheekY, F.cheekR, F.cheekR * 0.78, 0.004), cheekM, head));
  if (look.adult) cheekM.color.lerp(new THREE.Color(look.skin), 0.55);
  // stubble (grown-up): a dotted shadow over the jaw and upper lip
  if (look.stubble) {
    const sh = (u, v) => { const x = u * 0.6, top = -0.2 - 0.06 * Math.abs(u), yb = -1.0 + 0.25 * u * u; return [x, top + (yb - top) * v]; };
    const sm = new THREE.MeshStandardMaterial({ map: stubbleTexture(), transparent: true, depthWrite: false, roughness: 0.9, color: 0xffffff });
    add(faceStrip(surf, R, [sh], 0.003, 24, 10), sm, head);
    // a faint moustache over the upper lip
    const my = F.mouthY + 0.01, mu = (u, v) => [u * 0.27, my + 0.075 - 0.03 * u * u + (-0.065 + 0.02 * u * u) * v];
    const mm = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.brows || look.hair).getHex(), transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.9 });
    add(faceStrip(surf, R, [mu], 0.005, 16, 2), mm, head).renderOrder = 1;
  }

  // eyes: sclera, iris, pupil and two glints; a skin-coloured upper lid that closes for blinks and half-closes for squints
  const er = F.eyeR * R, scleraM = std(0xffffff, { roughness: 0.25 }), irisM = std(new THREE.Color(look.eyes).getHex(), { roughness: 0.3 });
  const pupilM = std(0x120a06, { roughness: 0.2 }), glintM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lidM = std(new THREE.Color(look.skin).getHex(), { roughness: 0.68 });
  const lidGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); lidGeo.scale(1.12 * er, 1.12 * er * 1.1, 1.12 * er); lidGeo.rotateX(Math.PI / 2);
  const ball = new THREE.SphereGeometry(1, 20, 14);
  // almond eyes: a little wider than tall; the outer corner a touch higher (look.tilt)
  const EX = look.eyeW || 1, EY = look.eyeH || 1.1;
  // lower lid: a cap of a shell round the eyeball (like the upper lid), around an axis that tips from down-and-back
  // (hidden) to down-and-forward; its edge across the eye then curves UP in the middle: a happy crescent
  const lowGeo = new THREE.SphereGeometry(1, 22, 8, 0, Math.PI * 2, 0, Math.PI * 0.3); lowGeo.rotateX(Math.PI);
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group(); facePoint(surf, R, s * F.eyeX, F.eyeY, -0.07, _p); g.position.copy(_p);
    g.rotation.order = 'YXZ'; g.rotation.set(-Math.asin(F.eyeY) * 0.7, Math.asin(s * F.eyeX) * 0.8, -s * (look.tilt || 0)); head.add(g);
    const sc = add(ball, scleraM, g); sc.scale.set(er * EX, er * EY, er * 0.62);
    const pu = new THREE.Group(); pu.position.z = er * 0.5; g.add(pu);
    const IR = look.iris || 0.64, ir = add(ball, irisM, pu); ir.scale.set(er * IR, er * IR * 1.06, er * 0.18);
    const pp = add(ball, pupilM, pu, 0, 0, er * 0.05); pp.scale.set(er * IR * 0.52, er * IR * 0.56, er * 0.15);
    const gl = add(ball, glintM, pu, er * 0.2, er * 0.24, er * 0.14); gl.scale.setScalar(er * 0.15);
    const gl2 = add(ball, glintM, pu, -er * 0.14, -er * 0.18, er * 0.13); gl2.scale.setScalar(er * 0.07);
    const lid = add(lidGeo, lidM, g); lid.rotation.x = -Math.PI * 0.95; lid.scale.x = EX;
    // the lower lid: rises when he grins (see setFace), so the eye turns into a happy
    // crescent (its top edge curves upward across the eye)
    const low = add(lowGeo, lidM, g, 0, 0, -er * 0.05); low.scale.set(er * 1.08 * EX, er * 1.08 * EY, er * 0.72);
    return { g, pu, lid, low, side: s };
  });
  // brows (hair colour, or their own)
  const browM = std(look.brows ? new THREE.Color(look.brows).getHex() : new THREE.Color(look.hair).multiplyScalar(0.85).getHex(), { roughness: 0.8 });
  const browGeo = new THREE.CapsuleGeometry(F.browTh * R, F.browLen * R, 4, 8); browGeo.rotateZ(Math.PI / 2);
  const brows = [-1, 1].map((s) => {
    const g = new THREE.Group(); facePoint(surf, R, s * F.eyeX, F.browY, 0.02, _p); g.position.copy(_p);
    g.rotation.order = 'YXZ'; g.rotation.set(-Math.asin(F.browY) * 0.8, Math.asin(s * F.eyeX) * 0.9, 0); head.add(g);
    add(browGeo, browM, g);
    return { g, base: g.position.clone(), side: s };
  });
  // mouth: dark inside, upper (and a hint of lower) teeth, tongue. All strips share the same morph targets.
  const MS = mouthSpecs(F.mouthW, F.mouthY, look.adult), list = MOUTHS.map((k) => MS[k]);
  const innerM = std(0x5a1a20, { roughness: 0.7 }), teethM = std(0xfbfaf5, { roughness: 0.35 }), tongueM = std(0xe8737f, { roughness: 0.6 });
  const mouth = [
    add(faceStrip(surf, R, list.map(mouthShape), 0.006, 24, 4), innerM, head),
    add(faceStrip(surf, R, list.map(tongueShape), 0.011, 12, 2), tongueM, head),
    add(faceStrip(surf, R, list.map(lowTeethShape), 0.013, 12, 1), teethM, head),
    add(faceStrip(surf, R, list.map(teethShape), 0.016, 50, 1), teethM, head)
  ];
  mouth.forEach((m, i) => { m.renderOrder = 1 + i; });

  // ----- arms: index 0 = his right (local -x), 1 = his left (local +x) -----
  const arms = [-1, 1].map((side) => new ArmRig(chest, side, {
    L1: D.L1, L2: D.L2, shoulder: [side * D.SH_X, D.SH_Y, 0], maxStretch: 1.12, rUp: 0.15 * D.armR, rFore: 0.14 * D.armR, sleeveR: 0.22 * D.armR,
    furMat: skin, sleeveMat: sleeveM, trimMat: cuffM, hand: { mat: skin, scale: D.handS }
  }));
  // cuffs: a knitted band round the end of each sleeve (in place of the plain ring), and the maker's mark on top of
  // each shoulder (on the shoulder ball, so it stays on the shoulder whatever the arm does)
  const cuffPts = [[0.93, -0.46], [0.985, -0.44]];
  for (let k = 0; k <= 7; k++) cuffPts.push([1.0, -0.4 + k * 0.05]);
  cuffPts.push([0.995, 0.0], [0.96, 0.035], [0.88, 0.03]);
  const cuffGeo = new THREE.LatheGeometry(cuffPts.map((q) => new THREE.Vector2(q[0], q[1])), 28); cuffGeo.rotateX(Math.PI / 2);
  arms.forEach((arm) => { if (arm.ring) { arm.ring.geometry.dispose(); arm.ring.geometry = cuffGeo; arm.ring.material = cuffM; } });
  // a fit grown-up's arms: the unit segments the ArmRig scales (radius, length, radius) get muscle profiles: biceps
  // fullest just below the sleeve, tapering to the elbow; forearms full near the elbow, tapering to the wrist; the
  // sleeve snug, narrowing a little toward its cuff (the round shoulder ball is the deltoid)
  const sleeveK = D.sleeveK || 1;
  if (mus) {
    const seg = (rs, ts) => lathe(smoothProfile(rs, ts, 0.5, -0.5, 18), 18, 0);            // listed from the +y end (elbow / wrist)
    const upperG = seg([0.84, 1.0, 1.19, 1.18, 1.07, 1.0], [0, 0.18, 0.4, 0.55, 0.8, 1]);
    const foreG = seg([0.66, 0.7, 0.9, 1.1, 1.15, 1.0], [0, 0.12, 0.4, 0.7, 0.85, 1]);
    const sleeveG = lathe([[1.0, -0.5], [0.985, -0.2], [0.94, 0.2], [sleeveK, 0.5]], 22, 0);
    const cuffK = sleeveK + 0.05, cuffGm = cuffGeo.clone().scale(cuffK, cuffK, 1);
    arms.forEach((arm) => {
      arm.upper.geometry = upperG; arm.fore.geometry = foreG;
      if (arm.sleeve) arm.sleeve.geometry = sleeveG;
      if (arm.ring) arm.ring.geometry = cuffGm;
    });
  }
  shoulderMarks = arms.map((arm) => {
    const side = arm.side, dir = new THREE.Vector3(side * 0.85, 1, 0.04).normalize();
    const up = new THREE.Vector3(-side, 0, 0).projectOnPlane(dir).normalize(), right = new THREE.Vector3().crossVectors(up, dir), A = 0.6;
    const mesh = new THREE.Mesh(gridGeo(8, 8, (fa, fb, o) => o.copy(dir).addScaledVector(right, fa * A).addScaledVector(up, fb * A).normalize().multiplyScalar(1.018)), markM);
    mesh.renderOrder = 2; arm.sBall.add(mesh); return mesh;
  });
  setBadges(K);
  // ----- gear: long sleeves, the captain's armband, goalkeeper gloves, boots -----
  // A band that must keep its own size on a non-uniformly scaled arm segment (scale = r, length, r): it follows its
  // parent and corrects its own matrix just before it is drawn.
  function onSegment(mesh, parent, place) {
    parent.add(mesh);
    mesh.onBeforeRender = function () { const f = parent.scale; place(mesh, f.x, f.y); mesh.updateMatrix(); mesh.matrixWorld.multiplyMatrices(parent.matrixWorld, mesh.matrix); };
    return mesh;
  }
  // wrist bands for long sleeves (the knitted cuff, at the end of the forearm)
  const wristGeo = new THREE.LatheGeometry(cuffPts.map((q) => new THREE.Vector2(q[0], q[1])), 24);
  const wrists = arms.map((arm) => onSegment(new THREE.Mesh(wristGeo, cuffM), arm.fore, (m, r, len) => {
    const wk = mus ? 0.84 : 1.18;                                            // a muscled forearm tapers to a slimmer wrist
    m.scale.set(wk, wk * r / len, wk); m.position.set(0, 0.5 - 0.05 * r / len, 0);
  }));
  // the captain's armband: on his left upper arm (arms[1]), over the sleeve just above the cuff
  const bandArmM = std(0xffffff, { roughness: 0.6 });
  const armband = onSegment(new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.06, 1, 28, 1, true), bandArmM), arms[1].sleeve || arms[1].upper, (m, r, len) => {
    const h = 0.15 * D.armR, ak = mus ? sleeveK + 0.04 : 1; m.scale.set(ak, h / len, ak); m.position.set(0, 0.5 - (0.12 * D.armR + h / 2) / len, 0);
  });
  function armbandTexture(col) {
    const W = 512, H = 64, cv = artCanvas(W, H), g = cv.getContext('2d'), ink = lumOf(col) > 0.6 ? '#1d2b3a' : '#ffffff';
    g.fillStyle = col; g.fillRect(0, 0, W, H); g.fillStyle = ink; g.fillRect(0, 3, W, 4); g.fillRect(0, H - 7, W, 4);
    // a "C" (drawn, not typed) three times round the band, so one always faces out
    g.strokeStyle = ink; g.lineWidth = 9; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc((k + 0.5) * W / 3, H / 2, 15, Math.PI * 0.28, Math.PI * 1.72, false); g.stroke(); }
    return artTexture(cv);
  }
  // goalkeeper gloves: the hand grows a little and turns into a padded glove with a wide wrist strap
  const gloveM = std(0xffffff, { roughness: 0.55 }), strapM = std(0xffffff, { roughness: 0.5 });
  const gloves = arms.map((arm) => {
    const parts = []; arm.hand.traverse((o) => { if (o.isMesh) parts.push(o); });
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * D.armR, 0.2 * D.armR, 0.17 * D.handS / 0.6, 18), strapM);
    strap.position.y = 0.17 * D.handS / 0.6; arm.hand.add(strap);
    return { arm, parts, strap };
  });
  let gearKey = '';
  function applyGear(k) {
    const key = [k.sleeves, k.armband, k.armbandCol, k.gloves, k.boots, k.trim, k.jersey].join('|'); if (key === gearKey) return; gearKey = key;
    const long = k.sleeves === 'long';
    arms.forEach((arm, i) => {
      arm.upper.material = long ? sleeveM : skin; arm.fore.material = long ? sleeveM : skin; arm.elbow.material = long ? sleeveM : skin;
      if (arm.ring) arm.ring.visible = !long; wrists[i].visible = long;
    });
    armband.visible = !!k.armband;
    if (k.armband) { const o = bandArmM.map; bandArmM.map = armbandTexture(k.armbandCol || '#ffd43b'); bandArmM.needsUpdate = true; if (o) o.dispose(); }
    const gl = !!k.gloves, gcol = lumOf(k.trim) > 0.85 ? k.jersey : k.trim;
    gloveM.color.set(gcol); strapM.color.set(lumOf(gcol) > 0.6 ? '#1d2b3a' : '#f8f9fa');
    gloves.forEach((G) => { G.parts.forEach((p) => { p.material = gl ? gloveM : skin; }); G.strap.visible = gl; G.arm.hand.scale.setScalar(gl ? 1.2 : 1); });
    const bc = k.boots || '#1f2430'; bootM.color.set(bc); soleM.color.set(lumOf(bc) > 0.55 ? '#25262b' : '#f1f3f5');
  }
  applyGear(K);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  // ----- expression -----
  // F: { mouth: {big, smile, hmm, o, shout} weights (the rest is the grin), lid 0..1 (1 open), squint 0..1, wide 0..1,
  //      browUp, browTilt (+ worried, - determined), browAsym, gazeX, gazeY (-1..1) }
  function setFace(E) {
    const m = E.mouth || {};
    mouth.forEach((me) => { const inf = me.morphTargetInfluences; for (let k = 1; k < MOUTHS.length; k++) inf[k - 1] = clamp(m[MOUTHS[k]] || 0, 0, 1); });
    // his resting face is a grin, so his eyes are a little "smiley" even at rest (look.happy); a wide-eyed look or an
    // "o" / worried face opens them again
    const wide = clamp(E.wide || 0, 0, 1), mm = E.mouth || {};
    const sq = clamp((E.squint || 0) + (look.happy || 0) * (1 - wide) * (1 - clamp((mm.o || 0) + (mm.hmm || 0) + (mm.shout || 0) * 0.6, 0, 1)), 0, 1);
    eyes.forEach((e) => {
      const open = clamp(E.lid == null ? 0.95 : E.lid, 0, 1) * (1 - 0.14 * sq);
      e.lid.rotation.x = -Math.PI * (0.06 + 0.89 * open) - wide * 0.1;
      e.g.scale.set(1 + 0.05 * wide, 1 - 0.1 * sq + 0.1 * wide, 1);
      // lower lid: tucked away at 0, a crescent covering the lower half of the eye at a full squint
      e.low.rotation.x = -(-0.75 + 1.6 * sq); e.low.visible = sq > 0.12;
      e.pu.position.x = clamp(E.gazeX || 0, -1, 1) * er * 0.3; e.pu.position.y = clamp(E.gazeY || 0, -1, 1) * er * 0.28 + sq * er * 0.12;
    });
    brows.forEach((b) => {
      const up = (E.browUp || 0) + (b.side < 0 ? 1 : -1) * (E.browAsym || 0);
      b.g.position.copy(b.base); b.g.position.y += up * 0.09 * R;
      b.g.rotation.z = -b.side * (E.browTilt || 0) * 0.35;
    });
  }
  setFace({});

  function setKit(k, n, nm, front) {
    K = withSkin(k);
    const swap = (m, t) => { const o = m.map; m.map = t; m.needsUpdate = true; if (o && o !== t) o.dispose(); };
    swap(shirtM, kidJerseyTexture(K, n, nm, front == null ? spec.front : front, D));
    swap(sleeveM, sleeveTexture(K)); swap(bandM, bandTexture(K, 1)); swap(cuffM, bandTexture(K, 14));
    setShortsTex(K, n); swap(sockM, sockTexture(K));
    applyCollar(K.collar); setBadges(K); applyGear(K);
  }
  function setHair(col, styleId) {
    if (styleId && styleId !== look.hairStyle) { look.hairStyle = styleId; look.hair = col || look.hair; buildHair(styleId, look.hair); }
    else if (col) { look.hair = col; hairM.color.set(col); }
    if (!look.brows) browM.color.set(look.hair).multiplyScalar(0.9);
  }
  function setKnees(a0, a1, b0, b1) {
    // a = hip swing (rotation.x of the thigh: - forward), b = knee bend (+ shin back)
    legs[0].rotation.x = a0; legs[1].rotation.x = a1; legs[0].userData.knee.rotation.x = b0; legs[1].userData.knee.rotation.x = b1;
  }
  const dims = Object.assign({}, D);
  return { root, body, chest, neck, head, torso, arms, legs, dims, setKit, setHair, setFace, setKnees, look,
    shirt: { get band() { return band; }, crest: crestMesh, mark: markMesh, shoulderMarks, shorts: shortsMesh, get kit() { return K; } } };
}
