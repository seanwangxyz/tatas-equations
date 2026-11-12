// The kid's own footballer (and, through the same rig, a grown-up: see grownup.js), built from three.js
// primitives (no downloaded assets). Origin = the hips. Like the creatures he is built facing +z; player.js turns
// him round so we see his back (name and number) from the usual camera, but the face is a full cartoon face that
// holds up from the front, the sides and 3/4 views too (the camera may orbit).
//
//   buildHuman(spec)                     -> model (see the end of this file)
//     spec: { dims: KID | TATA dims, kit, num, name, look: { skin, hair, hairStyle, eyes, ... }, front: bool }
//   buildKid(kit, num, name, look)       -> buildHuman with the kid's dims (kept for older callers)
//   kitFromSave(k)                       -> a kit object from the saved shape S.kit = { shirt, pattern, trim, shorts }
//
// Faces: eyes with lids (blink, squint), brows, a conformal mouth with morph targets (open grin, big cheer, warm smile,
// "hmm", small "o", a shout) and conformal decals (cheeks, stubble). model.setFace(F) applies one expression; it is
// called by player.js only while something changes, so at rest nothing moves.
import * as THREE from 'three';
import { std, ArmRig, clamp } from './common.js';

// Kits. The first one matches his red jersey badge in the HUD.
export const KITS = {
  // Home kit: deep red with sea-green trim and tone-on-tone waves (national-team style; no crest or maker's logo).
  red: { jersey: '#c9342c', dark: '#b12a23', trim: '#2f8f7c', shorts: '#1f6b5a', sock: '#c9342c', waves: '#e2584b', ink: '#ffffff', pattern: 'waves' },
  purple: { jersey: '#7048e8', dark: '#5730cf', trim: '#ffd43b', shorts: '#2b2f77', sock: '#7048e8' },
  teal: { jersey: '#0ca678', dark: '#087f5b', trim: '#ffffff', shorts: '#1d2b3a', sock: '#0ca678' },
  // Tata's default: sunny yellow, navy trim and shorts
  yellow: { jersey: '#f5c518', dark: '#d9a90b', light: '#ffdc4d', trim: '#1f3a68', shorts: '#1f3a68', sock: '#f5c518', ink: '#ffffff', pattern: 'plain' }
};
// The saved shape of today's look (S.kit defaults reproduce KITS.red exactly)
export const KIT_DEFAULT = { shirt: '#c9342c', pattern: 'waves', trim: '#2f8f7c', shorts: '#1f6b5a', hair: '#3b2314', hairStyle: 'swept', celebrate: 'jump' };
export const TATA_KIT = { shirt: '#f5c518', pattern: 'plain', trim: '#1f3a68', shorts: '#1f3a68' };

// colour helpers
function mixHex(a, b, t) { const c = new THREE.Color(a).lerp(new THREE.Color(b), t); return '#' + c.getHexString(); }
// exact tones for the shirts whose shades were picked by hand (the rest are derived)
const TONES = { '#c9342c': { dark: '#b12a23', light: '#e2584b' }, '#f5c518': { dark: '#d9a90b', light: '#ffdc4d' } };
export function kitFromSave(k) {
  k = k || {};
  const shirt = String(k.shirt || KIT_DEFAULT.shirt).toLowerCase(), pat = k.pattern || 'waves', t = TONES[shirt] || {};
  const dark = t.dark || mixHex(shirt, '#000000', 0.18), light = t.light || mixHex(shirt, '#ffffff', 0.24);
  // a very light shirt needs dark ink for the name and number
  const lum = new THREE.Color(shirt); const L = 0.3 * lum.r + 0.59 * lum.g + 0.11 * lum.b;
  return { jersey: shirt, dark: dark, light: light, waves: pat === 'waves' ? light : undefined, trim: k.trim || KIT_DEFAULT.trim, shorts: k.shorts || KIT_DEFAULT.shorts,
    sock: k.socks || shirt, ink: L > 0.8 ? '#1d2b3a' : '#ffffff', pattern: pat };
}

// Proportions (local units, origin at the hips). player.js reads these for placement and gestures.
export const KID = {
  SH_Y: 1.55, SH_X: 0.8,     // shoulders
  NECK_Y: 1.98, HEAD_UP: 0.62, HEAD_R: 0.74,
  TOP: 3.42, HIP_LOW: -0.66, // top of the hair, bottom of the shorts (local units)
  FOOT: -2.28,               // soles of the boots
  // body build (the grown-up uses other values)
  torsoX: 1, torsoY: 1, neckLen: 0.5, hipY: -0.6, thigh: 0.55, shin: 1.0, legR: 1, shortsY: -0.3, shortsH: 0.72, shortsR: 0.82,
  L1: 0.92, L2: 0.98, armR: 1, handS: 0.6,
  head: { sx: 1, sy: 1.02, sz: 0.98, jaw: 0.1, chin: 0 },
  face: { eyeX: 0.34, eyeY: 0.02, eyeR: 0.2, browY: 0.33, browLen: 0.2, browTh: 0.045, mouthY: -0.42, mouthW: 1, noseY: -0.15, cheekX: 0.5, cheekY: -0.27, cheekR: 0.12 }
};

// Back of the shirt: lathe u = 0 is the chest (+z), u = 0.5 the back (-z). Name over the number, like a real kit.
// front: a small number on the chest too (for someone seen from the front, across the table).
export function kidJerseyTexture(kit, num, name, front) {
  const W = 512, H = 160, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = kit.jersey; g.fillRect(0, 0, W, H);
  const pat = kit.pattern || (kit.waves ? 'waves' : null);
  if (pat === 'waves') {
    // tone-on-tone wavy lines all round the shirt (whole number of waves so the seam matches)
    g.strokeStyle = kit.waves || kit.light; g.globalAlpha = 0.6; g.lineWidth = 1.6;
    for (let y = 16; y < H; y += 11) { g.beginPath(); for (let x = 0; x <= W; x += 4) { const yy = y + Math.sin(x / W * Math.PI * 2 * 9 + y * 0.35) * 2.6; if (x) g.lineTo(x, yy); else g.moveTo(x, yy); } g.stroke(); }
    g.globalAlpha = 1;
  } else if (pat === 'stripes') {
    g.fillStyle = kit.dark; for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 16, H);
  } else if (pat === 'hoops') {
    g.fillStyle = kit.dark; for (let y = 22; y < H; y += 30) g.fillRect(0, y, W, 14);
  } else if (pat === 'sash') {
    // one diagonal band over the chest (it wraps across the u = 0 seam) and its continuation on the back
    g.fillStyle = kit.dark;
    const band = (x0) => { g.beginPath(); g.moveTo(x0 - 30, 0); g.lineTo(x0 + 6, 0); g.lineTo(x0 + 96, H); g.lineTo(x0 + 60, H); g.closePath(); g.fill(); };
    band(-50); band(W - 50); band(W * 0.5 - 70);
  }
  if (pat) {
    // collar band in the trim colour with a thin shirt-colour line through it; no hem band
    g.fillStyle = kit.trim; g.fillRect(0, 0, W, 11); g.fillStyle = kit.jersey; g.fillRect(0, 5, W, 1.5);
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, 11, W, 3);
  } else {
    // two soft side panels in the darker shade (under the arms)
    g.fillStyle = kit.dark; g.fillRect(W * 0.2, 0, W * 0.07, H); g.fillRect(W * 0.73, 0, W * 0.07, H);
    // collar and hem trim
    g.fillStyle = kit.trim; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 9, W, 9);
    g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, 10, W, 4);
    // little plain badge on the chest (wearer's left), seen only when he turns
    g.fillStyle = '#fff'; g.beginPath(); g.arc(W * 0.06, 52, 11, 0, 7); g.fill();
    g.fillStyle = kit.dark; g.beginPath(); g.arc(W * 0.06, 52, 5, 0, 7); g.fill();
  }
  const cx = W * 0.5;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const FONT = '"Arial Black", Impact, "Trebuchet MS", sans-serif';
  const darkInk = kit.ink && kit.ink !== '#ffffff';
  const nm = String(name || '').toUpperCase().slice(0, 12);
  if (nm) {
    let fs = 24; g.font = '900 ' + fs + 'px ' + FONT;
    const maxW = W * 0.3; while (fs > 12 && g.measureText(nm).width > maxW) { fs -= 1; g.font = '900 ' + fs + 'px ' + FONT; }
    g.lineWidth = kit.ink ? 3 : 5; g.strokeStyle = darkInk ? 'rgba(255,255,255,.35)' : kit.ink ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.35)'; g.strokeText(nm, cx, 34);
    g.fillStyle = kit.ink || (kit.trim === '#ffffff' ? '#ffffff' : kit.trim); g.fillText(nm, cx, 34);
  }
  const n = String(num || '7').slice(0, 2);
  const numAt = (x, y, size) => {
    g.font = '900 ' + size + 'px ' + FONT;
    if (!kit.ink) { g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,.4)'; g.strokeText(n, x, y); }
    g.lineWidth = kit.ink ? 5 : 6; g.strokeStyle = darkInk ? '#ffffff' : kit.trim === '#ffffff' ? kit.dark : kit.trim; g.strokeText(n, x, y);
    g.fillStyle = darkInk ? kit.ink : '#fff'; g.fillText(n, x, y);
  };
  numAt(cx, 98, n.length > 1 ? 84 : 92);
  if (front) {
    // smaller chest number, centred on u = 0 (drawn at both canvas edges so the seam joins it)
    g.save(); g.scale(0.62, 0.62); const fy = 92 / 0.62; numAt(0, fy, 66); numAt(W / 0.62, fy, 66); g.restore();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2; return tex;
}

// ---------------- head surface ----------------
// The head is a deformed sphere. surf(d) gives the surface point for a unit direction d, so the hair, the mouth and the
// cheek decals can all be laid exactly on it (radially), whatever the head shape.
function makeSurf(R, H) {
  return function (dx, dy, dz, out) {
    // a softer, narrower jaw below the cheeks, and a chin that comes forward a little (grown-up)
    const low = clamp(-dy - 0.25, 0, 1), jaw = 1 - H.jaw * low * low * 1.6;
    const chin = H.chin * clamp(-dy - 0.45, 0, 1) * clamp(dz, 0, 1);
    out.set(dx * R * H.sx * jaw, dy * R * H.sy - chin * R * 0.35, dz * R * H.sz * (1 - 0.4 * H.jaw * low * low) + chin * R * 0.25);
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
export const HAIR_STYLES = {
  // his own: straight and fairly thick, a fringe swept across the forehead toward his left, over the tops of the ears
  swept: {
    front: (x) => 0.46 - 0.13 * x - 0.035 * Math.abs(Math.sin(x * 9.5 + 0.6)), side: 0.04, back: -0.5,
    thick: (d, line) => 0.1 + 0.05 * clamp(d.y, 0, 1) + 0.035 * clamp(1 - (d.y - line) * 5, 0, 1) * clamp(d.z, 0, 1),
    grain: (d) => 0.012 * Math.sin((d.x * 0.8 + d.y * 0.6) * 22 + d.z * 4), lift: 0.03
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
  // Tata's: longer on top and tousled, falling to both sides from a soft middle parting
  tousled: {
    front: (x) => 0.5 - 0.22 * clamp(Math.abs(x) * 1.6, 0, 1) + 0.06 * clamp(1 - Math.abs(x) * 6, 0, 1) - 0.04 * Math.abs(Math.sin(x * 8 + 0.4)), side: 0.02, back: -0.48,
    thick: (d, line) => 0.12 + 0.12 * clamp(d.y, 0, 1) + 0.03 * clamp(1 - (d.y - line) * 5, 0, 1),
    grain: (d) => 0.03 * Math.sin(d.x * 9 + d.z * 5) * Math.sin(d.y * 11 + d.x * 3) + 0.015 * Math.sin(Math.atan2(d.x, d.z) * 14), lift: 0.04
  }
};
function hairLine(st, d, out) {
  // blend front (fringe), sides and back by the direction around the head
  const fw = st.frontW || 0.85;
  const c = d.z / Math.max(1e-6, Math.sqrt(d.x * d.x + d.z * d.z));
  const wf = Math.pow(clamp((c - (1 - fw)) / fw, 0, 1), 1.3), wb = clamp(-c, 0, 1);
  if (out) out.wf = wf;
  return wf * st.front(d.x) + wb * st.back + (1 - wf - wb) * st.side;
}
// The hair is a cap laid over the scalp from the crown down to the hairline, column by column around the head, so its
// edge follows the hairline exactly (clean fringe strands, no stair steps). A short rim turns the edge back into the
// scalp so it never looks hollow. Sides and back thin out toward the edge; the fringe stays thick (a blunt cut).
function hairGeometry(R, surf, st) {
  const NT = 144, NP = 40, rows = NP + 3, pos = new Float32Array(NT * rows * 3), d = new THREE.Vector3(), o = new THREE.Vector3(), info = { wf: 0 };
  const put = (j, i, x, y, z) => { const k = (j * NT + i) * 3; pos[k] = x; pos[k + 1] = y; pos[k + 2] = z; };
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
      put(j, i, o.x, o.y, o.z); if (j === NP) edgeTh = thk;
    }
    // rim: from the edge back under, into the scalp
    d.set(Math.sin(ph) * st0, Math.cos(ph), Math.sin(ph) * ct0); surf(d.x, d.y, d.z, o);
    const lz = st.lift && d.z > 0.2 ? st.lift * R * 0.5 : 0;
    put(NP + 1, i, o.x * (1 + edgeTh * 0.45), o.y * (1 + edgeTh * 0.45), o.z * (1 + edgeTh * 0.45) + lz);
    put(NP + 2, i, o.x * 0.97, o.y * 0.97, o.z * 0.97);
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < NT; i++) {
    const a = j * NT + i, b = j * NT + (i + 1) % NT, c = (j + 1) * NT + i, e = (j + 1) * NT + (i + 1) % NT;
    idx.push(a, c, b, b, c, e);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
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
    grin: { w: 0.7, cy: 0.07, tc: -0.025, bc: -0.31, pt: 1, pb: 0.6, sk: 0, xo: 0, teeth: 0.095, low: 0.035, tongue: [0.5, 0.08] },
    big: { w: 0.72, cy: 0.08, tc: -0.01, bc: -0.4, pt: 1, pb: 0.55, sk: 0, xo: 0, teeth: 0.08, low: 0.03, tongue: [0.55, 0.1] },
    smile: { w: 0.5, cy: 0.05, tc: -0.03, bc: -0.07, pt: 1, pb: 0.9, sk: 0, xo: 0, teeth: 0, low: 0, tongue: [0, 0] },
    hmm: { w: 0.26, cy: -0.01, tc: -0.005, bc: -0.035, pt: 1, pb: 1, sk: 0.05, xo: 0.07, teeth: 0, low: 0, tongue: [0, 0] },
    o: { w: 0.2, cy: -0.06, tc: 0.025, bc: -0.15, pt: 0.5, pb: 0.5, sk: 0, xo: 0, teeth: 0, low: 0, tongue: [0.6, 0.04] },
    shout: { w: 0.36, cy: -0.1, tc: 0.03, bc: -0.33, pt: 0.5, pb: 0.5, sk: 0, xo: 0, teeth: 0.06, low: 0.02, tongue: [0.6, 0.09] }
  };
  if (adult) {
    // a grown-up's resting face is a warm smile with a little of the teeth showing, not a kid's huge grin
    m.grin = { w: 0.6, cy: 0.06, tc: -0.03, bc: -0.13, pt: 1, pb: 0.75, sk: 0, xo: 0, teeth: 0.05, low: 0, tongue: [0, 0] };
    m.smile = { w: 0.52, cy: 0.05, tc: -0.03, bc: -0.065, pt: 1, pb: 0.9, sk: 0, xo: 0, teeth: 0, low: 0, tongue: [0, 0] };
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
  const e = edges(s, u), gap = e[0] - e[1], h = Math.min(s.teeth * Math.pow(1 - u * u, 0.25), gap * 0.5), t0 = Math.min(0.008, h * 0.5);
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
  const D = spec.dims || KID, kit = spec.kit || KITS.red, look = Object.assign({ skin: '#e4b089', hair: KIT_DEFAULT.hair, hairStyle: 'swept', eyes: '#6b3d1e', brows: null, cheeks: '#ef8f86', stubble: false, adult: false, streaks: null }, spec.look || {});
  const root = new THREE.Group(), body = new THREE.Group(), chest = new THREE.Group();
  root.add(body); body.add(chest);
  const skin = std(new THREE.Color(look.skin).getHex(), { roughness: 0.68 }), hairM = std(new THREE.Color(look.hair).getHex(), { roughness: 0.8 }), dark = std(0x231a16, { roughness: 0.35 });
  const jerseyTex = kidJerseyTexture(kit, spec.num, spec.name, spec.front);
  const shirtM = std(0xffffff, { map: jerseyTex, roughness: 0.85 }), sleeveM = std(new THREE.Color(kit.jersey).getHex(), { roughness: 0.85 });
  const trimM = std(new THREE.Color(kit.trim).getHex(), { roughness: 0.7 }), shortsM = std(new THREE.Color(kit.shorts).getHex(), { roughness: 0.8 });
  const add = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m; };

  // ----- torso (lathe, u = 0 at the chest so the back number sits mid-texture) -----
  const pts = new THREE.SplineCurve([[0.001, 0], [0.62, 0.04], [0.82, 0.3], [0.86, 0.75], [0.84, 1.2], [0.8, 1.52], [0.6, 1.78], [0.4, 1.86], [0.001, 1.88]]
    .map((q) => new THREE.Vector2(q[0] * D.torsoX, q[1] * D.torsoY))).getPoints(22);
  pts[0].x = 0.001;
  const torso = add(new THREE.LatheGeometry(pts, 32, 0, Math.PI * 2), shirtM, chest);
  const collar = add(new THREE.TorusGeometry(0.4 * D.torsoX, 0.075, 6, 24), trimM, chest, 0, 1.8 * D.torsoY, 0); collar.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(D.shortsR - 0.02, D.shortsR + 0.02, D.shortsH, 24, 1, true), shortsM, body, 0, D.shortsY, 0);
  // legs with a knee each (hip -> thigh -> knee -> shin, sock and boot). Children of root, so a lean bends only the
  // upper body. The knee lets him crouch, jump and kneel in the celebrations.
  const sockM = std(new THREE.Color(kit.sock).getHex(), { roughness: 0.85 }), bootM = std(0x1f2430, { roughness: 0.45 });
  const lr = D.legR, thighG = new THREE.CylinderGeometry(0.19 * lr, 0.17 * lr, D.thigh + 0.07, 10), sockG = new THREE.CylinderGeometry(0.18 * lr, 0.15 * lr, D.shin * 0.95, 10), bootG = new THREE.SphereGeometry(1, 12, 8);
  const kneeG = new THREE.SphereGeometry(0.175 * lr, 10, 8);
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group(); leg.position.set(s * 0.38 * D.torsoX, D.hipY, 0); root.add(leg);
    add(thighG, skin, leg, 0, -D.thigh / 2 + 0.02, 0);
    const knee = new THREE.Group(); knee.position.set(0, -D.thigh, 0); leg.add(knee);
    add(kneeG, skin, knee, 0, 0, 0);
    add(sockG, sockM, knee, 0, -D.shin * 0.45, 0);
    const b = add(bootG, bootM, knee, 0, -D.shin, 0.1); b.scale.set(0.2 * lr, 0.13, 0.32 * lr);
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
    if (col) hairM.color.set(col);
    hairMesh = add(hairGeometry(R, surf, st), hairM, head);
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
      [[-0.24, 0.72, 0.62, -1], [0.3, 0.7, 0.62, 1], [-0.52, 0.5, 0.6, -1], [0.1, 0.82, 0.52, 1], [0.5, 0.52, 0.62, 1]].forEach((q) => {
        _d.set(q[0], q[1], q[2]).normalize(); surf(_d.x, _d.y, _d.z, _p);
        const th = HAIR_STYLES.tousled.thick(_d, 0.3) * 0.92; _p.multiplyScalar(1 + th);
        const m = add(lg, sm, hairExtras, _p.x, _p.y, _p.z); m.scale.set(0.035 * R, 0.24 * R, 0.022 * R);
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
  nose.scale.set(0.085 * R, 0.075 * R, 0.07 * R * (look.adult ? 1.5 : 1));
  // rosy cheeks
  const cheekM = std(new THREE.Color(look.cheeks).getHex(), { roughness: 0.75 });
  const cheeks = [-1, 1].map((s) => add(faceDisc(surf, R, s * F.cheekX, F.cheekY, F.cheekR, F.cheekR * 0.78, 0.004), cheekM, head));
  if (look.adult) cheekM.color.lerp(new THREE.Color(look.skin), 0.55);
  // stubble (grown-up): a dotted shadow over the jaw and upper lip
  if (look.stubble) {
    const sh = (u, v) => { const x = u * 0.6, top = -0.2 - 0.06 * Math.abs(u), yb = -1.0 + 0.25 * u * u; return [x, top + (yb - top) * v]; };
    const sm = new THREE.MeshStandardMaterial({ map: stubbleTexture(), transparent: true, depthWrite: false, roughness: 0.9, color: 0xffffff });
    add(faceStrip(surf, R, [sh], 0.003, 24, 10), sm, head);
  }

  // eyes: sclera, iris, pupil and two glints; a skin-coloured upper lid that closes for blinks and half-closes for squints
  const er = F.eyeR * R, scleraM = std(0xffffff, { roughness: 0.25 }), irisM = std(new THREE.Color(look.eyes).getHex(), { roughness: 0.3 });
  const pupilM = std(0x120a06, { roughness: 0.2 }), glintM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lidM = std(new THREE.Color(look.skin).getHex(), { roughness: 0.68 });
  const lidGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); lidGeo.scale(1.12 * er, 1.12 * er * 1.1, 1.12 * er); lidGeo.rotateX(Math.PI / 2);
  const ball = new THREE.SphereGeometry(1, 20, 14);
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group(); facePoint(surf, R, s * F.eyeX, F.eyeY, -0.07, _p); g.position.copy(_p);
    g.rotation.order = 'YXZ'; g.rotation.set(-Math.asin(F.eyeY) * 0.7, Math.asin(s * F.eyeX) * 0.8, 0); head.add(g);
    const sc = add(ball, scleraM, g); sc.scale.set(er, er * 1.1, er * 0.62);
    const pu = new THREE.Group(); pu.position.z = er * 0.5; g.add(pu);
    const ir = add(ball, irisM, pu); ir.scale.set(er * 0.6, er * 0.64, er * 0.18);
    const pp = add(ball, pupilM, pu, 0, 0, er * 0.05); pp.scale.set(er * 0.32, er * 0.34, er * 0.15);
    const gl = add(ball, glintM, pu, er * 0.2, er * 0.24, er * 0.14); gl.scale.setScalar(er * 0.15);
    const gl2 = add(ball, glintM, pu, -er * 0.14, -er * 0.18, er * 0.13); gl2.scale.setScalar(er * 0.07);
    const lid = add(lidGeo, lidM, g); lid.rotation.x = -Math.PI * 0.95;
    return { g, pu, lid, side: s };
  });
  // brows (hair colour, or their own)
  const browM = std(new THREE.Color(look.brows || look.hair).getHex(), { roughness: 0.8 });
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
    add(faceStrip(surf, R, list.map(teethShape), 0.016, 20, 1), teethM, head)
  ];
  mouth.forEach((m, i) => { m.renderOrder = 1 + i; });

  // ----- arms: index 0 = his right (local -x), 1 = his left (local +x) -----
  const arms = [-1, 1].map((side) => new ArmRig(chest, side, {
    L1: D.L1, L2: D.L2, shoulder: [side * D.SH_X, D.SH_Y, 0], maxStretch: 1.12, rUp: 0.15 * D.armR, rFore: 0.14 * D.armR, sleeveR: 0.22 * D.armR,
    furMat: skin, sleeveMat: sleeveM, trimMat: trimM, hand: { mat: skin, scale: D.handS }
  }));
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  // ----- expression -----
  // F: { mouth: {big, smile, hmm, o, shout} weights (the rest is the grin), lid 0..1 (1 open), squint 0..1, wide 0..1,
  //      browUp, browTilt (+ worried, - determined), browAsym, gazeX, gazeY (-1..1) }
  function setFace(E) {
    const m = E.mouth || {};
    mouth.forEach((me) => { const inf = me.morphTargetInfluences; for (let k = 1; k < MOUTHS.length; k++) inf[k - 1] = clamp(m[MOUTHS[k]] || 0, 0, 1); });
    const sq = clamp(E.squint || 0, 0, 1), wide = clamp(E.wide || 0, 0, 1);
    eyes.forEach((e) => {
      const open = clamp(E.lid == null ? 0.95 : E.lid, 0, 1) * (1 - 0.35 * sq);
      e.lid.rotation.x = -Math.PI * (0.06 + 0.89 * open) - wide * 0.1;
      e.g.scale.set(1 + 0.05 * wide, 1 - 0.18 * sq + 0.1 * wide, 1);
      e.pu.position.x = clamp(E.gazeX || 0, -1, 1) * er * 0.3; e.pu.position.y = clamp(E.gazeY || 0, -1, 1) * er * 0.28;
    });
    brows.forEach((b) => {
      const up = (E.browUp || 0) + (b.side < 0 ? 1 : -1) * (E.browAsym || 0);
      b.g.position.copy(b.base); b.g.position.y += up * 0.09 * R;
      b.g.rotation.z = -b.side * (E.browTilt || 0) * 0.35;
    });
  }
  setFace({});

  function setKit(k, n, nm, front) {
    const old = shirtM.map; shirtM.map = kidJerseyTexture(k, n, nm, front == null ? spec.front : front); shirtM.needsUpdate = true; if (old) old.dispose();
    sleeveM.color.set(k.jersey); trimM.color.set(k.trim); shortsM.color.set(k.shorts); sockM.color.set(k.sock);
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
  return { root, body, chest, neck, head, torso, arms, legs, dims, setKit, setHair, setFace, setKnees, look };
}
